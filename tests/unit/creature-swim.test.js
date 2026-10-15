// Land creatures in deep water: they float and swim (not walk the bottom), get out where the
// bank is low, never walk in on their own; a knight in plates who can't get out sheds them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CSWIM, SWIMMERS, waterAt, deepAt, findExit, swimStep } from '../../src/game/CreatureSwim.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { CastleLife } from '../../src/game/CastleLife.js';

/**
 * A lake: |x|, |z| ≤ 10 — the bottom is layer 0, water in layers 1…4 (surface y = 3.5).
 * Round it a high bank (top layer 5: 1.5 m over the water); `low` cells: a bank at the water (top 4).
 */
function lake({ low = () => false, sea = false } = {}) {
    const inLake = (x, z) => (sea ? true : Math.abs(x) <= 10 && Math.abs(z) <= 10);
    const top = (x, z) => (inLake(x, z) ? 0 : low(x, z) ? 4 : 5);
    return {
        get(x, l, z) {
            const tp = top(x, z);
            if (l <= tp) return BLOCK.STONE;
            if (inLake(x, z) && l <= 4) return BLOCK.WATER;
            return BLOCK.AIR;
        },
        floorBelow(x, z, L) { const tp = top(x, z); return Math.min(tp, L); },
        solidIn(x, z, a, b) { return a <= top(x, z); },
    };
}

test('creature swim: deep water is no ground — the shallows and the land are', () => {
    const t = lake();
    assert.equal(deepAt(t, 0, 0, -0.5), true);
    assert.equal(deepAt(t, 14, 0, 4.5), false);
    const w = waterAt(t, 0, 0, -0.5);
    assert.equal(w.depth, 4);
    assert.equal(w.surface, 3.5);
});

test('creature swim: a knight thrown into the lake floats at the top and swims out (not along the bottom)', () => {
    const t = lake();
    const b = { x: 0, y: -0.5, z: 0, yaw: 0 }; // (on the bottom, where he fell)
    const sw = {};
    let out = null;
    for (let i = 0; i < 60 * 40 && !out; i++) {
        const r = swimStep(b, sw, SWIMMERS.person, { t }, 1 / 60);
        if (r?.out) out = r.out;
        if (i === 120) assert.ok(b.y > 1.5, `floats up: ${b.y}`); // (head over the water, not on the bottom)
    }
    assert.ok(out, 'got to the bank');
    assert.ok(Math.abs(out.y - 4.5) < 1e-6 && (Math.abs(out.x) > 10 || Math.abs(out.z) > 10), JSON.stringify(out));
    assert.ok(sw.air > CSWIM.AIR - 1, 'breathing all the way');
});

test('creature swim: in plates the high bank is no way out — he swims round to the low place', () => {
    const t = lake({ low: (x, z) => x <= -11 && Math.abs(z) <= 1 });
    // the high bank is nearer (x = 11), the low place far on the other side (x = -11)
    assert.equal(findExit(t, 8, 0, 3.5, SWIMMERS.heavy.climb).x <= -11, true);
    assert.equal(findExit(t, 8, 0, 3.5, SWIMMERS.person.climb).x, 11); // (without plates: the near bank will do)
    const b = { x: 8, y: 1.75, z: 0, yaw: 0 };
    const sw = {};
    let out = null, shed = false;
    for (let i = 0; i < 60 * 24 && !out; i++) {
        const r = swimStep(b, sw, SWIMMERS.heavy, { t }, 1 / 60);
        if (r === 'shed') { shed = true; break; }
        if (r?.out) out = r.out;
    }
    assert.ok(!shed);
    assert.ok(out && out.x <= -11, JSON.stringify(out));
});

test('creature swim: a knight in plates who can\'t get out for long throws them off', () => {
    const t = lake(); // (all the bank high: no way out in plates)
    const b = { x: 0, y: 1.75, z: 0, yaw: 0 };
    const sw = {};
    let shedAt = null;
    for (let i = 0; i < 60 * 40; i++) {
        const r = swimStep(b, sw, SWIMMERS.heavy, { t }, 1 / 60);
        if (r === 'shed') { shedAt = sw.t; break; }
    }
    assert.ok(shedAt != null && shedAt <= CSWIM.SHED + 0.1, `shed at ${shedAt}`);
    // lighter now: out over the 1-block bank
    let out = null;
    for (let i = 0; i < 60 * 30 && !out; i++) { const r = swimStep(b, sw, SWIMMERS.person, { t }, 1 / 60); if (r?.out) out = r.out; }
    assert.ok(out);
});

test('creature swim: in the open sea with nowhere to go — tires, goes under, drowns', () => {
    const t = lake({ sea: true });
    const b = { x: 0, y: 2, z: 0, yaw: 0 };
    const sw = {};
    let hits = 0;
    for (let i = 0; i < 10 * (CSWIM.TIRE + 120) && hits < 3; i++) if (swimStep(b, sw, SWIMMERS.person, { t }, 0.1) === 'drown') hits++;
    assert.equal(hits, 3);
    assert.ok(sw.t > CSWIM.TIRE, `drowning only once tired: ${sw.t}`);
});

// ---- the castle people (CastleLife): never into the water after a foe; thrown in — out

function life(t) {
    const L = Object.create(CastleLife.prototype);
    L.game = { world: { terrain: { data: t } }, terrain: { data: t }, collision: { groundAt: (x, z, r) => t.floorBelow(Math.round(x), Math.round(z), Math.floor(r + 1.5)) - 0.5 } };
    L._say = () => {};
    return L;
}

test('creature swim: a knight after a foe swimming in the lake stops on the bank (no step into the deep water)', () => {
    const t = lake({ low: () => true }); // (the bank at the water: he could walk in — and doesn't)
    const L = life(t);
    const v = { x: 14, y: 3.5, z: 0, yaw: 0, speed: 0 };
    for (let i = 0; i < 60 * 10; i++) L._steer(v, 0, 0, 5.6, 1 / 60);
    assert.ok(!deepAt(t, v.x, v.z, v.y), `on the bank: x=${v.x.toFixed(2)}`);
    assert.ok(v.x > 9.4 && v.x < 12, `right at the water: ${v.x}`);
});

test('creature swim: a knight thrown into the lake swims (not on the bottom) and climbs out on the bank', () => {
    const t = lake({ low: (x, z) => x >= 11 && Math.abs(z) <= 2 });
    const L = life(t);
    const v = { x: 2, y: -0.5, z: 0, yaw: 0, role: 'knight', maxArmor: 50, armor: 50, hp: 20, cs: { def: { x: 30, z: 0 } } };
    let floated = false, climbed = false;
    for (let i = 0; i < 60 * 60 && !(climbed && !v.climb); i++) {
        if (v.climb) { L._climbStep(v, 1 / 60); climbed = true; continue; }
        assert.ok(L._swim(v, 1 / 60) || climbed, 'swims while in the water');
        if (v.y > 1.2) floated = true;
    }
    assert.ok(floated, 'at the top of the water');
    assert.ok(climbed && v.x >= 10.5 && Math.abs(v.y - 3.5) < 0.01, `out on the bank: ${v.x}, ${v.y}`);
    assert.equal(v.stripped, undefined, 'in plates he got out at the low place — no need to throw them off');
});
