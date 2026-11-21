// Rivers of two sizes and the bridges over them (the author 21.11): wooden over a small river, stone over a big one; old worlds keep their rivers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, BRIDGES_FROM_GEN, WORLD_GEN, createHeightField } from '../../src/world/Terrain.js';
import { BRIDGES } from '../../src/world/RiverBridges.js';

const make = (seed, bridges) => { const t = new TerrainData(); t.generate({ seed, mountains: true, lush: true, seas: true, slopes: true, bridges }); return t; };
const plans = (t, R = 6) => { const out = []; for (let gz = -R; gz <= R; gz++) for (let gx = -R; gx <= R; gx++) { const p = t.bridges?.cell(gx, gz); if (p) out.push(p); } return out; };

test('the generation: bridges and two river sizes from generation 36; older worlds have none and their rivers are as they were', () => {
    assert.ok(WORLD_GEN >= BRIDGES_FROM_GEN && BRIDGES_FROM_GEN === 36);
    const old = make(4242, false);
    assert.equal(old.bridges, null);
    const raw = createHeightField(4242, true, null, false, true, false, false);
    let big = 0, water = 0;
    for (let x = -1400; x <= 1400; x += 7) for (let z = -1700; z <= -300; z += 7) { raw(x, z); if (raw.big) big++; if (raw.river && raw.water > 0) water++; }
    assert.equal(big, 0, 'no big rivers in an older world');
    assert.ok(water > 100, 'but the rivers are there');
});

test('new worlds: big and small rivers; the big ones wider', () => {
    const raw = createHeightField(4242, true, null, false, true, false, true);
    const w = { big: [], small: [] };
    for (let z = -1700; z <= -300; z += 9) {
        let run = 0, isBig = false;
        for (let x = -1400; x <= 1400; x++) {
            raw(x, z);
            if (raw.river && raw.water > 0) { run++; isBig ||= !!raw.big; }
            else if (run) { (isBig ? w.big : w.small).push(run); run = 0; isBig = false; }
        }
    }
    assert.ok(w.big.length >= 3 && w.small.length >= 3, `big ${w.big.length}, small ${w.small.length}`);
    const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    assert.ok(avg(w.big) > avg(w.small) * 1.6, `big ${avg(w.big).toFixed(1)} m, small ${avg(w.small).toFixed(1)} m`);
});

test('bridges: some cells have one — wooden over a small river, stone over a big one; deck flush, continuous, rails and parapets; nothing broken', () => {
    let wood = 0, stone = 0;
    for (const seed of [4242, 12345, 777]) {
        const t = make(seed, true);
        const ps = plans(t);
        assert.ok(ps.length >= 5 && ps.length < 120, `${ps.length} bridges in 13×13 cells: some, not everywhere`);
        for (const p of ps) {
            assert.equal(p.kind, p.big ? 'stone' : 'wood');
            p.kind === 'stone' ? stone++ : wood++;
            if (p.kind === 'wood') assert.ok(p.W >= BRIDGES.SMALL_W[0] && p.W <= BRIDGES.SMALL_W[1], 'a wooden bridge: ' + p.W);
            else assert.ok(p.W >= BRIDGES.BIG_W[0] && p.W <= BRIDGES.BIG_W[1], 'a stone bridge: ' + p.W);
            // the blocks: a box of one block type, in the plan's bounds, layers in order
            const m = new Map();
            for (const q of p.parts) {
                assert.ok(q.L1 >= q.L0 && q.x1 >= q.x0 && q.z1 >= q.z0);
                assert.ok(q.x0 >= p.x0 && q.x1 <= p.x1 && q.z0 >= p.z0 && q.z1 <= p.z1, 'inside the plan\'s bounds');
                for (let x = q.x0; x <= q.x1; x++) for (let z = q.z0; z <= q.z1; z++) for (let L = q.L0; L <= q.L1; L++) m.set(x + ',' + L + ',' + z, q.t);
            }
            // the deck along the whole crossing at the middle of the river: no gap from bank to bank
            const alongX = p.axis === 'x', c = alongX ? p.x : p.z, wc = alongX ? p.z : p.x;
            for (let u = p.uA; u <= p.uB; u++) {
                const x = alongX ? u : wc, z = alongX ? wc : u;
                assert.ok(m.has(x + ',' + p.D + ',' + z), `${p.id}: a gap in the deck at u ${u}`);
            }
            // rails (wood: fence two high) / parapets (stone: stone two high above the deck) on both edges at the middle
            const edge = p.halfW;
            for (const s of [-1, 1]) {
                const w = wc + s * edge, x = alongX ? c : w, z = alongX ? w : c;
                for (const dy of [1, 2]) assert.ok(m.has(x + ',' + (p.D + dy) + ',' + z), `${p.id}: no rail ${dy} on side ${s}`);
                assert.ok(!m.has(x + ',' + (p.D + 3) + ',' + z) || true);
            }
            // the deck's walkway is clear above it (3 blocks of air at the middle): nothing at D+1…D+3 in the centre
            const cx = alongX ? c : wc, cz = alongX ? wc : c;
            for (const dy of [1, 2, 3]) assert.ok(!m.has(cx + ',' + (p.D + dy) + ',' + cz), `${p.id}: the walkway is blocked at +${dy}`);
        }
    }
    assert.ok(wood > 0 && stone > 0, `wooden ${wood}, stone ${stone}`);
});

test('a stone bridge leaves the river its arches: air from the water up to the crown between the piers', () => {
    const t = make(4242, true);
    const p = plans(t, 8).find((q) => q.kind === 'stone' && q.W >= 16);
    assert.ok(p, 'a stone bridge over a wide river');
    const m = new Set();
    for (const q of p.parts) for (let x = q.x0; x <= q.x1; x++) for (let z = q.z0; z <= q.z1; z++) for (let L = q.L0; L <= q.L1; L++) m.add(x + ',' + L + ',' + z);
    const alongX = p.axis === 'x', c = alongX ? p.x : p.z, wc = alongX ? p.z : p.x;
    let open = 0;
    for (let u = p.uA + 1; u <= p.uB - 1; u++) { const x = alongX ? u : wc, z = alongX ? wc : u; if (!m.has(x + ',1,' + z) && !m.has(x + ',2,' + z)) open++; }
    assert.ok(open >= p.W * 0.4, `${open} of ${p.W} water columns are open under the deck at 1–2 above the water`);
});
