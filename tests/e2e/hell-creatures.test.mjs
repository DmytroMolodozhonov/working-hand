/**
 * Who lives in hell, in the real game (the author: «in hell there is an owl — take it away»): into hell («Где появиться: Ад»), an owl put by the
 * hero (as one that flew after him) is taken away, then 5 minutes of play — every creature of every system within 1500 m is on the white list.
 * Run: node --test tests/e2e/hell-creatures.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8193;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('hell: only Diabolos, the Tarons, hell\'s gargoyles — no owl, no beast, no zombie', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative', { smooth: true }).catch(async (e) => {
        if (!/Timeout/.test(e.message)) throw e;
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 420000 });
    });
    await waitHudVisible(page, 120000);
    const MIN = Number(process.env.ZNS_HELL_MIN || 5);
    const r = await page.evaluate(async (MIN) => {
        const THREE = await import('three');
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms)), me = g.character.group.position, out = { seen: {} };
        g.hero.spawn = 'hellmap'; g.heroApply.requestSpawn();
        for (let i = 0; i < 4000 && !(g.hellGate.inHell && !g.heroApply.pending && !g.hellGate.trans); i++) await sleep(100);
        out.inHell = g.hellGate.inHell;
        const owl = g.owls?.spawn?.(new THREE.Vector3(me.x + 6, me.y + 4, me.z + 6));
        if (owl) owl.guide = { boss: 'x', by: g.localId, at: me.clone(), t: 0 }; // (as one leading the hero — the owl that came)
        const tw = performance.now();
        for (let i = 0; i < 600 && owl && g.owls.list.includes(owl); i++) await sleep(100); // (the host's sweep: once a second of game time — slow software frames here)
        out.owlGone = !owl || !g.owls.list.includes(owl); out.owlS = Math.round((performance.now() - tw) / 100) / 10;
        const OK = new Set(['diabolos', 'tarons', 'gargoyles']);
        const posOf = (c) => c?.pos || c?.position || c?.model?.position || c?.mesh?.position || c?.group?.position || null;
        const scan = () => {
            for (const k of Object.keys(g)) {
                const sys = g[k];
                const L = sys && (Array.isArray(sys.list) ? sys.list : sys.birds instanceof Map ? [...sys.birds.values()] : null);
                if (!L || !L.length) continue;
                for (const c of L) {
                    const p = posOf(c); if (!p || !Number.isFinite(p.x) || c.dead) continue;
                    if (Math.hypot(p.x - me.x, p.z - me.z) > 1500) continue;
                    if (k === 'gargoyles' && !c.patrol) { out.seen['gargoyles(не патруль)'] = (out.seen['gargoyles(не патруль)'] || 0) + 1; continue; }
                    out.seen[k] = Math.max(out.seen[k] || 0, L.filter((q) => { const pp = posOf(q); return pp && !q.dead && Math.hypot(pp.x - me.x, pp.z - me.z) <= 1500; }).length);
                    if (!OK.has(k)) (out.bad = out.bad || {})[k] = true;
                }
            }
            if (g.diabolos?.d) out.seen.diabolos = 1;
            const zs = g.zombies || g.zombieList; if (Array.isArray(zs) && zs.some((z) => z.alive !== false && Math.hypot(z.mesh?.position?.x - me.x, z.mesh?.position?.z - me.z) < 1500)) (out.bad = out.bad || {}).zombies = true;
        };
        const t0 = performance.now();
        while (performance.now() - t0 < MIN * 60000) { scan(); await sleep(5000); }
        out.minutes = (performance.now() - t0) / 60000;
        return out;
    }, MIN);
    console.log(JSON.stringify(r));
    assert.ok(r.inHell, 'in hell');
    assert.ok(r.owlGone, 'the owl that came after the hero is taken away');
    assert.equal(r.bad, undefined, 'only the white list in hell: ' + JSON.stringify(r.seen));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
}, { timeout: 3000000 });
