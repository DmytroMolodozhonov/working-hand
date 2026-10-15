"""
bench.py — the hand benchmark: our game's situation, made from real photos with hands marked by people.

    python tools/handbench/fetch.py          # once: the marks + the photos (≈ 60 MB, into .handbench/)
    python tools/handbench/bench.py          # all the checks → tools/handbench/RESULTS.md
    python tools/handbench/bench.py --quick  # a small part (a minute or two)

What it does (see README.md):
  * every marked hand is made SMALL, as our player's hands are (he stands far: in the picture down
    to the knees): the whole photo is shrunk so the hand is 24 / 32 / 48 / 64 px in a 640×480
    picture (and 1.5× that in the 720p picture), then made like a webcam picture (a little blur,
    sensor noise, JPEG);
  * the body network (MediaPipe Pose, as in the game) is run on it — the two-step finders take
    the wrist from it;
  * each finder is scored: found or not, how far its points are from the true ones (in the
    hand's size), where the hand points (the wand), fists / open hands / palm or back to the
    camera / pointed at the camera;
  * still hands as a stream (the same picture with fresh camera noise and a tiny shake every frame):
    how much the points tremble, raw and after the game's own filter, and how often the hand is lost;
  * a quick swing: the picture smeared along a random direction (motion blur);
  * the time each finder takes, and the processor time it costs.
"""

import argparse
import json
import math
import os
import sys
import time
from collections import defaultdict

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA, HERE, MODELS, HandFilterPy, angle_deg, categories, hand_size, load_cases, match, score_hand, wand_dir  # noqa: E402
import methods as M  # noqa: E402

RES = {"480": (640, 480, 1.0), "720": (960, 720, 1.5)}


def synth(img, case, S, res, seed):
    """The photo shrunk so the hand is S px (×res factor), framed in a webcam picture, made like a webcam's."""
    W, H, k = RES[res]
    kp = np.array(case["kp"], np.float64)
    f = S * k / hand_size(kp)
    small = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    bx, by, bw, bh = case["person"]
    # the window: the person in the middle, the hand surely inside
    cx, cy = (bx + bw / 2) * f, (by + bh / 2) * f
    hx, hy = kp[kp[:, 2] > 0, 0].mean() * f, kp[kp[:, 2] > 0, 1].mean() * f
    m = S * k * 1.2
    x0 = min(max(cx - W / 2, hx + m - W), hx - m)
    y0 = min(max(cy - H / 2, hy + m - H), hy - m)
    Mx = np.array([[1, 0, -x0], [0, 1, -y0]], np.float32)
    frame = cv2.warpAffine(small, Mx, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(110, 110, 110))
    kpf = kp.copy()
    kpf[:, 0] = kp[:, 0] * f - x0
    kpf[:, 1] = kp[:, 1] * f - y0
    body = np.array(case["body"], np.float64)
    bodyf = body.copy()
    bodyf[:, 0] = body[:, 0] * f - x0
    bodyf[:, 1] = body[:, 1] * f - y0
    return webcam(frame, seed), kpf, bodyf


