/**
 * The book and the scroll in the two hands, driven by synthetic hands (BookReading /
 * ScrollReading `input`): the second hand is never tied to the book — a pointing finger or
 * a fist arriving takes no cover; a hand gone away is free and the book doesn't follow it;
 * a page goes with the fingertip and, let go before the middle, falls back; two hands open
 * the book as far as they are apart; the second hand unrolls a scroll as far as it pulls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// (page art is drawn on canvases: a stand-in that draws nothing)
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { BookReading, HOLD } = await import('../../src/game/BookReading.js');
const { ScrollReading } = await import('../../src/game/ScrollReading.js');
const { makeSpellBookModel, BOOK } = await import('../../src/game/BookModel.js');

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DT = 1 / 60;
const EYE = V(0, 1.7, 0.2);

function fakeGame(kind, model, item) {
    const head = new THREE.Object3D();
    head.position.copy(EYE);
    const g = {
        items: {
            held: { left: null, right: { item, model } },
            heldOf(k) { for (const side of ['left', 'right']) if (this.held[side]?.item.kind === k) return { side, ...this.held[side] }; return null; },
            moveHeld(a, b) { this.held[b] = this.held[a]; this.held[a] = null; },
            _throw(side) { this.held[side] = null; },
            releaseHand(side) { this.held[side] = null; },
        },
        weapons: { hands: { left: { held: null }, right: { held: null } } },
        character: { head, group: new THREE.Object3D(), getActiveHands: () => ({}) },
        hud: { setVoice() {}, toast() {} },
        combat: { dead: false },
        cameraMode: 'fpv',
        camera: new THREE.PerspectiveCamera(60, 1.6),
        scene: new THREE.Scene(),
    };
    return g;
}

/** A closed book in the right hand, its fore-edge towards the left hand. */
function bookInRightHand() {
    const m = makeSpellBookModel();
    m.scale.setScalar(1.6);
    m.position.set(0.35, 1.4, -0.6);
    m.rotation.y = -Math.PI / 2; // (its +Z — the fore-edge — towards −X, the left hand)
    m.updateMatrixWorld(true);
    const item = { kind: 'book', spells: ['CreateWall', 'Gather'] };
    const g = fakeGame('book', m, item);
    const R = new BookReading(g, { learned: new Set() }, () => new THREE.Texture());
    // (the right hand holds it where it is: by its spine)
    const H = {
        right: { G: m.position.clone(), curl: 0.9, grip: 0.9, tip: null, up: true },
        left: { G: V(-1.2, 1.0, -0.2), curl: 0.1, grip: 0.1, tip: null, up: true },
    };
    R.input = (s) => H[s];
    const run = (sec, each) => { for (let i = 0; i < Math.round(sec / DT); i++) { each?.(i); R.update(DT); } };
    const foreEdge = () => m.localToWorld(V(0, -0.1, BOOK.W));
    return { m, g, R, H, run, foreEdge };
}

const CALM = 0.55; // a hand holding the book (not squeezing it)

test('a book in the hand is open AT ONCE and stays open; it hangs from the hand by the lower part of its spine and the hand does not slide on it', () => {
    const t = bookInRightHand();
    t.H.right.curl = t.H.right.grip = CALM;
    t.run(0.2);
    assert.equal(t.R.s?.mode, 'one', 'open in the hand at once');
    assert.ok(t.R.s.phi > 2.5, 'open from the first moment: ' + t.R.s.phi);
    t.H.right.up = false;
    t.run(2);
    assert.ok(t.R.s && t.R.s.phi > 2.5, 'the arm lowered: still open (it is closed only by the fist)');
    // the book is attached at the spine, a little above the hand and toward the reader: the spine barely moves with the hand's own tremble
    const spine = () => t.m.localToWorld(V(0, -0.1, 0));
    t.H.right.up = true;
    t.run(0.5);
    const p0 = spine(), g0 = t.H.right.G.clone();
    t.run(1);
    assert.ok(spine().distanceTo(p0) < 0.02, 'still hand, still book');
    t.H.right.G.add(V(0.3, 0.2, -0.1));
    t.run(1);
    assert.ok(Math.abs(spine().distanceTo(t.H.right.G) - p0.distanceTo(g0)) < 0.08, 'the book follows the hand as one piece: the spine keeps its place in the hand');
});

