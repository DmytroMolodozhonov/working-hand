/**
 * SeaModels.js — how the sea's creatures look (Animals.js types 'shark', 'dolphin', 'glowfin'; how they live — SeaLife.js).
 *
 * Sizes (the world's measures: a block 1 m, the hero ~3.5 m; the animals ×2 of life as all of them): the model is 1 long (its nose at
 * z −0.5, the root of the tail fin at +0.5) and scaled by SPECIES.size: the shark 6 m, the dolphin 4.6 m, the glowfin 3.6 m. The body's
 * middle is the origin (they swim: no feet). The parts move (SeaLife.pose): 'tail' (the rear third, bending), 'tailFin' at its end,
 * 'jaw' (the shark's), 'head'; FarShape draws each model as one shape per material, the parts as bones.
 *
 * Not a fish of balls: every body is a swept oval with its true profile; the fins are real thin blades with a rounded edge
 * (extruded outlines), each painted (darker edge, the rays).
 *   shark    a grey reef shark: a torpedo with a pointed snout, countershaded (slate back, a wavy line to the white belly, specks),
 *            five gill slits, black eyes, a lower jaw that opens on rows of white teeth, a tall swept dorsal, broad pectorals, the
 *            small fins, a sickle tail with the long upper lobe;
 *   dolphin  a bottlenose dolphin: a short beak, the round melon, the smile, a dark cape over a grey flank and a pale belly, a
 *            hooked dorsal, flippers, a slim tail stock with keels and the notched flukes (it beats them up and down);
 *   glowfin  «Светлохвост», the magic fish of the deep: a slim deep body of indigo with a play of violet and teal, two rows of
 *            lights along each flank, a long sail of a fin down the back, long veil fins and a tail of three trailing streamers —
 *            all lit softly from within (their light pulses — SeaLife). Its tail is what the potion of the mermaid wants.
 */
import * as THREE from 'three';
import { MODEL_KIT as K } from './AnimalModels.js';

const _mats = new Map();
const mat = (key, make) => { let m = _mats.get(key); if (!m) { m = make(); _mats.set(key, m); } return m; };

/** The glowfin's light (one material for all of them: SeaLife pulses it). */
export const GLOW = { mats: [] };

/**
 * A fin: a thin blade from an outline (x, y pairs in the model's units), its edge rounded; `paint(x, y, edge01)` → rgb.
 * The blade lies in its own XY plane, its thickness along z (centred).
 */
function finGeo(key, outline, thick, paint) {
    return K.cached('seaFin' + key, () => {
        const sh = new THREE.Shape();
        sh.moveTo(outline[0][0], outline[0][1]);
        for (let i = 1; i < outline.length; i++) sh.lineTo(outline[i][0], outline[i][1]);
        sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45, bevelSize: thick * 0.7, bevelSegments: 2, curveSegments: 4, steps: 1 });
        g.translate(0, 0, -thick / 2);
        // the edge: how far a point is from the outline's middle (0 root … 1 tip / rim)
        g.computeBoundingBox();
        const bb = g.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
        const rx = (bb.max.x - bb.min.x) / 2 || 1, ry = (bb.max.y - bb.min.y) / 2 || 1;
        const P = g.getAttribute('position'), col = new Float32Array(P.count * 3);
        for (let i = 0; i < P.count; i++) {
            const x = P.getX(i), y = P.getY(i);
            const e = Math.min(1, Math.hypot((x - cx) / rx, (y - cy) / ry));
            const c = paint(x, y, e);
            col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.computeVertexNormals();
        return g;
    });
}

