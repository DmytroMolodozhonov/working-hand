// A villager knocked down by «Джолт» gets up WITHOUT going over himself (the author 05.11, again: «когда NPC встаёт, он всё равно
// переворачивается, делает сальто»): from the moment he starts to rise, the drawn body (the model's root) turns only as much as standing up
// needs — never a somersault, never upside down; the head never drops under the hips once he is half up.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';
import { CreatureImpact } from '../../src/game/CreatureImpact.js';
import { house, rng, FLOOR } from './solid-guard-world.mjs';

function setup(x, z, yaw) {
    const H = house({ door: false, bed: false, chest: false, cupboard: false });
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
    return { v, ci: g.creatureImpact, sync };
}

test('getting up after «Джолт»: no somersault — the body turns only the way standing up needs', () => {
    const r = rng(11);
    const up = new THREE.Vector3(), q = new THREE.Quaternion(), prev = new THREE.Quaternion();
    let worst = 0, worstN = -1, risen = 0;
    for (let n = 0; n < 40; n++) {
        const { v, ci, sync } = setup(6, 5, r() * 6.28);
        const sp = 12 + r() * 30, a = r() * Math.PI * 2;
        ci.apply(v, { v: new THREE.Vector3(Math.cos(a) * sp, 0, Math.sin(a) * sp), kind: 'spell', spell: 'Jolt', always: { down: 3 }, down: 3, toss: 6, tumble: 1 });
        const s = ci.active.get('v|' + v.id)?.s;
        if (!s) continue;
        let rising = false, turned = 0, need = 0, started = false, y0 = 0, lowest = 1;
        for (let t = 0; t < 30; t += 1 / 30) {
            ci.update(1 / 30); sync();
            const st = ci.stateOf(v);
            v.model.root.getWorldQuaternion(q);
            up.set(0, 1, 0).applyQuaternion(q);
            if (st === 'rising' || s.getUp) {
                if (!started) { started = true; need = Math.acos(Math.max(-1, Math.min(1, up.y))); prev.copy(q); y0 = up.y; }
                turned += prev.angleTo(q); prev.copy(q);
                lowest = Math.min(lowest, up.y - y0);
                rising = true;
            } else if (rising && st === 'up') {
                // (and AFTER: standing, it stays standing — the drawn somersault of the throw used to be kept and played right now:
                //  the villager stood up, then went head over heels — the author 05.11, «всё ещё делает сальто»)
                for (let k = 0; k < 90; k++) { ci.update(1 / 30); sync(); v.model.root.getWorldQuaternion(q); up.set(0, 1, 0).applyQuaternion(q); assert.ok(up.y > 0.8, `throw ${n}: standing, then over again (${up.y.toFixed(2)}) — the left-over somersault`); }
                break;
            }
        }
        if (!rising) continue;
        risen++;
        const extra = turned - need;
        if (extra > worst) { worst = extra; worstN = n; }
        assert.ok(lowest > -0.35, `throw ${n}: it tipped further over than it lay (${lowest.toFixed(2)}) — a somersault`);
    }
    assert.ok(risen > 30, `got up: ${risen}`);
    // (since 05.11 a real getting up through key poses — sits up / pushes up, leans over its knees, kneels, stands: its turning is more than
    //  the shortest arc — ~1.5–2.5 rad more — but never a somersault, which is ≥ 2π: and it never tips further over than it lay, above)
    assert.ok(worst < 3, `the worst getting-up turned ${worst.toFixed(2)} rad more than standing needs (throw ${worstN}) — a somersault`);
});
