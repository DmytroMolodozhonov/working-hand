/**
 * The gods' planet spells in a real browser (Creative): «Create a Planet» at a meteor cluster (the rocks drawn
 * in, red-hot, a ball cooling), «Enlarge Planet», «Terraform Planet» (Mars before / after, its new air from
 * space; the made planet an ice world), «Wingardium Leviosa Super Maxima» (a planet dragged to a new orbit).
 * Pictures go to docs/space/planets/.
 * Run: node --test tests/e2e/planet-magic.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors, ROOT } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8247;
const dir = path.join(ROOT, 'docs/space/planets');
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

test('planet spells: create, enlarge, terraform, move', async () => {
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
        g.dayStart = Date.now() - 24 * 60 * 1000 * 0.25;
        // (the hand: raised, pointing where the test says — no camera here)
        g.character.isArmRaised = () => true;
        g.character.getHandDirection = (s, v) => v.set(...(window.__aim || [0, 0, -1])).normalize();
        const m = await import('/src/world/Planets.js');
        window.__P = m;
    });
    const frames = (n) => page.evaluate(async (n) => { const g = window.__zns.game; const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 20)); }, n);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const shot = (name) => page.screenshot({ path: path.join(dir, name) });
    const say = (t) => page.evaluate((t) => { const g = window.__zns.game; return { name: g.castLocalSpell(t, true), voice: g.hud?._lastVoice }; }, t);

    // into space
    await page.evaluate(() => { const g = window.__zns.game; g.castDebug('Flight'); g.flight.state = 'cruise'; g.flight.t = 2; });
    await frames(10);
    assert.equal((await say('Flying Maxima')).name, 'FlyingMaxima');
    await page.evaluate(() => window.__zns.game.space._beginAscend(false));
    for (let i = 0; i < 80 && (await page.evaluate(() => window.__zns.game.space.realm)) !== 'space'; i++) await frames(5);
    // a place near a body (k radii from its centre, toward the Sun a little), looking (and pointing) at it
    const near = (spec) => page.evaluate((spec) => {
        const g = window.__zns.game, S = g.space, t = S.now(), P = window.__P;
        const b = spec.cluster ? S.planets.cluster(spec.cluster) : S.planets.get(spec.id);
        const c = P.planetPosition(b, t, { x: 0, y: 0, z: 0 }, S.planets);
        const R = spec.cluster ? b.r : b.radius;
        const l = Math.hypot(c.x, c.z) || 1, sx = -c.x / l, sz = -c.z / l;
        const d = [sx + -sz * (spec.side ?? 0.6), spec.up ?? 0.3, sz + sx * (spec.side ?? 0.6)], dl = Math.hypot(...d);
        S.P.x = c.x + (d[0] / dl) * R * spec.k; S.P.y = c.y + (d[1] / dl) * R * spec.k; S.P.z = c.z + (d[2] / dl) * R * spec.k;
        S.O.x = S.P.x; S.O.y = S.P.y; S.O.z = S.P.z;
        S.vel.x = S.vel.y = S.vel.z = 0; S.speed = 0; S._exitDir = null;
        g.flight.hovering = true;
        g.character.group.visible = false;
        S._place();
        const look = [c.x - S.P.x, c.y - S.P.y, c.z - S.P.z];
        window.__look = [look[0] + (spec.off?.[0] || 0) * R, look[1] + (spec.off?.[1] || 0) * R, look[2] + (spec.off?.[2] || 0) * R];
        window.__aim = look;
        return { R };
    }, spec);
    // (the pictures of the long animations: the shared clock held at each moment — this browser draws only a few
    //  frames a second, a picture taken «at 5 s» came seconds late)
    const clockAt = (s) => page.evaluate((s) => { const S = window.__zns.game.space; if (S.__t0 == null) { S.__t0 = S.now(); } S.now = () => S.__t0 + s; }, s);
    const clockGo = () => page.evaluate(() => { const S = window.__zns.game.space; delete S.now; S.__t0 = null; });
    const hold = () => page.evaluate(() => { const S = window.__zns.game.space; S.vel.x = S.vel.y = S.vel.z = 0; S.speed = 0; });

    // 1. «Create a Planet» at the first meteor cluster of the asteroid belt
    await page.evaluate(async () => { const S = window.__zns.game.space; for (let i = 0; i < 200 && S._tex.get('earth') !== 'done'; i++) await new Promise((r) => setTimeout(r, 100)); });
    const cid = await page.evaluate(() => window.__zns.game.space.planets.clusters.find((c) => c.belt === 'asteroids').id);
    await near({ cluster: cid, k: 3.2, side: 0.5, up: 0.25 });
    await frames(20);
    await shot('01-meteor-cluster.png');
    const made = await say('Create a Planet');
    assert.equal(made.name, 'CreatePlanet', JSON.stringify(made));
    // (the making: ~30 s — the rocks falling in one by one, crashing with flashes and sparks, a red-hot ball cooling)
    const until = async (s) => { await clockAt(s); await hold(); await frames(4); };
    await until(4); await shot('02-meteors-drawn-in.png');
    await until(8); await shot('02b-meteors-crashing.png');
    await until(12); await shot('02c-ball-growing.png');
    await until(16); await shot('03-red-hot-ball.png');
    await until(23); await shot('03b-ball-cooling.png');
    await clockGo();
    const pid = await page.evaluate(() => window.__zns.game.space.planets.list.find((p) => !p.base)?.id);
    assert.ok(pid, 'a new planet');
    // its name by voice
    await say('Назови Аврора');
    assert.equal(await page.evaluate((pid) => window.__zns.game.space.planets.get(pid).name, pid), 'Аврора');
    await page.evaluate(async (pid) => { const S = window.__zns.game.space; for (let i = 0; i < 150 && S._tex.get(pid) !== 'done'; i++) await new Promise((r) => setTimeout(r, 100)); }, pid);
    await near({ id: pid, k: 3.0, side: 0.6, up: 0.3 });
    await frames(20);
    await shot('04-new-planet.png');

    // 2. «Enlarge Planet»: the same planet grows
    const r0 = await page.evaluate((pid) => window.__zns.game.space.planets.get(pid).radius, pid);
    await near({ id: pid, k: 3.6, side: 0.6, up: 0.3 });
    assert.equal((await say('Enlarge Planet')).name, 'EnlargePlanet');
    await wait(1400); await hold();
    await shot('05-enlarge-growing.png');
    await wait(2200);
    await frames(10);
    await shot('06-enlarged.png');
    assert.equal(await page.evaluate((pid) => window.__zns.game.space.planets.get(pid).radius, pid), Math.round(r0 * 1.3));

    // 3. «Wingardium Leviosa Super Maxima»: the planet taken, the hand swings — it follows; let go: a new orbit
    const a0 = await page.evaluate((pid) => window.__zns.game.space.planets.get(pid).a, pid);
    // (its orbit from high above: the line of the orbit round the Sun before and after)
    const above = () => page.evaluate((pid) => {
        const g = window.__zns.game, S = g.space, c = window.__P.planetPosition(S.planets.get(pid), S.now(), { x: 0, y: 0, z: 0 }, S.planets);
        const keep = { P: { ...S.P }, O: { ...S.O } };
        S.P.x = c.x * 0.9; S.P.y = c.y + 26000; S.P.z = c.z * 0.9; S.O.x = S.P.x; S.O.y = S.P.y; S.O.z = S.P.z; S._place();
        window.__look = [c.x - S.P.x, c.y - S.P.y, c.z - S.P.z];
        return keep;
    }, pid);
    const back = (keep) => page.evaluate((k) => { const S = window.__zns.game.space; Object.assign(S.P, k.P); Object.assign(S.O, k.O); S._place(); }, keep);
    let keep = await above();
    await frames(20);
    await shot('07-orbit-before.png');
    await back(keep);
    await near({ id: pid, k: 4, side: 0.9, up: 0.35 });
    assert.equal((await say('Wingardium Leviosa Super Maxima')).name, 'LevitationSuperMaxima');
    // (the hand turns sideways a little at a time: the planet goes after it, out of its old orbit)
    const aim0 = await page.evaluate(() => window.__aim.slice());
    for (let i = 0; i < 40; i++) {
        await page.evaluate(({ i, a }) => {
            const S = window.__zns.game.space, l = Math.hypot(...a);
            const k = Math.min(1, (i + 1) / 40) * 0.5, sx = -a[2] / l, sz = a[0] / l;
            window.__aim = [a[0] * (1 - k) + sx * k * l, a[1] * (1 - k), a[2] * (1 - k) + sz * k * l];
            S.vel.x = S.vel.y = S.vel.z = 0; S.speed = 0;
        }, { i, a: aim0 });
        await frames(3);
        if (i === 30) {
            await page.evaluate((pid) => { const S = window.__zns.game.space, t = S.now(); const c = window.__P.planetPosition(S.planets.get(pid), t, { x: 0, y: 0, z: 0 }, S.planets); window.__look = [c.x - S.P.x, c.y - S.P.y, c.z - S.P.z]; }, pid);
            await frames(4);
            await shot('08-planet-dragged.png');
        }
    }
    await say('стоп');
    const a1 = await page.evaluate((pid) => window.__zns.game.space.planets.get(pid).a, pid);
    assert.ok(Math.abs(a1 - a0) > 200, `a new orbit: ${a0} → ${a1}`);
    keep = await above();
    await frames(20);
    await shot('09-orbit-after.png');
    await back(keep);

    // 4. «Terraform Planet» on Mars: its ground before, the spell said standing on it, its ground after
    const land = (id) => page.evaluate(async (id) => {
        const g = window.__zns.game, S = g.space, def = S.planets.get(id), P = window.__P;
        const r = P.slotRect(def);
        let best = null;
        for (let i = 0; i < 64; i++) {
            const x = r.cx + (i / 64 - 0.5) * r.w, z = r.cz + 1200;
            const e = S.localSun(def, x, z).y;
            if (!best || e > best.e) best = { x: Math.round(x), z, e };
        }
        let x = best.x + Math.round(r.w * 0.06), z = best.z;
        if (x > r.cx + r.w / 2 - 600) x -= Math.round(r.w * 0.12); // (never past the edge of its surface)
        S.state = 'off';
        g.character.group.visible = true;
        g.flight.land('debug');
        g.flight.state = 'idle';
        g.character.flying = false;
        g.world.terrain.flushAround?.(x, z);
        const h = g.world.terrain.data.heightAt(x, z);
        g.character.group.position.set(x + 0.5, h + 2.2, z + 0.5);
        const sun = S.localSun(def, x, z);
        window.__look = [-sun.x * 0.4 + 0.6, -0.1, -sun.z * 0.4 - 0.8];
        return { x, z, realm: P.realmAt(x, h + 2, z, S.planets) };
    }, id);
    let at = await land('mars');
    await frames(90);
    assert.equal(at.realm, 'mars');
    await shot('10-mars-before.png');
    const tf = await say('Terraform Planet');
    assert.equal(tf.name, 'TerraformPlanet', JSON.stringify(tf));
    // (its 20 s on the planet: the ground's own light, waves of light, the air flaring up, the land changing)
    const at1 = async (s, n = 6) => { await clockAt(s); await frames(n); };
    await page.evaluate(() => { window.__look = [0.7, -0.15, -0.7]; });
    await at1(1.5); await shot('10b-terraform-glow.png');
    await at1(5); await shot('10c-waves-of-light.png');
    await page.evaluate(() => { window.__look = [0.6, 0.25, -0.75]; });
    await at1(9.2, 3); await shot('10d-air-flares-up.png');
    await at1(11.5); await shot('10d2-new-sky.png');
    await page.evaluate(() => { window.__look = [0.7, -0.05, -0.7]; });
    await at1(14, 14); await shot('10e-land-changing.png');
    await clockGo();
    // (its land made again a few chunks a frame: wait for it)
    for (let i = 0; i < 60; i++) {
        const busy = await page.evaluate(() => { const T = window.__zns.game.world.terrain; return (T._remake?.length || 0) + (T._remade?.length || 0) + (T._remakeFlight?.size || 0); });
        if (!busy) break;
        await wait(250);
    }
    await wait(2500);
    await page.evaluate(() => { const p = window.__zns.game.character.group.position; const h = window.__zns.game.world.terrain.data.heightAt(Math.floor(p.x), Math.floor(p.z)); p.y = h + 2.2; });
    await frames(60);
    await shot('11-mars-after-terraform.png');
    const mars = await page.evaluate(() => { const d = window.__zns.game.space.planets.get('mars'); return { air: d.air, climate: d.climate, breathing: window.__zns.game.space.breathing }; });
    assert.equal(mars.air, 'air');
    assert.equal(mars.climate, 'green');
    assert.equal(mars.breathing, false, 'breathing without mana now');
    // a look round its trees
    await page.evaluate(() => { window.__look = [0.9, 0.05, 0.4]; });
    await frames(30);
    await shot('12-mars-alien-trees.png');

    // 5. the made planet (in the asteroid belt: the ice zone) terraformed from space; Mars seen from space with its air
    await page.evaluate(() => { const g = window.__zns.game, S = g.space; S.state = 'space'; S.realm = 'space'; S._enterSpace('mars'); });
    for (let i = 0; i < 40 && (await page.evaluate(() => window.__zns.game.space.realm)) !== 'space'; i++) await frames(5);
    await page.evaluate(async () => { const S = window.__zns.game.space; for (let i = 0; i < 150 && S._tex.get('mars') !== 'done'; i++) await new Promise((r) => setTimeout(r, 100)); });
    await near({ id: 'mars', k: 3.4, side: 0.7, up: 0.3 });
    await frames(30);
    await shot('13-mars-from-space-terraformed.png');
    // (from space, half of it in the night: it lights up by itself, the waves run, its air and clouds come, its new land spreads)
    await near({ id: pid, k: 3.2, side: 2.2, up: 0.25 });
    const ice = await say('Terraform Planet');
    assert.equal(ice.name, 'TerraformPlanet', JSON.stringify(ice));
    assert.equal(await page.evaluate((pid) => window.__zns.game.space.planets.get(pid).climate, pid), 'ice');
    await page.evaluate(async (pid) => { const S = window.__zns.game.space; for (let i = 0; i < 150 && S._tex.get(pid) !== 'done'; i++) await new Promise((r) => setTimeout(r, 100)); }, pid); // (its new map)
    const at2 = async (s) => { await clockAt(s); await hold(); await frames(4); };
    await at2(3); await shot('15a-terraform-from-space-glow.png');
    await at2(7); await shot('15b-terraform-from-space-waves.png');
    await at2(12); await shot('15c-terraform-from-space-air.png');
    await at2(15); await shot('15d-terraform-from-space-new-land.png');
    await at2(21); await shot('15e-terraform-from-space-done.png');
    await clockGo();
    at = await land(pid);
    for (let i = 0; i < 40; i++) { if (!(await page.evaluate(() => window.__zns.game.world.terrain._remake?.length))) break; await wait(250); }
    await frames(90);
    await page.evaluate(() => { const p = window.__zns.game.character.group.position; const h = window.__zns.game.world.terrain.data.heightAt(Math.floor(p.x), Math.floor(p.z)); p.y = h + 2.2; });
    await frames(30);
    await shot('14-ice-world-surface.png');
    assert.deepEqual(realErrors(errors), []);
});
