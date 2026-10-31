/**
 * ThrowSounds.js — the sounds of a thing leaving the hand and landing (Items: ThrowModel). Made ahead on the loading
 * screen (SoundManager.prewarmStep), never in the moment. Each is layered, not one beep:
 *   whoosh — the air the thing cuts: noise through a resonator that sweeps up and back down (its pitch follows the
 *            thing's speed past the ear), a soft low «push» under it;
 *   whirl  — a spinning long thing (a wand, a hammer, a bone): the same air, chopped by its turns, the chop slowing;
 *   thump  — a round thing on the ground (an apple): a low soft body, a little grit of the earth;
 *   clack  — a long hard thing (a wand, a stick): two quick wooden knocks (one end, then the other) and a buzz;
 *   slap   — a flat thing (a book, a shield): a broad slap of air and paper/leather;
 *   thud   — a soft thing (bread, a pouch, cloth): a dull muffled thud;
 *   clink  — a pouch of coins: a muffled thud and a few small metal pings inside;
 *   splash — into water: a deep «плюх», then a spray of small drops.
 */
export const THROW_SOUNDS = ['whoosh', 'whirl', 'thump', 'clack', 'slap', 'thud', 'clink', 'splash'];

/** A deterministic noise source (the same sound every load). */
function noise(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; };
}

/** A two-pole resonator (band-pass) on a sample stream: state in `st`. */
function reso(st, x, f, q, sr) {
    const w = (2 * Math.PI * f) / sr, r = Math.exp(-w / (2 * q));
    const y = x * (1 - r) + 2 * r * Math.cos(w) * st.y1 - r * r * st.y2;
    st.y2 = st.y1; st.y1 = y;
    return y;
}

export function synthThrow(ctx, kind) {
    const sr = ctx.sampleRate;
    const dur = { whoosh: 0.42, whirl: 0.6, thump: 0.28, clack: 0.3, slap: 0.22, thud: 0.3, clink: 0.45, splash: 0.9 }[kind] || 0.3;
    const len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const rnd = noise(17 + kind.length * 131 + kind.charCodeAt(0));
    const a = { y1: 0, y2: 0 }, b = { y1: 0, y2: 0 }, c = { y1: 0, y2: 0 };
    let lp = 0, lp2 = 0, ph = 0, ph2 = 0;
    for (let i = 0; i < len; i++) {
        const t = i / sr, n = rnd();
        let v = 0;
        if (kind === 'whoosh' || kind === 'whirl') {
            // the pass: swells, peaks a third of the way in, dies; the resonance sweeps 500 → 2400 → 900 Hz
            const u = t / dur;
            const env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 1.6) * (u < 0.33 ? 1 : Math.exp(-(u - 0.33) * 3));
            const f = 500 + 1900 * Math.sin(Math.PI * Math.min(1, u * 1.4)) + 400 * (1 - u);
            const air = reso(a, n, f, 2.2, sr) * 3.2 + reso(b, n, f * 2.1, 3, sr) * 1.1;
            lp += (n - lp) * 0.02; // (the low push of the swing)
            v = (air + lp * 1.4) * env;
            if (kind === 'whirl') {
                // chopped by the turns: 16 → 9 turns a second as it slows
                ph += (2 * Math.PI * (16 - 7 * u)) / sr;
                v *= 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(ph), 2);
            }
            v *= 0.8;
        } else if (kind === 'thump') {
            ph += (2 * Math.PI * (95 + 60 * Math.exp(-t / 0.02))) / sr;
            lp += (n - lp) * 0.25;
            v = Math.sin(ph) * Math.exp(-t / 0.06) * 0.9 + lp * Math.exp(-t / 0.015) * 0.5 + reso(a, n, 2600, 4, sr) * Math.exp(-t / 0.01) * 0.6;
        } else if (kind === 'clack') {
            // two knocks 45 ms apart, the wood ringing a moment (700 / 1150 Hz)
            const k1 = Math.exp(-t / 0.012), t2 = t - 0.045, k2 = t2 > 0 ? Math.exp(-t2 / 0.01) * 0.7 : 0;
            v = reso(a, n, 1150, 14, sr) * (k1 + k2) * 2.4 + reso(b, n, 700, 10, sr) * (k1 * 0.8 + k2) * 2 + n * (k1 + k2) * 0.15;
        } else if (kind === 'slap') {
            lp += (n - lp) * 0.6;
            v = lp * Math.exp(-t / 0.018) * 1.1 + reso(a, n, 380, 3, sr) * Math.exp(-t / 0.04) * 1.6 + reso(b, n, 4200, 2, sr) * Math.exp(-t / 0.05) * 0.25; // (the pages' rustle)
        } else if (kind === 'thud') {
            ph += (2 * Math.PI * (70 + 40 * Math.exp(-t / 0.03))) / sr;
            lp += (n - lp) * 0.08;
            v = Math.sin(ph) * Math.exp(-t / 0.07) * 0.8 + lp * Math.exp(-t / 0.04) * 1.2;
        } else if (kind === 'clink') {
            ph += (2 * Math.PI * 85) / sr;
            lp += (n - lp) * 0.1;
            v = Math.sin(ph) * Math.exp(-t / 0.05) * 0.6 + lp * Math.exp(-t / 0.03);
            // the coins inside: small pings at their own moments and pitches
            for (let k = 0; k < 5; k++) {
                const tk = 0.01 + k * 0.037 + (k % 2) * 0.011;
                if (t > tk) v += Math.sin(2 * Math.PI * (3100 + 900 * ((k * 7) % 5)) * (t - tk)) * Math.exp(-(t - tk) / 0.035) * (0.28 - k * 0.03);
            }
        } else if (kind === 'splash') {
            // the plop (a falling pitch: the cavity closing), then the spray of drops
            ph += (2 * Math.PI * (420 * Math.exp(-t / 0.06) + 90)) / sr;
            lp += (n - lp) * 0.3;
            lp2 += (n - lp2) * 0.05;
            const drops = rnd() < 0.0016 * Math.exp(-t / 0.35) ? 1 : 0;
            if (drops) { c.y1 += 0.8; ph2 = 1800 + 2600 * Math.abs(rnd()); }
            v = Math.sin(ph) * Math.exp(-t / 0.09) * 0.7 + lp * Math.exp(-t / 0.12) * 0.5 + lp2 * Math.exp(-t / 0.3) * 0.8 + reso(c, 0, ph2 || 2400, 18, sr) * 0.9;
        }
        d[i] = v;
    }
    // normalise softly, fade the ends (no clicks)
    let peak = 1e-6;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    const g = 0.85 / peak, fade = Math.floor(sr * 0.004);
    for (let i = 0; i < len; i++) {
        let k = g;
        if (i < fade) k *= i / fade;
        if (i > len - fade) k *= (len - i) / fade;
        d[i] = Math.tanh(d[i] * k * 1.1);
    }
    return buf;
}
