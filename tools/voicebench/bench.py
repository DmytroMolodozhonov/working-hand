#!/usr/bin/env python3
"""
voicebench — the voice against a friend talking over Discord (the author: «Дискорд не мешает, как в стандартном отклике»).

Makes scenes with synthetic voices (Piper, the same Russian voices the speech network is tested with) and runs them through
voice_native.offline() — the very pipeline of the game (echo canceller, VAD, speech network):

  clean       the player says spells, nothing plays in the speakers (the standard: what the voice must still do with Discord on)
  chat        a friend talks over Discord (speakers), the player says spells between his phrases
  overlap     the same, but the player shouts the spell while the friend is talking
  friendspell the friend says spell words (Discord), the player is silent: not a single spell may be cast
  loud        like overlap, the room is louder and more echoey (loud speakers, a big room)
  ship        no friend: the game's own sea on the speakers (wind, waves, creaking, cannon shots) — a fight at sea (the author's journal: almost no
              spell was cast at the wheel of a ship); the speakers' sound is also the reference (`ref`), as in the game

The speakers' sound reaches the microphone through a room (delay, early reflections, a reverberant tail, a little distortion);
the canceller gets the clean copy («loopback»). Output: events (the pipeline's) + truth, then `node tools/voicebench/eval.mjs`
judges them with the game's own code (lookAt, spellPhrase, soundTrust) and prints recognized / false casts / delay.

  python tools/voicebench/bench.py [--scene all] [--seed 1] [--out /tmp/vb] [--variant name]

Needs: pip install numpy onnxruntime livekit sherpa-onnx piper-tts ; the speech network (voice_native downloads it);
voices (ru_RU-denis/dmitri/irina-medium from the sherpa-onnx «tts-models» release) are downloaded to --voices on the first run.
"""
import argparse
import glob
import json
import os
import random
import sys
import tarfile
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, ROOT)
SR = 16000
VOICE_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-ru_RU-%s-medium.tar.bz2"

SPELLS = ["бомбардо", "акцио", "люмос", "вингардиум левиоса", "алохомора", "экспеллиармус", "инферно", "нокс", "джолт", "сапира",
          "бомбардо максима", "вайнд", "стоп", "файр", "ап", "остолбеней", "протекшн", "флайн", "криейт э бридж", "раскрой свои секреты"]
CHAT = ["привет как дела", "ну давай быстрее сюда", "смотри что у меня есть", "я сейчас подойду к тебе", "ты видел этого дракона",
        "подожди меня у башни", "блин опять умер", "у меня почти нет маны", "иди сюда тут сундук", "а что там у тебя",
        "давай я тебе помогу", "слушай мне надо отойти на минуту", "ночь наступает надо идти", "нет подожди не туда",
        "ну это было круто", "где ты вообще находишься", "я нашёл новую палочку", "сейчас покажу как это работает",
        "не торопись мы успеем", "посмотри налево там замок"]
PLAYER = ["irina", "ruslan"]  # (the voices the speech network is tuned and tested with: tests/fixtures/voice-spells.json)
FRIEND = "dmitri"
FRIEND_SPELLS = ["акцио", "бомбардо", "люмос", "стоп", "экспеллиармус", "бомбардо максима", "вайнд", "файр", "джолт", "вингардиум левиоса"]


def voice_dir(name, base):
    d = os.path.join(base, "vits-piper-ru_RU-%s-medium" % name)
    if not os.path.isdir(d):
        os.makedirs(base, exist_ok=True)
        tgz = d + ".tar.bz2"
        print("скачиваю голос", name, "…", file=sys.stderr)
        urllib.request.urlretrieve(VOICE_URL % name, tgz)
        with tarfile.open(tgz) as t:
            t.extractall(base)
        os.remove(tgz)
    return d


class Voices:
    def __init__(self, base, cache):
        self.base, self.cache, self.v = base, cache, {}
        os.makedirs(cache, exist_ok=True)

    def say(self, who, text, speed=1.0):
        """Speech of `who` saying `text`: 16 kHz float32, trimmed of silence."""
        key = os.path.join(self.cache, "%s_%s_%.2f.npy" % (who, text.replace(" ", "_"), speed))
        if os.path.exists(key):
            return np.load(key)
        from piper import PiperVoice, SynthesisConfig
        if who not in self.v:
            self.v[who] = PiperVoice.load(glob.glob(os.path.join(voice_dir(who, self.base), "*.onnx"))[0])
        v = self.v[who]
        a = np.concatenate([c.audio_float_array for c in v.synthesize(text, SynthesisConfig(length_scale=1.0 / speed))]).astype(np.float32)
        a = resample(a, v.config.sample_rate, SR)
        nz = np.where(np.abs(a) > 0.01 * np.max(np.abs(a)))[0]
        a = a[max(0, nz[0] - 160): nz[-1] + 160] if len(nz) else a
        np.save(key, a)
        return a