const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ======================================================================= the shark
function sharkSkin(t, ang, p, front) {
    // countershading: a slate back, a wavy line along the flank, the belly white
    const line = -0.18 + 0.06 * Math.sin(t * 19 + (front ? 0 : 3)) + 0.03 * Math.sin(t * 47);
    const up = smooth(line - 0.12, line + 0.12, Math.sin(ang));
    let c = [0.86 + 0.06 * (1 - up), 0.88 + 0.05 * (1 - up), 0.88 + 0.04 * (1 - up)];
    const back = [0.33, 0.39, 0.45];
    c = K.mix(c, back, up);
    // darker along the very top, specks and a skin of fine denticles
    const top = smooth(0.7, 1, Math.sin(ang));
    c = K.mix(c, [0.24, 0.29, 0.34], 0.5 * top);
    const sp = hash(Math.floor(t * 90), Math.floor(ang * 14));
    if (sp > 0.93 && up > 0.5) c = K.mix(c, [0.2, 0.24, 0.28], 0.6);
    const grain = 0.96 + 0.04 * hash(Math.floor(t * 300), Math.floor(ang * 40));
    if (front) {
        // five gill slits on each side, behind the head
        const side = Math.abs(Math.cos(ang)), s = Math.sin(ang);
        if (t > 0.34 && t < 0.47 && side > 0.55 && s > -0.35 && s < 0.55) {
            const u = (t - 0.34) / 0.13 * 5;
            if (Math.abs(u - Math.round(u)) < 0.12) c = K.mix(c, [0.12, 0.13, 0.15], 0.85);
        }
        // the mouth's crescent under the snout
        if (t > 0.1 && t < 0.2 && s < -0.75) c = K.mix(c, [0.32, 0.27, 0.28], 0.7);
    }
    return [c[0] * grain, c[1] * grain, c[2] * grain];
}

function sharkFinPaint(x, y, e) {
    const c = K.mix([0.34, 0.4, 0.46], [0.18, 0.21, 0.25], smooth(0.6, 1, e)); // (the rim darker)
    const ray = 0.96 + 0.04 * Math.sin(x * 160 + y * 40);
    return [c[0] * ray, c[1] * ray, c[2] * ray];
}

