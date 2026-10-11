"""
zns_launcher.py — «Волшебство только начинается»: the game's app on a computer.

Started by the desktop shortcut (Windows: pythonw.exe, so no black command
window). It shows its own loading screen in a Chrome/Edge app window and does
there, step by step, what the old .bat did in a console:

  1. the first time: asks where to install the game (a folder picker);
  2. checks GitHub for a new version and downloads it (progress bar);
  3. updates itself (these launcher files) and the desktop shortcut;
  4. the camera network (pose_native.py, MediaPipe for Python): ready or
     being installed in the background;
  5. starts the game's server (server.py) IN THIS PROCESS, on the same port
     the loading screen came from — the window just reloads into the game,
     with the same address, so saved worlds, the hero and the settings stay.

Everything it and the game print goes to logs/launcher.log (the game's
settings → «Журнал» shows it). When the game window is closed the launcher
quits by itself; the shortcut started a second time only opens a new window.

Only the Python standard library. Environment (for tests):
  ZNS_LAUNCHER_HOME      where config.json, logs and the launcher copy live
  ZNS_PORT               the game's port (8000)
  ZNS_LAUNCHER_NO_WINDOW do not open a browser window
  ZNS_UPDATE_ZIP / ZNS_UPDATE_REFS / ZNS_UPDATE_API   where versions come from
  ZNS_NO_UPDATE          never download
  ZNS_DEFAULT_INSTALL    the folder suggested the first time
  ZNS_LAUNCHER_GRACE     seconds without any open window before quitting (20)
"""

import http.server
import json
import os
import shutil
import socketserver
import subprocess
import sys
import threading
import time
import traceback
import urllib.request
import zipfile
from urllib.parse import urlparse

APP_NAME = "Волшебство только начинается"
REPO = "DmytroMolodozhonov/working-hand"
BRANCH = "main-fbxy0j"
HERE = os.path.dirname(os.path.abspath(__file__))
IS_WIN = os.name == "nt"
LAUNCHER_FILES = ("launcher.pyw", "zns_launcher.py", "loading.html")
LOGO_FILES = (("assets/logo/logo.ico", "logo.ico"), ("assets/logo/logo-256.png", "logo.png"))
OLD_DESKTOP_BATS = ("Зомби не спят.bat", "Волшебство только начинается.bat")  # the old icons (a black window)
NO_WINDOW = 0x08000000  # CREATE_NO_WINDOW: helper programs never flash a black window


def env(name, default=""):
    return os.environ.get(name) or default


def zip_url(sha=""):
    """The game's archive: of that exact commit when its id is known (an archive of the
    branch can come a little stale from GitHub — and then counted as the new version)."""
    if env("ZNS_UPDATE_ZIP"):
        return env("ZNS_UPDATE_ZIP")
    return f"https://github.com/{REPO}/archive/{sha}.zip" if sha else f"https://github.com/{REPO}/archive/refs/heads/{BRANCH}.zip"


def refs_url():
    return env("ZNS_UPDATE_REFS", f"https://github.com/{REPO}/info/refs?service=git-upload-pack")


def api_url():
    return env("ZNS_UPDATE_API", f"https://api.github.com/repos/{REPO}/branches/{BRANCH}")


def home_dir():
    """The launcher's own place: config, logs, a copy of these files, the icon."""
    h = env("ZNS_LAUNCHER_HOME")
    if h:
        return h
    if IS_WIN:
        return os.path.join(env("LOCALAPPDATA", os.path.expanduser("~")), "Volshebstvo")
    return os.path.join(os.path.expanduser("~"), ".volshebstvo")


def old_install_dir():
    """Where the old .bat / PowerShell installer put the game."""
    if not IS_WIN:
        return ""
    return os.path.join(env("LOCALAPPDATA"), "ZombieNeSpyat", "ZombieNeSpyat")


def default_install_dir():
    d = env("ZNS_DEFAULT_INSTALL")
    if d:
        return d
    old = old_install_dir()
    if old and os.path.isfile(os.path.join(old, "server.py")):
        return old  # the game is already here: keep it, nothing to download again
    return os.path.join(home_dir(), "Game")


# ------------------------------------------------------------------ config

def config_path(home=None):
    return os.path.join(home or home_dir(), "config.json")


def load_config(home=None):
    try:
        with open(config_path(home), encoding="utf-8") as fh:
            cfg = json.load(fh)
        return cfg if isinstance(cfg, dict) else {}
    except (OSError, ValueError):
        return {}


