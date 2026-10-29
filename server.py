"""
Волшебство только начинается — локальный игровой сервер.

Запуск:  python server.py   (или двойной клик по «Запустить игру.bat»)
Откроется браузер на http://localhost:8000

API:
  GET    /api/maps            — все карты из папки maps/
  POST   /api/maps            — сохранить новую карту
  DELETE /api/maps?name=...   — удалить карту
  GET    /api/rig             — настройки рига рук
  POST   /api/rig             — сохранить настройки рига рук
  GET    /api/version         — дата версии игры (видна в меню)
  GET    /api/ping            — «игра здесь» (метка zns-game; окно игры проверяет, жив ли сервер)
  GET    /api/update          — есть ли на GitHub версия новее (только при запуске через запускатор)
  GET    /api/logs            — журналы игры (настройки → «Журнал»)
  GET    /api/alive           — окно игры открыто, пока держит эту строку (запускатор)
  POST   /api/perflog         — строка дневника производительности → zns-perf.log
  POST   /api/spelllog        — строка журнала заклинаний → zns-spells.log
  POST   /api/gamelog         — строка из игры в журнал (какая нейросеть жителей загружена и т.п.)
  GET    /api/pose/status     — нейросеть камеры вне браузера (pose_native.py): есть ли, работает ли
  GET    /api/pose/stream     — её точки тела, рук и лица (Server-Sent Events)
  GET    /api/pose/snap       — её последний кадр камеры (JPEG; для записи руки)
  GET    /api/pose/pace       — FPS игры: нейросеть камеры работает не быстрее (лишние кадры игра не берёт)
  GET    /api/voice/status    — нейросеть голоса вне браузера (voice_native.py): есть ли, скачана ли, работает ли
  GET    /api/voice/stream    — что она услышала (Server-Sent Events)
  GET    /api/voice/devices   — микрофоны, которые она может слушать
  POST   /api/voice/mic       — выбрать микрофон для заклинаний ({"key": …}; "" — как в системе)
  POST   /api/voice/ref       — голоса друзей из голосового чата игры (16 кГц, int16): эхоподавителю, где нет копии колонок
  POST   /api/record          — запись руки (F9 в игре) → папка recordings/
"""

import glob
import http.server
import json
import mimetypes
import os
import shutil
import time
import urllib.request
import socketserver
import sys
import threading
import webbrowser
from urllib.parse import parse_qs, urlparse

# (numpy's maths library starts a thread on every core for any sum of some size, and they spin on
# after it: the browser's frames wait for those cores. The voice and the camera need one each.)
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

ROOT = os.path.dirname(os.path.abspath(__file__))
try:
    # (Windows: a library it refuses — Smart App Control, «Bad Image 0xc0e90002» — is an error in the log, never
    # a window that stops the game until someone presses OK; started by the launcher or a .bat alike)
    import native_probe as _np
    _np.quiet_errors()
except Exception:  # noqa: BLE001
    pass
os.chdir(ROOT)

PORT = int(os.environ.get("ZNS_PORT", "8000"))
MAPS_DIR = "maps"
RIG_FILE = "hand_rig.json"
BOOT = "%x" % int(time.time() * 1000)  # (this start of the server: the window reloads only when it changed — ServerLost.js)
RECORD_DIR = "recordings"  # hand recordings (F9 in the game): sent to the developer
RECORD_MAX = 30 * 1024 * 1024
PERF_LOG = "zns-perf.log"  # the game's performance diary (send it to the developer)
SPELL_LOG = "zns-spells.log"  # the spell journal: every phrase heard and what came of it
LOG_DIR = "logs"  # what the game prints (settings → «Журнал»)
LOG_TITLES = {
    "launcher.log": "Запуск и игра",
    "launcher.prev.log": "Прошлый запуск",
    "server.log": "Запуск и игра",
    "server.prev.log": "Прошлый запуск",
    PERF_LOG: "Производительность",
    SPELL_LOG: "Заклинания",
}
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
    ".woff2": "font/woff2",
    ".ico": "image/x-icon",
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
    # (zns: the game's own marker — the launcher never takes another program on this port for the game)
    return {"date": date, "sha": sha[:7], "full": sha if len(sha) == 40 else "", "zns": "zns-game"}


_LATEST = {"sha": "", "at": 0.0}


