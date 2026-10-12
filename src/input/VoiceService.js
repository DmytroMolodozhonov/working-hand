/**
 * VoiceService.js — the voice: what the player says (spells, talk to villagers).
 *
 * Two ways to hear, one result: onResult(text, isFinal, meta).
 *   - «native» (the default where it is installed): voice_native.py — the speech network on this
 *     computer (GigaAM v3), the speakers' sound taken out of the microphone (a friend over Discord
 *     never casts here), the spell found by its sound (SpellSpotter.js). NativeVoice.js.
 *   - «browser»: the browser's recognizer (Web Speech, Google's, ru-RU) as before: while the native
 *     voice is being installed / downloaded, if it fails, or when chosen in the settings.
 */

import { NativeVoice } from './NativeVoice.js';

export class VoiceService {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.shouldListen = false;
        this.onResult = null;
        this.onEcho = null; // (spell words, meta) a spell heard only from the speakers (native)
        this.supported = false;
        this.engine = 'browser'; // 'native' | 'browser' — which one hears now
        this.prefer = 'auto';    // 'auto' (native where it is installed) | 'browser'
        this._levels = [];
        this.noiseFloor = -60;
        this.ownLevel = null;
        this.native = new NativeVoice();
        this.native.onResult = (text, isFinal, meta) => this.onResult?.(text, isFinal, false, meta);
        this.native.onEcho = (words, meta) => this.onEcho?.(words, meta);
        this.native.onLevel = (d) => this._nativeLevel(d);
        this.native.onFail = () => {
            if (this.engine !== 'native') return;
            console.warn('[Voice] the native voice stopped — the browser\'s recognizer takes over');
            this.engine = 'browser';
            if (this.shouldListen) this._startBrowser();
        };
        const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
        if (!SR) {
            console.warn('Web Speech API not supported in this browser.');
            return;
        }
        this.supported = true;
        this.recognition = new SR();
        this.recognition.continuous = false;
        this.lang = 'ru-RU';
        this.recognition.lang = this.lang;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        this.recognition.onresult = (event) => {
            if (this.engine !== 'browser') return;
            const res = event.results[event.resultIndex] || event.results[0];
            const transcript = res[0].transcript.toLowerCase().trim();
            if (this.onResult) this.onResult(transcript, !!res.isFinal);
        };
        this.recognition.onerror = (event) => {
            if (event.error === 'not-allowed') console.error('Microphone access denied!');
            else if (event.error !== 'no-speech' && event.error !== 'aborted') console.warn('Voice recognition error:', event.error);
        };
        this.recognition.onend = () => {
            this.isListening = false;
            if (!this.shouldListen || this.engine !== 'browser') return;
            setTimeout(() => {
                if (!this.shouldListen || this.isListening || this.engine !== 'browser') return;
                try { this.recognition.start(); this.isListening = true; } catch (e) { /* already started */ }
            }, 100);
        };
    }

    // ------------------------------------------------------------ loudness
    // In multiplayer a friend's voice (same room, or from the speakers) reaches
    // this microphone too. Your own voice is much louder in your own microphone,
    // so the level while a spell was said tells whose voice it was.

    /** The native voice's levels (10 ms each, the echo already out) → the same list as the browser's meter. */
    _nativeLevel(d) {
        const now = performance.now();
        const n = d.db?.length || 0;
        for (let j = 0; j < n; j++) {
            const db = d.db[j];
            this._levels.push([now - 70 - (n - 1 - j) * 10, db]);
            this.noiseFloor += (db - this.noiseFloor) * (db < this.noiseFloor ? 0.3 : 0.004);
        }
        while (this._levels.length && now - this._levels[0][0] > 4000) this._levels.shift();
    }

    /** Starts measuring the microphone level (a separate light stream). */
    async startLevelMeter() {
        if (this._meter || this._meterStarting || !navigator.mediaDevices?.getUserMedia) return;
        this._meterStarting = true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const src = ctx.createMediaStreamSource(stream);
            const an = ctx.createAnalyser();
            an.fftSize = 1024;
            src.connect(an);
            const buf = new Float32Array(an.fftSize);
            this._levels = []; // [time, dB]
            this.noiseFloor = -60;
            this.ownLevel = null; // learned loudness of the player's own spells
            const tick = () => {
                if (this.engine !== 'browser') return; // (the native voice gives the levels)
                if (ctx.state === 'suspended') ctx.resume().catch(() => {});
                an.getFloatTimeDomainData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
                const db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9);
                const now = performance.now();
                this._levels.push([now, db]);
                while (this._levels.length && now - this._levels[0][0] > 4000) this._levels.shift();
                // background noise: follows quiet moments quickly, loud ones very slowly
                this.noiseFloor += (db - this.noiseFloor) * (db < this.noiseFloor ? 0.3 : 0.004);
            };
            this._meter = { stream, ctx, timer: setInterval(tick, 50) };
        } catch (e) {
            console.warn('[Voice] level meter unavailable:', e?.name || e);
        }
        this._meterStarting = false;
    }

    /** Loudest moment of the last `ms` milliseconds (dB), or null without a meter. */
    recentPeak(ms = 2500) {
        if (!this._levels?.length || (!this._meter && this.engine !== 'native')) return null;
        const t = performance.now() - ms;
        let peak = -Infinity;
        for (const [time, db] of this._levels) if (time >= t && db > peak) peak = db;
        return Number.isFinite(peak) ? peak : null;
    }

    /**
     * Was the phrase just heard said by this player (loud in this microphone)?
     * @param {number} margin dB a spell may be quieter than the player's usual ones
     */
    isOwnVoice(margin = 9) {
        const peak = this.recentPeak();
        if (peak === null) return true; // can't tell: don't block
        if (peak < this.noiseFloor + 8) return false; // barely above the background
        if (this.ownLevel === null) return peak >= this.noiseFloor + 15;
        return peak >= this.ownLevel - margin;
    }

    /** Remember how loud the player's own spells are. */
    learnOwnVoice() {
        const peak = this.recentPeak();
        if (peak === null || peak < this.noiseFloor + 15) return;
        this.ownLevel = this.ownLevel === null ? peak : this.ownLevel * 0.8 + peak * 0.2;
    }

    /** The speakers' sound is taken out of the microphone now (native, with the speakers' copy). */
    get aec() { return this.engine === 'native' && !!this.native.status?.aec; }

    /** Listen in another language ('en-US' / 'ru-RU'): the recognizer starts again with it. */
    setLang(lang) {
        if (!this.recognition || lang === this.lang) return;
        this.lang = lang;
        this.recognition.lang = lang;
        // (onend starts it again with the new language while it is wanted)
        if (this.isListening) { try { this.recognition.abort(); } catch (e) { /* ignore */ } }
    }

    /** 'auto' | 'browser' (the settings) — takes effect at once while listening. */
    setPreference(p) {
        const want = p === 'browser' ? 'browser' : 'auto';
        if (want === this.prefer) return;
        this.prefer = want;
        if (this.shouldListen) { this.stop(); this.start(); }
    }

    start() {
        this.shouldListen = true;
        if (this._starting) return;
        if (this.prefer === 'browser') { this._startBrowser(); return; }
        this._starting = true;
        this.native.check().then((st) => {
            this._starting = false;
            if (!this.shouldListen) return;
            if (st?.available) {
                this.engine = 'native';
                this._stopBrowser();
                this.native.start();
            } else {
                this._startBrowser();
            }
        });
    }

    _startBrowser() {
        this.engine = 'browser';
        this.native.stop();
        this.startLevelMeter();
        if (!this.recognition || this.isListening) return;
        try {
            this.recognition.start();
            this.isListening = true;
        } catch (e) { /* already started */ }
    }

    _stopBrowser() {
        if (this.recognition && this.isListening) {
            try { this.recognition.stop(); } catch (e) { /* ignore */ }
            this.isListening = false;
        }
    }

    stop() {
        this.shouldListen = false;
        this.native.stop();
        this._stopBrowser();
    }
}
