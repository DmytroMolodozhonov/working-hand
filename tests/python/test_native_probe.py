"""The camera program (MediaPipe for Python) is tried apart first (native_probe.py): Windows refusing its
library (Smart App Control, «Bad Image 0xc0e90002» on a friend's computer) never stops the game."""
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
import native_probe as N  # noqa: E402

BAD_IMAGE = ("OSError: [WinError 4551] An Application Control policy has blocked this file: "
             "'C:\\\\Users\\\\ADMIN\\\\AppData\\\\Roaming\\\\Python\\\\Python313\\\\site-packages\\\\mediapipe\\\\tasks\\\\c\\\\libmediapipe.dll'")


class Probe(unittest.TestCase):
    def test_reasons(self):
        self.assertIsNone(N.classify(True, "ok", 1, True, True))
        self.assertEqual(N.classify(False, "", None, True, True, installed=False), "missing")
        self.assertEqual(N.classify(False, "x", 0, False, True), "bits")
        self.assertEqual(N.classify(False, BAD_IMAGE, 0, True, True), "sac")
        self.assertEqual(N.classify(False, "Bad Image ... Error status 0xc0e90002", None, True, False), "sac")
        self.assertEqual(N.classify(False, "ImportError: DLL load failed while importing _framework_bindings", 1, True, True), "sac")
        self.assertEqual(N.classify(False, "ImportError: DLL load failed", 0, True, False), "vcredist")
        self.assertEqual(N.classify(False, "ModuleNotFoundError: No module named 'mediapipe.tasks'", 0, True, True), "broken")
        for why in ("sac", "bits", "vcredist", "broken", "missing"):
            self.assertIn("через браузер", N.message(why))  # (the game always works)

    def test_probe_runs_apart_and_never_breaks(self):
        ok, text = N.probe(timeout=60)  # (here: mediapipe may be missing — then an error text, never an exception)
        self.assertIsInstance(ok, bool)
        self.assertIsInstance(text, str)
        ok, text = N.probe(timeout=30, python=os.path.join(ROOT, "no-such-python"))
        self.assertFalse(ok)
        self.assertFalse(N.quiet_errors()) if sys.platform != "win32" else None


if __name__ == "__main__":
    unittest.main()
