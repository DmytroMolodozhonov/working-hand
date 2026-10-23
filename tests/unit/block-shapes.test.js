/**
 * Slabs and ramps (BlockShapes.js): their faces in the chunk's mesh (closed — no hole, no face inside the land, every
 * face turned outwards), the floor over them (smooth up a ramp), the ray, the edits with shapes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, CHUNK } from '../../src/world/Terrain.js';
import { SHAPE, rotateShape, shapeTop, sideCovered, faceFull, shapeVolume, canShape, rampToward } from '../../src/world/BlockShapes.js';

const flat = () => { const d = new TerrainData(); d.generate({ seed: 1 }); return d; };

/** The triangles of a chunk's land mesh (ground and raised) above `yMin`. */
function tris(d, cx, cz, yMin) {
    const a = d.buildChunkArrays(cx, cz), out = [];
    for (const b of [a.ground, a.raised]) {
        const P = b.positions, I = b.indices, N = b.normals;
        for (let i = 0; i < I.length; i += 3) {
            const v = [I[i], I[i + 1], I[i + 2]].map((k) => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]);
            if (v.some((p) => p[1] < yMin)) continue;
            out.push({ v, n: [N[I[i] * 3], N[I[i] * 3 + 1], N[I[i] * 3 + 2]] });
        }
    }
    return out;
}
/** The volume a closed, outward-wound mesh holds (divergence theorem). */
function volume(ts) {
    let s = 0;
    for (const { v: [a, b, c] } of ts) s += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    return s / 6;
}
/** Every triangle's winding agrees with its normal (front face outwards). */
function wound(ts) {
    for (const { v: [a, b, c], n } of ts) {
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const x = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        if (x[0] * n[0] + x[1] * n[1] + x[2] * n[2] <= 0) return false;
    }
    return true;
}

test('shape table: rotations, coverage, volumes', () => {
    assert.equal(rotateShape(SHAPE.RAMP_PX, 1), SHAPE.RAMP_PZ);
    assert.equal(rotateShape(SHAPE.RAMP_PZ, 1), SHAPE.RAMP_NX);
    assert.equal(rotateShape(SHAPE.RAMP_PX, 4), SHAPE.RAMP_PX);
    assert.equal(rotateShape(SHAPE.CEIL_NZ, 2), SHAPE.CEIL_PZ);
    assert.equal(rampToward(0, -1), SHAPE.RAMP_NZ);
    assert.ok(faceFull(SHAPE.RAMP_PX, 0) && !faceFull(SHAPE.RAMP_PX, 1) && faceFull(SHAPE.RAMP_PX, 3) && !faceFull(SHAPE.RAMP_PX, 2));
    assert.ok(faceFull(SHAPE.SLAB_TOP, 2) && !faceFull(SHAPE.SLAB_TOP, 3));
    // a ramp beside another the same way: their sides hide each other; a slab's side hides nothing of a ramp's
    assert.ok(sideCovered(SHAPE.RAMP_PX, 4, SHAPE.RAMP_PX));
    assert.ok(!sideCovered(SHAPE.RAMP_PX, 4, SHAPE.RAMP_NX));
    assert.ok(sideCovered(SHAPE.SLAB, 4, SHAPE.RAMP_PZ) === false);
    assert.equal(shapeVolume(SHAPE.RAMP_NZ), 0.5);
    assert.equal(shapeTop(SHAPE.RAMP_PX, 0.25, 0.7), 0.25);
    assert.equal(shapeTop(SHAPE.OUT_11, 1, 1), 1);
    assert.equal(shapeTop(SHAPE.OUT_11, 1, 0), 0);
    assert.ok(!canShape(BLOCK.WATER) && !canShape(BLOCK.LEAVES) && canShape(BLOCK.PLANKS) && canShape(BLOCK.GRASS));
});

