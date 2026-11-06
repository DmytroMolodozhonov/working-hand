/**
 * VampireSounds.js — Count Sracula's castle (VampireLife.js), synthesized ahead (SoundManager.prewarmStep):
 *   squeak  a bat's high chirp (falling, rough)            flap   a bat's wings, a few quick leathery beats   swarm  the cloud of bats rising (many chirps)
 *   bite    a bite: a wet snap and a tearing hiss          hiss   the count's hiss — teeth bared             laugh  his low, slow laugh (a voice with vowels)
 *   rush    the dash in: a cape snapping, the air torn     turn   the turning into a bat: smoke rushing, a rising chord, a sharp crack
 *   crumble his end: dust pouring, a deep falling groan     coffin the coffin's lid: heavy wood grinding on stone, a thud
 */
export const VAMPIRE_SOUNDS = ['squeak', 'flap', 'swarm', 'bite', 'hiss', 'laugh', 'rush', 'turn', 'crumble', 'coffin'];
const DUR = { squeak: 0.25, flap: 0.4, swarm: 2.2, bite: 0.5, hiss: 0.9, laugh: 1.9, rush: 0.6, turn: 1.4, crumble: 2.8, coffin: 1.3 };
const TAU = Math.PI * 2;
const VOWEL = { a: [[700, 120, 1], [1150, 160, 0.5], [2500, 250, 0.15]], o: [[450, 90, 1], [800, 120, 0.5], [2300, 250, 0.1]], e: [[500, 90, 1], [1800, 160, 0.45], [2500, 250, 0.2]] };

function voice(d, sr, at, dur, f0, f1, vowel, amp, { rough = 0.3, att = 0.03, decay = 2, vib = 0.012 } = {}) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr), F = VOWEL[vowel] || VOWEL.a;
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, f = (f0 + (f1 - f0) * (t / dur)) * (1 + vib * Math.sin(TAU * 5 * t));
        ph += f / sr;
        let s = 0;
        for (let h = 1; h <= 22; h++) {
            const hf = h * f;
            let w = 0;
            for (const [fc, bw, a] of F) { const x = (hf - fc) / bw; w += a * Math.exp(-0.5 * x * x); }
            s += w * Math.sin(TAU * ph * h) / h;
        }
        d[i0 + i] += s * amp * Math.min(1, t / att) * Math.exp(-t * decay) * (1 + rough * (Math.random() - 0.5) * 0.4);
    }
}
function noise(d, sr, at, dur, amp, lpK, decay, att = 400) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let y = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr;
        y += (Math.random() * 2 - 1 - y) * lpK;
        d[i0 + i] += y * amp * Math.min(1, t * att) * Math.exp(-t * decay);
    }
}
function tone(d, sr, at, dur, f0, f1, amp, decay) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr;
        ph += (f0 + (f1 - f0) * t / dur) / sr;
        d[i0 + i] += Math.sin(TAU * ph) * amp * Math.min(1, t * 300) * Math.exp(-t * decay);
    }
}
function chirp(d, sr, at, f0, f1, dur, amp) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / n;
        ph += (f0 + (f1 - f0) * t) / sr;
        const env = Math.sin(Math.PI * t) ** 1.5;
        d[i0 + i] += (Math.sin(TAU * ph) + 0.35 * Math.sin(TAU * ph * 2.02)) * amp * env * (1 + 0.3 * (Math.random() - 0.5));
    }
}

export function synthVampire(ctx, kind) {
    const sr = ctx.sampleRate, buf = ctx.createBuffer(1, Math.floor(sr * (DUR[kind] || 1)), sr), d = buf.getChannelData(0);
    switch (kind) {
        case 'squeak': chirp(d, sr, 0, 5200, 3100, 0.07, 0.35); chirp(d, sr, 0.09, 5600, 3600, 0.06, 0.25); break;
        case 'flap': for (let k = 0; k < 4; k++) noise(d, sr, k * 0.085, 0.07, 0.35, 0.18, 40, 900); break;
        case 'swarm':
            for (let k = 0; k < 46; k++) chirp(d, sr, Math.random() * 1.9, 4200 + Math.random() * 2400, 2600 + Math.random() * 1400, 0.05 + Math.random() * 0.05, 0.08 + Math.random() * 0.08);
            for (let k = 0; k < 40; k++) noise(d, sr, Math.random() * 2, 0.06, 0.08, 0.2, 40, 900);
            break;
        case 'bite': noise(d, sr, 0, 0.06, 0.9, 0.7, 60, 4000); noise(d, sr, 0.04, 0.4, 0.35, 0.5, 8); tone(d, sr, 0, 0.12, 180, 90, 0.4, 30); break;
        case 'hiss': noise(d, sr, 0, 0.85, 0.5, 0.85, 2.5, 30); voice(d, sr, 0, 0.5, 120, 95, 'e', 0.12, { rough: 0.9, decay: 4 }); break;
        case 'laugh': for (let k = 0; k < 5; k++) voice(d, sr, k * 0.3, 0.26, 115 - k * 6, 95 - k * 6, k % 2 ? 'a' : 'o', 0.45, { rough: 0.35, att: 0.02, decay: 5 }); break;
        case 'rush': noise(d, sr, 0, 0.5, 0.6, 0.12, 4, 60); noise(d, sr, 0.02, 0.08, 0.6, 0.6, 30); tone(d, sr, 0, 0.4, 220, 90, 0.15, 6); break;
        case 'turn':
            noise(d, sr, 0, 1.2, 0.45, 0.08, 1.6, 8);
            for (const f of [220, 277, 330, 415]) tone(d, sr, 0.1, 1.1, f * 0.8, f * 1.25, 0.08, 1.8);
            noise(d, sr, 0.95, 0.12, 0.8, 0.7, 40, 4000);
            break;
        case 'crumble': noise(d, sr, 0, 2.6, 0.45, 0.06, 0.9, 10); voice(d, sr, 0, 1.8, 140, 50, 'o', 0.45, { rough: 0.6, att: 0.05, decay: 1.2 }); for (let k = 0; k < 18; k++) noise(d, sr, 0.4 + Math.random() * 2, 0.05, 0.25, 0.4, 50, 2000); break;
        case 'coffin': noise(d, sr, 0, 1.0, 0.35, 0.05, 1.8, 20); tone(d, sr, 0, 0.9, 70, 55, 0.25, 2); tone(d, sr, 1.0, 0.3, 60, 30, 0.9, 12); noise(d, sr, 1.0, 0.2, 0.5, 0.15, 25); break;
        default: break;
    }
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < d.length; i++) d[i] *= 0.8 / peak;
    return buf;
}
