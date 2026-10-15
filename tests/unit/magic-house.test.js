// «Create a House» / «Improve a House»: the plan of a house made by magic (src/world/MagicHouse.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { housePlan, HOUSE_LEVELS, MAX_LEVEL, faceTowards, rotLot } from '../../src/world/MagicHouse.js';
import { BLOCK } from '../../src/world/Terrain.js';

const solidAt = (p, x, y, z) => p.own.has(Math.round(x) + ',' + Math.floor(y + 1.5) + ',' + Math.round(z));

test('each level asks twice as much as the one before (mana, wool, sand)', () => {
    for (let L = 2; L <= MAX_LEVEL; L++) {
        for (const k of ['mana', 'wool', 'sand', 'drain']) assert.equal(HOUSE_LEVELS[L][k], HOUSE_LEVELS[L - 1][k] * 2, `${k} L${L}`);
        assert.ok(HOUSE_LEVELS[L].trees >= HOUSE_LEVELS[L - 1].trees);
    }
    assert.deepEqual([HOUSE_LEVELS[1].mana, HOUSE_LEVELS[1].drain, HOUSE_LEVELS[1].wool, HOUSE_LEVELS[1].sand], [20, 0.5, 3, 10]);
});

test('every house: a door with air in its opening, beds, chests, glass; the same plan from the same record', () => {
    const beds = [0, 1, 2, 3, 4, 5], chests = [0, 1, 1, 2, 2, 3];
    for (let L = 1; L <= MAX_LEVEL; L++) for (const seed of [1, 7, 99, 12345]) for (const face of [0, 1, 2, 3]) {
        const o = { seed, level: L, x: 40, z: -30, G: 12, face, woods: [BLOCK.BIRCH, BLOCK.WOOD] };
        const p = housePlan(o);
        assert.deepEqual(housePlan(o).cells, p.cells, 'deterministic');
        assert.ok(p.door, `L${L} door`);
        assert.equal(p.beds.length, beds[L]);
        assert.deepEqual(p.chests.map((c) => c.k).sort(), [...Array(chests[L]).keys()]);
        assert.ok(p.windows.length >= 3);
        for (const wdw of p.windows) assert.ok(!solidAt(p, wdw.x, wdw.y, wdw.z), `L${L}: a window is a hole for its glass`);
        // the doorway is open (3 × 5), the floor under it is there
        for (let s = -1; s <= 1; s++) for (let up = 0.5; up < 4.6; up += 1) {
            const c = Math.cos(p.door.ry), sn = Math.sin(p.door.ry);
            assert.ok(!solidAt(p, p.door.x + c * s, p.door.y + up, p.door.z - sn * s), `L${L} door open`);
        }
        // nothing stands where a bed or a chest is (they are models, not blocks), and there is a floor under them
        for (const b of [...p.beds, ...p.chests]) {
            assert.ok(!solidAt(p, b.x, b.y + 0.5, b.z), `L${L} s${seed} f${face}: free above the floor`);
            assert.ok(solidAt(p, b.x, b.y - 0.5, b.z), `L${L}: a floor under it`);
        }
    }
});

test('a house grows: each level stands over the whole house before it; the walls are the wood of the trees taken; level 5 is stone', () => {
    for (const seed of [3, 4, 5]) {
        let prev = null;
        for (let L = 1; L <= MAX_LEVEL; L++) {
            const p = housePlan({ seed, level: L, x: 0, z: 0, G: 0, face: 2, woods: [BLOCK.SPRUCE], minD: prev?.d || 0 });
            if (prev) assert.ok(p.w >= prev.w && p.d >= prev.d && p.rect.x0 <= prev.rect.x0 && p.rect.x1 >= prev.rect.x1);
            const types = new Set(p.cells.map((c) => c[3]));
            if (L <= 3) assert.ok(types.has(BLOCK.SPRUCE), `L${L} log walls`);
            if (L === 5) assert.ok(!types.has(BLOCK.SPRUCE) || [...p.cells].filter((c) => c[3] === BLOCK.SPRUCE).length < 50, 'stone house');
            if (L >= 3) assert.ok(p.two, 'a second floor');
            prev = p;
        }
    }
});

test('the door looks towards the caster', () => {
    for (const [dx, dz] of [[0, -5], [5, 1], [0, 7], [-6, 2]]) {
        const [fx, fz] = rotLot(0, -1, faceTowards(dx, dz));
        assert.ok(fx * dx + fz * dz > 0);
    }
});
