/**
 * MusicComposer.js — the game's own music, composed and played by the game (the author 05.11: «удалить всю музыку, что есть… и написать
 * 10 мелодий — простые, в стиле игры, приятные, не мешают, но задают тон, немножко приключенческие; 10 мелодий битвы разной степени —
 * плавно переходят, если игрок вступит в бой; музыка для пещеры — тёмная; 5 для ада; 5 для города/поселения; 5 для магического
 * поселения»). The tunes themselves (their keys, modes, tempos, chords, instruments) — MusicCatalog.js; what plays when — MusicDirector.js.
 *
 * Pure (no THREE, no DOM): runs in a worker (music.worker.js) — a minute of music is ~0.3 s of work, never in a frame of the game.
 *
 * HOW A TUNE IS WRITTEN (compose):
 *   - the harmony: a chord progression per section, in scale degrees of the tune's mode (triads, sevenths where asked);
 *   - the melody: MOTIFS, not random notes — a one-bar rhythm and contour is invented (seeded), then repeated, sequenced onto the next
 *     chord (shifted to fit it), varied, and answered; strong beats land on chord tones, the rest step through the scale; a phrase of four
 *     bars ends on the fifth (a question), the next on the tonic (the answer) — the way a folk tune or a game theme is built;
 *   - sections A / B (B a new motif, higher, fuller), the form from the recipe (e.g. intro A A B A outro);
 *   - the accompaniment by role: a pad (held chords), an arpeggio (broken chords), a bass (roots, fifths, walking to the next chord),
 *     a counter-melody in the B sections, percussion patterns (folk drum, battle taiko and snare, war drums of hell).
 * HOW IT SOUNDS (render): its own small instruments — a plucked string (Karplus–Strong: lute, harp), a breathy flute, a bowed string pad
 * (detuned saws, filtered, slow swell), a choir «аа» (formant-weighted harmonics), an FM bell / celesta, a soft bass, a brass stab, a deep
 * drone; drums (kick, taiko, snare, frame drum, shaker, cymbal swell); a stereo field (pans), a hall reverb (Schroeder: combs + all-passes),
 * a gentle limiter. Loudness by the kind (the adventure soft under the game, the battle fuller).
 */

/** A seeded random (the same tune every time from its seed). */
export function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const MODES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    harmonic: [0, 2, 3, 5, 7, 8, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    phrygianDom: [0, 1, 4, 5, 7, 8, 10], // (the «hell» scale: a major third over the flat second)
};

export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** The MIDI note of scale degree `d` (0 = the tonic; may go below 0 / above 6 into other octaves) in `mode` over `root`. */
export function degreeNote(root, mode, d) {
    const s = MODES[mode] || MODES.major;
    const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
    return root + o * 12 + s[i];
}

/** The chord on degree `deg`: its degrees (a triad, a seventh if asked). */
export const chordDegrees = (deg, seventh = false) => (seventh ? [deg, deg + 2, deg + 4, deg + 6] : [deg, deg + 2, deg + 4]);

// ================================================================ composing
const RHYTHMS = { // (one bar in eighths; the sum is 8)
    calm: [[2, 2, 4], [3, 1, 2, 2], [2, 1, 1, 4], [4, 2, 2], [2, 2, 2, 2], [3, 1, 4], [1, 1, 2, 4]],
    lively: [[2, 1, 1, 2, 2], [1, 1, 1, 1, 2, 2], [3, 1, 2, 1, 1], [2, 2, 1, 1, 2], [1, 1, 2, 1, 1, 2]],
    battle: [[1, 1, 1, 1, 2, 2], [2, 1, 1, 2, 1, 1], [3, 3, 2], [1, 1, 2, 1, 1, 2], [2, 2, 1, 1, 1, 1]],
    sparse: [[4, 4], [6, 2], [8], [2, 6], [4, 2, 2]],
};

/**
 * A motif: a rhythm and a contour (steps in scale degrees between the notes). Its first note will sit on a chord tone.
 * `feel`: calm | lively | battle | sparse.
 */
