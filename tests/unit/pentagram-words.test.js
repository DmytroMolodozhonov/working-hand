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

// --- слух: второе слово должно быть сказано и услышано (SpellSpotter.pentNameHeard) ---
import { hear, encode, V, BLANK } from '../../src/audio/SpellSpotter.js';

/** Синтетические строки сети: каждая буква 3 кадра по 40 мс, между словами тишина; `tail` кадров тишины в конце. */
function rows(phrase, tail = 8, noise = {}) {
    const frames = [];
    const blank = () => frames.push(BLANK);
    for (let i = 0; i < 4; i++) blank();
    for (const t of encode(phrase)) { for (let k = 0; k < 3; k++) frames.push(t); blank(); }
    for (let i = 0; i < tail; i++) blank();
    const T = frames.length, lp = new Float32Array(T * V).fill(-12);
    frames.forEach((f, t) => { lp[t * V + f] = -0.05; if (noise[f]) { lp[t * V + noise[f]] = -0.3; lp[t * V + f] = -3; } });
    return { lp, T };
}
const said = (phrase, o = {}) => { const r = rows(phrase, o.tail, o.noise); return hear(r.lp, r.T, { final: o.final !== false }); };

test('слух: полное «Пентаграниум <Имя>» узнаётся, и это своё имя (длиннейшее побеждает)', () => {
    for (const [id, n] of Object.entries(PENT_NAMES)) {
        const h = said(`пентаграниум ${n.say[0]}`);
        assert.equal(h.sure, true, n.en);
        assert.equal(pentagramWords(h.text), id, n.en);
    }
});

test('слух: одно «Пентаграниум» (в конце фразы и посреди неё) — не заклинание, ничего не подставляется, будет подсказка', () => {
    for (const final of [true, false]) {
        const h = said('пентаграниум', { final });
        assert.equal(h.sure, false, `final=${final}`);
        assert.equal(h.pentWeak, true, 'подсказка «Скажите полное имя»');
    }
});

test('слух: слово сказано не до конца или искажено — это НЕ Vita и вообще ничего', () => {
    for (const t of ['пентаграниум ви', 'пентаграниум мита', 'пентаграниум бита', 'пентаграниум витамин', 'пентаграниум тел', 'пентаграниум телепо', 'пентаграниум кукуруза', 'пентаграниум хлеб']) {
        const h = said(t);
        assert.equal(h.sure, false, t);
        assert.notEqual(pentagramWords(h.text) && h.sure, true, t);
    }
});

test('слух: первое слово, потом пауза посреди фразы — ждём: ничего, пока имя не договорено; договорили — пентаграмма та, что сказана', () => {
    assert.equal(said('пентаграниум', { final: false, tail: 14 }).sure, false);
    assert.equal(said('пентаграниум мен', { final: false }).sure, false);
    const h = said('пентаграниум мендис', { final: false });
    assert.equal(pentagramWords(h.text), 'mend');
});

test('текст: «вита» как часть другого слова — не имя', () => {
    for (const t of ['пентаграниум витамины', 'pentagranium vitamin']) assert.equal(pentagramWords(t), null, t);
    assert.equal(pentagramWords('пентаграниум вита'), 'life');
});
