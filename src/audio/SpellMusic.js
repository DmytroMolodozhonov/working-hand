/**
 * SpellMusic.js — the sounds of the spells that had none (or only a borrowed one), made by synthesis.
 *
 *   th*    tunes (5–15 s) for the great, rare spells: each its own melody, never looped
 *   fx*    short effects for the everyday spells (Lumos, charges, Accio…): no melody that tires
 *   loop*  quiet loops while a spell is held (Concentration.HELD), end* — the sound when it stops
 *
 * Pure: (sample rate) → samples, deterministic (the same on every computer). Made ahead in a worker
 * (spellMusic.worker.js) on the loading screen — never at the moment a sound is first heard.
 *
 * SPELL_SOUND — the card «spell → its sound» (the author's rule: a new spell comes with its own sound,
 * a great one with a tune): `cast` (when it works; heard by everyone near — positional), `theme` (a tune
 * from the caster's place), `own` (the sounds its own module plays, for the record). HELD_SOUND — the
 * held spells' loops and end sounds. tests/unit/spell-sounds.test.js checks every spoken spell is here.
 */

/** The rate the spell sounds are made at (the bells and pads need no more; played at the context's rate). */
export const SPELL_SR = 24000;

const TB = 4096, SIN = new Float32Array(TB);
for (let i = 0; i < TB; i++) SIN[i] = Math.sin((2 * Math.PI * i) / TB);
/** sin(2π·c), c in cycles. */
const sn = (c) => SIN[((c * TB) | 0) & (TB - 1)];
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C5', 'F#4', 'Bb3' → Hz. */
export function hz(n) {
    let k = NOTE[n[0]], o = 1;
    if (n[1] === '#') { k++; o = 2; } else if (n[1] === 'b') { k--; o = 2; }
    return 440 * Math.pow(2, (k + 12 * (+n.slice(o) + 1) - 69) / 12);
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

// ------------------------------------------------------------------ instruments (add into `o`)
/** A struck bell / celesta. */
function bell(o, sr, f, t0, amp, ring = 1.6, bright = 0.35) {
    const i0 = Math.floor(t0 * sr), n = Math.min(o.length - i0, Math.floor(ring * sr));
    const k1 = Math.exp(-3.2 / ring / sr), k2 = Math.exp(-7 / ring / sr);
    let d1 = 1, d2 = 1;
    for (let i = 0; i < n; i++, d1 *= k1, d2 *= k2) {
        const t = i / sr;
        o[i0 + i] += amp * Math.min(1, t * 700) * (d1 * (sn(f * t) + 0.15 * sn(2 * f * t)) + bright * d2 * sn(4.01 * f * t));
    }
}
/** A harp / string pluck (Karplus–Strong). */
function pluck(o, sr, f, t0, amp, ring, rand) {
    const i0 = Math.floor(t0 * sr), n = Math.min(o.length - i0, Math.floor(ring * sr));
    const L = Math.max(2, Math.round(sr / f)), line = new Float32Array(L);
    for (let k = 0; k < L; k++) line[k] = rand();
    let p = 0;
    for (let i = 0; i < n; i++) {
        const q = (p + 1) % L, v = line[p];
        line[p] = 0.4985 * (v + line[q]);
        p = q;
        o[i0 + i] += v * amp;
    }
}
/**
 * A held chord: soft detuned voices with a few harmonics (`harm` — brighter: more), a slow attack and
 * release; `vib` a choir's vibrato.
 */
function pad(o, sr, notes, t0, t1, amp, { att = 0.6, rel = 0.8, harm = 3, vib = 0, det = 0.004 } = {}) {
    const i0 = Math.max(0, Math.floor(t0 * sr)), i1 = Math.min(o.length, Math.floor((t1 + rel) * sr));
    const fs = notes.map((x) => (typeof x === 'string' ? hz(x) : x));
    const a = amp / Math.sqrt(fs.length);
    const ph = new Float64Array(fs.length * 2);
    for (let i = i0; i < i1; i++) {
        const t = i / sr, u = t - t0;
        const env = Math.min(1, u / att) * (t < t1 ? 1 : Math.max(0, 1 - (t - t1) / rel));
        if (env <= 0) continue;
        const vb = vib ? 1 + vib * sn(5.1 * t) : 1;
        let v = 0;
        for (let k = 0; k < fs.length; k++) {
            ph[2 * k] += (fs[k] * vb) / sr;
            ph[2 * k + 1] += (fs[k] * (1 + det) * vb) / sr;
            for (let h = 1; h <= harm; h++) v += (sn(ph[2 * k] * h) + sn(ph[2 * k + 1] * h)) / (h * h);
        }
        o[i] += v * a * env * 0.5;
    }
}
/** A brass note: its harmonics open with the breath (a swell, then steady). */
function brass(o, sr, f, t0, len, amp) {
    const i0 = Math.floor(t0 * sr), n = Math.min(o.length - i0, Math.floor((len + 0.25) * sr));
    for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.08) * (t < len ? 1 : Math.max(0, 1 - (t - len) / 0.25));
        const open = Math.min(1, t / 0.15);
        const w = 0.35 + 0.4 * open;
        let v = 0, a = 1;
        for (let h = 1; h <= 6; h++, a *= w) v += (sn(f * h * t) * a) / h;
        o[i0 + i] += v * env * amp;
    }
}
/** A drum: a falling tone and a puff of noise (`f` its pitch: a timpani ~60, a tom ~120). */
function drum(o, sr, t0, amp, f = 70, len = 0.9, rand) {
    const i0 = Math.floor(t0 * sr), n = Math.min(o.length - i0, Math.floor(len * sr));
    let ph = 0, lp = 0;
    for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += (f * (1 + 0.6 * Math.exp(-t * 25))) / sr;
        lp += (rand() - lp) * 0.25;
        o[i0 + i] += amp * (sn(ph) * Math.exp(-t * (4 / len)) + lp * 0.6 * Math.exp(-t * 40));
    }
}
/** Noise through a moving low-pass: `cut(u)` 0…1 its brightness, `env(u)` its loudness over u = 0…1. */
function noise(o, sr, t0, len, amp, cut, env, rand) {
    const i0 = Math.floor(t0 * sr), n = Math.min(o.length - i0, Math.floor(len * sr));
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
        const u = i / n, c = cut(u);
        lp += (rand() - lp) * c; lp2 += (lp - lp2) * c;
        o[i0 + i] += lp2 * amp * env(u) * (1.2 / Math.sqrt(c + 0.02));
    }
}
/** A gliding tone (`f(u)` its pitch, `env(u)` loudness), `harm` harmonics. */
function glide(o, sr, t0, len, amp, f, env, harm = 1) {
    const i0 = Math.floor(t0 * sr), n = Math.min(o.length - i0, Math.floor(len * sr));
    let ph = 0;
    for (let i = 0; i < n; i++) {
        const u = i / n;
        ph += f(u) / sr;
        let v = 0;
        for (let h = 1; h <= harm; h++) v += sn(ph * h) / h;
        o[i0 + i] += v * amp * env(u);
    }
}
const swell = (a, b) => (u) => Math.min(1, u / a) * Math.min(1, (1 - u) / b);