def save_config(cfg, home=None):
    p = config_path(home)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, p)


# ------------------------------------------------------------------ the install folder

def resolve_install_dir(chosen):
    """The folder the person picked → the folder the game goes to.
    An empty folder or one with the game: right there. A folder with other
    things in it (say «D:\\Игры»): a «Volshebstvo» folder inside it."""
    chosen = os.path.abspath(os.path.expanduser((chosen or "").strip().strip('"')))
    if os.path.isfile(os.path.join(chosen, "server.py")):
        return chosen
    try:
        if os.path.isdir(chosen) and os.listdir(chosen):
            return os.path.join(chosen, "Volshebstvo")
    except OSError:
        pass
    return chosen


def check_writable(folder):
    """'' if the game can be installed there, else a reason in simple Russian."""
    try:
        os.makedirs(folder, exist_ok=True)
        probe = os.path.join(folder, ".zns-write-test")
        with open(probe, "w", encoding="ascii") as fh:
            fh.write("ok")
        os.remove(probe)
        return ""
    except OSError as e:
        return f"В эту папку нельзя записывать ({e.strerror or e}). Выберите другую, например в «Документах»."


# ------------------------------------------------------------------ versions

def parse_refs(text, branch=BRANCH):
    """The commit id of the branch from git's «info/refs» answer."""
    for line in (text or "").splitlines():
        if line.rstrip().endswith("refs/heads/" + branch):
            for word in line.split():
                w = word[-40:]
                if len(w) == 40 and all(c in "0123456789abcdef" for c in w):
                    return w
    return ""


def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "Volshebstvo-launcher"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def latest_version():
    """The newest version's commit id on GitHub ('' when it can't be learned)."""
    try:
        sha = parse_refs(http_get(refs_url()).decode("utf-8", "replace"))
        if sha:
            return sha
    except Exception as e:  # noqa: BLE001
        log(f"  (версия через git refs не получена: {e})")
    try:
        sha = json.loads(http_get(api_url()).decode("utf-8"))["commit"]["sha"]
        return sha if isinstance(sha, str) else ""
    except Exception as e:  # noqa: BLE001
        log(f"  (версия через GitHub API не получена: {e})")
    return ""


def local_version(game):
    try:
        with open(os.path.join(game, ".zns-version"), encoding="ascii") as fh:
            return fh.read().strip()
    except OSError:
        return ""


def copy_over(src, dst):
    """The new version over the old one: game files are replaced, the person's
    own things (new maps, hand_rig.json, logs) stay."""
    os.makedirs(dst, exist_ok=True)
    shutil.copytree(src, dst, dirs_exist_ok=True)


# ------------------------------------------------------------------ logging

class Tee:
    """print() into the log file (and into the console when there is one)."""

    def __init__(self, fh, other):
        self.fh, self.other = fh, other

    def write(self, s):
        try:
            self.fh.write(s)
            self.fh.flush()
        except Exception:  # noqa: BLE001
            pass
        if self.other is not None:
            try:
                self.other.write(s)
            except Exception:  # noqa: BLE001
                pass
        return len(s)

    def flush(self):
        pass

    def isatty(self):
        return False


def start_log(folder, name):
    """logs/<name>.log (the previous one is kept as <name>.prev.log). Returns the paths."""
    os.makedirs(folder, exist_ok=True)
    cur = os.path.join(folder, name + ".log")
    prev = os.path.join(folder, name + ".prev.log")
    try:
        if os.path.isfile(cur) and os.path.getsize(cur) > 0:
            os.replace(cur, prev)
    except OSError:
        pass
    fh = open(cur, "a", encoding="utf-8", errors="replace")
    sys.stdout = Tee(fh, sys.__stdout__)
    sys.stderr = Tee(fh, sys.__stderr__)
    return cur, prev


def log(msg):
    print(time.strftime("[%H:%M:%S] ") + msg)


# ------------------------------------------------------------------ the browser window

def browser_candidates():
    """Chrome first (saved worlds and settings live in the browser the game used
    before), then Edge — it is on every Windows 10/11."""
    if not IS_WIN:
        return []
    roots = [env("PROGRAMFILES", r"C:\Program Files"), env("PROGRAMFILES(X86)", r"C:\Program Files (x86)"), env("LOCALAPPDATA")]
    out = [os.path.join(r, "Google", "Chrome", "Application", "chrome.exe") for r in roots if r]
    out += [os.path.join(r, "Microsoft", "Edge", "Application", "msedge.exe") for r in roots if r]
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


