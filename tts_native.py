"""
tts_native.py — the villagers' neural voices (Supertonic 3, ten Russian voices F1–F5, M1–M5) as a
program of its own on this computer.

Why: in the browser the voice network ran in the game's own page (WebAssembly): a long line took
processor time from the game. Here it is k2-fsa's sherpa-onnx (Apache 2.0) with the same model
(sherpa-onnx's int8 package of Supertonic 3 — the model licence BigScience OpenRAIL-M), in a process of
its own, below normal priority: the game's frames always come first.

  - the model: downloaded once (≈ 129 MB, from sherpa-onnx's GitHub release, checked by SHA-256) into
    the user's own folder; the package sherpa-onnx is installed once if missing;
  - the game server (server.py, /api/tts/...) starts this file as a child process (`--serve`) and asks
    it for one sentence at a time (JSON lines in, JSON lines out: 16-bit PCM, base64) — the page plays
    each sentence as soon as it is made (src/audio/NativeTTS.js stands in for the old web worker).

Nothing heavy runs at import time.
"""

import base64
import hashlib
import json
import os
import subprocess
import sys
import tarfile
import threading
import urllib.request

MODEL = "sherpa-onnx-supertonic-3-tts-int8-2026-05-11"
MODEL_URL = f"https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/{MODEL}.tar.bz2"
MODEL_SHA256 = "82fa96f91c4ef8abaae3a14a3f4153facf88bed821d1f7331cec2700f432c427"
MODEL_MAX = 200 * 1024 * 1024
FILES = ["duration_predictor.int8.onnx", "text_encoder.int8.onnx", "vector_estimator.int8.onnx", "vocoder.int8.onnx",
         "tts.json", "unicode_indexer.bin", "voice.bin", "LICENSE"]
VOICES = ["F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"]  # (the order in voice.bin)


def data_dir():
    if os.environ.get("ZNS_TTS_DIR"):
        return os.environ["ZNS_TTS_DIR"]
    if sys.platform.startswith("win"):
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        return os.path.join(base, "Volshebstvo", "voices")
    if sys.platform == "darwin":
        return os.path.join(os.path.expanduser("~"), "Library", "Application Support", "Volshebstvo", "voices")
    return os.path.join(os.path.expanduser("~"), ".cache", "volshebstvo", "voices")


def model_dir():
    return os.path.join(data_dir(), MODEL)


def model_ready():
    return all(os.path.isfile(os.path.join(model_dir(), f)) for f in FILES)


