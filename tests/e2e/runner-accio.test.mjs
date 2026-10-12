/**
 * The running book and the wand spells, as in real play: a jittering hand, the book running
 * off, the arm pointing roughly (~8° off) at it, the word heard early (interim) and then as the
 * final result. «Акцио» (wand in the right hand) brings it flying into the free left hand;
 * «Раскрой свои секреты» tells its secret; aimed far off it, a hint says why.
 * Run: ZNS_TEST_PORT=8198 node --test tests/e2e/runner-accio.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8198;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

/** A hand that never stands quite still. */
async function jitter(page, n = 6) {
    for (let i = 0; i < n; i++) await feed(page, { arms: 'forward', leftCurl: 0.1, rightCurl: 0.8, wristOffset: [(Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04] }, 3, 33);
}

test('running book in real play: «Акцио» brings it running into the free hand; «Раскрой свои секреты» tells its secret', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.inventory.slots = g.inventory.slots.map((it) => (it?.kind === 'wand' ? null : it));
        g.items.takeIntoHand({ kind: 'wand', uid: 'rw', plain: true, model: 0, color: 0x6b4426, dir: null, fav: null, power: 0 }, 'right');
        g.runner._checkT = 999;
    });
    await jitter(page);
    // a running book about 8° off where the wand hand points, 12 m away: it runs off at once
    const place = () => page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        for (const b of g.runner.books()) g.animals._remove(b);
        const a = g.runner.spawnNear(12);
        const hand = ch.getHandWorldPosition('right', new T.Vector3()), dir = ch.getHandDirection('right', new T.Vector3());
        dir.applyAxisAngle(new T.Vector3(0, 1, 0), 0.14);
        const p = hand.addScaledVector(dir, 12);
        p.y = g.collision.groundY(p.x, p.z);
        a.group.position.copy(p);
        return a.id;
    });
    const say = (word, interim = true) => page.evaluate(async ([word, interim]) => {
        const g = window.__zns.game, Z = window.__zns;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        if (interim) { Z.voice.onResult(word.slice(0, -1), false); await frames(4); Z.voice.onResult(word, false); await frames(12); }
        Z.voice.onResult(word, true);
    }, [word, interim]);

    await place();
    const voices = [];
    await page.exposeFunction('noteVoice', (t) => voices.push(t));
    await page.evaluate(() => { const h = window.__zns.game.hud, sv = h.setVoice.bind(h), st = h.toast?.bind(h); h.setVoice = (t, k) => { window.noteVoice(String(t)); return sv(t, k); }; if (st) h.toast = (t, ms) => { window.noteVoice(String(t)); return st(t, ms); }; });
    await say('акцио');
    let flying = 0;
    for (let i = 0; i < 40; i++) {
        await jitter(page, 1);
        const s = await page.evaluate(() => ({ fly: !!window.__zns.game.runner._fly, left: window.__zns.game.items.held.left?.item }));
        if (s.fly) flying++;
        if (s.left) break;
    }
    const got = await page.evaluate(() => { const g = window.__zns.game; return { left: g.items.held.left?.item || null, right: g.items.held.right?.item.kind, books: g.runner.books().length }; });
    assert.ok(flying >= 1 || got.left?.runbook, 'it flew to the hand ' + JSON.stringify({ flying, got, voices: voices.slice(-4) }));
    assert.ok(got.left?.runbook, 'the running book is in the left hand ' + JSON.stringify({ got, voices: voices.slice(-4) }));
    assert.equal(got.right, 'wand', 'the wand stays in the right hand');

    // «Раскрой свои секреты» on a running one, the wand roughly at it
    await place();
    await page.evaluate(() => { const w = window.__zns.game.wandMagic, orig = w._showHologram.bind(w); window.__shown = null; w._showHologram = (info, at) => { window.__shown = info; orig(info, at); }; });
    await say('раскрой свои секреты');
    const shown = await page.evaluate(() => window.__shown);
    assert.match(shown?.title || '', /Бегущая книга/, 'Reveal shows its secret ' + JSON.stringify(voices.slice(-3)));
    assert.match((shown?.lines || []).join(' '), /30%/);

    // aimed well away from it: a hint says why (not the wand's own secrets)
    await page.evaluate(() => { const g = window.__zns.game, T = window.__zns.THREE; const a = g.runner.books()[0]; const me = g.character.group.position; const back = g.character.getHandDirection('right', new T.Vector3()).multiplyScalar(-10); a.group.position.set(me.x + back.x, a.group.position.y, me.z + back.z); a.stunT = 30; window.__shown = null; g.wandMagic._revealedAt = -1e9; g.items.releaseHand("left"); });
    await say('раскрой свои секреты', false);
    const miss = await page.evaluate(() => window.__shown);
    assert.equal(miss, null, 'no hologram of something else');
    assert.ok(voices.some((t) => /Бегущая книга не там/.test(t)), 'a hint why');
    assert.deepEqual(realErrors(errors), []);
});
