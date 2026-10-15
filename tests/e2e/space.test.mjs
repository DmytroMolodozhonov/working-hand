/**
 * «Космос» in a real browser (Creative): «Flying Maxima» in flight — the sky darkens, space; the round
 * Earth from orbit, the Solar System, Saturn's rings, Jupiter; landing on Venus, Mars and the Moon (the
 * Earth in its sky); the space map. Pictures of each go to docs/space/.
 * Run: node --test tests/e2e/space.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8243;
const dir = path.join(ROOT, 'docs/space');
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

test('space: Flying Maxima, the round Earth, the planets, landing on Venus, Mars and the Moon, the map', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 1280, height: 720 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // (the pictures: the camera turned to look at a point — after the game placed it at the hero's head)
    await page.evaluate(() => {
        const g = window.__zns.game, orig = g._updateCamera.bind(g);
        g._updateCamera = (dt) => {
            orig(dt);
            const L = window.__look;
            if (!L) return;
            const c = g.camera;
            c.lookAt(c.position.x + L[0], c.position.y + L[1], c.position.z + L[2]);
            c.updateMatrixWorld(true);
        };
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.25;
    });
    const frames = (n) => page.evaluate(async (n) => { const g = window.__zns.game; const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); }, n);
    const look = (v) => page.evaluate((v) => { window.__look = v; }, v);
    const shot = (name) => page.screenshot({ path: path.join(dir, name) });
    const state = () => page.evaluate(() => window.__zns.game.debugState().space);

    // 1. in flight: «Flying Maxima» — up, the sky darkening, the stars coming out
    await page.evaluate(() => { const g = window.__zns.game; g.castDebug('Flight'); g.flight.state = 'cruise'; g.flight.t = 2; });
    await frames(10);
    const said = await page.evaluate(() => { const g = window.__zns.game; return { name: g.castLocalSpell('Flying Maxima', true), voice: g.hud?._lastVoice }; });
    assert.equal(said.name, 'FlyingMaxima', JSON.stringify(said));
    await page.evaluate(() => { const g = window.__zns.game, S = g.space; S.testHold = true; g.character.group.position.y = S._y0 + (S._top - S._y0) * 0.72; });
    await look([0.6, 0.35, -0.7]);
    await frames(30);
    await shot('01-climb-sky-darkens.png');
    await page.evaluate(() => { window.__zns.game.space.testHold = false; });
    for (let i = 0; i < 60 && (await state()).realm !== 'space'; i++) await frames(5);
    let s = await state();
    assert.equal(s.realm, 'space', 'out in space');

    // 2. the round Earth, from a little way out (its map made in the worker from the world round the start)
    await page.evaluate(async () => {
        const g = window.__zns.game, S = g.space;
        for (let i = 0; i < 200 && S._tex.get('earth') !== 'done'; i++) await new Promise((r) => setTimeout(r, 100));
    });
    const put = (spec) => page.evaluate((spec) => {
        const g = window.__zns.game, S = g.space, t = S.now();
        const p = S.planets.get(spec.id), c = { x: 0, y: 0, z: 0 };
        const P = window.__planetPos(p, t, c, S.planets);
        const d = spec.dir, l = Math.hypot(...d);
        S.P.x = P.x + (d[0] / l) * p.radius * spec.k; S.P.y = P.y + (d[1] / l) * p.radius * spec.k; S.P.z = P.z + (d[2] / l) * p.radius * spec.k;
        S.O.x = S.P.x; S.O.y = S.P.y; S.O.z = S.P.z;
        S.vel.x = S.vel.y = S.vel.z = 0; S.speed = 0; S._exitDir = null;
        g.flight.hovering = true;
        g.character.group.visible = false; // (the scenery alone in these pictures)
        S._place();
        window.__look = [P.x - S.P.x + (spec.off?.[0] || 0) * p.radius, P.y - S.P.y + (spec.off?.[1] || 0) * p.radius, P.z - S.P.z + (spec.off?.[2] || 0) * p.radius];
        return { P: { ...S.P } };
    }, spec);
    await page.evaluate(async () => { const m = await import('/src/world/Planets.js'); window.__planetPos = m.planetPosition; });
    // (each picture with its body lit: the camera between it and the Sun, a little to the side)
    const sunSide = (id, side = 0.6, up = 0.3) => page.evaluate(({ id, side, up }) => {
        const S = window.__zns.game.space, p = S.planets.get(id), P = window.__planetPos(p, S.now(), { x: 0, y: 0, z: 0 }, S.planets);
        const l = Math.hypot(P.x, P.z) || 1, sx = -P.x / l, sz = -P.z / l;
        return [sx + -sz * side, up, sz + sx * side];
    }, { id, side, up });
    await put({ id: 'earth', dir: await sunSide('earth', 0.9, 0.5), k: 3.4, off: [0.35, 0, 0] });
    await frames(40);
    await shot('02-earth-from-orbit.png');

    // 3. the Solar System from above: the Sun, the orbits, the planets with their names
    await page.evaluate(() => {
        const g = window.__zns.game, S = g.space;
        g.character.group.visible = false;
        S.P.x = 30000; S.P.y = 150000; S.P.z = 150000; S.O.x = S.P.x; S.O.y = S.P.y; S.O.z = S.P.z; S._place();
        window.__look = [-S.P.x, -S.P.y, -S.P.z + 30000];
    });
    await frames(30);
    await shot('03-solar-system.png');
    // the space map (where the minimap is): its own picture
    const mm = await page.$('#minimap');
    if (mm) await mm.screenshot({ path: path.join(dir, '08-space-map.png') });

    // 4. Saturn and its rings; Jupiter
    await page.evaluate(async () => { const S = window.__zns.game.space; for (let i = 0; i < 300 && (S._tex.get('saturn') !== 'done' || S._tex.get('jupiter') !== 'done'); i++) await new Promise((r) => setTimeout(r, 100)); });
    await put({ id: 'saturn', dir: await sunSide('saturn', 0.7, 0.32), k: 4.2 });
    await frames(30);
    await shot('04-saturn.png');
    await put({ id: 'jupiter', dir: await sunSide('jupiter', 0.5, 0.15), k: 3.0 });
    await frames(30);
    await shot('05-jupiter.png');

    // 5. on the planets: where the Sun is high over their ground
    const land = (id) => page.evaluate(async (id) => {
        const g = window.__zns.game, S = g.space, def = S.planets.get(id);
        const m = await import('/src/world/Planets.js');
        const r = m.slotRect(def);
        let best = null;
        for (let i = 0; i < 64; i++) {
            const x = r.cx + (i / 64 - 0.5) * r.w, z = r.cz + 1200;
            const e = S.localSun(def, x, z).y;
            if (!best || e > best.e) best = { x: Math.round(x), z, e };
        }
        // (the Sun a bit off the top: long shadows look better)
        const x = best.x + Math.round(r.w * 0.06), z = best.z;
        S.state = 'off';
        g.character.group.visible = true;
        g.flight.land('debug');
        g.flight.state = 'idle';
        g.character.flying = false;
        const h = g.world.terrain.data.heightAt(x, z);
        g.character.group.position.set(x + 0.5, h + 2.2, z + 0.5);
        g.world.terrain.flushAround?.(x, z);
        const sun = S.localSun(def, x, z);
        window.__look = [-sun.x * 0.4 + 0.6, -0.08, -sun.z * 0.4 - 0.8];
        return { x, z, h, e: best.e, realm: m.realmAt(x, h + 2, z, S.planets) };
    }, id);
    let at = await land('venus');
    assert.equal(at.realm, 'venus', JSON.stringify(at));
    await frames(90);
    s = await state();
    assert.equal(s.realm, 'venus');
    await shot('06-venus-surface.png');
    at = await land('mars');
    await frames(90);
    assert.equal((await state()).realm, 'mars');
    await shot('07-mars-surface.png');
    // the Moon: the Earth in its black sky
    at = await land('moon');
    await frames(60);
    assert.equal((await state()).realm, 'moon');
    await page.evaluate(() => {
        const g = window.__zns.game, S = g.space, def = S.planets.get('moon'), t = S.now();
        const p = g.character.group.position;
        S.localSun(def, p.x, p.z, t);
        const e = window.__planetPos(S.planets.get('earth'), t, { x: 0, y: 0, z: 0 }, S.planets), c = window.__planetPos(def, t, { x: 0, y: 0, z: 0 }, S.planets);
        const F = S._localFrame;
        const v = { x: e.x - c.x, y: e.y - c.y, z: e.z - c.z };
        const loc = [v.x * F.east.x + v.y * F.east.y + v.z * F.east.z, v.x * F.n.x + v.y * F.n.y + v.z * F.n.z, -(v.x * F.north.x + v.y * F.north.y + v.z * F.north.z)];
        const l = Math.hypot(...loc);
        window.__look = loc[1] / l > 0.05 ? [loc[0] / l, loc[1] / l * 0.8, loc[2] / l] : [0.7, 0.15, -0.7];
    });
    await frames(40);
    await shot('09-moon-earth-in-sky.png');
    assert.deepEqual(realErrors(errors), []);
});
