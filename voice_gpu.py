"""
voice_gpu.py — the spell-hearing network (GigaAM v3 CTC, the same model.int8.onnx voice_native.py uses) on the
video card, as a program of its own.

voice_native.py lives in the game server's process with the usual onnxruntime (processor). DirectML (any DirectX 12
video card on Windows) is a different onnxruntime package — installed apart in vendor/ort-gpu (the same folder the
V5 hands use, hand_v5.ort_gpu_dir) and loaded only here, so the voice's own onnxruntime is never touched. CUDA is
used when the usual onnxruntime has it (Linux, an NVIDIA card); CoreML on a Mac. voice_native.GpuCtc talks to it
through stdin/stdout:

    → b"RUN " + n (4 bytes) + float32 [n, 64]      (the features of a look: 64 mel bands per 10 ms, made on the processor — cheap)
    ← b"OUT " + m (4 bytes) + float32 [T, 34]      (the network's log-probabilities, one row per 40 ms)
    ← b"HELO" + m + JSON                           (once, at the start: on what it runs, or why not)

Every look has its own length (a phrase grows); the network is NOT padded to a few lengths: the int8 model's
dynamic quantization takes the range of the whole input, and padded frames changed the letters (measured:
up to 25 of 34 rows). So DirectML gets each length as it comes.

    python voice_gpu.py <model folder> [<onnxruntime folder>]
"""

import json
import os
import struct
import sys
import time

MELS = 64
LETTERS = 34


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


def gpu_providers(have):
    """The video card's providers onnxruntime has here, best first."""
    return [p for p in ("CUDAExecutionProvider", "DmlExecutionProvider", "CoreMLExecutionProvider") if p in have]


def main():
    folder = sys.argv[1]
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
        want = gpu_providers(have)
        cpu_ok = os.environ.get("ZNS_VOICE_GPU_CPU") == "1"  # (tests: the same program on the processor)
        if not want and not cpu_ok:
            _send(out, b"HELO", json.dumps({"ok": False, "why": "нет видеокарты для onnxruntime (" + ", ".join(have) + ")"}).encode())
            return
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1  # (the video card works; one thread only hands it the features)
        so.add_session_config_entry("session.intra_op.allow_spinning", "0")
        if "DmlExecutionProvider" in want:
            so.enable_mem_pattern = False  # (DirectML wants these two off)
            so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        s = ort.InferenceSession(os.path.join(folder, "model.int8.onnx"), so, providers=want + ["CPUExecutionProvider"])
        used = s.get_providers()[0]
        if used == "CPUExecutionProvider" and not cpu_ok:
            _send(out, b"HELO", json.dumps({"ok": False, "why": "видеокарта не приняла сеть"}).encode())
            return

        def run(feats):
            n = feats.shape[0]
            return s.run(None, {"features": np.ascontiguousarray(feats.T[None]), "feature_lengths": np.array([n], dtype=np.int64)})[0][0]

        # the first runs (the video card prepares itself) and how long a look of 1 / 2 / 3 s takes
        rng = np.random.default_rng(1)
        for n in (100, 200, 300):
            run(rng.normal(-6, 3, (n, MELS)).astype(np.float32))
        z = rng.normal(-6, 3, (300, MELS)).astype(np.float32)
        t = time.perf_counter()
        for _ in range(5):
            run(z)
        ms = (time.perf_counter() - t) / 5 * 1000
        _send(out, b"HELO", json.dumps({"ok": True, "provider": used, "providers": have, "ms": round(ms, 1)}).encode())
        while True:
            tag = _read(inp, 4)
            n = struct.unpack("<I", _read(inp, 4))[0]
            if tag != b"RUN ":
                return
            feats = np.frombuffer(_read(inp, n * MELS * 4), np.float32).reshape(n, MELS)
            _send(out, b"OUT ", np.ascontiguousarray(run(feats), dtype=np.float32).tobytes())
    except EOFError:
        return
    except Exception as e:  # noqa: BLE001
        try:
            _send(out, b"HELO", json.dumps({"ok": False, "why": f"{type(e).__name__}: {e}"}).encode())
        except Exception:  # noqa: BLE001
            pass


if __name__ == "__main__":
    main()
