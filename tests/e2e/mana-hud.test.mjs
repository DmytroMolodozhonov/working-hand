/**
 * The mana HUD: big figures «мана / ячейки» over the bar; a spell understood without the mana for it —
 * the bar flashes red; talk with a spell's word in it and the hands down — no advice on the screen.
 * Run: node --test tests/e2e/mana-hud.test.mjs   (ZNS_SHOT=1 also saves docs/ui/mana/*.jpg)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, ROOT } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8173;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('mana HUD: big figures, red flash when mana is short, no advice for plain talk', async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1920, height: 1080 } });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    // hands down, talking: a spell's word among many — nothing on the screen
    await feed(page, { arms: 'down' }, 12, 40);
    const talk = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 30)); };
        await frames(40);
        g.hud.setVoice('', false);
        const v = document.getElementById('voice-status') || g.hud.el.voice;
        const before = v.innerHTML;
        g.castLocalSpell('я тут читал про вингардиум левиоса и вообще думаю что это классная штука', true);
        return { before, after: v.innerHTML, on: v.classList.contains('on') && v.classList.contains('hint') };
    });
    assert.equal(talk.on, false, `no advice for talk: ${talk.after}`);
    // a hand raised, «Бомбардо» said, but the mana is short: the bar flashes red
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        g.combat.maxFatigue = 1000; g.combat.fatigue = 3.4;
        await frames(5);
        g.lastSpellCastTime = 0;
        g.castLocalSpell('бомбардо', true);
        const bar = document.getElementById('fatigue-container');
        return { short: bar.classList.contains('short'), cur: document.getElementById('mana-cur').textContent, max: document.getElementById('mana-max').textContent, size: parseFloat(getComputedStyle(document.getElementById('mana-num')).fontSize) };
    });
    assert.equal(r.short, true, 'the bar flashes');
    assert.equal(r.cur, '3');
    assert.equal(r.max, '1000');
    assert.ok(r.size >= 28, 'big figures');
    if (process.env.ZNS_SHOT) {
        await page.evaluate(() => { const g = window.__zns.game; g.combat.fatigue = 347; });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(ROOT, 'docs/ui/mana/mana-figures.jpg'), type: 'jpeg', quality: 82 });
        await page.evaluate(() => { const g = window.__zns.game; g.combat.fatigue = 3.4; });
        await page.waitForTimeout(300);
        // (the flash is held for the picture: a screenshot of a big page takes longer than the flash)
        await page.evaluate(() => { const h = window.__zns.game.hud; h.manaShort(); for (const e of [h.el.fatigue, h.el.manaNum]) clearTimeout(e._shortT); });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(ROOT, 'docs/ui/mana/mana-short-flash.jpg'), type: 'jpeg', quality: 82 });
    }
});
