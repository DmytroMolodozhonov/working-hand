/**
 * The lone wizards' houses (generation 7, Castles.buildWizHut): roomy enough for the hero to walk in (the author: «небольшими,
 * но чтобы плюс-минус нормально ходить») — measured on the real blocks by tools/hutbench.mjs; older worlds keep the small ones.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, WORLD_GEN } from '../../src/world/Terrain.js';
import { WIZ_HUTS } from '../../src/world/Castles.js';
import { probe } from '../../tools/hutbench.mjs';

const make = (seed, wizHuts) => { const d = new TerrainData(); d.generate({ seed, mountains: true, seas: true, lush: true, slopes: true, wizHuts }); return d; };
const huts = (d) => { const out = []; for (let gx = -4; gx < 4; gx++) for (let gz = -4; gz < 4; gz++) for (const h of d.hamlets.cellOf(gx, gz)) if (h.type === 'magehut') out.push(h); return out; };
const SEEDS = [20261015, 20261015 + 7919, 20261015 + 2 * 7919, 20261015 + 3 * 7919];

test('wizard huts: new worlds are generation 7; older worlds keep the small houses and the same places', () => {
    assert.ok(WORLD_GEN >= 7);
    for (const seed of SEEDS.slice(0, 2)) {
        const a = huts(make(seed, false)), b = huts(make(seed, true));
        assert.deepEqual(a.map((h) => [h.id, h.x, h.z, h.F, h.zone]), b.map((h) => [h.id, h.x, h.z, h.F, h.zone]));
        assert.ok(a.every((h) => h.houses[0].kind === 'cottage' || h.houses[0].kind === 'towerhouse'));
        assert.ok(b.every((h) => WIZ_HUTS[h.houses[0].kind]));
    }
});

test('wizard huts: roomy inside, a door for a hat, ways 3 wide to the bed, the chests and the cauldron, a stair that is walked', () => {
    const seen = new Set();
    for (const seed of SEEDS) {
        const d = make(seed, true);
        for (const h of huts(d)) {
            const r = probe(d, h);
            seen.add(r.kind);
            const g = r.floors[0];
            assert.deepEqual(r.door, { h: 6, w: 3 }, `${h.id} the door`); // (6 high — the hero is 3.5 with his hat — and 3 wide)
            if (r.kind === 'wizcottage') assert.ok(r.inner[0] >= 11 && r.inner[1] >= 9, `${h.id} ${r.inner}`);
            else assert.ok(r.inner[0] >= 9 && r.inner[1] >= 9, `${h.id} ${r.inner}`);
            assert.ok(g.ceiling >= 6, `${h.id} ceiling ${g.ceiling}`);
            assert.ok(g.passable >= (r.kind === 'wizcottage' ? 25 : 18), `${h.id} ground ways ${g.passable}`);
            assert.equal(g.reachable, g.passable, `${h.id} the ways are one`);
            for (const [name, gap] of g.reached) assert.ok(gap <= 2.5, `${h.id}: ${name} is ${gap} blocks from the nearest way`);
            assert.ok(h.houses[0].chests.length >= (r.kind === 'wizcottage' ? 1 : 2), `${h.id} chests`);
            assert.equal(h.houses[0].bedSpots.length, 1);
            if (r.kind === 'wiztower') {
                const up = r.floors[1];
                assert.ok(r.upReached, `${h.id} the stair leads up`);
                assert.ok(up.ceiling >= 6 && up.passable >= 6 && up.reachable === up.passable, `${h.id} upstairs ${up.ceiling} ${up.passable}`);
                for (const [name, gap] of up.reached) assert.ok(gap <= 2.5, `${h.id}: upstairs ${name} ${gap}`);
            }
        }
    }
    assert.deepEqual([...seen].sort(), ['wizcottage', 'wiztower']);
});

test('wizard huts: the walking nodes stand on free floor and every edge can be walked; the house and its garden do not touch', () => {
    for (const seed of SEEDS) {
        const d = make(seed, true);
        for (const h of huts(d)) {
            const hs = h.houses[0], F = h.F;
            const solidAt = (x, y, z) => d.get(Math.round(x), y, Math.round(z)) !== 0;
            const stand = (x, y, z) => solidAt(x, y, z) && [1, 2, 3, 4].every((k) => !solidAt(x, y + k, z));
            const near = (x, z, yl) => { for (let y = Math.floor(yl) - 1; y <= Math.ceil(yl) + 1; y++) if (stand(x, y, z)) return true; return false; };
            for (const n of h.nodes) {
                if (Math.abs(n.x - hs.c.x) > 7 || Math.abs(n.z - hs.c.z) > 7) continue; // (inside or by the house)
                assert.ok(near(n.x, n.z, n.y + 1.5 - 1), `${h.id} node ${n.id} (${n._u}, ${n._v}, ${n._l}) not on free floor`);
            }
            for (const [a, b] of h.edges) {
                const A = h.nodes[a], Bn = h.nodes[b];
                if (Math.abs(A.x - hs.c.x) > 7 || Math.abs(A.z - hs.c.z) > 7 || Math.abs(Bn.x - hs.c.x) > 7 || Math.abs(Bn.z - hs.c.z) > 7) continue;
                for (let t = 0; t <= 1; t += 0.05) {
                    const x = A.x + (Bn.x - A.x) * t, z = A.z + (Bn.z - A.z) * t, y = A.y + (Bn.y - A.y) * t;
                    assert.ok(near(x, z, y + 0.5), `${h.id} edge ${a}-${b} [(${A._u}, ${A._v}, ${A._l}) → (${Bn._u}, ${Bn._v}, ${Bn._l})] blocked at t=${t.toFixed(2)}`);
                }
            }
            // everything of the house inside the hamlet's zone; the garden, the obelisk and the rune circle clear of the roof
            const { w, d: dd } = WIZ_HUTS[hs.kind];
            assert.ok(w + 1 <= 8 && dd + 1 <= 6, 'the roof stays inside what Hamlets.buildMageHut leaves (the garden from 9 on, the obelisk at v 7, the circle at v −12)');
            for (const p of h.parts) assert.ok(Math.max(Math.abs(p.x1 - h.x), Math.abs(p.x0 - h.x), Math.abs(p.z1 - h.z), Math.abs(p.z0 - h.z)) <= h.zone + 1, `${h.id} part beyond the zone`);
        }
    }
});