function makeMotif(r, feel) {
    const list = RHYTHMS[feel] || RHYTHMS.calm;
    const rhythm = list[Math.floor(r() * list.length)];
    const shape = r() < 0.5 ? 1 : -1; // (an arch up, or a dip down)
    const steps = rhythm.map((_, i) => {
        if (i === 0) return 0;
        const half = i <= rhythm.length / 2 ? shape : -shape;
        const jump = r() < 0.18 ? 2 : 1; // (mostly steps, now and then a leap of a third)
        return r() < 0.15 ? 0 : half * jump;
    });
    return { rhythm, steps };
}

/** The chord tone of `chord` (degrees) nearest to degree `d`. */
function nearestChordTone(chord, d) {
    let best = d, bd = 99;
    for (const c of chord) for (let o = -14; o <= 14; o += 7) { const x = c + o; const dd = Math.abs(x - d); if (dd < bd) { bd = dd; best = x; } }
    return best;
}

/**
 * Compose: the recipe → events {t (beats), dur (beats), midi, vel 0…1, inst, pan −1…1} and the length in beats.
 * recipe: {seed, key (MIDI), mode, tempo, sections: {A: [[deg, bars]...], B: ...}, form: 'IAABAO', feel, melody (inst), pad, arp, bass,
 *          counter, perc (pattern name), seventh, lead8va (octave shift), density 0…1, intensity 0…1}
 */
export function compose(R) {
    const r = rng(R.seed);
    const ev = [];
    const bpb = 4; // (4/4)
    const motifA = makeMotif(r, R.feel), motifB = makeMotif(r, R.feel === 'calm' ? 'lively' : R.feel);
    const leadBase = 7 * (R.leadOct ?? 1); // (the melody an octave over the key's root by default)
    let t = 0, last = leadBase + 4;
    const add = (o) => ev.push(o);
    const chordAt = (deg) => chordDegrees(deg, R.seventh);
    const form = R.form || 'IAABAO';
    for (let fi = 0; fi < form.length; fi++) {
        const sec = form[fi];
        const prog = sec === 'I' || sec === 'O' ? (R.sections.I || [[0, 2]]) : R.sections[sec] || R.sections.A;
        const melodic = sec === 'A' || sec === 'B';
        const motif = sec === 'B' ? motifB : motifA;
        const lift = sec === 'B' ? 2 : 0; // (the B section a third higher)
        const variant = form.slice(0, fi).split(sec).length - 1; // (the 2nd A is varied)
        let barInSec = 0;
        const secBars = prog.reduce((a, p) => a + p[1], 0);
        for (const [deg, bars] of prog) {
            const ch = chordAt(deg);
            for (let b = 0; b < bars; b++, barInSec++) {
                const bt = t + b * bpb;
                // --- the harmony: a held pad, the bass, the broken chord
                if (R.pad && b === 0) for (const cd of ch) add({ t: bt, dur: bars * bpb, midi: degreeNote(R.key, R.mode, cd), vel: 0.32 * (R.padVel ?? 1), inst: R.pad, pan: (cd % 3 - 1) * 0.4 }); // (held through the chord: no new swell each bar)
                if (R.bass) bassBar(add, R, ch, deg, bt, bpb, r, prog, barInSec);
                if (R.arp && (melodic || sec === 'O')) arpBar(add, R, ch, bt, bpb, r);
                if (R.perc) percBar(add, R.perc, bt, bpb, R.intensity ?? 0.5, barInSec, secBars, r);
                if (R.drone && b === 0) add({ t: bt, dur: bars * bpb, midi: R.key - 12 + (R.droneFifth && deg % 2 ? 7 : 0), vel: 0.45, inst: R.drone, pan: 0 });
                // --- the melody: the motif on this chord (sequenced), varied, the phrase's end held
                if (!melodic || !R.melody) continue;
                const phraseEnd = barInSec % 4 === 3, answer = barInSec % 8 === 7;
                if (phraseEnd) {
                    // (a cadence: the fifth — a question; the tonic — the answer)
                    const target = answer ? leadBase + lift : nearestChordTone(ch, leadBase + 4 + lift);
                    const pre = target + (last > target ? 1 : -1);
                    add({ t: bt, dur: 1, midi: degreeNote(R.key, R.mode, pre), vel: 0.62, inst: R.melody, pan: 0.1 });
                    add({ t: bt + 1, dur: 3, midi: degreeNote(R.key, R.mode, target), vel: 0.7, inst: R.melody, pan: 0.1 });
                    last = target;
                    continue;
                }
                let d = nearestChordTone(ch, (barInSec % 2 ? last : leadBase + lift + (variant && barInSec % 4 === 2 ? 2 : 0)));
                let pos = 0;
                for (let i = 0; i < motif.rhythm.length; i++) {
                    const len = motif.rhythm[i] / 2; // (eighths → beats)
                    if (i > 0) d += motif.steps[i] * (variant && barInSec % 2 ? -1 : 1);
                    const strong = Math.abs(pos % 2) < 1e-9; // (on a beat: a chord tone)
                    const dd = strong ? nearestChordTone(ch, d) : d;
                    if (!(R.density != null && r() > R.density && i > 0)) add({ t: bt + pos, dur: len * 0.92, midi: degreeNote(R.key, R.mode, dd), vel: (strong ? 0.66 : 0.54) + r() * 0.08, inst: R.melody, pan: 0.1 });
                    last = dd; pos += len;
                }
                // a counter-melody in B: long notes a sixth under
                if (R.counter && sec === 'B') add({ t: bt, dur: bpb, midi: degreeNote(R.key, R.mode, nearestChordTone(ch, last - 5)), vel: 0.4, inst: R.counter, pan: -0.35 });
            }
            t += bars * bpb;
        }
    }
    return { events: ev, beats: t, tempo: R.tempo };
}

