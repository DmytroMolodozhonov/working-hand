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
import { TerrainData, CHUNK, chunkKey } from './Terrain.js';
import { applyVoxelDetail, applySkyComp } from './VoxelShading.js';

/**
 * Terrain = data + THREE meshes for the chunks around the player.
 * update(focus) streams chunks in and out; explosions rebuild only the
 * touched chunks, a couple per frame, so nothing ever causes a hitch.
 */
export class Terrain {
    constructor(scene, { seed = 1, mountains = false, seas = false, test = false, deepCaves = false, lush = false, viewDistance = 112 } = {}) {
        this.scene = scene;
        this.data = new TerrainData();
        this.data.generate({ seed, mountains, seas, test, deepCaves, lush });
        // the sea's top is drawn by the wave surface (src/fx/SeaSurface.js), not by flat block faces
        this.data.skipSeaTop = !!this.data.seas;
        this.material = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111 }));
        this.waterMaterial = applySkyComp(new THREE.MeshPhongMaterial({
            vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
            shininess: 90, specular: 0x88bbff,
        }));
        this.group = new THREE.Group();
        this.group.name = 'terrain';
        this.meshes = new Map(); // chunk key -> {ground, raised, cx, cz}
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
        this._startWorkers({ seed, mountains, seas, test, deepCaves, lush });
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
        } catch (e) {
            this._workers = null;
        }
    }

    /** The workers failed (an old browser): everything is made here from now on. */
    _stopWorkers() {
        if (!this._workers) return;
        for (const w of this._workers) w.terminate();
        this._workers = null;
        this._inFlight.clear();
        this._done.length = 0;
        this._center = null; // (plan again: what was being made is wanted again)
    }

    _onBuilt(w, m) {
        if (m.type !== 'built') return;
        w.load--;
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
        if (!entry) entry = { ground: this._makeMesh(false), raised: this._makeMesh(true), water: this._makeMesh(false, this.waterMaterial) };
        entry.cx = m.cx;
        entry.cz = m.cz;
        this.meshes.set(m.key, entry);
        this._fill(entry.ground, m.arrays.ground);
        this._fill(entry.raised, m.arrays.raised);
        this._fill(entry.water, m.arrays.water);
        this.stats.built++;
        this.stats.byWorkers++;
        const ms = performance.now() - t0;
        if (ms > this.stats.maxApplyMs) this.stats.maxApplyMs = ms;
    }

    /** Chunks next to a changed one: made here, within the time left (their ground first, one chunk at a time). */
    _buildLocal(t0, budget) {
        while (this._local.length) {
            const job = this._local[this._local.length - 1];
            if (this.meshes.has(job.key) || !this._inRange(job.cx, job.cz)) { this._local.pop(); continue; }
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

        // 1) Chunks changed by explosions (only the ones we show)
        let n = 0;
        for (const key of this.data.dirtyChunks) {
            this.data.dirtyChunks.delete(key);
            const entry = this.meshes.get(key);
            if (!entry) continue;
            this._build(entry);
            if (++n >= this.maxRebuildsPerFrame) break;
        }

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
        if (!entry) entry = { ground: this._makeMesh(false), raised: this._makeMesh(true), water: this._makeMesh(false, this.waterMaterial) };
        entry.cx = job.cx;
        entry.cz = job.cz;
        this.meshes.set(job.key, entry);
        this._build(entry);
    }

    _unload(key, entry) {
        this.meshes.delete(key);
        entry.ground.visible = false;
        entry.raised.visible = false;
        entry.water.visible = false;
        this.pool.push(entry);
        this.stats.unloaded++;
    }

    _build(entry) {
        const t0 = performance.now();
        const c = this.data.chunk(entry.cx, entry.cz);
        c.rev = (c.rev || 0) + 1; // (its ground changed: the flowers and grass on it are made again — Flora.js)
        const arrays = this.data.buildChunkArrays(entry.cx, entry.cz);
        this._fill(entry.ground, arrays.ground);
        this._fill(entry.raised, arrays.raised);
        this._fill(entry.water, arrays.water);
        const ms = performance.now() - t0;
        this.stats.built++;
        if (ms > this.stats.maxBuildMs) this.stats.maxBuildMs = ms;
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
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        mesh.geometry = geo;
        mesh.visible = true;
    }

    surfaceY(x, z) { return this.data.surfaceY(x, z); }
    topLayer(ix, iz) { return this.data.topLayer(ix, iz); }
    floorBelow(ix, iz, L) { return this.data.floorBelow(ix, iz, L); }
    solidIn(ix, iz, L0, L1) { return this.data.solidIn(ix, iz, L0, L1); }
    ceilingAbove(ix, iz, L) { return this.data.ceilingAbove(ix, iz, L); }
    blockAt(ix, L, iz) { return this.data.get(ix, L, iz); }
    raycast(origin, dir, maxDist) { return this.data.raycast(origin, dir, maxDist); }
    removeSphere(x, y, z, r, keep = null) { return this.data.removeSphere(x, y, z, r, keep); }

    dispose() {
        if (this._workers) for (const w of this._workers) w.terminate();
        this._workers = null;
        this.flora?.dispose();
        for (const e of [...this.meshes.values(), ...this.pool]) {
            e.ground.geometry.dispose();
            e.raised.geometry.dispose();
            e.water.geometry.dispose();
        }
        this.meshes.clear();
        this.pool = [];
        this.material.dispose();
        this.waterMaterial.dispose();
        this.scene.remove(this.group);
    }
}
