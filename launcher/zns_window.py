"""
zns_window.py — the game's window on Windows: no Windows frame, the menu's size, moved by the
game's own title bar; minimised and closed by the game's own buttons.

Used by the launcher (its loading screen) and by server.py (the game) for POST /api/window.
Chrome draws the title bar of an app window itself (taking the WS_CAPTION style away does not
remove it), so the window is CLIPPED to the page (SetWindowRgn): everything above and around the
page — the title bar and the borders — is cut away. The page tells its size in CSS pixels and
its devicePixelRatio; the frame's size is measured from the window. For the game the clip is
taken away (full screen) and put back when the menu comes back.

Only the window whose title is exactly the game's name is ever touched (the app window; a
browser with tabs has « - Google Chrome» in its title), and only for requests from this computer.
Only the Python standard library.
"""

import sys

GAME_TITLE = "Волшебство только начинается"
ACTIONS = ("minimize", "close", "frameless", "framed", "drag")


def _user32():
    import ctypes
    user32 = ctypes.windll.user32
    for fn in ("GetForegroundWindow", "MonitorFromWindow"):
        getattr(user32, fn).restype = ctypes.c_void_p  # (64-bit handles: never through a C int)
    try:  # real pixels everywhere (the page's size × devicePixelRatio)
        user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))  # PER_MONITOR_AWARE_V2
    except Exception:  # noqa: BLE001
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


def clip_layout(win, vis, inner_w, inner_h, target_w, target_h, work):
    """Pure geometry (tested anywhere). win: the window rect, vis: its visible frame (DWM),
    inner_*: the page's size now, target_*: the page's size wanted (all real pixels), work: the
    screen's work area — each a (left, top, right, bottom). Returns (x, y, w, h, region) — where to
    put the window and the part of it to keep (in window coordinates): exactly the page."""
    wl, wt, wr, wb = win
    vl, vt, vr, vb = vis
    vis_w = vr - vl
    side = max(0, round((vis_w - inner_w) / 2))  # (the visible border left and right: 0–1 px)
    bottom_inv = wb - vb  # the invisible resize border under the frame
    # the page sits at the bottom of the visible frame: the frame above it is the title bar
    over_w = (wr - wl) - inner_w
    over_h = (wb - wt) - inner_h
    w, h = target_w + over_w, target_h + over_h
    left = (vl - wl) + side
    bottom = h - bottom_inv - side
    top = bottom - target_h
    region = (left, top, left + target_w, bottom)
    al, at, ar, ab = work
    cx = al + max(0, (ar - al - target_w) // 2)
    cy = at + max(0, (ab - at - target_h) // 2)
    return cx - left, cy - top, w, h, region


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
        if action == "minimize":
            user32.ShowWindow(hwnd, 6)  # SW_MINIMIZE
        elif action == "close":
            user32.PostMessageW(hwnd, 0x0010, 0, 0)  # WM_CLOSE
        elif action == "drag":
            user32.ReleaseCapture()
            user32.PostMessageW(hwnd, 0x0112, 0xF012, 0)  # WM_SYSCOMMAND, SC_MOVE | HTCAPTION: follow the mouse
        elif action == "framed":
            user32.SetWindowRgn(hwnd, None, True)  # the whole window again (full screen for the game)
        else:  # frameless
            dpr = float(data.get("dpr") or 1) or 1
            inner_w = round(float(data.get("innerWidth") or 0) * dpr)
            inner_h = round(float(data.get("innerHeight") or 0) * dpr)
            target_w = round(float(data.get("width") or 1180) * dpr)
            target_h = round(float(data.get("height") or 780) * dpr)
            if inner_w <= 0 or inner_h <= 0:
                return False
            if user32.IsZoomed(hwnd):
                user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                return False  # (measured again on the page's next ask, at the window's normal size)
            win = wintypes.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(win))
            vis = wintypes.RECT()
            if ctypes.windll.dwmapi.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(vis), ctypes.sizeof(vis)) != 0:
                vis = win  # DWMWA_EXTENDED_FRAME_BOUNDS unknown: no invisible borders

            class MONITORINFO(ctypes.Structure):
                _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT), ("rcWork", wintypes.RECT), ("dwFlags", wintypes.DWORD)]

            mi = MONITORINFO()
            mi.cbSize = ctypes.sizeof(MONITORINFO)
            user32.GetMonitorInfoW(ctypes.c_void_p(user32.MonitorFromWindow(hwnd, 2)), ctypes.byref(mi))
            wa = mi.rcWork
            target_w = min(target_w, wa.right - wa.left)
            target_h = min(target_h, wa.bottom - wa.top)
            x, y, w, h, (rl, rt, rr, rb) = clip_layout(
                (win.left, win.top, win.right, win.bottom), (vis.left, vis.top, vis.right, vis.bottom),
                inner_w, inner_h, target_w, target_h, (wa.left, wa.top, wa.right, wa.bottom))
            user32.SetWindowPos(hwnd, None, x, y, w, h, 0x0004 | 0x0010)  # SWP_NOZORDER | SWP_NOACTIVATE
            gdi32 = ctypes.windll.gdi32
            gdi32.CreateRectRgn.restype = ctypes.c_void_p
            user32.SetWindowRgn(hwnd, ctypes.c_void_p(gdi32.CreateRectRgn(rl, rt, rr, rb)), True)  # (the window owns it now)
        return True
    except Exception:  # noqa: BLE001
        return False
