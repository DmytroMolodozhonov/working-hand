/**
 * The villagers' houses of the new generation (Castles.buildHouseBig; HOUSE_SIZE_FROM_GEN): the author — «дома жителей слишком тесные, трудно
 * двигаться и взаимодействовать. Даже у бедных вдвое просторнее по площади. У богатых — двухэтажные дома, строить вверх, а не вширь».
 * Measured on the real blocks of generated castles (tests/unit/house-probe.mjs; tools/housebench.mjs prints the same for the author):
 * every poor home has at least twice the old free floor, the rich ones two floors with a stair, every way 3 wide, every bed and chest reached,
 * the walking nodes on free floor, no house in another, the older worlds exactly as they were.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, WORLD_GEN, HOUSE_SIZE_FROM_GEN, BLOCK } from '../../src/world/Terrain.js';
import { BIG_HOUSES, BIG_UP, BIG_LOT, Plan, buildHouseBig } from '../../src/world/Castles.js';
import { createRng } from '../../src/core/math.js';
import { judge } from '../../src/world/Structure.js';
import { probe, OLD } from './house-probe.mjs';
import { FlatData } from './structure-fake.mjs';

const make = (seed, big) => { const d = new TerrainData(); d.generate({ seed, mountains: true, seas: true, lush: true, slopes: true, wizHuts: true, furnish: true, bigHouses: big }); return d; };
const castles = (d, n = 1) => { const out = []; for (let gz = -n; gz <= n; gz++) for (let gx = -n; gx <= n; gx++) { const c = d.castles.cellOf(gx, gz); if (c) out.push(c); } return out; };
const SEEDS = [20261029, 20261029 + 7919];
const POOR = ['hut', 'cottage', 'longhouse'], RICH = ['manor', 'stone', 'brick', 'towerhouse'];

test('big houses: new worlds have it (one number, HOUSE_SIZE_FROM_GEN); older worlds keep their small houses', () => {
    assert.ok(WORLD_GEN >= HOUSE_SIZE_FROM_GEN);
    assert.ok(Number.isInteger(HOUSE_SIZE_FROM_GEN) && HOUSE_SIZE_FROM_GEN > 8);
    for (const seed of SEEDS.slice(0, 1)) {
        const oldW = castles(make(seed, false)), newW = castles(make(seed, true));
        assert.ok(oldW.length > 0 && newW.length > 0);
        for (const c of oldW) for (const h of c.houses) assert.equal(h.floors, undefined, `${h.id}: an old world's house is the old kind`);
        for (const c of newW) for (const h of c.houses) if (BIG_HOUSES[h.kind]) assert.ok(h.floors === 1 || h.floors === 2, `${h.id}: a new world's house`);
    }
});

test('big houses: the floor space — every poor home at least twice the old one, a rich one two floors (each a floor of the old house or more)', () => {
    for (const [kind, T] of Object.entries(BIG_HOUSES)) {
        if (T.barn) continue;
        const inner = (2 * T.w - 1) * (2 * T.d - 1), old = (2 * OLD[kind][0] - 1) * (2 * OLD[kind][1] - 1);
        if (T.rich) assert.ok(inner * 2 >= old * 2 * 1.5, `${kind}: ${inner} per floor, two floors, the old ${old}`);
        else assert.ok(inner >= 2 * old, `${kind}: ${inner} ≥ 2 × ${old}`);
        assert.equal(!!T.rich, RICH.includes(kind), kind);
        assert.ok(T.h >= 8, `${kind}: a floor is 7–8 m`);
    }
});

test('big houses: the free floor of a poor home is at least twice the old one, measured on the real blocks', () => {
    const area = { old: {}, big: {} };
    for (const big of [false, true]) {
        for (const seed of SEEDS) {
            const d = make(seed, big);
            for (const c of castles(d)) for (const h of c.houses) {
                if (!POOR.includes(h.kind)) continue;
                const r = probe((x, L, z) => d.get(x, L, z), h, big ? BIG_HOUSES[h.kind] : { w: OLD[h.kind][0], d: OLD[h.kind][1] });
                const S = area[big ? 'big' : 'old'][h.kind] || (area[big ? 'big' : 'old'][h.kind] = { n: 0, a: 0 });
                S.n++; S.a += r.groundArea;
            }
        }
    }
    for (const kind of POOR) {
        const o = area.old[kind], b = area.big[kind];
        assert.ok(o && b && o.n >= 3 && b.n >= 3, `${kind}: homes in both worlds`);
        assert.ok(b.a / b.n >= 2 * o.a / o.n, `${kind}: free floor ${(b.a / b.n).toFixed(1)} vs old ${(o.a / o.n).toFixed(1)}`);
    }
});

test('big houses: ways 3 wide to every bed and chest, the rich upstairs by the stair; the walking nodes on free floor; joined to the village', () => {
    let rich = 0, poor = 0, joinedN = 0;
    for (const seed of SEEDS) {
        const d = make(seed, true);
        for (const c of castles(d)) {
            const adj = new Map();
            for (const [a, b] of c.edges) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
            const gate = c.nodes.find((n) => n.tag === 'gateOut') || c.nodes[0];
            const seenN = new Set([gate.id]), st = [gate.id];
            while (st.length) { const n = st.pop(); for (const m of adj.get(n) || []) if (!seenN.has(m)) { seenN.add(m); st.push(m); } }
            for (const h of c.houses) {
                if (!BIG_HOUSES[h.kind] || BIG_HOUSES[h.kind].barn) continue;
                const T = BIG_HOUSES[h.kind];
                const r = probe((x, L, z) => d.get(x, L, z), h, T);
                assert.ok(r.beds.length >= 1 && r.beds.every(Boolean), `${h.id} ${h.kind}: every bed reached ${r.beds}`);
                assert.ok(r.chests.length >= 2 && r.chests.every(Boolean), `${h.id} ${h.kind}: every chest reached ${r.chests}`);
                if (T.rich) {
                    rich++;
                    assert.ok(r.upstairs, `${h.id}: the floor above is reached by the stair`);
                    assert.ok(r.upperArea >= 100 && r.groundArea >= 100, `${h.id}: both floors roomy ${r.groundArea} ${r.upperArea}`);
                    assert.ok(h.bedSpots.length >= 2 && h.bedSpots.some((b) => b.y > h.doorRec.y + 6), `${h.id}: bedrooms upstairs`);
                    assert.equal(h.floors, 2);
                } else poor++;
                // the way in: the door's node and the home's node are on the village's ways
                assert.ok(seenN.has(h.doorNode) && seenN.has(h.homeNode), `${h.id}: joined to the village's ways`);
                joinedN++;
                // the nodes inside stand on free floor (feet on a block, 4 free layers over them), every edge between them is walked in a straight line
                const solid = (x, y, z) => d.get(Math.round(x), y, Math.round(z)) !== BLOCK.AIR;
                const stand = (x, y, z) => solid(x, y, z) && [1, 2, 3, 4].every((k) => !solid(x, y + k, z));
                const near = (x, z, yl) => { for (let y = Math.floor(yl) - 1; y <= Math.ceil(yl) + 1; y++) if (stand(x, y, z)) return true; return false; };
                const depthX = Math.abs(h.inside.x - h.doorRec.x) > Math.abs(h.inside.z - h.doorRec.z);
                const hx = (depthX ? T.d : T.w) - 1, hz = (depthX ? T.w : T.d) - 1; // (the cells inside the walls)
                const inHouse = (n) => Math.abs(n.x - h.c.x) <= hx && Math.abs(n.z - h.c.z) <= hz;
                for (const n of c.nodes) if (inHouse(n)) assert.ok(near(n.x, n.z, n.y + 0.5), `${h.id} node ${n.id} (${n._u},${n._v},${n._l}) on free floor`);
                for (const [a, b] of c.edges) {
                    const A = c.nodes[a], Bn = c.nodes[b];
                    if (!inHouse(A) || !inHouse(Bn)) continue;
                    for (let t = 0; t <= 1; t += 0.05) {
                        const x = A.x + (Bn.x - A.x) * t, z = A.z + (Bn.z - A.z) * t, y = A.y + (Bn.y - A.y) * t;
                        assert.ok(near(x, z, y + 0.5), `${h.id} edge ${a}-${b} [(${A._u},${A._v},${A._l}) → (${Bn._u},${Bn._v},${Bn._l})] blocked at t=${t.toFixed(2)}`);
                    }
                }
            }
        }
    }
    assert.ok(rich >= 8 && poor >= 30, `homes looked at: ${rich} rich, ${poor} poor`);
    assert.ok(joinedN > 40);
});

test('big houses: the stair is 3 wide and as high as the floor; the door is 3 × 6; the balcony stands over the door; ways inside are 3 wide', () => {
    for (const kind of RICH) {
        const T = BIG_HOUSES[kind];
        const S = { houseStone: BLOCK.COBBLE, villageRoof: BLOCK.ROOF_RED, poorRoof: BLOCK.ROOF_RED, poorWall: BLOCK.PLASTER, roof: BLOCK.ROOF_RED, carpet: BLOCK.CLOTH_WHITE, bedRich: 'red', bigHouses: true, frng: createRng(5) };
        const p = new Plan(100, 200, 0, 0);
        const out = { houses: [] };
        buildHouseBig(p, kind, 0, 0, 0, createRng(3), S, out);
        const h = out.houses[0];
        assert.equal(h.doorRec.w, 3);
        assert.equal(h.doorRec.h, 6);
        const blocks = new Map();
        for (const q of p.parts) { if (q.k === 3) continue; for (let x = q.x0; x <= q.x1; x++) for (let z = q.z0; z <= q.z1; z++) for (let L = q.L0; L <= q.L1; L++) blocks.set(x + ',' + L + ',' + z, q.t); }
        const at = (a, l, b) => blocks.get((100 + a) + ',' + (1 + l) + ',' + (200 + b)) || 0;
        // the stair: along the back wall, 3 wide (b d−3 … d−1), BIG_UP steps rising by one
        const sa0 = -T.w + 1, sb0 = T.d - 3;
        for (let i = 0; i < BIG_UP; i++) for (let b = sb0; b <= sb0 + 2; b++) {
            assert.ok(at(sa0 + i, i, b) !== 0, `step ${i} at b ${b}`);
            assert.equal(at(sa0 + i, i + 1, b), 0, `nothing over step ${i}`);
        }
        // the upper floor's slab (layer BIG_UP − 1) is whole except over the upper steps
        assert.ok(at(-T.w + 2, BIG_UP - 1, 0) !== 0, 'the floor between');
        assert.equal(at(sa0 + BIG_UP - 4, BIG_UP - 1, sb0 + 1), 0, 'the hole over the stair');
        // the door: 3 wide, 6 high, free; the balcony over it: a floor on posts
        const da = -4;
        for (let a = da - 1; a <= da + 1; a++) for (let l = 0; l <= 5; l++) assert.equal(at(a, l, -T.d), 0, `the door ${a},${l}`);
        for (let a = da - 2; a <= da + 2; a++) for (let b = -T.d - 3; b <= -T.d - 1; b++) assert.ok(at(a, BIG_UP - 1, b) !== 0, `the balcony floor ${a},${b}`);
        assert.ok(at(da - 2, 3, -T.d - 3) !== 0 && at(da + 2, 3, -T.d - 3) !== 0, 'two posts under the balcony');
        // the walls are tall enough for two floors of 8, the roof over them
        assert.ok(at(-T.w, T.h - 1, 0) !== 0 && at(0, T.h + 1, 0) !== 0 || at(0, T.h + T.d, 0) !== 0, 'walls and a roof');
    }
});

test('big houses: lots wider apart, the outer ring road further out; no house stands in another; the houses of one village differ', () => {
    assert.ok(BIG_LOT.PITCH > 17 && BIG_LOT.OFF > 9 && BIG_LOT.RING_EXTRA > 0);
    let houses = 0;
    for (const seed of SEEDS) {
        const d = make(seed, true);
        for (const c of castles(d)) {
            const rects = c.houses.filter((h) => BIG_HOUSES[h.kind] && h.doorRec).map((h) => {
                const T = BIG_HOUSES[h.kind];
                const depthX = Math.abs(h.inside.x - h.doorRec.x) > Math.abs(h.inside.z - h.doorRec.z);
                const hx = (depthX ? T.d : T.w) + 1, hz = (depthX ? T.w : T.d) + 1;
                return { id: h.id, x0: h.c.x - hx, x1: h.c.x + hx, z0: h.c.z - hz, z1: h.c.z + hz };
            });
            houses += rects.length;
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
                const a = rects[i], b = rects[j];
                assert.ok(!(a.x1 > b.x0 && b.x1 > a.x0 && a.z1 > b.z0 && b.z1 > a.z0), `${a.id} / ${b.id} overlap`);
            }
            assert.ok(new Set(c.houses.map((h) => h.kind)).size >= 3, `${c.id}: kinds`);
        }
    }
    assert.ok(houses > 60, `houses ${houses}`);
});

test('big houses: a house stands as built — nothing falls, nothing crushed (Structure.js)', () => {
    for (const kind of [...RICH, ...POOR, 'barn']) for (const face of [0, 1]) {
        const S = { houseStone: BLOCK.COBBLE, villageRoof: BLOCK.ROOF_RED, poorRoof: BLOCK.ROOF_RED, poorWall: BLOCK.PLASTER, roof: BLOCK.ROOF_RED, carpet: BLOCK.CLOTH_WHITE, bedRich: 'red', bigHouses: true, frng: createRng(5) };
        const p = new Plan(100, 200, 0, 0);
        buildHouseBig(p, kind, 0, 0, face, createRng(3 + face), S, { houses: [] });
        const d = new FlatData();
        for (const q of p.parts) { if (q.k !== 0) continue; for (let x = q.x0; x <= q.x1; x++) for (let z = q.z0; z <= q.z1; z++) for (let L = q.L0; L <= q.L1; L++) d.set(x, L, z, q.t); }
        const r = judge(d, { x0: 70, z0: 170, L0: -16, NX: 62, NY: 60, NZ: 62 });
        const lost = r.lost.filter((c) => c[3] !== BLOCK.LANTERN && c[3] !== BLOCK.FLOWERS); // (a lamp on a wall: hung from it, as in the castles)
        assert.equal(lost.length, 0, `${kind} face ${face}: hanging ${lost.length}`);
        assert.equal(r.crushed.length, 0, `${kind} face ${face}: crushed`);
        assert.ok(r.torn.length <= 4, `${kind} face ${face}: torn ${r.torn.length}`);
    }
});

test('big houses: every room of a home has things in it, by its purpose; furniture is not on the ways', () => {
    const d = make(SEEDS[0], true);
    let rooms = 0;
    for (const c of castles(d)) for (const h of c.houses) {
        if (!BIG_HOUSES[h.kind] || BIG_HOUSES[h.kind].barn) continue;
        const names = h.rooms.map((r) => r.name);
        if (BIG_HOUSES[h.kind].rich) assert.deepEqual(names.sort(), ['homeBedroom', 'homeBedroom', 'homeKitchen', 'homeLiving'], h.id);
        else assert.deepEqual(names, ['homeMain'], h.id);
        for (const r of h.rooms) {
            rooms++;
            assert.ok(r.items >= 6, `${h.id} ${r.name}: ${r.items} things`);
            if (/Bedroom|Main/.test(r.name)) assert.ok(r.kinds.bed >= 1, `${h.id} ${r.name}: a bed`);
        }
    }
    assert.ok(rooms > 40);
});
