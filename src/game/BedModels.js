/**
 * BedModels.js — the 3D models of beds, wool and bundles of logs (THREE only,
 * no game logic). Geometries and materials are shared; the blanket material
 * is cached per colour (recolouring a bed only swaps it).
 *
 * The bed is sized for the 4.6 m hero: 2.5 m wide × 5.5 m long, the mattress
 * top at BED.top (1.0 m). Local axes: the pillow at −Z, the foot at +Z.
 */

import * as THREE from 'three';
import { bedColorHex } from './BedRules.js';

export const BED = { W: 2.5, L: 5.5, top: 1.0, head: 2.1 };

const _mats = new Map();
function mat(color) {
    if (!_mats.has(color)) {
        const m = new THREE.MeshLambertMaterial({ color });
        m.userData.shared = true;
        _mats.set(color, m);
    }
    return _mats.get(color);
}
const _geos = new Map();
function boxGeo(w, h, d) {
    const k = `${w}|${h}|${d}`;
    if (!_geos.has(k)) _geos.set(k, new THREE.BoxGeometry(w, h, d));
    return _geos.get(k);
}
function box(w, h, d, m, x, y, z, shadow = true) {
    const b = new THREE.Mesh(boxGeo(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = shadow;
    b.receiveShadow = true;
    b.userData.sharedGeo = true;
    return b;
}

/** The blanket material of a colour (shared). */
export function blanketMaterial(color) { return mat(bedColorHex(color)); }

/** One bed: a wooden frame, a white mattress, a pillow and a blanket in the bed's colour. */
export function bedModel(color = 'white') {
    const { W, L, top, head } = BED;
    const g = new THREE.Group();
    const wood = mat(0x8b5a2b), dark = mat(0x5a3a1e), sheet = mat(0xe2dac8), pillow = mat(0xffffff);
    const blanket = blanketMaterial(color);
    const stripe = mat(new THREE.Color(bedColorHex(color)).multiplyScalar(0.72).getHex());
    // legs and the frame
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.26, 0.5, 0.26, dark, sx * (W / 2 - 0.13), 0.25, sz * (L / 2 - 0.13)));
    g.add(box(W, 0.3, L, wood, 0, 0.55, 0));
    for (const sx of [-1, 1]) g.add(box(0.14, 0.2, L, dark, sx * (W / 2 - 0.07), 0.78, 0, false));
    // headboard (with a carved top) and footboard
    g.add(box(W + 0.1, head, 0.22, wood, 0, head / 2, -L / 2 + 0.11));
    g.add(box(W + 0.3, 0.22, 0.3, dark, 0, head + 0.06, -L / 2 + 0.11));
    g.add(box(W * 0.6, 0.7, 0.06, dark, 0, head - 0.65, -L / 2 + 0.25, false));
    g.add(box(W + 0.1, 1.25, 0.2, wood, 0, 0.625, L / 2 - 0.1));
    g.add(box(W + 0.24, 0.16, 0.26, dark, 0, 1.3, L / 2 - 0.1));
    // mattress, pillow, blanket (turned down at the top)
    g.add(box(W - 0.16, 0.3, L - 0.44, sheet, 0, 0.85, 0));
    g.add(box(W * 0.7, 0.26, 0.85, pillow, 0, top + 0.12, -L / 2 + 0.75));
    const b1 = box(W - 0.06, 0.12, L * 0.62, blanket, 0, top + 0.04, L / 2 - 0.22 - L * 0.31);
    const b2 = box(W - 0.04, 0.14, 0.32, mat(0xfbf8f0), 0, top + 0.07, L / 2 - 0.22 - L * 0.62 + 0.14);
    const b3 = box(0.06, 0.62, L * 0.62, blanket, -(W / 2 - 0.0), top - 0.25, b1.position.z, false);
    const b4 = box(0.06, 0.62, L * 0.62, blanket, W / 2 - 0.0, top - 0.25, b1.position.z, false);
    const s1 = box(W - 0.02, 0.13, 0.18, stripe, 0, top + 0.045, b1.position.z + L * 0.18);
    g.add(b1, b2, b3, b4, s1);
    g.userData.blanket = [b1, b3, b4];
    g.userData.stripe = s1;
    return g;
}

/** Recolour a bed model's blanket. */
export function paintBed(model, color) {
    const m = blanketMaterial(color);
    for (const b of model.userData.blanket || []) b.material = m;
    if (model.userData.stripe) model.userData.stripe.material = mat(new THREE.Color(bedColorHex(color)).multiplyScalar(0.72).getHex());
}

/** A fluffy white ball of wool (~0.6 m — the hero is big). */
let _woolGeo = null;
export function woolModel() {
    const g = new THREE.Group();
    _woolGeo = _woolGeo || new THREE.IcosahedronGeometry(0.2, 1);
    const w = mat(0xf6f4ee), w2 = mat(0xe9e5da);
    const puffs = [[0, 0.02, 0, 1.15, w], [0.17, 0.0, 0.05, 0.85, w2], [-0.16, 0.01, -0.04, 0.9, w], [0.03, 0.15, -0.08, 0.8, w], [-0.05, 0.08, 0.16, 0.75, w2], [0.08, -0.06, -0.15, 0.7, w2]];
    for (const [x, y, z, s, m] of puffs) {
        const p = new THREE.Mesh(_woolGeo, m);
        p.position.set(x, y, z);
        p.scale.setScalar(s);
        p.castShadow = true;
        p.userData.sharedGeo = true;
        g.add(p);
    }
    return g;
}

/** A bundle of logs tied with a rope (~1.1 m long). */
let _logGeo = null, _endGeo = null, _ropeGeo = null;
export function logsModel(color = 0x8b5a2b) {
    const g = new THREE.Group();
    _logGeo = _logGeo || new THREE.CylinderGeometry(0.13, 0.13, 1.1, 8);
    _endGeo = _endGeo || new THREE.CylinderGeometry(0.1, 0.1, 1.12, 8);
    _ropeGeo = _ropeGeo || new THREE.TorusGeometry(0.3, 0.025, 4, 12);
    const bark = mat(color), cut = mat(new THREE.Color(color).lerp(new THREE.Color(0xf0d9a8), 0.55).getHex()), rope = mat(0xc9a86a);
    for (const [x, y] of [[-0.14, 0], [0.14, 0], [0, 0.22], [-0.27, 0.2], [0.27, 0.2]].slice(0, 4)) {
        const l = new THREE.Mesh(_logGeo, bark);
        l.rotation.z = Math.PI / 2;
        l.position.set(0, y, x);
        l.castShadow = true;
        l.userData.sharedGeo = true;
        g.add(l);
        const e = new THREE.Mesh(_endGeo, cut);
        e.rotation.z = Math.PI / 2;
        e.position.copy(l.position);
        e.userData.sharedGeo = true;
        g.add(e);
    }
    for (const x of [-0.32, 0.32]) {
        const r = new THREE.Mesh(_ropeGeo, rope);
        r.rotation.y = Math.PI / 2;
        r.position.set(x, 0.09, 0);
        r.userData.sharedGeo = true;
        g.add(r);
    }
    return g;
}
