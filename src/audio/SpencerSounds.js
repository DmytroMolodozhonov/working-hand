/**
 * SpencerSounds.js — the voice of the bird of Spencer (SpencerBirds.js), synthesized ahead (SoundManager.prewarmStep):
 *   chirp  two or three bright, clear notes, the last one sliding up — a little pearly ring after it
 *   trill  a quick warble, rising and falling (a good mood: a longer song)
 *   wings  the soft whirr of small wings (taking off, landing)
 */

/** One bird note: a pure tone sliding f0 → f1 with a quick vibrato, a soft ring (its second partial). */
function note(d, sr, at, dur, f0, f1, amp, vib = 0.012) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let ph = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, k = t / dur;
        const env = Math.min(1, t * 90) * Math.pow(Math.sin(Math.PI * Math.min(1, k)), 0.5);
        const f = (f0 + (f1 - f0) * k) * (1 + vib * Math.sin(2 * Math.PI * 26 * t));
        ph += f / sr;
        d[i0 + i] += env * amp * (Math.sin(2 * Math.PI * ph) + 0.18 * Math.sin(4 * Math.PI * ph + 0.6));
    }
}

export function synthSpencer(ctx, kind) {
    const sr = ctx.sampleRate;
    const dur = { chirp: 0.9, trill: 1.5, wings: 0.5 }[kind] || 0.8;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    if (kind === 'chirp') {
        note(d, sr, 0, 0.1, 3300, 3700, 0.5);
        note(d, sr, 0.16, 0.08, 3900, 3500, 0.42);
        note(d, sr, 0.3, 0.2, 3400, 4600, 0.5);
        for (const [at, f] of [[0.36, 2093], [0.5, 2637]]) { // (a faint pearly ring under the last note)
            const i0 = Math.floor(at * sr);
            for (let i = i0; i < Math.min(d.length, i0 + Math.floor(0.4 * sr)); i++) { const t = (i - i0) / sr; d[i] += 0.1 * Math.exp(-t * 7) * Math.sin(2 * Math.PI * f * t); }
        }
    } else if (kind === 'trill') {
        for (let k = 0; k < 11; k++) note(d, sr, k * 0.115, 0.09, 3000 + 700 * Math.sin(k * 0.9), 3500 + 800 * Math.sin(k * 0.9 + 1.1), 0.34, 0.02);
        note(d, sr, 1.3, 0.16, 3800, 5000, 0.4);
    } else {
        let lp = 0, lp2 = 0;
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const beat = Math.max(0, Math.sin(Math.PI * ((t % 0.07) / 0.07))) ** 2 * Math.exp(-t * 3.5);
            lp += ((Math.random() * 2 - 1) - lp) * 0.2; lp2 += (lp - lp2) * 0.35;
            d[i] = lp2 * beat * 1.1;
        }
    }
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 1.1) * 0.55;
    return buf;
}

export const SPENCER_SOUNDS = ['chirp', 'trill', 'wings'];
