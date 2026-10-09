/**
 * llm.worker.js — runs a small chat LLM (Transformers.js + ONNX Runtime Web)
 * off the main thread, so the game never freezes while the model thinks.
 *
 * Started by src/ai/LocalLLM.js as a module worker. Everything is loaded from
 * vendor/transformers/ (no CDN); only the model weights come from the
 * Hugging Face hub, once, then from the browser cache (Cache API).
 *
 * Protocol (main → worker):
 *   { type: 'load', model: { id, dtype: { webgpu, webgpuNoF16, wasm }, noThink }, device: 'auto'|'webgpu'|'wasm' }
 *   { type: 'generate', id, messages: [{role, content}], maxTokens, temperature, noThink }
 *   { type: 'interrupt', id }
 *   { type: 'dispose' }
 * (worker → main):
 *   { type: 'progress', fraction, text }
 *   { type: 'ready', device, dtype }
 *   { type: 'load_error', message }
 *   { type: 'result', id, text }
 *   { type: 'gen_error', id, message }
 */

const VENDOR = new URL('../../vendor/transformers/', import.meta.url);

let tf = null;
let generator = null;
let modelInfo = null;
let criteria = null;
let queue = Promise.resolve();
let currentId = null;
const cancelled = new Set();

const post = (msg) => self.postMessage(msg);
const mb = (b) => Math.round((b || 0) / 1048576);

async function setupLibrary() {
    if (tf) return tf;
    tf = await import(new URL('transformers.min.js', VENDOR).href);
    const { env } = tf;
    env.allowLocalModels = false; // weights from the HF hub only…
    env.allowRemoteModels = true;
    env.useBrowserCache = true; // …downloaded once, then cached by the browser
    const wasm = env.backends?.onnx?.wasm;
    if (wasm) {
        // Never fetch the ONNX Runtime from a CDN: use the vendored build.
        wasm.wasmPaths = {
            mjs: new URL('ort-wasm-simd-threaded.asyncify.mjs', VENDOR).href,
            wasm: new URL('ort-wasm-simd-threaded.asyncify.wasm', VENDOR).href,
        };
        const cores = (self.navigator && self.navigator.hardwareConcurrency) || 2;
        // Threads need SharedArrayBuffer = a cross-origin-isolated page (COOP/COEP headers).
        wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, cores - 1)) : 1;
        wasm.proxy = false;
    }
    return tf;
}

async function pickDevice(pref) {
    if (pref === 'wasm') return { device: 'wasm', f16: false };
    const gpu = self.navigator && self.navigator.gpu;
    if (!gpu) return { device: 'wasm', f16: false };
    try {
        const adapter = await gpu.requestAdapter();
        if (!adapter) return { device: 'wasm', f16: false };
        return { device: 'webgpu', f16: adapter.features.has('shader-f16') };
    } catch (e) {
        return { device: 'wasm', f16: false };
    }
}

function dtypeFor(model, device, f16) {
    const d = model.dtype || {};
    if (device === 'webgpu') return f16 ? (d.webgpu || 'q4f16') : (d.webgpuNoF16 || 'q4');
    return d.wasm || 'q4';
}

async function createPipeline(model, device, dtype) {
    const files = {};
    let lastSent = 0;
    const progress_callback = (info) => {
        if (!info) return;
        if (info.status === 'progress_total' && info.total > 0) {
            const now = Date.now();
            if (now - lastSent < 150 && info.progress < 100) return;
            lastSent = now;
            const sizes = info.total >= 1048576 ? ` (${mb(info.loaded)} из ${mb(info.total)} МБ)` : '';
            post({ type: 'progress', fraction: Math.min(0.95, (info.progress / 100) * 0.95), text: `Загрузка модели: ${Math.round(info.progress)}%${sizes}` });
        } else if (info.status === 'initiate' && info.file && !files[info.file]) {
            files[info.file] = true;
            post({ type: 'progress', fraction: null, text: `Файл модели: ${info.file}` });
        }
    };
    return tf.pipeline('text-generation', model.id, { device, dtype, progress_callback });
}

async function warmup(noThink) {
    post({ type: 'progress', fraction: 0.97, text: 'Прогрев нейросети…' });
    await generator([{ role: 'user', content: 'Привет' }], {
        max_new_tokens: 1,
        do_sample: false,
        ...(noThink ? { tokenizer_encode_kwargs: { enable_thinking: false } } : {}),
    });
}

async function load({ model, device: pref = 'auto' }) {
    try {
        await setupLibrary();
        criteria = new tf.InterruptableStoppingCriteria();
        modelInfo = model;
        let { device, f16 } = await pickDevice(pref);
        let dtype = dtypeFor(model, device, f16);
        post({ type: 'progress', fraction: 0, text: `Нейросеть: ${device === 'webgpu' ? 'видеокарта (WebGPU)' : 'процессор (WASM)'}, ${dtype}` });
        try {
            generator = await createPipeline(model, device, dtype);
            await warmup(model.noThink);
        } catch (e) {
            if (device !== 'webgpu') throw e;
            // WebGPU failed (driver, memory, unsupported op) → try the CPU path once
            try { await generator?.dispose?.(); } catch (_) { /* ignore */ }
            generator = null;
            device = 'wasm';
            dtype = dtypeFor(model, 'wasm', false);
            post({ type: 'progress', fraction: 0, text: `WebGPU не сработал, пробую процессор (${dtype})…` });
            generator = await createPipeline(model, device, dtype);
            await warmup(model.noThink);
        }
        post({ type: 'progress', fraction: 1, text: 'Нейросеть готова' });
        post({ type: 'ready', device, dtype });
    } catch (e) {
        generator = null;
        post({ type: 'load_error', message: String(e && (e.message || e)) });
    }
}

function stripThink(s) {
    return String(s ?? '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*$/i, '')
        .trim();
}

async function generate({ id, messages, maxTokens = 60, temperature = 0.7, noThink }) {
    if (cancelled.has(id)) { cancelled.delete(id); return; }
    if (!generator) { post({ type: 'gen_error', id, message: 'model not loaded' }); return; }
    currentId = id;
    criteria.reset();
    try {
        const useThink = noThink ?? modelInfo?.noThink;
        const out = await generator(messages, {
            max_new_tokens: Math.max(4, Math.min(200, maxTokens | 0)),
            do_sample: temperature > 0,
            temperature: Math.max(0.05, temperature),
            top_k: 40,
            top_p: 0.9,
            repetition_penalty: 1.15,
            stopping_criteria: [criteria],
            ...(useThink ? { tokenizer_encode_kwargs: { enable_thinking: false } } : {}),
        });
        const g = out && out[0] && out[0].generated_text;
        const text = Array.isArray(g) ? (g[g.length - 1]?.content ?? '') : String(g ?? '');
        post({ type: 'result', id, text: stripThink(text) });
    } catch (e) {
        post({ type: 'gen_error', id, message: String(e && (e.message || e)) });
    } finally {
        currentId = null;
    }
}

self.addEventListener('message', (e) => {
    const msg = e.data || {};
    switch (msg.type) {
        case 'load':
            queue = queue.then(() => load(msg));
            break;
        case 'generate':
            queue = queue.then(() => generate(msg));
            break;
        case 'interrupt':
            if (msg.id === currentId) criteria?.interrupt();
            else {
                if (cancelled.size > 64) cancelled.clear();
                cancelled.add(msg.id);
            }
            break;
        case 'dispose':
            queue = queue.then(async () => {
                try { await generator?.dispose?.(); } catch (_) { /* ignore */ }
                generator = null;
            });
            break;
    }
});
