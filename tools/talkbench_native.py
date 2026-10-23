"""
talkbench_native.py — the real networks for tools/talkbench.mjs --real (not part of the game).

  python tools/talkbench_native.py <scenarios.json>   → one JSON on stdout:
    {"asr": [{id, end_ms, events: [voice_native seg events…]}], "tts": [{text, voice, ms, audio_ms}], "cpu": n}

For every scenario the player's words are said by the villagers' own voice network (Supertonic 3 — a man's
voice, the speaker the microphone would hear), then heard by the game's speech network (GigaAM v3 through
voice_native.offline: the same echo canceller, VAD, phrase ends and looks as in the game; the time of each look
is real). The villagers' reply lines are made with the same voice network: how long a line takes to be heard.
Needs the models the game itself downloads (voice_native / tts_native: ZNS_VOICE_MODELS / ZNS_TTS_DIR).
"""

import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

REPLIES = [
    ("Слушаюсь, Ваше Величество!", "M3"), ("Есть!", "M3"), ("Так точно!", "M4"), ("Хм…", "M2"), ("Дай подумать…", "F2"),
    ("Король у нас строгий, но справедливый.", "M1"), ("Хлеб — три монеты, свежий, утренний.", "M5"),
    ("Тронный зал прямо по улице, за воротами.", "F3"), ("Есть поднять паруса!", "M4"), ("На абордаж! Вперёд!", "M2"),
]


def tts_engine(threads):
    import sherpa_onnx as so
    import tts_native
    d = tts_native.model_dir() + os.sep
    F = tts_native.FILES
    m = so.OfflineTtsModelConfig()
    m.supertonic = so.OfflineTtsSupertonicModelConfig(duration_predictor=d + F[0], text_encoder=d + F[1], vector_estimator=d + F[2],
                                                      vocoder=d + F[3], tts_json=d + F[4], unicode_indexer=d + F[5], voice_style=d + F[6])
    m.num_threads = threads
    return so, so.OfflineTts(so.OfflineTtsConfig(model=m)), tts_native.VOICES


def say(so, tts, voices, text, voice="M2", steps=5):
    g = so.GenerationConfig()
    g.sid = voices.index(voice)
    g.speed = 1.0
    g.num_steps = steps
    try:
        g.extra = {"lang": "ru"}
    except Exception:  # noqa: BLE001
        pass
    t = time.perf_counter()
    a = tts.generate(text, g)
    return a, (time.perf_counter() - t) * 1000


def main():
    import numpy as np
    scen = json.load(open(sys.argv[1], encoding="utf-8"))
    threads = max(1, min(4, (os.cpu_count() or 4) // 4))  # (as tts_native.serve: the game's own setting)
    so, tts, voices = tts_engine(threads)
    say(so, tts, voices, "Да, конечно.")  # (warm-up, as the game does)
    out = {"cpu": os.cpu_count(), "tts_threads": threads, "tts": [], "asr": []}
    for text, v in REPLIES:
        a, ms = say(so, tts, voices, text, v)
        out["tts"].append({"text": text, "voice": v, "ms": round(ms, 1), "audio_ms": round(len(a.samples) / a.sample_rate * 1000)})
    import voice_native
    from livekit import rtc
    for sc in scen:
        a, _ = say(so, tts, voices, sc["say"], "M2")
        x = np.asarray(a.samples, np.float32)
        # (to 16 kHz, as the microphone's sound reaches the network)
        rs = rtc.AudioResampler(a.sample_rate, 16000, num_channels=1, quality=rtc.AudioResamplerQuality.HIGH)
        fr = [f for f in rs.push(bytearray((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()))] + list(rs.flush())
        y = np.concatenate([np.frombuffer(bytes(f.data), np.int16) for f in fr]).astype(np.float32) / 32768.0
        loud = np.nonzero(np.abs(y) > 0.02)[0]
        end = int(loud[-1]) if len(loud) else len(y)
        lead = np.zeros(int(0.5 * 16000), np.float32)  # (a moment of quiet before: the phrase starts as in a game)
        mic = np.concatenate([lead, y[:end + 1], np.zeros(int(1.6 * 16000), np.float32)])
        mic = mic * 0.5 + np.random.default_rng(7).normal(0, 0.0015, len(mic)).astype(np.float32)  # (a room's faint noise)
        evs = voice_native.offline(mic, threads=2)
        out["asr"].append({"id": sc["id"], "end_ms": round((len(lead) + end) / 16, 1),
                           "events": [e for e in evs if e.get("type") == "seg"]})
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
