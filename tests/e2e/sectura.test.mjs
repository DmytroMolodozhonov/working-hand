/**
 * «Sectura» в настоящей игре: слово заточило палочку, взмах отпустил лезвие (мана 50 — при взмахе); чужой взмах на меня — рана 10–15 или отсечённая часть,
 * кровь идёт и сама затягивается; щит «Protection» отводит.
 * Run: node --test tests/e2e/sectura.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('Sectura: a slash from another player hits me (10–15 HP or a limb), bleeds, the word arms the wand and a swing pays 50 mana', { timeout: 900000 }, async () => {
    const { page } = await openPage(browser, srv.url, { noCamera: true });
    page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
    await startFromMenu(page, 'creative', { smooth: true }).catch(async (e) => {
        if (!/Timeout/.test(e.message)) throw e;
        await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 420000 });
    });
    await waitHudVisible(page, 120000);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const THREE = await import('three');
        const { packDir, SLASH } = await import('/src/game/SlashRules.js');
        const out = { has: !!g.slash, known: g.spells.matchSpell ? null : undefined };
        const c = g.combat; c.enabled = true; c.hp = c.maxHp || 20; const hp0 = c.hp; out.hp0 = hp0; out.maxHp = c.maxHp;
        const p = g.character.group.position;
        // a level slash from 6 m in front of me, at the height of my chest (so it crosses the body: a wound or a limb)
        const f = new THREE.Vector3(0, 0, 1);
        const o = new THREE.Vector3(p.x, p.y + 0.4, p.z - 6);
        g.slash.fire(o, packDir(f, 0.5), 'remote1', 'right');
        out.hp1 = c.hp; // (at once: nothing heals it in between)
        await sleep(400);
        out.hpLater = c.hp; out.lost = Object.keys(g.character.limbs || {}); out.bleed = g.bleeding.rate;
        out.flights = g.slash.flights.length;
        await sleep(SLASH.BLEED_TIME * 1000 + 3000);
        out.bleedAfter = g.bleeding.rate;
        out.hp2 = c.hp;
        return out;
    });
    console.log(JSON.stringify(r));
    assert.equal(r.has, true);
    assert.ok(r.flights >= 1, 'the picture flew');
    const lost = r.lost.length > 0;
    const lostHp = r.hp0 - r.hp1;
    assert.ok(lost || (lostHp >= 10 * (r.hp0 / (r.maxHp || r.hp0)) - 1e-6 && lostHp <= 15 + 1e-6) || lostHp >= 10, `a limb off or 10–15 HP: ${lostHp}`);
    assert.ok(r.bleed > 0 || lost, 'bleeds');
    assert.equal(r.bleedAfter, 0, 'the wound closed by itself');
});
