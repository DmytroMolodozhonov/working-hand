"""
tune.py — the few numbers of V5's square (hand_v5.py: POSE_CENTER, POSE_SCALE, PRESENCE) chosen on
the benchmark's own «dev» part only (the report is made on the other part, «test»).

    python tools/handbench/tune.py
"""

import itertools
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, load_cases, match, score_hand  # noqa: E402
import bench  # noqa: E402
import hand_v5  # noqa: E402


def frames(cases, sizes=(32, 48)):
    pose = bench.PoseRunner()
    out = []
    for ci, case in enumerate(cases):
        img = cv2.imread(os.path.join(DATA, "images", case["file"]))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        kp0 = np.array(case["kp"])
        for S in sizes:
            if bench.hand_size(kp0) < S * 1.25:
                continue
            rng = np.random.default_rng(ci * 101 + S)
            fr, kp, body = bench.synth(img, case, S, "480", int(rng.integers(1 << 30)))
            p, _ = pose(fr, kp, body, case["side"], S, rng)
            out.append((fr, p, kp, S, case["side"]))
    return out


def run(fs, hv, refine=True):
    found = pck = 0
    for fr, p, kp, S, side in fs:
        hv.reset()
        hands = []
        for sd in ("left", "right"):
            r = hv.one(fr, p, sd, refine=refine)
            if r is not None:
                hands.append(np.c_[r[0], r[1]])
        g = match(hands, kp, S)
        if g is not None:
            found += 1
            pck += score_hand(g, kp, S)["pck20"]
    return found / len(fs), pck / len(fs)


def main():
    cases = [c for i, c in enumerate(load_cases()) if i % 10 < 3]
    fs = frames(cases[: int(os.environ.get("TUNE_N", "120"))])
    hv = hand_v5.HandsV5()
    print(f"кадров: {len(fs)}")
    best = None
    for pc, ps, pr in itertools.product([0.6, 0.9, 1.2], [2.6, 3.4, 4.2], [0.2, 0.35, 0.5]):
        hand_v5.POSE_CENTER, hand_v5.POSE_SCALE, hand_v5.PRESENCE = pc, ps, pr
        f, p = run(fs, hv)
        print(f"  center={pc} scale={ps} presence={pr}: найдено {f:.0%}, PCK@0.2 {p:.0%}")
        if best is None or p > best[0]:
            best = (p, pc, ps, pr)
    print("лучшее:", best)


if __name__ == "__main__":
    main()
