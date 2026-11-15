/**
 * QuakeFx.js — what «Earthquake» / «Earthquake Maxima» LOOK and SOUND like (the author 15.11: «анимация ужасная… реально классная анимация, дрожание земли и так
 * далее… всё переработать с нуля»). Pure show: who is hurt, what falls and where the ground really breaks is SpellManager.castEarthquake (unchanged).
 *
 * The picture, in acts (every number is time since the stomp):
 *   1. THE STOMP    a flat ring of dust races out from the caster's foot (two rings, the second later), a crown of earth chunks jumps up round the foot, a
 *                   ball of dust rises, the light flares, the ground jolts (camera) and the earth GROANS (rumble + the blow).
 *   2. THE FISSURE  a jagged crack runs out along the ground at the wave's speed: dark throat, a lighter broken LIP (the torn turf), forks branching off it,
 *                   widening as it opens; at its tip a bright flash and a wall of dust and flying turf. Where the front passes the earth heaves: chunks are
 *                   thrown out of the crack's mouth (lit, they fall back and bounce), the dust rolls up in a curtain, rings of shock run sideways along the ground.
 *   3. THE AFTERSHOCKS  the crack stays open and breathes (Maxima: it glows like a seam of magma, embers rise out of it), dust settles, two weaker tremors
 *                   roll along it, then it closes into the ground and fades.
 *   Maxima: three cracks, wider, magma glow, more forks, bigger chunks, a second shock ring, heavier shaking.
 *
 * Cheap on purpose: one mesh per crack polyline (vertex colours, no texture), one additive glow mesh for the magma, rings from a shared geometry (a pool of
 * eight, one basic material each), everything else the shared particle pools (dust → smoke, chunks → debris, embers → glow); nothing is made per frame.
 *
 * «А если»: the ground is uneven (every node sits on `surfaceY`, the lip lifted a little); the caster is in a cave / on a ship / in the air (the host's cast point
 * is already on the surface — the picture follows it); a slow frame (every node and every beat is driven by time, never by frames; a node opens once);
 * many quakes at once (each owns its meshes; the pools recycle); the spell is cut (dispose removes every mesh and material).
 */
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const EARTH = [0x6b5440, 0x7d6a55, 0x5a4a3c, 0x8a7a64, 0x4f8a30, 0x6a4a2a]; // (soil, dry earth, stone, sod)
const DUST = [0xb59a78, 0xa08a6a, 0xc7b08c, 0x8f7a5c];

/** The crack's nodes (pure numbers, testable): `n` nodes every `step` m from `start`, wandering sideways, with a half-width that pinches and swells. */
export function crackNodes(rng, length, step, width, wander = 0.5) {
    const nodes = [];
    let lat = 0, vel = 0;
    for (let d = 0, i = 0; d <= length; d += step, i++) {
        vel += (rng() - 0.5) * wander; vel *= 0.8; lat += vel;
        lat *= 0.96; // (it wanders but does not leave its line)
        const pinch = 0.55 + 0.45 * Math.abs(Math.sin(i * 0.9 + rng() * 2));
        const taper = d < 3 ? 0.4 + d / 5 : d > length - 5 ? Math.max(0.15, (length - d) / 5) : 1; // (opens narrow at the foot, thins to a hairline at the tip)
        nodes.push({ d, lat, w: width * pinch * taper });
    }
    return nodes;
}

let RING = null;
function ringGeo() { return RING || (RING = new THREE.RingGeometry(0.82, 1, 40, 1).rotateX(-Math.PI / 2)); }

export class QuakeFx {
    /** @param {THREE.Scene} scene @param {object} fx the Effects (pools, flash) @param {(x:number,z:number)=>number} surfaceY */
    constructor(scene, fx, surfaceY) {
        this.scene = scene; this.fx = fx; this.ground = surfaceY;
        this.group = new THREE.Group();
        scene.add(this.group);
        this.lines = []; // {mesh, glow, geo, glowGeo, nodes: [{p, d, w}], opened: n}
        this.rings = []; // {mesh, mat, t, max, life, on}
        this.nodes = []; // for the game: {d, lane, at}
        this.t = 0; this.afterAt = 0; this.after = [];
        this.mats = [];
    }

