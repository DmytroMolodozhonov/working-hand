/**
 * CastHints.js — advice about a spell («поднимите руку…», «скажите «…»») only to a player who is
 * really casting, never to one who is just talking (the author: «я просто сам с собой разговаривал,
 * а мне постоянно кидались подсказки»).
 *
 * A phrase from the microphone is a real attempt when it is finished (not an interim version), short
 * (the spell is the phrase, not one word among many) and either shows the intent (a hand / wand raised,
 * both arms up, a T-pose) or is the same spell said a second time in a row. Talking to a villager with
 * the hands down is talk. Advice for anything else goes to the journal, not to the screen; the same
 * advice is not shown again for HINT_REPEAT_MS.
 */

export const FOCUSED_WORDS = 6;      // a phrase this long at most can be a spell's words («Вингардиум Левиоса Супер Максима»)
export const REPEAT_MS = 15000;      // the same spell again within this: «I meant it»
export const HINT_REPEAT_MS = 25000; // the same advice at most once in this long

/** How many words a phrase has. */
export function wordCount(text) {
    return String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
}

export class CastHints {
    constructor(now = () => performance.now()) {
        this.now = now;
        this._last = null;          // { name, at } — the last finished phrase that named a spell
        this._shown = new Map();    // advice → when it was shown (pruned)
    }

    /**
     * A phrase was heard. @returns {{ok: boolean, why: string}} may advice about it be shown
     * @param {{text: string, name: string|null, isFinal: boolean, intent: boolean, talking: boolean}} p
     */
    phrase({ text, name, isFinal, intent, talking }) {
        if (!isFinal) return { ok: false, why: 'фраза ещё не закончена' };
        const t = this.now();
        const key = name || String(text ?? '').trim().toLowerCase();
        const repeat = !!this._last && this._last.name === key && t - this._last.at < REPEAT_MS;
        this._last = { name: key, at: t };
        if (wordCount(text) > FOCUSED_WORDS) return { ok: false, why: 'длинная фраза — обычная речь' };
        if (talking && !intent) return { ok: false, why: 'разговор с жителем' };
        if (!intent && !repeat) return { ok: false, why: 'нет жеста и не повтор' };
        return { ok: true, why: '' };
    }

    /** This advice may be shown now (and is remembered as shown). */
    pass(html) {
        const t = this.now();
        const last = this._shown.get(html);
        if (last != null && t - last < HINT_REPEAT_MS) return false;
        this._shown.set(html, t);
        if (this._shown.size > 64) for (const [k, at] of this._shown) if (t - at >= HINT_REPEAT_MS) this._shown.delete(k);
        return true;
    }
}
