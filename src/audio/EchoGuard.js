/**
 * EchoGuard.js — was it ME who said it, or a friend's voice from my speakers? (pure: tests, voicebench)
 *
 * The author: «друг в Discord говорит — его звук идёт из колонок в мой микрофон, и игра думает, что говорю я: мои
 * заклинания срабатывают медленнее… или вообще не летят. Сделай очень-очень крутую систему… чуть ли не на 100 %».
 *
 * The game KNOWS what plays in the speakers, or what the friend says, as a loudness envelope (10 ms frames, dB):
 *   'play' — the friends' voices of the game's own voice chat, as this computer plays them (the exact copy);
 *   'spk'  — everything in the speakers (Discord too): the native voice's copy of the speakers (Windows «loopback»);
 *   'net'  — a friend's own voice as HIS game hears it (only his voice: what his speakers brought is taken out there),
 *            sent over the game's network — with Discord on a Mac / in the browser this is the only copy there is;
 *   'game' — the game's own sounds (music, spells): not a friend, but not my voice either.
 * The microphone's envelope against them: where the friend's voice, delayed by the way to my microphone (the speakers,
 * the room — 40…300 ms; Discord over the internet — up to ~0.9 s more), explains what the microphone heard, that is his
 * echo; where the microphone is clearly louder than any echo could be, that is me.
 *
 *   mic(t, db) / ref(id, kind, t, db)        10 ms levels (performance.now() ms of the frame's start)
 *   track(now)                               (4×/s) find each copy's delay and how loud it comes back (lag, gain)
 *   judge(from, to)  → {verdict, share, near, nearRun, lag, ...}    'none' | 'echo' | 'mine' | 'mixed'
 *   friendWord(by, spell, from, to) / friendSaid(spell, from, to)   a friend's own recognized spell (his game says so)
 *   decide(spell, j, ...) → {block, hold, why}                       what the game does with a spell heard
 * The rule above all (the author): my own voice is never let go because of an echo — a phrase with enough of my voice
 * in it ('mine') is mine, and the lips moving with the voice (VoiceGate.lipsSync) make anything mine.
 */

export const ECHO = {
    FRAME: 10,          // ms a level covers
    N: 1024,            // frames kept (10 s)
    LOUD: 9,            // dB over the microphone's quiet: a frame with sound in it
    EXPL: 3,            // the loudest echo foreseen is at most this much quieter than the microphone: the frame is the echo
    NEAR: 6,            // the microphone this much louder than the loudest echo foreseen: the frame is a voice of this room (mine)
    NEAR_RUN: 9,        // frames (90 ms) of «mine» in a row: a syllable of my own — not a crackle
    MINE_SHARE: 0.22,   // …and this share of the phrase's sound
    ECHO_SHARE: 0.66,   // the echo explains this share of the phrase's sound (and nothing of mine in it): an echo
    DECAY: 1.0,         // dB a frame the room's echo tail dies away at least (60 dB in 0.6 s: a big, echoing room)
    ACTIVE: 12,         // dB over a copy's own quiet: the friend speaks there…
    QUIET_DB: -62,      // …and louder than this (dBFS): the copies' digital silence is far below anything heard
    TOL: 2,             // frames each way the delay may wander (the sound card's buffers, Discord's jitter)
    WIN: 400,           // frames (4 s) the delay is looked for over
    CORR: 0.45,         // the delay found is believed when the envelopes agree this well…
    PEAK: 0.12,         // …and clearly better there than at the other delays
    LAGS: { play: [0, 40], game: [0, 40], spk: [-3, 30], net: [-15, 95] }, // frames: where the delay may be
    PRIOR: { play: 9, game: 9, spk: 4, net: 30 }, // (the delay before any was found)
    WORD_BEFORE: 400,   // ms: a friend's word counts if it began no later than mine (+ this: the clocks, the network's place of the word) — an echo comes after
    WORD_AFTER: 1800,   // ms after the end of his word its echo may still be heard (Discord, the room)
    HOLD: 700,          // ms a doubtful spell waits for the friend's own word to come over the network
    CLEAR: 1.0,         // the native voice's fit (better than needed by): a clear spell — never a friend's talk heard as one…
    CLEAR_SHORT: 0.4,   // …a short one («ап», «айс») more still
};

