// «Пилбидрио» bursts a body into ITS OWN PARTS (the author 05.11: «как кубики разбрасываются — я хочу именно части тела»): the head,
// the arms, the legs cut off its own model where they join, and the trunk — all flung out from the middle, tumbling and falling.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';
import { Zombie } from '../../src/entities/Zombie.js';
import { animalModel } from '../../src/game/Animals.js';
import { CollisionWorld } from '../../src/world/Collision.js';
import { Dismemberment } from '../../src/game/Dismember.js';
import { StrongMagic } from '../../src/game/StrongMagic.js';

function fakeGame() {
    const scene = new THREE.Scene(), c = new CollisionWorld();
    const game = { headless: true, scene, collision: c, world: { collision: c }, localId: 'A', authority: true, config: { mode: 'creative' }, remotes: new Map(), fx: { blood() {}, spark() {} }, hud: { setVoice() {} } };
    game.dismember = new Dismemberment(game);
    game.strong = new StrongMagic(game);
    return game;
}

test('a zombie, a villager and a cow burst into their own parts — head, arms / legs, the trunk — flying outward', () => {
    const g = fakeGame();
    const z = new Zombie(g.scene, new THREE.Vector3(0, 0, 0), 7, {});
    const vm = new VillagerModel(villagerLook(3, 'farmer'), {}); g.scene.add(vm.group); vm.group.position.set(10, 1.95, 0);
    const v = { id: 'v1', isVillager: true, role: 'farmer', model: vm, group: vm.group, x: 10, y: 0, z: 0 };
    const cm = animalModel('cow'); g.scene.add(cm); cm.position.set(-10, 0, 0);
    const cow = { id: 101, type: 'cow', isAnimal: true, model: cm, group: cm };
    for (const [k, c, p] of [['z', z, new THREE.Vector3(0, 2, 0)], ['v', v, new THREE.Vector3(10, 2, 0)], ['a', cow, new THREE.Vector3(-10, 1.2, 0)]]) {
        const before = g.dismember.props.length;
        const n = g.strong.burstParts(k, c, p, 1, k === 'z' ? 'zombie' : 'flesh');
        assert.ok(n >= 5, `${k}: ${n} parts (head, arms / legs, the trunk)`);
        const mine = g.dismember.props.slice(before);
        assert.equal(mine.length, n);
        assert.ok(mine.some((x) => x.obj.userData.limb === 'trunk'), 'the trunk flies too');
        for (const part of mine) {
            const out = new THREE.Box3().setFromObject(part.obj).getCenter(new THREE.Vector3()).sub(p);
            out.y = 0;
            const vh = new THREE.Vector3(part.velocity.x, 0, part.velocity.z);
            assert.ok(part.velocity.y > 2, 'thrown up');
            if (out.length() > 0.3) assert.ok(vh.dot(out) > 0, 'flung away from the middle');
        }
        // they fall and come to rest on the ground
        for (let i = 0; i < 300; i++) for (const part of mine) part.step(1 / 60);
        for (const part of mine) assert.ok(part.obj.position.y < 6, 'fallen');
    }
});
