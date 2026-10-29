/**
 * GhostProps.js — the loose things of the Castle of Ghosts (GhostSite.props: chairs, stools, candles, candelabras, urns), drawn and moved
 * (rules and numbers: game/GhostRules.js; the poltergeist that moves them: game/Ghosts.js).
 *
 *  - Drawn as ONE InstancedMesh per kind (all share one material: dark old wood, tarnished brass, wax, faded velvet; the colours baked into the
 *    vertices, a grain picture over them) + ONE InstancedMesh of flames (a soft additive teardrop with a halo that flickers in the shader). Only the
 *    things within GHOST.PROP_NEAR + 20 m of the hero are shown (≤ MAX_SHOWN, the nearest first); the matrices are written only when the hero
 *    walked a few metres or a thing moved.
 *  - Detail (CLAUDE.md «Запрет на примитив»): a chair has four legs with stretchers, a seat with a worn velvet cushion, back posts with finials, a top
 *    and a middle rail and three slats; a stool — a round seat, three splayed legs and a ring; a candlestick — a stepped foot, a stem with knops, a drip
 *    pan, a candle with wax runs and a wick; a candelabra — a tripod, a stem, a crossbar with scrolls, five cups and five candles; an urn — a turned
 *    body with a band, a lid with a knob and two ring handles.
 *  - Collisions (CLAUDE.md: nothing passes through anything): every thing within GHOST.PROP_NEAR of the hero has its box(es) in `game.collision` (a
 *    chair two: the seat and the back) — moved with it, removed when far or put away.
 *  - The poltergeist (`poltergeist`): a chair / a stool slides 0.35–0.8 m and turns, or turns in place, or rocks on its back legs and falls back; a candle
 *    goes out for GHOST.CANDLE_OUT s (a thin smoke puff, then it lights again). A thing NEVER moves into a block, onto another thing, onto the hero, off
 *    the floor or into a narrow passage (a doorway: walls close on both sides) — the place is checked by solid blocks first; sliding is smooth (~0.6 s).
 *  - What a thing did is remembered per castle (a small map: only the moved ones), so a chair stays where it slid when the castle comes again.
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';
import { GHOST, between } from '../game/GhostRules.js';

export const PROP_KINDS = ['chair', 'stool', 'candle', 'candelabra', 'urn'];
const CAP = { chair: 56, stool: 40, candle: 40, candelabra: 20, urn: 28 };
export const MAX_SHOWN = 160;
const MAX_FLAMES = 120;
/** A footprint's half-size (m) and the height it fills — for the free-place check and the boxes. */
export const PROP_SIZE = { chair: { r: 0.75, h: 3.3 }, stool: { r: 0.62, h: 1.5 }, candle: { r: 0.36, h: 2.35 }, candelabra: { r: 0.6, h: 2.9 }, urn: { r: 0.5, h: 1.42 } };
const MOVABLE = new Set(['chair', 'stool']);
const LIT = new Set(['candle', 'candelabra']);