    /** The crack lanes and forks (call once, before the first update). */
    build(origin, dir, side, length, power) {
        this.origin = origin.clone(); this.dir = dir.clone(); this.side = side.clone(); this.length = length; this.power = power;
        const big = power > 1, rng = Math.random;
        const lanes = big ? [0, -2.2, 2.2] : [0];
        const crackMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
        this.mats.push(crackMat, glowMat); this.crackMat = crackMat; this.glowMat = glowMat;
        for (const lane of lanes) {
            const main = crackNodes(rng, length, 0.9, (big ? 0.62 : 0.4) * (lane ? 0.75 : 1), 0.55);
            const base = origin.clone().addScaledVector(dir, 1);
            const poly = main.map((n) => {
                const k = Math.min(1, n.d / 6);
                const p = base.clone().addScaledVector(dir, n.d).addScaledVector(side, lane * k + n.lat);
                p.y = this.ground(p.x, p.z) + 0.04;
                return { p, d: n.d + 1, w: n.w };
            });
            this._line(poly, big, lane);
            // forks: short side cracks off the main one (more of them in a Maxima)
            const forks = big ? 4 : 2;
            for (let f = 0; f < forks; f++) {
                const at = poly[Math.floor((0.2 + 0.7 * ((f + rng() * 0.8) / forks)) * (poly.length - 1))];
                const sgn = rng() < 0.5 ? -1 : 1, ang = sgn * (0.5 + rng() * 0.5), len = 3 + rng() * (big ? 6 : 3.5);
                const fd = _a.copy(dir).applyAxisAngle(_b.set(0, 1, 0), ang).clone();
                const fn = crackNodes(rng, len, 0.7, (big ? 0.3 : 0.2), 0.9);
                const fp = fn.map((n) => {
                    const p = at.p.clone().addScaledVector(fd, n.d).addScaledVector(side, n.lat * sgn);
                    p.y = this.ground(p.x, p.z) + 0.04;
                    return { p, d: at.d + n.d * 0.8, w: n.w };
                });
                this._line(fp, big, null);
            }
        }
        // for the game: where the ground really breaks (the main lanes, every other node)
        for (const L of this.lines) if (L.lane !== null) L.nodes.forEach((n, i) => { if (i % 2 === 0) this.nodes.push({ d: n.d, lane: L.lane, at: n.p.clone() }); });
        // the rings (a pool: made now, only moved later)
        for (let i = 0; i < 8; i++) {
            const mat = new THREE.MeshBasicMaterial({ color: 0xc7b08c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(ringGeo(), mat);
            mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 3;
            this.group.add(mesh); this.mats.push(mat);
            this.rings.push({ mesh, mat, t: 0, max: 5, life: 1, on: false });
        }
        return this.nodes;
    }

    /** One crack polyline → a lip + a dark throat (one mesh, vertex colours), and an ember seam (additive). */
    _line(poly, big, lane) {
        const n = poly.length;
        const pos = new Float32Array(n * 6 * 3), col = new Float32Array(n * 6 * 3), gpos = new Float32Array(n * 2 * 3), gcol = new Float32Array(n * 2 * 3);
        const idx = [], gidx = [];
        const c = new THREE.Color();
        const put = (arr, o, v, y) => { arr[o] = v.x; arr[o + 1] = y; arr[o + 2] = v.z; };
        for (let i = 0; i < n; i++) {
            const a = poly[Math.max(0, i - 1)].p, b = poly[Math.min(n - 1, i + 1)].p;
            _a.subVectors(b, a); _a.y = 0; if (_a.lengthSq() < 1e-6) _a.copy(this.dir); _a.normalize();
            const sx = -_a.z, sz = _a.x, w = poly[i].w, p = poly[i].p;
            // 6 vertices a node: lip L/R (wider, lighter, lifted a little), throat L/R (dark), (the ember seam has its own mesh)
            const lipW = w * 2.1 + 0.1, thW = w;
            const vs = [[-lipW, 0.0, [0.46, 0.36, 0.25]], [lipW, 0.0, [0.46, 0.36, 0.25]], [-thW, 0.02, [0.03, 0.02, 0.015]], [thW, 0.02, [0.03, 0.02, 0.015]]];
            // the lip is lighter than the soil at its outer edge and dark towards the throat: two vertex pairs, the ramp is the triangle's colour blend
            for (let k = 0; k < 4; k++) {
                const o = (i * 6 + k) * 3, [off, up, rgb] = vs[k];
                pos[o] = p.x + sx * off; pos[o + 1] = p.y + up; pos[o + 2] = p.z + sz * off;
                col[o] = rgb[0]; col[o + 1] = rgb[1]; col[o + 2] = rgb[2];
            }
            // vertices 4,5: the throat's centre line, deeper black (a spare pair so the throat reads as a depth gradient)
            for (let k = 4; k < 6; k++) { const o = (i * 6 + k) * 3; pos[o] = p.x; pos[o + 1] = p.y + 0.03; pos[o + 2] = p.z; col[o] = 0.0; col[o + 1] = 0.0; col[o + 2] = 0.0; }
            // ember seam
            const gw = w * (big ? 0.7 : 0.3), glowC = big ? c.setHex(0xff6a1a) : c.setHex(0x8a5a2a);
            put(gpos, (i * 2) * 3, { x: p.x - sx * gw, z: p.z - sz * gw }, p.y + 0.06); put(gpos, (i * 2 + 1) * 3, { x: p.x + sx * gw, z: p.z + sz * gw }, p.y + 0.06);
            const pulse = 0.55 + 0.45 * Math.sin(i * 1.7);
            for (let k = 0; k < 2; k++) { const o = (i * 2 + k) * 3; gcol[o] = glowC.r * pulse; gcol[o + 1] = glowC.g * pulse; gcol[o + 2] = glowC.b * pulse; }
            if (i < n - 1) {
                const A = i * 6, B = (i + 1) * 6;
                idx.push(A, A + 1, B, A + 1, B + 1, B); // lip (a full strip: the throat is drawn over it below)
                idx.push(A + 2, A + 3, B + 2, A + 3, B + 3, B + 2); // throat
                idx.push(A + 4, A + 5, B + 4, A + 5, B + 5, B + 4); // the black centre line (zero width: gives the depth ramp when the throat's vertices blend)
                const G = i * 2, H = (i + 1) * 2;
                gidx.push(G, G + 1, H, G + 1, H + 1, H);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
        geo.setDrawRange(0, 0);
        const gg = new THREE.BufferGeometry();
        gg.setAttribute('position', new THREE.BufferAttribute(gpos, 3)); gg.setAttribute('color', new THREE.BufferAttribute(gcol, 3)); gg.setIndex(gidx);
        gg.setDrawRange(0, 0);
        const mesh = new THREE.Mesh(geo, this.crackMat), glow = new THREE.Mesh(gg, this.glowMat);
        mesh.frustumCulled = glow.frustumCulled = false; mesh.renderOrder = 2; glow.renderOrder = 3;
        this.group.add(mesh, glow);
        this.lines.push({ mesh, glow, geo, gg, nodes: poly, opened: 0, lane });
    }

    _ring(x, y, z, max, life, color = 0xc7b08c, opacity = 0.55) {
        const r = this.rings.find((q) => !q.on) || this.rings[0];
        r.on = true; r.t = 0; r.max = max; r.life = life; r.op = opacity;
        r.mat.color.setHex(color);
        r.mesh.position.set(x, y + 0.08, z); r.mesh.scale.setScalar(0.5); r.mesh.visible = true;
    }

    /** One puff of dust: the shared smoke pool, smaller than the raw numbers (a cube of 2–3 m filled the screen) and browner. */
    _puff(x, y, z, vx, vy, vz, color, size, life, o) { this.fx.smoke?.spawn(x, y, z, vx, vy, vz, color, size * 0.5, life, o); }

    /** Act 1: the stomp. */
    stomp() {
        const o = this.origin, big = this.power > 1, fx = this.fx;
        this._ring(o.x, o.y, o.z, big ? 11 : 7, 0.7, 0xd8c29c, 0.7);
        this.after.push({ at: 0.18, fn: () => this._ring(o.x, o.y, o.z, big ? 17 : 10, 0.9, 0xb59a78, 0.5) });
        if (big) this.after.push({ at: 0.4, fn: () => this._ring(o.x, o.y, o.z, 24, 1.1, 0xa08a6a, 0.4) });
        // a crown of earth chunks thrown up round the foot, a ball of dust, a ring of dust racing out
        const n = big ? 46 : 22;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.2, sp = 3 + Math.random() * (big ? 7 : 4);
            fx.debris?.spawn(o.x + Math.cos(a) * 0.8, o.y + 0.3, o.z + Math.sin(a) * 0.8, Math.cos(a) * sp, 6 + Math.random() * (big ? 9 : 6), Math.sin(a) * sp, EARTH[i % EARTH.length], (0.3 + Math.random() * 0.45) * (big ? 1.5 : 1), 2.2 + Math.random() * 1.6, { shrink: 0.1, fade: false, spin: 12 });
        }
        for (let i = 0; i < (big ? 34 : 18); i++) {
            const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * (big ? 12 : 7);
            this._puff(o.x, o.y + 0.5, o.z, Math.cos(a) * sp, 0.8 + Math.random() * 1.6, Math.sin(a) * sp, DUST[i % DUST.length], (1.2 + Math.random() * 1.6) * (big ? 1.5 : 1), 1.6 + Math.random() * 1.4, { shrink: -0.4, spin: 1.2 });
        }
        for (let i = 0; i < 14; i++) this._puff(o.x + (Math.random() - 0.5), o.y + 0.5, o.z + (Math.random() - 0.5), (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, DUST[i % DUST.length], 1.8 + Math.random() * 1.6, 2.2 + Math.random(), { shrink: -0.35, spin: 1 });
        fx.lightFlash?.(_a.set(o.x, o.y + 1.4, o.z), big ? 0xffb066 : 0xe8c890, big ? 7 : 4, 0.45, big ? 55 : 35);
    }

    /** Every frame: `t` seconds since the stomp, `front` m the wave has run. */
    update(dt, t, front) {
        this.t = t; const big = this.power > 1, fx = this.fx;
        for (let i = this.after.length - 1; i >= 0; i--) if (t >= this.after[i].at) { this.after.splice(i, 1)[0].fn(); }
        // the cracks open as the wave reaches each node (once, even on a slow frame)
        for (const L of this.lines) {
            let k = L.opened;
            while (k < L.nodes.length && L.nodes[k].d <= front) {
                const nd = L.nodes[k], p = nd.p;
                // the earth heaves where it opens: chunks out of the mouth, dust rolling up (the host decides the real edit — SpellManager)
                const cnt = (big ? 4 : 2) * (L.lane === null ? 0.5 : 1);
                for (let j = 0; j < cnt; j++) {
                    const s = Math.random() < 0.5 ? -1 : 1;
                    fx.debris?.spawn(p.x + this.side.x * s * nd.w, p.y + 0.2, p.z + this.side.z * s * nd.w, this.side.x * s * (1 + Math.random() * 3) + this.dir.x * 1.5, 4 + Math.random() * (big ? 8 : 5), this.side.z * s * (1 + Math.random() * 3) + this.dir.z * 1.5, EARTH[(Math.random() * EARTH.length) | 0], (0.28 + Math.random() * 0.4) * (big ? 1.6 : 1), 2 + Math.random() * 1.6, { shrink: 0.1, fade: false, spin: 12 });
                }
                if (L.lane !== null) for (let j = 0; j < (big ? 3 : 2); j++) {
                    this._puff(p.x + (Math.random() - 0.5) * 1.6, p.y + 0.3, p.z + (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 2, 1.4 + Math.random() * 2.6, (Math.random() - 0.5) * 2, DUST[(Math.random() * DUST.length) | 0], 1 + Math.random() * 1.3 * (big ? 1.5 : 1), 1.4 + Math.random() * 1.4, { shrink: -0.4, spin: 1 });
                }
                if (big && L.lane !== null && k % 3 === 0) fx.glow?.spawn(p.x, p.y + 0.4, p.z, (Math.random() - 0.5) * 1.5, 3 + Math.random() * 3, (Math.random() - 0.5) * 1.5, 0xff7a20, 0.25 + Math.random() * 0.2, 1 + Math.random(), { shrink: 0.5 });
                k++;
            }
            if (k !== L.opened) { L.opened = k; L.geo.setDrawRange(0, Math.max(0, (k - 1)) * 18); L.gg.setDrawRange(0, Math.max(0, (k - 1)) * 6); }
        }
        // the wave's TIP: a bright flash and a curtain of dust + turf across its width, and a shock ring now and then
        if (front > 0 && front <= this.length + 1) {
            const f = Math.min(front, this.length);
            _a.copy(this.origin).addScaledVector(this.dir, f); const gy = this.ground(_a.x, _a.z);
            const rows = Math.max(1, Math.round(dt * (big ? 70 : 42)));
            const half = big ? 4 : 2.4;
            for (let i = 0; i < rows; i++) {
                const s = (Math.random() * 2 - 1) * half;
                this._puff(_a.x + this.side.x * s, gy + 0.3, _a.z + this.side.z * s, this.dir.x * 3 + (Math.random() - 0.5) * 2, 2 + Math.random() * 3.2, this.dir.z * 3 + (Math.random() - 0.5) * 2, DUST[(Math.random() * DUST.length) | 0], 1 + Math.random() * 1.6 * (big ? 1.4 : 1), 1.1 + Math.random() * 1.1, { shrink: -0.45, spin: 1 });
            }
            const turf = Math.max(1, Math.round(dt * (big ? 22 : 12)));
            for (let i = 0; i < turf; i++) {
                const s = (Math.random() * 2 - 1) * half * 0.8;
                fx.debris?.spawn(_a.x + this.side.x * s, gy + 0.4, _a.z + this.side.z * s, this.dir.x * (3 + Math.random() * 5) + (Math.random() - 0.5) * 2, 5 + Math.random() * (big ? 9 : 6), this.dir.z * (3 + Math.random() * 5) + (Math.random() - 0.5) * 2, EARTH[(Math.random() * EARTH.length) | 0], (0.25 + Math.random() * 0.35) * (big ? 1.5 : 1), 1.8 + Math.random() * 1.4, { shrink: 0.1, fade: false, spin: 12 });
            }
            this._tipT = (this._tipT || 0) - dt;
            if (this._tipT <= 0) { this._tipT = big ? 0.16 : 0.22; this._ring(_a.x, gy, _a.z, big ? 9 : 5.5, 0.6, 0xb59a78, 0.4); fx.lightFlash?.(_b.set(_a.x, gy + 1, _a.z), big ? 0xff9a50 : 0xe0c090, big ? 3.5 : 2, 0.18, big ? 40 : 25); }
        }
        // the aftershocks: two weaker tremors along the open crack (a ring from its middle each, the ground shakes again — the caller adds the shake)
        const done = this.length / 16;
        if (this.lines.length && !this._a1 && t > done + 0.9) { this._a1 = true; this._tremor(0.5); }
        if (this.lines.length && !this._a2 && t > done + 2.0) { this._a2 = true; this._tremor(0.32); }
        // the open crack breathes (Maxima: its magma seam pulses and sends up embers; the plain one: thin dust curls out)
        if (t > done && this.lines.length) {
            this.glowMat.opacity = (big ? 0.55 : 0.25) + Math.sin(t * 6) * (big ? 0.3 : 0.12);
            this._emberT = (this._emberT || 0) - dt;
            if (this._emberT <= 0) {
                this._emberT = big ? 0.05 : 0.18;
                const L = this.lines[0]; if (L) { const nd = L.nodes[Math.floor(Math.random() * L.nodes.length)];
                    if (big) fx.glow?.spawn(nd.p.x, nd.p.y + 0.3, nd.p.z, (Math.random() - 0.5) * 1.2, 2 + Math.random() * 3, (Math.random() - 0.5) * 1.2, Math.random() < 0.5 ? 0xff7a20 : 0xffc060, 0.18 + Math.random() * 0.2, 0.9 + Math.random() * 0.8, { shrink: 0.5 });
                    else this._puff(nd.p.x, nd.p.y + 0.2, nd.p.z, (Math.random() - 0.5) * 0.6, 0.8 + Math.random(), (Math.random() - 0.5) * 0.6, 0xb59a78, 0.6 + Math.random() * 0.6, 1.2, { shrink: -0.3, spin: 0.6 }); }
            }
        }
        // the cracks fade (they close into the ground)
        const fade = t - done - 5;
        if (fade > 0 && this.crackMat) { this.crackMat.opacity = Math.max(0, 1 - fade / 3); this.glowMat.opacity *= this.crackMat.opacity; }
        for (const r of this.rings) {
            if (!r.on) continue;
            r.t += dt; const u = r.t / r.life;
            if (u >= 1) { r.on = false; r.mesh.visible = false; continue; }
            r.mesh.scale.setScalar(0.5 + (r.max - 0.5) * (1 - (1 - u) * (1 - u)));
            r.mat.opacity = r.op * (1 - u) * (1 - u);
        }
    }

    /** An aftershock: the caller shakes the screen (`onTremor`), a ring runs from the crack's middle and dust puffs out along it. */
    _tremor(k) {
        const mid = _a.copy(this.origin).addScaledVector(this.dir, this.length * 0.5);
        this._ring(mid.x, this.ground(mid.x, mid.z), mid.z, 7 * (this.power > 1 ? 1.4 : 1), 0.8, 0xa08a6a, 0.35);
        for (let i = 0; i < 16; i++) {
            const d = 1 + Math.random() * (this.length - 1);
            const p = _b.copy(this.origin).addScaledVector(this.dir, d);
            this.this._puff(p.x + (Math.random() - 0.5) * 2, this.ground(p.x, p.z) + 0.3, p.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5), 1 + Math.random() * 1.6, (Math.random() - 0.5), DUST[i % DUST.length], 0.8 + Math.random() * 0.9, 1.4, { shrink: -0.35, spin: 0.8 });
        }
        this.onTremor?.(k, mid.clone());
    }

    dispose() {
        for (const L of this.lines) { L.geo.dispose(); L.gg.dispose(); }
        for (const m of this.mats) m.dispose();
        this.scene.remove(this.group);
        this.lines.length = 0; this.rings.length = 0;
    }
}
