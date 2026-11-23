import test from 'node:test';
import assert from 'node:assert/strict';
import { updateIfNewer } from '../../src/ui/UpdateScreen.js';

test('an unavailable launcher is tried again later for the same version', async (t) => {
    t.mock.method(Date, 'now', () => now);
    const oldStorage = globalThis.sessionStorage, oldFetch = globalThis.fetch;
    const saved = new Map();
    let now = 30000, requests = 0;
    globalThis.sessionStorage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) };
    globalThis.fetch = async () => { requests++; return { ok: false }; };
    try {
        const info = { have: 'aaaaaaa', latest: 'bbbbbbb', latestFull: 'b'.repeat(40) };
        assert.equal(await updateIfNewer(info), false);
        assert.equal(await updateIfNewer(info), false);
        assert.equal(requests, 1);
        now += 9000;
        assert.equal(await updateIfNewer(info), false);
        assert.equal(requests, 2);
        assert.equal(saved.size, 0);
    } finally {
        globalThis.sessionStorage = oldStorage;
        globalThis.fetch = oldFetch;
    }
});
