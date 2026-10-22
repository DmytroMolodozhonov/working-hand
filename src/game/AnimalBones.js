/**
 * AnimalBones.js — the skeleton an animal leaves when its meat is gone: a real one of its own kind
 * (a cow with horn cores, a long horse skull, a pig with a snout disc, a ram with curled horns),
 * not five sticks. Nothing is sized by eye: every length comes from the living model itself
 * (its body, head, legs and tail boxes — `measure`), so the skeleton fills the animal's own volume.
 * One merged shape per kind, made once and shared by every skeleton (one draw call each).
 *
 * No skeleton for the owl and the birds (books-birds, the owl): their bones are tiny, they simply vanish
 * (the author's decision) — `hasSkeleton` is false for them. The running book has no bones at all (it is paper).
 */
import * as THREE from 'three';
import { animalModel } from './AnimalModels.js';
import { mergeParts } from '../core/MergeGeometry.js';

/** Kinds that leave a skeleton (the same ones that have meat). */
export const SKELETON_KINDS = ['cow', 'pig', 'sheep', 'horse'];
export const hasSkeleton = (type) => SKELETON_KINDS.includes(type);

const BONE = new THREE.MeshLambertMaterial({ color: 0xefe9da }); // (the same colour as a person's skeleton)
BONE.userData.shared = true;

const _geo = {};
const unitBox = () => (_geo.box ||= new THREE.BoxGeometry(1, 1, 1));
const unitCyl = () => (_geo.cyl ||= new THREE.CylinderGeometry(1, 1, 1, 7)); // (axis y, length 1, radius 1)
const unitBall = () => (_geo.ball ||= new THREE.SphereGeometry(1, 8, 6));
const unitArc = () => (_geo.arc ||= new THREE.TorusGeometry(1, 0.05, 5, 12, Math.PI)); // (a half ring, the upper half)

const _y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _d = new THREE.Vector3();

/** A bone between two points (a plain rod of radius r). */
function rod(out, a, b, r) {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _d.length();
    if (len < 1e-5) return;
    _q.setFromUnitVectors(_y, _d.normalize());
    const e = new THREE.Euler().setFromQuaternion(_q);
    out.push({ geo: unitCyl(), pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [e.x, e.y, e.z], scale: [r, len, r] });
}
const ball = (out, p, r) => out.push({ geo: unitBall(), pos: [p[0], p[1], p[2]], scale: [r, r, r] });
const slab = (out, p, s, rot = [0, 0, 0]) => out.push({ geo: unitBox(), pos: p, rot, scale: s });

/** What the living model measures: body, head, tail boxes and where the legs hang. */
function measure(type) {
    const m = animalModel(type, 1);
    const u = m.userData;
    if (u.wings) for (const w of [].concat(u.wings)) if (w) w.visible = false;
    m.updateMatrixWorld(true);
    const box = (o) => new THREE.Box3().setFromObject(o);
    const whole = new THREE.Box3();
    m.traverse((o) => { if (o.isMesh && o.visible) { let hid = false; for (let p = o; p; p = p.parent) if (p.visible === false) hid = true; if (!hid) whole.expandByObject(o); } });
    const legs = u.legs.map((l) => { l.updateWorldMatrix(true, false); const p = new THREE.Vector3().setFromMatrixPosition(l.matrixWorld); return { x: p.x, y: p.y, z: p.z, front: !!l.userData.front }; });
    return { whole, body: box(u.body), head: box(u.head), tail: box(u.tail), legs };
}

/** Per kind: how the head leans, how long its face is, and the horns. */
const KIND = {
    cow: { tilt: 0.45, face: 0.62, ribs: 13, horns: 'rod', hock: 0.06 },
    pig: { tilt: 0.25, face: 0.6, ribs: 14, horns: null, snout: true, hock: 0.05 },
    sheep: { tilt: 0.3, face: 0.58, ribs: 13, horns: 'curl', hock: 0.06 },
    horse: { tilt: 0.7, face: 0.72, ribs: 18, horns: null, hock: 0.1 },
};