test('squeezing the fist shuts the book as much as it is squeezed, all the way if hard; loosened — it opens by itself', () => {
    const t = bookInRightHand();
    t.H.right.curl = t.H.right.grip = CALM;
    t.run(2.5);
    const open = t.R.s.phi;
    assert.ok(open > 2.3);
    t.H.right.curl = t.H.right.grip = 0.8;
    t.run(1.2);
    const half = t.R.s.phi;
    assert.ok(half < open - 0.4 && half > 0.3, 'a little squeezed: a little shut: ' + half);
    t.H.right.curl = t.H.right.grip = 1.0;
    t.run(1.2);
    assert.ok(t.R.s.phi < HOLD.CLOSED_PHI, 'squeezed hard: shut: ' + t.R.s.phi);
    assert.ok(t.R.s, 'still in the hand (shut, not gone)');
    t.H.right.curl = t.H.right.grip = CALM;
    t.run(3);
    assert.ok(t.R.s.phi > 2.3, 'loosened: it opens by itself: ' + t.R.s.phi);
});

test('an index finger drawn across the open book turns a page — right to left forward, left to right back; hovering, trembling, too high or at the end — nothing', () => {
    const t = bookInRightHand();
    t.H.right.curl = t.H.right.grip = CALM;
    t.run(2.5);
    const s = t.R.s, { W, T } = BOOK, sc = 1.6;
    const at = (x, above = 0.05) => t.m.localToWorld(V(x * W, 0, T + above / sc));
    const swipe = (x0, x1, sec = 0.25, above = 0.05) => { const n = Math.round(sec / DT); t.run(sec + DT, (i) => { t.H.left.tip = at(x0 + (x1 - x0) * Math.min(1, i / n), above); }); };
    const settle = () => { t.H.left.tip = null; t.run(2); };
    assert.equal(s.spread, 0);
    // nothing to turn back at the first spread
    swipe(-0.5, 0.2); settle();
    assert.equal(s.spread, 0, 'the first spread: nothing before it');
    // a finger lingering, trembling, or high above: nothing
    t.run(1.0, () => { t.H.left.tip = at(0.4); });
    t.run(1.5, (i) => { t.H.left.tip = at(0.4 + (i % 2 ? 0.02 : -0.02)); });
    swipe(0.6, -0.4, 0.25, 0.5); settle();
    assert.equal(s.spread, 0, 'hovering / trembling / too high turns nothing');
    // from the right to the left: forward
    swipe(0.6, -0.1);
    assert.ok(s.sheet || s.spread === 1, 'the swipe threw a page');
    settle();
    assert.equal(s.spread, 1, 'forward');
    // a short swipe is enough
    t.run(0.6);
    swipe(0.3, 0.05, 0.15); settle();
    assert.equal(s.spread, 2, 'even a little way turns it');
    t.run(0.6);
    swipe(0.5, -0.5); settle();
    assert.equal(s.spread, 2, 'the last spread: nothing after it');
    // the other way: back
    t.run(0.6);
    swipe(-0.5, 0.3); settle();
    assert.equal(s.spread, 1, 'left to right: back');
});

test('the other hand is never tied to the book: it takes no cover, a hand that goes away leaves the book as it is', () => {
    const t = bookInRightHand();
    t.H.right.curl = t.H.right.grip = CALM;
    t.run(2.5);
    const s = t.R.s, phi = s.phi;
    t.H.left.G.copy(t.foreEdge()); t.H.left.curl = t.H.left.grip = 0.1;
    t.run(0.3);
    t.H.left.curl = t.H.left.grip = 0.9;
    t.run(0.6);
    assert.equal(s.mode, 'one', 'a fist closing on the edge is no two-handed hold any more');
    assert.ok(Math.abs(s.phi - phi) < 0.05, 'the book is as open as before');
    t.H.left.G.set(-3, 1, 1);
    t.run(1);
    assert.ok(Math.abs(s.phi - phi) < 0.05 && t.R.s === s, 'the hand gone away: nothing changes');
});

