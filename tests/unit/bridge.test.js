// «Create a Bridge»: the words, the cost, known from the start, and the plan over a river / a ravine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { START_SPELLS } from '../../src/game/SpellBook.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { bridgePlan, bridgeWords } from '../../src/game/Bridge.js';

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

test('the plan: a deck three wide over the river, beams and a railing only over the gap, nothing on the banks', () => {
    const { get, top } = world(8);
    const p = bridgePlan(get, top, { x: 0, z: -1, L: 10 }, { x: 0, z: 9, L: 10 });
    assert.ok(p.cells, p.why);
    for (const [x, L, z, b] of p.cells) {
        assert.ok(z > 0 && z < 8, 'only over the gap: ' + z);
        if (L === 10) assert.ok(Math.abs(x) <= 2);
        if (Math.abs(x) <= 1) assert.equal(L, 10, 'level deck');
        if (L === 11) assert.ok(Math.abs(x) === 2 && (b === BLOCK.FENCE || b === BLOCK.PLANKS_DARK), 'railing at the sides');
    }
    const deck = p.cells.filter((c) => c[3] === BLOCK.PLANKS);
    assert.equal(deck.length, 3 * 7);
    for (let i = 1; i < p.cells.length; i++) assert.ok(p.cells[i][4] >= p.cells[i - 1][4], 'grows from the near bank');
});

test('the plan: a gentle slope up to a higher bank; too steep, too far, too near, no gap — a reason', () => {
    let w = world(8, 12);
    let p = bridgePlan(w.get, w.top, { x: 0, z: -1, L: 10 }, { x: 0, z: 9, L: 12 });
    assert.ok(p.cells);
    const mid = p.cells.filter((c) => c[0] === 0 && c[3] === BLOCK.PLANKS).map((c) => c[1]);
    assert.ok(Math.min(...mid) >= 10 && Math.max(...mid) <= 12 && new Set(mid).size >= 2);
    w = world(4, 16);
    assert.equal(bridgePlan(w.get, w.top, { x: 0, z: -1, L: 10 }, { x: 0, z: 5, L: 16 }).why, 'steep');
    w = world(30);
    assert.equal(bridgePlan(w.get, w.top, { x: 0, z: -1, L: 10 }, { x: 0, z: 31, L: 10 }).why, 'far');
    assert.equal(bridgePlan(w.get, w.top, { x: 0, z: -1, L: 10 }, { x: 0, z: 0, L: 10 }).why, 'near');
    const flat = { get: (x, L) => (L <= 10 ? BLOCK.GRASS : BLOCK.AIR), top: () => 10 };
    assert.equal(bridgePlan(flat.get, flat.top, { x: 0, z: 0, L: 10 }, { x: 8, z: 0, L: 10 }).why, 'nogap');
    // over a stone ravine: a bridge of stone
    const stone = { get: (x, L, z) => (L <= (z <= 0 || z >= 6 ? 10 : 2) ? BLOCK.STONE : BLOCK.AIR), top: (x, z) => (z <= 0 || z >= 6 ? 10 : 2) };
    p = bridgePlan(stone.get, stone.top, { x: 0, z: -1, L: 10 }, { x: 0, z: 7, L: 10 });
    assert.ok(p.stone && p.cells.some((c) => c[3] === BLOCK.COBBLE));
});