/** The finished sound: the ends faded, loud as `rms` (a tune) or as `peak` (an effect), never clipping. */
function finish(o, sr, { rms = 0, peak = 0.7 } = {}) {
    const f = Math.min(o.length, Math.floor(sr * 0.05));
    for (let i = 0; i < f; i++) o[o.length - 1 - i] *= i / f;
    let p = 0, s = 0;
    for (let i = 0; i < o.length; i++) { const a = Math.abs(o[i]); if (a > p) p = a; s += o[i] * o[i]; }
    if (!p) return o;
    let g = rms ? rms / Math.sqrt(s / o.length) : peak / p;
    if (p * g > 0.95) g = 0.95 / p;
    for (let i = 0; i < o.length; i++) o[i] *= g;
    return o;
}
/** A loop: its tail crossfaded into its head (no click where it wraps). */
function loopSeam(o, sr, fade = 0.3) {
    const f = Math.floor(sr * fade), n = o.length - f, out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = o[i];
    for (let i = 0; i < f; i++) { const k = i / f; out[i] = o[i] * k + o[n + i] * (1 - k); }
    return out;
}
const buf = (sr, s) => new Float32Array(Math.ceil(sr * s));
/** A melody: [beat, note, beats?] rows, `beat` s, played on `play(f, t, len)`. */
function melody(rows, beat, t0, play) { for (const [b, n, l = 1] of rows) play(hz(n), t0 + b * beat, l * beat); }

