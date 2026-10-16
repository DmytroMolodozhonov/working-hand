/**
 * The armour worn shows as extra health under the (big) HP bar: «🛡 +N» grows as pieces go on and
 * flashes red when a blow takes from it. Run: node --test tests/e2e/armor-hp.test.mjs
 * (ZNS_SHOT=1 also saves docs/ui/armor-hp.jpg)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8175;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('armour HP: «🛡 +N» under the HP bar, grows when worn, flashes when hit', async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1920, height: 1080 } });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const box = document.getElementById('armor-hp'), txt = () => document.getElementById('armor-hp-text').textContent;
        const none = box.classList.contains('hidden');
        const { makePiece } = await import('/src/game/ArmorTypes.js');
        g.armor.wear(makePiece('helmet'), { quiet: true });
        const one = txt();
        g.armor.wear(makePiece('chest'), { quiet: true });
        const two = txt(), grew = box.classList.contains('grow');
        for (let i = 0; i < 20 && txt() === two; i++) g.armor.absorb(6, 'melee'); // (a blow lands where it lands: bare skin too)
        return { none, one, two, grew, hit: txt(), flash: box.classList.contains('hit'), hp: document.getElementById('hp-text').textContent, size: parseFloat(getComputedStyle(document.getElementById('hp-text')).fontSize) };
    });
    assert.equal(r.none, true, 'nothing worn: no armour bar');
    const n = (s) => Number(s.replace(/\D/g, ''));
    assert.ok(n(r.one) > 0 && n(r.two) > n(r.one), `grows: ${r.one} → ${r.two}`);
    assert.equal(r.grew, true);
    assert.ok(n(r.hit) < n(r.two), `a blow takes from it: ${r.two} → ${r.hit}`);
    assert.equal(r.flash, true);
    assert.ok(r.size >= 24, 'big HP figures');
    if (process.env.ZNS_SHOT) {
        const clip = { x: 0, y: 0, width: 960, height: 200 };
        await page.evaluate(() => { const b = document.getElementById('armor-hp'); clearTimeout(b._flashT); });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(ROOT, 'docs/ui/armor-hp-hit.jpg'), type: 'jpeg', quality: 88, clip });
        await page.evaluate(() => document.getElementById('armor-hp').classList.remove('hit', 'grow'));
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(ROOT, 'docs/ui/armor-hp.jpg'), type: 'jpeg', quality: 88, clip });
    }
});
