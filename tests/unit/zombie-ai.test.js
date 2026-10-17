// Zombies (src/entities/Zombie.js + Game._updateZombies): they walk face first (never backwards — the old
// lookAt + zeroed x/z turned a zombie going −Z round to +Z), their legs step from the hips with the ground covered and
// their feet are on the ground (not 0.3 m over it), they come up close, turn, swing and hit (also in «Выживание»,
// where they used to never bite), two of them don't stick together, and by day the sun burns them.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../../src/game/Game.js';
import { Zombie, ZOMBIE } from '../../src/entities/Zombie.js';
import { ZombieSpawn, ZSPAWN, lightLevel } from '../../src/game/ZombieSpawn.js';

const GROUND = -0.5;
const dt = 1 / 60;

/** A tiny game: flat ground, one player, the real zombie loop of Game. */
function fakeGame({ mode = 'freeworld', night = 1, sky = 1 } = {}) {
    const hits = [];
    const g = Object.create(Game.prototype);
    Object.assign(g, {
        net: null, config: { mode }, dayCycle: true, world: { nightAmount: night }, frameCount: 0,
        scene: new THREE.Scene(), zombies: [], zombieById: new Map(), nextZombieId: 1, remotes: new Map(),
        isDeadLocal: false, camera: null, knockback: new THREE.Vector3(),
        character: { group: { position: new THREE.Vector3(0, GROUND + 2, 0), rotation: { y: 0 } } },
        collision: { groundY: () => GROUND, resolveCylinder() {} },
        terrain: { data: { skyAt: () => sky, floorBelow: () => 0, get: () => 0 } },
        combat: { enabled: mode === 'freeworld', dead: false, damage: (n, by, kind) => hits.push({ n, kind }) },
        servants: { enemyFor: () => null }, sound: null, fx: null, sync: null,
        hud: { update() {}, damageFlash() {} }, playerHP: 10,
    });
    g.zombieSpawn = new ZombieSpawn(g);
    g.hits = hits;
    g.run = (s) => { for (let i = 0; i < s / dt; i++) { g.frameCount++; g._updateZombies(dt); } };
    return g;
}

test('a zombie walks face first, also when it must turn round; its steps follow the ground covered', () => {
    for (const [tx, tz] of [[0, -12], [-9, -9], [10, 3], [-4, 11]]) {
        const g = fakeGame();
        g.character.group.position.set(tx, GROUND + 2, tz);
        const z = g._createZombie(new THREE.Vector3(0, GROUND + 1, 0));
        const p0 = z.group.position.clone();
        let backward = 0, cycle0 = z.walkCycle;
        for (let i = 0; i < 120; i++) {
            const before = z.group.position.clone();
            g.frameCount++; g._updateZombies(dt);
            const step = z.group.position.clone().sub(before).setY(0);
            if (step.length() > 1e-4) {
                const face = new THREE.Vector3(0, 0, 1).applyQuaternion(z.group.quaternion);
                if (face.dot(step.normalize()) < 0.5) backward++;
            }
        }
        assert.equal(backward, 0, `never sideways/backwards to (${tx}, ${tz})`);
        const face = new THREE.Vector3(0, 0, 1).applyQuaternion(z.group.quaternion);
        const to = new THREE.Vector3(tx, 0, tz).sub(z.group.position).setY(0).normalize();
        assert.ok(face.dot(to) > 0.95, `faces the player (${face.dot(to).toFixed(2)})`);
        const walked = z.group.position.clone().sub(p0).setY(0).length();
        assert.ok(walked > 1.5 && walked < ZOMBIE.SPEED * 2 + 0.01, `slow, steady (${walked.toFixed(2)} m in 2 s)`);
        // the legs: one cycle per STRIDE walked
        assert.ok(Math.abs((z.walkCycle - cycle0) - (walked / ZOMBIE.STRIDE) * Math.PI * 2) < 0.6, 'steps in time with the walk');
    }
});

