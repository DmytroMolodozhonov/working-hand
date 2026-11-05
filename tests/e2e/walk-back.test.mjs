/**
 * «Ходьба назад» in the real game (the author 05.11: «сильно наклонял спину, но никак не уходит»): camera frames of a body leaning
 * back (the shoulders behind the hips in the network's depth) — the hero walks backwards, the way he faces the other; upright — he
 * stands; the setting off — nothing; the setting turned on in the middle of a game works at once.
 * Run: ZNS_TEST_PORT=8273 node --test tests/e2e/walk-back.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8273;
let srv, browser, page, errors;
test.before(async () => {
    srv = await startServer(PORT); browser = await launch({});
    ({ page, errors } = await openPage(browser, srv.url));
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page, Number(process.env.ZNS_START_TIMEOUT || 300000));
});
test.after(async () => { await browser?.close(); srv?.stop(); setTimeout(() => process.exit(0), 500).unref(); });

/** `secs` of frames (30 a second) of a body leaning `back` (the shoulders this far behind the hips, the frame's width) → how far the hero went along his facing (+ forward). */
const play = (back, secs) => page.evaluate(async ({ list }) => {
    const g = window.__zns.game, ch = g.character, p0 = ch.group.position.clone(), yaw = ch.group.rotation.y;
    for (const f of list) { f.ts = performance.now(); window.__zns.poseService.injectRaw(f); await new Promise((r) => setTimeout(r, 33)); }
    const d = ch.group.position.clone().sub(p0);
    return { along: -(Math.sin(yaw) * d.x + Math.cos(yaw) * d.z), log: g._lean };
}, { list: Array.from({ length: Math.round(secs * 30) }, (_, i) => frame({ arms: 'hang', forward: -back + (i % 2 ? 0.002 : -0.002) })) });

const setWalkBack = (on) => page.evaluate((on) => { const el = document.getElementById('walk-back'); el.checked = on; el.dispatchEvent(new Event('change')); }, on);

test('the setting off: leaning back does nothing', async () => {
    await setWalkBack(false);
    await play(0.001, 2);
    const r = await play(0.14, 2);
    assert.ok(Math.abs(r.along) < 0.5, `moved ${r.along}`);
});

test('turned on in the game: upright — stands; leaning back — walks backwards; upright again — stops', async () => {
    await setWalkBack(true);
    const up = await play(0.001, 3);
    assert.ok(Math.abs(up.along) < 0.5, `upright moved ${up.along}`);
    const back = await play(0.14, 3);
    assert.ok(back.along < -2, `leaning back: ${back.along.toFixed(2)} m along the facing (${JSON.stringify(back.log)})`);
    await play(0.001, 1);
    const still = await play(0.001, 2);
    assert.ok(Math.abs(still.along) < 0.6, `upright again: ${still.along}`);
    assert.deepEqual(realErrors(errors), []);
});
