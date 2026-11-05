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
import { P } from './Ragdoll.js';
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

/** Turn that brings `from` (unit) onto the direction `dir` (any length) — into q. */
const aim = (q, from, dir) => { const n = dir.length(); if (n < 1e-6) return q.identity(); return q.setFromUnitVectors(from, dir.multiplyScalar(1 / n)); };

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
