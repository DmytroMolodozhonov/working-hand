/**
 * DragonHowl.js — the dragon's fire in «Империус Максима»: the caster's long «У-у-у» (pure; tests/unit/imperius-flight.test.js).
 *
 * The author: «Если игрок завладел драконом, он может пуляться огнём раз в 7 секунд. Чтобы пуляться огнём, он
 * должен произнести звук „У“. Длинный. Чем громче и интенсивнее, тем больше будет огонь.»
 *
 *  - What is heard: the voice program's letters (NativeVoice: every look at a phrase, its letters written) — the phrase is
 *    nothing but «у» (or «ю», «u»; the network writes a held vowel as one letter or a few) — and the microphone's level
 *    (20 a second, NativeVoice 'lv'): how loud over the room's quiet.
 *  - It breathes once the «у» has gone on HOLD s; the flame goes on while the «у» does (at most MAX s); its size follows
 *    the loudness (louder — longer reach, wider, hotter). Then REST s — FIRE_EVERY from the start — before the next.
 *  - Without the voice program (the browser's recognizer): a phrase «у», «ууу» heard starts a middle-sized breath.
 */

export const HOWL = {
    HOLD: 0.35, // s of «у» before the fire comes
    MAX: 3, // s the fire lasts at most (as long as the «у» goes on)
    EVERY: 7, // s from one breath's start to the next (the author)
    LOUD: 8, // dB over the room's quiet: a voice at all
    FULL: 30, // dB over it: the loudest — the biggest flame
    FRESH: 0.7, // s: the letters said «у» this recently — it still goes on
    QUIET_GAP: 0.35, // s of quiet: the «у» is over
};

/** Is this what was heard nothing but a long «у» («у», «уу», «ю-у», «u»)? */
export function isHowl(written) {
    const s = String(written || '').toLowerCase().replace(/ё/g, 'е').replace(/[\s\-.,!?…]+/g, '');
    return s.length > 0 && s.length <= 12 && /^[уюuoу]+$/.test(s) && /[уu]/.test(s);
}

/** How big the flame for a loudness `db` over the quiet `floor`: 0.35 (barely) … 1.6 (shouted). */
export function flameSize(db, floor) {
    const over = (db ?? -100) - (floor ?? -60);
    const k = Math.max(0, Math.min(1, (over - HOWL.LOUD) / (HOWL.FULL - HOWL.LOUD)));
    return 0.35 + 1.25 * k;
}

export class HowlReader {
    constructor() {
        this.floor = -60; // the room's quiet (dB)
        this.db = -100; // the loudness now
        this.loudT = 0; // s since the voice was last loud
        this.saidAt = -1e9; // s (the reader's clock) the letters last said «у»
        this.t = 0;
        this.holdT = 0; // s the «у» has gone on
        this.fireT = 0; // s the fire has gone on (0: none)
        this.lastFire = -1e9;
        this.size = 0;
        this.fixed = 0; // s of a breath started by a phrase (the browser's recognizer)
    }

    /** The microphone's level (dB), as it comes (many a second). */
    level(db) {
        if (!Number.isFinite(db)) return;
        this.db = db;
        // the quiet follows the quiet moments fast, a long loud sound very slowly (it is not the room)
        this.floor += (db - this.floor) * (db < this.floor ? 0.2 : 0.002);
        if (db - this.floor >= HOWL.LOUD) this.loudT = 0;
    }

    /** What the voice program wrote of the phrase so far. */
    letters(written) { if (isHowl(written)) this.saidAt = this.t; }

    /** A phrase heard by the browser's recognizer (no letters, no level): «у» — a middle breath at once (~1,2 s). */
    phrase(text) {
        if (!isHowl(text) || this.fireT > 0 || this.t - this.lastFire < HOWL.EVERY) return false;
        this.fireT = 1e-3; this.lastFire = this.t; this.size = 0.9; this.fixed = 1.2; this._start = true;
        return true;
    }

    /** Every frame. → {start: the fire begins now, on: it burns, size} */
    update(dt) {
        this.t += dt;
        this.loudT += dt;
        const going = this.loudT < HOWL.QUIET_GAP && this.t - this.saidAt < HOWL.FRESH;
        let start = false;
        if (this.fireT > 0) {
            this.fireT += dt;
            if (!this.fixed) this.size += (flameSize(this.db, this.floor) - this.size) * Math.min(1, dt * 4); // (louder now — bigger now)
            if (this.fixed ? this.fireT >= this.fixed : (!going || this.fireT >= HOWL.MAX)) { this.fireT = 0; this.fixed = 0; }
        } else if (going) {
            this.holdT += dt;
            if (this.holdT >= HOWL.HOLD && this.t - this.lastFire >= HOWL.EVERY) {
                this.fireT = 1e-3; this.lastFire = this.t; start = true; this.holdT = 0; this.fixed = 0;
                this.size = flameSize(this.db, this.floor);
            }
        } else this.holdT = 0;
        if (this._start) { this._start = false; start = true; }
        return { start, on: this.fireT > 0, size: this.size };
    }

    /** s until the next breath may come (0: ready). */
    rest() { return Math.max(0, HOWL.EVERY - (this.t - this.lastFire)); }
}
