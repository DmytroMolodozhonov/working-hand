import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';
import { CreatureImpact } from '../../src/game/CreatureImpact.js';
import { standFree } from '../../src/game/SolidGuard.js';
import { house, rng, FLOOR } from './solid-guard-world.mjs';

/** A villager in the little house: the game's collision boxes (bed, chest) and blocks; its walking test knows only the blocks, like CastleLife._walkable. */
function setup(x, z, { yaw = 0 } = {}) {
    const H = house({ door: false });
    const scene = new THREE.Scene();
    const model = new VillagerModel(villagerLook(3, 'farmer'), {});
    scene.add(model.group);
    const v = { id: 'cs1_1:2', isVillager: true, role: 'farmer', model, group: model.group, x, y: FLOOR, z, yaw, dead: false, stunT: 0, vy: 0, mode: 'idle', speed: 0 };
    const sync = () => { model.group.position.set(v.x, v.y + 1.95, v.z); model.group.rotation.y = v.yaw; model.group.updateMatrixWorld(true); };
    sync();
    const g = {
        scene, authority: true, localId: 'me', remotes: new Map(), fx: { spark() {} },
        collision: { queryBoxes: H.world.boxes, resolveCylinder() {}, groundAt: () => FLOOR },
        terrain: { data: { solidIn: (ix, iz, lo, hi) => H.world.solid(ix, iz, lo, hi) } },
        zombies: [], zombieById: new Map(), sync: null,
        castleLife: { byId: new Map([[v.id, v]]), _walkable: (px, pz) => !H.world.solid(Math.round(px), Math.round(pz), 2, 5), _ground() {} },
    };
    g.creatureImpact = new CreatureImpact(g);
    return { g, v, ci: g.creatureImpact, H, sync };
}
const run = (t, ci, sync, secs, each) => { for (let s = 0; s < secs; s += 1 / 30) { ci.update(1 / 30); sync(); each?.(); } };

test('a villager jolted at 15–60 m/s into the bed, the chest, the cupboard and the walls is never inside any of them, whatever the angle', () => {
    const r = rng(5);
    let bad = 0, frames = 0, down = 0;
    for (let n = 0; n < 80; n++) {
        let x, z;
        do { x = 3.3 + r() * 7; z = 1.5 + r() * 7; } while (!standFree({ boxes: house({ door: false }).world.boxes, solid: (a, b, c, d) => house({ door: false }).world.solid(a, b, c, d) }, x, z, 0.5, FLOOR) || (x > 3.3 && x < 7.7 && z > 3.3 && z < 6.7));
        const { v, ci, sync, H } = setup(x, z);
        const sp = 15 + r() * 45, a = r() * Math.PI * 2;
        const res = ci.apply(v, { v: new THREE.Vector3(Math.cos(a) * sp, 0, Math.sin(a) * sp), kind: 'spell', spell: 'Jolt', always: { down: 5 }, down: 5 });
        if (res === 'knockdown') down++;
        run(null, ci, sync, 3, () => { frames++; if (!standFree(H.world, v.x, v.z, 0.45, FLOOR)) bad++; });
    }
    assert.ok(down > 40, 'most were knocked down');
    assert.equal(bad, 0, `${bad} of ${frames} frames inside a solid`);
});

test('a villager knocked down on the bed lies ON it (raised to its top); knocked down beside it, he is not lifted; the pose is kept', () => {
    const on = setup(2.25, 1.8, { yaw: Math.PI });
    on.ci.apply(on.v, { v: new THREE.Vector3(0, 0, 1), kind: 'push', always: { down: 6 }, down: 6 });
    run(null, on.ci, on.sync, 2.5);
    const s = on.ci.active.get('v|' + on.v.id).s;
    assert.equal(s.state, 'down');
    assert.ok(s.rest > 0.8 && s.rest <= 1.01, `rests ${s.rest.toFixed(2)} m up (bed top 1.0)`);
    const piv = on.v.model.root;
    assert.ok(Math.abs(piv.rotation.x) + Math.abs(piv.rotation.z) > 1.4, 'lies flat (the pose it fell in)');
    const off = setup(8, 3);
    off.ci.apply(off.v, { v: new THREE.Vector3(0, 0, 1), kind: 'push', always: { down: 6 }, down: 6 });
    run(null, off.ci, off.sync, 2.5);
    const s2 = off.ci.active.get('v|' + off.v.id).s;
    assert.ok((s2.rest || 0) < 0.05, 'on the floor: no lift');
});

test('a 40 m/s throw straight at the bed stops at its edge', () => {
    const { v, ci, sync, H } = setup(7.5, 2.2);
    ci.apply(v, { v: new THREE.Vector3(-40, 0, 0), kind: 'spell', spell: 'Jolt', always: { down: 5 }, down: 5 });
    let minX = 99;
    run(null, ci, sync, 2, () => { minX = Math.min(minX, v.x); });
    assert.ok(minX > 3.5 + 0.4, `stopped in front of the bed at x = ${minX.toFixed(2)} (its edge 3.5)`);
    assert.ok(standFree(H.world, v.x, v.z, 0.45, FLOOR));
});
