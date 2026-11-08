/**
 * RagdollPose.js — the villager's model drawn BY the rag doll (Ragdoll.js): what is seen is where the doll's balls are, no animation.
 *
 *   fromModel(doll, model)   the doll takes the model's pose of this moment (the arms where they were swung, the step half made)
 *   toModel(doll, model)     the model's parts follow the doll: the torso from its four corners, the head on the neck, each arm from the
 *                            shoulder to the hand, each thigh to the knee, each shin to the foot
 *   capture(model) / apply(model, pose) / blend(model, pose, k)
 *                            the pose as numbers relative to the model's own group: kept by a dead body (Death.js `rp`), sent with it,
 *                            and the getting-up (from the pose it lies in to the model's own standing, smoothly)
 *
 * The parts of VillagerModel: root (feet) → pelvis (+1.95) → body → torso (+0.75) → head (+0.75), arms on the torso (±0.8, +0.55),
 * legs on the pelvis (±0.3), knees (−1.0). The person looks along −Z: x is his right, y up, z behind him.
 * No garbage: module vectors and quaternions only.
 */

import * as THREE from 'three';
import { P, makeSpec, restQuat } from './Ragdoll.js';
import { VILLAGER_FOOT_OFFSET } from '../entities/VillagerModel.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const _s = new THREE.Vector3(), _p = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);
const F = new Float64Array(9);
const pt = [0, 0, 0];

/** The parts a pose holds (the root's place and turn, then each part's turn). */
export const POSE_PARTS = ['pelvis', 'body', 'torso', 'head', 'leftArm', 'rightArm', 'leftLeg', 'leftKnee', 'rightLeg', 'rightKnee'];

/** The doll takes the model's pose of this moment (its world places). */
export function fromModel(doll, model) {
    model.group.updateMatrixWorld(true);
    const put = (i, obj, x, y, z) => { obj.localToWorld(_a.set(x, y, z)); doll.set(i, _a.x, _a.y, _a.z); };
    put(P.HEAD, model.head, 0, 0.6, 0);
    put(P.SHL, model.leftArm, 0, 0, 0); put(P.SHR, model.rightArm, 0, 0, 0);
    put(P.HIPL, model.leftLeg, 0, 0, 0); put(P.HIPR, model.rightLeg, 0, 0, 0);
    put(P.HNL, model.leftArm, 0, -0.95, 0); put(P.HNR, model.rightArm, 0, -0.95, 0);
    put(P.KNL, model.leftKnee, 0, 0, 0); put(P.FTL, model.leftKnee, 0, -0.65, 0);
    put(P.KNR, model.rightKnee, 0, 0, 0); put(P.FTR, model.rightKnee, 0, -0.65, 0);
}

const at = (doll, i, v) => { doll.at(i, pt); return v.set(pt[0], pt[1], pt[2]); };

/**
 * Turn that brings `from` (unit: the part's own axis, DOWN for a limb, UP for the head) onto the direction `dir` (any length) — into q —
 * keeping the part's own side axis (x: his right, the hinge of a knee, the nod of the head) as near as it can to the frame's x. The
 * shortest turn (setFromUnitVectors) twisted a part round itself whenever it pointed near the opposite of `from` (an arm flung up over the
 * head, a head hanging down): the turn's axis is undefined there and it jumped — the knee, the foot, the hand wrung sideways (the author
 * 05.11: «он как-то так искривился странно»). Near the frame's x itself (an arm out sideways) the part's front (z) is kept instead, smoothly.
 */
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3(), _mb = new THREE.Matrix4(), _fq = new THREE.Quaternion();
/** The turn taking +y onto the unit `v` with its x kept nearest the frame's x (near x itself: the front kept instead, blended). */
function frameQ(out, v) {
    _ay.copy(v);
    _ax.set(1, 0, 0).addScaledVector(_ay, -_ay.x);
    let lx = _ax.length();
    if (lx < 0.45) { // (pointing nearly along x: blend in the front's keeping, so the side axis never flips)
        _az.set(0, 0, 1).addScaledVector(_ay, -_ay.z).normalize();
        const w = (0.45 - lx) / 0.45;
        _ax.multiplyScalar(1 - w).add(_az.crossVectors(_ay, _az).multiplyScalar(w));
        lx = _ax.length();
    }
    if (lx < 1e-6) return out.setFromUnitVectors(UP, _ay);
    _ax.multiplyScalar(1 / lx);
    _az.crossVectors(_ax, _ay).normalize();
    _ax.crossVectors(_ay, _az);
    return out.setFromRotationMatrix(_mb.makeBasis(_ax, _ay, _az));
}
/** The turn taking the unit `from` onto `dir` (any length) — the part's side axis kept, never wrung round itself. */
function turnTo(q, from, dir) {
    const n = dir.length();
    if (n < 1e-6) return q.identity();
    frameQ(_fq, from).invert();
    _az.copy(dir).multiplyScalar(1 / n);
    return frameQ(q, _az).multiply(_fq);
}
const aim = (q, from, dir) => turnTo(q, from, dir);

