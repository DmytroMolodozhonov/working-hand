/**
 * «Айс» is a duel spell: an ice crystal on a frosty beam flies where the raised hand points
 * and locks the creature it hits in ice; ordinary talk never casts it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = 8794;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('«Айс»: a duel charge with an ice crystal flies at the cow / zombie the hand points at and freezes it; talk never casts it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const raw = frame({ arms: 'forward', wristOffset: [0, 0.05] });
    await page.evaluate((raw) => {
        window.__icePose = setInterval(() => window.__zns.poseService.injectRaw({ ...JSON.parse(JSON.stringify(raw)), ts: performance.now() }), 33);
    }, raw);
    await page.waitForFunction(() => window.__zns.game.character.isArmRaised('right'), null, { timeout: 20000 });
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const ahead = (far = 25) => {
            const o = g.castOrigin('right', new T.Vector3());
            const d = ch.getPointingDirection('right', new T.Vector3());
            const p = new T.Vector3();
            for (let t = 3; t < far; t += 0.1) { p.copy(o).addScaledVector(d, t); if (p.y < g.collision.groundY(p.x, p.z) + 1) break; }
            return new T.Vector3(p.x, g.collision.groundY(p.x, p.z), p.z);
        };
        const out = {};
        // ordinary words with «луч», «лед», «аис» inside never cast it
        g.lastSpellCastTime = 0; g._lastDuelCast = 0;
        out.talk = ['мне лучше', 'получилось', 'следующий', 'наиболее', 'найс'].map((t) => g.castLocalSpell(t, true));
        out.talkBolts = g.duel.bolts.size;
        // «Айс»: the charge flies along the line of the hand — a cow stands right on it, 8 m ahead
        await frames(20);
        g.lastSpellCastTime = 0; g._lastDuelCast = 0;
        out.cast = g.castLocalSpell('айс', true);
        out.bolts = [...g.duel.bolts.values()].map((b) => b.spell);
        const bolt = [...g.duel.bolts.values()][0];
        const cow = g.animals._spawn('cow', bolt.o.clone().addScaledVector(bolt.d0, 8));
        cow.group.position.y -= g.duel._animalBody(cow).y;
        // (it hangs there — as if lifted — until the charge reaches it)
        const think = g.animals._think.bind(g.animals);
        g.animals._think = (a, dt) => (a === cow && !(cow.stunT > 0) ? null : think(a, dt));
        // in flight: the crystal at its head
        await frames(1);
        out.crystal = g.duel.ice.heads.some((h) => h.visible);
        const t0 = performance.now();
        while (!(cow.stunT > 0) && performance.now() - t0 < 10000) await frames(1);
        out.cowStun = cow.stunT || 0;
        out.cowIce = g.duel.ice.has(`a:${cow.id}`);
        // a zombie
        g.animals.list.splice(g.animals.list.indexOf(cow), 1); g.animals.byId.delete(cow.id); g.scene.remove(cow.model);
        await frames(10);
        const z = g._createZombie(ahead());
        z.setSleeping(true);
        await frames(30);
        g.lastSpellCastTime = 0; g._lastDuelCast = 0;
        out.cast2 = g.castLocalSpell('Айс!', true);
        const t1 = performance.now();
        while (!z.isFrozen && performance.now() - t1 < 10000) await frames(1);
        out.zombieFrozen = z.isFrozen;
        out.zombieCrystals = z.iceCrystals.children.length;
        return out;
    });
    await page.evaluate(() => clearInterval(window.__icePose));
    assert.deepEqual(r.talk, [null, null, null, null, null], 'talk casts nothing: ' + JSON.stringify(r.talk));
    assert.equal(r.talkBolts, 0);
    assert.equal(r.cast, 'Ice');
    assert.deepEqual(r.bolts, ['IceDuel'], 'a duel charge flew');
    assert.ok(r.crystal, 'an ice crystal at its head');
    assert.ok(r.cowStun > 6, 'the cow stands in the ice: ' + JSON.stringify(r));
    assert.ok(r.cowIce, 'a block of ice round the cow');
    assert.equal(r.cast2, 'Ice');
    assert.ok(r.zombieFrozen, 'the zombie is frozen');
    assert.ok(r.zombieCrystals >= 10, 'ice crystals all over it');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
