import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHETYPES, ARCHETYPE_KEYS, archetypeOf, accentsOf, accentPulse, breathAfter, bodyLayer, newLayer, BODY_EMO } from '../../src/entities/Charisma.js';
import { EMOTION_KEYS } from '../../src/entities/Emotions.js';
import { GESTURES, GESTURE_IDS, pickGesture } from '../../src/entities/Gestures.js';

const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };

test('characters: roles get their manner, neighbours of one role differ, every archetype is complete', () => {
    assert.equal(archetypeOf('king', 5), 'solemn');
    assert.equal(archetypeOf('knight', 3), 'reserved');
    assert.equal(archetypeOf('merchant', 2), 'energetic');
    const farmers = new Set(Array.from({ length: 10 }, (_, i) => archetypeOf('farmer', i)));
    assert.ok(farmers.size >= 4, 'neighbours must not move the same');
    for (const k of ARCHETYPE_KEYS) {
        const a = ARCHETYPES[k];
        for (const n of ['amp', 'tempo', 'wide', 'sway', 'turn', 'nod', 'brow', 'mouth', 'blink', 'step']) assert.ok(a[n] > 0, `${k}.${n}`);
        for (const base of Object.keys(a.like)) assert.ok(GESTURE_IDS.some((id) => GESTURES[id].base === base), `${k}: нет жеста ${base}`);
    }
    assert.ok(ARCHETYPES.energetic.amp > ARCHETYPES.reserved.amp && ARCHETYPES.energetic.tempo > ARCHETYPES.solemn.tempo);
});

test('the stress falls on the long and shouted words, in time and not too often', () => {
    const a = accentsOf('Нет! Я НИКОГДА не продам вам этот волшебный меч, и не просите.', 5);
    assert.ok(a.t.length >= 3 && a.t.length <= 12, `${a.t.length}`);
    for (let i = 1; i < a.t.length; i++) assert.ok(a.t[i] - a.t[i - 1] >= 0.3);
    assert.ok(a.t.every((t) => t >= 0 && t <= a.end));
    assert.ok(accentPulse(a, a.t[0] + 0.06) > 0.4 && accentPulse(a, a.t[0] + 1.5) < accentPulse(a, a.t[0] + 0.06));
    assert.equal(accentPulse(a, -1), 0);
    assert.equal(accentPulse(null, 1), 0);
    assert.ok(breathAfter(a, a.end + 0.45) > 0.9 && breathAfter(a, a.end - 1) === 0 && breathAfter(a, a.end + 1) === 0);
    assert.deepEqual(accentsOf('', 3).t, []);
});

test('the body: every feeling is finite and small, the stress moves the head and the hand, the sleeper-proof ranges hold', () => {
    const o = newLayer();
    for (const emo of EMOTION_KEYS) for (const k of ARCHETYPE_KEYS) for (let t = 0; t < 12; t += 0.07) {
        bodyLayer(o, { t, ch: ARCHETYPES[k], emo, seed: 7, talk: true, listen: t > 6, acc: (t * 3) % 1, breath: 0.5, since: t % 2 });
        for (const key in o) assert.ok(Number.isFinite(o[key]) && Math.abs(o[key]) < (key === "brow" || key === "mouth" ? 2 : 1.2), `${emo}/${k}/${key}=${o[key]}`);
    }
    const still = bodyLayer(newLayer(), { t: 3, emo: 'neutral', acc: 0 }), hit = bodyLayer(newLayer(), { t: 3, emo: 'neutral', acc: 1 });
    assert.ok(hit.headX > still.headX + 0.1 && hit.beat > still.beat && hit.brow > still.brow);
    for (const e of Object.keys(BODY_EMO)) assert.ok(EMOTION_KEYS.includes(e), e);
});

test('the neighbours do not move in step: the same moment, other seeds, other poses', () => {
    const a = bodyLayer(newLayer(), { t: 5, emo: 'happy', seed: 3, talk: true }), b = bodyLayer(newLayer(), { t: 5, emo: 'happy', seed: 41, talk: true });
    assert.notEqual(a.hz, b.hz);
    // blinks happen, but not always
    let n = 0, on = 0;
    for (let t = 0; t < 60; t += 0.04) { n++; if (bodyLayer(newLayer(), { t, seed: 9 }).blink > 0.5) on++; }
    assert.ok(on / n > 0.01 && on / n < 0.12, `${on / n}`);
});

test('a start back at fear; the laugh shakes the whole body; anger leans in', () => {
    const fear = bodyLayer(newLayer(), { t: 1, emo: 'afraid', since: 0.3 });
    assert.ok(fear.hx < -0.2 && fear.beat > 0.3);
    let amp = 0;
    for (let t = 0; t < 2; t += 0.03) amp = Math.max(amp, Math.abs(bodyLayer(newLayer(), { t, emo: 'laugh' }).hz));
    assert.ok(amp > 0.05);
    assert.ok(bodyLayer(newLayer(), { t: 1, emo: 'angry' }).hx > 0.1);
});

test('the character chooses: the trader opens his arms, the guard stands behind his back; the sword hand is not asked', () => {
    const count = (ch) => { const rng = rngOf(3), m = new Map(); for (let i = 0; i < 600; i++) { const g = pickGesture({ ctx: 'answer', emo: 'neutral', rng, like: ch.like, more: ch.gestMax, wideK: ch.wide, lively: 1.2 }); if (g) m.set(g.base, (m.get(g.base) || 0) + 1); } return m; };
    const tr = count(ARCHETYPES.energetic), gd = count(ARCHETYPES.reserved);
    const show = (m) => (m.get('open_arms') || 0) + (m.get('explain_big') || 0) + (m.get('both_beat') || 0);
    assert.ok(show(tr) > show(gd) * 2, `${show(tr)} vs ${show(gd)}`);
    assert.ok((gd.get('behind_back') || 0) + (gd.get('salute') || 0) > (tr.get('behind_back') || 0) + (tr.get('salute') || 0));
});
