/**
 * The spell book held like a real one: the hands decide how it is turned, the edges sit
 * in the hands, a half kept rigidly in one hand, a book lying on a palm, the fingers that
 * close on it only until they touch it, the fold of the pages between the halves.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { frameFromHands, edgeInBook, halfQuat, bookFromHinge, frameOnPalm, openFor } from '../../src/game/BookPhysics.js';
import { makeSpellBookModel, setBookAngle, BOOK } from '../../src/game/BookModel.js';
import { SimplifiedHand, BOOK_GRIP } from '../../src/entities/SimplifiedHand.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const W = 0.67, T = 0.1;
const eye = V(0, 2, 2);

test('two hands: the edges are in the hands at the height they hold them; as open as they are apart', () => {
    const gy = -0.21;
    for (const d of [0.4, 1.0, 1.5]) {
        const pL = V(-d / 2, 1, 0), pR = V(d / 2, 1, 0);
        const f = frameFromHands(pL, pR, eye, W, {}, { gy, t: T });
        assert.ok(Math.abs(f.phi - openFor(d, W, T)) < 1e-9);
        for (const [half, p] of [['left', pL], ['right', pR]]) {
            const e = edgeInBook(half, f.phi, W, gy, T).applyQuaternion(f.quat).add(f.pos);
            assert.ok(e.distanceTo(p) < 1e-6, `${half} edge in the hand (d=${d}): ${e.distanceTo(p)}`);
        }
        // the hands hold the lower part of the edges (below the middle of the book)
        const Y = V(0, 1, 0).applyQuaternion(f.quat);
        assert.ok(Math.abs(pL.clone().sub(f.pos).dot(Y) - gy) < 1e-6, 'held below the middle');
    }
    // the halves' hinges apart: closed while the hands are no further apart than the spine is thick
    assert.equal(openFor(2 * T, W, T), 0);
});

test('two hands: tilting the hands (their fingers) tilts the book; fingers along the line between them: upright to the eye', () => {
    const pL = V(-0.6, 1, 0), pR = V(0.6, 1, 0);
    const up = frameFromHands(pL, pR, eye, W, {}, { Y: V(0, 1, 0) });
    const tilted = frameFromHands(pL, pR, eye, W, {}, { Y: V(0, Math.cos(0.5), -Math.sin(0.5)) });
    const a = V(0, 1, 0).applyQuaternion(up.quat), b = V(0, 1, 0).applyQuaternion(tilted.quat);
    assert.ok(Math.abs(a.angleTo(b) - 0.5) < 0.02, 'the spine turned with the hands: ' + a.angleTo(b));
    // the edges stay in the hands
    for (const [half, p] of [['left', pL], ['right', pR]]) assert.ok(edgeInBook(half, tilted.phi, W, 0, 0).applyQuaternion(tilted.quat).add(tilted.pos).distanceTo(p) < 1e-6);
    // fingers pointing along the line between the hands say nothing: upright to the eye
    const none = frameFromHands(pL, pR, eye, W, {}, { Y: V(1, 0, 0) });
    const eyeOnly = frameFromHands(pL, pR, eye, W, {});
    assert.ok(V(0, 1, 0).applyQuaternion(none.quat).angleTo(V(0, 1, 0).applyQuaternion(eyeOnly.quat)) < 1e-6);
});

test('one hand: the half kept rigidly — its turn and its hinge stay, whatever φ', () => {
    const hq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.6, 0.2));
    const hinge = V(1, 2, 3);
    for (const half of ['left', 'right']) for (const phi of [0.3, 1.5, 2.6, Math.PI]) {
        const b = bookFromHinge(hinge, hq, half, phi, T);
        assert.ok(halfQuat(b.quat, half, phi).angleTo(hq) < 1e-6, 'the half turned as the hand holds it');
        const h = V(half === 'left' ? -T : T, 0, 0).applyQuaternion(b.quat).add(b.pos);
        assert.ok(h.distanceTo(hinge) < 1e-9, 'its hinge where it was');
    }
});

test('an open book lying on a palm turned up: pages up, every corner of both halves above the palm', () => {
    const P = V(0, 1, 0), F = V(0, 1, 0), Yp = V(0, 0, -1);
    const f = frameOnPalm(P, Yp, F, 0.07 + BOOK.B * 1.6 + 0.01);
    assert.ok(V(0, 0, 1).applyQuaternion(f.quat).y > 0.9, 'the pages look up');
    const m = makeSpellBookModel();
    m.position.copy(f.pos); m.quaternion.copy(f.quat); m.scale.setScalar(1.6);
    setBookAngle(m, 2.6);
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m);
    assert.ok(box.min.y >= P.y + 0.07 - 1e-3, 'nothing of it under the palm face: ' + box.min.y);
});

test('the fold of the pages: a V between the inner edges of both page faces, seen as soon as it is a little open', () => {
    const m = makeSpellBookModel();
    const b = m.userData.book;
    setBookAngle(m, 0.2);
    assert.equal(b.gutter.visible, false, 'closed: hidden inside');
    for (const phi of [0.6, 1.8, 3.0]) {
        setBookAngle(m, phi);
        assert.ok(b.gutter.visible);
        m.updateMatrixWorld(true);
        const p = b.gutter.geometry.attributes.position;
        // its outer corners lie on the inner edges of the two faces
        for (const [face, i] of [[b.faceL, 0], [b.faceR, 4]]) {
            const corner = V(p.getX(i), p.getY(i), p.getZ(i));
            const local = face.worldToLocal(m.localToWorld(corner.clone()));
            assert.ok(Math.abs(local.z) < 1e-6 && Math.abs(Math.abs(local.x) - (BOOK.W - 0.03) / 2) < 1e-6, `on the ${i ? 'right' : 'left'} face's inner edge at φ=${phi}: ${local.toArray()}`);
        }
        // and its bottom is down at the spine, behind the faces
        assert.ok(p.getZ(2) < p.getZ(0));
    }
});

test('a hand round a book: each finger closes only until it touches it — never into it', () => {
    const h = new SimplifiedHand('right');
    h.setGrip(0.55, 'book');
    assert.equal(h.gripOverride.pose, BOOK_GRIP);
    h.group.updateMatrixWorld(true);
    // a cover a little in front of the palm's face (the palm looks along its −Z), under the fingers
    const box = { inv: new THREE.Matrix4().copy(h.palm.matrixWorld).invert(), min: V(-0.12, -0.3, -0.35), max: V(0.6, 0.8, -0.15), scale: 1 };
    const fit = h.fitGrip([box]);
    for (const n of ['index', 'middle', 'ring', 'pinky']) {
        assert.ok(fit[n] > 0 && fit[n] < 0.5, `${n} bends a little onto the cover: ${fit[n]}`);
        assert.equal(h._fingerIn(n, [box], 0.035), false);
    }
    // the drawn fingers come to the fitted pose and none of them is in the cover
    for (let i = 0; i < 30; i++) h.animateModel();
    for (const n of ['thumb', 'index', 'middle', 'ring', 'pinky']) assert.equal(h._fingerIn(n, [box], 0), false, n + ' is not inside');
    // one step more and each finger would be in it: it touches the cover
    const J = [0, 0, 0, 0];
    const a = BOOK_GRIP.open.index, b = BOOK_GRIP.closed.index, t = fit.index + 0.1;
    for (let i = 0; i < 4; i++) J[i] = a[i] + (b[i] - a[i]) * t;
    h._setFinger('index', J);
    assert.equal(h._fingerIn('index', [box], 0.035), true, 'the index finger lies on it');
});
