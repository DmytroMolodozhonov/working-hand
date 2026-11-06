// Pharaoh Sandy's pyramids: his numbers and what hurts him (PharaohRules.js), the gold (PyramidItems.js), the chests (ItemTypes), the spawn spot, the achievement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHARAOH, pharaohDamage, locustMayBite } from '../../src/game/PharaohRules.js';
import { DARK_SPELLS } from '../../src/game/DarkMagic.js';
import { SPAWN_IDS } from '../../src/game/SpawnSpots.js';
import { ACHIEVEMENTS } from '../../src/game/Achievements.js';
import { rollPharaohLoot, rollPyramidLoot, itemValue, ITEM_INFO } from '../../src/game/ItemTypes.js';
import { JEWEL_SMALL, JEWEL_BIG, isJewel } from '../../src/game/PyramidItems.js';
import { BACK_KINDS } from '../../src/game/Inventory.js';

test('фараон: 250 HP, ачивка +150 ячеек, точка «У пирамид» в списке', () => {
    assert.equal(PHARAOH.HP, 250);
    const a = ACHIEVEMENTS.find((x) => x.id === 'pharaoh');
    assert.ok(a); assert.equal(a.mana, 150);
    assert.ok(SPAWN_IDS.includes('pyramids'));
});

test('фараон: тёмная магия вдвое слабее, «Nihilis» вдвое сильнее, божественное — полностью', () => {
    assert.equal(pharaohDamage('Stupefy', 10), 10);
    assert.equal(pharaohDamage('NihilisAtra', 10), 20);
    const dark = [...DARK_SPELLS][0];
    assert.equal(pharaohDamage(dark, 10), 5);
    assert.equal(pharaohDamage(dark, 10, true), 10);
});

test('саранча не кусает чаще, чем раз в COOL', () => {
    assert.equal(locustMayBite(0, PHARAOH.LOCUSTS.COOL - 0.1), false);
    assert.equal(locustMayBite(0, PHARAOH.LOCUSTS.COOL + 0.1), true);
    assert.equal(locustMayBite(undefined, 5), true);
});

test('золото пирамид: мелкое — в карман и дорого, крупное — в руках (на спину), у каждого цена и описание', () => {
    for (const k of JEWEL_SMALL) { assert.ok(isJewel(k) && ITEM_INFO[k]); assert.ok(itemValue({ kind: k }) >= 40); assert.ok(!BACK_KINDS.has(k)); }
    for (const k of JEWEL_BIG) { assert.ok(BACK_KINDS.has(k), k); assert.ok(itemValue({ kind: k }) >= 500, k); }
});

test('сундуки: у фараона три (маска, скарабеи, идол), обычные сундуки пирамид — украшения', () => {
    for (let i = 0; i < 3; i++) { const l = rollPharaohLoot(Math.random, i); assert.ok(l.length >= 3); assert.ok(l.some((x) => isJewel(x.kind)), `сундук ${i}`); assert.ok(l.every((x) => x.uid)); }
    assert.ok(rollPharaohLoot(Math.random, 0).some((x) => x.kind === 'goldMask'));
    assert.ok(rollPharaohLoot(Math.random, 2).some((x) => x.kind === 'goldIdol'));
    for (let n = 0; n < 40; n++) assert.ok(rollPyramidLoot(Math.random, n % 2 ? 'maze' : 'rooms').some((x) => JEWEL_SMALL.includes(x.kind)));
});
