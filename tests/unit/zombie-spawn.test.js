// Zombies come out of the dark (src/game/ZombieSpawn.js): in caves (by day too), on the open ground
// only at night, never by a light nor under a player's nose, never too many; which modes.
// Also: phoenixes don't pile up as a player walks on (Phoenixes._spawnTick).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TerrainData } from '../../src/world/Terrain.js';
import { ZombieSpawn, ZSPAWN, lightLevel, litAt } from '../../src/game/ZombieSpawn.js';
import { Phoenixes, PHOENIX } from '../../src/game/Phoenixes.js';

const t = new TerrainData();
t.generate({ seed: 7, mountains: true, seas: true, deepCaves: true });

function fakeGame(pos, { mode = 'freeworld', night = 0, zombieCount = 0 } = {}) {
    const g = {
        authority: true, config: { mode, zombieCount }, dayCycle: true, world: { nightAmount: night },
        terrain: { data: t }, character: { group: { position: pos } }, remotes: new Map(), zombies: [],
        _createZombie(p) { const z = { group: { position: p.clone() }, isDead: false }; g.zombies.push(z); return z; },
        removeZombie(z) { g.zombies.splice(g.zombies.indexOf(z), 1); },
    };
    g.zombieSpawn = new ZombieSpawn(g);
    return g;
}

// a player deep in a cave system (in a tunnel's middle) and one on a meadow far from any cave
const sys = t.cavesNear(0, 0, 700).find((s) => s.segs?.length > 30);
const seg = sys.segs[Math.floor(sys.segs.length / 2)];
const inCave = new THREE.Vector3(seg.bx, seg.by, seg.bz);
let meadow = null;
for (let k = 0; k < 3600 && !meadow; k++) {
    const x = -1500 + (k % 60) * 53, z = -1500 + Math.floor(k / 60) * 51;
    if (!t.cavesNear(x, z, ZSPAWN.CAVE_NEAR + 20).length && !t.isSeaColumn(x, z) && !t.sites?.landAt(x, z)) meadow = new THREE.Vector3(x, t.surfaceY(x, z), z);
}

test('light: the open sky by day is lit, the night and a cave are dark; a light makes a place lit', () => {
    assert.ok(lightLevel(1, 0) > ZSPAWN.DARK);
    assert.ok(lightLevel(1, 1) <= ZSPAWN.DARK, 'the night is dark');
    assert.ok(lightLevel(0.05, 0) <= ZSPAWN.DARK, 'a cave is dark by day');
    assert.ok(litAt([{ x: 0, y: 0, z: 0 }], 5, 0, 5) && !litAt([{ x: 0, y: 0, z: 0 }], 30, 0, 0));
});

test('in a cave, by day: zombies do come — in the dark, not under the nose', () => {
    const g = fakeGame(inCave);
    const made = [];
    for (let i = 0; i < 20; i++) { const z = g.zombieSpawn.trySpawn(inCave, [inCave], [], true); if (z) { made.push(z); g.zombies.length = 0; } } // (one at a time: each check alone)
    assert.ok(made.length >= 10, `they come (${made.length}/20)`);
    for (const z of made) {
        const p = z.group.position;
        assert.ok(Math.hypot(p.x - inCave.x, p.y - 1 - inCave.y, p.z - inCave.z) >= ZSPAWN.MIN_D - 1, 'not under the nose'); // (its feet 1 m under its origin)
        assert.ok(lightLevel(t.skyAt(p.x, p.y - 1, p.z), 0) <= ZSPAWN.DARK, 'in the dark');
        assert.equal(z.fromDark, 'cave');
    }
    // the first time near a cave: one comes at once (no luck needed)
    let first = 0;
    for (let i = 0; i < 10; i++) if (fakeGame(inCave).zombieSpawn.trySpawn(inCave, [inCave], [])) first++;
    assert.ok(first >= 8, `the first meeting (${first}/10)`);
});

test('a light (a campfire, «Люмос») keeps them off', () => {
    const g = fakeGame(inCave);
    const lights = [{ x: inCave.x, y: inCave.y, z: inCave.z, r: 200 }];
    for (let i = 0; i < 10; i++) assert.equal(g.zombieSpawn.trySpawn(inCave, [inCave], lights, true), null);
});

test('on a meadow: none by day, now and then at night (far off)', () => {
    assert.ok(meadow, 'a meadow far from caves');
    const day = fakeGame(meadow);
    for (let i = 0; i < 10; i++) assert.equal(day.zombieSpawn.trySpawn(meadow, [meadow], [], true), null, 'not by day');
    const night = fakeGame(meadow, { night: 1 });
    let n = 0;
    for (let i = 0; i < 10; i++) { const z = night.zombieSpawn.trySpawn(meadow, [meadow], [], true); if (z) { n++; night.zombies.length = 0; assert.ok(Math.hypot(z.group.position.x - meadow.x, z.group.position.z - meadow.z) >= ZSPAWN.NIGHT_D[0] - 1); } }
    assert.ok(n >= 5, `at night (${n}/10)`);
});

