/**
 * NatureSounds.js — the small voices of a forest and of the shore (the author 21.11: «в лесу отдельные звуки интересные… птица пролетела…
 * то же самое у озера»). One-shots, synthesized ahead (SoundManager.prewarmStep) and played at a place near the hero by NatureAmbience.js:
 *
 *   FOREST  thrush (a fluting phrase), finch (a quick falling trill), tit (two bright chips), cuckoo, woodpecker (a drumming of knocks),
 *           crow (a far caw), flush (a bird bursts out of the leaves), gust (wind through the crowns), twig (a snap and a crunch),
 *           squirrel (a scolding chatter), cricket (the night's chirring), leaves (a rustle on the ground)
 *   SHORE   frog (a croak), peeper (a tiny frog's trill), duck (a quacking), plop (a fish jumps), lap (water against the bank), reeds (a rustle),
 *           kingfisher (a piercing whistle), heron (a harsh croak), dragonfly (a dry buzz), splash (a bird lands on the water)
 *
 * Pure sample maths (`synthNature(ctx, kind)` needs only `ctx.createBuffer` and `ctx.sampleRate`): a test builds them all.
 */
export const FOREST_SOUNDS = ['thrush', 'finch', 'tit', 'cuckoo', 'woodpecker', 'crow', 'flush', 'gust', 'twig', 'squirrel', 'cricket', 'leaves'];
export const SHORE_SOUNDS = ['frog', 'peeper', 'duck', 'plop', 'lap', 'reeds', 'kingfisher', 'heron', 'dragonfly', 'splash'];
export const NATURE_SOUNDS = [...FOREST_SOUNDS, ...SHORE_SOUNDS];

const DUR = { thrush: 3.2, finch: 1.2, tit: 0.9, cuckoo: 1.3, woodpecker: 1.4, crow: 1.1, flush: 0.9, gust: 4.2, twig: 0.7, squirrel: 1.4, cricket: 2.6, leaves: 2.2,
    frog: 1.3, peeper: 1.4, duck: 1.5, plop: 0.8, lap: 3.4, reeds: 2.6, kingfisher: 1.1, heron: 1.2, dragonfly: 1.8, splash: 1.3 };

function rng(seed) { let s = (seed ^ 0x9e3779b9) >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const TAU = Math.PI * 2;

/** A pitched note with a glide, a few harmonics, a vibrato and an attack/release (a bird's whistle, a frog's tone). */
function tone(d, sr, at, dur, f0, f1, amp, o = {}) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr), att = o.att ?? 0.012, rel = o.rel ?? 0.04, h2 = o.h2 ?? 0.15, h3 = o.h3 ?? 0.05, vib = o.vib ?? 0, vf = o.vf ?? 30;
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, k = t / dur;
        const env = Math.min(1, t / att) * Math.min(1, (dur - t) / rel) * (o.shape ? Math.pow(Math.sin(Math.PI * k), o.shape) : 1);
        const f = (f0 + (f1 - f0) * (o.curve ? Math.pow(k, o.curve) : k)) * (1 + vib * Math.sin(TAU * vf * t));
        ph += f / sr;
        d[i0 + i] += env * amp * (Math.sin(TAU * ph) + h2 * Math.sin(2 * TAU * ph) + h3 * Math.sin(3 * TAU * ph));
    }
}
/** Filtered noise (one-pole low-pass `lp`, and a high-pass `hp` taken off) with an envelope function of 0…1 time. */
function noise(d, sr, at, dur, amp, lp, hp, env, r) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let a = 0, b = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const k = i / n;
        a += ((r() * 2 - 1) - a) * lp;
        b += (a - b) * hp; // (b follows slowly: a - b is the high-passed part)
        d[i0 + i] += (hp < 1 ? a - b : a) * amp * env(k);
    }
}
/** A buzzing voice (a pulse train through formants): `f` the pitch curve, `F` the formant centres, a croak, a quack, a caw. */
function voice(d, sr, at, dur, f0, f1, amp, F, bw, rough = 0, r = rng(1)) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, k = t / dur, f = f0 + (f1 - f0) * k;
        ph += f / sr * (1 + rough * (r() - 0.5));
        let s = 0;
        const top = Math.min(24, Math.floor(sr * 0.45 / f));
        for (let h = 1; h <= top; h++) { let g = 0; for (const c of F) g += Math.exp(-(((h * f - c) / bw) ** 2)); s += g * Math.sin(TAU * ph * h) / Math.sqrt(h); }
        d[i0 + i] += s * amp * Math.min(1, t / 0.015) * Math.min(1, (dur - t) / 0.05) * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, k)));
    }
}
const knock = (d, sr, at, f, amp, decay = 60, r = rng(2)) => { // a short woody tick
    const i0 = Math.floor(at * sr), n = Math.floor(0.09 * sr);
    for (let i = 0; i < n && i0 + i < d.length; i++) { const t = i / sr; d[i0 + i] += amp * Math.exp(-t * decay) * (Math.sin(TAU * f * t) + 0.5 * (r() * 2 - 1)); }
};

