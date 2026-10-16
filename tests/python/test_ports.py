"""Whose is a port (launcher/zns_ports.py): another program on 127.0.0.1 or on ::1 (the browser's
«localhost» goes there first), even one answering JSON on /api/version, is never taken for the game."""
import http.server
import json
import os
import socket
import sys
import threading
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "launcher"))
import zns_ports as P  # noqa: E402
import zns_window as W  # noqa: E402


def serve(host, answers):
    """A tiny server on `host` (a free port) answering JSON `answers[path]` (404 otherwise)."""
    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            body = answers.get(self.path)
            self.send_response(200 if body is not None else 404)
            self.end_headers()
            if body is not None:
                self.wfile.write(json.dumps(body).encode())

    class S(http.server.HTTPServer):
        address_family = socket.AF_INET6 if ":" in host else socket.AF_INET

    s = S((host, 0), H)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


def has_ipv6():
    try:
        with socket.socket(socket.AF_INET6) as s:
            s.bind(("::1", 0))
        return True
    except OSError:
        return False


class Ports(unittest.TestCase):
    def test_marks(self):
        self.assertEqual(P.kind_of({"zns": P.LAUNCHER_MARK}, None), "launcher")
        self.assertEqual(P.kind_of({"app": P.APP_NAME}, None), "launcher")  # (an older launcher)
        self.assertEqual(P.kind_of(None, {"zns": P.GAME_MARK}), "game")
        self.assertEqual(P.kind_of(None, {"date": "2026", "sha": "abc"}), "other")  # JSON, but not the game's
        self.assertEqual(P.kind_of(None, None), "other")
        self.assertIsNone(P.overall([]))
        self.assertEqual(P.overall(["launcher", "other"]), "other")  # the browser could land on the other one
        self.assertEqual(P.overall(["game"]), "game")

    def test_another_program_answering_json_is_not_the_game(self):
        s = serve("127.0.0.1", {"/api/version": {"date": "x", "sha": "y"}})
        try:
            owner, seen = P.who(s.server_address[1])
            self.assertEqual(owner, "other")
            self.assertEqual(seen, {"127.0.0.1": "other"})
        finally:
            s.shutdown()

    def test_ours_and_nobody(self):
        s = serve("127.0.0.1", {"/__launcher/ping": {"app": P.APP_NAME, "zns": P.LAUNCHER_MARK}})
        g = serve("127.0.0.1", {"/api/ping": {"zns": P.GAME_MARK}})
        try:
            self.assertEqual(P.who(s.server_address[1])[0], "launcher")
            self.assertEqual(P.who(g.server_address[1])[0], "game")
            self.assertIn(g.server_address[1], P.ours_elsewhere(g.server_address[1], 1))
        finally:
            port = s.server_address[1]
            s.shutdown()
            s.server_close()
            g.shutdown()
        self.assertEqual(P.who(port), (None, {}))

    @unittest.skipUnless(has_ipv6(), "no IPv6 here")
    def test_a_program_on_ipv6_only_takes_the_port(self):
        # (Node 17+ listens on ::1: binding 127.0.0.1 works, but the browser's «localhost» goes to ::1)
        s = serve("::1", {"/api/version": {"zns": "not-ours"}})
        try:
            port = s.server_address[1]
            self.assertEqual(P.listeners(port), ["::1"])
            self.assertEqual(P.who(port)[0], "other")
        finally:
            s.shutdown()


class Orphans(unittest.TestCase):
    def test_which_old_windows_are_closed(self):
        for t in ("localhost", "localhost:8000/", "http://127.0.0.1:8001/", "[::1]:8000"):
            self.assertTrue(W.is_address_title(t), t)
            self.assertTrue(W.orphan_to_close(t, True, keep_game=True), t)  # an error page of the game: always
            self.assertFalse(W.orphan_to_close(t, False, keep_game=False), t)  # never someone else's window
        for t in ("localhost - Google Chrome", "localhost:3000 – Remotion", "YouTube", ""):
            self.assertFalse(W.is_address_title(t), t)
            self.assertFalse(W.orphan_to_close(t, True, keep_game=False), t)
        self.assertTrue(W.orphan_to_close(W.GAME_TITLE, False, keep_game=False))
        self.assertFalse(W.orphan_to_close(W.GAME_TITLE, True, keep_game=True))  # a game still runs elsewhere
        self.assertFalse(W.is_app_title("localhost - Google Chrome"))  # (a browser's own window is never hidden)
        self.assertEqual(W.close_orphans(), 0) if sys.platform != "win32" else None


if __name__ == "__main__":
    unittest.main()
