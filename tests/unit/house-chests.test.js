/**
 * Chests in the villagers' houses and in the castles' rooms stand inside the room (CLAUDE.md:
 * nothing goes through walls): checked on the real blocks of generated worlds — every house
 * kind, all four ways a house can face, wizards' houses, many seeds. The chest's box (and the
 * room in front of it to open it) is air on the floor of the room, its back is at a wall, it
 * stands on no bed and not in the doorway, and two chests never share a place.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { Plan, buildHouse, HOUSE_CHEST_SCALE } from '../../src/world/Castles.js';
import { createRng } from '../../src/core/math.js';

// the chest's size per unit of scale and its collision box (src/entities/Chest.js — no THREE here)
const chestSrc = await import('node:fs').then((fs) => fs.readFileSync(new URL('../../src/entities/Chest.js', import.meta.url), 'utf8'));
const CHEST_W = 1.25, CHEST_D = 0.85, CHEST_H = 0.7;

/** The chest's footprint (x0, x1, z0, z1) and the way its front looks (fx, fz) for a Chest facing. */
function footprint(c, facing, scale) {
    const q = Math.round(facing / (Math.PI / 2)), sw = Math.abs(q) % 2 === 1;
    const hx = (sw ? CHEST_D : CHEST_W) * scale / 2, hz = (sw ? CHEST_W : CHEST_D) * scale / 2;
    return { x0: c.x - hx, x1: c.x + hx, z0: c.z - hz, z1: c.z + hz, fx: Math.round(Math.sin(facing)), fz: Math.round(Math.cos(facing)), hx, hz };
}

const cells = (r0, r1) => { const out = []; for (let i = Math.round(r0 + 0.01); i <= Math.round(r1 - 0.01); i++) out.push(i); return out; };
const overlap = (a, b) => a.x1 > b.x0 + 1e-6 && a.x0 < b.x1 - 1e-6 && a.z1 > b.z0 + 1e-6 && a.z0 < b.z1 - 1e-6;

/** What is wrong with a chest standing in a world (`solid(x, L, z)`), [] when nothing. */
function problems(solid, c, facing, scale, beds = [], door = null) {
    const f = footprint(c, facing, scale);
    const L0 = Math.round(c.y + 1.5), H = Math.ceil(CHEST_H * scale);
    const bad = [];
    for (const x of cells(f.x0, f.x1)) for (const z of cells(f.z0, f.z1)) {
        for (let L = L0; L < L0 + H; L++) if (solid(x, L, z)) bad.push('a block in it');
        if (!solid(x, L0 - 1, z)) bad.push('no floor under it');
    }
    // room to open it in front; a wall right behind it
    const depth = f.fx ? f.hx : f.hz;
    const along = f.fx ? cells(f.z0, f.z1) : cells(f.x0, f.x1);
    for (const s of along) {
        const at = (d) => (f.fx ? [Math.round(c.x + f.fx * d), s] : [s, Math.round(c.z + f.fz * d)]);
        const [fx, fz] = at(depth + 0.5), [bx, bz] = at(-depth - 0.4);
        if (solid(fx, L0, fz)) bad.push('its front against something');
        if (!solid(bx, L0 + 1, bz)) bad.push('no wall behind it');
    }
    for (const b of beds) if (overlap(f, b)) bad.push('on a bed');
    if (door && overlap(f, door)) bad.push('in the doorway');
    return [...new Set(bad)];
}

/** A bed's footprint (src/game/Beds.js: 2.5 × 5.5 m, along its yaw). */
function bedRect(b) {
    const along = Math.abs(Math.sin(b.yaw)) > 0.5; // (lying along x)
    const hx = along ? 2.75 : 1.25, hz = along ? 1.25 : 2.75;
    return { x0: b.x - hx, x1: b.x + hx, z0: b.z - hz, z1: b.z + hz };
}

/** The room just inside a door (3 m deep), kept free. */
function doorRect(h) {
    if (!h.doorRec) return null;
    const d = h.doorRec, ax = Math.abs(Math.cos(d.ry)) > 0.5; // (the leaf along x)
    const ix = Math.sign(h.inside.x - d.x), iz = Math.sign(h.inside.z - d.z);
    return ax ? { x0: d.x - 1.5, x1: d.x + 1.5, z0: Math.min(d.z, d.z + iz * 3), z1: Math.max(d.z, d.z + iz * 3) }
        : { x0: Math.min(d.x, d.x + ix * 3), x1: Math.max(d.x, d.x + ix * 3), z0: d.z - 1.5, z1: d.z + 1.5 };
}

