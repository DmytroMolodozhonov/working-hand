/**
 * supertonic.js — the Supertonic 3 text-to-speech pipeline (pure: no DOM, no
 * fetch), so the same code runs in the voice worker (onnxruntime-web) and in
 * node tests (a fake or onnxruntime-node `ort`).
 *
 * Supertonic 3 (Supertone Inc., model licence BigScience OpenRAIL-M, sample
 * code MIT): a small (~99M parameters) on-device TTS with 31 languages incl.
 * Russian and ten fixed voices: F1–F5 (women) and M1–M5 (men). Pipeline:
 *   text → «<ru>text.</ru>» → unicode ids → duration predictor (+ voice style)
 *   → text encoder → noise latent → N flow-matching steps (vector estimator)
 *   → vocoder → 44.1 kHz PCM.
 *
 * Two packagings of the same model are understood:
 *  - the sherpa-onnx int8 package (smaller, ~145 MB): `*.int8.onnx`,
 *    `unicode_indexer.bin` (int32 table) and `voice.bin` (all ten voices);
 *  - the original Supertone files (~400 MB): `onnx/*.onnx`,
 *    `onnx/unicode_indexer.json` and `voice_styles/F1.json` … `M5.json`.
 */

export const LANG = 'ru';
export const VOICE_NAMES = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'];
export const FEMALE_VOICES = VOICE_NAMES.filter((n) => n[0] === 'F');
export const MALE_VOICES = VOICE_NAMES.filter((n) => n[0] === 'M');

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;
const REPLACE = [
    ['–', '-'], ['‑', '-'], ['—', '-'], ['_', ' '], ['“', '"'], ['”', '"'], ['‘', "'"], ['’', "'"],
    ['´', "'"], ['`', "'"], ['[', ' '], [']', ' '], ['|', ' '], ['/', ' '], ['#', ' '], ['→', ' '], ['←', ' '],
    ['«', '"'], ['»', '"'], ['„', '"'],
];

/** 'en' for a line in English (a villager answering an English-speaking player), else 'ru'. */
export function langOf(text) {
    const letters = String(text ?? '').match(/[a-zа-яё]/gi) || [];
    const lat = letters.filter((c) => /[a-z]/i.test(c)).length;
    return letters.length >= 2 && lat / letters.length >= 0.7 ? 'en' : LANG;
}

