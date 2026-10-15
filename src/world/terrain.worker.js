/**
 * terrain.worker.js — makes terrain chunks away from the drawing (TerrainView.js).
 *
 * It has its own copy of the world's recipe (the same seed and settings → the
 * very same chunks as on the main thread and on every other computer). Asked for
 * a chunk, it makes its ground and its neighbours' (a mesh needs their borders),
 * builds the mesh arrays and sends them back with the chunk's data. It keeps the
 * chunks it made lately (the next chunk over needs most of them again), not more.
 */
import { TerrainData, chunkKey, mergeBuffers } from './Terrain.js';
import { buildFlora } from './FloraBuild.js';

const KEEP = 240; // chunks kept (≈ 140 KB each)
let data = null;

self.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'init') {
        data = new TerrainData();
        data.generate(m.opts);
        data.skipSeaTop = !!m.skipSeaTop;
        return;
    }
    if (m.type === 'planets' && data) {
        // the planets changed (made, terraformed…: Planets.js) — their ground is made by the new recipe
        data.setPlanets(m.s);
        return;
    }
    if (m.type === 'site' && data && data.castles) {
        // a castle's / a wizard's tower's plan for a cell (the same as the main thread would make)
        const c = data.castles.cellOf(m.gx, m.gz), t = data.towers.cellOf(m.gx, m.gz);
        self.postMessage({ type: 'site', id: m.id, key: m.key, gx: m.gx, gz: m.gz, castle: c && { ...c, _byChunk: new Map() }, tower: t && (t._byChunk ? { ...t, _byChunk: new Map() } : t) });
        return;
    }
    if (m.type === 'flora' && data) {
        // the tall grass and flowers of a chunk (Flora.js) — the chunk as generated
        const out = m.chunk ? buildFlora({ seed: data.seed, _hidden: m.hidden ? new Map([[m.key, new Set(m.hidden)]]) : null }, m.chunk) : buildFlora(data, data.chunk(m.cx, m.cz));
        self.postMessage({ type: 'flora', id: m.id, key: m.key, out, rev: m.rev }, [out.pos.buffer, out.nor.buffer, out.col.buffer, out.sway.buffer, out.glow.buffer]);
        return;
    }
    if (m.type === 'rebuild' && data) {
        // a chunk changed on the main thread: its own data (and its changed neighbours') used for this
        // one mesh, then the worker's own (as generated) put back
        const keep = new Map();
        for (const c of m.chunks) { const k = chunkKey(c.cx, c.cz); keep.set(k, data.chunks.get(k)); data.chunks.set(k, c); }
        const hidden = data._hidden;
        data._hidden = m.hidden ? new Map([[m.key, new Set(m.hidden)]]) : null;
        data._last = null;
        const litWas = data.litLand, L = m.lit; // (the lit land of the main thread: rooms made by magic)
        data.litLand = L ? (x, z) => { const rx = x - L.x0, rz = z - L.z0; return rx >= 0 && rz >= 0 && rx < L.RW && rz < L.RW && L.a[rz * L.RW + rx] === 1; } : litWas;
        let arrays, sky;
        try {
            arrays = data.buildChunkArrays(m.cx, m.cz);
            sky = data.chunk(m.cx, m.cz).sky;
        } finally {
            for (const [k, c] of keep) { if (c) data.chunks.set(k, c); else data.chunks.delete(k); }
            data._hidden = hidden;
            data.litLand = litWas;
            data._last = null;
        }
        const transfer = [];
        arrays.land = mergeBuffers(arrays.ground, arrays.raised); // (one draw for the chunk's land — TerrainView)
        delete arrays.ground; delete arrays.raised;
        for (const k of ['land', 'water']) {
            const b = arrays[k];
            for (const a of [b.positions, b.normals, b.colors, b.indices, b.patterns, b.skies]) transfer.push(a.buffer);
        }
        self.postMessage({ type: 'rebuilt', id: m.id, key: m.key, cx: m.cx, cz: m.cz, arrays, sky }, transfer);
        return;
    }
    if (m.type !== 'build' || !data) return;
    const t0 = performance.now();
    const arrays = data.buildChunkArrays(m.cx, m.cz);
    const c = data.chunk(m.cx, m.cz);
    const chunk = { ...c }; // (its typed arrays are copied by postMessage: this copy keeps its own for the neighbours)
    delete chunk.rev;
    const transfer = [];
    arrays.land = mergeBuffers(arrays.ground, arrays.raised); // (one draw for the chunk's land — TerrainView)
    delete arrays.ground; delete arrays.raised;
    for (const k of ['land', 'water']) {
        const b = arrays[k];
        for (const a of [b.positions, b.normals, b.colors, b.indices, b.patterns, b.skies]) transfer.push(a.buffer);
    }
    self.postMessage({ type: 'built', id: m.id, key: m.key, cx: m.cx, cz: m.cz, arrays, chunk, ms: performance.now() - t0 }, transfer);
    // forget the chunks far from where the player is now, then the oldest
    if (data.chunks.size > KEEP) {
        data.evictFar(m.fcx, m.fcz, m.R + 2);
        for (const key of data.chunks.keys()) {
            if (data.chunks.size <= KEEP) break;
            data.chunks.delete(key);
        }
        data._last = null;
    }
};
