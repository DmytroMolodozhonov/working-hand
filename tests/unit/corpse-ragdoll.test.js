import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { VillagerModel } from '../../src/entities/VillagerModel.js';
import { DeathSystem } from '../../src/game/Death.js';
import { Ragdoll } from '../../src/game/Ragdoll.js';

function world(authority = true) {
    let floor = 0;
    const scene = new THREE.Scene(), ch = new VoxelCharacter(scene, { remote: true });
    const g = { scene, authority, character: ch, localId: 'me', collision: { groundAt: () => floor }, castleLife: { byId: new Map() } };
    const death = g.death = new DeathSystem(g);
    return { g, death, ch, setFloor: y => { floor = y; }, close() { death.dispose(); ch.dispose(); } };
}
function frames(w, n = 600) { for (let i = 0; i < n; i++) w.death.update(1 / 60); }
function player(w, y = 15) {
    w.ch.group.position.set(2, y, -3);
    const b = { id: 'player', k: 'p', who: 'me', x: 2, y, z: -3, yaw: 0, age: 0 };
    w.death.addBody(b, w.ch.group); return b;
}

test('a player killed in midair falls as an articulated doll and leaves the living rig intact', () => {
    const w = world(), sourceKneeCount = w.ch.leftLegPivot.children.length;
    try {
        const b = player(w);
        assert.ok(b.doll);
        const initial = b.doll.doll.x[1];
        frames(w, 30);
        assert.ok(b.doll.doll.x[1] < initial - 1, 'immediate gravity');
        frames(w);
        assert.equal(b.doll.doll.asleep, true);
        assert.ok(b.y < 1 && b.doll.doll.lowest() >= -0.05);
        assert.equal(w.ch.leftLegPivot.children.length, sourceKneeCount);
        assert.deepEqual(w.ch.group.position.toArray(), [2, 15, -3]);
        assert.ok(b.corpseGeo.length > 0, 'copied legs and clothing have real knee joints');
    } finally { w.close(); }
});

for (const kind of ['p', 'v']) test(`a settled ${kind} corpse stays limp when lifted, dropped and deprived of support`, () => {
    const w = world(); let model;
    try {
        let b;
        if (kind === 'p') b = player(w, 2);
        else {
            model = new VillagerModel({ tool: 'none' }); w.g.scene.add(model.group); model.group.position.set(2, 1.95, -3);
            const v = { id: 'npc', dead: true, model, group: model.group };
            w.g.castleLife.byId.set(v.id, v);
            b = { id: 'npc-body', k: 'v', who: v.id, x: 2, y: 0, z: -3, yaw: 0 };
            w.death.addBody(b);
        }
        frames(w);
        w.death.liftBody(b);
        assert.ok(b.doll);
        const target = new THREE.Vector3(3, 9, -3);
        for (let i = 0; i < 180; i++) w.death.levitateBody(b, target, 1 / 60);
        const d = b.doll.doll, chest = d.at(11, []), feet = d.at(8, []);
        assert.ok(Math.abs(chest[1] - 9) < 0.1);
        assert.ok(chest[1] - feet[1] > 2, 'legs hang under the magic grip, not in a frozen floor pose');
        w.death.dropBody(b, new THREE.Vector3(1, 0, 0)); frames(w);
        assert.ok(d.asleep && b.y < 1, 'release resumes ragdoll contacts and gravity');
        w.setFloor(-8); frames(w);
        assert.ok(b.y < -6, 'sleeping corpse wakes when the floor is destroyed');
    } finally { w.close(); model?.dispose(); }
});

test('a late joiner restores the actual doll pose and follows another caster without simulating it twice', () => {
    const host = world(), guest = world(false);
    try {
        const b = player(host); frames(host, 20);
        guest.death.onNetBody(host.death._wire(b));
        const copy = guest.death.bodies.get(b.id);
        assert.ok(copy.doll);
        assert.ok(Math.max(...copy.doll.doll.x.map((v, i) => Math.abs(v - b.doll.doll.x[i]))) < 0.011);
        host.death.liftBody(b);
        for (let i = 0; i < 90; i++) host.death.levitateBody(b, new THREE.Vector3(0, 12, 0), 1 / 60);
        guest.death.onNetMove({ id: b.id, x: b.x, y: b.y, z: b.z, a: 1, cp: b.doll.pack() });
        const before = Array.from(copy.doll.doll.x); frames(guest, 30);
        assert.deepEqual(Array.from(copy.doll.doll.x), before, 'viewer must not add gravity to the caster-owned pose');
        assert.equal(copy.doll.apply([NaN]), false);
    } finally { host.close(); guest.close(); }
});

test('a long fall cannot hit the ragdoll time limit and freeze in open air', () => {
    const d = new Ragdoll(); d.stand(0, 2000, 0, 0, -1);
    const world = { boxes: () => [], floor: () => 0 };
    for (let i = 0; i < 600; i++) d.step(world, 1 / 60);
    assert.equal(d.asleep, false);
    assert.ok(d.x[1] < 1980);
    assert.ok(d.o[1] - d.x[1] > 0.01, 'still falling after the simulation time limit');
});