def latest_version(fresh=False):
    """The newest version's commit id on GitHub (7 letters, '' if unknown), checked at most every 10 min
    (fresh: at most every 20 s — the menu as it opens). Only when the launcher started the game:
    it can get the new version at once (/__launcher/update)."""
    if not os.environ.get("ZNS_LAUNCHER"):
        return ""
    if time.time() - _LATEST["at"] < (20 if fresh else 600):
        return _LATEST["sha"]
    _LATEST["at"] = time.time()
    try:
        req = urllib.request.Request(os.environ.get("ZNS_UPDATE_REFS") or "https://github.com/DmytroMolodozhonov/working-hand/info/refs?service=git-upload-pack",
                                     headers={"User-Agent": "Volshebstvo"})
        with urllib.request.urlopen(req, timeout=8) as r:
            text = r.read().decode("utf-8", "replace")
        for line in text.splitlines():
            if line.rstrip().endswith(" refs/heads/main-fbxy0j"):
                sha = line.split(" ")[0][-40:]
                _LATEST["sha"] = sha[:7]
                break
    except Exception:  # noqa: BLE001  (no internet: nothing to say)
        pass
    return _LATEST["sha"]


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


def log_files():
    """The game's logs: the launcher's (it passes them in ZNS_LOG_FILES) or our own, then the perf diary."""
    paths = [p for p in os.environ.get("ZNS_LOG_FILES", "").split(os.pathsep) if p]
    if not paths:
        paths = [os.path.join(LOG_DIR, "server.log"), os.path.join(LOG_DIR, "server.prev.log")]
    paths.append(SPELL_LOG)
    paths.append(PERF_LOG)
    return paths


def read_logs(limit=200_000):
    """[{name, title, size, text}] — the end of each log that exists (the newest lines matter)."""
    out = []
    for p in log_files():
        try:
            with open(p, "rb") as fh:
                fh.seek(0, 2)
                size = fh.tell()
                fh.seek(max(0, size - limit))
                text = fh.read().decode("utf-8", "replace")
        except OSError:
            continue
        name = os.path.basename(p)
        out.append({"name": name, "title": LOG_TITLES.get(name, name), "size": size, "text": text, "path": os.path.abspath(p)})
    return out


class _Tee:
    """print() into logs/server.log as well as the console window."""

    def __init__(self, fh, other):
        self.fh, self.other = fh, other

    def write(self, s):
        for f in (self.fh, self.other):
            if f is not None:
                try:
                    f.write(s)
                    f.flush()
                except Exception:  # noqa: BLE001
                    pass
        return len(s)

    def flush(self):
        pass


def start_server_log():
    """Started by a .bat or the Mac launcher: keep a copy of what it prints for the «Журнал»."""
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        cur = os.path.join(LOG_DIR, "server.log")
        if os.path.isfile(cur) and os.path.getsize(cur) > 0:
            os.replace(cur, os.path.join(LOG_DIR, "server.prev.log"))
        fh = open(cur, "a", encoding="utf-8", errors="replace")
        sys.stdout = _Tee(fh, sys.__stdout__)
        sys.stderr = _Tee(fh, sys.__stderr__)
    except OSError:
        pass


def adopt_app_launcher():
    """Windows, started by any old .bat (the desktop «Зомби не спят.bat» or «Обновить и
    запустить игру.bat» in whatever folder): put the new app icon (no black window, a
    loading screen) on the desktop — once (an icon deleted on purpose isn't forced back)."""
    if os.name != "nt" or os.environ.get("ZNS_LAUNCHER"):
        return
    try:
        sys.path.insert(0, os.path.join(ROOT, "launcher"))
        import zns_launcher
        zns_launcher.adopt_existing_install(ROOT)
        print("  Значок «Волшебство только начинается» на рабочем столе готов.")
    except Exception as e:  # noqa: BLE001 — never stop the game for this
        print(f"  (новый значок игры не создан: {e})")


LOCAL_ADDRS = ("127.0.0.1", "::1", "::ffff:127.0.0.1")
LOCAL_NAMES = ("localhost", "127.0.0.1", "::1")
PRIVATE_PATHS = ("/api/voice/", "/api/pose/", "/api/llm/", "/api/tts/")  # the microphone, the camera, the villagers' network


