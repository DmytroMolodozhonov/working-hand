// «Вингардиум Левиоса Максима» (LevitationMaxima.js): its words, its mana, what it does to whom,
// how a tree is pulled out, how a house / a tree lands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { LEV_MAX, WIGGLE, effortNeed, wiggleStep, tearReady, wallCells, earthCells, MAXIMA_TARGETS, levBlocked, houseCells, treeCells, crushDamage, rubbleOf, felledOf, throwOf, voxelGeometry } from '../../src/game/LevitationMaxima.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { SCROLL_SPELL_COLOR } from '../../src/game/ItemTypes.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('the words: «…Максима» is its own spell, the plain «Левиоса» stays plain', () => {
    for (const s of ['Вингардиум Левиоса Максима', 'вингардиум левиоса максима', 'левиоса максима', 'Wingardium Leviosa Maxima', 'leviosa maxima', 'левиоса макс']) assert.equal(matchSpell(s), 'LevitationMaxima', s);
    for (const s of ['Вингардиум Левиоса', 'левиоса', 'wingardium leviosa']) assert.equal(matchSpell(s), 'Levitation', s);
});

test('mana: 50 at once (no wand discount), 2 a second; learnt from a scroll outside Creative', () => {
    assert.equal(SPELL_COST.LevitationMaxima, 50);
    assert.equal(LEV_MAX.COST, 50);
    assert.equal(LEV_MAX.DRAIN, 2);
    assert.ok(SCROLL_SPELL_COLOR.LevitationMaxima);
});

test('magic armour stops the plain «Левиоса», never the Maxima', () => {
    assert.equal(levBlocked({ magicArmor: true }, false), true);
    assert.equal(levBlocked({ armor: { magic: true } }, false), true);
    assert.equal(levBlocked({ magicArmor: true }, true), false);
    assert.equal(levBlocked({}, false), false);
});

test('«на кого и на что»: every creature and thing is decided, with why', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'phoenix', 'dragon', 'servants', 'ships', 'houses', 'trees', 'castleWalls', 'looseThings', 'water', 'ground']) {
        assert.ok(MAXIMA_TARGETS[k]?.why, k);
    }
});

/** A tiny world: a map of blocks. */
function world(cells) {
    const m = new Map(cells.map(([x, L, z, t]) => [x + ',' + L + ',' + z, t]));
    return {
        get: (x, L, z) => m.get(x + ',' + L + ',' + z) || BLOCK.AIR,
        topLayer: (x, z) => { let top = 0; for (const [k, t] of m) { const [cx, cL, cz] = k.split(',').map(Number); if (cx === x && cz === z && t && cL > top) top = cL; } return top; },
    };
}

test('a house: its walls and roof, not the ground under it nor the tree beside it', () => {
    const cells = [];
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) cells.push([x, 9, z, BLOCK.DIRT]); // the ground
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) cells.push([x, 10, z, BLOCK.PLANKS]); // the floor
    for (let L = 11; L <= 13; L++) cells.push([-2, L, 0, BLOCK.PLASTER], [2, L, 0, BLOCK.PLASTER]);
    cells.push([0, 14, 0, BLOCK.ROOF_RED], [3, 10, 3, BLOCK.WOOD]);
    const h = { c: { x: 0, y: 9.5, z: 0 }, r: 3 };
    const got = houseCells(world(cells), h);
    assert.equal(got.filter((c) => c[3] === BLOCK.PLANKS).length, 25);
    assert.ok(got.some((c) => c[3] === BLOCK.ROOF_RED));
    assert.ok(!got.some((c) => c[3] === BLOCK.DIRT || c[3] === BLOCK.WOOD));
});

test('a tree: its wood and leaves and a lump of earth on its roots', () => {
    const cells = [];
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) { cells.push([x, 8, z, BLOCK.DIRT]); cells.push([x, 9, z, BLOCK.GRASS]); }
    for (let L = 10; L <= 14; L++) cells.push([0, L, 0, BLOCK.WOOD]);
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) cells.push([x, 15, z, BLOCK.LEAVES]);
    const t = treeCells(world(cells), 0, 12, 0);
    assert.deepEqual(t.foot, [0, 10, 0]);
    assert.equal(t.cells.filter((c) => c[3] === BLOCK.WOOD).length, 5);
    assert.equal(t.cells.filter((c) => c[3] === BLOCK.LEAVES).length, 9);
    assert.ok(t.earth >= 9, 'the lump of earth');
    assert.equal(treeCells(world(cells), 0, 9, 0), null, 'grass is no tree');
    // logs with no crown (a wall of logs, a magic house's wall): no tree — no roots under it
    const wall = [];
    for (let L = 10; L <= 13; L++) for (let x = 0; x <= 3; x++) wall.push([x, L, 0, BLOCK.WOOD]);
    assert.equal(treeCells(world(wall), 1, 11, 0), null, 'logs alone are no tree');
    assert.ok(wallCells(world(wall), 1, 11, 0)?.length >= 4, 'they are a wall');
});

