/**
 * The hands: nothing falls out by accident, real throws (wind-up, swing, let go),
 * taking things from chests and pedestals, things held really in the fingers.
 * Run: node --test tests/e2e/hands.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed, frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8187;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

/** Feed pose frames, each one seen by at least one game frame (a slow headless page draws few). */
async function feedF(page, opts, count) {
    for (let i = 0; i < count; i++) {
        const f0 = await page.evaluate(() => window.__zns.game.frameCount);
        await feed(page, opts, 1, 30);
        for (let k = 0; k < 50 && (await page.evaluate(() => window.__zns.game.frameCount)) < f0 + 1; k++) await new Promise((r) => setTimeout(r, 10));
    }
}

/**
 * An overhand throw as the camera sees it: the hand drawn back by the head, then swung forward
 * over a few pictures (~30 a second), the fingers still closed, then they open.
 */
async function overhand(page, { curlOpen = 0, steps = 4 } = {}) {
    await feedF(page, { windup: 'right', rightCurl: 0.9, leftCurl: 0.9 }, 10);
    const a = frame({ windup: 'right', rightCurl: 0.9, leftCurl: 0.9 }), b = frame({ arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 });
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const f = frame({ arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 });
        f.poseLandmarks = a.poseLandmarks.map((p, k) => ({ ...p, x: p.x + (b.poseLandmarks[k].x - p.x) * t, y: p.y + (b.poseLandmarks[k].y - p.y) * t, z: p.z + (b.poseLandmarks[k].z - p.z) * t }));
        f.hands = b.hands.map((h, j) => ({ ...h, landmarks: h.landmarks.map((p, k) => { const q = a.hands[j].landmarks[k]; return { x: q.x + (p.x - q.x) * t, y: q.y + (p.y - q.y) * t, z: q.z + (p.z - q.z) * t }; }) }));
        await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, f);
        await new Promise((r) => setTimeout(r, 33));
    }
    await feed(page, { arms: 'forward', rightCurl: curlOpen, leftCurl: 0.9 }, 8, 33);
}

/** (for the messages) the right arm each frame: reach, forward, up, speed, palm up, curl, cocked, peak */
const watch = (page) => page.evaluate(() => {
    const g = window.__zns.game, ch = g.character;
    window.__ring = [];
    const upd = g.items.update.bind(g.items);
    g.items.update = (dt) => {
        const a = ch.armState('right'), t = g.items._thr.right;
        window.__ring.push([g.frameCount, ...[a.reach, a.forward, a.up, a.speed, a.palmUp, ch.getGripCurl('right'), a.hand.y - a.shoulder.y].map((x) => +x.toFixed(2)), t.cock ? 'C' : '-', t.peak ? 'P' + t.peak.speed.toFixed(1) : '-', t.held ? 'H' : '-'].join(' '));
        if (window.__ring.length > 30) window.__ring.shift();
        return upd(dt);
    };
});
const ring = (page) => page.evaluate(() => (window.__ring || []).join('\n'));

const state = (page) => page.evaluate(() => {
    const g = window.__zns.game;
    const loose = [...g.items.loose.values()].filter((L) => L.item.uid === 'acc-apple').map((L) => ({ v: Math.hypot(L.vel.x, L.vel.z), thrower: L.thrower || null }));
    const a = g.character.armState('right');
    const why = window.__why || [];
    const arm = [a.reach, a.forward, a.up, a.speed, a.palmUp, g.character.getGripCurl('right'), g.items._trk.right.armed ? 1 : 0].map((x) => +x.toFixed(2));
    return { apple: g.items.held.right?.item.uid || null, sword: g.weapons.hands.left.held?.id || null, loose, arm, why };
});