test('a world without shapes has none and meshes as before', () => {
    const d = flat();
    d.set(3, 1, 3, BLOCK.STONE);
    assert.equal(d.chunk(0, 0).shape, undefined);
    assert.equal(d.shapeAt(3, 1, 3), 0);
    d.set(4, 1, 3, BLOCK.WATER, SHAPE.RAMP_PX); // (water takes no shape)
    assert.equal(d.chunk(0, 0).shape, undefined);
});

test('every shape alone in the air: a closed mesh holding exactly its volume, faces outwards', () => {
    for (let s = 1; s < 27; s++) {
        const d = flat();
        d.set(10, 20, 10, BLOCK.STONE, s);
        const ts = tris(d, 0, 0, 5);
        assert.ok(wound(ts), 'winding of shape ' + s);
        assert.ok(Math.abs(volume(ts) - shapeVolume(s)) < 1e-4, `shape ${s}: ${volume(ts)} vs ${shapeVolume(s)}`);
    }
});

test('shapes against blocks and each other: still closed, no face inside, nothing more than needed', () => {
    const d = flat();
    // a block with a ramp up to it from each side, a ramp beside a ramp, a slab on a block, a ramp under a block
    const put = [
        [10, 20, 10, BLOCK.STONE, 0], [9, 20, 10, BLOCK.GRASS, SHAPE.RAMP_PX], [11, 20, 10, BLOCK.PLANKS, SHAPE.RAMP_NX],
        [10, 20, 11, BLOCK.STONE, SHAPE.RAMP_NZ], [10, 20, 9, BLOCK.STONE, SHAPE.RAMP_PZ],
        [10, 21, 10, BLOCK.STONE, SHAPE.SLAB], [10, 19, 10, BLOCK.STONE, SHAPE.CEIL_PX],
        [11, 20, 11, BLOCK.STONE, SHAPE.OUT_00], [9, 20, 9, BLOCK.STONE, SHAPE.IN_11], [12, 20, 10, BLOCK.STONE, SHAPE.SLAB_TOP],
    ];
    let vol = 0;
    for (const [x, L, z, t, s] of put) { d.set(x, L, z, t, s); vol += shapeVolume(s); }
    const ts = tris(d, 0, 0, 5);
    assert.ok(wound(ts));
    assert.ok(Math.abs(volume(ts) - vol) < 1e-4, `${volume(ts)} vs ${vol}`);
    // (a ramp's side half against another's whole one: the whole face is drawn, the half hidden — the part of the
    // whole face behind the other's solid is never seen, nothing is missing)
    const g = flat();
    g.set(9, 20, 10, BLOCK.STONE, SHAPE.RAMP_PX); g.set(9, 20, 11, BLOCK.STONE, SHAPE.RAMP_NZ);
    const t3 = tris(g, 0, 0, 5);
    assert.equal(t3.filter(({ v, n }) => n[2] > 0.9 && v.every((p) => Math.abs(p[2] - 10.5) < 1e-6)).length, 0);
    assert.equal(t3.filter(({ v, n }) => n[2] < -0.9 && v.every((p) => Math.abs(p[2] - 10.5) < 1e-6)).length, 2);
    // two ramps the same way side by side: no side faces between them
    const e = flat();
    e.set(10, 20, 10, BLOCK.STONE, SHAPE.RAMP_PX); e.set(10, 20, 11, BLOCK.STONE, SHAPE.RAMP_PX);
    const t2 = tris(e, 0, 0, 5);
    const inner = t2.filter(({ v }) => v.every((p) => Math.abs(p[2] - 10.5) < 1e-6));
    assert.equal(inner.length, 0);
    // a ramp alone: slope (2), bottom (2), back (2), two side triangles — 8 triangles
    const f = flat();
    f.set(10, 20, 10, BLOCK.STONE, SHAPE.RAMP_PX);
    assert.equal(tris(f, 0, 0, 5).length, 8);
});

