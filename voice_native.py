"""
voice_native.py — the voice as a native program, next to the game (like pose_native.py).

Why. The browser's recognizer (Google's, Web Speech) writes what it hears as Russian words, and
spells are not Russian words: «Бомбардо» came out «ломбарды», «Протекшн» «против же»… And in a
game with a friend over Discord it took the friend's voice from the speakers for the player's own.

What it does here:
  1. It listens to the microphone AND to the sound going to the speakers (on Windows: «loopback» —
     Discord, the game itself, music). WebRTC's echo canceller (the one inside Chrome, Discord and
     Zoom) takes out of the microphone all that the speakers played: a friend's voice from Discord
     never reaches the recognizer, nor do the villagers' voices of the game.
  2. An open speech network for Russian (CTC, MIT license) tells for every 40 ms of sound how
     likely each Russian letter is. The game (src/audio/SpellSpotter.js) lays
     every spell's sound over that and finds the one that was said, instead of guessing it from a
     word written down wrong.
  3. The same network on the speakers' sound: what is heard there too came from the speakers.

The page gets it all as events (server.py: /api/voice/stream):
  {"type": "seg", "id", "final", "t0", "t1", "T", "lp"(base64 uint8 T×34), "ref"?, "refT"?, "far"}
  {"type": "lv", "t", "db": [...], "raw": [...], "far": [...]}   the microphone's level, 20 a second

Needs:  pip install numpy onnxruntime livekit  (+ PyAudioWPatch on Windows, sounddevice elsewhere)
and the network itself (≈225 MB, downloaded once from the sherpa-onnx releases on GitHub). Without
them the game simply uses the browser's recognizer as before.
"""

import base64
import collections
import hashlib
import io
import json
import os
import sys
import tarfile
import threading
import time
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
SR = 16000
FRAME = SR // 100  # 10 ms: the echo canceller's step
LETTERS = 34  # the network's letters: space, а…я, blank
LEAD = 0.03  # s the speakers' sound is given to the echo canceller ahead of the microphone's

# the network (an open model, MIT license) as the sherpa-onnx project publishes it on GitHub: the file's
# address there is theirs; here it is kept in a folder of our own («speech-ru»)
MODEL_URL = ("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
             "sherpa-onnx-nemo-ctc-giga-am-v3-russian-2025-12-16.tar.bz2")
MODEL_DIR = "speech-ru"
MODEL_OLD_DIR = "sherpa-onnx-nemo-ctc-giga-am-v3-russian-2025-12-16"  # (where the first version kept it)
MODEL_SIZE = 224721476  # model.int8.onnx
VAD_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"
VAD_FILE = "silero_vad.onnx"
# Every file used, its size and its SHA-256 (counted from the files of that same release): a file
# that differs in a single byte (spoilt on the way, or swapped for another) is never used.
FILES = {
    "model.int8.onnx": (MODEL_SIZE, "f86ebfa0429ced91be6054fc344827e9c6c2572f3c318416cd974b06f66437ec"),
    "tokens.txt": (196, "17cc514451bcceac9c280068c71502f8448f99e9fb1456b8d0761651fd0392f2"),
    "LICENSE": (1070, "f00de6715714c7a63d08639cdbfaa40224eefc407302614bd19f1a8b98c875aa"),
    VAD_FILE: (643854, "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6"),
}
ARCHIVE_MAX = 200 * 1024 * 1024  # the archive is ≈156 MB: no more than this is ever read
CHECKED = "checked.json"  # the files already checked: their size and time (so 225 MB aren't read every start)

# Speech segments: how they start and end (silero's probability of speech per 32 ms)
SEG = {
    "on": 0.5,         # speech starts above this…
    "off": 0.35,       # …and is over after END of this much below it
    "end": 0.75,       # s of quiet that end a phrase (longer than NativeVoice MORE_WAIT: «Protection… Хаус» is one phrase)
    "pre": 0.3,        # s of sound kept before the speech started (the first letters)
    "max": 12.0,       # s: a phrase this long is cut into pieces
    "partial": 0.18,   # s between the looks at a phrase still being said
    "window": 3.0,     # s: a look at an unfinished phrase covers its end only (spells are short)
}


def models_dir():
    """Where the network is kept: the user's own folder (the game folder is replaced by updates)."""
    if os.environ.get("ZNS_VOICE_MODELS"):
        return os.environ["ZNS_VOICE_MODELS"]
    if sys.platform.startswith("win"):
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        return os.path.join(base, "Volshebstvo", "voice-models")
    if sys.platform == "darwin":
        return os.path.join(os.path.expanduser("~"), "Library", "Application Support", "Volshebstvo", "voice-models")
    return os.path.join(os.path.expanduser("~"), ".cache", "volshebstvo", "voice-models")


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


class Checked:
    """Which model files were checked (SHA-256) — remembered with their size and time of change: a file
    changed since is checked again. A file that is not the published one is deleted (downloaded anew)."""

    def __init__(self):
        self.lock = threading.Lock()

    def _path(self):
        return os.path.join(models_dir(), CHECKED)

    def _load(self):
        try:
            with open(self._path(), encoding="utf-8") as f:
                d = json.load(f)
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def remember(self, path, sha):
        st = os.stat(path)
        with self.lock:
            d = self._load()
            d[os.path.abspath(path)] = [sha, st.st_size, st.st_mtime_ns]
            tmp = self._path() + ".part"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(d, f)
            os.replace(tmp, self._path())

    def ok(self, path, name):
        """Is this file the published one? (False: missing, or wrong — then it is deleted.)"""
        size, sha = FILES[name]
        try:
            st = os.stat(path)
        except OSError:
            return False
        if st.st_size != size:
            return False
        if self._load().get(os.path.abspath(path)) == [sha, st.st_size, st.st_mtime_ns]:
            return True
        with self.lock:
            good = sha256_of(path) == sha
        if not good:
            print(f"  Голос: файл {name} не совпал с опубликованным (повреждён или подменён) — удаляю, скачаю заново")
            try:
                os.remove(path)
            except OSError:
                pass
            return False
        self.remember(path, sha)
        return True


