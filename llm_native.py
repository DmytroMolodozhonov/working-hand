"""
llm_native.py — the villagers' conversation network as a program of its own on this computer.

Why: on the processor it starved the game, the camera, the speech program and the villagers' voices (the author's
journal: words heard 3 s late, a voice 6–7 s late, frames lost) — so, by the author's rule «всё сложное — на
видеокарту», it runs on the VIDEO CARD: llama.cpp's own program (llama-server, from the ggml-org/llama.cpp releases —
MIT), its Vulkan build (any card; Metal on a Mac), the whole net on the card (-ngl 99), started by the game server in
a process of its own, below normal priority (what it still does on the processor waits for the game).

  - the program: downloaded once (≈ 30 MB, a pinned release, checked by SHA-256) into the user's own
    folder (the game folder is replaced by updates);
  - the model: llama-server downloads it itself from Hugging Face (-hf, ggml-org's GGUF of Gemma 4)
    once, into the same folder, then uses it from there;
  - the page talks to it through server.py (/api/llm/...): the same messages as its old web worker
    (src/ai/llm.worker.js — src/ai/NativeLLM.js), the answers streamed word by word.

Nothing here runs at import time.
"""

import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tarfile
import threading
import time
import urllib.request
import zipfile

BUILD = "b11669"  # llama.cpp release (October 2026): Gemma 4, tool calls, --reasoning off
RELEASE = f"https://github.com/ggml-org/llama.cpp/releases/download/{BUILD}/"
# the VIDEO CARD build of each system (the author: «всё сложное — на видеокарту»): Vulkan on Windows and Linux (any card:
# NVIDIA, AMD, Intel — its processor parts are in the same archive: no card, it still runs), Metal on a Mac; checked before use
ASSETS = {
    "win": (f"llama-{BUILD}-bin-win-vulkan-x64.zip", "2c07574e7bde71321cb785282b20cc821e951132149eeceeea32ddebdbf0598e"),
    "linux": (f"llama-{BUILD}-bin-ubuntu-vulkan-x64.tar.gz", "e8709e5ba6c1b093dea7f3de57f4aba842f9a188fba6b465782d65d6fcfa4d9f"),
    "mac": (f"llama-{BUILD}-bin-macos-arm64.tar.gz", "dbed55493d72bc1ba2babc8770d669c2289b5bc4ee9fb2a4dfc158d45b7d13fd"),
}
GPU_LAYERS = "99"  # (the whole net on the video card)
ASSET_MAX = 64 * 1024 * 1024
# the page's model choice → the GGUF on Hugging Face (llama-server picks its usual 4-bit file)
MODELS = {
    "gemma4": "ggml-org/gemma-4-E2B-it-GGUF",
    "gemma4big": "ggml-org/gemma-4-E4B-it-GGUF",
}
DEFAULT_MODEL = "gemma4"


def data_dir():
    """The user's own folder for the program and the model (as the voice's models)."""
    if os.environ.get("ZNS_LLM_DIR"):
        return os.environ["ZNS_LLM_DIR"]
    if sys.platform.startswith("win"):
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        return os.path.join(base, "Volshebstvo", "llm")
    if sys.platform == "darwin":
        return os.path.join(os.path.expanduser("~"), "Library", "Application Support", "Volshebstvo", "llm")
    return os.path.join(os.path.expanduser("~"), ".cache", "volshebstvo", "llm")


def platform_key():
    if sys.platform.startswith("win"):
        return "win"
    if sys.platform == "darwin":
        return "mac"
    return "linux"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _sensible(reply):
    """A reply in Russian words (mostly Cyrillic letters, no broken-encoding «РЎРІ» runs, not empty)."""
    import re
    letters = re.findall(r"[A-Za-zА-Яа-яЁё]", reply or "")
    cyr = [c for c in letters if re.match(r"[А-Яа-яЁё]", c)]
    # (UTF-8 read as cp1251: every other letter a capital «Р» or «С» — «РЎРІРµР¶РёР№»)
    rs = sum(1 for c in cyr if c in "РС")
    mojibake = rs >= 3 and rs > 0.3 * len(cyr)
    return len(cyr) >= 3 and len(cyr) >= 0.6 * len(letters) and not mojibake


def strip_think(s):
    """Thoughts out of an answer (the model was asked not to think — just in case)."""
    import re
    s = re.sub(r"<think>[\s\S]*?</think>", "", s or "", flags=re.I)
    s = re.sub(r"<think>[\s\S]*$", "", s, flags=re.I)
    s = re.sub(r"<\|channel>[\s\S]*?(<channel\|>|$)", "", s)
    return re.sub(r"<\|?(turn|eos|end_of_turn)\|?>", "", s).strip()


