/**
 * The Ice Castle — in a real browser (Creative: on the mountain by the start): the queen on her
 * throne, the monsters at the gates, snowmen; a plain spell does nothing on the queen, fire does;
 * a snowflake −1; the monsters drive a player off the gates; the Ice Rod's «Frozen» freezes a
 * player in full magic armour and lays ice where it points; fire melts the palace.
 * Run: node --test tests/e2e/ice-castle.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8183;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the Ice Castle: its queen, snowmen, monsters; the Ice Rod', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 640, height: 360 } }); // (small: the picture is drawn by the processor here)
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, ch = g.character, I = g.iceCastle, P = I.plan, THREE = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const until = async (ok, ms) => { const t0 = performance.now(); while (!ok() && performance.now() - t0 < ms) await frames(1); };
        const out = { plan: !!P, near: P && Math.hypot(P.x, P.z) };
        // come near: it wakes
        ch.group.position.set(P.gate.out.x, P.gate.out.y + 3, P.gate.out.z);
        ch.verticalVelocity = 0;
        await frames(20);
        const q = I.queen;
        out.awake = I.active;
        out.queenHp = q?.hp;
        out.monsters = I.list.filter((c) => c.type === 'monster').length;
        out.snowmen = I.list.filter((c) => c.type === 'snowman').length;
        out.gates = ['iceGateL', 'iceGateR'].filter((id) => g.doors.list.has(id)).length;
        // the queen: a plain spell nothing, fire — more than its damage
        I.hit(q, 20, 'Bombardo');
        I.boltHit(q, 'Stupefy');
        out.afterPlain = q.hp;
        I.hit(q, 10, 'Inferno');
        out.afterFire = q.hp;
        // a snowman: a snowflake −1 (and so on), 10 HP in all
        const s = I.list.find((c) => c.type === 'snowman');
        out.snowHp = s.hp;
        I.hit(s, 1, 'snow');
        out.snowAfter = s.hp;
        // a snowflake on me: −1 HP (the free world's rule: Creative never hurts — for the test it does)
        const mode = g.config.mode;
        g.config.mode = 'survival';
        const hp0 = g.playerHP;
        const me = g.combat.center(new THREE.Vector3());
        I._fire('snow', me.clone().add(new THREE.Vector3(6, 1, 0)), me, { to: { k: 'p', id: g.localId } });
        await until(() => !I.shots.length, 8000);
        out.snowOnMe = hp0 - g.playerHP;
        g.config.mode = mode;
        // the monsters: a player at the gates is driven off (a fist of ice, thrown back from the gates)
        const hurt = [];
        const orig = I._hurtMe.bind(I);
        I._hurtMe = (dmg, kind, from, push) => { hurt.push(kind); orig(dmg, kind, from, push); };
        for (const c of I.list) if (c.type !== 'monster') c.stunT = 99; // (only the monsters this time)
        ch.group.position.set(P.gate.x + (P.gate.out.x - P.gate.x) * 0.3, P.gate.y + 2.2, P.gate.z + (P.gate.out.z - P.gate.z) * 0.3);
        const g0 = Math.hypot(ch.group.position.x - P.gate.x, ch.group.position.z - P.gate.z);
        await until(() => hurt.includes('punch'), 60000);
        await until(() => false, 1500);
        out.punched = hurt.includes('punch');
        out.drivenOff = Math.hypot(ch.group.position.x - P.gate.x, ch.group.position.z - P.gate.z) - g0;
        I._hurtMe = orig;
        for (const c of I.list) c.stunT = 99;
        // the Ice Rod: in my hand; «Frozen» at me (as another player's rod at me: my computer decides)
        // in a full set of magic armour and a magic robe — «Айс» bounces off it, the rod's ice does not
        for (const piece of ['helmet', 'chest', 'legs']) g.armor.wear({ kind: 'armor', piece, magic: true, uid: 'a' + piece }, { quiet: true });
        g.armor.wear({ kind: 'robe', magic: true, uid: 'robe1' }, { quiet: true });
        out.armourStopsIce = g.armor.guard('IceDuel', { quiet: true });
        g.combat.frozenLeft = 0;
        I._frozenMe('someone', 10);
        out.frozenThroughArmour = g.combat.frozen;
        g.combat.frozenLeft = 0;
        // the rod pointing at a villager-free patch of ground: a layer of ice; again — the next layer
        g.items.takeIntoHand({ kind: 'iceRod', uid: 'rod1' }, 'right');
        out.held = !!I.myRod();
        const t = g.world.terrain.data;
        const gx = Math.round(P.x + (P.gate.out.x - P.x) * 1.4), gz = Math.round(P.z + (P.gate.out.z - P.z) * 1.4) + 5;
        const top = t.topLayer(gx, gz);
        const o = new THREE.Vector3(gx, top + 6, gz), d = new THREE.Vector3(0, -1, 0);
        I.rodAim = () => ({ o: o.clone(), d: d.clone() });
        I._rodAt = 0;
        out.cast1 = I.rodFrozen(true);
        const L1 = t.get(gx, top + 1, gz);
        I._rodAt = 0;
        I.rodFrozen(true);
        out.layer1 = L1;
        out.layer2 = t.get(gx, top + 2, gz);
        out.iceBlock = 59;
        // fire melts it
        I.meltAt(new THREE.Vector3(gx, top + 1, gz), 3, g.localId, 3);
        out.melted = t.get(gx, top + 2, gz) === 0;
        // the rod at a creature: a snowman is not frozen (it is ice) — a living animal / villager would be
        return out;
    });
    assert.ok(r.plan && r.near < 150, 'Creative: the castle is by the start');
    assert.ok(r.awake, 'it wakes when a player comes');
    assert.equal(r.queenHp, 350);
    assert.equal(r.monsters, 2, 'two ice monsters');
    assert.ok(r.snowmen >= 5, 'snowmen about');
    assert.equal(r.gates, 2, 'the two ice gate leaves (doors)');
    assert.equal(r.afterPlain, 350, 'a plain spell does nothing on her');
    assert.ok(r.afterFire < 340, 'fire hurts her more than its damage');
    assert.equal(r.snowHp, 10);
    assert.equal(r.snowAfter, 9);
    assert.equal(r.snowOnMe, 1, 'a snowflake: −1 HP');
    assert.ok(r.punched, 'a monster strikes whoever is at the gates');
    assert.ok(r.drivenOff > 2, `…and throws him off the gates (${r.drivenOff})`);
    assert.ok(r.armourStopsIce, 'magic armour stops «Айс»…');
    assert.ok(r.frozenThroughArmour, '…but not the Ice Rod');
    assert.ok(r.held);
    assert.equal(r.cast1, 'Frozen');
    assert.equal(r.layer1, r.iceBlock, 'a layer of ice where the rod points');
    assert.equal(r.layer2, r.iceBlock, '…and the next layer on it');
    assert.ok(r.melted, 'fire melts it');
    assert.deepEqual(realErrors(errors), []);
});