function bassBar(add, R, ch, deg, bt, bpb, r, prog, barInSec) {
    const root = degreeNote(R.key - 24, R.mode, deg), fifth = degreeNote(R.key - 24, R.mode, deg + 4);
    const v = 0.55;
    switch (R.bassStyle || 'roots') {
        case 'pulse': for (let i = 0; i < 8; i++) add({ t: bt + i / 2, dur: 0.42, midi: i % 4 === 3 ? fifth : root, vel: v * (i % 2 ? 0.8 : 1), inst: R.bass, pan: 0 }); break;
        case 'walk': [root, fifth, root + 12, fifth].forEach((m, i) => add({ t: bt + i, dur: 0.9, midi: m, vel: v, inst: R.bass, pan: 0 })); break;
        case 'long': add({ t: bt, dur: bpb, midi: root, vel: v, inst: R.bass, pan: 0 }); break;
        default: add({ t: bt, dur: 1.8, midi: root, vel: v, inst: R.bass, pan: 0 }); add({ t: bt + 2, dur: 1.8, midi: r() < 0.5 ? fifth : root, vel: v * 0.85, inst: R.bass, pan: 0 });
    }
}

function arpBar(add, R, ch, bt, bpb, r) {
    const notes = ch.map((d) => degreeNote(R.key, R.mode, d + (R.arpOct ?? 0) * 7));
    const pat = R.arpPattern || [0, 1, 2, 1, 0, 1, 2, 1];
    const step = bpb / pat.length;
    pat.forEach((k, i) => add({ t: bt + i * step, dur: step * 1.6, midi: notes[k % notes.length] + (k >= notes.length ? 12 : 0), vel: 0.36 + (i % 4 === 0 ? 0.08 : 0), inst: R.arp, pan: -0.3 + 0.6 * (i / pat.length) }));
}

