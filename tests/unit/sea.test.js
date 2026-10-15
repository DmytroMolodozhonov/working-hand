import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SeaIndex, SEA, seaDepth, waveAmp, seaWaveHeight, shoreAmp, waveGlsl, WAVES, SeaWaves } from '../../src/world/Sea.js';
import { TerrainData, BLOCK, MIN_LAYER, OLD_BEDROCK, WORLD_GEN, isLeaves, isWood, WATER_LEVEL_Y } from '../../src/world/Terrain.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/terrain-gen1-12345.json', import.meta.url)));

test('seas: the same seas on every computer (determinism)', () => {
    const a = new SeaIndex(4242), b = new SeaIndex(4242);
    for (let gx = -4; gx < 4; gx++) for (let gz = -4; gz < 4; gz++) {
        const x = a.cellOf(gx, gz), y = b.cellOf(gx, gz);
        assert.equal(!!x, !!y);
        if (x) { assert.equal(x.x, y.x); assert.equal(x.r0, y.r0); assert.deepEqual([...x.prof.slice(0, 20)], [...y.prof.slice(0, 20)]); assert.deepEqual(x.islands, y.islands); }
    }
    const sea = a.nearest(0, 0);
    const d1 = new TerrainData(), d2 = new TerrainData();
    d1.generate({ seed: 4242, mountains: true, seas: true });
    d2.generate({ seed: 4242, mountains: true, seas: true });
    for (let i = 0; i < 400; i++) {
        const p = a.pointAt(sea, i * 0.0157, (i % 40) * 6 - 60);
        const ix = Math.round(p.x), iz = Math.round(p.z);
        assert.equal(d1.topLayer(ix, iz), d2.topLayer(ix, iz));
    }
});

test('seas are rare, big and never near spawn', () => {
    for (const seed of [12345, 777, 4242, 1, 7]) {
        const S = new SeaIndex(seed);
        let n = 0;
        for (let gx = -4; gx < 4; gx++) for (let gz = -4; gz < 4; gz++) if (S.cellOf(gx, gz)) n++;
        assert.ok(n >= 13 && n <= 38, `seed ${seed}: ${n} of 64 cells hold a sea`);
        for (let x = -1100; x <= 1100; x += 50) for (let z = -1100; z <= 1100; z += 50) {
            if (Math.hypot(x, z) > 1100) continue;
            assert.ok(S.signedDist(x, z) < -SEA.TAPER, `seed ${seed}: sea land near spawn at ${x},${z}`);
        }
        const sea = S.nearest(0, 0);
        assert.ok(sea && sea.r0 >= SEA.R_MIN && sea.r0 <= SEA.R_MAX);
    }
});

test('the sea is deep (deeper than any lake), sand on the seabed, bedrock stays', () => {
    assert.equal(seaDepth(5), 1);
    assert.ok(seaDepth(40) >= 3 && seaDepth(40) <= 6);
    assert.equal(seaDepth(-3), 0);
    const S = new SeaIndex(4242), sea = S.nearest(0, 0);
    const d = new TerrainData();
    d.generate({ seed: 4242, mountains: true, seas: true });
    assert.equal(d.bedrockTop, MIN_LAYER);
    let deep = 0;
    for (let a = 0; a < 6.28; a += 0.4) {
        const p = S.pointAt(sea, a, 220);
        if (S.signedDist(p.x, p.z) < 200) continue; // (an island)
        const ix = Math.round(p.x), iz = Math.round(p.z);
        const top = d.topLayer(ix, iz);
        assert.ok(top <= -12, `deep sea floor ${top}`);
        assert.equal(d.get(ix, top, iz), BLOCK.SAND);
        assert.equal(d.get(ix, 0, iz), BLOCK.WATER);
        assert.ok(d.isSeaColumn(ix, iz));
        assert.equal(d.get(ix, MIN_LAYER, iz), BLOCK.BEDROCK);
        deep++;
    }
    assert.ok(deep >= 8);
});

