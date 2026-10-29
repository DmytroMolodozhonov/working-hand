#!/usr/bin/env python3
"""
echobench — the friend's voice from my speakers against my spells, with the game's voice chat and with Discord
(the author: «звук друга откликается эхом… это реально сильно влияет на игру… чуть ли не на 100 % бенчмарке, с учётом шумов»).

Real synthetic voices (Piper, as bench.py), a real room (delay, reflections, tail, a little distortion — bench.room), noises, and
the very pipeline of the game (voice_native.offline: echo canceller, VAD, speech network). Unlike bench.py, the speakers' copy
(«loopback») is NOT given to the network by default — the hardest case (a Mac, a browser): what tells the friend's voice from mine
is only what the game knows itself (src/audio/EchoGuard.js):
  'play'  the friend's voice as the game's voice chat plays it here (the exact copy),
  'net'   the friend's own voice as HIS game heard it, sent over the network (his clock: a shift and jitter; Discord adds its delay),
  'spk'   with --loopback: everything in the speakers (Windows).

Scenes (each: --n spells of mine, the friend's talk / spells, a noise):
  ingame        the friend talks over the game's voice chat, I cast between and over his phrases
  ingamespell   the friend says spell words over the game's voice chat, I am silent — not one may cast
  discord       the friend talks over Discord (100–400 ms of Discord's delay), I cast between and over
  discordspell  the friend says spell words over Discord, I am silent — not one may cast
  noise         as «ingame», with a fan, keys and the game's music in the room
  delay         as «ingamespell» + my spells, the echo's delay from 40 to 300 ms, rooms from small to big
  doubletalk    I shout spells right over his phrases (game chat), he talks 90 % of the time

  python tools/voicebench/echobench.py [--scene all] [--seed 1] [--n 16] [--out /tmp/eb] [--loopback]
  node tools/voicebench/echoeval.mjs /tmp/eb [--check] [--why scene]
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
import bench as B  # noqa: E402

SR = B.SR
F = SR // 100  # 10 ms


def env_db(x):
    """10 ms levels (dBFS) — as the game's meters measure them (RMS of each 10 ms)."""
    n = len(x) // F
    y = x[: n * F].reshape(n, F)
    return np.round(20 * np.log10(np.sqrt(np.mean(y * y, axis=1)) + 1e-9), 1)


def pink(rng, n, db):
    w = rng.standard_normal(n).astype(np.float32)
    s = np.fft.rfft(w)
    f = np.arange(len(s))
    s[1:] /= np.sqrt(f[1:])
    s[0] = 0
    p = np.fft.irfft(s, n).astype(np.float32)
    return B.level(p, db)


def keys(rng, n, db, rate=4.0):
    """Keyboard / mouse clicks: short bursts."""
    out = np.zeros(n, np.float32)
    t = 0
    while True:
        t += int(rng.exponential(SR / rate))
        if t >= n - 400:
            break
        k = rng.integers(80, 300)
        out[t:t + k] += rng.standard_normal(k).astype(np.float32) * np.exp(-np.arange(k) / (k / 4)) * 10 ** (db / 20)
    return out


def music(rng, n, db):
    """The game's own music: a few tones with a slow tune (it goes out of the speakers too: the 'game' copy)."""
    t = np.arange(n) / SR
    y = np.zeros(n, np.float32)
    for k, f0 in enumerate([220, 277, 330, 440]):
        am = 0.5 + 0.5 * np.sin(2 * np.pi * (0.2 + 0.07 * k) * t + rng.uniform(0, 6))
        y += (np.sin(2 * np.pi * f0 * t) * am).astype(np.float32)
    return B.level(y, db)


