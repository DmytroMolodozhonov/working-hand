/**
 * «Инферно» — the flame stream follows the hand, costs mana while held, a shield and a
 * water ball stop it. Run: node --test tests/e2e/inferno.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8231;
let srv, browser;
const WRIST = Number(process.env.ZNS_WRIST) || 0.1; // (≈30° sideways)
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('Инферно: follows the turned hand, takes mana while held; a shield and a water ball stop it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, c = g.combat;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const flameOf = (by) => g.spells.spells.find((s) => s.kind === 'Inferno' && s.by === by && s.life > 0);
        const out = {};
        // ---- cast by voice (the hand is up): 10 mana, then it drains while held
        c.fatigue = 30;
        g.isMagicActive = true; g.magicHand = 'right'; g.lastMagicTime = Date.now(); g.lastSpellCastTime = 0;
        out.cast = g.castLocalSpell('инферно', true);
        out.afterCast = c.fatigue;
        const f = flameOf(g.localId);
        out.started = !!f;
        await frames(5);
        window.__d0 = f.flame.d.clone();
        window.__t0 = performance.now();
        window.__f0 = c.fatigue;
        return out;
    });
    // ---- turn the hand ~30° sideways: the flame comes out where it points now
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0, wristOffset: [WRIST, 0] }, 10, 40);
    const r2 = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, c = g.combat;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const flameOf = (by) => g.spells.spells.find((s) => s.kind === 'Inferno' && s.by === by && s.life > 0);
        const out = {};
        const f = flameOf(g.localId);
        const t0 = window.__t0;
        out.turned = f.flame.d.angleTo(window.__d0);
        out.followsHand = f.flame.d.angleTo(ch.getHandDirection('right', new T.Vector3()));
        out.lenGrown = f.flame.len;
        // frame cost of the flame
        const t1 = performance.now(); let n = 0;
        for (let i = 0; i < 60; i++) { g.spells.update(1 / 60); n++; }
        out.msPerFrame = (performance.now() - t1) / n;
        await frames(20);
        out.drained = window.__f0 - c.fatigue;
        out.heldFor = (performance.now() - t0) / 1000;
        g.stopSpells();
        await frames(2);
        out.stopped = !flameOf(g.localId);
        // ---- an enemy's flame at me; my «Protection» raised towards it
        const hand = ch.getHandWorldPosition('right', new T.Vector3());
        const hdir = ch.getHandDirection('right', new T.Vector3());
        const from = hand.clone().addScaledVector(hdir, 8);
        const at = c.center().sub(from).normalize();
        c.fatigue = 30; c.infernoCooldown = 0;
        out.shieldHint = c.castProtection(false);
        const hp0 = c.hp;
        g.spells.cast('Inferno', from, at, 'right', 'enemy');
        await frames(30);
        out.shieldEnd = flameOf('enemy')?.flame.end;
        out.shieldHurt = hp0 - c.hp;
        g.spells.stopBy('enemy');
        c.dropShield?.('');
        c.shield = null;
        // ---- no shield: it burns
        c.infernoCooldown = 0;
        const hp1 = c.hp;
        g.spells.cast('Inferno', from, at, 'right', 'enemy');
        await frames(30);
        out.bareHurt = hp1 - c.hp;
        g.spells.stopBy('enemy');
        await frames(2);
        // ---- a water ball between us: steam, no burn
        const mid = from.clone().lerp(c.center(), 0.5);
        const ball = { pos: mid, vel: new T.Vector3(), r: 0.7, frozen: false, mesh: null };
        g.water.resting.push(ball);
        c.infernoCooldown = 0;
        const hp2 = c.hp;
        g.spells.cast('Inferno', from, at, 'right', 'enemy');
        await frames(30);
        out.waterEnd = flameOf('enemy')?.flame.end;
        out.waterLen = flameOf('enemy')?.flame.len;
        out.waterHurt = hp2 - c.hp;
        out.ballDist = from.distanceTo(mid);
        g.spells.stopBy('enemy');
        g.water.resting.splice(g.water.resting.indexOf(ball), 1);
        return out;
    });
    console.log(r, r2);
    Object.assign(r, r2);
    assert.equal(r.cast, 'Inferno');
    assert.ok(r.started, 'the flame burns');
    assert.ok(Math.abs(r.afterCast - 20) < 0.01, `10 mana to start (${r.afterCast})`);
    assert.ok(r.turned > 0.35 && r.turned < 0.7, `the flame turned with the hand (${r.turned.toFixed(2)} rad)`);
    assert.ok(r.followsHand < 0.05, 'it comes out where the hand points now');
    assert.ok(r.lenGrown > 15, `it grew out (${r.lenGrown.toFixed(1)} m)`);
    assert.ok(r.drained > 1, `a held flame takes mana (${r.drained.toFixed(2)} in ${r.heldFor.toFixed(2)} s)`);
    assert.ok(r.msPerFrame < 2, `cheap: ${r.msPerFrame.toFixed(3)} ms a frame`);
    assert.ok(r.stopped, '«стоп» puts it out');
    assert.equal(r.shieldHint, null);
    assert.equal(r.shieldEnd, 'shield', 'the flame splashes on the shield');
    assert.equal(r.shieldHurt, 0, 'behind the shield: not burnt');
    assert.ok(r.bareHurt > 0, 'without a shield it burns');
    assert.equal(r.waterEnd, 'water', 'the water ball stops it');
    assert.ok(r.waterLen < r.ballDist, 'it ends at the water');
    assert.equal(r.waterHurt, 0, 'behind the water: not burnt');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
