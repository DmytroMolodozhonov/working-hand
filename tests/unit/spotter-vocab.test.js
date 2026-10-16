// Every spell of the codex can be heard by the spotter (src/audio/SpellSpotter.js): a spell missing from
// its list was pulled to the nearest one it knew — «Create a Castle» came out «Create a House» / «… a Wall».
import test from 'node:test';
import assert from 'node:assert/strict';
import { VOCAB } from '../../src/audio/SpellSpotter.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELLS } from '../../src/ui/Codex.js';

test('every spell said in the codex is in the spotter\'s list (by its own words, not a neighbour\'s)', () => {
    const have = new Set(VOCAB.map((v) => v.spell));
    const skip = new Set(['ChangeColor', 'Die']); // (said with a colour: heard from the written words; «Дай» — an everyday word: only its written whole word casts, StrongSpells.dieWords)
    const miss = SPELLS.map((s) => matchSpell(s.name)).filter((n) => n && !skip.has(n) && !have.has(n));
    assert.deepEqual([...new Set(miss)], []);
    for (const p of ['криейт э касл', 'создай замок']) assert.equal(VOCAB.find((v) => v.phrase === p)?.spell, 'CreateCastle', p);
    for (const p of ['айс касл', 'создай ледяной замок']) assert.equal(VOCAB.find((v) => v.phrase === p)?.spell, 'IceCastle', p);
});
