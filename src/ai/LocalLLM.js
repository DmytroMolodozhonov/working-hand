/**
 * LocalLLM.js — optional small chat neural network running in the browser.
 *
 * Off by default. The heavy work happens in a module Web Worker
 * (src/ai/llm.worker.js) with Transformers.js from vendor/transformers/:
 * WebGPU when the browser has it, otherwise WebAssembly on the CPU. The model
 * weights are downloaded once from the Hugging Face hub and then cached by the
 * browser (Cache API, key "transformers-cache").
 *
 *   const llm = new LocalLLM({ model: 'light' });
 *   await llm.load((fraction, text) => hud.show(text));   // rejects on failure
 *   const reply = await llm.generate({ system, history, user, maxTokens: 60 }); // '' on timeout
 *
 * Safe to import in node (nothing runs at import time; no DOM access).
 */

export class LocalLLM {
    /**
     * Model choices. dtype per device: `webgpu` (GPU with shader-f16),
     * `webgpuNoF16` (GPU without f16), `wasm` (CPU).
     * Sizes are the approximate one-time download (ONNX graph + weights).
     */
    static MODELS = {
        light: {
            id: 'onnx-community/gemma-3-270m-it-ONNX',
            label: 'Лёгкая (Gemma 3 270M)',
            // fp16/q4f16 Gemma 3 overflows on WebGPU (onnxruntime issue #26732) → q4 (fp32 activations) there;
            // q4f16 is correct on WASM and is the smallest file.
            dtype: { webgpu: 'q4', webgpuNoF16: 'q4', wasm: 'q4f16' },
            sizeMB: { webgpu: 800, wasm: 430 },
            noThink: false,
        },
        smart: {
            id: 'onnx-community/Qwen3-0.6B-ONNX',
            label: 'Умная (Qwen3 0.6B)',
            dtype: { webgpu: 'q4f16', webgpuNoF16: 'q4', wasm: 'q4' },
            sizeMB: { webgpu: 570, wasm: 900 },
            noThink: true, // chat template flag enable_thinking=false → no <think> block
        },
    };

    /** A worker + WebAssembly are available (a browser). */
    static get supported() {
        return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && typeof URL !== 'undefined';
    }

    /** The browser exposes WebGPU (it may still fail to give an adapter). */
    static get hasWebGPU() {
        return typeof navigator !== 'undefined' && !!navigator.gpu;
    }

    /**
     * @param {{model?:'light'|'smart', device?:'auto'|'webgpu'|'wasm', timeoutMs?:number, workerUrl?:string|URL}} [opts]
     */
    constructor({ model = 'light', device = 'auto', timeoutMs, workerUrl } = {}) {
        this.modelKey = LocalLLM.MODELS[model] ? model : 'light';
        this.model = LocalLLM.MODELS[this.modelKey];
        this.preferredDevice = device;
        this.timeoutMs = timeoutMs; // default: 5 s on WebGPU, 8 s on WASM
        this.workerUrl = workerUrl;
        this._worker = null;
        this._ready = false;
        this._loading = null;
        this._error = null;
        this._device = null;
        this._dtype = null;
        this._nextId = 1;
        this._jobs = new Map(); // id → { resolve, reject, timer }
    }

    get ready() { return this._ready; }
    get loading() { return !!this._loading && !this._ready; }
    get error() { return this._error; }
    /** 'webgpu' | 'wasm' | null (once loaded) */
    get device() { return this._device; }
    get dtype() { return this._dtype; }

