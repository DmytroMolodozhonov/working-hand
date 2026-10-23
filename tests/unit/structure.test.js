/**
 * The physics of buildings (src/world/Structure.js through Collapse.collapseAfter): a thin column does not hold a
 * floor, a wide one does; a balcony reaches as far as its stone allows; an arch holds what a flat slab cannot; a
 * beam burnt away lets what it held fall; the buildings the game makes stand as built.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlatData } from './structure-fake.mjs';
import { collapseAfter } from '../../src/world/Collapse.js';
import { boxAround, judge, settle, STRUCT, stuffOf } from '../../src/world/Structure.js';
import { BLOCK, TerrainData } from '../../src/world/Terrain.js';

const S = BLOCK.CS_GREY, P = BLOCK.PLANKS;

/** Take the blocks of a box away (a blast, a fire): what was there, for the check «as built». */
function take(d, x0, L0, z0, x1, L1, z1, skip = () => false) {
    const gone = [];
    for (let L = L0; L <= L1; L++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const t = d.get(x, L, z);
        if (!t || skip(x, L, z) || t === BLOCK.GRASS || t === BLOCK.DIRT) continue;
        gone.push([x, L, z, t]); d.set(x, L, z, BLOCK.AIR);
    }
    return gone;
}
const fell = (falls) => falls.reduce((a, f) => a + f.cells.length, 0);

test('a storey of stone 7×7 (its floor, walls and roof) on one column 1×1, one storey high: the column breaks, all of it comes down; on a column 3×3 it stands', () => {
    const storey = (d) => { d.box(-3, 5, -3, 3, 5, 3, S); d.box(-3, 6, -3, 3, 9, 3, S); d.box(-2, 6, -2, 2, 9, 2, 0); d.box(-3, 10, -3, 3, 10, 3, S); };
    for (const [w, falls] of [[1, true], [3, false]]) {
        const d = new FlatData();
        const h = (w - 1) / 2;
        d.box(-h, 1, -h, h, 4, h, S); // the column
        for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) d.box(x, 1, z, x, 4, z, S); // posts at the corners
        storey(d);
        // the corner posts are blasted away: the column is left alone with the storey on it
        const gone = [];
        for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) gone.push(...take(d, x, 1, z, x, 4, z));
        const out = collapseAfter(d, 0, 2, 0, 4, 0, gone);
        assert.equal(fell(out) > 150, falls, `column ${w}×${w}: ${fell(out)} blocks fell`);
        assert.equal(d.count(-3, 5, -3, 3, 5, 3, S) > 40, !falls, 'the floor is up there or on the ground');
        if (falls) assert.ok(out.some((f) => f.crushed), 'the column broke under it');
        // plain physics too (the building judged as it stands, not against what it was)
        const d2 = new FlatData(); d2.box(-h, 1, -h, h, 4, h, S); storey(d2);
        assert.equal(judge(d2, boxAround(d2, 0, 3, 0, 4)).crushed.length > 0, falls);
    }
    // a bare slab 7×7 on the column: no storey on it — the column holds it (a stone column carries 72)
    const d = new FlatData(); d.box(0, 1, 0, 0, 4, 0, S); d.box(-3, 5, -3, 3, 5, 3, S);
    assert.equal(judge(d, boxAround(d, 0, 3, 0, 4)).crushed.length, 0);
});

