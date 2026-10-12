// «Wave Attack»: the water rises into a wave, waits for the hand, rolls where it is sent, breaks.
// And the river keeps looking like a river after «Total Destruction» (its banks hold; holes fill).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WAVE, WaveAim, newWave, stepWave, waveTouch, wavePush, waveHits } from '../../src/game/WaveAttack.js';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { ruinArea } from '../../src/world/Ruin.js';

/** A world: water everywhere (y 0), or land from x = landX on, a wall at x = wallX. */
const env = ({ landX = Infinity, wallX = Infinity } = {}) => ({
    surface: (x) => (x >= landX ? { y: 0.2, water: false } : { y: 0, water: true }),
    solid: (x, y) => x >= wallX && y < 6,
});
const run = (w, e, secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) stepWave(w, dt, e); return w; };

test('the water rises into a wave, then stands and waits (it does not go by itself)', () => {
    const w = newWave('WaveAttack', 'me', { x: 0, y: 0, z: 0 }, 1, 0);
    run(w, env(), WAVE.RISE * 0.5);
    assert.equal(w.phase, 'rise');
    assert.ok(w.h > 0.2 && w.h < w.F.height, 'half risen');
    run(w, env(), WAVE.RISE);
    assert.equal(w.phase, 'aim');
    run(w, env(), 20);
    assert.equal(w.phase, 'aim', 'it stands as long as it is held');
    assert.ok(Math.abs(w.x) < 1e-9 && Math.abs(w.h - w.F.height) < 0.2 * w.F.height, 'standing where it rose, full height');
    assert.equal(waveTouch(w, { x: 0.5, y: 1, z: 0 }), 0, 'a standing wave hits nobody');
});

test('the hand aims it: it turns after the hand; a push of the hand sends it, a still hand on a place too, a lowered hand drops it', () => {
    const hand = { x: 0, y: 1.5, z: 0 };
    // still pointing at the water where it was cast and keeping still: never sent (that is not showing where)
    const water = { x: 0, y: -0.35, z: 1 };
    let a = new WaveAim(0, water);
    for (let t = 0; t < 5; t += 1 / 30) assert.equal(a.step(1 / 30, { raised: true, dir: water, hand }), null);
    // pointing to the side: it turns there (not at once), and a still hand sends it
    a = new WaveAim(0, water);
    const side = { x: 1, y: -0.1, z: 0 };
    let r = null, t = 0;
    a.step(1 / 30, { raised: true, dir: side, hand });
    assert.ok(a.yaw > 0 && a.yaw < 0.2, 'it turns smoothly');
    for (; t < 5 && !r; t += 1 / 30) r = a.step(1 / 30, { raised: true, dir: side, hand });
    assert.equal(r, 'go');
    assert.ok(Math.abs(a.yaw - Math.PI / 2) < 0.15, 'it looks where the hand shows');
    assert.ok(t > WAVE.HOLD - 0.1, `not at once (${t.toFixed(2)} s)`);
    // a shove of the hand towards the aim sends it at once
    a = new WaveAim(0);
    for (let i = 0; i < 25; i++) a.step(1 / 30, { raised: true, dir: { x: 0, y: 0, z: 1 }, hand: { x: 0, y: 1.5, z: 0 } });
    const before = a.t;
    r = null;
    for (let i = 0; i < 10 && !r; i++) r = a.step(1 / 30, { raised: true, dir: { x: 0.05 * i, y: 0, z: 1 }, hand: { x: 0, y: 1.5, z: 0.08 * (i + 1) } });
    assert.equal(r, 'go', 'pushed');
    assert.ok(a.t - before < 0.2, 'quickly');
    // the hand lowered: it falls back into the water
    a = new WaveAim(0);
    r = null;
    for (let i = 0; i < 60 && !r; i++) r = a.step(1 / 30, { raised: false, dir: side, hand });
    assert.equal(r, 'drop');
});

