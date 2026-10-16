/**
 * SpellSpotter.js — which spell was said, found by its sound.
 *
 * The speech network (voice_native.py) tells for every 40 ms of sound how likely each
 * Russian letter is (CTC: 33 letters + space + «nothing new»). Writing that out as words loses the
 * spells: they are not Russian words, and «Бомбардо» comes out «ломбарды», «Протекшн» «против же».
 * So here every way of saying every spell is laid over the sound itself: how far from what the
 * network heard best must one go to read that spell there? The spell that needs the least — and
 * little enough — is the one said. On test recordings this finds the spell 86–95% of the time,
 * where the written words found it 25%; everyday talk («привет, как дела») is never a spell.
 *
 *   unpack(b64, T)      the network's rows as they come from voice_native.py
 *   prepare(lp, T)      the best letter of each 40 ms (shared by all the spells)
 *   greedy(P)           the words as written (for talking to villagers)
 *   spot(P, toks)       the best place of one phrase in the sound, and what it costs
 *   bestSpell(P)        the spell that fits best (and how well)
 *   hear(...)           what to hand on as «heard»: the spell's own words, or the written words
 */

import { matchSpell } from '../fx/SpellManager.js';

export const LETTERS = ' абвгдежзийклмнопрстуфхцчшщъыьэюя';
export const SPACE = 0;
export const BLANK = 33;
export const V = 34;
const NEG = -1e9;

// ------------------------------------------------------------------ the spells as they are said
// [the words the game's matcher knows (matchSpell) — and other ways the same spell is said]
// Written as a Russian speaker says them («криейт э уолл», not «Create a Wall»): the network writes Russian.
// A «… Максима» form is added by itself for every spell that has one (matchSpell decides).
const SAID = [
    ['инферно'],
    ['тандервейв', 'тандер вейв', 'сандервейв'],
    ['гром'],
    ['даст', 'санд'],
    ['бомбардо', 'бомбарда', 'бамбардо'],
    ['эрсквейк', 'эртквейк', 'ерсквейк', 'эскейп'],
    ['вайнд', 'винд', 'уинд'],
    ['вайнд импульс', 'винд импульс', 'уинд импульс', 'вайнд импалс', 'импульс'],
    ['дравдаун', 'дродаун', 'драв даун', 'драудаун'],
    ['ликвидейшн', 'ликвидейшен', 'ликвидация'],
    ['стичинг', 'ститчинг', 'стиччинг'],
    ['инвизибл', 'инвизибилити', 'инвизибел'],
    ['овергроун', 'оверграун', 'овергрон'],
    ['лайтнинг страйк', 'лайтнин страйк', 'лайтинг страйк'],
    ['тотал дестракшн', 'тотал дестракшен'],
    ['сёркл аттак', 'серкл атак', 'серкл аттак', 'сёркл атак', 'сиркл аттак'],
    ['инспириус', 'инспирус', 'инспайриус', 'энспириус'],
    ['бум', 'бумм', 'буум'],
    ['гив ми май пауэр', 'гив ми май пауер', 'гиф ми май пауэр', 'верни мне мою силу'],
    ['лет зе хеллфаер кам', 'лет зе хелфайр кам', 'летс зе хеллфаер кам', 'лет зе хел фаер кам', 'хеллфаер кам', 'кам хеллфаер'],
    ['брейнрот', 'брейн рот'],
    ['алайв', 'элайв'],
    ['айс', 'лед'],
    ['сапира'],
    ['остолбеней'],
    ['экспеллиармус', 'экспелиармус'],
    ['дизармор', 'дисармор', 'дезармор'],
    ['сьют ап', 'сют ап', 'съют ап'],
    ['джолт', 'джоулт'],
    ['авада кедавра', 'авада кидавра'],
    ['максима'],
    ['протекшн', 'протекшен'],
    ['протекшн хаус', 'протекшен хаус'],
    ['протекшн хаус максима', 'протекшен хаус максима'], // (the same spell: its dome grows twice as fast)
    ['протекшн инвизибл', 'протекшен инвизибл'],
    ['протекшн хаус грант', 'протекшен хаус грант'],
    ['вотерболлоу', 'вотербол', 'ватербол'],
    ['вотер форминг', 'ватер форминг'],
    ['фрозен', 'фроузен'],
    ['вейв аттак', 'вейв атак', 'уэйв аттак'],
    ['вотер вортекс', 'ватер вортекс', 'уотер вортекс'],
    ['вотер вортекс супер максима', 'ватер вортекс супер максима'],
    ['файрфайтинг', 'фаер файтинг', 'файр файтинг'],
    ['файр максима', 'фаер максима'],
    ['криейт э борд', 'крейт э борд', 'серфборд'],
    ['эйр баббл', 'эйр бабл'],
    ['анферл', 'анфорл'],
    ['ферл', 'убери паруса'],
    ['ап', 'ап ап', 'стенд ап', 'стендап'],
    ['флайн'],
    ['паузин'],
    ['лет ит рейн'],
    ['ту зе сан'],
    ['акцио', 'аксио'],
    ['алохомора', 'алахамора'],
    ['лок', 'лок дор', 'лок зе дор'],
    ['атак', 'аттак'],
    ['рескью'],
    ['вингардиум левиоса', 'левиоса'],
    ['гэзер', 'гезер', 'ассембл'],
    ['криейт э флор', 'крейт э флор'],
    ['криейт э уолл', 'крейт э уолл'],
    ['криейт э силинг', 'крейт э силинг'],
    ['билд э руф'],
    ['криейт э дор', 'крейт э дор'],
    ['криейт э бед', 'создай кровать'],
    ['криейт э хаус', 'крейт э хаус', 'создай дом'],
    ['импрув э хаус', 'импрув хаус', 'улучши дом'],
    ['криейт э касл', 'крейт э касл', 'криейт э кастл', 'криэйт э касл', 'криейт касл', 'создай замок', 'построй замок'],
    ['криейт эн айс касл', 'криейт айс касл', 'айс касл', 'айс кастл', 'создай ледяной замок'],
    ['айс бридж', 'айс брижд', 'создай ледяной мост'],
    ['сноумен', 'сноумэн', 'снеговик'],
    ['криейт э плэнет', 'криейт э планет', 'создай планету'],
    ['энлардж плэнет', 'энлардж планет', 'увеличь планету'],
    ['плэнет ликвидэйшн', 'планет ликвидейшн', 'плэнет ликвидейшн', 'уничтожь планету'],
    ['терраформ плэнет', 'терраформ планет'],
    ['вингардиум левиоса супер максима', 'левиоса супер максима'],
    ['брейкфру', 'брейк фру'],
    ['файр', 'фаер', 'костер'],
    ['стенд'],
    ['стоп'],
    ['люмос'],
    ['нокс'],
    ['лайтнинг райтинг'],
    ['раскрой свои секреты', 'ревил'],
];

