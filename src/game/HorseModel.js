/**
 * HorseModel.js — the horse and the Pegasus (the author 07.11: «переработай коней — обычного и пегаса» in the style of the gate,
 * docs/rules/texture-style.md): a real coat (a hair picture per coat: short hairs, mottling, dapples, a dark dorsal stripe on a dun),
 * muscles (shoulder, haunch, barrel, a hollow flank — as shading AND as shape), white markings (a star, a blaze, a snip, socks),
 * a mane and a tail of single locks, a forelock, feathering on the fetlocks, hooves with a coronet band and ridges, a living eye (iris,
 * a horizontal pupil, a glint, an eyelid rim), flared nostrils, pricked ears with a dark inside, and for the Pegasus a wing of
 * layered feathers (PegasusWing.js) instead of a pipe with a white board.
 *
 * Everything is built once and shared (shapes — `cached`, materials — here); a horse is a handful of meshes. The model faces −Z,
 * feet at y = 0, the named parts of AnimalModels.js (body, neck, head, tail, legs, saddle, wings).
 * (No top-level use of MODEL_KIT: AnimalModels.js and this file import each other.)
 */
import * as THREE from 'three';
import { MODEL_KIT, hideTexture } from './AnimalModels.js';
import { pegasusWingGeo, pegasusWingMat } from './PegasusWing.js';

// (no black: the only black horse in the world is the Pegasus)
export const HORSE_COLORS = [0x4a3022, 0x33241a, 0x5e3a26, 0x7d7a75, 0xb3aea4, 0x8c7756];

/**
 * The coats of ordinary horses (by the colour in HORSE_COLORS): mane, lower legs («points»), mottling, dapples, markings
 * (mark: 'star' | 'blaze' | 'snip'; socks: which legs are white — front right, front left, hind right, hind left), a dorsal stripe.
 */
export const HORSE_LOOKS = [
    { name: 'dark bay', mane: 0x140e0b, legs: 0x18110e, mottle: 0.13, warm: 0.07, spots: 0, hairs: 11000, pale: 0.5, mark: 'star' },
    { name: 'seal brown', mane: 0x0f0b09, legs: 0x120d0a, mottle: 0.11, warm: 0.05, spots: 0, hairs: 11000, pale: 0.45, mark: 'snip' },
    { name: 'chestnut', mane: 0x7b4f2c, legs: null, mottle: 0.14, warm: 0.09, spots: 0, hairs: 11000, pale: 0.55, mark: 'blaze', socks: [false, false, true, true] },
    { name: 'dapple grey', mane: 0x58565a, legs: 0x4b4a4d, mottle: 0.13, warm: 0.02, spots: 80, spotR: [0.012, 0.026], spotC: [0.78, 0.78, 0.81], hairs: 11000, pale: 0.6, mark: null },
    { name: 'light grey', mane: 0x8f8c86, legs: 0x8f8c86, mottle: 0.1, warm: 0.02, spots: 28, spotR: [0.01, 0.022], spotC: [0.86, 0.86, 0.88], hairs: 11000, pale: 0.7, mark: null },
    { name: 'dun', mane: 0x2b2118, legs: 0x2f251b, mottle: 0.12, warm: 0.06, spots: 0, hairs: 11000, pale: 0.55, mark: null, dorsal: true },
];

/**
 * The Pegasus (one in some herds — Animals.js): a horse with great feathered wings, every one in his own coat — white,
 * dapple grey, bay, chestnut, golden, and rarely a matte black with a soft sheen. The coat is a hair picture (short hairs,
 * mottling, dapples) times the tint; mane, tail, feathers and a faint glow of the feathers go with the coat.
 * `color` of the animal: 0xFE0000 + the coat's number (0xFE0005, matte black, is also the name `PEGASUS_COLOR`).
 */
