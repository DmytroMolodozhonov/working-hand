// The «Реалистичный» (detailed) hero (RealisticBody.js): the standard hero cut finer — its skin is made right (weights,
// EVERY size the standard's, never longer: the author found long arms «жесть»), and every frame it is where the game's
// hero is — the hands on the game's palms, the fingers on its finger bones, the arm never stretched, the feet on the
// floor (standing, squatting), the elbow never in the chest, the joints within a person's ranges, the painted face
// moving with the face; armour and cut-off limbs drawn on it; the standard model only for the monster form.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { RealisticBody, realLibrary, applyLookUniforms } from '../../src/entities/RealisticBody.js';
import { BONE_COUNT, B, FLOOR, ANAT } from '../../src/entities/real/RealRig.js';
import { JOINTS, splitHeadTurn, minReach, bendOf, elbowCost } from '../../src/entities/real/RealJoints.js';
import { realSkinMaterial } from '../../src/entities/real/RealSkinMaterial.js';
import { wearKey } from '../../src/entities/real/RealWear.js';

const lib = await realLibrary();

function hero() {
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter(scene);
    ch.group.position.set(5, 2, -3);
    ch.setShowHands(true);
    ch.setHandVersion('v4');
    ch.setHeroModel('real');
    ch.setIdlePose();
    ch.update(1 / 60, null, false);
    ch.real.frame(null, 1 / 60);
    return { scene, ch, r: ch.real };
}
/** Where a vertex of the skin is drawn now (the group's space). */
function drawn(mesh, i, out = new THREE.Vector3()) {
    mesh.parent.updateMatrixWorld(true);
    return mesh.boneTransform(i, out);
}
/** The skin's vertices that one bone moves most. */
function verticesOf(geo, bone, min = 0.9) {
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, out = [];
    for (let i = 0; i < si.count; i++) if (si.getX(i) === bone && sw.getX(i) >= min) out.push(i);
    return out;
}
function boxOf(mesh, list) {
    const b = new THREE.Box3(), v = new THREE.Vector3();
    for (const i of list) b.expandByPoint(drawn(mesh, i, v));
    return b;
}

test('the skin: every vertex moved by ≤ 4 bones whose weights add up to 1; the standard hero’s sizes, nothing bigger', () => {
    for (const L of lib.lods) for (const g of [L.body, L.head]) {
        const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
        for (let i = 0; i < si.count; i++) {
            let s = 0;
            for (let k = 0; k < 4; k++) { s += sw.array[i * 4 + k]; assert.ok(si.array[i * 4 + k] < BONE_COUNT); }
            assert.ok(Math.abs(s - 1) < 1e-3, `weights at ${i}: ${s}`);
            assert.ok(Number.isFinite(g.attributes.position.array[i * 3]));
        }
    }
    const std = new VoxelCharacter(new THREE.Scene());
    std.group.position.set(0, 0, 0);
    std.group.updateMatrixWorld(true);
    const sb = new THREE.Box3().setFromObject(std.body);
    const head = new THREE.Box3().setFromBufferAttribute(lib.lods[0].head.attributes.position);
    const body = new THREE.Box3().setFromBufferAttribute(lib.lods[0].body.attributes.position);
    const hb = new THREE.Box3().setFromBufferAttribute(std.head.geometry.attributes.position).applyMatrix4(std.head.matrixWorld); // (the cube, not its hair)
    // the head: the standard's 1.2 cube (its nose and ears a little out of it)
    const near = (a, b, d, what) => assert.ok(Math.abs(a - b) <= d, `${what}: ${a.toFixed(3)} vs the standard's ${b.toFixed(3)}`);
    near(head.max.y, hb.max.y, 0.02, 'the crown');
    near(head.min.y, hb.min.y, 0.03, 'the chin');
    near(head.max.z, hb.max.z, 0.03, 'the back of the head');
    assert.ok(head.min.z > hb.min.z - 0.1, 'the nose not further than a pixel out');
    assert.ok(body.min.y - FLOOR > -0.01 && body.min.y - FLOOR < 0.02, 'the soles on the floor');
    // the torso: the standard's 1.2 m box (no wider)
    const chest = [];
    const P = lib.lods[0].body.attributes.position, lb = lib.lods[0].body.attributes.aLimb;
    for (let i = 0; i < P.count; i++) if (Math.abs(P.getY(i) - (3.0 + FLOOR)) < 0.05 && lb.getX(i) < 0.1 && lb.getZ(i) < 0.1) chest.push(Math.abs(P.getX(i)));
    near(Math.max(...chest) * 2, sb.max.x - sb.min.x, 0.06, 'the chest across');
    // the arm: from the game's shoulder, exactly the game's bones (1.0 + 0.9) — never longer than the standard's
    assert.equal(ANAT.L1, std.BONE_LENGTH_UPPER); assert.equal(ANAT.L2, std.BONE_LENGTH_LOWER);
    const sh = new THREE.Vector3().setFromMatrixPosition(std.rightArmAnchor.matrixWorld);
    assert.ok(Math.abs(sh.x - ANAT.shoulder[0]) < 1e-6 && Math.abs(sh.y - ANAT.shoulder[1]) < 1e-6, 'the shoulder is the game’s');
    // the legs: from the game's pivots to the floor (the standard's 1.95)
    const lp = new THREE.Vector3().setFromMatrixPosition(std.rightLegPivot.matrixWorld);
    near(ANAT.hip[1] - FLOOR, lp.y - FLOOR, 0.01, 'the hip');
    assert.ok(ANAT.Lth + ANAT.Lsh <= 1.95, 'the leg no longer than the standard’s');
});

