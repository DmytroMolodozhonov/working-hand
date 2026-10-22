// One damage for every creature: a player takes the same number as a villager (CLAUDE.md / the author:
// «Урон единый — для всех существ одинаковый; дальше всё решает ХП»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAMAGE, blastDamage } from '../../src/game/Damage.js';
import { bombardoDamage } from '../../src/game/Combat.js';
import { readFileSync } from 'node:fs';

test('the player table is gone: one number per spell', () => {
    const src = readFileSync(new URL('../../src/game/Combat.js', import.meta.url), 'utf8');
    assert.ok(!/PLAYER_DAMAGE/.test(src), 'no «damage to players» table');
    assert.equal(DAMAGE.Sapira, 10);
    assert.equal(DAMAGE.Lightning, 20);
    assert.equal(DAMAGE.AvadaKedavra, 25);
});

test('a blast hurts every body the same way', () => {
    for (const d of [0, 1, 2.5, 5]) assert.equal(bombardoDamage(d, 3.6, 1), blastDamage(d, 3.6, 1));
    assert.equal(blastDamage(0, 3.6, 1), DAMAGE.BlastPeak);
    assert.equal(blastDamage(0, 3.6, 3), DAMAGE.BlastPeak * 3);
    assert.equal(blastDamage(7, 3.6, 1), 0);
});

test('no place gives a player its own number', () => {
    const files = ['Duel.js', 'Hellfire.js', 'WaterVortex.js', 'Game.js'];
    for (const f of files) {
        const src = readFileSync(new URL(`../../src/game/${f}`, import.meta.url), 'utf8');
        assert.ok(!/PLAYER_DMG|PLAYER_HEAT|PLAYER_DAMAGE/.test(src), `${f}: a separate number for players`);
    }
});
