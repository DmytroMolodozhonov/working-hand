import test from 'node:test';
import assert from 'node:assert/strict';
import { castNeural, isFemale, pickSystemVoice, systemVoiceGender, systemVoiceParams, VOICE_F0, MALE_MAX_F0, FEMALE_MIN_F0 } from '../../src/audio/VoiceCast.js';
import { numberToWords, speakable } from '../../src/audio/ruText.js';
import { preprocessText, chunkText, parseVoiceBin, parseIndexer, textToIds, synthesize, VOICE_NAMES } from '../../src/audio/supertonic.js';
import { Speech } from '../../src/audio/Speech.js';
import { VOICE_SOURCES } from '../../src/audio/NeuralVoice.js';

const ROLES = ['farmer', 'merchant', 'builder', 'knight', 'king', 'advisor', 'wizard', 'sailor', 'villager', 'someone-new'];

test('neural voices: a woman always gets a female voice, a man a male one — every role, every villager', () => {
    for (const role of ROLES) {
        for (let i = 0; i < 300; i++) {
            for (const shout of [false, true]) {
                const w = castNeural({ voiceKey: `${role}-${i}`, role, female: true, shout });
                assert.equal(w.voice[0], 'F', `${role} woman ${i}`);
                assert.ok(w.f0 >= FEMALE_MIN_F0, `${role} woman ${i} too low: ${w.f0}`);
                const m = castNeural({ voiceKey: `${role}-${i}`, role, female: false, shout });
                assert.equal(m.voice[0], 'M', `${role} man ${i}`);
                assert.ok(m.f0 <= MALE_MAX_F0, `${role} man ${i} too high: ${m.f0}`);
                assert.ok(m.speed >= 0.8 && m.speed <= 1.25 && w.speed >= 0.8 && w.speed <= 1.25);
            }
        }
    }
    // gender given as a word works too; no gender at all = a man
    assert.equal(castNeural({ voiceKey: 1, gender: 'female' }).voice[0], 'F');
    assert.equal(castNeural({ voiceKey: 1, gender: 'male' }).voice[0], 'M');
    assert.equal(castNeural({ voiceKey: 1, role: 'king' }).voice[0], 'M');
    assert.equal(isFemale({}), false);
    // the measured voices really are on their side of the line
    for (const [n, f0] of Object.entries(VOICE_F0)) assert.ok(n[0] === 'F' ? f0 > FEMALE_MIN_F0 : f0 < MALE_MAX_F0, n);
});

test('neural voices: villagers sound different, the same villager always the same', () => {
    for (const female of [true, false]) {
        const casts = Array.from({ length: 40 }, (_, i) => castNeural({ voiceKey: `v${i}`, role: 'farmer', female }));
        assert.ok(new Set(casts.map((c) => c.voice)).size >= 4, 'several voices');
        assert.ok(new Set(casts.map((c) => `${c.voice}|${c.pitch.toFixed(3)}|${c.speed.toFixed(3)}`)).size >= 35, 'own pitch and pace');
        const pitches = casts.map((c) => c.pitch);
        assert.ok(Math.max(...pitches) - Math.min(...pitches) > 0.05);
    }
    assert.deepEqual(castNeural({ voiceKey: 'v7', role: 'merchant', female: true }), castNeural({ voiceKey: 'v7', role: 'merchant', female: true }));
    // the king speaks with a deep voice, slowly
    for (let i = 0; i < 20; i++) {
        const k = castNeural({ voiceKey: `king${i}`, role: 'king' });
        assert.ok(['M5', 'M2'].includes(k.voice) && k.speed < 1 && k.f0 < 110);
    }
});

const V = (name, lang = 'ru-RU', localService = true) => ({ name, lang, localService, voiceURI: name });
const WINDOWS = [V('Microsoft Irina - Russian (Russia)'), V('Microsoft Pavel - Russian (Russia)')];
const EDGE = [V('Microsoft Svetlana Online (Natural) - Russian (Russia)', 'ru-RU', false), V('Microsoft Dmitry Online (Natural) - Russian (Russia)', 'ru-RU', false), V('Microsoft Dariya Online (Natural) - Russian (Russia)', 'ru-RU', false)];
const MAC = [V('Milena'), V('Yuri'), V('Katya')];

