/**
 * PigModel.js — a NEW pig, drawn in the gate's style (docs/rules/texture-style.md), NOT wired into the game yet (the author 08.11: «нарисуй новую свинью по этой
 * технологии, но в игру не впихивать, только скриншот»). `newPigModel(look)` has the same named parts and the same measures as AnimalModels.js' pig (the body
 * between y 0.36 and 1.05, the neck pivot at (0, 0.8, −0.5), the legs at ±0.2 / −0.33, +0.36, the tail at (0, 0.82, 0.57), folded feathered wings), so it can replace
 * it later by one line.
 *
 * What is different from the old pig (the old one was a smooth balloon on four sausages):
 *   - the form: a long wedge of a head with a dished forehead, heavy jowls and an up-turned snout DISC with a raised rim and two kidney-shaped nostrils; a back that
 *     arches a little over the loin; deep hams with a crease where they meet the belly; a shoulder; folds of skin behind the jowl and at the elbow; a sagging belly with
 *     TWO ROWS OF TEATS; a ridge of stiff bristles down the spine; a curled tail that tapers to a tuft;
 *   - the skin: pink skin showing through a sparse coat of coarse bristles (the hair picture of HorseModel's kind, with its own numbers), pores, mottling, dirt low on the
 *     body and the legs — every look has its own breed: a large white, a ginger Tamworth with dark ear tips, a spotted one, a black one with the white belt of a Hampshire;
 *   - the face: small deep-set eyes with pale lashes and a lid rim, ears that fold forward over the eyes with veins and a hairy edge, a lip line, tiny tusk-nubs;
 *   - the legs: cloven hooves (two toes and two dewclaws) with growth rings, pasterns darker than the thighs.
 * Built once and shared (shapes `cached`, materials here).
 */
import * as THREE from 'three';
import { MODEL_KIT, hideTexture } from './AnimalModels.js';

/** The four breeds (look 1…4 — the animal's `color`, as in AnimalModels.PIG_LOOKS). */
export const NEW_PIG_LOOKS = [
    { name: 'large white', tint: 0xf4c9c4, bristle: 0xf0e4d4, ear: 0xe9a9a8, snout: 0xd68f93, hoof: 0x4a3a34, mottle: 0.1, warm: 0.05, spots: 0, spotC: [0.7, 0.58, 0.56], hairs: 4200, pale: 0.8, feather: 0xf4efe6 },
    { name: 'tamworth', tint: 0xe8a07f, bristle: 0x6a2c16, ear: 0xc77a64, snout: 0xb87068, hoof: 0x3a2a24, mottle: 0.14, warm: 0.1, spots: 0, spotC: [0.7, 0.5, 0.4], hairs: 6200, pale: 0.25, feather: 0xe8d4b4, earTip: 0.5 },
    { name: 'spotted', tint: 0xf6d2cc, bristle: 0xeadfd2, ear: 0xe3a6a6, snout: 0xd2878c, hoof: 0x4a3a34, mottle: 0.09, warm: 0.04, spots: 7, spotR: [0.07, 0.15], spotC: [0.22, 0.2, 0.21], hairs: 4600, pale: 0.6, feather: 0xf2eee8 },
    { name: 'hampshire', tint: 0x4b3f3c, bristle: 0x1c1514, ear: 0x3b302e, snout: 0x4a3a3b, hoof: 0x201a18, mottle: 0.1, warm: 0.02, spots: 0, spotC: [0.7, 0.6, 0.6], hairs: 7000, pale: 0.12, feather: 0x4d4642, belt: true },
];
export const newPigLook = (c) => ((Math.abs(Math.round(c || 1)) - 1) % NEW_PIG_LOOKS.length + NEW_PIG_LOOKS.length) % NEW_PIG_LOOKS.length;

const gauss = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));

const _mats = new Map();
function skinMat(look, tint, key) {
    const k = key + look + ':' + tint;
    if (!_mats.has(k)) {
        const L = NEW_PIG_LOOKS[look];
        const pic = { tint: L.tint, mottle: L.mottle, warm: L.warm, spots: L.spots, spotR: L.spotR, spotC: L.spotC, hairs: L.hairs, pale: L.pale, hairLen: [2, 5], W: 512, H: 256, pores: 5200 };
        _mats.set(k, new THREE.MeshLambertMaterial({ color: tint, vertexColors: true, map: hideTexture('newpig' + look, pic, 9301 + look * 7919) }));
    }
    return _mats.get(k);
}

