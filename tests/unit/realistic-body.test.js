// The «Реалистичный» hero (RealisticBody.js): its skin is made right (weights, sizes like the standard hero's), and every
// frame it is where the game's hero is — the hands on the game's palms, the fingers on its finger bones, the feet on the
// floor (standing, squatting), the elbow never in the chest, the face's bones moving with the face — and the standard
// model comes back whenever this one cannot draw what the hero wears (armour, a cut-off limb).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { RealisticBody, realLibrary, applyLookUniforms } from '../../src/entities/RealisticBody.js';
import { BONE_COUNT, B, FLOOR } from '../../src/entities/real/RealRig.js';
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

test('the skin: every vertex moved by ≤ 4 bones whose weights add up to 1; as tall as the standard hero; slimmer', () => {
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
    std.group.updateMatrixWorld(true);
    const sb = new THREE.Box3().setFromObject(std.body);
    const head = new THREE.Box3().setFromBufferAttribute(lib.lods[0].head.attributes.position);
    const body = new THREE.Box3().setFromBufferAttribute(lib.lods[0].body.attributes.position);
    const crown = head.max.y - FLOOR;
    assert.ok(crown > 4.4 && crown < 4.6, `the crown ${crown} m over the floor (the standard: 4.7 with its hair)`);
    assert.ok(body.min.y - FLOOR > -0.01 && body.min.y - FLOOR < 0.02, 'the soles on the floor');
    // the torso slimmer than the standard's 1.2 m box (the arms at the shoulders stay where the game's are)
    const chest = [];
    const P = lib.lods[0].body.attributes.position, lb = lib.lods[0].body.attributes.aLimb;
    for (let i = 0; i < P.count; i++) if (Math.abs(P.getY(i) - (3.15 + FLOOR)) < 0.05 && lb.getX(i) < 0.1) chest.push(Math.abs(P.getX(i)));
    const half = Math.max(...chest);
    assert.ok(half * 2 < sb.max.x - sb.min.x - 0.25, `chest ${half * 2} m across vs the standard's ${sb.max.x - sb.min.x}`);
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
        assert.ok(c.distanceTo(palm) < 0.12, `${pose}: the palm drawn ${c.distanceTo(palm).toFixed(3)} m from the game's`);
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
    assert.ok(Math.abs(e.x) > 0.38 || e.z < -0.3, `the elbow at x ${e.x.toFixed(2)} z ${e.z.toFixed(2)} — outside the chest`);
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

test('the face: a blink closes the lids, an open jaw drops the chin, a smile lifts the corners, the eyes look', () => {
    const { ch, r } = hero();
    const g = r.meshes.head.geometry;
    const lid = verticesOf(g, B.lidUpR, 0.5), jaw = verticesOf(g, B.jaw, 0.9), corner = verticesOf(g, B.cornerR, 0.6);
    assert.ok(lid.length > 5 && jaw.length > 20 && corner.length > 3);
    const at = (face) => {
        ch.face = { blinkL: 0, blinkR: 0, browL: 0, browR: 0, browIn: 0, gazeX: 0, gazeY: 0, jaw: 0, smileL: 0, smileR: 0, wide: 0, lipUp: 0, roll: 0, squint: 0, ...face };
        ch.faceAt = performance.now();
        for (let i = 0; i < 30; i++) r.pose(1 / 30);
        return { lid: boxOf(r.meshes.head, lid).getCenter(new THREE.Vector3()), jaw: boxOf(r.meshes.head, jaw).min.y, corner: boxOf(r.meshes.head, corner).getCenter(new THREE.Vector3()), eye: new THREE.Quaternion().setFromRotationMatrix(r.bones[B.eyeR].matrix) };
    };
    const calm = at({});
    const shut = at({ blinkR: 1 });
    assert.ok(calm.lid.y - shut.lid.y > 0.004, `the upper lid comes down (${(calm.lid.y - shut.lid.y).toFixed(4)})`);
    assert.ok(calm.jaw - at({ jaw: 1 }).jaw > 0.02, 'the chin drops');
    assert.ok(at({ smileR: 1 }).corner.y - calm.corner.y > 0.006, 'the mouth\'s corner goes up');
    assert.ok(calm.eye.angleTo(at({ gazeX: 1 }).eye) > 0.25, 'the eye turns');
});

test('armour, a cut-off hand, the monster form: the standard model shows instead; then this one again', () => {
    const { ch, r } = hero();
    assert.equal(r.shown, true);
    assert.equal(ch.body.visible, false, 'the standard torso hidden');
    ch._armorParts = [new THREE.Object3D()];
    r.frame(null, 1 / 60);
    assert.equal(r.shown, false); assert.equal(ch.body.visible, true);
    ch._armorParts = [];
    ch.limbs = { leftArm: 1 };
    r.frame(null, 1 / 60);
    assert.equal(r.shown, false);
    ch.limbs = null;
    r.frame(null, 1 / 60);
    assert.equal(r.shown, true); assert.equal(ch.body.visible, false);
    ch.setHeroModel('std');
    assert.equal(r.shown, false); assert.equal(ch.body.visible, true); assert.equal(ch.head.visible, true);
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
