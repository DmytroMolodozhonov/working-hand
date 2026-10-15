/**
 * HouseTheme.js — the tune of «Create a House» / «Improve a House» (HouseMagic.js), made by synthesis.
 *
 * A warm fairy-tale theme in C major that grows with the house: four bars (C – Am – F – G) over the
 * whole time of the magic, then the house is there — a big C major chord rings out exactly then.
 *   bar 1  a soft string pad and a harp plucking the chord slowly; the celesta's first simple notes
 *   bar 2  the harp quicker, the melody climbs
 *   bar 3  the bass comes in, the melody in quicker notes
 *   bar 4  everything; a harp glissando runs up into the last chord
 * Higher levels (an improvement, up to 5): the bass and the pad from the start, an octave doubling
 * of the melody, a deeper last chord — more solemn.
 *
 * Pure: (sample rate, seconds, level) → samples. The SoundManager puts them in a buffer and plays
 * it from the place of the house (SoundManager.playHouseTheme).
 */

/** After the magic's time: how long the last chord rings (s). */
export const THEME_TAIL = 3.2;

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C5' → Hz. */
export function hz(name) {
    const n = NOTE[name[0]] + (name[1] === '#' ? 1 : 0);
    const oct = +name.slice(name[1] === '#' ? 2 : 1);
    return 440 * Math.pow(2, (n + 12 * (oct + 1) - 69) / 12);
}

// the chords of the four bars and the last one
const CHORDS = [['C3', 'G3', 'C4', 'E4', 'G4'], ['A2', 'E3', 'A3', 'C4', 'E4'], ['F2', 'C3', 'F3', 'A3', 'C4'], ['G2', 'D3', 'G3', 'B3', 'D4']];
const FINAL = ['C2', 'C3', 'G3', 'C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6'];
// the melody: [beat, length in beats, note] — 16 beats (4 bars of 4)
const MELODY = [
    [0, 1, 'G5'], [1, 1, 'E5'], [2, 1, 'G5'], [3, 1, 'C6'],
    [4, 1, 'A5'], [5, 1, 'C6'], [6, 2, 'E6'],
    [8, 0.5, 'F5'], [8.5, 0.5, 'A5'], [9, 0.5, 'C6'], [9.5, 0.5, 'F6'], [10, 1, 'E6'], [11, 1, 'C6'],
    [12, 0.5, 'D6'], [12.5, 0.5, 'B5'], [13, 0.5, 'G5'], [13.5, 0.5, 'B5'], [14, 1, 'D6'], [15, 1, 'F6'],
];

// (a table of one sine wave: the tune is made in a few tens of ms, not a hitch of the game)
const TB = 4096, SIN = new Float32Array(TB);
for (let i = 0; i < TB; i++) SIN[i] = Math.sin((2 * Math.PI * i) / TB);
/** sin(2π·c) for c in cycles. */
const sn = (c) => SIN[((c * TB) | 0) & (TB - 1)];

/** A little deterministic noise (the harp's pluck): the same tune on every computer. */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

/**
 * The tune's samples (mono, −1…1): `seconds` of magic and the last chord's ring after it.
 * @param {number} sr  sample rate
 * @param {number} seconds  the magic's time: the last chord comes exactly then
 * @param {number} [level]  1…5: higher — more solemn
 */
