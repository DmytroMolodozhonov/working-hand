// «Свиток, который вы уже знаете, больше не выпадет» (SpellBook.scrollKey / scrollKnown, ItemTypes.freshScrolls / freshShopScroll):
// личное для того, кто открывает сундук; все выучены — свитки заменяются другой добычей; Творческий и сохранение знаний.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollKey, knownScrollKeys, scrollKnown, teachKey } from '../../src/game/SpellBook.js';
import { LOOT_FOR, freshScrolls, freshShopScroll, rollScroll, rollLoot, spellScroll, SCROLL_WEIGHTS, rollKeyItem } from '../../src/game/ItemTypes.js';
import { rollShopScroll } from '../../src/game/WizardShop.js';
import { wizardGood, SHOP_SIMPLE_SPELLS } from '../../src/game/WizardMarket.js';
import { pentagramScroll, figureIds } from '../../src/game/PentagramRules.js';
import { createRng } from '../../src/core/math.js';

const spells = (...names) => Object.fromEntries(names.map((n) => [n, true]));
const keysOf = (o) => knownScrollKeys(o);
const withKnown = (keys, fn) => { LOOT_FOR.known = (it) => scrollKnown(it, keys); try { return fn(); } finally { LOOT_FOR.known = null; } };

test('scrollKey: a spell by the scroll that teaches it, a drawing by its figure, the stat scrolls never', () => {
    assert.equal(scrollKey(spellScroll('Imperius')), 's:Imperius');
    assert.equal(scrollKey(spellScroll('AliveMaxima')), 's:' + teachKey('AliveMaxima'));
    assert.equal(scrollKey(pentagramScroll('night', 'u1')), 'p:night');
    assert.equal(scrollKey({ kind: 'scroll', stat: 'hp', amount: 3 }), null);
    assert.equal(scrollKey({ kind: 'scroll', stat: 'fatigue', amount: 3 }), null);
    assert.equal(scrollKey({ kind: 'bread' }), null);
});

test('the keys of what a hero knows: burnt scrolls, books, seen drawings', () => {
    const k = keysOf({ spells: spells('Imperius', 'Alive'), learned: new Set(['CreateWall']), pent: ['night', 'sight'] });
    for (const s of ['s:Imperius', 's:Alive', 's:CreateWall', 'p:night', 'p:sight']) assert.ok(k.has(s), s);
    assert.ok(!k.has('s:AvadaKedavra'));
    assert.ok(scrollKnown(spellScroll('Imperius'), k));
    assert.ok(!scrollKnown(spellScroll('AvadaKedavra'), k));
    assert.ok(!scrollKnown({ kind: 'scroll', stat: 'hp', amount: 1 }, k), 'a health scroll is never "known"');
});

test('a scroll already known never turns up again in a chest (thousands of chests)', () => {
    const known = keysOf({ spells: spells('LightningStrike', 'Thunderwave', 'AvadaKedavra', 'Imperius'), pent: ['devil', 'night'] });
    const r = createRng(11);
    withKnown(known, () => {
        for (let i = 0; i < 4000; i++) {
            const items = freshScrolls([rollScroll(r), ...rollLoot(r, { royal: true }), rollKeyItem(r)], r);
            for (const it of items) assert.ok(!scrollKnown(it, known), `repeat: ${scrollKey(it)}`);
        }
    });
});

test('the same chest gives different players different things: rolled for the one who opens it', () => {
    const a = keysOf({ spells: spells('LightningStrike') }), b = keysOf({ spells: spells('Thunderwave') });
    const items = () => [spellScroll('LightningStrike'), spellScroll('Thunderwave')];
    const forA = withKnown(a, () => freshScrolls(items(), createRng(5))), forB = withKnown(b, () => freshScrolls(items(), createRng(5)));
    assert.ok(!forA.some((it) => it.spell === 'LightningStrike'), 'A does not get what A knows');
    assert.ok(forA.some((it) => it.spell === 'Thunderwave') || forA.length === 2);
    assert.ok(!forB.some((it) => it.spell === 'Thunderwave'), 'B does not get what B knows');
    assert.ok(forB.some((it) => it.spell === 'LightningStrike'));
});

