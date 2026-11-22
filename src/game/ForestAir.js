/**
 * ForestAir.js — the light and the air of a forest (the author 21.11: «лес не стал настоящим — просто больше растений… свет и воздух»).
 * What a walk in a real forest has, besides plants: the sun falling in shafts through the crowns and lying in spots on the floor (the spots are the trees'
 * own shadows — they were already there), a haze between the trunks that thickens at dawn, motes of pollen and dust turning slowly in the light, and
 * leaves coming down, one by one, tumbling.
 *   haze     the world's fog draws in (World.forestHaze 0…1: far ×0.72, near ×0.5 at most) — the forest is closed and soft, the light milky;
 *            more at dawn (the mist rises off the ground before the sun is high), less at noon.
 *   shafts   7 tall slanted beams of warm light (two crossed planes each, additive, soft along and across), lying along the sun's rays, from the crowns
 *            to the floor, breathing slowly (each swells and fades over ~20 s); the sun low → long and golden, the sun high → short. They stand
 *            round the hero (8…26 m) and are moved to where he goes when they are left behind. Trunks hide them (depth tested).
 *   motes    70 tiny warm specks drifting up and sideways in the beams' neighbourhood, twinkling.
 *   leaves   24 leaves (green, ochre, rust) coming down slowly from the crowns with a sway and a spin, round the hero; they land and go back up as new ones.
 * Only by day, only in a forest (NatureAmbience's habitat — the biome under the hero), not in a storm, a cave or the night; the strength follows
 * `k` (0…1, eased in over ~3 s, so walking in and out of a forest does not switch it on and off). One InstancedMesh per sort (shafts 1, motes 1, leaves 3),
 * no lights, no shadows, ordinary Basic materials: ≈ 100 instances, 5 draw calls.
 * Who/what: nothing touches them (a look); a fight, a spell or a blast does not change them (the haze is the world's).
 */
import * as THREE from 'three';
import { FOREST_FROM_GEN } from '../world/ForestRules.js';

const NS = 7, NM = 70, NL = 8, R_OUT = 26;
const _rot = new THREE.Quaternion(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _up = new THREE.Vector3(0, 1, 0), _ax = new THREE.Vector3();
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

let _shaftTex, _moteTex;
function shaftTexture() {
    if (_shaftTex !== undefined) return _shaftTex;
    if (typeof document === 'undefined') return (_shaftTex = null);
    const W = 64, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const u = i / (W - 1) * 2 - 1, v = j / (H - 1); // v 0 = the top (the crown), 1 = the floor
        const across = Math.pow(Math.max(0, 1 - u * u), 1.6); // soft edges
        const along = smooth(0, 0.14, v) * (1 - smooth(0.62, 1, v)); // in from the leaves, out before the floor (it ends in the haze)
        const streak = 0.78 + 0.22 * Math.sin(u * 17 + v * 3.1) * Math.sin(u * 7.3 - v * 1.7); // (the beam is not a smooth cone: columns of light)
        const a = Math.max(0, across * along * streak);
        const k = (j * W + i) * 4;
        d[k] = 255; d[k + 1] = 240 - 28 * v; d[k + 2] = 196 - 60 * v; d[k + 3] = Math.round(255 * a);
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.userData = { shared: true };
    return (_shaftTex = t);
}
function moteTexture() {
    if (_moteTex !== undefined) return _moteTex;
    if (typeof document === 'undefined') return (_moteTex = null);
    const S = 32, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,246,214,1)'); g.addColorStop(0.35, 'rgba(255,238,190,0.5)'); g.addColorStop(1, 'rgba(255,230,170,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c); t.userData = { shared: true };
    return (_moteTex = t);
}

function quadGeometry(w, h, anchorTop) { // a plane in x/y; `anchorTop`: the top edge at the origin and the plane hangs along −y
    const g = new THREE.PlaneGeometry(w, h);
    if (anchorTop) g.translate(0, -h / 2, 0);
    g.userData.shared = true; g.userData.keep = true;
    return g;
}
function leafGeometry() { // a small leaf: an oval of six triangles, a vein's fold down the middle
    const pos = [], nor = [];
    const P = [[0, 0.12, 0], [0.07, 0.04, 0.012], [0.06, -0.06, 0.01], [0, -0.12, 0], [-0.06, -0.06, 0.01], [-0.07, 0.04, 0.012]];
    for (let i = 0; i < 6; i++) { const a = [0, 0.02, -0.006], b = P[i], c = P[(i + 1) % 6]; for (const p of [a, b, c]) { pos.push(p[0] * 2.2, p[1] * 2.2, p[2] * 2.2); nor.push(0, 0, 1); } }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.userData.shared = true; g.userData.keep = true;
    return g;
}

