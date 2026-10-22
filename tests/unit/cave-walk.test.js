import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CollisionWorld } from '../../src/world/Collision.js';
import { StoopReader } from '../../src/input/StoopReader.js';
import { ManaCrystals, crystalCluster } from '../../src/game/ManaCrystals.js';

/**
 * A little piece of cave: rock everywhere (top layer 12) but a corridor along x (z −1…1):
 * its floor is layer 0 (the feet at y −0.5), air over it up to `roof(x)` (inclusive);
 * `step(x)`: the floor one block higher there (a mound).
 */
function cave(roof, step = () => false) {
    const solid = (x, L, z) => {
        if (L > 12) return false;
        if (Math.abs(z) > 1) return true;
        if (L <= 0) return true;
        if (L === 1 && step(x)) return true;
        return L > roof(x);
    };
    return {
        topLayer: () => 12,
        surfaceY: () => 11.5,
        solidIn: (x, z, L0, L1) => { for (let L = L0; L <= Math.min(L1, 12); L++) if (solid(x, L, z)) return true; return false; },
        floorBelow: (x, z, L) => { for (let l = Math.min(L, 12); l >= -17; l--) if (solid(x, l, z)) return l; return -18; },
        ceilingAbove: (x, z, L) => { for (let l = L; l <= 12; l++) if (solid(x, l, z)) return l; return Infinity; },
    };
}

/** Walk from x0 along +x in short steps (as Game does), the body `h` high: where it gets to. */
function walk(col, x0, x1, h) {
    const p = new THREE.Vector3(x0, 1.5, 0);
    for (let x = x0; x < x1; x += 0.1) { p.x += 0.1; col.resolveCylinder(p, 0.48, -0.5, h, 1.05, true); }
    return p;
}

test('cave walk: a low roof stops a standing hero; bent down, the hero walks under it', () => {
    const col = new CollisionWorld();
    col.setTerrain(cave((x) => (x < 10 ? 4 : 3))); // (4 m of room, then 3 m)
    const stand = walk(col, 6, 14, 3.5);
    assert.ok(stand.x < 9.6, `standing: stopped before the low roof (x ${stand.x.toFixed(2)})`);
    assert.ok(Math.abs(stand.z) < 1e-6, 'not shoved sideways');
    const bent = walk(col, 6, 14, 2.5);
    assert.ok(bent.x > 13, `bent down: under it (x ${bent.x.toFixed(2)})`);
});

test('cave walk: a mound under a low roof is a wall — the body is never shoved off it sideways', () => {
    const col = new CollisionWorld();
    // 4 m of room, but over a mound (one block up) only 3 m: standing there the head is in the rock
    col.setTerrain(cave(() => 4, (x) => x === 5));
    const p = new THREE.Vector3(5 - 0.5 - 0.3, 1.5, 0.3); // (the body's edge 0.18 m over the mound)
    col.resolveCylinder(p, 0.48, -0.5, 3.5, 1.05, true);
    assert.ok(p.x <= 4.5 - 0.48 + 1e-6, `pushed back off it (x ${p.x.toFixed(2)})`);
    assert.ok(Math.abs(p.z - 0.3) < 1e-6, 'along its own way, not sideways');
    // bent down, the mound is a step under the roof: walked onto
    const q = new THREE.Vector3(5 - 0.5 - 0.3, 1.5, 0.3);
    col.resolveCylinder(q, 0.48, -0.5, 2.5, 1.05, true);
    assert.ok(Math.abs(q.x - 4.2) < 1e-6, 'bent: a step');
    // under a high roof it is a step as it always was
    const col2 = new CollisionWorld();
    col2.setTerrain(cave(() => 6, (x) => x === 5));
    const r = new THREE.Vector3(4.2, 1.5, 0.3);
    col2.resolveCylinder(r, 0.48, -0.5, 3.5, 1.05, true);
    assert.ok(Math.abs(r.x - 4.2) < 1e-6);
});

