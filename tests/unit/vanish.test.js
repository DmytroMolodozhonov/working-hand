import test from 'node:test';
import assert from 'node:assert/strict';
import { inTalkWith, vanishVerdict, VANISH } from '../../src/game/Vanish.js';

// Жалоба автора: «поговорил со странником, через пару фраз он пропал». Пока с ним говорят — не убираем.
const T = 1_000_000;

test('с ним говорят сейчас или говорили недавно — держим', () => {
    assert.equal(inTalkWith({ talking: 2 }, T), true);
    assert.equal(inTalkWith({ talkedAt: T - 60000 }, T), true);
    assert.equal(inTalkWith({ noticedAt: T - 1000 }, T), true);
});
test('давно не говорили — можно убрать', () => {
    assert.equal(inTalkWith({ talking: 0, talkedAt: T - VANISH.TALK_KEEP_MS - 1 }, T), false);
    assert.equal(inTalkWith({}, T), false);
});
test('игрок рядом и видит — ждём, но не вечно', () => {
    const v = {};
    let r = vanishVerdict(v, { watched: true, now: T, since: null });
    assert.equal(r.go, false);
    r = vanishVerdict(v, { watched: true, now: T + VANISH.WAIT_MS - 1, since: r.since });
    assert.equal(r.go, false);
    r = vanishVerdict(v, { watched: true, now: T + VANISH.WAIT_MS + 1, since: T });
    assert.equal(r.go, true);
});
test('никто не смотрит и не говорит — убираем сразу', () => {
    assert.equal(vanishVerdict({}, { watched: false, now: T }).go, true);
});
test('разговор перед уходом: ждёт, потом после паузы уходит', () => {
    const v = { talkedAt: T };
    assert.equal(vanishVerdict(v, { now: T + 5000 }).go, false);
    assert.equal(vanishVerdict(v, { now: T + VANISH.TALK_KEEP_MS + 1 }).go, true);
});
