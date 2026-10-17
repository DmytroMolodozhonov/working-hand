// «Wind Impulse», «Drawdown», «Liquidation», «Stitching», «Invisibility»: words, costs, and the pure rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { SCROLL_SPELL_COLOR } from '../../src/game/ItemTypes.js';
import { impulsePush } from '../../src/game/WindImpulse.js';
import { pressOf, depthOf, sinkColumn } from '../../src/game/Drawdown.js';
import { blockVerdict, liquidationNeedsMaxima } from '../../src/game/Liquidation.js';
import { findPassage } from '../../src/game/Stitching.js';
import { cluePos } from '../../src/game/Invisibility.js';
import { pointsUp, pointsAtSelf } from '../../src/game/WandAim.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('the words: each spell (and its «Максима»), never mixed up with «Вайнд», «Protection Invisible», «Lightning Writing»', () => {
    const want = {
        'вайнд импульс': 'WindImpulse', 'wind impulse maxima': 'WindImpulseMaxima', 'винд импульс максима': 'WindImpulseMaxima',
        'дравдаун': 'Drawdown', 'дродаун максима': 'DrawdownMaxima', 'draw down': 'Drawdown',
        'ликвидейшн': 'Liquidation', 'liquidation maxima': 'LiquidationMaxima', 'стичинг': 'Stitching', 'ститчинг': 'Stitching',
        'инвизибл': 'Invisibility', 'invisibility': 'Invisibility',
        'вайнд': 'Wind', 'вайнд максима': 'WindMaxima', 'протекшн инвизибл': 'ProtectionInvisible', 'лайтнинг райтинг': 'Draw', 'земля проседает': null,
    };
    for (const [w, s] of Object.entries(want)) assert.equal(matchSpell(w), s, w);
});

test('mana and scrolls as the author said', () => {
    assert.deepEqual([SPELL_COST.WindImpulse, SPELL_COST.WindImpulseMaxima, SPELL_COST.Drawdown, SPELL_COST.DrawdownMaxima, SPELL_COST.Liquidation, SPELL_COST.LiquidationMaxima, SPELL_COST.Stitching, SPELL_COST.Invisibility], [10, 40, 5, 20, 10, 25, 7, 20]);
    assert.ok(SCROLL_SPELL_COLOR.WindImpulse && SCROLL_SPELL_COLOR.Invisibility, 'Wind Impulse and Invisibility: only from a scroll');
    assert.ok(!SCROLL_SPELL_COLOR.Stitching && !SCROLL_SPELL_COLOR.Liquidation, 'known from the start');
    assert.ok(SCROLL_SPELL_COLOR.Drawdown && SCROLL_SPELL_COLOR.LiquidationMaxima, 'Drawdown and Liquidation Maxima: from a scroll (the author)');
});

test('«Wind Impulse»: away from the caster in every direction, 3 m (Maxima 9 m)', () => {
    const o = new THREE.Vector3(0, 1, 0);
    for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [1.4, -1.4]]) {
        const v = impulsePush('WindImpulse', o, new THREE.Vector3(x, 1, z));
        assert.ok(v && v.x * x + v.z * z > 0 && v.y > 0, `${x},${z}`);
    }
    assert.equal(impulsePush('WindImpulse', o, new THREE.Vector3(4, 1, 0)), null);
    assert.ok(impulsePush('WindImpulseMaxima', o, new THREE.Vector3(8, 1, 0)));
    assert.ok(impulsePush('WindImpulse', o, new THREE.Vector3(1, 1, 0)).length() > impulsePush('WindImpulse', o, new THREE.Vector3(2.5, 1, 0)).length());
});

test('«Drawdown»: pressed under the wand, a bowl that deepens where it is held; the whole column goes down — the house on it too', () => {
    // held on one place: under the wand one layer a step, the edge less, nothing beyond the bowl
    const held = (dist, steps) => depthOf('Drawdown', steps * pressOf('Drawdown', dist));
    assert.ok(held(0, 1) === 1 && held(0, 3) === 3 && held(0, 99) === 6 && held(2.5, 3) < held(0, 3) && held(4, 3) === 0);
    assert.ok(pressOf('DrawdownMaxima', 5) > 0 && pressOf('Drawdown', 5) === 0);
    // a column: stone ≤ 0, dirt 1, grass 2, a wall (brick) 3–4 standing on it
    const col = { 0: BLOCK.STONE, 1: BLOCK.DIRT, 2: BLOCK.GRASS, 3: BLOCK.BRICK, 4: BLOCK.BRICK };
    const get = (x, L) => (L in col ? col[L] : L < 0 ? BLOCK.STONE : BLOCK.AIR);
    const s = sinkColumn(get, 0, 0, 4);
    const after = { ...col };
    for (const [, L, , t] of s.edits) after[L] = t;
    assert.deepEqual([after[1], after[2], after[3], after[4]], [BLOCK.GRASS, BLOCK.BRICK, BLOCK.BRICK, BLOCK.AIR]);
    assert.equal(sinkColumn((x, L) => (L === 2 ? BLOCK.GRASS : L === 3 ? BLOCK.WATER : L < 2 ? BLOCK.DIRT : BLOCK.AIR), 0, 0, 2), null, 'a lake\'s bed stays');
});

