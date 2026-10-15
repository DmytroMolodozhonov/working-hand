/**
 * NativeTTS.js — the villagers' neural voices as a program of its own on this computer
 * (tts_native.py: sherpa-onnx with the same Supertonic 3 model, below normal priority — the game's
 * frames come first). This object stands in for the old web worker (tts.worker.js): the same messages
 * in and out, so NeuralVoice.js talks to either the same way. Each sentence is made and sent on its own
 * (the first one is heard sooner), a newer line cancels the rest of an older one.
 */
import { chunkText, langOf } from './supertonic.js';

/** 16-bit little-endian samples (base64, as tts_native.py sends them) → floats −1…1, in order. */
export function pcmFromBase64(b64) {
    const bin = atob(b64 || ''), n = bin.length >> 1, pcm = new Float32Array(n);
    for (let k = 0; k < n; k++) { const v = bin.charCodeAt(2 * k) | (bin.charCodeAt(2 * k + 1) << 8); pcm[k] = (v > 32767 ? v - 65536 : v) / 32768; }
    return pcm;
}

const base = () => (typeof location !== 'undefined' ? location.href : 'http://localhost/');
const MODEL_BYTES = 129 * 1048576; // (the model's download, for the progress text)

export class NativeTTSPort {
    /** The program can run here (server.py has it)? */
    static async available() {
        if (typeof fetch === 'undefined' || (typeof window !== 'undefined' && window.__ZNS_NO_NATIVE_TTS__)) return false;
        try {
            const r = await fetch(new URL('api/tts/status', base()), { cache: 'no-store' });
            return r.ok && !!(await r.json()).available;
        } catch (e) { return false; }
    }

    constructor() {
        this.onmessage = null;
        this.onerror = null;
        this._queue = Promise.resolve();
        this._cancelled = new Set();
        this._closed = false;
    }

    _post(m) { try { this.onmessage?.({ data: m }); } catch (e) { console.warn('[NativeTTS]', e); } }

    async _status(load = false) {
        const r = await fetch(new URL(load ? 'api/tts/load' : 'api/tts/status', base()), load ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    }

    postMessage(msg) {
        if (this._closed || !msg) return;
        if (msg.type === 'load') this._load();
        else if (msg.type === 'cancel') { for (const id of msg.ids || []) this._cancelled.add(id); if (this._cancelled.size > 200) this._cancelled.clear(); }
        else if (msg.type === 'synth') this._queue = this._queue.then(() => this._synth(msg)).catch((e) => this._post({ type: 'synth_error', id: msg.id, message: String(e?.message || e) }));
    }

    async _load() {
        try {
            let st = await this._status(true);
            while (!this._closed && st.state !== 'ready') {
                if (st.state === 'error') throw new Error(st.error || 'программа голосов не запустилась');
                this._post({ type: 'progress', loaded: Math.round((st.progress || 0) * MODEL_BYTES), total: MODEL_BYTES, file: st.state });
                await new Promise((r) => setTimeout(r, 700));
                st = await this._status();
            }
            this._post({ type: 'ready', source: 'native', voices: st.voices || [] });
        } catch (e) {
            this._post({ type: 'load_error', message: String(e?.message || e) });
        }
    }

    async _synth(msg) {
        const chunks = chunkText(msg.text).filter((c) => /[\p{L}\p{N}]/u.test(c)); // (a piece with no word in it is not sent)
        const lang = langOf(msg.text);
        let sr = 44100;
        for (let i = 0; i < chunks.length; i++) {
            // (a newer line cut this one: its next sentences are not made — the answer is heard sooner)
            if (this._cancelled.delete(msg.id) || this._closed) { this._post({ type: 'audio', id: msg.id, pcm: new Float32Array(0), sampleRate: sr, part: i, last: true }); return; }
            const r = await fetch(new URL('api/tts/synth', base()), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: msg.id, text: chunks[i], voice: msg.voice, speed: msg.speed ?? 1, steps: msg.steps ?? 5, lang }) });
            const a = await r.json();
            if (!r.ok) {
                // (the program gave up — it read the words wrong, or stopped: the browser's voices take over from now on)
                const st = await this._status().catch(() => null);
                if (st?.state === 'error') this._post({ type: 'load_error', message: st.error || 'программа голосов остановилась' });
                throw new Error(a.error || `HTTP ${r.status}`);
            }
            sr = a.sr;
            const pcm = pcmFromBase64(a.pcm);
            this._post({ type: 'audio', id: msg.id, pcm, sampleRate: sr, part: i, last: i === chunks.length - 1 });
        }
        if (!chunks.length) this._post({ type: 'audio', id: msg.id, pcm: new Float32Array(0), sampleRate: sr, part: 0, last: true });
    }

    terminate() { this._closed = true; }
}