def prefer_strong_gpu(exe):
    """Windows: «High performance» graphics for the browser (as server.py does)."""
    try:
        import winreg
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\DirectX\UserGpuPreferences") as k:
            try:
                old = winreg.QueryValueEx(k, exe)[0]
            except OSError:
                old = ""
            if "GpuPreference=2;" not in old:
                winreg.SetValueEx(k, exe, 0, winreg.REG_SZ, "GpuPreference=2;")
    except Exception:  # noqa: BLE001
        pass


def window_args(exe, url):
    return [
        # (no Windows title bar: the game draws its own window with «свернуть / во весь экран / закрыть»)
        exe, f"--app={url}", "--start-fullscreen",
        "--force_high_performance_gpu", "--ignore-gpu-blocklist",
        "--site-per-process",
        "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
        "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--no-default-browser-check",
    ]


def open_window(url):
    if env("ZNS_LAUNCHER_NO_WINDOW"):
        log(f"Окно не открываю (ZNS_LAUNCHER_NO_WINDOW): {url}")
        return
    for exe in browser_candidates():
        prefer_strong_gpu(exe)
        try:
            subprocess.Popen(window_args(exe, url))
            log(f"Окно игры: {os.path.basename(exe)}")
            return
        except OSError as e:
            log(f"  (не удалось открыть {exe}: {e})")
    import webbrowser
    webbrowser.open(url)


# ------------------------------------------------------------------ shortcuts (Windows)

def desktop_dir():
    if IS_WIN:
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as k:
                d = os.path.expandvars(winreg.QueryValueEx(k, "Desktop")[0])
                if os.path.isdir(d):
                    return d
        except Exception:  # noqa: BLE001
            pass
    return os.path.join(os.path.expanduser("~"), "Desktop")


def start_menu_dir():
    return os.path.join(env("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs") if IS_WIN else ""


def pythonw_exe():
    exe = sys.executable or ""
    d, base = os.path.split(exe)
    if base.lower() == "python.exe":
        w = os.path.join(d, "pythonw.exe")
        if os.path.isfile(w):
            return w
    return exe


def shortcut_spec(home):
    """What the desktop icon runs: pythonw.exe (no black window) with launcher.pyw."""
    ldir = os.path.join(home, "launcher")
    ico = os.path.join(ldir, "logo.ico")
    return {
        "target": pythonw_exe(),
        "args": '"' + os.path.join(ldir, "launcher.pyw") + '"',
        "workdir": ldir,
        "icon": ico if os.path.isfile(ico) else "",
        "description": APP_NAME,
    }


def _shortcut_ctypes(path, spec):
    """IShellLinkW through ctypes: Windows' own way to make a .lnk. Works even where
    PowerShell runs in its constrained mode (Smart App Control) and can't use COM."""
    import ctypes
    from ctypes import wintypes, byref, c_void_p, POINTER

    class GUID(ctypes.Structure):
        _fields_ = [("a", wintypes.DWORD), ("b", wintypes.WORD), ("c", wintypes.WORD), ("d", ctypes.c_ubyte * 8)]

    def guid(a, b, c, d):
        g = GUID(a, b, c)
        g.d[:] = list(d)
        return g

    tail = (0xC0, 0, 0, 0, 0, 0, 0, 0x46)
    CLSID_ShellLink = guid(0x00021401, 0, 0, tail)
    IID_IShellLinkW = guid(0x000214F9, 0, 0, tail)
    IID_IPersistFile = guid(0x0000010B, 0, 0, tail)
    ole32 = ctypes.OleDLL("ole32")
    try:
        ole32.CoInitialize(None)
    except OSError:
        pass  # (this thread already has COM)
    HR = ctypes.HRESULT

    def call(obj, index, *args, argtypes=()):
        vtbl = ctypes.cast(obj, POINTER(POINTER(c_void_p))).contents
        fn = ctypes.WINFUNCTYPE(HR, c_void_p, *argtypes)(vtbl[index])
        return fn(obj, *args)

    link = c_void_p()
    ole32.CoCreateInstance(byref(CLSID_ShellLink), None, 1, byref(IID_IShellLinkW), byref(link))  # CLSCTX_INPROC_SERVER
    try:
        W = wintypes.LPCWSTR
        call(link, 20, spec["target"], argtypes=(W,))        # SetPath
        call(link, 11, spec["args"], argtypes=(W,))          # SetArguments
        call(link, 9, spec["workdir"], argtypes=(W,))        # SetWorkingDirectory
        call(link, 7, spec["description"], argtypes=(W,))   # SetDescription
        if spec["icon"]:
            call(link, 17, spec["icon"], 0, argtypes=(W, ctypes.c_int))  # SetIconLocation
        pf = c_void_p()
        call(link, 0, byref(IID_IPersistFile), byref(pf), argtypes=(POINTER(GUID), POINTER(c_void_p)))  # QueryInterface
        try:
            call(pf, 6, path, True, argtypes=(W, wintypes.BOOL))  # IPersistFile::Save
        finally:
            call(pf, 2)  # Release
    finally:
        call(link, 2)  # Release


def _shortcut_powershell(path, spec):
    def q(s):
        return "'" + s.replace("'", "''") + "'"
    ps = (
        f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut({q(path)});"
        f"$s.TargetPath={q(spec['target'])};$s.Arguments={q(spec['args'])};"
        f"$s.WorkingDirectory={q(spec['workdir'])};$s.Description={q(spec['description'])};"
        + (f"$s.IconLocation={q(spec['icon'] + ',0')};" if spec["icon"] else "")
        + "$s.Save()"
    )
    import base64
    enc = base64.b64encode(ps.encode("utf-16-le")).decode("ascii")  # (no quoting or code page troubles)
    subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", enc],
                   capture_output=True, timeout=60, creationflags=NO_WINDOW, check=True)


