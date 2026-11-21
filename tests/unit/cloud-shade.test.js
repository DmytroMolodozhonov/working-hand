// The clouds' shadows over the land (CloudShade.js, the author 21.11: «слишком игрушечно»): by day they drift, at night, in hell,
// off the Earth they fade to nothing (k = 0: the shader skips the noise altogether).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_SHADE, CLOUD_RULES, stepClouds, CLOUD_SHADE_GLSL } from '../../src/world/CloudShade.js';

test('cloud shadows: on by day, gone at night or off the Earth, and they drift', () => {
    CLOUD_SHADE.k.value = 0; CLOUD_SHADE.t.value = 0;
    for (let i = 0; i < 300; i++) stepClouds(1 / 30, 1, true);
    assert.ok(Math.abs(CLOUD_SHADE.k.value - CLOUD_RULES.K) < 0.01, 'by day: full strength');
    assert.ok(CLOUD_SHADE.t.value > 9, 'they move');
    for (let i = 0; i < 600; i++) stepClouds(1 / 30, 0, true);
    assert.equal(CLOUD_SHADE.k.value, 0, 'night: none');
    for (let i = 0; i < 300; i++) stepClouds(1 / 30, 1, false);
    assert.equal(CLOUD_SHADE.k.value, 0, 'off the Earth / clouds off: none');
    assert.match(CLOUD_SHADE_GLSL, /if \(uCloudK <= 0\.0\) return 1\.0;/);
});
