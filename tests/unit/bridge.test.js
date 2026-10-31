// «Create a Bridge»: the words, the cost, known from the start, and the plan over a river / a ravine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { START_SPELLS } from '../../src/game/SpellBook.js';
import { SHAPE } from '../../src/world/BlockShapes.js';
import { BLOCK, isWood } from '../../src/world/Terrain.js';
import { bridgePlan, bridgeWords, bridgeMaterials, BRIDGE_MATERIAL_OF, EARTH, bridgeExtra, bridgeHint, blockAt, rayTarget, BRIDGE } from '../../src/game/Bridge.js';

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

test('over a river: five wide, level, rails, only in the empty cells, grows from the hero, banks untouched', () => {
    const { get } = world(8);
    const p = bridgePlan(get, A, { x: 0, z: 8, L: 10 });
    assert.ok(p.cells, p.why);
    const deck = p.cells.filter((c) => c[1] === 10);
    for (const [x, L, z] of p.cells) { assert.ok(z > 0 && z < 8, 'only over the gap: ' + z); assert.ok(Math.abs(x) <= 2 && (L === 10 || L === 11)); }
    assert.equal(deck.length, 5 * 7);
    assert.equal(new Set(deck.map((c) => c[0])).size, 5);
    // rails: half-block slabs on the two edge columns, none in the first / last 3 blocks
    const rails = p.cells.filter((c) => c[1] === 11);
    assert.ok(rails.length > 0 && rails.every((c) => Math.abs(c[0]) === 2 && c[5] === SHAPE.SLAB && c[2] >= 3 && c[2] <= 5));
    // flared slab feet at both ends (outer columns), whole blocks in the middle
    assert.ok(deck.filter((c) => Math.abs(c[0]) === 2 && (c[2] <= 2 || c[2] >= 6)).every((c) => c[5] === SHAPE.SLAB));
    assert.ok(deck.filter((c) => Math.abs(c[0]) < 2).every((c) => !c[5]));
    assert.ok(deck.every((c) => c[3] === BLOCK.GRASS || c[3] === BLOCK.DIRT));
    for (let i = 1; i < p.cells.length; i++) assert.ok(p.cells[i][4] >= p.cells[i - 1][4]);
    assert.ok(!p.raised);
});

test('a lake 30 m wide, target level: perfectly level (no hump, nothing lifted a layer)', () => {
    const { get } = world(30);
    const p = bridgePlan(get, A, { x: 0, z: 30, L: 10 });
    assert.ok(p.cells);
    assert.deepEqual([...new Set(p.cells.filter((c) => !c[5]).map((c) => c[1]))].sort(), [10]);
    assert.ok(p.cells.every((c) => c[1] === 10 || c[1] === 11)); // (11 = the rails only)
    assert.ok(p.cells.filter((c) => c[1] === 11).every((c) => c[5] === SHAPE.SLAB));
});

test('target 6 higher: an even climb of 6 blocks, a straight line, ramps on the steps', () => {
    const air = (x, L, z) => (L <= 10 && z <= 0 ? BLOCK.STONE : BLOCK.AIR);
    const p = bridgePlan(air, A, { x: 0, z: 24, L: 16 });
    assert.ok(p.cells);
    const col = new Map(); for (const [x, L, z, , , sh] of p.cells) if (x === 0 && !sh) col.set(z, Math.max(col.get(z) ?? -1e9, L));
    const zs = [...col.keys()].sort((a, b) => a - b);
    assert.equal(col.get(zs[0]), 10 + Math.round(6 * zs[0] / 24));
    assert.equal(col.get(zs[zs.length - 1]), 16);
    for (let i = 1; i < zs.length; i++) { const d = col.get(zs[i]) - col.get(zs[i - 1]); assert.ok(d === 0 || d === 1, 'no jump higher than a block'); }
    // an even line: every 4 blocks along, one up (±1 for rounding)
    for (const z of zs) assert.ok(Math.abs(col.get(z) - (10 + 6 * z / 24)) <= 0.51, 'z=' + z);
});

test('no river at all: over dry land / a pit / thin air it is built too, with no «can walk here» answer', () => {
    const air = (x, L, z) => (L <= 10 && z <= 0 ? BLOCK.STONE : BLOCK.AIR); // a ledge over nothing, a tower 30 m away
    const p = bridgePlan(air, A, { x: 0, z: 30, L: 10 });
    assert.ok(p.cells && p.cells.length >= 5 * 29, p.why);
    // solid level ground: nothing empty at the feet's level → a raised walkway, still a bridge
    const flat = (x, L) => (L <= 10 ? BLOCK.GRASS : BLOCK.AIR);
    const f = bridgePlan(flat, A, { x: 8, z: 0, L: 10 });
    assert.ok(f.raised && f.cells.length > 0 && f.cells.every((c) => c[1] === 11 && c[5] === SHAPE.SLAB)); // (a low walkway of slabs, no step up to jump)
    for (const k of ['none', 'near', 'far', 'unknown', 'empty']) assert.ok(!/можно (просто )?пройти/.test(bridgeHint(k)), k);
});

