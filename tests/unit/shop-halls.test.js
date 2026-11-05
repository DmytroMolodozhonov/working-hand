// Лавка зелий и лавка свитков поселения волшебников (поколение WIZ_SHOPS_FROM_GEN; автор 05.11): здания на настоящих блоках мира,
// проходы, полки, прилавок; цены (зелья 700…5000, котёл 500, колбы по 20, свитки — простые заклинания ≤ 50 маны, без чёрной магии);
// слова покупателя.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, WORLD_GEN, WIZ_SHOPS_FROM_GEN, BLOCK } from '../../src/world/Terrain.js';
import { HALL_RECTS } from '../../src/world/ShopHalls.js';
import { RECIPES } from '../../src/game/Potions.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { isDark } from '../../src/game/DarkMagic.js';
import { GOD_SPELLS, spellTitle } from '../../src/game/Mana.js';
import { START_SPELLS } from '../../src/game/SpellBook.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { potionPrice, scrollPrice, hallScrolls, manaOf, potionStock, scrollStock, parseHallWords, HALL_PRICE, POTION_PRICE, NOT_SOLD, countOf } from '../../src/game/ShopHallGoods.js';

const worlds = new Map();
function world(seed, wizShops = true) {
    const k = seed + ':' + wizShops;
    if (!worlds.has(k)) { const t = new TerrainData(); t.generate({ seed, mountains: true, wizShops }); worlds.set(k, t); }
    return worlds.get(k);
}

test('the version: the shops come with a new generation (old worlds keep their settlements)', () => {
    assert.ok(WORLD_GEN >= WIZ_SHOPS_FROM_GEN);
    const old = world(4242, false).villages.spawnVillage(), now = world(4242, true).villages.spawnVillage();
    assert.equal(old.halls.length, 0, 'an old world: no halls');
    assert.equal(now.halls.length, 3, 'a new world: the potion hall (with its ingredients’ room) and the scroll hall');
    assert.deepEqual(now.halls.map((h) => h.kind).sort(), ['ingredients', 'potions', 'scrolls']);
    for (const h of now.halls) assert.ok(now.stalls[h.stall].hall === h.kind, 'the hall has its stall (its keeper)');
    assert.equal(now.stalls.find((s) => s.hall === 'potions').cauldronPrice, 500);
});

test('the halls on the real blocks: doors open, every aisle walkable, the goods lie on boards, no house on their lots', () => {
    const t = world(4242);
    const s = t.villages.spawnVillage();
    const at = (x, L, z) => t.get(Math.round(x), L, Math.round(z));
    for (const h of s.halls) {
        const F = Math.round(h.room.y + 0.5); // (the floor block's layer: its top is the feet's y)
        // the walking points and every link between them: the floor under the feet, 4 m of air over it (the hero is 3.5 m)
        for (const [a, b] of h.links) {
            const A = h.walk[a], B = h.walk[b], n = Math.ceil(Math.hypot(A.x - B.x, A.z - B.z) * 3);
            for (let k = 0; k <= n; k++) {
                const x = A.x + (B.x - A.x) * k / n, z = A.z + (B.z - A.z) * k / n;
                assert.ok(at(x, F, z) !== BLOCK.AIR, `${h.kind}: a floor at the aisle ${a}–${b}`);
                for (let L = F + 1; L <= F + 4; L++) assert.equal(at(x, L, z), BLOCK.AIR, `${h.kind}: the aisle ${a}–${b} is clear at ${L - F} m (${Math.round(x)}, ${Math.round(z)})`);
            }
        }
        // the door: 5 wide, 6 high, from the street to the first walking point
        const d = h.door, i = h.walk[h.entry];
        for (let k = 0; k <= 10; k++) {
            const x = d.x + (i.x - d.x) * k / 10, z = d.z + (i.z - d.z) * k / 10;
            for (let L = F + 1; L <= F + 6; L++) assert.equal(at(x, L, z), BLOCK.AIR, `${h.kind}: the doorway is open (${L - F} m)`);
        }
        // the goods: on a board (a block under), air over (room for the thing)
        for (const q of [...h.slots, ...h.flasks, ...h.decor]) {
            const L = Math.round(q.y + 0.5);
            assert.ok(at(q.x, L, q.z) !== BLOCK.AIR, `${h.kind}: a board under a good`);
            assert.equal(at(q.x, L + 1, q.z), BLOCK.AIR, `${h.kind}: room over a good`);
            assert.ok(q.y - h.room.y >= 0.9 && q.y - h.room.y <= 7.1, 'a shelf from 1 m to 7 m');
        }
        // the goods for sale: in the hand's reach (≤ 3 m over the floor — the hero is 3.5 m tall)
        for (const q of [...h.slots, ...h.flasks]) assert.ok(q.y - h.room.y <= 3.05, `${h.kind}: a good for sale within reach (${(q.y - h.room.y).toFixed(1)} m)`);
        // the counter: 2 m high (a waist's height), its keeper behind it with room to stand
        const st = s.stalls[h.stall];
        assert.ok(Math.abs(st.counter.top - h.room.y - 2) < 0.01, 'the counter is 2 m high');
        for (let L = F + 1; L <= F + 4; L++) assert.equal(at(st.back.x, L, st.back.z), BLOCK.AIR, 'room behind the counter');
    }
    // no house of the settlement on the halls' lots
    const { x: X, z: Z, rot } = s;
    const local = (x, z) => { const dx = x - X, dz = z - Z; return rot === 0 ? [dx, dz] : rot === 1 ? [dz, -dx] : rot === 2 ? [-dx, -dz] : [-dz, dx]; };
    for (const hs of s.houses) {
        if (hs.civic) continue;
        const [u, v] = local(hs.c?.x ?? hs.door.x, hs.c?.z ?? hs.door.z);
        for (const R of Object.values(HALL_RECTS)) assert.ok(!(u > R.u0 - 2 && u < R.u1 + 2 && v > R.v0 - 2 && v < R.v1 + 2), `a house at (${u}, ${v}) on a hall's lot`);
    }
});

