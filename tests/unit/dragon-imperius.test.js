// The dragon with a mind of «Империус Максима»: standing is standing; the fire sets alight (the table); the wings and the body break things.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WalkGate, WALK_GATE, FLAME_TARGETS, SMASH, SMASH_TARGETS, strikeOf, pickBreaks, blowOn, hardnessOf } from '../../src/game/DragonImperius.js';
import { DragonSmash } from '../../src/game/DragonSmash.js';
import { BLOCK } from '../../src/world/Terrain.js';

const DT = 1 / 60;

test('standing is standing: no steps, a stale camera, a lost pose, a pause, a blip — the dragon does not walk', () => {
    const G = new WalkGate();
    let w = 0;
    for (let i = 0; i < 120; i++) w = Math.max(w, G.step({ running: false, intensity: 0.6, age: 0.02 }, DT));
    assert.equal(w, 0, 'not stepping: stands');
    // a blip of one frame
    assert.equal(G.step({ running: true, intensity: 0.6, age: 0.02 }, DT), 0, 'a blip is no step');
    G.step({ running: false, intensity: 0, age: 0.02 }, DT);
    // really stepping: walks after START
    let went = 0;
    for (let i = 0; i < 30; i++) went = G.step({ running: true, intensity: 0.6, age: 0.02 }, DT);
    assert.ok(went >= 0.2, 'stepping: walks');
    // the camera stops sending poses (the last «бегу» stays in the smoother): it stops
    assert.equal(G.step({ running: true, intensity: 0.6, age: WALK_GATE.STALE + 0.1 }, DT), 0, 'stale pose: stands');
    // and after that it needs the START again
    assert.equal(G.step({ running: true, intensity: 0.6, age: 0.02 }, DT), 0, 'restarts from standing');
    for (let i = 0; i < 30; i++) went = G.step({ running: true, intensity: 0.6, age: 0.02 }, DT);
    assert.ok(went > 0);
    assert.equal(G.step({ running: true, intensity: 0.6, age: 0.02, paused: true }, DT), 0, 'a pause');
    for (let i = 0; i < 30; i++) went = G.step({ running: true, intensity: 0.6, age: 0.02 }, DT);
    assert.equal(G.step({ running: true, intensity: 0.6, age: 0.02, lost: true }, DT), 0, 'the pose lost');
    assert.equal(G.step({ running: false, intensity: 0.6, age: 0.02 }, DT), 0, 'legs stopped: it stops at once');
});

test('the fire: the table names every kind of target; many burn; the immune say why', () => {
    const burn = Object.entries(FLAME_TARGETS).filter(([, v]) => v.does === 'burn').map(([k]) => k);
    assert.ok(burn.length >= 8, 'it sets alight: ' + burn.join(', '));
    for (const k of ['trees', 'wood', 'grass', 'villagers', 'animals', 'zombies', 'sailors', 'ships']) assert.ok(burn.includes(k), k);
    for (const k of ['iceQueen', 'dragons', 'gods']) assert.equal(FLAME_TARGETS[k].does, 'none', k);
    for (const v of Object.values(FLAME_TARGETS)) assert.ok(v.why.length > 10);
});

test('the weight: slow is a touch; fast breaks; hard things need more; the land never breaks', () => {
    assert.equal(strikeOf(SMASH.MIN_SPEED - 0.1, 1.25).budget, 0, 'slow: nothing');
    const wing = strikeOf(20, 1.25, 0.7), dive = strikeOf(40, 1.25, 1.6);
    assert.ok(dive.budget > wing.budget * 3 && wing.budget > 0, `a dive breaks far more: ${wing.budget.toFixed(0)} → ${dive.budget.toFixed(0)}`);
    assert.ok(dive.depth > wing.depth);
    for (const t of ['GRASS', 'DIRT', 'STONE', 'SAND', 'SNOW', 'GRAVEL', 'WATER', 'BEDROCK', 'DEEPSTONE', 'ENCHANTED', 'ARCANE_WARD', 'REGOLITH']) assert.equal(hardnessOf(BLOCK[t]), null, t + ' is not broken');
    for (const t of ['LEAVES', 'PLANKS', 'ROOF_RED', 'BRICK', 'CS_GREY', 'THATCH', 'FENCE']) assert.ok(hardnessOf(BLOCK[t]) > 0, t);
    assert.ok(hardnessOf(BLOCK.LEAVES) < hardnessOf(BLOCK.PLANKS) && hardnessOf(BLOCK.PLANKS) < hardnessOf(BLOCK.CS_GREY));
    const cells = [{ x: 0, L: 1, z: 0, t: BLOCK.CS_GREY, d: 1 }, { x: 1, L: 1, z: 0, t: BLOCK.LEAVES, d: 2 }, { x: 2, L: 1, z: 0, t: BLOCK.GRASS, d: 0.5 }, { x: 3, L: 1, z: 0, t: BLOCK.PLANKS, d: 3 }];
    const light = pickBreaks(cells.map((c) => ({ ...c })), 1.0).map((c) => c.t);
    assert.deepEqual(light, [BLOCK.LEAVES], 'a weak blow: only the leaves');
    const heavy = pickBreaks(cells.map((c) => ({ ...c })), 99).map((c) => c.t);
    assert.deepEqual(heavy.sort(), [BLOCK.CS_GREY, BLOCK.LEAVES, BLOCK.PLANKS].sort(), 'a heavy blow: all that breaks, never the grass');
    assert.ok(blowOn(25, 1.25, 1).dmg > blowOn(8, 1.25, 1).dmg && blowOn(2, 1.25, 1).dmg === 0, 'creatures: the speed is the hurt');
    assert.equal(Object.keys(SMASH_TARGETS).length >= 7, true);
});

