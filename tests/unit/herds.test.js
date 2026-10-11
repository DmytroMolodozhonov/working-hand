import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Animals, SPECIES, pigSize } from '../../src/game/Animals.js';
import { solidGap, pairRoom, measureBody, ROOM } from '../../src/game/AnimalHerd.js';

/**
 * Herds on a flat empty meadow (a fake game, no browser): they keep their personal
 * space (from the models' real body length), spread loosely, live their own calm
 * states, flee together without touching, step aside from someone walking at them,
 * and a tamed horse comes to its owner.
 */
function fakeGame(me = [80, 0]) {
    const scene = new THREE.Scene();
    const g = {
        config: { mode: 'survival' }, authority: true, localId: 'me', scene,
        character: { group: new THREE.Group(), isCrouching: false },
        collision: { groundY: () => 0, resolveCylinder() {} },
        remotes: new Map(), fx: { spark() {} }, hud: { setVoice() {} },
        isDeadLocal: false, currentPose: null, combat: { enabled: false, dead: false },
        knockback: { add() {} }, damageLocalPlayer() {},
    };
    g.character.group.position.set(me[0], 1.5, me[1]);
    const A = new Animals(g);
    A.enabled = true;
    A._spawnT = 1e9; A._treeT = 1e9; // (no new herds, no trees: just these)
    return { g, A };
}

/** Runs fn with a repeatable Math.random (so a rare roll can't make the test flaky). */
function seeded(seed, fn) {
    const rnd = Math.random;
    let x = seed >>> 0;
    Math.random = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
    try { return fn(); } finally { Math.random = rnd; }
}

function nearest(a, list) {
    let best = Infinity, who = null;
    for (const o of list) {
        if (o === a || o.dead) continue;
        const d = Math.hypot(a.group.position.x - o.group.position.x, a.group.position.z - o.group.position.z);
        if (d < best) { best = d; who = o; }
    }
    return { d: best, o: who };
}

function run(A, secs, each, dt = 1 / 30) {
    const n = Math.round(secs / dt);
    for (let i = 0; i < n; i++) { A.update(dt); if (each && i % 15 === 0) each(i * dt); }
}

for (const type of ['sheep', 'pig', 'cow', 'horse']) {
    test(`herd of ${type}: 60 s of grazing — personal space kept, loose spread, several states`, () => {
        const { A } = fakeGame();
        const herd = A.spawnHerdAt(type, 7, 0, 0);
        assert.equal(herd.length, 7);
        let samples = 0, roomOk = 0, touching = 0, minRatio = Infinity;
        const states = new Set(), spreads = [];
        run(A, 60, () => {
            let cx = 0, cz = 0;
            for (const a of herd) { cx += a.group.position.x; cz += a.group.position.z; states.add(a.idle); }
            cx /= herd.length; cz /= herd.length;
            let sp = 0;
            for (const a of herd) {
                const { d, o } = nearest(a, herd);
                samples++;
                if (d >= pairRoom(a, o) * 0.97) roomOk++;
                const dx = a.group.position.x - o.group.position.x, dz = a.group.position.z - o.group.position.z;
                if (d < solidGap(a, o, dx, dz) * 0.95) touching++;
                minRatio = Math.min(minRatio, d / pairRoom(a, o));
                sp += Math.hypot(a.group.position.x - cx, a.group.position.z - cz);
            }
            spreads.push(sp / herd.length / herd[0].room);
        });
        const share = roomOk / samples;
        assert.ok(share >= 0.93, `${type}: nearest neighbour keeps the personal space ${(share * 100).toFixed(1)}% of the time (min ${minRatio.toFixed(2)}×)`);
        assert.ok(touching <= samples * 0.01, `${type}: bodies don't touch (${touching}/${samples})`);
        assert.ok(minRatio > 0.6, `${type}: never squeezed (${minRatio.toFixed(2)}× personal space)`);
        const mean = spreads.reduce((s, v) => s + v, 0) / spreads.length;
        assert.ok(mean > 0.8 && mean < 5, `${type}: a loose herd, not a pack nor scattered (mean distance to the middle ${mean.toFixed(2)}× personal space)`);
        assert.ok(Math.max(...spreads) < 9, `${type}: the herd stays together (${Math.max(...spreads).toFixed(1)})`);
        assert.ok(states.size >= 4 && states.has('graze'), `${type}: several calm states: ${[...states].join(',')}`);
    });
}