export function sharkModel() {
    const g = new THREE.Group();
    g.name = 'shark';
    const skin = K.lamV(0xffffff);
    const front = K.mesh(g, K.cached('sharkFront', () => {
        const k = K.keys([[0, 0.006, 0.006, -0.004], [0.07, 0.04, 0.034, -0.004], [0.2, 0.074, 0.07, 0], [0.42, 0.098, 0.1, 0.004], [0.7, 0.096, 0.098, 0.004], [1, 0.076, 0.08, 0.002]]);
        return K.sweep([K.v3(0, -0.01, -0.5), K.v3(0, 0, -0.2), K.v3(0, 0, 0.18)], (t) => k(t), { rings: 34, sides: 20, color: (t, ang, p) => sharkSkin(t, ang, p, true) });
    }), skin);
    front.name = 'bodyFront';
    const head = K.group(g, 'head', 0, 0, -0.36);
    // the lower jaw: opens on its teeth (SeaLife: a bite)
    const jaw = K.group(head, 'jaw', 0, -0.045, 0.02);
    K.mesh(jaw, K.cached('sharkJaw', () => K.sweep([K.v3(0, 0, 0.0), K.v3(0, -0.004, -0.07), K.v3(0, -0.002, -0.11)], K.keys([[0, 0.06, 0.018, 0], [0.6, 0.042, 0.014, 0], [1, 0.016, 0.008, 0]]), {
        rings: 10, sides: 12, color: (t, ang) => Math.sin(ang) > 0.2 ? [0.55, 0.32, 0.34] : [0.88, 0.89, 0.88], // (the gums inside, the white under it)
    })), skin);
    const teeth = K.lam(0xf4f1e6);
    for (let i = 0; i < 9; i++) {
        const a = (i / 8 - 0.5) * 2.2, r = 0.045 - Math.abs(i / 8 - 0.5) * 0.04;
        const tth = K.mesh(jaw, K.cone(0, 0.004, 0.012, 4), teeth, Math.sin(a) * r, 0.012, -0.02 - Math.cos(a) * r * 1.4, false);
        tth.rotation.x = -0.15;
        const up = K.mesh(head, K.cone(0, 0.004, 0.011, 4), teeth, Math.sin(a) * r, -0.032, -0.0 - Math.cos(a) * r * 1.4, false);
        up.rotation.x = Math.PI;
    }
    const eye = K.lam(0x060708);
    for (const s of [1, -1]) {
        K.blob(head, eye, 0.011, 0.011, 0.014, 0.05 * s, 0.018, -0.03, false);
        K.blob(head, K.lam(0x2a3036), 0.014, 0.004, 0.018, 0.052 * s, 0.03, -0.03, false); // (the brow over it)
    }
    const fin = K.lamV(0xffffff);
    // the first dorsal: tall, swept back
    const dorsal = K.mesh(g, finGeo('sharkDorsal', [[-0.07, 0], [-0.04, 0.06], [0.0, 0.12], [0.04, 0.15], [0.06, 0.15], [0.05, 0.11], [0.06, 0.04], [0.09, 0]], 0.012, sharkFinPaint), fin, 0, 0.085, -0.02);
    dorsal.rotation.y = -Math.PI / 2;
    // the pectorals: broad, angled down and back
    for (const s of [1, -1]) {
        const pf = K.group(g, s > 0 ? 'finRight' : 'finLeft', 0.07 * s, -0.045, -0.2);
        const m = K.mesh(pf, finGeo('sharkPect', [[0, -0.04], [0.06, -0.02], [0.15, 0.06], [0.17, 0.09], [0.12, 0.08], [0.03, 0.05], [0, 0.04]], 0.01, sharkFinPaint), fin);
        m.rotation.x = Math.PI / 2;
        pf.scale.x = s;
        pf.rotation.z = -0.38 * s;
    }
    // the rear: bends (SeaLife), with the small fins and the tail fin
    const tail = K.group(g, 'tail', 0, 0, 0.18);
    K.mesh(tail, K.cached('sharkRear', () => {
        const k = K.keys([[0, 0.076, 0.08, 0.002], [0.4, 0.052, 0.058, 0.006], [0.8, 0.026, 0.034, 0.008], [1, 0.018, 0.03, 0.008]]);
        return K.sweep([K.v3(0, 0, 0), K.v3(0, 0.004, 0.16), K.v3(0, 0.008, 0.32)], (t) => k(t), { rings: 18, sides: 16, color: (t, ang, p) => sharkSkin(t, ang, p, false) });
    }), skin);
    for (const s of [1, -1]) { // (the pelvic fins)
        const m = K.mesh(tail, finGeo('sharkPelvic', [[0, 0], [0.05, 0.03], [0.07, 0.05], [0.04, 0.05], [0, 0.02]], 0.007, sharkFinPaint), fin, 0.035 * s, -0.05, 0.08);
        m.rotation.set(Math.PI / 2, 0, -0.5 * s);
        m.scale.x = s;
    }
    const d2 = K.mesh(tail, finGeo('sharkDorsal2', [[0, 0], [0.02, 0.035], [0.04, 0.04], [0.05, 0]], 0.006, sharkFinPaint), fin, 0, 0.045, 0.16);
    d2.rotation.y = -Math.PI / 2;
    const an = K.mesh(tail, finGeo('sharkAnal', [[0, 0], [0.02, -0.03], [0.04, -0.035], [0.05, 0]], 0.006, sharkFinPaint), fin, 0, -0.035, 0.18);
    an.rotation.y = -Math.PI / 2;
    const tf = K.group(tail, 'tailFin', 0, 0.008, 0.31);
    // the sickle tail: the long upper lobe, a short lower one
    const cf = K.mesh(tf, finGeo('sharkCaudal', [[0, 0.02], [0.06, 0.08], [0.14, 0.16], [0.16, 0.165], [0.13, 0.12], [0.08, 0.05], [0.07, 0.01], [0.1, -0.05], [0.11, -0.085], [0.07, -0.06], [0.02, -0.025], [0, -0.01]], 0.009, sharkFinPaint), fin);
    cf.rotation.y = -Math.PI / 2;
    return K.finish(g, { body: front, head, jaw, tail, tailFin: tf, legs: [], sea: 'shark' });
}

// ===================================================================== the dolphin
function dolphinSkin(t, ang, p, front) {
    const s = Math.sin(ang);
    // a pale belly, a grey flank, the darker cape over the back sweeping down behind the eye and up again before the tail
    const capeLine = front ? 0.25 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.25)) : 0.45 - 0.3 * t;
    let c = K.mix([0.88, 0.87, 0.85], [0.58, 0.62, 0.66], smooth(-0.55, -0.15, s));
    c = K.mix(c, [0.33, 0.37, 0.42], smooth(capeLine - 0.08, capeLine + 0.08, s));
    // a soft blaze over the flank, a lighter stripe from the eye to the flipper
    if (front && t > 0.25 && t < 0.45 && s > -0.35 && s < 0.05) c = K.mix(c, [0.72, 0.74, 0.76], 0.35);
    // the smile: a dark line along the beak's sides
    if (front && t > 0.02 && t < 0.13 && Math.abs(s + 0.15) < 0.06) c = K.mix(c, [0.2, 0.22, 0.24], 0.8);
    const grain = 0.975 + 0.025 * hash(Math.floor(t * 200), Math.floor(ang * 30));
    // a few old scratches (they all have them)
    const sc = hash(Math.floor(t * 40), Math.floor(ang * 6));
    if (sc > 0.94 && s > 0) c = K.mix(c, [0.7, 0.72, 0.74], 0.35);
    return [c[0] * grain, c[1] * grain, c[2] * grain];
}
const dolphinFinPaint = (x, y, e) => K.mix([0.36, 0.4, 0.45], [0.27, 0.3, 0.34], smooth(0.5, 1, e));