def make_shortcut(path, spec):
    """A .lnk at path. True when it is there."""
    if not IS_WIN:
        return False
    for how in (_shortcut_ctypes, _shortcut_powershell):
        try:
            if os.path.isfile(path):
                os.remove(path)
            how(path, spec)
            if os.path.isfile(path):
                log(f"  Значок: {path}")
                return True
        except Exception as e:  # noqa: BLE001
            log(f"  (значок не создан через {how.__name__}: {e})")
    return False


def remove_old_desktop_bat():
    """The old desktop .bat icons (they opened a black window): the new icon replaces them."""
    for name in OLD_DESKTOP_BATS:
        p = os.path.join(desktop_dir(), name)
        try:
            with open(p, "rb") as fh:
                if b"ZombieNeSpyat\\start.bat" in fh.read():
                    os.remove(p)
                    log(f"  Старый значок «{name}» убран.")
        except OSError:
            pass


def install_shortcuts(home, force=False):
    """Desktop + Start menu icons. Made once (and again when the logo appears), so an icon
    the person deleted on purpose isn't forced back on every start."""
    if not IS_WIN:
        return
    cfg = load_config(home)
    spec = shortcut_spec(home)
    want = {"target": spec["target"], "icon": bool(spec["icon"])}
    if not force and cfg.get("shortcut") == want:
        return
    name = APP_NAME + ".lnk"
    ok = make_shortcut(os.path.join(desktop_dir(), name), spec)
    sm = start_menu_dir()
    if sm and os.path.isdir(sm):
        make_shortcut(os.path.join(sm, name), spec)
    if ok:
        remove_old_desktop_bat()
        cfg = load_config(home)
        cfg["shortcut"] = want
        save_config(cfg, home)


def self_update(game, home):
    """Copy the launcher files and the logo from the (new) game into the launcher's own
    folder: the next start already uses the newest launcher. Returns True if something changed."""
    src_dir = os.path.join(game, "launcher")
    dst_dir = os.path.join(home, "launcher")
    os.makedirs(dst_dir, exist_ok=True)
    pairs = [(os.path.join(src_dir, f), os.path.join(dst_dir, f)) for f in LAUNCHER_FILES]
    pairs += [(os.path.join(game, *a.split("/")), os.path.join(dst_dir, b)) for a, b in LOGO_FILES]
    changed = False
    for src, dst in pairs:
        try:
            if not os.path.isfile(src):
                continue
            with open(src, "rb") as fh:
                new = fh.read()
            try:
                with open(dst, "rb") as fh:
                    if fh.read() == new:
                        continue
            except OSError:
                pass
            with open(dst, "wb") as fh:
                fh.write(new)
            changed = True
        except OSError as e:
            log(f"  (не удалось обновить {os.path.basename(dst)}: {e})")
    return changed


