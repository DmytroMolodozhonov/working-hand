"""
pose_native.py — the camera network as a native program, next to the game.

In the browser the network (MediaPipe) only ran fast on the game's own thread,
where every camera picture stopped the game for 45–80 ms; anywhere else in the
browser it was 5–20× slower. Here it runs in Python — the same Google MediaPipe,
native and multi-threaded — on its own: it looks at the camera itself and the
game only receives the points of the body, hands and face (server.py streams
them to the page). The game keeps all its frames.

Needs:  pip install mediapipe   (opencv comes with it). Without it the game
simply uses the browser's network as before.

Two ways inside MediaPipe, whichever this version has:
  - Holistic (the "solutions" API, the same network as the browser game),
  - else the Tasks API: pose + hands + face landmarkers (the .task models the
    game already ships in vendor/mediapipe/models).
"""

import json
import os
import sys

# (MediaPipe's own technical messages would fill the game's console)
os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
import threading
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(ROOT, "vendor", "mediapipe", "models")
_STARTED = time.time()
POSE_MODELS = ["pose_landmarker_lite.task", "pose_landmarker_full.task", "pose_landmarker_heavy.task"]


def _pts(lms, vis=False):
    if not lms:
        return None
    if vis:
        return [{"x": p.x, "y": p.y, "z": p.z, "visibility": getattr(p, "visibility", 1.0) or 0.0} for p in lms]
    return [{"x": p.x, "y": p.y, "z": p.z} for p in lms]


def _sticks(frame, out):
    """The sticks held in the hands seen in this picture (never breaks the camera)."""
    try:
        from stick_detect import find_sticks
        hands = [h["landmarks"] for h in (out.get("hands") or []) if h.get("landmarks")]
        hands += [out[k] for k in ("leftHandLandmarks", "rightHandLandmarks") if out.get(k)]
        return find_sticks(frame, hands) if hands else []
    except Exception:  # noqa: BLE001
        return []


class _LatestFrame:
    """Reads the camera in its own thread and keeps only the newest picture."""

    def __init__(self, cap, stop):
        self.cap = cap
        self.stop = threading.Event()
        self.outer = stop
        self.cond = threading.Condition()
        self.frame = None
        self.seq = 0
        self.taken = 0
        self.fails = 0
        self.dead = False
        self.thread = threading.Thread(target=self._run, name="camera-read", daemon=True)
        self.thread.start()

    def close(self):
        """Stop reading (before the camera is let go)."""
        self.stop.set()
        self.thread.join(timeout=2)

    def _run(self):
        while not self.stop.is_set() and not self.outer.is_set():
            ok, frame = self.cap.read()
            with self.cond:
                if ok and frame is not None:
                    self.frame = frame
                    self.seq += 1
                    self.fails = 0
                else:
                    self.fails += 1
                    self.dead = self.fails > 100
                self.cond.notify_all()
            if not ok:
                time.sleep(0.01)
                if self.dead:
                    return

    def next(self, timeout=1.0):
        """The newest picture not given out yet (waits for one): (ok, frame)."""
        with self.cond:
            if self.seq == self.taken:
                self.cond.wait(timeout)
            if self.seq == self.taken or self.frame is None:
                return False, None
            self.taken = self.seq
            return True, self.frame