export const PEGASUS_COATS = [
    { name: 'white', w: 5, tint: 0xf1eee7, mane: 0xd9d7d1, feather: 0xf7f4ee, glow: 0xfff3d6, legs: null, mottle: 0.07, warm: 0.03, spots: 0, hairs: 11000, pale: 0.7 },
    { name: 'dapple grey', w: 5, tint: 0xa6aab0, mane: 0x61656c, feather: 0xc6cad0, glow: 0xdfe8ff, legs: 0x54575d, mottle: 0.12, warm: 0.02, spots: 90, spotR: [0.012, 0.026], spotC: [0.74, 0.75, 0.78], hairs: 11000, pale: 0.55 },
    { name: 'bay', w: 4, tint: 0x7d4a2a, mane: 0x16100d, feather: 0x4a3023, glow: 0, legs: 0x1b1310, mottle: 0.12, warm: 0.07, spots: 0, hairs: 11000, pale: 0.5 },
    { name: 'chestnut', w: 4, tint: 0x93502a, mane: 0x5c2c14, feather: 0x9a5632, glow: 0xffc27a, legs: null, mottle: 0.13, warm: 0.08, spots: 0, hairs: 11000, pale: 0.5 },
    { name: 'golden', w: 3, tint: 0xd8b068, mane: 0xf3ead2, feather: 0xf2e2b4, glow: 0xffe39a, legs: null, mottle: 0.1, warm: 0.06, spots: 0, hairs: 11000, pale: 0.65 },
    { name: 'black', w: 1, tint: 0x4a4744, mane: 0x15141a, feather: 0x34323a, glow: 0, legs: null, mottle: 0.1, warm: 0.02, spots: 0, hairs: 12000, pale: 0.8 }, // (matte: pale hairs catch the light)
];
const PEG_BASE = 0xFE0000;
export const PEGASUS_COLOR = PEG_BASE + 5;
const _OLD_PEGASUS = 0x0b0a0c; // (older saves: the one black Pegasus)
/** Is this horse colour a Pegasus' coat? */
export const isPegasusColor = (c) => c === _OLD_PEGASUS || (c >= PEG_BASE && c < PEG_BASE + PEGASUS_COATS.length);
/** The number of the coat (older saves' black one: matte black). */
export const pegasusCoat = (c) => (c === _OLD_PEGASUS ? 5 : c - PEG_BASE);
/** A coat by chance (rnd 0…1): common ones often, the black one rarely. */
export function randomPegasusColor(rnd = Math.random()) {
    const total = PEGASUS_COATS.reduce((a, k) => a + k.w, 0);
    let x = rnd * total;
    for (let i = 0; i < PEGASUS_COATS.length; i++) { x -= PEGASUS_COATS[i].w; if (x < 0) return PEG_BASE + i; }
    return PEG_BASE;
}

