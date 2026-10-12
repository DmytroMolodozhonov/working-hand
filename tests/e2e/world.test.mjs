/**
 * Endless world, rivers/lakes and water bending — in a real browser.
 * Run: npm run test:e2e
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

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
        for (let i = 0; i < 300 && t._queue.length; i++) await new Promise((res) => setTimeout(res, 100));
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
        // (a river, not the sea — a creative world has one by its sea castle)
        for (let x = 140; x < 900 && !spot; x += 3) for (let z = -300; z < 300; z += 3) if (t.get(x, 0, z) === 8 && t.get(x + 1, 0, z) === 8 && !t.isSeaColumn(x, z) && !t.isSeaColumn(x + 1, z)) { spot = { x, z }; break; }
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
        // «Frozen» without a water ball is «Айс»: a duel charge from the raised hand
        await sleep(4200); // later, without water, «Frozen» is «Айс» again
        g.lastMagicTime = Date.now();
        g.lastSpellCastTime = 0;
        ch.isArmRaised = () => true; // (no camera here: the hand is raised)
        out.iceBeam = await say('frozen');
        out.iceBolt = [...g.duel.bolts.values()].some((b) => b.spell === 'IceDuel');
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
    assert.ok(r.iceBolt, '«Айс» flies as a duel charge');
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
        // A sharp jerk of the hand lets go (after the short grace time)
        for (let i = 0; i < 50 && g.levitation.state && g.levitation.state.age < 0.9; i++) await sleep(100);
        const s = g.levitation.state;
        s.history.unshift({ t: g.levitation._t, x: 50, y: 0, z: 0 });
        s.history.length = 1;
        await sleep(400);
        out.released = !g.levitation.active && !w.holder;
        // Shields: visible in creative, dome needs a T-pose
        g._lastShieldCast = 0;
        out.shield = g.castLocalSpell('protection', true);
        // (wait for drawn frames, not for a time: a busy machine draws slowly)
        for (let i = 0; i < 60 && !g.combat.visuals.hand.visible; i++) await sleep(100);
        out.shieldVisible = g.combat.visuals.hand.visible;
        await sleep(3500);
        out.shieldHolds = g.combat.visuals.hand.visible; // (no longer a 3-second shield: it holds)
        out.stop = g.castLocalSpell('стоп', true);
        await sleep(300);
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
    assert.ok(r.shieldHolds, 'it holds past 3 s');
    assert.equal(r.stop, 'Stop');
    assert.ok(r.shieldGone, '«стоп» put it out');
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
        g.spells.cast('Inferno', origin, dir, 'right', 'a-wizard'); // (a caster with no hand here: the stream stays where it was cast)
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
        // the other hand takes the cover; the hands apart open it (the hands as the test moves them;
        // the whole hand mechanics is in book.test.mjs)
        const T = window.__zns.THREE, ch = g.character;
        const RD = B.reading, m = B.inHand.model;
        const own = B.inHand.side, oth = own === 'right' ? 'left' : 'right';
        const fwd = new T.Vector3(0, 0, -1).applyQuaternion(ch.group.quaternion), across = new T.Vector3(1, 0, 0).applyQuaternion(ch.group.quaternion);
        const C = ch.group.position.clone().addScaledVector(fwd, 1.4).setY(ch.group.position.y + 1.0);
        const H = { [own]: { G: m.position.clone(), curl: 0.9, tip: null, up: true }, [oth]: { G: m.position.clone(), curl: 0.9, tip: null, up: true } };
        RD.input = (s) => H[s];
        await frames(12);
        H.left.G.copy(C).addScaledVector(across, -0.8); H.right.G.copy(C).addScaledVector(across, 0.8);
        await frames(30);
        const cam = g.camera.position.clone();
        const n = new T.Vector3(0, 0, 1).applyQuaternion(m.getWorldQuaternion(new T.Quaternion()));
        const facing = n.dot(cam.clone().sub(m.position).normalize());
        const open = { phi: RD.s?.phi || 0, facing, camDist: cam.distanceTo(m.position), map: !!m.userData.book.faceR.material.map };
        // a hand lets go, the arm holding it goes down: it closes in that fist
        H[oth].curl = 0;
        await frames(20);
        H[own].up = false;
        for (let i = 0; i < 80 && RD.s; i++) await frames(1);
        const closed = { read: !!RD.s, size: m.scale.x, phi: m.userData.book.phi };
        RD.input = null;
        // a throw: it flies, lands flat, and a hand takes it again
        const side = B.inHand.side;
        g.items._throw(side, new T.Vector3(0, 3, -4));
        const L = [...g.items.loose.values()].find((x) => x.item.kind === 'book');
        for (let i = 0; i < 200 && L && !L.rest; i++) await frames(1);
        const thrown = { loose: !!L, rest: !!L?.rest, empty: !B.inHand };
        // the right pocket puts the book (in the hand again) into a slot
        g.items._gotItem(g.items.removeLoose(L.item.uid), 'right');
        g.inventory.pocketRight();
        const slot = g.inventory.slots.find((s) => s && s.kind === 'book');
        return { birds, books, inHand, open, closed, thrown, slot: !!slot, spells: slot?.spells?.length || 0, left: !!B.inHand };
    });
    assert.ok(r.open.phi > 2.5, `opened between the hands ` + JSON.stringify(r.open));
    assert.ok(r.open.facing > 0.7, `the pages look at the camera (${r.open.facing.toFixed(2)})`);
    assert.ok(r.open.camDist < 6, `the camera came to the pages (${r.open.camDist.toFixed(1)} m)`);
    assert.ok(r.open.map, 'the spread is drawn on the pages');
    assert.ok(!r.closed.read && r.closed.phi === 0 && r.closed.size < 2, 'hands down: closed in the fist ' + JSON.stringify(r.closed));
    assert.ok(r.thrown.loose && r.thrown.rest && r.thrown.empty, 'thrown, it lies on the ground ' + JSON.stringify(r.thrown));
    assert.ok(r.birds > 0, 'a bird appeared');
    assert.equal(r.books, 1, 'it fell and became a book');
    assert.ok(r.inHand, 'the hand took the book');
    assert.ok(r.slot && r.spells >= 1, 'the book went into a slot with spells');
    assert.ok(!r.left, 'the hand is empty');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('deep lakes: afloat without strokes, air runs out under water, «Air Bubble», «Wave Attack» washes a zombie away', async () => {
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
        g.currentPose = null; // no arms stroking
        const y0 = ch.group.position.y;
        await frames(60);
        const sank = y0 - ch.group.position.y;
        const swimming = g.swim.swimming;
        const afloat = !g.swim.underwater; // (no strokes: treading water, the head above it)
        // dived under: the air goes down, and without strokes the body floats up
        g.swim.y = ch.group.position.y = spot.w.surface - 3.5; g.swim.atTop = false;
        const yLow = g.swim.y;
        await frames(40);
        const air0 = g.swim.air;
        const rose = g.swim.y - yLow;
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
        // (a real wave: it rolls at ~6.5 m/s, not at once)
        for (let i = 0; i < 160 && zMoved <= 2; i++) { await frames(1); zMoved = Math.max(zMoved, z.group.position.x - zx0); }
        return { sank, swimming, afloat, air0, rose, bubble, hasBubble, zMoved, hp: g.playerHP };
    });
    if (r.noLake) { assert.fail('no deep lake found near spawn'); }
    assert.ok(r.swimming, 'in deep water the hero swims');
    assert.ok(r.sank > 0.5 && r.afloat, `fallen in, the hero floats with the head above the water (${r.sank.toFixed(2)})`);
    assert.ok(r.air0 < 20, `under water the air goes down (${r.air0.toFixed(1)})`);
    assert.ok(r.rose > 0.3, `under water the body floats up (${r.rose.toFixed(2)})`);
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

test('saved worlds menu: each world shows its game version; deleting asks in the game\'s own row (no browser dialog), «Нет» keeps it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    const ver = await page.evaluate(async () => (await (await fetch('/api/version')).json()));
    await page.evaluate(async (ver) => {
        const m = await import('/src/game/WorldSave.js');
        for (const w of await m.listWorlds()) await m.deleteWorld(w.id);
        const now = Date.now();
        await m.putWorld({ id: 'wA', name: 'Первый', mode: 'creative', seed: 1, created: now, updated: now, version: { date: ver.date, sha: ver.sha }, players: {} });
        await m.putWorld({ id: 'wB', name: 'Второй', mode: 'survival', seed: 2, created: now - 5, updated: now - 5, players: {} }); // (saved before versions were kept)
    }, ver);
    await page.reload();
    await page.waitForFunction(() => !!window.__zns);
    await page.waitForFunction(() => document.querySelectorAll('.world-row').length === 2 && document.querySelector('.world-row .world-ver')?.textContent.includes('версия'), null, { timeout: 20000 });
    const vers = await page.$$eval('.world-row', (rows) => rows.map((r) => ({ id: r.dataset.id, text: r.querySelector('.world-ver').textContent, old: r.querySelector('.world-ver').classList.contains('old') })));
    const a = vers.find((v) => v.id === 'wA'), b = vers.find((v) => v.id === 'wB');
    if (ver.date) assert.ok(a.text.includes(ver.date), 'the version the world was saved by: ' + a.text);
    assert.equal(a.old, false, 'saved by this version');
    assert.match(b.text, /неизвестна/);
    assert.equal(b.old, true, 'an old save is marked');
    const count = () => page.evaluate(async () => (await (await import('/src/game/WorldSave.js')).listWorlds()).length);
    // 🗑 asks first, right in the row
    await page.click('.world-row[data-id="wA"] .world-del');
    assert.ok(await page.isVisible('.world-row[data-id="wA"] .world-confirm'), 'the question is shown');
    assert.equal(await page.isVisible('.world-row[data-id="wA"] .world-play'), false, 'the row only asks now');
    assert.equal(await page.locator('.world-row').count(), 2);
    assert.equal(await count(), 2, 'nothing deleted yet');
    // «Нет» keeps it
    await page.click('.world-row[data-id="wA"] .world-del-no');
    assert.equal(await page.isVisible('.world-row[data-id="wA"] .world-confirm'), false);
    assert.ok(await page.isVisible('.world-row[data-id="wA"] .world-play'));
    assert.equal(await count(), 2);
    // «Да, удалить» deletes just that one
    await page.click('.world-row[data-id="wA"] .world-del');
    await page.click('.world-row[data-id="wA"] .world-del-yes');
    await page.waitForFunction(() => document.querySelectorAll('.world-row').length === 1, null, { timeout: 10000 });
    assert.equal(await page.getAttribute('.world-row', 'data-id'), 'wB', 'the other world is still there');
    assert.equal(await count(), 1);
    assert.deepEqual(realErrors(errors), [], 'no browser dialogs');
    await page.evaluate(async () => { const m = await import('/src/game/WorldSave.js'); for (const w of await m.listWorlds()) await m.deleteWorld(w.id); });
    await page.close();
});

test('«Бомбардо Максима» into a tree crown bursts in the leaves (not 50 m past the tree) and the tree is gone', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const p = g.character.group.position;
        const trees = g.world.trees.filter((t) => t.alive && t.crown);
        trees.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        // a tree and a side to shoot from with no other tree on the way
        let tree = null, from = null;
        for (const t of trees) {
            for (let k = 0; k < 8 && !from; k++) {
                const a = (k / 8) * Math.PI * 2, o = new T.Vector3(t.x + Math.cos(a) * 9, 8.2, t.z + Math.sin(a) * 9);
                const clear = trees.every((u) => {
                    if (u === t) return true;
                    const ax = o.x, az = o.z, bx = t.x - ax, bz = t.z - az, L2 = bx * bx + bz * bz;
                    const q = Math.max(0, Math.min(1, ((u.x - ax) * bx + (u.z - az) * bz) / L2));
                    return Math.hypot(u.x - (ax + bx * q), u.z - (az + bz * q)) > 5;
                });
                if (clear && !g.terrain?.data?.get?.(Math.round(o.x), Math.floor(o.y), Math.round(o.z))) from = o;
            }
            if (from) { tree = t; break; }
        }
        const n0 = g.explosions.length;
        const dir = new T.Vector3(tree.x - from.x, 0, tree.z - from.z).normalize();
        g.spells.cast('BombardoMaxima', from, dir, 'right', 'local');
        const t0 = performance.now();
        while (g.explosions.length === n0 && performance.now() - t0 < 8000) await frames(1);
        const e = g.explosions[n0];
        return { found: !!tree, blast: e ? Math.hypot(e.p[0] - tree.x, e.p[2] - tree.z) : null, y: e?.p[1], alive: tree.alive };
    });
    assert.ok(r.found, 'a start-area tree to shoot at');
    assert.ok(r.blast != null && r.blast < 4.5, 'the orb burst in the crown, by the tree ' + JSON.stringify(r));
    assert.equal(r.alive, false, 'the tree is blown away');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('«Даст»: a sandy duel charge flies at the zombie the raised hand points at and slows it down for 5 s', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const raw = frame({ arms: 'forward', wristOffset: [0, 0.05] });
    await page.evaluate((raw) => {
        window.__dustPose = setInterval(() => window.__zns.poseService.injectRaw({ ...JSON.parse(JSON.stringify(raw)), ts: performance.now() }), 33);
    }, raw);
    await page.waitForFunction(() => window.__zns.game.character.isArmRaised('right'), null, { timeout: 20000 });
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const ahead = () => {
            const o = g.castOrigin('right', new T.Vector3());
            const d = ch.getPointingDirection('right', new T.Vector3());
            const p = new T.Vector3();
            for (let t = 3; t < 25; t += 0.1) { p.copy(o).addScaledVector(d, t); if (p.y < g.collision.groundY(p.x, p.z) + 1) break; }
            return new T.Vector3(p.x, g.collision.groundY(p.x, p.z), p.z);
        };
        const z = g._createZombie(ahead());
        z.setSleeping(true);
        await frames(30);
        z.group.position.copy(ahead());
        g.lastSpellCastTime = 0; g._lastDuelCast = 0;
        const aim = g.duel.pickSide(false);
        const cast = g.castLocalSpell('даст', true);
        const bolts = [...g.duel.bolts.values()].map((b) => b.spell);
        const t0 = performance.now();
        while (!(z.slowT > 0) && performance.now() - t0 < 10000) await frames(1);
        const slowT = z.slowT || 0;
        return { cast, bolts, aimed: aim?.t.kind === 'z' && aim.t.id === z.id, slowT, factor: z.slowT > 0 ? z.speed * 0.4 / z.baseSpeed : 1, alive: !z.isDead, log: g.duel.log.slice(-4) };
    });
    await page.evaluate(() => clearInterval(window.__dustPose));
    assert.equal(r.cast, 'Sands');
    assert.deepEqual(r.bolts, ['SandsDuel'], 'a duel charge flew');
    assert.ok(r.slowT > 4, 'the zombie is slowed for ~5 s: ' + JSON.stringify(r));
    assert.ok(r.factor < 0.5, 'it moves at less than half its speed');
    assert.ok(r.alive, 'Dust slows, it does not kill');
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
        for (let rad = 200; rad <= 1600 && !cave; rad += 200) cave = g.terrain.data.cavesNear(0, 0, rad).filter((c) => !c.chests || c.chests[0]?.main).sort((a, b) => Math.hypot(a.kx, a.kz) - Math.hypot(b.kx, b.kz))[0]; // (the nearest with a chest in its main chamber)
        if (!cave) return { noCave: true };
        // walk in: stand at the entrance, then inside the chamber (under the rock)
        ch.group.position.set(cave.kx + 0.5, cave.F + 1.6, cave.kz + 1.5); // (in the middle of the chamber, under the rock)
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
        g.lightning.t = 8.1;
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
        for (let i = 0; i < 80 && !z.isDead && z.health >= hp1; i++) await frames(1); // (game time: slow test machines)
        const hp2 = z.isDead ? -1 : z.health;
        // my own bleeding (in creative nobody bleeds): switch to a survival-like check
        g.config.mode = 'survival';
        g.playerHP = 20;
        g.bleeding.start(1);
        for (let i = 0; i < 200 && g.playerHP > 18; i++) await frames(1);
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

test('doors: «Create a Door» from wood in the hand, «Stand», a closed door blocks, open by the handle, carried by «Левиоса»', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        g.inventory.addResource(6, 20); // oak
        const slot = g.inventory.slots.findIndex((s) => s && s.kind === 'res' && s.block === 6);
        g.inventory.select(slot);
        const said = g.castLocalSpell('Create a Door', true);
        const making = !!g.doors.making;
        await frames(3);
        const me = g.character.group.position;
        const yaw = g.character.group.rotation.y;
        const at = { x: me.x - Math.sin(yaw) * 5, z: me.z - Math.cos(yaw) * 5 };
        g.doors.making.ok = true; g.doors.making.at.set(at.x, g.collision.groundY(at.x, at.z), at.z);
        const stood = g.castLocalSpell('Stand', true);
        const door = [...g.doors.list.values()][0];
        const woodLeft = g.inventory.slots[slot]?.count;
        const blocked = g.collision.pointBlocked(door.x, door.y + 1.5, door.z);
        g.doors._setAngle(door, 1.3);
        const openFree = !g.collision.pointBlocked(door.x, door.y + 1.5, door.z);
        g.doors._setAngle(door, 0);
        const lifted = g.doors.tryLift('right') || (() => { g.doors.carried = { door, side: 'right' }; door.lifted = true; return true; })();
        await frames(5);
        g.doors._putDown();
        return { said, making, stood, doors: g.doors.list.size, woodLeft, blocked, openFree, lifted, carriedAfter: !!g.doors.carried };
    });
    assert.equal(r.said, 'CreateDoor');
    assert.ok(r.making, 'a small door in the hand');
    assert.equal(r.stood, 'Stand');
    assert.equal(r.doors, 1, 'a door stands');
    assert.equal(r.woodLeft, 20, 'creative: no wood used up (building is free there)');
    assert.ok(r.blocked, 'a closed door blocks the way');
    assert.ok(r.openFree, 'an open door lets you through');
    assert.ok(r.lifted && !r.carriedAfter, 'Levitation carries it and puts it down');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('«Breakthrough»: arms low, then up — a wall of earth and stone rises in front', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const hint = g.castLocalSpell('breakthrough', true); // arms not low → a hint, nothing happens
        g._bt.lowAt = performance.now() - 500;
        g._bt.riseAt = performance.now();
        const said = g.castLocalSpell('breakthrough maxima', true);
        for (let i = 0; i < 40 && g._bt.rising; i++) await frames(1);
        const ch = g.character;
        const yaw = ch.group.rotation.y;
        const x = Math.round(ch.group.position.x - Math.sin(yaw) * 4), z = Math.round(ch.group.position.z - Math.cos(yaw) * 4);
        const base = g.terrain.data.floorBelow(x, z, 40);
        let tall = 0;
        for (let L = 0; L < 8; L++) if (g.terrain.data.get(x, L + 1, z) === 3 || g.terrain.data.get(x, L + 1, z) === 2) tall++;
        return { hint, said, tall, top: base };
    });
    assert.equal(r.hint, null, 'no wall without the gesture');
    assert.equal(r.said, 'BreakthroughMaxima');
    assert.ok(r.tall >= 5, `a wall 5 blocks high (${r.tall})`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('the giant spider (twice as big): Avada only 25, ice and wind do nothing, poison −7, web, grab + bite, Protection Maxima frees, a wand when it dies', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const S = g.spiders;
        Object.defineProperty(g, 'isNight', { get: () => true }); // (it only comes at night)
        S._nightDone = true;
        const me = g.character.group.position;
        const sp = S.spawn(new T.Vector3(me.x + 12, g.collision.groundY(me.x + 12, me.z), me.z));
        sp.nextPoison = sp.nextWeb = sp.nextGrab = sp.nextAny = 999; // (tricks by hand below)
        await frames(5);
        const bar = document.getElementById('boss-bar').style.display;
        // twice as big as the first spider: ~8 m high, its body up at ~5 m
        const box = new T.Box3().setFromObject(sp.model).getSize(new T.Vector3());
        const tall = box.y, scale = sp.model.scale.x;
        const standY = sp.model.position.y - g.collision.groundY(sp.model.position.x, sp.model.position.z);
        // a duel charge touching its flank (3 m beside its middle) hits it
        const mid = sp.model.position.clone().add(new T.Vector3(0, 5.2, 0));
        const flankAvada = S.boltAt(mid.clone().add(new T.Vector3(3, 0, 0)), 'AvadaKedavra');
        sp.hp = 200;
        S.boltAt(sp.model.position.clone().add(new T.Vector3(0, 2, 0)), 'AvadaKedavra');
        const afterAvada = sp.hp;
        S.hit(sp, 30, 'Ice'); S.hit(sp, 30, 'Wind');
        const afterIce = sp.hp;
        // poison
        g.combat.hp = 20;
        S._fire('poison', sp.model.position.clone().add(new T.Vector3(0, 2, 0)), g.localId);
        for (let i = 0; i < 60 && S.shots.length; i++) await frames(1);
        const afterPoison = g.combat.hp;
        // web
        S._fire('web', sp.model.position.clone().add(new T.Vector3(0, 2, 0)), g.localId);
        for (let i = 0; i < 60 && S.shots.length; i++) await frames(1);
        const webbed = g.combat.immobile;
        S.webbed = 0;
        await frames(2);
        // grab + bite, then Protection Maxima
        g.combat.hp = 20;
        sp.holding = g.localId;
        S._seized(sp);
        const bitten = g.combat.hp;
        const held = !!S.held;
        S.onDome();
        const freed = !S.held;
        // kill it
        S.hit(sp, 500, 'melee');
        await frames(3);
        const wands = [...g.items.loose.values()].filter((L) => L.item.kind === 'wand').length;
        return { bar, tall, scale, standY, flankAvada, afterAvada, afterIce, afterPoison, webbed, bitten, held, freed, dead: sp.dead, wands };
    });
    assert.equal(r.bar, 'block', 'the boss bar shows');
    assert.equal(r.scale, 2, 'twice as big');
    assert.ok(r.tall > 7.5, `about 8 m high (${r.tall})`);
    assert.ok(r.standY > -0.5, `not sunk into the ground (${r.standY})`);
    assert.ok(r.flankAvada, 'a charge touching its big flank hits it');
    assert.equal(r.afterAvada, 175, 'Avada Kedavra takes only 25');
    assert.equal(r.afterIce, 175, 'ice and wind do nothing');
    assert.equal(r.afterPoison, 13, 'poison −7');
    assert.ok(r.webbed, 'the web holds you');
    assert.ok(r.held && r.bitten === 15, `seized and bitten −5 (${r.bitten})`);
    assert.ok(r.freed, 'Protection Maxima frees');
    assert.ok(r.dead && r.wands >= 1, 'it dies and leaves a wand');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('Lightning Strike: the bolt strikes into raised hands at once, a level hand fires it at a zombie; outside Creative only a burnt scroll teaches it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const ch = g.character;
        g.combat.fatigue = g.combat.maxFatigue ?? 30;
        ch.areBothHandsUp = () => true;
        const cast = g.castLocalSpell('lightning strike', true);
        // (counted in game time: headless frames are slow)
        let caughtIn = 0;
        const t0 = performance.now();
        while (g.lightning && g.lightning.phase === 'gather' && performance.now() - t0 < 8000) { caughtIn = g.lightning.t; await frames(1); }
        caughtIn = Math.round(caughtIn * 1000);
        const holding = g.lightning?.phase === 'hold';
        // a zombie straight where the hand points
        const hand = ch.getHandWorldPosition('right', new T.Vector3());
        const dir = ch.getHandDirection('right', new T.Vector3()).setY(0).normalize();
        const zp = hand.clone().addScaledVector(dir, 12);
        const z = g._createZombie(new T.Vector3(zp.x, g.collision.groundY(zp.x, zp.z), zp.z));
        z.setSleeping?.(true);
        const hp0 = z.hp;
        g._handLevel = (side, out) => { if (side !== 'right') return false; out.copy(z.group.position).add(new T.Vector3(0, 1.2, 0)).sub(ch.getHandWorldPosition('right', new T.Vector3())).normalize(); return true; };
        for (let i = 0; i < 40 && g.lightning; i++) await frames(1);
        await frames(3);
        const fired = !g.lightning;
        const zHit = z.isDead || z.hp < hp0;
        delete g._handLevel;
        // outside Creative it needs the scroll
        g.config.mode = 'survival';
        g.lastSpellCastTime = 0;
        const locked = g.castLocalSpell('lightning strike', true);
        const lockedTw = g.knowsSpell('Thunderwave');
        g.items.applyScroll({ kind: 'scroll', stat: 'spell', spell: 'LightningStrike' });
        g.combat.fatigue = g.combat.maxFatigue ?? 30;
        g.lastSpellCastTime = 0;
        const learnt = g.castLocalSpell('lightning strike', true);
        g.lightning = null;
        g.config.mode = 'creative';
        return { cast, caughtIn, holding, fired, zHit, locked, lockedTw, learnt, knows: g.bonus?.spells?.LightningStrike };
    });
    assert.equal(r.cast, 'LightningStrike');
    assert.ok(r.holding && r.caughtIn < 1500, `the bolt is in the hands quickly (${r.caughtIn} ms of game time)`);
    assert.ok(r.fired, 'a level hand fires the bolt');
    assert.ok(r.zHit, 'the bolt hit the zombie it was aimed at');
    assert.equal(r.locked, null, 'outside Creative it is locked without a scroll');
    assert.equal(r.lockedTw, false, 'Thunderwave is locked as well');
    assert.equal(r.learnt, 'LightningStrike', 'after the scroll burns it works');
    assert.ok(r.knows);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('Авада Кедавра in Survival: refused with the hint about its scroll; burn the scroll in the hand («Инферно») — then it kills the zombie the raised hand points at', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'survival');
    await waitHudVisible(page);
    // both arms lifted in front, pointing a little down ahead (a synthetic pose), kept coming like a camera would
    const raw = frame({ arms: 'forward', wristOffset: [0, 0.05] });
    await page.evaluate((raw) => {
        window.__avadaPose = setInterval(() => window.__zns.poseService.injectRaw({ ...JSON.parse(JSON.stringify(raw)), ts: performance.now() }), 33);
    }, raw);
    await page.waitForFunction(() => window.__zns.game.character.isArmRaised('right'), null, { timeout: 20000 });
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const voice = () => document.getElementById('voice-debug').innerText;
        // (the night's zombies stay out of it)
        for (const z of [...g.zombies]) z.setSleeping?.(true);
        g.playerHP = 999;
        // a zombie ahead, right where the raised right hand points (its line comes down to the zombie's chest)
        const ahead = () => {
            const o = g.castOrigin('right', new T.Vector3());
            const d = ch.getPointingDirection('right', new T.Vector3());
            const p = new T.Vector3();
            for (let t = 3; t < 25; t += 0.1) { p.copy(o).addScaledVector(d, t); if (p.y < g.collision.groundY(p.x, p.z) + 1) break; }
            return new T.Vector3(p.x, g.collision.groundY(p.x, p.z), p.z);
        };
        // 1) without the scroll: nothing flies, the hint says which scroll
        const z1 = g._createZombie(ahead());
        z1.setSleeping(true);
        g.combat.fatigue = g.combat.maxFatigue ?? 30;
        g.lastSpellCastTime = 0; g._lastDuelCast = 0;
        const knewBefore = g.knowsSpell('AvadaKedavra');
        const locked = g.castLocalSpell('авада кедавра', true);
        const hint = voice();
        const boltsLocked = g.duel.bolts.size;
        await frames(20);
        const z1Alive = !z1.isDead;
        // 2) the scroll in the left hand, «Инферно» — it burns and teaches
        g.items.releaseHand('left');
        g.items.takeIntoHand({ kind: 'scroll', uid: 'avada1', stat: 'spell', spell: 'AvadaKedavra' }, 'left');
        await frames(3);
        g.lastSpellCastTime = 0;
        const burnt = g.castLocalSpell('инферно', true);
        const scrollGone = !g.items.held.left;
        const learntMsg = voice();
        const knows = g.knowsSpell('AvadaKedavra');
        // 3) now it works: the green charge flies at the zombie and kills it
        await frames(30);
        g.combat.fatigue = g.combat.maxFatigue ?? 30;
        g.lastSpellCastTime = 0; g._lastDuelCast = 0;
        z1.group.position.copy(ahead());
        const aim = g.duel.pickSide(false);
        const cast = g.castLocalSpell('авада кедавра', true);
        const bolts = [...g.duel.bolts.values()].map((b) => b.spell);
        const t0 = performance.now();
        while (!z1.isDead && performance.now() - t0 < 15000) await frames(2);
        return { knewBefore, locked, hint, boltsLocked, z1Alive, burnt, scrollGone, learntMsg, knows, cast, bolts, aimedAt: aim?.t.kind === 'z' && aim.t.id === z1.id, killed: z1.isDead, saved: !!g.bonus?.spells?.AvadaKedavra };
    });
    await page.evaluate(() => clearInterval(window.__avadaPose));
    assert.equal(r.knewBefore, false, 'in Survival it is not known at first');
    assert.equal(r.locked, null, 'without the scroll it is refused');
    assert.match(r.hint, /только в Творческом режиме/);
    assert.match(r.hint, /свиток «Авада Кедавра»/, 'the hint names the scroll: ' + r.hint);
    assert.match(r.hint, /зелёная лента/);
    assert.equal(r.boltsLocked, 0, 'no charge flew');
    assert.ok(r.z1Alive, 'the zombie is still alive');
    assert.equal(r.burnt, 'Inferno');
    assert.ok(r.scrollGone, 'the scroll burnt away');
    assert.match(r.learntMsg, /знаете заклинание «Авада Кедавра»/);
    assert.ok(r.knows && r.saved, 'learnt for good');
    assert.equal(r.cast, 'AvadaKedavra', 'after the scroll it works');
    assert.deepEqual(r.bolts, ['AvadaKedavra'], 'the green charge flies');
    assert.ok(r.aimedAt, 'the raised hand points at the zombie');
    assert.ok(r.killed, 'the green charge killed the zombie');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