class _V5Hands:
    """
    The V5 hand finder (hand_v5.py), made ready in the background: its one package (Google's
    LiteRT, pip ai-edge-litert, ≈ 20 MB) is installed once if missing, the network is taken out of
    the game's own hand_landmarker.task and checked (SHA-256). Until it is ready — or if it can't
    be (state "error", `why` says why) — the camera keeps finding the hands its old way.
    """

    def __init__(self):
        self.state = "off"  # off | installing | loading | ready | error
        self.why = ""
        self.gpu = ""  # what the video card does for V5 (RTMPose), or why nothing
        self.hands = None
        self._lock = threading.Lock()

    def want(self):
        """Asked for: start getting ready (never waits). True once it can be used."""
        with self._lock:
            if self.state == "off":
                self.state = "loading"
                threading.Thread(target=self._prepare, name="hand-v5", daemon=True).start()
        return self.state == "ready"

    def _prepare(self):
        try:
            try:
                import ai_edge_litert  # noqa: F401
            except Exception:  # noqa: BLE001
                if os.environ.get("ZNS_NO_PIP"):
                    raise RuntimeError("нет пакета ai-edge-litert")
                self.state = "installing"
                print("  [Камера] Кисти V5: устанавливаю ai-edge-litert (один раз, около 20 МБ)...")
                import subprocess
                r = subprocess.run([sys.executable, "-m", "pip", "install", "--user", "--disable-pip-version-check", "-q", "ai-edge-litert"],
                                   capture_output=True, text=True, timeout=1800)
                if r.returncode != 0:
                    raise RuntimeError("не удалось установить ai-edge-litert: " + ((r.stderr or r.stdout or "").strip().splitlines() or [""])[-1])
                import importlib
                import site
                try:
                    site.addsitedir(site.getusersitepackages())
                except Exception:  # noqa: BLE001
                    pass
                importlib.invalidate_caches()
            self.state = "loading"
            from hand_v5 import HandsV5
            self.hands = HandsV5()
            self.state = "ready"
            print("  [Камера] Кисти V5 готовы (MediaPipe по участкам вокруг запястий, процессор)")
        except Exception as e:  # noqa: BLE001
            self.why = str(e) or type(e).__name__
            self.state = "error"
            print(f"  [Камера] Кисти V5 не запустились (работают прежние кисти): {self.why}")
            return
        # A video card: RTMPose on it, in a program of its own (more exact on small hands and fists —
        # tools/handbench). On the processor it would be too heavy next to the game: then not.
        if os.environ.get("ZNS_V5_ENGINE", "auto") == "mp":
            return
        try:
            self.gpu = "готовится"
            import hand_v5
            ort_dir = hand_v5.ort_gpu_dir()
            probe = hand_v5.RTMRemote("--probe", ort_dir, probe=True)
            del probe
            remote = hand_v5.RTMRemote(hand_v5.rtm_path(), ort_dir)
            self.hands.use_rtm(remote)
            self.gpu = f"RTMPose на видеокарте ({remote.info.get('provider')}, {remote.info.get('ms')} мс)"
            print(f"  [Камера] Кисти V5: {self.gpu}")
        except Exception as e:  # noqa: BLE001
            self.gpu = "без видеокарты: " + (str(e) or type(e).__name__)
            print(f"  [Камера] Кисти V5: {self.gpu} — работает MediaPipe по участкам (процессор)")

    def reason(self):
        return {"installing": "устанавливается", "loading": "загружается"}.get(self.state, self.why or self.state)


