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
        this.neural = neural !== undefined ? neural : (NeuralVoice.supported ? new NeuralVoice() : null);
        this.synth = (typeof window !== 'undefined' && window.speechSynthesis) || null;
        this._Utterance = (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) || null;
        this._voices = [];
        this._current = null; // { voiceKey, opts, stop() }
        this._pending = null; // { text, opts }
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
        if (!nv || this.engine !== 'neural' || nv.state !== 'idle') return;
        this._status({ state: 'loading', fraction: 0, text: 'Голоса жителей: загрузка…' });
        nv.load((fraction, text) => this._status({ state: 'loading', fraction, text }))
            .then(() => this._status({ state: 'ready', fraction: 1, text: 'Голоса жителей готовы' }))
            .catch((e) => this._status({ state: 'failed', fraction: null, text: `Голоса жителей не загрузились: ${e?.message || e}` }));
    }

    _status(s) {
        if (typeof this.onStatus !== 'function') return;
        try { this.onStatus(s); } catch (e) { /* ignore */ }
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
        if (this._current) {
            if (this._current.voiceKey === key) {
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
            this.preload();
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

    _speakNeural(text, opts) {
        const cast = castNeural(opts);
        const entry = { voiceKey: opts.voiceKey, opts, stop: null, sources: [], started: false };
        this._current = entry;
        this._remember({ engine: 'neural', voice: cast.voice, female: cast.female, pitch: cast.pitch, speed: cast.speed, f0: cast.f0, text });
        entry.stop = () => {
            for (const src of entry.sources) { try { src.onended = null; src.stop(); } catch (e) { /* ignore */ } }
            entry.sources.length = 0;
        };
        let nextAt = 0; // when the next sentence starts (AudioContext time)
        let playing = 0;
        let lastQueued = false;
        const ended = () => { if (--playing <= 0 && lastQueued) this._finish(entry, true); };
        // each sentence plays as soon as it is ready, right after the previous one
        const onChunk = (pcm, sampleRate, last) => {
            if (this._current !== entry) return;
            if (last) lastQueued = true;
            const ctx = this._audio();
            if (!ctx || !pcm?.length) { if (last && playing <= 0) this._finish(entry, !!entry.started); return; }
            const buf = ctx.createBuffer(1, pcm.length, sampleRate);
            if (buf.copyToChannel) buf.copyToChannel(pcm, 0); else buf.getChannelData(0).set(pcm);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.playbackRate.value = cast.pitch; // played `pitch` times faster…
            const gain = ctx.createGain();
            gain.gain.value = opts.volume;
            src.connect(gain);
            gain.connect(ctx.destination);
            src.onended = ended;
            if (ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {});
            const now = ctx.currentTime || 0;
            const at = Math.max(now, nextAt);
            nextAt = at + pcm.length / sampleRate / cast.pitch + 0.15;
            entry.sources.push(src);
            entry.started = true;
            playing++;
            src.start(at);
        };
        // …so it is synthesized that much slower: the pace stays `speed`
        this.neural.synth(text, { voice: cast.voice, speed: cast.speed / cast.pitch, onChunk }).catch(() => {
            // the neural voice failed on this line: the system voice says it (if nothing was heard yet)
            if (this._current !== entry) return;
            if (entry.started) { lastQueued = true; if (playing <= 0) this._finish(entry, true); return; }
            this._current = null;
            if (this._speakSystem(text, opts)) return;
            const next = this._pending; // (onEnd(false) was called by _speakSystem)
            this._pending = null;
            if (next) this._speak(next.text, next.opts);
        });
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
        u.volume = opts.volume;
        const entry = { voiceKey: opts.voiceKey, opts, stop: null };
        this._remember({ engine: 'system', voice: voice.name, female: opts.female, pitch, speed: rate, text });
        u.onend = () => this._finish(entry, true);
        u.onerror = () => this._finish(entry, false);
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
        if (this.systemSupported) {
            try { this.synth.cancel(); } catch (e) { /* ignore */ }
        }
        if (cur) this._safeCall(cur.opts.onEnd, false);
        if (pend) this._safeCall(pend.opts.onEnd, false);
    }
}
