/**
 * «Вингардиум Левиоса» on animals: a cow and a horse rise smoothly from where they stand (no jump
 * aside), follow the hand, and when let go come down where they were let go — frame by frame.
 * Run: ZNS_TEST_PORT=8261 node --test tests/e2e/lev-animals.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8261;
let srv, browser;
test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('Левиоса lifts a cow, a horse, a pig, a sheep without a jump and lets them down where they were let go', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 12, 40);
    const run = (type, gentle) => page.evaluate(async ([type, gentle]) => {
        const g = window.__zns.game, T = window.__zns.THREE, ch = g.character, A = g.animals, L = g.levitation;
        A._migT = 1e9; A._spawnT = 1e9;
        for (const a of [...A.list]) A._remove(a);
        const hand = ch.getHandWorldPosition('right', new T.Vector3());
        const fw = ch.getHandDirection('right', new T.Vector3()).setY(0).normalize();
        const at = hand.clone().addScaledVector(fw, 7);
        const a = A._spawn(type, new T.Vector3(at.x, g.collision.groundY(at.x, at.z) + 0.5, at.z));
        const dt = 1 / 30, step = () => { A.update(dt); L.update(dt); };
        for (let i = 0; i < 20; i++) step(); // (it stands on its feet)
        const track = [a.group.position.clone()];
        let maxStep = 0;
        const rec = () => { const p = a.group.position.clone(); maxStep = Math.max(maxStep, p.distanceTo(track[track.length - 1])); track.push(p); };
        L.grab('a', a, g.localId, 'right', 7);
        a.lev.jerkT = 1e9; // (no struggling jerks: only the carry is measured)
        for (let i = 0; i < 90; i++) { step(); rec(); }
        const held = a.group.position.clone(), lifted = held.y - track[0].y;
        const liftMax = maxStep;
        maxStep = 0;
        L.letGo('a', a, gentle); // (set down gently / just dropped: it falls)
        for (let i = 0; i < 150 && a.lev; i++) { step(); rec(); }
        for (let i = 0; i < 30; i++) { step(); rec(); }
        const end = a.group.position;
        const r = { liftMax, downMax: maxStep, lifted, aside: Math.hypot(end.x - held.x, end.z - held.z), onGround: end.y - g.collision.groundY(end.x, end.z), lev: !!a.lev };
        A._remove(a);
        return r;
    }, [type, gentle]);
    for (const [type, gentle] of [['cow', true], ['horse', true], ['pig', false], ['sheep', false]]) {
        const r = await run(type, gentle);
        // (30 frames a second: the magic carries it at a few m/s at most — 25 cm a frame is a jump; a fall is faster)
        assert.ok(r.lifted > 0.1 && r.liftMax < 0.25, `${type} rises smoothly: ${JSON.stringify(r)}`);
        assert.ok(r.downMax < (gentle ? 0.25 : 0.6), `${type} comes down smoothly: ${JSON.stringify(r)}`);
        assert.ok(r.aside < 0.6 && !r.lev && r.onGround < 1, `${type} is set down where it was let go: ${JSON.stringify(r)}`);
    }
    assert.deepEqual(realErrors(errors), []);
});
