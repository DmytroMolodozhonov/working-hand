/**
 * «Overgrown»: the raised hand points at a crowd — they are thrown apart to both sides and up,
 * nobody is hurt by the spell itself; one thrown from up high is hurt by the fall.
 * Run: ZNS_TEST_PORT=8247 node --test tests/e2e/overgrown.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8195;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('«Овергроун» throws a crowd of zombies and a pig apart, unhurt; «Overgrown Максима» throws further; a fall from up high hurts', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40);

    const crowd = (page, k) => page.evaluate(async (k) => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        for (const z of [...g.zombies]) if (!z.isDead) { z.health = 0; z.isDead = true; z.group.visible = false; }
        const f = ch.getHandDirection('right', new T.Vector3()).setY(0).normalize();
        const side = new T.Vector3(-f.z, 0, f.x); // (to the right of the pointing)
        const base = ch.group.position.clone();
        const at = (fw, sd) => { const p = base.clone().addScaledVector(f, fw).addScaledVector(side, sd); p.y = g.collision.groundY(p.x, p.z) + 1; return p; };
        const zs = [-1.6, 0.4, 1.6].map((sd) => { const z = g._createZombie(at(7, sd)); z.health = 80; z.speed = z.baseSpeed = 0; return { z, sd }; });
        const pp = at(8.5, -2.2);
        const pig = g.animals._spawn('pig', new T.Vector3(pp.x, g.collision.groundY(pp.x, pp.z) + 0.5, pp.z));
        await frames(20);
        const lat = (p) => p.clone().sub(base).dot(side);
        const y0 = zs.map(({ z }) => z.group.position.y);
        const before = zs.map(({ z }) => lat(z.group.position));
        const pig0 = lat(pig.group.position), pigH = pig.hp;
        g.lastMagicTime = Date.now();
        g._lastOvergrown = 0;
        const said = g.castLocalSpell(k ? 'оверграун максима' : 'овергроун', true);
        let rise = 0;
        for (let i = 0; i < 50; i++) { await frames(1); zs.forEach(({ z }, j) => { rise = Math.max(rise, z.group.position.y - y0[j]); }); }
        await frames(40);
        const out = {
            said, rise,
            moved: zs.map(({ z }, j) => lat(z.group.position) - before[j]),
            health: zs.map(({ z }) => z.health),
            pig: lat(pig.group.position) - pig0, pigHurt: pigH - pig.hp,
            states: zs.map(({ z }) => g.creatureImpact.stateOf(z)),
        };
        for (const { z } of zs) { z.health = 0; z.isDead = true; z.group.visible = false; }
        g.animals.remove?.(pig);
        return out;
    }, k);

    const a = await crowd(page, false);
    assert.equal(a.said, 'Overgrown', JSON.stringify(a));
    // the left one goes left, the right ones go right, the pig (left) goes left; all fly up a little
    assert.ok(a.moved[0] < -1.5 && a.moved[1] > 1.5 && a.moved[2] > 1.5, JSON.stringify(a));
    assert.ok(a.pig < -1, JSON.stringify(a));
    assert.ok(a.rise > 0.2, JSON.stringify(a));
    // the spell itself hurts nobody (on flat ground)
    assert.deepEqual(a.health, [80, 80, 80], JSON.stringify(a));
    assert.equal(a.pigHurt, 0, JSON.stringify(a));

    const m = await crowd(page, true);
    assert.equal(m.said, 'OvergrownMaxima', JSON.stringify(m));
    const spread = (r) => r.moved[2] - r.moved[0];
    assert.ok(spread(m) > 1.4 * spread(a), `${spread(a)} → ${spread(m)}`);
    assert.deepEqual(m.health, [80, 80, 80], JSON.stringify(m));

    // a zombie up high (on a ledge) thrown off it: the fall hurts it
    const fall = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const f = ch.getHandDirection('right', new T.Vector3()).setY(0).normalize();
        const p = ch.group.position.clone().addScaledVector(f, 6);
        p.y = g.collision.groundY(p.x, p.z) + 1;
        const z = g._createZombie(p);
        z.health = 80; z.speed = z.baseSpeed = 0;
        await frames(10);
        z.group.position.y += 9; z.vy = 0; // (as if on a wall 9 m up)
        const o = ch.getHandWorldPosition('right', new T.Vector3());
        g.spells.cast('Overgrown', o, z.group.position.clone().sub(o).normalize(), 'right', g.localId);
        for (let i = 0; i < 300 && z.group.position.y > g.collision.groundY(z.group.position.x, z.group.position.z) + 1.2; i++) await frames(1);
        await frames(10);
        return { health: z.health, dead: z.isDead };
    });
    assert.ok(fall.dead || fall.health < 80, JSON.stringify(fall));

    // another wizard's «Overgrown» (as it comes over the network) throws me too: aside and up
    const me = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const p0 = ch.group.position.clone(), y0 = p0.y;
        const f = new T.Vector3(-Math.sin(ch.group.rotation.y), 0, -Math.cos(ch.group.rotation.y));
        const o = p0.clone().addScaledVector(f, 7).add(new T.Vector3(0, 1.5, 0));
        const c = g.combat.center(new T.Vector3());
        g.spells.cast('OvergrownMaxima', o, c.sub(o).normalize(), 'right', 'wizard-friend');
        let rise = 0;
        for (let i = 0; i < 40; i++) { await frames(1); rise = Math.max(rise, ch.group.position.y - y0); }
        await frames(30);
        return { rise, moved: Math.hypot(ch.group.position.x - p0.x, ch.group.position.z - p0.z) };
    });
    assert.ok(me.rise > 0.5 && me.moved > 1, JSON.stringify(me));
    assert.deepEqual(realErrors(errors), []);
});
