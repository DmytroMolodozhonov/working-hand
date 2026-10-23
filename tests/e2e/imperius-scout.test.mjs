/**
 * «Империус» as scouting without risk (the author): in a castle a taken person is told to go, then beaten; a taken pig is
 * shooed out and never hurt; the taken person killed — the mind comes back into the hero's body, the hero unhurt, his
 * camera and his body his own again.
 * Run: node --test tests/e2e/imperius-scout.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8187;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('in a castle: a taken person warned then beaten, a taken pig shooed and unhurt; the person killed — the hero back, unhurt', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, ch = g.character, I = g.imperius, L = g.castleLife;
        const V = ch.group.position.constructor;
        const out = {};
        const run = (n) => { for (let i = 0; i < n; i++) { g.lastTime = performance.now() - 50; g.frame(); } };
        g.combat.maxFatigue = 400; g.combat.fatigue = 400;
        // the nearest walled castle: the hero walks up to its gate (it wakes)
        const def = L.index.near(0, 0, 2500).filter((d) => d.walls && !/wiz|tower|hamlet|village|stall/.test(d.kind || '')).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        if (!def) return { none: true, kinds: L.index.near(0, 0, 2500).map((d) => d.kind + (d.walls ? '+w' : '')) };
        const w = def.walls, gx = (w.x0 + w.x1) / 2, gz = w.z1 + 14;
        ch.group.position.set(gx, g.collision.groundY(gx, gz) + 2, gz);
        let cs = null;
        for (let i = 0; i < 400 && !(cs?.awake && [...cs.active.values()].some((v) => v.role === 'knight')); i++) { run(5); cs = L.castles.get(def.id); }
        out.awake = !!cs?.awake;
        if (!cs?.awake) return out;
        run(20);
        const hp0 = g.combat.hp;
        // a person inside the walls (not a knight), taken
        const people = [...cs.active.values()].filter((q) => !q.dead && q.role !== 'knight' && q.role !== 'king' && !q.wizard && !q.seated);
        const v = people.find((q) => !(q.armor > 0)) || people[0];
        if (v && !L._inWalls(def, v)) { v.x = (w.x0 + w.x1) / 2; v.z = w.z1 - 5; v.y = g.collision.groundY(v.x, v.z); v.path = null; } // (brought inside the walls, by the gate)
        out.person = !!v;
        if (!v) return out;
        const take = (sys, id) => { const res = I.claim(sys, id, g.localId, 'Imperius'); I.onTaken(sys, id, 'Imperius', res); return res.ok; };
        out.tookPerson = take('v', v.id);
        const vhp0 = v.hp;
        run(60); // (3 s: a knight takes the duty, comes, tells it to go)
        const duty = () => [...cs.active.values()].find((k) => k.impDuty?.id === v.id);
        out.duty = !!duty();
        out.modeEarly = duty()?.impDuty?.mode || null;
        run(420); // (21 s more: still there — beaten)
        out.modeLate = duty()?.impDuty?.mode || null;
        { const k = duty(); out.kd = k ? +Math.hypot(k.x - v.x, k.z - v.z).toFixed(1) : null; out.kmode = k?.mode; out.warnT = k?.impDuty?.warnT; }
        out.beaten = v.hp < vhp0;
        out.hpMid = v.hp; out.vhp0 = vhp0;
        // killed (by anyone): the mind back home, the hero unhurt
        if (!v.dead) { v.damageCooldown = 0; L.hit(v, 999, new V(0, 0, 1), null, {}); }
        run(40);
        out.activeAfterDeath = I.active;
        out.heroAlive = !g.isDeadLocal && !g.combat.dead;
        out.heroHurt = hp0 - g.combat.hp;
        out.camToHead = g.camera.position.distanceTo(ch.getHeadPosition(new V()));
        // a pig inside the walls, taken: shooed, never hurt
        const px = (w.x0 + w.x1) / 2, pz = (w.z0 + w.z1) / 2 + 4;
        const pig = g.animals._spawn('pig', new V(px, g.collision.groundY(px, pz) + 0.5, pz), {});
        g.combat.fatigue = 400; I._lastCast = 0;
        out.tookPig = take('a', pig.id);
        const php0 = pig.hp;
        run(300); // (15 s)
        out.pigDuty = [...cs.active.values()].some((k) => k.impDuty?.id === pig.id) || out.pigDutySeen;
        out.pigAlive = !pig.dead;
        out.pigHurt = php0 - pig.hp;
        g.castLocalSpell('стоп', true);
        run(30);
        out.activeEnd = I.active;
        return out;
    });
    if (process.env.ZNS_DUMP) (await import('node:fs')).writeFileSync(process.env.ZNS_DUMP, JSON.stringify(r));
    if (r.none) return; // (no walled castle in reach in this world: nothing to check)
    assert.ok(r.awake && r.person && r.tookPerson, JSON.stringify(r));
    assert.ok(r.duty && r.modeEarly === 'warn', 'a knight comes and tells it to go: ' + JSON.stringify(r));
    assert.equal(r.modeLate, 'beat', 'still there: beaten');
    assert.ok(r.beaten, 'the blows land: ' + r.hpMid + ' < ' + r.vhp0);
    assert.equal(r.activeAfterDeath, false, 'killed: the mind is home');
    assert.ok(r.heroAlive && r.heroHurt <= 0, 'the hero unhurt: ' + r.heroHurt);
    assert.ok(r.camToHead < 1.5, 'the view is the hero\'s own again: ' + r.camToHead);
    assert.ok(r.tookPig && r.pigAlive && r.pigHurt <= 0, 'the pig shooed, never hurt: ' + JSON.stringify(r));
    assert.equal(r.activeEnd, false);
    assert.deepEqual(realErrors(errors), []);
});
