/**
 * ShoreFloor.js — draws the small things of the rivers' and lakes' edges (ShoreRules.js where, ShoreModel.js how they look; generation 36).
 * Same way as ForestFloor.js: the chunks round the hero get theirs a little at a time (≤ 1.5 ms a frame, only where the land is made), far chunks let
 * theirs go; one instanced mesh per shape (13 in all); small things are drawn nearer than big ones (`SHOW`). Nothing here is solid: you wade through
 * reeds, step over pebbles, swim past lilies — like through grass. A blast of «Bombarda» power (3 m and up) flattens what lies in its radius
 * (ShoreFloor.blast); the water frozen or taken away is not followed (a lily stays where it floated): a limit, written in docs/rules/shore.md.
 * Fire and the elements leave them as they are (the reeds of the shore do not burn: a decision); not carried by «Levioso» (a part of the land).
 */
import * as THREE from 'three';
import { CHUNK } from './Terrain.js';
import { SHORE_FROM_GEN, SHORE_KINDS, shoreOfChunk } from './ShoreRules.js';
import { shoreGeometry, shoreMaterial } from './ShoreModel.js';

const CAP = 520, RC = 4;
const SHOW = { reed: 100, lily: 90, drift: 80, sedge: 70, iris: 55, marigold: 55, pebbles: 50 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class ShoreFloor {
    constructor(game) {
        this.game = game;
        this.chunks = new Map(); // 'cx,cz' → { items: [] }
        this.gone = new Set();
        this.group = new THREE.Group(); this.group.name = 'shore-floor';
        this.meshes = {};
        for (const [k, n] of Object.entries(SHORE_KINDS)) for (let v = 0; v < n; v++) {
            const m = new THREE.InstancedMesh(shoreGeometry(k, v), shoreMaterial(), CAP);
            m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
            this.group.add(m); this.meshes[k + v] = m;
        }
        game.scene?.add(this.group);
        this._dirty = true; this._at = [1e9, 1e9]; this._check = 0; this._ring = null;
        this.stats = { loaded: 0, drawn: 0 };
    }

    get data() { return this.game.world?.terrain?.data; }
    get on() { const d = this.data; return !!d && this.game.gen >= SHORE_FROM_GEN && !!d.lush; }

    update(dt, focus) {
        if (!this.on || !focus) { if (this.group.visible) this.group.visible = false; return; }
        this.group.visible = true;
        const d = this.data, cx = Math.floor(focus.x / CHUNK), cz = Math.floor(focus.z / CHUNK);
        const t0 = performance.now();
        let made = 0;
        for (const [dx, dz] of this._order()) {
            const key = (cx + dx) + ',' + (cz + dz);
            if (this.chunks.has(key)) continue;
            if (!d.hasChunk(cx + dx, cz + dz)) continue;
            this._load(key, cx + dx, cz + dz);
            made++;
            if (performance.now() - t0 > 1.5) break;
        }
        if (made) this._dirty = true;
        if (this._check-- <= 0) {
            this._check = 30;
            for (const key of [...this.chunks.keys()]) {
                const [kx, kz] = key.split(',').map(Number);
                if (Math.abs(kx - cx) > RC + 1 || Math.abs(kz - cz) > RC + 1) { this.chunks.delete(key); this._dirty = true; }
            }
        }
        if (this._dirty || Math.abs(focus.x - this._at[0]) + Math.abs(focus.z - this._at[1]) > 5) this._rebuild(focus);
    }

    _order() {
        if (this._ring) return this._ring;
        const o = [];
        for (let dz = -RC; dz <= RC; dz++) for (let dx = -RC; dx <= RC; dx++) o.push([dx, dz]);
        o.sort((a, b) => a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1]);
        return (this._ring = o);
    }

    _load(key, cx, cz) {
        const d = this.data, c = d.chunk(cx, cz);
        this.chunks.set(key, { items: c ? shoreOfChunk(d, c).filter((r) => !this.gone.has(r.id)) : [] });
        this.stats.loaded++;
    }

    _rebuild(focus) {
        this._dirty = false; this._at[0] = focus.x; this._at[1] = focus.z;
        const n = {};
        for (const k of Object.keys(this.meshes)) n[k] = 0;
        let drawn = 0;
        for (const c of this.chunks.values()) for (const it of c.items) {
            if (it.dead) continue;
            const dx = it.x - focus.x, dz = it.z - focus.z, R = SHOW[it.k];
            if (dx * dx + dz * dz > R * R) continue;
            const key = it.k + it.v, mesh = this.meshes[key];
            if (n[key] >= CAP) continue;
            _e.set(0, it.yaw, 0); _s.set(it.s, it.s, it.s);
            _p.set(it.x, it.k === 'lily' ? it.surf - 0.1 : it.y - (it.k === 'reed' ? 0.15 : 0.04), it.z); // (lilies float on the surface; the rest stand a little sunk)
            _q.setFromEuler(_e); _m.compose(_p, _q, _s);
            mesh.setMatrixAt(n[key]++, _m); drawn++;
        }
        for (const [k, mesh] of Object.entries(this.meshes)) { mesh.count = n[k]; mesh.instanceMatrix.needsUpdate = true; }
        this.stats.drawn = drawn;
    }

    /** A blast of `radius` ≥ 3 at `pos` flattens the reeds, the lilies and the rest within it (and a little spray). */
    blast(pos, radius) {
        if (!this.on || radius < 3) return;
        let any = false;
        for (const c of this.chunks.values()) for (const it of c.items) {
            if (it.dead) continue;
            if (Math.hypot(it.x - pos.x, it.z - pos.z) > radius + 1) continue;
            it.dead = true; this.gone.add(it.id); any = true;
        }
        if (any) this._dirty = true;
    }

    sampleModels() { const m = this.meshes.reed0; return m ? [(() => { const s = new THREE.Mesh(m.geometry, m.material); s.position.set(0, -50, 0); return s; })()] : []; }

    dispose() {
        this.chunks.clear(); this.game.scene?.remove(this.group);
        for (const m of Object.values(this.meshes)) m.dispose();
    }
}