const NEG = -120;

/** A ring of 10 ms levels by frame number (a missing frame is NaN). */
export class Ring {
    constructor(n = ECHO.N) { this.n = n; this.v = new Float32Array(n); this.k = new Int32Array(n).fill(-1); }
    put(i, db) { const j = i & (this.n - 1); this.v[j] = db; this.k[j] = i; }
    get(i) { const j = i & (this.n - 1); return this.k[j] === i ? this.v[j] : NaN; }
}

const frameOf = (t) => Math.floor(t / ECHO.FRAME);

/** The q-quantile of a list (copied: the list is not sorted in place). */
function quantile(a, q) {
    if (!a.length) return NaN;
    const b = Float32Array.from(a).sort();
    return b[Math.min(b.length - 1, Math.max(0, Math.floor(q * b.length)))];
}

/** Base spell name: «Бомбардо Максима» is still «Бомбардо» for the friend's words. */
const ALIAS = { Levitate: 'Levitation', Frozen: 'Ice' };
export const baseSpell = (name) => { const b = String(name || '').replace(/Maxima$/, '').replace(/Duel$/, '').replace(/Super$/, ''); return ALIAS[b] || b; };

export class EchoGuard {
    constructor() {
        this.m = new Ring();
        this.mFloor = -60;
        this.mLast = -1;
        this.mFirst = null;
        this.refs = new Map(); // id → {kind, ring, floor, lag, conf, gain, last}
        this.words = []; // {by, base, from, to}
        this.clocks = new Map(); // a friend → his clock's offset to mine (ms)
        this._a = new Float32Array(ECHO.WIN + 200);
        this._b = new Float32Array(ECHO.WIN + 200);
        this._bm = new Float32Array(ECHO.WIN + 200);
    }

    /** A 10 ms microphone level (as the voice recognizer hears it). */
    mic(t, db) {
        const i = frameOf(t);
        const v = Number.isFinite(db) ? Math.max(NEG, db) : NEG;
        this.m.put(i, v);
        if (i > this.mLast) this.mLast = i;
        if (this.mFirst == null) this.mFirst = i;
        // (the room's quiet: follows quiet moments quickly, loud ones very slowly)
        this.mFloor += (v - this.mFloor) * (v < this.mFloor ? 0.3 : 0.004);
    }

    /** A 10 ms level of a copy (`kind`: 'play' | 'spk' | 'net' | 'game'). */
    ref(id, kind, t, db) {
        let r = this.refs.get(id);
        if (!r) {
            r = { id, kind, ring: new Ring(), floor: -70, lag: ECHO.PRIOR[kind] ?? 10, conf: 0, gain: NaN, last: -1e9, lastI: -1 };
            this.refs.set(id, r);
        }
        const i = frameOf(t);
        const v = Number.isFinite(db) ? Math.max(NEG, db) : NEG;
        r.ring.put(i, v);
        if (i > r.lastI) r.lastI = i;
        if (r.firstI == null) r.firstI = i;
        r.floor += (v - r.floor) * (v < r.floor ? 0.3 : 0.002);
        if (this._on(r, v)) r.last = t;
    }

    /** Does he speak in this frame of his copy? (over his own quiet, and not a whisper of the digital silence) */
    _on(r, v) { return v > Math.max(r.floor + ECHO.ACTIVE, ECHO.QUIET_DB); }

    /** A friend's copy is gone (he left, the voice chat was switched off). */
    drop(id) { this.refs.delete(id); }

    /** His level at frame i (a missing frame of a copy is his quiet). */
    _r(r, i) { const v = r.ring.get(i); return Number.isFinite(v) ? v : Math.min(r.floor, -90); }