def scene(name, voices, seed, n=16):
    rng = np.random.default_rng(seed)
    P = dict(
        ingame=dict(path='play', share=0.55, gain=-10, rt60=0.3, delay=(40, 120), between=True),
        ingamespell=dict(path='play', share=0.5, gain=-8, rt60=0.35, delay=(40, 160), silent=True, spells=True),
        discord=dict(path='net', share=0.55, gain=-10, rt60=0.3, delay=(40, 120), between=True, discord=(100, 400)),
        discordspell=dict(path='net', share=0.5, gain=-8, rt60=0.35, delay=(40, 160), silent=True, spells=True, discord=(100, 400)),
        noise=dict(path='play', share=0.6, gain=-9, rt60=0.4, delay=(60, 200), between=False, noise=True),
        delay=dict(path='play', share=0.5, gain=-7, rt60=0.6, delay=(40, 300), between=True, spells=True),
        doubletalk=dict(path='play', share=0.9, gain=-9, rt60=0.3, delay=(40, 120), between=False),
    )[name]
    gap = 6.0
    total = int((n * gap + 6) * SR)
    texts = B.FRIEND_SPELLS if P.get('spells') else B.CHAT
    # the friend's own voice at HIS microphone (his time) — what his game hears and sends ('net')
    fv, marks = B.friend_track(voices, rng, total, texts, P['share'])
    if P.get('spells') and not P.get('silent'):
        # (his spells and his talk both: half each)
        fv2, marks2 = B.friend_track(voices, np.random.default_rng(seed + 7), total, B.CHAT, P['share'] * 0.5)
        fv = fv + fv2
        marks = sorted(marks + marks2)
    dl = 0
    if P.get('discord'):
        dl = int(rng.uniform(*P['discord']) * SR / 1000)  # Discord's own delay to my speakers
    spk = np.zeros(total, np.float32)
    spk[dl:] = fv[: total - dl]
    d_ms = rng.uniform(*P['delay'])
    echo = B.room(spk, rng, P['gain'], d_ms, P['rt60'], 0.8)
    mic = echo.copy()
    truth = {'spells': [], 'friend': [{'t0': a + dl / SR, 't1': b + dl / SR, 'text': s} for a, b, s in marks], 'delay': round(d_ms), 'discord': round(dl * 1000 / SR)}
    game = np.zeros(total, np.float32)
    if P.get('noise'):
        mic += pink(rng, total, -48)
        mic += keys(rng, total, -40)
        game = music(rng, total, -30)
        mic += B.room(game, rng, -14, d_ms, P['rt60'], 0.5)
    if not P.get('silent'):
        t = int(2.0 * SR)
        for i in range(n):
            text = B.SPELLS[(i * 3 + seed) % len(B.SPELLS)]
            clip = B.level(voices.say(B.PLAYER[i % len(B.PLAYER)], text, rng.uniform(0.95, 1.15)), rng.uniform(-30, -24))
            if P.get('between') and i % 2 == 0:
                t = int(B.quiet_gap(truth['friend'], t / SR, len(clip) / SR) * SR)
            elif not P.get('between'):
                # (right over one of his phrases)
                over = [m for m in truth['friend'] if m['t0'] * SR > t]
                if over:
                    t = int((over[0]['t0'] + rng.uniform(0.1, 0.6)) * SR)
            if t + len(clip) > total - SR:
                break
            B.place(mic, clip, t)
            truth['spells'].append({'t0': t / SR, 't1': (t + len(clip)) / SR, 'text': text})
            t += len(clip) + int(rng.uniform(2.6, 4.2) * SR)
    mic += (rng.standard_normal(total) * 10 ** (-70 / 20)).astype(np.float32)
    mic = np.clip(mic, -1, 1)
    # the copies the game knows (10 ms levels, in MY clock, ms)
    refs = {}
    if P['path'] == 'play':
        refs['play:F'] = {'kind': 'play', 't0': 0, 'db': env_db(spk).tolist()}
    else:
        # his game sends only his own voice (frames his detector took for speech); his clock → mine: the shortest way
        # (20–80 ms) is in the offset the game finds, the rest is jitter per message
        db = env_db(fv)
        his_floor = -70
        db = np.where(db > his_floor + 20, db, -120)
        shift = rng.uniform(20, 80)
        refs['net:F'] = {'kind': 'net', 't0': shift, 'db': db.tolist(), 'jitter': 15}
    if P.get('noise'):
        refs['game'] = {'kind': 'game', 't0': 0, 'db': env_db(game).tolist()}
    return mic, spk, truth, refs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scene', default='all')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--n', type=int, default=16)
    ap.add_argument('--out', default=os.path.join(os.environ.get('TMPDIR', '/tmp'), 'echobench'))
    ap.add_argument('--voices', default=os.environ.get('ZNS_BENCH_VOICES', os.path.join(os.path.expanduser('~'), '.cache', 'zns-voicebench')))
    ap.add_argument('--loopback', action='store_true', help="give the network the speakers' copy (Windows)")
    a = ap.parse_args()
    import voice_native as vn
    voices = B.Voices(a.voices, os.path.join(a.voices, 'cache'))
    names = ['ingame', 'ingamespell', 'discord', 'discordspell', 'noise', 'delay', 'doubletalk'] if a.scene == 'all' else a.scene.split(',')
    os.makedirs(a.out, exist_ok=True)
    for nm in names:
        mic, spk, truth, refs = scene(nm, voices, a.seed, n=a.n)
        ev = vn.offline(mic, spk if a.loopback else None)
        if a.loopback:
            refs['spk'] = {'kind': 'spk', 't0': 0, 'db': env_db(spk).tolist()}
        lv = getattr(vn.offline, 'levels', None) or {}
        with open(os.path.join(a.out, nm + '.json'), 'w') as f:
            # (mic: what the recognizer heard — the cleaned sound where the echo canceller had the speakers' copy, as the game's
            # native levels give it; micRaw: the microphone as it is)
            clean = lv.get('db') if a.loopback and lv.get('db') else env_db(mic).tolist()
            json.dump({'scene': nm, 'events': ev, 'truth': truth, 'seconds': len(mic) / SR, 'mic': {'t0': 0, 'db': clean}, 'micRaw': {'t0': 0, 'db': env_db(mic).tolist()}, 'refs': refs, 'loopback': a.loopback}, f)
        print(nm, 'events', len(ev), 'spells', len(truth['spells']), 'friend', len(truth['friend']), 'delay', truth['delay'], file=sys.stderr)


if __name__ == '__main__':
    main()
