/**
 * NativeVoice.js — the voice heard by voice_native.py (the speech network on this computer).
 *
 * server.py streams what voice_native.py heard (/api/voice/stream): for every phrase — while it is
 * said and when it is over — the network's letters, after the echo of the speakers (a friend over
 * Discord, the game's own voices) was taken out of the microphone; and the speakers' own letters of
 * the same time. Here SpellSpotter finds the spell in them, and the result goes on exactly as the
 * browser's recognizer gave it before: onResult(text, isFinal, meta).
 *
 *   meta.native  true (this way, not the browser's)
 *   meta.aec     the speakers' sound is taken out of the microphone (Windows: «loopback»)
 *   meta.echo    the spell is in the speakers' sound too: a friend's voice, not mine — never cast
 *   meta.far     share of the phrase while the speakers played
 *
 * A spell is cast from a phrase still being said (fast) only when two looks in a row heard it (or
 * one heard it very clearly), and never right at the cut edge of the look (SpellSpotter.EDGE).
 */

import { unpack, hear, threshold, HEARD, WORDY, GOES_ON, goesOnKnown } from '../audio/SpellSpotter.js';
import { matchSpell } from '../fx/SpellManager.js';
import { spellPhrase } from '../audio/SpellPhrase.js';
import { soundingLine } from '../audio/GameVoices.js';

/** A spell this clear is cast from one look at the phrase (avg cost per letter)… */
export const SURE_AT_ONCE = -0.6;
/** …if it is long enough: a short one («гром», «вайнд») hides in the start of a longer word still being said. */
export const AT_ONCE_LEN = 6;
/** …or when the speaker has clearly stopped after it (ms of quiet heard after the spell): a short one… */
export const QUIET_AT_ONCE = 280;
/** …a long one sooner (it hides in no longer word: «Ликвидейшн Максима», «Экспеллиармус» — in a fight every ms counts). */
export const QUIET_AT_ONCE_LONG = 160;
/**
 * A spell another one goes on from («Protection» → «Protection House», «Бомбардо» → «… Максима»: GOES_ON)
 * is cast only after this much quiet after it (ms) — or at the phrase's end: the time a «Хаус» or a
 * «Максима» needs to begin. The longer one is cast as soon as it is heard; spells nothing goes on
 * from never wait. (voice_native.py keeps a phrase open a little longer than this: SEG «end».)
 */
export const MORE_WAIT = 400; // (was 700: the author felt the wait in a fight; the «Хаус» / «Максима» of one breath comes sooner)

/** Another spell in a phrase that already cast one must fit this much better than needed (the explosion's noise, a tail). */
export const AFTER_FIT = 0.6;

/** Is one spell's words a piece of the other's («бомбардо» of «бомбардо максима»)? */
export function partOf(a, b) {
    const x = ` ${String(a || '')} `, y = ` ${String(b || '')} `;
    return x.includes(y) || y.includes(x);
}

/**
 * What one look at a phrase gives the game (pure: tests).
 * @param {object} d  the event from voice_native.py ({id, final, T, lp, ref?, refT?, far, cut?})
 * @param {{last?: string, fired?: string}} seg  what the earlier looks at the same phrase found
 * @returns {{say: null|{text, isFinal}, echo: null|string, heard, seg}}
 *   say: what to hand on now (null: nothing yet); echo: a spell heard only as the speakers' echo
 */
/** A written spell this long (letters) may cast by its words when the sound leans to it (WORDS_FIT). */
export const WORDS_LEN = 8;
export const WORDS_FIT = -0.8;

/** The written words are one long spell nothing goes on from, and the sound found that spell nearly well enough. */
function wordsSpell(h, d) {
    const ph = spellPhrase(h.written, { final: true });
    const way = ph.ok && ph.close === 'said' ? ph.said : null;
    if (!way || way.l.length < WORDS_LEN || GOES_ON.has(way.phrase)) return null;
    const b = h.best;
    if (!b || b.spell !== ph.name) return null;
    const fit = b.avg - threshold(b.len, d.far || 0, Number.isFinite(d.snr) ? d.snr : Infinity);
    return fit >= WORDS_FIT ? { canonical: way.canonical, fit } : null;
}

/**
 * The duel's one-word spells (the author: «дуэльные заклинания всегда однословные… миллисекунды решают»): no wait
 * for a «… Максима» (that is said on its own once the duel is on), cast at the first look that has them clear and
 * just a moment (160 ms) of quiet after. «Айс» and «Даст» only while a duel is on or a charge flies at me (outside
 * a duel «Айс Максима» is a spell of its own); «Джолт Максима» grows from a «Джолт» already flying (Game._joltUpgrade).
 */