test('nothing falls out of the hands by accident; the outstretched hand opened lets it fall', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 15, 40);
    // an apple in the right fist, a sword in the left
    const swordId = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.inventory.select?.(-1);
        g.items.takeIntoHand({ kind: 'apple', uid: 'acc-apple', count: 1 }, 'right');
        const w = g.weapons.spawn('sword', ch.getHandWorldPosition('left', new T.Vector3()), new T.Quaternion());
        g.weapons.grab(w, 'left');
        // (why a thing left a hand, for the messages)
        window.__why = [];
        const thr = g.items._throw.bind(g.items), rel = g.weapons.release.bind(g.weapons);
        const note = (what, side) => { const a = ch.armState(side); window.__why.push([what, side, g.frameCount, ...[a.reach, a.forward, a.up, a.speed, a.palmUp, ch.getGripCurl(side)].map((x) => +x.toFixed(2))].join(' ')); };
        g.items._throw = (side, v, o) => { note('item v=' + v.length().toFixed(1), side); return thr(side, v, o); };
        g.weapons.release = (side) => { if (g.weapons.hands[side].held) note('weapon', side); return rel(side); };
        return w.id;
    });
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10, 40);
    let s = await state(page);
    assert.equal(s.apple, 'acc-apple'); assert.equal(s.sword, swordId);

    // half-open hands with the arms hanging at the sides: kept
    await feed(page, { arms: 'hang', rightCurl: 0.1, leftCurl: 0.1 }, 60, 40);
    s = await state(page);
    assert.equal(s.apple, 'acc-apple', 'open hand at the side: the apple stays ' + JSON.stringify(s));
    assert.equal(s.sword, swordId, 'open hand at the side: the sword stays');

    // the camera loses both hands for 3.6 s (the drawn fingers relax): kept
    await feed(page, { arms: 'forward', rightCurl: null, leftCurl: null }, 90, 40);
    s = await state(page);
    assert.equal(s.apple, 'acc-apple', 'hands lost: the apple stays'); assert.equal(s.sword, swordId, 'hands lost: the sword stays');
    await feed(page, { arms: 'hang', rightCurl: 0.9, leftCurl: 0.9 }, 10, 40);

    // running 7.5 m/s for 1.2 s and stopping, the hands loose at the sides: kept
    await page.evaluate(() => {
        const g = window.__zns.game, ch = g.character;
        const upd = ch.update.bind(ch), t0 = performance.now();
        ch.__upd = upd;
        ch.update = (dt, col, move) => { if (performance.now() - t0 < 1200) { ch.group.position.z -= 7.5 * dt; } return upd(dt, col, move); };
    });
    await feed(page, (i) => ({ arms: 'hang', rightCurl: 0.12, leftCurl: 0.12, bob: (i % 2) * 0.02 }), 45, 40);
    await page.evaluate(() => { const ch = window.__zns.game.character; ch.update = ch.__upd; });
    s = await state(page);
    assert.equal(s.apple, 'acc-apple', 'running and stopping: the apple stays ' + JSON.stringify(s)); assert.equal(s.sword, swordId);

    // crouching and standing up: kept
    await feed(page, { arms: 'hang', noseY: 0.6, rightCurl: 0.15, leftCurl: 0.15 }, 15, 40);
    await feed(page, { arms: 'hang', noseY: 0.25, rightCurl: 0.15, leftCurl: 0.15 }, 15, 40);
    s = await state(page);
    assert.equal(s.apple, 'acc-apple', 'crouching: the apple stays'); assert.equal(s.sword, swordId);

    // quick jabs from down to forward and back (no wind-up), the hand loose: kept
    await feed(page, (i) => ({ arms: Math.floor(i / 2) % 2 ? 'forward' : 'down', rightCurl: 0.15, leftCurl: 0.9 }), 16, 40);
    await feed(page, { arms: 'hang', rightCurl: 0.9, leftCurl: 0.9 }, 10, 40);
    s = await state(page);
    assert.equal(s.apple, 'acc-apple', 'quick jabs: the apple stays ' + JSON.stringify(s));

    // now the arms stretched out forward and the hands clearly opened: both fall out
    for (let i = 0; i < 12; i++) {
        await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 5, 40);
        s = await state(page);
        if (!s.apple && !s.sword) break;
    }
    assert.equal(s.apple, null, 'the outstretched hand opened: the apple fell ' + JSON.stringify(s));
    assert.equal(s.loose.length, 1, 'the apple lies loose');
    assert.ok(s.loose[0].v < 3, 'it fell, not thrown (sideways speed ' + s.loose[0].v + ')');
    assert.equal(s.sword, null, 'the sword fell out of the left hand too');
    assert.equal(await page.evaluate((id) => window.__zns.game.weapons.byId.get(id)?.holder ?? null, swordId), null);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('throwing: a wind-up, a swing and the fingers let go — it flies far along the throw; a shield less far; a fist kept closed keeps the sword', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 15, 40);
    const throwIt = async (item) => {
        await page.evaluate((item) => {
            const g = window.__zns.game;
            for (const s of ['left', 'right']) { g.items.releaseHand(s); g.weapons.release(s); }
            g.items.takeIntoHand(item, 'right');
            window.__thrown = null;
        }, item);
        await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10);
        await overhand(page);
        return page.evaluate(async (uid) => {
            const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
            const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
            const L = g.items.loose.get(uid);
            if (!L) return { held: g.items.held.right?.item.uid || null };
            const from = ch.getHandWorldPosition('right', new T.Vector3());
            const v = L.vel.clone();
            const look = new T.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion).setY(0).normalize();
            const t0 = performance.now();
            while (!L.rest && performance.now() - t0 < 8000) await frames(2);
            const d = L.model.position.clone().sub(from).setY(0);
            return { held: g.items.held.right?.item.uid || null, thrower: L.thrower === g.localId || L.thrower == null, speed: v.length(), dist: d.length(), ang: v.clone().setY(0).angleTo(look) * 180 / Math.PI, dirAng: d.angleTo(look) * 180 / Math.PI };
        }, item.uid);
    };
    await watch(page);
    const apple = await throwIt({ kind: 'apple', uid: 'thr-apple', count: 1 });
    assert.equal(apple.held, null, 'the apple left the hand ' + JSON.stringify(apple) + '\n' + await ring(page));
    assert.ok(apple.ang < 15 && apple.dirAng < 15, 'it flew where the thrower faces ' + JSON.stringify(apple) + '\n' + await ring(page));
    assert.ok(apple.dist > 8, 'it flew far ' + JSON.stringify(apple));
    const shield = await throwIt({ kind: 'shield', uid: 'thr-shield', type: 1 });
    assert.equal(shield.held, null, 'the shield left the hand ' + JSON.stringify(shield) + '\n' + await ring(page));
    assert.ok(shield.dist < 0.6 * apple.dist, `a heavy shield flies less far (${shield.dist.toFixed(1)} vs ${apple.dist.toFixed(1)})`);

    // the same swing with the fist kept closed on a sword: a chop, it stays in the hand
    const kept = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        for (const s of ['left', 'right']) { g.items.releaseHand(s); g.weapons.release(s); }
        const w = g.weapons.spawn('sword', ch.getHandWorldPosition('right', new T.Vector3()), new T.Quaternion());
        g.weapons.grab(w, 'right');
        return w.id;
    });
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10);
    await overhand(page, { curlOpen: 0.9 });
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10);
    assert.equal(await page.evaluate(() => window.__zns.game.weapons.hands.right.held?.id), kept, 'a chop with the fist closed keeps the sword');
    // …and a real throw of the sword: it flies along the swing
    await overhand(page);
    const sw = await page.evaluate((id) => { const w = window.__zns.game.weapons.byId.get(id); return { held: !!window.__zns.game.weapons.hands.right.held, v: w.velocity.length() }; }, kept);
    assert.ok(!sw.held, 'the thrown sword left the hand ' + JSON.stringify(sw));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

