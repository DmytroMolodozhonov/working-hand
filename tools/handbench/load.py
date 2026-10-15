"""
load.py — what the camera program costs the computer: V3 (MediaPipe's own hands) against V5.

The whole camera program (pose_native.py: body + face + hands, as in the game) runs on a test video
for a while in each mode; measured: pictures a second, the time of one picture, and the processor
time it takes (all its threads together; 100% = one core busy).

    python tools/handbench/load.py [--seconds 20]
"""

import argparse
import json
import os
import sys
import time

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, REPO, hand_size, load_cases  # noqa: E402


def make_video(path, size):
    """A person far from the camera (a COCO photo shrunk so the hand is ~7% of the picture's height:
    33 px at 480, 50 px at 720 — as our player at his place), moving a little."""
    W, H = size
    # (a person seen whole, tall against the hand, with a hand big enough in the photo)
    case = max((c for c in load_cases() if hand_size(np.array(c["kp"])) > 55),
               key=lambda c: min(c["person"][3] / hand_size(np.array(c["kp"])), 9))
    img = cv2.imread(os.path.join(DATA, "images", case["file"]))
    kp = np.array(case["kp"])
    f = min(0.07 * H / hand_size(kp), 0.95 * H / case["person"][3])
    img = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    bx, by, bw, bh = (v * f for v in case["person"])
    cx, cy = bx + bw / 2, by + bh / 2
    wv = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), 30, (W, H))
    for t in range(90):
        M = np.float32([[1, 0, W / 2 - cx + 0.01 * W * np.sin(t / 9)], [0, 1, H / 2 - cy + 0.005 * H * np.cos(t / 7)]])
        wv.write(cv2.warpAffine(img, M, (W, H), borderValue=(110, 110, 110)))
    wv.release()


def measure(hands, seconds):
    from pose_native import POSE
    POSE.clients = 1
    POSE.start(quality=1, hands=hands)
    t_end = time.time() + 300
    while time.time() < t_end:  # (ready: running, and the V5 hands if asked for)
        time.sleep(0.2)
        d = json.loads(POSE.latest) if POSE.latest else {}
        if POSE.state == "running" and (hands != "v5" or d.get("handsEngine") == "v5"):
            break
    time.sleep(2)
    seq0, c0, t0 = POSE.seq, time.process_time(), time.perf_counter()
    costs = []
    while time.perf_counter() - t0 < seconds:
        time.sleep(0.25)
        costs.append(POSE.cost)
    n = POSE.seq - seq0
    dt = time.perf_counter() - t0
    cpu = time.process_time() - c0
    d = json.loads(POSE.latest)
    POSE.stop()
    time.sleep(1.5)
    return {"fps": n / dt, "cost_ms": float(np.median(costs)), "cpu_ms_per_frame": cpu / max(1, n) * 1000,
            "cpu_cores": cpu / dt, "hands_seen": len(d.get("hands") or []), "engine": d.get("v5Engine") or d.get("handsEngine")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=20)
    a = ap.parse_args()
    out = {}
    for name, hands, size in (("V3 (640×480)", "", (640, 480)), ("V5 (1280×720)", "v5", (1280, 720))):
        path = os.path.join(DATA, f"load_far_{size[0]}.avi")
        if not os.path.exists(path):
            make_video(path, size)
        os.environ["ZNS_CAMERA_FILE"] = path
        sys.path.insert(0, REPO)
        out[name] = measure(hands, a.seconds)
        r = out[name]
        print(name, {k: round(v, 2) if isinstance(v, float) else v for k, v in r.items()},
              f"→ at the camera's 30 pictures a second: {r['cpu_ms_per_frame'] * 30 / 10:.0f}% of one core")
    return out


if __name__ == "__main__":
    main()
