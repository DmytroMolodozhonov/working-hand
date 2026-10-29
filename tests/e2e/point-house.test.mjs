/**
 * Pointing at a house (the author: «показываю рукой на дом — рыцарь не понял, куда»): a synthetic hand ray at the third house of a row,
 * the hand already down by the words (the last 4 s are remembered) — the listener turns to THAT house (head + body), the choice is written
 * in the journal as «указали на дом №.., расстояние .. м, … дверь ..».
 * Run: node --test tests/e2e/point-house.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8168;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the hand on a house in a row: he turns to it; the hand lowered before the words — still that house; the journal says how', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    let ok = false;
    for (let i = 0; i < 100 && !ok; i++) { await new Promise((r) => setTimeout(r, 200)); ok = await page.evaluate(() => !!window.__zns.game.castleLife.byId.get('cvguest:1')); }
    assert.ok(ok);
    const r = await page.evaluate(() => {
        const g = window.__zns.game, life = g.castleLife, C = life.talk.commands;
        const v = life.byId.get('cvguest:1');
        const me = g.character.group.position;
        const o = { x: me.x, y: me.y + 1.5, z: me.z };
        // a row of four houses, 18 m apart, 25 m ahead (north, −z)
        const houses = [-27, -9, 9, 27].map((dx, i) => ({ kind: 'cottage', c: { x: o.x + dx, y: me.y - 1.95, z: o.z - 25 }, r: 7, door: { x: o.x + dx, z: o.z - 16 } }));
        v.cs = { def: { houses } };
        v.x = o.x + 2; v.z = o.z - 3; v.yaw = Math.PI; // (looking away from the houses)
        const tgt = houses[2].c;
        const dir = (t) => { const dx = t.x - o.x, dy = (t.y + 4) - o.y, dz = t.z - o.z, l = Math.hypot(dx, dy, dz); return { x: dx / l, y: dy / l, z: dz / l }; };
        const now = performance.now();
        C._hist = [{ at: now - 2500, ray: { o, d: dir(tgt) } }, { at: now - 1800, ray: { o, d: dir(tgt) } }, { at: now - 200, ray: { o, d: { x: 0, y: -1, z: -0.1 } } }]; // (the hand falls to the feet)
        C.pointRay = () => ({ o, d: { x: 0, y: -1, z: -0.1 }, hand: false });
        C._cmdId = 'enter_house'; C._text = 'войди в тот дом';
        const lines = [];
        const dec = life.alog.decision.bind(life.alog);
        life.alog.decision = (x, t) => { lines.push(t); return dec(x, t); };
        const pk = C.pointHouse(v.cs);
        C._begin(v, 'войди в тот дом', {});
        const want = Math.atan2(-(tgt.x - v.x), -(tgt.z - v.z));
        const dy = Math.atan2(Math.sin(v.yaw - want), Math.cos(v.yaw - want));
        return { i: pk.i, kind: pk.kind, glance: v.glance && { x: v.glance.x, z: v.glance.z }, tgt, turnErr: Math.abs(dy), lines };
    });
    assert.equal(r.i, 2, 'the third house of the row');
    assert.equal(r.kind, 'hit');
    assert.ok(r.glance && Math.abs(r.glance.x - r.tgt.x) < 0.01 && Math.abs(r.glance.z - r.tgt.z) < 0.01, 'he looks at the house');
    assert.ok(r.turnErr < 0.05, 'and the body is turned to it: ' + r.turnErr);
    assert.ok(r.lines.some((l) => /указали на дом №2.*расстояние.*дверь/.test(l)), r.lines.join('\n'));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
