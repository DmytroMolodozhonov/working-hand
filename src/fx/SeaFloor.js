/**
 * SeaFloor.js — the life of the sea's bottom round the player (the sea update, the author 05.11: «подводный мир океана: растения,
 * светящиеся, рыбы»): what grows there and the fish schools. Scenery only — no network (the same plants on every computer from the
 * world's seed; the fish each computer's own), nothing harms, nothing is saved.
 *
 * Plants (only on the sea's bottom, never a lake: TerrainData.isSeaColumn; ≥ 2 m of water), by the depth and a hash of the place:
 *   kelp      a holdfast and three fronds of giant kelp: twisting stipes, wavy blades with gas bladders at their bases, never out of the
 *             water (≤ depth − 3, ≤ 12 m — the author 05.11: «тонкие высокие водоросли выходят выше моря… переделать интереснее»);
 *   seagrass  tufts of thin green blades bending in the current (the shallows);
 *   corals    staghorn (branching, pink / orange / violet tips), sea fans (a lattice in a plane, red / purple), brain corals (domes
 *             with winding grooves) — each one tinted a little its own way;
 *   glow      anemones (a ring of tentacles glowing cyan / violet / green) and sea lilies (a bell of light on a stalk): they light
 *             the dark water, brighter at night, their light breathing.
 *   (since 05.11, the author: «коралловые рифы… максимально подробное интересное дно») reef patches thick with corals of every kind —
 *   table corals (a broad plate on a stalk), tube sponges, soft corals (clusters of polyps) —, seagrass meadows on the sand, sea urchins
 *   bristling with spines and starfish lying on the bottom.
 * Fish: a hundred kinds in schools, pairs and loners (ReefFish.js); turtles, crabs, lobsters, shrimps (SeaCritters.js).
 *
 * Cheap: one draw per kind (InstancedMesh; ~8 draws in all), the sway and the tails moved by the video card, the plants placed a few
 * cells a frame (≤ BUDGET ms) when the player has moved CELL·1.5 m, round him only (R m); shapes made once; nothing grows with time.
 */
import * as THREE from 'three';
import { MODEL_KIT as K } from '../game/AnimalModels.js';
import { mergeParts } from '../core/MergeGeometry.js';
import { waterAt } from '../game/CreatureSwim.js';
import { ReefFish } from './ReefFish.js';
import { SeaCritters } from './SeaCritters.js';
import { reefStructures, reefGeo, reefTint, REEF_KINDS } from './ReefStructures.js';

export const KELP_MAX = 12; // m: the tallest kelp (and never higher than the water's depth − 3)
export const FLOOR = { R: 76, CELL: 8, PER_CELL: 12, REEF_CELL: 40, BUDGET: 1.2, CAP: { kelp: 600, grass: 2600, staghorn: 1000, fan: 700, brain: 650, anemone: 520, lily: 260, table: 480, tube: 520, soft: 650, urchin: 320, star: 220, glowcoral: 800, glowfan: 420, glowbrain: 340, crystal: 420, reefHead: 10, reefSpur: 5, reefTower: 5, reefArch: 3, reefAtoll: 4, reefGlow: 6, reefCliff: 3 } };
/** The kinds that shine (their own light: brighter at night and in the dark depths). */
/** m of water from which corals live (the shallows near the shore have none). */
export const CORAL_DEPTH = 6;
export const GLOW_KINDS = new Set(['anemone', 'lily', 'glowcoral', 'glowfan', 'glowbrain', 'crystal', 'reefGlow']);

function h01(a, b, c) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/**
 * The plants of a cell (cx, cz): [{kind, x, z, s (size), rot, tint}] — before the water is checked (depthOf decides). Pure.
 * `depthOf(x, z)` → the water's depth there (m) or 0 (no sea).
 */