/** Dirt: the belly, the lower legs, splashes on the hams (a smooth pattern by the point — every pig of a breed alike in shape). */
const DIRT = [0.52, 0.4, 0.31];
const dirtAt = (p) => 0.5 + 0.5 * Math.sin(p.x * 27.1 + p.z * 19.3) * Math.sin(p.z * 23.7 - p.y * 15.1 + 0.6);

/** Ellipsoids with their own colours in ONE shape (eyes, nostrils, teats, tusk nubs…), cached by key. */
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

/** The face in the head's own space (+X = the right side; the snout is at −Z): eyes with lashes and lid rims, the snout disc's rim and nostrils, the lip, tusk nubs. */
function faceDetails(L) {
    const list = [];
    const snout = new THREE.Color(L.snout), sc = [snout.r * 1.05, snout.g * 1.05, snout.b * 1.05];
    const dark = L.hoof === 0x201a18; // (the black breed: a dark snout, dark lids)
    for (const s of [1, -1]) {
        // the eye: a lid rim (the skin, a little darker), a small dark eye, a glint, pale lashes above
        list.push({ at: [0.139 * s, 0.07, -0.15], r: [0.012, 0.033, 0.036], col: dark ? [0.9, 0.8, 0.8] : [0.82, 0.58, 0.56], rot: [0, 0, 0.1 * s] });
        list.push({ at: [0.146 * s, 0.07, -0.15], r: [0.008, 0.02, 0.022], col: [0.17, 0.09, 0.06] });
        list.push({ at: [0.15 * s, 0.077, -0.158], r: [0.003, 0.005, 0.006], col: [2.2, 2.1, 2.0] });
        for (let k = 0; k < 4; k++) list.push({ at: [0.14 * s, 0.098 + 0.002 * k, -0.15 + (k - 1.5) * 0.013], r: [0.004, 0.011, 0.0035], col: dark ? [0.9, 0.85, 0.82] : [1.05, 0.95, 0.88], rot: [0.2 * (k - 1.5), 0, 0.7 * s] });
        // the nostril: a kidney-shaped dark slot with a damp pink inside, on the face of the disc
        list.push({ at: [0.034 * s, -0.01, -0.434], r: [0.016, 0.026, 0.014], col: [0.1, 0.05, 0.06], rot: [0, 0, 0.35 * s] });
        list.push({ at: [0.034 * s, -0.01, -0.441], r: [0.009, 0.016, 0.008], col: [0.55, 0.25, 0.27], rot: [0, 0, 0.35 * s] });
        // tusk nubs: two small pale points at the corners of the mouth
        list.push({ at: [0.072 * s, -0.062, -0.35], r: [0.008, 0.012, 0.01], col: [1.4, 1.3, 1.15] });
        // the lip's line: a thin dark crease under the snout
        list.push({ at: [0.05 * s, -0.056, -0.39], r: [0.004, 0.005, 0.05], col: [0.35, 0.2, 0.2], rot: [0, -0.15 * s, 0] });
    }
    list.push({ at: [0, -0.03, -0.438], r: [0.03, 0.005, 0.006], col: [0.3, 0.16, 0.17] }); // (the groove between the nostrils)
    void sc;
    return detailGeo('newPigFace' + L.name, list);
}

/** Two rows of teats on the belly (body space; a sow's): small, a little darker than the skin. */
function teats() {
    const list = [];
    for (const s of [1, -1]) for (let i = 0; i < 6; i++) {
        const z = 0.3 - i * 0.115;
        list.push({ at: [0.085 * s, 0.355 + 0.012 * Math.sin(i * 1.3), z], r: [0.016, 0.016, 0.02], col: [0.82, 0.62, 0.62] });
    }
    return detailGeo('newPigTeats', list);
}

