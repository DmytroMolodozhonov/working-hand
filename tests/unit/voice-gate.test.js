import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceGate, mouthOpenness } from '../../src/game/VoiceGate.js';

/** A face (478 points) with the mouth open by `open` of its width. */
function face(open) {
    const f = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    f[61] = { x: 0.45, y: 0.6, z: 0 }; f[291] = { x: 0.55, y: 0.6, z: 0 };
    f[13] = { x: 0.5, y: 0.6 - open * 0.05, z: 0 }; f[14] = { x: 0.5, y: 0.6 + open * 0.05, z: 0 };
    return f;
}

test('mouth: how open, of its width', () => {
    assert.ok(Math.abs(mouthOpenness(face(0.3)) - 0.3) < 1e-9);
    assert.equal(mouthOpenness(null), null);
});

test('mouth: a head tipped up or down at the fight still shows the mouth opening (3D, not the flat picture)', () => {
    // the head pitched back by 50°: the lip gap, which was vertical, now runs along the line of sight (z), so the flat picture sees it ×cos
    const pitch = (open, a) => {
        const f = face(open), c = Math.cos(a), s = Math.sin(a);
        for (const i of [13, 14, 61, 291]) { const p = f[i], dy = p.y - 0.6; f[i] = { x: p.x, y: 0.6 + dy * c, z: dy * s }; }
        return f;
    };
    const flat = (f) => Math.hypot(f[13].x - f[14].x, f[13].y - f[14].y) / Math.hypot(f[61].x - f[291].x, f[61].y - f[291].y);
    const f = pitch(0.3, 0.87);
    assert.ok(flat(f) < 0.22, `the flat picture loses it: ${flat(f)}`);
    assert.ok(Math.abs(mouthOpenness(f) - 0.3) < 1e-9, `3D keeps it: ${mouthOpenness(f)}`);
});

test('voice gate: my own spell (my lips moved) is cast; a friend\'s voice heard by my microphone is not', () => {
    const g = new VoiceGate();
    let t = 0;
    // 3 s of a closed mouth (I am silent; the friend speaks in my headphones)
    for (let i = 0; i < 60; i++) g.noteFace((t += 50), mouthOpenness(face(0.02 + (i % 3) * 0.005)));
    assert.deepEqual(g.check('Bombardo', t), { ok: false, why: 'lips' });
    // now I say it: the mouth opens and closes
    for (let i = 0; i < 30; i++) g.noteFace((t += 50), mouthOpenness(face(i % 6 < 3 ? 0.3 : 0.05)));
    assert.deepEqual(g.check('Bombardo', t), { ok: true, sure: true });
});

test('voice gate: the mouth not seen (a hand before the face) — only the echo of a friend\'s spell is stopped', () => {
    const g = new VoiceGate();
    let t = 0;
    for (let i = 0; i < 60; i++) g.noteFace((t += 50), null);
    assert.deepEqual(g.check('Inferno', t), { ok: true, sure: false }, 'can\'t tell: let it be (the game waits a moment for a friend\'s word)');
    g.noteRemote('BombardoMaxima', t - 500); // the friend just cast it
    assert.deepEqual(g.check('Bombardo', t), { ok: false, why: 'echo' });
    g.noteRemote('SapiraDuel', t - 400);
    assert.equal(g.check('Sapira', t).why, 'echo', 'a duel charge too');
    assert.equal(g.check('Inferno', t).ok, true, 'another spell is mine');
    assert.equal(g.check('Bombardo', t + 5000).ok, true, 'later: mine again');
});

test('voice gate: a friend said the same spell, but my lips moved too — mine is cast', () => {
    const g = new VoiceGate();
    let t = 0;
    for (let i = 0; i < 40; i++) g.noteFace((t += 50), mouthOpenness(face(i % 4 < 2 ? 0.35 : 0.04)));
    g.noteRemote('Stupefy', t - 300);
    assert.deepEqual(g.check('Stupefy', t), { ok: true, sure: true });
});

