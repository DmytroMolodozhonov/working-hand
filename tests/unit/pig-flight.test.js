import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Animals, HERDS } from '../../src/game/Animals.js';
import { FLY, pickMigration, flockSlot } from '../../src/game/PigFlight.js';
import { animalModel, animateWings } from '../../src/game/AnimalModels.js';

/**
 * Pigs with wings on a fake meadow (no browser): frightened → take off → fly → land
 * somewhere else; never through a hill; migration to a far place; hit in the air → fall.
 */
function fakeGame(ground = () => 0) {
    const scene = new THREE.Scene();
    const g = {
        config: { mode: 'survival' }, authority: true, localId: 'me', scene,
        character: { group: new THREE.Group(), isCrouching: false },
        collision: { groundY: ground, resolveCylinder() {} },
        remotes: new Map(), fx: { spark() {} }, hud: { setVoice() {} },
        isDeadLocal: false, currentPose: null, combat: { enabled: false, dead: false },
        knockback: { add() {} }, damageLocalPlayer() {},
    };
    g.character.group.position.set(-150, 1.5, -150); // (standing far off: nobody frightens them)
    HERDS.GONE = 1e9; // (the fake player sees everything: no herd is taken away for being far)
    const A = new Animals(g);
    A.enabled = true;
    A._spawnT = 1e9; A._treeT = 1e9; A._migT = 1e9;
    return { g, A };
}

function seeded(seed, fn) {
    const rnd = Math.random;
    let x = seed >>> 0;
    Math.random = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
    try { return fn(); } finally { Math.random = rnd; }
}

function run(A, secs, each, dt = 1 / 30) {
    const n = Math.round(secs / dt);
    for (let i = 0; i < n; i++) { A.update(dt); if (each && each(i * dt) === false) return; }
}

const flat = (pos) => ({ x: pos.x, z: pos.z });

test('a hit pig takes off, flies away, comes down somewhere safe and folds its wings', () => seeded(3, () => {
    // a hill on the way (x 12…20, 9 m high): it flies over it, never into it
    const ground = (x) => (x > 12 && x < 20 ? 9 : 0);
    const { g, A } = fakeGame(ground);
    const pig = A._spawn('pig', new THREE.Vector3(0, 0.5, 0), { yaw: Math.PI / 2 });
    A.hit(pig, 1, new THREE.Vector3(1, 0, 0), 'me');
    pig.state = 'flee'; // (not the 15% that fight back)
    g.character.group.position.set(-6, 1.5, 0); // (the one who hit it stands behind: it flies off +x)
    const start = flat(pig.group.position);
    let maxH = 0, codes = new Set(), wingsOpen = 0, under = Infinity, landedAt = null, tookOff = false;
    run(A, 40, (t) => {
        const p = pig.group.position;
        if (pig.fly) {
            tookOff = true;
            maxH = Math.max(maxH, p.y - ground(p.x));
            under = Math.min(under, p.y - FLY.BASE - ground(p.x));
            wingsOpen = Math.max(wingsOpen, pig.wingOpen);
        }
        codes.add(pig.flyCode & 7);
        if (tookOff && !pig.fly && !landedAt) landedAt = { t, x: p.x, z: p.z, y: p.y };
        if (landedAt && t > landedAt.t + 3) return false;
    });
    assert.ok(tookOff, 'it took off');
    assert.ok(maxH > 6, `it flew up high (${maxH.toFixed(1)} m)`);
    assert.ok(under > -0.05, `never below the ground under it (${under.toFixed(2)})`);
    assert.ok(codes.has(1) && codes.has(3), `beat its wings and spread them to land (${[...codes]})`);
    assert.ok(wingsOpen > 0.9, 'the wings were spread in flight');
    assert.ok(landedAt, 'it came down');
    const far = Math.hypot(landedAt.x - start.x, landedAt.z - start.z);
    assert.ok(far > 25, `it flew off a good distance (${far.toFixed(1)} m)`);
    assert.ok(Math.abs(landedAt.y - (ground(landedAt.x) + 0.5)) < 0.2, 'on its feet on the ground');
    assert.ok(pig.wingOpen < 0.15, `wings folded after landing (${pig.wingOpen.toFixed(2)})`);
    assert.equal(pig.state, 'graze');
}));

test('the herd flies off with a frightened pig and lands at one place (each at its own spot)', () => seeded(5, () => {
    const { A } = fakeGame();
    const herd = A.spawnHerdAt('pig', 4, 0, 0);
    A.hit(herd[0], 1, new THREE.Vector3(1, 0, 0), 'me');
    herd[0].state = 'flee';
    let flew = new Set();
    run(A, 45, () => { for (const a of herd) if (a.fly) flew.add(a.id); if (flew.size === herd.length && herd.every((a) => !a.fly)) return false; });
    assert.ok(flew.size >= 3, `most of the herd took off (${flew.size})`);
    const ps = herd.filter((a) => flew.has(a.id)).map((a) => a.group.position);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const d = Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z);
        assert.ok(d < 30, `landed together (${d.toFixed(1)} m apart)`);
        assert.ok(d > 0.8, 'not on top of each other');
    }
}));

