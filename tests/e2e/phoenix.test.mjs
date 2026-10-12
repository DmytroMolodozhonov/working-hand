/**
 * The phoenix in the real game («Выживание»): wounded (HP, bleeding, an arm cut off), a phoenix
 * near and the 9% roll won — it flies over, lands in front of me, and while I stand still it comes
 * up and touches me: whole again (HP, blood, the arm back). Moving scares it off. Attacked again
 * and again it may turn on me (fire from above); killed, it leaves a phoenix feather.
 * Run: node --test tests/e2e/phoenix.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8199;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('phoenix: comes to the wounded, heals him whole if he stands still; flees a moving one; fights back; leaves a feather', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, P = g.phoenixes;
        P.enabled = false;
        for (const f of [...P.list]) P._remove(f);
        const me = g.character.group.position;
        const step = (n, each) => { for (let i = 0; i < n; i++) { each?.(i); P.update(0.05); } };
        const f = P.spawn(new T.Vector3(me.x + 40, me.y + 35, me.z + 10));
        step(2);
        // wounded: blows, an arm cut off (it bleeds)
        P.callChance = 1;
        g.combat.damage(6, null, 'melee');
        g.dismember._cutMine({ limb: 'leftArm', d: 0.6, n: [0, 0, 1], v: [5, 0, 0], lf: g.dismember.life }, null, true);
        const hurt = { hp: g.combat.hp, bleed: g.bleeding.rate, arm: g.character.limbs?.leftArm != null };
        let landed = -1, healedAt = -1, landD = 0;
        const states = new Set();
        step(1200, (i) => {
            states.add(f.state);
            if (landed < 0 && f.state === 'watch') { landed = i; landD = Math.hypot(f.model.position.x - me.x, f.model.position.z - me.z); }
            if (healedAt < 0 && P.log.some((e) => e.ev === 'healed')) healedAt = i;
        });
        const healed = { hp: g.combat.hp, max: g.combat.maxHp || 20, bleed: g.bleeding.rate, arm: g.character.limbs?.leftArm != null, at: healedAt, landed };
        // again, wounded — this time I walk about: it starts back and flies off
        P.healCool.clear();
        f.state = 'soar'; f.call = null; f.model.position.set(me.x + 30, me.y + 30, me.z);
        g.combat.damage(3, null, 'melee');
        g.bleeding.rate = 0; P._me.dropAt = -1e9;
        let scared = false;
        step(900, () => {
            if (f.state === 'watch' || f.state === 'approach') me.x += 0.25; // (4 m/s: walking)
            if (!scared && (f.state === 'leave' || f.state === 'takeoff') && P.log.some((e) => e.ev === 'startle')) scared = true;
        });
        const notHealed = g.combat.hp < (g.combat.maxHp || 20);
        // attacked again and again: it turns on me, dives, strikes with fire
        P.rageChance = 1;
        g.combat.hp = g.combat.maxHp || 20;
        f.state = 'soar'; f.model.position.set(me.x + 6, me.y + 2, me.z);
        P.grudge.clear();
        for (let k = 0; k < 3; k++) { f._lastAtk = null; P.hit(f, 1, 'melee', g.localId); }
        const raging = f.state === 'rage';
        let struck = false;
        step(400, () => { if (!struck && P.log.some((e) => e.ev === 'strike')) struck = true; });
        const hpAfterFire = g.combat.hp;
        // killed: it burns, a feather drifts down
        const was = [...g.items.loose.values()].filter((L) => L.item.kind === 'phoenixFeather').length;
        P.hit(f, 99, 'melee', g.localId);
        const feathers = [...g.items.loose.values()].filter((L) => L.item.kind === 'phoenixFeather').length - was;
        return { hurt, healed, landD, states: [...states], scared, notHealed, raging, struck, hpAfterFire, feathers, dead: f.dead };
    });
    assert.ok(r.hurt.hp < 20 && r.hurt.bleed > 0 && r.hurt.arm, 'wounded: ' + JSON.stringify(r.hurt));
    assert.ok(r.healed.landed > 0, 'it landed by me: ' + JSON.stringify(r));
    assert.ok(r.landD > 4 && r.landD < 10, `in front of me, a few metres away (${r.landD.toFixed(1)} m)`);
    assert.ok(r.healed.at > r.healed.landed, 'it healed me after landing, while I stood still');
    assert.equal(r.healed.hp, r.healed.max, 'full HP');
    assert.equal(r.healed.bleed, 0, 'the bleeding stopped');
    assert.equal(r.healed.arm, false, 'the arm grew back');
    assert.ok(r.scared && r.notHealed, 'moving: it starts back and flies off, no healing ' + JSON.stringify({ scared: r.scared, notHealed: r.notHealed }));
    assert.ok(r.raging, 'attacked again and again (rage chance forced): it turns on me');
    assert.ok(r.struck && r.hpAfterFire < 20, `its fire struck me (${r.hpAfterFire} HP)`);
    assert.ok(r.dead && r.feathers === 1, 'killed: it burns and leaves one phoenix feather');
    assert.deepEqual(realErrors(errors), []);
});
