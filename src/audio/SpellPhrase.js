/**
 * SpellPhrase.js — is the phrase the spell itself, or talk with a spell's word in it?
 *
 * The author: «я произношу какие-то заклинания, или просто разговариваю — а начинаются какие-то
 * заклинания, которых я вообще не просил». The game's matcher (SpellManager.matchSpell) looks for pieces
 * of words: «спасибо» holds «спаси» (Rescue), «сапоги» «сап» (Sapira), «сегодня солнце светит» «солнц»
 * (To the Sun), «он заморозил реку» «заморо» (Frozen), «стоп, подожди» «стоп». So before a phrase casts:
 *
 *  - the spell's words are found in it (the fewest words in a row that still name that spell);
 *  - the rest of the phrase may hold only little words («ну», «давай», «эй»…) and the spell said again;
 *    one other word at most next to a long spell («бомбардо давай»), none next to a short one («стоп»);
 *  - the spell's words sound like one of the ways that spell is said (SpellSpotter.VOCAB), or are one of
 *    its plain Russian names said on purpose («огонь», «щит», «спаси», «к солнцу»); a word that only
 *    holds a piece of a spell («сапоги», «спасибо», «акция») never casts;
 *  - a phrase still being said casts only when it is the spell and nothing else.
 *
 *   spellPhrase(text, {final}) → {name, ok, why, words, span, extra, close}
 */

import { matchSpell } from '../fx/SpellManager.js';
import { VOCAB, WORDY } from './SpellSpotter.js';

