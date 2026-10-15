/**
 * The villagers' voices from the program on this computer (tts_native.py → server.py → NativeTTS.js):
 * the samples arrive as they were made — 16-bit little-endian, in order, the right sign and scale —
 * and every sentence is asked for in its order, the cut ones not at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pcmFromBase64, NativeTTSPort } from '../../src/audio/NativeTTS.js';

const b64 = (ints) => { const b = Buffer.alloc(ints.length * 2); ints.forEach((v, i) => b.writeInt16LE(v, i * 2)); return b.toString('base64'); };

test('16-bit samples → floats: order, sign and scale kept (nothing backwards)', () => {
    const p = pcmFromBase64(b64([0, 1000, -1000, 32767, -32768, 12345]));
    assert.deepEqual(Array.from(p, (x) => Math.round(x * 32768)), [0, 1000, -1000, 32767, -32768, 12345]);
    assert.equal(pcmFromBase64('').length, 0);
});

test('a line goes sentence by sentence, in order; each piece of sound comes back with its rate', async () => {
    const asked = [];
    globalThis.fetch = async (url, o) => {
        const j = JSON.parse(o.body);
        asked.push(j.text);
        return { ok: true, json: async () => ({ sr: 44100, pcm: b64(Array.from({ length: j.text.length }, (_, i) => i)) }) };
    };
    const port = new NativeTTSPort();
    const got = [];
    await new Promise((resolve) => {
        port.onmessage = ({ data }) => { got.push(data); if (data.last) resolve(); };
        port.postMessage({ type: 'synth', id: 1, text: 'Добрый день, путник! Заходи, у меня свежий хлеб.', voice: 'M3' });
    });
    assert.deepEqual(asked, ['Добрый день, путник!', 'Заходи, у меня свежий хлеб.']);
    assert.deepEqual(got.map((m) => [m.part, m.last, m.sampleRate, m.pcm.length]), [[0, false, 44100, asked[0].length], [1, true, 44100, asked[1].length]]);
    assert.equal(Math.round(got[1].pcm[3] * 32768), 3, 'the samples in their order');
    delete globalThis.fetch;
});