export function cellPlants(cx, cz, seed, depthOf, avoid = null) {
    const out = [];
    const C = FLOOR.CELL;
    // the reefs: patches of the bottom (a few cells across) thick with corals of every kind, between them sand with seagrass meadows,
    // stones with urchins and starfish (the author 05.11: «коралловые рифы… интересная трава… максимально подробное интересное дно»)
    const R = FLOOR.REEF_CELL / C;
    const reef = h01(Math.floor(cx / R), Math.floor(cz / R), seed + 509) < 0.55;
    // (some reefs are magic: their corals glow — cyan, violet, gold — lighting the deep water; the author 05.11: «магические, светящиеся»)
    const magic = reef && h01(Math.floor(cx / R), Math.floor(cz / R), seed + 517) < 0.38;
    const meadow = !reef && h01(Math.floor(cx / 3), Math.floor(cz / 3), seed + 511) < 0.5;
    const n = Math.floor(h01(cx, cz, seed + 501) * (FLOOR.PER_CELL + 1) * (reef ? 2.2 : meadow ? 1.4 : 0.7));
    for (let i = 0; i < n; i++) {
        const r = (q) => h01(cx * 13 + i * 7 + q, cz * 17 + q, seed + 502);
        const x = cx * C + r(1) * C, z = cz * C + r(2) * C;
        const d = depthOf(x, z);
        if (d < 2) continue;
        if (avoid && avoid(x, z)) continue; // (inside a reef formation's foot: the formation grows there — ReefStructures)
        const k = r(3);
        let kind;
        // (kelp only where the water is deep enough for it to stand under the surface)
        // (corals live only where the water is deep — the author 07.11: «на берегу очень много кораллов… кораллы там не живут»: the shallows
        //  (< CORAL_DEPTH) hold seagrass, urchins and starfish only; outside the reefs no single corals are scattered at all — the corals grow in the reefs,
        //  on and round the reef formations, ReefStructures.js)
        if (magic && d >= CORAL_DEPTH + 1) kind = k < 0.3 ? 'glowcoral' : k < 0.45 ? 'glowfan' : k < 0.57 ? 'glowbrain' : k < 0.72 ? 'crystal' : k < 0.82 ? 'anemone' : k < 0.88 ? 'lily' : k < 0.94 ? 'staghorn' : 'soft';
        else if (reef && d > 20) kind = k < 0.2 ? 'fan' : k < 0.36 ? 'soft' : k < 0.48 ? 'staghorn' : k < 0.58 ? 'tube' : k < 0.68 ? 'table' : k < 0.76 ? 'brain' : k < 0.84 ? 'glowcoral' : k < 0.9 ? 'glowfan' : k < 0.95 ? 'anemone' : 'urchin';
        else if (reef && d >= CORAL_DEPTH) kind = k < 0.2 ? 'staghorn' : k < 0.32 ? 'brain' : k < 0.42 ? 'table' : k < 0.53 ? 'soft' : k < 0.63 ? 'tube' : k < 0.72 ? 'fan' : k < 0.82 ? 'anemone' : k < 0.9 ? 'urchin' : k < 0.95 ? 'star' : 'grass';
        else if (d < CORAL_DEPTH) kind = k < (meadow ? 0.8 : 0.5) ? 'grass' : k < 0.86 ? 'star' : 'urchin';
        else if (meadow) kind = k < 0.65 ? 'grass' : k < 0.8 ? 'kelp' : k < 0.9 ? 'star' : 'lily';
        else kind = k < 0.45 ? 'kelp' : k < 0.65 ? 'grass' : k < 0.8 ? 'urchin' : k < 0.9 ? 'star' : 'lily';
        // (a reef's corals are big — thickets and plates of several metres, the author: «огромными»)
        const giant = reef && kind !== 'kelp' && kind !== 'grass' && kind !== 'urchin' && kind !== 'star' && kind !== 'anemone' ? 1.6 + r(7) * 2.2 : 1;
        const s0 = kind === 'kelp' ? Math.min(d - 3, Math.max(2, Math.min(d - 3, KELP_MAX) - r(4) * 3)) : kind === 'grass' ? 0.6 + r(4) * 0.9 : kind === 'lily' ? 1 + r(4) * 1.2 : kind === 'table' ? 0.8 + r(4) * 1.4 : kind === 'urchin' || kind === 'star' ? 0.8 + r(4) * 0.6 : 0.7 + r(4) * 1.1;
        const s = s0 * giant;
        if (kind === 'kelp' && s < 2) continue;
        out.push({ kind, x, z, s, rot: r(5) * Math.PI * 2, tint: r(6) });
    }
    return out;
}

// ------------------------------------------------------------------ the shapes (made once)
const _geo = {};
const ribbon = (h, w, segs, twist, color) => {
    const g = new THREE.PlaneGeometry(w, h, 1, segs);
    g.translate(0, h / 2, 0);
    const P = g.getAttribute('position'), col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
        const y = P.getY(i) / h, x = P.getX(i);
        const a = y * twist, c = Math.cos(a), s = Math.sin(a);
        P.setXYZ(i, x * c, P.getY(i), x * s + Math.sin(y * 9) * 0.04);
        const k = color(y, x / w);
        col[i * 3] = k[0]; col[i * 3 + 1] = k[1]; col[i * 3 + 2] = k[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
};
/** A kelp blade: a long leaf, wide in its middle, its edges rippled (the ruffles of real kelp), darker at its root, golden at its tip. */
function kelpBlade(len, w) {
    const g = new THREE.PlaneGeometry(w, len, 4, 10);
    g.translate(0, len / 2, 0);
    const P = g.getAttribute('position'), col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
        const v = P.getY(i) / len, u = P.getX(i) / (w / 2); // (0 root … 1 tip; −1 … 1 across)
        const wid = Math.max(0, Math.sin(Math.min(1, Math.max(0, v) * 1.15) * Math.PI)) ** 0.7 * (1 - 0.25 * v); // (narrow at its root and its tip; the root row's v is −1e-17 after translate — a negative sine ** 0.7 was NaN: «Computed radius is NaN» at every start)
        const edge = Math.abs(u);
        const ruffle = Math.sin(v * 38 + (u > 0 ? 0 : 1.3)) * 0.22 * edge * edge * w; // (the rippled edges)
        P.setXYZ(i, u * wid * w / 2, P.getY(i), ruffle + Math.sin(v * 3.1) * 0.12 * w + edge * 0.08 * w);
        const k = [0.28 + 0.34 * v, 0.24 + 0.24 * v, 0.07 + 0.05 * v];
        const vein = edge < 0.12 ? 0.82 : 1; // (the darker midrib)
        const lit = 1 + 0.2 * edge; // (thin edges: the light through them)
        col[i * 3] = k[0] * vein * lit; col[i * 3 + 1] = k[1] * vein * lit; col[i * 3 + 2] = k[2] * vein;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
}
const tinted = (geo, c) => { const P = geo.getAttribute('position'), col = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; } geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo; };
/** Giant kelp, height 1 (scaled to the water): a holdfast of tangled roots, three fronds of different height leaning apart, each a
 *  twisting stipe with wavy blades on alternating sides, a gas bladder (a little float) at every blade's base, a crown of blades at its top. */
