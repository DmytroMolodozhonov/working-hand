/**
 * «Империус» in a real browser: cast at a zombie (100 mana, held, 1 a second), the mind's light carries the view into it,
 * the hero's walking in place walks the zombie (the body stays, its eyes white), the body's turn turns it, it never walks
 * through a wall; far away the screen darkens and the link tears; «стоп» brings the mind back. A cow walks the same way;
 * a dragon is refused by the plain spell.
 * Run: node --test tests/e2e/imperius.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8181;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('into a zombie: the view in its eyes, it walks for the hero, the body stays with white eyes; far — dark, then torn; into a cow; «стоп»', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, ch = g.character, I = g.imperius;
        const V = ch.group.position.constructor;
        const out = {};
        g.knowsSpell = () => true;
        g.combat.maxFatigue = 400; g.combat.fatigue = 400;
        const p0 = ch.group.position.clone();
        const yaw0 = ch.group.rotation.y;
        // a zombie 8 m ahead of the hero (where the hero looks), on the ground, alone
        for (const z of [...g.zombies]) g.removeZombie(z);
        const fx = -Math.sin(yaw0), fz = -Math.cos(yaw0);
        const zx = p0.x + fx * 8, zz = p0.z + fz * 8;
        const z = g._createZombie(new V(zx, g.collision.groundY(zx, zz) + 1, zz));
        z.isSleeping = false;
        g._updateZombies(0.05);
        // look at it (no camera here: the eyes' line aims)
        g.camera.position.copy(p0).y += 1.4;
        g.camera.lookAt(z.group.position.x, z.group.position.y + 1, z.group.position.z);
        g.camera.updateMatrixWorld(true);
        const before = g.combat.fatigue;
        out.cast = g.castLocalSpell('империус', true);
        out.paid = before - g.combat.fatigue;
        out.held = g.focus.held();
        out.blocked = g.castLocalSpell('люмос', true); // (in another body: no spell of yours)
        let turnTo = null; // (the game sets the body's turn every frame from the camera: here by hand)
        const step = (n, run = false) => {
            for (let i = 0; i < n; i++) {
                if (turnTo != null) ch.group.rotation.y = turnTo;
                if (run) { ch.isRunning = true; ch.runIntensity = 0.3; }
                I.input(0.05);
                g._updateZombies(0.05);
                I.afterPlayer();
                I.update(0.05);
                g._updateCamera(0.05);
            }
        };
        step(30); // (the passage: 1 s)
        out.phase = I.phase;
        const head = z.head.getWorldPosition(new V());
        out.camToHead = g.camera.position.distanceTo(head);
        out.eyes = !!ch._impEyes?.visible;
        out.manaAfter1s = g.combat.fatigue;
        // walking in place: the zombie walks ahead, the body stays
        // (it walks the way IT faces: its face when taken, turned as the body turns since)
        const zp0 = z.group.position.clone(), zy0 = I._yaw0, zfx = -Math.sin(zy0), zfz = -Math.cos(zy0);
        step(60, true);
        out.zWalked = Math.hypot(z.group.position.x - zp0.x, z.group.position.z - zp0.z);
        out.zAlong = ((z.group.position.x - zp0.x) * zfx + (z.group.position.z - zp0.z) * zfz);
        out.bodyMoved = Math.hypot(ch.group.position.x - p0.x, ch.group.position.z - p0.z);
        // the body's turn turns it (a quarter round)
        turnTo = yaw0 + Math.PI / 2;
        step(40);
        turnTo = null;
        out.faceErr = Math.abs(((z.group.rotation.y + Math.PI) - (zy0 + Math.PI / 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        // far: 45 m from the body — dark; 61 m — torn
        z.group.position.set(p0.x + fx * 45, z.group.position.y, p0.z + fz * 45);
        z.group.position.y = g.collision.groundY(z.group.position.x, z.group.position.z) + z.gOff;
        I.update(0.05);
        out.dark45 = I.dark;
        z.group.position.set(p0.x + fx * 62, z.group.position.y, p0.z + fz * 62);
        z.group.position.y = g.collision.groundY(z.group.position.x, z.group.position.z) + z.gOff;
        I.update(0.05);
        out.afterFar = I.phase;
        step(30);
        out.activeAfterFar = I.active;
        out.zFree = !z.imp;
        out.eyesAfter = !!ch._impEyes?.visible;
        // a cow, the same way; «стоп» brings the mind back
        const cx = p0.x + fx * 7, cz = p0.z + fz * 7;
        const cow = g.animals._spawn('cow', new V(cx, g.collision.groundY(cx, cz) + 0.5, cz), {});
        g.camera.position.copy(p0).y += 1.4;
        g.camera.lookAt(cx, cow.group.position.y + 1, cz);
        g.camera.updateMatrixWorld(true);
        I._lastCast = 0;
        out.cowCast = g.castLocalSpell('империус', true);
        const stepA = (n, run = false) => {
            for (let i = 0; i < n; i++) {
                if (run) { ch.isRunning = true; ch.runIntensity = 0.3; }
                I.input(0.05); g.animals.update(0.05); I.afterPlayer(); I.update(0.05); g._updateCamera(0.05);
            }
        };
        stepA(30);
        const cp0 = cow.group.position.clone();
        stepA(60, true);
        out.cowWalked = Math.hypot(cow.group.position.x - cp0.x, cow.group.position.z - cp0.z);
        // harm to the body left standing: nothing (0, or a shield took it all) — it holds; any real harm — the mind back at once
        I.interruptByDamage(0, 'fire');
        out.holdsAfterNothing = I.phase === 'on';
        g.combat.damage(2, null, 'fire');
        out.backAfterFire = I.phase === 'out';
        stepA(30);
        out.activeAfterFire = I.active;
        g.combat.stunLeft = 0;
        g.combat.fatigue = 400; I._lastCast = 0;
        g.camera.position.copy(p0).y += 1.4; g.camera.lookAt(cx, cow.group.position.y + 1, cz); g.camera.updateMatrixWorld(true);
        out.cowAgain = g.castLocalSpell('империус', true);
        stepA(30);
        out.stop = g.castLocalSpell('стоп', true);
        stepA(30);
        out.cowActiveAfterStop = I.active;
        // a dragon: the plain spell says no (magic)
        const { canTake } = await import('/src/game/Imperius.js');
        out.dragon = canTake('dragon', false).ok;
        return out;
    });
    assert.equal(r.cast, 'Imperius', JSON.stringify(r));
    assert.ok(r.paid >= 85 && r.paid <= 100.5, 'paid 100 (a wand would save some): ' + r.paid);
    assert.equal(r.held, 'Imperius');
    assert.equal(r.blocked, null, 'no other spell while in another body');
    assert.equal(r.phase, 'on', 'the passage is over');
    assert.ok(r.camToHead < 1.2, 'the view is in its head: ' + r.camToHead);
    assert.ok(r.eyes, 'the body\'s eyes burn white');
    assert.ok(r.zWalked > 2 && r.zAlong > 1.5, `the zombie walked ahead: ${r.zWalked} (${r.zAlong} along)`);
    assert.ok(r.bodyMoved < 0.05, 'the body stays: ' + r.bodyMoved);
    assert.ok(r.faceErr < 0.5, 'the zombie turned with the body: ' + r.faceErr);
    assert.ok(r.dark45 > 0.2 && r.dark45 < 1, 'dark at 45 m: ' + r.dark45);
    assert.equal(r.afterFar, 'out', 'torn past 60 m: the mind flies back');
    assert.equal(r.activeAfterFar, false);
    assert.ok(r.zFree && !r.eyesAfter, 'the zombie its own again, the eyes as they were');
    assert.equal(r.cowCast, 'Imperius', 'into a cow');
    assert.ok(r.cowWalked > 1, 'the cow walked: ' + r.cowWalked);
    assert.equal(r.cowActiveAfterStop, false, '«стоп»: back in the body');
    assert.ok(r.holdsAfterNothing, 'no harm (a shield took it): it holds');
    assert.ok(r.backAfterFire && r.activeAfterFire === false, 'fire on the body: the mind back at once');
    assert.equal(r.dragon, false);
    assert.deepEqual(realErrors(errors), []);
});