const norm = (t) => String(t ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const letters = (t) => norm(t).replace(/[^a-zа-я]/g, '');

/** Little words that may stand round a spell («ну, Бомбардо!», «давай, Инферно», «эй, Айс»). */
export const FILLER = new Set(['ну', 'так', 'давай', 'давайка', 'а', 'э', 'эй', 'и', 'вот', 'ой', 'ох', 'ах', 'эх', 'же', 'ка', 'да', 'ещё', 'еще', 'раз',
    'опа', 'оп', 'хоп', 'гоп', 'окей', 'ok', 'okay', 'go', 'гоу', 'please', 'пожалуйста', 'ага', 'эм', 'мм', 'хм', 'ааа', 'эээ']);

/** A phrase this long is a sentence: no spell is that many words (the longest: «Let the Hellfire Come…»). */
export const MAX_WORDS = 10;

/**
 * Plain Russian names of spells said on purpose (whole words — not «спасибо», not «заморозил»). Only
 * these and the ways of saying a spell (SpellSpotter.VOCAB) cast; a word that merely holds a piece of a
 * spell is talk.
 */
export const RU_SAID = {
    Inferno: /^(огонь|огня|огнем|огнём|пламя)$/,
    Protection: /^щит$/,
    ProtectionMaxima: /^щит максима$/,
    Gather: /^(собери|соберите|собрать|соберись)$/,
    Rescue: /^(спаси|спасите|спасение)$/,
    Alive: /^(оживи|оживите|оживай|оживи[ст]ь|оживление)$/,
    Wind: /^(ветер|ветра)$/,
    Thunderwave: /^(гром|молния|молнию|удар)$/,
    Flight: /^(полет|полёт|взлет|взлёт)$/,
    Pause: /^(пауза|паузу)$/,
    Breakthrough: /^прорыв$/,
    Invisibility: /^(невидимка|невидимость|невидимый|невидимой|невидимым)$/,
    Attack: /^(атака|атаку|атакуй|атакуйте|в атаку)$/,
    Frozen: /^(заморозь|заморозка|заморозить|заморозьте)$/,
    ToTheSun: /^(к солнцу|солнце|солнцу)$/,
    Sands: /^(песок|песком)$/,
    Stitching: /^(сшей|сшить|сшивай|сшейте)$/,
    Disarmor: /^(раздень|раздеть|разоблачись)$/,
    Drawdown: /^просядь$/,
    Reveal: /^(раскрой|раскрой секреты|раскрой свои секреты|секреты|тайны)$/,
    CreateBed: /^(кровать|создай кровать)$/,
    Earthquake: /^(землетрясение)$/,
    SuitUp: /^(облачись|облачиться)$/,
    Waterball: /^(водяной шар|водный шар)$/,
};

/** Spells the matcher takes only as whole words of their own («джольд», «лёд», «ап», «лок»): no piece of a word. */
export const WHOLE_WORD = new Set(['Jolt', 'JoltMaxima', 'Ice', 'Lock', 'Up', 'Expelliarmus', 'Hellfire']);

/** Words that hold a spell's sound but are everyday words — never a spell, even said alone. */
export const EVERYDAY = new Set(['спасибо', 'акция', 'акции', 'акций', 'максим', 'максимум', 'максимально', 'сатурн', 'сапоги', 'сапог', 'санта',
    'сапер', 'скайп', 'сам', 'сама', 'сами', 'само']);

/** Fewest letter changes from a to b. */
export function edits(a, b) {
    const n = a.length, m = b.length;
    if (!n) return m;
    if (!m) return n;
    let prev = new Int32Array(m + 1), cur = new Int32Array(m + 1);
    for (let j = 0; j <= m; j++) prev[j] = j;
    for (let i = 1; i <= n; i++) {
        cur[0] = i;
        for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        const t = prev; prev = cur; cur = t;
    }
    return prev[m];
}

// the ways of saying each spell: their letters and how many words
const SAID_BY = new Map();
for (const w of VOCAB) {
    const l = letters(w.phrase);
    if (!l) continue;
    if (!SAID_BY.has(w.spell)) SAID_BY.set(w.spell, []);
    SAID_BY.get(w.spell).push({ l, k: w.phrase.split(' ').length });
}

/** How many letters may differ from a way of saying the spell (short ones: none — «ап», «лед»). */
const tolerance = (len) => (len <= 3 ? 0 : len <= 5 ? 1 : Math.round(len * 0.4));

/**
 * Where in the words is one of the ways of saying `name` (near enough: misheard letters, a word split in two
 * or two run together)? → [first word, last word] or null
 */
export function saidAt(name, words) {
    const said = SAID_BY.get(name);
    if (!said) return null;
    // (the most of the phrase's letters a way of saying it covers — a one-letter word at its edge doesn't
    // count: «пауза в игре» is «пауза», «ил бабл» is «эйр баббл» — then the fewest changes)
    let best = null, bestCover = 0, bestD = Infinity;
    for (const { l, k } of said) {
        const tol = tolerance(l.length);
        for (let len = 1; len <= k + 1 && len <= words.length; len++) {
            for (let i = 0; i + len <= words.length; i++) {
                const part = words.slice(i, i + len);
                const d = edits(part.join(''), l);
                // (split or run together differently from the way it is said: only a near-exact one)
                if (d > (len === k ? tol : Math.min(tol, 1))) continue;
                if (len > 1 && (part[0].length <= 1 || part[len - 1].length <= 1)) continue;
                const cover = part.join('').length;
                if (cover > bestCover || (cover === bestCover && d < bestD)) { bestCover = cover; bestD = d; best = [i, i + len - 1]; }
            }
        }
    }
    return best;
}

/**
 * Are these words the spell's plain Russian name, or English (the browser's), or a spell the sound list
 * doesn't know? → 'russian' | 'latin' | 'word' | 'other' | null (only a piece of a spell)
 */
export function closeTo(name, words) {
    const t = words.join(' ');
    if (RU_SAID[name]?.test(t)) return 'russian';
    if (!/[а-я]/.test(letters(t))) return 'latin'; // («Bombardo», «Protection»)
    if (WHOLE_WORD.has(name)) return 'word';
    return SAID_BY.has(name) ? null : 'other';
}

/**
 * Is the phrase the spell itself?
 * @param {string} text   what was heard
 * @param {{final?: boolean, match?: Function}} [o]  final: the phrase is over (else it is still being said)
 * @returns {{name: string|null, ok: boolean, why: string, words: string[], span: [number, number], extra: number, close: string|null}}
 *   why (when not ok): 'sentence' (a spell's word in talk), 'piece' (a piece of an everyday word),
 *   'everyday', 'unfinished' (wait for the end of the phrase)
 */
export function spellPhrase(text, { final = true, match = matchSpell } = {}) {
    const name = match(text);
    const words = norm(text).split(' ').filter(Boolean);
    const out = { name, ok: !!name, why: '', words, span: [0, Math.max(0, words.length - 1)], extra: 0, close: null };
    if (!name) { out.why = 'no'; return out; }
    if (WORDY.has(name)) return out; // («поменяй цвет на синий»: the words go on)
    if (words.length > MAX_WORDS) return { ...out, ok: false, why: 'sentence', extra: words.length };
    // where the spell's own words are: one of its ways of saying it — else the fewest words in a row that
    // still name it (then they must be its Russian name, or English)
    let span = saidAt(name, words), close = span ? 'said' : null;
    if (!span) {
        span = [0, words.length - 1];
        found: for (let len = 1; len <= words.length; len++) {
            for (let i = 0; i + len <= words.length; i++) {
                if (match(words.slice(i, i + len).join(' ')) === name) { span = [i, i + len - 1]; break found; }
            }
        }
        close = closeTo(name, words.slice(span[0], span[1] + 1));
    }
    const [a, b] = span;
    out.span = span;
    out.close = close;
    const spellWords = words.slice(a, b + 1);
    // the rest: little words and the spell said again are no talk
    let extra = 0;
    for (let i = 0; i < words.length; i++) {
        if (i >= a && i <= b) continue;
        const w = words[i];
        if (w.length <= 1 || FILLER.has(w) || match(w) === name) continue;
        extra++;
    }
    out.extra = extra;
    const flat = spellWords.join(' ');
    if (EVERYDAY.has(flat)) return { ...out, ok: false, why: 'everyday' };
    if (!close) return { ...out, ok: false, why: 'piece' };
    // one word more next to a long spell («бомбардо давай»), none next to a short one («стоп», «ап», «айс»)
    const allowed = letters(flat).length <= 5 || close === 'russian' ? 0 : 1;
    if (extra > allowed) return { ...out, ok: false, why: 'sentence' };
    if (!final && extra > 0) return { ...out, ok: false, why: 'unfinished' };
    return out;
}

/** Why a phrase did not cast, in plain Russian (the spell journal). */
export const PHRASE_WHY_RU = {
    sentence: 'слово заклинания внутри обычной фразы — это разговор',
    piece: 'обычное слово, в котором только кусочек заклинания',
    everyday: 'обычное слово, а не заклинание',
    unfinished: 'фраза ещё не закончена — ждём конца',
};