test('system voices: gender read from Windows / Edge / macOS / Chrome names', () => {
    const g = (n) => systemVoiceGender(V(n));
    for (const n of ['Microsoft Irina - Russian (Russia)', 'Microsoft Svetlana Online (Natural) - Russian (Russia)', 'Microsoft Dariya Online (Natural) - Russian (Russia)', 'Milena', 'Katya', 'Google русский', 'Анна']) assert.equal(g(n), 'female', n);
    for (const n of ['Microsoft Pavel - Russian (Russia)', 'Microsoft Dmitry Online (Natural) - Russian (Russia)', 'Yuri', 'Maxim', 'Юрий']) assert.equal(g(n), 'male', n);
    assert.equal(g('ru-ru-x-abc-local'), 'unknown');
});

test('system voices: never a female voice for a man, never a male one for a woman', () => {
    for (const list of [WINDOWS, EDGE, MAC, [...WINDOWS, ...EDGE, ...MAC]]) {
        for (let i = 0; i < 100; i++) {
            const w = pickSystemVoice(list, `k${i}`, true);
            const m = pickSystemVoice(list, `k${i}`, false);
            assert.equal(systemVoiceGender(w), 'female');
            assert.equal(systemVoiceGender(m), 'male');
        }
    }
    // only women's voices on this computer (e.g. Chrome's «Google русский»): a man stays silent (text only)
    const onlyF = [V('Google русский', 'ru-RU', false), V('Microsoft Irina - Russian (Russia)')];
    assert.equal(pickSystemVoice(onlyF, 'x', false), null);
    assert.ok(pickSystemVoice(onlyF, 'x', true));
    assert.equal(pickSystemVoice([V('Microsoft Pavel - Russian (Russia)')], 'y', true), null);
    // a voice of unknown gender is used only when no voice of the right gender exists
    const mixed = [V('ru-ru-x-abc-local'), V('Microsoft Pavel - Russian (Russia)')];
    for (let i = 0; i < 30; i++) assert.match(pickSystemVoice(mixed, `z${i}`, false).name, /Pavel/);
    assert.equal(pickSystemVoice(mixed, 'z', true).name, 'ru-ru-x-abc-local');
    // with several voices of a gender, villagers get different ones
    const many = [...WINDOWS, ...EDGE, ...MAC];
    assert.ok(new Set(Array.from({ length: 30 }, (_, i) => pickSystemVoice(many, `v${i}`, true).name)).size >= 3);
});

test('system voices: pitch keeps a man low and a woman high', () => {
    for (const role of ROLES) {
        for (let i = 0; i < 50; i++) {
            const unknown = V('ru-ru-x-abc-local');
            for (const voice of [null, unknown, WINDOWS[0], WINDOWS[1]]) {
                assert.ok(systemVoiceParams({ voiceKey: i, role, female: false, voice, shout: i % 2 === 0 }).pitch <= 1.05);
                assert.ok(systemVoiceParams({ voiceKey: i, role, female: true, voice, shout: i % 2 === 0 }).pitch >= 1.0);
            }
        }
    }
    const k = systemVoiceParams({ voiceKey: 'a', role: 'king' });
    const f = systemVoiceParams({ voiceKey: 'a', role: 'farmer', female: true });
    assert.ok(k.pitch < f.pitch && k.rate < f.rate);
});

test('numbers are read as words', () => {
    assert.equal(numberToWords(0), 'ноль');
    assert.equal(numberToWords(5), 'пять');
    assert.equal(numberToWords(21), 'двадцать один');
    assert.equal(numberToWords(21, true), 'двадцать одна');
    assert.equal(numberToWords(342), 'триста сорок два');
    assert.equal(numberToWords(2000), 'две тысячи');
    assert.equal(numberToWords(11500), 'одиннадцать тысяч пятьсот');
    assert.equal(speakable('Всего 5 монет!'), 'Всего пять монет!');
    assert.equal(speakable('Это 22 стрелы'), 'Это двадцать две стрелы');
    assert.equal(speakable('*кланяется* Добро пожаловать 🙂'), 'Добро пожаловать');
    assert.equal(speakable('«Вор!»'), 'Вор!');
});

