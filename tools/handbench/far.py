"""
A far player: how much the camera program loses when the person steps back (and what the zoom and the
lightening bring back). The author's friend: 2–3 m from a low camera, a lamp behind, dark clothes.

  python tools/handbench/far.py VIDEO_OR_FOLDER [--scales 1,1.5,2,3] [--max 150] [--backlight] [--hands]

Every picture (1280×720, the camera's size) is the reference: what the networks find on it as it is. Then the
SAME picture is made smaller by 1.5× / 2× / 3× (the person farther away), set on a grey room (the feet side
lower, the head in the upper third), and the program's two ways look at it, picture after picture, as in the game:
  old    the body and the face from a 640-wide copy of the whole picture (what the game did)
  zoom   BodyZoom crop + Light (body_zoom.py), the points mapped back (what the game does now)
--backlight darkens the person and lights the room (a lamp behind, dark clothes).
Numbers: body found (and right: the shoulders and the nose within ½ of the shoulders' width of where the reference
body is, moved with the picture), face found, with --hands: V5 hands found and right (within ⅓ of the palm).
Nothing is kept but the numbers (the video is the person's own: never copied); a table is printed in Russian,
paste it into RESULTS.md.
"""

import argparse
import glob
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import MODELS, REPO  # noqa: E402

sys.path.insert(0, REPO)


def pictures(src, max_n):
    import cv2
    if os.path.isdir(src):
        files = sorted(sum((glob.glob(os.path.join(src, e)) for e in ("*.jpg", "*.jpeg", "*.png")), []))
        for n, f in enumerate(files[:max_n]):
            bgr = cv2.imread(f)
            if bgr is not None:
                yield n, cv2.cvtColor(cv2.resize(bgr, (1280, 720), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
        return
    cap = cv2.VideoCapture(src)
    n = 0
    while n < max_n:
        ok, bgr = cap.read()
        if not ok:
            break
        yield n, cv2.cvtColor(cv2.resize(bgr, (1280, 720), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
        n += 1
    cap.release()


def far(rgb, scale, backlight):
    """The picture with the person `scale`× farther (set in a grey room); also where a point of the old picture went."""
    import cv2
    h, w = rgb.shape[:2]
    pic = rgb.astype(np.float32)
    if backlight:
        pic = pic * 0.55  # (dark clothes, the lamp behind)
    pic = np.clip(pic, 0, 255).astype(np.uint8)
    if scale == 1:
        out = pic
        k, ox, oy = 1.0, 0.0, 0.0
    else:
        sw, sh = int(w / scale), int(h / scale)
        small = cv2.resize(pic, (sw, sh), interpolation=cv2.INTER_AREA)
        bg = np.full((h, w, 3), 170 if backlight else 128, np.uint8)
        ox, oy = (w - sw) / 2, (h - sh) * 0.62
        x0, y0 = int(ox), int(oy)
        bg[y0:y0 + sh, x0:x0 + sw] = small
        out = bg
        k = 1 / scale
    if backlight:
        out = np.clip(out.astype(np.float32) + 0.0, 0, 255).astype(np.uint8)
    # webcam: noise and a little blur
    rng = np.random.default_rng(1)
    out = cv2.GaussianBlur(out, (3, 3), 0.6)
    out = np.clip(out.astype(np.int16) + rng.normal(0, 3, out.shape).astype(np.int16), 0, 255).astype(np.uint8)
    return out, (k, ox / w, oy / h)


def move(pts, tr):
    """Reference points (0…1 of the old picture) → where they are on the far picture."""
    k, ox, oy = tr
    return [{"x": ox + p["x"] * k, "y": oy + p["y"] * k, "z": p.get("z", 0.0), "visibility": p.get("visibility", 1.0)} for p in pts]


class Nets:
    def __init__(self, hands):
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision
        self.mp, self.vision, self.BaseOptions = mp, vision, BaseOptions
        self.hands = None
        if hands:
            import hand_v5
            self.hv = hand_v5
        self.make_hands = hands
        self.reset()

    def reset(self):
        mp, vision, B = self.mp, self.vision, self.BaseOptions
        self.pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=B(model_asset_path=os.path.join(MODELS, "pose_landmarker_full.task")),
            running_mode=vision.RunningMode.VIDEO, num_poses=1,
            min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5, min_tracking_confidence=0.5))
        self.face = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=B(model_asset_path=os.path.join(MODELS, "face_landmarker.task")), running_mode=vision.RunningMode.VIDEO, num_faces=1))
        self.v5 = self.hv.HandsV5() if self.make_hands else None
        self.t = 0

    def look(self, rgb, ts, zoom=None, light=None, cv2=None, last=None):
        """pose, face, hands for one picture, the program's way (zoom=None: the old way)."""
        mp = self.mp
        H, W = rgb.shape[:2]
        k = 0.0
        if light is not None:
            k = light.step(lambda: cv2.cvtColor(cv2.resize(rgb, (160, 90), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY), self.body_box(last))
            if k > 0:
                rgb = light.gamma(rgb, k)
        rect = zoom.pixels(W, H) if zoom is not None and zoom.active() else (0, 0, W, H)
        x, y, cw, ch = rect
        crop = rgb if (cw >= W and ch >= H) else np.ascontiguousarray(rgb[y:y + ch, x:x + cw])
        small = cv2.resize(crop, (640, round(640 * crop.shape[0] / crop.shape[1])), interpolation=cv2.INTER_AREA) if crop.shape[1] > 640 else crop
        if k >= 0.25 and light is not None:
            small = light.contrast(small, k)
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(small))
        r = self.pose.detect_for_video(img, ts)
        pose = [{"x": q.x, "y": q.y, "z": q.z, "visibility": q.visibility} for q in r.pose_landmarks[0]] if r.pose_landmarks else None
        f = self.face.detect_for_video(img, ts)
        face = [{"x": q.x, "y": q.y, "z": q.z} for q in f.face_landmarks[0]] if f.face_landmarks else None
        if zoom is not None and zoom.active():
            zoom.unmap(pose, W, H, rect)
            zoom.unmap(face, W, H, rect)
        hands = self.v5.process(rgb, pose or last, now=ts / 1000.0) if self.v5 is not None else None
        return pose, face, hands

    @staticmethod
    def body_box(pose):
        import body_zoom
        return body_zoom.body_box(pose)


