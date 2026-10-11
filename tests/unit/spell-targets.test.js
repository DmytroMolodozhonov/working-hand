// Every spell reaches every kind of creature: a new kind of creature added to the game (sailors were
// once forgotten — «Авада Кедавра» flew through them) must be added at EVERY place spells look for
// their targets. This test reads those places and fails if one of them misses a kind.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** The body of a method / an object-literal hook `name` in a source text (up to its closing brace). */
function body(text, start) {
    const i = text.indexOf(start);
    assert.ok(i >= 0, `not found: ${start}`);
    let depth = 0, j = text.indexOf('{', i);
    for (let k = j; k < text.length; k++) {
        if (text[k] === '{') depth++;
        else if (text[k] === '}' && --depth === 0) return text.slice(i, k + 1);
    }
    return text.slice(i);
}

/** The kinds of creatures (CLAUDE.md: «персонажи» — all living things) and how each is named in code. */
const KINDS = {
    zombies: /zombies|zombieById/,
    'castle people (villagers, knights, the king, wizards)': /castleLife/,
    animals: /animals/,
    'sailors (ships\' crews)': /ships\??\.crew/,
    'the giant spider': /spiders/,
    'living trees': /livingTrees/,
    'book-birds': /books/,
};

const check = (where, text, kinds) => {
    const miss = kinds.filter((k) => !KINDS[k].test(text));
    assert.deepEqual(miss, [], `${where} forgets: ${miss.join(', ')}`);
};
const ALL = Object.keys(KINDS);

test('duel charges («Авада Кедавра», «Остолбеней», «Сапира»…) can touch every creature', () => {
    const d = src('src/game/Duel.js');
    check('Duel._bodies (what a charge can hit)', body(d, '    _bodies(skip = null) {'), ALL);
    check('Duel._creature (a hit creature found again)', body(d, '    _creature(kind, id) {'), ALL.filter((k) => !/zombies|spider/.test(k)));
});

test('blasts, rays and lightning reach every creature', () => {
    const g = src('src/game/Game.js');
    const blast = g.slice(g.indexOf('    explode('), g.indexOf('this.combat.explosion(', g.indexOf('    explode(')));
    check('Game.explode (Bombardo and other blasts)', blast, ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'book-birds']);
    check('the «birdRay» hook (Sapira, Thunderwave, Ice… rays)', body(g, 'birdRay: (o, d, len, width, name) =>'), ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'book-birds']);
    check('the «lightningAt» hook', body(g, 'lightningAt: (point, casterId) =>'), ['castle people (villagers, knights, the king, wizards)', 'animals', 'sailors (ships\' crews)', 'the giant spider', 'book-birds']);
});

test('pushes, knockdowns and gusts («Вайнд», blasts, blows) know every creature (CreatureImpact kinds)', async () => {
    // (Sailors.js registers its kind when it is loaded — as it is in the game)
    await import('../../src/game/Sailors.js');
    const { KINDS: K } = await import('../../src/game/CreatureImpact.js');
    const names = Object.values(K).map((k) => k.name);
    for (const n of ['zombie', 'villager', 'animal', 'tree', 'sailor']) assert.ok(names.includes(n), `CreatureImpact has no «${n}» kind (spells would not push it)`);
});
