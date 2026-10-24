"""
The reference («truth») of the video benchmark, made slowly, offline, with everything at hand:
  * the body from each picture on its own (PoseLandmarker IMAGE mode — never stuck on an old guess);
  * each hand looked for with many squares (from the body at four sizes and three turns, from the
    hand's own points in the picture before — forwards and backwards in time), MediaPipe's joint
    network on each, the surest wins; RTMPose looks at the same hand as a second opinion.

  python tools/handbench/video_ref.py VIDEO [--fps 30]   → .handbench/video/<name>/ref.npz

ref.npz: pose (N×33×4), pts (N×2×21×2), pres (N×2: the joint network's best), agree (N×2: MediaPipe and
RTMPose agree, in hand sizes), inview (N×2: the body's wrist is inside the picture and seen).
"""

import argparse
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import DATA, MODELS, REPO  # noqa: E402
from video import frames  # noqa: E402

sys.path.insert(0, REPO)
import hand_v5  # noqa: E402

SIDES = ("left", "right")


def pose_image(path, fps, out):
    f = os.path.join(out, "pose_img.npz")
    if os.path.exists(f):
        return np.load(f)["pose"]
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision
    pl = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "pose_landmarker_heavy.task")),
        running_mode=vision.RunningMode.IMAGE, num_poses=1))
    out_p = []
    for n, ts, rgb in frames(path, fps):
        small = cv2.resize(rgb, (960, 540), interpolation=cv2.INTER_AREA)
        r = pl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=small))
        p = np.full((33, 4), np.nan, np.float32)
        if r.pose_landmarks:
            p = np.array([[q.x, q.y, q.z, q.visibility] for q in r.pose_landmarks[0]], np.float32)
        out_p.append(p)
    pose = np.stack(out_p)
    np.savez_compressed(f, pose=pose)
    return pose


def pdicts(p):
    if np.isnan(p[0, 0]):
        return None
    return [{"x": float(q[0]), "y": float(q[1]), "z": float(q[2]), "visibility": float(q[3])} for q in p]


def scaled(sq, k, turn=0.0):
    return hand_v5.Square(sq.cx, sq.cy, sq.side * k, sq.rot + turn)


def best_hand(net, rgb, cands):
    """The surest of the squares (+ one more look from the hand's own points)."""
    best = None
    for sq in cands:
        xy, z, pres, _ = net.run(rgb, sq)
        if best is None or pres > best[2]:
            best = (xy, z, pres)
    if best is not None and best[2] > 0.2:
        xy, z, pres, _ = net.run(rgb, hand_v5.square_from_hand(best[0]))
        if pres > best[2]:
            best = (xy, z, pres)
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--fps", type=float, default=30)
    a = ap.parse_args()
    name = os.path.splitext(os.path.basename(a.video))[0]
    out = os.path.join(DATA, "video", name)
    os.makedirs(out, exist_ok=True)
    pose = pose_image(a.video, a.fps, out)
    N = len(pose)
    print(f"тело (каждый кадр отдельно): {N}")
    net = hand_v5.HandNet(threads=4)
    rtm = hand_v5.RTMNet(os.path.join(DATA, "models", "rtmpose_hand.onnx"), threads=4)
    res = {}
    imgs = None
    for direction in (1, -1):
        prev = {s: None for s in SIDES}
        order = range(N) if direction == 1 else range(N - 1, -1, -1)
        if imgs is None:
            # (the pictures are needed twice: kept small in memory as JPEG)
            import cv2
            imgs = [cv2.imencode(".jpg", rgb, [cv2.IMWRITE_JPEG_QUALITY, 95])[1] for _, _, rgb in frames(a.video, a.fps)]
        for n in order:
            import cv2
            rgb = cv2.imdecode(imgs[n], cv2.IMREAD_COLOR)  # (RGB kept as is: encoded RGB, decoded the same)
            pd = pdicts(pose[n])
            for k, side in enumerate(SIDES):
                cands = []
                sq = hand_v5.square_from_pose(pd, side, 1280, 720) if pd else None
                if sq is not None:
                    for s in (0.8, 1.0, 1.4, 2.0):
                        for t in (0.0, -0.5, 0.5):
                            cands.append(scaled(sq, s, t))
                if prev[side] is not None:
                    hs = hand_v5.square_from_hand(prev[side])
                    cands += [hs, scaled(hs, 1.3)]
                b = best_hand(net, rgb, cands) if cands else None
                prev[side] = b[0] if b is not None and b[2] > 0.5 else None
                key = (n, k)
                if b is not None and (key not in res or b[2] > res[key][2]):
                    res[key] = b
            if n % 200 == 0:
                print(f"  {'вперёд' if direction == 1 else 'назад'} {n}")
    pts = np.full((N, 2, 21, 2), np.nan, np.float32)
    pres = np.zeros((N, 2), np.float32)
    agree = np.full((N, 2), np.nan, np.float32)
    for (n, k), (xy, z, p) in res.items():
        pts[n, k] = xy
        pres[n, k] = p
    for n in range(N):
        import cv2
        rgb = cv2.imdecode(imgs[n], cv2.IMREAD_COLOR)
        for k in range(2):
            if pres[n, k] > 0.3:
                q = pts[n, k]
                p2, conf = rtm.run(rgb, *hand_v5.box_of(q))
                size = max(np.ptp(q, 0).max(), 4)
                agree[n, k] = max(np.hypot(*(p2[0] - q[0])), np.hypot(*(p2[9] - q[9]))) / size
    inview = np.zeros((N, 2), bool)
    for n in range(N):
        for k, i in enumerate((15, 16)):
            x, y, _, v = pose[n, i]
            inview[n, k] = (not np.isnan(x)) and v > 0.5 and 0.01 < x < 0.99 and 0.01 < y < 0.99
    np.savez_compressed(os.path.join(out, "ref.npz"), pose=pose, pts=pts, pres=pres, agree=agree, inview=inview)
    print("эталон готов:", "уверенно L {:.0%} R {:.0%}".format(*(pres > 0.5).mean(0)), "в кадре L {:.0%} R {:.0%}".format(*inview.mean(0)))


if __name__ == "__main__":
    main()
