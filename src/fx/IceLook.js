/**
 * IceLook.js — how «Айс» looks.
 *
 *   flight   a spinning ice crystal flies at the head of a frosty beam: two thin frost threads
 *            wind round the beam, snowflakes drift off it and fall, cold mist trails the crystal
 *   burst    where it ends it bursts into ice shards that fall and fade, with a puff of frost
 *   frozen   a creature it hits is locked in a block of ice with spikes (it follows the body;
 *            when the time is up the ice cracks and falls apart)
 * Visual only: what the spell does is decided in Duel.js.
 */

import * as THREE from 'three';
import { SegmentPool } from './Particles.js';

/** Seconds a creature stays in the ice; a wizard frozen in Creative (in the free world: Combat's FREEZE_TIME). */
export const ICE = { CREATURE_T: 8, CREATIVE_T: 5, GROW: 0.25 };

const _Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3();

let S = null;
function shared() {
    if (S) return S;
    const spike = new THREE.ConeGeometry(1, 1, 5);
    spike.translate(0, 0.5, 0); // (grows out of its base)
    S = {
        oct: new THREE.OctahedronGeometry(1, 0),
        spike,
        block: new THREE.IcosahedronGeometry(1, 1),
        halo: new THREE.SphereGeometry(1, 12, 8),
        crystal: new THREE.MeshPhongMaterial({ color: 0xd8f6ff, emissive: 0x3a8fc0, specular: 0xffffff, shininess: 150, transparent: true, opacity: 0.85, flatShading: true }),
        halo2: new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
        block2: new THREE.MeshPhongMaterial({ color: 0xbfe9ff, emissive: 0x1d4a66, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.5, flatShading: true, depthWrite: false }),
    };
    return S;
}

/** Unit vectors across `dir` (into s and u). */
function across(dir, s, u) {
    s.set(-dir.z, 0, dir.x);
    if (s.lengthSq() < 1e-4) s.set(1, 0, 0);
    s.normalize();
    u.crossVectors(dir, s).normalize();
}

export class IceLook {
    /** @param {object} game  {scene, fx} */
    constructor(game) {
        this.game = game;
        this.heads = [];
        this.used = 0;
        this.blocks = []; // creatures locked in ice
        this.t = 0;
    }

    get on() { return !!this.game.scene; }

