import test from 'node:test';
import assert from 'node:assert/strict';
import { BREAKWARD, CELL_TABLE, HOLD_TABLE, breakwardMishap, canBypass, deficitOf, BlackBar, holdOutcome } from '../../src/game/Breakward.js';
import { BreakwardMark } from '../../src/game/BreakwardMark.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { MECHANICS } from '../../src/ui/Codex.js';
import { GOD_SPELLS } from '../../src/game/Mana.js';
import { DarkHero, darkLevel } from '../../src/game/DarkMagic.js';
import { wipeHero } from '../../src/game/Legacy.js';

const mul = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };

test('table entry: dark, dark red, cost 50', () => {
    const p = PENTAGRAMS.breakward;
    assert.equal(p.dark, true); assert.equal(p.cost, 50); assert.ok(p.glow); assert.equal(BREAKWARD.COST, 50);
});

test('no risk when the cells were enough', () => {
    assert.equal(breakwardMishap(0, () => 0), null);
    assert.equal(deficitOf(100, 100), 0);
    assert.equal(deficitOf(30, 100), 70);
});

test('mishap: 23 %', () => {
    assert.equal(breakwardMishap(70, () => 0.23), null);
    assert.ok(breakwardMishap(70, () => 0.2299));
    let n = 0, N = 20000; const r = mul(3);
    for (let i = 0; i < N; i++) if (breakwardMishap(70, r)) n++;
    assert.ok(Math.abs(n / N - 0.23) < 0.015, String(n / N));
});

test('wand only with a big gap, about 1 % of all casts', () => {
    const r = mul(7);
    let wandSmall = 0, wandBig = 0, N = 100000;
    for (let i = 0; i < N; i++) { if (breakwardMishap(99, r)?.kind === 'wand') wandSmall++; if (breakwardMishap(100, r)?.kind === 'wand') wandBig++; }
    assert.equal(wandSmall, 0);
    assert.ok(Math.abs(wandBig / N - 0.01) < 0.002, String(wandBig / N));
});

test('outcomes: fizzle / wild with a hint', () => {
    const a = breakwardMishap(70, seq(0, 0.1));
    assert.equal(a.kind, 'fizzle'); assert.match(a.hint, /из-под контроля/);
    const b = breakwardMishap(70, seq(0, 0.9, 0.1, 0.5, 0.5, 0.2));
    assert.equal(b.kind, 'wild'); assert.ok(['shift', 'weak', 'near'].includes(b.mode)); assert.ok(b.power > 0 && b.power <= 1);
    assert.ok(CELL_TABLE.every((e) => e.hint));
});

test('black bar: +1 %/s, rolls every 5 s with 5, 10, 15 … %', () => {
    const bar = new BlackBar(); const chances = [];
    for (let t = 0; t < 100; t += 0.5) for (const e of bar.step(0.5, true, () => 0.999)) chances.push(e.chance);
    assert.deepEqual(chances.slice(0, 4), [5, 10, 15, 20]);
    assert.equal(chances.length, 20); assert.equal(chances[19], 100);
});

test('black bar: a hit at 100 % is sure, resets the risk', () => {
    const bar = new BlackBar(); let hit = null;
    for (let t = 0; t < 110 && !hit; t++) { const ev = bar.step(1, true, () => 0.999); hit = ev.find((e) => e.hit) || null; }
    assert.ok(hit); assert.equal(hit.chance, 100); assert.equal(bar.pct, 0); assert.equal(bar.black, false);
});

test('black bar: first roll at 5 s hits only under 5 %', () => {
    const bar = new BlackBar(); const ev = bar.step(5, true, () => 0.049);
    assert.equal(ev.length, 1); assert.equal(ev[0].hit, true);
    const bar2 = new BlackBar(); assert.equal(bar2.step(5, true, () => 0.05)[0].hit, false);
});

test('black bar: mana back → blue, risk falls', () => {
    const bar = new BlackBar(); bar.step(4, true, () => 1);
    assert.equal(bar.black, true);
    bar.step(1, false);
    assert.equal(bar.black, false); assert.equal(bar.pct, 4 - BREAKWARD.FALL);
});

test('hold table: weights, every outcome has a hint', () => {
    assert.ok(HOLD_TABLE.every((e) => e.hint && e.w > 0));
    assert.equal(holdOutcome(() => 0).kind, 'stop');
    assert.equal(holdOutcome(() => 0.999).kind, 'wand');
});

test('divine spells are not bypassed', () => {
    for (const k of GOD_SPELLS) assert.equal(canBypass(k), false, k);
    assert.equal(canBypass('TotalDestruction'), true);
});

function fakeGame(max = 30) {
    const g = { combat: { enabled: true, maxFatigue: max, fatigue: 100, check: () => null }, hud: { toast() {}, setVoice() {} }, dark: new DarkHero(null), character: null };
    return g;
}

test('Total Destruction passes with 80 mana and no cells under the mark', () => {
    const g = fakeGame(30); const m = new BreakwardMark(g, () => 0.99);
    assert.equal(m.cellMax('TotalDestruction', 100, 30), 30);
    m.marked = true;
    assert.equal(m.cellMax('TotalDestruction', 100, 30), 100);
    assert.equal(m.cellMax('Boom', 100, 30), 30); // (the gods')
    assert.equal(m.afterPay('TotalDestruction', 100, null), false); // (rng 0.99: no mishap)
});

test('activate: costs 50, +1 dark, mark; needs a learned drawing; death removes it', () => {
    const g = fakeGame(30); const m = new BreakwardMark(g);
    g.breakward = m;
    assert.equal(m.activate(), 'рисунок не выучен');
    m.learn();
    assert.equal(m.activate(), null);
    assert.equal(g.combat.fatigue, 50); assert.equal(darkLevel(g.dark), 1); assert.equal(m.marked, true);
    assert.equal(m.activate(), 'защита уже сломана'); // (одноразово)
    assert.equal(g.combat.fatigue, 50); assert.equal(darkLevel(g.dark), 1);
    const back = new BreakwardMark(fakeGame()); back.restore(m.snapshot());
    assert.equal(back.marked, true); assert.equal(back.known, true);
    wipeHero(g);
    assert.equal(m.marked, false);
});

test('drain keeps going dry only with the mark', () => {
    const g = fakeGame(30); const m = new BreakwardMark(g);
    assert.equal(m.holdDry(), false);
    m.marked = true; assert.equal(m.holdDry(), true); assert.equal(m.holding, true);
});

test('outside Creative the mark needs one body on the circle (Offerings): the offering\'s price is the mark\'s own', async () => {
    const { OFFERINGS } = await import('../../src/game/PentagramOfferings.js');
    assert.equal(OFFERINGS.breakward.mana, BREAKWARD.COST);
    assert.equal(OFFERINGS.breakward.bodies, 1);
});

test('Codex has the pentagram section', () => {
    assert.ok(MECHANICS.some((x) => x.title === 'Пентаграммы'));
});
