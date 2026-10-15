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

The strip on top that still showed (Windows 11): Windows draws its own frame of the window — the
rounded corners, the thin border and the title bar's backdrop — and it did not keep to the cut, and
the cut could be lost. So now:
  - the page's place is taken from Chrome's own window over the page («Chrome_RenderWidgetHostHWND»,
    exactly the page's rect) — the frame's size is only guessed when it is not there;
  - Windows is told not to draw its frame for this window at all (no non-client rendering, no
    rounded corners, no border, no backdrop);
  - the cut is kept: every half second the window's cut is checked and put back if it was lost or no
    longer is the page (the wanted cut and who made it are written on the window itself: only the
    program that cut it last — the launcher's loading screen, then the game — keeps it).
"""

import os
import sys
import threading
import time

GAME_TITLE = "Волшебство только начинается"
ACTIONS = ("minimize", "close", "frameless", "fullscreen", "moveby", "focus", "blur")
PAGE_CLASS = "Chrome_RenderWidgetHostHWND"  # (Chrome's / Edge's child window over the web page)

SWP_NOSIZE, SWP_NOMOVE, SWP_NOZORDER, SWP_NOACTIVATE = 0x0001, 0x0002, 0x0004, 0x0010
HWND_TOPMOST, HWND_NOTOPMOST = -1, -2

_full = {"on": False}  # (the game is in full screen: kept on top while in front)
_lock = threading.Lock()  # (a cut is never checked while it is being made)
_keeper = {"thread": None}


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


def page_offsets(win, page, inner_w, inner_h):
    """The same, exactly, from Chrome's window over the page (`page`: its rect on the screen) — when it
    really is the page (its size is the page's size); else None (then the frame is measured)."""
    if not page:
        return None
    pl, pt, pr, pb = page
    if abs((pr - pl) - inner_w) > 2 or abs((pb - pt) - inner_h) > 2:
        return None
    wl, wt, wr, wb = win
    if not (wl <= pl and wt <= pt and pr <= wr and pb <= wb):
        return None
    return pl - wl, pt - wt, (wr - wl) - (pr - pl), (wb - wt) - (pb - pt)


def page_region(win, page):
    """The cut that is exactly the page (window coordinates), from the page's rect on the screen."""
    wl, wt, _, _ = win
    pl, pt, pr, pb = page
    return (pl - wl, pt - wt, pr - wl, pb - wt)


def clip_layout(win, vis, inner_w, inner_h, target_w, target_h, area, offsets=None):
    """Pure geometry (tested anywhere). win: the window rect, vis: its visible frame (DWM),
    inner_*: the page's size now, target_*: the page's size wanted (all real pixels), area: where it
    must fit (the work area, or the monitor for full screen) — rects are (left, top, right, bottom);
    offsets: the page's place in the window when it is known exactly (page_offsets).
    Returns (x, y, w, h, region): where to put the window and the part of it to keep (in window
    coordinates) — exactly the page, never larger than the area, in its middle."""
    left, top, over_w, over_h = offsets or frame_offsets(win, vis, inner_w, inner_h)
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


def keep_needed(now, want):
    """The window's cut now (`now`; None: no cut — lost) is not the one wanted: cut again."""
    return want is not None and (now is None or tuple(now) != tuple(want))


def pack_cut(region):
    """The cut written on the window (two numbers: each fits a 32-bit handle, never 0)."""
    l, t, r, b = (max(0, min(0x7FFF, int(v))) for v in region)
    return ((l << 16) | t) + 1, ((r << 16) | b) + 1


def unpack_cut(lt, rb):
    if not lt or not rb:
        return None
    lt, rb = int(lt) - 1, int(rb) - 1
    return (lt >> 16, lt & 0xFFFF, rb >> 16, rb & 0xFFFF)


# ---------------------------------------------------------------- Windows only (ctypes)

def _rect_of(user32, hwnd):
    import ctypes
    from ctypes import wintypes
    r = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return (r.left, r.top, r.right, r.bottom)


def _page_rect(user32, hwnd):
    """The page's rect on the screen: Chrome's own (invisible) window over the web page; None if not there."""
    import ctypes
    from ctypes import wintypes
    found = []
    proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    def cb(h, _):
        if h:
            buf = ctypes.create_unicode_buffer(64)
            user32.GetClassNameW(ctypes.c_void_p(h), buf, 64)
            if buf.value == PAGE_CLASS and user32.IsWindowVisible(ctypes.c_void_p(h)):
                r = wintypes.RECT()
                if user32.GetWindowRect(ctypes.c_void_p(h), ctypes.byref(r)) and r.right > r.left and r.bottom > r.top:
                    found.append((r.left, r.top, r.right, r.bottom))
        return True

    user32.EnumChildWindows(hwnd, proc(cb), 0)
    return max(found, key=lambda r: (r[2] - r[0]) * (r[3] - r[1])) if found else None


def _dwm_plain(hwnd):
    """Windows draws nothing of its own around this window: no frame rendering, no rounded corners,
    no border, no backdrop (Windows 11 drew them over the cut — the grey strip on top)."""
    import ctypes
    dwm = ctypes.windll.dwmapi
    # DWMWA_NCRENDERING_POLICY = DISABLED, WINDOW_CORNER_PREFERENCE = DONOTROUND,
    # BORDER_COLOR = COLOR_NONE, SYSTEMBACKDROP_TYPE = NONE (the last three: Windows 11 only)
    for attr, value in ((2, 1), (33, 1), (34, 0xFFFFFFFE), (38, 1)):
        v = ctypes.c_uint(value)
        try:
            dwm.DwmSetWindowAttribute(hwnd, attr, ctypes.byref(v), ctypes.sizeof(v))
        except Exception:  # noqa: BLE001
            pass


def _props(user32):
    import ctypes
    user32.GetPropW.restype = ctypes.c_void_p
    user32.GetPropW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p]
    user32.SetPropW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_void_p]


def _set_cut(user32, hwnd, region, redraw):
    """Cut the window to `region` (window coordinates) and write it on the window (for the keeper)."""
    import ctypes
    gdi32 = ctypes.windll.gdi32
    gdi32.CreateRectRgn.restype = ctypes.c_void_p
    user32.SetWindowRgn(hwnd, ctypes.c_void_p(gdi32.CreateRectRgn(*region)), redraw)  # (the window owns it now)
    _props(user32)
    lt, rb = pack_cut(region)
    user32.SetPropW(hwnd, "ZNS_CUT_LT", ctypes.c_void_p(lt))
    user32.SetPropW(hwnd, "ZNS_CUT_RB", ctypes.c_void_p(rb))
    # (who cut it last keeps it: the launcher's loading screen and then the game cut the same window)
    user32.SetPropW(hwnd, "ZNS_CUT_BY", ctypes.c_void_p(os.getpid()))


def _wanted_cut(user32, hwnd):
    """The cut this program made on the window (None: never cut, or cut since by the other program)."""
    _props(user32)
    if (user32.GetPropW(hwnd, "ZNS_CUT_BY") or 0) != os.getpid():
        return None
    return unpack_cut(user32.GetPropW(hwnd, "ZNS_CUT_LT") or 0, user32.GetPropW(hwnd, "ZNS_CUT_RB") or 0)


def _cut_now(user32, hwnd):
    """The window's cut now (window coordinates), None when it has none."""
    import ctypes
    from ctypes import wintypes
    r = wintypes.RECT()
    kind = user32.GetWindowRgnBox(hwnd, ctypes.byref(r))  # (2 / 3: a region; 0 / 1: none)
    return (r.left, r.top, r.right, r.bottom) if kind in (2, 3) else None


def _check_cut():
    """The game's window keeps its cut (put back when lost). False when there is no game window."""
    import ctypes
    user32 = _user32()
    found = find_game_window(user32)
    if not found:
        return False
    hwnd = ctypes.c_void_p(found)
    if user32.IsIconic(hwnd) or user32.IsZoomed(hwnd):
        return True
    want = _wanted_cut(user32, hwnd)
    if want is None:
        return True  # (not cut by this program: not its to keep)
    page = _page_rect(user32, hwnd)
    if page and abs((page[2] - page[0]) - (want[2] - want[0])) <= 2 and abs((page[3] - page[1]) - (want[3] - want[1])) <= 2:
        want = page_region(_rect_of(user32, hwnd), page)  # (exactly where the page is now)
    if keep_needed(_cut_now(user32, hwnd), want):
        _dwm_plain(hwnd)
        _set_cut(user32, hwnd, want, True)
    return True


def _keep_cut(poll=0.5):
    missing = 0
    while missing < 60:  # (the window gone for half a minute: stop)
        time.sleep(poll)
        try:
            with _lock:
                missing = 0 if _check_cut() else missing + 1
        except Exception:  # noqa: BLE001
            missing += 1
    _keeper["thread"] = None


def _start_keeper():
    t = _keeper.get("thread")
    if t is not None and t.is_alive():
        return
    t = threading.Thread(target=_keep_cut, daemon=True, name="zns-window-cut")
    _keeper["thread"] = t
    t.start()


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
            _dwm_plain(hwnd)  # (first: Windows' own frame never drawn — then measured)
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
            # the page's place: exactly from Chrome's window over the page; else measured from the frame
            offsets = page_offsets(win, _page_rect(user32, hwnd), inner_w, inner_h) or frame_offsets(win, vis, inner_w, inner_h)
            x, y, w, h, region = clip_layout(win, vis, inner_w, inner_h, target[0], target[1], area, offsets)
            with _lock:
                # the cut first (not drawn yet), then the move: the frame is never seen
                _set_cut(user32, hwnd, region, False)
                user32.SetWindowPos(hwnd, ctypes.c_void_p(HWND_TOPMOST if full else HWND_NOTOPMOST), x, y, w, h, SWP_NOACTIVATE)
                # what Windows really did (a refused size): the cut follows, the page stays inside the area
                fx, fy, fregion = fit_after_move(rect(), offsets, (region[2] - region[0], region[3] - region[1]), area)
                if fregion != region or (fx, fy) != (x, y):
                    _set_cut(user32, hwnd, fregion, True)
                    user32.SetWindowPos(hwnd, None, fx, fy, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)
            _full["on"] = full
            if full:
                user32.SetForegroundWindow(hwnd)
            _start_keeper()  # (the cut is kept from now on: put back whenever it is lost)
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
