/**
 * SeaCritters.js — the sea's slower folk round the player (the author 05.11: «ракообразных сделать несколько видов… черепахи сделай
 * обязательно»): sea turtles gliding through the water with their great front flippers beating; on the bottom crabs scuttling sideways,
 * lobsters creeping by the rocks with their long feelers, little shrimps hovering in clouds and flicking off.
 *   turtles  two kinds: the green turtle (an olive-brown shell of plates with pale seams, a cream belly) and the hawksbill (an amber
 *            shell flamed with brown); a domed shell, a beaked head, front flippers ~0.6 of the shell that beat slowly up and down
 *            (the shell rides up and down with them), small rear flippers steering; they swim calm and turn away from a person close;
 *   crabs    a broad carapace, two claws (one bigger), eight jointed legs that step (the video card moves them), eyes on stalks; red,
 *            orange, blue, sand-coloured; they run sideways and hide (stop) when a person comes near;
 *   lobsters a long segmented body ending in a fan tail, two great claws, long feelers that sway; blue-black, red-brown, spiny orange;
 *   shrimps  small, see-through pink and banded red-white (the cleaner shrimp), in clouds near the bottom.
 * Scenery: each computer its own, nothing harms, nothing saved; one draw per part (InstancedMesh), the legs and flippers moved by the
 * video card (their own phase from where they stand); kept round the player, made anew when far.
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

export const CRITTERS = { TURTLES: 4, CRABS: 18, LOBSTERS: 8, SHRIMPS: 6, PER_SHRIMP: 7, R: 44, NEAR: 5 };

const paint = (g, f) => {
    const P = g.getAttribute('position'), c = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { const k = f(P.getX(i), P.getY(i), P.getZ(i)); c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
};
/** Merge parts and tag each vertex with a part number (aLeg: 0 still, ±k a limb that moves — its side and its pair). */
function mergeTagged(parts) {
    const g = mergeParts(parts);
    const tag = new Float32Array(g.getAttribute('position').count);
    let o = 0;
    for (const p of parts) { const n = p.geo.getAttribute('position').count; tag.fill(p.tag || 0, o, o + n); o += n; }
    g.setAttribute('aLeg', new THREE.BufferAttribute(tag, 1));
    g.userData.shared = true;
    return g;
}

