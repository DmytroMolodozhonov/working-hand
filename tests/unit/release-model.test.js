/**
 * The hands letting things go (ThrowModel.HandTrack) — the author: «чтобы НИКОГДА больше не было, что человек отпустил
 * кисть, а ничего не получилось», «замахнулся, кинул — а предмет просто упал вниз». Synthetic human throws through the
 * game's camera path (tools/throwsim.mjs; the full sweep: node tools/throwbench.mjs --check). Limits only ever tighten.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, bench, THROWS } from '../../tools/throwsim.mjs';
import { HandTrack, RELEASE, launchVelocity, speedCap, massGain, spinFor, bendToward } from '../../src/game/ThrowModel.js';

const speedOf = (v) => Math.hypot(v.x, v.y, v.z);

test('every kind of throw with the OFF (left) hand is a throw, at its real speed — never «fell down»', () => {
    for (const kind of Object.keys(THROWS)) for (const fps of [15, 30, 60]) {
        const r = simulate({ kind, side: 'left', fps, lat: 100, sigma: 0.02, speed: 9, weight: 0.2, seed: 11 + fps });
        assert.equal(r.got?.act, 'throw', `${kind} @${fps} Hz: ${r.got?.why}`);
        const t = speedOf(r.truth.vLaunch), g = speedOf(r.launch);
        assert.ok(g > 0.6 * t, `${kind} @${fps}: ${g.toFixed(1)} of ${t.toFixed(1)} m/s`);
    }
});

test('the right hand mirrors the left (no axis is the wrong way round)', () => {
    for (const kind of ['overhand', 'sidearm', 'underhand']) {
        const L = simulate({ kind, side: 'left', fps: 30, lat: 80, sigma: 0, speed: 9, seed: 5 });
        const R = simulate({ kind, side: 'right', fps: 30, lat: 80, sigma: 0, speed: 9, seed: 5 });
        assert.equal(L.got?.act, 'throw'); assert.equal(R.got?.act, 'throw');
        assert.ok(Math.abs(L.launch.x + R.launch.x) < 0.25 * speedOf(R.launch) && Math.abs(L.launch.z - R.launch.z) < 0.25 * speedOf(R.launch), `${kind}: L ${JSON.stringify(L.launch)} R ${JSON.stringify(R.launch)}`);
    }
});

test('the camera losing the hand at the swing\'s peak (up to 6 pictures) still throws, at the swing\'s speed', () => {
    for (const lose of [2, 4, 6]) for (const fps of [15, 30]) {
        const r = simulate({ kind: 'overhand', side: 'left', fps, lat: 80, sigma: 0.015, speed: 11, lose, seed: 3 + lose });
        assert.equal(r.got?.act, 'throw', `lost ${lose} @${fps}: ${r.got?.why}`);
        assert.ok(speedOf(r.launch) > 0.7 * speedOf(r.truth.vLaunch), `lost ${lose} @${fps}: ${speedOf(r.launch).toFixed(1)} / ${speedOf(r.truth.vLaunch).toFixed(1)}`);
    }
});

test('a calm opening of the held-out hand lets go in time; nothing leaves a hand that holds, walks, waves, chops, punches, or is lost at rest', () => {
    for (const fps of [15, 30, 60]) {
        const r = simulate({ kind: 'drop', side: 'left', fps, lat: 100, sigma: 0.02, seed: fps });
        assert.ok(r.got?.act === 'drop' || r.got?.act === 'throw', `drop @${fps}: ${r.got?.why}`);
        assert.ok(r.at - (r.truth.t + r.lat) < 320, `drop @${fps} took ${Math.round(r.at - r.truth.t - r.lat)} ms`);
    }
    for (const kind of ['hold', 'walk', 'wave', 'chop', 'punch', 'lostRest', 'glitch']) for (const seed of [1, 2, 3]) {
        const r = simulate({ kind, side: 'left', fps: 24, lat: 100, sigma: 0.02, lose: kind === 'chop' || kind === 'punch' ? 3 : 0, seed });
        assert.equal(r.got, null, `${kind}#${seed}: ${r.got?.why}`);
    }
});

test('the sweep (quick): ≥ 99% of throws, 0 «fell down», speed error ≤ 21% (p90), no false drops', () => {
    const r = bench({ seeds: 1, quick: true, fpsList: [15, 30, 60], lats: [50, 150], sigmas: [0.02], loses: [0, 3, 6], speeds: [5, 12] });
    assert.ok(r.thrownShare >= 0.99, `throws ${r.thrownShare}`);
    assert.equal(r.fellDown, 0);
    assert.ok(r.spdErrP90 <= 0.21, `speed error p90 ${r.spdErrP90}`);
    assert.ok(r.angErrP90 <= 19.5, `direction error p90 ${r.angErrP90}`);
    assert.ok(r.dropShare >= 0.99, `drops ${r.dropShare}`);
    assert.equal(r.falseShare, 0, JSON.stringify(r.falseWhy));
});

/** A hand pushed through by hand: closed, held out still, then the fingers open at `curlTo`; returns the decision. */
function openHand({ arm = { reach: 0.9, forward: 0.8, up: 0, palmUp: 0 }, curlTo = 0.1, closed = 0.9, seen = true, frames = 40 } = {}) {
    const h = new HandTrack();
    let t = 0, d = null;
    for (let i = 0; i < 60; i++, t += 16.7) { h.push({ t, hand: { x: -0.6, y: 0.5, z: -1.6 }, world: { x: 0, y: 4, z: -1.6 }, curl: closed, seen: true, fresh: true, camMs: 33 }); h.decide({ t, arm }); }
    for (let i = 0; i < frames; i++, t += 16.7) {
        h.push({ t, hand: { x: -0.6, y: 0.5, z: -1.6 }, world: { x: 0, y: 4, z: -1.6 }, curl: curlTo, seen, fresh: true, camMs: 33 });
        d = h.decide({ t, arm });
        if (d?.act) return d;
    }
    return d;
}