// ------------------------------------------------------------------ the coat of one horse
/** One coat's whole description (the same for every horse of the colour): picture, mane, points, markings. */
function coatOf(c) {
    const peg = isPegasusColor(c);
    if (peg) {
        const i = pegasusCoat(c), C = PEGASUS_COATS[i];
        return { ...C, peg: true, tint: C.tint, id: 'G', texKey: 'pegasus' + i, matKey: 'pegasus' + i, seed: 7001 + i * 104729, mark: null, socks: null, dorsal: false, i };
    }
    const i = HORSE_COLORS.indexOf(c);
    const base = new THREE.Color(c), lum = base.getHSL({}).l;
    if (i >= 0) return { ...HORSE_LOOKS[i], peg: false, tint: c, id: 'L' + i, texKey: 'horse' + i, matKey: 'horse' + i, seed: 9100 + i * 7919, i };
    // (any other colour — an old save, a creation: a plain coat of that colour, no markings)
    return {
        peg: false, tint: c, id: 'G', texKey: 'horseG', matKey: 'horseG' + c, seed: 9001, i: -1, mark: null, socks: null, dorsal: false,
        mane: base.clone().multiplyScalar(lum > 0.6 ? 0.72 : 0.42).getHex(),
        legs: lum < 0.45 ? base.clone().multiplyScalar(0.42).getHex() : base.clone().multiplyScalar(0.8).getHex(),
        mottle: 0.12, warm: 0.06, spots: 0, hairs: 11000, pale: 0.5,
    };
}
const _mats = new Map();
const picture = (K, color, texKey, k, seed) => {
    const key = k + ':' + color;
    if (!_mats.has(key)) _mats.set(key, new THREE.MeshLambertMaterial({ color, vertexColors: true, map: hideTexture(texKey, K, seed) }));
    return _mats.get(key);
};
/** The hair picture's parameters of a coat (short hairs along the body: a 512 × 256 picture, a hair is 3…7 px). */
const hideOf = (C) => ({
    tint: C.tint, mottle: C.mottle * 0.8, warm: C.warm * 0.6, spots: C.spots || 0, spotR: C.spotR, spotC: C.spotC || [1, 1, 1], hairs: C.hairs, pale: C.pale,
    hairLen: [3, 7], W: 512, H: 256, pores: 3500,
});

// ------------------------------------------------------------------ small helpers
const gauss = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** A white patch's multipliers on a coat of this tint (vertex colours may go above 1: a white blaze on a dark bay). */
const whiteOn = (tint, k) => {
    const c = new THREE.Color(tint);
    return [1 + (Math.min(7, 0.78 / Math.max(0.04, c.r)) - 1) * k, 1 + (Math.min(7, 0.76 / Math.max(0.04, c.g)) - 1) * k, 1 + (Math.min(7, 0.72 / Math.max(0.04, c.b)) - 1) * k];
};

/** Ellipsoids with their own colours in ONE shape (eyes, nostrils, the inside of the ears…): cached by the key. */
function detailGeo(key, list) {
    const { cached } = MODEL_KIT;
    return cached(key, () => {
        const pos = [], nor = [], col = [], idx = [];
        const unit = new THREE.SphereGeometry(1, 9, 7);
        const P = unit.getAttribute('position'), N = unit.getAttribute('normal'), I = unit.index;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
        for (const d of list) {
            e.set(d.rot?.[0] || 0, d.rot?.[1] || 0, d.rot?.[2] || 0);
            q.setFromEuler(e);
            m.compose(new THREE.Vector3(...d.at), q, new THREE.Vector3(...d.r));
            nm.getNormalMatrix(m);
            const base = pos.length / 3;
            for (let i = 0; i < P.count; i++) {
                v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
                v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
                col.push(d.col[0], d.col[1], d.col[2]);
            }
            for (let i = 0; i < I.count; i++) idx.push(base + I.getX(i));
        }
        unit.dispose();
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeBoundingSphere();
        return g;
    });
}

