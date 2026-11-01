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
        const seatDev = () => { const A0 = AD.list.get(AD.mode?.arenaId); if (!A0) return null; let n = 0, seated = 0, maxH = 0, maxV = 0, moving = 0, noArena = 0; for (const v of g.castleLife.byId.values()) { const s = v.arena?.seat; if (v.arena?.kind !== 'fan') continue; n++; if (!v.seated || !s) { moving++; continue; } seated++; maxH = Math.max(maxH, Math.hypot(v.x - s.x, v.z - s.z)); maxV = Math.max(maxV, Math.abs(v.y - s.y)); } return { n, seated, moving, maxH: +maxH.toFixed(2), maxV: +maxV.toFixed(2), tot: A0.fans.size }; };
        const fans = () => { const A0 = AD.list.get(AD.mode?.arenaId); if (!A0) return null; let on = 0, off = 0, low = 0, minDy = 1e9; for (const v of g.castleLife.byId.values()) { if (!v.arena || v.arena.id !== A0.id) continue; } const all = [...g.castleLife.byId.values()].filter((v) => !v.dead && Math.hypot(v.x - A0.def.centre.x, v.z - A0.def.centre.z) < 80); for (const v of all) { if (v.arena?.id === A0.id) on++; else off++; const dy = v.y - A0.def.floorY; if (dy < -0.5) low++; minDy = Math.min(minDy, dy); } return { on, off, low, minDy: +minDy.toFixed(1) }; };
        for (let i = 0; i < 1200; i++) {
            step(0.05);
            {
                const A0 = AD.list.get(AD.mode?.arenaId), w = A0?.duel?.a, me = g.localId, P = g.character.group.position;
                if (w && A0.duel.phase === 'fight') {
                    const dir = { x: 1, y: 0, z: 0 };
                    if (i === 300) g.castleLife.hit(w, 4, dir, me, { kind: 'Stupefy' });
                    if (i === 340) g.creatureImpact.spellHit(w, 'Stupefy', P, me, null, { down: 5 });
                    if (i === 380) g.explode(P.clone(), 4, me, 1);
                    if (i === 440) g.explode(P.clone().set(w.x, w.y + 2, w.z), 8, me, 1);
                    if (i === 520) g.creatureImpact.spellHit(w, 'Bombarda', P, me, null, {});
                    if (i === 600) g.castleLife.startle?.(w, me, P, { hit: true });
                    if (i === 601) { for (const v of g.castleLife.byId.values()) if (v.arena?.kind === 'fan') { v.foe = me; v.fleeT = 6; v.investigate = { x: v.x, y: v.y, z: v.z, t: 20 }; } g.castleLife.alarm?.({ x: w.x, y: w.y, z: w.z }, 'hellfire', me, 60); g.castleLife.deed?.(me, 'vandal', 5); }
                    if (i === 680) g.castleLife.alarm?.({ x: w.x, y: w.y, z: w.z }, 'explosion', me, 40);
                }
            }
            if (i % 10) continue;
            const A = AD.list.get(AD.mode?.arenaId), D = A?.duel;
            const a = D?.a;
            out.push({ t: (i * 0.05).toFixed(0), ph: D?.phase, mode: !!AD.mode, arena: a?.arena && { k: a.arena.kind, leg: a.arena.leg }, y: a && +(a.y - A.def.floorY).toFixed(2), foe: !!a?.foe, fl: a?.fleeT > 0, inv: !!a?.investigate, dead: a?.dead, fans: fans(), sd: seatDev(), foes: [...g.castleLife.byId.values()].filter((v) => v.foe != null).length, duelists: [...g.castleLife.byId.values()].filter((v) => v.arena?.kind === 'duel').length, vy: a?.vy, d: a && +Math.hypot(a.x - A.def.centre.x, a.z - A.def.centre.z).toFixed(1) });
            await new Promise((r) => setTimeout(r, 0));
        }
        return { out, log: [...AD.log].slice(-15) };
    });
    let pf = ''; for (const o of res.out) { const k = JSON.stringify(o.sd); if (k !== pf) console.log('t=' + o.t, k); pf = k; }
    for (const o of res.out) {
        assert.ok(!o.sd || o.sd.maxH < 0.5 && o.sd.maxV < 0.3, 'the fans sit on their seats at ' + o.t + ' s: ' + JSON.stringify(o.sd));
        assert.equal(o.foes, 0, 'nobody is the hero\'s enemy at ' + o.t + ' s');
        assert.ok(o.duelists <= 1, 'one opponent at a time at ' + o.t + ' s');
        assert.ok(o.arena && o.arena.k === 'duel', 'the wizard is still in the duel at ' + o.t + ' s: ' + JSON.stringify(o));
        assert.ok(o.y >= -0.1, 'the wizard is not under the floor at ' + o.t + ' s: ' + JSON.stringify(o));
        assert.ok(!o.dead && !o.foe && !o.fl, 'not fleeing / fighting the hero at ' + o.t + ' s');
    }
    // the hero falls: «Вы проиграли. Ещё раз?» — no silent respawn; «ещё раз» by voice starts a fresh round
    const death = await page.evaluate(async () => {
        const g = window.__zns.game, AD = g.arenaDuels;
        const step = (dt) => { g.levitation.update(dt); g.items.update(dt); g.castleLife.update(dt); AD.update(dt); g.duel.update(dt); g.creatureImpact.update(dt); };
        const handled = AD.duelDeath();
        const asked = { handled, open: AD.endUi.open, asking: !!AD.mode.asking, title: AD.endUi.box?.querySelector('h3')?.textContent };
        const keep = AD.list.get(AD.mode.arenaId).fans.size;
        for (let i = 0; i < 40; i++) step(0.05);
        asked.stillAsking = AD.endUi.open; asked.fansKept = AD.list.get(AD.mode.arenaId).fans.size === keep;
        asked.voice = AD.askVoice('ещё раз');
        asked.closed = !AD.endUi.open; asked.asking2 = !!AD.mode.asking;
        for (let i = 0; i < 400; i++) { step(0.05); if (i % 50 === 0) await new Promise((r) => setTimeout(r, 0)); }
        const A = AD.list.get(AD.mode.arenaId);
        asked.newDuel = !!A.duel; asked.hp = g.combat.hp > 0 && !g.combat.dead;
        return asked;
    });
    assert.ok(death.handled && death.open && death.asking, 'the question is up: ' + JSON.stringify(death));
    assert.match(death.title, /Вы проиграли/);
    assert.ok(death.stillAsking && death.fansKept, 'it waits for the answer: ' + JSON.stringify(death));
    assert.ok(death.voice && death.closed && !death.asking2, 'the voice «ещё раз» answers: ' + JSON.stringify(death));
    assert.ok(death.newDuel && death.hp, 'a fresh round follows: ' + JSON.stringify(death));
});
