/**
 * Wound care (the author 07.11, about «Sectura»): a bleeding villager holds the wound; a wizard of the middle rank or higher stops the blood with «Rescue»
 * (the wound stays); a junior wizard is «as an ordinary person»; a middle wizard helps a bleeding junior / a defenceless one; the plain folk help the defenceless.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARE, isMidWizard, canRescue, isDefenceless, isPlainHelper, isFighter, woundSide, staysSelf, pickWizard, pickPlain } from '../../src/game/WoundCareRules.js';

const wiz = (rank, extra = {}) => ({ id: 'w' + rank, wizard: true, role: 'student', rank, mana: 50, bleed: 0, ...extra });
const folk = (extra = {}) => ({ id: 'f1', role: 'farmer', bleed: 1, ...extra });

test('middle rank and above know «Rescue»; a novice does not', () => {
    for (const r of ['adept', 'teacher', 'elder', 'master']) assert.equal(isMidWizard(wiz(r)), true, r);
    assert.equal(isMidWizard(wiz('novice')), false);
    assert.equal(isMidWizard({ wizard: true, role: 'student' }), false, 'a student without a rank is a beginner');
    assert.equal(isMidWizard({ wizard: true, role: 'teacher' }), true, 'a teacher without a rank is not');
    assert.equal(isMidWizard({ id: 'k', role: 'knight' }), false);
});

test('a wizard needs a wand, mana and his senses to cast «Rescue»', () => {
    assert.equal(canRescue(wiz('teacher')), true);
    assert.equal(canRescue(wiz('teacher', { noWand: true })), false);
    assert.equal(canRescue(wiz('teacher', { mana: CARE.COST - 1 })), false);
    assert.equal(canRescue(wiz('teacher', { stunT: 2 })), false);
    assert.equal(canRescue(wiz('teacher', { dead: true })), false);
});

test('a bleeding middle wizard stops his own blood; a novice does not', () => {
    assert.equal(staysSelf(wiz('adept', { bleed: 1 })), true);
    assert.equal(staysSelf(wiz('novice', { bleed: 1 })), false);
    assert.equal(staysSelf(wiz('adept', { bleed: 0 })), false);
});

test('defenceless: plain folk and junior wizards — not knights, not middle wizards', () => {
    assert.equal(isDefenceless(folk()), true);
    assert.equal(isDefenceless(wiz('novice')), true);
    assert.equal(isDefenceless(wiz('adept')), false);
    assert.equal(isDefenceless({ id: 'k', role: 'knight' }), false);
    assert.equal(isFighter({ role: 'king' }), true);
});

test('a middle wizard comes to a bleeding junior; the nearest first; none when out of range', () => {
    const junior = wiz('novice', { bleed: 1 });
    const a = wiz('teacher', { id: 'A' }), b = wiz('adept', { id: 'B' });
    assert.equal(pickWizard(junior, [{ v: a, d: 12 }, { v: b, d: 6 }]), b);
    assert.equal(pickWizard(junior, [{ v: a, d: CARE.SEE + 1 }]), null, 'too far to notice');
    assert.equal(pickWizard(junior, [{ v: a, d: CARE.SEE + 1 }], CARE.HEAR), a, 'but a call is heard farther');
    assert.equal(pickWizard(junior, [{ v: wiz('novice', { id: 'N' }), d: 3 }]), null, 'another novice cannot');
    assert.equal(pickWizard(wiz('adept', { bleed: 1 }), [{ v: a, d: 3 }]), null, 'a middle wizard needs no one');
});

test('a plain person helps the defenceless, not a knight; a busy one does not come', () => {
    const victim = folk();
    const p = { id: 'p', role: 'farmer' }, busy = { id: 'q', role: 'farmer', care: { kind: 'plain' } }, fighting = { id: 'r', role: 'farmer', foe: 'x' };
    assert.equal(pickPlain(victim, [{ v: busy, d: 2 }, { v: fighting, d: 3 }, { v: p, d: 8 }]), p);
    assert.equal(pickPlain({ id: 'k', role: 'knight', bleed: 1 }, [{ v: p, d: 3 }]), null, 'a knight is no defenceless one');
    assert.equal(isPlainHelper({ id: 'w', wizard: true, role: 'student' }), false, 'wizards help in their own way');
});

test('the hand that holds the wound is stable per person and mostly the right one', () => {
    assert.equal(woundSide('abc'), woundSide('abc'));
    const sides = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(woundSide));
    assert.ok(sides.has('r'));
});

// ------------------------------------------------------------ the doing (WoundCare with a stand-in castle life)
import { WoundCare } from '../../src/game/WoundCare.js';

function world() {
    const said = [], rescued = [];
    const life = {
        byId: new Map(), game: { dismember: { bleeders: new Map(), which: (t) => ({ k: 'v' }), rescueCreature: (t) => { rescued.push(t.id); t.bleed = 0; return true; } }, fx: { spark() {} } },
        _sees: () => true, _say: (v, t) => said.push([v.id, t]), _steer(v, x, z, sp, dt, stop) { const dx = x - v.x, dz = z - v.z, d = Math.hypot(dx, dz); const s = Math.min(Math.max(0, d - stop), sp * dt); if (d > 0) { v.x += dx / d * s; v.z += dz / d * s; } },
    };
    const add = (v) => { v.x ??= 0; v.y ??= 0; v.z ??= 0; v.hp ??= 10; life.byId.set(v.id, v); return v; };
    return { life, said, rescued, add, care: new WoundCare(life) };
}
const tick = (W, n, dt = 0.1) => { for (let i = 0; i < n; i++) { W.care.update(dt); for (const v of W.life.byId.values()) if (v.care) W.care.step(v, dt); } };

test('a bleeding villager holds the wound, and lets go when the blood stops', () => {
    const W = world();
    const v = W.add({ id: 'v1', role: 'farmer', bleed: 1 });
    tick(W, 1);
    assert.equal(v.woundHold, true);
    v.bleed = 0; tick(W, 1);
    assert.equal(v.woundHold, false);
});

test('a middle wizard stops his own blood: the wand up, the word, then the blood stops (the hand drops)', () => {
    const W = world();
    const m = W.add({ id: 'm', wizard: true, role: 'teacher', rank: 'teacher', mana: 40, bleed: 1 });
    tick(W, 30); // 3 s
    assert.deepEqual(W.rescued, ['m']);
    assert.ok(W.said.some(([id, t]) => id === 'm' && /Rescue/.test(t)), 'he said the word');
    assert.equal(m.bleed, 0);
    assert.equal(m.woundHold, false);
    assert.equal(m.care, null, 'nothing is left on him');
    assert.equal(m.mana, 40 - CARE.COST);
});

test('a novice cannot: he holds the wound, as an ordinary person; a middle wizard who sees it comes and helps him', () => {
    const W = world();
    const n = W.add({ id: 'n', wizard: true, role: 'student', rank: 'novice', mana: 40, bleed: 1 });
    tick(W, 3);
    assert.equal(n.care ?? null, null, 'he does not heal himself');
    assert.equal(n.woundHold, true);
    const t = W.add({ id: 't', wizard: true, role: 'teacher', rank: 'teacher', mana: 40, x: 12, z: 0 });
    tick(W, 120, 0.1); // 12 s: he walks the 12 m and works
    assert.deepEqual(W.rescued, ['n']);
    assert.equal(n.bleed, 0);
    assert.equal(n.woundHold, false);
    assert.ok(t.x < 4, 'he came to him');
    assert.equal(t.care, null);
});

test('a plain person comes to a bleeding defenceless one and presses the wound; a call goes out; the bleeding halves', () => {
    const W = world();
    const v = W.add({ id: 'v', role: 'farmer', bleed: 1 });
    W.life.game.dismember.bleeders.set('v:v', { rate: 1 });
    const p = W.add({ id: 'p', role: 'farmer', x: 8, z: 0 });
    tick(W, 80);
    assert.ok(Math.hypot(p.x - v.x, p.z - v.z) <= CARE.NEAR + 0.6, 'he is beside him');
    assert.equal(W.life.game.dismember.bleeders.get('v:v').rate, CARE.PRESS_FACTOR);
    assert.equal(v.called, true, 'a wizard is called for');
    assert.ok(W.said.some(([id]) => id === 'p'));
});

test('help stops cleanly when the wounded one is gone or dies; a knight is not nursed by the folk', () => {
    const W = world();
    const v = W.add({ id: 'v', role: 'farmer', bleed: 1 });
    const p = W.add({ id: 'p', role: 'farmer', x: 8, z: 0 });
    tick(W, 5);
    assert.ok(p.care, 'he set out');
    v.dead = true; tick(W, 2);
    assert.equal(p.care, null);
    const W2 = world();
    const k = W2.add({ id: 'k', role: 'knight', bleed: 1 });
    const q = W2.add({ id: 'q', role: 'farmer', x: 3, z: 0 });
    tick(W2, 20);
    assert.equal(q.care ?? null, null);
    assert.equal(k.woundHold, true, 'but he holds his wound');
});