/** Point a model arm straight at a world point (the synthetic camera can't aim the arm in depth). */
const aimArm = (page, side, target) => page.evaluate(({ side, target }) => {
    const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
    if (!ch.__aimWrapped) {
        const orig = ch.updateArmsLookAt.bind(ch);
        ch.updateArmsLookAt = (pose, dt) => {
            orig(pose, dt);
            const a = window.__aimArm;
            if (!a) return;
            const anchor = a.side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor, elbow = a.side === 'left' ? ch.leftElbowAnchor : ch.rightElbowAnchor;
            ch.group.updateMatrixWorld(true);
            anchor.up.set(0, 1, 0);
            anchor.lookAt(new T.Vector3(...a.target));
            elbow.rotation.set(0, 0, 0);
            anchor.updateMatrixWorld(true);
        };
        ch.__aimWrapped = true;
    }
    window.__aimArm = target ? { side, target } : null;
}, { side, target });

test('the axe floating over its pedestal: the hand stops at its handle, a fist bumping it takes nothing, open → close takes it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 30); // (a fist for a while: not "just closed")
    // stand in front of the axe's pedestal (the right shoulder in line with it), facing it
    const at = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const w = g.weapons.byId.get('tA');
        for (const s of ['left', 'right']) { g.items.releaseHand(s); g.weapons.release(s); }
        g.cameraBaseRotation = 0;
        ch.group.position.set(w.hover.base.x - 0.7, ch.group.position.y, w.hover.base.z + 1.65);
        const [a, b] = w.getHandleSegment();
        return { handle: a.lerp(b, 0.5).toArray(), base: w.hover.base.toArray() };
    });
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 15, 40);
    const reach = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, w = g.weapons.byId.get('tA');
        const [a, b] = w.getHandleSegment();
        const sh = ch.rightArmAnchor.getWorldPosition(new T.Vector3());
        return { dist: sh.distanceTo(a.clone().lerp(b, 0.5)), dy: a.clone().lerp(b, 0.5).y - sh.y, me: ch.group.position.toArray(), sh: sh.toArray(), h: a.clone().lerp(b, 0.5).toArray(), base: w.hover?.base.toArray(), ry: ch.group.rotation.y };
    });
    assert.ok(reach.dist < 1.9 + 0.2, 'standing at the pedestal the handle is within an arm\'s reach ' + JSON.stringify(reach));
    assert.ok(Math.abs(reach.dy) < 0.5, 'the handle floats at about shoulder height ' + JSON.stringify(reach));
    // the arm reaches for the handle (a little beyond: the hand must stop at it, not go through)
    const target = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, w = g.weapons.byId.get('tA');
        const [a, b] = w.getHandleSegment();
        const h = a.clone().lerp(b, 0.5), sh = ch.rightArmAnchor.getWorldPosition(new T.Vector3());
        return sh.clone().add(h.sub(sh).multiplyScalar(1.3)).toArray();
    });
    await aimArm(page, 'right', target);
    const probe = () => page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, w = g.weapons.byId.get('tA');
        const hand = ch.getActiveHands().right;
        const palm = hand.palm.getWorldPosition(new T.Vector3());
        const [a, b] = w.getHandleSegment();
        const l = new T.Line3(a, b), q = new T.Vector3();
        l.closestPointToPoint(palm, true, q);
        return { held: g.weapons.hands.right.held?.id || null, palmToHandle: palm.distanceTo(q), r: w.spec.handleRadius * w.S };
    });
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 30);
    const fist = await probe();
    assert.equal(fist.held, null, 'a closed fist bumping into the axe does not take it');
    assert.ok(fist.palmToHandle > fist.r, 'the hand stops at the handle, not inside it ' + JSON.stringify(fist));
    await feedF(page, { arms: 'forward', rightCurl: 0, leftCurl: 0.9 }, 10);
    const open = await probe();
    assert.ok(open.palmToHandle > open.r, 'the open hand does not go through the handle ' + JSON.stringify(open));
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 12);
    const got = await probe();
    assert.equal(got.held, 'tA', 'open, then the fingers close on the handle: the axe is in the hand ' + JSON.stringify(got));
    await aimArm(page, 'right', null);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('the bow in the left hand, drawn with the right (and the other way round): an arrow goes on the string, it is drawn and flies — even when the camera reads the bow fist as open', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        g.__shots = [];
        const fire = g.gear.fire.bind(g.gear);
        g.gear.fire = (from, vel, dmg, by) => { g.__shots.push(vel.toArray()); return fire(from, vel, dmg, by); };
    });
    for (const [side, bowCurl] of [['left', 0.9], ['left', 0.15], ['right', 0.15]]) {
        const other = side === 'left' ? 'right' : 'left';
        const pose = (draw, curl) => ({ archer: side, draw, [side + 'Curl']: bowCurl, [side + 'Tilt']: 1.3, [side + 'Rot']: side === 'left' ? 1.57 : -1.57, [other + 'Curl']: curl });
        await page.evaluate(() => { const g = window.__zns.game; for (const s of ['left', 'right']) g.items.releaseHand(s); g.gear._dropNock(); });
        await feed(page, { arms: 'hang' }, 15, 40);
        await page.evaluate((side) => { const g = window.__zns.game; g.__shots.length = 0; g.items.takeIntoHand({ kind: 'bow', uid: 'lb-' + side + Math.random(), type: 0, arrows: 0 }, side); }, side);
        await feedF(page, pose(null, 0), 15);
        await feedF(page, pose(0, 0.8), 12);
        const nocked = await page.evaluate(() => window.__zns.game.gear.nock?.state || null);
        for (let i = 1; i <= 10; i++) await feedF(page, pose(i / 10, 0.8), 1);
        await feedF(page, pose(1, 0.8), 8);
        const drawn = await page.evaluate((side) => { const g = window.__zns.game; return { draw: g.gear.nock?.draw || 0, bowIn: g.items.held[side]?.item.kind || null }; }, side);
        await feedF(page, pose(1, 0), 12);
        const after = await page.evaluate((side) => { const g = window.__zns.game; return { shots: g.__shots.length, bowIn: g.items.held[side]?.item.kind || null }; }, side);
        const tag = `${side} hand (the bow fist read as ${bowCurl})`;
        assert.equal(nocked, 'nocked', `${tag}: the other hand at the bow puts an arrow on the string`);
        assert.ok(drawn.draw > 0.35, `${tag}: the string is drawn ` + JSON.stringify(drawn));
        assert.equal(drawn.bowIn, 'bow', `${tag}: the bow stays in its hand while drawing`);
        assert.equal(after.shots, 1, `${tag}: the fingers open — the arrow flies`);
        assert.equal(after.bowIn, 'bow', `${tag}: the bow is still in the ${side} hand`);
    }
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

