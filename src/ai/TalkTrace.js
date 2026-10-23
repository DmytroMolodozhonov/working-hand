/**
 * TalkTrace.js — a stopwatch on every talk turn (the author: «жители медленно отвечают… нужен конкретный
 * бенчмарк»): when the player's speech really ended (by the sound, not the text), when the phrase was
 * heard (a look while still said / the final one), when the villager understood it (the rules / the net:
 * asked, its first word, its first sentence, done), when he did something (turned, the order carried
 * out), and when his voice was first heard (a ready line or a made one). One line per turn — «разговор: …» —
 * goes to the performance diary (zns-perf.log) and the journal; the means and the 95th percentiles
 * per kind of turn are kept for the 5 s line and for tools/talkbench.mjs.
 *
 * Pure (no DOM): the clock and the sink are given.
 *   const tr = trace.begin('в атаку', { end: tSpeechEnd, kind: 'order' });
 *   trace.mark(tr, 'heard'); … trace.mark(tr, 'voice'); trace.done(tr);
 */

/** What each mark means (in the line, in this order). */
export const MARKS = [
    ['heard', 'услышал'],      // the page has the words (a look while still said — or the final)
    ['rules', 'понял'],        // the rules' answer (or the order) is known
    ['act', 'действие'],       // he does something: turned to me / the order is carried out
    ['ack', 'отклик'],         // the first sound of him (a ready «Слушаюсь!» / «Хм…», or the answer itself)
    ['net', 'сеть'],           // the net was asked
    ['tok', '1-е слово сети'], // its first word
    ['sent', '1-я фраза'],     // its first sentence is handed to the voice
    ['voice', 'ответ слышен'], // the answer's first word is heard
    ['done', 'сеть готова'],   // the net's whole answer
];

/** Turn kinds: an order, a crew order, a talk (rules), a talk the net answers. */
export const KINDS = ['order', 'crew', 'talk', 'net'];

const KEEP = 60; // turns kept per kind (for the means and p95)

/** The q-quantile (0..1) of numbers (null for none). */
export function quantile(xs, q) {
    const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
    if (!a.length) return null;
    return a[Math.min(a.length - 1, Math.max(0, Math.ceil(q * a.length) - 1))];
}

export class TalkTrace {
    /**
     * @param {{now?:Function, sink?:Function|null}} [opts] sink(line): where the «разговор» lines go
     */
    constructor({ now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), sink = null } = {}) {
        this.now = now;
        this.sink = sink;
        this.turns = new Map(); // kind -> [{end-relative ms of each mark}] (capped)
        this.lines = []; // the last lines (capped)
        this.current = null;
    }

    /**
     * A turn starts (the words reached the talk). `end`: page time the speech itself ended (null: unknown —
     * then the time the words came is the start). The turn before it, if open, is closed.
     */
    begin(text, { end = null, kind = 'talk', who = '', heard = null, how = '' } = {}) {
        if (this.current) this.done(this.current);
        const t = this.now();
        const tr = { text: String(text || '').slice(0, 60), kind, who, how, t0: Number.isFinite(end) && end <= t ? end : t, known: Number.isFinite(end) && end <= t, at: {} };
        tr.at.heard = Number.isFinite(heard) ? heard : t;
        this.current = tr;
        return tr;
    }

    /** A moment of the turn (the first time it happens counts). */
    mark(tr, name, at = this.now()) {
        if (!tr || tr.closed || tr.at[name] != null) return;
        tr.at[name] = at;
    }

    /** The kind turns out other than guessed (the net is asked after all). */
    kind(tr, kind) { if (tr && !tr.closed) tr.kind = kind; }

    /** ms from the speech's end to a mark (null: did not happen). */
    ms(tr, name) { return tr?.at[name] != null ? Math.round(tr.at[name] - tr.t0) : null; }

    /** The turn is over: its line, its numbers kept. */
    done(tr) {
        if (!tr || tr.closed) return null;
        tr.closed = true;
        if (this.current === tr) this.current = null;
        const row = {};
        for (const [k] of MARKS) row[k] = this.ms(tr, k);
        const list = this.turns.get(tr.kind) || [];
        list.push(row);
        if (list.length > KEEP) list.shift();
        this.turns.set(tr.kind, list);
        const KIND_RU = { order: 'приказ', crew: 'приказ экипажу', talk: 'разговор (правила)', net: 'разговор (нейросеть)' };
        const parts = MARKS.filter(([k]) => row[k] != null).map(([k, ru]) => `${ru} ${row[k]}`);
        const line = `разговор: «${tr.text}»${tr.who ? ` → ${tr.who}` : ''} [${KIND_RU[tr.kind] || tr.kind}]${tr.how ? ` {${tr.how}}` : ''} мс после конца речи${tr.known ? '' : ' (≈ от прихода слов)'}: ${parts.join(', ')}`;
        this.lines.push(line);
        if (this.lines.length > 40) this.lines.shift();
        try { this.sink?.(line); } catch (_) { /* the diary never breaks a talk */ }
        return line;
    }

    /** Means and p95 per kind, of a mark: {order: {n, mean, p95}, …}. */
    stats(name = 'ack') {
        const out = {};
        for (const [kind, rows] of this.turns) {
            const xs = rows.map((r) => r[name]).filter(Number.isFinite);
            if (!xs.length) continue;
            out[kind] = { n: xs.length, mean: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), p95: quantile(xs, 0.95) };
        }
        return out;
    }
}