test('a pig hit in the air folds its wings and falls; killed in the air it falls dead to the ground', () => seeded(9, () => {
    const { A } = fakeGame();
    const pig = A._spawn('pig', new THREE.Vector3(0, 0.5, 0));
    pig.state = 'flee'; pig.scareFrom = { x: -5, z: 0 };
    run(A, 12, () => (pig.fly && pig.group.position.y > 8 ? false : undefined));
    assert.ok(pig.fly && pig.group.position.y > 8, 'it is up in the air');
    const y0 = pig.group.position.y;
    A.hit(pig, 1, new THREE.Vector3(0, 0, 1), 'me');
    assert.equal(pig.fly, null, 'no longer flying');
    let minY = y0, wing = 1;
    run(A, 1.2, () => { minY = Math.min(minY, pig.group.position.y); wing = Math.min(wing, pig.wingOpen); });
    assert.ok(y0 - minY > 4, `it fell (${(y0 - minY).toFixed(1)} m)`);
    assert.ok(wing < 0.3, `wings folded while falling (${wing.toFixed(2)})`);

    // Stupefy / ice in the air: stunned — it falls too
    const p2 = A._spawn('pig', new THREE.Vector3(30, 0.5, 0));
    p2.state = 'flee'; p2.scareFrom = { x: 25, z: 0 };
    run(A, 12, () => (p2.fly && p2.group.position.y > 8 ? false : undefined));
    p2.stunT = 3;
    run(A, 0.2);
    assert.equal(p2.fly, null, 'stunned: it drops');

    // killed in the air: it doesn't jump to the ground, it falls there
    const p3 = A._spawn('pig', new THREE.Vector3(-30, 0.5, 0));
    p3.state = 'flee'; p3.scareFrom = { x: -35, z: 0 };
    run(A, 12, () => (p3.fly && p3.group.position.y > 8 ? false : undefined));
    const yk = p3.group.position.y;
    A.hit(p3, 99, null, 'me');
    assert.ok(p3.dead && p3.group.position.y > yk - 1, 'dead, still up there for a moment');
    run(A, 4);
    assert.ok(p3.group.position.y < 1.2, `dead on the ground (${p3.group.position.y.toFixed(2)})`);
}));

test('a pig high up that comes to itself opens its wings and flies on (let go from Leviosa)', () => seeded(11, () => {
    const { A } = fakeGame();
    const pig = A._spawn('pig', new THREE.Vector3(0, 30, 0));
    A.push(pig, new THREE.Vector3(0, 0, 0), 0.5);
    pig.airborne = true;
    let flew = false;
    run(A, 3, () => { if (pig.fly) flew = true; });
    assert.ok(flew, 'it flies again');
    assert.ok(pig.group.position.y > 10, `it did not crash (${pig.group.position.y.toFixed(1)})`);
}));

test('migration: a new place far away, the way going over the player', () => {
    for (let s = 1; s < 40; s++) seeded(s, () => {
        const from = { x: 0, z: 0 }, me = { x: 40 + Math.random() * 80, z: (Math.random() - 0.5) * 80 };
        const to = pickMigration(from, me);
        const d = Math.hypot(to.x, to.z);
        assert.ok(d >= FLY.MIG_DIST[0], `far (${d.toFixed(0)} m)`);
        // the distance from the player to the way (the segment from → to)
        const ux = to.x / d, uz = to.z / d, along = me.x * ux + me.z * uz;
        const off = Math.abs(me.x * uz - me.z * ux);
        assert.ok(along > 0 && along < d, 'the player is along the way');
        assert.ok(off < 0.3 * Math.hypot(me.x, me.z) + 1, `it passes near the player (${off.toFixed(0)} m off)`);
    });
    const same = pickMigration({ x: 5, z: 5 }, { x: 5, z: 5 }, () => 0.3);
    assert.ok(Math.hypot(same.x - 5, same.z - 5) >= FLY.MIG_DIST[0]);
    // a loose V: left and right, farther back for each rank
    const slots = [1, 2, 3, 4, 5, 6].map((i) => flockSlot(i, () => 0.5));
    assert.ok(slots[0][0] > 0 && slots[1][0] < 0 && slots[4][1] > slots[0][1]);
});