function kelpGeo() {
    const parts = [], rng = K.rng(913);
    // the holdfast: knotted roots spreading on the sand
    for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + rng() * 0.4;
        parts.push({ geo: tinted(new THREE.CylinderGeometry(0.004, 0.009, 0.06, 5).translate(0, 0.03, 0), [0.22, 0.16, 0.06]), pos: [Math.cos(a) * 0.012, 0, Math.sin(a) * 0.012], rot: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2] });
    }
    parts.push({ geo: tinted(new THREE.SphereGeometry(0.018, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), [0.24, 0.18, 0.07]), scale: [1, 0.7, 1] });
    const bladder = new THREE.SphereGeometry(0.007, 7, 5);
    for (let f = 0; f < 3; f++) {
        const H = [1, 0.84, 0.68][f], lean = 0.06 + f * 0.04, az = f * 2.1 + 0.3;
        const lx = Math.cos(az) * lean, lz = Math.sin(az) * lean; // (where the frond's top leans)
        // the stipe: a thin round stalk, slightly twisting, olive-brown
        const st = new THREE.CylinderGeometry(0.0035, 0.006, H, 5, 16).translate(0, H / 2, 0);
        const P = st.getAttribute('position');
        for (let i = 0; i < P.count; i++) { const y = P.getY(i) / H; P.setX(i, P.getX(i) + lx * y * y + Math.sin(y * 7 + f) * 0.01); P.setZ(i, P.getZ(i) + lz * y * y + Math.cos(y * 6 + f) * 0.01); }
        parts.push({ geo: tinted(st, [0.3, 0.24, 0.08]) });
        // the blades with their floats, alternating up the stipe
        const n = 15 - f * 3;
        for (let i = 0; i < n; i++) {
            const y = H * (0.1 + 0.82 * i / n), yy = y / H, side = i % 2 ? 1 : -1;
            const x = lx * yy * yy + Math.sin(yy * 7 + f) * 0.01, z = lz * yy * yy + Math.cos(yy * 6 + f) * 0.01;
            const ang = az + side * 1.4 + rng() * 0.5;
            const len = 0.09 + rng() * 0.05 + 0.03 * yy;
            parts.push({ geo: bladder, pos: [x + Math.cos(ang) * 0.008, y, z + Math.sin(ang) * 0.008], scale: [1, 1.7, 1], color: [0.55, 0.45, 0.14] });
            parts.push({ geo: kelpBlade(len, 0.034 + rng() * 0.01), pos: [x + Math.cos(ang) * 0.01, y + 0.006, z + Math.sin(ang) * 0.01], rot: [0, -ang + Math.PI / 2, side * (0.55 + rng() * 0.35)] });
        }
        // the crown: young blades fanning at the top
        for (let i = 0; i < 4; i++) parts.push({ geo: kelpBlade(0.07 + i * 0.012, 0.028), pos: [lx, H, lz], rot: [0, az + i * 1.6, 0.35 + i * 0.12] });
    }
    for (const p of parts) if (p.color) { p.geo = tinted(p.geo.clone(), p.color); delete p.color; }
    return mergeParts(parts);
}
function grassGeo() {
    const parts = [];
    for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2, r = 0.05 + (i % 3) * 0.03, h = 0.7 + (i * 37 % 10) / 30;
        parts.push({ geo: ribbon(h, 0.035, 8, 0.6, (y) => [0.16 + 0.22 * y, 0.42 + 0.3 * y, 0.14 + 0.08 * y]), pos: [Math.cos(a) * r, 0, Math.sin(a) * r], rot: [Math.cos(a) * 0.25, a, Math.sin(a) * 0.25] });
    }
    return mergeParts(parts);
}
function branchGeo(rng, depth, len, rad, out, m, tipCol) {
    const geo = new THREE.CylinderGeometry(rad * 0.65, rad, len, 6, 3);
    geo.translate(0, len / 2, 0);
    const P = geo.getAttribute('position'), col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
        const t = (4 - depth + P.getY(i) / len) / 4;
        const c = K.mix([0.92, 0.86, 0.78], tipCol, Math.min(1, t * t * 1.3));
        const knob = 0.94 + 0.06 * Math.sin(P.getY(i) * 90 + P.getX(i) * 40);
        col[i * 3] = c[0] * knob; col[i * 3 + 1] = c[1] * knob; col[i * 3 + 2] = c[2] * knob;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.push({ geo, matrix: m.clone() });
    if (depth <= 0) return;
    const n = 2 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
        const c = new THREE.Matrix4().copy(m).multiply(new THREE.Matrix4().makeTranslation(0, len, 0))
            .multiply(new THREE.Matrix4().makeRotationY(rng() * Math.PI * 2)).multiply(new THREE.Matrix4().makeRotationZ(0.35 + rng() * 0.45));
        branchGeo(rng, depth - 1, len * (0.7 + rng() * 0.15), rad * 0.72, out, c, tipCol);
    }
}
function staghornGeo() {
    const out = [], rng = K.rng(31);
    for (let i = 0; i < 4; i++) branchGeo(rng, 3, 0.32, 0.05, out, new THREE.Matrix4().makeRotationY(i * 1.6).multiply(new THREE.Matrix4().makeRotationZ(0.25 + i * 0.08)), [1, 1, 1]);
    return mergeParts(out);
}
function fanGeo() {
    // a sea fan: a lattice of thin branches in one plane, a short trunk
    const out = [], rng = K.rng(77);
    const flat = (depth, len, rad, m) => {
        const geo = new THREE.CylinderGeometry(rad * 0.7, rad, len, 4, 1);
        geo.translate(0, len / 2, 0);
        const P = geo.getAttribute('position'), col = new Float32Array(P.count * 3);
        for (let i = 0; i < P.count; i++) { const v = 0.85 + 0.15 * (depth / 5); col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v; }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        out.push({ geo, matrix: m.clone() });
        if (depth <= 0) return;
        for (const s of [-1, 1]) flat(depth - 1, len * 0.78, rad * 0.75, new THREE.Matrix4().copy(m).multiply(new THREE.Matrix4().makeTranslation(0, len, 0)).multiply(new THREE.Matrix4().makeRotationZ(s * (0.3 + rng() * 0.25))));
    };
    flat(5, 0.28, 0.035, new THREE.Matrix4());
    return mergeParts(out);
}
function brainGeo() {
    const g = new THREE.SphereGeometry(0.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, 0.62, 1);
    const P = g.getAttribute('position'), col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const groove = Math.sin(x * 34 + Math.sin(z * 21) * 2.2) * Math.sin(z * 30 + Math.sin(x * 17) * 2);
        const k = groove > 0.35 ? 0.62 : 1;
        const n = 1 + 0.05 * groove;
        P.setXYZ(i, x * n, y * n, z * n);
        col[i * 3] = 0.82 * k; col[i * 3 + 1] = 0.8 * k; col[i * 3 + 2] = 0.62 * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
}
function anemoneGeo() {
    const parts = [];
    const stem = new THREE.CylinderGeometry(0.16, 0.2, 0.3, 12, 2);
    stem.translate(0, 0.15, 0);
    const colOf = (g, c) => { const n = g.getAttribute('position').count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const y = g.getAttribute('position').getY(i); const k = c(y); a[i * 3] = k[0]; a[i * 3 + 1] = k[1]; a[i * 3 + 2] = k[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    parts.push({ geo: colOf(stem, () => [0.35, 0.35, 0.4]) });
    for (let i = 0; i < 26; i++) {
        const a = i / 26 * Math.PI * 2, ring = i % 2 ? 0.13 : 0.09;
        const t = new THREE.CylinderGeometry(0.004, 0.018, 0.42 - (i % 2) * 0.1, 5, 4);
        t.translate(0, 0.21, 0);
        parts.push({ geo: colOf(t, (y) => [0.5 + y * 1.2, 0.5 + y * 1.2, 0.5 + y * 1.2]), pos: [Math.cos(a) * ring, 0.3, Math.sin(a) * ring], rot: [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55] });
    }
    return mergeParts(parts);
}
function lilyGeo() {
    const parts = [];
    const stalk = new THREE.CylinderGeometry(0.012, 0.022, 1, 5, 6);
    stalk.translate(0, 0.5, 0);
    const paint = (g, c) => { const P = g.getAttribute('position'), a = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const k = c(P.getY(i)); a.set(k, i * 3); } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    parts.push({ geo: paint(stalk, (y) => [0.25 + 0.3 * y, 0.35 + 0.35 * y, 0.45 + 0.4 * y]) });
    const bell = new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
    bell.scale(1, 1.3, 1);
    parts.push({ geo: paint(bell, () => [1, 1, 1]), pos: [0, 1.0, 0], rot: [Math.PI, 0, 0] });
    for (let i = 0; i < 6; i++) { const f = new THREE.CylinderGeometry(0.002, 0.006, 0.3, 3, 3); f.translate(0, -0.15, 0); const a = i / 6 * Math.PI * 2; parts.push({ geo: paint(f, () => [0.9, 0.95, 1]), pos: [Math.cos(a) * 0.07, 0.96, Math.sin(a) * 0.07], rot: [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2] }); }
    return mergeParts(parts);
}
function crystalGeo() {
    // a magic crystal coral: a cluster of glassy spires, faceted, brighter at their tips
    const parts = [], rng = K.rng(57);
    for (let i = 0; i < 9; i++) {
        const h = 0.4 + rng() * 0.9, r = 0.05 + rng() * 0.06;
        const g = new THREE.ConeGeometry(r, h, 6, 3);
        g.translate(0, h / 2, 0);
        const a = rng() * Math.PI * 2, lean = rng() * 0.5;
        parts.push({ geo: colorBy(g, (x, y) => { const t = y / h; return [0.6 + 0.6 * t, 0.6 + 0.6 * t, 0.6 + 0.6 * t]; }), pos: [Math.cos(a) * 0.12 * (i ? 1 : 0), 0, Math.sin(a) * 0.12 * (i ? 1 : 0)], rot: [Math.cos(a) * lean, 0, Math.sin(a) * lean] });
    }
    return mergeParts(parts);
}
function colorBy(g, f) { const P = g.getAttribute('position'), a = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const k = f(P.getX(i), P.getY(i), P.getZ(i)); a[i * 3] = k[0]; a[i * 3 + 1] = k[1]; a[i * 3 + 2] = k[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function tableGeo() {
    // a table coral: a short stout stalk and a broad flat plate, its rim ragged, ridged rays from the middle, the edge paler
    const stalk = colorBy(new THREE.CylinderGeometry(0.06, 0.1, 0.3, 8, 2).translate(0, 0.15, 0), () => [0.75, 0.7, 0.6]);
    const plate = new THREE.CylinderGeometry(0.6, 0.45, 0.06, 36, 1);
    const P = plate.getAttribute('position');
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i), a = Math.atan2(z, x), rr = Math.hypot(x, z); const rag = 1 + 0.08 * Math.sin(a * 9) + 0.05 * Math.sin(a * 23); P.setXYZ(i, x * rag, P.getY(i) + 0.03 * Math.sin(a * 5) * rr, z * rag); }
    plate.translate(0, 0.32, 0);
    plate.computeVertexNormals();
    colorBy(plate, (x, y, z) => { const a = Math.atan2(z, x), rr = Math.hypot(x, z); const ray = Math.abs(Math.sin(a * 40)) > 0.8 ? 0.82 : 1; return [ray * (0.85 + 0.25 * rr), ray * (0.85 + 0.25 * rr), ray * (0.8 + 0.3 * rr)]; });
    return mergeParts([{ geo: stalk }, { geo: plate }]);
}
function tubeGeo() {
    // tube sponges: a cluster of open tubes of different heights, ribbed, their mouths flared, dark inside
    const parts = [];
    for (let i = 0; i < 6; i++) {
        const h = 0.35 + (i * 37 % 7) / 10, r = 0.06 + (i % 3) * 0.015;
        const g = new THREE.CylinderGeometry(r * 1.25, r, h, 14, 6, true);
        const P = g.getAttribute('position');
        for (let k = 0; k < P.count; k++) { const a = Math.atan2(P.getZ(k), P.getX(k)), y = P.getY(k); const rib = 1 + 0.06 * Math.sin(a * 7 + y * 14); P.setX(k, P.getX(k) * rib); P.setZ(k, P.getZ(k) * rib); }
        g.translate(0, h / 2, 0);
        g.computeVertexNormals();
        colorBy(g, (x, y) => [0.8 + 0.4 * y / h, 0.8 + 0.4 * y / h, 0.8 + 0.4 * y / h]);
        const inner = colorBy(new THREE.CircleGeometry(r * 1.15, 12).rotateX(-Math.PI / 2).translate(0, h - 0.06, 0), () => [0.2, 0.15, 0.2]);
        const a = i / 6 * Math.PI * 2, d = i ? 0.12 : 0;
        parts.push({ geo: g, pos: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15] });
        parts.push({ geo: inner, pos: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15] });
    }
    return mergeParts(parts);
}
function softGeo() {
    // a soft coral: thick fleshy branches ending in clusters of little polyps (a cauliflower of colour)
    const parts = [], rng = K.rng(91);
    for (let b = 0; b < 6; b++) {
        const a = b / 6 * Math.PI * 2 + rng(), lean = 0.3 + rng() * 0.4, len = 0.35 + rng() * 0.3;
        const br = colorBy(new THREE.CylinderGeometry(0.03, 0.05, len, 7).translate(0, len / 2, 0), () => [0.95, 0.9, 0.95]);
        parts.push({ geo: br, rot: [Math.cos(a) * lean, 0, Math.sin(a) * lean] });
        const tip = [Math.sin(Math.sin(a) * lean) * len * 0.0 + Math.cos(a) * Math.sin(lean) * len, Math.cos(lean) * len, Math.sin(a) * Math.sin(lean) * len];
        for (let k = 0; k < 7; k++) {
            const bud = colorBy(new THREE.SphereGeometry(0.04 + rng() * 0.03, 8, 6), () => [1.15, 1.15, 1.15]);
            parts.push({ geo: bud, pos: [tip[0] + (rng() - 0.5) * 0.12, tip[1] + (rng() - 0.3) * 0.1, tip[2] + (rng() - 0.5) * 0.12] });
        }
    }
    return mergeParts(parts);
}
function urchinGeo() {
    // a sea urchin: a dark round test bristling with long spines
    const parts = [{ geo: colorBy(new THREE.SphereGeometry(0.08, 12, 8).scale(1, 0.75, 1).translate(0, 0.05, 0), () => [0.5, 0.45, 0.55]) }];
    const N = 46;
    for (let i = 0; i < N; i++) {
        const y = 1 - (i + 0.5) / N * 1.3, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.399;
        if (y < -0.25) continue;
        const sp = colorBy(new THREE.ConeGeometry(0.006, 0.2, 4).translate(0, 0.1, 0), (x, yy) => [0.35 + yy, 0.3 + yy * 0.8, 0.4 + yy]);
        const dir = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(dir.x * 0.07, 0.05 + dir.y * 0.06, dir.z * 0.07), q, new THREE.Vector3(1, 1, 1));
        parts.push({ geo: sp, matrix: m });
    }
    return mergeParts(parts);
}
function starGeo() {
    // a starfish: five fat tapering arms, bumpy, lying on the bottom
    const sh = new THREE.Shape();
    for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? 0.07 : 0.22; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.025, bevelSegments: 2, steps: 1 });
    g.rotateX(-Math.PI / 2);
    g.deleteAttribute('uv');
    colorBy(g, (x, y, z) => { const bump = Math.abs(Math.sin(x * 70) * Math.sin(z * 70)) > 0.7 ? 1.25 : 1; return [bump, bump * 0.95, bump * 0.9]; });
    g.computeVertexNormals();
    return g;
}
const SHAPES = { kelp: kelpGeo, grass: grassGeo, staghorn: staghornGeo, fan: fanGeo, brain: brainGeo, anemone: anemoneGeo, lily: lilyGeo, table: tableGeo, tube: tubeGeo, soft: softGeo, urchin: urchinGeo, star: starGeo, glowcoral: staghornGeo, glowfan: fanGeo, glowbrain: brainGeo, crystal: crystalGeo, ...Object.fromEntries(Object.keys(REEF_KINDS).map((k) => [k, () => reefGeo(k)])) };
const shape = (k) => _geo[k] || (_geo[k] = SHAPES[k]());
/** The tint of a kind (rgb, the instance's colour; × the shape's own colours). */
function tintOf(kind, t) {
    const pick = (list) => list[Math.floor(t * list.length) % list.length];
    switch (kind) {
        case 'staghorn': return pick([[1, 0.55, 0.62], [1, 0.62, 0.32], [0.72, 0.48, 1], [1, 0.86, 0.4], [0.55, 0.85, 0.95]]);
        case 'fan': return pick([[0.85, 0.2, 0.25], [0.6, 0.22, 0.65], [0.95, 0.5, 0.2], [0.9, 0.82, 0.3]]);
        case 'brain': return pick([[0.9, 0.85, 0.6], [0.6, 0.85, 0.55], [0.95, 0.65, 0.5]]);
        case 'anemone': return pick([[0.3, 1, 0.95], [0.75, 0.45, 1], [0.45, 1, 0.5], [1, 0.5, 0.85]]);
        case 'lily': return pick([[0.55, 0.9, 1], [0.85, 0.7, 1], [0.6, 1, 0.8]]);
        case 'table': return pick([[0.72, 0.62, 0.45], [0.55, 0.7, 0.6], [0.8, 0.55, 0.65], [0.6, 0.6, 0.78]]);
        case 'tube': return pick([[0.62, 0.3, 0.75], [0.95, 0.55, 0.2], [0.9, 0.8, 0.3], [0.35, 0.55, 0.85], [0.85, 0.3, 0.35]]);
        case 'soft': return pick([[1, 0.45, 0.65], [0.95, 0.75, 0.3], [0.65, 0.5, 1], [1, 0.6, 0.35], [0.5, 0.95, 0.75]]);
        case 'urchin': return pick([[0.35, 0.2, 0.45], [0.18, 0.15, 0.2], [0.55, 0.25, 0.3]]);
        case 'glowcoral': return pick([[0.3, 1, 1], [0.8, 0.45, 1], [1, 0.85, 0.35], [0.4, 1, 0.6], [1, 0.45, 0.85]]);
        case 'glowfan': return pick([[0.55, 0.4, 1], [0.3, 0.85, 1], [1, 0.5, 0.9]]);
        case 'glowbrain': return pick([[0.4, 1, 0.8], [1, 0.75, 0.4], [0.7, 0.6, 1]]);
        case 'crystal': return pick([[0.6, 0.95, 1], [0.85, 0.65, 1], [1, 0.9, 0.6], [0.6, 1, 0.75]]);
        case 'star': return pick([[1, 0.45, 0.2], [0.9, 0.2, 0.25], [0.3, 0.45, 0.95], [0.95, 0.75, 0.3], [0.75, 0.35, 0.8]]);
        default: return kind in REEF_KINDS ? reefTint(kind, t) : [0.85 + 0.3 * t, 0.9 + 0.2 * t, 0.85 + 0.25 * t];
    }
}

