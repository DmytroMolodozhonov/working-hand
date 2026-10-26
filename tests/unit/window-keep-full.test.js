import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const asked = [];
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { innerWidth: 1180, innerHeight: 780, devicePixelRatio: 1, addEventListener() {} };
globalThis.fetch = async (_u, o) => { asked.push(JSON.parse(o.body).action); return { json: async () => ({ ok: true }) }; };
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
const cls = new Set();
const doc = { documentElement: { classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } }, addEventListener() {} };

const { becomeAppWindow } = await import('../../src/ui/WindowControls.js');

test('a game window reloaded by a Creative respawn while full screen comes back full screen, never at the menu size', async () => {
    store.set('zns-keep-full', '1');
    assert.equal(await becomeAppWindow({}, doc), true);
    assert.equal(asked[0], 'fullscreen');
    assert.ok(!asked.includes('frameless'));
    assert.ok(cls.has('app-full'));
});