def webcam(frame, seed, shift=None):
    """A webcam's picture: soft optics, sensor noise, JPEG (and a tiny shake for streams)."""
    rng = np.random.default_rng(seed)
    if shift is not None:
        frame = cv2.warpAffine(frame, np.array([[1, 0, shift[0]], [0, 1, shift[1]]], np.float32), (frame.shape[1], frame.shape[0]), borderMode=cv2.BORDER_REPLICATE)
    out = cv2.GaussianBlur(frame, (0, 0), 0.7)
    out = np.clip(out.astype(np.float32) + rng.normal(0, 3.0, out.shape), 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def motion_blur(frame, length, angle):
    n = max(3, int(round(length)) | 1)
    ker = np.zeros((n, n), np.float32)
    ker[n // 2, :] = 1
    R = cv2.getRotationMatrix2D((n / 2 - 0.5, n / 2 - 0.5), angle, 1)
    ker = cv2.warpAffine(ker, R, (n, n))
    ker /= ker.sum()
    return cv2.filter2D(frame, -1, ker)


class PoseRunner:
    """MediaPipe Pose (the game's 'full' model) — the body of the person whose hand it is."""

    def __init__(self):
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision
        self.mp = mp
        self.p = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "pose_landmarker_full.task")),
            running_mode=vision.RunningMode.IMAGE, num_poses=3,
            min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5))
        self.hits = 0
        self.misses = 0

    def __call__(self, rgb, kp, body, side, S, rng):
        h, w = rgb.shape[:2]
        r = self.p.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        wi = 15 if side == "left" else 16
        best, bd = None, 1e9
        for lms in r.pose_landmarks or []:
            d = math.hypot(lms[wi].x * w - kp[0, 0], lms[wi].y * h - kp[0, 1])
            if d < bd:
                best, bd = lms, d
        if best is not None and bd < 1.2 * S:
            self.hits += 1
            return [{"x": p.x, "y": p.y, "z": p.z, "visibility": p.visibility} for p in best], True
        # the body network missed this person (a crowd, a cut-off photo): in the game the player is
        # alone and whole in the picture — the wrist and elbow then come from the people's marks (+ noise)
        self.misses += 1
        pose = [{"x": 0.0, "y": 0.0, "z": 0.0, "visibility": 0.0} for _ in range(33)]
        we = (9, 7) if side == "left" else (10, 8)  # (COCO: wrist, elbow)
        if body[we[0], 2] <= 0 or body[we[1], 2] <= 0:
            return None, False
        for coco, mpi in zip(we, (wi, wi - 2)):
            pose[mpi] = {"x": (body[coco, 0] + rng.normal(0, 0.15 * S)) / w, "y": (body[coco, 1] + rng.normal(0, 0.15 * S)) / h, "z": 0.0, "visibility": 0.9}
        return pose, False


def stills(cases, methods, sizes, ress, blur, rng_seed=0, log=print):
    pose = PoseRunner()
    rows = []
    times = defaultdict(list)
    cpu = defaultdict(list)
    for ci, case in enumerate(cases):
        img = cv2.imread(os.path.join(DATA, "images", case["file"]))
        if img is None:
            continue
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        kp0 = np.array(case["kp"], np.float64)
        cat = categories(kp0, case["side"])
        variants = [(S, res, False) for res in ress for S in sizes]
        if blur:
            variants += [(48, "480", True)]
        for S, res, blurred in variants:
            if hand_size(kp0) < S * RES[res][2] * 1.25:
                continue  # (the photo's hand must be bigger than the test's: shrinking only)
            rng = np.random.default_rng(rng_seed + ci * 101 + S)
            frame, kp, body = synth(img, case, S, res, int(rng.integers(1 << 30)))
            Sk = S * RES[res][2]
            if blurred:
                frame = motion_blur(frame, 0.45 * Sk, float(rng.uniform(0, 180)))
            p, hit = pose(frame, kp, body, case["side"], Sk, rng)
            for m in methods:
                t0, c0 = time.perf_counter(), time.process_time()
                hands = m.image(frame, p)
                times[(m.name, res)].append((time.perf_counter() - t0) * 1000)
                cpu[(m.name, res)].append((time.process_time() - c0) * 1000)
                got = match(hands, kp, Sk)
                row = {"case": ci, "method": m.name, "S": S, "res": res, "blur": blurred, "pose_hit": hit, **cat, "found": got is not None}
                if got is not None:
                    row.update(score_hand(got, kp, Sk))
                rows.append(row)
        if ci % 25 == 0:
            log(f"  stills: {ci + 1}/{len(cases)}")
    return rows, times, cpu, {"pose_hits": pose.hits, "pose_misses": pose.misses}


