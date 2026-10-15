/**
 * Out of a pit as in life (LedgeClimb.js, Collision step): one block — walked out of; two, three —
 * the palms on the edge and pulled down to the hips; a crack the Earthquake broke — the same.
 * The camera is synthetic (poses.mjs): the arms go from hanging to forward / up and back down.
 * Run: ZNS_TEST_PORT=8264 node --test tests/e2e/ledge.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { frame } from './poses.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8264;
let srv, browser, page, errors;
test.before(async () => {
    srv = await startServer(PORT); browser = await launch({});
    ({ page, errors } = await openPage(browser, srv.url));
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
});
test.after(async () => { await browser?.close(); srv?.stop(); setTimeout(() => process.exit(0), 500).unref(); });

/** A camera picture between two poses (t 0 → a, 1 → b). */
const mix = (a, b, t) => {
    const f = structuredClone(a);
    for (const k of ['poseLandmarks', 'leftHandLandmarks', 'rightHandLandmarks']) {
        if (!f[k] || !b[k]) continue;
        f[k].forEach((p, i) => { const q = b[k][i]; p.x += (q.x - p.x) * t; p.y += (q.y - p.y) * t; p.z += (q.z - p.z) * t; });
    }
    return f;
};
const feed = async (raw, n = 1) => {
    for (let i = 0; i < n; i++) {
        await page.evaluate((r) => { r.ts = performance.now(); window.__zns.poseService.injectRaw(r); }, raw);
        await new Promise((r) => setTimeout(r, 33));
    }
};
const HANG = frame({ arms: 'hang' }), DOWN = frame({ arms: 'down' }), FWD = frame({ arms: 'forward' }), UP = frame({ arms: 'up' });

/** A flat open spot; a pit there (3 wide, `depth` deep, the hero at its far side facing the near wall) or a crack. */
const dig = (depth, how = 'pit') => page.evaluate(async ({ depth, how }) => {
    const g = window.__zns.game, D = g.terrain.data, ch = g.character;
    const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
    g.ledge.letGo();
    let cx = 0, cz = 0, L0 = 0;
    const from = window.__ledgeNext || 0; // (the next spot along the search each time: the last one is dug up)
    find: for (let n = from; n < 1000; n++) {
        const r = 20 + Math.floor(n / 24) * 9, a = n % 24;
        window.__ledgeNext = n + 1;
        cx = Math.round(Math.cos(a / 24 * 6.283) * r); cz = Math.round(Math.sin(a / 24 * 6.283) * r);
        D.ensure?.(cx, cz);
        L0 = D.topLayer(cx, cz);
        let ok = !g.swim.waterAt(cx, cz);
        for (let dx = -4; dx <= 4 && ok; dx++) for (let dz = -5; dz <= 4 && ok; dz++) {
            const t = D.topLayer(cx + dx, cz + dz);
            if (t !== L0 || D.solidIn(cx + dx, cz + dz, L0 + 1, L0 + 8) || D.get(cx + dx, t - 1, cz + dz) !== D.get(cx, L0 - 1, cz)) ok = false;
        }
        if (ok && !g.swim.waterAt(cx, cz - 3)) break find;
    }
    if (how === 'pit') {
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 2; dz++) for (let L = L0 - depth + 1; L <= L0; L++) D.set(cx + dx, L, cz + dz, 0);
    } else {
        // the Earthquake's crack along x, `depth` times over (each quake drops the top block in)
        for (let k = 0; k < depth; k++) for (let dx = -4; dx <= 4; dx++) g.quake.breakGround(cx + dx, cz, 1, null);
    }
    const floor = D.floorBelow(cx, cz, L0) - 0.5;
    ch.group.rotation.y = 0; g.cameraBaseRotation = 0;
    ch.group.position.set(cx, floor + 2, cz);
    ch.verticalVelocity = 0;
    await frames(15);
    return { cx, cz, top: L0 - 0.5, floor, depth: L0 - 0.5 - floor };
}, { depth, how });

const state = () => page.evaluate(() => { const g = window.__zns.game, p = g.character.group.position; return { x: p.x, y: p.y, z: p.z, feet: p.y - 2, ground: g.character.groundY, climb: !!g.ledge.climb, holds: Object.keys(g.ledge.climb?.holds || {}), over: !!g.ledge.climb?.over }; });

/** Arms from hanging up to `to` (until both palms hold the edge), then slowly down to the hips. */
const climbOut = async (to) => {
    await feed(HANG, 10);
    let held = false;
    for (let i = 0; i <= 20 && !held; i++) {
        await feed(mix(HANG, to, i / 20), 2);
        const s = await state();
        held = s.holds.length === 2;
    }
    for (let i = 0; i <= 40; i++) {
        await feed(mix(to, HANG, i / 40), 2);
        if (!(await state()).climb) break;
    }
    await feed(HANG, 25);
    return state();
};

/** Walk forward (−z) for a while, the arms hanging: where did the feet end up? */
const walk = () => page.evaluate(async () => {
    const g = window.__zns.game, ch = g.character, z0 = ch.group.position.z;
    const sr = ch.setRunning; ch.setRunning = () => { ch.isRunning = true; ch.runIntensity = 0; };
    const f = g.frameCount; while (g.frameCount < f + 150 && ch.group.position.z > z0 - 3) await new Promise((res) => setTimeout(res, 20));
    ch.setRunning = sr; ch.isRunning = false;
    const f2 = g.frameCount; while (g.frameCount < f2 + 10) await new Promise((res) => setTimeout(res, 20));
    return { z: ch.group.position.z, ground: ch.groundY };
});

test('a one-block pit: walked out of, the hands not needed', async () => {
    const pit = await dig(1);
    assert.equal(pit.depth, 1);
    await feed(HANG, 10);
    const r = await walk();
    assert.ok(r.z < pit.cz - 2 && Math.abs(r.ground - pit.top) < 1e-6, `walked out onto the top: ${JSON.stringify(r)} ${JSON.stringify(pit)}`);
});

for (const [depth, to] of [[2, mix(DOWN, FWD, 0.3)], [3, FWD], [4, UP]]) {
    test(`a ${depth}-block pit: the palms on the edge, pulled down — out`, async () => {
        const pit = await dig(depth);
        assert.equal(pit.depth, depth);
        const s = await climbOut(to);
        assert.ok(!s.climb && Math.abs(s.ground - pit.top) < 1e-6 && s.z < pit.cz - 1.5, `out on the top: ${JSON.stringify(s)} ${JSON.stringify(pit)}`);
    });
}

test('a crack the Earthquake broke: one block — walked out; two — climbed out by the hands', async () => {
    const one = await dig(1, 'crack');
    assert.equal(one.depth, 1, 'the crack: one block deep');
    await feed(HANG, 10);
    const w = await walk();
    assert.ok(w.z < one.cz - 1 && Math.abs(w.ground - one.top) < 1e-6, `stepped out of the crack: ${JSON.stringify(w)}`);
    const two = await dig(2, 'crack');
    assert.equal(two.depth, 2, 'two quakes: two blocks deep');
    const s = await climbOut(mix(DOWN, FWD, 0.3));
    assert.ok(!s.climb && Math.abs(s.ground - two.top) < 1e-6 && s.z < two.cz - 0.5, `out of the crack: ${JSON.stringify(s)} ${JSON.stringify(two)}`);
    assert.deepEqual(realErrors(errors).filter((e) => !/status of 404/.test(e)), []); // (a missing optional file of the server: not this test's)
});