/** The model's parts follow the doll (call after the model's own update: what it animated is overwritten). */
export function toModel(doll, model) {
    const g = model.group;
    g.updateMatrixWorld(true);
    doll.frame(F);
    // the torso's frame in the world: x — his right, y — up the spine, z — behind him; its origin — the middle of the hips
    _m.makeBasis(_a.set(F[0], F[1], F[2]), _b.set(F[3], F[4], F[5]), _c.set(F[6], F[7], F[8]));
    _q.setFromRotationMatrix(_m);                        // torso turn (world)
    at(doll, P.PELVIS, _p);
    // root (world) = pelvis place · turn · (0, −1.95, 0); then into the group's own frame (its place and heading, its scale)
    g.matrixWorld.decompose(_d, _q2, _s);
    const sc = _s.y || 1;
    _a.set(0, -VILLAGER_FOOT_OFFSET * sc, 0).applyQuaternion(_q).add(_p);
    _m.compose(_a, _q, _s);
    _inv.copy(g.matrixWorld).invert();
    _m2.multiplyMatrices(_inv, _m);
    _m2.decompose(model.root.position, model.root.quaternion, _d);
    model.pelvis.position.set(0, VILLAGER_FOOT_OFFSET, 0); model.pelvis.quaternion.identity();
    model.body.quaternion.identity(); model.body.position.set(0, 0, 0);
    model.torso.quaternion.identity();
    _qt.copy(_q).invert();                              // world → torso frame
    // the head: from the neck (1.5 above the hips on the spine) to the head's middle
    at(doll, P.HEAD, _a); at(doll, P.CHEST, _b);
    _c.set(0, 1.5 * sc, 0).applyQuaternion(_q).add(_p); // (the neck in the world)
    _a.sub(_c).applyQuaternion(_qt);
    aim(model.head.quaternion, UP, _a);
    // the arms: shoulder → hand, in the torso's frame
    at(doll, P.HNL, _a); at(doll, P.SHL, _b); aim(model.leftArm.quaternion, DOWN, _a.sub(_b).applyQuaternion(_qt));
    at(doll, P.HNR, _a); at(doll, P.SHR, _b); aim(model.rightArm.quaternion, DOWN, _a.sub(_b).applyQuaternion(_qt));
    // the legs: hip → knee (pelvis frame = torso frame), then knee → foot in the thigh's own frame
    leg(doll, model.leftLeg, model.leftKnee, P.HIPL, P.KNL, P.FTL);
    leg(doll, model.rightLeg, model.rightKnee, P.HIPR, P.KNR, P.FTR);
}

function leg(doll, hip, knee, h, k, f) {
    at(doll, k, _a); at(doll, h, _b);
    aim(hip.quaternion, DOWN, _a.sub(_b).applyQuaternion(_qt));
    at(doll, f, _a); at(doll, k, _b);
    _a.sub(_b).applyQuaternion(_qt).applyQuaternion(_q2.copy(hip.quaternion).invert());
    aim(knee.quaternion, DOWN, _a);
    knee.position.set(0, -1.0, 0);
}

/**
 * The model's own animation sets only some turns (the legs and knees round x, the root's height): what the doll left in the others is
 * taken off, so the model stands as itself again (before a blend frame and when the doll is done).
 */
export function cleanOwn(model) {
    for (const k of ['leftLeg', 'rightLeg', 'leftKnee', 'rightKnee']) { const r = model[k].rotation; r.set(r.x, 0, 0); }
    model.leftKnee.position.set(0, -1.0, 0); model.rightKnee.position.set(0, -1.0, 0);
    model.pelvis.quaternion.identity(); model.torso.quaternion.identity();
    model.root.position.x = 0; model.root.position.z = 0; model.root.quaternion.identity();
}

