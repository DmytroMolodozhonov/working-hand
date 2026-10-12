// «Джолт» in the real game: the air charge flies at the zombie the raised hand points at, the zombie
// is thrown back and flips over in the air; on me: thrown off the feet, tumbling, dizzy afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8163;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('«Джолт»: a zombie is thrown back and tumbles; «Джолт Максима» on me: off the feet, a flip, dizzy', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const raw = frame({ arms: 'forward', wristOffset: [0, 0.05] });
    await page.evaluate((raw) => {
        window.__joltPose = setInterval(() => window.__zns.poseService.injectRaw({ ...JSON.parse(JSON.stringify(raw)), ts: performance.now() }), 33);
    }, raw);
    await page.waitForFunction(() => window.__zns.game.character.isArmRaised('right'), null, { timeout: 20000 });
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const ahead = () => {
            const o = g.castOrigin('right', new T.Vector3());
            const d = ch.getPointingDirection('right', new T.Vector3());
            const p = new T.Vector3();
            for (let t = 3; t < 25; t += 0.1) { p.copy(o).addScaledVector(d, t); if (p.y < g.collision.groundY(p.x, p.z) + 1) break; }
            return new T.Vector3(p.x, g.collision.groundY(p.x, p.z), p.z);
        };
        const z = g._createZombie(ahead());
        z.setSleeping(true);
        await frames(30);
        z.group.position.copy(ahead());
        const d0 = z.group.position.distanceTo(ch.group.position);
        g.lastSpellCastTime = 0; g._lastDuelCast = 0;
        const cast = g.castLocalSpell('джолт', true);
        const bolts = [...g.duel.bolts.values()].map((b) => b.spell);
        let spun = 0, t0 = performance.now();
        while (!g.creatureImpact.isDown(z) && performance.now() - t0 < 6000) await frames(1);
        const down = g.creatureImpact.isDown(z);
        // (until the tumble is over — a slow test browser draws few frames)
        t0 = performance.now();
        const tumbling = () => !!g.creatureImpact.active.get('z|' + z.id)?.s.tum;
        while ((tumbling() || performance.now() - t0 < 300) && performance.now() - t0 < 8000) {
            const piv = z.group.userData.impPivot;
            if (piv) spun = Math.max(spun, Math.abs(piv.rotation.x) + Math.abs(piv.rotation.z));
            await frames(1);
        }
        const flew = z.group.position.distanceTo(ch.group.position) - d0;
        // on me
        g.duel.applyToMe('JoltMaxima', 'nobody');
        let flip = 0;
        t0 = performance.now();
        while ((g.knock.tumble || performance.now() - t0 < 300) && performance.now() - t0 < 8000) { flip = Math.max(flip, Math.abs(ch.tumbleAng || 0)); await frames(1); }
        return { cast, bolts, down, spun, flew, alive: !z.isDead, meDown: g.knock.down, flip, dizzy: g.knock.dizzy };
    });
    await page.evaluate(() => clearInterval(window.__joltPose));
    assert.equal(r.cast, 'Jolt');
    assert.deepEqual(r.bolts, ['Jolt'], 'a duel charge flew');
    assert.ok(r.down, 'the zombie is knocked off its feet ' + JSON.stringify(r));
    assert.ok(r.spun > Math.PI, 'it flipped over in the air ' + JSON.stringify(r));
    assert.ok(r.flew > 3, 'thrown back several metres ' + JSON.stringify(r));
    assert.ok(r.alive, '«Джолт» only pushes');
    assert.ok(r.meDown && r.flip > 1 && r.dizzy > 0, 'me: down, a flip, dizzy ' + JSON.stringify(r));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
