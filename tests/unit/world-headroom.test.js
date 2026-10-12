// The world was allowed to be built higher (MAX_LAYER 40 → 56) for the wizards' tower.
// Old worlds and saves must stay exactly as they were: the same wild heights (mountains
// pinned at 36), the same castles, the same levelled ground everywhere outside a tower.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, createHeightField, BLOCK, MAX_LAYER, MOUNTAIN_TOP, CHUNK, MIN_LAYER } from '../../src/world/Terrain.js';
import { Plan } from '../../src/world/Castles.js';

const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };

// (castles: re-pinned when the king's bedchamber got its bed — NightLife.js; places, shapes, names, paths and houses the same, only 2–4 more parts per castle)
// digests of the generator before the change (61 m grid over ±3 km, and castle cells −3…3)
const GOLDEN = {
    1: { raw: '6d727dfa', h: '35a17d29', castles: 'daf750f5' },
    4242: { raw: 'da5d04f5', h: '9e82edc', castles: 'adf4419e' },
    12345: { raw: '8804293b', h: '1e7d0263', castles: '32d26f82' },
};

test('higher world: wild heights, mountains and castles of old worlds are unchanged', () => {
    assert.equal(MAX_LAYER, 56);
    assert.equal(MOUNTAIN_TOP, 36);
    for (const seed of [1, 4242, 12345]) {
        const raw = createHeightField(seed, true);
        const ref = new TerrainData(); ref.generate({ seed, mountains: true });
        const d = new TerrainData(); d.generate({ seed, mountains: true });
        const rawS = [], hS = [];
        let rawMax = -99, checked = 0;
        for (let z = -3050; z <= 3050; z += 61) for (let x = -3050; x <= 3050; x += 61) {
            const h = raw(x, z), wet = raw.water;
            rawS.push(h + ':' + wet); rawMax = Math.max(rawMax, h);
            // the old levelled ground: wild heights flattened only by castle lands
            const land = ref.castles.landAt(x, z);
            let oh = h, ow = wet;
            if (land && !(land.w < 1 && wet)) { ow = 0; const F = land.castle.F; oh = land.w >= 1 ? F : Math.round(F + (h - F) * (1 - land.w)); }
            hS.push(oh + ':' + ow);
            // the real ground of the new world is the same wherever no tower stands
            if (d.towers && d.towers.landAt(x, z)) continue;
            assert.equal(d.heightAt(x, z), oh, `height at ${x},${z} (seed ${seed})`);
            assert.equal(d.heightAt.water, ow, `water at ${x},${z} (seed ${seed})`);
            checked++;
        }
        assert.ok(checked > 9000, `checked ${checked}`);
        assert.equal(rawMax, 36, 'mountains are capped where they always were');
        assert.equal(fnv(rawS.join(',')), GOLDEN[seed].raw, `wild heights (seed ${seed})`);
        assert.equal(fnv(hS.join(',')), GOLDEN[seed].h, `levelled heights (seed ${seed})`);
        const cs = [];
        for (let gz = -3; gz <= 3; gz++) for (let gx = -3; gx <= 3; gx++) {
            const c = d.castles.cellOf(gx, gz);
            cs.push(c ? [c.id, c.x, c.z, c.F, c.rot, c.name, c.parts.length, c.nodes.length, c.houses.length].join('|') : '-');
        }
        assert.equal(fnv(cs.join(';')), GOLDEN[seed].castles, `castles (seed ${seed})`);
    }
});

test('water flag of a column does not depend on what was asked first (host and guest agree)', () => {
    for (const seed of [4242, 12345]) {
        const a = new TerrainData(); a.generate({ seed, mountains: true });
        const b = new TerrainData(); b.generate({ seed, mountains: true });
        // find wet columns in castle cells nobody has looked at yet in `a`
        let found = 0;
        for (let gx = -4; gx <= 4 && found < 20; gx++) for (let gz = -4; gz <= 4 && found < 20; gz++) {
            for (let k = 0; k < 400 && found < 20; k += 7) {
                const x = gx * 480 + (k * 37) % 480, z = gz * 480 + (k * 53) % 480;
                const h1 = a.heightAt(x, z), w1 = a.heightAt.water;
                if (!w1) continue;
                const h2 = a.heightAt(x, z), w2 = a.heightAt.water;
                assert.equal(h1, h2); assert.equal(w1, w2);
                // a world that generated its sites in a different order agrees
                b.heightAt(x + 9000, z - 9000);
                assert.equal(b.heightAt(x, z), h1); assert.equal(b.heightAt.water, w1);
                found++;
            }
        }
        assert.ok(found >= 5, `wet columns ${found}`);
    }
});

