/**
 * Speech.js — villagers' voices.
 *
 *   const speech = new Speech({ master: () => game.sound.globalVolume, onStatus });
 *   speech.say('Свежий хлеб!', { voiceKey: villager.id, role: 'merchant', female: false, volume: 0.6 });
 *
 * Two engines:
 *  - 'neural' (default): Supertonic 3 in the browser (src/audio/NeuralVoice.js),
 *    ten Russian voices — five women, five men. Downloaded once (~145 MB, with
 *    progress through onStatus) and kept in the browser cache. Until it is
 *    ready (or if it cannot load) the system voices below speak instead.
 *  - 'system': the Web Speech API (Windows Irina/Pavel, Edge Svetlana/Dmitry…).
 *
 * The one hard rule (src/audio/VoiceCast.js): a woman always speaks with a
 * female voice and a man with a male one, never mixed. Pass `female`
 * (true/false) or `gender` ('female'/'male') for every speaker; without them
 * the speaker is a man. Each villager keeps its own voice, pitch and pace.
 *
 * Volume: `volume` (distance) × `master()` — the game's sound volume.
 * Queue: at most one line is pending: a new line from the SAME villager waits
 * for the current one (replacing any older pending line); a line from a
 * DIFFERENT villager cancels what is being said.
 * A no-op in node or when the browser has neither engine.
 */

import { NeuralVoice } from './NeuralVoice.js';
import { castNeural, isFemale, pickSystemVoice, systemVoiceParams } from './VoiceCast.js';
import { speakable } from './ruText.js';
import { aired } from './GameVoices.js';

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const PREP_REST = 500; // ms at least between two lines made in advance (the video card is the game's first)

/** How loud the game's voices stay while the player speaks (a spell must be heard over them). */
export const DUCK_LEVEL = 0.18;

/** A gain that brings a sentence to the same loudness as the others (RMS ≈ −20 dBFS, peaks kept under 1). */
export function loudness(pcm) {
    let sum = 0, peak = 0;
    for (let i = 0; i < pcm.length; i++) { const x = pcm[i]; sum += x * x; const a = x < 0 ? -x : x; if (a > peak) peak = a; }
    const rms = Math.sqrt(sum / Math.max(1, pcm.length));
    if (rms < 1e-4) return 1;
    return Math.max(Math.min(0.8, 0.98 / Math.max(peak, 1e-4)), Math.min(4, 0.1 / rms, 0.98 / Math.max(peak, 1e-4)));
}

/** Louder by role: a knight's low voice was the quietest (the author: «голос рыцарей тише… +50%»). */
export const ROLE_BOOST = { knight: 1.5 };

/** A soft limiter: up to 0.7 untouched, above it rounds off toward 1 (never clips) — a low voice with high peaks can be as loud as the others. */
export function softLimit(x) {
    const a = x < 0 ? -x : x;
    if (a <= 0.7) return x;
    const y = 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3);
    return x < 0 ? -y : y;
}

export class Speech {
    /**
     * @param {{lang?:string, engine?:'neural'|'system', master?:Function, neural?:object|null,
     *          onStatus?:Function, audioContext?:Function}} [opts]
     *   neural: a NeuralVoice-like object (tests), or null for none;
     *   onStatus({state:'loading'|'ready'|'failed', fraction, text});
     *   audioContext: () => AudioContext (default: an own one, made on first use).
     */
    constructor({ lang = 'ru-RU', engine = 'neural', master = null, neural, onStatus = null, audioContext = null } = {}) {
        this.lang = lang;
        this.enabled = true;
        this.engine = engine === 'system' ? 'system' : 'neural';
        this.master = typeof master === 'function' ? master : () => 1;
        this.onStatus = onStatus;
        this._audioContext = audioContext;
        this._ctx = null;
        this.neural = neural !== undefined ? neural : (NeuralVoice.supported ? NeuralVoice.shared() : null);
        this.synth = (typeof window !== 'undefined' && window.speechSynthesis) || null;
        this._Utterance = (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) || null;
        this._voices = [];
        this._current = null; // { voiceKey, opts, stop() }
        this._pending = null; // { text, opts }
        this._cache = new Map(); // short lines already made: voice|speed|pitch|text -> {pcm, sr}
        this._keep = new Set(); // lines made in advance (the thinking words): kept in the cache whatever their length
        this._prep = []; // [{text, opts}] waiting to be made in advance (one at a time, only while nobody speaks)
        this._prepBusy = false;
        this.prepRest = PREP_REST; // (ms; tests: 0)
        this.history = []; // the last lines: { engine, voice, female, pitch, speed, text }
        if (!this.systemSupported) return;
        this._refreshVoices();
        const onChange = () => this._refreshVoices();
        if (typeof this.synth.addEventListener === 'function') this.synth.addEventListener('voiceschanged', onChange);
        else this.synth.onvoiceschanged = onChange;
    }

