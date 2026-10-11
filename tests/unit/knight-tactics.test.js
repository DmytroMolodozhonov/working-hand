// The castle knights' squad brain: which plan for which situation, switching when a plan fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KT, choosePlan, reviewPlan, remember, begin, newMemory, castRoles, planSteps, aimArrow } from '../../src/game/KnightTactics.js';

const base = (o = {}) => ({
    n: 6, start: 6, lost: 0, lostRecent: 0, hpK: 1, shields: 3, dist: 12, air: false, high: false, water: false, reach: 'ground',
    lying: false, busy: false, noMana: false, shield: false, servants: false, inside: false, fled: false, kingAlive: true, kingThreat: false, t: 20, ...o,
});
const still = () => 0; // (no free thinking: the plain best)
const plan = (sit, mem = newMemory(), now = 100) => choosePlan(sit, mem, now, still).id;
const prog = (o = {}) => ({ t: 12, closer: 0, hurt: 0, blows: 0, shots: 0, lost: 0, up: false, ...o });

test('knight tactics: the opening move is the straight assault', () => {
    assert.equal(plan(base({ t: 0 })), 'assault');
});

test('knight tactics: unreachable on a roof → archers / climbing / siege, never swords in a crowd below', () => {
    for (const reach of [null, 'path', 'steps']) {
        const id = plan(base({ high: true, reach }));
        assert.ok(['archers', 'climb', 'siege'].includes(id), `${reach}: ${id}`);
    }
    assert.equal(plan(base({ high: true, reach: 'path' })), 'archers'); // (the bows first; the climb next)
    // the archers failed (he hides behind the ridge) → up the stairs
    const mem = newMemory();
    begin(mem, 'archers', 100);
    remember(mem, 'archers', reviewPlan('archers', base({ high: true, reach: 'path' }), prog({ t: 20, shots: 8 })), 120);
    assert.equal(plan(base({ high: true, reach: 'path' }), mem, 121), 'climb');
    // no way up at all, the arrows don't reach him → surround and wait
    const m2 = newMemory();
    remember(m2, 'archers', { fail: true, why: 'cover' }, 120);
    assert.equal(plan(base({ high: true, reach: null }), m2, 121), 'siege');
});

test('knight tactics: flying or in the water → the bows', () => {
    assert.equal(plan(base({ air: true })), 'archers');
    assert.equal(plan(base({ water: true })), 'archers');
    // the assault that was going on is dropped at once: it can't work now
    assert.deepEqual(reviewPlan('assault', base({ air: true }), prog({ t: 1 })), { done: true, why: 'unfit' });
});

test('knight tactics: the caster busy / out of mana / lying → everybody at once', () => {
    for (const k of ['busy', 'noMana', 'lying']) assert.equal(plan(base({ [k]: true })), 'rush', k);
    // (not when he is up on a roof)
    assert.notEqual(plan(base({ lying: true, high: true, reach: null })), 'rush');
});

test('knight tactics: losing → fall back (and not again right after)', () => {
    assert.equal(plan(base({ n: 3, start: 7, lost: 4 })), 'fallback');
    assert.equal(plan(base({ hpK: 0.3 })), 'fallback');
    const mem = newMemory();
    begin(mem, 'fallback', 100);
    assert.notEqual(plan(base({ n: 3, start: 7, lost: 4 }), mem, 110), 'fallback');
});

test('knight tactics: a failed plan is not chosen again right away', () => {
    const mem = newMemory();
    begin(mem, 'assault', 100);
    const res = reviewPlan('assault', base(), prog({ t: 12, closer: 0.5 }));
    assert.equal(res?.fail, true);
    remember(mem, 'assault', res, 112);
    for (let i = 0; i < 20; i++) assert.notEqual(choosePlan(base({ t: 30 }), mem, 113).id, 'assault');
    // a while later it may come back (as one of the options)
    assert.ok(choosePlan(base({ n: 2, start: 2, shields: 0 }), mem, 112 + KT.FAIL_MEMORY + 1, still).id === 'assault');
});

test('knight tactics: circumstances pick the way — a shield → encircle; the king in danger → guard him; he runs → ambush', () => {
    assert.equal(plan(base({ shield: true })), 'encircle');
    assert.equal(plan(base({ kingThreat: true })), 'kingguard');
    assert.equal(plan(base({ fled: true, dist: 16 })), 'ambush');
    assert.equal(plan(base({ lostRecent: 1, hpK: 0.6 })), 'shieldwall');
});