export class ForestAir {
    constructor(game) {
        this.game = game;
        this.group = new THREE.Group(); this.group.name = 'forest-air';
        const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
        shaftMat.userData.shared = true; shaftMat.userData.keep = true; this.shaftMat = shaftMat;
        this.shafts = new THREE.InstancedMesh(quadGeometry(1, 1, true), shaftMat, NS * 2); this.shafts.count = 0; this.shafts.frustumCulled = false; this.shafts.renderOrder = 3;
        const moteMat = new THREE.MeshBasicMaterial({ map: moteTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
        moteMat.userData.shared = true; moteMat.userData.keep = true; this.moteMat = moteMat;
        this.motes = new THREE.InstancedMesh(quadGeometry(0.22, 0.22, false), moteMat, NM); this.motes.count = 0; this.motes.frustumCulled = false; this.motes.renderOrder = 4;
        const lg = leafGeometry();
        this.leafMeshes = [0x5f9a2c, 0xc2902c, 0xa4521f].map((c) => { const m = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, fog: true }); m.userData.shared = true; m.userData.keep = true; const im = new THREE.InstancedMesh(lg, m, NL); im.count = 0; im.frustumCulled = false; return im; });
        for (const m of [this.shafts, this.motes, ...this.leafMeshes]) this.group.add(m);
        game.scene?.add(this.group);
        this.k = 0; this.t = 0;
        this.S = Array.from({ length: NS }, () => ({ x: 0, z: 0, w: 4, ph: Math.random() * 40, speed: 0.04 + Math.random() * 0.04, placed: false, yaw: Math.random() * 3.14 }));
        this.M = Array.from({ length: NM }, () => ({ x: 0, y: 0, z: 0, ph: Math.random() * 20, v: 0.1 + Math.random() * 0.2, placed: false }));
        this.L = Array.from({ length: NL * 3 }, (_, i) => ({ x: 0, y: 0, z: 0, ph: Math.random() * 20, spin: 1 + Math.random() * 2, fall: 0.5 + Math.random() * 0.5, kind: i % 3, placed: false }));
    }

    get data() { return this.game.world?.terrain?.data; }
    get on() { const d = this.data; return !!d && this.game.gen >= FOREST_FROM_GEN && !!d.lush; }

    /** The strength 0…1 this moment's weather and hour would give a forest. */
    strength(night, dawn, storm) { return Math.max(0, 1 - night * 1.6) * (1 - Math.min(1, storm * 1.5)); }

