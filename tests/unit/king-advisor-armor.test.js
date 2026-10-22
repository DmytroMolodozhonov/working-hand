import test from 'node:test';
import assert from 'node:assert/strict';
import { ArmorSystem } from '../../src/game/Armor.js';
import { STATS } from '../../src/game/CastleLife.js';
import { VillagerModel, villagerLook, strippedLook } from '../../src/entities/VillagerModel.js';

const armor = Object.create(ArmorSystem.prototype);

test('king: full magic set, much sturdier than a knight', () => {
    assert.ok(STATS.king.armor >= STATS.knight.armor * 3);
    assert.equal(villagerLook(1, 'king').magic, true);
    const loot = armor._villagerSteel({ role: 'king', magicPieces: ['helmet', 'chest', 'legs'], armor: 200, maxArmor: 200 });
    assert.deepEqual(loot.map((i) => i.piece), ['helmet', 'chest', 'legs']);
    assert.ok(loot.every((i) => i.magic));
});

test('advisor: no helmet, magic chest and legs only; knights stay plain', () => {
    const loot = armor._villagerSteel({ role: 'advisor', magicPieces: ['chest', 'legs'], armor: 40, maxArmor: 40 });
    assert.deepEqual(loot.map((i) => i.piece), ['chest', 'legs']);
    assert.ok(loot.every((i) => i.magic));
    const plain = armor._villagerSteel({ role: 'knight', armor: 50, maxArmor: 50 });
    assert.equal(plain.length, 3);
    assert.ok(plain.every((i) => !i.magic));
    assert.ok(STATS.advisor.armor > 0 && STATS.advisor.armor < STATS.king.armor);
});

test('king / advisor models build, with and without the armour', () => {
    const adv = { ...villagerLook(3, 'merchant', false), advisor: true, magicChest: true, magicLegs: true, hat: 'chancellor', hatColor: 0x6a1233 };
    for (const L of [villagerLook(2, 'king'), adv, strippedLook(adv), strippedLook(villagerLook(2, 'king'))]) {
        const m = new VillagerModel(L, { castleColor: 0x8e2b2b });
        m.update(1 / 60, { mode: 'idle' });
        m.setFar(true);
        m.dispose();
    }
    assert.equal(strippedLook(adv).magicChest, false);
    assert.equal(strippedLook(adv).hat, 'chancellor');
});