test('«Liquidation»: dust for the plain, «Максима» for the magic, nothing for the living', () => {
    assert.equal(blockVerdict(BLOCK.BRICK, false), 'dust');
    assert.equal(blockVerdict(BLOCK.ARCANE, false), 'maxima');
    assert.equal(blockVerdict(BLOCK.ARCANE, true), 'dust');
    assert.equal(blockVerdict(BLOCK.WOOD, true), 'alive');
    assert.equal(blockVerdict(BLOCK.BEDROCK, true), 'none');
    assert.ok(!liquidationNeedsMaxima({ kind: 'cheese' }) && !liquidationNeedsMaxima({ kind: 'weapon', magic: false }));
    assert.ok(liquidationNeedsMaxima({ kind: 'wand' }) && liquidationNeedsMaxima({ kind: 'weapon', magic: true }) && liquidationNeedsMaxima({ kind: 'potion' }));
});

test('«Stitching»: a doorway in a wall is sewn with the wall\'s stone; open air is not', () => {
    // a brick wall along z at x = 5 (layers 1…4), a doorway 1×2 at z = 0 (layers 1, 2); the ground ≤ 0
    const get = (x, L, z) => {
        if (L <= 0) return BLOCK.STONE;
        if (x === 5 && L <= 4 && Math.abs(z) <= 6 && !(z === 0 && L <= 2)) return BLOCK.BRICK;
        return BLOCK.AIR;
    };
    const o = new THREE.Vector3(0, 1.2, 0), d = new THREE.Vector3(1, 0, 0);
    const f = findPassage(get, o, d);
    assert.equal(f.block, BLOCK.BRICK);
    assert.deepEqual(f.cells.map((c) => [c.x, c.L, c.z]), [[5, 1, 0], [5, 2, 0]]);
    assert.equal(findPassage(() => BLOCK.AIR, o, d).why, 'open');
});