// ------------------------------------------------------------------ the shapes
function turtleBody() {
    // the shell: a dome 1 m long (nose at −z), plates of keratin — the seams paler, each plate mottled; the belly cream; the head beaked
    const shell = new THREE.SphereGeometry(0.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    shell.scale(0.82, 0.42, 1);
    paint(shell, (x, y, z) => {
        const a = Math.atan2(x, z), rr = Math.hypot(x / 0.82, z);
        const ring = rr < 0.22 ? 0 : rr < 0.4 ? 1 : 2;
        const seg = ring === 0 ? Math.floor((z + 0.5) * 5) : Math.floor((a + Math.PI) / (Math.PI * 2) * (ring === 1 ? 8 : 13));
        const fu = ring === 0 ? Math.abs(((z + 0.5) * 5) % 1 - 0.5) : Math.abs(((a + Math.PI) / (Math.PI * 2) * (ring === 1 ? 8 : 13)) % 1 - 0.5);
        const seam = fu > 0.43 || Math.abs(rr - 0.22) < 0.015 || Math.abs(rr - 0.4) < 0.015;
        const m = 0.85 + 0.3 * Math.abs(Math.sin(seg * 12.9 + ring * 3.1));
        const flame = 0.8 + 0.4 * Math.sin(x * 23 + z * 17 + seg);
        return seam ? [1.25, 1.2, 1.05] : [m * flame, m * (0.95 + 0.1 * flame), m * 0.9];
    });
    const belly = new THREE.CircleGeometry(0.47, 24);
    belly.rotateX(Math.PI / 2); belly.scale(0.8, 1, 1);
    paint(belly, (x, y, z) => { const p = Math.abs(Math.sin(z * 14)) > 0.92 || Math.abs(x) < 0.01 ? 0.8 : 1; return [1.6 * p, 1.5 * p, 1.15 * p]; });
    const head = new THREE.SphereGeometry(0.12, 14, 10);
    head.scale(0.9, 0.75, 1.3);
    paint(head, (x, y, z) => { const sc = Math.abs(Math.sin(x * 60) * Math.sin(z * 50)) > 0.6 ? 0.75 : 1.05; return y < -0.02 ? [1.4, 1.3, 1.0] : [0.85 * sc, 0.8 * sc, 0.6 * sc]; });
    const beak = new THREE.ConeGeometry(0.05, 0.08, 8);
    beak.rotateX(-Math.PI / 2);
    paint(beak, () => [0.55, 0.5, 0.35]);
    const eye = new THREE.SphereGeometry(0.022, 8, 6);
    paint(eye, () => [0.05, 0.04, 0.03]);
    return mergeTagged([
        { geo: shell }, { geo: belly, pos: [0, 0.005, 0] },
        { geo: head, pos: [0, 0.02, -0.58] }, { geo: beak, pos: [0, 0.0, -0.73] },
        { geo: eye, pos: [0.08, 0.05, -0.62] }, { geo: eye, pos: [-0.08, 0.05, -0.62] },
    ]);
}
function flipperGeo(len, wid) {
    // a paddle: thick at the root, thin and swept back at the tip, scaly with a darker edge; root at the origin, along +x
    const g = new THREE.SphereGeometry(0.5, 14, 6);
    g.scale(len, 0.035, wid);
    g.translate(len * 0.5, 0, 0);
    const P = g.getAttribute('position');
    for (let i = 0; i < P.count; i++) { const x = P.getX(i); P.setZ(i, P.getZ(i) + (x / len) ** 2 * wid * 0.9); }
    g.computeVertexNormals();
    paint(g, (x, y, z) => { const e = Math.abs(z - (x / len) ** 2 * wid * 0.9) > wid * 0.38 ? 0.7 : 1; const sc = Math.abs(Math.sin(x * 70) * Math.sin(z * 60)) > 0.5 ? 0.8 : 1; return [0.8 * e * sc, 0.75 * e * sc, 0.55 * e * sc]; });
    g.userData.shared = true;
    return g;
}
function crabGeo() {
    const parts = [];
    const cara = new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    cara.scale(0.16, 0.06, 0.11);
    paint(cara, (x, y, z) => { const sp = Math.abs(Math.sin(x * 120) * Math.sin(z * 140)) > 0.8 ? 1.2 : 1; return [sp, sp * 0.95, sp * 0.95]; });
    parts.push({ geo: cara, pos: [0, 0.05, 0] });
    const under = new THREE.CircleGeometry(0.5, 16); under.rotateX(Math.PI / 2); under.scale(0.15, 1, 0.1);
    parts.push({ geo: paint(under, () => [1.5, 1.45, 1.3]), pos: [0, 0.05, 0] });
    // the legs: four a side, two joints, bent down; tagged ±1…4 (side × pair) to step
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
        const up = new THREE.CylinderGeometry(0.006, 0.009, 0.09, 5); up.rotateZ(Math.PI / 2); up.translate(sx * 0.045, 0, 0);
        const lo = new THREE.CylinderGeometry(0.003, 0.006, 0.08, 5); lo.translate(0, -0.04, 0);
        const z = -0.04 + k * 0.027;
        parts.push({ geo: paint(up, () => [0.95, 0.9, 0.85]), pos: [sx * 0.07, 0.05, z], rot: [0, sx * (k - 1.5) * 0.25, sx * 0.35], tag: sx * (k + 1) });
        parts.push({ geo: paint(lo, () => [0.9, 0.85, 0.8]), pos: [sx * 0.16, 0.06, z + sx * (k - 1.5) * 0.02], rot: [0, 0, sx * -0.35], tag: sx * (k + 1) });
    }
    // the claws (the right one bigger)
    for (const sx of [-1, 1]) {
        const s = sx > 0 ? 1.35 : 1;
        const arm = new THREE.CylinderGeometry(0.01 * s, 0.013 * s, 0.07 * s, 6); arm.rotateX(Math.PI / 2);
        const claw = new THREE.SphereGeometry(0.025 * s, 10, 8); claw.scale(1, 0.7, 1.6);
        const pin = new THREE.ConeGeometry(0.008 * s, 0.04 * s, 5); pin.rotateX(-Math.PI / 2);
        parts.push({ geo: paint(arm, () => [1, 0.95, 0.9]), pos: [sx * 0.09, 0.06, -0.09], rot: [0, sx * 0.4, 0], tag: sx * 5 });
        parts.push({ geo: paint(claw, () => [1.05, 1, 0.95]), pos: [sx * 0.11, 0.065, -0.14 * s], tag: sx * 5 });
        parts.push({ geo: paint(pin, () => [0.25, 0.2, 0.2]), pos: [sx * 0.11, 0.065, -0.19 * s], tag: sx * 5 });
    }
    // the eyes on stalks
    for (const sx of [-1, 1]) {
        const st = new THREE.CylinderGeometry(0.004, 0.005, 0.035, 5);
        const ey = new THREE.SphereGeometry(0.008, 6, 5);
        parts.push({ geo: paint(st, () => [0.9, 0.85, 0.8]), pos: [sx * 0.025, 0.1, -0.08] });
        parts.push({ geo: paint(ey, () => [0.05, 0.05, 0.05]), pos: [sx * 0.025, 0.12, -0.08] });
    }
    return mergeTagged(parts);
}
function lobsterGeo() {
    const parts = [];
    // the carapace and the tail of six segments, a fan at the end; nose at −z
    const head = new THREE.CylinderGeometry(0.055, 0.06, 0.2, 10); head.rotateX(Math.PI / 2);
    parts.push({ geo: paint(head, (x, y) => (y > 0.03 ? [0.85, 0.85, 0.85] : [1.1, 1.05, 1])), pos: [0, 0.07, -0.05] });
    for (let k = 0; k < 6; k++) {
        const seg = new THREE.CylinderGeometry(0.05 - k * 0.005, 0.052 - k * 0.005, 0.045, 10); seg.rotateX(Math.PI / 2);
        parts.push({ geo: paint(seg, (x, y) => (y > 0 ? [0.8, 0.8, 0.8] : [1.15, 1.1, 1.0])), pos: [0, 0.065 - k * 0.004, 0.07 + k * 0.042], tag: 6 + k * 0.01 });
    }
    for (const a of [-0.6, -0.3, 0, 0.3, 0.6]) { const f = new THREE.CircleGeometry(0.04, 6, -0.4, 0.8); f.rotateX(-Math.PI / 2); f.rotateY(a); parts.push({ geo: paint(f, () => [0.95, 0.9, 0.85]), pos: [0, 0.045, 0.33], tag: 6.06 }); }
    // the claws: great, toothed
    for (const sx of [-1, 1]) {
        const arm = new THREE.CylinderGeometry(0.012, 0.016, 0.14, 6); arm.rotateX(Math.PI / 2);
        const claw = new THREE.SphereGeometry(0.04, 12, 8); claw.scale(0.9, 0.55, 2.0);
        parts.push({ geo: paint(arm, () => [1, 0.95, 0.9]), pos: [sx * 0.07, 0.07, -0.2], rot: [0, sx * 0.35, 0], tag: sx * 5 });
        parts.push({ geo: paint(claw, (x, y, z) => (Math.abs(Math.sin(z * 200)) > 0.7 ? [0.75, 0.7, 0.7] : [1.05, 1, 0.95])), pos: [sx * 0.11, 0.07, -0.33], tag: sx * 5 });
    }
    // the legs (four a side) and the long feelers
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
        const l = new THREE.CylinderGeometry(0.003, 0.006, 0.12, 5); l.rotateZ(Math.PI / 2); l.translate(sx * 0.06, -0.02, 0);
        parts.push({ geo: paint(l, () => [0.95, 0.9, 0.85]), pos: [sx * 0.04, 0.06, -0.08 + k * 0.035], rot: [0, 0, sx * -0.6], tag: sx * (k + 1) });
    }
    for (const sx of [-1, 1]) {
        const ant = new THREE.CylinderGeometry(0.0015, 0.004, 0.5, 4); ant.translate(0, 0.25, 0); ant.rotateX(-1.25);
        parts.push({ geo: paint(ant, () => [0.9, 0.7, 0.6]), pos: [sx * 0.02, 0.09, -0.14], rot: [0, sx * 0.35, 0], tag: sx * 7 });
    }
    return mergeTagged(parts);
}
function shrimpGeo() {
    const parts = [];
    for (let k = 0; k < 7; k++) {
        const r = 0.012 - k * 0.0012;
        const seg = new THREE.SphereGeometry(r, 8, 6); seg.scale(1, 1, 1.5);
        parts.push({ geo: paint(seg, () => (k % 2 ? [1.1, 1.1, 1.1] : [1, 0.6, 0.6])), pos: [0, Math.sin(k / 6 * 1.6) * 0.012, k * 0.012], tag: 6 + k * 0.01 });
    }
    const tail = new THREE.CircleGeometry(0.012, 5, -0.6, 1.2); tail.rotateX(-Math.PI / 2);
    parts.push({ geo: paint(tail, () => [1, 0.9, 0.9]), pos: [0, 0.01, 0.09], tag: 6.07 });
    for (const sx of [-1, 1]) { const a = new THREE.CylinderGeometry(0.0006, 0.001, 0.09, 3); a.translate(0, 0.045, 0); a.rotateX(-1.2); parts.push({ geo: paint(a, () => [1.2, 1.2, 1.2]), pos: [sx * 0.004, 0.006, -0.01], rot: [0, sx * 0.3, 0], tag: sx * 7 }); }
    for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) { const l = new THREE.CylinderGeometry(0.0006, 0.001, 0.02, 3); l.translate(0, -0.01, 0); parts.push({ geo: paint(l, () => [1, 0.8, 0.8]), pos: [sx * 0.004, -0.006, k * 0.008], tag: sx * (k + 1) }); }
    return mergeTagged(parts);
}

