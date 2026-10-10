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
