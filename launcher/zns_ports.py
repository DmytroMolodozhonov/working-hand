"""
zns_ports.py — whose is a port on this computer: nobody's, the game's launcher, the game's server, or
another program's.

Why (the author's other project took port 8000): the game's window opens «http://localhost:<port>».
The browser tries «localhost» as ::1 (IPv6) first, then as 127.0.0.1 — so a program listening on ::1
(Node 17+ does) got the game's window even though the launcher had bound 127.0.0.1 without trouble,
and a program that answered JSON on /api/version was taken for the game. Now a port is the game's only
when EVERY address of «localhost» that answers on it is the game's own (its marker in the answer), and
a port where anything else answers is never taken (the next one is).

Only the Python standard library. Used by zns_launcher.py and server.py.
"""

import json
import socket
import threading
import urllib.request

LAUNCHER_MARK = "zns-launcher"  # /__launcher/ping → {"zns": LAUNCHER_MARK}
GAME_MARK = "zns-game"  # /api/ping (and /api/version) → {"zns": GAME_MARK}
APP_NAME = "Волшебство только начинается"  # (older launchers answered ping with only {"app": APP_NAME})
HOSTS = ("127.0.0.1", "::1")  # what «localhost» is to the browser


def _answers(host, port, timeout):
    fam = socket.AF_INET6 if ":" in host else socket.AF_INET
    try:
        with socket.socket(fam, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            return s.connect_ex((host, port)) == 0
    except OSError:  # (no IPv6 on this computer: nobody can listen there either)
        return False


def listeners(port, timeout=0.25):
    """The addresses of «localhost» where something accepts connections on `port` (both at once:
    on Windows a refused connection to a closed port takes seconds — the short timeout says «nobody»)."""
    out = {}
    threads = [threading.Thread(target=lambda h=h: out.__setitem__(h, _answers(h, port, timeout))) for h in HOSTS]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return [h for h in HOSTS if out.get(h)]


def _json(host, port, path, timeout):
    h = f"[{host}]" if ":" in host else host
    try:
        with urllib.request.urlopen(f"http://{h}:{port}{path}", timeout=timeout) as r:
            return json.loads(r.read(65536))
    except Exception:  # noqa: BLE001
        return None


def kind_of(ping, version):
    """What answered (pure): the launcher, the game's server, or another program."""
    if isinstance(ping, dict) and (ping.get("zns") == LAUNCHER_MARK or ping.get("app") == APP_NAME):
        return "launcher"
    if isinstance(version, dict) and version.get("zns") == GAME_MARK:
        return "game"
    return "other"


def overall(kinds):
    """The port's owner from what each address said (pure): None — nobody; «other» when anything that
    answers is not the game's (the browser could land there); else the game's kind."""
    kinds = [k for k in kinds if k]
    if not kinds:
        return None
    if "other" in kinds:
        return "other"
    return "launcher" if "launcher" in kinds else "game"


def who(port, timeout=2.0):
    """(owner, {address: kind}) of `port`: owner None / «launcher» / «game» / «other»."""
    seen = {}
    for host in listeners(port):
        ping = _json(host, port, "/__launcher/ping", timeout)
        seen[host] = kind_of(ping, None if kind_of(ping, None) == "launcher" else _json(host, port, "/api/ping", timeout))
    return overall(seen.values()), seen


def ours_elsewhere(base, count, skip=None):
    """The other ports in base..base+count-1 where the game (launcher or server) answers now."""
    found = []
    lock = threading.Lock()

    def check(p):
        o, _ = who(p, timeout=1.0)
        if o in ("launcher", "game"):
            with lock:
                found.append(p)

    threads = [threading.Thread(target=check, args=(p,)) for p in range(base, base + count) if p != skip]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return sorted(found)
