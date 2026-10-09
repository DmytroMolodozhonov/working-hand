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
        }

    # ------------------------------------------------------------ start / stop
    def start(self, quality=1, camera=None):
        if not self.available():
            return False
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
            smooth_landmarks=True,
            refine_face_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        def run(rgb, ts):
            r = h.process(rgb)
            return {
                "poseLandmarks": _pts(r.pose_landmarks.landmark if r.pose_landmarks else None, True),
                "faceLandmarks": _pts(r.face_landmarks.landmark if r.face_landmarks else None),
                "leftHandLandmarks": _pts(r.left_hand_landmarks.landmark if r.left_hand_landmarks else None),
                "rightHandLandmarks": _pts(r.right_hand_landmarks.landmark if r.right_hand_landmarks else None),
            }
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

        def run(rgb, ts):
            img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            n[0] += 1
            jp = pool.submit(pose.detect_for_video, img, ts)
            jh = pool.submit(hands.detect_for_video, img, ts)
            jf = pool.submit(face.detect_for_video, img, ts) if n[0] % 2 == 0 else None  # (the face only turns the head)
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
            for t in (pose, hands, face):
                try:
                    t.close()
                except Exception:  # noqa: BLE001
                    pass
        return run, close

    # ------------------------------------------------------------ the loop
    def _run(self):
        cv2 = self._cv2
        cap = None
        close = None
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
            while not self._stop.is_set():
                ok, frame = cap.read()
                if not ok or frame is None:
                    if os.environ.get("ZNS_CAMERA_FILE"):
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # (the test video: round again)
                    time.sleep(0.01)
                    continue
                t0 = time.perf_counter()
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                ts = int((time.time() - t_start) * 1000)
                out = run(rgb, ts)
                cost = (time.perf_counter() - t0) * 1000
                self.cost = cost if not self.cost else self.cost * 0.9 + cost * 0.1
                frames += 1
                now = time.time()
                if now - t_rate >= 1:
                    self.fps = frames / (now - t_rate)
                    frames = 0
                    t_rate = now
                out.update({"cost": round(cost, 1), "w": self.width, "h": self.height, "backend": self.backend})
                with self.cond:
                    self.seq += 1
                    self.latest = json.dumps(out, separators=(",", ":"))
                    self.cond.notify_all()
                # nobody is watching for a while: let the camera go
                if self.clients <= 0 and now - self.last_client > 8:
                    break
        except Exception as e:  # noqa: BLE001
            self.state = "error"
            self.error = str(e)
            print(f"  [Камера] нейросеть не запустилась: {e}")
        finally:
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
