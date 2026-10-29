/**
 * IceModels.js — the Ice Castle's people and things (IceQueen.js): the Ice Queen, the evil
 * snowmen, the ice monsters, the Ice Rod, the ice chandelier, the snowflake shot and the ice spike.
 *
 * Built for many at once (CLAUDE.md, FPS): every part is ONE mesh whose geometry is a merge of
 * coloured boxes / shapes (vertex colours), cached by content — all snowmen share the same
 * geometries; a handful of shared materials (made once), no textures, no per-creature materials.
 *
 * Frames: the feet at local y 0, the creature looks along local −Z (as the villagers).
 */

import * as THREE from 'three';

// ================================================================ materials (shared)
const MAT = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    // ice: see-through, glowing a little from inside
    ice: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.8, emissive: 0x1b4f72, depthWrite: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    cape: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45, emissive: 0x10324a, side: THREE.DoubleSide, depthWrite: false }),
    sparkle: new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }),
    hit: new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xff8080, emissive: 0x7a1010 }),
};
for (const [k, m] of Object.entries(MAT)) { m.name = 'ice-' + k; m.userData.shared = true; } // (never disposed with a model: ItemTypes.disposeModel)
export const ICE_MATERIALS = MAT;

// ============================================================ merged shapes
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
const UNIT = {
    box: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.SphereGeometry(0.5, 12, 9),
    cone: new THREE.ConeGeometry(0.5, 1, 6),
    oct: new THREE.OctahedronGeometry(0.5, 0),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    ring: new THREE.TorusGeometry(0.5, 0.11, 5, 10), // (a chain's link)
};
const _cache = new Map();

/**
 * One geometry from a list of shapes: [shape, w, h, d, x, y, z, colour, rx, ry, rz] each
 * (shape a key of UNIT, scaled to w×h×d). Cached by content.
 */
