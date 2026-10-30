// «Create a Bridge»: the words, the cost, known from the start, and the plan over a river / a ravine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { START_SPELLS } from '../../src/game/SpellBook.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { bridgePlan, bridgeWords, bridgeMaterial, bridgeExtra, bridgeHint, blockAt, rayTarget, BRIDGE } from '../../src/game/Bridge.js';

test('«Create a Bridge»: its words (never «Ice Bridge», never «мост» in talk), 10 mana, no scroll', () => {
    for (const t of ['Create a Bridge', 'криейт э бридж', 'крейт э бридж', 'бридж', 'создай мост', 'построй мост']) assert.equal(matchSpell(t), 'CreateBridge', t);
    assert.equal(matchSpell('айс бридж'), 'IceBridge');
    assert.equal(matchSpell('создай ледяной мост'), 'IceBridge');
    for (const t of ['мост', 'я самостоятельно', 'пошли на мост', 'мостовая']) assert.equal(bridgeWords(t), null, t);
    assert.equal(SPELL_COST.CreateBridge, 10);
    assert.ok(START_SPELLS.has('CreateBridge'));
});

/** A world: ground at layer 10 for z ≤ 0 and z ≥ gapEnd (at farL), a river (bed 5, water 6–9) between. */
function world(gapEnd, farL = 10, o = {}) {
    const top = (x, z) => (z <= 0 ? 10 : z >= gapEnd ? farL : 5);
    const get = (x, L, z) => {
        if (o.wall && z === o.wall && L >= 10 && L <= 14) return BLOCK.CS_GREY;
        if (L <= top(x, z)) return BLOCK.GRASS;
        return z > 0 && z < gapEnd && L <= 9 && !o.dry ? BLOCK.WATER : BLOCK.AIR;
    };
    return { get };
}
const A = { x: 0, z: 0, L: 10 };

test('over a river: three wide, level, only in the empty cells, grows from the hero, banks untouched', () => {
    const { get } = world(8);
    const p = bridgePlan(get, A, { x: 0, z: 8, L: 10 });
    assert.ok(p.cells, p.why);
    for (const [x, L, z, b] of p.cells) {
        assert.ok(z > 0 && z < 8, 'only over the gap: ' + z);
        assert.ok(Math.abs(x) <= 1 && L === 10);
        assert.equal(b, BLOCK.GRASS);
    }
    assert.equal(p.cells.length, 3 * 7);
    for (let i = 1; i < p.cells.length; i++) assert.ok(p.cells[i][4] >= p.cells[i - 1][4]);
    assert.ok(!p.raised);
});

test('no river at all: over dry land / a pit / thin air it is built too, with no «can walk here» answer', () => {
    const air = (x, L, z) => (L <= 10 && z <= 0 ? BLOCK.STONE : BLOCK.AIR); // a ledge over nothing, a tower 30 m away
    const p = bridgePlan(air, A, { x: 0, z: 30, L: 10 });
    assert.ok(p.cells && p.cells.length >= 3 * 29, p.why);
    // solid level ground: nothing empty at the feet's level → a raised walkway, still a bridge
    const flat = (x, L) => (L <= 10 ? BLOCK.GRASS : BLOCK.AIR);
    const f = bridgePlan(flat, A, { x: 8, z: 0, L: 10 });
    assert.ok(f.raised && f.cells.length > 0 && f.cells.every((c) => c[1] === 11));
    for (const k of ['none', 'near', 'far', 'unknown', 'empty']) assert.ok(!/можно (просто )?пройти/.test(bridgeHint(k)), k);
});

