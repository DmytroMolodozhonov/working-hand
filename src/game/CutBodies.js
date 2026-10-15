/**
 * CutBodies.js — what can be cut off each kind of creature, and where its body
 * stops a blade. One description per kind (pure three.js, runs in node):
 *
 *   players (VoxelCharacter) · villagers / knights / the king / wizards (VillagerModel)
 *   zombies · animals (cow, pig, sheep, horse — legs and head) · the giant spider (legs)
 *   anything else that offers `target.cutBody()` (a living tree's branch arms…)
 *
 * A body = { root, limbs: [...LimbSurgery limbs], blockers: [{obj, c, half}], attach?: Set }
 *   limbs: arms / legs are chains of bones (d measured from the shoulder / hip);
 *          the head is a neck line (obj frame) and the parts that fall with it.
 *   blockers: boxes (in their object's frame) a blade can't go through — the torso, the skull:
 *          a slash that meets them first is stopped there (no cut behind them).
 * Descriptions are built once per model and cached on it.
 */

import * as THREE from 'three';

export const TORSO_HALF = [0.55, 0.72, 0.36]; // body box 1.2 × 1.5 × 0.8, a little inside
export const NECK = { a: [0, 0.70, 0], b: [0, 1.05, 0] }; // torso frame: between the shoulders and the skull

/** A player hero (VoxelCharacter). */
export function characterBody(ch) {
    if (ch._cutBody) return ch._cutBody;
    const arm = (side) => {
        const A = side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor;
        const E = side === 'left' ? ch.leftElbowAnchor : ch.rightElbowAnchor;
        const hands = side === 'left' ? [ch.leftSimplifiedHand.group, ch.leftDetailedHand.group] : [ch.rightSimplifiedHand.group, ch.rightDetailedHand.group];
        return {
            name: side + 'Arm', kind: 'arm', side,
            segs: [
                { obj: A, o: [0, 0, 0], ax: [0, 0, 1], len: ch.BONE_LENGTH_UPPER, part: 'upperArm' },
                { obj: E, o: [0, 0, 0], ax: [0, 0, 1], len: ch.BONE_LENGTH_LOWER, part: 'forearm' },
                // the hand: goes whole (its fingers move); shown / hidden by setShowHands
                { obj: hands[0], objs: hands, o: [0, 0, 0], ax: [0, 0, 1], len: 0.3, whole: true, noHide: true, part: 'hand', capW: 0.32 },
            ],
        };
    };
    const leg = (side) => ({
        name: side + 'Leg', kind: 'leg', side,
        segs: [{ obj: side === 'left' ? ch.leftLegPivot : ch.rightLegPivot, o: [0, 0, 0], ax: [0, -1, 0], len: 1.95, part: 'leg', knee: 0.95 }],
    });
    ch._cutBody = {
        root: ch,
        kind: 'humanoid',
        limbs: [
            { name: 'head', kind: 'head', line: { obj: ch.torso, a: NECK.a, b: NECK.b, w: 1.0, h: 0.8 }, parts: [ch.head] },
            arm('left'), arm('right'), leg('left'), leg('right'),
        ],
        blockers: [
            { obj: ch.torso, c: [0, 0, 0], half: TORSO_HALF },
            { obj: ch.head, c: [0, 0.15, 0], half: [0.6, 0.45, 0.6], limb: 'head' }, // the skull above the neck
        ],
        afterCut: () => ch.setShowHands(ch.handsVisible), // (a cut-off hand is not shown)
    };
    return ch._cutBody;
}

