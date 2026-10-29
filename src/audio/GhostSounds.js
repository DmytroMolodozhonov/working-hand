/**
 * GhostSounds.js — the sounds of the Castle of Ghosts (Ghosts.js; ids and what they are: GhostRules.GHOST_SOUNDS), synthesized ahead
 * (SoundManager.prewarmStep), never on the first play. Every one has its own small echo of stone halls.
 *   steps   four slow heavy steps behind a wall          whisper  breathy syllables, a voice with no throat
 *   cry     a far sob sliding down                         knock    three knocks on old wood
 *   scrape  a chair's legs dragged over stone              wail     the ghost's long «ooOOoo», rising and falling
 *   laugh   a child's «he-he-he», far and thin             chill    an icy whoosh and a crystal shimmer (it went through you)
 *   fade    a soft airy fall (a ghost melts away)          bell     a far bell, deep, inharmonic, long
 *   door    a door creaking open                           drone    the castle's low hum (8 s, loops seamlessly)
 */

export const GHOST_SOUND_IDS = ['steps', 'whisper', 'cry', 'knock', 'scrape', 'wail', 'laugh', 'chill', 'fade', 'bell', 'door', 'drone'];

const DUR = { steps: 2.6, whisper: 1.9, cry: 2.8, knock: 1.6, scrape: 0.8, wail: 2.6, laugh: 1.6, chill: 1.6, fade: 1.1, bell: 6.5, door: 1.8, drone: 8 };

/** A small deterministic noise (the same sound on every computer, as the others). */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; }

/** Stone halls: a few delayed, darker copies added (forward: the copies echo again). */
function echo(d, sr, delay = 0.19, fb = 0.32, damp = 0.35) {
    const n = Math.floor(delay * sr);
    let lp = 0;
    for (let i = n; i < d.length; i++) { lp += (d[i - n] - lp) * damp; d[i] += lp * fb; }
}

/** A voiced tone through two formants (a «voice» without a throat): returns the sample. */
function makeVoice(sr) {
    let ph = 0, b1 = 0, b2 = 0, c1 = 0, c2 = 0;
    return (f0, F1, F2, breath, r) => {
        ph += f0 / sr; if (ph > 1) ph -= 1;
        const src = (ph * 2 - 1) * 0.6 + breath * r();
        // two resonators (state-variable style, cheap)
        const g1 = 2 * Math.sin(Math.PI * F1 / sr), g2 = 2 * Math.sin(Math.PI * F2 / sr);
        b1 += g1 * c1; c1 += g1 * (src - b1 - c1 * 0.12);
        b2 += g2 * c2; c2 += g2 * (src - b2 - c2 * 0.15);
        return c1 * 0.5 + c2 * 0.35;
    };
}

