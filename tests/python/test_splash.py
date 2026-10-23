"""The loading picture (launcher/zns_splash.py): when it goes away — the logic only (tkinter / Windows are not needed)."""
import os
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "launcher"))
import zns_splash as sp  # noqa: E402


class FakeProc:
    def __init__(self, hang=False):
        self.alive, self.hang, self.terminated, self.killed = True, hang, 0, 0

    def poll(self):
        return None if self.alive else 0

    def terminate(self):
        self.terminated += 1
        self.alive = self.hang

    def wait(self, t=None):
        if self.alive:
            raise TimeoutError()

    def kill(self):
        self.killed += 1
        self.alive = False


class SplashTest(unittest.TestCase):
    def test_rect_in_middle_and_clipped(self):
        self.assertEqual(sp.splash_rect((0, 0, 2000, 1000), 1.0), (410, 110, 1180, 780))
        x, y, w, h = sp.splash_rect((0, 0, 800, 600), 1.0)
        self.assertEqual((x, y, w, h), (0, 0, 800, 600))
        self.assertEqual(sp.splash_rect((100, 50, 2900, 1550), 1.5)[2:], (1770, 1170))

    def test_schedule(self):
        self.assertEqual(sp.next_close_at(None, 10, 0.15), 10.15)
        self.assertEqual(sp.next_close_at(10.15, 12, 0.15), 10.15)  # (a repeated call never delays)
        self.assertEqual(sp.next_close_at(20, 12, 0.15), 12.15)
        self.assertFalse(sp.should_close(5, 0, 25, None))
        self.assertTrue(sp.should_close(5, 0, 25, 4))
        self.assertTrue(sp.should_close(26, 0, 25, None))  # (nobody asked: the time is up anyway)

    def test_handle_close_repeated_and_hard_limit(self):
        p = FakeProc()
        h = sp.Handle(p, lambda m: None, hard=60)
        h.close(0.01)
        h.close(0.01)
        time.sleep(0.2)
        self.assertEqual(p.terminated, 1)
        h.kill()
        self.assertEqual(p.terminated, 1)
        p2 = FakeProc()
        sp.Handle(p2, lambda m: None, hard=0.05)  # (nothing ever calls close: the window was never found)
        time.sleep(0.3)
        self.assertEqual(p2.terminated, 1)

    def test_stuck_process_is_killed(self):
        p = FakeProc(hang=True)
        h = sp.Handle(p, lambda m: None, hard=60)
        h.kill("t")
        self.assertEqual((p.terminated, p.killed), (1, 1))

    def test_watchdog_ends_process(self):
        died = []
        t = [0.0]
        sp._watchdog(1.0, 123, alive=lambda pid: True, die=died.append, sleep=lambda s: t.__setitem__(0, t[0] + s), now=lambda: t[0])
        self.assertEqual(died, [0])
        died.clear()
        sp._watchdog(100, 123, alive=lambda pid: False, die=died.append, sleep=lambda s: None, now=lambda: 0.0)
        self.assertEqual(died, [0])  # (the launcher is gone)

    def test_pid_alive(self):
        self.assertTrue(sp._pid_alive(os.getpid()))
        self.assertTrue(sp._pid_alive(0))


if __name__ == "__main__":
    unittest.main()
