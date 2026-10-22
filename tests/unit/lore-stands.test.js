// The reading stands of the world's history (LoreStand.js, LoreLibrary.js): no chests and no librarian in the
// libraries, a stand for every book, the book is part of the stand (never a loose thing: nothing takes it),
// the stand is ordinary furniture (its post is blocks): the post gone — the stand gone, the book falls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { TerrainData } from '../../src/world/Terrain.js';
import { LORE_BOOKS, loreForSite } from '../../src/game/LoreBooks.js';
import { STAND, postCell, boardBox } from '../../src/world/LoreStand.js';
import { LoreLibrary, makeStandModel, bookPoseOnStand } from '../../src/game/LoreLibrary.js';
import { makeItemModel, ITEM_SCALE } from '../../src/game/ItemTypes.js';
import { loreItem } from '../../src/game/LoreBooks.js';
import { BOOK, setBookAngle } from '../../src/game/BookModel.js';

const world = (seed) => { const t = new TerrainData(); t.generate({ seed, mountains: true }); return t; };

function checkSpots(spots, label) {
    assert.equal(spots.length, LORE_BOOKS.length, `${label}: a stand for every book`);
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
        const d = Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z);
        assert.ok(d >= 1.9 || Math.abs(spots[i].y - spots[j].y) > 3, `${label}: stands ${i} and ${j} apart (${d.toFixed(2)})`);
    }
    for (const s of spots) assert.ok(Number.isFinite(s.face), `${label}: faces a reader`);
}

test('tower library: a stand for each book, a post under each, no chests in the library', () => {
    for (const seed of [4242, 12345, 1, 7]) {
        const t = world(seed), w = t.towers.only();
        checkSpots(w.lore, `tower ${seed}`);
        for (const s of w.lore) {
            const [ix, iz, L] = postCell(s);
            assert.notEqual(t.get(ix, L, iz), 0, 'post, low block');
            assert.notEqual(t.get(ix, L + 1, iz), 0, 'post, high block');
            assert.equal(t.get(ix, L + 2, iz), 0, 'nothing over the post');
        }
        assert.ok(!w.chests.some((c) => c.room === 'library' || c.room === 'reading'), 'no chests in the library');
    }
});

test('wizards’ town library: a stand for each book, no chests, no librarian', () => {
    const t = world(4242), s = t.villages.spawnVillage();
    checkSpots(s.lore, 'village');
    const lib = s.houses.find((h) => h.kind === 'library');
    assert.equal(lib.chests.length, 0);
    assert.ok(!s.spots.some((p) => p.kind === 'desk'), 'no desk post in the library');
    assert.ok(!/job: 'desk'/.test(fs.readFileSync(new URL('../../src/game/WizVillages.js', import.meta.url), 'utf8')), 'nobody reads at a desk');
    for (const p of s.lore) { const [ix, iz, L] = postCell(p); assert.notEqual(t.get(ix, L, iz), 0); }
});

test('castle libraries have no chests', () => {
    const src = fs.readFileSync(new URL('../../src/world/Castles.js', import.meta.url), 'utf8');
    assert.ok(/kind === 'library'\) wants\.length = 0/.test(src));
});

test('sizes: a stand fits a hero (3.5 m): the board 2.0–2.6 m up, the open book lies on it, the stand a little wider than the book', () => {
    const m = makeStandModel();
    const book = makeItemModel(loreItem('coprus', 'u'));
    book.scale.setScalar(ITEM_SCALE.book);
    bookPoseOnStand(book.position, book.quaternion);
    setBookAngle(book, Math.PI);
    m.add(book);
    m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m), bk = new THREE.Box3().setFromObject(book);
    const wb = bk.max.x - bk.min.x;
    assert.ok(wb > 1.4 && wb < 1.6, `an open book ${wb.toFixed(2)} m wide`);
    assert.ok(bb.max.x - bb.min.x > wb + 0.1 && bb.max.x - bb.min.x < wb + 0.6, `the stand ${(bb.max.x - bb.min.x).toFixed(2)} m wide`);
    assert.ok(bk.min.y > 2.0 && bk.max.y < 2.75, `the book at ${bk.min.y.toFixed(2)}–${bk.max.y.toFixed(2)} m`);
    assert.ok(bb.min.y >= 1.99 && bb.max.y < 2.85, `the stand over its post: ${bb.min.y.toFixed(2)}–${bb.max.y.toFixed(2)} m`);
    assert.ok(STAND.BOARD_Y >= 2.2 && STAND.BOARD_Y <= 2.5 && Math.round(STAND.TILT * 180 / Math.PI) >= 25 && Math.round(STAND.TILT * 180 / Math.PI) <= 35);
    assert.ok(BOOK.W > 0);
    const box = boardBox({ x: 10, y: 5, z: 20, face: 0 });
    assert.ok(box.maxX - box.minX >= 1.79 && box.minY === 7);
});

test('a book on a stand is no loose thing; the post gone — the stand falls, the book drops as an ordinary book', () => {
    const t = world(4242), w = t.towers.only();
    const loose = new Map(), spawned = [], boxes = new Map();
    let nb = 0;
    const game = {
        scene: new THREE.Scene(), authority: true, world: { terrain: { data: t } },
        collision: { addBox: (b) => { boxes.set(++nb, b); return nb; }, removeBox: (id) => boxes.delete(id) },
        items: { loose, spawnLoose: (item, p) => { spawned.push({ item, p: p.clone() }); } },
    };
    const lib = new LoreLibrary(game);
    for (const s of w.lore) t.chunk(Math.round(s.x) >> 5, Math.round(s.z) >> 5);
    lib.wake(w);
    assert.equal(loose.size, 0, 'the books are not loose things (nothing takes them)');
    assert.equal(game.scene.children.length, loreForSite(w).length, 'a stand with its book each');
    assert.equal(boxes.size, loreForSite(w).length, 'a collision box each');
    // the stand is ordinary furniture: break the first post
    const [ix, iz, L] = postCell(w.lore[0]);
    t.set(ix, L, iz, 0);
    lib.update(1);
    assert.equal(game.scene.children.length, loreForSite(w).length - 1);
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0].item.kind, 'book');
    assert.equal(spawned[0].item.lore, loreForSite(w)[0].id, 'its own book falls');
    assert.ok(Math.abs(spawned[0].p.y - (w.lore[0].y + 2.3)) < 0.6, 'from the board');
    // asleep and awake again: the broken stand does not come back
    lib.sleep(w); assert.equal(game.scene.children.length, 0); assert.equal(boxes.size, 0);
    lib.wake(w); assert.equal(game.scene.children.length, loreForSite(w).length - 1);
});
