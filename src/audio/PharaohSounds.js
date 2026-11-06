/**
 * PharaohSounds.js — the pyramids (PharaohLife.js), synthesized ahead (SoundManager.prewarmStep):
 *   lid     a stone lid grinding aside, a heavy thud      rise    dry bandages and bones stirring, a hollow breath    chant  the pharaoh's strange words: a low reedy drone with vowels
 *   sand    the sand wave: a hiss rushing out, a deep boom    locust a swarm: hundreds of dry wings and chirrs   curse  a falling dissonant chord and a whisper
 *   staff   a staff blow: wood on air, a dull crack          dart   a volley of darts: sharp hisses and a few thuds in stone    plate  a stone plate sinking: a click and a grinding
 *   floor   the false floor giving way: sand pouring, a rumble   torch  a torch catching: a whoosh and crackle                 die    the pharaoh's end: dust pouring, a deep falling groan
 */
export const PHARAOH_SOUNDS = ['lid', 'rise', 'chant', 'sand', 'locust', 'curse', 'staff', 'dart', 'plate', 'floor', 'torch', 'die'];
const DUR = { lid: 1.6, rise: 1.8, chant: 2.2, sand: 1.4, locust: 2.0, curse: 2.2, staff: 0.5, dart: 0.9, plate: 1.0, floor: 2.0, torch: 0.9, die: 3.2 };
const TAU = Math.PI * 2;
function noise(d, sr, at, dur, amp, lpK, decay, att = 400) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let y = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) { const t = i / sr; y += (Math.random() * 2 - 1 - y) * lpK; d[i0 + i] += y * amp * Math.min(1, t * att) * Math.exp(-t * decay); }
}
function tone(d, sr, at, dur, f0, f1, amp, decay, harm = 1) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr; ph += (f0 + (f1 - f0) * t / dur) / sr;
        let s = 0; for (let h = 1; h <= harm; h++) s += Math.sin(TAU * ph * h) / h;
        d[i0 + i] += s * amp * Math.min(1, t * 300) * Math.exp(-t * decay);
    }
}
/** A reedy voice with two formants (a dead king's drone). */
function drone(d, sr, at, dur, f0, f1, amp, f1c, f2c) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, f = (f0 + (f1 - f0) * t / dur) * (1 + 0.012 * Math.sin(TAU * 4.7 * t));
        ph += f / sr;
        let s = 0;
        for (let h = 1; h <= 24; h++) { const hf = h * f, w = Math.exp(-0.5 * ((hf - f1c) / 140) ** 2) + 0.5 * Math.exp(-0.5 * ((hf - f2c) / 220) ** 2); s += w * Math.sin(TAU * ph * h) / h; }
        d[i0 + i] += s * amp * Math.min(1, t / 0.08) * Math.min(1, (dur - t) / 0.2) * (1 + 0.25 * (Math.random() - 0.5));
    }
}
export function synthPharaoh(ctx, kind) {
    const sr = ctx.sampleRate, buf = ctx.createBuffer(1, Math.floor(sr * (DUR[kind] || 1)), sr), d = buf.getChannelData(0);
    switch (kind) {
        case 'lid': noise(d, sr, 0, 1.3, 0.35, 0.05, 1.6, 20); tone(d, sr, 0, 1.2, 60, 48, 0.25, 1.5); tone(d, sr, 1.3, 0.3, 55, 28, 0.9, 12); noise(d, sr, 1.3, 0.2, 0.5, 0.3, 20, 3000); break;
        case 'rise': for (let k = 0; k < 14; k++) noise(d, sr, Math.random() * 1.5, 0.05 + Math.random() * 0.06, 0.3, 0.3, 40, 800); noise(d, sr, 0.2, 1.2, 0.12, 0.04, 2); drone(d, sr, 0.5, 1.1, 90, 70, 0.1, 500, 1000); break;
        case 'chant': drone(d, sr, 0, 0.6, 105, 98, 0.35, 520, 1500); drone(d, sr, 0.7, 0.5, 98, 110, 0.35, 800, 2300); drone(d, sr, 1.3, 0.8, 110, 92, 0.35, 420, 1200); break;
        case 'sand': noise(d, sr, 0, 1.3, 0.5, 0.85, 2.2, 40); tone(d, sr, 0, 0.7, 70, 40, 0.5, 3); break;
        case 'locust': for (let k = 0; k < 90; k++) noise(d, sr, Math.random() * 1.8, 0.04 + Math.random() * 0.06, 0.1, 0.6, 40, 1200); noise(d, sr, 0, 2.0, 0.08, 0.35, 0.8, 8); break;
        case 'curse': for (const f of [180, 190, 267, 281]) tone(d, sr, 0, 2.0, f, f * 0.7, 0.1, 1.2, 3); noise(d, sr, 0.3, 1.6, 0.1, 0.15, 1.2, 8); drone(d, sr, 0.4, 1.4, 120, 80, 0.12, 380, 900); break;
        case 'staff': noise(d, sr, 0, 0.25, 0.4, 0.1, 8, 600); tone(d, sr, 0.14, 0.15, 160, 70, 0.7, 25); noise(d, sr, 0.14, 0.08, 0.5, 0.6, 50, 4000); break;
        case 'dart': for (let k = 0; k < 8; k++) { noise(d, sr, k * 0.045, 0.1, 0.3, 0.85, 30, 2000); tone(d, sr, k * 0.045 + 0.09, 0.07, 600, 300, 0.25, 40); } break;
        case 'plate': tone(d, sr, 0, 0.05, 900, 400, 0.6, 60); noise(d, sr, 0.05, 0.9, 0.3, 0.04, 2.2, 20); tone(d, sr, 0.05, 0.8, 55, 38, 0.3, 2); break;
        case 'floor': noise(d, sr, 0, 1.9, 0.5, 0.5, 1.2, 15); tone(d, sr, 0, 1.6, 48, 30, 0.45, 1.4); for (let k = 0; k < 20; k++) noise(d, sr, Math.random() * 1.5, 0.05, 0.3, 0.3, 40, 800); break;
        case 'torch': noise(d, sr, 0, 0.5, 0.5, 0.5, 4, 80); for (let k = 0; k < 10; k++) noise(d, sr, 0.1 + Math.random() * 0.7, 0.02, 0.4, 0.8, 80, 3000); break;
        case 'die': noise(d, sr, 0, 3.0, 0.45, 0.06, 0.8, 10); drone(d, sr, 0, 2.4, 120, 45, 0.4, 340, 800); for (let k = 0; k < 24; k++) noise(d, sr, Math.random() * 2.6, 0.04, 0.2, 0.3, 40, 800); break;
        default: break;
    }
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < d.length; i++) d[i] *= 0.8 / peak;
    return buf;
}