function merged(list) {
    const key = JSON.stringify(list);
    const hit = _cache.get(key);
    if (hit) return hit;
    let nv = 0, ni = 0;
    for (const s of list) { const u = UNIT[s[0]]; nv += u.attributes.position.count; ni += u.index ? u.index.count : u.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v0 = 0, i0 = 0;
    for (const [shape, w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0] of list) {
        const u = UNIT[shape], P = u.attributes.position.array, N = u.attributes.normal.array, n = u.attributes.position.count;
        _q.setFromEuler(_e.set(rx, ry, rz));
        _m4.compose(_p.set(x, y, z), _q, _s.set(w, h, d));
        _c.setHex(c);
        for (let j = 0; j < n; j++) {
            const k = (v0 + j) * 3;
            _p.fromArray(P, j * 3).applyMatrix4(_m4).toArray(pos, k);
            _n.fromArray(N, j * 3).divide(_s).applyQuaternion(_q).normalize().toArray(nor, k);
            const dark = N[j * 3 + 1] < -0.5 ? 0.82 : 1;
            col[k] = _c.r * dark; col[k + 1] = _c.g * dark; col[k + 2] = _c.b * dark;
        }
        if (u.index) for (let j = 0; j < u.index.count; j++) idx[i0 + j] = u.index.array[j] + v0;
        else for (let j = 0; j < n; j++) idx[i0 + j] = v0 + j;
        v0 += n; i0 += u.index ? u.index.count : n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.userData.shared = true;
    _cache.set(key, g);
    return g;
}
const mesh = (list, mat = MAT.solid, shadow = true) => { const m = new THREE.Mesh(merged(list), mat); m.castShadow = shadow; return m; };
const pivot = (x, y, z, ...kids) => { const p = new THREE.Group(); p.position.set(x, y, z); for (const k of kids) p.add(k); return p; };

// ================================================================== the Ice Rod
const ROD_ICE = 0xbfe9ff, ROD_DEEP = 0x6cc4f0, SILVER = 0xdfe8f0, ROD_GLOW = 0xe8fbff;
/** The rod's length (model units, its butt at y 0, the crystal at the top). */
export const ROD_LEN = 1.45;
/** Where the crystal's heart is (model units): the spells leave the rod from there. */
export const ROD_TIP = 1.36;
/**
 * The Ice Rod: a staff of clear ice with a silver spiral, a snowflake crown and a glowing crystal
 * at its top (NOT a wand: long, held in the fist like a staff).
 */
export function iceRodModel() {
    const g = new THREE.Group();
    const L = [['box', 0.05, 1.2, 0.05, 0, 0.6, 0, ROD_ICE], ['cone', 0.07, 0.12, 0.07, 0, 0.0, 0, ROD_DEEP, Math.PI, 0, 0]];
    for (let i = 0; i < 9; i++) { const a = i * 1.2; L.push(['box', 0.065, 0.025, 0.02, Math.cos(a) * 0.025, 0.15 + i * 0.11, Math.sin(a) * 0.025, SILVER, 0, -a, 0.35]); }
    // the snowflake crown holding the crystal
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; L.push(['box', 0.02, 0.17, 0.02, Math.cos(a) * 0.05, 1.27, Math.sin(a) * 0.05, SILVER, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]); }
    g.add(mesh(L, MAT.ice, false));
    const crystal = mesh([['oct', 0.13, 0.24, 0.13, 0, ROD_TIP, 0, ROD_GLOW], ['oct', 0.06, 0.13, 0.06, 0.06, 1.3, 0.02, ROD_GLOW, 0, 0, -0.5], ['oct', 0.06, 0.12, 0.06, -0.05, 1.31, -0.03, ROD_GLOW, 0.3, 0, 0.5]], MAT.glow, false);
    g.add(crystal);
    g.userData.crystal = crystal;
    return g;
}

/**
 * The blade the Ice Queen's rod grows into (IceQueen.js): a long double-edged blade of glacier ice up out of the crown, a silver cross-guard with
 * icicle quillons, frost teeth along both edges, a glowing fuller. Built one rod-unit long (y 0…1; the guard and the teeth are thin — they
 * stretch with it a little), the pivot at the crown; the game scales `y` from ~0 (a rod) to BLADE_LEN (a blade). userData: {tip} (the point, in its units).
 */
export function bladeModel() {
    const E = [['box', 0.13, 0.74, 0.05, 0, 0.37, 0, ROD_ICE], ['cone', 0.13, 0.26, 0.05, 0, 0.87, 0, ROD_ICE], ['box', 0.09, 0.5, 0.06, 0, 0.3, 0, ROD_DEEP]];
    for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) E.push(['oct', 0.05, 0.07, 0.04, sd * 0.07, 0.08 + i * 0.12, 0, i % 2 ? SILVER : ROD_ICE, 0, 0, sd * 0.5]); // (frost teeth along both edges)
    const G = [['box', 0.62, 0.025, 0.1, 0, 0.0, 0, SILVER], ['cone', 0.06, 0.2, 0.06, -0.34, -0.03, 0, ROD_DEEP, 0, 0, Math.PI / 2], ['cone', 0.06, 0.2, 0.06, 0.34, -0.03, 0, ROD_DEEP, 0, 0, -Math.PI / 2], ['box', 0.03, 0.62, 0.065, 0, 0.36, 0, ROD_GLOW]];
    const b = new THREE.Group();
    b.add(mesh(E, MAT.ice, false), mesh(G, MAT.glow, false));
    b.userData.tip = 1;
    return b;
}

// ================================================================== the Ice Queen
const DRESS = 0xf4fbff, DRESS2 = 0xdff2fc, DRESS3 = 0xc9e9fa, SKIN = 0xf3dccd, HAIR = 0xf6f0dc, LIP = 0xc76a7a, EYE = 0x3a7fc0;
/**
 * The Ice Queen (unit height 4.65 like a villager; the creature is scaled ×1.5): a snow-white gown
 * flaring to the ground and sparkling, a bodice of ice, a long see-through cape, a platinum braid
 * over her shoulder, a diadem of ice — and the Ice Rod in her right hand.
 * userData: {armL, armR, head, skirt, cape, rod, sparkle}
 */