/** A phrase → the network's letters (ё is е there; anything else is left out). */
export function encode(phrase) {
    const out = [];
    for (const ch of String(phrase).toLowerCase().replace(/ё/g, 'е')) {
        const i = LETTERS.indexOf(ch);
        if (i >= 0) out.push(i);
    }
    return out;
}

const letters = (p) => p.replace(/\s+/g, '').length;

function build() {
    const list = [];
    const add = (canonical, ways) => {
        const spell = matchSpell(canonical);
        for (const w of ways) list.push({ spell, canonical, phrase: w, toks: encode(w), len: letters(w) });
    };
    for (const [canonical, ...more] of SAID) {
        const ways = [canonical, ...more];
        add(canonical, ways);
        // «… Максима»: when the matcher has that form of this spell
        const base = matchSpell(canonical);
        if (/максима/.test(canonical)) continue;
        const mx = matchSpell(`${canonical} максима`);
        if (mx && mx !== base && mx !== 'Maxima') add(`${canonical} максима`, ways.map((w) => `${w} максима`));
    }
    return list;
}
/** Every way of saying every spell: {spell, canonical, phrase, toks, len}. */
export const VOCAB = build();

/**
 * The ways of saying a spell that another spell goes on from: «протекшн» → «протекшн хаус» /
 * «… максима» / «… инвизибл», «бомбардо» → «бомбардо максима», «вайнд» → «вайнд импульс», «стенд» →
 * «стенд ап»… (found in VOCAB itself: every new spell and its «Максима» counts at once). Said alone,
 * such a phrase is a spell only after a moment of quiet: the rest of the longer one may be on its way.
 */