// ------------------------------------------------------------------ shapes (built once)
const C = { wood: 0x3b2717, wood2: 0x2c1d11, velvet: 0x4d161b, brass: 0x7a6334, brass2: 0x5c4a28, wax: 0xe7ddc6, wax2: 0xd8ccb0, wick: 0x161412, urn: 0x47433f, band: 0x8c7639, verd: 0x3f5a52 };
const _col = new THREE.Color();
function tint(geo, hex, jitter = 0.04, seed = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    _col.setHex(hex);
    for (let i = 0; i < n; i++) {
        const k = 1 + jitter * Math.sin(i * 12.9898 + seed * 78.233) * Math.cos(i * 0.37 + seed); // (no two faces quite the same: old, uneven)
        a[i * 3] = _col.r * k; a[i * 3 + 1] = _col.g * k; a[i * 3 + 2] = _col.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, s = 12) => new THREE.CylinderGeometry(r0, r1, h, s);
const sph = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const P = (geo, hex, pos, rot, scale, j, s) => ({ geo: tint(geo, hex, j ?? 0.04, s ?? 1), pos, rot: rot || undefined, scale: scale || undefined });

function chairParts() {
    const out = [], L = 0.58;
    for (const [x, z] of [[-L, L], [L, L]]) out.push(P(box(0.16, 1.42, 0.16), C.wood2, [x, 0.71, z]));
    for (const x of [-L, L]) {
        out.push(P(box(0.16, 3.3, 0.16), C.wood2, [x, 1.65, -L]));
        out.push(P(sph(0.11), C.wood, [x, 3.36, -L])); // (the finials)
        out.push(P(box(0.09, 0.09, 1.16), C.wood, [x, 0.45, 0])); // (side stretchers)
    }
    out.push(P(box(1.16, 0.09, 0.09), C.wood, [0, 0.35, L]));
    out.push(P(box(1.16, 0.09, 0.09), C.wood, [0, 0.55, -L]));
    out.push(P(box(1.42, 0.16, 1.42), C.wood, [0, 1.5, 0]));
    out.push(P(box(1.22, 0.09, 1.18), C.velvet, [0, 1.62, 0.04], [0.02, 0, 0], [1, 1, 1], 0.08, 3)); // (a worn velvet cushion)
    out.push(P(box(1.4, 0.22, 0.14), C.wood, [0, 3.1, -L]));
    out.push(P(box(1.2, 0.12, 0.1), C.wood, [0, 1.98, -L]));
    for (const x of [-0.32, 0, 0.32]) out.push(P(box(0.14, 1.02, 0.06), C.wood, [x, 2.5, -L]));
    return out;
}
function stoolParts() {
    const out = [];
    out.push(P(cyl(0.6, 0.58, 0.14, 16), C.wood, [0, 1.43, 0]));
    for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3, x = Math.cos(a) * 0.4, z = Math.sin(a) * 0.4;
        out.push(P(cyl(0.05, 0.065, 1.42, 8), C.wood2, [x * 1.1, 0.7, z * 1.1], [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]));
    }
    out.push(P(new THREE.TorusGeometry(0.44, 0.03, 6, 20), C.wood, [0, 0.5, 0], [Math.PI / 2, 0, 0]));
    return out;
}
function candleParts(at = [0, 0, 0], top = 1.78) {
    const [x0, y0, z0] = at, out = [];
    out.push(P(cyl(0.11, 0.24, 0.05, 14), C.brass2, [x0, y0 + top, z0])); // (the drip pan)
    out.push(P(cyl(0.085, 0.085, 0.5, 12), C.wax, [x0, y0 + top + 0.27, z0], null, null, 0.02, 7));
    for (let k = 0; k < 4; k++) { // (wax runs down the side and over the pan)
        const a = k * 1.9 + 0.4, l = 0.12 + 0.06 * (k % 2);
        out.push(P(sph(0.03, 6, 5), C.wax2, [x0 + Math.cos(a) * 0.085, y0 + top + 0.38 - k * 0.07, z0 + Math.sin(a) * 0.085], null, [1, l / 0.03 * 0.6, 1]));
    }
    out.push(P(sph(0.06, 8, 6), C.wax2, [x0 + 0.13, y0 + top + 0.03, z0 + 0.05], null, [1.2, 0.4, 1]));
    out.push(P(cyl(0.012, 0.012, 0.06, 5), C.wick, [x0, y0 + top + 0.55, z0]));
    return out;
}
function candleStandParts() {
    return [
        P(cyl(0.38, 0.42, 0.08, 16), C.brass2, [0, 0.04, 0]),
        P(cyl(0.12, 0.32, 0.22, 16), C.brass, [0, 0.19, 0]),
        P(cyl(0.05, 0.06, 1.5, 10), C.brass, [0, 1.03, 0]),
        P(sph(0.1), C.brass2, [0, 0.72, 0], null, [1, 0.7, 1]),
        P(sph(0.09), C.brass2, [0, 1.32, 0], null, [1, 0.7, 1]),
        ...candleParts([0, 0, 0], 1.78),
    ];
}
const CANDELABRA_CUPS = [[-0.95, 2.48], [-0.5, 2.6], [0, 2.78], [0.5, 2.6], [0.95, 2.48]];
function candelabraParts() {
    const out = [];
    for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; out.push(P(box(0.12, 0.08, 0.62), C.brass2, [Math.sin(a) * 0.26, 0.05, Math.cos(a) * 0.26], [0.12, a, 0])); }
    out.push(P(cyl(0.12, 0.2, 0.3, 12), C.brass, [0, 0.22, 0]));
    out.push(P(cyl(0.06, 0.075, 2.1, 10), C.brass, [0, 1.4, 0]));
    for (const y of [0.9, 1.7]) out.push(P(sph(0.11), C.brass2, [0, y, 0], null, [1, 0.6, 1]));
    out.push(P(cyl(0.04, 0.04, 1.9, 8), C.brass, [0, 2.38, 0], [0, 0, Math.PI / 2]));
    for (const s of [-1, 1]) out.push(P(new THREE.TorusGeometry(0.22, 0.028, 6, 14, Math.PI), C.brass2, [s * 0.5, 2.36, 0], [0, 0, Math.PI])); // (the scrolls under the bar)
    for (const [x, y] of CANDELABRA_CUPS) {
        if (y > 2.42) out.push(P(cyl(0.035, 0.035, y - 2.38, 6), C.brass, [x, (y + 2.38) / 2, 0]));
        out.push(P(cyl(0.08, 0.15, 0.05, 12), C.brass2, [x, y, 0]));
        out.push(P(cyl(0.065, 0.065, 0.38, 10), C.wax, [x, y + 0.21, 0], null, null, 0.02, x * 9));
        out.push(P(sph(0.026, 6, 5), C.wax2, [x + 0.065, y + 0.24, 0.01], null, [1, 2.8, 1]));
        out.push(P(cyl(0.01, 0.01, 0.05, 5), C.wick, [x, y + 0.42, 0]));
    }
    return out;
}
function urnParts() {
    const prof = [[0.0, 0], [0.28, 0], [0.28, 0.05], [0.2, 0.13], [0.3, 0.3], [0.45, 0.52], [0.48, 0.66], [0.42, 0.86], [0.32, 1.0], [0.21, 1.12], [0.22, 1.2], [0.3, 1.27], [0.29, 1.3], [0.0, 1.3]].map(([r, y]) => new THREE.Vector2(r, y));
    return [
        P(new THREE.LatheGeometry(prof, 18), C.urn, [0, 0, 0], null, null, 0.06, 5),
        P(cyl(0.465, 0.475, 0.06, 18), C.band, [0, 0.62, 0]),
        P(cyl(0.425, 0.42, 0.04, 18), C.verd, [0, 0.86, 0]),
        P(new THREE.SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.urn, [0, 1.29, 0], null, [1, 0.45, 1]),
        P(sph(0.06), C.band, [0, 1.43, 0]),
        ...[-1, 1].map((s) => P(new THREE.TorusGeometry(0.16, 0.035, 6, 14), C.band, [s * 0.38, 1.0, 0], [0, Math.PI / 2, 0])),
    ];
}
/** Where the flames are (local, over the wick). */
export const FLAMES = { candle: [[0, 2.36, 0]], candelabra: CANDELABRA_CUPS.map(([x, y]) => [x, y + 0.45, 0]) };