/** Reach for a loose thing with the right hand: open, then the fingers close on it. → what the hand holds */
async function takeLoose(page, uid) {
    const target = await page.evaluate((uid) => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, L = g.items.loose.get(uid);
        const c = L.model.localToWorld(L.shape.c.clone()), sh = ch.rightArmAnchor.getWorldPosition(new T.Vector3());
        return sh.clone().add(c.sub(sh).multiplyScalar(1.0)).toArray();
    }, uid);
    await aimArm(page, 'right', target);
    // (as a player would: if the fingers missed it, open and close once more)
    for (let k = 0; k < 2 && !(await page.evaluate(() => window.__zns.game.items.held.right)); k++) {
        await feedF(page, { arms: 'forward', rightCurl: 0, leftCurl: 0.9 }, 10);
        await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10);
    }
    await aimArm(page, 'right', null);
    return page.evaluate((uid) => {
        const g = window.__zns.game, L = g.items.loose.get(uid);
        return g.items.held.right?.item.uid || JSON.stringify({ left: g.items.held.left?.item.uid, loose: !!L, reach: L ? g.items._reachTo(L, g.weapons.palmFrame('right').G) : null });
    }, uid);
}

test('things on pedestals and in the creative test chest float within reach; a fist takes nothing, closing fingers take them', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 30);
    // the wand's pedestal: stand at its foot
    const wand = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        for (const s of ['left', 'right']) { g.items.releaseHand(s); g.weapons.release(s); }
        const L = g.items.loose.get('cw0');
        g.cameraBaseRotation = 0;
        ch.group.position.set(L.hover.x - 0.7, ch.group.position.y, L.hover.z + 1.65);
        return L.hover.toArray();
    });
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 15);
    const near = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, L = g.items.loose.get('cw0');
        const sh = ch.rightArmAnchor.getWorldPosition(new T.Vector3());
        return { dy: L.hover.y - sh.y, dist: L.hover.distanceTo(sh) };
    });
    assert.ok(Math.abs(near.dy) < 0.35 && near.dist < 2.1, 'the wand floats at the shoulder within reach ' + JSON.stringify(near));
    // a fist pushed to it takes nothing
    const tgt = await page.evaluate(() => { const g = window.__zns.game, L = g.items.loose.get('cw0'); return L.hover.toArray(); });
    await aimArm(page, 'right', tgt);
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 25);
    assert.equal(await page.evaluate(() => window.__zns.game.items.held.right?.item.uid || null), null, 'a fist bumping the wand takes nothing');
    await aimArm(page, 'right', null);
    assert.equal(await takeLoose(page, 'cw0'), 'cw0', 'open, then closing on it: the wand is in the hand');
    // the bow from its pedestal stays in the right hand that took it
    await page.evaluate(() => {
        const g = window.__zns.game, ch = g.character;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
    });
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 30); // (not a "just closed" fist when it gets there)
    await page.evaluate(() => {
        const g = window.__zns.game, ch = g.character;
        const L = g.items.loose.get('cb0');
        ch.group.position.set(L.hover.x - 0.7, ch.group.position.y, L.hover.z + 1.65);
    });
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 15);
    assert.equal(await takeLoose(page, 'cb0'), 'cb0', 'the bow taken with the right hand is in the right hand');

    // the creative test chest: everything that comes out floats in reach, and is taken
    await page.evaluate(() => {
        const g = window.__zns.game, ch = g.character;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        window.__before = new Set(g.items.loose.keys());
        const c = g.chests.find((c) => c.refill);
        const p = c.getPosition();
        g.cameraBaseRotation = -Math.PI / 2; // (facing +x: the chest's front looks at −x)
        ch.group.rotation.y = -Math.PI / 2;
        ch.group.position.set(p.x - 1.9, ch.group.position.y, p.z);
    });
    let fresh = [];
    for (let i = 0; i < 20 && !fresh.length; i++) {
        await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 5);
        fresh = await page.evaluate(() => [...window.__zns.game.items.loose.keys()].filter((k) => !window.__before.has(k)));
    }
    assert.ok(fresh.length >= 1, 'the chest opened and things came out');
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 30); // (they rise out of it)
    const spots = await page.evaluate((fresh) => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const sh = ch.rightArmAnchor.getWorldPosition(new T.Vector3());
        return fresh.map((k) => { const L = g.items.loose.get(k); return L ? { k, kind: L.item.kind, dy: +(L.hover.y - sh.y).toFixed(2), d: +L.hover.distanceTo(sh).toFixed(2) } : null; }).filter(Boolean);
    }, fresh);
    for (const s of spots) assert.ok(s.dy > -0.6 && s.dy < 0.35 && s.d < 2.6, 'out of the chest within reach ' + JSON.stringify(spots));
    const first = spots.find((s) => s.kind !== 'coins' && s.kind !== 'arrows' && s.kind !== 'logs');
    if (first) assert.equal(await takeLoose(page, first.k), first.k, 'taken out of the chest by the closing fingers ' + JSON.stringify(first));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('everything is held really in the fingers: nothing floats, nothing sits inside the palm, the fingers close on it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feedF(page, { arms: 'forward', rightCurl: 0.85, leftCurl: 0.85 }, 10);
    const kinds = [{ kind: 'apple' }, { kind: 'bread' }, { kind: 'cheese' }, { kind: 'pie' }, { kind: 'meat' }, { kind: 'wool' }, { kind: 'scroll', stat: 'spell', spell: 'Thunderwave' }, { kind: 'hammer' }, { kind: 'bow', type: 0, arrows: 0 }, { kind: 'coins', count: 5 }, { kind: 'backpack', slots: 3, color: 0x7a4a24 }];
    const out = [];
    for (const it of kinds) {
        await page.evaluate((it) => { const g = window.__zns.game; for (const s of ['left', 'right']) g.items.releaseHand(s); g.gear._dropNock(); g.items.takeIntoHand({ ...it, uid: 'hold-' + it.kind }, 'right'); }, it);
        await feedF(page, { arms: 'forward', rightCurl: 0.85, leftCurl: 0.85 }, 12);
        out.push(await page.evaluate(() => {
            const g = window.__zns.game, T = window.__zns.THREE, hand = g.character.getActiveHands().right, h = g.items.held.right;
            if (!h) return null;
            h.model.updateMatrixWorld(true); hand.group.updateMatrixWorld(true);
            // the thing's surface: the vertices of its meshes (world)
            const pts = [];
            h.model.traverse((o) => { if (!o.isMesh || !o.visible) return; const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i++) pts.push(new T.Vector3().fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld)); });
            // the hand's bones: boxes
            const bones = [{ name: 'palm', m: hand.palm }];
            for (const [f, segs] of Object.entries(hand.fingerMeshes)) segs.forEach((s, i) => bones.push({ name: f + i, m: s.mesh, finger: f }));
            let inside = 0;
            const touch = new Set();
            const inv = new T.Matrix4(), q = new T.Vector3();
            for (const b of bones) {
                const pr = b.m.geometry.parameters, hx = pr.width / 2, hy = pr.height / 2, hz = pr.depth / 2;
                inv.copy(b.m.matrixWorld).invert();
                for (const p of pts) {
                    q.copy(p).applyMatrix4(inv);
                    const dx = Math.abs(q.x) - hx, dy = Math.abs(q.y) - hy, dz = Math.abs(q.z) - hz;
                    if (dx < -0.01 && dy < -0.01 && dz < -0.01) { inside++; window.__inBones = window.__inBones || {}; window.__inBones[b.name] = (window.__inBones[b.name] || 0) + 1; }
                    else if (b.finger && Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) < 0.03) touch.add(b.finger);
                }
            }
            const bonesIn = window.__inBones || {}; window.__inBones = {};
            return { kind: h.item.kind, share: +(inside / Math.max(1, pts.length)).toFixed(3), fingers: [...touch], bonesIn };
        }));
    }
    for (const r of out) {
        assert.ok(r, 'held');
        assert.ok(r.share < 0.06, `${r.kind}: not inside the hand (${(r.share * 100).toFixed(1)}% of it inside) ` + JSON.stringify(out));
        assert.ok(r.fingers.length >= 2, `${r.kind}: the fingers touch it (${r.fingers.join(', ')}) ` + JSON.stringify(out));
    }
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('the wand never flies off from flicks, jitter or a wand raised to cast; a real wind-up behind the shoulder throws the wand and the axe; the axe\'s edge faces forward in the hand', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10);
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const s of ['left', 'right']) { g.items.releaseHand(s); g.weapons.release(s); }
        g.items.takeIntoHand({ kind: 'wand', uid: 'thr-wand', plain: true, model: 0, color: 0x8b5a2b, power: 0 }, 'right');
    });
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10);
    const wandHeld = () => page.evaluate(() => window.__zns.game.items.held.right?.item.uid === 'thr-wand');
    await watch(page);
    // a shaky camera, the fingers flickering open and shut
    await feedF(page, (i) => ({ arms: 'forward', rightCurl: i % 3 ? 0.9 : 0.15, leftCurl: 0.9, wristOffset: [(Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08] }), 30);
    assert.ok(await wandHeld(), 'jitter and flickering fingers: the wand stays');
    // quick flicks from down to forward with a loose hand
    await feedF(page, (i) => ({ arms: Math.floor(i / 2) % 2 ? 'forward' : 'down', rightCurl: 0.2, leftCurl: 0.9 }), 16);
    assert.ok(await wandHeld(), 'quick flicks: the wand stays');
    // raised high to cast, then pointed forward fast with the fingers loose — four times
    for (let k = 0; k < 4; k++) {
        await feedF(page, { arms: 'up', rightCurl: 0.9, leftCurl: 0.9 }, 6);
        await feedF(page, { arms: 'forward', rightCurl: 0.15, leftCurl: 0.9 }, 6);
    }
    assert.ok(await wandHeld(), 'raised to cast and pointed: the wand stays');
    // a real throw: drawn back behind the shoulder, a strong fast swing, the fingers open
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 8);
    await overhand(page, { steps: 2 });
    const wand = await page.evaluate(() => { const g = window.__zns.game, L = g.items.loose.get('thr-wand'); return { held: !!g.items.held.right, loose: !!L, v: L ? L.vel.length() : 0 }; });
    assert.ok(!wand.held && wand.loose && wand.v > 3, 'a real wind-up and throw: the wand flies ' + JSON.stringify(wand) + '\n' + await ring(page));

    // the axe: its edge faces forward (where the fist strikes, in line with the knuckles) — either hand
    const edge = await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
        const out = {};
        for (const side of ['right', 'left']) {
            for (const s of ['left', 'right']) { g.items.releaseHand(s); g.weapons.release(s); }
            const w = g.weapons.byId.get('tA');
            // (grabbed the "wrong" way round: its edge towards the wrist)
            w.quaternion.copy(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI).premultiply(ch.getGripObject(side).getWorldQuaternion(new T.Quaternion())));
            w.position.copy(ch.getHandWorldPosition(side, new T.Vector3()));
            g.weapons.grab(w, side);
            const hs = g.weapons.hands[side];
            const f = g.weapons.palmFrame(side);
            const q = f.q.clone().multiply(hs.relC.q);
            out[side] = new T.Vector3(1, 0, 0).applyQuaternion(q).dot(f.Y);
        }
        return out;
    });
    assert.ok(edge.right > 0.7 && edge.left > 0.7, 'the axe\'s edge faces forward in either hand ' + JSON.stringify(edge));
    await page.evaluate(() => { const g = window.__zns.game; g.weapons.release('left'); g.weapons.grab(g.weapons.byId.get('tA'), 'right'); });
    await feedF(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10);
    await overhand(page, { steps: 2 });
    const axe = await page.evaluate(() => { const g = window.__zns.game, w = g.weapons.byId.get('tA'); return { held: !!g.weapons.hands.right.held, v: w.velocity.length() }; });
    assert.ok(!axe.held && axe.v > 3, 'a real wind-up throws the heavy axe too ' + JSON.stringify(axe));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('the sword follows the wrist smoothly (V3 hands): turned, it stands up / sideways / down as before; the wrist bent to the little finger carries the point forward for a thrust', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await page.evaluate(() => {
        const g = window.__zns.game;
        g.character.setHandVersion('v3');
        g.character.rightSimplifiedHand.aspect = 1; // (the synthetic hands are drawn in a square picture)
    });
    await feedF(page, { arms: 'forward', rightCurl: 0.95 }, 6);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const w = g.weapons.byId.get('tS'); w.hover = null;
        g.weapons.grab(w, 'right', 0.5);
    });
    const rots = [-1.4, -0.7, 0, 0.7, 1.4], bends = [-0.3, 0, 0.3, 0.6];
    const res = {};
    for (const rot of rots) for (const bend of bends) {
        await feedF(page, { arms: 'forward', rightCurl: 0.95, rightRot: rot, rightBend: bend }, 8);
        res[rot + '|' + bend] = await page.evaluate(() => {
            const g = window.__zns.game, T = window.__zns.THREE;
            const [b, t] = g.weapons.hands.right.held.getBladeSegment();
            const d = t.sub(b).normalize();
            return { d: d.toArray(), fore: d.dot(g.character.getForearmDirection('right', new T.Vector3())) };
        });
    }
    const at = (r, b) => res[r + '|' + b];
    const show = () => rots.map((r) => `rot ${r}: ` + bends.map((b) => `${b}→${at(r, b).fore.toFixed(2)} (up ${at(r, b).d[1].toFixed(2)})`).join('  ')).join('\n');
    // a straight wrist: across the forearm, as before — turning it stands the blade up … down
    for (const r of rots) assert.ok(Math.abs(at(r, 0).fore) < 0.4, `straight wrist: the blade across the arm\n${show()}`);
    const ups = rots.map((r) => at(r, 0).d[1]);
    assert.ok(Math.max(...ups) > 0.85 && Math.min(...ups) < -0.6, `turned, it goes from up to down\n${show()}`);
    // the wrist bent to the little finger: the point goes forward (a thrust), more the more it bends
    for (const r of rots) {
        const f = bends.map((b) => at(r, b).fore);
        for (let i = 1; i < f.length; i++) assert.ok(f[i] > f[i - 1] - 0.03, `bending more, the point goes more forward (rot ${r})\n${show()}`);
        assert.ok(at(r, 0.6).fore > 0.7, `bent: the point forward for a thrust (rot ${r})\n${show()}`);
    }
    // smooth: neighbouring wrist poses never jump the blade around
    for (const b of bends) for (let i = 1; i < rots.length; i++) {
        const a1 = at(rots[i - 1], b).d, a2 = at(rots[i], b).d;
        const ang = Math.acos(Math.max(-1, Math.min(1, a1[0] * a2[0] + a1[1] * a2[1] + a1[2] * a2[2])));
        assert.ok(ang < 1.2, `no jump between rot ${rots[i - 1]} and ${rots[i]} (bend ${b}): ${ang.toFixed(2)} rad\n${show()}`);
    }
    console.log(show());
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