/** Percussion patterns (one bar): folk (frame drum + shaker), taiko (battle, density by intensity), war (hell), none. */
function percBar(add, kind, bt, bpb, I, bar, secBars, r) {
    const hit = (t, inst, vel, pan = 0) => add({ t: bt + t, dur: 0.5, midi: 60, vel, inst, pan });
    if (kind === 'folk') {
        hit(0, 'frame', 0.55); hit(1.5, 'frame', 0.32); hit(2, 'frame', 0.45); hit(3.5, 'frame', 0.3, 0.2);
        for (let i = 0; i < 8; i++) hit(i / 2, 'shaker', i % 2 ? 0.16 : 0.24, 0.35);
    } else if (kind === 'taiko') {
        hit(0, 'taiko', 0.85); hit(2, 'taiko', 0.7);
        if (I > 0.25) { hit(1.5, 'taiko', 0.5, -0.3); hit(3, 'snare', 0.55); }
        if (I > 0.45) { hit(1, 'snare', 0.5); hit(3.5, 'taiko', 0.55, 0.3); for (let i = 0; i < 8; i++) hit(i / 2, 'shaker', 0.14, -0.35); }
        if (I > 0.65) { hit(0.75, 'taiko', 0.45, 0.4); hit(2.5, 'taiko', 0.6, -0.4); for (let i = 0; i < 16; i++) hit(i / 4, 'hat', i % 4 ? 0.1 : 0.18, 0.3); }
        if (I > 0.85 && bar % 2 === 1) { for (let i = 0; i < 4; i++) hit(3 + i / 4, 'snare', 0.35 + i * 0.1); }
        if (bar === 0 || bar === secBars - 1) hit(0, 'cymbal', 0.45 + 0.3 * I);
    } else if (kind === 'war') {
        hit(0, 'taiko', 0.9); hit(1.5, 'taiko', 0.55); hit(2, 'taiko', 0.75); if (bar % 2) hit(3, 'taiko', 0.6); else hit(3.5, 'taiko', 0.5);
        if (bar === 0) hit(0, 'cymbal', 0.4);
    } else if (kind === 'epic') {
        // (grand, never fast — the school's opening: heavy drums on the strong beats, a roll that swells into each new section, a crash at its start)
        hit(0, 'taiko', 0.95); hit(2, 'taiko', 0.62, -0.2); if (bar % 2) hit(3.5, 'taiko', 0.42, 0.25);
        if (bar === secBars - 1) for (let i = 0; i < 8; i++) hit(2 + i / 4, 'taiko', 0.28 + i * 0.08, (i % 2 ? 0.3 : -0.3));
        if (bar === 0) hit(0, 'cymbal', 0.72);
    } else if (kind === 'soft') {
        hit(0, 'frame', 0.32); hit(2, 'frame', 0.25);
    }
}

// ================================================================ the instruments
const TAU = Math.PI * 2;
// (a sine from a table: the voices call it millions of times a tune — Math.sin was most of the work)
const SN = 8192, SIN = new Float32Array(SN + 1);
for (let i = 0; i <= SN; i++) SIN[i] = Math.sin(TAU * i / SN);
/** sin(2π·x) for x in cycles (any real). */
function sinc(x) { const f = x - Math.floor(x); const p = f * SN, i = p | 0; return SIN[i] + (SIN[i + 1] - SIN[i]) * (p - i); }

