// The rag doll of a DEAD animal (AnimalRagdoll.js; the author 07.11): cow, pig, sheep, horse fall like a person does — drawn BY the doll.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { animalModel } from '../../src/game/AnimalModels.js';
import { Ragdoll } from '../../src/game/Ragdoll.js';
import { fromRig, toRig } from '../../src/game/RagdollPose.js';
import { ANIMAL_RIG, hasDoll, snapshot } from '../../src/game/AnimalRagdoll.js';
import { CreatureImpact } from '../../src/game/CreatureImpact.js';

const W = { boxes: () => [], floor: () => 0 };
const KINDS = ['cow', 'pig', 'sheep', 'horse', 'swan'];
function animal(type, size = 1) {
    const scene = new THREE.Scene();
    const model = animalModel(type, type === 'horse' ? undefined : 1);
    model.scale.setScalar(size);
    scene.add(model);
    model.position.set(3, 0.5, 4); model.rotation.y = 0.9;
    scene.updateMatrixWorld(true);
    return { scene, c: { id: 1, type, isAnimal: true, dead: true, model, group: model } };
}
const drawn = (c) => ANIMAL_RIG.points(c).map(([i, o, x, y, z]) => [i, o.localToWorld(new THREE.Vector3(x, y, z))]);

test('cow, pig, sheep, horse and swan get a doll (not fish, the book)', () => {
    for (const k of KINDS) assert.ok(hasDoll(k), k);
    for (const k of ['shark', 'dolphin', 'glowfin', 'runbook']) assert.ok(!hasDoll(k), k);
});

test('the doll takes the standing pose and puts it back: nothing jumps more than a few centimetres', () => {
    for (const type of KINDS) for (const size of [1, 1.4]) {
        const { scene, c } = animal(type, size);
        const d = new Ragdoll(ANIMAL_RIG.spec(c));
        fromRig(d, ANIMAL_RIG, c);
        const before = drawn(c);
        toRig(d, ANIMAL_RIG, c); scene.updateMatrixWorld(true);
        const after = drawn(c);
        const worst = Math.max(...before.map(([, b], k) => b.distanceTo(after[k][1])));
        assert.ok(worst < 0.12 * size, `${type} ×${size}: ${worst.toFixed(3)} m`);
    }
});

test('thrown and lying: it falls asleep above the floor, with every drawn joint on its ball (no NaN)', () => {
    for (const type of KINDS) {
        const { scene, c } = animal(type, 1.2);
        const d = new Ragdoll(ANIMAL_RIG.spec(c));
        fromRig(d, ANIMAL_RIG, c);
        d.launch(5, 4, -3, 0);
        for (let k = 0; k < 600 && !d.asleep; k++) d.step(W, 1 / 60);
        assert.ok(d.asleep, `${type} lies still`);
        assert.ok(d.lowest() > -0.02, `${type} not under the floor`);
        toRig(d, ANIMAL_RIG, c); scene.updateMatrixWorld(true);
        assert.ok(Number.isFinite(c.group.position.x + c.group.position.y + c.group.position.z), `${type} place`);
        let worst = 0;
        for (const [i, q] of drawn(c)) { if (type === 'swan' && (i === 5 || i === 6)) continue; /* (a swan's wing stubs are only balls: the wings are not aimed) */ const p = d.at(i, [0, 0, 0]); worst = Math.max(worst, Math.hypot(q.x - p[0], q.y - p[1], q.z - p[2])); }
        assert.ok(worst < 0.08, `${type}: drawn ${worst.toFixed(3)} m off the doll`);
        // (not a pancake: the torso keeps its length, the legs theirs)
        const [hp, sp] = [d.at(3, [0, 0, 0]), d.at(1, [0, 0, 0])], S = snapshot(type);
        const len = Math.hypot(hp[0] - sp[0], hp[1] - sp[1], hp[2] - sp[2]), rest = Math.hypot(S.hl.hip[0] - S.fl.hip[0], S.hl.hip[1] - S.fl.hip[1], S.hl.hip[2] - S.fl.hip[2]);
        assert.ok(Math.abs(len / (rest * 1.2) - 1) < 0.1, `${type}: torso length ${len.toFixed(2)}`);
    }
});

test('CreatureImpact: a dead animal near the hero gets a doll, a live one never does; far away — the old way', () => {
    const { scene, c } = animal('cow');
    const g = { scene, authority: true, localId: 'me', remotes: new Map(), fx: { spark() {} }, zombies: [], zombieById: new Map(),
        character: { group: { position: new THREE.Vector3(3, 0, 4) } },
        collision: { queryBoxes: () => [], resolveCylinder() {}, groundAt: () => 0 }, terrain: { data: { solidIn: () => false } } };
    const ci = new CreatureImpact(g);
    c.dead = false;
    ci.ragDeath(c);
    assert.ok(!ci.ragOf(c), 'alive: no doll');
    c.dead = true;
    ci.ragDeath(c);
    assert.ok(ci.ragOf(c), 'dead: a doll');
    const far = animal('pig'); far.c.id = 2;
    g.character.group.position.set(500, 0, 500);
    ci.ragDeath(far.c);
    assert.ok(!ci.ragOf(far.c), 'far: the old way');
});