class NativeLLM:
    def __init__(self):
        self.state = "off"  # off | downloading | loading | ready | error
        self.error = ""
        self.progress = 0.0
        self.detail = ""
        self.model = ""
        self.proc = None
        self.port = 0
        self.ms = 0
        self._lock = threading.Lock()
        self._log = []
        self._seen = []  # (its lines about the graphics card: LLM.device)
        self._current = {}  # job id → the open answer stream (closed to interrupt it)
        self._key = ""
        self._checking = False

    # ------------------------------------------------------------ status
    def available(self):
        """Can it run here at all (a build for this system)? The download comes on first use."""
        return platform_key() in ASSETS and not os.environ.get("ZNS_NO_NATIVE_LLM")

    def status(self):
        return {"available": self.available(), "state": self.state, "error": self.error, "progress": round(self.progress, 3),
                "detail": self.detail, "model": self.model, "ms": self.ms, "build": BUILD}

    # ------------------------------------------------------------ the program
    def binary_dir(self):
        return os.path.join(data_dir(), BUILD + "-gpu")  # (not the processor build kept there before)

    def binary(self):
        """The llama-server of this system (downloaded and checked once)."""
        exe = "llama-server.exe" if platform_key() == "win" else "llama-server"
        for root, _, files in os.walk(self.binary_dir()):
            if exe in files:
                return os.path.join(root, exe)
        return None

    def _download_binary(self):
        name, sha = ASSETS[platform_key()]
        os.makedirs(data_dir(), exist_ok=True)
        part = os.path.join(data_dir(), name + ".part")
        self.detail = "скачивается программа нейросети (≈ 30 МБ)"
        h = hashlib.sha256()
        with urllib.request.urlopen(urllib.request.Request(RELEASE + name, headers={"User-Agent": "Volshebstvo"}), timeout=60) as r, open(part, "wb") as f:
            total = int(r.headers.get("Content-Length") or 0)
            got = 0
            while True:
                b = r.read(1 << 16)
                if not b:
                    break
                got += len(b)
                if got > ASSET_MAX:
                    raise ValueError("программа нейросети больше ожидаемого — не используется")
                h.update(b)
                f.write(b)
                if total:
                    self.progress = 0.1 * got / total
        if h.hexdigest() != sha:
            os.remove(part)
            raise ValueError("программа нейросети не совпала с опубликованной (SHA-256) — не используется")
        dest = self.binary_dir()
        shutil.rmtree(dest, ignore_errors=True)
        os.makedirs(dest, exist_ok=True)
        root = os.path.realpath(dest)

        def safe(member_name):
            p = os.path.realpath(os.path.join(dest, member_name))
            return p == root or p.startswith(root + os.sep)
        if name.endswith(".zip"):
            with zipfile.ZipFile(part) as z:
                for m in z.namelist():
                    if safe(m):
                        z.extract(m, dest)
        else:
            with tarfile.open(part) as t:
                members = [m for m in t.getmembers() if safe(m.name) and (m.isfile() or m.isdir() or m.issym()) and (not m.issym() or safe(os.path.join(os.path.dirname(m.name), m.linkname)))]
                t.extractall(dest, members=members)
        os.remove(part)
        exe = self.binary()
        if not exe:
            raise RuntimeError("в архиве нет llama-server")
        if platform_key() != "win":
            os.chmod(exe, 0o755)

    # ------------------------------------------------------------ start / stop
    def start(self, model=DEFAULT_MODEL):
        """Asked for by the page (never waits): get the program, start it with the model. True once ready."""
        model = model if model in MODELS else DEFAULT_MODEL
        with self._lock:
            if self.state in ("downloading", "loading") and self.model == model:
                return False
            if self.state == "ready" and self.model == model and self.proc and self.proc.poll() is None:
                return True
            self.stop()
            self.model = model
            self.state = "downloading"
            self.error = ""
            self.progress = 0.0
            threading.Thread(target=self._run, args=(model,), name="llm-native", daemon=True).start()
        return False

    def _run(self, model):
        t0 = time.time()
        try:
            if not self.binary():
                self._download_binary()
            self.state = "loading"
            self.detail = "загружается модель (в первый раз скачивается, ≈ 3 ГБ)"
            self.port = free_port()
            # (only the game may ask it: it lets every page in the browser call it otherwise)
            self._key = hashlib.sha256(os.urandom(32)).hexdigest()
            cache = os.path.join(data_dir(), "models")
            os.makedirs(cache, exist_ok=True)
            threads = max(2, min(8, (os.cpu_count() or 4) // 2))  # (half the cores: the game and the camera keep theirs)
            args = [self.binary(), "-hf", MODELS[model], "--host", "127.0.0.1", "--port", str(self.port),
                    "-ngl", GPU_LAYERS, "--no-mmproj", "--jinja", "--reasoning", "off", "-c", "4096", "-t", str(threads),
                    "--no-ui", "-np", "1", "--api-key", self._key,
                    # (Gemma's sliding-window layers kept whole: a question that shares its start with the words read
                    # before reuses them — without it a changed end made the program read the villager anew, 3–7 s)
                    "--swa-full"]
            # (no more threads for reading than for writing: with all the cores it starved the villagers' voice program —
            # the author's journal: a line heard 5.7 s after the words while the net was warming up)
            env = {**os.environ, "LLAMA_CACHE": cache}
            kw = {}
            if platform_key() == "win":
                kw["creationflags"] = 0x00004000 | 0x08000000  # BELOW_NORMAL_PRIORITY_CLASS | CREATE_NO_WINDOW
            else:
                kw["preexec_fn"] = lambda: os.nice(10)
            self._seen = []
            self.proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, cwd=os.path.dirname(self.binary()), **kw)
            threading.Thread(target=self._read_log, args=(self.proc,), daemon=True).start()
            # ready when its /health says so (the model downloaded and loaded)
            while self.proc.poll() is None:
                try:
                    with urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{self.port}/health", headers={"Authorization": "Bearer " + self._key}), timeout=2) as r:
                        if r.status == 200 and json.loads(r.read() or b"{}").get("status") == "ok":
                            break
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(0.5)
            if self.proc.poll() is not None:
                raise RuntimeError("программа нейросети остановилась: " + " | ".join(self._log[-3:]))
            # a first question it must answer in sense, in Russian (a wrong chat format or a broken model gives
            # gibberish: then the page's own network answers — the reason goes to the journal)
            self._checking = True  # (still «loading» for the page meanwhile)
            try:
                reply = self.generate({"id": "check", "messages": [{"role": "user", "content": "Ответь одним коротким предложением по-русски: какого цвета трава летом?"}],
                                       "maxTokens": 30, "temperature": 0.0}, lambda m: None)
            finally:
                self._checking = False
            if not _sensible(reply):
                raise RuntimeError(f"нейросеть ответила бессвязно на проверочный вопрос: «{reply[:80]}»")
            self.ms = int((time.time() - t0) * 1000)
            self.progress = 1.0
            self.detail = "готова"
            self.state = "ready"
            print(f"  [Нейросеть жителей] {MODELS[model]} готова: отдельная программа llama.cpp ({BUILD}), {self.device()}, {self.ms} мс")
        except Exception as e:  # noqa: BLE001
            self.error = str(e) or type(e).__name__
            self.state = "error"
            print(f"  [Нейросеть жителей] не запустилась (работает браузерная): {self.error}")
            self.stop(keep_state=True)

    def device(self):
        """Where the net really runs, from llama-server's own words: the graphics card's name and how many of the
        model's layers are on it (the author's journal: answers 2–3.5 s late — on the card it must be well under 1 s)."""
        import re
        cards = [m.group(1).strip() for l in self._seen for m in [re.search(r"ggml_vulkan: \d+ = (.+?)(?: \(|\||$)", l) or re.search(r"(?:using device|found device|Metal device:?)\s*(.+)$", l, re.I)] if m]
        off = next((m for l in self._seen for m in [re.search(r"offloaded (\d+)/(\d+) layers to GPU", l)] if m), None)
        if off and int(off.group(1)) > 0:
            return f"видеокарта{' ' + cards[0] if cards else ''}: {off.group(1)} из {off.group(2)} слоёв"
        if off:
            return "ПРОЦЕССОР (видеокарта не подошла: 0 слоёв на ней)"
        return "видеокарта" + (f" {cards[0]}" if cards else " (не видно в журнале программы)")

    def _read_log(self, proc):
        """Its output: the model's download progress (for the page), the last lines (for an error)."""
        import re
        for raw in iter(proc.stdout.readline, b""):
            line = raw.decode("utf-8", "replace").strip()
            if not line:
                continue
            self._log = (self._log + [line])[-40:]
            if len(self._seen) < 60 and ("vulkan" in line.lower() or "offloaded" in line or "device" in line.lower() or "metal" in line.lower()):
                self._seen.append(line)  # (where it runs: LLM.device)
            m = re.search(r"(\d{1,3}(?:\.\d+)?)\s*%", line)
            if m and self.state == "loading":
                self.progress = 0.1 + 0.85 * min(100.0, float(m.group(1))) / 100

    def stop(self, keep_state=False):
        p = self.proc
        self.proc = None
        if p and p.poll() is None:
            try:
                p.terminate()
                p.wait(timeout=5)
            except Exception:  # noqa: BLE001
                try:
                    p.kill()
                except Exception:  # noqa: BLE001
                    pass
        if not keep_state:
            self.state = "off"

    # ------------------------------------------------------------ answers
    def generate(self, job, emit):
        """One answer, as the old worker's 'generate' message: emit({'type': 'partial', 'text'}) while it
        writes (stream), then returns the whole text (tool calls as <tool_call>{json}</tool_call>)."""
        if self.state != "ready" and not self._checking:
            raise RuntimeError("model not loaded")
        jid = job.get("id")
        tools = job.get("tools") or None
        temp = float(job.get("temperature", 0.7))
        body = {
            "messages": job.get("messages") or [],
            "max_tokens": max(1, min(200, int(job.get("maxTokens") or 60))),
            "cache_prompt": True,  # (the words read before are kept: a warm-up while the player comes near — TalkMind.warmRequest)
            "temperature": max(0.05, temp) if temp > 0 else 0.0,
            "top_k": 40, "top_p": 0.9,
            "repeat_penalty": 1.05 if job.get("raw") else 1.15,
            "stream": True,
            "chat_template_kwargs": {"enable_thinking": False},
        }
        if tools:
            body["tools"] = [t if t.get("type") == "function" else {"type": "function", "function": t} for t in tools]
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/v1/chat/completions", data=json.dumps(body).encode("utf-8"),
                                     headers={"Content-Type": "application/json", "Authorization": "Bearer " + self._key})
        text, calls = "", {}
        tm, first, t0 = None, 0.0, time.perf_counter()
        r = urllib.request.urlopen(req, timeout=60)
        self._current[jid] = r
        try:
            for raw in r:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    d = json.loads(data)
                except ValueError:
                    continue
                if d.get("timings"):
                    tm = d["timings"]
                if not first and any((ch.get("delta") or {}).get("content") for ch in d.get("choices") or []):
                    first = time.perf_counter()
                for ch in d.get("choices") or []:
                    delta = ch.get("delta") or {}
                    piece = delta.get("content")
                    if piece:
                        text += piece
                        if job.get("stream"):
                            emit({"type": "partial", "id": jid, "text": piece})
                    for tc in delta.get("tool_calls") or []:
                        c = calls.setdefault(tc.get("index", 0), {"name": "", "args": ""})
                        fn = tc.get("function") or {}
                        c["name"] += fn.get("name") or ""
                        c["args"] += fn.get("arguments") or ""
        except (OSError, ValueError):
            if jid not in self._current:
                return ""  # (interrupted)
            raise
        finally:
            self._current.pop(jid, None)
            try:
                r.close()
            except Exception:  # noqa: BLE001
                pass
        if tm and jid != "check":
            # (one line per answer in the game's console: how long it read, its first word, words a second —
            # the author's journal showed answers 2–3.5 s late, and nothing told why)
            print("  [Нейросеть жителей] ответ: прочла %d слов за %d мс (%d уже были прочитаны), первое слово через %d мс, написала %d слов (%.0f в секунду)%s" % (
                tm.get("prompt_n", 0), tm.get("prompt_ms", 0), tm.get("cache_n", 0), (first - t0) * 1000 if first else -1,
                tm.get("predicted_n", 0), tm.get("predicted_per_second", 0), ", действие" if calls else ""))
        for _, c in sorted(calls.items()):
            try:
                args = json.loads(c["args"]) if c["args"] else {}
            except ValueError:
                args = {}
            text += "<tool_call>" + json.dumps({"name": c["name"], "arguments": args}, ensure_ascii=False) + "</tool_call>"
        return strip_think(text)

    def interrupt(self, jid):
        """Stops an answer at once: its connection to llama-server is cut (llama-server then drops the work and
        is free for the next question). Never waits — closing the stream itself waited for the reading thread
        (up to the next word, or the whole reading of a long prompt) and held the page's request that long."""
        r = self._current.pop(jid, None)
        if r is None:
            return
        try:
            r.fp.raw._sock.shutdown(socket.SHUT_RDWR)  # (the reading thread wakes at once; it closes the stream itself)
        except Exception:  # noqa: BLE001
            threading.Thread(target=r.close, daemon=True).start()


LLM = NativeLLM()

import atexit  # noqa: E402

atexit.register(LLM.stop)  # (the program goes when the game server goes)
