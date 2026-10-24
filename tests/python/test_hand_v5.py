"""
hand_v5.py (the V5 hands): the square round a hand from the body, following the hand, and never
breaking the camera when the video card's program dies. Run: python -m unittest discover -s tests/python
"""

import math
import os
import sys
import time
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import hand_v5  # noqa: E402
import pose_guard  # noqa: E402


def pose_with_hand(side, wrist, knuckles, elbow, w=640, h=480, vis=0.9):
    p = [{"x": 0.0, "y": 0.0, "z": 0.0, "visibility": 0.0} for _ in range(33)]
    iw, ip, ii, it, ie = hand_v5.POSE_SIDE[side]
    for i, (x, y) in ((iw, wrist), (ip, knuckles), (ii, knuckles), (it, knuckles), (ie, elbow)):
        p[i] = {"x": x / w, "y": y / h, "z": 0.0, "visibility": vis}
    return p


def hand_at(x, y):
    """A hand of 21 points in the picture: wrist at (x, y), fingers up (~30 px)."""
    return np.array([[x, y]] + [[x + (i % 4 - 1.5) * 6, y - 8 - (i // 4) * 6] for i in range(20)], np.float64)


class FakeNet:
    """The joint network: a real hand stands in the picture (self.hand); a square round it gives its
    points, a square elsewhere gives a guess the network isn't sure of."""

    def __init__(self):
        self.calls = 0
        self.pres = 0.9
        self.hand = hand_at(300, 300)

    def run(self, rgb, sq):
        self.calls += 1
        c = self.hand.mean(0)
        if math.hypot(c[0] - sq.cx, c[1] - sq.cy) < sq.side / 2:
            return self.hand.copy(), np.zeros(21), self.pres, 1.0
        return hand_at(sq.cx, sq.cy + sq.side / 4), np.zeros(21), 0.01, 1.0


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
        h.held = {"left": False, "right": False}
        h.palm = {}
        h._prev_rgb = None
        h.miss = {}
        h.stats = {"runs": 0, "found": 0, "from_pose": 0, "refined": 0, "held": 0}
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
        h.nets["right"].hand = hand_at(100, 100)
        h.one(rgb, far, "right")
        self.assertEqual(h.stats["from_pose"], 2)

    def test_not_sure_it_is_a_hand_no_hand(self):
        h = self.make()
        h.nets["left"].pres = 0.05
        pose = pose_with_hand("left", (300, 300), (300, 270), (300, 400))
        self.assertIsNone(h.one(np.zeros((480, 640, 3), np.uint8), pose, "left"))
        self.assertIsNone(h.track["left"])

    def test_a_lost_hand_the_body_sees_is_looked_for_every_picture(self):
        h = self.make()
        h.nets["left"].pres = 0.05
        pose = pose_with_hand("left", (300, 300), (300, 270), (300, 400))
        rgb = np.zeros((480, 640, 3), np.uint8)
        for _ in range(3):
            h.one(rgb, pose, "left")
        self.assertEqual(h.nets["left"].calls, 6, "every picture: the body's square and a bigger one")
        h.nets["left"].pres = 0.9
        h.one(rgb, pose, "left")
        self.assertIsNotNone(h.track["left"], "found again in the very next picture")

    def test_a_lost_hand_the_body_doesnt_see_is_looked_for_every_other_picture(self):
        h = self.make()
        h.nets["left"].pres = 0.05
        pose = pose_with_hand("left", (300, 300), (300, 270), (300, 400), vis=0.3)  # (a guess: behind the back)
        rgb = np.zeros((480, 640, 3), np.uint8)
        for _ in range(6):
            h.one(rgb, pose, "left")
        self.assertEqual(h.nets["left"].calls, 6, "3 pictures of 6, two squares each")

    def test_a_hand_the_network_doubts_is_kept_where_it_was_going(self):
        h = self.make()
        rgb = np.zeros((480, 640, 3), np.uint8)
        pose = pose_with_hand("left", (300, 300), (300, 270), (300, 400))
        self.assertIsNotNone(h.one(rgb, pose, "left"))
        h.nets["left"].pres = 0.2  # (a blurred fist: the network doubts, the hand is where it was)
        r = h.one(rgb, pose, "left")
        self.assertIsNotNone(r)
        self.assertFalse(h.held["left"], "a real look, not a held hand")
        h.nets["left"].pres = 0.05  # (nothing at all: held)
        self.assertIsNotNone(h.one(rgb, pose, "left"))
        self.assertTrue(h.held["left"])

    def test_a_lost_hand_is_held_with_the_arm_for_half_a_second_then_dropped(self):
        h = self.make()
        rgb = np.zeros((480, 640, 3), np.uint8)
        pose = pose_with_hand("left", (300, 300), (300, 270), (300, 400))
        xy, _, _ = h.one(rgb, pose, "left", now=0.0)
        h.nets["left"].pres = 0.05
        moved = pose_with_hand("left", (320, 290), (320, 260), (320, 390))  # (the arm moved 20 px right, 10 up)
        h.nets["left"].hand = hand_at(320, 290)
        r = h.one(rgb, moved, "left", now=0.1)
        self.assertTrue(h.held["left"])
        self.assertTrue(np.allclose(r[0][0], xy[0] + [20, -10], atol=1e-6), "carried by the body's wrist")
        self.assertIsNotNone(h.one(rgb, moved, "left", now=0.4))
        self.assertIsNone(h.one(rgb, moved, "left", now=0.7), "not held longer than HOLD")

    def test_a_held_hand_goes_when_the_body_no_longer_sees_the_wrist(self):
        h = self.make()
        rgb = np.zeros((480, 640, 3), np.uint8)
        h.one(rgb, pose_with_hand("left", (300, 300), (300, 270), (300, 400)), "left", now=0.0)
        h.nets["left"].pres = 0.05
        gone = pose_with_hand("left", (300, 300), (300, 270), (300, 400), vis=0.3)  # (behind the back)
        self.assertIsNone(h.one(rgb, gone, "left", now=0.1))

    def test_a_doubtful_hand_with_a_mangled_palm_is_not_taken(self):
        h = self.make()
        rgb = np.zeros((480, 640, 3), np.uint8)
        pose = pose_with_hand("left", (300, 300), (300, 270), (300, 400))
        h.one(rgb, pose, "left")
        net = h.nets["left"]
        good = net.run

        def stretched(rgb, sq):
            xy, z, _, r = good(rgb, sq)
            xy = xy.copy()
            xy[17] = xy[0] + (xy[17] - xy[0]) * 2.5  # (the pinky's knuckle far down the arm: not a palm)
            return xy, z, 0.2, r
        net.run = stretched
        h.one(rgb, pose, "left", now=time.perf_counter())
        self.assertTrue(h.held["left"], "not taken: held instead")

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

    def test_every_hand_given_passes_the_games_half(self):
        # (the game takes a hand from score 0.5 — assignHands; V5 judges its hands itself)
        h = self.make()
        rgb = np.zeros((480, 640, 3), np.uint8)
        pose = pose_with_hand("left", (300, 300), (300, 270), (300, 400))
        h.process(rgb, pose)
        h.nets["left"].pres = 0.2
        out = h.process(rgb, pose)
        self.assertGreaterEqual(out[0]["score"], 0.5)
        self.assertAlmostEqual(out[0]["presence"], 0.2)
        h.nets["left"].pres = 0.0
        out = h.process(rgb, pose)
        self.assertTrue(out[0].get("held"))
        self.assertGreaterEqual(out[0]["score"], 0.5)


def body(nose=(0.5, 0.2), shoulders=((0.42, 0.32), (0.58, 0.32)), wrists=((0.40, 0.55), (0.60, 0.55))):
    p = [{"x": 0.5, "y": 0.5, "z": 0.0, "visibility": 0.9} for _ in range(33)]
    p[0] = {"x": nose[0], "y": nose[1], "z": 0, "visibility": 0.99}
    for i, (x, y) in zip((11, 12), shoulders):
        p[i] = {"x": x, "y": y, "z": 0, "visibility": 0.99}
    for i, (sx, sy), (wx, wy) in zip((13, 14), shoulders, wrists):
        p[i] = {"x": (sx + wx) / 2, "y": (sy + wy) / 2, "z": 0, "visibility": 0.9}
    for i, (x, y) in zip((15, 16), wrists):
        p[i] = {"x": x, "y": y, "z": 0, "visibility": 0.9}
    return p


class PoseGuard(unittest.TestCase):
    """pose_guard.py: the body follower stuck on a wrong body (the author's recording: shoulders above the nose for 16 s)."""

    def test_a_standing_body_is_a_body(self):
        self.assertTrue(pose_guard.sane(body()))

    def test_shoulders_above_the_nose_are_not(self):
        self.assertFalse(pose_guard.sane(body(nose=(0.5, 0.4))))

    def test_an_arm_longer_than_a_body_could_have_is_not(self):
        self.assertFalse(pose_guard.sane(body(wrists=((0.40, 0.55), (1.18, 0.92)))))

    def test_arms_held_out_sideways_are_a_body(self):
        # (the author's recording: arms out to the sides measure up to 3.7 shoulder widths)
        self.assertTrue(pose_guard.sane(body(wrists=((0.02, 0.32), (0.98, 0.32)))))

    def test_hands_up_is_a_body(self):
        self.assertTrue(pose_guard.sane(body(wrists=((0.35, 0.05), (0.65, 0.05)))))

    def test_a_stuck_follower_is_swapped_and_the_fresh_look_is_used(self):
        # (as on the author's recording: a small body up by the head, shoulders above the nose)
        good, bad = body(), body(nose=(0.5, 0.25), shoulders=((0.47, 0.18), (0.53, 0.18)), wrists=((0.46, 0.24), (0.54, 0.24)))

        class Res:
            def __init__(self, p):
                self.pose_landmarks = [p]

        class Follower:
            def __init__(self, p):
                self.p = p
                self.closed = False

            def detect_for_video(self, img, ts):
                return Res(self.p)

            def close(self):
                self.closed = True

        class Fresh:
            def detect(self, img):
                return Res(good)
        made = []

        def make():
            made.append(Follower(bad if not made else good))  # (the first follower is the stuck one)
            return made[-1]
        g = pose_guard.PoseGuard(make, Fresh, lambda p: p)
        deadline = time.time() + 2  # (the spare is made in the background)
        while g.spare is None and time.time() < deadline:
            time.sleep(0.01)
        p1, w1 = g.run(None, 0)
        self.assertEqual(w1, "fresh")
        self.assertIs(p1, good, "the fresh look, not the stuck body")
        p2, w2 = g.run(None, 33)
        self.assertEqual(w2, "swap")
        self.assertEqual(g.swaps, 1)
        p3, w3 = g.run(None, 66)
        self.assertEqual((p3, w3), (good, ""), "the new follower follows the right body")

    def test_an_odd_body_the_fresh_look_confirms_is_kept(self):
        odd = body(nose=(0.5, 0.4))  # (bent over the camera: the head below the shoulders, really)

        class Res:
            def __init__(self, p):
                self.pose_landmarks = [p]

        class Follower:
            def detect_for_video(self, img, ts):
                return Res(odd)

            def close(self):
                pass

        class Fresh:
            def detect(self, img):
                return Res(odd)
        g = pose_guard.PoseGuard(Follower, Fresh, lambda p: p)
        for i in range(4):
            p, w = g.run(None, i * 33)
            self.assertIs(p, odd)
            self.assertEqual(w, "")
        self.assertEqual(g.swaps, 0)


class Network(unittest.TestCase):
    def test_taken_out_of_the_games_task_file_and_checked(self):
        p = hand_v5.net_path()
        self.assertEqual(hand_v5.sha256_of(p), hand_v5.NET_SHA256)


if __name__ == "__main__":
    unittest.main()
