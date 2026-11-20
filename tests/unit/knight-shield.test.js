import test from 'node:test';
import assert from 'node:assert/strict';
import { CastleLife } from '../../src/game/CastleLife.js';
import { shieldReaction } from '../../src/game/KnightShield.js';

const knight = () => ({
    id: 'test:knight', x: 0, y: 0, z: 0, yaw: 0, foe: 'attacker', stance: 'stand', mode: 'block',
    model: { shield: {}, dropShield() { this.shield = null; } },
    shieldItem: { magic: false, max: 0 },
});
const bolt = (id, z = -12, by = 'attacker') => ({
    id, by, front: { x: 0, y: 2.5, z }, dir: { x: 0, y: 0, z: -Math.sign(z) },
});

test('a knight expects an active attacker and can miss a close or rear attack', () => {
    const v = knight();
    let warned = 0, surprised = 0;
    for (let i = 0; i < 300; i++) {
        warned += Number(!!shieldReaction(v, bolt('cast' + i), 15));
        surprised += Number(!!shieldReaction(v, bolt('cast' + i, -12, 'stranger'), 15));
        assert.equal(shieldReaction(v, bolt('cast' + i, -.5), 15), null);
        assert.equal(shieldReaction(v, bolt('cast' + i, 12), 15), null);
    }
    assert.ok(warned > surprised && warned < 300 && surprised > 0);
});

test('a shield in the stance takes the blow that breaks it; the next blow passes', () => {
    const life = Object.assign(Object.create(CastleLife.prototype), { game: {} });
    const v = knight(), from = { x: 0, z: -6 };
    assert.equal(life.wardOff(v, from, 'Jolt'), true);
    assert.ok(v.model.shield);
    assert.equal(life.wardOff(v, from, 'AvadaKedavra'), true);
    assert.equal(v.shieldGone, true);
    assert.equal(life.wardOff(v, from, 'Jolt'), false);
});

test('magic shield takes repeated spells according to its power', () => {
    const life = Object.assign(Object.create(CastleLife.prototype), { game: {} });
    const v = knight(), from = { x: 0, z: -6 };
    v.shieldItem = { magic: true, max: 28 };
    assert.equal(life.wardOff(v, from, 'AvadaKedavra'), true);
    assert.equal(v.shieldReserve, 3);
    assert.ok(v.model.shield);
    assert.equal(life.wardOff(v, from, 'AvadaKedavra'), true);
    assert.equal(v.shieldGone, true);
});
