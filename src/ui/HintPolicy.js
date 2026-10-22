/**
 * HintPolicy.js — the setting «Подсказки» (the author: «если подсказка вылезла хотя бы один раз,
 * смысл её показывать дальше нету»):
 *   'once'   (default) every hint is shown once, then never again — remembered in this browser, for all worlds;
 *   'always' as before;
 *   'off'    no hints at all.
 *
 * Only the «how to do it» hints are held back («Поднимите руку…», «Скажите «…»», «Направьте…» — a line
 * that tells the player what to do). What happened is always shown: damage, death, an achievement,
 * a warning («Горячо!», the guards, a planet about to blow), «Не хватает маны», a spell's own result.
 */

export const HINT_MODES = ['once', 'always', 'off'];
const KEY = 'zns-hints-seen';
const MAX_SEEN = 800; // (the remembered hints: the oldest go when there are more)

const plain = (html) => String(html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// a word telling the player what to do: «поднимите», «направьте», «скажите», «присядьте», «встаньте»…
const IMPERATIVE = /(?:^|[^А-Яа-яЁё])[А-Яа-яЁё]{2,}(?:ите|ьте|йте)(?:сь)?(?![А-Яа-яЁё])/;
// what happened / a danger: never a hint, whatever its words
const NEWS = /−\s?\d|\bHP\b|ещё не знаете|еще не знаете|откроется, когда|ачивк|погиб|умер|убил|смерт|взорв|Стража|заметил|Горячо|опасн|ДУЭЛЬ|Не хватает маны|горит!|Укус|кровь|Молния в ваших руках|крикнул/i;

/** Is this line a «how to do it» hint (and not news, a warning or a result)? */
export function isHowTo(html) {
    const t = plain(html);
    if (!t || t.includes('ЖДУ КОМАНДУ')) return false;
    if (NEWS.test(t)) return false;
    return IMPERATIVE.test(t);
}

/** The same hint whatever its numbers («нужно 15» / «нужно 25») — one key. */
export function hintKey(html) {
    return plain(html).replace(/\d+([.,]\d+)?/g, '#').slice(0, 140);
}

export class HintPolicy {
    constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
        this.storage = storage;
        this.mode = 'once';
        this._seen = null; // (read from the browser when first needed)
    }

    setMode(m) { if (HINT_MODES.includes(m)) this.mode = m; }

    _load() {
        if (this._seen) return this._seen;
        let list = [];
        try { list = JSON.parse(this.storage?.getItem(KEY) || '[]') || []; } catch (e) { list = []; }
        this._seen = new Set(Array.isArray(list) ? list : []);
        return this._seen;
    }

    _save() {
        try { this.storage?.setItem(KEY, JSON.stringify([...this._seen])); } catch (e) { /* private mode: only for this game */ }
    }

    /** May this line be shown now? A hint shown in «once» mode is remembered. Not a hint → always. */
    allow(html) {
        if (this.mode === 'always' || !isHowTo(html)) return true;
        if (this.mode === 'off') return false;
        const seen = this._load(), k = hintKey(html);
        if (seen.has(k)) return false;
        seen.add(k);
        if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value);
        this._save();
        return true;
    }

    /** Forget the hints shown (they come again once each). */
    reset() { this._seen = new Set(); this._save(); }
}

/** The game's one policy (the setting «Подсказки» sets its mode). */
export const hintPolicy = new HintPolicy();
