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
 *   const raw = await llm.chat({ system, history, user, tools });   // the text with <tool_call>s (TalkMind parses them)
 *
 * Safe to import in node (nothing runs at import time; no DOM access).
 */

import { NativeLLMPort } from './NativeLLM.js';

export class LocalLLM {
    /**
     * Model choices. dtype per device: `webgpu` (GPU with shader-f16),
     * `webgpuNoF16` (GPU without f16), `wasm` (CPU).
     * Sizes are the approximate one-time download (ONNX graph + weights).
     */
    static MODELS = {
        // the villagers' conversation net on a graphics card: Gemma 4 E2B (~2.3B working parameters, 140 languages,
        // a much better Russian than the small Qwen: whole correct sentences in character; game actions too).
        // Only on the graphics card (on the processor a model this big is too slow for a talk): it fails → Qwen3.5.
        gemma4: {
            id: 'onnx-community/gemma-4-E2B-it-ONNX',
            label: 'Gemma 4 E2B',
            dtype: { webgpu: 'q4f16', webgpuNoF16: 'q4', wasm: 'q4' },
            sizeMB: { webgpu: 2600, wasm: 3000 },
            noThink: true,
            tools: true,
            gpuOnly: true,
            strong: true, // (answers every talk itself — the rules give it only the facts; TalkMind)
            fallback: 'qwen35',
        },
        // a strong computer (≥ 8 GB on the graphics card): Gemma 4 E4B — the cleverest and liveliest, but bigger and slower
        gemma4big: {
            id: 'onnx-community/gemma-4-E4B-it-ONNX',
            label: 'Gemma 4 E4B',
            dtype: { webgpu: 'q4f16', webgpuNoF16: 'q4', wasm: 'q4' },
            sizeMB: { webgpu: 4500, wasm: 5000 },
            noThink: true,
            tools: true,
            gpuOnly: true,
            strong: true,
            fallback: 'gemma4',
        },
        // the small conversation net (tool calling, 201 languages, Russian too): Qwen3.5 0.8B, text only
        qwen35: {
            id: 'onnx-community/Qwen3.5-0.8B-Text-ONNX',
            label: 'Qwen3.5 0.8B',
            dtype: { webgpu: 'q4f16', webgpuNoF16: 'q4', wasm: 'q4' },
            sizeMB: { webgpu: 700, wasm: 900 },
            noThink: true,
            tools: true,
            fallback: 'smart', // (if it does not load here: the older Qwen3 0.6B)
        },
        light: {
            id: 'onnx-community/gemma-3-270m-it-ONNX',
            label: 'Gemma 3 270M (лёгкая)',
            // fp16/q4f16 Gemma 3 overflows on WebGPU (onnxruntime issue #26732) → q4 (fp32 activations) there;
            // q4f16 is correct on WASM and is the smallest file.
            dtype: { webgpu: 'q4', webgpuNoF16: 'q4', wasm: 'q4f16' },
            sizeMB: { webgpu: 800, wasm: 430 },
            noThink: false,
        },
        smart: {
            id: 'onnx-community/Qwen3-0.6B-ONNX',
            label: 'Qwen3 0.6B (старая)',
            dtype: { webgpu: 'q4f16', webgpuNoF16: 'q4', wasm: 'q4' },
            sizeMB: { webgpu: 570, wasm: 900 },
            noThink: true, // chat template flag enable_thinking=false → no <think> block
            tools: true,
        },
    };

    /**
     * The setting value → the model key ('auto': Gemma 4 on a graphics card; without one Qwen3.5 0.8B on the
     * processor — never the 270M net by itself: it can hardly hold a talk; only when chosen by hand).
     */
    static pick(setting, hasGPU = LocalLLM.hasWebGPU) {
        if (!setting || setting === 'off') return null;
        if (setting === 'auto') return hasGPU ? 'gemma4' : 'qwen35';
        return LocalLLM.MODELS[setting] ? setting : 'gemma4';
    }

    /** «Gemma 4 E2B, ~2,6 ГБ» — for the settings and the journal. */
    static describe(key, device = 'webgpu') {
        const m = LocalLLM.MODELS[key];
        if (!m) return String(key || '');
        const mbs = m.sizeMB?.[device === 'wasm' ? 'wasm' : 'webgpu'] || m.sizeMB?.webgpu || 0;
        const size = mbs >= 1000 ? `~${(mbs / 1000).toFixed(1).replace('.', ',')} ГБ` : `~${mbs} МБ`;
        return `${m.label}, ${size}`;
    }

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
    /** A big net (Gemma 4): it answers every talk itself, not only what the rules did not understand. */
    get strong() { return !!this.model.strong; }

