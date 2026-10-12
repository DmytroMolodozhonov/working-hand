/**
 * Dragons — in a real browser: a lair high in a mountain (its hall, its huge mouth, the heap of
 * gold, pouches, an egg per dragon), its dragon asleep on the hoard; taking gold wakes it; fire does
 * nothing to it, a blast hurts it; a dragon flying over the world.
 * Run: node --test tests/e2e/dragons.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8177;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('a dragon\'s lair: the hoard, the sleeping dragon; gold taken wakes it; fire nothing, a blast hurts; one flies over', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, ch = g.character, t = g.terrain.data;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const s = t.lairsNear(0, 0, 3000).sort((a, b) => Math.hypot(a.lair.x, a.lair.z) - Math.hypot(b.lair.x, b.lair.z))[0];
        if (!s) return { none: true };
        const L = s.lair;
        // at the mouth, looking in
        ch.group.position.set(L.mouth.x + L.dx * 4, L.F + 3, L.mouth.z + L.dz * 4);
        ch.verticalVelocity = 0;
        ch.group.rotation.y = g.smoothBody = g.cameraBaseRotation = Math.atan2(L.dx, L.dz);
        g.dragons._lairT = 0;
        await frames(30);
        const D = g.dragons;
        const st = D.state[L.id];
        const ds = D.list.filter((d) => d.lair === L.id);
        const out = { id: L.id, dragons: ds.map((d) => d.mode), loose: st?.loose, items: st?.items.length, eggs: [...g.items.loose.values()].filter((x) => x.item.kind === 'dragonEgg').length, heap: !!D.lairs.get(L.id)?.heap?.dome.visible };
        // fire: nothing; a blast: it hurts
        const d = ds[0];
        D.hit(d, 300, 'Hellfire'); D.hit(d, 50, 'Inferno');
        out.afterFire = d.hp;
        D.hit(d, 24, 'Bombardo');
        out.afterBlast = d.hp;
        d.mode = 'sleep'; d.aggro = null; d.target = null;
        // gold taken from the heap: it wakes
        const n = D._take(L.id, 20, g.localId);
        out.took = n;
        await frames(5);
        out.woke = d.mode;
        // a dragon flying over
        D.summonWanderer();
        await frames(5);
        const w = D.list.find((x) => !x.lair);
        out.flyer = w ? { mode: w.mode, high: w.model.position.y - ch.group.position.y } : null;
        return out;
    });
    if (r.none) { assert.ok(true, 'no lair within 3 km of this world\'s spawn'); return; }
    assert.ok(r.dragons.length >= 1 && r.dragons.every((m) => m === 'sleep'), `asleep on the hoard: ${JSON.stringify(r)}`);
    assert.ok(r.loose > 500 && r.heap, 'a heap of gold');
    assert.ok(r.eggs >= r.dragons.length && r.items > r.dragons.length, 'pouches and an egg per dragon');
    assert.equal(r.afterFire, 1000, 'fire does nothing');
    assert.equal(r.afterBlast, 976, 'a blast hurts');
    assert.equal(r.took, 20);
    assert.notEqual(r.woke, 'sleep', 'taking the gold woke it');
    assert.ok(r.flyer && r.flyer.mode === 'air' && r.flyer.high > 20, `one flies high: ${JSON.stringify(r.flyer)}`);
    await page.screenshot({ path: '/tmp/zns-dragon-lair.png' });
    assert.deepEqual(realErrors(errors), []);
});
