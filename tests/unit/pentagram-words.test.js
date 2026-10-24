// «Pentagranium <Name>»: у каждой пентаграммы СВОЁ имя-заклинание; одно «Пентаграниум» — не заклинание; обычная речь не колдует.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PENT_NAMES, pentagramWords, pentagramSpell, pentagramSaid } from '../../src/game/PentagramWords.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { figureIds } from '../../src/game/PentagramRules.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('у каждой пентаграммы реестра есть своё английское имя, имена разные', () => {
    for (const id of Object.keys(PENTAGRAMS)) assert.ok(PENT_NAMES[id], `у «${id}» нет слова-заклинания`);
    const en = Object.values(PENT_NAMES).map((n) => n.en.toLowerCase());
    assert.equal(new Set(en).size, en.length, 'имена повторяются');
    for (const id of figureIds()) assert.match(pentagramSpell(id), /^Pentagranium [A-Z][a-z]+$/);
});

test('фраза «Пентаграниум <Имя>» узнаётся и называет свою пентаграмму; все варианты записи', () => {
    for (const [id, n] of Object.entries(PENT_NAMES)) {
        assert.equal(pentagramWords(`pentagranium ${n.en}`), id, n.en);
        for (const said of pentagramSaid().flat().filter((p) => p.endsWith(' ' + n.say[0]))) { assert.equal(pentagramWords(said), id, said); assert.equal(matchSpell(said), 'Pentagranium', said); }
        for (const w of n.say) assert.equal(pentagramWords(`пентаграниум ${w}`), id, w);
    }
});

test('одно «Пентаграниум» и одно имя — не заклинание; обычная речь не колдует', () => {
    for (const t of ['пентаграниум', 'Pentagranium', 'пентаграниум пентаграниум', 'телепортис', 'вита', 'диаболус', 'монструм', 'привет как дела', 'нарисуй пентаграмму', 'это просто вита моя жизнь'])
        assert.equal(pentagramWords(t), null, t);
    for (const t of ['пентаграниум', 'телепортис', 'вита', 'монструм']) assert.notEqual(matchSpell(t), 'Pentagranium', t);
});
