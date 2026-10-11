"""
zns_window.py — the game's window on Windows: no Windows frame, the menu's size (or the whole
screen for the game), moved by dragging the window; minimised and closed by the game's own buttons.

Used by the launcher (its loading screen) and by server.py (the game) for POST /api/window.
Chrome draws the title bar of an app window itself (taking the WS_CAPTION style away does not
remove it), so the window is CLIPPED to the page (SetWindowRgn): everything above and around the
page — the title bar and the borders — is cut away. The page tells its size in CSS pixels and
its devicePixelRatio; the frame's size is measured from the window.

Real pixels everywhere: every call makes its thread per-monitor DPI aware first (at 125 % / 150 %
a DPI-unaware process gets scaled window sizes while DWM gives real ones — the page then went under
the taskbar and a strip of the title bar showed). The game's full screen covers the whole monitor
(the taskbar too: the window stays on top while it is in front); the menu stays inside the work
area. After every move the real window is measured again and the cut follows it, so nothing of the
page can ever be outside the visible area.

Only the window whose title is exactly the game's name is ever touched (the app window; a
browser with tabs has « - Google Chrome» in its title), and only for requests from this computer.
Only the Python standard library.
"""

import sys

GAME_TITLE = "Волшебство только начинается"
ACTIONS = ("minimize", "close", "frameless", "fullscreen", "moveby", "focus", "blur")

SWP_NOSIZE, SWP_NOMOVE, SWP_NOZORDER, SWP_NOACTIVATE = 0x0001, 0x0002, 0x0004, 0x0010
HWND_TOPMOST, HWND_NOTOPMOST = -1, -2

_full = {"on": False}  # (the game is in full screen: kept on top while in front)


def _user32():
    import ctypes
    user32 = ctypes.windll.user32
    for fn in ("GetForegroundWindow", "MonitorFromWindow"):
        getattr(user32, fn).restype = ctypes.c_void_p  # (64-bit handles: never through a C int)
    # real pixels in THIS thread whatever the process is (a process-wide setting can be refused
    # once windows exist — the launcher's folder picker — and then sizes were scaled)
    try:
        user32.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
        if not user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4)):  # PER_MONITOR_AWARE_V2
            user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-3))  # PER_MONITOR_AWARE
    except Exception:  # noqa: BLE001  (Windows older than 10 1607)
        try:
            user32.SetProcessDPIAware()
        except Exception:  # noqa: BLE001
            pass
    return user32


def find_game_window(user32):
    """The game's app window (its title is exactly the game's name); the one in front first."""
    import ctypes
    found = []
    proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    def cb(h, _):
        if h and user32.IsWindowVisible(ctypes.c_void_p(h)):
            buf = ctypes.create_unicode_buffer(512)
            user32.GetWindowTextW(ctypes.c_void_p(h), buf, 512)
            if buf.value == GAME_TITLE:
                found.append(h)
        return True

    user32.EnumWindows(proc(cb), 0)
    fg = user32.GetForegroundWindow()
    return fg if fg in found else (found[0] if found else None)


def frame_offsets(win, vis, inner_w, inner_h):
    """Where the page is inside the window (constant whatever the window's size): (left, top,
    over_w, over_h) — the page's top-left in window coordinates and how much bigger the window is."""
    wl, wt, wr, wb = win
    vl, vt, vr, vb = vis
    side = max(0, round(((vr - vl) - inner_w) / 2))  # (the visible border left and right: 0–1 px)
    left = (vl - wl) + side
    # the page sits at the bottom of the visible frame: the frame above it is the title bar
    top = (vb - wt) - side - inner_h
    return left, top, (wr - wl) - inner_w, (wb - wt) - inner_h


def clip_layout(win, vis, inner_w, inner_h, target_w, target_h, area):
    """Pure geometry (tested anywhere). win: the window rect, vis: its visible frame (DWM),
    inner_*: the page's size now, target_*: the page's size wanted (all real pixels), area: where it
    must fit (the work area, or the monitor for full screen) — rects are (left, top, right, bottom).
    Returns (x, y, w, h, region): where to put the window and the part of it to keep (in window
    coordinates) — exactly the page, never larger than the area, in its middle."""
    left, top, over_w, over_h = frame_offsets(win, vis, inner_w, inner_h)
    al, at, ar, ab = area
    target_w = max(1, min(target_w, ar - al))
    target_h = max(1, min(target_h, ab - at))
    cx = al + (ar - al - target_w) // 2
    cy = at + (ab - at - target_h) // 2
    region = (left, top, left + target_w, top + target_h)
    return cx - left, cy - top, target_w + over_w, target_h + over_h, region


def fit_after_move(actual, offsets, target, area):
    """The window as Windows really placed it (`actual`: its rect; Chrome or Windows may refuse a
    size): the cut and, if needed, a new position so the page is wholly inside `area`.
    Returns (x, y, region)."""
    left, top, over_w, over_h = offsets
    wl, wt, wr, wb = actual
    pw = max(1, min(target[0], (wr - wl) - over_w))
    ph = max(1, min(target[1], (wb - wt) - over_h))
    al, at, ar, ab = area
    px = min(max(wl + left, al), ar - pw)  # the page's place on the screen, kept inside the area
    py = min(max(wt + top, at), ab - ph)
    return px - left, py - top, (left, top, left + pw, top + ph)


