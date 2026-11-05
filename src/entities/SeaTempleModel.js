/**
 * SeaTempleModel.js — the temple of the sea's old faith, lying deep on the sea's bottom (SunkenSites.js / SunkenWorld.js; the
 * author: «подводный храм с сундуками»; CLAUDE.md «Запрет на примитив»: many small details, no box set).
 *
 * In its own metres (y 0 — the foot of its lowest step, the entrance towards +z; a hero is ~3.5 m, so a column is ~2.8 heroes):
 *   - a foundation sunk in the sand and three steps (22 × 32 m at the foot, 0.6 m each);
 *   - a colonnade round it (5 × 8 fluted columns, 9.8 m with base and capital) — some broken off at a drum, their upper drums
 *     lying fallen on the steps and the sand; over the standing ones the architrave, a frieze with triglyphs, the cornice — gaps
 *     where a column went (the beam lies below);
 *   - the cella: walls of ashlar courses (each block its own, a little out of line), the doorway 3.4 × 6.4 m, the tops of the walls
 *     broken off unevenly; no roof (it fell in: slabs leaning inside); runes cut round the inside that glow sea-blue;
 *   - the front pediment, one corner broken away;
 *   - the altar with its glowing channel, and over it on a plinth the sea's guardian: a robed, bearded figure with a crown of
 *     points, a trident raised in its right hand, a shell in its left — green with age;
 *   - two bronze braziers by the door, a glowing orb in each.
 * Two meshes (stone with vertex colours and a block texture; the glow), shared geometry per temple (made once — every temple looks
 * the same but for where it lies), shaders compiled at the loading screen (sample()). The colours: stone pale grey-green, weed green
 * low and on the up-turned faces, silt sandy on the tops.
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';

export const TEMPLE = {
    W: 22, L: 32, STEP: 0.6, STEPS: 3,
    get TOP() { return this.STEP * this.STEPS; }, // 1.8: the floor of the colonnade
    COL_X: 8, COL_Z: [-12.6, -9, -5.4, -1.8, 1.8, 5.4, 9, 12.6], COL_FRONT: [-8, -4, 0, 4, 8],
    COL_R: 0.62, SHAFT: 8.4, COL_H: 9.77,
    CELLA: { x0: -5, x1: 5, z0: -9.5, z1: 8, t: 0.9, h: 9.6 },
    DOOR: { w: 3.4, h: 6.4 },
    ALTAR_Z: -6, STATUE_Z: -8.2,
};
/** The chests (temple metres; yaw: where the lid's front looks, in the temple's turn). */
export const TEMPLE_CHESTS = [
    { x: 0, z: -4.1, yaw: 0, room: 'seaAltar' },
    { x: -3.4, z: 5.6, yaw: Math.PI / 2, room: 'seaTemple' },
    { x: 3.4, z: 5.6, yaw: -Math.PI / 2, room: 'seaTemple' },
    { x: 0, z: -12.2, yaw: Math.PI, room: 'seaTemple' }, // (in the back portico, behind the cella)
];

