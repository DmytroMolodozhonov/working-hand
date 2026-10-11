/**
 * Villager voices in a real browser: a woman always with a female voice, a man
 * with a male one (neural voices and the system-voice fallback), the volume
 * follows the game's sound volume, and — when the voice model files are at
 * hand (ZNS_TTS_MODEL_DIR = a folder with the sherpa-onnx Supertonic 3 int8
 * files) — the real neural model speaking in Chromium.
 * Run: node --test tests/e2e/voices.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8171;
const MODEL_DIR = process.env.ZNS_TTS_MODEL_DIR || '';
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

const frames = (page, n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__zns.game, end = g.frameCount + n;
    const t = setInterval(() => { if (g.frameCount >= end) { clearInterval(t); res(); } }, 50);
}), n);

/** A Windows-like set of Russian system voices that records what is spoken. */
function fakeSpeechInit() {
    const mk = (name, local = true) => ({ name, voiceURI: name, lang: 'ru-RU', localService: local, default: false });
    const voices = [
        mk('Microsoft Irina - Russian (Russia)'), mk('Microsoft Pavel - Russian (Russia)'),
        mk('Microsoft Svetlana Online (Natural) - Russian (Russia)', false), mk('Microsoft Dmitry Online (Natural) - Russian (Russia)', false),
        mk('Google русский', false), mk('Google US English', false),
    ];
    voices[5].lang = 'en-US';
    window.__spoken = [];
    const synth = {
        paused: false, speaking: false,
        getVoices: () => voices,
        addEventListener() {}, removeEventListener() {},
        speak(u) { window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, pitch: u.pitch, rate: u.rate, volume: u.volume }); setTimeout(() => u.onend && u.onend(), 20); },
        cancel() {}, resume() {}, pause() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
}

test('voices: every villager — women, men, knights, the king, merchants — speaks with a voice of their own gender; volume follows the game sound', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    // no voice model reachable: the neural voices fail → the system voices speak
    let hf = 0;
    await ctx.route(/huggingface\.co/, (r) => { hf++; return r.fulfill({ status: 404, body: 'no' }); });
    await ctx.addInitScript(fakeSpeechInit);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.addInitScript(() => { window.__ZNS_NO_CAMERA__ = true; window.__ZNS_NO_WORLD_PROBE__ = true; window.__ZNS_FIXED_QUALITY__ = true; });
    await page.goto(srv.url);
    await page.waitForFunction(() => !!window.__zns, null, { timeout: 30000 });
    // the menu offers the neural voices, the computer voices and text only
    const opts = await page.$$eval('#villager-voice option', (o) => o.map((x) => x.value));
    assert.deepEqual(opts, ['1', 'system', '0']);
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        g.character.group.position.set(c.gate.x, c.gate.y + 2.2, c.gate.z);
        g.world.terrain.flushAround(c.gate.x, c.gate.z);
    });
    let n = 0;
    for (let i = 0; i < 30 && n < 5; i++) { await frames(page, 10); n = await page.evaluate(() => window.__zns.game.castleLife.byId.size); }
    assert.ok(n >= 5, 'villagers around');
    const res = await page.evaluate(async () => {
        const g = window.__zns.game, T = g.castleLife.talk;
        g.sound.globalVolume = 0.5;
        const out = [];
        for (const v of g.castleLife.byId.values()) {
            if (v.dead) continue;
            T.speech.cancel();
            const me = g.character.group.position;
            me.x = v.x + 1; me.z = v.z; // (right next to the villager: full voice)
            const before = window.__spoken.length;
            T.voice(v, `Я ${v.name}, 5 монет.`, false);
            await new Promise((r) => setTimeout(r, 60));
            const u = window.__spoken[before];
            out.push({ role: v.role, female: !!v.entry.female, voice: u ? u.voice : null, volume: u ? u.volume : null, pitch: u ? u.pitch : null, text: u ? u.text : null });
        }
        return { out, engine: T.speech.engine, neural: T.speech.neural && T.speech.neural.state };
    });
    const FEMALE = /Irina|Svetlana|Google русский/, MALE = /Pavel|Dmitry/;
    const roles = new Set(res.out.map((r) => r.role));
    assert.ok(roles.has('king') && roles.has('knight'), [...roles].join(','));
    let women = 0, men = 0;
    for (const r of res.out) {
        assert.ok(r.voice, `${r.role} spoke`);
        if (r.female) { women++; assert.match(r.voice, FEMALE, JSON.stringify(r)); assert.ok(r.pitch >= 1); } else { men++; assert.match(r.voice, MALE, JSON.stringify(r)); assert.ok(r.pitch <= 1.05); }
        assert.ok(r.volume > 0.3 && r.volume <= 0.5 + 1e-9, `volume follows the game sound: ${r.volume}`);
        assert.match(r.text, /пять монет/);
    }
    assert.ok(women >= 1 && men >= 2, `${women} women, ${men} men`);
    // different villagers sound different
    assert.ok(new Set(res.out.map((r) => `${r.voice}|${r.pitch.toFixed(3)}`)).size >= Math.min(5, res.out.length - 1));
    // the neural voices were tried (the model download), failed here, and the game went on
    await page.waitForFunction(() => window.__zns.game.castleLife.talk.speech.neural?.state === 'failed', null, { timeout: 30000 });
    assert.ok(hf >= 1, 'the voice model was requested');
    // sound off → silent
    const silent = await page.evaluate(() => {
        const g = window.__zns.game, T = g.castleLife.talk;
        g.sound.globalVolume = 0;
        T.speech.cancel();
        const v = [...g.castleLife.byId.values()][0];
        return T.speech.say('Тишина', { voiceKey: v.id, role: v.role, female: v.entry.female, volume: 1 });
    });
    assert.equal(silent, false);
    assert.deepEqual(realErrors(errors).filter((e) => !/huggingface|404|voice/i.test(e)), []);
    await ctx.close();
});

