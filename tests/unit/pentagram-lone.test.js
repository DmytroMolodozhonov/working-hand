// «Пентаграниум» одно / с искажённым именем / с хвостом из повторов слов: ни пентаграммы, ни других заклинаний из той же фразы
// (жалоба автора: «сказал "Пентаграниум" — пошла куча бессмысленных заклинаний»). Путь: нейросеть → NativeVoice.lookAt → слова → matchSpell/spellPhrase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lookAt } from '../../src/input/NativeVoice.js';
import { encode, V, BLANK } from '../../src/audio/SpellSpotter.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { spellPhrase } from '../../src/audio/SpellPhrase.js';
import { pentagramWords } from '../../src/game/PentagramWords.js';

/** Строки сети для фразы: буква — 3 кадра, между буквами тишина; tail — тишина в конце. */
function rows(phrase, tail) {
    const f = [], b = () => f.push(BLANK);
    for (let i = 0; i < 4; i++) b();
    for (const t of encode(phrase)) { for (let k = 0; k < 3; k++) f.push(t); b(); }
    for (let i = 0; i < tail; i++) b();
    const T = f.length, bytes = new Uint8Array(T * V).fill(120);
    f.forEach((x, t) => { bytes[t * V + x] = 1; });
    return { lp: Buffer.from(bytes).toString('base64'), T };
}

/** Все взгляды на растущую фразу (недосказанный и законченный): что отдано игре. */
function looks(full) {
    const out = [];
    for (let n = 4; n <= full.length; n += 2) {
        const p = full.slice(0, n).trim();
        for (const final of [false, true]) {
            const r = rows(p, final ? 20 : 3);
            const res = lookAt({ lp: r.lp, T: r.T, final, cut: false, far: 0, snr: 30, id: 1 }, {});
            out.push({ p, final, sure: res.heard.sure, say: res.say, text: res.say?.text || '' });
        }
    }
    return out;
}
/** Игре эти слова не дают никакого заклинания. */
const castsNothing = (o) => !o.sure && !matchSpell(o.text) && !spellPhrase(o.text, { final: o.final }).ok;

test('одно «Пентаграниум» (и недосказанные куски) — ничего: ни пентаграммы, ни других заклинаний', () => {
    for (const o of looks('пентаграниум')) assert.ok(castsNothing(o), `«${o.p}» final=${o.final} → ${o.text}`);
});

test('«Пентаграниум» и искажённое имя — ничего, и слова-хвост («акцию акцию…») не колдуют другое', () => {
    for (const t of ['пентаграниум мита', 'пентаграниум бита', 'пентаграниум акцию акцию акцию', 'пентаграниум акцио', 'пентаграниум хлеб хлеб'])
        for (const o of looks(t)) { assert.ok(castsNothing(o), `«${o.p}» final=${o.final} → ${o.text}`); assert.equal(pentagramWords(o.text), null, o.p); }
});

test('повторы слов схлопываются: «Пентаграниум Вита Вита» — одна пентаграмма (Vita), ничего лишнего', () => {
    for (const o of looks('пентаграниум вита вита').filter((x) => x.sure || matchSpell(x.text))) {
        assert.equal(pentagramWords(o.text), 'life', o.p);
        assert.equal(matchSpell(o.text), 'Pentagranium', o.p);
    }
});
