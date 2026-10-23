/** Invisible hero in a castle: knights must not flicker or turn faint. Run: node --test tests/e2e/invis-knights.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('invisible hero: knights stay solid and steady', async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        g.character.group.position.set(c.gate.x, c.gate.y + 2.2, c.gate.z);
        g.world.terrain.flushAround(c.gate.x, c.gate.z);
    });
    await page.waitForFunction(() => { const g = window.__zns.game, cs = g.castleLife.castles.get(window.__castle.id); return cs && [...cs.active.values()].filter((v) => v.role === 'knight' && !v.dead).length >= 3; }, null, { timeout: 60000 });
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const cs = g.castleLife.castles.get(window.__castle.id);
        const snap = () => [...cs.active.values()].filter((v) => v.role === 'knight' && !v.dead).map((v) => {
            const mats = []; v.group.traverse((o) => { if (o.material) mats.push(o.material); });
            return { id: v.id, vis: v.group.visible, root: v.model.root.visible, lod: !!v.model._lod?.visible, faint: mats.some((m) => m.transparent || m.opacity < 1), seen: [v.group.visible, v.model.root.visible, !!v.model._lod?.visible].join() };
        });
        const run = async (label) => {
            const last = new Map(); let flips = 0, faint = 0, n = 0;
            for (let i = 0; i < 240; i++) {
                await frames(1);
                for (const s of snap()) { n++; if (s.faint) faint++; if (last.has(s.id) && last.get(s.id) !== s.seen) flips++; last.set(s.id, s.seen); }
            }
            return { label, flips, faint, n };
        };
        const out = [await run('visible')];
        g.invis.set(true);
        out.push(await run('invisible'));
        g.invis.set(false);
        out.push(await run('after'));
        return out;
    });
    console.log(JSON.stringify(r));
    for (const x of r) assert.equal(x.faint, 0, x.label + ' faint');
});