    get systemSupported() { return !!(this.synth && this._Utterance); }

    get neuralUsable() { return !!this.neural && this.engine === 'neural' && this.neural.state !== 'failed'; }

    get supported() { return this.systemSupported || this.neuralUsable; }

    /** Russian system voices currently known to the browser. */
    get voices() { return this._voices.slice(); }

    get speaking() { return !!this._current; }

    setEngine(engine) {
        this.engine = engine === 'system' ? 'system' : 'neural';
    }

    _refreshVoices() {
        try {
            const all = this.synth.getVoices() || [];
            const base = this.lang.slice(0, 2).toLowerCase();
            this._voices = all.filter((v) => String(v.lang || '').toLowerCase().replace('_', '-').startsWith(base));
        } catch (e) {
            this._voices = [];
        }
    }

    /** The system voice of a villager (never of the other gender); null = none fits. */
    pickVoice(voiceKey, female) {
        if (!this._voices.length && this.systemSupported) this._refreshVoices();
        return pickSystemVoice(this._voices, voiceKey, !!female);
    }

    /** Web Speech pitch and rate for a villager (role × gender × own jitter). */
    voiceParams(opts = {}) {
        return systemVoiceParams(opts);
    }

    /** Starts downloading the neural voices in the background (once). */
    preload() {
        const nv = this.neural;
        if (!nv || this.engine !== 'neural') return;
        if (nv.state === 'ready') { this._status({ state: 'ready', fraction: 1, text: 'Голоса жителей готовы' }); return; } // (loaded in the menu — NeuralVoice.shared)
        if (nv.state === 'loading' && nv._loading) { nv._loading.then(() => this._status({ state: 'ready', fraction: 1, text: 'Голоса жителей готовы' }), () => {}); return; }
        if (nv.state !== 'idle') return;
        this._status({ state: 'loading', fraction: 0, text: 'Голоса жителей: загрузка…' });
        nv.load((fraction, text) => this._status({ state: 'loading', fraction, text }))
            .then(() => this._status({ state: 'ready', fraction: 1, text: 'Голоса жителей готовы' }))
            .catch((e) => this._status({ state: 'failed', fraction: null, text: `Голоса жителей не загрузились: ${e?.message || e}` }));
    }

    _status(s) {
        if (typeof this.onStatus !== 'function') return;
        try { this.onStatus(s); } catch (e) { /* ignore */ }
    }

    /** The cache key of a short line in this voice (null: not kept). */
    _ckey(cast, piece) {
        if (piece.length > 12 && !this._keep.has(piece)) return null;
        return `${cast.voice}|${cast.speed.toFixed(3)}|${cast.pitch.toFixed(3)}|${piece}`;
    }

    /** Is this line already made in this villager's voice (said with no wait)? */
    isReady(text, opts = {}) {
        if (!this.neuralUsable || !this.neural.ready) return false;
        const clean = speakable(text);
        const cast = castNeural({ ...opts, voiceKey: opts.voiceKey ?? 'default', female: isFemale(opts) });
        const k = clean && this._ckey(cast, clean);
        return !!(k && this._cache.has(k));
    }

