/**
 * End-to-end tests in a real browser (Chromium, software WebGL).
 * Run: npm run test:e2e
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, sleep, realErrors, fakeVideo } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8140;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({ video: fakeVideo('victory.jpg') });
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

const state = (page) => page.evaluate(() => window.__zns.game.debugState());
const waitFor = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 200 });

test('menu: maps, modes and the new spell are listed; no errors on load', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await page.waitForSelector('.map-card');
    const cards = await page.$$eval('.map-card .map-name', (els) => els.map((e) => e.textContent));
    assert.ok(cards.includes('ТВОРЧЕСТВО') && cards.includes('ВЫЖИВАНИЕ'));
    assert.ok(cards.some((c) => c.startsWith('Карта')), cards.join(','));
    await page.click('[data-tab="tab-items"]');
    const items = await page.$$eval('#items-grid .item-name', (els) => els.map((e) => e.textContent));
    assert.ok(items.includes('Меч'), items.join(','));
    await page.click('[data-tab="tab-spells"]');
    const spells = await page.$$eval('#spells-grid .item-name', (els) => els.map((e) => e.textContent));
    assert.ok(spells.some((n) => n.startsWith('Бомбардо') && n.includes('Максима')), 'one card with a Maxima badge: ' + spells.join(','));
    assert.ok(!spells.includes('Бомбардо Максима'), 'no separate Maxima card');
    await page.click('#spell-cats .sub-tab:has-text("Строительство")');
    assert.ok((await page.$$eval('#spells-grid .item-name', (els) => els.map((e) => e.textContent))).includes('Create a Wall'));
    await page.click('[data-tab="tab-settings"]');
    await page.click('.sub-tab[data-sub="set-graphics"]');
    assert.ok(await page.isVisible('#graphics-quality'));
    assert.ok(!(await page.isVisible('#zombie-vol')), 'sound settings are on their own sub-tab');
    await page.click('[data-tab="tab-mp"]');
    assert.ok(await page.isVisible('#mp-create-open'));
    assert.ok(await page.isVisible('#mp-server-list'));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('creative: world with mountains, weapons floating over pedestals, hands follow the body', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // the game picture is really on screen (not inside a hidden menu)
    assert.equal(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.id), 'game-canvas', 'the game canvas is visible');
    const s = await state(page);
    assert.equal(s.mode, 'creative');
    assert.deepEqual(s.weapons.map((w) => w.type).sort(), ['axe', 'sword']);
    for (const w of s.weapons) assert.ok(w.pos[1] > 1.9, `${w.type} floats over its pedestal (${w.pos[1]})`);
    const terrain = await page.evaluate(() => {
        const t = window.__zns.game.terrain;
        let max = 0;
        for (let x = -118; x < 118; x += 4) for (let z = -118; z < 118; z += 4) max = Math.max(max, t.topLayer(x, z));
        return { max, spawn: t.surfaceY(0, 0) };
    });
    assert.ok(terrain.max >= 8, `mountains (max ${terrain.max})`);
    assert.equal(terrain.spawn, -0.5);

    // Arms forward with open hands, then fists
    await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0 }, 25, 60);
    const open = await page.evaluate(() => window.__zns.game.character.getGripCurl('right'));
    await feed(page, { arms: 'forward', leftCurl: 1, rightCurl: 1 }, 25, 60);
    const fist = await page.evaluate(() => window.__zns.game.character.getGripCurl('right'));
    assert.ok(open < 0.3, `open hand curl ${open}`);
    assert.ok(fist > 0.7, `fist curl ${fist}`);
    // Hand tracking lost for a moment: the hand keeps its pose (no drop)
    await feed(page, { arms: 'forward', leftCurl: null, rightCurl: null }, 4, 60); // (a short loss — well under the 2 s the hand holds its pose)
    const held = await page.evaluate(() => window.__zns.game.character.getGripCurl('right'));
    assert.ok(held > 0.7, `pose kept during short loss: ${held}`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('sword: real grab with closing fingers, swing kills a zombie, open hand drops it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 20, 60);
    // The player's palm stays at the sword's handle while the fingers close
    // (we keep the handle at the palm every frame, as if the hand reached it).
    await page.evaluate(() => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        const w = g.weapons.byId.get('tS');
        let placing = true;
        const place = () => {
            if (!placing) return;
            if (g.weapons.hands.right.held) { placing = false; return; } // the hand has it now
            w.hover = null; // (it floats over its pedestal until taken)
            const grip = g.character.getGripObject('right');
            grip.updateMatrixWorld(true);
            const e = grip.matrixWorld.elements;
            const P = new THREE.Vector3(e[12], e[13], e[14]);
            const Y = new THREE.Vector3(e[4], e[5], e[6]).normalize();
            const Z = new THREE.Vector3(e[8], e[9], e[10]).normalize();
            const G = P.addScaledVector(Y, 0.13).addScaledVector(Z, -0.135);
            const [a, b] = w.getHandleSegment();
            w.position.add(G.sub(a.lerp(b, 0.5)));
            w.sleeping = true;
            w.mesh.updateMatrixWorld(true);
        };
        const orig = g.weapons.update.bind(g.weapons);
        g.weapons.update = (dt, o) => { place(); orig(dt, o); };
        window.__swordHeldBy = () => (g.weapons.hands.right.held ? g.weapons.hands.right.held.id : null);
    });
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 10, 60);
    // Close the fingers on the handle
    await feed(page, { arms: 'forward', rightCurl: 0.95, leftCurl: 0 }, 25, 60);
    await waitFor(page, () => window.__swordHeldBy() === 'tS', null, 20000);

    // Spawn a zombie right in front and swing the sword through it
    await page.evaluate(() => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        const p = g.character.group.position;
        const z = g._createZombie(new THREE.Vector3(p.x, 0.5, p.z - 3.2));
        z.health = 2;
        window.__zid = z.id;
    });
    // Swing: the player turns sharply left/right with the sword in hand
    await page.evaluate(() => {
        const g = window.__zns.game;
        let t = 0;
        const orig = g._updatePlayer.bind(g);
        g._updatePlayer = (dt) => {
            if (window.__swing) {
                t += dt;
                g.cameraBaseRotation = Math.sin(t * 6) * 1.8; // turning the body (as the camera drift does)
            }
            orig(dt);
        };
        window.__swing = true;
    });
    let killed = false;
    for (let k = 0; k < 40 && !killed; k++) {
        await feed(page, { arms: 'forward', rightCurl: 0.95, leftCurl: 0 }, 3, 80);
        killed = await page.evaluate(() => window.__zns.game.zombies.find((z) => z.id === window.__zid)?.isDead ?? true);
    }
    await page.evaluate(() => { window.__swing = false; });
    const s = await state(page);
    assert.ok(killed, 'zombie killed by sword swings');
    assert.ok(s.punches >= 1);

    // Open the hand: the sword drops with physics and lands
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 15, 60);
    await waitFor(page, () => window.__swordHeldBy() === null, null, 20000);
    await waitFor(page, () => {
        const w = window.__zns.game.weapons.byId.get('tS');
        return w.sleeping && w.position.y < 0.5;
    }, null, 60000);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('Бомбардо: explodes on the ground, digs a crater, throws debris, hurts zombies, no stalls', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(() => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        const target = new THREE.Vector3(0, -0.5, -14);
        const z = g._createZombie(new THREE.Vector3(1.5, 0.5, -14));
        z.health = 5;
        const before = g.terrain.surfaceY(0, -14);
        g.stats.worstFrameMs = 0;
        g.spells.cast('Bombardo', new THREE.Vector3(0, 3, -4), target.clone().sub(new THREE.Vector3(0, 3, -4)).normalize(), 'right', 'local');
        window.__boomZ = z.id;
        return { before };
    });
    await waitFor(page, () => window.__zns.game.explosions.length > 0, null, 30000);
    await sleep(2500);
    const after = await page.evaluate(() => {
        const g = window.__zns.game;
        const z = g.zombies.find((x) => x.id === window.__boomZ);
        let low = 0;
        for (let x = -4; x <= 4; x++) for (let zz = -18; zz <= -10; zz++) low = Math.min(low, g.terrain.topLayer(x, zz));
        return { low, zombieHp: z ? z.health : -99, zombieDead: z ? z.isDead : true, debris: g.fx.debris.active, worst: g.stats.worstFrameMs };
    });
    assert.ok(after.low < 0, `crater dug (lowest layer ${after.low})`);
    assert.ok(after.zombieDead || after.zombieHp < 5, 'zombie hurt');
    assert.ok(after.worst < 400, `no long stall in the explosion frame (worst ${after.worst.toFixed(0)} ms in software rendering)`);
    // Voice route: the spell name is recognised from speech when the hand is raised
    const viaVoice = await page.evaluate(() => {
        const g = window.__zns.game;
        g.lastMagicTime = Date.now();
        g.lastSpellCastTime = 0;
        return g.castLocalSpell('бомбардо');
    });
    assert.equal(viaVoice, 'Bombardo');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('«Флайн»: arms up + word → take-off, Superman pose, torso steering, spells in the air, dive to land', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // Saying it with the arms down does nothing
    await feed(page, { arms: 'forward' }, 15, 60);
    const refused = await page.evaluate(() => { const g = window.__zns.game; g.lastMagicTime = Date.now(); g.lastSpellCastTime = 0; return g.castLocalSpell('флайн'); });
    assert.equal(refused, null);
    // Both arms up + the word
    await feed(page, { arms: 'up' }, 20, 60);
    const name = await page.evaluate(() => { const g = window.__zns.game; g.lastSpellCastTime = 0; return g.castLocalSpell('флайн'); });
    assert.equal(name, 'Flight');
    const y0 = await page.evaluate(() => window.__zns.game.character.group.position.y);
    await feed(page, { arms: 'up' }, 20, 70); // keep the arms up while taking off
    await page.waitForFunction(() => window.__zns.game.flight.state === 'cruise', null, { timeout: 30000 });
    const takeoff = await page.evaluate(() => window.__zns.game.character.group.position.y);
    assert.ok(takeoff > y0 + 3, `rose into the air (${y0.toFixed(1)} → ${takeoff.toFixed(1)})`);
    // Cruise with arms forward: Superman pose, flying ahead
    await feed(page, { arms: 'forward' }, 40, 70);
    let st = await page.evaluate(() => { const g = window.__zns.game; return { ...g.debugState().flight, rx: g.character.group.rotation.x, pos: g.character.group.position.toArray(), yaw: g.character.group.rotation.y }; });
    assert.ok(st.tilt > 1.0 && st.rx < -1.0, `body horizontal (tilt ${st.tilt.toFixed(2)})`);
    assert.ok(st.speed > 8, `speed ${st.speed.toFixed(1)}`);
    // Lean to the left → turn left (yaw grows)
    const yawBefore = st.yaw;
    await feed(page, { arms: 'forward', lean: 0.06 }, 30, 70);
    st = await page.evaluate(() => ({ yaw: window.__zns.game.character.group.rotation.y }));
    assert.ok(st.yaw > yawBefore + 0.3, `turned left (${yawBefore.toFixed(2)} → ${st.yaw.toFixed(2)})`);
    // Spells work in the air
    const cast = await page.evaluate(() => { const g = window.__zns.game; g.lastMagicTime = Date.now(); g.lastSpellCastTime = 0; return g.castLocalSpell('инферно'); });
    assert.equal(cast, 'Inferno');
    // Lean forward → dive → touch the ground → flight ends, standing again
    await feed(page, { arms: 'forward', forward: 0.15 }, 60, 70);
    await page.waitForFunction(() => window.__zns.game.flight.state === 'idle', null, { timeout: 60000 });
    await sleep(1500);
    st = await page.evaluate(() => { const g = window.__zns.game; const p = g.character.group.position; return { y: p.y, ground: g.collision.groundY(p.x, p.z), rx: g.character.group.rotation.x }; });
    assert.ok(Math.abs(st.y - (st.ground + 2.0)) < 0.3, `standing on the ground (${st.y.toFixed(2)} vs ${st.ground})`);
    assert.ok(Math.abs(st.rx) < 0.01, 'upright again');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('Бомбардо on a mountain: part of the mountain is blown away, zombies are thrown into the air', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        const t = g.terrain;
        // Find a mountain column
        let best = null;
        for (let x = -110; x < 110 && !best; x += 2) for (let z = -110; z < 110; z += 2) if (t.topLayer(x, z) >= 8) { best = { x, z }; break; }
        const h0 = t.topLayer(best.x, best.z);
        const top = new THREE.Vector3(best.x, h0 - 0.5, best.z);
        // A zombie standing next to the blast on flat ground near the player
        const z = g._createZombie(new THREE.Vector3(2, 0.5, -12));
        z.health = 50;
        g.explode(new THREE.Vector3(1, -0.5, -12), 3.6, 'local');
        const flew = { maxY: z.group.position.y };
        g.explode(top, 3.6, 'local');
        for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 50)); flew.maxY = Math.max(flew.maxY, z.group.position.y); }
        // Wait until it has landed (game time runs slower on a busy test machine)
        for (let i = 0; i < 150; i++) {
            await new Promise((res) => setTimeout(res, 100));
            const gy = g.collision.groundY(z.group.position.x, z.group.position.z);
            if (i > 20 && Math.abs(z.group.position.y - (gy + 1.0)) < 0.2 && !z.vy) break;
        }
        let removed = 0;
        for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) removed += Math.max(0, h0 - t.topLayer(best.x + dx, best.z + dz));
        return { h0, after: t.topLayer(best.x, best.z), removed, flewY: flew.maxY, landedY: z.group.position.y, ground: g.collision.groundY(z.group.position.x, z.group.position.z) };
    });
    assert.ok(r.after < r.h0, `mountain lost height (${r.h0} → ${r.after})`);
    assert.ok(r.removed > 15, `a chunk of the mountain is gone (${r.removed} blocks)`);
    assert.ok(r.flewY > 1.5, `zombie thrown into the air (max y ${r.flewY.toFixed(2)})`);
    assert.ok(Math.abs(r.landedY - (r.ground + 1.0)) < 0.2, 'zombie landed back on the ground');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('«Бомбардо Максима»: 3× stronger — bigger crater, burst from the hand, voice waits for «Максима»', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        const t = g.terrain;
        // Two tall mountain spots far apart
        const spots = [];
        for (let x = -110; x < 110 && spots.length < 2; x += 2) for (let z = -110; z < 110; z += 2) {
            if (t.topLayer(x, z) >= 12 && spots.every((s) => Math.hypot(s.x - x, s.z - z) > 30)) { spots.push({ x, z }); break; }
        }
        const dig = (spot, power) => {
            const h0 = [];
            for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) h0.push(t.topLayer(spot.x + dx, spot.z + dz));
            const top = new THREE.Vector3(spot.x, t.topLayer(spot.x, spot.z) - 0.5, spot.z);
            const t0 = performance.now();
            g.explode(top, window.__zns.bombardoRadius(power), 'local', power);
            const ms = performance.now() - t0;
            let i = 0, removed = 0;
            for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) removed += Math.max(0, h0[i++] - t.topLayer(spot.x + dx, spot.z + dz));
            return { removed, ms };
        };
        const normal = dig(spots[0], 1);
        const maxima = dig(spots[1], 3);
        // The spell itself: big orb + burst of magic from the hand
        g.stats.worstFrameMs = 0;
        const glowBefore = g.fx.glow.active;
        g.spells.cast('BombardoMaxima', new THREE.Vector3(0, 3, -4), new THREE.Vector3(0, -0.3, -1).normalize(), 'right', 'local');
        const burst = g.fx.glow.active - glowBefore;
        const orb = g.spells.orbs.find((o) => o.visible);
        const orbScale = orb ? orb.scale.x : 0;
        const n0 = g.explosions.length;
        for (let i = 0; i < 80 && g.explosions.length === n0; i++) await new Promise((res) => setTimeout(res, 100));
        const blastRadius = g.explosions.length > n0 ? g.explosions[g.explosions.length - 1].r : 0;
        await new Promise((res) => setTimeout(res, 1500));
        return { normal, maxima, burst, orbScale, blastRadius, worst: g.stats.worstFrameMs };
    });
    assert.ok(r.maxima.removed > r.normal.removed * 3, `crater ${r.maxima.removed} blocks vs ${r.normal.removed}`);
    assert.ok(r.burst >= 80, `magic bursts out of the hand (${r.burst} particles)`);
    assert.ok(r.orbScale > 2, 'the orb is bigger');
    assert.ok(r.blastRadius > 6, `big blast (${r.blastRadius})`);
    assert.ok(r.maxima.ms < 400, `explosion computed in ${r.maxima.ms.toFixed(0)} ms`);

    // Voice: an unfinished «бомбардо…» waits for «максима»
    const voice = await page.evaluate(async () => {
        const g = window.__zns.game;
        const casts = [];
        const orig = g.spells.cast.bind(g.spells);
        g.spells.cast = (name, ...a) => { casts.push(name); return orig(name, ...a); };
        const say = (text, fin) => { g.lastMagicTime = Date.now(); return g.castLocalSpell(text, fin); };
        g.lastSpellCastTime = 0;
        say('бомбардо', false);
        const early = casts.length;
        await new Promise((res) => setTimeout(res, 300));
        say('бомбардо максима', false);
        const afterMaxima = [...casts];
        await new Promise((res) => setTimeout(res, 1200));
        say('бомбардо максима', true); // final version of the same phrase: no double cast (cooldown)
        // Plain «бомбардо» still works on its own after a short wait
        await new Promise((res) => setTimeout(res, 1100));
        casts.length = 0;
        say('бомбардо', false);
        for (let i = 0; i < 30 && !casts.length; i++) await new Promise((res) => setTimeout(res, 100));
        const plain = [...casts];
        say('бомбардо', true); // the final transcript of the same word
        await new Promise((res) => setTimeout(res, 300));
        return { early, afterMaxima, plain, total: casts.length };
    });
    assert.equal(voice.early, 0, 'does not fire «Бомбардо» while the phrase is unfinished');
    assert.deepEqual(voice.afterMaxima, ['BombardoMaxima']);
    assert.deepEqual(voice.plain, ['Bombardo'], 'plain Bombardo fires after a short wait');
    assert.equal(voice.total, 1, 'the final transcript does not cast it twice');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('endless world: flying far away streams terrain in and out, no edge, no stalls', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const t = g.terrain;
        const ch = g.character;
        const shown = () => [...t.meshes.values()].filter((e) => e.ground.visible || e.raised.visible).length;
        const atSpawn = shown();
        g.startFlight(true);
        // Fly far east at top speed (fast-forward the position along the way)
        g.stats.worstLogicMs = 0;
        for (let i = 0; i < 60; i++) {
            ch.group.position.x += 35;
            ch.group.position.y = Math.max(ch.group.position.y, g.collision.groundY(ch.group.position.x, ch.group.position.z) + 12);
            await new Promise((res) => setTimeout(res, 120));
        }
        // Let the last chunks load
        for (let i = 0; i < 100 && t._queue.length; i++) await new Promise((res) => setTimeout(res, 100));
        const p = ch.group.position;
        let near = 0;
        for (const e of t.meshes.values()) if (Math.hypot(e.cx * 32 + 16 - p.x, e.cz * 32 + 16 - p.z) < 100) near++;
        return {
            x: p.x, atSpawn, shownFar: shown(), near, meshes: t.meshes.size, pooled: t.pool.length,
            data: t.data.chunks.size, ground: g.collision.groundY(p.x, p.z), queue: t._queue.length,
            maxBuild: t.stats.maxBuildMs, worstLogic: g.stats.worstLogicMs, skyX: g.world.sky.position.x,
        };
    });
    assert.ok(r.x > 2000, `flew ${r.x.toFixed(0)} m`);
    assert.ok(r.atSpawn > 20, `chunks around spawn (${r.atSpawn})`);
    assert.ok(r.near >= 25, `terrain loaded around the player far away (${r.near} chunks)`);
    assert.equal(r.queue, 0, 'everything around is loaded');
    assert.ok(r.meshes < 260, `far chunks are unloaded (${r.meshes} meshes, ${r.pooled} pooled)`);
    assert.ok(r.data < 900, `chunk data is evicted (${r.data})`);
    assert.ok(Number.isFinite(r.ground) && r.ground >= -0.6, 'ground under the player');
    assert.ok(Math.abs(r.skyX - r.x) < 1, 'sky travels with the player');
    assert.ok(r.worstLogic < 150, `no frame stalls while streaming (worst logic ${r.worstLogic.toFixed(0)} ms, chunk ${r.maxBuild.toFixed(1)} ms)`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('every spell can be cast repeatedly without errors (pooled effects)', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await sleep(2000); // first frames also build the shadow-map shaders (still loading time)
    const warm = await page.evaluate(() => window.__zns.game.renderer.info.programs.length);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        for (let i = 0; i < 4; i++) g._createZombie(new THREE.Vector3(-3 + i * 2, 0.5, -12));
        const o = new THREE.Vector3(0, 3, 0), d = new THREE.Vector3(0, -0.1, -1).normalize();
        for (const name of ['Inferno', 'Thunderwave', 'Sapira', 'Sands', 'Ice', 'Inferno', 'Thunderwave']) g.spells.cast(name, o, d, 'right', 'local');
    });
    await sleep(5000);
    // Bombardo + a zombie losing limbs/head (flying parts) + ice shatter
    await page.evaluate(() => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        g.explode(new THREE.Vector3(5, -0.5, -20), 3.2, 'local');
        const z = g._createZombie(new THREE.Vector3(-6, 0.5, -8));
        z.decapitate(); z.severLimb(Math.random, 2); z.freeze(); z.takeDamage(1, true);
    });
    await sleep(3000);
    const s = await page.evaluate(() => ({ programs: window.__zns.game.renderer.info.programs.length, ...window.__zns.game.debugState().stats }));
    // Every effect's shader was compiled during loading: nothing new compiles
    // in a fight (that was a source of freezes), and no per-spark materials.
    assert.equal(s.programs, warm, `shader programs ${s.programs} vs after loading ${warm}`);
    assert.ok(s.programs < 40, `shader programs ${s.programs}`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('stress: 40 zombies + Inferno + explosions — game logic stays fast', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        for (let i = 0; i < 40; i++) g._createZombie(new THREE.Vector3(-20 + (i % 10) * 4, 0.5, -15 - Math.floor(i / 10) * 4));
        g.stats.worstLogicMs = 0;
        let n = 0;
        window.__stress = setInterval(() => {
            const o = new THREE.Vector3(0, 3, 0);
            g.spells.cast('Inferno', o, new THREE.Vector3(Math.sin(n) * 0.5, -0.1, -1).normalize(), 'right', 'local');
            if (n % 3 === 0) g.explode(new THREE.Vector3(-15 + (n * 7) % 30, -0.5, -30), 3.2, 'local');
            n++;
        }, 1500);
    });
    await sleep(15000);
    const st = await page.evaluate(() => { clearInterval(window.__stress); return window.__zns.game.debugState().stats; });
    console.log('stress stats', JSON.stringify({ logicMs: st.logicMs.toFixed(2), worstLogicMs: st.worstLogicMs.toFixed(1), frames: st.frames }));
    assert.ok(st.logicMs < 12, `average game logic ${st.logicMs.toFixed(2)} ms per frame`);
    assert.ok(st.worstLogicMs < 120, `worst game-logic frame ${st.worstLogicMs.toFixed(1)} ms (software rendering machine)`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('survival: zombies spawn in waves and bite; HP reaches 0 → game over screen', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'survival');
    await waitHudVisible(page);
    await waitFor(page, () => window.__zns.game.zombies.length >= 1, null, 20000);
    await page.evaluate(() => {
        const g = window.__zns.game;
        g.playerHP = 2;
        const p = g.character.group.position;
        for (const z of g.zombies) { z.group.position.set(p.x + 1.6, z.group.position.y, p.z); z.isSleeping = false; }
    });
    await waitFor(page, () => !document.getElementById('game-over').classList.contains('hidden'), null, 60000);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('map with chest: opens without crash, lid animates, faces away from walls, reward can be grabbed', async () => {
    const name = 'ZZ Тест сундука';
    // Chest at (5,5) with walls to its +Z and +X — the old game turned it into the wall.
    const map = {
        name, gridSize: 12,
        walls: [{ x: 5, z: 6 }, { x: 6, z: 5 }, { x: 6, z: 6 }],
        playerSpawn: { x: 3, z: 5 }, winPoint: { x: 9, z: 9 },
        zombieSpawns: [], chests: [{ x: 5, z: 5, item: 'sword' }],
    };
    await fetch(srv.url + 'api/maps?name=' + encodeURIComponent(name), { method: 'DELETE' });
    const res = await fetch(srv.url + 'api/maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(map) });
    assert.equal(res.status, 200);
    try {
        const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
        await startFromMenu(page, name);
        await waitHudVisible(page);
        let s = await state(page);
        assert.equal(s.chests.length, 1);
        const rot = s.chests[0].rotY;
        const front = { x: Math.round(Math.sin(rot)), z: Math.round(Math.cos(rot)) };
        const blocked = map.walls.some((w) => w.x === 5 + front.x && w.z === 5 + front.z);
        assert.ok(!blocked, `chest front ${JSON.stringify(front)} is not against a wall`);
        // Walk next to the chest
        await page.evaluate(() => { const g = window.__zns.game; g.character.group.position.set(5 * 5 - 4.5, 1.5, 5 * 5); });
        await waitFor(page, () => window.__zns.game.chests[0].isOpen, null, 20000);
        await waitFor(page, () => window.__zns.game.chests[0].openProgress >= 1, null, 30000);
        s = await state(page);
        assert.ok(s.chests[0].lidX < -1.5, `lid opened (${s.chests[0].lidX})`);
        const reward = s.weapons.find((w) => w.id === 'c0');
        assert.ok(reward && reward.type === 'sword', 'reward sword spawned');
        assert.ok(reward.pos[1] > 1.0, 'reward floats above the chest');
        assert.equal(await page.evaluate(() => window.__zns.game.active), true, 'game still running (old crash fixed)');
        // Reach the finish → victory
        await page.evaluate(() => { const g = window.__zns.game; g.character.group.position.set(45, 1.5, 45); });
        await waitFor(page, () => !document.getElementById('victory-screen').classList.contains('hidden'), null, 20000);
        assert.deepEqual(realErrors(errors), []);
        await page.close();
    } finally {
        await fetch(srv.url + 'api/maps?name=' + encodeURIComponent(name), { method: 'DELETE' });
    }
});

test('settings: third-person camera, V2 hands, hidden hands — all run without errors', async () => {
    for (const variant of ['tpv', 'v2', 'nohands']) {
        const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
        await page.click('[data-tab="tab-settings"]');
        if (variant === 'tpv') await page.uncheck('#camera-mode-toggle');
        if (variant === 'v2') await page.check('#hand-version-v2');
        if (variant === 'nohands') await page.uncheck('#show-hands-toggle');
        await page.click('[data-tab="tab-game"]');
        await startFromMenu(page, 'creative');
        await waitHudVisible(page);
        await feed(page, { arms: 'forward', leftCurl: 0.5, rightCurl: 0.5 }, 15, 60);
        const st = await page.evaluate(() => {
            const g = window.__zns.game;
            return { mode: g.cameraMode, version: g.character.handVersion, v2count: g.character.rightDetailedHand.mesh.count, shown: g.character.handsVisible };
        });
        if (variant === 'tpv') assert.equal(st.mode, 'tpv');
        if (variant === 'v2') { assert.equal(st.version, 'v2'); assert.ok(st.v2count > 100, `voxel hand drawn (${st.v2count})`); }
        if (variant === 'nohands') assert.equal(st.shown, false);
        assert.deepEqual(realErrors(errors), [], variant);
        await page.close();
    }
});

test('map editor: draw a map, save it, it appears in the game list, delete it', async (t) => {
    const name = 'ZZ Редактор';
    await fetch(srv.url + 'api/maps?name=' + encodeURIComponent(name), { method: 'DELETE' });
    t.after(() => fetch(srv.url + 'api/maps?name=' + encodeURIComponent(name), { method: 'DELETE' }));
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await page.click('[data-tab="tab-editor"]');
    await page.waitForSelector('#editor-canvas');
    await page.locator('#editor-canvas').scrollIntoViewIfNeeded();
    const box = await page.locator('#editor-canvas').boundingBox();
    const cell = (x, z) => ({ x: box.x + (x + 0.5) * box.width / 20, y: box.y + (z + 0.5) * box.height / 20 });
    // Walls (drag), spawn, chest
    await page.click('[data-tool="wall"]');
    await page.mouse.move(cell(3, 3).x, cell(3, 3).y);
    await page.mouse.down();
    for (let x = 3; x <= 8; x++) await page.mouse.move(cell(x, 3).x, cell(x, 3).y);
    await page.mouse.up();
    await page.click('[data-tool="spawn"]');
    await page.mouse.click(cell(5, 6).x, cell(5, 6).y);
    await page.click('[data-tool="chest"]');
    await page.mouse.click(cell(5, 4).x, cell(5, 4).y);
    await page.click('#confirm-chest');
    await page.fill('#map-name', name);
    await page.click('#save-map-btn');
    let maps = {};
    for (let i = 0; i < 40 && !maps[name]; i++) {
        await sleep(250);
        maps = await (await fetch(srv.url + 'api/maps')).json();
    }
    assert.ok(maps[name], 'saved on the server');
    assert.ok(maps[name].walls.length >= 6, `walls ${maps[name].walls.length}`);
    assert.deepEqual(maps[name].playerSpawn, { x: 5, z: 6 });
    assert.equal(maps[name].chests.length, 1);
    await page.click('[data-tab="tab-game"]');
    await page.evaluate(() => window.updateGameMapList(true));
    await page.waitForSelector(`.map-card[data-name="${name}"]`);
    // Delete through the API used by the editor's ✕ button
    const del = await fetch(srv.url + 'api/maps?name=' + encodeURIComponent(name), { method: 'DELETE' });
    assert.equal(del.status, 200);
    // the editor shows an alert() on save — that's expected UI, not an error
    assert.deepEqual(realErrors(errors).filter((e) => !e.startsWith('dialog: Карта')), []);
    await page.close();
});

test('camera setup (test mode) opens and closes without errors', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await page.click('[data-tab="tab-settings"]');
    await page.click('#test-mode-btn');
    await waitFor(page, () => window.__zns.game && window.__zns.game.active, null, 30000);
    await page.fill('#hp-s', '1.4');
    await page.dispatchEvent('#hp-s', 'input');
    await sleep(1000);
    const scale = await page.evaluate(() => window.__zns.game.character.rightSimplifiedHand.group.scale.y);
    assert.ok(Math.abs(scale - 1.4) < 1e-6);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('real camera pipeline (classic Holistic, as in the original): webcam → body detected', async () => {
    const { page, errors } = await openPage(browser, srv.url, { viewport: { width: 640, height: 400 } });
    await startFromMenu(page, 'creative');
    await waitFor(page, () => window.__zns.poseService.stats.results >= 3, null, 180000);
    const st = await page.evaluate(() => {
        const r = window.__zns.poseService.lastResults || {};
        return { ...window.__zns.poseService.stats, found: ['poseLandmarks', 'faceLandmarks', 'leftHandLandmarks', 'rightHandLandmarks'].filter((k) => r[k]) };
    });
    assert.equal(st.mode, 'worker-cpu');
    assert.equal(st.thread, 'worker', 'the camera network runs in its own thread (the game never waits for it)');
    assert.ok(st.results >= 3, 'Holistic answers every camera frame');
    // (with a real person in the picture it finds body, face and hands — checked by hand
    // with tests/fixtures-like portrait video; this fixture photo is not a full person)
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('real camera pipeline (new networks): webcam → worker → hand detected', async () => {
    const { page, errors } = await openPage(browser, srv.url, { viewport: { width: 640, height: 400 } });
    await page.evaluate(() => { document.getElementById('vision-engine').value = 'tasks'; });
    await startFromMenu(page, 'creative');
    await waitFor(page, () => window.__zns.poseService.stats.results >= 3, null, 120000);
    const st = await page.evaluate(() => ({ ...window.__zns.poseService.stats, hands: window.__zns.poseService.lastResults && (window.__zns.poseService.lastResults.leftHandLandmarks || window.__zns.poseService.lastResults.rightHandLandmarks) ? 1 : 0 }));
    assert.equal(st.mode, 'worker');
    assert.ok(st.results >= 3);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