let _geos = null, _mat = null, _flameGeo = null, _flameMat = null;
export function propGeometries() {
    if (_geos) return _geos;
    _geos = { chair: mergeParts(chairParts()), stool: mergeParts(stoolParts()), candle: mergeParts(candleStandParts()), candelabra: mergeParts(candelabraParts()), urn: mergeParts(urnParts()) };
    return _geos;
}
/** The grain picture (one, small, made once): long fibres with knots and wear — it shades wood, brass and wax alike a little. */
function grainTexture() {
    const W = 64, d = new Uint8Array(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const f = Math.sin(y * 0.9 + Math.sin(x * 0.21) * 2.2 + Math.sin(x * 0.05 + y * 0.03) * 4) * 0.5 + 0.5;
        const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        const knot = Math.exp(-((x - 40) ** 2 + (y - 22) ** 2) / 30) * 0.25;
        const v = Math.round(255 * Math.max(0, Math.min(1, 0.8 + 0.14 * f + 0.06 * Math.abs(n) - knot)));
        d.set([v, v, v, 255], (y * W + x) * 4);
    }
    const t = new THREE.DataTexture(d, W, W, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipMapLinearFilter; t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
}
export function propMaterial() {
    if (!_mat) { _mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grainTexture(), roughness: 0.74, metalness: 0.18 }); _mat.name = 'ghostProps'; }
    return _mat;
}
function flameGeometry() {
    if (_flameGeo) return _flameGeo;
    const a = new THREE.PlaneGeometry(0.42, 0.62); a.translate(0, 0.26, 0);
    const b = a.clone(); b.rotateY(Math.PI / 2);
    _flameGeo = mergeParts([{ geo: a }, { geo: b }]);
    return _flameGeo;
}
export function flameMaterial() {
    if (_flameMat) return _flameMat;
    _flameMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */`
            varying vec2 vUv; varying float vSeed;
            uniform float uTime;
            void main() {
                vUv = uv;
                vec3 p = position;
                vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
                float t = uTime * (7.0 + vSeed * 3.0) + vSeed * 40.0;
                p.x += sin(t) * 0.03 * uv.y + sin(t * 2.3) * 0.015 * uv.y;
                p.z += cos(t * 1.7) * 0.02 * uv.y;
                p.y *= 0.88 + 0.14 * sin(t * 1.3) * sin(t * 0.7);
                gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
            }`,
        fragmentShader: /* glsl */`
            varying vec2 vUv; varying float vSeed;
            void main() {
                float x = (vUv.x - 0.5) * 2.0, y = vUv.y;
                float fy = clamp((y - 0.2) / 0.55, 0.0, 1.0);
                float w = 0.34 * sin(3.14159 * pow(fy, 0.62)) * (1.0 - fy * 0.2) + 0.001;
                float f = (1.0 - smoothstep(0.0, w, abs(x))) * step(0.2, y) * (1.0 - smoothstep(0.7, 0.78, y));
                float core = (1.0 - smoothstep(0.0, w * 0.45, abs(x))) * smoothstep(0.22, 0.32, y) * (1.0 - smoothstep(0.45, 0.6, y));
                float blue = (1.0 - smoothstep(0.2, 0.3, y)) * (1.0 - smoothstep(0.0, 0.12, abs(x))) * step(0.15, y);
                float r = length(vec2(x, (y - 0.38) * 1.6));
                float halo = exp(-r * r * 5.0) * 0.35;
                vec3 col = vec3(1.0, 0.55, 0.16) * f + vec3(1.0, 0.95, 0.75) * core + vec3(0.3, 0.45, 1.0) * blue * 0.7 + vec3(1.0, 0.62, 0.25) * halo;
                gl_FragColor = vec4(col, 1.0);
            }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    _flameMat.name = 'ghostFlame';
    return _flameMat;
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler(), _v = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const ease = (k) => k * k * (3 - 2 * k);

export class GhostProps {
    /** `game` may be null (a picture): no collisions then, everything is free. */
    constructor(game, scene) {
        this.game = game;
        this.scene = scene;
        const G = propGeometries(), M = propMaterial();
        this.meshes = {};
        for (const k of PROP_KINDS) {
            const m = new THREE.InstancedMesh(G[k], M, CAP[k]);
            m.count = 0; m.visible = false; m.frustumCulled = false; m.name = 'ghostProp_' + k;
            m.castShadow = false; m.receiveShadow = true;
            this.meshes[k] = m;
        }
        this.flames = new THREE.InstancedMesh(flameGeometry(), flameMaterial(), MAX_FLAMES);
        this.flames.count = 0; this.flames.visible = false; this.flames.frustumCulled = false; this.flames.renderOrder = 4; this.flames.name = 'ghostFlames';
        this.added = false;
        this.site = null;
        this.recs = []; // the shown ones: {i (index in site.props), base, st (memory), slot, flame0, nfl, boxes}
        this._at = new THREE.Vector3(1e9, 0, 0);
        this._dirty = false;
        this._mem = new Map(); // site key → Map(index → {dx, dz, da, out})
        this.anims = [];
        this.boxCount = 0;
        this.log = [];
    }

    /** Samples for Game.prewarm: the shared material and the flame's shader. */
    static samples() {
        const G = propGeometries();
        const a = new THREE.InstancedMesh(G.chair, propMaterial(), 1); a.setMatrixAt(0, _m.identity());
        const b = new THREE.InstancedMesh(flameGeometry(), flameMaterial(), 1); b.setMatrixAt(0, _m.identity());
        return [a, b];
    }

    _key(site) { return site ? (site.id ?? `${Math.round(site.x)},${Math.round(site.z)}`) : null; }
    _memOf(site) {
        const k = this._key(site);
        let m = this._mem.get(k);
        if (!m) {
            m = new Map(); this._mem.set(k, m);
            if (this._mem.size > 8) this._mem.delete(this._mem.keys().next().value); // (a few castles remembered: nothing piles up)
        }
        return m;
    }

    /** The castle changed (or is gone: null). */
    setSite(site) {
        if (site === this.site) return;
        this.clear();
        this.site = site;
        this._dirty = true;
    }

    // ------------------------------------------------------------------ the place a thing may stand
    _solid(x, y, z) {
        const data = this.game?.terrain?.data;
        if (!data) return false;
        if (data.landMade && !data.landMade(x, z)) return true; // (land not made: never there)
        return data.isSolidAt ? data.isSolidAt(x, y, z) : false;
    }

    /** May a thing of `kind` stand at (x, y floor, z)? No block in its room, a floor under it, not a narrow passage, not on the hero, not on another thing. */
    freeAt(kind, x, y, z, skip = null) {
        const S = PROP_SIZE[kind] || PROP_SIZE.chair, r = S.r;
        if (!this._solid(x, y - 0.3, z) && this.game?.terrain?.data) return false; // (a floor under it)
        for (const h of [0.25, Math.min(1.2, S.h * 0.5), S.h - 0.2]) {
            for (const [ox, oz] of [[0, 0], [r, r], [-r, r], [r, -r], [-r, -r], [r, 0], [-r, 0], [0, r], [0, -r]]) if (this._solid(x + ox, y + h, z + oz)) return false;
        }
        // a doorway / a narrow passage: walls close on both sides of it (the hero must always get through: CLAUDE.md, ways 3 m)
        const yy = y + 1.2;
        const near = (dx, dz) => this._solid(x + dx * 1.3, yy, z + dz * 1.3) || this._solid(x + dx * 2.3, yy, z + dz * 2.3);
        if ((near(1, 0) && near(-1, 0)) || (near(0, 1) && near(0, -1))) return false;
        const me = this.game?.character?.group?.position;
        if (me && Math.hypot(me.x - x, me.z - z) < r + 1.1) return false;
        for (const q of this.recs) {
            if (q === skip) continue;
            const qx = q.base.x + (q.st?.dx || 0), qz = q.base.z + (q.st?.dz || 0);
            if (Math.abs(q.base.y - y) < 2 && Math.hypot(qx - x, qz - z) < r + (PROP_SIZE[q.base.kind]?.r || 0.5) + 0.15) return false;
        }
        return true;
    }

    // ------------------------------------------------------------------ the frame
    update(dt, hero, t) {
        flameMaterial().uniforms.uTime.value = t;
        const site = this.site;
        if (!site || !hero) { if (this.recs.length) this.clear(); return; }
        const scene = this.scene || this.game?.scene;
        if (!this.added && scene) { for (const m of Object.values(this.meshes)) scene.add(m); scene.add(this.flames); this.added = true; }
        if (this._dirty || hero.distanceToSquared(this._at) > 9) this._rebuild(hero);
        // the tricks going on
        for (let i = this.anims.length - 1; i >= 0; i--) {
            const A = this.anims[i];
            A.t += dt;
            const k = Math.min(1, A.t / A.dur), q = A.rec;
            if (A.type === 'slide') { const e = ease(k); q.st.dx = A.fx + (A.tx - A.fx) * e; q.st.dz = A.fz + (A.tz - A.fz) * e; q.st.da = A.fa + (A.ta - A.fa) * e; }
            else if (A.type === 'rock') q.tilt = Math.sin(Math.PI * k) * A.amp * (1 - 0.3 * k) + (k > 0.85 ? Math.sin((k - 0.85) * 60) * 0.02 * (1 - k) * 6 : 0);
            this._write(q);
            if (k >= 1) { q.tilt = 0; this._write(q); this._boxes(q); this.anims.splice(i, 1); }
        }
        // the candles: out for a while, then lit again
        for (const q of this.recs) {
            if (!q.st || !(q.st.out > 0)) continue;
            q.st.out -= dt;
            if (q.st.out <= 0) { q.st.out = 0; this._flames(q, true); }
        }
        // the boxes: only near the hero (hysteresis)
        for (const q of this.recs) {
            const d = Math.hypot(q.base.x + (q.st?.dx || 0) - hero.x, q.base.z + (q.st?.dz || 0) - hero.z);
            if (!q.boxes && d < GHOST.PROP_NEAR) this._boxes(q);
            else if (q.boxes && d > GHOST.PROP_NEAR + 6) this._unbox(q);
        }
    }

    _rebuild(hero) {
        this._at.copy(hero);
        this._dirty = false;
        const site = this.site, props = site.props || [], mem = this._memOf(site);
        const R = GHOST.PROP_NEAR + 20, R2 = R * R;
        const cand = [];
        for (let i = 0; i < props.length; i++) {
            const b = props[i], dx = b.x - hero.x, dz = b.z - hero.z, d2 = dx * dx + dz * dz;
            if (d2 < R2 && this.meshes[b.kind]) cand.push([d2, i]);
        }
        cand.sort((a, b) => a[0] - b[0]);
        const keep = new Map(this.recs.map((q) => [q.i, q]));
        const used = { chair: 0, stool: 0, candle: 0, candelabra: 0, urn: 0 };
        const next = [];
        let nfl = 0;
        for (const [, i] of cand) {
            if (next.length >= MAX_SHOWN) break;
            const b = props[i];
            if (used[b.kind] >= CAP[b.kind]) continue;
            let q = keep.get(i);
            if (q) keep.delete(i);
            else { let st = mem.get(i); if (!st) st = { dx: 0, dz: 0, da: 0, out: 0 }; q = { i, base: b, st, tilt: 0, boxes: null }; }
            q.slot = used[b.kind]++;
            const fl = FLAMES[b.kind]?.length || 0;
            if (fl && nfl + fl <= MAX_FLAMES) { q.flame0 = nfl; q.nfl = fl; nfl += fl; } else { q.flame0 = -1; q.nfl = 0; }
            next.push(q);
        }
        for (const q of keep.values()) { this._unbox(q); this._forget(q); }
        // a rec that left mid-trick: its trick is finished at once
        this.anims = this.anims.filter((A) => next.includes(A.rec) || (this._finish(A), false));
        this.recs = next;
        for (const k of PROP_KINDS) { this.meshes[k].count = used[k]; this.meshes[k].visible = used[k] > 0; }
        this.flames.count = nfl; this.flames.visible = nfl > 0;
        for (const q of next) this._write(q, false);
        for (const m of Object.values(this.meshes)) m.instanceMatrix.needsUpdate = true;
        this.flames.instanceMatrix.needsUpdate = true;
    }

    _finish(A) { const q = A.rec; if (A.type === 'slide') { q.st.dx = A.tx; q.st.dz = A.tz; q.st.da = A.ta; } q.tilt = 0; }
    _forget(q) { if (q.st && (q.st.dx || q.st.dz || q.st.da || q.st.out > 0)) this._memOf(this.site).set(q.i, q.st); }

    _matrix(q, out) {
        const b = q.base, st = q.st || {};
        _q.setFromEuler(_e.set(0, (b.a || 0) + (st.da || 0), 0));
        out.compose(_p.set(b.x + (st.dx || 0), b.y, b.z + (st.dz || 0)), _q, _s.set(1, 1, 1));
        if (q.tilt) { // (rocking on the back legs: the pivot at the back edge)
            _m2.makeTranslation(0, 0, -0.58); out.multiply(_m2);
            _m2.makeRotationX(-q.tilt); out.multiply(_m2);
            _m2.makeTranslation(0, 0, 0.58); out.multiply(_m2);
        }
        return out;
    }

    _write(q, flag = true) {
        const mesh = this.meshes[q.base.kind];
        if (!mesh || q.slot == null) return;
        this._matrix(q, _m);
        mesh.setMatrixAt(q.slot, _m);
        if (flag) mesh.instanceMatrix.needsUpdate = true;
        this._flames(q, !(q.st?.out > 0), flag);
    }

    _flames(q, lit, flag = true) {
        if (!(q.nfl > 0)) return;
        const F = FLAMES[q.base.kind];
        this._matrix(q, _m);
        for (let k = 0; k < q.nfl; k++) {
            if (!lit) { this.flames.setMatrixAt(q.flame0 + k, ZERO); continue; }
            _v.set(F[k][0], F[k][1], F[k][2]).applyMatrix4(_m);
            _m2.makeTranslation(_v.x, _v.y, _v.z);
            this.flames.setMatrixAt(q.flame0 + k, _m2);
        }
        if (flag) this.flames.instanceMatrix.needsUpdate = true;
    }

    // ------------------------------------------------------------------ collisions
    _boxes(q) {
        const col = this.game?.collision;
        if (!col?.addBox) return;
        this._unbox(q);
        const b = q.base, st = q.st || {}, S = PROP_SIZE[b.kind];
        const x = b.x + (st.dx || 0), z = b.z + (st.dz || 0), a = (b.a || 0) + (st.da || 0);
        const ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
        const aabb = (hx, hz, cx, cz) => ({ hx: hx * ca + hz * sa, hz: hx * sa + hz * ca, cx: x + cx * Math.cos(a) + cz * Math.sin(a), cz: z - cx * Math.sin(a) + cz * Math.cos(a) });
        const add = (A, y0, y1) => col.addBox({ minX: A.cx - A.hx, maxX: A.cx + A.hx, minY: b.y + y0, maxY: b.y + y1, minZ: A.cz - A.hz, maxZ: A.cz + A.hz, kind: 'ghostProp', noSupport: true });
        const ids = [];
        if (b.kind === 'chair') { ids.push(add(aabb(0.72, 0.72, 0, 0), 0, 1.66)); ids.push(add(aabb(0.72, 0.1, 0, -0.58), 1.66, 3.42)); }
        else if (b.kind === 'candle') ids.push(add(aabb(0.2, 0.2, 0, 0), 0, 2.34));
        else ids.push(add(aabb(S.r * 0.85, S.r * 0.85, 0, 0), 0, S.h));
        q.boxes = ids;
        this.boxCount += ids.length;
    }
    _unbox(q) {
        if (!q.boxes) return;
        for (const id of q.boxes) this.game?.collision?.removeBox?.(id);
        this.boxCount -= q.boxes.length;
        q.boxes = null;
    }

    // ------------------------------------------------------------------ the poltergeist
    /**
     * A trick near the hero: a chair slides / turns / rocks, or a candle goes out. Prefers things in front of him (`look`: a unit vector), 4–16 m off.
     * @returns {{kind, what, x, y, z}|null}
     */
    poltergeist(hero, look, rnd = Math.random) {
        if (!this.recs.length || !hero) return null;
        const list = [];
        for (const q of this.recs) {
            if (this.anims.some((A) => A.rec === q)) continue;
            const b = q.base, x = b.x + q.st.dx, z = b.z + q.st.dz;
            const dx = x - hero.x, dz = z - hero.z, d = Math.hypot(dx, dz);
            if (d < 3.5 || d > GHOST.PROP_NEAR || Math.abs(b.y - (hero.y - 2)) > 5) continue;
            const front = look ? (dx * look.x + dz * look.z) / Math.max(d, 1e-3) : 0;
            const w = (front > 0.3 ? 3 : 1) * (d < 16 ? 2 : 1) * (LIT.has(b.kind) && !(q.st.out > 0) ? 1 : MOVABLE.has(b.kind) ? 1.4 : 0);
            if (w > 0) list.push([w, q]);
        }
        let sum = 0; for (const [w] of list) sum += w;
        let pick = rnd() * sum;
        for (const [w, q] of list) {
            if ((pick -= w) > 0) continue;
            const r = this._trick(q, rnd);
            if (r) return r;
        }
        return null;
    }

    _trick(q, rnd) {
        const b = q.base, st = q.st, x = b.x + st.dx, z = b.z + st.dz;
        const at = { kind: b.kind, x, y: b.y + 1, z };
        if (LIT.has(b.kind)) {
            if (!(q.nfl > 0)) return null;
            st.out = between(GHOST.CANDLE_OUT, rnd());
            this._flames(q, false);
            const fx = this.game?.fx;
            if (fx?.spark) { // (a thin curl of smoke from every wick)
                this._matrix(q, _m);
                for (const f of FLAMES[b.kind]) { _v.set(f[0], f[1], f[2]).applyMatrix4(_m); for (let k = 0; k < 5; k++) fx.spark(_v, 0x8a8a90, 0.05 + 0.03 * k, new THREE.Vector3((rnd() - 0.5) * 0.1, 0.35 + 0.1 * k, (rnd() - 0.5) * 0.1), 1.6 + 0.3 * k); }
            }
            this._memOf(this.site).set(q.i, st);
            this.log.push({ what: 'out', i: q.i }); if (this.log.length > 30) this.log.shift();
            return { ...at, what: 'out' };
        }
        if (!MOVABLE.has(b.kind)) return null;
        const roll = rnd();
        if (roll < 0.25 && b.kind === 'chair') { // rocks on its back legs and falls back
            this.anims.push({ type: 'rock', rec: q, t: 0, dur: 0.9, amp: 0.22 + 0.1 * rnd() });
            this._unbox(q);
            this.log.push({ what: 'rock', i: q.i }); if (this.log.length > 30) this.log.shift();
            return { ...at, what: 'rock' };
        }
        for (let k = 0; k < 6; k++) { // a slide (and a turn), or a turn in place
            const turnOnly = roll > 0.8;
            const a = rnd() * Math.PI * 2, d = turnOnly ? 0 : 0.35 + 0.45 * rnd();
            const tx = st.dx + Math.cos(a) * d, tz = st.dz + Math.sin(a) * d;
            if (Math.hypot(tx, tz) > 2.5) continue; // (never wanders off its place)
            const ta = st.da + (rnd() - 0.5) * (turnOnly ? 1.6 : 0.8);
            if (!this.freeAt(b.kind, b.x + tx, b.y, b.z + tz, q)) continue;
            this.anims.push({ type: 'slide', rec: q, t: 0, dur: turnOnly ? 0.8 : 0.6, fx: st.dx, fz: st.dz, fa: st.da, tx, tz, ta });
            this._unbox(q); // (the box comes back where it stops: the hand is not pushed through it meanwhile — it is under it, the box would only jump)
            this._memOf(this.site).set(q.i, st);
            this.log.push({ what: turnOnly ? 'turn' : 'slide', i: q.i, tx, tz }); if (this.log.length > 30) this.log.shift();
            return { ...at, what: turnOnly ? 'turn' : 'slide' };
        }
        return null;
    }

    /** Put away: nothing drawn, no boxes left (what was moved is remembered). */
    clear() {
        for (const A of this.anims) this._finish(A);
        this.anims.length = 0;
        for (const q of this.recs) { this._unbox(q); if (this.site) this._forget(q); }
        this.recs = [];
        for (const m of Object.values(this.meshes)) { m.count = 0; m.visible = false; }
        this.flames.count = 0; this.flames.visible = false;
        this._at.set(1e9, 0, 0);
    }

    /** (pictures) Shows exactly these things. */
    showDemo(list, t = 0) {
        this.site = { id: 'demo', props: list };
        this.update(0, new THREE.Vector3(list[0].x, 0, list[0].z), t);
    }

    dispose() {
        this.clear();
        for (const m of Object.values(this.meshes)) m.parent?.remove(m);
        this.flames.parent?.remove(this.flames);
    }
}