/** The text exactly as the model was trained to read it (Supertone's own preprocessing). */
export function preprocessText(text, lang = LANG) {
    let t = String(text ?? '').normalize('NFKD').replace(EMOJI, '');
    for (const [a, b] of REPLACE) t = t.split(a).join(b);
    t = t.replace(/[♥☆♡©\\]/g, '').split('@').join(' at ');
    t = t.replace(/ ,/g, ',').replace(/ \./g, '.').replace(/ !/g, '!').replace(/ \?/g, '?').replace(/ ;/g, ';').replace(/ :/g, ':').replace(/ '/g, "'");
    while (t.includes('""')) t = t.replace('""', '"');
    while (t.includes("''")) t = t.replace("''", "'");
    t = t.replace(/\s+/g, ' ').trim();
    if (!/[.!?;:,'"\]}…。」』】〉》›»]$/.test(t)) t += '.';
    return `<${lang}>${t}</${lang}>`;
}

/**
 * Splits a line into sentences (each is synthesized and played on its own, so
 * the first one is heard sooner); very short ones are joined to the next, and
 * a sentence longer than maxLen is cut at commas.
 */
export function chunkText(text, maxLen = 120, minLen = 12) {
    const sentences = [];
    for (const s of String(text).trim().split(/(?<=[.!?…])\s+/)) {
        if (!s) continue;
        if (s.length <= maxLen) { sentences.push(s); continue; }
        let cur = '';
        for (const p of s.split(/(?<=[,;:])\s+/)) {
            if (cur && cur.length + p.length + 1 > maxLen) { sentences.push(cur); cur = p; } else cur = cur ? `${cur} ${p}` : p;
        }
        if (cur) sentences.push(cur);
    }
    const out = [];
    let cur = '';
    for (const s of sentences) {
        if (cur && (cur.length >= minLen || cur.length + s.length + 1 > maxLen)) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
    }
    if (cur) out.push(cur);
    return out;
}

/**
 * The character → token table. `data` is either the JSON array (original
 * files) or the bytes of `unicode_indexer.bin` (int32 little-endian).
 */
export function parseIndexer(data) {
    if (Array.isArray(data)) return Int32Array.from(data, (x) => x | 0);
    const buf = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return new Int32Array(buf);
}

export function textToIds(indexer, processed) {
    const ids = new Array(processed.length);
    for (let i = 0; i < processed.length; i++) {
        const c = processed.charCodeAt(i);
        const v = c < indexer.length ? indexer[c] : -1;
        ids[i] = v >= 0 ? v : 0;
    }
    return ids;
}

/**
 * All voices of `voice.bin` (sherpa-onnx): a header of six int64 dims
 * [n, 50, 256] (ttl) and [n, 8, 16] (dp), then all ttl floats, then all dp
 * floats. Speakers 0–4 are F1–F5, 5–9 are M1–M5.
 * @returns {Object<string,{ttl:{data:Float32Array,dims:number[]},dp:{data:Float32Array,dims:number[]}}>}
 */
export function parseVoiceBin(bytes) {
    const buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const head = new BigInt64Array(buf, 0, 6);
    const [n, t1, t2, n2, d1, d2] = Array.from(head, Number);
    if (n !== n2 || n < 1 || n > 64 || 48 + 4 * n * (t1 * t2 + d1 * d2) !== buf.byteLength) throw new Error('voice.bin: unexpected layout');
    const all = new Float32Array(buf, 48);
    const out = {};
    for (let i = 0; i < n; i++) {
        const name = VOICE_NAMES[i] || `S${i}`;
        out[name] = {
            ttl: { data: all.slice(i * t1 * t2, (i + 1) * t1 * t2), dims: [1, t1, t2] },
            dp: { data: all.slice(n * t1 * t2 + i * d1 * d2, n * t1 * t2 + (i + 1) * d1 * d2), dims: [1, d1, d2] },
        };
    }
    return out;
}

/** One voice of the original files (`voice_styles/F1.json`). */
export function parseVoiceJson(json) {
    const flat = (a) => Float32Array.from(a.flat(Infinity));
    return {
        ttl: { data: flat(json.style_ttl.data), dims: json.style_ttl.dims },
        dp: { data: flat(json.style_dp.data), dims: json.style_dp.dims },
    };
}

/** Standard normal noise (Box–Muller); `rand` is replaceable for tests. */
function gauss(rand) {
    const u1 = Math.max(1e-10, rand());
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand());
}

/**
 * Synthesizes one chunk of text.
 * @param {object} ort  onnxruntime (Tensor + sessions' run)
 * @param {{dp, enc, est, voc}} s  the four inference sessions
 * @param {object} cfg  tts.json
 * @param {Int32Array} indexer
 * @param {{ttl, dp}} style  one voice
 * @param {string} text
 * @param {{speed?:number, steps?:number, rand?:Function}} [o]
 * @returns {Promise<Float32Array>} PCM at cfg.ae.sample_rate
 */
export async function synthChunk(ort, s, cfg, indexer, style, text, o = {}) {
    const speed = o.speed ?? 1.05;
    const steps = o.steps ?? 8;
    const rand = o.rand || Math.random;
    const sr = cfg.ae.sample_rate;
    const base = cfg.ae.base_chunk_size;
    const ccf = cfg.ttl.chunk_compress_factor;
    const ldim = cfg.ttl.latent_dim * ccf;
    const ids = textToIds(indexer, preprocessText(text, langOf(text)));
    const L = ids.length;
    const textIds = new ort.Tensor('int64', BigInt64Array.from(ids, (x) => BigInt(x)), [1, L]);
    const textMask = new ort.Tensor('float32', new Float32Array(L).fill(1), [1, 1, L]);
    const styleTtl = new ort.Tensor('float32', style.ttl.data, style.ttl.dims);
    const styleDp = new ort.Tensor('float32', style.dp.data, style.dp.dims);

    const dpOut = await s.dp.run({ text_ids: textIds, style_dp: styleDp, text_mask: textMask });
    const duration = Math.max(0.05, Number(dpOut.duration.data[0]) / speed); // seconds
    const encOut = await s.enc.run({ text_ids: textIds, style_ttl: styleTtl, text_mask: textMask });

    const wavLen = Math.floor(duration * sr);
    const chunk = base * ccf;
    const T = Math.max(1, Math.ceil(wavLen / chunk));
    let latent = new Float32Array(ldim * T);
    for (let i = 0; i < latent.length; i++) latent[i] = gauss(rand);
    const latentMask = new ort.Tensor('float32', new Float32Array(T).fill(1), [1, 1, T]);
    const total = new ort.Tensor('float32', Float32Array.of(steps), [1]);
    for (let step = 0; step < steps; step++) {
        const r = await s.est.run({
            noisy_latent: new ort.Tensor('float32', latent, [1, ldim, T]),
            text_emb: encOut.text_emb,
            style_ttl: styleTtl,
            latent_mask: latentMask,
            text_mask: textMask,
            current_step: new ort.Tensor('float32', Float32Array.of(step), [1]),
            total_step: total,
        });
        latent = Float32Array.from(r.denoised_latent.data);
    }
    const vo = await s.voc.run({ latent: new ort.Tensor('float32', latent, [1, ldim, T]) });
    const wav = vo.wav_tts.data;
    return Float32Array.from(wav.subarray ? wav.subarray(0, Math.min(wav.length, wavLen)) : Array.prototype.slice.call(wav, 0, wavLen));
}

/**
 * A whole line: sentence chunks joined by short pauses. `o.onChunk(pcm, i, n)`
 * gets every sentence as soon as it is ready (to start playing the first one
 * while the next is still being synthesized).
 */
export async function synthesize(ort, s, cfg, indexer, style, text, o = {}) {
    const sr = cfg.ae.sample_rate;
    const parts = [];
    const chunks = chunkText(text);
    for (let i = 0; i < chunks.length; i++) {
        const pcm = await synthChunk(ort, s, cfg, indexer, style, chunks[i], o);
        parts.push(pcm);
        if (o.onChunk) await o.onChunk(pcm, i, chunks.length);
    }
    const gap = Math.floor((o.pause ?? 0.18) * sr);
    const len = parts.reduce((a, p) => a + p.length, 0) + gap * Math.max(0, parts.length - 1);
    const out = new Float32Array(len);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length + gap; }
    return { pcm: out, sampleRate: sr };
}
