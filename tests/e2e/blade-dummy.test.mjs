/**
 * The training dummy in Creative (the real game: its 25 % bigger body, its sway, the frame order):
 * a sword carried by the hand edge-on through its arm, its leg and its neck cuts each one off —
 * the piece lies on the ground; the head ends it; body blows don't fell it first.
 * Run: node --test tests/e2e/blade-dummy.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8191;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the training dummy: a real swing takes its arm, its leg, its head', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0.9, leftCurl: 0.9 }, 10, 33);
    await page.waitForFunction(() => !!window.__zns.game.dummy, null, { timeout: 20000 });
    await page.evaluate(() => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, d = g.dummy;
        ch.group.position.set(d.group.position.x - 4, ch.group.position.y, d.group.position.z + 4); // (out of the way)
        for (const s of ['left', 'right']) { g.items.releaseHand(s); g.weapons.release(s); }
        const w = g.weapons.spawn('sword', ch.getHandWorldPosition('right', new T.Vector3()), new T.Quaternion());
        g.weapons.grab(w, 'right');
        // the hand: instead of the camera, it carries the blade along a straight swing (window.__swing)
        const drive = g.weapons._driveHeld.bind(g.weapons);
        g.weapons._driveHeld = (side, dt, c) => {
            const S = window.__swing;
            if (side !== 'right' || !S) return drive(side, dt, c);
            S.k = Math.min(1.6, S.k + S.speed * dt);
            const hw = g.weapons.hands.right.held;
            hw.drive.quaternion.copy(S.q);
            hw.drive.position.copy(S.P).sub(S.off).addScaledVector(S.M, S.k);
            if (S.k >= 1.6) S.done = true;
        };
        g.weapons.hands.right.thr.update = () => null; g.weapons.hands.right.drop.update = () => false; // (no throw, no drop: the swing is ours)
    });
    const cut = async (limb, frac) => {
        // (the last blow rocked it: it settles — this test browser draws ~10 frames a second)
        await page.waitForFunction(() => { const d = window.__zns.game.dummy; return !d.isStunned && !(d.stunTimer > 0) && d.velocity.length() < 0.1 && Math.abs(d.group.rotation.x) + Math.abs(d.group.rotation.z) + Math.abs(d.head.rotation.x) < 0.15; }, null, { timeout: 15000 }).catch(() => {});
        await page.evaluate(({ limb, frac }) => {
            const g = window.__zns.game, T = window.__zns.THREE, d = g.dummy;
            d.group.updateMatrixWorld(true);
            // the bone line in the dummy's own frame (CutBodies.zombieBody)
            const loc = { head: [d.group, [0, 1.42, 0], [0, 1.8, 0]], leftArm: [d.leftArm, [0, 0.6, 0], [0, -0.6, 0]], rightLeg: [d.rightLeg, [0, 0.6, 0], [0, -0.6, 0]] }[limb];
            const A = loc[0].localToWorld(new T.Vector3(...loc[1])), B = loc[0].localToWorld(new T.Vector3(...loc[2]));
            const D = B.clone().sub(A).normalize(), P = A.clone().lerp(B, frac);
            const c = d.group.position.clone();
            let M = Math.abs(D.y) > 0.7 ? c.clone().sub(P).setY(0) : new T.Vector3(0, -1, 0);
            if (M.length() < 0.1) M.set(1, 0, 0);
            M.addScaledVector(D, -M.dot(D)).normalize();
            const Bd = new T.Vector3().crossVectors(D, M).normalize();
            if (Bd.dot(c.clone().sub(P)) < 0) Bd.negate();
            const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(M, Bd, new T.Vector3().crossVectors(M, Bd)));
            const w = g.weapons.hands.right.held;
            const tmp = { quaternion: q, position: new T.Vector3(), spec: w.spec, S: w.S };
            const off = w.modelToWorld.call(tmp, 0, 1.1, 0, new T.Vector3());
            w.position.copy(P).sub(off).addScaledVector(M, -3); w.quaternion.copy(q); w.velocity.set(0, 0, 0); w.angularVelocity.set(0, 0, 0);
            window.__swing = { P, M, q, off, k: -3, speed: 14, done: false }; // (a wind-up: the blade is already flying when it gets there)
            window.__dbg = [];
            if (!g.dismember.__w) { const o = g.dismember.tryCut.bind(g.dismember); g.dismember.tryCut = (t, ctx) => { const r = o(t, ctx); if (r && window.__dbg) window.__dbg.push([r.kind, r.limb, r.speed?.toFixed(1), r.need?.toFixed(1), r.lead?.toFixed(2), (r.d ?? 0).toFixed(2), 'prev', ctx.prevTip.toFixed(1), 'dt', ctx.dt.toFixed(3)].join(' ')); return r; }; g.dismember.__w = 1; }
        }, { limb, frac });
        await page.waitForFunction(() => window.__swing.done, null, { timeout: 20000 });
        await page.evaluate(() => { window.__swing = null; });
        await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
        return page.evaluate(() => { const g = window.__zns.game, d = g.dummy; return { limbs: { ...(d.limbs || {}) }, dead: d.isDead, hp: d.health, pieces: g.dismember.props.length, dbg: window.__dbg, rot: [d.group.rotation.x, d.group.rotation.z, d.body.rotation.x].map((x) => +x.toFixed(2)) }; });
    };
    const arm = await cut('leftArm', 0.85); // (out in front: by the shoulder the blade's end would strike its head)
    assert.ok(arm.limbs.leftArm != null, 'the arm is off ' + JSON.stringify(arm));
    assert.ok(!arm.dead && arm.pieces >= 1, 'it still stands; the arm lies there ' + JSON.stringify(arm));
    const leg = await cut('rightLeg', 0.75); // (the shin: its upper half is inside the torso)
    assert.ok(leg.limbs.rightLeg != null, 'the leg is off ' + JSON.stringify(leg));
    assert.ok(!leg.dead, 'it still stands (on one leg) ' + JSON.stringify(leg));
    const head = await cut('head', 0.5);
    assert.ok(head.limbs.head, 'the head is off ' + JSON.stringify(head));
    assert.ok(head.dead, 'and that ends it ' + JSON.stringify(head));
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
