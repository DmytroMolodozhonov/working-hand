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
     hand itself): the second look is straight and tight;
  5. a closed, blurred or turned hand makes the network doubt (0.05–0.3) while its points are right:
     a followed hand is still taken where it was going, of its size, with its own palm;
  6. a hand no network sees (a fast wave blurs it) is held up to HOLD s, moved with the picture round
     it (optical flow), while the body sees that wrist — it never vanishes and comes back.
  Measured on the author's own recording: tools/handbench/video.py (README there).

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
import time
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
RETRY = 2  # a lost hand the body doesn't see is looked for every RETRY-th picture (one it sees: every picture)
STICKY = 0.05  # a followed hand's square stays while the new one is within this much of its side
PRESENCE = 0.3  # how sure the network must be that a hand is in the square
# (the author's recording, tools/handbench/video.py: a closed, blurred or turned hand gets 0.05–0.3 from
# the network for a few pictures while its points are right — such a hand was dropped and came back)
PRESENCE_TRACK = 0.12  # ... a followed hand where it was going, of its size (_consistent): this is enough
TRACK_NEAR = 0.8  # "where it was going": the wrist and the middle knuckle within this much of the palm's size
TRACK_GROW = 1.6  # "of its size": not this many times bigger or smaller
WIDE = 1.6  # a lost hand is looked for in the body's square and in one this much bigger (a hand toward the camera)
# A wand pointed straight at the target (at the camera) foreshortens the forearm and the palm: the body's
# square (from wrist→knuckles and the forearm) and the followed square (from the palm) shrank smaller than
# the fist itself and the hand was lost exactly then (the author: «в битве, когда прямо направляешь палочку»).
# The shoulders don't shrink: a hand is 0.29–0.63 of the shoulders' width, a followed square 0.56–1.05.
POSE_MIN = 0.8  # the body's square: at least this many shoulder widths
TRACK_MIN = 0.6  # a followed (or held) hand's square: at least this many shoulder widths
# ... and such a hand has no clear «up» (the network wants the fingers up in its square): at the wrong turn
# it says 0, at the right one 0.7–0.9. On the video card a lost hand's square is looked at in SWEEP turns
# and SWEEP_SIZES (shoulder widths) at once — one call more is nothing there (on the processor: not done)
SWEEP = 12
SWEEP_SIZES = (0.8, 1.2)
LOOKS = 3  # at most this many squares a picture for a lost hand
TRACK_FLOW = True  # a followed or held hand moves with the picture round it (optical flow): its next square, its held place
HOLD = 0.5  # s: a hand the network lost is held this long, carried by the body's arm, while the body sees the wrist
HOLD_STILL = 2.0  # s: ... and this long while it stays where it was lost (aiming the wand: the hand is still)
STILL = 0.6  # "where it was lost": its wrist within this much of the hand's size
IN_VIEW = 0.5  # the body's wrist this sure: it is in the picture
WRIST_FAR = 1.0  # a hand whose wrist is this many of its sizes from the body's (sure) wrist is not this hand
# (the body's wrist against the reference hand's on the author's recording: 0.19 of the hand's size typically, 0.66 at most)
PALM_BONES = [(0, 5), (0, 9), (0, 13), (0, 17), (5, 9), (9, 13), (13, 17)]
PALM_TOL = 0.35  # a doubtful hand's palm bones within this much of the sure palm's
PALM_SURE = 0.5  # the network this sure: its palm is the hand's own palm


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


def shoulders_px(pose, w, h):
    """The shoulders' width in picture pixels (0 when the body doesn't see them)."""
    if not pose or len(pose) < 13:
        return 0.0
    a, b = pose[11], pose[12]
    if min(a.get("visibility", 1.0) or 0, b.get("visibility", 1.0) or 0) < 0.3:
        return 0.0
    return math.hypot((a["x"] - b["x"]) * w, (a["y"] - b["y"]) * h)


