// «Breakthrough»: the words, the price, the scroll, and the wall's plan (size, material, the places it refuses).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { START_SPELLS } from '../../src/game/SpellBook.js';
import { firstSpellGain } from '../../src/game/Mana.js';
import { SCROLL_WEIGHTS } from '../../src/game/ItemTypes.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { breakthroughPlan, columnMaterial, columnHeight, wallMaterial, BREAKTHROUGH } from '../../src/game/Breakthrough.js';

test('Breakthrough remains the only word and scroll; old knowledge and scrolls migrate', async () => {
    const { knows, scrollKey, knownScrollKeys } = await import('../../src/game/SpellBook.js');
    const { retireScroll, retireScrollsIn } = await import('../../src/game/ItemTypes.js');
    for (const t of ['Breakthrough', 'брейкфру', 'break through']) assert.equal(matchSpell(t), 'Breakthrough');
    for (const t of ['Groundprud', 'ground prud', 'граундпруд', 'граунт прут']) assert.equal(matchSpell(t), null);
    assert.equal(SPELL_COST.Breakthrough, 10);
    assert.equal(firstSpellGain('Breakthrough'), 2);
    assert.ok(!START_SPELLS.has('Breakthrough'));
    assert.ok(SCROLL_WEIGHTS.some(([n, w]) => n === 'Breakthrough' && w > 0));
    assert.ok(!SCROLL_WEIGHTS.some(([n]) => n === 'Groundprud'));
    assert.ok(knows('Breakthrough', { mode: 'freeworld', spells: { Groundprud: true } }));
    assert.ok(knows('BreakthroughMaxima', { mode: 'freeworld', learned: new Set(['Groundprud']) }));
    const old = { kind: 'scroll', stat: 'spell', spell: 'Groundprud', uid: 'same' };
    retireScroll(old); assert.equal(old.spell, 'Breakthrough'); assert.equal(old.uid, 'same');
    const nested = { chest: [{ ...old, spell: 'Groundprud' }] }; retireScrollsIn(nested);
    assert.equal(nested.chest[0].spell, 'Breakthrough');
    assert.equal(scrollKey(old), 's:Breakthrough');
    assert.ok(knownScrollKeys({ spells: { Groundprud: true } }).has('s:Breakthrough'));
});

/** A flat world: the ground at layer 10 of `kind(x, z)`; `set` holds what was laid. */
function world(kind = () => BLOCK.GRASS, water = () => false) {
    const set = new Map();
    const top = () => 10;
    const get = (x, L, z) => {
        const k = x + ',' + L + ',' + z;
        if (set.has(k)) return set.get(k);
        if (L <= 10) return kind(x, z);
        return water(x, z) && L === 11 ? BLOCK.WATER : BLOCK.AIR;
    };
    return { get, top, set };
}
const A = { x: 0, z: 10, L: 10 }, F = { x: 0, z: 1 };

test('the plan: 7 wide, 2 thick, 6 high ±1 at the edges, standing on the ground (no column hangs)', () => {
    const { get, top } = world();
    const p = breakthroughPlan(get, top, A, F, 12345);
    assert.ok(p.cells, p.why);
    const wall = p.cells.filter(([, , , , , c]) => c.h > 1);
    const xs = new Set(wall.map((c) => c[0])), zs = new Set(wall.map((c) => c[2]));
    assert.equal(xs.size, 7, 'seven across');
    assert.equal(zs.size, 2, 'two thick');
    for (const c of p.cols) assert.ok(c.h >= 5 && c.h <= 7, 'six ±1: ' + c.h);
    assert.ok(Math.max(...p.cols.map((c) => c.h)) <= BREAKTHROUGH.H + 1);
    // every cell stands right on the ground or on the cell under it
    const have = new Set(p.cells.map((c) => c[0] + ',' + c[1] + ',' + c[2]));
    for (const [x, L, z] of p.cells) assert.ok(L === 11 || have.has(x + ',' + (L - 1) + ',' + z), 'hangs: ' + [x, L, z]);
    const tmax = Math.max(...p.cells.map((c) => c[4]));
    assert.ok(tmax <= BREAKTHROUGH.GROW + 1e-9 && tmax > BREAKTHROUGH.GROW * 0.8, 'about a second: ' + tmax);
});

test('the crest is the same for the same seed on every computer, and not a flat board', () => {
    const { get, top } = world();
    const a = breakthroughPlan(get, top, A, F, 77), b = breakthroughPlan(get, top, A, F, 77);
    assert.deepEqual(a.cols.map((c) => c.h), b.cols.map((c) => c.h));
    const hs = new Set(); for (const s of [1, 2, 3, 4, 5, 6]) for (const c of breakthroughPlan(get, top, A, F, s).cols) hs.add(c.h);
    assert.ok(hs.size >= 2, 'toothed');
});

