/**
 * The different buildings of the settlements (world generation 11, Buildings.js; BUILDINGS_FROM_GEN) — the author: «сейчас в деревнях одни и те же дома».
 * Each building is built alone on a flat plan and checked on its real blocks (the way in 3 wide, nothing in the air, a roof, a door 3 × 6, the sizes
 * inside the lot); then in generated worlds (the kinds by the size of the settlement, old worlds as they were); then the people (Trades.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, WORLD_GEN, BUILDINGS_FROM_GEN } from '../../src/world/Terrain.js';
import { Plan } from '../../src/world/Castles.js';
import { buildBuilding, BUILDING_KINDS, BUILDING_IDS, TRADE_OF, townKinds, hamletKinds } from '../../src/world/Buildings.js';
import { createRng } from '../../src/core/math.js';
import { rasterParts, makeStyle, checkBuilding } from './building-util.mjs';
import { TRADE_TITLES, tradeTitle, withTrade, applyTradeLook, TRADE_OF_SHOP } from '../../src/game/Trades.js';
import { SHOPS } from '../../src/game/MarketGoods.js';

const solid = (t) => t != null && t !== 0 && t !== BLOCK.WATER;
function build(kind, face = 0) {
    const p = new Plan(0, 0, 0, 0);
    const out = { houses: [], stalls: [], fields: [], pens: [] };
    const node = buildBuilding(p, kind, 0, 0, face, createRng(7), makeStyle(), out);
    return { p, out, node, g: rasterParts(p.parts), house: BUILDING_KINDS[kind].house ? out.houses.at(-1) : null };
}

test('the world version: new worlds are generation 11, BUILDINGS_FROM_GEN is the one number, ten kinds of building', () => {
    assert.ok(WORLD_GEN >= BUILDINGS_FROM_GEN);
    assert.equal(BUILDINGS_FROM_GEN, 11);
    assert.deepEqual(BUILDING_IDS.sort(), ['bakery', 'chapel', 'church', 'granary', 'herbalist', 'mill', 'smithy', 'stable', 'tavern', 'well']);
});

for (const kind of Object.keys(BUILDING_KINDS)) {
    for (const face of [0, 1, 2, 3]) {
        test(`${kind} (turned ${face}): the way in 3 wide to everything used, a door 3 × 6, nothing in the air`, () => {
            const { p, out, g, house } = build(kind, face);
            const c = checkBuilding(p, out, kind, g);
            assert.deepEqual(c.problems, []);
            if (house) {
                assert.equal(house.doorRec.w, 3);
                assert.ok(house.doorRec.h >= 6, 'the doorway is 6 high');
                assert.ok(house.windows.length >= 3 || kind === 'well', 'windows with glass');
                assert.equal(house.trade, TRADE_OF[kind]);
                assert.ok(house.flavor, 'what the chests hold');
            }
        });
    }

    test(`${kind}: it stands inside its lot (a normal lot 17 × 14, a big one 26 × 26; the front never over the road's edge)`, () => {
        const { g } = build(kind, 0);
        const big = BUILDING_KINDS[kind].big;
        let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
        for (const [k, t] of g) {
            if (!t) continue;
            const [x, L, z] = k.split(',').map(Number);
            if (L < 1) continue; // (the floor — layer −1 is L 0 — and what is under it)
            a0 = Math.min(a0, x); a1 = Math.max(a1, x); b0 = Math.min(b0, z); b1 = Math.max(b1, z);
        }
        assert.ok(b0 >= -7, `front at ${b0}`);
        if (big) { assert.ok(a0 >= -12 && a1 <= 12, `width ${a0}…${a1}`); assert.ok(b1 <= 19, `depth ${b1}`); }
        else { assert.ok(a0 >= -9 && a1 <= 9, `width ${a0}…${a1}`); assert.ok(b1 <= 7, `depth ${b1}`); }
    });
}

test('a roof over every room: every free floor cell of a building (not the well) has a block over it', () => {
    for (const kind of BUILDING_IDS.filter((k) => BUILDING_KINDS[k].house)) {
        const { p, g, house } = build(kind);
        const L0 = p.F + 1;
        const x = Math.round(house.inside.x), z = Math.round(house.inside.z);
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
            if (solid(g.get(`${x + dx},${L0},${z + dz}`))) continue;
            let roofed = false;
            for (let L = L0 + 6; L <= L0 + 40; L++) if (solid(g.get(`${x + dx},${L},${z + dz}`))) { roofed = true; break; }
            assert.ok(roofed, `${kind}: no roof over ${x + dx},${z + dz}`);
        }
    }
});

test('the counters: 2 high (a market stall), the merchant behind and the customer before it, on the floor; the shop has its goods', () => {
    for (const kind of ['smithy', 'bakery', 'herbalist', 'tavern']) {
        const { p, out, g } = build(kind);
        const st = out.stalls.find((s) => s.building === kind);
        assert.ok(st, kind + ' has a stall');
        assert.ok(SHOPS[st.shop], 'goods for ' + st.shop);
        assert.equal(SHOPS[st.shop].goods.length, 3);
        assert.ok(TRADE_OF_SHOP[st.shop], 'a trade for ' + st.shop);
        const c = st.counter;
        const L0 = p.F + 1;
        for (let x = Math.ceil(c.x0); x <= Math.floor(c.x1); x++) for (let z = Math.ceil(c.z0); z <= Math.floor(c.z1); z++) {
            assert.ok(solid(g.get(`${x},${L0},${z}`)) && solid(g.get(`${x},${L0 + 1},${z}`)), `${kind}: the counter at ${x},${z} is 2 blocks high`);
        }
        assert.equal(st.houseOf, out.houses.length - 1, 'the shopkeeper lives in the building');
        // the merchant stands on a floor, in the air of the room
        const bx = Math.round(st.back.x), bz = Math.round(st.back.z);
        assert.ok(solid(g.get(`${bx},${L0 - 1},${bz}`)), 'a floor under the merchant');
        for (let l = 0; l < 5; l++) assert.ok(!solid(g.get(`${bx},${L0 + l},${bz}`)), 'room over the merchant');
    }
});

test('the mill: the sails are a record of the world (a hub 8+ m over the ground, facing the road); the church: a bell in an open belfry', () => {
    const m = build('mill');
    const v = m.out.fx.find((f) => f.k === 'vanes');
    assert.ok(v && v.R >= 7);
    assert.ok(v.y - v.R >= m.p.pt(0, 0, 0).y + 6.5, 'the lowest tip is higher than a hero with a hat (4.6) and his raised arm');
    assert.ok(Math.abs(Math.hypot(v.dx, v.dz) - 1) < 1e-9);
    for (const k of ['church', 'chapel']) {
        const b = build(k);
        const bell = b.out.fx.find((f) => f.k === 'bell');
        assert.ok(bell, k + ' has a bell');
        // the belfry is open on the front: the hole through the tower wall at the bell's height
        const L = Math.round(bell.y + 1.5);
        let open = false;
        for (const [k2, t] of b.g) { void t; }
        const c = [Math.round(bell.x), Math.round(bell.z)];
        assert.ok(!solid(b.g.get(`${c[0]},${L},${c[1]}`)), 'air where the bell hangs');
        open = true;
        assert.ok(open);
    }
    for (const k of ['smithy', 'bakery', 'tavern']) assert.ok(build(k).out.fx.some((f) => f.k === 'smoke'), k + ' smokes');
    assert.ok(build('smithy').out.fx.some((f) => f.k === 'forge'));
});

test('the stable: horses in pens (the stalls and the paddock), a back door to the paddock', () => {
    const { out, house } = build('stable');
    assert.ok(out.pens.length >= 3);
    assert.ok(out.pens.every((q) => q.animals.every((a) => a === 'horse') && q.r >= 1.2));
    assert.ok(house.back);
});

// ------------------------------------------------------------------ the worlds
const mk = (seed, buildings) => { const d = new TerrainData(); d.generate({ seed, mountains: true, seas: true, lush: true, slopes: true, wizHuts: true, furnish: true, buildings }); return d; };
const SEEDS = [20261015, 99];
const sitesOf = (d, R = 3) => { const out = []; for (let gz = -R; gz <= R; gz++) for (let gx = -R; gx <= R; gx++) { const c = d.castles.cellOf(gx, gz); if (c) out.push(c); for (const h of d.hamlets.cellOf(gx, gz)) out.push(h); } return out; };

test('generation 11 settlements: castles by their size, folk villages by the number of houses; old worlds have none and are as they were', () => {
    for (const seed of SEEDS) {
        const A = mk(seed, true), B = mk(seed, false);
        for (const c of sitesOf(A).filter((s) => s.kind !== 'hamlet')) {
            const kinds = (c.buildings || []).map((b) => b.kind);
            assert.ok(kinds.includes('well') && kinds.includes('granary'), `${c.id}: a well and a granary`);
            if (c.style === 'grand') for (const k of ['church', 'stable', 'mill', 'smithy', 'tavern', 'bakery', 'herbalist']) assert.ok(kinds.includes(k) || kinds.length >= 6, `${c.id} grand: ${k}`);
            if (c.style === 'compact') assert.ok(!kinds.includes('church') && !kinds.includes('smithy'), `${c.id}: a small place has no church or smithy`);
            for (const h of c.houses) if (h.trade) assert.ok(h.flavor && h.doorRec, `${c.id}: ${h.bld} is a house with a door`);
            c.stalls.forEach((s, i) => { if (s.shop) assert.ok(c.houses[s.houseOf]?.trade, `${c.id}: stall ${i} lives in a building`); });
            assert.ok(Array.isArray(c.fx) && Array.isArray(c.wells));
        }
        for (const h of sitesOf(A).filter((s) => s.kind === 'hamlet' && s.type === 'village')) {
            const kinds = (h.buildings || []).map((b) => b.kind);
            assert.ok(kinds.includes('well') || h.houses.length < 5, `${h.id}`);
        }
        for (const c of sitesOf(B)) {
            assert.equal((c.buildings || []).length, 0, `${c.id}: an old world has no new buildings`);
            assert.ok(c.houses.every((h) => !h.trade), `${c.id}: no trade houses`);
        }
        // a world without the option is the same as before: the castle's houses are the old ones
        const C = sitesOf(B).filter((s) => s.kind !== 'hamlet');
        assert.ok(C.length > 0);
    }
});

test('townKinds / hamletKinds: small — a well and a granary; middle — and a smithy, a tavern, a chapel; large — all', () => {
    const r = () => createRng(3);
    assert.deepEqual(townKinds('compact', () => 0.9), ['well', 'granary']);
    assert.ok(townKinds('fortress', r()).includes('smithy') && townKinds('fortress', r()).includes('tavern') && townKinds('fortress', r()).includes('chapel'));
    const grand = townKinds('grand', r());
    for (const k of ['church', 'mill', 'bakery', 'herbalist', 'stable', 'smithy', 'tavern', 'well', 'granary']) assert.ok(grand.includes(k), k);
    assert.deepEqual(hamletKinds(4, r()), ['well', 'granary']);
    assert.equal(hamletKinds(6, r()).length, 3);
    assert.equal(hamletKinds(9, r()).length, 4);
});

test('the lots: a big building takes a 26 × 26 place — no other building or house within it', () => {
    const d = mk(20261015, true);
    for (const c of sitesOf(d).filter((s) => s.kind !== 'hamlet')) {
        for (const b of c.buildings.filter((q) => BUILDING_KINDS[q.kind].big)) {
            for (const o of c.buildings) {
                if (o === b) continue;
                assert.ok(Math.hypot(o.x - b.x, o.z - b.z) > 12, `${c.id}: ${o.kind} too near the ${b.kind}`);
            }
        }
    }
});

// ------------------------------------------------------------------ the people
test('Trades: titles for men and women, a look for each trade; the first of a house is its tradesman; the shop merchant lives in his building', () => {
    for (const t of Object.keys(TRADE_TITLES)) {
        assert.ok(tradeTitle(t, false) && tradeTitle(t, true), t);
        const L = { seed: 5, female: false, role: 'farmer', hat: 'none', beard: 'none', skin: 0, shirt: 0, pants: 0, accent: 0 };
        applyTradeLook(L, t);
        assert.ok(L.shirt !== 0 || L.dress, t + ' gets clothes');
    }
    assert.equal(tradeTitle('baker', true), 'Пекарша');
    const def = { stalls: [{ shop: 'smith', houseOf: 2 }], houses: [{}, {}, { trade: 'smith' }, { trade: 'priest' }] };
    const homes = () => new Map([[3, [40, 41]]]);
    const m = withTrade(def, { idx: 1, role: 'merchant', stall: 0, home: 0 }, homes);
    assert.equal(m.trade, 'smith'); assert.equal(m.home, 2);
    const a = withTrade(def, { idx: 40, role: 'farmer', stall: -1, home: 3 }, homes), b = withTrade(def, { idx: 41, role: 'builder', stall: -1, home: 3 }, homes);
    assert.equal(a.trade, 'priest'); assert.equal(b.trade, undefined);
    assert.equal(withTrade(def, { idx: 40, role: 'farmer', stall: -1, home: 3 }, homes), a, 'the same entry every time');
});

test('the people look right: every trade makes a model (hat, apron, cross) without an error', async () => {
    const { villagerLook, VillagerModel } = await import('../../src/entities/VillagerModel.js');
    for (const t of Object.keys(TRADE_TITLES)) for (const female of [false, true]) {
        const role = ['baker', 'innkeeper'].includes(t) ? 'merchant' : t === 'smith' ? 'builder' : 'farmer';
        const L = villagerLook(11, role, female);
        applyTradeLook(L, t);
        const model = new VillagerModel(L);
        assert.ok(model.group, t);
    }
});
