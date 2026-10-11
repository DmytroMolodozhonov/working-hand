"""
stick_detect.py — a real stick in the player's hand (a pen, a paintbrush, a wand).

The camera network sees the hand's 21 points, but not the thing held in it. When a
person holds a real wand-like object, its direction is what they point with — so
here the picture around each hand is searched for a thin, straight, long object:

  1. a small square around the hand (the stick sticks out past the fingers: up to
     ~3 palm sizes),
  2. its edges (Canny) and the straight pieces in them (probabilistic Hough),
  3. a piece counts if its line goes through the grip (between the thumb and the
     index finger — a pen grip — or through the fist), and it goes on past the hand
     by more than half a palm (the fingers' own edges end inside the hand), not back
     along the forearm,
  4. pieces on one line are joined; two close parallel edges (both sides of a thin
     stick) make it surer.

Result per hand: {"wrist": [x, y] (picture 0…1, which hand), "dir": [dx, dy] (the
picture's pixels, x right, y down, from the hand to the stick's tip), "out": how far
it sticks out past the hand, "len": its seen length (both in palm sizes), "conf": 0…1}
or nothing. Pure numpy + OpenCV, ~1–3 ms a hand.
"""

import math

import numpy as np

try:
    import cv2
except Exception:  # noqa: BLE001  (no OpenCV: no sticks, the game uses the fingers)
    cv2 = None

PALM_MIN_PX = 14  # a hand smaller than this in the picture: too far to see a stick
ROI_PALMS = 3.0  # how far round the hand to look
GRIP_TOL = 0.75  # the stick's line within this many palm sizes of the grip
MIN_OUT = 0.6  # it must stick out past the hand by this many palm sizes


def _palm_px(p):
    d = lambda a, b: math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1])  # noqa: E731
    return d(0, 9) + 0.5 * d(5, 17)


