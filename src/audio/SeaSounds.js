/**
 * SeaSounds.js — the sea update's sounds, made ahead (SoundManager.prewarmStep), never in a frame:
 *   gale   the wind over the open sea in a gale and a storm: a deep rushing roar, gusts swelling, a thin whistle in the rigging (loops)
 *   spout  a waterspout: a low churning roar under a hiss of torn spray, a rumble that rolls (loops)
 *   under  under the water: a muffled low hum with slow swells and tiny ticks (loops)
 *   click  a dolphin's clicks and whistle      tail   a big fish's tail slapping the water
 *   bite   a shark's snap under the water      chime  the magic glowfin's soft bell-like hum
 * Every loop's end is crossfaded into its start (no click as it wraps).
 */
export const SEA_SOUNDS = ['gale', 'spout', 'under', 'click', 'tail', 'bite', 'chime'];

function loopBuffer(ctx, seconds, fn) {
    const sr = ctx.sampleRate, len = Math.floor(sr * seconds), fade = Math.floor(sr * 0.7);
    const raw = new Float32Array(len + fade);
    fn(raw, sr, len + fade);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
        const k = i < fade ? i / fade : 1;
        d[i] = Math.max(-1, Math.min(1, raw[i] * k + (i < fade ? raw[len + i] * (1 - k) : 0)));
    }
    return buf;
}

function oneShot(ctx, seconds, fn) {
    const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    fn(d, sr, len);
    for (let i = 0; i < len; i++) d[i] = Math.max(-1, Math.min(1, d[i]));
    return buf;
}

export function synthSea(ctx, kind) {
    const TAU = Math.PI * 2;
    switch (kind) {
        case 'gale': return loopBuffer(ctx, 9, (d, sr, n) => {
            let a = 0, b = 0, c = 0, ph = 0;
            for (let i = 0; i < n; i++) {
                const t = i / sr;
                const gust = 0.55 + 0.25 * Math.sin(TAU * t / 9) + 0.2 * Math.sin(TAU * 3 * t / 9 + 1.3) * Math.sin(TAU * t / 4.5);
                const x = Math.random() * 2 - 1;
                a += (x - a) * (0.012 + 0.03 * gust); // the deep rush
                b += (x - b) * 0.25; c += (b - c) * 0.2; // the brighter hiss
                ph += TAU * (780 + 260 * gust + 60 * Math.sin(TAU * 0.7 * t)) / sr; // the whistle in the ropes
                d[i] = (a * 3.6 + (b - c) * 0.22 + Math.sin(ph) * 0.02 * gust * gust) * gust;
            }
        });
        case 'spout': return loopBuffer(ctx, 7, (d, sr, n) => {
            let a = 0, a2 = 0, h = 0, h2 = 0;
            for (let i = 0; i < n; i++) {
                const t = i / sr;
                const roll = 0.7 + 0.3 * Math.sin(TAU * t / 3.5) * Math.sin(TAU * t / 7);
                const x = Math.random() * 2 - 1;
                a += (x - a) * 0.008; a2 += (a - a2) * 0.05; // the churning low roar
                h += (x - h) * 0.5; h2 += (h - h2) * 0.35; // the spray's hiss
                const churn = 1 + 0.35 * Math.sin(TAU * (5 + 2 * Math.sin(TAU * t / 7)) * t);
                d[i] = (a2 * 7 * churn + (h - h2) * 0.28) * roll + Math.sin(TAU * 38 * t) * 0.03 * roll;
            }
        });
        case 'under': return loopBuffer(ctx, 8, (d, sr, n) => {
            let a = 0, a2 = 0;
            for (let i = 0; i < n; i++) {
                const t = i / sr;
                a += ((Math.random() * 2 - 1) - a) * 0.004; a2 += (a - a2) * 0.03;
                const swell = 0.7 + 0.3 * Math.sin(TAU * t / 8);
                d[i] = a2 * 9 * swell + Math.sin(TAU * 47 * t) * 0.012 * swell;
                if (Math.random() < 0.00035) { const f = 2500 + Math.random() * 3000; for (let k = 0; k < 300 && i + k < n; k++) d[i + k] += Math.sin(TAU * f * k / sr) * Math.exp(-k / 40) * 0.05; }
            }
        });
        case 'click': return oneShot(ctx, 1.1, (d, sr, n) => {
            // a quick train of clicks, then a rising-falling whistle
            for (let c = 0; c < 9; c++) { const i0 = Math.floor((0.02 + c * 0.035) * sr); for (let k = 0; k < 120 && i0 + k < n; k++) d[i0 + k] += (Math.random() * 2 - 1) * Math.exp(-k / 18) * 0.5; }
            let ph = 0;
            for (let i = Math.floor(0.4 * sr); i < n; i++) {
                const u = (i / sr - 0.4) / 0.7;
                ph += TAU * (6000 + 3500 * Math.sin(Math.PI * u) + 900 * Math.sin(TAU * 7 * u)) / sr;
                d[i] += Math.sin(ph) * 0.18 * Math.sin(Math.PI * Math.min(1, u));
            }
        });
        case 'tail': return oneShot(ctx, 0.7, (d, sr, n) => {
            let a = 0;
            for (let i = 0; i < n; i++) {
                const t = i / sr;
                a += ((Math.random() * 2 - 1) - a) * 0.35;
                d[i] = a * Math.exp(-t * 7) * 0.9 + Math.sin(TAU * 90 * t) * Math.exp(-t * 18) * 0.5;
            }
        });
        case 'bite': return oneShot(ctx, 0.45, (d, sr, n) => {
            let a = 0;
            for (let i = 0; i < n; i++) {
                const t = i / sr;
                a += ((Math.random() * 2 - 1) - a) * 0.12;
                d[i] = a * Math.exp(-t * 14) * 1.4 + Math.sin(TAU * (160 - 90 * t) * t) * Math.exp(-t * 10) * 0.6;
            }
        });
        case 'chime': return oneShot(ctx, 2.2, (d, sr, n) => {
            for (const [f, a] of [[523, 0.16], [784, 0.11], [1175, 0.07], [1568, 0.05]]) {
                for (let i = 0; i < n; i++) { const t = i / sr; d[i] += Math.sin(TAU * f * t + Math.sin(TAU * 3 * t) * 0.6) * a * Math.min(1, t * 8) * Math.exp(-t * 1.6); }
            }
        });
    }
    return null;
}
