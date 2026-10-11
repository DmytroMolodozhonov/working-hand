/**
 * The swift book-bird teaches «Флайн» (no scroll does any more); the running book
 * gives only +30% run speed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SWIFT, SWIFT_ID, SWIFT_PEDESTAL_ID, isSwiftId, birdSpeed, rollSwift, bookSpells, BookBirds } from '../../src/game/BookBirds.js';
import { rollLoot, rollKeyItem, describeItem } from '../../src/game/ItemTypes.js';
import { rollWizardHouseLoot, rollShopScroll } from '../../src/game/WizardShop.js';
import { RunningBook, RUNNER } from '../../src/game/RunningBook.js';

function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return s / 4294967296; };
}

test('no chest, wizard house or scroll shop gives a scroll of flight', () => {
    const r = rng(7);
    const all = [];
    for (let i = 0; i < 4000; i++) {
        all.push(...rollLoot(r, { key: 1 }), rollKeyItem(r), ...rollWizardHouseLoot(r, true), rollShopScroll(r));
    }
    assert.ok(all.some((it) => it.kind === 'scroll'), 'scrolls still come');
    assert.equal(all.filter((it) => it.stat === 'flight').length, 0);
    assert.equal(all.filter((it) => it.kind === 'book' && it.spells?.includes('Flight')).length, 0, 'loot books never hold «Флайн»');
});

test('the swift book-bird: twice as fast, four times rarer, its book holds only «Флайн»', () => {
    assert.equal(birdSpeed(SWIFT_ID + 3), 2 * birdSpeed(3));
    assert.ok(isSwiftId(SWIFT_PEDESTAL_ID) && !isSwiftId(777001) && !isSwiftId(1100000));
    const r = rng(11);
    let swift = 0;
    const N = 50000;
    for (let i = 0; i < N; i++) if (rollSwift(r)) swift++;
    const ordinary = N - swift;
    assert.ok(Math.abs(ordinary / swift - 4) < 0.25, `ordinary : swift = ${(ordinary / swift).toFixed(2)} : 1`);
    assert.equal(SWIFT.CHANCE, 1 / 5);
    assert.deepEqual(bookSpells(SWIFT_ID + 42), ['Flight']);
    for (let id = 1; id < 3000; id++) assert.ok(!bookSpells(id).includes('Flight'), 'ordinary books never teach flight');
});

test('reading the swift book teaches flight for good (kept in the bonus the save keeps)', () => {
    const g = { bonus: { hp: 2 } };
    BookBirds.prototype.learnFlight.call({ game: g });
    assert.deepEqual(g.bonus, { hp: 2, flight: true });
    assert.match(describeItem({ kind: 'book', id: SWIFT_PEDESTAL_ID, spells: ['Flight'], swift: true }).lines.join(' '), /Флайн/);
});

test('the running book gives only +30% run speed: no flight, no spells', () => {
    const toasts = [];
    const g = { bonus: null, character: { runBonus: 1 }, hud: { toast: (t) => toasts.push(t) }, items: { held: {} } };
    const rb = new RunningBook(g);
    assert.equal(rb.bless(), true);
    assert.deepEqual(g.bonus, { run: RUNNER.BONUS });
    assert.equal(RUNNER.BONUS, 0.3);
    assert.ok(Math.abs(g.character.runBonus - 1.3) < 1e-9);
    const info = describeItem({ kind: 'book', id: 2, spells: [], runbook: true });
    const text = info.title + ' ' + info.lines.join(' ');
    assert.match(text, /30%/);
    assert.doesNotMatch(text + toasts.join(' '), /Флайн|лета|полёт|Книга заклинаний/i);
});
