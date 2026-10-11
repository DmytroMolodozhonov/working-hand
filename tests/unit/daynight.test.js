import test from 'node:test';
import assert from 'node:assert/strict';
import { nightAt, NIGHT_START } from '../../src/world/World.js';

test('day and night: 18 hours of day, 6 hours of night (the last quarter), soft dusk and dawn', () => {
    assert.equal(NIGHT_START, 0.75);
    let night = 0;
    const N = 2400;
    for (let i = 0; i < N; i++) if (nightAt(i / N) > 0.6) night++;
    const hours = (night / N) * 24;
    assert.ok(Math.abs(hours - 6) < 0.6, `night lasts ${hours.toFixed(1)} h`);
    assert.equal(nightAt(0.3), 0, 'midday');
    assert.equal(nightAt(0.6), 0, 'still day at 0.6 (it used to be night)');
    assert.equal(nightAt(0.87), 1, 'deep night');
    assert.ok(nightAt(0.75) > 0.3 && nightAt(0.75) < 0.7, 'sunset');
    assert.ok(nightAt(0.0) > 0.3 && nightAt(0.0) < 0.7, 'sunrise');
    for (let i = 0; i < N; i++) assert.ok(Math.abs(nightAt((i + 1) / N) - nightAt(i / N)) < 0.05, 'no jumps');
});

test('the sun sets slowly and never jumps: golden hour, sunset, twilight, then night', async () => {
    const THREE = await import('three');
    const { sunAt, sunsetGlow, SUNSET, SUNRISE } = await import('../../src/world/World.js');
    const N = 2400, a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
        sunAt(i / N, a); sunAt((i + 1) / N, b);
        assert.ok(a.distanceTo(b) < 0.02, `the sun jumps at ${(i / N * 24).toFixed(2)} h`);
    }
    assert.ok(Math.abs(sunAt(SUNSET)) < 0.01 && Math.abs(sunAt(SUNRISE)) < 0.01, 'on the horizon at sunset and sunrise');
    assert.ok(SUNSET < NIGHT_START && nightAt(SUNSET) < 0.3, 'the sun sets before the night falls');
    assert.ok(sunAt(0.85) < -0.3, 'under the horizon at night');
    // the sunset colours last a good while (well over an hour), not a moment
    let glowing = 0;
    for (let i = 0; i < N; i++) { const p = i / N; if (p > 0.5 && sunsetGlow(sunAt(p)) > 0.3) glowing++; }
    const hours = glowing / N * 24;
    assert.ok(hours > 1.5 && hours < 3.5, `sunset colours for ${hours.toFixed(1)} h`);
});