export function houseTheme(sr, seconds, level = 1) {
    const total = seconds + THEME_TAIL;
    const out = new Float32Array(Math.ceil(sr * total));
    const beat = seconds / 16, bar = beat * 4;
    const grand = Math.max(0, Math.min(1, (level - 1) / 4)); // 0 … 1
    const rand = rng(7 + level);

    // a celesta's bell: the note and its bright partial, a quick decay
    const bell = (f, t0, len, amp) => {
        const i0 = Math.floor(t0 * sr), n = Math.min(out.length - i0, Math.floor((len + 1.4) * sr));
        // (the decays as running products: no exp a sample)
        const k1 = Math.exp(-(2.2 + 1.5 / Math.max(0.4, len)) / sr), k2 = Math.exp(-5 / sr);
        let d1 = 1, d2 = 1;
        for (let i = 0; i < n; i++, d1 *= k1, d2 *= k2) {
            const t = i / sr;
            out[i0 + i] += amp * Math.min(1, t * 600) * d1 * (sn(f * t) + 0.35 * sn(f * 4 * t) * d2 + 0.15 * sn(f * 2 * t));
        }
    };
    // a harp's pluck (Karplus–Strong: a string of noise smoothing itself out)
    const pluck = (f, t0, amp, ring = 1.6) => {
        const i0 = Math.floor(t0 * sr), n = Math.min(out.length - i0, Math.floor(ring * sr));
        const L = Math.max(2, Math.round(sr / f));
        const line = new Float32Array(L);
        for (let k = 0; k < L; k++) line[k] = rand();
        let p = 0;
        for (let i = 0; i < n; i++) {
            const q = (p + 1) % L;
            const v = line[p];
            line[p] = 0.4985 * (v + line[q]);
            p = q;
            out[i0 + i] += amp * v * Math.min(1, i / (sr * 0.002));
        }
    };
    // soft strings: three slightly different voices per note, a slow swell and a vibrato
    const pad = (notes, t0, len, amp) => {
        const i0 = Math.floor(t0 * sr), n = Math.min(out.length - i0, Math.floor((len + 0.6) * sr));
        const fs = notes.map(hz);
        for (let i = 0; i < n; i++) {
            const t = i / sr;
            const e = Math.min(1, t / 0.5) * Math.min(1, Math.max(0, (len + 0.6 - t) / 0.6));
            if (e <= 0) continue;
            const vib = 1 + 0.003 * sn(5 * t);
            let s = 0;
            for (const f of fs) s += sn(f * vib * t) + 0.5 * sn(f * 1.004 * t) + 0.5 * sn(f * 0.996 * t) + 0.12 * sn(2 * f * t);
            out[i0 + i] += amp * e * s / fs.length;
        }
    };

    for (let b = 0; b < 4; b++) {
        const t0 = b * bar, ch = CHORDS[b];
        // the strings: quiet at first, fuller as the house grows
        pad(ch.slice(1), t0, bar, 0.05 + 0.05 * b / 3 + 0.04 * grand);
        // the harp: the chord up and down — quarter notes at first, then eighths
        const step = b === 0 && grand < 0.5 ? beat : beat / 2;
        const up = [...ch.slice(1), ...ch.slice(1, -1).reverse()];
        for (let k = 0, t = t0; t < t0 + bar - 1e-6; k++, t += step) pluck(hz(up[k % up.length]) * 2, t, 0.13 + 0.05 * b / 3);
        // the bass: from bar 3 (from the start on the higher levels)
        if (b >= 2 || grand > 0) { pluck(hz(ch[0]), t0, 0.32 + 0.1 * grand, 2.4); pluck(hz(ch[0]), t0 + beat * 2, 0.22, 2); }
    }
    // the melody on the celesta (on the higher levels doubled an octave down: warmer, grander)
    for (const [at, len, note] of MELODY) {
        const grow = 0.6 + 0.4 * at / 16;
        bell(hz(note), at * beat, len * beat, 0.16 * grow);
        if (grand > 0) bell(hz(note) / 2, at * beat, len * beat, 0.08 * grand * grow);
    }
    // the last half bar: a harp glissando up into the chord
    const gl = ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6', 'E6'];
    gl.forEach((note, k) => pluck(hz(note), seconds - beat * 1.5 + k * (beat * 1.4 / gl.length), 0.12));
    // the house is there: the big chord — strings, harp, bells — ringing out
    pad(FINAL.slice(grand > 0 ? 0 : 1, 8), seconds, THEME_TAIL - 0.6, 0.11 + 0.04 * grand);
    for (const note of FINAL) pluck(hz(note), seconds, 0.16, THEME_TAIL);
    for (const note of ['C6', 'E6', 'G6']) bell(hz(note), seconds, 2, 0.13);

    // loud enough, never clipping; the ring fades to nothing at the end
    let peak = 0;
    for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
    const k = peak > 0 ? 0.85 / peak : 1;
    const fade = Math.floor(sr * 0.4);
    for (let i = 0; i < out.length; i++) out[i] *= k * Math.min(1, (out.length - i) / fade);
    return out;
}

/** The magic broke: a sour falling cluster (the tune stops on it). */
export function houseThemeBreak(sr) {
    const len = Math.floor(sr * 1.4), out = new Float32Array(len);
    const fs = [hz('B4'), hz('C5'), hz('F#5'), hz('C#4')];
    for (let i = 0; i < len; i++) {
        const t = i / sr, e = Math.min(1, t * 300) * Math.exp(-t * 2.6);
        const bend = 1 - 0.12 * t; // (it sags, as a string let go)
        let s = 0;
        for (const f of fs) s += sn(f * bend * t) + 0.3 * sn(f * 2.02 * bend * t);
        out[i] = 0.2 * e * s;
    }
    return out;
}
