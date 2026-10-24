"""
hand_v5_gpu.py — the V5 hands' network (MediaPipe's own joint network, as ONNX) on the video card,
as a program of its own.

The camera program (pose_native.py) and the voice (voice_native.py) live in the game server's
process; a network on the video card there would share their onnxruntime. So the hands' network
runs here, in its own process, with its own onnxruntime (DirectML: any DirectX 12 video card on
Windows — installed apart, in vendor/ort-gpu, so the voice's onnxruntime is never touched; or CUDA if
the usual onnxruntime has it). hand_v5.GpuNet talks to it through its stdin/stdout:

    → b"RUN " + n (4 bytes) + n×224×224×3 bytes   (the squares of hands, RGB — the network's own input)
    ← b"OUT " + m (4 bytes) + float32 [n, 65]      (21×(x, y, z) in the square's pixels, how sure, which hand)
    ← b"HELO" + m + JSON                           (once, at the start: on what it runs, or why not)

All the squares of a picture come in one call (both hands, every square tried): on the video card
one square or six cost the same. It runs only on the video card (unless ZNS_V5_CPU=1, for tests):
without one, V5 runs the same network on the processor (hand_v5.HandNet).

    python hand_v5_gpu.py <model.onnx> [<onnxruntime folder>]
    python hand_v5_gpu.py --probe [<onnxruntime folder>]      (is there a video card at all?)
"""

import json
import os
import struct
import sys
import time

SIZE = 224


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
        cpu_ok = os.environ.get("ZNS_V5_CPU") == "1"
        want = [p for p in ("CUDAExecutionProvider", "DmlExecutionProvider") if p in have]
        if model == "--probe":
            _send(out, b"HELO", json.dumps({"ok": bool(want) or cpu_ok, "providers": have,
                                            "why": "" if want else "нет видеокарты для onnxruntime (" + ", ".join(have) + ")"}).encode())
            return
        if not want and not cpu_ok:
            _send(out, b"HELO", json.dumps({"ok": False, "why": "нет видеокарты для onnxruntime (" + ", ".join(have) + ")"}).encode())
            return
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1  # (the video card works; one thread only hands it the squares)
        if "DmlExecutionProvider" in want:
            so.enable_mem_pattern = False  # (DirectML wants these two off)
            so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        s = ort.InferenceSession(model, so, providers=want + ["CPUExecutionProvider"])
        used = s.get_providers()[0]
        if used == "CPUExecutionProvider" and not cpu_ok:
            _send(out, b"HELO", json.dumps({"ok": False, "why": "видеокарта не приняла сеть"}).encode())
            return
        name = s.get_inputs()[0].name
        names = [o.name for o in s.get_outputs()]
        i_pts, i_pres, i_hand = names.index("Identity"), names.index("Identity_1"), names.index("Identity_2")

        def run(crops):
            x = crops.astype(np.float32) * (1 / 255)
            r = s.run(None, {name: x})
            return np.concatenate([r[i_pts], r[i_pres], r[i_hand]], 1).astype(np.float32)

        # the first runs (the video card prepares itself for 1…6 squares) and how long one takes
        for n in (1, 2, 4, 6):
            run(np.zeros((n, SIZE, SIZE, 3), np.uint8))
        z = np.zeros((2, SIZE, SIZE, 3), np.uint8)
        t = time.perf_counter()
        for _ in range(10):
            run(z)
        ms = (time.perf_counter() - t) / 10 * 1000
        _send(out, b"HELO", json.dumps({"ok": True, "provider": used, "ms": round(ms, 2)}).encode())
        while True:
            tag = _read(inp, 4)
            n = struct.unpack("<I", _read(inp, 4))[0]
            if tag != b"RUN ":
                return
            crops = np.frombuffer(_read(inp, n * SIZE * SIZE * 3), np.uint8).reshape(n, SIZE, SIZE, 3)
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
