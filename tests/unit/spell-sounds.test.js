// Every spell that can be said has its sound (the author: «a new spell — at once with its own sound, a great
// one with a tune») — the card SpellMusic.SPELL_SOUND; the held spells have their loop (HELD_SOUND).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPELL_SOUND, HELD_SOUND, SPELL_GEN, TUNE_KEYS, SPELL_SR } from '../../src/audio/SpellMusic.js';
import { SPELLS } from '../../src/ui/Codex.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { HELD } from '../../src/game/Concentration.js';

/** Every name matchSpell can give (read from its sources) and every name the spell book's phrases cast. */
function spokenSpells() {
    const names = new Set();
    for (const f of ['src/fx/SpellManager.js', 'src/game/IceMagic.js']) {
        const src = readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
        for (const m of src.matchAll(/(?:return|\?|:)\s*'([A-Z][A-Za-z]+)'/g)) names.add(m[1]);
    }
    for (const s of SPELLS) for (const m of (s.say || '').matchAll(/«([^»]+)»/g)) { const n = matchSpell(m[1]); if (n) names.add(n); }
    return names;
}
const SM_KEYS = new Set(['house_block']); // (SoundManager's own sounds a card may use)

test('every spell that can be said is on the card of sounds (SpellMusic.SPELL_SOUND)', () => {
    const missing = [...spokenSpells()].filter((n) => !SPELL_SOUND[n] && n !== 'Storm' && !/^Lightning(Hold|Hit|Catch|Beam)$/.test(n));
    assert.deepEqual(missing, [], 'no sound for: ' + missing.join(', ') + ' — add it to SPELL_SOUND');
    for (const [n, e] of Object.entries(SPELL_SOUND)) {
        assert.ok(e.cast || e.theme || e.own?.length, `${n}: an empty entry`);
        for (const k of [e.cast, e.theme].filter(Boolean)) assert.ok(SPELL_GEN[k] || SM_KEYS.has(k), `${n}: no sound «${k}»`);
        if (e.theme) assert.ok(TUNE_KEYS.includes(e.theme), `${n}: «${e.theme}» is not a tune`);
    }
});

test('every held spell has its entry (a loop, or its own sounds go on)', () => {
    for (const k of Object.keys(HELD)) assert.ok(HELD_SOUND[k], `HELD «${k}»: no entry in HELD_SOUND`);
    for (const e of Object.values(HELD_SOUND)) for (const k of [e.loop, e.end].filter(Boolean)) assert.ok(SPELL_GEN[k], `no sound «${k}»`);
});

test('the sounds: tunes 5–15 s, effects short, all sounding and finite, the same on every computer', () => {
    for (const [k, gen] of Object.entries(SPELL_GEN)) {
        const d = gen(SPELL_SR), s = d.length / SPELL_SR;
        if (TUNE_KEYS.includes(k)) assert.ok(s >= 5 && s <= 15, `${k}: ${s.toFixed(1)} s`);
        else if (k.startsWith('fx') || k.startsWith('end')) assert.ok(s <= 2, `${k}: ${s.toFixed(1)} s`);
        else if (k.startsWith('st')) assert.ok(s <= 4, `${k}: ${s.toFixed(1)} s`); // (a stinger: a great spell's one musical moment — «Да пусть создастся»: the words heard)
        let p = 0;
        for (const x of d) { assert.ok(Number.isFinite(x), k); p = Math.max(p, Math.abs(x)); }
        assert.ok(p > 0.1 && p <= 0.96, `${k}: peak ${p}`);
    }
    // (distinct tunes: no two the same)
    const sig = TUNE_KEYS.map((k) => SPELL_GEN[k](8000).slice(4000, 4100).join());
    assert.equal(new Set(sig).size, TUNE_KEYS.length);
    assert.deepEqual(SPELL_GEN.fxWind(8000), SPELL_GEN.fxWind(8000));
});
