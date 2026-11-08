// «Кидариус» (StrongSpells / StrongMagic / Duel): the gods' golden lightning — blows up on its target, 500 HP; a scroll of the gods' library.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STRONG, STRONG_DUEL, isStrongDuel, clashPower } from '../../src/game/StrongSpells.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { GOD_SPELLS } from '../../src/game/Mana.js';
import { SPELL_RU } from '../../src/game/ItemTypes.js';
import { TEMPLE_SCROLLS } from '../../src/world/GodsTemple.js';
import { DUEL_SPELLS } from '../../src/game/Duel.js';

const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('слово «Кидариус» узнаётся; обычная речь и соседние заклинания — нет', () => {
    for (const w of ['Кидариус', 'kidarius', 'кидариас', 'кидариос']) assert.equal(matchSpell(w), 'Kidarius', w);
    for (const w of ['привет', 'кино', 'кит', 'дариус', 'электром', 'пилбидрио']) assert.notEqual(matchSpell(w), 'Kidarius', w);
    assert.equal(matchSpell('электром'), 'Electrum');
});

test('цена 1000, урон 500, взрыв; сильная дуэльная магия; божественное; свиток в храме', () => {
    assert.equal(SPELL_COST.Kidarius, 1000);
    assert.equal(STRONG.Kidarius.dmg, 500); assert.equal(STRONG.Kidarius.cost, 1000);
    assert.ok(STRONG_DUEL.has('Kidarius') && isStrongDuel('Kidarius'));
    assert.ok(clashPower('Kidarius') > clashPower('Pilbidrio'), 'в столкновении лучей сильнее обычных');
    assert.ok(GOD_SPELLS.has('Kidarius'));
    assert.equal(SPELL_RU.Kidarius, 'Кидариус');
    assert.ok(TEMPLE_SCROLLS.includes('Kidarius'));
    assert.ok(DUEL_SPELLS.Kidarius && DUEL_SPELLS.Kidarius.jag > DUEL_SPELLS.Electrum.jag && DUEL_SPELLS.Kidarius.speed >= DUEL_SPELLS.Electrum.speed, 'молния — рваная, быстрее и ярче «Электрома»');
});

test('попадание: существо получает 500 и взрыв; титан — свои 500 без «×3»; я — 500 (в Творческом не ранит)', () => {
    const sm = src('src/game/StrongMagic.js'), ti = src('src/game/Titans.js'), du = src('src/game/Duel.js');
    assert.match(sm, /spell === 'Kidarius'\) \{ this\._flash\(this\._center\(k, c, _v\), 0xfff1b0\); this\._hurt\(k, c, STRONG\.Kidarius\.dmg/);
    assert.match(sm, /c\.damage\(STRONG\.Kidarius\.dmg, by, 'Kidarius'\)/);
    assert.match(ti, /spell === 'Kidarius'\) \{ this\.hit\(T, 500, null, by, 'Kidarius'/);
    assert.match(du, /spell === 'Kidarius'\) this\._divineBlast\(p, n\)/);
    assert.match(du, /fxKidariusBlast/);
});
