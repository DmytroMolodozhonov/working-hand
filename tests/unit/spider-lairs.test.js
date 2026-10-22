/**
 * The giant spider lives in her own lairs (three times rarer than castles) and never attacks first:
 * only after someone has hit her.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { spiderLairOf, spiderLairsNear, SPIDER_LAIR } from '../../src/world/SpiderLairs.js';
import { Spiders } from '../../src/game/Spider.js';
import '../../src/world/Terrain.js'; // (first: Castles.js and Terrain.js import each other)
import { CASTLE_CELL, CASTLE_CHANCE } from '../../src/world/Castles.js';

test('lairs: deterministic from the seed, three times rarer than castles, never where it is blocked', () => {
    assert.equal(SPIDER_LAIR.CELL, CASTLE_CELL);
    assert.ok(Math.abs(SPIDER_LAIR.CHANCE * 3 - CASTLE_CHANCE) < 1e-9);
    const free = () => false;
    let n = 0, cells = 0;
    for (let gx = -30; gx < 30; gx++) for (let gz = -30; gz < 30; gz++) {
        if (Math.hypot((gx + 0.5) * CASTLE_CELL, (gz + 0.5) * CASTLE_CELL) < 1000) continue; // (away from the spawn)
        cells++;
        const L = spiderLairOf(gx, gz, 1234, free);
        assert.deepEqual(L, spiderLairOf(gx, gz, 1234, free), 'the same seed — the same lair');
        if (L) { n++; assert.ok(L.x >= gx * CASTLE_CELL && L.x < (gx + 1) * CASTLE_CELL); }
    }
    const castles = cells * CASTLE_CHANCE;
    assert.ok(Math.abs(n / castles - 1 / 3) < 0.05, `${n} lairs vs ~${castles.toFixed(0)} castles`);
    // water / a castle everywhere: no lair
    for (let gx = 3; gx < 20; gx++) assert.equal(spiderLairOf(gx, 5, 1234, () => true), null);
    // another seed: other places
    let same = 0;
    for (let gx = 3; gx < 40; gx++) { const a = spiderLairOf(gx, 7, 1, free), b = spiderLairOf(gx, 7, 2, free); if (a && b && a.x === b.x) same++; }
    assert.ok(same < 3);
    // near: a cached lookup
    const L = spiderLairsNear(5000, 5000, 3000, (gx, gz) => spiderLairOf(gx, gz, 1234, free));
    assert.ok(L.length > 0 && L.every((l) => Math.hypot(l.x - 5000, l.z - 5000) <= 3000));
});

function fakeGame() {
    const me = { group: { position: new THREE.Vector3(0, 0, 0) } };
    return {
        config: { mode: 'freeworld' }, authority: true, isNight: true, localId: 'me', remotes: new Map(),
        scene: new THREE.Scene(), collision: { groundY: () => 0 },
        character: me, combat: { enabled: true, damage() {}, shieldFactor: () => 0, center: (o) => o.set(0, 1, 0) },
        fx: { spark() {} }, hud: { notify() {}, setVoice() {} }, items: { spawnLoose() {} }, knockback: { add() {} },
        damageLocalPlayer() {},
    };
}

test('she never attacks first: a player right beside her is safe until she is hit', () => {
    const g = fakeGame();
    const S = new Spiders(g);
    const s = S.spawn(new THREE.Vector3(0, 0, -8));
    s.model.rotation.y = Math.PI; // (facing the player)
    s.nextPoison = s.nextWeb = s.nextGrab = s.nextAny = 0;
    let shots = 0;
    S._shoot = () => { shots++; };
    S._seized = () => {};
    const rnd = Math.random; Math.random = () => 0;
    for (let i = 0; i < 50; i++) S._think(s, 0.1);
    assert.equal(shots, 0, 'no poison, no web');
    assert.equal(s.holding, null, 'no grab');
    assert.equal(s.target, null);
    assert.ok(Math.hypot(s.model.position.x - s.home.x, s.model.position.z - s.home.z) < 15, 'stays round her lair');
    // struck: she fights
    S.hit(s, 4, 'arrow');
    assert.equal(s.angry, true);
    s.model.position.set(0, 0, -8); s.model.rotation.y = Math.PI;
    s.nextGrab = 999; s.nextPoison = 999; s.nextWeb = 0; s.nextAny = 0;
    S._think(s, 0.1);
    Math.random = rnd;
    assert.equal(s.target, 'me');
    assert.equal(shots, 1, 'the web flies once she has been attacked');
});

test('even a spell that cannot hurt her (wind) makes her fight; killed, her lair stays empty (saved)', () => {
    const S = new Spiders(fakeGame());
    const s = S.spawn(new THREE.Vector3(0, 0, 0));
    s.lair = '4,5';
    S.hit(s, 10, 'Wind');
    assert.equal(s.angry, true);
    assert.equal(s.hp, 200);
    S.hit(s, 500, 'arrow');
    assert.deepEqual(S.snapshot(), ['4,5']);
    const T = new Spiders(fakeGame());
    T.restore(S.snapshot());
    assert.ok(T.slain.has('4,5'));
});

test('she never spits through rock: no tricks at one she cannot see, and her poison stops at a wall', () => {
    const g = fakeGame();
    g.collision.lineOfSight = () => false; // (the player is in a cave under her)
    const S = new Spiders(g);
    const s = S.spawn(new THREE.Vector3(0, 0, -8));
    s.angry = true;
    s.model.rotation.y = Math.PI;
    s.nextPoison = s.nextWeb = s.nextGrab = s.nextAny = 0;
    let shots = 0;
    S._shoot = () => { shots++; };
    S._seized = () => {};
    for (let i = 0; i < 30; i++) S._think(s, 0.1);
    assert.equal(shots, 0);
    assert.equal(s.holding, null);
    g.collision.lineOfSight = () => true;
    s.model.position.set(0, 0, -8); s.model.rotation.y = Math.PI; s.seeT = 0;
    s.nextGrab = 999; s.nextAny = 0;
    S._think(s, 0.1);
    assert.ok(shots >= 1, 'seen: she spits');
    // a poison ball flying at the player: rock in the way — it splashes there
    const T = new Spiders(g);
    g.collision.pointBlocked = () => true;
    T._fire('poison', new THREE.Vector3(0, 5, -20), 'me');
    T._updateShots(0.1);
    assert.equal(T.shots.length, 0);
});