export function dolphinModel() {
    const g = new THREE.Group();
    g.name = 'dolphin';
    const skin = K.lamV(0xffffff);
    const front = K.mesh(g, K.cached('dolphinFront', () => {
        // the beak (0–0.12), the melon rising over it (0.12–0.24), the body (to 1)
        const k = K.keys([[0, 0.012, 0.01, -0.012], [0.08, 0.022, 0.018, -0.012], [0.12, 0.03, 0.026, -0.008], [0.17, 0.058, 0.066, 0.012], [0.26, 0.08, 0.088, 0.01], [0.5, 0.102, 0.11, 0.004], [0.78, 0.094, 0.1, 0.004], [1, 0.07, 0.074, 0.006]]);
        return K.sweep([K.v3(0, -0.02, -0.5), K.v3(0, 0, -0.25), K.v3(0, 0.004, 0.16)], (t) => k(t), { rings: 36, sides: 20, color: (t, ang, p) => dolphinSkin(t, ang, p, true) });
    }), skin);
    front.name = 'bodyFront';
    const head = K.group(g, 'head', 0, 0, -0.34);
    for (const s of [1, -1]) {
        K.blob(head, K.lam(0x101215), 0.008, 0.008, 0.01, 0.056 * s, 0.002, 0.02, false);
        K.blob(head, K.lam(0x9aa3ac), 0.011, 0.01, 0.013, 0.054 * s, 0.002, 0.02, false).scale.multiplyScalar(1); // (the lighter ring round the eye)
    }
    K.blob(head, K.lam(0x1d2126), 0.008, 0.003, 0.01, 0, 0.07, 0.09, false); // the blowhole
    const fin = K.lamV(0xffffff);
    // the hooked dorsal
    const dorsal = K.mesh(g, finGeo('dolphinDorsal', [[-0.08, 0], [-0.04, 0.05], [0.0, 0.09], [0.04, 0.115], [0.065, 0.115], [0.045, 0.085], [0.04, 0.04], [0.06, 0]], 0.012, dolphinFinPaint), fin, 0, 0.09, 0.0);
    dorsal.rotation.y = -Math.PI / 2;
    for (const s of [1, -1]) {
        const pf = K.group(g, s > 0 ? 'finRight' : 'finLeft', 0.07 * s, -0.05, -0.2);
        const m = K.mesh(pf, finGeo('dolphinFlip', [[0, -0.02], [0.05, 0], [0.1, 0.05], [0.11, 0.07], [0.07, 0.06], [0.02, 0.03], [0, 0.02]], 0.01, dolphinFinPaint), fin);
        m.rotation.x = Math.PI / 2;
        pf.scale.x = s;
        pf.rotation.z = -0.5 * s;
    }
    const tail = K.group(g, 'tail', 0, 0.004, 0.16);
    K.mesh(tail, K.cached('dolphinRear', () => {
        // the tail stock: deep and thin (the keels above and below)
        const k = K.keys([[0, 0.07, 0.074, 0.002], [0.4, 0.045, 0.06, 0.004], [0.8, 0.02, 0.04, 0.004], [1, 0.014, 0.022, 0.002]]);
        return K.sweep([K.v3(0, 0, 0), K.v3(0, 0.0, 0.17), K.v3(0, -0.004, 0.34)], (t) => k(t), { rings: 18, sides: 16, color: (t, ang, p) => dolphinSkin(t, ang, p, false) });
    }), skin);
    const tf = K.group(tail, 'tailFin', 0, -0.004, 0.33);
    // the flukes: flat, swept back, notched in the middle
    const fl = K.mesh(tf, finGeo('dolphinFlukes', [[0, -0.01], [0.06, 0.0], [0.13, 0.03], [0.15, 0.06], [0.1, 0.06], [0.03, 0.05], [0, 0.035], [-0.03, 0.05], [-0.1, 0.06], [-0.15, 0.06], [-0.13, 0.03], [-0.06, 0.0]], 0.01, dolphinFinPaint), fin);
    fl.rotation.x = Math.PI / 2;
    return K.finish(g, { body: front, head, tail, tailFin: tf, legs: [], sea: 'dolphin' });
}

