/**
 * ReefStructures.js — coral REEFS as whole living structures (the author 07.11: «в воде я видел кораллы по одному, но не коралловые рифы, которые я просил
 * сделать. Когда это не просто отдельный коралл, а целое живое образование. Целые структуры»; and: «на берегу очень много кораллов — кораллы там не живут»).
 *
 * A reef formation is ONE shape made once: a body of lumpy rock — every lump rough and faceted, its upper side wearing a living skin (encrusting coral in
 * magenta, orange, teal, violet, gold over the dull reef rock, darker in the crevices) — and, growing out of it in thickets, dozens of coral heads of every
 * kind: branching staghorn, tiered plate corals, brain domes, sea fans, tube sponges, soft corals; the plates and fans jut from the sides, the thickets crown
 * the tops. Seven formations (the SeaFloor draws each with one InstancedMesh, the colours baked into the vertices, the instance tint only a little):
 *   reefHead   a bommie: a great coral head with satellite lumps round its foot            ~ 13 m wide, 8 m tall
 *   reefSpur   a spur: a long ridge with buttresses (spur-and-groove) on both sides         ~ 26 m long, 7 m tall
 *   reefTower  a pinnacle: stacked tapering lumps with shelf corals up its sides            ~ 11 m wide, 13 m tall
 *   reefArch   a natural arch of coral rock — two pillars and a span                         ~ 16 m wide, 10 m tall
 *   reefAtoll  a ring reef: a ring of heads round a sandy lagoon                             ~ 19 m across, 5 m tall
 *   reefGlow   a magic head: glowing corals, cyan / violet / gold (only on the magic reefs)
 *   reefCliff  a reef wall: a long tall face with ledges, fans and plates along it
 * They stand only where the water is deep enough (≥ `REEF.MIN_DEPTH` under their whole foot, and their top at least 1.5 m under the surface) — never on
 * a beach, never in the shallows (corals do not live there).
 * Scenery only: no collision (like the rest of the sea's bottom), the same on every computer from the seed.
 */
import * as THREE from 'three';
import { MODEL_KIT as K } from '../game/AnimalModels.js';
import { mergeParts } from '../core/MergeGeometry.js';

export const REEF = {
    REGION: 40, // m: a reef region (SeaFloor.FLOOR.REEF_CELL — the same grid as the reef patches)
    MIN_DEPTH: 6, // m of water under a structure's foot at least (corals do not live in the shallows)
    TOP_GAP: 1.5, // m of water over its top at least
    MIN_SCALE: 0.6, // smaller than this (the water is too shallow for it) → not built
};
/** [name]: { H: height at scale 1 (m), FOOT: radius of the foot (m) the depth is checked and the loose plants kept away over }. */
export const REEF_KINDS = {
    // (measured on the built shapes — `reefGeo(k)` bounding boxes, the corals' thickets included; tests/unit/sea-floor.test.js keeps them honest)
    reefHead: { H: 8.6, FOOT: 7 }, reefSpur: { H: 7.3, FOOT: 13 }, reefTower: { H: 13.5, FOOT: 6 }, reefArch: { H: 9.9, FOOT: 8.5 },
    reefAtoll: { H: 4.9, FOOT: 10.5 }, reefGlow: { H: 6.8, FOOT: 8.6 }, reefCliff: { H: 9.5, FOOT: 13 },
};

function h01(a, b, c) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/**
 * The formations of a reef region (rx, rz) — [{kind, x, z, s (size), rot, tint, foot}] — or []. Pure; `depthOf(x, z)` → the water's depth there (m) or 0.
 * The reef regions are SeaFloor's (the same hash: `seed + 509`); a magic reef (`seed + 517`) gets glowing heads.
 */
