/**
 * ShoreModel.js — the look of the shore's small things (ShoreRules.js where; ShoreFloor.js draws). Same way as the forest's (ForestModel.js: one
 * shared 256² atlas drawn once, the builder of its meshes, colours in the vertices, one Lambert alpha-tested material, one geometry per shape):
 *   reed      0 common reed (a sheaf of long arching blades, tan feathery plumes)   1 cattails (brown velvet heads on tall stalks, long leaves)
 *             2 short rushes (a dense fan of thin blades)
 *   lily      a few round pads on the water (a notch, veins, a lifted rim), one or two flowers (white / pink) and a bud
 *   pebbles   a heap of small smooth stones, grey and warm (two sets)
 *   iris      a clump of sword leaves with yellow flag flowers      marigold   round leaves and gold cups
 *   sedge     a tuft of wide blades (two heights)                   drift      a bleached branch with forks (one with a root ball)
 */
import * as THREE from 'three';
import { Mesh, tube, frond, cellUV, norm, mix, mul, hash3, rng } from './ForestModel.js';

export const CELL = { REED: 0, CATTAIL: 1, PAD: 2, LILY: 3, PEBBLE: 4, SEDGE: 5, IRIS: 6, MARIGOLD: 7, DRIFT: 8, PLUME: 9 };
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- shapes
const BUILD = {
    reed(v) {
        const M = new Mesh(), R = rng(11000 + v * 31);
        if (v === 0) { // a sheaf of long blades and a few stalks with plumes
            for (let i = 0; i < 12; i++) {
                const yaw = (i / 12) * TAU + R() * 0.5, len = 2.3 + R() * 1.4, k = 0.85 + R() * 0.3;
                frond(M, [Math.cos(yaw) * 0.1, 0, Math.sin(yaw) * 0.1], yaw, 1.3 - R() * 0.2, 0.5 + R() * 0.7, len, 0.3, CELL.REED, mul([0.42, 0.55, 0.26], k), mul([0.66, 0.72, 0.38], k), 4, 0.1);
            }
            for (let i = 0; i < 3; i++) { // stalks with a plume (a long drooping cone of tan down)
                const a = R() * TAU, lean = 0.15 + R() * 0.2, H = 3.1 + R() * 0.9, path = [], rad = [];
                for (let q = 0; q <= 3; q++) { const f = q / 3; path.push([Math.cos(a) * lean * f * f * 2, f * H, Math.sin(a) * lean * f * f * 2]); rad.push(0.035 * (1 - f * 0.4)); }
                tube(M, path, rad, 4, CELL.REED, () => [0.6, 0.58, 0.36], 1, 1);
                const T = path[3], pp = [T, [T[0] + Math.cos(a) * 0.1, T[1] + 0.3, T[2] + Math.sin(a) * 0.1], [T[0] + Math.cos(a) * 0.22, T[1] + 0.52, T[2] + Math.sin(a) * 0.22]];
                tube(M, pp, [0.02, 0.1, 0.01], 5, CELL.PLUME, (p, n) => mul([0.78, 0.66, 0.5], 0.85 + 0.3 * hash3(p[0], p[1], p[2])), 1, 1);
            }
        } else if (v === 1) { // cattails
            for (let i = 0; i < 5; i++) {
                const a = R() * TAU, lean = 0.1 + R() * 0.25, H = 2.2 + R() * 1.0, path = [], rad = [];
                for (let q = 0; q <= 4; q++) { const f = q / 4; path.push([Math.cos(a) * lean * f * f * 2.5, f * H, Math.sin(a) * lean * f * f * 2.5]); rad.push(0.032 * (1 - f * 0.3)); }
                tube(M, path, rad, 4, CELL.REED, () => [0.46, 0.6, 0.3], 1, 1);
                const T = path[3], U = path[4], hp = [[T[0], T[1] - 0.05, T[2]], [(T[0] + U[0]) / 2, (T[1] + U[1]) / 2 - 0.03, (T[2] + U[2]) / 2], [U[0], U[1] - 0.05, U[2]]];
                tube(M, hp, [0.07, 0.115, 0.05], 6, CELL.CATTAIL, (p) => mul([0.4, 0.26, 0.15], 0.8 + 0.4 * hash3(p[0] * 2, p[1] * 2, p[2] * 2)), 1, 1, null, { cell: CELL.CATTAIL, col: [0.35, 0.24, 0.14] });
                tube(M, [U, [U[0] + (U[0] - T[0]) * 0.3, U[1] + 0.2, U[2] + (U[2] - T[2]) * 0.3]], [0.014, 0.004], 4, CELL.REED, () => [0.5, 0.4, 0.25], 1, 1);
            }
            for (let i = 0; i < 7; i++) { const yaw = (i / 7) * TAU + R(); frond(M, [0, 0, 0], yaw, 1.35, 0.5 + R() * 0.4, 2 + R() * 1.1, 0.34, CELL.REED, [0.34, 0.5, 0.22], [0.6, 0.7, 0.34], 4, 0.15); }
        } else { // short rushes: a dense fan
            for (let i = 0; i < 18; i++) { const yaw = (i / 18) * TAU + R() * 0.4, k = 0.85 + R() * 0.3; frond(M, [Math.cos(yaw) * 0.06, 0, Math.sin(yaw) * 0.06], yaw, 1.4 - R() * 0.3, 0.4 + R() * 0.5, 1.0 + R() * 0.7, 0.14, CELL.REED, mul([0.36, 0.52, 0.22], k), mul([0.62, 0.72, 0.34], k), 3, 0.1); }
        }
        return M;
    },

    // ---- lily pads: the model stands at the surface (y 0) — the floor puts it there
    lily(v) {
        const M = new Mesh(), R = rng(12000 + v * 37), nP = 4 + v;
        const pads = [];
        for (let i = 0; i < nP; i++) {
            const a = i === 0 ? 0 : R() * TAU, d = i === 0 ? 0 : 0.9 + R() * 1.0, r = 0.55 + R() * 0.45, x = Math.cos(a) * d, z = Math.sin(a) * d;
            if (pads.some((q) => Math.hypot(q.x - x, q.z - z) < (q.r + r) * 0.95)) continue;
            pads.push({ x, z, r });
            const notch = R() * TAU, SEG = 14, tone = 0.85 + R() * 0.3, c0 = [x, 0.02, z];
            for (let k = 0; k < SEG; k++) {
                const a0 = (k / SEG) * TAU, a1 = ((k + 1) / SEG) * TAU;
                const skip = Math.abs(((a0 - notch + 3.14159) % TAU + TAU) % TAU - 3.14159) < 0.2; // (the notch: a wedge cut out)
                if (skip) continue;
                const mk = (aa, rr, y) => { const u = 0.5 + 0.5 * rr * Math.cos(aa), w = 0.5 + 0.5 * rr * Math.sin(aa), uv = cellUV(CELL.PAD, u, w); const o = [x + Math.cos(aa) * r * rr, y, z + Math.sin(aa) * r * rr, 0, 1, 0, uv[0], uv[1]]; o.col = mul([0.3, 0.5, 0.2], tone * (0.9 + 0.2 * hash3(aa, rr, x))); return o; };
                M.tri(mk(0, 0, 0.02), mk(a0, 0.55, 0.025), mk(a1, 0.55, 0.025));
                M.tri(mk(a0, 0.55, 0.025), mk(a0, 1, 0.07), mk(a1, 1, 0.07)); // (the rim lifts)
                M.tri(mk(a0, 0.55, 0.025), mk(a1, 1, 0.07), mk(a1, 0.55, 0.025));
            }
        }
        // the flowers: a star of pointed petals in two rings on some pads, and a closed bud on a stalk
        const flowers = v === 0 ? 1 : 2;
        for (let f = 0; f < flowers && f < pads.length; f++) {
            const P = pads[(f * 2 + 1) % pads.length], cx = P.x + 0.05, cz = P.z - 0.05, ring = (n, len, hgt, up, col) => {
                for (let k = 0; k < n; k++) {
                    const a = (k / n) * TAU + f, a0 = a - 0.32, a1 = a + 0.32, uv = cellUV(CELL.LILY, 0.5, 0.5);
                    const tip = [cx + Math.cos(a) * len, hgt + up, cz + Math.sin(a) * len, 0, 1, 0, uv[0], uv[1]];
                    const b0 = [cx + Math.cos(a0) * len * 0.35, hgt, cz + Math.sin(a0) * len * 0.35, 0, 1, 0, uv[0], uv[1]], b1 = [cx + Math.cos(a1) * len * 0.35, hgt, cz + Math.sin(a1) * len * 0.35, 0, 1, 0, uv[0], uv[1]];
                    M.tri(b0, b1, tip, col);
                }
            };
            const tintA = v === 0 ? [0.98, 0.97, 0.94] : [0.96, 0.62, 0.74], tintB = v === 0 ? [0.92, 0.9, 0.82] : [0.86, 0.4, 0.58];
            ring(8, 0.42, 0.06, 0.04, tintB); ring(8, 0.3, 0.1, 0.12, tintA); ring(6, 0.18, 0.14, 0.14, [0.98, 0.88, 0.4]);
        }
        return M;
    },

    // ---- pebbles: a heap of small smooth stones
    pebbles(v) {
        const M = new Mesh(), R = rng(13000 + v * 41);
        const tones = v === 0 ? [[0.62, 0.62, 0.6], [0.5, 0.5, 0.52], [0.72, 0.7, 0.66], [0.42, 0.44, 0.46]] : [[0.74, 0.64, 0.5], [0.66, 0.55, 0.45], [0.8, 0.76, 0.66], [0.58, 0.5, 0.42]];
        const stones = 6 + Math.floor(R() * 3);
        for (let i = 0; i < stones; i++) {
            const a = R() * TAU, d = i === 0 ? 0 : 0.15 + R() * 0.7, r = i === 0 ? 0.42 : 0.14 + R() * 0.26, sx = 0.9 + R() * 0.5, sz = 0.8 + R() * 0.5, sy = 0.45 + R() * 0.25;
            const cx = Math.cos(a) * d, cz = Math.sin(a) * d, tone = tones[i % tones.length], tilt = R() * TAU;
            const LAT = 4, LON = 7, ring = [];
            for (let q = 0; q <= LAT; q++) {
                const th = (q / LAT) * Math.PI * 0.5 + 0.0, row = [];
                for (let k = 0; k <= LON; k++) { const ph = (k / LON) * TAU, w = 1 + 0.16 * (hash3(cx + k, q, cz + i) - 0.5); row.push([cx + Math.cos(ph + tilt) * Math.cos(th) * r * sx * w, Math.sin(th) * r * sy * w - r * 0.12, cz + Math.sin(ph + tilt) * Math.cos(th) * r * sz * w, Math.cos(ph + tilt) * Math.cos(th), Math.sin(th) * 1.2, Math.sin(ph + tilt) * Math.cos(th)]); }
                ring.push(row);
            }
            for (let q = 0; q < LAT; q++) for (let k = 0; k < LON; k++) {
                const mk = (p, qq, kk) => { const uv = cellUV(CELL.PEBBLE, (kk / LON), (qq / LAT)); const n = norm(p[3], p[4], p[5]); const o = [p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1]]; o.col = mul(tone, 0.88 + 0.24 * hash3(p[0] * 5, p[1] * 5, p[2] * 5)); if (p[1] < 0.02 * r) o.col = mul(o.col, 0.75); return o; };
                const a0 = mk(ring[q][k], q, k), b0 = mk(ring[q][k + 1], q, k + 1), c0 = mk(ring[q + 1][k + 1], q + 1, k + 1), d0 = mk(ring[q + 1][k], q + 1, k);
                M.quad(a0, b0, c0, d0);
            }
        }
        return M;
    },

    iris() {
        const M = new Mesh(), R = rng(14000);
        for (let i = 0; i < 6; i++) { const yaw = (i / 6) * TAU + R() * 0.5; frond(M, [0, 0, 0], yaw, 1.25 - R() * 0.2, 0.25 + R() * 0.4, 1.3 + R() * 0.9, 0.9, CELL.IRIS, [0.9, 0.95, 0.9], [1, 1, 1], 3, 0.8); }
        return M;
    },
    marigold() {
        const M = new Mesh(), R = rng(15000);
        for (let i = 0; i < 6; i++) { const yaw = (i / 6) * TAU + R() * 0.6; frond(M, [(R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3], yaw, 1.0, 0.3 + R() * 0.3, 0.7 + R() * 0.45, 0.8, CELL.MARIGOLD, [0.92, 0.95, 0.9], [1, 1, 1], 2, 0.9); }
        return M;
    },

    sedge(v) {
        const M = new Mesh(), R = rng(16000 + v * 43), n = v === 0 ? 10 : 14, H = v === 0 ? [0.9, 1.6] : [1.3, 2.3];
        for (let i = 0; i < n; i++) { const yaw = (i / n) * TAU + R() * 0.5, k = 0.85 + R() * 0.3; frond(M, [Math.cos(yaw) * 0.05, 0, Math.sin(yaw) * 0.05], yaw, 1.25 - R() * 0.3, 0.6 + R() * 0.8, H[0] + R() * (H[1] - H[0]), 0.26, CELL.SEDGE ?? CELL.REED, mul([0.3, 0.46, 0.2], k), mul([0.55, 0.68, 0.3], k), 3, 0.12); }
        return M;
    },

    // ---- driftwood: a bleached branch with forks, lying on the bank
    drift(v) {
        const M = new Mesh(), R = rng(17000 + v * 47), L = 3.2 + v * 0.8, N = 6, path = [], rad = [];
        for (let i = 0; i <= N; i++) { const f = i / N; path.push([-L / 2 + f * L, 0.14 + 0.1 * Math.sin(f * 5 + v), 0.2 * Math.sin(f * 3.3)]); rad.push(0.17 * (1.15 - 0.7 * f) * (1 + 0.1 * Math.sin(f * 19))); }
        const col = (p) => mul([0.78, 0.74, 0.66], 0.82 + 0.3 * hash3(p[0] * 3, p[1] * 3, p[2] * 3));
        tube(M, path, rad, 6, CELL.DRIFT, col, 2, 1, null, { cell: CELL.DRIFT, col: [0.9, 0.86, 0.78] });
        for (let k = 0; k < 3; k++) { // forks
            const f = 0.25 + R() * 0.5, i = Math.floor(f * N), P = path[i], a = (R() < 0.5 ? 1 : -1) * (0.7 + R() * 0.5), len = 0.7 + R() * 0.9;
            tube(M, [P, [P[0] + len * 0.3, P[1] + 0.3, P[2] + Math.sin(a) * len * 0.5], [P[0] + len * 0.55, P[1] + 0.35 + len * 0.2, P[2] + Math.sin(a) * len]], [rad[i] * 0.6, rad[i] * 0.4, 0.03], 5, CELL.DRIFT, col, 1, 1, null, { cell: CELL.DRIFT, col: [0.9, 0.86, 0.78] });
        }
        if (v === 1) { // the root end: a knot of short stubs
            const P = path[0];
            for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + R(), len = 0.5 + R() * 0.5; tube(M, [P, [P[0] - 0.2 - len * 0.5, P[1] + Math.cos(a) * len * 0.7 + 0.1, P[2] + Math.sin(a) * len * 0.7], [P[0] - 0.3 - len, P[1] + Math.cos(a) * len + 0.05, P[2] + Math.sin(a) * len]], [0.12, 0.08, 0.03], 5, CELL.DRIFT, col, 1, 1); }
        }
        return M;
    },
};