test('a calm opening: from a held-out hand it falls; a hand tucked to the body, hanging down, or palm up keeps it (an apple on a flat palm)', () => {
    assert.equal(openHand().act, 'drop');
    assert.equal(openHand({ arm: { reach: 0.4, forward: 0.8, up: 0, palmUp: 0 } })?.act ?? null, null);
    assert.equal(openHand({ arm: { reach: 0.9, forward: 0.2, up: -0.95, palmUp: 0 } })?.act ?? null, null);
    assert.equal(openHand({ arm: { reach: 0.9, forward: 0.8, up: 0, palmUp: 0.9 } })?.act ?? null, null);
    assert.equal(openHand({ seen: false })?.act ?? null, null, 'a lost hand at rest lets nothing go');
    assert.equal(openHand({ curlTo: 0.7 })?.act ?? null, null, 'a slight loosening is no opening');
});

test('the levels are learnt for this hand: a player whose fist reads only 0.6 and open 0.25 still lets go', () => {
    const d = openHand({ closed: 0.6, curlTo: 0.22 });
    assert.equal(d?.act, 'drop', d?.why);
});

test('a thing that came into an OPEN hand («Акцио», a slot) stays until the fingers closed on it once', () => {
    const h = new HandTrack(); h.reset(false);
    let t = 0;
    for (let i = 0; i < 80; i++, t += 16.7) { h.push({ t, hand: { x: 0, y: 0.5, z: -1.6 }, world: { x: 0, y: 4, z: -1.6 }, curl: 0.1, seen: true, fresh: true, camMs: 33 }); assert.ok(!h.decide({ t, arm: { reach: 0.9, forward: 0.8, up: 0 } })?.act); }
});

test('launch: the flick and the weight (a hammer leaves slower than an apple), an arm\'s limit, ≤ 10° towards the eyes, the body\'s run added', () => {
    assert.ok(massGain(0.2) > 1.2 && massGain(1.5) < 0.95 && speedCap(0.2) === RELEASE.V_MAX && speedCap(2) < 22);
    const o = { act: 'throw', yaw: 0, vRel: { x: 0, y: 0, z: -10 }, v: { x: 0, y: 0, z: -10 - 6 } }; // (running 6 m/s forward)
    const v = launchVelocity(o, 0.2, { x: 1, y: 0, z: -1 });
    const sp = Math.hypot(v.x, v.y, v.z + 6);
    assert.ok(Math.abs(sp - 10 * massGain(0.2)) < 0.01, 'the hand\'s speed × the flick');
    const ang = Math.atan2(v.x, -(v.z + 6)) * 180 / Math.PI;
    assert.ok(ang > 5 && ang <= 10.01, `bent ${ang.toFixed(1)}° towards the aim (≤ 10)`);
    const drop = launchVelocity({ act: 'drop', yaw: 0, vRel: { x: 0, y: 0, z: 0 }, v: { x: 1, y: -0.5, z: 0 } }, 0.2, null);
    assert.ok(drop.x === 1 && drop.y === -0.5, 'an opened hand: the thing falls FROM the moving hand, with its speed');
    const d = { x: 0, y: 0, z: -1 }; bendToward(d, { x: 0, y: 1, z: 0 }, Math.PI / 18);
    assert.ok(Math.abs(Math.asin(d.y) - Math.PI / 18) < 1e-6);
    const w = spinFor('wand', { x: 0, y: 0, z: -12 }, null);
    assert.ok(Math.abs(w.x) > 5 && Math.abs(w.y) < 1e-9, 'a long thing turns end over end');
});