export function iceQueenModel() {
    const g = new THREE.Group();
    // the gown: tiers flaring down to the ground
    const S = [];
    for (let i = 0; i < 7; i++) {
        const y = 0.15 + i * 0.28, w = 1.9 - i * 0.15;
        S.push(['box', w, 0.3, w * 0.8, 0, y, 0.05, i % 2 ? DRESS : DRESS2]);
    }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; S.push(['box', 0.1, 1.6, 0.06, Math.sin(a) * 0.82, 0.85, Math.cos(a) * 0.68, DRESS3, Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12]); }
    const skirt = mesh(S);
    g.add(skirt);
    // the bodice (ice) and the bare shoulders
    const T = [['box', 0.86, 1.15, 0.5, 0, 2.55, 0, DRESS2], ['box', 0.72, 0.18, 0.46, 0, 2.05, 0, DRESS3],
        ['box', 0.9, 0.16, 0.52, 0, 3.12, 0, SKIN], ['box', 0.22, 0.25, 0.22, 0, 3.3, 0, SKIN]];
    for (let i = 0; i < 6; i++) T.push(['oct', 0.08, 0.12, 0.04, (i - 2.5) * 0.12, 2.75 - Math.abs(i - 2.5) * 0.08, -0.26, ROD_GLOW]); // (ice jewels)
    g.add(mesh(T));
    // the head: a pale face, blue eyes, red lips, the platinum hair, the braid, the diadem
    const H = [['box', 0.6, 0.66, 0.58, 0, 0, 0, SKIN],
        ['box', 0.12, 0.07, 0.03, -0.14, 0.06, -0.295, EYE], ['box', 0.12, 0.07, 0.03, 0.14, 0.06, -0.295, EYE],
        ['box', 0.15, 0.025, 0.02, -0.14, 0.13, -0.3, 0x9a8a70, 0, 0, 0.15], ['box', 0.15, 0.025, 0.02, 0.14, 0.13, -0.3, 0x9a8a70, 0, 0, -0.15],
        ['box', 0.16, 0.05, 0.03, 0, -0.17, -0.295, LIP],
        ['box', 0.66, 0.26, 0.64, 0, 0.3, 0.03, HAIR], ['box', 0.66, 0.6, 0.2, 0, 0.0, 0.27, HAIR], ['box', 0.1, 0.5, 0.6, -0.33, 0.05, 0.03, HAIR], ['box', 0.1, 0.5, 0.6, 0.33, 0.05, 0.03, HAIR],
        ['box', 0.34, 0.3, 0.22, 0, 0.46, 0.08, HAIR, -0.3, 0, 0]];
    for (let i = 0; i < 7; i++) H.push(['box', 0.2 - i * 0.012, 0.22, 0.2 - i * 0.012, -0.36 - i * 0.02, -0.3 - i * 0.2, -0.12 - Math.min(i, 2) * 0.04, HAIR, 0, 0, 0.12]);
    const Dm = [];
    for (let k = -3; k <= 3; k++) Dm.push(['oct', 0.06, 0.16 + (3 - Math.abs(k)) * 0.07, 0.06, k * 0.08, 0.44 + (3 - Math.abs(k)) * 0.03, -0.22 + Math.abs(k) * 0.03, ROD_GLOW]);
    const head = pivot(0, 3.75, 0, mesh(H), mesh(Dm, MAT.glow, false));
    g.add(head);
    // the arms: see-through ice sleeves, pale hands (the pivots at the shoulders)
    const arm = (s) => mesh([['box', 0.24, 1.0, 0.24, 0, -0.5, 0, DRESS3], ['box', 0.32, 0.18, 0.3, 0, -0.95, 0, DRESS2], ['box', 0.18, 0.3, 0.18, 0, -1.2, 0, SKIN]], MAT.solid);
    const armL = pivot(-0.55, 3.05, 0, arm(-1)), armR = pivot(0.55, 3.05, 0, arm(1));
    g.add(armL, armR);
    // the Ice Rod in the right hand (held upright in the fist)
    const rod = iceRodModel();
    rod.scale.setScalar(1.9);
    rod.position.set(0, -1.25 - 0.55 * 1.9, 0);
    armR.children[0].add(rod);
    // the blade the rod grows into (hidden as a hair-thin line: scale y ≈ 0 — IceQueen scales it up when she runs at a frozen foe)
    const blade = bladeModel();
    blade.position.set(0, 1.2, 0);
    blade.scale.set(1, 0.001, 1);
    rod.add(blade);
    // the cape: long, see-through, from the shoulders to the ground and trailing behind
    const C = [['box', 0.9, 2.9, 0.04, 0, 1.6, 0.4, 0x9fd6f2, 0.12, 0, 0], ['box', 1.2, 0.5, 0.04, 0, 0.2, 0.62, 0x8fcdee, 0.4, 0, 0]];
    for (let i = 0; i < 5; i++) C.push(['oct', 0.12, 0.12, 0.02, (i - 2) * 0.18, 0.8 + (i % 2) * 0.6, 0.43, 0xffffff]);
    const cape = pivot(0, 0, 0, mesh(C, MAT.cape, false));
    g.add(cape);
    // the gown's sparkle: points that twinkle (IceQueen animates the material's opacity)
    const sp = new Float32Array(90 * 3);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 90; i++) {
        const y = rnd() * 2.0, w = (1.9 - y * 0.53) * 0.5 + 0.02, a = rnd() * Math.PI * 2;
        sp[i * 3] = Math.sin(a) * w; sp[i * 3 + 1] = y + 0.05; sp[i * 3 + 2] = Math.cos(a) * w * 0.8 + 0.05;
    }
    const sg = _cache.get('sparkle') || (() => { const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.BufferAttribute(sp, 3)); q.userData.shared = true; _cache.set('sparkle', q); return q; })();
    const sparkle = new THREE.Points(sg, MAT.sparkle);
    g.add(sparkle);
    g.userData = { armL, armR, head, skirt, cape, rod, sparkle, blade };
    return g;
}

