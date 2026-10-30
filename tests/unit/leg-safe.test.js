// The legs from the camera (LegSafe.js): a knee bends only one way, a flicker is thrown out, bad numbers do no harm,
// the camera's legs fade in over 0.3 s — on my own hero and on a friend's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { safeRaise, safeLegs, slewRaise, legAngles, LegFilter, LEG_SAFE } from '../../src/input/LegSafe.js';

const seen = (l = 0, r = 0, extra = {}) => ({ seen: true, hipsOnly: false, left: { up: l > 0, raise: l, heel: false }, right: { up: r > 0, raise: r, heel: false }, ...extra });

test('clamps: raises 0…1, rubbish becomes 0, angles inside the human limits', () => {
    assert.equal(safeRaise(7), 1); assert.equal(safeRaise(-3), 0); assert.equal(safeRaise(NaN), 0); assert.equal(safeRaise('x'), 0);
    assert.equal(safeLegs(null), null);
    assert.deepEqual(safeLegs({ l: 99, lh: 1, r: -1, rh: 0 }), { l: 1, lh: true, r: 0, rh: false });
    for (const r of [0, 0.5, 1, 50, -4, Infinity]) {
        const a = legAngles(r);
        assert.ok(a.knee >= 0 && a.knee <= LEG_SAFE.KNEE_MAX, 'knee ' + a.knee);
        assert.ok(a.thigh >= 0 && a.thigh <= LEG_SAFE.THIGH_MAX, 'thigh ' + a.thigh);
    }
});

test('a one-frame flicker is thrown out, a real quick lift gets through on the 3rd frame', () => {
    const st = {};
    assert.equal(slewRaise(0, 1, st), 0); // 74° in a frame: kept as it was
    assert.equal(slewRaise(0, 0, st), 0);
    const st2 = {};
    let v = 0; for (let i = 0; i < 3; i++) v = slewRaise(v, 1, st2);
    assert.equal(v, 1);
    assert.equal(slewRaise(0, 0.4, {}), 0.4); // a normal step
});

test('the filter: legs out of the picture → none; a spike → ignored and written to the journal once a second', () => {
    const lines = [];
    const f = new LegFilter((l) => lines.push(l));
    assert.equal(f.step(null), null);
    assert.equal(f.step({ seen: false, left: {}, right: {} }), null);
    assert.deepEqual(f.step(seen(0, 0)), { l: 0, r: 0, lh: false, rh: false });
    assert.equal(f.step(seen(1, 0)).l, 0, 'the spike');
    assert.equal(lines.length, 1);
    for (let i = 0; i < 20; i++) f.step(seen(1, 0), 1 / 60);
    assert.equal(lines.length, 1, 'once a second at most');
    assert.match(lines[0], /^ноги: /);
    const g = new LegFilter(); assert.equal(g.step(seen(NaN, 5)).l, 0, 'NaN is nothing'); assert.equal(g.step(seen(0, 5)).r, 0, 'a wild 5 is one flicker');
});

// ---- the body
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ width: 10 })), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
const THREE = await import('three');
const { VoxelCharacter } = await import('../../src/entities/Character.js');
const { realLibrary } = await import('../../src/entities/RealisticBody.js');
const { B } = await import('../../src/entities/real/RealRig.js');
const { RemoteAvatar } = await import('../../src/net/RemoteAvatar.js');
await realLibrary();

function pos(r, b) { return new THREE.Vector3().setFromMatrixPosition(r.bones[b].matrix); }
/** The knee bends one way: the ankle is not in front of the knee more than a hand's width, and the shin is ≤ 150° from the thigh's line. */
function kneeOk(r) {
    for (const s of ['L', 'R']) {
        const hip = pos(r, B['thigh' + s]), knee = pos(r, B['shin' + s]), ankle = pos(r, B['foot' + s]);
        assert.ok(ankle.z - knee.z > -0.12, `${s}: shin forward of the knee: ${(ankle.z - knee.z).toFixed(2)}`);
        const flex = new THREE.Vector3().subVectors(knee, hip).angleTo(new THREE.Vector3().subVectors(ankle, knee));
        assert.ok(flex <= LEG_SAFE.KNEE_MAX + 0.05, `${s}: knee ${(flex * 57.3).toFixed(0)}°`);
    }
}

test('my hero: whatever the camera legs say, the knees bend one way', () => {
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter(scene);
    ch.setShowHands(true); ch.setHandVersion('v4'); ch.setHeroModel('real'); ch.setIdlePose();
    for (const lg of [{ l: 0.5, lh: false, r: 0, rh: false }, { l: 1, lh: false, r: 1, rh: false }, { l: 9, lh: true, r: -5, rh: true }, { l: NaN, lh: false, r: Infinity, rh: false }, null]) {
        ch.legLift = lg;
        for (let i = 0; i < 40; i++) { ch.update(1 / 60, null, false); ch.real.frame(null, 1 / 60); kneeOk(ch.real); }
    }
});

test('a friend: a packet with rubbish legs bends no knee backwards, and the leg comes up over 0.3 s, not in a frame', () => {
    const scene = new THREE.Scene();
    const src = new VoxelCharacter(scene); src.setShowHands(true); src.setHandVersion('v4'); src.update(1 / 60, null, false);
    const base = src.serializePose();
    const ra = new RemoteAvatar(scene, 'f', 'Друг', 0);
    ra.setHeroModel('real');
    const feed = (rl, n) => { for (let i = 0; i < n; i++) { ra.applyState({ s: { ...base, p: [0, 2, 0], run: -1 }, rl }); ra.update(1 / 60); ra.character.real.frame(null, 1 / 60); kneeOk(ra.character.real); } };
    feed(undefined, 30);
    const rest = pos(ra.character.real, B.footL).y;
    feed([1, 0, 0, 0, 0], 1);
    const y1 = pos(ra.character.real, B.footL).y;
    assert.ok(y1 - rest < 0.35, 'not all at once: ' + (y1 - rest).toFixed(2));
    feed([1, 0, 0, 0, 0], 40);
    assert.ok(pos(ra.character.real, B.footL).y - rest > 0.3, 'then it is up');
    feed([500, 1, -500, 1, 99], 40);
    feed(['x', null, {}, [], NaN], 40);
});
