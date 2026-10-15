"""
hand_v5_gpu.py — RTMPose (the V5 hands' more exact finder) on the video card, as a program of its own.

The camera program (pose_native.py) and the voice (voice_native.py) live in the game server's
process; a network on the video card there would share their onnxruntime. So RTMPose runs here,
in its own process, with its own onnxruntime (DirectML: any DirectX 12 video card on Windows —
installed apart, in vendor/ort-gpu, so the voice's onnxruntime is never touched; or CUDA if the
usual onnxruntime has it). hand_v5.RTMRemote talks to it through its stdin/stdout:

    → b"RUN " + n (4 bytes) + n×256×256×3 bytes  (crops of hands, RGB)
    ← b"OUT " + m (4 bytes) + float32 [n, 21, 3]  (x, y in the crop's pixels, how sure)
    ← b"HELO" + m + JSON                          (once, at the start: on what it runs, or why not)

It runs only on the video card (unless ZNS_V5_CPU=1, for tests): on the processor it would be
too heavy next to the game — then V5 keeps MediaPipe's joint network alone.

    python hand_v5_gpu.py <model.onnx> [<onnxruntime folder>]
    python hand_v5_gpu.py --probe [<onnxruntime folder>]      (is there a video card at all?)
"""

import json
import os
import struct
import sys
import time


def _send(out, tag, payload):
    out.write(tag + struct.pack("<I", len(payload)) + payload)
    out.flush()


def _read(inp, n):
    b = b""
    while len(b) < n:
        c = inp.read(n - len(b))
        if not c:
            raise EOFError
        b += c
    return b


def main():
    model = sys.argv[1]
    ort_dir = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
    inp, out = sys.stdin.buffer, sys.stdout.buffer
    sys.stdout = sys.stderr  # (nothing but the answers on the real stdout)
    try:
        if ort_dir:
            sys.path.insert(0, ort_dir)
            if hasattr(os, "add_dll_directory"):
                try:
                    os.add_dll_directory(os.path.join(ort_dir, "onnxruntime", "capi"))
                except OSError:
                    pass
        import numpy as np
        import onnxruntime as ort
        have = ort.get_available_providers()
        if model == "--probe":
            # (only: is there a video card for onnxruntime here? — before RTMPose is fetched)
            gpu = [p for p in ("CUDAExecutionProvider", "DmlExecutionProvider") if p in have]
            _send(out, b"HELO", json.dumps({"ok": bool(gpu) or os.environ.get("ZNS_V5_CPU") == "1", "providers": have,
                                            "why": "" if gpu else "нет видеокарты для onnxruntime (" + ", ".join(have) + ")"}).encode())
            return
        want = [p for p in ("CUDAExecutionProvider", "DmlExecutionProvider") if p in have]
        cpu_ok = os.environ.get("ZNS_V5_CPU") == "1"
        if not want and not cpu_ok:
            _send(out, b"HELO", json.dumps({"ok": False, "why": "нет видеокарты для onnxruntime (" + ", ".join(have) + ")"}).encode())
            return
        so = ort.SessionOptions()
        so.intra_op_num_threads = 2
        if "DmlExecutionProvider" in want:
            so.enable_mem_pattern = False  # (DirectML wants these two off)
            so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        s = ort.InferenceSession(model, so, providers=want + ["CPUExecutionProvider"])
        used = s.get_providers()[0]
        if used == "CPUExecutionProvider" and not cpu_ok:
            _send(out, b"HELO", json.dumps({"ok": False, "why": "видеокарта не приняла сеть"}).encode())
            return
        name = s.get_inputs()[0].name
        mean = np.array([123.675, 116.28, 103.53], np.float32)
        std = np.array([58.395, 57.12, 57.375], np.float32)

        def run(crops):
            x = ((crops.astype(np.float32) - mean) / std).transpose(0, 3, 1, 2)
            sx, sy = s.run(None, {name: np.ascontiguousarray(x)})
            px = sx.argmax(2) * (256 / sx.shape[2])
            py = sy.argmax(2) * (256 / sy.shape[2])
            conf = np.minimum(sx.max(2), sy.max(2))
            return np.stack([px, py, conf], 2).astype(np.float32)

        # a first run (the video card prepares itself) and how long one takes
        z = np.zeros((2, 256, 256, 3), np.uint8)
        run(z)
        t = time.perf_counter()
        for _ in range(5):
            run(z)
        ms = (time.perf_counter() - t) / 5 * 1000
        _send(out, b"HELO", json.dumps({"ok": True, "provider": used, "ms": round(ms, 2)}).encode())
        while True:
            tag = _read(inp, 4)
            n = struct.unpack("<I", _read(inp, 4))[0]
            if tag != b"RUN ":
                return
            crops = np.frombuffer(_read(inp, n * 256 * 256 * 3), np.uint8).reshape(n, 256, 256, 3)
            _send(out, b"OUT ", run(crops).tobytes())
    except EOFError:
        return
    except Exception as e:  # noqa: BLE001
        try:
            _send(out, b"HELO", json.dumps({"ok": False, "why": f"{type(e).__name__}: {e}"}).encode())
        except Exception:  # noqa: BLE001
            pass


if __name__ == "__main__":
    main()
