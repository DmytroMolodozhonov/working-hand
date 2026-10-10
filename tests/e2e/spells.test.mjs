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
        // a thing lying in front: lifted and carried
        const L = g.items.spawnLoose({ kind: 'apple', uid: 'ap1', count: 1 }, hand.clone().addScaledVector(dir, 7).setY(hand.y - 1)); // (on the ground ahead: within the pointing cone)
        await frames(30);
        const y0 = L.model.position.y;
        g.levitation.cast();
        await frames(40);
        const lifted = { kind: g.levitation.state?.kind, rose: L.model.position.y - y0 };
        g.levitation.release(true);
        g.items.removeLoose('ap1');
        // a book on the ground: «Акцио» — it flies (not at once in the hand)
        const p0 = hand.clone().addScaledVector(dir, 10);
        B.placeBook(p0, 777123);
        await frames(2);
        g.accio.cast();
        await frames(3);
        const bk = B.books.get(777123);
        const midway = bk ? bk.model.position.distanceTo(p0) : -1;
        const stillFlying = !!bk && !g.items.heldOf('book');
        for (let i = 0; i < 120 && B.books.has(777123); i++) await frames(1);
        const caught = !!g.items.heldOf('book');
        return { starter, power, cost, bare, held, freed, lifted, midway, stillFlying, caught };
    });
    assert.ok(r.starter && r.starter.plain && !r.starter.dir && !r.starter.fav && !r.starter.power, 'a plain wooden wand in a slot from the start ' + JSON.stringify(r.starter));
    assert.ok(Math.abs(r.power - 1.15) < 1e-9, '15% stronger: ' + r.power);
    assert.equal(r.cost, r.bare, 'no saving of strength');
    assert.ok(!r.held.hint && r.held.kind === 'bird' && r.held.state === 'held' && r.held.alive && r.held.books === 0, 'the bird is caught, not knocked down ' + JSON.stringify(r.held));
    assert.ok(r.freed.alive && r.freed.state !== 'held', 'let go: it flies on ' + JSON.stringify(r.freed));
    assert.ok(r.lifted.kind === 'item' && r.lifted.rose > 0.3, 'a thing is lifted ' + JSON.stringify(r.lifted));
    assert.ok(r.stillFlying && r.midway > 0.3, 'the book flies (not teleported) ' + JSON.stringify({ midway: r.midway, stillFlying: r.stillFlying }));
    assert.ok(r.caught, 'and is caught in the hand');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('Люмос: a glow at the tip (no ball) that lights the place; thrown, the light flies until the ground stops it and shines there', async () => {
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
        const glow = { sprite: !!W.light?.glow?.isSprite, atTip: W.light ? W.light.glow.position.distanceTo(tip) : -1, light: W.lights[0].intensity, lightAt: W.lights[0].position.distanceTo(tip) };
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
        return { said, glow, flying, landed };
    });
    assert.equal(r.said, 'Lumos');
    assert.ok(r.glow.sprite && r.glow.atTip < 0.01, 'a glow at the tip, not a ball ' + JSON.stringify(r.glow));
    assert.ok(r.glow.light > 1 && r.glow.lightAt < 0.01, 'a real light there ' + JSON.stringify(r.glow));
    assert.ok(r.flying && !r.flying.stuck, 'thrown: it flies');
    assert.ok(r.landed && r.landed.stuck && r.landed.aboveGround > -0.05 && r.landed.aboveGround < 0.6 && r.landed.still, 'it stopped at the ground and stays ' + JSON.stringify(r.landed));
    assert.ok(r.landed.lit, 'and lights the place');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('the wand is held like a pen: its back in the web of the thumb, pinched by the thumb and index tips, pointing where the fingers point; spells fly along it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
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
