class VoiceService {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.onResult = null; // Callback: (command) => {}

        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.lang = 'ru-RU'; // Russian language
            this.recognition.interimResults = true; // CHANGED: True for instant partial results
            this.recognition.maxAlternatives = 1;

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript.toLowerCase().trim();
                console.log("Voice recognized:", transcript);
                if (this.onResult) {
                    this.onResult(transcript);
                }
            };

            this.recognition.onerror = (event) => {
                console.warn("Voice recognition error:", event.error);
                if (event.error === 'not-allowed') {
                    console.error("Microphone access denied!");
                }
            };

            this.recognition.onend = () => {
                this.isListening = false;
                // Auto-restart if we intended to keep listening
                if (this.shouldListen) {
                    console.log("Voice Restarting...");
                    // Add slight delay to prevent browser throttling/errors
                    setTimeout(() => {
                        if (!this.shouldListen) return;
                        try {
                            this.recognition.start();
                            this.isListening = true;
                        } catch (e) { console.warn("Restart failed", e); }
                    }, 100);
                }
            };
        } else {
            console.error("Web Speech API not supported in this browser.");
        }
    }

    start() {
        if (this.recognition && !this.isListening) {
            this.shouldListen = true; // Intent flag
            try {
                this.recognition.start();
                this.isListening = true;
                console.log("%c[VoiceService] Mic STARTED", "color: #27ae60; font-weight: bold");
            } catch (e) {
                // Ignore "already started" errors
            }
        }
    }

    stop() {
        this.shouldListen = false; // Intent flag
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
            console.log("%c[VoiceService] Mic STOPPED", "color: #c0392b; font-weight: bold");
        }
    }
}
