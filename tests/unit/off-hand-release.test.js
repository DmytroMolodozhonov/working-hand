import test from 'node:test';
import assert from 'node:assert/strict';
import { OffGate, OFF_DROP } from '../../src/game/OffHandRelease.js';

const base = { tracked: true, reach: 0.9, forward: 0.8, up: 0, speed: 0.3, heldMs: 5000 };
// run a hand through frames: closed 300 ms, then `open` for `ms`; returns the time of the drop (ms after opening) or null
function run(over = {}, { ms = 800, wand = false, closedFor = 300 } = {}) {
const g = new OffGate();
let t = 0;
for (; t < closedFor; t += 16) g.update({ ...base, now: t, curl: 0.9, wand });
const t0 = t; let last = null;
for (; t < t0 + ms; t += 16) { last = g.update({ ...base, ...over, now: t, curl: over.curl ?? 0.05, wand }); if (last.drop) return { at: t - t0, why: last.why }; }
return { at: null, why: last?.why };
}

test('разжатая вытянутая рука — вещь выпадает быстро (≤ 0,4 с)', () => { const r = run(); assert.notEqual(r.at, null); assert.ok(r.at <= 400); });
test('палочка в левой руке выпадает так же', () => { const r = run({}, { wand: true }); assert.notEqual(r.at, null); assert.ok(r.at <= 400); });
test('сжатый и расслабленный кулак не отпускает', () => {
    assert.equal(run({ curl: 0.8 }).at, null);
    assert.equal(run({ curl: 0.45 }).at, null); // (расслабленные пальцы)
    assert.equal(run({ curl: 0.35 }, { wand: true }).at, null); // палочка — только по-настоящему открытая
});
test('в движении, висящая и не вытянутая рука — нет, причина названа', () => {
    let r = run({ speed: 4 }); assert.equal(r.at, null); assert.match(r.why, /движении/);
    r = run({ up: -0.9 }); assert.equal(r.at, null); assert.match(r.why, /вниз/);
    r = run({ reach: 0.4 }); assert.equal(r.at, null); assert.match(r.why, /вытянута/);
});
test('кисть потеряна камерой — не отпускает', () => { assert.equal(run({ tracked: false }).at, null); });
test('кисть всё время видна открытой (не было видно хвата) — не отпускает', () => {
    const g = new OffGate(); let drop = false;
    for (let t = 0; t < 2500; t += 16) drop = g.update({ ...base, now: t, curl: 0.05 }).drop || drop;
    assert.equal(drop, false);
});
test('только что взятая вещь не выпадает сразу', () => {
    const g = new OffGate(); g.update({ ...base, now: 0, curl: 0.9 });
    assert.match(g.update({ ...base, now: 20, curl: 0.05, heldMs: 100 }).why, /взята/);
});
test('две руки независимы: у каждой свой шлюз', () => {
    const a = new OffGate(), b = new OffGate();
    for (let t = 0; t < 300; t += 16) { a.update({ ...base, now: t, curl: 0.9 }); b.update({ ...base, now: t, curl: 0.9 }); }
    let da = false;
    for (let t = 300; t < 800; t += 16) { da = a.update({ ...base, now: t, curl: 0.05 }).drop || da; b.update({ ...base, now: t, curl: 0.9 }); }
    assert.equal(da, true); assert.equal(b.since, -1);
});
test('отказ в журнал — не чаще раза в LOG_MS', () => { const g = new OffGate(); assert.equal(g.mayLog(0), true); assert.equal(g.mayLog(100), false); assert.equal(g.mayLog(OFF_DROP.LOG_MS + 1), true); });

