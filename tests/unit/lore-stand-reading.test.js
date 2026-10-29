// A book lying open on a reading stand (LoreLibrary.js, BookReading.standOpen/standStep): a finger turns its pages
// the same as in the hands — catches the edge, the page follows, let go before the middle it falls back, over the
// middle it turns — and a finger/hand never goes into the board.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { BookReading } = await import('../../src/game/BookReading.js');
const { makeStandModel, bookPoseOnStand, loreScale } = await import('../../src/game/LoreLibrary.js');
const { makeItemModel, ITEM_SCALE } = await import('../../src/game/ItemTypes.js');
const { loreItem } = await import('../../src/game/LoreBooks.js');
const { BOOK, setBookAngle } = await import('../../src/game/BookModel.js');

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DT = 1 / 60;

function setup() {
    const stand = makeStandModel();
    stand.position.set(10, 5, 20);
    stand.rotation.y = Math.PI / 2;
    const book = makeItemModel(loreItem('coprus', 'u'));
    book.scale.setScalar(loreScale());
    bookPoseOnStand(book.position, book.quaternion);
    setBookAngle(book, Math.PI);
    stand.add(book);
    stand.updateMatrixWorld(true);
    const head = new THREE.Object3D();
    head.position.set(12.8, 8.9, 20);
    const g = {
        items: { held: { left: null, right: null } },
        weapons: { hands: { left: { held: null }, right: { held: null } } },
        character: { head, group: new THREE.Object3D(), getActiveHands: () => ({}) },
        hud: { setVoice() {}, toast() {} }, sound: { playPage() {} },
        combat: { dead: false }, cameraMode: 'fpv', camera: new THREE.PerspectiveCamera(60, 1.6), scene: new THREE.Scene(),
    };
    const R = new BookReading(g, { learned: new Set() }, () => new THREE.Texture());
    const H = { right: { G: V(0, 0, 0), curl: 0.05, grip: 0.05, tip: null, up: true }, left: { G: V(0, 0, 0), curl: 0.05, grip: 0.05, tip: null, up: true } };
    R.input = (s) => H[s];
    const s = R.standOpen(book, loreItem('coprus', 'u'));
    const run = (sec) => { for (let i = 0; i < sec / DT; i++) R.standStep(s, DT, true); };
    return { R, s, H, book, run };
}

test('a book on a stand: a fingertip catches a page by its edge and turns it; let go before the middle it falls back', () => {
    const { s, H, book, run } = setup();
    const { W, T } = BOOK;
    assert.equal(s.phi, Math.PI);
    assert.equal(s.spread, 0);
    const round = (a) => book.localToWorld(V(Math.cos(a) * W * 0.9, 0, T + Math.sin(a) * W * 0.9));
    H.right.tip = book.localToWorld(V(W * 0.9, 0, T + 0.3)); // (hovering above: nothing)
    run(1);
    assert.equal(s.sheet, null, 'a finger above the page catches nothing');
    const a0 = 0.02;
    H.right.tip = round(a0);
    run(0.2);
    assert.ok(s.sheet, 'the edge caught');
    for (let i = 0; i <= 20; i++) { H.right.tip = round(a0 + i * 0.03); run(DT); }
    H.right.tip = null;
    run(2);
    assert.equal(s.sheet, null);
    assert.equal(s.spread, 0, 'let go before the middle: it fell back');
    H.right.tip = round(a0);
    run(0.2);
    assert.ok(s.sheet);
    for (let i = 0; i <= 40; i++) { H.right.tip = round(a0 + i * (Math.PI / 2 + 0.3 - a0) / 40); run(DT); }
    H.right.tip = null;
    run(2);
    assert.equal(s.sheet, null);
    assert.equal(s.spread, 1, 'over the middle: the next spread');
});

test('a book on a stand: a hand that cannot be seen (no pose) turns nothing, and a reader far off leaves the page it holds to fall', () => {
    const { R, s, H, book, run } = setup();
    const { W, T } = BOOK;
    const round = (a) => book.localToWorld(V(Math.cos(a) * W * 0.9, 0, T + Math.sin(a) * W * 0.9));
    H.right.tip = round(0.02);
    run(0.2);
    assert.ok(s.sheet);
    for (let i = 0; i < 30; i++) { H.right.tip = round(0.02 + i * 0.03); run(DT); }
    for (let i = 0; i < 200; i++) R.standStep(s, DT, false); // (walked off: the finger is let go)
    assert.equal(s.sheet, null);
    R.standClose(s);
});