test('the author\'s house: a two-storey stone house left on one corner column falls whole; a 3×3 pillar under its middle does not hold it either, its walls do', () => {
    const house = (d) => { d.box(-4, 1, -4, 4, 4, 4, S); d.box(-3, 1, -3, 3, 4, 3, 0); d.box(-4, 5, -4, 4, 5, 4, S); d.box(-4, 6, -4, 4, 9, 4, S); d.box(-3, 6, -3, 3, 9, 3, 0); d.box(-4, 10, -4, 4, 10, 4, S); };
    let d = new FlatData(); house(d);
    let out = collapseAfter(d, 0, 2, 0, 5, 0, take(d, -4, 1, -4, 4, 4, 4, (x, L, z) => x === -4 && z === -4));
    assert.ok(fell(out) > 280, `on one column: ${fell(out)} fell`);
    assert.ok(out.some((f) => f.crushed), 'the column itself broke');
    assert.ok(out.some((f) => f.stage > 1), 'in a chain: the column first, then the house');
    d = new FlatData(); house(d); d.box(-1, 1, -1, 1, 4, 1, S);
    out = collapseAfter(d, 0, 2, 0, 5, 0, take(d, -4, 1, -4, 4, 4, 4, (x, L, z) => Math.abs(x) <= 1 && Math.abs(z) <= 1));
    assert.ok(fell(out) > 250, `on a 3×3 pillar: ${fell(out)} fell`);
    d = new FlatData(); house(d);
    out = collapseAfter(d, 0, 2, -4, 1.5, 0, take(d, -1, 2, -4, 1, 3, -4)); // (a window knocked into a wall)
    assert.equal(fell(out), 0, 'a hole in a wall: the house stands');
});

test('a balcony: as long as its stone reaches it holds; twice as long, the part beyond falls (its post knocked away)', () => {
    const reach = stuffOf(S).reach; // (10 blocks out from a wall)
    for (const [n, falls] of [[reach - 1, false], [2 * reach, true]]) {
        const d = new FlatData();
        d.box(-3, 1, -1, 0, 8, 1, S); // a thick wall
        d.box(1, 8, 0, n, 8, 0, S); // the balcony (a slab 1 thick)
        d.box(n, 1, 0, n, 7, 0, S); // a post under its end
        const out = collapseAfter(d, n, 3, 0, 1, 0, take(d, n, 1, 0, n, 7, 0));
        assert.equal(fell(out) > 0, falls, `${n} blocks out: ${fell(out)} fell`);
        if (falls) assert.equal(d.count(1, 8, 0, reach - 1, 8, 0, S), reach - 1, 'what reaches is left on the wall');
        else assert.equal(d.count(1, 8, 0, n, 8, 0, S), n, 'all of it is there');
    }
    // plain physics: the long one has blocks with no way down
    const d = new FlatData(); d.box(-3, 1, -1, 0, 8, 1, S); d.box(1, 8, 0, 2 * reach, 8, 0, S);
    assert.ok(judge(d, boxAround(d, 5, 7, 0, 10)).lost.length > 0);
});

test('an arch of stone steps (each a step in and up, resting on the edge of the one under it) holds over a gap a flat slab cannot span', () => {
    const R = 13, base = 1; // (the gap: 25 blocks; a flat stone slab spans 2 × 10)
    const arch = (d) => {
        d.box(-R - 2, base, -1, -R, base + 2, 1, S); d.box(R, base, -1, R + 2, base + 2, 1, S); // the piers
        for (let x = -R + 1; x <= R - 1; x++) d.box(x, base + 2 + R - Math.abs(x), -1, x, base + 2 + R - Math.abs(x), 1, S);
    };
    let d = new FlatData(); arch(d); d.box(0, 1, 6, 0, 2, 6, S);
    const out = collapseAfter(d, 0, 1, 6, 1, 0, take(d, 0, 1, 6, 0, 2, 6));
    assert.equal(fell(out), 0, 'the arch stands');
    assert.equal(judge(d, boxAround(d, 0, 10, 0, R)).lost.length, 0, 'every block of it has a way down');
    // the same gap under a flat slab (1 block thick)
    d = new FlatData();
    d.box(-R - 2, base, -1, -R, base + 2 + R, 1, S); d.box(R, base, -1, R + 2, base + 2 + R, 1, S);
    d.box(-R + 1, base + 2 + R, -1, R - 1, base + 2 + R, 1, S);
    assert.ok(judge(d, boxAround(d, 0, 10, 0, R)).lost.length > 0, 'the flat slab cannot span it');
});

