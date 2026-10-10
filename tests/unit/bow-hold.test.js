/**
 * A drawn bow as in real archery: the arrow rests on top of the bow fist (beside
 * the hand and the bow arm, never through them) with its nock on the string.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { arrowOnBow, ARROW_REST } from '../../src/game/Gear.js';
import { makeItemModel, setBowString } from '../../src/game/ItemTypes.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** The shortest distance between two segments (sampled finely enough for these checks). */
function segDist(a0, a1, b0, b1) {
    const line = new THREE.Line3(b0, b1), q = new THREE.Vector3();
    let m = Infinity;
    for (let i = 0; i <= 200; i++) {
        const p = a0.clone().lerp(a1, i / 200);
        line.closestPointToPoint(p, true, q);
        m = Math.min(m, p.distanceTo(q));
    }
    return m;
}

// an archer (the hero's space: −Z ahead): the left arm stretched ahead, the bow in its fist
const shoulder = V(-0.7, 1.25, 0), elbow = V(-0.65, 1.23, -1.0), bowHand = V(-0.6, 1.21, -1.9), grip = V(-0.59, 1.21, -2.12);
const FWD = V(0, 0, -1);

test('bow: the drawn arrow rests on top of the bow fist — along the aim, clear of the bow hand and the bow arm, its nock on the string', () => {
    const bow = makeItemModel({ kind: 'bow', uid: 'b', type: 0 });
    const S = bow.userData.bowString, sc = bow.scale.x;
    const dir = bowHand.clone().sub(shoulder).normalize();
    const pull = 1.3; // (drawn back to the chin)
    const rest = new THREE.Vector3(), nock = new THREE.Vector3();
    arrowOnBow(grip, dir, sc, S.tipX, pull, FWD, rest, nock);
    const lift = rest.clone().sub(grip);
    assert.ok(Math.abs(lift.length() - ARROW_REST * sc) < 1e-9, 'on top of the fist, just above the grip');
    assert.ok(Math.abs(lift.dot(dir)) < 1e-9 && lift.y > 0.2, 'straight above it (across the aim)');
    const back = nock.clone().sub(rest);
    assert.ok(back.clone().normalize().dot(dir) < -0.999999, 'the nock behind, on the arrow\'s line');
    assert.ok(Math.abs(back.length() - (pull - S.tipX * sc)) < 1e-9, 'as far back as the string is drawn');
    // the shaft (nock → tip) never goes through the bow arm (forearm 0.35 thick, upper arm 0.4)
    const tip = nock.clone().addScaledVector(dir, 0.84 * 2.4);
    assert.ok(segDist(nock, tip, elbow, bowHand) > 0.175 + 0.02, `clear of the forearm (${segDist(nock, tip, elbow, bowHand).toFixed(3)})`);
    assert.ok(segDist(nock, tip, shoulder, elbow) > 0.2 + 0.02, `clear of the upper arm (${segDist(nock, tip, shoulder, elbow).toFixed(3)})`);
    // the string's «V» meets exactly there: the bow turned to the aim as Items turns it (X ahead, Y up)
    const y = V(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
    bow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, y, new THREE.Vector3().crossVectors(dir, y)));
    bow.position.copy(grip);
    bow.updateMatrixWorld(true);
    setBowString(bow, S.tipX - pull / sc, ARROW_REST);
    const meet = bow.localToWorld(V(S.nockX, S.nockY, 0));
    assert.ok(meet.distanceTo(nock) < 1e-6, `the string is pulled to the arrow's nock (${meet.distanceTo(nock).toFixed(4)})`);
    // the strands really end there
    for (const m of [S.up, S.down]) {
        const axis = V(0, 1, 0).applyQuaternion(m.quaternion);
        const ends = [m.position.clone().addScaledVector(axis, m.scale.y / 2), m.position.clone().addScaledVector(axis, -m.scale.y / 2)];
        assert.ok(ends.some((e) => Math.hypot(e.x - S.nockX, e.y - S.nockY) < 1e-6), 'a strand ends at the nock ' + JSON.stringify(ends));
    }
    // at rest the string is straight again, in the middle
    setBowString(bow, null, ARROW_REST);
    assert.equal(S.nockY, 0);
    assert.equal(S.nockX, S.tipX);
});

test('bow: aiming straight up, the arrow still rests on the fist (the hero\'s facing is the bow\'s up)', () => {
    const rest = new THREE.Vector3(), nock = new THREE.Vector3();
    arrowOnBow(grip, V(0, 1, 0), 2.4, -0.08, 1, FWD, rest, nock);
    const lift = rest.clone().sub(grip);
    assert.ok(Number.isFinite(lift.x) && Math.abs(lift.length() - ARROW_REST * 2.4) < 1e-9);
    assert.ok(lift.clone().normalize().dot(FWD) > 0.999, 'towards the facing');
    assert.ok(nock.y < rest.y, 'the nock below');
});