/** The sway: the plant bends in the swell, more the higher up it (its own phase from where it stands). */
function swayMaterial(base, amp) {
    const U = { uTime: { value: 0 }, uGlow: { value: 1 } };
    base.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = U.uTime; sh.uniforms.uGlow = U.uGlow;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                #ifdef USE_INSTANCING
                vec3 seaRoot = instanceMatrix[3].xyz;
                #else
                vec3 seaRoot = vec3(0.0);
                #endif
                float seaPh = fract(sin(dot(seaRoot.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
                float seaH = max(0.0, position.y);
                float seaB = seaH * seaH * ${amp.toFixed(3)};
                transformed.x += sin(uTime * 1.1 + seaPh + seaH * 1.7) * seaB;
                transformed.z += cos(uTime * 0.8 + seaPh * 1.3 + seaH * 1.3) * seaB * 0.7;`);
        if (base.isMeshBasicMaterial) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow;').replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= uGlow;');
    };
    base.customProgramCacheKey = () => 'seafloor-sway-' + amp + (base.isMeshBasicMaterial ? 'glow' : '');
    base.userData.U = U;
    return base;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _c = new THREE.Color();

export class SeaFloor {
    constructor(game) {
        this.game = game;
        this.meshes = {};
        this.t = 0;
        this.center = null; // where the plants were last laid round
        this.job = null;
        for (const [k, cap] of Object.entries(FLOOR.CAP)) {
            const glow = GLOW_KINDS.has(k);
            const mat = swayMaterial(glow ? new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: k === 'lily' || k === 'crystal', opacity: k === 'crystal' ? 0.82 : 0.9, depthWrite: k !== 'crystal' })
                : new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: k === 'kelp' || k === 'grass' ? THREE.DoubleSide : THREE.FrontSide }), k === 'kelp' ? 0.1 : k === 'grass' ? 0.12 : k === 'lily' ? 0.06 : k === 'soft' ? 0.05 : k === 'urchin' || k === 'star' || k === 'table' || k in REEF_KINDS ? 0 : 0.015); // (a reef formation is rock: it does not sway)
            const m = new THREE.InstancedMesh(shape(k), mat, cap);
            m.count = 0;
            m.frustumCulled = false;
            m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
            m.userData.keep = true;
            game.scene.add(m);
            this.meshes[k] = m;
        }
        // the fish: a hundred kinds, one draw (ReefFish.js); the turtles, the crabs, the lobsters, the shrimps (SeaCritters.js)
        this.reef = new ReefFish(game);
        this.critters = new SeaCritters(game);
        this.schools = [];
    }

    /** For Game.prewarm: one of each kind (the shaders at the loading screen). */
    samples() { return [...Object.values(this.meshes).map((m) => new THREE.Mesh(m.geometry, m.material)), this.reef.sample(), ...this.critters.samples()]; }

    /** The fish drawn now ({count}: tests). */
    get fish() { return { count: this.reef.count, positions: () => this.reef.positions() }; }

    /** The bottom's surface at (x, z): the top of the top block (L − 0.5), a ramp's slope where there is one. */
    _bottomY(t, x, z) {
        if (t.surfaceY) { const y = t.surfaceY(x, z); if (Number.isFinite(y)) return y; }
        return t.topLayer(Math.round(x), Math.round(z)) - 0.5;
    }

    _depth(x, z) {
        const t = this.game.terrain?.data;
        if (!t) return 0;
        const ix = Math.round(x), iz = Math.round(z);
        if (t.landMade && !t.landMade(ix, iz)) return 0;
        if (!t.isSeaColumn?.(ix, iz)) return 0;
        if (this.game.sunken?.covers?.(x, z)) return 0; // (no weed through a wreck's hull or the temple's floor — SunkenWorld.js)
        const top = t.topLayer(ix, iz);
        const w = waterAt(t, ix, iz, top + 1);
        return w ? w.depth : 0;
    }

    update(dt) {
        const g = this.game, me = g.character?.group?.position, sea = g.sea;
        this.t += dt;
        const near = !!me && !!sea && sea.s(me.x, me.z) > -40 && me.y < 120 && !g.hellGate?.inHell && (!g.space?.realm || g.space.realm === 'earth');
        for (const m of Object.values(this.meshes)) m.visible = near;
        this.reef.mesh.visible = near;
        this.critters.visible(near);
        if (!near) { this.center = null; this.job = null; return; }
        const night = g.world?._night || 0;
        for (const [k, m] of Object.entries(this.meshes)) { const U = m.material.userData.U; U.uTime.value = this.t; U.uGlow.value = GLOW_KINDS.has(k) ? (0.75 + 0.25 * Math.sin(this.t * (k === 'crystal' ? 2.1 : 1.3) + k.length)) * (1 + 0.6 * night) : 1; }
        // the plants: laid anew round the player when he has moved far enough (a few cells a frame)
        if (!this.job && (!this.center || Math.hypot(me.x - this.center.x, me.z - this.center.z) > FLOOR.CELL * 1.5)) this._startJob(me);
        if (this.job) this._runJob();
        const t = g.terrain?.data;
        if (t) {
            const wat = (x, z, y) => { const ix = Math.round(x), iz = Math.round(z); if (!t.isSeaColumn?.(ix, iz) || (t.landMade && !t.landMade(ix, iz))) return null; return waterAt(t, ix, iz, y ?? t.topLayer(ix, iz) + 1); };
            const day = g.underwaterLight?.day ?? (1 - night);
            this.reef.update(dt, me, wat, day, night);
            this.critters.update(dt, me, wat, (x, z) => this._depth(x, z) > 0 ? this._bottomY(t, x, z) : null, day, night);
        }
    }

    _startJob(me) {
        const C = FLOOR.CELL, R = Math.ceil(FLOOR.R / C);
        const cx = Math.floor(me.x / C), cz = Math.floor(me.z / C);
        const cells = [];
        for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= R * R) cells.push([cx + dx, cz + dz, dx * dx + dz * dz]);
        cells.sort((a, b) => a[2] - b[2]); // (the nearest first)
        const out = {};
        for (const k of Object.keys(FLOOR.CAP)) out[k] = [];
        // the reef formations of the regions round (laid first: the loose plants keep out of their feet)
        const REG = FLOOR.REEF_CELL, seed = this.game.seed || 1, reach = FLOOR.R + 14, structs = [];
        for (let rx = Math.floor((me.x - reach) / REG); rx <= Math.floor((me.x + reach) / REG); rx++) for (let rz = Math.floor((me.z - reach) / REG); rz <= Math.floor((me.z + reach) / REG); rz++) {
            if (Math.hypot((rx + 0.5) * REG - me.x, (rz + 0.5) * REG - me.z) > reach + REG * 0.7) continue;
            for (const st of reefStructures(rx, rz, seed, (x, z) => this._depth(x, z))) structs.push(st);
        }
        this.job = { cells, i: 0, out, at: { x: me.x, z: me.z }, structs, avoid: (x, z) => { for (const st of structs) { const dx = x - st.x, dz = z - st.z; if (dx * dx + dz * dz < st.foot * st.foot) return true; } return false; } };
    }

    _runJob() {
        const J = this.job, t0 = performance.now(), t = this.game.terrain?.data, seed = this.game.seed || 1;
        while (J.i < J.cells.length && performance.now() - t0 < FLOOR.BUDGET) {
            const [cx, cz] = J.cells[J.i++];
            for (const p of cellPlants(cx, cz, seed, (x, z) => this._depth(x, z), J.avoid)) {
                const list = J.out[p.kind];
                if (list.length >= FLOOR.CAP[p.kind]) continue;
                p.y = this._bottomY(t, p.x, p.z) + 0.04; // (rooted IN the sand: was a metre over it — a layer L's top is at L − 0.5, the author 05.11)
                list.push(p);
            }
        }
        if (J.i < J.cells.length) return;
        for (const st of J.structs) { // (the formations: only the ones inside the radius, within their caps)
            if (Math.hypot(st.x - J.at.x, st.z - J.at.z) > FLOOR.R + st.foot) continue;
            const list = J.out[st.kind];
            if (list.length >= FLOOR.CAP[st.kind]) continue;
            list.push({ kind: st.kind, x: st.x, z: st.z, s: st.s, rot: st.rot, tint: st.tint, y: this._bottomY(t, st.x, st.z) + 0.04 });
        }
        // done: the instances written at once (no half-laid floor)
        for (const [k, list] of Object.entries(J.out)) {
            const m = this.meshes[k];
            for (let i = 0; i < list.length; i++) {
                const p = list[i];
                const sxz = k === 'kelp' ? p.s * 0.55 : p.s; // (kelp: a little narrower than tall — its blades ~0.5 m wide)
                _m.compose(_p.set(p.x, p.y - 0.05, p.z), _q.setFromEuler(_e.set(0, p.rot, 0)), _s.set(sxz, p.s, sxz));
                m.setMatrixAt(i, _m);
                const c = tintOf(k, p.tint);
                m.instanceColor.setXYZ(i, c[0], c[1], c[2]);
            }
            m.count = list.length;
            m.instanceMatrix.needsUpdate = true;
            m.instanceColor.needsUpdate = true;
        }
        this.center = J.at;
        this.structs = J.structs; // (the formations now laid — tools / tests look at them)
        this.job = null;
    }

    dispose() { this.reef.dispose(); this.critters.dispose(); for (const m of Object.values(this.meshes)) m.parent?.remove(m); }
}
