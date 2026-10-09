"""
ЗОМБИ НЕ СПЯТ — локальный игровой сервер.

Запуск:  python server.py   (или двойной клик по «Запустить игру.bat»)
Откроется браузер на http://localhost:8000

API:
  GET    /api/maps            — все карты из папки maps/
  POST   /api/maps            — сохранить новую карту
  DELETE /api/maps?name=...   — удалить карту
  GET    /api/rig             — настройки рига рук
  POST   /api/rig             — сохранить настройки рига рук
  GET    /api/version         — дата версии игры (видна в меню)
  POST   /api/perflog         — строка дневника производительности → zns-perf.log
"""

import glob
import http.server
import json
import mimetypes
import os
import shutil
import time
import socketserver
import sys
import threading
import webbrowser
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

PORT = int(os.environ.get("ZNS_PORT", "8000"))
MAPS_DIR = "maps"
RIG_FILE = "hand_rig.json"
PERF_LOG = "zns-perf.log"  # the game's performance diary (send it to the developer)
MAX_BODY = 5 * 1024 * 1024  # 5 MB is plenty for a map

# Windows often maps .js to text/plain in the registry, which breaks ES modules.
# Force correct types for everything the game serves.
FORCED_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".task": "application/octet-stream",
    ".tflite": "application/octet-stream",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".jpg": "image/jpeg",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
}
for ext, ctype in FORCED_TYPES.items():
    mimetypes.add_type(ctype.split(";")[0], ext)


def game_version():
    """Date of the newest game file (archives keep the commit time) and the commit id."""
    newest = 0.0
    for base, _dirs, files in os.walk("src"):
        for f in files:
            try:
                newest = max(newest, os.path.getmtime(os.path.join(base, f)))
            except OSError:
                pass
    for f in ("index.html", "server.py"):
        try:
            newest = max(newest, os.path.getmtime(f))
        except OSError:
            pass
    sha = ""
    try:
        with open(".zns-version", encoding="ascii") as fh:
            sha = fh.read().strip()
    except OSError:
        try:
            with open(os.path.join(".git", "HEAD"), encoding="ascii") as fh:
                head = fh.read().strip()
            if head.startswith("ref: "):
                with open(os.path.join(".git", head[5:]), encoding="ascii") as fh:
                    sha = fh.read().strip()
            else:
                sha = head
        except OSError:
            pass
    date = time.strftime("%d.%m.%Y %H:%M", time.localtime(newest)) if newest else ""
    return {"date": date, "sha": sha[:7]}


def update_desktop_launcher():
    """The desktop icon runs a copy of the launcher made at install time:
    keep that copy as new as the game, so launcher fixes reach everyone.

    That copy is running right now (it started this server) and cmd.exe reads a
    .bat line by line by byte offset: when the server stops it continues at the
    offset just after its "%PY% server.py" line. The new file therefore gets an
    "exit /b" exactly at that offset (and jumps over it at its own start)."""
    if os.name != "nt":
        return
    target = os.path.join(os.environ.get("LOCALAPPDATA", ""), "ZombieNeSpyat", "start.bat")
    if not os.path.isfile(target):
        return
    for src in glob.glob(os.path.join(ROOT, "*.bat")):
        try:
            with open(src, "rb") as fh:
                new = fh.read()
            if b"set ZIP=" not in new:
                continue
            with open(target, "rb") as fh:
                old = fh.read()
            if old.endswith(new):
                return  # already the newest
            mark = b"\r\n%PY% server.py\r\n"
            i = old.find(mark)
            if i < 0:
                return
            resume_at = i + len(mark)  # where cmd.exe continues after the server
            head = b"@echo off\r\ngoto zns_begin\r\nrem "
            pad = resume_at - len(head) - 2  # "\r\n" closes the rem line
            if pad < 0 or pad > 7000:
                return
            data = head + b"-" * pad + b"\r\nexit /b\r\n:zns_begin\r\n" + new
            with open(target, "wb") as fh:
                fh.write(data)
            print("  Запускатор на рабочем столе обновлён.")
        except OSError:
            pass
        return


def safe_map_name(name):
    if not isinstance(name, str):
        return ""
    return "".join(c for c in name if c.isalpha() or c.isdigit() or c in (" ", "-", "_")).strip()[:64]


class GameRequestHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **FORCED_TYPES}

    def log_message(self, fmt, *args):
        # Quiet static-file spam; keep API and errors visible.
        if "/api/perflog" in (self.path or ""):
            return
        if "/api/" in (self.path or "") or (args and str(args[1])[:1] in "45"):
            super().log_message(fmt, *args)

    def end_headers(self):
        # Game code changes between versions — never serve stale scripts.
        path = urlparse(self.path).path
        if path.endswith((".js", ".mjs", ".html", ".css", ".json")) or path == "/":
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    # ---------- helpers ----------
    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            raise ValueError("Bad request body size")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    # ---------- GET ----------
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/version":
            return self._json(200, game_version())
        if path == "/api/maps":
            maps = {}
            if os.path.isdir(MAPS_DIR):
                for filename in sorted(os.listdir(MAPS_DIR)):
                    if filename.endswith(".json"):
                        try:
                            with open(os.path.join(MAPS_DIR, filename), "r", encoding="utf-8") as f:
                                maps[filename[:-5]] = json.load(f)
                        except Exception as e:  # noqa: BLE001 - a broken map must not break the list
                            print(f"Error loading map {filename}: {e}")
            return self._json(200, maps)

        if path == "/api/rig":
            if os.path.exists(RIG_FILE):
                try:
                    with open(RIG_FILE, "r", encoding="utf-8") as f:
                        return self._json(200, json.load(f))
                except Exception as e:  # noqa: BLE001
                    return self._json(500, {"status": "error", "message": str(e)})
            return self._json(200, {})

        return super().do_GET()

    # ---------- POST ----------
    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/rig":
                data = self._read_json()
                with open(RIG_FILE, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                return self._json(200, {"status": "success", "message": "Rig saved"})

            if path == "/api/perflog":
                line = str(self._read_json().get("line", ""))[:4000].replace("\r", " ").replace("\n", " ")
                if line.startswith("==="):
                    # a new game: start the file afresh when it has grown big
                    if os.path.exists(PERF_LOG) and os.path.getsize(PERF_LOG) > 3 * 1024 * 1024:
                        os.replace(PERF_LOG, PERF_LOG + ".old")
                    print("  [FPS-дневник] пишется в " + os.path.join(ROOT, PERF_LOG))
                with open(PERF_LOG, "a", encoding="utf-8") as f:
                    f.write(time.strftime("%H:%M:%S ") + line + "\n")
                if not line.startswith("==="):
                    # the short version: FPS, frame times and the camera network first
                    parts = line.split(" | ")
                    short = " | ".join([p for p in parts if p.startswith(("FPS", "кадр", "ИИ", "рывки"))])
                    print("  [FPS] " + (short or line)[:200])
                return self._json(200, {"status": "ok"})

            if path == "/api/maps":
                map_data = self._read_json()
                safe_name = safe_map_name(map_data.get("name"))
                if not safe_name:
                    raise ValueError("Invalid map name")
                os.makedirs(MAPS_DIR, exist_ok=True)
                file_path = os.path.join(MAPS_DIR, f"{safe_name}.json")
                if os.path.exists(file_path):
                    return self._json(409, {"status": "error", "message": "Map with this name already exists"})
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(map_data, f, ensure_ascii=False, indent=2)
                return self._json(200, {"status": "success", "message": f"Map '{safe_name}' saved"})
        except Exception as e:  # noqa: BLE001
            print(f"POST {path} failed: {e}")
            return self._json(500, {"status": "error", "message": str(e)})
        return self._json(404, {"status": "error", "message": "Not found"})

    # ---------- DELETE ----------
    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/maps":
            return self._json(404, {"status": "error", "message": "Not found"})
        try:
            name = parse_qs(parsed.query).get("name", [None])[0]
            if not name and int(self.headers.get("Content-Length") or 0) > 0:
                name = self._read_json().get("name")
            safe_name = safe_map_name(name)
            if not safe_name:
                raise ValueError("No map name provided")
            file_path = os.path.join(MAPS_DIR, f"{safe_name}.json")
            if not os.path.exists(file_path):
                return self._json(404, {"status": "error", "message": "Map not found"})
            os.remove(file_path)
            return self._json(200, {"status": "success", "message": f"Map '{safe_name}' deleted"})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"status": "error", "message": str(e)})


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    # On Windows SO_REUSEADDR lets a second server share a port that is still
    # busy — the browser would then keep talking to an OLD game window.
    allow_reuse_address = os.name != "nt"