/** Render one note into L / R (mono source, panned). */
function voice(e, L, Rch, sr, spb, tune) {
    const start = Math.floor(e.t * spb * sr);
    const durS = e.dur * spb;
    const f = midiHz(e.midi);
    const pl = Math.cos((e.pan + 1) * Math.PI / 4), pr = Math.sin((e.pan + 1) * Math.PI / 4);
    const out = (i, x) => { const j = start + i; if (j >= 0 && j < L.length) { L[j] += x * pl; Rch[j] += x * pr; } };
    const v = e.vel * (tune.gains?.[e.inst] ?? 1);
    switch (e.inst) {
        case 'lute': case 'harp': case 'pluck': {
            // Karplus–Strong: a plucked string (harp: longer, softer; lute: brighter, shorter)
            const P = Math.max(2, Math.round(sr / f)), buf = new Float32Array(P), r = rng(e.midi * 977 + start);
            for (let i = 0; i < P; i++) buf[i] = r() * 2 - 1;
            const decay = e.inst === 'harp' ? 0.996 : e.inst === 'lute' ? 0.991 : 0.994, bright = e.inst === 'lute' ? 0.5 : 0.48;
            const n = Math.floor(Math.min(durS + (e.inst === 'harp' ? 2.5 : 1.2), 4) * sr);
            let k = 0;
            for (let i = 0; i < n; i++) {
                const k1 = k + 1 === P ? 0 : k + 1;
                const a = buf[k], b = buf[k1];
                const x = (bright * a + (1 - bright) * b) * decay;
                buf[k] = x; k = k1;
                const rel = i > durS * sr + 0.35 * sr ? Math.exp(-(i - durS * sr - 0.35 * sr) / (0.15 * sr)) : 1;
                out(i, a * v * 0.5 * rel);
            }
            break;
        }
        case 'flute': {
            const n = Math.floor((durS + 0.25) * sr), r = rng(start + 11);
            let ph = 0, lp = 0;
            for (let i = 0; i < n; i++) {
                const t = i / sr;
                const env = Math.min(1, t / 0.07) * (t > durS ? Math.exp(-(t - durS) / 0.08) : 1);
                const vib = 1 + 0.004 * sinc(5.2 * t) * Math.min(1, t / 0.4);
                ph += f * vib / sr;
                lp += ((r() * 2 - 1) - lp) * 0.2;
                const x = sinc(ph) * 0.8 + sinc(ph * 2) * 0.12 + sinc(ph * 3) * 0.05 + lp * 0.08;
                out(i, x * env * v * 0.42);
            }
            break;
        }
        case 'fiddle': case 'strings': {
            // a bowed string: three detuned saws, a soft low-pass, a slow swell (strings) or a bow's bite (fiddle), vibrato
            const n = Math.floor((durS + 0.35) * sr), att = e.inst === 'strings' ? 0.35 : 0.06;
            const ph = [0, 0.33, 0.66], det = [1, 1.004, 0.996];
            let lp = 0, lp2 = 0;
            const cut = e.inst === 'strings' ? 0.08 : 0.16;
            let env = 0, vib = 1;
            for (let i = 0; i < n; i++) {
                if ((i & 31) === 0) {
                    const t = i / sr;
                    env = Math.min(1, t / att) * (t > durS ? Math.exp(-(t - durS) / 0.18) : 1) * v * 0.55;
                    vib = (1 + 0.005 * sinc(5.5 * t) * Math.min(1, t / 0.3)) * f / sr;
                }
                let x = 0;
                for (let k = 0; k < 3; k++) { let q = ph[k] + det[k] * vib; if (q >= 1) q -= 1; ph[k] = q; x += q * 2 - 1; }
                lp += (x / 3 - lp) * cut; lp2 += (lp - lp2) * cut;
                out(i, lp2 * env);
            }
            break;
        }
        case 'choir': {
            // «аа»: one cycle with the harmonics weighted by the vowel's formants (~800 Hz, 1150 Hz) — a table made once per note — read by a
            // chorus of three slightly detuned, slowly wavering voices; a slow swell
            const n = Math.floor((durS + 0.6) * sr), T = 1024, tab = new Float32Array(T);
            const F1 = 800, F2 = 1150;
            for (let h = 1; h <= 16; h++) {
                const hf = f * h, w = Math.exp(-(((hf - F1) / 260) ** 2)) + 0.6 * Math.exp(-(((hf - F2) / 300) ** 2)) + (h === 1 ? 0.5 : 0) + 0.06 / h;
                if (w < 0.02 || hf > sr / 2) continue;
                for (let k = 0; k < T; k++) tab[k] += w * sinc(h * k / T);
            }
            const ph = [0, 0.31, 0.62], det = [1, 1.003, 0.997], inc = [0, 0, 0];
            let env = 0;
            for (let i = 0; i < n; i++) {
                if ((i & 31) === 0) { // (the slow things — the swell, the wavering — every 32 samples)
                    const t = i / sr;
                    env = Math.min(1, t / 0.5) * (t > durS ? Math.exp(-(t - durS) / 0.3) : 1) * v * 0.09;
                    for (let c = 0; c < 3; c++) inc[c] = f * det[c] * (1 + 0.003 * sinc((4.6 + c * 0.4) * t)) / sr;
                }
                let x = 0;
                for (let c = 0; c < 3; c++) { let q = ph[c] + inc[c]; if (q >= 1) q -= 1; ph[c] = q; x += tab[(q * T) | 0]; }
                out(i, x * env);
            }
            break;
        }
        case 'bell': case 'celesta': {
            // FM: a carrier with an inharmonic modulator, a bright strike dying away
            const n = Math.floor(Math.min(durS + (e.inst === 'bell' ? 4 : 2.2), 5) * sr), ratio = e.inst === 'bell' ? 3.5 : 2.0, idx0 = e.inst === 'bell' ? 3 : 1.5, dec = e.inst === 'bell' ? 1.6 : 0.9;
            for (let i = 0; i < n; i++) {
                const t = i / sr;
                const env = Math.min(1, t / 0.003) * Math.exp(-t / dec);
                const m = sinc(f * ratio * t) * idx0 * Math.exp(-t / 0.5);
                out(i, sinc(f * t + m) * env * v * 0.3);
            }
            break;
        }
        case 'bass': {
            const n = Math.floor((durS + 0.12) * sr);
            for (let i = 0; i < n; i++) {
                const t = i / sr;
                const env = Math.min(1, t / 0.015) * (t > durS ? Math.exp(-(t - durS) / 0.05) : Math.exp(-t / 2.5));
                out(i, (sinc(f * t) + 0.25 * sinc(f * 2 * t) + 0.08 * sinc(f * 3 * t)) * env * v * 0.5);
            }
            break;
        }
        case 'brass': {
            // a horn / a stab: a saw through a filter that opens with the breath
            const n = Math.floor((durS + 0.15) * sr);
            let ph = 0, lp = 0;
            for (let i = 0; i < n; i++) {
                const t = i / sr;
                const env = Math.min(1, t / 0.04) * (t > durS ? Math.exp(-(t - durS) / 0.06) : 1);
                ph = (ph + f / sr) % 1;
                const cut = 0.05 + 0.25 * Math.min(1, t / 0.08) * Math.exp(-t / 0.6);
                lp += ((ph * 2 - 1) - lp) * cut;
                out(i, lp * env * v * 0.5);
            }
            break;
        }
        case 'drone': case 'darkdrone': {
            const n = Math.floor(durS * sr);
            const ph = [0, 0, 0];
            let lp = 0;
            for (let i = 0; i < n; i++) {
                const t = i / sr;
                const env = Math.min(1, t / 2) * Math.min(1, (durS - t) / 2);
                ph[0] += f / sr; ph[1] += f * 1.5 * 1.002 / sr; ph[2] += f * 0.5 / sr;
                let x = sinc(ph[0]) + 0.4 * sinc(ph[1]) * (0.5 + 0.5 * sinc(0.07 * t)) + 0.6 * sinc(ph[2]);
                if (e.inst === 'darkdrone') x = Math.tanh(x * 1.8) + 0.15 * sinc(f * 1.414 * t) * sinc(0.11 * t); // (hell: saturated, a tritone beating in it)
                lp += (x - lp) * 0.1;
                out(i, lp * env * v * 0.35);
            }
            break;
        }
        // ---- drums
        case 'taiko': case 'kick': {
            const n = Math.floor(0.7 * sr), r = rng(start + 3);
            for (let i = 0; i < n; i++) {
                const t = i / sr, fr = (e.inst === 'taiko' ? 55 : 48) * (1 + 1.6 * Math.exp(-t / 0.03));
                const x = sinc(fr * t) * Math.exp(-t / (e.inst === 'taiko' ? 0.28 : 0.18)) + (r() * 2 - 1) * 0.2 * Math.exp(-t / 0.02);
                out(i, x * v * 0.9);
            }
            break;
        }
        case 'snare': {
            const n = Math.floor(0.25 * sr), r = rng(start + 5);
            let hp = 0, pr = 0;
            for (let i = 0; i < n; i++) {
                const t = i / sr, w = r() * 2 - 1;
                hp = 0.7 * (hp + w - pr); pr = w;
                out(i, (hp * 0.7 * Math.exp(-t / 0.07) + sinc(190 * t) * 0.4 * Math.exp(-t / 0.05)) * v * 0.6);
            }
            break;
        }
        case 'frame': {
            const n = Math.floor(0.35 * sr), r = rng(start + 7);
            for (let i = 0; i < n; i++) { const t = i / sr; out(i, (sinc(110 * (1 + 0.3 * Math.exp(-t / 0.02)) * t) * Math.exp(-t / 0.12) + (r() - 0.5) * 0.25 * Math.exp(-t / 0.015)) * v * 0.55); }
            break;
        }
        case 'shaker': case 'hat': {
            const n = Math.floor((e.inst === 'hat' ? 0.06 : 0.09) * sr), r = rng(start + 9);
            let hp = 0, pr = 0;
            for (let i = 0; i < n; i++) { const t = i / sr, w = r() * 2 - 1; hp = 0.5 * (hp + w - pr); pr = w; out(i, hp * Math.exp(-t / (e.inst === 'hat' ? 0.015 : 0.03)) * v * 0.35); }
            break;
        }
        case 'cymbal': {
            const n = Math.floor(2.2 * sr), r = rng(start + 13);
            let hp = 0, pr = 0;
            for (let i = 0; i < n; i++) { const t = i / sr, w = r() * 2 - 1; hp = 0.85 * (hp + w - pr); pr = w; out(i, hp * Math.min(1, t / 0.002) * Math.exp(-t / 0.7) * v * 0.25); }
            break;
        }
        default: break;
    }
}