test('a scroll: one hand holds it, the other takes the other roller and unrolls it as far as it pulls; let go — it rolls back up', () => {
    const model = new THREE.Object3D();
    model.position.set(0.3, 1.3, -0.6);
    model.scale.setScalar(2);
    model.updateMatrixWorld(true);
    const item = { kind: 'scroll', stat: 'hp', amount: 2 };
    const g = fakeGame('scroll', model, item);
    g.items.held = { left: null, right: { item, model } };
    const S = new ScrollReading(g);
    const H = { right: { G: model.position.clone(), curl: 0.9, up: true }, left: { G: V(-1, 1.3, -0.4), curl: 0.1, up: true } };
    S.input = (s) => H[s];
    const run = (sec) => { for (let i = 0; i < Math.round(sec / DT); i++) S.update(DT); };
    const leftEnd = () => model.localToWorld(V(-0.21, 0, 0));
    // a pointing hand at its end, a fist arriving: nothing
    H.left.G.copy(leftEnd()); H.left.curl = 0.02;
    run(0.2);
    H.left.G.set(-2, 1.3, -0.6); H.left.curl = 0.9; run(0.2);
    H.left.G.copy(leftEnd()); run(1);
    assert.equal(S.r, null, 'a fist arriving takes no roller');
    // an open hand to the end, closing on the roller: it is in both hands
    H.left.G.set(-2, 1.3, -0.6); H.left.curl = 0.1; run(0.1);
    H.left.G.copy(leftEnd()); run(0.1);
    H.left.curl = 0.9; run(0.4);
    assert.ok(S.r, 'the second hand took the other roller');
    assert.equal(S.readingSide, 'right');
    // pulled apart: unrolled as far as the hands are apart (the rollers in the fists)
    for (const d of [0.8, 1.6]) {
        H.left.G.copy(H.right.G).add(V(-d, 0, 0));
        run(0.6);
        assert.ok(Math.abs(S.r.parch.scale.x - d) < 0.03, `unrolled ${d} m: ${S.r.parch.scale.x}`);
        S.r.group.updateMatrixWorld(true);
        const ends = [S.r.rollA, S.r.rollB].map((o) => o.getWorldPosition(new THREE.Vector3()));
        const toHands = Math.min(ends[0].distanceTo(H.left.G) + ends[1].distanceTo(H.right.G), ends[1].distanceTo(H.left.G) + ends[0].distanceTo(H.right.G));
        assert.ok(toHands < 0.05, 'the rollers in the fists: ' + toHands);
    }
    assert.ok(S.r.open > 0.5, 'it reads open');
    // the second hand opens: it lets go — the parchment rolls back to the first fist, then it is a rolled scroll again
    H.left.curl = 0.05;
    run(0.55);
    assert.ok(S.r?.rolling, 'let go: it rolls back up');
    const w = S.r.parch.scale.x;
    assert.ok(w < 1.6, 'already rolling: ' + w);
    run(0.6);
    assert.equal(S.r, null, 'rolled up');
    assert.equal(model.visible, true, 'the rolled scroll is in the fist again');
    // and the hand pulling further than the parchment is long: the roller slips out of it
    H.left.G.set(-2, 1.3, -0.6); H.left.curl = 0.1; run(0.1);
    H.left.G.copy(leftEnd()); run(0.1);
    H.left.curl = 0.9; run(0.4);
    assert.ok(S.r);
    H.left.G.copy(H.right.G).add(V(-3.6, 0, 0));
    run(1);
    assert.equal(S.r, null, 'pulled beyond its length: the roller slipped out, it rolled up');
});

