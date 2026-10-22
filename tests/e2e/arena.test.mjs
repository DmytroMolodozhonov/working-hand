/**
 * The duel arena in a real browser (ArenaDuels.js): the fans come and sit, a bots' duel runs to its end
 * (never longer than 5 minutes), a player signs up, comes out to his mark, «3-2-1» — a duel; killing the
 * wizard is a foul: a part of the wizards (not all) attack him.
 * The test browser's frames are slow: the arena's life is stepped on directly (the same updates as a frame).
 * Run: node --test tests/e2e/arena.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8171;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('the arena: fans, a bots\' duel to its end ≤ 5 min, a player\'s duel with «3-2-1», a kill → a part of the wizards attack', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const S = g.world.terrain.data.sites;
        const towers = S.towers.near(0, 0, 3000).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
        let ar = null;
        for (const t of towers) { ar = S.arenas.ofTower(t); if (ar) break; }
        window.__ar = ar;
        const p = ar.seats[40];
        g.character.group.position.set(p.x, p.y + 2.2, p.z);
        g.world.terrain.flushAround?.(p.x, p.z);
        // (one game step without drawing — the frames of the test browser are too slow for minutes of a duel)
        window.__ff = (n, dt = 0.05) => { for (let i = 0; i < n; i++) { g.levitation.update(dt); g.items.update(dt); g.castleLife.update(dt); g.arenaDuels.update(dt); g.duel.update(dt); g.creatureImpact.update(dt); } };
        window.__A = () => g.arenaDuels.list.get(ar.id);
        Object.defineProperty(g, 'isNight', { get: () => false, configurable: true }); // (by day: no duels at night)
    });
    await page.waitForTimeout(2000);
    // a bots' duel from its start to its end
    const bots = await page.evaluate(async () => {
        const g = window.__zns.game, AD = g.arenaDuels;
        let started = null, ended = null, fans = 0, seated = 0, longest = 0, unseatedAtEnter = 0, onFloorInFight = 0, wasEnter = false;
        for (let k = 0; k < 400 && !ended; k++) {
            window.__ff(120);
            const A = window.__A();
            if (!A) continue;
            fans = Math.max(fans, A.fans.size); seated = Math.max(seated, [...A.fans].filter((v) => v.seated).length);
            const D0 = A.duel;
            if (D0 && D0.phase === 'enter' && !wasEnter) { wasEnter = true; unseatedAtEnter = [...A.fans].filter((v) => !v.seated).length; }
            if (D0?.phase === 'fight') for (const v of g.castleLife.byId.values()) if (v.arena?.id === A.id && v !== D0.a && v !== D0.b && Math.hypot(v.x - A.def.centre.x, v.z - A.def.centre.z) < 12) onFloorInFight++;
            if (A.duel?.phase === 'fight') { started = started || true; longest = Math.max(longest, A.duel.go); }
            const end = [...AD.log].find((l) => l.startsWith('end:'));
            if (started && end) ended = end;
            await new Promise((r) => setTimeout(r, 0));
        }
        return { fans, seated, started: !!started, ended, longest, unseatedAtEnter, onFloorInFight };
    });
    assert.ok(bots.seated >= 5, 'fans on the stands: ' + JSON.stringify(bots));
    assert.ok(bots.started && bots.ended, 'a duel run to its end: ' + JSON.stringify(bots));
    assert.ok(/:wand:|:time:/.test(bots.ended), 'ended by a taken wand (or time): ' + bots.ended);
    assert.equal(bots.unseatedAtEnter, 0, 'everybody sat before the duellists came out: ' + JSON.stringify(bots));
    assert.equal(bots.onFloorInFight, 0, 'nobody on the floor during the fight: ' + JSON.stringify(bots));
    assert.ok(bots.longest <= 300.5, 'never longer than 5 minutes');
    // a player signs up (a wand in his hand), is called out, comes to his mark: «3-2-1» and the duel
    const call = await page.evaluate(async () => {
        const g = window.__zns.game, AD = g.arenaDuels, A = window.__A();
        for (const s of ['right', 'left']) if (g.items.held[s]) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'arena-wand', color: 0x8844aa, model: 2, power: 10 }, 'right', { closed: true });
        A.queue.length = 0;
        AD._join(A, g.localId);
        let phase = null, counted = false;
        for (let k = 0; k < 600; k++) {
            window.__ff(40);
            const D = A.duel;
            if (D?.p === g.localId) {
                phase = D.phase;
                if (D.phase === 'call') { const m = A.def.gates[0].mark; g.character.group.position.set(m.x, m.y + 2.2, m.z); }
                if (AD.count) counted = true;
                if (D.phase === 'fight') break;
            }
            await new Promise((r) => setTimeout(r, 0));
        }
        return { phase, counted, voice: g.hud.voiceText?.(), q: A.queue, d: A.duel && { p: A.duel.p, ph: A.duel.phase }, log: [...AD.log].slice(-6), me: g.localId, pos: !!g.castleLife._playerPos(g.localId) };
    });
    assert.equal(call.phase, 'fight', JSON.stringify(call));
    assert.ok(call.counted, 'the «3-2-1» shown');
    // the player kills the wizard: a foul — a part of the wizards attack him, never all of them
    const foul = await page.evaluate(() => {
        const g = window.__zns.game, A = window.__A(), D = A.duel, L = g.castleLife;
        L.hit(D.a, 999, null, g.localId, { spell: true, kind: 'SapiraDuel' });
        const fighters = [...L.byId.values()].filter((v) => !v.dead && L._fights(v) && Math.hypot(v.x - A.def.x, v.z - A.def.z) < 70);
        const on = fighters.filter((v) => v.foe === g.localId);
        return { log: [...g.arenaDuels.log].slice(-3), fighters: fighters.length, on: on.length, over: A.duel?.phase };
    });
    assert.ok(foul.log.some((l) => l.startsWith('foul:')), JSON.stringify(foul));
    assert.ok(foul.on >= 1 && (foul.fighters < 2 || foul.on < foul.fighters), 'a part of them, not all: ' + JSON.stringify(foul));
    assert.deepEqual(realErrors(errors), []);
});
