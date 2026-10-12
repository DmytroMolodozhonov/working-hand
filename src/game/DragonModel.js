/**
 * DragonModel.js — the look of the five dragons (DragonKinds.js): a big, cheap model.
 *
 * Built of boxes, cones and two flat wing membranes (≈50 meshes, geometry shared per size, materials
 * shared per kind: no new shader for a second dragon). Moving parts are groups the animation turns:
 *   wings     a shoulder joint each (flap: down-stroke, up-stroke; folded on the ground)
 *   neck      three joints to the head (it looks, lowers to breathe, rises to roar)
 *   jaw       the lower jaw opens to breathe fire / to bite
 *   tail      five joints (it sways; a sweep)
 *   legs      four (they step when it walks, tuck up in flight)
 *   eyes      glowing (MeshBasic: seen in the dark of its lair)
 * Each kind its own silhouette: the emerald's leaf frills and curled horns, the crimson's great
 * swept-back horns and a spiked tail, the obsidian's jagged crystal ridge and glowing veins
 * (the biggest), the golden's sail along the back and a long slender neck, the ice dragon's
 * crystal spikes and an icy beard.
 *
 * The model faces −Z (like the spider), its feet at y = 0. Units: metres × the kind's size × SCALE.
 */

import * as THREE from 'three';
import { DRAGON_KINDS } from './DragonKinds.js';

/** The common dragon: about 13 m nose to tail-tip, 5 m at the shoulder, wings 22 m across. */
export const SCALE = 1.25;
/** Its body as a capsule (unscaled, the model's own units): along it, chest to hips. */
export const BODY = { y: 2.9, z0: -2.6, z1: 2.8, r: 1.9 };
/** Where its mouth is (unscaled): the fire comes out there. */
export const MOUTH = { fwd: 8.6, up: 5.6 };

const _mats = new Map();
function mats(kind) {
    if (_mats.has(kind)) return _mats.get(kind);
    const K = DRAGON_KINDS[kind] || DRAGON_KINDS.emerald;
    const lam = (c, e = 0x000000) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    const m = {
        body: lam(K.body),
        belly: lam(K.belly),
        wing: new THREE.MeshLambertMaterial({ color: K.wing, side: THREE.DoubleSide }),
        bone: lam(new THREE.Color(K.body).multiplyScalar(0.7).getHex()),
        horn: lam(K.horn),
        eye: new THREE.MeshBasicMaterial({ color: K.eye }),
        mouth: new THREE.MeshBasicMaterial({ color: 0x3a0606 }),
        tooth: lam(0xf4efe0),
        vein: K.vein ? new THREE.MeshBasicMaterial({ color: K.vein }) : null,
        crystal: kind === 'ice' ? new THREE.MeshLambertMaterial({ color: 0xd8f4ff, emissive: 0x2a5a7a, transparent: true, opacity: 0.9 }) : kind === 'obsidian' ? lam(0x2a2433, 0x3a0a0a) : null,
    };
    for (const v of Object.values(m)) if (v) v.userData.shared = true;
    _mats.set(kind, m);
    return m;
}

const _geo = new Map();
/** Shared geometries (one per shape for every dragon). */
function geo(key, make) {
    if (!_geo.has(key)) { const g = make(); g.userData = { shared: true }; _geo.set(key, g); }
    return _geo.get(key);
}
const boxG = (w, h, d) => geo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const coneG = (r, h, n = 5) => geo(`c${r}|${h}|${n}`, () => new THREE.ConeGeometry(r, h, n));
const octG = (r) => geo(`o${r}`, () => new THREE.OctahedronGeometry(r));

/** A wing's membrane: a fan from the shoulder along the arm bone and three finger bones (in its own x-z plane). */
function membraneG(span) {
    return geo(`w${span}`, () => {
        const pts = [[0, 0], [span * 0.45, -0.6], [span, -0.2], [span * 0.95, 2.4], [span * 0.7, 3.6], [span * 0.42, 4.2], [span * 0.16, 3.3], [0, 2.4]];
        const g = new THREE.BufferGeometry();
        const pos = [];
        for (let i = 1; i < pts.length - 1; i++) pos.push(0, 0, 0.4, pts[i][0], 0, pts[i][1] + 0.4, pts[i + 1][0], 0, pts[i + 1][1] + 0.4);
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        return g;
    });
}