/** The pose now, as numbers relative to the model's group (the root's place + turn, each part's turn): 7 + 4·10 numbers. */
export function capture(model, out = []) {
    out.length = 0;
    const r = model.root;
    out.push(r.position.x, r.position.y, r.position.z, r.quaternion.x, r.quaternion.y, r.quaternion.z, r.quaternion.w);
    for (const k of POSE_PARTS) { const q = model[k].quaternion; out.push(q.x, q.y, q.z, q.w); }
    return out;
}

/** Put a captured pose on a model (a dead body made again from its record, another computer's body). */
export function apply(model, pose) {
    if (!Array.isArray(pose) || pose.length < 7 + 4 * POSE_PARTS.length) return false;
    model.root.position.set(pose[0], pose[1], pose[2]);
    model.root.quaternion.set(pose[3], pose[4], pose[5], pose[6]).normalize();
    POSE_PARTS.forEach((k, i) => { const j = 7 + i * 4; model[k].quaternion.set(pose[j], pose[j + 1], pose[j + 2], pose[j + 3]).normalize(); });
    model.pelvis.position.set(0, VILLAGER_FOOT_OFFSET, 0);
    model.leftKnee.position.set(0, -1.0, 0); model.rightKnee.position.set(0, -1.0, 0);
    return true;
}

/** From a captured pose (k = 0) to what the model's own animation set this frame (k = 1): getting up. */
export function blend(model, pose, k) {
    if (!Array.isArray(pose)) return;
    const r = model.root;
    _a.set(pose[0], pose[1], pose[2]);
    r.position.lerpVectors(_a, r.position, k);
    _q.set(pose[3], pose[4], pose[5], pose[6]);
    r.quaternion.copy(_q.slerp(r.quaternion, k));
    POSE_PARTS.forEach((n, i) => { const j = 7 + i * 4; _q.set(pose[j], pose[j + 1], pose[j + 2], pose[j + 3]); model[n].quaternion.copy(_q.slerp(model[n].quaternion, k)); });
}

/** The model's own pose of this frame put into the group's frame again after the group moved/turned (the root kept in the world). */
export function rebaseRoot(pose, fromGroupMatrix, toGroup) {
    _m.compose(_a.set(pose[0], pose[1], pose[2]), _q.set(pose[3], pose[4], pose[5], pose[6]), _s.set(1, 1, 1));
    _m2.multiplyMatrices(fromGroupMatrix, _m);
    toGroup.updateMatrixWorld(true);
    _inv.copy(toGroup.matrixWorld).invert();
    _m.multiplyMatrices(_inv, _m2);
    _m.decompose(_a, _q, _s);
    pose[0] = _a.x; pose[1] = _a.y; pose[2] = _a.z; pose[3] = _q.x; pose[4] = _q.y; pose[5] = _q.z; pose[6] = _q.w;
    return pose;
}

// =====================================================================================================================================
// Other humanoid bodies: a rig says where each point of the doll is on the model, which part follows which bone, and where the body stands.
// (a villager, a wizard, a knight, the king, a merchant, a wanderer and a sailor are all VillagerModel — the functions above)
// =====================================================================================================================================

const _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _jw = new THREE.Vector3(), _dl = new THREE.Vector3(), _rest = new THREE.Vector3();

/**
 * A rig: { spec (Ragdoll.makeSpec), faces, root(c) (the object placed and turned whole), hipLocal (the hips' middle in the root's frame),
 *   stiff(c) → parts kept straight (identity), head(c) → {obj, rest} | null, limbs(c) → [{obj, from, to, rest, joint?, half?}] (parents first;
 *   joint/half — a part whose mesh is centred on its middle, not hung from its joint: a zombie's arm),
 *   points(c) → [[point, obj, x, y, z]] (where the doll's points are on the model now), feet(c) → the y of the feet, place(c, x, y, z), face(c, fx, fz) }.
 */
export function fromRig(doll, rig, c) {
    const pts = rig.points(c);
    pts[0][1].updateWorldMatrix(true, false);
    rig.root(c).updateMatrixWorld(true);
    for (const [i, obj, x, y, z] of pts) { obj.localToWorld(_a.set(x, y, z)); doll.set(i, _a.x, _a.y, _a.z); }
}