def streams(cases, methods, sizes, frames=20, log=print):
    """Still hands as a stream: tremble (raw / after the game's filter) and losses."""
    pose = PoseRunner()
    out = defaultdict(lambda: defaultdict(list))
    for ci, case in enumerate(cases):
        img = cv2.imread(os.path.join(DATA, "images", case["file"]))
        if img is None:
            continue
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        kp0 = np.array(case["kp"], np.float64)
        for S in sizes:
            if hand_size(kp0) < S * 1.25:
                continue
            rng = np.random.default_rng(7 + ci * 31 + S)
            base, kp, body = synth(img, case, S, "480", 0)
            base = cv2.imdecode(cv2.imencode(".png", base)[1], cv2.IMREAD_COLOR)
            seq = []
            for t in range(frames):
                sh = rng.uniform(-0.5, 0.5, 2)
                fr = webcam(base, int(rng.integers(1 << 30)), shift=sh)
                kpt = kp.copy()
                kpt[:, :2] += sh
                p, _ = pose(fr, kpt, body, case["side"], S, rng)
                seq.append((fr, p, sh))
            palm = np.linalg.norm(kp[9, :2] - kp[0, :2]) + 0.5 * np.linalg.norm(kp[5, :2] - kp[17, :2])
            for m in methods:
                m.reset()
                raw, filt, angs, fangs = [], [], [], []
                filt_f = HandFilterPy()
                found = 0
                for t, (fr, p, sh) in enumerate(seq):
                    hands = m.video(fr, p, t * 33.3)
                    got = match(hands, kp + np.r_[sh, 0], S)
                    if got is None:
                        continue
                    found += 1
                    g = got[:, :2] - sh  # (the shake taken out: what is left is the finder's own tremble)
                    raw.append(g)
                    f = filt_f(g, t / 30, palm)
                    filt.append(f)
                    angs.append(math.degrees(math.atan2(*wand_dir(g)[::-1])))
                    fangs.append(math.degrees(math.atan2(*wand_dir(f)[::-1])))
                key = (m.name, S)
                out[key]["found"].append(found / frames)
                if len(raw) >= 5:
                    out[key]["jitter"].append(float(np.linalg.norm(np.std(np.array(raw), 0), axis=1).mean() / S))
                    out[key]["jitter_f"].append(float(np.linalg.norm(np.std(np.array(filt[3:]), 0), axis=1).mean() / S))
                    out[key]["wand_sd"].append(float(np.std(np.unwrap(np.radians(angs))) * 180 / math.pi))
                    out[key]["wand_sd_f"].append(float(np.std(np.unwrap(np.radians(fangs[3:]))) * 180 / math.pi))
        if ci % 10 == 0:
            log(f"  streams: {ci + 1}/{len(cases)}")
    return {f"{k[0]}@{k[1]}": {n: float(np.mean(v)) if v else None for n, v in d.items()} for k, d in out.items()}


def summarize(rows, keys):
    """Mean of the metrics for every group (misses count as 0 for found/pck, and as wrong wands)."""
    g = defaultdict(list)
    for r in rows:
        g[tuple(r[k] for k in keys)].append(r)
    out = {}
    for k, rs in sorted(g.items(), key=lambda kv: tuple(str(x) for x in kv[0])):
        n = len(rs)
        f = [r for r in rs if r["found"]]
        wands = [r["wand"] for r in f if r.get("wand") is not None]
        out[k] = {
            "n": n,
            "found": len(f) / n,
            "pck20": sum(r["pck20"] for r in f) / n,
            "pck10": sum(r["pck10"] for r in f) / n,
            "epe": float(np.mean([r["epe"] for r in f])) if f else None,
            "wand_med": float(np.median(wands)) if wands else None,
            "wand_ok": sum(1 for w in wands if w < 15) / n,
        }
    return out