export const GOES_ON = new Set(VOCAB.filter((w) => VOCAB.some((l) => l.spell !== w.spell && l.phrase.startsWith(w.phrase + ' '))).map((w) => w.phrase));

// ------------------------------------------------------------------ the sound
/** The rows from voice_native.py (base64 of −log-probability×10 as bytes) → log-probabilities. */
export function unpack(b64, T) {
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const lp = new Float32Array(T * V);
    for (let i = 0; i < lp.length && i < bin.length; i++) lp[i] = -bin.charCodeAt(i) / 10;
    return lp;
}

/** The best letter of each 40 ms, its score, and the quiet ones (nothing new, or a space). */
export function prepare(lp, T) {
    const mx = new Float32Array(T), am = new Uint8Array(T), quiet = new Uint8Array(T);
    for (let t = 0; t < T; t++) {
        let best = -Infinity, arg = 0;
        for (let v = 0; v < V; v++) { const x = lp[t * V + v]; if (x > best) { best = x; arg = v; } }
        mx[t] = best; am[t] = arg; quiet[t] = arg === BLANK || arg === SPACE ? 1 : 0;
    }
    return { lp, T, mx, am, quiet };
}

/** The words as written: the best letter of each 40 ms, repeats and «nothing new» left out. */
export function greedy(P) {
    let s = '', prev = -1;
    for (let t = 0; t < P.T; t++) {
        const a = P.am[t];
        if (a !== BLANK && a !== prev) s += LETTERS[a];
        prev = a;
    }
    return s.replace(/\s+/g, ' ').trim();
}

/**
 * The best place of a phrase (its letters, «nothing new» allowed between them) in the sound: it
 * starts after a pause / a space (or at the very beginning, when that is where the speech began)
 * and ends before one (or at the very end, when the phrase is over). The cost of each 40 ms is how
 * much less likely the phrase's letter is than the best one heard there (0: it is the best).
 * A look at a phrase still being said is cut somewhere inside a word: then a spell neither begins in
 * its first EDGE×40 ms nor ends in its last (the network hears the cut as a pause) — «сундук» cut
 * to «…сунд» is no «Санд».
 * → {pen: total (≤ 0), a, b: its first and last 40 ms}
 */
export const EDGE = 4;
export function spot(P, toks, { openStart = true, openEnd = true } = {}) {
    const { lp, T, mx, quiet } = P;
    const N = toks.length, S = 2 * N + 1;
    const lab = new Int16Array(S), skip = new Uint8Array(S);
    for (let s = 0; s < S; s++) lab[s] = s & 1 ? toks[(s - 1) >> 1] : BLANK;
    for (let s = 2; s < S; s++) skip[s] = lab[s] !== BLANK && lab[s] !== lab[s - 2] ? 1 : 0;
    let dp = new Float64Array(S).fill(NEG), st = new Int32Array(S);
    let nd = new Float64Array(S), ns = new Int32Array(S);
    let pen = NEG, a = 0, b = 0;
    for (let t = 0; t < T; t++) {
        const enter = t === 0 ? openStart : quiet[t - 1] && (openStart || t >= EDGE);
        const row = t * V, top = mx[t];
        for (let s = 0; s < S; s++) {
            let v = dp[s], o = st[s];
            if (s > 0 && dp[s - 1] > v) { v = dp[s - 1]; o = st[s - 1]; }
            if (skip[s] && dp[s - 2] > v) { v = dp[s - 2]; o = st[s - 2]; }
            if (s < 2 && enter && v < 0) { v = 0; o = t; }
            nd[s] = v + (lp[row + lab[s]] - top);
            ns[s] = o;
        }
        let tmp = dp; dp = nd; nd = tmp;
        const ti = st; st = ns; ns = ti;
        if (t === T - 1 ? openEnd : quiet[t + 1] && (openEnd || t < T - 1 - EDGE)) {
            if (dp[S - 1] > pen) { pen = dp[S - 1]; a = st[S - 1]; b = t; }
            if (S > 1 && dp[S - 2] > pen) { pen = dp[S - 2]; a = st[S - 2]; b = t; }
        }
    }
    return { pen, a, b };
}

/** Longer phrases a little ahead: «Бомбардо Максима» over the «Бомбардо» inside it. */
export const BONUS = 0.15;

