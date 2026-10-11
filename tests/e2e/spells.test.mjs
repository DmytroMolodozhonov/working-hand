/**
 * The plain wooden wand everybody starts with; «Вингардиум Левиоса» catches a
 * book-bird (doesn't knock it down) and lifts a thing; «Акцио» makes a book fly to the hand.
 * Run: node --test tests/e2e/spells.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8195;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('a plain wooden wand from the start; Левиоса holds a book-bird and a thing; Акцио flies a book to the hand', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const wand = g.inventory.slots.find((s) => s && s.kind === 'wand');
        const starter = wand ? { plain: !!wand.plain, dir: wand.dir, fav: wand.fav, power: wand.power } : null;
        // the wand in the hand: 15% stronger, no saving of strength
        const bare = g.combat.costOf('Bombardo');
        g.items.takeIntoHand({ ...wand }, 'right');
        const power = g.wandMagic.power('Bombardo'), cost = g.combat.costOf('Bombardo');
        g.items.releaseHand('right');
        // a book-bird in front of the hand: Левиоса catches it
        const B = g.books;
        const hand = ch.getHandWorldPosition('right', new T.Vector3());
        const dir = ch.getHandDirection('right', new T.Vector3());
        const b = B._spawnBird(null, hand.clone().addScaledVector(dir, 4));
        b.state = 'perch'; b.wait = 99;
        const books0 = B.books.size; // (creative: a book lies on a pedestal)
        const hint = g.levitation.cast();
        await frames(30);
        const held = { hint, kind: g.levitation.state?.kind, state: b.state, alive: B.birds.has(b.id), books: B.books.size - books0 };
        g.levitation.release(true);
        await frames(5);
        const freed = { state: b.state, alive: B.birds.has(b.id) };
        // a thing lying in front: lifted and carried (other loose things — an apple fallen from a tree — cleared: they may lie nearer the hand's line)
        for (const o of [...g.items.loose.values()]) g.items.removeLoose(o.item.uid);
        const L = g.items.spawnLoose({ kind: 'apple', uid: 'ap1', count: 1 }, hand.clone().addScaledVector(dir, 7).setY(hand.y - 1)); // (on the ground ahead: within the pointing cone)
        await frames(30);
        const y0 = L.model.position.y;
        g.levitation.cast();
        await frames(40);
        const lifted = { kind: g.levitation.state?.kind, it: g.levitation.state?.obj === L, rose: L.model.position.y - y0 };
        g.levitation.release(true);
        g.items.removeLoose('ap1');
        // a book on the ground: «Акцио» — it flies (not at once in the hand); the wand in the
        // right hand: the book comes into the free left one (things lying about were not even looked at)
        const p0 = hand.clone().addScaledVector(dir, 10);
        B.placeBook(p0, 777123);
        g.items.takeIntoHand({ ...wand }, 'right');
        await frames(2);
        g.accio.cast();
        await frames(3);
        const bk = B.books.get(777123);
        const midway = bk ? bk.model.position.distanceTo(p0) : -1;
        const stillFlying = !!bk && !g.items.heldOf('book');
        for (let i = 0; i < 120 && B.books.has(777123); i++) await frames(1);
        const caught = g.items.heldOf('book')?.side === 'left' && g.items.heldOf('wand')?.side === 'right';
        g.items.releaseHand('right');
        return { starter, power, cost, bare, held, freed, lifted, midway, stillFlying, caught };
    });
    assert.ok(r.starter && r.starter.plain && !r.starter.dir && !r.starter.fav && !r.starter.power, 'a plain wooden wand in a slot from the start ' + JSON.stringify(r.starter));
    assert.ok(Math.abs(r.power - 1.15) < 1e-9, '15% stronger: ' + r.power);
    assert.equal(r.cost, r.bare, 'no saving of strength');
    assert.ok(!r.held.hint && r.held.kind === 'bird' && r.held.state === 'held' && r.held.alive && r.held.books === 0, 'the bird is caught, not knocked down ' + JSON.stringify(r.held));
    assert.ok(r.freed.alive && r.freed.state !== 'held', 'let go: it flies on ' + JSON.stringify(r.freed));
    assert.ok(r.lifted.kind === 'item' && r.lifted.it && r.lifted.rose > 0.3, 'a thing is lifted ' + JSON.stringify(r.lifted));
    assert.ok(r.stillFlying && r.midway > 0.3, 'the book flies (not teleported) ' + JSON.stringify({ midway: r.midway, stillFlying: r.stillFlying }));
    assert.ok(r.caught, 'and is caught in the free hand (the wand stays in the other)');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('Люмос: a glow at the tip (no ball) that lights the place; thrown, it leaves the tip, flies until the ground stops it and fades; «стоп» puts out all of it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0.8, leftCurl: 0 }, 12, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'lw1', plain: true, model: 0, color: 0x8b5a2b, power: 0 }, 'right');
        await frames(3);
        const said = g.castLocalSpell('Люмос', true);
        await frames(5);
        const W = g.wandMagic;
        const tip = W.tip(new T.Vector3());
        const glow = { sprite: !!W.light?.glow?.isSprite, atTip: W.light ? W.light.glow.position.distanceTo(tip) : -1, light: W.lights[0].intensity, lightAt: W.lights[0].position.distanceTo(tip), scale0: W.light ? W.light.glow.scale.x : 0 };
        // throw it ahead and down: it flies, the ground stops it, it stays shining there
        const dir = ch.getHandDirection('right', new T.Vector3()).setY(-0.5).normalize();
        W._throwLight(dir);
        await frames(2);
        const flying = W.thrown[0] ? { stuck: W.thrown[0].stuck } : null;
        for (let i = 0; i < 200 && W.thrown[0] && !W.thrown[0].stuck; i++) await frames(1);
        const t = W.thrown[0];
        const ground = t ? g.collision.surfaceY(t.pos.x, t.pos.z) : null;
        await frames(30);
        const landed = t ? { stuck: t.stuck, aboveGround: t.pos.y - ground, flown: t.flown, lit: W.lights.some((l) => l.intensity > 1 && l.position.distanceTo(t.pos) < 0.01), still: W.thrown.includes(t) } : null;
        // the light left the wand: its tip is dark; «Люмос» lights it again at once, in full (not a glimmer)
        const tipDark = !W.light;
        g.castLocalSpell('Люмос', true);
        await frames(3);
        const relit = { on: !!W.light, scale: W.light ? W.light.glow.scale.x / glow.scale0 : 0 };
        // «стоп» puts out all of it: the tip and the thrown light
        g.castLocalSpell('стоп', true);
        await frames(2);
        const stopped = { tip: !!W.light, thrown: W.thrown.filter((x) => x.mine).length };
        // a thrown light goes out by itself (about 10 s after the throw)
        g.castLocalSpell('Люмос', true);
        await frames(2);
        W._throwLight(dir);
        const t2 = W.thrown[0];
        t2.age = 9.9;
        await frames(10);
        const gone = !W.thrown.includes(t2);
        return { said, glow, flying, landed, tipDark, relit, stopped, gone };
    });
    assert.equal(r.said, 'Lumos');
    assert.ok(r.glow.sprite && r.glow.atTip < 0.01, 'a glow at the tip, not a ball ' + JSON.stringify(r.glow));
    assert.ok(r.glow.light > 1 && r.glow.lightAt < 0.01, 'a real light there ' + JSON.stringify(r.glow));
    assert.ok(r.flying && !r.flying.stuck, 'thrown: it flies');
    assert.ok(r.landed && r.landed.stuck && r.landed.aboveGround > -0.05 && r.landed.aboveGround < 0.6 && r.landed.still, 'it stopped at the ground and stays ' + JSON.stringify(r.landed));
    assert.ok(r.landed.lit, 'and lights the place');
    assert.ok(r.tipDark, 'the light has left the wand');
    assert.ok(r.relit.on && r.relit.scale > 0.85, '«Люмос» again: the tip shines in full at once ' + JSON.stringify(r.relit));
    assert.deepEqual(r.stopped, { tip: false, thrown: 0 }, '«стоп» puts out the tip and the thrown light');
    assert.ok(r.gone, 'a thrown light goes out by itself');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('the wand is held like a pen: its back in the web of the thumb, pinched by the thumb and index tips, pointing where the fingers point; spells fly along it', { skip: 'the pen grip is off: V4 hands hold the wand as V3 (PEN_WAND in Items.js)' }, async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => window.__zns.game.character.setHandVersion('v4')); // (the full hand: V4)
    await feed(page, { arms: 'forward', rightCurl: 0.4, leftCurl: 0 }, 12, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'pw1', plain: true, model: 0, color: 0x8b5a2b, power: 0 }, 'right');
        await frames(10);
        const h = g.items.held.right, m = h.model;
        m.updateMatrixWorld(true);
        const axis = new T.Vector3(0, 1, 0).applyQuaternion(m.quaternion).normalize();
        const pen = g.items._penGrip('right');
        const back = new T.Vector3(0, 0.12, 0).applyMatrix4(m.matrixWorld);
        const tip = g.wandMagic.tip(new T.Vector3());
        const palm = ch.getActiveHands().right.palm;
        palm.updateWorldMatrix(true, false);
        const fingers = new T.Vector3().setFromMatrixColumn(palm.matrixWorld, 1).normalize();
        const aim = ch.getHandDirection('right', new T.Vector3());
        return { webGap: back.distanceTo(pen.web), pinchOff: pen.pinch.clone().sub(back).cross(axis).length(), withFingers: Math.acos(Math.min(1, axis.dot(fingers))) * 180 / Math.PI, tipBeyond: tip.clone().sub(pen.pinch).dot(axis), aimAlong: Math.acos(Math.min(1, aim.dot(axis))) * 180 / Math.PI };
    });
    assert.ok(r.webGap < 0.02, 'its back rests in the web of the thumb ' + JSON.stringify(r));
    assert.ok(r.pinchOff < 0.02, 'it passes through the pinch of the thumb and index tips');
    assert.ok(r.withFingers < 50, `it points about where the fingers point (${r.withFingers.toFixed(0)}°)`);
    assert.ok(r.tipBeyond > 0.3, 'its tip sticks out past the fingers');
    assert.ok(r.aimAlong < 1, 'spells fly along the wand');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('«стоп» ends every spell still going: the held shield goes out, Lumos too; with nothing going it is not a spell', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0.8, leftCurl: 0 }, 12, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'sw1', plain: true, model: 0, color: 0x8b5a2b, power: 0 }, 'right');
        await frames(3);
        const shield = g.castLocalSpell('Protection', true);
        const lumos = g.castLocalSpell('Люмос', true);
        await frames(100); // (more than the old 3 seconds' worth of frames is not needed: it holds)
        const holding = { shield: !!g.combat.shield, light: !!g.wandMagic.light };
        const stop = g.castLocalSpell('стоп', true);
        await frames(2);
        const after = { shield: !!g.combat.shield, light: !!g.wandMagic.light };
        const again = g.castLocalSpell('стоп', true);
        return { shield, lumos, holding, stop, after, again };
    });
    assert.equal(r.shield, 'Protection');
    assert.equal(r.lumos, 'Lumos');
    assert.deepEqual(r.holding, { shield: true, light: true }, 'both still going');
    assert.equal(r.stop, 'Stop');
    assert.deepEqual(r.after, { shield: false, light: false }, '«стоп» ended them');
    assert.equal(r.again, null, 'nothing left to stop');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('Левиоса lifts a cow like a thing: it rises and hangs in front of the hand; let go up there it falls; «стоп» drops it too', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        // away from the pedestals, no other animals about
        ch.group.position.set(0, ch.group.position.y, 30);
        await frames(20);
        for (const a of [...g.animals.list]) g.animals._remove(a);
        const hand = ch.getHandWorldPosition('right', new T.Vector3());
        const dir = ch.getHandDirection('right', new T.Vector3()).setY(0).normalize();
        const p = hand.clone().addScaledVector(dir, 5);
        p.y = g.collision.groundY(p.x, p.z) + 0.5;
        const cow = g.animals._spawn('cow', p, {});
        await frames(3);
        const ground = () => g.collision.groundY(cow.group.position.x, cow.group.position.z) + 0.5;
        g._lastLevitate = 0;
        const said = g.castLocalSpell('вингардиум левиоса', true);
        const kind = g.levitation.state?.kind;
        await frames(90);
        const up = cow.group.position.y - ground();
        const held = !!cow.lev;
        const handNow = ch.getHandWorldPosition('right', new T.Vector3());
        const atHand = Math.hypot(cow.group.position.x - handNow.x, cow.group.position.z - handNow.z);
        g.levitation.release(false); // (as a jerk of the hand does)
        await frames(120);
        const landed = cow.group.position.y - ground();
        // (it grazes on, wandering off: point at it again)
        cow.group.position.copy(p);
        await frames(2);
        g._lastLevitate = 0;
        g.castLocalSpell('вингардиум левиоса', true);
        await frames(20);
        const again = !!cow.lev;
        const stop = g.castLocalSpell('стоп', true);
        await frames(3);
        return { said, kind, up, held, atHand, landed, again, stop, after: !!cow.lev, alive: !cow.dead };
    });
    assert.equal(r.said, 'Levitation');
    assert.equal(r.kind, 'creature', 'a living body, not a duel charge');
    assert.ok(r.held && r.up > 0.8, `it rose (${r.up.toFixed(2)} m above its feet's ground)`);
    assert.ok(r.atHand > 1.5 && r.atHand < 7, `in front of the hand (${r.atHand.toFixed(2)} m)`);
    assert.ok(Math.abs(r.landed) < 0.3, `let go: it fell back down (${r.landed.toFixed(2)})`);
    assert.ok(r.again, 'lifted again');
    assert.equal(r.stop, 'Stop');
    assert.equal(r.after, false, '«стоп» dropped it');
    assert.ok(r.alive, 'a low fall does not kill');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('creative: wand spells with a bare hand, building out of nothing (no wood or stone in the slots), a bed out of nothing, a test chest that fills up again', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        // nothing in the slots
        g.inventory.slots = g.inventory.slots.map(() => null);
        g.inventory._render?.();
        await frames(2);
        const lumos = g.castLocalSpell('Люмос', true);
        await frames(3);
        const light = !!g.wandMagic.light;
        const lightAt = g.wandMagic.light ? g.wandMagic.light.glow.position.distanceTo(ch.getHandWorldPosition('right', new T.Vector3())) : -1;
        g.castLocalSpell('нокс', true);
        // a floor out of nothing
        g._lastBuild = 0;
        const floor = g.castLocalSpell('create a floor', true);
        await frames(20);
        g.castLocalSpell('stand', true);
        const built = g.builder.lastCount;
        // a door out of nothing
        g._lastBuild = 0;
        const door = g.castLocalSpell('create a door', true);
        // a bed out of nothing
        const p = ch.group.position;
        g.beds.testAim = { x: p.x + 4, z: p.z - 4 };
        const bedsBefore = g.beds.list.size;
        g.beds._lastCast = 0;
        const bed = g.castLocalSpell('create a bed', true);
        const beds = g.beds.list.size - bedsBefore;
        g.beds.testAim = null;
        // the test chest: opens as I come, fills up again once I walked away
        const chest = g.chests.find((c) => c.id === 'creative-test');
        const at = chest ? chest.getPosition().clone() : null;
        let opened = false, reshut = false;
        if (chest) {
            p.set(at.x + 2, p.y, at.z);
            for (let i = 0; i < 100 && !chest.isOpen; i++) await frames(1);
            opened = chest.isOpen;
            for (let i = 0; i < 100 && chest.animating; i++) await frames(1);
            p.set(at.x + 25, p.y, at.z);
            for (let i = 0; i < 400 && chest.isOpen; i++) await frames(1);
            reshut = !chest.isOpen;
        }
        return { lumos, light, lightAt, floor, built, door, bed, beds, chest: !!chest, opened, reshut };
    });
    assert.equal(r.lumos, 'Lumos', 'Lumos without a wand in creative');
    assert.ok(r.light && r.lightAt < 0.6, `the light at the fingertips (${r.lightAt.toFixed(2)} m from the hand)`);
    assert.equal(r.floor, 'CreateFloor', 'a floor with empty slots');
    assert.ok(r.built >= 1, `blocks were placed (${r.built})`);
    assert.equal(r.door, 'CreateDoor', 'a door without wood');
    assert.equal(r.bed, 'CreateBed', 'a bed without logs and wool');
    assert.equal(r.beds, 1);
    assert.ok(r.chest && r.opened, 'a chest near the start opens');
    assert.ok(r.reshut, 'and is shut and full again after walking away');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('duel spells fly where the hand points — standing and hovering after «Флайн» + «Паузин»: a book-bird on the line is hit, one 12° off is not, the charge keeps to the line', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const pose = { arms: 'forward', rightCurl: 0, leftCurl: 0 };
    await feed(page, pose, 12, 40);
    // «Остолбеней» said with the right hand pointing; a book-bird (a small body, 0.6 m) put
    // `dist` m along the hand's line turned `deg`° aside; how the charge flew
    const shoot = (deg, dist) => page.evaluate(async ([deg, dist]) => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, B = g.books;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        // only our bird about (no other birds or animals in the way)
        for (const b of [...B.birds.values()]) { g.scene.remove(b.model); B.birds.delete(b.id); }
        for (const a of [...g.animals.list]) g.animals._remove(a);
        const o = g.castOrigin('right', new T.Vector3());
        const d = ch.getPointingDirection('right', new T.Vector3());
        const at = o.clone().addScaledVector(d.clone().applyAxisAngle(new T.Vector3(0, 1, 0), -deg * Math.PI / 180), dist); // (to the right: away from the left hand)
        const bird = B._spawnBird(null, at);
        bird.state = 'perch'; bird.wait = 99; bird.t = 0;
        await frames(2);
        g._lastDuelCast = 0; g._interimCast = null;
        const said = g.castLocalSpell('остолбеней', true);
        const b = [...g.duel.bolts.values()].pop();
        const hand = ch.getHandDirection(b.side, new T.Vector3());
        const res = { said, side: b.side, tk: b.tk, d0: b.d0.toArray(), hand: hand.toArray(), pointing: d.toArray(), tilt: ch.flightTilt };
        let maxOff = 0, maxAlong = 0, maxBend = 0;
        const t0 = performance.now();
        while (g.duel.bolts.has(b.id) && performance.now() - t0 < 10000) {
            const rel = b.front.clone().sub(b.o);
            const along = rel.dot(b.d0);
            maxOff = Math.max(maxOff, rel.addScaledVector(b.d0, -along).length());
            maxAlong = Math.max(maxAlong, along);
            maxBend = Math.max(maxBend, b.dir.angleTo(b.d0));
            await frames(1);
        }
        const hit = !B.birds.has(bird.id) || B.birds.get(bird.id).state === 'fall';
        const touched = g.duel.log.filter((e) => e.ev === 'touch' && e.id === b.id).map((e) => e.kind + ':' + e.tid);
        if (B.birds.has(bird.id)) { g.scene.remove(bird.model); B.birds.delete(bird.id); }
        return { ...res, maxOff, maxAlong, maxBend, hit, touched, birdId: bird.id };
    }, [deg, dist]);
    const pitch = (v) => Math.asin(v[1]);

    // --- standing on the ground (away from the pedestals)
    await page.evaluate(async () => {
        const g = window.__zns.game, ch = g.character;
        ch.group.position.set(0, ch.group.position.y, 30);
        const f = g.frameCount; while (g.frameCount < f + 20) await new Promise((res) => setTimeout(res, 20));
    });
    const onLine = await shoot(0, 10);
    assert.equal(onLine.said, 'Stupefy');
    assert.equal(onLine.tk, 'b', 'the bird on the line is the target ' + JSON.stringify(onLine));
    assert.ok(onLine.hit && onLine.touched.includes('b:' + onLine.birdId), 'and is hit ' + JSON.stringify(onLine));
    assert.ok(onLine.maxOff < 0.15, `the charge kept to the hand's line (${onLine.maxOff.toFixed(3)} m off)`);
    const aside = await shoot(12, 10);
    assert.equal(aside.said, 'Stupefy');
    assert.equal(aside.tk, 'n', 'nothing pointed at ' + JSON.stringify(aside));
    assert.ok(!aside.hit && !aside.touched.length, '12° off: not hit ' + JSON.stringify(aside));
    assert.ok(aside.maxOff < 0.01 && aside.maxBend < 1e-6, `straight along the hand (${aside.maxOff.toFixed(4)} m off)`);
    assert.ok(aside.maxAlong > 10, `it flew on past the bird (${aside.maxAlong.toFixed(1)} m)`);

    // --- in the air: «Флайн», then «Паузин» — hovering, the body leans forward a little
    await feed(page, { arms: 'up' }, 20, 60);
    assert.equal(await page.evaluate(() => { const g = window.__zns.game; g.lastSpellCastTime = 0; return g.castLocalSpell('флайн'); }), 'Flight');
    await feed(page, { arms: 'up' }, 20, 70);
    await page.waitForFunction(() => window.__zns.game.flight.state === 'cruise', null, { timeout: 30000 });
    await feed(page, pose, 10, 60);
    assert.equal(await page.evaluate(() => window.__zns.game.castLocalSpell('паузин', true)), 'Pause');
    await feed(page, pose, 40, 60);
    await page.waitForFunction(() => { const f = window.__zns.game.flight; return f.hovering && f.speed < 0.1 && Math.abs(f.pitch) < 0.01 && Math.abs(f.tilt - 0.15) < 0.01; }, null, { timeout: 30000 });
    const high = await page.evaluate(() => { const g = window.__zns.game, p = g.character.group.position; return p.y - g.collision.groundY(p.x, p.z); });
    assert.ok(high > 4, `up in the air (${high.toFixed(1)} m)`);
    const air = await shoot(0, 10);
    assert.ok(air.tilt > 0.1, 'the body is tilted while hovering');
    // the hero's forearm tips down with the body — but the hand points as on the ground
    assert.ok(pitch(air.hand) < pitch(onLine.d0) - 0.1, `(the forearm alone points ${((pitch(onLine.d0) - pitch(air.hand)) * 57.3).toFixed(1)}° lower)`);
    assert.ok(Math.abs(pitch(air.d0) - pitch(onLine.d0)) < 0.03, `the charge flies as the hand points, like on the ground (${(pitch(air.d0) * 57.3).toFixed(1)}° vs ${(pitch(onLine.d0) * 57.3).toFixed(1)}°)`);
    assert.equal(air.tk, 'b', 'hovering: the bird on the line is the target ' + JSON.stringify(air));
    assert.ok(air.hit, 'and is hit');
    assert.ok(air.maxOff < 0.15, `kept to the line (${air.maxOff.toFixed(3)} m off)`);
    const airAside = await shoot(12, 10);
    assert.equal(airAside.tk, 'n');
    assert.ok(!airAside.hit && !airAside.touched.length, 'hovering, 12° off: not hit ' + JSON.stringify(airAside));
    assert.ok(airAside.maxOff < 0.01, 'straight along the hand');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('«Earthquake Maxima»: three cracks, the ground really breaks along them (blocks fall in, earth heaves up), the ground shakes under the hero near the wave', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        ch.group.position.set(0, ch.group.position.y, 30);
        await frames(20);
        const o = ch.group.position.clone();
        o.y = g.collision.surfaceY(o.x, o.z);
        const dir = new T.Vector3(0, 0, -1);
        const edits0 = (g.blockEdits || []).length;
        const n0 = g.scene.children.length;
        g.spells.cast('EarthquakeMaxima', o, dir, 'right', g.localId);
        const crack = g.scene.children[n0];
        let shake = 0;
        for (let i = 0; i < 120; i++) { await frames(1); shake = Math.max(shake, g.fx.shake || 0); }
        const edits = (g.blockEdits || []).slice(edits0);
        return { segs: crack?.children?.length ?? 0, dug: edits.filter((e) => e[3] === 0).length, heaved: edits.filter((e) => e[3] !== 0).length, shake };
    });
    assert.ok(r.segs >= 50, 'three cracks side by side ' + JSON.stringify(r));
    assert.ok(r.dug >= 5, 'blocks fell into the crack ' + JSON.stringify(r));
    assert.ok(r.heaved >= 2, 'the earth heaved up beside it ' + JSON.stringify(r));
    assert.ok(r.shake > 0.5, 'the ground shakes under the hero ' + r.shake);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
