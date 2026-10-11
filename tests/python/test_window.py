"""The game's window without the Windows frame (launcher/zns_window.py): the geometry of the cut."""
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "launcher"))
import zns_window as W  # noqa: E402


class Clip(unittest.TestCase):
    def test_cuts_exactly_the_page_and_centres_it(self):
        # Windows 11: an app window 1196×819 at (100, 50) with 8 px invisible borders, a 1 px
        # visible border and a 31 px title bar; the page inside is 1178×779
        win = (100, 50, 1296, 869)
        vis = (108, 50, 1288, 861)
        x, y, w, h, region = W.clip_layout(win, vis, 1178, 779, 1180, 780, (0, 0, 1920, 1040))
        left, top, right, bottom = region
        self.assertEqual((right - left, bottom - top), (1180, 780))  # exactly the page, nothing else
        self.assertEqual((w, h), (1180 + 18, 780 + 40))  # the frame's size stays the same
        self.assertEqual(left, 8 + 1)  # past the invisible and the visible border
        self.assertEqual(h - bottom, 8 + 1)
        self.assertEqual(top, h - 9 - 780)  # the title bar is above the cut
        # the visible page is in the middle of the work area
        self.assertEqual((x + left, y + top), ((1920 - 1180) // 2, (1040 - 780) // 2))

    def test_not_on_windows_or_unknown_action_does_nothing(self):
        self.assertFalse(W.window_action("explode"))
        if sys.platform != "win32":
            self.assertFalse(W.window_action("close"))


if __name__ == "__main__":
    unittest.main()