test('sandy beaches: low sand at the shore, no trees on it', () => {
    const S = new SeaIndex(4242), sea = S.nearest(0, 0);
    const d = new TerrainData();
    d.generate({ seed: 4242, mountains: true, seas: true });
    let checked = 0;
    for (let i = 0; i < 50; i++) {
        const a = i / 50 * Math.PI * 2;
        const p = S.pointAt(sea, a, -6);
        const ix = Math.round(p.x), iz = Math.round(p.z);
        if (d.castles.landAt(ix, iz)) continue; // (a sea castle's land)
        if (Math.abs(S.signedDist(ix, iz) + 6) > 1.5) continue; // (an island close by)
        d.heightAt(ix, iz);
        if (d.heightAt.water) continue; // (a river mouth)
        const top = d.topLayer(ix, iz);
        assert.equal(d.get(ix, top, iz), BLOCK.SAND, `beach at angle ${a.toFixed(2)}`);
        assert.ok(top >= 0 && top <= 2, `beach height ${top}`);
        for (let k = 0; k <= 10; k++) {
            const q = S.pointAt(sea, a, -6 - k);
            const qx = Math.round(q.x), qz = Math.round(q.z);
            for (let L = 0; L <= 20; L++) { const t = d.get(qx, L, qz); assert.ok(!isLeaves(t) && !(isWood(t) && t !== BLOCK.PLANKS && t !== BLOCK.PLANKS_DARK), 'no tree on the beach'); }
        }
        checked++;
    }
    assert.ok(checked >= 30, `beaches checked: ${checked}`);
});

test('old worlds are exactly the same (generation 1), and far land of new worlds too', () => {
    assert.equal(WORLD_GEN, 5); // (3: the creative test ground, 4: cave systems, 5: the new landscape — the seas stay as in 2)
    const old = new TerrainData();
    old.generate({ seed: 12345, mountains: true });
    assert.equal(old.bedrockTop, OLD_BEDROCK);
    assert.equal(old.seas, null);
    const nu = new TerrainData();
    nu.generate({ seed: 12345, mountains: true, seas: true });
    let same = 0;
    fixture.forEach(([x, z, top, at0], i) => {
        if (old.towers?.landAt(x, z)) return; // (a wizards' tower stands here now: src/world/WizardTowers.js)
        assert.equal(old.topLayer(x, z), top, `old world column ${x},${z}`);
        assert.equal(old.get(x, 0, z), at0);
        if (nu.seas.signedDist(x, z) < -SEA.TAPER && !nu.castles.landAt(x, z) && !old.castles.landAt(x, z) && !nu.towers?.landAt(x, z)) {
            assert.equal(nu.topLayer(x, z), top, `new world far from the sea ${x},${z}`);
            same++;
        }
        if (i % 50 === 0) { old.chunks.clear(); nu.chunks.clear(); }
    });
    assert.ok(same > 300, `${same} far columns compared`);
    // an old world dug to the bottom stops at its old bedrock
    old.removeSphere(0, -4, 0, 9);
    assert.equal(old.surfaceY(0, 0), OLD_BEDROCK - 0.5);
});

test('waves: small near the shore, big out at sea, none on land, crests run in to the beach', () => {
    let m4 = 0, m200 = 0;
    for (let t = 0; t < 120; t += 0.1) {
        m4 = Math.max(m4, Math.abs(seaWaveHeight(13, -7, t, 4)));
        m200 = Math.max(m200, Math.abs(seaWaveHeight(13, -7, t, 200)));
    }
    assert.ok(m4 <= 0.2, `near the shore ${m4}`);
    assert.ok(m200 >= 0.6, `out at sea ${m200}`);
    assert.equal(waveAmp(-3), 0);
    assert.equal(seaWaveHeight(1, 2, 3, -5), 0);
    assert.ok(waveAmp(40) > waveAmp(4) && waveAmp(200) > waveAmp(40));
    // a crest (zero crossing going up) moves to smaller s, i.e. towards the shore
    const k = WAVES.shore.k, w = WAVES.shore.omega;
    const crestAt = (t) => { for (let s = 60; s > 20; s -= 0.01) if (Math.sin(k * s + w * t) > 0.9999) return s; return null; };
    const a = crestAt(0), b = crestAt(0.5);
    assert.ok(a != null && b != null && b < a, `crest ${a} → ${b}`);
    assert.ok(shoreAmp(40) > 0.5, 'surf zone waves are big enough to ride');
    // the clock may wrap round every PERIOD: the waves are the same
    for (const s of [3, 50, 250]) assert.ok(Math.abs(seaWaveHeight(5, 9, 12.3, s) - seaWaveHeight(5, 9, 12.3 + WAVES.PERIOD, s)) < 1e-6);
});