/** The model's parts follow the doll (any rig). `dy` — the body sinking into the ground (a corpse's last seconds): the drawn body goes with it. */
export function toRig(doll, rig, c, dy = 0) {
    const root = rig.root(c), par = root.parent;
    if (!par) return;
    for (const o of rig.stiff(c)) { if (o.obj) o.obj.quaternion.set(o.q[0], o.q[1], o.q[2], o.q[3]); else o.quaternion.identity(); } // (a part with a rest turn of its own — an animal's head — keeps it)
    par.updateWorldMatrix(true, false);
    doll.frame(F);
    _m.makeBasis(_a.set(F[0], F[1], F[2]), _b.set(F[3], F[4], F[5]), _c.set(F[6], F[7], F[8]));
    _q.setFromRotationMatrix(_m);
    const rq = typeof rig.restQ === 'function' ? rig.restQ(c) : rig.restQ;
    if (rq) _q.multiply(_qt.set(rq[0], rq[1], rq[2], rq[3]).invert()); // (a torso lying along the ground at rest — a horse: the model's own axes are the rest frame's turn away)
    at(doll, P.PELVIS, _p); _p.y += dy;
    par.matrixWorld.decompose(_d, _q2, _s);
    const h = typeof rig.hipLocal === 'function' ? rig.hipLocal(c) : rig.hipLocal;
    _a.set(-h[0] * _s.x, -h[1] * _s.y, -h[2] * _s.z).applyQuaternion(_q).add(_p);
    _m.compose(_a, _q, _s);
    _inv.copy(par.matrixWorld).invert();
    _m2.multiplyMatrices(_inv, _m);
    _m2.decompose(root.position, root.quaternion, _d);
    root.updateMatrixWorld(true);
    const hd = rig.head(c);
    if (hd) aimPart(hd.obj, hd.rest, at(doll, P.HEAD, _b).add(_jw.set(0, dy, 0)), null, 0, hd.q0);
    for (const L of rig.limbs(c)) {
        at(doll, L.to, _b); _b.y += dy;
        aimPart(L.obj, L.rest, _b, L.joint, L.half || 0);
    }
}

/** Turn a part so that its bone (`rest`, in its own frame) points at the world point `target`; a centred part also moves to the bone's middle. */
function aimPart(obj, rest, target, joint, half, q0) {
    const par = obj.parent;
    par.getWorldQuaternion(_pq);
    if (joint) par.localToWorld(_jw.set(joint[0], joint[1], joint[2])); else obj.getWorldPosition(_jw);
    _dl.copy(target).sub(_jw).applyQuaternion(_wq.copy(_pq).invert());
    _rest.set(rest[0], rest[1], rest[2]).normalize();
    if (q0) _rest.applyQuaternion(_qt.set(q0[0], q0[1], q0[2], q0[3])); // (a part whose rest turn is not the identity: its bone in the parent's frame)
    const n = _dl.length();
    if (n > 1e-6) { turnTo(obj.quaternion, _rest, _dl); if (q0) obj.quaternion.multiply(_qt.set(q0[0], q0[1], q0[2], q0[3])); } // (its side axis kept: no wringing — turnTo)
    if (joint) obj.position.set(joint[0], joint[1], joint[2]).addScaledVector(_rest.applyQuaternion(obj.quaternion), half);
    obj.updateMatrixWorld(true);
}

/** Back to its own animation: what the doll turned is set straight (its own animation then sets what it sets). */
export function cleanRig(rig, c) {
    const root = rig.root(c);
    rig.end?.(c);
    root.quaternion.identity(); root.position.x = 0; root.position.z = 0; root.position.y = rig.rootY ? rig.rootY(c) : root.position.y;
    for (const o of rig.stiff(c)) o.quaternion.identity();
    const hd = rig.head(c); if (hd) hd.obj.quaternion.identity();
    for (const L of rig.limbs(c)) { L.obj.quaternion.identity(); if (L.joint) L.obj.position.set(L.joint[0], L.joint[1] - L.half, L.joint[2]); }
}

