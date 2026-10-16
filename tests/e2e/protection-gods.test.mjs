/**
 * «Protection Gods» / «… Maxima» in a real browser (free world): said by voice, the golden shield at the hand and the
 * golden dome round the body; a Sapira and a Bombardo next to it — nothing gets through, no mana taken.
 * Pictures go to docs/spells/protection-gods/. Run: node --test tests/e2e/protection-gods.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8257;
const dir = path.join(ROOT, 'docs/spells/protection-gods');
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); fs.mkdirSync(dir, { recursive: true }); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('Protection Gods: the golden shield and dome; spells held for nothing', { timeout: 600000 }, async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 720 } });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const frames = (n) => page.evaluate(async (n) => { const g = window.__zns.game; const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); }, n);
    await page.evaluate(() => {
        const g = window.__zns.game;
        g.bonus = g.bonus || {}; g.bonus.spells = { ...(g.bonus.spells || {}), ProtectionGods: true, ProtectionGodsMaxima: true };
        g.combat.maxFatigue = 2000; g.combat.fatigue = 2000;
        g.character.isArmRaised = () => false;
        g.character.isArmExtended = (s) => s === 'right';
        window.__T = false;
        g.character.isTPose = () => window.__T;
        // (an open place on the ground; the camera off to the side, looking at the hero — to see the shield)
        const ch = g.character, p = ch.group.position, data = g.world.terrain.data;
        for (let i = 0; i < 60; i++) {
            const x = p.x + 40 + i * 7, z = p.z + 30;
            const h = data.heightAt ? data.heightAt(x, z) : null;
            if (h != null && Number.isFinite(h)) { p.set(x, h + 2.2, z); break; }
        }
        const orig = g._updateCamera.bind(g);
        g._updateCamera = (dt) => {
            orig(dt);
            const c = g.camera, q = ch.group.position;
            c.position.set(q.x + 4.5, q.y + 1.6, q.z - 5.5);
            c.lookAt(q.x, q.y + 0.4, q.z - 0.8);
            c.updateMatrixWorld(true);
        };
        ch.setBodyHidden?.(false);
    });
    const say = (t) => page.evaluate((t) => window.__zns.game.castLocalSpell(t, true), t);
    assert.equal(await say('Protection Gods'), 'ProtectionGods');
    await frames(20);
    const s1 = await page.evaluate(() => { const c = window.__zns.game.combat; return { gods: !!c.shield?.gods, type: c.shield?.type, mana: c.fatigue, net: c.serialize() }; });
    assert.ok(s1.gods && s1.type === 1, JSON.stringify(s1));
    assert.equal(s1.net[5], 1, 'the others see it gold');
    await page.screenshot({ path: path.join(dir, '01-shield.png') });
    assert.equal(await say('стоп'), 'Stop');
    await page.evaluate(() => { window.__T = true; });
    assert.equal(await say('Божественная защита Максима'), 'ProtectionGodsMaxima');
    await frames(20);
    const r = await page.evaluate(() => {
        const g = window.__zns.game, c = g.combat, T = window.__zns.THREE || null;
        const hp = c.hp, m = c.fatigue, p = c.center().clone();
        const front = p.clone(); front.z -= 10;
        c.hitBySpell('Sapira', front, 'enemy');
        c.explosion(p.clone().setX(p.x + 2), 6, 3, 'enemy');
        c.damage(25, 'enemy', 'AvadaKedavra');
        return { hp0: hp, hp: c.hp, m0: m, m: c.fatigue, type: c.shield?.type, gods: !!c.shield?.gods };
    });
    assert.ok(r.gods && r.type === 2);
    assert.equal(r.hp, r.hp0, 'nothing got through');
    assert.ok(r.m0 - r.m < 1, 'no mana for what it held (only the second\'s drain)');
    await page.screenshot({ path: path.join(dir, '02-dome.png') });
    assert.deepEqual(realErrors(errors), []);
});
