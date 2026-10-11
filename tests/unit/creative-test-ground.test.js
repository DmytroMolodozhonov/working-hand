import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, TEST_RIVER, TEST_CAVE } from '../../src/world/Terrain.js';

/**
 * A creative world (generation 3) has a test ground by the pedestals: a river just past them,
 * a hill with a cave to the left, and a sea castle (village, port, the sea) close by.
 * The pedestals stay on dry flat ground; other worlds are unchanged.
 */
const make = (test, seed = 12345) => { const d = new TerrainData(); d.generate({ seed, mountains: true, seas: true, test }); return d; };

test('creative test ground: a river right past the pedestals, which stay dry and flat, clear of any village', () => {
    const d = make(true), H = d.heightAt;
    for (let x = -20; x <= 30; x += 2) {
        let wet = false;
        for (let z = -26; z >= -42; z--) { H(x, z); if (H.water) { wet = true; break; } }
        assert.ok(wet, `water in front at x=${x}`);
    }
    assert.ok(Math.abs(TEST_RIVER.Z) - TEST_RIVER.WIND - TEST_RIVER.HALF > 22, 'not on the pedestals');
    for (let x = -16; x <= 25; x++) for (let z = -21; z <= 3; z++) {
        assert.equal(H(x, z), 0, `flat at ${x},${z}`);
        assert.equal(H.water, 0, `dry at ${x},${z}`);
        assert.equal(d.sites.landAt(x, z), null, `no village at ${x},${z}`);
    }
});

test('creative test ground: a sea castle close by — its village starts ~60 m out, the sea right behind its port', () => {
    for (const seed of [12345, 7, 99991]) {
        const d = make(true, seed), H = d.heightAt;
        const c = d.castles.near(0, 0, 400).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        assert.ok(c && c.port, `a sea castle (seed ${seed})`);
        assert.ok(Math.hypot(c.x, c.z) < 420, `close by: ${Math.round(Math.hypot(c.x, c.z))} m`);
        // (its flat land from ~60 m out; the slope round it from ~34 m — past the pedestals and the river's near bank)
        for (let x = -60; x <= 30; x += 5) for (let z = -60; z <= 40; z += 5) assert.equal(d.sites.landAt(x, z), null, `no village at ${x},${z}`);
        for (let x = 30; x <= 60; x += 5) for (let z = -28; z <= 40; z += 5) assert.equal(d.sites.landAt(x, z), null, `no village at ${x},${z}`);
        const l = d.sites.landAt(Math.round(c.x), Math.round(c.z));
        assert.ok(l && l.w >= 1 && Math.min(Math.abs(c.x), Math.abs(c.z)) < 200, 'its land round it');
        // the sea: past the castle (−z), deep
        let sea = 0;
        for (let x = c.x - 150; x <= c.x + 150; x += 30) { H(x, c.z - 260); if (H.sea) sea++; }
        assert.ok(sea >= 8, `the sea behind the castle (${sea}/11)`);
    }
});

test('creative test ground: a hill with a cave, its mouth towards the pedestals; rock over the chamber', () => {
    const d = make(true), H = d.heightAt;
    const cv = d.cavesNear(TEST_CAVE.X, TEST_CAVE.Z, 5)[0];
    assert.ok(cv && cv.id === 'cvtest');
    assert.ok(H(TEST_CAVE.X, TEST_CAVE.Z) >= 18, 'a hill over it');
    assert.ok(Math.hypot(cv.kx, cv.kz) < 80 && cv.ex > cv.kx, 'close, the mouth towards spawn');
    // carved: walk in along the tunnel, air at head height all the way to the chamber
    for (let x = cv.ex; x >= cv.kx; x -= 2) {
        assert.ok(!d.solidIn(x, cv.kz, cv.F + 1, cv.F + 2), `open at x=${x}`);
    }
    assert.ok(d.solidIn(cv.kx, cv.kz, cv.F + 8, cv.F + 14), 'rock above the chamber');
});

test('creative test ground: worlds without it keep their ground (no river, no hill, no castle near)', () => {
    const d = make(false), H = d.heightAt;
    for (let z = -26; z >= -42; z--) { assert.equal(H(0, z), 0); assert.equal(H.water, 0); }
    assert.ok(H(TEST_CAVE.X + TEST_CAVE.R - 6, TEST_CAVE.Z) < 6, 'no hill by the spawn');
    assert.equal(d.castles.near(0, 0, 300).filter((c) => Math.hypot(c.x, c.z) < 420).length, 0);
    assert.equal(d.seas.test, null);
});
