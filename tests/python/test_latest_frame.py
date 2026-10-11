"""
pose_native._LatestFrame: the network always gets the camera's NEWEST picture (a queue
of old pictures made the hands trail). Run: python -m unittest discover -s tests/python
"""

import os
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import pose_native  # noqa: E402


class Cap:
    """A camera giving 30 pictures a second, numbered."""

    def __init__(self):
        self.n = 0

    def read(self):
        time.sleep(1 / 30)
        self.n += 1
        return True, self.n


class LatestFrame(unittest.TestCase):
    def test_a_slow_network_gets_the_newest_picture(self):
        cap = Cap()
        g = pose_native._LatestFrame(cap, threading.Event())
        try:
            ages = []
            for _ in range(12):
                ok, f = g.next()
                self.assertTrue(ok)
                ages.append(cap.n - f)
                time.sleep(0.09)  # (the network works 90 ms: ~3 camera pictures)
            self.assertLessEqual(max(ages[2:]), 1, ages)
        finally:
            g.close()

    def test_the_same_picture_is_not_given_twice(self):
        cap = Cap()
        g = pose_native._LatestFrame(cap, threading.Event())
        try:
            seen = [g.next()[1] for _ in range(8)]
            self.assertEqual(len(seen), len(set(seen)))
        finally:
            g.close()


if __name__ == "__main__":
    unittest.main()