    /**
     * A friend's clock → mine: a message comes a little after it was sent, never before, so the smallest «my time −
     * his time» seen is the difference plus the shortest way (let up slowly: the clocks drift). → my time of `t`.
     */
    clock(by, sentAt, now) {
        if (!Number.isFinite(sentAt)) return null;
        const off = now - sentAt;
        const c = this.clocks.get(by);
        const v = c == null || off - c > 5000 ? off : Math.min(c + 0.5, off);
        this.clocks.set(by, v);
        return v;
    }

    /** His time → mine (null until a message of his came). */
    mine(by, t) { const c = this.clocks.get(by); return c == null ? null : t + c; }

    /**
     * Find each copy's delay to the microphone and how loud it comes back (the envelopes' correlation over the last 4 s).
     * Cheap: ~100 delays × 400 frames for a copy that spoke lately; a copy silent for long is left as it was.
     */
    track(now) {
        const end = this.mLast - 3;
        if (this.mFirst == null) return;
        // (one copy a call, in turn — the game calls this 4× a second: ~0.1 ms, never a hitch in a frame)
        const list = [...this.refs.values()];
        if (!list.length) return;
        for (let tries = 0; tries < list.length; tries++) {
            const r = list[(this._turn = ((this._turn || 0) + 1) % list.length)];
            if (now - r.last > ECHO.WIN * ECHO.FRAME + 500) { r.conf *= 0.995; continue; }
            this._trackOne(r, end);
            return;
        }
    }