test('the potion hall: every potion of the world, priced 700…5000 by its might; a cauldron 500, a flask 20', () => {
    for (const r of RECIPES) {
        const p = potionPrice(r);
        assert.ok(p >= 700 && p <= 5000, `${r.id}: ${p}`);
        if (!NOT_SOLD.has(r.id)) assert.ok(POTION_PRICE[r.id], `${r.id} has its price in the table (a new recipe: add it to POTION_PRICE)`);
    }
    assert.ok(potionPrice('heal') < potionPrice('luck') && potionPrice('luck') < potionPrice('wings'), 'the mightier, the dearer');
    assert.equal(potionPrice({ id: 'new', ingredients: { a: 1, b: 1 } }) >= 700, true, 'a new recipe gets a price by itself');
    assert.equal(HALL_PRICE.CAULDRON, 500); assert.equal(HALL_PRICE.FLASK, 20);
    const h = world(4242).villages.spawnVillage().halls.find((x) => x.kind === 'potions');
    const stock = potionStock(h.slots, h.flasks);
    for (const r of RECIPES) {
        const n = stock.filter((e) => e.item.rec === r.id).length;
        if (NOT_SOLD.has(r.id)) assert.equal(n, 0, `${r.id}: never sold (the author)`); else assert.ok(n >= 3, `${r.id}: at least 3 on the shelves`);
    }
    assert.equal(POTION_PRICE.wings, 4800); assert.equal(POTION_PRICE.mermaid, 3800);
    assert.ok(stock.filter((e) => e.item.kind === 'flask').length >= 5, 'the flasks on their table');
    assert.ok(h.decor.length >= 100, 'the shelves are packed (the show of bottles)');
});

test('the scroll hall: only simple spells (≤ 50 mana a cast), no dark magic, no gods’, nothing known from the start; 700…5000', () => {
    const list = hallScrolls();
    assert.ok(list.length >= 30, `many scrolls (${list.length})`);
    for (const k of list) {
        assert.ok(manaOf(k) <= 50, `${k}: ${manaOf(k)} mana`);
        assert.ok(!isDark(k), `${k} is dark`);
        assert.ok(!GOD_SPELLS.has(k) && !START_SPELLS.has(k), k);
        const p = scrollPrice(k);
        assert.ok(p >= 700 && p <= 5000, `${k}: ${p}`);
    }
    for (const dark of ['AvadaKedavra', 'Alive', 'Accentric', 'Hellfire', 'Imperius']) assert.ok(!list.includes(dark), dark);
    for (const strong of ['Thunderwave', 'TotalDestruction', 'CircleAttack']) assert.ok(!list.includes(strong), `${strong} costs ${SPELL_COST[strong]}`);
    const h = world(4242).villages.spawnVillage().halls.find((x) => x.kind === 'scrolls');
    assert.equal(scrollStock(h.slots).length, list.length, 'every scroll has its place in the hall');
    assert.equal(scrollStock(h.slots, (sp) => sp === list[0]).length, list.length - 1, 'a scroll the stocker knows is left out');
});

test('the buyer’s words: every potion and every scroll is named; «да», «нет», «что есть», flasks by number, the cauldron', () => {
    for (const r of RECIPES) {
        const w = parseHallWords(`сколько стоит ${r.name.toLowerCase()}`, 'potions');
        assert.equal(w?.good?.rec, r.id, r.name);
        assert.ok(w.price);
    }
    for (const k of hallScrolls()) {
        const w = parseHallWords(`покажи свиток ${spellTitle(k)}`, 'scrolls', matchSpell); // (the spell's words as the voice hears them — matchSpell; or its title)
        assert.equal(w?.good?.spell, k, k);
    }
    assert.deepEqual(parseHallWords('да, беру', 'potions'), { do: 'yes' });
    assert.deepEqual(parseHallWords('нет, спасибо', 'potions'), { do: 'no' });
    assert.deepEqual(parseHallWords('что у вас есть?', 'scrolls'), { do: 'list' });
    assert.equal(parseHallWords('дай пять колб', 'potions').count, 5);
    assert.equal(parseHallWords('продайте 3 склянки', 'potions').good.kind, 'flask');
    assert.equal(parseHallWords('почём котёл', 'potions').good.kind, 'cauldron');
    assert.equal(countOf('пару колб'), 2);
    assert.ok(!parseHallWords('сколько стоит авада кедавра', 'scrolls', matchSpell)?.good, 'a dark spell is not a good of the shop (the keeper refuses it before the words — ShopHallLife.hear)');
    assert.deepEqual(parseHallWords('хочу купить', 'potions'), { do: 'pick' }, 'no good named: the words over the goods');
});
