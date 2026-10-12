/**
 * The running book and the wand spells: «Акцио» with the wand in the right hand brings it
 * flying into the free left hand; «Раскрой свои секреты» aimed at it tells its secret.
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

test('running book: «Акцио» (wand in the right hand) — it flies into the left hand; «Раскрой свои секреты» tells its secret', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'rw', plain: true, model: 0, color: 0x6b4426, dir: null, fav: null, power: 0 }, 'right');
    });
    await feed(page, { arms: 'forward', leftCurl: 0.1, rightCurl: 0.8 }, 20, 33);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        // a running book right where the wand hand points, stunned so it stands still
        const put = (a) => {
            const hand = ch.getHandWorldPosition('right', new T.Vector3()), dir = ch.getHandDirection('right', new T.Vector3());
            const p = hand.addScaledVector(dir, 8);
            p.y = g.collision.groundY(p.x, p.z);
            a.group.position.copy(p);
            a.stunT = 30;
        };
        const a = g.runner.spawnNear(8);
        put(a);
        const raised = ch.isArmRaised('right');
        g.accio.cast();
        let flying = 0;
        for (let i = 0; i < 80 && !g.items.held.left; i++) { await frames(1); if (g.runner._fly) flying++; }
        const left = g.items.held.left?.item;
        // a second one: the wand pointed at it — «Раскрой свои секреты»
        let shown = null;
        const orig = g.wandMagic._showHologram.bind(g.wandMagic);
        g.wandMagic._showHologram = (info, at) => { shown = info; orig(info, at); };
        g.runner._checkT = 999;
        const b = g.runner.spawnNear(8);
        put(b);
        const tip = g.wandMagic.tip(new T.Vector3(), new T.Vector3()), wdir = new T.Vector3();
        g.wandMagic.tip(new T.Vector3(), wdir);
        const p = tip.addScaledVector(wdir, 8); p.y = g.collision.groundY(p.x, p.z); b.group.position.copy(p);
        g.wandMagic.reveal();
        return { raised, flying, left: left ? { runbook: !!left.runbook, wild: !!left.wild } : null, right: g.items.held.right?.item.kind, books: g.runner.books().length, shown };
    });
    assert.ok(r.raised, 'the wand arm is raised');
    assert.ok(r.flying > 2, `it flew to the hand (${r.flying} frames)`);
    assert.deepEqual(r.left, { runbook: true, wild: false }, 'the running book is in the left hand');
    assert.equal(r.right, 'wand', 'the wand stays in the right hand');
    assert.match(r.shown?.title || '', /Бегущая книга/, 'Reveal shows its secret');
    assert.match((r.shown?.lines || []).join(' '), /30%/);
    assert.deepEqual(realErrors(errors), []);
});