    /**
     * Starts the worker and loads the model. Idempotent.
     * @param {(fraction:number|null, text:string) => void} [onProgress] fraction 0..1 (null = unknown)
     * @returns {Promise<{device:string, dtype:string}>}
     */
    load(onProgress) {
        if (this._loading) return this._loading;
        this._error = null;
        this._loading = new Promise((resolve, reject) => { (async () => {
            // First the program on this computer (llm_native.py — never the game's video card); if it can't
            // run here or fails to start, the browser's web worker as before.
            let native = !this.workerUrl && await NativeLLMPort.available();
            const start = () => {
                if (native) return new NativeLLMPort();
                if (!LocalLLM.supported) throw new Error('Web Workers / WebAssembly are not available');
                return new Worker(this.workerUrl || new URL('./llm.worker.js', import.meta.url), { type: 'module' });
            };
            let worker;
            try { worker = start(); } catch (e) { reject(e); return; }
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
            const wire = (w) => {
                w.onerror = (ev) => {
                    ev?.preventDefault?.();
                    fail(new Error(`LLM worker error: ${ev?.message || 'failed to start'}`));
                };
                w.onmessage = (ev) => {
                    const m = ev.data || {};
                    switch (m.type) {
                        case 'progress':
                            if (onProgress) { try { onProgress(m.fraction, m.text); } catch (_) { /* ignore */ } }
                            break;
                        case 'ready':
                            this._ready = true;
                            // (the program on this computer runs Gemma 4 whatever was picked for the browser: it answers every talk)
                            if (m.device === 'native') { this.modelKey = this.modelKey === 'gemma4big' ? 'gemma4big' : 'gemma4'; this.model = LocalLLM.MODELS[this.modelKey]; }
                            this._device = m.device;
                            this._dtype = m.dtype;
                            this.loadInfo = { device: m.device, dtype: m.dtype, gpuName: m.gpuName || '', ms: m.ms || 0, why: m.why || '' };
                            resolve(this.loadInfo);
                            break;
                        case 'load_error':
                            if (native) {
                                // (the program did not start here: the browser's network instead)
                                console.warn('[LocalLLM] the program on this computer failed, the browser takes over:', m.message);
                                native = false;
                                this.nativeWhy = m.message || '';
                                // (never the big Gemma 4 in the game's own page then: ~2,6 GB on the game's graphics card
                                // next to the world — the page could run out of memory and close in the middle of a talk)
                                if (this.model.gpuOnly) { this.modelKey = 'qwen35'; this.model = LocalLLM.MODELS.qwen35; }
                                try { worker.terminate(); } catch (_) { /* ignore */ }
                                try { worker = start(); } catch (e) { fail(e); break; }
                                this._worker = worker;
                                wire(worker);
                                worker.postMessage({ type: 'load', model: { ...this.model }, device: this.model.gpuOnly ? 'webgpu' : this.preferredDevice });
                                break;
                            }
                            fail(new Error(m.message || 'model load failed'));
                            break;
                        case 'partial': { const job = this._jobs.get(m.id); if (job?.onPartial) { try { job.onPartial(String(m.text || '')); } catch (_) { /* ignore */ } } break; }
                        case 'result': this._finish(m.id, m.text ?? ''); break;
                        case 'gen_error': this._finish(m.id, null, new Error(m.message)); break;
                    }
                };
            };
            wire(worker);
            worker.postMessage({ type: 'load', model: { ...this.model, native: this.modelKey === 'gemma4big' ? 'gemma4big' : 'gemma4' }, device: this.model.gpuOnly ? 'webgpu' : this.preferredDevice });
        })(); });
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
        const limit = timeoutMs ?? this.timeoutMs ?? (this._device === 'native' ? 15000 : this._device === 'webgpu' ? 5000 : 8000);
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

    /**
     * A conversation turn with game actions: the raw answer, tool calls included.
     * @param {{system?:string, context?:string, history?:Array, user:string, tools?:Array, maxTokens?:number, temperature?:number, timeoutMs?:number}} p
     *   context: who the villager is now — said with the user's words (the system turn stays the same: read once)
     * @returns {Promise<string>} '' on timeout
     */
    chat({ system = '', context = '', history = [], user = '', tools = [], maxTokens = 90, temperature = 0.4, timeoutMs, onPartial = null } = {}) {
        if (!this._ready || !this._worker) return Promise.reject(new Error('LocalLLM is not ready'));
        const messages = [];
        if (system) messages.push({ role: 'system', content: system });
        for (const h of history || []) if (h?.content) messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: String(h.content) });
        // (who the villager is now goes with the words said: the system turn stays the same, read once and kept)
        messages.push({ role: 'user', content: context ? `[${context}]\n\nСобеседник говорит тебе: ${String(user || '...')}` : String(user || '...') });
        const id = this._nextId++;
        // (a big net reads the long villager prompt longer; the answer is said while it writes, so the wait is short)
        // (the program on this computer reads a villager's long rules once — then it keeps them — on the processor)
        const limit = timeoutMs ?? this.timeoutMs ?? (this._device === 'native' ? 15000 : this._device === 'webgpu' ? (this.model.strong ? 12000 : 8000) : 14000);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (!this._jobs.has(id)) return;
                this._jobs.delete(id);
                try { this._worker?.postMessage({ type: 'interrupt', id }); } catch (_) { /* ignore */ }
                resolve('');
            }, limit);
            this._jobs.set(id, { resolve, reject, timer, onPartial });
            this._worker.postMessage({ type: 'generate', id, messages, maxTokens, temperature, noThink: this.model.noThink, tools: this.model.tools ? tools : null, raw: true, stream: typeof onPartial === 'function' });
        });
    }

    /**
     * Reads a villager's words ahead (the program on this computer keeps them read): the next chat() with the
     * same system / context / history costs only the words said. Never cuts an answer being written.
     */
    warm({ system = '', context = '', history = [], tools = [] } = {}) {
        if (!this._ready || !this._worker || this._device !== 'native' || this._jobs.size) return false;
        const messages = [];
        if (system) messages.push({ role: 'system', content: system });
        for (const h of history || []) if (h?.content) messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: String(h.content) });
        messages.push({ role: 'user', content: context ? `[${context}]\n\nСобеседник говорит тебе: ` : '' });
        this._worker.postMessage({ type: 'warm', id: this._nextId++, messages, maxTokens: 1, temperature: 0.4, noThink: this.model.noThink, tools: this.model.tools ? tools : null, raw: true });
        return true;
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
