// The boulders by the rivers (RockRules.js, RockModel.js; generation 32): where they lie, that they are not cubes, that nothing lies in the wrong place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';
import { ROCK, ROCKS_FROM_GEN, rocksOfChunk, riverDistance } from '../../src/world/RockRules.js';
import { rockArrays } from '../../src/world/RockModel.js';

const OPTS = { mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, wizHuts: true, furnish: true, dungeons: true, buildings: true, bigHouses: true, pyramids: true, waterfalls: true };
const world = (seed) => { const d = new TerrainData(); d.generate({ seed, ...OPTS }); return d; };

test('the boulders are by the rivers, deterministic, and never in a built place, deep water or on a bluff', () => {
    assert.equal(ROCKS_FROM_GEN, 32);
    const d = world(20261106), seen = [];
    let chunks = 0, withRocks = 0;
    for (let cz = -40; cz < 40; cz++) for (let cx = -40; cx < 40; cx++) {
        chunks++;
        const a = rocksOfChunk(d, cx, cz);
        if (!a.length) continue;
        withRocks++;
        const b = rocksOfChunk(d, cx, cz);
        assert.deepEqual(a.map((r) => r.id + r.x.toFixed(2)), b.map((r) => r.id + r.x.toFixed(2)), 'the same twice');
        for (const r of a) {
            assert.ok(r.x >= cx * 16 && r.x < cx * 16 + 16 && r.z >= cz * 16 && r.z < cz * 16 + 16, 'inside its chunk');
            assert.ok(Number.isFinite(r.y) && r.r > 0.3 && r.r <= ROCK.SIZE.big[1] + 0.01);
            assert.ok(r.v >= 0 && r.v < ROCK.VARIANTS);
            seen.push(r);
        }
    }
    assert.ok(withRocks > 20 && withRocks < chunks * 0.3, `${withRocks} of ${chunks} chunks have boulders (some, not everywhere)`);
    const kinds = new Set(seen.map((r) => r.kind));
    for (const k of ['pebble', 'small', 'medium', 'big']) assert.ok(kinds.has(k), 'a ' + k + ' one exists');
    for (const r of seen.slice(0, 400)) {
        assert.ok(!d.sites.landAt(Math.round(r.x), Math.round(r.z)), 'not in a built place');
        d.heightAt(Math.round(r.x), Math.round(r.z)); assert.ok(!d.heightAt.sea, 'not in the sea'); assert.ok(d.heightAt.water <= ROCK.SHALLOW, 'not in deep water');
    }
    // most lie within reach of a river
    let nearOk = 0, tot = 0;
    for (const r of seen.slice(0, 300)) { tot++; if (r.id.startsWith('fall') || riverDistance(d.rawHeight, r.x, r.z, ROCK.NEAR_RIVER + 12) < Infinity) nearOk++; }
    assert.ok(nearOk / tot > 0.9, `${nearOk}/${tot} by a river`);
});

test('a waterfall has boulders at its foot', () => {
    const d = world(20261106);
    let p = null;
    for (let r = 0; r < 14 && !p; r++) for (let gz = -r; gz <= r && !p; gz++) for (let gx = -r; gx <= r && !p; gx++) { const q = d.falls.cell(gx, gz); if (q && q.kind === 'great') p = q; }
    assert.ok(p);
    let n = 0;
    for (let cz = Math.floor((p.z - 30) / 16); cz <= Math.floor((p.z + 30) / 16); cz++) for (let cx = Math.floor((p.x - 30) / 16); cx <= Math.floor((p.x + 30) / 16); cx++) n += rocksOfChunk(d, cx, cz).filter((r) => String(r.id).startsWith('fall')).length;
    assert.ok(n >= 3, 'rocks at the foot: ' + n);
});

test('a boulder is not a cube: many facets, uneven, a foot, every shape different, colours in the vertices', () => {
    const shapes = [];
    for (let v = 0; v < ROCK.VARIANTS; v++) {
        const a = rockArrays(v);
        assert.ok(a.count >= 900 && a.count % 3 === 0, 'triangles');
        let minY = 9, maxY = -9, minR = 9, maxR = 0;
        for (let i = 0; i < a.count; i++) {
            const x = a.pos[i * 3], y = a.pos[i * 3 + 1], z = a.pos[i * 3 + 2];
            assert.ok(Number.isFinite(x + y + z));
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            const r = Math.hypot(x, y, z); minR = Math.min(minR, r); maxR = Math.max(maxR, r);
            const n = Math.hypot(a.nor[i * 3], a.nor[i * 3 + 1], a.nor[i * 3 + 2]); assert.ok(Math.abs(n - 1) < 1e-3, 'unit normals');
        }
        assert.ok(minY >= -0.5 && maxY > 0.3, 'a foot at −0.45, a body above');
        assert.ok(maxR / minR > 1.35, 'lumpy, not a ball/cube: ' + (maxR / minR).toFixed(2));
        let green = 0; for (let i = 0; i < a.count; i++) if (a.col[i * 3 + 1] > a.col[i * 3] + 0.03) green++;
        shapes.push({ v, green, sum: Array.from(a.pos.slice(0, 30)).join(',') });
    }
    assert.equal(new Set(shapes.map((s) => s.sum)).size, ROCK.VARIANTS, 'all eight different');
    assert.ok(shapes.some((s) => s.green > 40), 'a mossy one has moss on its top');
});
