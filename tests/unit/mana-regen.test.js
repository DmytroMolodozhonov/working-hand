import test from 'node:test';
import assert from 'node:assert/strict';
import { regenCellsK, regenTier, regenLine, REGEN_PER_100 } from '../../src/game/ManaRegen.js';

test('mana comes back 10 % faster for every 100 cells of the maximum (percentage points of the plain pace)', () => {
    assert.equal(regenCellsK(30), 1);
    assert.equal(regenCellsK(99), 1);
    assert.ok(Math.abs(regenCellsK(100) - 1.1) < 1e-9);
    assert.ok(Math.abs(regenCellsK(199) - 1.1) < 1e-9);
    assert.ok(Math.abs(regenCellsK(200) - 1.2) < 1e-9);
    assert.ok(Math.abs(regenCellsK(1000) - 2) < 1e-9);
    assert.equal(regenTier(undefined), 0);
    assert.equal(REGEN_PER_100, 0.1);
});

test('the hero is told when he reaches a new hundred (not at a load, not when the maximum falls)', async () => {
    const { Combat } = await import('../../src/game/Combat.js');
    const said = [];
    const c = Object.create(Combat.prototype);
    c.game = { hud: { setVoice: (t) => said.push(t) } };
    c.maxFatigue = 150;
    c._regenTierCheck(); // a first look (a world just loaded): no news
    assert.equal(said.length, 0);
    c.maxFatigue = 210; c._regenTierCheck();
    assert.equal(said.length, 1);
    assert.match(said[0], /200 ячеек/);
    assert.match(said[0], /20%/);
    c.maxFatigue = 30; c._regenTierCheck(); // death: silently down
    assert.equal(said.length, 1);
    c.maxFatigue = 120; c._regenTierCheck();
    assert.equal(said.length, 2);
    assert.equal(regenLine(1), '✨ Вы стали сильнее как маг: 100 ячеек маны — теперь мана восстанавливается на 10% быстрее');
});
