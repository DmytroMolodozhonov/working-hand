/**
 * TerrainClusters.js — the far land drawn in a few big pieces (the author 14.11: «сделай всё, чтобы поднять FPS»).
 *
 * The author's logs (RTX 3050, «Прорисовка: высокая»): «графика» is half of the frame, and it is the NUMBER of draws that costs
 * (every draw is a call into the driver: ~300–400 a frame, ~20 µs each on ANGLE/Direct3D), not the triangles. Of those draws about
 * nine in ten are terrain chunks (a chunk of 32×32 is one draw for its land and one for its water). Far away, past ~110 m, nothing
 * changes there and nothing is looked at closely — so the chunks of a 3×3 square of chunks are put into ONE mesh (their vertices
 * and indices simply written one after another: the same triangles, the same colours, the same shader, so the picture is exactly
 * the same; only 9 draws become 1).
 *
 *   • a square is merged when all nine of its chunks are shown, none is being remade, none is changed (dirty) and none has
 *     changed for a moment (`SETTLE_MS`), and its middle is farther than `FAR` from the hero; one square a frame at most (the copy
 *     of ~60 000 vertices is under a millisecond);
 *   • the members are hidden while it is on and their video-card buffers let go (`geometry.dispose()`: they are uploaded again
 *     by themselves when a member is drawn again — memory is not doubled);
 *   • it goes (the members are shown again at once) when the hero comes nearer than `NEAR` (a gap against flicker), or ANY of its
 *     chunks changes — a blast, a house rising, a rebuild, an unload: the check is every frame (a member's geometry is a new one
 *     each time `TerrainView._fill` runs), so no frame ever shows the old picture of a changed chunk;
 *   • the merged mesh casts shadows like the members (the sun's box is round the hero: far pieces are outside it).
 *
 * «А если»: the hero flies fast (the squares ahead are far: merged as they settle, and a square he comes up to is let go in the frame
 * he comes near — the members are drawn by the same frame; the upload of nine chunks happens over that frame, ~2 ms); a chunk of the square
 * is unloaded / reused for another place (the entry's cx/cz or geometry differ → the square goes); the view is disposed or the world
 * changes (clear()); a lower view distance (the far chunks are unloaded → the squares go); the world edge (an incomplete square is never merged).
 * Only on this computer: nothing goes over the net, nothing is saved.
 */
import * as THREE from 'three';

export const CLUSTER = {
    N: 3, // chunks along a side of a square
    FAR: 110, // m: a square whose middle is farther than this is merged …
    NEAR: 92, // m: … and let go when it is nearer than this (the gap: no flicker at the border)
    SETTLE_MS: 700, // ms a chunk's geometry must stay as it is before its square is merged
    SCAN_EVERY: 6, // frames between two looks for new squares
};

const floorDiv = (a, n) => Math.floor(a / n);

export class TerrainClusters {
    /** view: the TerrainView (`meshes` key → {cx, cz, ground, water}, `group`, `material`, `waterMaterial`, `data.dirtyChunks`, `_rebuilding`). */
    constructor(view, { CHUNK = 32, keyOf = null } = {}) {
        this.view = view;
        this.CHUNK = CHUNK;
        this._keyOf = keyOf;
        this.map = new Map(); // 'a,b' → square {a, b, mx, mz, members: [{key, entry, cx, cz, gGeo, wGeo, gVis, wVis}], land, water}
        this.seen = new WeakMap(); // a geometry → the time it was first seen as it is
        this.enabled = true;
        this._n = 0;
        this.stats = { merged: 0, released: 0, active: 0, drawsSaved: 0 };
    }

    /** Every frame, at the end of TerrainView.update: let go what changed or came near, then (now and then) merge one more. */
    step(fx, fz) {
        if (!this.enabled && !this.map.size) return;
        const v = this.view;
        for (const [key, C] of this.map) {
            if (!this.enabled || Math.hypot(C.mx - fx, C.mz - fz) < CLUSTER.NEAR || !this._intact(C)) this._release(key, C);
        }
        if (!this.enabled) return;
        if (++this._n % CLUSTER.SCAN_EVERY !== 0) return;
        const now = performance.now(), N = CLUSTER.N, W = N * this.CHUNK;
        const tried = new Set();
        let best = null, bestD = Infinity;
        for (const [key, e] of v.meshes) {
            const a = floorDiv(e.cx, N), b = floorDiv(e.cz, N), k = a + ',' + b;
            if (this.map.has(k) || tried.has(k)) continue;
            tried.add(k);
            const mx = a * W + W / 2, mz = b * W + W / 2, d = Math.hypot(mx - fx, mz - fz);
            if (d <= CLUSTER.FAR || d >= bestD) continue;
            if (!this._ready(a, b, now)) continue;
            best = { a, b, mx, mz }; bestD = d; // (the nearest ready one first)
        }
        if (best) this._merge(best);
    }