# ============================================================== the child process
def serve():
    """The voice program itself: reads {"id", "text", "voice", "speed", "steps", "lang"} lines, answers
    {"id", "sr", "pcm"(base64 int16)} or {"id", "error"} lines."""
    # (the answers go out on the real stdout; anything the libraries print goes to stderr — never into the answers)
    out = os.fdopen(os.dup(1), "w", encoding="utf-8", newline="\n")
    os.dup2(2, 1)
    import numpy as np
    import sherpa_onnx as so
    d = model_dir() + os.sep
    m = so.OfflineTtsModelConfig()
    m.supertonic = so.OfflineTtsSupertonicModelConfig(
        duration_predictor=d + FILES[0], text_encoder=d + FILES[1], vector_estimator=d + FILES[2], vocoder=d + FILES[3],
        tts_json=d + FILES[4], unicode_indexer=d + FILES[5], voice_style=d + FILES[6])
    m.num_threads = max(1, min(4, (os.cpu_count() or 4) // 4))
    tts = so.OfflineTts(so.OfflineTtsConfig(model=m))

    def say(obj):
        out.write(json.dumps(obj) + "\n")
        out.flush()

    def make(job):
        g = so.GenerationConfig()
        v = job.get("voice") or "F1"
        g.sid = VOICES.index(v) if v in VOICES else 0
        g.speed = float(job.get("speed") or 1.0)
        g.num_steps = int(job.get("steps") or 5)
        try:
            g.extra = {"lang": "en" if job.get("lang") == "en" else "ru"}
        except Exception:  # noqa: BLE001
            pass
        text = str(job.get("text") or "").strip()
        if not text:
            return tts.sample_rate, ""  # (nothing to say: silence, at the voice's own rate — never a rate of 0)
        a = tts.generate(text, g)
        x = np.clip(np.asarray(a.samples, dtype=np.float32), -1, 1)
        return a.sample_rate or tts.sample_rate, base64.b64encode((x * 32767).astype("<i2").tobytes()).decode("ascii")

    make({"text": "Да, конечно.", "voice": "F1"})  # (the first run of a network is slow: warm up)
    say({"ready": True, "sr": tts.sample_rate, "voices": VOICES})
    # (the lines are read as bytes and decoded as UTF-8 here: on Windows the text stdin is in the console's
    # code page — cp1251 — and the Russian words came out as «РЎРІРµР¶РёР№»: the voice read that gibberish aloud)
    for raw in sys.stdin.buffer:
        try:
            job = json.loads(raw.decode("utf-8"))
        except ValueError:
            continue
        try:
            sr, pcm = make(job)
            say({"id": job.get("id"), "sr": sr, "pcm": pcm, "heard": job.get("text")})  # (the text as read here: checked by the server)
        except Exception as e:  # noqa: BLE001
            say({"id": job.get("id"), "error": str(e) or type(e).__name__})


# ============================================================== in the game server
class NativeTTS:
    def __init__(self):
        self.state = "off"  # off | installing | downloading | loading | ready | error
        self.error = ""
        self.progress = 0.0
        self.proc = None
        self._lock = threading.Lock()  # (one sentence at a time through the pipe)
        self._start_lock = threading.Lock()

    def available(self):
        return not os.environ.get("ZNS_NO_NATIVE_TTS")

    def status(self):
        return {"available": self.available(), "state": self.state, "error": self.error, "progress": round(self.progress, 3), "voices": VOICES}

    def start(self):
        """Asked for by the page (never waits). True once ready."""
        with self._start_lock:
            if self.state == "ready" and self.proc and self.proc.poll() is None:
                return True
            if self.state in ("installing", "downloading", "loading"):
                return False
            self.state, self.error, self.progress = "loading", "", 0.0
            threading.Thread(target=self._prepare, name="tts-native", daemon=True).start()
        return False

    def _deps(self):
        try:
            import sherpa_onnx  # noqa: F401
            return
        except Exception:  # noqa: BLE001
            pass
        if os.environ.get("ZNS_NO_PIP"):
            raise RuntimeError("нет пакета sherpa-onnx")
        self.state = "installing"
        r = subprocess.run([sys.executable, "-m", "pip", "install", "--user", "--disable-pip-version-check", "-q", "sherpa-onnx"],
                           capture_output=True, text=True, timeout=1800)
        if r.returncode != 0:
            raise RuntimeError("не удалось установить sherpa-onnx: " + ((r.stderr or r.stdout or "").strip().splitlines() or [""])[-1])

    def _download(self):
        self.state = "downloading"
        os.makedirs(data_dir(), exist_ok=True)
        part = os.path.join(data_dir(), MODEL + ".tar.bz2.part")
        h = hashlib.sha256()
        with urllib.request.urlopen(urllib.request.Request(MODEL_URL, headers={"User-Agent": "Volshebstvo"}), timeout=60) as r, open(part, "wb") as f:
            total = int(r.headers.get("Content-Length") or 0)
            got = 0
            while True:
                b = r.read(1 << 16)
                if not b:
                    break
                got += len(b)
                if got > MODEL_MAX:
                    raise ValueError("модель голосов больше ожидаемой — не используется")
                h.update(b)
                f.write(b)
                if total:
                    self.progress = 0.9 * got / total
        if h.hexdigest() != MODEL_SHA256:
            os.remove(part)
            raise ValueError("модель голосов не совпала с опубликованной (SHA-256) — не используется")
        # (out of the archive only the files needed, each under its own fixed name)
        os.makedirs(model_dir(), exist_ok=True)
        with tarfile.open(part) as t:
            for mem in t.getmembers():
                name = os.path.basename(mem.name)
                if name in FILES and mem.isfile():
                    with t.extractfile(mem) as src, open(os.path.join(model_dir(), name), "wb") as dst:
                        dst.write(src.read())
        os.remove(part)

    def _prepare(self):
        try:
            self._deps()
            if not model_ready():
                self._download()
            self.state = "loading"
            kw = {}
            if sys.platform.startswith("win"):
                # NORMAL priority: a line is made in a short burst (~0.5 s of one core) and the talk waits for it — below
                # normal it was starved by the game, the camera and the villagers' net (5–7 s a line in the author's journal)
                kw["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
            else:
                kw["preexec_fn"] = lambda: os.nice(2)
            env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
            p = subprocess.Popen([sys.executable, os.path.abspath(__file__), "--serve"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.DEVNULL, text=True, encoding="utf-8", bufsize=1, env=env, **kw)
            hello = json.loads(p.stdout.readline() or "{}")
            if not hello.get("ready"):
                raise RuntimeError("программа голосов не запустилась")
            self.proc = p
            self.progress = 1.0
            self.state = "ready"
            print("  [Голоса жителей] готовы: отдельная программа (sherpa-onnx, Supertonic 3)")
        except Exception as e:  # noqa: BLE001
            self.error = str(e) or type(e).__name__
            self.state = "error"
            print(f"  [Голоса жителей] не запустились (работают браузерные): {self.error}")

    def synth(self, job):
        """One sentence → {"sr", "pcm"} (base64 16-bit) or raises."""
        if self.state != "ready" or not self.proc or self.proc.poll() is not None:
            self.state = "error" if self.state == "ready" else self.state
            raise RuntimeError("voices are not ready")
        with self._lock:
            self.proc.stdin.write(json.dumps(job) + "\n")  # (ASCII only — \\u escapes: no code page can spoil it)
            self.proc.stdin.flush()
            ans = json.loads(self.proc.stdout.readline() or "{}")
        if ans.get("error") or "pcm" not in ans:
            raise RuntimeError(ans.get("error") or "no answer")
        if ans.get("heard") != job.get("text"):
            # (the program read other words than were sent — a broken text encoding: it would say gibberish.
            # Never that: the page's own voices take over — the reason goes to the journal)
            self.error = "программа голосов прочитала текст неверно (кодировка) — работают голоса браузера"
            self.state = "error"
            print("  [Голоса жителей] " + self.error)
            self.stop()
            raise RuntimeError(self.error)
        return {"sr": ans["sr"], "pcm": ans["pcm"]}

    def stop(self):
        p, self.proc = self.proc, None
        if p and p.poll() is None:
            try:
                p.terminate()
            except Exception:  # noqa: BLE001
                pass


TTS = NativeTTS()

if __name__ == "__main__" and "--serve" in sys.argv:
    serve()
else:
    import atexit
    atexit.register(TTS.stop)
