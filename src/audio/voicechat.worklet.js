/**
 * voicechat.worklet.js — the voice chat's sound work, on the audio thread (never in the game's frame):
 *
 *   'vc-mic'    the microphone → what goes to the friends: only speech (a speech detector with a 40 ms look-ahead, so the
 *               first syllable is never cut; «нажми и говори» — only while the key is held), soft gate edges (no clicks);
 *               10 ms levels and the detector's yes/no posted to the page 10× a second (the echo guard, «говорит» marks).
 *   'vc-meter'  a friend's voice as it is played here: passed through unchanged, its 10 ms levels posted (the echo guard's
 *               exact copy of what the speakers play, and the «говорит» mark over his name).
 */

const LOOK = 0.04;   // s the gate looks ahead
const HANG = 0.35;   // s the gate stays open after the speech ends (the ends of words)
const RAMP = 0.006;  // s of a gate's edge

const dbOf = (s, n) => 10 * Math.log10(s / Math.max(1, n) + 1e-12);

class Meter {
    constructor(rate, port) {
        this.F = Math.max(16, Math.round(rate / 100));
        this.port = port;
        this.acc = 0; this.n = 0; this.t0 = -1;
        this.lv = new Float32Array(10); this.vad = new Uint8Array(10); this.k = 0; this.bt = 0;
    }
    /** One sample's square; at a frame's end → its level. */
    add(x2, t, onFrame) {
        if (this.n === 0) this.t0 = t;
        this.acc += x2;
        if (++this.n < this.F) return;
        const db = dbOf(this.acc, this.n);
        const v = onFrame ? onFrame(db) : 0;
        if (this.k === 0) this.bt = this.t0;
        this.lv[this.k] = db; this.vad[this.k] = v ? 1 : 0;
        if (++this.k === 10) {
            this.port.postMessage({ t: this.bt, lv: this.lv.slice(), vad: this.vad.slice() });
            this.k = 0;
        }
        this.acc = 0; this.n = 0;
    }
}

class MicProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.meter = new Meter(sampleRate, this.port);
        this.delay = new Float32Array(Math.ceil(sampleRate * LOOK) + 256);
        this.di = 0;
        this.D = Math.round(sampleRate * LOOK);
        this.floor = -60;
        this.hang = 0; this.on = 0; this.run = 0;
        this.g = 0;
        this._onFrame = (db) => this._frame(db); // (one function: nothing made per sample)
        this.sens = 50; this.ptt = false; this.down = false; this.open = true; this.mute = false;
        this.port.onmessage = (e) => {
            const d = e.data || {};
            if ('sens' in d) this.sens = +d.sens;
            if ('ptt' in d) this.ptt = !!d.ptt;
            if ('down' in d) this.down = !!d.down;
            if ('mute' in d) this.mute = !!d.mute;
        };
    }

    /** The speech detector on one 10 ms level → speech now? */
    _frame(db) {
        // (the room's quiet: follows quiet moments fast, loud ones very slowly)
        this.floor += (db - this.floor) * (db < this.floor ? 0.25 : 0.003);
        const over = 16 - this.sens * 0.1; // (sensitivity 0…100 → 16…6 dB over the quiet)
        const speech = db > this.floor + over && db > -64;
        this.run = speech ? this.run + 1 : 0;
        if (this.run >= 2) this.hang = HANG * 100; // (two frames in a row: a voice, not a click)
        else if (this.hang > 0) this.hang--;
        this.on = this.hang > 0 ? 1 : 0;
        return this.on;
    }

    process(inputs, outputs) {
        const inp = inputs[0]?.[0];
        const out = outputs[0]?.[0];
        if (!out) return true;
        const n = out.length, D = this.D, L = this.delay.length;
        const step = 1 / Math.max(1, RAMP * sampleRate);
        const t0 = currentTime;
        for (let i = 0; i < n; i++) {
            const x = inp ? inp[i] : 0;
            this.meter.add(x * x, t0 + i / sampleRate, this._onFrame);
            this.delay[this.di] = x;
            const y = this.delay[(this.di - D + L) % L];
            this.di = (this.di + 1) % L;
            const want = this.mute ? 0 : this.ptt ? (this.down ? 1 : 0) : this.on;
            this.g += want > this.g ? Math.min(step, want - this.g) : -Math.min(step, this.g - want);
            out[i] = y * this.g;
        }
        for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
        return true;
    }
}

class MeterProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.meter = new Meter(sampleRate, this.port);
    }

    process(inputs, outputs) {
        const inp = inputs[0]?.[0];
        const out = outputs[0];
        const n = out?.[0]?.length || 128;
        const t0 = currentTime;
        for (let i = 0; i < n; i++) { const x = inp ? inp[i] : 0; this.meter.add(x * x, t0 + i / sampleRate, null); }
        if (out) for (let c = 0; c < out.length; c++) { const src = inputs[0]?.[c] || inp; if (src) out[c].set(src); else out[c].fill(0); }
        return true;
    }
}

/**
 * 'vc-tap': the friends' voices as played (the chat bus) → 16 kHz int16 mono, 50 ms a message (only when there is sound) —
 * the native voice's echo canceller gets them as its copy of the speakers where it has no «loopback» (macOS, Linux).
 * Each 16 kHz sample is the mean of the input samples it covers (a box filter: enough for an echo canceller's copy).
 */
class TapProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.step = sampleRate / 16000;
        this.acc = 0; this.cnt = 0; this.pos = 0;
        this.out = new Int16Array(800); this.k = 0; this.peak = 0;
    }

    process(inputs) {
        const inp = inputs[0];
        const a = inp?.[0], b = inp?.[1];
        const n = a?.length || 0;
        for (let i = 0; i < n; i++) {
            const x = b ? (a[i] + b[i]) * 0.5 : a[i];
            this.acc += x; this.cnt++;
            this.pos += 1;
            if (this.pos >= this.step) {
                this.pos -= this.step;
                const y = Math.max(-1, Math.min(1, this.acc / this.cnt));
                this.acc = 0; this.cnt = 0;
                const v = Math.round(y * 32767);
                this.out[this.k++] = v;
                const av = v < 0 ? -v : v;
                if (av > this.peak) this.peak = av;
                if (this.k === this.out.length) {
                    if (this.peak > 3) { const buf = this.out.slice().buffer; this.port.postMessage(buf, [buf]); } // (silence: nothing sent)
                    this.k = 0; this.peak = 0;
                }
            }
        }
        return true;
    }
}

registerProcessor('vc-mic', MicProcessor);
registerProcessor('vc-tap', TapProcessor);
registerProcessor('vc-meter', MeterProcessor);
