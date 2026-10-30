// «Общие логи» (AllLog), журнал рук (HandsLog) и «выбросить предмет» (dropWhy).
import test from 'node:test';
import assert from 'node:assert/strict';
import { AllLog, ALL_LOG, formatEntry, guessLevel, TAGS } from '../../src/core/AllLog.js';
import { gestureOf, HandMeter, remoteLine, HANDS } from '../../src/game/HandsLog.js';
import { DropGate, DROP, dropWhy } from '../../src/game/HandRelease.js';

const clock = () => { let t = 1_700_000_000_000; const f = () => t; f.set = (x) => { t = x; }; f.add = (x) => { t += x; }; return f; };

test('entries of all tags come together in time order and filter by tag, text, level, time', () => {
    const c = clock(), log = new AllLog({ now: c });
    log.add('Руки', 'правая: поднята'); c.add(1000);
    log.add('Заклинания', 'Люмос → ✅ сработало'); c.add(1000);
    log.add('Предметы', 'попытка отпустить: не выпал — рука не вытянута'); c.add(1000);
    log.add('Ошибки', 'TypeError: x is undefined', 'error');
    assert.deepEqual(log.query().map((e) => e.tag), ['Руки', 'Заклинания', 'Предметы', 'Ошибки']);
    assert.deepEqual(log.query({ tags: ['Руки', 'Ошибки'] }).map((e) => e.tag), ['Руки', 'Ошибки']);
    assert.equal(log.query({ text: 'люмос' }).length, 1);
    assert.equal(log.query({ minLevel: 'error' }).length, 1);
    assert.equal(log.query({ minLevel: 'warn' }).length, 2); // (не выпал = предупреждение, ошибка)
    c.add(10 * 60 * 1000);
    assert.equal(log.query({ sinceMs: ALL_LOG.RECENT_MS }).length, 0, 'ten minutes later the last 5 minutes are empty');
});

test('the line format: time, level mark, tag, text; the same line at once is written once with ×N', () => {
    const c = clock(), log = new AllLog({ now: c });
    const e = log.add('Сеть', 'друг вошёл');
    assert.match(formatEntry(e), /^\d\d:\d\d:\d\d\.\d{3} · \[Сеть\] друг вошёл$/);
    log.add('Сеть', 'друг вошёл'); c.add(100); log.add('Сеть', 'друг вошёл');
    assert.equal(log.items.length, 1);
    assert.match(formatEntry(log.items[0]), /\(×3\)$/);
    c.add(5000); log.add('Сеть', 'друг вошёл');
    assert.equal(log.items.length, 2, 'much later it is a new line');
    assert.ok(TAGS.includes('Руки') && TAGS.includes('Предметы') && TAGS.includes('Ошибки'));
});

test('memory is capped, a line is cut, the file queue is capped and goes in batches', () => {
    const log = new AllLog({ max: 50, send: true });
    for (let i = 0; i < 5000; i++) log.add('Игра', `строка ${i}`);
    clearTimeout(log._timer); log._timer = null;
    assert.equal(log.items.length, 50);
    assert.equal(log.pending.length, ALL_LOG.PENDING_MAX);
    assert.ok(log.drain().length <= ALL_LOG.BATCH_MAX);
    assert.ok(log.add('Игра', 'я'.repeat(5000)).text.length <= ALL_LOG.LINE);
    assert.equal(log.add('Игра', '   '.trim()), null, 'an empty line is not written');
});

test('levels are guessed from the words', () => {
    assert.equal(guessLevel('TypeError: failed'), 'error');
    assert.equal(guessLevel('попытка отпустить: не выпал — рука не вытянута'), 'warn');
    assert.equal(guessLevel('взял(а) в руку: Яблоко'), 'info');
});

test('gestures by the fingers', () => {
    assert.equal(gestureOf({ thumb: 0.8, index: 1, middle: 1, ring: 1, pinky: 1 }), 'кулак');
    assert.equal(gestureOf({ thumb: 0, index: 0.1, middle: 0.1, ring: 0.1, pinky: 0.1 }), 'открыта');
    assert.equal(gestureOf({ thumb: 0.2, index: 0.1, middle: 0.9, ring: 0.9, pinky: 0.9 }), 'указывает');
    assert.equal(gestureOf({ thumb: 0.5, index: 0.5, middle: 0.9, ring: 0.9, pinky: 0.9 }), 'щепоть');
});

test('hand meter: share of lost pictures, longest run, coming back, stuck picture', () => {
    const m = new HandMeter();
    let t = 0;
    const w = { x: 0.5, y: 0.5 };
    for (let i = 0; i < 5; i++) m.frame(t += 40, true, { x: 0.5 + i * 0.01, y: 0.5 });
    let back = 0;
    for (let i = 0; i < 4; i++) m.frame(t += 40, false, null);
    back = m.frame(t += 40, true, w).back;
    assert.equal(back, 4, 'it was lost for 4 pictures');
    const s = m.take();
    assert.equal(s.longest, 4);
    assert.ok(Math.abs(s.share - 4 / 10) < 1e-9);
    for (let i = 0; i < 60; i++) m.frame(t += 40, true, w); // the same wrist, 2.4 s
    assert.ok(m.stuckFor(t) > HANDS.STUCK_MS, 'stuck');
    m.frame(t += 40, true, { x: 0.6, y: 0.5 });
    assert.equal(m.stuckFor(t), 0);
});

test('other players: a jerk and a lag are named, a calm one is not', () => {
    assert.match(remoteLine('Вася', { n: 30, rate: 10, age: 40, maxGap: 900, lh: true, rh: false }), /рывок/);
    assert.match(remoteLine('Вася', { n: 30, rate: 20, age: 40, maxGap: 80, lh: true, rh: true }), /Вася: пакетов 20/);
    assert.equal(remoteLine('Вася', null), null);
});

test('why a hand did not let go: every reason is named', () => {
    const g = new DropGate();
    const ok = { now: 1000, curl: 0.1, tracked: true, reach: 0.9, forward: 0.8, up: 0, speed: 0.5, palmUp: 0 };
    assert.match(dropWhy(g, { ...ok, tracked: false }), /не видна/);
    assert.match(dropWhy(g, { ...ok, curl: 0.4 }), /не разжата/);
    assert.match(dropWhy(g, { ...ok, reach: 0.3 }), /не вытянута/);
    assert.match(dropWhy(g, { ...ok, forward: 0 }), /не вперёд/);
    assert.match(dropWhy(g, { ...ok, up: -0.9 }), /опущена/);
    assert.match(dropWhy(g, { ...ok, speed: 5 }), /движется/);
    assert.match(dropWhy(g, { ...ok, palmUp: 0.9 }), /ладонь/);
    assert.equal(dropWhy(g, { ...ok, curl: DROP.CLOSED + 0.1 }), null, 'a closed hand is no attempt');
    assert.match(dropWhy(new DropGate().reset(false) || Object.assign(new DropGate(), { armed: false }), ok), /только что попала/);
    // agrees with the gate: when the reason is gone and the time has passed, the gate lets go
    g.update(ok); assert.match(dropWhy(g, { ...ok, now: 1100 }), /держу разжатие/);
    assert.equal(g.update({ ...ok, now: 1000 + DROP.HOLD_MS }), true);
});
