/**
 * A real stick (a pen, a paintbrush) held in the real hand: the camera program finds
 * it (stick_detect.py) and the game turns the wand along it — the spells fly that way;
 * the hand holding it counts as closed (the wand never drops). Without it: the fingers.
 * Run: ZNS_TEST_PORT=8196 node --test tests/e2e/real-stick.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8196;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

/** The wand's direction as the picture sees it (rad, 0 = up, + = the picture's right), where spells fly, the grip. */
const wandNow = (page, side = 'right') => page.evaluate(async (side) => {
    const g = window.__zns.game, T = window.__zns.THREE, ch = g.character;
    // (read right after a drawn frame: the headless browser draws slowly)
    const f0 = g.frameCount;
    while (g.frameCount === f0) await new Promise((r) => setTimeout(r, 5));
    const dir = new T.Vector3();
    g.wandMagic.tip(new T.Vector3(), dir);
    const h = dir.clone().applyQuaternion(ch.group.getWorldQuaternion(new T.Quaternion()).invert());
    const aim = ch.getHandDirection(side, new T.Vector3());
    return {
        held: g.items.held[side]?.item.kind || null,
        pic: Math.atan2(-h.x, h.y), across: Math.hypot(h.x, h.y), ahead: -h.z,
        aimAlong: aim.angleTo(dir) * 180 / Math.PI,
        curl: ch.getGripCurl(side),
        seen: !!ch.realStick?.[side],
    };
}, side);

const angleOff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) * 180 / Math.PI;

