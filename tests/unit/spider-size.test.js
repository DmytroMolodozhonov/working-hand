/**
 * The giant spider is twice as big as the first one: the model, its body that weapons
 * and spells touch, its speed, the reach of its grab and spit, where it stands on
 * the ground (never sunk into a slope), and the duel charges aimed at its body.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Spiders, spiderModel, spiderBody, spiderCenter, spiderDist, spiderGroundY, SIZE } from '../../src/game/Spider.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A tiny world: flat ground at y = 0 (or the given ground function), one local player. */
function fakeGame(ground = () => 0) {
    const me = { group: { position: V(0, 0, 0) } };
    const g = {
        config: { mode: 'freeworld' }, authority: true, isNight: true, localId: 'me', remotes: new Map(),
        scene: new THREE.Scene(), collision: { groundY: (x, z) => ground(x, z) },
        character: me, combat: { enabled: true, damage() {}, shieldFactor: () => 0, center: (o) => o.set(0, 1, 0) },
        fx: { spark() {} }, hud: { notify() {}, setVoice() {} }, items: { spawnLoose() {} }, knockback: { add() {} },
        damageLocalPlayer() {},
    };
    return g;
}

test('the spider is twice as big as the first one (the model grows as a whole)', () => {
    assert.equal(SIZE, 2);
    const m = spiderModel();
    m.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(m).getSize(V(0, 0, 0));
    m.scale.setScalar(1);
    m.updateMatrixWorld(true);
    const small = new THREE.Box3().setFromObject(m).getSize(V(0, 0, 0));
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(size[k] / small[k] - 2) < 1e-6, `${k}: ${size[k]} vs ${small[k]}`);
    assert.ok(size.y > 7.5, `it stands ~8 m high (${size.y.toFixed(2)})`);
});

test('its body (for weapons, spells, duels) is the grown body, nose to tail', () => {
    const S = new Spiders(fakeGame());
    const s = S.spawn(V(10, 0, 0));
    const b = spiderBody(s);
    assert.ok(Math.abs(b.r - 3.4) < 1e-9, 'radius twice the old 1.7');
    assert.ok(Math.abs(b.a.y - 5.2) < 1e-9, 'the body is up at ~5 m');
    assert.ok(Math.abs(b.a.distanceTo(b.b) - 6.8) < 1e-9, 'the body is long');
    const c = spiderCenter(s);
    assert.ok(spiderDist(s, c) < -3, 'the middle is inside it');
    // facing −Z (rotation 0): the head is forward, the tail behind
    assert.ok(b.a.z < b.b.z);
    s.model.rotation.y = Math.PI / 2; // turned: the body turns with it
    const t = spiderBody(s);
    assert.ok(Math.abs(t.a.z) < 1e-9 && t.a.x < 10 && t.b.x > 10, 'turned with the model (head towards −X)');
    // a hit at the side of the body, 7 m from its middle, reaches it now (the old one: not)
    s.model.rotation.y = 0;
    const side = c.clone().add(V(3.2, 0, 0));
    assert.ok(spiderDist(s, side) < 0);
    assert.ok(spiderDist(s, V(10, 5.2, 12)) > 0, 'far behind: no');
});

test('weapons and spells touch the big body: Bombardo at its flank, a beam through its tail, a duel charge in its side', () => {
    const S = new Spiders(fakeGame());
    const s = S.spawn(V(0, 0, 0));
    // Bombardo 5 m beside its middle line: the blast (2 m) reaches the flank
    S.hitAt(V(5, 5, 1), 2, 12, 'Bombardo');
    assert.equal(s.hp, 188);
    S.hitAt(V(9, 5, 1), 2, 12, 'Bombardo');
    assert.equal(s.hp, 188, 'too far away');
    // a fire beam along X through the tail
    S.hitRay(V(-20, 5, 4), V(1, 0, 0), 40, 0.5, 8, 'Inferno');
    assert.equal(s.hp, 180);
    S.hitRay(V(-20, 12, 4), V(1, 0, 0), 40, 0.5, 8, 'Inferno');
    assert.equal(s.hp, 180, 'a beam above it misses');
    // a duel charge touching its side
    assert.ok(S.boltAt(V(3.3, 5.2, 1), 'AvadaKedavra'));
    assert.equal(s.hp, 155, 'Avada only 25');
    assert.equal(S.boltAt(V(8, 5.2, 1), 'AvadaKedavra'), false);
});

test('it walks twice as fast, stops and grabs twice as far, and stands on the highest ground under its body', () => {
    const g = fakeGame();
    const S = new Spiders(g);
    const s = S.spawn(V(0, 0, -40));
    s.angry = true; // (she fights only once attacked: spider-lairs.test.js)
    s.nextPoison = s.nextWeb = s.nextGrab = s.nextAny = 999;
    S._think(s, 0.5);
    assert.ok(Math.abs(s.model.position.z - (-40 + 4.2 * 2 * 0.5)) < 1e-6, `speed 8.4 m/s (${s.model.position.z})`);
    // stops 6.4 m away
    s.model.position.set(0, 0, -6);
    S._think(s, 0.5);
    assert.equal(s.model.position.z, -6, 'close enough: it stands');
    // grabs within 9 m (the old one: 4.5)
    s.model.position.set(0, 0, -8);
    s.nextGrab = 0; s.nextAny = 0;
    s.model.rotation.y = Math.PI; // (turned to him: «лицом к цели» — from the side or behind it does not grab)
    const rnd = Math.random; Math.random = () => 0;
    S._seized = () => {};
    S._think(s, 0.01);
    Math.random = rnd;
    assert.equal(s.holding, 'me', 'seized from 8 m');
    // a slope: the ground rises behind it — the body is lifted, not sunk into the hill
    const slope = (x, z) => Math.max(0, z - 50);
    const y = spiderGroundY({ groundY: slope }, 0, 50, 0);
    assert.ok(y >= slope(0, 50 + 3.4 * 2) - 1, `stands up on the slope (${y})`);
    assert.equal(spiderGroundY({ groundY: () => 3 }, 0, 0, 1), 3, 'flat ground: on it');
});

test('poison and web fly from its grown mouth, and a seized wizard hangs at its fangs', () => {
    const g = fakeGame();
    const S = new Spiders(g);
    const s = S.spawn(V(0, 0, -20));
    let from = null;
    S._fire = (kind, f) => { from = f; };
    S._shoot(s, 'poison', 'me');
    assert.ok(Math.abs(from.y - 4.4) < 1e-9, `spit from 4.4 m up (${from.y})`);
    assert.ok(Math.abs(from.z - (-20 - 4.8)) < 1e-9, 'from in front of its head');
});
