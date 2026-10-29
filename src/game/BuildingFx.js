/**
 * BuildingFx.js — the moving and sounding parts of the settlement buildings (Buildings.js; `def.fx` records):
 *  - 'vanes'  the four sails of a mill: one shape (4 beams, their lattices and cloth, the hub — one draw call), turned round the axle
 *             by the wind; the lowest tip is 8 m over the ground (nobody walks under it), a player who flies into the sweep is
 *             pushed back out; when the axle block is gone (the cap blown up) the sails fall off and are not made again;
 *  - 'bell'   a church's / a chapel's bell in the open belfry: it swings and tolls at dawn, at noon and at dusk (the day's three
 *             hours: 0, 0.375, 0.75 of the 24-minute day), and fast, all the time, while the people of the place are in danger
 *             (`alarm`, from CastleLife.alarm); heard from far (a church 170 m, a chapel 110 m);
 *  - 'smoke'  a chimney's smoke (the smithy's, the bakery's, the tavern's) — a puff now and then, near the player only;
 *  - 'forge'  the anvil: sparks and ringing blows by day, near the player only.
 * Only the near ones exist (made at NEAR, taken away at FAR — nothing piles up over the game); the shape and the material are made once
 * and shared (`sampleModels` → Game.prewarm: the shader is compiled at the start); a few ms a scan, never a long frame.
 */

import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';
import { BLOCK } from '../world/Terrain.js';

const NEAR = { vanes: 260, bell: 200, smoke: 80, forge: 50 };
const FAR_K = 1.25; // (taken away at NEAR × this)
const SAIL_R = 8;
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

/** A box of one colour as a geometry with a vertex colour. */
function cbox(w, h, d, x, y, z, hex, rot = [0, 0, 0]) {
    const g = new THREE.BoxGeometry(w, h, d);
    const col = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return { geo: g, pos: [x, y, z], rot };
}

let _sails = null;
/** The mill's four sails and hub, turning in the XY plane, facing +Z (made once; shared). */
export function sailsGeometry() {
    if (_sails) return _sails;
    const parts = [cbox(1.3, 1.3, 1.3, 0, 0, 0.1, 0x3a2a1a), cbox(0.5, 0.5, 2.2, 0, 0, -0.9, 0x4a3420)];
    for (let k = 0; k < 4; k++) {
        const arm = [];
        const R = SAIL_R;
        arm.push(cbox(0.42, R, 0.34, 0, R / 2, 0, 0x5a3d22)); // the stock
        for (const sx of [0.15, 2.4]) arm.push(cbox(0.14, R - 1.8, 0.16, sx, 1.9 + (R - 1.8) / 2 - 0.2, 0.05, 0x6b4a2a)); // the rails
        for (let y = 2.2; y < R - 0.2; y += 1.25) arm.push(cbox(2.4, 0.12, 0.14, 1.28, y, 0.05, 0x6b4a2a)); // the cross bars
        arm.push(cbox(2.1, (R - 2.8) * 0.82, 0.06, 1.3, 2.4 + (R - 2.8) * 0.41, 0.1, k % 2 ? 0xe4dcc2 : 0xece5cf)); // the cloth
        arm.push(cbox(0.5, 0.5, 0.2, 0, R - 0.1, 0.05, 0x3a2a1a));
        for (const p of arm) {
            // turn the arm round the axle: (x, y) → rotated by k·90°
            const c = Math.cos(k * Math.PI / 2), s = Math.sin(k * Math.PI / 2);
            parts.push({ geo: p.geo, pos: [p.pos[0] * c - p.pos[1] * s, p.pos[0] * s + p.pos[1] * c, p.pos[2]], rot: [0, 0, k * Math.PI / 2] });
        }
    }
    _sails = mergeParts(parts);
    _sails.userData.shared = true;
    return _sails;
}

let _bell = null;
/** A bell: a flared bronze body, a lip ring, a crown, a clapper; and its yoke (a beam with two hangers). */
export function bellGeometry() {
    if (_bell) return _bell;
    const prof = [[0.0, 2.3], [0.35, 2.3], [0.5, 2.1], [0.62, 1.6], [0.78, 1.0], [1.0, 0.45], [1.18, 0.12], [1.28, 0.0], [1.0, 0.0], [0.82, 0.3], [0.5, 0.9], [0.3, 1.5], [0.0, 1.7]];
    const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14);
    const col = new THREE.Color(0xc09a3c), n = lathe.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const y = lathe.attributes.position.getY(i); const k = 0.82 + Math.min(0.3, y * 0.12); a[i * 3] = col.r * k; a[i * 3 + 1] = col.g * k; a[i * 3 + 2] = col.b * k; }
    lathe.setAttribute('color', new THREE.BufferAttribute(a, 3));
    _bell = mergeParts([
        { geo: lathe, pos: [0, -2.3, 0] },
        cbox(0.24, 0.9, 0.24, 0, -1.9, 0, 0x2a2220), // the clapper
        cbox(0.36, 0.36, 0.36, 0, -2.45, 0, 0x2a2220),
        cbox(3.2, 0.3, 0.3, 0, 0.15, 0, 0x4a3320), // the yoke
        cbox(0.24, 0.5, 0.24, -0.9, -0.2, 0, 0x3a2a1a), cbox(0.24, 0.5, 0.24, 0.9, -0.2, 0, 0x3a2a1a),
    ]);
    _bell.userData.shared = true;
    return _bell;
}

