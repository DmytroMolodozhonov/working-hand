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
"""

import http.server
import json
import mimetypes
import os
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


def safe_map_name(name):
    if not isinstance(name, str):
        return ""
    return "".join(c for c in name if c.isalpha() or c.isdigit() or c in (" ", "-", "_")).strip()[:64]


class GameRequestHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **FORCED_TYPES}

    def log_message(self, fmt, *args):
        # Quiet static-file spam; keep API and errors visible.
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


def main():
    no_browser = "--no-browser" in sys.argv or os.environ.get("ZNS_NO_BROWSER")
    httpd, port = open_server()
    url = f"http://localhost:{port}"
    print("=" * 50)
    print("  ЗОМБИ НЕ СПЯТ — сервер запущен")
    print(f"  Откройте в браузере: {url}")
    print("  Чтобы остановить — закройте это окно (или Ctrl+C)")
    print("=" * 50)
    if not no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
