// «Create a Bridge»: the words, the cost, known from the start, and the plan over a river / a ravine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { START_SPELLS } from '../../src/game/SpellBook.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { bridgePlan, bridgeWords, bridgeMaterial, bridgeAim, bridgeExtra, bridgeHint, BRIDGE } from '../../src/game/Bridge.js';

test('«Create a Bridge»: its words (never «Ice Bridge», never «мост» in talk), 10 mana, no scroll', () => {
    for (const t of ['Create a Bridge', 'криейт э бридж', 'крейт э бридж', 'бридж', 'создай мост', 'построй мост']) assert.equal(matchSpell(t), 'CreateBridge', t);
    assert.equal(matchSpell('айс бридж'), 'IceBridge');
    assert.equal(matchSpell('создай ледяной мост'), 'IceBridge');
    for (const t of ['мост', 'я самостоятельно', 'пошли на мост', 'мостовая']) assert.equal(bridgeWords(t), null, t);
    assert.equal(SPELL_COST.CreateBridge, 10);
    assert.ok(START_SPELLS.has('CreateBridge'));
});

/** A world: ground at layer 10 for z ≤ 0 and z ≥ gapEnd, a river (bed 5, water 6–9) between. */
function world(gapEnd, farL = 10) {
    const set = new Map();
    const top = (x, z) => (z <= 0 ? 10 : z >= gapEnd ? farL : 5);
    const get = (x, L, z) => {
        const k = x + ',' + L + ',' + z;
        if (set.has(k)) return set.get(k);
        if (L <= top(x, z)) return BLOCK.GRASS;
        return z > 0 && z < gapEnd && L <= 9 ? BLOCK.WATER : BLOCK.AIR;
    };
    return { get, top };
}

test('the plan: a strip three wide of the banks\' material over the river, nothing on the banks, no wood', () => {
    const { get, top } = world(8);
    const p = bridgePlan(get, top, { x: 0, z: -1, L: 10 }, { x: 0, z: 9, L: 10 });
    assert.ok(p.cells, p.why);
    for (const [x, L, z, b] of p.cells) {
        assert.ok(z > 0 && z < 8, 'only over the gap: ' + z);
        assert.ok(Math.abs(x) <= 1 && L === 10, 'level, three wide, no railing');
        assert.equal(b, BLOCK.GRASS, 'grass banks → grass');
    }
    assert.equal(p.cells.length, 3 * 7);
    for (let i = 1; i < p.cells.length; i++) assert.ok(p.cells[i][4] >= p.cells[i - 1][4], 'grows from the near bank');
});

/** A ravine between two banks of the given blocks. */
function ravine(nearB, farB) {
    const top = (x, z) => (z <= 0 || z >= 6 ? 10 : 2);
    const get = (x, L, z) => (L <= top(x, z) ? (L === top(x, z) ? (z <= 0 ? nearB : farB) : BLOCK.STONE) : BLOCK.AIR);
    return { get, top };
}
const mats = (p) => new Set(p.cells.map((c) => c[3]));

test('the material is the banks\': stone, sand, earth, grass, snow, ice, a castle block; different banks → each its own half', () => {
    for (const b of [BLOCK.STONE, BLOCK.SAND, BLOCK.GRASS, BLOCK.DIRT, BLOCK.SNOW, BLOCK.ICE, BLOCK.CS_GREY]) {
        const w = ravine(b, b);
        const p = bridgePlan(w.get, w.top, { x: 0, z: 0, L: 10 }, { x: 0, z: 6, L: 10 });
        assert.deepEqual([...mats(p)], [b], 'block ' + b);
    }
    const w = ravine(BLOCK.STONE, BLOCK.SAND);
    const p = bridgePlan(w.get, w.top, { x: 0, z: 0, L: 10 }, { x: 0, z: 6, L: 10 });
    assert.ok(p.cells.filter((c) => c[4] < 0.5).every((c) => c[3] === BLOCK.STONE));
    assert.ok(p.cells.filter((c) => c[4] >= 0.5).every((c) => c[3] === BLOCK.SAND));
});

test('no wood: trees, planks and fences at the edge give earth; never a wooden block', () => {
    for (const b of [BLOCK.WOOD, BLOCK.LEAVES, BLOCK.PLANKS, BLOCK.PLANKS_DARK, BLOCK.FENCE, BLOCK.BIRCH, BLOCK.DARK_LEAVES]) assert.equal(bridgeMaterial(b), BLOCK.DIRT);
    for (let b = 0; b <= 72; b++) { const m = bridgeMaterial(b); assert.ok(![BLOCK.PLANKS, BLOCK.PLANKS_DARK, BLOCK.FENCE, BLOCK.WOOD, BLOCK.LEAVES].includes(m)); }
    assert.equal(bridgeMaterial(BLOCK.ENCHANTED), BLOCK.STONE);
});