/** The details of the face, in the head's own space (+X = the right side): both eyes, nostrils, the mouth, the inside of the ears. */
function faceDetails() {
    const list = [];
    for (const s of [1, -1]) {
        // the eye: a dark iris, a horizontal pupil, a glint, a rim of the eyelid above and below (on the head's side, a third of the way up)
        list.push({ at: [0.121 * s, 0.03, -0.04], r: [0.011, 0.027, 0.033], col: [0.2, 0.11, 0.06] });
        list.push({ at: [0.128 * s, 0.03, -0.04], r: [0.008, 0.012, 0.025], col: [0.02, 0.015, 0.015] });
        list.push({ at: [0.133 * s, 0.043, -0.052], r: [0.004, 0.006, 0.008], col: [1.8, 1.8, 1.7] });
        list.push({ at: [0.119 * s, 0.056, -0.04], r: [0.007, 0.005, 0.036], col: [0.13, 0.09, 0.07], rot: [0.05, 0, -0.25 * s] });
        list.push({ at: [0.116 * s, 0.003, -0.04], r: [0.005, 0.005, 0.03], col: [0.2, 0.15, 0.12], rot: [-0.05, 0, 0.25 * s] });
        // the nostril: a dark flared slot with a pink inside
        list.push({ at: [0.05 * s, 0.014, -0.652], r: [0.017, 0.03, 0.019], col: [0.12, 0.07, 0.07], rot: [0, 0, 0.3 * s] });
        list.push({ at: [0.05 * s, 0.014, -0.664], r: [0.009, 0.018, 0.01], col: [0.5, 0.22, 0.22], rot: [0, 0, 0.3 * s] });
        // the lip's line
        list.push({ at: [0.074 * s, -0.055, -0.58], r: [0.004, 0.006, 0.075], col: [0.1, 0.07, 0.06], rot: [-0.04, 0, 0] });
        // the inside of the ear: dark, a little forward
        list.push({ at: [0.066 * s, 0.176, 0.108], r: [0.011, 0.068, 0.014], col: [0.3, 0.2, 0.18], rot: [0.75, 0, -0.18 * s] });
    }
    return detailGeo('horseFace', list);
}