test('the hands are drawn on the game’s palms; the fingers bend with the game’s finger bones', () => {
    const { ch, r } = hero();
    for (const pose of [null, 'up', 'fist']) {
        if (pose === 'up') ch.reachHand('right', new THREE.Vector3(5.8, 4.6, -3.3));
        if (pose === 'fist') { ch.rightSimplifiedHand.setGrip(1, 'power'); for (let i = 0; i < 12; i++) ch.rightSimplifiedHand.animateModel(); }
        r.pose(1 / 60);
        ch.group.updateMatrixWorld(true);
        // the palm's skin round the game's palm
        const palm = new THREE.Vector3().setFromMatrixPosition(ch.rightSimplifiedHand.palm.matrixWorld);
        ch.group.worldToLocal(palm);
        const b = boxOf(r.meshes.body, verticesOf(r.meshes.body.geometry, B.handR).slice(0, 300));
        const c = b.getCenter(new THREE.Vector3());
        assert.ok(c.distanceTo(palm) < 0.15, `${pose}: the palm drawn ${c.distanceTo(palm).toFixed(3)} m from the game's`);
        // the index finger's tip bone where the game's last joint is
        const tip = verticesOf(r.meshes.body.geometry, B.index2R, 0.95);
        const tb = boxOf(r.meshes.body, tip).getCenter(new THREE.Vector3());
        const seg = new THREE.Vector3(0, 0.07, 0).applyMatrix4(ch.rightSimplifiedHand.fingerMeshes.index[2].pivot.matrixWorld);
        ch.group.worldToLocal(seg);
        assert.ok(tb.distanceTo(seg) < 0.08, `${pose}: the fingertip ${tb.distanceTo(seg).toFixed(3)} m off`);
    }
});

test('the forearm reaches exactly the game’s wrist; the elbow stays out of the chest', () => {
    const { ch, r } = hero();
    // the hand pressed to the chest's middle: the elbow must go out, not into the torso
    ch.reachHand('left', new THREE.Vector3(5.0, 3.1, -3.4));
    r.pose(1 / 60);
    const e = new THREE.Vector3().setFromMatrixPosition(r.bones[B.forearmL].matrix);
    assert.ok(Math.abs(e.x) > 0.6 || e.z < -0.4, `the elbow at x ${e.x.toFixed(2)} z ${e.z.toFixed(2)} — outside the chest`);
    const w = new THREE.Vector3().setFromMatrixPosition(ch.leftSimplifiedHand.group.matrixWorld);
    ch.group.worldToLocal(w);
    const tw = new THREE.Vector3().setFromMatrixPosition(r.bones[B.twistL].matrix);
    const fe = new THREE.Vector3().setFromMatrixPosition(r.bones[B.forearmL].matrix);
    // (the twist bone lies on the forearm's line from the elbow to the game's wrist)
    const along = tw.clone().sub(fe).normalize().dot(w.clone().sub(fe).normalize());
    assert.ok(along > 0.999, `the forearm towards the wrist (${along})`);
});

