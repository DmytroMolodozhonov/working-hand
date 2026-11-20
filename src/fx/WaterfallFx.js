/**
 * WaterfallFx.js — what a waterfall does to the air round it (Waterfalls.js builds it, UltraWater draws the sheet): the spray that rises where
 * it lands (a pale cloud that drifts off with the wind and drops that bounce out of the pool), a few drops thrown off the face, the roar
 * (louder the nearer and the bigger), and, in sun with the water in front of it, a rainbow in the mist.
 * Only the falls within SPRAY m make spray (a pool of particles shared with every other effect: no new objects); the sound follows the nearest.
 */
import * as THREE from 'three';
import { ULTRA } from './UltraUniforms.js';
import { WaterFlow } from './WaterFlow.js';
import { BLOCK } from '../world/Terrain.js';

const SPRAY = 70, HEAR = 110, SEARCH = 0.4; // m, m, s between the searches
const _v = new THREE.Vector3();

export class WaterfallFx {
    constructor(game) { this.game = game; this.list = []; this.breaches = []; this._t = 0; this._acc = 0; this.k = 0; this.bow = null; }

    get data() { return this.game.world?.terrain?.data; }

    breach(p) {
        if (!p || ![p.x, p.z, p.l, p.bottom].every(Number.isInteger) || p.bottom >= p.l) return;
        this.breaches.push({ ...p, life: Math.min(12, Math.max(2.6, p.duration || 3.5)), age: 0, start: { x: p.x, y: p.l - .5, z: p.z }, end: { x: p.x, y: p.l - 1.3, z: p.z } });
        if (this.breaches.length > 6) this.breaches.shift();
    }

    _breachFlow(dt, focus) {
        if (!this.breaches.length) {
            if (this.stream?.mesh.visible) { this.stream.begin(dt); this.stream.end(); }
            return 0;
        }
        const d = this.data;
        let loud = 0;
        this.stream ||= new WaterFlow(this.game.scene, { maxVerts: 4200, radial: 8, light: .42 });
        this.stream.begin(dt);
        for (let i = this.breaches.length - 1; i >= 0; i--) {
            const p = this.breaches[i];
            p.age += dt; p.life -= dt;
            if (p.life <= 0) { this.breaches.splice(i, 1); continue; }
            const dist = Math.hypot(p.x - focus.x, p.z - focus.z, (p.l - focus.y) * .7);
            if (dist >= SPRAY || !d?.landMade(p.x, p.z)) continue;
            if (d.get(p.x, p.l + 1, p.z) !== BLOCK.WATER) p.life = Math.min(.35, p.life);
            let floor = p.l;
            while (floor > Math.max(p.bottom, p.l - 32) && d.get(p.x, floor, p.z) === BLOCK.AIR) floor--;
            const t = d.get(p.x, floor, p.z), top = p.start.y;
            const bottom = Math.min(top, t === BLOCK.WATER ? d.waterFaceY(p.x, floor, p.z) : floor - .5);
            if (top - bottom < .7) continue;
            const fade = Math.min(1, p.age * 5, p.life * 1.8);
            p.end.y = Math.max(bottom, top - 3 * p.age - 9 * p.age ** 2);
            this.stream.stream(p.start, p.end, .34 * fade, { lift: 0, wave: .05, strands: 0, speed: 13, foam: .44 });
            loud = Math.max(loud, fade * (1 - dist / SPRAY) * .7);
            if (Math.random() < dt * 28 * fade) {
                const fx = this.game.fx;
                fx?.smoke?.spawn(p.x, p.end.y + .2, p.z, 0, .8, 0, 0xb6d4e4, .35, .8, { shrink: -.15, gravity: 0 });
                fx?.spark?.(_v.set(p.x + (Math.random() - .5) * .7, p.end.y, p.z), 0xd0edff, .08, _a(Math.random() * 3 - 1.5, 2.7, Math.random() * 3 - 1.5), .55);
            }
        }
        this.stream.end();
        return loud;
    }

    update(dt, focus, natural = true) {
        const g = this.game, d = this.data;
        if (!d || !focus) return;
        const breachLoud = this._breachFlow(dt, focus);
        if (!natural || !d.falls || g.gen < 32) {
            this.k += (breachLoud - this.k) * Math.min(1, dt * 3);
            g.sound?.fallHum?.(this.k);
            this._rainbow(0);
            return;
        }
        this._t -= dt;
        if (this._t <= 0) { this._t = SEARCH; this.list = d.falls.around(focus.x, focus.z, HEAR); }
        let loud = breachLoud, near = null, nd = 1e9;
        for (const p of this.list) {
            const dx = focus.x - p.x, dz = focus.z - p.z, dist = Math.hypot(dx, dz);
            const size = p.kind === 'great' ? 1 : p.kind === 'fall' ? 0.7 : 0.4;
            loud = Math.max(loud, size * Math.pow(Math.max(0, 1 - dist / HEAR), 1.6));
            if (dist < nd) { nd = dist; near = p; }
            if (dist < SPRAY) this._spray(p, dt, 1 - dist / SPRAY, size);
        }
        // (inside a thick wall of the roar the hero is wet: nothing to do for that here)
        this.k += (loud - this.k) * Math.min(1, dt * 3);
        g.sound?.fallHum?.(this.k);
        this._rainbow(near && nd < 90 ? near : null, nd);
    }

