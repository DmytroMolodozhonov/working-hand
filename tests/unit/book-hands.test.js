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
const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
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

/** Both hands on the covers, then apart: open. */
function openWithTwoHands(t) {
    t.H.left.grip = 0.1; t.H.left.curl = 0.1;
    t.H.left.G.copy(t.foreEdge());
    t.run(0.1);
    t.H.left.grip = 0.9; t.H.left.curl = 0.9;
    t.run(0.4);
    assert.equal(t.R.s?.mode, 'two', 'the open hand closing on the edge took the cover');
}

test('a pointing hand (index out to turn a page) or a fist arriving at the edge takes no cover', () => {
    const t = bookInRightHand();
    // pointing: the index out, the others in — the old «curl» said 0.67 («closed»)
    t.H.left.curl = 0.67; t.H.left.grip = 0.02;
    t.H.left.G.copy(t.foreEdge());
    t.run(1.5);
    assert.equal(t.R.s, null, 'a pointing finger at the edge is not a hand on the cover');
    // a fist that comes from far away, already closed
    t.H.left.G.set(-1.5, 1.0, 0); t.H.left.curl = 0.9; t.H.left.grip = 0.9;
    t.run(0.3);
    t.H.left.G.copy(t.foreEdge());
    t.run(1.5);
    assert.equal(t.R.s, null, 'a fist arriving takes nothing');
    // an open hand closing a little away from the edge (out of reach): nothing
    t.H.left.curl = t.H.left.grip = 0.1;
    t.H.left.G.copy(t.foreEdge()).add(V(-HOLD.REACH - 0.15, 0, 0));
    t.run(0.2);
    t.H.left.curl = t.H.left.grip = 0.9;
    t.run(1);
    assert.equal(t.R.s, null, 'closing beside the book takes nothing');
    // the hand comes open to the edge and closes on it: now it holds the cover
    t.H.left.curl = t.H.left.grip = 0.1;
    t.H.left.G.copy(t.foreEdge());
    t.run(0.2);
    t.H.left.curl = t.H.left.grip = 0.9;
    t.run(0.4);
    assert.equal(t.R.s?.mode, 'two');
});

test('two hands: as open as the hands are apart; together again — closed', () => {
    const t = bookInRightHand();
    openWithTwoHands(t);
    const C = V(0, 1.3, -0.8);
    const phiAt = (d) => { t.H.left.G.copy(C).add(V(-d / 2, 0, 0)); t.H.right.G.copy(C).add(V(d / 2, 0, 0)); t.run(0.6); return t.R.s.phi; };
    const p1 = phiAt(0.8), p2 = phiAt(1.2);
    assert.ok(Math.abs(p1 - 2 * Math.asin((0.4 - t.R.t) / t.R.w)) < 0.05, 'open as far as the hands are apart: ' + p1);
    assert.ok(p2 > p1 + 0.3, 'wider: more open');
    const p3 = phiAt(2 * t.R.t + 0.02);
    assert.ok(p3 < HOLD.CLOSED_PHI, 'hands together: closed ' + p3);
});

test('the second hand lets go and is free at once: the book does not follow it', () => {
    const t = bookInRightHand();
    openWithTwoHands(t);
    const C = V(0, 1.3, -0.8);
    t.H.left.G.copy(C).add(V(-0.6, 0, 0)); t.H.right.G.copy(C).add(V(0.6, 0, 0));
    t.run(0.6);
    // the left hand points its index (to turn a page): it lets the cover go
    t.H.left.grip = 0.02; t.H.left.curl = 0.67;
    t.run(0.5);
    assert.equal(t.R.s?.mode, 'one', 'a pointing hand let the cover go');
    assert.equal(t.R.s.hold.left, null);
    t.run(4); // (it settles open in the right hand)
    const at = t.m.position.clone(), q = t.m.quaternion.clone();
    // the free hand goes anywhere — as a fist, pointing, open, even close by the edge: the book stays in the right hand
    for (const [g, x] of [[0.9, -1.4], [0.02, -0.2], [0.1, 0.9], [0.9, 0.2]]) {
        t.H.left.grip = g; t.H.left.curl = Math.max(g, 0.6);
        t.run(0.5, (i) => t.H.left.G.set(x + 0.2 * Math.sin(i / 5), 1.0 + 0.3 * Math.cos(i / 7), -0.3));
        assert.equal(t.R.s?.mode, 'one', 'the free hand took nothing: ' + JSON.stringify([g, x]));
        assert.ok(t.m.position.distanceTo(at) < 1e-3 && t.m.quaternion.angleTo(q) < 1e-3, 'the book did not follow the free hand: ' + t.m.position.distanceTo(at) + ' ' + t.m.quaternion.angleTo(q));
    }
});

