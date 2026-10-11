/**
 * AnimalModels.js — the shapes of cows, pigs, sheep and horses.
 *
 * Low-poly but anatomical: bodies, necks, heads, legs and tails are swept
 * along curves with changing oval cross-sections (a horse's deep chest and
 * slim barrel, a pig's round belly…), shaded by vertex colours (a lighter
 * belly, a dark muzzle, a cow's patches).
 *
 * Every model: body along −Z (the head looks forward), feet at y=0, and the
 * named parts other code uses —
 *   userData.body  — the trunk mesh
 *   userData.neck  — a Group at the neck root (it holds the head)
 *   userData.head  — a Group at the poll / back of the skull
 *   userData.tail  — a Group at the tail root
 *   userData.legs  — 4 hip/shoulder pivots [front right, front left, hind right, hind left];
 *                    each swings with rotation.x and has userData.upper (the upper segment
 *                    mesh), userData.lower (the knee / hock pivot, it bends with rotation.x),
 *                    userData.front (front or hind leg)
 *   userData.saddle — (horse) the saddle, hidden until someone rides it
 * Shapes are built once and shared by every animal of a kind (no new GPU
 * uploads for a new herd); materials are shared per colour.
 */

import * as THREE from 'three';
import { runningBookModel } from './RunningBook.js';

// ------------------------------------------------------------ materials
const _mats = new Map();
/** A plain Lambert material of one colour (shared). */
function lam(c) {
    if (!_mats.has(c)) _mats.set(c, new THREE.MeshLambertMaterial({ color: c }));
    return _mats.get(c);
}
/** A Lambert material whose colour is multiplied by the shape's vertex colours (shared). */
function lamV(c) {
    const k = 'v' + c;
    if (!_mats.has(k)) _mats.set(k, new THREE.MeshLambertMaterial({ color: c, vertexColors: true }));
    return _mats.get(k);
}

// ------------------------------------------------------------- shapes
const _geos = new Map();
function cached(key, make) {
    let g = _geos.get(key);
    if (!g) { g = make(); g.userData.keep = true; _geos.set(key, g); }
    return g;
}

/** Catmull-Rom through key values: table [[t, a, b, …], …] → f(t) = [a, b, …]. */
function keys(table) {
    return (t) => {
        let i = 0;
        while (i < table.length - 2 && t > table[i + 1][0]) i++;
        const p1 = table[i], p2 = table[i + 1];
        const p0 = table[Math.max(0, i - 1)], p3 = table[Math.min(table.length - 1, i + 2)];
        const u = Math.min(1, Math.max(0, (t - p1[0]) / (p2[0] - p1[0] || 1)));
        const out = [];
        for (let j = 1; j < p1.length; j++) {
            const a = p0[j], b = p1[j], c = p2[j], d = p3[j];
            out.push(0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u));
        }
        return out;
    };
}

const _X = new THREE.Vector3(1, 0, 0);
/**
 * Sweep an oval along a path (points in the YZ plane, or any plane holding X as the side).
 *   prof(t) → [rx, ry, dy]: half-width sideways, half-height across the path, shift across it
 *   color(t, ang, p) → [r, g, b] multipliers (ang: 0 = right side, π/2 = top, −π/2 = bottom)
 *   bump(t, ang) → a radius multiplier (lumps of wool)
 */
