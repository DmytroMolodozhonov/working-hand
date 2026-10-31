// The author, testing hell: «я не вижу Таронов и горгулий — не спавнятся или очень редко». Cause: the plan put the first camp 800–1500 m
// and the first lair 270–1200 m from where the hero arrives, and a camp was made only within 240 m (the lairs within 520 m). Now the first camp
// (4–6 Tarons) is 200–400 m and the first lair 320–480 m from the arrival; here the real plan, the real Taron and HellPatrol systems.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { hellPlan } from '../../src/world/HellMap.js';
import { Taron } from '../../src/game/Taron.js';
import { HellPatrol } from '../../src/game/HellPatrol.js';

function world(seed) {
    const plan = hellPlan(seed);
    let id = 0;
    const G = {
        list: [], victims: [],
        spawn(pos, o) { const g = { id: 'g' + ++id, model: { position: pos.clone() }, vel: new THREE.Vector3(), a: { mode: 'fly' }, t: 0, dead: false, target: null, scale: 1, ...o }; G.list.push(g); return g; },
        _fly(o, goal, speed, dt) { o.model.position.lerp(goal, Math.min(1, dt * 0.5)); }, _orient() {}, _remove(o) { o.dead = true; G.list.splice(G.list.indexOf(o), 1); },
    };
    const g = {
        scene: new THREE.Group(), authority: true, localId: 'me', remotes: new Map(), frameCount: 0, gen: 30, gargoyles: G,
        character: { group: new THREE.Group(), velocity: { x: 0, z: 0 } },
        collision: { groundY: (x, z) => 20, resolveCylinder() {}, isSolidAt: () => false },
        terrain: { data: { hell: true, hellPlan: plan, landMade: () => true, get: () => 0, set() {} } },
        combat: { dead: false, enabled: true, damage() {}, shieldFactor: () => 0 }, sound: { playTaron() {}, playCrack() {} }, fx: { shake: 0, smoke: { spawn() {} } },
        hud: { setVoice() {} }, items: { spawnLoose() {} }, creatureImpact: { apply() {} }, impact: { apply() {} },
    };
    G.game = g;
    g.tarons = new Taron(g); g.hellPatrol = new HellPatrol(g);
    return { g, plan, G };
}
const run = (w, secs, hook) => { for (let t = 0; t < secs; t += 1 / 30) { w.g.frameCount++; w.g.tarons.update(1 / 30); w.g.hellPatrol.update(1 / 30); hook?.(t); } };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('the plan: the first camp 150–400 m and the nearest lair 150–500 m from the arrival, in every seed', () => {
    for (const seed of [1, 7, 99, 777, 4242, 12345, 20261015, 31337]) {
        const P = hellPlan(seed), s = P.spawn;
        const c = Math.min(...P.taronCamps.map((q) => dist(q, s))), l = Math.min(...P.gargoyleLairs.map((q) => dist(q, s)));
        assert.ok(c >= 150 && c <= 400, `seed ${seed}: the nearest camp ${Math.round(c)} m`);
        assert.ok(l >= 150 && l <= 500, `seed ${seed}: the nearest lair ${Math.round(l)} m`);
        assert.ok(P.taronCamps.every((q) => q.n >= 3 && q.n <= 8) && P.gargoyleLairs.length === 6);
        assert.ok(P.taronCamps.every((q) => dist(q, P.returnMark) > 200), 'not on the arrival plateau');
    }
});

test('hell: at the arrival the near camp is made in full within seconds, and a gargoyle of a patrol is in the air within 2 minutes', () => {
    for (const seed of [1, 4242, 20261015]) {
        const w = world(seed), s = w.plan.spawn;
        w.g.character.group.position.set(s.x, s.y + 2, s.z);
        run(w, 6);
        const near = w.plan.taronCamps.filter((q) => dist(q, s) < 400);
        assert.ok(near.length >= 1, 'a camp in sight');
        const tarons = w.g.tarons.list.filter((t) => !t.dead);
        assert.ok(tarons.length >= near[0].n, `seed ${seed}: ${tarons.length} Tarons (the camp has ${near[0].n}) — at once, not one in 15 minutes`);
        assert.ok(tarons.every((t) => dist(t.model.position, s) < 450));
        run(w, 120);
        const flying = w.G.list.filter((o) => !o.dead && dist(o.model.position, s) < 900);
        assert.ok(flying.length >= 1, `seed ${seed}: a patrol gargoyle in sight within 2 minutes`);
        assert.ok(w.G.list.length <= 24);
    }
});

test('hell: a far camp is made when the hero comes within 420 m, and unmade behind him', () => {
    const w = world(1), s = w.plan.spawn;
    const far = w.plan.taronCamps.slice().sort((a, b) => dist(b, s) - dist(a, s))[0];
    w.g.character.group.position.set(s.x, 24, s.z);
    run(w, 4);
    assert.ok(!w.g.tarons.list.some((t) => t.camp.x === far.x), 'a far camp is not made');
    w.g.character.group.position.set(far.x - 380, 24, far.z); run(w, 6);
    assert.ok(w.g.tarons.list.filter((t) => t.camp.x === far.x && !t.dead).length === far.n, 'made within 420 m');
    w.g.character.group.position.set(far.x - 1100, 24, far.z); run(w, 4);
    assert.ok(!w.g.tarons.list.some((t) => t.camp.x === far.x), 'put away at 560 m+');
});

test('the systems are in the game\'s frame (not only on the Earth), and not on the Earth\'s far map: nothing is made outside hell', () => {
    const src = fs.readFileSync(new URL('../../src/game/Game.js', import.meta.url), 'utf8');
    assert.match(src, /if \(!duelOnly\) \{ this\.tarons\.update\(dt\); this\.hellPatrol\.update\(dt\); \}/);
    const w = world(1); w.g.character.group.position.set(0, 20, 0); run(w, 10);
    assert.equal(w.g.tarons.list.length, 0); assert.equal(w.G.list.length, 0);
});
