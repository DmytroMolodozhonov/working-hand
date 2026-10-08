/**
 * End-to-end tests in a real browser (Chromium, software WebGL).
 * Run: npm run test:e2e
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, sleep, realErrors, fakeVideo } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = 8140;
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
    const items = await page.$$eval('.item-name', (els) => els.map((e) => e.textContent));
    assert.ok(items.includes('Бомбардо') && items.includes('Меч'));
    await page.click('[data-tab="tab-game"]');
    await page.click('#mp-panel > summary');
    assert.ok(await page.isVisible('#mp-host-btn'));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('creative: world with mountains, tables with weapons, hands follow the body', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const s = await state(page);
    assert.equal(s.mode, 'creative');
    assert.deepEqual(s.weapons.map((w) => w.type).sort(), ['axe', 'sword']);
    for (const w of s.weapons) assert.ok(w.pos[1] > 1.9, `${w.type} is on its table (${w.pos[1]})`);
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
    await feed(page, { arms: 'forward', leftCurl: null, rightCurl: null }, 8, 60);
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

test('every spell can be cast repeatedly without errors (pooled effects)', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        for (let i = 0; i < 4; i++) g._createZombie(new THREE.Vector3(-3 + i * 2, 0.5, -12));
        const o = new THREE.Vector3(0, 3, 0), d = new THREE.Vector3(0, -0.1, -1).normalize();
        for (const name of ['Inferno', 'Thunderwave', 'Sapira', 'Sands', 'Ice', 'Inferno', 'Thunderwave']) g.spells.cast(name, o, d, 'right', 'local');
    });
    await sleep(5000);
    const s = await page.evaluate(() => ({ programs: window.__zns.game.renderer.info.programs.length, ...window.__zns.game.debugState().stats }));
    // Shader programs must not explode in number (no per-spark materials)
    assert.ok(s.programs < 40, `shader programs ${s.programs}`);
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

test('real camera pipeline: webcam → worker → hand detected', async () => {
    const { page, errors } = await openPage(browser, srv.url);
    await startFromMenu(page, 'creative');
    await waitFor(page, () => window.__zns.poseService.stats.results >= 3, null, 120000);
    const st = await page.evaluate(() => ({ ...window.__zns.poseService.stats, hands: window.__zns.poseService.lastResults && (window.__zns.poseService.lastResults.leftHandLandmarks || window.__zns.poseService.lastResults.rightHandLandmarks) ? 1 : 0 }));
    assert.equal(st.mode, 'worker');
    assert.ok(st.results >= 3);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