const STONE = [0.66, 0.69, 0.63], STONE_D = [0.55, 0.58, 0.53], BRONZE = [0.32, 0.52, 0.46], MOSS = [0.25, 0.36, 0.2], SILT = [0.58, 0.55, 0.44];

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** A geometry painted one colour, its uv made to repeat every ~3 m (the block texture: joints, grain). */
function tag(g, c) {
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    return g;
}
function box(w, h, d, c = STONE) {
    const g = new THREE.BoxGeometry(w, h, d);
    // (each face's uv in metres / 3: the block texture keeps its size on a long beam and a small block alike)
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / 3, uv.getY(i) * dims[f][1] / 3); }
    return tag(g, c);
}
/** A fluted column shaft (20 flutes), tapering, uv round it in metres. */
function shaft(r0, r1, h, c = STONE) {
    const g = new THREE.CylinderGeometry(r1, r0, h, 40, 6, false);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
        if (r < 1e-4) continue;
        const a = Math.atan2(z, x), k = 1 - 0.07 * Math.pow(Math.abs(Math.sin(a * 10)), 0.6);
        p.setX(i, x * k); p.setZ(i, z * k);
        uv.setXY(i, uv.getX(i) * (Math.PI * 2 * r0) / 3, uv.getY(i) * h / 3);
    }
    g.computeVertexNormals();
    return tag(g, c);
}
function cyl(r0, r1, h, c = STONE, seg = 20) { return tag(new THREE.CylinderGeometry(r1, r0, h, seg), c); }
function lathe(pts, c, seg = 24) { return tag(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), c); }
function sphere(r, c, sx = 1, sy = 1, sz = 1) { const g = new THREE.SphereGeometry(r, 16, 12); g.scale(sx, sy, sz); return tag(g, c); }
function cone(r, h, c) { return tag(new THREE.ConeGeometry(r, h, 10), c); }

/** Is the column at (x, z) broken (and where)? Decided by its place (the same temple on every computer). */
function columnFate(x, z) {
    const r = rng(Math.round(x * 31 + z * 97 + 1234))();
    if (r < 0.28) return 1.6 + r / 0.28 * 4.4; // (broken off at a drum this high over its base)
    return null;
}

let _geo = null, _glowGeo = null, _mat = null, _glowMat = null;