test('house chests: the chest\'s size here is the one of src/entities/Chest.js', () => {
    assert.match(chestSrc, /export const CHEST_W = 1\.25, CHEST_D = 0\.85, CHEST_H = 0\.7;/);
    assert.match(chestSrc, /CHEST_W \* this\.scale \/ 2, d = CHEST_D \* this\.scale \/ 2/);
});

test('house chests: every kind, every way a house faces, wizards\' houses — inside the room, on the floor, at a wall', () => {
    const S = { houseStone: BLOCK.COBBLE, villageRoof: BLOCK.ROOF_RED, poorRoof: BLOCK.ROOF_RED, poorWall: BLOCK.PLASTER, roof: BLOCK.ROOF_RED, carpet: BLOCK.CLOTH_WHITE, bedRich: 'red' };
    const wizard = { ...S, doorTop: 5, noWoodpile: true, decorate: (P, { table, cauldron }) => {
        if (cauldron) P.box(cauldron[0], cauldron[0], 0, 0, cauldron[1], cauldron[1], BLOCK.GOLD);
        if (table) P.box(table[0], table[0], 2, 2, table[1], table[1], BLOCK.GOLD);
    } };
    const want = { hut: 1, cottage: 1, longhouse: 1, barn: 0, manor: 2, stone: 2, brick: 2, towerhouse: 2 };
    for (const kind of Object.keys(want)) for (const style of [S, wizard]) for (let face = 0; face < 4; face++) for (let seed = 1; seed <= 6; seed++) {
        // one house on its own: its blocks into a little world (layer 0: the floor's top)
        const p = new Plan(100, 200, 0, seed % 4);
        const out = { houses: [] };
        buildHouse(p, kind, 3, -5, face, createRng(seed * 7 + face), style, out);
        const h = out.houses[0];
        const blocks = new Map();
        for (const q of p.parts) for (let x = q.x0; x <= q.x1; x++) for (let z = q.z0; z <= q.z1; z++) for (let L = q.L0; L <= q.L1; L++) blocks.set(x + ',' + L + ',' + z, q.t);
        const solid = (x, L, z) => !!blocks.get(x + ',' + L + ',' + z);
        const where = `${kind}${style === wizard ? ' (wizard)' : ''} face ${face} seed ${seed}`;
        assert.equal(h.chests.length, want[kind], `${where}: ${h.chests.length} chests`);
        const beds = h.bedSpots.map(bedRect), door = doorRect(h);
        const placed = [];
        for (const c of h.chests) {
            assert.equal(c.scale, HOUSE_CHEST_SCALE);
            const bad = problems(solid, c, c.yaw + Math.PI, c.scale, beds, door); // (src/game/Houses.js: facing = yaw + π)
            assert.deepEqual(bad, [], `${where}: chest at ${c.x - p.X}, ${c.z - p.Z}`);
            const f = footprint(c, c.yaw + Math.PI, c.scale);
            for (const o of placed) assert.ok(!overlap(f, o), `${where}: two chests in one place`);
            placed.push(f);
        }
    }
});

test('house chests: in generated villages and castles (houses on slopes, castle rooms, the port) — inside, on the floor', () => {
    let n = 0;
    for (const seed of [4242, 777]) {
        const t = new TerrainData();
        t.generate({ seed, mountains: true });
        const solid = (x, L, z) => { const b = t.get(x, L, z); return b !== BLOCK.AIR && b !== BLOCK.WATER; };
        for (let gz = -2; gz <= 2; gz++) for (let gx = -2; gx <= 2; gx++) {
            const cs = t.castles.cellOf(gx, gz);
            if (!cs) continue;
            const placed = [];
            for (const c of cs.chests) {
                const bad = problems(solid, c, c.yaw, c.scale || 3).filter((b) => c.room !== 'port' || b !== 'no wall behind it'); // (the port's chest: on the open quay)
                assert.deepEqual(bad, [], `${cs.name}: the ${c.room}'s chest`);
                const f = footprint(c, c.yaw, c.scale || 3);
                assert.ok(placed.every((o) => !overlap(f, o)), `${cs.name}: two chests in one place`);
                placed.push(f);
                n++;
            }
            for (const h of cs.houses) for (const c of h.chests) {
                assert.deepEqual(problems(solid, c, c.yaw + Math.PI, c.scale, h.bedSpots.map(bedRect), doorRect(h)), [], `${cs.name}: a ${h.kind}'s chest`);
                n++;
            }
        }
    }
    assert.ok(n > 200, `chests looked at: ${n}`);
});