test('supertonic: text preprocessing, sentence chunks, voice file layout', () => {
    assert.equal(preprocessText('Свежий хлеб'), `<ru>${'Свежий хлеб'.normalize('NFKD')}.</ru>`);
    assert.equal(preprocessText('Кто там?  '), '<ru>Кто там?</ru>');
    assert.equal(preprocessText('Эй — стой!'), '<ru>Эй - стой!</ru>'.normalize('NFKD'));
    assert.deepEqual(chunkText('Раз. Два! Три?', 7), ['Раз.', 'Два!', 'Три?']);
    assert.deepEqual(chunkText('Раз. Два!'), ['Раз. Два!']);
    // voice.bin: 6 int64 dims, then every ttl, then every dp
    const n = 10, t = [3, 4], d = [2, 2];
    const buf = new ArrayBuffer(48 + 4 * n * (t[0] * t[1] + d[0] * d[1]));
    new BigInt64Array(buf, 0, 6).set([n, t[0], t[1], n, d[0], d[1]].map(BigInt));
    const f = new Float32Array(buf, 48);
    for (let i = 0; i < f.length; i++) f[i] = i;
    const voices = parseVoiceBin(new Uint8Array(buf));
    assert.deepEqual(Object.keys(voices), VOICE_NAMES);
    assert.deepEqual(voices.F2.ttl.dims, [1, 3, 4]);
    assert.equal(voices.F2.ttl.data[0], 12);
    assert.equal(voices.M1.dp.data[0], n * 12 + 5 * 4);
    assert.throws(() => parseVoiceBin(new Uint8Array(100)));
    const idx = parseIndexer([5, 6, 7]);
    assert.deepEqual(textToIds(idx, '\u0001\u0002\u0009'), [6, 7, 0]);
});

test('supertonic: the inference pipeline feeds the four networks the right shapes', async () => {
    class Tensor { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } }
    const calls = [];
    const s = {
        dp: { run: async (f) => { calls.push(['dp', f]); return { duration: { data: Float32Array.of(1.0) } }; } },
        enc: { run: async (f) => { calls.push(['enc', f]); return { text_emb: new Tensor('float32', new Float32Array(8), [1, 8, 1]) }; } },
        est: { run: async (f) => { calls.push(['est', f]); return { denoised_latent: { data: f.noisy_latent.data } }; } },
        voc: { run: async (f) => { calls.push(['voc', f]); return { wav_tts: { data: new Float32Array(f.latent.dims[2] * 3072).fill(0.1) } }; } },
    };
    const cfg = { ae: { sample_rate: 44100, base_chunk_size: 512 }, ttl: { chunk_compress_factor: 6, latent_dim: 24 } };
    const idx = parseIndexer(new Array(2000).fill(3));
    const style = { ttl: { data: new Float32Array(4), dims: [1, 2, 2] }, dp: { data: new Float32Array(4), dims: [1, 2, 2] } };
    const { pcm, sampleRate } = await synthesize({ Tensor }, s, cfg, idx, style, 'Привет. Как дела?', { speed: 1, steps: 3, rand: () => 0.5 });
    assert.equal(sampleRate, 44100);
    assert.equal(calls.filter((c) => c[0] === 'est').length, 3); // 3 flow steps, one chunk
    const dp = calls.find((c) => c[0] === 'dp')[1];
    assert.equal(dp.text_ids.type, 'int64');
    assert.equal(dp.text_ids.dims[1], preprocessText('Привет. Как дела?').length);
    const est = calls.find((c) => c[0] === 'est')[1];
    const T = Math.ceil(44100 / 3072);
    assert.deepEqual(est.noisy_latent.dims, [1, 144, T]);
    assert.deepEqual(est.latent_mask.dims, [1, 1, T]);
    assert.equal(pcm.length, 44100); // trimmed to the predicted duration
});