test('knight tactics: they think — the same situation does not always give the same plan', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(choosePlan(base({ t: 10 }), newMemory(), 100).id);
    assert.ok(seen.size >= 2, [...seen].join(','));
});

test('knight tactics: roles — archers and watchers, climbers, a guard by the king, the captain', () => {
    const men = Array.from({ length: 6 }, (_, i) => ({ id: 'k' + i, idx: i + 1, d: 5 + i * 3, dk: 40 - i, shield: i % 2 === 0 }));
    const cap = {};
    const r = castRoles('archers', men, { kingAlive: true, captain: cap });
    assert.equal(cap.id, 'k0');
    const n = (role) => [...r.values()].filter((x) => x === role).length;
    assert.equal(n('guard'), 1);
    assert.ok(n('archer') >= 3 && n('watch') >= 1, JSON.stringify([...r]));
    const c = castRoles('climb', men, { kingAlive: false });
    assert.equal([...c.values()].filter((x) => x === 'climber').length, 2);
    const w = castRoles('shieldwall', men, { kingAlive: false });
    assert.ok([...w.entries()].filter(([, x]) => x === 'shield').every(([id]) => men.find((m) => m.id === id).shield));
    const s = castRoles('siege', men, { kingAlive: false, help: true });
    assert.equal([...s.values()].filter((x) => x === 'runner').length, 1);
});

test('knight tactics: steps of planks up to a flat roof (each a climbable ledge), none when there is a way', () => {
    // a block house 9 high (x 0..5, z 0..5) on flat ground (floor layer 0)
    const solid = (x, L, z) => (L <= 0) || (x >= 0 && x <= 5 && z >= 0 && z <= 5 && L <= 9);
    const t = {
        floorBelow(x, z, L) { for (let l = L; l >= -5; l--) if (solid(x, l, z)) return l; return -6; },
        solidIn(x, z, a, b) { for (let l = a; l <= b; l++) if (solid(x, l, z)) return true; return false; },
        get: (x, L, z) => (solid(x, L, z) ? 3 : 0),
    };
    const foe = { x: 3, y: 9.5, z: 3 }; // (feet on the roof: floor layer 9)
    const s = planSteps(t, foe, { x: 20, y: 0.5, z: 3 });
    assert.ok(s && s.cells.length > 0 && s.cells.length <= 40, JSON.stringify(s));
    // columns going out from the wall towards the knights, each 2 lower; the last one climbable from the ground
    const cols = new Map();
    for (const [x, L, z] of s.cells) { assert.equal(z, 3); cols.set(x, Math.max(cols.get(x) ?? -1, L)); }
    const xs = [...cols.keys()].sort((a, b) => a - b);
    assert.equal(xs[0], 6);
    let prev = 9;
    for (const x of xs) { const top = cols.get(x); assert.ok(prev - top >= 1 && prev - top <= 3, `step at x=${x}: ${prev}→${top}`); prev = top; }
    assert.ok(prev - 0 <= 3, 'the last step is climbable from the ground');
    assert.ok(s.base.x > xs[xs.length - 1]);
});

test('knight tactics: an arrow aimed up at a roof lands on him (and leads a runner)', () => {
    const fly = (from, v, T) => ({ x: from.x + v.x * T, y: from.y + v.y * T - 4.9 * T * T, z: from.z + v.z * T });
    const from = { x: 0, y: 3, z: 0 }, to = { x: 18, y: 10, z: 6 };
    const v = aimArrow(from, to, null, 42);
    const D = Math.hypot(18, 6), T = D / Math.hypot(v.x, v.z);
    const p = fly(from, v, T);
    assert.ok(Math.hypot(p.x - to.x, p.y - to.y, p.z - to.z) < 0.2, JSON.stringify(p));
    const vel = { x: 0, y: 0, z: 4 };
    const w = aimArrow(from, to, vel, 42);
    const T2 = 18 / w.x; // (when it gets to his x)
    const q = fly(from, w, T2);
    assert.ok(Math.hypot(q.x - to.x, q.z - (to.z + vel.z * T2)) < 0.6, 'led');
    assert.equal(aimArrow(from, { x: 400, y: 3, z: 0 }, null, 42), null, 'out of range');
});