/** A villager / knight / king / wizard (VillagerModel). */
export function villagerBody(m) {
    if (m._cutBody) return m._cutBody;
    const attach = new Set([m.handSlot]);
    if (m.shield) attach.add(m.shield);
    const arm = (side) => ({
        name: side + 'Arm', kind: 'arm', side,
        segs: [{ obj: side === 'left' ? m.leftArm : m.rightArm, o: [0, 0, 0], ax: [0, -1, 0], len: 1.35, part: 'arm', upper: 0.55, wrist: 0.95 }],
    });
    const leg = (side) => ({
        name: side + 'Leg', kind: 'leg', side,
        segs: [
            { obj: side === 'left' ? m.leftLeg : m.rightLeg, o: [0, 0, 0], ax: [0, -1, 0], len: 1.0, part: 'thigh' },
            { obj: side === 'left' ? m.leftKnee : m.rightKnee, o: [0, 0, 0], ax: [0, -1, 0], len: 0.95, part: 'shin' },
        ],
    });
    m._cutBody = {
        root: m,
        kind: 'humanoid',
        attach,
        limbs: [
            { name: 'head', kind: 'head', line: { obj: m.torso, a: NECK.a, b: NECK.b, w: 1.0, h: 0.8 }, parts: [m.head] },
            arm('left'), arm('right'), leg('left'), leg('right'),
        ],
        blockers: [
            { obj: m.torso, c: [0, 0, 0], half: TORSO_HALF },
            { obj: m.head, c: [0, 0.75, 0], half: [0.6, 0.45, 0.6], limb: 'head' },
        ],
    };
    // (a shield picked up later is carried too)
    Object.defineProperty(m._cutBody, 'attach', { get() { const s = new Set([m.handSlot]); if (m.shield) s.add(m.shield); if (m.tool) s.add(m.tool); return s; } });
    void attach;
    return m._cutBody;
}

/** A zombie: arms stretched forward, legs swinging round their middle. */
export function zombieBody(z) {
    if (z._cutBody) return z._cutBody;
    const arm = (side) => ({
        name: side + 'Arm', kind: 'arm', side,
        // the arm box (1.2 long) is turned to point forward: its shoulder end is its local +Y
        segs: [{ obj: side === 'left' ? z.leftArm : z.rightArm, o: [0, 0.6, 0], ax: [0, -1, 0], len: 1.2, part: 'arm' }],
    });
    const leg = (side) => ({
        name: side + 'Leg', kind: 'leg', side,
        segs: [{ obj: side === 'left' ? z.leftLeg : z.rightLeg, o: [0, 0.6, 0], ax: [0, -1, 0], len: 1.2, part: 'leg' }],
    });
    z._cutBody = {
        root: z,
        kind: 'zombie',
        limbs: [
            { name: 'head', kind: 'head', line: { obj: z.group, a: [0, 1.42, 0], b: [0, 1.8, 0], w: 1.0, h: 0.8 }, parts: [z.head] },
            arm('left'), arm('right'), leg('left'), leg('right'),
        ],
        blockers: [
            { obj: z.body, c: [0, 0, 0], half: TORSO_HALF },
            { obj: z.head, c: [0, 0.15, 0], half: [0.6, 0.45, 0.6], limb: 'head' },
        ],
    };
    return z._cutBody;
}

/**
 * An animal (AnimalModels.js): legs of two bones (hip/shoulder → knee/hock → hoof), the neck
 * to the head (cut anywhere along the neck: the head falls with what is beyond) — from the
 * model's named parts (userData.legs / neck / head / body).
 */
