/**
 * GargoyleSounds.js — the voices of the infernal gargoyles and of their ritual (Gargoyles.js), synthesized ahead
 * (SoundManager.prewarmStep), never at the moment of the first play:
 *   roar     a low, rough growl with a vowel's formants sliding               (hunting, a bite coming)
 *   screech  a high rasping shriek, trembling                                (they burst out, they dive)
 *   wings    three leathery beats, heavier than the owl's                    (flying by)
 *   bite     a crunch with a snarl                                           (a bite lands)
 *   crumble  a stone rumble and clatter, falling to nothing                  (their time is up)
 *   shatter  a crack and the debris                                          (one is killed)
 *   ignite   the ritual: the hellfire kindles — a dark drone, a rising noise and a minor-chord theme, a boom at the end (5.4 s)
 *   burst    the release: a roar of fire, thirty screeches, a deep boom      (2.8 s)
 *   groan    «To the Sun» on the black clouds: the cloud's deep moan, a voice sliding down under a wind (2.6 s)
 *   thunder  a crack and a long rolling rumble                               (2.8 s)
 *   sunBang  the clouds are broken: a blinding crack, a boom, then a rising choir and bells of victory (5.2 s)
 */

export const GARGOYLE_SOUNDS = ['roar', 'screech', 'wings', 'bite', 'crumble', 'shatter', 'ignite', 'burst', 'groan', 'thunder', 'sunBang'];
const DUR = { roar: 1.4, screech: 1.0, wings: 0.9, bite: 0.4, crumble: 2.6, shatter: 1.3, ignite: 5.6, burst: 2.9, groan: 2.6, thunder: 2.8, sunBang: 5.2 };

const TAU = Math.PI * 2;

/** Rough voice: a sawtooth through two band-passes (a vowel), glided from f0 to f1. */
function voice(d, sr, at, dur, f0, f1, amp, { rasp = 0.3, vib = 0, form = [700, 1100] } = {}) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let ph = 0, b1 = 0, b2 = 0, p1 = 0, p2 = 0, lp = 0;
    const k1 = 2 * Math.sin(Math.PI * form[0] / sr), k2 = 2 * Math.sin(Math.PI * form[1] / sr);
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr, k = t / dur;
        const env = Math.min(1, t * 30) * Math.pow(1 - k, 0.7);
        const f = (f0 + (f1 - f0) * k) * (1 + vib * Math.sin(TAU * 7 * t));
        ph += f / sr; ph -= Math.floor(ph);
        const saw = ph * 2 - 1;
        lp += ((Math.random() * 2 - 1) - lp) * 0.4;
        const x = saw * (1 - rasp) + lp * rasp;
        b1 += k1 * p1; p1 += k1 * (x - b1 - p1 * 0.25) * 0.9; // (two crude resonators)
        b2 += k2 * p2; p2 += k2 * (x - b2 - p2 * 0.3) * 0.9;
        d[i0 + i] += env * amp * Math.tanh((x * 0.5 + b1 * 0.9 + b2 * 0.5) * 1.6);
    }
}

function noiseBurst(d, sr, at, dur, amp, lpK, decay) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr;
        lp += ((Math.random() * 2 - 1) - lp) * lpK;
        lp2 += (lp - lp2) * 0.5;
        d[i0 + i] += lp2 * amp * Math.exp(-t * decay) * Math.min(1, t * 400);
    }
}

function tone(d, sr, at, dur, f, amp, { attack = 0.05, decay = 1.5, sub = 0 } = {}) {
    const i0 = Math.floor(at * sr), n = Math.floor(dur * sr);
    for (let i = 0; i < n && i0 + i < d.length; i++) {
        const t = i / sr;
        const env = Math.min(1, t / attack) * Math.exp(-t * decay);
        d[i0 + i] += env * amp * (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 2.01 * t) + sub * Math.sin(TAU * f * 0.5 * t));
    }
}

