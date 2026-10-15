/**
 * ShipModel.js — how a 17th-century ship looks (three.js).
 *
 * Built from the ship's layout (src/game/ShipLayout.js), in ship-local metres:
 * the hull lofted from the hull shape (dark bottom, wales, a band in the castle's
 * colour at the gun ports, gold at the stern), the bulwarks with the gangway gaps,
 * the sterncastle and the forecastle, plank decks, bulkheads with doors, stairs,
 * the masts with yards, shrouds and ratlines, sails that unroll from the yards and
 * bulge with the wind, the wheel, the capstan, the guns and their shot racks,
 * the captain's cabin (table, chairs, lantern), hammocks and barrels below,
 * stern windows that glow at night, flags, the gangplank and the rope ladders.
 * The static parts are merged into a few meshes (few draw calls).
 */

import * as THREE from 'three';
import { hullHalfWidth, keelY } from '../game/ShipLayout.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const _Y = new THREE.Vector3(0, 1, 0);
const _nm = new THREE.Matrix3(), _v3 = new THREE.Vector3();
/** Unit primitives (made once, without an index): a ship's boxes and posts are these, scaled — a new
 *  geometry for each of its hundreds of parts made a harbour's ship a long frame to build. */
const _unit = new Map();
function unitGeo(key, make) {
    let g = _unit.get(key);
    if (!g) { const m = make(); g = m.toNonIndexed(); m.dispose(); _unit.set(key, g); }
    return g;
}

/** Many coloured primitives merged into one geometry (vertex colours). */
class Batch {
    /** tint: a colour → the colour drawn (the black ship: every plank darkened — ShipModel.look) */
    constructor(tint = null) { this.pos = []; this.nor = []; this.col = []; this.tint = tint; }

    add(geo, matrix, color) {
        const g = geo.index ? geo.toNonIndexed() : geo;
        const p = g.attributes.position, n = g.attributes.normal;
        const nm = _nm.getNormalMatrix(matrix);
        _c.set(this.tint ? this.tint(color) : color);
        const v = _v3;
        for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i).applyMatrix4(matrix);
            this.pos.push(v.x, v.y, v.z);
            v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
            this.nor.push(v.x, v.y, v.z);
            this.col.push(_c.r, _c.g, _c.b);
        }
        if (g !== geo) g.dispose();
    }

    box(x0, x1, y0, y1, z0, z1, color, rotY = 0) {
        _q.setFromAxisAngle(_Y, rotY);
        _m.compose(_p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q, _s.set(Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0), Math.max(0.01, z1 - z0)));
        this.add(unitGeo('box', () => new THREE.BoxGeometry(1, 1, 1)), _m, color);
    }

    /** A box of size (sx, sy, sz) at p turned by the Euler angles. */
    boxAt(px, py, pz, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
        _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
        _m.compose(_p.set(px, py, pz), _q, _s.set(sx, sy, sz));
        this.add(unitGeo('box', () => new THREE.BoxGeometry(1, 1, 1)), _m, color);
    }

    cyl(r0, r1, len, px, py, pz, color, rx = 0, ry = 0, rz = 0, seg = 8) {
        _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
        _m.compose(_p.set(px, py, pz), _q, _s.set(1, len, 1));
        this.add(unitGeo(`cyl${r0},${r1},${seg}`, () => new THREE.CylinderGeometry(r1, r0, 1, seg)), _m, color);
    }

    /** Raw triangles (already in local space): flat list of [x,y,z] triples, with a colour per triangle. */
    tri(a, b, c, color) {
        _c.set(this.tint ? this.tint(color) : color);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        for (const p of [a, b, c]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, ny, nz); this.col.push(_c.r, _c.g, _c.b); }
    }

    quad(a, b, c, d, color) { this.tri(a, b, c, color); this.tri(a, c, d, color); }

    build() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
        // texture coordinates by the face's direction: planks run along the ship (z) on the sides,
        // along the ship on the decks, up the masts (a box projection, 1 texture = WOOD_M metres)
        const P = this.pos, N = this.nor, uv = new Float32Array((P.length / 3) * 2);
        for (let i = 0, j = 0; i < P.length; i += 3, j += 2) {
            const ax = Math.abs(N[i]), ay = Math.abs(N[i + 1]), az = Math.abs(N[i + 2]);
            let u, v;
            if (ay >= ax && ay >= az) { u = P[i + 2]; v = P[i]; } // decks, tops: along z, across x
            else if (ax >= az) { u = P[i + 2]; v = P[i + 1]; } // the sides: along z, up y
            else { u = P[i]; v = P[i + 1]; } // ends, bulkheads: across x, up y
            uv[j] = u / WOOD_M; uv[j + 1] = v / WOOD_M;
        }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.computeBoundingSphere();
        return g;
    }
}

const WOOD_M = 4; // metres of hull per wood texture

/** Seeded noise for the textures (the same look every time). */
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

/**
 * Weathered planking (grey-scale, multiplied into the vertex colours): strakes 0.45 m wide with
 * tarred seams, butt joints with iron nail heads, wavy grain, knots, darker stains and paler wear.
 * planksAcross: deck planks run along u (seams across v).
 */
function woodCanvas(size = 512, seed = 7, { strakes = 9, nails = true, light = 222 } = {}) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const x = cv.getContext('2d');
    const r = rng(seed);
    x.fillStyle = `rgb(${light},${light},${light})`;
    x.fillRect(0, 0, size, size);
    const h = size / strakes;
    for (let i = 0; i < strakes; i++) {
        const y0 = i * h;
        // each plank a little different; butt joints at random places along it
        let u = -r() * size;
        while (u < size) {
            const len = size * (0.45 + r() * 0.5);
            const shade = light - 18 + Math.floor(r() * 30);
            x.fillStyle = `rgb(${shade},${shade - 2},${shade - 6})`;
            x.fillRect(u, y0, len, h);
            // grain: long wavy lines
            for (let k = 0; k < 9; k++) {
                const gy = y0 + 2 + r() * (h - 4), amp = 0.6 + r() * 1.8, ph = r() * 6;
                x.strokeStyle = `rgba(60,40,20,${0.10 + r() * 0.14})`;
                x.lineWidth = 0.6 + r() * 0.8;
                x.beginPath();
                for (let t = 0; t <= len; t += 8) x.lineTo(u + t, gy + Math.sin(t / (18 + k * 3) + ph) * amp);
                x.stroke();
            }
            // a knot now and then
            if (r() < 0.35) {
                const kx = u + r() * len, ky = y0 + h * (0.3 + r() * 0.4);
                const g = x.createRadialGradient(kx, ky, 0.5, kx, ky, h * 0.22);
                g.addColorStop(0, 'rgba(50,30,15,0.65)'); g.addColorStop(1, 'rgba(50,30,15,0)');
                x.fillStyle = g; x.beginPath(); x.ellipse(kx, ky, h * 0.32, h * 0.18, 0, 0, Math.PI * 2); x.fill();
            }
            // the butt joint and its nails
            x.fillStyle = 'rgba(30,20,12,0.85)';
            x.fillRect(u + len - 1, y0, 2, h);
            if (nails) {
                x.fillStyle = 'rgba(25,25,28,0.9)';
                for (const ny of [0.3, 0.7]) { x.beginPath(); x.arc(u + len - 6, y0 + h * ny, 1.6, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(u + len + 6, y0 + h * ny, 1.6, 0, Math.PI * 2); x.fill(); }
            }
            u += len;
        }
        // the tarred seam between strakes
        x.fillStyle = 'rgba(20,14,8,0.9)';
        x.fillRect(0, y0, size, 2);
        x.fillStyle = 'rgba(255,255,255,0.08)';
        x.fillRect(0, y0 + 2, size, 1);
    }
    // weathering: stains and paler worn patches
    for (let k = 0; k < 40; k++) {
        const wx = r() * size, wy = r() * size, wr = 8 + r() * 40;
        const g = x.createRadialGradient(wx, wy, 0, wx, wy, wr);
        const dark = r() < 0.6;
        g.addColorStop(0, dark ? 'rgba(40,35,25,0.12)' : 'rgba(255,250,235,0.10)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
    }
    // fine noise
    const img = x.getImageData(0, 0, size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(img, 0, 0);
    return cv;
}

/** Sailcloth: vertical cloths sewn together, a little dirty towards the foot. */
function sailCanvas() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    const r = rng(11);
    x.fillStyle = '#f4efe2'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) {
        const s = 236 + Math.floor(r() * 16);
        x.fillStyle = `rgb(${s},${s - 4},${s - 14})`;
        x.fillRect(i * 32, 0, 32, 256);
        x.fillStyle = 'rgba(120,100,70,0.45)'; x.fillRect(i * 32, 0, 1.5, 256); // the seam
        x.fillStyle = 'rgba(120,100,70,0.18)'; x.fillRect(i * 32 + 4, 0, 1, 256);
    }
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,80,60,0.18)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    // reef points: a row of little ties
    x.fillStyle = 'rgba(110,90,60,0.6)';
    for (let i = 4; i < 256; i += 12) x.fillRect(i, 40, 1.5, 6);
    return cv;
}

function canvasTex(cv) {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
}

let SHARED = null;
function shared() {
    if (SHARED) return SHARED;
    const dom = typeof document !== 'undefined';
    const hullTex = dom ? canvasTex(woodCanvas(512, 7)) : null;
    const deckTex = dom ? canvasTex(woodCanvas(512, 19, { strakes: 9, light: 236 })) : null;
    const sailTex = dom ? canvasTex(sailCanvas()) : null;
    // (matte: Lambert, no shine — wood and cloth, not plastic)
    SHARED = {
        solid: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: hullTex }),
        deck: new THREE.MeshLambertMaterial({ map: deckTex, color: 0xc49a66, side: THREE.DoubleSide }),
        sail: new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, vertexColors: true, map: sailTex }),
        rope: new THREE.LineBasicMaterial({ color: 0x3a2a1a }),
        glass: new THREE.MeshBasicMaterial({ color: 0x2a2416 }),
        lit: new THREE.MeshBasicMaterial({ color: 0xffc860 }),
        iron: new THREE.MeshLambertMaterial({ color: 0x2b2b2e }),
        ball: new THREE.SphereGeometry(0.32, 10, 8),
        // the black ship (Blackbeard.js): tarred black deck, green fire in its lanterns, the black flag
        deckBlack: new THREE.MeshLambertMaterial({ map: deckTex, color: 0x5e4c40, side: THREE.DoubleSide }),
        greenFire: new THREE.MeshBasicMaterial({ color: 0x6dff8a }),
        greenDim: new THREE.MeshBasicMaterial({ color: 0x2c7a3c }),
        jolly: new THREE.MeshLambertMaterial({ map: dom ? new THREE.CanvasTexture(jollyCanvas()) : null, color: 0xffffff, side: THREE.DoubleSide }),
        bundleBlack: new THREE.MeshLambertMaterial({ color: 0x1e1b1d }),
    };
    SHARED.solid.userData.shared = true;
    return SHARED;
}

