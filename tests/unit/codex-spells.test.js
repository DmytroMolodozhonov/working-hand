// The spell book (Codex.js «Заклинания»): ONLY spells. A mechanic of the game (the sea, how duels
// go, swimming, mana…) is a section of «Механика игры», never a spell card. Every spell card must
// name in its «say» at least one phrase in «…» that really casts a spell (matchSpell).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELLS, SPELL_CATEGORIES, MECHANICS, ITEMS } from '../../src/ui/Codex.js';
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

test('every «Механика игры» section has its title, lead and points (one broken section left the whole tab empty)', () => {
    for (const m of MECHANICS) {
        assert.ok(m.title && typeof m.lead === 'string', `«${m.title}»: title and lead`);
        assert.ok(Array.isArray(m.points) && m.points.length, `«${m.title}»: points: [...] (not items / text)`);
    }
});

test('every spell and every thing has its own icon (none shared) and every icon file exists', async () => {
    const { existsSync } = await import('node:fs');
    const seen = new Map();
    for (const s of [...SPELLS, ...ITEMS]) {
        assert.ok(s.icon, `«${s.name}»: no icon`);
        assert.ok(existsSync(new URL(`../../${s.icon}`, import.meta.url)), `«${s.name}»: no file ${s.icon}`);
        assert.ok(!seen.has(s.icon), `«${s.name}» and «${seen.get(s.icon)}» share the icon ${s.icon}`);
        seen.set(s.icon, s.name);
    }
});

test('«Магия»: the tab tree Магия → Заклинания / Зелья / Пентаграммы, a card for every pentagram, the picture only for the learned', async () => {
    const { codexTabs, pentagramCards, potionCards } = await import('../../src/ui/Codex.js');
    const { PENTAGRAMS } = await import('../../src/game/Pentagrams.js');
    await import('../../src/game/PentagramRules.js'); // (registers the good and the devil pentagrams)
    const tree = codexTabs();
    assert.equal(tree.length, 1);
    assert.equal(tree[0].name, '✨ Магия');
    assert.deepEqual(tree[0].children.map((c) => c.id), ['spells', 'potions', 'pentagrams']);
    const { isPentagramKnown, POTION_CATEGORIES, potionEntries } = await import('../../src/ui/Codex.js');
    const nothing = pentagramCards(new Set()); // a Survival hero who learned nothing: no pictures, descriptions stay
    assert.deepEqual(nothing.map((c) => c.id).sort(), Object.keys(PENTAGRAMS).sort());
    assert.ok(nothing.every((c) => !c.svg && !c.learned && c.text), 'unlearned: no picture, but a description');
    const some = pentagramCards(new Set(['devil']));
    assert.ok(/<svg/.test(some.find((c) => c.id === 'devil').svg) && !some.find((c) => c.id === 'life').svg);
    // no hero (the main menu) / Creative: every drawing is shown
    for (const c of pentagramCards(null)) assert.ok(c.learned && /<svg/.test(c.svg), `«${c.name}»: the menu shows the picture`);
    assert.equal(isPentagramKnown(null, 'devil'), true);
    assert.equal(isPentagramKnown({}, 'devil'), true);
    assert.equal(isPentagramKnown({ game: {}, creative: true, known: new Set() }, 'devil'), true);
    assert.equal(isPentagramKnown({ game: {}, known: new Set() }, 'devil'), false);
    assert.equal(isPentagramKnown({ game: {}, known: new Set(['devil']) }, 'devil'), true);
    // the potion categories: «Все» on top, every entry in a category that exists, none empty
    assert.equal(POTION_CATEGORIES[0].id, 'all');
    const ids = new Set(POTION_CATEGORIES.map((c) => c.id));
    const ent = potionEntries();
    assert.ok(ent.every((e) => ids.has(e.cat)));
    for (const c of POTION_CATEGORIES.slice(1)) assert.ok(ent.some((e) => e.cat === c.id), `the category «${c.name}» is empty`);
    assert.ok(potionCards().length >= 3 && potionCards().every((p) => p.ingredients.length));
});