test('voice sources: Hugging Face downloads (no file in git), the small int8 package first', () => {
    assert.ok(VOICE_SOURCES.length >= 2);
    for (const s of VOICE_SOURCES) assert.match(s.base, /^https:\/\/huggingface\.co\/.+\/resolve\/main\/$/);
    assert.ok(VOICE_SOURCES[0].bytes < 200 * 1048576);
});

// ------------------------------------------------------------------ Speech
function fakeSystem(voices) {
    const spoken = [];
    const synth = {
        paused: false,
        getVoices: () => voices,
        addEventListener() {},
        speak(u) { spoken.push(u); },
        cancel() {},
        resume() {},
    };
    class Utterance { constructor(text) { this.text = text; } }
    return { spoken, window: { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance } };
}

function fakeAudio() {
    const played = [];
    const ctx = {
        state: 'running',
        currentTime: 10,
        destination: {},
        createBuffer: (ch, len, sr) => { const d = new Float32Array(len); return { length: len, sampleRate: sr, getChannelData: () => d }; },
        createBufferSource: () => {
            const src = { playbackRate: { value: 1 }, connect() {}, start(at) { src.at = at; played.push(src); }, stop() {}, onended: null };
            return src;
        },
        createGain: () => { const g = { gain: { value: 1 }, connect() {} }; ctx._lastGain = g; return g; },
    };
    return { ctx, played };
}

function fakeNeural({ ready = true, fail = false, chunks = 1 } = {}) {
    const nv = {
        state: ready ? 'ready' : 'idle',
        get ready() { return this.state === 'ready'; },
        calls: [],
        loads: 0,
        load() { this.loads++; this.state = 'loading'; return new Promise(() => {}); },
        synth(text, o) {
            this.calls.push({ text, ...o });
            if (fail) return Promise.reject(new Error('boom'));
            return Promise.resolve().then(() => {
                const n = chunks;
                for (let i = 0; i < n; i++) o.onChunk?.(new Float32Array(4410), 44100, i === n - 1);
                return { pcm: new Float32Array(4410 * n), sampleRate: 44100 };
            });
        },
    };
    return nv;
}

