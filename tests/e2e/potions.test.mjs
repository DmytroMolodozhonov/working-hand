/**
 * Potions in a real browser (creative: the cauldron by the pedestals): two hands push it, one
 * does not; a «Waterbollow» ball dropped over it fills it; an apple and a mana crystal dropped in
 * dissolve; it brews (30–60 s, sped up here) → «Зелье готово»; an empty flask dipped in fills;
 * brought to the mouth it is drunk (+HP), the empty flask stays in the hand; knocked over, it pours out.
 * Run: node --test tests/e2e/potions.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8198;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('potions: push the cauldron with both hands, water ball in, ingredients in, brewing → ready, fill a flask, drink; tipped over it pours out', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 10, 40);

    // the cauldron is there, solid, big
    const at = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const c = g.cauldrons.list.get('ccaul0');
        if (!c) return null;
        c.group.updateMatrixWorld(true);
        const b = new T.Box3(), s = new T.Vector3();
        for (const o of c.group.children) if (!o.isInstancedMesh && o !== c.liquid) b.expandByObject(o); // (its iron: the belly, rim, handles, legs)
        b.getSize(s);
        const hero = new T.Box3().setFromObject(g.character.group).getSize(new T.Vector3()).y;
        return { x: c.x, z: c.z, box: c.boxId != null, h: s.y, w: Math.max(s.x, s.z), hero, blocked: g.collision.pointBlocked(c.x + 1.2, c.y + 1.5, c.z) };
    });
    assert.ok(at, 'the creative cauldron');
    assert.ok(at.box && at.blocked, 'solid');
    assert.ok(at.h >= at.hero * 0.5 && at.w > at.h, `big: ${at.h.toFixed(2)} m tall (hero ${at.hero.toFixed(2)}), ${at.w.toFixed(2)} m wide`);

    // hands on its belly: one hand pushing does not move it, two do
    const pushed = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const c = g.cauldrons.list.get('ccaul0');
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        ch.group.position.set(c.x - 3.6, ch.group.position.y, c.z);
        const real = ch.getHandWorldPosition.bind(ch), tracked = ch.isHandTracked?.bind(ch);
        let k = 0, hands = ['right', 'left'];
        ch.isHandTracked = () => true;
        // (the palms on its belly at chest height, moving into it)
        ch.getHandWorldPosition = (side, out = new T.Vector3()) => hands.includes(side) ? out.set(c.x - 1.75 + k, c.y + 1.7, c.z + (side === 'right' ? -0.6 : 0.6)) : real(side, out);
        const x0 = c.x;
        hands = ['right'];
        for (let i = 0; i < 20; i++) { k = i * 0.02; await frames(1); }
        const one = c.x - x0;
        hands = ['right', 'left'];
        const x1 = c.x;
        for (let i = 0; i < 25; i++) { k = i * 0.03; await frames(1); }
        const two = c.x - x1;
        ch.getHandWorldPosition = real;
        if (tracked) ch.isHandTracked = tracked;
        return { one, two };
    });
    assert.ok(Math.abs(pushed.one) < 0.05, `one hand: it does not budge (${pushed.one})`);
    assert.ok(pushed.two > 0.3, `two hands push it (${pushed.two.toFixed(2)} m)`);

    // a campfire («Fire») next to it, the cauldron pushed onto it: it hangs in a holder over the flames
    const fire = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const c = g.cauldrons.list.get('ccaul0');
        const f = g.campfires.kindle(c.x + 1.1, g.collision.groundY(c.x + 1.1, c.z), c.z);
        await frames(20);
        const fid = f?.id ?? [...g.campfires.list.values()].pop()?.id;
        return { on: c.fire === fid, tripod: !!c.tripod?.visible, feet: g.cauldrons.fy(c) - c.y, at: Math.hypot(c.x - c.x, 0) };
    });
    assert.ok(fire.on, 'on the campfire');
    assert.ok(fire.tripod, 'a tripod holds it');
    assert.ok(fire.feet > 0.5, `hung over the flames (${fire.feet})`);

    // a «Waterbollow» ball falls over its opening: it pours in; a small one fills a third, a big one fills it
    const water = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const c = g.cauldrons.list.get('ccaul0');
        const ball = (vol) => g.water._spawnFalling({ pos: new T.Vector3(c.x, g.cauldrons.fy(c) + 4.5, c.z), vel: new T.Vector3(0, 0, 0), r: Math.cbrt((3 * vol) / (4 * Math.PI)), frozen: false, local: true });
        ball(2);
        await frames(40);
        const third = c.st.water;
        ball(6);
        await frames(40);
        return { third, full: c.st.water, phase: c.st.phase, left: g.water.falling.length, liquid: c.liquid.visible };
    });
    assert.ok(Math.abs(water.third - 2) < 0.2, `a small ball: a third (${water.third})`);
    assert.ok(water.full >= 5.9, `a big one: full (${water.full})`);
    assert.equal(water.phase, 'water');
    assert.equal(water.left, 0, 'the balls went into it');
    assert.ok(water.liquid, 'the water is seen inside');

    // into cold water an apple just sinks; once it boils, an apple dropped and a crystal brought by «Левиоса» dissolve — it brews at once
    const brew = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const c = g.cauldrons.list.get('ccaul0'), top = g.cauldrons.fy(c);
        g.items.spawnLoose({ kind: 'apple', uid: 'pa0', count: 1 }, new T.Vector3(c.x + 0.3, top + 4, c.z), { vel: new T.Vector3(0, -1, 0) });
        await frames(60);
        const cold = { ings: Object.keys(c.st.ings).length, onBottom: g.items.loose.get('pa0')?.inCaul === c.id, heat: c.st.heat };
        const said = [];
        const n0 = g.hud.notify.bind(g.hud);
        g.hud.notify = (t, ms) => { said.push(t); return n0(t, ms); };
        c.st.heat = 0.97; // (sped up: the fire has been heating it)
        await frames(60);
        g.hud.notify = n0;
        const boiled = c.st.heat >= 1;
        g.items.spawnLoose({ kind: 'apple', uid: 'pa1', count: 1 }, new T.Vector3(c.x + 0.3, top + 4, c.z), { vel: new T.Vector3(0, -1, 0) });
        await frames(60);
        const win = c.st.win;
        // the crystal carried by «Вингардиум Левиоса» over the opening
        const L = g.items.spawnLoose({ kind: 'crystal', uid: 'pc1', count: 1 }, new T.Vector3(c.x - 0.3, top + 3.2, c.z + 0.2));
        L.lev = true;
        g.levitation.state = { kind: 'item', obj: L, side: 'right', hold: 3, target: L.model.position.clone(), age: 1, history: [], vel: new T.Vector3(), handQ0: g.levitation._handQuat('right', new T.Quaternion()), objQ0: L.model.quaternion.clone() };
        await frames(60);
        return { cold, said, boiled, win, ings: { ...c.st.ings }, gone: !g.items.loose.has('pa1') && !g.items.loose.has('pc1'), phase: c.st.phase, dur: c.st.dur };
    });
    assert.equal(brew.cold.ings, 0, 'cold water: it does not count');
    assert.ok(brew.cold.onBottom, 'it lies on the bottom');
    assert.ok(brew.boiled && brew.said.some((t) => /закипела/.test(t)), `boils (${brew.said.join(' | ')})`);
    assert.ok(brew.win > 20, `the countdown runs (${brew.win})`);
    assert.ok(brew.gone, 'dissolved in the boiling water (the levitated one too)');
    assert.equal(brew.phase, 'brewing');
    assert.ok(brew.dur >= 30 && brew.dur <= 60, `30–60 s (${brew.dur.toFixed(1)})`);

    // (sped up) the brew ends: «Зелье готово»
    const ready = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const c = g.cauldrons.list.get('ccaul0');
        const said = [];
        const n0 = g.hud.notify.bind(g.hud);
        g.hud.notify = (t, ms) => { said.push(t); return n0(t, ms); };
        c.st.t = c.st.dur - 0.3;
        await frames(30);
        g.hud.notify = n0;
        return { phase: c.st.phase, rec: c.st.rec, por: c.st.por, said, color: c.st.color };
    });
    assert.equal(ready.phase, 'ready');
    assert.equal(ready.rec, 'heal');
    assert.equal(ready.por, 10);
    assert.ok(ready.said.some((t) => /Зелье готово/.test(t)), `said: ${ready.said.join(' | ')}`);

    // an empty flask (two in the hand) dipped into it: one fills, the other goes to a slot
    const fill = await page.evaluate(async () => {
        const g = window.__zns.game;
        const c = g.cauldrons.list.get('ccaul0');
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.inventory.slots = g.inventory.slots.map(() => null);
        g.items.takeIntoHand({ kind: 'flask', uid: 'pf1', count: 2 }, 'right');
        const h = g.items.held.right;
        const feet = g.cauldrons.fy(c), w0 = c.st.water;
        const surface = (await import('/src/game/Potions.js')).surfaceY(c.st);
        // (above the potion: nothing; really down in it: it fills)
        for (let i = 0; i < 4; i++) { h.model.position.set(c.x, feet + surface + 0.15, c.z); g.cauldrons._dipFlask(0.15); }
        const above = g.items.held.right?.item.kind;
        for (let i = 0; i < 4; i++) { h.model.position.set(c.x, feet + surface - 0.3, c.z); g.cauldrons._dipFlask(0.15); }
        const held = g.items.held.right?.item;
        return { above, kind: held?.kind, rec: held?.rec, color: held?.color, por: c.st.por, lower: c.st.water < w0, slot: g.inventory.slots.find((s) => s?.kind === 'flask')?.count || 0 };
    });
    assert.equal(fill.above, 'flask', 'held over the potion: still empty');
    assert.equal(fill.kind, 'potion');
    assert.ok(fill.lower, 'the level went down');
    assert.equal(fill.rec, 'heal');
    assert.equal(fill.color, ready.color, 'the cauldron\'s colour');
    assert.equal(fill.por, 9, 'one of ten taken');
    assert.equal(fill.slot, 1, 'the other empty flask in a slot');

    // drink: brought to the mouth (+HP), the empty flask stays in the hand
    await page.evaluate(() => { window.__zns.game.playerHP = 5; });
    await feed(page, { toMouth: 'right', rightCurl: 0.8, leftCurl: 0 }, 40, 40);
    const drunk = await page.evaluate(() => ({ hp: window.__zns.game.playerHP, max: window.__zns.game.maxHP, held: window.__zns.game.items.held.right?.item.kind }));
    assert.equal(drunk.hp, Math.min(drunk.max, 35), `+30 HP (${drunk.hp})`);
    assert.equal(drunk.held, 'flask', 'the empty flask stays in the hand');

    // the creative test cave: a forgotten cauldron lies in one of its chambers (old, rusty), on the floor
    const cave = await page.evaluate(async () => {
        const g = window.__zns.game;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const t0 = performance.now();
        while (!g.cauldrons.list.has('cave:cvtest') && performance.now() - t0 < 15000) await frames(10);
        const c = g.cauldrons.list.get('cave:cvtest');
        return c && { old: c.old, tilt: c.tilt, floor: g.collision.groundAt(c.x, c.z, c.y + 1) - c.y };
    });
    assert.ok(cave, 'a forgotten cauldron in the test cave');
    assert.ok(cave.old, 'old and rusty');
    assert.ok(Math.abs(cave.floor) < 0.6, `on the chamber's floor (${cave.floor})`);

    // knocked over by a blast: it pours out; stood up by both hands lifting the rim
    const tipped = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const c = g.cauldrons.list.get('ccaul0');
        g.cauldrons.blast(new T.Vector3(c.x - 3, c.y + 1, c.z), 3, 1);
        await frames(90);
        return { tilt: c.tilt, phase: c.st.phase, water: c.st.water };
    });
    assert.ok(tipped.tilt > 1.4, `on its side (${tipped.tilt})`);
    assert.equal(tipped.phase, 'empty');
    assert.equal(tipped.water, 0);
    // both hands closed on its handles lift it: it rises with them and stands on its feet
    const stood = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
        const c = g.cauldrons.list.get('ccaul0');
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        const real = ch.getHandWorldPosition.bind(ch), curl = ch.getGripCurl.bind(ch), tracked = ch.isHandTracked?.bind(ch);
        // (the fingers closed on the two highest points of its rim; the hands lift them along the arc they take)
        const T4 = new T.Matrix4(), P = new T.Vector3(), Q = new T.Quaternion(), ONE = new T.Vector3(1, 1, 1);
        const at = (local, tilt) => { g.cauldrons._pose(c, tilt, P, Q); return local.clone().applyMatrix4(T4.compose(P, Q, ONE)); };
        c.group.updateMatrixWorld(true);
        const rim = [];
        for (let a = 0; a < 6.28; a += 0.1) rim.push(new T.Vector3(1.45 * Math.cos(a), 2.65, 1.45 * Math.sin(a)));
        const world = (l) => l.clone().applyMatrix4(c.group.matrixWorld);
        rim.sort((p, q) => world(q).y - world(p).y);
        const grips = [rim[0], rim.find((p) => world(p).distanceTo(world(rim[0])) > 1.0 && world(p).distanceTo(world(rim[0])) < 1.6) || rim[1]];
        let aim = c.tilt;
        ch.group.position.set(c.pos.x - 2.5, ch.group.position.y, c.pos.z + 3);
        ch.isHandTracked = () => true;
        ch.getGripCurl = () => 0.9;
        ch.getHandWorldPosition = (side, out = new T.Vector3()) => out.copy(at(grips[side === 'right' ? 0 : 1], aim));
        const tilts = [];
        for (let i = 0; i < 80 && c.tilt > 0; i++) { aim = Math.max(0, aim - 0.04); await frames(1); tilts.push(c.tilt); }
        ch.getHandWorldPosition = real; ch.getGripCurl = curl;
        if (tracked) ch.isHandTracked = tracked;
        await frames(30);
        return { tilt: c.tilt, rose: tilts.length > 2 && tilts[2] < tilts[0], tilts: tilts.slice(0, 5).map((t) => +t.toFixed(2)) };
    });
    assert.ok(stood.rose, 'it rises with the hands ' + JSON.stringify(stood));
    assert.ok(stood.tilt < 0.05, `on its feet again (${stood.tilt})`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