test('the material of each column is the ground under it: stone, sand, earth with grass on top, snow, gravel', () => {
    const { get, top } = world((x) => (x < -1 ? BLOCK.STONE : x > 1 ? BLOCK.SAND : BLOCK.GRASS));
    const p = breakthroughPlan(get, top, A, F, 3);
    const byX = (x) => p.cells.filter((c) => c[0] === x && c[1] === 11 && c[5].h > 1).map((c) => c[3]);
    assert.ok(byX(-3).every((b) => b === BLOCK.STONE));
    assert.ok(byX(3).every((b) => b === BLOCK.SAND));
    const grassTop = p.cells.filter((c) => c[0] === 0 && c[6] === c[5].h - 1);
    assert.ok(grassTop.length && grassTop.every((c) => c[3] === BLOCK.GRASS), 'grass cap');
    assert.ok(p.cells.filter((c) => c[0] === 0 && c[6] === 0 && c[5].h > 1 && c[5].h > 1).every((c) => c[3] === BLOCK.DIRT), 'earth below the cap');
    assert.equal(wallMaterial(BLOCK.SNOW), BLOCK.SNOW);
    assert.equal(wallMaterial(BLOCK.GRAVEL), BLOCK.GRAVEL);
    assert.equal(wallMaterial(BLOCK.FARMLAND), BLOCK.DIRT);
});

test('no wood, leaves, ice or building blocks: the earthy block lower down; nothing known → earth', () => {
    const get = (x, L) => (L === 10 ? BLOCK.PLANKS : L === 9 ? BLOCK.STONE : L < 9 ? BLOCK.STONE : BLOCK.AIR);
    assert.equal(columnMaterial(get, 0, 10, 0), BLOCK.STONE);
    assert.equal(columnMaterial(() => BLOCK.PLANKS, 0, 10, 0), BLOCK.DIRT);
    assert.equal(wallMaterial(BLOCK.ICE), null);
    assert.equal(wallMaterial(BLOCK.WATER), null);
});

test('it refuses the enchanted stone and the gifts of the gods (the columns are left out; a whole strip of them: no spell)', () => {
    const half = world((x) => (x < 0 ? BLOCK.ENCHANTED : BLOCK.STONE));
    const p = breakthroughPlan(half.get, half.top, A, F, 5);
    assert.ok(p.cells && p.cells.every((c) => c[0] >= 0), 'grows only on the free half');
    const all = world(() => BLOCK.ENCHANTED);
    assert.equal(breakthroughPlan(all.get, all.top, A, F, 5).why, 'holy');
    const gift = world();
    assert.equal(breakthroughPlan(gift.get, gift.top, A, F, 5, () => true).why, 'holy');
    const part = breakthroughPlan(gift.get, gift.top, A, F, 5, (x) => x > 0);
    assert.ok(part.cells.every((c) => c[0] <= 0), 'a gift on one side: only the other grows');
});

test('it refuses water, and a column with something already above the ground', () => {
    const lake = world(() => BLOCK.GRASS, () => true);
    assert.equal(breakthroughPlan(lake.get, lake.top, A, F, 1).why, 'water');
    const w = world(() => BLOCK.GRASS, (x) => x > 0);
    const p = breakthroughPlan(w.get, w.top, A, F, 1);
    assert.ok(p.cells.every((c) => c[0] <= 0), 'dry columns only');
});

test('a column far above or below the spot is left out (no pillars over a cliff)', () => {
    const get = (x, L) => (L <= (x > 1 ? 20 : 10) ? BLOCK.STONE : BLOCK.AIR);
    const top = (x) => (x > 1 ? 20 : 10);
    const p = breakthroughPlan(get, top, A, F, 9);
    assert.ok(p.cells.every((c) => c[0] <= 1));
});

test('the two-arm gesture is required; ordinary and Maxima use the new ground rise and pay once', async () => {
    const { Game } = await import('../../src/game/Game.js');
    const { Breakthrough } = await import('../../src/game/Breakthrough.js');
    for (const max of [false, true]) {
        const { get, top, set } = world();
        const sent = [], rewards = [], spells = [], paid = [];
        const g = { localId: 'me', terrain: { data: { get, topLayer: top, set: (x,L,z,b) => set.set(x+','+L+','+z,b) } },
            character: { group: new THREE.Group() }, combat: { check: () => null, pay: n => paid.push(n) },
            hud: { setVoice() {} }, fx: { spark() {} }, builder: { _sendEdits: x => sent.push(...x) },
            mana: { success: n => rewards.push(n) }, spells: { spells }, sync: { spell() {} } };
        g.character.group.position.set(0,11.5,0); g.breakthrough = new Breakthrough(g);
        g._raiseWall = Game.prototype._raiseWall;
        const name = max ? 'BreakthroughMaxima' : 'Breakthrough';
        assert.equal(Game.prototype._castBreakthrough.call(g, name, true), null, 'voice alone cannot raise it');
        g._bt.riseAt = performance.now();
        assert.equal(Game.prototype._castBreakthrough.call(g, name, true), name);
        assert.deepEqual(paid, [name]);
        const task = spells[0]; for (let t = 0; t < 5 && task.life > 0; t += .05) task.onUpdate(task,.05);
        assert.ok(sent.length > (max ? 100 : 60), 'actual solid terrain is laid');
        assert.ok(sent.every(x => x[3] === BLOCK.DIRT || x[3] === BLOCK.GRASS), 'uses the ground, not a fixed stone slab');
        assert.deepEqual(rewards, [name]);
        assert.equal(g._bt.rising, undefined, 'old row animation is gone');
        const blocked = new Breakthrough({ ...g, wards: { forbids: () => true } });
        assert.equal(blocked.cast(max), null); assert.equal(paid.length,1, 'rejected terrain is free');
    }
});

