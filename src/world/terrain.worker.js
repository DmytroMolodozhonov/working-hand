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

/** A mesh's box, made here (TerrainView._fill: no pass over its points in the frame). */
function bounds(b) {
    const p = b.positions;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
    }
    b.bounds = [x0, y0, z0, x1, y1, z1];
}

const KEEP = 240; // chunks kept (≈ 140 KB each)
let data = null;
/** The main thread's changed chunks (TerrainView._share): sent once each time they change, kept here. */
const shared = new Map();
const takeShared = (m) => {
    for (const k of m.drop || []) shared.delete(k);
    for (const c of m.fresh || []) shared.set(chunkKey(c.cx, c.cz), c);
    return (m.use || []).map((k) => shared.get(k)).filter(Boolean);
};

self.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'init') {
        data = new TerrainData();
        data.generate(m.opts);
        data.skipSeaTop = !!m.skipSeaTop;
        return;
    }
    if (m.type === 'ghostOn' && data?.ghost) {
        // the Castle of Ghosts in / out of this computer's land (a seer's): the next chunks are made the new way (GhostCastle.js)
        data.ghost.on = !!m.on;
        data.ghost.passive = false;
        return;
    }
    if (m.type === 'ghostDrop' && data) {
        // the castle's chunks made the old way are forgotten (here and what the main thread shared) — made again when wanted
        for (const k of m.keys || []) { data.chunks.delete(k); shared.delete(k); }
        data._last = null;
        return;
    }
    if (m.type === 'ghost' && data?.ghost) {
        // the Castle of Ghosts' cells round a hero (a worker decides them: the main thread must not)
        self.postMessage({ type: 'ghost', id: m.id, key: m.key, cells: data.ghost.export9(m.x, m.z, !!m.lite) });
        return;
    }
    if (m.type === 'planets' && data) {
        // the planets changed (made, terraformed…: Planets.js) — their ground is made by the new recipe
        data.setPlanets(m.s);
        return;
    }
    if (m.type === 'site' && data && data.castles) {
        // a castle's / a wizard's tower's / a wizards' settlement's plan for a cell (the same as the main thread would make)
        const c = data.castles.cellOf(m.gx, m.gz), t = data.towers.cellOf(m.gx, m.gz), v = data.villages ? data.villages.cellOf(m.gx, m.gz) : null;
        const h = data.hamlets ? data.hamlets.cellOf(m.gx, m.gz).map((d) => ({ ...d, _byChunk: new Map() })) : null; // (the lone houses and small villages: Hamlets.js)
        self.postMessage({ type: 'site', id: m.id, key: m.key, gx: m.gx, gz: m.gz, castle: c && { ...c, _byChunk: new Map() }, tower: t && (t._byChunk ? { ...t, _byChunk: new Map() } : t), village: v && { ...v, _byChunk: new Map() }, hamlets: h, dungeons: data.dungeons ? data.dungeons.export4(m.gx, m.gz) : null });
        return;
    }
    if (m.type === 'flora' && data) {
        // the tall grass and flowers of a chunk (Flora.js) — the chunk as generated
        if (m.use) m.chunk = takeShared(m)[0] || null;
        const out = m.chunk ? buildFlora({ seed: data.seed, _hidden: m.hidden ? new Map([[m.key, new Set(m.hidden)]]) : null }, m.chunk) : buildFlora(data, data.chunk(m.cx, m.cz));
        self.postMessage({ type: 'flora', id: m.id, key: m.key, out, rev: m.rev }, [out.pos.buffer, out.nor.buffer, out.col.buffer, out.sway.buffer, out.glow.buffer]);
        return;
    }
    if (m.type === 'rebuild' && data) {
        // a chunk changed on the main thread: its own data (and its changed neighbours') used for this
        // one mesh, then the worker's own (as generated) put back
        const keep = new Map();
        for (const c of m.use ? takeShared(m) : m.chunks) { const k = chunkKey(c.cx, c.cz); keep.set(k, data.chunks.get(k)); data.chunks.set(k, c); }
        const hidden = data._hidden;
        data._hidden = m.hidden ? new Map([[m.key, new Set(m.hidden)]]) : null;
        data._last = null;
        const litWas = data.litLand, L = m.lit; // (the lit land of the main thread: rooms made by magic)
        data.litLand = L ? (x, z) => { const rx = x - L.x0, rz = z - L.z0; return rx >= 0 && rz >= 0 && rx < L.RW && rz < L.RW && L.a[rz * L.RW + rx] === 1; } : litWas;
        let arrays, sky, chunk = null;
        try {
            arrays = data.buildChunkArrays(m.cx, m.cz);
            const c = data.chunk(m.cx, m.cz);
            sky = c.sky;
            // (the main thread has no data of this chunk yet: it goes along, as made here)
            if (m.wantChunk && !c.modified) { chunk = { ...c }; delete chunk.rev; }
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
            bounds(b);
            for (const a of [b.positions, b.normals, b.colors, b.indices, b.patterns, b.skies]) transfer.push(a.buffer);
        }
        self.postMessage({ type: 'rebuilt', id: m.id, key: m.key, cx: m.cx, cz: m.cz, arrays, sky, chunk }, transfer);
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
        bounds(b);
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
