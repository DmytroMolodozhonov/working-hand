"""Own a Windows capture driver in a replaceable process.

Frame bytes travel through shared memory. The pipe carries only commands and
frame dimensions, so the native pose worker still receives the latest picture
without getting stuck in OpenCV's read or release.
"""
import multiprocessing
import time

_FRAME_BYTES = 1920 * 1080 * 3


def _driver(pipe, pixels, settings):
    import cv2
    import numpy as np
    from pose_native import NativePose

    pose = NativePose()
    pose._cv2 = cv2
    pose.camera_index, pose.hands_mode, pose._hd_slow, alternate = settings
    camera = None
    try:
        camera = pose._open_device(alternate)
        if camera is None:
            pipe.send(None)
            return
        pipe.send((pose.camera_index, pose._camera_api, pose.width, pose.height, pose._cam_hd, pose._hd_slow))
        buffer = np.frombuffer(pixels, dtype=np.uint8)
        while True:
            try:
                take_frame = pipe.recv()
            except EOFError:
                break
            if not take_frame:
                break
            ok, frame = camera.read()
            if not ok or frame is None or frame.dtype != np.uint8 or frame.size > len(buffer):
                pipe.send(None)
                continue
            buffer[:frame.size] = frame.reshape(-1)
            pipe.send((frame.shape, time.time()))
    finally:
        if camera is not None:
            camera.release()
        pipe.close()


class CameraProcess:
    def __init__(self, settings, worker=_driver):
        context = multiprocessing.get_context("spawn")
        self.pixels = context.RawArray("B", _FRAME_BYTES)
        self.pipe, child = context.Pipe()
        self.at = 0.0
        self.process = context.Process(target=worker, args=(child, self.pixels, settings), name="camera-driver", daemon=True)
        try:
            self.process.start()
        except BaseException:
            self.pipe.close()
            raise
        finally:
            child.close()

    def _receive(self, timeout):
        if not self.pipe.poll(timeout):
            raise TimeoutError("драйвер камеры не отвечает")
        return self.pipe.recv()

    def open(self, timeout=9):
        return self._receive(timeout)

    def read(self):
        self.pipe.send(True)
        reply = self._receive(1.65)
        if reply is None:
            return False, None
        import numpy as np

        shape, self.at = reply
        count = 1
        for dim in shape:
            count *= dim
        data = np.frombuffer(self.pixels, dtype=np.uint8, count=count)
        return True, data.reshape(shape).copy()

    def release(self):
        proc = self.process
        try:
            if proc.is_alive():
                try:
                    self.pipe.send(False)
                except (BrokenPipeError, EOFError, OSError):
                    pass
                proc.join(.4)
                if proc.is_alive():
                    proc.terminate()
                    proc.join(.8)
                if proc.is_alive():
                    proc.kill()
                    proc.join(.8)
        finally:
            self.pipe.close()