export function newPigModel(lookC) {
    const { sweep, keys, v3, mesh, blob, group, leg, finish, cached, lam, lamV, mix, smooth, pigWingGeo, wingMat } = MODEL_KIT;
    const look = newPigLook(lookC);
    const L = NEW_PIG_LOOKS[look];
    const skin = skinMat(look, L.tint, 's');
    const hairMat = lamV(L.bristle);
    const g = new THREE.Group();
    g.name = 'pig';
    g.userData.mergeKey = 'newpig' + look;
    const legs = [];
    const tintC = new THREE.Color(L.tint);
    const lum = tintC.getHSL({}).l;
    const back = lum < 0.4 ? [1.15, 1.12, 1.1] : [0.96, 0.86, 0.86]; // (a pink pig is darker on the back: the sun; a dark one is lighter on the belly side only)
    const shade = (ang) => mix([1, 1, 1], back, smooth(-0.6, 0.5, Math.sin(ang)));
    const BELT = !!L.belt;

    // ---- trunk: rump (+Z) → chest (−Z)
    const bodyBump = (t, ang) => {
        const side = Math.cos(ang) ** 2, top = Math.max(0, Math.sin(ang)), bot = Math.max(0, -Math.sin(ang));
        return 1 + 0.045 * gauss(t, 0.15, 0.08) * (side + 0.4 * top) // the hams
            + 0.03 * gauss(t, 0.74, 0.08) * side // the shoulder
            + 0.022 * gauss(t, 0.45, 0.14) * top // the arch of the loin
            - 0.05 * gauss(t, 0.31, 0.04) * bot // the crease between the ham and the belly
            + 0.05 * gauss(t, 0.5, 0.16) * bot // the sag of the belly
            - 0.03 * gauss(t, 0.885, 0.022) // the fold behind the jowl
            - 0.02 * gauss(t, 0.93, 0.02) - 0.022 * gauss(t, 0.69, 0.018) * bot // the fold at the elbow
            + 0.008 * Math.sin(t * 41 + ang * 3) * Math.sin(ang * 5 + t * 13) // the skin's slack
            - 0.03 * gauss(t, 0.55, 0.3) * top * Math.cos(ang) ** 2 * 0.0;
    };
    const body = mesh(g, cached('newPigBody', () => {
        const k = keys([
            [0.00, 0.85, 0.60, 0.13],
            [0.05, 0.98, 0.46, 0.30],
            [0.18, 1.04, 0.37, 0.385],
            [0.38, 1.06, 0.35, 0.37],
            [0.56, 1.06, 0.34, 0.37],
            [0.72, 1.05, 0.37, 0.385],
            [0.87, 1.0, 0.43, 0.34],
            [0.96, 0.92, 0.5, 0.25],
            [1.00, 0.85, 0.6, 0.12],
        ]);
        return sweep([v3(0, 0, 0.58), v3(0, 0, -0.56)], (t) => { const [top, bot, w] = k(t); return [w, (top - bot) / 2, (top + bot) / 2]; }, {
            rings: 46, sides: 24, uv: [1, 1], bump: bodyBump,
            color: (t, ang, p) => {
                const s = shade(ang);
                const m = 1 + (bodyBump(t, ang) - 1) * 1.6;
                let c = [s[0] * m, s[1] * m, s[2] * m];
                // dirt: the belly, the low flanks, splashes on the hams
                const low = smooth(0.62, 0.42, p.y), hams = smooth(0.2, 0.02, t) * smooth(0.8, 0.55, p.y);
                c = mix(c, DIRT, Math.min(0.7, (low * 0.7 + hams * 0.35) * dirtAt(p)));
                // the white belt of a Hampshire: a band over the shoulders and the forelegs, the edges ragged
                if (BELT) {
                    const edge = 0.025 * Math.sin(p.y * 40 + p.x * 17);
                    const band = smooth(0.58 + edge, 0.62 + edge, t) * smooth(0.9 + edge, 0.86 + edge, t);
                    c = mix(c, [3.6, 3.3, 3.2], band * 0.97);
                }
                return c;
            },
        });
    }), skin);

    // ---- the spine's bristles: a ridge of stiff hair from the withers back along the loin (longest over the shoulders)
    mesh(g, cached('newPigRidge' + look, () => sweep([v3(0, 1.04, -0.5), v3(0, 1.075, -0.3), v3(0, 1.085, 0), v3(0, 1.07, 0.3)], (t) => [0.012 + 0.012 * (1 - t), 0.018 + 0.03 * (1 - t) * (0.6 + 0.4 * Math.sin(t * 70) ** 2), 0.0], {
        rings: 36, sides: 5, color: (t) => { const m = 0.75 + 0.25 * Math.sin(t * 53) ** 2; return [m, m, m]; },
    })), hairMat);
    mesh(g, teats(), lamV(0xffffff), 0, 0, 0, false);

    // ---- neck pivot and head
    const neck = group(g, 'neck', 0, 0.8, -0.5);
    const head = group(neck, 'head', 0, 0.02, -0.02);
    head.rotation.x = -0.3;
    const headBump = (t, ang) => {
        const side = Math.cos(ang) ** 2, top = Math.max(0, Math.sin(ang)), bot = Math.max(0, -Math.sin(ang));
        return 1 + 0.1 * gauss(t, 0.2, 0.1) * (side + bot) // the jowl and the cheek
            + 0.02 * Math.sin(t * 46) * gauss(t, 0.25, 0.12) * top // the wrinkles of the forehead
            - 0.05 * gauss(t, 0.5, 0.12) * top // the dish of the face between the brow and the snout
            + 0.04 * gauss(t, 0.78, 0.1) * top // the snout's upward bend
            - 0.04 * gauss(t, 0.62, 0.1) * bot;
    };
    const snoutC = new THREE.Color(L.snout);
    mesh(head, cached('newPigHead' + look, () => sweep([v3(0, 0, 0.14), v3(0, -0.02, -0.17), v3(0, -0.015, -0.42)], keys([
        [0.00, 0.2, 0.2, -0.01],
        [0.16, 0.235, 0.235, -0.045],
        [0.42, 0.17, 0.17, -0.05],
        [0.68, 0.13, 0.12, -0.035],
        [0.9, 0.125, 0.112, -0.022],
        [1.00, 0.118, 0.104, -0.015],
    ]), {
        rings: 28, sides: 16, uv: [0.45, 0.6], bump: headBump,
        color: (t, ang, p) => {
            const s = shade(ang), m = 1 + (headBump(t, ang) - 1) * 1.7;
            let c = [s[0] * m, s[1] * m, s[2] * m];
            c = mix(c, [snoutC.r / Math.max(0.2, tintC.r) * 0.95, snoutC.g / Math.max(0.2, tintC.g) * 0.95, snoutC.b / Math.max(0.2, tintC.b) * 0.95], smooth(0.72, 0.95, t)); // (the snout is duller and darker than the skin)
            return mix(c, DIRT, 0.3 * smooth(0.8, 1, t) * smooth(0.0, -0.12, p.y) * dirtAt(p));
        },
    })), skin);
    // the snout's disc: a flat oval with a raised rim, the face of the nose
    const disc = mesh(head, cached('newPigDisc', () => {
        const geo = new THREE.SphereGeometry(1, 20, 12);
        geo.scale(1, 1, 0.5);
        return geo;
    }), lam(L.snout), 0, -0.012, -0.412);
    disc.scale.set(0.12, 0.104, 0.04);
    const rim = mesh(head, cached('newPigRim', () => new THREE.TorusGeometry(1, 0.1, 6, 22)), lam(new THREE.Color(L.snout).multiplyScalar(0.9).getHex()), 0, -0.012, -0.425, false);
    rim.scale.set(0.112, 0.096, 0.07);
    mesh(head, faceDetails(L), lamV(0xffffff), 0, 0, 0, false);
    // ears: big leaf-shaped flaps folded forward over the eyes, veined, a hairy edge, a dark tip on a Tamworth
    for (const s of [1, -1]) {
        const earMat = lamV(L.ear);
        const ear = mesh(head, cached('newPigEar' + look, () => sweep([v3(0, 0, 0), v3(0, 0.07, 0.01), v3(0, 0.13, -0.03), v3(0, 0.16, -0.1)], keys([
            [0, 0.05, 0.016, 0], [0.3, 0.098, 0.014, 0], [0.65, 0.085, 0.012, 0], [0.9, 0.04, 0.009, 0], [1, 0.006, 0.005, 0],
        ]), {
            rings: 12, sides: 12,
            color: (t, ang) => {
                const inside = smooth(0.2, -0.8, Math.sin(ang));
                const vein = 1 - 0.16 * Math.pow(Math.abs(Math.sin(ang * 5 + t * 3.2)), 10) * (0.4 + 0.6 * t);
                const tip = L.earTip ? 1 - L.earTip * smooth(0.72, 0.95, t) : 1;
                const edge = 1 + 0.1 * smooth(0.82, 1.0, Math.abs(Math.cos(ang)));
                const m = (1 - 0.2 * inside) * vein * tip * edge;
                return [m, m * (1 - 0.06 * inside), m * (1 - 0.04 * inside)];
            },
        })), earMat, 0.125 * s, 0.16, -0.01);
        ear.rotation.set(-1.7, 0.4 * s, -0.55 * s);
    }

    // ---- tail: a curl that tapers to a tuft
    const tail = group(g, 'tail', 0, 0.84, 0.575);
    mesh(tail, cached('newPigTail', () => {
        const pts = [];
        for (let i = 0; i <= 16; i++) {
            const a = (i / 16) * Math.PI * 3.3, r = 0.055 * (1 - i / 26);
            pts.push(v3(Math.sin(a) * r, 0.02 + Math.cos(a) * r - 0.055 + i * 0.0055, 0.015 + i * 0.0085));
        }
        return sweep(pts, keys([[0, 0.024, 0.022, 0], [0.5, 0.018, 0.017, 0], [1, 0.006, 0.006, 0]]), { rings: 30, sides: 6 });
    }), skin);
    for (let i = 0; i < 6; i++) {
        const a = i * 1.04;
        mesh(tail, cached('newPigTuft' + look + i, () => sweep([v3(0, 0, 0), v3(Math.cos(a) * 0.012, -0.02, 0.012), v3(Math.cos(a) * 0.024, -0.05, 0.02)], keys([[0, 0.006, 0.006], [1, 0.0015, 0.0015]]), { rings: 4, sides: 4 })), hairMat, 0, -0.025, 0.14, false);
    }

    // ---- legs: broad hams, a pastern darker than the thigh, cloven hooves with growth rings and dewclaws
    const up = [[0, 0.135, 0.16], [0.4, 0.105, 0.125], [1, 0.062, 0.072]];
    const low = [[0, 0.062, 0.072], [0.6, 0.056, 0.064], [1, 0.062, 0.068]];
    const paint = {
        uv: [0.3, 0.25], rings: 12, sides: 10, joint: false,
        up: (t, ang, p) => mix(shade(ang), DIRT, 0.22 * smooth(-0.12, -0.26, p.y) * dirtAt(p)),
        lo: (t, ang, p) => mix(shade(ang), DIRT, Math.min(0.9, (0.22 + 0.7 * smooth(-0.04, -0.2, p.y)) * (0.55 + 0.45 * dirtAt(p)))),
    };
    let li = 0;
    for (const [x, z, front] of [[0.2, -0.33, true], [-0.2, -0.33, true], [0.2, 0.36, false], [-0.2, 0.36, false]]) {
        const name = (front ? 'front' : 'hind') + (x > 0 ? 'Right' : 'Left') + 'Leg';
        const pivot = leg(g, legs, name, x, 0.5, z, front, 'newPig' + look + (front ? 'F' : 'H'), [front ? 0 : 0.04, 0.25, up], [front ? 0 : -0.03, 0.25, low], null, skin, skin, paint);
        const knee = pivot.userData.lower, lz = front ? 0 : -0.03;
        li++;
        // the cloven hoof: two toes side by side, ringed, a pale coronet band; two small dewclaws behind
        for (const s of [1, -1]) {
            mesh(knee, cached('newPigToe' + look, () => sweep([v3(0, 0.01, 0), v3(0, -0.04, -0.03)], keys([[0, 0.026, 0.03, 0], [0.2, 0.03, 0.034, 0], [0.7, 0.036, 0.04, -0.002], [1, 0.04, 0.04, -0.006]]), {
                rings: 6, sides: 8,
                color: (t) => { const ring = 0.9 + 0.1 * Math.sin(t * 34), band = smooth(0.25, 0.0, t); return [ring * (1 + 0.9 * band), ring * (1 + 0.8 * band), ring * (1 + 0.7 * band)]; },
            })), lamV(L.hoof), 0.027 * s, -0.222, lz - 0.01);
            blob(knee, lam(L.hoof), 0.012, 0.015, 0.012, 0.038 * s, -0.115, lz + 0.052, false);
        }
        void li;
    }

    // ---- wings: on the shoulders, folded along the sides (the same feathers as the old pig's)
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
