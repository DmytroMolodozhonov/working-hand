import test from 'node:test';
import assert from 'node:assert/strict';
import { poseHint, raiseMissing, PoseHinter, FULL, POSE_NEEDS } from '../../src/game/PoseHint.js';

const snap = (l, r, extra = {}) => ({ seen: true, lost: {}, raise: { left: l, right: r }, flying: false, ...extra });

test('слово «Флайн» есть, руки наполовину → подсказка именно про высоту', () => {
    const h = poseHint('Flight', snap(0.45, 0.5));
    assert.equal(h.code, 'low');
    assert.match(h.text, /недостаточно высоко/);
    assert.match(h.text, /на всю длину/);
});
test('обе руки вверх на всю длину → подсказки нет (летит)', () => {
    assert.equal(poseHint('Flight', snap(0.95, 0.9)), null);
    assert.equal(poseHint('Flight', snap(FULL, FULL)), null);
});
test('одна рука вверх → подсказка про вторую', () => {
    const h = poseHint('Flight', snap(0.95, 0.05));
    assert.equal(h.code, 'oneArm');
    assert.match(h.text, /только одна рука/);
    assert.equal(poseHint('Flight', snap(0.95, 0.5)).code, 'oneLow');
    assert.equal(poseHint('Flight', snap(0.95, 0.9, { lost: { right: true } })).code, 'oneArm');
});
test('руки опущены → «сначала поднимите»; камера не видит → «покажите руки»', () => {
    assert.equal(poseHint('Flight', snap(-0.9, -0.9)).code, 'down');
    assert.match(poseHint('Flight', snap(-0.9, -0.9)).text, /Флайн/);
    const u = poseHint('Flight', snap(0, 0, { seen: false }));
    assert.equal(u.code, 'unseen');
    assert.match(u.text, /не вижу ваших рук/);
});
test('уже в полёте или руки только что были подняты → без подсказки', () => {
    assert.equal(poseHint('Flight', snap(-1, -1, { flying: true })), null);
    assert.equal(poseHint('Flight', snap(0.3, 0.3, { grace: true })), null);
});
test('Flying Maxima: не в полёте → своя подсказка; в полёте → нет', () => {
    assert.equal(poseHint('FlyingMaxima', snap(0, 0)).code, 'notFlying');
    assert.equal(poseHint('FlyingMaxima', snap(0, 0, { flying: true })), null);
});
test('другие заклинания и текст без внутренних названий', () => {
    assert.equal(poseHint('Bombardo', snap(0, 0)), null);
    assert.equal(poseHint('LightningStrike', snap(0.4, 0.4)).code, 'low');
    for (const n of Object.keys(POSE_NEEDS)) for (const s of [snap(0, 0), snap(0.4, 0.4), snap(0.9, 0), snap(0, 0, { seen: false })]) {
        const h = poseHint(n, s);
        if (h) assert.doesNotMatch(h.text, /\d|armsUp|areBoth|FULL/);
    }
    assert.equal(raiseMissing(snap(1, 1)), null);
});
test('не спамит: раз в 2,5 с', () => {
    let t = 0; const h = new PoseHinter(() => t);
    assert.equal(h.pass(), true);
    t = 1000; assert.equal(h.pass(), false);
    t = 2400; assert.equal(h.pass(), false);
    t = 2600; assert.equal(h.pass(), true);
});

test('«Флайн»: the take-off confirmation is as soft as the word (arms a little above the shoulders count), lost hands do not', async () => {
    const { armsHeldUp, CONFIRM_RAISE, FULL } = await import('../../src/game/PoseHint.js');
    assert.ok(CONFIRM_RAISE < FULL, 'after the word the arms may sag a little');
    assert.ok(armsHeldUp({ left: 0.4, right: 0.35, lost: {} }));
    assert.ok(!armsHeldUp({ left: 0.6, right: 0.1, lost: {} }), 'one arm dropped');
    assert.ok(!armsHeldUp({ left: 0.6, right: 0.6, lost: { right: true } }));
});
