/**
 * AnimalRagdoll.js — the rag doll of a DEAD animal (the author 07.11: «у NPC есть тряпичная кукла — так же у всех животных, когда они умирают»).
 *
 * The same doll as the people's (Ragdoll.js: 11 balls, Verlet, the world's blocks and boxes, goes limp, falls asleep), the points laid on a four-legged
 * body: shoulders = the fore legs' tops, hips = the hind legs' tops (so the torso is a long box lying along the ground), «hands» = the fore hooves
 * (a fore leg is one bar), knees = the hocks, feet = the hind hooves, the head = the poll. The neck and the head follow the head ball as one bar, the
 * legs are aimed at their balls (`RagdollPose.toRig`), the body itself is the root (it lies along the ground at rest, so the rig has a `restQ`).
 *
 * The measures are not guessed: they come from a fresh, un-posed model of the kind (`snapshot`: where the leg pivots, the hocks, the hooves, the poll
 * are; `leg()` of AnimalModels keeps each leg's segment lengths in `userData.legDims`). Cow, pig, sheep, horse (and a winged pig / Pegasus: the folded
 * wings ride the body); a swan is a bird — its own kit: its legs are the hips, its wings the fore limbs. Not here: fish (they float belly up —
 * SeaLife.deadBody), the running book (paper), the minotaur.
 */
import * as THREE from 'three';
import { makeSpec, restQuat, restLocal } from './Ragdoll.js';
import { P } from './Ragdoll.js';
import { animalModel } from './AnimalModels.js';

const _snaps = new Map();
const _v = new THREE.Vector3();
const world = (obj, x = 0, y = 0, z = 0) => obj.localToWorld(_v.set(x, y, z)).toArray();

/** Does this kind get a doll when it dies? */
export const hasDoll = (type) => type === 'cow' || type === 'pig' || type === 'sheep' || type === 'horse';

/** A fresh, un-posed model's measures (once per kind), in the model's own frame at scale 1. */
export function snapshot(type) {
    let s = _snaps.get(type);
    if (s) return s;
    const m = animalModel(type, type === 'horse' ? undefined : 1);
    m.updateMatrixWorld(true);
    const u = m.userData;
    const legs = u.legs.map((l) => ({ l, x: world(l)[0], front: !!l.userData.front }));
    const pick = (front, left) => legs.filter((e) => e.front === front).sort((a, b) => a.x - b.x)[left ? 0 : 1];
    const FL = pick(true, true), FR = pick(true, false), HL = pick(false, true), HR = pick(false, false);
    const front = (e) => { const [uLen, uz, lLen, lz] = e.l.userData.legDims; return { hip: world(e.l), hoof: world(e.l.userData.lower, 0, -lLen, lz), rest: [0, -(uLen + lLen), uz + lz] }; };
    const hind = (e) => { const [uLen, uz, lLen, lz] = e.l.userData.legDims; return { hip: world(e.l), hock: world(e.l.userData.lower), hoof: world(e.l.userData.lower, 0, -lLen, lz), restUp: [0, -uLen, uz], restLow: [0, -lLen, lz] }; };
    const body = new THREE.Box3().setFromObject(u.body);
    const bodyH = body.max.y - body.min.y;
    const neck = u.neck, head = u.head;
    s = {
        fl: front(FL), fr: front(FR), hl: hind(HL), hr: hind(HR),
        headPt: world(head), neckRoot: world(neck),
        neckRest: head.position.toArray(), neckQ: neck.quaternion.toArray(), headQ: head.quaternion.toArray(),
        bodyH, bodyW: body.max.x - body.min.x,
    };
    s.rest = [s.headPt, s.fl.hip, s.fr.hip, s.hl.hip, s.hr.hip, s.fl.hoof, s.fr.hoof, s.hl.hock, s.hl.hoof, s.hr.hock, s.hr.hoof];
    const tr = Math.max(0.18, bodyH * 0.45);
    s.r = [Math.max(0.2, bodyH * 0.28), tr * 0.8, tr * 0.8, tr * 0.8, tr * 0.8, 0.1, 0.1, 0.14, 0.1, 0.14, 0.1];
    s.torsoR = [tr, tr, tr];
    s.hipMid = [(s.hl.hip[0] + s.hr.hip[0]) / 2, (s.hl.hip[1] + s.hr.hip[1]) / 2, (s.hl.hip[2] + s.hr.hip[2]) / 2];
    _snaps.set(type, s);
    return s;
}

