import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Zombie } from '../../src/entities/Zombie.js';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';
import { animalModel } from '../../src/game/Animals.js';
import { FarShape } from '../../src/core/FarShape.js';
import { updateFarBatches, resetFarBatches, FAR_BATCH, farBatchStats } from '../../src/core/FarBatch.js';
import { CreatureImpact, CREATURE, kindOf, registerKind, KINDS } from '../../src/game/CreatureImpact.js';

/** A tiny world: one zombie, one villager, a cow and a pig, on flat ground; I am the host. */
function world({ host = true } = {}) {
    const scene = new THREE.Scene();
    const sent = [];
    const g = {
        scene, authority: host, localId: 'me', remotes: new Map(),
        fx: { spark() {} }, collision: { resolveCylinder() {} },
        zombies: [], zombieById: new Map(),
        sync: { creatureImpacts: (l) => sent.push(...l) },
        damageZombie: (z) => { if (z.isFrozen) z.shatter(); },
    };
    const z = new Zombie(scene, new THREE.Vector3(0, 0, 0), 7, {});
    z.group.position.y = 0.5;
    g.zombies.push(z); g.zombieById.set(7, z);
    const model = new VillagerModel(villagerLook(3, 'farmer'), {});
    scene.add(model.group);
    const v = { id: 'cs1_1:2', isVillager: true, role: 'farmer', model, group: model.group, x: 10, y: -0.5, z: 0, yaw: 0, dead: false, stunT: 0, vy: 0, mode: 'idle', speed: 0 };
    model.group.position.set(v.x, v.y + 1.95, v.z);
    const knight = { ...v, id: 'cs1_1:3', role: 'knight', model: new VillagerModel(villagerLook(4, 'knight'), {}) };
    knight.group = knight.model.group; scene.add(knight.group);
    g.castleLife = { byId: new Map([[v.id, v], [knight.id, knight]]), _walkable: () => true };
    const mk = (type, id, x, size) => {
        const m = animalModel(type); m.scale.setScalar(size); m.position.set(x, 0, 5); scene.add(m);
        return { id, type, group: m, model: m, isAnimal: true, dead: false, stunT: 0, vel: new THREE.Vector3() };
    };
    const cow = mk('cow', 101, 0, 2), pig = mk('pig', 102, 6, 1.45);
    g.animals = { list: [cow, pig], byId: new Map([[101, cow], [102, pig]]), push: (a, vel, stun) => { a.vel.add(vel); a.stunT = Math.max(a.stunT, stun); } };
    g.creatureImpact = new CreatureImpact(g);
    return { g, z, v, knight, cow, pig, sent, ci: g.creatureImpact };
}
const step = (ci, s, dt = 1 / 30) => { for (let t = 0; t < s - 1e-9; t += dt) ci.update(dt); };
const tilt = (o) => Math.max(Math.abs(o.rotation.x), Math.abs(o.rotation.z));

test('every creature kind is known: zombies, villagers, animals (players and book-birds are not creatures here)', () => {
    const { z, v, cow } = world();
    assert.equal(kindOf(z), 'z');
    assert.equal(kindOf(v), 'v');
    assert.equal(kindOf(cow), 'a');
    assert.equal(kindOf({ isPlayer: true, group: {} }), null);
    assert.equal(kindOf({ isBird: true }), null);
});