test('standing, the feet are on the floor; in a squat the knees bend and the feet stay on the floor', () => {
    const { ch, r } = hero();
    const feet = [...verticesOf(r.meshes.body.geometry, B.footL), ...verticesOf(r.meshes.body.geometry, B.footR)];
    let low = boxOf(r.meshes.body, feet).min.y;
    assert.ok(Math.abs(low - FLOOR) < 0.04, `standing: the soles ${(low - FLOOR).toFixed(3)} from the floor`);
    // a full squat (the game lowers the body 1 m): the floor is 1 m higher in the body's space
    ch.isCrouching = true; ch.crouchK = ch.lowK = 1;
    r.pose(1 / 60);
    low = boxOf(r.meshes.body, feet).min.y;
    assert.ok(Math.abs(low - (FLOOR + ch.bodyDrop())) < 0.06, `squatting: the soles ${(low - FLOOR - ch.bodyDrop()).toFixed(3)} from the floor`);
    const th = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(r.bones[B.thighR].matrix));
    const sh = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(r.bones[B.shinR].matrix));
    assert.ok(th.angleTo(sh) > 1.0, `the knee bent ${th.angleTo(sh).toFixed(2)} rad`);
    const knee = new THREE.Vector3().setFromMatrixPosition(r.bones[B.shinR].matrix);
    assert.ok(knee.z < -0.15, 'the knee forward, over the toes');
});

test('the face: the painted face blinks, looks, smiles, opens the mouth as the camera’s face does', () => {
    const { ch, r } = hero();
    const at = (face) => {
        ch.face = { blinkL: 0, blinkR: 0, browL: 0, browR: 0, browIn: 0, gazeX: 0, gazeY: 0, jaw: 0, smileL: 0, smileR: 0, wide: 0, lipUp: 0, roll: 0, squint: 0, ...face };
        ch.faceAt = performance.now();
        for (let i = 0; i < 30; i++) r.pose(1 / 30);
        return { a: r.u.uFaceA.value.clone(), b: r.u.uFaceB.value.clone(), c: r.u.uFaceC.value.clone() };
    };
    assert.ok(at({ blinkR: 1 }).a.y > 0.6, 'the eye closes');
    assert.ok(at({ jaw: 1 }).b.y > 0.6, 'the mouth opens');
    assert.ok(at({ smileL: 1, smileR: 1 }).b.x > 0.6, 'a smile');
    assert.ok(at({ gazeX: 1 }).a.z > 0.6, 'the eyes look aside');
    assert.ok(at({ browIn: -1 }).c.x > 0.6, 'a frown');
    // (no skin is pulled round the mouth: no head vertex is moved by the jaw or the lips' bones)
    const g = r.meshes.head.geometry;
    for (const b of [B.jaw, B.lipUp, B.lipLo, B.cornerL, B.cornerR]) assert.equal(verticesOf(g, b, 0.05).length, 0);
});

test('armour and a cut-off limb are drawn on this model; only the monster form takes the standard one', () => {
    const { ch, r } = hero();
    assert.equal(r.shown, true);
    assert.equal(ch.body.visible, false, 'the standard torso hidden');
    ch._armorParts = [new THREE.Object3D()];
    r.frame(null, 1 / 60);
    assert.equal(r.shown, true, 'armour: drawn here');
    ch._armorParts = [];
    ch.limbs = { leftArm: 1.2, rightLeg: 0.5 };
    r.frame(null, 1 / 60);
    assert.equal(r.shown, true);
    assert.ok(Math.abs(r.u.uCut.value.x - 1.2 / 1.9) < 1e-6 && r.u.uCut.value.y > 50, 'the left arm cut past the elbow');
    assert.ok(Math.abs(r.u.uCut.value.w - 0.5 / 1.95) < 1e-6, 'the right leg cut');
    assert.equal(r.meshes.body.material, r.materialCut, 'two-sided: the wound seen through the cut');
    ch.limbs = { head: true };
    r.frame(null, 1 / 60);
    assert.equal(r.meshes.head.visible, false, 'the head cut off: not drawn');
    ch.limbs = null;
    r.frame(null, 1 / 60);
    assert.equal(r.meshes.body.material, r.material);
    assert.equal(r.meshes.head.visible, true);
    ch.size = 7;
    r.frame(null, 1 / 60);
    assert.equal(r.shown, false, 'the monster form: the standard model');
    ch.size = 1;
    r.frame(null, 1 / 60);
    assert.equal(r.shown, true); assert.equal(ch.body.visible, false);
    ch.setHeroModel('std');
    assert.equal(r.shown, false); assert.equal(ch.body.visible, true); assert.equal(ch.head.visible, true);
});