export function reefStructures(rx, rz, seed, depthOf) {
    if (h01(rx, rz, seed + 509) >= 0.55) return [];
    const magic = h01(rx, rz, seed + 517) < 0.38;
    const R = REEF.REGION, out = [];
    const make = (kind, x, z, s, rot) => {
        const K0 = REEF_KINDS[kind];
        // the whole foot must be in deep water: the centre and eight points round it (and out along a long one)
        let dmin = Infinity;
        const ring = K0.FOOT * s * 0.85;
        for (let i = -1; i < 8; i++) {
            const a = rot + i * Math.PI / 4, rr = i < 0 ? 0 : ring;
            const d = depthOf(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
            if (d < dmin) dmin = d;
        }
        if (!(dmin >= REEF.MIN_DEPTH)) return false;
        const fit = (dmin - REEF.TOP_GAP) / K0.H; // (the tallest scale whose top is still under the surface)
        const sc = Math.min(s, fit);
        if (sc < REEF.MIN_SCALE) return false;
        out.push({ kind, x, z, s: sc, rot, tint: h01(Math.round(x), Math.round(z), seed + 531), foot: K0.FOOT * sc });
        return true;
    };
    const cx = (rx + 0.2 + 0.6 * h01(rx, rz, seed + 521)) * R, cz = (rz + 0.2 + 0.6 * h01(rx, rz, seed + 523)) * R;
    const k = h01(rx, rz, seed + 525);
    const main = magic && k < 0.6 ? 'reefGlow' : k < 0.26 ? 'reefHead' : k < 0.46 ? 'reefSpur' : k < 0.62 ? 'reefTower' : k < 0.74 ? 'reefArch' : k < 0.88 ? 'reefAtoll' : 'reefCliff';
    const s0 = 0.7 + 0.55 * h01(rx, rz, seed + 527);
    const okMain = make(main, cx, cz, s0, h01(rx, rz, seed + 529) * Math.PI * 2);
    // satellite heads round it (smaller bommies, a few of them): a reef is a cluster, not one lump
    const n = 1 + Math.floor(h01(rx, rz, seed + 533) * 3.4);
    for (let i = 0; i < n; i++) {
        const a = h01(rx, rz, seed + 540 + i) * Math.PI * 2, r = 13 + h01(rx, rz, seed + 550 + i) * 9;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (x < rx * R || x > (rx + 1) * R || z < rz * R || z > (rz + 1) * R) continue; // (inside its own region: no two regions pile up)
        make(magic && i % 2 ? 'reefGlow' : 'reefHead', x, z, 0.5 + 0.35 * h01(rx, rz, seed + 560 + i), a * 3.1);
    }
    return okMain || out.length ? out : [];
}

// ------------------------------------------------------------------ the shapes (made once, lazily)
const PAL = [[1, 0.5, 0.6], [1, 0.62, 0.3], [0.72, 0.5, 1], [1, 0.86, 0.4], [0.55, 0.85, 0.95], [0.95, 0.35, 0.45], [0.5, 0.9, 0.55]];
const GPAL = [[0.3, 1, 1], [0.8, 0.45, 1], [1, 0.85, 0.35], [0.4, 1, 0.6], [1, 0.45, 0.85]];
const ROCK = [[0.55, 0.38, 0.48], [0.6, 0.48, 0.3], [0.38, 0.46, 0.42], [0.5, 0.4, 0.36], [0.45, 0.4, 0.55]];
const SKIN = [[0.95, 0.35, 0.55], [0.98, 0.6, 0.25], [0.3, 0.8, 0.8], [0.75, 0.45, 0.95], [0.95, 0.85, 0.35], [0.45, 0.85, 0.45], [0.92, 0.45, 0.4]];
const GROCK = [[0.12, 0.16, 0.3], [0.2, 0.12, 0.3], [0.1, 0.22, 0.26]];
const GSKIN = [[0.3, 1, 1], [0.8, 0.45, 1], [1, 0.85, 0.35], [0.4, 1, 0.6], [1, 0.45, 0.85]];

const UP = new THREE.Vector3(0, 1, 0);
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (x, y, z) => Math.sin(x * 1.9 + Math.sin(y * 2.3 + z) * 1.3) * Math.sin(z * 2.1 + Math.sin(x * 1.7 + y * 0.6) * 1.2) * 0.5 + Math.sin(y * 3.1 + x * 1.3 + z * 0.9) * 0.5;

function colorBy(g, f) {
    const P = g.getAttribute('position'), a = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { const k = f(P.getX(i), P.getY(i), P.getZ(i), i); a[i * 3] = k[0]; a[i * 3 + 1] = k[1]; a[i * 3 + 2] = k[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---- the coral heads that grow on the rock (unit size, their feet at y = 0; each in several colourings)
function branchGeo(rng, pal) {
    const parts = [];
    const grow = (m, len, r, depth, t0) => {
        const g = new THREE.CylinderGeometry(r * 0.72, r, len, 5, 1, true);
        g.translate(0, len / 2, 0);
        const t1 = t0 + 0.3;
        colorBy(g, (x, y) => lerp3([pal[0] * 0.62, pal[1] * 0.62, pal[2] * 0.62], [Math.min(1.2, pal[0] * 1.25), Math.min(1.2, pal[1] * 1.25), Math.min(1.2, pal[2] * 1.25)], t0 + (t1 - t0) * (y / len)));
        parts.push({ geo: g, matrix: m.clone() });
        if (depth <= 0) return;
        const kids = depth > 1 ? 3 : 2;
        for (let i = 0; i < kids; i++) {
            const a = i / kids * Math.PI * 2 + rng() * 1.2, lean = 0.45 + rng() * 0.5;
            const c = new THREE.Matrix4().copy(m).multiply(new THREE.Matrix4().makeTranslation(0, len * (0.7 + rng() * 0.25), 0)).multiply(new THREE.Matrix4().makeRotationY(a)).multiply(new THREE.Matrix4().makeRotationZ(lean));
            grow(c, len * (0.72 + rng() * 0.1), r * 0.7, depth - 1, t1);
        }
    };
    grow(new THREE.Matrix4(), 0.38, 0.06, 3, 0);
    return mergeParts(parts);
}
function plateGeo(rng, pal) {
    const g = new THREE.CylinderGeometry(0.5, 0.36, 0.06, 12, 1);
    const P = g.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), z = P.getZ(i), a = Math.atan2(z, x), rr = Math.hypot(x, z);
        const rag = 1 + 0.1 * Math.sin(a * 7 + rng() * 0.2) + 0.06 * Math.sin(a * 17);
        P.setXYZ(i, x * rag, P.getY(i) + 0.22 * rr * rr + 0.03 * Math.sin(a * 5) * rr, z * rag); // (cupped, a ruffled rim)
    }
    g.translate(0, 0.22, 0);
    g.computeVertexNormals();
    colorBy(g, (x, y, z) => { const a = Math.atan2(z, x), rr = Math.hypot(x, z) / 0.5; const ray = Math.abs(Math.sin(a * 22)) > 0.82 ? 0.84 : 1; const k = lerp3([pal[0] * 0.65, pal[1] * 0.65, pal[2] * 0.65], [pal[0] * 1.1, pal[1] * 1.1, pal[2] * 1.1], rr); return [k[0] * ray, k[1] * ray, k[2] * ray]; });
    const stalk = colorBy(new THREE.CylinderGeometry(0.07, 0.11, 0.26, 6, 1, true).translate(0, 0.12, 0), () => [pal[0] * 0.55, pal[1] * 0.55, pal[2] * 0.55]);
    return mergeParts([{ geo: stalk }, { geo: g }]);
}
function brainGeo(rng, pal) {
    const g = new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, 0.6, 1);
    const off = rng() * 9;
    colorBy(g, (x, y, z) => { const gr = Math.sin(x * 30 + Math.sin(z * 19 + off) * 2.2) * Math.sin(z * 27 + Math.sin(x * 15) * 2); const k = gr > 0.35 ? 0.62 : 1; return [pal[0] * 0.95 * k, pal[1] * 0.95 * k, pal[2] * 0.95 * k]; });
    g.computeVertexNormals();
    return g;
}
function fanGeo(rng, pal) {
    // a sea fan: ribs spreading in one plane (XY, facing +Z) joined by two thin arcs — a lattice
    const parts = [], N = 9, base = 0.12;
    const tint = (t) => lerp3([pal[0] * 0.6, pal[1] * 0.6, pal[2] * 0.6], [Math.min(1.2, pal[0] * 1.2), Math.min(1.2, pal[1] * 1.2), Math.min(1.2, pal[2] * 1.2)], t);
    const rib = (a, len) => { const g = new THREE.CylinderGeometry(0.008, 0.018, len, 4, 1, true).translate(0, len / 2, 0); colorBy(g, (x, y) => tint(0.3 + 0.7 * y / len)); parts.push({ geo: g, pos: [0, base, 0], rot: [0, 0, a] }); };
    for (let i = 0; i < N; i++) { const a = -0.95 + 1.9 * i / (N - 1); rib(a, 0.85 + rng() * 0.15 - Math.abs(a) * 0.18); }
    for (const rr of [0.38, 0.66]) {
        for (let i = 0; i < N - 1; i++) {
            const a0 = -0.95 + 1.9 * i / (N - 1), a1 = -0.95 + 1.9 * (i + 1) / (N - 1);
            const p0 = [-Math.sin(a0) * rr, base + Math.cos(a0) * rr], p1 = [-Math.sin(a1) * rr, base + Math.cos(a1) * rr];
            const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy);
            const g = new THREE.CylinderGeometry(0.006, 0.006, l, 3, 1, true);
            colorBy(g, () => tint(rr + 0.2));
            parts.push({ geo: g, pos: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0], rot: [0, 0, Math.atan2(-dx, dy)] });
        }
    }
    return mergeParts(parts);
}
function tubeGeo(rng, pal) {
    const parts = [];
    for (let i = 0; i < 3; i++) {
        const h = 0.4 + rng() * 0.4, r = 0.08 + rng() * 0.03;
        const g = new THREE.CylinderGeometry(r * 1.3, r, h, 6, 1, true).translate(0, h / 2, 0);
        colorBy(g, (x, y) => { const k = 0.75 + 0.45 * y / h; return [pal[0] * k, pal[1] * k, pal[2] * k]; });
        const inner = colorBy(new THREE.CircleGeometry(r * 1.15, 6).rotateX(-Math.PI / 2).translate(0, h - 0.04, 0), () => [0.18, 0.12, 0.18]);
        const a = i / 3 * Math.PI * 2, d = i ? 0.13 : 0;
        parts.push({ geo: g, pos: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15] });
        parts.push({ geo: inner, pos: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15] });
    }
    return mergeParts(parts);
}
function softGeo(rng, pal) {
    const parts = [];
    for (let b = 0; b < 3; b++) {
        const a = b / 3 * Math.PI * 2 + rng(), lean = 0.3 + rng() * 0.4, len = 0.35 + rng() * 0.25;
        parts.push({ geo: colorBy(new THREE.CylinderGeometry(0.035, 0.055, len, 5, 1, true).translate(0, len / 2, 0), () => [0.92, 0.88, 0.92]), rot: [Math.cos(a) * lean, 0, Math.sin(a) * lean] });
        const tip = [Math.cos(a) * Math.sin(lean) * len, Math.cos(lean) * len, Math.sin(a) * Math.sin(lean) * len];
        for (let k = 0; k < 4; k++) {
            const bud = colorBy(new THREE.IcosahedronGeometry(0.055 + rng() * 0.03, 0), () => [pal[0] * 1.1, pal[1] * 1.1, pal[2] * 1.1]);
            parts.push({ geo: bud, pos: [tip[0] + (rng() - 0.5) * 0.14, tip[1] + (rng() - 0.3) * 0.1, tip[2] + (rng() - 0.5) * 0.14] });
        }
    }
    return mergeParts(parts);
}