/** The temple's stone geometry and its glow (made once). */
export function templeGeometry() {
    if (_geo) return { stone: _geo, glow: _glowGeo };
    const T = TEMPLE, P = [], G = [], R = rng(7771);
    const add = (geo, pos, rot = [0, 0, 0]) => P.push({ geo, pos, rot });
    const glow = (geo, pos, rot = [0, 0, 0]) => G.push({ geo, pos, rot });
    // ——— the foundation and the steps
    add(box(T.W, 4, T.L, STONE_D), [0, -2, 0]);
    for (let i = 0; i < T.STEPS; i++) {
        const w = T.W - 1.6 * i, l = T.L - 1.6 * i, y = T.STEP * i;
        // (each step of separate slabs, a little uneven — a worn, settled stair)
        const n = Math.round(l / 4);
        for (let k = 0; k < n; k++) {
            const zl = l / n, z = -l / 2 + zl * (k + 0.5);
            add(box(w, T.STEP + R() * 0.06, zl - 0.04, R() < 0.5 ? STONE : STONE_D), [(R() - 0.5) * 0.08, y + T.STEP / 2, z]);
        }
    }
    const Y0 = T.TOP;
    // ——— the columns
    const cols = [];
    for (const z of T.COL_Z) for (const x of [-T.COL_X, T.COL_X]) cols.push([x, z]);
    for (const x of T.COL_FRONT.slice(1, -1)) for (const z of [T.COL_Z[0], T.COL_Z[T.COL_Z.length - 1]]) cols.push([x, z]);
    const standing = new Set();
    for (const [x, z] of cols) {
        const br = columnFate(x, z);
        add(cyl(1.0, 0.95, 0.3), [x, Y0 + 0.15, z]); // (the plinth)
        add(lathe([[0, 0], [0.92, 0], [0.92, 0.08], [0.82, 0.14], [0.86, 0.2], [0.7, 0.25], [0, 0.25]], STONE, 24), [x, Y0 + 0.3, z]); // (the torus and scotia of the base)
        const sh = br ?? T.SHAFT;
        add(shaft(T.COL_R, T.COL_R - 0.1 * sh / T.SHAFT, sh), [x, Y0 + 0.55 + sh / 2, z]);
        if (br == null) {
            standing.add(x + ',' + z);
            const top = Y0 + 0.55 + T.SHAFT;
            add(lathe([[0.52, 0], [0.56, 0.06], [0.8, 0.32], [0.86, 0.4], [0, 0.4]], STONE), [x, top, z]); // (the echinus)
            add(box(1.9, 0.34, 1.9), [x, top + 0.57, z]); // (the abacus)
        } else {
            // its jagged top: a tilted drum-end, and its upper drums lying fallen on the steps and the sand
            add(cyl(T.COL_R - 0.05, T.COL_R - 0.08, 0.3, STONE_D, 12), [x, Y0 + 0.55 + sh + 0.05, z], [0.25 * (R() - 0.5), 0, 0.3 * (R() - 0.5)]);
            const a = Math.atan2(x, z) + (R() - 0.5) * 1.2, n = 2 + Math.floor(R() * 2);
            for (let k = 0; k < n; k++) {
                const d = 3 + k * 1.9 + R(), px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
                const out = Math.abs(px) > T.W / 2 - 0.5 || Math.abs(pz) > T.L / 2 - 0.5;
                add(shaft(T.COL_R - 0.03, T.COL_R - 0.06, 1.7, R() < 0.5 ? STONE : STONE_D), [px, (out ? 0 : Y0) + T.COL_R - 0.08, pz], [Math.PI / 2, a + (R() - 0.5) * 0.6, 0]);
            }
        }
    }
    // ——— the entablature over the standing columns (architrave, frieze with triglyphs, cornice); a gap — the beam lies below
    const top = Y0 + T.COL_H;
    const beam = (x0, z0, x1, z1) => {
        const len = Math.hypot(x1 - x0, z1 - z0) + 1.9, along = Math.abs(x1 - x0) > 0.1, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const bw = (w, h, y, c) => add(along ? box(len, h, w, c) : box(w, h, len, c), [mx, y, mz]);
        bw(1.5, 1.1, top + 0.55, STONE);
        bw(1.3, 0.9, top + 1.55, STONE_D);
        // (the triglyphs: grooved blocks in the frieze, on the outer face)
        const n = Math.max(2, Math.round(len / 1.8));
        for (let k = 0; k <= n; k++) {
            const u = -len / 2 + len * k / n, ox = along ? u : 0, oz = along ? 0 : u;
            const fx = along ? 0 : Math.sign(mx || 1) * 0.68, fz = along ? Math.sign(mz || 1) * 0.68 : 0;
            for (const g of [-0.18, 0, 0.18]) add(along ? box(0.1, 0.8, 0.06, STONE) : box(0.06, 0.8, 0.1, STONE), [mx + ox + fx + (along ? g : 0), top + 1.55, mz + oz + fz + (along ? 0 : g)]);
        }
        bw(2.0, 0.3, top + 2.15, STONE);
        bw(1.8, 0.14, top + 2.37, STONE_D);
    };
    const fallenBeam = (x0, z0, x1, z1) => {
        const mx = (x0 + x1) / 2 + (R() - 0.5) * 2, mz = (z0 + z1) / 2 + (R() - 0.5) * 2, len = Math.hypot(x1 - x0, z1 - z0) * 0.8;
        const out = Math.abs(mx) > T.W / 2 - 1 || Math.abs(mz) > T.L / 2 - 1;
        add(box(len, 1.1, 1.4, STONE_D), [mx, (out ? 0 : Y0) + 0.5, mz], [(R() - 0.5) * 0.3, Math.atan2(z1 - z0, x1 - x0) * -1 + (R() - 0.5) * 0.5, (R() - 0.5) * 0.25]);
    };
    const ring = [];
    for (const z of T.COL_Z) ring.push([T.COL_X, z]);
    for (const x of [...T.COL_FRONT].reverse().slice(1)) ring.push([x, T.COL_Z[T.COL_Z.length - 1]]);
    for (const z of [...T.COL_Z].reverse().slice(1)) ring.push([-T.COL_X, z]);
    for (const x of T.COL_FRONT.slice(1)) ring.push([x, T.COL_Z[0]]);
    ring.length = ring.length - 1;
    for (let i = 0; i < ring.length; i++) {
        const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
        if (Math.hypot(x1 - x0, z1 - z0) < 0.5) continue;
        if (standing.has(x0 + ',' + z0) && standing.has(x1 + ',' + z1)) beam(x0, z0, x1, z1);
        else if (R() < 0.7) fallenBeam(x0, z0, x1, z1);
    }
    // ——— the front pediment (one corner broken away)
    {
        const zf = T.COL_Z[T.COL_Z.length - 1], hw = T.COL_X + 1.2, ph = 3.2, s = new THREE.Shape();
        s.moveTo(-hw, 0); s.lineTo(hw * 0.55, 0); s.lineTo(hw * 0.38, ph * 0.42); s.lineTo(hw * 0.2, ph * 0.5); s.lineTo(0, ph); s.lineTo(-hw, 0);
        const g = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false });
        g.translate(0, 0, -0.6);
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
        if (standing.has(-T.COL_X + ',' + zf) || standing.has('0,' + zf)) add(tag(g, STONE), [0, top + 2.44, zf]);
        else add(tag(g, STONE_D), [-3, 0.6, zf + 4], [-Math.PI / 2 + 0.2, 0.4, 0]); // (fallen face down in the sand before the steps)
    }
    // ——— the cella: walls of ashlar courses, the doorway, the broken tops
    const C = T.CELLA, course = 1.2, nCourse = Math.round(C.h / course);
    const wall = (x0, z0, x1, z1, door) => {
        const along = Math.abs(x1 - x0) > 0.1, len = Math.hypot(x1 - x0, z1 - z0);
        for (let k = 0; k < nCourse; k++) {
            const y = Y0 + course * (k + 0.5);
            // (the top courses broken off unevenly: fewer blocks the higher, by a wave along the wall)
            let u = (k % 2) * -1.2;
            while (u < len) {
                const bl = Math.min(2.4 + (R() - 0.5) * 0.4, len - u);
                const u0 = Math.max(0, u), u1 = Math.min(len, u + bl);
                u += bl;
                if (u1 - u0 < 0.3) continue;
                const um = (u0 + u1) / 2;
                if (door && Math.abs(um - len / 2) < T.DOOR.w / 2 + (u1 - u0) / 2 - 0.05 && course * k < T.DOOR.h) continue; // (the doorway)
                const broken = k >= nCourse - 3 && R() < (k - (nCourse - 4)) * 0.28 + 0.12 * Math.sin(um * 0.7);
                if (broken) continue;
                const px = along ? x0 + Math.sign(x1 - x0) * um : x0, pz = along ? z0 : z0 + Math.sign(z1 - z0) * um;
                const jit = (R() - 0.5) * 0.06, c = R() < 0.35 ? STONE_D : STONE;
                add(along ? box(u1 - u0 - 0.04, course - 0.04, C.t + jit, c) : box(C.t + jit, course - 0.04, u1 - u0 - 0.04, c), [px + (along ? 0 : jit), y, pz + (along ? jit : 0)]);
            }
        }
    };
    wall(C.x0, C.z0, C.x1, C.z0, false); // back
    wall(C.x0, C.z0, C.x0, C.z1, false); // left
    wall(C.x1, C.z0, C.x1, C.z1, false); // right
    wall(C.x0, C.z1, C.x1, C.z1, true); // front, the doorway
    // the lintel over the door and its jambs (dressed stone, a moulding)
    add(box(T.DOOR.w + 1.6, 0.9, C.t + 0.3, STONE), [0, Y0 + T.DOOR.h + 0.45, C.z1]);
    for (const s of [-1, 1]) add(box(0.4, T.DOOR.h, C.t + 0.25, STONE_D), [s * (T.DOOR.w / 2 + 0.2), Y0 + T.DOOR.h / 2, C.z1]);
    // the roof's fallen slabs leaning in the cella
    for (let k = 0; k < 4; k++) add(box(3.4 + R() * 1.5, 0.45, 2.2 + R(), STONE_D), [(R() - 0.5) * 6, Y0 + 0.9 + R() * 0.8, -1 + (R() - 0.5) * 8], [(R() - 0.5) * 0.9, R() * 3, (R() - 0.5) * 0.7]);
    // runes cut round the inside of the cella, glowing: small marks of two-three strokes
    const rune = (x, z, nx, nz) => {
        const y = Y0 + 4.2 + (R() - 0.5) * 0.3, kind = Math.floor(R() * 4), t = 0.07;
        const strokes = [[[0, 0, 0.55, 0], [0, 0.18, 0.3, Math.PI / 4]], [[0, 0, 0.55, 0], [0, 0, 0.4, Math.PI / 2]], [[-0.1, 0, 0.5, 0.35], [0.1, 0, 0.5, -0.35]], [[0, 0.12, 0.5, 0], [0, -0.12, 0.5, 0], [0, 0, 0.3, Math.PI / 2]]][kind];
        for (const [ox, oy, l, a] of strokes) {
            const g = new THREE.BoxGeometry(t, l, 0.04);
            g.rotateZ(a);
            if (nx) g.rotateY(Math.PI / 2);
            glow(g, [x + (nz ? ox : 0) + nx * 0.02, y + oy, z + (nx ? ox : 0) + nz * 0.02]);
        }
    };
    for (let z = C.z0 + 1.5; z < C.z1 - 1; z += 1.6) { rune(C.x0 + C.t / 2, z, 1, 0); rune(C.x1 - C.t / 2, z, -1, 0); }
    for (let x = C.x0 + 1.5; x < C.x1 - 1; x += 1.6) rune(x, C.z0 + C.t / 2, 0, 1);
    // ——— the altar: plinth, body with a wave moulding, the top slab, the glowing channel in it
    const az = T.ALTAR_Z;
    add(box(4.0, 0.35, 2.6, STONE_D), [0, Y0 + 0.17, az]);
    add(box(3.3, 1.15, 1.9, STONE), [0, Y0 + 0.92, az]);
    for (let k = -3; k <= 3; k++) add(sphere(0.18, STONE_D, 1, 0.6, 0.5), [k * 0.45, Y0 + 1.25, az + 0.96]); // (the wave moulding: a row of rolls)
    add(box(3.9, 0.26, 2.5, STONE), [0, Y0 + 1.63, az]);
    glow(new THREE.BoxGeometry(3.0, 0.05, 0.28), [0, Y0 + 1.77, az]);
    glow(new THREE.BoxGeometry(0.28, 0.05, 1.8), [0, Y0 + 1.77, az]);
    // ——— the sea's guardian on its plinth: a robed, bearded figure, a crown of points, the trident raised, a shell in the left hand
    const sz = T.STATUE_Z, sb = Y0 + 1.7;
    add(box(3.0, 1.7, 2.4, STONE_D), [0, Y0 + 0.85, sz]);
    add(box(3.3, 0.22, 2.7, STONE), [0, sb - 0.11, sz]);
    add(lathe([[1.05, 0], [1.0, 0.3], [0.86, 1.2], [0.7, 2.3], [0.66, 2.7], [0.8, 3.3], [0.84, 3.7], [0.62, 4.05], [0.3, 4.2], [0, 4.2]], BRONZE, 28), [0, sb, sz]); // (the robe, the chest, the shoulders)
    for (let k = 0; k < 9; k++) { const a = -1.2 + k * 0.3; add(cyl(0.07, 0.05, 2.6, BRONZE, 6), [Math.sin(a) * 0.95, sb + 1.3, sz + Math.cos(a) * 0.95], [0.08, 0, -Math.sin(a) * 0.08]); } // (the folds down the front)
    add(cyl(0.24, 0.28, 0.4, BRONZE, 12), [0, sb + 4.35, sz]); // (the neck)
    add(sphere(0.45, BRONZE, 0.92, 1.08, 0.98), [0, sb + 4.95, sz]); // (the head)
    add(cone(0.34, 0.9, BRONZE), [0, sb + 4.4, sz + 0.3], [Math.PI - 0.35, 0, 0]); // (the beard)
    add(sphere(0.1, BRONZE), [0, sb + 4.98, sz + 0.44]); // (the nose)
    for (const s of [-1, 1]) add(sphere(0.07, STONE_D), [s * 0.16, sb + 5.1, sz + 0.39]); // (the eyes, hollow)
    add(cyl(0.48, 0.5, 0.18, BRONZE, 18), [0, sb + 5.38, sz]); // (the crown's band)
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; add(cone(0.08, 0.45, BRONZE), [Math.sin(a) * 0.45, sb + 5.65, sz + Math.cos(a) * 0.45]); }
    // the right arm raised, holding the trident up
    add(cyl(0.2, 0.18, 1.4, BRONZE, 10), [0.98, sb + 3.85, sz], [0, 0, -0.9]);
    add(cyl(0.17, 0.14, 1.3, BRONZE, 10), [1.42, sb + 4.65, sz], [0, 0, -0.15]);
    add(sphere(0.2, BRONZE), [1.5, sb + 5.3, sz]); // (the fist)
    add(cyl(0.08, 0.08, 7.4, BRONZE, 8), [1.5, sb + 3.6, sz]); // (the shaft)
    add(box(1.1, 0.12, 0.12, BRONZE), [1.5, sb + 7.3, sz]); // (the crossbar)
    for (const [ox, h] of [[-0.5, 0.9], [0, 1.25], [0.5, 0.9]]) {
        add(cyl(0.05, 0.05, h, BRONZE, 6), [1.5 + ox, sb + 7.36 + h / 2, sz]);
        add(cone(0.1, 0.32, BRONZE), [1.5 + ox, sb + 7.36 + h + 0.15, sz]); // (the barbed points)
    }
    // the left arm down, a great shell in the hand
    add(cyl(0.2, 0.17, 1.5, BRONZE, 10), [-0.95, sb + 3.2, sz + 0.1], [0.2, 0, 0.25]);
    add(cyl(0.16, 0.13, 1.2, BRONZE, 10), [-1.05, sb + 2.2, sz + 0.45], [0.9, 0, 0.05]);
    add(sphere(0.42, BRONZE, 1.1, 0.5, 0.85), [-1.0, sb + 1.85, sz + 1.05]);
    for (let k = 0; k < 6; k++) add(cyl(0.035, 0.035, 0.85, BRONZE, 5), [-1.0 + (k - 2.5) * 0.12, sb + 2.0, sz + 1.05], [Math.PI / 2, (k - 2.5) * 0.18, 0]); // (its ribs)
    // ——— the braziers by the door: three bronze legs, a bowl, a glowing orb in each
    for (const s of [-1, 1]) {
        const bx = s * 3.1, bz = C.z1 - 2;
        for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; add(cyl(0.06, 0.05, 2.1, BRONZE, 6), [bx + Math.sin(a) * 0.32, Y0 + 1.0, bz + Math.cos(a) * 0.32], [Math.cos(a) * 0.16, 0, -Math.sin(a) * 0.16]); }
        add(lathe([[0.1, 0], [0.5, 0.12], [0.68, 0.42], [0.72, 0.5], [0.62, 0.5], [0.5, 0.2], [0, 0.18]], BRONZE, 18), [bx, Y0 + 2.0, bz]);
        glow(new THREE.SphereGeometry(0.36, 16, 12), [bx, Y0 + 2.55, bz]);
    }
    // ——— loose blocks fallen down the steps and on the sand
    for (let k = 0; k < 14; k++) {
        const a = R() * Math.PI * 2, d = 9 + R() * 12, px = Math.sin(a) * d * 1.1, pz = Math.cos(a) * d * 1.4;
        const out = Math.abs(px) > T.W / 2 || Math.abs(pz) > T.L / 2;
        add(box(1.2 + R() * 1.4, 0.9 + R() * 0.4, 0.9 + R() * 0.6, R() < 0.5 ? STONE : STONE_D), [px, (out ? 0.35 : Y0 + 0.35), pz], [(R() - 0.5) * 0.5, R() * 3, (R() - 0.5) * 0.5]);
    }
    _geo = weathered(mergeParts(P));
    for (const g of G) tag(g.geo, [1, 1, 1]);
    _glowGeo = mergeParts(G);
    _geo.computeBoundingSphere(); _glowGeo.computeBoundingSphere();
    return { stone: _geo, glow: _glowGeo };
}

