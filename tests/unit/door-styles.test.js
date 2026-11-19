// DoorStyles.js — the door styles, what a blast does to a door (a chunk or splinters) (19.11).
import test from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, STYLE_IDS, styleOf, hurtShare, chipSpot, splinterColors } from '../../src/game/DoorStyles.js';
import { doorModel } from '../../src/game/Doors.js';

test('four styles; a village has plain, poor and rich ones, a great leaf more often rich; the same door always the same style', () => {
    assert.deepEqual(STYLE_IDS.sort(), ['banded', 'common', 'poor', 'rich']);
    const count = {};
    for (let i = 0; i < 600; i++) { const s = styleOf({ id: 'house' + i }); count[s] = (count[s] || 0) + 1; assert.equal(styleOf({ id: 'house' + i }), s); }
    for (const k of STYLE_IDS) assert.ok(count[k] > 10, k + ' appears: ' + count[k]);
    assert.ok(count.common > count.poor && count.poor > count.rich);
    assert.equal(styleOf({ id: 'x', style: 'rich' }), 'rich');
    assert.ok(STYLES.rich.hp > STYLES.common.hp && STYLES.common.hp > STYLES.poor.hp, 'the rich door holds more');
});

test('a blast: nothing far away, a crack at the edge, the whole strength at the middle; Maxima more', () => {
    assert.equal(hurtShare(40, 6, 1), 0);
    const edge = hurtShare(6.9, 6, 1), mid = hurtShare(1, 6, 1), max = hurtShare(5, 6, 2), norm = hurtShare(5, 6, 1);
    assert.ok(edge > 0 && edge < 0.5, 'edge ' + edge);
    assert.ok(mid >= 1, 'at the middle it bursts: ' + mid);
    assert.ok(max > norm, 'Maxima hurts more');
    assert.ok(hurtShare(4, 6, 1) < hurtShare(2, 6, 1), 'nearer, more');
});

test('a chunk comes out of the leaf on the blast\'s side, inside the leaf', () => {
    for (let i = 0; i < 50; i++) {
        const c = chipSpot(2.2, 4.6, Math.random(), Math.random(), Math.random(), i % 3 - 1);
        assert.ok(c.x > 0.1 && c.x < 2.1 && c.y > 0.3 && c.y < 4.4 && c.r >= 0.22 && c.r <= 0.44);
    }
    assert.ok(chipSpot(2, 4, 1, 0.5, 0.5, 1).x > chipSpot(2, 4, 0, 0.5, 0.5, -1).x, 'by side');
});

test('every style builds a model with the handle points, a lock lamp, a bolt, and two bolts a door (both faces); the old gate kinds still build', () => {
    for (const style of STYLE_IDS) {
        const m = doorModel(0x8a5a2e, { style, w: 2.2, h: 4.6 });
        const u = m.userData;
        assert.ok(u.hinge && u.knob && u.knob2, style + ' keeps the hand points');
        assert.ok(u.lock && u.lock.bolts.length === 2 && u.lock.dots.length === 2, style + ' has the latch');
        assert.ok(u.hurtable && u.style === style);
    }
    const gate = doorModel(0x5a3a1e, { gate: true });
    assert.ok(!gate.userData.lock && !gate.userData.hurtable, 'the castle gate is no plain door');
    assert.ok(!doorModel(0x666666, { metal: true }).userData.hurtable);
    assert.equal(splinterColors(0x8a5a2e).length, 4);
});
