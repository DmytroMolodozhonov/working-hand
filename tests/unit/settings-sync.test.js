import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUICK, HAND_VERSIONS, HAND_DEFAULT, quickClamp, quickSet, quickReset, quickGet, quickFromSaved, quickIsDefault, handClamp, previewScale } from '../../src/ui/QuickSettings.js';
import { readFileSync } from 'node:fs';

const fakeStore = (init = {}) => {
    const m = new Map(Object.entries(init));
    return { m, get: (id) => m.get(id), set: (id, v) => m.set(id, v) };
};

test('ranges: minimap 60–200, slots 70–160, never outside', () => {
    assert.equal(quickClamp('minimap-size', 999), 200);
    assert.equal(quickClamp('minimap-size', 10), 60);
    assert.equal(quickClamp('hotbar-size', 500), 160);
    assert.equal(quickClamp('hotbar-size', 0), 70);
    assert.equal(quickClamp('cam-smooth', -5), 0);
    assert.equal(quickClamp('cam-sens', 3), 10);
});
test('junk becomes the usual value; values sit on the step', () => {
    for (const q of QUICK) {
        assert.equal(quickClamp(q.id, 'abc'), q.def);
        assert.equal(quickClamp(q.id, NaN), q.def);
        assert.ok(q.def >= q.min && q.def <= q.max);
        assert.equal((q.def - q.min) % q.step, 0);
    }
    assert.equal(quickClamp('hotbar-size', '113'), 110);
});
test('one store: a change in the game is the value everyone reads; reset returns the usual', () => {
    const s = fakeStore({ 'minimap-size': '120' });
    assert.equal(quickSet(s, 'minimap-size', 400), 200);
    assert.equal(s.get('minimap-size'), 200);
    assert.equal(quickGet(s, 'minimap-size'), 200);
    assert.equal(quickIsDefault('minimap-size', 200), false);
    quickReset(s, 'minimap-size');
    assert.equal(s.get('minimap-size'), 120);
    assert.ok(quickIsDefault('minimap-size', s.get('minimap-size')));
});
test('saved settings come back clamped (an old record never leaves the screen)', () => {
    const r = quickFromSaved({ 'minimap-size': '250', 'hotbar-size': '200', 'cam-smooth': '40', handVersion: 'v9' });
    assert.equal(r['minimap-size'], 200);
    assert.equal(r['hotbar-size'], 160);
    assert.equal(r['cam-smooth'], 40);
    assert.equal(r['cam-sens'], 100);
    assert.equal(r.handVersion, HAND_DEFAULT);
    assert.deepEqual(quickFromSaved(null)['cam-smooth'], 70);
});
test('hand versions are the ones of the settings; unknown → usual', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    for (const h of HAND_VERSIONS) assert.ok(html.includes(`name="hand-version" value="${h.v}"`), h.v);
    assert.equal(handClamp('v5'), 'v5');
    assert.equal(handClamp('x'), HAND_DEFAULT);
});
test('the main menu limits are the same as the quick ones (one set of numbers)', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    for (const q of QUICK) {
        const m = html.match(new RegExp(`<input type="range" id="${q.id}"([^>]*)>`));
        assert.ok(m, q.id);
        const g = (a) => +m[1].match(new RegExp(`${a}="(\\d+)"`))[1];
        assert.equal(g('min'), q.min, q.id); assert.equal(g('max'), q.max, q.id); assert.equal(g('value'), q.def, q.id);
    }
});
test('preview grows with the value, stays in the box', () => {
    assert.ok(previewScale('minimap-size', 60) < previewScale('minimap-size', 200));
    assert.equal(previewScale('hotbar-size', 160), 1);
});
