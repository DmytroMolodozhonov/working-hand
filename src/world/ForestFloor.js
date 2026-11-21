/**
 * ForestFloor.js — draws and keeps the undergrowth of the forest (ForestRules.js where, ForestModel.js how it looks; generation 36).
 *
 * Like RiverRocks: the chunks round the hero get their things a little at a time (≤ 1.5 ms a frame, only where the chunk is already made),
 * far chunks let theirs go. One instanced mesh per shape (17 draw calls in all); the lists are remade only when the hero has moved. Small things
 * (mushrooms, leaves, twigs, flowers) are drawn nearer than the big ones (ferns, bushes, logs): `SHOW`.
 * Solid: logs (a chain of boxes along them), stumps and boulders — the hero and every creature meet them like any solid; you walk through ferns,
 * bushes, flowers, leaves. A thing whose ground is gone (dug, blown away) falls apart (nothing hangs in the air); a blast breaks them
 * (`blast`: the small things are blown away at 3 m, wood and stone at «Bombarda» power, big boulders only from Maxima).
 *
 * Who/what (the author's table): fire and the elements leave it as it is (the fire does not spread to the litter: a decision, not an omission —
 * the forest does not burn from the floor); Ice Queen's ice and the black ship's curse: not touched; not carried by «Levioso» (part of the land).
 */
import * as THREE from 'three';
import { CHUNK } from './Terrain.js';
import { FOREST_FROM_GEN, KINDS, forestOfChunk, boxesOf } from './ForestRules.js';
import { forestGeometry, forestMaterial } from './ForestModel.js';
import { rockGeometry, rockMaterial } from './RockModel.js';

