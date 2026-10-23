/**
 * TalkFlow.js — WHEN a villager answers (the author: «отвечать МОМЕНТАЛЬНО… как человек»).
 *
 * People answer ~200 ms after the other stops (Levinson & Torreira 2015, Stivers et al. 2009): they
 * know the phrase is over before the silence is long. The speech program (voice_native.py) closes a
 * phrase only after 0.85 s of quiet — it must: a «… Хаус» or a «… Максима» may still come after a spell.
 * Words to a villager need not wait for that: the program looks at the phrase as soon as the speaker goes
 * quiet and says how long the quiet already is (`q`), and the levels it sends 20 times a second say how
 * long it is now. Here the words are handed to the villagers as soon as they are surely over:
 *
 *   - a clear order («в атаку», «отбой», «собери войско», «поднять паруса», «стой») — after 0.12 s of quiet:
 *     nothing that follows an order changes it (and if a new order follows, it is carried out instead);
 *   - a finished phrase («как пройти к залу») — after 0.25 s;
 *   - a phrase hanging on «и», «но», «что», «э-э», a preposition — after 0.6 s (the speaker is thinking);
 *   - the program's own end of the phrase — always.
 *
 * The same words heard later as the phrase's end are no second question (the caller compares `seg`).
 * Pure (no DOM): tools/talkbench.mjs and tests drive it with their own clock.
 */

import { normalize } from '../game/VillagerBrain.js';
import { detectOrder } from './TalkActions.js';

/** s of quiet before the words are answered: an order, a finished phrase, a phrase left hanging. */
export const QUIET = { order: 0.12, talk: 0.25, open: 0.6 };
/** s of quiet more for an order read only while the words were said (two looks the same): TalkFlow.offer. */
export const STABLE_MORE = 0.05;
/** The browser's own recognizer (no quiet known): ms the words must stay the same. */
export const STILL = { order: 250, talk: 450, open: 800 };

const L = '(?<![а-яa-z0-9])';
const R = '(?![а-яa-z0-9])';

/** Orders to a ship's crew (the sailors' own words). */
const CREW = [
    ['sails', new RegExp(`${L}(поднять|поднимай(те)?|ставь(те)?|ставить|поставить|убрать|убери(те)?|спустить|спусти(те)?|свернуть|рифы) (\\S+ )?парус|${L}паруса? (поднять|ставить|убрать|спустить)|${L}полный (ход|вперед)|${L}малый ход`)],
    ['helm', new RegExp(`${L}(право|лево) (на )?борт|${L}(право|лево) руля|${L}поворот (направо|налево|оверштаг)|${L}к ветру${R}|${L}лечь на курс|${L}(разворачивай|поворачивай)(те)?`)],
    ['cannons', new RegExp(`${L}(пушки|орудия|канонир\\S*) (к бою|заряжай|готовь)|${L}(заряжай|заряжайте)${R}|${L}к орудиям${R}|${L}к пушкам${R}`)],
    ['fire', new RegExp(`${L}(огонь|пли|залп)${R}|${L}огонь (из|по) |${L}стреляй(те)?${R}|${L}пали(те)?${R}`)],
    ['board', new RegExp(`${L}на абордаж|${L}абордаж${R}|${L}(крючья|кошки) (за|на) борт`)],
    ['retreat', new RegExp(`${L}(отбой|отставить|прекратить огонь|не стрелять|уходим|отходим|отступаем)${R}`)],
];

/** A crew order in these words (or null). */
export function crewOrder(text) {
    const t = normalize(text);
    if (!t) return null;
    for (const [name, re] of CREW) if (re.test(t)) return name;
    return null;
}

/** «стой», «за мной», «ко мне» — short orders to one villager (VillagerBrain follow / stop_follow). */
const SHORT = new RegExp(`^(\\S+ )?(стой|стоп|стоять|замри|за мной|ко мне|иди(те)? за мной|пошли|идем|идём|вперед|вперёд|назад|беги(те)?|бежим|спасайся|спасайтесь|прикрой(те)? меня|защищай(те)? меня|охраняй(те)? меня)${R}`);

/** An order and what it is about («attack:spider») — a new target after an early answer is a new order. */
export function orderKey(text, players = []) {
    const t = normalize(text);
    const o = t && detectOrder(t, players);
    if (o) return o.name + (o.args?.target ? ':' + o.args.target : '') + (o.args?.all ? ':all' : '');
    return quickOrder(t, players);
}

/** A clear order: something to DO at once, whatever words may follow. */
export function quickOrder(text, players = []) {
    const t = normalize(text);
    if (!t) return null;
    const o = detectOrder(t, players);
    if (o) return o.name;
    const c = crewOrder(t);
    if (c) return 'crew:' + c;
    if (t.split(' ').length <= 4 && SHORT.test(t)) return 'short';
    return null;
}

/** Words a phrase does not end on: the speaker means to go on (a conjunction, a preposition, «э-э»). */
const OPEN_END = new Set(('и а но или что чтобы это вот ну э ээ эээ эм мм хм как когда если потому так то '
    + 'в во на к ко у с со за из от до по о об про для при над под без через между перед около возле мне я ты мой твой '
    + 'который которая которые где куда почему зачем а еще ещё самое типа короче').split(' '));

