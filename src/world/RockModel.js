/**
 * RockModel.js — the look of the boulders (RockRules.js; the author 16.11: «камни не квадратные, а как в реальности… классно, проработанная
 * текстура»). Eight shapes, each a lumpy stone: a sphere pushed out by noise, cut by flat planes where the rock has split (the facets), flattened
 * and buried at the foot; the normals half smooth, half flat (soft edges that catch the light); the colour in the vertices — strata, moss on
 * the top, dark wet foot, lichen, a tone of its own per shape (grey granite, warm sandstone, dark basalt, blue-grey slate) — and one
 * shared 256² picture of the grain (speckles, pits, hairline cracks, mineral veins) drawn once.
 *
 * Cheap: eight shared geometries (320 faces each), ONE material, one instanced mesh per shape. No draw call per stone.
 * Pure geometry maths here (`rockArrays`) so a test can build them without a canvas; RiverRocks.js draws.
 */
import * as THREE from 'three';

const TONES = [
    { base: [0.62, 0.62, 0.6], moss: 0.45, name: 'granite' },
    { base: [0.55, 0.55, 0.56], moss: 0.3, name: 'granite-dark' },
    { base: [0.74, 0.66, 0.54], moss: 0.15, name: 'sandstone' },
    { base: [0.68, 0.6, 0.5], moss: 0.2, name: 'sandstone-warm' },
    { base: [0.38, 0.4, 0.44], moss: 0.3, name: 'basalt' },
    { base: [0.45, 0.48, 0.53], moss: 0.5, name: 'slate' },
    { base: [0.6, 0.6, 0.57], moss: 0.7, name: 'mossy' },
    { base: [0.7, 0.7, 0.68], moss: 0.1, name: 'limestone' },
];

function rng(seed) {
    let s = (seed ^ 0x9e3779b9) >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
/** Smooth 3-D value noise (a small lattice), enough for a stone's lumps. */
function noiser(seed) {
    const R = rng(seed), T = new Float32Array(512);
    for (let i = 0; i < 512; i++) T[i] = R();
    const P = new Uint8Array(512); for (let i = 0; i < 512; i++) P[i] = (i * 73 + 41) & 255;
    const v = (x, y, z) => T[(P[(P[(P[x & 255] + y) & 255] + z) & 255]) & 511];
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y, z) => {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
        const l = (a, b, t) => a + (b - a) * t;
        return l(l(l(v(xi, yi, zi), v(xi + 1, yi, zi), xf), l(v(xi, yi + 1, zi), v(xi + 1, yi + 1, zi), xf), yf),
            l(l(v(xi, yi, zi + 1), v(xi + 1, yi, zi + 1), xf), l(v(xi, yi + 1, zi + 1), v(xi + 1, yi + 1, zi + 1), xf), yf), zf);
    };
}

/**
 * The arrays of shape `v` (0…7): positions, normals, colours, uvs of non-indexed triangles. A unit stone (radius 1, the foot at y = −0.45).
 * Rounded river stones (odd shapes) have few cuts; the broken ones (even) many and deep.
 */