// ================================================================== the evil snowmen
const SNOWC = 0xf5f8fb, SNOWC2 = 0xe6eef5, COAL = 0x15161a, CARROT = 0xe8711c, TWIG = 0x5a3b22;
/**
 * An evil snowman (≈3 m: three balls of snow), angry: slanted coal brows, red-glinting coal eyes,
 * a jagged grin, a carrot nose, twig arms (the pivots at its sides — it throws with them).
 * userData: {body, armL, armR, head}
 */
export function snowmanModel() {
    const g = new THREE.Group();
    const body = mesh([['ball', 1.7, 1.45, 1.7, 0, 0.7, 0, SNOWC], ['ball', 1.25, 1.1, 1.25, 0, 1.75, 0, SNOWC2],
        ['ball', 0.12, 0.12, 0.06, 0, 1.95, -0.6, COAL], ['ball', 0.12, 0.12, 0.06, 0, 1.65, -0.62, COAL], ['ball', 0.12, 0.12, 0.06, 0, 1.0, -0.84, COAL]]);
    g.add(body);
    const F = [['ball', 0.88, 0.82, 0.88, 0, 0, 0, SNOWC],
        // eyes: coal with a red glint; the brows slanting down to the middle (angry)
        ['box', 0.13, 0.13, 0.06, -0.17, 0.08, -0.42, COAL], ['box', 0.13, 0.13, 0.06, 0.17, 0.08, -0.42, COAL],
        ['box', 0.22, 0.05, 0.05, -0.17, 0.22, -0.42, COAL, 0, 0, -0.45], ['box', 0.22, 0.05, 0.05, 0.17, 0.22, -0.42, COAL, 0, 0, 0.45],
        ['cone', 0.11, 0.38, 0.11, 0, 0, -0.58, CARROT, -Math.PI / 2, 0, 0]];
    // the jagged grin: a row of coal bits, down at the ends
    for (let i = -3; i <= 3; i++) F.push(['box', 0.07, i % 2 ? 0.07 : 0.1, 0.05, i * 0.07, -0.2 + Math.abs(i) * 0.025, -0.4 + Math.abs(i) * 0.01, COAL]);
    const eyes = mesh([['box', 0.05, 0.05, 0.02, -0.17, 0.08, -0.455, 0xff3020], ['box', 0.05, 0.05, 0.02, 0.17, 0.08, -0.455, 0xff3020]], MAT.glow, false);
    const head = pivot(0, 2.6, 0, mesh(F), eyes);
    g.add(head);
    const twig = (s) => mesh([['box', 0.07, 1.0, 0.07, 0, -0.5, 0, TWIG], ['box', 0.05, 0.3, 0.05, s * 0.08, -0.85, 0, TWIG, 0, 0, s * 0.6], ['box', 0.05, 0.25, 0.05, -s * 0.06, -0.95, 0, TWIG, 0, 0, -s * 0.5]]);
    const armL = pivot(-0.55, 1.9, 0, twig(-1)), armR = pivot(0.55, 1.9, 0, twig(1));
    armL.rotation.z = -2.1; armR.rotation.z = 2.1; // (the twigs up and out)
    g.add(armL, armR);
    g.userData = { body, armL, armR, head };
    return g;
}

