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
import { editsInside } from './GameVoices.js';

const norm = (t) => String(t ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const letters = (t) => norm(t).replace(/[^a-zа-я]/g, '');

/** Little words that may stand round a spell («ну, Бомбардо!», «давай, Инферно», «эй, Айс»). */
export const FILLER = new Set(['ну', 'так', 'давай', 'давайка', 'а', 'э', 'эй', 'и', 'вот', 'ой', 'ох', 'ах', 'эх', 'же', 'ка', 'да', 'ещё', 'еще', 'раз',
    'теперь', 'щас', 'сейчас', 'короче', 'ладно', 'итак', 'и так', 'нука', 'ну-ка',
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
    ProtectionGods: /^(божественная защита|щит богов|защита богов)$/,
    ProtectionGodsMaxima: /^(божественная защита максима|щит богов максима|защита богов максима)$/,
    Gather: /^(собери|соберите|собрать|соберись)$/,
    Rescue: /^(спаси|спасите|спасение)$/,
    Alive: /^(оживи|оживите|оживай|оживи[ст]ь|оживление)$/,
    Wind: /^(ветер|ветра)$/,
    Thunderwave: /^гром$/, // (40 mana a cast: a lone «удар» / «молния» in a talk must not burn it)
    Flight: /^(полет|полёт|взлет|взлёт)$/,
    Pause: /^(пауза|паузу)$/,
    Breakthrough: /^прорыв$/,
    Invisibility: /^(невидимка|невидимость|невидимый|невидимой|невидимым)$/,
    Attack: /^(атака|атаку|атакуй|атакуйте|в атаку)$/,
    Frozen: /^(заморозь|заморозка|заморозить|заморозьте)$/,
    ToTheSun: /^(к солнцу|солнце|солнцу)$/,
    Sands: /^(песок|песком)$/,
    Stitching: /^(сшей|сшить|сшивай|сшейте)$/,
    CreateBridge: /^(создай мост|построй мост|наведи мост|перекинь мост)$/,
    Disarmor: /^(раздень|раздеть|разоблачись)$/,
    Drawdown: /^просядь$/,
    Reveal: /^(раскрой|раскрой секреты|раскрой свои секреты|секреты|тайны)$/,
    CreateBed: /^(кровать|создай кровать)$/,
    Earthquake: /^(землетрясение)$/,
    SuitUp: /^(облачись|облачиться)$/,
    Waterball: /^(водяной шар|водный шар)$/,
};

/** Spells the matcher takes only as whole words of their own («джольд», «лёд», «ап», «лок»): no piece of a word. */
export const WHOLE_WORD = new Set(['Jolt', 'JoltMaxima', 'Ice', 'Lock', 'Up', 'Expelliarmus', 'Hellfire', 'Die']); // («Дай»: only the whole phrase — StrongSpells.dieWords)

/** Words that hold a spell's sound but are everyday words — never a spell, even said alone. */
export const EVERYDAY = new Set(['спасибо', 'акция', 'акции', 'акций', 'максим', 'максимум', 'максимально', 'сатурн', 'сапоги', 'сапог', 'санта',
    'сапер', 'скайп', 'сам', 'сама', 'сами', 'само']);

/**
 * Stems of long everyday words that the sound spotter takes for a spell («интересно» — «Инферно»: the author ran and said it
 * to himself, and the fire came). A word of the sound's letters that begins with one of these (a letter off is allowed) and
 * is not the spell's own word is talk. Raise the list when the journal shows another such word.
 */
export const SOUNDALIKE_STEMS = ['интерес', 'интерфейс', 'интернет', 'информац', 'инфекц', 'инфляц', 'инфаркт', 'инфракрас',
    'империя', 'империи', 'империю', 'империей', 'империал', 'имперск', 'император']; // («империя» sounds like «Империус» — talk)

/** How clearly (fit) a sound must be heard for a written near-miss of the spell's own word to count as that spell. */
export const IMPERIUS_FIT = 1;

/** The everyday stem a word of what was heard begins with (not the spell's own word), or null. */
export function everydayHeard(written, canonical = '', fit = -Infinity) {
    const own = letters(canonical);
    // (the author's journal 24.10: «империус» written «империя», fit +1.1, the lips moving — the network drops the «у»/«с»: when the
    // sound is clear, a written word that is a near miss of one of the spell's own words is the spell, not «империя»)
    const ownWords = fit >= IMPERIUS_FIT ? norm(canonical).split(' ').filter((o) => o.length >= 6) : [];
    for (const w of norm(written).split(' ')) {
        if (w.length < 6) continue;
        if (own && edits(w, own) <= 1) continue; // (it is the spell itself)
        if (ownWords.some((o) => w.slice(0, 5) === o.slice(0, 5) && edits(w, o) <= 2)) continue;
        for (const s of SOUNDALIKE_STEMS) if (w.length >= s.length - 1 && [s.length - 1, s.length, s.length + 1].some((n) => edits(w.slice(0, n), s) <= 1)) return s; // (a letter lost, added or changed)
    }
    return null;
}

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
    SAID_BY.get(w.spell).push({ l, k: w.phrase.split(' ').length, phrase: w.phrase, canonical: w.canonical });
}

/** How many letters may differ from a way of saying the spell (short ones: none — «ап», «лед»). */
const tolerance = (len) => (len <= 3 ? 0 : len <= 5 ? 1 : Math.round(len * 0.4));

/**
 * Where in the words is one of the ways of saying `name` (near enough: misheard letters, a word split in two
 * or two run together)? → [first word, last word] or null
 */
export function saidAt(name, words, info = null) {
    const said = SAID_BY.get(name);
    if (!said) return null;
    // (the most of the phrase's letters a way of saying it covers — a one-letter word at its edge doesn't
    // count: «пауза в игре» is «пауза», «ил бабл» is «эйр баббл» — then the fewest changes)
    let best = null, bestCover = 0, bestD = Infinity;
    for (const way of said) {
        const { l, k } = way;
        const tol = tolerance(l.length);
        for (let len = 1; len <= k + 1 && len <= words.length; len++) {
            for (let i = 0; i + len <= words.length; i++) {
                const part = words.slice(i, i + len);
                const d = edits(part.join(''), l);
                // (split or run together differently from the way it is said: only a near-exact one)
                if (d > (len === k ? tol : Math.min(tol, 1))) continue;
                if (len > 1 && (part[0].length <= 1 || part[len - 1].length <= 1)) continue;
                const cover = part.join('').length;
                if (cover > bestCover || (cover === bestCover && d < bestD)) { bestCover = cover; bestD = d; best = [i, i + len - 1]; if (info) info.way = way; }
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
    const info = {};
    let span = saidAt(name, words, info), close = span ? 'said' : null;
    if (span) out.said = info.way; // (which way of saying it: {phrase, canonical})
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

/** ms after a spell of mine went off in which another one from the voice must be heard clearly (AFTER_CAST_FIT). */
export const AFTER_CAST_MS = 1500;
export const AFTER_CAST_FIT = 0.6;

/**
 * Right after a spell went off, the microphone hears its explosion, its echo, the end of my own phrase:
 * the author's «Бомбардо Максима» was followed by a «Джолт» and a second «Бомбардо» he never said. A spell
 * from the same phrase that already cast one, or one only just made out within AFTER_CAST_MS, is not cast.
 * @param {{spell: string, at: number, seg?: any}|null} last  the last spell that went off (from the voice)
 * @param {string} spell  the spell heard now
 * @param {object|null} meta  the voice's details (native: seg, fit)
 * @returns {string|null} why it is not cast, or null
 */
export function afterCast(last, spell, meta, now) {
    if (!last || !spell || !(now - last.at < 4000)) return null;
    const fit = meta?.fit;
    // («Бомбардо Максима» → «Айс Максима» twice: a look at the phrase's end starting inside «бомбардо» fits «лёд максима» well —
    // one phrase says one «… Максима»; in the next 1.5 s another «X Максима» is that same end, however clearly it was made out)
    if (/Maxima$/.test(spell) && /Maxima$/.test(last.spell) && spell !== last.spell && !last.spell.startsWith(spell)
        && (meta?.seg != null && meta.seg === last.seg || now - last.at < AFTER_CAST_MS)) return `конец той же фразы «${last.spell}» прочитан как «${spell}»`;
    // (the author's journal: «Бомбардо» cast alone, its «…Максима» refused as too late, then the tail «…максима» read as «Айс Максима»
    // 2 s on and cast — a spell that has a «Максима» of its own leaves no other «X Максима» for 4 s; «Джолт» is a duel chain, left free)
    if (/Maxima$/.test(spell) && spell !== last.spell + 'Maxima' && last.spell !== 'Jolt' && SAID_BY.has(last.spell + 'Maxima'))
        return `«${last.spell}» только что сработало, а «…максима» после него — его хвост, не «${spell}»`;
    if (meta?.seg != null && meta.seg === last.seg) {
        // (the same spell or a piece of it again: no; its longer form after a long pause — no second blast; only
        // «Джолт» → «Джолт Максима»: the game makes the charge already flying grow)
        if (spell === last.spell || last.spell.startsWith(spell)) return `эта же фраза уже дала «${last.spell}»`;
        // («Protection» → «… Maxima» / «… Gods» / «… Gods Maxima»: the shield grows into the longer one — the game swaps it)
        if (spell.startsWith(last.spell)) return last.spell === 'Jolt' || /^Protection(Gods)?$/.test(last.spell) ? null : `уже сработало «${last.spell}» — продолжение сказано слишком поздно`;
        if (!(fit >= AFTER_CAST_FIT)) return `эта же фраза уже дала «${last.spell}», а это узнано неуверенно (звук взрыва / эхо?)`;
        return null;
    }
    if (meta?.native && now - last.at < AFTER_CAST_MS && !(fit >= AFTER_CAST_FIT)) return `сразу после «${last.spell}» и узнано неуверенно — похоже на звук заклинания или эхо`;
    return null;
}

/** ms after the last letter beyond which a spell found inside a longer stream of speech is too late to be mine. */
export const LATE_IN_SPEECH_MS = 1500;

/**
 * The author's journal 24.10 (a call: loud speakers, a busy computer): a spell found by its sound inside a long run of
 * speech («…о смотри видишь как круто я проиграл абадакида ин» → «Авада» 7.8 s late, «валим валим…» → «Вайнд Максима» 4.9 s late)
 * surfaced seconds after the words; nobody says a spell that late. A spell the words of which make up the whole phrase
 * (or all but a word) is only slow — it still goes; «стоп» is always let through.
 * @returns {string|null} why it is not cast, or null
 */
export function lateInSpeech(spell, command, meta, now) {
    if (!meta?.native || spell === 'Stand' || !Number.isFinite(meta.to)) return null;
    const lag = now - meta.to;
    if (!(lag > LATE_IN_SPEECH_MS)) return null;
    const said = norm(meta.written || '').split(' ').filter(Boolean).length, own = norm(command || '').split(' ').filter(Boolean).length;
    if (said < own + 2) return null;
    return `слово из длинной речи, дошло через ${Math.round(lag)} мс — это не сказанное заклинание`;
}

/** A short spell («Даст», «Джолт», «Айс», «Ап») must fit this much better than needed while running or in noise. */
export const SHORT_LEN = 5;
/** A spell this short (letters) must have its own letters in what was heard (soundTrust). */
export const SHORT_WORD = 6;
export const SHORT_FIT = 0.5;

/**
 * Breathing, steps, a rustle, the microphone's click — running in front of the camera with no word said —
 * read as a short spell: the author's «просто бегаю — выстреливает «Даст», «Джолт» несколько раз».
 * @param {{spell: string, text?: string, native?: boolean, fit?: number, len?: number, snr?: number,
 *          running?: boolean, lips?: boolean|null}} h  lips: the camera saw the mouth move (null: not seen)
 * @returns {string|null} why it is not a spell, or null
 */
export function bodyNoise(h) {
    if (!h?.spell) return null;
    const len = Number.isFinite(h.len) && h.len > 0 ? h.len : letters(h.text || '').length;
    const short = len <= SHORT_LEN;
    // the camera saw my mouth stay still: no word was said (a short spell, or anything while running)
    // (the network on this computer tells how well the spell fit: there soundTrust weighs the lips with it)
    if (h.lips === false && (short || h.running) && !(h.native && Number.isFinite(h.fit))) return 'губы не двигались — это не речь (дыхание, шаги, шорох)';
    if (h.native && short && Number.isFinite(h.fit) && h.fit < SHORT_FIT && (h.running || (Number.isFinite(h.snr) && h.snr < 12))) {
        return `короткое заклинание узнано неуверенно ${h.running ? 'на бегу' : 'в шуме'} (запас ${h.fit.toFixed(1)}, нужно ${SHORT_FIT})`;
    }
    return null;
}

/** Spells that cost much or do much (a castle out of nothing, a curse that kills): never from a sound only just made out. */
export const DANGEROUS = new Set(['CreateCastle', 'IceCastle', 'IceBridge', 'CreateHouse', 'ImproveHouse', 'AvadaKedavra', 'Hellfire', 'Frozen', 'Stupefy',
    'TotalDestruction', 'TotalDestructionMaxima', 'Inspirius', 'LightningStrike', 'Earthquake', 'EarthquakeMaxima', 'CircleAttack', 'CircleAttackMaxima',
    'WaterVortexSuperMaxima', 'LetItRain', 'ToTheSun', 'CreatePlanet', 'EnlargePlanet', 'TerraformPlanet', 'LevitationSuperMaxima', 'PlanetLiquidation', 'ProtectionGods', 'ProtectionGodsMaxima', 'Die', 'Pilbidrio']); // («Дай» kills anyone: never from a sound only just made out)

/**
 * Do the letters the network wrote look like the spell? («лемус» — «люмос», «бам барда» — «бомбардо максима»,
 * «фроза» — «фрозен»: yes; «да» — «даст», «страх» — «остолбеней», «настрой свой» — «криейт э касл»: no.)
 */
export function lettersLike(written, spellWords) {
    const w = letters(written), p = letters(spellWords);
    if (!w || !p) return false;
    // (the vowels are what the network mixes up most: «лемус», «глемус» are «люмос»)
    const fold = (x) => x.replace(/[аеёиоуыэюя]/g, 'а');
    const like = (ww, pp, exact = false) => {
        // the spell inside the written words, with a little talk round it («можно такой стичин»; a whole
        // sentence round a short spell is no sign: «…сюда та…» holds «даст»)
        if (ww.length <= pp.length * 2.5 + 4 && (pp.length > 5 || ww.length >= pp.length) && editsInside(pp, ww) <= (pp.length <= 3 ? 0 : pp.length <= 5 || exact ? 1 : Math.round(pp.length * 0.4))) return true;
        // the written words a piece of the spell (the network wrote only part of it: «максиму» of «вайнд максима»)
        const enough = pp.length <= 5 ? Math.max(3, pp.length - 1) : Math.max(4, Math.round(pp.length * 0.4));
        return ww.length >= enough && editsInside(ww, pp) <= (exact ? 0 : Math.floor(ww.length * 0.3));
    };
    // (vowels folded: exact for a short spell — «проза» is no «фрозен», «лемус» is «люмос»)
    return like(w, p) || like(fold(w), fold(p), p.length <= SHORT_WORD);
}

/**
 * A spell found by its sound (the network on this computer) — how sure must it be? The author's journal: «Даст»
 * from «да», «Остолбеней» from «страх», «Криейт э касл» from «настрой свой», «Frozen» from «просто» — all only just
 * above the line (запас +0…+0.9), the letters nothing like the spell; the camera's lips often unseen on the run.
 *  - the letters like the spell: as before; not like it: a clear fit (+1);
 *  - short ones («Даст», «Айс», «Вайнд», «Ап»): +0.3; while the speakers play or on the run more;
 *  - the costly / deadly ones (DANGEROUS): +0.6, with letters not like it +1.5;
 *  - the lips seen still: only a clear fit (+1.5) of letters like the spell — the camera is often wrong
 *    (a hand, the wand at the face, running), a shout of «Ликвидейшн Максима» (+2.6) is a spell;
 *  - «стоп» only stops: +1 is always enough.
 * @param {{spell: string, canonical?: string, written?: string, fit: number, len?: number, far?: number,
 *          running?: boolean, lips?: boolean|null}} h
 * @returns {string|null} why it is not cast, or null
 */
export function soundTrust(h) {
    if (!h?.spell || !Number.isFinite(h.fit)) return null;
    const fit = h.fit;
    const like = lettersLike(h.written ?? h.canonical ?? '', h.canonical ?? '');
    if (h.written && h.spell !== 'Stand' && everydayHeard(h.written, h.canonical, fit)) return 'обычное слово («интересно» и т.п.), а не заклинание';
    const len = Number.isFinite(h.len) && h.len > 0 ? h.len : letters(h.canonical || '').length;
    const short = len <= SHORT_LEN;
    if (h.spell === 'Stand') return fit >= 1 || (like && fit >= 0.3) ? null : `«стоп» узнан неуверенно (запас ${fit.toFixed(1)})`;
    if (h.lips === false && !like) return 'губы не двигались, и буквы не похожи на заклинание';
    // «Акцио» in a duel (`hope`: my wand was knocked away — I call it back): the network hears it as «актер», «акце», «арте»;
    // the word is short, but here it is what is wanted and harmless — a slight fit is enough (the lips seen still are still refused)
    if ((h.spell === 'Accio' || h.spell === 'Expelliarmus') && h.hope && h.lips !== false) return fit >= 0.3 ? null : `«${h.spell === 'Accio' ? 'Акцио' : 'Экспеллиармус'}» узнано неуверенно (запас ${fit.toFixed(1)}, нужно 0.3)`; // (and «Экспеллиармус» — the duel's own word: «эсплянус» is it)
    // a short one-word spell («Sands», «Даст», «Айс», «Frozen»…) is a word said on its own — its letters must be
    // there: a lone «с» of talk to oneself, «просто», «заморозил» are no spell however the sound fits (the author:
    // «сам с собой разговаривал — прозвучала буква с, и сработал песок»); nor one word in a sentence the network wrote
    if (len <= SHORT_WORD) {
        const tiny = letters(h.canonical || '').length <= 2 && h.lips === true && fit >= 1.2; // («ап» heard as «а», the mouth seen moving)
        if (!like && !tiny) return 'короткое заклинание: буквы не похожи — это обычная речь';
        const said = norm(h.written ?? '').split(' ').filter(Boolean).length, own = norm(h.canonical || '').split(' ').filter(Boolean).length;
        if (said > own + 2) return 'короткое заклинание внутри фразы — это разговор';
    }
    let need = 0;
    const why = [];
    if (!like) { need = Math.max(need, 1); why.push('буквы не похожи'); }
    if (short) { need = Math.max(need, 0.3); why.push('короткое'); }
    if (short && (h.far || 0) >= 0.5) { need = Math.max(need, 1); why.push('звучали колонки'); }
    if (short && h.running) { need = Math.max(need, 0.8); why.push('на бегу'); }
    // («Дай» asks the raised hand aimed right at the target besides: its letters said clearly are enough)
    if (DANGEROUS.has(h.spell)) { need = Math.max(need, like ? (h.spell === 'Die' ? 0.3 : 0.6) : 1.5); why.push('сильное заклинание'); }
    if (h.lips === false) { need = Math.max(need, 1.5); why.push('губы не двигались'); }
    if (fit >= need) return null;
    return `узнано неуверенно: запас ${fit.toFixed(1)}, нужно ${need} (${why.join(', ')})`;
}

/** The written words are the game's own line sounding then («так спасибо» over «Спасибо, братцы!»). */
export function wordsOfLine(written, line) {
    const w = letters(written), l = letters(line);
    if (w.length < 4 || !l) return false;
    return editsInside(w, l) <= Math.round(w.length * 0.3);
}

/** The phrase begins with «стоп» and goes on with a spell («стоп, раскрой свои секреты»): first stop, then cast. */
export function stopFirst(text) {
    const w = norm(text).split(' ').filter(Boolean);
    return w.length > 1 && /^(стоп|stop)$/.test(w[0]);
}
