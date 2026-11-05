/**
 * SeaFloor.js — the life of the sea's bottom round the player (the sea update, the author 05.11: «подводный мир океана: растения,
 * светящиеся, рыбы»): what grows there and the fish schools. Scenery only — no network (the same plants on every computer from the
 * world's seed; the fish each computer's own), nothing harms, nothing is saved.
 *
 * Plants (only on the sea's bottom, never a lake: TerrainData.isSeaColumn; ≥ 2 m of water), by the depth and a hash of the place:
 *   kelp      tall golden-brown ribbons with blades along them, nearly to the surface, swaying in the swell (the deep);
 *   seagrass  tufts of thin green blades bending in the current (the shallows);
 *   corals    staghorn (branching, pink / orange / violet tips), sea fans (a lattice in a plane, red / purple), brain corals (domes
 *             with winding grooves) — each one tinted a little its own way;
 *   glow      anemones (a ring of tentacles glowing cyan / violet / green) and sea lilies (a bell of light on a stalk): they light
 *             the dark water, brighter at night, their light breathing.
 * Fish: a few schools (FISH.SCHOOLS × FISH.PER) of small fish of one look each (silver-blue, yellow-striped, red), swimming together,
 * turning together, darting off from a person who comes near, their tails beating (the video card bends them).
 *
 * Cheap: one draw per kind (InstancedMesh; ~8 draws in all), the sway and the tails moved by the video card, the plants placed a few
 * cells a frame (≤ BUDGET ms) when the player has moved CELL·1.5 m, round him only (R m); shapes made once; nothing grows with time.
 */
import * as THREE from 'three';
import { MODEL_KIT as K } from '../game/AnimalModels.js';
import { mergeParts } from '../core/MergeGeometry.js';
import { waterAt } from '../game/CreatureSwim.js';

export const FLOOR = { R: 56, CELL: 8, PER_CELL: 6, BUDGET: 1.2, CAP: { kelp: 500, grass: 1400, staghorn: 260, fan: 200, brain: 200, anemone: 260, lily: 160 } };
export const FISH = { SCHOOLS: 5, PER: 36, R: 48, NEAR: 9 };

function h01(a, b, c) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/**
 * The plants of a cell (cx, cz): [{kind, x, z, s (size), rot, tint}] — before the water is checked (depthOf decides). Pure.
 * `depthOf(x, z)` → the water's depth there (m) or 0 (no sea).
 */
export function cellPlants(cx, cz, seed, depthOf) {
    const out = [];
    const C = FLOOR.CELL;
    const n = Math.floor(h01(cx, cz, seed + 501) * (FLOOR.PER_CELL + 1));
    for (let i = 0; i < n; i++) {
        const r = (q) => h01(cx * 13 + i * 7 + q, cz * 17 + q, seed + 502);
        const x = cx * C + r(1) * C, z = cz * C + r(2) * C;
        const d = depthOf(x, z);
        if (d < 2) continue;
        const k = r(3);
        let kind;
        if (d <= 5) kind = k < 0.55 ? 'grass' : k < 0.72 ? 'staghorn' : k < 0.82 ? 'brain' : k < 0.9 ? 'fan' : 'anemone';
        else kind = k < 0.4 ? 'kelp' : k < 0.58 ? 'grass' : k < 0.68 ? 'staghorn' : k < 0.76 ? 'fan' : k < 0.82 ? 'brain' : k < 0.92 ? 'anemone' : 'lily';
        const s = kind === 'kelp' ? Math.max(2, d - 1 - r(4) * 2.5) : kind === 'grass' ? 0.6 + r(4) * 0.9 : kind === 'lily' ? 1 + r(4) * 1.2 : 0.7 + r(4) * 0.9;
        out.push({ kind, x, z, s, rot: r(5) * Math.PI * 2, tint: r(6) });
    }
    return out;
}

