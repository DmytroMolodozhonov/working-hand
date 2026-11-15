import test from 'node:test';
import assert from 'node:assert/strict';
import { crackNodes } from '../../src/fx/QuakeFx.js';

function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

test('the crack runs the whole length, opens narrow, widens, thins to a hairline at its tip and stays near its line', () => {
    const n = crackNodes(rng(7), 20, 0.9, 0.5);
    assert.ok(n.length >= 20);
    assert.ok(n[0].w < n[8].w, 'narrow at the foot');
    assert.ok(n.at(-1).w < n[8].w * 0.6, 'a hairline at the tip');
    for (let i = 1; i < n.length; i++) assert.ok(n[i].d > n[i - 1].d, 'nodes go forward');
    assert.ok(n.every((q) => Math.abs(q.lat) < 4), 'it wanders but does not leave its line');
    assert.ok(n.every((q) => q.w > 0));
});
test('two cracks are not the same crack', () => {
    const a = crackNodes(rng(1), 20, 0.9, 0.5), b = crackNodes(rng(2), 20, 0.9, 0.5);
    assert.notDeepEqual(a.map((q) => q.lat.toFixed(3)), b.map((q) => q.lat.toFixed(3)));
});
