"""
hand_v5.py (the V5 hands): the square round a hand from the body, following the hand, and never
breaking the camera when the video card's program dies. Run: python -m unittest discover -s tests/python
"""

import math
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import hand_v5  # noqa: E402


def pose_with_hand(side, wrist, knuckles, elbow, w=640, h=480, vis=0.9):
    p = [{"x": 0.0, "y": 0.0, "z": 0.0, "visibility": 0.0} for _ in range(33)]
    iw, ip, ii, it, ie = hand_v5.POSE_SIDE[side]
    for i, (x, y) in ((iw, wrist), (ip, knuckles), (ii, knuckles), (it, knuckles), (ie, elbow)):
        p[i] = {"x": x / w, "y": y / h, "z": 0.0, "visibility": vis}
    return p


class FakeNet:
    """The joint network: answers with a hand of 21 points right where the square is, upright."""

    def __init__(self):
        self.calls = 0
        self.pres = 0.9

    def run(self, rgb, sq):
        self.calls += 1
        # a hand in the network's own 224×224: wrist at the bottom, fingers up
        pts = np.array([[112 + (i % 5 - 2) * 12, 170 - (i // 5) * 25] for i in range(21)], np.float64)
        return sq.back(pts), np.zeros(21), self.pres, 1.0


class Square(unittest.TestCase):
    def test_the_hand_comes_back_where_it_was_and_its_fingers_point_up(self):
        sq = hand_v5.Square(300, 200, 80, hand_v5._up_angle(1, 1))  # (the hand pointing down-right)
        M = sq.matrix()
        p = np.array([[300.0, 200.0], [330.0, 230.0]])
        c = (M[:, :2] @ p.T).T + M[:, 2]
        self.assertTrue(np.allclose(c[0], [112, 112], atol=1e-3))
        self.assertAlmostEqual(c[1][0], 112, places=3)  # (straight up in the network's square)
        self.assertLess(c[1][1], 112)
        self.assertTrue(np.allclose(sq.back(c), p, atol=1e-3))

    def test_from_the_body_round_the_hand_and_turned_along_it(self):
        pose = pose_with_hand("right", (300, 300), (330, 300), (220, 300))  # (the hand to the right)
        sq = hand_v5.square_from_pose(pose, "right", 640, 480)
        self.assertGreater(sq.cx, 300)
        self.assertAlmostEqual(sq.rot, math.pi / 2, places=3)
        self.assertGreater(sq.side, 2 * 30)  # (bigger than the hand: the body's knuckles are a guess)

    def test_no_wrist_seen_no_square(self):
        pose = pose_with_hand("left", (300, 300), (330, 300), (220, 300), vis=0.05)
        self.assertIsNone(hand_v5.square_from_pose(pose, "left", 640, 480))

    def test_the_knuckles_not_seen_the_hand_goes_on_along_the_forearm(self):
        pose = pose_with_hand("left", (300, 300), (300, 300), (300, 200))
        sq = hand_v5.square_from_pose(pose, "left", 640, 480)
        self.assertGreater(sq.cy, 300)  # (below the wrist: the forearm points down)


class Following(unittest.TestCase):
    def make(self):
        h = hand_v5.HandsV5.__new__(hand_v5.HandsV5)
        h.nets = {"left": FakeNet(), "right": FakeNet()}
        h.rtm = None
        h.engine = "mp"
        h.rtm_error = ""
        h.track = {"left": None, "right": None}
        h.miss = {}
        h.stats = {"runs": 0, "found": 0, "from_pose": 0, "refined": 0}
        return h

    def test_found_from_the_body_then_followed_by_itself(self):
        h = self.make()
        rgb = np.zeros((480, 640, 3), np.uint8)
        pose = pose_with_hand("right", (300, 300), (300, 270), (300, 400))
        self.assertIsNotNone(h.one(rgb, pose, "right"))
        self.assertEqual(h.stats["from_pose"], 1)
        self.assertEqual(h.stats["refined"], 1, "the first look is made twice")
        h.one(rgb, pose, "right")
        self.assertEqual(h.stats["from_pose"], 1, "then the hand's own square")
        # the body's wrist far away from the followed hand: found again from the body
        far = pose_with_hand("right", (100, 100), (100, 70), (100, 200))
        h.one(rgb, far, "right")
        self.assertEqual(h.stats["from_pose"], 2)

    def test_not_sure_it_is_a_hand_no_hand(self):
        h = self.make()
        h.nets["left"].pres = 0.05
        pose = pose_with_hand("left", (300, 300), (300, 270), (300, 400))
        self.assertIsNone(h.one(np.zeros((480, 640, 3), np.uint8), pose, "left"))
        self.assertIsNone(h.track["left"])

    def test_a_lost_hand_is_looked_for_every_other_picture(self):
        h = self.make()
        h.nets["left"].pres = 0.05
        pose = pose_with_hand("left", (300, 300), (300, 270), (300, 400))
        rgb = np.zeros((480, 640, 3), np.uint8)
        for _ in range(6):
            h.one(rgb, pose, "left")
        self.assertEqual(h.nets["left"].calls, 3)
        h.nets["left"].pres = 0.9
        for _ in range(2):
            h.one(rgb, pose, "left")
        self.assertIsNotNone(h.track["left"], "found again within two pictures")

    def test_the_video_cards_program_dies_the_hands_go_on(self):
        h = self.make()

        class Dead:
            def run(self, *a):
                raise EOFError("нет ответа")
        h.use_rtm(Dead())
        pose = pose_with_hand("left", (300, 300), (300, 270), (300, 400))
        self.assertIsNotNone(h.one(np.zeros((480, 640, 3), np.uint8), pose, "left"))
        self.assertIsNone(h.rtm)
        self.assertEqual(h.engine, "mp")
        self.assertIn("нет ответа", h.rtm_error)

    def test_streamed_as_the_game_reads_hands(self):
        h = self.make()
        pose = pose_with_hand("left", (300, 300), (300, 270), (300, 400))
        out = h.process(np.zeros((480, 640, 3), np.uint8), pose)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["side"], "left")
        self.assertEqual(out[0]["label"], "Right", "MediaPipe's mirrored label")
        self.assertEqual(len(out[0]["landmarks"]), 21)
        self.assertEqual(out[0]["landmarks"][0]["z"], 0.0, "depth from the wrist")


class Network(unittest.TestCase):
    def test_taken_out_of_the_games_task_file_and_checked(self):
        p = hand_v5.net_path()
        self.assertEqual(hand_v5.sha256_of(p), hand_v5.NET_SHA256)


if __name__ == "__main__":
    unittest.main()