/** A stereo hall (Schroeder: four combs and two all-passes a side), `mix` of it into L / R. */
function reverb(L, R, sr, mix, size = 1) {
    if (!(mix > 0)) return;
    const n = L.length;
    const wetL = new Float32Array(n), wetR = new Float32Array(n);
    const combs = [1116, 1188, 1277, 1356].map((d) => Math.round(d * size * sr / 44100));
    const aps = [556, 441].map((d) => Math.round(d * sr / 44100));
    const run = (src, dst, spread) => {
        for (const d0 of combs) {
            const d = d0 + spread, buf = new Float32Array(d);
            let k = 0, lp = 0;
            for (let i = 0; i < n; i++) {
                const y = buf[k];
                lp = y * 0.6 + lp * 0.4; // (damping: the hall swallows the highs)
                buf[k] = src[i] * 0.5 + lp * 0.84;
                if (++k === d) k = 0;
                dst[i] += y * 0.25;
            }
        }
        for (const d0 of aps) {
            const d = d0 + spread, buf = new Float32Array(d);
            let k = 0;
            for (let i = 0; i < n; i++) { const b = buf[k], x = dst[i]; const y = -x + b; buf[k] = x + b * 0.5; if (++k === d) k = 0; dst[i] = y; }
        }
    };
    run(L, wetL, 0); run(R, wetR, 23);
    for (let i = 0; i < n; i++) { L[i] = L[i] * (1 - mix * 0.5) + wetL[i] * mix; R[i] = R[i] * (1 - mix * 0.5) + wetR[i] * mix; }
}

