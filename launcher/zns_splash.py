"""
zns_splash.py — the launcher's own loading picture, seen the moment the game is started (Windows).

Why (the author: «3–5 seconds just a grey screen»): the browser's window takes a few seconds before it
has drawn anything (its process and its graphics start first; until then the window is grey). So the
launcher shows at once, by itself, a window of exactly the menu window's size and place, painted as the
loading screen (dark sky, stars, the game's name); it goes away the moment the game's window is seen
(zns_window.on_shown) — or after `seconds` anyway. Only the Python standard library (tkinter).
"""

import os
import random
import sys
import threading
import time

BG, GLOW, GOLD, DIM = "#0b0820", "#1d1340", "#f5c84c", "#a79fcf"
TITLE = "Загрузка игры"  # (never the game's title: zns_window finds the game's window by it)
MENU = (1180, 780)  # CSS px: the menu window (WindowControls.MENU_WINDOW)


def splash_rect(work, dpr, menu=MENU):
    """Where the menu window will be (zns_window.clip_layout): its size in real pixels, in the middle of
    the work area — (x, y, w, h)."""
    al, at, ar, ab = work
    w = max(1, min(round(menu[0] * dpr), ar - al))
    h = max(1, min(round(menu[1] * dpr), ab - at))
    return al + (ar - al - w) // 2, at + (ab - at - h) // 2, w, h


def _mix(a, b, k):
    a, b = int(a[1:], 16), int(b[1:], 16)
    c = [round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k) for s in (16, 8, 0)]
    return "#%02x%02x%02x" % tuple(c)


def _monitor_under_cursor():
    """(work area, dpr) of the monitor the mouse is on (the game's window opens there), real pixels."""
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    try:
        user32.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
        if not user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4)):
            user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-3))
    except Exception:  # noqa: BLE001
        pass

    class MONITORINFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT), ("rcWork", wintypes.RECT), ("dwFlags", wintypes.DWORD)]

    p = wintypes.POINT()
    user32.GetCursorPos(ctypes.byref(p))
    user32.MonitorFromPoint.restype = ctypes.c_void_p
    mon = user32.MonitorFromPoint(p, 2)
    mi = MONITORINFO()
    mi.cbSize = ctypes.sizeof(MONITORINFO)
    user32.GetMonitorInfoW(ctypes.c_void_p(mon), ctypes.byref(mi))
    dpr = 1.0
    try:
        x, y = ctypes.c_uint(), ctypes.c_uint()
        if ctypes.windll.shcore.GetDpiForMonitor(ctypes.c_void_p(mon), 0, ctypes.byref(x), ctypes.byref(y)) == 0:
            dpr = x.value / 96.0
    except Exception:  # noqa: BLE001
        pass
    w = mi.rcWork
    return (w.left, w.top, w.right, w.bottom), dpr