test('a house breaks as it fell: toppled the way it flew (or leaned), crushed on the side that struck', () => {
    const cells = [];
    for (let L = 10; L <= 17; L++) for (let x = 0; x <= 6; x++) for (let z = 0; z <= 6; z++) if (x === 0 || x === 6 || z === 0 || z === 6 || L === 10) cells.push([x, L, z, BLOCK.PLANKS]);
    const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const heap = (how, seed = 7) => rubbleOf(cells, 0, 0, () => 9, rng(seed), 0.5, how);
    const meanX = (r) => r.set.reduce((a, c) => a + c[0], 0) / r.set.length;
    const east = heap({ v: [12, -3, 0], h: 6 }), west = heap({ v: [-12, -3, 0], h: 6 });
    assert.ok(meanX(east) > 3 + 1 && meanX(west) < 3 - 1, `thrown east it lies east, west — west: ${meanX(east)} ${meanX(west)}`);
    assert.equal(east.set.length + east.broken.length, cells.length);
    // the side that struck first breaks more than the back
    const lead = east.broken.filter((c) => c[0] >= 5).length, back = east.broken.filter((c) => c[0] <= 1).length;
    assert.ok(lead > back, `the leading side crushed: ${lead} > ${back}`);
    // dropped straight down, leaning to +z: it goes over that way
    const meanZ = (r) => r.set.reduce((a, c) => a + c[2], 0) / r.set.length;
    assert.ok(meanZ(heap({ v: [0, -9, 0], h: 8, tilt: [0.1, 0] })) > 3.5, 'it goes over the way it leaned');
    // the higher the fall, the more of it breaks; never the same heap twice
    assert.ok(heap({ v: [6, -3, 0], h: 14 }).broken.length > heap({ v: [6, -3, 0], h: 1 }).broken.length);
    assert.notDeepEqual(heap({ v: [6, -3, 0], h: 6 }, 3).set, heap({ v: [6, -3, 0], h: 6 }, 11).set);
});

/** Rock the wand for `sec` s: side to side by ±amp rad at `hz`, pointing `up` rad higher than at first. */
function rock(W, { amp = 0.15, hz = 1, up = 0.4, sec = 10, t0 = 0, axis = 'yaw' } = {}) {
    const dt = 1 / 30;
    let t = t0;
    W.base || wiggleStep(W, { yaw: 0, pitch: 0, rel: 1 }, t, dt);
    for (let i = 0; i < sec / dt; i++) {
        t += dt;
        const w = amp * Math.sin(2 * Math.PI * hz * t);
        wiggleStep(W, { yaw: axis === 'yaw' ? w : 0, pitch: up + (axis === 'pitch' ? w : 0), rel: 1 }, t, dt);
    }
    return t;
}

test('like pulling a tooth: rocking the wand to and fro and pulling up loosens it — nothing by itself', () => {
    // held still (even pulled up hard): nothing
    const still = {};
    rock(still, { amp: 0, up: 0.6, sec: 20 });
    assert.equal(still.effort, 0, 'no rocking — no loosening');
    assert.equal(tearReady(still, effortNeed('tree', 60)), false);
    // a slow steady pull without rocking: nothing either
    const pull = {};
    wiggleStep(pull, { yaw: 0, pitch: 0, rel: 1 }, 0, 0.1);
    for (let i = 1; i <= 100; i++) wiggleStep(pull, { yaw: 0, pitch: i * 0.006, rel: 1 + i * 0.004 }, i * 0.1, 0.1);
    assert.equal(pull.effort, 0, 'pulling alone does not tear it out');
    // rocking and pulling: a tree comes out in some seconds, not at once
    const W = {};
    rock(W, { sec: 1.5 });
    assert.equal(tearReady(W, effortNeed('tree', 60)), false, 'not at once');
    rock(W, { sec: 12, t0: 1.5 });
    assert.ok(tearReady(W, effortNeed('tree', 60)), 'rocked and pulled — it comes out');
    // up and down works too
    const V = {};
    rock(V, { axis: 'pitch', sec: 14 });
    assert.ok(V.effort > 0);
});

test('the harder one rocks (bigger, brisker swings, pulling up), the faster it loosens; a tremble does nothing', () => {
    const e = (o) => { const W = {}; rock(W, { sec: 6, ...o }); return W.effort; };
    assert.ok(e({ amp: 0.2 }) > e({ amp: 0.08 }), 'bigger swings');
    assert.ok(e({ up: 0.4 }) > e({ up: 0 }) * 2, 'pulling up');
    assert.ok(e({ hz: 1 }) > e({ hz: 0.2 }), 'brisk, not dawdling');
    assert.equal(e({ amp: 0.015, hz: 4 }), 0, 'the camera\'s tremble is no rocking');
});

test('stop rocking: it settles back; not pulling at the end: it stays in', () => {
    const W = {};
    const t = rock(W, { sec: 8 });
    const had = W.effort;
    rock(W, { amp: 0, sec: 6, t0: t });
    assert.ok(W.effort < had, 'settles back');
    const U = {};
    rock(U, { sec: 30, up: 0 });
    assert.equal(tearReady(U, 0.1), false, 'loose, but not pulled up');
});