/** Every way of saying every spell, scored against the sound: [{w, avg (cost per letter, ≤ 0), score, a, b}]. */
export function scoreAll(P, vocab = VOCAB, open = {}) {
    const out = [];
    for (const w of vocab) {
        if (!w.toks.length) continue;
        const r = spot(P, w.toks, open);
        if (r.pen <= NEG / 2) continue;
        const avg = r.pen / w.toks.length;
        out.push({ w, avg, score: avg + BONUS * w.len, a: r.a, b: r.b });
    }
    return out;
}

const within = (long, short) => ` ${long} `.includes(` ${short} `);

/**
 * The spell that fits best: {spell, canonical, phrase, toks, avg, len, a, b} or null. A longer
 * phrase holding the best one («вайнд максима» round «максима», «лет зе хеллфаер кам» round «фаер»)
 * wins when it fits well enough itself: the short one was only its clearest part.
 */
export function bestSpell(P, far = 0, open = {}, vocab = VOCAB, snr = Infinity) {
    const all = scoreAll(P, vocab, open);
    let best = null;
    for (const c of all) if (!best || c.score > best.score) best = c;
    if (!best) return null;
    let up = null;
    for (const c of all) {
        if (c.w.len <= best.w.len || c.avg < threshold(c.w.len, far, snr)) continue;
        // (the longer phrase holds the best one's words — or, for a short word, at least its time:
        // «…э бед» heard as «лёд» is part of «Криейт э бед»)
        const holds = within(c.w.phrase, best.w.phrase) || (best.w.len <= 4 && c.w.len >= 2 * best.w.len && c.a <= best.a && c.b >= best.b);
        if (!holds) continue;
        if (!up || c.score > up.score) up = c;
    }
    const c = up || best;
    return { spell: c.w.spell, canonical: c.w.canonical, phrase: c.w.phrase, toks: c.w.toks, avg: c.avg, len: c.w.len, a: c.a, b: c.b };
}

/**
 * How well a spell must fit to count: short words need to fit very well («ап», «айс», «стоп» hide
 * inside many words); while the speakers play (a friend over Discord) a little better still.
 */
export function threshold(len, far = 0, snr = Infinity) {
    // (tuned on 2600 recordings: no everyday phrase or piece of one reached these; −0.2…−0.5 to spare)
    const base = len <= 3 ? -1.8 : len <= 5 ? -2.0 : len <= 8 ? -2.4 : -2.8;
    // (a voice barely above the noise — a loud sea, the wind, music — makes noise look like short words)
    const noisy = snr < 10 ? (len <= 5 ? 0.6 : 0.3) : snr < 16 ? (len <= 5 ? 0.3 : 0.15) : 0;
    return base + (far >= 0.25 ? (len <= 4 ? 0.5 : 0.3) : 0) + noisy;
}

/** A spell this well heard in the speakers' sound too came from the speakers (a friend, the game)… */
export const ECHO_FIT = -2.5;
/** …when the microphone heard it just after the speakers played it (s: the echo's way through the air
 * and the sound card, the speakers' sound given a little early) and about as long. Said at another
 * moment (both cast the same spell in a duel, a friend in headphones), it is mine. */
export const ECHO_AFTER = [-0.08, 0.45];
export const ECHO_LONGER = 0.3;

// (spells whose words go on: the written words carry what follows — «поменяй цвет на синий»)
export const WORDY = new Set(['ChangeColor']);

/** The spells this finds by their sound: for them the sound is the judge, never the written words. */
export const HEARD = new Set(VOCAB.map((w) => w.spell));

/**
 * A spell is said on its own («Бомбардо!», «так… Инферно»); something like a spell inside a sentence
 * («…к Мастеру, щиты!», «…огонь горит у ворот») is talk. Letters heard round the spell: up to ALONE —
 * as it fits; up to ALONE_MAX — only a clear one (ALONE_FIT better than needed); more — talk.
 * (Tested: of 400 spells said 399 have ≤ 2 letters round them, all ≤ 5; of 1900 everyday sentences 80
 * held something like a spell — all but the ones that really are a spell's words have more round it.)
 */
export const ALONE = 2;
export const ALONE_MAX = 5;
export const ALONE_FIT = 0.5;

/** The most words any way of saying that spell has (0: not one this knows). */
export function wordsOf(spell) {
    let n = 0;
    for (const w of VOCAB) if (w.spell === spell) n = Math.max(n, w.phrase.split(' ').length);
    return n;
}