const _specs = new Map();
const sizeOf = (c) => c.group.scale.y || 1;
/** The doll's spec for this animal (by kind and size bucket: bounded). */
function specOf(c) {
    const s = snapshot(c.type), k = Math.round(sizeOf(c) * 20) / 20, key = c.type + '|' + k;
    let sp = _specs.get(key);
    if (!sp) {
        sp = makeSpec({ rest: s.rest, r: s.r, torsoR: s.torsoR, faces: -1, scale: k, quad: true });
        // the head ball keeps its distance from the neck's ROOT too (the drawn neck is a bar from there to the head)
        const at = restLocal(sp, s.neckRoot.map((v) => v * k)), h = sp.rest[P.HEAD], nr = s.neckRoot;
        sp.pin = { pt: P.HEAD, at, len: Math.hypot(h[0] - nr[0] * k, h[1] - nr[1] * k, h[2] - nr[2] * k) };
        _specs.set(key, sp);
    }
    return sp;
}

/** The rig of an animal (RagdollPose.toRig / fromRig read it): the same object for every animal, the parts and measures from the animal itself. */
export const ANIMAL_RIG = {
    faces: -1,
    spec: specOf,
    // restQ: below
    root: (c) => c.group,
    hipLocal: (c) => { const h = snapshot(c.type).hipMid, k = sizeOf(c); return [h[0] * k, h[1] * k, h[2] * k]; },
    rootY: () => 0,
    stiff: (c) => {
        const U = c.model.userData, S = snapshot(c.type);
        return [...U.legs.map((l) => l.userData.lower).filter((n) => n && !n.userData.ragFree), { obj: U.head, q: S.headQ }];
    },
    head: (c) => { const S = snapshot(c.type); return { obj: c.model.userData.neck, rest: S.neckRest, q0: S.neckQ }; },
    limbs: (c) => {
        const S = snapshot(c.type), U = c.model.userData;
        const by = (front, left) => { const e = U.legs.filter((l) => !!l.userData.front === front); return e.sort((a, b) => a.position.x - b.position.x)[left ? 0 : 1]; };
        const fl = by(true, true), fr = by(true, false), hl = by(false, true), hr = by(false, false);
        return [
            { obj: fl, to: P.HNL, rest: S.fl.rest }, { obj: fr, to: P.HNR, rest: S.fr.rest },
            { obj: hl, to: P.KNL, rest: S.hl.restUp }, { obj: hl.userData.lower, to: P.FTL, rest: S.hl.restLow },
            { obj: hr, to: P.KNR, rest: S.hr.restUp }, { obj: hr.userData.lower, to: P.FTR, rest: S.hr.restLow },
        ];
    },
    points: (c) => {
        const S = snapshot(c.type), U = c.model.userData;
        const by = (front, left) => { const e = U.legs.filter((l) => !!l.userData.front === front); return e.sort((a, b) => a.position.x - b.position.x)[left ? 0 : 1]; };
        const fl = by(true, true), fr = by(true, false), hl = by(false, true), hr = by(false, false);
        const dims = (l) => l.userData.legDims;
        const hoof = (l) => { const d = dims(l); return [l.userData.lower, 0, -d[2], d[3]]; };
        return [
            [P.HEAD, U.head, 0, 0, 0],
            [P.SHL, fl, 0, 0, 0], [P.SHR, fr, 0, 0, 0], [P.HIPL, hl, 0, 0, 0], [P.HIPR, hr, 0, 0, 0],
            [P.HNL, ...hoof(fl)], [P.HNR, ...hoof(fr)],
            [P.KNL, hl.userData.lower, 0, 0, 0], [P.FTL, ...hoof(hl)], [P.KNR, hr.userData.lower, 0, 0, 0], [P.FTR, ...hoof(hr)],
        ];
    },
    feet: (c) => c.group.position.y,
    place(c, x, y, z) { c.group.position.set(x, y, z); },
    face() {},
};
// (the rest frame's turn, from a spec's own points: the same for every kind — the shoulders in front, the hips behind)
Object.defineProperty(ANIMAL_RIG, 'restQ', { get() { return this._rqNow || (this._rqNow = restQuat(makeSpec({ rest: snapshot('cow').rest, quad: true, faces: -1 }))); } });
