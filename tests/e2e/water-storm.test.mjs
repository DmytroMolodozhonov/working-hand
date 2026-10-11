/**
 * «Water Vortex Super Maxima» in a real browser (Creative): a wand pointed at wide water, the words —
 * the water is taken out of it, a mass of water follows the wand; the hand going round makes a storm
 * round the caster that sweeps a zombie away; it puts out the Hellfire; «стоп»: the water falls and
 * the water fills back.
 * Run: ZNS_TEST_PORT=8185 node --test tests/e2e/water-storm.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8185;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

const circling = (r, turnsPerSec, fps = 30) => (i) => {
    const a = (i / fps) * turnsPerSec * Math.PI * 2;
    return { arms: 'forward', wristOffset: [Math.cos(a) * r, Math.sin(a) * r], rightTilt: 1.57 };
};
const still = { arms: 'forward', wristOffset: [0, 0.05], rightTilt: 1.57 };

test('Water Vortex Super Maxima: water taken from the river, a storm round the caster sweeps a zombie, it puts out the Hellfire, «стоп» lets it fall and the river fills back', async () => {
    const { page, errors } = await openPage(browser, srv.url, { viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, still, 20, 33);
    const setup = await page.evaluate(async () => {
        const g = window.__zns.game;
        const t = g.terrain.data;
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        let spot = null;
        const wide = (x, z) => { for (let dx = -8; dx <= 8; dx += 2) for (let dz = -8; dz <= 8; dz += 2) if (t.get(x + dx, 0, z + dz) !== 8) return false; return true; };
        for (let x = 140; x < 1400 && !spot; x += 3) for (let z = -400; z < 400; z += 3) if (t.get(x, 0, z) === 8 && wide(x, z)) { spot = { x, z }; break; }
        g.character.group.position.set(spot.x, g.collision.groundY(spot.x, spot.z) + 1.0, spot.z);
        for (let i = 0; i < 80 && g.terrain._queue.length; i++) await sleep(100);
        g.items.takeIntoHand({ kind: 'wand', uid: 'storm-wand', type: 0 }, 'right');
        await sleep(300);
        return { spot, held: g.items.heldOf('wand')?.side };
    });
    assert.ok(setup.spot, 'wide water');
    assert.equal(setup.held, 'right');
    await feed(page, still, 15, 33);
    const said = await page.evaluate(() => {
        const g = window.__zns.game;
        return { name: g.castLocalSpell('вотер вортекс супер максима', true), voice: document.getElementById('voice-debug')?.innerText || '' };
    });
    assert.equal(said.name, 'WaterVortexSuperMaxima', JSON.stringify(said));
    await feed(page, still, 40, 33);
    const drawn = await page.evaluate(() => {
        const S = window.__zns.game.waterStorm, s = S.state, t = window.__zns.game.terrain.data;
        const holes = s.list.slice(0, s.drawn).filter((b) => b && t.get(b[0], b[1], b[2]) === 0).length;
        return { drawn: s.drawn, holes, R: s.R, blobs: S.blobs.count };
    });
    assert.ok(drawn.drawn > 40 && drawn.holes === drawn.drawn, `the water is taken out of the river: ${JSON.stringify(drawn)}`);
    assert.ok(drawn.blobs > 60, 'a mass of water is drawn');
    // the hand goes round: the storm round the caster; a zombie in it is swept away
    await feed(page, circling(0.09, 1.3), 70, 33);
    const ring = await page.evaluate(() => { const s = window.__zns.game.waterStorm.state; return s && { k: s.k, rr: s.rr }; });
    assert.ok(ring && ring.k > 0.5, `the storm circles round the caster: ${JSON.stringify(ring)}`);
    const zid = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, p = g.character.group.position, rr = g.waterStorm.state.rr;
        const zp = new T.Vector3(p.x + rr, 0, p.z);
        zp.y = g.collision.groundY(zp.x, zp.z) + 1;
        const z = g._createZombie(zp);
        z.setSleeping?.(true);
        return z.id;
    });
    await feed(page, circling(0.09, 1.3), 25, 33);
    const swept = await page.evaluate((id) => window.__zns.game.waterStorm.log.filter((e) => e.ev === 'sweep' && e.id === id).length, zid);
    assert.ok(swept > 0, 'the storm swept the zombie away');
    // a Hellfire blaze in the storm's water hisses out
    const quench = await page.evaluate(async () => {
        const g = window.__zns.game, H = g.hellfire, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const p = g.character.group.position, s = g.waterStorm.state;
        // (another wizard's fire left on the ground, right in the storm)
        H.left.push({ by: 'x', c: new T.Vector3(p.x + s.rr, p.y - 1.5, p.z), R0: 1.5, R: 1.5, k: 0, t: 0, wet: 0, burnT: 0, meT: 0, o: null });
        await frames(80);
        return { left: H.left.length };
    });
    assert.equal(quench.left, 0, 'the water put out the fire');
    // «стоп»: the water falls, the river fills back
    const end = await page.evaluate(async () => {
        const g = window.__zns.game, S = g.waterStorm, t = g.terrain.data;
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const list = S.state.list.slice(0, S.state.drawn).filter(Boolean);
        g.castLocalSpell('стоп', true);
        const busy = S.busy, fell = S.log.some((e) => e.ev === 'fall');
        for (let i = 0; i < 100 && S.refills.length; i++) await sleep(100);
        return { busy, fell, water: list.filter((b) => t.get(b[0], b[1], b[2]) === 8).length, n: list.length };
    });
    assert.equal(end.busy, false);
    assert.ok(end.fell, 'the water fell');
    assert.equal(end.water, end.n, 'the river filled back');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