// ================================================================== the friendly snowman («Snowman»)
const SCARF = 0xd8433c, SCARF2 = 0xf3efe6, CHEEK = 0xf4a9b4;
/** Its size: the creature (IceQueen 'friend') — feet at 0, a head's top at FRIEND_H. */
export const FRIEND_H = 2.45;
/**
 * A friendly snowman (the spell «Snowman»; ≈2.4 m, smaller than the queen's): three balls of snow,
 * round coal eyes with a glint, rosy cheeks, a wide smile turned UP, a carrot nose, coal buttons, a
 * red striped scarf with a hanging end, twig arms with three fingers. Nothing like the evil ones
 * (no brows, no red eyes, no jagged grin).
 * Parts apart (the spell builds it bit by bit): userData {base, mid, head, face, lids, armL, armR, scarf}
 */
export function friendSnowmanModel() {
    const g = new THREE.Group();
    const base = mesh([['ball', 1.3, 1.15, 1.3, 0, 0, 0, SNOWC]]);
    base.position.y = 0.55;
    const mid = pivot(0, 1.4, 0, mesh([['ball', 0.98, 0.88, 0.98, 0, 0, 0, SNOWC2],
        ['ball', 0.1, 0.1, 0.05, 0, 0.12, -0.47, COAL], ['ball', 0.1, 0.1, 0.05, 0, -0.12, -0.48, COAL]]));
    // the scarf round the neck, its end hanging down the front
    const scarf = mesh([['cyl', 0.78, 0.17, 0.78, 0, 0.42, 0, SCARF], ['cyl', 0.8, 0.05, 0.8, 0, 0.42, 0, SCARF2],
        ['box', 0.2, 0.55, 0.06, 0.2, 0.14, -0.4, SCARF, 0.12, 0, 0.12], ['box', 0.21, 0.05, 0.07, 0.21, 0.05, -0.41, SCARF2, 0.12, 0, 0.12],
        ['box', 0.21, 0.05, 0.07, 0.17, -0.08, -0.43, SCARF2, 0.12, 0, 0.12]], MAT.solid, false);
    mid.add(scarf);
    const ball = mesh([['ball', 0.72, 0.68, 0.72, 0, 0, 0, SNOWC]]);
    // the face: round coal eyes, rosy cheeks, a smile curving up at its ends, the carrot
    const F = [['ball', 0.12, 0.14, 0.06, -0.13, 0.07, -0.33, COAL], ['ball', 0.12, 0.14, 0.06, 0.13, 0.07, -0.33, COAL],
        ['ball', 0.12, 0.07, 0.04, -0.21, -0.06, -0.3, CHEEK], ['ball', 0.12, 0.07, 0.04, 0.21, -0.06, -0.3, CHEEK],
        ['cone', 0.09, 0.32, 0.09, 0, -0.01, -0.48, CARROT, -Math.PI / 2, 0, 0]];
    for (let i = -3; i <= 3; i++) F.push(['ball', 0.055, 0.055, 0.04, i * 0.055, -0.15 + i * i * 0.008, -0.33 + Math.abs(i) * 0.008, COAL]);
    const glint = mesh([['box', 0.035, 0.035, 0.02, -0.11, 0.1, -0.365, 0xffffff], ['box', 0.035, 0.035, 0.02, 0.15, 0.1, -0.365, 0xffffff]], MAT.glow, false);
    const face = pivot(0, 0, 0, mesh(F, MAT.solid, false), glint);
    // the eyelids (snow): shown for a blink
    const lids = mesh([['box', 0.15, 0.17, 0.05, -0.13, 0.07, -0.355, SNOWC], ['box', 0.15, 0.17, 0.05, 0.13, 0.07, -0.355, SNOWC]], MAT.solid, false);
    lids.visible = false;
    const head = pivot(0, 2.08, 0, ball, face, lids);
    const twig = (s) => mesh([['box', 0.06, 0.85, 0.06, 0, -0.42, 0, TWIG], ['box', 0.04, 0.22, 0.04, s * 0.06, -0.78, 0, TWIG, 0, 0, s * 0.6],
        ['box', 0.04, 0.2, 0.04, -s * 0.05, -0.82, 0, TWIG, 0, 0, -s * 0.5], ['box', 0.035, 0.2, 0.035, 0, -0.92, 0, TWIG]], MAT.solid, false);
    const armL = pivot(-0.45, 1.5, 0, twig(-1)), armR = pivot(0.45, 1.5, 0, twig(1));
    armL.rotation.z = -1.2; armR.rotation.z = 1.2; // (out to the sides, a little down: friendly)
    g.add(base, mid, head, armL, armR);
    g.userData = { base, mid, head, face, lids, armL, armR, scarf };
    return g;
}

