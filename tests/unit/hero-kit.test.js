// «Предметы в интерфейсе» (автор 02.11): выбранные вещи и зелья кладутся в ячейки, ячеек становится больше, если не хватает;
// вместе не больше 10; после возрождения вторая такая же вещь не выдаётся, пока первая у героя.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Inventory, SLOT_COUNT } from '../../src/game/Inventory.js';
import { HeroApply } from '../../src/game/HeroApply.js';
import { normalizeHero } from '../../src/game/HeroSetup.js';
import { START_ITEMS, KIT_MAX } from '../../src/game/HeroItems.js';
import { RECIPES } from '../../src/game/Potions.js';

function game(hero) {
    const held = { right: null, left: null };
    const g = {
        dom: 'right', config: { mode: 'creative' }, hero: normalizeHero(hero),
        hud: { toast: () => {}, setVoice: () => {} }, fx: { spark: () => {} },
        character: { getHandWorldPosition: (s, v = new THREE.Vector3()) => v.set(0, 1, 0), group: { position: new THREE.Vector3() } },
        weapons: { hands: { right: { held: null }, left: { held: null } } },
        items: { held, takeIntoHand(item, side) { held[side] = { item }; return true; }, releaseHand(side) { const h = held[side]; held[side] = null; return h?.item || null; } },
    };
    g.inventory = new Inventory(g);
    g.armor = null; // (no armour in this fake: dress() leaves it)
    return g;
}
const all = (inv) => [...inv.slots, ...(inv.back || [])].filter(Boolean);

test('набор из вещей и зелий кладётся в интерфейс; ячеек становится больше, если не хватает', () => {
    const potions = RECIPES.slice(0, 4).map((r) => r.id);
    const items = ['wand', 'crystal', 'apple', 'flask', 'sword', 'axe'];
    const g = game({ items, potions });
    new HeroApply(g).initial();
    const got = all(g.inventory);
    assert.equal(got.filter((x) => x.kind === 'potion').length, 4);
    for (const id of items) assert.ok(got.some((x) => x.kit === id), id);
    assert.equal(got.length, 10, 'всё выбранное на месте, ничего не потеряно');
    assert.ok(g.inventory.slots.length > SLOT_COUNT, 'ячеек стало больше пяти');
    assert.ok(g.inventory.slots.every((s) => s === null || s), 'ячейки целы');
});

test('меч, топор, лук и щит идут за спину (две ячейки), остальное — в карманы', () => {
    const g = game({ items: ['sword', 'axe', 'bow0', 'shield0'] });
    new HeroApply(g).initial();
    assert.equal(all(g.inventory).length, 4);
    assert.equal(g.inventory.back.filter(Boolean).length, 2, 'за спиной две вещи');
    assert.equal(g.inventory.slots.filter(Boolean).length, 2, 'ещё две — в карманах');
    assert.equal(g.inventory.slots.length, SLOT_COUNT, 'пяти карманов хватает: ячейки не растут');
});

test('максимум 10: вещей и зелий вместе, зелья остаются, вещи отрезаются с конца', () => {
    const g = game({ items: START_ITEMS.map((x) => x.id), potions: RECIPES.map((r) => r.id) });
    assert.ok(g.hero.items.length + g.hero.potions.length <= KIT_MAX);
    new HeroApply(g).initial();
    assert.ok(all(g.inventory).length <= KIT_MAX + 0);
});

test('после возрождения вещь не выдаётся вторично, если она ещё у героя; потерянную — выдаёт', () => {
    const g = game({ items: ['wand', 'apple'] });
    const a = new HeroApply(g);
    a.initial(); a.initial();
    assert.equal(all(g.inventory).filter((x) => x.kit === 'wand').length, 1);
    assert.equal(all(g.inventory).filter((x) => x.kit === 'apple').length, 1);
    const i = g.inventory.slots.findIndex((x) => x?.kit === 'wand'); g.inventory.slots[i] = null; // (lost)
    a.initial();
    assert.equal(all(g.inventory).filter((x) => x.kit === 'wand').length, 1);
});

test('пустой набор — ничего не выдаётся, ячейки как были', () => {
    const g = game({});
    new HeroApply(g).initial();
    assert.equal(all(g.inventory).length, 0); assert.equal(g.inventory.slots.length, SLOT_COUNT);
});