def body_right(pose, ref):
    """Found AND right: the nose and the shoulders within ½ of the reference's shoulder width."""
    if not pose or not ref:
        return False
    sw = max(0.01, np.hypot(ref[11]["x"] - ref[12]["x"], ref[11]["y"] - ref[12]["y"]))
    return all(np.hypot(pose[i]["x"] - ref[i]["x"], pose[i]["y"] - ref[i]["y"]) < 0.5 * sw for i in (0, 11, 12))


def hands_right(hands, ref):
    """Found and right: the joints within ⅓ of the palm (the wrist → the middle finger's knuckle) of the reference."""
    got = 0
    for sd in ref or []:
        mine = next((h for h in hands or [] if h["side"] == sd["side"]), None)
        if not mine:
            continue
        a = np.array([[p["x"], p["y"]] for p in mine["landmarks"]])
        b = np.array([[p["x"], p["y"]] for p in sd["landmarks"]])
        palm = max(1e-3, np.hypot(*(b[9] - b[0])))
        got += float(np.mean(np.hypot(*(a - b).T)) < palm / 3)
    return got, len(ref or [])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--scales", default="1,1.5,2,3")
    ap.add_argument("--max", type=int, default=150)
    ap.add_argument("--backlight", action="store_true")
    ap.add_argument("--hands", action="store_true")
    a = ap.parse_args()
    import cv2
    import body_zoom
    scales = [float(s) for s in a.scales.split(",")]
    pics = list(pictures(a.src, a.max))
    if not pics:
        sys.exit("нет картинок")
    # the reference: each picture as it is
    nets = Nets(a.hands)
    ref = []
    last = None
    for n, rgb in pics:
        pose, face, hands = nets.look(rgb, n * 33, cv2=cv2, last=last)
        last = pose or last
        ref.append((pose, face, hands))
    rows = []
    for sc in scales:
        res = {}
        for way in ("old", "zoom"):
            nets.reset()
            zoom = body_zoom.BodyZoom() if way == "zoom" else None
            light = body_zoom.Light(cv2, np) if way == "zoom" else None
            last = None
            ok = fok = hok = hall = 0
            t0 = time.perf_counter()
            for (n, rgb), (rp, rf, rh) in zip(pics, ref):
                if not rp:
                    continue
                pic, tr = far(rgb, sc, a.backlight)
                pose, face, hands = nets.look(pic, n * 33, zoom, light, cv2, last)
                last = pose or last
                if zoom is not None:
                    zoom.update(pose, 16 / 9)
                ok += body_right(pose, move(rp, tr))
                fok += bool(face) and bool(rf)
                if a.hands and rh:
                    g, t = hands_right(hands, [dict(h, landmarks=move(h["landmarks"], tr)) for h in rh])
                    hok += g
                    hall += t
            n_ok = sum(1 for p, _, _ in ref if p)
            res[way] = (100 * ok / max(1, n_ok), 100 * fok / max(1, n_ok), 100 * hok / hall if hall else float("nan"), (time.perf_counter() - t0) * 1000 / max(1, n_ok))
        rows.append((sc, res))
    print(f"\n| далеко ×{'' if not a.backlight else ' (контровой свет)'} | тело верно: было → стало | лицо найдено: было → стало | кисти верно: было → стало | мс на кадр (тело+лицо{'+кисти' if a.hands else ''}) |")
    print("|---|---|---|---|---|")
    for sc, r in rows:
        o, z = r["old"], r["zoom"]
        print(f"| {sc:g}× | {o[0]:.0f}% → {z[0]:.0f}% | {o[1]:.0f}% → {z[1]:.0f}% | {'—' if o[2] != o[2] else f'{o[2]:.0f}% → {z[2]:.0f}%'} | {o[3]:.0f} → {z[3]:.0f} |")


if __name__ == "__main__":
    main()
