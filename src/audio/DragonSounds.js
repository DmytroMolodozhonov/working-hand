/**
 * DragonSounds.js — the voices and the weight of a dragon in a fight (Dragons.js), synthesized ahead
 * (SoundManager.prewarmStep), never at the moment of the first play:
 *   step   a great foot set down: a deep thud, the earth giving                    (it walks)
 *   land   the landing: a heavy blow, a rolling rumble, the dust hissing             (it comes down)
 *   wing   one slow leathery beat, a wide rush of air                                (take-off, the gust, a pass)
 *   roar   a deep roar: a low rough voice sliding down, a hiss of breath             (it wakes, it lands, it rages)
 *   bite   jaws slamming shut: a crack and a snarl                                   (a bite)
 *   claw   a rake: a scrape of claws and a swish                                     (claws, a talon pass)
 *   tail   a heavy whip of the tail through the air and a thump                      (the tail)
 */
export const DRAGON_SOUNDS = ['step', 'land', 'wing', 'roar', 'bite', 'claw', 'tail'];
const DUR = { step: 0.8, land: 1.6, wing: 0.9, roar: 2.2, bite: 0.5, claw: 0.55, tail: 0.7 };
const TAU = Math.PI * 2;

function thud(d, sr, at, f0, amp, decay) {
    const i0 = Math.floor(at * sr);
    let ph = 0;
    for (let i = 0; i < d.length - i0; i++) {
        const t = i / sr;
        if (t > 1.2) break;
        ph += TAU * (f0 - 14 * Math.min(1, t * 3)) / sr;
        d[i0 + i] += Math.sin(ph) * Math.exp(-t * decay) * amp * Math.min(1, t * 2500);
    }
}

function noise(d, sr, at, dur, amp, lpK, env) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const k = i / n;
        lp += ((Math.random() * 2 - 1) - lp) * lpK;
        lp2 += (lp - lp2) * 0.6;
        d[i0 + i] += lp2 * amp * env(k);
    }
}

function growl(d, sr, at, dur, f0, f1, amp) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let ph = 0, b1 = 0, p1 = 0, lp = 0;
    const k1 = 2 * Math.sin(Math.PI * 520 / sr);
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, k = t / dur;
        const env = Math.min(1, t * 8) * Math.pow(1 - k, 0.8);
        const f = (f0 + (f1 - f0) * k) * (1 + 0.04 * Math.sin(TAU * 9 * t) + 0.02 * Math.sin(TAU * 31 * t));
        ph += f / sr; ph -= Math.floor(ph);
        lp += ((Math.random() * 2 - 1) - lp) * 0.3;
        const x = (ph * 2 - 1) * 0.7 + lp * 0.35;
        b1 += k1 * p1; p1 += k1 * (x - b1 - p1 * 0.2) * 0.9;
        d[i0 + i] += env * amp * Math.tanh((x * 0.6 + b1 * 1.1) * 1.8);
    }
}

export function synthDragon(ctx, kind) {
    const sr = ctx.sampleRate, len = Math.floor(sr * (DUR[kind] || 1));
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    switch (kind) {
        case 'step':
            thud(d, sr, 0, 34, 1.0, 7); noise(d, sr, 0, 0.35, 0.5, 0.35, (k) => Math.exp(-k * 9)); noise(d, sr, 0.02, 0.7, 0.35, 0.05, (k) => Math.exp(-k * 4));
            break;
        case 'land':
            thud(d, sr, 0, 28, 1.2, 4.5); noise(d, sr, 0, 0.5, 0.7, 0.3, (k) => Math.exp(-k * 8)); noise(d, sr, 0.05, 1.4, 0.55, 0.04, (k) => Math.exp(-k * 2.6) * Math.min(1, k * 30)); noise(d, sr, 0.15, 1.2, 0.2, 0.7, (k) => Math.sin(k * Math.PI) * Math.exp(-k));
            break;
        case 'wing':
            noise(d, sr, 0, 0.85, 0.9, 0.08, (k) => Math.sin(k * Math.PI) ** 1.5); noise(d, sr, 0.05, 0.7, 0.4, 0.4, (k) => Math.sin(k * Math.PI) ** 2); thud(d, sr, 0.28, 55, 0.35, 10);
            break;
        case 'roar':
            growl(d, sr, 0, 2.0, 95, 52, 1.0); growl(d, sr, 0.05, 1.8, 47, 30, 0.7); noise(d, sr, 0.1, 1.9, 0.35, 0.5, (k) => Math.sin(k * Math.PI) * 0.8);
            break;
        case 'bite':
            noise(d, sr, 0, 0.06, 1.0, 0.8, (k) => 1 - k); thud(d, sr, 0, 90, 0.8, 22); growl(d, sr, 0.02, 0.4, 130, 80, 0.5);
            break;
        case 'claw':
            noise(d, sr, 0, 0.5, 0.45, 0.6, (k) => Math.sin(k * Math.PI) ** 2); noise(d, sr, 0.18, 0.3, 0.6, 0.9, (k) => (1 - k) * (0.5 + 0.5 * Math.sin(k * 90)));
            break;
        case 'tail':
            noise(d, sr, 0, 0.5, 0.8, 0.12, (k) => Math.sin(k * Math.PI * 0.9) ** 2); thud(d, sr, 0.33, 48, 0.8, 12);
            break;
        default: break;
    }
    let peak = 0.01;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    const g = 0.9 / peak;
    for (let i = 0; i < len; i++) d[i] *= g;
    return buf;
}
