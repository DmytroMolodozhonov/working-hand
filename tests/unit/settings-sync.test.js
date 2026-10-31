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

// ---- «Общие настройки»: one page, nothing twice, the pause has only the key buttons
const page = () => readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
test('the pause menu has only the key buttons — no settings copies', () => {
    const html = page();
    const pause = html.slice(html.indexOf('<div id="pause-menu"'), html.indexOf('<div id="general-settings"'));
    for (const id of ['pause-continue-btn', 'pause-settings-btn', 'pause-exit-btn']) assert.ok(pause.includes(`id="${id}"`), id);
    for (const gone of ['pause-audio', 'pause-graphics', 'pause-creative', 'pause-quick', 'pause-hands', 'data-pause-tab="pause-audio"', 'data-pause-tab="pause-graphics"', 'data-pause-tab="pause-creative"']) assert.ok(!pause.includes(gone), gone);
    assert.ok(!/<input|<select/.test(pause), 'no controls in the pause menu');
});
test('every setting is in ONE place: no id twice, the hand version once', () => {
    const html = page();
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const seen = new Set(), dup = [];
    for (const id of ids) { if (seen.has(id)) dup.push(id); seen.add(id); }
    assert.deepEqual(dup, []);
    assert.equal((html.match(/name="hand-version"/g) || []).length, 4);
    assert.ok(html.includes('data-tab="tab-settings">⚙️ Общие настройки'));
});
test('«Общие настройки»: every sub-tab has its page, every page its tab, none is empty', () => {
    const html = page();
    const pane = html.slice(html.indexOf('<div id="tab-settings"'), html.indexOf('<div id="tab-editor"'));
    const tabs = [...pane.matchAll(/data-sub="([\w-]+)"/g)].map((m) => m[1]);
    const panes = [...pane.matchAll(/<div id="(set-[\w-]+)" class="sub-pane/g)].map((m) => m[1]);
    assert.deepEqual(tabs, panes);
    assert.deepEqual(tabs.slice(0, 5), ['set-view', 'set-graphics', 'set-audio', 'set-voice', 'set-hero']);
    for (const [id, must] of [['set-view', 'handedness'], ['set-view', 'hand-version-v2'], ['set-view', 'cam-smooth'], ['set-graphics', 'minimap-size'], ['set-graphics', 'hotbar-size'], ['set-graphics', 'view-distance'], ['set-audio', 'music-vol'], ['set-voice', 'voice-engine'], ['set-voice', 'set-voicechat'], ['set-hero', 'hero-model']]) {
        const from = pane.indexOf(`<div id="${id}"`);
        const next = panes[panes.indexOf(id) + 1];
        const part = pane.slice(from, next ? pane.indexOf(`<div id="${next}"`) : undefined);
        assert.ok(part.includes(`id="${must}"`), `${must} in ${id}`);
    }
});
test('the sliders have «Сбросить» with the usual values of the table', () => {
    const html = page();
    for (const q of QUICK) assert.ok(html.includes(`data-reset="${q.id}" data-def="${q.def}"`), q.id);
    assert.ok(html.includes('id="hand-version-reset"'));
});
test('index.html: every <div> is closed (a missing one once broke the whole menu layout)', () => {
    const html = page();
    assert.equal((html.match(/<div\b/g) || []).length, (html.match(/<\/div>/g) || []).length);
});
