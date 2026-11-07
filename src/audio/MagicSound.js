/**
 * MagicSound.js — the sounds of the magic around the game (not of the world): the loading's passage and the interface (the author 05.11:
 * «музыка может способствовать… интерфейс должен давать разные звуки, но уместные и приятные — магический и в звуках тоже»).
 * Everything is synthesised (no files): soft, short, never sharp — glass bells, breath of wind, a warm pad. Its own AudioContext, made at the
 * first sound (after a click: the browser allows it then); the volume is the game's effects slider (#zombie-vol, 0…100), and it stays low.
 *
 *  - passage(): the loading's music — a drone pad of the palette's chord rising with the progress (its filter opens, a fifth joins), a wind
 *    that rushes faster, now and then a bell of the chord; arrive(): a swell and a bright chord of bells, then it fades; stop().
 *  - ui(kind): 'hover' (a faint glass tick), 'click' (a soft bell with a shimmer), 'open' (a rising swirl of bells), 'close' (falling),
 *    'tab' (two quick bells), 'toggle' (a pluck), 'back' (a low soft bell). Throttled: never a rattle.
 */

let ctx = null, master = null, last = {};
const SCALES = [[0, 3, 7, 10, 14], [0, 4, 7, 11, 14], [0, 2, 7, 9, 14], [0, 5, 7, 12, 15]];

function vol() {
    const el = typeof document !== 'undefined' ? document.getElementById('zombie-vol') : null;
    const v = el ? Number(el.value) / 100 : 0.2;
    return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.2));
}

function ac() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
    const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!C) return null;
    try {
        ctx = new C();
        master = ctx.createGain();
        master.gain.value = 1;
        // a soft room: a short feedback echo, low-passed (the bells ring on in a hall)
        const dl = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
        dl.delayTime.value = 0.23; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 3200; wet.gain.value = 0.35;
        master.connect(ctx.destination);
        master.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** A glass bell: a sine and its bright partials, a quick strike, a long soft ring. */
function bell(freq, at, gain = 0.1, len = 1.6, dest = null) {
    const c = ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    g.connect(dest || master);
    for (const [k, a] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
        const o = c.createOscillator(), og = c.createGain();
        o.type = 'sine'; o.frequency.value = freq * k;
        og.gain.value = a;
        o.connect(og); og.connect(g);
        o.start(at); o.stop(at + len + 0.05);
    }
}

/** A breath of wind: noise through a moving band filter. */
function wind(at, len, from, to, gain = 0.05, dest = null) {
    const c = ctx;
    const n = c.createBufferSource(), b = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
    f.frequency.setValueAtTime(from, at); f.frequency.exponentialRampToValueAtTime(to, at + len);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + len * 0.4); g.gain.linearRampToValueAtTime(0, at + len);
    n.connect(f); f.connect(g); g.connect(dest || master);
    n.start(at); n.stop(at + len);
}

// ------------------------------------------------------------------ the interface
export function uiSound(kind) {
    const c = ac();
    if (!c) return;
    const now = c.currentTime, v = vol();
    if (v <= 0) return;
    if (now - (last[kind] || 0) < (kind === 'hover' ? 0.07 : 0.05)) return;
    last[kind] = now;
    const base = 72 + [0, 2, 4, 7, 9][Math.floor(Math.random() * 5)];
    const out = c.createGain(); out.gain.value = v * 0.9; out.connect(master);
    switch (kind) {
        case 'hover': bell(midi(base + 12), now, 0.022, 0.35, out); break;
        case 'click': bell(midi(base), now, 0.07, 1.2, out); bell(midi(base + 7), now + 0.04, 0.035, 1.0, out); break;
        case 'tab': bell(midi(base), now, 0.05, 0.8, out); bell(midi(base + 5), now + 0.07, 0.045, 0.9, out); break;
        case 'toggle': bell(midi(base - 5), now, 0.06, 0.6, out); break;
        case 'back': bell(midi(base - 12), now, 0.07, 1.1, out); break;
        case 'open': wind(now, 0.7, 500, 2600, 0.05 * 2, out); [0, 4, 7, 12, 16].forEach((s, i) => bell(midi(70 + s), now + i * 0.055, 0.045, 1.4, out)); break;
        case 'close': wind(now, 0.6, 2400, 400, 0.04 * 2, out); [16, 12, 7, 4, 0].forEach((s, i) => bell(midi(70 + s), now + i * 0.05, 0.035, 1.1, out)); break;
        default: bell(midi(base), now, 0.05, 0.9, out);
    }
}

// ------------------------------------------------------------------ the loading's passage
let P = null;

