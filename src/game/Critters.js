/**
 * Critters.js — the small flying life round the hero (the author 21.11: «лес и берега — много мелких деталей»): butterflies in the forest and on the
 * meadows by day, dragonflies darting over the water by day, fireflies drifting by the water and in the forest at night. Not creatures of the game
 * (nothing hits, hurts, is hit or is carried) — a look, like the grass: no collision, no net, each computer has its own.
 *
 * Cheap: ≤ 8 butterflies, ≤ 5 dragonflies, ≤ 14 fireflies; one InstancedMesh per sort (butterflies in four colours = four meshes, dragonflies one,
 * fireflies one), the matrices composed here (27 in all); the wings flap by the width of the instance; shaders are the ordinary Lambert/Basic ones.
 * They come when the hero is in the habitat (`NatureAmbience.habitat`: a forest, water near) and the hour fits; they go (shrink, fade) when it does not.
 * Who/what: a blast or a spell does not touch them (they are a look: they flit off by themselves when a hero runs through).
 */
import * as THREE from 'three';
import { SHORE_FROM_GEN } from '../world/ShoreRules.js';

const NB = 8, ND = 5, NF = 14;
const BUT = [[0.96, 0.96, 0.9, 0.3, 0.3, 0.3], [0.98, 0.9, 0.3, 0.5, 0.42, 0.1], [0.95, 0.5, 0.12, 0.12, 0.08, 0.06], [0.4, 0.6, 0.95, 0.12, 0.14, 0.3]]; // [body-side colour…edge]
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

