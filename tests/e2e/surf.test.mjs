/**
 * Surfboards — in a real browser: made by a spell, carried by the rails, ridden on waves.
 * Run: node --test tests/e2e/surf.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8171;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);
const surf = (page) => page.evaluate(() => window.__zns.game.boards.debugState());

test('surfboard: two hands on the rails carry it, it goes onto the sea, one foot on, paddle, catch a wave, stand, lean, fall', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    // ---- «Create a Board» in Creative: out of nothing, where the hand points
    await feed(page, { arms: 'forward' }, 15);
    const made = await page.evaluate(() => {
        const g = window.__zns.game;
        const before = g.boards.reg.map.size;
        g.lastMagicHand = 'right';
        const r = g.castLocalSpell('Create a Board', true);
        return { r, n: g.boards.reg.map.size - before, cboard: !!g.boards.reg.map.get('cboard0') };
    });
    assert.equal(made.r, 'CreateBoard');
    assert.equal(made.n, 1, 'a new board');
    assert.ok(made.cboard, 'the Creative board by the pedestals');

    // ---- on the flat ground by the start: the board held up in front at the hands
    await page.evaluate(() => {
        const g = window.__zns.game;
        g.cameraBaseRotation = 0; g.smoothBody = 0; g.character.setBodyRotation(0);
        g.character.group.position.set(0, 1.5, 12);
    });
    await frames(page, 5);
    await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0 }, 12);
    await page.evaluate(() => {
        const g = window.__zns.game, B = g.boards;
        const L = g.weapons.palmFrame('left', {}).G.clone(), R = g.weapons.palmFrame('right', {}).G.clone();
        const b = B.reg.map.get('cboard0'), m = B.models.get('cboard0');
        // the board lying flat across the hands, its rails in the palms
        const mid = L.clone().add(R).multiplyScalar(0.5);
        const across = R.clone().sub(L).setY(0).normalize();
        const yaw = Math.atan2(-across.z, across.x);
        m.model.position.copy(mid).add(new window.__zns.THREE.Vector3(0, 0, 0));
        m.model.quaternion.setFromEuler(new window.__zns.THREE.Euler(0, yaw, 0, 'YXZ'));
        b.st = 'rest'; B._setBox(b, m);
    });
    await feed(page, { arms: 'forward', leftCurl: 0.9, rightCurl: 0.9 }, 15);
    let s = await surf(page);
    if (process.env.SURF_DEBUG && !(s.hold && s.hold.left && s.hold.right)) console.log('GRAB', JSON.stringify(await page.evaluate(() => {
        const g = window.__zns.game, B = g.boards, m = B.models.get('cboard0').model;
        return ['left', 'right'].map((side) => { const G = g.weapons.palmFrame(side, {}).G; const l = m.worldToLocal(G.clone()); return { side, l: l.toArray().map((v) => +v.toFixed(2)), curl: g.character.getGripCurl(side), vis: g.character.getActiveHands()[side].group.visible, busy: !!g.items.held[side] || !!g.weapons.hands[side].held }; });
    })), JSON.stringify(s.boards.find((b) => b.id === 'cboard0')));
    assert.ok(s.hold && s.hold.left && s.hold.right, `both hands on the rails ${JSON.stringify(s.hold)}`);
    assert.equal(s.boards.find((b) => b.id === 'cboard0').owner, 'local');
    // the board goes with the hands
    const p0 = await page.evaluate(() => window.__zns.game.boards.models.get('cboard0').model.position.toArray());
    await page.evaluate(() => { window.__zns.game.character.group.position.x += 2; });
    await feed(page, { arms: 'forward', leftCurl: 0.9, rightCurl: 0.9 }, 6);
    const p1 = await page.evaluate(() => window.__zns.game.boards.models.get('cboard0').model.position.toArray());
    assert.ok(Math.abs(p1[0] - p0[0] - 2) < 0.4, `the board followed the hands ${p1[0] - p0[0]}`);
    // the hands drawn on the rails
    const onRail = await page.evaluate(() => {
        const g = window.__zns.game, m = g.boards.models.get('cboard0').model;
        return ['left', 'right'].map((side) => {
            const p = g.character.getGripObject(side).getWorldPosition(new window.__zns.THREE.Vector3());
            return m.worldToLocal(p).y;
        });
    });
    assert.ok(onRail.every((y) => Math.abs(y) < 0.6), `hands at the rails ${onRail}`);
    // the pocket refuses it
    await page.evaluate(() => window.__zns.game.inventory.pocketRight());
    assert.ok((await surf(page)).hold, 'still held');
    // ---- walk into the sea with it (teleported), then let go: open outstretched hands — it falls and floats
    await page.evaluate(() => {
        const g = window.__zns.game, S = g.terrain.data.seas, sea = S.nearest(0, 0);
        let a = 0.7;
        for (; a < 7; a += 0.2) { const q = S.pointAt(sea, a, 40); if (S.signedDist(q.x, q.z) > 30 && !g.terrain.data.castles.landAt(Math.round(q.x), Math.round(q.z))) break; }
        const p = S.pointAt(sea, a, 40);
        const yaw = Math.atan2(-(sea.x - p.x), -(sea.z - p.z)); // facing out to sea
        g.cameraBaseRotation = yaw; g.smoothBody = yaw; g.character.setBodyRotation(yaw);
        g.character.group.position.set(p.x, -1.6, p.z);
        g.world.terrain.flushAround(p.x, p.z);
        g.seaSurface?.flush(p.x, p.z);
    });
    await feed(page, { arms: 'forward', leftCurl: 0.9, rightCurl: 0.9 }, 6);
    assert.ok((await surf(page)).hold, 'still held in the water');
    await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0 }, 25);
    s = await surf(page);
    assert.equal(s.hold, null, 'let go');
    for (let i = 0; i < 30 && (await surf(page)).boards.find((b) => b.id === 'cboard0').st !== 'float'; i++) await frames(page, 5);
    s = await surf(page);
    assert.equal(s.boards.find((b) => b.id === 'cboard0').st, 'float', 'floating on the sea');

    // ---- one foot on: next to the board, facing its nose; the left knee up and down
    await page.evaluate(() => {
        const g = window.__zns.game, m = g.boards.models.get('cboard0').model, THREE = window.__zns.THREE;
        const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(m.quaternion);
        const yaw = Math.atan2(-nose.x, -nose.z);
        g.cameraBaseRotation = yaw; g.smoothBody = yaw; g.character.setBodyRotation(yaw);
        const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        g.character.group.position.set(m.position.x + side.x * 1.0, m.position.y + 0.5, m.position.z + side.z * 1.0);
    });
    await feed(page, { arms: 'hang', legs: { left: 'stand', right: 'stand' } }, 6);
    await feed(page, { arms: 'hang', legs: { left: 'up', right: 'stand' } }, 8);
    await feed(page, { arms: 'hang', legs: { left: 'stand', right: 'stand' } }, 8);
    s = await surf(page);
    if (process.env.SURF_DEBUG && !s.ride) console.log('MOUNT', JSON.stringify(await page.evaluate(() => { const g = window.__zns.game, B = g.boards, mm = B._mountable(); return { log: B.log, mm: mm && { id: mm.b.id, wrong: mm.wrongWay }, legs: g.currentPose?.legs, arm: B._mountArm, me: g.character.group.position.toArray(), board: B.models.get('cboard0').model.position.toArray(), st: B.reg.map.get('cboard0').st, fly: g.flight.active }; })));
    assert.ok(s.ride && s.ride.foot === 'left', `on the board, left foot ${JSON.stringify(s.ride)}`);
    await frames(page, 3);
    const onDeck = await page.evaluate(() => {
        const g = window.__zns.game;
        return { y: g.character.group.position.y, deck: g.boards.models.get('cboard0').model.position.y, swim: g.swim.swimming, legs: !!g.character.legPose, log: g.boards.log };
    });
    assert.ok(Math.abs(onDeck.y - (onDeck.deck + 2.09)) < 0.4 && !onDeck.swim && onDeck.legs, JSON.stringify(onDeck));
    // ---- paddle with the right leg (calm water)
    await page.evaluate(async () => { const { makeSwell } = await import('/src/game/SurfWater.js'); window.__makeSwell = makeSwell; window.__zns.game.boards.water.sea = { time: null, sample: () => null }; });
    const start = await page.evaluate(() => { const b = window.__zns.game.boards.ride.body; return [b.x, b.z, b.yaw]; });
    for (let i = 0; i < 14; i++) {
        await feed(page, { arms: 'hang', legs: { left: 'stand', right: 'up' } }, 3);
        await frames(page, 1);
        await feed(page, { arms: 'hang', legs: { left: 'stand', right: 'stand' } }, 3);
        await frames(page, 1);
    }
    const moved = await page.evaluate((s0) => { const b = window.__zns.game.boards.ride.body; return ((b.x - s0[0]) * -Math.sin(s0[2]) + (b.z - s0[1]) * -Math.cos(s0[2])); }, start);
    assert.ok(moved > 2, `paddled forward ${moved}`);
    // ---- a swell along the board: going with it, the wave catches it
    await page.evaluate(() => {
        const g = window.__zns.game, R = g.boards.ride, b = R.body;
        // the swell runs along the board; the board waits just ahead of a crest, on the wave's front face
        const dx = -Math.sin(b.yaw), dz = -Math.cos(b.yaw), k = 2 * Math.PI / 40, w = k * Math.sqrt(20 * 3);
        const phase = Math.PI + 0.25 - (k * (b.x * dx + b.z * dz) - w * g.boards.simT);
        g.boards.water.sea = window.__makeSwell({ dirX: dx, dirZ: dz, height: 1.8, length: 40, depth: 3, phase });
        g.boards.water.sea.time = () => g.boards.simT; // (the swell on the game's clock: this test browser draws few frames)
        b.u = 5.5;
    });
    let caught = false;
    for (let i = 0; i < 60 && !caught; i++) {
        await feed(page, { arms: 'hang', legs: { left: 'stand', right: 'stand' } }, 3);
        caught = await page.evaluate(() => { const R = window.__zns.game.boards.ride; if (R && !R.body.riding && R.body.u < 5) R.body.u = 5.5; /* (paddling on: the e2e shortcut) */ return !!R?.body.riding; });
    }
    if (!caught && process.env.SURF_DEBUG) console.log("LOG", JSON.stringify((await surf(page)).log));
    assert.ok(caught, "riding a wave");
    // stand up: the paddling leg comes up onto the board
    await feed(page, { arms: 'hang', legs: { left: 'stand', right: 'up' } }, 4);
    await feed(page, { arms: 'hang', legs: { left: 'stand', right: 'stand' } }, 4);
    s = await surf(page);
    assert.ok(s.ride === null || s.ride.foot === null || !s.ride.riding, `standing (or the wave went on) ${JSON.stringify(s.ride)}`);
    // ---- leaning hard: down into the water, the board floats on
    if (s.ride) {
        await page.evaluate(() => { const R = window.__zns.game.boards.ride; R.foot = null; R.forceLean = 0.7; R.body.u = Math.max(R.body.u, 2); });
        for (let i = 0; i < 40 && (await surf(page)).ride; i++) await frames(page, 4);
    }
    s = await surf(page);
    assert.equal(s.ride, null, 'fell off');
    assert.equal(s.boards.find((b) => b.id === 'cboard0').st, 'float', 'the board floats on');
    const after = await page.evaluate(() => ({ legs: window.__zns.game.character.legPose, roll: window.__zns.game.character.boardRoll }));
    assert.deepEqual(after, { legs: null, roll: 0 });
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('«Create a Board» outside Creative: learned from a scroll, a tree becomes a board; carried under the arm; saved with the world', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    // in front of a tree near the start, the arm raised at it
    await page.evaluate(() => {
        const g = window.__zns.game;
        const t = g.world.trees.filter((x) => x.alive).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__tree = t;
        g.character.group.position.set(t.x, g.collision.groundY(t.x, t.z + 5) + 2.0, t.z + 5);
        g.cameraBaseRotation = 0; g.smoothBody = 0; g.character.setBodyRotation(0); // facing −Z: the tree
    });
    await feed(page, { arms: 'forward', wristOffset: [0, -0.02] }, 20);
    const first = await page.evaluate(() => { const g = window.__zns.game; g.lastMagicHand = 'right'; const r = g.castLocalSpell('Create a Board', true); return { r, voice: g.hud.lastVoice || document.body.innerText }; });
    assert.equal(first.r, null, 'not learned yet');
    const after = await page.evaluate(() => {
        const g = window.__zns.game;
        g.items.applyScroll({ kind: 'scroll', stat: 'spell', spell: 'CreateBoard' });
        g.combat.fatigue = 30;
        g._lastBuild = 0;
        const before = g.boards.reg.map.size;
        const r = g.castLocalSpell('Create a Board', true);
        const made = [...g.boards.reg.map.values()].slice(before);
        return { r, made: made.map((b) => ({ id: b.id, st: b.st, d: Math.hypot(b.p[0] - window.__tree.x, b.p[2] - window.__tree.z) })), alive: window.__tree.alive, mana: g.combat.fatigue };
    });
    assert.equal(after.r, 'CreateBoard');
    assert.equal(after.made.length, 1);
    assert.ok(after.made[0].d < 3 && after.made[0].st === 'stand', JSON.stringify(after.made));
    assert.equal(after.alive, false, 'the tree became the board');
    assert.ok(after.mana < 30, `mana spent ${after.mana}`);
    // under the arm: the right arm down at the side, the hand on the middle of the right rail
    await feed(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 10);
    const id = after.made[0].id;
    await page.evaluate((id) => {
        const g = window.__zns.game, B = g.boards, m = B.models.get(id), THREE = window.__zns.THREE;
        const G = g.weapons.palmFrame('right', {}).G;
        // the board on edge beside the body, its right rail's middle in the palm
        m.model.quaternion.setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2, 'YXZ'));
        const rail = new THREE.Vector3(0.65, 0, 0).applyQuaternion(m.model.quaternion);
        m.model.position.copy(G).sub(rail);
        const b = B.reg.map.get(id); b.st = 'rest'; B._setBox(b, m);
    }, id);
    await feed(page, { arms: 'hang', rightCurl: 0.9, leftCurl: 0 }, 15);
    const tuck = await page.evaluate(() => window.__zns.game.boards.debugState().hold);
    assert.ok(tuck && tuck.right && !tuck.left && tuck.mode === 'tuck', `under the arm ${JSON.stringify(tuck)}`);
    const up = await page.evaluate((id) => { const g = window.__zns.game, m = g.boards.models.get(id).model, THREE = window.__zns.THREE; const n = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion); const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(m.quaternion); return { ny: n.y, noseFwd: nose.z }; }, id);
    assert.ok(Math.abs(up.ny) < 0.3 && up.noseFwd < -0.8, `on edge, nose forward ${JSON.stringify(up)}`);
    // a hanging hand opening doesn't drop it (nothing falls by accident)
    await feed(page, { arms: 'hang', rightCurl: 0, leftCurl: 0 }, 12);
    assert.ok(await page.evaluate(() => !!window.__zns.game.boards.hold), 'still under the arm');
    // saved with the world
    const saved = await page.evaluate(() => window.__zns.game.keeper.snapshot().boards);
    assert.ok(saved.list.some((b) => b.id === id && b.st === 'fall'), JSON.stringify(saved));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('a board is let go for real: both hands opened drop it anywhere; a real throw makes it fly', async () => {
    const { frame } = await import('./poses.mjs');
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    const takeBoth = async () => {
        await page.evaluate(() => { const g = window.__zns.game; g.cameraBaseRotation = 0; g.smoothBody = 0; g.character.setBodyRotation(0); g.character.group.position.set(0, 1.5, 12); });
        await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0 }, 12);
        await page.evaluate(() => {
            const g = window.__zns.game, B = g.boards, THREE = window.__zns.THREE;
            const L = g.weapons.palmFrame('left', {}).G.clone(), R = g.weapons.palmFrame('right', {}).G.clone();
            const b = B.reg.map.get('cboard0'), m = B.models.get('cboard0');
            const across = R.clone().sub(L).setY(0).normalize();
            m.model.position.copy(L).add(R).multiplyScalar(0.5);
            m.model.quaternion.setFromEuler(new THREE.Euler(0, Math.atan2(-across.z, across.x), 0, 'YXZ'));
            b.st = 'rest'; b.owner = null; B._setBox(b, m);
        });
        await feed(page, { arms: 'forward', leftCurl: 0.9, rightCurl: 0.9 }, 15);
        const h = (await surf(page)).hold;
        assert.ok(h && h.left && h.right, 'both hands on it');
    };
    // 1) held close (arms down in front, not stretched out), both hands open: it is let go and falls
    await takeBoth();
    await feed(page, { arms: 'down', leftCurl: 0.9, rightCurl: 0.9 }, 8);
    assert.ok((await surf(page)).hold, 'still held with the arms down');
    await feed(page, { arms: 'down', leftCurl: 0, rightCurl: 0 }, 20);
    let s = await surf(page);
    assert.equal(s.hold, null, 'both hands open: let go');
    for (let i = 0; i < 20 && (await surf(page)).boards.find((b) => b.id === 'cboard0').st !== 'rest'; i++) await frames(page, 4);
    assert.equal((await surf(page)).boards.find((b) => b.id === 'cboard0').st, 'rest', 'it fell to the ground');
    // 2) one hand opening alone only takes that hand off
    await takeBoth();
    await feed(page, { arms: 'forward', leftCurl: 0, rightCurl: 0.9 }, 20);
    s = await surf(page);
    assert.ok(s.hold && !s.hold.left && s.hold.right, `one hand off, the other holds ${JSON.stringify(s.hold)}`);
    // 3) a real overhand throw with the right hand: it flies
    const p0 = await page.evaluate(() => window.__zns.game.boards.models.get('cboard0').model.position.toArray());
    for (let i = 0; i < 10; i++) await feed(page, { windup: 'right', rightCurl: 0.9, leftCurl: 0 }, 1, 33);
    const a = frame({ windup: 'right', rightCurl: 0.9, leftCurl: 0 }), b = frame({ arms: 'forward', rightCurl: 0.9, leftCurl: 0 });
    for (let i = 1; i <= 4; i++) {
        const t = i / 4, f = frame({ arms: 'forward', rightCurl: 0.9, leftCurl: 0 });
        f.poseLandmarks = a.poseLandmarks.map((p, k) => ({ ...p, x: p.x + (b.poseLandmarks[k].x - p.x) * t, y: p.y + (b.poseLandmarks[k].y - p.y) * t, z: p.z + (b.poseLandmarks[k].z - p.z) * t }));
        f.hands = b.hands.map((h, j) => ({ ...h, landmarks: h.landmarks.map((q2, k) => { const q = a.hands[j].landmarks[k]; return { x: q.x + (q2.x - q.x) * t, y: q.y + (q2.y - q.y) * t, z: q.z + (q2.z - q.z) * t }; }) }));
        await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, f);
        await new Promise((r) => setTimeout(r, 33));
    }
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 10, 33);
    for (let i = 0; i < 10 && (await surf(page)).hold; i++) await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 5, 33);
    s = await surf(page);
    assert.equal(s.hold, null, `thrown (or let go) ${JSON.stringify(s.log)}`);
    await frames(page, 10);
    const p1 = await page.evaluate(() => window.__zns.game.boards.models.get('cboard0').model.position.toArray());
    if (s.log.includes('throw')) assert.ok(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 1, `it flew ${p1} from ${p0}`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