/** A material whose limbs move (legs step, claws open, feelers sway, the tail flicks) by their tag; own phase per instance. */
function limbMaterial(kind) {
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, transparent: kind === 'shrimp', opacity: kind === 'shrimp' ? 0.82 : 1 });
    const U = { uTime: { value: 0 }, uGlow: { value: 0 } };
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = U.uTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aLeg;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                #ifdef USE_INSTANCING
                vec3 cRoot = instanceMatrix[3].xyz;
                #else
                vec3 cRoot = vec3(0.0);
                #endif
                float cPh = fract(sin(dot(cRoot.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
                float side = sign(aLeg), k = abs(aLeg);
                if (k > 0.5 && k < 4.5) { // a leg: steps, the pairs out of step
                    float s = sin(uTime * 9.0 + cPh + k * 1.7 + side * 1.57);
                    transformed.y += max(0.0, s) * 0.012;
                    transformed.z += s * 0.008;
                } else if (k > 4.5 && k < 5.5) { // a claw: it lifts and snaps now and then
                    transformed.y += (0.5 + 0.5 * sin(uTime * 1.3 + cPh + side)) * 0.012;
                } else if (k > 5.5 && k < 6.5) { // the tail: a flick
                    transformed.y += sin(uTime * 2.0 + cPh) * (k - 6.0) * 1.2;
                } else if (k > 6.5) { // the feelers sway
                    transformed.x += sin(uTime * 1.7 + cPh + position.y * 6.0) * 0.03 * max(0.0, position.y + 0.1) * 6.0;
                }`);
    };
    m.customProgramCacheKey = () => 'seacritter-' + kind;
    m.userData.U = U;
    return m;
}
function flipperMaterial() {
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
    m.userData.U = { uTime: { value: 0 } };
    return m;
}

const TURTLE_KINDS = [{ name: 'зелёная черепаха', shell: [0.42, 0.36, 0.2], skin: [0.62, 0.6, 0.45] }, { name: 'бисса', shell: [0.62, 0.38, 0.16], skin: [0.55, 0.48, 0.35] }];
const CRAB_TINTS = [[0.85, 0.22, 0.14], [0.95, 0.5, 0.18], [0.3, 0.45, 0.85], [0.75, 0.65, 0.48], [0.6, 0.25, 0.5]];
const LOBSTER_TINTS = [[0.16, 0.22, 0.42], [0.58, 0.22, 0.12], [0.9, 0.52, 0.2]];
const SHRIMP_TINTS = [[1, 0.6, 0.6], [1, 0.35, 0.3], [0.9, 0.85, 0.7]];

const _q3 = new THREE.Quaternion(), _e2 = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _c = new THREE.Color(), _o = new THREE.Vector3();

export class SeaCritters {
    constructor(game) {
        this.game = game;
        this.t = 0;
        this.turtles = []; this.crabs = []; this.lobsters = []; this.shrimps = [];
        const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); m.userData.keep = true; game.scene?.add(m); return m; };
        this.M = {
            tBody: inst(turtleBody(), new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), CRITTERS.TURTLES),
            tFront: inst(flipperGeo(0.62, 0.2), flipperMaterial(), CRITTERS.TURTLES * 2),
            tRear: inst(flipperGeo(0.24, 0.14), flipperMaterial(), CRITTERS.TURTLES * 2),
            crab: inst(crabGeo(), limbMaterial('crab'), CRITTERS.CRABS),
            lobster: inst(lobsterGeo(), limbMaterial('lobster'), CRITTERS.LOBSTERS),
            shrimp: inst(shrimpGeo(), limbMaterial('shrimp'), CRITTERS.SHRIMPS * CRITTERS.PER_SHRIMP),
        };
    }

    visible(v) { for (const m of Object.values(this.M)) m.visible = v; }
    samples() { return Object.values(this.M).map((m) => new THREE.Mesh(m.geometry, m.material)); }
    count(k) { return this.M[k].count; }

    /** Keep a list of `n` round the player: a far one is made anew at a fitting place (`make` → a creature or null). */
    _keep(list, n, me, make) {
        for (let i = 0; i < n; i++) {
            const c = list[i];
            if (c && Math.hypot(c.x - me.x, c.z - me.z) < CRITTERS.R * 1.4) continue;
            const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * (CRITTERS.R - 6);
            list[i] = make(me.x + Math.cos(a) * d, me.z + Math.sin(a) * d) || null;
        }
    }

    update(dt, me, waterAt, groundAt, day = 1, night = 0) {
        this.t += dt;
        for (const m of Object.values(this.M)) if (m.material.userData.U) m.material.userData.U.uTime.value = this.t;
        // the turtles: in the water (≥ 4 m), calm
        this._keep(this.turtles, CRITTERS.TURTLES, me, (x, z) => {
            const w = waterAt(x, z, null);
            if (!w || w.depth < 4 || Math.random() < 0.4) return null;
            const kind = TURTLE_KINDS[Math.random() < 0.6 ? 0 : 1];
            return { x, z, y: w.bottom + 1.5 + Math.random() * (w.depth - 3), yaw: Math.random() * 6.28, kind, size: 0.9 + Math.random() * 0.5, ph: Math.random() * 6, tx: x, tz: z, fast: 0 };
        });
        // the bottom folk
        const onBottom = (list, n, tints, chance) => this._keep(list, n, me, (x, z) => { const gy = groundAt(x, z); if (gy == null || Math.random() > chance) return null; return { x, z, y: gy, yaw: Math.random() * 6.28, tint: tints[(Math.random() * tints.length) | 0], size: 0.8 + Math.random() * 0.6, ph: Math.random() * 6, run: 0, side: Math.random() < 0.5 ? 1 : -1, stopT: 0 }; });
        onBottom(this.crabs, CRITTERS.CRABS, CRAB_TINTS, 0.8);
        onBottom(this.lobsters, CRITTERS.LOBSTERS, LOBSTER_TINTS, 0.5);
        onBottom(this.shrimps, CRITTERS.SHRIMPS, SHRIMP_TINTS, 0.6);
        this._turtles(dt, me, waterAt);
        this._crawl(dt, me, groundAt, this.crabs, this.M.crab, 0.9, true);
        this._crawl(dt, me, groundAt, this.lobsters, this.M.lobster, 0.25, false);
        this._shrimpClouds(dt, me, groundAt);
        // the light of the water: dimmer at night (the colour is the instance's)
        void day; void night;
    }

    _turtles(dt, me, waterAt) {
        const M = this.M;
        let n = 0;
        for (const T of this.turtles) {
            if (!T) continue;
            const d = Math.hypot(T.x - me.x, T.z - me.z, T.y - me.y);
            if (d < CRITTERS.NEAR + 3) { const l = Math.hypot(T.x - me.x, T.z - me.z) || 1; T.tx = T.x + (T.x - me.x) / l * 16; T.tz = T.z + (T.z - me.z) / l * 16; T.fast = 1; }
            else if (Math.hypot(T.tx - T.x, T.tz - T.z) < 2) { const a = Math.random() * 6.28; T.tx = T.x + Math.cos(a) * 20; T.tz = T.z + Math.sin(a) * 20; }
            T.fast = Math.max(0, T.fast - dt * 0.2);
            const want = Math.atan2(-(T.tx - T.x), -(T.tz - T.z));
            let dy = want - T.yaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283;
            T.yaw += Math.max(-dt * 0.5, Math.min(dt * 0.5, dy));
            // a stroke of the flippers: a push, then a glide
            const beat = Math.sin(this.t * (1.2 + T.fast) + T.ph);
            const sp = (0.5 + 0.4 * Math.max(0, beat)) * (1 + T.fast * 1.5);
            const nx = T.x - Math.sin(T.yaw) * sp * dt, nz = T.z - Math.cos(T.yaw) * sp * dt;
            const w = waterAt(nx, nz, T.y);
            if (w && w.depth >= 3) { T.x = nx; T.z = nz; T.y = Math.max(w.bottom + 1, Math.min(w.surface - 0.8, T.y + beat * 0.06 * dt)); }
            else { T.yaw += 1; T.tx = T.x - (nx - T.x) * 12; T.tz = T.z - (nz - T.z) * 12; }
            const S = T.size, rise = beat * 0.04;
            _e.set(-beat * 0.06, T.yaw, Math.sin(this.t * 0.4 + T.ph) * 0.05);
            _q.setFromEuler(_e);
            _m.compose(_p.set(T.x, T.y + rise, T.z), _q, _s.setScalar(S));
            M.tBody.setMatrixAt(n, _m);
            M.tBody.setColorAt(n, _c.setRGB(T.kind.shell[0] * 1.6, T.kind.shell[1] * 1.6, T.kind.shell[2] * 1.6));
            // the flippers: the front ones beat (a long sweep down and back), the rear ones steer
            for (const sx of [-1, 1]) {
                const fl = n * 2 + (sx > 0 ? 0 : 1);
                _o.set(sx * 0.32 * S, -0.02 * S, -0.28 * S).applyQuaternion(_q).add(_p);
                _q2.copy(_q).multiply(_q3.setFromEuler(_e2.set(0, sx > 0 ? -0.35 + beat * 0.25 : Math.PI + 0.35 - beat * 0.25, sx * beat * 0.65)));
                _m.compose(_o, _q2, _s.setScalar(S));
                M.tFront.setMatrixAt(fl, _m);
                M.tFront.setColorAt(fl, _c.setRGB(T.kind.skin[0] * 1.4, T.kind.skin[1] * 1.4, T.kind.skin[2] * 1.4));
                _o.set(sx * 0.25 * S, -0.03 * S, 0.36 * S).applyQuaternion(_q).add(_p);
                _q2.copy(_q).multiply(_q3.setFromEuler(_e2.set(0, sx > 0 ? 0.6 : Math.PI - 0.6, sx * Math.sin(this.t * 1.1 + T.ph) * 0.2)));
                _m.compose(_o, _q2, _s.setScalar(S));
                M.tRear.setMatrixAt(fl, _m);
                M.tRear.setColorAt(fl, _c.setRGB(T.kind.skin[0] * 1.4, T.kind.skin[1] * 1.4, T.kind.skin[2] * 1.4));
            }
            n++;
        }
        for (const [m, k] of [[M.tBody, n], [M.tFront, n * 2], [M.tRear, n * 2]]) { m.count = k; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }

    /** Crabs (sideways, quick, they freeze when a person is near) and lobsters (slow, forward): on the bottom. */
    _crawl(dt, me, groundAt, list, mesh, speed, sideways) {
        let n = 0;
        for (const C of list) {
            if (!C) continue;
            const near = Math.hypot(C.x - me.x, C.z - me.z, C.y - me.y) < CRITTERS.NEAR;
            if (near && sideways) C.stopT = 2 + Math.random() * 2; // (a crab freezes, then scuttles off)
            C.stopT -= dt;
            C.run -= dt;
            if (C.run <= 0) { C.run = 1.5 + Math.random() * 4; C.side = Math.random() < 0.5 ? 1 : -1; C.yaw += (Math.random() - 0.5) * (sideways ? 0.8 : 1.6); }
            if (C.stopT <= 0 && C.run > 0.6) {
                const dir = sideways ? C.yaw + C.side * Math.PI / 2 : C.yaw;
                const sp = speed * C.size * (near ? 2.5 : 1);
                const nx = C.x - Math.sin(dir) * sp * dt, nz = C.z - Math.cos(dir) * sp * dt;
                const gy = groundAt(nx, nz);
                if (gy != null && Math.abs(gy - C.y) < 1.1) { C.x = nx; C.z = nz; C.y += (gy - C.y) * Math.min(1, dt * 6); }
                else { C.yaw += Math.PI * 0.7; C.run = 0.5; }
            }
            _m.compose(_p.set(C.x, C.y, C.z), _q.setFromEuler(_e.set(0, C.yaw, 0)), _s.setScalar(C.size * (sideways ? 1.8 : 2.2)));
            mesh.setMatrixAt(n, _m);
            mesh.setColorAt(n, _c.setRGB(C.tint[0], C.tint[1], C.tint[2]));
            n++;
        }
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    /** Shrimps: a little cloud over the bottom, each hovering, flicking off together from a person near. */
    _shrimpClouds(dt, me, groundAt) {
        const M = this.M.shrimp;
        let n = 0;
        for (const C of this.shrimps) {
            if (!C) continue;
            const near = Math.hypot(C.x - me.x, C.z - me.z, C.y - me.y) < CRITTERS.NEAR;
            if (near) { C.fl = 1; const l = Math.hypot(C.x - me.x, C.z - me.z) || 1; C.x += (C.x - me.x) / l * 3 * dt; C.z += (C.z - me.z) / l * 3 * dt; const gy = groundAt(C.x, C.z); if (gy != null) C.y = gy; }
            C.fl = Math.max(0, (C.fl || 0) - dt);
            for (let i = 0; i < CRITTERS.PER_SHRIMP; i++) {
                const a = i * 2.4 + C.ph, r = 0.25 + 0.12 * i;
                _p.set(C.x + Math.cos(a + this.t * 0.3) * r, C.y + 0.15 + 0.12 * Math.sin(this.t * 1.7 + i), C.z + Math.sin(a + this.t * 0.3) * r);
                _m.compose(_p, _q.setFromEuler(_e.set(0.1 * Math.sin(this.t * 3 + i), C.yaw + a * 0.6 + C.fl * 2, 0)), _s.setScalar(C.size * 2.4));
                M.setMatrixAt(n, _m);
                M.setColorAt(n, _c.setRGB(C.tint[0], C.tint[1], C.tint[2]));
                n++;
            }
        }
        M.count = n;
        M.instanceMatrix.needsUpdate = true;
        if (M.instanceColor) M.instanceColor.needsUpdate = true;
    }

    dispose() { for (const m of Object.values(this.M)) { m.parent?.remove(m); m.material.dispose(); } }
}
