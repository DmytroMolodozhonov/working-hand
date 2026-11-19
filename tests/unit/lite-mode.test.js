import test from 'node:test';
import assert from 'node:assert/strict';
import { LiteWatch, liteAtStart, liteSetting, LITE } from '../../src/game/LiteMode.js';
import { QualityManager, LITE_LEVEL, QUALITY_LEVELS } from '../../src/game/Quality.js';

test('lite: starts for a software renderer or when asked; never when off', () => {
    assert.equal(liteAtStart('auto', { gpuName: 'ANGLE (Google, Vulkan SwiftShader)' }), true);
    assert.equal(liteAtStart('auto', { gpuName: 'NVIDIA GeForce RTX 3050' }), false);
    assert.equal(liteAtStart('auto', { gpuName: 'NVIDIA' }, true), true); // (it had to switch on last time)
    assert.equal(liteAtStart('off', { gpuName: 'SwiftShader' }), false);
    assert.equal(liteAtStart('on', {}), true);
    assert.equal(liteSetting('что-то'), 'auto');
});

test('lite watch: needs several slow windows in a row, ignores hiccups and loads', () => {
    const w = new LiteWatch();
    const run = (dt, sec, low = true) => { let on = false; for (let t = 0; t < sec; t += dt) on = w.feed(dt, low) || on; return on; };
    assert.equal(run(1 / 10, 6), false); // (3 slow windows: not yet)
    assert.equal(run(1 / 60, 4), false); // (a good window resets)
    assert.equal(run(1 / 10, 10), true); // (4+ slow windows in a row)
    const v = new LiteWatch();
    for (let i = 0; i < 20; i++) assert.equal(v.feed(2.5, true), false); // (load screen frames: not a measure)
    const x = new LiteWatch();
    let on = false; for (let t = 0; t < 30; t += 0.1) on = x.feed(0.1, false) || on; // (graphics not at the lowest yet: «Авто» steps down first)
    assert.equal(on, false);
    assert.ok(LITE.LOW_WINDOWS * LITE.WINDOW_S >= 6);
});

test('lite level is cheaper than the lowest ordinary one in every way', () => {
    const low = QUALITY_LEVELS[0];
    assert.ok(LITE_LEVEL.view < low.view && LITE_LEVEL.pixelRatio < low.pixelRatio && !LITE_LEVEL.shadows && !LITE_LEVEL.clouds);
    const q = new QualityManager({ setPixelRatio() {}, shadowMap: {} }, 'auto');
    q.setLite(true);
    assert.equal(q.current, LITE_LEVEL);
    q.setLite(false);
    assert.notEqual(q.current, LITE_LEVEL);
});
