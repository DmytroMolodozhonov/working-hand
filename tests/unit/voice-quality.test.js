// The voice's quality guard (the author: «тест, который всегда запускается перед каждым крупным обновлением»).
// Real recordings of the speech network (tests/fixtures/voice-spells.json: spells said by two Russian voices,
// everyday talk, pieces of phrases) go the whole way a phrase goes in the game — the sound spotter
// (SpellSpotter.hear), one look at the phrase (NativeVoice.lookAt) and the page's checks (SpellPhrase:
// spellPhrase, soundTrust) — said on their own and after a few words and a pause («так… Инферно»).
// It fails when fewer spells are recognized or more talk casts than the floors below: a change to the voice
// that makes it hear worse can't go out unnoticed. Raise the floors when the voice gets better — never lower
// them to let a change through. (Also: `npm run test:voice`.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { unpack, V, BLANK, threshold } from '../../src/audio/SpellSpotter.js';
import { lookAt } from '../../src/input/NativeVoice.js';
import { spellPhrase, soundTrust } from '../../src/audio/SpellPhrase.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

const rows = JSON.parse(fs.readFileSync(new URL('../fixtures/voice-spells.json', import.meta.url), 'utf8'));
const spells = rows.filter((r) => r.kind === 'spell');
const talk = rows.filter((r) => r.kind !== 'spell');

/** The floors (measured 22.10.2026): recognized spells (of 128), talk that casts (of 110). */
export const FLOOR = { alone: 97, afterWords: 97, talkCast: 2, talkAfterWords: 2 }; // (measured: 98, 98, 2, 2; before this guard «after words» was 3 of 128)

const b64 = (lp) => Buffer.from(Array.from(lp, (x) => Math.round(-x * 10))).toString('base64');

/** Talk row `t`, then `gap` × 40 ms of quiet, then row `r` — one phrase. */
function after(t, r, gap = 14) {
    const a = unpack(t.lp, t.T), b = unpack(r.lp, r.T), T = t.T + gap + r.T, lp = new Float32Array(T * V);
    lp.set(a);
    for (let k = t.T; k < t.T + gap; k++) for (let v = 0; v < V; v++) lp[k * V + v] = v === BLANK ? 0 : -25;
    lp.set(b, (t.T + gap) * V);
    return { T, lp: b64(lp) };
}

/** The phrase's end, as the game takes it: the spell cast, or null. */
function cast(T, lp) {
    const o = lookAt({ id: 1, final: true, T, lp, far: 0 }, {});
    const s = o.say;
    if (!s || s.talkOnly) return null;
    const name = matchSpell(s.text);
    if (!name || !spellPhrase(s.text).ok) return null;
    const sp = o.heard.spell;
    if (o.heard.sure && sp && !s.byWords) {
        const fit = sp.avg - threshold(sp.len, 0, Infinity);
        if (soundTrust({ spell: name, canonical: s.text, written: o.heard.near ?? o.heard.written, fit, len: sp.len, far: 0, lips: null })) return null;
    }
    return name;
}

test('voice quality: spells said on their own are recognized, talk never casts', () => {
    let ok = 0, falseCasts = 0;
    for (const r of spells) if (cast(r.T, r.lp) === matchSpell(r.text)) ok++;
    for (const r of talk) if (cast(r.T, r.lp)) falseCasts++;
    assert.ok(ok >= FLOOR.alone, `узнано ${ok} из ${spells.length} (было не меньше ${FLOOR.alone})`);
    assert.ok(falseCasts <= FLOOR.talkCast, `обычная речь дала заклинание ${falseCasts} раз (было не больше ${FLOOR.talkCast})`);
});

test('voice quality: a spell after a few words and a pause («так… Инферно») is recognized; talk after talk never casts', () => {
    const words = talk.filter((r) => r.kind === 'talk');
    let ok = 0, falseCasts = 0;
    spells.forEach((r, i) => { const p = after(words[i % words.length], r); if (cast(p.T, p.lp) === matchSpell(r.text)) ok++; });
    talk.forEach((r, i) => { const p = after(words[(i + 7) % words.length], r); if (cast(p.T, p.lp)) falseCasts++; });
    assert.ok(ok >= FLOOR.afterWords, `после слов и паузы узнано ${ok} из ${spells.length} (было не меньше ${FLOOR.afterWords})`);
    assert.ok(falseCasts <= FLOOR.talkAfterWords, `обычная речь после речи дала заклинание ${falseCasts} раз (было не больше ${FLOOR.talkAfterWords})`);
});