    /** All nine chunks shown, none remade or changed, each as it is for SETTLE_MS. */
    _ready(a, b, now) {
        const v = this.view, N = CLUSTER.N;
        let ok = true;
        for (let dz = 0; dz < N; dz++) for (let dx = 0; dx < N; dx++) {
            const cx = a * N + dx, cz = b * N + dz, key = this.keyOf(cx, cz), e = v.meshes.get(key);
            if (!e || e.cx !== cx || e.cz !== cz) return false;
            if (v._rebuilding?.has(key) || v.data?.dirtyChunks?.has(key)) return false;
            for (const m of [e.ground, e.water]) {
                const g = m.geometry;
                if (!this.seen.has(g)) { this.seen.set(g, now); ok = false; } else if (now - this.seen.get(g) < CLUSTER.SETTLE_MS) ok = false;
            }
        }
        return ok;
    }

    keyOf(cx, cz) { return this._keyOf ? this._keyOf(cx, cz) : cx + ',' + cz; }

    /** The members are still the very chunks (and geometries) the square was made from. */
    _intact(C) {
        const v = this.view;
        for (const m of C.members) {
            const e = v.meshes.get(m.key);
            if (e !== m.entry || e.cx !== m.cx || e.cz !== m.cz || e.ground.geometry !== m.gGeo || e.water.geometry !== m.wGeo) return false;
            if (v._rebuilding?.has(m.key) || v.data?.dirtyChunks?.has(m.key)) return false;
        }
        return true;
    }

    _merge({ a, b, mx, mz }) {
        const v = this.view, N = CLUSTER.N;
        const members = [];
        for (let dz = 0; dz < N; dz++) for (let dx = 0; dx < N; dx++) {
            const cx = a * N + dx, cz = b * N + dz, key = this.keyOf(cx, cz), e = v.meshes.get(key);
            members.push({ key, entry: e, cx, cz, gGeo: e.ground.geometry, wGeo: e.water.geometry, gVis: false, wVis: false });
        }
        const land = this._concat(members.map((m) => m.entry.ground), v.material, true);
        const water = this._concat(members.map((m) => m.entry.water), v.waterMaterial, false);
        for (const m of members) {
            m.gVis = m.entry.ground.visible && !!m.gGeo.attributes.position;
            m.wVis = m.entry.water.visible && !!m.wGeo.attributes.position;
            m.entry.ground.visible = false; m.entry.water.visible = false;
            m.gGeo.dispose(); m.wGeo.dispose(); // (the card's copy goes; the arrays stay: uploaded again if a member is drawn again)
        }
        const C = { a, b, mx, mz, members, land, water };
        this.map.set(a + ',' + b, C);
        this.stats.merged++;
        this.stats.active = this.map.size;
        this.stats.drawsSaved += members.filter((m) => m.gVis).length - (land ? 1 : 0) + members.filter((m) => m.wVis).length - (water ? 1 : 0);
        return C;
    }

    /** The meshes' geometries written one after another into one mesh (null: they are all empty). */
    _concat(meshes, material, land) {
        const parts = meshes.filter((m) => m.visible && m.geometry.attributes.position && m.geometry.index);
        if (!parts.length) return null;
        let nv = 0, ni = 0;
        for (const m of parts) { nv += m.geometry.attributes.position.count; ni += m.geometry.index.count; }
        const first = parts[0].geometry, out = new THREE.BufferGeometry();
        for (const name of Object.keys(first.attributes)) {
            const A = first.attributes[name], size = A.itemSize, T = A.array.constructor, arr = new T(nv * size);
            let o = 0;
            for (const m of parts) { const src = m.geometry.attributes[name].array; arr.set(src, o); o += src.length; }
            out.setAttribute(name, new THREE.BufferAttribute(arr, size, A.normalized));
        }
        const idx = new Uint32Array(ni);
        let io = 0, vo = 0;
        const box = new THREE.Box3();
        for (const m of parts) {
            const src = m.geometry.index.array, n = src.length;
            for (let i = 0; i < n; i++) idx[io + i] = src[i] + vo;
            io += n; vo += m.geometry.attributes.position.count;
            if (m.geometry.boundingBox) box.union(m.geometry.boundingBox);
        }
        out.setIndex(new THREE.BufferAttribute(idx, 1));
        out.boundingBox = box;
        out.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        const mesh = new THREE.Mesh(out, material);
        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = true;
        mesh.castShadow = land;
        if (!land) mesh.renderOrder = 1; // (water after the ground under it)
        mesh.userData.isTerrain = true;
        mesh.userData.cluster = true;
        this.view.group.add(mesh);
        return mesh;
    }

    /** The square goes: its members are drawn again (the ones that are still the same chunks). */
    _release(key, C) {
        this.map.delete(key);
        const v = this.view;
        for (const m of C.members) {
            const e = v.meshes.get(m.key);
            if (e !== m.entry || e.cx !== m.cx || e.cz !== m.cz) continue; // (unloaded / reused: nothing of the old to show)
            if (e.ground.geometry === m.gGeo && m.gVis) e.ground.visible = true; // (a changed one was set by `_fill` itself)
            if (e.water.geometry === m.wGeo && m.wVis) e.water.visible = true;
        }
        for (const mesh of [C.land, C.water]) if (mesh) { v.group.remove(mesh); mesh.geometry.dispose(); }
        this.stats.released++;
        this.stats.active = this.map.size;
    }

    /** Everything let go (a new world, the view is disposed). */
    clear() {
        for (const [key, C] of [...this.map]) this._release(key, C);
    }
}