def adopt_existing_install(game, home=None):
    """server.py started by the old .bat (Windows): move the person onto the new app —
    the launcher's files, its config pointing at this game folder, the new icon."""
    home = home or home_dir()
    self_update(game, home)
    cfg = load_config(home)
    if not cfg.get("install_dir"):
        cfg["install_dir"] = game
        save_config(cfg, home)
    install_shortcuts(home)


# ------------------------------------------------------------------ the loading work

STEPS = [
    ("folder", "Папка игры"),
    ("update", "Проверяю обновления"),
    ("download", "Скачиваю новую версию"),
    ("camera", "Нейросеть камеры"),
    ("start", "Запускаю игру"),
]


class Status:
    def __init__(self):
        self.lock = threading.Lock()
        self.data = {
            "app": APP_NAME, "steps": [{"id": i, "title": t, "state": "wait", "note": ""} for i, t in STEPS],
            "step": "folder", "title": "Готовлю игру…", "detail": "", "progress": None,
            "need_folder": False, "default_folder": "", "folder_error": "",
            "error": "", "done": False, "version": "",
        }

    def set(self, **kw):
        with self.lock:
            self.data.update(kw)

    def step(self, sid, state, note=None, **kw):
        with self.lock:
            for s in self.data["steps"]:
                if s["id"] == sid:
                    s["state"] = state
                    if note is not None:
                        s["note"] = note
            if state == "run":
                self.data["step"] = sid
            self.data.update(kw)

    def snapshot(self):
        with self.lock:
            return json.loads(json.dumps(self.data))