export const DUEL_FAST = new Set(['Jolt', 'Sapira', 'Stupefy', 'AvadaKedavra', 'Expelliarmus', 'Disarmor']);
export const DUEL_HOT_FAST = new Set(['Ice', 'Sands']);
export const DUEL_FIT = 0.5;
/** ms of quiet after a duel one-word spell that is enough to cast it (the author: the slow cast loses the clash 20:80). */
export const DUEL_QUIET = 80;
const duelFast = (spell, d) => DUEL_FAST.has(spell) || (!!d.duel && DUEL_HOT_FAST.has(spell));
const fitOf = (h, d) => h.spell.avg - threshold(h.spell.len, d.far || 0, Number.isFinite(d.snr) ? d.snr : Infinity);

/** How much better than needed a spell must fit to cast while the game's voices play, before the phrase's end. */
export const GAME_CLEAR = 0.6;
const gameClear = (h, d) => !!d.game && h.spell.len >= 4 && h.spell.avg - threshold(h.spell.len, d.far || 0, Number.isFinite(d.snr) ? d.snr : Infinity) >= GAME_CLEAR;

export function lookAt(d, seg = {}) {
    const lp = unpack(d.lp, d.T);
    const ref = d.ref ? unpack(d.ref, d.refT) : null;
    const h = hear(lp, d.T, { ref, refT: d.refT, refLead: d.refLead, far: d.far || 0, final: !!d.final, cut: !!d.cut, snr: d.snr });
    const next = { ...seg };
    let say = null, echo = null;
    if (h.sure && h.echo) {
        echo = h.spell.canonical;
    } else if (h.sure) {
        const name = h.spell.canonical;
        if (d.final) {
            // (already cast as settled from this phrase: its end is no second word — nor a piece of it heard
            // again: «Бомбардо Максима» cast, its end read as «Бомбардо», is no second «Бомбардо»; another
            // spell after it in the same phrase — the explosion, the echo — only when heard clearly: AFTER_FIT)
            const again = next.fired && (next.fired === name ? next.settled : partOf(next.fired, name) || (h.spell.avg - threshold(h.spell.len, d.far || 0, Number.isFinite(d.snr) ? d.snr : Infinity) < AFTER_FIT));
            if (!again) say = { text: h.text, isFinal: true };
            if (!next.fired || !again) next.fired = name;
        } else if ((next.last === name || (h.spell.avg >= SURE_AT_ONCE && h.spell.len >= AT_ONCE_LEN) || h.tail >= (h.spell.len >= AT_ONCE_LEN ? QUIET_AT_ONCE_LONG : QUIET_AT_ONCE)
            || (duelFast(h.spell.spell, d) && h.tail >= DUEL_QUIET && fitOf(h, d) >= DUEL_FIT)) && ((d.far || 0) < 0.25 || d.ref || gameClear(h, d))) {
            // (while the speakers play, only a look that has their sound too may cast: it can tell an echo —
            // or, when what plays is the game's own voices (it knows their words: GameVoices) and the spell is
            // clear: at the wizards' tower the spell waited for the phrase's end, 2–3 s, behind their talk)
            // (a longer spell only the hero knows is worth the wait: none known — cast now)
            if (goesOnKnown(h.spell.phrase, d.knows) && !(h.tail >= MORE_WAIT) && !duelFast(h.spell.spell, d)) {
                // «Protection…»: «Хаус» may yet come — the game waits (only an answer under fire can't: more)
                if (next.fired !== name && next.more !== name) { say = { text: h.text, isFinal: false, more: true }; next.more = name; }
            } else if (next.fired !== name) {
                // settled: nothing can follow that would make it another spell — as good as the phrase's end
                say = { text: h.text, isFinal: false, settled: true };
                next.fired = name;
                next.settled = true;
            }
        }
        next.last = name;
    } else {
        next.last = null;
        // the words as written: talk to a villager (and a spell only the written words show — not
        // while the speakers play: there the written words may be the friend's)
        const loose = matchSpell(h.written);
        // (while the speakers play, a faint phrase is what the echo canceller left of them: not words of mine)
        const faint = (d.far || 0) >= 0.25 && Number.isFinite(d.peak) && Number.isFinite(d.floor) && d.peak < d.floor + ((d.far || 0) >= 0.5 ? 22 : 15);
        // (and a look at a phrase still being said while the speakers play: its end will tell)
        const early = !d.final && (d.far || 0) >= 0.25;
        // a spell the sound knows but did not find there — only its word written in a sentence («…огонь
        // горит у ворот»): words to a villager, never that spell (the sound is the judge: the written words
        // found 1 of my spells in 100 it missed, and a spell in 127 of 1900 everyday sentences)
        const talkOnly = !!loose && HEARD.has(loose) && !WORDY.has(loose);
        // …unless the written words ARE a long spell, nothing can follow it, and the sound leans to that same
        // spell — only a word or two round it («так теперь вайнд максима»), or not sure enough to cast it at once:
        // «ликвидейшн максима», «раскрой свои секреты», «авада кедавра» cast now, not at the phrase's end
        const byWords = talkOnly && !faint && !early ? wordsSpell(h, d) : null;
        if (byWords) {
            if (next.fired !== byWords.canonical) {
                say = { text: byWords.canonical, isFinal: !!d.final, settled: !d.final, byWords: true };
                next.fired = byWords.canonical;
                next.settled = true;
            }
        } else if (h.written && !faint && !early && (!loose || talkOnly || (d.final && (d.far || 0) < 0.25))) say = { text: h.written, isFinal: !!d.final, talkOnly };
    }
    return { say, echo, heard: h, seg: next };
}

