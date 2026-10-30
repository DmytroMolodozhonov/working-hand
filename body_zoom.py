"""
body_zoom.py — a far player: the body is looked at close up, in a better light.

The author's friend stands 2–3 m from a low camera (the lamp behind, dark clothes): the body is
a small figure in the upper third of the picture, and the body and face networks get a 640-wide
copy of it — the face is 20–30 pixels, the head stops turning the view. (The hands were already
cut out of the WHOLE picture, hand_v5.py.) So:

  BodyZoom   when the body is small in the picture (its box lower than ~half), the networks get
             a smoothed digital zoom around the body (up to ×2.2) cut from the whole picture, then
             every point is mapped back to the whole picture's coordinates — the game, the hands and
             the guard never know. A body that is lost relaxes the zoom back to the whole picture
             (so it can be found anywhere); a hand that rises out of the crop widens it at once.
  Light      a figure darker than the room (a lamp or a window behind) or a flat grey picture:
             the picture is lightened by a gamma table (cheap) and the crop gets local contrast
             (CLAHE); smoothly on and off, so a good light is never touched.
  FarWatch   how well the player is seen: weak / tiny / lost for 3 s → the game may say «step closer».

Pure numpy + cv2 on small pictures (≤ 640 wide): no work for the processor that the video card
could do — the networks themselves stay where they are (hand_v5_gpu.py).
"""

import math
import time

# zoom
ON_BELOW = 0.51  # the body's box lower than this share of the picture's height: zoom (hysteresis: off above OFF_ABOVE)
OFF_ABOVE = 0.60
FILL = 0.62  # the body's box fills this share of the crop's height (and 0.6 of its width)
S_MIN = 0.45  # the crop at least this share of the picture's side (zoom ≤ ×2.2)
GROW = 0.30  # the crop widens quickly (a hand going out of it)…
SHRINK = 0.05  # …and narrows slowly (no trembling of the picture)
MOVE = 0.12  # the centre follows the body
DEAD_S, DEAD_C = 0.05, 0.015  # smaller changes are not made: the follower in VIDEO mode likes a steady picture
LOST_FRAMES = 8  # no body this many pictures: the crop relaxes to the whole picture
RELAX = 0.10
VIS = 0.4
UPPER = tuple(range(0, 25))  # head, arms, hands, hips (the legs are often out of the picture)


def body_box(pose, vis=VIS):
    """(x0, y0, x1, y1) of the seen upper body in the picture's 0…1, or None."""
    if not pose or len(pose) < 25:
        return None
    xs, ys = [], []
    for i in UPPER:
        p = pose[i]
        if (p.get("visibility", 1.0) or 0.0) >= vis and -0.2 < p["x"] < 1.2 and -0.2 < p["y"] < 1.2:
            xs.append(p["x"])
            ys.append(p["y"])
    if len(xs) < 5:
        return None
    return min(xs), min(ys), max(xs), max(ys)


class BodyZoom:
    def __init__(self):
        self.s = 1.0  # the crop's side as a share of the picture's
        self.cx = 0.5
        self.cy = 0.5
        self.on = False
        self.lost = 0
        self.changed = False  # (on/off just changed: the program says it in its log)

    def rect(self):
        """The crop (cx, cy, s) in the picture's shares."""
        return self.cx, self.cy, self.s

    def active(self):
        return self.s < 0.97

    def update(self, pose, aspect=16 / 9):
        """The last body (whole-picture points or None) → the next crop."""
        self.changed = False
        box = body_box(pose)
        if box is None:
            self.lost += 1
            if self.lost > LOST_FRAMES and self.s < 1.0:
                self.s = min(1.0, self.s + RELAX)
                self._fit()
                if self.s >= 0.97:
                    self._set_on(False)
            return
        self.lost = 0
        x0, y0, x1, y1 = box
        bh, bw = max(0.02, y1 - y0), max(0.02, x1 - x0)
        # (a head's top is above the nose; hands are wide: margins in the size)
        want = max((bh * 1.12) / FILL, (bw * 1.1) / (FILL * 0.97))
        want = max(S_MIN, min(1.0, want))
        # the crop is the same shape as the picture: a side's share of the width = of the height
        if not self.on:
            if bh < ON_BELOW and want < 0.86:
                self._set_on(True)
            elif self.s >= 0.97:
                return
        elif bh > OFF_ABOVE and want > 0.95:
            self._set_on(False)
        if not self.on:
            want = 1.0  # (switching off: the crop widens back to the whole picture)
        tcx = (x0 + x1) / 2
        tcy = (y0 + y1) / 2 - 0.02 * want  # (a little room above the head)
        ds = want - self.s
        if abs(ds / max(self.s, 0.1)) > DEAD_S or want >= 1.0 or ds > 0:
            self.s += ds * (GROW if ds > 0 else SHRINK)
        if abs(tcx - self.cx) > DEAD_C or abs(tcy - self.cy) > DEAD_C:
            self.cx += (tcx - self.cx) * MOVE
            self.cy += (tcy - self.cy) * MOVE
        self.s = max(S_MIN, min(1.0, self.s))
        self._fit()

    def _set_on(self, on):
        if on != self.on:
            self.on = on
            self.changed = True

    def _fit(self):
        h = self.s / 2
        self.cx = max(h, min(1.0 - h, self.cx))
        self.cy = max(h, min(1.0 - h, self.cy))

    def pixels(self, w, h):
        """The crop in pixels (x, y, cw, ch), whole numbers inside the picture."""
        cw, ch = max(32, int(round(self.s * w))), max(32, int(round(self.s * h)))
        cw, ch = min(cw, w), min(ch, h)
        x = int(round(self.cx * w - cw / 2))
        y = int(round(self.cy * h - ch / 2))
        return max(0, min(w - cw, x)), max(0, min(h - ch, y)), cw, ch

    def unmap(self, pts, w, h, rect=None):
        """Points of the crop's picture (x, y 0…1 in it) → the whole picture's shares (in place)."""
        if not pts:
            return pts
        x, y, cw, ch = rect or self.pixels(w, h)
        if cw >= w and ch >= h:
            return pts
        kx, ky, ox, oy = cw / w, ch / h, x / w, y / h
        for p in pts:
            p["x"] = ox + p["x"] * kx
            p["y"] = oy + p["y"] * ky
            if "z" in p:
                p["z"] *= kx  # (depth is in the width's scale)
        return pts


