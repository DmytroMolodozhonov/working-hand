/**
 * Hints in the real game: a blast throws me off my feet and the line says why; a spell said with the
 * hand down, or a water spell away from water, says why it did not work.
 * Run: ZNS_TEST_PORT=8271 node --test tests/e2e/hints.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8271;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); setTimeout(() => process.exit(0), 500).unref(); });

const pose = (page, opts, n = 10) => page.evaluate(async ([f, n]) => {
    for (let i = 0; i < n; i++) { f.ts = performance.now(); window.__zns.poseService.injectRaw(f); await new Promise((r) => setTimeout(r, 33)); }
}, [frame(opts), n]);
const voice = (page) => page.evaluate(() => window.__zns.game.hud.voiceText());

test('a blast: «Вас отбросило взрывом»; the hand down / no water: why the spell did not work', async () => {
    const { page, errors } = await openPage(browser, srv.url);
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await pose(page, { arms: 'hang' }, 20);

    // a «Бомбардо» blast right next to me (someone else's)
    await page.evaluate(() => {
        const g = window.__zns.game, p = g.character.group.position;
        g.explode(new window.__zns.THREE.Vector3(p.x + 1, p.y + 0.5, p.z), 4, 'someone', 1);
    });
    await page.waitForFunction(() => window.__zns.game.knock.down, null, { timeout: 10000, polling: 100 });
    assert.match(await voice(page), /отбросило взрывом «Bombardo»/);
    // big, at the top (not in the middle where spells are aimed), and it fades by itself after ~5 s
    const box = await page.evaluate(() => {
        const el = document.getElementById('voice-debug'), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, size: parseFloat(cs.fontSize), weight: cs.fontWeight, h: innerHeight, w: innerWidth, hint: el.classList.contains('hint') };
    });
    if (process.env.ZNS_SHOT) await page.screenshot({ path: process.env.ZNS_SHOT });
    assert.ok(box.hint && box.size >= 24 && +box.weight >= 700, `big and bold: ${JSON.stringify(box)}`);
    assert.ok(box.top >= 100 && box.bottom < box.h * 0.4 && box.left >= 0 && box.right <= box.w, `at the top, on the screen: ${JSON.stringify(box)}`);
    await page.waitForFunction(() => !document.getElementById('voice-debug').classList.contains('on'), null, { timeout: 8000, polling: 200 });

    // the hand hanging down: «Бомбардо» does not fly, and the line says why
    await page.evaluate(() => { const g = window.__zns.game; g.knock.reset(); g.lastSpellCastTime = 0; g.isMagicActive = false; g.lastMagicTime = 0; });
    await pose(page, { arms: 'hang' }, 10);
    await page.evaluate(() => { const g = window.__zns.game; g.isMagicActive = false; g.lastMagicTime = 0; return g._castLocalSpell('бомбардо', true); });
    assert.match(await voice(page), /рука опущена/);

    // «Wave Attack» far from water: told to stand at the water and point at it
    const r = await page.evaluate(() => window.__zns.game._castLocalSpell('wave attack', true));
    assert.equal(r, null);
    assert.match(await voice(page), /воды|воду/);
    assert.deepEqual(realErrors(errors), []);
});
