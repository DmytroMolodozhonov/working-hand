"""The game's own window (launcher/zns_browser.py): its own engine process and the saves' transfer."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "launcher"))
import zns_browser as B  # noqa: E402


class OwnWindow(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
        os.environ.pop("ZNS_SHARED_PROFILE", None)

    def test_own_profile_flags(self):
        cmd = B.window_cmd(r"C:\Chrome\chrome.exe", "http://localhost:8000/", home=self.home)
        self.assertIn(f"--user-data-dir={os.path.join(self.home, 'browser', 'chrome')}", cmd)
        self.assertIn("--app=http://localhost:8000/?app=own", cmd)
        self.assertIn("--disable-extensions", cmd)
        self.assertEqual(sum(a.startswith("--disable-features=") for a in cmd), 1, "Chrome takes only the last one")
        self.assertTrue(os.path.isdir(os.path.join(self.home, "browser", "chrome")))
        edge = B.window_cmd(r"C:\Edge\msedge.exe", "http://localhost:8000/", home=self.home)
        self.assertIn(f"--user-data-dir={os.path.join(self.home, 'browser', 'edge')}", edge)

    def test_shared_profile_is_the_old_way(self):
        cmd = B.window_cmd("chrome.exe", "http://localhost:8000/", own=False, home=self.home)
        self.assertFalse(any(a.startswith("--user-data-dir") for a in cmd))
        self.assertIn("--app=http://localhost:8000/", cmd)
        self.assertNotIn("--disable-extensions", cmd)

    def test_transfer_asks_old_profile_at_most_a_few_times(self):
        started = []
        B.popen, real = (lambda cmd: started.append(cmd)), B.popen
        try:
            t = B.Transfer(home=self.home, browsers=lambda: ["chrome.exe"])
            self.assertEqual(t.status(8000)["state"], "pending")
            self.assertEqual(t.status(8000)["state"], "pending")  # (no second window while waiting)
            self.assertEqual(len(started), 1)
            self.assertNotIn("--user-data-dir", " ".join(started[0]), "the user's own profile")
            for _ in range(B.MAX_TRIES):
                t.asked_at = 0
                t.status(8000)
            self.assertEqual(t.status(8000)["state"], "none")
            self.assertEqual(len(started), B.MAX_TRIES)
            t.receive({"v": 1, "local": {"zns-name": "Мерлин"}, "worlds": []})
            s = t.status(8000)
            self.assertEqual(s["state"], "ready")
            self.assertEqual(s["data"]["local"]["zns-name"], "Мерлин")
            with open(os.path.join(self.home, B.TRANSFER_FILE), encoding="utf-8") as fh:
                self.assertIn("at", json.load(fh))
        finally:
            B.popen = real

    def test_no_browser_nothing_to_carry(self):
        self.assertEqual(B.Transfer(home=self.home, browsers=lambda: []).status(8000)["state"], "none")


if __name__ == "__main__":
    unittest.main()