test('personal space comes from the model: sheep closer than cows; nobody bigger than its own body', () => {
    const { A } = fakeGame();
    const sheep = A._spawn('sheep', new THREE.Vector3(0, 0.5, 0));
    const cow = A._spawn('cow', new THREE.Vector3(20, 0.5, 0));
    const m = measureBody(cow.model);
    assert.ok(Math.abs(m.len - cow.dims.len) < 1e-6 && cow.dims.len > 2 * SPECIES.cow.size * 0.8, 'the cow is measured from its model');
    assert.ok(sheep.room < cow.room, 'sheep keep closer than cows');
    assert.ok(cow.room >= cow.dims.len * ROOM.cow - 1e-9 && cow.room > cow.dims.len, 'a cow keeps more than its body length');
    assert.ok(sheep.room > sheep.dims.wid * 1.2, 'sheep never touch side by side');
    // a model that changes (e.g. a new, bigger one) changes the space by itself
    const big = A._spawn('pig', new THREE.Vector3(40, 0.5, 0));
    const before = big.room;
    const { A: B } = fakeGame();
    const orig = SPECIES.pig.size; SPECIES.pig.size = orig * 1.5;
    try { const pig2 = B._spawn('pig', new THREE.Vector3(0, 0.5, 0)); assert.ok(pig2.room / pigSize(pig2.id) > before / pigSize(big.id) * 1.4, 'a bigger pig keeps more room'); } // (each pig its own size ±10%)
    finally { SPECIES.pig.size = orig; }
    assert.ok(cow.model.userData.head, 'the head has its own pivot (down to the grass, looking about)');
});

test('frightened: the herd runs away together, close but never touching', () => {
    const { g, A } = fakeGame([0, -6]);
    const herd = A.spawnHerdAt('cow', 6, 0, 10);
    run(A, 3);
    const rnd = Math.random; Math.random = () => 0.9; // (it runs, does not fight)
    try { A.hit(herd[0], 1, new THREE.Vector3(0, 0, 1), 'me'); } finally { Math.random = rnd; }
    const fleeing = herd.filter((a) => a.state === 'flee').length;
    assert.ok(fleeing >= 5, `the whole herd runs (${fleeing})`);
    const z0 = herd.reduce((s, a) => s + a.group.position.z, 0) / herd.length;
    let touching = 0, samples = 0;
    run(A, 4, () => {
        for (const a of herd) {
            const { d, o } = nearest(a, herd);
            const dx = a.group.position.x - o.group.position.x, dz = a.group.position.z - o.group.position.z;
            samples++;
            if (d < solidGap(a, o, dx, dz) * 0.95) touching++;
        }
    });
    const z1 = herd.reduce((s, a) => s + a.group.position.z, 0) / herd.length;
    assert.ok(z1 - z0 > 10, `away from me (${(z1 - z0).toFixed(1)} m)`);
    assert.ok(touching <= samples * 0.03, `still not touching while running (${touching}/${samples})`);
    void g;
});

test('someone walking right at a grazing sheep: it steps aside', () => {
    const { g, A } = fakeGame([0, -20]);
    const s = A._spawn('sheep', new THREE.Vector3(0, 0.5, 0));
    s.idle = 'graze'; s.idleT = 100;
    const me = g.character.group.position;
    let moved = 0;
    const dt = 1 / 30;
    for (let i = 0; i < 30 * 8; i++) {
        if (me.z < s.group.position.z - 1) me.z += 2.5 * dt; // walks straight at it
        A.update(dt);
        moved = Math.max(moved, Math.abs(s.group.position.x));
    }
    assert.ok(moved > 1.5, `the sheep stepped aside (${moved.toFixed(1)} m)`);
    const d = Math.hypot(me.x - s.group.position.x, me.z - s.group.position.z);
    assert.ok(d > 2, `not walked over (${d.toFixed(1)} m)`);
});

test('a calm tamed horse comes to its owner and stops a few steps off', () => seeded(7, () => {
    const { g, A } = fakeGame([0, 0]);
    const h = A._spawn('horse', new THREE.Vector3(25, 0.5, 0), { tamed: 'me' });
    run(A, 25);
    const d = Math.hypot(h.group.position.x, h.group.position.z);
    assert.ok(d < 12, `came to me (${d.toFixed(1)} m)`);
    assert.ok(d > h.dims.len * 0.5, `but not onto me (${d.toFixed(1)} m)`);
    // a wild horse does not come
    const { A: B } = fakeGame([0, 0]);
    const w = B._spawn('horse', new THREE.Vector3(25, 0.5, 0));
    run(B, 25);
    assert.ok(Math.hypot(w.group.position.x, w.group.position.z) > 9, 'a wild horse does not walk up to me');
    void g;
}));

test('guests see the head down / lying (pose in the net snapshot)', () => {
    const { g, A } = fakeGame();
    const sent = [];
    g.sync = { animals: (l) => sent.push(l) };
    const a = A._spawn('cow', new THREE.Vector3(0, 0.5, 0));
    a.idle = 'rest'; a.idleT = 100;
    run(A, 1);
    const row = sent.at(-1).find((r) => r[0] === a.id);
    assert.equal(row[14], 2, 'lying is sent');
    const { g: g2, A: G } = fakeGame();
    g2.authority = false;
    G.applyNet(sent.at(-1));
    const b = G.byId.get(a.id);
    run(G, 3);
    assert.ok(b.lie > 0.9, 'the guest sees it lying');
});
