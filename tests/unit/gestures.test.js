import test from 'node:test';
import assert from 'node:assert/strict';
import { GESTURES, GESTURE_IDS, CONTEXTS, pickGesture, gesturePose, envelope } from '../../src/entities/Gestures.js';
import { EMOTIONS, EMOTION_KEYS, emotionOf, blendFace, quantFace, faceKey, EVENT_KEYS } from '../../src/entities/Emotions.js';
import { ctxOfLine, stateOf, mark } from '../../src/game/GestureLife.js';

const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };
const T0 = () => ({ hx: 0, hy: 0, hz: 0, headX: 0, headY: 0, headZ: 0, aLX: 0, aLZ: -0.06, aRX: 0, aRY: 0, aRZ: 0.06, wrist: -0.3 });

test('there are a hundred and more different gestures', () => {
    assert.ok(GESTURE_IDS.length >= 100, `только ${GESTURE_IDS.length}`);
    assert.equal(new Set(GESTURE_IDS).size, GESTURE_IDS.length);
    for (const id of GESTURE_IDS) {
        const g = GESTURES[id];
        assert.ok(g.ru && g.dur > 0.5 && g.ctx.length && g.emo.length, id);
        for (const e of g.emo) assert.ok(EMOTIONS[e], `${id}: чувство ${e}`);
        for (const c of g.ctx) assert.ok(CONTEXTS.includes(c), `${id}: ситуация ${c}`);
    }
});

test('every situation and every feeling has gestures that fit it', () => {
    for (const c of CONTEXTS) assert.ok(GESTURE_IDS.some((id) => GESTURES[id].ctx.includes(c)), `нет жеста для «${c}»`);
    for (const e of EMOTION_KEYS) assert.ok(GESTURE_IDS.some((id) => GESTURES[id].emo.includes(e)), `нет жеста для чувства «${e}»`);
});

test('the choice follows the situation and the feeling', () => {
    const rng = rngOf(7);
    const count = (ctx, emo) => { const m = new Map(); for (let i = 0; i < 400; i++) { const g = pickGesture({ ctx, emo, rng, lively: 1.4 }); if (g) m.set(g.base, (m.get(g.base) || 0) + 1); } return m; };
    const refuse = count('refuse', 'angry');
    assert.ok((refuse.get('stop') || 0) + (refuse.get('cross_arms') || 0) + (refuse.get('dismiss') || 0) + (refuse.get('fist_shake') || 0) > 60);
    const greet = count('greet', 'happy');
    assert.ok((greet.get('wave') || 0) + (greet.get('nod') || 0) + (greet.get('open_arms') || 0) + (greet.get('bow') || 0) + (greet.get('salute') || 0) > 60);
    // not the same twice in a row
    const g1 = pickGesture({ ctx: 'greet', emo: 'happy', rng: () => 0.5, lively: 2 });
    for (let i = 0; i < 50; i++) { const g2 = pickGesture({ ctx: 'greet', emo: 'happy', rng, last: g1.id, lively: 2 }); if (g2) assert.notEqual(g2.base, g1.base); }
});

test('a gesture rises, holds and falls; the poses stay in human range', () => {
    for (const id of GESTURE_IDS) {
        const g = GESTURES[id];
        const T = T0();
        assert.equal(gesturePose(T, g, 0, 1, 1), 0);
        const mid = gesturePose(T, g, g.dur * 0.5 / g.tempo, 1, 1);
        assert.ok(mid > 0.9, id);
        for (const k of Object.keys(T)) assert.ok(Number.isFinite(T[k]) && Math.abs(T[k]) < 3.6, `${id} ${k}=${T[k]}`);
        assert.equal(gesturePose(T0(), g, g.dur / g.tempo + 0.01, 1, 1), 0);
    }
    assert.ok(envelope(0.1, 2) < envelope(1, 2));
});

test('the left hand is the mirror of the right', () => {
    const r = T0(), l = T0();
    gesturePose(r, GESTURES.wave_r_soft, 0.8, 1, 1);
    gesturePose(l, GESTURES.wave_l_soft, 0.8, 1, 1);
    assert.ok(r.aRX > 2 && l.aLX > 2 && r.aLX === 0 && l.aRX === 0);
    assert.ok(Math.abs(r.aRZ + l.aLZ) < 1e-9, 'outward is the other way');
});

test('faces: the emotions differ, the quantised shapes are few', () => {
    const keys = new Set(EMOTION_KEYS.map((e) => faceKey(quantFace(EMOTIONS[e].face))));
    assert.equal(keys.size, EMOTION_KEYS.length, 'two feelings with the same face');
    assert.ok(EMOTIONS.angry.face.brow.tilt > 0.4 && EMOTIONS.sad.face.brow.tilt < -0.3 && EMOTIONS.happy.face.mouth.curve > 0.5 && EMOTIONS.angry.face.mouth.curve < 0);
    const mid = blendFace('sad', 'happy', 0.5);
    assert.ok(Math.abs(mid.mouth.curve - (EMOTIONS.sad.face.mouth.curve + EMOTIONS.happy.face.mouth.curve) / 2) < 1e-9);
    for (const k of EVENT_KEYS) assert.ok(EMOTIONS[emotionOf({ ev: k })], k);
});

test('feelings follow what happened', () => {
    assert.equal(emotionOf({ ev: 'insult', c: { temper: 80 } }), 'angry');
    assert.equal(emotionOf({ ev: 'insult', c: { temper: 10 } }), 'sad');
    assert.equal(emotionOf({ ev: 'hit', c: { brave: 20 } }), 'afraid');
    assert.equal(emotionOf({ mood: 0.8, eff: { sub: 0, fr: 40, lv: 0 } }), 'joy');
    assert.equal(emotionOf({ fear: 2 }), 'afraid');
    assert.equal(emotionOf({}), 'neutral');
});

test('the situation of a line', () => {
    assert.equal(ctxOfLine('Здравствуйте, путник!'), 'greet');
    assert.equal(ctxOfLine('Нет, этого я не сделаю.'), 'refuse');
    assert.equal(ctxOfLine('Конечно, слушаюсь!'), 'agree');
    assert.equal(ctxOfLine('Куда это мы идём?'), 'question');
    assert.equal(ctxOfLine('Спасибо вам огромное'), 'thanks');
});

test('the feeling of a villager: events show at once, then fade; no object made per call', () => {
    const v = { talking: 1 };
    const life = { rel: { eff: () => ({ sub: 0, fr: 0, lv: 0 }) }, talk: { brain: () => ({ mood: 0, character: { temper: 80 } }) }, game: {} };
    const a = stateOf(life, v, 0);
    assert.equal(a.emo, 'neutral');
    mark(v, 'insult', 3);
    const b = stateOf(life, v, performance.now() + 500);
    assert.equal(b, a, 'the same object');
    assert.equal(b.emo, 'angry');
    assert.equal(stateOf(life, v, performance.now() + 5000).emo, 'neutral');
});