test('the plan: a gentle slope up to a higher bank; too steep, too far, too near, no gap — a reason', () => {
    let w = world(8, 12);
    let p = bridgePlan(w.get, w.top, { x: 0, z: -1, L: 10 }, { x: 0, z: 9, L: 12 });
    assert.ok(p.cells);
    const mid = p.cells.filter((c) => c[0] === 0).map((c) => c[1]);
    assert.ok(Math.min(...mid) >= 10 && Math.max(...mid) <= 12 && new Set(mid).size >= 2);
    w = world(4, 24);
    assert.equal(bridgePlan(w.get, w.top, { x: 0, z: -1, L: 10 }, { x: 0, z: 5, L: 24 }).why, 'steep');
    w = world(50);
    assert.equal(bridgePlan(w.get, w.top, { x: 0, z: -1, L: 10 }, { x: 0, z: 51, L: 10 }).why, 'far');
    assert.equal(bridgePlan(w.get, w.top, { x: 0, z: -1, L: 10 }, { x: 0, z: 0, L: 10 }).why, 'near');
    const flat = { get: (x, L) => (L <= 10 ? BLOCK.GRASS : BLOCK.AIR), top: () => 10 };
    assert.equal(bridgePlan(flat.get, flat.top, { x: 0, z: 0, L: 10 }, { x: 8, z: 0, L: 10 }).why, 'nogap');
});

/** A flexible world: top(x, z) and a block() per column; water fills up to `water` where set. */
function column(topFn, o = {}) {
    const get = (x, L, z) => {
        const t = topFn(x, z);
        if (L <= t) return o.block ? o.block(x, L, z, t) : BLOCK.GRASS;
        if (o.water && L <= o.water && t < o.water) return BLOCK.WATER;
        return o.extra ? o.extra(x, L, z) : BLOCK.AIR;
    };
    return { get, top: topFn };
}
const A0 = { x: 0, z: 0, L: 10 };
const aim = (w, hx, hz, point = null) => bridgeAim(w.get, w.top, A0, hx, hz, point);

test('aiming: a narrow river, the hand points at the far SLOPE 25 m away — the bridge goes to the near edge (7 m)', () => {
    const w = column((x, z) => (z <= 0 ? 10 : z < 7 ? 5 : 10 + (z - 6)), { water: 9 }); // (a hill behind the river)
    const r = aim(w, 0, 1);
    assert.ok(r.plan, r.why);
    assert.equal(r.B.z, 7);
    assert.ok(r.plan.len < 8);
});

test('aiming: a ravine, a 1-block gap, a pit one deep; a hand off to the side still finds the bank', () => {
    let w = column((x, z) => (z <= 0 || z >= 9 ? 10 : 0));
    assert.ok(aim(w, 0, 1).plan, 'ravine');
    w = column((x, z) => (z === 1 ? 4 : 10));
    assert.ok(aim(w, 0, 1).plan, 'a gap of one block');
    w = column((x, z) => (z >= 1 && z <= 3 ? 9 : 10));
    assert.ok(aim(w, 0, 1).plan, 'a pit one deep');
    w = column((x, z) => (z <= 0 || z >= 8 ? 10 : 3));
    const r = aim(w, Math.sin(0.2), Math.cos(0.2));
    assert.ok(r.plan, 'a little to the side');
});

test('aiming: a bank 6 layers higher, up to 1:1; a wide river 30 m; more than 12 higher says so', () => {
    let w = column((x, z) => (z <= 0 ? 10 : z < 8 ? 5 : 16), { water: 9 });
    let r = aim(w, 0, 1);
    assert.ok(r.plan, r.why);
    const ys = r.plan.cells.filter((c) => c[0] === 0).map((c) => c[1]);
    assert.ok(Math.max(...ys) >= 15 && Math.min(...ys) >= 10);
    w = column((x, z) => (z <= 0 || z >= 30 ? 10 : 5), { water: 9 });
    r = aim(w, 0, 1);
    assert.ok(r.plan, r.why);
    assert.ok(r.plan.len >= 30 && r.plan.len <= BRIDGE.MAX);
    w = column((x, z) => (z <= 0 ? 10 : z < 4 ? 3 : 40));
    assert.equal(aim(w, 0, 1).why, 'steep');
});

test('aiming: trees at the edge are passed, a house wall is named, a lake without a bank says so', () => {
    let w = column((x, z) => (z <= 0 || z >= 8 ? 10 : 4), { water: 9, block: (x, L, z, t) => (L === t && z >= 8 && z <= 9 ? BLOCK.LEAVES : BLOCK.GRASS) });
    let r = aim(w, 0, 1);
    assert.ok(r.plan, r.why);
    assert.ok(r.B.z >= 10, 'past the crown');
    w = column((x, z) => (z <= 0 ? 10 : z < 8 ? 4 : 16), { water: 9, block: (x, L, z, t) => (z >= 8 && L === t ? BLOCK.CS_GREY : BLOCK.GRASS) });
    assert.equal(aim(w, 0, 1).why, 'wall');
    w = column((x, z) => (z <= 0 ? 10 : 4), { water: 9 });
    assert.equal(aim(w, 0, 1).why, 'sea');
});

test('aiming: level ground — nothing beside: a hint, water beside the way: a path to the pointed place', () => {
    let w = column(() => 10);
    assert.equal(aim(w, 0, 1, { x: 0, z: 8 }).why, 'nogap');
    w = column((x, z) => (x >= 3 && x <= 4 ? 4 : 10), { water: 9 });
    const r = aim(w, 0, 1, { x: 0, z: 8 });
    assert.ok(r.plan && r.plan.cells.length > 0, r.why);
});

test('the price: ten up to 16 m, then half a mana a metre', () => {
    assert.equal(bridgeExtra(10), 0);
    assert.equal(bridgeExtra(16), 0);
    assert.equal(bridgeExtra(26), 5);
    assert.ok(bridgeExtra(99) <= 12);
    for (const k of ['near', 'far', 'sea', 'steep', 'wall', 'nogap']) assert.ok(!/\d+ ?м/.test(bridgeHint(k)), 'no numbers: ' + k);
});
