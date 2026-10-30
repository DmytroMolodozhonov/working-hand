"""body_zoom.py — a far player: the zoom, the light, the «step closer» watch."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import body_zoom as bz  # noqa: E402


def body(cx=0.5, top=0.1, h=0.4, vis=0.9):
    """A standing person's 33 points (whole-picture shares): head at `top`, hips at top+h."""
    pose = [{"x": cx, "y": top + h * 0.5, "z": 0.0, "visibility": vis} for _ in range(33)]
    w = h * 0.35
    def put(i, x, y):
        pose[i] = {"x": x, "y": y, "z": 0.0, "visibility": vis}
    put(0, cx, top + 0.04 * h)
    for i in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10):
        put(i, cx + (i % 2 * 2 - 1) * 0.02 * h, top + 0.04 * h)
    put(11, cx + w / 2, top + 0.22 * h); put(12, cx - w / 2, top + 0.22 * h)
    put(13, cx + w, top + 0.45 * h); put(14, cx - w, top + 0.45 * h)
    put(15, cx + w, top + 0.7 * h); put(16, cx - w, top + 0.7 * h)
    for i in (17, 19, 21): put(i, cx + w, top + 0.75 * h)
    for i in (18, 20, 22): put(i, cx - w, top + 0.75 * h)
    put(23, cx + w / 3, top + h); put(24, cx - w / 3, top + h)
    return pose


def run(z, pose, n):
    for _ in range(n):
        z.update(pose)


def test_big_body_is_not_zoomed():
    z = bz.BodyZoom()
    run(z, body(h=0.8, top=0.05), 80)
    assert not z.active() and z.s == 1.0


def test_small_body_is_zoomed_and_kept_inside():
    z = bz.BodyZoom()
    pose = body(cx=0.3, top=0.12, h=0.3)
    run(z, pose, 200)
    assert z.on and 0.45 <= z.s < 0.7
    x, y, cw, ch = z.pixels(1280, 720)
    assert 0 <= x and x + cw <= 1280 and 0 <= y and y + ch <= 720
    # the whole upper body lies inside the crop
    x0, y0, x1, y1 = bz.body_box(pose)
    assert x <= x0 * 1280 and x1 * 1280 <= x + cw and y <= y0 * 720 and y1 * 720 <= y + ch


def test_unmap_is_the_inverse_of_the_cut():
    z = bz.BodyZoom()
    run(z, body(cx=0.6, top=0.1, h=0.3), 200)
    x, y, cw, ch = z.pixels(1280, 720)
    px, py = 900, 200  # a pixel inside the crop
    pts = [{"x": (px - x) / cw, "y": (py - y) / ch, "z": 0.1}]
    z.unmap(pts, 1280, 720)
    assert abs(pts[0]["x"] * 1280 - px) < 1e-6 and abs(pts[0]["y"] * 720 - py) < 1e-6


def test_zoom_is_steady_and_has_hysteresis():
    z = bz.BodyZoom()
    run(z, body(h=0.3), 200)
    s = z.s
    # a tiny sway of the body does not move the crop
    for k in range(60):
        z.update(body(cx=0.5 + 0.002 * (k % 3), h=0.3 + 0.002 * (k % 2)))
    assert abs(z.s - s) < 0.02
    # a bit bigger (inside the hysteresis band) stays zoomed
    run(z, body(h=0.55, top=0.1), 100)
    assert z.on


def test_lost_body_relaxes_to_the_whole_picture_and_a_raised_hand_widens():
    z = bz.BodyZoom()
    run(z, body(h=0.3), 200)
    assert z.active()
    for _ in range(60):
        z.update(None)
    assert not z.active() and z.s == 1.0
    z = bz.BodyZoom()
    run(z, body(h=0.3), 200)
    s = z.s
    wide = body(h=0.3)
    wide[16] = {"x": 0.9, "y": 0.05, "z": 0.0, "visibility": 0.9}
    run(z, wide, 10)
    assert z.s > s


def test_light_need():
    # a dark figure against a lamp's room: lighten; a normal picture: not
    assert bz.Light.need_of(50, 170, 150) > 0.6
    assert bz.Light.need_of(120, 125, 150) < 0.3
    assert bz.Light.need_of(130, 135, 40) > 0.5  # a flat grey picture


def test_light_is_smooth_and_off_in_good_light():
    import cv2
    L = bz.Light(cv2, np)
    good = np.full((45, 80), 125, np.uint8); good[:, :10] = 60; good[:, 70:] = 200
    for _ in range(60):
        assert L.step(lambda: good, (0.4, 0.2, 0.6, 0.9)) == 0.0
    bad = np.full((45, 80), 180, np.uint8); bad[8:40, 30:50] = 40
    ks = [L.step(lambda: bad, (0.37, 0.18, 0.62, 0.9)) for _ in range(120)]
    assert ks[-1] > 0.4 and all(b - a < 0.2 for a, b in zip(ks, ks[1:]))
    rgb = np.full((8, 8, 3), 60, np.uint8)
    assert L.gamma(rgb, ks[-1]).mean() > 60 and (L.gamma(rgb, 0.0) == rgb).all()


def test_far_watch_says_after_three_seconds_only():
    w = bz.FarWatch()
    weak = body(vis=0.2)
    assert not w.update(weak, now=100.0)
    assert not w.update(weak, now=102.0)
    assert w.update(weak, now=103.2)
    assert not w.update(body(), now=104.0)  # seen well again: quiet
    # nobody ever seen: no hint (the player is just away)
    w = bz.FarWatch()
    assert not any(w.update(None, now=t) for t in range(0, 30))
    # lost right after being seen: hint; lost for long: the player has gone
    w.update(body(), now=50.0)
    assert not w.update(None, now=51.0) and w.update(None, now=54.5)
    assert not w.update(None, now=80.0)
