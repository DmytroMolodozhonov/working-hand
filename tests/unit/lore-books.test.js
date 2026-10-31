// The books of the world's history (LoreBooks.js, LorePages.js): they teach nothing, their text flows on
// from page to page, every picture is painted, the one tower's library has them; «Flying Maxima» is the gods'.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LORE_BOOKS, loreItem, loreOf, loreForSite } from '../../src/game/LoreBooks.js';
import { layout, PICTURES, PAGE } from '../../src/game/LorePages.js';
import { TerrainData } from '../../src/world/Terrain.js';
import { GOD_SPELLS } from '../../src/game/Mana.js';
import { isDivine } from '../../src/game/ProtectionGods.js';
import { howLearned } from '../../src/game/SpellBook.js';

test('lore books: the author\'s seven, no spells, every picture painted, the text fits the pages', () => {
    assert.deepEqual(LORE_BOOKS.map((b) => b.id), ['coprus', 'jovalilius', 'liliazina', 'gods', 'iceQueen', 'blackbeard', 'flyingMaxima', 'diabolos']);
    const measure = (font, s) => s.length * (font.includes('19px') ? 10 : 7.5); // (about a serif's width)
    for (const b of LORE_BOOKS) {
        const it = loreItem(b.id, 'u1');
        assert.deepEqual(it.spells, []);
        assert.equal(loreOf(it), b);
        for (const pg of b.pages) if (pg.pic) assert.ok(PICTURES[pg.pic], `${b.id}: picture ${pg.pic}`);
        const pages = layout(b, measure);
        assert.ok(pages.length >= 3, b.id);
        for (const pg of pages) for (const l of pg.lines || []) {
            assert.ok(l.y <= PAGE.Y1 && l.y >= PAGE.Y0, `${b.id}: a line off the page`);
            assert.ok(measure(l.font, l.t) <= PAGE.X1 - PAGE.X0 + 1, `${b.id}: a line too wide`);
        }
        const words = b.pages.filter((p) => p.p).map((p) => p.p).join(' ').split(/\s+/).length;
        const laid = pages.flatMap((p) => (p.lines || []).filter((l) => !l.center)).map((l) => l.t).join(' ').split(/\s+/).length;
        assert.equal(laid, words, `${b.id}: every word laid out`);
    }
});

test('lore books: on the desk of the one tower\'s library; a site gives its own spots', () => {
    for (const seed of [4242, 12345, 1]) {
        const t = new TerrainData(); t.generate({ seed, mountains: true });
        const w = t.towers.only();
        const list = loreForSite(w);
        assert.equal(list.length, Math.min(w.lore.length, LORE_BOOKS.length), `seed ${seed}: a book on every stand`);
        for (const { at } of list) assert.ok(Math.hypot(at.x - w.x, at.z - w.z) < 15 && at.y > w.F + 5, 'inside the tower, on an upper floor');
    }
    assert.deepEqual(loreForSite({ lore: [{ x: 1, y: 2, z: 3 }] }).map((b) => b.id), ['coprus']);
    assert.deepEqual(loreForSite({}), []);
});

test('lore books: the god in chains reaches the libraries by place (7 stands, 8 books), no book twice', () => {
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
        const spots = Array.from({ length: 7 }, () => ({ x: 0, y: 0, z: 0 }));
        const ids = loreForSite({ x: i * 311, z: i * 97 - 500, lore: spots }).map((b) => b.id);
        assert.equal(ids.length, 7);
        assert.equal(new Set(ids).size, 7);
        if (ids.includes('diabolos')) seen.add(i);
    }
    assert.ok(seen.size >= 20 && seen.size < 40, 'a part of the libraries has it: ' + seen.size);
    const book = LORE_BOOKS.find((b) => b.id === 'diabolos');
    assert.ok(book.pages.length >= 4 && book.cover === 0x4a0d10);
    const all = book.title + ' ' + book.sub + ' ' + book.pages.map((p) => (p.p || '') + ' ' + (p.h || '') + ' ' + (p.caption || '')).join(' ');
    assert.ok(!/меч|жезл|unitas|объедин/i.test(all), 'the secret: no sword, rod, Unitas, uniting in the book');
    assert.match(all, /божеств|богов/i);
    assert.ok(!/ад\b|числ/i.test(book.pages.map((p) => p.p || '').join(' ')), 'no «ад» (the underworld)');
});

test('«Flying Maxima» is a spell of the gods, given (never a scroll)', () => {
    assert.ok(GOD_SPELLS.has('FlyingMaxima') && isDivine('FlyingMaxima'));
    assert.equal(howLearned('FlyingMaxima'), 'mana');
});
