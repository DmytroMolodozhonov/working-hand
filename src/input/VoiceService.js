/**
 * VoiceService.js — Russian speech recognition (Web Speech API) for spells.
 * Same behaviour as the original: interim results, auto-restart while wanted.
 */

export class VoiceService {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.shouldListen = false;
        this.onResult = null;
        this.supported = false;
        const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
        if (!SR) {
            console.warn('Web Speech API not supported in this browser.');
            return;
        }
        this.supported = true;
        this.recognition = new SR();
        this.recognition.continuous = false;
        this.recognition.lang = 'ru-RU';
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        this.recognition.onresult = (event) => {
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
            if (!this.shouldListen) return;
            setTimeout(() => {
                if (!this.shouldListen || this.isListening) return;
                try { this.recognition.start(); this.isListening = true; } catch (e) { /* already started */ }
            }, 100);
        };
    }

    // ------------------------------------------------------------ loudness
    // In multiplayer a friend's voice (same room, or from the speakers) reaches
    // this microphone too. Your own voice is much louder in your own microphone,
    // so the level while a spell was said tells whose voice it was.

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
        if (!this._meter || !this._levels?.length) return null;
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

    start() {
        this.startLevelMeter();
        this.shouldListen = true;
        if (!this.recognition || this.isListening) return;
        try {
            this.recognition.start();
            this.isListening = true;
        } catch (e) { /* already started */ }
    }

    stop() {
        this.shouldListen = false;
        if (this.recognition && this.isListening) {
            try { this.recognition.stop(); } catch (e) { /* ignore */ }
            this.isListening = false;
        }
    }
}
