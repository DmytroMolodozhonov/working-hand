/**
 * Throwing with the OFF hand (the left one of a right-hander: the wand in the right hand, the left one deals with the
 * world) — the author: «человек замахнулся, кинул — а предмет просто упал вниз»; «чтобы НИКОГДА больше не было, что
 * человек отпустил кисть, а ничего не получилось». The real game in a browser, synthetic camera pictures (poses.mjs):
 *   - an overhand throw with the left hand: the apple flies far, ahead, at a throw's speed; the wand stays in the right;
 *   - the same throw with the fingers seen opening only after the swing (the camera's blur): still a throw;
 *   - the left hand held out and simply opened: the apple falls from it (not thrown), quickly;
 *   - the left arm lowered to the side as the fingers relax: nothing falls.
 * Run: node --test tests/e2e/throw.test.mjs (ZNS_CHROME=/path/to/chrome for another Chromium build)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed, frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8193;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

async function feedF(page, opts, count) {
    for (let i = 0; i < count; i++) {
        const f0 = await page.evaluate(() => window.__zns.game.frameCount);
        await feed(page, opts, 1, 30);
        for (let k = 0; k < 50 && (await page.evaluate(() => window.__zns.game.frameCount)) < f0 + 1; k++) await new Promise((r) => setTimeout(r, 10));
    }
}

/** An overhand throw with the LEFT hand: drawn back by the head, swung forward over `steps` pictures, the fingers open. */
async function leftOverhand(page, { openAt = 'end', steps = 4 } = {}) {
    await feedF(page, { windup: 'left', leftCurl: 0.9, rightCurl: 0.9 }, 10);
    const a = frame({ windup: 'left', leftCurl: 0.9, rightCurl: 0.9 }), b = frame({ arms: 'forward', leftCurl: 0.9, rightCurl: 0.9 });
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const open = openAt === 'swing' && i >= steps - 1 ? 0 : 0.9;
        const f = frame({ arms: 'forward', leftCurl: open, rightCurl: 0.9 });
        f.poseLandmarks = a.poseLandmarks.map((p, k) => ({ ...p, x: p.x + (b.poseLandmarks[k].x - p.x) * t, y: p.y + (b.poseLandmarks[k].y - p.y) * t, z: p.z + (b.poseLandmarks[k].z - p.z) * t }));
        await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, f);
        await new Promise((r) => setTimeout(r, 33));
    }
    await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0.9 }, 10, 33);
}

const setup = (page) => page.evaluate(() => {
    const g = window.__zns.game;
    for (const s of ['left', 'right']) { g.items.releaseHand(s); g.weapons.release(s); }
    g.inventory.select?.(-1);
    g.items.takeIntoHand({ kind: 'wand', uid: 'thr-wand', count: 1 }, 'right', { closed: true });
    g.items.takeIntoHand({ kind: 'apple', uid: 'thr-apple-l', count: 1 }, 'left', { closed: true });
    window.__log = [];
    const thr = g.items._throw.bind(g.items);
    g.items._throw = (side, v, o) => { window.__log.push({ side, v: v.length(), why: o?.why }); return thr(side, v, o); };
});

const result = (page) => page.evaluate(async () => {
    const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
    const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
    const L = g.items.loose.get('thr-apple-l');
    const wand = g.items.held.right?.item.uid || null;
    if (!L) return { held: g.items.held.left?.item.uid || null, wand, log: window.__log };
    const from = ch.group.position.clone();
    const v = L.vel.clone();
    const look = new T.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion).setY(0).normalize();
    const t0 = performance.now();
    while (!L.rest && performance.now() - t0 < 8000) await frames(2);
    const d = L.model.position.clone().sub(from).setY(0);
    return { held: g.items.held.left?.item.uid || null, wand, speed: v.length(), dist: d.length(), dirAng: d.angleTo(look) * 180 / Math.PI, log: window.__log };
});

test('the off (left) hand throws: far and ahead at a throw\'s speed — also when the fingers are seen opening only after the swing; the wand stays in the right hand', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', leftCurl: 0.9, rightCurl: 0.9 }, 15, 40);
    for (const openAt of ['swing', 'end']) {
        await setup(page);
        await feedF(page, { arms: 'forward', leftCurl: 0.9, rightCurl: 0.9 }, 10);
        await leftOverhand(page, { openAt });
        const r = await result(page);
        assert.equal(r.held, null, `${openAt}: the apple left the left hand ` + JSON.stringify(r));
        assert.equal(r.wand, 'thr-wand', `${openAt}: the wand stays in the right hand`);
        assert.ok(r.speed > 6, `${openAt}: thrown, not dropped (${r.speed?.toFixed(1)} m/s) ` + JSON.stringify(r.log));
        assert.ok(r.dist > 6 && r.dirAng < 35, `${openAt}: far and ahead (${r.dist?.toFixed(1)} m, ${r.dirAng?.toFixed(0)}°) ` + JSON.stringify(r.log));
    }
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('the off (left) hand held out and simply opened: the apple falls from it at once; lowered to the side relaxing: nothing falls', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', leftCurl: 0.9, rightCurl: 0.9 }, 15, 40);
    // lowered to the side, the fingers relaxing on the way
    await setup(page);
    await feedF(page, { arms: 'forward', leftCurl: 0.9, rightCurl: 0.9 }, 12);
    await feedF(page, { arms: 'hang', leftCurl: 0.1, rightCurl: 0.9 }, 40);
    let r = await page.evaluate(() => ({ held: window.__zns.game.items.held.left?.item.uid || null, log: window.__log }));
    assert.equal(r.held, 'thr-apple-l', 'a lowered relaxing arm keeps it ' + JSON.stringify(r.log));
    // held out in front, opened: it falls from the hand, not thrown
    await feedF(page, { arms: 'forward', leftCurl: 0.9, rightCurl: 0.9 }, 15);
    const t0 = await page.evaluate(() => performance.now());
    let at = null;
    for (let i = 0; i < 20 && at === null; i++) {
        await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0.9 }, 1, 33);
        at = await page.evaluate((t0) => (window.__zns.game.items.held.left ? null : performance.now() - t0), t0);
    }
    r = await page.evaluate(() => ({ L: (() => { const L = window.__zns.game.items.loose.get('thr-apple-l'); return L ? { v: L.vel.length() } : null; })(), log: window.__log }));
    assert.ok(at !== null && at < 700, `the opened hand let go in ${at} ms (with the camera's pictures) ` + JSON.stringify(r.log));
    assert.ok(r.L && r.L.v < 4, 'it fell from the hand, not thrown ' + JSON.stringify(r));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