const CAP = 640, RC = 4;
const SHOW = { log: 120, stump: 120, stone: 120, fern: 85, bush: 90, litter: 58, mush: 55, twig: 50, bell: 55 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const WOOD_BITS = [0x6b5236, 0x57432c, 0x7d6544, 0x4d3c28];

export class ForestFloor {
    constructor(game) {
        this.game = game;
        this.chunks = new Map(); // 'cx,cz' → { items: [], ids: [] }
        this.gone = new Set(); // ids of broken things (kept: they stay broken when their chunk comes back)
        this.group = new THREE.Group(); this.group.name = 'forest-floor';
        this.meshes = {}; // 'kind+v' → InstancedMesh
        for (const [k, n] of Object.entries(KINDS)) {
            for (let v = 0; v < n; v++) {
                const m = k === 'stone' ? new THREE.InstancedMesh(rockGeometry(v === 0 ? 6 : 4), rockMaterial(), CAP / 4) : new THREE.InstancedMesh(forestGeometry(k, v), forestMaterial(), CAP);
                m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
                this.group.add(m); this.meshes[k + v] = m;
            }
        }
        game.scene?.add(this.group);
        this._dirty = true; this._at = [1e9, 1e9]; this._check = 0; this._ring = null;
        this.stats = { loaded: 0, drawn: 0 };
    }

    get data() { return this.game.world?.terrain?.data; }
    get on() { const d = this.data; return !!d && this.game.gen >= FOREST_FROM_GEN && !!d.lush; }

    update(dt, focus) {
        if (!this.on || !focus) { if (this.group.visible) this.group.visible = false; return; }
        this.group.visible = true;
        const d = this.data, cx = Math.floor(focus.x / CHUNK), cz = Math.floor(focus.z / CHUNK);
        const t0 = performance.now();
        let made = 0;
        for (const [dx, dz] of this._order()) {
            const key = (cx + dx) + ',' + (cz + dz);
            if (this.chunks.has(key)) continue;
            if (!d.hasChunk(cx + dx, cz + dz)) continue; // (the land is not made yet: wait — never make it here)
            this._load(key, cx + dx, cz + dz);
            made++;
            if (performance.now() - t0 > 1.5) break;
        }
        if (made) this._dirty = true;
        if (this._check-- <= 0) {
            this._check = 30;
            for (const [key, c] of this.chunks) {
                const [kx, kz] = key.split(',').map(Number);
                if (Math.abs(kx - cx) > RC + 1 || Math.abs(kz - cz) > RC + 1) { this._unload(c); this.chunks.delete(key); this._dirty = true; }
            }
            this._support(focus);
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
        const d = this.data, c = d.chunk(cx, cz), items = c ? forestOfChunk(d, c).filter((r) => !this.gone.has(r.id)) : [], ids = [];
        const col = this.game.collision;
        for (const it of items) {
            it.boxes = null;
            if (!col?.addBox) continue;
            const bx = boxesOf(it);
            if (!bx.length) continue;
            it.boxes = bx.map((b) => col.addBox({ ...b, kind: it.k === 'stone' ? 'rock' : 'wood' }));
            ids.push(...it.boxes);
        }
        this.chunks.set(key, { items, ids });
        this.stats.loaded++;
    }

    _unload(c) { const col = this.game.collision; for (const id of c.ids) col?.removeBox?.(id); c.ids.length = 0; }

    _rebuild(focus) {
        this._dirty = false; this._at[0] = focus.x; this._at[1] = focus.z;
        const n = {};
        for (const k of Object.keys(this.meshes)) n[k] = 0;
        let drawn = 0;
        for (const c of this.chunks.values()) {
            for (const it of c.items) {
                if (it.dead) continue;
                const dx = it.x - focus.x, dz = it.z - focus.z, R = SHOW[it.k];
                if (dx * dx + dz * dz > R * R) continue;
                const key = it.k + it.v, mesh = this.meshes[key], cap = it.k === 'stone' ? CAP / 4 : CAP;
                if (n[key] >= cap) continue;
                if (it.k === 'log') { _e.set(0, -it.yaw, 0); _s.set(it.len / 6, it.r / 0.72, it.r / 0.72); _p.set(it.x, it.y, it.z); }
                else if (it.k === 'stump') { _e.set(0, it.yaw, 0); _s.set(it.r, it.h, it.r); _p.set(it.x, it.y, it.z); }
                else if (it.k === 'stone') { _e.set((it.yaw % 1 - 0.5) * 0.3, it.yaw, (it.yaw % 0.7 - 0.35) * 0.3); const sy = it.r * it.squash; _s.set(it.r, sy, it.r); _p.set(it.x, it.y + 0.45 * sy - it.r * 0.1, it.z); }
                else { _e.set(0, it.yaw, 0); _s.set(it.s, it.s, it.s); _p.set(it.x, it.y, it.z); }
                _q.setFromEuler(_e); _m.compose(_p, _q, _s);
                mesh.setMatrixAt(n[key]++, _m); drawn++;
            }
        }
        for (const [k, mesh] of Object.entries(this.meshes)) { mesh.count = n[k]; mesh.instanceMatrix.needsUpdate = true; }
        this.stats.drawn = drawn;
    }

    /** Something whose ground is gone falls apart (checked a few at a time): nothing hangs in the air. */
    _support(focus) {
        const col = this.game.collision; if (!col?.groundY) return;
        let looked = 0;
        for (const c of this.chunks.values()) {
            for (const it of c.items) {
                if (it.dead || ++looked > 60) continue;
                if (Math.abs(it.x - focus.x) > 60 || Math.abs(it.z - focus.z) > 60) continue;
                const g = col.groundY(it.x, it.z);
                if (Number.isFinite(g) && g < it.y - 1.3) this._break(it, c);
            }
        }
    }

    _break(it, c) {
        it.dead = true; this.gone.add(it.id); this._dirty = true;
        if (it.boxes) { for (const id of it.boxes) this.game.collision?.removeBox?.(id); c.ids = c.ids.filter((i) => !it.boxes.includes(i)); it.boxes = null; }
        const fx = this.game.fx, solid = it.k === 'log' || it.k === 'stump' || it.k === 'stone';
        if (fx?.debris && solid) {
            const r = it.r || 1, cols = it.k === 'stone' ? [0x8d8c88, 0x6e6d6a, 0x7f8a70] : WOOD_BITS;
            for (let i = 0; i < Math.min(16, 6 + r * 4); i++) fx.debris.spawn(it.x + (Math.random() - 0.5) * r * 2, it.y + r * 0.6, it.z + (Math.random() - 0.5) * r * 2, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6, cols[i % cols.length], 0.16 + Math.random() * 0.22);
        }
        if (solid) fx?.smoke?.spawn?.(it.x, it.y + 0.6, it.z, 0, 0.8, 0, it.k === 'stone' ? 0xb0aea8 : 0x8a7a64, 1.2);
    }

    /** An explosion at `pos` of `radius` (Bombarda ≈ 6, Maxima more): the small things are blown away from 3 m, wood and stone from 5 m, big boulders from 9 m. */
    blast(pos, radius) {
        if (!this.on || radius < 3) return;
        for (const c of this.chunks.values()) {
            for (const it of c.items) {
                if (it.dead) continue;
                const solid = it.k === 'log' || it.k === 'stump' || it.k === 'stone', reach = radius + (it.r || 0.5);
                const d = Math.hypot(it.x - pos.x, it.z - pos.z);
                if (d > reach || Math.abs(it.y - pos.y) > reach) continue;
                if (solid && radius < 5) continue;
                if (it.k === 'stone' && it.r > 1.8 && radius < 9) continue;
                this._break(it, c);
            }
        }
    }

    /** One of every shape, to compile the shader on the loading screen (Game.prewarm): one material for all (and the boulders' own). */
    sampleModels() {
        return [this.meshes.fern0, this.meshes.stone0].filter(Boolean).map((m) => { const s = new THREE.Mesh(m.geometry, m.material); s.position.set(0, -50, 0); return s; });
    }

    dispose() {
        for (const c of this.chunks.values()) this._unload(c);
        this.chunks.clear(); this.game.scene?.remove(this.group);
        for (const m of Object.values(this.meshes)) m.dispose();
    }
}