test('across a chunk border: a ramp and the block next door hide each other the same as inside', () => {
    const d = flat();
    d.set(CHUNK - 1, 20, 5, BLOCK.STONE, SHAPE.RAMP_PX);
    d.set(CHUNK, 20, 5, BLOCK.STONE);
    const ts = [...tris(d, 0, 0, 5), ...tris(d, 1, 0, 5)];
    assert.ok(Math.abs(volume(ts) - 1.5) < 1e-4, String(volume(ts)));
});

test('the floor over a ramp rises smoothly; over a slab half a block; the ceiling under an upside-down ramp', () => {
    const d = flat();
    // ground is layer 0 (top y −0.5): a ramp at layer 1 rising to +x
    d.set(5, 1, 5, BLOCK.GRASS, SHAPE.RAMP_PX);
    assert.ok(Math.abs(d.surfaceY(4.5, 5) - -0.5) < 1e-9);
    assert.ok(Math.abs(d.surfaceY(5, 5) - 0) < 1e-9);
    assert.ok(Math.abs(d.surfaceY(5.4, 5) - 0.4) < 1e-9);
    assert.ok(Math.abs(d.floorAt(5.25, 5.2, 1.0) - 0.25) < 1e-9);
    d.set(7, 1, 5, BLOCK.PLANKS, SHAPE.SLAB);
    assert.equal(d.floorAt(7, 5, 1), 0);
    // a vault: an upside-down ramp at layer 5 — its underside from y 4.5 (−x, nothing there) down to 3.5 (+x)
    d.set(9, 5, 5, BLOCK.STONE, SHAPE.CEIL_PX);
    assert.ok(Math.abs(d.ceilingAt(8.6, 5, 0) - 4.4) < 1e-9);
    assert.ok(Math.abs(d.ceilingAt(9.4, 5, 0) - 3.6) < 1e-9);
    // in the ramp's empty part a point is free, under the slope it is solid
    assert.equal(d.isSolidAt(4.7, -0.1, 5), false);
    assert.equal(d.isSolidAt(5.4, 0.2, 5), true);
    // a ray straight down onto the slope stops on it, not at the cell's top
    const hit = d.raycast({ x: 5.0, y: 5, z: 5 }, { x: 0, y: -1, z: 0 }, 20);
    assert.ok(hit && Math.abs(hit.y - 0) < 0.13, JSON.stringify(hit));
});

test('walking up a run of ramps: the floor never jumps, each step at most the slope', () => {
    const d = flat();
    // a slope of ramps: layer 1 at x = 5, layer 2 at x = 6 on a block at 1… up to layer 4
    for (let k = 0; k < 4; k++) {
        for (let L = 1; L < 1 + k; L++) d.set(5 + k, L, 5, BLOCK.DIRT);
        d.set(5 + k, 1 + k, 5, BLOCK.GRASS, SHAPE.RAMP_PX);
    }
    let y = d.floorAt(4, 5, -0.5 + 1.05), x = 4;
    for (; x < 8.48; x += 0.05) {
        const ny = d.floorAt(x, 5, y + 1.05);
        assert.ok(ny - y <= 0.05 + 1e-6 && ny >= y - 1e-9, `at x ${x.toFixed(2)}: ${y} → ${ny}`);
        y = ny;
    }
    assert.ok(Math.abs(y - 3.45) < 0.03, String(y));
});

test('an enchanted block keeps its shape: no spell reshapes it', () => {
    const d = flat();
    d.enchantFree = true;
    d.set(3, 1, 3, BLOCK.ENCHANTED);
    d.enchantFree = false;
    d.set(3, 1, 3, BLOCK.ENCHANTED, SHAPE.RAMP_PX);
    assert.equal(d.shapeAt(3, 1, 3), 0);
});

test('an explosion takes shaped blocks with their shape; a block put back is whole', () => {
    const d = flat();
    d.set(3, 1, 3, BLOCK.STONE, SHAPE.RAMP_NX);
    const r = d.removeSphere(3, 0, 3, 1.2);
    assert.ok(r.some((b) => b.shape === SHAPE.RAMP_NX));
    assert.equal(d.shapeAt(3, 1, 3), 0);
    d.set(3, 1, 3, BLOCK.STONE);
    assert.equal(d.shapeAt(3, 1, 3), 0);
});

