// Generation 5: the new landscape (src/world/Landscape.js, TerrainData._generateLush, Flora.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, createHeightField, MAX_LAYER, CHUNK, BLOCK, WORLD_GEN } from '../../src/world/Terrain.js';
import { LUSH } from '../../src/world/Landscape.js';
import { buildFlora } from '../../src/world/Flora.js';

const world = (seed) => { const d = new TerrainData(); d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true }); return d; };
const digest = (c) => { let h = 0x811c9dc5; for (let i = 0; i < c.blocks.length; i++) h = Math.imul(h ^ c.blocks[i], 16777619); return h >>> 0; };

test('generation 5: the same world on every computer, whatever order its chunks are made in', () => {
    assert.ok(WORLD_GEN >= 5); // (6: the same land with ramps — block-shapes.test.js)
    const a = world(4242), b = world(4242);
    const cs = [[14, 3], [15, 3], [14, 4], [-20, 9], [-21, 9], [30, -30]];
    for (const [cx, cz] of cs) a.chunk(cx, cz);
    for (const [cx, cz] of [...cs].reverse()) b.chunk(cx, cz); // (trees and islands reach across chunk borders)
    for (const [cx, cz] of cs) assert.equal(digest(a.chunk(cx, cz)), digest(b.chunk(cx, cz)), `chunk ${cx},${cz}`);
});

test('generation 5: big sharp mountains — no ceiling, no flat strip on top', () => {
    const H = createHeightField(12345, true, null, false, true);
    const S = 1600, st = 2, W = (2 * S) / st + 1, g = new Int16Array(W * W), count = new Map();
    let max = 0;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
        const h = H(-S + i * st, -S + j * st);
        g[j * W + i] = h;
        if (h > max) max = h;
        count.set(h, (count.get(h) || 0) + 1);
    }
    assert.ok(max >= 80, `the highest peak ${max}`);
    assert.ok(max <= MAX_LAYER - 3, `under the sky limit: ${max}`);
    assert.ok(LUSH.SOFT + (LUSH.TOP - LUSH.SOFT) / 0.85 < MAX_LAYER, 'the top softening never reaches the sky limit');
    // no ceiling: high up, the land thins out height by height — nowhere does it pile up at one height
    for (let h = 50; h <= max; h++) assert.ok((count.get(h) || 0) <= 1.6 * (count.get(h - 1) || 0) + 4, `land piled up at ${h}: ${count.get(h)} vs ${count.get(h - 1)}`);
    // the summits (the highest point 12 m round) come to a point or a sharp crest, not a table
    let peaks = 0, sharp = 0;
    for (let j = 6; j < W - 6; j++) for (let i = 6; i < W - 6; i++) {
        const h = g[j * W + i];
        if (h < 70) continue;
        let top = true;
        for (let b = -6; b <= 6 && top; b++) for (let a = -6; a <= 6; a++) { const v = g[(j + b) * W + i + a]; if (v > h || (v === h && (b < 0 || (b === 0 && a < 0)))) { top = false; break; } }
        if (!top) continue;
        const x = -S + i * st, z = -S + j * st;
        let near = 0;
        for (let b = -4; b <= 4; b++) for (let a = -4; a <= 4; a++) if (H(x + a, z + b) >= h - 1) near++;
        peaks++;
        if (near <= 40) sharp++;
    }
    assert.ok(peaks >= 15, `${peaks} summits`);
    assert.ok(sharp / peaks >= 0.8, `sharp summits ${sharp} of ${peaks}`);
});

test('generation 5: floating islands high over the ground, never over a castle, a village or a tower', () => {
    const d = world(777);
    let n = 0;
    for (let gx = -12; gx <= 12; gx++) for (let gz = -12; gz <= 12; gz++) {
        const s = d.islandOf(gx, gz);
        if (!s) continue;
        n++;
        assert.ok(Math.hypot(s.x, s.z) >= LUSH.ISLE_MIN);
        assert.equal(d.sites.near(s.x, s.z, s.R * 2 + 30).length, 0, s.id);
        for (const p of s.parts) {
            const [top, bottom] = d._isleColumn(p, p.x, p.z);
            assert.ok(top <= MAX_LAYER - 4, `${s.id} top ${top}`);
            assert.ok(bottom - d.heightAt(p.x, p.z) >= 4, `${s.id}: its rock clear of the ground`);
            assert.equal(d.get(p.x, top, p.z) === BLOCK.GRASS || d.get(p.x, top, p.z) === BLOCK.SNOW, true, `${s.id} grass on top`);
            assert.ok(d.skyTopAt(p.x, p.z) >= top, 'fliers know it is there');
        }
    }
    assert.ok(n >= 3, `${n} islands`);
});

test('generation 5: tall grass and flowers only on open grass, the same every time', () => {
    const d = world(12345);
    let total = 0;
    for (const [cx, cz] of [[12, -2], [13, -2], [-14, 6]]) {
        const c = d.chunk(cx, cz);
        const a = buildFlora(d, c), b = buildFlora(d, c);
        assert.equal(a.verts, b.verts);
        assert.deepEqual([...a.pos.slice(0, 30)], [...b.pos.slice(0, 30)]);
        total += a.count;
        // every blade stands on the top face of a grass block with air over it
        for (let v = 0; v < a.verts; v += 3) {
            if (a.sway[v] !== 0) continue;
            const x = Math.round(a.pos[v * 3]), y = a.pos[v * 3 + 1], z = Math.round(a.pos[v * 3 + 2]);
            const L = Math.round(y + 0.5);
            assert.equal(d.get(x, L, z), BLOCK.GRASS, `${x},${L},${z}`);
            assert.equal(d.get(x, L + 1, z), BLOCK.AIR);
        }
    }
    assert.ok(total > 200, `${total} tufts and flowers`);
    // dug away: no grass left floating there
    const c = d.chunk(12, -2), x = 12 * CHUNK + 5, z = -2 * CHUNK + 5, L = d.topLayer(x, z);
    d.removeSphere(x, L - 1, z, 2.5);
    const after = buildFlora(d, d.chunk(12, -2));
    for (let v = 0; v < after.verts; v++) assert.ok(Math.hypot(after.pos[v * 3] - x, after.pos[v * 3 + 2] - z) > 1.2 || after.pos[v * 3 + 1] < L - 1.5, 'nothing over the crater');
    assert.ok(c);
});
