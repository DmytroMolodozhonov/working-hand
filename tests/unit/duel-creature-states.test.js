/**
 * A living creature stays a target in every state: standing, thrown by «Джолт» and still in the air,
 * knocked down and lying, stunned. A charge cast at where it is SEEN hits it (a lying body is a
 * capsule along the body, not a standing post), and «Авада» (or anything else) works on it again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Zombie } from '../../src/entities/Zombie.js';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';
import { animalModel } from '../../src/game/Animals.js';
import { CreatureImpact } from '../../src/game/CreatureImpact.js';
import { Duel, pickBody } from '../../src/game/Duel.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function world() {
    const scene = new THREE.Scene();
    const calls = [];
    const g = {
        scene, authority: true, localId: 'me', remotes: new Map(), zombies: [], zombieById: new Map(),
        fx: { spark() {}, lightFlash() {} }, hud: {}, collision: { resolveCylinder() {} },
        character: { group: new THREE.Group() },
        damageZombie: (z, dmg, f, d, by) => calls.push(['z', 'hit', dmg, by]),
    };
    const z = new Zombie(scene, V(0, 0, 0), 7, {});
    z.group.position.set(0, 0.5, -12);
    g.zombies.push(z); g.zombieById.set(7, z);
    const mkV = (id, role, x) => {
        const model = new VillagerModel(villagerLook(3, role), {});
        scene.add(model.group);
        const v = { id, isVillager: true, role, model, group: model.group, x, y: -0.5, z: -12, yaw: 0, dead: false, stunT: 0, vy: 0, mode: 'idle', speed: 0, hp: 20 };
        model.group.position.set(v.x, v.y + 1.95, v.z);
        return v;
    };
    const farmer = mkV('v1', 'farmer', 8), knight = mkV('v2', 'knight', -8);
    g.castleLife = {
        byId: new Map([[farmer.id, farmer], [knight.id, knight]]), _walkable: () => true, _airFree: () => true,
        targets: (reach = 40) => [...g.castleLife.byId.values()].filter((v) => !v.dead && Math.abs(v.x) < reach && Math.abs(v.z) < reach), // (as CastleLife.targets: near the hero)
        hit: (v, dmg, dir, by, o) => { calls.push(['v', 'hit', v.id, dmg, o]); }, startle() {}, wardOff: () => false, _say() {},
    };
    const m = animalModel('cow'); m.scale.setScalar(2); m.position.set(16, 0, -12); scene.add(m);
    const cow = { id: 101, type: 'cow', group: m, model: m, isAnimal: true, dead: false, stunT: 0, vel: new THREE.Vector3() };
    g.animals = { list: [cow], byId: new Map([[101, cow]]), targets: () => [cow], push: (a, vel, stun) => { a.vel.add(vel); a.stunT = Math.max(a.stunT, stun); }, hit: (a, dmg, d, by) => calls.push(['a', 'hit', a.id, dmg]) };
    g.creatureImpact = new CreatureImpact(g);
    const d = new Duel(g);
    d._burst = () => {}; d._hitBurst = () => {};
    return { g, d, z, farmer, knight, cow, ci: g.creatureImpact, calls };
}
const step = (ci, s, dt = 1 / 30) => { for (let t = 0; t < s - 1e-9; t += dt) ci.update(dt); };
/** The creature as it is SEEN: its model's box → the long axis' two ends and the middle. */
function seen(obj) {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const ax = size.y >= Math.max(size.x, size.z) ? 'y' : size.x >= size.z ? 'x' : 'z';
    const lo = c.clone(), hi = c.clone();
    lo[ax] = box.min[ax] + size[ax] * 0.2; hi[ax] = box.max[ax] - size[ax] * 0.2;
    return [lo, c, hi];
}
/** A charge cast from where I stand at point `p`: does the line pick body `kind:id`? */
function aimedHit(d, p, kind, id) {
    const o = V(0, 0, 0), dir = p.clone().sub(o).normalize();
    const hit = pickBody(o, dir, d._bodies(d.me), 60);
    return hit?.body.kind === kind && hit.body.id === id && hit.miss < 0.02;
}
const KIND = (w) => [['v', w.farmer, w.farmer.id, w.farmer.group], ['v', w.knight, w.knight.id, w.knight.group], ['z', w.z, 7, w.z.group], ['a', w.cow, 101, w.cow.group]];