/** The loading's music starts (the palette `hue` 0…1 picks the chord's root and scale). */
export function passageStart(hue = Math.random()) {
    const c = ac();
    if (!c || P) return;
    const now = c.currentTime, v = vol();
    const root = 45 + Math.floor(hue * 7); // (A2…D#3)
    const scale = SCALES[Math.floor(hue * 97) % SCALES.length];
    const out = c.createGain(); out.gain.setValueAtTime(0, now); out.gain.linearRampToValueAtTime(v * 0.75, now + 2.5); out.connect(master);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 3; lp.connect(out);
    const osc = [];
    for (const [s, det, type, g] of [[0, -6, 'sawtooth', 0.05], [0, 7, 'sawtooth', 0.05], [scale[2], 0, 'triangle', 0.05], [12, 3, 'sine', 0.04], [scale[4], -4, 'triangle', 0]]) {
        const o = c.createOscillator(), og = c.createGain();
        o.type = type; o.frequency.value = midi(root + s); o.detune.value = det;
        og.gain.value = g;
        o.connect(og); og.connect(lp); o.start(now);
        osc.push({ o, og });
    }
    // a slow tremble of the filter (the passage breathes)
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.18; lg.gain.value = 120; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(now);
    P = { out, lp, osc, lfo, root, scale, prog: 0, windAt: now, bellAt: now + 1.2 };
}

/** The passage's music follows the loading (0…1): the filter opens, the fifth joins, the wind rushes oftener, the bells climb. */
export function passageTick(prog) {
    const c = ctx;
    if (!c || !P) return;
    const now = c.currentTime;
    P.prog = Math.max(P.prog, prog);
    P.lp.frequency.setTargetAtTime(380 + P.prog * 2600, now, 0.6);
    P.osc[4].og.gain.setTargetAtTime(0.035 * P.prog, now, 0.8);
    for (const x of P.osc) x.o.detune.setTargetAtTime((x.o.detune.value || 0) * 0.98 + P.prog * 12, now, 2); // (it rises a little)
    if (now >= P.windAt) { const len = 2.6 - P.prog * 1.4; wind(now, len, 300 + P.prog * 600, 1400 + P.prog * 3000, 0.03 + P.prog * 0.03, P.out); P.windAt = now + len * (0.9 - P.prog * 0.4); }
    if (now >= P.bellAt) {
        const s = P.scale[Math.floor(Math.random() * P.scale.length)] + 24 + Math.round(P.prog * 12);
        bell(midi(P.root + s), now, 0.03 + P.prog * 0.02, 2.2, P.out);
        P.bellAt = now + 1.6 - P.prog * 1.1 + Math.random() * 0.6;
    }
}

/** The arrival: a swell, a bright chord of bells — and the passage's music fades out. */
export function passageArrive() {
    const c = ctx;
    if (!c || !P) return;
    const now = c.currentTime, Q = P;
    P = null;
    wind(now, 1.6, 400, 6000, 0.08, Q.out);
    Q.lp.frequency.setTargetAtTime(6000, now, 0.4);
    [0, 7, 12, 16, 19, 24].forEach((s, i) => bell(midi(Q.root + 24 + s), now + 0.9 + i * 0.06, 0.05, 3, Q.out));
    Q.out.gain.setTargetAtTime(0, now + 1.8, 0.7);
    setTimeout(() => { for (const x of Q.osc) try { x.o.stop(); } catch (e) { /* gone */ } try { Q.lfo.stop(); } catch (e) { /* gone */ } Q.out.disconnect(); }, 6000);
}

export function passageStop() {
    if (!P || !ctx) { P = null; return; }
    const Q = P; P = null;
    Q.out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => { for (const x of Q.osc) try { x.o.stop(); } catch (e) { /* gone */ } try { Q.lfo.stop(); } catch (e) { /* gone */ } }, 2000);
}

/** «Ва-ва-ва-ваааа»: a sad trombone — four falling notes, the last one long and wobbling (synthesised: a buzzing reed through a closing «wah»). */
export function sadTrombone() {
    try {
        const ctx = ac(); // (the menu's own sound: the game's effects slider — vol())
        if (!ctx) return;
        const out = ctx.createGain(); out.gain.value = 0.32 * Math.max(0.15, vol() * 2); out.connect(master);
        const notes = [[293.7, 0.42], [277.2, 0.42], [261.6, 0.42], [246.9, 1.5]]; // (D4 → C#4 → C4 → B3, the last held)
        let t = ctx.currentTime + 0.05;
        notes.forEach(([f, d], i) => {
            const last = i === notes.length - 1;
            const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
            o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f * 0.5;
            const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(lp);
            o.connect(lp); lp.connect(g); g.connect(out);
            lp.type = 'lowpass'; lp.Q.value = 6;
            // the «wah»: the mute opens and closes on each note
            lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(1500, t + 0.12); lp.frequency.linearRampToValueAtTime(500, t + d * 0.9);
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.05); g.gain.setValueAtTime(0.9, t + d * 0.7); g.gain.linearRampToValueAtTime(0, t + d);
            o.frequency.setValueAtTime(f * 1.03, t); o.frequency.linearRampToValueAtTime(f, t + 0.08); // (a little scoop up into it)
            if (last) { // (the long one wobbles and sags)
                const lfo = ctx.createOscillator(), lg = ctx.createGain();
                lfo.frequency.setValueAtTime(5, t); lfo.frequency.linearRampToValueAtTime(7, t + d);
                lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.035, t + 0.4);
                lfo.connect(lg); lg.connect(o.frequency);
                o.frequency.linearRampToValueAtTime(f * 0.94, t + d);
                lfo.start(t); lfo.stop(t + d + 0.05);
            }
            o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05);
            t += d + 0.04;
        });
    } catch { /* no sound: the devil is enough */ }
}