test('a zombie pushed hard falls on its back, lies, and gets up by itself; everybody is told', () => {
    const { z, ci, sent } = world();
    // the zombie looks along +Z (towards me at +Z): pushed from its front
    const res = ci.apply(z, { v: new THREE.Vector3(0, 0, -14), kind: 'shove' });
    assert.equal(res, 'knockdown');
    assert.equal(ci.stateOf(z), 'falling');
    assert.ok(z.stunTimer > 1.5, 'its own mind is paused while it lies');
    step(ci, 0.6);
    assert.equal(ci.stateOf(z), 'down');
    const piv = z.group.userData.impPivot;
    // (> 1.2, was 1.4: a living body keeps some tone and does not lie perfectly flat — the author 05.11, Ragdoll.tone)
    assert.ok(piv && Math.abs(piv.rotation.x) > 1.2, `lying: ${piv?.rotation.x}`);
    assert.ok(piv.rotation.x < 0, 'on its back (its back is −Z)');
    assert.ok(z.group.position.z < -1, 'slid back along the push');
    assert.ok(sent.some((e) => e[0] === 'z' && e[1] === 7 && e[2] === 'k'), 'the guests are told it fell');
    // it lies 5 s at least and 1…5 s more by chance (the author)
    let lay = 0.6;
    while (ci.stateOf(z) === 'down' && lay < 30) { ci.update(1 / 30); lay += 1 / 30; }
    assert.equal(ci.stateOf(z), 'rising');
    assert.ok(lay >= CREATURE.MIN_DOWN + CREATURE.EXTRA_DOWN[0] && lay <= CREATURE.MIN_DOWN + CREATURE.EXTRA_DOWN[1] + 1.2, `lay ${lay}`);
    assert.ok(sent.some((e) => e[2] === 'r'));
    step(ci, CREATURE.RISE_T + 0.1);
    assert.equal(ci.stateOf(z), 'up');
    assert.equal(piv.rotation.x, 0, 'upright again');
    assert.ok(z.head.visible && z.leftArm.parent.parent === piv, 'its parts stay in the model');
});

test('a gentle push: a stagger (steps back, leans, arms flail), never a fall', () => {
    const { z, ci } = world();
    assert.equal(ci.apply(z, { v: new THREE.Vector3(0, 0, -6), kind: 'push' }), 'stagger');
    let lean = 0, flail = 0;
    for (let i = 0; i < 12; i++) { ci.update(1 / 30); lean = Math.max(lean, tilt(z.group.userData.impPivot)); flail = Math.max(flail, Math.abs(z.rightArm.rotation.z)); }
    assert.ok(lean > 0.1 && lean < 0.5, `lean ${lean}`);
    assert.ok(flail > 0.2, 'the arms flail');
    step(ci, 1);
    assert.equal(ci.stateOf(z), 'up');
    assert.equal(z.rightArm.rotation.z, 0, 'the arms are given back');
    assert.equal(ci.apply(z, { v: new THREE.Vector3(0, 0, -1) }), 'none', 'a touch does nothing');
});

test('a villager falls the way it was pushed, using its own feet pivot; a knight in armour only reels', () => {
    const { g, v, knight, ci } = world();
    // (far from the hero — beyond RAG.NEAR — the old tilt over the feet; near, the rag doll lays him: solid-guard-impact.test.js)
    g.character = { group: { position: new THREE.Vector3(500, 0, 500) } };
    // a villager looks along −Z at yaw 0: pushed towards +Z from the front → on its back
    assert.equal(ci.apply(v, { v: new THREE.Vector3(0, 0, 13) }), 'knockdown');
    step(ci, 0.6);
    assert.ok(v.model.root.rotation.x > 1.4, 'on its back (its head towards +Z)');
    assert.ok(v.z > 0.5, 'slid back');
    assert.ok(v.stunT > 0);
    assert.equal(ci.apply(knight, { v: new THREE.Vector3(0, 0, 13) }), 'stagger');
    step(ci, CREATURE.MIN_DOWN + CREATURE.EXTRA_DOWN[1] + CREATURE.RISE_T + 1);
    assert.equal(v.model.root.rotation.x, 0);
    assert.ok(Math.abs(v.model.root.position.y + 1.95) < 1e-6, 'back at its feet');
});