    update(dt, pos) {
        const g = this.game, w = g.world;
        const inForest = this.on && !!pos && !g._inCave && !g.space?.offEarth && !!g.nature?.habitat?.forest;
        dt = Math.min(dt, 0.1); this.t += dt;
        const night = w._night ?? (g.isNight ? 1 : 0), storm = w.storm || 0;
        const ph = g.dayPhase ? g.dayPhase() : 0.3, dawn = Math.max(0, 1 - ph / 0.22);
        const want = inForest ? this.strength(night, dawn, storm) : 0;
        this.k += (want - this.k) * Math.min(1, dt * 0.5); // (eased in over ~3 s)
        if (w) w.forestHaze = inForest ? this.k * (0.55 + 0.45 * dawn) : this.k * 0.55 * (w.forestHaze ? 1 : 0); // (the world's fog reads it)
        if (this.k < 0.01) { if (this.group.visible) { this.group.visible = false; this.shafts.count = this.motes.count = 0; for (const m of this.leafMeshes) m.count = 0; if (w) w.forestHaze = 0; } return; }
        this.group.visible = true;
        const sun = this._sun(w);
        const elev = Math.max(0.12, sun.y);
        this.shaftMat.opacity = 0.34 * this.k * smooth(0.1, 0.4, sun.y) * 1;
        this.moteMat.opacity = 0.75 * this.k * smooth(0.05, 0.3, sun.y);
        const H = this.data.heightAt;
        // ---- the shafts: along the sun's rays, from the crowns to the floor
        const len = 22 / Math.max(0.35, elev) * 0.55, lenC = Math.min(34, len), top = 15;
        let n = 0;
        for (const s of this.S) {
            if (!s.placed || Math.hypot(s.x - pos.x, s.z - pos.z) > R_OUT + 8) { const a = Math.random() * 6.28, r = 8 + Math.random() * (R_OUT - 8); s.x = pos.x + Math.cos(a) * r; s.z = pos.z + Math.sin(a) * r; s.w = 3.2 + Math.random() * 3.6; s.placed = true; s.ph = Math.random() * 40; }
            const life = 0.5 + 0.5 * Math.sin(this.t * s.speed * 6.28 + s.ph); // (each swells and fades over ~20 s)
            const sc = Math.max(0.0001, life * life);
            H(Math.round(s.x), Math.round(s.z));
            const gy = H(Math.round(s.x), Math.round(s.z)) - 0.5, y0 = gy + top;
            // the beam hangs from (x, y0, z) along −sun, `lenC` long: plane axes — y along the beam
            _ax.set(-sun.x, -sun.y, -sun.z).normalize();
            _q.setFromUnitVectors(_up.set(0, -1, 0), _ax); _up.set(0, 1, 0);
            for (let c = 0; c < 2; c++) {
                const rot = _rot.setFromAxisAngle(_ax, c * Math.PI / 2 + s.yaw);
                _p.set(s.x, y0, s.z); _s.set(s.w * (0.7 + 0.3 * life), lenC * (0.6 + 0.4 * life), 1);
                _e.set(0, 0, 0); const qq = rot.multiply(_q);
                _m.compose(_p, qq, _s); this.shafts.setMatrixAt(n++, _m);
            }
            void sc;
        }
        this.shafts.count = n; this.shafts.instanceMatrix.needsUpdate = true;
        // ---- motes
        let m = 0;
        for (const q of this.M) {
            if (!q.placed || Math.hypot(q.x - pos.x, q.z - pos.z) > R_OUT + 6 || q.y > pos.y + 14) {
                const a = Math.random() * 6.28, r = Math.random() * R_OUT; q.x = pos.x + Math.cos(a) * r; q.z = pos.z + Math.sin(a) * r; q.y = H(Math.round(q.x), Math.round(q.z)) - 0.5 + 0.5 + Math.random() * 9; q.placed = true;
            }
            q.x += Math.sin(this.t * 0.31 + q.ph) * 0.18 * dt + 0.12 * dt; q.z += Math.cos(this.t * 0.27 + q.ph * 1.3) * 0.15 * dt; q.y += q.v * dt * 0.5;
            const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.t * 1.3 + q.ph * 3));
            _p.set(q.x, q.y, q.z); _s.setScalar(0.5 + tw);
            _q.identity(); _m.compose(_p, _q, _s); this.motes.setMatrixAt(m++, _m);
        }
        this.motes.count = m; this.motes.instanceMatrix.needsUpdate = true;
        // ---- leaves: down from the crowns, a sway and a spin, landing, new ones from above
        const cnt = [0, 0, 0];
        const camQ = g.camera?.quaternion;
        for (const l of this.L) {
            if (!l.placed || Math.hypot(l.x - pos.x, l.z - pos.z) > R_OUT) { const a = Math.random() * 6.28, r = Math.random() * R_OUT; l.x = pos.x + Math.cos(a) * r; l.z = pos.z + Math.sin(a) * r; l.y = H(Math.round(l.x), Math.round(l.z)) - 0.5 + 4 + Math.random() * 12; l.placed = true; }
            l.ph += dt;
            l.y -= l.fall * dt; l.x += Math.sin(l.ph * 1.1 + l.spin) * 0.7 * dt + 0.2 * dt; l.z += Math.cos(l.ph * 0.9) * 0.6 * dt;
            const gy = H(Math.round(l.x), Math.round(l.z)) - 0.5;
            if (l.y < gy + 0.1) { l.y = gy + 11 + Math.random() * 6; l.x = pos.x + (Math.random() - 0.5) * 2 * R_OUT * 0.8; l.z = pos.z + (Math.random() - 0.5) * 2 * R_OUT * 0.8; }
            const kind = l.kind; if (cnt[kind] >= NL) continue;
            _e.set(Math.sin(l.ph * l.spin) * 1.1, l.ph * l.spin * 0.8, Math.cos(l.ph * 1.7 * l.spin) * 0.9); _q.setFromEuler(_e);
            _p.set(l.x, l.y, l.z); _s.setScalar(0.9 + 0.4 * ((l.spin - 1) / 2)); _m.compose(_p, _q, _s);
            this.leafMeshes[kind].setMatrixAt(cnt[kind]++, _m);
        }
        for (let i = 0; i < 3; i++) { this.leafMeshes[i].count = Math.round(cnt[i] * Math.min(1, this.k * 1.5)); this.leafMeshes[i].instanceMatrix.needsUpdate = true; }
        void camQ;
    }

    /** The sun's direction (unit, towards the sun): by day the real one; a fixed high morning one when the world has no day (a tool's frozen sky). */
    _sun(w) {
        const s = w._sunTrue;
        const v = this._v || (this._v = new THREE.Vector3(0.45, 0.62, 0.35));
        if (s && (w._night ?? 0) < 0.6) v.copy(s);
        else if (w.dirLight) v.copy(w.dirLight.position).sub(w.dirLight.target.position);
        if (v.lengthSq() < 1e-6) v.set(0.45, 0.62, 0.35);
        return v.normalize();
    }

    /** One of each, to compile the shaders on the loading screen (Game.prewarm). */
    sampleModels() {
        return [this.shafts, this.motes, this.leafMeshes[0]].map((im) => { const s = new THREE.Mesh(im.geometry, im.material); s.position.set(0, -50, 0); return s; });
    }

    dispose() { this.game.scene?.remove(this.group); for (const m of [this.shafts, this.motes, ...this.leafMeshes]) m.dispose(); }
}