def window_action(action, data=None):
    """Do `action` on the game's window. False when not on Windows / no game window / it failed."""
    data = data or {}
    if sys.platform != "win32" or action not in ACTIONS:
        return False
    try:
        import ctypes
        from ctypes import wintypes
        user32 = _user32()
        found = find_game_window(user32)
        if not found:
            return False
        hwnd = ctypes.c_void_p(found)

        def rect():
            r = wintypes.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(r))
            return (r.left, r.top, r.right, r.bottom)

        def topmost(on):
            user32.SetWindowPos(hwnd, ctypes.c_void_p(HWND_TOPMOST if on else HWND_NOTOPMOST), 0, 0, 0, 0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)

        if action == "minimize":
            topmost(False)
            user32.ShowWindow(hwnd, 6)  # SW_MINIMIZE
        elif action == "close":
            user32.PostMessageW(hwnd, 0x0010, 0, 0)  # WM_CLOSE
        elif action in ("focus", "blur"):
            # full screen covers the taskbar only while the game is in front (other windows above it otherwise)
            topmost(_full["on"] and action == "focus")
        elif action == "moveby":
            # dragging the window (the page sends how far the mouse went)
            dpr = float(data.get("dpr") or 1) or 1
            wl, wt, _, _ = rect()
            dx, dy = round(float(data.get("dx") or 0) * dpr), round(float(data.get("dy") or 0) * dpr)
            user32.SetWindowPos(hwnd, None, wl + dx, wt + dy, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)
        else:  # frameless (the menu's size, in the middle of the work area) / fullscreen (the whole monitor)
            full = action == "fullscreen"
            dpr = float(data.get("dpr") or 1) or 1
            inner_w = round(float(data.get("innerWidth") or 0) * dpr)
            inner_h = round(float(data.get("innerHeight") or 0) * dpr)
            if inner_w <= 0 or inner_h <= 0:
                return False
            if user32.IsZoomed(hwnd):
                user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                return False  # (measured again on the page's next ask, at the window's normal size)
            win = rect()
            v = wintypes.RECT()
            if ctypes.windll.dwmapi.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(v), ctypes.sizeof(v)) == 0:
                vis = (v.left, v.top, v.right, v.bottom)
            else:
                vis = win  # DWMWA_EXTENDED_FRAME_BOUNDS unknown: no invisible borders

            class MONITORINFO(ctypes.Structure):
                _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT), ("rcWork", wintypes.RECT), ("dwFlags", wintypes.DWORD)]

            mi = MONITORINFO()
            mi.cbSize = ctypes.sizeof(MONITORINFO)
            user32.GetMonitorInfoW(ctypes.c_void_p(user32.MonitorFromWindow(hwnd, 2)), ctypes.byref(mi))
            a = mi.rcMonitor if full else mi.rcWork  # (full screen covers the taskbar; the menu stays above it)
            area = (a.left, a.top, a.right, a.bottom)
            if full:
                target = (area[2] - area[0], area[3] - area[1])
            else:
                target = (round(float(data.get("width") or 1180) * dpr), round(float(data.get("height") or 780) * dpr))
            offsets = frame_offsets(win, vis, inner_w, inner_h)
            x, y, w, h, region = clip_layout(win, vis, inner_w, inner_h, target[0], target[1], area)
            gdi32 = ctypes.windll.gdi32
            gdi32.CreateRectRgn.restype = ctypes.c_void_p

            def cut(r, redraw):
                user32.SetWindowRgn(hwnd, ctypes.c_void_p(gdi32.CreateRectRgn(*r)), redraw)  # (the window owns it now)

            # the cut first (not drawn yet), then the move: the frame is never seen
            cut(region, False)
            user32.SetWindowPos(hwnd, ctypes.c_void_p(HWND_TOPMOST if full else HWND_NOTOPMOST), x, y, w, h, SWP_NOACTIVATE)
            # what Windows really did (a refused size): the cut follows, the page stays inside the area
            fx, fy, fregion = fit_after_move(rect(), offsets, (region[2] - region[0], region[3] - region[1]), area)
            if fregion != region or (fx, fy) != (x, y):
                cut(fregion, True)
                user32.SetWindowPos(hwnd, None, fx, fy, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)
            _full["on"] = full
            if full:
                user32.SetForegroundWindow(hwnd)
        return True
    except Exception:  # noqa: BLE001
        return False


# Where the launcher opens the window: far off the screen. The page cuts the frame away and puts the
# window in the middle — so the Windows frame is never seen. A page that never asks (an old one)
# is brought back after a while.
OFFSCREEN = (-6000, -6000)


def rescue_offscreen(seconds=12.0, poll=0.5):
    """Bring the game's window back to the screen if after `seconds` it is still off it."""
    if sys.platform != "win32":
        return False
    import time
    import ctypes
    from ctypes import wintypes
    end = time.time() + seconds
    while time.time() < end:
        time.sleep(poll)
    try:
        user32 = _user32()
        found = find_game_window(user32)
        if not found:
            return False
        hwnd = ctypes.c_void_p(found)
        r = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(r))
        if r.right > -1000 and r.bottom > -1000:
            return False  # (on the screen already)
        user32.SetWindowPos(hwnd, None, 80, 60, 0, 0, SWP_NOSIZE | SWP_NOZORDER)
        return True
    except Exception:  # noqa: BLE001
        return False
