import test from 'node:test';
import assert from 'node:assert/strict';
import { handTipDue, HAND_TIP_GAP, HAND_TIP } from '../../src/game/Accio.js';

const base = { flying: true, caughtSide: 'left', secondary: 'left', raised: false, now: 100 };

test('вторая рука внизу — подсказка есть', () => {
    assert.equal(handTipDue(base), true);
    assert.match(HAND_TIP, /поднимите вторую руку/);
});
test('рука поднята — подсказки нет', () => {
    assert.equal(handTipDue({ ...base, raised: true }), false);
});
test('ничего не летит или летит не в дочернюю руку — нет', () => {
    assert.equal(handTipDue({ ...base, flying: false }), false);
    assert.equal(handTipDue({ ...base, caughtSide: 'right' }), false);
});
test('левша зеркально: дочерняя — правая', () => {
    assert.equal(handTipDue({ ...base, secondary: 'right', caughtSide: 'right' }), true);
    assert.equal(handTipDue({ ...base, secondary: 'right', caughtSide: 'left' }), false);
});
test('частота: не чаще раза в HAND_TIP_GAP секунд', () => {
    assert.equal(handTipDue({ ...base, last: base.now - 1 }), false);
    assert.equal(handTipDue({ ...base, last: base.now - HAND_TIP_GAP + 0.1 }), false);
    assert.equal(handTipDue({ ...base, last: base.now - HAND_TIP_GAP }), true);
});
