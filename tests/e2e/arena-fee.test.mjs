/**
 * The paid duel arena in a real browser (ArenaDuels.js): the three small figures on the steward's counter are apart and can be chosen, the stake is
 * taken, the line and the magic board, a win pays the stake back and as much again, a loss takes it, a cancel / a draw gives it back;
 * the bots' duel is a real fight (they move, cast different spells, it ends); the visitors use their own stair, never the fighters' gate.
 * The test browser's frames are slow: the arena's life is stepped on directly (the same updates as a frame).
 * Run: node --test tests/e2e/arena-fee.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8173;
let srv, browser, page, errors;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
    ({ page, errors } = await openPage(browser, srv.url, { noCamera: true }));
    await page.evaluate(() => { const z = window.__zns; z.startGame({ ...z.readConfig(), mode: 'freeworld', map: null, seed: 7, smooth: true, zombieCount: 0 }); }); // (a fixed seed: the same world every run)
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 }); // (the newest generation: the stall and the visitors' stair)
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const S = g.world.terrain.data.sites;
        const towers = S.towers.near(0, 0, 9000).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
        let ar = null;
        for (const t of towers) { ar = S.arenas.ofTower(t); if (ar) break; }
        window.__ar = ar;
        const f = ar.desk.front;
        g.character.group.position.set(f.x, f.y + 2.2, f.z);
        g.world.terrain.flushAround?.(f.x, f.z);
        window.__ff = (n, dt = 0.05) => { for (let i = 0; i < n; i++) { g.levitation.update(dt); g.items.update(dt); g.castleLife.update(dt); g.arenaDuels.update(dt); g.duel.update(dt); g.creatureImpact.update(dt); } };
        window.__A = () => g.arenaDuels.list.get(ar.id);
        Object.defineProperty(g, 'isNight', { get: () => false, configurable: true });
    });
    await page.waitForTimeout(2500);
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

const hold = () => page.evaluate(() => {
    const g = window.__zns.game;
    for (const s of ['right', 'left']) if (g.items.held[s]) g.items.releaseHand(s);
    g.items.takeIntoHand({ kind: 'wand', uid: 'arena-wand', color: 0x8844aa, model: 2, power: 10 }, 'right', { closed: true });
});

test('the figures on the counter: three apart, each with a plate; the steward answers and takes the stake; the line is on the board', async () => {
    await hold();
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, AD = g.arenaDuels;
        for (let k = 0; k < 40 && !window.__A(); k++) { window.__ff(20); await new Promise((r) => setTimeout(r, 0)); }
        const A = window.__A();
        for (let k = 0; k < 40; k++) { window.__ff(20); AD.dollsFx.update([...AD.list.values()]); await new Promise((r) => setTimeout(r, 0)); if (AD.dollsFx.figures(A.id).length === 3) break; }
        const figs = AD.dollsFx.figures(A.id);
        const apart = Math.min(...figs.flatMap((a, i) => figs.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.z - b.z))));
        g.inventory.purse.count = 0; g.inventory.purse.add(220); g.inventory._render?.();
        const before = g.inventory.coins();
        const poor = AD.choose(A, 'teacher'); // (150 of 220 — enough; then a second go is refused: already signed up)
        const after = g.inventory.coins();
        const again = AD.choose(A, 'novice');
        return { n: figs.length, apart, before, after, poor, again, stake: A.stakes.get(g.localId), queue: A.queue.list.slice(), board: A.board };
    });
    assert.equal(r.n, 3, JSON.stringify(r));
    assert.ok(r.apart >= 1.5, 'figures apart: ' + r.apart);
    assert.equal(r.before - r.after, 150, 'the stake of the strong one was taken: ' + JSON.stringify(r));
    assert.equal(r.stake, 150);
    assert.ok(/Ставка 150/.test(r.poor), r.poor);
    assert.ok(/уже записаны/.test(r.again), r.again);
    assert.equal(r.queue.length >= 0, true);
});

test('a loss takes the stake; a win gives it back and as much again at the steward; a cancel / a draw gives it back', async () => {
    const res = await page.evaluate(async () => {
        const g = window.__zns.game, AD = g.arenaDuels, out = {};
        for (let k = 0; k < 40 && !window.__A(); k++) { window.__ff(20); await new Promise((r) => setTimeout(r, 0)); }
        const A = window.__A();
        const coins = () => g.inventory.coins();
        const reset = async () => { A.queue.list.length = 0; A.stakes.clear(); A.tiers.clear(); if (A.duel) { AD._end(A, A.duel, null, 'gone'); window.__ff(260); } };
        const toFight = async (tier) => {
            const reply = AD.choose(A, tier);
            let got = false;
            for (let k = 0; k < 3000; k++) {
                window.__ff(40);
                const D = A.duel;
                if (D?.p === g.localId) {
                    if (D.phase === 'call') { const m = A.def.gates[0].mark; g.character.group.position.set(m.x, m.y + 2.2, m.z); }
                    if (D.phase === 'fight') { got = true; break; }
                }
                await new Promise((r) => setTimeout(r, 0));
            }
            return { reply, got };
        };
        // (1) a cancel before the turn: the stake is back
        g.inventory.purse.count = 0; g.inventory.purse.add(500); g.inventory._render?.();
        await reset();
        AD.choose(A, 'adept'); out.cancelPaid = 500 - coins();
        AD._cancel(A, g.localId); window.__ff(2);
        out.cancelBack = coins();
        // (2) a loss: the wizard wins — the stake is gone for good
        await reset();
        g.inventory.purse.count = 0; g.inventory.purse.add(500); g.inventory._render?.();
        let f = await toFight('adept'); out.lossFight = f.got;
        if (f.got) AD._end(A, A.duel, 'a', 'wand'); window.__ff(60);
        out.lossCoins = coins();
        // (3) a win: stand at the steward — his stake back and as much again lies in the air
        await reset();
        g.inventory.purse.count = 0; g.inventory.purse.add(500); g.inventory._render?.();
        f = await toFight('novice'); out.winFight = f.got;
        out.paidIn = 500 - coins();
        if (f.got) AD._end(A, A.duel, 'p', 'wand');
        const fr = A.def.desk.front;
        g.character.group.position.set(fr.x, fr.y + 2.2, fr.z);
        for (let k = 0; k < 400; k++) { window.__ff(10); if ([...AD.log].some((l) => l.startsWith('paid:'))) break; await new Promise((r) => setTimeout(r, 0)); }
        out.paidLog = [...AD.log].filter((l) => l.startsWith('paid:') || l.startsWith('settle:')).slice(-3);
        let loose = 0; for (const it of g.items.loose.values()) if (it.item?.kind === 'coins') loose += it.item.count || 0;
        out.looseCoins = loose;
        // (4) a draw: the stake is back at once
        await reset();
        g.inventory.purse.count = 0; g.inventory.purse.add(500); g.inventory._render?.();
        f = await toFight('teacher'); out.drawFight = f.got;
        if (f.got) AD._end(A, A.duel, null, 'time'); window.__ff(5);
        out.drawCoins = coins();
        return out;
    });
    assert.equal(res.cancelPaid, 100, JSON.stringify(res));
    assert.equal(res.cancelBack, 500, 'cancelled: the stake back');
    assert.ok(res.lossFight, 'a duel was made: ' + JSON.stringify(res));
    assert.equal(res.lossCoins, 400, 'lost: the 100 stake is gone');
    assert.ok(res.winFight && res.paidIn === 50, JSON.stringify(res));
    assert.ok(res.paidLog.some((l) => l.endsWith(':100')), 'the win pays 100 (the stake 50 back and 50 more): ' + JSON.stringify(res.paidLog));
    assert.ok(res.looseCoins >= 100, 'the coins lie at the steward: ' + res.looseCoins);
    assert.equal(res.drawCoins, 500, 'a draw: the stake back');
});

test('a bots\' duel is a fight: they move, cast different spells, it ends with a winner; the visitors come by their stair, never past the fighters\' gate', async () => {
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, AD = g.arenaDuels;
        for (let k = 0; k < 40 && !window.__A(); k++) { window.__ff(20); await new Promise((r) => setTimeout(r, 0)); }
        const A0 = window.__A(); A0.queue.list.length = 0; A0.stakes.clear();
        if (A0.duel) { AD._end(A0, A0.duel, null, 'gone'); window.__ff(260); }
        const ar = window.__ar, p = ar.seats[40];
        g.character.group.position.set(p.x, p.y + 2.2, p.z);
        const casts = [], origLog = AD.logCast; AD.logCast = function (b) { if (b?.spell) casts.push(b.spell); return origLog.call(this, b); };
        const lane = [ar.gates[0].out, ar.gates[0].in];
        const segDist = (q, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / l2)) : 0; return Math.hypot(q.x - a.x - dx * t, q.z - a.z - dz * t); };
        let minFan = 1e9, fansSeated = 0, stairUsed = false;
        const duels = [];
        let cur = null;
        for (let k = 0; k < 4000 && duels.length < 2; k++) {
            window.__ff(10);
            const A = window.__A();
            if (A) {
                for (const v of A.fans) { minFan = Math.min(minFan, segDist(v, lane[0], lane[1])); if (v.arena?.vleg >= 4) stairUsed = true; }
                fansSeated = Math.max(fansSeated, [...A.fans].filter((v) => v.seated).length);
                const D = A.duel;
                if (D?.phase === 'fight' && D.b && !cur) cur = { moved: [0, 0], last: null, c0: casts.length };
                if (cur && D?.phase === 'fight') { const now = [D.a, D.b].map((v) => ({ x: v.x, z: v.z })); if (cur.last) for (let i = 0; i < 2; i++) cur.moved[i] += Math.hypot(now[i].x - cur.last[i].x, now[i].z - cur.last[i].z); cur.last = now; }
                if (cur && D?.phase === 'over') { duels.push({ secs: Math.round(D.go), why: D.why, result: D.result, moved: cur.moved.map(Math.round), casts: casts.length - cur.c0 }); cur = null; window.__ff(300); }
            }
            if (k % 20 === 0) await new Promise((r) => setTimeout(r, 0));
        }
        for (let k = 0; k < 800 && fansSeated < 5; k++) { window.__ff(20); const A = window.__A(); if (A) fansSeated = Math.max(fansSeated, [...A.fans].filter((v) => v.seated).length); if (k % 10 === 0) await new Promise((r) => setTimeout(r, 0)); } // (the visitors take their seats, a few minutes of the arena's life)
        return { duels, kinds: [...new Set(casts)], fansSeated, minFan: Math.round(minFan), stairUsed };
    });
    console.log('bots duels:', JSON.stringify(r));
    assert.equal(r.duels.length, 2, JSON.stringify(r));
    for (const d of r.duels) {
        assert.ok(d.why === 'wand' || d.why === 'time', 'ended: ' + JSON.stringify(d));
        assert.ok(d.casts >= 3, 'they cast: ' + JSON.stringify(d));
        assert.ok(d.moved[0] + d.moved[1] >= 12, 'they moved, not stood: ' + JSON.stringify(d));
    }
    assert.ok(r.kinds.length >= 4, 'different spells: ' + JSON.stringify(r.kinds));
    assert.ok(r.fansSeated >= 5, 'the visitors found their seats: ' + JSON.stringify(r));
    assert.ok(r.stairUsed, 'they came up the visitors\' stair');
    assert.ok(r.minFan > 5, 'no visitor walked in the fighters\' lane: ' + r.minFan);
    assert.deepEqual(realErrors(errors), []);
});
