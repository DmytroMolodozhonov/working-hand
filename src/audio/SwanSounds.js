/**
 * SwanSounds.js — the swans of the lakes (SwanLife.js), synthesized ahead (SoundManager.prewarmStep):
 *   hiss    a mute swan's angry hiss — a breathy noise, rising and falling, with a rough throaty edge   (the threat, a bite)
 *   call    a soft nasal trumpet «у-ук»: two short notes                                               (a pair calling, a landing)
 *   wings   the heavy whistling beats of a swan's wings («вш-вш-вш»: a swan's wings sing in flight)     (flying)
 *   run     the feet slapping the water on the run before the take-off, the first beats over it        (taking off)
 *   splash  the long skid on the water as it lands, a spray falling                                   (landing)
 */
export const SWAN_SOUNDS = ['hiss', 'call', 'wings', 'run', 'splash'];

function noiseOf(n, k = 0.1) { let lp = 0; const out = new Float32Array(n); for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * k; out[i] = lp; } return out; }

export function synthSwan(ctx, kind) {
    const sr = ctx.sampleRate;
    const dur = { hiss: 1.1, call: 0.9, wings: 1.0, run: 1.4, splash: 1.3 }[kind] || 1;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    if (kind === 'hiss') {
        let hp = 0, prev = 0, ph = 0;
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const env = Math.min(1, t * 9) * Math.pow(Math.max(0, 1 - t / dur), 0.7) * (0.75 + 0.25 * Math.sin(t * 17));
            const w = Math.random() * 2 - 1;
            hp = 0.85 * (hp + w - prev); prev = w; // (the bright air of the hiss)
            ph += (95 + 25 * Math.sin(t * 5)) / sr;
            const throat = Math.sin(2 * Math.PI * ph) > 0.6 ? 0.35 : 0; // (a rough rattle in the throat)
            d[i] = env * (0.55 * hp + throat * (Math.random() - 0.5));
        }
    } else if (kind === 'call') {
        for (const [at, len, f] of [[0, 0.24, 560], [0.32, 0.36, 520]]) {
            const i0 = Math.floor(at * sr), n = Math.floor(len * sr);
            let ph = 0;
            const nz = noiseOf(n, 0.2);
            for (let i = 0; i < n && i0 + i < d.length; i++) {
                const t = i / sr, k = t / len;
                const env = Math.min(1, t * 30) * Math.pow(Math.sin(Math.PI * k), 0.5);
                ph += (f * (1 + 0.06 * k) + 8 * Math.sin(t * 40)) / sr;
                const x = Math.sin(2 * Math.PI * ph), nasal = Math.sign(x) * Math.pow(Math.abs(x), 0.4); // (a reedy, nasal tone)
                d[i0 + i] += env * 0.45 * (0.6 * nasal + 0.25 * Math.sin(6 * Math.PI * ph) + 0.15 * nz[i]);
            }
        }
    } else if (kind === 'wings' || kind === 'run') {
        // the beats: a whoosh with a singing whistle in it (swans' wings «sing»); the run adds the slaps of the feet on the water
        const nz = noiseOf(d.length, 0.18);
        let bp = 0, bp2 = 0;
        const per = kind === 'run' ? 0.28 : 0.34;
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const beat = Math.pow(Math.max(0, Math.sin(Math.PI * ((t % per) / per))), 3);
            bp += (nz[i] - bp) * 0.25; bp2 += (bp - bp2) * 0.5;
            const whistle = 0.12 * Math.sin(2 * Math.PI * (1100 + 300 * beat) * t) * beat;
            d[i] = (0.9 * (bp - bp2) + whistle) * beat * Math.min(1, t * 8) * Math.min(1, (dur - t) * 4);
            if (kind === 'run') {
                const step = 0.11, ph = t % step;
                if (ph < 0.02 && t < dur - 0.4) d[i] += (Math.random() * 2 - 1) * 0.5 * (1 - ph / 0.02) * Math.min(1, t * 6); // (slap)
            }
        }
    } else {
        // the landing: a long hissing skid on the water, then the spray falling back
        const nz = noiseOf(d.length, 0.35);
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const skid = Math.min(1, t * 12) * Math.exp(-t * 2.2);
            const drops = t > 0.35 && Math.random() < 0.004 * Math.exp(-(t - 0.35) * 2.5) ? (Math.random() - 0.5) * 1.5 : 0;
            d[i] = 0.7 * nz[i] * skid + drops;
        }
    }
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 1.2) * 0.7;
    return buf;
}
