/**
 * SpaceSounds.js — the sounds of «Космос» (Space.js), synthesized ahead, a few milliseconds a frame
 * (SoundManager._prepare runs these generators): never made at the moment they are first heard.
 *
 *   spaceRise   the climb of «Flying Maxima»: a deep rumble swelling and rising in pitch, the roar of
 *               the air growing — then cut to the silence of space (6 s)
 *   spaceEntry  falling into an atmosphere: a burning roar and crackle (3 s)
 *   spaceWind   Venus' storm: a howling gusty wind, made to loop (5 s)
 *   spaceHeat   the Sun's heat: a low seething hiss (loops, 3 s)
 *   spaceGift   «Поздравляем, вы приблизились к силе богов»: a bright rising choir chord (3.5 s)
 *   spaceBeep   a soft chime (a planet reached, the map)
 */

const STEP = 4096; // samples between yields

export function* riseGen(ctx) {
    const sr = ctx.sampleRate, T = 6, len = Math.floor(sr * T);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let lp = 0, lp2 = 0, ph = 0;
    for (let i = 0; i < len; i++) {
        const t = i / sr, k = t / T;
        const n = Math.random() * 2 - 1;
        const cut = 0.02 + 0.25 * k * k; // (the roar brightens as the speed grows)
        lp += (n - lp) * cut; lp2 += (lp - lp2) * cut;
        ph += (2 * Math.PI * (38 + 90 * k * k)) / sr;
        const env = Math.min(1, t * 1.2) * (t < T - 0.35 ? 1 : Math.max(0, (T - t) / 0.35)); // (then the silence)
        d[i] = (lp2 * 2.2 * (0.4 + 0.9 * k) + Math.sin(ph) * 0.35 * (1 - k * 0.5)) * env * 0.55;
        if (i % STEP === 0) yield;
    }
    return buf;
}

export function* entryGen(ctx) {
    const sr = ctx.sampleRate, T = 3, len = Math.floor(sr * T);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let lp = 0, cr = 0;
    for (let i = 0; i < len; i++) {
        const t = i / sr;
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * 0.12;
        if (Math.random() < 0.004) cr = 0.8 * Math.random();
        cr *= 0.993;
        const env = Math.min(1, t * 3) * Math.min(1, (T - t) * 1.5);
        d[i] = (lp * 1.6 + n * cr * 0.5) * env * 0.6;
        if (i % STEP === 0) yield;
    }
    return buf;
}

export function* windGen(ctx) {
    const sr = ctx.sampleRate, T = 5, len = Math.floor(sr * T);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let lp = 0, bp = 0, bp2 = 0;
    for (let i = 0; i < len; i++) {
        const t = i / sr;
        const n = Math.random() * 2 - 1;
        const gust = 0.55 + 0.45 * Math.sin((2 * Math.PI * t) / T) * Math.sin((2 * Math.PI * 3 * t) / T + 1);
        const f = 0.02 + 0.05 * gust; // (the howl's pitch follows the gusts)
        lp += (n - lp) * f;
        bp += (lp - bp) * 0.3; bp2 = lp - bp;
        d[i] = (lp * 1.4 + bp2 * 0.5) * gust * 0.7;
        if (i % STEP === 0) yield;
    }
    for (let i = 0; i < 3000; i++) { const a = i / 3000; d[i] = d[i] * a + d[len - 3000 + i] * (1 - a); } // (no click where it loops)
    return buf;
}

export function* heatGen(ctx) {
    const sr = ctx.sampleRate, T = 3, len = Math.floor(sr * T);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * 0.05;
        d[i] = (lp * 1.5 + n * 0.08) * (0.8 + 0.2 * Math.sin(i / sr * 13)) * 0.6;
        if (i % STEP === 0) yield;
    }
    for (let i = 0; i < 2000; i++) { const a = i / 2000; d[i] = d[i] * a + d[len - 2000 + i] * (1 - a); }
    return buf;
}

export function* giftGen(ctx) {
    const sr = ctx.sampleRate, T = 3.5, len = Math.floor(sr * T);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const notes = [261.6, 329.6, 392, 523.3, 659.3, 784, 1046.5];
    for (let i = 0; i < len; i++) {
        const t = i / sr;
        let v = 0;
        for (let k = 0; k < notes.length; k++) {
            const at = k * 0.18;
            if (t < at) continue;
            const tt = t - at;
            const f = notes[k];
            // (a soft choir «aah»: a few detuned partials, a slow swell)
            v += (Math.sin(2 * Math.PI * f * tt) + 0.4 * Math.sin(2 * Math.PI * f * 2.003 * tt) + 0.2 * Math.sin(2 * Math.PI * f * 3.01 * tt)) * Math.min(1, tt * 3) * Math.exp(-tt * 0.5);
        }
        d[i] = v * 0.07 * Math.min(1, (T - t) * 2);
        if (i % STEP === 0) yield;
    }
    return buf;
}

export function* beepGen(ctx) {
    const sr = ctx.sampleRate, T = 0.6, len = Math.floor(sr * T);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
        const t = i / sr;
        d[i] = (Math.sin(2 * Math.PI * 1318.5 * t) * 0.6 + Math.sin(2 * Math.PI * 1975.5 * t) * 0.3) * Math.exp(-t * 7) * 0.3;
        if (i % STEP === 0) yield;
    }
    return buf;
}

export const SPACE_SOUNDS = { spaceRise: riseGen, spaceEntry: entryGen, spaceWind: windGen, spaceHeat: heatGen, spaceGift: giftGen, spaceBeep: beepGen };
