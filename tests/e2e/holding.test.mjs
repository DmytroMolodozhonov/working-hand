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

test('the wand: held like a pen along the arm, the spell leaves its tip the way it points', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'tw', type: 0 }, 'right');
    });
    await feed(page, { arms: 'forward', rightCurl: 0.8, leftCurl: 0.9 }, 30, 40);
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
        const orig = ch.getHandWorldPosition.bind(ch);
        const camRight = new T.Vector3(1, 0, 0).applyQuaternion(g.camera.quaternion).setY(0).normalize();
        let apart = 0;
        // the left hand comes to the scroll, then moves away to the left
        ch.getHandWorldPosition = (side, out = new T.Vector3()) => (side === 'left' ? out.copy(scroll.position).addScaledVector(camRight, -0.2 - apart).setY(scroll.position.y) : orig(side, out));
        for (let i = 0; i < 40 && !g.scrolls.r; i++) await frames(1);
        const began = !!g.scrolls.r;
        for (let i = 1; i <= 15; i++) { apart = i * 0.13; await frames(1); }
        await frames(20);
        const R = g.scrolls.r;
        const n = new T.Vector3(0, 0, 1).applyQuaternion(R.group.quaternion);
        const read = {
            open: R.open, width: R.parch.scale.x, hidden: !scroll.visible, map: !!R.mat.map,
            facing: n.dot(g.camera.position.clone().sub(R.group.position).normalize()),
            camDist: g.camera.position.distanceTo(R.group.position),
            stillHeld: g.items.held.right?.item.uid,
        };
        // hands back together: rolled up in the right fist again
        apart = -0.15;
        for (let i = 0; i < 60 && g.scrolls.r; i++) await frames(1);
        const closed = { r: !!g.scrolls.r, visible: scroll.visible, held: g.items.held.right?.item.uid };
        ch.getHandWorldPosition = orig;
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
    assert.ok(!r.closed.r && r.closed.visible && r.closed.held === 'sc1', 'rolled up again in the fist ' + JSON.stringify(r.closed));
    assert.equal(r.said, 'Reveal');
    assert.ok(r.holo, 'a hologram about the scroll, without a wand');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
