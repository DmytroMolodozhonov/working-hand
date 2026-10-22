/**
 * The running book killed or caught is a thing, like any book: killed — a book lies there
 * (no legs, never runs again); «Левиоса» finds it, «Акцио» brings it into the free left hand
 * (the wand in the right) and it stays there; «Раскрой свои секреты» tells it. Fire burns it
 * up: alive (at once), and in the hand with «Инферно».
 * Run: ZNS_TEST_PORT=8197 node --test tests/e2e/runner-killed.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('running book: killed — a book (Левиоса, Акцио into the left hand and kept, its secret); fire burns it up', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const hands = { arms: 'forward', leftCurl: 0.1, rightCurl: 0.8 };
    await feed(page, hands, 8, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'rkw', plain: true, model: 0, color: 0x6b4426, dir: null, fav: null, power: 0 }, 'right');
        g.runner._checkT = 999;
        const near = () => {
            for (const b of g.runner.books()) g.animals._remove(b);
            const p = ch.group.position.clone().add(new T.Vector3(0, 0, -5).applyQuaternion(ch.group.quaternion));
            p.y = g.collision.groundY(p.x, p.z);
            return g.runner.spawnNear(5, p);
        };
        const rbLoose = () => [...g.items.loose.values()].filter((L) => L.item.runbook);
        // 1) killed by a blow: a book lies there
        const a = near();
        g.animals.hit(a, 10, null, g.localId);
        await frames(3);
        const killed = { animal: g.animals.byId.has(a.id), books: g.runner.books().length, loose: rbLoose().length };
        const L = rbLoose()[0];
        // «Левиоса» sees it as a thing
        const lev = !!g.levitation._candidates().find((c) => c.kind === 'item' && c.obj === L);
        // «Раскрой свои секреты»: its secret
        const secret = (await import('/src/game/ItemTypes.js')).describeItem(L.item)?.title;
        // 2) «Акцио» (the wand in the right hand): into the free left hand — and it stays there
        g.accio._castItem(L, 'left');
        for (let i = 0; i < 120 && !g.items.held.left; i++) await frames(1);
        const took = g.items.held.left?.item.runbook === true;
        return { killed, lev, secret, took, uid: L.item.uid };
    });
    await feed(page, hands, 40, 40); // (the open left hand, as the camera sees it: it keeps the book)
    const kept = await page.evaluate(() => { const g = window.__zns.game; return { left: g.items.held.left?.item.runbook === true, right: g.items.held.right?.item.kind }; });
    const fire = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const rbLoose = () => [...g.items.loose.values()].filter((L) => L.item.runbook).length;
        // 3) «Инферно» said with it in the hand: it burns there
        const was = rbLoose();
        const burntHeld = g.burnHeldBook() && !g.items.held.left;
        // 4) a living one in the flames: burnt up at once — no book left
        for (const b of g.runner.books()) g.animals._remove(b);
        const p = ch.group.position.clone().add(new T.Vector3(0, 0, -5).applyQuaternion(ch.group.quaternion));
        p.y = g.collision.groundY(p.x, p.z);
        const a = g.runner.spawnNear(5, p);
        g.animals.hit(a, 2, null, g.localId, true);
        await frames(3);
        return { burntHeld, aliveGone: !g.animals.byId.has(a.id), noBook: rbLoose() === was };
    });
    assert.ok(!r.killed.animal && r.killed.books === 0 && r.killed.loose === 1, 'killed: a book lies there ' + JSON.stringify(r));
    assert.ok(r.lev, '«Левиоса» finds the killed book');
    assert.match(r.secret || '', /Бегущая книга/, '«Раскрой свои секреты» tells it');
    assert.ok(r.took, '«Акцио»: in the left hand ' + JSON.stringify(r));
    assert.ok(kept.left && kept.right === 'wand', 'it stays in the left hand, the wand in the right ' + JSON.stringify(kept));
    assert.ok(fire.burntHeld, '«Инферно» burns it in the hand');
    assert.ok(fire.aliveGone && fire.noBook, 'fire burns a living one up, nothing left ' + JSON.stringify(fire));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