test('generation 6: the same ramps whatever chunks were made before, the old generations without any', async () => {
    const { chunkKey } = await import('../../src/world/Terrain.js');
    const OPTS = { seed: 20261015, mountains: true, seas: true, test: true, deepCaves: true, lush: true, slopes: true };
    const a = new TerrainData(); a.generate(OPTS);
    const b = new TerrainData(); b.generate(OPTS);
    for (const [x, z] of [[9, -4], [3, 3], [-6, 8], [5, 1]]) b.chunk(x, z);
    b.evictFar(0, 0, 1);
    let shapes = 0;
    for (const [cx, cz] of [[4, 3], [-2, -7], [7, -1], [-11, 10]]) {
        const ca = a.chunk(cx, cz), cb = b.chunk(cx, cz);
        assert.deepEqual(ca.blocks, cb.blocks);
        assert.deepEqual(ca.top, cb.top);
        assert.deepEqual(ca.shape, cb.shape);
        if (ca.shape) for (const v of ca.shape) if (v) shapes++;
        void chunkKey;
    }
    assert.ok(shapes > 100, 'ramps in the land: ' + shapes);
    // generation 5 (no `slopes`): no shape anywhere
    const old = new TerrainData(); old.generate({ ...OPTS, slopes: false });
    for (const [cx, cz] of [[4, 3], [-2, -7]]) assert.equal(old.chunk(cx, cz).shape, undefined);
});

test('generation 6: no ramp beside the water at its height, every ramp on the land it smooths', () => {
    const OPTS = { seed: 20261015, mountains: true, seas: true, test: false, deepCaves: true, lush: true, slopes: true };
    const d = new TerrainData(); d.generate(OPTS);
    for (const [cx, cz] of [[2, 6], [3, 7], [-11, 10]]) {
        const c = d.chunk(cx, cz);
        if (!c.shape) continue;
        for (let i = 0; i < c.shape.length; i++) {
            if (!c.shape[i]) continue;
            const lx = i % CHUNK, lz = Math.floor(i / CHUNK) % CHUNK, L = Math.floor(i / (CHUNK * CHUNK)) - 17;
            const x = cx * CHUNK + lx, z = cz * CHUNK + lz;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.notEqual(d.get(x + dx, L, z + dz), BLOCK.WATER, `ramp at ${x},${L},${z} by the water`);
        }
    }
});

test('generation 6: the roofs of a village are ramps of the roof material; generation 5 the same blocks, no shapes', async () => {
    const OPTS = { seed: 20261015, mountains: true, seas: true, test: false, deepCaves: true, lush: true };
    const six = new TerrainData(); six.generate({ ...OPTS, slopes: true });
    const five = new TerrainData(); five.generate(OPTS);
    const castle = six.castles.near(0, 0, 1500)[0];
    assert.ok(castle, 'a castle near the spawn');
    const roofs = new Set([BLOCK.ROOF_RED, BLOCK.ROOF_BLUE, BLOCK.ROOF_SLATE, BLOCK.THATCH, BLOCK.ROOF_PURPLE]);
    let ramps = 0, checked = 0;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const cx = Math.floor(castle.x / CHUNK) + dx, cz = Math.floor(castle.z / CHUNK) + dz;
        const a = six.chunk(cx, cz), b = five.chunk(cx, cz);
        if (!a.shape) continue;
        for (let i = 0; i < a.shape.length; i++) {
            if (!a.shape[i]) continue;
            // a ramp put by the land's smoothing stands on a column of the old world's air; the roofs' on the old block itself
            if (roofs.has(a.blocks[i])) { ramps++; assert.equal(b.blocks[i], a.blocks[i], 'a roof ramp is the old roof block, reshaped'); }
            checked++;
        }
    }
    assert.ok(ramps > 50, 'roof ramps: ' + ramps + ' of ' + checked);
});
