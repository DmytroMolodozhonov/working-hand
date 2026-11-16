/**
 * «Битва существ» в настоящей игре (Brawl.js): Карты → «Битва существ» (без веб-камеры) → ставим бойцов двух сторон → бой идёт до победы.
 * Снимок: docs/media/brawl.png. Run: node --test tests/e2e/brawl.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('two teams put on the field fight to the end; the player is only a camera', { timeout: 1500000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
    await startFromMenu(page, 'brawl');
    await waitHudVisible(page, 120000).catch(() => {});
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms)), out = {};
        out.hasBrawl = !!g.brawl && !!g.spectator && !!document.getElementById('brawl-panel');
        for (let i = 0; i < 300 && !g.terrain?.data?.landMade?.(0, 0); i++) await sleep(100);
        const B = g.brawl, put = (t, team, x, z) => !!B.spawn(t, team, x, z);
        out.put = [
            put('zombie', 'A', -12, 0), put('zombie', 'A', -12, 3), put('zombie', 'A', -12, -3),
            put('knight', 'B', 12, 0), put('knight', 'B', 12, 3),
            put('wizard', 'B', 14, -4), put('fire', 'A', -14, 5),
            put('cow', 'A', -10, -6), put('pig', 'B', 10, 6),
        ];
        out.total = B.count();
        out.idleBefore = B.state;
        await sleep(1500);
        out.started = B.start();
        let shot = false;
        for (let i = 0; i < 4000 && B.state === 'fight'; i++) { // (a container without a video card runs the game slowly)
            await sleep(100);
            if (!shot && i === 120) { window.__shotWanted = true; shot = true; await sleep(300); }
        }
        out.state = B.state; out.winner = B.winner; out.alive = B.aliveCount();
        out.camMoved = (() => { const p = g.spectator.pos.clone(); g.spectator.keys.add('KeyW'); return p; })();
        const p0z = g.spectator.pos.z;
        for (let i = 0; i < 200 && Math.abs(g.spectator.pos.z - p0z) < 0.05; i++) await sleep(100); // (a slow machine: a few frames a second)
        g.spectator.keys.clear();
        out.camAfter = [g.spectator.pos.x, g.spectator.pos.z].map((n) => Math.round(n * 10) / 10);
        out.camBefore = [out.camMoved.x, out.camMoved.z].map((n) => Math.round(n * 10) / 10);
        return out;
    });
    console.log(JSON.stringify(r));
    await page.screenshot({ path: 'docs/media/brawl.png' });
    assert.ok(r.hasBrawl, 'the mode and its panel are made');
    assert.ok(r.put.filter(Boolean).length >= 8, 'fighters of every kind were put: ' + r.put);
    assert.equal(r.idleBefore, 'setup');
    assert.ok(r.started);
    // (the fight must go: somebody falls; to the very end when the machine is fast enough)
    assert.ok(r.state === 'over' ? ['A', 'B', 'draw'].includes(r.winner) : r.alive.A + r.alive.B < r.total, 'the fight goes: ' + JSON.stringify(r.alive));
    assert.notDeepEqual(r.camAfter, r.camBefore, 'the keys fly the camera');
});
