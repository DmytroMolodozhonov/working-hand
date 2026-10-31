import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, Throttle, NET } from '../../src/game/ScrollNet.js';

test('кодирование и обратно: рука и ширина', () => {
    assert.deepEqual(encode('left', 1.234), [1, 123]);
    assert.deepEqual(decode(encode('right', 2.2)), { other: 'right', w: 2.2 });
    assert.equal(decode(encode('left', 0.5)).w, 0.5);
});
test('ширина зажата, мусор отвергается', () => {
    assert.equal(decode(encode('left', 99)).w, NET.W_MAX);
    assert.equal(decode(encode('left', -3)).w, NET.W_MIN);
    assert.equal(encode('up', 1), null);
    for (const bad of [null, undefined, [], [1], [3, 50], ['x', 'y'], [1, NaN], 'ab', { 0: 1, 1: 2 }]) assert.equal(decode(bad), null);
});
test('закрыт — поля нет', () => {
    const t = new Throttle();
    assert.equal(t.value(null, 0), undefined);
    assert.ok(t.value(encode('left', 1), 0));
    assert.equal(t.value(null, 50), undefined);
});
test('не чаще 10 Гц и только заметный шаг; поле есть в каждой позе', () => {
    const t = new Throttle();
    const a = t.value(encode('left', 1), 0);
    assert.deepEqual(t.value(encode('left', 1.5), 30), a, 'рано — держится прежнее');
    assert.deepEqual(t.value(encode('left', 1.5), 120), [1, 150]);
    assert.deepEqual(t.value(encode('left', 1.505), 400), [1, 150], 'меньше шага — не шлём новое');
    assert.deepEqual(t.value(encode('right', 1.5), 600), [2, 150], 'другая рука — сразу после паузы');
});
test('открыли заново — сразу, без ожидания', () => {
    const t = new Throttle();
    t.value(encode('left', 1), 0); t.value(null, 10);
    assert.deepEqual(t.value(encode('left', 0.3), 20), [1, 30]);
});