# ---------------------------------------------------------------- the light


class Light:
    """Backlight / dark figure / flat picture → a lightening (smoothly), else nothing."""

    ON = 0.55  # the need (0…1) above which the lightening starts, OFF below
    OFF = 0.30
    EVERY = 6  # pictures between two measurements

    def __init__(self, cv2, np):
        self.cv2, self.np = cv2, np
        self.n = 0
        self.need = 0.0
        self.k = 0.0  # strength 0…1, smoothed
        self.on = False
        self.clahe = None
        self.lut_key = None
        self.lut = None

    @staticmethod
    def need_of(body_mean, room_mean, spread):
        """0…1 how much the picture must be lightened. body/room: mean brightness 0…255; spread: p95−p5."""
        dark = max(0.0, min(1.0, (105.0 - body_mean) / 55.0))  # a dark figure
        back = max(0.0, min(1.0, (room_mean - body_mean - 25.0) / 55.0))  # brighter room around it
        flat = max(0.0, min(1.0, (70.0 - spread) / 40.0))
        return max(dark * (0.45 + 0.55 * back), flat * 0.8)

    def measure(self, thumb_gray, box):
        """thumb_gray: a small grey picture; box: the body (0…1) or None."""
        np = self.np
        h, w = thumb_gray.shape[:2]
        p5, p95 = np.percentile(thumb_gray, (5, 95))
        if box is None:
            body_mean = float(thumb_gray.mean())
            room_mean = body_mean
        else:
            x0, y0, x1, y1 = box
            a, b = max(0, int(x0 * w)), min(w, max(int(x1 * w), int(x0 * w) + 2))
            c, d = max(0, int(y0 * h)), min(h, max(int(y1 * h), int(y0 * h) + 2))
            body = thumb_gray[c:d, a:b]
            body_mean = float(body.mean()) if body.size else float(thumb_gray.mean())
            m = np.ones((h, w), bool)
            m[c:d, a:b] = False
            room_mean = float(thumb_gray[m].mean()) if m.any() else body_mean
        return self.need_of(body_mean, room_mean, float(p95 - p5))

    def step(self, get_thumb, box):
        """Once a few pictures: measure (get_thumb() makes the small grey picture only then);
        returns the strength now (0 = untouched)."""
        self.n += 1
        if self.n % self.EVERY == 1:
            self.need = self.need * 0.5 + self.measure(get_thumb(), box) * 0.5
            if self.on and self.need < self.OFF:
                self.on = False
            elif not self.on and self.need > self.ON:
                self.on = True
        target = max(0.0, min(1.0, self.need * 1.2)) if self.on else 0.0
        self.k += (target - self.k) * 0.08
        if self.k < 0.02 and not self.on:
            self.k = 0.0
        return self.k

    def gamma(self, rgb, k):
        """A lightening table (cheap on 1280×720: ~1 ms)."""
        if k <= 0:
            return rgb
        key = round(k * 20)
        if key != self.lut_key:
            g = 1.0 - 0.45 * key / 20.0
            np = self.np
            self.lut = (255.0 * (np.arange(256) / 255.0) ** g).astype(np.uint8)
            self.lut_key = key
        return self.cv2.LUT(rgb, self.lut)

    def contrast(self, rgb, k):
        """Local contrast on the brightness only (a crop ≤ 640 wide: ~1 ms)."""
        if k < 0.25:
            return rgb
        cv2 = self.cv2
        if self.clahe is None:
            self.clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(6, 6))
        lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
        lab[..., 0] = self.clahe.apply(lab[..., 0])
        return cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)


# ---------------------------------------------------------------- how well the player is seen


class FarWatch:
    """«Step closer»: the player is weak / tiny / lost for HOLD seconds (and was seen lately)."""

    HOLD = 3.0
    SMALL = 0.045  # the shoulders narrower than this share of the picture's width: too far even after the zoom
    WEAK = 0.5
    KEEP = 12.0  # a body lost for longer than this — the player has gone, no hint

    def __init__(self):
        self.since = None
        self.seen_at = 0.0
        self.low = False

    @staticmethod
    def weak(pose, aspect=16 / 9, zoom_s=1.0):
        """True when the body is seen badly: the nose and the shoulders unsure, or the shoulders tiny."""
        if not pose or len(pose) < 13:
            return True
        v = [pose[i].get("visibility", 1.0) or 0.0 for i in (0, 11, 12)]
        sw = math.hypot((pose[11]["x"] - pose[12]["x"]), (pose[11]["y"] - pose[12]["y"]) / aspect)
        return sum(v) / 3 < FarWatch.WEAK or sw < FarWatch.SMALL

    def update(self, pose, now=None, aspect=16 / 9):
        """Returns True while the hint should be offered."""
        now = time.time() if now is None else now
        weak = self.weak(pose, aspect)
        if pose:
            self.seen_at = now
        if weak and (pose or now - self.seen_at < self.KEEP) and self.seen_at:
            if self.since is None:
                self.since = now
        else:
            self.since = None
        self.low = self.since is not None and now - self.since >= self.HOLD
        return self.low
