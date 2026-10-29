// The villagers' houses (Castles.buildHouseBig, HOUSE_SIZE_FROM_GEN): how roomy they are for the hero, measured on the REAL blocks of generated castles.
//   node tools/housebench.mjs [--gen 14|13] [--seeds 3] [--cells 2] [--v]
// The hero is ~3.5 m tall (4 free layers over the floor) and ~2 blocks across with the arms, so «a way 3 wide» = a cell whose whole 3 × 3
// neighbourhood is free (every neighbour standable within one step of its height). Furniture the game puts in later (the beds, the chests)
// is counted as standing there. Reports per kind: the floor space (free cells inside the walls, each floor), the part reachable as a way 3 wide
// from the door (the stair included: a step of ≤ 1 layer joins the floors), whether the beds, the chests and the upper floor are reached.
import { TerrainData, BLOCK, WORLD_GEN, HOUSE_SIZE_FROM_GEN } from '../src/world/Terrain.js';
import { BIG_HOUSES } from '../src/world/Castles.js';
import { probe, OLD } from '../tests/unit/house-probe.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? Number(args[i + 1]) : d; };
const GEN = opt('gen', WORLD_GEN), SEEDS = opt('seeds', 3), CELLS = opt('cells', 2), VERBOSE = args.includes('--v');
if (process.argv[1] && process.argv[1].endsWith('housebench.mjs')) {
    const sum = {};
    let overlaps = 0, housesN = 0, graphN = 0, graphBad = 0;
    for (let s = 0; s < SEEDS; s++) {
        const seed = 20261029 + s * 7919;
        const d = new TerrainData();
        d.generate({ seed, mountains: true, seas: true, lush: true, slopes: true, wizHuts: true, furnish: true, bigHouses: GEN >= HOUSE_SIZE_FROM_GEN });
        const seenC = new Set();
        const t0 = performance.now();
        for (let gz = -CELLS; gz <= CELLS; gz++) for (let gx = -CELLS; gx <= CELLS; gx++) {
            const c = d.castles.cellOf(gx, gz);
            if (!c || seenC.has(c.id)) continue;
            seenC.add(c.id);
            // every home's nodes (the door, the rooms, the stair, the floor above) are joined to the village's walking graph
            {
                const adj = new Map();
                for (const [a, b] of c.edges) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
                const gate = c.nodes.find((n) => n.tag === 'gateOut') || c.nodes[0];
                const seenN = new Set([gate.id]), st = [gate.id];
                while (st.length) { const n = st.pop(); for (const m of adj.get(n) || []) if (!seenN.has(m)) { seenN.add(m); st.push(m); } }
                for (const h of c.houses || []) {
                    if (h.doorNode == null) continue;
                    graphN++;
                    if (!seenN.has(h.doorNode) || !seenN.has(h.homeNode)) { graphBad++; console.log(`  NOT JOINED ${h.id} ${h.kind}: door ${seenN.has(h.doorNode)} home ${seenN.has(h.homeNode)}`); }
                }
            }
            // houses must not stand in each other (eaves included; a rich one's balcony in front)
            {
                const rects = (c.houses || []).filter((h) => BIG_HOUSES[h.kind] && h.doorRec).map((h) => {
                    const sz = GEN >= HOUSE_SIZE_FROM_GEN ? BIG_HOUSES[h.kind] : { w: OLD[h.kind][0], d: OLD[h.kind][1] };
                    const depthX = Math.abs(h.inside.x - h.doorRec.x) > Math.abs(h.inside.z - h.doorRec.z);
                    const fx = depthX ? Math.sign(h.inside.x - h.doorRec.x) : 0, fz = depthX ? 0 : Math.sign(h.inside.z - h.doorRec.z);
                    const hx = (depthX ? sz.d : sz.w) + 1, hz = (depthX ? sz.w : sz.d) + 1;
                    // (the balcony of a rich house reaches 3 further in front of the door: towards −f)
                    const ex = h.rich ? 3 : 0;
                    return { id: h.id, x0: h.c.x - hx - (fx < 0 ? 0 : fx > 0 ? ex : 0), x1: h.c.x + hx + (fx < 0 ? ex : 0), z0: h.c.z - hz - (fz > 0 ? ex : 0), z1: h.c.z + hz + (fz < 0 ? ex : 0) };
                });
                for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
                    const a = rects[i], b = rects[j];
                    if (a.x1 > b.x0 && b.x1 > a.x0 && a.z1 > b.z0 && b.z1 > a.z0) { overlaps++; console.log(`  OVERLAP ${c.id}: ${a.id} / ${b.id}`); }
                }
                housesN += rects.length;
            }
            for (const h of c.houses || []) {
                if (!['hut', 'cottage', 'longhouse', 'manor', 'stone', 'brick', 'towerhouse'].includes(h.kind)) continue;
                const r = probe((x, L, z) => d.get(x, L, z), h, GEN >= HOUSE_SIZE_FROM_GEN ? BIG_HOUSES[h.kind] : { w: OLD[h.kind][0], d: OLD[h.kind][1] });
                const S = sum[h.kind] || (sum[h.kind] = { n: 0, ground: 0, upper: 0, wide: 0, bedsOk: 0, beds: 0, chestsOk: 0, chests: 0, up: 0, inner: r.inner });
                S.n++; S.ground += r.groundArea; S.upper += r.upperArea; S.wide += r.floors.reduce((a, f) => a + f.wide, 0);
                S.beds += r.beds.length; S.bedsOk += r.beds.filter(Boolean).length; S.chests += r.chests.length; S.chestsOk += r.chests.filter(Boolean).length; S.up += r.upstairs ? 1 : 0;
                if (VERBOSE || !r.beds.every(Boolean) || (h.rich && !r.upstairs)) console.log(`  ${c.id} ${h.kind} ${h.id}: beds ${r.beds.map(Number)} chests ${r.chests.map(Number)} floors ${JSON.stringify(r.floors)} ground ${r.groundArea} upper ${r.upperArea}`);
            }
        }
        console.log(`seed ${seed}: ${seenC.size} castles in ${(performance.now() - t0).toFixed(0)} ms`);
    }
    console.log(`\ngen ${GEN}: ${housesN} houses, ${overlaps} overlapping, ${graphBad}/${graphN} not joined to the village's ways`);
    for (const [k, S] of Object.entries(sum)) {
        console.log(`  ${k.padEnd(11)} n ${String(S.n).padStart(3)}  inside ${S.inner.join('×')}  ground ${(S.ground / S.n).toFixed(0)}  upper ${(S.upper / S.n).toFixed(0)}  wide-way cells ${(S.wide / S.n).toFixed(0)}  beds reached ${S.bedsOk}/${S.beds}  chests reached ${S.chestsOk}/${S.chests}  upstairs ${S.up}/${S.n}`);
    }
}