function sweep(points, prof, { rings = 16, sides = 10, color = null, side = _X, bump = null, uv = null } = {}) {
    const curve = points.length === 2 ? new THREE.LineCurve3(points[0], points[1]) : new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const pos = [], col = [], idx = [], uvs = [];
    const cols = uv ? sides + 1 : sides;
    const P = new THREE.Vector3(), T = new THREE.Vector3(), U = new THREE.Vector3(), S = new THREE.Vector3(), V = new THREE.Vector3();
    const ringC = [];
    for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        curve.getPointAt(t, P);
        curve.getTangentAt(t, T);
        S.copy(side).addScaledVector(T, -side.dot(T)).normalize();
        U.crossVectors(S, T).normalize();
        const [rx, ry, dy = 0] = prof(t);
        const c = P.clone().addScaledVector(U, dy);
        ringC.push({ c, T: T.clone() });
        // (with a texture: one more column where the ring closes — the seam under the belly — so the
        // picture doesn't smear across it; its normals are joined below)
        for (let j = 0; j < cols; j++) {
            const ang = uv ? -Math.PI / 2 + (j / sides) * Math.PI * 2 : (j / sides) * Math.PI * 2;
            const k = bump ? bump(t, ang) : 1;
            V.copy(c).addScaledVector(S, Math.cos(ang) * rx * k).addScaledVector(U, Math.sin(ang) * ry * k);
            pos.push(V.x, V.y, V.z);
            const cl = color ? color(t, ang, V) : [1, 1, 1];
            col.push(cl[0], cl[1], cl[2]);
            if (uv) uvs.push(t * uv[0], (j / sides) * uv[1]);
        }
        if (i > 0) {
            const a0 = (i - 1) * cols, b0 = i * cols;
            for (let j = 0; j < sides; j++) {
                const j1 = uv ? j + 1 : (j + 1) % sides;
                idx.push(a0 + j, b0 + j, a0 + j1, a0 + j1, b0 + j, b0 + j1);
            }
        }
    }
    // closed ends (a centre point a little beyond the last ring keeps them round)
    for (const [ri, dir] of [[0, -1], [rings, 1]]) {
        const { c, T: tn } = ringC[ri];
        const [rx, ry] = prof(ri / rings);
        const e = c.clone().addScaledVector(tn, dir * Math.min(rx, ry) * 0.6);
        const ci = pos.length / 3;
        pos.push(e.x, e.y, e.z);
        const k = color ? color(ri / rings, 0, e) : [1, 1, 1];
        col.push(k[0], k[1], k[2]);
        if (uv) uvs.push((ri / rings) * uv[0], 0.5 * uv[1]);
        const base = ri * cols;
        for (let j = 0; j < sides; j++) {
            const j1 = uv ? j + 1 : (j + 1) % sides;
            if (dir < 0) idx.push(ci, base + j, base + j1);
            else idx.push(ci, base + j1, base + j);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (uv) {
        // the seam's two columns: one normal (no crease line along the belly)
        const N = g.getAttribute('normal');
        for (let i = 0; i <= rings; i++) {
            const a = i * cols, b = i * cols + sides;
            const x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1;
            N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l);
        }
    }
    g.computeBoundingSphere();
    return g;
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const ball = (wd = 10, ht = 7) => cached('ball' + wd + ',' + ht, () => new THREE.SphereGeometry(1, wd, ht));
const cone = (rt, rb, h, s = 8) => cached(`cone${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));

function mesh(parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    parent.add(m);
    return m;
}
/** An ellipsoid (a scaled shared sphere). */
function blob(parent, mat, sx, sy, sz, x, y, z, shadow = true) {
    const m = mesh(parent, ball(), mat, x, y, z, shadow);
    m.scale.set(sx, sy, sz);
    return m;
}
function group(parent, name, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
}
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** Belly lighter than the back (k: how much darker the back is). */
const bellyShade = (back, belly = [1, 1, 1]) => (t, ang) => mix(belly, back, smooth(-0.6, 0.5, Math.sin(ang)));

/**
 * A two-segment leg: the pivot (hip / shoulder) at `top`, the upper segment to the
 * knee / hock, the lower segment (with its pivot at the knee) down to the ground.
 * `up` / `lo`: [z offset at the joint, length, profile key table]; hoof: [radius, height, colour].
 */
function leg(parent, legs, name, x, y, z, front, geoKey, upper, lower, hoof, mat, lowMat = mat, paint = null) {
    const pivot = group(parent, name, x, y, z);
    const [uz, uLen, uKeys] = upper;
    const [lz, lLen, lKeys] = lower;
    // (paint: {up, lo} vertex colours by the point — a pig's muddy legs — and texture coordinates)
    const uGeo = cached(geoKey + 'u', () => sweep([v3(0, 0.12, 0), v3(0, -uLen * 0.5, uz * 0.45), v3(0, -uLen, uz)], keys(uKeys), { rings: 10, sides: 8, color: paint?.up, uv: paint?.uv }));
    const up = mesh(pivot, uGeo, mat);
    up.name = name + 'Upper';
    const knee = group(pivot, name + 'Knee', 0, -uLen, uz);
    const jr = lKeys[0][1] * 1.05;
    blob(knee, lowMat, jr, jr * 1.3, jr * 1.15, 0, 0, 0); // the joint
    const lGeo = cached(geoKey + 'l', () => sweep([v3(0, 0.04, 0), v3(0, -lLen + hoof[1] * 0.6, lz)], keys(lKeys), { rings: 10, sides: 8, color: paint?.lo, uv: paint?.uv }));
    mesh(knee, lGeo, lowMat);
    if (hoof) {
        const [r, h, c] = hoof;
        mesh(knee, cone(r * 0.82, r, h, 9), lam(c), 0, -lLen + h / 2, lz);
    }
    pivot.userData.upper = up;
    pivot.userData.lower = knee;
    pivot.userData.front = front;
    legs.push(pivot);
    return pivot;
}

/** One shape out of several (positions, normals and — for vertex-coloured materials — colours). */
function mergeShapes(list, withColor) {
    const pos = [], nor = [], col = [], idx = [], uvs = [];
    const n = new THREE.Matrix3();
    const v = new THREE.Vector3();
    const withUv = list.some((m) => m.geometry.getAttribute('uv') && m.material.map);
    for (const m of list) {
        m.updateMatrix();
        n.getNormalMatrix(m.matrix);
        const geo = m.geometry;
        const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), C = geo.getAttribute('color');
        const base = pos.length / 3;
        for (let i = 0; i < P.count; i++) {
            v.fromBufferAttribute(P, i).applyMatrix4(m.matrix);
            pos.push(v.x, v.y, v.z);
            v.fromBufferAttribute(N, i).applyMatrix3(n).normalize();
            nor.push(v.x, v.y, v.z);
            if (withColor) col.push(C ? C.getX(i) : 1, C ? C.getY(i) : 1, C ? C.getZ(i) : 1);
            if (withUv) { const UV = geo.getAttribute('uv'); uvs.push(UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0); }
        }
        if (geo.index) for (let i = 0; i < geo.index.count; i++) idx.push(base + geo.index.getX(i));
        else for (let i = 0; i < P.count; i++) idx.push(base + i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
}

/**
 * Fewer draw calls: the shapes that move together and look alike (the same material
 * under the same joint — a head with its ears, a lower leg with its fetlock…) become
 * one mesh. The merged shapes are built once per kind and shared.
 */
function compact(g, keep) {
    const nodes = [];
    g.traverse((o) => { if (!o.isMesh) nodes.push(o); });
    for (const node of nodes) {
        const buckets = new Map();
        for (const m of node.children) {
            if (!m.isMesh || keep.has(m)) continue;
            if (!buckets.has(m.material)) buckets.set(m.material, []);
            buckets.get(m.material).push(m);
        }
        let i = 0;
        for (const [mat, list] of buckets) {
            i++;
            if (list.length < 2) continue;
            const geo = cached(`${g.name}/${node.name}/${i}`, () => mergeShapes(list, mat.vertexColors));
            const one = new THREE.Mesh(geo, mat);
            one.name = list[0].name;
            one.castShadow = list.some((m) => m.castShadow);
            for (const m of list) node.remove(m);
            node.add(one);
        }
    }
}

function finish(g, parts) {
    const keep = new Set([parts.body, ...parts.legs.map((l) => l.userData.upper)]);
    compact(g, keep);
    Object.assign(g.userData, parts);
    if (parts.body) parts.body.name = 'body';
    return g;
}

// ================================================================ horse
export const HORSE_COLORS = [0x4a3022, 0x33241a, 0x5e3a26, 0x1d1916, 0x7d7a75, 0xb3aea4, 0x8c7756];

function horse(color) {
    const c = color ?? HORSE_COLORS[0];
    const base = new THREE.Color(c);
    const hair = base.clone().multiplyScalar(base.getHSL({}).l > 0.6 ? 0.72 : 0.42).getHex(); // mane, tail, forelock
    const skin = lamV(c);
    const g = new THREE.Group();
    g.name = 'horse';
    const legs = [];

    // trunk: rump (+Z) → chest (−Z); top / bottom line and half-width keyed along it
    const body = mesh(g, cached('horseBody', () => {
        const k = keys([
            [0.00, 1.74, 1.50, 0.10],
            [0.06, 1.88, 1.30, 0.27],
            [0.16, 1.95, 1.22, 0.35],
            [0.30, 1.93, 1.17, 0.36],
            [0.48, 1.88, 1.12, 0.36],
            [0.64, 1.89, 1.10, 0.35],
            [0.76, 1.97, 1.12, 0.31],
            [0.87, 1.93, 1.18, 0.28],
            [0.95, 1.80, 1.28, 0.23],
            [1.00, 1.62, 1.42, 0.10],
        ]);
        return sweep([v3(0, 0, 0.98), v3(0, 0, -0.95)], (t) => { const [top, bot, w] = k(t); return [w, (top - bot) / 2, (top + bot) / 2]; },
            { rings: 28, sides: 14, color: bellyShade([0.9, 0.9, 0.9], [1.04, 1.04, 1.04]) });
    }), skin);

    // neck: from the withers up and forward to the poll, a crest on top
    // (the neck turns at its root on the withers: lowering it to graze keeps it on the body)
    const neck = group(g, 'neck', 0, 1.56, -0.56);
    const neckPath = [v3(0, 0, 0), v3(0, 0.42, -0.34), v3(0, 0.78, -0.51), v3(0, 0.94, -0.54)];
    const neckK = keys([[0, 0.24, 0.34, 0], [0.35, 0.16, 0.24, 0.02], [0.75, 0.105, 0.16, 0.015], [1, 0.095, 0.12, 0]]);
    mesh(neck, cached('horseNeck', () => sweep(neckPath, neckK, { rings: 14, sides: 10, color: bellyShade([0.92, 0.92, 0.92], [1.03, 1.03, 1.03]) })), skin);
    // mane along the crest
    mesh(neck, cached('horseMane', () => sweep(neckPath, (t) => { const [, ry, dy] = neckK(t); const h = 0.05 + 0.035 * Math.sin(Math.PI * Math.min(1, t * 1.1)); return [0.05 * (1 - 0.3 * t), h, dy + ry - h * 0.15]; }, { rings: 14, sides: 6 })), lamV(hair));

    // head: hangs from the poll nose-down; a deep jowl, a long narrow face, a soft muzzle
    const head = group(neck, 'head', 0, 0.92, -0.56);
    head.rotation.x = -1.0;
    mesh(head, cached('horseHead', () => sweep([v3(0, 0, 0.1), v3(0, -0.02, -0.25), v3(0, 0, -0.66)], keys([
        [0.00, 0.06, 0.07, -0.01],
        [0.07, 0.11, 0.13, -0.02],
        [0.16, 0.13, 0.16, -0.04],
        [0.32, 0.12, 0.14, -0.03],
        [0.60, 0.085, 0.105, 0],
        [0.84, 0.08, 0.1, 0],
        [0.94, 0.09, 0.105, -0.01],
        [1.00, 0.05, 0.06, -0.01],
    ]), { rings: 16, sides: 10, color: (t) => { const m = 1 - 0.45 * smooth(0.78, 0.92, t); return [m, m * 0.97, m * 0.95]; } })), skin);
    // ears, pricked up and a little forward
    for (const s of [1, -1]) {
        const ear = mesh(head, cone(0.005, 0.05, 0.18, 7), skin, 0.065 * s, 0.14, 0.05);
        ear.rotation.set(0.75, 0, -0.18 * s);
        ear.scale.set(1, 1, 0.55);
        blob(head, lam(0x140e0c), 0.022, 0.03, 0.036, 0.105 * s, 0.065, -0.04, false); // eyes
        blob(head, lam(0x140e0c), 0.018, 0.028, 0.02, 0.05 * s, 0.01, -0.645, false); // nostrils
    }
    // forelock over the forehead
    mesh(head, cached('horseForelock', () => sweep([v3(0, 0.12, 0.04), v3(0, 0.125, -0.08), v3(0, 0.1, -0.2)], (t) => [0.05 * (1 - t * 0.6), 0.025, 0], { rings: 6, sides: 6 })), lamV(hair), 0, 0, 0, false);

    // tail: from the top of the rump, arched out, the hair falls to the hocks
    const tail = group(g, 'tail', 0, 1.8, 0.93);
    // (the dock, then hair: thin strands that fan out a little and end at different lengths —
    // one smooth paddle looked like rubber)
    mesh(tail, cached('horseTailDock', () => sweep([v3(0, 0, -0.04), v3(0, 0.02, 0.14), v3(0, -0.12, 0.26)], keys([
        [0, 0.05, 0.055], [0.5, 0.055, 0.06], [1, 0.04, 0.045],
    ]), { rings: 6, sides: 7 })), lamV(hair));
    const STRANDS = [[0, 0, 1.0], [0.05, 0.03, 0.92], [-0.05, 0.02, 0.95], [0.03, -0.04, 0.86], [-0.035, -0.035, 0.9], [0.015, 0.05, 0.8], [-0.02, 0.06, 0.84]];
    STRANDS.forEach(([sx, sz, len], i) => {
        mesh(tail, cached('horseTailStrand' + i, () => sweep([v3(0, -0.1, 0.25), v3(sx * 1.2, -0.45 * len, 0.33 + sz), v3(sx * 2.2, -0.82 * len, 0.33 + sz * 1.6), v3(sx * 2.8, -1.06 * len, 0.28 + sz * 2)], keys([
            [0, 0.03, 0.03], [0.3, 0.034, 0.03], [0.8, 0.022, 0.02], [1, 0.006, 0.006],
        ]), { rings: 8, sides: 5 })), lamV(hair));
    });

    // legs: forearm → knee → cannon → fetlock → hoof in front; gaskin → hock behind
    const fUp = [[0, 0.1, 0.16], [0.25, 0.115, 0.14], [0.75, 0.072, 0.085], [0.92, 0.078, 0.09], [1, 0.07, 0.08]];
    const hUp = [[0, 0.1, 0.2], [0.3, 0.115, 0.17], [0.8, 0.068, 0.1], [0.94, 0.07, 0.1], [1, 0.06, 0.085]];
    const low = [[0, 0.065, 0.075], [0.15, 0.052, 0.065], [0.62, 0.05, 0.062], [0.75, 0.068, 0.08], [0.88, 0.052, 0.06], [1, 0.07, 0.075]];
    const hoof = [0.085, 0.11, 0x2a2420];
    // (a bay or a dark coat: black lower legs; a light one: its own colour a shade darker)
    const points = base.getHSL({}).l < 0.45 ? lamV(hair) : lamV(base.clone().multiplyScalar(0.8).getHex());
    for (const [x, z, front] of [[0.15, -0.6, true], [-0.15, -0.6, true], [0.15, 0.6, false], [-0.15, 0.6, false]]) {
        const name = (front ? 'front' : 'hind') + (x > 0 ? 'Right' : 'Left') + 'Leg';
        if (front) leg(g, legs, name, x, 1.3, z, true, 'horseF', [0, 0.6, fUp], [0, 0.7, low], hoof, skin, points);
        else leg(g, legs, name, x, 1.3, z, false, 'horseH', [0.13, 0.6, hUp], [-0.1, 0.7, low], hoof, skin, points);
    }

    // saddle (shown while ridden): a blanket, the seat rising to the pommel and the cantle, the flaps
    const saddle = group(g, 'saddle');
    blob(saddle, lam(0x7a1f1f), 0.385, 0.1, 0.44, 0, 1.83, 0.0);
    mesh(saddle, cached('saddleSeat', () => sweep([v3(0, 0, 0.36), v3(0, 0, -0.34)], keys([
        [0, 0.12, 0.05, 1.99], [0.12, 0.22, 0.06, 1.96], [0.45, 0.28, 0.05, 1.91], [0.8, 0.22, 0.06, 1.94], [0.92, 0.14, 0.07, 1.99], [1, 0.08, 0.05, 2.01],
    ]), { rings: 14, sides: 12 })), lamV(0x5a2d0c));
    for (const s of [1, -1]) {
        const flap = mesh(saddle, cached('flap', () => new THREE.BoxGeometry(0.025, 0.34, 0.3)), lam(0x4a2509), 0.36 * s, 1.68, -0.02);
        flap.rotation.z = 0.2 * s;
        mesh(saddle, cached('strap', () => new THREE.BoxGeometry(0.012, 0.3, 0.035)), lam(0x2a1a0e), 0.385 * s, 1.43, -0.05, false);
        const stirrup = mesh(saddle, cached('stirrup', () => new THREE.TorusGeometry(0.05, 0.012, 4, 10)), lam(0x9a9a9a), 0.385 * s, 1.25, -0.05, false);
        stirrup.rotation.y = Math.PI / 2;
    }
    saddle.visible = false;

    g.userData.grazePitch = -1.8; // (the long neck right down: the muzzle at the grass)
    return finish(g, { body, neck, head, tail, legs, saddle });
}

// ================================================================== pig
/**
 * Pigs: matte skin, not plastic — a small picture per look (mottled pink, a few bristles,
 * pores, spots for some) times soft vertex shading (a darker back, mud on the belly, the
 * legs and the snout), and feathered wings (folded along the sides; see PigFlight.js).
 * Looks 1…4 (sent as the animal's `color`): pale pink, rosy-ginger, pink with big dark
 * spots, dusky with brown patches.
 */
export const PIG_LOOKS = [
    { tint: 0xf7cdc9, mottle: 0.12, warm: 0.05, spots: 0, spotC: [0.6, 0.52, 0.52], feather: 0xf4efe6 },
    { tint: 0xf3b8a6, mottle: 0.14, warm: 0.1, spots: 0, spotC: [0.75, 0.55, 0.45], feather: 0xece0cc },
    { tint: 0xf9d4d0, mottle: 0.1, warm: 0.04, spots: 7, spotC: [0.3, 0.27, 0.28], feather: 0xf2eee8 },
    { tint: 0xe6b6b0, mottle: 0.16, warm: 0.06, spots: 5, spotC: [0.62, 0.46, 0.38], feather: 0xddd5ca },
];
/** The look of a pig from its `color` (1…4; anything else is taken round into that). */
export const pigLook = (c) => ((Math.abs(Math.round(c || 1)) - 1) % PIG_LOOKS.length + PIG_LOOKS.length) % PIG_LOOKS.length;

/** A repeatable random (one look draws the same picture on every computer). */
function rng(seed) {
    let x = seed >>> 0 || 1;
    return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

const _skins = new Map();
/**
 * The skin picture of a look (128 along the body × 256 round it, made once): a soft
 * mottling, warmer and paler patches, spots, pores and short bristles lying along the body.
 * Values are a multiplier around 0.92 (the material's colour gives the pink).
 */
function pigSkin(look) {
    if (_skins.has(look)) return _skins.get(look);
    const L = PIG_LOOKS[look];
    const W = 128, H = 256;
    const r = rng(9001 + look * 7919);
    // value noise on a wrapping grid (so the picture closes round the body)
    const grid = (n) => { const a = new Float32Array(n * n * 2); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
    const g1 = grid(8), g2 = grid(16), g3 = grid(32);
    const vn = (gr, n, u, v) => {
        const x = u * n, y = v * n * 2, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
        const at = (i, j) => gr[(((j % (n * 2)) + n * 2) % (n * 2)) * n + (((i % n) + n) % n)];
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        return (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy;
    };
    const R = new Float32Array(W * H), G = new Float32Array(W * H), B = new Float32Array(W * H);
    const spots = [];
    for (let i = 0; i < L.spots; i++) spots.push({ u: 0.1 + r() * 0.8, v: r(), ru: 0.06 + r() * 0.1, rv: 0.04 + r() * 0.07 });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = x / W, v = y / H;
        const n = vn(g1, 8, u, v) * 0.55 + vn(g2, 16, u, v) * 0.3 + vn(g3, 32, u, v) * 0.15;
        let m = 0.94 - L.mottle * (n - 0.5) * 1.6;
        const warm = (vn(g2, 16, u + 0.37, v + 0.21) - 0.5) * L.warm * 2;
        let cr = m * (1 + warm), cg = m * (1 - warm * 0.5), cb = m * (1 - warm);
        // spots: soft-edged blotches with a ragged rim
        for (const s of spots) {
            let dv = Math.abs(v - s.v); dv = Math.min(dv, 1 - dv);
            const d = Math.hypot((u - s.u) / s.ru, dv / s.rv) + (vn(g3, 32, u, v) - 0.5) * 0.5;
            const k = 1 - Math.min(1, Math.max(0, (d - 0.75) / 0.3));
            if (k > 0) { cr *= 1 + (L.spotC[0] - 1) * k; cg *= 1 + (L.spotC[1] - 1) * k; cb *= 1 + (L.spotC[2] - 1) * k; }
        }
        const i = y * W + x;
        R[i] = cr; G[i] = cg; B[i] = cb;
    }
    // pores (tiny darker dots) and bristles: short hairs along the body, pale ones catch the light
    for (let i = 0; i < 2600; i++) { const p = Math.floor(r() * W * H); R[p] *= 0.9; G[p] *= 0.88; B[p] *= 0.88; }
    for (let i = 0; i < 1500; i++) {
        const x0 = Math.floor(r() * W), y0 = Math.floor(r() * H), len = 2 + Math.floor(r() * 4);
        const pale = r() < 0.6, k = pale ? 1.07 + r() * 0.05 : 0.86;
        for (let j = 0; j < len; j++) {
            const p = y0 * W + ((x0 + j) % W), f = 1 + (k - 1) * (1 - j / (len + 1));
            R[p] *= f; G[p] *= f; B[p] *= pale ? f * 0.99 : f;
        }
    }
    const data = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) {
        data[i * 4] = Math.min(255, R[i] * 255); data[i * 4 + 1] = Math.min(255, G[i] * 255); data[i * 4 + 2] = Math.min(255, B[i] * 255); data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    tex.userData = { keep: true };
    _skins.set(look, tex);
    return tex;
}
/** The pig's skin material of a look: the picture × vertex shading × the look's pink (shared). */
function pigMat(look, tint = PIG_LOOKS[look].tint) {
    const k = 'pig' + look + ':' + tint;
    if (!_mats.has(k)) _mats.set(k, new THREE.MeshLambertMaterial({ color: tint, vertexColors: true, map: pigSkin(look) }));
    return _mats.get(k);
}

const MUD = [0.5, 0.39, 0.31];
/** Lumps of dried mud: a smooth pattern by the point (no randomness — every pig of a kind alike in shape). */
const mudAt = (p) => 0.5 + 0.5 * Math.sin(p.x * 23.1 + p.z * 17.3) * Math.sin(p.z * 19.7 - p.y * 13.1 + 0.6);

// ----- wings: feathers on two bones, folded along the side; spread by a morph (open), the tips bend (flex)
/** One feather: base at 0, along +Z (length L, width W), normal +Y, a little curved; vertex shading. */
function feather(L, W, tone, out) {
    const segs = 6, base = out.pos.length / 3;
    for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const w = W * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.55 + 0.45 * t * t)), 0.6)) * (t === 1 ? 0.2 : 1);
        const z = L * t, y = 0.06 * L * Math.sin(Math.PI * t * 0.8);
        for (const s of [-1, 0, 1]) {
            out.pos.push(s * w * 0.5, y - Math.abs(s) * W * 0.06, z);
            const c = tone * (s === 0 ? 0.84 : 1) * (1 - 0.14 * Math.max(0, (t - 0.7) / 0.3));
            out.col.push(c, c * 0.985, c * 0.97);
        }
        if (i > 0) {
            const a = base + (i - 1) * 3, b = base + i * 3;
            out.idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
        }
    }
    return base;
}
/** A thin bone (the wing's leading edge): along +Z, length L. */
function bone(L, r0, r1, out) {
    const segs = 5, sides = 6, base = out.pos.length / 3;
    for (let i = 0; i <= segs; i++) {
        const t = i / segs, r = r0 + (r1 - r0) * t;
        for (let j = 0; j < sides; j++) {
            const a = (j / sides) * Math.PI * 2;
            out.pos.push(Math.cos(a) * r, Math.sin(a) * r * 0.8, L * t);
            out.col.push(0.9, 0.88, 0.86);
        }
        if (i > 0) for (let j = 0; j < sides; j++) {
            const a = base + (i - 1) * sides, b = base + i * sides, j1 = (j + 1) % sides;
            out.idx.push(a + j, b + j, a + j1, a + j1, b + j, b + j1);
        }
    }
    return base;
}
/** A matrix putting local +Z along `d` with local +Y towards `n`, at `p`. */
function frame(p, d, n) {
    const Z = d.clone().normalize();
    const Y = n.clone().addScaledVector(Z, -n.dot(Z)).normalize();
    const X = new THREE.Vector3().crossVectors(Y, Z);
    return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(p);
}

/** The pig wing's shape (right wing, its root at 0; shared). Base = folded, morph 0 = spread, morph 1 = tips up. */
export const PIG_WING = { ARM: 0.46, HAND: 0.32 };
function pigWingGeo() {
    return cached('pigWing', () => {
        const r = rng(4242);
        const parts = []; // {build(out) → first vertex, fold, open, flex}
        const UP = v3(0, 1, 0);
        // spread: the span along +X, the trailing edge to +Z (back), the top +Y
        const open = (b, a) => frame(b, v3(Math.sin(a), 0, Math.cos(a)), UP);
        // folded: the arm along the side going back (a little up), the feathers hanging down and out a bit
        const S = v3(0, 0.1, 1).normalize(), C = v3(0.42, -1, 0).normalize();
        const N = new THREE.Vector3().crossVectors(C, S).normalize(); // (the top of the folded wing: towards the body)
        const Rf = new THREE.Matrix4().makeBasis(S, N, C);
        const out = N.clone().negate();
        const Wr = v3(PIG_WING.ARM, 0.01, 0); // the wrist
        const flex = new THREE.Matrix4().makeTranslation(Wr.x, Wr.y, Wr.z).multiply(new THREE.Matrix4().makeRotationZ(0.6)).multiply(new THREE.Matrix4().makeTranslation(-Wr.x, -Wr.y, -Wr.z));
        const away = new THREE.Matrix4().makeTranslation(out.x * 0.015, out.y * 0.015, out.z * 0.015); // (folded: just off the skin)
        const inner = (make, M) => parts.push({ make, open: M, fold: away.clone().multiply(Rf).multiply(M), flex: M });
        // the arm
        inner((o) => bone(PIG_WING.ARM, 0.042, 0.03, o), frame(v3(0, 0, 0), v3(1, 0, 0), UP));
        // secondaries (long, along the arm) and coverts over them
        for (let i = 0; i < 8; i++) inner((o) => feather(0.27 + 0.07 * Math.min(1, i / 4), 0.085, 0.93 + r() * 0.07, o), open(v3(0.03 + i * 0.059, -0.004, 0.01), 0.04 + i * 0.035));
        for (let i = 0; i < 7; i++) inner((o) => feather(0.15, 0.075, 0.97 + r() * 0.03, o), open(v3(0.02 + i * 0.066, 0.014, -0.01), 0.08 + i * 0.04));
        // the hand: its bone, primaries fanning out to the tip, coverts; folded it lies over the arm
        const fw = Rf.clone().multiply(new THREE.Matrix4().makeTranslation(Wr.x, Wr.y, Wr.z)); // (the folded wrist)
        const fwP = new THREE.Vector3().setFromMatrixPosition(fw);
        const fwd = S.clone().negate();
        const hand = (make, M, foldM) => parts.push({ make, open: M, fold: foldM, flex: flex.clone().multiply(M) });
        hand((o) => bone(PIG_WING.HAND, 0.03, 0.018, o), frame(Wr, v3(1, 0, 0), UP), frame(fwP.clone().addScaledVector(out, 0.03), fwd, N));
        const PL = [0.4, 0.44, 0.48, 0.52, 0.54, 0.52, 0.47];
        for (let j = 0; j < 7; j++) {
            const bx = j * 0.05, a = 0.4 + j * 0.15;
            const fold = frame(fwP.clone().addScaledVector(fwd, bx * 0.9).addScaledVector(out, 0.012 * (j + 1)), S.clone().multiplyScalar(0.92).addScaledVector(C, 0.38 - j * 0.03), N);
            hand((o) => feather(PL[j], 0.082, 0.9 + r() * 0.08, o), open(v3(Wr.x + bx, Wr.y - 0.004, 0.005), a), fold);
        }
        for (let j = 0; j < 4; j++) {
            const bx = j * 0.075;
            const fold = frame(fwP.clone().addScaledVector(fwd, bx * 0.9).addScaledVector(out, 0.1), S.clone().addScaledVector(C, 0.3), N);
            hand((o) => feather(0.15, 0.07, 0.97 + r() * 0.03, o), open(v3(Wr.x + bx, Wr.y + 0.014, -0.005), 0.5 + j * 0.15), fold);
        }
        // build: base positions folded, morph deltas to spread and to the bent tips
        const o = { pos: [], col: [], idx: [] };
        const P = [], N0 = [], dO = [], dON = [], dF = [], dFN = [];
        const v = new THREE.Vector3(), w = new THREE.Vector3(), q = new THREE.Vector3();
        for (const pt of parts) {
            const from = o.pos.length / 3;
            pt.make(o);
            const to = o.pos.length / 3;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(o.pos.slice(from * 3, to * 3), 3));
            geo.setIndex(o.idx.filter((i) => i >= from && i < to).map((i) => i - from));
            geo.computeVertexNormals();
            const lp = geo.getAttribute('position'), ln = geo.getAttribute('normal');
            const nf = new THREE.Matrix3().getNormalMatrix(pt.fold), no = new THREE.Matrix3().getNormalMatrix(pt.open), nx = new THREE.Matrix3().getNormalMatrix(pt.flex);
            for (let i = 0; i < lp.count; i++) {
                v.fromBufferAttribute(lp, i).applyMatrix4(pt.fold);
                w.fromBufferAttribute(lp, i).applyMatrix4(pt.open);
                q.fromBufferAttribute(lp, i).applyMatrix4(pt.flex);
                P.push(v.x, v.y, v.z); dO.push(w.x - v.x, w.y - v.y, w.z - v.z); dF.push(q.x - w.x, q.y - w.y, q.z - w.z);
                v.fromBufferAttribute(ln, i).applyMatrix3(nf).normalize();
                w.fromBufferAttribute(ln, i).applyMatrix3(no).normalize();
                q.fromBufferAttribute(ln, i).applyMatrix3(nx).normalize();
                N0.push(v.x, v.y, v.z); dON.push(w.x - v.x, w.y - v.y, w.z - v.z); dFN.push(q.x - w.x, q.y - w.y, q.z - w.z);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(N0, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
        g.setIndex(o.idx);
        g.morphAttributes.position = [new THREE.Float32BufferAttribute(dO, 3), new THREE.Float32BufferAttribute(dF, 3)];
        g.morphAttributes.normal = [new THREE.Float32BufferAttribute(dON, 3), new THREE.Float32BufferAttribute(dFN, 3)];
        g.morphTargetsRelative = true;
        g.boundingBox = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position')); // (folded only: the body is measured with its wings folded)
        g.boundingSphere = new THREE.Sphere(v3(0.4, 0, 0.1), 1.5); // (spread too: never culled while on screen)
        return g;
    });
}
function wingMat(c) {
    const k = 'wing' + c;
    if (!_mats.has(k)) _mats.set(k, new THREE.MeshLambertMaterial({ color: c, vertexColors: true, side: THREE.DoubleSide, morphTargets: true, morphNormals: true }));
    return _mats.get(k);
}

function pig(lookC) {
    const look = pigLook(lookC);
    const L = PIG_LOOKS[look];
    const g = new THREE.Group();
    g.name = 'pig';
    const legs = [];
    const back = [0.95, 0.83, 0.84];
    const skin = pigMat(look);
    const body = mesh(g, cached('pigBody2', () => {
        const k = keys([
            [0.00, 0.80, 0.62, 0.12],
            [0.07, 0.95, 0.47, 0.29],
            [0.22, 1.02, 0.4, 0.37],
            [0.50, 1.02, 0.37, 0.39],
            [0.75, 1.01, 0.39, 0.37],
            [0.92, 0.98, 0.47, 0.31],
            [1.00, 0.9, 0.6, 0.18],
        ]);
        const shade = bellyShade(back);
        return sweep([v3(0, 0, 0.58), v3(0, 0, -0.56)], (t) => { const [top, bot, w] = k(t); return [w, (top - bot) / 2, (top + bot) / 2]; }, {
            rings: 34, sides: 18, uv: [1, 1],
            // (not a smooth balloon: heavy hams and shoulders, folds of skin behind the head, small lumps)
            bump: (t, ang) => 1 + 0.025 * Math.exp(-(((t - 0.2) / 0.1) ** 2)) + 0.02 * Math.exp(-(((t - 0.74) / 0.08) ** 2)) - 0.035 * Math.exp(-(((t - 0.86) / 0.025) ** 2)) - 0.025 * Math.exp(-(((t - 0.915) / 0.02) ** 2)) + 0.01 * Math.sin(t * 37 + ang * 3) * Math.sin(ang * 5 + t * 11),
            color: (t, ang, p) => {
                let c = shade(t, ang);
                const fold = 1 - 0.08 * Math.exp(-(((t - 0.86) / 0.03) ** 2)) - 0.06 * Math.exp(-(((t - 0.915) / 0.025) ** 2));
                c = [c[0] * fold, c[1] * fold, c[2] * fold];
                // mud: the belly, the lower sides, splashes on the hams
                const low = smooth(0.62, 0.42, p.y), hams = smooth(0.2, 0.02, t) * smooth(0.8, 0.55, p.y);
                return mix(c, MUD, Math.min(0.75, (low * 0.75 + hams * 0.4) * mudAt(p)));
            },
        });
    }), skin);

    const neck = group(g, 'neck', 0, 0.8, -0.5);
    // head: a cone-like skull with heavy jowls, down to the snout (darker and a bit dirty towards it)
    const head = group(neck, 'head', 0, 0.02, -0.02);
    head.rotation.x = -0.32;
    mesh(head, cached('pigHead2', () => sweep([v3(0, 0, 0.12), v3(0, -0.02, -0.2), v3(0, -0.02, -0.4)], keys([
        [0, 0.22, 0.22, -0.02], [0.25, 0.25, 0.24, -0.05], [0.55, 0.18, 0.17, -0.02], [0.85, 0.11, 0.1, 0], [1, 0.1, 0.09, 0],
    ]), { rings: 12, sides: 12, uv: [0.45, 0.6], color: (t, ang, p) => mix(mix(bellyShade(back)(t, ang), [0.86, 0.68, 0.68], smooth(0.6, 1, t)), MUD, 0.35 * smooth(0.75, 1, t) * smooth(0.0, -0.12, p.y) * mudAt(p)) })), skin);
    // the snout: a short round tube ending in a flat disc with two nostrils (duller, a little muddy)
    const snout = mesh(head, cone(0.095, 0.105, 0.1, 14), lam(0xd9959a), 0, -0.02, -0.44);
    snout.rotation.x = Math.PI / 2;
    const disc = mesh(head, cone(0.1, 0.1, 0.012, 14), lam(0xc98186), 0, -0.02, -0.495, false);
    disc.rotation.x = Math.PI / 2;
    for (const s of [1, -1]) {
        const n = blob(head, lam(0x4e2228), 0.018, 0.03, 0.01, 0.035 * s, -0.02, -0.5, false);
        n.rotation.z = 0.2 * s;
        blob(head, lam(0x1a1212), 0.025, 0.028, 0.02, 0.135 * s, 0.09, -0.2, false); // small eyes
        // ears: wide flat triangles flopping forward over the eyes; darker inside, thin veined edges
        const ear = mesh(head, cached('pigEar2', () => sweep([v3(0, 0, 0), v3(0, 0.1, -0.02), v3(0, 0.2, -0.02)], keys([[0, 0.07, 0.025], [0.4, 0.1, 0.022], [1, 0.012, 0.012]]), {
            rings: 6, sides: 8, color: (t, ang) => mix([1, 0.97, 0.97], [0.8, 0.58, 0.62], smooth(0.2, -0.8, Math.sin(ang)) * (0.6 + 0.4 * t)),
        })), lamV(0xe3a0a4), 0.12 * s, 0.17, -0.02);
        ear.rotation.set(-1.75, 0.35 * s, -0.5 * s);
    }

    // a curly tail
    const tail = group(g, 'tail', 0, 0.82, 0.57);
    mesh(tail, cached('pigTail', () => {
        const pts = [];
        for (let i = 0; i <= 14; i++) {
            const a = i / 14 * Math.PI * 3.2;
            const r = 0.06 * (1 - i / 22);
            pts.push(v3(Math.sin(a) * r, 0.03 + Math.cos(a) * r - 0.06 + i * 0.006, 0.02 + i * 0.008));
        }
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.016, 5, false);
    }), lam(0xd8989c));

    // legs: mud up to the knees, darker hooves
    const up = [[0, 0.13, 0.15], [0.5, 0.1, 0.12], [1, 0.065, 0.075]];
    const low = [[0, 0.065, 0.075], [0.7, 0.055, 0.062], [1, 0.06, 0.065]];
    const paint = {
        uv: [0.3, 0.25],
        up: (t, ang, p) => mix(bellyShade(back)(0, ang), MUD, 0.3 * smooth(-0.12, -0.26, p.y) * mudAt(p)),
        lo: (t, ang, p) => mix([0.96, 0.88, 0.88], MUD, Math.min(0.9, (0.25 + 0.75 * smooth(-0.04, -0.2, p.y)) * (0.6 + 0.4 * mudAt(p)))),
    };
    for (const [x, z, front] of [[0.2, -0.33, true], [-0.2, -0.33, true], [0.2, 0.36, false], [-0.2, 0.36, false]]) {
        const name = (front ? 'front' : 'hind') + (x > 0 ? 'Right' : 'Left') + 'Leg';
        leg(g, legs, name, x, 0.5, z, front, 'pig2' + (front ? 'F' : 'H'), [front ? 0 : 0.04, 0.25, up], [front ? 0 : -0.03, 0.25, low], [0.06, 0.07, 0x4a3430], skin, skin, paint);
    }

    // wings: on the shoulders, folded along the sides (the left one is the right one mirrored)
    const wings = [];
    for (const s of [1, -1]) {
        const w = group(g, s > 0 ? 'wingRight' : 'wingLeft', 0.33 * s, 0.95, -0.3);
        w.scale.x = s;
        w.userData.side = s;
        const m = mesh(w, pigWingGeo(), wingMat(L.feather));
        m.name = 'wing';
        w.userData.mesh = m;
        wings.push(w);
    }
    return finish(g, { body, neck, head, tail, legs, wings, look });
}

/**
 * The pig's wings: open 0 (folded along the sides) … 1 (spread), flap — the up / down angle
 * of a spread wing (rad, + up), flex — the tips bent up (+) or down (−).
 */
export function animateWings(model, open, flap = 0, flex = 0) {
    for (const w of model.userData.wings || []) {
        const m = w.userData.mesh;
        if (m.morphTargetInfluences) { m.morphTargetInfluences[0] = open; m.morphTargetInfluences[1] = flex * open; }
        w.rotation.z = flap * open * w.userData.side;
        w.rotation.y = -0.12 * Math.sin(flap * 2) * open * w.userData.side; // (a little forward on the downstroke)
    }
}

// ================================================================== cow
function cow() {
    const g = new THREE.Group();
    g.name = 'cow';
    const legs = [];
    const white = 0xf4f2ec;
    const skin = lamV(white);
    // black patches: a smooth pattern on the body (no randomness: every cow of the herd alike in shape)
    const patch = (p) => {
        const n = Math.sin(p.x * 6.1 + p.z * 4.3) + Math.sin(p.z * 6.9 - p.y * 5.1 + 1.7) + 0.8 * Math.sin(p.y * 7.2 + p.x * 3.1 - p.z * 5.7 + 0.4);
        return smooth(0.55, 0.68, n);
    };
    const coat = (t, ang, p) => mix([1, 1, 1], [0.12, 0.11, 0.11], patch(p));
    const body = mesh(g, cached('cowBody', () => {
        const k = keys([
            [0.00, 1.42, 1.15, 0.14],
            [0.06, 1.55, 0.95, 0.36],
            [0.18, 1.58, 0.85, 0.44],
            [0.45, 1.53, 0.8, 0.47],
            [0.7, 1.53, 0.82, 0.44],
            [0.86, 1.56, 0.88, 0.38],
            [0.95, 1.48, 0.98, 0.3],
            [1.00, 1.35, 1.12, 0.14],
        ]);
        return sweep([v3(0, 0, 0.82), v3(0, 0, -0.8)], (t) => { const [top, bot, w] = k(t); return [w, (top - bot) / 2, (top + bot) / 2]; },
            { rings: 34, sides: 22, color: coat });
    }), skin);
    // udder with four teats
    const pinkM = lam(0xf0b4b4);
    blob(g, pinkM, 0.17, 0.12, 0.17, 0, 0.82, 0.4);
    for (const [x, z] of [[0.07, 0.34], [-0.07, 0.34], [0.07, 0.46], [-0.07, 0.46]]) mesh(g, cone(0.02, 0.025, 0.08, 5), pinkM, x, 0.7, z, false);

    const neck = group(g, 'neck', 0, 1.28, -0.62); // (turns at its root, on the shoulders)
    const neckPath = [v3(0, 0, 0), v3(0, 0.08, -0.3), v3(0, 0.14, -0.42)];
    mesh(neck, cached('cowNeck', () => sweep(neckPath, keys([[0, 0.3, 0.3, -0.04], [0.5, 0.21, 0.24, -0.04], [1, 0.16, 0.18, 0]]), { rings: 8, sides: 10, color: coat })), skin);
    blob(neck, lam(white), 0.06, 0.12, 0.2, 0, -0.16, -0.22); // dewlap

    const head = group(neck, 'head', 0, 0.22, -0.42);
    head.rotation.x = -0.7;
    mesh(head, cached('cowHead', () => sweep([v3(0, 0, 0.06), v3(0, 0, -0.5)], keys([
        [0, 0.15, 0.13, 0], [0.2, 0.17, 0.15, 0], [0.55, 0.13, 0.12, 0], [0.85, 0.14, 0.12, -0.01], [1, 0.1, 0.08, -0.01],
    ]), { rings: 12, sides: 10, color: (t) => mix([0.15, 0.13, 0.13], [0.98, 0.72, 0.72], smooth(0.72, 0.84, t)) })), skin);
    for (const s of [1, -1]) {
        blob(head, lam(0x111111), 0.03, 0.035, 0.035, 0.155 * s, 0.05, -0.1, false); // eyes
        blob(head, lam(0x111111), 0.022, 0.025, 0.012, 0.055 * s, -0.02, -0.54, false); // nostrils
        const ear = blob(head, lam(0x2a2626), 0.12, 0.035, 0.06, 0.22 * s, 0.06, 0.02);
        ear.rotation.z = -0.35 * s;
        // short horns curving up and forward
        const horn = mesh(head, cached('cowHorn', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3(0, 0, 0), v3(0.08, 0.04, 0), v3(0.13, 0.12, -0.04)]), 6, 0.025, 6, false)), lam(0xe8dcc0), 0.1 * s, 0.13, 0.04);
        horn.scale.x = s;
    }

    const tail = group(g, 'tail', 0, 1.46, 0.8);
    mesh(tail, cached('cowTail', () => sweep([v3(0, 0, 0), v3(0, -0.05, 0.1), v3(0, -0.4, 0.14), v3(0, -0.85, 0.1)], () => [0.03, 0.03, 0], { rings: 10, sides: 6 })), lam(white));
    blob(tail, lam(0x1c1a1a), 0.06, 0.13, 0.06, 0, -0.9, 0.1); // the tuft

    const fUp = [[0, 0.13, 0.15], [0.45, 0.095, 0.11], [1, 0.072, 0.082]];
    const hUp = [[0, 0.15, 0.2], [0.45, 0.1, 0.14], [1, 0.072, 0.09]];
    const low = [[0, 0.08, 0.085], [0.5, 0.065, 0.07], [0.8, 0.075, 0.08], [1, 0.07, 0.075]];
    for (const [x, z, front] of [[0.27, -0.55, true], [-0.27, -0.55, true], [0.27, 0.56, false], [-0.27, 0.56, false]]) {
        const name = (front ? 'front' : 'hind') + (x > 0 ? 'Right' : 'Left') + 'Leg';
        if (front) leg(g, legs, name, x, 0.95, z, true, 'cowF', [0, 0.47, fUp], [0, 0.48, low], [0.085, 0.09, 0x2a2420], skin);
        else leg(g, legs, name, x, 0.95, z, false, 'cowH', [0.1, 0.47, hUp], [-0.08, 0.48, low], [0.085, 0.09, 0x2a2420], skin);
    }
    return finish(g, { body, neck, head, tail, legs });
}

// ================================================================ sheep (a ram)
function sheep() {
    const g = new THREE.Group();
    g.name = 'sheep';
    const legs = [];
    const wool = lam(0xf1eee4);
    const face = 0x3a3030;
    // the fleece: one thick round coat with curly lumps, darker in the hollows between them
    const curls = (t, ang) => Math.sin(t * 31 + Math.sin(ang * 3) * 1.5) * Math.sin(ang * 7 + t * 9);
    const body = mesh(g, cached('sheepFleece', () => {
        const k = keys([
            [0.00, 1.06, 0.82, 0.16],
            [0.07, 1.22, 0.66, 0.36],
            [0.25, 1.3, 0.6, 0.45],
            [0.55, 1.3, 0.6, 0.46],
            [0.8, 1.28, 0.63, 0.43],
            [0.94, 1.2, 0.72, 0.33],
            [1.00, 1.08, 0.86, 0.16],
        ]);
        return sweep([v3(0, 0, 0.6), v3(0, 0, -0.62)], (t) => { const [top, bot, w] = k(t); return [w, (top - bot) / 2, (top + bot) / 2]; }, {
            rings: 30, sides: 20, bump: (t, ang) => 1 + 0.045 * curls(t, ang),
            color: (t, ang) => { const v = 0.9 + 0.1 * curls(t, ang) - 0.06 * smooth(0, -1, Math.sin(ang)); return [v, v * 0.985, v * 0.95]; },
        });
    }), lamV(0xf6f2e8));
    const neck = group(g, 'neck', 0, 1.08, -0.55);
    blob(neck, wool, 0.17, 0.19, 0.17, 0, 0.0, -0.03);
    const head = group(neck, 'head', 0, 0.06, -0.12);
    head.rotation.x = -0.75;
    mesh(head, cached('sheepHead', () => sweep([v3(0, 0, 0.08), v3(0, 0, -0.4)], keys([
        [0, 0.12, 0.13, 0], [0.3, 0.13, 0.14, 0], [0.75, 0.085, 0.095, 0], [1, 0.07, 0.07, -0.01],
    ]), { rings: 10, sides: 10 })), lamV(face));
    blob(head, wool, 0.15, 0.08, 0.14, 0, 0.11, 0.0); // a woolly cap
    for (const s of [1, -1]) {
        blob(head, lam(0xe8d88a), 0.03, 0.03, 0.03, 0.115 * s, 0.05, -0.1, false); // eyes (light, with a dark pupil)
        blob(head, lam(0x111111), 0.012, 0.02, 0.01, 0.142 * s, 0.05, -0.108, false);
        const ear = blob(head, lam(face), 0.1, 0.03, 0.05, 0.16 * s, 0.0, 0.0);
        ear.rotation.z = 0.35 * s;
        // a ram's horns: they curl back and round beside the head
        const horn = mesh(head, cached('ramHorn', () => {
            const pts = [];
            for (let i = 0; i <= 16; i++) {
                const a = i / 16 * Math.PI * 1.7;
                const r = 0.13 * (1 - i / 30);
                pts.push(v3(0.02 + i * 0.006, Math.sin(a) * r, -Math.cos(a) * r + 0.13));
            }
            return sweep(pts, (t) => [0.045 * (1 - t * 0.7), 0.045 * (1 - t * 0.7), 0], { rings: 16, sides: 7 });
        }), lamV(0xb9a98a), 0.1 * s, 0.1, 0.04);
        horn.scale.x = s;
        horn.rotation.x = 0.3;
    }
    const tail = group(g, 'tail', 0, 1.0, 0.6);
    blob(tail, wool, 0.09, 0.15, 0.08, 0, -0.08, 0.02);

    const up = [[0, 0.09, 0.1], [0.5, 0.07, 0.085], [1, 0.05, 0.055]];
    const low = [[0, 0.045, 0.05], [0.5, 0.038, 0.042], [0.8, 0.045, 0.05], [1, 0.04, 0.045]];
    for (const [x, z, front] of [[0.21, -0.38, true], [-0.21, -0.38, true], [0.21, 0.4, false], [-0.21, 0.4, false]]) {
        const name = (front ? 'front' : 'hind') + (x > 0 ? 'Right' : 'Left') + 'Leg';
        leg(g, legs, name, x, 0.68, z, front, 'sheep' + (front ? 'F' : 'H'), [front ? 0 : 0.06, 0.33, up], [front ? 0 : -0.05, 0.35, low], [0.05, 0.06, 0x1e1a18], lam(face));
    }
    return finish(g, { body, neck, head, tail, legs });
}

/** A new model of an animal: 'cow' | 'pig' | 'sheep' | 'horse' (horse colour optional). */
export function animalModel(type, color) {
    if (type === 'runbook') return runningBookModel(color ?? undefined); // (the rare running book)
    if (type === 'cow') return cow();
    if (type === 'pig') return pig(color); // (color: the look, 1…4)
    if (type === 'sheep') return sheep();
    return horse(color);
}

/**
 * Walk the legs: the upper segments swing in diagonal pairs (k: 0 standing … 1 full stride),
 * and a leg swinging forward folds — the front knee takes the hoof back, the hind hock under.
 */
export function animateLegs(model, walkT, k) {
    const legs = model.userData.legs;
    const s = Math.sin(walkT), c = Math.cos(walkT);
    const sw = s * 0.6 * k;
    for (let i = 0; i < legs.length; i++) {
        const l = legs[i];
        const sign = i === 0 || i === 3 ? 1 : -1;
        l.rotation.x = sign * sw;
        const lower = l.userData.lower;
        if (!lower) continue;
        const bend = Math.max(0, sign * c) * k;
        lower.rotation.x = l.userData.front ? -bend * 1.1 : bend * 0.8;
    }
}
