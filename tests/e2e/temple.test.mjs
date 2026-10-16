/**
 * The Temple of the Gods — in a real browser, on Venus (it stands by itself when a hero comes near its place;
 * on Earth temple.placeTest() can put it by the start in Creative). Its floor holds the hero, its walls stop him, the four
 * pedestals of the library carry the six scrolls (a taken one comes back); and its pictures, saved in
 * docs/space/temple/ (the entrance, the golden god, the gallery of the gods, the library).
 * Run: node --test tests/e2e/temple.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8187;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the Temple of the Gods: solid stone, six scrolls on the pedestals — and its pictures', { timeout: 600000 }, async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 720 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, tm = g.temple, ch = g.character;
        const out0 = {};
        const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
        // to Venus: the hero right over the temple's place (on Venus it stands by itself — Temple._venus)
        const { templeSiteOf } = await import('/src/world/PlanetSurface.js');
        const site = templeSiteOf(g.space.planets.get('venus'));
        ch.group.position.set(site.x, site.y + 60, site.z + 120);
        ch.verticalVelocity = 0;
        const t0 = performance.now();
        while (!(tm.group && !tm._pending.length) && performance.now() - t0 < 60000) { g.world.terrain.flushAround?.(site.x, site.z); await frame(); }
        const spot = tm.spot;
        out0.realm = g.space.realm;
        const out = { ...out0, spot, venus: !!spot?.venus, built: !!tm.group, pedestals: tm.pedestals.length };
        // the hero in the library, by the god of Wisdom: he stands on the temple's floor
        const lib = tm.viewOf('library');
        ch.group.position.set(lib.from.x, lib.from.y + 2, lib.from.z);
        ch.verticalVelocity = 0;
        for (let i = 0; i < 40; i++) await frame();
        const floor = tm.collider.floorAt(lib.from.x, lib.from.z, lib.from.y + 10);
        out.floor = floor;
        out.feet = ch.groundY;
        // a wall: the point inside the library's back wall is solid, the air of the hall is not
        const { templeToWorld } = await import('/src/world/GodsTemple.js');
        const w = templeToWorld(tm.spot, 0, 5, -70.8), air = templeToWorld(tm.spot, 0, 5, -45);
        out.wall = g.collision.pointBlocked(w.x, w.y, w.z);
        out.air = g.collision.pointBlocked(air.x, air.y, air.z);
        // the roof is a ceiling over the hall
        out.ceiling = g.collision.ceilingAt(air.x, air.z, air.y);
        // the scrolls
        out.scrolls = tm.pedestals.map((p) => g.items.loose.get(p.uid)?.item?.spell);
        // one taken: it comes back after a while
        const p0 = tm.pedestals[0], uid0 = p0.uid;
        g.items.pickUp(uid0, g.localId, 'right');
        out.taken = !g.items.loose.has(uid0);
        p0.goneT = 1e4; tm._tick = 0; tm.update(0.016);
        out.back = g.items.loose.get(p0.uid)?.hover ? p0.uid : null;
        out.held = g.items.held.right?.spell || g.items.held.left?.spell || null;
        return out;
    });
    console.log(JSON.stringify(r));
    assert.ok(r.built && r.venus, 'the temple stands on Venus');
    assert.equal(r.realm, 'venus');
    assert.equal(r.pedestals, 6, 'six pedestals in the library (the planets\' four, «Бум», «Planet Liquidation»)');
    assert.deepEqual(r.scrolls, ['CreatePlanet', 'EnlargePlanet', 'TerraformPlanet', 'LevitationSuperMaxima', 'Boom', 'PlanetLiquidation']);
    assert.ok(Math.abs(r.feet - r.floor) < 0.6, `the hero stands on the floor (${r.feet} vs ${r.floor})`);
    assert.ok(r.wall && !r.air, 'the walls are solid, the hall is air');
    assert.ok(r.ceiling < Infinity, 'the roof is a ceiling');
    assert.ok(r.taken, 'a scroll can be taken');
    assert.ok(r.back && r.back.endsWith('-1'), 'a new one comes back on its pedestal');

    // the pictures: rendered from a camera of their own
    const dir = path.join(ROOT, 'docs', 'space', 'temple');
    fs.mkdirSync(dir, { recursive: true });
    const shot = async (name, where) => {
        const url = await page.evaluate(async (where) => {
            const g = window.__zns.game, T = window.__zns.THREE, tm = g.temple;
            const frame = () => new Promise((res) => { const f = g.frameCount; const k = () => (g.frameCount > f ? res() : setTimeout(k, 10)); k(); });
            const v = tm.viewOf(where);
            const cam = new T.PerspectiveCamera(where === 'entrance' ? 60 : 72, 1280 / 720, 0.1, 3000);
            g.character.group.position.set(v.from.x, v.from.y, v.from.z);
            g.world.terrain.flushAround?.(v.from.x, v.from.z);
            const t0 = performance.now(); for (let i = 0; i < 50 && performance.now() - t0 < 25000; i++) await frame();
            cam.position.set(v.from.x, v.from.y, v.from.z); cam.lookAt(v.to.x, v.to.y, v.to.z);
            g.character.group.visible = false;
            g.scene.updateMatrixWorld(true);
            g.renderer.render(g.scene, cam);
            g.character.group.visible = true;
            return g.renderer.domElement.toDataURL('image/png');
        }, where);
        fs.writeFileSync(path.join(dir, name), Buffer.from(url.split(',')[1], 'base64'));
    };
    await shot('temple-entrance.png', 'entrance');
    await shot('temple-golden-creator.png', 'creator');
    await shot('temple-gallery-of-gods.png', 'gallery');
    await shot('temple-library.png', 'library');
    await shot('temple-scrolls.png', 'scrolls');
    assert.deepEqual(realErrors(errors), []);
});
