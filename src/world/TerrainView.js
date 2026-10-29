/**
 * TerrainView.js — the THREE meshes of the endless terrain (TerrainData in Terrain.js).
 *
 * Keeps meshes only for the chunks around the player: missing ones are made
 * nearest-first, far ones are unloaded. The heavy part — making a chunk's
 * ground (heights, caves, castles, trees) and its mesh — runs in web workers
 * (terrain.worker.js) when the browser has them, so a fast flight over new
 * land never makes the drawing wait; the same seed makes the same chunk there.
 * A chunk next to a changed one (an explosion, a building) is made here, from
 * this computer's own data, as before.
 */
import * as THREE from 'three';
import { TerrainData, CHUNK, chunkKey, mergeBuffers } from './Terrain.js';
import { slotAt } from './Planets.js';
import { applyVoxelDetail, applySkyComp } from './VoxelShading.js';
import { applyUltraWater } from '../fx/UltraWater.js';

/** ms a frame for sending changed chunks to the workers (and as much again for putting their meshes in). */
const REBUILD_MS = 1.5;
/** Changed chunks each worker keeps (its copy of this computer's): ~150 KB each. */
const SHARE_KEEP = 40;
const _shapes = []; // (reused: the lit rooms' shapes of one chunk)

/** [minX, minY, minZ, maxX, maxY, maxZ] of xyz points (one pass). */
export function boundsOf(p) {
    let a = Infinity, b = Infinity, c = Infinity, d = -Infinity, e = -Infinity, f = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        if (x < a) a = x;
        if (x > d) d = x;
        if (y < b) b = y;
        if (y > e) e = y;
        if (z < c) c = z;
        if (z > f) f = z;
    }
    return [a, b, c, d, e, f];
}

const POOL_MAX = 64; // idle chunk shells kept for reuse

/**
 * Terrain = data + THREE meshes for the chunks around the player.
 * update(focus) streams chunks in and out; explosions rebuild only the
 * touched chunks, a couple per frame, so nothing ever causes a hitch.
 */
