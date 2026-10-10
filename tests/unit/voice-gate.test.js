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

test('voice gate: my own spell (my lips moved) is cast; a friend\'s voice heard by my microphone is not', () => {
    const g = new VoiceGate();
    let t = 0;
    // 3 s of a closed mouth (I am silent; the friend speaks in my headphones)
    for (let i = 0; i < 60; i++) g.noteFace((t += 50), mouthOpenness(face(0.02 + (i % 3) * 0.005)));
    assert.deepEqual(g.check('Bombardo', t), { ok: false, why: 'lips' });
    // now I say it: the mouth opens and closes
    for (let i = 0; i < 30; i++) g.noteFace((t += 50), mouthOpenness(face(i % 6 < 3 ? 0.3 : 0.05)));
    assert.deepEqual(g.check('Bombardo', t), { ok: true });
});

test('voice gate: the mouth not seen (a hand before the face) — only the echo of a friend\'s spell is stopped', () => {
    const g = new VoiceGate();
    let t = 0;
    for (let i = 0; i < 60; i++) g.noteFace((t += 50), null);
    assert.deepEqual(g.check('Inferno', t), { ok: true }, 'can\'t tell: let it be');
    g.noteRemote('BombardoMaxima', t - 500); // the friend just cast it
    assert.deepEqual(g.check('Bombardo', t), { ok: false, why: 'echo' });
    g.noteRemote('SapiraDuel', t - 400);
    assert.equal(g.check('Sapira', t).why, 'echo', 'a duel charge too');
    assert.deepEqual(g.check('Inferno', t), { ok: true }, 'another spell is mine');
    assert.deepEqual(g.check('Bombardo', t + 5000), { ok: true }, 'later: mine again');
});

test('voice gate: a friend said the same spell, but my lips moved too — mine is cast', () => {
    const g = new VoiceGate();
    let t = 0;
    for (let i = 0; i < 40; i++) g.noteFace((t += 50), mouthOpenness(face(i % 4 < 2 ? 0.35 : 0.04)));
    g.noteRemote('Stupefy', t - 300);
    assert.deepEqual(g.check('Stupefy', t), { ok: true });
});
