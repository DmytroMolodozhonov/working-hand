"""
pose_guard.py — the body network must never stay stuck on a wrong body.

Found on the author's own recording (tools/handbench/video.py): MediaPipe's PoseLandmarker in VIDEO
mode follows the body from its last picture's guess. When the player came close to the camera and
stepped back, it stayed on a wrong, too small body for 16 s (shoulders above the nose in 92 % of the
pictures, the wrists on the wall) — and the V5 hands, cut out where the body says the wrists are,
were lost all that time. The same picture given to the network on its own (IMAGE mode) was right in
100 % of them.

So: every picture's body is checked (`sane`); a body that is not a body twice in a row — or that
disagrees with a fresh look taken now and then (`CHECK_EVERY` pictures, beside the other networks) —
is thrown away: the fresh look is used, and the follower is swapped for a spare one made in advance
(making one takes 0.1–0.5 s: never in the picture's time).
"""

import math
import threading

CHECK_EVERY = 20  # a fresh look (IMAGE mode) every this many pictures
BAD_IN_ROW = 2  # pictures of a non-body before the follower is swapped
DISAGREE = 0.6  # the fresh look and the follower differ by this much of the shoulders' width: swap


def _p(pose, i):
    q = pose[i]
    return (q["x"], q["y"], q.get("visibility", 1.0) or 0.0)


def sane(pose):
    """Is this a standing (or sitting) person's body? Points normalized (x, y in 0…1)."""
    if not pose or len(pose) < 25:
        return False
    nx, ny, _ = _p(pose, 0)
    lx, ly, lv = _p(pose, 11)
    rx, ry, rv = _p(pose, 12)
    sw = math.hypot(lx - rx, ly - ry)
    if sw < 0.02:
        return False
    # the shoulders below the nose (the player stands upright facing the camera)
    if (ly + ry) / 2 < ny + 0.15 * sw:
        return False
    # the face between the shoulders, not far beside them
    if abs(nx - (lx + rx) / 2) > 1.2 * sw:
        return False
    # an arm no longer than a body could have (shoulder → elbow → wrist ≤ 3 shoulder widths)
    for s, e, w in ((11, 13, 15), (12, 14, 16)):
        a, b, c = _p(pose, s), _p(pose, e), _p(pose, w)
        arm = math.hypot(a[0] - b[0], a[1] - b[1]) + math.hypot(b[0] - c[0], b[1] - c[1])
        if arm > 3.2 * sw:
            return False
    return True


def disagree(a, b):
    """How far apart two bodies are (the shoulders and the wrists), in shoulder widths."""
    if not a or not b:
        return 0.0
    lx, ly, _ = _p(b, 11)
    rx, ry, _ = _p(b, 12)
    sw = max(0.02, math.hypot(lx - rx, ly - ry))
    d = 0.0
    for i in (11, 12, 15, 16):
        xa, ya, va = _p(a, i)
        xb, yb, vb = _p(b, i)
        if i in (15, 16) and min(va, vb) < 0.5:
            continue
        d = max(d, math.hypot(xa - xb, ya - yb) / sw)
    return d


class PoseGuard:
    """
    make_video(): a new PoseLandmarker in VIDEO mode; detect_image(img): a fresh look (IMAGE mode).
    run(img, ts, pool) → (the body's 33 points (dicts) or None, what happened: "" / "fresh" / "swap").
    """

    def __init__(self, make_video, make_image, to_points):
        self.make_video = make_video
        self.to_points = to_points
        self.video = make_video()
        self.image = make_image()
        self.spare = None
        self.spare_busy = False
        self.bad = 0
        self.n = 0
        self.swaps = 0
        self.lock = threading.Lock()
        self._make_spare()

    def _make_spare(self):
        if self.spare is not None or self.spare_busy:
            return
        self.spare_busy = True

        def make():
            try:
                s = self.make_video()
                with self.lock:
                    self.spare = s
            finally:
                self.spare_busy = False
        threading.Thread(target=make, name="pose-spare", daemon=True).start()

    def _swap(self):
        with self.lock:
            s, self.spare = self.spare, None
        if s is None:
            return False  # (the spare is still being made: the fresh looks go on meanwhile)
        old, self.video = self.video, s
        self.swaps += 1
        threading.Thread(target=old.close, daemon=True).start()
        self._make_spare()
        return True

    def fresh(self, img):
        r = self.image.detect(img)
        return self.to_points(r.pose_landmarks[0]) if r.pose_landmarks else None

    def run(self, img, ts, pool=None):
        self.n += 1
        check = self.n % CHECK_EVERY == 0
        jf = pool.submit(self.fresh, img) if check and pool is not None else None
        r = self.video.detect_for_video(img, ts)
        pose = self.to_points(r.pose_landmarks[0]) if r.pose_landmarks else None
        ok = pose is None or sane(pose)
        self.bad = 0 if ok else self.bad + 1
        fresh = None
        if jf is not None or (check and pool is None):
            fresh = jf.result() if jf is not None else self.fresh(img)
            if fresh is not None and sane(fresh) and (pose is None or disagree(pose, fresh) > DISAGREE):
                self._swap()
                return fresh, "swap"
        if not ok:
            fresh = fresh or self.fresh(img)
            if self.bad >= BAD_IN_ROW:
                self._swap()
                self.bad = 0
                return (fresh if fresh is not None and sane(fresh) else None), "swap"
            return (fresh if fresh is not None and sane(fresh) else None), "fresh"
        return pose, ""

    def close(self):
        for t in (self.video, self.image, self.spare):
            try:
                if t is not None:
                    t.close()
            except Exception:  # noqa: BLE001
                pass