let _lib = null;
/** The library of coral heads: { branch: [geo…], plate, brain, fan, tube, soft } in several colourings, normal and glowing. Made once. */
function lib() {
    if (_lib) return _lib;
    const make = (fn, seed, pals) => pals.map((p, i) => { const g = fn(K.rng(seed + i * 13), p); g.userData.shared = true; return g; });
    const mk = (pals) => ({
        branch: make(branchGeo, 100, pals), plate: make(plateGeo, 200, pals), brain: make(brainGeo, 300, pals), fan: make(fanGeo, 400, pals),
        tube: make(tubeGeo, 500, pals), soft: make(softGeo, 600, pals),
    });
    _lib = { normal: mk(PAL), glow: mk(GPAL) };
    return _lib;
}

// ---- the rock
/** A lump of reef rock: a displaced faceted sphere at (cx, cy, cz) of radii (rx, ry, rz), wearing its living skin. */
function lump(cx, cy, cz, rx, ry, rz, detail, rng, glow) {
    const g = new THREE.IcosahedronGeometry(1, detail); // (non-indexed: flat facets — rough rock)
    const P = g.getAttribute('position'), sd = rng() * 50;
    for (let i = 0; i < P.count; i++) {
        let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const d = 1 + 0.17 * bump(x * 2.2 + sd, y * 2.2, z * 2.2 + sd) + 0.05 * bump(x * 7 + sd, y * 7, z * 7);
        P.setXYZ(i, cx + x * d * rx, cy + y * d * ry, cz + z * d * rz);
    }
    g.computeVertexNormals();
    const N = g.getAttribute('normal'), rockPal = glow ? GROCK : ROCK, skinPal = glow ? GSKIN : SKIN;
    const rock = rockPal[Math.floor(rng() * rockPal.length)], skin = skinPal[Math.floor(rng() * skinPal.length)], skin2 = skinPal[Math.floor(rng() * skinPal.length)];
    const col = new Float32Array(P.count * 3), tris = [];
    for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ny = N.getY(i);
        const h = sm(-1, 1, (y - cy) / ry), nz = bump(x * 1.1 + sd, y * 0.9, z * 1.1), crev = bump(x * 4 + sd, y * 4, z * 4) < -0.45 ? 0.62 : 1;
        const patch = sm(-0.2, 0.3, nz);
        const sk = sm(-0.15, 0.5, ny) * (0.5 + 0.4 * patch); // (the living skin on the upper side)
        const c = lerp3(lerp3(rock, skin, sk), skin2, patch * sk * 0.5);
        const shade = (0.55 + 0.5 * h) * crev * (glow ? 1.05 : 1);
        col[i * 3] = Math.min(1.25, c[0] * shade); col[i * 3 + 1] = Math.min(1.25, c[1] * shade); col[i * 3 + 2] = Math.min(1.25, c[2] * shade);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    for (let i = 0; i + 2 < P.count; i += 3) { // (the facets, for planting the corals)
        const ax = P.getX(i), ay = P.getY(i), az = P.getZ(i), bx = P.getX(i + 1), by = P.getY(i + 1), bz = P.getZ(i + 1), ccx = P.getX(i + 2), ccy = P.getY(i + 2), ccz = P.getZ(i + 2);
        tris.push({ p: [(ax + bx + ccx) / 3, (ay + by + ccy) / 3, (az + bz + ccz) / 3], n: [N.getX(i), N.getY(i), N.getZ(i)] });
    }
    return { geo: g, tris, r: (rx + ry + rz) / 3, cy, ry, cx, cz };
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
/** The corals grown on the lumps: parts [{geo, matrix}]. Tops get thickets and brain domes, flanks plates and fans, the undersides tubes and soft corals. */
function planted(lumps, rng, glow, density) {
    const L = lib()[glow ? 'glow' : 'normal'], parts = [];
    for (const lp of lumps) {
        const n = Math.max(2, Math.round(lp.r * lp.r * density));
        const unit = 0.9 + lp.r * 0.28;
        for (let i = 0; i < n; i++) {
            const t = lp.tris[Math.floor(rng() * lp.tris.length)];
            _n.set(t.n[0], t.n[1], t.n[2]);
            if (_n.y < -0.45) { if (rng() < 0.8) continue; } // (the underside: hardly anything grows)
            const top = _n.y > 0.55, side = _n.y > -0.2 && !top;
            const r = rng();
            let kind, size;
            if (top) { kind = r < 0.42 ? 'branch' : r < 0.6 ? 'plate' : r < 0.78 ? 'brain' : r < 0.9 ? 'soft' : 'tube'; }
            else if (side) { kind = r < 0.32 ? 'plate' : r < 0.58 ? 'fan' : r < 0.74 ? 'soft' : r < 0.88 ? 'tube' : 'branch'; }
            else kind = r < 0.5 ? 'tube' : 'soft';
            size = unit * (kind === 'branch' ? 1.7 : kind === 'plate' ? 1.7 : kind === 'fan' ? 1.6 : kind === 'brain' ? 1.2 : 1.1) * (0.6 + rng() * 0.8);
            const geo = L[kind][Math.floor(rng() * L[kind].length)];
            // orientation: up = the surface's normal mixed with the world's up (thickets lean outward), a plate lies nearly flat, a fan faces outward
            _v.set(0, 1, 0).multiplyScalar(kind === 'plate' ? 0.8 : 0.45).addScaledVector(_n, kind === 'plate' ? 0.2 : 0.55).normalize();
            _q.setFromUnitVectors(UP, _v);
            const yaw = kind === 'fan' ? Math.atan2(_n.x, _n.z) : rng() * Math.PI * 2;
            _q2.setFromAxisAngle(UP, yaw);
            _q.multiply(_q2);
            _s.set(size, size * (kind === 'fan' ? 1 : 0.85 + rng() * 0.4), size);
            _m.compose(_v.set(t.p[0], t.p[1] - 0.12 * size, t.p[2]), _q, _s);
            parts.push({ geo, matrix: _m.clone() });
        }
    }
    return parts;
}

// ---- the seven formations (lumps laid out, then dressed)
const A = (x) => x; // (readability)
function layout(kind, rng, glow) {
    const lumps = [];
    const add = (x, y, z, rx, ry, rz, det = 2) => lumps.push(lump(x, y, z, rx, ry, rz, det, rng, glow));
    switch (kind) {
        case 'reefHead': case 'reefGlow':
            add(0, 1.9, 0, 4.4, 3.1, 4.0, 3);
            for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + rng(), r = 3.6 + rng() * 1.8; add(Math.cos(a) * r, 0.6 + rng() * 0.7, Math.sin(a) * r, 1.6 + rng() * 1.2, 1.0 + rng() * 0.9, 1.6 + rng() * 1.2, 2); }
            add(0.8, 4.2, -0.5, 2.2, 1.6, 2.0, 2);
            break;
        case 'reefSpur': {
            for (let i = 0; i < 9; i++) { const x = -10.5 + i * 2.6, h = 1.4 + 1.2 * Math.sin(i * 0.9 + rng()) + rng() * 0.7; add(x, 0.9 + h * 0.45, Math.sin(i * 0.7) * 1.1, 2.1 + rng() * 0.8, 1.3 + h * 0.5, 1.9 + rng() * 0.7, i % 3 ? 2 : 3); }
            for (let i = 0; i < 6; i++) { const x = -8 + i * 3.3; for (const sgn of [-1, 1]) add(x + rng(), 0.6, sgn * (3.4 + rng() * 1.4), 1.2 + rng() * 0.7, 0.9 + rng() * 0.5, 2.0 + rng() * 1.0, 2); }
            break;
        }
        case 'reefTower': {
            let y = 1.1, r = 2.6, ox = 0, oz = 0;
            for (let i = 0; i < 5; i++) { add(ox, y, oz, r, 1.4 + r * 0.35, r * 0.95, i < 2 ? 3 : 2); y += 1.6 + r * 0.5; r *= 0.82; ox += (rng() - 0.5) * 0.8; oz += (rng() - 0.5) * 0.8; }
            for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + rng(); add(Math.cos(a) * 3, 0.5, Math.sin(a) * 3, 1.5 + rng(), 0.9, 1.5 + rng(), 2); }
            break;
        }
        case 'reefArch': {
            for (const sgn of [-1, 1]) { for (let i = 0; i < 3; i++) add(sgn * 4.6 + (rng() - 0.5) * 0.5, 0.9 + i * 1.7, (rng() - 0.5) * 0.5, 2.1 - i * 0.2, 1.4, 2.1 - i * 0.2, i ? 2 : 3); add(sgn * 5.8, 0.5, 2.4, 1.8, 1.0, 1.8, 2); }
            for (let i = 0; i <= 6; i++) { const a = Math.PI * (i / 6), x = -Math.cos(a) * 4.6, y = 5.0 + Math.sin(a) * 2.0; add(x, y, (rng() - 0.5) * 0.4, 1.7 - Math.abs(i - 3) * 0.08, 1.3, 1.9, 2); }
            break;
        }
        case 'reefAtoll': {
            const N = 9;
            for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, r = 6.2 + rng() * 0.8; add(Math.cos(a) * r, 0.9 + rng() * 0.7, Math.sin(a) * r, 2.2 + rng() * 0.8, 1.2 + rng() * 0.7, 2.2 + rng() * 0.8, 2); }
            for (let i = 0; i < 4; i++) { const a = rng() * Math.PI * 2; add(Math.cos(a) * 2, 0.35, Math.sin(a) * 2, 1.0, 0.7, 1.0, 2); } // (small heads in the lagoon)
            break;
        }
        case 'reefCliff':
            for (let i = 0; i < 8; i++) { const x = -9 + i * 2.6; add(x, 2.8 + Math.sin(i * 1.3) * 0.8, 0, 2.0, 3.3 + rng() * 0.8, 2.2, i % 2 ? 2 : 3); }
            for (let i = 0; i < 5; i++) add(-7 + i * 3.4 + rng(), 5.8 + rng(), 0.4, 1.6, 1.2, 1.8, 2);
            for (let i = 0; i < 6; i++) add(-8 + i * 3.1, 0.7, 2.6 + rng(), 1.5, 0.9, 1.9, 2);
            break;
        default: throw new Error('no such formation: ' + kind);
    }
    return lumps;
}

