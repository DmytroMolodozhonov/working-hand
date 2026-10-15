/**
 * «Wind Impulse», «Liquidation», «Stitching», «Drawdown», «Invisibility» in a real browser (Creative):
 * the hands as the camera sees them + the words. Run: ZNS_TEST_PORT=8193 node --test tests/e2e/new-spells.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

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

const pose = (page, raw) => page.evaluate((raw) => {
    clearInterval(window.__nsPose);
    window.__nsPose = setInterval(() => window.__zns.poseService.injectRaw({ ...JSON.parse(JSON.stringify(raw)), ts: performance.now() }), 33);
}, raw);

test('the five new spells work in the game', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // ---- arms forward: «Liquidation», «Stitching»
    await pose(page, frame({ arms: 'forward', wristOffset: [0, 0.05], rightTilt: 1.57 }));
    await page.waitForFunction(() => window.__zns.game.character.isArmRaised('right'), null, { timeout: 20000 });
    const a = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const o = g.castOrigin('right', new T.Vector3());
        const d = ch.getHandDirection('right');
        // a piece of cheese and a wand on the hand's line
        // (where the hand points now: the hand moves a little between two casts)
        const side = () => { const pref = g.magicHand || g.lastMagicHand || 'right'; return ch.isArmRaised(pref) ? pref : 'right'; };
        const at = (k) => g.castOrigin(side(), new T.Vector3()).addScaledVector(ch.getHandDirection(side()), k);
        g.items.spawnLoose({ kind: 'cheese', uid: 'ns-cheese', count: 1 }, at(4), { hover: true });
        const liq = g.castLocalSpell('ликвидейшн', true);
        await frames(40);
        const cheeseGone = !g.items.loose.has('ns-cheese');
        g.items.spawnLoose({ kind: 'wand', uid: 'ns-wand', power: 10 }, at(4), { hover: true });
        await frames(70);
        g.castLocalSpell('ликвидейшн', true);
        await frames(40);
        const wandStays = g.items.loose.has('ns-wand');
        await frames(70);
        const W = g.items.loose.get('ns-wand');
        if (W) { W.model.position.copy(at(4)); if (W.hover) W.hover.copy(W.model.position); }
        const liqMax = g.castLocalSpell('ликвидейшн максима', true);
        await frames(40);
        const wandGone = !g.items.loose.has('ns-wand');
        // a brick wall across the hand's line with a doorway (1×2) right on it
        const data = g.terrain.data;
        const ax = Math.abs(d.x) >= Math.abs(d.z) ? 'x' : 'z';
        const p = at(5);
        const wx = Math.round(p.x), wz = Math.round(p.z), base = data.topLayer(wx, wz) + 1;
        const B = 26; // BLOCK.BRICK
        const door = [];
        for (let s = -3; s <= 3; s++) for (let L = base; L < base + 4; L++) {
            const x = ax === 'x' ? wx : wx + s, z = ax === 'x' ? wz + s : wz;
            const hole = s === 0 && L < base + 2;
            data.set(x, L, z, hole ? 0 : B);
            if (hole) door.push([x, L, z]);
        }
        // (aimed at the doorway's middle)
        const aimY = base - 1 + 0.5 - o.y;
        const handDir = ch.getHandDirection.bind(ch);
        ch.getHandDirection = (side, out = new T.Vector3()) => out.copy(new T.Vector3(wx, base - 1 + 0.5, wz).sub(g.castOrigin(side, new T.Vector3())).normalize());
        const st = g.castLocalSpell('стичинг', true);
        ch.getHandDirection = handDir;
        await frames(120);
        const sewn = door.map(([x, L, z]) => data.get(x, L, z));
        return { liq, cheeseGone, wandStays, liqMax, wandGone, st, sewn, aimY };
    });
    assert.equal(a.liq, 'Liquidation');
    assert.ok(a.cheeseGone, 'the cheese crumbled ' + JSON.stringify(a));
    assert.ok(a.wandStays, 'a magic wand needs the Maxima ' + JSON.stringify(a));
    assert.equal(a.liqMax, 'LiquidationMaxima');
    assert.ok(a.wandGone, 'the Maxima takes the wand ' + JSON.stringify(a));
    assert.equal(a.st, 'Stitching', JSON.stringify(a));
    assert.deepEqual(a.sewn, [26, 26], 'the doorway is sewn with the wall\'s brick ' + JSON.stringify(a));
    // ---- «Drawdown»: the ground sinks, and «стоп» waits for its 10 s
    const b = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const me = g.character.group.position;
        const x = Math.round(me.x + 8), z = Math.round(me.z);
        const top0 = g.terrain.data.topLayer(x, z);
        g.spells.cast('Drawdown', new T.Vector3(x, top0 - 1, z), new T.Vector3(0, -1, 0), 'right', g.localId);
        // (the game's own time: a slow test browser runs it slower than the clock)
        const t0 = performance.now();
        while (g.terrain.data.topLayer(x, z) > top0 - 2 && performance.now() - t0 < 25000) await frames(5);
        const top1 = g.terrain.data.topLayer(x, z);
        g.stopSpells();
        await frames(10);
        const stillHolds = g.spells.spells.some((s) => s.kind === 'Drawdown' && s.life > 0);
        return { top0, top1, stillHolds };
    });
    assert.ok(b.top1 <= b.top0 - 2, 'the ground went down ' + JSON.stringify(b));
    assert.ok(b.stillHolds, '«стоп» before 10 s: it holds to its 10 s ' + JSON.stringify(b));
    // ---- the wand (hand) up: «Wind Impulse», «Invisibility»
    await pose(page, frame({ arms: 'up' }));
    await page.waitForFunction(() => window.__zns.game.character.getHandDirection('right').y > 0.6, null, { timeout: 20000 });
    const c = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const me = g.character.group.position;
        const p0 = new T.Vector3(me.x + 1.8, me.y + 0.5, me.z);
        g.items.spawnLoose({ kind: 'bread', uid: 'ns-bread', count: 1 }, p0, { hover: true });
        await frames(5);
        const imp = g.castLocalSpell('вайнд импульс', true);
        await frames(30);
        const L = g.items.loose.get('ns-bread');
        const moved = L ? Math.hypot(L.model.position.x - me.x, L.model.position.z - me.z) - 1.8 : 0;
        const inv = g.castLocalSpell('инвизибл', true);
        await frames(5);
        const hidden = g.invis.on && g.nearestPlayer(me.clone()) === null;
        g.invis.noted(g.localId);
        const clue = !!g.nearestPlayer(me.clone());
        g.stopSpells();
        return { imp, moved, inv, hidden, clue, off: !g.invis.on };
    });
    await page.evaluate(() => clearInterval(window.__nsPose));
    assert.equal(c.imp, 'WindImpulse', JSON.stringify(c));
    assert.ok(c.moved > 0.5, 'the bread was blown away ' + JSON.stringify(c));
    assert.equal(c.inv, 'Invisibility');
    assert.ok(c.hidden && c.clue && c.off, JSON.stringify(c));
    assert.deepEqual(realErrors(errors), []);
});
