// How one player sees another (the author: «как один игрок видит другого — руки, кисти, вещи, позы — чтобы было как у самого игрока»):
// a hero driven by synthetic camera poses, his pose packet given to a RemoteAvatar — every part of both arms (shoulder, elbow, hand,
// each finger) must stand where it stands on his own screen. Found by this test: the shoulder girdle (ArmSolver lifts / pulls back the
// shoulders ~12 cm) was not sent, and the rounded arm quaternions stopped the friend's slerp ~3° short.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { RemoteAvatar } from '../../src/net/RemoteAvatar.js';
import { PoseInterpreter } from '../../src/input/PoseInterpreter.js';
import { frame } from '../e2e/poses.mjs';

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({})), set: () => true }) }) };
const video = { videoWidth: 1280, videoHeight: 720 };
const CASES = {
    forward: {}, raised: { raise: 160 }, sideways: { raise: 90 }, windup: { windup: 'right' }, archer: { archer: 'right', draw: 0.8 },
    crossed: { crossedArms: true }, mouth: { toMouth: 'right' }, fists: { rightCurl: 1, leftCurl: 1 }, lean: { lean: 0.15 }, down: { arms: 'down' },
};

/** The largest distance between the same parts of two object trees (the arm: its every bone, the hand, each finger joint). */
function maxGap(a, b) {
    let worst = 0;
    const pa = new THREE.Vector3(), pb = new THREE.Vector3();
    const walk = (x, y) => {
        worst = Math.max(worst, x.getWorldPosition(pa).distanceTo(y.getWorldPosition(pb)));
        for (let i = 0; i < Math.min(x.children.length, y.children.length); i++) walk(x.children[i], y.children[i]);
    };
    walk(a, b);
    return worst;
}

for (const [name, opts] of Object.entries(CASES)) {
    test(`a friend sees my arms, hands and fingers where I see them: ${name}`, () => {
        const scene = new THREE.Scene();
        const me = new VoxelCharacter(scene);
        me.setShowHands(true);
        const interp = new PoseInterpreter();
        const friend = new RemoteAvatar(scene, 'x', 'Друг');
        for (let i = 0; i < 90; i++) {
            me.updateArmsLookAt(interp.process(frame(opts), video), 1 / 60);
            me.update(1 / 60, null, false);
            me.group.updateMatrixWorld(true);
            friend.applyState({ s: me.serializePose() });
            friend.update(1 / 60);
        }
        const rc = friend.character;
        rc.group.updateMatrixWorld(true);
        for (const side of ['left', 'right']) {
            const A = side === 'left' ? 'leftArmAnchor' : 'rightArmAnchor';
            const gap = maxGap(me[A], rc[A]);
            assert.ok(gap < 0.01, `${side}: off by ${(gap * 100).toFixed(1)} cm`);
            const da = me.getHandDirection(side, new THREE.Vector3()), db = rc.getHandDirection(side, new THREE.Vector3());
            assert.ok(da.angleTo(db) < 0.01, `${side} hand turned ${(da.angleTo(db) * 57.3).toFixed(1)}°`);
        }
        assert.ok(maxGap(me.head, rc.head) < 0.01, 'the head');
    });
}

test('an old client (no shoulder girdle in the packet): the shoulders at rest, nothing broken', () => {
    const scene = new THREE.Scene();
    const me = new VoxelCharacter(scene);
    const friend = new RemoteAvatar(scene, 'x', 'Друг');
    const s = me.serializePose();
    delete s.gl;
    for (let i = 0; i < 30; i++) { friend.applyState({ s }); friend.update(1 / 60); }
    const p = friend.character.rightArmAnchor.position;
    assert.ok(Number.isFinite(p.y) && Math.abs(p.y - 0.5) < 1e-3 && Math.abs(p.z) < 1e-3);
});
