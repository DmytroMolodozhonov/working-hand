/**
 * BoatModel.js — a small wooden rowing boat for two (the sea update, the author 05.11: «небольшие лодки, максимум туда 2 человека вместится.
 * Там нет руля, это просто такая лодочка»). Sized from the hero (~3.5 m, seated ~2.4 m): 7.4 m long, 2.9 m in the beam, 1.35 m deep at
 * the middle, the gunwale sweeping up to the bow and the stern (the sheer).
 * Local frame: +X starboard, +Y up (y = 0 the keel's bottom), −Z the bow (as the hero faces; yaw 0 looks along −z).
 *
 * Made like a real clinker boat: the hull is planked — seven strakes, each a little proud of the one below (a lapped edge darker, the
 * seams pitched), the wood's grain running along each plank, its tone varying plank by plank and weathered paler at the waterline and
 * the gunwale; inside, the ribs (frames) curve up the sides, bottom boards along the floor, two thwarts (seats), a stout gunwale cap,
 * a keel and a stem post rising at the bow, a flat transom at the stern, two oarlocks, an iron mooring ring on the stem and a coil of
 * rope in the bow. One shared geometry (vertex colours, made once — every boat the same draw call), one Lambert material.
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

export const BOAT_DIM = { L: 7.4, B: 2.9, D: 1.35, SHEER: 0.42, KEEL: 0.12, STRAKES: 7 };
/** The two seats (local): a person sits on each, facing the bow. */
export const BOAT_SEATS = [{ x: 0, y: 0.78, z: -1.25 }, { x: 0, y: 0.78, z: 1.35 }];

const D = BOAT_DIM;
let _geo = null, _mat = null;

const h01 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** The hull's half-width at (z, y): a fine bow (−z), a fuller stern ending in a transom (+z), rounded in section. */
export function boatHalfWidth(z, y) {
    const u = z / (D.L / 2); // (−1 the bow … +1 the stern)
    const plan = u < 0 ? Math.pow(Math.max(0, 1 - Math.pow(-u, 1.7)), 0.62) : 0.36 + 0.64 * Math.pow(Math.max(0, 1 - Math.pow(u, 2.4)), 0.5);
    const top = topY(z);
    const s = Math.max(0, Math.min(1, y / top));
    return (D.B / 2) * plan * Math.pow(s, 0.42);
}
/** The gunwale's height at z: deepest amidships, sweeping up to the ends (the sheer). */
export function topY(z) { const u = z / (D.L / 2); return D.D + D.SHEER * u * u * (u < 0 ? 1.15 : 0.8); }

function colorOf(base, k) { return [base[0] * k, base[1] * k, base[2] * k]; }