test('heavier — more effort: a house more than a tree, a tree more than a piece of a wall or a lump of earth', () => {
    assert.ok(effortNeed('house', 400) > effortNeed('tree', 60));
    assert.ok(effortNeed('tree', 60) > effortNeed('wall', 20));
    assert.ok(effortNeed('wall', 50) > effortNeed('wall', 10));
    assert.ok(effortNeed('earth', 16) > 0);
});

test('a piece of a wall: the built blocks round the one pointed at — not the ground, not a house', () => {
    const cells = [];
    for (let x = -4; x <= 4; x++) for (let z = -2; z <= 2; z++) cells.push([x, 9, z, BLOCK.DIRT]);
    for (let x = -4; x <= 4; x++) for (let L = 10; L <= 16; L++) cells.push([x, L, 0, BLOCK.CS_GREY]);
    const got = wallCells(world(cells), 0, 13, 0);
    assert.ok(got.length >= 9 && got.length <= 20, 'a piece, not the whole wall: ' + got.length);
    assert.ok(got.every((c) => c[3] === BLOCK.CS_GREY));
    assert.equal(wallCells(world(cells), 0, 9, 0), null, 'the ground is no wall');
    const noHouse = wallCells(world(cells), 0, 13, 0, (x) => x > 0);
    assert.ok(noHouse.every((c) => c[0] <= 0), 'a house\'s blocks stay');
});

test('a lump of earth: a bowl of the ground; where something stands — left', () => {
    const cells = [];
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) { cells.push([x, 7, z, BLOCK.BEDROCK], [x, 8, z, BLOCK.DIRT], [x, 9, z, BLOCK.DIRT], [x, 10, z, BLOCK.GRASS]); }
    cells.push([1, 11, 0, BLOCK.CS_GREY]); // a wall stands there
    const e = earthCells(world(cells), 0, 10, 0);
    assert.ok(e.cells.length >= 8);
    assert.ok(e.cells.some((c) => c[0] === 0 && c[2] === 0 && c[1] === 8), 'deeper in the middle');
    assert.ok(!e.cells.some((c) => c[0] === 1 && c[2] === 0), 'not from under the wall');
    assert.ok(!e.cells.some((c) => c[3] === BLOCK.BEDROCK));
});

test('landing: a dropped house is a heap (half breaks), a felled tree lies along its fall, the higher the worse it hurts', () => {
    const cells = [];
    for (let L = 10; L <= 15; L++) for (let x = 0; x <= 2; x++) cells.push([x, L, 0, BLOCK.PLANKS]);
    let i = 0;
    const rnd = () => ((i++ * 0.37) % 1);
    const r = rubbleOf(cells, 5, 0, () => 4, rnd);
    assert.equal(r.set.length + r.broken.length, cells.length);
    assert.ok(r.broken.length > 4 && r.set.length > 4);
    for (const c of r.set) assert.ok(c[0] >= 5 && c[0] <= 7 && c[1] >= 5, 'on the ground where it fell');
    const trunk = [[0, 10, 0, BLOCK.WOOD], [0, 11, 0, BLOCK.WOOD], [0, 12, 0, BLOCK.WOOD], [0, 9, 0, BLOCK.DIRT]];
    const f = felledOf(trunk, [0, 10, 0], 'x', () => 4, () => 0.9);
    assert.deepEqual(f.set.map((c) => c[0]), [0, 1, 2], 'along +x');
    assert.ok(f.set.every((c) => c[1] === 5), 'lying on the ground');
    assert.ok(crushDamage('house', 10) > crushDamage('house', 1));
    assert.ok(crushDamage('ship', 30) <= 45);
});

test('a throw is a real swing of the arm: far and fast, not a slow move, not a camera jump, not at once', () => {
    const swing = (step, carried = 2) => { const h = []; let v = null; for (let i = 0; i <= 8; i++) v = throwOf(h, i * 0.03, { x: i * step, y: 1, z: 0 }, carried) || v; return v; };
    assert.ok(swing(0.2)?.x > 4, 'a fast swing throws');
    assert.equal(swing(0.02), null, 'a slow move carries');
    assert.equal(swing(0.2, 0.3), null, 'not in the first moment');
    const h = []; let v = null;
    for (let i = 0; i <= 8; i++) v = throwOf(h, i * 0.03, { x: i === 4 ? 3 : 0, y: 1, z: 0 }, 2) || v;
    assert.equal(v, null, 'the camera losing the hand for a frame is no throw');
});

test('the carried house is drawn from its own blocks: only the outer faces, with the world\'s patterns', () => {
    const cells = [[0, 10, 0, BLOCK.PLANKS], [1, 10, 0, BLOCK.PLANKS]];
    const geo = voxelGeometry(cells, 0, 10, 0);
    assert.equal(geo.getAttribute('position').count, 10 * 4, 'two blocks side by side: 10 faces');
    assert.ok(geo.getAttribute('voxPat').array.some((p) => p > 0), 'planks keep their pattern');
});