function build(type) {
    const K = KIND[type];
    const M = measure(type);
    const { body, head, tail, whole } = M;
    const out = [];
    const bz0 = body.min.z, bz1 = body.max.z, bL = bz1 - bz0;
    const by0 = body.min.y, by1 = body.max.y, bH = by1 - by0;
    const hw = (body.max.x - body.min.x) / 2;
    // ---- spine: the withers over the front, along the back, to the tail's root, then down the tail
    const spineY = by1 - 0.14 * bH;
    const nz = head.max.z; // the neck's base: where the head ends toward the body
    const withers = [0, spineY + 0.03 * bH, bz0 + 0.14 * bL];
    const croup = [0, spineY, bz1 - 0.08 * bL];
    const tailEnd = [0, tail.min.y + 0.12 * (tail.max.y - tail.min.y), tail.max.z];
    const tailRoot = [0, croup[1] - 0.02, bz1 - 0.02 * bL];
    // neck: from the withers up and forward to the back of the skull
    const hh = head.max.y - head.min.y, hl = head.max.z - head.min.z;
    const skullBack = [0, head.max.y - 0.22 * hh, head.min.z + hl * 0.92];
    const skullEnd = [0, head.max.y - 0.22 * hh - K.tilt * hh * 0.7, head.min.z + 0.03 * hl];
    const nv = 7;
    const neckPts = [];
    for (let i = 0; i <= nv; i++) { const t = i / nv; neckPts.push([0, withers[1] + (skullBack[1] - withers[1]) * t, withers[2] + (skullBack[2] - withers[2]) * t]); }
    const pts = neckPts;
    for (let i = 0; i + 1 < pts.length; i++) rod(out, pts[i], pts[i + 1], 0.028 + 0.004 * (1 - i / pts.length));
    const spineN = Math.max(12, Math.round(bL / 0.075));
    let prev = withers;
    for (let i = 1; i <= spineN; i++) {
        const t = i / spineN;
        const p = [0, withers[1] + (croup[1] - withers[1]) * t - 0.03 * bH * Math.sin(t * Math.PI), withers[2] + (croup[2] - withers[2]) * t];
        rod(out, prev, p, 0.034);
        slab(out, [0, p[1] + 0.03, p[2]], [0.012, 0.07, 0.04]); // a spinous process
        prev = p;
    }
    // ---- tail: a chain of small vertebrae hanging from the root to the tail model's end
    const tn = Math.max(5, Math.round(Math.hypot(tailEnd[1] - tailRoot[1], tailEnd[2] - tailRoot[2]) / 0.09));
    let tp = tailRoot;
    for (let i = 1; i <= tn; i++) {
        const t = i / tn;
        const p = [0, tailRoot[1] + (tailEnd[1] - tailRoot[1]) * t, tailRoot[2] + (tailEnd[2] - tailRoot[2]) * t];
        rod(out, tp, p, 0.026 * (1 - t * 0.6));
        tp = p;
    }
    // ---- ribs: arches round the chest (front 58 % of the body), a breastbone under them
    const chestZ0 = bz0 + 0.1 * bL, chestZ1 = bz0 + 0.62 * bL;
    const nribs = K.ribs / 2 | 0;
    const ribDepth = (spineY - by0) * 0.98;
    for (let i = 0; i < nribs; i++) {
        const t = i / (nribs - 1);
        const z = chestZ0 + (chestZ1 - chestZ0) * t;
        const k = 0.78 + 0.22 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)); // the middle ribs are the widest
        out.push({ geo: unitArc(), pos: [0, spineY - 0.02, z], rot: [0, 0, Math.PI], scale: [hw * 0.92 * k, ribDepth * k, 1.6] });
    }
    slab(out, [0, spineY - ribDepth * 0.93, (chestZ0 + chestZ1) / 2], [0.07, 0.04, chestZ1 - chestZ0]);
    // ---- pelvis: two hip bones and a sacrum slab; shoulder blades: two flat blades over the front legs
    const pz = bz1 - 0.14 * bL;
    slab(out, [0, spineY - 0.03, pz], [hw * 1.1, 0.05, 0.2 * bL]);
    for (const s of [-1, 1]) {
        slab(out, [s * hw * 0.62, spineY - 0.1 * bH, pz], [0.05, 0.2 * bH, 0.2 * bL], [0.35, 0, s * 0.15]);
        slab(out, [s * hw * 0.55, spineY - 0.04 * bH, withers[2] + 0.03 * bL], [0.035, 0.28 * bH, 0.15 * bL], [0.45, 0, s * 0.2]);
    }
    // ---- legs: from the hip / shoulder joint (the model's own pivot) down to the hoof at y = 0
    for (const l of M.legs) {
        const top = [l.x, l.y + 0.0, l.z];
        const foot = [l.x, 0.05, l.z];
        const midY = l.y * 0.5;
        const knee = [l.x, midY, l.z + (l.front ? 0 : K.hock)];
        const rUp = 0.04 + 0.02 * Math.min(1, l.y), rLow = rUp * 0.62;
        // the top end joins the ribs / pelvis
        const join = [l.x * 0.8, l.front ? spineY - ribDepth * 0.55 : spineY - 0.05, l.z];
        rod(out, join, top, rUp * 0.9);
        ball(out, top, rUp * 1.5);
        rod(out, top, knee, rUp);
        ball(out, knee, rUp * 1.3);
        rod(out, knee, foot, rLow);
        slab(out, [l.x, 0.045, l.z - 0.01], [rLow * 3.2, 0.09, rLow * 4]); // the hoof bone
    }
    // ---- skull
    const L = Math.hypot(skullBack[2] - skullEnd[2], skullBack[1] - skullEnd[1]);
    const crW = Math.min(hw * 0.45, Math.max(0.1, (head.max.x - head.min.x) * 0.4));
    const mid = (a, b, t) => [0, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const cranium = mid(skullBack, skullEnd, 0.25);
    out.push({ geo: unitBall(), pos: cranium, scale: [crW, crW * 0.95, L * 0.2] });
    const fEnd = mid(skullBack, skullEnd, 1);
    const fStart = mid(skullBack, skullEnd, 0.3);
    rod(out, fStart, fEnd, crW * (type === 'horse' ? 0.5 : 0.62)); // the muzzle
    out.push({ geo: unitBall(), pos: fEnd, scale: [crW * 0.55, crW * 0.5, crW * 0.55] });
    // jaw: a thinner rod under the muzzle
    const jawA = [0, cranium[1] - crW * 0.7, cranium[2] + 0.02], jawB = [0, fEnd[1] - crW * 0.5, fEnd[2] + 0.04];
    rod(out, jawA, jawB, crW * 0.28);
    if (K.snout) { // a pig's flat snout disc on the end
        out.push({ geo: unitCyl(), pos: [0, fEnd[1] - 0.01, fEnd[2] - 0.03], rot: [Math.PI / 2, 0, 0], scale: [crW * 0.7, 0.04, crW * 0.7] });
    }
    for (const s of [-1, 1]) {
        ball(out, [s * crW * 0.85, cranium[1] + crW * 0.1, cranium[2] - L * 0.04], crW * 0.28); // eye sockets' rims
        if (K.horns === 'rod') { // a cow: horn cores growing out and up
            const a = [s * crW * 0.8, cranium[1] + crW * 0.55, cranium[2] + L * 0.05];
            rod(out, a, [s * (crW + 0.1), a[1] + 0.03, a[2] - 0.03], 0.024);
            rod(out, [s * (crW + 0.1), a[1] + 0.03, a[2] - 0.03], [s * (crW + 0.16), a[1] + 0.13, a[2] - 0.08], 0.018);
        }
        if (K.horns === 'curl') { // a ram: a horn curling back round beside the head
            const a = [s * crW * 0.8, cranium[1] + crW * 0.6, cranium[2] + L * 0.05];
            let p = a;
            for (let i = 1; i <= 6; i++) {
                const ang = i * 0.55;
                const q = [s * (crW * 0.8 + 0.1 * Math.sin(ang)), a[1] + 0.06 * (1 - Math.cos(ang)) - 0.02 * i, a[2] + 0.1 * (1 - Math.cos(ang)) + 0.01 * i];
                rod(out, p, q, 0.03 * (1 - i / 9));
                p = q;
            }
        }
    }
    // the whole skeleton lies inside the model's own box — fit it to 94 % of its length and height
    const geo = mergeParts(out);
    geo.computeBoundingBox();
    const sb = geo.boundingBox;
    const kz = Math.min(1.04, 0.95 * (whole.max.z - whole.min.z) / (sb.max.z - sb.min.z));
    const ky = Math.min(1.04, 0.95 * (whole.max.y - whole.min.y) / (sb.max.y - sb.min.y));
    return { geo, kz, ky, whole };
}

