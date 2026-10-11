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
    const arm = [a.reach, a.forward, a.up, a.speed, a.palmUp, g.character.getGripCurl('right'), g.items._drop.right.armed ? 1 : 0].map((x) => +x.toFixed(2));
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