test('its feet are on the ground (the legs hang from the hips)', () => {
    const g = fakeGame();
    const z = g._createZombie(new THREE.Vector3(0, GROUND + 1, 0));
    g.run(0.1);
    z.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(z.leftLeg);
    assert.ok(Math.abs(box.min.y - GROUND) < 0.08, `foot at ${box.min.y.toFixed(2)}, ground ${GROUND}`);
    z.setDummy(); z.group.position.y = GROUND + z.gOff; z.group.updateMatrixWorld(true);
    assert.ok(Math.abs(new THREE.Box3().setFromObject(z.leftLeg).min.y - GROUND) < 0.1, 'the dummy too');
});

test('it comes up close, turns and strikes: the blow hurts the player («Выживание»); stepping back — missed', () => {
    const g = fakeGame();
    g.character.group.position.set(0, GROUND + 2, -7); // (behind its back: it must turn first)
    const z = g._createZombie(new THREE.Vector3(0, GROUND + 1, 0));
    let attacked = false;
    for (let i = 0; i < 8 / dt; i++) { g.frameCount++; g._updateZombies(dt); attacked ||= z.isAttacking; }
    assert.ok(attacked, 'it swings');
    assert.ok(g.hits.length >= 3, `hits (${g.hits.length} in 8 s)`);
    assert.equal(g.hits[0].kind, 'zombie');
    const d = Math.hypot(z.group.position.x, z.group.position.z + 7);
    assert.ok(d >= ZOMBIE.STOP - 0.1 && d < ZOMBIE.REACH, `stands close (${d.toFixed(2)} m)`);
    // the swing lands only at the end of it: who steps back in time is missed
    const n = g.hits.length;
    z.attackCd = 0; z.isAttacking = false;
    g.run(0.1); // (the arms go up)
    assert.ok(z.isAttacking);
    g.character.group.position.z -= 3;
    for (let i = 0; i < (ZOMBIE.SWING * 0.6) / dt; i++) { g.frameCount++; g._updateZombies(dt); }
    assert.equal(g.hits.length, n, 'missed');
});

test('a zombie turned away does not strike (face to the target first)', () => {
    const z = new Zombie(new THREE.Scene(), new THREE.Vector3(0, GROUND + 1, 0), 1);
    z.yaw = z.group.rotation.y = Math.PI; // (its back to +Z)
    assert.equal(z.reaches(new THREE.Vector3(0, GROUND + 2, 1.5)), false);
    z.yaw = z.group.rotation.y = 0;
    assert.equal(z.reaches(new THREE.Vector3(0, GROUND + 2, 1.5)), true);
});

test('«Хардкор» bites too; «Творческий»: it swings but nobody is hurt', () => {
    const h = fakeGame({ mode: 'survival' });
    h.character.group.position.set(0, GROUND + 2, 4);
    h._createZombie(new THREE.Vector3(0, GROUND + 1, 0));
    h.run(4);
    assert.ok(h.playerHP < 10, `Хардкор: ${h.playerHP}`);
    const c = fakeGame({ mode: 'creative' });
    c.character.group.position.set(0, GROUND + 2, 4);
    const z = c._createZombie(new THREE.Vector3(0, GROUND + 1, 0));
    let swung = false;
    for (let i = 0; i < 4 / dt; i++) { c.frameCount++; c._updateZombies(dt); swung ||= z.isAttacking; }
    assert.ok(swung && c.playerHP === 10);
});

test('two zombies after one player do not stick together', () => {
    const g = fakeGame();
    g.character.group.position.set(0, GROUND + 2, 15);
    const a = g._createZombie(new THREE.Vector3(0, GROUND + 1, 0));
    const b = g._createZombie(new THREE.Vector3(0.2, GROUND + 1, -0.3));
    g.run(10);
    const d = Math.hypot(a.group.position.x - b.group.position.x, a.group.position.z - b.group.position.z);
    assert.ok(d > 1.0, `apart (${d.toFixed(2)} m)`);
    for (const z of [a, b]) assert.ok(Math.hypot(z.group.position.x, z.group.position.z - 15) < 3.2, 'both reached the player');
});

