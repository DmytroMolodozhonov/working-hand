/**
 * SwanWingsItem.js — «Крылья лебедя» as a THING (items 'swanWings' / 'magicSwanWings'): the author 06.11 — «состоит из двух элементов, как будто подкрылья… нормально нарисовать;
 * они должны лежать, а не натыкаться на полки». ONE flat piece: a pair of wings still joined by a little patch of downy back, lying spread on a flat in a shallow V, every wing
 * real in its layers — a leading arm (skin), small «alula» feathers at the wrist, three rows of coverts like roof tiles, the secondaries along the arm and the long primaries
 * fanning back from the wrist. Each feather has a shaft, barbs (slanting stripes), a darker rim and a softer tip, all in the VERTEX colours of one shared unit feather; the
 * 90 or so feathers merge into ONE mesh (one draw). The magic pair: pearly, with a blue-violet and gold play along the shafts, a faint glow of its own and a few motes.
 *
 * Measures (model units; ITEM_SCALE 9 → metres): the pair ≈ 0.105 wide (SCALE 0.08 → ~0.94 m after ITEM_SCALE 9), 0.075 deep, ≈ 0.012 thick (flat: it lies on its back on a floor or a board;
 * the shelf of the Potion-maker's Lair is a block (1 m) deep and wide); the origin in the middle of the patch, y = 0 the mid-plane.
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

const SCALE = 0.08; // (the pair's half-width 0.55 units → ~0.05)
let _feather = null;
const _cache = new Map();

/** The unit feather: length 1 along +z (root at 0), half-width 0.5 along x; a shaft, slanting barbs, a rim, a pale tip, a little camber (y) — colours per vertex. */
function featherGeo() {
    if (_feather) return _feather;
    const NU = 8, NV = 14, pos = [], col = [], idx = [];
    const prof = (v) => (v < 0.12 ? 0.35 + v * 3.4 : v < 0.7 ? 0.76 + (v - 0.12) * 0.4 : Math.max(0.0, 1 - Math.pow((v - 0.7) / 0.3, 2.2) * 0.9)); // (a leaf: narrow at the root, broadest at 0.7, a rounded tip)
    for (let j = 0; j <= NV; j++) {
        const v = j / NV, w = 0.5 * prof(v);
        for (let i = 0; i <= NU; i++) {
            const u = i / NU * 2 - 1, x = u * w;
            const cam = -0.06 * v * v + 0.05 * Math.abs(u) * (1 - v * 0.5) * -1; // (the vane dips toward its rims, the tip droops)
            pos.push(x, cam * 0.5, v);
            // colour: base white-cream; the barbs — diagonal stripes; the shaft — a warm grey line at u≈0; the rim darker, the tip softer; the root cream (down)
            const barb = 0.5 + 0.5 * Math.sin(v * 70 + Math.abs(u) * 14);
            let k = 0.80 + 0.075 * barb;
            const shaft = Math.max(0, 1 - Math.abs(u) / 0.12);
            const rim = Math.pow(Math.abs(u), 3);
            let r = k, g = k * 0.995, b = k * 0.97;
            r -= 0.14 * rim; g -= 0.14 * rim; b -= 0.12 * rim;
            r = r * (1 - shaft * 0.3) + shaft * 0.02; g = g * (1 - shaft * 0.34) + shaft * 0.01; b = b * (1 - shaft * 0.44);
            const root = Math.max(0, 1 - v / 0.25);
            r += 0.02 * root; g -= 0.015 * root; b -= 0.06 * root;
            col.push(r, g, b);
        }
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.userData.shared = true;
    _feather = g;
    return g;
}

/** A feather part: root at (x, y, z) pointing along the yaw (0 = +z, back), length l, width w, a tint. */
function feather(parts, x, y, z, yaw, l, w, tint = null, roll = 0) {
    parts.push({ geo: featherGeo(), pos: [x, y, z], rot: [0, yaw, roll], scale: [w, 1, l], tint });
}

/** Paint a tint (a multiplier per colour) over a geometry's vertex colours. */
function tinted(geo, tint) {
    if (!tint) return geo;
    const g = geo.clone(), c = g.attributes.color;
    for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * tint[0], c.getY(i) * tint[1], c.getZ(i) * tint[2]);
    return g;
}

/** One wing (right, +x; mirror by s = −1): the leading arm runs outward from the patch, the wrist at x 0.5; the flight feathers fan BACK from it as in a spread wing — the long
 * primaries from the wrist, the outermost turned out into the wing's pointed tip, the secondaries along the arm lying straight back; coverts in tiles over their quills. */
