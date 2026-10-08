/**
 * Endless world, rivers/lakes and water bending — in a real browser.
 * Run: npm run test:e2e
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8155;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
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
        g.quality.auto = false; // (its rare resolution changes are measured elsewhere)
        g.startFlight(true);
        g.stats.worstLogicMs = 0;
        // Fly far east (fast-forwarding the position along the way)
        for (let i = 0; i < 60; i++) {
            ch.group.position.x += 35;
            ch.group.position.y = Math.max(ch.group.position.y, g.collision.groundY(ch.group.position.x, ch.group.position.z) + 12);
            await new Promise((res) => setTimeout(res, 120));
        }
        for (let i = 0; i < 150 && t._queue.length; i++) await new Promise((res) => setTimeout(res, 100));
        const p = ch.group.position;
        let near = 0;
        for (const e of t.meshes.values()) if (Math.hypot(e.cx * 32 + 16 - p.x, e.cz * 32 + 16 - p.z) < 100) near++;
        return {
            x: p.x, atSpawn, near, meshes: t.meshes.size, data: t.data.chunks.size,
            ground: g.collision.groundY(p.x, p.z), queue: t._queue.length,
            maxBuild: t.stats.maxBuildMs, worstLogic: g.stats.worstLogicMs, skyX: g.world.sky.position.x,
        };
    });
    assert.ok(r.x > 2000, `flew ${r.x.toFixed(0)} m`);
    assert.ok(r.atSpawn > 20, `chunks around spawn (${r.atSpawn})`);
    assert.ok(r.near >= 25, `terrain loaded around the player far away (${r.near} chunks)`);
    assert.equal(r.queue, 0, 'everything around is loaded');
    assert.ok(r.meshes < 260, `far chunks are unloaded (${r.meshes} meshes)`);
    assert.ok(r.data < 900, `chunk data is evicted (${r.data})`);
    assert.ok(Number.isFinite(r.ground), 'ground under the player');
    assert.ok(Math.abs(r.skyX - r.x) < 1, 'sky travels with the player');
    assert.ok(r.worstLogic < 200, `no long stalls while streaming (worst ${r.worstLogic.toFixed(0)} ms, chunk ${r.maxBuild.toFixed(1)} ms)`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('water bending: Waterbollow at a river, Максима, Water forming, Frozen → ice blocks, drops', async () => {
    // Small window: software rendering in the test browser is slow, game time must keep moving
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const t = g.terrain.data;
        const ch = g.character;
        const W = g.water;
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const say = async (text) => { g._lastWaterCast = 0; const n = g.castLocalSpell(text, true); await sleep(50); return n; };
        const out = {};
        // Far from water the spell explains what to do
        out.dry = await say('вотербол');
        out.dryHint = document.getElementById('voice-debug')?.innerText || '';
        // Find water and stand in it (on the river bed)
        let spot = null;
        for (let x = 140; x < 900 && !spot; x += 3) for (let z = -300; z < 300; z += 3) if (t.get(x, 0, z) === 8 && t.get(x + 1, 0, z) === 8) { spot = { x, z }; break; }
        out.spot = spot;
        ch.group.position.set(spot.x, g.collision.groundY(spot.x, spot.z) + 1.0, spot.z);
        for (let i = 0; i < 60 && g.terrain._queue.length; i++) await sleep(100);
        await sleep(300);
        out.cast = await say('вотербол');
        out.rising = W.state && W.state.phase;
        for (let i = 0; i < 300 && W.state && W.state.phase !== 'held'; i++) await sleep(100);
        out.held = W.state && W.state.phase;
        out.v0 = W.state.volume;
        out.max1 = await say('максима');
        out.max2 = await say('максима');
        out.v1 = W.state.volume;
        out.ballVisible = W.ball.visible;
        // Forming: lead the ball through the air (the body walks, the hand stays calm)
        out.form = await say('water forming');
        const start = ch.group.position.clone();
        for (let i = 0; i < 40; i++) {
            ch.group.position.x = start.x + i * 0.15;
            await sleep(60);
        }
        // (the heavy ball follows the hand slowly — give it time on the slow test machine)
        for (let i = 0; i < 100 && W.state && W.state.formed.length < 3; i++) {
            ch.group.position.x += i % 20 < 10 ? 0.15 : -0.15;
            await sleep(100);
        }
        out.formed = W.state ? W.state.formed.length : -1;
        out.v2 = W.state ? W.state.volume : -1;
        out.formedVisible = W.formedMesh.visible && W.formedMesh.count === out.formed;
        const minY0 = Math.min(...(W.state ? W.state.formed : []).map((b) => b.y));
        out.frozen = await say('frozen');
        out.ballDropped = !W.state && W.falling.length === 1 && W.falling[0].frozen;
        // The frozen shape falls as one piece, then becomes solid where it landed
        for (let i = 0; i < 300 && W.fallingShapes && W.fallingShapes.length; i++) await sleep(100);
        const blobs = W.iceShapes.slice();
        out.fell = blobs.length ? Math.min(...blobs.map((b) => b.y)) <= minY0 + 1e-6 : false;
        // Every frozen blob is solid inside (ICE_SHAPE) and drawn as a smooth ice shape, not cubes
        out.ice = blobs.filter((b) => t.get(Math.round(b.x), Math.floor(b.y + 1.5), Math.round(b.z)) === 11).length;
        out.iceSolid = blobs.length ? t.isSolidAt(blobs[0].x, blobs[0].y, blobs[0].z) : false;
        out.iceShapes = W.iceShapes.length;
        out.iceMeshVisible = W.iceMesh.visible;
        out.noIceBeam = g.castLocalSpell('frozen', true) === null; // right after: never the ice beam
        // The frozen ball fell on its own and stays in the world (solid)
        for (let i = 0; i < 300 && W.falling.length; i++) await sleep(100);
        out.resting = W.resting.length;
        out.restBox = W.resting[0] ? !!g.collision.boxes.get(W.resting[0].boxId) : false;
        // Liquid ball dropped by a sharp jerk of the hand → splash, nothing stays
        await sleep(700);
        ch.group.position.set(spot.x, g.collision.groundY(spot.x, spot.z) + 1.0, spot.z);
        await sleep(300);
        out.cast2 = await say('water ball');
        for (let i = 0; i < 300 && W.state && W.state.phase !== 'held'; i++) await sleep(100);
        await sleep(900);
        out.held2 = W.state && W.state.phase;
        if (W.state) { W.state.history.unshift({ t: W._t, x: 50, y: 0, z: 0 }); W.state.history.length = 1; }
        await sleep(300);
        out.afterJerk = W.state;
        for (let i = 0; i < 300 && W.falling.length; i++) await sleep(100);
        out.restingAfterLiquid = W.resting.length;
        // «Frozen» without a water ball is the normal ice beam
        await sleep(4200); // later, without water, «Frozen» is the ice beam again
        g.lastMagicTime = Date.now();
        g.lastSpellCastTime = 0;
        out.iceBeam = await say('frozen');
        out.iceCells = g.iceCells.length;
        return out;
    });
    assert.equal(r.dry, null, 'no water nearby → nothing happens');
    assert.match(r.dryHint, /вод/i);
    assert.ok(r.spot, 'a river or lake exists');
    assert.equal(r.cast, 'Waterball');
    assert.equal(r.rising, 'rising');
    assert.equal(r.held, 'held', 'water rose into a ball in the hand');
    assert.equal(r.max1, 'Maxima');
    assert.equal(r.max2, 'Maxima');
    assert.ok(r.v1 >= r.v0 + 7, `«Максима» twice: ${r.v0} → ${r.v1} m³`);
    assert.ok(r.ballVisible);
    assert.equal(r.form, 'WaterForming');
    assert.ok(r.formed >= 3, `water shape formed (${r.formed} blobs)`);
    assert.ok(r.formedVisible, 'the formed water is drawn');
    assert.ok(r.v2 < r.v1, 'forming spends the ball\'s water');
    assert.equal(r.frozen, 'Frozen');
    assert.equal(r.ice, r.formed, 'every formed blob became solid ice');
    assert.ok(r.iceSolid, 'ice is solid');
    assert.equal(r.iceShapes, r.formed);
    assert.ok(r.iceMeshVisible, 'the frozen shape is drawn');
    assert.ok(r.ballDropped, 'the frozen ball drops (not left hanging in the air)');
    assert.ok(r.fell, 'the frozen shape fell down');
    assert.ok(r.noIceBeam, '«Frozen» with water never casts the ice beam');
    assert.equal(r.resting, 1, 'the dropped ice ball stays in the world');
    assert.ok(r.restBox, 'and it is solid');
    assert.equal(r.cast2, 'Waterball');
    assert.equal(r.held2, 'held');
    assert.equal(r.afterJerk, null, 'a sharp jerk drops the spell');
    assert.equal(r.restingAfterLiquid, 1, 'liquid water just splashes');
    assert.equal(r.iceBeam, 'Ice');
    assert.ok(r.iceCells >= r.formed);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('Вингардиум Левиоса, Protection in creative, Флайн by voice with arms up', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const ch = g.character;
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const out = {};
        // Nothing pointed at → a hint
        ch.group.position.set(0, ch.group.position.y, 30);
        await sleep(300);
        out.none = g.castLocalSpell('вингардиум левиоса', true);
        // Put the sword 4 m in front of the right hand
        const w = g.weapons.weapons.find((x) => x.type === 'sword');
        const hand = ch.getHandWorldPosition('right');
        const dir = ch.getHandDirection('right');
        w.position.copy(hand).addScaledVector(dir, 4);
        w.position.y = Math.max(w.position.y, g.collision.surfaceY(w.position.x, w.position.z) + 0.2);
        w.wake();
        await sleep(400);
        g._lastLevitate = 0;
        out.cast = g.castLocalSpell('вингардиум левиоса', true);
        out.held = !!(w.holder && w.holder.levitate);
        await sleep(1500);
        const y0 = w.position.y;
        // The player walks sideways: the sword follows the hand
        const start = w.position.clone();
        for (let i = 0; i < 20; i++) { ch.group.position.x += 0.25; await sleep(80); }
        for (let i = 0; i < 40 && Math.abs(w.position.x - (start.x + 5)) > 1.2; i++) await sleep(100);
        out.followed = w.position.x - start.x;
        out.floats = w.position.y > g.collision.surfaceY(w.position.x, w.position.z) + 0.3;
        // A sharp jerk of the hand lets go
        const s = g.levitation.state;
        s.history.unshift({ t: g.levitation._t, x: 50, y: 0, z: 0 });
        s.history.length = 1;
        await sleep(400);
        out.released = !g.levitation.active && !w.holder;
        // Shields: visible in creative, dome needs a T-pose
        g._lastShieldCast = 0;
        out.shield = g.castLocalSpell('protection', true);
        await sleep(300);
        out.shieldVisible = g.combat.visuals.hand.visible;
        for (let i = 0; i < 150 && g.combat.visuals.hand.visible; i++) await sleep(100);
        out.shieldGone = !g.combat.visuals.hand.visible;
        g._lastShieldCast = 0;
        out.domeNoT = g.castLocalSpell('protection maxima', true);
        ch.isTPose = () => true;
        g._lastShieldCast = 0;
        out.dome = g.castLocalSpell('protection maxima', true);
        await sleep(300);
        out.domeVisible = g.combat.visuals.dome.visible;
        out.domeLeft = g.combat.shield && g.combat.shield.left;
        // Flight: arms up (no hand to the face needed) — the word a moment after
        g.lastMagicTime = 0;
        g.isMagicActive = false;
        g._armsUpAt = Date.now() - 800;
        g.lastSpellCastTime = 0;
        out.fly = g.castLocalSpell('флайн', true);
        out.flying = g.flight.busy;
        return out;
    });
    assert.equal(r.none, null);
    assert.equal(r.cast, 'Levitation');
    assert.ok(r.held, 'the sword is lifted');
    assert.ok(r.floats, 'it floats');
    assert.ok(r.followed > 2, `it follows the hand (${r.followed.toFixed(2)} m)`);
    assert.ok(r.released, 'a jerk lets it go');
    assert.equal(r.shield, 'Protection');
    assert.ok(r.shieldVisible, 'blue shield visible in creative');
    assert.ok(r.shieldGone, 'gone after 3 s');
    assert.equal(r.domeNoT, null, 'Protection Maxima needs the T-pose');
    assert.equal(r.dome, 'ProtectionMaxima');
    assert.ok(r.domeVisible);
    assert.ok(r.domeLeft > 4.5, 'dome lasts 5 s');
    assert.equal(r.fly, 'Flight');
    assert.ok(r.flying);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('fire: Inferno sets a tree on fire, it spreads and burns down; adaptive graphics is on', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 300 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const THREE = window.__zns.THREE;
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const trees = g.world.trees;
        // a tree with a neighbour close by
        let t = null;
        for (const a of trees) if (trees.some((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < 8)) { t = a; break; }
        if (!t) t = trees[0];
        const origin = new THREE.Vector3(t.x + 10, 3, t.z);
        const dir = new THREE.Vector3(-1, 0.1, 0).normalize();
        g.spells.cast('Inferno', origin, dir, 'right', g.localId);
        await sleep(1500);
        const burning = !!t.burning;
        for (let i = 0; i < 300 && !t.burnt; i++) await sleep(100);
        const burntCount = trees.filter((x) => x.burnt || x.burning).length;
        return { burning, burnt: !!t.burnt, burntCount, quality: g.quality.current.name, fps: document.getElementById('fps-counter').innerText };
    });
    assert.ok(r.burning, 'the tree caught fire');
    assert.ok(r.burnt, 'and burnt down');
    assert.ok(r.burntCount >= 2, `the fire spread (${r.burntCount} trees)`);
    assert.ok(r.quality, 'graphics level chosen');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('book-birds: a spell knocks one down, the book is taken by hand, read, and goes into a slot', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const B = g.books;
        B._spawnT = 0;
        for (let i = 0; i < 400 && B.birds.size === 0; i++) await frames(1);
        const birds = B.birds.size;
        const b = [...B.birds.values()][0];
        // a Sapira-like ray straight at it
        const me = g.character.group.position;
        const o = me.clone().setY(me.y + 1.5);
        const d = b.model.position.clone().sub(o);
        const len = d.length();
        B.hitRay(o, d.normalize(), len + 1, 1);
        for (let i = 0; i < 600 && B.books.size === 0; i++) await frames(1);
        const books = B.books.size;
        const bk = [...B.books.values()][0];
        // bring the book to the hand
        const hand = g.character.getHandWorldPosition('right');
        bk.model.position.copy(hand);
        for (let i = 0; i < 100 && !B.inHand; i++) await frames(1);
        const inHand = !!B.inHand;
        // the right pocket puts it into a slot
        g.inventory.pocketRight();
        const slot = g.inventory.slots.find((s) => s && s.kind === 'book');
        return { birds, books, inHand, slot: !!slot, spells: slot?.spells?.length || 0, left: !!B.inHand };
    });
    assert.ok(r.birds > 0, 'a bird appeared');
    assert.equal(r.books, 1, 'it fell and became a book');
    assert.ok(r.inHand, 'the hand took the book');
    assert.ok(r.slot && r.spells >= 1, 'the book went into a slot with spells');
    assert.ok(!r.left, 'the hand is empty');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('deep lakes: swim with the legs or sink, air runs out, «Air Bubble», «Wave Attack» washes a zombie away', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const ch = g.character;
        // find a deep lake
        let spot = null;
        for (let rad = 110; rad < 900 && !spot; rad += 12) {
            for (let a = 0; a < 64 && !spot; a++) {
                const x = Math.cos(a / 64 * Math.PI * 2) * rad, z = Math.sin(a / 64 * Math.PI * 2) * rad;
                g.terrain.data.ensure?.(Math.round(x), Math.round(z));
                const w = g.swim.waterAt(x, z);
                if (w && w.depth >= 5) spot = { x, z, w };
            }
        }
        if (!spot) return { noLake: true };
        ch.group.position.set(spot.x, spot.w.surface + 1, spot.z);
        g.currentPose = null; // no legs moving
        const y0 = ch.group.position.y;
        await frames(60);
        const sank = y0 - ch.group.position.y;
        const swimming = g.swim.swimming;
        const air0 = g.swim.air;
        // legs moving: floats up
        g.swim.kick = 1;
        const yLow = ch.group.position.y;
        for (let i = 0; i < 40; i++) { g.swim.kick = 1; await frames(1); }
        const rose = ch.group.position.y - yLow;
        // air bubble needs the hands at the head (forced here)
        ch.isTPose = () => true;
        g.combat.fatigue = 30;
        const bubble = g.castLocalSpell('Air Bubble Maxima', true);
        const hasBubble = !!g.swim.bubble;
        // a zombie on the shore, a wave from the lake
        ch.group.position.set(spot.x, spot.w.surface + 3, spot.z);
        const z = g._createZombie(new window.__zns.THREE.Vector3(spot.x + 8, g.collision.groundY(spot.x + 8, spot.z), spot.z));
        const zx0 = z.group.position.x;
        g.spells.cast('WaveAttack', new window.__zns.THREE.Vector3(spot.x, spot.w.surface, spot.z), new window.__zns.THREE.Vector3(8, 0, 0), 'right', g.localId);
        let zMoved = -99;
        for (let i = 0; i < 40; i++) { await frames(1); zMoved = Math.max(zMoved, z.group.position.x - zx0); }
        return { sank, swimming, air0, rose, bubble, hasBubble, zMoved, hp: g.playerHP };
    });
    if (r.noLake) { assert.fail('no deep lake found near spawn'); }
    assert.ok(r.swimming, 'in deep water the hero swims');
    assert.ok(r.sank > 0.5, `without moving the legs the hero sinks (${r.sank.toFixed(2)})`);
    assert.ok(r.air0 < 20, `under water the air goes down (${r.air0.toFixed(1)})`);
    assert.ok(r.rose > 0.5, `moving the legs lifts the hero (${r.rose.toFixed(2)})`);
    assert.equal(r.bubble, 'AirBubbleMaxima');
    assert.ok(r.hasBubble, 'a bubble of air');
    assert.ok(r.zMoved > 2, `the wave washed the zombie away (${r.zMoved.toFixed(1)} m)`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('worlds save themselves: built blocks and the inventory are there after «Продолжить»', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await page.evaluate(async () => { const m = await import('/src/game/WorldSave.js'); for (const w of await m.listWorlds()) await m.deleteWorld(w.id); });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const before = await page.evaluate(async () => {
        const g = window.__zns.game;
        const p = g.character.group.position;
        const cell = { x: Math.round(p.x) + 4, L: Math.floor(p.y + 1.5) + 2, z: Math.round(p.z) };
        g.builder.applyEdits([[cell.x, cell.L, cell.z, 3]]);
        g.inventory.addResource(3, 42);
        g.books.learned.add('CreateWall');
        await g.keeper.save();
        return { cell, seed: g.seed, block: g.terrain.data.get(cell.x, cell.L, cell.z) };
    });
    assert.equal(before.block, 3, 'a stone block was built');
    // back to the menu (a new page), the world is in «Мои миры»
    await page.reload();
    await page.waitForFunction(() => !!window.__zns);
    await page.waitForSelector('.world-row .world-play', { timeout: 20000 });
    await page.click('.world-row .world-play');
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 90000 });
    const after = await page.evaluate((c) => {
        const g = window.__zns.game;
        const st = g.inventory.slots.find((s) => s && s.kind === 'res' && s.block === 3);
        return { seed: g.seed, block: g.terrain.data.get(c.x, c.L, c.z), stone: st ? st.count : 0, learned: g.books.learned.has('CreateWall') };
    }, before.cell);
    assert.equal(after.seed, before.seed, 'the same world');
    assert.equal(after.block, 3, 'the built block is still there');
    assert.equal(after.stone, 42, 'the stone is in the slot');
    assert.ok(after.learned, 'the learned spell is remembered');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('caves and loot: a chest in a cave chamber, wands / scrolls / backpacks, «Раскрой свои секреты», Люмос, eating', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const ch = g.character;
        // the nearest cave
        let cave = null;
        for (let rad = 200; rad <= 1600 && !cave; rad += 200) cave = g.terrain.data.cavesNear(0, 0, rad).sort((a, b) => Math.hypot(a.kx, a.kz) - Math.hypot(b.kx, b.kz))[0];
        if (!cave) return { noCave: true };
        // walk in: stand at the entrance, then inside the chamber (under the rock)
        ch.group.position.set(cave.kx + 2, cave.F + 1.6, cave.kz + 2);
        await frames(40);
        const p = ch.group.position;
        const floorOk = Math.abs((p.y - 2.0) - (cave.F - 0.5)) < 0.6; // standing on the cave floor, not on the mountain
        const dark = g._caveK;
        const chest = g.chests.find((c) => c.id === cave.id);
        for (let i = 0; i < 100 && chest && !chest.isOpen; i++) await frames(1);
        await frames(20);
        const loot = g.items.loose.size + g.weapons.weapons.filter((w) => w.hover && w.position.distanceTo(chest.getPosition()) < 5).length;
        // a wand in the hand, a thing lying next to it
        const wand = { kind: 'wand', uid: 'tw1', model: 3, color: 0x44aaff, dir: 'destroy', fav: 'Bombardo', power: 20 };
        g.items.takeIntoHand(wand, 'right');
        const scroll = { kind: 'scroll', uid: 'ts1', stat: 'fatigue', amount: 7 };
        g.items.takeIntoHand(scroll, 'left');
        const pw = g.wandMagic.power('BombardoMaxima');
        g.wandMagic.reveal();
        const holo = !!g.wandMagic.holo;
        await frames(5);
        g.combat.fatigue = 30;
        const lumos = g.castLocalSpell('Люмос Максима', true);
        await frames(3);
        const light = g.wandMagic.lights[0].intensity;
        // burn the scroll: max strength +7
        const maxF0 = g.combat.maxFatigue || 30;
        g.castLocalSpell('Инферно', true);
        const maxF1 = g.combat.maxFatigue;
        // eat an apple (hold it to the mouth)
        g.playerHP = 5;
        g.items.takeIntoHand({ kind: 'apple', uid: 'ta1', count: 1 }, 'left');
        // (no camera here: hold it at the mouth by hand)
        for (let i = 0; i < 20 && g.items.held.left; i++) {
            g.items.held.left.model.position.copy(ch.head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, -0.25, 0)));
            g.items._eat(0.1, ch);
        }
        const hpAfter = g.playerHP;
        // pocket the wand
        g.inventory.pocketRight();
        const inSlot = g.inventory.slots.some((s) => s && s.kind === 'wand');
        return { floorOk, dark, chest: !!chest, opened: chest?.isOpen, loot, pw, holo, lumos, light, maxF0, maxF1, hpAfter, inSlot, y: p.y, F: cave.F };
    });
    if (r.noCave) assert.fail('no cave found');
    assert.ok(r.floorOk, `standing on the cave floor (y ${r.y}, floor ${r.F})`);
    assert.ok(r.dark > 0.3, `dark in the cave (${r.dark})`);
    assert.ok(r.chest && r.opened, 'a chest in the cave opens');
    assert.ok(r.loot >= 1, 'loot floats out of it');
    assert.ok(r.pw > 2, `a destruction wand favouring Bombardo makes Bombardo Maxima much stronger (×${r.pw.toFixed(2)})`);
    assert.ok(r.holo, 'a hologram tells the secrets');
    assert.equal(r.lumos, 'LumosMaxima');
    assert.ok(r.light > 1, 'light at the tip');
    assert.equal(r.maxF1, r.maxF0 + 7, 'the burnt scroll gave +7 strength');
    assert.ok(r.hpAfter >= 15, `the apple healed (+10): ${r.hpAfter}`);
    assert.ok(r.inSlot, 'the wand went into a slot');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('gear: bows and shields on creative pedestals, an arrow hits a zombie, shields stop spells and break, Thor\'s hammer in a storm', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const ch = g.character;
        const onPedestals = [...g.items.loose.values()].filter((L) => L.hover).map((L) => L.item.kind);
        // an arrow: from the hero to a zombie 10 m ahead
        const p = ch.group.position;
        const z = g._createZombie(new T.Vector3(p.x, g.collision.groundY(p.x, p.z - 10), p.z - 10));
        z.setSleeping?.(true);
        const hp0 = z.hp;
        const from = new T.Vector3(p.x, z.group.position.y + 0.6, p.z - 1.5);
        g.gear.fire(from, new T.Vector3(0, 0.4, -40), 5, g.localId);
        for (let i = 0; i < 40; i++) await frames(1);
        const zHit = z.hp < hp0 || z.isDead;
        const stuck = g.gear.arrows.some((a) => a.stuck);
        // shields: a magic one takes spells (strength goes down), a wooden one breaks under a strong spell
        g.combat.enabled = true;
        g.items.takeIntoHand({ kind: 'shield', uid: 'tsm', type: 2, magic: true, max: 40 }, 'left');
        await frames(2);
        const front = ch.group.position.clone().add(new T.Vector3(-Math.sin(ch.group.rotation.y) * 8, 1, -Math.cos(ch.group.rotation.y) * 8));
        const hpBefore = g.combat.hp;
        const hit1 = g.combat.hitBySpell('Sapira', front, 'enemy');
        const magicLeft = g.gear.shieldPower.get('tsm');
        g.items.releaseHand('left');
        g.items.takeIntoHand({ kind: 'shield', uid: 'tsw', type: 0, magic: false, max: 0 }, 'left');
        await frames(2);
        g.combat.hitBySpell('Thunderwave', front, 'enemy');
        const woodenBroke = !g.items.held.left;
        const hpAfter = g.combat.hp;
        g.combat.enabled = false;
        // Thor's hammer: only in a storm, raised above the head
        g.items.takeIntoHand({ kind: 'hammer', uid: 'th', charges: 0 }, 'right');
        g.storm.start(null, 60);
        for (let i = 0; i < 80 && g.storm.k < 0.6; i++) await frames(1);
        const hm = g.items.held.right;
        hm.model.position.copy(ch.head.getWorldPosition(new T.Vector3())).add(new T.Vector3(0, 0.8, 0));
        g.gear._updateHammer(0.016);
        const charged = !!(g.lightning && g.lightning.hammer);
        g.lightning.t = 5.1;
        const hpH = g.playerHP;
        g._updateLightning(0.016);
        return { onPedestals, zHit, stuck, hit1, magicLeft, woodenBroke, hpBefore, hpAfter, charged, failed: g.gear.hammer.failed, hpH, hpH2: g.playerHP };
    });
    assert.ok(r.onPedestals.filter((k) => k === 'bow').length === 3 && r.onPedestals.filter((k) => k === 'shield').length === 3, 'three bows and three shields on pedestals: ' + r.onPedestals);
    assert.ok(r.zHit, 'the arrow hurt the zombie');
    assert.ok(r.stuck, 'the arrow got stuck');
    assert.equal(r.hit1, false, 'the magic shield stopped the spell');
    assert.ok(r.magicLeft < 40, `its strength went down (${r.magicLeft})`);
    assert.ok(r.woodenBroke, 'a wooden shield breaks under a strong spell');
    assert.equal(r.hpAfter, r.hpBefore, 'no damage through the shields');
    assert.ok(r.charged, 'lightning struck the raised hammer');
    assert.ok(r.failed, 'a missed hammer lightning is lost till the next storm');
    assert.equal(r.hpH2, r.hpH, 'the hammer never hurts its holder');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('«Левиоса» + «Атак»: the floating sword flies into a zombie and sticks; blood; «Rescue» stops my bleeding', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const w = g.weapons.byId.get('tS');
        const p = w.position.clone();
        const z = g._createZombie(new T.Vector3(p.x + 6, g.collision.groundY(p.x + 6, p.z), p.z));
        z.setSleeping?.(true);
        z.health = 60;
        const hp0 = z.health;
        w.hover = null;
        w.attach({ levitate: true, side: null });
        g.levitation.state = { kind: 'weapon', obj: w, side: 'right', hold: 3, target: w.position.clone(), age: 0, history: [], handQ0: new T.Quaternion(), objQ0: w.quaternion.clone() };
        const said = g.castLocalSpell('Атак', true);
        for (let i = 0; i < 60 && !w.stuckIn; i++) await frames(1);
        const stuck = !!w.stuckIn;
        const hp1 = z.health;
        await new Promise((res) => setTimeout(res, 2500));
        const hp2 = z.isDead ? -1 : z.health;
        // my own bleeding (in creative nobody bleeds): switch to a survival-like check
        g.config.mode = 'survival';
        g.playerHP = 20;
        g.bleeding.start(1);
        await new Promise((res) => setTimeout(res, 5000));
        const bled = g.playerHP;
        const c0 = g.combat.center.bind(g.combat);
        g.combat.center = (out) => g.character.getHandWorldPosition('right', out || new T.Vector3());
        const res = g.bleeding.rescue(true);
        g.combat.center = c0;
        await new Promise((res2) => setTimeout(res2, 1500));
        return { said, stuck, hp0, hp1, hp2, bled, res, after: g.playerHP, rate: g.bleeding.rate };
    });
    assert.equal(r.said, 'Attack');
    assert.ok(r.stuck, 'the sword stuck in the zombie');
    assert.ok(r.hp1 < r.hp0, `it hurt the zombie (${r.hp0} → ${r.hp1})`);
    assert.ok(r.hp2 === -1 || r.hp2 < r.hp1, `the zombie bleeds (${r.hp1} → ${r.hp2})`);
    assert.ok(r.bled <= 18, `I bleed about 1 HP a second (20 → ${r.bled} in ~5 s of slow test frames)`);
    assert.equal(r.res, 'Rescue');
    assert.equal(r.rate, 0, 'Rescue stopped it');
    assert.equal(r.after, r.bled, 'no more blood lost after Rescue');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('animals: herds graze, fight back or flee, sheep together; carcass, meat, Inferno cooks it; horses: apples, mount, ride; golden apple trees', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const A = g.animals;
        const me = g.character.group.position;
        const at = (dx, dz) => new T.Vector3(me.x + dx, g.collision.groundY(me.x + dx, me.z + dz) + 0.5, me.z + dz);
        // a cow, a flock of sheep, a horse
        const cow = A._spawn('cow', at(6, 0));
        const flock = [0, 1, 2, 3, 4].map((i) => A._spawn('sheep', at(-8 + i, 6)));
        const horse = A._spawn('horse', at(0, -5), { bonus: 20 });
        await frames(10);
        // hit a sheep: the flock reacts
        A.hit(flock[0], 1, new T.Vector3(1, 0, 0), g.localId);
        const flockAngry = flock.filter((s) => s.state === 'attack').length;
        // kill the cow with fire: a cooked carcass with meat
        for (let i = 0; i < 20 && !cow.dead; i++) { cow.damageCooldown = 0; A.burnAlong(me.clone().setY(cow.group.position.y), new T.Vector3(1, 0, 0), 12); }
        const cowDead = cow.dead, cooked = cow.cooked, meat0 = cow.meat;
        A._takeMeat(cow, g.localId, 'right');
        const inHand = g.items.held.right?.item.kind;
        // «Gather» the rest
        const got = A.gatherAt(me.clone().setY(cow.group.position.y + 0.5), new T.Vector3().subVectors(cow.group.position, me).setY(0).normalize());
        const steaks = g.inventory.slots.filter((s) => s && s.kind === 'steak').reduce((n, s) => n + (s.count || 1), 0);
        const bones = !!cow.bones;
        // a horse: 3 golden apples, then a jump next to it
        horse.apples = 3;
        g.character.group.position.copy(horse.group.position).add(new T.Vector3(1, 1.5, 0));
        const rnd = Math.random; Math.random = () => 0.5; A.tryMount(); Math.random = rnd;
        const riding = A.riding === horse;
        const hx0 = horse.group.position.clone();
        g.character.isRunning = true; g.character.runIntensity = 1;
        for (let i = 0; i < 10; i++) A._ride(0.1);
        const rode = horse.group.position.distanceTo(hx0);
        g.character.isRunning = false;
        A.dismount();
        // a golden tree somewhere: pick an apple
        let tree = null;
        for (let k = 0; k < 40 && !tree; k++) { A._treesAround(new T.Vector3((k % 7 - 3) * 110, 0, (Math.floor(k / 7) - 3) * 110)); tree = [...A.trees.values()].find((t) => t); }
        let apple = false;
        if (tree) { g.items.releaseHand('left'); A._pickApple(tree, 0, g.localId, 'left'); apple = g.items.held.left?.item.kind === 'apple'; }
        return { flockAngry, cowDead, cooked, meat0, inHand, got, steaks, bones, riding, rode, tamed: horse.tamed, tree: !!tree, apple };
    });
    assert.ok(r.flockAngry >= 1, `the flock stands up for the sheep (${r.flockAngry})`);
    assert.ok(r.cowDead && r.cooked, 'the cow burnt — cooked');
    assert.equal(r.meat0, 4, 'a cow gives 4 pieces');
    assert.equal(r.inHand, 'steak', 'a steak taken by hand');
    assert.ok(r.got && r.got.includes('3'), 'Gather took the rest: ' + r.got);
    assert.ok(r.steaks >= 3, `steaks in the slots (${r.steaks})`);
    assert.ok(r.bones, 'only bones are left');
    assert.ok(r.riding, 'on the horse after 3 apples');
    assert.ok(r.rode > 5, `the horse carried me (${r.rode.toFixed(1)} m in 1 s)`);
    assert.ok(r.tamed, 'the horse is tamed');
    assert.ok(r.tree && r.apple, 'a golden apple picked from a golden tree');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