const WOOD = 0x8a5a33, DARK = 0x4a3020, BOTTOM = 0x5a3b2a, WALE = 0x2b1d14, GOLD = 0xd4a63a, IRON = 0x2f2f33, ROPE = 0x5b4630;

/**
 * The looks of ships. 'black' — Captain Black Moustache's ship: tarred black wood, dark red bands and
 * trim, tarnished brass for the gold, black ragged sails, bone-white skulls, green fire in the lanterns.
 */
export const SHIP_LOOKS = {
    black: { band: 0x6e141a, gold: 0x7d6230, bone: 0xd8cfb4, sail: 0x37323a, ragged: true, deck: 'deckBlack' },
};
const _tc = new THREE.Color();
/** The black ship's planks: every colour pulled down to near-black (a hint of its own hue kept). */
function blackTint(band, gold, bone) {
    const cache = new Map();
    return (c) => {
        if (c === band || c === bone || c === 0xffffff || c === 0x050302 || c === 0x161008) return c;
        if (c === GOLD) return gold;
        let t = cache.get(c);
        if (t === undefined) { _tc.set(c); _tc.lerp(_tc.clone().set(0x1a1412), 0.62); t = _tc.getHex(); cache.set(c, t); } // (dark tarred wood — the grain still shows: not a hole in the picture)
        return t;
    };
}

/** The barrier's shell (a unit sphere of green hexagons) and its ring — made once, shared. */
let BARRIER = null;
export function barrierParts() {
    if (BARRIER) return BARRIER;
    let map = null;
    if (typeof document !== 'undefined') {
        const cv = document.createElement('canvas');
        cv.width = 256; cv.height = 128;
        const x = cv.getContext('2d');
        x.strokeStyle = 'rgba(140,255,170,0.9)'; x.lineWidth = 2;
        const R = 10, h = R * Math.sqrt(3);
        for (let row = -1; row < 128 / h + 1; row++) for (let col = -1; col < 256 / (R * 3) + 1; col++) {
            const cx = col * R * 3 + (row % 2 ? R * 1.5 : 0), cy = row * h / 2;
            x.beginPath();
            for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2; x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
            x.stroke();
        }
        map = new THREE.CanvasTexture(cv);
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(4, 3);
    }
    const mat = (m) => new THREE.MeshBasicMaterial({ map: m, color: 0x6dff8a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    BARRIER = { shell: new THREE.SphereGeometry(1, 32, 16), shellMat: mat(map), ring: new THREE.TorusGeometry(1, 0.12, 6, 32), ringMat: mat(map) };
    return BARRIER;
}
const _Z = new THREE.Vector3(0, 0, 1);

/** The black flag: a white skull with a great curled moustache over its teeth, crossed sabres below. */
function jollyCanvas() {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 148;
    const x = cv.getContext('2d');
    x.fillStyle = '#0d0c0d'; x.fillRect(0, 0, 256, 148);
    x.fillStyle = '#efe9da'; x.strokeStyle = '#efe9da';
    // the crossed sabres
    x.lineWidth = 7; x.lineCap = 'round';
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(128 - s * 70, 136); x.quadraticCurveTo(128, 100, 128 + s * 74, 66); x.stroke(); }
    // the skull
    x.beginPath(); x.ellipse(128, 58, 34, 36, 0, 0, Math.PI * 2); x.fill();
    x.fillRect(108, 74, 40, 24);
    x.fillStyle = '#0d0c0d';
    for (const s of [-1, 1]) { x.beginPath(); x.ellipse(128 + s * 14, 54, 9, 10, 0, 0, Math.PI * 2); x.fill(); }
    x.beginPath(); x.moveTo(128, 64); x.lineTo(122, 76); x.lineTo(134, 76); x.closePath(); x.fill();
    for (let i = 0; i < 5; i++) x.fillRect(112 + i * 7.5, 90, 2.5, 8);
    // the moustache: two great curls over the teeth
    x.fillStyle = '#efe9da'; x.strokeStyle = '#0d0c0d'; x.lineWidth = 2.5;
    for (const s of [-1, 1]) {
        x.beginPath();
        x.moveTo(128, 80);
        x.bezierCurveTo(128 + s * 18, 74, 128 + s * 42, 86, 128 + s * 50, 74);
        x.bezierCurveTo(128 + s * 58, 62, 128 + s * 46, 56, 128 + s * 42, 66);
        x.bezierCurveTo(128 + s * 44, 76, 128 + s * 24, 92, 128, 86);
        x.closePath(); x.fill(); x.stroke();
    }
    return cv;
}

/**
 * A sail: a cloth hanging from its yard. It unrolls downwards (a bundle at its lower
 * edge while it is being let down), bulges to the wind's side, flutters when the
 * wind is too weak to fill it, burns from the bottom up.
 */
export class SailMesh {
    constructor(spec, color = 0xf1e8d2, opts = {}) {
        this.spec = spec;
        // ragged (the black ship): the foot torn — each column of the cloth a little shorter than the next
        this.cut = null;
        if (opts.ragged) { const r = rng(Math.abs(Math.round(spec.center.z * 31 + spec.yardY * 7)) + 3); this.cut = []; for (let i = 0; i <= 10; i++) this.cut.push(r() < 0.35 ? 0.06 + r() * 0.2 : r() * 0.05); }
        const lateen = spec.kind === 'lateen';
        this.lateen = lateen;
        this.cols = 10; this.rows = 8;
        const g = new THREE.BufferGeometry();
        const n = (this.cols + 1) * (this.rows + 1);
        this.posArr = new Float32Array(n * 3);
        this.colArr = new Float32Array(n * 3);
        const idx = [];
        for (let j = 0; j < this.rows; j++) {
            for (let i = 0; i < this.cols; i++) {
                const a = j * (this.cols + 1) + i, b = a + 1, c = a + this.cols + 1, d = c + 1;
                idx.push(a, c, b, b, c, d);
            }
        }
        g.setIndex(idx);
        g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
        g.setAttribute('color', new THREE.BufferAttribute(this.colArr, 3));
        const uv = new Float32Array(n * 2);
        for (let j = 0; j <= this.rows; j++) for (let i = 0; i <= this.cols; i++) { const k = (j * (this.cols + 1) + i) * 2; uv[k] = (i / this.cols) * spec.w / 12; uv[k + 1] = 1 - j / this.rows; }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        this.geometry = g;
        this.mesh = new THREE.Mesh(g, shared().sail);
        this.mesh.castShadow = true;
        this.base = new THREE.Color(color);
        // the rolled-up bundle along the yard
        const len = lateen ? spec.w : spec.w * 0.92;
        this.bundle = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, len, 8), opts.ragged ? shared().bundleBlack : new THREE.MeshLambertMaterial({ color: 0xe0d5bb }));
        this.bundle.rotation.z = Math.PI / 2;
        if (lateen) this.bundle.rotation.set(0, Math.PI / 2, 0);
        this.group = new THREE.Group();
        this.group.add(this.mesh, this.bundle);
        this.maxBulge = 0;
        if (lateen) this.setYard(spec.tack, spec.head, spec.clew);
        this.setState(0, 0, 1, 0, 0);
    }

    /** Where a point of the cloth is (u across 0..1, v down 0..1), before bulging. */
    _at(u, v, out) {
        const s = this.spec;
        if (!this.lateen) {
            out.x = (u - 0.5) * s.w * (1 - 0.08 * v);
            out.y = s.yardY - v * s.h;
            out.z = s.center.z;
            return out;
        }
        // lateen: the top edge along the slanting yard, the cloth narrowing to the clew
        const a = this.yardA, b = this.yardB, c = this.clew;
        const tx = a.x + (b.x - a.x) * u, ty = a.y + (b.y - a.y) * u, tz = a.z + (b.z - a.z) * u;
        out.x = tx + (c.x - tx) * v; out.y = ty + (c.y - ty) * v; out.z = tz + (c.z - tz) * v;
        return out;
    }

    setYard(a, b, clew) { this.yardA = a; this.yardB = b; this.clew = clew; }

    /**
     * unfurl 0..1 (how far it is let down), fill 0..1 (how full of wind), side ±1 (which way the
     * wind pushes it, along the sail's normal), burnt 0..1, t (s) for the flutter.
     */
    setState(unfurl, fill, side, burnt, t) {
        const s = this.spec;
        const vis = Math.max(0, unfurl * (1 - burnt));
        this.mesh.visible = vis > 0.02 && burnt < 1;
        const nx = s.normal.x, nz = s.normal.z;
        const p = { x: 0, y: 0, z: 0 };
        let maxB = 0;
        const flutter = fill > 0.02 && fill < 0.2 ? 0.3 : (fill <= 0.02 && vis > 0.3 ? 0.12 : 0);
        for (let j = 0; j <= this.rows; j++) {
            const v = (j / this.rows) * Math.max(0.02, vis);
            const char = burnt > 0 && j >= this.rows - 1 ? 0.25 : 1;
            for (let i = 0; i <= this.cols; i++) {
                const u = i / this.cols;
                this._at(u, this.cut ? v * (1 - this.cut[i] * (j / this.rows)) : v, p);
                const across = 1 - (2 * u - 1) * (2 * u - 1);
                let b = side * fill * 0.18 * s.w * across * Math.sin(Math.PI * Math.min(1, (v / Math.max(0.05, vis)) * 1.15)) * Math.min(1, vis * 1.5);
                if (this.lateen) b = side * fill * 0.16 * s.h * across * Math.sin(Math.PI * Math.min(1, v * 1.1));
                if (flutter) b += flutter * Math.sin(10 * t + 6 * u + j) * u * (this.lateen ? 1 : 1) * Math.min(1, vis);
                const k = (j * (this.cols + 1) + i) * 3;
                this.posArr[k] = p.x + nx * b; this.posArr[k + 1] = p.y; this.posArr[k + 2] = p.z + nz * b;
                if (Math.abs(b) > Math.abs(maxB)) maxB = b;
                const shade = 0.9 + 0.1 * across;
                this.colArr[k] = this.base.r * shade * char; this.colArr[k + 1] = this.base.g * shade * char; this.colArr[k + 2] = this.base.b * shade * char;
            }
        }
        this.maxBulge = maxB;
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.computeVertexNormals();
        this.geometry.computeBoundingSphere();
        this.geometry.computeBoundingBox();
        // the bundle: thick when rolled up, at the cloth's lower edge
        const r = burnt >= 1 ? 0 : Math.max(0, (1 - unfurl) * Math.min(1.1, s.h * 0.07) + (unfurl < 0.98 ? 0.12 : 0));
        this.bundle.visible = r > 0.05;
        if (this.bundle.visible) {
            this.bundle.scale.set(r, 1, r);
            if (!this.lateen) this.bundle.position.set(0, s.yardY - vis * s.h - (vis > 0.02 ? 0 : 0.3), s.center.z);
            else {
                const a = this.yardA, b = this.yardB;
                this.bundle.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.4, (a.z + b.z) / 2);
                this.bundle.rotation.set(Math.atan2(b.y - a.y, b.z - a.z) * -1 + 0, 0, 0);
                this.bundle.rotation.x = Math.PI / 2 - Math.atan2(b.y - a.y, b.z - a.z);
            }
        }
    }

    /** Height of the visible cloth (for tests). */
    clothHeight() {
        this.geometry.computeBoundingBox();
        const bb = this.geometry.boundingBox;
        return this.mesh.visible ? bb.max.y - bb.min.y : 0;
    }

    dispose() {
        this.geometry.dispose();
        this.bundle.geometry.dispose();
        if (this.bundle.material !== SHARED?.bundleBlack) this.bundle.material.dispose();
    }
}