// ===================================================================== the glowfin
function glowfinSkin(t, ang) {
    const s = Math.sin(ang);
    // deep indigo, the back nearly black-blue, a play of violet and teal over the flanks
    let c = K.mix([0.16, 0.2, 0.42], [0.05, 0.07, 0.18], smooth(0.2, 0.9, s));
    const play = 0.5 + 0.5 * Math.sin(t * 13 + ang * 3);
    c = K.mix(c, [0.36, 0.22, 0.6], 0.35 * play * (1 - Math.abs(s)));
    c = K.mix(c, [0.12, 0.45, 0.55], 0.25 * (1 - play) * (1 - Math.abs(s)));
    c = K.mix(c, [0.55, 0.62, 0.8], 0.4 * smooth(-0.4, -0.9, s)); // (the belly pale silver-blue)
    // scales: a fine net
    const net = Math.abs(Math.sin(t * 160 + ang * 9)) * Math.abs(Math.sin(t * 160 - ang * 9));
    const k = 0.92 + 0.12 * net;
    return [c[0] * k, c[1] * k, c[2] * k];
}
const veilPaint = (base, rim) => (x, y, e) => K.mix(base, rim, smooth(0.45, 1, e)).map((v, i) => v * (0.9 + 0.1 * Math.sin(x * 220 + y * 30 + i)));

function glowMat(key, color, emissive, intensity, opacity = 1) {
    return mat(key, () => {
        const m = new THREE.MeshLambertMaterial({ color, vertexColors: true, emissive: new THREE.Color(emissive), emissiveIntensity: intensity, transparent: opacity < 1, opacity, side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide, depthWrite: opacity >= 1 });
        m.userData.glowBase = intensity;
        GLOW.mats.push(m);
        return m;
    });
}

