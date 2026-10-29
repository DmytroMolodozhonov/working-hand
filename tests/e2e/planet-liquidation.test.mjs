/**
 * «Planet Liquidation» in a real browser (Creative): the gods' golden shield on the Earth; Mars — the beam, the
 * cracks with the red-hot core, the swelling, the blast (flash, fire, rings, rocks), its rocks a new cluster; the
 * planet gone from the registry and the map. Pictures go to docs/space/planets/liquidation/.
 * Run: node --test tests/e2e/planet-liquidation.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8251;
const dir = path.join(ROOT, 'docs/space/planets/liquidation');
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
    fs.mkdirSync(dir, { recursive: true });
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('Planet Liquidation: the shield of the gods, the beam, the cracks, the blast, the rocks', { timeout: 600000 }, async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 720 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(async () => {
        const g = window.__zns.game, orig = g._updateCamera.bind(g);
        g._updateCamera = (dt) => {
            orig(dt);
            const L = window.__look;
            if (!L) return;
            const c = g.camera;
            c.lookAt(c.position.x + L[0], c.position.y + L[1], c.position.z + L[2]);
            c.updateMatrixWorld(true);
        };
        g.character.isArmRaised = () => true;
        g.character.getHandDirection = (s, v) => v.set(...(window.__aim || [0, 0, -1])).normalize();
        window.__P = await import('/src/world/Planets.js');
    });
    const frames = (n) => page.evaluate(async (n) => { const g = window.__zns.game; const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); }, n);
    const shot = (name) => page.screenshot({ path: path.join(dir, name) });
    const say = (t) => page.evaluate((t) => { const g = window.__zns.game; return { name: g.castLocalSpell(t, true), voice: g.hud?._lastVoice }; }, t);

    await page.evaluate(() => { const g = window.__zns.game; g.castDebug('Flight'); g.flight.state = 'cruise'; g.flight.t = 2; });
    await frames(10);
    assert.equal((await say('Flying Maxima')).name, 'FlyingMaxima');
    await page.evaluate(() => window.__zns.game.space._beginAscend(false));
    for (let i = 0; i < 80 && (await page.evaluate(() => window.__zns.game.space.realm)) !== 'space'; i++) await frames(5);
    await page.evaluate(async () => { const S = window.__zns.game.space; for (let i = 0; i < 200 && (S._tex.get('earth') !== 'done' || S._tex.get('mars') !== 'done'); i++) await new Promise((r) => setTimeout(r, 100)); });
    // the clock held where the test says (this browser draws only a few frames a second)
    const clockAt = (t) => page.evaluate((t) => { const S = window.__zns.game.space; S.now = () => t; }, t);
    const near = (id, k, side = 0.6, up = 0.3) => page.evaluate(({ id, k, side, up }) => {
        const g = window.__zns.game, S = g.space, t = S.now(), P = window.__P;
        const b = S.planets.get(id), c = P.planetPosition(b, t, { x: 0, y: 0, z: 0 }, S.planets), R = b.radius;
        const l = Math.hypot(c.x, c.z) || 1, sx = -c.x / l, sz = -c.z / l;
        const d = [sx - sz * side, up, sz + sx * side], dl = Math.hypot(...d);
        S.P.x = c.x + (d[0] / dl) * R * k; S.P.y = c.y + (d[1] / dl) * R * k; S.P.z = c.z + (d[2] / dl) * R * k;
        S.O.x = S.P.x; S.O.y = S.P.y; S.O.z = S.P.z;
        S.vel.x = S.vel.y = S.vel.z = 0; S.speed = 0; S._exitDir = null;
        g.flight.hovering = true;
        g.character.group.visible = false;
        S._place();
        const look = [c.x - S.P.x, c.y - S.P.y, c.z - S.P.z];
        window.__look = look; window.__aim = look;
        return R;
    }, { id, k, side, up });
    const t0 = await page.evaluate(() => window.__zns.game.space.now());
    await clockAt(t0);

    // the Earth: the gods' golden shield, nothing happens
    await near('earth', 3.2);
    await frames(10);
    const e = await say('Planet Liquidation');
    assert.equal(e.name, null);
    await clockAt(t0 + 0.9); // (the shield flares up over a moment)
    await frames(4);
    await shot('01-earth-gods-shield.png');
    assert.ok(await page.evaluate(() => !!window.__zns.game.space.planets.get('earth')));

    // Mars: its price shown, then the spell
    await near('mars', 6, 0.5, 0.25);
    await frames(12);
    const line = await page.evaluate(() => window.__zns.game.planetDestroy.panelLine());
    assert.match(line, /Planet Liquidation/);
    await shot('02-mars-before.png');
    const m = await say('Планет Ликвидейшн');
    assert.equal(m.name, 'PlanetLiquidation', JSON.stringify(m));
    const doomAt = await page.evaluate(() => window.__zns.game.space.planets.get('mars').doomAt);
    assert.ok(doomAt > 0);
    const at = async (s, n = 4, name = null) => { await clockAt(doomAt + s); await near('mars', 6, 0.5, 0.25); await frames(n); if (name) await shot(name); };
    await at(0.4, 3, '03-beam-flying.png');
    await at(1.8, 3, '04-beam-strikes.png');
    await at(5, 3, '05-cracks.png');
    await at(9, 3, '06-core-shining.png');
    await at(11.7, 3, '07-swelling.png');
    // (the camera kept where it was: Mars is gone after the blast)
    const keep = await page.evaluate(() => ({ ...window.__zns.game.space.P }));
    const stay = (s, name) => page.evaluate(({ k, s }) => { const S = window.__zns.game.space; Object.assign(S.P, k); Object.assign(S.O, k); S.vel.x = S.vel.y = S.vel.z = 0; S.speed = 0; S._place(); S.now = () => s; }, { k: keep, s }).then(() => frames(4)).then(() => name && shot(name));
    await stay(doomAt + 12.15, '08-blast-flash.png');
    assert.equal(await page.evaluate(() => window.__zns.game.space.planets.get('mars')), null, 'Mars is gone');
    await stay(doomAt + 13.5, '09-fire-and-rings.png');
    await stay(doomAt + 16, '10-rocks-flying.png');
    await stay(doomAt + 24, '11-debris-cluster.png');
    const c = await page.evaluate(() => { const c = window.__zns.game.space.planets.cluster('dbr_mars'); return c && { used: c.used, from: c.from }; });
    assert.deepEqual(c, { used: false, from: 'Марс' });
    // the space map: no Mars, its rocks there
    await page.evaluate(() => { const g = window.__zns.game; g.space.drawMap(g.hud); });
    await page.locator('#minimap').screenshot({ path: path.join(dir, '12-space-map.png') }).catch(() => {});
    assert.deepEqual(realErrors(errors), []);
});
