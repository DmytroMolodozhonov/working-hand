"""
Hand methods for the video benchmark (video.py): each one is .process(rgb, pose, ts_ms) →
{"left": (pts 21×2|21×3 picture px, score), "right": ...} (the person's own sides).
"v5" repeats pose_native.py's Tasks path exactly (palm detector seeds every 3rd picture while a
hand is not followed; a followed hand goes with the last picture's body).
"""

import os
import sys

import numpy as np

from common import DATA, MODELS


def _palm(mode):
    from mediapipe.tasks.python import BaseOptions, vision
    return vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "hand_landmarker.task")),
        running_mode=mode, num_hands=2,
        min_hand_detection_confidence=0.5, min_hand_presence_confidence=0.5, min_tracking_confidence=0.5))


class V5Game:
    """hand_v5.HandsV5 as the game runs it (pose_native.py, Tasks)."""

    def __init__(self, engine="mp", prev=False, **over):
        import mediapipe as mp
        from mediapipe.tasks.python import vision
        if prev:
            # the V5 before this work (kept for comparison: .handbench/hand_v5_prev.py = git show <commit>:hand_v5.py)
            sys.path.insert(0, DATA)
            import hand_v5_prev as hand_v5
        else:
            import hand_v5
        self.hv = hand_v5
        self.over = over
        self.mp = mp
        self.h = hand_v5.HandsV5(engine=engine, rtm_path=over.pop("rtm_path", None) if engine == "rtm" else None)
        self.palm = _palm(vision.RunningMode.VIDEO)
        self.n = 0
        self.last_pose = None

    def process(self, rgb, pose, ts):
        import cv2
        keep = {k: getattr(self.hv, k) for k in self.over}
        for k, v in self.over.items():
            setattr(self.hv, k, v)
        try:
            self.n += 1
            if self.h.tracking() and self.last_pose is not None:
                hands = self.h.process(rgb, self.last_pose, ts / 1000)
            else:
                seeds = None
                if self.n % 3 == 0:
                    small = cv2.resize(rgb, (640, 360), interpolation=cv2.INTER_AREA)
                    r = self.palm.detect_for_video(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=small), ts)
                    seeds = [[{"x": p.x, "y": p.y, "z": p.z} for p in lm] for lm in (r.hand_landmarks or [])]
                hands = self.h.process(rgb, pose or self.last_pose, ts / 1000, seeds=seeds)
            self.last_pose = pose or self.last_pose
        finally:
            for k, v in keep.items():
                setattr(self.hv, k, v)
        h, w = rgb.shape[:2]
        out = {}
        for hd in hands:
            p = np.array([[q["x"] * w, q["y"] * h] for q in hd["landmarks"]])
            out[hd["side"]] = (p, hd.get("presence", hd["score"]), bool(hd.get("held")), hd["score"])
        return out


class MPFull:
    """MediaPipe HandLandmarker over the whole picture (V3)."""

    def __init__(self, size=640):
        import mediapipe as mp
        from mediapipe.tasks.python import vision
        self.mp = mp
        self.size = size
        self.lm = _palm(vision.RunningMode.VIDEO)

    def process(self, rgb, pose, ts):
        import cv2
        h, w = rgb.shape[:2]
        img = rgb if self.size >= w else cv2.resize(rgb, (self.size, round(self.size * h / w)), interpolation=cv2.INTER_AREA)
        r = self.lm.detect_for_video(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)), ts)
        out = {}
        for i, lm in enumerate(r.hand_landmarks or []):
            p = np.array([[q.x * w, q.y * h] for q in lm])
            # (the side: nearer wrist of the body)
            side = None
            if pose:
                dl = np.hypot(p[0, 0] - pose[15]["x"] * w, p[0, 1] - pose[15]["y"] * h)
                dr = np.hypot(p[0, 0] - pose[16]["x"] * w, p[0, 1] - pose[16]["y"] * h)
                side = "left" if dl < dr else "right"
            else:
                side = "right" if r.handedness[i][0].category_name == "Left" else "left"
            if side not in out:
                out[side] = (p, r.handedness[i][0].score)
        return out


def make(name):
    if name == "v5":
        return V5Game()
    if name == "v5prev":
        return V5Game(prev=True)
    if name == "v5rtm":
        return V5Game(engine="rtm", rtm_path=os.path.join(DATA, "models", "rtmpose_hand.onnx"))
    if name == "mp_full":
        return MPFull(640)
    if name == "mp_full720":
        return MPFull(1280)
    if name.startswith("v5:"):
        # v5:PRESENCE=0.1,RETRY=1 — the same with other numbers
        over = {}
        for kv in name[3:].split(","):
            k, v = kv.split("=")
            over[k] = int(v) if v.lstrip("-").isdigit() else float(v)
        return V5Game(**over)
    raise ValueError(name)