export function synthNature(ctx, kind) {
    const sr = ctx.sampleRate, dur = DUR[kind] || 1, buf = ctx.createBuffer(1, Math.floor(sr * dur), sr), d = buf.getChannelData(0), r = rng(1000 + NATURE_SOUNDS.indexOf(kind) * 97);
    switch (kind) {
        case 'thrush': { // a song: a short phrase of rich flutes, each repeated, then a pause and another phrase (the thrush sings every figure twice)
            let t = 0.05;
            for (let ph = 0; ph < 4; ph++) {
                const base = 2100 + r() * 1100;
                const notes = 2 + Math.floor(r() * 3);
                for (let rep = 0; rep < 2; rep++) {
                    let tt = t;
                    for (let k = 0; k < notes; k++) { const du = 0.07 + r() * 0.09, f1 = base * (0.8 + r() * 0.6); tone(d, sr, tt, du, base * (0.85 + 0.3 * (k % 2)), f1, 0.28, { vib: 0.012, vf: 38, h2: 0.3, h3: 0.08, shape: 0.5 }); tt += du + 0.02; }
                    t = tt + 0.05;
                }
                t += 0.14 + r() * 0.12;
            }
            break;
        }
        case 'finch': { // a quick trill falling in pitch, ending on a flourish
            let t = 0.04, f = 5200;
            for (let i = 0; i < 13; i++) { tone(d, sr, t, 0.035, f, f * 0.86, 0.3, { shape: 0.7, h2: 0.1 }); t += 0.055; f *= 0.965; }
            tone(d, sr, t + 0.03, 0.14, 3100, 4600, 0.3, { shape: 0.6 });
            break;
        }
        case 'tit': { // two bright chips «ци-ци-пи»
            tone(d, sr, 0.05, 0.07, 4600, 5400, 0.32, { shape: 0.6 });
            tone(d, sr, 0.17, 0.07, 4800, 5600, 0.32, { shape: 0.6 });
            tone(d, sr, 0.33, 0.12, 5600, 3600, 0.3, { shape: 0.6 });
            tone(d, sr, 0.55, 0.07, 4700, 5400, 0.3, { shape: 0.6 });
            break;
        }
        case 'cuckoo': { // «ку-ку»: two soft round notes, the second a third lower
            tone(d, sr, 0.05, 0.22, 830, 790, 0.5, { att: 0.03, rel: 0.08, h2: 0.08, h3: 0.02, shape: 0.35 });
            tone(d, sr, 0.5, 0.3, 660, 640, 0.5, { att: 0.03, rel: 0.12, h2: 0.08, h3: 0.02, shape: 0.35 });
            break;
        }
        case 'woodpecker': { // a drumming: knocks speeding up, then trailing
            let t = 0.05, gap = 0.075;
            for (let i = 0; i < 14; i++) { knock(d, sr, t, 900 + 90 * Math.sin(i * 1.7), 0.5 - i * 0.012, 70, r); t += gap; gap *= 0.97; }
            break;
        }
        case 'crow': { // a rough caw, falling
            voice(d, sr, 0.05, 0.38, 340, 250, 0.1, [650, 1500], 450, 0.25, r);
            voice(d, sr, 0.5, 0.42, 330, 235, 0.1, [620, 1400], 450, 0.25, r);
            break;
        }
        case 'flush': { // a bird bursts out of the leaves: a clatter of wing beats, then a rustle
            for (let k = 0; k < 9; k++) noise(d, sr, 0.03 + k * 0.07 * (1 + k * 0.05), 0.07, 0.5 - k * 0.03, 0.35, 0.05, (u) => Math.sin(Math.PI * u), r);
            noise(d, sr, 0, 0.9, 0.12, 0.15, 0.02, (u) => Math.exp(-u * 3), r);
            tone(d, sr, 0.04, 0.09, 3800, 5200, 0.14, { shape: 0.6 }); // (a startled chirp)
            break;
        }
        case 'gust': { // wind through the crowns: a broad hiss swelling and ebbing, a lower sway under it, a shower of leaves
            noise(d, sr, 0, dur, 0.5, 0.22, 0.01, (u) => Math.pow(Math.sin(Math.PI * u), 1.6) * (0.7 + 0.3 * Math.sin(u * 25)), r);
            noise(d, sr, 0, dur, 0.3, 0.03, 1, (u) => Math.pow(Math.sin(Math.PI * u), 1.2), r);
            for (let k = 0; k < 40; k++) noise(d, sr, 0.5 + r() * 3, 0.03, 0.2, 0.4, 0.05, (u) => 1 - u, r);
            break;
        }
        case 'twig': { // a dry snap, a smaller one, a crunch of leaves
            knock(d, sr, 0.05, 2400, 0.8, 90, r); knock(d, sr, 0.09, 1300, 0.5, 70, r);
            noise(d, sr, 0.1, 0.35, 0.25, 0.3, 0.04, (u) => Math.exp(-u * 6) * (0.6 + 0.4 * Math.sin(u * 60)), r);
            knock(d, sr, 0.4, 1800, 0.3, 120, r);
            break;
        }
        case 'squirrel': { // a scolding chatter: quick sharp «чк-чк-чк», louder and faster
            let t = 0.05;
            for (let i = 0; i < 10; i++) { tone(d, sr, t, 0.045, 2300 + 600 * r(), 1500, 0.3 + i * 0.02, { shape: 0.5, h2: 0.4 }); noise(d, sr, t, 0.03, 0.12, 0.5, 0.05, (u) => 1 - u, r); t += 0.1 - i * 0.004; }
            break;
        }
        case 'cricket': { // the night's chirring: bursts of 4.6 kHz pulses, soft
            for (let b = 0; b < 5; b++) { const t0 = 0.05 + b * 0.5; for (let p = 0; p < 4; p++) tone(d, sr, t0 + p * 0.032, 0.026, 4600, 4650, 0.16, { att: 0.004, rel: 0.012, h2: 0.05, h3: 0 }); }
            break;
        }
        case 'leaves': { // a rustle on the ground: a small animal, stop and start
            for (let k = 0; k < 5; k++) { const t = 0.05 + k * 0.4 + r() * 0.15; noise(d, sr, t, 0.2 + r() * 0.15, 0.3, 0.35, 0.03, (u) => Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(u * 50 + k)), r); }
            break;
        }
        // ---------------------------------------------------------------- the shore
        case 'frog': { // «ква-ква»: a low throat croak, pulsed, twice
            for (const t of [0.05, 0.5]) voice(d, sr, t, 0.32, 150, 120, 0.12, [300, 900], 220, 0.35, r);
            break;
        }
        case 'peeper': { // a tiny frog: a high trill that rises, repeating
            for (let k = 0; k < 4; k++) { const t0 = 0.05 + k * 0.3; for (let p = 0; p < 8; p++) tone(d, sr, t0 + p * 0.022, 0.016, 2700 + p * 40, 2800 + p * 40, 0.22, { att: 0.003, rel: 0.008, h2: 0.05, h3: 0 }); }
            break;
        }
        case 'duck': { // a quacking: «кря-кря-кря», each a nasal buzz falling
            for (const [t, L] of [[0.05, 0.22], [0.37, 0.2], [0.65, 0.18], [0.9, 0.3]]) voice(d, sr, t, L, 420, 320, 0.11, [900, 2300], 300, 0.15, r);
            break;
        }
        case 'plop': { // a fish jumps: a smack, a splash of drops, a round «буль» of water closing
            noise(d, sr, 0.02, 0.12, 0.5, 0.4, 0.05, (u) => Math.exp(-u * 5), r);
            noise(d, sr, 0.1, 0.4, 0.2, 0.25, 0.03, (u) => Math.exp(-u * 4) * (0.5 + 0.5 * Math.sin(u * 70)), r);
            tone(d, sr, 0.14, 0.18, 420, 180, 0.4, { att: 0.005, rel: 0.1, h2: 0.05, h3: 0 }); // (the hollow)
            for (let k = 0; k < 6; k++) tone(d, sr, 0.3 + r() * 0.4, 0.04, 900 + r() * 900, 300, 0.1, { att: 0.002, rel: 0.03, h2: 0, h3: 0 }); // (drops falling back)
            break;
        }
        case 'lap': { // water against the bank: soft sloshes and a slap, a trickle between
            for (let k = 0; k < 4; k++) { const t = 0.05 + k * 0.8 + r() * 0.2; noise(d, sr, t, 0.55, 0.28, 0.08, 0.02, (u) => Math.pow(Math.sin(Math.PI * u), 1.4), r); tone(d, sr, t + 0.25, 0.1, 280 + r() * 100, 180, 0.12, { att: 0.01, rel: 0.06, h2: 0, h3: 0 }); }
            for (let k = 0; k < 30; k++) tone(d, sr, r() * 3.2, 0.025, 700 + r() * 1400, 400, 0.04, { att: 0.002, rel: 0.02, h2: 0, h3: 0 });
            break;
        }
        case 'reeds': { // a rustle in the reeds: dry and long
            noise(d, sr, 0, dur, 0.34, 0.5, 0.06, (u) => Math.pow(Math.sin(Math.PI * u), 1.1) * (0.55 + 0.45 * Math.sin(u * 40) * Math.sin(u * 13)), r);
            break;
        }
        case 'kingfisher': { // a piercing whistle: two sharp notes
            tone(d, sr, 0.05, 0.16, 3800, 3500, 0.34, { att: 0.01, rel: 0.05, h2: 0.05, h3: 0 });
            tone(d, sr, 0.3, 0.2, 4300, 3600, 0.34, { att: 0.01, rel: 0.06, h2: 0.05, h3: 0 });
            break;
        }
        case 'heron': { // a harsh croak «кра-ак»
            voice(d, sr, 0.08, 0.7, 210, 130, 0.12, [550, 1400], 400, 0.4, r);
            break;
        }
        case 'dragonfly': { // a dry buzz that swings past
            noise(d, sr, 0, dur, 0.18, 0.7, 0.2, (u) => Math.pow(Math.sin(Math.PI * u), 0.8) * (0.6 + 0.4 * Math.sin(u * 220)), r);
            tone(d, sr, 0.1, dur - 0.2, 190, 240, 0.07, { att: 0.2, rel: 0.4, h2: 0.8, h3: 0.5, vib: 0.1, vf: 60 });
            break;
        }
        case 'splash': { // a bird lands on the water: a quick skid, wing beats, a little wake
            noise(d, sr, 0.02, 0.3, 0.45, 0.35, 0.05, (u) => Math.exp(-u * 4), r);
            for (let k = 0; k < 4; k++) noise(d, sr, 0.15 + k * 0.1, 0.07, 0.3, 0.3, 0.05, (u) => Math.sin(Math.PI * u), r);
            noise(d, sr, 0.3, 0.9, 0.14, 0.12, 0.02, (u) => Math.sin(Math.PI * u) * (1 - u), r);
            break;
        }
        default: break;
    }
    // soft edges and a safe peak
    let pk = 0;
    for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    const g = pk > 0 ? 0.85 / pk : 1, F = Math.min(d.length >> 1, Math.floor(0.01 * sr));
    for (let i = 0; i < d.length; i++) { let e = 1; if (i < F) e = i / F; else if (d.length - i < F) e = (d.length - i) / F; d[i] *= g * e; }
    return buf;
}