test('the arm is never stretched: arms out wide, overhead, behind — the drawn bones stay 1.0 and 0.9', () => {
    const { ch, r } = hero();
    const p = ch.group.position;
    for (const [x, y, z] of [[2.7, 1.25, 0], [0.8, 3.2, -0.2], [0.9, 0.2, 1.4], [0.4, 1.0, -1.9], [-0.6, 1.2, -1.0]]) {
        ch.reachHand('right', new THREE.Vector3(p.x + x, p.y + y, p.z + z));
        r.pose(1 / 60);
        const S = new THREE.Vector3().setFromMatrixPosition(r.bones[B.upperArmR].matrix);
        const E = new THREE.Vector3().setFromMatrixPosition(r.bones[B.forearmR].matrix);
        const W = new THREE.Vector3().setFromMatrixPosition(ch.rightSimplifiedHand.group.matrixWorld);
        ch.group.worldToLocal(W);
        assert.ok(Math.abs(S.distanceTo(E) - ANAT.L1) < 0.032, `upper arm ${S.distanceTo(E).toFixed(3)}`);
        assert.ok(Math.abs(E.distanceTo(W) - ANAT.L2) < 0.03, `forearm ${E.distanceTo(W).toFixed(3)}`);
        const sc = new THREE.Vector3().setFromMatrixScale(r.bones[B.upperArmR].matrix);
        assert.ok(sc.z <= 1.03, 'no stretch');
        ch.restoreArms();
    }
});

test('the joints keep a person’s ranges: the neck, the spine, the knee, the elbow; the wrist chooses the elbow', () => {
    // a head turned 150°: the neck takes ≤ 80°, the chest the rest up to its 35°; never more than both
    const o = splitHeadTurn(150 * Math.PI / 180, 0, 0);
    assert.ok(o.neck.y <= JOINTS.neck.yaw + 1e-9 && o.spine.y <= JOINTS.spine.yaw + 1e-9);
    assert.ok(Math.abs(o.neck.y + o.spine.y - (JOINTS.neck.yaw + JOINTS.spine.yaw)) < 1e-9);
    // a small turn: mostly the neck, a little the chest
    const s = splitHeadTurn(0.4, -0.3, 0.1);
    assert.ok(s.neck.y > s.spine.y && s.spine.y > 0 && Math.abs(s.neck.y + s.spine.y - 0.4) < 1e-9);
    assert.ok(s.neck.x < 0 && s.spine.x < 0, 'a nod down: both bend forward');
    // the knee's and the elbow's least reach
    assert.ok(bendOf(1, 1, minReach(1, 1, 140)) * 180 / Math.PI <= 140.001);
    assert.ok(elbowCost(0, 60, 0) < elbowCost(0, 120, 0) && elbowCost(0, 60, 0) < elbowCost(0, 60, 0.5));
    // in the game: a turned head is clamped to the neck on the chest; a deep squat bends the knees ≤ 140°
    const { ch, r } = hero();
    ch.head.rotation.set(0, 2.6, 0);
    r.pose(1 / 60);
    const qc = new THREE.Quaternion().setFromRotationMatrix(r.bones[B.upperChest].matrix);
    const qh = new THREE.Quaternion().setFromRotationMatrix(r.bones[B.head].matrix);
    const rel = new THREE.Euler().setFromQuaternion(qc.invert().multiply(qh), 'YXZ');
    assert.ok(Math.abs(rel.y) <= JOINTS.neck.yaw + 1e-3, `the neck turned ${(rel.y * 57.3).toFixed(0)}°`);
    ch.head.rotation.set(0, 0, 0);
    ch.isCrouching = true; ch.crouchK = ch.lowK = 1;
    r.pose(1 / 60);
    const th = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(r.bones[B.thighR].matrix));
    const sh = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(r.bones[B.shinR].matrix));
    assert.ok(th.angleTo(sh) <= JOINTS.knee.maxDeg * Math.PI / 180 + 1e-3, 'the knee within its range');
});

test('the look: every top, bottom and pair of shoes has its cloth; the hidden special things fall back to plain ones', () => {
    const u = realSkinMaterial().userData.u;
    for (let i = 0; i < 10; i++) {
        applyLookUniforms(u, { top: i, bottom: i, shoes: i });
        assert.ok(u.uTop.value.y > 0 && u.uTop.value.z > 1 && u.uTop.value.w > 3, 'top ' + i);
        assert.ok(u.uBot.value.z > 2.5, 'bottom ' + i);
    }
    applyLookUniforms(u, { top: 5, bottom: 8, shoes: 6 }); // (plate, greaves, steel shoes: not the look's)
    assert.equal(u.uTop.value.x, 0); assert.equal(u.uBot.value.x, 0); assert.equal(u.uShoe.value.x, 0);
    assert.equal(wearKey({ hat: 5 }), wearKey({ hat: 0 }), 'the crown is no hat of the look');
});