test('a head punch snaps a creature\'s head back', () => {
    const { z, ci } = world();
    z.group.updateMatrixWorld(true);
    // a fist into the zombie's face (its face is +Z): along −Z
    ci.apply(z, { v: new THREE.Vector3(0, 0, -1.7), kind: 'punch', head: { lp: [0, 0.1, 0.6], dir: [0, 0, -1], speed: 7 } });
    let peak = 0;
    for (let i = 0; i < 12; i++) { ci.update(1 / 60); peak = Math.max(peak, -z.head.rotation.x); }
    assert.ok(peak > 0.1, `the face goes up: ${peak}`);
    step(ci, 1.5);
    assert.ok(Math.abs(z.head.rotation.x) < 0.02);
});

test('animals are heavy and four-legged: a cow shrugs off what throws a pig; they fall on a side', () => {
    const { cow, pig, ci } = world();
    assert.equal(ci.apply(cow, { v: new THREE.Vector3(0, 0, 16) }), 'stagger');
    assert.equal(ci.apply(pig, { v: new THREE.Vector3(3, 0, 20) }), 'knockdown');
    step(ci, 0.6);
    const piv = pig.group.userData.impPivot;
    assert.ok(Math.abs(piv.rotation.z) > 1.4 && Math.abs(piv.rotation.x) < 1e-6, 'on its side');
    assert.equal(ci.apply(pig, { v: new THREE.Vector3(0, 0, 13), always: { down: 1.5 } }), 'knockdown', '(still lying: longer)');
    step(ci, CREATURE.MIN_DOWN + CREATURE.EXTRA_DOWN[1] + CREATURE.RISE_T + 1.5);
    assert.equal(ci.stateOf(pig), 'up');
});

test('a frozen zombie pushed over shatters', () => {
    const { z, ci } = world();
    z.freezeProgress = 1; z.freeze();
    assert.equal(ci.apply(z, { v: new THREE.Vector3(0, 0, -4) }), 'shatter');
    assert.equal(z.isDead, true);
});

test('guests draw what the host says: the fall, the lying, the rise', () => {
    const host = world();
    host.ci.apply(host.z, { v: new THREE.Vector3(0, 0, -14) });
    host.ci.update(1 / 30);
    const guest = world({ host: false });
    assert.equal(guest.ci.apply(guest.z, { v: new THREE.Vector3(0, 0, -14) }), 'none', 'a guest never decides');
    guest.ci.onNet(host.sent.slice());
    step(guest.ci, 0.6);
    assert.ok(Math.abs(guest.z.group.userData.impPivot.rotation.x) > 1.2, 'the guest sees it lying'); // (a living body keeps some tone — Ragdoll.tone)
    step(guest.ci, 3);
    assert.equal(guest.ci.stateOf(guest.z), 'down', 'until the host says it rose');
    guest.ci.onNet([['z', 7, 'r']]);
    step(guest.ci, 1);
    assert.equal(guest.ci.stateOf(guest.z), 'up');
});

test('another module\'s creatures can join (wizards, living trees…)', () => {
    const { g, ci } = world();
    const grp = new THREE.Group(); grp.add(new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1))); g.scene.add(grp);
    const tree = { id: 1, ck: 'X', group: grp, alive: true };
    registerKind('X', { ...KINDS.z, name: 'tree', list: () => [tree], get: () => tree, alive: (c) => c.alive, body: () => 'tree', head: () => null, arms: () => [], legs: () => [], pivot: (c) => ({ obj: null, base: 0 }), hold() {}, move() {}, frozen: () => false });
    assert.equal(kindOf(tree), 'X');
    assert.equal(ci.apply(tree, { v: new THREE.Vector3(0, 0, 20) }), 'stagger', 'a tree is heavy');
    delete KINDS.X;
});