export class ShipModel {
    /**
     * @param {object} layout  ShipLayout
     * @param {object} opts {color: castle colour, name}
     */
    constructor(layout, opts = {}) {
        this.L = layout;
        this.color = opts.color ?? 0x2a5aa0;
        // (opts.look: 'black' — Captain Black Moustache's ship, SHIP_LOOKS)
        this.look = opts.look ? SHIP_LOOKS[opts.look] || null : null;
        if (this.look) this.color = this.look.band;
        this.cursed = !!this.look; // (its green fires burn while the curse holds: setCursed)
        this.group = new THREE.Group();
        this.group.rotation.order = 'YXZ';
        this.near = new THREE.Group(); // rigging, interior, guns: hidden far away
        this.group.add(this.near);
        this.sails = new Map();
        this.cannons = new Map();
        this.racks = new Map();
        // (opts.lazy: built a little a frame — buildSome() — while the ship is still far; a harbour's
        // ship built whole in one frame was a long one in a fast flight)
        this._steps = this._buildSteps();
        this.ready = false;
        if (!opts.lazy) this.finish();
    }

    /** Go on building for about `ms`; true when the model is whole. */
    buildSome(ms = 3) {
        if (this.ready) return true;
        const t0 = performance.now();
        while (performance.now() - t0 < ms) if (this._steps.next().done) { this.ready = true; this.detail = 2; this._steps = null; return true; }
        return false;
    }

    /** Build what is left now. */
    finish() {
        if (this.ready) return;
        while (!this._steps.next().done);
        this.ready = true;
        this.detail = 2;
        this._steps = null;
    }