export class NativeVoice {
    constructor() {
        this.status = null;
        this.es = null;
        this.onResult = null; // (text, isFinal, meta)
        this.onLevel = null;  // ({t, db, raw, far}) the microphone's level (after the echo was taken out)
        this.onEcho = null;   // (spell words) a spell heard only from the speakers
        this.onFail = null;   // () the native voice stopped working (the browser's takes over)
        this.onMiss = null;   // (written, meta) a finished phrase that gave the game nothing (the spell journal)
        this.onQuiet = null;  // (s) the quiet after the words of the open phrase now (−1: none open) — TalkFlow
        this.knows = null;    // (spell) → does the hero know it (the game sets it: a longer spell nobody knows is not waited for)
        this.segs = new Map();
        this.errors = 0;
        this.mic = ''; // the microphone chosen in the settings ('' — the system's default)
        this.off = null; // the voice program's clock (ms) → the page's (performance.now()): + off
    }

    /**
     * The two clocks: a message comes a little after the sound it tells of, never before — so the
     * smallest «page time − its time» seen is the difference (let up slowly: the clocks drift a little;
     * at once when the voice program started again and its clock with it).
     */
    _clock(t) {
        if (!Number.isFinite(t)) return;
        const off = performance.now() - t;
        this.off = this.off == null || off - this.off > 5000 ? off : Math.min(this.off + 0.5, off);
    }

    /** When (page time, ms) the heard spell — or else the whole phrase — was said. */
    _when(d, h) {
        if (this.off == null || !Number.isFinite(d.t0)) return {};
        const a = h.spell ? d.t0 + h.spell.a * 40 : d.t0;
        const b = h.spell ? d.t0 + (h.spell.b + 1) * 40 : d.t1;
        // (the program's clock tells when a sound was heard; its messages come ~0.1 s later still)
        return { from: a + this.off - 200, to: b + this.off };
    }

    /** The microphones voice_native.py can listen to → {devices: [{key, name, default}], current, wanted, fallback} */
    async devices() {
        try {
            const r = await fetch('/api/voice/devices', { cache: 'no-store' });
            return r.ok ? await r.json() : null;
        } catch (e) {
            return null;
        }
    }