/** The sea's work on the stone: weed green low down and on the up-turned faces, silt on the tops, every block a little its own tone. */
function weathered(g) {
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
    const h = (x, y, z) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return v - Math.floor(v); };
    const sm = (x, y, z) => 0.5 + 0.25 * Math.sin(x * 0.9 + z * 0.7) + 0.25 * Math.sin(y * 1.3 + x * 0.4 - z * 0.6);
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = n.getY(i);
        let r = c.getX(i), gg = c.getY(i), b = c.getZ(i);
        const tone = 0.86 + 0.2 * h(Math.floor(x * 0.8), Math.floor(y * 0.8), Math.floor(z * 0.8));
        r *= tone; gg *= tone; b *= tone;
        const w = sm(x, y, z);
        const moss = Math.min(0.75, Math.max(0, (ny > 0.55 ? 0.45 : 0) + (2.8 - y) * 0.12 + (w - 0.55) * 0.9));
        r += (MOSS[0] - r) * moss; gg += (MOSS[1] - gg) * moss; b += (MOSS[2] - b) * moss;
        if (ny > 0.8) { const s = 0.35 * w; r += (SILT[0] - r) * s; gg += (SILT[1] - gg) * s; b += (SILT[2] - b) * s; }
        c.setXYZ(i, r, gg, b);
    }
    c.needsUpdate = true;
    return g;
}

