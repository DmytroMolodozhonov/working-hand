import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FarShape } from '../../src/core/FarShape.js';
import { DeathSystem } from '../../src/game/Death.js';
import { startRespawn } from '../../src/game/RespawnSpot.js';
import { NetSync } from '../../src/net/NetSync.js';
import { applyPlayerSnapshot } from '../../src/game/WorldSave.js';

for (const hide of ['layers', 'visible']) test(`an optimized avatar leaves a visible independent corpse (${hide})`, () => {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 0.5), new THREE.MeshLambertMaterial()));
    const one = new FarShape(source, { hide, batch: false }); one.set(true);
    const data = source.userData, mask = source.children[0].layers.mask;
    const scene = new THREE.Scene(), death = new DeathSystem({ scene });
    const b = { id: 'body', k: 'p', x: 2, y: 0, z: 3, lg: { owner: 'me', hp: 5 } };
    try {
        death.addBody(b, source);
        assert.ok(b.model && b.model.parent === scene);
        assert.ok(b.one.meshes.length > 0 && b.one.meshes.some(m => m.visible && m.layers.mask === 1));
        assert.equal(source.userData, data);
        assert.equal(source.userData.farShape, one, 'live optimization survives the copy');
        assert.equal(source.children[0].layers.mask, mask);
        source.position.set(100, 200, 300);
        assert.deepEqual(b.model.position.toArray(), [2, 0, 3]);
    } finally { death.dispose(); one.dispose(); }
});

test('ordinary respawn cannot randomly choose the death position again near the start', () => {
    for (const death of [{ x: 6, z: 0 }, { x: 0, z: 0 }, { x: -20, z: 0 }, { x: 200, z: 200 }]) {
        const p = startRespawn(death, () => 0);
        assert.ok(Math.hypot(p.x - death.x, p.z - death.z) >= 12);
        assert.ok(Math.hypot(p.x, p.z) <= 20.00001);
    }
});

test('rejoining on the death screen does not restore the corpse position as a living player', () => {
    for (const active of [false, true]) {
        let respawns = 0;
        const g = { config: { mode: 'freeworld' }, active, character: { group: new THREE.Group() }, respawn() { respawns++; }, maxHP: 20, playerHP: 20 };
        applyPlayerSnapshot(g, { hp: 0, pos: [100, 2, 100] }); // old saves have no explicit dead flag
        assert.deepEqual(g.character.group.position.toArray(), [0, 0, 0]);
        assert.equal(respawns, active ? 1 : 0);
        if (!active) assert.equal(g._respawnAfterRestore, true);
    }
});

test('respawn carries the new position immediately, before a delayed pose can arrive', () => {
    const sent = [], sync = Object.create(NetSync.prototype);
    sync.game = { character: { group: new THREE.Group() } };
    sync.game.character.group.position.set(11, 4, -9);
    sync.net = { localId: 'guest', send: m => sent.push(m) };
    sync.respawned();
    assert.deepEqual(sent[0].p, [11, 4, -9]);
    const r = { position: new THREE.Vector3(100, 5, 100), character: { group: new THREE.Group() }, target: { s: { p: [100, 5, 100] } },
        vel: new THREE.Vector3(1, 0, 1), _ppOk: true, ship: 'ship', setDead(dead) { this.dead = dead; }, dead: true };
    sync.game = { active: true, remotes: new Map([['guest', r]]), hud: {} };
    sync._onMessage({ ...sent[0], by: 'guest' });
    assert.deepEqual(r.position.toArray(), [11, 4, -9]);
    assert.equal(r.target, null); assert.equal(r.dead, false); assert.equal(r.ship, null);
});

test('Give Me My Power accepts the head, feet and approximate pointing, but still selects only your own legacy', () => {
    const d = new DeathSystem({ net: { pid: 'mine' } });
    const b = { id: 'mine', x: 0, y: 0, z: -7, len: 3, yaw: Math.PI / 2, lg: { owner: 'mine' } };
    d.bodies.set('mine', b);
    d.bodies.set('other', { ...b, x: 1, lg: { owner: 'other' } });
    const o = new THREE.Vector3(0, 3, 0);
    for (const target of [new THREE.Vector3(1.5, 0.4, -7), new THREE.Vector3(-1.5, 0.4, -7), new THREE.Vector3(3, 0.4, -7)]) {
        assert.equal(d.legacyAimed(o, target.sub(o).normalize()), b);
    }
    assert.equal(d.legacyAimed(o, new THREE.Vector3(0, 0, 1)), null);
    assert.equal(d.legacyAimed(new THREE.Vector3(0, 3, 50), new THREE.Vector3(0, 0, -1)), null);
    delete b.lg;
    assert.equal(d.legacyAimed(o, new THREE.Vector3(0, -0.3, -1).normalize()), null);
});
