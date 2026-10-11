/**
 * The running book — in a real browser, caught with synthetic hands.
 * Run: ZNS_TEST_PORT=8177 node --test tests/e2e/runner.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8177;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('running book: found running about, caught by a closing hand as it passes — run ×1.3 once; death takes it away', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    // a running book comes (as the host brings one) and runs from me
    const found = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const a = g.runner.spawnNear(9);
        const p0 = a.group.position.clone();
        await frames(40);
        const books = g.runner.books();
        const ran = a.group.position.distanceTo(p0);
        // the running speed before
        const ch = g.character;
        const speed = () => { const s = ch.group.position.clone(); ch.isRunning = true; ch.runIntensity = 1; ch.update(0.1, null, true); ch.isRunning = false; const d = Math.hypot(ch.group.position.x - s.x, ch.group.position.z - s.z); ch.group.position.x = s.x; ch.group.position.z = s.z; return d / 0.1; };
        // spells work on it as on any creature
        const lev = g.levitation._candidates().some((c) => c.obj === a);
        g.duel.applyToCreature('Stupefy', a, g.localId);
        const stunned = a.stunT > 5;
        const ps = a.group.position.clone();
        await frames(10);
        const stood = a.group.position.distanceTo(ps);
        a.stunT = 0;
        return { n: books.length, model: !!a.model.userData.runbook, ran, mode: a.rb?.mode, before: speed(), lev, stunned, stood };
    });
    assert.equal(found.n, 1, 'one running book about');
    assert.ok(found.model, 'a book on legs');
    assert.ok(found.lev, '«Левиоса» can lift it');
    assert.ok(found.stunned && found.stood < 0.3, `«Остолбеней» stops it (${found.stood.toFixed(2)} m)`);
    assert.ok(found.ran > 2, `it ran from me (${found.ran.toFixed(1)} m)`);
    assert.ok(Math.abs(found.before - 7.5) < 0.05, `normal run 7.5 m/s (${found.before})`);

    // it runs past my open right hand: the book's body goes across the palm while the fingers close
    const pass = async () => {
        await page.evaluate(() => {
            const g = window.__zns.game;
            const a = g.runner.books()[0];
            a.lev = true; // (held on its course for the test: the hand comes, not the camera's luck)
            const ch = g.character;
            const T = window.__zns.THREE;
            let k = -1;
            window.__rbPass = setInterval(() => {
                const hand = ch.getHandWorldPosition('right', new T.Vector3());
                const right = new T.Vector3(Math.cos(ch.group.rotation.y), 0, -Math.sin(ch.group.rotation.y));
                k = Math.min(1, k + 0.05);
                a.group.position.copy(hand).addScaledVector(right, k * 0.5).setY(hand.y - 0.72 * 1.6);
            }, 16);
        });
        await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 8, 40);
        await feed(page, { arms: 'forward', rightCurl: 0.95, leftCurl: 0 }, 10, 40);
        return page.evaluate(() => { clearInterval(window.__rbPass); return null; });
    };
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 10, 40);
    await pass();
    const caught = await page.evaluate(() => {
        const g = window.__zns.game;
        const ch = g.character;
        const s = ch.group.position.clone(); ch.isRunning = true; ch.runIntensity = 1; ch.update(0.1, null, true); ch.isRunning = false;
        const v = Math.hypot(ch.group.position.x - s.x, ch.group.position.z - s.z) / 0.1;
        ch.group.position.x = s.x; ch.group.position.z = s.z;
        return { left: g.runner.books().length, bonus: g.bonus?.run, mul: ch.runBonus, v, toast: document.getElementById('hud-toast')?.textContent || '' };
    });
    assert.equal(caught.left, 0, 'the caught book gave its quickness and vanished');
    assert.equal(caught.bonus, 0.3);
    assert.ok(Math.abs(caught.v - 7.5 * 1.3) < 0.05, `run ×1.3 (${caught.v.toFixed(2)} m/s)`);
    assert.match(caught.toast, /30%/);

    // a second one: nothing more, it wriggles out
    await page.evaluate(() => { window.__zns.game.runner.spawnNear(6); });
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 10, 40);
    await pass();
    const second = await page.evaluate(() => {
        const g = window.__zns.game;
        return { left: g.runner.books().length, bonus: g.bonus?.run, mul: g.character.runBonus, toast: document.getElementById('hud-toast')?.textContent || '' };
    });
    assert.equal(second.left, 1, 'the second book is still there');
    assert.equal(second.bonus, 0.3, 'no more than +30%');
    assert.match(second.toast, /уже/);

    // death takes it away
    const dead = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        g.combat.damage(999, null, 'test');
        await frames(5);
        return { bonus: g.bonus?.run ?? 0, mul: g.character.runBonus };
    });
    assert.equal(dead.bonus, 0, 'the bonus is lost on death');
    assert.equal(dead.mul, 1);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