def find_stick(gray, hand, w=None, h=None):
    """gray: the picture (uint8, H×W); hand: 21 points ({x, y} or (x, y), picture 0…1)."""
    if cv2 is None or hand is None or len(hand) < 21:
        return None
    H, W = gray.shape[:2]
    w = w or W
    h = h or H
    pts = np.array([[(q["x"] if isinstance(q, dict) else q[0]) * W, (q["y"] if isinstance(q, dict) else q[1]) * H] for q in hand], dtype=np.float64)
    palm = _palm_px(pts)
    if not np.isfinite(palm) or palm < PALM_MIN_PX:
        return None
    # the grip: between the thumb and the index finger (a pen) — a fist's middle is near it too
    grip = pts[[2, 3, 4, 5, 6]].mean(axis=0)
    fist = pts[[0, 5, 9, 13, 17]].mean(axis=0)
    toward_fingers = pts[9] - pts[0]
    toward_fingers /= (np.linalg.norm(toward_fingers) + 1e-9)

    x0 = int(max(0, pts[:, 0].min() - ROI_PALMS * palm))
    x1 = int(min(W, pts[:, 0].max() + ROI_PALMS * palm))
    y0 = int(max(0, pts[:, 1].min() - ROI_PALMS * palm))
    y1 = int(min(H, pts[:, 1].max() + ROI_PALMS * palm))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return None
    roi = gray[y0:y1, x0:x1]
    roi = cv2.GaussianBlur(roi, (5, 5), 0)
    med = float(np.median(roi))
    lo = int(max(20, 0.66 * med * 0.5))
    hi = int(max(50, min(255, 1.33 * med)))
    edges = cv2.Canny(roi, lo, hi)
    segs = cv2.HoughLinesP(edges, 1, math.pi / 180, threshold=max(12, int(0.45 * palm)),
                           minLineLength=max(10, int(0.8 * palm)), maxLineGap=max(3, int(0.15 * palm)))
    if segs is None:
        return None

    cands = []
    for s in np.asarray(segs).reshape(-1, 4):  # (OpenCV 4: N×1×4, 5: N×4)
        a = np.array([s[0] + x0, s[1] + y0], dtype=np.float64)
        b = np.array([s[2] + x0, s[3] + y0], dtype=np.float64)
        u = b - a
        L = np.linalg.norm(u)
        if L < 1e-6:
            continue
        u /= L
        n = np.array([-u[1], u[0]])
        # through the grip (or the fist)
        dg = min(abs(np.dot(grip - a, n)), abs(np.dot(fist - a, n)) + 0.15 * palm)
        if dg > GRIP_TOL * palm:
            continue
        cands.append({"a": a, "b": b, "u": u, "n": n, "off": float(np.dot(a, n)), "dg": dg, "len": L})
    if not cands:
        return None

    # pieces on one line (the same angle, the same offset) are one stick
    groups = []
    for c in sorted(cands, key=lambda c: -c["len"]):
        for g in groups:
            cos = abs(float(np.dot(g["u"], c["u"])))
            if cos > math.cos(math.radians(4)):
                u = g["u"] if np.dot(g["u"], c["u"]) > 0 else -g["u"]
                off = float(np.dot(c["a"], g["n"]))
                if abs(off - g["off"]) < 0.12 * palm:
                    g["pts"] += [c["a"], c["b"]]
                    g["dg"] = min(g["dg"], c["dg"])
                    g["u"] = u
                    break
                if 0.06 * palm < abs(off - g["off"]) < 0.4 * palm:
                    g["pair"] = True  # (the other side of a thin stick)
        else:
            groups.append({"u": c["u"], "n": c["n"], "off": c["off"], "pts": [c["a"], c["b"]], "dg": c["dg"], "pair": False})
    # (a pair found the other way round)
    for g in groups:
        for o in groups:
            if o is g:
                continue
            if abs(float(np.dot(g["u"], o["u"]))) > math.cos(math.radians(5)):
                d = abs(float(np.dot(o["pts"][0], g["n"])) - g["off"])
                if 0.06 * palm < d < 0.4 * palm:
                    g["pair"] = o["pair"] = True

    best = None
    for g in groups:
        u = g["u"]
        foot = grip - np.dot(grip - g["pts"][0], g["n"]) * g["n"]
        ts = [float(np.dot(p - foot, u)) for p in g["pts"]]
        hs = [float(np.dot(p - foot, u)) for p in pts]
        t_lo, t_hi = min(ts), max(ts)
        h_lo, h_hi = min(hs), max(hs)
        out_pos = max(0.0, t_hi - h_hi)
        out_neg = max(0.0, h_lo - t_lo)
        if out_pos >= out_neg:
            out, d = out_pos, u
        else:
            out, d = out_neg, -u
        # not the forearm's edge (it goes on back from the wrist)
        if float(np.dot(d, toward_fingers)) < -0.3:
            continue
        # it must go on past the hand
        if out < MIN_OUT * palm:
            continue
        score = out / palm * (1.5 if g["pair"] else 1.0) - g["dg"] / palm
        if best is None or score > best[0]:
            best = (score, g, d, out, t_hi - t_lo)
    if best is None:
        return None
    _, g, d, out, seen = best
    conf = 0.35 + 0.25 * (out / palm - MIN_OUT) + (0.25 if g["pair"] else 0.0) - 0.2 * g["dg"] / palm
    return {
        "wrist": [round(float(pts[0][0] / W), 4), round(float(pts[0][1] / H), 4)],
        "dir": [round(float(d[0]), 4), round(float(d[1]), 4)],
        "out": round(float(out / palm), 3),
        "len": round(float(seen / palm), 3),
        "conf": round(float(max(0.0, min(1.0, conf))), 3),
    }


def find_sticks(bgr_or_gray, hands):
    """Every hand's stick (a list of the found ones, see find_stick)."""
    if cv2 is None or not hands:
        return []
    gray = bgr_or_gray if bgr_or_gray.ndim == 2 else cv2.cvtColor(bgr_or_gray, cv2.COLOR_BGR2GRAY)
    out = []
    for lm in hands:
        try:
            s = find_stick(gray, lm)
        except Exception:  # noqa: BLE001  (a stick is a bonus: never break the camera)
            s = None
        if s:
            out.append(s)
    return out