def at_least(sq, side_px):
    """The same square, not smaller than side_px (a foreshortened hand: the square must still hold the fist)."""
    return sq if sq.side >= side_px else Square(sq.cx, sq.cy, side_px, sq.rot)


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
    side_px = max(POSE_SCALE * L, FOREARM_SCALE * fore, 0.035 * h, POSE_MIN * shoulders_px(pose, w, h))
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
    RTMPose-m hand (OpenMMLab, Apache 2.0): 21 points of a hand in an upright box, 256×256 — flat
    (no depth). Only the benchmark uses it now (tools/handbench: the reference's second opinion): on
    the author's own recording it was not better than MediaPipe's joint network, and five times dearer.
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


# MediaPipe's joint network (the same hand_landmarks_detector.tflite) as ONNX, for the video card:
# converted once (tf2onnx 1.17, opset 17; the batch made free: many squares a call) — its answers
# match the tflite's to 0.0002 px. Kept in the game (vendor/mediapipe/models), checked by SHA-256.
GPU_NET = os.path.join(ROOT, "vendor", "mediapipe", "models", "hand_landmarks_v5.onnx")
GPU_NET_SHA256 = "0a4335cb776271235ec2f72adff6ed69184ae618cbc3923b0782ef8ce8a0ad65"
ORT_GPU_DIR = os.path.join(ROOT, "vendor", "ort-gpu")
ORT_GPU_PKG = "onnxruntime-directml==1.24.4"  # (DirectML: any DirectX 12 video card on Windows)


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


def gpu_net_path():
    if not os.path.exists(GPU_NET) or sha256_of(GPU_NET) != GPU_NET_SHA256:
        raise RuntimeError("сеть кисти для видеокарты не прошла проверку SHA-256")
    return GPU_NET


class GpuNet:
    """
    MediaPipe's joint network on the video card, in a program of its own (hand_v5_gpu.py: its own
    onnxruntime with DirectML / CUDA). run_many(rgb, squares) → [(xy, z, how sure, which hand)] — all
    the squares of a picture (both hands, every square tried) in ONE call: a call costs the same for
    one square or six.
    """

    def __init__(self, ort_dir=None, timeout=60, probe=False):
        import json
        import subprocess
        import struct
        self.struct = struct
        # (CREATE_NO_WINDOW; the probe at BELOW_NORMAL. The working one at NORMAL — it is on the path of EVERY camera
        # picture: at BELOW_NORMAL it was level with the villagers' network (llm_native: BELOW_NORMAL) and under the
        # voices, and every picture's hands waited for them — «камера шлёт раз в 63–100 мс при 41–55 FPS игры»)
        flags = (0x08000000 | (0x00004000 if probe else 0)) if sys.platform.startswith("win") else 0
        model = "--probe" if probe else gpu_net_path()
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

    def run_many(self, rgb, squares):
        import cv2
        if not squares:
            return []
        crops = np.stack([cv2.warpAffine(rgb, sq.matrix(), (SIZE, SIZE), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
                          for sq in squares])
        with self.lock:
            self.p.stdin.write(b"RUN " + self.struct.pack("<I", len(squares)) + np.ascontiguousarray(crops).tobytes())
            self.p.stdin.flush()
            tag, data = self._recv()
        if tag != b"OUT ":
            raise RuntimeError("программа видеокарты сломалась")
        r = np.frombuffer(data, np.float32).reshape(len(squares), 65)
        out = []
        for sq, row in zip(squares, r):
            raw = row[:63].reshape(21, 3)
            out.append((sq.back(raw[:, :2]), raw[:, 2] * (sq.side / SIZE), float(row[63]), float(row[64])))
        return out

    def close(self):
        try:
            self.p.stdin.close()
        except Exception:  # noqa: BLE001
            pass
        try:
            self.p.kill()
        except Exception:  # noqa: BLE001
            pass


class _Pic:
    """One hand in one picture, between the steps of HandsV5 (the squares looked at, what was found)."""

    __slots__ = ("side", "tr", "wrist", "inview", "sure_wrist", "pts", "sq", "found", "fresh", "cands", "seed", "skip", "least")

    def __init__(self, side):
        self.side = side
        self.sq = self.found = self.cands = self.seed = self.pts = None
        self.fresh = True
        self.skip = False


class HandsV5:
    """
    Both hands of the person from the body's points: process(rgb, pose) → the hands in the
    format pose_native.py streams ({landmarks, label, score}). Keeps each hand's square
    between pictures (tracking).

    MediaPipe's joint network looks at the squares — on the video card when there is one
    (use_gpu: GpuNet, every square of a picture in one call), else on the processor (one
    network a hand, both hands at once in two threads). The steps are the same either way
    (_begin → the followed square → the squares to look for a lost hand → one more look from
    the hand found → _end), so the two give the same hands.
    """

    def __init__(self, path=None, threads=1):
        self.nets = {"left": HandNet(path, threads), "right": HandNet(path, threads)}
        self.gpu = None
        self.engine = "cpu"
        self.gpu_error = ""
        self.track = {"left": None, "right": None}  # {pts, z, vel, sq, t, wrist, fore, pres[, held, base]}
        self.held = {"left": False, "right": False}
        self.palm = {}  # each hand's palm when the network was sure (_palm_ok)
        self._prev_rgb = None
        self.miss = {}
        self.stats = {"runs": 0, "found": 0, "from_pose": 0, "refined": 0, "held": 0, "calls": 0}

    def reset(self):
        self.track = {"left": None, "right": None}
        self.held = {"left": False, "right": False}
        self.palm = {}
        self.miss = {}

    def use_gpu(self, gpu):
        """The video card's program (GpuNet), or back to the processor (None)."""
        self.gpu = gpu
        self.engine = "gpu" if gpu is not None else "cpu"

    # ------------------------------------------------------------------ the body's arm
    def _wrist(self, pose, side, w, h, vis=0.2):
        i = POSE_SIDE[side][0]
        if not pose or len(pose) <= i or (pose[i].get("visibility", 1.0) or 0) < vis:
            return None
        return np.array([pose[i]["x"] * w, pose[i]["y"] * h])

    def _in_view(self, pose, side, w, h):
        """The body sees this wrist, inside the picture: the hand is there to be found."""
        p = self._wrist(pose, side, w, h, IN_VIEW)
        return p is not None and 0 <= p[0] < w and 0 <= p[1] < h

    def _forearm(self, pose, side, w, h):
        """The forearm's turn (elbow → wrist, rad) or None."""
        iw, ie = POSE_SIDE[side][0], POSE_SIDE[side][4]
        if not pose or len(pose) <= iw or min(pose[iw].get("visibility", 1.0) or 0, pose[ie].get("visibility", 1.0) or 0) < IN_VIEW:
            return None
        return math.atan2((pose[iw]["y"] - pose[ie]["y"]) * h, (pose[iw]["x"] - pose[ie]["x"]) * w)

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

    # ------------------------------------------------------------------ is it the hand
    def _accept(self, look, ref, side, wrist):
        """Is this look a hand to give? A sure one — yes, unless it is far from the body's wrist (a
        followed square that slid up the forearm); a doubtful one — only where the followed hand was
        going, of its size, with its own palm (_consistent, _palm_ok)."""
        if look is None:
            return False
        xy, z, pres = look
        size = max(float(np.ptp(xy[PARTIAL], axis=0).max()), 4.0)
        if wrist is not None and np.hypot(*(xy[0] - wrist)) > WRIST_FAR * size:
            return False
        if pres >= PRESENCE:
            return True
        return ref is not None and pres >= PRESENCE_TRACK and self._consistent(xy, ref) and self._palm_ok(xy, z, side)

    @staticmethod
    def _palm(xy, z):
        """The palm's own shape: its bones (3D: the picture and the network's depth), as parts of their sum."""
        p = np.concatenate([xy, z[:, None]], 1)
        b = np.array([np.linalg.norm(p[i] - p[j]) for i, j in PALM_BONES])
        return b / max(b.sum(), 1e-6)

    def _palm_ok(self, xy, z, side):
        """A doubtful hand's palm is like the palm this hand had when the network was sure (a blurred
        fist keeps its palm; a mangled guess — stretched along the arm, squeezed to a lump — does not)."""
        ref = self.palm.get(side)
        if ref is None:
            return True
        return float(np.max(np.abs(self._palm(xy, z) - ref) / ref)) < PALM_TOL

    @staticmethod
    def _consistent(xy, ref):
        """A hand the network is not sure of is still taken if it is where the followed hand was going,
        of its size (a blurred, closed or turned hand: the network doubts, the points are right)."""
        size = max(float(np.ptp(ref[PARTIAL], axis=0).max()), 4.0)
        if np.hypot(*(xy[0] - ref[0])) > TRACK_NEAR * size or np.hypot(*(xy[9] - ref[9])) > TRACK_NEAR * size:
            return False
        k = float(np.ptp(xy[PARTIAL], axis=0).max()) / size
        return 1 / TRACK_GROW < k < TRACK_GROW

    # ------------------------------------------------------------------ the steps
    def _begin(self, rgb, pose, side):
        """1. A followed hand: its square from its own points, moved with the picture (or by its own speed)."""
        h, w = rgb.shape[:2]
        c = _Pic(side)
        self.held[side] = False
        c.tr = tr = self.track[side]
        c.wrist = self._wrist(pose, side, w, h)
        c.inview = self._in_view(pose, side, w, h)
        c.sure_wrist = self._wrist(pose, side, w, h, IN_VIEW)
        c.least = TRACK_MIN * shoulders_px(pose, w, h)
        if tr is None or tr.get("held"):
            return c
        pts = tr["pts"]
        flow = self._flow(pts, rgb) if TRACK_FLOW else None
        if flow is not None:
            pts = pts + flow  # (where the hand is: the picture round it moved so)
        elif tr.get("vel") is not None:
            pts = pts + tr["vel"]  # (where the hand will be: it goes on as it went)
        sq = at_least(square_from_hand(pts), c.least)
        # (a hand that barely moved keeps its square: the network then sees the same picture, and
        # its points don't tremble with a square that trembles with them)
        last = tr.get("sq")
        if STICKY and last is not None and math.hypot(sq.cx - last.cx, sq.cy - last.cy) < STICKY * last.side \
                and abs(sq.side / last.side - 1) < STICKY * 1.5 and abs(math.remainder(sq.rot - last.rot, math.tau)) < STICKY * 1.5:
            sq = last
        # the body's wrist far from the followed hand: the hand was lost or swapped — look anew
        if c.wrist is not None and np.hypot(*(pts[0] - c.wrist)) > sq.side * 0.9:
            return c
        c.pts, c.sq = pts, sq
        return c

    def _tracked(self, c, look):
        """The followed square's look: the hand, or look for it."""
        if self._accept(look, c.pts, c.side, c.sure_wrist):
            c.found, c.fresh = look, False
        else:
            c.sq = None

    def _search(self, c, pose, w, h, seeds):
        """2. The squares to look for a lost hand in: where the palm detector saw it, where it is held,
        where the body says it is (and a bigger one: a hand toward the camera). c.skip: not this picture."""
        side, tr = c.side, c.tr
        self.miss[side] = self.miss.get(side, 0) + 1 if tr is None else 0
        c.seed = self._seed(seeds, c.wrist, side) if seeds else None
        # (a hand the body doesn't see, not found in the last picture, is looked for again only every
        # RETRY-th picture: a hand behind the back must not cost the processor every picture)
        if c.seed is None and tr is None and not c.inview and RETRY > 1 and self.miss[side] > 1 and self.miss[side] % RETRY != 1:
            c.skip = True
            return []
        cands = []
        if c.seed is not None:
            cands.append(at_least(square_from_hand(c.seed), c.least))
        if tr is not None and tr.get("held"):
            cands.append(at_least(square_from_hand(tr["pts"]), c.least))  # (where it is held; a followed one was just looked at)
        sp = square_from_pose(pose, side, w, h)
        if sp is not None:
            cands.append(sp)
            cands.append(Square(sp.cx, sp.cy, sp.side * WIDE, sp.rot))
        c.cands = cands[:LOOKS]
        self.stats["from_pose"] += len(c.cands)
        return c.cands

    def _sweep(self, c, cands, pose, w, h):
        """The video card's extra squares for a lost hand: round where it is held (or where the body has
        it), in SWEEP turns and SWEEP_SIZES — a hand pointing at the camera has no clear «up»."""
        if c.skip or not SWEEP:
            return []
        tr = c.tr
        if tr is not None and tr.get("held"):
            cx, cy = tr["pts"][PARTIAL].mean(0)
        else:
            sp = square_from_pose(pose, c.side, w, h)
            if sp is None:
                return []
            cx, cy = sp.cx, sp.cy
        sw = shoulders_px(pose, w, h)
        if sw <= 0:
            return []
        return [Square(cx, cy, k * sw, i * math.tau / SWEEP) for k in SWEEP_SIZES for i in range(SWEEP)]

    def _searched(self, c, sq, look):
        """A searched square's look: True if it is the hand (then the next squares are not needed)."""
        ref = c.tr["pts"] if c.tr is not None else None
        if self._accept(look, ref, c.side, c.sure_wrist if c.seed is None else None):
            c.found, c.sq, c.fresh = look, sq, True
            return True
        return False

    def _refined(self, c, look):
        """3. The hand found from a guessed square, looked at once more from its own points."""
        if look is not None and look[2] >= min(PRESENCE, c.found[2]):
            c.found = look

    def _end(self, c, rgb, pose, now):
        """4. Kept as followed — or held for a moment, or gone."""
        h, w = rgb.shape[:2]
        side, tr = c.side, c.tr
        if c.found is None:
            if c.skip:
                return None
            # not found: held for a moment where the picture (or the body's arm) takes it — a fast wave
            # blurs the hand; the network doubts for a few pictures: the hand must not vanish and come back
            held = self._hold(tr, pose, side, w, h, now, c.inview, rgb)
            if held is None:
                self.track[side] = None
                return None
            self.held[side] = True
            return held
        xy, z, pres = c.found
        vel = None
        if tr is not None and not c.fresh:
            # the hand's own speed (pixels a picture), eased: the next square goes with it
            v = xy[0] - tr["pts"][0]
            vel = v if tr.get("vel") is None else tr["vel"] * 0.5 + v * 0.5
            if np.hypot(*vel) > c.sq.side * 0.5:
                vel = None
        self.track[side] = {"pts": xy, "z": z, "vel": vel, "sq": c.sq if not c.fresh else None, "t": now,
                            "wrist": c.wrist, "fore": self._forearm(pose, side, w, h), "pres": pres}
        if pres >= PALM_SURE:
            pm = self._palm(xy, z)
            ref = self.palm.get(side)
            self.palm[side] = pm if ref is None else ref * 0.9 + pm * 0.1
        self.stats["found"] += 1
        self.miss[side] = 0
        return xy, z, pres

    # ------------------------------------------------------------------ looking
    def _look(self, rgb, side, sq):
        """The network's look at one square: (xy, z, how sure) — not judged here."""
        self.stats["runs"] += 1
        xy, z, pres, _ = self.nets[side].run(rgb, sq)
        return xy, z, pres

    def _looks(self, rgb, squares):
        """The video card's look at many squares at once (GpuNet); on a failure, the processor's from now on."""
        self.stats["runs"] += len(squares)
        self.stats["calls"] += 1
        try:
            return [(xy, z, pres) for xy, z, pres, _ in self.gpu.run_many(rgb, squares)]
        except Exception as e:  # noqa: BLE001
            # the video card's program died: the processor from now on (never the camera)
            self.gpu_error = str(e) or type(e).__name__
            self.use_gpu(None)
            return None

    def one(self, rgb, pose, side, now=None, refine=True, seeds=None):
        """One hand on the processor: (pts 21×2 picture pixels, z 21, how sure) or None. seeds: hands
        found by MediaPipe's palm detector (21×2 picture pixels) — a hand too near the camera for the
        body's wrist to be right. self.held[side]: the hand given is held (the network lost it a moment)."""
        h, w = rgb.shape[:2]
        now = time.perf_counter() if now is None else now
        c = self._begin(rgb, pose, side)
        if c.sq is not None:
            self._tracked(c, self._look(rgb, side, c.sq))
        if c.found is None:
            for sq in self._search(c, pose, w, h, seeds):
                if self._searched(c, sq, self._look(rgb, side, sq)):
                    break
            if c.found is not None and refine:
                self.stats["refined"] += 1
                self._refined(c, self._look(rgb, side, at_least(square_from_hand(c.found[0]), c.least)))
        return self._end(c, rgb, pose, now)

    def _both_gpu(self, rgb, pose, now, seeds):
        """Both hands with the video card: the followed squares in one call, the squares of the lost
        hands in one more, the second looks in one more — three calls at most, usually one."""
        h, w = rgb.shape[:2]
        cs = [self._begin(rgb, pose, s) for s in ("left", "right")]
        tracked = [c for c in cs if c.sq is not None]
        if tracked:
            looks = self._looks(rgb, [c.sq for c in tracked])
            if looks is None:
                return None
            for c, look in zip(tracked, looks):
                self._tracked(c, look)
        lost = [(c, self._search(c, pose, w, h, seeds.get(c.side))) for c in cs if c.found is None]
        flat = [(c, sq) for c, cands in lost for sq in cands + self._sweep(c, cands, pose, w, h)]
        if flat:
            looks = self._looks(rgb, [sq for _, sq in flat])
            if looks is None:
                return None
            # (every square of a lost hand looked at: the surest one that is this hand wins)
            best = {}
            for (c, sq), look in zip(flat, looks):
                if (c.side not in best or look[2] > best[c.side][2][2]) and self._searched(c, sq, look):
                    best[c.side] = (c, sq, look)
                    c.found = None
            for c, sq, look in best.values():
                c.found, c.sq, c.fresh = look, sq, True
        fresh = [c for c, _ in lost if c.found is not None]
        if fresh:
            self.stats["refined"] += len(fresh)
            looks = self._looks(rgb, [at_least(square_from_hand(c.found[0]), c.least) for c in fresh])
            if looks is None:
                return None
            for c, look in zip(fresh, looks):
                self._refined(c, look)
        return [self._end(c, rgb, pose, now) for c in cs]

    # ------------------------------------------------------------------ a held hand
    def _flow(self, pts, rgb):
        """How the picture round the hand moved since the last picture (optical flow, Lucas–Kanade on a
        small grey crop): (dx, dy) pixels, or None (no last picture, too few points followed)."""
        prev = self._prev_rgb
        if prev is None or prev.shape != rgb.shape:
            return None
        import cv2
        h, w = rgb.shape[:2]
        size = max(float(np.ptp(pts, axis=0).max()), 8.0)
        c = pts.mean(0)
        r = size * 1.6
        x0, y0 = int(max(0, c[0] - r)), int(max(0, c[1] - r))
        x1, y1 = int(min(w, c[0] + r)), int(min(h, c[1] + r))
        if x1 - x0 < 16 or y1 - y0 < 16:
            return None
        a = cv2.cvtColor(np.ascontiguousarray(prev[y0:y1, x0:x1]), cv2.COLOR_RGB2GRAY)
        b = cv2.cvtColor(np.ascontiguousarray(rgb[y0:y1, x0:x1]), cv2.COLOR_RGB2GRAY)
        # the hand's own points and a grid over its palm
        g = np.array([[u, v] for u in np.linspace(-0.4, 0.4, 5) for v in np.linspace(-0.4, 0.4, 5)]) * size + pts[[0, 5, 9, 13, 17]].mean(0)
        p0 = np.concatenate([pts, g]).astype(np.float32) - np.array([x0, y0], np.float32)
        p1, st, err = cv2.calcOpticalFlowPyrLK(a, b, p0[:, None, :], None, winSize=(21, 21), maxLevel=3)
        ok = st.ravel() == 1
        if ok.sum() < 8:
            return None
        d = (p1[:, 0, :] - p0)[ok]
        return np.median(d, axis=0)

    def _hold(self, tr, pose, side, w, h, now, inview, rgb=None):
        """The last hand seen, moved with the picture round it (optical flow) — or, without it, carried by
        the body's arm (its wrist's move and the forearm's turn) — for up to HOLD seconds, only while the
        body still sees that wrist in the picture."""
        if tr is None or now - tr["t"] > HOLD_STILL:
            return None
        base = tr.get("base", tr["pts"])
        if now - tr["t"] > HOLD:
            # held longer only while it stays still (aiming); a hand that went on moving is gone
            size = max(float(np.ptp(base[PARTIAL], axis=0).max()), 4.0)
            if np.hypot(*(tr["pts"][0] - base[0])) > STILL * size:
                return None
        if pose is not None and not inview:
            return None  # (the arm went out of the picture or behind the back: the hand is gone)
        wrist = self._wrist(pose, side, w, h, IN_VIEW)
        pts = base
        flow = self._flow(tr["pts"], rgb) if TRACK_FLOW and rgb is not None else None
        if flow is not None:
            # (the picture round the hand moved so — the blurred hand itself, closer than the body's wrist)
            pts = tr["pts"] + flow
        elif wrist is not None and tr.get("wrist") is not None:
            shift = wrist - tr["wrist"]
            turn = 0.0
            fore = self._forearm(pose, side, w, h)
            if fore is not None and tr.get("fore") is not None:
                turn = max(-1.0, min(1.0, math.remainder(fore - tr["fore"], math.tau)))
            c, s = math.cos(turn), math.sin(turn)
            o = base - base[0]
            pts = np.stack([c * o[:, 0] - s * o[:, 1], s * o[:, 0] + c * o[:, 1]], 1) + base[0] + shift
        elif pose is not None or now - tr["t"] > HOLD / 2:
            return None
        self.track[side] = dict(tr, pts=pts, held=True, base=base, vel=None, sq=None)
        self.stats["held"] = self.stats.get("held", 0) + 1
        return pts, tr["z"], 0.0

    def tracking(self):
        """Are both hands followed (their squares come from themselves, not from the body)?"""
        return all(t is not None and not t.get("held") for t in self.track.values())

    def process(self, rgb, pose, now=None, pool=None, seeds=None):
        """seeds: hands from MediaPipe's palm detector (normalized landmark lists), for hands lost."""
        h, w = rgb.shape[:2]
        now = time.perf_counter() if now is None else now
        sides = ("left", "right")
        if seeds:
            seeds = [np.array([[p["x"] * w, p["y"] * h] for p in lm]) for lm in seeds]
            # (each side takes its own seed first — then the two threads can't take the same one)
            got_seed = {}
            for sd in sides:
                if self.track[sd] is None or self.track[sd].get("held"):
                    got_seed[sd] = [self._seed(seeds, self._wrist(pose, sd, w, h), sd)]
            seeds = got_seed
        else:
            seeds = {}
        got = self._both_gpu(rgb, pose, now, seeds) if self.gpu is not None else None
        if got is None:
            if pool is not None:
                jobs = [pool.submit(self.one, rgb, pose, s, now, True, seeds.get(s)) for s in sides]
                got = [j.result() for j in jobs]
            else:
                got = [self.one(rgb, pose, s, now, True, seeds.get(s)) for s in sides]
        self._prev_rgb = rgb  # (a held hand moves with the picture: _flow)
        hands = []
        for side, r in zip(sides, got):
            if r is None:
                continue
            xy, z, pres = r
            held = self.held[side]
            hands.append({
                "landmarks": [{"x": float(xy[i, 0] / w), "y": float(xy[i, 1] / h), "z": float((z[i] - z[0]) / w)} for i in range(21)],
                # (MediaPipe's labels are for a mirrored picture: the person's right hand is "Left")
                "label": "Left" if side == "right" else "Right",
                # (V5 has judged the hand itself — a hand it gives is a hand: the game's 0.5 is passed;
                # the network's own word is kept in "presence")
                "score": 0.5 if held else 0.5 + 0.5 * min(1.0, float(pres)),
                "presence": float(pres),
                "side": side,
                **({"held": True} if held else {}),
            })
        return hands
