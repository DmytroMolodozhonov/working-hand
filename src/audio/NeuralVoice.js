/**
 * NeuralVoice.js — the neural villager voices (Supertonic 3, ten Russian
 * voices: F1–F5 women, M1–M5 men) running in a Web Worker in the browser.
 *
 *   const nv = new NeuralVoice();
 *   await nv.load((fraction, text) => …);      // first time: downloads ~145 MB once
 *   const { pcm, sampleRate } = await nv.synth('Свежий хлеб!', { voice: 'M3', speed: 1.05 });
 *
 * The model files come from the Hugging Face hub (it serves them with CORS
 * and has no 100 MB limit), once; then from the browser cache. If the first
 * source is unavailable the next one is tried (a mirror, then the original
 * Supertone files, which are bigger).
 */

const HF = 'https://huggingface.co/';
const INT8_FILES = {
    cfg: 'tts.json', indexer: 'unicode_indexer.bin', voices: 'voice.bin',
    dp: 'duration_predictor.int8.onnx', enc: 'text_encoder.int8.onnx', est: 'vector_estimator.int8.onnx', voc: 'vocoder.int8.onnx',
};
const INT8_BYTES = 145295768;

/** Where the voice model is downloaded from, in order of preference. */
export const VOICE_SOURCES = [
    // the sherpa-onnx int8 package of Supertonic 3 (k2-fsa), ~145 MB
    { id: 'supertonic3-int8', base: `${HF}csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11/resolve/main/`, files: INT8_FILES, bytes: INT8_BYTES },
    { id: 'supertonic3-int8-mirror', base: `${HF}Grit-Labs/sherpa-onnx-supertonic-3-tts-int8-2026-05-11/resolve/main/`, files: INT8_FILES, bytes: INT8_BYTES },
    // the original Supertone files, ~400 MB
    {
        id: 'supertonic3',
        base: `${HF}Supertone/supertonic-3/resolve/main/`,
        files: {
            cfg: 'onnx/tts.json', indexer: 'onnx/unicode_indexer.json',
            dp: 'onnx/duration_predictor.onnx', enc: 'onnx/text_encoder.onnx', est: 'onnx/vector_estimator.onnx', voc: 'onnx/vocoder.onnx',
            voices: ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'].map((n) => `voice_styles/${n}.json`),
        },
        bytes: 398653248,
    },
];

/** Download size of the preferred source, in MB (for the menu text). */
export const VOICE_MODEL_MB = Math.round(INT8_BYTES / 1048576);

export class NeuralVoice {
    /**
     * @param {{sources?:object[], workerUrl?:string|URL, createWorker?:Function, steps?:number}} [opts]
     */
    constructor(opts = {}) {
        this.sources = opts.sources || VOICE_SOURCES;
        this.steps = opts.steps ?? 5;
        this._createWorker = opts.createWorker || (() => new Worker(opts.workerUrl || new URL('./tts.worker.js', import.meta.url), { type: 'module' }));
        this.state = 'idle'; // idle | loading | ready | failed
        this.error = null;
        this.source = null;
        this._worker = null;
        this._loading = null;
        this._jobs = new Map();
        this._nextId = 1;
    }

    static get supported() {
        return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
    }

    get ready() { return this.state === 'ready'; }

    /** Loads the model (once). onProgress(fraction 0..1, text). */
    load(onProgress = () => {}) {
        if (this._loading) return this._loading;
        this.state = 'loading';
        this._loading = new Promise((resolve, reject) => {
            let w;
            try { w = this._worker = this._createWorker(); } catch (e) { this._fail(e); reject(e); return; }
            w.onmessage = (ev) => {
                const m = ev.data || {};
                switch (m.type) {
                    case 'progress': {
                        const f = m.total ? Math.min(1, m.loaded / m.total) : null;
                        try { onProgress(f, `Голоса жителей: ${Math.round(m.loaded / 1048576)} из ${Math.round((m.total || 0) / 1048576)} МБ`); } catch (e) { /* ignore */ }
                        break;
                    }
                    case 'ready':
                        this.state = 'ready';
                        this.source = m.source;
                        resolve(this);
                        break;
                    case 'load_error': {
                        const e = new Error(m.message || 'voice model failed to load');
                        this._fail(e);
                        reject(e);
                        break;
                    }
                    case 'audio': {
                        const job = this._jobs.get(m.id);
                        if (!job) break;
                        if (m.pcm?.length) {
                            job.parts.push(m.pcm);
                            try { job.onChunk?.(m.pcm, m.sampleRate, !!m.last); } catch (e) { /* ignore */ }
                        } else if (m.last) {
                            try { job.onChunk?.(m.pcm || new Float32Array(0), m.sampleRate, true); } catch (e) { /* ignore */ }
                        }
                        if (m.last !== false) {
                            this._jobs.delete(m.id);
                            const len = job.parts.reduce((a, p) => a + p.length, 0);
                            const pcm = new Float32Array(len);
                            let at = 0;
                            for (const p of job.parts) { pcm.set(p, at); at += p.length; }
                            job.resolve({ pcm, sampleRate: m.sampleRate });
                        }
                        break;
                    }
                    case 'synth_error': {
                        const job = this._jobs.get(m.id);
                        this._jobs.delete(m.id);
                        job?.reject(new Error(m.message));
                        break;
                    }
                    default:
                }
            };
            w.onerror = (ev) => {
                const e = new Error(ev?.message || 'voice worker error');
                if (this.state === 'loading') reject(e);
                this._fail(e);
            };
            w.postMessage({
                type: 'load',
                sources: this.sources,
                ortUrl: new URL('../../vendor/onnxruntime/ort.webgpu.min.mjs', import.meta.url).href,
                wasmPaths: {
                    mjs: new URL('../../vendor/transformers/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
                    wasm: new URL('../../vendor/transformers/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href,
                },
            });
        });
        this._loading.catch(() => {});
        return this._loading;
    }

    _fail(e) {
        this.state = 'failed';
        this.error = e;
        for (const job of this._jobs.values()) job.reject(e);
        this._jobs.clear();
        try { this._worker?.terminate(); } catch (err) { /* ignore */ }
        this._worker = null;
    }

    /**
     * Synthesizes a line. @returns {Promise<{pcm: Float32Array, sampleRate: number}>} (the whole line)
     * @param {string} text
     * @param {{voice:string, speed?:number, steps?:number, onChunk?:Function}} opts
     *   onChunk(pcm, sampleRate, last): every sentence as soon as it is ready.
     */
    synth(text, opts) {
        if (!this.ready || !this._worker) return Promise.reject(new Error('voices are not ready'));
        const id = this._nextId++;
        return new Promise((resolve, reject) => {
            this._jobs.set(id, { resolve, reject, parts: [], onChunk: opts.onChunk });
            this._worker.postMessage({ type: 'synth', id, text, voice: opts.voice, speed: opts.speed ?? 1, steps: opts.steps ?? this.steps });
        });
    }

    /** Lines queued or being made are not wanted any more (a newer line cuts them): skip them. */
    cancelAll() {
        if (!this._worker || !this._jobs.size) return;
        try { this._worker.postMessage({ type: 'cancel', ids: [...this._jobs.keys()] }); } catch (e) { /* ignore */ }
    }

    dispose() {
        this._fail(new Error('disposed'));
        this.state = 'idle';
        this._loading = null;
    }
}
