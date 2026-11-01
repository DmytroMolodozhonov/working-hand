// «Акцио»: рука поднята с 15° (а не 30°, как у остальных заклинаний); ниже — подсказка. Нижняя ладонь вдоль тела — не рука.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCIO, accioLifted, HAND_DOWN_HINT } from '../../src/game/Accio.js';
import { CastHints } from '../../src/game/CastHints.js';

const lift = (deg) => 1 - Math.cos(deg * Math.PI / 180); // (PoseInterpreter.armLift)

test('Акцио: 15–30° работает, вдоль тела (≤ 10°) — нет', () => {
    for (const d of [16, 20, 25, 29]) assert.equal(accioLifted(lift(d)), true, d + '°');
    for (const d of [0, 5, 10, 13]) assert.equal(accioLifted(lift(d)), false, d + '°');
});
test('общий порог остальных заклинаний — 28°, Акцио его не меняет: 15–28° им мало', () => {
    const GENERAL = 0.12; // Game._raisedHand NEED
    for (const d of [16, 20, 25]) { assert.equal(accioLifted(lift(d)), true); assert.equal(lift(d) > GENERAL, false, d + '°'); }
    assert.ok(ACCIO.LIFT < GENERAL);
});
test('гистерезис: поднятая рука не мигает на границе 15°', () => {
    const edge = lift(14.2); // между 13,5° и 15°
    assert.equal(accioLifted(edge, false), false);
    assert.equal(accioLifted(edge, true), true);
    assert.equal(accioLifted(lift(12), true), false);
});
test('ниже 15° и чёткое «Акцио» — подсказка про основную руку; обычная речь и разговор — нет; не дублирует подсказку про вторую руку', () => {
    const p = { text: 'акцио', name: 'Accio', isFinal: true, intent: false, talking: false, handDown: true, clear: true };
    assert.equal(new CastHints(() => 0).phrase(p).ok, true);
    assert.equal(new CastHints(() => 0).phrase({ ...p, talking: true }).ok, false);
    assert.equal(new CastHints(() => 0).phrase({ ...p, clear: false }).ok, false);
    assert.match(HAND_DOWN_HINT, /поднимите руку чуть выше/);
    assert.doesNotMatch(HAND_DOWN_HINT, /втор/);
});