test('three of four posts knocked out: the roof comes down; one of four: it stands', () => {
    const hall = (d) => { for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) d.box(x, 1, z, x, 4, z, S); d.box(-3, 5, -3, 3, 5, 3, S); };
    let d = new FlatData(); hall(d);
    let gone = [...take(d, 3, 1, -3, 3, 4, -3), ...take(d, 3, 1, 3, 3, 4, 3), ...take(d, -3, 1, 3, -3, 4, 3)];
    let out = collapseAfter(d, 0, 2, 0, 4, 0, gone);
    assert.ok(fell(out) >= 45, `three posts gone: ${fell(out)} fell`);
    assert.equal(d.count(-3, 5, -3, 3, 5, 3, S), 0, 'nothing of the roof is left up there');
    d = new FlatData(); hall(d);
    out = collapseAfter(d, 3, 2, -3, 1, 0, take(d, 3, 1, -3, 3, 4, -3));
    assert.equal(d.count(-3, 5, -3, 3, 5, 3, S), 49, 'one post gone: the roof is up');
});

test('a wooden beam burnt away: the stone it carried falls (as a fire leaves it — BurnWreck)', () => {
    const d = new FlatData();
    d.box(-1, 1, 0, -1, 6, 0, S); d.box(5, 1, 0, 5, 6, 0, S); // two stone piers
    d.box(-1, 7, 0, 5, 7, 0, P); // the beam over them (planks)
    d.box(1, 8, 0, 3, 9, 0, S); // stones laid on the beam
    let out = collapseAfter(d, 2, 7, 0, 1, 0, take(d, -1, 7, 0, 5, 7, 0));
    assert.equal(d.count(1, 8, 0, 3, 9, 0, S), 0, 'the stones are not up there any more');
    assert.ok(fell(out) >= 6);
    // a plank beam too long for planks (wood reaches less than stone) — plain physics
    const d2 = new FlatData();
    d2.box(-1, 1, 0, -1, 6, 0, S); d2.box(2 * stuffOf(P).reach + 3, 1, 0, 2 * stuffOf(P).reach + 3, 6, 0, S);
    d2.box(-1, 7, 0, 2 * stuffOf(P).reach + 3, 7, 0, P);
    assert.ok(judge(d2, boxAround(d2, 8, 6, 0, 10)).lost.length > 0, 'a plank beam that long has nothing under its middle');
});

test('the same blocks, the same falls (deterministic), and nothing falls with nothing taken away', () => {
    const make = () => { const d = new FlatData(); d.box(-4, 1, -4, 4, 4, 4, S); d.box(-3, 1, -3, 3, 4, 3, 0); d.box(-4, 5, -4, 4, 5, 4, S); d.box(-4, 6, -4, 4, 9, 4, S); return d; };
    const run = () => { const d = make(); const out = collapseAfter(d, 0, 2, 0, 5, 0, take(d, -4, 1, -4, 4, 4, 4, (x, L, z) => x === -4 && z === -4)); return JSON.stringify(out.map((f) => [f.cells, f.d, f.landed, f.stage])); };
    assert.equal(run(), run());
    // a job worked a little at a time gives what all at once gives
    const d = make();
    assert.equal(settle(d, boxAround(d, 0, 3, 0, 5), () => assert.fail('fell'), () => assert.fail('crushed'), []), 0);
});

test('the buildings the game makes stand as built (a castle, its village, hamlets — generation 6)', () => {
    const data = new TerrainData();
    data.generate({ seed: 20261015, mountains: true, seas: true, test: false, deepCaves: true, lush: true, slopes: true });
    data.skipSeaTop = true;
    const sites = data.sites.near(-790, -240, 60).concat(data.sites.near(88, -588, 10)).slice(0, 3);
    assert.ok(sites.length >= 2, 'a castle and a hamlet near');
    let built = 0;
    for (const s of sites) {
        const z = Math.min(60, (s.zone || 24) + 6);
        for (let tz = Math.floor(s.z - z); tz <= s.z + z; tz += 48) for (let tx = Math.floor(s.x - z); tx <= s.x + z; tx += 48) {
            const B = boxAround(data, tx + 24, 20, tz + 24, 24, 6);
            B.L0 = Math.max(B.L0 - 20, -16); B.NY += 20;
            settle(data, B, (p) => assert.fail(`fell: ${p.cells[0]}`), (c) => assert.fail(`crushed: ${c[0]}`), []);
            built++;
        }
    }
    assert.ok(built > 3);
    assert.ok(STRUCT.Q > 0);
});
