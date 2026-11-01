/** Duel-only start («Перед дуэлью»): the wizard stays on the floor and in the duel (probe). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage } from './harness.mjs';
const PORT = Number(process.env.ZNS_TEST_PORT) || 8311;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('duel mode: the wizards stay on the floor, nobody leaves the duel', async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    await page.waitForFunction(() => document.querySelector('.mode-card[data-mode="creative"]'));
    if (await page.isHidden('#create-world')) await page.click('#create-world-btn');
    await page.click('.mode-card[data-mode="creative"]');
    await page.selectOption('#hero-sp-spawn', 'arena');
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__zns?.game?.active && window.__zns.game.revealed && !window.__zns.game.heroApply.pending, null, { timeout: 240000 });
    await page.evaluate(() => window.__zns.game.renderer.setPixelRatio(0.3));
    const res = await page.evaluate(async () => {
        const g = window.__zns.game, AD = g.arenaDuels, out = [];
        const step = (dt) => { g.levitation.update(dt); g.items.update(dt); g.castleLife.update(dt); AD.update(dt); g.duel.update(dt); g.creatureImpact.update(dt); };
        for (let i = 0; i < 1200; i++) {
            step(0.05);
            {
                const A0 = AD.list.get(AD.mode?.arenaId), w = A0?.duel?.a, me = g.localId, P = g.character.group.position;
                if (w && A0.duel.phase === 'fight') {
                    const dir = { x: 1, y: 0, z: 0 };
                    if (i === 300) g.castleLife.hit(w, 4, dir, me, { kind: 'Stupefy' });
                    if (i === 340) g.creatureImpact.spellHit(w, 'Stupefy', P, me, null, { down: 5 });
                    if (i === 440) g.explode(P.clone().set(w.x, w.y + 2, w.z), 8, me, 1);
                    if (i === 520) g.creatureImpact.spellHit(w, 'Bombarda', P, me, null, {});
                    if (i === 600) g.castleLife.startle?.(w, me, P, { hit: true });
                    if (i === 680) g.castleLife.alarm?.({ x: w.x, y: w.y, z: w.z }, 'explosion', me, 40);
                }
            }
            if (i % 10) continue;
            const A = AD.list.get(AD.mode?.arenaId), D = A?.duel;
            const a = D?.a;
            out.push({ t: (i * 0.05).toFixed(0), ph: D?.phase, mode: !!AD.mode, arena: a?.arena && { k: a.arena.kind, leg: a.arena.leg }, y: a && +(a.y - A.def.floorY).toFixed(2), foe: !!a?.foe, fl: a?.fleeT > 0, inv: !!a?.investigate, dead: a?.dead, vy: a?.vy, d: a && +Math.hypot(a.x - A.def.centre.x, a.z - A.def.centre.z).toFixed(1) });
            await new Promise((r) => setTimeout(r, 0));
        }
        return { out, log: [...AD.log].slice(-15) };
    });
    console.log(JSON.stringify(res.out.filter((o) => +o.t >= 14)));
    console.log(JSON.stringify(res.log));
});
