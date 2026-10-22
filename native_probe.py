"""
native_probe.py — can the camera network's program (MediaPipe for Python, pose_native.py) run on this
computer? Checked in a separate process before it is ever loaded into the game's own.

Why (the author's friend, Windows 11): «pythonw.exe - Bad Image … mediapipe\\tasks\\c\\libmediapipe.dll is
either not designed to run on Windows or contains an error … 0xc0e90002». 0xc0e90002 is Windows' code
integrity refusing a file: Smart App Control blocks programs and libraries that are not signed / not
known to Microsoft (MediaPipe's library is not signed). Reinstalling does not help then. Windows also
showed that refusal as a window that stopped the game's program until it was closed.

Now:
  - Windows never shows such windows for the game's program (quiet_errors: a library that cannot be
    loaded is simply an error, written to the log);
  - MediaPipe is tried first in a process of its own (probe); only when it works there is it used by
    the game; otherwise the camera works through the browser's network (as before MediaPipe was there)
    and the reason is in the log in plain words;
  - a broken / half installation is reinstalled cleanly once; a missing Microsoft Visual C++ runtime is
    installed once; Smart App Control and 32-bit Python are only explained (nothing to repair).

Only the Python standard library.
"""

import os
import struct
import subprocess
import sys
import threading
import time

SEM_FAILCRITICALERRORS, SEM_NOOPENFILEERRORBOX = 0x0001, 0x8000
CREATE_NO_WINDOW = 0x08000000
VC_REDIST_URL = "https://aka.ms/vs/17/release/vc_redist.x64.exe"  # (Microsoft's permanent link to the latest x64 runtime)

# what the probe process does: the same imports the camera program needs, Windows' error windows off
PROBE_CODE = (
    "import sys\n"
    "if sys.platform == 'win32':\n"
    "    import ctypes; k = ctypes.windll.kernel32; k.SetErrorMode(k.SetErrorMode(0) | 0x8001)\n"
    "import cv2, mediapipe\n"
    "from mediapipe.tasks.python import vision\n"
    "print('ok')\n"
)

# plain words for the player / the log (the game works in every case: the camera goes through the browser)
WHY = {
    "sac": "Windows (функция «Интеллектуальное управление приложениями» / Smart App Control) не разрешил "
           "запустить программу камеры MediaPipe. Игра работает, камера — через браузер (чуть медленнее).",
    "bits": "Установлен 32-битный Python — программе камеры нужен 64-битный. Игра работает, камера — через браузер.",
    "vcredist": "На компьютере нет «Microsoft Visual C++» (нужен программе камеры). Игра работает, камера — через браузер.",
    "broken": "Программа камеры MediaPipe установилась с ошибкой. Игра работает, камера — через браузер.",
    "missing": "Программа камеры MediaPipe ещё не установлена. Игра работает, камера — через браузер.",
}

_state = {"result": None, "running": False, "done": threading.Event()}


def quiet_errors():
    """Windows: a library that cannot be loaded is an error for the program, never a window that stops
    it until someone presses OK (inherited by the processes it starts)."""
    if sys.platform != "win32":
        return False
    try:
        import ctypes
        k = ctypes.windll.kernel32
        k.SetErrorMode(k.SetErrorMode(0) | SEM_FAILCRITICALERRORS | SEM_NOOPENFILEERRORBOX)
        return True
    except Exception:  # noqa: BLE001
        return False


def is_64bit():
    return struct.calcsize("P") == 8


def sac_state():
    """Smart App Control: 0 off, 1 on, 2 evaluation, None unknown / not Windows 11."""
    if sys.platform != "win32":
        return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\CI\Policy") as k:
            return int(winreg.QueryValueEx(k, "VerifiedAndReputablePolicyState")[0])
    except Exception:  # noqa: BLE001
        return None


def vc_runtime_ok():
    """Microsoft Visual C++ runtime (x64) is there (its DLLs in System32)."""
    if sys.platform != "win32":
        return True
    sysdir = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32")
    return all(os.path.isfile(os.path.join(sysdir, f)) for f in ("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll"))


def classify(ok, text, sac, bits64, vc_ok, installed=True):
    """(pure) Why the camera program cannot run: None (it can), «missing», «bits», «sac», «vcredist»,
    «broken». `text`: what the probe process said."""
    if ok:
        return None
    if not installed:
        return "missing"
    if not bits64:
        return "bits"
    t = (text or "").lower()
    blocked = "0xc0e90002" in t or "bad image" in t or "not designed to run on windows" in t \
        or "application control policy" in t or "winerror 4551" in t  # (ERROR_SYSTEM_INTEGRITY_POLICY_VIOLATION)
    if blocked or (sac in (1, 2) and ("dll" in t or "winerror" in t or "load" in t)):
        return "sac"
    if not vc_ok:
        return "vcredist"
    return "broken"


