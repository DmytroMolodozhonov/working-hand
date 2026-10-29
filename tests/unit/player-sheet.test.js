import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSheet, FIELDS, itemTip, heroName } from '../../src/ui/PlayerSheet.js';
import { makePiece } from '../../src/game/ArmorTypes.js';

const rows = (sheet) => sheet.flatMap((s) => s.rows);
const byId = (sheet, id) => rows(sheet).find((r) => r.id === id);

test('an empty game never breaks the sheet', () => {
    assert.deepEqual(buildSheet({}), []);
    assert.deepEqual(buildSheet(null), []);
});

test('a hero: hp, mana, regen, steadiness, armour, coins', () => {
    const helmet = makePiece('helmet', { magic: true });
    helmet.ench = { kind: 'helmet', tier: 1 };
    const g = {
        combat: { hp: 12, maxHp: 20, fatigue: 40, maxFatigue: 250 },
        steady: { effective: 33 },
        armor: { worn: { helmet } },
        inventory: { coins: () => 77 },
        config: { mode: 'survival' },
        dark: { level: 50, skin: 45 },
        achievements: { done: new Set(['king']), regenK: 1.15, off: false },
        canSaySpell: (s) => s === 'a', knowsSpell: () => false,
        net: { name: 'Вася', active: true },
    };
    const s = buildSheet(g, { spells: ['a', 'b'] });
    assert.equal(byId(s, 'hp').value, '12 / 20');
    assert.equal(byId(s, 'mana').value, '40 / 250');
    assert.equal(byId(s, 'tier').value, '2');
    assert.equal(byId(s, 'steady').value, '33 / 100');
    assert.equal(byId(s, 'coins').value, '77');
    assert.equal(byId(s, 'darkStage').value, 'презираемый');
    assert.equal(byId(s, 'spells').value, '1 / 2');
    assert.equal(byId(s, 'ach').value, '1 / 7');
    assert.ok(byId(s, 'worn-helmet').ench);
    const tip = itemTip(byId(s, 'worn-helmet'));
    assert.ok(tip.lines.some((l) => l.includes('зачарование')));
    assert.equal(heroName(g), 'Вася');
    assert.equal(heroName({ net: { name: 'Игрок', active: false } }, 'Маг'), 'Маг');
});

test('a clean hero has no dark rows; absent modules give no rows; a throwing getter is skipped', () => {
    const s = buildSheet({ combat: { hp: 1, maxHp: 20, fatigue: 0, maxFatigue: 30 }, dark: { level: 0, skin: 0 } });
    assert.equal(byId(s, 'darkLevel'), undefined);
    assert.equal(byId(s, 'pentagrams'), undefined);
    const bad = { get combat() { throw new Error('x'); } };
    assert.doesNotThrow(() => buildSheet(bad));
});

test('pentagrams: known by scroll; the break-ward mark shows', () => {
    const s = buildSheet({ breakward: { known: true, marked: true }, bonus: { spells: { GargoylePentagram: true } } });
    assert.match(byId(s, 'pentagrams').value, /Слом магической защиты.*горгульи/i);
    assert.ok(byId(s, 'breakMark'));
    assert.equal(byId(buildSheet({}), 'pentagrams'), undefined);
});

test('every field has an unique id', () => {
    const ids = FIELDS.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
});
