// The spell book (Codex.js «Заклинания»): ONLY spells. A mechanic of the game (the sea, how duels
// go, swimming, mana…) is a section of «Механика игры», never a spell card. Every spell card must
// name in its «say» at least one phrase in «…» that really casts a spell (matchSpell).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELLS, SPELL_CATEGORIES, MECHANICS } from '../../src/ui/Codex.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('every card in the spell tabs is a spell that can be cast — mechanics go to «Механика игры»', () => {
    for (const s of SPELLS) {
        const words = [...(s.say || '').matchAll(/«([^»]+)»/g)].map((m) => m[1]);
        assert.ok(words.some((w) => matchSpell(w)), `«${s.name}» is not a spell (no castable «…» in its say) — move it to MECHANICS`);
    }
});

test('the spell tabs: each card in a tab that exists, no empty tabs, the sphere of protection under «Защита»', () => {
    const ids = new Set(SPELL_CATEGORIES.map((c) => c.id));
    for (const s of SPELLS) assert.ok(ids.has(s.cat), `«${s.name}»: no tab «${s.cat}»`);
    for (const c of SPELL_CATEGORIES) assert.ok(SPELLS.some((s) => s.cat === c.id), `the tab «${c.name}» is empty`);
    assert.ok(!ids.has('house'), 'no separate «Защита дома» tab');
    for (const n of ['Protection House', 'Protection Invisible', 'Protection House Grant']) {
        assert.equal(SPELLS.find((s) => s.name === n)?.cat, 'guard', n);
    }
    assert.ok(MECHANICS.some((m) => /Море/.test(m.title)), 'the sea is a mechanic');
    assert.ok(!SPELLS.some((s) => s.name === 'Море'));
});