test('a knight knocked up a slope climbs it with the ground, and does not sink into the hill', () => {
    const { g, knight, ci } = world();
    const h = (x) => Math.max(0, Math.floor(x * 0.8)); // ~40° hill rising along +x
    const cl = g.castleLife;
    cl._walkable = (x, z, y) => h(Math.round(x)) - y <= 1.2;
    cl._ground = (v) => { v.y = h(Math.round(v.x)); };
    knight.x = 0; knight.y = 0; knight.z = 0;
    ci.apply(knight, { v: new THREE.Vector3(14, 0, 0), kind: 'shove' });
    for (let i = 0; i < 90; i++) {
        ci.update(1 / 30);
        cl._ground(knight); // (CastleLife.tick while stunned)
        assert.ok(knight.y >= h(Math.round(knight.x)) - 1e-6, 'never below the ground');
    }
    assert.ok(knight.x > 0.5, 'was pushed up the hill');
});

test('a horse hit by Expelliarmus keeps its FarShape on the root and never blinks in FarBatch', () => {
    resetFarBatches();
    const { g, ci } = world();
    const renderer = { capabilities: { floatVertexTextures: true } };
    const m = animalModel('horse');
    m.scale.setScalar(2.3);
    m.position.set(4, 0, 5);
    g.scene.add(m);
    const horse = { id: 103, type: 'horse', group: m, model: m, isAnimal: true, dead: false, stunT: 0, vel: new THREE.Vector3() };
    g.animals.list.push(horse);
    g.animals.byId.set(103, horse);
    horse.far = new FarShape(m);
    m.userData.farRadius = 3.5 * 2.3;
    horse.far.set(true);
    g.scene.updateMatrixWorld(true);
    for (let t = 0; t < FAR_BATCH.STABLE + 0.3; t += 0.1) updateFarBatches(g.scene, renderer, 0.1);
    assert.ok(horse.far._slots, 'batched before the spell');
    const parentLeaves0 = farBatchStats.why.parent || 0;
    ci.spellHit(horse, 'Expelliarmus', new THREE.Vector3(4, 0, 0), 'me');
    for (let i = 0; i < 30; i++) {
        ci.update(0.1);
        g.scene.updateMatrixWorld(true);
        updateFarBatches(g.scene, renderer, 0.1);
        assert.ok(horse.far.meshes.every((mesh) => mesh.parent === m), 'FarShape meshes stay on the model root');
        assert.ok(horse.far.meshes.every((mesh) => mesh.visible || mesh.userData.batched), 'horse is always drawn (either by its FarShape or by FarBatch)');
    }
    assert.equal(farBatchStats.why.parent || 0, parentLeaves0, 'never kicked out of FarBatch because of parent');
    resetFarBatches();
});

test('«Левиоса» holds a body as a rag doll right where the magic holds it — no sagging under the hand, no spinning (the author 05.11)', () => {
    const { v, ci } = world();
    const doll = ci.levDoll('v', v);
    assert.ok(doll, 'a villager hangs as a doll');
    const at = new THREE.Vector3(10, 6, 0);
    for (let i = 0; i < 90; i++) ci.levDollStep('v', v, at, 1 / 30);
    const ch = doll.at(11), sl = doll.at(1), sr = doll.at(2), pv = doll.at(12);
    assert.ok(Math.hypot(ch[0] - at.x, ch[1] - at.y, ch[2] - at.z) < 0.15, `the chest is held at the point: ${ch.map((n) => n.toFixed(2))}`);
    assert.ok(pv[1] < ch[1] - 0.8, 'the body hangs below the chest');
    // carried along: the chest follows, the body does not lag metres behind nor turn round and round
    const yaw0 = Math.atan2(sr[2] - sl[2], sr[0] - sl[0]);
    for (let i = 0; i < 60; i++) { at.x += 0.1; ci.levDollStep('v', v, at, 1 / 30); }
    const c2 = doll.at(11), l2 = doll.at(1), r2 = doll.at(2);
    assert.ok(Math.hypot(c2[0] - at.x, c2[1] - at.y) < 0.6, 'it follows the hand');
    const yaw1 = Math.atan2(r2[2] - l2[2], r2[0] - l2[0]);
    assert.ok(Math.abs(yaw1 - yaw0) < 0.05, 'the grip does not spin it');
});