export function animalBody(model) {
    if (model._cutBody) return model._cutBody;
    const ud = model.userData || {};
    const body = ud.body || model.children.find((o) => o.isMesh);
    model.updateMatrixWorld(true);
    const limbs = [];
    const deepest = (obj) => {
        // the lowest point of a pivot's subtree, in its own frame (the hoof)
        const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
        const box = new THREE.Box3();
        obj.traverse((o) => {
            if (!o.isMesh) return;
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
        });
        return box.isEmpty() ? new THREE.Vector3(0, -0.5, 0) : new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
    };
    (ud.legs || []).forEach((pivot, i) => {
        const knee = pivot.userData.lower;
        const front = pivot.userData.front ?? (i < 2);
        const side = pivot.position.x < 0 ? 'left' : 'right';
        if (knee) {
            const kp = knee.position.clone();
            const end = deepest(knee);
            limbs.push({
                name: 'leg' + i, kind: 'leg', side, front, segs: [
                    { obj: pivot, o: [0, 0, 0], ax: kp.clone().normalize().toArray(), len: kp.length(), part: 'leg' },
                    { obj: knee, o: [0, 0, 0], ax: end.clone().normalize().toArray(), len: end.length(), part: 'leg' },
                ],
            });
        } else {
            const end = deepest(pivot);
            limbs.push({ name: 'leg' + i, kind: 'leg', side, front, segs: [{ obj: pivot, o: [0, 0, 0], ax: end.clone().normalize().toArray(), len: end.length(), part: 'leg' }] });
        }
    });
    // the neck: from where it leaves the body to the head; the head goes whole
    const head = ud.head, neck = ud.neck;
    if (head && neck && head.parent === neck && body) {
        if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
        const toNeck = new THREE.Matrix4().copy(neck.matrixWorld).invert().multiply(body.matrixWorld);
        const bb = body.geometry.boundingBox.clone().applyMatrix4(toNeck);
        const H = head.position.clone();
        const C = bb.getCenter(new THREE.Vector3());
        const dir = C.clone().sub(H).normalize();
        // (the blade is stopped by the body's box shrunk to 0.84 — the blocker below)
        const blk = bb.clone().expandByVector(bb.getSize(new THREE.Vector3()).multiplyScalar(-0.08));
        if (bb.containsPoint(H)) {
            // no neck to see (a pig, a sheep): the head sits on the body — its back is in it. The
            // "neck" runs from a little inside the body, out through its front into the head: a
            // chop right where the head meets the body takes it.
            const fwd = dir.clone().negate();
            const o = H.clone().addScaledVector(dir, 0.1);
            const out = new THREE.Ray(o, fwd).intersectBox(blk, new THREE.Vector3()) || H.clone();
            const L = out.distanceTo(o) + 0.14;
            limbs.unshift({
                name: 'neck', kind: 'neck', segs: [
                    { obj: neck, o: o.toArray(), ax: fwd.toArray(), len: L, part: 'neck' },
                    { obj: head, o: [0, 0, 0], ax: fwd.toArray(), len: 0.01, whole: true, part: 'neck', capW: 0.25 },
                ],
            });
        } else {
            // where the line head → body centre enters the body box
            const ray = new THREE.Ray(H, dir);
            const enter = ray.intersectBox(bb, new THREE.Vector3());
            let o = enter && enter.distanceTo(H) > 0.15 ? enter : H.clone().addScaledVector(dir, 0.18);
            o = o.clone().addScaledVector(dir, 0.05); // (a little inside the body: a chop right at the shoulders counts)
            const ax = H.clone().sub(o);
            const L = ax.length();
            limbs.unshift({
                name: 'neck', kind: 'neck', segs: [
                    { obj: neck, o: o.toArray(), ax: ax.normalize().toArray(), len: L, part: 'neck' },
                    { obj: head, o: [0, 0, 0], ax: ax.toArray(), len: 0.01, whole: true, part: 'neck', capW: 0.25 },
                ],
            });
        }
    }
    const blockers = [];
    if (body) {
        if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
        const bb = body.geometry.boundingBox;
        blockers.push({ obj: body, c: bb.getCenter(new THREE.Vector3()).toArray(), half: new THREE.Vector3().subVectors(bb.max, bb.min).multiplyScalar(0.42).toArray() });
    }
    model._cutBody = { root: model, kind: 'animal', limbs, blockers };
    return model._cutBody;
}

/** The giant spider: eight legs (hip → knee → foot). */
export function spiderCutBody(model) {
    if (model._cutBody) return model._cutBody;
    const limbs = [];
    (model.userData.legs || []).forEach((hip, i) => {
        const knee = hip.children.find((o) => !o.isMesh);
        const lower = knee?.children.find((o) => o.isMesh);
        if (!knee || !lower) return;
        const up = knee.position.clone();
        const upLen = up.length();
        if (!lower.geometry.boundingBox) lower.geometry.computeBoundingBox();
        const end = new THREE.Vector3(0, lower.geometry.boundingBox.min.y, 0).applyQuaternion(lower.quaternion).add(lower.position);
        limbs.push({
            name: 'leg' + i, kind: 'leg', side: i < 4 ? 'left' : 'right',
            segs: [
                { obj: hip, o: [0, 0, 0], ax: up.clone().normalize().toArray(), len: upLen, part: 'spiderLeg' },
                { obj: knee, o: [0, 0, 0], ax: end.clone().normalize().toArray(), len: end.length(), part: 'spiderLeg' },
            ],
        });
    });
    const blockers = [];
    for (const m of model.children.filter((o) => o.isMesh).slice(0, 2)) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        blockers.push({ obj: m, c: [0, 0, 0], half: new THREE.Vector3().subVectors(m.geometry.boundingBox.max, m.geometry.boundingBox.min).multiplyScalar(0.48).toArray() });
    }
    model._cutBody = { root: model, kind: 'spider', limbs, blockers };
    return model._cutBody;
}

