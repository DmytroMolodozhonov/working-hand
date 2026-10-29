/**
 * CanarySounds.js — the voices and noises of the Canaries (Canaries.js), synthesized ahead (SoundManager.prewarmStep):
 *   grr     «Грр!» — a low rough snarl as they see a trespasser          ha      «Ха!» — the shout of a throw
 *   lift    a grunt of effort lifting a boulder                           hurt    a short cry when hit
 *   die     a falling last groan                                          mutter  contented mumbling round the fire (two or three syllables)
 *   thud    a boulder hitting the ground                                  hit     a boulder hitting a body
 *   whoosh  a rock cutting the air
 * A voice is a buzzing source (harmonics of a falling pitch with a little roughness) shaped by vowel formants — one «а», «о», «у».
 */
export const CANARY_SOUNDS = ['grr', 'ha', 'lift', 'hurt', 'die', 'mutter', 'thud', 'hit', 'whoosh'];
const DUR = { grr: 0.75, ha: 0.45, lift: 0.7, hurt: 0.5, die: 1.1, mutter: 1.0, thud: 0.6, hit: 0.5, whoosh: 0.7 };
const TAU = Math.PI * 2;
const VOWEL = { a: [[800, 120, 1], [1250, 150, 0.5], [2600, 250, 0.2]], o: [[520, 90, 1], [900, 120, 0.5], [2500, 250, 0.12]], u: [[330, 70, 1], [800, 120, 0.3], [2400, 250, 0.1]], e: [[560, 100, 1], [1800, 160, 0.5], [2500, 250, 0.15]] };

/** A voiced sound: pitch f(t) Hz, vowel formants, roughness (0…1), amplitude envelope attack/decay. */
function voice(d, sr, at, dur, f0, f1, vowel, amp, { rough = 0.3, att = 0.03, decay = 4, vib = 0.012 } = {}) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr), F = VOWEL[vowel] || VOWEL.a, H = 22;
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, f = (f0 + (f1 - f0) * (t / dur)) * (1 + vib * Math.sin(TAU * 5.5 * t)) * (1 + rough * 0.03 * (Math.random() - 0.5));
        ph += f / sr;
        let s = 0;
        for (let h = 1; h <= H; h++) {
            const hf = h * f;
            let w = 0;
            for (const [fc, bw, a] of F) { const x = (hf - fc) / bw; w += a * Math.exp(-0.5 * x * x); }
            s += w * Math.sin(TAU * ph * h) / h;
        }
        const env = Math.min(1, t / att) * Math.exp(-t * decay);
        d[i0 + i] += s * amp * env * (1 + rough * (Math.random() - 0.5) * 0.5);
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

export function synthCanary(ctx, kind) {
    const sr = ctx.sampleRate, buf = ctx.createBuffer(1, Math.floor(sr * (DUR[kind] || 1)), sr), d = buf.getChannelData(0);
    switch (kind) {
        case 'grr': voice(d, sr, 0, 0.7, 120, 78, 'o', 0.5, { rough: 0.9, att: 0.05, decay: 2.2 }); noise(d, sr, 0, 0.5, 0.18, 0.22, 3.5, 40); break;
        case 'ha': voice(d, sr, 0, 0.3, 230, 150, 'a', 0.55, { rough: 0.4, att: 0.012, decay: 6 }); noise(d, sr, 0, 0.12, 0.2, 0.5, 20); break;
        case 'lift': voice(d, sr, 0, 0.55, 105, 140, 'u', 0.45, { rough: 0.7, att: 0.06, decay: 2.8 }); noise(d, sr, 0.05, 0.4, 0.12, 0.2, 5, 30); break;
        case 'hurt': voice(d, sr, 0, 0.35, 320, 190, 'e', 0.5, { rough: 0.3, att: 0.01, decay: 5 }); break;
        case 'die': voice(d, sr, 0, 0.95, 210, 70, 'o', 0.5, { rough: 0.6, att: 0.02, decay: 2.4 }); noise(d, sr, 0.3, 0.6, 0.08, 0.1, 4); break;
        case 'mutter': { const syl = [['o', 0, 130, 112], ['u', 0.3, 118, 104], ['a', 0.58, 140, 105]]; for (const [v, at, f0, f1] of syl) voice(d, sr, at, 0.22, f0, f1, v, 0.32, { rough: 0.35, att: 0.03, decay: 8, vib: 0.02 }); break; }
        case 'thud': tone(d, sr, 0, 0.5, 70, 32, 0.9, 7); noise(d, sr, 0, 0.12, 0.8, 0.12, 30); noise(d, sr, 0.02, 0.4, 0.25, 0.4, 14); break;
        case 'hit': noise(d, sr, 0, 0.06, 1.0, 0.5, 60); tone(d, sr, 0, 0.35, 120, 55, 0.7, 10); break;
        case 'whoosh': noise(d, sr, 0, 0.65, 0.5, 0.18, 4.5, 40); break;
        default: break;
    }
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 1.2);
    return buf;
}