/** Words that open a phrase: a call, «расскажи», «слушай» — said alone, the rest is still to come. */
const OPENERS = new Set(('расскажи скажи скажите слушай послушай слушайте знаешь смотри эй слышь кстати погоди подожди извини простите '
    + 'рыцарь рыцари стражник стража капитан боцман матрос матросы моряки ребята братцы братва друг дружище торговец '
    + 'король советник волшебник маг мастер дед бабушка добрый человек путник ну так вот а').split(' '));

/** Is the phrase left hanging (its last word can't end it — or it is only a call, «рыцарь…», «расскажи…»)? */
export function openEnd(text) {
    const w = normalize(text).split(' ').filter(Boolean);
    if (!w.length) return true;
    const last = w[w.length - 1];
    if (w.length <= 2 && w.every((x) => OPENERS.has(x))) return true;
    return OPEN_END.has(last) || /^э+$|^м+$/.test(last);
}

/** How ready the words are to be answered: 'order' | 'talk' | 'open'. */
export function readiness(text, players = []) {
    if (quickOrder(text, players)) return 'order';
    return openEnd(text) ? 'open' : 'talk';
}

/**
 * The words being said, and the quiet after them → the moment they are answered.
 *   const flow = new TalkFlow({ fire: (text, info) => … });
 *   flow.offer(text, { seg, q, end });   // a look at the phrase (q: s of quiet at its end)
 *   flow.quiet(q);                       // the levels: s of quiet now (−1: no phrase open)
 *   flow.final(text, seg)                // the program's end of the phrase → 'handled' | 'new' | 'changed'
 */
export class TalkFlow {
    constructor({ fire = null, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), players = () => [] } = {}) {
        this.fire = fire;
        this.now = now;
        this.players = players;
        this.pending = null; // {text, seg, kind, end, at, q}
        this.fired = null; // {seg, text, order, at}
    }

    /** A look at the phrase still being said. */
    offer(text, { seg = null, q = 0, end = null } = {}) {
        if (!text) return;
        const kind = readiness(text, this.players());
        // (the same phrase answered already: only a different order changes anything — «в атаку… нет, отбой»)
        const ok = orderKey(text, this.players());
        if (this.fired && this.fired.seg === seg && seg != null) {
            if (!ok || ok === this.fired.order || normalize(text) === this.fired.key) return;
        }
        // (an order read the same by two looks in a row, while the words were still being said: its last
        // syllables can't change what it is — it may go as soon as the speaker is quiet, without the look at the
        // quiet's edge, ~0.15 s sooner; a different target after it is a new order — `final` → 'changed')
        const stable = kind === 'order' && !!ok && this.last?.seg === seg && seg != null && this.last.order === ok;
        this.last = { seg, order: ok };
        this.pending = { text, seg, kind, end, at: this.now(), q: Number(q) || 0, stable };
        this._check(this.pending.q);
    }

    /** The quiet now (from the levels): the pending words may be due. */
    quiet(q) {
        if (!this.pending) return;
        if (q < 0) return; // (the phrase closed: its end comes as `final`)
        // (the speaker speaks again: the words go on — the next look brings them)
        if (q === 0) { this.pending.q = 0; return; } // (its words are not the whole phrase any more)
        this._check(q);
    }

    /** No levels (the browser's recognizer): the words stood still this long (ms). */
    still(ms) {
        if (!this.pending) return;
        if (ms >= STILL[this.pending.kind]) this._fire(this.pending, 'still');
    }

    _check(q) {
        const p = this.pending;
        // (only words read from a look made after the speaker went quiet: a look made while he still spoke may
        // lack the last words — «расскажи почему король не любит» for «… волшебников из башни»)
        if (p && p.q > 0 && q >= QUIET[p.kind]) this._fire(p, 'quiet');
        else if (p && p.stable && q >= QUIET.order + STABLE_MORE) this._fire(p, 'stable');
    }

    _fire(p, why) {
        this.pending = null;
        const order = orderKey(p.text, this.players());
        this.fired = { seg: p.seg, text: p.text, key: normalize(p.text), order, at: this.now() };
        try { this.fire?.(p.text, { seg: p.seg, end: p.end, kind: p.kind, why, early: true }); } catch (e) { console.warn('[TalkFlow]', e); }
    }

    /**
     * The phrase's end from the program: 'handled' (answered early, nothing new — say nothing again),
     * 'changed' (a different order after the early one, or more words: answer it), 'new' (not answered yet).
     */
    final(text, seg = null) {
        if (this.pending && (this.pending.seg === seg || seg == null)) this.pending = null;
        const f = this.fired;
        if (!f || (seg != null && f.seg !== seg) || this.now() - f.at > 8000) return 'new';
        this.fired = null;
        const k = normalize(text);
        if (k === f.key || f.key.startsWith(k)) return 'handled';
        const o = orderKey(text, this.players());
        if (f.order) return o && o !== f.order ? 'changed' : 'handled'; // (an order's tail words change nothing — but another order / target does)
        // (a talk phrase: the same words a little differently written — answered; more words — a new question)
        const fw = new Set(f.key.split(' '));
        const kw = k.split(' ');
        const same = kw.filter((w) => fw.has(w)).length;
        return kw.length <= f.key.split(' ').length + 1 && same >= kw.length * 0.6 ? 'handled' : 'changed';
    }
}
