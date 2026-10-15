// «Вингардиум Левиоса Максима» (LevitationMaxima.js): its words, its mana, what it does to whom,
// how a tree is pulled out, how a house / a tree lands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { LEV_MAX, PULL, LOOSEN, MAXIMA_TARGETS, levBlocked, houseCells, treeCells, pullStep, crushDamage, rubbleOf, felledOf, throwOf, voxelGeometry } from '../../src/game/LevitationMaxima.js';
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
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'phoenix', 'dragon', 'servants', 'ships', 'houses', 'trees', 'looseThings', 'water', 'ground']) {
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
});

test('pulling a tree out: only a hand going UP pulls; it takes several tugs and some seconds', () => {
    assert.equal(pullStep(null, { rel: 1, pitch: 0 }), 0);
    assert.equal(pullStep({ rel: 1, pitch: 0 }, { rel: 0.5, pitch: 0 }), 0, 'down pulls nothing');
    assert.ok(Math.abs(pullStep({ rel: 1, pitch: 0 }, { rel: 1.4, pitch: 0 }) - 0.4) < 1e-9);
    assert.ok(PULL.tree > 1.5 && PULL.tree > PULL.house);
    assert.ok(LOOSEN.tree >= 2.5, 'not at once');
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