/** The puddle a melted snowman leaves (a flat disc of melt-water; IceQueen scales and fades it). */
export function puddleModel() {
    const m = new THREE.Mesh(merged([['cyl', 1, 0.04, 1, 0, 0.02, 0, 0xa9d6ef], ['ball', 0.12, 0.08, 0.1, 0.08, 0.06, -0.05, COAL], ['cone', 0.07, 0.22, 0.07, -0.15, 0.05, 0.1, CARROT, Math.PI / 2, 0.6, 0]]), MAT.ice);
    return m;
}

// ================================================================== the ice monsters
const ICEB = 0xa8ddf7, ICEB2 = 0x86c8ee, ICEB3 = 0xcdeffd, CRACK = 0xe9fbff;
const CHAIN = 0x9fc3d6; // (frosted chain links: the chandelier hangs by them)
/**
 * An ice monster (unit height ~4.65, the creature is scaled ×2): hunched, all of ice — a great
 * leaning chest, a hump of jagged spikes, a small head low in front with glowing eyes, long arms
 * with huge fists, short thick legs; glowing cracks run over it. See-through.
 * userData: {torso, armL, armR, legL, legR, head}
 */
export function iceMonsterModel() {
    const g = new THREE.Group();
    const legs = (s) => mesh([['box', 0.62, 1.4, 0.7, 0, -0.7, 0, ICEB2], ['box', 0.78, 0.3, 0.95, 0, -1.3, -0.12, ICEB]], MAT.ice);
    const legL = pivot(-0.5, 1.45, 0, legs(-1)), legR = pivot(0.5, 1.45, 0, legs(1));
    g.add(legL, legR);
    // the torso leans forward (the hunch): built upright, tipped as a whole
    const B = [['box', 1.7, 1.2, 1.2, 0, 0.6, 0, ICEB], ['box', 2.1, 1.3, 1.45, 0, 1.75, 0.05, ICEB3], ['box', 1.6, 0.9, 1.3, 0, 2.6, 0.25, ICEB],
        ['box', 1.2, 0.8, 0.9, 0, 2.9, 0.75, ICEB2, 0.4, 0, 0]];
    for (let i = 0; i < 7; i++) B.push(['cone', 0.32, 0.6 + (i % 3) * 0.25, 0.32, (i - 3) * 0.24, 3.25 - Math.abs(i - 3) * 0.12, 0.7 + (i % 2) * 0.2, ICEB3, -0.5, 0, (i - 3) * 0.15]);
    const cracks = [];
    for (let i = 0; i < 9; i++) cracks.push(['box', 0.05, 0.5 + (i % 3) * 0.2, 0.02, -0.7 + i * 0.17, 0.8 + (i % 4) * 0.5, -0.74, CRACK, 0, 0, (i % 2 ? 0.6 : -0.5)]);
    const torso = pivot(0, 1.45, 0, mesh(B, MAT.ice), mesh(cracks, MAT.glow, false));
    torso.rotation.x = -0.5; // (hunched forward: −Z is its front)
    g.add(torso);
    const H = [['box', 0.8, 0.7, 0.8, 0, 0, 0, ICEB3], ['box', 0.9, 0.22, 0.5, 0, -0.32, -0.25, ICEB2]];
    for (const s of [-1, 1]) H.push(['cone', 0.14, 0.4, 0.14, s * 0.32, 0.4, 0.1, ICEB3, 0.3, 0, s * 0.4]);
    const eyes = mesh([['box', 0.16, 0.08, 0.03, -0.18, 0.08, -0.41, 0x7ff6ff], ['box', 0.16, 0.08, 0.03, 0.18, 0.08, -0.41, 0x7ff6ff]], MAT.glow, false);
    const head = pivot(0, 2.7, 0.15, mesh(H, MAT.ice), eyes);
    torso.add(head);
    const arm = () => mesh([['box', 0.55, 1.3, 0.55, 0, -0.6, 0, ICEB2], ['box', 0.48, 1.2, 0.48, 0, -1.8, 0, ICEB], ['box', 0.95, 0.85, 0.95, 0, -2.7, 0, ICEB3],
        ['cone', 0.18, 0.35, 0.18, 0, -3.2, -0.3, ICEB3, Math.PI, 0, 0]], MAT.ice);
    const armL = pivot(-1.25, 2.2, 0, arm()), armR = pivot(1.25, 2.2, 0, arm());
    torso.add(armL, armR);
    g.userData = { torso, armL, armR, legL, legR, head };
    return g;
}