function wing(parts, s, magic, rnd) {
    // (a pearl tint drifting to blue-violet toward the tip; `lo`: the lower layers a little darker — the shade between feathers)
    const M = (t, lo = 1) => (magic ? [(1 - 0.06 * t) * lo, (1 - 0.02 * t) * lo, (1 + 0.04 * t) * lo] : [lo, lo * 0.995, lo * 0.98]);
    const X = (x) => x * s;
    const Y = (yaw) => yaw * s;
    // secondaries: 9 along the arm, lying back, a little under the next
    for (let i = 0; i < 9; i++) {
        const t = 0.06 + i * 0.05, x = t, z = 0.05 + t * 0.15;
        feather(parts, X(x), -0.006 - (8 - i) * 0.0008, z, Y(-0.1 + i * 0.022 + (rnd() - 0.5) * 0.025), 0.47 + i * 0.006, 0.125, M(t, 0.88));
    }
    // primaries: 8 from the wrist, a fan — the outermost points outward, the middle ones are the longest
    for (let i = 0; i < 8; i++) {
        const t = i / 7, x = 0.5 + t * 0.07, z = 0.12 + t * 0.02;
        feather(parts, X(x), -0.014 + t * 0.002, z, Y(0.06 + t * 0.62 + (rnd() - 0.5) * 0.02), 0.6 - Math.abs(t - 0.3) * 0.28, 0.1, M(0.6 + t * 0.4, 0.9));
    }
    // three rows of coverts (each shorter, higher, nearer the leading edge): roof tiles over the quills
    const rows = [[11, 0.27, 0.13, 0.01, 0.07, 0.95], [10, 0.2, 0.115, 0.022, 0.04, 1.0], [9, 0.14, 0.1, 0.034, 0.012, 1.04]];
    rows.forEach(([n, l, w, y, zo, lo], r) => {
        for (let i = 0; i < n; i++) {
            const t = 0.05 + (i / (n - 1)) * 0.5, x = t, z = zo + t * 0.15;
            feather(parts, X(x), y + (rnd() - 0.5) * 0.002, z, Y(-0.06 + (i / n) * 0.2 + (rnd() - 0.5) * 0.03), l * (1 - t * 0.1), w, M(t, lo));
        }
    });
    // the wrist's alula: three small feathers turned outward-forward
    for (let i = 0; i < 3; i++) feather(parts, X(0.52 + i * 0.012), 0.046 + i * 0.006, 0.1 - i * 0.012, Y(1.0 - i * 0.2), 0.13 - i * 0.02, 0.065, M(0.7, 1.05));
    // the leading edge: a few short «marginal» feathers along the arm, forward-out
    for (let i = 0; i < 6; i++) feather(parts, X(0.1 + i * 0.08), 0.044, 0.06 + i * 0.012, Y(0.3 - i * 0.03), 0.1, 0.06, M(0.3, 1.04));
}

/** The pair, merged into one geometry (cached per look). → THREE.Group (one mesh + motes for the magic pair). */
export function swanWingsModel(magic = false) {
    const key = magic ? 'm' : 'p';
    let built = _cache.get(key);
    if (!built) {
        let seed = 7;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const parts = [];
        wing(parts, 1, magic, rnd); wing(parts, -1, magic, rnd);
        // the downy patch of the back that joins them: small feathers fanning from the middle, all pointing back
        for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 1.4; feather(parts, Math.sin(a) * 0.03, 0.02 + (i % 2) * 0.01, 0.01, a * 0.6, 0.2 + (i % 3) * 0.02, 0.1, magic ? [0.98, 0.99, 1.04] : [0.97, 0.96, 0.93]); }
        const geos = parts.map((p) => ({ ...p, geo: tinted(p.geo, p.tint) }));
        const geo = mergeParts(geos);
        for (const p of geos) if (p.geo.userData?.shared !== true) p.geo.dispose();
        geo.userData.shared = true;
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, emissive: magic ? 0x7fa6e8 : 0x000000, emissiveIntensity: magic ? 0.28 : 0 });
        material.userData.shared = true;
        built = { geo, material };
        _cache.set(key, built);
    }
    const g = new THREE.Group();
    g.name = magic ? 'magicSwanWings' : 'swanWings';
    const m = new THREE.Mesh(built.geo, built.material);
    m.castShadow = true;
    m.scale.setScalar(SCALE);
    m.position.z = -0.025; // (the pair's middle — about the patch and the wrists — over the origin)
    g.add(m);
    if (magic) {
        const mote = new THREE.MeshBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.85, depthWrite: false });
        const ball = new THREE.SphereGeometry(1, 5, 4);
        let seed = 11;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let i = 0; i < 9; i++) {
            const d = new THREE.Mesh(ball, mote);
            d.position.set((rnd() - 0.5) * 0.1, 0.004 + rnd() * 0.006, (rnd() - 0.5) * 0.06);
            d.scale.setScalar(0.0012 + rnd() * 0.0012);
            g.add(d);
        }
    }
    return g;
}
