/**
 * Speech.js — villagers' voices (text-to-speech, Web Speech API, ru-RU).
 *
 *   const speech = new Speech();
 *   speech.say('Свежий хлеб!', { voiceKey: villager.id, role: 'merchant', female: false, volume: 0.6 });
 *
 * - Picks a Russian voice per villager deterministically (same villager → same
 *   voice every time), preferring local (offline) voices.
 * - Varies pitch/rate by role and gender: the king is slower and lower, knights
 *   low, women higher, farmers a bit faster.
 * - At most one utterance is pending: a new line from the SAME villager waits
 *   for the current one (replacing any older pending line); a line from a
 *   DIFFERENT villager cancels what is being said.
 * - A no-op in node or when the browser has no speechSynthesis.
 */

const ROLE_VOICE = {
    king: { rate: 0.86, pitch: 0.78 },
    knight: { rate: 0.96, pitch: 0.72 },
    builder: { rate: 1.0, pitch: 0.9 },
    farmer: { rate: 1.1, pitch: 1.0 },
    merchant: { rate: 1.06, pitch: 1.05 },
};

// Voice-name hints (Windows, macOS, Android, Chrome, Edge «Online (Natural)» voices).
const FEMALE_HINT = /(milena|irina|katya|katja|anna|alena|alyona|elena|svetlana|dariya|daria|tatyana|tatiana|yelena|ekaterina|olga|natalia|female|женск|милена|ирина|катя|алёна|алена|светлана|дарья|google)/i;
const MALE_HINT = /(yuri|yury|pavel|dmitry|dmitri|maxim|artem|artyom|nikolai|aleksandr|alexander|mikhail|ivan|(?<!fe)male|мужск|юрий|павел|дмитрий|максим|артём|артем|николай|михаил)/i;

function hash(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

function genderOf(voice) {
    const n = `${voice.name} ${voice.voiceURI || ''}`;
    if (MALE_HINT.test(n)) return 'male';
    if (FEMALE_HINT.test(n)) return 'female';
    return 'unknown';
}

/** Text that TTS reads well: no stage directions, emoji or markup. */
function cleanForSpeech(text) {
    return String(text ?? '')
        .replace(/\*[^*]*\*/g, ' ')
        .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, ' ')
        .replace(/[«»"]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export class Speech {
    constructor({ lang = 'ru-RU' } = {}) {
        this.lang = lang;
        this.enabled = true;
        this.synth = (typeof window !== 'undefined' && window.speechSynthesis) || null;
        this._Utterance = (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) || null;
        this._voices = [];
        this._current = null; // { utter, voiceKey, opts }
        this._pending = null; // { text, opts }
        if (!this.supported) return;
        this._refreshVoices();
        const onChange = () => this._refreshVoices();
        if (typeof this.synth.addEventListener === 'function') this.synth.addEventListener('voiceschanged', onChange);
        else this.synth.onvoiceschanged = onChange;
    }

    get supported() { return !!(this.synth && this._Utterance); }

    /** Russian voices currently known to the browser. */
    get voices() { return this._voices.slice(); }

    get speaking() { return !!this._current; }

    _refreshVoices() {
        try {
            const all = this.synth.getVoices() || [];
            const base = this.lang.slice(0, 2).toLowerCase();
            this._voices = all.filter((v) => String(v.lang || '').toLowerCase().replace('_', '-').startsWith(base));
        } catch (e) {
            this._voices = [];
        }
    }

    /** Deterministic voice for a villager (null → the browser picks by lang). */
    pickVoice(voiceKey, female) {
        if (!this._voices.length) this._refreshVoices();
        const voices = this._voices;
        if (!voices.length) return null;
        const local = voices.filter((v) => v.localService);
        const pool = local.length ? local : voices;
        const want = female ? 'female' : 'male';
        const matching = pool.filter((v) => genderOf(v) === want);
        const neutral = pool.filter((v) => genderOf(v) === 'unknown');
        const list = matching.length ? matching : neutral.length ? neutral : pool;
        return list[hash(voiceKey ?? 'villager') % list.length];
    }

    /** Pitch and rate for a villager: role base × gender × small per-villager jitter. */
    voiceParams({ voiceKey, role, female, voice, rate, pitch } = {}) {
        const base = ROLE_VOICE[role] || { rate: 1, pitch: 1 };
        const h = hash(`${voiceKey}|tone`);
        const j1 = ((h & 0xff) / 255 - 0.5) * 0.16;
        const j2 = (((h >>> 8) & 0xff) / 255 - 0.5) * 0.12;
        let p = base.pitch * (female ? 1.28 : 1) + j1;
        // the chosen voice has the "wrong" gender → bend the pitch further
        const g = voice ? genderOf(voice) : 'unknown';
        if (female && g === 'male') p += 0.35;
        if (!female && g === 'female') p -= 0.3;
        let r = base.rate + j2;
        if (typeof pitch === 'number') p = pitch;
        if (typeof rate === 'number') r = rate;
        return { pitch: Math.max(0.1, Math.min(2, p)), rate: Math.max(0.5, Math.min(2, r)) };
    }

    /**
     * Says a line.
     * @param {string} text
     * @param {{voiceKey?:string|number, role?:string, female?:boolean, volume?:number, rate?:number, pitch?:number, onEnd?:Function}} [opts]
     * @returns {boolean} true when the line was spoken or queued
     */
    say(text, opts = {}) {
        if (!this.supported || !this.enabled) return false;
        const clean = cleanForSpeech(text);
        if (!clean) return false;
        const volume = Math.max(0, Math.min(1, opts.volume ?? 1));
        if (volume < 0.03) return false; // too far away to hear
        const key = opts.voiceKey ?? 'default';
        if (this._current) {
            if (this._current.voiceKey === key) {
                // same villager: wait for the current line, keep only the newest pending one
                if (this._pending?.opts.onEnd) this._safeCall(this._pending.opts.onEnd, false);
                this._pending = { text: clean, opts: { ...opts, volume } };
                return true;
            }
            this.cancel();
        }
        this._speak(clean, { ...opts, volume, voiceKey: key });
        return true;
    }

    _speak(text, opts) {
        const u = new this._Utterance(text);
        const voice = this.pickVoice(opts.voiceKey, !!opts.female);
        u.lang = voice?.lang || this.lang;
        if (voice) u.voice = voice;
        const { pitch, rate } = this.voiceParams({ ...opts, voice });
        u.pitch = pitch;
        u.rate = rate;
        u.volume = opts.volume;
        const entry = { utter: u, voiceKey: opts.voiceKey, opts };
        const done = () => {
            if (this._current !== entry) return;
            this._current = null;
            this._safeCall(opts.onEnd, true);
            const next = this._pending;
            this._pending = null;
            if (next) this._speak(next.text, { ...next.opts, voiceKey: next.opts.voiceKey ?? opts.voiceKey });
        };
        u.onend = done;
        u.onerror = done;
        this._current = entry;
        try {
            if (this.synth.paused) this.synth.resume(); // Chrome sometimes gets stuck paused
            this.synth.speak(u);
        } catch (e) {
            this._current = null;
            this._safeCall(opts.onEnd, false);
        }
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
        if (!this.supported) return;
        try { this.synth.cancel(); } catch (e) { /* ignore */ }
        if (cur) this._safeCall(cur.opts.onEnd, false);
        if (pend) this._safeCall(pend.opts.onEnd, false);
    }
}
