/**
 * TitanSounds.js — the titans (Titans.js), synthesized ahead (SoundManager.prewarmStep). Deep and huge: low tones, long tails.
 *   roar    a slow, deep roar (a voice with vowels an octave below a man's, rough)      windup  stone and iron grinding as the arm rises
 *   step    a footfall: a sub-thump and a rumble that rolls away                          slam    a fist / stomp on the ground: a crack, the boom, debris
 *   fire    a fireball thrown: a whoosh of flame                                          throw   a boulder torn off and hurled: grind + whoosh
 *   burst   a fiery burst: a boom with crackle                                            crash   a boulder / spikes: rock smashing, stones falling
 *   frost   ice crackling, growing fast                                                    charge  the mirror gathering sunlight: a rising, shimmering chord
 *   ray     the sun ray: a bright, roaring hiss                                            magnet  the magnet: a deep hum and metallic rattles
 *   dark    a wave of darkness: a falling whoosh, a hollow drone                           rumble  under the sand: a long, growing rumble
 *   thunder a thunderclap with its long roll                                               death   its fall: a long groan falling, the crash, a ringing chord rising (the shard)
 */
export const TITAN_SOUNDS = ['roar', 'windup', 'step', 'slam', 'fire', 'throw', 'burst', 'crash', 'frost', 'charge', 'ray', 'magnet', 'dark', 'rumble', 'thunder', 'death'];
const DUR = { roar: 2.6, windup: 1.4, step: 1.6, slam: 2.2, fire: 1.0, throw: 1.2, burst: 1.8, crash: 1.8, frost: 1.2, charge: 1.4, ray: 1.4, magnet: 1.8, dark: 2.2, rumble: 2.6, thunder: 3.2, death: 5.5 };
const TAU = Math.PI * 2;
const VOWEL = { a: [[700, 140, 1], [1150, 180, 0.5], [2500, 300, 0.12]], o: [[430, 100, 1], [780, 140, 0.5], [2300, 300, 0.08]], u: [[320, 90, 1], [700, 130, 0.35], [2300, 300, 0.05]] };

function voice(d, sr, at, dur, f0, f1, vowel, amp, { rough = 0.5, att = 0.08, decay = 1.2, vib = 0.02 } = {}) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr), F = VOWEL[vowel] || VOWEL.a;
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, f = (f0 + (f1 - f0) * (t / dur)) * (1 + vib * Math.sin(TAU * 4 * t));
        ph += f / sr;
        let s = 0;
        for (let h = 1; h <= 40; h++) {
            const hf = h * f;
            let w = 0;
            for (const [fc, bw, a] of F) { const x = (hf - fc) / bw; w += a * Math.exp(-0.5 * x * x); }
            s += w * Math.sin(TAU * ph * h) / Math.sqrt(h);
        }
        d[i0 + i] += s * amp * Math.min(1, t / att) * Math.exp(-t * decay) * (1 + rough * (Math.random() - 0.5));
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
function tone(d, sr, at, dur, f0, f1, amp, decay, att = 300) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr;
        ph += (f0 + (f1 - f0) * t / dur) / sr;
        d[i0 + i] += Math.sin(TAU * ph) * amp * Math.min(1, t * att) * Math.exp(-t * decay);
    }
}
/** Rising noise (a swell): amp grows to `peak` at `at + rise`, then decays. */
function swell(d, sr, at, dur, amp, lpK, rise) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let y = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, e = t < rise ? t / rise : Math.exp(-(t - rise) * 2.5);
        y += (Math.random() * 2 - 1 - y) * lpK;
        d[i0 + i] += y * amp * e;
    }
}