// ------------------------------------------------------------------ the zombie (Zombie.js: blocks centred on their middles, it looks along +Z)
const ZOMBIE_REST = [
    [0, 3.1, 0],                          // head (its middle, 2.1 over the group; the feet 1.0 under it)
    [-0.7, 2.4, 0], [0.7, 2.4, 0],        // shoulders (the arm block's top; its own 0.1 forward lean left out: the torso is upright)
    [-0.3, 1.3, 0], [0.3, 1.3, 0],        // hips (the leg block's top)
    [-0.7, 1.45, 0], [0.7, 1.45, 0],      // hands (0.95 down the 1.2 m arm)
    [-0.3, 0.7, 0], [-0.3, 0.35, 0],      // knee (the leg's middle — it has none), foot
    [0.3, 0.7, 0], [0.3, 0.35, 0],
];
const _zSpecs = new Map();
/** The zombie's stretch (1 × 1.12 × 1 on its group): lying, a group stretched up would make the body fat, not long — so while it is a doll the
 * stretch moves into the body's own frame (the pivot's inner group) and the group is 1 × 1 × 1; `end` puts it back. */
const zs = (c) => c.userData?.ragScale || c._ragScale || c.group.scale;
export const ZOMBIE_RIG = {
    faces: 1,
    spec: (c) => { const S = zs(c), key = `${S.x.toFixed(2)}|${S.y.toFixed(2)}`; let s = _zSpecs.get(key); if (!s) { s = makeSpec({ rest: ZOMBIE_REST, faces: 1, scale: [S.x, S.y, S.z], torsoR: [0.55, 0.55, 0.5], rigidHead: true }); _zSpecs.set(key, s); } return s; },
    begin(c) {
        const piv = c.group.userData.impPivot, inner = piv?.children[0];
        if (!inner || c._ragScale) return;
        c._ragScale = c.group.scale.clone();
        const S = c._ragScale;
        inner.scale.copy(S); inner.position.set(0, 0.6 * S.y, 0);
        piv.position.y = -0.6 * S.y;
        c.group.scale.set(1, 1, 1);
    },
    end(c) {
        const piv = c.group.userData.impPivot, inner = piv?.children[0];
        if (!inner || !c._ragScale) return;
        c.group.scale.copy(c._ragScale);
        inner.scale.set(1, 1, 1); inner.position.set(0, 0.6, 0);
        piv.position.y = -0.6;
        c._ragScale = null;
    },
    root: (c) => c.group.userData.impPivot,
    hipLocal: (c) => { const S = zs(c); _hl[1] = 0.9 * S.y; return _hl; }, // (the hips in the pivot's frame: 0.6 up to the inner group, then 0.3 of its stretched frame)
    rootY: (c) => -0.6 * (c._ragScale ? c._ragScale.y : 1),
    stiff: (c) => [c.head, c.body].filter(Boolean),
    head: () => null,                // (the head block sits on the body: no neck)
    limbs: (c) => [
        { obj: c.leftArm, to: P.HNL, rest: [0, -1, 0], joint: [-0.7, 1.4, 0], half: 0.6 },
        { obj: c.rightArm, to: P.HNR, rest: [0, -1, 0], joint: [0.7, 1.4, 0], half: 0.6 },
        { obj: c.leftLeg, to: P.FTL, rest: [0, -1, 0], joint: [-0.3, 0.3, 0], half: 0.6 },
        { obj: c.rightLeg, to: P.FTR, rest: [0, -1, 0], joint: [0.3, 0.3, 0], half: 0.6 },
    ].filter((L) => L.obj),
    points: (c) => [
        [P.HEAD, c.head, 0, 0, 0],
        [P.SHL, c.leftArm, 0, 0.6, 0], [P.SHR, c.rightArm, 0, 0.6, 0],
        [P.HNL, c.leftArm, 0, -0.35, 0], [P.HNR, c.rightArm, 0, -0.35, 0],
        [P.HIPL, c.leftLeg, 0, 0.6, 0], [P.HIPR, c.rightLeg, 0, 0.6, 0],
        [P.KNL, c.leftLeg, 0, 0, 0], [P.KNR, c.rightLeg, 0, 0, 0],
        [P.FTL, c.leftLeg, 0, -0.35, 0], [P.FTR, c.rightLeg, 0, -0.35, 0],
    ],
    feet: (c) => c.group.position.y - 1.0 * zs(c).y,
    place(c, x, y, z) { c.group.position.set(x, y + 1.0 * zs(c).y, z); },
    face(c, fx, fz) { c.yaw = Math.atan2(fx, fz); c.group.rotation.set(0, c.yaw, 0); },
};
const _hl = [0, 0.9, 0];

