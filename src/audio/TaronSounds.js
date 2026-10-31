/**
 * TaronSounds.js — the voices and noises of the Tarons (Taron.js), synthesized ahead (SoundManager.prewarmStep):
 *   roar   a deep bellow as a Taron sees a trespasser        grunt  a pig-like grunt (idle, a swing)       hurt  a thick cry when hit
 *   die    a long falling groan and a thud                   step   one heavy footfall (a low thump)      wind  the axe-hammer going up (a creak and a whoosh)
 *   blade  the blade smashing down (a crack and a ring)      hammer the hammer side (a dull boom)        snort  a wet snort
 * Voices are a low buzzing source (a falling pitch, harmonics, roughness) shaped by vowel formants — an enormous throat: ~55–110 Hz.
 */
export const TARON_SOUNDS = ['roar', 'grunt', 'hurt', 'die', 'step', 'wind', 'blade', 'hammer', 'snort'];
const DUR = { roar: 1.5, grunt: 0.55, hurt: 0.65, die: 1.9, step: 0.55, wind: 0.95, blade: 0.9, hammer: 0.9, snort: 0.4 };
const TAU = Math.PI * 2;
const VOWEL = { a: [[700, 120, 1], [1100, 150, 0.5], [2400, 250, 0.15]], o: [[450, 90, 1], [800, 120, 0.5], [2300, 250, 0.1]], u: [[300, 70, 1], [700, 120, 0.3], [2300, 250, 0.08]] };

function voice(d, sr, at, dur, f0, f1, vowel, amp, { rough = 0.4, att = 0.04, decay = 3, vib = 0.01 } = {}) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr), F = VOWEL[vowel] || VOWEL.a, H = 26;
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, f = (f0 + (f1 - f0) * (t / dur)) * (1 + vib * Math.sin(TAU * 4.5 * t)) * (1 + rough * 0.04 * (Math.random() - 0.5));
        ph += f / sr;
        let s = 0;
        for (let h = 1; h <= H; h++) {
            const hf = h * f;
            let w = 0;
            for (const [fc, bw, a] of F) { const x = (hf - fc) / bw; w += a * Math.exp(-0.5 * x * x); }
            s += w * Math.sin(TAU * ph * h) / h;
        }
        d[i0 + i] += s * amp * Math.min(1, t / att) * Math.exp(-t * decay) * (1 + rough * (Math.random() - 0.5) * 0.5);
    }
}
function noise(d, sr, at, dur, amp, lpK, decay, att = 400) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr;
        lp += ((Math.random() * 2 - 1) - lp) * lpK; lp2 += (lp - lp2) * 0.6;
        d[i0 + i] += lp2 * amp * Math.exp(-t * decay) * Math.min(1, t * att);
    }
}
function tone(d, sr, at, dur, f0, f1, amp, decay) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, f = f0 + (f1 - f0) * (t / dur);
        ph += f / sr;
        d[i0 + i] += Math.sin(TAU * ph) * amp * Math.exp(-t * decay) * Math.min(1, t * 200);
    }
}

export function synthTaron(ctx, kind) {
    const sr = ctx.sampleRate, buf = ctx.createBuffer(1, Math.floor(sr * (DUR[kind] || 1)), sr), d = buf.getChannelData(0);
    switch (kind) {
        case 'roar': voice(d, sr, 0, 1.3, 72, 52, 'a', 0.6, { rough: 0.95, att: 0.12, decay: 1.4 }); voice(d, sr, 0.05, 1.1, 110, 80, 'o', 0.25, { rough: 0.8, att: 0.1, decay: 1.8 }); noise(d, sr, 0, 1.0, 0.12, 0.15, 2.2, 20); break;
        case 'grunt': voice(d, sr, 0, 0.35, 95, 70, 'o', 0.55, { rough: 0.7, att: 0.02, decay: 5 }); noise(d, sr, 0, 0.2, 0.14, 0.3, 14); break;
        case 'hurt': voice(d, sr, 0, 0.5, 140, 85, 'a', 0.55, { rough: 0.6, att: 0.015, decay: 3.8 }); break;
        case 'die': voice(d, sr, 0, 1.5, 120, 40, 'o', 0.55, { rough: 0.8, att: 0.03, decay: 1.6 }); noise(d, sr, 0.9, 0.7, 0.2, 0.08, 4); tone(d, sr, 1.25, 0.6, 62, 28, 0.9, 6); break;
        case 'step': tone(d, sr, 0, 0.5, 58, 28, 0.95, 8); noise(d, sr, 0, 0.1, 0.5, 0.1, 40); noise(d, sr, 0.01, 0.3, 0.12, 0.35, 14); break;
        case 'wind': noise(d, sr, 0, 0.9, 0.35, 0.1, 2.2, 20); tone(d, sr, 0, 0.8, 90, 150, 0.12, 2.5); noise(d, sr, 0.1, 0.2, 0.12, 0.6, 18); break; // (a creak, the air)
        case 'blade': noise(d, sr, 0, 0.12, 1.0, 0.6, 50); tone(d, sr, 0, 0.7, 480, 300, 0.22, 6); tone(d, sr, 0, 0.5, 70, 30, 0.8, 9); noise(d, sr, 0.02, 0.5, 0.25, 0.4, 10); break;
        case 'hammer': tone(d, sr, 0, 0.8, 55, 24, 1.0, 5.5); noise(d, sr, 0, 0.1, 0.8, 0.12, 45); noise(d, sr, 0.03, 0.6, 0.2, 0.2, 7); break;
        case 'snort': noise(d, sr, 0, 0.3, 0.45, 0.4, 12, 60); voice(d, sr, 0, 0.18, 110, 85, 'o', 0.25, { rough: 0.9, decay: 10 }); break;
        default: break;
    }
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 1.2);
    return buf;
}
