import test from 'node:test';
import assert from 'node:assert/strict';
import { buoyStep, densityOf, restOffset, splashSpec, waveImpulse, submerged, WATER } from '../../src/game/Buoyancy.js';

const sim = (rho, size, y0, secs = 20) => { let y = y0, vy = 0; const dt = 1 / 60; for (let t = 0; t < secs; t += dt) { vy = buoyStep(vy, y, size, 0, rho, dt); y += vy * dt; if (y < -40) break; } return { y, vy }; };

test('a light thing floats and settles where its density says, a heavy one sinks', () => {
    const apple = sim(800, 0.3, 0.5), r = restOffset(800, 0.3);
    assert.ok(Math.abs(apple.y - r) < 0.04, `apple ${apple.y} vs ${r}`);
    const log = sim(500, 0.6, 1.0); // (lighter: higher out of the water)
    assert.ok(log.y > apple.y - 0.2 && Math.abs(log.vy) < 0.05);
    assert.ok(sim(7800, 0.5, 0.5, 10).y < -5, 'a sword sinks');
});

test('the heavier it is, the faster it sinks; a barely-heavy thing sinks slowly', () => {
    const t = (rho) => { let y = 0, vy = 0, n = 0; for (; n < 600 && y > -3; n++) { vy = buoyStep(vy, y, 0.4, 0, rho, 1 / 60); y += vy / 60; } return n; };
    assert.ok(t(8000) < t(2500) && t(2500) < t(1100));
});

test('pushed under, a floater comes back up and bobs down to rest', () => {
    let y = -0.6, vy = 0, ups = 0; const dt = 1 / 60;
    for (let t = 0; t < 12; t += dt) { vy = buoyStep(vy, y, 0.4, 0, 600, dt); y += vy * dt; if (vy > 0.2) ups++; }
    assert.ok(ups > 5); assert.ok(Math.abs(y - restOffset(600, 0.4)) < 0.05);
});

test('densities: wood floats, metal sinks, unknown follows the physics flag', () => {
    assert.ok(densityOf('wand') < WATER.RHO && densityOf('sword') > WATER.RHO && densityOf('coins') > WATER.RHO);
    assert.ok(densityOf('whatever', { float: true }) < WATER.RHO && densityOf('whatever', {}) > WATER.RHO);
    assert.equal(submerged(-1, 0.4, 0), 1); assert.equal(submerged(1, 0.4, 0), 0);
});

test('a bigger fall makes more drops, rings and a wider wave', () => {
    const pebble = splashSpec(0.1, 3), swan = splashSpec(5, 6), boulder = splashSpec(200, 15);
    assert.ok(pebble.drops < swan.drops && swan.drops < boulder.drops);
    assert.ok(pebble.rings <= swan.rings && swan.rings < boulder.rings);
    assert.ok(pebble.radius < swan.radius && swan.radius < boulder.radius);
});

test('a wave pushes a floater away from the source, weaker with distance, none beyond reach', () => {
    const near = waveImpulse(2, 0, 100), far = waveImpulse(8, 0, 100);
    assert.ok(near.vx > far.vx && near.vx > 0 && Math.abs(near.vz) < 1e-9);
    assert.equal(waveImpulse(500, 0, 100), null);
    assert.ok(waveImpulse(2, 0, 100, 0.1).vx > waveImpulse(2, 0, 100, 2).vx, 'a small thing is carried more');
});