export function dragonModel(kind) {
    const K = DRAGON_KINDS[kind] || DRAGON_KINDS.emerald;
    const M = mats(kind);
    const root = new THREE.Group();
    const g = new THREE.Group(); // (scaled as a whole)
    root.add(g);
    const add = (parent, geom, mat, x, y, z, rx = 0, ry = 0, rz = 0, shadow = false) => {
        const m = new THREE.Mesh(geom, mat);
        m.position.set(x, y, z);
        m.rotation.set(rx, ry, rz);
        m.castShadow = shadow;
        parent.add(m);
        return m;
    };
    const slender = kind === 'golden';
    // ---- the body
    const body = new THREE.Group();
    body.position.y = BODY.y;
    g.add(body);
    add(body, boxG(3.4, 2.7, 6.6), M.body, 0, 0, 0, 0, 0, 0, true);
    add(body, boxG(2.9, 0.7, 6.0), M.belly, 0, -1.25, 0); // (the belly's plates)
    add(body, boxG(2.6, 2.2, 1.6), M.body, 0, 0.3, -3.6, -0.2); // (the chest, rising to the neck)
    add(body, boxG(2.4, 2.0, 1.6), M.body, 0, -0.1, 3.6, 0.15); // (the hips)
    // the ridge along the back: spikes / crystals / a sail
    for (let i = 0; i < 7; i++) {
        const z = -3 + i * 1.0, h = 1.1 - Math.abs(i - 2.5) * 0.12;
        if (kind === 'obsidian' || kind === 'ice') add(body, octG(0.45), M.crystal, 0, 1.6 + h * 0.4, z, 0, i * 0.7, 0).scale.set(0.7, 1.8 * h, 0.7);
        else if (!slender) add(body, coneG(0.35, h, 4), M.horn, 0, 1.35 + h / 2, z, -0.35);
    }
    if (slender) { // the golden dragon's sail: a fan of spines with a membrane between them
        const sail = add(body, geo('sail', () => {
            const s = new THREE.Shape();
            s.moveTo(-3.2, 0); s.quadraticCurveTo(-1.6, 2.6, 0.2, 2.2); s.quadraticCurveTo(2.2, 1.6, 3.2, 0); s.lineTo(-3.2, 0);
            return new THREE.ShapeGeometry(s, 6);
        }), M.wing, 0, 1.3, 0, 0, Math.PI / 2, 0);
        sail.material = M.wing;
    }
    if (M.vein) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(body, boxG(0.06, 0.12, 2.2 - i * 0.5), M.vein, s * 1.72, 0.6 - i * 0.6, -0.4 + i * 0.6, 0.3 * s, 0, 0);
    // ---- the neck: three joints up and forward, then the head
    const neck = [];
    let at = body;
    let pos = [0, 0.8, -4.2];
    const nl = slender ? 1.9 : 1.6;
    for (let i = 0; i < 3; i++) {
        const j = new THREE.Group();
        j.position.set(...pos);
        j.rotation.x = i === 0 ? 0.65 : -0.12;
        at.add(j);
        add(j, boxG(1.5 - i * 0.18, 1.4 - i * 0.15, nl + 0.2), M.body, 0, 0, -nl / 2);
        add(j, boxG(1.1 - i * 0.15, 0.4, nl), M.belly, 0, -0.62 + i * 0.07, -nl / 2);
        if (kind === 'emerald') add(j, coneG(0.5, 0.9, 3), M.wing, 0, 0.8, -nl / 2, -0.5).scale.set(1.6, 1, 0.3); // (leaf frills)
        else add(j, coneG(0.22, 0.6, 4), M.horn, 0, 0.85, -nl / 2, -0.4);
        neck.push(j);
        at = j;
        pos = [0, 0, -nl];
    }
    const head = new THREE.Group();
    head.position.set(0, 0, -nl);
    head.rotation.x = -0.45;
    at.add(head);
    add(head, boxG(1.6, 1.25, 2.0), M.body, 0, 0.1, -0.7, 0, 0, 0, true); // (the skull)
    add(head, boxG(1.15, 0.75, 1.8), M.body, 0, -0.05, -2.3); // (the snout)
    add(head, boxG(0.2, 0.2, 0.2), M.mouth, 0.35, 0.28, -3.15); add(head, boxG(0.2, 0.2, 0.2), M.mouth, -0.35, 0.28, -3.15); // (nostrils)
    for (const s of [-1, 1]) {
        add(head, boxG(0.32, 0.2, 0.42), M.eye, s * 0.72, 0.38, -1.1); // (glowing eyes)
        add(head, boxG(0.5, 0.18, 0.7), M.bone, s * 0.62, 0.62, -1.05, 0, 0, s * 0.2); // (the brow)
        // horns: each kind its own
        if (kind === 'crimson') add(head, coneG(0.28, 2.6, 5), M.horn, s * 0.6, 0.9, 0.9, -2.2, 0, s * 0.25);
        else if (kind === 'emerald') { const h = add(head, coneG(0.25, 1.4, 5), M.horn, s * 0.7, 0.7, 0.4, -1.6, 0, s * 0.9); h.scale.set(1, 1, 1); }
        else if (kind === 'obsidian') { add(head, coneG(0.3, 1.8, 4), M.horn, s * 0.55, 0.9, 0.5, -1.9, 0, s * 0.15); add(head, coneG(0.18, 1.0, 4), M.horn, s * 0.8, 0.3, 0.3, -1.7, 0, s * 0.6); }
        else if (kind === 'golden') add(head, coneG(0.18, 2.0, 4), M.horn, s * 0.45, 0.8, 0.8, -2.4, 0, s * 0.1);
        else add(head, octG(0.35), M.crystal, s * 0.6, 0.9, 0.3, 0.4, 0, s * 0.4).scale.set(0.6, 2.2, 0.6);
    }
    if (kind === 'ice') for (let i = 0; i < 3; i++) add(head, coneG(0.12, 0.9, 4), M.crystal, (i - 1) * 0.3, -0.85, -1.4, Math.PI, 0, 0); // (the icy beard)
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.35, -0.2);
    head.add(jaw);
    add(jaw, boxG(1.05, 0.38, 2.9), M.body, 0, -0.2, -1.7);
    add(jaw, boxG(0.8, 0.12, 2.5), M.mouth, 0, 0.02, -1.6);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(jaw, coneG(0.07, 0.3, 3), M.tooth, s * 0.4, 0.15, -2.8 + i * 0.5);
    // ---- the tail: five joints, thinner and thinner, the end its kind's own
    const tail = [];
    at = body;
    pos = [0, 0, 4.2];
    for (let i = 0; i < 5; i++) {
        const j = new THREE.Group();
        j.position.set(...pos);
        j.rotation.x = i === 0 ? 0.25 : -0.04;
        at.add(j);
        const w = 1.5 - i * 0.24;
        add(j, boxG(w, w * 0.85, 1.9), M.body, 0, 0, 0.9);
        if (i % 2 === 0 && i < 4) add(j, coneG(0.18, 0.55, 4), M.horn, 0, w * 0.45 + 0.2, 0.9, 0.4);
        tail.push(j);
        at = j;
        pos = [0, 0, 1.8];
    }
    if (kind === 'crimson' || kind === 'obsidian') for (const s of [-1, 1]) add(at, coneG(0.2, 1.1, 4), M.horn, s * 0.3, 0, 2.2, Math.PI / 2, 0, s * 0.6);
    else add(at, coneG(0.55, 1.2, 4), kind === 'ice' ? M.crystal : M.wing, 0, 0, 2.2, Math.PI / 2, 0, 0).scale.set(1.4, 1, 0.25); // (a spade)
    // ---- the legs
    const legs = [];
    for (const [x, z, fore] of [[-1.5, -2.4, 1], [1.5, -2.4, 1], [-1.5, 2.6, 0], [1.5, 2.6, 0]]) {
        const hip = new THREE.Group();
        hip.position.set(x, BODY.y - 0.4, z);
        g.add(hip);
        add(hip, boxG(0.9, 1.8, 1.1), M.body, 0, -0.7, 0);
        const knee = new THREE.Group();
        knee.position.set(0, -1.5, fore ? -0.2 : 0.3);
        hip.add(knee);
        add(knee, boxG(0.7, 1.3, 0.7), M.body, 0, -0.5, 0, fore ? 0.2 : -0.3);
        add(knee, boxG(0.9, 0.3, 1.2), M.bone, 0, -1.05, -0.3); // (the foot, its claws)
        for (let c = -1; c <= 1; c++) add(knee, coneG(0.08, 0.35, 3), M.horn, c * 0.3, -1.05, -0.95, -Math.PI / 2);
        legs.push(hip);
    }
    // ---- the wings
    const wings = [];
    const span = (slender ? 9 : 10.5);
    for (const s of [-1, 1]) {
        const sh = new THREE.Group();
        sh.position.set(s * 1.5, BODY.y + 1.2, -1.6);
        g.add(sh);
        const inner = new THREE.Group();
        inner.scale.x = s; // (the left wing is the right one mirrored)
        sh.add(inner);
        add(inner, boxG(span, 0.3, 0.35), M.bone, span / 2, 0.1, 0, 0, 0, 0, true);
        for (const [fx, a, l] of [[span * 0.95, 0.2, 2.6], [span * 0.7, 0.5, 3.8], [span * 0.42, 0.8, 4.2]]) add(inner, boxG(0.16, 0.16, l), M.bone, fx - Math.sin(a) * l / 2 + 0.1, 0.1, l / 2 + 0.1, 0, a, 0);
        add(inner, coneG(0.16, 0.8, 3), M.horn, span + 0.3, 0.1, 0, 0, 0, -Math.PI / 2); // (the claw at its tip)
        const mem = add(inner, membraneG(span), M.wing, 0, 0, 0, 0, 0, 0, true);
        mem.receiveShadow = false;
        wings.push(sh);
    }
    g.scale.setScalar(SCALE * K.size);
    root.userData = { kind, inner: g, body, neck, head, jaw, tail, legs, wings, size: SCALE * K.size };
    return root;
}

