// Beslan's grass (world/InvisibleFlora.js — the places and the shape, pure; game/BeslanGrass.js — the view): only a hero who sees the invisible has it drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCK, CHUNK, MIN_LAYER, chunkKey, INVISIBLE_FLORA_FROM_GEN, WORLD_GEN } from '../../src/world/Terrain.js';
import { buildBeslan, BESLAN } from '../../src/world/InvisibleFlora.js';
import { BeslanGrass, BESLAN_VIEW } from '../../src/game/BeslanGrass.js';

/** A flat chunk of grass at layer `L` (and, if `sandCol`, a strip of sand). */
function flat(cx, cz, L = 12, { sandX = -1 } = {}) {
    const blocks = new Uint8Array((L + 3 - MIN_LAYER) * CHUNK * CHUNK), top = new Int16Array(CHUNK * CHUNK).fill(L);
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = lx === sandX ? BLOCK.SAND : BLOCK.GRASS;
    return { cx, cz, blocks, top, rev: 1 };
}

test('the places: the same from the same seed, different from another; only on grass', () => {
    const a = buildBeslan(777, flat(3, 4)), b = buildBeslan(777, flat(3, 4)), c = buildBeslan(778, flat(3, 4));
    assert.deepEqual(Array.from(a.pos), Array.from(b.pos), 'deterministic (a terrain worker makes the same)');
    assert.notDeepEqual(a.spots.map((s) => s.key), c.spots.map((s) => s.key));
    const sandy = flat(0, 0, 12, { sandX: 5 });
    for (const s of buildBeslan(5, sandy).spots) assert.notEqual(Math.floor(s.x), -999, 'finite');
    const none = flat(0, 0); none.blocks.fill(BLOCK.STONE);
    assert.equal(buildBeslan(5, none).count, 0, 'not on stone');
});

test('quite often, in drifts, never more than the budget; low and tall ones', () => {
    let counts = [], tall = 0, low = 0, minH = 99, maxH = 0, verts = 0;
    for (let i = 0; i < 60; i++) {
        const o = buildBeslan(31, flat(i, i * 3 - 40));
        counts.push(o.count); verts = Math.max(verts, o.verts);
        assert.ok(o.count <= BESLAN.MAX_TUFTS);
        for (const s of o.spots) { if (s.h > 2) tall++; else low++; minH = Math.min(minH, s.h); maxH = Math.max(maxH, s.h); }
    }
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    assert.ok(avg > 5 && avg < 25, 'about a dozen tufts a chunk: ' + avg.toFixed(1));
    assert.ok(Math.max(...counts) > Math.min(...counts) * 1.5, 'drifts: thick and bare places');
    assert.ok(tall > 0 && low > tall, `low ${low}, tall ${tall}`);
    assert.ok(minH >= BESLAN.LOW[0] - 1e-9 && maxH <= BESLAN.TALL[1] + 1e-9, `${minH} … ${maxH}`);
    assert.ok(verts < BESLAN.MAX_TUFTS * 2200, 'inside the buffer: ' + verts);
});

test('by the water (sand/water within 3 blocks) it grows thicker', () => {
    let dry = 0, wet = 0;
    for (let i = 0; i < 40; i++) { dry += buildBeslan(9, flat(i, 1)).count; wet += buildBeslan(9, flat(i, 1, 12, { sandX: 10 })).count; }
    assert.ok(wet > dry, `wet ${wet} > dry ${dry}`);
});

test('the shape: stems, ribbon leaves, glowing plumes with violet tips — aqua-white, not green; sway grows with height', () => {
    const o = buildBeslan(12, flat(2, 2));
    assert.ok(o.verts > 300 && o.verts % 3 === 0, 'triangles');
    let glow = 0, glowMax = 0, swayMax = 0, tint = 0;
    for (let i = 0; i < o.verts; i++) { glow += o.glow[i] > 0.5 ? 1 : 0; glowMax = Math.max(glowMax, o.glow[i]); swayMax = Math.max(swayMax, o.sway[i]); if (o.col[i * 3 + 2] > o.col[i * 3]) tint++; }
    assert.ok(glow > o.verts * 0.15, 'plumes and leaf edges glow'); assert.equal(glowMax, 1);
    assert.ok(swayMax > 1.5, 'tall tufts sway at the tip: ' + swayMax);
    assert.ok(tint > o.verts * 0.9, 'blue-green to aqua-white and lilac: never green or yellow');
    const b = o.box; assert.ok(b[4] - 12 > 1, 'taller than a block somewhere');
});

test('plucked tufts are skipped (and the rest of the chunk is the same)', () => {
    const c = flat(1, 1), full = buildBeslan(4, c), key = full.spots[0].key;
    const less = buildBeslan(4, c, new Set([key]));
    assert.equal(less.count, full.count - 1); assert.ok(!less.spots.some((s) => s.key === key));
    assert.ok(less.verts < full.verts);
});

test('worlds: new worlds have it (generation 10+); nothing else of the land depends on it', () => {
    assert.ok(INVISIBLE_FLORA_FROM_GEN <= WORLD_GEN);
});