test('a real stick in the hand: the wand and the spells go along it (any way it is turned), the open-looking hand still holds; without it the fingers lead again', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => window.__zns.game.character.setHandVersion('v4')); // (the full hand: V4)
    await feed(page, { arms: 'forward', rightCurl: 0.4, leftCurl: 0 }, 10, 40);
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'rs1', plain: true, model: 0, color: 0x8b5a2b, power: 0 }, 'right');
    });
    await feed(page, { arms: 'forward', rightCurl: 0.4, leftCurl: 0 }, 10, 40);
    const fingers = await wandNow(page);
    assert.equal(fingers.held, 'wand');
    assert.equal(fingers.seen, false, 'no stick seen without one');

    // a single glimpse of a line is not a stick
    await feed(page, { arms: 'forward', rightCurl: 0.4, leftCurl: 0, rightStick: 1.0 }, 1, 40);
    await feed(page, { arms: 'forward', rightCurl: 0.4, leftCurl: 0 }, 10, 40);
    assert.equal((await wandNow(page)).seen, false, 'one picture with a line: nothing');

    // the stick turned different ways in the picture: the wand follows it
    for (const a of [0.6, -0.5, 0.35, 0.1]) {
        await feed(page, { arms: 'forward', rightCurl: 0.4, leftCurl: 0, rightStick: a }, 8, 40);
        const w = await wandNow(page);
        assert.ok(w.seen, 'the stick is seen');
        assert.ok(angleOff(w.pic, a) < 6, `stick at ${a}: the wand at ${w.pic.toFixed(2)} in the picture`);
        assert.ok(w.aimAlong < 3, `spells fly along it (${w.aimAlong.toFixed(1)}°)`);
    }

    // a line straight across the hand (where no hand holds a stick): not taken for one
    await feed(page, { arms: 'forward', rightCurl: 0.4, leftCurl: 0, rightStick: 1.65 }, 10, 40);
    const across = await wandNow(page);
    assert.ok(angleOff(across.pic, 1.65) > 30, `a line across the hand is not the wand (${across.pic.toFixed(2)})`);

    // a stick seen short (pointing at the camera): the wand points ahead, not across
    await feed(page, { arms: 'forward', rightCurl: 0.4, leftCurl: 0, rightStick: { angle: 0.3, out: 3 } }, 6, 40);
    await feed(page, { arms: 'forward', rightCurl: 0.4, leftCurl: 0, rightStick: { angle: 0.3, out: 1 } }, 12, 40);
    const short = await wandNow(page);
    assert.ok(short.ahead > 0.7, `seen short, it points ahead (${short.ahead.toFixed(2)})`);
    assert.ok(angleOff(short.pic, 0.3) < 6, 'and still the same way across the picture');

    // the fingers around a real stick look open-ish to the network: it is a closed hand all the same
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0, rightStick: 0.4 }, 40, 40);
    const open = await wandNow(page);
    assert.ok(open.curl >= 0.85, `holding a stick reads as a closed hand (${open.curl.toFixed(2)})`);
    assert.equal(open.held, 'wand', 'the wand stays in the hand');

    // the stick put away: after a moment the fingers lead the wand again
    await feed(page, { arms: 'forward', rightCurl: 0.4, leftCurl: 0 }, 20, 40);
    const back = await wandNow(page);
    assert.equal(back.seen, false);
    assert.ok(angleOff(back.pic, fingers.pic) < 8, `back to the fingers' direction (${back.pic.toFixed(2)} vs ${fingers.pic.toFixed(2)})`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('a real stick in the left hand: the left hand\'s wand follows it; a stick by the right hand doesn\'t turn the left wand', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => window.__zns.game.character.setHandVersion('v4')); // (the full hand: V4)
    await page.evaluate(() => {
        const g = window.__zns.game;
        for (const s of ['left', 'right']) g.items.releaseHand(s);
        g.items.takeIntoHand({ kind: 'wand', uid: 'rs2', plain: true, model: 0, color: 0x8b5a2b, power: 0 }, 'left');
    });
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.4, rightStick: -0.8 }, 12, 40);
    const r = await wandNow(page, 'left');
    assert.equal(r.held, 'wand');
    assert.equal(r.seen, false, 'the right hand\'s stick is not the left hand\'s');
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.4, leftStick: -0.45 }, 10, 40);
    const l = await wandNow(page, 'left');
    assert.ok(l.seen);
    assert.ok(angleOff(l.pic, -0.45) < 6, `the left wand at ${l.pic.toFixed(2)}`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('in the browser (no camera program): a stick drawn in the camera picture round the hand is found, only while a wand is wanted (its speed: tests/unit/stick-detector.test.js)', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(() => window.__zns.game.character.setHandVersion('v4')); // (the full hand: V4)
    const r = await page.evaluate(() => {
        const ps = window.__zns.poseService;
        // a camera picture: a hand (palm, fingers half closed) with a dark brush through its grip
        const c = document.createElement('canvas');
        c.width = 640; c.height = 480;
        const x = c.getContext('2d');
        x.fillStyle = '#6b6b6b'; x.fillRect(0, 0, 640, 480);
        const size = 55, wx = 330, wy = 330, ang = 0.2;
        const bases = [[-0.35, -0.25], [-0.2, -0.85], [0, -0.9], [0.18, -0.85], [0.33, -0.75]], lens = [0.45, 0.75, 0.82, 0.75, 0.6];
        const pts = [[0, 0]];
        bases.forEach(([bx, by], f) => {
            let px = bx, py = by; pts.push([px, py]);
            for (let j = 1; j < 4; j++) { const a = 0.5 * (f ? 1 : 0.5) * Math.PI * 0.35 * j; px += Math.sin(a) * (f ? 0.25 : 0.6) * lens[f] / 3; py -= Math.cos(a) * lens[f] / 3; pts.push([px, py]); }
        });
        const P = pts.map(([a, b]) => ({ x: wx + size * (a * Math.cos(ang) - b * Math.sin(ang)), y: wy + size * (a * Math.sin(ang) + b * Math.cos(ang)) }));
        const seg = (a, b, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); };
        seg(P[0], { x: P[0].x + (P[0].x - P[9].x) * 3, y: P[0].y + (P[0].y - P[9].y) * 3 }, 40, '#c8a080');
        for (const [a, b] of [[0, 1], [1, 5], [5, 9], [9, 13], [13, 17], [17, 0], [0, 9], [5, 17], [1, 13]]) seg(P[a], P[b], 18, '#d2a688');
        for (const ch of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) for (let i = 0; i < 3; i++) seg(P[ch[i]], P[ch[i + 1]], 10, '#d2a688');
        const g0 = { x: (P[3].x + P[5].x) / 2, y: (P[3].y + P[5].y) / 2 }, sa = 0.7;
        seg({ x: g0.x - Math.sin(sa) * 40, y: g0.y + Math.cos(sa) * 40 }, { x: g0.x + Math.sin(sa) * 200, y: g0.y - Math.cos(sa) * 200 }, 7, '#2a1e14');
        const lm = P.map((p) => ({ x: p.x / 640, y: p.y / 480, z: 0 }));
        const saved = { v: ps.videoElement, inj: ps.injected, native: ps.native };
        Object.defineProperty(c, 'videoWidth', { value: 640 });
        Object.defineProperty(c, 'videoHeight', { value: 480 });
        ps.videoElement = c; ps.injected = false; ps.native = null;
        ps.wantSticks = { left: false, right: false };
        const none = ps._browserSticks(null, lm);
        ps.wantSticks = { left: false, right: true }; ps._stickAt = 0;
        const got = ps._browserSticks(null, lm);
        ps.videoElement = saved.v; ps.injected = saved.inj; ps.native = saved.native;
        return { none, got, want: sa };
    });
    assert.equal(r.none, null, 'no wand: the browser doesn\'t look');
    assert.equal(r.got.length, 1, JSON.stringify(r));
    const s = r.got[0];
    assert.ok(angleOff(Math.atan2(s.dir[0], -s.dir[1]), r.want) < 4, `found at ${Math.atan2(s.dir[0], -s.dir[1]).toFixed(2)}`);
    assert.ok(s.conf >= 0.45 && s.out > 1);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
