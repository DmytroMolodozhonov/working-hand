/**
 * Castles and their people — in a real browser.
 * Run: node --test tests/e2e/castles.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8156;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);

test('castles: people, knights at their posts, the king on his throne; seen violence → the guard; armour; kill the king → the castle is yours', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    // «Свободный мир»: no flying until a scroll of flight is burnt
    const fly = await page.evaluate(() => {
        const g = window.__zns.game;
        const before = g.knowsFlight(), started = g.startFlight();
        g.items.applyScroll({ kind: 'scroll', stat: 'flight' });
        return { before, started, after: g.knowsFlight() };
    });
    assert.deepEqual(fly, { before: false, started: false, after: true });
    const info = await page.evaluate(() => {
        const g = window.__zns.game;
        const idx = g.world.terrain.data.castles;
        const c = idx.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        const p = c.gate;
        g.character.group.position.set(p.x, p.y + 2.2, p.z);
        g.world.terrain.flushAround(p.x, p.z);
        return { id: c.id, name: c.name, stalls: c.stalls.length, knights: c.knights, chests: c.chests.length };
    });
    await frames(page, 40);
    const people = await page.evaluate(() => {
        const g = window.__zns.game, L = g.castleLife;
        const list = [...L.byId.values()];
        const king = list.find((v) => v.role === 'king');
        return {
            n: list.length, king: !!king, seated: king?.seated, kingMode: king?.mode,
            guards: list.filter((v) => v.job === 'guard').length, merchants: list.filter((v) => v.job === 'stall').length,
            wander: list.filter((v) => v.job === 'wander').length, patrol: list.filter((v) => v.job === 'patrol').length,
            chests: g.chests.filter((c) => c.castle && c.castle.id === window.__castle.id).map((c) => c.locked),
            map: g.hud.minimapCastles,
        };
    });
    assert.ok(people.n >= 8, `people: ${people.n}`);
    assert.ok(people.king && people.seated, 'the king sits on his throne');
    assert.ok(people.guards >= 4, `guards ${people.guards}`);
    assert.equal(people.merchants, info.stalls);
    assert.ok(people.chests.length === info.chests && people.chests.every((l) => l === true), 'chests locked while the king lives');
    assert.ok(people.map.includes(info.name), 'on the minimap');
    // a crowd comes out of the houses
    await frames(page, 60);
    assert.ok(await page.evaluate(() => [...window.__zns.game.castleLife.byId.values()].filter((v) => v.job === 'wander').length) >= 2, 'townsfolk walk about');

    // hit a gate guard in front of the others: armour first, the hearts go down slowly; the guard turns on me
    const fight = await page.evaluate(() => {
        const g = window.__zns.game, L = g.castleLife;
        const me = g.character.group.position;
        const guard = [...L.byId.values()].filter((v) => v.job === 'guard' && v.role === 'knight').sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
        for (let i = 0; i < 3; i++) { guard.damageCooldown = 0; g.onLocalHit(guard, 6, null, true); }
        const cs = guard.cs;
        return { hp: guard.hp, armor: guard.armor, hostile: cs.hostile.has(g.localId), foes: [...cs.active.values()].filter((v) => v.foe === g.localId).length };
    });
    assert.equal(fight.armor, 50 - 18, 'armour took the blows');
    assert.ok(fight.hp > 16 && fight.hp < 20, `hearts go down slowly (${fight.hp})`);
    assert.ok(fight.hostile && fight.foes >= 2, `the guard attacks (${fight.foes} knights)`);
    // they run at me and strike (or I am already down)
    let seenRun = false, hp = 20;
    for (let i = 0; i < 12; i++) {
        await frames(page, 5);
        const s = await page.evaluate(() => { const g = window.__zns.game; return { run: [...g.castleLife.byId.values()].some((v) => v.foe && (v.mode === 'run' || v.mode === 'attack')), hp: g.combat.hp, dead: g.combat.dead }; });
        seenRun = seenRun || s.run;
        hp = Math.min(hp, s.dead ? 0 : s.hp);
        if (seenRun && hp < 20) break;
    }
    assert.ok(seenRun, 'knights run at me');
    assert.ok(hp < 20, `the knights' swords hurt (${hp} HP)`);
    // (back on my feet for the king)
    await page.evaluate(() => { const g = window.__zns.game; if (g.combat.dead) g.respawn(); g.combat.hp = 20; });

    // the king: hit him → every knight comes; kill him → the castle is mine
    const end = await page.evaluate(() => {
        const g = window.__zns.game, L = g.castleLife;
        const king = [...L.byId.values()].find((v) => v.role === 'king');
        const before = [...king.cs.active.values()].filter((v) => v.role === 'knight').length;
        king.damageCooldown = 0;
        g.onLocalHit(king, 10, null, true);
        const after = [...king.cs.active.values()].filter((v) => v.role === 'knight').length;
        const kingArmorHit = { hp: king.hp, armor: king.armor };
        for (let i = 0; i < 60 && !king.dead; i++) { king.damageCooldown = 0; g.onLocalHit(king, 12, null, true); }
        const st = L.state(king.cs.def.id);
        return {
            before, after, kingArmorHit, dead: king.dead, owner: st.owner === g.localId, kingDead: st.kingDead,
            hostile: king.cs.hostile.size, foes: [...king.cs.active.values()].filter((v) => v.foe).length,
            chests: king.cs.chests.map((c) => c.locked), snap: L.snapshot()[king.cs.def.id],
        };
    });
    assert.ok(end.after > end.before, `knights come running (${end.before} → ${end.after})`);
    assert.deepEqual(end.kingArmorHit, { hp: 28, armor: 90 }, 'the king\'s armour (100)');
    assert.ok(end.dead && end.kingDead && end.owner, 'the castle is mine');
    assert.equal(end.hostile, 0);
    assert.equal(end.foes, 0, 'the knights stop');
    assert.ok(end.chests.every((l) => l === false), 'chests open');
    assert.ok(end.snap && end.snap.kingDead, 'saved');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
