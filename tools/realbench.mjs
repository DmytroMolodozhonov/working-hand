/**
 * The detailed («Реалистичная») hero against the standard one — sizes and weight of the skin:
 *   node tools/realbench.mjs
 * Prints: where the drawn shoulder is vs the game's, the drawn upper arm and forearm (never longer than the game's
 * 1.0 + 0.9), the head and torso boxes vs the standard's, and the triangles of each LOD.
 */
import * as THREE from 'three';
import { VoxelCharacter } from '../src/entities/Character.js';
import { realLibrary } from '../src/entities/RealisticBody.js';
import { B, FLOOR } from '../src/entities/real/RealRig.js';

const lib = await realLibrary();
const ch = new VoxelCharacter(new THREE.Scene());
ch.group.position.set(0, 0, 0);
ch.setShowHands(true); ch.setHandVersion('v4'); ch.setHeroModel('real'); ch.setIdlePose(); ch.update(1 / 60, null, false); ch.real.frame(null, 1 / 60);
const r = ch.real, P = (b) => new THREE.Vector3().setFromMatrixPosition(r.bones[b].matrix), f = (v) => +v.toFixed(3);
const S = P(B.upperArmR), E = P(B.forearmR), W = new THREE.Vector3().setFromMatrixPosition(ch.rightSimplifiedHand.group.matrixWorld);
ch.group.worldToLocal(W);
const gs = new THREE.Vector3().setFromMatrixPosition(ch.rightArmAnchor.matrixWorld);
const head = new THREE.Box3().setFromBufferAttribute(lib.lods[0].head.attributes.position);
const body = new THREE.Box3().setFromBufferAttribute(lib.lods[0].body.attributes.position);
const sh = new THREE.Box3().setFromBufferAttribute(ch.head.geometry.attributes.position).applyMatrix4(ch.head.matrixWorld);
const st = new THREE.Box3().setFromObject(ch.body);
const size = (b) => [f(b.max.x - b.min.x), f(b.max.y - b.min.y), f(b.max.z - b.min.z)];
console.table({
    'плечо (x, высота)': { детальная: `${f(S.x)}, ${f(S.y - FLOOR)}`, игра: `${f(gs.x)}, ${f(gs.y - FLOOR)}` },
    'плечо→локоть': { детальная: f(S.distanceTo(E)), игра: ch.BONE_LENGTH_UPPER },
    'локоть→запястье': { детальная: f(E.distanceTo(W)), игра: ch.BONE_LENGTH_LOWER },
    'голова (ш×в×г)': { детальная: size(head).join(' × '), игра: size(sh).join(' × ') },
    'макушка': { детальная: f(head.max.y - FLOOR), игра: f(sh.max.y - FLOOR) },
    'торс + руки в А-позе (ш)': { детальная: f(body.max.x - body.min.x), игра: `торс ${size(st)[0]}` },
});
console.log('треугольники [тело, голова] по LOD:', lib.lods.map((l) => [l.body.index.count / 3, l.head.index.count / 3]));