    _trackOne(r, end) {
        const [lo, hi] = ECHO.LAGS[r.kind] || [0, 40];
        // (the first seconds: as much as there is — 1.5 s is enough to find a delay)
        const W = Math.min(ECHO.WIN, end - Math.max(this.mFirst, r.firstI ?? 0) - hi - ECHO.TOL), a = this._a;
        if (W < 150) return;
        const i0 = end - W + 1;
        let nm = 0;
        for (let k = 0; k < W; k++) {
            const v = this.m.get(i0 + k);
            a[k] = Number.isFinite(v) ? Math.max(v, this.mFloor) : NaN;
            if (Number.isFinite(v)) nm++;
        }
        if (nm < W * 0.6) return;
        // his level over the frames the delays reach — the loudest of ±TOL frames (the delay may wander a frame or two)
        const span = W + (hi - lo) + 2 * ECHO.TOL;
        if (this._b.length < span + 1) { this._b = new Float32Array(span + 64); this._bm = new Float32Array(span + 64); }
        const b = this._b, bm = this._bm;
        const j0 = i0 - hi - ECHO.TOL;
        let act = 0;
        const rf = r.floor;
        for (let k = 0; k <= span; k++) {
            const v = Math.max(this._r(r, j0 + k), rf);
            b[k] = v;
            if (this._on(r, v)) act++;
        }
        if (act < 30) return; // (he barely spoke: nothing to find the delay by)
        for (let k = 0; k <= span; k++) { let y = b[k]; for (let d = 1; d <= ECHO.TOL; d++) { if (k - d >= 0 && b[k - d] > y) y = b[k - d]; if (k + d <= span && b[k + d] > y) y = b[k + d]; } bm[k] = y; }
        let best = -2, bestL = r.lag, sum = 0, cnt = 0;
        for (let L = lo; L <= hi; L++) {
            // mic frame i0+k ↔ his frame i0+k−L → b index (i0+k−L) − j0 = k + hi + TOL − L
            const off = hi + ECHO.TOL - L;
            let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
            for (let k = 0; k < W; k++) {
                const x = a[k];
                if (x !== x) continue;
                const y = bm[k + off];
                n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
            }
            if (n < 50) continue;
            const vx = sxx - sx * sx / n, vy = syy - sy * sy / n;
            if (vx <= 1e-6 || vy <= 1e-6) continue;
            const c = (sxy - sx * sy / n) / Math.sqrt(vx * vy);
            sum += c; cnt++;
            if (c > best) { best = c; bestL = L; }
        }
        if (!cnt) return;
        const mean = sum / cnt;
        if (best >= ECHO.CORR && best - mean >= ECHO.PEAK) {
            // (a delay near the old one: kept steady; a far one only when it is clearly the better)
            if (r.conf > 0.3 && Math.abs(bestL - r.lag) > 3 && best < r.corr + 0.08) return;
            r.lag = bestL;
            r.corr = best;
            r.conf = Math.min(1, r.conf + 0.34);
            // how loud it comes back (the middle of «mic − his» where he speaks) and how far it wanders above that
            const off = hi + ECHO.TOL - bestL;
            const d = [], du = [];
            for (let k = 0; k < W; k++) {
                const x = a[k];
                if (x !== x) continue;
                const y = bm[k + off];
                if (!this._on(r, y)) continue;
                d.push(x - y);
                // (how far above: only where the microphone heard something — not its quiet, the room's noise, lifted to)
                if (x > this.mFloor + ECHO.LOUD) du.push(x - y);
            }
            if (d.length >= 20) {
                // (the game's own sounds go on all the time, under every voice: only their low part is theirs)
                const g = quantile(d, r.kind === 'game' ? 0.2 : 0.5);
                const sp = r.kind === 'game' || du.length < 20 ? 3 : Math.max(2, Math.min(6, quantile(du, 0.85) - quantile(du, 0.5)));
                const fresh = !Number.isFinite(r.gain) || r.conf < 1;
                r.gain = fresh ? g : r.gain * 0.6 + g * 0.4;
                r.spread = fresh || !Number.isFinite(r.spread) ? sp : r.spread * 0.6 + sp * 0.4;
            }
            r.missN = 0; r.deaf = false;
        } else {
            r.conf *= 0.97;
            // (headphones: he speaks, and the microphone stays quiet then — his voice has no way to it: not an echo at all)
            const lag = ECHO.PRIOR[r.kind] ?? 10;
            let on = 0, loud = 0;
            const ub = [], xOn = [], xOff = [];
            for (let k = 0; k < W; k++) {
                const x = a[k];
                if (x !== x) continue;
                const y = this._r(r, i0 + k - lag);
                if (this._on(r, y)) { on++; if (x > this.mFloor + ECHO.LOUD) loud++; ub.push(x - y); xOn.push(x); } else xOff.push(x);
            }
            // (no delay found — his echo too faint in the microphone, or drowned in noise: at least it is never louder than
            // the microphone was while he spoke — an upper bound of how loud he comes back)
            if (ub.length >= 100) { const u = quantile(ub, 0.85); r.gainUB = Number.isFinite(r.gainUB) ? r.gainUB * 0.7 + u * 0.3 : u; }
            // (the microphone no louder while he speaks than while he is silent — whatever noise is in the room: no way to it)
            const flat = xOn.length >= 50 && xOff.length >= 50 && quantile(xOn, 0.5) - quantile(xOff, 0.5) < 3 && quantile(xOn, 0.8) - quantile(xOff, 0.8) < 4;
            if (on >= 30 && (loud < on * 0.2 || flat)) r.missN = (r.missN || 0) + 1; else if (on >= 30) r.missN = 0;
            if (r.missN >= 16) r.deaf = true; // (4 s of his talk, the microphone quiet all the while)
        }
    }

    /**
     * What the microphone heard from `from` to `to` (ms): the friend's echo, me, both, or nothing to tell.
     * @returns {{verdict:'none'|'echo'|'mine'|'mixed', loud:number, share:number, near:number, nearRun:number,
     *            active:boolean, lag:number|null, gain:number|null, sure:boolean, by:string|null}}
     */
    judge(from, to) {
        const j = this._judge(from, to);
        // (the spell's place in the phrase as the speech network tells it may be off by a few hundred ms — a word aligned
        // over the pause before it: nothing heard there — look round it)
        if (j.loud < 6 || !j.active) {
            const k = this._judge(from - 450, to + 450);
            if (k.loud > j.loud) return k;
        }
        return j;
    }

