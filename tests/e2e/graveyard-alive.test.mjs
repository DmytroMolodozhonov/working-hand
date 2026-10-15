/**
 * «Alive» at a grave of a village graveyard: the grave shakes, a hand, the earth bursts open (the grave is
 * dug), a skeleton climbs out and follows; «Авада» doesn't kill it, a sword breaks its bones.
 * «Alive Maxima» at the same graveyard: every other grave rises.
 * Run: node --test tests/e2e/graveyard-alive.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8199;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('creative: «Alive» at a grave raises a skeleton step by step; «Alive Maxima» raises the rest of the graveyard', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const idx = g.world.terrain.data.castles;
        let c = null;
        for (let gz = -6; gz <= 6; gz++) for (let gx = -6; gx <= 6; gx++) { const k = idx.cellOf(gx, gz); if (k && k.graves?.length && (!c || Math.hypot(k.x, k.z) < Math.hypot(c.x, c.z))) c = k; }
        if (!c) return { none: true };
        const q = c.graves[0];
        // stand 6 m off the foot of the grave, the hand pointing at it
        const dx = q.exit.x - q.x, dz = q.exit.z - q.z, L = Math.hypot(dx, dz);
        const at = { x: q.x + dx / L * 6, z: q.z + dz / L * 6 };
        g.world.terrain.flushAround(at.x, at.z);
        g.character.group.position.set(at.x, g.collision.groundY(at.x, at.z) + 2, at.z);
        await frames(30);
        g.world.terrain.flushAround(at.x, at.z);
        await frames(10);
        const data = g.world.terrain.data;
        const before = q.cells.map(([x, z]) => data.get(x, q.L, z));
        const aimAt = (qq) => { const o = g.character.group.position.clone().add(new T.Vector3(0, 0.3, 0)); return { side: 'right', o, d: new T.Vector3(qq.x, qq.y, qq.z).sub(o).normalize() }; };
        g.builder._hand = () => aimAt(q);
        const said = g.castLocalSpell('алайв', true);
        const sk = g.livingTrees.list[0];
        if (!sk) return { said, before, none2: true };
        const seen = { hand: false, opened: false };
        const t0 = performance.now();
        while (sk.phase === 'rise' && performance.now() - t0 < 150000) {
            const y = sk.model.userData.rig.position.y;
            if (y > -2.0 && y < -1.4) seen.hand = true;
            if (q.cells.every(([x, z]) => data.get(x, q.L, z) === 0)) seen.opened = true;
            await frames(2);
        }
        const rose = sk.age;
        await frames(10);
        const stood = { phase: sk.phase, rig: sk.model.userData.rig.position.y, d: Math.hypot(sk.model.position.x - q.exit.x, sk.model.position.z - q.exit.z) };
        g.duel.applyToCreature('AvadaKedavra', sk, g.localId);
        await frames(3);
        const afterAvada = sk.hp;
        g.onLocalHit(sk, 6, new T.Vector3(1, 0, 0), true);
        await frames(3);
        const afterSword = sk.hp;
        g.castLocalSpell('стоп', true);
        const t1 = performance.now();
        while (g.livingTrees.list.includes(sk) && performance.now() - t1 < 60000) await frames(5);
        const gone = !g.livingTrees.list.includes(sk);
        // «Alive Maxima»: the rest of the graveyard
        g.livingTrees._last = 0;
        g.builder._hand = () => aimAt(c.graves[1]);
        const saidMax = g.castLocalSpell('алайв максима', true);
        const many = g.livingTrees.list.filter((t) => t.skel).length;
        const again = g.livingTrees.list.some((t) => t.d.gid === q.id);
        return { said, before, seen, rose, stood, afterAvada, afterSword, gone, saidMax, many, again, graves: c.graves.length };
    });
    assert.ok(!r.none, 'a graveyard in the world');
    assert.equal(r.said, 'Alive');
    assert.ok(r.before.every((b) => b !== 0), 'the grave was closed');
    assert.ok(r.seen.hand, 'a hand came up out of the earth');
    assert.ok(r.seen.opened, 'the earth burst open: the grave is dug');
    assert.ok(r.rose > 5 && r.rose < 10, `not at once (${r.rose?.toFixed(1)} s)`);
    assert.equal(r.stood.phase, 'alive');
    assert.ok(Math.abs(r.stood.rig) < 0.1 && r.stood.d < 2.5, `climbed out and stands (${JSON.stringify(r.stood)})`);
    assert.equal(r.afterAvada, 15, '«Авада» doesn\'t kill it');
    assert.equal(r.afterSword, 9, 'a sword breaks its bones');
    assert.ok(r.gone, '«стоп»: it fell into its bones');
    assert.equal(r.saidMax, 'AliveMaxima');
    assert.equal(r.many, r.graves - 1, 'every other grave rises');
    assert.ok(!r.again, 'the dug grave stays empty');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
