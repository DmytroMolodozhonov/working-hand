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
 * An animal (Animals.animalModel). Uses named parts when the model has them
 * (userData.legs, userData.head, userData.body, userData.neck) — otherwise the head
 * is everything in front of the body.
 */
export function animalBody(model) {
    if (model._cutBody) return model._cutBody;
    const ud = model.userData || {};
    const meshes = model.children.filter((o) => o.isMesh);
    const body = ud.body || meshes[0];
    if (body && !body.geometry.boundingBox) body.geometry.computeBoundingBox();
    const bb = body ? body.geometry.boundingBox.clone().translate(body.position) : new THREE.Box3(new THREE.Vector3(-0.4, 0.6, -0.6), new THREE.Vector3(0.4, 1.4, 0.6));
    const limbs = [];
    // legs: a pivot at the hip, the leg hanging down along −Y
    (ud.legs || []).forEach((pivot, i) => {
        const leg = pivot.children.find((o) => o.isMesh);
        let len = 0.6;
        if (leg) {
            if (!leg.geometry.boundingBox) leg.geometry.computeBoundingBox();
            len = Math.max(0.1, -(leg.position.y + leg.geometry.boundingBox.min.y));
        }
        const front = pivot.position.z < (bb.min.z + bb.max.z) / 2;
        const left = pivot.position.x < 0;
        limbs.push({ name: 'leg' + i, kind: 'leg', side: left ? 'left' : 'right', front, segs: [{ obj: pivot, o: [0, 0, 0], ax: [0, -1, 0], len, part: 'leg' }] });
    });
    // the head: named, or every part in front of the body
    let parts = ud.head ? (Array.isArray(ud.head) ? ud.head : [ud.head]) : meshes.filter((o) => o !== body && o !== ud.saddle && o.position.z < bb.min.z - 0.02);
    if (parts.length) {
        const c = new THREE.Vector3();
        if (ud.neck) {
            limbs.unshift({ name: 'head', kind: 'head', line: { obj: model, a: ud.neck.a, b: ud.neck.b, w: ud.neck.w || 0.4, h: ud.neck.h || 0.4 }, parts });
        } else {
            for (const p of parts) c.add(p.position);
            c.multiplyScalar(1 / parts.length);
            const a = [0, Math.min(c.y, bb.max.y - 0.05), bb.min.z + 0.12];
            const b = [0, c.y, c.z];
            const bv = new THREE.Vector3().fromArray(a).lerp(new THREE.Vector3().fromArray(b), 0.7);
            limbs.unshift({ name: 'head', kind: 'head', line: { obj: model, a, b: bv.toArray(), w: 0.45, h: 0.45 }, parts });
        }
    }
    const blockers = [];
    if (body) blockers.push({ obj: body, c: [0, 0, 0], half: new THREE.Vector3().subVectors(body.geometry.boundingBox.max, body.geometry.boundingBox.min).multiplyScalar(0.46).toArray() });
    model._cutBody = { root: model, kind: 'animal', limbs, blockers };
    return model._cutBody;
}

/** The giant spider: eight legs (hip → knee → foot). */
export function spiderBody(model) {
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
    if (limbName === 'head') return 'neck';
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