CHECK = Checked()


def save_checked(part, final, name):
    """A downloaded file (part) → its place (final), only if it is the published one; else deleted and an error."""
    size, sha = FILES[name]
    got = sha256_of(part) if os.path.getsize(part) == size else ""
    if got != sha:
        os.remove(part)
        raise ValueError(f"скачанный файл {name} не совпал с опубликованным — не используется")
    os.replace(part, final)
    CHECK.remember(final, sha)


# ---------------------------------------------------------------- the networks
class CtcNet:
    """The speech network (CTC): 16 kHz sound → log-probabilities of the 34 letters, one row per 40 ms."""

    def __init__(self, folder, threads=2):
        import numpy as np
        import onnxruntime as ort
        self.np = np
        o = ort.SessionOptions()
        o.intra_op_num_threads = threads
        o.inter_op_num_threads = 1
        # (its threads sleep between the looks instead of spinning: the game's frames get those cores)
        o.add_session_config_entry("session.intra_op.allow_spinning", "0")
        self.sess = ort.InferenceSession(os.path.join(folder, "model.int8.onnx"), o, providers=["CPUExecutionProvider"])
        # the network's own front end (torchaudio MelSpectrogram: n_fft 320, hop 160, 64 HTK mels, no norm)
        self.win = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(320) / 320)).astype(np.float32)
        hz2mel = lambda f: 2595.0 * np.log10(1.0 + f / 700.0)  # noqa: E731
        mel2hz = lambda m: 700.0 * (10 ** (m / 2595.0) - 1.0)  # noqa: E731
        freqs = np.linspace(0, 8000, 161)
        pts = mel2hz(np.linspace(hz2mel(0), hz2mel(8000), 66))
        diff = pts[1:] - pts[:-1]
        slopes = pts[None, :] - freqs[:, None]
        self.fb = np.maximum(0, np.minimum(-slopes[:, :-2] / diff[:-1], slopes[:, 2:] / diff[1:])).astype(np.float32)

    def logprobs(self, audio):
        np = self.np
        audio = np.asarray(audio, dtype=np.float32)
        if len(audio) < 320 * 4:
            audio = np.concatenate([audio, np.zeros(320 * 4 - len(audio), np.float32)])
        n = 1 + (len(audio) - 320) // 160
        idx = np.arange(320)[None, :] + 160 * np.arange(n)[:, None]
        spec = np.abs(np.fft.rfft(audio[idx] * self.win, n=320)) ** 2
        # (einsum, not «@»: numpy's maths library would wake a thread on every core of the computer for
        # this small sum, and they spin on after it — the game's frames wait for them)
        feats = np.log(np.clip(np.einsum("tf,fm->tm", spec, self.fb, optimize=False), 1e-9, 1e9)).astype(np.float32)
        out = self.sess.run(None, {"features": feats.T[None], "feature_lengths": np.array([n], dtype=np.int64)})[0][0]
        return out  # (T, 34)


class Vad:
    """Silero VAD (v4): the probability of speech in each 32 ms (512 samples)."""

    def __init__(self, path):
        import numpy as np
        import onnxruntime as ort
        self.np = np
        o = ort.SessionOptions()
        o.intra_op_num_threads = 1
        o.inter_op_num_threads = 1
        self.sess = ort.InferenceSession(path, o, providers=["CPUExecutionProvider"])
        self.names = [i.name for i in self.sess.get_inputs()]
        self.reset()

    def reset(self):
        np = self.np
        self.h = np.zeros((2, 1, 64), np.float32)
        self.c = np.zeros((2, 1, 64), np.float32)

    def __call__(self, chunk):
        feed = {"x": chunk[None].astype(self.np.float32), "h": self.h, "c": self.c}
        if "sr" in self.names:
            feed["sr"] = self.np.array(SR, dtype=self.np.int64)
        p, self.h, self.c = self.sess.run(None, feed)
        return float(p.reshape(-1)[0])