class Launcher:
    def __init__(self, home=None):
        self.home = home or home_dir()
        self.status = Status()
        self.httpd = None
        self.port = 0
        self.game = None  # the game's server module, once started
        self.work_lock = threading.Lock()
        self.pages = 0  # open windows (loading screen or game)
        self.ever_page = False
        self.last_page = time.time()
        self.pages_lock = threading.Lock()
        self.browse_lock = threading.Lock()
        self.log_files = []

    # ---------- pages alive
    def page_open(self):
        with self.pages_lock:
            self.pages += 1
            self.ever_page = True

    def page_closed(self):
        with self.pages_lock:
            self.pages -= 1
            self.last_page = time.time()

    def watchdog(self):
        grace = float(env("ZNS_LAUNCHER_GRACE", "20"))
        started = time.time()
        while True:
            time.sleep(0.5)
            with self.pages_lock:
                idle = self.pages <= 0 and time.time() - self.last_page > grace
                never = not self.ever_page and time.time() - started > 600
            if (self.ever_page and idle) or never:
                if self.work_lock.locked():
                    continue  # never stop in the middle of an update
                log("Окно игры закрыто — завершаю работу.")
                threading.Thread(target=self.httpd.shutdown, daemon=True).start()
                return

    # ---------- steps
    def start_work(self):
        if self.work_lock.locked():
            return
        threading.Thread(target=self.work, daemon=True).start()

    def work(self):
        with self.work_lock:
            st = self.status
            st.set(error="")
            try:
                cfg = load_config(self.home)
                game = cfg.get("install_dir")
                st.step("folder", "ok", game)
                self.update(game, cfg)
                if not os.path.isfile(os.path.join(game, "server.py")):
                    raise RuntimeError("Файлы игры не найдены — проверьте интернет и нажмите «Попробовать ещё раз».")
                try:
                    if self_update(game, self.home):
                        log("Запускатор обновлён (новый — со следующего запуска).")
                    install_shortcuts(self.home)
                except Exception as e:  # noqa: BLE001
                    log(f"  (значок/запускатор: {e})")
                self.camera(game)
                self.start_game(game)
            except Exception as e:  # noqa: BLE001
                log("ОШИБКА: " + "".join(traceback.format_exception(type(e), e, e.__traceback__)))
                for s in st.snapshot()["steps"]:
                    if s["state"] == "run":
                        st.step(s["id"], "fail")
                st.set(error=str(e) or e.__class__.__name__, title="Что-то пошло не так", progress=None)

    def update(self, game, cfg):
        st = self.status
        st.step("update", "run", "", title="Проверяю, есть ли новая версия…", detail="", progress=None)
        have = os.path.isfile(os.path.join(game, "server.py"))
        if env("ZNS_NO_UPDATE"):
            st.step("update", "ok", "проверка выключена")
            st.step("download", "skip", "")
            return
        if os.path.isdir(os.path.join(game, ".git")) and shutil.which("git"):
            return self.update_git(game)
        new = latest_version()
        old = local_version(game)
        log(f"Версия на компьютере: {old or '—'}, на GitHub: {new or 'неизвестна'}")
        if have and new and new == old:
            st.step("update", "ok", "у вас самая новая версия")
            st.step("download", "skip", "не нужно")
            st.set(version=new[:7])
            return
        st.step("update", "ok", "есть новая версия" if have else "игра ещё не скачана")
        try:
            self.download(game, cfg, new)
        except Exception as e:  # noqa: BLE001
            log("Скачивание не удалось: " + "".join(traceback.format_exception(type(e), e, e.__traceback__)))
            if have:
                st.step("download", "fail", "нет интернета? — запускаю уже скачанную версию")
                return
            raise RuntimeError("Не получилось скачать игру. Проверьте интернет и нажмите «Попробовать ещё раз».") from e
        if new:
            with open(os.path.join(game, ".zns-version"), "w", encoding="ascii") as fh:
                fh.write(new + "\n")
            st.set(version=new[:7])

    def update_git(self, game):
        st = self.status

        def git(*a):
            r = subprocess.run(["git", *a], cwd=game, capture_output=True, text=True, timeout=600,
                               creationflags=NO_WINDOW if IS_WIN else 0)
            log(f"git {' '.join(a)} → {r.returncode} {(r.stderr or '').strip()[-300:]}")
            return r.returncode == 0

        st.step("update", "ok", "через Git")
        st.step("download", "run", "", title="Обновляю игру…")
        git("reset", "-q", "--hard")
        if git("fetch", "origin", BRANCH):
            git("checkout", "-q", "-B", BRANCH, "FETCH_HEAD")
            git("reset", "-q", "--hard", "FETCH_HEAD")
            st.step("download", "ok", "готово")
        else:
            st.step("download", "fail", "нет интернета? — запускаю уже скачанную версию")

    def download(self, game, cfg, sha=""):
        st = self.status
        st.step("download", "run", "", title="Скачиваю новую версию игры…", progress=0)
        tmp = os.path.join(self.home, "download")
        shutil.rmtree(tmp, ignore_errors=True)
        os.makedirs(tmp, exist_ok=True)
        zpath = os.path.join(tmp, "game.zip")
        req = urllib.request.Request(zip_url(sha), headers={"User-Agent": "Volshebstvo-launcher"})
        guess = int(cfg.get("zip_size") or 150 * 1024 * 1024)
        got = 0
        with urllib.request.urlopen(req, timeout=60) as r, open(zpath, "wb") as out:
            total = int(r.headers.get("Content-Length") or 0)
            size = total or guess
            last = 0.0
            while True:
                chunk = r.read(256 * 1024)
                if not chunk:
                    break
                out.write(chunk)
                got += len(chunk)
                if time.time() - last > 0.2:
                    last = time.time()
                    mb, of = got / 1048576, size / 1048576
                    st.set(progress=min(0.97, got / size) * 0.85,
                           detail=f"Скачано {mb:.0f} из {'' if total else '~'}{of:.0f} МБ")
        cfg = load_config(self.home)
        cfg["zip_size"] = got
        save_config(cfg, self.home)
        st.set(title="Распаковываю…", detail="", progress=0.86)
        xdir = os.path.join(tmp, "x")
        with zipfile.ZipFile(zpath) as z:
            names = z.namelist()
            for i, n in enumerate(names):
                z.extract(n, xdir)
                if i % 50 == 0:
                    st.set(progress=0.86 + 0.08 * i / max(1, len(names)))
        tops = [os.path.join(xdir, d) for d in os.listdir(xdir)]
        src = tops[0] if len(tops) == 1 and os.path.isdir(tops[0]) else xdir
        if not os.path.isfile(os.path.join(src, "server.py")):
            raise RuntimeError("архив без игры")
        st.set(title="Кладу файлы на место…", progress=0.95)
        copy_over(src, game)
        shutil.rmtree(tmp, ignore_errors=True)
        st.step("download", "ok", f"{got / 1048576:.0f} МБ", progress=1)

    def camera(self, game):
        st = self.status
        st.step("camera", "run", "", title="Готовлю нейросеть камеры…", detail="", progress=None)
        import importlib.util
        ready = all(importlib.util.find_spec(m) is not None for m in ("mediapipe", "cv2"))
        if ready:
            st.step("camera", "ok", "отдельная программа готова")
        elif env("ZNS_NO_PIP"):
            st.step("camera", "skip", "работает в браузере")
        else:
            st.step("camera", "ok", "ставится в фоне (один раз) — пока работает в браузере")

    def start_game(self, game):
        st = self.status
        st.step("start", "run", "", title="Запускаю игру…")
        os.environ["ZNS_LAUNCHER"] = "1"
        os.environ["ZNS_LOG_FILES"] = os.pathsep.join(self.log_files)
        if game not in sys.path:
            sys.path.insert(0, game)
        import importlib
        mod = importlib.import_module("server")  # chdir()s into the game folder
        self.game = mod
        if hasattr(mod, "ensure_pose_native"):
            threading.Thread(target=mod.ensure_pose_native, daemon=True).start()
        self.httpd.RequestHandlerClass = make_game_handler(self, mod.GameRequestHandler)
        log(f"Игра запущена: http://localhost:{self.port}")
        st.step("start", "ok", "", title="Открываю игру…", done=True, progress=1)

    # ---------- folder screen
    def choose_folder(self, chosen):
        target = resolve_install_dir(chosen)
        why = check_writable(target)
        if why:
            self.status.set(folder_error=why)
            return False
        cfg = load_config(self.home)
        cfg["install_dir"] = target
        save_config(cfg, self.home)
        log(f"Папка игры: {target}")
        self.status.set(need_folder=False, folder_error="")
        self.start_work()
        return True

    def browse(self, start):
        """The system folder picker (tkinter comes with Python on Windows)."""
        if not self.browse_lock.acquire(blocking=False):
            return ""
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            p = filedialog.askdirectory(initialdir=start if os.path.isdir(start) else os.path.expanduser("~"),
                                        title="Куда установить игру?", mustexist=False, parent=root)
            root.destroy()
            return os.path.normpath(p) if p else ""
        except Exception as e:  # noqa: BLE001
            log(f"  (окно выбора папки не открылось: {e})")
            return ""
        finally:
            self.browse_lock.release()


