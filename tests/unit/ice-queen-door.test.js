// The Ice Queen and the doors of her palace (the author: «Королева застряла в двери, ходила туда-сюда»):
// — the gateway is wider than her body (+1 m each way) and she walks the whole terrace and back through it without standing;
// — which side of the wall a body is on does not flip with every step in the doorway (IceCastleLife._zone / _wayTo);
// — a foe lost behind the wall for a moment is still where she saw him (no turning back at every sidestep).
import test from 'node:test';
import assert from 'node:assert/strict';
import { IceCastleLife } from '../../src/game/IceQueen.js';
import { QUEEN_AI } from '../../src/game/IceGiants.js';
import { measure, queenWalk, gateWidth, palaceGrid } from '../../tools/icearenabench.mjs';

const mk = () => {
    const plan = { x: 0, z: 0, floor: 20, hall: { x: 0, z: 0, r: 13, top: 40 }, gate: { x: 0, y: 19.5, z: 15, inner: { x: 0, y: 19.5, z: 11 }, out: { x: 0, y: 14, z: 25 } } };
    const life = Object.create(IceCastleLife.prototype);
    Object.defineProperty(life, 'plan', { value: plan });
    life._openGates = () => {};
    return life;
};
const body = (x, z) => ({ model: { position: { x, y: 19.5, z } }, wp: null });

test('the doorway: a foe on the wall\'s line does not change sides with every step', () => {
    const life = mk();
    const c = body(0, 5); // (she is in the hall)
    c.zoneT = false; // (he stood outside a moment ago)
    const first = life._wayTo(c, { x: 0, y: 19.5, z: 14.9 }); // (…and now stands in the doorway, a hair inside the old line)
    const second = life._wayTo(c, { x: 0, y: 19.5, z: 14.1 });
    const third = life._wayTo(c, { x: 0, y: 19.5, z: 14.6 });
    assert.deepEqual([first.z, second.z, third.z], [11, 11, 11], 'she goes for the gate the whole time, not back and forth');
});

test('in the hall, then out of the gate: the way is kept to the end (no turning in the doorway)', () => {
    const life = mk();
    const c = body(0, 0), foe = { x: 0, y: 14, z: 40 };
    let last = -1, back = 0;
    for (let i = 0; i < 4000; i++) {
        const t = life._wayTo(c, foe), p = c.model.position;
        const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz) || 1;
        p.x += (dx / d) * 0.05; p.z += (dz / d) * 0.05; p.y = p.z > 15 ? 14 : 19.5;
        if (p.z < last - 1e-6) back++;
        last = p.z;
        if (p.z > 39) break;
    }
    assert.equal(back, 0, 'she never stepped back');
    assert.ok(c.model.position.z > 39, 'she came out to him');
});

test('the queen: gateway ≥ her width + 1, and she walks out, round the terrace and back through it without standing', () => {
    for (const seed of [12345, 777]) {
        const m = measure(seed);
        const q = queenWalk(m);
        assert.ok(gateWidth(q.grid, m.plan) >= 2 * 1.0 + 1, `seed ${seed}: the gateway is ${gateWidth(q.grid, m.plan)} wide`);
        assert.equal(q.res.arrived, q.res.total, `seed ${seed}: she arrived everywhere`);
        assert.ok(q.res.maxStand <= 3, `seed ${seed}: she stood ${q.res.maxStand} s`);
    }
});

test('the queen keeps sight of a foe for a moment behind the wall', () => {
    assert.ok(QUEEN_AI.LOSE_SIGHT >= 1 && QUEEN_AI.GATE_ZONE >= 5);
});