    _judge(from, to) {
        const i0 = frameOf(from) - 3, i1 = frameOf(to) + 3;
        const out = { verdict: 'none', loud: 0, share: 0, near: 0, nearRun: 0, active: false, lag: null, gain: null, sure: false, by: null };
        if (!(i1 > i0) || i1 - i0 > 1200) return out;
        // the echo foreseen per frame: the loudest of the copies, each delayed and scaled as found (a copy whose
        // delay is not found yet — at its usual delay, as loud as it is: the worst case, never «mine» by mistake)
        const n = i1 - i0 + 1;
        const E = new Float32Array(n).fill(NEG);
        let best = null, bestAct = 0;
        for (const r of this.refs.values()) {
            if (r.kind === 'game' && !(r.conf > 0.3)) continue; // (the game's sounds: only once their way to the microphone is known)
            if (r.deaf && !(r.conf > 0.3)) continue; // (headphones: his voice never reaches my microphone)
            const sure = r.conf > 0.3 && Number.isFinite(r.gain);
            const lag = sure ? r.lag : ECHO.PRIOR[r.kind] ?? 10;
            // (the loudest it may come back: its middle + how far it wanders above; not known yet — as loud as it is)
            const gain = sure ? r.gain + (r.spread ?? 4) : Number.isFinite(r.gainUB) ? Math.min(0, r.gainUB + 3) : 0;
            const tol = sure ? ECHO.TOL : 8; // (unknown delay: a wide window)
            let e = NEG, act = 0;
            const lead = 60;
            for (let k = -lead; k < n; k++) {
                const i = i0 + k - lag;
                let v = NEG;
                for (let d = -tol; d <= tol; d++) { const x = this._r(r, i + d); if (x > v) v = x; }
                const on = this._on(r, v);
                e = Math.max(on ? v + gain : NEG, e - ECHO.DECAY);
                if (k >= 0) { if (e > E[k]) E[k] = e; if (on) act++; }
            }
            if (act > bestAct) { bestAct = act; best = { r, sure, lag }; }
        }
        let loud = 0, expl = 0, near = 0, run = 0, maxRun = 0, gap = 0, active = false;
        const floor = this.mFloor;
        for (let k = 0; k < n; k++) {
            const m = this.m.get(i0 + k);
            if (!Number.isFinite(m)) continue;
            const e = E[k];
            if (e > floor + 3) active = true;
            if (m <= floor + ECHO.LOUD) { if (run && ++gap > 1) { run = 0; gap = 0; } continue; }
            loud++;
            if (e >= m - ECHO.EXPL) { expl++; if (run && ++gap > 1) { run = 0; gap = 0; } continue; }
            if (m > Math.max(e, floor) + ECHO.NEAR) { near++; run++; gap = 0; if (run > maxRun) maxRun = run; }
            else if (run && ++gap > 1) { run = 0; gap = 0; }
        }
        out.loud = loud; out.active = active;
        out.share = loud ? expl / loud : 0;
        out.near = loud ? near / loud : 0;
        out.nearRun = maxRun;
        if (best) { out.lag = best.lag * ECHO.FRAME; out.gain = best.sure ? best.r.gain : null; out.sure = best.sure; out.by = best.r.id; }
        if (loud < 4 || !active) out.verdict = 'none';
        else if (maxRun >= ECHO.NEAR_RUN && out.near >= ECHO.MINE_SHARE) out.verdict = 'mine';
        else if (out.share >= ECHO.ECHO_SHARE && maxRun < ECHO.NEAR_RUN && out.sure) out.verdict = 'echo';
        // (the way of his voice to my microphone not known yet: a doubt — the game waits for his word, never lets mine go)
        else out.verdict = 'mixed';
        return out;
    }

