/**
 * The quick talk in a real browser (the author: «отвечать МОМЕНТАЛЬНО, как человек»): the Creative guest by the start
 * (CreativeGuest.js) hears the words the moment the native voice says the speaker is quiet (TalkFlow) — not at the
 * phrase's end — turns at once, answers; the phrase's end is no second question; every turn writes its
 * «разговор: …» line (TalkTrace) into the performance diary.
 * Run: node --test tests/e2e/talk-quick.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8167;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('quick talk: the Creative guest answers as soon as I am quiet, turns at once; the end of the same phrase is no second question; the stopwatch line', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    let ok = false;
    for (let i = 0; i < 100 && !ok; i++) {
        await new Promise((r) => setTimeout(r, 200));
        ok = await page.evaluate(() => !!window.__zns.game.castleLife.byId.get('cvguest:1'));
    }
    assert.ok(ok, 'the guest stands by the start');
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = g.castleLife.talk, V = window.__zns.voice;
        T._llmTried = true; // (no real download in the tests)
        const v = g.castleLife.byId.get('cvguest:1');
        const out = { role: v.role, name: v.name, d: Math.hypot(v.x, v.z) };
        // stand before him, looking away a little: he must turn to me
        const me = g.character.group.position;
        me.set(v.x + 2, v.y + 1.95, v.z);
        g.character.group.rotation.y = Math.atan2(2, 0);
        v.yaw = 0.0;
        g.lastMagicTime = 0;
        const asked = [];
        const hear = T.hear.bind(T);
        T.hear = (text, info) => { asked.push({ text, at: performance.now(), info }); return hear(text, info); };
        const lines = [];
        const sink = T.trace.sink;
        T.trace.sink = (l) => { lines.push(l); sink?.(l); };
        const meta = (q, extra = {}) => ({ native: true, seg: 41, q, end: performance.now() - 100, ...extra });
        const t0 = performance.now();
        // the look at the quiet's edge: the words, 0.06 s of quiet
        V.onResult('привет как тебя зовут', false, false, meta(0.064));
        out.before = asked.length; // (not yet: 0.25 s of quiet for a finished phrase)
        V.onQuiet?.(0.15);
        out.mid = asked.length;
        V.onQuiet?.(0.3);
        out.after = asked.length;
        out.ms = asked.length ? Math.round(asked[0].at - t0) : null;
        const want = Math.atan2(-(me.x - v.x), -(me.z - v.z));
        out.turned = Math.abs(Math.atan2(Math.sin(v.yaw - want), Math.cos(v.yaw - want))) < 0.05;
        // the phrase's end, 0.6 s later: the same words — no second question
        await new Promise((res) => setTimeout(res, 300));
        V.onResult('привет как тебя зовут', true, false, meta(0.864));
        out.finalAgain = asked.length;
        // an order to him: «иди за мной» — he goes at once (no standing to talk)
        V.onResult('иди за мной', false, false, { ...meta(0.064), seg: 42 });
        V.onQuiet?.(0.13);
        out.order = asked.length;
        await new Promise((res) => setTimeout(res, 400));
        out.follow = v.follow === g.localId;
        out.talking = v.talking;
        await new Promise((res) => setTimeout(res, 16000)); // (the stopwatch writes a turn's line at the latest after 15 s)
        out.lines = lines;
        return out;
    });
    assert.equal(r.role, 'farmer');
    assert.equal(r.name, 'Тихон');
    assert.ok(r.d < 15, `near the start: ${r.d}`);
    assert.equal(r.before, 0, 'not while I may still be speaking');
    assert.equal(r.mid, 0);
    assert.equal(r.after, 1, 'answered at 0.25 s of quiet');
    assert.ok(r.turned, 'he turned to me at once');
    assert.equal(r.finalAgain, 1, 'the end of the same phrase is no second question');
    assert.equal(r.order, 2, 'an order: at 0.12 s of quiet');
    assert.ok(r.follow, 'he follows me');
    assert.ok(!(r.talking > 0), 'and does not stand there talking');
    assert.ok(r.lines.some((l) => /^разговор: «привет как тебя зовут» → farmer Тихон/.test(l)), r.lines.join('\n'));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
