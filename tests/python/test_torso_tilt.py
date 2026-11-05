"""The back's lean from the network's 3-D body (pose_guard.torso_tilt): «ходьба назад» — straight 0°, leaning back +, forward −."""
import math
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from pose_guard import PoseGuard  # noqa: E402


def body(lean_deg):
    a = math.radians(lean_deg)
    pts = [types.SimpleNamespace(x=0.0, y=0.0, z=0.0) for _ in range(33)]
    for i, x in ((11, 0.2), (12, -0.2)):
        pts[i] = types.SimpleNamespace(x=x, y=-0.5 * math.cos(a), z=0.5 * math.sin(a))  # (y down; z away from the camera)
    for i, x in ((23, 0.15), (24, -0.15)):
        pts[i] = types.SimpleNamespace(x=x, y=0.0, z=0.0)
    return types.SimpleNamespace(pose_world_landmarks=[pts])


class TorsoTilt(unittest.TestCase):
    def test_tilt(self):
        self.assertLess(abs(PoseGuard.torso_tilt(body(0))["back"]), 0.2)
        self.assertLess(abs(PoseGuard.torso_tilt(body(15))["back"] - 15), 0.3)
        self.assertLess(PoseGuard.torso_tilt(body(-10))["back"], -9)
        self.assertIsNone(PoseGuard.torso_tilt(types.SimpleNamespace(pose_world_landmarks=[])))