const _cache = {};
/** The shared merged shape of a kind's skeleton (null: no skeleton for it). */
export function skeletonGeometry(type) {
    if (!hasSkeleton(type)) return null;
    if (!_cache[type]) {
        const b = build(type);
        // (stretched to the living animal's length / height; the box is rechecked by the unit test)
        b.geo.scale(1, b.ky, b.kz);
        b.geo.computeBoundingBox();
        const bb = b.geo.boundingBox;
        b.geo.translate(0, -bb.min.y, 0);
        const wc = (b.whole.max.z + b.whole.min.z) / 2;
        b.geo.translate(0, 0, wc - (bb.max.z + bb.min.z) / 2);
        b.geo.computeBoundingBox();
        b.geo.computeBoundingSphere();
        b.geo.userData.shared = true;
        b.geo.userData.keep = true;
        _cache[type] = b.geo;
    }
    return _cache[type];
}

/** A skeleton of the kind in the model's own coordinates (feet at y = 0, facing −Z) — scale it like the living animal. null: none. */
export function animalBonesModel(type) {
    const geo = skeletonGeometry(type);
    if (!geo) return null;
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, BONE);
    m.castShadow = true;
    g.add(m);
    g.userData.shared = true;
    return g;
}

/** For the unit test: the living model's size and the skeleton's. */
export function boneFit(type) {
    const geo = skeletonGeometry(type);
    if (!geo) return null;
    const M = measure(type);
    return { model: M.whole, bones: geo.boundingBox };
}

/** Warm the kinds' shapes up (loading screen / prewarm), and the shared material. */
export function sampleBones() {
    return SKELETON_KINDS.map((t) => animalBonesModel(t));
}
