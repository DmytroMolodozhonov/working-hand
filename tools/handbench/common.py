"""Shared bits of the hand benchmark: paths, the test frames, the metrics."""

import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
DATA = os.environ.get("HANDBENCH_DATA", os.path.join(REPO, ".handbench"))
MODELS = os.path.join(REPO, "vendor", "mediapipe", "models")
sys.path.insert(0, REPO)

FINGERS = {"thumb": [1, 2, 3, 4], "index": [5, 6, 7, 8], "middle": [9, 10, 11, 12], "ring": [13, 14, 15, 16], "pinky": [17, 18, 19, 20]}


def load_cases():
    with open(os.path.join(DATA, "cases.json")) as f:
        return json.load(f)


def hand_size(kp):
    """The hand's size in pixels: the longer side of its points' box (visible points)."""
    v = kp[kp[:, 2] > 0]
    return float(max(v[:, 0].max() - v[:, 0].min(), v[:, 1].max() - v[:, 1].min()))


def categories(kp, side):
    """What the hand is doing, from its true points: fist / open / half, palm / back, turned to the camera."""
    P = kp[:, :2]
    w = P[0]
    curls = []
    for n in ("index", "middle", "ring", "pinky"):
        m, _, _, t = FINGERS[n]
        curls.append(np.linalg.norm(P[t] - w) / (np.linalg.norm(P[m] - w) + 1e-6))
    curls = np.array(curls)
    shape = "fist" if (curls < 1.15).sum() >= 3 else "open" if (curls > 1.55).sum() >= 3 else "half"
    a, b = P[5] - w, P[17] - w
    cross = a[0] * b[1] - a[1] * b[0]
    # (person facing the camera, picture not mirrored: a right hand with its palm to the camera
    # has the thumb on the picture's right → index→pinky turns this way)
    palm = (cross < 0) if side == "right" else (cross > 0)
    facing = "palm" if palm else "back"
    span = np.linalg.norm(P[5] - P[17]) + 1e-6
    toward = np.linalg.norm(P[9] - w) / span < 1.1  # (the hand's length foreshortened: pointing at the camera)
    return {"shape": shape, "facing": facing, "toward": bool(toward)}


def angle_deg(a, b):
    """Angle between two 2D directions (degrees)."""
    d = math.atan2(a[1], a[0]) - math.atan2(b[1], b[0])
    return abs((d + math.pi) % (2 * math.pi) - math.pi) * 180 / math.pi


def wand_dir(P):
    """Where the hand points (the game's wand follows it): wrist → middle knuckle."""
    return P[9] - P[0]


def score_hand(pred, kp, S):
    """Errors of one found hand against the truth: dict (or None)."""
    vis = kp[:, 2] > 0
    err = np.linalg.norm(pred[:, :2] - kp[:, :2], axis=1)[vis] / S
    return {
        "epe": float(err.mean()),
        "pck10": float((err < 0.1).mean()),
        "pck20": float((err < 0.2).mean()),
        "wand": angle_deg(wand_dir(pred), wand_dir(kp)) if vis[0] and vis[9] else None,
    }


def match(hands, kp, S):
    """The predicted hand that is this one (nearest wrist / closest overall) or None."""
    best, bd = None, 1e9
    vis = kp[:, 2] > 0
    for h in hands:
        d = np.linalg.norm(h[:, :2] - kp[:, :2], axis=1)[vis].mean()
        if d < bd:
            best, bd = h, d
    if best is None or bd > 0.6 * S:
        return None
    return best


class HandFilterPy:
    """The game's own hand filter (src/input/TrackingGuard.js HandFilter, same parameters)."""

    def __init__(self, minCutoff=0.6, beta=8, dCutoff=4, floorK=1.5, floorT=3):
        self.minCutoff, self.beta, self.dCutoff, self.floorK, self.floorT = minCutoff, beta, dCutoff, floorK, floorT
        self.P = None
        self.speed = 0.0
        self.floor = None
        self.last = None

    @staticmethod
    def alpha(c, dt):
        return 1 / (1 + 1 / (2 * math.pi * c * dt))

    def __call__(self, pts, t, size):
        if self.P is None or self.last is None or not (0 < t - self.last <= 0.5):
            self.P = pts.copy()
            self.speed = 0.0
        else:
            dt = t - self.last
            seen = math.sqrt(((pts - self.P) ** 2).sum(1).mean()) / max(1e-6, size) / dt
            if self.floor is None:
                self.floor = seen
            self.floor += (0.3 if seen < self.floor else min(1, dt / self.floorT)) * (seen - self.floor)
            raw = max(0.0, seen - self.floorK * self.floor)
            self.speed += self.alpha(self.dCutoff, dt) * (raw - self.speed)
            a = self.alpha(self.minCutoff + self.beta * self.speed, dt)
            self.P = self.P + a * (pts - self.P)
        self.last = t
        return self.P.copy()