// ------------------------------------------------------------------ the horse
export function horseModel(color) {
    const { sweep, keys, v3, mesh, blob, group, leg, finish, cached, lam, lamV, mix, smooth } = MODEL_KIT;
    const c = color ?? HORSE_COLORS[0];
    const C = coatOf(c);
    const pegasus = C.peg;
    const K = C.id; // (the shapes that differ by coat — markings, socks, the dorsal stripe: «L0»…; all the others share «G»)
    const hair = C.mane;
    const L = hideOf(C);
    const skin = picture(L, C.tint, C.texKey, C.matKey, C.seed);
    const points = C.legs ? picture(L, C.legs, C.texKey, 'P' + C.matKey, C.seed) : skin; // (the lower legs: black on a bay)
    const hairMat = lamV(hair);
    const g = new THREE.Group();
    g.name = pegasus ? 'pegasus' : 'horse';
    g.userData.mergeKey = 'horse' + K;
    const legs = [];

    // ---- trunk: rump (+Z) → chest (−Z); top / bottom line and half-width keyed along it
    const bodyBump = (t, ang) => {
        const side = Math.cos(ang) ** 2, top = Math.max(0, Math.sin(ang)), bot = Math.max(0, -Math.sin(ang));
        return 1 + 0.06 * gauss(t, 0.15, 0.07) * side + 0.035 * gauss(t, 0.12, 0.08) * top // the haunch, the croup
            + 0.02 * gauss(t, 0.55, 0.12) * side * (1 - bot) // the barrel's ribs
            + 0.05 * gauss(t, 0.8, 0.07) * side + 0.03 * gauss(t, 0.78, 0.05) * top // the shoulder, the withers
            - 0.055 * gauss(t, 0.33, 0.06) * bot // the flank's hollow
            + 0.04 * gauss(t, 0.955, 0.04) * (side + bot) // the breast
            - 0.025 * gauss(t, 0.5, 0.2) * top * Math.cos(ang) ** 2; // the back's slight furrow
    };
    const belly = (t, ang) => mix([0.9, 0.9, 0.9], [1.04, 1.04, 1.04], smooth(-0.6, 0.5, Math.sin(ang)));
    const body = mesh(g, cached('horseBody3' + (C.dorsal ? K : ''), () => {
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
        return sweep([v3(0, 0, 0.98), v3(0, 0, -0.95)], (t) => { const [top, bot, w] = k(t); return [w, (top - bot) / 2, (top + bot) / 2]; }, {
            rings: 40, sides: 22, uv: [1, 1], bump: bodyBump,
            color: (t, ang) => {
                const b = belly(t, ang), m = 1 + (bodyBump(t, ang) - 1) * 1.7; // (lit muscles, shaded hollows)
                const stripe = C.dorsal ? 1 - 0.3 * gauss(ang, Math.PI / 2, 0.2) * smooth(0.0, 0.08, t) * smooth(1.0, 0.86, t) : 1; // (a dun's dark stripe along the spine)
                return [b[0] * m * stripe, b[1] * m * stripe, b[2] * m * stripe];
            },
        });
    }), skin);

    // ---- neck: from the withers up and forward to the poll, a crest on top
    // (the neck turns at its root on the withers: lowering it to graze keeps it on the body)
    const neck = group(g, 'neck', 0, 1.56, -0.56);
    const neckPath = [v3(0, 0, 0), v3(0, 0.42, -0.34), v3(0, 0.78, -0.51), v3(0, 0.94, -0.54)];
    const neckRows = [[0, 0.24, 0.34, 0], [0.35, 0.16, 0.24, 0.02], [0.75, 0.105, 0.16, 0.015], [1, 0.095, 0.12, 0]];
    const neckK = keys(neckRows);
    const neckBump = (t, ang) => 1 + 0.06 * gauss(t, 0.2, 0.2) * Math.cos(ang) ** 2 - 0.05 * gauss(t, 0.55, 0.2) * Math.max(0, -Math.sin(ang)) + 0.03 * gauss(t, 0.1, 0.12) * Math.max(0, Math.sin(ang));
    mesh(neck, cached('horseNeck3', () => sweep(neckPath, neckK, {
        rings: 18, sides: 14, uv: [0.4, 0.6], bump: neckBump,
        color: (t, ang) => { const b = belly(t, ang), m = 1 + (neckBump(t, ang) - 1) * 1.6; return [b[0] * m, b[1] * m, b[2] * m]; },
    })), skin);
    // the mane: a ridge along the crest and single locks falling on the right side, longest over the withers
    const crest = (t) => {
        const cu = new THREE.CatmullRomCurve3(neckPath, false, 'centripetal');
        const P = cu.getPointAt(t), T = cu.getTangentAt(t);
        const U = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), T).normalize();
        const [rx, ry, dy] = neckK(t);
        return { P, U, rx, ry, dy };
    };
    mesh(neck, cached('horseMane3', () => sweep(neckPath, (t) => { const [, ry, dy] = neckK(t); const h = 0.05 + 0.035 * Math.sin(Math.PI * Math.min(1, t * 1.1)); return [0.05 * (1 - 0.3 * t), h, dy + ry - h * 0.15]; }, { rings: 14, sides: 6 })), hairMat);
    const LOCKS = 30;
    const lockR = MODEL_KIT.rng(5150);
    for (let i = 0; i < LOCKS; i++) {
        const t = 0.02 + (i / (LOCKS - 1)) * 0.95, sway = lockR() - 0.5, tone = 0.82 + lockR() * 0.3, len = (0.4 - 0.2 * t) * (0.6 + lockR() * 0.75) * (0.55 + 0.45 * smooth(0.0, 0.2, t)), wid = 0.026 + lockR() * 0.02;
        mesh(neck, cached('horseLock' + i, () => {
            const { P, U, rx, ry, dy } = crest(t);
            const top = P.clone().addScaledVector(U, dy + ry * 0.9);
            const at = (f) => P.clone().addScaledVector(U, dy + ry * f).addScaledVector(v3(1, 0, 0), rx * Math.sqrt(Math.max(0, 1 - f * f)));
            const a = top.clone().addScaledVector(U, 0.04).add(v3(0.015, 0, 0));
            const b = at(0.55).add(v3(0.03, 0, 0));
            const cc = at(0.05).add(v3(0.04 + 0.025 * sway, -len * 0.5, 0.012));
            const d = cc.clone().add(v3(0.035 + 0.04 * sway, -len * 0.5, 0.03));
            return sweep([top, a, b, cc, d], keys([[0, wid * 0.8, 0.014], [0.3, wid, 0.016], [0.7, wid * 0.85, 0.012], [1, 0.006, 0.005]]), {
                rings: 10, sides: 5, color: (u) => { const m = tone * (0.74 + 0.28 * u); return [m, m * 0.99, m * 0.97]; },
            });
        }), hairMat);
    }

    // ---- head: hangs from the poll nose-down; a deep jowl, a long narrow face, a soft muzzle
    const head = group(neck, 'head', 0, 0.92, -0.56);
    head.rotation.x = -1.0;
    const headBump = (t, ang) => {
        const side = Math.cos(ang) ** 2, top = Math.max(0, Math.sin(ang)), bot = Math.max(0, -Math.sin(ang));
        return 1 + 0.08 * gauss(t, 0.2, 0.09) * side + 0.07 * gauss(t, 0.14, 0.07) * bot // the cheek, the jaw's edge
            - 0.045 * gauss(t, 0.45, 0.14) * top // the dip of the nose between the eyes and the muzzle
            + 0.05 * gauss(t, 0.93, 0.04) * side - 0.08 * gauss(t, 0.95, 0.025) * bot; // the nostrils' flare, the chin's groove
    };
    const mark = C.mark, white = whiteOn(C.tint, 1);
    const markAt = (t, ang) => {
        // (the white of the face on the top of the head: a star between the eyes, a blaze down the nose, a snip on the muzzle)
        const a = Math.abs(ang - Math.PI / 2), up = a < 1.4 ? 1 : 0;
        let w = 0;
        if (mark === 'blaze') w = smooth(0.1, 0.2, t) * smooth(1.0, 0.9, t) * smooth(0.4, 0.22, a) * (0.9 + 0.1 * Math.sin(t * 20));
        else if (mark === 'star') w = gauss(t, 0.22, 0.05) * gauss(a, 0, 0.3);
        else if (mark === 'snip') w = smooth(0.82, 0.9, t) * smooth(0.3, 0.12, a);
        return w * up;
    };
    mesh(head, cached('horseHead3' + (mark ? K : ''), () => sweep([v3(0, 0, 0.1), v3(0, -0.02, -0.25), v3(0, 0, -0.66)], keys([
        [0.00, 0.06, 0.07, -0.01],
        [0.07, 0.11, 0.13, -0.02],
        [0.16, 0.13, 0.16, -0.04],
        [0.32, 0.12, 0.14, -0.03],
        [0.60, 0.085, 0.105, 0],
        [0.84, 0.08, 0.1, 0],
        [0.94, 0.09, 0.105, -0.01],
        [1.00, 0.05, 0.06, -0.01],
    ]), {
        rings: 26, sides: 14, uv: [0.3, 0.4], bump: headBump,
        color: (t, ang) => {
            const m0 = (1 - 0.4 * smooth(0.82, 0.95, t)) * (1 + (headBump(t, ang) - 1) * 1.5); // (the muzzle is darker; lit bones)
            const w = mark ? markAt(t, ang) : 0;
            return [m0 * (1 + (white[0] - 1) * w), m0 * 0.98 * (1 + (white[1] - 1) * w), m0 * 0.96 * (1 + (white[2] - 1) * w)];
        },
    })), skin);
    // ears, pricked up and a little forward (a folded cone, a dark tip)
    for (const s of [1, -1]) {
        const ear = mesh(head, cached('horseEar3', () => sweep([v3(0, 0, 0), v3(0, 0.1, 0.012), v3(0, 0.19, -0.012)], keys([[0, 0.048, 0.03, 0], [0.4, 0.043, 0.026, 0.002], [0.85, 0.02, 0.016, 0], [1, 0.004, 0.006, 0]]), {
            rings: 7, sides: 7, uv: [0.1, 0.1], color: (t) => { const m = 1 - 0.55 * smooth(0.72, 0.98, t); return [m, m, m]; },
        })), skin, 0.066 * s, 0.1, 0.05);
        ear.rotation.set(0.75, 0, -0.18 * s);
        ear.scale.set(1, 1, 0.8);
    }
    mesh(head, faceDetails(), lamV(0xffffff), 0, 0, 0, false);
    // forelock: a few locks over the forehead
    for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.017, drop = 0.28 - Math.abs(i - 2) * 0.03;
        mesh(head, cached('horseForelock' + i, () => sweep([v3(x * 0.4, 0.125, 0.05), v3(x, 0.14, -0.06), v3(x * 1.5, 0.115, -0.16), v3(x * 1.8, 0.065, -drop)], keys([[0, 0.022, 0.012], [0.5, 0.019, 0.01], [1, 0.004, 0.004]]), {
            rings: 7, sides: 5, color: (u) => { const m = 0.76 + 0.26 * u; return [m, m, m]; },
        })), hairMat, 0, 0, 0, false);
    }

    // ---- tail: from the top of the rump, arched out, the hair falls to the hocks
    const tail = group(g, 'tail', 0, 1.8, 0.93);
    // (the dock, then hair: many thin locks that start at the top of the dock, fan out a little and end at different lengths —
    // one smooth paddle looked like rubber, and a bare pipe looked like a pump handle)
    mesh(tail, cached('horseTailDock2', () => sweep([v3(0, 0, -0.04), v3(0, 0.02, 0.14), v3(0, -0.1, 0.24)], keys([
        [0, 0.04, 0.045], [0.5, 0.045, 0.05], [1, 0.035, 0.04],
    ]), { rings: 6, sides: 7 })), hairMat);
    const tr = MODEL_KIT.rng(8801);
    for (let i = 0; i < 24; i++) {
        const sx = (tr() - 0.5) * 0.13, sz = (tr() - 0.5) * 0.1, len = 0.74 + tr() * 0.28, wave = (tr() - 0.5) * 0.1, tone = 0.82 + tr() * 0.3, wid = 0.034 + tr() * 0.014;
        mesh(tail, cached('horseTailLock2' + i, () => sweep([v3(sx * 0.2, 0.03, -0.01), v3(sx * 0.6, 0.06, 0.15), v3(sx * 1.4, -0.3 * len, 0.31 + sz), v3(sx * 2.2 + wave, -0.75 * len, 0.35 + sz * 1.6), v3(sx * 2.8 - wave * 0.6, -1.06 * len, 0.29 + sz * 2)], keys([
            [0, 0.03, 0.03], [0.25, wid, 0.03], [0.8, wid * 0.65, 0.02], [1, 0.006, 0.006],
        ]), { rings: 11, sides: 5, color: (u) => { const m = tone * (0.74 + 0.28 * u); return [m, m, m]; } })), hairMat);
    }

    // ---- legs: forearm → knee → cannon → fetlock → hoof in front; gaskin → hock behind
    const fUp = [[0, 0.1, 0.16], [0.18, 0.12, 0.15], [0.45, 0.095, 0.11], [0.75, 0.072, 0.085], [0.92, 0.08, 0.094], [1, 0.074, 0.085]];
    const hUp = [[0, 0.1, 0.2], [0.25, 0.12, 0.18], [0.55, 0.09, 0.12], [0.8, 0.068, 0.1], [0.94, 0.074, 0.108], [1, 0.068, 0.095]];
    const low = [[0, 0.072, 0.083], [0.06, 0.066, 0.076], [0.15, 0.052, 0.065], [0.62, 0.05, 0.062], [0.75, 0.068, 0.08], [0.88, 0.052, 0.06], [1, 0.07, 0.075]];
    const socks = C.socks || [false, false, false, false];
    let li = 0;
    for (const [x, z, front] of [[0.15, -0.6, true], [-0.15, -0.6, true], [0.15, 0.6, false], [-0.15, 0.6, false]]) {
        const sock = !!socks[li++];
        const name = (front ? 'front' : 'hind') + (x > 0 ? 'Right' : 'Left') + 'Leg';
        const wh = whiteOn(C.tint, 1);
        // (a white sock: from the fetlock up to the middle of the cannon, a ragged edge)
        const lo = sock ? (t, ang) => { const e = 0.46 + 0.07 * Math.sin(ang * 3 + 1), k = smooth(e - 0.05, e + 0.05, t); return [1 + (wh[0] - 1) * k, 1 + (wh[1] - 1) * k, 1 + (wh[2] - 1) * k]; } : null;
        const kk = (front ? 'horseF3' : 'horseH3') + (sock ? 's' : '');
        const pv = sock ? skin : points;
        const pivot = front
            ? leg(g, legs, name, x, 1.3, z, true, kk, [0, 0.6, fUp], [0, 0.7, low], null, skin, pv, { uv: [0.3, 0.5], lo, sides: 10, rings: 12, joint: false })
            : leg(g, legs, name, x, 1.3, z, false, kk, [0.13, 0.6, hUp], [-0.1, 0.7, low], null, skin, pv, { uv: [0.3, 0.5], lo, sides: 10, rings: 12, joint: false });
        const knee = pivot.userData.lower, lz = front ? 0 : -0.1;
        // the hoof: a flared wall with growth rings, a pale coronet band on top; a horn-coloured one on a sock
        const horn = sock ? 0xb9a98a : 0x2a2420;
        mesh(knee, cached('horseHoof3', () => sweep([v3(0, 0.012, 0), v3(0, -0.06, -0.026)], keys([[0, 0.066, 0.07, 0], [0.18, 0.072, 0.078, 0], [0.6, 0.084, 0.094, -0.004], [1, 0.094, 0.106, -0.012]]), {
            rings: 8, sides: 10,
            color: (t) => { const ring = 0.9 + 0.1 * Math.sin(t * 38), band = smooth(0.2, 0.0, t); return [ring * (1 + 0.9 * band), ring * (1 + 0.8 * band), ring * (1 + 0.7 * band)]; },
        })), lamV(horn), 0, -0.585, lz);
        // the fetlock's feathering: a little tuft of hair behind the joint, in the leg's colour
        mesh(knee, cached('horseTuft3', () => sweep([v3(0, 0.02, 0), v3(0, -0.04, 0.03), v3(0, -0.09, 0.052)], keys([[0, 0.032, 0.02], [0.5, 0.034, 0.024], [1, 0.006, 0.006]]), {
            rings: 6, sides: 6, color: (t) => { const m = 0.84 + 0.26 * t; return [m, m, m]; },
        })), pv, 0, -0.585, lz + 0.03, false);
    }

    // ---- saddle (shown while ridden): a blanket, the seat rising to the pommel and the cantle, the flaps
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

    g.userData.grazeHead = 1.0; // (the head swings forward again by this much as the neck goes down: the neck alone at −1.8 curled the head back INTO the chest — «голова пропадает»; the muzzle ends 0.15 m over the grass, in front of the forehooves)
    g.userData.grazePitch = -1.8; // (the long neck right down: the muzzle at the grass)
    let wings;
    if (pegasus) {
        // great feathered wings on the withers, folded along the sides (layered feathers: PegasusWing.js; each in the coat's colour)
        wings = [];
        for (const s of [1, -1]) {
            const w = group(g, s > 0 ? 'wingRight' : 'wingLeft', 0.3 * s, 1.93, -0.42);
            w.scale.set(1.7 * s, 1.7, 1.7);
            w.userData.side = s;
            const m = mesh(w, pegasusWingGeo(), pegasusWingMat(C.feather, C.glow));
            m.name = 'wing';
            w.userData.mesh = m;
            wings.push(w);
        }
    }
    return finish(g, { body, neck, head, tail, legs, saddle, wings, pegasus });
}