def resample(a, sr, to):
    if sr == to:
        return a
    n = int(len(a) * to / sr)
    return np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32)


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x * x)) + 1e-9)


def level(x, db):
    """Speech `x` to `db` dBFS RMS (while it speaks)."""
    return x * (10 ** ((db - rms_db(x)) / 20))


def room(ref, rng, gain_db, delay_ms, rt60, dist):
    """What the microphone hears of the speakers' sound: the speaker's tone, a delay, early reflections, a tail, a little distortion."""
    # the speaker: no bass, soft clipping
    x = ref - np.concatenate([[0], ref[:-1]]) * 0.0
    x = np.tanh(x * (1.0 + dist)) / (1.0 + dist * 0.2)
    n = int(SR * (rt60 * 1.2))
    t = np.arange(n) / SR
    rir = rng.standard_normal(n).astype(np.float32) * np.exp(-6.9 * t / rt60)
    rir[: int(0.004 * SR)] *= 0.1
    rir /= np.sqrt(np.sum(rir * rir)) + 1e-9
    h = np.zeros(int(SR * (delay_ms / 1000.0)) + n, np.float32)
    d0 = int(SR * delay_ms / 1000.0)
    h[d0] = 1.0
    h[d0:d0 + n] += rir * 0.6
    for k, (ms, g) in enumerate([(3.1, 0.35), (7.7, 0.25), (13.0, 0.18)]):
        h[d0 + int(ms * SR / 1000)] += g * (1 if k % 2 == 0 else -1)
    y = fft_conv(x, h)[: len(x)]
    return (y * 10 ** (gain_db / 20)).astype(np.float32)


def fft_conv(x, h):
    n = len(x) + len(h) - 1
    m = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(h, m), m)[:n].astype(np.float32)


def place(track, clip, at):
    end = min(len(track), at + len(clip))
    if end > at:
        track[at:end] += clip[: end - at]


def friend_track(voices, rng, total, texts, share, who=FRIEND):
    """The friend's phrases (what Discord plays): `share` of the time he talks. → (track, [(t0, t1, text)])."""
    ref = np.zeros(total, np.float32)
    marks, t = [], int(rng.uniform(0.3, 1.5) * SR)
    while t < total - 3 * SR:
        text = rng.choice(texts)
        clip = level(voices.say(who, text, rng.uniform(0.95, 1.2)), rng.uniform(-27, -22))
        place(ref, clip, t)
        marks.append((t / SR, (t + len(clip)) / SR, text))
        t += len(clip) + int(rng.exponential(len(clip) * (1 - share) / max(share, 0.05)) + 0.2 * SR)
    return ref, marks


LAST = {}  # (the last scene's parts, for analysis: 'player' — his voice alone, 'echo' — what the room made of the speakers)


def ship_sound(rng, total):
    """The game's sea as the speakers play it: wind (low noise swelling and fading), waves (a slow pulse), a creak now and then, and a cannon
    shot every 5–9 s (a low thump with a crack), loud: -14 dBFS peaks."""
    t = np.arange(total) / SR
    n = rng.standard_normal(total).astype(np.float32)
    wind = np.convolve(n, np.ones(24, np.float32) / 24, mode="same")  # (lows)
    wind *= (0.5 + 0.5 * np.sin(2 * np.pi * t / 7.0 + rng.uniform(0, 6)))
    wave = np.convolve(n, np.ones(160, np.float32) / 160, mode="same") * (0.6 + 0.4 * np.sin(2 * np.pi * t / 3.2))
    out = wind * 10 ** (-24 / 20) + wave * 10 ** (-20 / 20)
    k = 3.0
    while k < total / SR - 1.5:
        i = int(k * SR)
        m = min(int(1.2 * SR), total - i)
        tt = np.arange(m) / SR
        thump = np.sin(2 * np.pi * (95 - 40 * tt) * tt) * np.exp(-5.5 * tt) + rng.standard_normal(m).astype(np.float32) * 0.5 * np.exp(-30 * tt)
        out[i:i + m] += (thump * 10 ** (-14 / 20)).astype(np.float32)
        k += rng.uniform(5.0, 9.0)
    return out.astype(np.float32)