export function synthTitan(ctx, kind) {
    const sr = ctx.sampleRate, buf = ctx.createBuffer(1, Math.floor(sr * (DUR[kind] || 1)), sr), d = buf.getChannelData(0);
    switch (kind) {
        case 'roar': voice(d, sr, 0, 2.4, 62, 44, 'o', 0.9, { rough: 0.8, att: 0.25, decay: 0.6 }); voice(d, sr, 0.05, 2.3, 93, 66, 'a', 0.35, { rough: 0.9, att: 0.3, decay: 0.7 }); noise(d, sr, 0, 2.4, 0.25, 0.08, 0.8, 4); break;
        case 'windup': swell(d, sr, 0, 1.4, 0.4, 0.05, 1.0); for (let k = 0; k < 14; k++) noise(d, sr, Math.random() * 1.2, 0.08, 0.2, 0.4, 30, 2000); tone(d, sr, 0, 1.3, 50, 75, 0.3, 0.8, 4); break;
        case 'step': tone(d, sr, 0, 0.8, 48, 30, 1, 4, 800); noise(d, sr, 0, 1.5, 0.45, 0.03, 2, 200); for (let k = 0; k < 8; k++) noise(d, sr, 0.1 + Math.random() * 0.8, 0.05, 0.12, 0.4, 40, 2000); break;
        case 'slam': noise(d, sr, 0, 0.06, 1, 0.8, 50, 8000); tone(d, sr, 0, 1.2, 60, 28, 1, 3, 2000); noise(d, sr, 0, 2.1, 0.5, 0.04, 1.4, 300); for (let k = 0; k < 20; k++) noise(d, sr, 0.15 + Math.random() * 1.5, 0.06, 0.15, 0.35, 40, 2000); break;
        case 'fire': swell(d, sr, 0, 1.0, 0.7, 0.25, 0.25); noise(d, sr, 0.05, 0.9, 0.3, 0.6, 3, 50); break;
        case 'throw': for (let k = 0; k < 10; k++) noise(d, sr, Math.random() * 0.4, 0.07, 0.25, 0.3, 30, 2000); swell(d, sr, 0.3, 0.9, 0.5, 0.12, 0.3); break;
        case 'burst': noise(d, sr, 0, 0.08, 1, 0.7, 40, 8000); tone(d, sr, 0, 0.9, 70, 35, 0.8, 4, 2000); noise(d, sr, 0.02, 1.7, 0.45, 0.15, 1.8, 100); for (let k = 0; k < 30; k++) noise(d, sr, 0.1 + Math.random() * 1.3, 0.02, 0.2, 0.9, 80, 5000); break;
        case 'crash': noise(d, sr, 0, 0.1, 0.9, 0.5, 30, 6000); tone(d, sr, 0, 0.7, 80, 40, 0.6, 5, 2000); for (let k = 0; k < 26; k++) noise(d, sr, 0.05 + Math.random() * 1.5, 0.05 + Math.random() * 0.05, 0.25, 0.4, 35, 2000); break;
        case 'frost': for (let k = 0; k < 60; k++) noise(d, sr, Math.random() * 1.0, 0.015, 0.4, 0.95, 120, 9000); tone(d, sr, 0, 1.1, 1800, 2600, 0.06, 2, 20); swell(d, sr, 0, 1.1, 0.2, 0.5, 0.3); break;
        case 'charge': for (const f of [220, 330, 440, 660]) tone(d, sr, 0, 1.4, f * 0.7, f * 1.3, 0.12, 0.6, 3); swell(d, sr, 0, 1.4, 0.2, 0.6, 1.2); break;
        case 'ray': swell(d, sr, 0, 1.4, 0.8, 0.7, 0.05); tone(d, sr, 0, 1.3, 880, 760, 0.15, 1.6, 50); tone(d, sr, 0, 1.3, 110, 90, 0.4, 1.4, 50); break;
        case 'magnet': tone(d, sr, 0, 1.7, 55, 58, 0.6, 0.9, 10); tone(d, sr, 0, 1.7, 110, 116, 0.25, 0.9, 10); for (let k = 0; k < 30; k++) tone(d, sr, Math.random() * 1.5, 0.05, 1200 + Math.random() * 2400, 900, 0.08, 40, 3000); break;
        case 'dark': swell(d, sr, 0, 2.2, 0.6, 0.06, 0.4); tone(d, sr, 0, 2.1, 70, 40, 0.5, 1.1, 5); tone(d, sr, 0.1, 2, 105, 62, 0.25, 1.1, 5); break;
        case 'rumble': swell(d, sr, 0, 2.6, 0.9, 0.02, 2.0); tone(d, sr, 0, 2.5, 30, 42, 0.6, 0.4, 2); break;
        case 'thunder': noise(d, sr, 0, 0.05, 1, 0.9, 60, 9000); noise(d, sr, 0.02, 3.1, 0.8, 0.05, 1.0, 40); for (let k = 0; k < 6; k++) noise(d, sr, 0.3 + Math.random() * 1.8, 0.4, 0.35, 0.06, 3, 30); break;
        case 'death':
            voice(d, sr, 0, 3.2, 70, 28, 'u', 0.9, { rough: 0.9, att: 0.3, decay: 0.45 });
            noise(d, sr, 2.4, 0.1, 1, 0.6, 30, 6000); tone(d, sr, 2.4, 1.6, 55, 25, 1, 2, 2000); noise(d, sr, 2.4, 3, 0.6, 0.04, 1, 200);
            for (const f of [262, 330, 392, 523]) tone(d, sr, 3.0, 2.4, f, f * 1.02, 0.12, 1.1, 2);
            break;
        default: break;
    }
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < d.length; i++) d[i] *= 0.85 / peak;
    return buf;
}