// ------------------------------------------------------------------ the Taron (TaronModel.js: root → hips → legs/knees, torso → neck → head, arms/elbows)
const TARON_REST = [
    [0, 5.76, -0.17],                       // head (its middle, 0.5 over the head's pivot)
    [-1.55, 4.71, 0], [1.55, 4.71, 0],      // shoulders
    [-0.85, 2.16, 0], [0.85, 2.16, 0],      // hips
    [-1.55, 1.85, 0], [1.55, 1.85, 0],      // hands (at the axe's grip, the elbows straight)
    [-0.85, 1.11, 0], [-0.85, 0.29, -0.18], // knee, foot
    [0.85, 1.11, 0], [0.85, 0.29, -0.18],
];
const TARON_R = [0.85, 0.65, 0.65, 0.7, 0.7, 0.4, 0.4, 0.5, 0.45, 0.5, 0.45];
const _tSpecs = new Map();
export const TARON_RIG = {
    faces: -1,
    spec: (c) => { const k = Math.round((c.model.scale.y || 1) * 100) / 100; let s = _tSpecs.get(k); if (!s) { s = makeSpec({ rest: TARON_REST, r: TARON_R, faces: -1, scale: k, torsoR: [1.25, 1.6, 1.4], rigidHead: true }); _tSpecs.set(k, s); } return s; },
    root: (c) => c.model.userData.root,
    hipLocal: [0, 2.16, 0],          // (the legs hang 0.1 under the hips' group)
    stiff: (c) => { const U = c.model.userData; return [U.hips, U.torso, U.neck, U.elbowL, U.elbowR].filter(Boolean); },
    head: (c) => ({ obj: c.model.userData.head, rest: [0, 1, 0] }),
    limbs: (c) => { const U = c.model.userData; return [
        { obj: U.armL, to: P.HNL, rest: [0, -1, 0] }, { obj: U.armR, to: P.HNR, rest: [0, -1, 0] },
        { obj: U.legL, to: P.KNL, rest: [0, -1, 0] }, { obj: U.kneeL, to: P.FTL, rest: [0, -0.82, -0.18] },
        { obj: U.legR, to: P.KNR, rest: [0, -1, 0] }, { obj: U.kneeR, to: P.FTR, rest: [0, -0.82, -0.18] },
    ]; },
    points: (c) => { const U = c.model.userData; return [
        [P.HEAD, U.head, 0, 0.5, 0], [P.SHL, U.armL, 0, 0, 0], [P.SHR, U.armR, 0, 0, 0],
        [P.HNL, U.elbowL, 0, -1.36, 0], [P.HNR, U.elbowR, 0, -1.36, 0],
        [P.HIPL, U.legL, 0, 0, 0], [P.HIPR, U.legR, 0, 0, 0],
        [P.KNL, U.kneeL, 0, 0, 0], [P.KNR, U.kneeR, 0, 0, 0], [P.FTL, U.kneeL, 0, -0.82, -0.18], [P.FTR, U.kneeR, 0, -0.82, -0.18],
    ]; },
    rootY: () => 0,
    feet: (c) => c.model.position.y,
    place(c, x, y, z) { c.model.position.set(x, y, z); },
    face(c, fx, fz) { c.model.rotation.y = Math.atan2(-fx, -fz); c.yaw = c.model.rotation.y; },
};

/**
 * (Duel: where a charge can touch a body lying as a doll) The object the doll places and turns, its parent, and where that object sits in its
 * parent standing — a point of the standing body in the parent's frame minus this, through the object's world frame, is where it is now.
 */
export function ragRootOf(c, out = [null, null, 0, 0, 0]) {
    if (c.model?.root && c.model.leftKnee && c.group) { out[0] = c.model.root; out[1] = c.group; out[2] = 0; out[3] = -VILLAGER_FOOT_OFFSET; out[4] = 0; return out; }
    const piv = c.group?.userData?.impPivot;
    if (piv && c.leftArm) { out[0] = piv; out[1] = c.group; out[2] = 0; out[3] = -0.6 * (c._ragScale ? c._ragScale.y : 1); out[4] = 0; return out; }
    if (c.model?.userData?.root && c.model.userData.kneeL) { out[0] = c.model.userData.root; out[1] = c.model; out[2] = 0; out[3] = 0; out[4] = 0; return out; }
    return null;
}
