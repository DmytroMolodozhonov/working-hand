import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu } from './harness.mjs';

test('place a custom mage, play the fighter, and start with glass only when playing', { timeout: 240000 }, async (t) => {
    const server = await startServer(Number(process.env.ZNS_TEST_PORT) || 8214);
    t.after(() => server.stop());
    const browser = await launch({});
    t.after(() => browser.close());
    const { page, errors } = await openPage(browser, server.url, { noCamera: true });
    await page.evaluate(async () => {
        window.__ZNS_SHOT_FAST__ = true;
        const { ItemIcons } = await import('/src/ui/ItemIcons.js');
        ItemIcons.prototype.warmAsync = async () => {};
    });
    await startFromMenu(page, 'brawl');
    await page.waitForFunction(() => window.__zns.game.brawl._stripBuilt, null, { timeout: 90000 });

    async function clickWorld(x, y, z) {
        const p = await page.evaluate(([x, up, z]) => {
            const { game: g, THREE } = window.__zns;
            g.camera.updateMatrixWorld();
            const v = new THREE.Vector3(x, g.brawl.groundAt(x, z) + up, z).project(g.camera);
            const r = g.renderer.domElement.getBoundingClientRect();
            return [r.left + (1 + v.x) * r.width / 2, r.top + (1 - v.y) * r.height / 2];
        }, [x, y, z]);
        await page.mouse.click(...p);
    }

    await clickWorld(12, 0, 0); // default knight of the blue team
    await page.waitForFunction(() => window.__zns.game.brawl.count('B') === 1);
    await clickWorld(12, 2, 0);
    await page.waitForFunction(() => window.__zns.game.brawl.control.entry?.type === 'knight');
    await page.click('#bp-release');

    await page.click('.bp-custom summary');
    await page.fill('#bp-custom-name', 'Искра');
    await page.selectOption('#bp-custom-kind', 'fire');
    await page.fill('#bp-custom-mana', '137');
    await page.check('#bp-custom-take');
    await page.click('#bp-custom-place');
    await clickWorld(-12, 0, 0);
    await page.waitForFunction(() => window.__zns.game.brawl.control.body?.name === 'Искра');
    assert.match(await page.textContent('#bp-mana'), /137 \/ 137/);
    assert.match(await page.textContent('#bp-abilities'), /Огненный шар/);
    await page.click('#bp-start');
    await page.waitForFunction(() => document.getElementById('brawl-banner').textContent.includes('До боя'));
    const ready = await page.evaluate(() => {
        const { game: g } = window.__zns;
        const b = g.brawl, c = b.control;
        return [b.state, b.glass.visible, c.body.mana, b.countdown > 0 && b.countdown <= 10, c.cast(c.body, 'Fireball')];
    });
    assert.deepEqual(ready, ['countdown', true, 137, true, false]);
    if (process.env.BRAWL_SHOT_DIR) await page.screenshot({ path: path.join(process.env.BRAWL_SHOT_DIR, 'countdown.png'), timeout: 30000 });

    const moved = await page.evaluate(() => {
        const { game: g } = window.__zns;
        const b = g.brawl, c = b.control, body = c.body;
        const before = body.x;
        g.spectator.keys.add('KeyW');
        for (let i = 0; i < 48; i++) c.step('v', body, .06);
        g.spectator.keys.clear();
        return [before, body.x, body.mana];
    });
    assert.ok(moved[1] > moved[0] + 1, JSON.stringify(moved));
    assert.ok(moved[1] <= -1.35, 'glass prevents crossing');
    assert.equal(moved[2], 137);
    await page.evaluate(() => {
        const b = window.__zns.game.brawl;
        b.update(b.countdown + .01);
    });
    await page.waitForFunction(() => window.__zns.game.brawl.state === 'fight' && !window.__zns.game.brawl.glass.visible);

    const shot = await page.evaluate(() => {
        const { game: g } = window.__zns;
        const c = g.brawl.control;
        g.spectator.pitch = 0;
        c.pressAttack();
        c.attackHeld = false;
        c.step('v', c.body, .03);
        return c.body.mana;
    });
    assert.ok(shot < 137, 'fighter casts with his own mana');
    if (process.env.BRAWL_SHOT_DIR) await page.screenshot({ path: path.join(process.env.BRAWL_SHOT_DIR, 'playing.png'), timeout: 30000 });

    const spectator = await page.evaluate(() => {
        const b = window.__zns.game.brawl;
        b.control.release();
        b.clear();
        b.spawn('zombie', 'A', -12, 0);
        b.spawn('knight', 'B', 12, 0);
        return [b.start(), b.state, b.glass.visible];
    });
    assert.deepEqual(spectator, [true, 'fight', false]);
    assert.deepEqual(errors.filter((e) => e.startsWith('pageerror:')), []);
});