/** The planked skin (outside and inside) as one indexed grid with uv and colour. */
function skin(inside) {
    const NZ = 48, NY = 28, z0 = -D.L / 2 + 0.02, z1 = D.L / 2;
    const pos = [], col = [], uv = [], idx = [];
    const wood = [0.55, 0.38, 0.22], inner = [0.47, 0.32, 0.19];
    for (let i = 0; i <= NZ; i++) {
        const z = z0 + (z1 - z0) * (i / NZ), top = topY(z);
        for (let j = 0; j <= NY; j++) {
            const s = j / NY, y = top * s;
            const strake = s * D.STRAKES, k = Math.floor(Math.min(D.STRAKES - 1e-6, strake)), f = strake - k;
            let hw = boatHalfWidth(z, Math.max(0.02, y));
            // clinker: each strake's lower edge stands proud of the one under it
            hw += (inside ? -1 : 1) * 0.035 * (1 - f) * (k > 0 ? 1 : 0);
            if (inside) hw = Math.max(0, hw - 0.07);
            for (const side of [1, -1]) {
                // the plank's own tone, its grain along it, the lapped seam darker, weathered paler at the gunwale and the waterline
                const tone = 0.82 + 0.3 * h01(k * 7.3 + (side > 0 ? 0 : 3.1));
                const grain = 0.92 + 0.08 * Math.sin(z * 9 + h01(k) * 30 + Math.sin(z * 2.3 + k) * 2) * Math.sin(z * 31 + k * 5);
                const seam = f < 0.07 ? 0.55 : f > 0.94 ? 0.8 : 1;
                const water = !inside && s > 0.32 && s < 0.42 ? 1.12 : 1, sun = !inside && s > 0.85 ? 1.1 : 1;
                const c = colorOf(inside ? inner : wood, tone * grain * seam * water * sun);
                pos.push(side * hw, y + (i === 0 || i === NZ ? 0 : 0), z);
                col.push(...c);
                uv.push(i / NZ, s);
            }
        }
    }
    const row = (NY + 1) * 2;
    for (let i = 0; i < NZ; i++) {
        for (let j = 0; j < NY; j++) {
            for (let sd = 0; sd < 2; sd++) {
                const a = i * row + j * 2 + sd, b = a + row, c = a + 2, d = b + 2;
                // (each side wound so its face looks out — or in, for the inside skin)
                const out = (sd === 0) !== inside;
                if (out) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
            }
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

/** A box piece with a flat colour (and a little grain along x or z). */
function box(w, h, d, c, jitter = 0.06) {
    const g = new THREE.BoxGeometry(w, h, d);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const p = g.attributes.position;
        const k = 1 - jitter + jitter * 2 * (0.5 + 0.5 * Math.sin(p.getX(i) * 13 + p.getZ(i) * 17));
        col[i * 3] = c[0] * k; col[i * 3 + 1] = c[1] * k; col[i * 3 + 2] = c[2] * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
}
function painted(geo, c) {
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    return geo;
}

/** The whole boat's geometry (made once). */
export function boatGeometry() {
    if (_geo) return _geo;
    const parts = [{ geo: skin(false) }, { geo: skin(true) }];
    const dark = [0.36, 0.24, 0.14], mid = [0.5, 0.35, 0.21], pale = [0.66, 0.5, 0.33], iron = [0.2, 0.2, 0.22];
    // the gunwale cap: short straight pieces following the sheer, both sides
    const N = 22;
    for (let i = 0; i < N; i++) {
        const za = -D.L / 2 + 0.25 + (D.L - 0.35) * (i / N), zb = -D.L / 2 + 0.25 + (D.L - 0.35) * ((i + 1) / N), zm = (za + zb) / 2;
        const ya = topY(za), yb = topY(zb);
        for (const sd of [1, -1]) {
            const xa = boatHalfWidth(za, ya), xb = boatHalfWidth(zb, yb);
            const len = Math.hypot(xb - xa, yb - ya, zb - za);
            const g = box(0.16, 0.1, len + 0.02, dark);
            parts.push({ geo: g, pos: [sd * (xa + xb) / 2, (ya + yb) / 2 + 0.03, zm], rot: [Math.atan2(yb - ya, zb - za) * -1, Math.atan2(sd * (xb - xa), zb - za), 0] });
        }
    }
    // the ribs: thin frames curving up the inside, every 0.55 m
    for (let z = -D.L / 2 + 1.0; z < D.L / 2 - 0.4; z += 0.55) {
        const top = topY(z), M = 7;
        for (let k = 0; k < M; k++) {
            const ya = top * (k / M) + 0.08, yb = top * ((k + 1) / M) - 0.02;
            for (const sd of [1, -1]) {
                const xa = Math.max(0.05, boatHalfWidth(z, ya) - 0.1), xb = Math.max(0.05, boatHalfWidth(z, yb) - 0.1);
                const len = Math.hypot(xb - xa, yb - ya);
                parts.push({ geo: box(0.07, len, 0.09, mid, 0.1), pos: [sd * (xa + xb) / 2, (ya + yb) / 2, z], rot: [0, 0, -sd * Math.atan2(xb - xa, yb - ya)] });
            }
        }
    }
    // the bottom boards (along the floor) and the two thwarts with their knees
    for (let k = -2; k <= 2; k++) parts.push({ geo: box(0.3, 0.05, D.L * 0.62, k % 2 ? mid : pale, 0.12), pos: [k * 0.33, 0.2, 0.15] });
    for (const s of [BOAT_SEATS[0], BOAT_SEATS[1]]) {
        const w = boatHalfWidth(s.z, s.y) * 2 - 0.12;
        parts.push({ geo: box(w, 0.09, 0.5, pale, 0.1), pos: [0, s.y - 0.045, s.z] });
        for (const sd of [1, -1]) parts.push({ geo: box(0.08, 0.32, 0.08, dark), pos: [sd * (w / 2 - 0.05), s.y + 0.1, s.z] }); // (the knees up to the gunwale)
    }
    // the keel under it, the stem post at the bow, the transom at the stern
    parts.push({ geo: box(0.16, D.KEEL, D.L - 0.9, dark), pos: [0, -D.KEEL / 2 + 0.03, 0.2] });
    const stem = topY(-D.L / 2) + 0.2;
    parts.push({ geo: box(0.17, stem, 0.2, dark), pos: [0, stem / 2, -D.L / 2 + 0.06], rot: [-0.18, 0, 0] });
    const tw = boatHalfWidth(D.L / 2 - 0.03, topY(D.L / 2)) * 2;
    parts.push({ geo: box(tw, topY(D.L / 2) - 0.1, 0.09, mid, 0.1), pos: [0, (topY(D.L / 2) + 0.1) / 2, D.L / 2 - 0.02] });
    // the oarlocks (iron horns on the gunwale by the forward seat) and the mooring ring on the stem
    for (const sd of [1, -1]) {
        const x = boatHalfWidth(0.1, topY(0.1)), y = topY(0.1) + 0.1;
        parts.push({ geo: painted(new THREE.TorusGeometry(0.1, 0.025, 6, 10, Math.PI), iron), pos: [sd * x, y, 0.1], rot: [0, Math.PI / 2, 0] });
    }
    parts.push({ geo: painted(new THREE.TorusGeometry(0.14, 0.03, 6, 14), iron), pos: [0, stem - 0.35, -D.L / 2 - 0.08], rot: [0, Math.PI / 2, 0] });
    // a coil of rope in the bow, its end running to the ring
    for (let r = 0; r < 4; r++) parts.push({ geo: painted(new THREE.TorusGeometry(0.28 - r * 0.045, 0.035, 6, 16), [0.62, 0.53, 0.36]), pos: [0.2, 0.3 + r * 0.02, -D.L / 2 + 1.25], rot: [Math.PI / 2, 0, 0] });
    for (const p of parts) if (!p.geo.attributes.uv) p.geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.geo.attributes.position.count * 2), 2));
    _geo = mergeParts(parts);
    _geo.computeBoundingSphere();
    return _geo;
}

export function boatMaterial() {
    return _mat || (_mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide }));
}

/** A boat's model: a group (its own position / rotation), the shared mesh in it. */
export function boatModel() {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    const m = new THREE.Mesh(boatGeometry(), boatMaterial());
    m.castShadow = true;
    g.add(m);
    g.userData.boatMesh = m;
    return g;
}