/** The ashlar texture: blocks with joints, grain, pits and streaks (made once; none without a page — the tests). */
function blockTexture() {
    if (typeof document === 'undefined') return null;
    const S = 256, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const x = cv.getContext('2d'), R = rng(99);
    x.fillStyle = '#d8d8d2'; x.fillRect(0, 0, S, S);
    const id = x.getImageData(0, 0, S, S), d = id.data;
    for (let i = 0; i < S * S; i++) { const v = 200 + (R() - 0.5) * 50; d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v - 4; d[i * 4 + 3] = 255; }
    x.putImageData(id, 0, 0);
    // (the blocks: two courses a tile, each block a tone of its own, dark joints, chipped edges)
    for (let row = 0; row < 2; row++) for (let k = -1; k < 3; k++) {
        const bx = k * 128 + (row ? 64 : 0), by = row * 128;
        x.fillStyle = `rgba(${R() < 0.5 ? '255,255,250' : '90,95,90'},${0.06 + R() * 0.1})`; x.fillRect(bx + 3, by + 3, 122, 122);
        x.strokeStyle = 'rgba(40,44,40,0.75)'; x.lineWidth = 3; x.strokeRect(bx + 1.5, by + 1.5, 125, 125);
    }
    for (let k = 0; k < 140; k++) { x.fillStyle = `rgba(60,64,58,${0.15 + R() * 0.3})`; x.beginPath(); x.arc(R() * S, R() * S, 0.6 + R() * 2.2, 0, Math.PI * 2); x.fill(); } // (pits)
    for (let k = 0; k < 18; k++) { x.strokeStyle = `rgba(70,75,68,${0.12 + R() * 0.15})`; x.lineWidth = 1; x.beginPath(); let px = R() * S, py = R() * S; x.moveTo(px, py); for (let j = 0; j < 5; j++) { px += (R() - 0.5) * 30; py += R() * 22; x.lineTo(px, py); } x.stroke(); } // (cracks, streaks)
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

export function templeMaterials() {
    if (!_mat) {
        _mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, map: blockTexture() });
        _glowMat = new THREE.MeshBasicMaterial({ color: 0x6fe8ff, vertexColors: true, transparent: true, opacity: 0.95 });
    }
    return { stone: _mat, glow: _glowMat };
}

