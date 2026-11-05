// The rag doll on every humanoid body that has a model of parts: villagers (wizards, knights, the king, merchants, wanderers, sailors — all
// VillagerModel), zombies, Tarons. What is drawn must be where the doll is (a drawn head or foot off the doll's ball would go into a wall).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Zombie } from '../../src/entities/Zombie.js';
import { taronModel } from '../../src/fx/TaronModel.js';
import { taronLook } from '../../src/game/TaronRules.js';
import { KINDS } from '../../src/game/CreatureImpact.js';
import { Ragdoll } from '../../src/game/Ragdoll.js';
import { ZOMBIE_RIG, TARON_RIG, fromRig, toRig } from '../../src/game/RagdollPose.js';

function bodies() {
    const scene = new THREE.Scene();
    const z = new Zombie(scene, new THREE.Vector3(3, 0, 4), 7, {});
    z.group.position.set(3, 0.5, 4); z.group.rotation.y = 0.8;
    KINDS.z.pivot(z); ZOMBIE_RIG.begin(z); // (as CreatureImpact does when the doll starts)
    const t = { model: taronModel(taronLook(2)) }; scene.add(t.model); t.model.position.set(10, 1, 2); t.model.rotation.y = -0.6;
    return { scene, list: [['zombie', ZOMBIE_RIG, z], ['taron', TARON_RIG, t]] };
}
const W = { boxes: () => [], floor: () => 0 };
const drawn = (rig, c) => rig.points(c).map(([i, o, x, y, z]) => [i, o.localToWorld(new THREE.Vector3(x, y, z))]);

test('the doll takes the pose of the moment: put back on the model, nothing jumps more than a few centimetres', () => {
    const { scene, list } = bodies();
    for (const [name, rig, c] of list) {
        scene.updateMatrixWorld(true);
        const d = new Ragdoll(rig.spec(c));
        fromRig(d, rig, c);
        const before = drawn(rig, c);
        toRig(d, rig, c); scene.updateMatrixWorld(true);
        const after = drawn(rig, c);
        const worst = Math.max(...before.map(([, b], k) => b.distanceTo(after[k][1])));
        assert.ok(worst < 0.2, `${name}: ${worst.toFixed(3)} m`);
    }
});

test('lying on the floor: every drawn joint (head, hands, hips, knees, feet) is on the doll\'s ball; the feet stand on the floor when up', () => {
    const { scene, list } = bodies();
    for (const [name, rig, c] of list) {
        const L = new Ragdoll(rig.spec(c));
        L.lie(name === 'zombie' ? 3 : 10, 0, 4, 1, 0);
        for (let k = 0; k < 150; k++) L.step(W, 1 / 60);
        toRig(L, rig, c); scene.updateMatrixWorld(true);
        let worst = 0;
        for (const [i, q] of drawn(rig, c)) { const p = L.at(i, [0, 0, 0]); worst = Math.max(worst, Math.hypot(q.x - p[0], q.y - p[1], q.z - p[2])); }
        const by = drawn(rig, c).map(([i, q]) => { const p = L.at(i, [0, 0, 0]); return i + ':' + Math.hypot(q.x - p[0], q.y - p[1], q.z - p[2]).toFixed(2); }).join(' ');
        assert.ok(worst < 0.2 * rig.spec(c).scale, `${name}: the drawn body is ${worst.toFixed(3)} m off the doll (${by})`);
        assert.ok(L.lowest() > -0.02, `${name} not under the floor`);
    }
});

// ---------------------------------------------------------------- in the little house: thrown, lying, getting up — never in a wall, a bed, a chest
import { CreatureImpact } from '../../src/game/CreatureImpact.js';
import '../../src/game/Taron.js'; // (registers the Taron's kind 'T' with CreatureImpact, as the game does)
import { house, rng, FLOOR } from './solid-guard-world.mjs';
import { standFree } from '../../src/game/SolidGuard.js';

function inHouse(kind, x, z) {
    const H = house({ door: false });
    const scene = new THREE.Scene();
    const g = { scene, authority: true, localId: 'me', remotes: new Map(), fx: { spark() {} }, zombies: [], zombieById: new Map(),
        collision: { queryBoxes: H.world.boxes, resolveCylinder() {}, groundAt: () => FLOOR }, terrain: { data: { solidIn: (a, b, c, d) => H.world.solid(a, b, c, d) } } };
    let c;
    if (kind === 'z') {
        c = new Zombie(scene, new THREE.Vector3(x, 0, z), 7, {});
        c.group.position.set(x, FLOOR + 1.0 * c.group.scale.y, z);
        g.zombies.push(c); g.zombieById.set(7, c);
    } else {
        c = { id: 't1', ck: 'T', isTaron: true, model: taronModel(taronLook(2)), dead: false, r: 1.6, stun: 0 }; c.group = c.model; // (as Taron.js makes it)
        c.model.scale.setScalar(0.6); // (a small one: a full Taron (7 m) does not fit in an 11 × 9 hut at all)
        c.model.position.set(x, FLOOR, z); scene.add(c.model);
        g.tarons = { list: [c], byId: (id) => (id === c.id ? c : null) };
    }
    g.creatureImpact = new CreatureImpact(g);
    return { g, c, H, ci: g.creatureImpact };
}

