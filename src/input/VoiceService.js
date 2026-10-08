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

    start() {
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