# ---------------------------------------------------------------- sound in
class Stream:
    """One sound source made into a steady 16 kHz line with a clock: sample n was heard at t0 + n/SR.

    Packets come at the device's own rate (48 kHz…) and in the device's own rhythm — late now and
    then (the computer was busy), then several at once. The clock is the earliest time the packets
    allow (late ones never move it; it creeps up slowly, ≤ 1 ms a second, to follow the device's own
    clock). The microphone never stops; the speakers' copy («loopback») stops coming while nothing
    plays: a packet that comes much later than the clock says marks such a pause — silence fills it.
    The gaps are counted at the device's rate, before resampling (whose own delay is constant)."""

    def __init__(self, rate, name, continuous=True):
        import numpy as np
        self.np = np
        self.name = name
        self.rate = int(rate)
        self.continuous = continuous
        self.t0 = None
        self.in_n = 0  # samples of the device's rate taken in (pauses counted)
        self.n = 0     # samples written on the 16 kHz line
        self.buf = np.zeros(SR * 30, np.float32)  # a ring: the last 30 s
        self.lock = threading.Lock()
        self.resampler = None
        if self.rate != SR:
            from livekit import rtc
            self.resampler = rtc.AudioResampler(self.rate, SR, num_channels=1, quality=rtc.AudioResamplerQuality.HIGH)

    def _resample(self, x16):
        """int16 mono at the device rate → float32 at 16 kHz."""
        np = self.np
        if self.resampler is None:
            return x16.astype(np.float32) / 32768.0
        out = self.resampler.push(bytearray(x16.tobytes()))
        if not out:
            return np.zeros(0, np.float32)
        return np.concatenate([np.frombuffer(bytes(f.data), dtype=np.int16) for f in out]).astype(np.float32) / 32768.0

    def push(self, x16, arrived=None):
        """A packet (int16 mono, device rate) that has just come (perf_counter time)."""
        np = self.np
        arrived = time.perf_counter() if arrived is None else arrived
        with self.lock:
            dur = len(x16) / self.rate
            cand = arrived - dur - self.in_n / self.rate  # the clock this packet alone would give
            if self.t0 is None:
                self.t0 = cand
            else:
                self.t0 = min(self.t0 + dur * 1e-3, cand)
                late = cand - self.t0
                if not self.continuous and late > 0.06:
                    # a pause of the speakers' copy: silence for it (a long one just moves the line on)
                    pad = int(late * self.rate)
                    if pad > self.rate * 20:
                        self._skip(int(pad * SR / self.rate))
                        self.in_n += pad
                        pad = 0
                        if self.resampler is not None:
                            self.resampler.flush()
                    if pad:
                        x16 = np.concatenate([np.zeros(pad, np.int16), x16])
            self.in_n += len(x16)
            y = self._resample(x16)
            if len(y):
                self._write(y)

    def _skip(self, count):
        if count >= len(self.buf):
            self.buf[:] = 0
            self.n += count
        else:
            self._write(self.np.zeros(count, self.np.float32))

    def _write(self, y):
        L = len(self.buf)
        i = self.n % L
        k = min(len(y), L - i)
        self.buf[i:i + k] = y[:k]
        if k < len(y):
            self.buf[:len(y) - k] = y[k:]
        self.n += len(y)

    def read(self, a, b):
        """Samples a…b of the line (zeros where nothing was written)."""
        np = self.np
        out = np.zeros(max(0, b - a), np.float32)
        with self.lock:
            lo, hi = max(a, self.n - len(self.buf) + 1), min(b, self.n)
            if hi > lo:
                L = len(self.buf)
                idx = np.arange(lo, hi) % L
                out[lo - a:hi - a] = self.buf[idx]
        return out

    def now_index(self, t):
        """The sample of this line at perf_counter time t."""
        return None if self.t0 is None else int((t - self.t0) * SR)


_ERRORS = collections.Counter()


def say_error(kind, e):
    """An error to the log — the first few and then one in a thousand (an error 100 times a second
    must not fill the disk with the log)."""
    _ERRORS[kind] += 1
    k = _ERRORS[kind]
    if k <= 5 or k % 1000 == 0:
        print(f"  Голос: ошибка {kind} (раз {k}):", e)


def pick_device(devices, key):
    """The microphone to listen to: the one chosen in the settings (by its key) or the system's default.
    → (device or None, fell_back): fell_back — the chosen one is not there now (unplugged), the default listens."""
    default = next((d for d in devices if d.get("default")), devices[0] if devices else None)
    if not key or key == "default":
        return default, False
    for d in devices:
        if d.get("key") == key:
            return d, False
    return default, True


def win_inputs(pa, pyaudio):
    """Windows: the microphones (WASAPI inputs; the speakers' «loopback» copies are not microphones)."""
    wasapi = pa.get_host_api_info_by_type(pyaudio.paWASAPI)
    out = []
    for i in range(int(wasapi.get("deviceCount", 0))):
        d = pa.get_device_info_by_host_api_device_index(wasapi["index"], i)
        if int(d.get("maxInputChannels", 0)) > 0 and not d.get("isLoopbackDevice"):
            out.append({"key": d.get("name", ""), "name": d.get("name", ""), "index": int(d["index"]),
                        "default": int(d["index"]) == int(wasapi["defaultInputDevice"]), "info": d})
    return out


def sd_inputs(sd):
    """macOS / Linux: the microphones of the system's own sound API (sounddevice)."""
    try:
        api, default = sd.default.hostapi, sd.query_devices(kind="input").get("name")
    except Exception:  # noqa: BLE001
        api, default = None, None
    out = []
    for i, d in enumerate(sd.query_devices()):
        if int(d.get("max_input_channels", 0)) > 0 and (api is None or api < 0 or d.get("hostapi") == api):
            out.append({"key": d.get("name", ""), "name": d.get("name", ""), "index": i, "default": d.get("name") == default, "info": d})
    return out


def list_inputs():
    """The microphones on this computer (for the settings): [{key, name, default}]."""
    if os.environ.get("ZNS_VOICE_FILE"):
        name = os.path.basename(os.environ["ZNS_VOICE_FILE"])
        return [{"key": name, "name": name, "default": True}]
    if sys.platform.startswith("win"):
        import pyaudiowpatch as pyaudio
        pa = pyaudio.PyAudio()
        try:
            devs = win_inputs(pa, pyaudio)
        finally:
            pa.terminate()
    else:
        import sounddevice as sd
        devs = sd_inputs(sd)
    return [{"key": d["key"], "name": d["name"], "default": bool(d["default"])} for d in devs]


def _mono16(data, channels, np):
    x = np.frombuffer(data, dtype=np.int16)
    if channels > 1:
        x = x.reshape(-1, channels).mean(axis=1).astype(np.int16)
    return x