test('the height of a column: six, ±1 at the edges only', () => {
    for (let i = 0; i < 200; i++) {
        assert.ok([5, 6].includes(columnHeight(i, i * 3, i * 7, 0)));
        assert.ok([5, 6, 7].includes(columnHeight(i, i * 3, i * 7, 3)));
    }
});

test('grow(): the caster lays the blocks in about a second, a body in a cell holds its column, others only watch', async () => {
    const { Breakthrough } = await import('../../src/game/Breakthrough.js');
    const make = (bodyAt = null) => {
        const { get, top, set } = world();
        const sent = [];
        const data = { get, topLayer: top, set: (x, L, z, b) => set.set(x + ',' + L + ',' + z, b), shapeAt: () => 0 };
        const spells = [];
        const g = {
            localId: 'me', terrain: { data }, spells: { spells }, fx: { spark() {} }, sound: {}, mana: { success() {} },
            builder: { _sendEdits: (l) => sent.push(...l) },
            duel: { _bodies: () => (bodyAt ? [{ a: { x: bodyAt.x, y: 9.8, z: bodyAt.z }, b: { x: bodyAt.x, y: 11.5, z: bodyAt.z }, r: 0.4 }] : []) },
        };
        return { g, sent, spells, set };
    };
    const run = (spells, secs) => { const s = spells[0]; for (let t = 0; t < secs && s.life > 0; t += 0.05) s.onUpdate(s, 0.05); return s; };
    const a = make();
    new Breakthrough(a.g).grow({ x: 0, y: 10, z: 10 }, { x: 0, y: 0, z: 1 }, 'me');
    const s = run(a.spells, 1);
    assert.ok(a.sent.length > 0 && a.sent.length < 100, 'half-grown at one second: ' + a.sent.length);
    run(a.spells, 4);
    assert.ok(a.sent.length >= 60 && a.sent.length <= 110, 'a wall of ~70 blocks (+ scree): ' + a.sent.length);
    assert.ok(s.life <= 0, 'it ends');
    const b = make({ x: 0, z: 10 });
    new Breakthrough(b.g).grow({ x: 0, y: 10, z: 10 }, { x: 0, y: 0, z: 1 }, 'me');
    run(b.spells, 6);
    assert.ok(!b.sent.some(([x, , z]) => x === 0 && z === 10), 'no block into the body, and none hung above it');
    assert.ok(b.sent.length > 40);
    const c = make();
    new Breakthrough(c.g).grow({ x: 0, y: 10, z: 10 }, { x: 0, y: 0, z: 1 }, 'other');
    run(c.spells, 6);
    assert.equal(c.sent.length, 0, 'the others lay nothing: the blocks come from the caster');
    // the earth seen rising: one mesh of the wall's own blocks while it grows, gone after
    const d = make();
    d.g.scene = new THREE.Scene();
    new Breakthrough(d.g).grow({ x: 0, y: 10, z: 10 }, { x: 0, y: 0, z: 1 }, 'me');
    run(d.spells, 0.4);
    assert.equal(d.g.scene.children.length, 1, 'the rising earth (one mesh, the world\'s block material) is in the scene');
    run(d.spells, 6);
    assert.equal(d.g.scene.children.length, 0, 'and out of it at the end');
});

test('в пещере стена видит пол под потолком, а не поверхность над ним', async () => {
    const { groundTopNear } = await import('../../src/game/Breakthrough.js');
    // колонка: пол на слое 0, воздух до слоя 9, потолок-порода с 10 до поверхности 30
    const data = { topLayer: () => 30, get: (x, L) => (L <= 0 || L >= 10 ? 3 : 0), floorBelow: (x, z, L) => { for (let l = L; l >= -5; l--) if (l <= 0 || l >= 10) return l; return -6; } };
    assert.equal(groundTopNear(data, 0)(0, 0), 0, 'пол пещеры, не слой 30');
    const hill = { topLayer: () => 9, get: () => 3, floorBelow: () => 3 };
    assert.equal(groundTopNear(hill, 0)(0, 0), 9, 'холм впереди — его верх, как раньше');
});