for (const kind of ['z', 'T']) {
    test(`${kind === 'z' ? 'a zombie' : 'a Taron'} jolted into the bed, the chest, the cupboard and the walls: a rag doll — no part of it in them; it gets up by itself`, () => {
        const r = rng(kind === 'z' ? 3 : 4);
        const W0 = house({ door: false });
        let dolls = 0, bad = 0, frames = 0, up = 0, worst = 0;
        for (let n = 0; n < 20; n++) {
            let x, z;
            do { x = 3.6 + r() * 6.5; z = 1.8 + r() * 6.5; } while (!standFree(W0.world, x, z, 1.0, FLOOR) || (x > 3.0 && x < 8 && z > 3.0 && z < 7));
            const { c, ci, H } = inHouse(kind, x, z);
            const sp = 20 + r() * 40, a = r() * Math.PI * 2;
            // (a Taron stands against a spell 85 times of 100 — his steadiness, the author's table: here the blow of a falling rock, which no steadiness holds)
            ci.apply(c, { v: new THREE.Vector3(Math.cos(a) * sp, 0, Math.sin(a) * sp), kind: kind === 'z' ? 'spell' : 'rock', spell: kind === 'z' ? 'Jolt' : undefined, always: { down: 3 }, down: 3, toss: 4 });
            const s = ci.active.get(kind + '|' + c.id)?.s;
            if (!s?.rag) continue;
            dolls++;
            const doll = s.rag, rig = s.rig;
            for (let t = 0; t < 18 && ci.active.has(kind + '|' + c.id); t += 1 / 30) { // (18 s: lying 5…10 s, then a real getting up ~2 s)
                ci.update(1 / 30); frames++;
                if (!s.rag) continue;
                const p = doll.penetration(H.world);
                worst = Math.max(worst, p);
                if (p > 0.15) bad++;
            }
            if (ci.stateOf(c) === 'up') up++;
            void rig;
        }
        assert.ok(dolls >= 15, `dolls made: ${dolls}`);
        assert.equal(bad, 0, `${bad} of ${frames} frames in a solid (deepest ${worst.toFixed(2)} m)`);
        assert.equal(up, dolls, `${up} of ${dolls} got up by themselves`);
    });
}

test('a living body thrown («Джолт») turns in the air exactly as a slack one: its muscles never spin it (the author 05.11)', async () => {
    const { Ragdoll } = await import('../../src/game/Ragdoll.js');
    const world = { boxes: () => [], solid: () => false, floor: () => -100 };
    const fly = (tone) => {
        const d = new Ragdoll(); d.lie(0, 50, 0, 1, 0);
        d.set(7, d.x[21] + 0.6, d.x[22], d.x[23] + 0.8); d.set(8, d.x[24] + 0.4, d.x[25], d.x[26] + 1.4); // (sprawled)
        d.launch(0, 12, -6, 0); d.tone = tone;
        const fr = new Array(9); let prev = null, turned = 0;
        for (let f = 0; f < 60; f++) { d.step(world, 1 / 60); d.frame(fr); if (prev) turned += Math.acos(Math.max(-1, Math.min(1, fr[3] * prev[0] + fr[4] * prev[1] + fr[5] * prev[2]))); prev = [fr[3], fr[4], fr[5]]; }
        return turned;
    };
    assert.ok(Math.abs(fly(0.5) - fly(0)) < 0.05, `alive ${fly(0.5).toFixed(2)} vs slack ${fly(0).toFixed(2)} rad`);
});

test('getting up: the body turns up the shortest way — no somersault (the author 05.11: «когда он встал… сделал такое сальто»)', async () => {
    const { Ragdoll } = await import('../../src/game/Ragdoll.js');
    const world = { boxes: () => [], solid: () => false, floor: () => 0 };
    for (const [ax, az] of [[1, 0], [0, -1], [-0.6, 0.8]]) {
        const d = new Ragdoll(); d.lie(0, 0, 0, ax, az);
        for (let i = 0; i < 60; i++) d.step(world, 1 / 60);
        const fr = new Array(9); d.frame(fr);
        const up = d.standUp(0, 0, 0, 1, 0);
        // on its back it sits up: it faces its feet (the head lay along a)
        assert.ok(up.fx * ax + up.fz * az < -0.9, `faces its feet: ${up.fx.toFixed(2)},${up.fz.toFixed(2)}`);
        // (since 05.11 it gets up through key poses — the author: «отдельную анимацию того, как человек встаёт»: it sits up, leans
        //  forward over its knees, kneels, stands — its up swings forward past upright and back: more than a quarter, never over itself)
        let pu = [fr[3], fr[4], fr[5]], pr = [fr[0], fr[1], fr[2]], turnU = 0, turnR = 0, lowest = fr[4];
        const y0 = fr[4];
        for (let f = 0; f < 200; f++) {
            d.step(world, 1 / 60); d.frame(fr);
            turnU += Math.acos(Math.min(1, fr[3] * pu[0] + fr[4] * pu[1] + fr[5] * pu[2])); pu = [fr[3], fr[4], fr[5]];
            turnR += Math.acos(Math.min(1, fr[0] * pr[0] + fr[1] * pr[1] + fr[2] * pr[2])); pr = [fr[0], fr[1], fr[2]];
            lowest = Math.min(lowest, fr[4]);
        }
        assert.ok(lowest > y0 - 0.1, `never tips further over than it lay: ${lowest.toFixed(2)} < ${y0.toFixed(2)}`);
        assert.ok(turnU < Math.PI * 1.15, `its up turned ${(turnU * 57.3).toFixed(0)}° — up and over its knees, not over itself`);
        assert.ok(turnR < 0.6, `no roll about itself: ${(turnR * 57.3).toFixed(0)}°`); // (kneeling on one knee twists it a little)
        assert.ok(fr[4] > 0.97 && d.goalDist() < 0.1, 'standing at the end');
    }
});
