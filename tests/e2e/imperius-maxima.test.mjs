/**
 * «Империус Максима» in a real browser: the plain «Империус» does not take a dragon; the Maxima does (500 mana). In the
 * dragon: strokes of the arms standing — it does not rise; running, the strokes take it up; flapping it climbs over the
 * ground (never into it); a long «У» — its fire (where the eyes look); «стоп» — the mind back. An owl takes off from the spot.
 * Run: node --test tests/e2e/imperius-maxima.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8183;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('a dragon: the plain spell no, the Maxima yes; run + strokes — it flies over the ground; «У» — fire; an owl from the spot', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, ch = g.character, I = g.imperius, D = g.dragons;
        const V = ch.group.position.constructor;
        const out = {};
        g.knowsSpell = () => true;
        g.combat.maxFatigue = 1200; g.combat.fatigue = 1200;
        D.enabled = true;
        const p0 = ch.group.position.clone(), yaw0 = ch.group.rotation.y;
        const fx = -Math.sin(yaw0), fz = -Math.cos(yaw0);
        const dx = p0.x + fx * 16, dz = p0.z + fz * 16;
        const d = D.spawn({ id: 'imp-e2e', kind: 'obsidian', react: 1, flame: 1, pos: new V(dx, g.collision.groundY(dx, dz), dz), mode: 'landed', yaw: yaw0 });
        d.restT = 999;
        const aim = (x, y, z) => { g.camera.position.copy(p0).y += 1.4; g.camera.lookAt(x, y, z); g.camera.updateMatrixWorld(true); };
        aim(dx, d.model.position.y + 3, dz);
        out.plain = g.castLocalSpell('империус', true);
        I._lastCast = 0;
        aim(dx, d.model.position.y + 3, dz);
        const before = g.combat.fatigue;
        out.cast = g.castLocalSpell('империус максима', true);
        out.paid = before - g.combat.fatigue;
        const rv = ch.handRelVelocity;
        let keepNear = false;
        const frame = (dt, o = {}) => {
            if (o.run) { ch.isRunning = true; ch.runIntensity = 1; }
            if (o.stroke != null) { rv.left.set(0, o.stroke, 0); rv.right.set(0, o.stroke, 0); }
            if (keepNear) { I._body.x = d.model.position.x + 20; I._body.z = d.model.position.z; } // (the hero's body kept in reach: the link holds 120 m)
            I.input(dt); D.update(dt); I.afterPlayer(); I.update(dt); g._updateCamera(dt);
        };
        // (a stroke: 6 frames of both arms coming down fast, then still)
        const stroke = (run) => { for (let i = 0; i < 6; i++) frame(0.05, { stroke: -7, run }); for (let i = 0; i < 4; i++) frame(0.05, { stroke: 0, run }); };
        for (let i = 0; i < 25; i++) frame(0.05, { stroke: 0 });
        out.phase = I.phase;
        const y0 = d.model.position.y;
        for (let k = 0; k < 4; k++) stroke(false);
        out.standRise = d.model.position.y - y0;
        out.airStanding = !!I.I.fly?.air;
        // running, then strokes: it takes off and climbs
        keepNear = true;
        for (let i = 0; i < 30; i++) frame(0.05, { run: true, stroke: 0 });
        for (let k = 0; k < 8; k++) stroke(true);
        out.air = !!I.I.fly?.air;
        out.dbg = { fly: { ...(I.I.fly || {}) }, said: [...I._said.keys()].slice(-4), walk: I.I.walk, run: I.I.run, flaps: I.flaps.last, roof: g.collision.pointBlocked?.(d.model.position.x, d.model.position.y + 7 * d.size, d.model.position.z), lair: !!D.lairAt?.(d.model.position, 3) };
        let under = 0, maxAbove = 0;
        for (let k = 0; k < 6; k++) { // (not too long: 120 m from the body the link tears)
            stroke(false);
            const p = d.model.position, fl = g.animals._floor(p.x, p.z);
            if (p.y < fl - 0.05) under++;
            maxAbove = Math.max(maxAbove, p.y - fl);
        }
        out.under = under; out.maxAbove = maxAbove; out.dFly = d.fly;
        // the fire: a long loud «У» (the body brought under it: a dragon flies far in a few strokes — 120 m tears the link)
        I._body.x = d.model.position.x + 20; I._body.z = d.model.position.z; ch.group.position.x = I._body.x; ch.group.position.z = I._body.z;
        for (let i = 0; i < 20; i++) { I.voiceLevel(-64); frame(0.05, { stroke: 0 }); }
        for (let i = 0; i < 25; i++) { I.voiceLevel(-25); I.voiceLetters('ууу'); frame(0.05, { stroke: 0 }); }
        out.fire = !!d.breath?.imp;
        out.activeAtFire = I.active; out.distAtFire = Math.hypot(d.model.position.x - p0.x, d.model.position.z - p0.z);
        out.fireK = d.breath?.k || 0;
        // gliding without strokes: it comes down
        let top = -1e9;
        for (let i = 0; i < 120; i++) { frame(0.05, { stroke: 0 }); top = Math.max(top, d.model.position.y - g.animals._floor(d.model.position.x, d.model.position.z)); }
        out.glideDrop = top - (d.model.position.y - g.animals._floor(d.model.position.x, d.model.position.z)); // (after the last strokes' climb is spent it sinks)
        out.stop = g.castLocalSpell('стоп', true);
        for (let i = 0; i < 30; i++) frame(0.05, { stroke: 0 });
        out.activeAfter = I.active;
        out.dragonMode = d.mode;
        // an owl: from the spot
        g.combat.fatigue = 1200; I._lastCast = 0;
        ch.group.position.copy(p0); // (the body back where it stood)
        const ox = p0.x + fx * 6, oz = p0.z + fz * 6;
        const o = g.owls.spawn(new V(ox, g.collision.groundY(ox, oz), oz));
        if (o) {
            o.state = 'perch'; o.a.mode = 'stand';
            aim(ox, o.model.position.y + 0.6, oz);
            out.owlCast = g.castLocalSpell('империус максима', true);
            const of = (dt, sv) => { rv.left.set(0, sv, 0); rv.right.set(0, sv, 0); I.input(dt); g.owls.update(dt); I.afterPlayer(); I.update(dt); g._updateCamera(dt); };
            for (let i = 0; i < 25; i++) of(0.05, 0);
            const oy = o.model.position.y;
            for (let k = 0; k < 6; k++) { for (let i = 0; i < 6; i++) of(0.05, -6); for (let i = 0; i < 4; i++) of(0.05, 0); }
            out.owlRise = o.model.position.y - oy;
            g.castLocalSpell('стоп', true);
        }
        return out;
    });
    assert.equal(r.plain, null, 'the plain «Империус» does not take a dragon');
    assert.equal(r.cast, 'ImperiusMaxima', JSON.stringify(r));
    assert.ok(r.paid >= 400 && r.paid <= 500.5, 'paid 500: ' + r.paid);
    assert.equal(r.phase, 'on');
    assert.ok(!r.airStanding && r.standRise < 0.5, 'standing, the strokes do not lift a dragon: ' + r.standRise);
    assert.ok(r.air, 'running, the strokes take it up: ' + JSON.stringify(r.dbg));
    assert.equal(r.under, 0, 'never into the ground');
    assert.ok(r.maxAbove > 3, 'it climbed: ' + r.maxAbove);
    assert.ok(r.fire && r.fireK > 0.5, 'a long «У»: its fire, as big as the voice: ' + r.fireK + ' ' + r.activeAtFire + ' ' + r.distAtFire);
    assert.ok(r.glideDrop > 0, 'no strokes: it glides down: ' + r.glideDrop);
    assert.equal(r.activeAfter, false, '«стоп»: back in the body');
    assert.notEqual(r.dragonMode, 'ride', 'the dragon its own again');
    if (r.owlCast !== undefined) {
        assert.equal(r.owlCast, 'ImperiusMaxima');
        assert.ok(r.owlRise > 1, 'the owl takes off from the spot: ' + r.owlRise);
    }
    assert.deepEqual(realErrors(errors), []);
});
