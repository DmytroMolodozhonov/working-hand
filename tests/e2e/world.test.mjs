/**
 * Endless world, rivers/lakes and water bending — in a real browser.
 * Run: npm run test:e2e
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = 8155;
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