const _geo = {};
/** The shape of a formation (made once; `userData.shared`). */
export function reefGeo(kind) {
    if (_geo[kind]) return _geo[kind];
    const seeds = { reefHead: 11, reefSpur: 23, reefTower: 37, reefArch: 41, reefAtoll: 53, reefGlow: 67, reefCliff: 79 };
    const rng = K.rng(seeds[kind] || 5), glow = kind === 'reefGlow';
    const lumps = layout(kind, rng, glow);
    const dens = kind === 'reefSpur' || kind === 'reefCliff' ? 1.15 : 1.35;
    const parts = [...lumps.map((l) => ({ geo: l.geo })), ...planted(lumps, rng, glow, dens)];
    const g = mergeParts(parts);
    g.userData.shared = true;
    for (const l of lumps) l.geo.dispose();
    _geo[kind] = g;
    return g;
}
export const reefTris = (kind) => { const g = reefGeo(kind); return (g.index ? g.index.count : g.getAttribute('position').count) / 3; };

/** The instance tint of a formation: only a little (the colours are baked in). */
export function reefTint(kind, t) { return kind === 'reefGlow' ? [0.9 + 0.3 * t, 0.95 + 0.2 * t, 1] : [0.9 + 0.2 * t, 0.92 + 0.16 * t, 0.9 + 0.2 * t]; }

export const REEF_ORDER = Object.keys(REEF_KINDS);
void A;