// ------------------------------------------------------------------ the shapes (made once)
const _geo = {};
const ribbon = (h, w, segs, twist, color) => {
    const g = new THREE.PlaneGeometry(w, h, 1, segs);
    g.translate(0, h / 2, 0);
    const P = g.getAttribute('position'), col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
        const y = P.getY(i) / h, x = P.getX(i);
        const a = y * twist, c = Math.cos(a), s = Math.sin(a);
        P.setXYZ(i, x * c, P.getY(i), x * s + Math.sin(y * 9) * 0.04);
        const k = color(y, x / w);
        col[i * 3] = k[0]; col[i * 3 + 1] = k[1]; col[i * 3 + 2] = k[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
};
function kelpGeo() {
    // a stipe (a thin twisting ribbon) and blades alternating up it, ruffled at their edges — height 1 (scaled to the water)
    const parts = [{ geo: ribbon(1, 0.03, 24, 3, (y) => [0.36 + 0.1 * y, 0.32 + 0.08 * y, 0.12]) }];
    for (let i = 0; i < 9; i++) {
        const y = 0.12 + i * 0.095, side = i % 2 ? 1 : -1;
        parts.push({ geo: ribbon(0.16, 0.06, 6, 1.2, (v, u) => { const e = Math.abs(u) * 2; return [0.42 + 0.18 * v - 0.08 * e, 0.38 + 0.12 * v - 0.06 * e, 0.1 + 0.04 * v]; }), pos: [side * 0.035, y, 0], rot: [0, i * 0.7, side * 0.9] });
    }
    return mergeParts(parts);
}
function grassGeo() {
    const parts = [];
    for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2, r = 0.05 + (i % 3) * 0.03, h = 0.7 + (i * 37 % 10) / 30;
        parts.push({ geo: ribbon(h, 0.035, 8, 0.6, (y) => [0.16 + 0.22 * y, 0.42 + 0.3 * y, 0.14 + 0.08 * y]), pos: [Math.cos(a) * r, 0, Math.sin(a) * r], rot: [Math.cos(a) * 0.25, a, Math.sin(a) * 0.25] });
    }
    return mergeParts(parts);
}
function branchGeo(rng, depth, len, rad, out, m, tipCol) {
    const geo = new THREE.CylinderGeometry(rad * 0.65, rad, len, 6, 3);
    geo.translate(0, len / 2, 0);
    const P = geo.getAttribute('position'), col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
        const t = (4 - depth + P.getY(i) / len) / 4;
        const c = K.mix([0.92, 0.86, 0.78], tipCol, Math.min(1, t * t * 1.3));
        const knob = 0.94 + 0.06 * Math.sin(P.getY(i) * 90 + P.getX(i) * 40);
        col[i * 3] = c[0] * knob; col[i * 3 + 1] = c[1] * knob; col[i * 3 + 2] = c[2] * knob;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.push({ geo, matrix: m.clone() });
    if (depth <= 0) return;
    const n = 2 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
        const c = new THREE.Matrix4().copy(m).multiply(new THREE.Matrix4().makeTranslation(0, len, 0))
            .multiply(new THREE.Matrix4().makeRotationY(rng() * Math.PI * 2)).multiply(new THREE.Matrix4().makeRotationZ(0.35 + rng() * 0.45));
        branchGeo(rng, depth - 1, len * (0.7 + rng() * 0.15), rad * 0.72, out, c, tipCol);
    }
}
function staghornGeo() {
    const out = [], rng = K.rng(31);
    for (let i = 0; i < 4; i++) branchGeo(rng, 3, 0.32, 0.05, out, new THREE.Matrix4().makeRotationY(i * 1.6).multiply(new THREE.Matrix4().makeRotationZ(0.25 + i * 0.08)), [1, 1, 1]);
    return mergeParts(out);
}
function fanGeo() {
    // a sea fan: a lattice of thin branches in one plane, a short trunk
    const out = [], rng = K.rng(77);
    const flat = (depth, len, rad, m) => {
        const geo = new THREE.CylinderGeometry(rad * 0.7, rad, len, 4, 1);
        geo.translate(0, len / 2, 0);
        const P = geo.getAttribute('position'), col = new Float32Array(P.count * 3);
        for (let i = 0; i < P.count; i++) { const v = 0.85 + 0.15 * (depth / 5); col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v; }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        out.push({ geo, matrix: m.clone() });
        if (depth <= 0) return;
        for (const s of [-1, 1]) flat(depth - 1, len * 0.78, rad * 0.75, new THREE.Matrix4().copy(m).multiply(new THREE.Matrix4().makeTranslation(0, len, 0)).multiply(new THREE.Matrix4().makeRotationZ(s * (0.3 + rng() * 0.25))));
    };
    flat(5, 0.28, 0.035, new THREE.Matrix4());
    return mergeParts(out);
}
function brainGeo() {
    const g = new THREE.SphereGeometry(0.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, 0.62, 1);
    const P = g.getAttribute('position'), col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const groove = Math.sin(x * 34 + Math.sin(z * 21) * 2.2) * Math.sin(z * 30 + Math.sin(x * 17) * 2);
        const k = groove > 0.35 ? 0.62 : 1;
        const n = 1 + 0.05 * groove;
        P.setXYZ(i, x * n, y * n, z * n);
        col[i * 3] = 0.82 * k; col[i * 3 + 1] = 0.8 * k; col[i * 3 + 2] = 0.62 * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
}
function anemoneGeo() {
    const parts = [];
    const stem = new THREE.CylinderGeometry(0.16, 0.2, 0.3, 12, 2);
    stem.translate(0, 0.15, 0);
    const colOf = (g, c) => { const n = g.getAttribute('position').count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const y = g.getAttribute('position').getY(i); const k = c(y); a[i * 3] = k[0]; a[i * 3 + 1] = k[1]; a[i * 3 + 2] = k[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    parts.push({ geo: colOf(stem, () => [0.35, 0.35, 0.4]) });
    for (let i = 0; i < 26; i++) {
        const a = i / 26 * Math.PI * 2, ring = i % 2 ? 0.13 : 0.09;
        const t = new THREE.CylinderGeometry(0.004, 0.018, 0.42 - (i % 2) * 0.1, 5, 4);
        t.translate(0, 0.21, 0);
        parts.push({ geo: colOf(t, (y) => [0.5 + y * 1.2, 0.5 + y * 1.2, 0.5 + y * 1.2]), pos: [Math.cos(a) * ring, 0.3, Math.sin(a) * ring], rot: [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55] });
    }
    return mergeParts(parts);
}
function lilyGeo() {
    const parts = [];
    const stalk = new THREE.CylinderGeometry(0.012, 0.022, 1, 5, 6);
    stalk.translate(0, 0.5, 0);
    const paint = (g, c) => { const P = g.getAttribute('position'), a = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const k = c(P.getY(i)); a.set(k, i * 3); } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    parts.push({ geo: paint(stalk, (y) => [0.25 + 0.3 * y, 0.35 + 0.35 * y, 0.45 + 0.4 * y]) });
    const bell = new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
    bell.scale(1, 1.3, 1);
    parts.push({ geo: paint(bell, () => [1, 1, 1]), pos: [0, 1.0, 0], rot: [Math.PI, 0, 0] });
    for (let i = 0; i < 6; i++) { const f = new THREE.CylinderGeometry(0.002, 0.006, 0.3, 3, 3); f.translate(0, -0.15, 0); const a = i / 6 * Math.PI * 2; parts.push({ geo: paint(f, () => [0.9, 0.95, 1]), pos: [Math.cos(a) * 0.07, 0.96, Math.sin(a) * 0.07], rot: [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2] }); }
    return mergeParts(parts);
}
const SHAPES = { kelp: kelpGeo, grass: grassGeo, staghorn: staghornGeo, fan: fanGeo, brain: brainGeo, anemone: anemoneGeo, lily: lilyGeo };
const shape = (k) => _geo[k] || (_geo[k] = SHAPES[k]());
/** The tint of a kind (rgb, the instance's colour; × the shape's own colours). */
function tintOf(kind, t) {
    const pick = (list) => list[Math.floor(t * list.length) % list.length];
    switch (kind) {
        case 'staghorn': return pick([[1, 0.55, 0.62], [1, 0.62, 0.32], [0.72, 0.48, 1], [1, 0.86, 0.4], [0.55, 0.85, 0.95]]);
        case 'fan': return pick([[0.85, 0.2, 0.25], [0.6, 0.22, 0.65], [0.95, 0.5, 0.2], [0.9, 0.82, 0.3]]);
        case 'brain': return pick([[0.9, 0.85, 0.6], [0.6, 0.85, 0.55], [0.95, 0.65, 0.5]]);
        case 'anemone': return pick([[0.3, 1, 0.95], [0.75, 0.45, 1], [0.45, 1, 0.5], [1, 0.5, 0.85]]);
        case 'lily': return pick([[0.55, 0.9, 1], [0.85, 0.7, 1], [0.6, 1, 0.8]]);
        default: return [0.85 + 0.3 * t, 0.9 + 0.2 * t, 0.85 + 0.25 * t];
    }
}

/** The sway: the plant bends in the swell, more the higher up it (its own phase from where it stands). */
function swayMaterial(base, amp) {
    const U = { uTime: { value: 0 }, uGlow: { value: 1 } };
    base.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = U.uTime; sh.uniforms.uGlow = U.uGlow;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                #ifdef USE_INSTANCING
                vec3 seaRoot = instanceMatrix[3].xyz;
                #else
                vec3 seaRoot = vec3(0.0);
                #endif
                float seaPh = fract(sin(dot(seaRoot.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
                float seaH = max(0.0, position.y);
                float seaB = seaH * seaH * ${amp.toFixed(3)};
                transformed.x += sin(uTime * 1.1 + seaPh + seaH * 1.7) * seaB;
                transformed.z += cos(uTime * 0.8 + seaPh * 1.3 + seaH * 1.3) * seaB * 0.7;`);
        if (base.isMeshBasicMaterial) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow;').replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= uGlow;');
    };
    base.customProgramCacheKey = () => 'seafloor-sway-' + amp + (base.isMeshBasicMaterial ? 'glow' : '');
    base.userData.U = U;
    return base;
}

// ------------------------------------------------------------------ the fish
function fishGeo() {
    // a small fish ~0.45 m: a deep sweep of a body, the tail fin forked, a dorsal — its nose at −z (the tail bends in the shader)
    const body = K.sweep([K.v3(0, 0, -0.22), K.v3(0, 0.005, 0.0), K.v3(0, 0, 0.17)], K.keys([[0, 0.005, 0.01, 0], [0.18, 0.04, 0.06, 0], [0.5, 0.045, 0.075, 0], [0.85, 0.02, 0.03, 0], [1, 0.008, 0.012, 0]]), {
        rings: 14, sides: 10, color: (t, ang) => { const s = Math.sin(ang); const back = s > 0.2 ? 0.55 : 1; const stripe = Math.abs(Math.sin(t * 22)) > 0.85 && Math.abs(s) < 0.6 ? 0.6 : 1; return [back * stripe, back * stripe, back * stripe]; },
    });
    const tail = new THREE.Shape();
    tail.moveTo(0, 0); tail.lineTo(0.12, 0.08); tail.lineTo(0.09, 0); tail.lineTo(0.12, -0.08); tail.lineTo(0, 0);
    const tg = new THREE.ShapeGeometry(tail);
    tg.rotateY(-Math.PI / 2);
    tg.translate(0, 0, 0.16);
    const tc = new Float32Array(tg.getAttribute('position').count * 3).fill(0.85);
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    tg.deleteAttribute('uv');
    body.deleteAttribute?.('uv');
    return mergeParts([{ geo: body }, { geo: tg }]);
}
function fishMaterial() {
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    const U = { uTime: { value: 0 } };
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = U.uTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                float fid = float(gl_InstanceID);
                float back = smoothstep(-0.05, 0.25, position.z);
                transformed.x += sin(uTime * 14.0 + fid * 1.7 - position.z * 12.0) * 0.06 * back;`);
    };
    m.customProgramCacheKey = () => 'seafish';
    m.userData.U = U;
    return m;
}
const FISH_LOOKS = [[0.75, 0.85, 1.0], [1.0, 0.86, 0.3], [1.0, 0.45, 0.32], [0.55, 1.0, 0.85], [0.85, 0.7, 1.0]];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _c = new THREE.Color();

export class SeaFloor {
    constructor(game) {
        this.game = game;
        this.meshes = {};
        this.t = 0;
        this.center = null; // where the plants were last laid round
        this.job = null;
        for (const [k, cap] of Object.entries(FLOOR.CAP)) {
            const glow = k === 'anemone' || k === 'lily';
            const mat = swayMaterial(glow ? new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: k === 'lily', opacity: 0.9 })
                : new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: k === 'kelp' || k === 'grass' ? THREE.DoubleSide : THREE.FrontSide }), k === 'kelp' ? 0.05 : k === 'grass' ? 0.12 : k === 'lily' ? 0.06 : 0.015);
            const m = new THREE.InstancedMesh(shape(k), mat, cap);
            m.count = 0;
            m.frustumCulled = false;
            m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
            m.userData.keep = true;
            game.scene.add(m);
            this.meshes[k] = m;
        }
        // the fish
        this.fish = new THREE.InstancedMesh(fishGeo(), fishMaterial(), FISH.SCHOOLS * FISH.PER);
        this.fish.count = 0;
        this.fish.frustumCulled = false;
        this.fish.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FISH.SCHOOLS * FISH.PER * 3), 3);
        game.scene.add(this.fish);
        this.schools = [];
    }

    /** For Game.prewarm: one of each kind (the shaders at the loading screen). */
    samples() { return [...Object.values(this.meshes), this.fish].map((m) => { const s = new THREE.Mesh(m.geometry, m.material); return s; }); }

    _depth(x, z) {
        const t = this.game.terrain?.data;
        if (!t) return 0;
        const ix = Math.round(x), iz = Math.round(z);
        if (t.landMade && !t.landMade(ix, iz)) return 0;
        if (!t.isSeaColumn?.(ix, iz)) return 0;
        if (this.game.sunken?.covers?.(x, z)) return 0; // (no weed through a wreck's hull or the temple's floor — SunkenWorld.js)
        const top = t.topLayer(ix, iz);
        const w = waterAt(t, ix, iz, top + 1);
        return w ? w.depth : 0;
    }

    update(dt) {
        const g = this.game, me = g.character?.group?.position, sea = g.sea;
        this.t += dt;
        const near = !!me && !!sea && sea.s(me.x, me.z) > -40 && me.y < 120 && !g.hellGate?.inHell && (!g.space?.realm || g.space.realm === 'earth');
        for (const m of Object.values(this.meshes)) m.visible = near;
        this.fish.visible = near;
        if (!near) { this.center = null; this.job = null; return; }
        const night = g.world?._night || 0;
        for (const [k, m] of Object.entries(this.meshes)) { const U = m.material.userData.U; U.uTime.value = this.t; U.uGlow.value = (k === 'anemone' || k === 'lily') ? (0.75 + 0.25 * Math.sin(this.t * 1.3)) * (1 + 0.6 * night) : 1; }
        // the plants: laid anew round the player when he has moved far enough (a few cells a frame)
        if (!this.job && (!this.center || Math.hypot(me.x - this.center.x, me.z - this.center.z) > FLOOR.CELL * 1.5)) this._startJob(me);
        if (this.job) this._runJob();
        this._fishStep(dt, me);
    }

    _startJob(me) {
        const C = FLOOR.CELL, R = Math.ceil(FLOOR.R / C);
        const cx = Math.floor(me.x / C), cz = Math.floor(me.z / C);
        const cells = [];
        for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= R * R) cells.push([cx + dx, cz + dz, dx * dx + dz * dz]);
        cells.sort((a, b) => a[2] - b[2]); // (the nearest first)
        const out = {};
        for (const k of Object.keys(FLOOR.CAP)) out[k] = [];
        this.job = { cells, i: 0, out, at: { x: me.x, z: me.z } };
    }

    _runJob() {
        const J = this.job, t0 = performance.now(), t = this.game.terrain?.data, seed = this.game.seed || 1;
        while (J.i < J.cells.length && performance.now() - t0 < FLOOR.BUDGET) {
            const [cx, cz] = J.cells[J.i++];
            for (const p of cellPlants(cx, cz, seed, (x, z) => this._depth(x, z))) {
                const list = J.out[p.kind];
                if (list.length >= FLOOR.CAP[p.kind]) continue;
                p.y = t.topLayer(Math.round(p.x), Math.round(p.z)) + 0.5;
                list.push(p);
            }
        }
        if (J.i < J.cells.length) return;
        // done: the instances written at once (no half-laid floor)
        for (const [k, list] of Object.entries(J.out)) {
            const m = this.meshes[k];
            for (let i = 0; i < list.length; i++) {
                const p = list[i];
                const sxz = k === 'kelp' ? 1 : p.s;
                _m.compose(_p.set(p.x, p.y - 0.05, p.z), _q.setFromEuler(_e.set(0, p.rot, 0)), _s.set(sxz, p.s, sxz));
                m.setMatrixAt(i, _m);
                const c = tintOf(k, p.tint);
                m.instanceColor.setXYZ(i, c[0], c[1], c[2]);
            }
            m.count = list.length;
            m.instanceMatrix.needsUpdate = true;
            m.instanceColor.needsUpdate = true;
        }
        this.center = J.at;
        this.job = null;
    }

    /** The schools: each round a centre that wanders in the deep water near the player; a person near — it darts off. */
    _fishStep(dt, me) {
        const t = this.game.terrain?.data;
        if (!t) return;
        for (let k = 0; k < FISH.SCHOOLS; k++) {
            let S = this.schools[k];
            if (!S || Math.hypot(S.x - me.x, S.z - me.z) > FISH.R * 1.6) {
                // a new school somewhere round the player where the sea is deep
                const a = Math.random() * Math.PI * 2, d = 15 + Math.random() * (FISH.R - 15);
                const x = me.x + Math.cos(a) * d, z = me.z + Math.sin(a) * d, ix = Math.round(x), iz = Math.round(z);
                if (!t.isSeaColumn?.(ix, iz) || (t.landMade && !t.landMade(ix, iz))) { this.schools[k] = null; continue; }
                const w = waterAt(t, ix, iz, t.topLayer(ix, iz) + 1);
                if (!w || w.depth < 3) { this.schools[k] = null; continue; }
                S = this.schools[k] = { x, z, y: w.bottom + 1 + Math.random() * Math.max(0.5, w.depth - 3), yaw: Math.random() * 6.28, look: FISH_LOOKS[k % FISH_LOOKS.length], tx: x, tz: z, ty: 0, fast: 0, seed: Math.random() * 100 };
                S.ty = S.y;
            }
            // wander; flee a person near
            const dm = Math.hypot(S.x - me.x, S.z - me.z, S.y - me.y);
            if (dm < FISH.NEAR) { S.fast = 1; const l = Math.hypot(S.x - me.x, S.z - me.z) || 1; S.tx = S.x + (S.x - me.x) / l * 20; S.tz = S.z + (S.z - me.z) / l * 20; }
            else if (Math.hypot(S.tx - S.x, S.tz - S.z) < 3) { const a = Math.random() * 6.28; S.tx = S.x + Math.cos(a) * 18; S.tz = S.z + Math.sin(a) * 18; }
            S.fast = Math.max(0, S.fast - dt * 0.3);
            const want = Math.atan2(-(S.tx - S.x), -(S.tz - S.z));
            let dy = want - S.yaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283;
            S.yaw += Math.max(-dt * 1.5, Math.min(dt * 1.5, dy)) * (1 + S.fast * 2);
            const sp = 1.4 + S.fast * 5;
            const nx = S.x - Math.sin(S.yaw) * sp * dt, nz = S.z - Math.cos(S.yaw) * sp * dt;
            const ix = Math.round(nx), iz = Math.round(nz);
            const w = t.isSeaColumn?.(ix, iz) ? waterAt(t, ix, iz, S.y) : null;
            if (w && w.depth >= 2) { S.x = nx; S.z = nz; S.y = Math.max(w.bottom + 0.8, Math.min(w.surface - 0.8, S.y)); }
            else { S.yaw += 1.2; S.tx = S.x - (nx - S.x) * 10; S.tz = S.z - (nz - S.z) * 10; }
        }
        // the fish of each school round its centre, turning with it, each a little its own way
        let n = 0;
        for (let k = 0; k < FISH.SCHOOLS; k++) {
            const S = this.schools[k];
            if (!S) continue;
            const spread = 1.6 + S.fast * 2.5;
            for (let i = 0; i < FISH.PER; i++) {
                const a = i * 2.399 + S.seed, r = spread * Math.sqrt((i + 0.5) / FISH.PER);
                const wob = Math.sin(this.t * 1.3 + i) * 0.3;
                const ox = Math.cos(a + this.t * 0.25) * r, oz = Math.sin(a + this.t * 0.25) * r * 1.8, oy = Math.sin(a * 1.7 + this.t * 0.8) * spread * 0.35;
                const c = Math.cos(S.yaw), s = Math.sin(S.yaw);
                _p.set(S.x + ox * c + oz * s, S.y + oy, S.z - ox * s + oz * c);
                _m.compose(_p, _q.setFromEuler(_e.set(wob * 0.2, S.yaw + wob * 0.3, 0)), _s.setScalar(0.85 + (i % 5) * 0.08));
                this.fish.setMatrixAt(n, _m);
                _c.setRGB(S.look[0], S.look[1], S.look[2]);
                this.fish.setColorAt(n, _c);
                n++;
            }
        }
        this.fish.count = n;
        this.fish.instanceMatrix.needsUpdate = true;
        if (this.fish.instanceColor) this.fish.instanceColor.needsUpdate = true;
        this.fish.material.userData.U.uTime.value = this.t;
    }
}