test('sent, it rolls at a wave\'s speed, curls, reaches what is in front; over land it tires; it breaks into foam and drains away', () => {
    const w = newWave('WaveAttack', 'me', { x: 0, y: 0, z: 0 }, 1, 0, 'aim');
    w.phase = 'roll'; w.t = 0;
    run(w, env(), 1);
    assert.ok(w.x > w.F.speed * 0.8 && w.x < w.F.speed * 1.05, `about ${w.F.speed} m/s (${w.x.toFixed(1)} m in 1 s)`);
    assert.ok(waveHits(w) && w.curl > 0.25 * Math.PI, 'rolling, the crest curls');
    const front = { x: w.x + 0.3, y: 1, z: 0.5 };
    assert.ok(waveTouch(w, front) > 0.5, 'reaches a body just in front of it');
    assert.equal(waveTouch(w, { x: w.x + 4, y: 1, z: 0 }), 0, 'not one far ahead');
    assert.equal(waveTouch(w, { x: w.x, y: 1, z: w.F.width }), 0, 'not one far to the side');
    assert.equal(waveTouch(w, { x: w.x, y: w.h + 4, z: 0 }), 0, 'not one high above');
    const v = wavePush(w, 1);
    assert.ok(v.x > 10 && Math.abs(v.z) < 1e-9 && v.y > 0, 'pushed along it, off the feet');
    // over water it goes its whole way, then breaks, drains and is gone
    const phases = new Set();
    for (let t = 0; t < 20 && w.phase !== 'gone'; t += 1 / 30) phases.add(stepWave(w, 1 / 30, env()));
    assert.ok(w.s >= w.dist - 0.5, `the whole way (${w.s.toFixed(1)} of ${w.dist} m)`);
    for (const p of ['break', 'drain', 'gone']) assert.ok(phases.has(p), p);
    // over land it loses its strength and breaks sooner; a wall breaks it at once
    const land = newWave('WaveAttack', 'me', { x: 0, y: 0, z: 0 }, 1, 0, 'aim');
    land.phase = 'roll';
    while (land.phase === 'roll') stepWave(land, 1 / 30, env({ landX: 2 }));
    assert.ok(land.s < land.dist * 0.9, `over land it stops sooner (${land.s.toFixed(1)} m)`);
    const wall = newWave('WaveAttack', 'me', { x: 0, y: 0, z: 0 }, 1, 0, 'aim');
    wall.phase = 'roll';
    while (wall.phase === 'roll') stepWave(wall, 1 / 30, env({ wallX: 5 }));
    assert.ok(wall.s < 5, `it breaks on a wall (${wall.s.toFixed(1)} m)`);
    // «Максима»: bigger, further, stronger
    const M = newWave('WaveAttackMaxima', 'me', { x: 0, y: 0, z: 0 }, 1, 0);
    assert.ok(M.F.height > w.F.height && M.F.width > w.F.width && M.F.dist > w.F.dist);
    M.phase = 'roll'; M.energy = 1; run(M, env(), 0.5);
    assert.ok(wavePush(M, 1).x > v.x);
});

test('a dropped wave falls back into the water and hits nobody', () => {
    const w = newWave('WaveAttack', 'me', { x: 0, y: 0, z: 0 }, 1, 0);
    run(w, env(), WAVE.RISE + 0.2);
    w.h0 = w.h; w.phase = 'fall'; w.t = 0;
    assert.equal(waveTouch(w, { x: 0.3, y: 1, z: 0 }), 0);
    run(w, env(), WAVE.FALL + 0.1);
    assert.equal(w.phase, 'gone');
});

test('the wave looks for everything it reaches (CLAUDE.md: «на кого и на что»)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../src/game/WaveAttack.js', import.meta.url), 'utf8');
    const hits = src.slice(src.indexOf('    _hits(w) {'));
    for (const [what, re] of [['every creature kind', /Object\.keys\(KINDS\)/], ['me', /g\.impact\?\.apply/], ['book-birds', /books\?\.birds/],
        ['the spider (a decision)', /spiders/], ['weapons and things', /weapons\?\.weapons/], ['campfires', /campfires/], ['burning trees', /fire\?\.douse/], ['ships', /ships\?\.waveHit/]]) {
        assert.match(hits, re, what);
    }
});

// ------------------------------------------------------------------ the river

/** A straight river (water at layers -1…0 over sand) through grass, along z. */
function river() {
    const d = new TerrainData();
    d.generate({ seed: 1 });
    for (let x = -40; x <= 40; x++) for (let z = -6; z <= 6; z++) {
        for (let L = -6; L <= 4; L++) d.set(x, L, z, L <= 0 ? BLOCK.DIRT : BLOCK.AIR);
        d.set(x, 0, z, BLOCK.GRASS);
        if (Math.abs(z) <= 2) { d.set(x, -2, z, BLOCK.SAND); d.set(x, -1, z, BLOCK.WATER); d.set(x, 0, z, BLOCK.WATER); }
    }
    return d;
}
const waterCells = (d) => { const s = new Set(); for (let x = -40; x <= 40; x++) for (let z = -6; z <= 6; z++) for (let L = -4; L <= 2; L++) if (d.get(x, L, z) === BLOCK.WATER) s.add(`${x},${L},${z}`); return s; };

test('«Total Destruction» by a river: its banks hold — the water keeps its shape, no water hangs over air', () => {
    const d = river();
    const before = waterCells(d);
    ruinArea(d, 0, 0, 5, 20);
    const after = waterCells(d);
    assert.deepEqual([...after].filter((k) => !before.has(k)), [], 'the river did not spill over the sunk grass');
    for (const k of after) {
        const [x, L, z] = k.split(',').map(Number);
        assert.notEqual(d.get(x, L - 1, z), BLOCK.AIR, `no water over air at ${k}`);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.notEqual(d.get(x + dx, L, z + dz), BLOCK.AIR, `no water wall facing air at ${k}`);
    }
});

test('a hole dug beside the river fills with water all the way through (not only next to the water)', () => {
    const d = river();
    // a ditch 6 blocks long from the bank, two deep, dug from its far end towards the water
    const cells = [];
    for (let z = 8; z >= 3; z--) for (const L of [0, -1]) { d.set(0, L, z, BLOCK.AIR); cells.push({ x: 0, y: L - 1, z }); }
    const filled = d._flood(cells);
    assert.equal(filled.length, 12, 'the whole ditch');
    for (let z = 3; z <= 8; z++) for (const L of [0, -1]) assert.equal(d.get(0, L, z), BLOCK.WATER, `${z},${L}`);
});