export function shoreArrays(kind, v) {
    const f = BUILD[kind];
    if (!f) throw new Error('no such shore kind ' + kind);
    return f(v).arrays();
}

const _geos = new Map();
export function shoreGeometry(kind, v) {
    const key = kind + v;
    if (_geos.has(key)) return _geos.get(key);
    const a = shoreArrays(kind, v), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
    g.computeBoundingSphere();
    g.userData.shared = true; g.userData.keep = true;
    _geos.set(key, g);
    return g;
}

let _tex, _mat;
/** The atlas, 256² (4 × 4 cells of 64²), drawn once. null without a canvas (tests). */
export function shoreAtlas() {
    if (_tex !== undefined) return _tex;
    if (typeof document === 'undefined') return (_tex = null);
    const S = 256, C = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d'), R = rng(3131);
    const cell = (id, draw) => { x.save(); x.beginPath(); x.rect((id % 4) * C, Math.floor(id / 4) * C, C, C); x.clip(); x.translate((id % 4) * C, Math.floor(id / 4) * C); draw(); x.restore(); };
    const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
    const ell = (px, py, rx, ry, rot, fill, stroke) => { x.save(); x.translate(px, py); x.rotate(rot); x.beginPath(); x.ellipse(0, 0, rx, ry, 0, 0, 7); x.fillStyle = fill; x.fill(); if (stroke) { x.strokeStyle = stroke; x.lineWidth = 0.7; x.beginPath(); x.moveTo(-rx, 0); x.lineTo(rx, 0); x.stroke(); } x.restore(); };
    x.clearRect(0, 0, S, S);
    // a long narrow blade (u across, v along the length): a midrib, fine parallel veins, a dry brown tip
    cell(CELL.REED, () => {
        const g = x.createLinearGradient(0, C, 0, 0); g.addColorStop(0, '#4d7a28'); g.addColorStop(0.7, '#78a238'); g.addColorStop(1, '#a89a4a'); x.fillStyle = g;
        x.beginPath(); x.moveTo(C * 0.22, C); x.quadraticCurveTo(C * 0.12, C * 0.5, C * 0.46, 0); x.lineTo(C * 0.54, 0); x.quadraticCurveTo(C * 0.88, C * 0.5, C * 0.78, C); x.closePath(); x.fill();
        x.strokeStyle = rgb(40, 70, 20, 0.7); x.lineWidth = 1.3; x.beginPath(); x.moveTo(C / 2, C); x.lineTo(C / 2, 0); x.stroke();
        for (let i = -4; i <= 4; i++) { if (!i) continue; x.strokeStyle = rgb(50, 85, 28, 0.35); x.lineWidth = 0.7; x.beginPath(); x.moveTo(C / 2 + i * 4, C); x.lineTo(C / 2 + i * 1.6, 2); x.stroke(); }
    });
    cell(CELL.CATTAIL, () => { // velvet brown with fine light speckles (the sausage head)
        x.fillStyle = '#6b4526'; x.fillRect(0, 0, C, C);
        for (let i = 0; i < 160; i++) { x.fillStyle = rgb(R() < 0.5 ? 40 : 150, R() < 0.5 ? 26 : 100, R() < 0.5 ? 14 : 60, 0.35); x.fillRect(R() * C, R() * C, 1 + R() * 2, 1 + R() * 2); }
    });
    cell(CELL.PAD, () => { // a lily pad seen from above: a round leaf with radial veins, a darker rim, a pale centre
        const g = x.createRadialGradient(C / 2, C / 2, 2, C / 2, C / 2, C / 2); g.addColorStop(0, '#6fa83a'); g.addColorStop(0.8, '#4a8a2a'); g.addColorStop(1, '#2f6620'); x.fillStyle = g; x.beginPath(); x.arc(C / 2, C / 2, C / 2 - 1, 0, 7); x.fill();
        for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.28; x.strokeStyle = rgb(30, 80, 20, 0.45); x.lineWidth = 0.8; x.beginPath(); x.moveTo(C / 2, C / 2); x.lineTo(C / 2 + Math.cos(a) * C / 2, C / 2 + Math.sin(a) * C / 2); x.stroke(); }
        for (let i = 0; i < 30; i++) { x.fillStyle = rgb(200, 230, 170, 0.12); x.beginPath(); x.arc(R() * C, R() * C, 1 + R() * 3, 0, 7); x.fill(); } // (water drops)
    });
    cell(CELL.LILY, () => { x.fillStyle = '#fafaf4'; x.fillRect(0, 0, C, C); for (let i = 0; i < 12; i++) { x.strokeStyle = rgb(210, 190, 200, 0.5); x.lineWidth = 1; x.beginPath(); x.moveTo(C / 2 + (i - 6) * 3, C); x.lineTo(C / 2, 0); x.stroke(); } });
    cell(CELL.PEBBLE, () => { // smooth stone: speckles, a vein, a few pits
        x.fillStyle = '#d4d2cc'; x.fillRect(0, 0, C, C);
        for (let i = 0; i < 400; i++) { x.fillStyle = rgb(R() < 0.5 ? 60 : 255, R() < 0.5 ? 60 : 255, R() < 0.5 ? 64 : 250, 0.2); x.fillRect(R() * C, R() * C, 1, 1 + (R() < 0.2 ? 1 : 0)); }
        for (let i = 0; i < 3; i++) { x.strokeStyle = rgb(255, 255, 250, 0.35); x.lineWidth = 2 + R() * 2; x.beginPath(); x.moveTo(0, R() * C); x.quadraticCurveTo(C / 2, R() * C, C, R() * C); x.stroke(); }
        for (let i = 0; i < 8; i++) { x.fillStyle = rgb(30, 30, 34, 0.35); x.beginPath(); x.arc(R() * C, R() * C, 0.8 + R() * 1.4, 0, 7); x.fill(); }
    });
    cell(CELL.SEDGE, () => { // a flat sedge blade: lighter midrib, finely veined
        const g = x.createLinearGradient(0, C, 0, 0); g.addColorStop(0, '#3f7228'); g.addColorStop(1, '#8bb040'); x.fillStyle = g;
        x.beginPath(); x.moveTo(C * 0.18, C); x.quadraticCurveTo(C * 0.1, C * 0.45, C * 0.48, 0); x.lineTo(C * 0.52, 0); x.quadraticCurveTo(C * 0.9, C * 0.45, C * 0.82, C); x.closePath(); x.fill();
        x.strokeStyle = rgb(190, 215, 130, 0.6); x.lineWidth = 1.2; x.beginPath(); x.moveTo(C / 2, C); x.lineTo(C / 2, 0); x.stroke();
        for (let i = -6; i <= 6; i += 2) { x.strokeStyle = rgb(40, 80, 25, 0.3); x.lineWidth = 0.6; x.beginPath(); x.moveTo(C / 2 + i * 3, C); x.lineTo(C / 2 + i, 3); x.stroke(); }
    });
    cell(CELL.IRIS, () => { // sword leaves and a yellow flag flower on top
        for (const sd of [-1, 1]) { x.fillStyle = rgb(70, 130, 50); x.beginPath(); x.moveTo(C / 2, C); x.quadraticCurveTo(C / 2 + sd * 22, C * 0.55, C / 2 + sd * 8, C * 0.32); x.quadraticCurveTo(C / 2 + sd * 7, C * 0.6, C / 2, C); x.fill(); }
        x.strokeStyle = '#5e8f3a'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(C / 2, C); x.lineTo(C / 2, 15); x.stroke();
        const fx = C / 2, fy = 11;
        for (const [dx, dy, rot] of [[-7, 4, 0.7], [7, 4, -0.7], [0, -6, 0]]) ell(fx + dx, fy + dy, 6, 3.6, rot + (dx ? 0 : 1.57), rgb(244, 208, 40));
        for (const dx of [-3, 3]) ell(fx + dx, fy - 1, 2.6, 5, dx * 0.12, rgb(255, 232, 90));
        x.fillStyle = rgb(140, 70, 20, 0.8); x.fillRect(fx - 1, fy + 1, 2, 5); // (the brown honey-guide)
    });
    cell(CELL.MARIGOLD, () => { // round shiny leaves and gold cups (marsh marigold)
        x.strokeStyle = '#4f8a35'; x.lineWidth = 1.3; x.beginPath(); x.moveTo(C / 2, C); x.lineTo(C / 2, 16); x.stroke();
        for (let i = 0; i < 4; i++) ell(C / 2 + (i % 2 ? 9 : -9), C - 8 - i * 6, 8, 7, 0.3 * (i % 2 ? 1 : -1), rgb(54 + R() * 20, 120 + R() * 25, 44), rgb(30, 80, 24, 0.6));
        for (const [fx, fy] of [[C / 2, 12], [C / 2 - 13, 22], [C / 2 + 13, 24]]) { for (let k = 0; k < 6; k++) ell(fx + Math.cos(k) * 4, fy + Math.sin(k) * 3.4, 4.6, 3.1, k, rgb(252, 205, 28)); x.fillStyle = rgb(190, 130, 10); x.beginPath(); x.arc(fx, fy, 1.8, 0, 7); x.fill(); }
    });
    cell(CELL.DRIFT, () => { // bleached wood: grey-white grain along the branch, checks and a few dark knots
        x.fillStyle = '#cfc7b6'; x.fillRect(0, 0, C, C);
        for (let i = 0; i < 28; i++) { const px = R() * C; x.strokeStyle = rgb(R() < 0.5 ? 110 : 245, R() < 0.5 ? 100 : 238, R() < 0.5 ? 86 : 225, 0.3); x.lineWidth = 0.7 + R() * 1.2; x.beginPath(); x.moveTo(px, 0); for (let y = 0; y <= C; y += 6) x.lineTo(px + Math.sin(y * 0.3 + i) * 1.4, y); x.stroke(); }
        for (let i = 0; i < 5; i++) { x.strokeStyle = rgb(70, 60, 48, 0.55); x.lineWidth = 0.9; x.beginPath(); const px = R() * C, py = R() * C; x.moveTo(px, py); x.lineTo(px + (R() - 0.5) * 6, py + 5 + R() * 10); x.stroke(); }
        for (let i = 0; i < 2; i++) { x.fillStyle = rgb(80, 66, 50, 0.7); x.beginPath(); x.ellipse(R() * C, R() * C, 2.5, 4, 0, 0, 7); x.fill(); }
    });
    cell(CELL.PLUME, () => { x.fillStyle = '#b79c78'; x.fillRect(0, 0, C, C); for (let i = 0; i < 90; i++) { x.strokeStyle = rgb(R() < 0.5 ? 120 : 235, R() < 0.5 ? 90 : 215, R() < 0.5 ? 70 : 190, 0.45); x.lineWidth = 1; const px = R() * C; x.beginPath(); x.moveTo(px, R() * C); x.lineTo(px + (R() - 0.5) * 10, R() * C); x.stroke(); } });
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4; t.userData = { shared: true };
    return (_tex = t);
}

export function shoreMaterial() {
    if (_mat) return _mat;
    const m = new THREE.MeshLambertMaterial({ map: shoreAtlas() || null, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide });
    m.userData.shared = true; m.userData.keep = true;
    return (_mat = m);
}
