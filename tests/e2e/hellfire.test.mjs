/**
 * «Let the Hellfire Come» in a real browser: Creative — a wand in the hand, the words, a huge blaze
 * where the wand points burns a zombie there; the hand going round (synthetic camera frames) draws
 * the fire into a ring round the caster that burns a zombie beside them. The free world — the wand
 * pointed at his own feet: the caster burns in his own fire.
 * Run: ZNS_TEST_PORT=8183 node --test tests/e2e/hellfire.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8183;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

/** Both hands forward; the wrists going round a circle (radius `r` in the picture) `turns` times a second. */
const circling = (r, turnsPerSec, fps = 30) => (i) => {
    const a = (i / fps) * turnsPerSec * Math.PI * 2;
    return { arms: 'forward', wristOffset: [Math.cos(a) * r, Math.sin(a) * r], rightTilt: 1.57 };
};
const still = { arms: 'forward', wristOffset: [0, 0.05], rightTilt: 1.57 };

/** A sleeping zombie at `p` (an array [x, z]); returns its id. */
const ZOMBIE_AT = `(x, z) => {
    const g = window.__zns.game, T = window.__zns.THREE;
    const zp = new T.Vector3(x, 0, z);
    zp.y = g.collision.groundY(x, z) + 1;
    const zb = g._createZombie(zp);
    zb.setSleeping?.(true);
    zb.health = 30;
    return zb.id;
}`;

test('Hellfire (Creative): the blaze where the wand points burns a zombie; the hand going round makes a ring that burns round the caster', async () => {
    const { page, errors } = await openPage(browser, srv.url, { viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, still, 20, 33);
    const held = await page.evaluate(async () => {
        const g = window.__zns.game;
        g.items.takeIntoHand({ kind: 'wand', uid: 'hf-wand', type: 0 }, 'right');
        await new Promise((r) => setTimeout(r, 300));
        return g.items.heldOf('wand')?.side;
    });
    assert.equal(held, 'right');
    await feed(page, still, 10, 33);
    const cast = await page.evaluate(() => {
        const g = window.__zns.game;
        return { name: g.castLocalSpell('лет зе хеллфаер кам', true), busy: g.hellfire.busy };
    });
    assert.equal(cast.name, 'Hellfire');
    assert.ok(cast.busy);
    await feed(page, still, 30, 33);
    // a zombie right where the blaze stands now
    const blaze = await page.evaluate(`(() => { const s = window.__zns.game.hellfire.state; return s && { c: s.c.toArray(), R: s.R, k: s.k, flames: window.__zns.game.hellfire.pool.active }; })()`);
    assert.ok(blaze && blaze.R > 1.2 && blaze.k < 0.2, `a huge blaze out of the wand: ${JSON.stringify(blaze)}`);
    assert.ok(blaze.flames > 200, `drawn with many flames (${blaze.flames})`);
    const z1 = await page.evaluate(`(${ZOMBIE_AT})(${blaze.c[0]}, ${blaze.c[2]})`);
    await feed(page, still, 30, 33);
    const burnt1 = await page.evaluate((id) => {
        const g = window.__zns.game, z = g.zombieById.get(id);
        return { burns: g.hellfire.log.filter((e) => e.ev === 'burn' && e.id === id).length, dead: !z || z.isDead, health: z?.health };
    }, z1);
    assert.ok(burnt1.burns > 0 && (burnt1.dead || burnt1.health < 30), `the zombie in the blaze burns: ${JSON.stringify(burnt1)}`);
    // the hand goes round: the fire becomes a ring round the caster
    await feed(page, circling(0.09, 1.3), 70, 33);
    const ring = await page.evaluate(() => { const H = window.__zns.game.hellfire, s = H.state; return s && { k: s.k, rr: s.rr, ring: H.log.some((e) => e.ev === 'ring'), rate: H.meter.rate }; });
    assert.ok(ring && ring.ring && ring.k > 0.5, `the fire circles round the caster: ${JSON.stringify(ring)}`);
    const z2 = await page.evaluate(`(() => { const g = window.__zns.game, p = g.character.group.position, rr = g.hellfire.state.rr; return (${ZOMBIE_AT})(p.x + rr, p.z); })()`);
    await feed(page, circling(0.09, 1.3), 30, 33);
    const burnt2 = await page.evaluate((id) => {
        const g = window.__zns.game, z = g.zombieById.get(id);
        return { burns: g.hellfire.log.filter((e) => e.ev === 'burn' && e.id === id).length, dead: !z || z.isDead, health: z?.health, hp: g.playerHP };
    }, z2);
    assert.ok(burnt2.burns > 0, `the ring burns the zombie beside the caster: ${JSON.stringify(burnt2)}`);
    // «стоп»: it goes out
    const stopped = await page.evaluate(() => { const g = window.__zns.game; g.castLocalSpell('стоп', true); return g.hellfire.busy; });
    assert.equal(stopped, false);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('Hellfire (free world): a mana maximum under 100 cannot cast it; turned onto the caster, it burns him', async () => {
    const { page, errors } = await openPage(browser, srv.url, { viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await feed(page, still, 20, 33);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, c = g.combat, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        g.items.takeIntoHand({ kind: 'wand', uid: 'hf-wand2', type: 0 }, 'right');
        await frames(10);
        c.fatigue = c.maxFatigue;
        const weak = g.castLocalSpell('лет зе хеллфаер кам', true);
        c.maxFatigue = 120; c.fatigue = 120;
        const name = g.castLocalSpell('лет зе хеллфаер кам', true);
        const paid = 120 - c.fatigue;
        // the wand turned onto himself: at his own feet
        const real = g.character.getPointingDirection.bind(g.character);
        g.character.getPointingDirection = (side, out = new T.Vector3()) => out.set(0, -1, 0.02).normalize();
        const hp0 = c.hp;
        await frames(120);
        const hurt = g.hellfire.log.filter((e) => e.ev === 'hurtMe' && e.by === 'self').length;
        g.character.getPointingDirection = real;
        return { weak, name, paid, hp0, hp: c.hp, hurt, dead: c.dead };
    });
    assert.equal(r.weak, null, 'a mana maximum of 30: too weak');
    assert.equal(r.name, 'Hellfire');
    assert.equal(r.paid, 80);
    assert.ok(r.hurt > 0 && (r.dead || r.hp < r.hp0), `the caster burns in his own fire: ${JSON.stringify(r)}`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
