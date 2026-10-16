/**
 * Chest loot is balanced (author): scrolls, bows, weapons, shields and food come up about equally often, food only
 * ~10 % more than scrolls, cheese no more than any other kind of food; wands and other treasures stay rare.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rollLoot, rollHouseLoot, rollPortLoot, rollShipLoot } from '../../src/game/ItemTypes.js';

function rng(seed) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shares(fn, n = 12000) {
    const c = {}; let tot = 0;
    for (let i = 0; i < n; i++) for (const it of fn()) {
        const k = it.kind;
        const g = k === 'cheese' ? 'cheese' : ['bread', 'steak', 'pie', 'apple'].includes(k) ? 'food' : k === 'bow' || k === 'arrows' ? 'bow' : k;
        c[g] = (c[g] || 0) + 1; tot++;
    }
    const out = {}; for (const k in c) out[k] = c[k] / tot; return out;
}

for (const [name, mk] of [
    ['cave', (r) => () => rollLoot(r, { cave: true })],
    ['castle', (r) => () => rollLoot(r, { cave: false })],
    ['house', (r) => () => rollHouseLoot(r, false)],
    ['port', (r) => () => rollPortLoot(r)],
]) {
    test(`loot balance: ${name}`, () => {
        const s = shares(mk(rng(7)));
        const food = (s.food || 0) + (s.cheese || 0);
        const main = [s.scroll, s.bow, s.weapon, s.shield];
        for (const v of main) assert.ok(v > 0.09 && v < 0.24, `${name}: ${JSON.stringify(s)}`);
        assert.ok(Math.max(...main) / Math.min(...main) < 1.6, `${name}: groups far apart ${JSON.stringify(s)}`);
        assert.ok(food >= s.scroll * 1.0 && food <= s.scroll * 1.45, `${name}: food vs scrolls ${JSON.stringify(s)}`);
        assert.ok(s.cheese <= s.food / 3 * 1.15, `${name}: cheese is one kind among the food ${JSON.stringify(s)}`);
        assert.ok((s.wand || 0) < 0.07, `${name}: wands are rare ${JSON.stringify(s)}`);
    });
}

test('loot balance: ship chests have food, scrolls and bows too', () => {
    const s = shares((r => () => rollShipLoot(r, false))(rng(5)));
    assert.ok(s.scroll > 0.08 && s.bow > 0.08 && (s.food + (s.cheese || 0)) > s.scroll);
});

test('an ordinary chest holds exactly three things (a coin pouch counts as one)', async () => {
    const { fitThings, CHEST_THINGS } = await import('../../src/game/ItemTypes.js');
    assert.equal(CHEST_THINGS, 3);
    const r = rng(11);
    for (let i = 0; i < 2000; i++) {
        for (const n of [3, 2]) {
            assert.equal(rollLoot(r, { cave: i % 2 === 0, key: i % 3 ? 0.25 : 1, royal: i % 7 === 0, count: n }).length, n);
            assert.equal(rollHouseLoot(r, i % 2 === 0, n).length, n);
            assert.equal(rollPortLoot(r, n).length, n);
            assert.equal(rollShipLoot(r, i % 2 === 0, n).length, n);
        }
    }
    assert.equal(fitThings([1, 2, 3, 4, 5].map((k) => ({ kind: 'bread', k })), 3, r).length, 3);
});
