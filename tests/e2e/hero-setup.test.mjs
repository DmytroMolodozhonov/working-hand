/**
 * «Настройки героя» в окне создания Творческого мира: раздел виден только в Творческом, значения доходят до игры.
 * Run: ZNS_TEST_PORT=8199 node --test tests/e2e/hero-setup.test.mjs  (снимок окна: ZNS_HERO_SHOT=/путь.png)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8199;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

async function openCreate(page) {
    await page.waitForFunction(() => document.getElementById('saved-worlds')?.children.length > 0 && document.querySelector('.mode-row .mode-card'));
    if (await page.isHidden('#create-world')) await page.click('#create-world-btn');
}

test('the hero panel shows with «Творческий» only; defaults are as the author said; the window scrolls on a small screen', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 900 } });
    await openCreate(page);
    await page.click('.mode-card[data-mode="creative"]');
    assert.equal(await page.isVisible('#hero-settings-sp .hero-settings'), true);
    const d = await page.evaluate(() => ({
        inf: document.getElementById('hero-sp-inf').checked, cellsHidden: document.getElementById('hero-sp-cells-row').hidden,
        armor: document.getElementById('hero-sp-armor').checked, robe: document.getElementById('hero-sp-robe').checked,
        spells: document.querySelector('input[name="hero-sp-spells"]:checked').value, duel: document.querySelector('input[name="hero-sp-duel"]:checked').value,
        advOpen: document.querySelector('#hero-settings-sp .hero-adv').open,
    }));
    assert.deepEqual(d, { inf: true, cellsHidden: true, armor: true, robe: true, spells: 'all', duel: 'full', advOpen: false });
    await page.uncheck('#hero-sp-inf');
    assert.equal(await page.isVisible('#hero-sp-cells'), true);
    assert.equal(await page.inputValue('#hero-sp-cells'), '500');
    await page.check('input[name="hero-sp-duel"][value="custom"]');
    assert.equal(await page.isVisible('#hero-sp-duel-pct'), true);
    await page.click('#hero-settings-sp .hero-adv summary');
    if (process.env.ZNS_HERO_SHOT) await page.screenshot({ path: process.env.ZNS_HERO_SHOT, fullPage: false });
    await page.click('.mode-card[data-mode="freeworld"]');
    assert.equal(await page.isVisible('#hero-settings-sp .hero-settings'), false);
    await page.setViewportSize({ width: 380, height: 640 });
    await page.click('.mode-card[data-mode="creative"]');
    const box = await page.evaluate(() => { const e = document.querySelector('#hero-settings-sp .hero-settings'); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, scroll: getComputedStyle(e).overflowY }; });
    assert.equal(box.scroll, 'auto');
    assert.ok(box.sw <= box.cw + 2, `no sideways scroll ${JSON.stringify(box)}`);
    assert.deepEqual(realErrors(errors), []);
});

test('a Creative world made with finite mana, only the armour, the mage spells and 40% duel strength', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await openCreate(page);
    await page.click('.mode-card[data-mode="creative"]');
    await page.uncheck('#hero-sp-inf');
    await page.fill('#hero-sp-cells', '120');
    await page.uncheck('#hero-sp-robe');
    await page.check('input[name="hero-sp-spells"][value="mage"]');
    await page.check('input[name="hero-sp-duel"][value="custom"]');
    await page.fill('#hero-sp-duel-pct', '40');
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 90000 });
    await waitHudVisible(page);
    const r = await page.evaluate(() => {
        const g = window.__zns.game;
        return { hero: g.hero, saved: g.config.hero, manaOn: g.combat.manaOn, max: g.combat.maxFatigue, fat: g.combat.fatigue,
            worn: Object.fromEntries(Object.entries(g.armor.worn).map(([k, v]) => [k, !!v && v.magic])),
            boom: g.knowsSpell('Boom'), bomb: g.knowsSpell('Bombardo'), insp: g.knowsSpell('Inspirius'), barShown: !document.getElementById('fatigue-container')?.classList.contains('hidden') };
    });
    assert.equal(r.hero.infiniteMana, false); assert.equal(r.hero.cells, 120); assert.equal(r.hero.duel, 40);
    assert.equal(r.manaOn, true); assert.equal(r.max, 120); assert.ok(r.fat <= 120 && r.fat > 0);
    assert.deepEqual(r.worn, { helmet: true, chest: true, legs: true, robe: false });
    assert.equal(r.boom, false); assert.equal(r.insp, false); assert.equal(r.bomb, true);
    // the mana is really spent
    const spent = await page.evaluate(() => { const c = window.__zns.game.combat; const was = c.fatigue; c.pay('Bombardo'); return was - c.fatigue; });
    assert.ok(spent > 0, 'mana is spent in Creative with finite mana');
    assert.deepEqual(realErrors(errors), []);
});

test('an old Creative world (no hero record) plays as before: endless mana, all spells, no armour or robe', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await openCreate(page);
    await page.evaluate(() => window.__zns.startGame({ ...window.__zns.readConfig(), mode: 'creative', map: null, worldName: 'Старый' }));
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 90000 });
    const r = await page.evaluate(() => { const g = window.__zns.game; return { manaOn: g.combat.manaOn, boom: g.knowsSpell('Boom'), worn: Object.values(g.armor.worn).filter(Boolean).length, hero: g.config.hero }; });
    assert.deepEqual(r, { manaOn: false, boom: true, worn: 0, hero: undefined });
    assert.deepEqual(realErrors(errors), []);
});