export class BuildingFx {
    constructor(game) {
        this.game = game;
        this.active = new Map(); // key → {def, f, k, obj, ...}
        this.gone = new Set(); // sails that fell off for good
        this._scanT = 0;
        this._t = 0;
        this._alarm = new Map(); // site id → seconds of alarm left
        this._puffT = 0;
    }

    get data() { return this.game.world?.terrain?.data || null; }

    /** A sample of each shape for the shader prewarm. */
    sampleModels() { return [new THREE.Mesh(sailsGeometry(), MAT), new THREE.Mesh(bellGeometry(), MAT)]; }

    /** The people of a place are in danger (CastleLife.alarm): its bell tolls fast for a while. */
    alarm(pos, r = 60) {
        const idx = this.data?.sites;
        if (!idx) return;
        for (const def of idx.near(pos.x, pos.z, 90)) if (def.fx?.some((f) => f.k === 'bell')) this._alarm.set(def.id, 14);
    }

    // ------------------------------------------------------------------ scan
    _scan() {
        const idx = this.data?.sites, g = this.game;
        if (!idx) return;
        const me = g.character.group.position;
        const seen = new Set();
        for (const def of idx.near(me.x, me.z, 300)) {
            if (!def.fx?.length) continue;
            def.fx.forEach((f, i) => {
                const d = Math.hypot(f.x - me.x, f.z - me.z);
                const key = def.id + ':' + i;
                if (d < NEAR[f.k] * (this.active.has(key) ? FAR_K : 1)) seen.add(key);
                if (seen.has(key) && !this.active.has(key)) this._make(key, def, f);
            });
        }
        for (const [key, rec] of [...this.active]) if (!seen.has(key)) this._drop(key, rec);
    }

    _make(key, def, f) {
        const g = this.game;
        const rec = { key, def, f, obj: null, spin: Math.random() * 6.28, t: Math.random() * 3, swing: 0, ring: null };
        if (f.k === 'vanes') {
            if (this.gone.has(key) || !this._axle(f)) { this.gone.add(key); return; }
            const grp = new THREE.Group();
            const rotor = new THREE.Mesh(sailsGeometry(), MAT);
            rotor.castShadow = true;
            grp.add(rotor);
            grp.position.set(f.x, f.y, f.z);
            grp.rotation.y = Math.atan2(f.dx, f.dz);
            g.scene.add(grp);
            rec.obj = grp; rec.rotor = rotor;
        } else if (f.k === 'bell') {
            const grp = new THREE.Group(), pivot = new THREE.Group();
            pivot.add(new THREE.Mesh(bellGeometry(), MAT));
            grp.add(pivot);
            const s = f.big ? 1 : 0.62;
            grp.scale.setScalar(s);
            grp.position.set(f.x, f.y + 1.3, f.z);
            grp.rotation.y = Math.atan2(-f.az, f.ax); // (its yoke along the tower's width; it swings across)
            g.scene.add(grp);
            rec.obj = grp; rec.pivot = pivot;
        }
        this.active.set(key, rec);
    }

    _drop(key, rec) {
        if (rec.obj) { this.game.scene.remove(rec.obj); rec.obj.traverse((o) => { if (o.isMesh && !o.geometry.userData?.shared) o.geometry.dispose(); }); }
        this.active.delete(key);
    }

    /** The block the sails' axle stands on (a wooden beam out of the cap) is still there: the mill is whole. */
    _axle(f) {
        const d = this.data;
        if (!d) return true;
        const x = f.x - f.dx * 1.5, z = f.z - f.dz * 1.5;
        const L = Math.floor(f.y + 1.5); // (the layer of the hub)
        for (let dl = -1; dl <= 1; dl++) if (d.get(Math.floor(x + 0.01), L + dl, Math.floor(z + 0.01)) !== BLOCK.AIR) return true;
        return false;
    }

    // ---------------------------------------------------------------- frame
    update(dt) {
        const g = this.game;
        this._t += dt;
        for (const [id, s] of this._alarm) { const n = s - dt; if (n <= 0) this._alarm.delete(id); else this._alarm.set(id, n); }
        this._scanT -= dt;
        if (this._scanT <= 0) { this._scanT = 0.8; this._scan(); }
        const me = g.character.group.position;
        const phase = g.dayCycle ? g.dayPhase() : -1;
        for (const [key, rec] of this.active) {
            const f = rec.f;
            if (f.k === 'vanes') this._vanes(key, rec, dt, me);
            else if (f.k === 'bell') this._bell(rec, dt, me, phase);
        }
        // smoke and the forge: near ones only, a few puffs a second
        this._puffT -= dt;
        if (this._puffT <= 0 && g.fx?.smoke) {
            this._puffT = 0.45;
            const idx = this.data?.sites;
            if (idx) for (const def of idx.near(me.x, me.z, 90)) for (const f of def.fx || []) {
                if (f.k !== 'smoke' && f.k !== 'forge') continue;
                const d = Math.hypot(f.x - me.x, f.z - me.z);
                if (d > NEAR[f.k]) continue;
                if (f.k === 'smoke') {
                    const gr = 150 + Math.floor(Math.random() * 60);
                    g.fx.smoke.spawn(f.x + (Math.random() - 0.5) * (f.r || 1), f.y, f.z + (Math.random() - 0.5) * (f.r || 1), (Math.random() - 0.5) * 0.8 + 0.5, 2 + Math.random(), (Math.random() - 0.5) * 0.8, (gr << 16) | (gr << 8) | gr, 1.1 + Math.random() * 0.8, 3.2 + Math.random() * 1.5, { shrink: -0.3, spin: 1 });
                } else if (!g.isNight) this._anvil(f, d);
            }
        }
    }

