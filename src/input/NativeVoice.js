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

import { unpack, hear } from '../audio/SpellSpotter.js';
import { matchSpell } from '../fx/SpellManager.js';

/** A spell this clear is cast from one look at the phrase (avg cost per letter). */
export const SURE_AT_ONCE = -0.6;

/**
 * What one look at a phrase gives the game (pure: tests).
 * @param {object} d  the event from voice_native.py ({id, final, T, lp, ref?, refT?, far, cut?})
 * @param {{last?: string, fired?: string}} seg  what the earlier looks at the same phrase found
 * @returns {{say: null|{text, isFinal}, echo: null|string, heard, seg}}
 *   say: what to hand on now (null: nothing yet); echo: a spell heard only as the speakers' echo
 */
export function lookAt(d, seg = {}) {
    const lp = unpack(d.lp, d.T);
    const ref = d.ref ? unpack(d.ref, d.refT) : null;
    const h = hear(lp, d.T, { ref, refT: d.refT, refLead: d.refLead, far: d.far || 0, final: !!d.final, cut: !!d.cut });
    const next = { ...seg };
    let say = null, echo = null;
    if (h.sure && h.echo) {
        echo = h.spell.canonical;
    } else if (h.sure) {
        const name = h.spell.canonical;
        if (d.final) {
            say = { text: h.text, isFinal: true };
            next.fired = name;
        } else if ((next.last === name || h.spell.avg >= SURE_AT_ONCE) && ((d.far || 0) < 0.25 || d.ref)) {
            // (while the speakers play, only a look that has their sound too may cast: it can tell an echo)
            if (next.fired !== name) { say = { text: h.text, isFinal: false }; next.fired = name; }
        }
        next.last = name;
    } else {
        next.last = null;
        // the words as written: talk to a villager (and a spell only the written words show — not
        // while the speakers play: there the written words may be the friend's)
        const loose = matchSpell(h.written);
        // (while the speakers play, a faint phrase is what the echo canceller left of them: not words of mine)
        const faint = (d.far || 0) >= 0.25 && Number.isFinite(d.peak) && Number.isFinite(d.floor) && d.peak < d.floor + 15;
        // (and a look at a phrase still being said while the speakers play: its end will tell)
        const early = !d.final && (d.far || 0) >= 0.25;
        if (h.written && !faint && !early && (!loose || (d.final && (d.far || 0) < 0.25))) say = { text: h.written, isFinal: !!d.final };
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
        this.segs = new Map();
        this.errors = 0;
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
        const es = new EventSource('/api/voice/stream');
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
        if (d.type === 'lv') { this.onLevel?.(d); return; }
        if (d.type !== 'seg') return;
        const r = lookAt(d, this.segs.get(d.id));
        if (d.final) this.segs.delete(d.id); else this.segs.set(d.id, r.seg);
        while (this.segs.size > 20) this.segs.delete(this.segs.keys().next().value);
        const meta = { native: true, aec: !!this.status?.aec, far: d.far || 0, echo: false, spell: r.heard.spell?.spell || null, written: r.heard.written };
        if (r.echo) { if (d.final || !r.seg.echoed) { r.seg.echoed = true; this.onEcho?.(r.echo, meta); } return; }
        if (r.say) this.onResult?.(r.say.text, r.say.isFinal, { ...meta, sure: !!r.heard.sure });
    }
}