def table(summary, keys, title):
    lines = [f"### {title}", "", "| " + " | ".join(keys) + " | n | найдено | PCK@0.2 | PCK@0.1 | ошибка (доля кисти) | палочка: медиана ° | палочка < 15° |",
             "|" + "---|" * (len(keys) + 7)]
    for k, s in summary.items():
        f = lambda v, p=True: "—" if v is None else (f"{v * 100:.0f}%" if p else f"{v:.3f}")  # noqa: E731
        lines.append("| " + " | ".join(str(x) for x in k) + f" | {s['n']} | {f(s['found'])} | {f(s['pck20'])} | {f(s['pck10'])} | {f(s['epe'], False)} | "
                     + ("—" if s["wand_med"] is None else f"{s['wand_med']:.1f}") + f" | {f(s['wand_ok'])} |")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--methods", default="mp_full,mp_crop,rtmpose_hand,v5_1pass,v5")
    ap.add_argument("--sizes", default="24,32,48,64")
    ap.add_argument("--res", default="480,720")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--split", default="test", choices=["dev", "test", "all"])
    ap.add_argument("--streams", type=int, default=40, help="how many hands for the stream (tremble) test")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--only-streams", action="store_true", help="only the stream (tremble) test")
    ap.add_argument("--out", default=os.path.join(HERE, "RESULTS.md"))
    a = ap.parse_args()
    if a.quick:
        a.limit, a.streams = a.limit or 60, min(a.streams, 10)
    cases = load_cases()
    if a.split != "all":
        cases = [c for i, c in enumerate(cases) if (i % 10 < 3) == (a.split == "dev")]
    if a.limit:
        cases = cases[: a.limit]
    methods = []
    for n in a.methods.split(","):
        try:
            methods.append(M.make(n))
        except Exception as e:  # noqa: BLE001
            print(f"  ({n} пропущен: {e})")
    sizes = [int(s) for s in a.sizes.split(",")]
    ress = a.res.split(",")
    print(f"Кистей: {len(cases)}; способы: {[m.name for m in methods]}")
    if a.only_streams:
        st = streams(cases[: a.streams], methods, [32, 48])
        for k, d in sorted(st.items()):
            print(k, {n: round(v, 4) if v is not None else None for n, v in d.items()})
        return
    rows, times, cpu, pinfo = stills(cases, methods, sizes, ress, blur=True)
    plain = [r for r in rows if not r["blur"]]
    md = ["# Бенчмарк кистей (tools/handbench)", "",
          f"Кистей из COCO-WholeBody (часть «{a.split}»): {len(cases)}. Поза тела нашла человека: {pinfo['pose_hits']}, нет: {pinfo['pose_misses']}.",
          "PCK@0.2 — доля суставов, найденных ближе 0.2 размера кисти (ненайденная кисть = 0). «Палочка» — угол направления кисти (запястье → средний палец) против настоящего.", ""]
    md.append(table(summarize(plain, ["method", "res"]), ["method", "res"], "Все кисти (по разрешению камеры)"))
    md.append(table(summarize([r for r in plain if r["res"] == "480"], ["method", "S"]), ["method", "S"], "640×480: по размеру кисти в пикселях"))
    md.append(table(summarize([r for r in plain if r["res"] == "480"], ["method", "shape"]), ["method", "shape"], "640×480: кулак / раскрытая / полусогнутая"))
    md.append(table(summarize([r for r in plain if r["res"] == "480"], ["method", "facing"]), ["method", "facing"], "640×480: ладонью / тыльной стороной к камере"))
    md.append(table(summarize([r for r in plain if r["res"] == "480" and r["toward"]], ["method"]), ["method"], "640×480: кисть направлена в камеру (укорочена)"))
    md.append(table(summarize([r for r in rows if r["blur"]], ["method"]), ["method"], "Быстрый взмах (смаз 0.45 размера кисти, кисть 48 px)"))
    sp = ["### Скорость (этот компьютер, только процессор)", "", "| method | res | мс на кадр (обе кисти) | процессорное время мс/кадр |", "|---|---|---|---|"]
    for (n, r), v in sorted(times.items()):
        sp.append(f"| {n} | {r} | {np.median(v):.1f} | {np.median(cpu[(n, r)]):.1f} |")
    md.append("\n".join(sp) + "\n")
    if a.streams:
        st = streams(cases[: a.streams], methods, [32, 48])
        tl = ["### Неподвижная кисть потоком (20 кадров: шум камеры + дрожание ±0.5 px)", "",
              "| method@размер | кадров с кистью | дрожание точек (доля кисти) | после фильтра игры | дрожание палочки ° | после фильтра ° |", "|---|---|---|---|---|---|"]
        for k, d in sorted(st.items()):
            f = lambda v, s=1, fmt="{:.3f}": "—" if v is None else fmt.format(v * s)  # noqa: E731
            tl.append(f"| {k} | {f(d.get('found'), 100, '{:.0f}%')} | {f(d.get('jitter'))} | {f(d.get('jitter_f'))} | {f(d.get('wand_sd'), 1, '{:.2f}')} | {f(d.get('wand_sd_f'), 1, '{:.2f}')} |")
        md.append("\n".join(tl) + "\n")
    text = "\n".join(md)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(text)
    with open(os.path.join(DATA, "rows.json"), "w") as f:
        json.dump(rows, f)
    print(text)


if __name__ == "__main__":
    main()