    /** The sails turn; they fall when their axle is gone; a flyer in the sweep is pushed out. */
    _vanes(key, rec, dt, me) {
        const f = rec.f, grp = rec.obj;
        rec.axT = (rec.axT || 0) - dt;
        if (rec.axT <= 0) { rec.axT = 1.2; if (!this._axle(f)) { rec.fall = 0.01; this.gone.add(key); } }
        if (rec.fall != null) { // the sails come down (nothing hangs in the air)
            rec.fall += dt * 14; grp.position.y -= rec.fall * dt; grp.rotation.x += dt * 0.8;
            const ground = this.game.collision?.groundAt?.(grp.position.x, grp.position.z, grp.position.y) ?? -1e9;
            if (grp.position.y < ground + SAIL_R * 0.3 || rec.fall > 30) { this._drop(key, rec); }
            return;
        }
        const gust = 0.75 + 0.25 * Math.sin(this._t * 0.31 + f.x * 0.01) + 0.15 * Math.sin(this._t * 1.7);
        rec.spin += dt * (f.speed || 0.5) * gust;
        rec.rotor.rotation.z = rec.spin;
        // a body in the sweep (hero only): inside the disc, within ±0.9 m of its plane — out along the axle's line
        _v.set(me.x - f.x, me.y - f.y, me.z - f.z);
        const along = _v.x * f.dx + _v.z * f.dz; // (the distance in front of the plane; negative: behind it)
        if (Math.abs(along) < 0.9 && Math.hypot(_v.x - f.dx * along, _v.y, _v.z - f.dz * along) < SAIL_R + 0.3) {
            const side = along >= 0 ? 1 : -1, push = 0.9 * side - along;
            this.game.character.group.position.x += f.dx * push; this.game.character.group.position.z += f.dz * push;
        }
    }

    /** The bell: tolls at the day's three hours, and all the time in an alarm. */
    _bell(rec, dt, me, phase) {
        const f = rec.f, def = rec.def;
        // the hours: a toll starts when the day passes its 0, 3rd and 6th eighth (dawn, noon, dusk)
        if (phase >= 0) {
            const slot = Math.floor(phase * 8);
            if (rec.slot != null && slot !== rec.slot && (slot === 0 || slot === 3 || slot === 6)) this._toll(rec, f.big ? 4 : 3, 2.6);
            rec.slot = slot;
        }
        if ((this._alarm.get(def.id) || 0) > 0 && !rec.ring) this._toll(rec, 8, 1.1);
        // the swing: each strike kicks the bell; it decays
        if (rec.ring) {
            rec.ring.gap -= dt;
            if (rec.ring.gap <= 0) {
                rec.swing = f.big ? 0.9 : 0.7;
                this.game.sound?.playBuilding?.(f.big ? 'bell_big' : 'bell_small', _p.set(f.x, f.y, f.z), f.big ? 1.6 : 1.1, f.big ? 30 : 18);
                rec.ring.gap = rec.ring.every; rec.ring.n--;
                if (rec.ring.n <= 0) rec.ring = null;
            }
        }
        rec.swing *= Math.exp(-dt * 0.55);
        rec.t += dt;
        rec.pivot.rotation.x = Math.sin(rec.t * (f.big ? 2.3 : 3.0)) * rec.swing;
    }

    _toll(rec, n, every) { if (!rec.ring) rec.ring = { n, every, gap: 0 }; }

    _anvil(f, d) {
        const g = this.game;
        this._anvilT = (this._anvilT || 0) - 0.45;
        if (this._anvilT > 0) return;
        this._anvilT = 1.2 + Math.random() * 1.4;
        _p.set(f.x + 1.5, f.y + 1.3, f.z);
        g.sound?.playBuilding?.('anvil', _p, 0.8, 7, 0.92 + Math.random() * 0.16);
        if (g.fx?.glow) for (let i = 0; i < 7; i++) g.fx.glow.spawn(_p.x, _p.y, _p.z, (Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4, i % 2 ? 0xffb347 : 0xffe9a8, 0.14, 0.5 + Math.random() * 0.4, { shrink: 0.9, gravity: -6 });
    }

    dispose() { for (const [key, rec] of [...this.active]) this._drop(key, rec); }
}
