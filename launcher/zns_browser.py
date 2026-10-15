"""
zns_browser.py — the game's own program window: the browser engine (Chrome, else Edge) started as a
process of its OWN for the game, not as one more window of the user's browser.

Why (docs/plans/desktop.md, stage 1): Chrome reads its command line only when its process starts.
When the user's Chrome was already open, the game's window joined that process and every flag was
lost — the strong graphics card, no throttling of the game when the window is covered, no GPU
blocklist — and the game shared the GPU process and the main threads with the user's tabs, videos and
extensions. With a folder of its own (--user-data-dir) the game always gets a fresh process of the
engine: its flags always hold, no extensions, nothing else draws on its GPU process.

The saves (worlds in IndexedDB, the hero and the settings in localStorage) lived in the user's browser
profile. They are carried over once, by the game itself: the game page in the new window asks the
server (/api/profile/transfer); the server opens profile-export.html once in the OLD profile (a window
off the screen that closes itself), which sends everything over; the new window takes it (nothing is
deleted in the old profile: going back works as before). ZNS_SHARED_PROFILE=1 — the old way.

Used by the launcher (zns_launcher.open_window) and by server.py (open_game_window). Standard library only.
"""

import json
import os
import subprocess
import sys
import time

APP_QUERY = "app=own"  # (the page knows it is in the game's own window: the save transfer runs there only)
TRANSFER_FILE = "profile-transfer.json"
TRANSFER_STATE = "profile-transfer-state.json"
MAX_TRIES = 3  # the old profile is asked at most so many times (it may have nothing, or no browser)


def home_dir():
    """The launcher's own folder (as zns_launcher.home_dir): the game's browser profile lives in it."""
    h = os.environ.get("ZNS_LAUNCHER_HOME")
    if h:
        return h
    if sys.platform == "win32":
        return os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "Volshebstvo")
    return os.path.join(os.path.expanduser("~"), ".volshebstvo")


def own_profile_on():
    return not os.environ.get("ZNS_SHARED_PROFILE")


def profile_dir(exe, home=None):
    """A folder per engine (Chrome's and Edge's profiles must never be mixed)."""
    name = "edge" if "msedge" in os.path.basename(exe or "").lower() else "chrome"
    return os.path.join(home or home_dir(), "browser", name)


def with_app_query(url):
    if not own_profile_on() or APP_QUERY in url:
        return url
    return url + ("&" if "?" in url else "?") + APP_QUERY


# the flags of the game's window (each one holds now: the engine's process is the game's own)
GAME_FLAGS = (
    "--force_high_performance_gpu", "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization", "--enable-zero-copy",
    # never slowed down when the window is covered by another one or is not in front
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    # the camera network's page (ai.html) gets a process of its own — it never stops the game
    "--site-per-process",
    "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--no-default-browser-check",
)
# only in the game's own profile (in the user's they would change their browser)
OWN_FLAGS = ("--disable-extensions", "--disable-sync", "--disable-default-apps")
# (Chrome takes only the last --disable-features: one list)
FEATURES_OFF = ("CalculateNativeWinOcclusion",)  # (a covered window is treated as hidden and stops drawing)
OWN_FEATURES_OFF = ("Translate", "MediaRouter", "OptimizationHints")


def window_cmd(exe, url, own=None, home=None):
    """The command line of the game's window (opened off the screen: the page cuts the frame away
    and brings it to the middle — zns_window)."""
    own = own_profile_on() if own is None else own
    cmd, flags, off = [exe], list(GAME_FLAGS), list(FEATURES_OFF)
    if own:
        d = profile_dir(exe, home)
        os.makedirs(d, exist_ok=True)
        cmd.append(f"--user-data-dir={d}")
        flags += OWN_FLAGS
        off += OWN_FEATURES_OFF
        url = with_app_query(url)
    flags.append("--disable-features=" + ",".join(off))
    return cmd + [f"--app={url}", "--window-size=1180,780", "--window-position=-6000,-6000"] + flags


def popen(cmd):
    kw = {"creationflags": 0x08000000} if sys.platform == "win32" else {}  # (CREATE_NO_WINDOW)
    return subprocess.Popen(cmd, **kw)


# ------------------------------------------------------------------ the saves' transfer (server side)

def _read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    os.replace(tmp, path)


class Transfer:
    """The saves carried over from the user's browser profile into the game's own (one per server)."""

    def __init__(self, home=None, browsers=None):
        self.home = home or home_dir()
        self.browsers = browsers  # () -> [exe]
        self.asked_at = 0.0

    @property
    def file(self):
        return os.path.join(self.home, TRANSFER_FILE)

    @property
    def state_file(self):
        return os.path.join(self.home, TRANSFER_STATE)

    def status(self, port):
        """What the new window gets: the saves, or «wait», or «nothing to carry»."""
        if os.path.isfile(self.file):
            return {"state": "ready", "data": _read_json(self.file, None)}
        st = _read_json(self.state_file, {})
        if time.time() - self.asked_at < 20:
            return {"state": "pending"}
        if st.get("tries", 0) >= MAX_TRIES or not own_profile_on():
            return {"state": "none"}
        exe = next(iter(self.browsers() if self.browsers else []), None)
        if not exe:
            return {"state": "none"}
        st["tries"] = st.get("tries", 0) + 1
        _write_json(self.state_file, st)
        self.asked_at = time.time()
        # the user's own profile (no --user-data-dir), exactly as the game's window opened before;
        # off the screen and tiny; it closes itself when the saves are sent
        try:
            popen([exe, f"--app=http://localhost:{port}/profile-export.html", "--window-size=200,100",
                   "--window-position=-32000,-32000", "--no-first-run", "--no-default-browser-check"])
        except OSError:
            return {"state": "none"}
        return {"state": "pending"}

    def receive(self, data):
        """profile-export.html sent the old profile's saves."""
        if not isinstance(data, dict):
            raise ValueError("bad saves")
        data["at"] = int(time.time() * 1000)
        _write_json(self.file, data)
        self.asked_at = 0.0
        return {"ok": True}
