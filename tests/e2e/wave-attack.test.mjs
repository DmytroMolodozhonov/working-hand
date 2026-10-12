/**
 * «Wave Attack» in a real browser: a wave rises from the test ground's river, stands until the
 * hand shows where, is pushed and rolls to a zombie on the bank and knocks it down.
 * And the river after «Total Destruction» beside it: still a river (its water unchanged).
 * Run: node --test tests/e2e/wave-attack.test.mjs   (ZNS_SHOTS=dir: pictures)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8171;
const SHOTS = process.env.ZNS_SHOTS || null;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
/** The picture from a fixed camera (looking at `at` from `from`). */
const camera = (page, from, at) => page.evaluate(([f, a]) => {
    const g = window.__zns.game, r = g.renderer;
    window.__cam = { f, a };
    if (!r.__waveCam) {
        const orig = r.render.bind(r);
        r.render = (sc, cam) => { const c = window.__cam; if (c && cam === g.camera) { cam.position.set(...c.f); cam.lookAt(...c.a); cam.updateMatrixWorld(); } orig(sc, cam); };
        r.__waveCam = true;
    }
}, [from, at]);
const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 20);
}), n);

test('a wave rises from the river, waits for the hand, is pushed and rolls to a zombie and knocks it down', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r0 = await page.evaluate(async () => {
        const g = window.__zns.game, T = g.world.terrain.data, ch = g.character, V = ch.group.position.constructor;
        // the river's middle at x = 12, and its bank (dry, flat) to the south
        const x = 12;
        let zw = null;
        for (let z = -45; z < -20; z++) if (T.get(x, 0, z) === 8 && T.get(x, 0, z + 1) === 8 && T.get(x, 0, z + 2) === 8) { zw = z + 1; break; }
        let zb = zw;
        while (T.get(x, 0, zb) === 8) zb++;
        const me = ch.group.position;
        me.set(x, T.surfaceY(x, zb + 3) + 2.2, zb + 3);
        g.world.terrain.flushAround(x, zw);
        // my hand: raised, pointing where the test says, moving where it says
        window.__hand = { dir: new V(0, -0.6, -1).normalize(), pos: new V(me.x + 0.3, me.y - 0.3, me.z - 0.5) }; // (the hand held out)
        ch.isArmRaised = () => true;
        ch.getHandDirection = (s, out = new V()) => out.copy(window.__hand.dir);
        ch.getHandWorldPosition = (s, out = new V()) => out.copy(window.__hand.pos);
        g.lastSpellCastTime = 0;
        // at the water: a few metres from the bank
        const o = window.__hand.pos;
        window.__hand.dir.set(x - o.x, (T.surfaceY(x, zw) + 0.1) - o.y, zw - o.z).normalize();
        return { x, zw, zb, cast: g.castLocalSpell('Wave Attack', true) };
    });
    assert.equal(r0.cast, 'WaveAttack', 'cast at the water');
    await camera(page, [r0.x + 14, 4, r0.zb + 10], [r0.x, 0, r0.zw]);
    await page.waitForFunction(() => window.__zns.game.waves.mine?.phase === 'aim', null, { timeout: 30000 });
    const standing = await page.evaluate(() => { const w = window.__zns.game.waves.mine; return { h: w.h, x: w.x, z: w.z, H: w.F.height }; });
    assert.ok(standing.h > standing.H * 0.8, `it rose to its height (${standing.h.toFixed(2)} m)`);
    // the hand still on the water: it waits (it does not go by itself)
    await frames(page, 40);
    await shot(page, 'wave-standing.png');
    assert.equal(await page.evaluate(() => window.__zns.game.waves.mine?.phase), 'aim', 'it waits for the hand');
    // a zombie on the bank, 9 m along the river; the hand shows it
    const z0 = await page.evaluate(([x, zb]) => {
        const g = window.__zns.game, V = g.character.group.position.constructor;
        const zp = new V(x + 9, g.collision.groundY(x + 9, zb + 1), zb + 1);
        const z = g._createZombie(zp);
        z.speed = 0; z.update = () => {}; // (it stands still for the test)
        window.__z = z;
        const w = g.waves.mine;
        window.__hand.dir.set(zp.x - w.x, 0, zp.z - w.z).normalize();
        return { x: z.group.position.x, z: z.group.position.z };
    }, [r0.x, r0.zb]);
    await frames(page, 25); // (it turns after the hand)
    const turned = await page.evaluate(() => { const g = window.__zns.game, w = g.waves.mine; return { phase: w?.phase, dot: w ? w.tdx * window.__hand.dir.x + w.tdz * window.__hand.dir.z : 0 }; });
    assert.ok(turned.dot > 0.95, `it turned to the zombie (${turned.dot.toFixed(2)})`);
    // the push: the hand shoved towards it
    await page.evaluate(() => new Promise((res) => {
        const g = window.__zns.game, h = window.__hand; let n = 0;
        const t = setInterval(() => { h.pos.addScaledVector(h.dir, 0.12); if (++n > 12 || g.waves.list.some((w) => w.phase === 'roll')) { clearInterval(t); res(); } }, 30);
    }));
    await page.waitForFunction(() => window.__zns.game.waves.list.some((w) => w.phase === 'roll'), null, { timeout: 10000 });
    await frames(page, 6);
    await shot(page, 'wave-rolling.png');
    await page.waitForFunction(() => window.__zns.game.creatureImpact.log.some((e) => e.k === 'WaveAttack' && e.ck === 'z'), null, { timeout: 20000 });
    const hit = await page.evaluate(() => {
        const g = window.__zns.game, e = g.creatureImpact.log.find((x) => x.k === 'WaveAttack' && x.ck === 'z');
        return { res: e.res, x: window.__z.group.position.x, z: window.__z.group.position.z };
    });
    await frames(page, 30);
    await shot(page, 'wave-hit.png');
    const later = await page.evaluate(() => ({ x: window.__z.group.position.x, z: window.__z.group.position.z }));
    assert.equal(hit.res, 'knockdown', 'the zombie is swept off its feet');
    assert.ok(Math.hypot(later.x - z0.x, later.z - z0.z) > 1, `and carried (${Math.hypot(later.x - z0.x, later.z - z0.z).toFixed(1)} m)`);
    await page.waitForFunction(() => window.__zns.game.waves.list.every((w) => w.phase === 'drain'), null, { timeout: 30000 });
    await shot(page, 'wave-foam.png');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('«Total Destruction» beside the river: the river stays a river (its water unchanged, no block walls of water)', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const f = { x: 20, z: -34 };
    const scan = () => page.evaluate((f) => {
        const T = window.__zns.game.world.terrain.data, W = 8, cells = [];
        let open = 0;
        for (let x = f.x - 30; x <= f.x + 30; x++) for (let z = f.z - 30; z <= f.z + 30; z++) for (let L = -6; L <= 3; L++) {
            if (T.get(x, L, z) !== W) continue;
            cells.push(`${x},${L},${z}`);
            if (T.get(x, L - 1, z) === 0) open++;
        }
        return { cells, open };
    }, f);
    await page.evaluate((f) => {
        const g = window.__zns.game, me = g.character.group.position, T = g.world.terrain.data;
        me.set(f.x + 32, T.surfaceY(f.x + 32, f.z + 8) + 2.2, f.z + 8); // (out of its reach)
        g.world.terrain.flushAround(f.x, f.z);
    }, f);
    await camera(page, [f.x + 16, 12, f.z + 12], [f.x, -1, f.z]);
    await frames(page, 20);
    await shot(page, 'river-before.png');
    const before = await scan();
    await page.evaluate((f) => { const g = window.__zns.game, V = g.character.group.position.constructor; g.destruction.start(new V(f.x + 5, -0.5, f.z + 6), g.localId, false, false); }, f);
    await page.waitForFunction(() => window.__zns.game.destruction.list.length === 0, null, { timeout: 150000 });
    await page.waitForTimeout(8000); // (the dust settles)
    await shot(page, 'river-after.png');
    const after = await scan();
    const added = after.cells.filter((k) => !before.cells.includes(k));
    assert.deepEqual(added, [], 'the river did not spill over the sunk ground');
    assert.equal(after.open, 0, 'no water hanging over air');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
