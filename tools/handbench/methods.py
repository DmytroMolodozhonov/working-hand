"""
The hand finders the benchmark compares. Each: name → object with
  .image(rgb, pose)          one still picture → list of hands (21×3: x, y px; z)
  .video(rgb, pose, ts_ms)   the same, as a stream (may follow the hand between pictures)
  .reset()                   a new stream
`pose` is the body's 33 points (normalized dicts) for this picture, or None.
"""

import os

import numpy as np

from common import MODELS, DATA


def _mp_hands(mode, n):
    from mediapipe.tasks.python import BaseOptions, vision
    return vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "hand_landmarker.task")),
        running_mode=mode, num_hands=n,
        min_hand_detection_confidence=0.5, min_hand_presence_confidence=0.5, min_tracking_confidence=0.5))


def _mp_out(r, w, h):
    return [np.array([[p.x * w, p.y * h, p.z * w] for p in lm]) for lm in (r.hand_landmarks or [])]


class MPFull:
    """Today's V3/V4: MediaPipe HandLandmarker over the whole picture (palm detector + joints)."""

    name = "mp_full"

    def __init__(self):
        import mediapipe as mp
        from mediapipe.tasks.python import vision
        self.mp = mp
        self.img = _mp_hands(vision.RunningMode.IMAGE, 2)
        self.vision = vision
        self.vid = None

    def reset(self):
        if self.vid:
            self.vid.close()
        self.vid = _mp_hands(self.vision.RunningMode.VIDEO, 2)

    def image(self, rgb, pose):
        h, w = rgb.shape[:2]
        return _mp_out(self.img.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))), w, h)

    def video(self, rgb, pose, ts):
        if self.vid is None:
            self.reset()
        h, w = rgb.shape[:2]
        return _mp_out(self.vid.detect_for_video(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)), int(ts)), w, h)


class MPCrop:
    """Two steps with MediaPipe's whole HandLandmarker: a square from the body, enlarged, then palm detector + joints in it."""

    name = "mp_crop"

    def __init__(self):
        import mediapipe as mp
        from mediapipe.tasks.python import vision
        self.mp = mp
        self.lm = _mp_hands(vision.RunningMode.IMAGE, 1)

    def reset(self):
        pass

    def image(self, rgb, pose):
        import cv2
        import hand_v5
        h, w = rgb.shape[:2]
        out = []
        for side in ("left", "right"):
            sq = hand_v5.square_from_pose(pose, side, w, h)
            if sq is None:
                continue
            S = 256
            s = sq.side * 1.3  # (axis-aligned, a little wider: the palm detector needs room)
            k = S / s
            M = np.array([[k, 0, S / 2 - k * sq.cx], [0, k, S / 2 - k * sq.cy]], np.float32)
            crop = cv2.warpAffine(rgb, M, (S, S), flags=cv2.INTER_LINEAR)
            r = self.lm.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(crop)))
            for lm in r.hand_landmarks or []:
                p = np.array([[q.x * S, q.y * S, q.z * S] for q in lm])
                p[:, 0] = (p[:, 0] - M[0, 2]) / k
                p[:, 1] = (p[:, 1] - M[1, 2]) / k
                p[:, 2] /= k
                out.append(p)
        return out

    def video(self, rgb, pose, ts):
        return self.image(rgb, pose)


class V5:
    """V5 (hand_v5.py): the joint network straight on a turned square from the body / the followed hand."""

    def __init__(self, refine=True, name="v5", engine="mp", sticky=None):
        import hand_v5
        self.sticky = sticky
        self.hv = hand_v5
        self.h = hand_v5.HandsV5(engine=engine, rtm_path=RTMHand.PATH if engine == "rtm" else None)
        self.refine = refine
        self.name = name

    def reset(self):
        self.h.reset()

    def _run(self, rgb, pose):
        out = []
        for side in ("left", "right"):
            r = self.h.one(rgb, pose, side, refine=self.refine)
            if r is not None:
                xy, z, _ = r
                out.append(np.concatenate([xy, z[:, None]], 1))
        return out

    def image(self, rgb, pose):
        self.h.reset()
        return self._run(rgb, pose)

    def video(self, rgb, pose, ts):
        if self.sticky is None:
            return self._run(rgb, pose)
        keep = self.hv.STICKY
        self.hv.STICKY = self.sticky
        try:
            return self._run(rgb, pose)
        finally:
            self.hv.STICKY = keep


class RTMHand:
    """RTMPose hand (OpenMMLab, 21 points 2D) on the same square from the body (ONNX, onnxruntime)."""

    name = "rtmpose_hand"
    PATH = os.path.join(DATA, "models", "rtmpose_hand.onnx")

    def __init__(self):
        import onnxruntime as ort
        if not os.path.exists(self.PATH):
            raise FileNotFoundError(self.PATH)
        self.s = ort.InferenceSession(self.PATH, providers=["CPUExecutionProvider"])
        i = self.s.get_inputs()[0]
        self.inp = i.name
        self.H, self.W = i.shape[2], i.shape[3]
        self.mean = np.array([123.675, 116.28, 103.53], np.float32)
        self.std = np.array([58.395, 57.12, 57.375], np.float32)

    def reset(self):
        pass

    GATE = 0.15

    def _one(self, rgb, cx, cy, s):
        import cv2
        k = self.W / s
        M = np.array([[k, 0, self.W / 2 - k * cx], [0, k, self.H / 2 - k * cy]], np.float32)
        crop = cv2.warpAffine(rgb, M, (self.W, self.H), flags=cv2.INTER_LINEAR)
        x = ((crop.astype(np.float32) - self.mean) / self.std).transpose(2, 0, 1)[None]
        sx, sy = self.s.run(None, {self.inp: x})
        px = sx[0].argmax(1) / (sx.shape[2] / self.W)
        py = sy[0].argmax(1) / (sy.shape[2] / self.H)
        conf = np.minimum(sx[0].max(1), sy[0].max(1))
        return np.stack([(px - M[0, 2]) / k, (py - M[1, 2]) / k, np.zeros(21)], 1), float(np.mean(conf))

    def image(self, rgb, pose):
        import hand_v5
        h, w = rgb.shape[:2]
        out = []
        for side in ("left", "right"):
            sq = hand_v5.square_from_pose(pose, side, w, h)
            if sq is None:
                continue
            # (RTMPose wants an upright box: axis-aligned around the body's guess, then a second
            # look from its own points' box ×1.25 — the same two looks V5 gets)
            p, conf = self._one(rgb, sq.cx, sq.cy, sq.side * 0.9)
            if conf < self.GATE:
                continue
            lo, hi = p[:, :2].min(0), p[:, :2].max(0)
            p2, conf2 = self._one(rgb, (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, max(hi - lo) * 1.25 + 4)
            out.append(p2 if conf2 >= self.GATE else p)
        return out

    def video(self, rgb, pose, ts):
        return self.image(rgb, pose)


def make(name):
    if name == "mp_full":
        return MPFull()
    if name == "mp_crop":
        return MPCrop()
    if name == "v5":
        return V5(True, "v5")
    if name == "v5_1pass":
        return V5(False, "v5_1pass")
    if name == "v5_loose":
        return V5(True, "v5_loose", sticky=0)
    if name == "v5_rtm_loose":
        return V5(True, "v5_rtm_loose", engine="rtm", sticky=0)
    if name == "v5_rtm":
        return V5(True, "v5_rtm", engine="rtm")
    if name == "rtmpose_hand":
        return RTMHand()
    raise KeyError(name)
