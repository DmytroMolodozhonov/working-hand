/**
 * PlantSounds.js — the sounds of the plant creatures (Plants.js), synthesized ahead (SoundManager.prewarmStep):
 *   rustle  leaves stirring (a telewilpin or a head being touched)      prick  a thorn's tick and a tiny glassy ring
 *   lash    a tendril whipping through the air                          snap   the trap's jaws slamming shut
 *   chomp   wet crunching bites                                         gulp   a thick swallow, the throat swelling
 *   spit    a wet burst and a cough of leaves                           burn   leaves crackling in fire
 *   fall    the stem cracking and the plant toppling
 *   whoosh  the Brightflower's fire breath (a roaring rush)  flare  its cup opening with a soft flame  hush  the flame going out
 */
export const PLANT_SOUNDS = ['rustle', 'prick', 'lash', 'snap', 'chomp', 'gulp', 'spit', 'burn', 'fall', 'whoosh', 'flare', 'hush'];
const DUR = { rustle: 0.9, prick: 0.3, lash: 0.35, snap: 0.5, chomp: 0.9, gulp: 0.7, spit: 0.6, burn: 1.2, fall: 1.4, whoosh: 0.9, flare: 0.8, hush: 0.7 };
const TAU = Math.PI * 2;

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

export function synthPlant(ctx, kind) {
    const sr = ctx.sampleRate, buf = ctx.createBuffer(1, Math.floor(sr * (DUR[kind] || 1)), sr), d = buf.getChannelData(0);
    switch (kind) {
        case 'rustle': for (let k = 0; k < 7; k++) noise(d, sr, k * 0.09 + Math.random() * 0.04, 0.12, 0.5, 0.55, 22); break;
        case 'prick': noise(d, sr, 0, 0.03, 0.9, 0.8, 120); tone(d, sr, 0, 0.25, 2600, 2100, 0.18, 14); tone(d, sr, 0.01, 0.2, 3900, 3300, 0.08, 18); break;
        case 'lash': noise(d, sr, 0, 0.3, 0.7, 0.25, 11, 60); tone(d, sr, 0, 0.3, 900, 220, 0.12, 9); break;
        case 'snap': noise(d, sr, 0, 0.05, 1.3, 0.7, 70); tone(d, sr, 0, 0.35, 150, 70, 0.7, 12); noise(d, sr, 0.03, 0.3, 0.35, 0.18, 10); break;
        case 'chomp': for (let k = 0; k < 4; k++) { const at = k * 0.2; noise(d, sr, at, 0.14, 0.85, 0.3, 20); tone(d, sr, at, 0.16, 190 - k * 14, 85, 0.45, 18); } break;
        case 'gulp': tone(d, sr, 0, 0.55, 150, 55, 0.75, 4.5); noise(d, sr, 0.02, 0.4, 0.3, 0.1, 6); tone(d, sr, 0.18, 0.3, 300, 120, 0.25, 9); break;
        case 'spit': noise(d, sr, 0, 0.35, 0.8, 0.35, 9); tone(d, sr, 0.02, 0.35, 420, 140, 0.35, 9); break;
        case 'burn': for (let k = 0; k < 24; k++) noise(d, sr, Math.random() * 1.05, 0.02 + Math.random() * 0.03, 0.55, 0.7, 80); noise(d, sr, 0, 1.1, 0.25, 0.08, 3.5, 20); break;
        case 'fall': noise(d, sr, 0, 0.1, 1.0, 0.5, 40); tone(d, sr, 0.02, 0.5, 90, 40, 0.65, 5); noise(d, sr, 0.5, 0.6, 0.4, 0.12, 5); tone(d, sr, 0.52, 0.4, 70, 38, 0.5, 8); break;
        case 'whoosh': noise(d, sr, 0, 0.85, 0.75, 0.22, 3.2, 60); noise(d, sr, 0.05, 0.7, 0.4, 0.5, 5); tone(d, sr, 0, 0.8, 130, 70, 0.3, 3.5); break;
        case 'flare': noise(d, sr, 0, 0.6, 0.45, 0.3, 4.5, 30); tone(d, sr, 0, 0.6, 220, 330, 0.18, 4); tone(d, sr, 0.05, 0.5, 440, 660, 0.07, 5); break;
        case 'hush': noise(d, sr, 0, 0.6, 0.5, 0.18, 6, 80); tone(d, sr, 0, 0.5, 260, 90, 0.2, 7); break;
        default: break;
    }
    // soften the clicks
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 1.1);
    return buf;
}
