/**
 * The game's own window (launcher/zns_browser.py): the saves come over from the usual browser profile.
 * Two browser contexts stand for the two profiles; the real server.py carries the saves between them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, launch, sleep } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8147;
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'zns-home-'));
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT, { env: { ZNS_LAUNCHER_HOME: HOME } });
    browser = await launch();
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
    fs.rmSync(HOME, { recursive: true, force: true });
});

const worlds = (page) => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('zns-worlds', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('worlds', { keyPath: 'id' });
    r.onsuccess = () => { const q = r.result.transaction('worlds').objectStore('worlds').getAll(); q.onsuccess = () => res(q.result); };
}));

test('the old profile\'s worlds and settings appear in the game\'s own window, nothing overwritten', async () => {
    // the usual profile: a world (with a typed array, a Set) and the settings
    const old = await browser.newContext();
    const a = await old.newPage();
    await a.goto(srv.url + 'theme.css'); // (a page of the game's origin: its storage)
    await a.evaluate(() => new Promise((res) => {
        localStorage.setItem('zns-name', 'Мерлин');
        localStorage.setItem('zns-srv-name', 'Старый сервер');
        const r = indexedDB.open('zns-worlds', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('worlds', { keyPath: 'id' });
        r.onsuccess = () => {
            const t = r.result.transaction('worlds', 'readwrite');
            t.objectStore('worlds').put({ id: 'w1', name: 'Мой мир', seed: 7, edits: [[1, 2, 3]], grid: new Uint8Array([4, 5, 250]), chests: new Set(['c1']), updated: 5 });
            t.oncomplete = () => res();
        };
    }));
    // what the server does: opens profile-export.html in the old profile
    await a.goto(srv.url + 'profile-export.html');
    for (let i = 0; i < 50 && !fs.existsSync(path.join(HOME, 'profile-transfer.json')); i++) await sleep(100);
    assert.ok(fs.existsSync(path.join(HOME, 'profile-transfer.json')), 'the saves reached the server');

    // the game's own profile: one setting of its own already
    const own = await browser.newContext();
    const b = await own.newPage();
    await b.goto(srv.url + 'theme.css');
    await b.evaluate(() => localStorage.setItem('zns-srv-name', 'Мой сервер'));
    await b.goto(srv.url + '?app=own');
    await b.waitForFunction(() => localStorage.getItem('zns-profile-transfer'), null, { timeout: 30000 });
    assert.equal(await b.evaluate(() => localStorage.getItem('zns-name')), 'Мерлин');
    assert.equal(await b.evaluate(() => localStorage.getItem('zns-srv-name')), 'Мой сервер', 'never overwritten');
    const w = await b.evaluate(() => new Promise((res) => {
        const r = indexedDB.open('zns-worlds', 1);
        r.onsuccess = () => { const q = r.result.transaction('worlds').objectStore('worlds').get('w1'); q.onsuccess = () => { const v = q.result; res(v && { name: v.name, grid: v.grid instanceof Uint8Array ? [...v.grid] : null, set: v.chests instanceof Set ? [...v.chests] : null, edits: v.edits }); }; };
    }));
    assert.deepEqual(w, { name: 'Мой мир', grid: [4, 5, 250], set: ['c1'], edits: [[1, 2, 3]] });
    // the game started after it, and a usual window (no ?app=own) never asks
    await b.waitForFunction(() => window.__zns?.startGame, null, { timeout: 60000 });
    assert.ok((await worlds(b)).length === 1);
    await old.close();
    await own.close();
});
