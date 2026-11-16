/**
 * RiverRocks.js — draws and keeps the boulders by the rivers (RockRules.js where, RockModel.js how they look).
 *
 * The chunks round the hero get their boulders a little at a time (≤ 1.5 ms a frame; only where the land is made already), far chunks let
 * theirs go. Drawing: one instanced mesh per shape (8 draw calls in all), the lists remade only when the hero has moved. Each boulder is
 * solid: a box inside it (a small one is a step to climb over, a big one a wall to go round or jump on); the boxes of far chunks are removed.
 * A boulder whose ground is gone (blown away, dug out) falls and breaks into a spray of stones; a strong blast breaks one (`blast`).
 *
 * Who/what (the author's table): the hero and every creature meet the box like any solid; fire and the elements leave stone as it is;
 * a blast of «Bombarda» power and up breaks a boulder within its radius (big ones need Maxima); the Ice Queen's ice, the black ship's curse:
 * not touched (stone). Not carried by «Levioso»: it is a part of the land.
 */
import * as THREE from 'three';
import { ROCK, ROCKS_FROM_GEN, rocksOfChunk } from './RockRules.js';
import { rockGeometry, rockMaterial } from './RockModel.js';

const CAP = 260, RC = 7, FAR = 118; // instances a shape; chunk radius to keep; metres drawn
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class RiverRocks {
    constructor(game) {
        this.game = game;
        this.chunks = new Map(); // 'cx,cz' → { rocks: [], ids: [] }
        this.gone = new Set(); // the ids of boulders broken (kept: they stay broken when their chunk comes back)
        this.group = new THREE.Group(); this.group.name = 'river-rocks';
        this.meshes = [];
        for (let v = 0; v < ROCK.VARIANTS; v++) {
            const m = new THREE.InstancedMesh(rockGeometry(v), rockMaterial(), CAP);
            m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true;
            this.group.add(m); this.meshes.push(m);
        }
        game.scene?.add(this.group);
        this._dirty = true; this._at = [1e9, 1e9]; this._check = 0; this._ring = null;
    }

    get data() { return this.game.world?.terrain?.data; }
    get on() { const d = this.data; return !!d && this.game.gen >= ROCKS_FROM_GEN && !!d.lush; }

    update(dt, focus) {
        if (!this.on || !focus) { if (this.group.visible) this.group.visible = false; return; }
        this.group.visible = true;
        const d = this.data, cx = Math.floor(focus.x / ROCK.CHUNK), cz = Math.floor(focus.z / ROCK.CHUNK);
        // new chunks, nearest first, a little each frame
        const t0 = performance.now();
        let made = 0;
        for (const [dx, dz] of this._order()) {
            const key = (cx + dx) + ',' + (cz + dz);
            if (this.chunks.has(key)) continue;
            const x = (cx + dx) * ROCK.CHUNK + 8, z = (cz + dz) * ROCK.CHUNK + 8;
            if (d.landMade && d.landMade(Math.round(x), Math.round(z)) === false) continue; // (the land is not made yet: wait — never make it here)
            this._load(key, cx + dx, cz + dz);
            made++;
            if (performance.now() - t0 > 1.5) break;
        }
        if (made) this._dirty = true;
        // far chunks let go
        if (this._check-- <= 0) {
            this._check = 30;
            for (const [key, c] of this.chunks) {
                const [kx, kz] = key.split(',').map(Number);
                if (Math.abs(kx - cx) > RC + 2 || Math.abs(kz - cz) > RC + 2) { this._unload(c); this.chunks.delete(key); this._dirty = true; }
            }
            this._support(focus);
        }
        if (this._dirty || Math.abs(focus.x - this._at[0]) + Math.abs(focus.z - this._at[1]) > 6) this._rebuild(focus);
    }

    _order() {
        if (this._ring) return this._ring;
        const o = [];
        for (let dz = -RC; dz <= RC; dz++) for (let dx = -RC; dx <= RC; dx++) o.push([dx, dz]);
        o.sort((a, b) => a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1]);
        return (this._ring = o);
    }

    _load(key, cx, cz) {
        const rocks = rocksOfChunk(this.data, cx, cz).filter((r) => !this.gone.has(r.id)), ids = [];
        const col = this.game.collision;
        for (const r of rocks) {
            r.box = null;
            if (!col?.addBox) continue;
            const w = r.r * 0.62, hgt = Math.max(0.5, r.r * r.squash * 1.05);
            r.box = col.addBox({ minX: r.x - w, maxX: r.x + w, minY: r.y, maxY: r.y + hgt, minZ: r.z - w, maxZ: r.z + w, kind: 'rock' });
            ids.push(r.box);
        }
        this.chunks.set(key, { rocks, ids });
    }

    _unload(c) { const col = this.game.collision; for (const id of c.ids) col?.removeBox?.(id); c.ids.length = 0; }

    _rebuild(focus) {
        this._dirty = false; this._at[0] = focus.x; this._at[1] = focus.z;
        const n = new Array(ROCK.VARIANTS).fill(0), F2 = FAR * FAR;
        for (const c of this.chunks.values()) {
            for (const r of c.rocks) {
                if (r.dead) continue;
                const dx = r.x - focus.x, dz = r.z - focus.z;
                if (dx * dx + dz * dz > F2) continue;
                const mesh = this.meshes[r.v];
                if (n[r.v] >= CAP) continue;
                const sy = r.r * r.squash;
                _e.set(r.tilt, r.yaw, r.tilt * 0.6); _q.setFromEuler(_e);
                _p.set(r.x, r.y + 0.45 * sy - r.r * 0.1, r.z); _s.set(r.r, sy, r.r);
                _m.compose(_p, _q, _s);
                mesh.setMatrixAt(n[r.v]++, _m);
            }
        }
        for (let v = 0; v < ROCK.VARIANTS; v++) { this.meshes[v].count = n[v]; this.meshes[v].instanceMatrix.needsUpdate = true; }
    }

    /** A boulder whose ground is gone falls apart (checked a few at a time): nothing hangs in the air. */
    _support(focus) {
        const col = this.game.collision; if (!col?.groundY) return;
        let looked = 0;
        for (const c of this.chunks.values()) {
            for (const r of c.rocks) {
                if (r.dead || ++looked > 40) continue;
                if (Math.abs(r.x - focus.x) > 60 || Math.abs(r.z - focus.z) > 60) continue;
                const g = col.groundY(r.x, r.z);
                if (Number.isFinite(g) && g < r.y - 1.3) this._break(r, c);
            }
        }
    }

    _break(r, c) {
        r.dead = true; this.gone.add(r.id); this._dirty = true;
        if (r.box != null) { this.game.collision?.removeBox?.(r.box); c.ids = c.ids.filter((i) => i !== r.box); r.box = null; }
        const fx = this.game.fx;
        if (fx?.debris) for (let i = 0; i < Math.min(14, 5 + r.r * 3); i++) fx.debris.spawn(r.x, r.y + r.r * 0.4, r.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6, [0x8d8c88, 0x6e6d6a, 0xa09e98][i % 3], 0.18 + Math.random() * 0.2);
        fx?.smoke?.spawn?.(r.x, r.y + r.r * 0.5, r.z, 0, 0.8, 0, 0xb0aea8, 1.4);
    }

    /** An explosion at `pos` of `radius` (Bombarda ≈ 6, Maxima more): boulders within it break — the big ones only from a big blast. */
    blast(pos, radius) {
        if (!this.on || radius < 5) return;
        for (const c of this.chunks.values()) {
            for (const r of c.rocks) {
                if (r.dead) continue;
                const d = Math.hypot(r.x - pos.x, r.z - pos.z);
                if (d > radius + r.r || Math.abs(r.y - pos.y) > radius + r.r) continue;
                if (r.kind === 'big' && radius < 9) continue;
                this._break(r, c);
            }
        }
    }

    sampleModels() { return this.meshes.slice(0, 2).map((m) => { const s = new THREE.Mesh(m.geometry, m.material); s.position.set(0, -50, 0); return s; }); }

    dispose() {
        for (const c of this.chunks.values()) this._unload(c);
        this.chunks.clear(); this.game.scene?.remove(this.group);
        for (const m of this.meshes) m.dispose();
    }
}