const files = (dir) => Object.fromEntries(fs.readdirSync(dir).map((f) => [f, path.join(dir, f)]));

test('voices: the neural model speaks in the browser — women F1–F5 high, men M1–M5 low; downloaded once, then from the cache', { skip: !MODEL_DIR && 'set ZNS_TTS_MODEL_DIR to the Supertonic 3 int8 files' }, async () => {
    const local = files(MODEL_DIR);
    const ctx = await browser.newContext();
    const hits = {};
    await ctx.route(/huggingface\.co/, (r) => r.fulfill({ status: 404, body: 'no' })); // (routes added later win)
    await ctx.route(/huggingface\.co\/csukuangfj2\/sherpa-onnx-supertonic-3-tts-int8-2026-05-11\/resolve\/main\/(.+)$/, (r) => {
        const name = r.request().url().split('/resolve/main/')[1];
        hits[name] = (hits[name] || 0) + 1;
        if (!local[name]) return r.fulfill({ status: 404, body: 'no' });
        return r.fulfill({ status: 200, body: fs.readFileSync(local[name]), headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/octet-stream' } });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(srv.url + 'ai.html');
    const r = await page.evaluate(async () => {
        const { NeuralVoice } = await import('/src/audio/NeuralVoice.js');
        const nv = new NeuralVoice();
        const progress = [];
        await nv.load((f, text) => progress.push(f));
        const out = {};
        for (const voice of ['F1', 'F4', 'M2', 'M4']) {
            const t0 = performance.now();
            const { pcm, sampleRate } = await nv.synth('Добрый день! Свежий хлеб, всего пять монет.', { voice, speed: 1 });
            out[voice] = { pcm: Array.from(pcm.subarray(0, Math.min(pcm.length, 44100 * 4))), sampleRate, len: pcm.length, ms: performance.now() - t0 };
        }
        // the whole chain: Speech → neural voice → sentences played one after another
        const { Speech } = await import('/src/audio/Speech.js');
        const sp = new Speech({ neural: nv, master: () => 0.3 });
        const t0 = performance.now();
        let firstAudio = null;
        const ac = sp._audio();
        const origCreate = ac.createBufferSource.bind(ac);
        ac.createBufferSource = () => { if (firstAudio == null) firstAudio = performance.now() - t0; return origCreate(); };
        const done = new Promise((res) => sp.say('Стой! Кто идёт? Назови себя, путник.', { voiceKey: 'knight-1', role: 'knight', female: false, onEnd: res }));
        const ok = await done;
        const speech = { ok, firstAudio, total: performance.now() - t0, last: sp.history[sp.history.length - 1], speaking: sp.speaking };
        nv.dispose();
        // a second load (a new game) comes from the browser cache
        const nv2 = new NeuralVoice();
        await nv2.load();
        nv2.dispose();
        return { out, speech, progress: progress.length, last: progress[progress.length - 1] };
    });
    assert.ok(r.progress >= 2 && r.last === 1, 'download progress reported');
    for (const n of Object.keys(hits)) assert.equal(hits[n], 1, `${n} downloaded once`);
    const f0 = (pcm, sr) => {
        const res = [];
        const W = 2048;
        for (let i = 0; i + W < pcm.length; i += 1024) {
            let e = 0;
            for (let k = 0; k < W; k++) e += pcm[i + k] * pcm[i + k];
            if (e / W < 1e-4) continue;
            let best = 0, bl = 0;
            for (let lag = Math.floor(sr / 400); lag < sr / 60; lag++) {
                let c = 0;
                for (let k = 0; k + lag < W; k++) c += pcm[i + k] * pcm[i + k + lag];
                if (c > best) { best = c; bl = lag; }
            }
            if (best / e > 0.4) res.push(sr / bl);
        }
        res.sort((a, b) => a - b);
        return res[res.length >> 1] || 0;
    };
    for (const [voice, o] of Object.entries(r.out)) {
        assert.equal(o.sampleRate, 44100);
        assert.ok(o.len > 44100 * 1.5 && o.len < 44100 * 8, `${voice}: ${o.len / 44100}s`);
        const hz = f0(Float32Array.from(o.pcm), o.sampleRate);
        if (voice[0] === 'F') assert.ok(hz > 160, `${voice} ${hz} Hz`); else assert.ok(hz < 150, `${voice} ${hz} Hz`);
        console.log(`  ${voice}: ${Math.round(hz)} Hz, ${(o.len / 44100).toFixed(1)} s audio in ${Math.round(o.ms)} ms`);
    }
    const sp = r.speech;
    assert.equal(sp.ok, true);
    assert.equal(sp.speaking, false);
    assert.equal(sp.last.engine, 'neural');
    assert.equal(sp.last.voice[0], 'M');
    assert.ok(sp.firstAudio < sp.total * 0.75, `the first sentence plays before the whole line is ready (${Math.round(sp.firstAudio)} of ${Math.round(sp.total)} ms)`);
    console.log(`  Speech: first sound after ${Math.round(sp.firstAudio)} ms, line done in ${Math.round(sp.total)} ms`);
    assert.deepEqual(errors, []);
    await ctx.close();
});
