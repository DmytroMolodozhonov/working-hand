/**
 * The new look: «Волшебство только начинается», the modes Творческий / Хардкор /
 * Выживание with «Карты» as a separate entry, and every mode button starting the
 * right internal mode ('creative' / 'survival' / 'freeworld' / a map).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, realErrors, startFromMenu, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT || 8797);
let srv, browser;
test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch();
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('look: the new name, the logo, the three modes and «Карты»; the old labels are gone', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await page.waitForSelector('.mode-row .mode-card');
    assert.equal(await page.title(), 'Волшебство только начинается');
    assert.equal(await page.textContent('#game-title'), 'Волшебство только начинается');
    // the logo is really there (loaded, not a broken image)
    assert.ok(await page.$eval('.brand-logo', (img) => img.complete && img.naturalWidth > 0));
    // the new fonts are vendored and load (no CDN)
    assert.ok(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 20px Philosopher', 'Волшебство'); }));
    const modes = await page.$$eval('.mode-row .mode-card', (els) => els.map((e) => [e.dataset.mode, e.querySelector('.map-name').textContent]));
    assert.deepEqual(modes, [['creative', 'Творческий'], ['survival', 'Хардкор'], ['freeworld', 'Выживание']]);
    assert.match(await page.textContent('.maps-entry'), /Карты/);
    assert.ok((await page.$$('.map-list-grid .map-card[data-name]')).length >= 1, 'maps are listed under «Карты»');
    const tabs = await page.$$eval('.tab-btn', (els) => els.map((e) => e.textContent.trim()));
    assert.ok(tabs.includes('🎮 Одиночная игра') && tabs.includes('⚙️ Настройки'), tabs.join(','));
    const opts = await page.$$eval('#mp-mode option', (els) => els.map((o) => [o.value, o.textContent.replace(/^\S+\s/, '')]));
    assert.deepEqual(opts, [['creative', 'Творческий'], ['survival', 'Хардкор'], ['freeworld', 'Выживание']]);
    const body = await page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(body, /ЗОМБИ НЕ СПЯТ|Свободный мир|СВОБОДНЫЙ МИР|ТВОРЧЕСТВО|Творчество/);
    // the main sections are a list on the left of the chosen section
    const nav = await page.evaluate(() => {
        const r = (el) => el.getBoundingClientRect();
        const bs = [...document.querySelectorAll('.tab-btn')].map(r);
        return { column: bs.every((b) => Math.abs(b.left - bs[0].left) < 2) && bs.every((b, i) => !i || b.top > bs[i - 1].top), leftOfContent: r(document.querySelector('.tabs')).right <= r(document.querySelector('.tab-content')).left };
    });
    assert.deepEqual(nav, { column: true, leftOfContent: true });
    // choosing a card marks it (and only it)
    await page.click('.mode-card.freeworld');
    assert.deepEqual(await page.$$eval('.map-card.selected', (els) => els.map((e) => e.dataset.mode || e.dataset.name)), ['freeworld']);
    // the menu fits a small window without sideways scrolling
    await page.setViewportSize({ width: 760, height: 540 });
    assert.ok(await page.evaluate(() => document.getElementById('main-menu').scrollWidth <= window.innerWidth + 1));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

for (const [mode, label] of [['creative', 'Творческий'], ['survival', 'Хардкор'], ['freeworld', 'Выживание']]) {
    test(`look: the «${label}» button starts the internal mode '${mode}'`, async () => {
        const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
        await page.waitForSelector('.mode-row .mode-card');
        await page.click(`.mode-card[data-mode="${mode}"]`);
        assert.equal(await page.evaluate(() => window.__zns.readConfig().mode), mode);
        await page.click('#start-btn');
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 90000 });
        const cfg = await page.evaluate(() => ({ mode: window.__zns.game.config.mode, map: !!window.__zns.game.config.map, name: window.__zns.game.config.worldName }));
        assert.equal(cfg.mode, mode);
        assert.equal(cfg.map, false);
        assert.ok(cfg.name.startsWith(label), cfg.name); // the saved world is named with the new label
        // the pause menu opens in the new look
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('pause-menu').classList.contains('hidden'));
        assert.equal(await page.$eval('.pause-title', (el) => getComputedStyle(el).fontFamily.includes('Philosopher')), true);
        assert.deepEqual(realErrors(errors), []);
        await page.close();
    });
}

test('look: a map from «Карты» starts a map game (internally \'survival\' with the map)', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await page.waitForSelector('.map-list-grid .map-card[data-name]');
    const name = await page.$eval('.map-list-grid .map-card[data-name]', (el) => el.dataset.name);
    await startFromMenu(page, name);
    const cfg = await page.evaluate(() => ({ mode: window.__zns.game.config.mode, map: window.__zns.game.config.map?.name }));
    assert.deepEqual(cfg, { mode: 'survival', map: name });
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('look: if the game code fails to start, the screen says so (not a dead menu)', async () => {
    // a normal start: no warning
    const ok = await openPage(browser, srv.url, { noCamera: true });
    await ok.page.waitForSelector('.mode-row .mode-card');
    assert.equal(await ok.page.$('#start-error'), null);
    await ok.page.close();
    // a broken main.js: the warning appears with the reason
    const page = await browser.newPage();
    await page.route('**/src/main.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'import { nope } from "./ui/GameNames.js";' }));
    await page.goto(srv.url);
    await page.waitForSelector('#start-error', { timeout: 15000 });
    assert.match(await page.textContent('#start-error'), /Игра не запустилась/);
    await page.close();
});