function butterflyGeometry(c) {
    // two wings (fore + hind each side) as flat quads from the body; body a thin dark sliver — all in vertex colours
    const pos = [], col = [], nor = [];
    const tri = (a, b, d, ca, cb, cd) => { for (const [p, k] of [[a, ca], [b, cb], [d, cd]]) { pos.push(p[0], p[1], p[2]); nor.push(0, 1, 0); col.push(k[0], k[1], k[2]); } };
    const inner = [c[0], c[1], c[2]], edge = [c[3], c[4], c[5]];
    for (const sd of [-1, 1]) {
        tri([0, 0, 0.05], [sd * 0.32, 0, 0.2], [sd * 0.14, 0, -0.05], inner, edge, inner); // fore wing
        tri([0, 0, 0.05], [sd * 0.3, 0, 0.0], [sd * 0.34, 0, 0.2], inner, edge, edge);
        tri([0, 0, 0], [sd * 0.24, 0, -0.26], [sd * 0.08, 0, -0.3], inner, edge, inner); // hind wing
    }
    const dark = [0.12, 0.1, 0.08];
    tri([-0.02, 0.01, 0.16], [0.02, 0.01, 0.16], [0, 0.01, -0.22], dark, dark, dark);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere(); g.userData.shared = true; g.userData.keep = true;
    return g;
}
function dragonflyGeometry() {
    const pos = [], col = [], nor = [];
    const tri = (a, b, d, k) => { for (const p of [a, b, d]) { pos.push(p[0], p[1], p[2]); nor.push(0, 1, 0); col.push(k[0], k[1], k[2]); } };
    const body = [0.12, 0.45, 0.7], head = [0.15, 0.3, 0.35], wing = [0.82, 0.9, 0.96];
    // a long thin body (a flat strip, a dark head), four narrow clear wings
    tri([-0.025, 0, 0.18], [0.025, 0, 0.18], [0, 0, -0.5], body);
    tri([-0.04, 0.01, 0.22], [0.04, 0.01, 0.22], [0, 0.01, 0.14], head);
    for (const sd of [-1, 1]) for (const z of [0.12, 0.02]) { tri([0, 0.01, z], [sd * 0.4, 0.01, z + 0.07], [sd * 0.4, 0.01, z - 0.05], wing); tri([0, 0.01, z], [sd * 0.4, 0.01, z - 0.05], [0, 0.01, z - 0.1], wing); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere(); g.userData.shared = true; g.userData.keep = true;
    return g;
}
function fireflyGeometry() {
    const g = new THREE.OctahedronGeometry(0.09, 0); g.userData.shared = true; g.userData.keep = true; return g;
}

export class Critters {
    constructor(game) {
        this.game = game;
        this.group = new THREE.Group(); this.group.name = 'critters';
        const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); mat.userData.shared = true; mat.userData.keep = true;
        this.butterflies = BUT.map((c) => { const m = new THREE.InstancedMesh(butterflyGeometry(c), mat, NB); m.count = 0; m.frustumCulled = false; this.group.add(m); return m; });
        this.dragon = new THREE.InstancedMesh(dragonflyGeometry(), mat, ND); this.dragon.count = 0; this.dragon.frustumCulled = false; this.group.add(this.dragon);
        const fm = new THREE.MeshBasicMaterial({ color: 0xd8ff6a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }); fm.userData.shared = true; fm.userData.keep = true;
        this.flies = new THREE.InstancedMesh(fireflyGeometry(), fm, NF); this.flies.count = 0; this.flies.frustumCulled = false; this.group.add(this.flies);
        game.scene?.add(this.group);
        this.list = []; // { kind, x, y, z, vx, vz, tx, tz, h, ph, spd, life, sort }
        this.t = 0; this._spawn = 0;
    }

    get data() { return this.game.world?.terrain?.data; }
    get on() { const d = this.data; return !!d && this.game.gen >= SHORE_FROM_GEN && !!d.lush; }

    /** How many of each sort are wanted now (hour, place, weather). */
    wants(night, hab, storm) {
        if (storm > 0.4) return { b: 0, d: 0, f: 0 };
        if (night) return { b: 0, d: 0, f: hab.water ? NF : hab.forest ? Math.floor(NF * 0.6) : 0 };
        return { b: hab.forest || hab.meadow ? NB : 0, d: hab.water ? ND : 0, f: 0 };
    }

    update(dt, pos) {
        if (!this.on || !pos || this.game._inCave) { if (this.group.visible) this.group.visible = false; return; }
        this.group.visible = true;
        dt = Math.min(dt, 0.1); this.t += dt;
        const g = this.game, hab = g.nature?.habitat || {}, night = !!g.isNight, storm = g.storm?.raining ? 1 : 0;
        const h2 = { forest: hab.forest, water: hab.water, meadow: !hab.forest && this.data.biomeAt && this.data.biomeAt(Math.round(pos.x), Math.round(pos.z)) === 0 };
        const want = this.wants(night, h2, storm);
        const have = { b: 0, d: 0, f: 0 };
        for (const c of this.list) have[c.kind]++;
        // new ones come one at a time (a little way off, out of the first look), the unwanted fade away
        this._spawn -= dt;
        if (this._spawn <= 0) {
            this._spawn = 0.35;
            for (const kind of ['b', 'd', 'f']) if (have[kind] < want[kind]) { this._add(kind, pos, h2); break; }
        }
        const d = this.data, H = d.heightAt;
        for (let i = this.list.length - 1; i >= 0; i--) {
            const c = this.list[i];
            c.ph += dt * c.flap;
            const dx = pos.x - c.x, dz = pos.z - c.z, far = dx * dx + dz * dz;
            const unwanted = have[c.kind] > want[c.kind];
            c.life = unwanted || far > 46 * 46 ? c.life - dt * 0.8 : Math.min(1, c.life + dt * 1.2);
            if (c.life <= 0) { this.list.splice(i, 1); have[c.kind]--; continue; }
            // wander: a heading that drifts, a new goal now and then, the hero's quick run makes them flit away
            c.tt -= dt;
            if (c.tt <= 0) { c.tt = 1.2 + Math.random() * 3; const a = Math.random() * 6.28, r = 3 + Math.random() * 10; c.tx = c.x + Math.cos(a) * r; c.tz = c.z + Math.sin(a) * r; c.hh = c.kind === 'd' ? 0.8 + Math.random() * 1.8 : c.kind === 'f' ? 0.6 + Math.random() * 3 : 0.8 + Math.random() * 2.6; if (c.kind === 'd' && Math.random() < 0.4) c.pause = 0.4 + Math.random() * 1.2; }
            if (c.pause > 0) { c.pause -= dt; } else {
                const gx = c.tx - c.x, gz = c.tz - c.z, gl = Math.hypot(gx, gz) || 1;
                const spd = c.spd * (c.kind === 'b' ? 0.7 + 0.5 * Math.sin(c.ph * 0.5) ** 2 : 1);
                c.vx += (gx / gl * spd - c.vx) * Math.min(1, dt * (c.kind === 'd' ? 5 : 2)); c.vz += (gz / gl * spd - c.vz) * Math.min(1, dt * (c.kind === 'd' ? 5 : 2));
                c.x += c.vx * dt; c.z += c.vz * dt;
            }
            // height: over the ground (butterflies, fireflies) or over the water (dragonflies)
            H(Math.round(c.x), Math.round(c.z));
            const base = H.water > 0 ? (H.water + (H.sea ? 0 : 0)) : 0, ground = H(Math.round(c.x), Math.round(c.z)) - 0.5 + (H.water > 0 ? H.water : 0);
            const wobble = c.kind === 'b' ? Math.sin(c.ph * 0.9) * 0.35 : c.kind === 'f' ? Math.sin(c.ph * 0.5) * 0.5 : Math.sin(c.ph * 0.3) * 0.12;
            const wantY = ground + c.hh + wobble; void base;
            c.y += (wantY - c.y) * Math.min(1, dt * 3);
        }
        this._draw();
    }

    _add(kind, pos, hab) {
        const a = Math.random() * 6.28, r = 12 + Math.random() * 14;
        let x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
        if ((kind === 'd' || (kind === 'f' && hab.water && Math.random() < 0.7)) && hab.water) { x = hab.water.x + (Math.random() - 0.5) * 8; z = hab.water.z + (Math.random() - 0.5) * 8; }
        const H = this.data.heightAt; H(Math.round(x), Math.round(z));
        if (H.sea) return;
        const ground = H(Math.round(x), Math.round(z)) - 0.5 + (H.water > 0 ? H.water : 0);
        this.list.push({ kind, x, y: ground + 1.5, z, vx: 0, vz: 0, tx: x, tz: z, tt: 0, hh: 1.5, ph: Math.random() * 10, flap: kind === 'b' ? 11 : kind === 'd' ? 60 : 3, spd: kind === 'b' ? 1.7 : kind === 'd' ? 6 : 0.9, life: 0.01, pause: 0, sort: Math.floor(Math.random() * BUT.length) });
    }

    _draw() {
        const nb = new Array(BUT.length).fill(0); let nd = 0, nf = 0;
        const t = this.t;
        for (const c of this.list) {
            const sz = Math.min(1, c.life), ang = Math.atan2(c.vx, c.vz);
            if (c.kind === 'b') {
                const flap = 0.2 + 0.8 * Math.abs(Math.cos(c.ph));
                _e.set(Math.sin(c.ph * 0.4) * 0.2, ang, 0); _s.set(sz * 1.5 * flap, sz * 1.5, sz * 1.5); _p.set(c.x, c.y, c.z);
                _q.setFromEuler(_e); _m.compose(_p, _q, _s);
                if (nb[c.sort] < NB) this.butterflies[c.sort].setMatrixAt(nb[c.sort]++, _m);
            } else if (c.kind === 'd') {
                _e.set(0.05 * Math.sin(c.ph * 0.2), ang, 0); _s.set(sz * 1.6, sz * 1.6 * (0.9 + 0.1 * Math.sin(c.ph)), sz * 1.6); _p.set(c.x, c.y, c.z);
                _q.setFromEuler(_e); _m.compose(_p, _q, _s);
                if (nd < ND) this.dragon.setMatrixAt(nd++, _m);
            } else {
                const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + c.ph * 2), lit = pulse * pulse; // (a firefly glows in pulses)
                _e.set(0, 0, 0); _s.setScalar(sz * (0.15 + 1.05 * lit)); _p.set(c.x, c.y, c.z);
                _q.setFromEuler(_e); _m.compose(_p, _q, _s);
                if (nf < NF) this.flies.setMatrixAt(nf++, _m);
            }
        }
        for (let i = 0; i < BUT.length; i++) { this.butterflies[i].count = nb[i]; this.butterflies[i].instanceMatrix.needsUpdate = true; }
        this.dragon.count = nd; this.dragon.instanceMatrix.needsUpdate = true;
        this.flies.count = nf; this.flies.instanceMatrix.needsUpdate = true;
    }

    /** One of each, to compile the shaders on the loading screen (Game.prewarm). */
    sampleModels() {
        return [this.butterflies[0], this.flies].map((m) => { const s = new THREE.Mesh(m.geometry, m.material); s.position.set(0, -50, 0); return s; });
    }

    dispose() { this.game.scene?.remove(this.group); for (const m of [...this.butterflies, this.dragon, this.flies]) m.dispose(); }
}