    *_buildSteps() {
        const L = this.L, S = shared();
        const hw = (z, y) => hullHalfWidth(L, z, y);
        const look = this.look;
        const tint = look ? blackTint(look.band, look.gold, look.bone) : null;
        const hull = new Batch(tint);
        const near = new Batch(tint);
        const D = L.deck, R = L.rail;
        // ------------------------------------------------------ hull loft
        const NZ = 34, NY = 12;
        const zs = [];
        for (let i = 0; i <= NZ; i++) zs.push(-L.L / 2 + 0.05 + (L.L - 0.1) * (i / NZ));
        const ring = (z) => {
            const pts = [];
            const k = keelY(L, z);
            for (let j = 0; j <= NY; j++) {
                const y = k + (D - k) * (j / NY);
                pts.push([hw(z, y), y]);
            }
            return pts;
        };
        const colorAt = (y) => {
            if (y < 0.3) return BOTTOM;
            if (Math.abs(y - 1.5) < 0.35 || Math.abs(y - (D - 1)) < 0.3) return WALE;
            if (y > D - 2.6 && y < D - 1.3) return this.color;
            return WOOD;
        };
        const rings = zs.map(ring);
        for (let i = 0; i < NZ; i++) {
            const a = rings[i], b = rings[i + 1], za = zs[i], zb = zs[i + 1];
            for (let j = 0; j < NY; j++) {
                const col = colorAt((a[j][1] + a[j + 1][1]) / 2);
                for (const s of [1, -1]) {
                    const p1 = [s * a[j][0], a[j][1], za], p2 = [s * b[j][0], b[j][1], zb], p3 = [s * b[j + 1][0], b[j + 1][1], zb], p4 = [s * a[j + 1][0], a[j + 1][1], za];
                    if (s > 0) hull.quad(p1, p2, p3, p4, col); else hull.quad(p1, p4, p3, p2, col);
                }
            }
        }
        // transom (flat stern) with the gold trim and the windows
        const zt = zs[NZ];
        const tr = rings[NZ];
        for (let j = 0; j < NY; j++) hull.quad([-tr[j][0], tr[j][1], zt], [tr[j][0], tr[j][1], zt], [tr[j + 1][0], tr[j + 1][1], zt], [-tr[j + 1][0], tr[j + 1][1], zt], j > NY - 3 ? GOLD : DARK);
        yield;
        // ------------------------------------------------- bulwarks (with the gangway gaps)
        const bulwark = (zA, zB, y0, y1, color = WOOD) => {
            const n = Math.max(2, Math.ceil((zB - zA) / 2.5));
            for (let i = 0; i < n; i++) {
                const z0 = zA + (zB - zA) * i / n, z1 = zA + (zB - zA) * (i + 1) / n;
                for (const s of [1, -1]) {
                    const a = [s * hw(z0, y0), y0, z0], b = [s * hw(z1, y0), y0, z1], c = [s * hw(z1, y1), y1, z1], d = [s * hw(z0, y1), y1, z0];
                    if (s > 0) hull.quad(a, b, c, d, color); else hull.quad(a, d, c, b, color);
                    // the cap rail
                    const ia = [s * (hw(z0, y1) - 0.4), y1, z0], ib = [s * (hw(z1, y1) - 0.4), y1, z1];
                    if (s > 0) hull.quad(d, c, ib, ia, DARK); else hull.quad(d, ia, ib, c, DARK);
                }
            }
        };
        const main = L.floors[0];
        const ends = [main.z0 - 1.5, L.L / 2 - 0.05];
        const gaps = L.openings.filter((o) => o.side > 0).map((o) => [o.z0, o.z1]);
        let z = ends[0];
        for (const [g0, g1] of gaps) { bulwark(z, g0, D, D + R); z = g1; }
        bulwark(z, ends[1], D, D + R);
        // the castles' sides
        for (const f of L.floors) {
            if (f.y <= D) continue;
            const zA = Math.max(f.z0, -L.L / 2 + 0.5), zB = Math.min(f.z1, L.L / 2 - 0.05);
            bulwark(zA, zB, D + R, f.y + R, f.id === 'fore' ? WOOD : WOOD);
            // the castle's end wall above the transom — from the main deck up (the cabins under the castles are
            // closed at the stern; it stood 0.4 m short of the end and was never drawn: the cabins were open to the sky)
            if (zB >= L.L / 2 - 1) {
                const w0 = hw(zB, D), w1 = hw(zB, f.y + R);
                hull.quad([-w0, D, zB], [w0, D, zB], [w1, f.y + R, zB], [-w1, f.y + R, zB], DARK);
            }
        }
        // the stern windows (glowing at night) and gold carving
        const glow = new Batch(); // the stern windows and the lanterns: one mesh that lights up at night
        const top = L.floors.reduce((m, f) => Math.max(m, f.y), D);
        for (const row of [D + 1.6, ...(top > D + 5 ? [L.floors.find((f) => f.id === 'quarter').y + 1.4] : [])]) {
            const w = hw(L.L / 2 - 0.1, row) * 0.75;
            for (let k = -2; k <= 2; k++) glow.box((k * w) / 2.6 - w / 6.4, (k * w) / 2.6 + w / 6.4, row - 0.8, row + 0.8, L.L / 2, L.L / 2 + 0.06, 0xffffff);
        }
        hull.box(-hw(L.L / 2 - 0.2, D) * 0.9, hw(L.L / 2 - 0.2, D) * 0.9, D + R - 0.3, D + R + 0.25, L.L / 2 - 0.3, L.L / 2 + 0.15, GOLD);
        this._sternDetail(hull, glow, L, D, R, hw, top);
        // the beakhead and the bowsprit
        const bz = -L.L / 2;
        hull.boxAt(0, D - 0.6, bz - 2.2, 0.8, 1.2, 5, DARK, 0.25);
        hull.cyl(0.55, 0.3, L.L * 0.32, 0, D + 2.6, bz - L.L * 0.1, WOOD, -Math.PI / 2 + 0.32);
        if (look) this._blackDetail(hull, glow, L, D, R, hw, top, bz);
        // gun ports: dark squares on the outside at every gun, lids hinged up
        for (const g of L.cannons) {
            const s = g.side, w = hw(g.z, g.muzzle.y);
            hull.boxAt(s * (w + 0.06), g.muzzle.y, g.z, 0.1, 1.2, 1.4, 0x161008);
            hull.boxAt(s * (w + 0.3), g.muzzle.y + 1.05, g.z, 0.12, 1.25, 1.45, this.color, 0, 0, s * 0.9);
        }
        // fake gun ports on the lower deck (the hull looks armed)
        if (L.floors.some((f) => f.id === 'lower')) {
            for (let zz = -L.L * 0.32; zz < L.L * 0.3; zz += 6) for (const s of [1, -1]) hull.boxAt(s * (hw(zz, 2.4) + 0.06), 2.4, zz, 0.1, 1.0, 1.2, 0x161008);
        }

        yield;
        // ------------------------------------------------------------- decks
        const deckGeo = new Batch();
        for (const f of L.floors) {
            const n = Math.max(4, Math.ceil((f.z1 - f.z0) / 1.5));
            for (let i = 0; i < n; i++) {
                const z0 = f.z0 + (f.z1 - f.z0) * i / n, z1 = f.z0 + (f.z1 - f.z0) * (i + 1) / n;
                const w0 = Math.max(0.05, f.halfAt(z0) + 0.2), w1 = Math.max(0.05, f.halfAt(z1) + 0.2);
                const hole = f.holes.find((h) => z1 > h.z0 && z0 < h.z1);
                if (hole) {
                    deckGeo.quad([-w0, f.y, z0], [-w1, f.y, z1], [hole.x0, f.y, z1], [hole.x0, f.y, z0], 0xffffff);
                    deckGeo.quad([hole.x1, f.y, z0], [hole.x1, f.y, z1], [w1, f.y, z1], [w0, f.y, z0], 0xffffff);
                } else deckGeo.quad([-w0, f.y, z0], [-w1, f.y, z1], [w1, f.y, z1], [w0, f.y, z0], 0xffffff);
                if (f.y > D) {
                    // the underside / the deck's edge thickness
                    hull.quad([-w0, f.y - 0.4, z0], [w0, f.y - 0.4, z0], [w1, f.y - 0.4, z1], [-w1, f.y - 0.4, z1], DARK);
                }
            }
            if (f.y > D) {
                const zEdge = f.id === 'fore' ? f.z1 : f.z0;
                const w = f.halfAt(zEdge) + 0.2;
                hull.box(-w, w, f.y - 0.4, f.y, zEdge - 0.05, zEdge + 0.05, DARK);
            }
        }
        const dg = deckGeo.build(); // (its planks run along the ship: Batch.build's texture coordinates)
        const deck = new THREE.Mesh(dg, look ? S[look.deck] : S.deck);
        deck.receiveShadow = true;
        this.group.add(deck);
        this.deckMesh = deck;

        yield;
        // ------------------------------------------- solids: bulkheads, rails, stairs, gear
        for (const b of L.solids) {
            switch (b.kind) {
                case 'bulkhead': near.box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, 0x7a4e2c); hull.box(b.x0, b.x1, b.y1 - 0.3, b.y1, b.z0 - 0.05, b.z1 + 0.05, DARK); break;
                case 'breastwork': hull.box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, WOOD); hull.box(b.x0, b.x1, b.y1, b.y1 + 0.15, b.z0 - 0.1, b.z1 + 0.1, DARK); break;
                case 'capstan':
                    near.cyl(0.9, 0.9, b.y1 - b.y0, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2, DARK, 0, 0, 0, 10);
                    for (let k = 0; k < 4; k++) near.boxAt((b.x0 + b.x1) / 2, b.y1 - 0.4, (b.z0 + b.z1) / 2, 4.2, 0.18, 0.18, WOOD, 0, (k * Math.PI) / 4);
                    break;
                case 'table':
                    near.box(b.x0, b.x1, b.y1 - 0.15, b.y1, b.z0, b.z1, 0x6a4024);
                    for (const sx of [b.x0 + 0.2, b.x1 - 0.2]) for (const sz of [b.z0 + 0.2, b.z1 - 0.2]) near.box(sx - 0.1, sx + 0.1, b.y0, b.y1, sz - 0.1, sz + 0.1, DARK);
                    // chairs, a map, a lantern
                    for (const s of [-1, 1]) near.box(-0.6, 0.6, b.y0, b.y0 + 1.1, (s > 0 ? b.z1 + 0.6 : b.z0 - 1.6), (s > 0 ? b.z1 + 1.6 : b.z0 - 0.6), 0x5a361c);
                    near.box(-0.9, 0.9, b.y1, b.y1 + 0.02, (b.z0 + b.z1) / 2 - 0.6, (b.z0 + b.z1) / 2 + 0.6, 0xe8dcb5);
                    break;
                case 'barrel':
                    for (let k = 0; k < 2; k++) near.cyl(0.8, 0.8, b.y1 - b.y0, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.z0 + 0.5 + k * 1.0, 0x7b5230, 0, 0, 0, 10);
                    break;
                case 'stair': near.box(b.x0 + 0.04, b.x1 - 0.04, b.y0, b.y1, b.z0, b.z1, 0x6e4a2a); break; // (boarded in under the steps)
                default: break;
            }
        }
        // stairs: steps along the ramps
        for (const r of L.ramps) {
            const rise = Math.abs(r.by - r.ay);
            const n = Math.max(3, Math.round(rise / 0.45));
            for (let k = 0; k < n; k++) {
                const t0 = k / n, t1 = (k + 1) / n;
                const y = r.ay + (r.by - r.ay) * t1;
                const za = r.az + (r.bz - r.az) * t0, zb = r.az + (r.bz - r.az) * t1;
                near.box(r.ax - r.half, r.ax + r.half, y - 0.12, y, Math.min(za, zb), Math.max(za, zb), 0x9c6c3c);
            }
            // the handrail on the open side(s): posts and a rail along the slope
            {
                const len = Math.hypot(r.bz - r.az, r.by - r.ay);
                const tilt = -Math.atan2(r.by - r.ay, r.bz - r.az);
                for (const sd of (r.id === 'hatch' ? [-1, 1] : [r.ax > 0 ? -1 : 1])) {
                    const x = r.ax + sd * (r.half + 0.08);
                    near.boxAt(x, (r.ay + r.by) / 2 + 1.15, (r.az + r.bz) / 2, 0.14, 0.14, len, 0x5a3a20, tilt);
                    const nPost = Math.max(2, Math.round(len / 1.6));
                    for (let k = 0; k <= nPost; k++) {
                        const t = k / nPost;
                        near.box(x - 0.06, x + 0.06, r.ay + (r.by - r.ay) * t, r.ay + (r.by - r.ay) * t + 1.15, r.az + (r.bz - r.az) * t - 0.06, r.az + (r.bz - r.az) * t + 0.06, DARK);
                    }
                }
            }
            for (const s of [-1, 1]) {
                const len = Math.hypot(r.bz - r.az, r.by - r.ay);
                near.boxAt(r.ax + s * (r.half + 0.08), (r.ay + r.by) / 2 + 0.4, (r.az + r.bz) / 2, 0.16, 0.5, len, DARK, -Math.atan2(r.by - r.ay, r.bz - r.az) * Math.sign(r.bz - r.az) * Math.sign(r.bz - r.az));
            }
        }
        // the hatch coaming
        if (L.hatch) {
            const h = L.floors[0].holes[0];
            for (const b of L.solids) if (b.kind === 'coaming') near.box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, DARK);
        }
        // hammocks below
        for (const n of L.nodes) {
            if (n.tag !== 'hammock') continue;
            near.boxAt(n.x + (n.x > 0 ? 1.5 : -1.5), n.y + 2.6, n.z, 1.2, 0.3, 3.2, 0xcfc3a0, 0, 0, n.x > 0 ? 0.15 : -0.15);
        }

        yield;
        // ------------------------------------------------------- masts and yards
        this.mastTops = [];
        // (each mast above a stump over its deck is a mesh of its own, with its top, yards and flag
        // pole: a mighty blow breaks it there and it falls over the side — breakMast)
        const parts = new Map();
        for (const m of L.masts) {
            const h = m.top - m.base;
            const by = Math.min(m.top - 4, m.deck + 2.5);
            const rb = Math.round((0.95 - 0.5 * (by - m.base) / h) * 100) / 100;
            hull.cyl(0.95, rb, by - m.base, 0, (m.base + by) / 2, m.z, 0x6b4526, 0, 0, 0, 10);
            const up = new Batch(tint);
            parts.set(m.id, { up, by, z: m.z });
            up.cyl(rb, 0.45, m.top - by, 0, (m.top + by) / 2 - by, 0, 0x6b4526, 0, 0, 0, 10);
            // the tops (platforms)
            const ty = L.deck + (m.top - L.deck) * 0.6;
            up.cyl(2.2, 2.2, 0.35, 0, ty - by, 0, DARK, 0, 0, 0, 10);
            this.mastTops.push({ id: m.id, y: m.top, z: m.z });
            for (const y of m.yards) {
                if (y.kind === 'square') up.cyl(0.32, 0.32, y.w, 0, y.y + 0.2 - by, -0.9, 0x5a3a20, 0, 0, Math.PI / 2, 6);
            }
        }
        yield;
        // ------------------------------------------------------------------ sails
        for (const sp of L.sails) {
            const sail = look ? new SailMesh(sp, look.sail, { ragged: look.ragged }) : new SailMesh(sp);
            if (sp.kind === 'lateen') {
                // the yard along the sail's head (the cloth hangs from it), slung beside the mast
                const a = sp.tack, b = sp.head;
                const ang = Math.atan2(b.y - a.y, b.z - a.z);
                const pt = parts.get(sp.mast);
                if (pt) pt.up.cyl(0.28, 0.2, sp.w + 1.2, a.x, (a.y + b.y) / 2 + 0.25 - pt.by, (a.z + b.z) / 2 - pt.z, 0x5a3a20, Math.PI / 2 - ang, 0, 0, 6);
                else hull.cyl(0.28, 0.2, sp.w + 1.2, a.x, (a.y + b.y) / 2 + 0.25, (a.z + b.z) / 2, 0x5a3a20, Math.PI / 2 - ang, 0, 0, 6);
            }
            sail.setState(0, 0, 1, 0, 0);
            this.group.add(sail.group);
            this.sails.set(sp.id, sail);
        }
        yield;
        // ---------------------------------------------------------- rigging
        const lines = [];
        const mastLines = new Map(); // mast id → [[from, to) in `lines`] (they fall with it)
        const mark = (id, from) => { const a = mastLines.get(id) || []; a.push([from, lines.length]); mastLines.set(id, a); };
        for (const m of L.masts) {
            const from = lines.length;
            const topY = m.top - 2;
            for (const s of [1, -1]) {
                for (let k = 0; k < 6; k++) {
                    const z0 = m.z - 2.5 + k;
                    const w = hw(z0, L.deck) - 0.1;
                    const deckY = L.railTopAt(z0) - 0.2;
                    lines.push(0, topY - k * 0.8, m.z, s * w, deckY, z0);
                }
                // ratlines between the shrouds every 1.5 m
                for (let y = L.deck + 3; y < topY - 4; y += 1.5) {
                    const t = (y - (L.railTopAt(m.z) - 0.2)) / (topY - (L.railTopAt(m.z) - 0.2));
                    const w0 = (hw(m.z - 2.5, L.deck) - 0.1) * (1 - t), w5 = (hw(m.z + 2.5, L.deck) - 0.1) * (1 - t);
                    lines.push(s * w0, y, m.z - 2.5 + 2.5 * t, s * w5, y, m.z + 2.5 - 2.5 * t);
                }
            }
            mark(m.id, from);
        }
        // stays: from each mast top forward
        for (let i = 0; i < L.masts.length; i++) {
            const m = L.masts[i];
            const to = i === 0 ? { y: L.deck + 2, z: -L.L / 2 - L.L * 0.2 } : { y: L.deck + (L.masts[i - 1].top - L.deck) * 0.6, z: L.masts[i - 1].z };
            const from = lines.length;
            lines.push(0, m.top - 1, m.z, 0, to.y, to.z);
            mark(m.id, from);
            if (i > 0) mark(L.masts[i - 1].id, from);
        }
        // the rope ladders at the gangways
        for (const ld of L.ladders) {
            for (const dz of [-0.6, 0.6]) lines.push(ld.x, ld.top, ld.z + dz, ld.x + Math.sign(ld.x) * 0.2, ld.bottom, ld.z + dz);
            for (let y = ld.bottom + 0.4; y < ld.top; y += ld.rung) lines.push(ld.x + Math.sign(ld.x) * 0.2 * (1 - (y - ld.bottom) / (ld.top - ld.bottom)), y, ld.z - 0.6, ld.x + Math.sign(ld.x) * 0.2 * (1 - (y - ld.bottom) / (ld.top - ld.bottom)), y, ld.z + 0.6);
        }
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
        this.rigging = new THREE.LineSegments(lg, S.rope);
        this._mastLines = mastLines;
        this.near.add(this.rigging);

        yield;
        // ------------------------------------------------------------- the wheel
        const helm = L.helm;
        const wheel = new THREE.Group();
        wheel.position.set(helm.x, helm.y, helm.z);
        const wb = new Batch(tint);
        const torus = new THREE.TorusGeometry(helm.rimR, 0.09, 6, 28);
        wb.add(torus, new THREE.Matrix4(), 0x6b4526);
        torus.dispose();
        for (let k = 0; k < helm.spokes; k++) {
            const a = (k / helm.spokes) * Math.PI * 2;
            const c = Math.cos(a), s = Math.sin(a);
            const g = new THREE.CylinderGeometry(0.06, 0.06, helm.handleR, 5);
            _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
            _m.compose(_p.set(-s * helm.handleR / 2, c * helm.handleR / 2, 0), _q, _s.set(1, 1, 1));
            wb.add(g, _m, 0x8a5a33);
            g.dispose();
            const k2 = new THREE.SphereGeometry(0.11, 6, 5);
            _m.makeTranslation(-s * helm.handleR, c * helm.handleR, 0);
            wb.add(k2, _m, 0x8a5a33);
            k2.dispose();
        }
        const hub = new THREE.CylinderGeometry(0.25, 0.25, 0.4, 10);
        _m.makeRotationX(Math.PI / 2);
        wb.add(hub, _m, GOLD);
        hub.dispose();
        this.wheel = new THREE.Mesh(wb.build(), S.solid);
        this.wheel.castShadow = true;
        wheel.add(this.wheel);
        this.group.add(wheel);
        this.wheelGroup = wheel;
        near.box(-0.35, 0.35, helm.y - 1.9, helm.y - 0.1, helm.z + 0.25, helm.z + 0.75, DARK); // the post and the drum
        near.cyl(0.35, 0.35, 1.8, 0, helm.y - 1.0, helm.z + 0.5, 0x6b4526, 0, 0, Math.PI / 2, 8);

        yield;
        // ------------------------------------------------------------- the guns
        // (the carriages are part of the inside; each barrel is one mesh: it jumps back when it fires)
        const bg = new Batch(tint);
        bg.cyl(0.55, 0.36, 3.0, 0, 0, 0, IRON, 0, 0, Math.PI / 2, 12);
        bg.cyl(0.62, 0.62, 0.3, -1.45, 0, 0, IRON, 0, 0, Math.PI / 2, 12);
        bg.cyl(0.45, 0.45, 0.25, 1.4, 0, 0, IRON, 0, 0, Math.PI / 2, 12);
        bg.cyl(0.3, 0.3, 0.05, 1.53, 0, 0, 0x0a0a0a, 0, 0, Math.PI / 2, 10); // the dark mouth
        const barrelGeo = bg.build();
        this._barrelGeo = barrelGeo;
        for (const g of L.cannons) {
            const yaw = g.side < 0 ? Math.PI : 0;
            const c = Math.cos(yaw), sn = Math.sin(yaw);
            const at = (x, z) => [g.x + x * c + z * sn, g.z - x * sn + z * c];
            const [cx, cz] = at(0, 0);
            near.box(cx - 1.2, cx + 1.2, g.y, g.y + 0.75, cz - 0.7, cz + 0.7, 0x5a3a20);
            for (const sx of [-0.9, 0.9]) for (const sz of [-0.75, 0.75]) { const [wx, wz] = at(sx, sz); near.cyl(0.32, 0.32, 0.2, wx, g.y + 0.3, wz, DARK, Math.PI / 2, 0, 0, 8); }
            const grp = new THREE.Group();
            grp.position.set(g.x, g.y, g.z);
            grp.rotation.y = yaw;
            const barrel = new THREE.Group();
            barrel.add(new THREE.Mesh(barrelGeo, S.solid));
            const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), S.lit);
            fuse.position.set(-1.1, 0.5, 0);
            fuse.visible = false;
            barrel.add(fuse);
            const ball = new THREE.Mesh(S.ball, S.iron);
            ball.position.set(1.25, 0, 0);
            ball.visible = false;
            barrel.add(ball);
            barrel.position.set(0, 1.35, 0);
            grp.add(barrel);
            this.near.add(grp);
            this.cannons.set(g.id, { group: grp, barrel, fuse, ball, recoil: 0 });
        }
        // the shot racks: one instanced mesh of balls for the whole ship
        this.ballSlots = [];
        for (const r of L.racks) {
            near.box(r.x - 0.5, r.x + 0.5, r.y - 0.75, r.y - 0.05, r.z - 0.6, r.z + 0.6, 0x5a3a20);
            const slots = [];
            for (let k = 0; k < r.balls; k++) slots.push([r.x + (k % 2) * 0.4 - 0.2, r.y + 0.2, r.z + Math.floor(k / 2) * 0.4 - 0.4]);
            this.racks.set(r.id, { from: this.ballSlots.length, n: slots.length, shown: slots.length });
            this.ballSlots.push(...slots);
        }
        if (this.ballSlots.length) {
            this.balls = new THREE.InstancedMesh(S.ball, S.iron, this.ballSlots.length);
            this.ballSlots.forEach((p, i) => { _m.makeTranslation(p[0], p[1], p[2]); this.balls.setMatrixAt(i, _m); });
            this.balls.instanceMatrix.needsUpdate = true;
            this.near.add(this.balls);
        }

        // ----------------------------------------------------------- flags
        this.flags = [];
        for (const m of L.masts) {
            const fg = new THREE.PlaneGeometry(4.5, 2.6, 6, 1);
            fg.translate(2.25, 0, 0);
            const flag = new THREE.Mesh(fg, look ? S.jolly : new THREE.MeshLambertMaterial({ color: this.color, side: THREE.DoubleSide }));
            flag.position.set(0, m.top + 1.2, m.z);
            const pt = parts.get(m.id);
            if (pt) pt.up.cyl(0.08, 0.08, 2.6, 0, m.top + 1.0 - pt.by, 0, DARK);
            else hull.cyl(0.08, 0.08, 2.6, 0, m.top + 1.0, m.z, DARK);
            this.group.add(flag);
            this.flags.push({ mesh: flag, base: fg.attributes.position.array.slice(), mast: m.id });
        }
        // stern lanterns
        for (const s of [-1, 1]) {
            const y = top + L.rail + 1.2;
            hull.box(s * 2.4 - 0.05, s * 2.4 + 0.05, top + L.rail, y, L.L / 2 - 0.6, L.L / 2 - 0.5, DARK);
            glow.box(s * 2.4 - 0.4, s * 2.4 + 0.4, y, y + 0.8, L.L / 2 - 0.95, L.L / 2 - 0.15, 0xffffff);
        }
        this.glow = new THREE.Mesh(glow.build(), look ? S.greenFire : S.glass);
        this.group.add(this.glow);

        // the masts above their stumps (each turns about its break when it falls)
        this.masts = new Map();
        for (const [id, pt] of parts) {
            const pivot = new THREE.Group();
            pivot.position.set(0, pt.by, pt.z);
            const mesh = new THREE.Mesh(pt.up.build(), S.solid);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            pivot.add(mesh);
            this.group.add(pivot);
            this.masts.set(id, { pivot, mesh, by: pt.by, z: pt.z, broken: false, fall: null });
        }
        const hullMesh = new THREE.Mesh(hull.build(), S.solid);
        hullMesh.castShadow = true;
        hullMesh.receiveShadow = true;
        this.group.add(hullMesh);
        this.hullMesh = hullMesh;
        if (near.pos.length) {
            const nm = new THREE.Mesh(near.build(), S.solid);
            nm.castShadow = true;
            nm.receiveShadow = true;
            this.near.add(nm);
            this.nearMesh = nm;
        }
        // holes (Bombardo, cannonballs): dark patches added at run time
        this.holes = new THREE.Group();
        this.group.add(this.holes);
    }

    /**
     * A mast broken at its stump: it falls over the side `side` (+1 starboard, −1 port) with its
     * yards, sails and flag, its rigging gone slack (`now`: already down — loading, waking).
     */
    breakMast(id, side = 1, now = false) {
        const M = this.masts?.get(id);
        if (!M || M.broken) return false;
        M.broken = true;
        const pv = M.pivot;
        // its sails and flag go with it
        for (const [sid, sail] of this.sails) {
            if (this.L.sails.find((x) => x.id === sid)?.mast !== id) continue;
            pv.add(sail.group);
            sail.group.position.set(0, -M.by, -M.z);
        }
        for (const f of this.flags || []) if (f.mast === id) { pv.add(f.mesh); f.mesh.position.set(0, f.mesh.position.y - M.by, 0); }
        // its rigging: the lines fall slack (drawn as nothing)
        const arr = this.rigging?.geometry.attributes.position;
        for (const [a, b] of this._mastLines?.get(id) || []) {
            for (let i = a; i < b; i += 3) { arr.array[i] = 0; arr.array[i + 1] = M.by; arr.array[i + 2] = M.z; }
        }
        if (arr) arr.needsUpdate = true;
        if (now) { pv.visible = false; return true; }
        M.fall = { side: side >= 0 ? 1 : -1, ang: 0, w: 0.15, t: 0, twist: (Math.random() - 0.5) * 0.4 };
        this.falling = (this.falling || 0) + 1;
        return true;
    }

    /** Broken masts falling: over the side, then down into the sea. */
    stepMasts(dt) {
        if (!this.falling) return;
        for (const M of this.masts.values()) {
            const f = M.fall;
            if (!f) continue;
            f.t += dt;
            if (f.ang < 1.7) {
                // it tips slowly, then faster and faster (its weight swings it down)
                f.w += (0.9 + 3.2 * Math.sin(Math.max(0.05, f.ang))) * dt;
                f.ang = Math.min(1.7, f.ang + f.w * dt);
                M.pivot.rotation.set(f.twist * f.ang, 0, -f.side * f.ang);
            } else {
                // in the water: it sinks away
                M.pivot.position.y -= dt * 0.8;
                M.pivot.position.x += f.side * dt * 0.6;
            }
            if (f.t > 9) { M.pivot.visible = false; M.fall = null; this.falling--; }
        }
    }

    setPose(pose) {
        this.group.position.set(pose.x, pose.y, pose.z);
        this.group.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
    }

    /** dist: metres from the camera. Far away the rigging, guns and inside are hidden; very far — all. */
    setDetail(dist) {
        const d = dist > 700 ? 0 : dist > 230 ? 1 : 2;
        if (d === this.detail) return;
        this.detail = d;
        this.group.visible = d > 0;
        this.near.visible = d > 1;
        for (const s of this.sails.values()) s.mesh.castShadow = d > 1;
    }

    setWheel(angle) { this.wheel.rotation.z = -angle; }

    setNight(on) {
        const S = shared();
        if (this._night === on) return;
        this._night = on;
        // (the black ship: green fire while the curse holds — day and night; taken, its lanterns are dark)
        this.glow.material = this.look ? (this.cursed ? (on ? S.greenFire : S.greenDim) : on ? S.lit : S.glass) : on ? S.lit : S.glass;
    }

    /**
     * The black ship's magic barrier: struck (a blast, a ball, a flame, lightning — Ships.curseSpark), a shell of
     * green hexagons round its hull flashes up and fades, and a ring runs out from where it was struck — so one can
     * see the ship is held by magic. k: how hard (1 a blast; «Инспириус» breaking through — more).
     */
    barrierHit(lx, ly, lz, k = 1) {
        if (!this.look || !this.cursed) return;
        const L = this.L;
        if (!this.barrier) {
            const B = barrierParts();
            const shell = new THREE.Mesh(B.shell, B.shellMat.clone());
            const ry = (L.floors.reduce((m, f) => Math.max(m, f.y), L.deck) + L.rail + L.draft) / 2 + 2;
            shell.scale.set(L.B / 2 + 3, ry, L.L / 2 + 4);
            shell.position.y = ry - L.draft - 1;
            shell.visible = false;
            shell.renderOrder = 5;
            this.group.add(shell);
            const rings = [];
            for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(B.ring, B.ringMat.clone()); r.visible = false; r.renderOrder = 6; this.group.add(r); rings.push({ mesh: r, t: 1 }); }
            this.barrier = { shell, rings, t: 1, k: 1, next: 0 };
        }
        const b = this.barrier;
        b.t = 0; b.k = Math.max(0.4, Math.min(2, k));
        // the ring on the shell where the line from its middle through the blow comes out of it
        const sh = b.shell, sx = sh.scale.x, sy = sh.scale.y, sz = sh.scale.z;
        const dx = lx / sx, dy = (ly - sh.position.y) / sy, dz = lz / sz;
        const n = Math.hypot(dx, dy, dz) || 1;
        const r = b.rings[b.next++ % b.rings.length];
        r.mesh.position.set((dx / n) * sx, sh.position.y + (dy / n) * sy, (dz / n) * sz);
        _v3.set(dx / sx, dy / sy, dz / sz).normalize(); // (the shell's normal there)
        r.mesh.quaternion.setFromUnitVectors(_Z, _v3);
        r.t = 0; r.k = b.k;
    }

    /** The barrier fading (every frame). */
    stepBarrier(dt) {
        const b = this.barrier;
        if (!b) return;
        b.t = Math.min(1, b.t + dt / 0.9);
        const a = (1 - b.t) * (1 - b.t);
        b.shell.visible = a > 0.01;
        b.shell.material.opacity = 0.55 * a * b.k;
        for (const r of b.rings) {
            r.t = Math.min(1, r.t + dt / 0.7);
            r.mesh.visible = r.t < 1;
            if (!r.mesh.visible) continue;
            const s = 1 + r.t * 9 * (r.k || 1);
            r.mesh.scale.set(s, s, s);
            r.mesh.material.opacity = 0.9 * (1 - r.t);
        }
    }

    /** The black ship's curse holds (green fire in the lanterns) or is gone (it was taken). */
    setCursed(on) {
        if (!this.look || this.cursed === !!on) return;
        this.cursed = !!on;
        const n = this._night;
        this._night = null;
        this.setNight(!!n);
    }

    /** Flags flutter along the apparent wind (a cue where the wind blows); windLocal: {x, z} in the ship frame. */
    updateFlags(windLocal, t) {
        const sp = Math.hypot(windLocal.x, windLocal.z);
        const ang = sp > 0.3 ? Math.atan2(-windLocal.z, windLocal.x) : -Math.PI / 2;
        for (const f of this.flags) {
            f.mesh.rotation.y = ang;
            const a = f.mesh.geometry.attributes.position;
            for (let i = 0; i < a.count; i++) {
                const x = f.base[i * 3];
                a.array[i * 3 + 2] = Math.sin(t * (3 + sp * 0.4) + x * 1.4) * 0.25 * (x / 4.5) * Math.min(1, 0.3 + sp / 6);
                a.array[i * 3 + 1] = f.base[i * 3 + 1] - (sp < 1 ? (x / 4.5) * 1.2 : 0);
            }
            a.needsUpdate = true;
        }
    }

    /**
     * A hole knocked in the hull or a deck (ship-local): a jagged black opening lying on the planking
     * (it follows the hull's curve), its edge torn — fresh pale wood — and broken planks round it
     * bent in by the blow (on a deck they hang down into the dark). The water of the hold shows in it
     * once it rises that far (updateHoles).
     */
    addHole(lx, ly, lz, r, deck = false) {
        const R = Math.max(0.45, r);
        const L = this.L;
        const n = 14, pts = [];
        let seed = Math.abs(Math.round(lx * 31 + ly * 17 + lz * 13)) + 7;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        // (planks break along the grain: a hole in the side is longer than high)
        const ax = deck ? 1 : 1.25, ay = deck ? 1.15 : 0.8;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2, k = R * (0.62 + rnd() * 0.5);
            pts.push([Math.cos(a) * k * ax, Math.sin(a) * k * ay]);
        }
        const side = lx >= 0 ? 1 : -1;
        // a point of the hole's own plane (u, v) on the ship, `out` m off the surface (+ outwards / up)
        const at = (u, v, out = 0.05) => {
            if (deck) return [lx + v, ly + out, lz + u];
            const y = Math.max(-L.draft + 0.15, ly + v), z = lz + u;
            return [side * (hullHalfWidth(L, z, y) + out), y, z];
        };
        const normal = deck ? [0, 1, 0] : [side, 0, 0];
        const hole = new THREE.Group();
        // the opening: black in the middle, dark brown at the edge (depth)
        const dark = new Batch();
        const c0 = at(0, 0, 0.06);
        for (let i = 0; i < n; i++) {
            const p = pts[i], q = pts[(i + 1) % n];
            const A = at(p[0], p[1], 0.06), B = at(q[0], q[1], 0.06);
            const m = at((p[0] + q[0]) * 0.3, (p[1] + q[1]) * 0.3, 0.06);
            dark.tri(c0, m, A, 0x050302); dark.tri(m, B, A, 0x24180d); dark.tri(c0, B, m, 0x050302);
        }
        const opening = new THREE.Mesh(dark.build(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        hole.add(opening);
        // the water of the hold seen through it (shown as it rises: updateHoles)
        const wb = new Batch();
        for (let i = 0; i < n; i++) {
            const p = pts[i], q = pts[(i + 1) % n];
            wb.tri(at(0, 0, 0.065), at(q[0] * 0.92, q[1] * 0.92, 0.065), at(p[0] * 0.92, p[1] * 0.92, 0.065), 0xffffff);
        }
        const water = new THREE.Mesh(wb.build(), new THREE.MeshBasicMaterial({ color: 0x2f6f80, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
        water.visible = false;
        hole.add(water);
        // the torn edge (fresh pale wood, splintered) and the broken planks bent in by the blow
        const wood = new Batch();
        for (let i = 0; i < n; i++) {
            const p = pts[i], q = pts[(i + 1) % n];
            const k1 = 1.12 + rnd() * 0.18, k2 = 1.12 + rnd() * 0.18;
            wood.quad(at(p[0], p[1], 0.07), at(q[0], q[1], 0.07), at(q[0] * k2, q[1] * k2, 0.07), at(p[0] * k1, p[1] * k1, 0.07), i % 2 ? 0xd1a468 : 0xb8874e);
        }
        for (let i = 0; i < n; i++) {
            if (rnd() < 0.3) continue;
            const p = pts[i];
            // planks run along the ship (u): the broken ends stick into the hole from the sides
            const du = -Math.sign(p[0] || 1) * (0.7 + rnd() * 0.3), dv = -p[1] / (R * 1.6) * (0.4 + rnd() * 0.4);
            const len = 0.35 + rnd() * R * 0.55;
            const start = at(p[0], p[1], 0.02);
            const tip = at(p[0] + du * len, p[1] + dv * len, 0.02);
            // bent in (into the hull / down into the deck) by the blast
            const bend = 0.35 + rnd() * 0.75;
            const dir = new THREE.Vector3(tip[0] - start[0], tip[1] - start[1], tip[2] - start[2]).normalize();
            dir.addScaledVector(_p.set(normal[0], normal[1], normal[2]), -Math.sin(bend)).normalize();
            const mid = new THREE.Vector3(start[0], start[1], start[2]).addScaledVector(dir, len / 2);
            _q.setFromUnitVectors(_s.set(1, 0, 0), dir);
            _m.compose(mid, _q, _s.set(1, 1, 1));
            const g = new THREE.BoxGeometry(len, 0.16 + rnd() * 0.1, 0.07);
            wood.add(g, _m, rnd() < 0.5 ? 0x6b4526 : 0x4a2e18);
            g.dispose();
            // its broken end: pale splinters
            const end = new THREE.Vector3(start[0], start[1], start[2]).addScaledVector(dir, len);
            _m.compose(end, _q, _s.set(1, 1, 1));
            const e = new THREE.BoxGeometry(0.12, 0.2, 0.09);
            wood.add(e, _m, 0xe0b878);
            e.dispose();
        }
        const wm = new THREE.Mesh(wood.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
        wm.castShadow = true;
        hole.add(wm);
        hole.userData = { ly, R, deck, water };
        this.holes.add(hole);
        return hole;
    }

    /**
     * The water inside the hull (holdY: its level, ship-local; null — dry): a sheet of water in the hold
     * (seen down the hatches, and round the feet of one standing below), and in the holes it has reached.
     */
    updateHoles(holdY, t = 0) {
        if (holdY == null) {
            if (this.holdWater) this.holdWater.visible = false;
            for (const h of this.holes.children) h.userData.water.visible = false;
            return;
        }
        if (!this.holdWater || Math.abs(this._holdY - holdY) > 0.08) this._buildHoldWater(holdY);
        this.holdWater.visible = true;
        for (const h of this.holes.children) {
            const u = h.userData;
            // a deck hole: the water comes up under it; a side one: the water inside rises in it
            const k = u.deck ? 1 - (u.ly - holdY) / 2.2 : (holdY - (u.ly - u.R * 0.8)) / (u.R * 1.6);
            const o = Math.max(0, Math.min(1, k));
            u.water.visible = o > 0.02;
            u.water.material.opacity = o * (0.78 + 0.08 * Math.sin(t * 3 + u.ly));
        }
    }

    _buildHoldWater(y) {
        const L = this.L;
        this._holdY = y;
        const left = [], right = [];
        const z0 = -L.L / 2 + 1.5, z1 = L.L / 2 - 1.5;
        for (let i = 0; i <= 24; i++) {
            const z = z0 + (z1 - z0) * (i / 24);
            const w = hullHalfWidth(L, z, Math.max(-L.draft + 0.2, y)) - 0.35;
            if (w < 0.2) continue;
            left.push([-w, z]); right.push([w, z]);
        }
        const b = new Batch();
        for (let i = 0; i + 1 < left.length; i++) {
            const a = left[i], c = left[i + 1], d = right[i + 1], e = right[i];
            b.quad([a[0], y, a[1]], [c[0], y, c[1]], [d[0], y, d[1]], [e[0], y, e[1]], 0xffffff);
        }
        if (!this.holdWater) {
            this.holdWater = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ color: 0x2c6474, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false }));
            this.holdWater.name = 'hold-water';
            this.group.add(this.holdWater);
        } else {
            this.holdWater.geometry.dispose();
            this.holdWater.geometry = b.build();
        }
    }

    /** The cannon's recoil and the fuse glow; loaded: the ball in the barrel. */
    setCannon(id, { recoil = 0, fuse = false, loaded = false } = {}) {
        const c = this.cannons.get(id);
        if (!c) return;
        c.barrel.position.x = -recoil;
        c.fuse.visible = fuse;
        c.ball.visible = loaded;
    }

    setRack(id, n) {
        const r = this.racks.get(id);
        if (!r || r.shown === n) return;
        r.shown = n;
        for (let k = 0; k < r.n; k++) {
            const p = this.ballSlots[r.from + k];
            _m.makeTranslation(p[0], p[1], p[2]);
            if (k >= n) _m.scale(_s.set(0.001, 0.001, 0.001));
            this.balls.setMatrixAt(r.from + k, _m);
        }
        this.balls.instanceMatrix.needsUpdate = true;
    }

    /**
     * A 17th-century stern, carved and gilded: galleries (balconies) with balustrades
     * at every row of windows, gilt window frames with mullions, carved pilasters,
     * quarter galleries on both sides, the castle's arms under a gilt crown on the
     * taffrail, a name board in the castle's colour, and the rudder with its iron straps.
     */
    _sternDetail(hull, glow, L, D, R, hw, top) {
        const zt = L.L / 2; // the transom's face
        const quarter = L.floors.find((f) => f.id === 'quarter');
        const rows = [D + 1.6, ...(top > D + 5 && quarter ? [quarter.y + 1.4] : [])];
        const crownY = top + R;
        // the rudder: a thick dark blade on the sternpost, iron straps (pintles)
        const keel = -L.draft;
        hull.box(-0.35, 0.35, keel + 0.2, D - 0.4, zt + 0.05, zt + 1.3, DARK);
        for (let y = keel + 0.8; y < D - 0.8; y += 1.4) hull.box(-0.42, 0.42, y, y + 0.22, zt + 0.02, zt + 1.0, IRON);
        hull.box(-0.2, 0.2, D - 0.6, D + 0.4, zt - 0.4, zt + 1.6, DARK); // the tiller head
        // a name board in the castle's colour, framed in gold, under the lower windows
        const wb = hw(zt - 0.1, D - 0.4) * 0.62;
        hull.box(-wb, wb, D - 0.9, D + 0.1, zt, zt + 0.12, this.color);
        hull.box(-wb - 0.15, wb + 0.15, D + 0.1, D + 0.25, zt, zt + 0.18, GOLD);
        hull.box(-wb - 0.15, wb + 0.15, D - 1.05, D - 0.9, zt, zt + 0.18, GOLD);
        // galleries: a balcony with a gilt balustrade under each row of windows
        for (const row of rows) {
            const w = hw(zt - 0.1, row) * 0.92;
            const y0 = row - 1.2, depth = 1.1;
            hull.box(-w, w, y0 - 0.2, y0, zt, zt + depth, DARK); // the floor
            hull.box(-w, w, y0 - 0.45, y0 - 0.2, zt + depth - 0.15, zt + depth + 0.05, GOLD); // carved edge
            for (let x = -w; x <= w + 1e-6; x += 0.45) hull.box(x - 0.06, x + 0.06, y0, y0 + 0.9, zt + depth - 0.12, zt + depth, GOLD); // balusters
            hull.box(-w, w, y0 + 0.9, y0 + 1.05, zt + depth - 0.18, zt + depth + 0.02, GOLD); // the hand rail
            for (const sx of [-1, 1]) hull.box(sx * w - 0.08, sx * w + 0.08, y0, y0 + 0.9, zt, zt + depth, GOLD);
            // the window frames and the mullions (the glass itself glows from the batch above)
            const ww = hw(zt - 0.1, row) * 0.75;
            for (let k = -2; k <= 2; k++) {
                const c = (k * ww) / 2.6, hwin = ww / 6.4 + 0.12;
                hull.box(c - hwin, c + hwin, row + 0.8, row + 1.0, zt, zt + 0.16, GOLD);
                hull.box(c - hwin, c + hwin, row - 1.0, row - 0.8, zt, zt + 0.16, GOLD);
                hull.box(c - 0.04, c + 0.04, row - 0.8, row + 0.8, zt + 0.06, zt + 0.12, DARK);
                hull.box(c - hwin + 0.1, c + hwin - 0.1, row - 0.04, row + 0.04, zt + 0.06, zt + 0.12, DARK);
            }
            // carved pilasters between the windows
            for (let k = -2; k <= 3; k++) {
                const c = ((k - 0.5) * ww) / 2.6;
                hull.box(c - 0.1, c + 0.1, row - 1.1, row + 1.15, zt, zt + 0.22, GOLD);
                hull.box(c - 0.18, c + 0.18, row + 1.0, row + 1.25, zt, zt + 0.28, GOLD); // the capital
            }
        }
        // quarter galleries: closed bays with windows on both sides near the stern
        const qz0 = zt - Math.min(9, L.L * 0.12), qz1 = zt - 0.6;
        for (const sx of [-1, 1]) {
            for (const row of rows) {
                const x = sx * hw((qz0 + qz1) / 2, row);
                const out = sx * 1.0;
                hull.box(Math.min(x, x + out), Math.max(x, x + out), row - 1.3, row + 1.2, qz0, qz1, DARK);
                hull.box(Math.min(x, x + out) - 0.05, Math.max(x, x + out) + 0.05, row + 1.2, row + 1.45, qz0 - 0.1, qz1 + 0.1, GOLD);
                hull.box(Math.min(x, x + out) - 0.05, Math.max(x, x + out) + 0.05, row - 1.5, row - 1.3, qz0 - 0.1, qz1 + 0.1, GOLD);
                for (let k = 0; k < 3; k++) {
                    const zc = qz0 + (qz1 - qz0) * (k + 0.5) / 3;
                    glow.box(x + out - 0.03 * sx - 0.03, x + out + 0.03 * sx + 0.03, row - 0.6, row + 0.6, zc - 0.5, zc + 0.5, 0xffffff);
                    hull.box(x + out - 0.08, x + out + 0.08, row - 0.75, row + 0.75, zc - 0.62, zc - 0.5, GOLD);
                    hull.box(x + out - 0.08, x + out + 0.08, row - 0.75, row + 0.75, zc + 0.5, zc + 0.62, GOLD);
                }
            }
            // a little domed roof on the top bay
            const xr = sx * hw((qz0 + qz1) / 2, rows[rows.length - 1]) + sx * 0.5;
            hull.cyl(0.9, 0.2, 1.0, xr, rows[rows.length - 1] + 1.95, (qz0 + qz1) / 2, GOLD);
        }
        // the taffrail: the castle's arms (a shield in its colour) under a gilt crown, scrolls either side
        const tw = hw(zt - 0.1, crownY) * 0.85;
        if (this.look) { this._sternSkull(hull, glow, zt, crownY, tw); return; }
        hull.box(-tw, tw, crownY - 0.35, crownY, zt - 0.2, zt + 0.2, GOLD);
        hull.box(-1.3, 1.3, crownY, crownY + 2.0, zt - 0.05, zt + 0.15, this.color); // the shield
        hull.box(-1.45, 1.45, crownY, crownY + 0.15, zt - 0.1, zt + 0.25, GOLD);
        hull.box(-1.45, -1.3, crownY, crownY + 2.0, zt - 0.1, zt + 0.25, GOLD);
        hull.box(1.3, 1.45, crownY, crownY + 2.0, zt - 0.1, zt + 0.25, GOLD);
        hull.box(-0.2, 0.2, crownY + 0.3, crownY + 1.7, zt + 0.15, zt + 0.25, GOLD); // a cross on the arms
        hull.box(-0.8, 0.8, crownY + 0.9, crownY + 1.2, zt + 0.15, zt + 0.25, GOLD);
        hull.box(-1.1, 1.1, crownY + 2.0, crownY + 2.4, zt - 0.1, zt + 0.25, GOLD); // the crown's band
        for (const x of [-0.9, 0, 0.9]) hull.box(x - 0.15, x + 0.15, crownY + 2.4, crownY + 2.9 + (x === 0 ? 0.3 : 0), zt - 0.05, zt + 0.2, GOLD);
        for (const sx of [-1, 1]) {
            // carved scrolls running down from the crown to the corners
            for (let i = 0; i < 5; i++) {
                const t = i / 4, x = sx * (1.6 + (tw - 1.6) * t), y = crownY + 1.2 * (1 - t);
                hull.boxAt(x, y, zt + 0.05, 0.6, 0.35, 0.3, GOLD, 0, 0, sx * 0.5);
            }
        }
    }

    /**
     * The black ship's own look (on top of a ship's): a bone-white skull for a figurehead on the beak (green
     * fire in its eyes, a great moustache under its nose), lanterns of green fire on posts along the rails
     * and on the castles, a dark red rail cap.
     */
    _blackDetail(hull, glow, L, D, R, hw, top, bz) {
        const bone = this.look.bone, band = this.look.band;
        // the figurehead: a skull on the beak (K: its size — big enough to be seen from afar)
        const K = 1.8, sz = bz - 4.4 - K, sy = D - 0.4;
        const box = (x0, x1, y0, y1, z0, z1, c, g = hull) => g.box(x0 * K, x1 * K, sy + y0 * K, sy + y1 * K, sz + z0 * K, sz + z1 * K, c);
        box(-1.15, 1.15, -0.2, 1.9, -1.1, 1.1, bone); // the cranium
        box(-1.25, 1.25, 0.6, 1.6, -0.9, 0.9, bone); // the temples
        box(-0.8, 0.8, -0.9, -0.2, -1.0, 0.5, bone); // the jaw
        for (const s of [-1, 1]) {
            box(s * 0.5 - 0.32, s * 0.5 + 0.32, 0.85, 1.45, -1.16, -1.1, 0x050302); // the sockets
            box(s * 0.5 - 0.14, s * 0.5 + 0.14, 1.0, 1.3, -1.2, -1.14, 0xffffff, glow); // green fire in them
            // the moustache: a curl each side under the nose
            hull.boxAt(s * 0.62 * K, sy + 0.25 * K, sz - 1.18 * K, 0.9 * K, 0.24 * K, 0.16 * K, 0x161008, 0, 0, s * -0.35);
            hull.boxAt(s * 1.05 * K, sy + 0.5 * K, sz - 1.18 * K, 0.22 * K, 0.4 * K, 0.16 * K, 0x161008, 0, 0, s * 0.4);
        }
        box(-0.14, 0.14, 0.45, 0.8, -1.16, -1.1, 0x050302); // the nose
        for (let i = 0; i < 6; i++) box(-0.6 + i * 0.24, -0.5 + i * 0.24, -0.25, 0.05, -1.06, -1.0, bone); // the teeth
        hull.box(-0.5, 0.5, sy - 0.6, sy + 0.4, sz + K, bz - 1, DARK); // (its neck on the beak)
        // a dark red cap along the rails
        for (const s of [-1, 1]) for (let z = -L.L / 2 + 6; z < L.L / 2 - 1; z += 4) {
            const w = hw(z + 2, D + R);
            hull.box(s * w - 0.25, s * w + 0.05, L.railTopAt(z + 2) - 0.12, L.railTopAt(z + 2) + 0.06, z, z + 4, band);
        }
        // lanterns of green fire on posts: along the main deck's rails, on the forecastle and the castles
        const posts = [];
        for (const z of [-L.L * 0.36, -L.L * 0.12, L.L * 0.08]) posts.push(z);
        for (const f of L.floors) if (f.y > D) posts.push(f.id === 'fore' ? f.z1 - 1.5 : f.z0 + 1.5);
        for (const z of posts) for (const s of [-1, 1]) {
            const ry = L.railTopAt(z), x = s * (hw(z, Math.min(ry, D + 12)) - 0.35);
            hull.box(x - 0.08, x + 0.08, ry, ry + 1.5, z - 0.08, z + 0.08, DARK);
            hull.box(x - 0.42, x + 0.42, ry + 1.5, ry + 1.62, z - 0.42, z + 0.42, DARK);
            glow.box(x - 0.3, x + 0.3, ry + 1.62, ry + 2.3, z - 0.3, z + 0.3, 0xffffff);
            hull.box(x - 0.36, x + 0.36, ry + 2.3, ry + 2.45, z - 0.36, z + 0.36, DARK);
        }
        void top;
    }

    /** The black ship's taffrail: a great skull over crossed bones, green fire in its eyes. */
    _sternSkull(hull, glow, zt, crownY, tw) {
        const bone = this.look.bone;
        hull.box(-tw, tw, crownY - 0.35, crownY, zt - 0.2, zt + 0.2, GOLD);
        // the crossed bones
        for (const s of [-1, 1]) {
            hull.boxAt(0, crownY + 0.9, zt + 0.15, 4.6, 0.32, 0.28, bone, 0, 0, s * 0.55);
            for (const e of [-1, 1]) hull.boxAt(e * 2.0 * Math.cos(0.55), crownY + 0.9 + s * e * 2.0 * Math.sin(0.55), zt + 0.15, 0.55, 0.55, 0.3, bone);
        }
        // the skull over them
        const y = crownY + 2.3;
        hull.box(-1.1, 1.1, y - 0.9, y + 1.0, zt - 0.05, zt + 0.35, bone);
        hull.box(-0.75, 0.75, y - 1.4, y - 0.9, zt - 0.05, zt + 0.3, bone);
        for (const s of [-1, 1]) {
            hull.box(s * 0.45 - 0.28, s * 0.45 + 0.28, y - 0.1, y + 0.45, zt + 0.35, zt + 0.4, 0x050302);
            glow.box(s * 0.45 - 0.12, s * 0.45 + 0.12, y + 0.05, y + 0.3, zt + 0.4, zt + 0.44, 0xffffff);
        }
        for (let i = 0; i < 5; i++) hull.box(-0.5 + i * 0.22, -0.4 + i * 0.22, y - 1.3, y - 1.05, zt + 0.3, zt + 0.36, 0x050302);
    }

    dispose() {
        this.group.traverse((o) => {
            if (o.isMesh || o.isLineSegments) {
                if (o.geometry !== shared().ball && o.geometry !== this._barrelGeo && o.geometry !== BARRIER?.shell && o.geometry !== BARRIER?.ring) o.geometry.dispose();
                const m = o.material;
                const S = shared();
                if (m && m !== S.solid && m !== S.deck && m !== S.sail && m !== S.rope && m !== S.glass && m !== S.lit && m !== S.iron && m !== S.deckBlack && m !== S.greenFire && m !== S.greenDim && m !== S.jolly && m !== S.bundleBlack) m.dispose();
            }
        });
        for (const s of this.sails.values()) s.dispose?.();
        this._barrelGeo?.dispose();
        this.group.parent?.remove(this.group);
    }
}
