/**
 * OwlSounds.js — the clever owl's voice (Owls.js), synthesized ahead (SoundManager.prewarmStep):
 *   hoot   a soft low «у-ху… ху-ху»            (curious, «follow me»)
 *   sad    a long falling hoot                  (no such boss, a feather burst)
 *   wings  the hush of soft wing beats          (taking off, landing, darting away)
 *   coo    a contented warbling trill           (eating the meat)
 *   chime  a soft rising bell                   (the hearts: it loves you)
 */

/** One hoot note: a breathy round tone with a little glide. */
function note(d, sr, at, dur, f0, f1, amp) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let ph = 0, lp = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, k = t / dur;
        const env = Math.min(1, t * 22) * Math.pow(Math.sin(Math.PI * Math.min(1, k)), 0.6);
        const f = f0 + (f1 - f0) * k;
        ph += f / sr;
        lp += ((Math.random() * 2 - 1) - lp) * 0.08; // (the breath)
        d[i0 + i] += env * amp * (0.8 * Math.sin(2 * Math.PI * ph) + 0.12 * Math.sin(4 * Math.PI * ph) + 0.25 * lp);
    }
}

export function synthOwl(ctx, kind) {
    const sr = ctx.sampleRate;
    const dur = { hoot: 1.6, sad: 1.9, wings: 0.75, coo: 1.0, chime: 1.6 }[kind] || 1;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    if (kind === 'hoot') {
        note(d, sr, 0, 0.32, 390, 420, 0.7);
        note(d, sr, 0.5, 0.18, 400, 380, 0.5);
        note(d, sr, 0.78, 0.5, 410, 360, 0.65);
    } else if (kind === 'sad') {
        note(d, sr, 0, 0.45, 360, 330, 0.6);
        note(d, sr, 0.6, 1.1, 340, 230, 0.6);
    } else if (kind === 'wings') {
        // three soft beats: filtered noise swells
        let lp = 0, lp2 = 0;
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const beat = Math.max(0, Math.sin(Math.PI * ((t % 0.22) / 0.22))) ** 2 * Math.exp(-t * 2.2);
            lp += ((Math.random() * 2 - 1) - lp) * 0.12;
            lp2 += (lp - lp2) * 0.3;
            d[i] = lp2 * beat * 1.4;
        }
    } else if (kind === 'coo') {
        // a low warble trembling 18 times a second
        let ph = 0;
        for (let i = 0; i < d.length; i++) {
            const t = i / sr;
            const env = Math.min(1, t * 15) * Math.exp(-t * 2.4);
            ph += (520 + 60 * Math.sin(2 * Math.PI * 3 * t)) / sr;
            const am = 0.55 + 0.45 * Math.sin(2 * Math.PI * 18 * t);
            d[i] = env * am * 0.5 * (Math.sin(2 * Math.PI * ph) + 0.2 * Math.sin(6 * Math.PI * ph));
        }
    } else {
        // the hearts: three soft bell notes rising
        for (const [at, f] of [[0, 1047], [0.18, 1319], [0.36, 1568]]) {
            const i0 = Math.floor(at * sr);
            for (let i = i0; i < d.length; i++) {
                const t = (i - i0) / sr;
                const env = Math.min(1, t * 60) * Math.exp(-t * 3.2);
                d[i] += env * 0.22 * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 6));
            }
        }
    }
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 1.1) * 0.7;
    return buf;
}

export const OWL_SOUNDS = ['hoot', 'sad', 'wings', 'coo', 'chime'];