    _frost() {
        return this.frost || (this.frost = new SegmentPool(this.game.scene, { capacity: 480, radius: 0.018, color: 0xeefcff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    }

    /**
     * One frame of a flying «Айс» from the hand to its head (`head`: draw the crystal there —
     * not where two charges push against each other: the duel's marker is there).
     * `life`: how long the drawn threads live (one frame).
     */
    beam(from, to, life, head = true) {
        if (!this.on) return;
        const fx = this.game.fx, dt = Math.min(0.05, life);
        const len = from.distanceTo(to);
        if (len < 0.05) return;
        const dir = _d.subVectors(to, from).divideScalar(len);
        across(dir, _s, _u);
        // two frost threads winding round the beam (turning as it flies)
        const frost = this._frost();
        const n = Math.max(6, Math.min(70, Math.round(len * 7)));
        for (let k = 0; k < 2; k++) {
            for (let i = 0; i <= n; i++) {
                const t = i / n;
                const ang = this.t * 9 + t * len * 2.6 + k * Math.PI;
                const r = 0.11 * Math.min(1, t * len / 0.6); // (tight at the hand)
                const p = _a.copy(from).lerp(to, t).addScaledVector(_s, Math.cos(ang) * r).addScaledVector(_u, Math.sin(ang) * r);
                if (i) frost.add(_p, p, life);
                _p.copy(p);
            }
        }
        // snowflakes drift off the beam and fall (about 12 a second for each metre)
        let flakes = len * 12 * dt;
        flakes = Math.floor(flakes) + (Math.random() < flakes % 1 ? 1 : 0);
        for (let i = 0; i < flakes; i++) {
            const p = _a.copy(from).lerp(to, Math.random());
            fx.sparks?.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, -0.2 - Math.random() * 0.4, (Math.random() - 0.5) * 0.6,
                Math.random() < 0.5 ? 0xffffff : 0xcdefff, 0.04 + Math.random() * 0.05, 1.0 + Math.random() * 0.8, { shrink: 0.3, spin: 3, gravity: -1.2 });
        }
        if (!head) return;
        // cold mist trailing the crystal, a glint now and then
        if (Math.random() < dt * 40) fx.smoke?.spawn(to.x, to.y, to.z, -dir.x * 1.5 + (Math.random() - 0.5), -dir.y * 1.5 + (Math.random() - 0.5) * 0.5, -dir.z * 1.5 + (Math.random() - 0.5), 0xe8f8ff, 0.18 + Math.random() * 0.12, 0.45, { shrink: -1.2, spin: 1 });
        if (Math.random() < dt * 25) fx.glow?.spawn(to.x, to.y, to.z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0xffffff, 0.08, 0.2, { shrink: 3 });
        this._head(to, dir);
    }

    /** The spinning crystal at the head of the beam. */
    _head(p, dir) {
        let h = this.heads[this.used];
        if (!h) {
            const g = shared();
            h = new THREE.Group();
            const main = new THREE.Mesh(g.oct, g.crystal);
            main.scale.set(0.1, 0.34, 0.1);
            h.add(main);
            for (let i = 0; i < 4; i++) {
                const side = new THREE.Mesh(g.oct, g.crystal);
                side.scale.set(0.045, 0.16, 0.045);
                const a = (i / 4) * Math.PI * 2;
                side.position.set(Math.cos(a) * 0.08, -0.08, Math.sin(a) * 0.08);
                side.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
                h.add(side);
            }
            const halo = new THREE.Mesh(g.halo, g.halo2);
            halo.scale.setScalar(0.3);
            h.add(halo);
            h.userData.halo = halo;
            h.renderOrder = 5;
            this.game.scene.add(h);
            this.heads.push(h);
        }
        this.used++;
        h.visible = true;
        h.position.copy(p);
        h.quaternion.setFromUnitVectors(_Y, dir);
        h.rotateY(this.t * 11);
        h.userData.halo.scale.setScalar(0.3 * (1 + 0.15 * Math.sin(this.t * 23)));
    }

    /** The charge leaves the hand: a ring of frost and a puff of snow ahead. */
    cast(origin, dir) {
        if (!this.on) return;
        const fx = this.game.fx;
        const d = _v.copy(dir).normalize();
        across(d, _s, _u);
        for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2, c = Math.cos(a) * 3.5, s = Math.sin(a) * 3.5;
            fx.glow?.spawn(origin.x, origin.y, origin.z, _s.x * c + _u.x * s + d.x, _s.y * c + _u.y * s + d.y, _s.z * c + _u.z * s + d.z, i % 3 ? 0xbfefff : 0xffffff, 0.12, 0.3, { shrink: 2.5 });
        }
        for (let i = 0; i < 14; i++) {
            const sp = 2 + Math.random() * 4;
            fx.sparks?.spawn(origin.x, origin.y, origin.z, (d.x + (Math.random() - 0.5) * 0.8) * sp, (d.y + (Math.random() - 0.5) * 0.8) * sp, (d.z + (Math.random() - 0.5) * 0.8) * sp,
                0xffffff, 0.05 + Math.random() * 0.04, 0.9, { shrink: 0.4, spin: 3, gravity: -2 });
        }
        fx.lightFlash?.(origin, 0x9fe6ff, 2.5, 0.3, 14);
    }

    /** It ends here: ice shards fly apart and fall, frost puffs out. `k`: how big. */
    shatter(p, k = 1) {
        if (!this.on) return;
        const fx = this.game.fx;
        for (let i = 0; i < Math.round(26 * k); i++) {
            const a = Math.random() * Math.PI * 2, sp = (2.5 + Math.random() * 5.5) * Math.sqrt(k);
            fx.shards?.spawn(p.x + (Math.random() - 0.5) * 0.3 * k, p.y + (Math.random() - 0.5) * 0.3 * k, p.z + (Math.random() - 0.5) * 0.3 * k,
                Math.cos(a) * sp, 1.5 + Math.random() * 5, Math.sin(a) * sp, Math.random() < 0.3 ? 0xffffff : 0xbfeaff, (0.12 + Math.random() * 0.22) * Math.sqrt(k), 1.0 + Math.random() * 0.6, { shrink: 0.2, fade: true, spin: 9 });
        }
        for (let i = 0; i < Math.round(18 * k); i++) fx.glow?.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 6, (Math.random() - 0.3) * 5, (Math.random() - 0.5) * 6, i % 2 ? 0xffffff : 0x9fe6ff, 0.1, 0.35, { shrink: 2 });
        for (let i = 0; i < Math.round(7 * k); i++) fx.smoke?.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2, 0xe8f8ff, 0.35 * k, 0.8, { shrink: -1, spin: 1 });
        fx.lightFlash?.(p, 0x8fdcff, 3.5, 0.35, 18);
    }

    /**
     * Lock a creature in ice for `T` seconds. body(out) → {center (Vector3), rx, ry} of the
     * creature now, or null when it is gone (the ice breaks at once).
     */
    encase(key, body, T) {
        if (!this.on) return;
        const now = body(_a);
        if (!now) return;
        const old = this.blocks.find((b) => b.key === key);
        if (old) { old.T = Math.max(old.T, old.t + T); return; }
        const g = shared();
        const group = new THREE.Group();
        const mat = g.block2.clone();
        const block = new THREE.Mesh(g.block, mat);
        block.scale.set(now.rx, now.ry, now.rx);
        group.add(block);
        // crystal spikes stick out of it every way
        for (let i = 0; i < 11; i++) {
            const u = _u.set(Math.random() * 2 - 1, Math.random() * 1.6 - 0.6, Math.random() * 2 - 1).normalize();
            const spike = new THREE.Mesh(g.spike, g.crystal);
            spike.position.set(u.x * now.rx * 0.85, u.y * now.ry * 0.85, u.z * now.rx * 0.85);
            spike.quaternion.setFromUnitVectors(_Y, _v.set(u.x / now.rx, u.y / now.ry, u.z / now.rx).normalize());
            const w = (0.07 + Math.random() * 0.08) * now.rx;
            spike.scale.set(w, (0.22 + Math.random() * 0.3) * now.rx, w);
            group.add(spike);
        }
        group.position.copy(now.center);
        group.scale.setScalar(0.01);
        group.renderOrder = 4;
        this.game.scene.add(group);
        this.blocks.push({ key, body, group, mat, t: 0, T, size: Math.max(now.rx, now.ry) });
        this.shatter(now.center, 0.6);
    }

    /** Is this creature in the ice now? */
    has(key) { return this.blocks.some((b) => b.key === key); }

    /** Every frame, after the charges were drawn. */
    update(dt) {
        this.t += dt;
        for (let i = this.used; i < this.heads.length; i++) this.heads[i].visible = false;
        this.used = 0;
        this.frost?.update(dt);
        for (const b of [...this.blocks]) {
            b.t += dt;
            const now = b.body(_a);
            if (now) b.group.position.copy(now.center);
            if (!now || b.t >= b.T) { this._break(b); continue; }
            const grow = Math.min(1, b.t / ICE.GROW);
            b.group.scale.setScalar(0.01 + 0.99 * (1 - (1 - grow) * (1 - grow)));
            // the last second: it clouds over and cracks
            b.mat.opacity = 0.5 + 0.25 * Math.max(0, 1 - (b.T - b.t));
        }
    }

    _break(b) {
        this.blocks.splice(this.blocks.indexOf(b), 1);
        this.game.scene.remove(b.group);
        b.mat.dispose();
        this.shatter(b.group.position, Math.min(2, 0.6 + b.size * 0.4));
    }
}
