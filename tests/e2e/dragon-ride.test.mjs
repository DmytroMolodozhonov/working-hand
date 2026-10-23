/**
 * «Brain Rot Maxima» in a real browser: the spell is cast at a calm dragon (held, 0,5 mana a second in the free world),
 * the hero gets on its back, it takes off and flies over the ground (never into it), «стоп» lets it glide down and land,
 * the hero is set on the ground; a dragon that is angry at the caster is not taken at all.
 * Run: node --test tests/e2e/dragon-ride.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8178;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('cast at a calm dragon, mount, fly over the ground, «стоп» → it lands with the rider; an angry dragon is not taken', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, ch = g.character, D = g.dragons, R = g.dragonRide;
        // (stepped by hand, in one go: the game's own loop is idle meanwhile — a slow headless browser would take minutes)
        const frames = async (n) => { for (let i = 0; i < n; i++) { D.update(0.05); R.update(0.05, true); } };
        const out = {};
        D.enabled = true;
        const p0 = ch.group.position;
        const gy = g.collision.groundY(p0.x + 9, p0.z);
        const d = D.spawn({ id: 'e2e', kind: 'obsidian', react: 1, flame: 1, pos: new p0.constructor(p0.x + 9, gy, p0.z), mode: 'landed' });
        d.restT = 999;
        g.knowsSpell = () => true;
        g.combat.maxFatigue = 200; g.combat.fatigue = 200;
        const before = g.combat.fatigue;
        out.cast = g.castLocalSpell('brain rot maxima', true);
        out.active = R.active;
        out.paid = before - g.combat.fatigue;
        await frames(20);
        out.upkeep = g.combat.fatigue; // (cost paid + ~1 s of upkeep)
        out.held = g.focus.held();
        // the plain «Брейнрот» is refused while held (the concentration rule)
        // mount (the jump itself needs the camera; the host's word is the same)
        R.onMounted(d, D.mount(d, g.localId));
        out.riding = !!R.riding;
        await frames(10);
        const seat = ch.group.position;
        out.seatDy = seat.y - d.model.position.y;
        out.size = d.size;
        // take-off: both arms up
        ch.areBothHandsUp = () => true;
        R.fc.start(); R.phase = 'fly';
        let under = 0, maxY = -1e9;
        for (let i = 0; i < 90; i++) {
            await frames(1);
            const p = d.model.position;
            const fl = g.animals._floor(p.x, p.z);
            if (p.y < fl - 0.05) under++;
            maxY = Math.max(maxY, p.y - fl);
        }
        out.under = under; out.maxAbove = maxY; out.fly = d.fly; out.phase = R.phase;
        // «стоп» in the air: it glides down and lands with the rider
        ch.areBothHandsUp = () => false;
        out.stop = g.stopSpells();
        out.phaseAfterStop = R.phase;
        for (let i = 0; i < 1200 && R.riding; i++) await frames(1);
        out.landed = !R.riding;
        const hp = ch.group.position, dp = d.model.position;
        out.heroAboveGround = hp.y - g.collision.groundY(hp.x, hp.z);
        out.heroDragonDist = Math.hypot(hp.x - dp.x, hp.z - dp.z);
        out.tameAfter = d.tame;
        out.activeAfter = R.active;
        // an angry dragon is not taken at all
        d.aggro = g.localId; d.target = g.localId;
        out.angry = D.tame(d, g.localId).code;
        return out;
    });
    assert.equal(r.cast, 'BrainrotMaxima', JSON.stringify(r));
    assert.ok(r.active && r.held === 'DragonTame', 'the spell is held');
    assert.ok(r.paid >= 21 && r.paid <= 31.5, 'the cast cost 30 (and the first time +8 cells came in): ' + r.paid);
    assert.ok(r.riding, 'on the dragon');
    assert.ok(r.seatDy > 4 * r.size && r.seatDy < 5.5 * r.size, 'seated on its back: ' + r.seatDy);
    assert.equal(r.under, 0, 'the dragon never went into the ground');
    assert.ok(r.fly > 0.9, 'in the air: ' + r.fly);
    assert.equal(r.landed, true, 'it landed with the rider');
    assert.ok(r.heroAboveGround < 4, 'the rider stands on the ground: ' + r.heroAboveGround);
    assert.ok(r.heroDragonDist > 2, 'beside the dragon, not inside it: ' + r.heroDragonDist);
    assert.equal(r.tameAfter, null, 'the dragon is its own again');
    assert.equal(r.angry, 'aggro', 'an angry dragon is not taken');
    assert.deepEqual(realErrors(errors), []);
});