export function synthGargoyle(ctx, kind) {
    const sr = ctx.sampleRate;
    const dur = DUR[kind] || 1;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    switch (kind) {
        case 'roar':
            voice(d, sr, 0, 1.3, 105, 62, 0.8, { rasp: 0.35, vib: 0.03, form: [520, 880] });
            voice(d, sr, 0.05, 1.2, 160, 90, 0.35, { rasp: 0.5, form: [900, 1400] });
            break;
        case 'screech':
            voice(d, sr, 0, 0.9, 760, 1650, 0.55, { rasp: 0.45, vib: 0.045, form: [1500, 2600] });
            voice(d, sr, 0.04, 0.8, 1180, 880, 0.3, { rasp: 0.5, vib: 0.06, form: [1800, 3000] });
            break;
        case 'wings':
            for (let b = 0; b < 3; b++) {
                const at = 0.04 + b * 0.27;
                noiseBurst(d, sr, at, 0.22, 1.5, 0.1, 9);
                tone(d, sr, at, 0.18, 62, 0.25, { decay: 14 }); // (the air pushed down)
            }
            break;
        case 'bite':
            noiseBurst(d, sr, 0, 0.12, 1.1, 0.45, 26);
            tone(d, sr, 0, 0.1, 150, 0.4, { decay: 30, attack: 0.002 });
            voice(d, sr, 0.03, 0.3, 190, 120, 0.45, { rasp: 0.5, form: [600, 1000] });
            break;
        case 'crumble': {
            noiseBurst(d, sr, 0, 2.5, 0.7, 0.04, 1.3); // (the rumble)
            for (let i = 0; i < 26; i++) { const at = Math.pow(Math.random(), 1.3) * 2.2; noiseBurst(d, sr, at, 0.07, 0.9 * (1 - at / 2.8), 0.5, 40); tone(d, sr, at, 0.06, 240 + Math.random() * 500, 0.14, { decay: 50, attack: 0.001 }); }
            break;
        }
        case 'shatter':
            noiseBurst(d, sr, 0, 0.18, 1.5, 0.6, 22);
            tone(d, sr, 0, 0.3, 90, 0.7, { decay: 9, attack: 0.002 });
            for (let i = 0; i < 18; i++) { const at = 0.08 + Math.random() * 1.0; noiseBurst(d, sr, at, 0.06, 0.6 * (1 - at / 1.4), 0.55, 45); }
            voice(d, sr, 0, 0.5, 700, 260, 0.3, { rasp: 0.4, form: [1400, 2400] }); // (the death cry)
            break;
        case 'ignite': {
            // a dark drone rising a fifth, noise swelling like fire, a minor theme (A–C–E♭–D… a diminished tension), then the boom
            let lp = 0, lp2 = 0;
            for (let i = 0; i < d.length; i++) {
                const t = i / sr, k = Math.min(1, t / 5.0);
                const swell = k * k;
                lp += ((Math.random() * 2 - 1) - lp) * (0.06 + 0.2 * k);
                lp2 += (lp - lp2) * 0.35;
                const crackle = Math.random() < 0.002 + 0.02 * k ? (Math.random() - 0.5) * 1.6 : 0;
                const f = 55 * (1 + 0.5 * k);
                d[i] = 0.5 * swell * lp2 * 1.6 + 0.4 * swell * Math.sin(TAU * f * t) + 0.18 * swell * Math.sin(TAU * f * 1.5 * t + 1) + crackle * 0.35 * k;
            }
            const theme = [[0.3, 220], [1.1, 261.6], [1.9, 311.1], [2.7, 293.7], [3.5, 233.1], [4.1, 277.2], [4.6, 329.6]];
            for (const [at, f] of theme) tone(d, sr, at, 1.6, f, 0.17 + at * 0.025, { attack: 0.18, decay: 1.4, sub: 0.6 });
            tone(d, sr, 5.0, 0.6, 46, 1.0, { attack: 0.004, decay: 5, sub: 0.5 }); // (the boom as the first one bursts out)
            noiseBurst(d, sr, 5.0, 0.5, 0.9, 0.12, 6);
            break;
        }
        case 'burst':
            noiseBurst(d, sr, 0, 2.6, 0.8, 0.05, 1.1);
            tone(d, sr, 0, 1.2, 40, 1.0, { attack: 0.01, decay: 2.2, sub: 0.6 });
            for (let i = 0; i < 9; i++) voice(d, sr, i * 0.22 + Math.random() * 0.1, 0.8, 620 + Math.random() * 500, 1300 + Math.random() * 600, 0.22, { rasp: 0.5, vib: 0.05, form: [1400 + Math.random() * 400, 2500] });
            voice(d, sr, 0.2, 1.8, 95, 60, 0.5, { rasp: 0.4, form: [500, 800] });
            break;
        case 'groan': { // the clouds cry: two low voices sliding down against each other, a howl of wind under them
            voice(d, sr, 0, 2.4, 118, 64, 0.55, { rasp: 0.5, vib: 0.05, form: [380, 640] });
            voice(d, sr, 0.15, 2.3, 93, 51, 0.45, { rasp: 0.45, vib: 0.07, form: [300, 520] });
            let lp = 0, lp2 = 0;
            for (let i = 0; i < d.length; i++) { const t = i / sr; lp += ((Math.random() * 2 - 1) - lp) * 0.03; lp2 += (lp - lp2) * 0.2; d[i] += lp2 * 3.2 * Math.sin(Math.PI * Math.min(1, t / 2.6)) * (0.6 + 0.4 * Math.sin(t * 7)); }
            break;
        }
        case 'thunder': {
            noiseBurst(d, sr, 0, 0.14, 1.6, 0.7, 24); // (the crack)
            tone(d, sr, 0.02, 0.5, 70, 0.8, { attack: 0.004, decay: 7, sub: 0.5 });
            for (let k = 0; k < 7; k++) { const at = 0.12 + k * 0.28 + Math.random() * 0.12; noiseBurst(d, sr, at, 0.7, 0.75 * Math.exp(-at * 0.9), 0.05 + 0.03 * Math.random(), 2.6); } // (the rolling)
            break;
        }
        case 'sunBang': {
            noiseBurst(d, sr, 0, 0.22, 1.7, 0.8, 18); // (the blinding crack)
            tone(d, sr, 0, 1.6, 44, 1.0, { attack: 0.004, decay: 2.4, sub: 0.7 });
            noiseBurst(d, sr, 0.02, 1.8, 0.8, 0.05, 1.6);
            // the sun comes out: a choir of D major rising from the boom, bells over it (the victory)
            const chord = [[0.5, [146.8, 220, 293.7, 370]], [1.5, [196, 246.9, 392, 493.9]], [2.6, [146.8, 220, 293.7, 440, 587.3]]];
            for (const [at, fs] of chord) for (const f of fs) tone(d, sr, at, 2.4, f, 0.12, { attack: 0.35, decay: 0.9, sub: 0.3 });
            for (const [at, f] of [[0.7, 587.3], [1.1, 740], [1.5, 880], [1.9, 987.8], [2.4, 1175], [3.0, 1480]]) tone(d, sr, at, 1.8, f, 0.1, { attack: 0.004, decay: 2.3 });
            break;
        }
        default: break;
    }
    // (never above the full scale)
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0.95) for (let i = 0; i < d.length; i++) d[i] *= 0.95 / peak;
    return buf;
}