/**
 * Render a recipe: → {left, right, seconds, loop} at `sr` Hz. The tune's own loudness (`level`), a soft fade at the start, a fade-out at
 * the end unless it loops (battle music is looped by the director: rendered without the fade).
 */
export function renderTune(R, sr = 32000) {
    const { events, beats, tempo } = compose(R);
    const spb = 60 / tempo;
    const tail = R.loop ? 0 : 3;
    const seconds = beats * spb + tail;
    const n = Math.floor(seconds * sr);
    const L = new Float32Array(n), Rr = new Float32Array(n);
    for (const e of events) voice(e, L, Rr, sr, spb, R);
    reverb(L, Rr, sr, R.reverb ?? 0.25, R.hall ?? 1);
    // the level: normalised to the kind's loudness, a gentle limiter, the edges faded
    let peak = 1e-6;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rr[i]));
    const g = (R.level ?? 0.6) / peak;
    const fin = Math.floor(0.6 * sr), fout = R.loop ? Math.floor(0.05 * sr) : Math.floor(Math.min(4, seconds * 0.15) * sr);
    for (let i = 0; i < n; i++) {
        const e = Math.min(1, i / fin, (n - 1 - i) / fout);
        L[i] = Math.tanh(L[i] * g * 1.1) * 0.9 * e;
        Rr[i] = Math.tanh(Rr[i] * g * 1.1) * 0.9 * e;
    }
    return { left: L, right: Rr, seconds, loop: !!R.loop };
}
