import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, TEST_RIVER, TEST_CAVE } from '../../src/world/Terrain.js';

/**
 * A creative world (generation 3) has a test ground by the pedestals: a river just past them,
 * a hill with a cave to the left, and a sea castle (village, port, the sea) close by.
 * The pedestals stay on dry flat ground; other worlds are unchanged.
 */
const make = (test, seed = 12345, deepCaves = true) => { const d = new TerrainData(); d.generate({ seed, mountains: true, seas: true, test, deepCaves }); return d; };

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

test('creative test ground: a hill with a cave system — its mouth towards the pedestals, winding deep down, branching, chests in its chambers', () => {
    const d = make(true), H = d.heightAt;
    const cv = d.cavesNear(TEST_CAVE.X, TEST_CAVE.Z, 5).find((c) => c.id === 'cvtest');
    assert.ok(cv, 'the test cave');
    assert.ok(H(TEST_CAVE.X, TEST_CAVE.Z) >= 18, 'a hill over its mouth');
    assert.ok(Math.hypot(cv.start.x, cv.start.z) < 40 && Math.cos(cv.start.yaw) < -0.9, 'the mouth by the pedestals, going into the hill');
    assert.ok(cv.segs.length > 60, `long tunnels (${cv.segs.length} × 3 m)`);
    assert.ok(Math.min(...cv.segs.map((g) => g.by)) < -6, 'deep down');
    assert.ok(cv.chambers.length >= 3 && cv.chests.length >= 2, `chambers ${cv.chambers.length}, chests ${cv.chests.length}`);
    // branching: tunnels that do not go on from the one before
    let forks = 0;
    for (let i = 1; i < cv.segs.length; i++) { const a = cv.segs[i - 1], b = cv.segs[i]; if (Math.hypot(a.bx - b.ax, a.by - b.ay, a.bz - b.az) > 0.01) forks++; }
    assert.ok(forks >= 2, `it branches (${forks})`);
    // carved: air all along its tunnels, a floor under each chest
    let air = 0;
    for (const g of cv.segs) if (d.get(Math.round((g.ax + g.bx) / 2), Math.round((g.ay + g.by) / 2), Math.round((g.az + g.bz) / 2)) === 0) air++;
    assert.ok(air >= cv.segs.length * 0.95, `walkable all along (${air}/${cv.segs.length})`);
    for (const c of cv.chests) {
        assert.equal(d.get(Math.floor(c.x), c.y + 1, Math.floor(c.z)), 0, 'room for the chest');
        assert.notEqual(d.get(Math.floor(c.x), c.y, Math.floor(c.z)), 0, 'a floor under it');
    }
    // the pedestals' ground is untouched
    for (let x = -16; x <= 25; x += 3) for (let z = -21; z <= 3; z += 3) assert.notEqual(d.get(x, 0, z), 0, `ground at ${x},${z}`);
});

test('creative test ground: worlds without it keep their ground (no river, no hill, no castle near)', () => {
    const d = make(false), H = d.heightAt;
    for (let z = -26; z >= -42; z--) { assert.equal(H(0, z), 0); assert.equal(H.water, 0); }
    assert.ok(H(TEST_CAVE.X + TEST_CAVE.R - 6, TEST_CAVE.Z) < 6, 'no hill by the spawn');
    assert.equal(d.castles.near(0, 0, 300).filter((c) => Math.hypot(c.x, c.z) < 420).length, 0);
    assert.equal(d.seas.test, null);
});
