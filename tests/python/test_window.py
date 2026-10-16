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

    def test_full_screen_at_125_percent_covers_exactly_the_monitor(self):
        # 1920×1080 monitor, taskbar 48 px; 125 %: the menu page 1180×780 CSS = 1475×975 real pixels
        win = (200, 40, 1691, 1063)  # the app window around it: 8 px borders, 39 px title bar
        vis = (208, 40, 1683, 1055)
        inner = (1475, 975)
        x, y, w, h, region = W.clip_layout(win, vis, *inner, 1920, 1080, (0, 0, 1920, 1080))
        left, top, right, bottom = region
        self.assertEqual((x + left, y + top, x + right, y + bottom), (0, 0, 1920, 1080))  # the whole screen, no strip
        # the menu: never under the taskbar, even when it asks for more than fits
        x, y, w, h, (left, top, right, bottom) = W.clip_layout(win, vis, *inner, 2000, 1200, (0, 0, 1920, 1032))
        self.assertLessEqual(y + bottom, 1032)
        self.assertGreaterEqual(y + top, 0)

    def test_a_refused_size_keeps_the_page_inside_the_area(self):
        # asked 1920×1080 of page, but Windows made the window 60 px lower than asked
        offsets = (9, 40, 18, 49)
        fx, fy, (l, t, r, b) = W.fit_after_move((-9, -40, 1929, 1029), offsets, (1920, 1080), (0, 0, 1920, 1080))
        self.assertEqual((r - l, b - t), (1920, 1020))  # the cut follows the real window
        self.assertEqual((fx + l, fy + t), (0, 0))
        self.assertLessEqual(fy + b, 1080)  # nothing below the screen
        # a window dragged half off the bottom of the work area: pulled back above the taskbar
        fx, fy, (l, t, r, b) = W.fit_after_move((100, 700, 1298, 1569), offsets, (1180, 780), (0, 0, 1920, 1032))
        self.assertLessEqual(fy + b, 1032)

    def test_the_page_place_from_chromes_window_over_it(self):
        # the window's frame tells a wrong place (the page is 30 px lower than the bottom-of-frame
        # guess would say, e.g. Windows 11's own frame): Chrome's window over the page is believed
        win = (100, 50, 1296, 869)
        page = (109, 81, 1287, 860)  # 1178×779 — the page's size: it is the page
        offsets = W.page_offsets(win, page, 1178, 779)
        self.assertEqual(offsets, (9, 31, 18, 40))
        x, y, w, h, region = W.clip_layout(win, (108, 50, 1288, 861), 1178, 779, 1180, 780, (0, 0, 1920, 1040), offsets)
        self.assertEqual(region, (9, 31, 9 + 1180, 31 + 780))
        self.assertEqual((x + 9, y + 31), ((1920 - 1180) // 2, (1040 - 780) // 2))
        # a child window of another size (not the page) or outside the window: not believed
        self.assertIsNone(W.page_offsets(win, (109, 81, 600, 400), 1178, 779))
        self.assertIsNone(W.page_offsets(win, (9, 81, 1187, 860), 1178, 779))
        self.assertIsNone(W.page_offsets(win, None, 1178, 779))
        self.assertEqual(W.page_region(win, page), (9, 31, 1187, 810))

    def test_the_cut_is_kept(self):
        want = (9, 31, 1189, 811)
        self.assertTrue(W.keep_needed(None, want))  # lost: put back
        self.assertTrue(W.keep_needed((0, 0, 1198, 820), want))  # someone changed it
        self.assertFalse(W.keep_needed(want, want))
        self.assertFalse(W.keep_needed(None, None))  # never cut by the game: not touched
        for region in [want, (0, 0, 1920, 1080), (9, 40, 2569, 1480)]:
            self.assertEqual(W.unpack_cut(*W.pack_cut(region)), region)
            self.assertTrue(all(0 < v < 2 ** 31 for v in W.pack_cut(region)))  # (a 32-bit handle, never 0)
        self.assertIsNone(W.unpack_cut(0, 5))

    def test_rounded_menu_window_and_its_title(self):
        self.assertEqual(W.corner_radius(False, 1), 12)  # the menu window: rounded
        self.assertEqual(W.corner_radius(False, 1.5), 18)  # (real pixels at 150 %)
        self.assertEqual(W.corner_radius(True, 1.25), 0)  # full screen: square to the monitor's edges
        # a rounded cut's box may be a pixel smaller: not «lost»
        self.assertFalse(W.keep_needed((9, 31, 1188, 810), (9, 31, 1189, 811)))
        # the new window found by its title: the game's name, or its address before the page has one
        for t in (W.GAME_TITLE, "localhost:8000/", "http://127.0.0.1:8001/"):
            self.assertTrue(W.is_app_title(t), t)
        for t in ("", "Новая вкладка - Google Chrome", "YouTube"):
            self.assertFalse(W.is_app_title(t), t)
        self.assertIn("reveal", W.ACTIONS)
        # only the browser's window is the game's: the launcher's loading picture (or any other program)
        # with the same title is never cut, sized or shown in its place (the game's window stayed hidden)
        self.assertTrue(W.is_game_window(W.GAME_TITLE, W.APP_CLASS))
        self.assertFalse(W.is_game_window(W.GAME_TITLE, "TkTopLevel"))
        self.assertFalse(W.is_game_window(W.GAME_TITLE, "Tk"))
        self.assertFalse(W.is_game_window("Новая вкладка - Google Chrome", W.APP_CLASS))
        import zns_splash as S
        self.assertNotEqual(S.TITLE, W.GAME_TITLE)
        # a page that never asks (an error on it): its hidden window is shown by itself soon
        self.assertLessEqual(W.RESCUE_AFTER, 10)
        self.assertGreater(W.RESCUE_AFTER, W.REVEAL_AFTER)
        self.assertEqual(W.app_windows_now(), set()) if sys.platform != "win32" else None
        self.assertFalse(W.hide_new_window(set(), seconds=0)) if sys.platform != "win32" else None

    def test_full_screen_is_the_whole_monitor_not_the_work_area(self):
        # the author: «внизу полоса — видна панель задач»: full screen must cover the taskbar's place too
        for dpr, (mw, mh), bar in ((1, (1920, 1080), 48), (1.25, (1920, 1080), 60), (1.5, (2560, 1440), 72), (1.5, (1920, 1080), 72)):
            monitor, work = (0, 0, mw, mh), (0, 0, mw, mh - bar)
            self.assertEqual(W.target_area(True, monitor, work), monitor)
            self.assertEqual(W.target_area(False, monitor, work), work)
            # the menu window (1180×780 CSS, or less when it does not fit) inside an app window with
            # Chrome's title bar on top and 8 px invisible borders (all scaled)
            iw, ih = min(1180, int(mw / dpr)), min(780, int((mh - bar) / dpr))
            bw, tb = round(8 * dpr), round(31 * dpr)
            pw, ph = round(iw * dpr), round(ih * dpr)
            win = (300, 100, 300 + pw + 2 * bw, 100 + ph + tb + bw)
            vis = (300 + bw, 100, 300 + pw + bw, 100 + ph + tb)
            page = (300 + bw, 100 + tb, 300 + bw + pw, 100 + tb + ph)
            x, y, w, h, region, radius, area, offsets = W.window_layout(True, monitor, work, win, vis, (iw, ih), page, dpr)
            self.assertEqual(area, monitor)
            self.assertEqual(radius, 0)  # square to the monitor's edges
            self.assertEqual(W.uncovered((x, y), region, monitor), (0, 0, 0, 0), (dpr, mw, mh))
            self.assertEqual((x + region[0], y + region[1], x + region[2], y + region[3]), monitor)
            # the window is bigger than the screen (the title bar above it is cut away): sized without
            # Windows' check, which would shrink it and leave the strip
            self.assertGreater(h, mh)
            self.assertTrue(W.size_flags(True) & W.SWP_NOSENDCHANGING)
            self.assertFalse(W.size_flags(False) & W.SWP_NOSENDCHANGING)
            # the menu: inside the work area, rounded, never under the taskbar
            x, y, w, h, region, radius, area, _ = W.window_layout(False, monitor, work, win, vis, (iw, ih), page, dpr)
            self.assertEqual(area, work)
            self.assertGreater(radius, 0)
            self.assertLessEqual(y + region[3], mh - bar)
            self.assertGreaterEqual(y + region[1], 0)
        # a window that Windows did shrink is seen in the log: the bare strip at the bottom is measured
        self.assertEqual(W.uncovered((-9, -40), (9, 40, 1929, 1060), (0, 0, 1920, 1080)), (0, 0, 0, 60))

    def test_the_loading_picture_is_where_the_menu_window_will_be(self):
        import zns_splash as S
        work = (0, 0, 1920, 1032)
        for dpr in (1, 1.25, 1.5):
            x, y, w, h = S.splash_rect(work, dpr)
            # the same place and size as the cut menu window (clip_layout centres it the same way)
            _, _, _, _, region, _, _, offsets = W.window_layout(False, (0, 0, 1920, 1080), work, (0, 0, 100, 100), (0, 0, 100, 100), (80, 60), (0, 0, 80, 60) if dpr == 1 else None, dpr)
            self.assertEqual((w, h), (region[2] - region[0], region[3] - region[1]))
            self.assertEqual((x, y), (work[0] + (1920 - w) // 2, (1032 - h) // 2))
        self.assertIsNone(S.show(seconds=0)) if sys.platform != "win32" else None

    def test_not_on_windows_or_unknown_action_does_nothing(self):
        self.assertFalse(W.window_action("explode"))
        if sys.platform != "win32":
            self.assertFalse(W.window_action("close"))


if __name__ == "__main__":
    unittest.main()