test('voice gate: I talked a moment ago, then a friend\'s spell came from my speakers — not mine', () => {
    const g = new VoiceGate();
    let t = 0;
    // chatting with the friend (the mouth moves) …
    for (let i = 0; i < 20; i++) g.noteFace((t += 50), mouthOpenness(face(i % 4 < 2 ? 0.35 : 0.04)));
    // … then 1.6 s listening, the mouth shut, while the friend says «Бомбардо»
    for (let i = 0; i < 32; i++) g.noteFace((t += 50), mouthOpenness(face(0.03)));
    g.noteRemote('Bombardo', t - 100); // (their word came over the network)
    assert.deepEqual(g.check('Bombardo', t), { ok: false, why: 'echo' });
});

test('voice gate: a jumpy picture of a shut mouth (one odd frame) is not speaking', () => {
    const g = new VoiceGate();
    let t = 0;
    for (let i = 0; i < 50; i++) g.noteFace((t += 50), mouthOpenness(face(i === 30 ? 0.4 : 0.03)));
    assert.deepEqual(g.check('Bombardo', t), { ok: false, why: 'lips' });
});

/** The microphone's level every 50 ms: loud (a voice) where `loudAt(t)`. */
function levels(t0, t1, loudAt) {
    const out = [];
    for (let t = t0; t <= t1; t += 50) out.push([t, loudAt(t) ? -30 : -58]);
    return out;
}

test('voice gate: my mouth moved WITH the voice the microphone heard — mine; a friend\'s voice while my mouth rests — not mine', () => {
    const floor = -60;
    // a friend says «Бомбардо» from my speakers (loud 1.0–1.8 s); my mouth shut, the picture a little jumpy
    {
        const g = new VoiceGate();
        for (let t = 0; t <= 2500; t += 50) g.noteFace(t, mouthOpenness(face(0.03 + ((t / 50) % 3) * 0.01)));
        const mic = { levels: levels(0, 2500, (t) => t > 1000 && t < 1800), floor };
        assert.deepEqual(g.check('Bombardo', 2500, mic), { ok: false, why: 'lips' });
    }
    // the same, but I had been chatting just before (the mouth moved at 0–0.8 s, quietly) — still not mine
    {
        const g = new VoiceGate();
        for (let t = 0; t <= 2500; t += 50) g.noteFace(t, mouthOpenness(face(t < 800 ? ((t / 50) % 4 < 2 ? 0.3 : 0.05) : 0.03)));
        const mic = { levels: levels(0, 2500, (t) => t > 1000 && t < 1800), floor };
        assert.deepEqual(g.check('Bombardo', 2500, mic), { ok: false, why: 'lips' });
    }
    // I say it: the mouth opens while the voice is loud (the picture ~0.1 s behind)
    {
        const g = new VoiceGate();
        for (let t = 0; t <= 2500; t += 50) { const real = t - 100; g.noteFace(t, mouthOpenness(face(real > 1000 && real < 1800 ? ((t / 50) % 3 ? 0.3 : 0.12) : 0.03))); }
        const mic = { levels: levels(0, 2500, (t) => t > 1000 && t < 1800), floor };
        assert.deepEqual(g.check('Bombardo', 2500, mic), { ok: true, sure: true });
        g.noteRemote('Bombardo', 2400); // (even if a friend said the same just now)
        assert.equal(g.check('Bombardo', 2500, mic).ok, true);
    }
    // the face not seen: the old checks decide
    {
        const g = new VoiceGate();
        for (let t = 0; t <= 2500; t += 50) g.noteFace(t, null);
        const mic = { levels: levels(0, 2500, (t) => t > 1000 && t < 1800), floor };
        assert.deepEqual(g.check('Bombardo', 2500, mic), { ok: true, sure: false });
    }
});