test('standing: every creature is hit where it is seen', () => {
    const w = world();
    for (const [k, c, id, obj] of KIND(w)) for (const p of seen(obj)) assert.ok(aimedHit(w.d, p, k, id), `${k} ${id} standing`);
});

test('knocked down and lying (stunned): a charge at the lying body hits it, head end and feet end', () => {
    const w = world();
    for (const [k, c, id, obj] of KIND(w)) {
        w.ci.apply(c, { v: V(0, 0, 14), kind: 'shove', always: { down: 8 }, down: 8 });
        step(w.ci, 1);
        assert.equal(w.ci.stateOf(c), 'down', `${k} ${id} lies`);
        // (an animal is a ball round its middle, on its side as on its feet: its middle; the others' whole length)
        for (const p of k === 'a' ? [seen(obj)[1]] : seen(obj)) assert.ok(aimedHit(w.d, p, k, id), `${k} ${id} lying, at ${p.toArray().map((n) => n.toFixed(1))}`);
    }
});

test('thrown by «Джолт» and still in the air: hit where it is seen; far (over 40 m) and a second «Авада» too', () => {
    const w = world();
    for (const c of [w.farmer, w.z]) {
        w.ci.spellHit(c, 'Jolt', V(0, 0, 0), 'me');
        step(w.ci, 0.2);
        if (c === w.farmer) { c.y += 6; c.group.position.y += 6; } else c.group.position.y += 6;
        const k = c === w.farmer ? 'v' : 'z';
        for (const p of seen(c.group)) assert.ok(aimedHit(w.d, p, k, c.id ?? 7), `${k} in the air`);
    }
    // 45 m away (the «Дай» reach is 50): still a target
    w.farmer.x = 0; w.farmer.z = -45; w.farmer.group.position.set(0, 1.45, -45); w.farmer.group.userData = w.farmer.group.userData;
    assert.ok(w.d._bodies(w.d.me).some((b) => b.kind === 'v' && b.id === 'v1'));
});

test('«Авада» works on a creature in every state, again and again (no immunity after a push)', () => {
    const w = world();
    const states = {
        standing: () => {},
        thrown: (c) => w.ci.spellHit(c, 'Jolt', V(0, 0, 0), 'me'),
        lying: (c) => { w.ci.apply(c, { v: V(0, 0, 14), kind: 'shove', always: { down: 8 }, down: 8 }); step(w.ci, 1); },
        stunned: (c) => { w.ci.spellHit(c, 'Stupefy', V(0, 0, 0), 'me', null, { down: 8 }); c.stunT = 8; step(w.ci, 1); },
    };
    for (const [name, put] of Object.entries(states)) {
        for (const [k, c, id] of KIND(w)) {
            put(c);
            w.calls.length = 0;
            w.d.applyToCreature && k !== 'z' ? w.d.applyToCreature('AvadaKedavra', c, 'me', V(0, 0, 0)) : w.d.applyToZombie('AvadaKedavra', c, 'me', V(0, 0, 0));
            w.d.applyToCreature && k !== 'z' ? w.d.applyToCreature('AvadaKedavra', c, 'me', V(0, 0, 0)) : w.d.applyToZombie('AvadaKedavra', c, 'me', V(0, 0, 0));
            const hits = w.calls.filter((x) => x[1] === 'hit').length;
            assert.equal(hits, 2, `${name}: Avada on ${k} ${id} hits twice`);
        }
    }
});
