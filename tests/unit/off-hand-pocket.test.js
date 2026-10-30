// The things' pocket and the coin pouches are the OTHER hand's (the author: a right-hander takes
// things out of the right pocket with the left hand; the right hand is the wand's), and only
// looking down at them (PoseInterpreter.offHip, Inventory.lookSteady). A left-hander: mirrored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyPlaces } from '../../src/input/PoseInterpreter.js';
import { lookSteady } from '../../src/game/Inventory.js';
import { frame } from '../e2e/poses.mjs';

const at = (o, lefty = false) => {
    const f = frame(o);
    const hand = (label) => f.hands.find((h) => h.label === label)?.landmarks; // ('Right' = the person's left)
    const r = bodyPlaces(f.poseLandmarks, hand('Right'), hand('Left'), 4 / 3, lefty);
    return { pocket: r.pocket.off, purse: r.purse.off, place: r.place };
};

test('a right-hander: the left hand across takes from the right pocket and the pouches; the right hand at them never', () => {
    assert.deepEqual([at({ arms: 'hang', pocket: 'cross' }).pocket, at({ arms: 'hang', pocket: 'cross' }).purse], [true, false], 'the left hand in the right pocket');
    assert.deepEqual([at({ arms: 'hang', purse: 'cross', leftCurl: 0.9 }).purse, at({ arms: 'hang', purse: 'cross', leftCurl: 0.9 }).pocket], [true, false], 'the left hand at the pouches: one place only');
    // the right hand at its own pocket, at the pouches: nothing for the pocket and the pouches
    for (const o of [{ arms: 'hang', pocket: 'right' }, { arms: 'hang', purse: 'hip', rightCurl: 0 }, { arms: 'hang', purse: 'right', rightCurl: 0 }]) {
        const r = at(o);
        assert.ok(r.pocket !== true && r.purse !== true, JSON.stringify(o));
    }
});

test('the hand reaching to the wand, hanging, lowered, in its own pocket — never the pocket or the pouches', () => {
    for (const o of [{ arms: 'hang', belt: 'right' }, { arms: 'hang', belt: 'left' }, { arms: 'hang', lowLeft: true }, { arms: 'hang' }, { arms: 'down' }, { arms: 'forward' }, { arms: 'hang', pocket: 'left' }, { raise: 20 }]) {
        const r = at(o);
        assert.ok(r.pocket !== true && r.purse !== true, JSON.stringify(o));
    }
    // the right hand moved from the wand out along the belt to past the hip: the left hand's places never light up
    for (let x = 0.53; x >= 0.3; x -= 0.01) {
        const f = frame({ arms: 'hang', belt: 'right' });
        const lm = f.poseLandmarks;
        lm[16] = { ...lm[16], x }; lm[14] = { ...lm[14], x: x - 0.09 };
        const r = bodyPlaces(lm, null, null, 4 / 3, false);
        assert.ok(r.pocket.off !== true && r.purse.off !== true, 'x ' + x.toFixed(2));
    }
});

test('a left-hander: mirrored — the right hand across to the left pocket and pouches; the left hand (the wand\'s) never', () => {
    assert.equal(at({ arms: 'hang', pocket: 'cross', mirror: true }, true).pocket, true);
    assert.equal(at({ arms: 'hang', purse: 'cross', leftCurl: 0.9, mirror: true }, true).purse, true);
    assert.notEqual(at({ arms: 'hang', pocket: 'cross' }, true).pocket, true, 'the left hand across to the right hip: not a left-hander\'s pocket');
    for (const o of [{ arms: 'hang', pocket: 'right', mirror: true }, { arms: 'hang', purse: 'hip', mirror: true }]) {
        const r = at(o, true);
        assert.ok(r.pocket !== true && r.purse !== true, 'the left hand at its own hip ' + JSON.stringify(o));
    }
});

test('looking down: counts after a moment, not a nod passing by; a jitter of the head up does not drop it', () => {
    const st = { on: false, t: 0 };
    assert.equal(lookSteady(st, true, 0.05), false, 'just bowed');
    assert.equal(lookSteady(st, false, 0.05), false);
    assert.equal(lookSteady(st, true, 0.05), false);
    assert.equal(lookSteady(st, true, 0.06), true, 'kept down ~0.1 s');
    assert.equal(lookSteady(st, false, 0.1), true, 'the head up for a moment: still');
    assert.equal(lookSteady(st, true, 0.03), true);
    assert.equal(lookSteady(st, false, 0.2), true);
    assert.equal(lookSteady(st, false, 0.15), false, 'up for longer: no more');
});

test('the crossed pocket is easy: the wrist may pass ±20 cm around the hip, a slanted hand still counts', () => {
    // sweep the left wrist around the right-pocket pose (picture units: the torso is ~0.3 high, so 0.04 ≈ 20 cm)
    const hit = (dx, dy, slant = 0) => {
        const f = frame({ arms: 'hang', pocket: 'cross' });
        const lm = f.poseLandmarks;
        lm[15] = { ...lm[15], x: lm[15].x + dx, y: lm[15].y + dy };
        lm[13] = { ...lm[13], y: lm[13].y + dy }; // (the elbow goes with the hand)
        let hand = f.hands.find((h) => h.label === 'Right')?.landmarks;
        if (hand && slant) { hand = hand.map((p) => ({ ...p })); hand[9] = { ...hand[9], x: hand[0].x + slant * 0.1, y: hand[0].y + 0.1 }; }
        return bodyPlaces(lm, hand, null, 4 / 3, false).pocket.off === true;
    };
    for (const dx of [-0.03, -0.015, 0, 0.015]) for (const dy of [-0.04, 0, 0.04]) assert.ok(hit(dx, dy), `dx ${dx} dy ${dy}`);
    // fingers down at a slant (reaching across): still in
    assert.ok(hit(-0.02, 0, 1), 'the hand slanted ~45°');
    // far from the hip: the belly's middle, high up — never
    assert.ok(!hit(-0.12, 0) && !hit(0.2, 0), 'the belly / far outside');
    assert.ok(!hit(0, -0.3), 'the chest');
});

test('the same-side hand (the leading one) and passing hands put nothing; the time to put is short', async () => {
    const { POCKET_DWELL, POCKET_HINT_R, nearPocket } = await import('../../src/game/Inventory.js');
    assert.ok(POCKET_DWELL <= 0.2 && POCKET_DWELL + 0.1 <= 0.5, 'in the zone 0.2 s + looking down 0.1 s: within 0.5 s');
    for (const o of [{ arms: 'hang', pocket: 'right' }, { arms: 'hang', pocket: 'left' }, { arms: 'hang', belt: 'right' }, { arms: 'forward' }, { arms: 'down' }]) assert.ok(at(o).pocket !== true, JSON.stringify(o));
    // mirrored: the right hand to the left pocket works, the right hand at its own
    assert.equal(at({ arms: 'hang', pocket: 'cross', mirror: true }, true).pocket, true);
    // the hint ring: near only close to the pocket, either side
    assert.ok(nearPocket({ x: 0.45, y: 0.05, z: -0.5 }, 1) && !nearPocket({ x: -0.45, y: 0.05, z: -0.5 }, 1));
    assert.ok(nearPocket({ x: -0.45, y: 0.05, z: -0.5 }, -1) && POCKET_HINT_R < 1.2);
});