// ---- the wing in a small world
function world(blocks) {
    const map = new Map(blocks.map(([x, L, z, t]) => [x + ',' + L + ',' + z, t]));
    const key = (x, L, z) => x + ',' + L + ',' + z;
    const sent = [];
    const data = {
        get: (x, L, z) => map.get(key(x, L, z)) ?? BLOCK.AIR,
        set(x, L, z, t) { if (t === BLOCK.AIR) map.delete(key(x, L, z)); else map.set(key(x, L, z), t); },
        topLayer: () => 10,
        landMade: () => true,
    };
    return { map, data, sent, game: {
        authority: true, builder: { data, _sendEdits: (e, s) => sent.push(...e.map((x) => [...x, s])) }, world: { trees: [] }, fx: { shake: 0 },
        character: { group: { position: new THREE.Vector3(500, 0, 500) } },
    } };
}
function dragon(x, y, z) {
    const model = new THREE.Group(); model.position.set(x, y, z);
    const wings = [-1, 1].map((s) => { const g = new THREE.Group(); g.position.set(s * 1.5, 4, -1.6); model.add(g); return g; });
    const tail = [0, 1, 2, 3, 4].map((i) => { const g = new THREE.Group(); g.position.set(0, 3, 3 + i * 1.5); model.add(g); return g; });
    model.userData = { wings, tail, span: 10.5 };
    return { id: 'd1', model, size: 1, dead: false, imp: { by: 'me', mine: true } };
}
const fly = (S, d, dir, mps, secs) => { for (let t = 0; t < secs; t += DT) { d.model.position.x += dir * mps * DT; S.update(d, DT); } };

test('a wing sweeps a wall: a fast dragon breaks it (and the building is told to settle), a slow touch breaks nothing, the protected stays', () => {
    const wall = [];
    for (let x = 20; x <= 24; x++) for (let L = 3; L <= 9; L++) wall.push([x, L, 0, BLOCK.PLANKS]);
    for (let L = 3; L <= 9; L++) wall.push([26, L, 0, BLOCK.ENCHANTED]); // (enchanted stone beyond)
    const W = world(wall);
    const S = new DragonSmash(W.game);
    // slow: 2 m/s
    const slow = dragon(8, 0, 0);
    fly(S, slow, 1, 2, 1.0);
    assert.equal(W.sent.length, 0, 'a slow touch breaks nothing');
    // fast: 30 m/s through the planks
    const fast = dragon(5, 0, 0); fast.id = 'd2';
    fly(S, fast, 1, 30, 0.8);
    assert.ok(W.sent.length > 5, 'a fast dragon breaks the wall: ' + W.sent.length);
    assert.ok(W.sent.every((e) => e[3] === BLOCK.AIR && e[4] === true), 'taken away, building told to settle');
    assert.ok(W.sent.length <= SMASH.MAX_BLOCKS * 12, 'a piece at a time');
    for (let L = 3; L <= 9; L++) assert.equal(W.data.get(26, L, 0), BLOCK.ENCHANTED, 'the enchanted stone stays');
    const grass = world([[10, 0, 0, BLOCK.GRASS], [10, 1, 0, BLOCK.DIRT]]);
    const S2 = new DragonSmash(grass.game); const low = dragon(0, 0, 0); fly(S2, low, 1, 40, 0.6);
    assert.equal(grass.sent.length, 0, 'the land is not broken');
});

test('guests do not decide (the host does); a dead dragon breaks nothing', () => {
    const W = world([[6, 3, 0, BLOCK.PLANKS]]);
    W.game.authority = false;
    const S = new DragonSmash(W.game); const d = dragon(0, 0, 0);
    fly(S, d, 1, 30, 0.6);
    assert.equal(W.sent.length, 0, 'a guest: nothing');
    W.game.authority = true; d.dead = true; fly(S, d, 1, 30, 0.3);
    assert.equal(W.sent.length, 0, 'dead: nothing');
});