class NativePose:
    def __init__(self):
        self.state = "idle"  # idle | loading | running | error | unavailable
        self.error = ""
        self.backend = ""
        self.camera_index = None
        self.width = 640
        self.height = 480
        self.quality = 1
        self.seq = 0
        self.latest = None  # the newest result (a JSON string)
        self.cost = 0.0
        self.fps = 0.0
        self.cond = threading.Condition()
        self.clients = 0
        self.last_client = time.time()
        self._thread = None
        self._stop = threading.Event()
        self._mp = None
        self._cv2 = None
        self.last_frame = None
        self.hands_mode = ""  # "" — MediaPipe's own hands; "v5" — hand_v5.py (Settings → V5)
        self.v5 = _V5Hands()

    # ------------------------------------------------------------ availability
    def available(self):
        """Can it run here at all (mediapipe + opencv importable)? Cheap after the first call."""
        if self._mp is not None:
            return True
        if self.state == "installing":
            return False
        # (tests: "still being installed" for the first N seconds)
        if os.environ.get("ZNS_FAKE_INSTALL") and time.time() - _STARTED < float(os.environ["ZNS_FAKE_INSTALL"]):
            return False
        try:
            import cv2  # noqa: F401
            import mediapipe  # noqa: F401
            self._cv2 = cv2
            self._mp = mediapipe
            return True
        except Exception as e:  # noqa: BLE001
            self.state = "unavailable"
            self.error = f"{type(e).__name__}: {e}"
            return False

    def status(self):
        return {
            "available": self.available(),
            "state": self.state,
            "error": self.error,
            "backend": self.backend,
            "camera": self.camera_index,
            "fps": round(self.fps, 1),
            "cost": round(self.cost, 1),
            "size": [self.width, self.height],
            "hands": self.hands_mode or "mp",
            "v5": self.v5.state,
            "v5gpu": self.v5.gpu,
        }

    def snapshot(self, width=480, quality=70):
        """The newest camera picture as a small JPEG (bytes), or None (the hand recording)."""
        frame, cv2 = self.last_frame, self._cv2
        if frame is None or cv2 is None:
            return None
        h, w = frame.shape[:2]
        if w > width:
            frame = cv2.resize(frame, (width, int(h * width / w)))
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        return buf.tobytes() if ok else None

    # ------------------------------------------------------------ start / stop
    def start(self, quality=1, camera=None, hands=None):
        if not self.available():
            return False
        if hands is not None:
            self.hands_mode = "v5" if hands == "v5" else ""  # (switched at once, the camera goes on)
            if self.hands_mode:
                self.v5.want()
        with self.cond:
            self.quality = int(quality) if str(quality).isdigit() else 1
            if camera is not None:
                if camera != self.camera_index and self._thread and self._thread.is_alive():
                    self._stop.set()
                    self._thread.join(timeout=3)
                self.camera_index = camera
            if self._thread and self._thread.is_alive():
                return True
            self._stop.clear()
            self.state = "loading"
            self.error = ""
            self._thread = threading.Thread(target=self._run, name="pose-native", daemon=True)
            self._thread.start()
        return True

    def stop(self):
        self._stop.set()

    # ------------------------------------------------------------ the camera
    def _open_camera(self):
        cv2 = self._cv2
        # (tests: a video file in place of the camera)
        if os.environ.get("ZNS_CAMERA_FILE"):
            cap = cv2.VideoCapture(os.environ["ZNS_CAMERA_FILE"])
            ok, frame = cap.read()
            if ok:
                self.camera_index = 0
                self.height, self.width = frame.shape[:2]
                return cap
            return None
        # Windows: DirectShow opens most webcams fastest; elsewhere the default
        api = cv2.CAP_DSHOW if sys.platform.startswith("win") else cv2.CAP_ANY
        order = [self.camera_index] if self.camera_index is not None else []
        order += [i for i in range(4) if i not in order]
        for i in order:
            cap = cv2.VideoCapture(i, api)
            if not cap or not cap.isOpened():
                if cap:
                    cap.release()
                continue
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            cap.set(cv2.CAP_PROP_FPS, 30)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # (no queue of old pictures)
            ok = False
            for _ in range(20):  # (a camera that opens but shows nothing is skipped)
                ok, frame = cap.read()
                if ok and frame is not None and frame.size:
                    break
                time.sleep(0.05)
            if ok:
                self.camera_index = i
                self.height, self.width = frame.shape[:2]
                return cap
            cap.release()
        return None

    # ------------------------------------------------------------ the networks
    def _make_holistic(self):
        """The 'solutions' Holistic (as in the browser game), if this MediaPipe has it."""
        mp = self._mp
        sol = getattr(mp, "solutions", None)
        if sol is None:
            try:
                import mediapipe.solutions as sol  # noqa: F811
            except Exception:  # noqa: BLE001
                return None
        h = sol.holistic.Holistic(
            static_image_mode=False,
            model_complexity=max(0, min(2, self.quality)),
            smooth_landmarks=False,  # (the game steadies the points itself: smoothing twice only made the hands trail)
            refine_face_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        def run(rgb, ts):
            r = h.process(rgb)
            out = {
                "poseLandmarks": _pts(r.pose_landmarks.landmark if r.pose_landmarks else None, True),
                "faceLandmarks": _pts(r.face_landmarks.landmark if r.face_landmarks else None),
                "leftHandLandmarks": _pts(r.left_hand_landmarks.landmark if r.left_hand_landmarks else None),
                "rightHandLandmarks": _pts(r.right_hand_landmarks.landmark if r.right_hand_landmarks else None),
            }
            v5 = self._v5()
            if v5:
                # V5: the hands from the body's wrists (the stream then carries "hands", as the Tasks way)
                out["hands"] = v5.process(rgb, out["poseLandmarks"])
                out.pop("leftHandLandmarks")
                out.pop("rightHandLandmarks")
            return out
        return run, h.close

    def _make_tasks(self):
        """The Tasks API: pose + hands + face (the game's own .task models)."""
        mp = self._mp
        from mediapipe.tasks.python import BaseOptions, vision
        mode = vision.RunningMode.VIDEO
        pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=os.path.join(MODELS, POSE_MODELS[max(0, min(2, self.quality))])),
            running_mode=mode, num_poses=1,
            min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5, min_tracking_confidence=0.5))
        hands = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "hand_landmarker.task")),
            running_mode=mode, num_hands=2,
            min_hand_detection_confidence=0.5, min_hand_presence_confidence=0.5, min_tracking_confidence=0.5))
        face = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=os.path.join(MODELS, "face_landmarker.task")),
            running_mode=mode, num_faces=1))
        n = [0]
        from concurrent.futures import ThreadPoolExecutor
        pool = ThreadPoolExecutor(max_workers=3, thread_name_prefix="pose-net")  # (body, hands, face at once)
        hand_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="hand-v5")  # (V5: both hands at once)
        last_pose = [None]

        def run(rgb, ts):
            img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            n[0] += 1
            v5 = self._v5()
            jp = pool.submit(pose.detect_for_video, img, ts)
            jf = pool.submit(face.detect_for_video, img, ts)  # (every picture: a steady head turn)
            if v5:
                # V5: no palm search — each hand is cut out where the body has it (hand_v5.py).
                # Both hands followed: their squares come from themselves (the body of the last
                # picture only checks them), so they go at once, beside the body network;
                # a hand to be found anew waits for this picture's body.
                if v5.tracking() and last_pose[0] is not None:
                    jh = pool.submit(v5.process, rgb, last_pose[0], None, hand_pool)
                    p = jp.result()
                    pl = _pts(p.pose_landmarks[0], True) if p.pose_landmarks else None
                    hands_out = jh.result()
                else:
                    p = jp.result()
                    pl = _pts(p.pose_landmarks[0], True) if p.pose_landmarks else None
                    hands_out = v5.process(rgb, pl or last_pose[0], pool=hand_pool)
                last_pose[0] = pl or last_pose[0]
                out = {"poseLandmarks": pl, "hands": hands_out}
            else:
                jh = pool.submit(hands.detect_for_video, img, ts)
                p, h = jp.result(), jh.result()
                out = {
                    "poseLandmarks": _pts(p.pose_landmarks[0], True) if p.pose_landmarks else None,
                    "hands": [
                        {
                            "landmarks": _pts(lm),
                            "label": h.handedness[i][0].category_name if h.handedness and h.handedness[i] else None,
                            "score": h.handedness[i][0].score if h.handedness and h.handedness[i] else 1.0,
                        }
                        for i, lm in enumerate(h.hand_landmarks or [])
                    ],
                }
            if jf is not None:
                f = jf.result()
                out["faceLandmarks"] = _pts(f.face_landmarks[0]) if f.face_landmarks else None
            return out

        def close():
            pool.shutdown(wait=False)
            hand_pool.shutdown(wait=False)
            for t in (pose, hands, face):
                try:
                    t.close()
                except Exception:  # noqa: BLE001
                    pass
        return run, close

    def _v5(self):
        """The V5 hand finder if it is asked for and ready, else None (the old hands go on)."""
        if self.hands_mode != "v5" or not self.v5.want():
            return None
        return self.v5.hands

    # ------------------------------------------------------------ the loop
    def _run(self):
        cv2 = self._cv2
        cap = None
        close = None
        grab = None
        try:
            made = None
            try:
                made = self._make_holistic()
                if made:
                    self.backend = "holistic"
            except Exception as e:  # noqa: BLE001
                print(f"  [Камера] Holistic недоступен ({e}), беру отдельные сети")
            if not made:
                made = self._make_tasks()
                self.backend = "tasks"
            run, close = made
            cap = self._open_camera()
            if cap is None:
                raise RuntimeError("камера не найдена или занята другой программой")
            self.state = "running"
            print(f"  [Камера] нейросеть запущена отдельно от браузера: {self.backend}, камера №{self.camera_index} {self.width}x{self.height}")
            t_start = time.time()
            frames = 0
            t_rate = time.time()
            # The camera is read all the time in its own thread and the network always takes
            # the NEWEST picture: a camera keeps a queue of pictures, and while the network
            # works on one, the next ones wait there — the hands were shown as they were
            # several pictures ago. (A test video is read picture by picture.)
            grab = None if os.environ.get("ZNS_CAMERA_FILE") else _LatestFrame(cap, self._stop)
            while not self._stop.is_set():
                if grab:
                    ok, frame = grab.next(timeout=1.0)
                else:
                    ok, frame = cap.read()
                if not ok or frame is None:
                    if os.environ.get("ZNS_CAMERA_FILE"):
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # (the test video: round again)
                    if grab and grab.dead:
                        raise RuntimeError("камера перестала отдавать картинку")
                    time.sleep(0.01)
                    continue
                t0 = time.perf_counter()
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                ts = int((time.time() - t_start) * 1000)
                out = run(rgb, ts)
                # a real stick (a pen, a brush) held in a hand: its direction (stick_detect.py)
                sticks = _sticks(frame, out)
                if sticks:
                    out["sticks"] = sticks
                cost = (time.perf_counter() - t0) * 1000
                self.cost = cost if not self.cost else self.cost * 0.9 + cost * 0.1
                frames += 1
                now = time.time()
                if now - t_rate >= 1:
                    self.fps = frames / (now - t_rate)
                    frames = 0
                    t_rate = now
                v5on = self.hands_mode == "v5" and self.v5.state == "ready"
                out.update({"cost": round(cost, 1), "w": self.width, "h": self.height, "backend": self.backend,
                            "handsEngine": "v5" if v5on else "mp"})
                if v5on:
                    out["v5Engine"] = self.v5.hands.engine  # ("rtm": RTMPose on the video card; "mp": the processor)
                if self.hands_mode == "v5" and self.v5.state != "ready":
                    out["v5"] = self.v5.reason()  # (the game says why the V5 hands aren't there yet)
                with self.cond:
                    self.seq += 1
                    self.latest = json.dumps(out, separators=(",", ":"))
                    self.last_frame = frame  # (a snapshot for the hand recording: snapshot())
                    self.cond.notify_all()
                # nobody is watching for a while: let the camera go
                if self.clients <= 0 and now - self.last_client > 8:
                    break
        except Exception as e:  # noqa: BLE001
            self.state = "error"
            self.error = str(e)
            print(f"  [Камера] нейросеть не запустилась: {e}")
        finally:
            if grab is not None:
                grab.close()
            if cap is not None:
                cap.release()
            if close:
                close()
            if self.state == "running":
                self.state = "idle"
                print("  [Камера] нейросеть остановлена (игра закрыта)")
            with self.cond:
                self.cond.notify_all()


POSE = NativePose()
