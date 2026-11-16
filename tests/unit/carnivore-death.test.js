// Смерть плотоядной головы: стиль по причине (огонь / взрыв / удар), без падений.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deathStyle } from '../../src/game/Plants.js';

test('стиль смерти зависит от причины', () => {
    assert.equal(deathStyle('Fire'), 'fire');
    assert.equal(deathStyle('Inferno'), 'fire');
    assert.equal(deathStyle('Bombarda'), 'blast');
    assert.equal(deathStyle('explosion'), 'blast');
    assert.equal(deathStyle('sword'), 'cut');
    assert.equal(deathStyle(undefined), 'cut');
});