/** Rasterise plan parts with the real chunk builder. */
function raster(parts, X, Z) {
    const d = new TerrainData();
    d.generate({ seed: 1, mountains: false });
    const stub = { partsForChunk: () => [parts] };
    d.castles = stub; d.sites = stub;
    const set = new Set();
    for (const cx of [Math.floor((X - 20) / CHUNK), Math.floor((X + 20) / CHUNK)]) for (const cz of [Math.floor((Z - 20) / CHUNK), Math.floor((Z + 20) / CHUNK)]) {
        const c = d.chunk(cx, cz);
        if (c._done) continue;
        c._done = true;
        d._buildCastles(c);
    }
    for (let z = Z - 20; z <= Z + 20; z++) for (let x = X - 20; x <= X + 20; x++) for (let L = 1; L <= 3; L++) if (d.get(x, L, z) === BLOCK.ARCANE) set.add(`${x - X},${L},${z - Z}`);
    return set;
}

test('ring sector parts: the same shape at every rotation, inside their bounds', () => {
    const X = 100, Z = 200;
    const a0 = 0.35, a1 = 0.35 + Math.PI / 2 + 0.2;
    let base = null;
    for (let rot = 0; rot < 4; rot++) {
        const p = new Plan(X, Z, 0, rot);
        p.sector(0, 0, 15, 11.5, a0, a1, 0, 1, BLOCK.ARCANE);
        const part = p.parts[0];
        const got = raster(p.parts, X, Z);
        assert.ok(got.size > 60, `voxels ${got.size}`);
        for (const k of got) {
            const [dx, , dz] = k.split(',').map(Number);
            assert.ok(X + dx >= part.x0 && X + dx <= part.x1 && Z + dz >= part.z0 && Z + dz <= part.z1, 'inside the bounding box');
        }
        // turn back to rot 0 local coordinates: world (dx, dz) = rotation of local (u, v)
        const local = new Set([...got].map((k) => {
            const [dx, L, dz] = k.split(',').map(Number);
            const [u, v] = rot === 0 ? [dx, dz] : rot === 1 ? [dz, -dx] : rot === 2 ? [-dx, -dz] : [-dz, dx];
            return `${u},${L},${v}`;
        }));
        if (!base) {
            base = local;
            // every voxel lies in the ring and the angle span (local, counter-clockwise from +u)
            for (const k of base) {
                const [u, , v] = k.split(',').map(Number);
                const r = Math.hypot(u, v);
                assert.ok(r > 11 && r < 15.6, `r ${r}`);
                let a = Math.atan2(v, u) - a0; a -= Math.floor(a / (2 * Math.PI)) * 2 * Math.PI;
                assert.ok(a < a1 - a0 + 1e-9);
            }
        } else assert.deepEqual([...local].sort(), [...base].sort(), `rot ${rot}`);
    }
});

test('new tower blocks: colours, patterns, glowing lamps; the top layer is buildable', async () => {
    const { BASE_COLORS, patternOf, PATTERN, isCastleBlock } = await import('../../src/world/Terrain.js');
    for (const k of ['ARCANE', 'ARCANE_DARK', 'ROOF_PURPLE', 'ARCANE_LAMP', 'ARCANE_LAMP_VIOLET', 'CARPET_PURPLE', 'POTION', 'RUNE']) {
        const t = BLOCK[k];
        assert.ok(t >= 49 && t <= 56, k);
        assert.ok(BASE_COLORS[t] > 0, k);
        assert.ok(isCastleBlock(t), k);
    }
    assert.equal(patternOf(BLOCK.ARCANE_LAMP), PATTERN.CRYSTAL);
    assert.equal(patternOf(BLOCK.RUNE), PATTERN.RUNES);
    const d = new TerrainData(); d.generate({ seed: 1 });
    d.set(3, MAX_LAYER, 3, BLOCK.ARCANE_LAMP_VIOLET);
    assert.equal(d.get(3, MAX_LAYER, 3), BLOCK.ARCANE_LAMP_VIOLET);
    assert.equal(d.topLayer(3, 3), MAX_LAYER);
    assert.equal(d.get(3, MIN_LAYER, 3), BLOCK.BEDROCK);
});
