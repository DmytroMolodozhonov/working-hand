/**
 * ArenaSounds.js — the duel arena's sounds (src/game/ArenaDuels.js), synthesized ahead (SoundManager.prewarmStep):
 *   cheer    the stands roar: many voices, a swell of noise with shouts in it   (a hit, a good save, the win)
 *   groan    the crowd's «о-о-о»: a low falling murmur                          (a miss, a fall, a lost clash)
 *   gong     the referee's gong: a deep bronze strike, long ringing              (the duel begins / ends)
 *   beep     one count of «3-2-1»: a short bright bell                          (rate 1.5 — the «go!»)
 *   fanfare  three rising brass notes                                           (the winner, the 100 coins)
 *   clap     a patter of applause                                              (the duellists come out, bow)
 */

export const ARENA_SOUNDS = ['cheer', 'groan', 'gong', 'beep', 'fanfare', 'clap'];

/** A crowd: `n` voices of band-passed noise, each swelling at its own moment, under one envelope. */
function crowd(d, sr, env, low, high) {
    const voices = [];
    for (let k = 0; k < 14; k++) voices.push({ f: low + Math.random() * (high - low), at: Math.random() * 0.5, ph: 0, lp: 0, bp: 0 });
    let lp = 0, lp2 = 0;
    for (let i = 0; i < d.length; i++) {
        const t = i / sr, e = env(t);
        if (e <= 0) continue;
        // the hubbub: noise filtered down to voices' range
        lp += ((Math.random() * 2 - 1) - lp) * 0.22;
        lp2 += (lp - lp2) * 0.35;
        let s = (lp - lp2) * 0.9;
        // shouts: vowel-like tones gliding, each one a while
        for (const v of voices) {
            const tt = t - v.at;
            if (tt < 0 || tt > 1.2) continue;
            const ve = Math.sin(Math.PI * Math.min(1, tt / 1.2)) ** 2;
            v.ph += (v.f * (1 + 0.15 * Math.sin(tt * 4 + v.at * 9))) / sr;
            v.lp += ((Math.random() * 2 - 1) - v.lp) * 0.3;
            s += ve * 0.07 * (Math.sin(2 * Math.PI * v.ph) + 0.6 * Math.sin(4 * Math.PI * v.ph) + 0.5 * v.lp);
        }
        d[i] = s * e;
    }
}

/** A bell / bronze partial set at `at`. */
function bell(d, sr, at, f, dur, amp, partials = [[1, 1], [2.4, 0.45], [3.9, 0.25], [5.2, 0.12]]) {
    const i0 = Math.floor(at * sr);
    for (let i = i0; i < d.length; i++) {
        const t = (i - i0) / sr;
        if (t > dur) break;
        const e = Math.min(1, t * 400) * Math.exp(-t * 4 / dur);
        let s = 0;
        for (const [m, a] of partials) s += a * Math.sin(2 * Math.PI * f * m * t);
        d[i] += s * e * amp;
    }
}

export function synthArena(ctx, kind) {
    const sr = ctx.sampleRate;
    const dur = { cheer: 3.2, groan: 1.8, gong: 4.5, beep: 0.5, fanfare: 2.2, clap: 2.6 }[kind] || 1;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    if (kind === 'cheer') {
        crowd(d, sr, (t) => Math.min(1, t * 4) * Math.exp(-Math.max(0, t - 1.4) * 1.6), 260, 620);
    } else if (kind === 'groan') {
        // «о-о-о»: low voices falling, softer
        let ph = 0;
        crowd(d, sr, (t) => 0.55 * Math.min(1, t * 5) * Math.exp(-t * 1.4), 140, 260);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            ph += (210 - 70 * t / dur) / sr;
            d[i] += 0.18 * Math.min(1, t * 6) * Math.exp(-t * 1.6) * (Math.sin(2 * Math.PI * ph) + 0.5 * Math.sin(4 * Math.PI * ph));
        }
    } else if (kind === 'gong') {
        bell(d, sr, 0, 92, 4.4, 0.55, [[1, 1], [1.48, 0.6], [2.03, 0.45], [2.74, 0.3], [3.6, 0.18], [4.9, 0.1]]);
        let lp = 0; // (the mallet's thud)
        for (let i = 0; i < sr * 0.08; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.2; d[i] += lp * 0.5 * (1 - i / (sr * 0.08)); }
    } else if (kind === 'beep') {
        bell(d, sr, 0, 880, 0.45, 0.5, [[1, 1], [2, 0.3], [3, 0.1]]);
    } else if (kind === 'fanfare') {
        // three brass notes rising (C — E — G, the last held), a little vibrato
        for (const [at, f, len] of [[0, 523, 0.28], [0.3, 659, 0.28], [0.6, 784, 1.5]]) {
            const i0 = Math.floor(at * sr);
            let ph = 0;
            for (let i = i0; i < d.length; i++) {
                const t = (i - i0) / sr;
                if (t > len) break;
                const e = Math.min(1, t * 30) * (t > len - 0.12 ? (len - t) / 0.12 : 1);
                ph += f * (1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t)) / sr;
                let s = 0;
                for (let h = 1; h <= 6; h++) s += Math.sin(2 * Math.PI * h * ph) / (h * 0.9);
                d[i] += 0.16 * e * s;
            }
        }
    } else {
        // applause: many short claps scattered, thinning out
        for (let k = 0; k < 220; k++) {
            const at = Math.random() * dur * (Math.random() < 0.7 ? 0.6 : 1);
            const i0 = Math.floor(at * sr), n = Math.floor(0.012 * sr), a = 0.25 + Math.random() * 0.25;
            let lp = 0;
            for (let i = 0; i < n && i0 + i < d.length; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.6; d[i0 + i] += lp * a * (1 - i / n) * Math.exp(-at * 0.6); }
        }
    }
    return buf;
}