    /**
     * Makes short lines (the thinking words: «Хм…», «Я понял…») in this villager's voice in advance,
     * one at a time and only while nobody is speaking — then say() plays them at once.
     * @param {string[]} lines
     * @param {{voiceKey?:string|number, role?:string, female?:boolean}} opts
     */
    prepare(lines, opts = {}) {
        if (!this.neuralUsable || !this.neural.ready || !Array.isArray(lines)) return;
        const o = { ...opts, voiceKey: opts.voiceKey ?? 'default', female: isFemale(opts) };
        for (const l of lines) {
            const clean = speakable(l);
            if (!clean || clean.length > 40) continue;
            this._keep.add(clean);
            if (this.isReady(clean, o) || this._prep.some((p) => p.text === clean && p.opts.voiceKey === o.voiceKey)) continue;
            this._prep.push({ text: clean, opts: o });
        }
        if (this._prep.length > 80) this._prep.splice(0, this._prep.length - 80);
        this._prepNext();
    }

    _prepNext() {
        if (this._prepBusy || !this._prep.length) return;
        // (a line being said goes first: try again a little later)
        if (this._current || this._ducked) { if (!this._prepT) this._prepT = setTimeout(() => { this._prepT = null; this._prepNext(); }, 400); return; }
        const { text, opts } = this._prep.shift();
        const cast = castNeural(opts);
        const k = this._ckey(cast, text);
        if (!k || this._cache.has(k)) { this._prepNext(); return; }
        this._prepBusy = true;
        // (the voices are made on the video card the game draws with: lines made in advance go one by one with a rest
        // between them — twice the line's own time, at least PREP_REST — so the card is never taken for seconds on end:
        // a villager met made ~10 lines back to back, and the frames dropped while he stood near)
        const t0 = clock();
        const done = () => {
            const rest = this.prepRest > 0 ? Math.max(this.prepRest, 2 * (clock() - t0)) : 0;
            if (this._prepT) clearTimeout(this._prepT);
            this._prepT = setTimeout(() => { this._prepT = null; this._prepBusy = false; this._prepNext(); }, rest);
        };
        this.neural.synth(text, { voice: cast.voice, speed: cast.speed / cast.pitch }).then(({ pcm, sampleRate }) => {
            if (pcm?.length) this._store(k, { pcm, sr: sampleRate });
            done();
        }, done);
    }

    _store(k, v) {
        this._cache.set(k, v);
        if (this._cache.size > 260) this._cache.delete(this._cache.keys().next().value);
    }

    /**
     * Says a line.
     * @param {string} text
     * @param {{voiceKey?:string|number, role?:string, female?:boolean, gender?:string, shout?:boolean,
     *          volume?:number, rate?:number, pitch?:number, onEnd?:Function}} [opts]
     * @returns {boolean} true when the line was spoken or queued
     */
    say(text, opts = {}) {
        if (!this.supported || !this.enabled) return false;
        const clean = speakable(text);
        if (!clean) return false;
        let master = 1;
        try { master = Number(this.master()); } catch (e) { master = 1; }
        if (!Number.isFinite(master)) master = 1;
        const volume = Math.max(0, Math.min(1, (opts.volume ?? 1) * Math.max(0, master)));
        if (volume < 0.03) return false; // too far away (or the sound is off)
        const key = opts.voiceKey ?? 'default';
        const o = { ...opts, volume, voiceKey: key, female: isFemale(opts) };
        // (an answer to the player's own words — opts.reply: he has stopped speaking, the game knows it (TalkFlow) —
        // is said now and at full loudness; before, it waited for the «player speaks» 0.9 s to run out)
        if (opts.reply && this._ducked) this.duck(false);
        // (the player speaks / casts: a new line waits — its sound would cover the spell, and its making takes the
        // processor the voice's network needs; it is said as soon as the player is done — duck(false))
        if (this._ducked && !this._current && !opts.append) {
            if (this._pending?.opts.onEnd) this._safeCall(this._pending.opts.onEnd, false);
            this._pending = { text: clean, opts: o };
            return true;
        }
        if (this._current) {
            if (this._current.voiceKey === key) {
                // the next piece of the same answer (opts.append): made at once and played right after,
                // in the same voice — nothing dropped, no wait for the line before to end
                if (opts.append && this._current.add) { this._current.add(clean, o.onStart); return true; }
                if (opts.append && this._pending) { this._pending.text += ' ' + clean; return true; }
                // same villager: wait for the current line, keep only the newest pending one
                if (this._pending?.opts.onEnd) this._safeCall(this._pending.opts.onEnd, false);
                this._pending = { text: clean, opts: o };
                return true;
            }
            this.cancel();
        }
        return this._speak(clean, o);
    }