    /**
     * The microphone's last burst of sound before `t` (the browser's recognizer tells no times): [from, to] ms, or null.
     * Its end at most `late` ms before t; pauses inside up to 350 ms; at most `max` ms long.
     */
    lastBurst(t, late = 1800, max = 4000) {
        const end = Math.min(frameOf(t), this.mLast);
        const lo = frameOf(t - late), stop = frameOf(t - late - max);
        const loud = (i) => { const v = this.m.get(i); return Number.isFinite(v) && v > this.mFloor + ECHO.LOUD; };
        let b = end;
        while (b >= lo && !loud(b)) b--;
        if (b < lo) return null;
        let a = b, gap = 0;
        for (let i = b - 1; i >= stop; i--) {
            if (loud(i)) { a = i; gap = 0; } else if (++gap > 35) break;
        }
        return [a * ECHO.FRAME, (b + 1) * ECHO.FRAME];
    }

    /** Is a friend speaking now (or a moment ago)? → his id, or null. */
    friendTalking(now, within = 400) {
        for (const r of this.refs.values()) if (r.kind !== 'game' && now - r.last < within) return r.id;
        return null;
    }

    /** A friend's own recognized spell (his game heard him say it), his phrase from…to in MY clock (ms). */
    friendWord(by, spell, from, to) {
        if (!spell || !Number.isFinite(from)) return;
        this.words.push({ by, base: baseSpell(spell), from, to: Number.isFinite(to) ? to : from });
        while (this.words.length > 40 || (this.words.length && this.words[0].to < from - 15000)) this.words.shift();
    }

    /**
     * Did a friend say that spell's words before me (my phrase from…to)? An echo always comes AFTER the voice it is of:
     * a word of his that began later than mine is not where mine came from (his microphone heard my voice). → his id
     */
    friendSaid(spell, from, to) {
        const base = baseSpell(spell);
        for (let i = this.words.length - 1; i >= 0; i--) {
            const w = this.words[i];
            if (w.base !== base) continue;
            if (w.from <= from + ECHO.WORD_BEFORE && w.to + ECHO.WORD_AFTER >= from) return w.by;
        }
        return null;
    }

    /** Did a friend say any spell's words around my phrase (from…to)? (his spell heard as another one) → his id */
    friendSpoke(from, to) {
        for (let i = this.words.length - 1; i >= 0; i--) {
            const w = this.words[i];
            if (w.from <= to + ECHO.WORD_BEFORE && w.to + ECHO.WORD_AFTER >= from) return w.by;
        }
        return null;
    }

    /** Was this one frame my own voice (louder than any echo foreseen)? (the copy the others get: only my voice) */
    frameMine(t) {
        const i = frameOf(t);
        const m = this.m.get(i);
        if (!Number.isFinite(m) || m <= this.mFloor + ECHO.LOUD) return false;
        let e = NEG;
        for (const r of this.refs.values()) {
            if (r.deaf && !(r.conf > 0.3)) continue;
            if (!(r.conf > 0.3) || !Number.isFinite(r.gain)) {
                // (a copy whose way is unknown: a frame while it speaks is not surely mine)
                if (r.kind !== 'game' && this._on(r, this._r(r, i - (ECHO.PRIOR[r.kind] ?? 10)))) return false;
                continue;
            }
            const g = r.gain + (r.spread ?? 4);
            for (let d = -ECHO.TOL; d <= ECHO.TOL + 8; d++) { const v = this._r(r, i - r.lag - d); if (this._on(r, v)) e = Math.max(e, v + g - Math.max(0, d - ECHO.TOL) * ECHO.DECAY); }
        }
        return m > Math.max(e, this.mFloor) + ECHO.NEAR;
    }
}