def open_server():
    """Start on PORT; if an old game window still holds it, take the next free port."""
    last_error = None
    for port in range(PORT, PORT + 20):
        try:
            return ThreadingServer(("", port), GameRequestHandler), port
        except OSError as e:
            last_error = e
            print(f"  Порт {port} занят (возможно, открыто старое окно игры), пробую следующий...")
    raise last_error


# ---------------------------------------------------------------- the GPU
# On computers with two graphics chips (most laptops, some desktops) Windows
# gives the browser the weak built-in one by default — and a 3D game runs at
# 10–15 FPS on a strong computer. So on Windows the game:
#   1) finds Chrome (or Edge),
#   2) marks it «High performance» for Windows — the same registry value that
#      Settings → System → Display → Graphics writes (no admin rights needed),
#   3) opens the game in its own Chrome window. (If Chrome was already open,
#      the strong card is taken after Chrome is closed and opened again —
#      the game's menu says so when it still draws on the built-in chip.)
# ZNS_NORMAL_BROWSER=1 opens the usual default browser instead.

def _browser_candidates():
    env = os.environ
    roots = [env.get("PROGRAMFILES", r"C:\Program Files"), env.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"), env.get("LOCALAPPDATA", "")]
    out = []
    for root in roots:
        if not root:
            continue
        out.append(os.path.join(root, "Google", "Chrome", "Application", "chrome.exe"))
    for root in roots:
        if not root:
            continue
        out.append(os.path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"))
    # App Paths in the registry (Chrome installed elsewhere)
    try:
        import winreg
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            for exe in ("chrome.exe", "msedge.exe"):
                try:
                    with winreg.OpenKey(hive, "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\" + exe) as k:
                        out.append(winreg.QueryValue(k, None))
                except OSError:
                    pass
    except ImportError:
        pass
    seen, found = set(), []
    for p in out:
        if p and p.lower() not in seen and os.path.isfile(p):
            seen.add(p.lower())
            found.append(p)
    return found


def _prefer_strong_gpu(exe):
    """Windows: «High performance» graphics for this program (per user)."""
    try:
        import winreg
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\DirectX\UserGpuPreferences") as k:
            try:
                old = winreg.QueryValueEx(k, exe)[0]
            except OSError:
                old = ""
            if "GpuPreference=2;" not in old:
                winreg.SetValueEx(k, exe, 0, winreg.REG_SZ, "GpuPreference=2;")
                print(f"  Видеокарта: для {os.path.basename(exe)} включена «Высокая производительность»")
        return True
    except Exception as e:  # noqa: BLE001 — never stop the game for this
        print(f"  (не удалось выбрать мощную видеокарту автоматически: {e})")
        return False


def open_game_window(url):
    """Open the game: on Windows in a Chrome window on the strong graphics card."""
    if sys.platform == "win32" and not os.environ.get("ZNS_NORMAL_BROWSER"):
        import subprocess
        for exe in _browser_candidates():
            _prefer_strong_gpu(exe)
            # (the usual browser profile: saved worlds, the hero and the settings live there)
            try:
                subprocess.Popen([
                    exe, f"--app={url}",
                    "--force_high_performance_gpu", "--ignore-gpu-blocklist",
                    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
                    "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--no-default-browser-check",
                ])
                print(f"  Игра открыта в отдельном окне ({os.path.basename(exe)}, мощная видеокарта)")
                return
            except OSError as e:
                print(f"  (не удалось открыть {exe}: {e})")
    webbrowser.open(url)


def main():
    no_browser = "--no-browser" in sys.argv or os.environ.get("ZNS_NO_BROWSER")
    update_desktop_launcher()
    httpd, port = open_server()
    url = f"http://localhost:{port}"
    print("=" * 50)
    print("  ЗОМБИ НЕ СПЯТ — сервер запущен")
    print(f"  Откройте в браузере: {url}")
    print("  Чтобы остановить — закройте это окно (или Ctrl+C)")
    print("=" * 50)
    if not no_browser:
        threading.Timer(1.2, lambda: open_game_window(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
