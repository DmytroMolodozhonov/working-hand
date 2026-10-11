import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { lumosFlick, LUMOS } from '../../src/game/WandMagic.js';

/**
 * Lumos is thrown only by a real flick of the wand — never by walking (the arms swing), nor by one
 * jumpy camera frame: the light stays at the tip until «Нокс» / «стоп».
 */
const trailOf = (fn, ms = 400, step = 16) => {
    const trail = [];
    for (let t = 0; t <= ms; t += step) trail.push({ t, p: fn(t / 1000) });
    return { trail, now: ms };
};
const FWD = new THREE.Vector3(0, 0.2, 1).normalize(); // (the wand points ahead, a little up)

test('Lumos flick: a quick steady flick where the wand points throws the light', () => {
    // the tip goes 0.8 m ahead in the last 0.15 s
    const { trail, now } = trailOf((s) => new THREE.Vector3(0, 1.4, 0.3 + Math.max(0, s - 0.25) * 5.3));
    const d = lumosFlick(trail, now, FWD);
    assert.ok(d && d.z > 0.9, 'thrown ahead');
});

test('Lumos flick: never by walking (the arm swings), a jumpy frame, a slow move or a flick down', () => {
    // walking: the arm swings ±0.35 m about twice a second
    for (let ph = 0; ph < 6.3; ph += 0.7) {
        const { trail, now } = trailOf((s) => new THREE.Vector3(0.05 * Math.sin(ph + s * 12), 1.1, 0.3 + 0.35 * Math.sin(ph + s * 12)));
        assert.equal(lumosFlick(trail, now, FWD), null, `walking swing (phase ${ph})`);
    }
    // one jumpy camera frame: the tip jumps 0.9 m for a moment
    const jump = trailOf((s) => new THREE.Vector3(0, 1.4, Math.abs(s - 0.392) < 0.01 ? 1.2 : 0.3));
    assert.equal(lumosFlick(jump.trail, jump.now, FWD), null, 'a jumpy frame');
    // a slow, calm move of the arm
    const slow = trailOf((s) => new THREE.Vector3(0, 1.4, 0.3 + s * 1.2));
    assert.equal(lumosFlick(slow.trail, slow.now, FWD), null, 'a calm move');
    // fast, but straight down at the feet
    const down = trailOf((s) => new THREE.Vector3(0, 1.4 - Math.max(0, s - 0.25) * 6, 0.3));
    assert.equal(lumosFlick(down.trail, down.now, FWD), null, 'down at the feet');
    // fast, but backwards (away from where the wand points)
    const back = trailOf((s) => new THREE.Vector3(0, 1.4, 0.3 - Math.max(0, s - 0.25) * 6));
    assert.equal(lumosFlick(back.trail, back.now, FWD), null, 'against the wand');
    assert.ok(LUMOS.STILL >= 1000, 'a moment standing still first');
});

test('«Lightning Writing»: another player\'s drawing comes as points — joined into lines, broken where they broke it', async () => {
    const { WandMagic } = await import('../../src/game/WandMagic.js');
    const added = [];
    const game = { scene: { add: (o) => added.push(o), remove: () => {} } };
    const w = new WandMagic(game);
    w.remoteDraw('p1', 0xff8800, [[0, 1, 0], [0.1, 1, 0], [0.2, 1.05, 0], null, [5, 1, 0], [5.1, 1, 0]]);
    const e = w.remoteDrawings.get('p1');
    assert.equal(e.lines.length, 3, 'two strokes, a break, one stroke');
    // the next batch goes on from the last point
    w.remoteDraw('p1', 0xff8800, [[5.2, 1, 0]]);
    assert.equal(e.lines.length, 4);
    // garbage from the network draws nothing
    w.remoteDraw('p1', 0xff8800, [['x', 1, 0], [1e9]]);
    assert.equal(e.lines.length, 4);
});
