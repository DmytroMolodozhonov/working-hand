"""
hand_v5.py — the hands of «V5»: found where the body says they are, not searched for.

Why: the player stands far from the camera (in the picture down to the knees), so each hand
is only ~30–60 px. MediaPipe's own HandLandmarker first looks for a palm in the whole picture
with a small detector (192×192): such a small hand, a fist or a hand turned to the camera is
often not found at all, or found one picture and lost the next — the hand flickers and shakes.
Its second network (the 21 joints, 224×224) is good at small hands once it is given a good
square around the hand. So V5 never asks the palm detector:

  1. the body network already knows the wrist and the knuckles (pose points 15–22): a turned
     square around the hand is cut out of the camera's picture in its full resolution and
     enlarged to 224×224 (an enlarged hand of 40 px is still a hand to the joint network);
  2. the joint network gives the 21 points (with depth) and how sure it is that a hand is there;
  3. while the hand is followed, the next square comes from the hand's own points (as MediaPipe
     does when it tracks), moved by the hand's own speed — and checked against the body's wrist,
     so a lost hand is found again at once, in the very next picture;
  4. the first picture of a hand is looked at twice (the square from the body, then from the
     hand itself): the second look is straight and tight.

The joint network is MediaPipe's own (hand_landmarks_detector.tflite, inside the game's
vendor/mediapipe/models/hand_landmarker.task — Apache 2.0), run by Google's LiteRT
(pip: ai-edge-litert). Checked by SHA-256 before use. It runs on the processor (XNNPACK):
two hands ≈ 4–8 ms, less than the full HandLandmarker V3 uses. See tools/handbench (the benchmark).
"""

import hashlib
import math
import os
import sys
import threading
import zipfile

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
TASK = os.path.join(ROOT, "vendor", "mediapipe", "models", "hand_landmarker.task")
CACHE = os.path.join(ROOT, "vendor", "mediapipe", "models", "v5")
NET = "hand_landmarks_detector.tflite"
# the joint network inside the game's hand_landmarker.task (counted from that same file)
NET_SHA256 = "6acda74af3fbf40e68265c20c7394b2bad81a16a481dcd79ad7a081887c3d6b9"
SIZE = 224

# pose points of each side: wrist, pinky, index, thumb, elbow (MediaPipe Pose, the person's sides)
POSE_SIDE = {"left": (15, 17, 19, 21, 13), "right": (16, 18, 20, 22, 14)}
# the points of the palm and the first joints: the square of a followed hand is made from them
# (as MediaPipe's own tracking: they move with the hand whatever the fingers do)
PARTIAL = [0, 1, 2, 3, 5, 6, 9, 10, 13, 14, 17, 18]

# How the square is made (tuned on the benchmark's own part, tools/handbench: --tune)
POSE_CENTER = 0.9  # the square's middle: the wrist + POSE_CENTER × (wrist→knuckles of the pose)
POSE_SCALE = 4.0  # its side: POSE_SCALE × |wrist→knuckles| ...
FOREARM_SCALE = 0.75  # ... at least FOREARM_SCALE × the forearm (the pose's knuckles are a guess)
TRACK_SCALE = 2.0  # a followed hand: its palm's box × TRACK_SCALE (MediaPipe's own)
TRACK_SHIFT = -0.1  # ... moved towards the fingers by this much of the side
RETRY = 2  # a lost hand is looked for every RETRY-th picture
STICKY = 0.05  # a followed hand's square stays while the new one is within this much of its side
PRESENCE = 0.3  # how sure the network must be that a hand is in the square
RTM_GATE = 0.3  # ... or RTMPose about its points (engine "rtm")
RTM_POSE_BOX = 0.9  # RTMPose's upright box round the body's square: this much of its side


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def net_path():
    """The joint network, taken out of the game's hand_landmarker.task and checked (SHA-256)."""
    out = os.path.join(CACHE, NET)
    if os.path.exists(out) and sha256_of(out) == NET_SHA256:
        return out
    os.makedirs(CACHE, exist_ok=True)
    with zipfile.ZipFile(TASK) as z:
        data = z.read(NET)
    if hashlib.sha256(data).hexdigest() != NET_SHA256:
        raise RuntimeError("сеть кисти V5 не прошла проверку SHA-256")
    tmp = out + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, out)
    return out


