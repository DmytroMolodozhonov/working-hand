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

import { plainName, sameCard } from '../../src/ui/DeviceNames.js';
test('other people\'s cards: Intel / AMD / Mesa / Apple names are the same card however they are written', () => {
    assert.equal(plainName('ANGLE (Intel, Intel(R) UHD Graphics 770 (0x00004688) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'Intel UHD Graphics 770');
    assert.equal(plainName('Mesa Intel(R) UHD Graphics 620 (CFL GT2)'), 'Intel UHD Graphics 620');
    assert.equal(plainName('AMD Radeon RX 6600 (RADV NAVI23)'), 'AMD Radeon RX 6600');
    assert.equal(plainName('ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'AMD Radeon Graphics');
    assert.equal(plainName('Apple M1'), 'Apple M1');
    assert.ok(sameCard('Intel(R) UHD Graphics 770', 'Intel UHD Graphics 770'));
    assert.ok(sameCard('NVIDIA GeForce RTX 3050', 'NVIDIA GeForce RTX 3050 Laptop GPU'));
    assert.ok(!sameCard('NVIDIA GeForce RTX 3050', 'Intel UHD Graphics 770'));
    assert.ok(!sameCard('NVIDIA GeForce RTX 3050', 'NVIDIA GeForce RTX 3060'));
    // an Intel machine: the page's card and the program's are one card, not «есть также» of itself
    const L = deviceLabels({ gpuShort: 'Intel(R) UHD Graphics 770 (0x00004688)', gpuName: 'ANGLE (Intel, Intel(R) UHD Graphics 770 (0x00004688) Direct3D11)', cpu: 'Intel Core i5-12400F', gpus: ['Intel UHD Graphics 770'] });
    assert.equal(L.GPU, 'Видеокарте — Intel UHD Graphics 770');
    // a laptop with two cards, the page on the weak one: both are named
    const H = deviceLabels({ gpuShort: 'Intel(R) Iris(R) Xe Graphics', gpuName: 'ANGLE (Intel…)', cpu: 'x', gpus: ['Intel Iris Xe Graphics', 'NVIDIA GeForce RTX 3050 Laptop GPU'] });
    assert.match(H.GPU, /Intel Iris Xe Graphics \(есть также: NVIDIA GeForce RTX 3050 Laptop GPU\)/);
});
