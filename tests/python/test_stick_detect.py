"""
Unit tests of stick_detect.py on drawn pictures: a hand (palm, fingers, forearm drawn
from its 21 points) with and without a stick (a pen / a brush) held in it.
Run: python -m unittest discover -s tests/python   (needs numpy + opencv)
"""

import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

try:
    import cv2
    import numpy as np
except Exception:  # noqa: BLE001
    cv2 = None

import stick_detect  # noqa: E402

W, H = 640, 480


def hand_points(wx, wy, size=60, angle=0.0, curl=0.5, mirror=False):
    """21 hand points (pixels): fingers towards `angle` (0 = up in the picture), half closed round a grip."""
    bases = [(-0.35, -0.25), (-0.2, -0.85), (0, -0.9), (0.18, -0.85), (0.33, -0.75)]
    lens = [0.45, 0.75, 0.82, 0.75, 0.6]
    out = [(0.0, 0.0)]
    for f, (bx, by) in enumerate(bases):
        bx = -bx if mirror else bx
        px, py = bx, by
        out.append((px, py))
        L = lens[f] / 3
        for j in range(1, 4):
            a = (curl * (0.5 if f == 0 else 1.0)) * math.pi * 0.35 * j
            px, py = px + (math.sin(a) * (0.6 if f == 0 else 0.25) * (1 if not mirror else -1)) * L, py - math.cos(a) * L
            out.append((px, py))
    c, s = math.cos(angle), math.sin(angle)
    return [(wx + size * (x * c - y * s), wy + size * (x * s + y * c)) for x, y in out]


def draw(hands, sticks=(), clutter=False, seed=1, under=False):
    rng = np.random.default_rng(seed)
    img = np.full((H, W, 3), (90, 110, 120), np.uint8)
    img = (img + rng.normal(0, 6, img.shape)).clip(0, 255).astype(np.uint8)
    if clutter:
        for _ in range(6):  # a room: door frames, shelves far from the hands
            x = int(rng.integers(0, 120))
            cv2.line(img, (x, 0), (x + int(rng.integers(-30, 30)), H), (40, 40, 40), 3)
        cv2.line(img, (W - 60, 0), (W - 40, H), (200, 200, 200), 4)
    skin = (120, 160, 210)
    if under:
        _sticks(img, sticks)  # (held in the fingers: they cover it)
    for pts in hands:
        p = np.array(pts, np.int32)
        # the forearm down from the wrist
        wx, wy = pts[0]
        mx, my = pts[9]
        dx, dy = wx - mx, wy - my
        n = math.hypot(dx, dy)
        dx, dy = dx / n, dy / n
        cv2.line(img, (int(wx), int(wy)), (int(wx + dx * 200), int(wy + dy * 200)), (110, 150, 200), 40)
        cv2.fillConvexPoly(img, cv2.convexHull(p[[0, 1, 2, 5, 9, 13, 17]]), skin)
        for chain in ([1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]):
            for a, b in zip(chain, chain[1:]):
                cv2.line(img, tuple(p[a]), tuple(p[b]), skin, 11)
    if not under:
        _sticks(img, sticks)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def _sticks(img, sticks):
    for (x0, y0), ang, length, width, col in sticks:
        # (the stick through the grip: a little behind it and far ahead)
        dx, dy = math.sin(ang), -math.cos(ang)
        a = (int(x0 - dx * length * 0.2), int(y0 - dy * length * 0.2))
        b = (int(x0 + dx * length), int(y0 + dy * length))
        cv2.line(img, a, b, col, width)


def norm(pts):
    return [{"x": x / W, "y": y / H} for x, y in pts]


def grip(pts):
    return ((pts[3][0] + pts[5][0]) / 2, (pts[3][1] + pts[5][1]) / 2)


def angle_of(d):
    return math.atan2(d[0], -d[1])


@unittest.skipIf(cv2 is None, "no OpenCV")
class StickDetect(unittest.TestCase):
    def test_a_stick_is_found_at_any_angle(self):
        worst = 0
        for hang in (-0.6, 0.0, 0.5, 1.2):
            for rel in (-0.5, -0.2, 0.2, 0.5):
                pts = hand_points(320, 300, 55, hang)
                ang = hang + rel
                img = draw([pts], [(grip(pts), ang, 190, 7, (40, 30, 20))], under=rel > 0)
                s = stick_detect.find_stick(img, norm(pts))
                self.assertIsNotNone(s, f"hand {hang}, stick {ang}: not found")
                err = abs(math.remainder(angle_of(s["dir"]) - ang, 2 * math.pi))
                worst = max(worst, err)
                self.assertLess(err, math.radians(4), f"hand {hang}, stick {ang}: {math.degrees(err):.1f}° off")
                self.assertGreater(s["out"], 1.0)
                self.assertGreater(s["conf"], 0.5)

    def test_a_light_brush_on_a_dark_sleeve_too(self):
        pts = hand_points(300, 280, 60, 0.3)
        img = draw([pts], [(grip(pts), 0.6, 200, 6, (230, 230, 230))])
        s = stick_detect.find_stick(img, norm(pts))
        self.assertIsNotNone(s)
        self.assertLess(abs(math.remainder(angle_of(s["dir"]) - 0.6, 2 * math.pi)), math.radians(4))

    def test_no_stick_no_answer(self):
        for hang in (-0.6, 0.0, 0.5, 1.2):
            for curl in (0.0, 0.5, 1.0):
                pts = hand_points(320, 300, 55, hang, curl)
                img = draw([pts], clutter=True, seed=int(hang * 10 + curl * 3 + 20))
                self.assertIsNone(stick_detect.find_stick(img, norm(pts)), f"hand {hang} curl {curl}: a stick seen where none is")

    def test_lines_far_from_the_hand_are_not_a_stick(self):
        pts = hand_points(400, 300, 50, 0.2)
        img = draw([pts], [((150, 200), 0.3, 250, 7, (30, 30, 30))], clutter=True)
        self.assertIsNone(stick_detect.find_stick(img, norm(pts)))

    def test_both_hands_each_its_own(self):
        r = hand_points(220, 300, 50, -0.3, mirror=True)
        l = hand_points(440, 300, 50, 0.4)
        img = draw([r, l], [(grip(l), 0.9, 170, 7, (30, 30, 30))])
        sticks = stick_detect.find_sticks(img, [norm(r), norm(l)])
        self.assertEqual(len(sticks), 1)
        self.assertAlmostEqual(sticks[0]["wrist"][0], 440 / W, places=3)
        self.assertLess(abs(math.remainder(angle_of(sticks[0]["dir"]) - 0.9, 2 * math.pi)), math.radians(4))

    def test_a_short_stub_in_the_fist_is_not_enough(self):
        pts = hand_points(320, 300, 55, 0.0)
        img = draw([pts], [(grip(pts), 0.3, 35, 7, (30, 30, 30))])
        self.assertIsNone(stick_detect.find_stick(img, norm(pts)))

    def test_fast(self):
        import time
        pts = hand_points(320, 300, 55, 0.2)
        img = draw([pts], [(grip(pts), 0.5, 190, 7, (40, 30, 20))])
        t = time.perf_counter()
        for _ in range(20):
            stick_detect.find_stick(img, norm(pts))
        self.assertLess((time.perf_counter() - t) / 20 * 1000, 15)


if __name__ == "__main__":
    unittest.main()