def probe(timeout=120.0, python=None):
    """Try MediaPipe in a process of its own: (ok, what it said)."""
    try:
        r = subprocess.run([python or sys.executable, "-c", PROBE_CODE], capture_output=True, text=True,
                           timeout=timeout, creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        out = ((r.stdout or "") + "\n" + (r.stderr or "")).strip()
        return r.returncode == 0 and "ok" in out.splitlines(), out
    except subprocess.TimeoutExpired:
        return False, "проверка не закончилась вовремя"
    except Exception as e:  # noqa: BLE001
        return False, f"{type(e).__name__}: {e}"


def installed():
    import importlib.util
    try:
        return importlib.util.find_spec("mediapipe") is not None and importlib.util.find_spec("cv2") is not None
    except Exception:  # noqa: BLE001
        return False


def check(log=print):
    """Probe now (once per run; again after a repair: recheck()). Returns the reason key or None."""
    _state["running"] = True
    _state["done"].clear()
    try:
        t0 = time.time()
        have = installed()
        ok, text = probe() if have else (False, "")
        why = classify(ok, text, sac_state(), is_64bit(), vc_runtime_ok(), have)
        _state["result"] = (why, text)
        tail = " | ".join((text or "").splitlines()[-3:])
        log(f"  Камера (MediaPipe для Python): {'работает' if why is None else why} — проверка {time.time() - t0:.1f} с"
            + (f"; Smart App Control: {sac_state()}, 64 бит: {is_64bit()}, Visual C++: {vc_runtime_ok()}; {tail}" if why not in (None, "missing") else ""))
        return why
    finally:
        _state["running"] = False
        _state["done"].set()


def result(wait=0.0):
    """(why, text) of the last check; (\"checking\", \"\") while it runs (waits up to `wait` s); None — never checked."""
    if _state["running"]:
        _state["done"].wait(wait)
        if _state["running"]:
            return ("checking", "")
    return _state["result"]


def message(why):
    return WHY.get(why, "")


# ------------------------------------------------------------------ repairs (each at most once on a computer)

def _mark_file():
    base = os.environ.get("ZNS_LAUNCHER_HOME") or (os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "Volshebstvo")
                                                   if sys.platform == "win32" else os.path.join(os.path.expanduser("~"), ".volshebstvo"))
    return os.path.join(base, "camera-repair.txt")


def _tried(what):
    try:
        with open(_mark_file(), encoding="utf-8") as fh:
            return what in fh.read().split()
    except OSError:
        return False


def _remember(what):
    try:
        os.makedirs(os.path.dirname(_mark_file()), exist_ok=True)
        with open(_mark_file(), "a", encoding="utf-8") as fh:
            fh.write(what + "\n")
    except OSError:
        pass


def repair(why, log=print):
    """Try to fix what can be fixed (once each). True when something was done (check again)."""
    if why == "broken" and not _tried("reinstall"):
        _remember("reinstall")
        log("  Камера: переустанавливаю MediaPipe начисто (один раз)…")
        r = subprocess.run([sys.executable, "-m", "pip", "install", "--user", "--disable-pip-version-check", "-q",
                            "--force-reinstall", "--no-cache-dir", "--only-binary", ":all:", "mediapipe"],
                           capture_output=True, text=True, timeout=1800,
                           creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        log(f"  Камера: переустановка — {'готово' if r.returncode == 0 else 'не вышло: ' + (r.stderr or '').strip()[-300:]}")
        return r.returncode == 0
    if why == "vcredist" and sys.platform == "win32" and not _tried("vcredist"):
        _remember("vcredist")
        log("  Камера: ставлю Microsoft Visual C++ (один раз; Windows может спросить разрешение)…")
        try:
            import urllib.request
            exe = os.path.join(os.path.dirname(_mark_file()), "vc_redist.x64.exe")
            urllib.request.urlretrieve(VC_REDIST_URL, exe)
            r = subprocess.run([exe, "/install", "/passive", "/norestart"], timeout=900)
            log(f"  Камера: Visual C++ — код {r.returncode} (0 или 3010 — поставлен)")
            return r.returncode in (0, 1638, 3010)  # (1638: a newer one is already there)
        except Exception as e:  # noqa: BLE001
            log(f"  Камера: Visual C++ не поставлен: {e}")
            return False
    return False
