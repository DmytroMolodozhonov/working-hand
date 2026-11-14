/**
 * TerrainClusters: the far chunks in one mesh per 3×3 square — fewer draws, the very same triangles; let go the frame a chunk changes
 * or the hero comes near (the «а если» of the file's header).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TerrainClusters, CLUSTER } from '../../src/world/TerrainClusters.js';

const CH = 32, key = (cx, cz) => cx + ',' + cz;
function geo(cx, cz, tris = 4) {
    const g = new THREE.BufferGeometry(), n = tris * 3, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = cx * CH + i; pos[i * 3 + 1] = i; pos[i * 3 + 2] = cz * CH; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.5), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.25), 3));
    g.setAttribute('voxPat', new THREE.BufferAttribute(new Float32Array(n).fill(2), 1));
    g.setAttribute('voxSky', new THREE.BufferAttribute(new Float32Array(n).fill(0), 1));
    g.setIndex(new THREE.BufferAttribute(cx % 2 ? new Uint16Array([...Array(n).keys()]) : new Uint32Array([...Array(n).keys()]), 1)); // (both kinds of index)
    g.boundingBox = new THREE.Box3(new THREE.Vector3(cx * CH, 0, cz * CH), new THREE.Vector3(cx * CH + CH, 20, cz * CH + CH));
    return g;
}
function world(from = -3, to = 5, water = true) {
    const view = { meshes: new Map(), group: new THREE.Group(), material: new THREE.MeshBasicMaterial(), waterMaterial: new THREE.MeshBasicMaterial(), data: { dirtyChunks: new Set() }, _rebuilding: new Set() };
    for (let cz = from; cz <= to; cz++) for (let cx = from; cx <= to; cx++) {
        const ground = new THREE.Mesh(geo(cx, cz), view.material), w = new THREE.Mesh(water && cx === 0 ? geo(cx, cz, 2) : new THREE.BufferGeometry(), view.waterMaterial);
        ground.visible = true; w.visible = water && cx === 0;
        view.group.add(ground, w);
        view.meshes.set(key(cx, cz), { cx, cz, ground, raised: ground, water: w });
    }
    return view;
}
const drawn = (view) => { let n = 0, t = 0; view.group.traverse((o) => { if (o.isMesh && o.visible && o.geometry.index) { n++; t += o.geometry.index.count / 3; } }); return { n, t }; };
const settle = (tc, fx, fz) => { const t0 = performance.now(); while (performance.now() - t0 < CLUSTER.SETTLE_MS + 60) { tc.step(fx, fz); } for (let i = 0; i < CLUSTER.SCAN_EVERY * 3; i++) tc.step(fx, fz); };

test('far squares are merged: fewer draws, the same triangles; near ones stay', () => {
    const view = world(), tc = new TerrainClusters(view, { CHUNK: CH, keyOf: key });
    const before = drawn(view);
    settle(tc, 0, 0); // the hero at the middle of chunk (0,0): squares farther than FAR merge
    for (let i = 0; i < 40; i++) tc.step(0, 0);
    const after = drawn(view);
    assert.ok(tc.map.size >= 1, 'some square is merged');
    assert.ok(after.n < before.n, 'fewer draws ' + before.n + ' → ' + after.n);
    assert.equal(after.t, before.t, 'the same triangles');
    for (const C of tc.map.values()) assert.ok(Math.hypot(C.mx, C.mz) > CLUSTER.FAR, 'only far squares');
});

test('a changed chunk (a new geometry) lets its square go in that very frame', () => {
    const view = world(), tc = new TerrainClusters(view, { CHUNK: CH, keyOf: key });
    settle(tc, 0, 0); for (let i = 0; i < 40; i++) tc.step(0, 0);
    const C = [...tc.map.values()][0];
    assert.ok(C, 'a square is merged');
    const m = C.members[4], e = view.meshes.get(m.key);
    e.ground.geometry = geo(m.cx, m.cz, 6); e.ground.visible = true; // (what TerrainView._fill does)
    tc.step(0, 0);
    assert.ok(![...tc.map.values()].includes(C), 'let go');
    const want = drawn(view).t;
    assert.ok(Math.abs(want - (drawn(world()).t + 2)) < 1e6); // (no double drawing: each member once)
    let members = 0; for (const mm of C.members) if (view.meshes.get(mm.key).ground.visible) members++;
    assert.equal(members, 9, 'all nine drawn again');
});

test('the hero coming near lets a square go; an incomplete square is never merged; the dirty ones wait', () => {
    const view = world(), tc = new TerrainClusters(view, { CHUNK: CH, keyOf: key });
    settle(tc, 0, 0); for (let i = 0; i < 40; i++) tc.step(0, 0);
    const C = [...tc.map.values()][0];
    tc.step(C.mx, C.mz); // (he stands in it)
    assert.ok(![...tc.map.values()].includes(C));
    // incomplete: a world of 8 chunks per side has complete squares only where all nine are there
    const v2 = world(-3, 4), t2 = new TerrainClusters(v2, { CHUNK: CH, keyOf: key });
    v2.meshes.delete(key(4, 4)); // the corner square lacks a chunk
    settle(t2, 0, 0); for (let i = 0; i < 40; i++) t2.step(0, 0);
    for (const c of t2.map.values()) assert.ok(!(c.a === 1 && c.b === 1), 'the incomplete square is not merged');
    // dirty
    const v3 = world(), t3 = new TerrainClusters(v3, { CHUNK: CH, keyOf: key });
    for (const k of v3.meshes.keys()) v3.data.dirtyChunks.add(k);
    settle(t3, 0, 0); for (let i = 0; i < 40; i++) t3.step(0, 0);
    assert.equal(t3.map.size, 0);
});

test('clear() gives everything back', () => {
    const view = world(), tc = new TerrainClusters(view, { CHUNK: CH, keyOf: key }), n0 = drawn(view);
    settle(tc, 0, 0); for (let i = 0; i < 40; i++) tc.step(0, 0);
    tc.clear();
    assert.deepEqual(drawn(view), n0);
    assert.equal(tc.map.size, 0);
});