    _spray(p, dt, near, size) {
        const fx = this.game.fx; if (!fx) return;
        this._acc += dt * (5 + 10 * near) * size;
        const n = Math.floor(this._acc); this._acc -= n;
        const tx = -p.nz, tz = p.nx, half = Math.max(1, p.sw / 2);
        for (let i = 0; i < n; i++) {
            const v = (Math.random() * 2 - 1) * (half + 0.5), out = 0.6 + Math.random() * 2.2 * (0.5 + size);
            const x = p.fxAt.x - p.nx * out + tx * v, z = p.fxAt.z - p.nz * out + tz * v;
            // the mist: pale, big, slow, rises and drifts off the fall
            fx.smoke?.spawn(x, 0.2 + Math.random() * 0.8, z, -p.nx * (0.5 + Math.random()) + (Math.random() - 0.5), 1.2 + Math.random() * 1.8 * size, -p.nz * (0.5 + Math.random()) + (Math.random() - 0.5), [0xc4dde8, 0xb6d2e0, 0xcfe4ee][i % 3], 0.45 + Math.random() * 0.7 * size, 1.4 + Math.random() * 1.2, { shrink: -0.25, gravity: 0 });
            // a drop thrown up from the pool
            if (Math.random() < 0.5) fx.spark?.(_v.set(x, 0.1, z), 0xeaf8ff, 0.07 + Math.random() * 0.07, _a(-p.nx * 2 + (Math.random() - 0.5) * 3, 2 + Math.random() * 4 * size, -p.nz * 2 + (Math.random() - 0.5) * 3), 0.7);
        }
        // (a few drops flung off the face, high up the sheet)
        if (Math.random() < dt * 3 * size) {
            const v = (Math.random() * 2 - 1) * half, y = 1 + Math.random() * Math.max(2, p.H - 1);
            fx.spark?.(_v.set(p.fxAt.x - p.nx * 0.2 + tx * v, y, p.fxAt.z - p.nz * 0.2 + tz * v), 0xffffff, 0.06, _a(-p.nx * 2, -1, -p.nz * 2), 0.8);
        }
    }

    /** A faint rainbow in the mist of a big fall when the sun is behind the hero and the water in front: drawn as a thin arc of a few coloured strips. */
    _rainbow(p, dist = 0) {
        const g = this.game, want = !!p && p.kind === 'great' && !g.isNight && ULTRA.sunVis.value > 0.6 && !(g.weather?.rain > 0.1);
        if (!want) { if (this.bow) this.bow.visible = false; return; }
        if (!this.bow) this.bow = this._makeBow();
        const k = Math.min(1, (90 - dist) / 40);
        this.bow.visible = k > 0.05;
        this.bow.position.set(p.x - p.nx * 3, 0, p.z - p.nz * 3);
        this.bow.rotation.y = Math.atan2(-p.nx, -p.nz);
        this.bow.scale.setScalar(Math.max(3, p.H * 0.55));
        for (const m of this.bow.userData.mats) m.opacity = 0.09 * k;
    }

    _makeBow() {
        const grp = new THREE.Group(), mats = [], cols = [0xff5a4a, 0xffa646, 0xffe85a, 0x6ed46a, 0x4aa8ff, 0x8a62ff];
        cols.forEach((c, i) => {
            const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, fog: false });
            mats.push(m);
            const ring = new THREE.Mesh(new THREE.RingGeometry(1 - i * 0.022, 1 - i * 0.022 + 0.022, 48, 1, 0, Math.PI), m);
            ring.renderOrder = 5; grp.add(ring);
        });
        grp.userData.mats = mats; grp.visible = false;
        this.game.scene?.add(grp);
        return grp;
    }

    dispose() { this.stream?.dispose(); if (this.bow) { this.game.scene?.remove(this.bow); this.bow.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); this.bow = null; } this.game.sound?.fallHum?.(0); }
}
const _a3 = new THREE.Vector3();
function _a(x, y, z) { return _a3.set(x, y, z); }