test('never too many round a player; far ones go back into the dark; the modes', () => {
    const g = fakeGame(inCave);
    for (let s = 0; s < 1200; s++) g.zombieSpawn.update(1); // 20 minutes in the cave
    assert.ok(g.zombies.length >= 2 && g.zombies.length <= ZSPAWN.NEAR_CAP, `${g.zombies.length}`);
    g.character.group.position = new THREE.Vector3(inCave.x + 1000, 0, inCave.z);
    g.zombieSpawn.update(0.1);
    assert.equal(g.zombies.length, 0, 'gone when everybody is far');
    assert.ok(fakeGame(inCave, { mode: 'freeworld' }).zombieSpawn.enabled);
    assert.ok(fakeGame(inCave, { mode: 'creative', zombieCount: 3 }).zombieSpawn.enabled);
    assert.ok(!fakeGame(inCave, { mode: 'creative', zombieCount: 0 }).zombieSpawn.enabled, 'Creative without zombies');
    assert.ok(!fakeGame(inCave, { mode: 'survival' }).zombieSpawn.enabled, 'Хардкор: its own hordes');
});

test('phoenixes: rare, and they never pile up as a player walks on', () => {
    assert.ok(PHOENIX.SPAWN_CHANCE <= 0.15 && PHOENIX.MAX <= 2);
    const g = { authority: true, config: { mode: 'freeworld' }, remotes: new Map(), scene: null };
    const ph = new Phoenixes(g);
    const P = { id: 'me', pos: new THREE.Vector3() };
    ph._players = () => [P];
    for (let s = 0; s < 4 * 3600; s += 5) { P.pos.x += 5 * 4; ph._spawnTick(5); for (const f of [...ph.list]) if (f.model.position.distanceTo(P.pos) > PHOENIX.FORGET) ph._remove(f); }
    assert.ok(ph.list.length <= 1, `${ph.list.length}`);
    // a phoenix that flew off out of the player's area (but is still in the world) keeps another away
    ph.list.length = 0;
    ph.spawn(new THREE.Vector3(PHOENIX.AREA + 50, 50, 0));
    P.pos.set(0, 0, 0);
    for (let s = 0; s < 3600; s += 5) ph._spawnTick(5);
    assert.equal(ph.list.length, 1);
});

test('the open ground: no new zombie by day at all; at night one at a time, much later each, never side by side', () => {
    const day = fakeGame(meadow);
    for (let s = 0; s < 600; s++) day.zombieSpawn.update(1); // (10 minutes of day)
    assert.equal(day.zombies.length, 0, 'by day: none');
    const night = fakeGame(meadow, { night: 1 });
    const at = [];
    for (let s = 0; s < 360; s++) { const n = night.zombies.length; night.zombieSpawn.update(1); if (night.zombies.length > n) at.push(s); } // (a 6-minute night)
    assert.ok(at.length >= 1 && at.length <= 5, `a few a night (${at.length})`);
    for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= ZSPAWN.GAP[0] - 1, 'one at a time, the next much later');
    const zs = night.zombies;
    for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) assert.ok(zs[i].group.position.distanceTo(zs[j].group.position) >= ZSPAWN.APART - 1, 'not in a group');
});

test('never where a player has been (nor in the part of a cave the hero has seen), never where a player looks', () => {
    const g = fakeGame(inCave);
    let n = 0;
    for (let i = 0; i < 30; i++) {
        const z = g.zombieSpawn.trySpawn(inCave, [inCave], [], true);
        if (!z) continue;
        const p = z.group.position;
        assert.ok(!g.zombieSpawn.beenAt(p.x, p.y - 1, p.z), 'not in a cell already walked');
        g.zombieSpawn.markBeen(p.x, p.y, p.z); // (as if a player had gone there)
        g.zombies.length = 0; n++;
    }
    assert.ok(n >= 3, `still elsewhere (${n})`);
    // the hero's cave map: what he saw there is no place either
    const m = fakeGame(inCave);
    const seen = new Set();
    m.caveMap = { has: (x, z) => seen.has(Math.floor(x / 4) + ',' + Math.floor(z / 4)) };
    for (let i = 0; i < 20; i++) { const z = m.zombieSpawn.trySpawn(inCave, [inCave], [], true); if (!z) continue; const p = z.group.position; assert.ok(!seen.has(Math.floor(p.x / 4) + ',' + Math.floor(p.z / 4))); seen.add(Math.floor(p.x / 4) + ',' + Math.floor(p.z / 4)); m.zombies.length = 0; }
    // in sight: nothing between and in front of the eyes — no zombie comes out there
    const v = fakeGame(meadow, { night: 1 });
    v.collision = { lineOfSight: () => true };
    v.camera = { position: meadow, quaternion: new THREE.Quaternion() }; // (looking along −Z)
    let out = 0;
    for (let i = 0; i < 30; i++) {
        const z = v.zombieSpawn.trySpawn(meadow, [meadow], [], true);
        if (!z) continue;
        out++;
        const d = z.group.position.clone().sub(meadow);
        assert.ok(-d.z / d.length() <= ZSPAWN.LOOK_COS + 0.05, 'out of sight: behind or to the side');
        v.zombies.length = 0;
    }
    assert.ok(out >= 5, `behind his back they still come (${out})`);
});
