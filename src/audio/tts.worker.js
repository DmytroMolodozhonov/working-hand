/**
 * tts.worker.js — the neural villager voices (Supertonic 3) off the main
 * thread, so the game never stutters while a line is being synthesized.
 *
 * Started by src/audio/NeuralVoice.js as a module worker. ONNX Runtime comes
 * from vendor/ (no CDN); only the model files come from the Hugging Face hub,
 * once, then from the browser Cache API (cache `zns-voices-v1`).
 *
 * Protocol (main → worker):
 *   { type: 'load', sources: [{id, base, files, bytes}], wasmPaths: {mjs, wasm}, ortUrl }
 *   { type: 'synth', id, text, voice, speed, steps }
 * (worker → main):
 *   { type: 'progress', loaded, total, file }
 *   { type: 'ready', source, voices }
 *   { type: 'load_error', message }
 *   { type: 'audio', id, pcm (Float32Array, transferred), sampleRate, part, last }
 *     (one message per sentence, as soon as it is ready; `last` on the final one)
 *   { type: 'synth_error', id, message }
 */

import { parseIndexer, parseVoiceBin, parseVoiceJson, synthesize } from './supertonic.js';

const CACHE = 'zns-voices-v1';
let ort = null;
let model = null; // { s, cfg, indexer, voices }
let queue = Promise.resolve();

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

async function openCache() {
    try { return self.caches ? await self.caches.open(CACHE) : null; } catch (e) { return null; }
}

/** Downloads (or takes from the cache) one file, reporting bytes as they come. */
async function fetchFile(cache, url, onBytes) {
    if (cache) {
        try {
            const hit = await cache.match(url);
            if (hit) { const b = new Uint8Array(await hit.arrayBuffer()); onBytes(b.length, true); return b; }
        } catch (e) { /* a broken cache entry: download again */ }
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    let bytes;
    if (res.body && res.body.getReader) {
        const reader = res.body.getReader();
        const parts = [];
        let n = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            parts.push(value);
            n += value.length;
            onBytes(value.length, false);
        }
        bytes = new Uint8Array(n);
        let at = 0;
        for (const p of parts) { bytes.set(p, at); at += p.length; }
    } else {
        bytes = new Uint8Array(await res.arrayBuffer());
        onBytes(bytes.length, false);
    }
    if (cache) {
        try { await cache.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (e) { /* no room: works without the cache */ }
    }
    return bytes;
}

async function loadSource(src, cache) {
    const f = src.files;
    const voiceFiles = Array.isArray(f.voices) ? f.voices : [f.voices];
    const all = [f.cfg, f.indexer, f.dp, f.enc, f.est, f.voc, ...voiceFiles];
    const total = src.bytes || 0;
    let loaded = 0, lastPost = 0;
    const got = {};
    for (const name of all) {
        got[name] = await fetchFile(cache, src.base + name, (n) => {
            loaded += n;
            const now = Date.now();
            if (now - lastPost > 250) { lastPost = now; post({ type: 'progress', loaded, total: Math.max(total, loaded), file: name }); }
        });
    }
    post({ type: 'progress', loaded, total: Math.max(total, loaded), file: '' });
    const text = (b) => new TextDecoder().decode(b);
    const cfg = JSON.parse(text(got[f.cfg]));
    const indexer = parseIndexer(f.indexer.endsWith('.json') ? JSON.parse(text(got[f.indexer])) : got[f.indexer]);
    let voices;
    if (voiceFiles.length === 1 && voiceFiles[0].endsWith('.bin')) voices = parseVoiceBin(got[voiceFiles[0]]);
    else {
        voices = {};
        for (const vf of voiceFiles) voices[vf.split('/').pop().replace(/\.json$/, '')] = parseVoiceJson(JSON.parse(text(got[vf])));
    }
    const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
    const s = {};
    for (const [k, name] of [['dp', f.dp], ['enc', f.enc], ['est', f.est], ['voc', f.voc]]) {
        s[k] = await ort.InferenceSession.create(got[name], opts);
        got[name] = null; // (free the bytes)
    }
    return { s, cfg, indexer, voices };
}

async function load(msg) {
    ort = await import(msg.ortUrl);
    ort = ort.default || ort;
    ort.env.wasm.wasmPaths = msg.wasmPaths;
    const cores = (self.navigator && self.navigator.hardwareConcurrency) || 2;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, cores - 1)) : 1;
    ort.env.wasm.proxy = false;
    const cache = await openCache();
    let lastErr = null;
    for (const src of msg.sources) {
        try {
            model = await loadSource(src, cache);
            // (the first run of a network is slow: warm up before the first villager speaks)
            try { await synthesize(ort, model.s, model.cfg, model.indexer, model.voices[Object.keys(model.voices)[0]], 'Да.', { steps: 2 }); } catch (e) { /* ignore */ }
            post({ type: 'ready', source: src.id, voices: Object.keys(model.voices) });
            return;
        } catch (e) {
            lastErr = e;
            console.warn('[tts.worker] source failed:', src.id, e?.message || e);
        }
    }
    throw lastErr || new Error('no voice model source');
}

async function synth(msg) {
    const style = model.voices[msg.voice];
    if (!style) throw new Error(`no voice ${msg.voice}`);
    const sampleRate = model.cfg.ae.sample_rate;
    let sent = 0;
    await synthesize(ort, model.s, model.cfg, model.indexer, style, msg.text, {
        speed: msg.speed,
        steps: msg.steps,
        onChunk: (pcm, i, n) => {
            const copy = pcm.slice();
            sent++;
            post({ type: 'audio', id: msg.id, pcm: copy, sampleRate, part: i, last: i === n - 1 }, [copy.buffer]);
        },
    });
    if (!sent) post({ type: 'audio', id: msg.id, pcm: new Float32Array(0), sampleRate, part: 0, last: true });
}

self.onmessage = (ev) => {
    const msg = ev.data || {};
    if (msg.type === 'load') {
        load(msg).catch((e) => post({ type: 'load_error', message: String(e?.message || e) }));
    } else if (msg.type === 'synth') {
        queue = queue.then(() => {
            if (!model) throw new Error('voices are not loaded');
            return synth(msg);
        }).catch((e) => post({ type: 'synth_error', id: msg.id, message: String(e?.message || e) }));
    }
};