    _speak(text, opts) {
        if (this.neuralUsable) {
            if (this.neural.ready) return this._speakNeural(text, opts);
            // (the neural voices are still loading: only the words over the head — never the computer's
            // own voice first and then another one; the computer's voice only if the neural ones fail)
            this.preload();
            this._safeCall(opts.onEnd, false);
            return false;
        }
        return this._speakSystem(text, opts);
    }

    _remember(rec) {
        this.history.push(rec);
        if (this.history.length > 30) this.history.shift();
    }

    _finish(entry, ok) {
        if (this._current !== entry) return;
        this._current = null;
        this._safeCall(entry.opts.onEnd, ok);
        const next = this._pending;
        this._pending = null;
        if (next) this._speak(next.text, next.opts);
    }

    _audio() {
        if (this._ctx) return this._ctx;
        try {
            if (this._audioContext) this._ctx = this._audioContext();
            else if (typeof window !== 'undefined') {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) this._ctx = new AC();
            }
        } catch (e) { this._ctx = null; }
        return this._ctx;
    }

    /**
     * All the neural voices go through one gain: quieter while the player speaks (duck), so the
     * microphone hears the player's spell and not a villager or the Ice Queen over it.
     */
    _duckNode(ctx) {
        if (this._duck?.context === ctx) return this._duck;
        try {
            this._duck = ctx.createGain();
            this._duck.connect(ctx.destination);
        } catch (e) { return ctx.destination; }
        return this._duck;
    }

    /** The player speaks now (true) / stopped (false): the game's voices go quiet / come back. */
    duck(on, level = DUCK_LEVEL) {
        on = !!on;
        if (on === !!this._ducked && (!on || level === this._duckLevel)) return;
        this._ducked = on;
        this._duckLevel = level;
        // (the lines held meanwhile: the newest is said now)
        if (!on && !this._current && this._pending) { const p = this._pending; this._pending = null; this._speak(p.text, p.opts); }
        const g = this._duck, ctx = this._ctx;
        if (!g?.gain || !ctx) return;
        const now = ctx.currentTime || 0;
        const to = on ? level : 1;
        try {
            g.gain.cancelScheduledValues?.(now);
            g.gain.setTargetAtTime(to, now, on ? 0.03 : 0.3);
        } catch (e) { g.gain.value = to; }
    }

    /**
     * How much louder a piece of a speaker's line is played. Every piece evened by itself made one answer
     * louder and quieter by turns (the author: «звук начал колебаться») — a short «Хм…» or a sentence's tail
     * got up to 4×: a speaker's level now moves only a little from piece to piece.
     */
    _level(key, pcm) {
        const k = loudness(pcm);
        if (key == null) return k;
        if (!this._levels) this._levels = new Map();
        const prev = this._levels.get(key);
        const out = prev ? Math.max(prev / 1.15, Math.min(prev * 1.15, k)) : k;
        this._levels.delete(key);
        this._levels.set(key, prev ? prev * 0.7 + out * 0.3 : out);
        if (this._levels.size > 64) this._levels.delete(this._levels.keys().next().value);
        return out;
    }

    _live(opts) {
        try { return opts.live() || { volume: 0 }; } catch (e) { return { volume: 0 }; }
    }

    /** One speaker falls silent (died, knocked out): his line is stopped, his queue dropped. */
    cancelKey(key) {
        if (this._pending && this._pending.opts.voiceKey === key) { const pend = this._pending; this._pending = null; this._safeCall(pend.opts.onEnd, false); }
        if (this._current && this._current.voiceKey === key) this.cancel();
    }

    _speakNeural(text, opts) {
        const cast = castNeural(opts);
        const entry = { voiceKey: opts.voiceKey, opts, stop: null, sources: [], started: false, add: null };
        this._current = entry;
        entry.stop = () => {
            for (const src of entry.sources) { try { src.onended = null; src.stop(); } catch (e) { /* ignore */ } }
            entry.sources.length = 0;
        };
        let nextAt = 0; // when the next sound starts (AudioContext time)
        let playing = 0; // sounds queued and not ended yet
        let open = 0; // pieces still being made
        let pause = 0.15; // (after a clause ending with a comma: a shorter breath)
        const maybeDone = () => { if (playing <= 0 && open <= 0) this._finish(entry, !!entry.started); };
        const ended = () => { playing--; maybeDone(); };
        const play = (pcm, sampleRate, piece, onStart = null) => {
            const ctx = this._audio();
            if (!ctx || !pcm?.length) return;
            // (the level is baked into the sound through a soft limiter: the same loudness for every voice, no clipping;
            // the gain node below only carries the distance)
            const lv = this._level(opts.voiceKey, pcm) * (ROLE_BOOST[opts.role] || 1);
            const loud = new Float32Array(pcm.length);
            for (let i = 0; i < pcm.length; i++) loud[i] = softLimit(pcm[i] * lv);
            const buf = ctx.createBuffer(1, pcm.length, sampleRate);
            if (buf.copyToChannel) buf.copyToChannel(loud, 0); else buf.getChannelData(0).set(loud);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.playbackRate.value = cast.pitch; // played `pitch` times faster…
            const out = this._duckNode(ctx); // (quieter while the player speaks)
            // (where the speaker stands NOW: he or I may have moved since the line was made — too far: not played at all)
            const live = opts.live ? this._live(opts) : null;
            if (live && live.volume < 0.03) { maybeDone(); return; }
            const gain = ctx.createGain();
            gain.gain.value = (live ? live.volume * Math.max(0, Math.min(1, Number(this.master()) || 0)) : opts.volume); // (distance only: the voice's own level is in the sound)
            src.connect(gain);
            let tail = gain;
            if (live && live.muffled && ctx.createBiquadFilter) { // (through a wall: dull)
                const lp = ctx.createBiquadFilter();
                lp.type = 'lowpass'; lp.frequency.value = 650;
                tail.connect(lp); tail = lp;
            }
            if (live && ctx.createStereoPanner) { // (from the side where he stands)
                const pn = ctx.createStereoPanner();
                pn.pan.value = Math.max(-1, Math.min(1, live.pan || 0));
                tail.connect(pn); tail = pn;
            }
            tail.connect(out);
            src.onended = ended;
            if (ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {});
            const now = ctx.currentTime || 0;
            const at = Math.max(now, nextAt);
            const dur = pcm.length / sampleRate / cast.pitch;
            nextAt = at + dur + (/[,;:—–]$/.test(piece) ? 0.06 : pause);
            // (when it sounds — the microphone hears it too: its spell words are not mine, GameVoices.js)
            const from = clock() + (at - now + (ctx.outputLatency || ctx.baseLatency || 0)) * 1000;
            aired(piece, from, from + dur * 1000);
            if (onStart) this._safeCall(onStart, from); // (when this piece is first heard: the talk's stopwatch, TalkTrace)
            entry.sources.push(src);
            entry.started = true;
            playing++;
            src.start(at);
        };
        // one piece of the answer: each sentence plays as soon as it is ready, right after the one before
        entry.add = (piece, onStart = null) => {
            if (this._current !== entry) return;
            let started = false;
            const first = onStart ? (at) => { if (!started) { started = true; onStart(at); } } : null;
            if (opts.live && this._live(opts).volume < 0.03) { maybeDone(); return; } // (cannot be heard: not even made)
            open++;
            let closed = false;
            const close = () => { if (!closed) { closed = true; open--; } };
            this._remember({ engine: 'neural', voice: cast.voice, female: cast.female, pitch: cast.pitch, speed: cast.speed, f0: cast.f0, text: piece });
            // (a short line said often — «Хм…», «Так…» — is made once per voice and kept)
            const ck = this._ckey(cast, piece);
            const hit = ck && this._cache.get(ck);
            if (hit) { this._cache.delete(ck); this._cache.set(ck, hit); } // (said often: kept longest)
            if (hit) { Promise.resolve().then(() => { if (this._current !== entry) return; close(); play(hit.pcm, hit.sr, piece, first); maybeDone(); }); return; }
            const onChunk = (pcm, sampleRate, last) => {
                if (this._current !== entry) return;
                if (last) close();
                if (ck && last && pcm?.length) this._store(ck, { pcm, sr: sampleRate });
                play(pcm, sampleRate, piece, first);
                maybeDone();
            };
            // …so it is synthesized that much slower: the pace stays `speed`
            // (steps: a live answer may be made in fewer steps of the voice network — sooner heard; tools/talkbench.mjs)
            this.neural.synth(piece, { voice: cast.voice, speed: cast.speed / cast.pitch, onChunk, ...(opts.steps ? { steps: opts.steps } : {}) }).catch(() => {
                // the neural voice failed on this line: the system voice says it (if nothing was heard yet)
                if (this._current !== entry) return;
                close();
                if (entry.started || open > 0) { maybeDone(); return; }
                this._current = null;
                if (this._speakSystem(piece, opts)) return;
                const next = this._pending; // (onEnd(false) was called by _speakSystem)
                this._pending = null;
                if (next) this._speak(next.text, next.opts);
            });
        };
        entry.add(text, opts.onStart);
        return true;
    }

    _speakSystem(text, opts) {
        if (!this.systemSupported) { this._safeCall(opts.onEnd, false); return false; }
        const voice = this.pickVoice(opts.voiceKey, opts.female);
        if (!voice) { this._safeCall(opts.onEnd, false); return false; } // no voice of this gender: text only
        const u = new this._Utterance(text);
        u.lang = voice.lang || this.lang;
        u.voice = voice;
        const { pitch, rate } = this.voiceParams({ ...opts, voice });
        u.pitch = pitch;
        u.rate = rate;
        if (opts.live) { const l = this._live(opts); if (l.volume < 0.03) { this._safeCall(opts.onEnd, false); return false; } u.volume = Math.min(1, l.volume * Math.max(0, Number(this.master()) || 0)); } else u.volume = opts.volume;
        const entry = { voiceKey: opts.voiceKey, opts, stop: null };
        this._remember({ engine: 'system', voice: voice.name, female: opts.female, pitch, speed: rate, text });
        // (when it sounds, as best the browser tells: its spell words are not mine, GameVoices.js)
        const said = aired(text, clock(), clock() + 600 + text.length * 90 / Math.max(0.5, rate));
        u.onstart = () => { const d = said.to - said.from; said.from = clock(); said.to = said.from + d; if (opts.onStart) this._safeCall(opts.onStart, said.from); };
        u.onend = () => { said.to = clock(); this._finish(entry, true); };
        u.onerror = () => { said.to = clock(); this._finish(entry, false); };
        this._current = entry;
        try {
            if (this.synth.paused) this.synth.resume(); // Chrome sometimes gets stuck paused
            this.synth.speak(u);
        } catch (e) {
            this._current = null;
            this._safeCall(opts.onEnd, false);
            return false;
        }
        return true;
    }

    _safeCall(fn, ok) {
        if (typeof fn !== 'function') return;
        try { fn(ok); } catch (e) { /* game callback error must not break speech */ }
    }

    /** Stops the current line and drops the pending one. */
    cancel() {
        const cur = this._current, pend = this._pending;
        this._current = null;
        this._pending = null;
        if (cur?.stop) cur.stop();
        this.neural?.cancelAll?.(); // (not made any more: the new line is heard sooner)
        if (this.systemSupported) {
            try { this.synth.cancel(); } catch (e) { /* ignore */ }
        }
        if (cur) this._safeCall(cur.opts.onEnd, false);
        if (pend) this._safeCall(pend.opts.onEnd, false);
    }
}