async function withWindow(win, fn) {
    const had = 'window' in globalThis, old = globalThis.window;
    globalThis.window = win;
    try { return await fn(); } finally { if (had) globalThis.window = old; else delete globalThis.window; }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('Speech: neural voice by gender, pitch by playback rate, volume × the game sound volume', async () => {
    const { ctx, played } = fakeAudio();
    const nv = fakeNeural();
    let master = 0.5;
    const s = new Speech({ neural: nv, audioContext: () => ctx, master: () => master });
    assert.equal(s.supported, true);
    assert.equal(s.say('Свежий хлеб, 3 монеты!', { voiceKey: 'm1', role: 'merchant', female: true, volume: 0.8 }), true);
    await tick();
    assert.equal(nv.calls[0].voice[0], 'F');
    assert.equal(nv.calls[0].text, 'Свежий хлеб, три монеты!');
    const cast = castNeural({ voiceKey: 'm1', role: 'merchant', female: true });
    assert.equal(played.length, 1);
    assert.ok(Math.abs(played[0].playbackRate.value - cast.pitch) < 1e-9);
    assert.ok(Math.abs(nv.calls[0].speed - cast.speed / cast.pitch) < 1e-9);
    assert.ok(Math.abs(ctx._lastGain.gain.value - 0.4) < 1e-9);
    assert.equal(s.speaking, true);
    played[0].onended();
    assert.equal(s.speaking, false);
    // a man, then the king: male voices
    s.say('Стой!', { voiceKey: 'k1', role: 'knight', female: false });
    s.say('Я король.', { voiceKey: 'king', role: 'king' });
    await tick();
    assert.equal(nv.calls[1].voice[0], 'M');
    assert.equal(nv.calls[2].voice[0], 'M');
    // the sound volume at zero: nobody is heard
    s.cancel();
    master = 0;
    assert.equal(s.say('Тишина', { voiceKey: 'q' }), false);
});

test('Speech: before the neural voices are ready the system voices speak — by gender — and the download starts', async () => {
    const { spoken, window } = fakeSystem([...WINDOWS, ...MAC]);
    await withWindow(window, async () => {
        const nv = fakeNeural({ ready: false });
        const statuses = [];
        const s = new Speech({ neural: nv, onStatus: (st) => statuses.push(st.state) });
        assert.equal(s.say('Добрый день', { voiceKey: 'w', role: 'farmer', female: true }), true);
        assert.equal(nv.loads, 1);
        assert.deepEqual(statuses, ['loading']);
        assert.equal(systemVoiceGender(spoken[0].voice), 'female');
        assert.ok(spoken[0].pitch >= 1);
        spoken[0].onend();
        s.say('Здравствуй', { voiceKey: 'm', role: 'builder', female: false });
        assert.equal(systemVoiceGender(spoken[1].voice), 'male');
        assert.ok(spoken[1].pitch <= 1.05);
        spoken[1].onend();
        assert.equal(nv.loads, 1); // only once
        // engine 'system': no download at all
        const nv2 = fakeNeural({ ready: false });
        const s2 = new Speech({ neural: nv2, engine: 'system' });
        s2.say('Привет', { voiceKey: 'x', female: true });
        assert.equal(nv2.loads, 0);
    });
});

test('Speech: a man is never given a female system voice — silent (text only) instead', async () => {
    const { spoken, window } = fakeSystem([V('Google русский', 'ru-RU', false), V('Microsoft Irina - Russian (Russia)')]);
    await withWindow(window, async () => {
        const s = new Speech({ neural: null });
        let ended = null;
        assert.equal(s.say('Я рыцарь', { voiceKey: 'k', role: 'knight', female: false, onEnd: (ok) => { ended = ok; } }), false);
        assert.equal(spoken.length, 0);
        assert.equal(ended, false);
        assert.equal(s.speaking, false);
        assert.equal(s.say('Я крестьянка', { voiceKey: 'f', role: 'farmer', female: true }), true);
        assert.equal(spoken.length, 1);
    });
});

test('Speech: if the neural voice fails on a line, the system voice of the same gender says it', async () => {
    const { spoken, window } = fakeSystem([...EDGE]);
    await withWindow(window, async () => {
        const nv = fakeNeural({ fail: true });
        const s = new Speech({ neural: nv, audioContext: () => fakeAudio().ctx });
        s.say('Помогите!', { voiceKey: 'm', role: 'farmer', female: false });
        await tick();
        assert.equal(spoken.length, 1);
        assert.match(spoken[0].voice.name, /Dmitry/);
    });
});

test('Speech: the same villager queues, another villager interrupts', async () => {
    const { ctx, played } = fakeAudio();
    const nv = fakeNeural();
    const s = new Speech({ neural: nv, audioContext: () => ctx });
    const ends = [];
    s.say('Раз', { voiceKey: 'a', onEnd: (ok) => ends.push(['раз', ok]) });
    s.say('Два', { voiceKey: 'a', onEnd: (ok) => ends.push(['два', ok]) });
    s.say('Три', { voiceKey: 'a', onEnd: (ok) => ends.push(['три', ok]) });
    assert.deepEqual(ends, [['два', false]]);
    await tick();
    played[0].onended();
    await tick();
    assert.deepEqual(nv.calls.map((c) => c.text), ['Раз', 'Три']);
    s.say('Другой', { voiceKey: 'b' });
    assert.deepEqual(ends.slice(-1), [['три', false]]);
});

test('Speech: a long line plays sentence after sentence as they are synthesized, and ends after the last', async () => {
    const { ctx, played } = fakeAudio();
    const nv = fakeNeural({ chunks: 3 });
    const s = new Speech({ neural: nv, audioContext: () => ctx });
    let ended = null;
    s.say('Добрый день! Свежий хлеб. Бери, пока горячий!', { voiceKey: 'm', female: true, onEnd: (ok) => { ended = ok; } });
    await tick();
    assert.equal(played.length, 3);
    assert.ok(played[0].at >= 10 && played[1].at > played[0].at + 0.09 && played[2].at > played[1].at + 0.09);
    played[0].onended();
    played[1].onended();
    assert.equal(ended, null);
    assert.equal(s.speaking, true);
    played[2].onended();
    assert.equal(ended, true);
    assert.equal(s.speaking, false);
});
