/**
 * PentagramFx.js — how the black magic of «Пентаграниум» looks (Pentagranium.js, Pentagrams.js). Cheap by the project's rules:
 *  - the TRAIL of the wand on the ground: ONE preallocated ribbon mesh (a wide soft scorched band and a narrow bright red core,
 *    each its own draw), grown stitch by stitch — nothing made in the frame;
 *  - a lit PENTAGRAM: ONE merged mesh (the ring, the outer ring with ticks, the star, five small sigils at its points) and ONE
 *    glow disc draped on the ground, both with ONE shared shader (the pulse, the hell flare and the fade are per-mesh uniforms);
 *    the shapes are made once per placement (a few hundred vertices) and freed when it goes out; at most PENT.MAX_ALIVE;
 *  - smoke, embers and hellfire — the shared spark pool (`fx.spark`), the red glow — the shared flash light (`fx.lightFlash`):
 *    no PointLight per pentagram.
 */

import * as THREE from 'three';
import { PENT, figureLines } from '../game/PentagramRules.js';

const RIBBON_VERT = `
attribute float aAlong;
varying vec2 vUv;
varying float vAlong;
varying float vRad;
uniform vec3 uCenter;
void main() {
    vUv = uv;
    vAlong = aAlong;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vRad = length(wp.xz - uCenter.xz);
    gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// the figure: a bright core in a darker crimson band with a scorched edge (it must be seen on bright grass too, so it is
// painted with normal blending, not just added light); the light runs along it, the hell flare turns it to white-orange fire
const FIGURE_FRAG = `
varying vec2 vUv;
varying float vAlong;
varying float vRad;
uniform float uTime;
uniform float uHell;
uniform float uFade;
uniform float uRadius;
uniform float uDark;
uniform vec3 uTone;
void main() {
    float across = abs(vUv.y * 2.0 - 1.0);
    float core = pow(1.0 - across, 2.5);
    float band = pow(1.0 - across, 1.1);
    float edge = smoothstep(1.0, 0.45, across);
    float run = 0.5 + 0.5 * sin(vAlong * 1.7 - uTime * (2.2 + uHell * 5.0));
    float flick = 0.9 + 0.1 * sin(uTime * 9.0 + vAlong * 0.9);
    vec3 scorch = mix(uTone * 0.32, vec3(0.12, 0.0, 0.025), uDark);
    vec3 crimson = mix(uTone, mix(vec3(0.78, 0.04, 0.14), vec3(1.0, 0.38, 0.06), uHell), uDark);
    vec3 hotcore = mix(mix(uTone, vec3(1.0), 0.75), mix(vec3(1.0, 0.45, 0.5), vec3(1.0, 0.92, 0.6), uHell), uDark);
    vec3 col = mix(scorch, crimson, band) + hotcore * core * (0.45 + 0.35 * run);
    float a = edge * (0.82 + 0.18 * run) * flick * uFade;
    gl_FragColor = vec4(col, a);
}`;

// the ground inside: charred earth, embers breathing in it; in the rite it glows from within
const DISC_FRAG = `
varying vec2 vUv;
varying float vAlong;
varying float vRad;
uniform float uTime;
uniform float uHell;
uniform float uFade;
uniform float uRadius;
uniform float uDark;
uniform vec3 uTone;
void main() {
    float u = clamp(vRad / (uRadius * 1.3), 0.0, 1.0);
    float disc = pow(1.0 - u, 1.4);
    float smoke = 0.5 + 0.5 * sin(vRad * 2.3 - uTime * 1.6) * sin(vRad * 0.9 + uTime * 0.7);
    vec3 charred = mix(vec3(0.05, 0.0, 0.012), vec3(0.55, 0.1, 0.0) * (0.4 + 0.6 * smoke), uHell * 0.9);
    vec3 col = mix(mix(uTone, vec3(1.0), 0.5) * (0.7 + 0.3 * smoke), charred, uDark);
    float a = disc * mix(0.34 + 0.1 * smoke, 0.66 + 0.2 * uHell, uDark) * uFade;
    gl_FragColor = vec4(col, a);
}`;

// ---- the trail: a ribbon of quads grown stitch by stitch (preallocated)
const TRAIL_QUADS = PENT.MAX_PTS + 8;

function ribbonTexture() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 64;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 4, 64);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.ClampToEdgeWrapping;
    return t;
}

let _tex = null;
let _trailMats = null;
let _figMat = null, _discMat = null;

function trailMaterials() {
    if (_trailMats) return _trailMats;
    _tex = _tex || ribbonTexture();
    const mk = (color, opacity) => new THREE.MeshBasicMaterial({
        map: _tex, color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false,
        toneMapped: false,
    });
    _trailMats = { glow: mk(0x8a5a10, 0.55), core: mk(0xfff0b8, 1) }; // (a warm gold-white glow: the drawing itself is beautiful — only a black pentagram looks grim)
    return _trailMats;
}

function figureUniforms() {
    return { uTime: { value: 0 }, uHell: { value: 0 }, uFade: { value: 1 }, uRadius: { value: 4 }, uDark: { value: 0 }, uTone: { value: new THREE.Color(1, 0.9, 0.6) }, uCenter: { value: new THREE.Vector3() } };
}
function figureMaterial() {
    if (_figMat) return _figMat;
    _figMat = new THREE.ShaderMaterial({ vertexShader: RIBBON_VERT, fragmentShader: FIGURE_FRAG, uniforms: figureUniforms(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    _figMat.polygonOffset = true; _figMat.polygonOffsetFactor = -2; _figMat.polygonOffsetUnits = -2;
    return _figMat;
}
function discMaterial() {
    if (_discMat) return _discMat;
    _discMat = new THREE.ShaderMaterial({ vertexShader: RIBBON_VERT, fragmentShader: DISC_FRAG, uniforms: figureUniforms(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    _discMat.polygonOffset = true; _discMat.polygonOffsetFactor = -1; _discMat.polygonOffsetUnits = -1;
    return _discMat;
}

/** A builder of flat ribbons draped on the ground: segments (x0,z0)→(x1,z1) of a width `w`, heights from `h(x, z)`. */
class Ribbons {
    constructor() { this.pos = []; this.uv = []; this.al = []; this.idx = []; }
    seg(h, x0, z0, x1, z1, w, along0, lift = 0.07) {
        const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1e-6;
        const nx = -dz / len * w / 2, nz = dx / len * w / 2;
        const o = this.pos.length / 3;
        const y0 = h(x0, z0) + lift, y1 = h(x1, z1) + lift;
        this.pos.push(x0 + nx, y0, z0 + nz, x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz, x1 - nx, y1, z1 - nz);
        this.uv.push(0, 0, 0, 1, 1, 0, 1, 1);
        this.al.push(along0, along0, along0 + len, along0 + len);
        this.idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
        return len;
    }
    polyline(h, pts, w, closed = false, along0 = 0, lift) {
        let a = along0;
        const n = pts.length;
        for (let i = 0; i < (closed ? n : n - 1); i++) {
            const p = pts[i], q = pts[(i + 1) % n];
            a += this.seg(h, p[0], p[1], q[0], q[1], w, a, lift);
        }
        return a;
    }
    geometry() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        g.setAttribute('aAlong', new THREE.Float32BufferAttribute(this.al, 1));
        g.setIndex(this.idx);
        g.computeBoundingSphere();
        return g;
    }
}

/**
 * The shapes of one pentagram of radius R at (cx, cz): the ring and the star of the figure (a ribbon each), an outer ring with
 * ticks, five small sigils at the star's points. Pure arithmetic over `h` (ground heights), exported for tests.
 */
export function figureGeometry(cx, cz, R, pent, rot, h) {
    const rb = new Ribbons();
    const at = (a, r) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
    const ring = [], outer = [];
    const N = 96;
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; ring.push(at(a, R)); outer.push(at(a, R * 1.14 + 0.05)); }
    rb.polyline(h, ring, Math.max(0.32, R * 0.09), true);
    rb.polyline(h, outer, 0.14, true);
    // the figure's lines (the star): each cut into short pieces so it follows the ground; the same way round as the recognition found it
    const lines = figureLines(pent, rot).map((poly) => poly.map(([x, z]) => [cx + x * R, cz + z * R]));
    const corners = [];
    lines.forEach((poly, li) => {
        for (let k = 0; k < poly.length; k++) {
            const a = poly[k], b = poly[(k + 1) % poly.length], pcs = Math.max(4, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.6));
            const pts = [];
            for (let i = 0; i <= pcs; i++) pts.push([a[0] + (b[0] - a[0]) * i / pcs, a[1] + (b[1] - a[1]) * i / pcs]);
            rb.polyline(h, pts, Math.max(0.28, R * 0.08), false, (li * 5 + k) * 3.1);
            if (!corners.some((c) => Math.hypot(c[0] - a[0], c[1] - a[1]) < 0.01)) corners.push(a);
        }
    });
    // ticks between the rings (a calendar of small strokes) and a sigil (a small ring with a dot and a cross) at each corner of the figure
    for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2, p = at(a, R * 1.035), q = at(a, R * 1.11);
        rb.seg(h, p[0], p[1], q[0], q[1], i % 5 === 0 ? 0.16 : 0.07, i * 0.7);
    }
    corners.forEach(([px, pz], k) => {
        const ax = Math.atan2(pz - cz, px - cx), sx = cx + Math.cos(ax) * R * 1.28, sz = cz + Math.sin(ax) * R * 1.28, r = Math.max(0.4, R * 0.1);
        const circ = [];
        for (let i = 0; i < 20; i++) circ.push([sx + Math.cos((i / 20) * Math.PI * 2) * r, sz + Math.sin((i / 20) * Math.PI * 2) * r]);
        rb.polyline(h, circ, 0.1, true, k);
        rb.seg(h, sx - r * 0.7, sz, sx + r * 0.7, sz, 0.08, 0);
        rb.seg(h, sx, sz - r * 0.7, sx, sz + r * 0.7, 0.08, 0);
        rb.seg(h, px + Math.cos(ax) * 0.2, pz + Math.sin(ax) * 0.2, sx - Math.cos(ax) * r, sz - Math.sin(ax) * r, 0.07, 0); // (a thin line from the corner to its sigil)
    });
    return rb.geometry();
}

/** The disc of glow draped on the ground: a polar grid of `rings` × `segs`. */
export function discGeometry(cx, cz, R, h, rings = 6, segs = 40) {
    const pos = [], uv = [], al = [], idx = [];
    pos.push(cx, h(cx, cz) + 0.045, cz); uv.push(0, 0); al.push(0);
    for (let r = 1; r <= rings; r++) for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2, rr = (r / rings) * R * 1.3, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        pos.push(x, h(x, z) + 0.045, z); uv.push(0, 0); al.push(0);
    }
    for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + (s + 1) % segs);
    for (let r = 1; r < rings; r++) for (let s = 0; s < segs; s++) {
        const a = 1 + (r - 1) * segs + s, b = 1 + (r - 1) * segs + (s + 1) % segs, c = 1 + r * segs + s, d = 1 + r * segs + (s + 1) % segs;
        idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(al, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
}

export class PentagramFx {
    constructor(game) {
        this.game = game;
        this.trail = null; // {glow, core, n, last}
        this.figs = new Map(); // mark id → {group, fig, disc, uni}
        this._t = 0;
    }

    get scene() { return this.game.scene; }

    // ------------------------------------------------------------ the trail on the ground
    _ensureTrail() {
        if (this.trail || !this.scene) return this.trail;
        const m = trailMaterials();
        const mkGeo = () => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_QUADS * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
            g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(TRAIL_QUADS * 4 * 2), 2));
            const idx = new Uint16Array(TRAIL_QUADS * 6);
            for (let q = 0; q < TRAIL_QUADS; q++) { const o = q * 4; idx.set([o, o + 1, o + 2, o + 1, o + 3, o + 2], q * 6); }
            g.setIndex(new THREE.BufferAttribute(idx, 1));
            g.setDrawRange(0, 0);
            g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
            return g;
        };
        const glow = new THREE.Mesh(mkGeo(), m.glow), core = new THREE.Mesh(mkGeo(), m.core);
        for (const o of [glow, core]) { o.frustumCulled = false; o.renderOrder = 6; o.visible = false; o.userData.keep = true; this.scene.add(o); }
        this.trail = { glow, core, n: 0, last: null };
        return this.trail;
    }

    /** A fresh trail (a drawing begins). */
    trailBegin() {
        const T = this._ensureTrail();
        if (!T) return;
        T.n = 0; T.last = null;
        T.glow.geometry.setDrawRange(0, 0); T.core.geometry.setDrawRange(0, 0);
        T.glow.visible = T.core.visible = true;
    }

    /** A stitch at (x, y, z); `joined`: it continues the previous one (else a new stroke). */
    trailAdd(x, y, z, joined) {
        const T = this.trail;
        if (!T || T.n >= TRAIL_QUADS - 1) return;
        const last = T.last;
        T.last = { x, y, z };
        if (!joined || !last) return;
        const dx = x - last.x, dz = z - last.z, len = Math.hypot(dx, dz) || 1e-6;
        for (const [o, w] of [[T.glow, 0.95], [T.core, 0.3]]) {
            const nx = -dz / len * w / 2, nz = dx / len * w / 2;
            const ex = dx / len * 0.03, ez = dz / len * 0.03; // (no overlap: alpha laid twice would bead the line)
            const P = o.geometry.attributes.position, U = o.geometry.attributes.uv, i = T.n * 4;
            const ax = last.x - ex, az = last.z - ez, bx = x + ex, bz = z + ez, ya = last.y + 0.08, yb = y + 0.08;
            P.setXYZ(i, ax + nx, ya, az + nz); P.setXYZ(i + 1, ax - nx, ya, az - nz); P.setXYZ(i + 2, bx + nx, yb, bz + nz); P.setXYZ(i + 3, bx - nx, yb, bz - nz);
            U.setXY(i, 0, 0); U.setXY(i + 1, 0, 1); U.setXY(i + 2, 1, 0); U.setXY(i + 3, 1, 1);
            P.needsUpdate = true; U.needsUpdate = true;
            o.geometry.setDrawRange(0, (T.n + 1) * 6);
        }
        T.n++;
    }

    trailEnd() {
        const T = this.trail;
        if (!T) return;
        T.glow.visible = T.core.visible = false;
        T.n = 0; T.last = null;
    }

    /** Shift the opacity of the trail (the glow breathes). */
    trailPulse(t) {
        if (!_trailMats) return;
        _trailMats.glow.opacity = 0.6 + 0.15 * Math.sin(t * 5);
        _trailMats.core.opacity = 0.88 + 0.12 * Math.sin(t * 8 + 1);
    }

    // ------------------------------------------------------------ the guiding points (PentagramAssist.js): glowing marks on the ground
    /** Show the points `[{x, y, z, color}]` (one InstancedMesh: a single draw, nothing grows). */
    anchorsShow(list) {
        if (!this.scene) return;
        if (!this.anchors) {
            const c = document.createElement('canvas'); c.width = c.height = 64;
            const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
            // (a solid disc with a soft edge, painted with normal blending in a strong colour: a point of light must be seen on bright grass too)
            gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.58, 'rgba(70,70,70,1)'); gr.addColorStop(0.82, 'rgba(70,70,70,0.95)'); gr.addColorStop(1, 'rgba(70,70,70,0)'); // (a bright centre in a dark rim of the same colour: an outline, seen on pale ground and on dark)
            x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
            const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
            geo.userData.keep = true;
            const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false, fog: false });
            const mesh = new THREE.InstancedMesh(geo, mat, ANCHOR_MAX);
            mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // (the colour buffer is made at the full size, before the count is cut)
            mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 9; mesh.userData.keep = true; mesh.visible = false;
            this.scene.add(mesh);
            this.anchors = { mesh, pos: [], hover: -1 };
        }
        const A = this.anchors, n = Math.min(list.length, ANCHOR_MAX);
        A.pos = list.slice(0, n); A.hover = -1;
        for (let i = 0; i < n; i++) { const s = list[i].s ?? 1.3; _m4.makeScale(s, 1, s).setPosition(list[i].x, list[i].y + 0.12, list[i].z); A.mesh.setMatrixAt(i, _m4); A.mesh.setColorAt(i, _col.set(list[i].color ?? 0xfff0b8)); }
        A.mesh.count = n; A.mesh.visible = n > 0;
        A.mesh.instanceMatrix.needsUpdate = true; if (A.mesh.instanceColor) A.mesh.instanceColor.needsUpdate = true;
    }

    /** The point the wand is drawn to now grows; (-1: none). The others breathe by the material. */
    anchorsHover(i, t) {
        const A = this.anchors;
        if (!A || !A.mesh.visible) return;
        A.mesh.material.opacity = 0.92 + 0.08 * Math.sin(t * 4);
        if (A.hover === i) return;
        for (const k of [A.hover, i]) {
            if (k < 0 || !A.pos[k]) continue;
            const s = (A.pos[k].s ?? 1.3) * (k === i ? 1.7 : 1);
            _m4.makeScale(s, 1, s).setPosition(A.pos[k].x, A.pos[k].y + 0.12, A.pos[k].z);
            A.mesh.setMatrixAt(k, _m4);
        }
        A.hover = i;
        A.mesh.instanceMatrix.needsUpdate = true;
    }

    anchorsHide() { if (this.anchors) { this.anchors.mesh.visible = false; this.anchors.mesh.count = 0; this.anchors.hover = -1; } }

    /** A line laid straight between two points (the hand's tremble does not matter): stitches every 0.3 m. */
    trailLine(a, b, h) {
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.3));
        this.trailBreak();
        for (let i = 0; i <= n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n; this.trailAdd(x, h(x, z), z, i > 0); }
        this.trailBreak();
    }

    /** The whole perfect ring of the circle. */
    trailRing(cx, cz, r, h) {
        const n = Math.max(24, Math.ceil((Math.PI * 2 * r) / 0.3));
        this.trailBreak();
        for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; this.trailAdd(x, h(x, z), z, i > 0); }
        this.trailBreak();
    }

    /** The next stitch begins a new stroke. */
    trailBreak() { if (this.trail) this.trail.last = null; }

    // ------------------------------------------------------------ a lit pentagram
    /** A pentagram appears: the figure and the disc. `h(x, z)` → the ground's height there. */
    add(id, cx, cy, cz, R, rot, h, pent = 'devil', dark = false, glow = 0xffd98a) {
        if (!this.scene || this.figs.has(id)) return;
        const uni = { uTime: { value: 0 }, uHell: { value: 0 }, uFade: { value: 0 }, uRadius: { value: R }, uDark: { value: dark ? 1 : 0 }, uTone: { value: new THREE.Color(glow) }, uCenter: { value: new THREE.Vector3(cx, cy, cz) } };
        const set = (mesh) => { mesh.onBeforeRender = (r, s, c, g, mat) => { for (const k of Object.keys(uni)) mat.uniforms[k].value = uni[k].value; mat.uniformsNeedUpdate = true; }; };
        const fig = new THREE.Mesh(figureGeometry(cx, cz, R, pent, rot, h), figureMaterial());
        const disc = new THREE.Mesh(discGeometry(cx, cz, R, h), discMaterial());
        for (const [m, o] of [[fig, 7], [disc, 5]]) { m.frustumCulled = true; m.renderOrder = o; m.userData.keep = true; set(m); this.scene.add(m); }
        this.figs.set(id, { fig, disc, uni, cx, cy, cz, R, dark, glow });
    }

    /** Per frame: `t` seconds, the strength `fade` 0…1, the hell flare `hell` 0…1. */
    set(id, fade, hell, t) {
        const f = this.figs.get(id);
        if (!f) return;
        f.uni.uFade.value = fade; f.uni.uHell.value = hell; f.uni.uTime.value = t;
    }

    remove(id) {
        const f = this.figs.get(id);
        if (!f) return;
        this.figs.delete(id);
        for (const m of [f.fig, f.disc]) { this.scene.remove(m); m.geometry.dispose(); }
    }

    clear() { for (const id of [...this.figs.keys()]) this.remove(id); this.trailEnd(); this.anchorsHide(); }

    /** One of each (Game.prewarm): the shaders compile on the loading screen. */
    sampleModels() {
        trailMaterials();
        const flat = (x, z) => 0;
        const out = [];
        const mkTrail = (mat) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1], 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1], 2));
            g.setIndex([0, 1, 2, 1, 3, 2]);
            return new THREE.Mesh(g, mat);
        };
        out.push(mkTrail(_trailMats.glow), mkTrail(_trailMats.core));
        const fig = new THREE.Mesh(figureGeometry(0, 0, 3, 'devil', 0, flat), figureMaterial());
        const disc = new THREE.Mesh(discGeometry(0, 0, 3, flat), discMaterial());
        fig.position.set(2, 0, 2); disc.position.set(2, 0, 2);
        out.push(fig, disc);
        this.anchorsShow([{ x: 4, y: 0, z: 4, color: 0xfff0b8 }]); // (the points' shader is compiled too)
        if (this.anchors) { const c = new THREE.Mesh(this.anchors.mesh.geometry, this.anchors.mesh.material); c.position.set(-2, 0.2, 2); out.push(c); this.anchorsHide(); }
        return out;
    }

    // ------------------------------------------------------------ smoke, embers, hellfire (the shared spark pool)
    /** A dark smoke and a few embers at a stitch of the trail. */
    trailSmoke(x, y, z) {
        const fx = this.game.fx;
        if (!fx) return;
        _p.set(x + (Math.random() - 0.5) * 0.3, y + 0.15, z + (Math.random() - 0.5) * 0.3);
        fx.spark(_p, Math.random() < 0.6 ? 0xfff0b8 : 0xffc860, 0.1 + Math.random() * 0.08, _v.set((Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5), 0.8 + Math.random() * 0.5);
    }

    /** The lit pentagram lives: a thin smoke over the ring and the star. */
    ambient(f, dt, hell) {
        const fx = this.game.fx;
        if (!fx) return;
        const n = (dt * (4 + hell * 40) * (f.R / 3.5));
        let k = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
        while (k-- > 0) {
            const a = Math.random() * Math.PI * 2, onStar = Math.random() < 0.4;
            const r = onStar ? f.R * Math.random() * 0.95 : f.R * (0.98 + Math.random() * 0.06);
            _p.set(f.cx + Math.cos(a) * r, f.cy + 0.15, f.cz + Math.sin(a) * r);
            const up = 0.8 + Math.random() * (1.2 + hell * 4);
            fx.spark(_p, !f.dark ? (Math.random() < 0.5 ? 0xfff0b8 : f.glow) : hell > 0.3 ? (Math.random() < 0.5 ? 0xff6a1a : 0xffc060) : (Math.random() < 0.6 ? 0x4a0a14 : 0xc0203a), 0.16 + Math.random() * 0.14, _v.set((Math.random() - 0.5) * 0.8, up, (Math.random() - 0.5) * 0.8), 0.9 + Math.random() * 0.8);
        }
    }
}

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _col = new THREE.Color();
const ANCHOR_MAX = 256;
