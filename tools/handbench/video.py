"""
Video benchmark of the hands: the author's own camera recording, picture by picture, as the game's
camera program sees it (pose_native.py: 1280×720, the body from a 640-wide copy, V5 hands).

  python tools/handbench/video.py VIDEO [--fps 30] [--method v5] [--out DIR] [--max N]

The video is never copied anywhere: only numbers are written (per picture, per hand: found or not,
how sure, the 21 points) to DIR (default .handbench/video/<name>/<method>.npz). The body's points
are worked out once and kept (pose.npz) so that every hand method sees the same body.

Report: python tools/handbench/video_report.py DIR
"""

import argparse
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import DATA, MODELS, REPO  # noqa: E402

sys.path.insert(0, REPO)


def frames(path, fps, max_n=None):
    """The video's pictures at the camera's size (1280×720) and rate, RGB."""
    import cv2
    cap = cv2.VideoCapture(path)
    src = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, round(src / fps))
    i = n = 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if i % step == 0:
            ok, bgr = cap.retrieve()
            if not ok:
                break
            if bgr.shape[1] != 1280:
                bgr = cv2.resize(bgr, (1280, round(1280 * bgr.shape[0] / bgr.shape[1])), interpolation=cv2.INTER_AREA)
            yield n, int(i * 1000 / src), cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            n += 1
            if max_n and n >= max_n:
                break
        i += 1
    cap.release()


def pose_track(path, fps, out, max_n=None):
    """The body (as pose_native.py: pose_landmarker_full on a 640-wide copy, VIDEO mode) → pose.npz."""
    f = os.path.join(out, "pose.npz")
    if os.path.exists(f):
        d = np.load(f)
        return d["pose"], d["ts"]
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision
    pl = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "pose_landmarker_full.task")),
        running_mode=vision.RunningMode.VIDEO, num_poses=1,
        min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5, min_tracking_confidence=0.5))
    poses, tss = [], []
    for n, ts, rgb in frames(path, fps, max_n):
        small = cv2.resize(rgb, (640, 360), interpolation=cv2.INTER_AREA)
        r = pl.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=small), ts)
        p = np.full((33, 4), np.nan, np.float32)
        if r.pose_landmarks:
            p = np.array([[q.x, q.y, q.z, q.visibility] for q in r.pose_landmarks[0]], np.float32)
        poses.append(p)
        tss.append(ts)
    pl.close()
    pose, ts = np.stack(poses), np.array(tss)
    np.savez_compressed(f, pose=pose, ts=ts)
    return pose, ts


def pose_track_guard(path, fps, out, max_n=None):
    """The body as the game takes it now: the same follower, kept from getting stuck (pose_guard.py)."""
    f = os.path.join(out, "pose_guard.npz")
    if os.path.exists(f):
        d = np.load(f)
        return d["pose"], d["ts"]
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision
    import pose_guard
    from concurrent.futures import ThreadPoolExecutor
    model = os.path.join(MODELS, "pose_landmarker_full.task")

    def make(mode):
        return lambda: vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model), running_mode=mode, num_poses=1,
            min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5, min_tracking_confidence=0.5))

    def pts(lm):
        return [{"x": q.x, "y": q.y, "z": q.z, "visibility": q.visibility} for q in lm]
    g = pose_guard.PoseGuard(make(vision.RunningMode.VIDEO), make(vision.RunningMode.IMAGE), pts)
    pool = ThreadPoolExecutor(2)
    poses, tss, what = [], [], []
    import time as _t
    _t.sleep(1.0)  # (the spare follower is made in the background, as in the game long before a stuck body)
    for n, ts, rgb in frames(path, fps, max_n):
        small = cv2.resize(rgb, (640, 360), interpolation=cv2.INTER_AREA)
        pl, w = g.run(mp.Image(image_format=mp.ImageFormat.SRGB, data=small), ts, pool)
        p = np.full((33, 4), np.nan, np.float32)
        if pl:
            p = np.array([[q["x"], q["y"], q["z"], q["visibility"]] for q in pl], np.float32)
        poses.append(p)
        tss.append(ts)
        what.append(w)
    g.close()
    pose, ts = np.stack(poses), np.array(tss)
    np.savez_compressed(f, pose=pose, ts=ts)
    print(f"страж тела: замен {g.swaps}, свежих взглядов вместо слежения {sum(1 for w in what if w)}")
    return pose, ts


def pose_dicts(p):
    if np.isnan(p[0, 0]):
        return None
    return [{"x": float(q[0]), "y": float(q[1]), "z": float(q[2]), "visibility": float(q[3])} for q in p]


def make_method(name):
    """A hand method: object with .process(rgb, pose_dicts, ts) → {side: (pts 21×2 px, score)}."""
    import methods_video
    return methods_video.make(name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--fps", type=float, default=30)
    ap.add_argument("--method", default="v5")
    ap.add_argument("--out", default=None)
    ap.add_argument("--max", type=int, default=None)
    ap.add_argument("--pose", default="guard", help="guard (pose_guard.py, as the game now) / plain (the follower alone)")
    a = ap.parse_args()
    name = os.path.splitext(os.path.basename(a.video))[0]
    out = a.out or os.path.join(DATA, "video", name)
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    pose, ts = (pose_track_guard if a.pose == "guard" else pose_track)(a.video, a.fps, out, a.max)
    print(f"тело: {len(pose)} кадров, {time.time() - t0:.0f} с")
    for mname in a.method.split(","):
        m = make_method(mname)
        N = len(pose)
        found = np.zeros((N, 2), bool)
        score = np.zeros((N, 2), np.float32)
        held = np.zeros((N, 2), bool)
        gscore = np.zeros((N, 2), np.float32)  # (the score the game gets: it takes a hand from 0.5)
        pts = np.full((N, 2, 21, 3), np.nan, np.float32)
        cost = np.zeros(N, np.float32)
        t1 = time.time()
        for n, t, rgb in frames(a.video, a.fps, a.max):
            if n >= N:
                break
            c0 = time.perf_counter()
            r = m.process(rgb, pose_dicts(pose[n]), t)
            cost[n] = (time.perf_counter() - c0) * 1000
            for k, side in enumerate(("left", "right")):
                if side in r and r[side] is not None:
                    p, s = r[side][:2]
                    found[n, k] = True
                    score[n, k] = s
                    held[n, k] = len(r[side]) > 2 and r[side][2]
                    gscore[n, k] = r[side][3] if len(r[side]) > 3 else 1.0
                    pts[n, k, :, :p.shape[1]] = p
        tag = mname.replace(":", "_").replace("=", "").replace(",", "_")
        np.savez_compressed(os.path.join(out, f"{tag}{'' if a.pose == 'guard' else '@plain'}.npz"), found=found, score=score, held=held, gscore=gscore, pts=pts, cost=cost)
        print(f"{mname}: найдено L {found[:, 0].mean():.1%} R {found[:, 1].mean():.1%} (держится {held.mean():.1%}), {cost.mean():.1f} мс/кадр, {time.time() - t1:.0f} с")
    with open(os.path.join(out, "info.json"), "w") as f:
        json.dump({"video": os.path.basename(a.video), "fps": a.fps, "frames": int(len(pose))}, f)


if __name__ == "__main__":
    main()