test('a scroll opens by the distance between the hands alone: sideways, up-down and slanted give the same opening, readable and held at the ends', () => {
    const opened = (dir, d, lostFrame) => {
        const model = new THREE.Object3D();
        model.position.set(0.3, 1.3, -0.6);
        model.scale.setScalar(2);
        model.updateMatrixWorld(true);
        const item = { kind: 'scroll', stat: 'hp', amount: 2 };
        const g = fakeGame('scroll', model, item);
        g.items.held = { left: null, right: { item, model } };
        const S = new ScrollReading(g);
        const H = { right: { G: model.position.clone(), curl: 0.9 }, left: { G: V(-2, 1.3, -0.6), curl: 0.1 } };
        S.input = (s) => H[s];
        const run = (sec) => { for (let i = 0; i < Math.round(sec / DT); i++) S.update(DT); };
        run(0.1);
        H.left.G.copy(model.localToWorld(V(-0.21, 0, 0))); run(0.1);
        H.left.curl = 0.9; run(0.4);
        assert.ok(S.r, 'taken');
        H.left.G.copy(H.right.G).addScaledVector(dir.clone().normalize(), d);
        run(0.8);
        if (lostFrame) { H.left.lost = true; H.left.curl = 0; H.left.G.set(0, 0, 0); run(0.5); H.left.lost = false; H.left.curl = 0.9; H.left.G.copy(H.right.G).addScaledVector(dir.clone().normalize(), d); run(0.2); }
        assert.ok(S.r && !S.r.rolling, 'still open');
        S.r.group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(S.r.parch);
        const q = S.r.group.quaternion;
        const up = V(0, 1, 0).applyQuaternion(q), face = V(0, 0, 1).applyQuaternion(q);
        const ends = [S.r.rollA, S.r.rollB].map((o) => o.getWorldPosition(new THREE.Vector3()));
        const toHands = Math.min(ends[0].distanceTo(H.left.G) + ends[1].distanceTo(H.right.G), ends[1].distanceTo(H.left.G) + ends[0].distanceTo(H.right.G));
        return { w: S.r.parch.scale.x, open: S.r.open, up, face, toHands, box };
    };
    for (const d of [0.8, 1.6]) {
        const ref = opened(V(-1, 0, 0), d);
        for (const dir of [V(0, 1, 0), V(0, -1, 0), V(-1, 1, 0), V(1, -1, 0.3), V(0, 1, 1)]) {
            const o = opened(dir, d);
            assert.ok(Math.abs(o.w - d) < 0.03, `opened ${d} along ${dir.toArray()}: ${o.w}`);
            assert.ok(Math.abs(o.open - ref.open) < 0.02, 'same opening as sideways');
            assert.ok(o.toHands < 0.05, 'rollers in the fists: ' + o.toHands);
            assert.ok(o.face.z > 0.2 || o.face.dot(V(0, 0, 1)) > -1, 'has a face');
        }
    }
    // up-down: the text runs along the hands, bottom → top; sideways: left → right, upright
    const vert = opened(V(0, 1, 0), 1.6);
    assert.ok(Math.abs(vert.box.max.y - vert.box.min.y) > 1.5, 'stands tall: ' + (vert.box.max.y - vert.box.min.y));
    assert.ok(Math.abs(vert.box.max.x - vert.box.min.x) < 1.2, 'and narrow');
    assert.ok(vert.up.x * 0 + Math.abs(vert.up.y) < 0.2, 'the text runs along the hands');
    const side = opened(V(-1, 0, 0), 1.6);
    assert.ok(side.up.y > 0.7, 'sideways: the text stands upright');
    // a hand the camera lost for a moment: nothing jerks, nothing closes
    const lost = opened(V(0, 1, 0), 1.6, true);
    assert.ok(Math.abs(lost.w - 1.6) < 0.03, 'a lost hand did not close it: ' + lost.w);
});