// ================================================================== things
/**
 * The ice chandelier hanging in the throne hall: rings of icicles round glowing crystals, four short
 * chains from its top ring up to one iron-hard ice hub (local y = CHANDELIER_HUB) — the long chain from
 * the hub to the hook in the vault is its own model (iceChainModel), as long as the hall is high.
 */
export const CHANDELIER_HUB = 2.6;
export const CHANDELIER_LOW = 3.6; // m: its lowest point (the big crystal) under its origin
export function chandelierModel() {
    const L = [], G = [];
    for (const [r, y, n] of [[3.2, 0, 18], [2.2, -1.1, 12], [1.2, -2.0, 8]]) {
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            L.push(['cone', 0.22, 1.1 + (i % 3) * 0.4, 0.22, Math.cos(a) * r, y - 0.6, Math.sin(a) * r, ICEB3, Math.PI, 0, 0]);
            if (i % 2 === 0) G.push(['oct', 0.3, 0.45, 0.3, Math.cos(a) * r, y + 0.1, Math.sin(a) * r, ROD_GLOW]);
        }
        for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; L.push(['box', r * 0.27, 0.12, 0.12, Math.cos(a) * r, y + 0.25, Math.sin(a) * r, ICEB, 0, -a + Math.PI / 2, 0]); }
    }
    G.push(['oct', 0.9, 1.6, 0.9, 0, -2.8, 0, ROD_GLOW]);
    // four chains from the top ring up to the hub, and the hub (a ring the long chain is hooked into)
    const C = [];
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const x0 = Math.cos(a) * 3.1, z0 = Math.sin(a) * 3.1, y0 = 0.3;
        _n.set(-x0, CHANDELIER_HUB - y0, -z0);
        const len = _n.length();
        _q.setFromUnitVectors(_p.set(0, 1, 0), _n.normalize());
        _e.setFromQuaternion(_q);
        const n = Math.round(len / 0.3);
        for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            C.push(['ring', 0.2, 0.34, 0.2, x0 * (1 - t), y0 + (CHANDELIER_HUB - y0) * t, z0 * (1 - t), CHAIN, _e.x, _e.y + (k % 2) * Math.PI / 2, _e.z]);
        }
    }
    C.push(['ring', 0.6, 0.6, 0.6, 0, CHANDELIER_HUB, 0, CHAIN, Math.PI / 2, 0, 0], ['box', 0.5, 0.3, 0.5, 0, CHANDELIER_HUB - 0.2, 0, CHAIN]);
    const g = new THREE.Group();
    g.add(mesh(L, MAT.ice, false), mesh(G, MAT.glow, false), mesh(C, MAT.solid, false));
    return g;
}

