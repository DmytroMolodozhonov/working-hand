// A creature thrown at a wall by a push (Jolt, Bombarda, Wind…) never ends up inside the blocks: not standing, not lying.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { CastleLife } from '../../src/game/CastleLife.js';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';
import { CreatureImpact, KINDS } from '../../src/game/CreatureImpact.js';
import { lieClearPush } from '../../src/game/LieClear.js';

const F = 60; // the first air layer over the floor
const W = 5; // the wall: x = 5
function terrain({ door = false } = {}) {
    const d = new TerrainData(); d.generate({ seed: 1 });
    for (let x = -15; x <= 15; x++) for (let z = -15; z <= 15; z++) {
        for (let y = F - 1; y <= F + 12; y++) d.set(x, y, z, BLOCK.AIR);
        d.set(x, F - 1, z, BLOCK.STONE);
    }
    for (let z = -15; z <= 15; z++) for (let y = F; y < F + 8; y++) if (!(door && Math.abs(z) <= 1 && y < F + 4)) d.set(W, y, z, BLOCK.STONE);
    for (let x = W; x <= 15; x++) for (let z = -15; z <= 15; z++) for (let y = F; y < F + 8; y++) if (!(door && Math.abs(z) <= 1 && y < F + 4 && x < W + 3)) d.set(x, y, z, BLOCK.STONE);
    return d;
}
const FLOOR_Y = F - 1.5;

/** how many solid blocks the body (standing: round of radius r; lying: along the axis) overlaps */
function inside(d, x, z, y, r = 0.42, ax = null, len = 0) {
    let n = 0;
    const L0 = Math.round(y + 1.5) + 1;
    const pts = [];
    for (let a = 0; a < 8; a++) pts.push([x + Math.cos(a * Math.PI / 4) * r, z + Math.sin(a * Math.PI / 4) * r]);
    pts.push([x, z]);
    if (ax) for (const k of [0.25, 0.5, 0.75, 1]) pts.push([x + ax[0] * len * k, z + ax[1] * len * k]);
    for (const [px, pz] of pts) if (d.solidIn(Math.round(px), Math.round(pz), L0, L0 + 1)) n++;
    return n;
}

function setup(d) {
    const scene = new THREE.Scene();
    const model = new VillagerModel(villagerLook(3, 'farmer'), {});
    scene.add(model.group);
    const cl = { game: null, byId: new Map() };
    const g = { scene, authority: true, localId: 'me', remotes: new Map(), fx: { spark() {} }, world: { terrain: { data: d } },
        collision: { groundAt: () => FLOOR_Y, groundY: () => FLOOR_Y, resolveCylinder() {} }, castleLife: cl, sync: { creatureImpacts() {} } };
    cl.game = g;
    cl._walkable = CastleLife.prototype._walkable; cl._airFree = CastleLife.prototype._airFree; cl._ground = CastleLife.prototype._ground;
    cl._walkable = cl._walkable.bind(cl); cl._airFree = cl._airFree.bind(cl); cl._ground = cl._ground.bind(cl);
    cl._pushOut = CastleLife.prototype._pushOut?.bind(cl);
    const v = { id: 'cs1_1:2', isVillager: true, role: 'farmer', model, group: model.group, x: 1, y: FLOOR_Y, z: 0, yaw: 0, dead: false, stunT: 0, vy: 0, mode: 'idle', speed: 0 };
    model.group.position.set(v.x, v.y + 1.95, v.z);
    cl.byId.set(v.id, v);
    g.creatureImpact = new CreatureImpact(g);
    return { g, v, ci: g.creatureImpact };
}

function run(d, ang, force, x0 = 1, z0 = 0) {
    const { v, ci } = setup(d);
    v.x = x0; v.z = z0;
    const vx = Math.cos(ang) * force, vz = Math.sin(ang) * force;
    ci.apply(v, { v: new THREE.Vector3(vx, 0, vz), spell: 'Jolt', always: { down: 1 }, toss: 0 });
    let bad = 0, worst = 0;
    for (let t = 0; t < 8; t += 1 / 60) {
        ci.update(1 / 60);
        const lying = ci.stateOf(v);
        const n = inside(d, v.x, v.z, v.y);
        if (n) { bad++; worst = Math.max(worst, n); }
        if (lying === 'down' && t > 1.5) { // (settled, lying: head, arms and legs are out of the wall too)
            const piv = KINDS.v.pivot(v).obj; piv.updateWorldMatrix(true, false);
            const ax = new THREE.Vector3(0, 1, 0).transformDirection(piv.matrixWorld);
            const feet = piv.getWorldPosition(new THREE.Vector3());
            const push = lieClearPush((ix, iz, L) => d.solidIn(ix, iz, L, L), feet.x, feet.y, feet.z, ax.x, ax.z, 3.4);
            if (push) { bad++; worst = 99; }
        }
        if (!Number.isFinite(v.x)) assert.fail('NaN');
    }
    return { bad, worst, x: v.x, z: v.z };
}

test('pushed at a wall from any angle and force: never inside the blocks', () => {
    const d = terrain();
    const fails = [];
    for (const force of [15, 40, 120, 400]) for (let a = -80; a <= 80; a += 20) {
        const r = run(d, a * Math.PI / 180, force, 3.5, 0);
        if (r.bad) fails.push(`force ${force} angle ${a}: ${r.bad} frames inside (${r.worst} pts) at ${r.x.toFixed(2)}`);
    }
    assert.deepEqual(fails, []);
});

test('thrown through a doorway and at its jambs: never inside the blocks', () => {
    const d = terrain({ door: true });
    const fails = [];
    for (const force of [15, 40, 120]) for (const z0 of [-3, -1.6, 0, 1.6, 3]) for (let a = -40; a <= 40; a += 20) {
        const r = run(d, a * Math.PI / 180, force, 2, z0);
        if (r.bad) fails.push(`force ${force} z ${z0} angle ${a}: ${r.bad}`);
    }
    assert.deepEqual(fails, []);
});