test('look: opened as a file (no game server), the screen says how to start the game', async () => {
    const page = await browser.newPage();
    await page.goto('file://' + ROOT + '/index.html');
    await page.waitForSelector('#start-error', { timeout: 15000 });
    assert.match(await page.textContent('#start-error'), /открыта как файл/);
    await page.close();
});

test('look: code served as plain text or a missing game file — the note says which', async () => {
    // a server that gives .js as text/plain (Windows registry, a foreign web server): modules never run
    let page = await browser.newPage();
    await page.route('**/src/main.js', async (r) => { const res = await r.fetch(); r.fulfill({ response: res, headers: { ...res.headers(), 'content-type': 'text/plain' } }); });
    await page.goto(srv.url);
    await page.waitForFunction(() => /как «text\/plain»/.test(document.getElementById('start-error')?.textContent || ''), null, { timeout: 20000 });
    await page.close();
    // one of the game's files is missing
    page = await browser.newPage();
    await page.route('**/src/ui/GameNames.js', (r) => r.fulfill({ status: 404, body: 'File not found' }));
    await page.goto(srv.url);
    await page.waitForFunction(() => /Не загрузился файл игры/.test(document.getElementById('start-error')?.textContent || ''), null, { timeout: 20000 });
    await page.close();
    // a file that fails only on the first load (a busy server refusing a connection): the page reloads by itself and the game starts
    page = await browser.newPage();
    let refused = 0;
    await page.route('**/src/game/Duel.js', (r) => (refused++ === 0 ? r.abort() : r.continue()));
    await page.goto(srv.url);
    await page.waitForSelector('.mode-row .mode-card', { timeout: 30000 });
    await page.waitForFunction(() => window.__zns && window.__zns.startGame && !document.getElementById('start-error'), null, { timeout: 15000 });
    assert.equal(refused, 2, 'loaded again after the failure');
    await page.close();
    // a file deep in the imports that can't be fetched at all: the note names it (the browser itself names only main.js)
    page = await browser.newPage();
    await page.route('**/src/game/Duel.js', (r) => r.abort());
    await page.goto(srv.url);
    await page.waitForFunction(() => /файл игры src\/game\/Duel\.js \(нет связи/.test(document.getElementById('start-error')?.textContent || ''), null, { timeout: 30000 });
    await page.close();
    // the 3D library (imported by its short name 'three') downloads on its own, but never loads as code: named too
    page = await browser.newPage();
    await page.route('**/vendor/three/three.module.js', (r) => (r.request().resourceType() === 'script' ? r.abort() : r.continue()));
    await page.goto(srv.url);
    await page.waitForFunction(() => /файл игры vendor\/three\/three\.module\.js — браузер не принял его как код/.test(document.getElementById('start-error')?.textContent || ''), null, { timeout: 40000 });
    await page.close();
});