/**
 * A living tree (LivingTrees.livingTreeModel): its two branch arms (shoulder → elbow → twig
 * fingers) can be cut off; the trunk stops the blade (it is not cut through), so do the roots.
 */
export function livingTreeCutBody(model) {
    if (model._cutBody) return model._cutBody;
    const ud = model.userData || {};
    const limbs = (ud.arms || []).map((a, i) => ({
        name: 'branch' + i, kind: 'branch', side: a.side < 0 ? 'left' : 'right',
        segs: [
            { obj: a.sh, o: [0, 0, 0], ax: [0, -1, 0], len: ud.armLen?.[0] ?? 2.6, part: 'branch' },
            { obj: a.elbow, o: [0, 0, 0], ax: [0, -1, 0], len: ud.armLen?.[1] ?? 3.2, part: 'branch' }, // (the forearm and the twig fingers; a skeleton's: its bones)
        ],
    }));
    const blockers = [];
    const trunk = ud.body?.children.find((o) => o.isMesh);
    if (trunk) blockers.push({ obj: trunk, c: [0, 0, 0], half: ud.trunkHalf || [0.8, 2.1, 0.7] });
    model._cutBody = { root: model, kind: 'tree', limbs, blockers, wood: true }; // (a skeleton: bones — no blood either)
    return model._cutBody;
}

// ================================================================= geometry for the blade
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ax = new THREE.Vector3();

/**
 * Bone lines in world space for the blade test: [{limb, a, b, d0, len, seg}] (a limb already
 * cut is shortened to its stump: you can't cut air). The head is its neck line.
 */
export function boneLines(body, st = body.root.limbs || {}) {
    const out = [];
    for (const limb of body.limbs) {
        if (limb.kind === 'head') {
            if (st.head) continue;
            if (limb.parts.every((p) => !p.visible)) continue;
            const L = limb.line;
            L.obj.updateWorldMatrix(true, false);
            out.push({ limb: limb.name, a: _a.fromArray(L.a).applyMatrix4(L.obj.matrixWorld).toArray(), b: _b.fromArray(L.b).applyMatrix4(L.obj.matrixWorld).toArray(), d0: 0, len: 0, seg: null });
            continue;
        }
        const left = st[limb.name];
        let cum = 0;
        for (const s of limb.segs) {
            const end = left == null ? cum + s.len : Math.min(left, cum + s.len);
            if (end <= cum + 1e-3) break;
            const o = s.objs ? s.objs[0] : s.obj;
            if (s.whole && s.noHide && !o.visible && !o.parent?.visible) break;
            o.updateWorldMatrix(true, false);
            _ax.fromArray(s.ax).normalize();
            _a.fromArray(s.o || [0, 0, 0]);
            _b.copy(_a).addScaledVector(_ax, end - cum);
            out.push({ limb: limb.name, a: _a.applyMatrix4(o.matrixWorld).toArray(), b: _b.applyMatrix4(o.matrixWorld).toArray(), d0: cum, len: end - cum, seg: s });
            cum += s.len;
            if (left != null && left <= cum) break;
        }
    }
    return out;
}

/** Blocking boxes in world space: [{inv: Matrix4 (world → box frame), c, half, limb}]. */
export function blockerBoxes(body, st = body.root.limbs || {}) {
    const out = [];
    for (const b of body.blockers) {
        if (b.limb && st[b.limb]) continue;
        if (!b.obj.visible) continue;
        b.obj.updateWorldMatrix(true, false);
        out.push({ inv: new THREE.Matrix4().copy(b.obj.matrixWorld).invert(), c: b.c, half: b.half, limb: b.limb || null });
    }
    return out;
}

/** Which tissue a cut at d goes through (how hard it is to cut, how fast it bleeds). */
export function tissueAt(body, limbName, d) {
    if (limbName === 'head' || limbName === 'neck') return 'neck';
    const limb = body.limbs.find((l) => l.name === limbName);
    if (!limb) return 'arm';
    let cum = 0;
    for (const s of limb.segs) {
        if (d < cum + s.len || s === limb.segs[limb.segs.length - 1]) {
            const local = d - cum;
            if (s.part === 'arm') return local < (s.upper ?? 0.55) ? 'upperArm' : local < (s.wrist ?? 0.95) ? 'forearm' : 'hand';
            if (s.part === 'leg' && s.knee != null) return local < s.knee ? 'thigh' : 'shin';
            return s.part;
        }
        cum += s.len;
    }
    return 'arm';
}