/**
 * What the game does with a spell the microphone heard (pure).
 * @param {object} j        judge() of the phrase
 * @param {object} o
 *   said     friendSaid(): a friend's game says HE said that spell, before me
 *   spoke    friendSpoke(): a friend said some spell then (his spell's echo heard as another spell)
 *   lips     VoiceGate.lipsSync: my mouth moved with the voice heard (true) / did not (false) / unseen (null)
 *   clear    the native voice: the spell fit far better than needed (true) / only just (false) / unknown (null: the browser)
 *   talking  a friend is speaking now, or has just spoken — his word may yet come
 *   held     this is the second look, after a wait (no more waiting)
 * @returns {{block:boolean, hold:number, why:string}}
 */
export function decide(j, { said = null, spoke = null, lips = null, clear = null, talking = false, held = false } = {}) {
    if (lips === true) return { block: false, hold: 0, why: 'рот двигался вместе с голосом — это вы' };
    const pct = (x) => Math.round(x * 100);
    const lagTxt = j.lag != null ? `, задержка ${j.lag} мс` : '';
    const what = j.by === 'spk' ? 'звука из колонок (Discord, голоса игры)' : 'голоса друга из колонок';
    if (j.verdict === 'mine') {
        // (enough of my voice in it: mine — unless a friend said this very spell first and my part of the phrase is small)
        if (said && j.near < 0.5 && lips !== null) return { block: true, hold: 0, why: 'это слова друга (он сказал это заклинание раньше вас), а ваш рот не двигался' };
        if (said && j.near < 0.35) return { block: true, hold: 0, why: `это слова друга: он сказал это заклинание раньше вас, а вашего голоса во фразе мало (${pct(j.near)}%)` };
        return { block: false, hold: 0, why: `ваш голос: ${pct(j.near)}% фразы громче любого эха` };
    }
    if (said) return { block: true, hold: 0, why: 'друг сказал это заклинание раньше вас — это его голос из колонок' };
    if (j.verdict === 'echo') {
        // (all of it is like his voice: his — unless the spell is crystal clear (his talk is never heard as one): then it is a
        // spell of mine said as loud as his echo, or his own spell — his game tells which in a moment)
        if (clear === true && !(spoke && j.share >= 0.85)) {
            if (!held) return { block: false, hold: HOLD_MS, why: 'похоже на эхо друга, но заклинание чёткое — ждём, не его ли это слово' };
            return { block: false, hold: 0, why: `чёткое заклинание поверх голоса друга — друг его не говорил` };
        }
        if (lips === false || clear === false || j.share >= 0.85) return { block: true, hold: 0, why: `эхо ${what}: ${pct(j.share)}% фразы совпало с ним${lagTxt}` };
        if (!held) return { block: false, hold: HOLD_MS, why: 'похоже на эхо друга — ждём его слово' };
        return { block: true, hold: 0, why: `эхо ${what}: ${pct(j.share)}% фразы совпало с ним${lagTxt}` };
    }
    if (j.verdict === 'mixed') {
        if (lips === false && clear !== true) return { block: true, hold: 0, why: 'голос друга и ваш вместе, а ваш рот не двигался' };
        // (the way of his voice not known yet — the first seconds of his talk — but all of it is like him, nothing of mine, and he
        // said a spell just then: his)
        if (spoke && j.share >= 0.85 && j.near < 0.1 && j.nearRun < 4) return { block: true, hold: 0, why: `голос друга: он только что произнёс заклинание, а вашего голоса во фразе нет` };
        if (talking && !held) return { block: false, hold: HOLD_MS, why: 'говорил и друг — ждём, не его ли это слово' };
        return { block: false, hold: 0, why: `ваш голос вместе с голосом друга (своего ${pct(j.near)}%)` };
    }
    return { block: false, hold: 0, why: '' };
}

const HOLD_MS = ECHO.HOLD;

/**
 * Is the spell crystal clear (the native voice's fit: how much better than needed)? true / false / null (unknown — the browser's).
 * A friend's talk from the speakers is never heard this clearly as a spell; a spell of mine said as loud as his echo is.
 */
export function clearFit(fit, len = 0) {
    if (!Number.isFinite(fit)) return null;
    return fit >= ECHO.CLEAR + (len <= 3 ? ECHO.CLEAR_SHORT : 0);
}