def make_interpreter(path=None, threads=2):
    from ai_edge_litert.interpreter import Interpreter
    it = Interpreter(model_path=path or net_path(), num_threads=threads)
    it.allocate_tensors()
    return it


class Square:
    """A turned square in the picture (pixels): centre, side, turn (rad: 0 = the fingers up)."""

    __slots__ = ("cx", "cy", "side", "rot")

    def __init__(self, cx, cy, side, rot):
        self.cx, self.cy, self.side, self.rot = float(cx), float(cy), float(side), float(rot)

    def matrix(self):
        """2×3: the picture → the network's 224×224 (the fingers up)."""
        c, s = math.cos(self.rot), math.sin(self.rot)
        k = SIZE / self.side
        # rotate the picture by −rot about the centre, scale, put the centre in the middle
        a, b = c * k, s * k
        return np.array([[a, b, SIZE / 2 - a * self.cx - b * self.cy],
                         [-b, a, SIZE / 2 + b * self.cx - a * self.cy]], dtype=np.float32)

    def back(self, pts):
        """Network pixels (N×2) → picture pixels."""
        c, s = math.cos(self.rot), math.sin(self.rot)
        k = self.side / SIZE
        u = (pts[:, 0] - SIZE / 2) * k
        v = (pts[:, 1] - SIZE / 2) * k
        return np.stack([self.cx + c * u - s * v, self.cy + s * u + c * v], axis=1)


def _up_angle(dx, dy):
    """The turn that puts the direction (dx, dy) (picture pixels, y down) straight up."""
    return math.atan2(dx, -dy)


def square_from_pose(pose, side, w, h):
    """The square around a hand from the body's points (normalized), or None (not seen)."""
    iw, ip, ii, it_, ie = POSE_SIDE[side]
    if not pose or len(pose) < 23:
        return None
    P = lambda i: (pose[i]["x"] * w, pose[i]["y"] * h)  # noqa: E731
    vis = lambda i: pose[i].get("visibility", 1.0) or 0.0  # noqa: E731
    if vis(iw) < 0.2:
        return None
    wx, wy = P(iw)
    kx = (P(ip)[0] + P(ii)[0]) / 2
    ky = (P(ip)[1] + P(ii)[1]) / 2
    dx, dy = kx - wx, ky - wy
    L = math.hypot(dx, dy)
    ex, ey = P(ie)
    fore = math.hypot(wx - ex, wy - ey)
    if L < 1e-3 or min(vis(ip), vis(ii)) < 0.1:
        # the knuckles not seen: the hand goes on along the forearm
        if fore < 1e-3:
            return None
        dx, dy = (wx - ex) / fore, (wy - ey) / fore
        L = fore * 0.3
        dx, dy = dx * L, dy * L
    side_px = max(POSE_SCALE * L, FOREARM_SCALE * fore, 0.035 * h)
    return Square(wx + POSE_CENTER * dx, wy + POSE_CENTER * dy, side_px, _up_angle(dx, dy))


def square_from_hand(pts):
    """The square of a followed hand from its own points (picture pixels, 21×2) — as MediaPipe."""
    w0 = pts[0]
    m = (pts[5] + pts[13]) / 2
    m = (m + pts[9]) / 2  # (between the middle knuckle and the index/ring knuckles: steadier)
    rot = _up_angle(m[0] - w0[0], m[1] - w0[1])
    c, s = math.cos(rot), math.sin(rot)
    q = pts[PARTIAL]
    # the palm's box in the hand's own turn
    u = c * q[:, 0] + s * q[:, 1]
    v = -s * q[:, 0] + c * q[:, 1]
    u0, u1, v0, v1 = u.min(), u.max(), v.min(), v.max()
    side = max(u1 - u0, v1 - v0, 4.0) * TRACK_SCALE  # (a collapsed hand: still a square)
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2 + TRACK_SHIFT * side
    return Square(c * cu - s * cv, s * cu + c * cv, side, rot)


