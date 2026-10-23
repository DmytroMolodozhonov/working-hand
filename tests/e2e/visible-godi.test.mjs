/**
 * «Visible Godi» in a real browser (the real game, the real shader): without the scroll it is not known; with it the words open a cloud
 * (20 mana, then 1 a second); inside a box of planks the look goes through the wall (the second picture is drawn, the small
 * picture is made once); another spell is refused while it is open (concentration); «стоп» closes it and frees the picture.
 * Run: node --test tests/e2e/visible-godi.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8197;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('Visible Godi: a scroll, 20 mana + 1 a second, the steam painted on a wall of planks, the look through it, «стоп»', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        await frames(20);
        g.character.isArmRaised = () => true; // (the wand is up)
        g.combat.fatigue = 100;
        const unknown = g.castLocalSpell('Visible Godi', true);
        const knowsBefore = g.knowsSpell('VisibleGodi');
        g.bonus = { ...(g.bonus || {}), spells: { ...(g.bonus?.spells || {}), VisibleGodi: true } }; // (the scroll was burnt)
        // a box of planks round the hero (the camera looks somewhere level: a wall is always within 3 m)
        const d = g.terrain.data, p = g.character.group.position;
        const px = Math.round(p.x), pz = Math.round(p.z), top = d.topLayer(px, pz);
        for (let L = top + 1; L <= top + 8; L++) for (let k = -3; k <= 3; k++) {
            d.set(px + 3, L, pz + k, 27); d.set(px - 3, L, pz + k, 27); d.set(px + k, L, pz + 3, 27); d.set(px + k, L, pz - 3, 27);
        }
        const before = g.combat.fatigue;
        const said = g.castLocalSpell('визибл годи', true);
        const paid = before - g.combat.fatigue;
        const held = g.focus.held();
        const again = g.castLocalSpell('Bombardo', true); // (concentration)
        // (the wand's jet paints: a few puffs on the wall ahead, as a sweeping wand would leave them)
        const cam = g.camera, dir = new g.camera.position.constructor(); cam.getWorldDirection(dir);
        for (const [dx, dy] of [[0, 0], [0.8, 0.3], [-0.8, 0.2], [0.3, -0.6], [-0.4, 0.7]]) g.visibleGodi._addPuff({ x: cam.position.x + dir.x * 2.4 + dx, y: cam.position.y + dir.y * 2.4 + dy, z: cam.position.z + dir.z * 2.4 }, performance.now() / 1000);
        const t0 = performance.now(), m0 = g.combat.fatigue;
        await frames(30);
        const secs = (performance.now() - t0) / 1000;
        const info = g.visibleGodi.info;
        const fx = g.seeFx;
        const mid = { state: info.state, clear: info.clear, thick: info.thick, passes: fx.stats.passes, rtMade: fx.stats.rtMade, hasRT: !!fx.rt, overlays: fx.stats.overlays };
        const drained = m0 - g.combat.fatigue + secs * 0; // (regeneration is held while it drains)
        const stopped = g.castLocalSpell('стоп', true);
        await frames(40);
        const after = { on: g.visibleGodi.on, hasRT: !!fx.rt, rtFreed: fx.stats.rtFreed, held: g.focus.held() };
        return { unknown, knowsBefore, said, paid, held, again, mid, secs, drained, stopped, after };
    });
    assert.equal(r.knowsBefore, false, 'not known without the scroll');
    assert.equal(r.unknown, null);
    assert.equal(r.said, 'VisibleGodi');
    assert.ok(Math.abs(r.paid - 20) < 0.6, 'paid ' + r.paid);
    assert.equal(r.held, 'VisibleGodi', 'a held spell');
    assert.equal(r.again, null, 'another spell: first «стоп»');
    assert.equal(r.mid.state, 'see', 'the wall of planks is seen through: ' + JSON.stringify(r.mid));
    assert.ok(r.mid.clear > 0.8 && r.mid.clear < 0.95, 'clear ' + r.mid.clear);
    assert.ok(r.mid.passes > 2 && r.mid.rtMade === 1, JSON.stringify(r.mid));
    assert.ok(r.drained > 0.5 && r.drained < 2.2 * r.secs, `1 a second of game time (slow frames here count less than the clock): ${r.drained} in ${r.secs} s`);
    assert.equal(r.after.on, false);
    assert.equal(r.after.hasRT, false, 'the small picture is freed');
    assert.equal(r.after.held, null);
    assert.deepEqual(realErrors(errors), []);
});