test('up and down: a ramp at 1:1 at most; the high target is reached as far as the slope gets', () => {
    const air = (x, L, z) => (L <= 10 && z <= 0 ? BLOCK.STONE : BLOCK.AIR);
    let p = bridgePlan(air, A, { x: 0, z: 20, L: 30 }); // up 20 over 20 m: 1:1 (the line itself)
    assert.ok(p.cells);
    let ys = p.cells.filter((c) => c[0] === 0).map((c) => c[1]);
    assert.ok(Math.min(...ys) >= 10 && Math.max(...ys) >= 19);
    p = bridgePlan(air, A, { x: 0, z: 10, L: 60 }); // far steeper: 1:1 only
    ys = p.cells.filter((c) => !(c[1] > 10 && c[5] === SHAPE.SLAB && Math.abs(c[0]) === 2)).map((c) => c[1]);
    assert.ok(Math.max(...ys) <= 21);
    p = bridgePlan((x, L, z) => (L <= 40 && z <= 0 ? BLOCK.STONE : BLOCK.AIR), { x: 0, z: 0, L: 40 }, { x: 0, z: 25, L: 10 }); // down
    ys = p.cells.filter((c) => c[0] === 0).map((c) => c[1]);
    assert.ok(Math.min(...ys) <= 25 && Math.max(...ys) <= 41);
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

test('the ray: the target is the solid block hit', () => {
    assert.deepEqual(blockAt({ x: 3.5, y: 8.5, z: 20 }, { x: 0, y: 0, z: 1 }), { x: 4, L: 10, z: 20 });
});

test('the material is what is around: stone, sandstone, snow, ice, planks, castle walls; wood only where wood is about', () => {
    const M = (n, f, ar) => bridgeMaterials(n, f, ar);
    assert.deepEqual(M(BLOCK.STONE, BLOCK.STONE), { near: BLOCK.STONE, far: BLOCK.STONE });
    assert.equal(M(BLOCK.SAND, BLOCK.SAND).near, BLOCK.CS_SAND);
    assert.equal(M(BLOCK.SNOW, BLOCK.SNOW).far, BLOCK.SNOW);
    assert.equal(M(BLOCK.ICE, BLOCK.ICE_SHAPE).far, BLOCK.ICE);
    assert.equal(M(BLOCK.PLANKS, BLOCK.PLANKS).near, BLOCK.PLANKS);
    assert.equal(M(BLOCK.COBBLE, BLOCK.GRASS).far, BLOCK.COBBLE); // (the wall at one end, grass at the other: the wall's)
    assert.equal(M(BLOCK.GRASS, BLOCK.CS_WHITE).near, BLOCK.CS_WHITE);
    // grass at both ends: stone if stone is about, planks only if planks / logs are, else earth
    assert.equal(M(BLOCK.GRASS, BLOCK.DIRT, [BLOCK.GRASS, BLOCK.STONE, BLOCK.STONE, BLOCK.GRASS]).near, BLOCK.STONE);
    assert.equal(M(BLOCK.GRASS, BLOCK.GRASS, [BLOCK.GRASS, BLOCK.PLANKS, BLOCK.WOOD, BLOCK.WOOD]).near, BLOCK.PLANKS);
    assert.equal(M(BLOCK.GRASS, BLOCK.GRASS, [BLOCK.GRASS, BLOCK.GRASS, BLOCK.LEAVES, BLOCK.LEAVES]).near, BLOCK.DIRT);
    // nothing fit round the hero (air, water, leaves): stone; over water at both ends: what is around
    assert.equal(M(BLOCK.AIR, BLOCK.WATER, []).near, BLOCK.STONE);
    assert.equal(M(BLOCK.WATER, BLOCK.AIR, [BLOCK.SNOW, BLOCK.SNOW]).far, BLOCK.SNOW);
    // never: leaves, water, air, bedrock, enchanted / ghost stone, a god's gift
    for (const b of [BLOCK.LEAVES, BLOCK.DARK_LEAVES, BLOCK.WATER, BLOCK.AIR, BLOCK.BEDROCK, BLOCK.ENCHANTED, BLOCK.ENCHANTED_SEAT, BLOCK.ARCANE_WARD, BLOCK.GHOST_STONE, BLOCK.GOLD, BLOCK.THATCH]) assert.equal(BRIDGE_MATERIAL_OF[b], undefined, String(b));
    assert.equal(BRIDGE_MATERIAL_OF[BLOCK.GRASS], EARTH);
    // the plan uses them: sand under the feet, stone at the target, a lake between
    const get = (x, L, z) => (L > 10 ? BLOCK.AIR : z <= 0 ? BLOCK.SAND : z >= 10 ? BLOCK.STONE : BLOCK.AIR);
    const p = bridgePlan(get, A, { x: 0, z: 10, L: 10 });
    assert.ok(p.cells.filter((c) => c[4] < 0.5).every((c) => c[3] === BLOCK.CS_SAND));
    assert.ok(p.cells.filter((c) => c[4] >= 0.5).every((c) => c[3] === BLOCK.STONE));
    assert.ok(p.cells.every((c) => !isWood(c[3])));
});

test('every material of the bridge has a strength row (Structure.STUFF): it holds, and falls when its anchor is gone', async () => {
    const { stuffOf } = await import('../../src/world/Structure.js');
    for (const m of new Set(Object.values(BRIDGE_MATERIAL_OF))) if (m !== EARTH) assert.ok(stuffOf(m) && stuffOf(m).carry > 0, String(m));
});