class HandNet:
    """The joint network on one square: 21 points (picture pixels + depth), how sure, which hand."""

    def __init__(self, path=None, threads=2):
        self.it = make_interpreter(path, threads)
        d = self.it.get_input_details()[0]
        self.inp = d["index"]
        out = {o["name"]: o["index"] for o in self.it.get_output_details()}
        self.o_pts, self.o_pres, self.o_hand = out["Identity"], out["Identity_1"], out["Identity_2"]
        self.lock = threading.Lock()

    def run(self, rgb, sq):
        import cv2
        crop = cv2.warpAffine(rgb, sq.matrix(), (SIZE, SIZE), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        x = crop.astype(np.float32)[None] * (1 / 255)
        with self.lock:
            self.it.set_tensor(self.inp, x)
            self.it.invoke()
            raw = self.it.get_tensor(self.o_pts).reshape(21, 3).copy()
            pres = float(self.it.get_tensor(self.o_pres).ravel()[0])
            right = float(self.it.get_tensor(self.o_hand).ravel()[0])
        xy = sq.back(raw[:, :2])
        z = raw[:, 2] * (sq.side / SIZE)  # (depth on the same scale as the picture's pixels)
        return xy, z, pres, right


class RTMNet:
    """
    RTMPose-m hand (OpenMMLab, Apache 2.0): 21 points of a hand in an upright box, 256×256, very
    good at small and closed hands (the benchmark) — but flat (no depth). onnxruntime; on the
    video card if this onnxruntime has one (DirectML / CUDA), else the processor.
    """

    MEAN = np.array([123.675, 116.28, 103.53], np.float32)
    STD = np.array([58.395, 57.12, 57.375], np.float32)

    def __init__(self, path, threads=2):
        import onnxruntime as ort
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
        have = ort.get_available_providers()
        prov = [p for p in ("CUDAExecutionProvider", "DmlExecutionProvider") if p in have] + ["CPUExecutionProvider"]
        self.s = ort.InferenceSession(path, so, providers=prov)
        self.device = "GPU" if self.s.get_providers()[0] != "CPUExecutionProvider" else "CPU"
        i = self.s.get_inputs()[0]
        self.inp, self.H, self.W = i.name, int(i.shape[2]), int(i.shape[3])

    def run(self, rgb, cx, cy, side):
        """The hand in the upright box (centre, side; picture pixels) → (21×2 picture pixels, how sure 0…1)."""
        import cv2
        k = self.W / side
        M = np.array([[k, 0, self.W / 2 - k * cx], [0, k, self.H / 2 - k * cy]], np.float32)
        crop = cv2.warpAffine(rgb, M, (self.W, self.H), flags=cv2.INTER_LINEAR)
        x = ((crop.astype(np.float32) - self.MEAN) / self.STD).transpose(2, 0, 1)[None]
        sx, sy = self.s.run(None, {self.inp: x})
        px = sx[0].argmax(1) * (self.W / sx.shape[2])
        py = sy[0].argmax(1) * (self.H / sy.shape[2])
        conf = float(np.minimum(sx[0].max(1), sy[0].max(1)).mean())
        return np.stack([(px - M[0, 2]) / k, (py - M[1, 2]) / k], 1), conf


def box_of(pts, grow=1.25):
    """The upright box round a hand's points: (centre x, centre y, side)."""
    lo, hi = pts.min(0), pts.max(0)
    return (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, max(hi[0] - lo[0], hi[1] - lo[1]) * grow + 4


# RTMPose-m hand (OpenMMLab RTMPose, Apache 2.0; rtmpose-m_simcc-hand5 256×256 as ONNX — the copy kept
# in renesas-rdk/hand_models, Apache 2.0). Fetched only for the video card, checked by SHA-256.
RTM = {
    "file": "rtmpose_m_hand5_256.onnx",
    "url": "https://media.githubusercontent.com/media/renesas-rdk/hand_models/main/hand_landmark_estimation/rtmpose/rtmpose.onnx",
    "size": 55118356,
    "sha256": "7abd0f0e999956405c4c20992b153e099e8952cdc9f0dd25f3efe9a6b65c3cb4",
}
ORT_GPU_DIR = os.path.join(ROOT, "vendor", "ort-gpu")
ORT_GPU_PKG = "onnxruntime-directml==1.24.4"  # (DirectML: any DirectX 12 video card on Windows)


def rtm_path(log=print):
    """RTMPose's file: fetched once (≈ 55 MB) and checked (SHA-256)."""
    out = os.path.join(CACHE, RTM["file"])
    if os.path.exists(out) and os.path.getsize(out) == RTM["size"] and sha256_of(out) == RTM["sha256"]:
        return out
    import urllib.request
    os.makedirs(CACHE, exist_ok=True)
    tmp = out + ".part"
    log("  [Камера] Кисти V5: скачиваю RTMPose для видеокарты (один раз, 55 МБ)...")
    with urllib.request.urlopen(RTM["url"], timeout=120) as r, open(tmp, "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    if os.path.getsize(tmp) != RTM["size"] or sha256_of(tmp) != RTM["sha256"]:
        os.remove(tmp)
        raise RuntimeError("RTMPose не прошёл проверку SHA-256")
    os.replace(tmp, out)
    return out


def ort_gpu_dir(log=print):
    """Windows: onnxruntime with DirectML in a folder of its own (the voice's onnxruntime is never
    touched); None elsewhere (the usual onnxruntime, if it has CUDA)."""
    if not sys.platform.startswith("win"):
        return None
    if os.path.isdir(os.path.join(ORT_GPU_DIR, "onnxruntime")):
        return ORT_GPU_DIR
    if os.environ.get("ZNS_NO_PIP"):
        raise RuntimeError("нет onnxruntime-directml")
    import subprocess
    log("  [Камера] Кисти V5: устанавливаю onnxruntime-directml для видеокарты (один раз, 25 МБ)...")
    r = subprocess.run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "-q", "--no-deps",
                        "--target", ORT_GPU_DIR, ORT_GPU_PKG], capture_output=True, text=True, timeout=1800)
    if r.returncode != 0:
        raise RuntimeError("не удалось установить onnxruntime-directml: " + ((r.stderr or r.stdout or "").strip().splitlines() or [""])[-1])
    return ORT_GPU_DIR


class RTMRemote:
    """RTMPose in its own program on the video card (hand_v5_gpu.py); the same run() as RTMNet."""

    W = H = 256

    def __init__(self, model, ort_dir=None, timeout=60, probe=False):
        import json
        import subprocess
        import struct
        self.struct = struct
        # (CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS: the game and the voice go first)
        flags = 0x08000000 | 0x00004000 if sys.platform.startswith("win") else 0
        self.p = subprocess.Popen([sys.executable, os.path.join(ROOT, "hand_v5_gpu.py"), model, ort_dir or ""],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=flags)
        self.lock = threading.Lock()
        got = [None]

        def hello():
            try:
                tag, data = self._recv()
                got[0] = json.loads(data) if tag == b"HELO" else {"ok": False, "why": "неверный ответ"}
            except Exception as e:  # noqa: BLE001
                got[0] = {"ok": False, "why": f"программа видеокарты закрылась ({e or type(e).__name__})"}
        t = threading.Thread(target=hello, daemon=True)
        t.start()
        t.join(timeout)
        info = got[0] or {"ok": False, "why": "программа видеокарты не ответила"}
        if not info.get("ok"):
            self.close()
            raise RuntimeError(info.get("why") or "видеокарта недоступна")
        self.info = info
        self.device = "GPU" if info.get("provider") != "CPUExecutionProvider" else "CPU"
        if probe:
            self.close()  # (it only answered whether there is a video card)

    def _recv(self):
        r = self.p.stdout
        head = r.read(8)
        if len(head) < 8:
            raise EOFError("нет ответа")
        n = self.struct.unpack("<I", head[4:])[0]
        data = r.read(n)
        if len(data) < n:
            raise EOFError("ответ оборван")
        return head[:4], data

    def run(self, rgb, cx, cy, side):
        import cv2
        k = self.W / side
        M = np.array([[k, 0, self.W / 2 - k * cx], [0, k, self.H / 2 - k * cy]], np.float32)
        crop = cv2.warpAffine(rgb, M, (self.W, self.H), flags=cv2.INTER_LINEAR)
        with self.lock:
            self.p.stdin.write(b"RUN " + self.struct.pack("<I", 1) + np.ascontiguousarray(crop).tobytes())
            self.p.stdin.flush()
            tag, data = self._recv()
        if tag != b"OUT ":
            raise RuntimeError("программа видеокарты сломалась")
        r = np.frombuffer(data, np.float32).reshape(21, 3)
        return np.stack([(r[:, 0] - M[0, 2]) / k, (r[:, 1] - M[1, 2]) / k], 1), float(r[:, 2].mean())

    def close(self):
        try:
            self.p.stdin.close()
        except Exception:  # noqa: BLE001
            pass
        try:
            self.p.kill()
        except Exception:  # noqa: BLE001
            pass


class HandsV5:
    """
    Both hands of the person from the body's points: process(rgb, pose) → the hands in the
    format pose_native.py streams ({landmarks, label, score}). Keeps each hand's square
    between pictures (tracking).

    engine "mp":  MediaPipe's joint network alone (points + depth);
    engine "rtm": RTMPose finds the points (more exact on small hands, fists), then MediaPipe's
                  joint network looks at the square made from them — the depth of every point
                  (which way the palm faces) and how sure it is that a hand is there.
    """

    def __init__(self, path=None, threads=1, engine="mp", rtm_path=None):
        # one network for each hand: both hands are looked at at once (in two threads)
        self.nets = {"left": HandNet(path, threads), "right": HandNet(path, threads)}
        self.rtm = {s: RTMNet(rtm_path, threads) for s in ("left", "right")} if engine == "rtm" else None
        self.engine = engine
        self.rtm_error = ""
        self.track = {"left": None, "right": None}  # {pts, vel, sq, box}
        self.miss = {}
        self.stats = {"runs": 0, "found": 0, "from_pose": 0, "refined": 0}

    def reset(self):
        self.track = {"left": None, "right": None}
        self.miss = {}

    def use_rtm(self, rtm):
        """Switch to RTMPose (one RTMNet / RTMRemote for both hands — it keeps its own lock), or back (None)."""
        self.rtm = {"left": rtm, "right": rtm} if rtm is not None else None
        self.engine = "rtm" if rtm is not None else "mp"

    def _wrist(self, pose, side, w, h):
        i = POSE_SIDE[side][0]
        if not pose or len(pose) <= i or (pose[i].get("visibility", 1.0) or 0) < 0.2:
            return None
        return np.array([pose[i]["x"] * w, pose[i]["y"] * h])

    def _seed(self, seeds, wrist, side):
        """A hand the palm detector found (21×2 picture pixels) that is this side's, or None."""
        best, bd = None, 1e9
        for i, q in enumerate(seeds or []):
            if q is None:
                continue
            size = np.ptp(q, axis=0).max() + 1
            d = np.hypot(*(q[0] - wrist)) / size if wrist is not None else 0.0
            if d < bd and d < 1.5:
                best, bd = i, d
        if best is None:
            return None
        q = seeds[best]
        seeds[best] = None  # (one hand for one side)
        return q

    def one(self, rgb, pose, side, now=None, refine=True, seeds=None):
        """One hand: (pts 21×2 picture pixels, z 21, how sure) or None. seeds: hands found by
        MediaPipe's palm detector (21×2 picture pixels) — a hand too near the camera for the body's
        wrist to be right (close up, the body network puts the wrist anywhere on a big hand)."""
        h, w = rgb.shape[:2]
        tr = self.track[side]
        wrist = self._wrist(pose, side, w, h)
        sq = pts = None
        if tr is not None:
            pts = tr["pts"]
            if tr.get("vel") is not None:
                pts = pts + tr["vel"]  # (where the hand will be: it goes on as it went)
            sq = square_from_hand(pts)
            # (a hand that barely moved keeps its square: the network then sees the same picture, and
            # its points don't tremble with a square that trembles with them)
            last = tr.get("sq")
            if STICKY and last is not None and math.hypot(sq.cx - last.cx, sq.cy - last.cy) < STICKY * last.side \
                    and abs(sq.side / last.side - 1) < STICKY * 1.5 and abs(math.remainder(sq.rot - last.rot, math.tau)) < STICKY * 1.5:
                sq = last
            # the body's wrist far from the followed hand: the hand was lost or swapped — start again
            if wrist is not None and np.hypot(*(pts[0] - wrist)) > sq.side * 0.9:
                sq = pts = None
        fresh = sq is None
        if fresh:
            # (a hand not found in the last picture is looked for again only every RETRY-th picture:
            # a hand behind the back must not cost the processor every picture)
            self.miss[side] = self.miss.get(side, 0) + 1 if tr is None else 0
            seed = self._seed(seeds, wrist, side) if seeds else None
            if seed is not None:
                sq = square_from_hand(seed)
            elif self.miss[side] % RETRY != 1 and RETRY > 1 and tr is None and self.miss[side] > 1:
                return None
            else:
                sq = square_from_pose(pose, side, w, h)
            if sq is None:
                self.track[side] = None
                return None
            self.stats["from_pose"] += 1
        rtm = self.rtm
        r = None
        box = None
        if rtm:
            # RTMPose's upright box: from the followed hand's own points (kept while it barely moves,
            # as the square), or — found anew — round the body's square
            if pts is not None:
                box = box_of(pts)
                lb = tr.get("box")
                if STICKY and lb is not None and math.hypot(box[0] - lb[0], box[1] - lb[1]) < STICKY * lb[2] and abs(box[2] / lb[2] - 1) < STICKY * 1.5:
                    box = lb
            try:
                r = self._rtm(rgb, side, sq, box, fresh and refine)
            except Exception as e:  # noqa: BLE001
                # the video card's program died: MediaPipe's joint network alone from now on (never the camera)
                self.rtm_error = str(e) or type(e).__name__
                self.use_rtm(None)
                rtm = None
        if not rtm:
            r = self._mp(rgb, side, sq, fresh and refine)
        if r is None:
            self.track[side] = None
            return None
        xy, z, pres = r
        vel = None
        if tr is not None and not fresh:
            # the hand's own speed (pixels a picture), eased: the next square goes with it
            v = xy[0] - tr["pts"][0]
            vel = v if tr.get("vel") is None else tr["vel"] * 0.5 + v * 0.5
            if np.hypot(*vel) > sq.side * 0.5:
                vel = None
        self.track[side] = {"pts": xy, "vel": vel, "sq": sq if not fresh else None, "box": box}
        self.stats["found"] += 1
        self.miss[side] = 0
        return xy, z, pres

    def _mp(self, rgb, side, sq, refine):
        net = self.nets[side]
        self.stats["runs"] += 1
        xy, z, pres, _ = net.run(rgb, sq)
        if pres < PRESENCE:
            return None
        if refine:
            # the first look came from the body's guess: look again, square made from the hand itself
            self.stats["runs"] += 1
            self.stats["refined"] += 1
            xy2, z2, pres2, _ = net.run(rgb, square_from_hand(xy))
            if pres2 >= PRESENCE:
                xy, z, pres = xy2, z2, pres2
        return xy, z, pres

    def _rtm(self, rgb, side, sq, box, refine):
        rtm = self.rtm[side]
        cx, cy, s = box if box is not None else (sq.cx, sq.cy, sq.side * RTM_POSE_BOX)
        self.stats["runs"] += 1
        p, conf = rtm.run(rgb, cx, cy, s)
        if refine and conf >= RTM_GATE * 0.5:
            self.stats["runs"] += 1
            self.stats["refined"] += 1
            p2, conf2 = rtm.run(rgb, *box_of(p))
            if conf2 >= conf * 0.8:
                p, conf = p2, conf2
        # MediaPipe's joint network on the square made from these points: the depth, and is it a hand
        _, z, pres, _ = self.nets[side].run(rgb, square_from_hand(p))
        if conf < RTM_GATE and pres < PRESENCE:
            return None
        return p, z, max(pres, conf)

    def tracking(self):
        """Are both hands followed (their squares come from themselves, not from the body)?"""
        return self.track["left"] is not None and self.track["right"] is not None

    def process(self, rgb, pose, now=None, pool=None, seeds=None):
        """seeds: hands from MediaPipe's palm detector (normalized landmark lists), for hands lost."""
        h, w = rgb.shape[:2]
        sides = ("left", "right")
        if seeds:
            seeds = [np.array([[p["x"] * w, p["y"] * h] for p in lm]) for lm in seeds]
            # (each side takes its own seed first — then the two threads can't take the same one)
            got_seed = {}
            for sd in sides:
                if self.track[sd] is None:
                    got_seed[sd] = [self._seed(seeds, self._wrist(pose, sd, w, h), sd)]
            seeds = got_seed
        else:
            seeds = {}
        if pool is not None:
            jobs = [pool.submit(self.one, rgb, pose, s, now, True, seeds.get(s)) for s in sides]
            got = [j.result() for j in jobs]
        else:
            got = [self.one(rgb, pose, s, now, True, seeds.get(s)) for s in sides]
        hands = []
        for side, r in zip(sides, got):
            if r is None:
                continue
            xy, z, pres = r
            hands.append({
                "landmarks": [{"x": float(xy[i, 0] / w), "y": float(xy[i, 1] / h), "z": float((z[i] - z[0]) / w)} for i in range(21)],
                # (MediaPipe's labels are for a mirrored picture: the person's right hand is "Left")
                "label": "Left" if side == "right" else "Right",
                "score": float(pres),
                "side": side,
            })
        return hands