test('without a "known" test (Creative, a stranger) nothing is changed', () => {
    const items = [spellScroll('Imperius'), spellScroll('Alive')];
    assert.equal(freshScrolls(items, createRng(1)), items);
    assert.equal(items[0].spell, 'Imperius');
});

test('every scroll known: the places are taken by other plain things, never by a scroll', () => {
    const all = new Set();
    for (const [k] of SCROLL_WEIGHTS) { if (k.startsWith('pent:')) continue; if (k !== 'hp' && k !== 'fatigue') all.add('s:' + teachKey(k)); }
    for (const id of figureIds()) all.add('p:' + id);
    for (let i = 0; i < 60; i++) all.add('s:' + ['AvadaKedavra', 'Inspirius', 'Imperius', 'CreateHouse'][i % 4]);
    const r = createRng(3);
    withKnown(all, () => {
        for (let i = 0; i < 300; i++) {
            const items = freshScrolls([spellScroll('Imperius'), pentagramScroll('night', 'u'), spellScroll('Alive')], r);
            for (const it of items) assert.ok(!(it.kind === 'scroll' && (it.stat === 'spell' || it.stat === 'pentagram')), 'a known scroll is replaced');
        }
    });
});

test('a shop never sells a scroll the buyer knows: another one, else health / strength', () => {
    const known = keysOf({ spells: spells(...SHOP_SIMPLE_SPELLS) });
    const r = createRng(2);
    withKnown(known, () => {
        for (let n = 0; n < 200; n++) for (const trade of ['scrolls']) for (let k = 0; k < 3; k++) {
            const g = wizardGood(trade, k, n);
            assert.ok(!scrollKnown(g.item, known), 'the counter holds none the buyer knows');
            assert.ok(g.price > 0);
        }
        for (let i = 0; i < 300; i++) assert.ok(!scrollKnown(rollShopScroll(r), known));
    });
    // a partial knowledge: the unknown ones still turn up
    const part = keysOf({ spells: spells(...SHOP_SIMPLE_SPELLS.slice(1)) });
    const seen = new Set();
    withKnown(part, () => { for (let i = 0; i < 100; i++) { const it = freshShopScroll(spellScroll(SHOP_SIMPLE_SPELLS[1]), createRng(i), SHOP_SIMPLE_SPELLS); seen.add(scrollKey(it) || it.stat); } });
    assert.ok(seen.has('s:' + SHOP_SIMPLE_SPELLS[0]), 'the one spell not known is what replaces');
});

test('what the hero learns is kept: the save restores the same keys', () => {
    const before = keysOf({ spells: spells('Imperius'), learned: new Set(['CreateFloor']), pent: ['sight'] });
    const after = keysOf({ spells: JSON.parse(JSON.stringify(spells('Imperius'))), learned: new Set([...['CreateFloor']]), pent: JSON.parse(JSON.stringify(['sight'])) });
    assert.deepEqual([...before].sort(), [...after].sort());
});

test('the wiring: chests, ships, shops and the net all use the one test', async () => {
    const fs = await import('node:fs');
    const src = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    assert.match(src('src/game/Items.js'), /freshScrolls\(items, rng\)/, 'every chest (Items.lootChest)');
    assert.match(src('src/game/Ships.js'), /freshScrolls\(items\)/, 'a ship\'s chest');
    assert.match(src('src/game/Game.js'), /LOOT_FOR\.known = this\.knownScrollFn\(opener \? by : null\)/, 'the opener is who is asked');
    assert.match(src('src/game/Game.js'), /knownScrollFn\(by = null\) \{\n\s+if \(this\.config\?\.mode === 'creative'/, 'Creative: nothing is excluded');
    assert.match(src('src/net/NetSync.js'), /sk: this\._knownKeys\(\)/, 'a friend\'s knowledge goes with his state');
    assert.match(src('src/net/RemoteAvatar.js'), /this\.known = new Set/, 'and is kept for the chests he opens');
    assert.match(src('src/game/WizardShop.js'), /freshShopScroll/, 'shops');
});