export function glowfinModel() {
    const g = new THREE.Group();
    g.name = 'glowfin';
    const skin = glowMat('gfSkin', 0xffffff, 0x2a3c9a, 0.25);
    const veil = glowMat('gfVeil', 0xffffff, 0x58d8ff, 0.55, 0.72);
    const lights = mat('gfLights', () => { const m = new THREE.MeshBasicMaterial({ color: 0xb8fbff }); m.userData.glowBase = 1; GLOW.mats.push(m); return m; });
    const front = K.mesh(g, K.cached('glowFront', () => {
        const k = K.keys([[0, 0.008, 0.012, 0], [0.08, 0.026, 0.05, 0.004], [0.25, 0.042, 0.11, 0.006], [0.55, 0.046, 0.125, 0.004], [0.85, 0.04, 0.11, 0.002], [1, 0.034, 0.09, 0.002]]);
        return K.sweep([K.v3(0, 0, -0.5), K.v3(0, 0.01, -0.2), K.v3(0, 0.006, 0.12)], (t) => k(t), { rings: 34, sides: 20, color: (t, ang) => glowfinSkin(t, ang) });
    }), skin);
    front.name = 'bodyFront';
    const head = K.group(g, 'head', 0, 0, -0.4);
    for (const s of [1, -1]) {
        K.blob(head, K.lam(0xe9fbff), 0.016, 0.016, 0.012, 0.024 * s, 0.012, 0.0, false); // (a big eye of the deep, silver)
        K.blob(head, lights, 0.008, 0.008, 0.006, 0.03 * s, 0.012, 0.0, false); // (its glowing pupil)
    }
    // two rows of lights along each flank (the front part)
    for (const s of [1, -1]) for (let i = 0; i < 9; i++) {
        const z = -0.33 + i * 0.05;
        for (const [yy, r] of [[0.03, 0.007], [-0.035, 0.006]]) K.blob(g, lights, 0.004, r, r, 0.045 * s, yy - Math.abs(z + 0.1) * 0.05, z, false);
    }
    // the sail down the back (the front part of it)
    const sail = K.mesh(g, finGeo('glowSail', [[-0.28, 0], [-0.24, 0.09], [-0.12, 0.15], [0.0, 0.16], [0.12, 0.14], [0.16, 0.1], [0.17, 0]], 0.006, veilPaint([0.3, 0.5, 0.9], [0.65, 0.98, 1.0])), veil, 0, 0.1, -0.02);
    sail.rotation.y = -Math.PI / 2;
    // long veil pectorals trailing back
    for (const s of [1, -1]) {
        const pf = K.group(g, s > 0 ? 'finRight' : 'finLeft', 0.04 * s, -0.04, -0.24);
        const m = K.mesh(pf, finGeo('glowPect', [[0, 0], [0.05, 0.03], [0.1, 0.12], [0.11, 0.26], [0.07, 0.22], [0.03, 0.1], [0, 0.03]], 0.004, veilPaint([0.35, 0.3, 0.85], [0.6, 0.95, 1.0])), veil);
        m.rotation.x = Math.PI / 2;
        pf.scale.x = s;
        pf.rotation.z = -0.7 * s;
    }
    const tail = K.group(g, 'tail', 0, 0.006, 0.12);
    K.mesh(tail, K.cached('glowRear', () => {
        const k = K.keys([[0, 0.034, 0.09, 0.002], [0.5, 0.022, 0.06, 0.004], [1, 0.012, 0.03, 0.004]]);
        return K.sweep([K.v3(0, 0, 0), K.v3(0, 0.004, 0.17), K.v3(0, 0.006, 0.34)], (t) => k(t), { rings: 16, sides: 16, color: (t, ang) => glowfinSkin(0.7 + t * 0.3, ang) });
    }), skin);
    for (const s of [1, -1]) for (let i = 0; i < 5; i++) K.blob(tail, lights, 0.003, 0.005, 0.005, 0.03 * s * (1 - i * 0.12), 0.0, 0.03 + i * 0.055, false);
    const sail2 = K.mesh(tail, finGeo('glowSail2', [[0, 0], [0.02, 0.09], [0.12, 0.08], [0.24, 0.04], [0.3, 0]], 0.005, veilPaint([0.3, 0.5, 0.9], [0.65, 0.98, 1.0])), veil, 0, 0.06, 0.0);
    sail2.rotation.y = -Math.PI / 2;
    const tf = K.group(tail, 'tailFin', 0, 0.006, 0.33);
    // the tail: a forked veil and three long streamers of light
    const cf = K.mesh(tf, finGeo('glowCaudal', [[0, 0.02], [0.12, 0.14], [0.26, 0.2], [0.2, 0.08], [0.16, 0.0], [0.2, -0.08], [0.26, -0.2], [0.12, -0.14], [0, -0.02]], 0.005, veilPaint([0.4, 0.35, 0.95], [0.7, 1.0, 1.0])), veil);
    cf.rotation.y = -Math.PI / 2;
    for (const [yy, len] of [[0.05, 0.42], [0, 0.55], [-0.05, 0.42]]) {
        const st = K.mesh(tf, finGeo('glowStreamer' + len, [[0, -0.006], [len * 0.5, -0.012], [len, -0.003], [len, 0.003], [len * 0.5, 0.012], [0, 0.006]], 0.003, veilPaint([0.55, 0.85, 1.0], [0.9, 1.0, 1.0])), veil, 0, yy, 0.05);
        st.rotation.y = -Math.PI / 2;
        st.rotation.x = yy * 2;
    }
    return K.finish(g, { body: front, head, tail, tailFin: tf, legs: [], sea: 'glowfin' });
}

/** A sea creature by type. */
export function seaModel(type) {
    if (type === 'shark') return sharkModel();
    if (type === 'dolphin') return dolphinModel();
    return glowfinModel();
}

/**
 * The glowfin's tail as a thing (item 'glowfinTail' — the potion of the mermaid wants it): the cut rear with its forked veil and the
 * streamers, still glowing softly. ~0.6 long (ItemTypes.ITEM_SCALE makes it ~1 m in the hand).
 */
export function glowfinTailItemModel() {
    const src = glowfinModel();
    const tail = src.userData.tail;
    const g = new THREE.Group();
    g.name = 'glowfinTail';
    tail.position.set(0, 0, -0.15);
    g.add(tail);
    g.scale.setScalar(1.4);
    g.rotation.y = Math.PI / 2;
    const out = new THREE.Group();
    out.add(g);
    return out;
}