def read_tail(path, limit=200_000):
    try:
        with open(path, "rb") as fh:
            fh.seek(0, 2)
            n = fh.tell()
            fh.seek(max(0, n - limit))
            return fh.read().decode("utf-8", "replace")
    except OSError:
        return ""


class LauncherHandler(http.server.BaseHTTPRequestHandler):
    launcher = None  # set by make_handler

    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(min(n, 65536)) or b"{}")
        except ValueError:
            return {}

    def _alive(self):
        """A window holds this open while it lives; when no window is open the launcher quits."""
        L = self.launcher
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        L.page_open()
        try:
            while True:
                self.wfile.write(b": ping\n\n")
                self.wfile.flush()
                time.sleep(5)
        except OSError:
            pass
        finally:
            L.page_closed()

    def launcher_get(self, path):
        L = self.launcher
        if path in ("/__launcher/alive", "/api/alive"):
            self._alive()
            return True
        if path == "/__launcher/status":
            self._send(200, L.status.snapshot())
            return True
        if path == "/__launcher/ping":
            self._send(200, {"app": APP_NAME, "game": bool(L.game)})
            return True
        if path == "/__launcher/handover":
            # started again (the icon) while no window is open — the game was just closed:
            # this one steps aside, the new start checks for a new version and runs it
            with L.pages_lock:
                ok = L.pages <= 0 and not L.work_lock.locked()
            self._send(200, {"ok": ok})
            if ok:
                log("Запущено заново — уступаю место (новый запуск проверит обновления).")
                threading.Thread(target=L.httpd.shutdown, daemon=True).start()
            return True
        if path == "/__launcher/log":
            self._send(200, read_tail(L.log_files[0]) if L.log_files else "", "text/plain; charset=utf-8")
            return True
        if path in ("/__launcher/logo.png", "/favicon.ico"):
            name = "logo.png" if path.endswith(".png") else "logo.ico"
            for d in (os.path.join(L.home, "launcher"), HERE):
                p = os.path.join(d, name)
                if os.path.isfile(p):
                    with open(p, "rb") as fh:
                        self._send(200, fh.read(), "image/png" if name.endswith("png") else "image/x-icon")
                    return True
            if path == "/__launcher/logo.png":
                self._send(404, {"error": "no logo"})
                return True
        return False

    def launcher_post(self, path):
        L = self.launcher
        if path == "/__launcher/folder":
            ok = L.choose_folder(str(self._body().get("path") or ""))
            self._send(200, {"ok": ok, "status": L.status.snapshot()})
            return True
        if path == "/__launcher/browse":
            start = str(self._body().get("path") or "")
            self._send(200, {"path": L.browse(start)})
            return True
        if path == "/__launcher/retry":
            L.start_work()
            self._send(200, {"ok": True})
            return True
        return False

    def do_GET(self):
        path = urlparse(self.path).path
        if self.launcher_get(path):
            return
        if path in ("/", "/index.html") or not self.launcher.game:
            with open(os.path.join(HERE, "loading.html"), "rb") as fh:
                return self._send(200, fh.read(), "text/html; charset=utf-8")
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if not self.launcher_post(urlparse(self.path).path):
            self._send(404, {"error": "not found"})