export function rockArrays(v) {
    const tone = TONES[v % TONES.length];
    const R = rng(7000 + v * 131), N = noiser(900 + v * 17), N2 = noiser(1900 + v * 29);
    const round = v % 2 === 1;
    // the cutting planes
    const planes = [];
    const nCut = round ? 3 : 7 + (v >> 1);
    for (let i = 0; i < nCut; i++) {
        const a = R() * Math.PI * 2, b = Math.acos(2 * R() - 1);
        planes.push([Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a), (round ? 0.9 : 0.72) + R() * 0.16]);
    }
    const sx = 0.85 + R() * 0.35, sz = 0.85 + R() * 0.35, sy = 0.62 + R() * 0.25; // (a stone is wider than high)
    const base = new THREE.IcosahedronGeometry(1, 3);
    const pos = base.attributes.position, n = pos.count;
    const P = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
        let r = 1 + (N(x * 1.7 + 5, y * 1.7, z * 1.7) - 0.5) * (round ? 0.34 : 0.5) + (N2(x * 4.1, y * 4.1 + 3, z * 4.1) - 0.5) * 0.12;
        for (const pl of planes) { // the flat faces where the rock split: the radius is held to the plane
            const d = x * pl[0] + y * pl[1] + z * pl[2];
            if (d > 0.05) r = Math.min(r, pl[3] / d);
        }
        r = Math.max(0.45, r);
        x *= r * sx; y *= r * sy; z *= r * sz;
        if (y < -0.45) y = -0.45 + (y + 0.45) * 0.08; // (the foot: flat, sunk in the ground)
        P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    }
    // normals: the face normal half mixed with the smooth one (each vertex position's average)
    const smooth = new Map(), key = (i) => Math.round(P[i * 3] * 400) + ',' + Math.round(P[i * 3 + 1] * 400) + ',' + Math.round(P[i * 3 + 2] * 400);
    const fn = new Float32Array(n * 3);
    for (let t = 0; t < n; t += 3) {
        const ax = P[t * 3], ay = P[t * 3 + 1], az = P[t * 3 + 2];
        const ux = P[(t + 1) * 3] - ax, uy = P[(t + 1) * 3 + 1] - ay, uz = P[(t + 1) * 3 + 2] - az;
        const wx = P[(t + 2) * 3] - ax, wy = P[(t + 2) * 3 + 1] - ay, wz = P[(t + 2) * 3 + 2] - az;
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
        for (let k = 0; k < 3; k++) { fn[(t + k) * 3] = nx; fn[(t + k) * 3 + 1] = ny; fn[(t + k) * 3 + 2] = nz; const s = smooth.get(key(t + k)) || (smooth.set(key(t + k), [0, 0, 0]), smooth.get(key(t + k))); s[0] += nx; s[1] += ny; s[2] += nz; }
    }
    const NR = new Float32Array(n * 3), COL = new Float32Array(n * 3), UV = new Float32Array(n * 2);
    const mix = round ? 0.2 : 0.45; // (how much of the flat face stays)
    for (let i = 0; i < n; i++) {
        const s = smooth.get(key(i)), sl = Math.hypot(s[0], s[1], s[2]) || 1;
        let nx = s[0] / sl * (1 - mix) + fn[i * 3] * mix, ny = s[1] / sl * (1 - mix) + fn[i * 3 + 1] * mix, nz = s[2] / sl * (1 - mix) + fn[i * 3 + 2] * mix;
        const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
        NR[i * 3] = nx; NR[i * 3 + 1] = ny; NR[i * 3 + 2] = nz;
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        // colour: the tone, strata (thin darker and lighter bands that tilt), grain lumps, moss up top, a dark damp foot, lichen blotches
        const strata = 0.5 + 0.5 * Math.sin((y * 5.5 + x * 1.3 + N(x * 2, y * 2, z * 2) * 2.5) * 2.2);
        const lump = N2(x * 3 + 9, y * 3, z * 3) - 0.5;
        let k = 0.86 + lump * 0.3 + (strata - 0.5) * 0.14;
        let r = tone.base[0] * k, g = tone.base[1] * k, b = tone.base[2] * k;
        const mossN = N(x * 2.6 + 20, y * 2.6, z * 2.6);
        const moss = Math.max(0, Math.min(1, (ny - 0.35) * 2.2 + (mossN - 0.5) * 1.2)) * tone.moss * (y > -0.3 ? 1 : 0.4);
        r += (0.27 - r) * moss; g += (0.42 - g) * moss; b += (0.18 - b) * moss; // (moss green)
        const lich = Math.max(0, N2(x * 5 + 40, y * 5, z * 5 + 13) - 0.7) * 3.2 * (1 - moss);
        r += (0.78 - r) * lich * 0.55; g += (0.76 - g) * lich * 0.55; b += (0.5 - b) * lich * 0.55; // (pale lichen)
        const damp = Math.max(0, Math.min(1, (-0.1 - y) * 2.4));
        r *= 1 - damp * 0.45; g *= 1 - damp * 0.42; b *= 1 - damp * 0.38; // (darker where it is wet)
        COL[i * 3] = r; COL[i * 3 + 1] = g; COL[i * 3 + 2] = b;
        // uv: a box projection along the face's strongest axis (the picture is a grain: no seams to see)
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        if (ay >= ax && ay >= az) { UV[i * 2] = x * 0.55; UV[i * 2 + 1] = z * 0.55; }
        else if (ax >= az) { UV[i * 2] = z * 0.55 + 0.37; UV[i * 2 + 1] = y * 0.55; }
        else { UV[i * 2] = x * 0.55 + 0.71; UV[i * 2 + 1] = y * 0.55 + 0.29; }
    }
    base.dispose();
    return { pos: P, nor: NR, col: COL, uv: UV, count: n, tone: tone.name };
}