class WinCapture:
    """Windows: the microphone and the speakers' sound («loopback», WASAPI) — PyAudioWPatch."""

    def __init__(self, on_mic, on_ref, mic_key=None):
        import numpy as np
        import pyaudiowpatch as pyaudio
        self.np = np
        self.pa = pyaudio.PyAudio()
        self.streams = []
        devs = win_inputs(self.pa, pyaudio)
        chosen, self.fell_back = pick_device(devs, mic_key)
        tries = [chosen] + [d for d in devs if d.get("default") and d is not chosen]
        for k, d in enumerate(t for t in tries if t):
            mic = d["info"]
            try:
                self.mic_rate = int(mic["defaultSampleRate"])
                mch = max(1, int(mic["maxInputChannels"]))  # (shared mode: the device's own channels; mixed down here)
                self.streams.append(self._open(pyaudio, mic, mch, self.mic_rate, on_mic))
                self.mic_name, self.mic_key = mic.get("name", ""), d["key"]
                self.fell_back = self.fell_back or k > 0
                break
            except Exception as e:  # noqa: BLE001
                print("  Голос: микрофон не открылся:", mic.get("name"), e)
        else:
            self.pa.terminate()  # (no microphone opened: the sound system is let go too)
            raise RuntimeError("микрофон не найден")
        self.ref_name, self.ref_rate = "", 0
        try:
            spk = self.pa.get_default_wasapi_loopback()
            self.ref_name = spk.get("name", "")
            self.ref_rate = int(spk["defaultSampleRate"])
            self.streams.append(self._open(pyaudio, spk, max(1, int(spk["maxInputChannels"])), self.ref_rate, on_ref))
        except Exception as e:  # noqa: BLE001
            print("  Голос: звук колонок недоступен:", e)
            self.ref_rate = 0

    def _open(self, pyaudio, dev, ch, rate, fn):
        np = self.np

        def cb(data, frames, info, status):
            try:
                fn(_mono16(data, ch, np), time.perf_counter())
            except Exception as e:  # noqa: BLE001
                say_error("звука", e)
            return (None, pyaudio.paContinue)

        return self.pa.open(format=pyaudio.paInt16, channels=ch, rate=rate, input=True,
                            input_device_index=dev["index"], frames_per_buffer=rate // 100, stream_callback=cb)

    def close(self):
        for s in self.streams:
            try:
                s.stop_stream()
                s.close()
            except Exception:  # noqa: BLE001
                pass
        try:
            self.pa.terminate()
        except Exception:  # noqa: BLE001
            pass


class SdCapture:
    """macOS / Linux: the microphone only (sounddevice); the speakers' sound isn't there to have."""

    def __init__(self, on_mic, on_ref, mic_key=None):
        import numpy as np
        import sounddevice as sd
        self.ref_name, self.ref_rate = "", 0
        chosen, self.fell_back = pick_device(sd_inputs(sd), mic_key)

        def cb(indata, frames, info, status):
            on_mic(np.ascontiguousarray(indata[:, 0]).astype(np.int16), time.perf_counter())

        def open_(d):
            dev = d["info"] if d else sd.query_devices(kind="input")
            self.mic_name, self.mic_key = dev.get("name", ""), (d or {}).get("key", "")
            self.mic_rate = int(dev.get("default_samplerate") or 48000)
            self.stream = sd.InputStream(device=d["index"] if d else None, samplerate=self.mic_rate, channels=1, dtype="int16",
                                         blocksize=self.mic_rate // 100, callback=cb)
            self.stream.start()

        try:
            open_(chosen)
        except Exception as e:  # noqa: BLE001
            if chosen is None or chosen.get("default"):
                raise
            print("  Голос: микрофон не открылся:", chosen.get("name"), e)
            self.fell_back = True
            open_(None)

    def close(self):
        try:
            self.stream.stop()
            self.stream.close()
        except Exception:  # noqa: BLE001
            pass


class FileCapture:
    """Tests: a microphone file (and a speakers' file) played in real time — ZNS_VOICE_FILE / ZNS_VOICE_REF_FILE."""

    def __init__(self, on_mic, on_ref, mic_file, ref_file=None):
        import numpy as np
        import wave
        self.np = np
        self.stop = threading.Event()

        def load(path):
            with wave.open(path, "rb") as w:
                rate, ch = w.getframerate(), w.getnchannels()
                x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
            return _mono16(x.tobytes(), ch, np), rate

        self.mic_key, self.fell_back = os.path.basename(mic_file), False
        mic, self.mic_rate = load(mic_file)
        ref, self.ref_rate = load(ref_file) if ref_file else (None, 0)
        self.mic_name, self.ref_name = os.path.basename(mic_file), os.path.basename(ref_file or "")

        def run():
            step = self.mic_rate // 100
            t_start = time.perf_counter()
            i = 0
            while not self.stop.is_set() and i < len(mic) + self.mic_rate * 2:
                d = t_start + (i + step) / self.mic_rate - time.perf_counter()
                if d > 0:
                    time.sleep(d)
                now = time.perf_counter()
                chunk = mic[i:i + step] if i < len(mic) else np.zeros(step, np.int16)
                if len(chunk) < step:
                    chunk = np.concatenate([chunk, np.zeros(step - len(chunk), np.int16)])
                on_mic(chunk, now)
                if ref is not None:
                    rs = self.ref_rate // 100
                    j = i * self.ref_rate // self.mic_rate
                    rc = ref[j:j + rs]
                    if len(rc) and np.abs(rc).max() > 0:  # (like WASAPI: nothing comes while nothing plays)
                        on_ref(rc, now)
                i += step
            self.done = True

        self.done = False
        self.thread = threading.Thread(target=run, name="voice-file", daemon=True)
        self.thread.start()

    def close(self):
        self.stop.set()


# ---------------------------------------------------------------- the voice
class NativeVoice:
    def __init__(self):
        self.state = "idle"  # idle | installing | downloading | loading | running | error | unavailable
        self.error = ""
        self.progress = 0.0
        self.detail = ""
        self.mic_name = ""
        self.ref_name = ""
        self.mic_key = ""      # the microphone listened to now
        self.mic_wanted = ""   # the one chosen in the settings ("" — the system's default)
        self.mic_fallback = False  # the chosen one is not there: the default listens
        self._mic_change = threading.Event()
        self.aec = False
        self.cost = 0.0  # ms the last look at a phrase took
        self.events = collections.deque(maxlen=400)
        self.seq = 0
        self.cond = threading.Condition()
        self.clients = 0
        self.last_client = time.time()
        self._thread = None
        self._stop = threading.Event()
        self._ready = None
        self.started = time.perf_counter()

    # ------------------------------------------------------------ availability
    def _deps(self):
        try:
            import numpy  # noqa: F401
            import onnxruntime  # noqa: F401
            from livekit import rtc  # noqa: F401
            if not os.environ.get("ZNS_VOICE_FILE"):
                if sys.platform.startswith("win"):
                    import pyaudiowpatch  # noqa: F401
                else:
                    import sounddevice  # noqa: F401
            return True
        except Exception as e:  # noqa: BLE001
            self.error = f"{type(e).__name__}: {e}"
            return False

    def model_paths(self):
        d = models_dir()
        new, old = os.path.join(d, MODEL_DIR), os.path.join(d, MODEL_OLD_DIR)
        if not os.path.isdir(new) and os.path.isdir(old):
            try:
                os.replace(old, new)  # (downloaded by the first version: moved, not downloaded again)
            except OSError:
                return old, os.path.join(d, VAD_FILE)
        return new, os.path.join(d, VAD_FILE)

    def models_ready(self):
        ctc, vad = self.model_paths()
        return all([CHECK.ok(os.path.join(ctc, "model.int8.onnx"), "model.int8.onnx"),
                    CHECK.ok(os.path.join(ctc, "tokens.txt"), "tokens.txt"), CHECK.ok(vad, VAD_FILE)])

    def available(self):
        if self._ready is None or (not self._ready and self.state not in ("installing", "downloading")):
            self._ready = self._deps() and self.models_ready()
        return self._ready

    def status(self):
        return {
            "available": self.available(),
            "state": self.state,
            "error": self.error,
            "progress": round(self.progress, 3),
            "detail": self.detail,
            "mic": self.mic_name,
            "micKey": self.mic_key,
            "micWanted": self.mic_wanted,
            "micFallback": self.mic_fallback,
            "speakers": self.ref_name,
            "aec": self.aec,
            "cost": round(self.cost, 1),
        }

    def download_models(self):
        """Once: the speech network (≈225 MB, from a ≈165 MB archive) and silero VAD, into the user's folder.
        Every file is checked (SHA-256) before it is used; out of the archive only the 3 files needed,
        each into this folder under its own fixed name (whatever paths or links the archive holds)."""
        ctc_dir, vad_path = self.model_paths()
        os.makedirs(os.path.dirname(vad_path), exist_ok=True)
        if not CHECK.ok(vad_path, VAD_FILE):
            limit = FILES[VAD_FILE][0]
            with urllib.request.urlopen(urllib.request.Request(VAD_URL, headers={"User-Agent": "Volshebstvo"}), timeout=60) as r:
                data = r.read(limit + 1)
            if len(data) > limit:
                raise ValueError(f"скачанный файл {VAD_FILE} больше ожидаемого — не используется")
            with open(vad_path + ".part", "wb") as f:
                f.write(data)
            save_checked(vad_path + ".part", vad_path, VAD_FILE)
        if self.models_ready():
            return True
        self.state = "downloading"
        req = urllib.request.Request(MODEL_URL, headers={"User-Agent": "Volshebstvo"})
        parts = []
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                total = int(r.headers.get("Content-Length") or 163286197)
                voice = self

                class Counting(io.RawIOBase):
                    def __init__(self):
                        self.got = 0

                    def readable(self):
                        return True

                    def readinto(self, b):
                        chunk = r.read(min(len(b), ARCHIVE_MAX + 1 - self.got))
                        n = len(chunk)
                        b[:n] = chunk
                        self.got += n
                        if self.got > ARCHIVE_MAX:
                            raise ValueError("архив нейросети больше ожидаемого — не используется")
                        voice.progress = min(0.99, self.got / total)
                        voice.detail = f"Нейросеть голоса: скачано {self.got / 1048576:.0f} из {total / 1048576:.0f} МБ"
                        return n

                os.makedirs(ctc_dir, exist_ok=True)
                with tarfile.open(fileobj=io.BufferedReader(Counting(), 1 << 20), mode="r|bz2") as tar:
                    for m in tar:
                        name = os.path.basename(m.name)
                        # (only plain files — no links — with names we know, of their known size)
                        if name not in FILES or name == VAD_FILE or not m.isreg() or m.size != FILES[name][0]:
                            continue
                        src = tar.extractfile(m)
                        part = os.path.join(ctc_dir, name + ".part")
                        parts.append(part)
                        with open(part, "wb") as f:
                            left = m.size
                            while left > 0:
                                b = src.read(min(1 << 20, left))
                                if not b:
                                    break
                                f.write(b)
                                left -= len(b)
                        save_checked(part, os.path.join(ctc_dir, name), name)
        finally:
            for part in parts:  # (a download cut short leaves nothing behind)
                try:
                    os.remove(part)
                except OSError:
                    pass
        self.progress = 1.0
        self.detail = ""
        self._ready = None
        return self.models_ready()

    # ------------------------------------------------------------ start / stop
    def start(self):
        if not self.available():
            return False
        with self.cond:
            if self._thread and self._thread.is_alive():
                return True
            self._stop.clear()
            self.state = "loading"
            self.error = ""
            self._thread = threading.Thread(target=self._run, name="voice-native", daemon=True)
            self._thread.start()
        return True

    def stop(self):
        self._stop.set()

    def set_mic(self, key):
        """The microphone chosen in the settings ("" / "default" — the system's): taken at once, the
        capture opens again on it (the networks stay loaded)."""
        key = "" if not key or key == "default" else str(key)[:300]
        if key == self.mic_wanted:
            return False
        self.mic_wanted = key
        if self.state == "running":
            self._mic_change.set()
        return True

    def _emit(self, ev):
        with self.cond:
            self.seq += 1
            ev["seq"] = self.seq
            self.events.append(json.dumps(ev, ensure_ascii=False, separators=(",", ":")))
            self.cond.notify_all()

    def ms(self, t):
        """perf_counter time → ms since this program started (the page compares with its own clock)."""
        return round((t - self.started) * 1000, 1)

    # ------------------------------------------------------------ the work
    def _run(self):
        try:
            import numpy as np
            from livekit import rtc
            ctc_dir, vad_path = self.model_paths()
            ctc = CtcNet(ctc_dir, threads=int(os.environ.get("ZNS_VOICE_THREADS", "2")))
            vad = Vad(vad_path)
            mic_box, ref_box = {}, {}

            def on_mic(x, t):
                s = mic_box.get("s")
                if s:
                    s.push(x, t)

            def on_ref(x, t):
                s = ref_box.get("s")
                if s:
                    s.push(x, t)

            while True:
                # (a microphone chosen in the settings: the capture opens again, the networks stay)
                self._mic_change.clear()
                mic_box.clear()
                ref_box.clear()
                if os.environ.get("ZNS_VOICE_FILE"):
                    cap = FileCapture(on_mic, on_ref, os.environ["ZNS_VOICE_FILE"], os.environ.get("ZNS_VOICE_REF_FILE"))
                elif sys.platform.startswith("win"):
                    cap = WinCapture(on_mic, on_ref, self.mic_wanted)
                else:
                    cap = SdCapture(on_mic, on_ref, self.mic_wanted)
                try:  # (whatever happens from here on, the microphone is let go)
                    mic_box["s"] = Stream(cap.mic_rate, "mic")
                    if cap.ref_rate:
                        ref_box["s"] = Stream(cap.ref_rate, "ref", continuous=False)
                    self.mic_name, self.ref_name = cap.mic_name, cap.ref_name
                    self.mic_key, self.mic_fallback = cap.mic_key, bool(cap.fell_back)
                    self.aec = bool(cap.ref_rate) and os.environ.get("ZNS_VOICE_AEC", "1") != "0"
                    apm = rtc.AudioProcessingModule(echo_cancellation=self.aec, noise_suppression=False, high_pass_filter=True)
                    self.state = "running"
                    self._emit({"type": "status", **self.status()})
                    print(f"  Голос: нейросеть на компьютере работает (микрофон: {self.mic_name or '?'}"
                          f"{' — выбранного нет, слушается системный' if self.mic_fallback else ''}; "
                          f"звук колонок: {self.ref_name or 'нет'}; эхо убирается: {'да' if self.aec else 'нет'})")
                    self._loop(np, rtc, ctc, vad, apm, mic_box["s"], ref_box.get("s"), cap)
                finally:
                    cap.close()
                    print("  Голос: микрофон отпущен")
                if not self._mic_change.is_set() or self._stop.is_set():
                    break
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            self.state = "error"
            self.error = f"{type(e).__name__}: {e}"
            self._emit({"type": "status", **self.status()})
            return
        self.state = "idle"

    def _loop(self, np, rtc, ctc, vad, apm, mic, ref, cap):
        pipe = Pipeline(np, rtc, ctc, vad, apm, self.aec, vad_far=Vad(self.model_paths()[1]) if ref is not None else None,
                        vad_raw=Vad(self.model_paths()[1]))
        jobs = collections.deque()
        busy = threading.Event()
        lag = 0.06 + LEAD  # s a microphone sample waits: the speakers' copy of that moment has come by then
        over = threading.Event()  # (this loop is over: its worker ends with it)

        def worker():
            while not self._stop.is_set() and not over.is_set():
                if not jobs:
                    time.sleep(0.01)
                    continue
                job = jobs.popleft()
                busy.set()
                try:
                    ev = pipe.look(job, lambda i: self.ms(mic.t0 + i / SR))
                    self.cost = ev.get("cost", 0)
                    self._emit(ev)
                except Exception as e:  # noqa: BLE001
                    say_error("распознавания", e)
                busy.clear()

        threading.Thread(target=worker, name="voice-ctc", daemon=True).start()
        try:
            self._listen(np, pipe, jobs, busy, lag, mic, ref, cap)
        finally:
            over.set()

    def _listen(self, np, pipe, jobs, busy, lag, mic, ref, cap):
        n = 0  # next microphone sample to process
        lv_t = time.perf_counter()
        idle_since = None
        while not self._stop.is_set() and not self._mic_change.is_set():
            # nobody listens (the game closed): stop after a while
            if self.clients <= 0:
                idle_since = idle_since or time.time()
                if time.time() - idle_since > 15:
                    break
            else:
                idle_since = None
            if getattr(cap, "done", False) and mic.n - n < FRAME:
                if pipe.seg is None and not jobs and not busy.is_set():
                    break
                time.sleep(0.02)
                continue
            t_now = time.perf_counter()
            if mic.t0 is None or mic.n - n < FRAME or (t_now - mic.t0) - (n + FRAME) / SR < lag:
                time.sleep(0.004)
                continue
            m = mic.read(n, n + FRAME)
            if ref is not None and ref.t0 is not None:
                # the speakers' samples of the same moment — a little ahead of it: the echo canceller
                # must get a sound before its echo, whatever the two clocks' small disagreement
                ra = ref.now_index(mic.t0 + n / SR + LEAD)
                r = ref.read(ra, ra + FRAME)
            else:
                r = np.zeros(FRAME, np.float32)
            jobs.extend(pipe.frame(m, r))
            n += FRAME
            if t_now - lv_t >= 0.05:
                self._emit(pipe.levels(self.ms(mic.t0 + n / SR)))
                lv_t = t_now
            # a look at the phrase still being said (only when the network is free: never a queue of old looks)
            if pipe.seg is not None and t_now >= pipe.seg["next"] and not busy.is_set() and not jobs:
                j = pipe.partial()
                if j:
                    jobs.append(j)
                pipe.seg["next"] = t_now + SEG["partial"]


class Pipeline:
    """The work on every 10 ms of sound: the echo out, the level, speech or not, the phrases; and the
    look at a phrase (the network). The live loop and the tests (offline) drive it the same way."""

    def __init__(self, np, rtc, ctc, vad, apm, aec, vad_far=None, vad_raw=None):
        self.np, self.rtc, self.ctc, self.vad, self.apm, self.aec = np, rtc, ctc, vad, apm, aec
        # speech or not in the plain microphone too (read when no voice plays in the speakers)
        self.vad_raw = vad_raw
        self.raw_buf = np.zeros(0, np.float32)
        self.floor_raw = -70.0
        # speech in what the speakers play — a friend's voice, the villagers' — and not the sea, the wind
        # or the music: only speech there can be taken for mine
        self.vad_far = vad_far
        self.far_buf = np.zeros(0, np.float32)
        self.far_at = 0
        self.far_sp = collections.deque(maxlen=1000)  # (index, speech?) of the speakers per 32 ms
        self.L = SR * 30
        self.clean = np.zeros(self.L, np.float32)  # the microphone after the echo canceller (a ring)
        self.raw = np.zeros(self.L, np.float32)    # the microphone as it is (the same ring)
        self.refl = np.zeros(self.L, np.float32)   # the speakers' sound, on the microphone's clock
        self.n = 0
        self.vad_buf = np.zeros(0, np.float32)
        self.vad_at = 0
        self.seg = None
        self.seg_id = 0
        self.quiet = 0.0
        self.floor = -70.0  # the microphone's background after the echo canceller (dB)
        self.recent = collections.deque(maxlen=31)  # (clean dB, the speakers speak?) of the last ~1 s, per 32 ms
        self.far_now = False
        self.lv, self.lv_raw, self.lv_far = [], [], []

    def frame(self, m, r):
        """10 ms of the microphone (m) and of the speakers (r) → the looks to make (phrases just ended)."""
        np, rtc = self.np, self.rtc
        db = lambda x: 20 * np.log10(np.sqrt(np.mean(x * x)) + 1e-9)  # noqa: E731
        if self.aec:
            fr = rtc.AudioFrame((np.clip(r, -1, 1) * 32767).astype(np.int16).tobytes(), SR, 1, FRAME)
            self.apm.process_reverse_stream(fr)
        fm = rtc.AudioFrame((np.clip(m, -1, 1) * 32767).astype(np.int16).tobytes(), SR, 1, FRAME)
        self.apm.process_stream(fm)
        c = np.frombuffer(bytes(fm.data), dtype=np.int16).astype(np.float32) / 32768.0
        i = self.n % self.L
        self.clean[i:i + FRAME] = c
        self.raw[i:i + FRAME] = m
        self.refl[i:i + FRAME] = r
        f_db = db(r)
        self.n += FRAME
        self.lv.append(round(float(db(c)), 1))
        self.lv_raw.append(round(float(db(m)), 1))
        self.lv_far.append(round(float(f_db), 1))
        jobs = []
        if self.vad_far is not None:
            self.far_buf = np.concatenate([self.far_buf, r])
            while len(self.far_buf) >= 512:
                chunk = self.far_buf[:512]
                self.far_buf = self.far_buf[512:]
                sp = float(db(chunk)) > -55 and self.vad_far(chunk) >= 0.5
                self.far_sp.append((self.far_at, sp))
                self.far_at += 512
                self.far_now = sp
        self.vad_buf = np.concatenate([self.vad_buf, c])
        self.raw_buf = np.concatenate([self.raw_buf, m])
        while len(self.vad_buf) >= 512:
            chunk = self.vad_buf[:512]
            rchunk = self.raw_buf[:512]
            pc = self.vad(chunk)
            pm = self.vad_raw(rchunk) if self.vad_raw is not None else pc
            self.vad_buf = self.vad_buf[512:]
            self.raw_buf = self.raw_buf[512:]
            self.vad_at += 512
            # the background: follows quiet moments quickly, loud ones very slowly
            cdb, mdb = float(db(chunk)), float(db(rchunk))
            self.floor += (cdb - self.floor) * (0.2 if cdb < self.floor else 0.002)
            self.floor_raw += (mdb - self.floor_raw) * (0.2 if mdb < self.floor_raw else 0.002)
            # a voice in the speakers: the cleaned sound decides (and only louder than the trace the
            # canceller leaves of them); else the plain microphone (the canceller squeezes my voice
            # while the sea, the wind or music play)
            cleaned = self.aec and self.far_now
            p = pc if cleaned else pm
            self.recent.append((cdb, self.far_now))
            if self.seg is None:
                if p >= SEG["on"] and (cdb >= max(-58.0, self.floor + 8) if cleaned else mdb >= -62.0):
                    self.seg_id += 1
                    self.seg = {"id": self.seg_id, "a": max(0, self.vad_at - 512 - int(SEG["pre"] * SR)), "next": 0.0}
                    self.quiet = 0.0
            else:
                # (only a faint trace left — the echo canceller's leftover of the speakers — is quiet too)
                faint = cleaned and cdb < max(-62.0, self.floor + 6)
                self.quiet = self.quiet + 512 / SR if p < SEG["off"] or faint else 0.0
                if self.quiet >= SEG["end"] or self.vad_at - self.seg["a"] >= SEG["max"] * SR:
                    jobs.append({"id": self.seg["id"], "a": self.seg["a"], "b": self.vad_at, "final": True})
                    self.seg = None
        return jobs

    def partial(self):
        """A look at the end of the phrase still being said (None: too little of it yet — or, while the
        speakers play, only the faint trace of them the echo canceller left: its end is looked at anyway)."""
        if self.seg is None:
            return None
        if self.recent and sum(1 for _, f in self.recent) and sum(1 for _, f in self.recent if f) > len(self.recent) // 4:
            if max(c for c, _ in self.recent) < self.floor + 15:
                return None
        b = self.vad_at
        a = max(self.seg["a"], b - int(SEG["window"] * SR))
        if b - a < int(0.25 * SR):
            return None
        return {"id": self.seg["id"], "a": a, "b": b, "final": False, "cut": a > self.seg["a"]}

    def levels(self, t_ms):
        ev = {"type": "lv", "t": t_ms, "db": self.lv, "raw": self.lv_raw, "far": self.lv_far}
        self.lv, self.lv_raw, self.lv_far = [], [], []
        return ev

    def look(self, job, to_ms):
        """The network on a phrase (and on what the speakers played meanwhile) → the event for the page."""
        np = self.np
        a, b = job["a"], job["b"]
        t = time.perf_counter()
        # the speakers spoke meanwhile (a little before too: the echo comes after its sound)
        lo = a - int(0.6 * SR)
        far = [sp for (i, sp) in list(self.far_sp) if lo <= i < b]
        loud = sum(1 for sp in far if sp)
        share = loud / max(1, len(far))
        # Which sound to read: with a voice in the speakers (a friend, a villager) the one the echo
        # canceller cleaned; with only the sea, the wind or music there the microphone as it is — the
        # canceller, busy with that sound all the time, squeezes my own voice too (tested: on a loud
        # sea 2 of 8 spells heard through it, 5 of 8 without; with music 5 and 8)
        use_clean = self.aec and share >= 0.1
        src = self.clean if use_clean else self.raw
        lp = self.ctc.logprobs(src[np.arange(a, b) % self.L])
        ev = {"type": "seg", "id": job["id"], "final": job["final"], "cut": bool(job.get("cut")), "t0": to_ms(a), "t1": to_ms(b),
              "T": int(lp.shape[0]), "lp": _pack(np, lp), "src": "aec" if use_clean else "mic"}
        ev["far"] = round(share, 2)
        x = src[np.arange(a, b) % self.L]
        k = len(x) // FRAME
        floor = self.floor if use_clean else self.floor_raw
        if k:
            fr = x[:k * FRAME].reshape(k, FRAME)
            ev["peak"] = round(float(20 * np.log10(np.sqrt((fr * fr).mean(axis=1)).max() + 1e-9)), 1)
            ev["snr"] = round(ev["peak"] - floor, 1)  # how far my voice stands above the noise
        ev["floor"] = round(float(floor), 1)
        # (a look at a phrase still being said while the speakers play gets none: the page then waits
        # for the phrase's end, which gets them — half the work while a friend talks over Discord)
        if loud >= 3 and (job["final"] or ev["far"] < 0.25):
            rl = self.ctc.logprobs(self.refl[np.arange(max(0, lo), b) % self.L])
            ev["refT"] = int(rl.shape[0])
            ev["ref"] = _pack(np, rl)
            ev["refLead"] = round((a - max(0, lo)) / SR, 3)  # s the speakers' rows start before the microphone's
        ev["cost"] = round((time.perf_counter() - t) * 1000, 1)
        return ev


def offline(mic, ref=None, aec=True, partial_every=SEG["partial"], threads=2):
    """Tests: the whole way over two 16 kHz float arrays (no devices, no waiting) → the events."""
    import numpy as np
    from livekit import rtc
    ctc_dir, vad_path = VOICE.model_paths()
    ctc = CtcNet(ctc_dir, threads=threads)
    vad = Vad(vad_path)
    apm = rtc.AudioProcessingModule(echo_cancellation=aec and ref is not None, noise_suppression=False, high_pass_filter=True)
    pipe = Pipeline(np, rtc, ctc, vad, apm, aec and ref is not None, vad_far=Vad(vad_path) if ref is not None else None, vad_raw=Vad(vad_path))
    ref = np.zeros(len(mic), np.float32) if ref is None else np.concatenate([ref, np.zeros(max(0, len(mic) - len(ref)), np.float32)])
    mic = np.concatenate([mic, np.zeros(SR, np.float32)])
    ref = np.concatenate([ref, np.zeros(len(mic) - len(ref), np.float32)])
    out, next_look = [], 0
    to_ms = lambda i: round(i / SR * 1000, 1)  # noqa: E731
    for k in range(0, len(mic) - FRAME + 1, FRAME):
        for j in pipe.frame(mic[k:k + FRAME], ref[k:k + FRAME]):
            out.append(pipe.look(j, to_ms))
        if pipe.seg is not None and k >= next_look:
            j = pipe.partial()
            if j:
                out.append(pipe.look(j, to_ms))
            next_look = k + int(partial_every * SR)
    return out


def _pack(np, lp):
    """Log-probabilities → bytes: −lp×10, 0…255 (0.1 steps; below −25.5 is «never»)."""
    q = np.clip(np.rint(-lp * 10), 0, 255).astype(np.uint8)
    return base64.b64encode(q.tobytes()).decode("ascii")


VOICE = NativeVoice()


if __name__ == "__main__":
    # A quick look from the command line: python voice_native.py [mic.wav [speakers.wav]]
    if len(sys.argv) > 1:
        os.environ["ZNS_VOICE_FILE"] = sys.argv[1]
    if len(sys.argv) > 2:
        os.environ["ZNS_VOICE_REF_FILE"] = sys.argv[2]
    if not VOICE.available():
        print("Нет:", VOICE.error or "моделей", "— скачиваю модели…")
        VOICE.download_models()
    VOICE.clients = 1
    VOICE.start()
    seen = 0
    while VOICE._thread and VOICE._thread.is_alive():
        with VOICE.cond:
            VOICE.cond.wait(timeout=0.5)
            evs = list(VOICE.events)[-(VOICE.seq - seen):] if VOICE.seq > seen else []
            seen = VOICE.seq
        for e in evs:
            d = json.loads(e)
            if d["type"] == "seg":
                print("seg", d["id"], "final" if d["final"] else "…", d["t0"], d["t1"], "T", d["T"], "far", d.get("far"), "ref" in d, d.get("cost"), "ms")
            elif d["type"] == "status":
                print(d)
