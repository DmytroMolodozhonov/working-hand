"""
Report of the video benchmark: python tools/handbench/video_report.py [DIR] [--methods a,b] [--from S] [--to S]

Against ref.npz (video_ref.py). A hand counts where the body (each picture on its own) sees its wrist in
the picture. For every method, of those pictures:
  * «есть в игре» — the hand reaches the game (found and its score ≥ 0.5, as assignHands takes it);
  * «верно» — it reaches the game AND is where the reference has it (wrist and middle knuckle within
    0.5 of the hand's size), or the reference itself is unsure there (counted by the body's wrist, 1 size);
  * «мимо» — it reaches the game far from the reference (a wrong hand: worse than none);
  * провалы — runs of pictures without the hand (in a row), the longest one, how many ≥ 5 pictures;
  * кулак — the same «верно» only where the reference hand is a fist (its fingertips by the palm).
"""

import argparse
import glob
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import DATA  # noqa: E402


def fist(p):
    w = p[0]
    k = 0
    for m, t in ((5, 8), (9, 12), (13, 16), (17, 20)):
        if np.hypot(*(p[t] - w)) < 1.15 * np.hypot(*(p[m] - w)):
            k += 1
    return k >= 3


def runs(miss):
    out, c = [], 0
    for m in miss:
        if m:
            c += 1
        elif c:
            out.append(c)
            c = 0
    if c:
        out.append(c)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir", nargs="?", default=None)
    ap.add_argument("--methods", default=None)
    ap.add_argument("--from", dest="t0", type=float, default=0)
    ap.add_argument("--to", dest="t1", type=float, default=1e9)
    a = ap.parse_args()
    d = a.dir or sorted(glob.glob(os.path.join(DATA, "video", "*")))[-1]
    ref = np.load(os.path.join(d, "ref.npz"))
    fps = 30
    N = len(ref["pres"])
    sel = np.zeros(N, bool)
    sel[int(a.t0 * fps):int(min(N, a.t1 * fps))] = True
    inview = ref["inview"] & sel[:, None]
    rp, rpres, ragree = ref["pts"], ref["pres"], ref["agree"]
    sure = (rpres > 0.5) & (np.nan_to_num(ragree, nan=9) < 0.35)
    pose = ref["pose"]
    names = a.methods.split(",") if a.methods else sorted(os.path.splitext(os.path.basename(f))[0] for f in glob.glob(os.path.join(d, "*.npz"))
                                                       if os.path.basename(f) not in ("ref.npz", "pose.npz", "pose_img.npz", "pose_guard.npz"))
    print(f"видео: {os.path.basename(d)}, кадров {N} (30/с), рука в кадре: L {inview[:, 0].sum()} R {inview[:, 1].sum()}, "
          f"эталон уверен: {(sure & inview).sum() / max(1, inview.sum()):.0%}")
    hdr = "| способ | есть в игре | верно | мимо | держится | провалов ≥5 кадров | самый долгий провал | кулак: верно (n) | мс/кадр |"
    print(hdr)
    print("|" + "---|" * (hdr.count("|") - 1))
    for nm in names:
        f = os.path.join(d, nm + ".npz")
        if not os.path.exists(f):
            continue
        m = np.load(f)
        game = m["found"] & (m["gscore"] >= 0.5 if "gscore" in m else True)
        held = m["held"] if "held" in m else np.zeros_like(game)
        P = m["pts"][..., :2]
        good = np.zeros_like(game)
        wrong = np.zeros_like(game)
        fists = np.zeros_like(game)
        for n in range(N):
            for k in range(2):
                if not inview[n, k]:
                    continue
                if sure[n, k]:
                    q = rp[n, k]
                    size = max(np.ptp(q, 0).max(), 4)
                    fists[n, k] = fist(q)
                    if game[n, k]:
                        e = max(np.hypot(*(P[n, k, 0] - q[0])), np.hypot(*(P[n, k, 9] - q[9]))) / size
                        good[n, k] = e < 0.5
                        wrong[n, k] = e >= 0.5
                elif game[n, k]:
                    wx, wy = pose[n, 15 + k, 0] * 1280, pose[n, 15 + k, 1] * 720
                    sh = np.hypot((pose[n, 11, 0] - pose[n, 12, 0]) * 1280, (pose[n, 11, 1] - pose[n, 12, 1]) * 720)
                    good[n, k] = np.hypot(P[n, k, 0, 0] - wx, P[n, k, 0, 1] - wy) < 0.6 * sh
                    wrong[n, k] = not good[n, k]
        tot = inview.sum()
        gaps = []
        for k in range(2):
            miss = (~game[:, k]) & inview[:, k]
            # (a gap is a run of pictures in view without the hand)
            r = runs(miss[inview[:, k]])
            gaps += r
        fm = fists & inview
        print(f"| {nm} | {(game & inview).sum() / tot:.1%} | **{good.sum() / tot:.1%}** | {wrong.sum() / tot:.1%} | {(held & game & inview).sum() / tot:.1%} | "
              f"{sum(1 for g in gaps if g >= 5)} | {max(gaps or [0])} | {(good & fm).sum() / max(1, fm.sum()):.0%} ({fm.sum()}) | {m['cost'].mean():.1f} |")


if __name__ == "__main__":
    main()