test('up and down: a ramp at 1:1 at most; the high target is reached as far as the slope gets', () => {
    const air = (x, L, z) => (L <= 10 && z <= 0 ? BLOCK.STONE : BLOCK.AIR);
    let p = bridgePlan(air, A, { x: 0, z: 20, L: 30 }); // up 20 over 20 m: 1:1
    assert.ok(p.cells);
    let ys = p.cells.filter((c) => c[0] === 0).map((c) => c[1]);
    assert.ok(Math.min(...ys) >= 10 && Math.max(...ys) >= 29);
    p = bridgePlan(air, A, { x: 0, z: 10, L: 60 }); // far steeper: 1:1 only
    ys = p.cells.map((c) => c[1]);
    assert.ok(Math.max(...ys) <= 21);
    p = bridgePlan((x, L, z) => (L <= 40 && z <= 0 ? BLOCK.STONE : BLOCK.AIR), { x: 0, z: 0, L: 40 }, { x: 0, z: 25, L: 10 }); // down
    ys = p.cells.filter((c) => c[0] === 0).map((c) => c[1]);
    assert.ok(Math.min(...ys) <= 16 && Math.max(...ys) <= 40);
    // every step of a slanting deck is a block or a ramp: neighbours along the way differ by at most one layer
    const col = new Map(); for (const [x, L, z] of p.cells) if (x === 0) col.set(z, Math.max(col.get(z) ?? -1e9, L));
    for (const z of col.keys()) if (col.has(z + 1)) assert.ok(Math.abs(col.get(z + 1) - col.get(z)) <= 1);
});

test('199 / 200 / 201 m: allowed up to 200, the price goes by length', () => {
    const air = (x, L, z) => (L <= 10 && z <= 0 ? BLOCK.STONE : BLOCK.AIR);
    assert.ok(bridgePlan(air, A, { x: 0, z: 199, L: 10 }).cells);
    assert.ok(bridgePlan(air, A, { x: 0, z: 200, L: 10 }).cells);
    assert.equal(bridgePlan(air, A, { x: 0, z: 201, L: 10 }).why, 'far');
    assert.equal(bridgePlan(air, A, { x: 0, z: 1, L: 10 }).why, 'near');
    assert.equal(bridgeExtra(10), 0);
    assert.equal(bridgeExtra(16), 0);
    assert.equal(bridgeExtra(26), 5);
    assert.ok(bridgeExtra(200) >= 90 && bridgeExtra(200) <= 95);
});

test('somebody else\'s building in the way is never replaced; a wall across leaves nothing → \'empty\'', () => {
    const { get } = world(8, 10, { wall: 4 });
    const p = bridgePlan(get, A, { x: 0, z: 8, L: 10 });
    assert.ok(p.cells.every((c) => !(c[2] === 4 && c[1] >= 10 && c[1] <= 14)));
    const sealed = (x, L, z) => (z <= 0 ? BLOCK.STONE : BLOCK.ENCHANTED);
    assert.equal(bridgePlan(sealed, A, { x: 0, z: 6, L: 10 }).why, 'empty');
});

test('ground that is not made yet: waits (never made in the frame)', () => {
    const { get } = world(8);
    assert.equal(bridgePlan(get, A, { x: 0, z: 8, L: 10 }, (x, z) => z < 5).why, 'unknown');
    const data = { raycast: () => null };
    assert.equal(rayTarget(data, { x: 0, y: 12, z: 0 }, { x: 0, y: 0, z: 1 }, 200, (x, z) => z < 50).why, 'unknown');
    assert.equal(rayTarget(data, { x: 0, y: 12, z: 0 }, { x: 0, y: 0, z: 1 }, 200, () => true).why, 'none');
    assert.match(bridgeHint('none'), /не дальше 200 метров/);
});

test('the ray: the target is the solid block hit; the material is the ends\'', () => {
    assert.deepEqual(blockAt({ x: 3.5, y: 8.5, z: 20 }, { x: 0, y: 0, z: 1 }), { x: 4, L: 10, z: 20 });
    const get = (x, L, z) => (z <= 0 ? BLOCK.SAND : z >= 10 ? BLOCK.STONE : BLOCK.AIR);
    const p = bridgePlan((x, L, z) => (L <= 10 ? get(x, L, z) : BLOCK.AIR), A, { x: 0, z: 10, L: 10 });
    assert.ok(p.cells.filter((c) => c[4] < 0.5).every((c) => c[3] === BLOCK.SAND));
    assert.ok(p.cells.filter((c) => c[4] >= 0.5).every((c) => c[3] === BLOCK.STONE));
});

test('no wood: trees, planks and fences give earth; never a wooden block', () => {
    for (const b of [BLOCK.WOOD, BLOCK.LEAVES, BLOCK.PLANKS, BLOCK.PLANKS_DARK, BLOCK.FENCE, BLOCK.BIRCH, BLOCK.DARK_LEAVES]) assert.equal(bridgeMaterial(b), BLOCK.DIRT);
    assert.equal(bridgeMaterial(BLOCK.ENCHANTED), BLOCK.STONE);
});
