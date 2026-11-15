import test from 'node:test';
import assert from 'node:assert/strict';
import { fireVortexWords, airVortexWords } from '../../src/game/ElementVortexWords.js';
import { climbRate, airTarget, AIR_VORTEX as A } from '../../src/game/AirVortex.js';
import { blazeRadius, HELLFIRE_LITE } from '../../src/game/Hellfire.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('«Fire Vortex» / «Air Vortex» need both words; the element alone casts nothing', () => {
    for (const t of ['fire vortex', 'файр вортекс', 'файрвортекс', 'Фаер, вортекс!']) assert.ok(fireVortexWords(t), t);
    for (const t of ['air vortex', 'эйр вортекс', 'эйрвортекс']) assert.ok(airVortexWords(t), t);
    for (const t of ['fire', 'вортекс', 'air', 'хочу воздух', 'граунд вортекс']) { assert.ok(!fireVortexWords(t), t); assert.ok(!airVortexWords(t), t); }
    assert.equal(matchSpell('файр вортекс'), 'FireVortex');
    assert.equal(matchSpell('эйр вортекс'), 'AirVortex');
    assert.equal(matchSpell('граунд вортекс'), 'GroundVortex');
    assert.notEqual(matchSpell('fire'), 'FireVortex');
});
test('air vortex: up when looking up, down (to the hover height) when looking down, still level', () => {
    assert.ok(climbRate(0.9, 10) > 5);
    assert.equal(climbRate(0, 10), 0);
    assert.ok(climbRate(-0.9, 10) < -3);
    assert.equal(climbRate(-0.9, A.HOVER_MIN), 0, 'never lower than the hover height: he does not land');
    assert.equal(climbRate(0.9, A.CEILING), 0);
    assert.ok(climbRate(0.9, 10) > climbRate(0.4, 10), 'the higher the look the faster');
});
test('the hover floor is above the ground', () => {
    assert.ok(airTarget(10, 10, false) >= 10 + A.HOVER_MIN);
    assert.equal(airTarget(10, 30, false), 30);
});
test('fire vortex is the hellfire halved', () => {
    const big = blazeRadius(3), small = blazeRadius(3, null, true);
    assert.ok(small < big * 0.6 + 1e-9 && small >= 0.9);
    assert.equal(HELLFIRE_LITE.DMG, 0.5);
});
