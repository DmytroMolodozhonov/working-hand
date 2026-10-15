/**
 * HouseMagicFx.js — how the magic of «Create a House» / «Improve a House» looks (every computer the same).
 *
 *  - the trees round the house come apart one after another (when the host takes each one): a burst of
 *    leaves and light at the tree, and its logs and planks fly in high arcs, turning, into the house;
 *  - the sand melts: glowing orange drops rise from the heap and stream into the windows, where the
 *    glass shimmers pale blue as it sets;
 *  - the wool is spun: white threads fly to the beds and wind round them, faster and faster;
 *  - a pillar of light rises in the middle, flashes, rings of light at the start and at the end.
 *
 * Cheap: the logs and planks are one instanced mesh (at most FLY_MAX at once); everything else goes into
 * the shared particle pools (Effects.glow / sparks) a few particles a frame.
 */

import * as THREE from 'three';
import { MAGIC_TIME } from '../world/MagicHouse.js';

const FLY_MAX = 140;
const PER_TREE = 10; // logs and planks of a tree
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const WOOD = { 6: 0x8b5a2b, 12: 0xe6e0cf, 14: 0x5a3a1e, 16: 0x6b2f2a, 18: 0x3e2716 };

export class HouseMagicFx {
    constructor(scene) {
        this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), FLY_MAX);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.setColorAt(0, _c.setHex(0xffffff));
        this.mesh.count = 0;
        this.mesh.frustumCulled = false;
        this.mesh.castShadow = false;
        scene?.add(this.mesh);
        this.fly = []; // {a: from, b: to, h: arc height, t, dur, sx, sy, sz, spin: Euler speeds, color}
        this.done = new Set(); // trees already burst (index)
        this._id = null;
    }

    /** A new magic: forget the last one's trees. */
    _reset(m) {
        if (this._id === m.id + ':' + m.level) return;
        this._id = m.id + ':' + m.level;
        this.done.clear();
        this._ring(m, 0xfff2c4);
    }

    /** One frame of the magic `m` (fx: Effects). */
    update(m, dt, fx) {
        if (!fx) return;
        this._reset(m);
        const t = m.t;
        const glow = fx.glow, sparks = fx.sparks;
        const rc = m.rect || { x0: m.x - 6, x1: m.x + 6, z0: m.z - 6, z1: m.z + 6 };
        const G = m.y ?? 0;
        // the trees come apart when the host takes them (the same moments: HouseMagic._build)
        const N = m.trees?.length || 0;
        for (let i = 0; i < N; i++) {
            if (this.done.has(i) || t < ((i + 1) * MAGIC_TIME * 0.7) / N) continue;
            this.done.add(i);
            const s = m.trees[i];
            const tx = s.x ?? s[0], ty = s.y ?? s[1], tz = s.z ?? s[2], wood = WOOD[s.wood ?? s[3]] ?? 0x8b5a2b;
            for (let k = 0; k < 24; k++) sparks?.spawn(tx + (Math.random() - 0.5) * 3, ty + Math.random() * 5, tz + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5, k % 3 ? 0x4f9a3a : 0x9fe07a, 0.22, 0.9);
            for (let k = 0; k < 10; k++) glow?.spawn(tx, ty + k * 0.6, tz, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 0xffe08a, 0.45, 0.6, { shrink: 1 });
            fx.lightFlash?.(_v.set(tx, ty + 3, tz), 0xffe9a8, 3, 0.4, 35);
            for (let k = 0; k < PER_TREE; k++) {
                const log = k % 2 === 0;
                const a = new THREE.Vector3(tx + (Math.random() - 0.5), ty - 2 + Math.random() * 5, tz + (Math.random() - 0.5));
                const b = new THREE.Vector3(rc.x0 + 1 + Math.random() * (rc.x1 - rc.x0 - 2), G + 1 + Math.random() * (2 + 7 * t / MAGIC_TIME), rc.z0 + 1 + Math.random() * (rc.z1 - rc.z0 - 2));
                this._launch(a, b, log ? [0.38, 0.38, 2.4] : [1.8, 0.14, 0.6], log ? wood : _c.setHex(wood).lerp(_c.clone().setHex(0xf0d9a8), 0.45).getHex(), 1.3 + Math.random() * 0.9 + k * 0.05);
            }
        }
        // the sand melts into glass: orange drops stream into the windows, the glass shimmers there
        const win = m.win || [];
        for (const s of m.piles || []) {
            const sand = s[3] === 1;
            if (sand && t > 0.8 && t < MAGIC_TIME * 0.8) {
                glow?.spawn(s[0] + (Math.random() - 0.5) * 0.8, s[1] + 0.2, s[2] + (Math.random() - 0.5) * 0.8, 0, 1.2, 0, Math.random() < 0.5 ? 0xff9a2b : 0xffd27a, 0.3, 0.5, { shrink: 1 });
                if (win.length) {
                    const w = win[Math.floor(Math.random() * win.length)], life = 1.1;
                    glow?.spawn(s[0], s[1] + 0.5, s[2], (w[0] - s[0]) / life, (w[1] - s[1] - 0.5) / life, (w[2] - s[2]) / life, 0xff7a1a, 0.32, life, { shrink: 0.3 });
                }
            }
            // the wool is spun into the beds
            if (!sand && t > 1.5 && t < MAGIC_TIME * 0.85 && m.beds?.length) {
                const b = m.beds[Math.floor(Math.random() * m.beds.length)], life = 1.2;
                sparks?.spawn(s[0], s[1] + 0.4, s[2], (b[0] - s[0]) / life, (b[1] + 1 - s[1] - 0.4) / life, (b[2] - s[2]) / life, 0xf6f4ee, 0.16, life);
            }
        }
        if (t > MAGIC_TIME * 0.35) for (const w of win) if (Math.random() < 0.25) glow?.spawn(w[0] + (Math.random() - 0.5) * 1.2, w[1] + (Math.random() - 0.5) * 1.2, w[2] + (Math.random() - 0.5) * 1.2, 0, 0.3, 0, Math.random() < 0.6 ? 0x9fe8ff : 0xffffff, 0.28, 0.45, { shrink: 1 });
        // the threads wind round the beds, faster and faster
        if (t > 3) for (const b of m.beds || []) {
            const sp = 2 + 4 * (t / MAGIC_TIME);
            for (let k = 0; k < 2; k++) {
                const a = t * sp + k * Math.PI + Math.random() * 0.2;
                sparks?.spawn(b[0] + Math.cos(a) * 1.6, b[1] + 0.8 + Math.random() * 0.4, b[2] + Math.sin(a) * 2.6, -Math.sin(a) * sp * 1.6, 0.2, Math.cos(a) * sp * 2.6, k ? 0xffffff : 0xe9e5da, 0.12, 0.45);
            }
        }
        // a pillar of light in the middle
        for (let k = 0; k < 2; k++) glow?.spawn(m.x + (Math.random() - 0.5) * 1.5, G + Math.random() * 2, m.z + (Math.random() - 0.5) * 1.5, 0, 6 + Math.random() * 4, 0, k ? 0xc9a8ff : 0xfff2a8, 0.5, 1.6, { shrink: 0.6 });
        this._step(dt, glow);
    }

    /** A log / a plank flies from a to b in an arc. */
    _launch(a, b, size, color, dur) {
        if (this.fly.length >= FLY_MAX) this.fly.shift();
        this.fly.push({ a, b, h: 5 + Math.random() * 5, t: 0, dur, size, color, rx: (Math.random() - 0.5) * 9, ry: (Math.random() - 0.5) * 9, rz: (Math.random() - 0.5) * 9 });
    }

    /** A ring of light along the ground round the place (the start, the end). */
    _ring(m, color) {
        this._ringAt = { x: m.x, y: m.y ?? 0, z: m.z, color, t: 0 };
    }

    _step(dt, glow) {
        const R = this._ringAt;
        if (R && R.t < 1 && glow) {
            R.t += dt;
            for (let k = 0; k < 6; k++) {
                const a = Math.random() * Math.PI * 2, r = 2 + R.t * 16;
                glow.spawn(R.x + Math.cos(a) * r, R.y + 0.3, R.z + Math.sin(a) * r, Math.cos(a) * 8, 0.5, Math.sin(a) * 8, R.color, 0.45, 0.5, { shrink: 1 });
            }
        }
        let n = 0;
        for (let i = this.fly.length - 1; i >= 0; i--) {
            const f = this.fly[i];
            f.t += dt;
            if (f.t >= f.dur) {
                glow?.spawn(f.b.x, f.b.y, f.b.z, 0, 1, 0, 0xffe9a8, 0.5, 0.35, { shrink: 1.5 });
                this.fly.splice(i, 1);
            }
        }
        for (const f of this.fly) {
            const u = f.t / f.dur, e = u * u * (3 - 2 * u);
            _p.lerpVectors(f.a, f.b, e);
            _p.y += Math.sin(Math.PI * u) * f.h;
            _q.setFromEuler(_e.set(f.rx * f.t, f.ry * f.t, f.rz * f.t));
            const shrink = u > 0.85 ? 1 - (u - 0.85) / 0.15 * 0.7 : 1;
            _s.set(f.size[0] * shrink, f.size[1] * shrink, f.size[2] * shrink);
            this.mesh.setMatrixAt(n, _m.compose(_p, _q, _s));
            this.mesh.setColorAt(n, _c.setHex(f.color));
            n++;
        }
        this.mesh.count = n;
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }

    /** Frames after the magic (the last logs still fly). */
    idle(dt, fx) { if (this.fly.length || this.mesh.count) this._step(dt, fx?.glow); }

    /** The magic ends: a ring and a burst at the windows. */
    finish(m, fx) {
        this._ring(m, 0xc9a8ff);
        for (const w of m?.win || []) for (let k = 0; k < 6; k++) fx?.glow?.spawn(w[0], w[1], w[2], (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0x9fe8ff, 0.35, 0.6, { shrink: 1 });
    }
}