// ------------------------------------------------------------------ the tunes
const TUNES = {
    /** «To the Sun»: a warm bright choir rising in D major, bells climbing into the light. */
    thSun(sr) {
        const o = buf(sr, 8), r = rng(11);
        pad(o, sr, ['D3', 'A3', 'D4', 'F#4'], 0, 2.6, 0.5, { att: 1.2, vib: 0.004, harm: 2 });
        pad(o, sr, ['G3', 'B3', 'D4', 'G4'], 2.4, 4.4, 0.5, { att: 0.8, vib: 0.004, harm: 2 });
        pad(o, sr, ['D3', 'A3', 'D4', 'F#4', 'A4', 'D5'], 4.2, 6.6, 0.6, { att: 0.6, rel: 1.4, vib: 0.004, harm: 2 });
        melody([[0, 'A5'], [1, 'D6'], [2, 'F#6', 2], [4, 'G6'], [5, 'F#6'], [6, 'E6'], [7, 'D6', 1], [8, 'A6', 3]], 0.55, 0.3, (f, t) => bell(o, sr, f, t, 0.18, 2.2));
        for (let k = 0; k < 10; k++) bell(o, sr, hz('D7') * (1 + 0.5 * (k % 3)), 4.8 + k * 0.12, 0.05, 1.2);
        noise(o, sr, 0, 8, 0.015, () => 0.5, swell(0.5, 0.4), r); // (the warmth of its air)
        return finish(o, sr, { rms: 0.07 });
    },
    /** «Let it rain»: drops of a harp in A minor over a soft grey pad. */
    thRain(sr) {
        const o = buf(sr, 9), r = rng(23);
        const ch = [['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['C3', 'G3', 'E4'], ['G3', 'B3', 'D4']];
        ch.forEach((c, k) => pad(o, sr, c, k * 2, k * 2 + 2, 0.35, { att: 0.9, rel: 1.2, harm: 2 }));
        melody([[0, 'E5'], [0.5, 'A5'], [1, 'C6'], [2, 'B5'], [3, 'A5'], [4, 'C6'], [4.5, 'A5'], [5, 'F5'], [6, 'G5'], [7, 'E5', 2],
            [8, 'E5'], [8.5, 'G5'], [9, 'C6'], [10, 'D6'], [11, 'B5'], [12, 'A5'], [12.5, 'B5'], [13, 'C6'], [14, 'B5'], [15, 'A5', 2]], 0.5, 0.2, (f, t) => pluck(o, sr, f, t, 0.3, 1.8, r));
        for (let k = 0; k < 26; k++) bell(o, sr, 1800 + 1600 * Math.abs(r()), 0.3 + k * 0.32 + 0.1 * r(), 0.025, 0.4, 0); // (drops)
        return finish(o, sr, { rms: 0.065 });
    },
    /** «Alive»: dark — a low drone beating, a slow falling cello line, the wood creaking, a heart beginning to beat. */
    thAlive(sr) {
        const o = buf(sr, 8.5), r = rng(31);
        pad(o, sr, ['D2', 'A2'], 0, 7.4, 0.55, { att: 1.5, rel: 1, harm: 4, det: 0.006 });
        melody([[0, 'D3', 2], [2, 'C3', 1], [3, 'Bb2', 1], [4, 'A2', 2], [6, 'F3', 1], [7, 'E3', 1], [8, 'D3', 3]], 0.62, 0.8, (f, t, l) => brass(o, sr, f, t, l, 0.22));
        for (const at of [1.2, 3.1, 5.3]) noise(o, sr, at, 0.9, 0.2, (u) => 0.02 + 0.05 * u, swell(0.4, 0.4), r), glide(o, sr, at, 0.9, 0.08, (u) => 90 + 40 * Math.sin(u * 9), swell(0.3, 0.3), 5); // (the creak)
        for (let k = 0; k < 6; k++) { drum(o, sr, 3.6 + k * 0.75, 0.35, 48, 0.4, r); drum(o, sr, 3.8 + k * 0.75, 0.22, 48, 0.35, r); } // (the heart)
        pad(o, sr, ['D4', 'F4', 'A4'], 5.6, 7.4, 0.14, { att: 1.4, vib: 0.006, harm: 1 }); // (a far choir)
        return finish(o, sr, { rms: 0.07 });
    },
    /** «Give Me My Power»: solemn and dark — an organ in D minor, timpani, a ghostly choir, then the power back: D major. */
    thPower(sr) {
        const o = buf(sr, 10), r = rng(41);
        const ch = [['D3', 'A3', 'D4', 'F4'], ['Bb2', 'F3', 'Bb3', 'D4'], ['G2', 'D3', 'G3', 'Bb3'], ['A2', 'E3', 'A3', 'C#4']];
        ch.forEach((c, k) => pad(o, sr, c, k * 1.7, k * 1.7 + 1.7, 0.55, { att: 0.25, rel: 0.4, harm: 5, det: 0.002 }));
        pad(o, sr, ['D2', 'D3', 'A3', 'D4', 'F#4', 'A4', 'D5'], 6.8, 8.6, 0.75, { att: 0.15, rel: 1.4, harm: 5, det: 0.002 });
        pad(o, sr, ['A4', 'D5'], 1, 6.6, 0.1, { att: 2, vib: 0.008, harm: 1 });
        for (const at of [0, 1.7, 3.4, 5.1, 5.95, 6.8]) drum(o, sr, at, 0.5, 58, 1.1, r);
        melody([[0, 'F5', 2], [2, 'D5', 2], [4, 'Bb4', 2], [6, 'C#5', 2], [8, 'D5', 3]], 0.85, 0, (f, t, l) => brass(o, sr, f, t, l, 0.09));
        return finish(o, sr, { rms: 0.075 });
    },
    /** «Protection House»: a clear, guarding tune — a harp's rising E major, a bell's call, a soft light pad. */
    thWard(sr) {
        const o = buf(sr, 6.5), r = rng(53);
        pad(o, sr, ['E3', 'B3', 'E4', 'G#4'], 0, 5, 0.4, { att: 1, rel: 1.4, harm: 2 });
        const arp = ['E4', 'G#4', 'B4', 'E5', 'G#5', 'B5', 'E6'];
        for (let k = 0; k < 14; k++) pluck(o, sr, hz(arp[k % 7]), 0.1 + k * 0.18, 0.22, 1.6, r);
        melody([[0, 'B5', 1], [1, 'E6', 1], [2, 'D#6', 0.5], [2.5, 'B5', 0.5], [3, 'G#6', 2]], 0.6, 2.7, (f, t) => bell(o, sr, f, t, 0.17, 2.4));
        return finish(o, sr, { rms: 0.065 });
    },
    /** «Total Destruction»: grim — low brass pulses on a tritone, war drums quickening, falling cries. */
    thDestroy(sr) {
        const o = buf(sr, 8), r = rng(61);
        pad(o, sr, ['C2', 'G2', 'C3'], 0, 6.8, 0.5, { att: 0.8, rel: 1, harm: 6, det: 0.008 });
        melody([[0, 'C3', 1.5], [2, 'F#3', 1.5], [4, 'C3', 1], [5, 'Eb3', 1], [6, 'F#3', 1], [7, 'G3', 2], [9, 'C3', 3]], 0.55, 0.2, (f, t, l) => { brass(o, sr, f, t, l, 0.2); brass(o, sr, f / 2, t, l, 0.15); });
        let t = 0.2;
        for (let k = 0; t < 7; k++) { drum(o, sr, t, 0.45, k % 2 ? 110 : 62, 0.6, r); t += Math.max(0.18, 0.7 - k * 0.04); }
        for (const at of [2.2, 4.6]) glide(o, sr, at, 1.6, 0.06, (u) => 1400 - 900 * u, swell(0.2, 0.3), 3);
        return finish(o, sr, { rms: 0.08 });
    },
    /** «Flying Maxima»: out of the air — a Lydian arpeggio climbing, the pad opening, then airy and far (space). */
    thOrbit(sr) {
        const o = buf(sr, 11), r = rng(71);
        const sc = ['C3', 'G3', 'D4', 'F#4', 'A4', 'B4', 'E5', 'F#5', 'A5', 'B5', 'D6', 'F#6', 'A6'];
        for (let k = 0; k < 26; k++) bell(o, sr, hz(sc[Math.min(sc.length - 1, (k >> 1) + (k & 1) * 2)]), 0.2 + k * 0.24, 0.13, 2, 0.2);
        pad(o, sr, ['C3', 'G3', 'D4', 'E4'], 0, 4, 0.4, { att: 1.5, harm: 3 });
        pad(o, sr, ['D3', 'A3', 'E4', 'F#4'], 3.6, 6.5, 0.45, { att: 1, harm: 3 });
        pad(o, sr, ['C4', 'G4', 'D5', 'F#5', 'B5'], 6.2, 9.4, 0.35, { att: 1.2, rel: 1.6, harm: 1, vib: 0.003 });
        noise(o, sr, 0, 6.5, 0.03, (u) => 0.02 + 0.3 * u * u, (u) => Math.min(1, u * 2) * (1 - u), r); // (the air left behind)
        return finish(o, sr, { rms: 0.065 });
    },
    /** «Create a Planet»: epic — a timpani roll, a brass fanfare in C, a great choir and the last chord. */
    thPlanet(sr) {
        const o = buf(sr, 12.5), r = rng(83);
        for (let k = 0; k < 24; k++) drum(o, sr, k * 0.09, 0.08 + 0.2 * (k / 24), 60, 0.5, r);
        melody([[0, 'C4', 1], [1, 'G4', 1], [2, 'C5', 2], [4, 'E5', 1], [5, 'D5', 1], [6, 'G4', 2], [8, 'A4', 1], [9, 'C5', 1], [10, 'F5', 2], [12, 'E5', 1], [13, 'D5', 1], [14, 'G5', 2]],
            0.42, 2.2, (f, t, l) => { brass(o, sr, f, t, l, 0.17); brass(o, sr, f / 2, t, l, 0.1); });
        pad(o, sr, ['C3', 'G3', 'C4', 'E4'], 2.2, 5.5, 0.4, { att: 1, vib: 0.005, harm: 2 });
        pad(o, sr, ['F3', 'A3', 'C4', 'F4'], 5.4, 7.2, 0.4, { att: 0.6, vib: 0.005, harm: 2 });
        pad(o, sr, ['G3', 'B3', 'D4', 'G4'], 7, 8.9, 0.45, { att: 0.5, vib: 0.005, harm: 2 });
        pad(o, sr, ['C2', 'C3', 'G3', 'C4', 'E4', 'G4', 'C5', 'E5'], 8.9, 10.8, 0.75, { att: 0.2, rel: 1.6, vib: 0.005, harm: 3 });
        for (const at of [8.9, 9.35, 9.8]) drum(o, sr, at, 0.6, 55, 1.4, r);
        for (let k = 0; k < 8; k++) bell(o, sr, hz(['C6', 'E6', 'G6', 'C7'][k % 4]), 8.9 + k * 0.1, 0.07, 2);
        return finish(o, sr, { rms: 0.08 });
    },
    /** «Terraform» / «Enlarge Planet»: flowing — harp runs over Eb – Bb – Cm – Ab, a bell's tune, a grounded bass. */
    thTerraform(sr) {
        const o = buf(sr, 10), r = rng(97);
        const ch = [['Eb3', 'Bb3', 'Eb4', 'G4'], ['Bb2', 'F3', 'Bb3', 'D4'], ['C3', 'G3', 'C4', 'Eb4'], ['Ab2', 'Eb3', 'Ab3', 'C4']];
        ch.forEach((c, k) => {
            pad(o, sr, c, k * 2.1, k * 2.1 + 2.1, 0.38, { att: 0.7, rel: 1, harm: 2 });
            for (let j = 0; j < 8; j++) pluck(o, sr, hz(c[j % 4]) * (j >= 4 ? 2 : 1), k * 2.1 + j * 0.25, 0.16, 1.4, r);
            drum(o, sr, k * 2.1, 0.25, 50, 1.2, r);
        });
        melody([[0, 'G5', 2], [2, 'Bb5', 1], [3, 'C6', 1], [4, 'D6', 2], [6, 'F6', 2], [8, 'Eb6', 1], [9, 'D6', 1], [10, 'C6', 2], [12, 'Eb6', 3]], 0.55, 0.3, (f, t) => bell(o, sr, f, t, 0.15, 2));
        return finish(o, sr, { rms: 0.07 });
    },
    /** «Let the Hellfire Come»: a low choir in Phrygian E, a brass tritone, the drums of the deep. */
    thHell(sr) {
        const o = buf(sr, 8), r = rng(101);
        pad(o, sr, ['E2', 'B2', 'E3', 'G3'], 0, 3, 0.45, { att: 0.8, vib: 0.007, harm: 3 });
        pad(o, sr, ['F2', 'C3', 'F3', 'A3'], 3, 4.6, 0.45, { att: 0.3, vib: 0.007, harm: 3 });
        pad(o, sr, ['E2', 'B2', 'E3', 'G3', 'Bb3'], 4.6, 6.8, 0.5, { att: 0.3, rel: 1.2, vib: 0.007, harm: 4 });
        melody([[0, 'E4', 1], [1, 'F4', 1], [2, 'E4', 2], [4, 'Bb3', 2], [6, 'B3', 1], [7, 'C4', 1], [8, 'B3', 3]], 0.55, 0.6, (f, t, l) => brass(o, sr, f, t, l, 0.14));
        for (let k = 0; k < 9; k++) drum(o, sr, 0.3 + k * 0.72 + (k % 3 === 2 ? -0.24 : 0), 0.4, 52, 0.9, r);
        noise(o, sr, 0, 8, 0.05, () => 0.05, swell(0.3, 0.3), r); // (the roar under it)
        return finish(o, sr, { rms: 0.08 });
    },
    /** «Water Vortex Super Maxima» (the storm): rolling D minor, harp runs like waves, the drums of the swell. */
    thStorm(sr) {
        const o = buf(sr, 8.5), r = rng(113);
        const ch = [['D3', 'A3', 'D4', 'F4'], ['Bb2', 'F3', 'Bb3', 'D4'], ['C3', 'G3', 'C4', 'E4'], ['A2', 'E3', 'A3', 'C#4']];
        ch.forEach((c, k) => {
            pad(o, sr, c, k * 1.8, k * 1.8 + 1.8, 0.4, { att: 0.5, rel: 1, harm: 3 });
            for (let j = 0; j < 12; j++) pluck(o, sr, hz(c[j % 4]) * (j >= 8 ? 4 : j >= 4 ? 2 : 1), k * 1.8 + j * 0.1, 0.12, 1, r); // (a wave running up)
            drum(o, sr, k * 1.8, 0.4, 56, 1.2, r);
            noise(o, sr, k * 1.8, 1.8, 0.07, (u) => 0.03 + 0.1 * Math.sin(u * Math.PI), (u) => Math.sin(u * Math.PI), r);
        });
        pad(o, sr, ['D3', 'A3', 'D4', 'F4', 'A4'], 7.2, 7.4, 0.4, { att: 0.1, rel: 1, harm: 3 });
        return finish(o, sr, { rms: 0.075 });
    },
};

// ------------------------------------------------------------------ the short effects
const FX = {
    /** «Люмос»: a soft light rising — a shimmer gliding up. */
    fxLumos(sr) { const o = buf(sr, 0.8); glide(o, sr, 0, 0.8, 0.3, (u) => 900 + 1500 * u, (u) => Math.min(1, u * 8) * (1 - u), 2); bell(o, sr, 2637, 0.12, 0.15, 0.6); return finish(o, sr, { peak: 0.6 }); },
    /** «Люмос Максима»: a big light — a chord of shimmers swelling. */
    fxLumosMax(sr) { const o = buf(sr, 1.4); for (const f of [660, 990, 1320]) glide(o, sr, 0, 1.4, 0.2, (u) => f * (1 + u), (u) => Math.min(1, u * 5) * (1 - u), 2); for (let k = 0; k < 5; k++) bell(o, sr, 1760 * (1 + k * 0.25), 0.2 + k * 0.08, 0.1, 0.9); return finish(o, sr, { peak: 0.65 }); },
    /** «Нокс»: the light blown out — a soft falling puff. */
    fxNox(sr) { const o = buf(sr, 0.5), r = rng(3); noise(o, sr, 0, 0.5, 0.3, (u) => 0.3 * (1 - u) + 0.02, swell(0.1, 0.6), r); glide(o, sr, 0, 0.5, 0.2, (u) => 1200 - 900 * u, swell(0.05, 0.8)); return finish(o, sr, { peak: 0.5 }); },
    /** «Раскрой секреты»: a mysterious whole-tone sparkle over a low hum. */
    fxReveal(sr) { const o = buf(sr, 1.6); pad(o, sr, [110, 165], 0, 1, 0.4, { att: 0.3, rel: 0.5 }); ['C6', 'D6', 'E6', 'F#6', 'G#6', 'A#6'].forEach((n, k) => bell(o, sr, hz(n), 0.1 + k * 0.11, 0.12, 1)); return finish(o, sr, { peak: 0.6 }); },
    /** «Protection»: a glassy shield blooming — a hum swelling with a bright ping. */
    fxShield(sr) { const o = buf(sr, 0.9); glide(o, sr, 0, 0.9, 0.35, (u) => 330 + 30 * Math.sin(u * 40), (u) => Math.min(1, u * 10) * (1 - u), 4); bell(o, sr, 1975, 0.02, 0.2, 0.8, 0.5); return finish(o, sr, { peak: 0.6 }); },
    /** «Invisibility»: a shimmering hiss falling away, a bell fading. */
    fxInvis(sr) { const o = buf(sr, 1.3), r = rng(5); noise(o, sr, 0, 1.3, 0.25, (u) => 0.6 - 0.5 * u, swell(0.15, 0.7), r); glide(o, sr, 0, 1.3, 0.12, (u) => 2400 - 1600 * u, swell(0.1, 0.8), 2); return finish(o, sr, { peak: 0.55 }); },
    /** «Rescue»: a warm healing chime — three notes rising over a soft chord. */
    fxHeal(sr) { const o = buf(sr, 1.6); pad(o, sr, ['C4', 'E4', 'G4'], 0, 0.8, 0.3, { att: 0.2, rel: 0.7, harm: 1 }); ['C5', 'E5', 'G5', 'C6'].forEach((n, k) => bell(o, sr, hz(n), k * 0.13, 0.16, 1.2, 0.15)); return finish(o, sr, { peak: 0.6 }); },
    /** «Air Bubble»: bubbles — little chirps rising. */
    fxBubble(sr) { const o = buf(sr, 0.8), r = rng(7); for (let k = 0; k < 9; k++) { const f = 300 + 400 * Math.abs(r()), t = k * 0.07 + 0.03 * r() + 0.03; glide(o, sr, Math.max(0, t), 0.09, 0.3, (u) => f * (1 + 1.6 * u), (u) => Math.sin(u * Math.PI)); } return finish(o, sr, { peak: 0.6 }); },
    /** «Остолбеней»: a sharp red zap — a bright buzz falling and a crack. */
    fxStupefy(sr) { const o = buf(sr, 0.5), r = rng(9); glide(o, sr, 0, 0.45, 0.35, (u) => 1500 - 1100 * u, swell(0.02, 0.6), 6); noise(o, sr, 0, 0.12, 0.5, () => 0.8, swell(0.05, 0.8), r); return finish(o, sr, { peak: 0.7 }); },
    /** «Авада Кедавра»: a dark rushing whoosh, a deep falling tone and a thin eerie note. */
    fxAvada(sr) { const o = buf(sr, 1), r = rng(13); noise(o, sr, 0, 1, 0.35, (u) => 0.03 + 0.15 * Math.sin(u * Math.PI), swell(0.2, 0.5), r); glide(o, sr, 0, 1, 0.3, (u) => 160 - 100 * u, swell(0.1, 0.5), 3); glide(o, sr, 0.05, 0.9, 0.07, () => 1661, swell(0.3, 0.5)); return finish(o, sr, { peak: 0.7 }); },
    /** «Экспеллиармус»: a whip crack and a quick rising zing. */
    fxExpel(sr) { const o = buf(sr, 0.45), r = rng(17); noise(o, sr, 0, 0.06, 0.9, () => 0.95, (u) => 1 - u, r); glide(o, sr, 0.02, 0.4, 0.3, (u) => 600 + 1800 * u, swell(0.05, 0.6), 3); return finish(o, sr, { peak: 0.7 }); },
    /** «Disarmor»: a zap and the steel ringing loose. */
    fxDisarmor(sr) { const o = buf(sr, 0.8), r = rng(19); glide(o, sr, 0, 0.3, 0.3, (u) => 900 - 400 * u, swell(0.05, 0.6), 4); for (const [t, f] of [[0.12, 2300], [0.24, 1900], [0.33, 2700]]) bell(o, sr, f, t, 0.18, 0.4, 0.8); noise(o, sr, 0, 0.05, 0.4, () => 0.9, (u) => 1 - u, r); return finish(o, sr, { peak: 0.65 }); },
    /** «Wind»: a gust — noise through a sweeping resonance. */
    fxWind(sr) { const o = buf(sr, 1), r = rng(29); noise(o, sr, 0, 1, 0.5, (u) => 0.04 + 0.3 * Math.sin(u * Math.PI), (u) => Math.sin(u * Math.PI) ** 0.7, r); glide(o, sr, 0, 1, 0.04, (u) => 500 + 500 * Math.sin(u * Math.PI), (u) => Math.sin(u * Math.PI)); return finish(o, sr, { peak: 0.6 }); },
    /** «Overgrown»: leaves rustling and wood groaning as it grows. */
    fxGrow(sr) { const o = buf(sr, 1.5), r = rng(37); noise(o, sr, 0, 1.5, 0.25, () => 0.5, (u) => Math.min(1, u * 4) * (1 - u) * (0.6 + 0.4 * Math.abs(Math.sin(u * 30))), r); glide(o, sr, 0.1, 1.3, 0.2, (u) => 80 + 70 * u + 8 * Math.sin(u * 60), swell(0.2, 0.3), 6); return finish(o, sr, { peak: 0.6 }); },
    /** «Wall Rise» (Breakthrough): stone grinding up, knocks as it settles. */
    fxStone(sr) { const o = buf(sr, 1.4), r = rng(43); noise(o, sr, 0, 1.2, 0.4, () => 0.06, swell(0.2, 0.2), r); glide(o, sr, 0, 1.2, 0.2, (u) => 45 + 30 * u + 6 * Math.sin(u * 90), swell(0.2, 0.2), 5); drum(o, sr, 1.15, 0.5, 70, 0.25, r); return finish(o, sr, { peak: 0.7 }); },
    /** «Брейнрот»: a goofy wobbling boing. */
    fxBrainrot(sr) { const o = buf(sr, 0.9); glide(o, sr, 0, 0.9, 0.35, (u) => 220 + 260 * Math.sin(u * Math.PI) + 60 * Math.sin(u * 50), swell(0.03, 0.4), 3); return finish(o, sr, { peak: 0.6 }); },
    /** «Акцио»: air pulled in (a whoosh rising toward you) and a soft pop as it comes. */
    fxAccio(sr) { const o = buf(sr, 0.55), r = rng(47); noise(o, sr, 0, 0.45, 0.4, (u) => 0.03 + 0.4 * u, (u) => u * u, r); glide(o, sr, 0.42, 0.12, 0.3, (u) => 500 + 300 * u, (u) => 1 - u); return finish(o, sr, { peak: 0.6 }); },
    /** «Suit Up»: plates clinking on one after another, a last bright «shing». */
    fxSuitUp(sr) { const o = buf(sr, 1.3), r = rng(59); for (let k = 0; k < 5; k++) { bell(o, sr, 1300 + 300 * k + 100 * r(), k * 0.14, 0.2, 0.3, 0.9); drum(o, sr, k * 0.14, 0.15, 160, 0.12, r); } bell(o, sr, 3135, 0.8, 0.18, 0.6, 0.6); return finish(o, sr, { peak: 0.65 }); },
    /** «Change Color»: a sparkle running up the scale. */
    fxColor(sr) { const o = buf(sr, 1); ['C6', 'D6', 'E6', 'G6', 'A6', 'C7'].forEach((n, k) => bell(o, sr, hz(n), k * 0.06, 0.13, 0.6)); return finish(o, sr, { peak: 0.55 }); },
    /** The building spells (floor, wall, roof…): a block knocking into place under a little sparkle. */
    fxBuild(sr) { const o = buf(sr, 0.9), r = rng(67); drum(o, sr, 0, 0.6, 140, 0.3, r); bell(o, sr, 1568, 0.06, 0.12, 0.6); bell(o, sr, 2093, 0.14, 0.1, 0.6); return finish(o, sr, { peak: 0.6 }); },
    /** «Create a Board»: wood shaped — two knocks and a sparkle. */
    fxCreate(sr) { const o = buf(sr, 1), r = rng(73); drum(o, sr, 0, 0.5, 180, 0.25, r); drum(o, sr, 0.16, 0.45, 210, 0.25, r); bell(o, sr, 1760, 0.3, 0.12, 0.6); bell(o, sr, 2637, 0.4, 0.09, 0.6); return finish(o, sr, { peak: 0.6 }); },
    /** «Атака» (servants, the snowmen): a short war-horn call. */
    fxCommand(sr) { const o = buf(sr, 0.9); brass(o, sr, hz('G3'), 0, 0.22, 0.4); brass(o, sr, hz('D4'), 0.26, 0.4, 0.45); return finish(o, sr, { peak: 0.6 }); },
    /** «Паузин»: an air brake — a soft whoom settling. */
    fxPause(sr) { const o = buf(sr, 0.6), r = rng(79); noise(o, sr, 0, 0.6, 0.3, (u) => 0.15 * (1 - u) + 0.02, swell(0.05, 0.7), r); glide(o, sr, 0, 0.6, 0.2, (u) => 300 - 150 * u, swell(0.05, 0.7)); return finish(o, sr, { peak: 0.5 }); },
    /** «Стоп»: two soft bell notes falling — the spell let go. */
    fxStop(sr) { const o = buf(sr, 0.8); bell(o, sr, hz('E5'), 0, 0.15, 0.6, 0.1); bell(o, sr, hz('A4'), 0.12, 0.15, 0.7, 0.1); return finish(o, sr, { peak: 0.45 }); },
    /** «Максима» (more push in a duel): a rising power-up and a chord. */
    fxMaxima(sr) { const o = buf(sr, 0.8), r = rng(83); noise(o, sr, 0, 0.5, 0.3, (u) => 0.05 + 0.4 * u, (u) => u, r); pad(o, sr, ['C4', 'G4', 'C5'], 0.45, 0.5, 0.5, { att: 0.02, rel: 0.3, harm: 4 }); return finish(o, sr, { peak: 0.65 }); },
    /** Lifted thing let go (Levitation's end): a soft falling sigh. */
    endLev(sr) { const o = buf(sr, 0.6); glide(o, sr, 0, 0.6, 0.25, (u) => 700 - 450 * u, swell(0.05, 0.7), 2); return finish(o, sr, { peak: 0.4 }); },
    /** The living tree is a tree again: a long wood groan and a dull thud. */
    endAlive(sr) { const o = buf(sr, 1.4), r = rng(89); glide(o, sr, 0, 1.1, 0.25, (u) => 120 - 60 * u + 6 * Math.sin(u * 70), swell(0.1, 0.3), 6); drum(o, sr, 1, 0.5, 55, 0.4, r); return finish(o, sr, { peak: 0.6 }); },
};

// ------------------------------------------------------------------ the loops (held spells)
const LOOPS = {
    /** «Левиоса» held: a soft airy hum with a slow tremble. */
    loopLev(sr) { const o = buf(sr, 2.3), r = rng(101); pad(o, sr, [440, 660], 0, 2.3, 0.3, { att: 0.01, rel: 0, harm: 1, vib: 0.004 }); noise(o, sr, 0, 2.3, 0.05, () => 0.3, () => 1, r); return finish(loopSeam(o, sr), sr, { peak: 0.4 }); },
    /** A living tree: the wood's slow creak over a low drone. */
    loopAlive(sr) { const o = buf(sr, 3.3); pad(o, sr, [55, 82.5], 0, 3.3, 0.4, { att: 0.01, rel: 0, harm: 4 }); glide(o, sr, 0.6, 1.4, 0.15, (u) => 100 + 30 * u + 5 * Math.sin(u * 50), (u) => Math.sin(u * Math.PI), 5); return finish(loopSeam(o, sr), sr, { peak: 0.4 }); },
    /** A building growing: a light magic shimmer. */
    loopBuild(sr) { const o = buf(sr, 2.3); pad(o, sr, [220, 330, 880], 0, 2.3, 0.25, { att: 0.01, rel: 0, harm: 1, vib: 0.006 }); return finish(loopSeam(o, sr), sr, { peak: 0.35 }); },
    /** A beam / lightning held: an electric hum and a little crackle. */
    loopBeam(sr) { const o = buf(sr, 2.3), r = rng(103); glide(o, sr, 0, 2.3, 0.3, () => 100, () => 1, 7); for (let k = 0; k < 14; k++) noise(o, sr, Math.abs(r()) * 2.2, 0.03, 0.4, () => 0.9, (u) => 1 - u, r); return finish(loopSeam(o, sr), sr, { peak: 0.4 }); },
    /** Fire held on the wand: a crackling roar. */
    loopFire(sr) { const o = buf(sr, 2.3), r = rng(107); noise(o, sr, 0, 2.3, 0.3, () => 0.08, () => 1, r); for (let k = 0; k < 30; k++) noise(o, sr, Math.abs(r()) * 2.25, 0.015, 0.5, () => 0.9, (u) => 1 - u, r); return finish(loopSeam(o, sr), sr, { peak: 0.45 }); },
    /** The water ball held: a soft swirl of water. */
    loopWater(sr) { const o = buf(sr, 2.3), r = rng(109); noise(o, sr, 0, 2.3, 0.3, (u) => 0.08 + 0.05 * Math.sin(u * 2 * Math.PI * 3), () => 1, r); for (let k = 0; k < 8; k++) glide(o, sr, Math.abs(r()) * 2.1, 0.08, 0.15, (u) => 400 + 500 * u, (u) => Math.sin(u * Math.PI)); return finish(loopSeam(o, sr), sr, { peak: 0.4 }); },
    /** Flying: the wind rushing past. */
    loopFlight(sr) { const o = buf(sr, 3.3), r = rng(113); noise(o, sr, 0, 3.3, 0.4, (u) => 0.05 + 0.04 * Math.sin(u * 2 * Math.PI), () => 1, r); return finish(loopSeam(o, sr), sr, { peak: 0.45 }); },
    /** Space: a quiet far pad (fifths) and now and then a star's chime — the silence is not dead. */
    spaceAmb(sr) {
        const o = buf(sr, 12.5);
        pad(o, sr, ['C3', 'G3', 'D4'], 0, 6.5, 0.3, { att: 3, rel: 3, harm: 1 });
        pad(o, sr, ['Ab2', 'Eb3', 'Bb3'], 6, 12.5, 0.3, { att: 3, rel: 0, harm: 1 });
        for (const [t, n] of [[1.5, 'G6'], [4.2, 'D7'], [7.7, 'Eb6'], [10.3, 'Bb6']]) bell(o, sr, hz(n), t, 0.05, 2.5, 0.1);
        return finish(loopSeam(o, sr, 0.5), sr, { rms: 0.05 });
    },
};

/** Every sound made here: key → (sr) → samples. */
export const SPELL_GEN = { ...TUNES, ...FX, ...LOOPS };
export const TUNE_KEYS = Object.keys(TUNES);

/**
 * The card «spell → its sound» (every spell that can be said). `own`: the sounds its own module plays
 * (SoundManager keys / methods), `cast` / `theme`: added here (SPELL_GEN keys — or a SoundManager key,
 * like 'house_block') — played when the spell works, from the caster's place, heard by everyone near.
 */
export const SPELL_SOUND = {
    // the great spells: their own tunes
    CreateHouse: { own: ['houseTheme', 'houseHum', 'houseDone'] }, ImproveHouse: { own: ['houseTheme', 'houseHum', 'houseDone'] },
    CreateCastle: { own: ['castleTheme', 'houseHum', 'rumble'] },
    IceCastle: { own: ['iceBell', 'iceFloor', 'iceDone'] }, IceBridge: { own: ['iceBell', 'iceFloor', 'iceChime'] },
    CircleAttack: { own: ['circleAttack', 'rumble'] }, CircleAttackMaxima: { own: ['circleAttack', 'rumble'] },
    Inspirius: { own: ['inspCast', 'inspZap', 'inspBlast'] },
    Snowman: { own: ['snowman'] },
    ToTheSun: { own: ['magic'], theme: 'thSun' },
    LetItRain: { own: ['cast', 'rain'], theme: 'thRain' },
    Alive: { theme: 'thAlive' }, AliveMaxima: { theme: 'thAlive', rate: 0.85 },
    GiveMyPower: { own: ['magic'], theme: 'thPower' },
    ProtectionHouse: { own: ['wardHum', 'wardChime'], theme: 'thWard' }, ProtectionInvisible: { own: ['wardHum', 'wardChime'], theme: 'thWard', rate: 0.94 },
    ProtectionHouseGrant: { own: ['wardChime'], cast: 'fxShield' },
    TotalDestruction: { own: ['rumble', 'explosion'], theme: 'thDestroy' }, TotalDestructionMaxima: { own: ['rumble', 'explosion'], theme: 'thDestroy', rate: 0.9 },
    FlyingMaxima: { own: ['spaceRise'], theme: 'thOrbit' },
    CreatePlanet: { own: ['spaceRise', 'spaceGift'], theme: 'thPlanet' },
    EnlargePlanet: { own: ['spaceRise', 'spaceGift'], theme: 'thTerraform', rate: 0.9 }, TerraformPlanet: { own: ['spaceRise', 'spaceGift'], theme: 'thTerraform' },
    LevitationSuperMaxima: { own: ['spaceRise'], cast: 'fxMaxima' },
    Hellfire: { own: ['inferno', 'rumble'], theme: 'thHell' },
    WaterVortexSuperMaxima: { own: ['splash', 'waterRise'], theme: 'thStorm' },
    // the duel charges and the fights (their own short sounds; Duel.js plays them for everyone)
    Stupefy: { own: ['fxStupefy'] }, AvadaKedavra: { own: ['fxAvada'] }, Expelliarmus: { own: ['fxExpel'] }, Disarmor: { own: ['fxDisarmor'] },
    Sapira: { own: ['sapira'] }, Sands: { own: ['sand'] }, Ice: { own: ['ice'] }, Frozen: { own: ['ice'] },
    Jolt: { own: ['jolt'] }, JoltMaxima: { own: ['jolt'] }, Levitation: { own: ['cast'] }, LevitationMaxima: { own: ['cast', 'crack', 'rumble'] },
    Bombardo: { own: ['cast', 'explosion'] }, BombardoMaxima: { own: ['cast', 'explosion'] },
    Thunderwave: { own: ['thunder'] }, LightningStrike: { own: ['thunder'] }, Earthquake: { own: ['explosion'] }, EarthquakeMaxima: { own: ['explosion'] },
    Inferno: { own: ['inferno'] }, Fire: { own: ['inferno'] }, FireMaxima: { own: ['inferno'] },
    Firefighting: { own: ['splash', 'waterRise'] }, FirefightingMaxima: { own: ['splash', 'waterRise'] },
    Waterball: { own: ['waterRise', 'splash'] }, WaterForming: { own: ['waterRise'] }, WaterVortex: { own: ['splash', 'waterRise'] },
    WaveAttack: { own: ['waterRise', 'splash'] }, WaveAttackMaxima: { own: ['waterRise', 'splash'] },
    Wind: { own: ['fxWind'] }, WindMaxima: { own: ['fxWind'] }, WindImpulse: { own: ['fxWind'] }, WindImpulseMaxima: { own: ['fxWind'] },
    Overgrown: { own: ['fxGrow'] }, OvergrownMaxima: { own: ['fxGrow'] },
    Brainrot: { own: ['fxBrainrot'] }, WallRise: { own: ['fxStone'] }, WallRiseMaxima: { own: ['fxStone'] },
    Drawdown: { own: ['explosion', 'rumble'] }, DrawdownMaxima: { own: ['explosion', 'rumble'] },
    Liquidation: { own: ['splash'] }, LiquidationMaxima: { own: ['splash'] }, Stitching: { own: ['seal', 'sealChime'] },
    Alohomora: { own: ['clang'] }, AlohomoraMaxima: { own: ['clang'] }, Lock: { own: ['clang'] },
    Unfurl: { own: ['sand'] }, UnfurlMaxima: { own: ['sand'] }, Furl: { own: ['sand'] }, Up: { own: ['splash', 'sand'] },
    Accio: { own: ['fxAccio'] }, SuitUp: { own: ['fxSuitUp'] },
    // the everyday spells: a short sound when they work (added here)
    Lumos: { cast: 'fxLumos' }, LumosMaxima: { cast: 'fxLumosMax' }, Nox: { cast: 'fxNox' }, Reveal: { cast: 'fxReveal' },
    Draw: { cast: 'fxLumos', rate: 0.8 },
    Protection: { cast: 'fxShield' }, ProtectionMaxima: { cast: 'fxShield', rate: 0.8 },
    Invisibility: { cast: 'fxInvis' }, Rescue: { cast: 'fxHeal' },
    AirBubble: { cast: 'fxBubble' }, AirBubbleMaxima: { cast: 'fxBubble', rate: 0.8 },
    Breakthrough: { cast: 'fxStone' }, BreakthroughMaxima: { cast: 'fxStone', rate: 0.85 },
    Flight: { own: ['cast'] }, Pause: { cast: 'fxPause' },
    Attack: { cast: 'fxCommand' }, Maxima: { cast: 'fxMaxima' },
    CreateBed: { own: ['magic'] }, ChangeColor: { cast: 'fxColor' }, CreateBoard: { cast: 'fxCreate' },
    CreateFloor: { cast: 'fxBuild' }, CreateCeiling: { cast: 'fxBuild' }, BuildRoof: { cast: 'fxBuild' }, CreateWall: { cast: 'fxBuild' }, CreateDoor: { cast: 'fxBuild' },
    Gather: { cast: 'fxBuild', rate: 0.8 },
    Stand: { cast: 'house_block' }, Stop: { cast: 'fxStop' },
};

/** The held spells (Concentration.HELD keys): the quiet loop while held, the sound when it ends (null: its own). */
export const HELD_SOUND = {
    Levitation: { loop: 'loopLev', end: 'endLev' }, LevitationMaxima: { loop: 'loopLev', rate: 0.8, end: 'endLev' },
    PlanetMove: { loop: 'loopLev', rate: 0.6, end: 'endLev' },
    Alive: { loop: 'loopAlive', end: 'endAlive' },
    Build: { loop: 'loopBuild', end: 'fxStop' },
    Lightning: { loop: 'loopBeam', end: 'fxStop' }, Beam: { loop: 'loopBeam', end: 'fxStop' }, Drawdown: { loop: 'loopBeam', rate: 0.7, end: 'fxStop' },
    Inferno: { loop: 'loopFire', end: 'fxNox' },
    Waterball: { loop: 'loopWater', end: null },
    // (their own sounds go on while they are held: the hum of a house, the dome, the ice, the storm…)
    WaterVortex: {}, WaterStorm: {}, Hellfire: { loop: 'loopFire', rate: 0.7, end: null }, House: {}, Castle: {}, IceMagic: {}, Ward: {}, Duel: {}, Wave: {}, SailWind: {},
};