test('the GLSL wave is the same function', () => {
    const src = waveGlsl();
    assert.match(src, /float seaWave\(vec2 p, float t, float s, float storm\)/);
    // evaluate the GLSL text as JS (same arithmetic) and compare
    const js = src.replace(/float |vec2 /g, '').replace(/clamp\(([^,]+), 0\.0, 1\.0\)/g, 'Math.min(1, Math.max(0, $1))').replace(/\bsin\(/g, 'Math.sin(')
        .replace(/seaSmooth01\(v\) \{/, 'function seaSmooth01(v) {').replace(/seaShoreAmp\(s\) \{/, 'function seaShoreAmp(s) {').replace(/seaOpenAmp\(s\) \{/, 'function seaOpenAmp(s) {')
        .replace(/seaWave\(p, t, s, storm\) \{/, 'function seaWave(p, t, s, storm) {').replace(/\b(k|rise|fade|sw|sh) = /g, 'let $1 = ').replace(/let sw = 0\.0;/, 'let sw = 0;');
    const seaWave = new Function(js + '\nreturn seaWave;')();
    for (const [x, z, t, s] of [[1, 2, 3, 4], [-50, 70, 123.4, 60], [300, -20, 599, 220], [0, 0, 0, -1]]) {
        assert.ok(Math.abs(seaWave({ x, y: z }, t, s, 0) - seaWaveHeight(x, z, t, s)) < 1e-5);
    }
});

test('SeaWaves: one object for swimming, boards and ships', () => {
    const S = new SeaIndex(4242), sea = S.nearest(0, 0);
    let t = 10;
    const waves = new SeaWaves(S, () => t);
    const p = S.pointAt(sea, 1.1, 45);
    const o = waves.sample(p.x, p.z, t, {});
    assert.ok(o && Math.abs(o.h - seaWaveHeight(p.x, p.z, t, S.signedDist(p.x, p.z))) < 1e-9);
    // the gradient is the slope of the surface
    const e = 0.01, hx = (waves.height(p.x + e, p.z) - waves.height(p.x - e, p.z)) / (2 * e);
    assert.ok(Math.abs(hx - o.gx) < 0.02, `gx ${o.gx} vs ${hx}`);
    // near the shore the waves run towards it
    const q = S.pointAt(sea, 1.1, 30), toShore = S.pointAt(sea, 1.1, 0);
    const o2 = waves.sample(q.x, q.z, t, {});
    const dl = Math.hypot(toShore.x - q.x, toShore.z - q.z);
    assert.ok((o2.dx * (toShore.x - q.x) + o2.dz * (toShore.z - q.z)) / dl > 0.8);
    assert.ok(o2.c > 2 && o2.depth >= 1);
    assert.equal(waves.sample(...Object.values(S.pointAt(sea, 1.1, -20)), t, {}), null);
    assert.ok(waves.beachesNear(toShore.x, toShore.z, 60).length > 0);
    // the surface is at WATER_LEVEL_Y + h
    assert.ok(WATER_LEVEL_Y < -0.5);
});

test('the flat block top of the sea is not drawn when the wave surface draws it', () => {
    const S = new SeaIndex(4242), sea = S.nearest(0, 0);
    const d = new TerrainData();
    d.generate({ seed: 4242, mountains: true, seas: true });
    const cx = Math.floor(sea.x / 32) + 2, cz = Math.floor(sea.z / 32);
    const tops = (a) => { let n = 0; for (let i = 0; i < a.water.normals.length / 3; i++) if (a.water.normals[i * 3 + 1] === 1 && Math.abs(a.water.positions[i * 3 + 1] - WATER_LEVEL_Y) < 0.01) n++; return n; };
    d.skipSeaTop = false;
    assert.ok(tops(d.buildChunkArrays(cx, cz)) > 0, 'flat top drawn (old behaviour)');
    d.skipSeaTop = true;
    assert.equal(tops(d.buildChunkArrays(cx, cz)), 0, 'the waves draw it');
});

test('no water ever stands above the sea level (the creative test ground too)', () => {
    const d = new TerrainData();
    d.generate({ seed: 777, mountains: true, seas: true, test: true, deepCaves: true });
    const S = d.seas, sea = S.nearest(0, 0);
    let deep = 0;
    for (let i = 0; i < 120; i++) {
        const p = i < 100 ? S.pointAt(sea, i * 0.063, (i % 10) * 40 + 3) : { x: (i - 100) * 7 - 70, z: 40 + (i % 3) * 3 }; // the sea, then near the start (the river)
        const ix = Math.round(p.x), iz = Math.round(p.z);
        d.heightAt(ix, iz);
        for (let L = 1; L <= 20; L++) assert.notEqual(d.get(ix, L, iz), BLOCK.WATER, `water above the sea level at ${ix},${iz} layer ${L}`);
        if (d.topLayer(ix, iz) <= -12) deep++;
    }
    assert.ok(deep > 30, `the test sea is deep (${deep})`);
});
