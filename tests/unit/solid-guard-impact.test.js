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

/** The drawn model's parts (head, hands, hips, knees, feet) in the world: how deep the deepest one is in a block, a bed, a chest. */
const PARTS = [['head', 0, 0.6, 0], ['leftArm', 0, -0.95, 0], ['rightArm', 0, -0.95, 0], ['leftLeg', 0, 0, 0], ['rightLeg', 0, 0, 0], ['leftKnee', 0, 0, 0], ['rightKnee', 0, 0, 0], ['leftKnee', 0, -0.65, 0], ['rightKnee', 0, -0.65, 0], ['pelvis', 0, 0, 0]];
const _w = new THREE.Vector3();
function modelDepth(model, H) {
    model.group.updateMatrixWorld(true);
    let worst = 0;
    for (const [k, x, y, z] of PARTS) {
        model[k].localToWorld(_w.set(x, y, z));
        if (_w.y < FLOOR - 0.05) worst = Math.max(worst, FLOOR - _w.y);
        for (const b of H.boxes) if (_w.x > b.minX && _w.x < b.maxX && _w.z > b.minZ && _w.z < b.maxZ && _w.y > b.minY && _w.y < b.maxY) worst = Math.max(worst, Math.min(_w.x - b.minX, b.maxX - _w.x, _w.z - b.minZ, b.maxZ - _w.z, b.maxY - _w.y));
        const L = Math.round(_w.y + 1);
        if (H.world.solid(Math.round(_w.x), Math.round(_w.z), L, L)) worst = Math.max(worst, Math.min(0.5 - Math.abs(_w.x - Math.round(_w.x)), 0.5 - Math.abs(_w.z - Math.round(_w.z)), (L - 0.5) - _w.y, _w.y - (L - 1.5))); // (the nearest face of the block, sideways or up/down)
    }
    return worst;
}

test('a villager jolted at 15–60 m/s into the bed, the chest, the cupboard and the walls flies as a rag doll — no part of him is ever in them', () => {
    const r = rng(5);
    let bad = 0, frames = 0, dolls = 0, worstDoll = 0, worstModel = 0, asleep = 0;
    const W0 = house({ door: false });
    for (let n = 0; n < 60; n++) {
        let x, z;
        do { x = 3.3 + r() * 7; z = 1.5 + r() * 7; } while (!standFree(W0.world, x, z, 0.5, FLOOR) || (x > 3.3 && x < 7.7 && z > 3.3 && z < 6.7));
        const { v, ci, sync, H } = setup(x, z);
        const sp = 15 + r() * 45, a = r() * Math.PI * 2;
        ci.apply(v, { v: new THREE.Vector3(Math.cos(a) * sp, 0, Math.sin(a) * sp), kind: 'spell', spell: 'Jolt', always: { down: 8 }, down: 8, toss: 6, tumble: 1 });
        const s = ci.active.get('v|' + v.id)?.s;
        if (!s?.rag) continue;
        dolls++;
        const doll = s.rag;
        run(null, ci, sync, 4, () => {
            frames++;
            const p = doll.penetration(H.world), m = modelDepth(v.model, H);
            worstDoll = Math.max(worstDoll, p); worstModel = Math.max(worstModel, m);
            if (p > 0.12 || m > 0.25) bad++;
        });
        if (doll.asleep) asleep++;
    }
    assert.ok(dolls > 50, `the dolls were made (${dolls})`);
    assert.equal(bad, 0, `${bad} of ${frames} frames in a solid (doll ${worstDoll.toFixed(2)} m, drawn ${worstModel.toFixed(2)} m)`);
    assert.ok(asleep >= dolls * 0.9, `${asleep} of ${dolls} lie still within 4 s`);
});

test('knocked down by the bed he lies ON it as the doll fell — the drawn hips are at the bed top, not in it, not under it; then he gets up', () => {
    const on = setup(2.25, 1.8, { yaw: Math.PI });
    on.ci.apply(on.v, { v: new THREE.Vector3(0, 0, 4), kind: 'push', always: { down: 6 }, down: 6 });
    const s = on.ci.active.get('v|' + on.v.id).s;
    assert.ok(s.rag, 'a rag doll');
    run(null, on.ci, on.sync, 3);
    assert.ok(s.rag.asleep, 'lies still');
    on.v.model.group.updateMatrixWorld(true);
    const hip = on.v.model.pelvis.getWorldPosition(new THREE.Vector3());
    assert.ok(hip.y > FLOOR + 1.0 + 0.2 && hip.y < FLOOR + 1.0 + 0.9, `the hips on the bed: ${hip.y.toFixed(2)} (bed top ${FLOOR + 1})`);
    assert.ok(modelDepth(on.v.model, on.H) < 0.25);
    run(null, on.ci, on.sync, 14); // (lying 6 s + 1…5 s more, then a real getting up through its key poses — ~2–3 s since 05.11)
    assert.equal(on.ci.stateOf(on.v), 'up', 'up again by himself');
    assert.ok(!on.v.rag, 'the doll let him go');
    assert.ok(Math.abs(on.v.model.root.quaternion.x) + Math.abs(on.v.model.root.quaternion.z) < 1e-6, 'standing as himself');
});

test('a villager killed by a blow falls as a rag doll and his body keeps the pose it settled in (Death.reposeBody)', () => {
    const { g, v, ci, sync } = setup(8.5, 6.5);
    const got = [];
    g.death = { reposeBody: (k, who, pose, group) => got.push({ k, who, pose, x: group.position.x }) };
    ci.apply(v, { v: new THREE.Vector3(14, 0, 0), kind: 'spell', spell: 'Jolt', always: { down: 8 }, down: 8 });
    run(null, ci, sync, 0.3);
    v.dead = true; v.model.update(0.016, { mode: 'dead' });
    ci.ragDeath(v);
    assert.ok(ci.deadRags.has('v|' + v.id), 'the same doll lies on, dead'); // (keyed by kind and id: a zombie and a villager may share an id)
    for (let t = 0; t < 8 && !got.length; t += 1 / 30) { v.model.update(1 / 30, { mode: 'dead' }); ci.update(1 / 30); sync(); }
    assert.equal(got.length, 1, 'the pose went to the body');
    assert.equal(got[0].pose.length, 7 + 40);
    assert.equal(v.rag, 'done');
});

test('a 40 m/s throw straight at the bed stops at its edge', () => {
    const { v, ci, sync, H } = setup(7.5, 2.2);
    ci.apply(v, { v: new THREE.Vector3(-40, 0, 0), kind: 'spell', spell: 'Jolt', always: { down: 5 }, down: 5 });
    let minX = 99;
    run(null, ci, sync, 2, () => { minX = Math.min(minX, v.x); });
    assert.ok(minX > 3.5 + 0.4, `stopped in front of the bed at x = ${minX.toFixed(2)} (its edge 3.5)`);
    assert.ok(standFree(H.world, v.x, v.z, 0.45, FLOOR));
});
