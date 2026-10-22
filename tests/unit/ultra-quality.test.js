// «Ультра качество»: an addition switched on the go — the usual mode untouched, the lawn thinning smoothly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QualityManager, QUALITY_LEVELS, ULTRA_LEVEL } from '../../src/game/Quality.js';
import { grassDensity, ULTRA_GRASS } from '../../src/world/UltraGrass.js';
import { ULTRA } from '../../src/fx/UltraUniforms.js';

const renderer = () => ({ setPixelRatio() {}, shadowMap: { autoUpdate: true, needsUpdate: false, type: 1 } });

test('ultra pins its own picture; off gives the chosen level back', () => {
    const q = new QualityManager(renderer(), '2');
    q.apply(null);
    assert.equal(q.current, QUALITY_LEVELS[2]);
    q.setUltra(true);
    assert.equal(q.current, ULTRA_LEVEL);
    q.setUltra(false);
    assert.equal(q.current, QUALITY_LEVELS[2]);
});

test('«Авто» does not step the ultra picture down (the settings warn instead)', () => {
    const q = new QualityManager(renderer(), 'auto');
    q.level = 2;
    q.apply(null);
    q.setUltra(true);
    for (let i = 0; i < 600; i++) q.update(1 / 15); // 40 s at 15 FPS
    assert.equal(q.current, ULTRA_LEVEL);
    assert.equal(q.level, 2);
});

test('the lawn: thick near, thinner and thinner, none to speak of at the edge', () => {
    assert.equal(grassDensity(0), 1);
    assert.equal(grassDensity(ULTRA_GRASS.NEAR), 1);
    let prev = 1;
    for (let d = ULTRA_GRASS.NEAR; d <= ULTRA_GRASS.FAR; d += 1) {
        const k = grassDensity(d);
        assert.ok(k <= prev + 1e-9 && prev - k < 0.08, `smooth at ${d} m`);
        prev = k;
    }
    assert.ok(Math.abs(grassDensity(ULTRA_GRASS.FAR) - 0.1) < 1e-9);
});

test('the shaders\' ultra code is off by default (the usual picture as it was)', () => {
    assert.equal(ULTRA.on.value, 0);
});