def scene(name, voices, seed, spells=SPELLS, n=20):
    rng = np.random.default_rng(seed)
    pyr = random.Random(seed)
    friend_on = name != "clean"
    gap = 9.0 if name == "chat" else 5.0
    total = int((n * gap + 4) * SR)
    mic = np.zeros(total, np.float32)
    ref = np.zeros(total, np.float32)
    LAST.clear()
    truth = {"spells": [], "friend": []}
    par = dict(clean=dict(friend=False), chat=dict(friend=True, share=0.55, gain=-10, rt60=0.25, delay=45, dist=0.6),
               overlap=dict(friend=True, share=0.85, gain=-10, rt60=0.25, delay=45, dist=0.6),
               friendspell=dict(friend=True, share=0.5, gain=-10, rt60=0.25, delay=45, dist=0.6, spells_friend=True, silent=True),
               loud=dict(friend=True, share=0.85, gain=-4, rt60=0.45, delay=70, dist=1.5),
               ship=dict(friend=False, ship=True, gain=-6, rt60=0.3, delay=40, dist=1.0),
               # (a duel over Discord: the friend answers with the SAME spell just before or after mine — his echo must not
               # cast, mine must not be taken for his echo: SpellSpotter ECHO_AFTER, docs/qa/multiplayer-report.md V-02)
               duel=dict(friend=True, gain=-10, rt60=0.25, delay=45, dist=0.6, duel=True))[name]
    texts = FRIEND_SPELLS if par.get("spells_friend") else CHAT
    if par.get("ship"):
        ref = ship_sound(rng, total)
        echo = room(ref, rng, par["gain"], par["delay"] + rng.uniform(-8, 8), par["rt60"], par["dist"])
        mic += echo
        LAST["echo"] = echo
    if par["friend"] and not par.get("duel"):
        ref, marks = friend_track(voices, rng, total, texts, par["share"])
        if name != "chat":
            pass
        truth["friend"] = [{"t0": a, "t1": b, "text": s} for a, b, s in marks]
        echo = room(ref, rng, par["gain"], par["delay"] + rng.uniform(-8, 8), par["rt60"], par["dist"])
        mic += echo
        LAST["echo"] = echo
    if not par.get("silent"):
        t = int(2.0 * SR)
        for i in range(n):
            text = spells[i % len(spells)]
            clip = level(voices.say(PLAYER[i % len(PLAYER)], text, rng.uniform(0.95, 1.15)), rng.uniform(-30, -24))
            if name == "chat" and truth["friend"]:
                # between his phrases: the nearest quiet gap at least as long as the spell
                t = quiet_gap(truth["friend"], t / SR, len(clip) / SR) * SR
                t = int(t)
            if t + len(clip) > total - SR:
                break
            place(mic, clip, t)
            place(LAST.setdefault("player", np.zeros(total, np.float32)), clip, t)
            truth["spells"].append({"t0": t / SR, "t1": (t + len(clip)) / SR, "text": text})
            t += len(clip) + int(rng.uniform(3.2, 5.0) * SR)
    if par.get("duel"):
        for s in truth["spells"]:
            clip = level(voices.say(FRIEND, s["text"], rng.uniform(0.95, 1.2)), rng.uniform(-27, -22))
            t = int((s["t0"] + rng.uniform(-1.0, 1.2)) * SR)
            if t < 0 or t + len(clip) > total:
                continue
            place(ref, clip, t)
            truth["friend"].append({"t0": t / SR, "t1": (t + len(clip)) / SR, "text": s["text"]})
        echo = room(ref, rng, par["gain"], par["delay"] + rng.uniform(-8, 8), par["rt60"], par["dist"])
        mic += echo
        LAST["echo"] = echo
    mic += (rng.standard_normal(total) * 10 ** (-70 / 20)).astype(np.float32)  # the room's hiss
    return np.clip(mic, -1, 1), np.clip(ref, -1, 1), truth


def quiet_gap(friend, t, need):
    """The first time ≥ t with `need` s (+0.4) of quiet in the friend's talk."""
    t += 0.0
    for _ in range(100):
        busy = [m for m in friend if m["t0"] - 0.3 < t + need and m["t1"] + 0.3 > t]
        if not busy:
            return t
        t = max(m["t1"] for m in busy) + 0.3
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", default="all")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--n", type=int, default=20, help="spells per scene")
    ap.add_argument("--out", default=os.path.join(os.environ.get("TMPDIR", "/tmp"), "voicebench"))
    ap.add_argument("--voices", default=os.environ.get("ZNS_BENCH_VOICES", os.path.join(os.path.expanduser("~"), ".cache", "zns-voicebench")))
    ap.add_argument("--no-aec", action="store_true")
    a = ap.parse_args()
    import voice_native as vn
    voices = Voices(a.voices, os.path.join(a.voices, "cache"))
    names = ["clean", "chat", "overlap", "friendspell", "loud", "ship", "duel"] if a.scene == "all" else a.scene.split(",")
    os.makedirs(a.out, exist_ok=True)
    for nm in names:
        mic, ref, truth = scene(nm, voices, a.seed, n=a.n)
        has_ref = nm != "clean"
        ev = vn.offline(mic, ref if has_ref else None, aec=not a.no_aec)
        with open(os.path.join(a.out, nm + ".json"), "w") as f:
            json.dump({"scene": nm, "events": ev, "truth": truth, "seconds": len(mic) / SR}, f)
        print(nm, "events", len(ev), "spells", len(truth["spells"]), "friend", len(truth["friend"]), file=sys.stderr)


if __name__ == "__main__":
    main()