/** A temple's model: a group (its own place and turn) with the shared stone and glow. */
export function seaTempleModel() {
    const { stone, glow } = templeGeometry(), M = templeMaterials();
    const g = new THREE.Group();
    const s = new THREE.Mesh(stone, M.stone), l = new THREE.Mesh(glow, M.glow);
    s.receiveShadow = true;
    s.userData.shared = l.userData.shared = true;
    g.add(s, l);
    return g;
}

/** The glow breathing (all temples at once: one shared material). */
export function templeGlow(t) {
    if (!_glowMat) return;
    const k = 0.75 + 0.25 * Math.sin(t * 1.3) + 0.08 * Math.sin(t * 4.7);
    _glowMat.color.setRGB(0.44 * k, 0.91 * k, 1.0 * k);
}

/**
 * The temple's solid parts as boxes in its own metres {x0, x1, y0, y1, z0, z1}: the foundation and the steps, the standing columns
 * (and the stumps), the cella's walls (the doorway open), the altar, the guardian's plinth. The beams overhead too (one can stand on them).
 */
export function templeSolids() {
    const T = TEMPLE, out = [], Y0 = T.TOP, C = T.CELLA;
    const b = (x0, x1, y0, y1, z0, z1) => out.push({ x0, x1, y0, y1, z0, z1 });
    b(-T.W / 2, T.W / 2, -4, 0, -T.L / 2, T.L / 2);
    for (let i = 0; i < T.STEPS; i++) { const w = T.W / 2 - 0.8 * i, l = T.L / 2 - 0.8 * i; b(-w, w, T.STEP * i, T.STEP * (i + 1), -l, l); }
    const cols = [];
    for (const z of T.COL_Z) for (const x of [-T.COL_X, T.COL_X]) cols.push([x, z]);
    for (const x of T.COL_FRONT.slice(1, -1)) for (const z of [T.COL_Z[0], T.COL_Z[T.COL_Z.length - 1]]) cols.push([x, z]);
    for (const [x, z] of cols) {
        const br = columnFate(x, z), r = T.COL_R;
        b(x - r, x + r, Y0, Y0 + 0.55 + (br ?? T.COL_H - 0.55), z - r, z + r);
    }
    const t = C.t / 2, dw = T.DOOR.w / 2;
    b(C.x0 - t, C.x1 + t, Y0, Y0 + C.h * 0.75, C.z0 - t, C.z0 + t); // back
    b(C.x0 - t, C.x0 + t, Y0, Y0 + C.h * 0.75, C.z0, C.z1); // left
    b(C.x1 - t, C.x1 + t, Y0, Y0 + C.h * 0.75, C.z0, C.z1); // right
    b(C.x0 - t, -dw, Y0, Y0 + C.h * 0.75, C.z1 - t, C.z1 + t); // the front, beside the door
    b(dw, C.x1 + t, Y0, Y0 + C.h * 0.75, C.z1 - t, C.z1 + t);
    b(-dw, dw, Y0 + T.DOOR.h, Y0 + T.DOOR.h + 0.9, C.z1 - t, C.z1 + t); // (the lintel)
    b(-2, 2, Y0, Y0 + 1.76, T.ALTAR_Z - 1.3, T.ALTAR_Z + 1.3); // the altar
    b(-1.65, 1.65, Y0, Y0 + 1.7, T.STATUE_Z - 1.35, T.STATUE_Z + 1.35); // the plinth
    return out;
}
