/**
 * «Нейросеть считает на…» names the real card and processor (DeviceNames.js; the author 14.11). The card comes first — «Авто» prefers it; no real card → the processor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceLabels, applyDeviceLabels, fillDeviceNames } from '../../src/ui/DeviceNames.js';

test('a real card: «Авто» and the card choice name it; the processor choice names the processor', () => {
    const L = deviceLabels({ gpuShort: 'NVIDIA GeForce RTX 3050', gpuName: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Direct3D11)', cpu: 'AMD Ryzen 5 5600', gpus: ['NVIDIA GeForce RTX 3050'] });
    assert.equal(L.hasGpu, true);
    assert.match(L.auto, /^Авто — видеокарта: NVIDIA GeForce RTX 3050$/);
    assert.match(L.GPU, /^Видеокарте — NVIDIA GeForce RTX 3050$/);
    assert.match(L.CPU, /^Процессоре — AMD Ryzen 5 5600 \(если игра подтормаживает\)$/);
});
test('two cards: the one that draws the page first, the other named too', () => {
    const L = deviceLabels({ gpuShort: 'NVIDIA GeForce RTX 3050 Laptop GPU', gpuName: 'ANGLE (NVIDIA…)', cpu: 'Intel Core i5-12500H', gpus: ['Intel Iris Xe Graphics', 'NVIDIA GeForce RTX 3050 Laptop GPU'] });
    assert.match(L.GPU, /^Видеокарте — NVIDIA GeForce RTX 3050 Laptop GPU \(есть также: Intel Iris Xe Graphics\)$/);
});
test('the same card written two ways is one card', () => {
    const L = deviceLabels({ gpuShort: 'NVIDIA GeForce RTX 3050', cpu: 'x', gpus: ['NVIDIA GeForce RTX 3050 Laptop GPU'] });
    assert.ok(!/есть также/.test(L.GPU), L.GPU);
});
test('no real card (a software renderer draws the page): «Авто» is the processor, the card choice says there is none', () => {
    const L = deviceLabels({ gpuShort: 'SwiftShader', gpuName: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))', cpu: 'Intel Xeon', gpus: [] });
    assert.equal(L.hasGpu, false);
    assert.match(L.auto, /^Авто — процессор: Intel Xeon/);
    assert.match(L.GPU, /не найдена/);
});
test('the program is silent: the processor is «N потоков», no crash', () => {
    const L = deviceLabels({ gpuShort: 'AMD Radeon RX 6600', threads: 12 });
    assert.match(L.CPU, /12 потоков/);
    assert.equal(deviceLabels({}).hasGpu, false);
});
test('a very long name is cut', () => {
    const L = deviceLabels({ gpuShort: 'X'.repeat(200), cpu: 'Y'.repeat(200) });
    assert.ok(L.GPU.length < 90 && L.CPU.length < 110);
});
test('the <select>: labels are rewritten, values and the saved choice stay; the program\'s answer comes in later', async () => {
    const opts = ['auto', 'GPU', 'CPU'].map((v) => ({ value: v, textContent: '' }));
    const select = { options: opts, value: 'CPU' };
    await fillDeviceNames(select, { short: 'NVIDIA GeForce RTX 3050', name: 'ANGLE' }, async () => ({ ok: true, json: async () => ({ cpu: 'AMD Ryzen 5 5600', gpus: ['NVIDIA GeForce RTX 3050'] }) }));
    assert.deepEqual(opts.map((o) => o.value), ['auto', 'GPU', 'CPU']);
    assert.match(opts[2].textContent, /AMD Ryzen 5 5600/);
    assert.match(opts[0].textContent, /RTX 3050/);
    assert.equal(select.value, 'CPU', 'the saved choice is not changed');
    // the program does not answer
    await fillDeviceNames(select, { short: 'NVIDIA GeForce RTX 3050' }, async () => { throw new Error('down'); });
    assert.match(opts[1].textContent, /RTX 3050/);
    assert.equal(applyDeviceLabels(null, {}), null);
});