    /**
     * Starts the worker and loads the model. Idempotent.
     * @param {(fraction:number|null, text:string) => void} [onProgress] fraction 0..1 (null = unknown)
     * @returns {Promise<{device:string, dtype:string}>}
     */
    load(onProgress) {
        if (this._loading) return this._loading;
        this._error = null;
        this._loading = new Promise((resolve, reject) => {
            if (!LocalLLM.supported) { reject(new Error('Web Workers / WebAssembly are not available')); return; }
            let worker;
            try {
                const url = this.workerUrl || new URL('./llm.worker.js', import.meta.url);
                worker = new Worker(url, { type: 'module' });
            } catch (e) { reject(e); return; }
            this._worker = worker;
            const fail = (err) => {
                this._error = err;
                this._ready = false;
                this._failAll(err);
                reject(err);
                // a crash after a successful load: forget the worker so load() can start again
                this._loading = null;
                this._terminate();
            };
            worker.onerror = (ev) => {
                ev?.preventDefault?.();
                fail(new Error(`LLM worker error: ${ev?.message || 'failed to start'}`));
            };
            worker.onmessage = (ev) => {
                const m = ev.data || {};
                switch (m.type) {
                    case 'progress':
                        if (onProgress) { try { onProgress(m.fraction, m.text); } catch (_) { /* ignore */ } }
                        break;
                    case 'ready':
                        this._ready = true;
                        this._device = m.device;
                        this._dtype = m.dtype;
                        resolve({ device: m.device, dtype: m.dtype });
                        break;
                    case 'load_error':
                        fail(new Error(m.message || 'model load failed'));
                        break;
                    case 'result': this._finish(m.id, m.text ?? ''); break;
                    case 'gen_error': this._finish(m.id, null, new Error(m.message)); break;
                }
            };
            worker.postMessage({ type: 'load', model: { ...this.model }, device: this.preferredDevice });
        });
        // allow a later retry after a failure
        this._loading.catch(() => { this._loading = null; this._terminate(); });
        return this._loading;
    }

    /**
     * Generates a short reply.
     * @param {{system?:string, history?:Array<{role:'user'|'assistant',content:string}|{who:'player'|'npc',text:string}>, user:string, maxTokens?:number, temperature?:number, timeoutMs?:number}} p
     * @returns {Promise<string>} the text ('' on timeout); rejects if not ready or on a model error
     */
    generate({ system = '', history = [], user = '', maxTokens = 60, temperature = 0.7, timeoutMs } = {}) {
        if (!this._ready || !this._worker) return Promise.reject(new Error('LocalLLM is not ready'));
        const messages = [];
        if (system) messages.push({ role: 'system', content: system });
        for (const h of history || []) {
            const role = h.role || (h.who === 'player' ? 'user' : 'assistant');
            const content = h.content ?? h.text;
            if (content) messages.push({ role: role === 'user' ? 'user' : 'assistant', content: String(content) });
        }
        messages.push({ role: 'user', content: String(user || '...') });
        const id = this._nextId++;
        const limit = timeoutMs ?? this.timeoutMs ?? (this._device === 'webgpu' ? 5000 : 8000);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (!this._jobs.has(id)) return;
                this._jobs.delete(id);
                try { this._worker?.postMessage({ type: 'interrupt', id }); } catch (_) { /* ignore */ }
                resolve('');
            }, limit);
            this._jobs.set(id, { resolve, reject, timer });
            this._worker.postMessage({ type: 'generate', id, messages, maxTokens, temperature, noThink: this.model.noThink });
        });
    }

    _finish(id, text, err) {
        const job = this._jobs.get(id);
        if (!job) return;
        this._jobs.delete(id);
        clearTimeout(job.timer);
        if (err) job.reject(err); else job.resolve(text);
    }

    _failAll(err) {
        for (const [id, job] of this._jobs) { clearTimeout(job.timer); job.reject(err); this._jobs.delete(id); }
    }

    _terminate() {
        try { this._worker?.terminate(); } catch (_) { /* ignore */ }
        this._worker = null;
    }

    /** Stops the worker and frees the model (the download stays in the browser cache). */
    dispose() {
        this._failAll(new Error('LocalLLM disposed'));
        try { this._worker?.postMessage({ type: 'dispose' }); } catch (_) { /* ignore */ }
        this._terminate();
        this._ready = false;
        this._loading = null;
        this._device = null;
        this._dtype = null;
    }
}
