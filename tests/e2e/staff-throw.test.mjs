/**
 * The wanderer's staff and the wand: a real throw works from either hand; waving never throws.
 * Run: node --test tests/e2e/staff-throw.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed, frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8188;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

/** Feed pose frames, each one seen by at least one game frame (a slow headless page draws few). */
async function feedF(page, opts, count) {
    for (let i = 0; i < count; i++) {
        const f0 = await page.evaluate(() => window.__zns.game.frameCount);
        await feed(page, opts, 1, 30);
        for (let k = 0; k < 50 && (await page.evaluate(() => window.__zns.game.frameCount)) < f0 + 1; k++) await new Promise((r) => setTimeout(r, 10));
    }
}

/**
 * An overhand throw as the camera sees it: the hand drawn back by the head, then swung forward
 * over a few pictures (~30 a second), the fingers still closed, then they open.
 */
async function overhand(page, { curlOpen = 0, steps = 4, side = 'right' } = {}) {
    const o = side === 'right' ? 'left' : 'right', C = { [side + 'Curl']: 0.9, [o + 'Curl']: 0.9 }, O = { [side + 'Curl']: curlOpen, [o + 'Curl']: 0.9 };
    await feedF(page, { windup: side, ...C }, 10);
    const a = frame({ windup: side, ...C }), b = frame({ arms: 'forward', ...C });
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const f = frame({ arms: 'forward', ...C });
        f.poseLandmarks = a.poseLandmarks.map((p, k) => ({ ...p, x: p.x + (b.poseLandmarks[k].x - p.x) * t, y: p.y + (b.poseLandmarks[k].y - p.y) * t, z: p.z + (b.poseLandmarks[k].z - p.z) * t }));
        f.hands = b.hands.map((h, j) => ({ ...h, landmarks: h.landmarks.map((p, k) => { const q = a.hands[j].landmarks[k]; return { x: q.x + (p.x - q.x) * t, y: q.y + (p.y - q.y) * t, z: q.z + (p.z - q.z) * t }; }) }));
        await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, f);
        await new Promise((r) => setTimeout(r, 33));
    }
    await feed(page, { arms: 'forward', ...O }, 8, 33);
}


for (const [side, staff] of [['left', true], ['right', true], ['left', false]]) {
    test(`a ${staff ? 'wanderer\'s staff' : 'wand'} thrown for real from the ${side} hand flies off; waved about, it stays`, async () => {
        const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
        await startFromMenu(page, 'creative');
        await waitHudVisible(page);
        const uid = 'thr-' + side + (staff ? '-staff' : '-wand'), other = side === 'left' ? 'right' : 'left';
        await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 6);
        await page.evaluate(([side, staff, uid]) => {
            const g = window.__zns.game;
            for (const s of ['left', 'right']) { g.items.releaseHand(s); g.weapons.release(s); }
            g.items.takeIntoHand({ kind: 'wand', uid, plain: !staff, staff, model: 0, color: 0x8b5a2b, power: 0 }, side);
        }, [side, staff, uid]);
        await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10);
        const held = () => page.evaluate(([side, uid]) => window.__zns.game.items.held[side]?.item.uid === uid, [side, uid]);
        const c = (v) => ({ [side + 'Curl']: v, [other + 'Curl']: 0.9 });
        for (let k = 0; k < 4; k++) {
            await feedF(page, { arms: 'up', ...c(0.9) }, 6);
            await feedF(page, { arms: 'forward', ...c(0.15) }, 6);
        }
        assert.ok(await held(), uid + ': waved about, it stays');
        await feedF(page, { arms: 'forward', ...c(0.9) }, 8);
        await page.evaluate(([side]) => {
            const g = window.__zns.game, it = g.items;
            window.__why = [];
            const upd = it.update.bind(it);
            it.update = (dt) => { const h = it.held[side]; if (h) window.__why.push(JSON.stringify({ fast: !!(g.character.flying || g.character.knockedDown), touch: it._touching(side, h, it._clock || 0), busy: !!g.spellBusy?.(), other: it._otherHandTakes(side, h), thr: { cock: !!it._thr[side].cock, back: it._thr[side].back, peak: it._thr[side].peak && +it._thr[side].peak.speed.toFixed(1), held: it._thr[side].held } })); if (window.__why.length > 12) window.__why.shift(); return upd(dt); };
        }, [side]);
        // (a long staff's foot drags over the ground in a real swing: that is no reason to keep it)
        if (staff) await page.evaluate(() => { window.__zns.game.handBlocks.solid = () => true; });
        await overhand(page, { steps: 2, side });
        const r = await page.evaluate((uid) => { const L = window.__zns.game.items.loose.get(uid); return { loose: !!L, v: L ? L.vel.length() : 0 }; }, uid);
        const why = await page.evaluate(() => (window.__why || []).join('\n'));
        assert.ok(!(await held()) && r.loose && r.v > 3, uid + ': a real throw sends it flying ' + JSON.stringify(r) + '\n' + why);
        assert.deepEqual(realErrors(errors), []);
        await page.close();
    });
}
