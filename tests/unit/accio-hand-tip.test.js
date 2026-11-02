import test from 'node:test';
import assert from 'node:assert/strict';
import { handTipDue, HAND_TIP_GAP, HAND_TIP, secondaryRaised } from '../../src/game/Accio.js';

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

const UP = (deg) => -Math.cos(deg * Math.PI / 180); // (deg from hanging straight down)
test('«рука опущена» — до 30° от низа, как в правиле выпадения вещи; горизонталь — уже поднята', () => {
    for (const d of [0, 15, 28]) assert.equal(secondaryRaised(UP(d)), false, `${d}°`);
    for (const d of [32, 60, 90, 120]) assert.equal(secondaryRaised(UP(d)), true, `${d}°`);
    assert.equal(secondaryRaised(undefined), false, 'нет данных — опущена');
});
test('гистерезис 25°/30°: поднятая рука не «опускается» от дрожи у границы', () => {
    assert.equal(secondaryRaised(UP(28), true), true, 'уже поднята: 28° — ещё поднята');
    assert.equal(secondaryRaised(UP(24), true), false, 'ниже 25° — опущена');
    assert.equal(secondaryRaised(UP(28), false), false, 'была опущена: 28° — ещё опущена');
});