const _geos = [];
/** The shared geometry of shape `v`. */
export function rockGeometry(v) {
    const i = ((v % 8) + 8) % 8;
    if (_geos[i]) return _geos[i];
    const a = rockArrays(i), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
    g.computeBoundingSphere();
    g.userData.shared = true; g.userData.keep = true;
    return (_geos[i] = g);
}

let _tex, _mat;
/** The grain of the rock, 256², drawn once: speckles, pits with a light rim, hairline cracks, mineral veins, a few flecks of mica. null without a canvas (tests). */
export function rockTexture() {
    if (_tex !== undefined) return _tex;
    if (typeof document === 'undefined') return (_tex = null);
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), R = rng(424242);
    x.fillStyle = '#c9c9c6'; x.fillRect(0, 0, S, S); // (pale: the vertex colour gives the tone)
    for (let i = 0; i < 90; i++) { // soft blotches
        const px = R() * S, py = R() * S, r = 14 + R() * 38;
        const gr = x.createRadialGradient(px, py, 0, px, py, r);
        const d = R() < 0.5;
        gr.addColorStop(0, d ? 'rgba(90,90,90,0.16)' : 'rgba(255,255,250,0.16)'); gr.addColorStop(1, 'rgba(128,128,128,0)');
        x.fillStyle = gr; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    }
    for (let i = 0; i < 5200; i++) { // the grain: tiny dark and light flecks
        const px = R() * S, py = R() * S, a = 0.1 + R() * 0.32;
        x.fillStyle = R() < 0.55 ? `rgba(40,40,44,${a})` : `rgba(255,255,255,${a * 0.9})`;
        x.fillRect(px, py, 1 + (R() < 0.15 ? 1 : 0), 1);
    }
    for (let i = 0; i < 130; i++) { // pits: a dark hollow with a light rim on the lower side
        const px = R() * S, py = R() * S, r = 1.2 + R() * 2.6;
        x.fillStyle = 'rgba(30,30,34,0.5)'; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.4)'; x.lineWidth = 1; x.beginPath(); x.arc(px + 0.6, py + 0.8, r, 0.2, 2.6); x.stroke();
    }
    for (let i = 0; i < 16; i++) { // cracks: a ragged dark line, a light one beside it
        let px = R() * S, py = R() * S, a = R() * 6.28;
        const len = 20 + R() * 60;
        x.lineWidth = 0.8 + R() * 0.9;
        const pts = [[px, py]];
        for (let s = 0; s < len; s += 3 + R() * 3) { a += (R() - 0.5) * 0.8; px += Math.cos(a) * 3.5; py += Math.sin(a) * 3.5; pts.push([px, py]); }
        x.strokeStyle = 'rgba(25,25,30,0.62)'; x.beginPath(); pts.forEach((p, k) => (k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,0.32)'; x.beginPath(); pts.forEach((p, k) => (k ? x.lineTo(p[0] + 1, p[1] + 1) : x.moveTo(p[0] + 1, p[1] + 1))); x.stroke();
    }
    for (let i = 0; i < 5; i++) { // a mineral vein: a broad pale band with a darker edge
        const px = R() * S, py = R() * S, a = R() * 3.14, len = 70 + R() * 120;
        x.save(); x.translate(px, py); x.rotate(a);
        x.fillStyle = 'rgba(255,255,248,0.28)'; x.fillRect(-len / 2, -2, len, 4 + R() * 3);
        x.fillStyle = 'rgba(60,60,64,0.18)'; x.fillRect(-len / 2, -3, len, 1);
        x.restore();
    }
    for (let i = 0; i < 70; i++) { x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(R() * S, R() * S, 1, 1); } // (mica glints)
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.userData = { shared: true };
    return (_tex = t);
}

/** The one material of every boulder (vertex colours × the grain), Lambert: cheap. */
export function rockMaterial() {
    if (_mat) return _mat;
    const m = new THREE.MeshLambertMaterial({ map: rockTexture() || null, vertexColors: true });
    m.userData.shared = true; m.userData.keep = true;
    return (_mat = m);
}