def make_handler(launcher):
    return type("BoundLauncherHandler", (LauncherHandler,), {"launcher": launcher})


def make_game_handler(launcher, game_handler):
    """The game's own handler from now on — but the launcher's addresses keep working
    (the loading screen's last look at the status, and the «window is open» line)."""

    class Combined(game_handler):
        def do_GET(self):
            path = urlparse(self.path).path
            if path.startswith("/__launcher/") or path == "/api/alive":
                return LauncherHandler.launcher_get(self, path)
            return super().do_GET()

        def do_POST(self):
            path = urlparse(self.path).path
            if path.startswith("/__launcher/"):
                if not LauncherHandler.launcher_post(self, path):
                    self.send_error(404)
                return
            return super().do_POST()

    for name in ("_send", "_body", "_alive"):
        setattr(Combined, name, getattr(LauncherHandler, name))
    Combined.launcher = launcher
    return Combined


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    request_queue_size = 128  # (the game's ~150 files are asked for at once)
    allow_reuse_address = not IS_WIN  # (as server.py: never share a busy port on Windows)

    def handle_error(self, request, client_address):
        if isinstance(sys.exc_info()[1], (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


def game_already_running(port):
    """Is our game (or its launcher) already answering on this port?"""
    for p in ("/__launcher/ping", "/api/version"):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}{p}", timeout=2) as r:
                json.loads(r.read())
                return True
        except Exception:  # noqa: BLE001
            pass
    return False


def handover(port):
    """Ask a launcher still running on this port (no window open) to step aside. True: it did."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/__launcher/handover", timeout=3) as r:
            return bool(json.loads(r.read()).get("ok"))
    except Exception:  # noqa: BLE001
        return False


def main():
    L = Launcher()
    cur, prev = start_log(os.path.join(L.home, "logs"), "launcher")
    L.log_files = [cur, prev]
    log(f"{APP_NAME}: запуск ({sys.executable}, Python {sys.version.split()[0]})")
    base = int(env("ZNS_PORT", "8000"))
    for port in range(base, base + 20):
        try:
            # (only this computer: no firewall question; the browser is on this computer anyway)
            L.httpd = Server(("127.0.0.1", port), make_handler(L))
            L.port = port
            break
        except OSError:
            if game_already_running(port):
                if handover(port):
                    # (the old one is closing: take its place, and the update check runs)
                    for _ in range(40):
                        time.sleep(0.25)
                        try:
                            L.httpd = Server(("127.0.0.1", port), make_handler(L))
                            L.port = port
                            break
                        except OSError:
                            pass
                    if L.httpd:
                        break
                log(f"Игра уже запущена (порт {port}) — открываю ещё одно окно.")
                open_window(f"http://localhost:{port}/")
                return
            log(f"  Порт {port} занят, пробую следующий...")
    if not L.httpd:
        log("Нет свободного порта — игра не запущена.")
        return
    cfg = load_config(L.home)
    game = cfg.get("install_dir")
    if game:
        L.start_work()
    else:
        L.status.set(need_folder=True, default_folder=default_install_dir(), title="Куда установить игру?")
        L.status.step("folder", "run", "")
    threading.Thread(target=L.watchdog, daemon=True).start()
    open_window(f"http://localhost:{L.port}/")
    try:
        L.httpd.serve_forever(poll_interval=0.3)
    finally:
        L.httpd.server_close()
        log("Готово, до встречи!")


if __name__ == "__main__":
    main()
