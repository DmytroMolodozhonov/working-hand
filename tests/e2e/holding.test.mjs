/**
 * Holding things: the bow (held through a shaky camera, shooting), shields,
 * sizes next to the hero, «Акцио» for any thing, the back (over the shoulder).
 * Run: node --test tests/e2e/holding.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8185;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('bow and shields: big enough, held through a shaky camera, shooting (creative: no arrows needed), «Акцио», on the back', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0.9 }, 15, 40);

    // sizes, and the three shields are three shapes
    const sizes = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE;
        const size = (o) => { o.updateMatrixWorld(true); const b = new T.Box3().setFromObject(o); const s = new T.Vector3(); b.getSize(s); return Math.max(s.x, s.y, s.z); };
        const hero = size(g.character.group);
        const mk = (it) => { const m = window.__zns.makeItemModel ? window.__zns.makeItemModel(it) : null; return m; };
        g.items.takeIntoHand({ kind: 'bow', uid: 'tb', type: 0, arrows: 0 }, 'left');
        g.items.takeIntoHand({ kind: 'shield', uid: 'ts1', type: 1 }, 'right');
        const bow = size(g.items.held.left.model), shield = size(g.items.held.right.model);
        const shapes = [0, 1, 2].map((t) => {
            g.items.releaseHand('right');
            g.items.takeIntoHand({ kind: 'shield', uid: 'tsx' + t, type: t }, 'right');
            const types = new Set();
            g.items.held.right.model.traverse((o) => { if (o.isMesh) types.add(o.geometry.type); });
            const b = new T.Box3().setFromObject(g.items.held.right.model); const s = new T.Vector3(); b.getSize(s);
            return [...types].sort().join(',') + ':' + (s.y / Math.max(s.x, 0.01)).toFixed(1);
        });
        g.items.releaseHand('right');
        return { hero, bow, shield, shapes, mk: !!mk };
    });
    assert.ok(sizes.bow > 2.0 && sizes.bow < 3.8, `bow ${sizes.bow.toFixed(2)} m next to a ${sizes.hero.toFixed(2)} m hero`);
    assert.ok(sizes.shield > 1.5 && sizes.shield < 2.8, `shield ${sizes.shield.toFixed(2)} m`);
    assert.equal(new Set(sizes.shapes).size, 3, 'three different shields: ' + sizes.shapes.join(' | '));

    // a shaky camera for 3 s: the bow stays in the hand
    await feed(page, () => ({ arms: 'forward', rightCurl: 0, leftCurl: 0.9, wristOffset: [(Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06] }), 75, 40);
    assert.ok(await page.evaluate(() => window.__zns.game.items.held.left?.item.kind === 'bow'), 'the bow is still in the hand');

    // shoot: the right hand to the bow, pull it back with a fist, open the fingers
    const shot = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const bowM = g.items.held.left.model;
        const yaw = ch.group.rotation.y;
        const fwd = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const zp = bowM.position.clone().addScaledVector(fwd, 15);
        const z = g._createZombie(new T.Vector3(zp.x, g.collision.groundY(zp.x, zp.z), zp.z));
        z.setSleeping?.(true);
        z.group.position.y = bowM.position.y - 1.0; // (the arrow flies at its chest)
        const hp0 = z.hp;
        const orig = ch.getHandWorldPosition.bind(ch);
        const origCurl = ch.getGripCurl.bind(ch);
        let pull = 0, curl = 1;
        ch.getHandWorldPosition = (side, out = new T.Vector3()) => (side === 'right' ? out.copy(bowM.position).addScaledVector(fwd, -0.3 - pull) : orig(side, out));
        ch.getGripCurl = (side) => (side === 'right' ? curl : origCurl(side));
        await frames(4);
        const nocked = !!g.gear.nock;
        for (let i = 1; i <= 12; i++) { pull = i * 0.15; await frames(1); }
        const drawn = g.gear.nock?.draw || 0;
        curl = 0;
        await frames(6);
        const flew = g.gear.arrows.length;
        const t0 = performance.now();
        while (z.hp >= hp0 && !z.isDead && performance.now() - t0 < 8000) await frames(2);
        ch.getHandWorldPosition = orig;
        ch.getGripCurl = origCurl;
        return { nocked, drawn, flew, hit: z.isDead || z.hp < hp0, arrowsLeft: g.items.held.left?.item.arrows };
    });
    assert.ok(shot.nocked, 'the hand at the bow puts an arrow on the string');
    assert.ok(shot.drawn > 0.6, `drawn ${shot.drawn}`);
    assert.ok(shot.flew >= 1, 'the arrow flew when the fingers opened');
    assert.ok(shot.hit, 'it hit the zombie ahead');
    assert.equal(shot.arrowsLeft, 0, 'creative: no arrows needed (still 0)');

    // outside creative an empty quiver gives no arrow
    const noArrows = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        g.config.mode = 'survival';
        const bowM = g.items.held.left.model;
        const orig = ch.getHandWorldPosition.bind(ch);
        ch.getHandWorldPosition = (side, out = new T.Vector3()) => (side === 'right' ? out.copy(bowM.position) : orig(side, out));
        await frames(4);
        const nock = !!g.gear.nock;
        ch.getHandWorldPosition = orig;
        g.config.mode = 'creative';
        return nock;
    });
    assert.equal(noArrows, false, 'no arrows — no shot outside creative');

    // «Акцио»: a shield lying 12 m ahead flies into the free hand
    const accio = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        g.items.releaseHand('left');
        const hand = ch.getHandWorldPosition('right', new T.Vector3());
        const yaw = ch.group.rotation.y;
        const fwd = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const at = hand.clone().addScaledVector(fwd, 12);
        g.items.spawnLoose({ kind: 'shield', uid: 'accio-shield', type: 2 }, at, { hover: true });
        const origR = ch.isArmRaised.bind(ch), origD = ch.getHandDirection.bind(ch);
        ch.isArmRaised = () => true;
        ch.getHandDirection = (side, out = new T.Vector3()) => out.copy(at).sub(ch.getHandWorldPosition(side, new T.Vector3())).normalize();
        g.lastSpellCastTime = 0;
        const said = g.castLocalSpell('акцио', true);
        const t0 = performance.now();
        while (!g.items.held.right && !g.items.held.left && performance.now() - t0 < 8000) await frames(2);
        ch.isArmRaised = origR; ch.getHandDirection = origD;
        return { said, got: (g.items.held.right || g.items.held.left)?.item.uid };
    });
    assert.equal(accio.got, 'accio-shield', `«Акцио» brought the shield (${accio.said})`);

    // the shield over the shoulder: on the back (a slot) — and back into the hand
    const back = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const side = g.items.held.right ? 'right' : 'left';
        const orig = ch.getHandWorldPosition.bind(ch);
        let behind = true;
        ch.getHandWorldPosition = (s, out = new T.Vector3()) => {
            if (s !== side || !behind) return orig(s, out);
            ch.group.updateMatrixWorld(true);
            return out.set(side === 'right' ? 0.3 : -0.3, 1.85, 0.2).applyMatrix4(ch.group.matrixWorld);
        };
        ch.handVelocity[side].set(0, 0, 0);
        const t0 = performance.now();
        while (g.items.held[side] && performance.now() - t0 < 6000) { ch.handVelocity[side].set(0, 0, 0); await frames(2); }
        const inSlot = g.inventory.slots.some((s) => s && s.kind === 'shield');
        const onBack = g.inventory._backModels.length;
        behind = false; await frames(30); behind = true; // (once more: an empty hand takes it)
        const t1 = performance.now();
        while (!g.items.held[side] && performance.now() - t1 < 6000) { ch.handVelocity[side].set(0, 0, 0); await frames(2); }
        ch.getHandWorldPosition = orig;
        return { inSlot, onBack, again: g.items.held[side]?.item.kind };
    });
    assert.ok(back.inSlot && back.onBack >= 1, 'the shield is on the back and in a slot');
    assert.equal(back.again, 'shield', 'an empty hand over the shoulder takes it back');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('the bow with real archer poses (in the left hand and in the right): upright, the string to the archer, the arrow flies where the bow arm points — not sideways', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // (only watching: every arrow fired, with the bow arm and the hero's facing at that moment)
    await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        g.__shots = [];
        const fire = g.gear.fire.bind(g.gear);
        g.gear.fire = (from, vel, dmg, by) => {
            const side = g.items.held.left?.item.kind === 'bow' ? 'left' : 'right';
            const shoulder = (side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor).getWorldPosition(new T.Vector3());
            const arm = ch.getHandWorldPosition(side, new T.Vector3()).sub(shoulder).normalize();
            const yaw = ch.group.rotation.y;
            g.__shots.push({ vel: vel.toArray(), arm: arm.toArray(), fwd: [-Math.sin(yaw), 0, -Math.cos(yaw)] });
            return fire(from, vel, dmg, by);
        };
    });
    const look = (side) => page.evaluate((side) => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const bow = g.items.held[side];
        if (!bow) return null;
        const yaw = ch.group.rotation.y;
        const fwd = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const shoulder = (side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor).getWorldPosition(new T.Vector3());
        const arm = ch.getHandWorldPosition(side, new T.Vector3()).sub(shoulder).normalize();
        const q = bow.model.quaternion;
        const limbs = new T.Vector3(0, 1, 0).applyQuaternion(q), ahead = new T.Vector3(1, 0, 0).applyQuaternion(q);
        const deg = (a, b) => a.angleTo(b) * 180 / Math.PI;
        const S = bow.model.userData.bowString;
        return {
            upright: Math.min(deg(limbs, new T.Vector3(0, 1, 0)), deg(limbs, new T.Vector3(0, -1, 0))),
            aheadVsFwd: deg(ahead, fwd), aheadVsArm: deg(ahead, arm), armVsFwd: deg(arm, fwd),
            nock: g.gear.nock ? { state: g.gear.nock.state, draw: g.gear.nock.draw } : null,
            pulled: S ? S.tipX - S.nockX : 0,
        };
    }, side);
    for (const side of ['left', 'right']) {
        const other = side === 'left' ? 'right' : 'left';
        // the bow hand: a fist round the grip, the thumb up, the knuckles towards the camera
        const pose = (draw, curl) => ({ archer: side, draw, [side + 'Curl']: 0.9, [side + 'Tilt']: 1.3, [side + 'Rot']: side === 'left' ? 1.57 : -1.57, [other + 'Curl']: curl });
        await page.evaluate((side) => {
            const g = window.__zns.game;
            for (const s of ['left', 'right']) g.items.releaseHand(s);
            g.gear._dropNock();
            g.__shots.length = 0;
            g.items.takeIntoHand({ kind: 'bow', uid: 'archer-' + side, type: 0, arrows: 0 }, side);
        }, side);
        // the bow held out at the camera, the other arm hanging: upright, the string towards the archer
        await feed(page, pose(null, 0), 30, 40);
        const held = await look(side);
        assert.ok(held && !held.nock, `${side}: the bow is held, no arrow yet ` + JSON.stringify(held));
        assert.ok(held.upright < 30, `${side}: the held bow stands upright-ish (${held.upright.toFixed(0)}° from upright)`);
        assert.ok(held.aheadVsFwd < 45, `${side}: its string towards the archer, its back ahead (${held.aheadVsFwd.toFixed(0)}°)`);
        // the other hand to the bow (an arrow on the string), then drawn back to the chin
        await feed(page, pose(0, 0.8), 20, 40);
        assert.equal((await look(side)).nock?.state, 'nocked', `${side}: the hand at the bow puts an arrow on the string`);
        for (let i = 1; i <= 15; i++) await feed(page, pose(i / 15, 0.8), 1, 40);
        await feed(page, pose(1, 0.8), 15, 40);
        const drawn = await look(side);
        assert.ok(drawn.nock && drawn.nock.draw > 0.35, `${side}: drawn ` + JSON.stringify(drawn));
        assert.ok(drawn.armVsFwd < 15, `${side}: the bow arm points ahead (${drawn.armVsFwd.toFixed(1)}°)`);
        assert.ok(drawn.upright < 15, `${side}: aiming, the bow stands upright (${drawn.upright.toFixed(1)}°)`);
        assert.ok(drawn.aheadVsArm < 15, `${side}: the bow turned along the bow arm (${drawn.aheadVsArm.toFixed(1)}°)`);
        assert.ok(drawn.pulled > 0.2, `${side}: the string is pulled back by the fingers (${drawn.pulled.toFixed(2)})`);
        // the fingers open: the arrow flies where the bow arm points and the hero looks
        await feed(page, pose(1, 0), 15, 40);
        const shots = await page.evaluate(() => window.__zns.game.__shots);
        assert.equal(shots.length, 1, `${side}: one arrow flew when the fingers opened`);
        const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.hypot(...a) / Math.hypot(...b)))) * 180 / Math.PI;
        const s = shots[0];
        assert.ok(ang(s.vel, s.arm) < 15, `${side}: the arrow flies along the bow arm (${ang(s.vel, s.arm).toFixed(1)}°), not sideways`);
        assert.ok(ang(s.vel, s.fwd) < 15, `${side}: the arrow flies where the hero faces (${ang(s.vel, s.fwd).toFixed(1)}°)`);
    }
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('the wand: held like a pen along the arm, the spell leaves its tip the way it points', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'tw', type: 0 }, 'right');
    });
    // the hand along the arm pointing at the camera (as one points a wand)
    await feed(page, { arms: 'forward', rightCurl: 0.8, leftCurl: 0.9, rightTilt: 1.3 }, 30, 40);
    const w = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const wandDir = new T.Vector3(), tip = g.wandMagic.tip(new T.Vector3(), wandDir);
        const fore = ch.getForearmDirection('right', new T.Vector3());
        const aim = ch.getHandDirection('right', new T.Vector3());
        const pose = g.handPose('local', 'right');
        const hand = ch.getHandWorldPosition('right', new T.Vector3());
        return {
            held: g.items.held.right?.item.kind,
            alongArm: wandDir.angleTo(fore) * 180 / Math.PI,
            aimIsWand: aim.angleTo(wandDir) * 180 / Math.PI,
            fromTip: pose.origin.distanceTo(tip),
            tipAway: tip.distanceTo(hand),
        };
    });
    assert.equal(w.held, 'wand');
    assert.ok(w.alongArm < 40, `the wand goes on along the forearm (${w.alongArm.toFixed(0)}°)`);
    assert.ok(w.aimIsWand < 3, `spells fly the way the wand points (${w.aimIsWand.toFixed(1)}°)`);
    assert.ok(w.fromTip < 0.01 && w.tipAway > 0.4, `out of the tip (${w.tipAway.toFixed(2)} m from the hand)`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('a scroll: the other hand opens it, it unrolls between the hands and is read; «Раскрой свои секреты» with a bare hand', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0.8, leftCurl: 0.2 }, 15, 40);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'scroll', uid: 'sc1', stat: 'spell', spell: 'LightningStrike' }, 'right');
        await frames(3);
        const scroll = g.items.held.right.model;
        const orig = g.scrolls._grip.bind(g.scrolls);
        const camRight = new T.Vector3(1, 0, 0).applyQuaternion(g.camera.quaternion).setY(0).normalize();
        let apart = 0;
        // the left hand comes to the scroll, then moves away to the left
        const leftG = new T.Vector3();
        g.scrolls._grip = (side) => (side === 'left' ? leftG.copy(scroll.position).addScaledVector(camRight, -0.2 - apart).setY(scroll.position.y) : orig(side));
        for (let i = 0; i < 40 && !g.scrolls.r; i++) await frames(1);
        const began = !!g.scrolls.r;
        for (let i = 1; i <= 15; i++) { apart = i * 0.13; await frames(1); }
        await frames(20);
        const R = g.scrolls.r;
        const n = new T.Vector3(0, 0, 1).applyQuaternion(R.group.quaternion);
        // the rollers are in the fists
        R.group.updateMatrixWorld(true);
        const rollers = [R.rollA, R.rollB].map((o) => o.getWorldPosition(new T.Vector3()));
        const inFists = Math.min(rollers[0].distanceTo(g.scrolls._grip('right')), rollers[1].distanceTo(g.scrolls._grip('right'))) + Math.min(rollers[0].distanceTo(leftG), rollers[1].distanceTo(leftG));
        const read = {
            open: R.open, width: R.parch.scale.x, hidden: !scroll.visible, map: !!R.mat.map, inFists,
            facing: n.dot(g.camera.position.clone().sub(R.group.position).normalize()),
            camDist: g.camera.position.distanceTo(R.group.position),
            stillHeld: g.items.held.right?.item.uid,
        };
        // hands back together: rolled up in the right fist again
        apart = -0.15;
        for (let i = 0; i < 60 && g.scrolls.r; i++) await frames(1);
        const closed = { r: !!g.scrolls.r, visible: scroll.visible, held: g.items.held.right?.item.uid };
        g.scrolls._grip = orig;
        // «Раскрой свои секреты» with no wand: the scroll in the hand is revealed
        g.lastSpellCastTime = 0;
        const said = g.castLocalSpell('раскрой свои секреты', true);
        await frames(2);
        return { began, read, closed, said, holo: !!g.wandMagic.holo };
    });
    assert.ok(r.began, 'the other hand took the scroll');
    assert.ok(r.read.open > 0.8 && r.read.width > 1.5 && r.read.hidden && r.read.map, 'it unrolled between the hands ' + JSON.stringify(r.read));
    assert.ok(r.read.facing > 0.7 && r.read.camDist < 6, 'the text looks at the reader, the camera came ' + JSON.stringify(r.read));
    assert.equal(r.read.stillHeld, 'sc1');
    assert.ok(r.read.inFists < 0.25, 'the rollers are in the fists, not floating beyond them ' + r.read.inFists);
    assert.ok(!r.closed.r && r.closed.visible && r.closed.held === 'sc1', 'rolled up again in the fist ' + JSON.stringify(r.closed));
    assert.equal(r.said, 'Reveal');
    assert.ok(r.holo, 'a hologram about the scroll, without a wand');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('magic gesture: hanging arms never wait for a spell; an arm lifted ~30° does (no need to hold it level)', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const check = async (deg) => {
        await feed(page, { raise: deg }, 25, 40);
        return page.evaluate(() => { const g = window.__zns.game; return { raised: !!g._raisedHand(), magic: !!g.isMagicActive, lift: g.currentPose?.armLift }; });
    };
    const down = await check(8);
    await new Promise((r) => setTimeout(r, 1500)); // (the magic gesture lets go after ~1.2 s)
    const down2 = await check(8);
    const small = await check(18);
    await new Promise((r) => setTimeout(r, 1500));
    const small2 = await check(18);
    const slight = await check(32);
    const level = await check(85);
    assert.ok(!small2.raised, 'lifted only ~18°: not yet ' + JSON.stringify(small2));
    assert.ok(!down2.raised && !down2.magic, 'arms hanging: no magic ' + JSON.stringify(down2));
    assert.ok(slight.raised && slight.magic, 'an arm lifted ~30°: the game waits for a spell ' + JSON.stringify(slight));
    assert.ok(level.raised && level.magic, 'level arm: too');
    assert.ok(!down.raised, 'hanging from the start: not raised');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('the hand follows the camera\'s hand fully: bent left / right at the wrist, the model\'s hand bends as much; fingers bend joint by joint', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    for (const s of ['left', 'right']) await page.evaluate((side) => window.__zns.game.items.releaseHand(side), s);
    const fingersDir = () => page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, h = g.character.getActiveHands().right;
        h.palm.updateWorldMatrix(true, false);
        const y = new T.Vector3().setFromMatrixColumn(h.palm.matrixWorld, 1).normalize();
        const fore = g.character.getForearmDirection('right', new T.Vector3());
        return { y: y.toArray(), fore: fore.toArray(), joints: h._jointsC?.index?.slice(0, 3) || null };
    });
    await feed(page, { arms: 'up', rightCurl: 0, leftCurl: 0, rightRot: 0 }, 25, 40);
    const straight = await fingersDir();
    await feed(page, { arms: 'up', rightCurl: 0, leftCurl: 0, rightRot: 0.52 }, 25, 40); // 30° aside
    const bent = await fingersDir();
    await feed(page, { arms: 'up', rightCurl: 0, leftCurl: 0, rightRot: -0.52 }, 25, 40); // 30° the other way
    const bentBack = await fingersDir();
    await feed(page, { arms: 'up', rightCurl: 0.6, leftCurl: 0 }, 25, 40); // fingers curled
    const curled = await fingersDir();
    const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;
    const d1 = ang(straight.y, bent.y), d2 = ang(straight.y, bentBack.y), d12 = ang(bent.y, bentBack.y);
    assert.ok(d1 > 20 && d1 < 40, `bent 30° one way: the model's hand turned ${d1.toFixed(1)}°`);
    assert.ok(d2 > 20 && d2 < 40, `bent 30° the other way: ${d2.toFixed(1)}°`);
    assert.ok(d12 > 45, `the two ways are opposite (${d12.toFixed(1)}° apart)`);
    assert.ok(straight.joints && straight.joints.every((v) => Math.abs(v) < 0.25), 'open hand: straight fingers ' + JSON.stringify(straight.joints));
    assert.ok(curled.joints && curled.joints[1] > 0.5, 'curled: the middle joints bend ' + JSON.stringify(curled.joints));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('pockets: the left hand put into its pocket picks the next slot; arms hanging at the sides do nothing; the right hand with a thing puts it away', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => { const g = window.__zns.game; for (const s of ['left', 'right']) g.items.releaseHand(s); g.inventory.select(-1); });
    await feed(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 60, 40); // 2.4 s just standing
    const hanging = await page.evaluate(() => window.__zns.game.inventory.selected);
    await feed(page, { arms: 'hang', pocket: 'left', rightCurl: 0 }, 20, 40); // the left hand into the pocket
    const afterLeft = await page.evaluate(() => window.__zns.game.inventory.selected);
    await feed(page, { arms: 'hang', pocket: 'left', rightCurl: 0 }, 30, 40); // kept there: no more
    const kept = await page.evaluate(() => window.__zns.game.inventory.selected);
    await feed(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 20, 40); // out
    await feed(page, { arms: 'hang', pocket: 'left', rightCurl: 0 }, 20, 40); // in again
    const again = await page.evaluate(() => window.__zns.game.inventory.selected);
    // the right hand holding an apple goes into the right pocket: the apple goes into a slot
    await page.evaluate(() => { const g = window.__zns.game; g.inventory.select(-1); g.items.takeIntoHand({ kind: 'apple', uid: 'pa1', count: 1 }, 'right'); });
    await feed(page, { arms: 'hang', rightCurl: 0.9, leftCurl: 0 }, 20, 40);
    await feed(page, { arms: 'hang', pocket: 'right', leftCurl: 0 }, 20, 40);
    const stored = await page.evaluate(() => { const g = window.__zns.game; return { held: !!g.items.held.right, slot: g.inventory.slots.some((s) => s && s.kind === 'apple') }; });
    assert.equal(hanging, -1, 'hanging arms: nothing happens');
    assert.equal(afterLeft, 0, 'the hand into the left pocket: the next slot');
    assert.equal(kept, 0, 'keeping it there: once only');
    assert.equal(again, 1, 'out and in again: the next one');
    assert.ok(!stored.held && stored.slot, 'the apple went into the pocket ' + JSON.stringify(stored));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('eating with the camera hands: the apple brought to the mouth is eaten (+HP); held out in front it is not', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'survival');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.playerHP = 5;
        g.items.takeIntoHand({ kind: 'apple', uid: 'eat1', count: 2 }, 'right');
    });
    await feed(page, { arms: 'forward', rightCurl: 0.8, leftCurl: 0 }, 40, 40);
    const before = await page.evaluate(() => ({ hp: window.__zns.game.playerHP, n: window.__zns.game.items.held.right?.item.count }));
    await feed(page, { toMouth: 'right', rightCurl: 0.8, leftCurl: 0 }, 40, 40);
    const after = await page.evaluate(() => ({ hp: window.__zns.game.playerHP, n: window.__zns.game.items.held.right?.item.count ?? 0 }));
    assert.equal(before.hp, 5, 'held out in front: not eaten');
    assert.equal(before.n, 2);
    assert.ok(after.hp > 5, `brought to the mouth: eaten (HP ${after.hp})`);
    assert.ok(after.n < 2, 'one apple fewer');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