test('stoop (camera): bending down lowers it; a walk\'s bob and looking down at the hands do not', () => {
    const S = new StoopReader();
    const pose = (y, nose = y - 0.15) => { const lm = []; lm[0] = { x: 0.5, y: nose }; lm[11] = { x: 0.6, y, visibility: 1 }; lm[12] = { x: 0.4, y, visibility: 1 }; return lm; };
    let t = 0, v = 0;
    for (let i = 0; i < 90; i++) v = S.read(pose(0.4 + 0.015 * Math.sin(i)), (t += 33)); // standing, bobbing
    assert.equal(v, 0, 'standing (a walk on the spot): no stoop');
    for (let i = 0; i < 30; i++) v = S.read(pose(0.4, 0.38), (t += 33)); // the head looks down
    assert.equal(v, 0, 'looking down: no stoop');
    for (let i = 0; i < 30; i++) v = S.read(pose(0.46), (t += 33)); // bent a little (0.3 shoulder widths)
    assert.ok(v > 0.35 && v < 0.75, `a little: ${v.toFixed(2)}`);
    for (let i = 0; i < 30; i++) v = S.read(pose(0.55), (t += 33));
    assert.equal(v, 1, 'bent low');
    for (let i = 0; i < 300; i++) v = S.read(pose(0.55), (t += 33)); // 10 s in a low tunnel
    assert.ok(v > 0.9, `still bent after 10 s: ${v.toFixed(2)}`);
    for (let i = 0; i < 30; i++) v = S.read(pose(0.4), (t += 33));
    assert.equal(v, 0, 'up again');
});

test('mana crystal: reach out with an open hand and squeeze it right in the rock — it cracks there, its power flies into me: +1 cell (a fist bumping breaks nothing)', () => {
    const grip = { right: new THREE.Vector3(), left: new THREE.Vector3(9, 9, 9) }, curl = { right: 0, left: 0 };
    const held = { right: null, left: null };
    let cells = 0;
    const g = {
        config: { mode: 'survival' }, fx: null, currentPose: {}, combat: { dead: false }, authority: true, localId: 'local',
        character: {
            group: { position: new THREE.Vector3() },
            getGripObject: (s) => ({ getWorldPosition: (v) => v.copy(grip[s]) }),
            getGripCurl: (s) => curl[s],
            getHandDirection: (s, v) => v.set(0, 0, -1),
        },
        items: { held, takeIntoHand: (item, s) => { held[s] = { item, model: { position: grip[s] } }; return true; }, releaseHand: (s) => { held[s] = null; } },
        weapons: { hands: { right: {}, left: {} } },
        mana: { crystal: () => cells++ },
    };
    const mc = new ManaCrystals(g);
    const cv = { id: 'cvW', kx: 0, kz: 0, ex: 20, ez: 0, F: 10, r: 7 };
    let cl = null;
    for (let s = 0; s < 50 && !cl; s++) cl = crystalCluster(cv, s);
    mc.addCluster(cv.id, cl);
    const c = mc.growing()[0];
    const n = mc.growing().length;
    // a fist bumping into it: nothing
    grip.right.copy(c.center); curl.right = 0.9;
    for (let i = 0; i < 20; i++) mc.update(1 / 30);
    assert.equal(mc.growing().length, n, 'a fist breaks nothing');
    // the open hand comes, roughly where the eye sees it (0.3 m off — the camera's depth is rough)…
    curl.right = 0.1; grip.right.copy(c.center).add(new THREE.Vector3(0, 0, 0.3 + c.r));
    for (let i = 0; i < 10; i++) mc.update(1 / 30);
    // …and squeezes: it cracks right there — never into the hand or the slots
    for (const k of [0.3, 0.45, 0.6, 0.8]) { curl.right = k; mc.update(1 / 30); }
    assert.equal(mc.growing().length, n - 1);
    assert.equal(held.right, null, 'not in the hand');
    assert.ok(mc.log.some((e) => e.ev === 'squeeze'));
    assert.equal(cells, 1, '+1 cell of mana');
    // a crystal from a slot («Gather») held in the hand: the hand opens on it, then squeezes — it cracks: +1
    held.left = { item: { kind: 'crystal', uid: 'k1', count: 2 }, model: { position: new THREE.Vector3(0, 1, 0) } };
    curl.left = 0.8; mc.update(1 / 30);
    assert.equal(cells, 1, 'taken into a closed hand: nothing until it opens and squeezes');
    curl.left = 0.2; mc.update(1 / 30);
    curl.left = 0.8; mc.update(1 / 30);
    assert.equal(cells, 2);
    assert.equal(held.left.item.count, 1, 'one of the two');
    curl.left = 0.2; mc.update(1 / 30); curl.left = 0.8; mc.update(1 / 30);
    assert.equal(cells, 3);
    assert.equal(held.left, null, 'the last one: the hand is empty');
});