/**
 * Letters heard outside a span of the sound (repeats and «nothing new» left out) — only those of the
 * same stretch of speech: past a pause of `pause` 40 ms steps they are another phrase (voice_native.py
 * ended a phrase after 0.42 s of quiet; it now waits longer for a «… Хаус», and a cough after a spell's
 * pause is still no sentence round it).
 */
export const PAUSE = 11;
export function lettersOutside(P, a, b, pause = Infinity) {
    let n = 0, prev = -1, quiet = 0, cut = false;
    // after the span
    for (let t = Math.max(0, b + 1); t < P.T && !cut; t++) {
        const v = P.am[t];
        if (v === BLANK || v === SPACE) { if (++quiet >= pause) cut = true; prev = v; continue; }
        quiet = 0;
        if (v !== prev) n++;
        prev = v;
    }
    // before it
    prev = -1; quiet = 0; cut = false;
    for (let t = Math.min(P.T, a) - 1; t >= 0 && !cut; t--) {
        const v = P.am[t];
        if (v === BLANK || v === SPACE) { if (++quiet >= pause) cut = true; prev = v; continue; }
        quiet = 0;
        if (v !== prev) n++;
        prev = v;
    }
    return n;
}

/**
 * What the microphone heard, made into what the game should hear.
 * @param {Float32Array} lp  the microphone's rows (after the echo was taken out)
 * @param {number} T
 * @param {{ref?: Float32Array, refT?: number, refLead?: number, far?: number, final?: boolean, cut?: boolean, snr?: number}} [o]
 *   ref/refT/far: the speakers' rows of the same time (starting refLead s earlier) and how much of it they played;
 *   final: the phrase is over (else a look at it while it is said); cut: the look starts inside it;
 *   snr: dB the voice stands above the background (noisy: short spells must fit better)
 * @returns {{text: string, written: string, spell: object|null, sure: boolean, echo: boolean}}
 *   text: the spell's own words when one was heard well enough, else the words as written;
 *   echo: that spell is in the speakers' sound too — a friend's voice (or the game's), not mine.
 */
export function hear(lp, T, o = {}) {
    const P = prepare(lp, T);
    const written = greedy(P);
    const far = o.far || 0;
    const snr = Number.isFinite(o.snr) ? o.snr : Infinity;
    const open = { openStart: !o.cut, openEnd: o.final !== false };
    const best = bestSpell(P, far, open, VOCAB, snr);
    const need = best ? threshold(best.len, far, snr) : 0;
    if (!best || best.avg < need) return { text: written, written, spell: null, sure: false, echo: false, far, best };
    // (a phrase still being said: the spell must be over — nothing heard after it. «Бомбардо…» may yet
    // be «Бомбардо Максима», «лет…» «Let the Hellfire come», «вин…» «Вингардиум»: the next look tells)
    if (o.final === false && lettersOutside(P, -1, best.b) > 0) return { text: written, written, spell: null, sure: false, echo: false, far, best, early: true };
    // (said inside a sentence: talk — ALONE)
    const extra = lettersOutside(P, best.a, best.b, PAUSE);
    if (!WORDY.has(best.spell) && (extra > ALONE_MAX || (extra > ALONE && best.avg - need < ALONE_FIT))) {
        return { text: written, written, spell: null, sure: false, echo: false, far, best, extra };
    }
    let echo = false;
    if (o.ref && o.refT) {
        const R = prepare(o.ref, o.refT);
        const r = spot(R, best.toks);
        if (r.pen / best.toks.length >= ECHO_FIT) {
            const lag = best.a * 0.04 - (r.a * 0.04 - (o.refLead || 0));
            const longer = Math.abs((best.b - best.a) - (r.b - r.a)) * 0.04;
            echo = !Number.isFinite(o.refLead) || (lag >= ECHO_AFTER[0] && lag <= ECHO_AFTER[1] && longer <= ECHO_LONGER);
        }
    }
    const text = WORDY.has(best.spell) ? written : best.canonical;
    // tail: ms heard after the spell (a look at a phrase still being said: nothing but quiet there)
    return { text, written, spell: best, sure: true, echo, far, extra, tail: (T - 1 - best.b) * 40 };
}
