// «Бомбардо… Бомбардо… Бомбардо»: the same spell said again at once casts again, no «переотдых» (the author's complaint).
// Real recordings of the network's output (fixtures/voice-spells.json) joined with pauses of quiet, looked at the way the game does.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { unpack, V, BLANK } from '../../src/audio/SpellSpotter.js';
import { lookAt } from '../../src/input/NativeVoice.js';
import { afterCast } from '../../src/audio/SpellPhrase.js';

const rows = JSON.parse(fs.readFileSync(new URL('../fixtures/voice-spells.json', import.meta.url), 'utf8'));
const pack = (arr) => Buffer.from(Uint8Array.from(arr, (x) => Math.max(0, Math.min(255, Math.round(-x * 10))))).toString('base64');
const blank = (n) => { const a = new Float32Array(n * V).fill(-20); for (let t = 0; t < n; t++) a[t * V + BLANK] = 0; return a; };

/** The look sequence the game gets for words said with pauses; returns the casts [{at, text, more, settled, isFinal, repeat}]. */
function casts(texts, gapMs, voice = 0) {
    const parts = [];
    texts.forEach((t, i) => {
        const r = rows.filter((x) => x.kind === 'spell' && x.text === t)[voice] || rows.find((x) => x.kind === 'spell' && x.text === t);
        parts.push(unpack(r.lp, r.T));
        if (i < texts.length - 1) parts.push(blank(Math.round(gapMs / 40)));
    });
    parts.push(blank(25));
    const total = parts.reduce((s, p) => s + p.length / V, 0);
    const all = new Float32Array(total * V);
    let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
    let seg = {}; const out = [];
    for (let n = 8; n <= total; n += 2) {
        const fin = n >= total - 1, m = fin ? total : n;
        const r = lookAt({ id: 1, final: fin, T: m, lp: pack(all.subarray(0, m * V)), far: 0, t0: 0, t1: m * 40 }, seg);
        seg = r.seg;
        if (r.say && !r.say.more && !r.say.talkOnly && r.heard.sure) out.push({ at: m * 40, text: r.say.text, settled: !!r.say.settled, isFinal: r.say.isFinal, repeat: !!r.repeat });
        if (fin) break;
    }
    return out;
}

test('«бомбардо… бомбардо… бомбардо» with pauses 0.4 / 0.8 s: every word casts, once', () => {
    for (const gap of [400, 800]) for (const voice of [0, 1]) {
        const c = casts(['бомбардо', 'бомбардо', 'бомбардо'], gap, voice).filter((x) => x.text === 'бомбардо');
        assert.equal(c.length, 3, `gap ${gap}, voice ${voice}: ${JSON.stringify(c)}`);
        assert.equal(c[1].repeat && c[2].repeat, true);
        // the second word casts about MORE_WAIT after it ended, not later: its place in time is at most the gap + the word + 0.5 s
        assert.ok(c[1].at - c[0].at < gap + 29 * 40 + 500, `gap ${gap}: ${c[1].at - c[0].at} ms`);
    }
});

test('one «Бомбардо» is one cast; «Бомбардо Максима» is still one «Бомбардо Максима»', () => {
    assert.equal(casts(['бомбардо'], 0).length, 1);
    const m = casts(['бомбардо максима'], 0);
    assert.equal(m.length, 1);
    assert.equal(m[0].text, 'бомбардо максима');
});

test('other short spells said again cast again too (Даст, Акцио, Фрозен, Инферно, Джолт — where one of them casts at all)', () => {
    let tried = 0;
    for (const w of ['айс', 'даст', 'акцио', 'фрозен', 'инферно', 'джолт']) for (const voice of [0, 1]) {
        if (casts([w], 0, voice).length !== 1) continue; // (this recording is not found even alone — not the repeat's business)
        tried++;
        for (const gap of [400, 800]) {
            const c = casts([w, w], gap, voice);
            assert.equal(c.length, 2, `«${w}» voice ${voice} gap ${gap}: ${JSON.stringify(c)}`);
        }
    }
    assert.ok(tried >= 6, `${tried}`);
});

test('afterCast: the same spell said again casts at once; the explosion\'s echo and the phrase\'s own end still do not', () => {
    const last = { spell: 'Bombardo', at: 1000, seg: 7, to: 900 };
    assert.equal(afterCast(last, 'Bombardo', { native: true, seg: 7, fit: 0.1, repeat: true }, 1400), null); // (found after the first one in the same phrase)
    assert.equal(afterCast(last, 'Bombardo', { native: true, seg: 8, fit: 0.4, from: 1200 }, 1500), null); // (a new phrase after the speech was over)
    assert.ok(afterCast(last, 'Bombardo', { native: true, seg: 7, fit: 1.5 }, 1500)); // (the same phrase's end)
    assert.ok(afterCast(last, 'Bombardo', { native: true, seg: 8, fit: 0.1, from: 1200 }, 1500)); // (too unsure: an echo)
    assert.ok(afterCast(last, 'Bombardo', { native: true, seg: 8, fit: 0.4, from: 700 }, 1500)); // (began inside the first one: its echo)
    for (const gap of [400, 800, 1500]) assert.equal(afterCast({ ...last, to: 900 }, 'Bombardo', { native: true, seg: 9, fit: 0.5, from: 900 + gap }, 1000 + gap + 300), null);
});