class Splash:
    def __init__(self, seconds=25.0, logo=None, log=print):
        self.seconds, self.logo, self.log = seconds, logo, log
        self._close_at = None
        self.started = time.time()

    def close(self, delay=0.15):
        """(any thread) Gone in `delay` s — the game's window is shown above it first: no gap between."""
        at = time.time() + delay
        self._close_at = at if self._close_at is None else min(self._close_at, at)

    def _run(self):
        try:
            import ctypes
            import tkinter as tk
            work, dpr = _monitor_under_cursor()
            x, y, w, h = splash_rect(work, dpr)
            root = tk.Tk()
            root.withdraw()  # (never seen half made)
            root.overrideredirect(True)
            root.configure(bg=BG)
            root.geometry(f"{w}x{h}+{x}+{y}")
            root.title(TITLE)
            c = tk.Canvas(root, width=w, height=h, bg=BG, highlightthickness=0, bd=0)
            c.pack(fill="both", expand=True)
            # the loading screen's sky: a soft glow in the middle, the stars
            cx, cy = w / 2, h * 0.35
            for i in range(14, 0, -1):
                k = i / 14
                c.create_oval(cx - w * 0.75 * k, cy - h * 0.8 * k, cx + w * 0.75 * k, cy + h * 0.8 * k,
                              fill=_mix(GLOW, BG, k), outline="")
            rnd = random.Random(7)
            for _ in range(90):
                sx, sy, r = rnd.random() * w, rnd.random() * h, max(1, round(dpr))
                c.create_oval(sx, sy, sx + r, sy + r, fill=_mix(BG, "#ffffff", 0.25 + rnd.random() * 0.5), outline="")
            img = None
            if self.logo and os.path.isfile(self.logo):
                try:
                    img = tk.PhotoImage(file=self.logo)
                    if img.width() > 180 * dpr:
                        img = img.subsample(max(1, round(img.width() / (132 * dpr))))
                    c.create_image(w / 2, h / 2 - 110 * dpr, image=img)
                except Exception:  # noqa: BLE001
                    img = None
            c.create_text(w / 2, h / 2 + 10 * dpr, text="Волшебство только начинается", fill=GOLD,
                          font=("Georgia", -round(30 * dpr), "bold"))
            c.create_text(w / 2, h / 2 + 52 * dpr, text="Готовлю игру…", fill=DIM, font=("Segoe UI", -round(17 * dpr)))
            root.update_idletasks()
            # the menu window's rounded corners (zns_window.corner_radius)
            try:
                user32 = ctypes.windll.user32
                user32.GetAncestor.restype = ctypes.c_void_p
                hwnd = user32.GetAncestor(ctypes.c_void_p(root.winfo_id()), 2) or root.winfo_id()
                gdi32 = ctypes.windll.gdi32
                gdi32.CreateRoundRectRgn.restype = ctypes.c_void_p
                rad = round(12 * dpr)
                user32.SetWindowRgn(ctypes.c_void_p(hwnd), ctypes.c_void_p(gdi32.CreateRoundRectRgn(0, 0, w + 1, h + 1, 2 * rad, 2 * rad)), True)
            except Exception:  # noqa: BLE001
                pass
            root.deiconify()
            root.lift()
            self.log(f"[заставка] показана через {time.time() - self.started:.2f} с: {w}×{h} в ({x}, {y}), масштаб {dpr}, рабочая область {work}")

            def tick():
                now = time.time()
                if (self._close_at is not None and now >= self._close_at) or now - self.started > self.seconds:
                    self.log(f"[заставка] убрана через {now - self.started:.2f} с")
                    root.destroy()
                    return
                root.after(30, tick)

            root.after(30, tick)
            root.mainloop()
            del img
        except Exception as e:  # noqa: BLE001  (no tkinter: simply no loading picture)
            self.log(f"[заставка] не показана: {e!r}")


class Handle:
    """The loading picture's own process (never a thread of the launcher: tkinter in a second thread
    could bring the whole launcher down — «Tcl_AsyncDelete … wrong thread» — and the game's window was
    left with «localhost не позволяет установить соединение»)."""

    def __init__(self, proc, log):
        self.proc, self.log, self.started = proc, log, time.time()

    def close(self, delay=0.15):
        """(any thread) Gone in `delay` s — the game's window is shown above it first: no gap between."""
        def later():
            try:
                if self.proc.poll() is None:
                    self.proc.terminate()
                    self.log(f"[заставка] убрана через {time.time() - self.started:.2f} с")
            except Exception:  # noqa: BLE001
                pass
        t = threading.Timer(delay, later)
        t.daemon = True
        t.start()


def show(seconds=25.0, logo=None, log=print):
    """Start the loading picture in a process of its own. Returns a Handle (`.close()`), or None."""
    if sys.platform != "win32" or os.environ.get("ZNS_NO_SPLASH"):
        return None
    import subprocess
    exe = sys.executable or "pythonw"
    w = os.path.join(os.path.dirname(exe), "pythonw.exe")
    exe = w if os.path.isfile(w) else exe  # (no black window)
    try:
        proc = subprocess.Popen([exe, os.path.abspath(__file__), str(seconds), logo or ""],
                                creationflags=0x08000000, close_fds=True)  # (CREATE_NO_WINDOW)
    except OSError as e:
        log(f"[заставка] не запущена: {e}")
        return None
    log("[заставка] запущена (свой процесс)")
    return Handle(proc, log)


if __name__ == "__main__":
    # (the picture's own process: tkinter in its main thread)
    Splash(float(sys.argv[1]) if len(sys.argv) > 1 else 25.0, (sys.argv[2] if len(sys.argv) > 2 else "") or None,
           log=lambda m: None)._run()