def is_own_page(client_ip, headers):
    """Is the request from this computer's own game page? The microphone and the camera (what they
    heard, saw) are for it alone — the server listens on the network too, so: not another computer
    (address), not another site's page in this computer's browser (Origin / Sec-Fetch-Site), not a
    site that names itself «localhost» through its own DNS (Host)."""
    if client_ip not in LOCAL_ADDRS:
        return False
    host = (headers.get("Host") or "").strip().lower()
    host = host[1:host.find("]")] if host.startswith("[") else host.split(":")[0]
    if host not in LOCAL_NAMES:
        return False
    site = headers.get("Sec-Fetch-Site")
    if site and site not in ("same-origin", "none"):
        return False
    origin = headers.get("Origin")
    if origin and origin != "null" and (urlparse(origin).hostname or "") not in LOCAL_NAMES:
        return False
    return True


def safe_map_name(name):
    if not isinstance(name, str):
        return ""
    return "".join(c for c in name if c.isalpha() or c.isdigit() or c in (" ", "-", "_")).strip()[:64]


class GameRequestHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **FORCED_TYPES}

    def log_message(self, fmt, *args):
        # Quiet static-file spam; keep API and errors visible.
        if any(p in (self.path or "") for p in ("/api/perflog", "/api/spelllog", "/api/gamelog", "/api/pose/", "/api/voice/", "/api/alive", "/api/logs")):
            return
        if "/api/" in (self.path or "") or (args and str(args[1])[:1] in "45"):
            super().log_message(fmt, *args)

    def end_headers(self):
        # Game code changes between versions — never serve stale scripts.
        path = urlparse(self.path).path
        if path.endswith((".js", ".mjs", ".html", ".css", ".json")) or path == "/":
            self.send_header("Cache-Control", "no-cache")
        # A cross-origin-isolated page: the villagers' voices and neural net may use several
        # processor cores (threads need SharedArrayBuffer) — their answers come several times sooner.
        # ("credentialless": the model downloads from other sites still work, no CORP needed)
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
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

    # ---------- the camera network outside the browser ----------
    def _pose_snap(self):
        try:
            from pose_native import POSE
            jpg = POSE.snapshot()
        except Exception:  # noqa: BLE001
            jpg = None
        if not jpg:
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(jpg)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(jpg)

    def _pose_pace(self, query):
        """The game's frames a second: the camera program works no faster (its results beyond are unused)."""
        try:
            from pose_native import POSE
            POSE.pace(float(parse_qs(query).get("fps", ["0"])[0]))
        except Exception:  # noqa: BLE001
            pass
        return self._json(200, {"ok": True})

    def _pose_status(self):
        try:
            from pose_native import POSE
        except Exception as e:  # noqa: BLE001
            return self._json(200, {"available": False, "error": str(e)})
        return self._json(200, POSE.status())

    def _pose_stream(self, query):
        """Server-Sent Events: every new result of the network as one 'data:' line."""
        from pose_native import POSE
        q = parse_qs(query)
        cam = q.get("cam", [None])[0]
        POSE.start(quality=q.get("q", ["1"])[0], camera=int(cam) if cam and cam.isdigit() else None,
                   hands=q.get("hands", [""])[0])  # ("v5": Settings → Версия Кистей Рук → V5, hand_v5.py)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        POSE.clients += 1
        seen = POSE.seq
        try:
            while True:
                with POSE.cond:
                    POSE.cond.wait_for(lambda: POSE.seq != seen or POSE.state in ("error", "unavailable"), timeout=2)
                    seq, data, state = POSE.seq, POSE.latest, POSE.state
                if state in ("error", "unavailable"):
                    self.wfile.write(("event: fail\ndata: " + json.dumps({"error": POSE.error}, ensure_ascii=False) + "\n\n").encode("utf-8"))
                    self.wfile.flush()
                    return
                if seq != seen and data:
                    seen = seq
                    self.wfile.write(("data: " + data + "\n\n").encode("utf-8"))
                else:
                    self.wfile.write(b": keep-alive\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            return
        finally:
            POSE.clients -= 1
            POSE.last_client = time.time()

    # ---------- the voice network outside the browser ----------
    def _voice_status(self):
        try:
            from voice_native import VOICE
        except Exception as e:  # noqa: BLE001
            return self._json(200, {"available": False, "state": "unavailable", "error": str(e)})
        return self._json(200, VOICE.status())

    def _voice_devices(self):
        """The microphones voice_native.py can listen to (the settings' «Микрофон для заклинаний»)."""
        try:
            from voice_native import VOICE, list_inputs
            devices = list_inputs()
        except Exception as e:  # noqa: BLE001
            return self._json(200, {"devices": [], "error": str(e)})
        return self._json(200, {"devices": devices, "current": VOICE.mic_key, "wanted": VOICE.mic_wanted, "fallback": VOICE.mic_fallback})

    def _voice_stream(self):
        """Server-Sent Events: every phrase heard (and the microphone's level) as one 'data:' line each."""
        from voice_native import VOICE
        mic = parse_qs(urlparse(self.path).query).get("mic")
        if mic is not None:
            VOICE.set_mic(mic[0])
        with VOICE.cond:
            VOICE.clients += 1  # (before start: a listener that stops for want of clients never misses this one)
        try:
            if not VOICE.start():
                return self._json(503, VOICE.status())
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            seen = VOICE.seq
            while True:
                with VOICE.cond:
                    VOICE.cond.wait_for(lambda: VOICE.seq != seen or VOICE.state == "error", timeout=2)
                    seq, state = VOICE.seq, VOICE.state
                    new = list(VOICE.events)[-(seq - seen):] if seq - seen <= len(VOICE.events) else list(VOICE.events)
                if state == "idle":
                    VOICE.start()  # (it stopped while nobody listened: listen again)
                if state == "error":
                    self.wfile.write(("event: fail\ndata: " + json.dumps({"error": VOICE.error}, ensure_ascii=False) + "\n\n").encode("utf-8"))
                    self.wfile.flush()
                    return
                if seq != seen:
                    seen = seq
                    self.wfile.write("".join("data: " + e + "\n\n" for e in new).encode("utf-8"))
                else:
                    self.wfile.write(b": keep-alive\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            return
        finally:
            with VOICE.cond:
                VOICE.clients -= 1
            VOICE.last_client = time.time()

    def _llm(self, path):
        """/api/llm/load {model} → its status; /api/llm/generate {job} → the answer streamed (SSE: «partial»
        pieces, then «result» or «gen_error» — the old web worker's messages); /api/llm/interrupt {id}."""
        from llm_native import LLM
        data = self._read_json() or {}
        if path == "/api/llm/load":
            LLM.start(str(data.get("model") or ""))
            return self._json(200, LLM.status())
        if path == "/api/llm/interrupt":
            LLM.interrupt(data.get("id"))
            return self._json(200, {"ok": True})
        if path != "/api/llm/generate":
            return self._json(404, {"status": "error"})
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        send = lambda m: (self.wfile.write(("data: " + json.dumps(m, ensure_ascii=False) + "\n\n").encode("utf-8")), self.wfile.flush())  # noqa: E731
        try:
            text = LLM.generate(data, send)
            send({"type": "result", "id": data.get("id"), "text": text})
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            LLM.interrupt(data.get("id"))
        except Exception as e:  # noqa: BLE001
            try:
                send({"type": "gen_error", "id": data.get("id"), "message": str(e)})
            except OSError:
                pass

    def _alive(self):
        """The game page holds this open while its window lives (the app launcher
        quits when no window is left; here it only keeps the line open)."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        try:
            while True:
                self.wfile.write(b": ping\n\n")
                self.wfile.flush()
                time.sleep(15)
        except OSError:
            return

    # ---------- GET ----------
    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith(PRIVATE_PATHS) and not is_own_page(self.client_address[0], self.headers):
            return self._json(403, {"status": "error", "message": "only the game on this computer"})
        if path == "/api/pose/status":
            return self._pose_status()
        if path == "/api/pose/stream":
            return self._pose_stream(urlparse(self.path).query)
        if path == "/api/voice/status":
            return self._voice_status()
        if path == "/api/tts/status":
            from tts_native import TTS
            return self._json(200, TTS.status())
        if path == "/api/llm/status":
            from llm_native import LLM
            return self._json(200, LLM.status())
        if path == "/api/voice/stream":
            return self._voice_stream()
        if path == "/api/voice/devices":
            return self._voice_devices()
        if path == "/api/pose/snap":
            return self._pose_snap()
        if path == "/api/pose/pace":
            return self._pose_pace(urlparse(self.path).query)
        if path == "/api/version":
            return self._json(200, game_version())
        if path == "/api/ping":
            # (cheap: the open window asks every 2 s whether the game's program is still here — ServerLost.js)
            return self._json(200, {"zns": "zns-game", "boot": BOOT})
        if path == "/api/update":
            fresh = "fresh" in parse_qs(urlparse(self.path).query)
            return self._json(200, {"have": game_version()["sha"], "latest": latest_version(fresh)})
        if path == "/api/logs":
            return self._json(200, {"logs": read_logs(), "launcher": bool(os.environ.get("ZNS_LAUNCHER"))})
        if path == "/api/alive":
            return self._alive()
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
            if path == "/api/window":
                # The menu's own window buttons (no Windows title bar in the game window)
                data = self._read_json()
                local = self.client_address[0] in ("127.0.0.1", "::1", "::ffff:127.0.0.1")  # (only this computer's own window)
                ok = local and window_action(str(data.get("action", "")), data)
                return self._json(200, {"ok": ok})

            if path.startswith("/api/profile/"):
                # the saves carried over from the user's browser profile into the game's own window (zns_browser.py)
                if not is_own_page(self.client_address[0], self.headers):
                    return self._json(403, {"status": "error", "message": "only the game on this computer"})
                tr = profile_transfer()
                if tr is None:
                    return self._json(200, {"state": "none"})
                if path == "/api/profile/transfer":
                    return self._json(200, tr.status(self.server.server_address[1]))
                if path == "/api/profile/export":
                    length = int(self.headers.get("Content-Length") or 0)
                    if length <= 0 or length > PROFILE_MAX:
                        raise ValueError("Bad request body size")
                    return self._json(200, tr.receive(json.loads(self.rfile.read(length).decode("utf-8"))))
                return self._json(404, {"status": "error"})

            if path.startswith("/api/tts/"):
                # the villagers' neural voices as a program of its own (tts_native.py): this computer's game only
                if not is_own_page(self.client_address[0], self.headers):
                    return self._json(403, {"status": "error", "message": "only the game on this computer"})
                from tts_native import TTS
                if path == "/api/tts/load":
                    TTS.start()
                    return self._json(200, TTS.status())
                if path == "/api/tts/synth":
                    try:
                        return self._json(200, TTS.synth(self._read_json() or {}))
                    except Exception as e:  # noqa: BLE001
                        return self._json(503, {"error": str(e)})
                return self._json(404, {"status": "error"})

            if path.startswith("/api/llm/"):
                # the villagers' conversation network as a program of its own (llm_native.py): this computer's game only
                if not is_own_page(self.client_address[0], self.headers):
                    return self._json(403, {"status": "error", "message": "only the game on this computer"})
                return self._llm(path)

            if path == "/api/voice/ref":
                # the friends' voices as the game's voice chat plays them (16 kHz int16 mono, 50 ms a request): the echo
                # canceller's exact copy where the speakers' own copy («loopback») is not to be had — never kept, never logged
                if not is_own_page(self.client_address[0], self.headers):
                    return self._json(403, {"status": "error", "message": "only the game on this computer"})
                length = int(self.headers.get("Content-Length") or 0)
                if length <= 0 or length > 64000 or length % 2:
                    raise ValueError("Bad request body size")
                data = self.rfile.read(length)
                from voice_native import VOICE
                VOICE.page_ref(data)
                return self._json(200, {"ok": True})

            if path == "/api/voice/mic":
                # the microphone for the spells, chosen in the settings: taken at once (this computer's game only)
                if not is_own_page(self.client_address[0], self.headers):
                    return self._json(403, {"status": "error", "message": "only the game on this computer"})
                from voice_native import VOICE
                VOICE.set_mic(str(self._read_json().get("key", "")))
                return self._json(200, VOICE.status())

            if path == "/api/rig":
                data = self._read_json()
                with open(RIG_FILE, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                return self._json(200, {"status": "success", "message": "Rig saved"})

            if path == "/api/record":
                length = int(self.headers.get("Content-Length") or 0)
                if length <= 0 or length > RECORD_MAX:
                    raise ValueError("Bad request body size")
                body = self.rfile.read(length)
                json.loads(body.decode("utf-8"))  # (only a real recording is written)
                os.makedirs(RECORD_DIR, exist_ok=True)
                name = time.strftime("zns-hands-%Y%m%d-%H%M%S.json")
                with open(os.path.join(RECORD_DIR, name), "wb") as f:
                    f.write(body)
                full = os.path.join(ROOT, RECORD_DIR, name)
                print("  [Запись руки] сохранена: " + full)
                return self._json(200, {"status": "ok", "file": full})

            if path == "/api/gamelog":
                data = self._read_json()
                tag = "".join(ch for ch in str(data.get("tag", "Игра"))[:20] if ch.isalnum() or ch in " -")
                line = str(data.get("line", ""))[:2000].replace("\r", " ").replace("\n", " ")
                if line:
                    print(f"  [{tag or 'Игра'}] {line}")
                return self._json(200, {"status": "ok"})

            if path == "/api/spelllog":
                line = str(self._read_json().get("line", ""))[:2000].replace("\r", " ").replace("\n", " ")
                if line.startswith("==="):
                    # a new game: start the file afresh when it has grown big
                    if os.path.exists(SPELL_LOG) and os.path.getsize(SPELL_LOG) > 2 * 1024 * 1024:
                        os.replace(SPELL_LOG, SPELL_LOG + ".old")
                    print("  [Заклинания] журнал пишется в " + os.path.join(ROOT, SPELL_LOG))
                if line:
                    with open(SPELL_LOG, "a", encoding="utf-8") as f:
                        f.write(line + "\n")
                return self._json(200, {"status": "ok"})

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
                    short = " | ".join([p for p in parts if p.startswith(("FPS", "кадр", "ИИ", "вызовов", "графика", "рывки"))])
                    print("  [FPS] " + (short or line)[:300])
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


PROFILE_MAX = 400 * 1024 * 1024  # all the saved worlds of the old browser profile at once
_transfer = {}


def profile_transfer():
    """The saves' transfer into the game's own browser profile (launcher/zns_browser.py), or None."""
    if "t" not in _transfer:
        try:
            here = os.path.join(ROOT, "launcher")
            if here not in sys.path:
                sys.path.insert(0, here)
            import zns_browser
            _transfer["t"] = zns_browser.Transfer(browsers=_browser_candidates)
        except Exception as e:  # noqa: BLE001
            print(f"  (перенос сохранений недоступен: {e})")
            _transfer["t"] = None
    return _transfer["t"]


def window_action(action, data=None):
    """The game's own window on Windows (no frame, minimise, close, move): launcher/zns_window.py."""
    try:
        here = os.path.join(ROOT, "launcher")
        if here not in sys.path:
            sys.path.insert(0, here)
        from zns_window import window_action as act
    except Exception:  # noqa: BLE001
        return False
    return act(action, data)


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    # the browser asks for ~150 game files at once: a long queue so none is refused
    request_queue_size = 128
    # On Windows SO_REUSEADDR lets a second server share a port that is still
    # busy — the browser would then keep talking to an OLD game window.
    allow_reuse_address = os.name != "nt"

    def handle_error(self, request, client_address):
        # the browser closed a connection (a page reload, the end of a game): nothing to report
        if isinstance(sys.exc_info()[1], (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


def open_server():
    """Start on PORT; if an old game window still holds it, take the next free port."""
    last_error = None
    try:
        here = os.path.join(ROOT, "launcher")
        if here not in sys.path:
            sys.path.insert(0, here)
        from zns_ports import listeners
    except Exception:  # noqa: BLE001
        listeners = None
    for port in range(PORT, PORT + 20):
        busy = listeners(port) if listeners else []
        if busy:
            # (something answers there — on ::1 too, where the browser's «localhost» goes first: the game's
            # window would open another program; zns_ports.py)
            print(f"  Порт {port} занят ({', '.join(busy)}) — пробую следующий...")
            last_error = OSError(f"port {port} busy")
            continue
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
            # (the game's own browser profile; the saves come over from the usual one once — /api/profile/…)
            try:
                zw, before = None, set()
                try:
                    here = os.path.join(ROOT, "launcher")
                    if here not in sys.path:
                        sys.path.insert(0, here)
                    import zns_window as zw
                    before = zw.app_windows_now()
                except Exception:  # noqa: BLE001
                    zw = None
                try:
                    # the game's own process of the engine: its flags always hold (launcher/zns_browser.py)
                    import zns_browser
                    cmd = zns_browser.window_cmd(exe, url)
                except Exception:  # noqa: BLE001
                    cmd = [
                        # (off the screen first: the page cuts the frame away and brings it to the middle — /api/window)
                        exe, f"--app={url}", "--window-size=1180,780", "--window-position=-6000,-6000",
                        # (hidden while it is cut, the window must keep drawing: never «asleep» and grey when shown)
                        "--disable-backgrounding-occluded-windows", "--disable-features=CalculateNativeWinOcclusion",
                        "--force_high_performance_gpu", "--ignore-gpu-blocklist",
                        # the camera network's page (ai.html) gets a process of its own — it never stops the game
                        "--site-per-process",
                        "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
                        "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--no-default-browser-check",
                    ]
                if zw:
                    zw.mark_start()
                    # (the browser's window is grey for its first seconds: a loading picture at once — zns_splash.py)
                    try:
                        import zns_splash
                        sp = zns_splash.show(logo=os.path.join(ROOT, "assets", "logo", "logo-256.png"))
                        if sp:
                            zw.on_shown(sp.close)
                    except Exception:  # noqa: BLE001
                        pass
                subprocess.Popen(cmd)
                print(f"  Игра открыта в отдельном окне ({os.path.basename(exe)}, мощная видеокарта)")
                if zw:
                    # (the new window is hidden the moment it appears: seen only cut to its final look)
                    threading.Thread(target=zw.hide_new_window, args=(before,), daemon=True).start()
                    threading.Thread(target=zw.rescue_offscreen, daemon=True).start()
                return
            except OSError as e:
                print(f"  (не удалось открыть {exe}: {e})")
    webbrowser.open(url)


def ensure_pose_native():
    """The camera network as a program of its own (pose_native.py) needs Google's MediaPipe
    for Python. Not there yet: install it once, in the background (the game meanwhile uses
    the browser's network; from the next game start it uses this one). It is first tried in a process
    of its own (native_probe.py): a library Windows refuses (Smart App Control — «Bad Image 0xc0e90002»)
    never stops the game; the camera then goes through the browser and the log says why."""
    import native_probe as NP
    NP.quiet_errors()
    why = NP.check()
    if why is None:
        print("  Нейросеть камеры: отдельная программа (MediaPipe для Python) готова")
        return
    if why != "missing":
        if NP.repair(why) and NP.check() is None:
            print("  Нейросеть камеры: исправлено — со следующего входа в игру камера станет быстрее.")
            return
        why = (NP.result() or (why, ""))[0]
        print("  Нейросеть камеры: " + NP.message(why))
        try:
            from pose_native import POSE
            POSE.state, POSE.error = "unavailable", NP.message(why)
        except Exception:  # noqa: BLE001
            pass
        return
    if os.environ.get("ZNS_NO_PIP"):
        return
    import subprocess
    import importlib
    import site
    try:
        from pose_native import POSE
        POSE.state = "installing"
    except Exception:  # noqa: BLE001
        POSE = None
    print("  Нейросеть камеры: устанавливаю MediaPipe для Python (один раз, около 150 МБ) —")
    print("  игра уже работает; со следующего входа в игру камера станет быстрее.")
    try:
        r = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--user", "--disable-pip-version-check", "-q", "mediapipe"],
            capture_output=True, text=True, timeout=1800,
        )
        ok = r.returncode == 0
        tail = (r.stderr or r.stdout or "").strip().splitlines()[-1:] if not ok else []
    except Exception as e:  # noqa: BLE001
        ok, tail = False, [str(e)]
    if ok:
        # (a user folder for packages made just now is not on the path yet)
        try:
            site.addsitedir(site.getusersitepackages())
        except Exception:  # noqa: BLE001
            pass
        importlib.invalidate_caches()
        why = NP.check()  # (installed: does Windows let it run?)
        if why is not None and NP.repair(why):
            why = NP.check()
        if POSE:
            POSE.state = "idle" if why is None else "unavailable"
            POSE.error = "" if why is None else NP.message(why)
            POSE._mp = None
        print("  Нейросеть камеры: " + ("MediaPipe установлен. Выйдите в меню (Escape) и снова начните игру." if why is None else NP.message(why)))
    else:
        if POSE:
            POSE.state = "unavailable"
            POSE.error = "не удалось установить MediaPipe: " + " ".join(tail)
        print("  Нейросеть камеры: не удалось установить MediaPipe (игра работает как раньше): " + " ".join(tail))


def _restart_helpers():
    """The game was updated while it ran (the launcher reloads this module): the programs it started — the
    villagers' net, their voices, the speech network — still ran the OLD code (the author: «не чувствуется, что обнова
    загружена» — 25 minutes on the old ones). Each is stopped and its module read anew; the next page starts the new one."""
    import importlib
    for name, attr in (("llm_native", "LLM"), ("tts_native", "TTS"), ("voice_native", "VOICE")):
        m = sys.modules.get(name)
        if m is None:
            continue
        try:
            getattr(m, attr).stop()
        except Exception as e:  # noqa: BLE001
            print(f"  [обновление] {name}: не остановилась: {e}")
        try:
            importlib.reload(m)
            print(f"  [обновление] {name}: новая версия загружена")
        except Exception as e:  # noqa: BLE001
            print(f"  [обновление] {name}: не перезагрузилась: {e}")


# (this module read again by the launcher after an update: the helper programs take the new code too)
if any(n in sys.modules for n in ("llm_native", "tts_native", "voice_native")) and os.environ.get("ZNS_LAUNCHER"):
    _restart_helpers()

VOICE_PACKAGES = ["numpy", "onnxruntime", "livekit", "PyAudioWPatch" if sys.platform.startswith("win") else "sounddevice"]


def ensure_voice_native():
    """The voice network as a program of its own (voice_native.py): its Python packages and the
    network itself (≈165 MB to download). Missing: get them once, in the background —
    the game meanwhile uses the browser's recognizer; the voice switches over by itself when ready
    (from the next game start)."""
    try:
        from voice_native import VOICE
    except Exception as e:  # noqa: BLE001
        print("  Нейросеть голоса: недоступна:", e)
        return
    if VOICE.available():
        print("  Нейросеть голоса: готова (распознавание на компьютере, голос друга из колонок убирается)")
        return
    if os.environ.get("ZNS_NO_PIP"):
        return
    import subprocess
    import importlib
    import site
    if not VOICE._deps():
        VOICE.state = "installing"
        VOICE.detail = "Нейросеть голоса: ставлю программы (один раз)…"
        print("  Нейросеть голоса: ставлю программы для неё (один раз) — игра пока слушает через браузер.")
        pkgs = list(VOICE_PACKAGES)
        # (an old MediaPipe wants protobuf below 5, LiveKit 5 and up: then MediaPipe is brought up to
        # date with it — its new versions want no particular protobuf — so the camera keeps working)
        try:
            from importlib import metadata
            if any(r.replace(" ", "").startswith("protobuf") and "<5" in r.replace(" ", "") for r in (metadata.requires("mediapipe") or [])):
                pkgs += ["-U", "mediapipe"]
        except Exception:  # noqa: BLE001
            pass
        try:
            r = subprocess.run(
                # (only these packages, only from PyPI over HTTPS, only ready-built ones: nothing is compiled
                # from sources on this computer)
                [sys.executable, "-m", "pip", "install", "--user", "--disable-pip-version-check", "-q",
                 "--index-url", "https://pypi.org/simple", "--only-binary", ":all:", *pkgs],
                capture_output=True, text=True, timeout=1800,
            )
            ok = r.returncode == 0
            tail = (r.stderr or r.stdout or "").strip().splitlines()[-1:] if not ok else []
        except Exception as e:  # noqa: BLE001
            ok, tail = False, [str(e)]
        try:
            site.addsitedir(site.getusersitepackages())
        except Exception:  # noqa: BLE001
            pass
        importlib.invalidate_caches()
        if not ok or not VOICE._deps():
            VOICE.state = "unavailable"
            VOICE.error = "не удалось поставить программы: " + " ".join(tail)
            print("  Нейросеть голоса: не удалось поставить программы (игра слушает через браузер):", " ".join(tail))
            return
    try:
        print("  Нейросеть голоса: скачиваю (≈165 МБ, один раз)…")
        VOICE.download_models()
    except Exception as e:  # noqa: BLE001
        VOICE.state = "unavailable"
        VOICE.error = f"не удалось скачать нейросеть: {e}"
        print("  Нейросеть голоса: не удалось скачать (игра слушает через браузер):", e)
        return
    VOICE.state = "idle"
    VOICE.detail = ""
    VOICE._ready = None
    if VOICE.available():
        print("  Нейросеть голоса: готова. Со следующего входа в игру голос слышит она.")


def main():
    no_browser = "--no-browser" in sys.argv or os.environ.get("ZNS_NO_BROWSER")
    start_server_log()
    threading.Thread(target=ensure_pose_native, daemon=True).start()
    threading.Thread(target=ensure_voice_native, daemon=True).start()
    update_desktop_launcher()
    adopt_app_launcher()
    httpd, port = open_server()
    url = f"http://localhost:{port}"
    print("=" * 50)
    print("  Волшебство только начинается — сервер запущен")
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