    /** Listen to this microphone ('' / 'default' — the system's): taken at once, no restart of the game. */
    async setMic(key) {
        this.mic = !key || key === 'default' ? '' : String(key);
        try {
            const r = await fetch('/api/voice/mic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: this.mic }) });
            if (r.ok) this.status = { ...(this.status || {}), ...(await r.json()) };
        } catch (e) { /* the voice program isn't there: the browser listens */ }
    }

    /** Is the native voice there (installed, the network downloaded)? → the status from server.py */
    async check() {
        try {
            const r = await fetch('/api/voice/status', { cache: 'no-store' });
            this.status = r.ok ? await r.json() : null;
        } catch (e) {
            this.status = null;
        }
        return this.status;
    }

    get available() { return !!this.status?.available; }
    get running() { return !!this.es; }

    start() {
        if (this.es || typeof EventSource === 'undefined') return;
        this.errors = 0;
        const es = new EventSource('/api/voice/stream' + (this.mic ? '?mic=' + encodeURIComponent(this.mic) : ''));
        this.es = es;
        es.onmessage = (e) => {
            this.errors = 0;
            let d;
            try { d = JSON.parse(e.data); } catch (err) { return; }
            this._event(d);
        };
        es.addEventListener('fail', (e) => {
            try { this.status = { ...(this.status || {}), ...JSON.parse(e.data), state: 'error' }; } catch (err) { /* ignore */ }
            this.stop();
            this.onFail?.();
        });
        es.onerror = () => {
            // (the server restarts, the window sleeps…: EventSource tries again by itself; give up after a while)
            if (++this.errors > 8) { this.stop(); this.onFail?.(); }
        };
    }

    stop() {
        if (this.es) { try { this.es.close(); } catch (e) { /* ignore */ } }
        this.es = null;
        this.segs.clear();
    }

    _event(d) {
        if (d.type === 'status') { this.status = { ...(this.status || {}), ...d }; if (d.state === 'error') { this.stop(); this.onFail?.(); } return; }
        if (d.type === 'lv') { this._clock(d.t); this.onLevel?.(d); if (Number.isFinite(d.q)) this.onQuiet?.(d.q); return; }
        if (d.type !== 'seg') return;
        this._clock(d.t1);
        // (the network's time per look at a phrase: the journal shows it — zns-perf.log «голос»)
        if (Number.isFinite(d.cost)) { const c = this.cost || (this.cost = { n: 0, sum: 0, max: 0 }); c.n++; c.sum += d.cost; c.max = Math.max(c.max, d.cost); }
        // (the speakers played the game's own voices then — villagers, wizards: not a friend's)
        if ((d.far || 0) >= 0.25 && !d.final) { const w = this._when(d, {}); d.game = Number.isFinite(w.from) && !!soundingLine(w.from - 600, w.to); }
        d.duel = !!this.duelHot;
        d.knows = this.knows; // (spell → does the hero know it: set by the game)
        const r = lookAt(d, this.segs.get(d.id));
        this.onLetters?.(r.heard?.written || '', d); // (what was written so far — the dragon's «У» of «Империус Максима»: DragonHowl)
        if (d.final) this.segs.delete(d.id); else this.segs.set(d.id, r.seg);
        while (this.segs.size > 20) this.segs.delete(this.segs.keys().next().value);
        const meta = { native: true, aec: !!this.status?.aec, far: d.far || 0, echo: false, spell: r.heard.spell?.spell || null, written: r.heard.written, near: r.heard.near, ...this._when(d, r.heard),
            peak: d.peak, floor: d.floor, snr: d.snr, extra: r.heard.extra, seg: d.id, src: d.src,
            // (q: s of quiet already after the words; cut: the look missed the phrase's start — TalkFlow waits for its end)
            q: Number.isFinite(d.q) ? d.q : null, cut: !!d.cut,
            // (the speech network's own time on this look, and when its sound had ended — the talk's stopwatch tells why words come late)
            cost: d.cost, soundEnd: Number.isFinite(d.t1) && this.off != null ? d.t1 + this.off : null };
        // (how much better than needed the spell fit: over a villager's voice only a clear one is mine — GameVoices)
        // (when the speech itself ended — the quiet heard after it taken off: the talk's stopwatch starts there)
        if (Number.isFinite(d.q) && Number.isFinite(meta.to) && !r.heard.spell) meta.end = meta.to - d.q * 1000;
        const sp = r.heard.sure && r.heard.spell;
        if (sp) { meta.fit = sp.avg - threshold(sp.len, d.far || 0, Number.isFinite(d.snr) ? d.snr : Infinity); meta.len = sp.len; }
        if (r.echo) { if (d.final || !r.seg.echoed) { r.seg.echoed = true; this.onEcho?.(r.echo, meta); } return; }
        if (r.say) this.onResult?.(r.say.text, r.say.isFinal, { ...meta, sure: !!r.heard.sure || !!r.say.byWords, byWords: !!r.say.byWords, talkOnly: !!r.say.talkOnly, more: !!r.say.more, settled: !!r.say.settled });
        else if (d.final && !r.seg.fired) {
            // (nothing handed on: the closest spell and how far it was from counting — the spell journal)
            const b = r.heard.best;
            if (b) { meta.near = b.canonical; meta.nearFit = b.avg - threshold(b.len, d.far || 0, Number.isFinite(d.snr) ? d.snr : Infinity); }
            meta.early = !!r.heard.early;
            this.onMiss?.(r.heard.written || '', meta);
        }
    }
}
