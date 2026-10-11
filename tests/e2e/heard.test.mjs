/**
 * The words the microphone is catching: a big bold short line only in Creative; in the other
 * modes no words line at all, but the game's own messages still show.
 * Run: node --test tests/e2e/heard.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8183;
let srv, browser;
test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

const LONG = 'ну привет как у тебя сегодня дела в замке старина рыцарь';

test('heard: Creative shows only the newest few words, big and bold, then it fades', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async (long) => {
        window.__zns.voice.onResult(long, false);
        const el = document.getElementById('voice-heard');
        const cs = getComputedStyle(el);
        // (against the small «ЖДУ КОМАНДУ» indicator; a game hint on that line is big on purpose — Hud.setVoice)
        const dl = document.getElementById('voice-debug'), wasHint = dl.classList.contains('hint');
        dl.classList.remove('hint');
        const dbg = parseFloat(getComputedStyle(dl).fontSize);
        if (wasHint) dl.classList.add('hint');
        const now = { text: el.textContent, on: el.classList.contains('on'), weight: cs.fontWeight, size: parseFloat(cs.fontSize), dbg, inDebug: document.getElementById('voice-debug').innerText };
        await new Promise((res) => setTimeout(res, 2200));
        return { ...now, later: el.classList.contains('on') };
    }, LONG);
    assert.equal(r.text, 'в замке старина рыцарь');
    assert.ok(r.text.split(' ').length <= 4);
    assert.ok(r.on, 'shown while speaking');
    assert.equal(r.weight, '700');
    assert.ok(r.size >= 2 * r.dbg, `twice as big: ${r.size} vs ${r.dbg}`);
    assert.doesNotMatch(r.inDebug, /привет|рыцарь/, 'the words are not in the message line');
    assert.equal(r.later, false, 'fades after the speech stops');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('heard: in the free world no words line, but game messages still appear', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(async (long) => {
        const g = window.__zns.game;
        window.__zns.voice.onResult(long, true);
        const el = document.getElementById('voice-heard');
        const shown = !!el && el.classList.contains('on');
        g.hud.setVoice('🌀 Не хватает маны');
        await new Promise((res) => setTimeout(res, 100));
        const dbg = document.getElementById('voice-debug');
        return { shown, text: el?.textContent || '', msg: dbg.innerText, visible: getComputedStyle(dbg).display !== 'none' };
    }, LONG);
    assert.equal(r.shown, false);
    assert.equal(r.text, '');
    assert.match(r.msg, /Не хватает маны/);
    assert.ok(r.visible);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