test('«Invisibility»: the minds see an invisible player only where they did something, for a while; the wand up or at oneself', () => {
    const p = new THREE.Vector3(1, 0, 1), c = { pos: new THREE.Vector3(5, 0, 5), until: 100 };
    assert.equal(cluePos(false, p, null, 0), p);
    assert.equal(cluePos(true, p, null, 0), null);
    assert.equal(cluePos(true, p, c, 50), c.pos);
    assert.equal(cluePos(true, p, c, 150), null);
    assert.ok(pointsUp(new THREE.Vector3(0, 1, 0)) && !pointsUp(new THREE.Vector3(1, 0, 0)));
    assert.ok(pointsAtSelf(new THREE.Vector3(0, 1, -0.5), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
});

test('«Stitching» on real places: a villager\'s doorway (every kind, every facing, the hand off by up to 12°, from the side), a hole blown by «Бомбардо» in a castle wall, a cave\'s tunnel', async () => {
    const { Plan, buildHouse } = await import('../../src/world/Castles.js');
    const { createRng } = await import('../../src/core/math.js');
    const { TerrainData, TEST_CAVE } = await import('../../src/world/Terrain.js');
    const { stitchHint } = await import('../../src/game/Stitching.js');
    const Y = new THREE.Vector3(0, 1, 0);
    const aimAt = (o, target, yaw, pitch) => {
        const d = target.clone().sub(o).normalize().applyAxisAngle(Y, yaw * Math.PI / 180);
        return d.applyAxisAngle(new THREE.Vector3().crossVectors(d, Y).normalize(), pitch * Math.PI / 180);
    };
    // a villager's house (the real builder): the doorway — 3 wide, 5–6 high — is what is sewn
    const S = { houseStone: BLOCK.COBBLE, villageRoof: BLOCK.ROOF_RED, poorRoof: BLOCK.ROOF_RED, poorWall: BLOCK.PLASTER, roof: BLOCK.ROOF_RED, carpet: BLOCK.CLOTH_WHITE, bedRich: 'red' };
    for (const kind of ['hut', 'cottage', 'stone', 'brick', 'manor']) for (let face = 0; face < 4; face++) {
        const p = new Plan(100, 200, 0, 1), out = { houses: [] };
        buildHouse(p, kind, 3, -5, face, createRng(7 + face), S, out);
        const h = out.houses[0], dr = h.doorRec;
        const blocks = new Map();
        for (const q of p.parts) for (let x = q.x0; x <= q.x1; x++) for (let z = q.z0; z <= q.z1; z++) for (let L = q.L0; L <= q.L1; L++) blocks.set(x + ',' + L + ',' + z, q.t);
        const get = (x, L, z) => blocks.get(x + ',' + L + ',' + z) ?? (L <= -1 ? BLOCK.GRASS : BLOCK.AIR);
        const out1 = new THREE.Vector3(h.door.x - dr.x, 0, h.door.z - dr.z).normalize();
        for (const [side, yaw, pitch, dist] of [[0, 0, 0, 5], [0, 10, -8, 8], [30, -6, 6, 6], [-40, 12, 0, 4]]) {
            const feet = new THREE.Vector3(dr.x, dr.y, dr.z).addScaledVector(out1.clone().applyAxisAngle(Y, side * Math.PI / 180), dist);
            const o = feet.add(new THREE.Vector3(0, 2.4, 0));
            const f = findPassage(get, o, aimAt(o, new THREE.Vector3(dr.x, dr.y + 2, dr.z), yaw, pitch));
            const where = `${kind} face ${face} (${side}°, off ${yaw}°/${pitch}°)`;
            assert.ok(f.cells, `${where}: ${f.why}`);
            // (the doorway: in the wall's own plane, at the door — a hut's windows beside it are one hole with it)
            const alongX = Math.abs(out1.x) < 0.5; // (the wall runs along x: its plane is z = const)
            for (const c of f.cells) {
                assert.ok(alongX ? c.z === Math.round(dr.z) : c.x === Math.round(dr.x), `${where}: ${c.x},${c.L},${c.z} is not in the wall`);
                assert.ok(Math.hypot(c.x - dr.x, c.z - dr.z) <= 2.6 && c.L - 1 >= dr.y - 0.6 && c.L - 1 <= dr.y + dr.h + 1, `${where}: ${c.x},${c.L},${c.z} is not at the door`);
            }
            assert.ok(f.cells.length >= 12, `${where}: the whole doorway (${f.cells.length})`);
        }
    }
    // a hole blown by «Бомбардо» in a castle wall (2 thick) — looked at straight and from the side
    const w = new TerrainData(); w.generate({ seed: 1 });
    const top = w.topLayer(10, 0);
    for (let x = 10; x <= 11; x++) for (let z = -10; z <= 10; z++) for (let L = top + 1; L <= top + 8; L++) w.set(x, L, z, BLOCK.CS_GREY);
    const hole = w.removeSphere(10.5, top + 2, 0, 2.2).map((b) => `${b.x},${Math.round(b.y + 1)},${b.z}`);
    for (const side of [0, 35]) {
        const o = new THREE.Vector3(10.5, top - 0.5, 0).add(new THREE.Vector3(-6, 0, 0).applyAxisAngle(Y, side * Math.PI / 180)).add(new THREE.Vector3(0, 2.4, 0));
        const f = findPassage((x, L, z) => w.get(x, L, z), o, aimAt(o, new THREE.Vector3(10.5, top + 2, 0), 6, -5));
        assert.ok(f.cells, `the blown hole (${side}°): ${f.why}`);
        assert.equal(f.block, BLOCK.CS_GREY);
        for (const c of f.cells) assert.ok(c.x === 10 || c.x === 11, `the hole is sewn in the wall (${c.x},${c.L},${c.z})`);
        assert.ok(f.cells.length >= 9);
    }
    // a cave of the world (generation 4): standing in a tunnel, the wand along it
    const cv = new TerrainData(); cv.generate({ seed: 12345, mountains: true, seas: true, test: true, deepCaves: true });
    let found = 0, tried = 0;
    for (const sys of cv.cavesNear(TEST_CAVE.X, TEST_CAVE.Z, 300).slice(0, 3)) for (const g of sys.segs.slice(3, 10)) {
        const o = new THREE.Vector3(g.ax, g.ay, g.az);
        if (cv.get(Math.round(o.x), Math.floor(o.y + 1.5), Math.round(o.z)) !== BLOCK.AIR) continue;
        tried++;
        const f = findPassage((x, L, z) => cv.get(x, L, z), o, new THREE.Vector3(g.bx - g.ax, g.by - g.ay, g.bz - g.az).normalize());
        if (f.cells) found++;
    }
    assert.ok(tried >= 10 && found >= tried * 0.9, `cave tunnels sewn: ${found} of ${tried}`);
    // nothing round it: the hint says why
    assert.equal(findPassage(() => BLOCK.AIR, new THREE.Vector3(), new THREE.Vector3(1, 0, 0)).why, 'open');
    assert.match(stitchHint('open'), /не окружена/);
    assert.match(stitchHint('none'), /упирается/);
    assert.match(stitchHint('wide'), /широкий/);
});

test('«Stitching» closes like a camera\'s iris: the edge first from every side, ring by ring, the middle last', async () => {
    const { irisOrder } = await import('../../src/game/Stitching.js');
    // a 5×5 hole in a wall (plane x): its cells
    const cells = [];
    for (let L = 1; L <= 5; L++) for (let z = -2; z <= 2; z++) cells.push({ x: 0, L, z });
    const inside = new Set(cells.map((c) => `${c.x},${c.L},${c.z}`));
    const get = (x, L, z) => (inside.has(`${x},${L},${z}`) ? BLOCK.AIR : BLOCK.STONE);
    const o = irisOrder(get, cells, 'x');
    assert.equal(o.stones.length, 25);
    const last = o.stones[o.stones.length - 1];
    assert.deepEqual([last.c.L, last.c.z], [3, 0], 'the middle shuts last');
    // every ring before the next one in, and the first ring has stones on all four sides
    for (let i = 1; i < o.stones.length; i++) assert.ok(o.stones[i].ring >= o.stones[i - 1].ring, 'ring by ring, inwards');
    const first = o.stones.filter((s) => s.ring === 0);
    assert.equal(first.length, 16);
    assert.ok(first.some((s) => s.c.L === 1) && first.some((s) => s.c.L === 5) && first.some((s) => s.c.z === -2) && first.some((s) => s.c.z === 2));
    // each stone comes from outside the hole (torn off the wall), toward the middle
    for (const s of o.stones) assert.ok(s.from.distanceTo(o.mid) > s.to.distanceTo(o.mid), 'flies in from outside');
    assert.ok(o.T >= 1.6 && o.T <= 5);
});

test('«Stitching»: a hole in a floor (the wand pointing down at it) is sewn with the floor\'s planks; a pit with no way through is not', () => {
    // a plank floor at layer 5 (x, z within ±6) with a 2×2 hole; a cellar of air below it (layers 1…4), the ground ≤ 0
    const hole = (x, z) => x >= 0 && x <= 1 && z >= 0 && z <= 1;
    const get = (x, L, z) => {
        if (L <= 0) return BLOCK.STONE;
        if (L === 5 && Math.abs(x) <= 6 && Math.abs(z) <= 6 && !hole(x, z)) return BLOCK.WOOD_PLANKS ?? BLOCK.WOOD;
        return BLOCK.AIR;
    };
    const o = new THREE.Vector3(0.5, 8, 0.5), d = new THREE.Vector3(0, -1, 0);
    const f = findPassage(get, o, d);
    assert.equal(f.plane, 'y');
    assert.equal(f.cells.length, 4);
    assert.ok(f.cells.every((c) => c.L === 5 && hole(c.x, c.z)));
    // looking down from the side at a slant, and up at a hole in a ceiling
    const f2 = findPassage(get, new THREE.Vector3(3, 8, 3), new THREE.Vector3(-2.5, -7.5, -2.5).normalize());
    assert.equal(f2.plane, 'y');
    const up = findPassage(get, new THREE.Vector3(0.5, 1.2, 0.5), new THREE.Vector3(0, 1, 0));
    assert.equal(up.plane, 'y');
    assert.equal(up.cells.length, 4);
});

test('«Stitching»: a pit in the ground (a crater with solid bottom) is filled up to its rim; a closed little room is not', async () => {
    const pit = (x, z) => Math.abs(x) <= 1 && Math.abs(z) <= 1;
    const get = (x, L, z) => (L <= 0 || (L <= 3 && !pit(x, z)) ? BLOCK.DIRT : BLOCK.AIR); // ground to layer 3, a 3×3 pit 3 deep
    const f = findPassage(get, new THREE.Vector3(0, 9, 0), new THREE.Vector3(0, -1, 0));
    assert.equal(f.plane, 'y');
    assert.equal(f.cells.length, 27);
    assert.equal(f.block, BLOCK.DIRT);
    const room = (x, L, z) => (L <= 0 || L >= 4 || Math.abs(x) >= 2 || Math.abs(z) >= 2 ? BLOCK.STONE : BLOCK.AIR);
    const { pitFill, crossSection } = await import('../../src/game/Stitching.js');
    assert.equal(pitFill(room, crossSection(room, { x: 0, L: 1, z: 0 }, 'y').cells), null);
});