/**
 * The chandelier's chain: from its hook in the vault (the origin: a frosted plate with a hook, on the
 * block's underside) down `len` m to the hub. Cached by its number of links (one chandelier per world).
 */
export function iceChainModel(len) {
    const n = Math.max(2, Math.round(len / 0.3));
    const C = [['box', 1.1, 0.18, 1.1, 0, -0.09, 0, CHAIN], ['cone', 0.35, 0.35, 0.35, 0, -0.32, 0, CHAIN, Math.PI, 0, 0]];
    for (let k = 0; k < n; k++) C.push(['ring', 0.2, 0.34, 0.2, 0, -0.45 - (k + 0.5) * (len - 0.45) / n, 0, CHAIN, 0, (k % 2) * Math.PI / 2, 0]);
    return mesh(C, MAT.solid, false);
}

/** A thrown snowflake (a snowman's, the queen's shards): a white snowball with a six-armed flake round it. */
export function snowflakeShotModel() {
    const L = [['ball', 0.32, 0.32, 0.32, 0, 0, 0, 0xffffff]];
    for (let k = 0; k < 3; k++) L.push(['box', 0.62, 0.05, 0.05, 0, 0, 0, 0xe4f6ff, 0, 0, (k / 3) * Math.PI]);
    return new THREE.Mesh(merged(L), MAT.glow);
}

/** An ice shard (the queen's «ледяные осколки»). */
export function shardModel() { return new THREE.Mesh(merged([['oct', 0.16, 0.7, 0.16, 0, 0, 0, ROD_GLOW, Math.PI / 2, 0, 0]]), MAT.glow); }

/** An ice spike out of the ground (the queen's spell), 1 m base, 1 tall — scaled by its height. */
export function iceSpikeModel() { const m = new THREE.Mesh(merged([['cone', 1, 1, 1, 0, 0.5, 0, ICEB3]]), MAT.ice); m.castShadow = true; return m; }

/** One of everything, for compiling the shaders while loading (Game.prewarm). */
export function sampleIceModels() {
    const hurt = snowmanModel();
    hurt.traverse((o) => { if (o.isMesh && o.material === MAT.solid) o.material = MAT.hit; }); // (the red flash of a hurt one)
    return [iceQueenModel(), snowmanModel(), hurt, friendSnowmanModel(), puddleModel(), iceMonsterModel(), chandelierModel(), iceChainModel(4), snowflakeShotModel(), shardModel(), iceSpikeModel(), iceRodModel(), bladeModel()];
}