/**
 * The pose of a dragon's model for this frame.
 * @param {THREE.Group} m  (dragonModel)
 * @param {object} p  {t, walk (0–1), fly (0–1: in the air), flap (rad/s of the flapping),
 *   mouth (0–1), look (yaw of the head, rad), lower (0–1: the head down to breathe / bite),
 *   sleep (0–1), sweep (−1…1: the tail swung)}
 */
export function poseDragon(m, p) {
    const u = m.userData;
    const t = p.t;
    const fly = p.fly || 0, walk = p.walk || 0, sleep = p.sleep || 0;
    // wings: folded on the ground (along the body), spread and flapping in the air
    const flap = fly > 0 ? Math.sin(t * (p.flap || 3)) : 0;
    for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1, w = u.wings[i];
        const fold = 1 - Math.max(fly, p.spread || 0);
        // (folded: swept back and down along the flank; spread: out to the side, beating up and down)
        w.rotation.y = s * (-fold * 1.25);
        w.rotation.z = s * (fold * 0.9 + (1 - fold) * (0.15 + flap * 0.65));
        w.rotation.x = fold * 0.25;
    }
    // the body sinks when it sleeps, sways a little as it walks, bobs with the wing-beats
    u.body.position.y = 2.9 - sleep * 1.1 + Math.sin(t * 6) * 0.08 * walk - flap * 0.25 * fly;
    // the neck: up, the head looking; down to breathe or to bite; laid on the ground asleep
    const lower = Math.max(p.lower || 0, sleep);
    u.neck[0].rotation.x = 0.5 - lower * 0.65 + Math.sin(t * 1.3) * 0.04;
    u.neck[0].rotation.y = (p.look || 0) * 0.45;
    u.neck[1].rotation.y = (p.look || 0) * 0.35;
    u.neck[1].rotation.x = -0.2 + lower * 0.15;
    u.head.rotation.y = (p.look || 0) * 0.2;
    u.head.rotation.x = -0.45 + lower * 0.35 - fly * 0.2;
    u.jaw.rotation.x = (p.mouth || 0) * 0.7;
    // the tail: a slow sway; stretched out behind in flight; a sweep
    for (let i = 0; i < u.tail.length; i++) {
        u.tail[i].rotation.y = Math.sin(t * 1.4 - i * 0.6) * (0.08 + 0.04 * i) * (1 - fly * 0.6) + (p.sweep || 0) * 0.32;
        u.tail[i].rotation.x = (i === 0 ? 0.25 - fly * 0.3 - sleep * 0.2 : -0.04 + fly * 0.03);
    }
    // legs: they step as it walks, tuck up in flight, fold under it asleep
    u.legs.forEach((l, i) => {
        const ph = t * 5 + (i === 0 || i === 3 ? 0 : Math.PI);
        l.rotation.x = Math.sin(ph) * 0.45 * walk + fly * (i < 2 ? -0.9 : 0.9) + sleep * (i < 2 ? -0.7 : 0.7);
    });
}

/** Where its mouth is in the world (the fire comes from there). */
export function mouthOf(m, out) {
    m.userData.jaw.getWorldPosition(out);
    return out;
}