test('pulled wider than the open book reaches: the cover slips out of the second hand', () => {
    const t = bookInRightHand();
    openWithTwoHands(t);
    const C = V(0, 1.3, -0.8);
    const far = 2 * (t.R.w + t.R.t) + HOLD.SLIP + 0.3;
    t.H.left.G.copy(C).add(V(-far / 2, 0, 0)); t.H.right.G.copy(C).add(V(far / 2, 0, 0));
    t.run(0.6);
    assert.equal(t.R.s?.mode, 'one', 'the book did not stretch after the hand');
    assert.equal(t.R.s.owner, 'right');
});

test('a page goes with the fingertip; a finger hovering above catches nothing; let go before the middle — it falls back, over the middle — it turns', () => {
    const t = bookInRightHand();
    openWithTwoHands(t);
    const C = V(0, 1.3, -0.8);
    t.H.left.G.copy(C).add(V(-0.6, 0, 0)); t.H.right.G.copy(C).add(V(0.6, 0, 0));
    t.run(0.6);
    // the right hand lets go: the book stays open in the left one, the right fingertip turns pages
    t.H.right.grip = t.H.right.curl = 0.05;
    t.run(0.5);
    assert.equal(t.R.s?.mode, 'one');
    assert.equal(t.R.s.owner, 'left');
    t.run(2);
    const s = t.R.s, b = t.m.userData.book;
    const { W, T } = BOOK;
    const onPage = (x, z) => { b.R.updateWorldMatrix(true, false); return b.R.localToWorld(V(x, 0, z)); };
    // (round the spine, in the book's own frame: from the right page up and over)
    const round = (a) => t.m.localToWorld(V(Math.cos(a) * W * 0.9, 0, T + Math.sin(a) * W * 0.9));
    // hovering a hand's breadth above the page: nothing
    t.H.right.tip = onPage(W * 0.9, T + 0.2);
    t.run(1);
    assert.equal(s.sheet, null, 'a finger above the page does not lift it');
    // on the middle of the page (not its edge): nothing
    t.H.right.tip = onPage(W * 0.4, T + 0.01);
    t.run(1);
    assert.equal(s.sheet, null, 'the middle of a page is not its edge');
    // under the edge, then lifted a little — and let go before the middle
    const spread0 = s.spread;
    const a0 = Math.PI / 2 - s.phi / 2 + 0.02;
    t.H.right.tip = round(a0);
    t.run(0.2);
    assert.ok(s.sheet, 'the fingertip at the edge caught the page');
    const seen = [];
    for (let i = 0; i <= 20; i++) { t.H.right.tip = round(a0 + i * 0.03); t.R.update(DT); seen.push(s.sheet?.beta); }
    assert.ok(Math.abs(seen.at(-1) - (a0 + 0.6)) < 0.12, 'the page is where the finger is: ' + seen.at(-1));
    t.H.right.tip = null;
    t.run(2);
    assert.equal(s.sheet, null);
    assert.equal(s.spread, spread0, 'let go before the middle: it fell back');
    // again — carried over the middle and let go: it turns over by itself
    t.H.right.tip = round(a0);
    t.run(0.2);
    assert.ok(s.sheet);
    for (let i = 0; i <= 40; i++) { t.H.right.tip = round(a0 + i * (Math.PI / 2 + 0.3 - a0) / 40); t.R.update(DT); }
    t.H.right.tip = null;
    t.run(2);
    assert.equal(s.sheet, null);
    assert.equal(s.spread, spread0 + 1, 'over the middle: the next spread');
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
    run(0.35);
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