export function synthGhost(ctx, kind) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * (DUR[kind] || 1.5));
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const r = rng(kind.length * 7919 + kind.charCodeAt(0) * 31);
    const TAU = Math.PI * 2;
    switch (kind) {
        case 'steps': { // four slow heavy steps, the heel and then the sole, muffled by a wall
            for (let k = 0; k < 4; k++) {
                const i0 = Math.floor((0.15 + k * 0.58 + 0.03 * r()) * sr);
                let lp = 0;
                for (let i = 0; i < Math.floor(0.32 * sr) && i0 + i < len; i++) {
                    const t = i / sr;
                    lp += (r() - lp) * 0.08;
                    const heel = Math.exp(-t * 38) * Math.sin(TAU * (62 - 30 * t) * t) * 0.9;
                    const sole = t > 0.07 ? Math.exp(-(t - 0.07) * 30) * lp * 1.6 : 0;
                    d[i0 + i] += (heel + sole) * (0.8 + 0.2 * (k % 2));
                }
            }
            echo(d, sr, 0.23, 0.3, 0.25);
            break;
        }
        case 'whisper': { // breathy syllables: bandpassed noise through moving formants, «shh… khaa… sss»
            const v = makeVoice(sr);
            const syl = [[0.05, 0.35, 900, 2300], [0.45, 0.3, 700, 1700], [0.85, 0.42, 1100, 2700], [1.35, 0.4, 600, 1400]];
            for (const [at, du, F1, F2] of syl) {
                const i0 = Math.floor(at * sr);
                for (let i = 0; i < Math.floor(du * sr) && i0 + i < len; i++) {
                    const k = i / (du * sr);
                    const env = Math.sin(Math.PI * k) ** 1.5;
                    d[i0 + i] += v(0, F1 * (1 + 0.2 * k), F2 * (1 - 0.15 * k), 1, r) * env * 1.4;
                }
            }
            let hp = 0; for (let i = 0; i < len; i++) { const x = d[i]; d[i] = x - hp; hp += (x - hp) * 0.05; } // (only the air: no low rumble)
            echo(d, sr, 0.17, 0.28, 0.3);
            break;
        }
        case 'cry': { // a far sob: three falling, trembling «ah…» with breath between
            const v = makeVoice(sr);
            for (const [at, du, f] of [[0.05, 0.75, 520], [0.95, 0.6, 480], [1.7, 0.95, 450]]) {
                const i0 = Math.floor(at * sr);
                for (let i = 0; i < Math.floor(du * sr) && i0 + i < len; i++) {
                    const t = i / sr, k = t / du;
                    const env = Math.min(1, t * 12) * (1 - k) ** 1.2;
                    const f0 = f * (1 - 0.28 * k) * (1 + 0.035 * Math.sin(TAU * 6.5 * t));
                    d[i0 + i] += v(f0, 750, 1250, 0.25, r) * env;
                }
            }
            let lp = 0; for (let i = 0; i < len; i++) { lp += (d[i] - lp) * 0.25; d[i] = lp; } // (far away: dull)
            echo(d, sr, 0.27, 0.42, 0.2);
            break;
        }
        case 'knock': { // three knocks on old wood: a hollow ring and the knuckle's click
            for (const at of [0.05, 0.3, 0.52]) {
                const i0 = Math.floor(at * sr);
                for (let i = 0; i < Math.floor(0.25 * sr) && i0 + i < len; i++) {
                    const t = i / sr;
                    d[i0 + i] += Math.exp(-t * 32) * (Math.sin(TAU * 185 * t) * 0.8 + Math.sin(TAU * 412 * t) * 0.35) + (t < 0.004 ? r() * 0.8 : 0);
                }
            }
            echo(d, sr, 0.21, 0.36, 0.3);
            break;
        }
        case 'scrape': { // the legs drag over stone: stick and slip, a squeal sliding
            let bp = 0, bv = 0;
            for (let i = 0; i < len; i++) {
                const t = i / sr, k = t / (len / sr);
                const env = Math.sin(Math.PI * Math.min(1, k * 1.1)) ** 0.7;
                const stick = Math.max(0, Math.sin(TAU * (38 + 25 * Math.sin(k * 5)) * t)) ** 6;
                const f = 700 + 500 * Math.sin(k * 3.1);
                const g = 2 * Math.sin(Math.PI * f / sr);
                bp += g * bv; bv += g * (r() - bp - bv * 0.2);
                d[i] = (bv * 0.6 * (0.3 + stick) + Math.sin(TAU * f * 0.5 * t) * stick * 0.25) * env;
            }
            echo(d, sr, 0.15, 0.22, 0.4);
            break;
        }
        case 'wail': { // «ooOOoo»: a hollow voice rising, holding, falling, a breath of wind round it
            const v = makeVoice(sr);
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / sr, k = t / (len / sr);
                const env = Math.sin(Math.PI * k) ** 0.8;
                const f0 = (240 + 280 * Math.sin(Math.PI * Math.min(1, k * 1.25)) - 60 * k) * (1 + 0.02 * Math.sin(TAU * 5 * t));
                lp += (r() - lp) * 0.03;
                d[i] = (v(f0, 380 + 120 * Math.sin(k * 6), 820, 0.15, r) * 0.9 + Math.sin(TAU * f0 * t) * 0.25) * env + lp * 0.6 * env;
            }
            echo(d, sr, 0.29, 0.4, 0.22);
            break;
        }
        case 'laugh': { // a child's «he-he-he-he», high, thin and far
            const v = makeVoice(sr);
            for (let k = 0; k < 6; k++) {
                const at = 0.06 + k * 0.17, du = 0.12, i0 = Math.floor(at * sr);
                for (let i = 0; i < Math.floor(du * sr) && i0 + i < len; i++) {
                    const t = i / sr, q = t / du;
                    const env = Math.sin(Math.PI * q) ** 0.6 * (1 - k * 0.1);
                    d[i0 + i] += v(470 - k * 14 - 60 * q, 900, 2600, 0.35, r) * env;
                }
            }
            let lp = 0; for (let i = 0; i < len; i++) { lp += (d[i] - lp) * 0.35; d[i] = lp; }
            echo(d, sr, 0.24, 0.42, 0.25);
            break;
        }
        case 'chill': { // an icy whoosh through you and a crystal shimmer after
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / sr, k = t / (len / sr);
                lp += (r() - lp) * (0.08 + 0.5 * Math.sin(Math.PI * Math.min(1, k * 1.6)));
                d[i] = lp * Math.sin(Math.PI * Math.min(1, k * 1.5)) * 0.9;
            }
            for (const [at, f] of [[0.25, 2637], [0.38, 3136], [0.5, 3951], [0.66, 2349], [0.8, 4186]]) {
                const i0 = Math.floor(at * sr);
                for (let i = 0; i + i0 < len; i++) { const t = i / sr; d[i0 + i] += 0.18 * Math.exp(-t * 4) * Math.sin(TAU * f * t) * (1 + 0.3 * Math.sin(TAU * 7 * t)); }
            }
            break;
        }
        case 'fade': { // a soft airy fall: noise and a sighing tone sliding down
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / sr, k = t / (len / sr);
                lp += (r() - lp) * (0.3 - 0.25 * k);
                const env = Math.min(1, t * 8) * (1 - k) ** 1.5;
                d[i] = (lp * 0.7 + Math.sin(TAU * (900 - 600 * k) * t) * 0.18) * env;
            }
            echo(d, sr, 0.18, 0.3, 0.3);
            break;
        }
        case 'bell': { // a far bell: inharmonic partials, the hum stays longest; dull with distance
            const f = 98;
            for (const [m, a, dec] of [[0.5, 0.5, 0.35], [1, 0.8, 0.6], [1.19, 0.45, 0.9], [1.56, 0.35, 1.2], [2.0, 0.3, 1.5], [2.74, 0.18, 2.2], [3.76, 0.1, 3]]) {
                for (let i = 0; i < len; i++) { const t = i / sr; d[i] += a * Math.exp(-t * dec) * Math.sin(TAU * f * m * t + m); }
            }
            for (let i = 0; i < Math.floor(0.01 * sr); i++) d[i] += r() * 0.3 * (1 - i / (0.01 * sr));
            let lp = 0; for (let i = 0; i < len; i++) { lp += (d[i] - lp) * 0.18; d[i] = lp; }
            echo(d, sr, 0.41, 0.35, 0.15);
            break;
        }
        case 'door': { // a door creaks open: stick-slip pulses whose pitch climbs and wavers
            let bp = 0, bv = 0, ph = 0;
            for (let i = 0; i < len; i++) {
                const t = i / sr, k = t / (len / sr);
                const env = Math.sin(Math.PI * Math.min(1, k * 1.05)) ** 0.6;
                const rate = 18 + 70 * k + 20 * Math.sin(k * 9);
                ph += rate / sr; if (ph > 1) ph -= 1;
                const pulse = Math.exp(-ph * 14);
                const f = 380 + 260 * Math.sin(k * 4.2);
                const g = 2 * Math.sin(Math.PI * f / sr);
                bp += g * bv; bv += g * (pulse - bp - bv * 0.06);
                d[i] = bv * env * 0.9;
            }
            echo(d, sr, 0.2, 0.3, 0.3);
            break;
        }
        case 'drone': { // the castle hums: low, slowly beating, a far wind in the halls — every frequency a whole number of cycles in 8 s (loops without a seam)
            const T = len / sr;
            const parts = [[55, 0.32], [55.375, 0.28], [82.5, 0.14], [110.125, 0.08], [164.75, 0.04]];
            for (const [f, a] of parts) for (let i = 0; i < len; i++) { const t = i / sr; d[i] += a * Math.sin(TAU * f * t) * (0.75 + 0.25 * Math.sin(TAU * t / T * 2)); }
            // the wind: smoothed noise crossfaded over the loop's ends
            const X = Math.floor(sr * 1), w = new Float32Array(len + X);
            let lp = 0, lp2 = 0;
            for (let i = 0; i < len + X; i++) { lp += (r() - lp) * 0.02; lp2 += (lp - lp2) * 0.05; w[i] = lp2; }
            for (let i = 0; i < len; i++) {
                let x = w[i + X];
                if (i >= len - X) { const k = (i - (len - X)) / X; x = x * (1 - k) + w[i + X - len] * k; } // (the end runs into the start)
                d[i] += x * 2.2 * (1.2 + 0.8 * Math.sin(TAU * i / len * 3));
            }
            break;
        }
    }
    // the peak at 0.8, a soft clip
    let p = 0;
    for (let i = 0; i < len; i++) p = Math.max(p, Math.abs(d[i]));
    const k = p > 1e-6 ? 0.8 / p : 0;
    for (let i = 0; i < len; i++) d[i] = Math.tanh(d[i] * k * 1.1) * 0.8;
    return buf;
}