/** A game with a flat world around the hero. */
function game({ sees = true } = {}) {
    const chunks = new Map();
    const data = { seed: 5, hasChunk: () => true, chunk: (cx, cz) => { const k = chunkKey(cx, cz); if (!chunks.has(k)) chunks.set(k, flat(cx, cz)); return chunks.get(k); } };
    const meshes = new Set(), items = [];
    const g = {
        gen: WORLD_GEN, terrain: { data }, sight: { sees }, isDeadLocal: false, localId: 'me',
        scene: { add: (m) => meshes.add(m), remove: (m) => meshes.delete(m) },
        character: { group: { position: new THREE.Vector3(16, 14, 16) }, getGripCurl: (side) => g._curl[side], getHandWorldPosition: (side, out) => out.copy(g._hand) },
        items: { held: { left: null, right: null }, takeIntoHand: (it, side, o) => { items.push({ it, side, o }); g.items.held[side] = { item: it }; return true; } },
        weapons: { hands: {} }, world: { nightAmount: 0 }, fx: { spark() {} }, sound: { playSpencer() {} },
        _curl: { left: 0, right: 0 }, _hand: new THREE.Vector3(),
    };
    return { g, meshes, items };
}

test('the view: nothing at all for a hero who does not see; chunks around the hero who does, a few a frame; put away when he leaves or dies', () => {
    const blind = game({ sees: false }), B0 = new BeslanGrass(blind.g);
    B0.update(0.1); assert.equal(blind.meshes.size, 0);
    const w = game(), B = new BeslanGrass(w.g);
    B.update(0.1);
    assert.ok(w.meshes.size >= 1 && w.meshes.size <= BESLAN_VIEW.PER_FRAME, 'a few a frame: ' + w.meshes.size);
    for (let i = 0; i < 80; i++) B.update(0.1);
    assert.ok(w.meshes.size > 20, 'the ring is full: ' + w.meshes.size);
    for (const m of w.meshes) { assert.equal(m.userData.isBeslan, true); assert.equal(m.raycast(), undefined, 'a hand and a ray pass through'); }
    w.g.character.group.position.set(5000, 14, 5000);
    for (let i = 0; i < 5; i++) B.update(0.1);
    // (all the old chunks are put away; the new place may have its own)
    assert.ok([...w.meshes].every((m) => Math.abs(m.geometry.boundingSphere.center.x - 5000) < 400), 'left behind: gone');
    w.g.sight.sees = false; B.update(0.1);
    assert.equal(w.meshes.size, 0, 'the sight lost: all away');
});

test('plucking: a free hand that CLOSES on a tuft takes it — a sheaf in the fist, the tuft grows again later', () => {
    const w = game(), B = new BeslanGrass(w.g);
    for (let i = 0; i < 120; i++) B.update(0.1);
    const spot = [...B.meshes.values()].flatMap((e) => e.spots).sort((a, b) => Math.hypot(a.x - 16, a.z - 16) - Math.hypot(b.x - 16, b.z - 16))[0];
    assert.ok(spot, 'a tuft near');
    w.g.character.group.position.set(spot.x, spot.y + 2, spot.z);
    w.g._hand.set(spot.x + 0.1, spot.y + 0.6, spot.z);
    w.g._curl.right = 0.1; B.update(0.1);
    assert.equal(w.items.length, 0, 'an open hand takes nothing');
    w.g._curl.right = 0.8; B.update(0.1);
    assert.equal(w.items.length, 1); assert.equal(w.items[0].it.kind, 'beslanGrass'); assert.equal(w.items[0].side, 'right'); assert.equal(w.items[0].o.closed, true);
    assert.ok(B.gone.has(spot.key), 'plucked');
    B.update(0.1); assert.equal(w.items.length, 1, 'once for one closing');
    // a busy fist plucks nothing
    w.g._curl.right = 0.1; B.update(0.1); w.g._curl.right = 0.8; B.update(0.1);
    assert.equal(w.items.length, 1, 'the right fist holds the sheaf');
    // it grows again
    B.t += BESLAN_VIEW.REGROW_S + 1; B.update(0.1);
    assert.ok(!B.gone.has(spot.key), 'grown again');
});

test('a hand too far above or beside a tuft plucks nothing', () => {
    const w = game(), B = new BeslanGrass(w.g);
    for (let i = 0; i < 120; i++) B.update(0.1);
    const spot = [...B.meshes.values()].flatMap((e) => e.spots)[0];
    w.g.character.group.position.set(spot.x, spot.y + 2, spot.z);
    w.g._hand.set(spot.x + 3, spot.y + 0.5, spot.z); w.g._curl.left = 0.1; B.update(0.1); w.g._curl.left = 0.9; B.update(0.1);
    assert.equal(w.items.length, 0, 'beside');
    w.g._curl.left = 0.1; B.update(0.1); w.g._hand.set(spot.x, spot.y + spot.h + 5, spot.z); w.g._curl.left = 0.9; B.update(0.1);
    assert.equal(w.items.length, 0, 'above');
});