test('migration: the herd flies high in a V behind its leader and lands far away; its home moves there', () => seeded(21, () => {
    const { g, A } = fakeGame();
    g.character.group.position.set(60, 1.5, 0);
    const herd = A.spawnHerdAt('pig', 5, 0, 0);
    const h = herd[0].herd;
    const flock = A.migrate({ herd: h });
    assert.ok(flock && flock.length === 5);
    const leader = flock[0];
    assert.ok(flock.every((a) => a.fly?.kind === 'migrate'));
    assert.ok(flock.slice(1).every((a) => a.fly.lead === leader.id && a.fly.slot), 'the others follow the leader');
    let maxY = 0, behind = 0, samples = 0;
    run(A, 80, () => {
        maxY = Math.max(maxY, leader.group.position.y);
        if (leader.fly?.mode === 'cruise' && leader.group.position.y > 30) {
            const f = new THREE.Vector3(-Math.sin(leader.group.rotation.y), 0, -Math.cos(leader.group.rotation.y));
            for (const a of flock.slice(1)) { samples++; if (f.dot(new THREE.Vector3().subVectors(a.group.position, leader.group.position).setY(0)) < 0) behind++; }
        }
        if (flock.every((a) => !a.fly)) return false;
    });
    assert.ok(maxY > 35, `high over the world (${maxY.toFixed(0)} m)`);
    assert.ok(samples > 20 && behind / samples > 0.8, `the flock behind its leader (${behind}/${samples})`);
    assert.ok(flock.every((a) => !a.fly), 'all landed');
    for (const a of flock) assert.ok(Math.hypot(a.group.position.x, a.group.position.z) > 120, 'far from where they lived');
    assert.ok(Math.hypot(h.hx, h.hz) > 120, 'the herd lives there now');
}));

test('migration from far away: a flock appears high up and flies over', () => seeded(31, () => {
    const { g, A } = fakeGame();
    g.character.group.position.set(0, 1.5, 0);
    const flock = A.migrate({ spawn: true });
    assert.ok(flock && flock.length >= 4);
    for (const a of flock) {
        assert.ok(a.group.position.y > 35, 'high up');
        assert.ok(Math.hypot(a.group.position.x, a.group.position.z) > 130, 'far away');
        assert.equal(a.flyCode & 7, 1);
    }
    let closest = Infinity;
    run(A, 40, () => { closest = Math.min(closest, Math.hypot(flock[0].group.position.x, flock[0].group.position.z)); });
    assert.ok(closest < 60, `it flew over the player (${closest.toFixed(0)} m)`);
}));

test('the save keeps where a pig herd ended up (one in flight: where it was flying to)', () => seeded(41, () => {
    const { A } = fakeGame();
    const herd = A.spawnHerdAt('pig', 3, 50, 50);
    herd[0].state = 'flee'; herd[0].scareFrom = { x: 45, z: 50 };
    run(A, 2);
    assert.ok(herd[0].fly);
    const to = { x: herd[0].fly.tx, z: herd[0].fly.tz };
    const snap = A.snapshot();
    assert.equal(snap.filter((s) => s.type === 'pig').length, 3);
    const { A: B } = fakeGame();
    B.restore(JSON.parse(JSON.stringify(snap)));
    const back = B.byId.get(herd[0].id);
    assert.ok(back && Math.hypot(back.group.position.x - to.x, back.group.position.z - to.z) < 0.01, 'on the ground where it was going');
    assert.ok(Math.abs(back.group.position.y - 0.5) < 0.01);
    assert.equal(back.color, herd[0].color, 'the same look');
    const mates = B.list.filter((a) => a.herd === back.herd);
    assert.equal(mates.length, 3, 'one herd again');
}));

test('pig model: wings folded along the sides, spread wide in flight; looks differ, shapes shared', () => {
    const g = animalModel('pig', 1);
    const w = g.userData.wings;
    assert.equal(w.length, 2);
    const box = () => { g.updateMatrixWorld(true); const b = new THREE.Box3(); g.traverse((o) => { if (o.isMesh) { const P = o.geometry.getAttribute('position'), M = o.geometry.morphAttributes.position, k = o.morphTargetInfluences || []; const v = new THREE.Vector3(); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); if (M) for (let j = 0; j < M.length; j++) { v.x += M[j].getX(i) * (k[j] || 0); v.y += M[j].getY(i) * (k[j] || 0); v.z += M[j].getZ(i) * (k[j] || 0); } b.expandByPoint(v.applyMatrix4(o.matrixWorld)); } } }); return b; };
    animateWings(g, 0);
    const folded = box();
    assert.ok(folded.max.x - folded.min.x < 0.95, `folded: narrow (${(folded.max.x - folded.min.x).toFixed(2)})`);
    animateWings(g, 1, 0, 0);
    const spread = box();
    assert.ok(spread.max.x - spread.min.x > 2.4, `spread: a wide span (${(spread.max.x - spread.min.x).toFixed(2)})`);
    assert.ok(Math.abs(spread.max.x + spread.min.x) < 0.02, 'both wings alike');
    animateWings(g, 1, 0.8, 0);
    assert.ok(box().max.y > spread.max.y + 0.4, 'a beat raises them');
    const b = animalModel('pig', 3);
    assert.notEqual(b.userData.body.material, g.userData.body.material, 'another look');
    assert.equal(b.userData.body.geometry, g.userData.body.geometry, 'the same shape');
    assert.ok(g.userData.body.material.map, 'skin has a picture (not plain plastic)');
});
