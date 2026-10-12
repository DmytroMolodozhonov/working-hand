// Food heals (ItemTypes.foodHeal): apple 3, golden apple 10, raw meat 5–10 by the animal, roasted ×2;
// a spell's fire roasts it too (Campfires.roastIn); in Survival it is the real health bar (Combat.heal).
import test from 'node:test';
import assert from 'node:assert/strict';
import { foodHeal, MEAT_HP } from '../../src/game/ItemTypes.js';
import { cookItem } from '../../src/game/Campfires.js';
import { Combat } from '../../src/game/Combat.js';

test('food: apple +3, golden apple +10, raw meat 5–10 by its animal, roasted twice as much', () => {
    assert.equal(foodHeal({ kind: 'redApple' }), 3);
    assert.equal(foodHeal({ kind: 'apple' }), 10);
    for (const from of Object.keys(MEAT_HP)) {
        const raw = foodHeal({ kind: 'meat', from });
        assert.ok(raw >= 5 && raw <= 10, `${from}: ${raw}`);
        const it = { kind: 'meat', from };
        assert.ok(cookItem(it));
        assert.equal(foodHeal(it), 2 * raw, from);
    }
    assert.ok(foodHeal({ kind: 'meat' }) >= 5, 'old meat (no animal) still feeds');
});

test('Combat.heal: never above the maximum, nothing when dead', () => {
    const c = Object.create(Combat.prototype);
    Object.assign(c, { hp: 15, maxHp: 20, dead: false });
    assert.equal(c.heal(3), 3);
    assert.equal(c.heal(10), 2);
    assert.equal(c.hp, 20);
    assert.equal(c.heal(5), 0);
    c.dead = true; c.hp = 0;
    assert.equal(c.heal(5), 0);
});