export class Terrain {
    constructor(scene, { seed = 1, mountains = false, seas = false, test = false, deepCaves = false, lush = false, slopes = false, wizHuts = false, furnish = false, bigHouses = false, meshTrees = false, bigArena = false, apart = false, dungeons = false, arenaEntries = false, viewDistance = 112 } = {}) {
        this.scene = scene;
        this.data = new TerrainData();
        this.data.generate({ seed, mountains, seas, test, deepCaves, lush, slopes, wizHuts, furnish, bigHouses, meshTrees, bigArena, apart, dungeons, arenaEntries });
        // the sea's top is drawn by the wave surface (src/fx/SeaSurface.js), not by flat block faces
        this.data.skipSeaTop = !!this.data.seas;
        this.material = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111 }));
        this.waterMaterial = applyUltraWater(applySkyComp(new THREE.MeshPhongMaterial({
            vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
            shininess: 90, specular: 0x88bbff,
        }))); // («Ультра качество»: lakes and rivers mirror the sky)
        this.group = new THREE.Group();
        this.group.name = 'terrain';
        this.meshes = new Map(); // chunk key -> {ground (= raised: one mesh for its land), water, cx, cz}
        this.pool = []; // unloaded mesh pairs, reused
        scene.add(this.group);
        this.viewDistance = viewDistance; // m
        this.budgetMs = 4; // per frame for building new chunks
        this.maxRebuildsPerFrame = 2;
        this._center = null;
        this._queue = [];
        this._frame = 0;
        this.stats = { built: 0, unloaded: 0, maxBuildMs: 0, byWorkers: 0, maxWorkerMs: 0, maxApplyMs: 0 };
        this.flushAround(0, 0);
        this.opts = { seed, mountains, seas, test, deepCaves, lush, slopes, wizHuts, furnish, bigHouses, meshTrees, bigArena, dungeons, arenaEntries }; // (the world's recipe: space.worker.js makes the Earth's globe from it)
        this._startWorkers(this.opts);
    }

    /**
     * The planets changed (Planets.js: made, terraformed, sent by the host): the workers make their ground
     * by the new recipe; the planets' chunks made before (not changed by anybody) are made again.
     */
    planetsChanged(json, ids = null) {
        if (this._workers) for (const w of this._workers) w.postMessage({ type: 'planets', s: json });
        this.data._last = null;
        if (!ids) {
            // (all of them, at once: the planets first came from a save / the host)
            for (const [k, c] of this.data.chunks) if (c.planet && !c.modified) this.data.chunks.delete(k);
            for (const [key, e] of [...this.meshes]) if (this.data.planetOfChunk(e.cx, e.cz)) this._unload(key, e);
            this._center = null;
            return;
        }
        if (!ids.length) return;
        // only these planets (a new one, «Terraform Planet»): the ground not shown is forgotten (made by the new
        // recipe when wanted); the shown ground is made again a few chunks a frame, the nearest first, the old one
        // staying until its new one is in — no hole, no long frame. Ground a player changed (built, dug) stays.
        const set = new Set(ids);
        const ofSet = (cx, cz) => { const p = this.data.planetOfChunk(cx, cz); return !!p && set.has(p.id); };
        for (const [k, c] of this.data.chunks) if (c.planet && set.has(c.planet) && !c.modified && !this.meshes.has(k)) this.data.chunks.delete(k);
        const c0 = this._center, list = [];
        for (const [key, e] of this.meshes) if (ofSet(e.cx, e.cz)) list.push({ key, cx: e.cx, cz: e.cz, d: c0 ? (e.cx - c0.cx) ** 2 + (e.cz - c0.cz) ** 2 : 0 });
        list.sort((a, b) => b.d - a.d); // (popped from the end: the nearest first)
        this._remake = list;
        this._remakeFlight = new Map();
        this._remade = [];
    }

    /**
     * «Planet Liquidation» (PlanetDestroy.js): planets gone — their ground with them (what was built there too: it
     * blew up with the planet); their slots of the far zone are empty space now. Only their own chunks are touched.
     */
    planetGone(json, ids, slots) {
        if (this._workers) for (const w of this._workers) w.postMessage({ type: 'planets', s: json });
        this.data._last = null;
        const set = new Set(ids), sl = new Set(slots);
        for (const [k, c] of this.data.chunks) if (c.planet && set.has(c.planet)) this.data.chunks.delete(k);
        for (const [key, e] of [...this.meshes]) { const s = slotAt(e.cx * CHUNK + CHUNK / 2, e.cz * CHUNK + CHUNK / 2); if (s >= 0 && sl.has(s)) this._unload(key, e); }
    }

    /** «Terraform Planet»: the shown ground of the planet made again, a little a frame (planetsChanged). */
    _remakeStep(t0) {
        const d = this.data;
        if (this._workers) {
            while (this._remade.length && performance.now() - t0 < this.budgetMs) {
                const m = this._remade.shift(), entry = this.meshes.get(m.key);
                if (!entry || entry.cx !== m.cx || entry.cz !== m.cz) continue;
                const c = d.chunks.get(m.key);
                if (c?.modified) continue; // (a player's work here: kept as it is)
                m.chunk.rev = (c?.rev || 0) + 1;
                d.chunks.set(m.key, m.chunk);
                d._last = null;
                d.version++; if (d.mapDirty && d.mapDirty.size < 64) d.mapDirty.add(m.key); // (the minimap draws it again)
                this._fill(entry.ground, m.arrays.land);
                this._fill(entry.water, m.arrays.water);
                this.stats.built++;
            }
            while (this._remake.length && this._remakeFlight.size < 2) {
                const job = this._remake.pop();
                if (!this.meshes.has(job.key)) continue;
                let w = this._workers[0];
                for (const o of this._workers) if (o.load < w.load) w = o;
                w.load++;
                const id = ++this._jobId;
                this._remakeFlight.set(job.key, id);
                w.postMessage({ type: 'build', id, key: job.key, cx: job.cx, cz: job.cz, fcx: job.cx, fcz: job.cz, R: this.radiusChunks });
            }
            return;
        }
        // (no workers: here, one chunk a frame)
        const job = this._remake.pop();
        const entry = job && this.meshes.get(job.key);
        if (!entry) return;
        const c = d.chunks.get(job.key);
        if (c && !c.modified) d.chunks.delete(job.key);
        d._last = null;
        this._build(entry);
        d.version++; if (d.mapDirty && d.mapDirty.size < 64) d.mapDirty.add(job.key);
    }

    /**
     * Web workers that make chunks (terrain.worker.js): one less than the processor's cores
     * minus the game's own two threads, 1…4. None in Node (tests) or when they can't start —
     * then everything is made here, as before.
     */
    _startWorkers(opts) {
        this._workers = null;
        this._inFlight = new Map(); // chunk key -> {id, w}
        this._done = []; // finished chunks waiting to go in
        this._local = []; // chunks to make here (next to a changed one)
        this._jobId = 0;
        this._floraAsked = new Map(); // chunk key -> job id (Flora.js: tall grass made in a worker)
        this._floraDone = [];
        this._siteAsked = new Set(); // castle cells being planned in a worker
        this._rebuilding = new Map(); // changed chunk key -> job id (made again in a worker)
        this._rebuilt = [];
        if (typeof Worker === 'undefined' || typeof window === 'undefined' || window.__ZNS_NO_TERRAIN_WORKERS__) return;
        const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
        try {
            const ws = [];
            for (let i = 0; i < n; i++) {
                const w = new Worker(new URL('./terrain.worker.js', import.meta.url), { type: 'module' });
                w.load = 0;
                w.onmessage = (e) => this._onBuilt(w, e.data);
                w.onerror = (e) => { e.preventDefault?.(); this._stopWorkers(); };
                w.postMessage({ type: 'init', opts, skipSeaTop: this.data.skipSeaTop });
                ws.push(w);
            }
            this._workers = ws;
            this.data.workersOn = true; // (the ground comes from them: TerrainData.landMade)
        } catch (e) {
            this._workers = null;
        }
    }

    /** Can the workers make the tall grass of a chunk (Flora.js)? */
    get floraAsync() { return !!this._workers; }

    /** Ask a worker for the grass and flowers of a chunk — as generated, or as changed here (`changed`: the chunk) — once until it comes. */
    askFlora(key, cx, cz, changed = null) {
        if (!this._workers || this._floraAsked.has(key)) return;
        let w = this._workers[0];
        for (const o of this._workers) if (o.load < w.load) w = o;
        w.load++;
        const id = ++this._jobId;
        this._floraAsked.set(key, id);
        // (a chunk changed here: its own data goes along, and its rev — an answer for an older one is not used)
        let chunk = null, hidden = null, rev;
        let share = null;
        if (changed) { share = this._share(w, [changed]); rev = changed.rev || 0; const h = this.data._hidden?.get(key); hidden = h ? [...h] : null; }
        w.postMessage({ type: 'flora', id, key, cx, cz, chunk, hidden, rev, ...share });
    }

    /** Grass made but not put in this frame: first next time. */
    putBackFlora(list) { this._floraDone = list.concat(this._floraDone); }

    /** The grass the workers made since the last look: [{key, out}]. */
    takeFlora() {
        const out = this._floraDone;
        this._floraDone = [];
        return out;
    }

    /**
     * The castles and towers ahead (within `r`, cells of `cell` m): planned in the workers before the
     * minimap or the people ask for a whole row of them at once (a castle's plan is a long job). Without
     * workers: made here, a little a frame (SiteIndex.warm).
     */
    warmSites(x, z, r, cell) {
        const S = this.data.sites;
        if (!S) return;
        if (!this._workers) { S.warm(x, z, r, cell); return; }
        const g0x = Math.floor((x - r) / cell) - 1, g1x = Math.floor((x + r) / cell) + 1;
        const g0z = Math.floor((z - r) / cell) - 1, g1z = Math.floor((z + r) / cell) + 1;
        for (let gz = g0z; gz <= g1z && this._siteAsked.size < 2; gz++) for (let gx = g0x; gx <= g1x && this._siteAsked.size < 2; gx++) {
            const key = S.castles._key(gx, gz);
            if ((S.castles.cells.has(key) && S.towers.cells.has(key) && (!S.villages || S.villages.cells.has(key)) && (!S.hamlets || S.hamlets.cells.has(key)) && (!S.dungeons || S.dungeons.has4(gx, gz))) || this._siteAsked.has(key)) continue;
            let w = this._workers[0];
            for (const o of this._workers) if (o.load < w.load) w = o;
            w.load++;
            this._siteAsked.add(key);
            w.postMessage({ type: 'site', id: ++this._jobId, key, gx, gz });
        }
    }

    /** The workers failed (an old browser): everything is made here from now on. */
    _stopWorkers() {
        if (!this._workers) return;
        for (const w of this._workers) w.terminate();
        this._workers = null;
        this.data.workersOn = false;
        this._inFlight.clear();
        this._done.length = 0;
        this._floraAsked.clear();
        this._floraDone.length = 0;
        this._siteAsked.clear();
        for (const key of this._rebuilding.keys()) this.data.dirtyChunks.add(key); // (made here instead)
        this._rebuilding.clear();
        this._rebuilt.length = 0;
        this._center = null; // (plan again: what was being made is wanted again)
    }

    _onBuilt(w, m) {
        if (m.type === 'rebuilt') {
            w.load--;
            if (this._rebuilding.get(m.key) === m.id) { this._rebuilding.delete(m.key); this._rebuilt.push(m); }
            return;
        }
        if (m.type === 'site') {
            w.load--;
            this._siteAsked.delete(m.key);
            const S = this.data.sites;
            if (S && !S.castles.cells.has(m.key)) S.castles.cells.set(m.key, m.castle);
            if (S && !S.towers.cells.has(m.key)) S.towers.cells.set(m.key, m.tower);
            if (S?.villages && !S.villages.cells.has(m.key)) S.villages.cells.set(m.key, m.village || null);
            if (S?.hamlets && m.hamlets && !S.hamlets.cells.has(m.key)) S.hamlets.cells.set(m.key, m.hamlets);
            if (S?.dungeons && m.dungeons) S.dungeons.adopt(m.dungeons); // (the dungeons of the wild: Dungeons.js)
            return;
        }
        if (m.type === 'flora') {
            w.load--;
            if (this._floraAsked.get(m.key) === m.id) { this._floraAsked.delete(m.key); this._floraDone.push(m); }
            return;
        }
        if (m.type !== 'built') return;
        w.load--;
        if (this._remakeFlight?.get(m.key) === m.id) { this._remakeFlight.delete(m.key); this._remade.push(m); return; } // (a planet's ground made again)
        const f = this._inFlight.get(m.key);
        if (!f || f.id !== m.id) return; // (asked again since: an older answer)
        this._inFlight.delete(m.key);
        this._done.push(m);
        if (m.ms > this.stats.maxWorkerMs) this.stats.maxWorkerMs = m.ms;
    }

    /** Was a chunk round (cx, cz) changed here (an explosion, a building, a falling piece)? Then it is made here. */
    _touched(cx, cz) {
        const d = this.data;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const key = chunkKey(cx + dx, cz + dz);
            const c = d.chunks.get(key);
            if ((c && c.modified) || d.dirtyChunks.has(key) || d._hidden?.has(key)) return true;
        }
        return false;
    }

    _inRange(cx, cz) {
        const c = this._center;
        if (!c) return true;
        const R = this.radiusChunks, dx = cx - c.cx, dz = cz - c.cz;
        return dx * dx + dz * dz <= (R + 1.5) * (R + 1.5);
    }

    /** Send the nearest wanted chunks to the workers (a few each in flight). */
    _dispatch(maxInFlight) {
        const ws = this._workers;
        const c = this._center;
        while (this._queue.length && this._inFlight.size < maxInFlight) {
            const job = this._queue.pop();
            if (this.meshes.has(job.key) || this._inFlight.has(job.key)) continue;
            if (this._touched(job.cx, job.cz)) { this._local.push(job); continue; }
            let w = ws[0];
            for (const o of ws) if (o.load < w.load) w = o;
            w.load++;
            const id = ++this._jobId;
            this._inFlight.set(job.key, { id, w });
            w.postMessage({ type: 'build', id, key: job.key, cx: job.cx, cz: job.cz, fcx: c ? c.cx : job.cx, fcz: c ? c.cz : job.cz, R: this.radiusChunks });
        }
    }

    /** A chunk made by a worker goes in: its data into this computer's world, its arrays into a mesh. */
    _applyBuilt(m) {
        if (this.meshes.has(m.key) || !this._inRange(m.cx, m.cz)) return;
        if (this._touched(m.cx, m.cz)) { this._local.push({ key: m.key, cx: m.cx, cz: m.cz }); return; } // (changed here meanwhile)
        const t0 = performance.now();
        const d = this.data;
        let c = d.chunks.get(m.key);
        if (!c) { c = m.chunk; d.chunks.set(m.key, c); } // (the same chunk this computer would make: same seed)
        else if (c.sky === undefined) c.sky = m.chunk.sky; // (made here meanwhile, by a look at it: the cave light the mesh used)
        c.rev = (c.rev || 0) + 1;
        let entry = this.pool.pop();
        if (!entry) entry = this._newEntry();
        entry.cx = m.cx;
        entry.cz = m.cz;
        this.meshes.set(m.key, entry);
        this._fill(entry.ground, m.arrays.land);
        this._fill(entry.water, m.arrays.water);
        this.stats.built++;
        this.stats.byWorkers++;
        const ms = performance.now() - t0;
        if (ms > this.stats.maxApplyMs) this.stats.maxApplyMs = ms;
    }

    /**
     * A changed chunk's mesh made again in a worker: the chunks round it that were changed here go
     * along (the rest the worker makes itself, the same as here), with the falling pieces' hidden cells.
     */
    _sendRebuild(key, entry, wantChunk = false) {
        const d = this.data, chunks = [];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const c = d.chunks.get(chunkKey(entry.cx + dx, entry.cz + dz));
            if (c && c.modified) chunks.push(c);
        }
        const hid = d._hidden?.get(key);
        // the lit land round it (rooms made by magic — HouseMagic, CastleMagic, IceMagic: data.litLand lives
        // only here): the worker's sky light keeps them lit as rooms, never a cave's dark
        let lit = null;
        if (d.litLand) {
            const P = 15, RW = CHUNK + 2 * P, x0 = entry.cx * CHUNK - P, z0 = entry.cz * CHUNK - P;
            let a = null;
            if (d.litShapes && d._litPair === d.litLand) {
                // (the rooms' rectangles and circles that reach here, filled in — not a question per column)
                const shapes = d.litShapes(x0, z0, x0 + RW - 1, z0 + RW - 1, _shapes);
                for (const s of shapes) {
                    const r = s.r;
                    const ax = r != null ? s.cx - r : s.x0, bx = r != null ? s.cx + r : s.x1, az = r != null ? s.cz - r : s.z0, bz = r != null ? s.cz + r : s.z1;
                    for (let z = Math.max(z0, Math.ceil(az)); z <= Math.min(z0 + RW - 1, Math.floor(bz)); z++) {
                        for (let x = Math.max(x0, Math.ceil(ax)); x <= Math.min(x0 + RW - 1, Math.floor(bx)); x++) {
                            if (r != null && Math.hypot(x - s.cx, z - s.cz) > r) continue;
                            (a || (a = new Uint8Array(RW * RW)))[(z - z0) * RW + x - x0] = 1;
                        }
                    }
                }
                _shapes.length = 0;
            } else for (let rz = 0; rz < RW; rz++) for (let rx = 0; rx < RW; rx++) if (d.litLand(x0 + rx, z0 + rz)) (a || (a = new Uint8Array(RW * RW)))[rz * RW + rx] = 1;
            if (a) lit = { x0, z0, RW, a };
        }
        let w = this._workers[0];
        for (const o of this._workers) if (o.load < w.load) w = o;
        w.load++;
        const id = ++this._jobId;
        this._rebuilding.set(key, id);
        w.postMessage({ type: 'rebuild', id, key, cx: entry.cx, cz: entry.cz, ...this._share(w, chunks), hidden: hid ? [...hid] : null, lit, wantChunk });
    }

    /**
     * The changed chunks a worker is to use for one job. Each is sent only when it changed since that worker
     * last got it (the worker keeps the last SHARE_KEEP of them): a house rising changes the same two or three
     * chunks every frame, and copying all nine round each changed one (blocks and light, ~0.3 MB) for every
     * rebuild took the frame tens of milliseconds. Its light (`sky`) is never sent: the worker works it out.
     */
    _share(w, list) {
        const sent = w.sent || (w.sent = new Map()); // key -> {c, ver}: what that worker holds (oldest first)
        const fresh = [], use = [];
        for (const c of list) {
            const key = chunkKey(c.cx, c.cz);
            use.push(key);
            const s = sent.get(key);
            sent.delete(key);
            if (s && s.c === c && s.ver === c.ver) { sent.set(key, s); continue; }
            const { rev, sky, ...copy } = c; // eslint-disable-line no-unused-vars
            fresh.push(copy);
            sent.set(key, { c, ver: c.ver });
        }
        let drop = null;
        while (sent.size > SHARE_KEEP) { const k = sent.keys().next().value; sent.delete(k); (drop || (drop = [])).push(k); }
        return { fresh, use, drop };
    }

    _applyRebuilt(m) {
        const entry = this.meshes.get(m.key);
        if (!entry || entry.cx !== m.cx || entry.cz !== m.cz) return;
        let c = this.data.chunks.get(m.key);
        if (!c && m.chunk) { c = m.chunk; this.data.chunks.set(m.key, c); } // (a chunk next to a changed one, not here yet: as the worker made it)
        if (c) { c.sky = m.sky; c.rev = (c.rev || 0) + 1; } // (the cave light the mesh used; the grass on it made again)
        this._fill(entry.ground, m.arrays.land);
        this._fill(entry.water, m.arrays.water);
        this.stats.built++;
    }

    /** Chunks next to a changed one: made here, within the time left (their ground first, one chunk at a time). */
    _buildLocal(t0, budget) {
        while (this._local.length) {
            const job = this._local[this._local.length - 1];
            if (this.meshes.has(job.key) || !this._inRange(job.cx, job.cz)) { this._local.pop(); continue; }
            if (this._workers && !this._rebuilding.has(job.key)) {
                // (made in a worker too, from this computer's changed chunks round it: a whole chunk's mesh made
                // here took a flight over a crater or a magic house 20–40 ms a frame)
                this._local.pop();
                let entry = this.pool.pop();
                if (!entry) entry = this._newEntry();
                entry.cx = job.cx;
                entry.cz = job.cz;
                this.meshes.set(job.key, entry);
                this._sendRebuild(job.key, entry, !this.data.chunks.has(job.key));
                if (performance.now() - t0 > budget) break;
                continue;
            }
            const miss = this._missingGround(job.cx, job.cz);
            if (miss) this.data.chunk(miss[0], miss[1]);
            else { this._local.pop(); this._load(job); }
            if (performance.now() - t0 > budget) break;
        }
    }

    get radiusChunks() {
        return Math.ceil(this.viewDistance / CHUNK);
    }

    /** Build every chunk around a point right now (loading screen). */
    flushAround(x, z) {
        this._center = null;
        this._plan(x, z);
        while (this._queue.length) this._load(this._queue.pop());
        this.data.dirtyChunks.clear();
    }

    /**
     * The same as flushAround, for the loading screen: every chunk within the view
     * distance, nearest first, giving the page a breath every ~40 ms so the
     * progress bar moves (the game starts with the whole visible world built,
     * not streaming hundreds of far chunks during the first seconds of play).
     * @param {(done:number)=>void} [onProgress] 0..1
     */
    async flushAroundAsync(x, z, onProgress = () => {}) {
        this._center = null;
        this._plan(x, z);
        const total = this._queue.length || 1;
        let t0 = performance.now();
        if (this._workers) {
            // (every worker busy at once: the loading screen is over sooner; the page breathes meanwhile)
            while (this._workers && (this._queue.length || this._inFlight.size || this._done.length || this._local.length)) {
                this._dispatch(this._workers.length * 4);
                while (this._done.length) this._applyBuilt(this._done.shift());
                this._buildLocal(performance.now(), 30);
                onProgress(Math.min(1, this.meshes.size / (total + 1)));
                await new Promise((r) => setTimeout(r, 4));
            }
            this._center = null;
            this._plan(x, z); // (whatever is still missing — the workers failed? — is made here)
        }
        while (this._queue.length) {
            const job = this._queue.pop();
            if (!this.meshes.has(job.key)) this._load(job);
            if (performance.now() - t0 > 40) {
                onProgress(1 - this._queue.length / total);
                await new Promise((r) => setTimeout(r, 0));
                t0 = performance.now();
            }
        }
        this.data.dirtyChunks.clear();
        onProgress(1);
    }

    /**
     * @param {{x:number, z:number}} [focus] player position (default: spawn)
     */
    update(focus) {
        this._frame++;
        const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
        this._plan(fx, fz);

        // 1) Chunks changed by explosions, buildings, a house rising (only the ones we show). With workers:
        // made there from this computer's own data of the changed chunks (sent along), one job a chunk at
        // a time — a chunk changed again meanwhile is sent again when its last one is back.
        let n = 0;
        const tr = performance.now();
        for (const key of this.data.dirtyChunks) {
            const entry = this.meshes.get(key);
            if (!entry) { this.data.dirtyChunks.delete(key); continue; }
            if (this._workers) {
                if (this._rebuilding.has(key)) continue; // (stays dirty: sent again when the answer is back)
                if (n && performance.now() - tr > REBUILD_MS) break; // (the rest next frame: a house's magic never takes the frame)
                n++;
                this.data.dirtyChunks.delete(key);
                this._sendRebuild(key, entry);
                continue;
            }
            this.data.dirtyChunks.delete(key);
            this._build(entry);
            if (++n >= this.maxRebuildsPerFrame) break;
        }
        for (let k = 0; this._rebuilt.length && (k < 2 || performance.now() - tr < 2 * REBUILD_MS); k++) this._applyRebuilt(this._rebuilt.shift());

        // 2) New chunks, nearest first. With workers: they make them, here they only go in (a few
        // milliseconds a frame at most). Without: made here within the time budget — a chunk's mesh
        // needs its ground and its neighbours' (borders, a cave's light); those are made first, one
        // chunk of ground at a time, so one frame never makes the ground of nine chunks and a mesh on top.
        const t0 = performance.now();
        if (this._workers) {
            // (at most a few a frame: each one's buffers go to the video card when it is drawn)
            for (let n = 0; this._done.length && n < 6 && performance.now() - t0 < this.budgetMs; n++) this._applyBuilt(this._done.shift());
            this._dispatch(this._workers.length * 3);
            if (this._local.length) this._buildLocal(t0, this.budgetMs);
        } else {
            while (this._queue.length) {
                const job = this._queue[this._queue.length - 1];
                if (this.meshes.has(job.key)) { this._queue.pop(); continue; }
                const miss = this._missingGround(job.cx, job.cz);
                if (miss) this.data.chunk(miss[0], miss[1]);
                else { this._queue.pop(); this._load(job); }
                if (performance.now() - t0 > this.budgetMs) break;
            }
        }

        if (this._remake?.length || this._remade?.length || this._remakeFlight?.size) this._remakeStep(t0);

        // (generation 5: tall grass and flowers round the player)
        if (this.flora) this.flora.update(focus);

        // 3) Forget far, untouched chunk data now and then (it regenerates identically)
        if (this._frame % 120 === 0) this.data.evictFar(Math.floor(fx / CHUNK), Math.floor(fz / CHUNK), this.radiusChunks + 4);
    }

    /** A chunk round (cx, cz) whose ground is not made yet (its mesh needs all nine), or null. */
    _missingGround(cx, cz) {
        if (!this.data.hasChunk(cx, cz)) return [cx, cz];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.data.hasChunk(cx + dx, cz + dz)) return [cx + dx, cz + dz];
        return null;
    }

    /** Recompute which chunks to show when the player enters another chunk. */
    _plan(x, z) {
        const ccx = Math.floor(x / CHUNK), ccz = Math.floor(z / CHUNK);
        const R = this.radiusChunks;
        if (this._center && this._center.cx === ccx && this._center.cz === ccz && this._center.R === R) return;
        this._center = { cx: ccx, cz: ccz, R };
        // Unload meshes out of range (one extra ring kept to avoid flicker at borders)
        for (const [key, e] of this.meshes) {
            const dx = e.cx - ccx, dz = e.cz - ccz;
            if (dx * dx + dz * dz > (R + 1.5) * (R + 1.5)) this._unload(key, e);
        }
        // Wanted chunks within a circle, nearest last (queue is popped from the end)
        const jobs = [];
        for (let dz = -R; dz <= R; dz++) {
            for (let dx = -R; dx <= R; dx++) {
                const d2 = dx * dx + dz * dz;
                if (d2 > (R + 0.5) * (R + 0.5)) continue;
                const cx = ccx + dx, cz = ccz + dz;
                const key = chunkKey(cx, cz);
                if (!this.meshes.has(key)) jobs.push({ key, cx, cz, d2 });
            }
        }
        jobs.sort((a, b) => b.d2 - a.d2);
        this._queue = jobs;
    }

    _load(job) {
        let entry = this.pool.pop();
        if (!entry) entry = this._newEntry();
        entry.cx = job.cx;
        entry.cz = job.cz;
        this.meshes.set(job.key, entry);
        this._build(entry);
    }

    _unload(key, entry) {
        this.meshes.delete(key);
        entry.ground.visible = false;
        entry.water.visible = false;
        // (a shell in the pool keeps nothing: the chunk's buffers — a third of a megabyte or more each, in the processor's
        // memory and the video card's — go now, not when the shell is used again; a flight over the world left 200–300
        // idle shells holding them. Past a few dozen the shell itself goes.)
        for (const m of [entry.ground, entry.water]) {
            if (m.geometry.attributes.position) { m.geometry.dispose(); m.geometry = new THREE.BufferGeometry(); }
        }
        if (this.pool.length >= POOL_MAX) {
            this.group.remove(entry.ground, entry.water);
            entry.ground.geometry.dispose();
            entry.water.geometry.dispose();
        } else this.pool.push(entry);
        this.stats.unloaded++;
    }

    _build(entry) {
        const t0 = performance.now();
        const c = this.data.chunk(entry.cx, entry.cz);
        c.rev = (c.rev || 0) + 1; // (its ground changed: the flowers and grass on it are made again — Flora.js)
        const arrays = this.data.buildChunkArrays(entry.cx, entry.cz);
        this._fill(entry.ground, mergeBuffers(arrays.ground, arrays.raised));
        this._fill(entry.water, arrays.water);
        const ms = performance.now() - t0;
        this.stats.built++;
        if (ms > this.stats.maxBuildMs) this.stats.maxBuildMs = ms;
    }

    /**
     * A chunk's meshes: its land (the ground and everything on it: one draw — `raised` is the same mesh,
     * for whoever asks by the old name) and its water.
     */
    _newEntry() {
        const land = this._makeMesh(true);
        return { ground: land, raised: land, water: this._makeMesh(false, this.waterMaterial) };
    }

    _makeMesh(raised, material = this.material) {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
        if (material !== this.material) mesh.renderOrder = 1; // water after the ground under it
        mesh.receiveShadow = true;
        mesh.castShadow = raised;
        mesh.matrixAutoUpdate = false;
        mesh.userData.isTerrain = true;
        mesh.visible = false;
        this.group.add(mesh);
        return mesh;
    }

    _fill(mesh, buf) {
        // A fresh geometry each time: resizing attributes of an uploaded one is not allowed
        mesh.geometry.dispose();
        if (buf.indices.length === 0) {
            mesh.geometry = new THREE.BufferGeometry();
            mesh.visible = false;
            return;
        }
        const geo = new THREE.BufferGeometry();
        // (the arrays are the chunk's own typed arrays: used as they are, not copied again)
        geo.setAttribute('position', new THREE.BufferAttribute(buf.positions, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(buf.normals, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(buf.colors, 3));
        // castle stone, planks, roof tiles... (always set: one shader for every chunk)
        geo.setAttribute('voxPat', new THREE.BufferAttribute(buf.patterns, 1));
        geo.setAttribute('voxSky', new THREE.BufferAttribute(buf.skies, 1)); // (daylight reaching it: a cave's dark)
        geo.setIndex(new THREE.BufferAttribute(buf.indices, 1));
        // (its box — worked out in the worker, or here in one pass — and a sphere round the box: three
        // passes over a chunk's ~100 000 points took a frame several milliseconds a chunk)
        const b = buf.bounds || boundsOf(buf.positions);
        geo.boundingBox = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
        geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
        mesh.geometry = geo;
        mesh.visible = true;
    }

    surfaceY(x, z) { return this.data.surfaceY(x, z); }
    topLayer(ix, iz) { return this.data.topLayer(ix, iz); }
    floorBelow(ix, iz, L) { return this.data.floorBelow(ix, iz, L); }
    solidIn(ix, iz, L0, L1) { return this.data.solidIn(ix, iz, L0, L1); }
    ceilingAbove(ix, iz, L) { return this.data.ceilingAbove(ix, iz, L); }
    blockAt(ix, L, iz) { return this.data.get(ix, L, iz); }
    // (slabs and ramps — BlockShapes.js: the floor, the ceiling, a column's top and the solid where they are)
    shapeAt(ix, L, iz) { return this.data.shapeAt(ix, L, iz); }
    floorAt(x, z, reachY) { return this.data.floorAt(x, z, reachY); }
    ceilingY(x, z, headY) { return this.data.ceilingAt(x, z, headY); }
    topNear(ix, iz, px, pz) { return this.data.topNear(ix, iz, px, pz); }
    occupied(x, y, z) { return this.data.occupied(x, y, z); }
    raycast(origin, dir, maxDist) { return this.data.raycast(origin, dir, maxDist); }
    removeSphere(x, y, z, r, keep = null) { return this.data.removeSphere(x, y, z, r, keep); }

    dispose() {
        if (this._workers) for (const w of this._workers) w.terminate();
        this._workers = null;
        this.flora?.dispose();
        for (const e of [...this.meshes.values(), ...this.pool]) {
            e.ground.geometry.dispose();
            e.water.geometry.dispose();
        }
        this.meshes.clear();
        this.pool = [];
        this.material.dispose();
        this.waterMaterial.dispose();
        this.scene.remove(this.group);
    }
}