test('the sun: by day in the open (a tree\'s light shade too) a zombie burns to ash; at night, in a cave — no', () => {
    const day = fakeGame({ night: 0, sky: 1 });
    day.character.group.position.set(0, GROUND + 2, 40);
    const z = day._createZombie(new THREE.Vector3(0, GROUND + 1, 0));
    day.run(1);
    assert.ok(z.burning > 0, 'it smokes');
    day.run(12);
    assert.ok(z.isDead, 'burnt down');
    for (const [night, sky] of [[1, 1], [0, 0.05]]) {
        const g = fakeGame({ night, sky });
        g.character.group.position.set(0, GROUND + 2, 40);
        const q = g._createZombie(new THREE.Vector3(0, GROUND + 1, 0));
        g.run(10);
        assert.ok(!q.isDead && !(q.burning > 0), `night ${night}, sky ${sky}`);
    }
});

test('no zombie comes out in a light daytime shade (a few blocks under a roof, a tree\'s crown)', () => {
    // skyFactor: 0.8 per block from the open air — 3 blocks in: 0.51, 6: 0.26 — still daylight
    for (const sky of [1, 0.8, 0.51, 0.26, 0.17]) assert.ok(lightLevel(sky, 0) > ZSPAWN.DARK, `${sky} is no darkness`);
    assert.ok(lightLevel(0.08, 0) <= ZSPAWN.DARK, 'deep in a cave: dark');
    assert.ok(lightLevel(0.7, 1) <= ZSPAWN.DARK, 'a shade at night: dark');
});

test('a night zombie out on the open ground (45 m off) shambles up, notices the player and hits him within a minute', () => {
    const g = fakeGame();
    const z = g._createZombie(new THREE.Vector3(30, GROUND + 1, 34));
    let t = 0;
    while (!g.hits.length && t < 60) { g.frameCount++; g._updateZombies(dt); t += dt; }
    assert.ok(g.hits.length, `hit after ${t.toFixed(0)} s (at ${Math.hypot(z.group.position.x, z.group.position.z).toFixed(1)} m)`);
    assert.ok(z.hunting);
});

test('nobody near: it wanders slowly (not standing like a post), does not hunt; a blow wakes it', () => {
    const g = fakeGame();
    g.character.group.position.set(300, GROUND + 2, 0);
    const z = g._createZombie(new THREE.Vector3(0, GROUND + 1, 0));
    let path = 0, prev = z.group.position.clone();
    for (let i = 0; i < 30 / dt; i++) { g.frameCount++; g._updateZombies(dt); path += z.group.position.distanceTo(prev); prev.copy(z.group.position); }
    assert.ok(path > 3, `it roams (${path.toFixed(1)} m in 30 s)`);
    assert.ok(Math.hypot(z.group.position.x, z.group.position.z) < 15, 'round where it came out');
    assert.ok(!z.hunting);
    g.character.group.position.set(z.group.position.x + 20, GROUND + 2, z.group.position.z);
    z.hunting = true; // (what damageZombie sets)
    g.run(3);
    assert.ok(Math.hypot(g.character.group.position.x - z.group.position.x, g.character.group.position.z - z.group.position.z) < 16, 'after the player now');
});

test('a wall in its way: it goes round, it does not push into it', () => {
    const g = fakeGame();
    g.character.group.position.set(0, GROUND + 2, 9);
    g.collision.pointBlocked = (x, y, z) => Math.abs(x) < 3 && z > 3.5 && z < 4.5 && y < GROUND + 4; // (a wall 6 m wide)
    const z = g._createZombie(new THREE.Vector3(0.3, GROUND + 1, 0));
    let inWall = 0;
    for (let i = 0; i < 25 / dt && !g.hits.length; i++) {
        g.frameCount++; g._updateZombies(dt);
        const p = z.group.position;
        if (Math.abs(p.x) < 3 && p.z > 3.4 && p.z < 4.6) inWall++;
    }
    assert.equal(inWall, 0, 'never in the wall');
    assert.ok(g.hits.length, `round it and at the player (at ${z.group.position.x.toFixed(1)}, ${z.group.position.z.toFixed(1)})`);
});
