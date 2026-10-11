import test from 'node:test';
import assert from 'node:assert/strict';
import { INFERNO, infernoReach, infernoDrain, flameRadius, raySphere, inStream, streamStop } from '../../src/fx/InfernoStream.js';
import { SPELL_COST, Combat } from '../../src/game/Combat.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

const O = { x: 0, y: 1, z: 0 };
const D = { x: 0, y: 0, z: -1 };

test('Inferno: costs 10 mana to start, then 3 a second while held', () => {
    assert.equal(SPELL_COST.Inferno, 10);
    assert.equal(INFERNO.DRAIN, 3);
    assert.equal(infernoDrain(1), 3);
    assert.equal(infernoDrain(0.5), 1.5);
    assert.equal(infernoDrain(-1), 0);
    assert.equal(matchSpell('инферно'), 'Inferno');
});

test('Inferno: a held flame drains mana; at 0 it goes out (Combat.drain)', () => {
    const g = { config: { mode: 'freeworld' }, hud: {}, character: {} };
    const c = Object.create(Combat.prototype);
    Object.assign(c, { game: g, enabled: true, dead: false, frozenLeft: 0, stunLeft: 0, fatigue: 4 });
    assert.equal(c.drain(3, 1), true);
    assert.equal(c.fatigue, 0, '3 drained and the +1/s regen taken too');
    assert.equal(c.drain(3, 1), false, 'no mana left: the flame goes out');
    c.enabled = false;
    c.fatigue = 0;
    assert.equal(c.drain(3, 1), true, 'outside the free world there is no mana rule');
});

test('Inferno: grows out in ~0.3 s and widens with distance', () => {
    assert.equal(infernoReach(0), 0);
    assert.ok(infernoReach(0.1) > 0 && infernoReach(0.1) < INFERNO.RANGE);
    assert.equal(infernoReach(INFERNO.GROW), INFERNO.RANGE);
    assert.equal(infernoReach(3), INFERNO.RANGE);
    assert.ok(flameRadius(20) > flameRadius(1));
});

test('Inferno: what is in the stream burns, what is beside it does not', () => {
    assert.ok(inStream(O, D, 20, { x: 0, y: 1, z: -10 }));
    assert.ok(!inStream(O, D, 20, { x: 4, y: 1, z: -10 }), 'off to the side');
    assert.ok(!inStream(O, D, 8, { x: 0, y: 1, z: -15 }), 'beyond its end');
    assert.ok(!inStream(O, D, 20, { x: 0, y: 1, z: 5 }), 'behind the hand');
});

test('Inferno: a water ball between stops it there; behind it nothing burns', () => {
    const ball = { x: 0, y: 1, z: -8, r: 0.6 };
    const s = streamStop(O, D, 22, { waters: [ball] });
    assert.equal(s.by, 'water');
    assert.ok(Math.abs(s.t - 7.4) < 1e-6);
    assert.ok(!inStream(O, D, s.t, { x: 0, y: 1, z: -12 }), 'the one behind the water is safe');
    // a ball off to the side does not stop it; a ball the flame starts inside neither
    assert.equal(streamStop(O, D, 22, { waters: [{ x: 3, y: 1, z: -8, r: 0.6 }] }).by, null);
    assert.equal(raySphere(O, D, { x: 0, y: 1, z: 0 }, 1), null);
});

test('Inferno: water blocks (river, sea) and walls stop it', () => {
    const blockAt = (x, y, z) => (z < -6 ? 'water' : null);
    const s = streamStop(O, D, 22, { blockAt });
    assert.equal(s.by, 'water');
    assert.ok(s.t > 5.9 && s.t <= 6.5);
    assert.equal(streamStop(O, D, 22, { blockAt: (x, y, z) => (z < -3 ? 'solid' : null) }).by, 'solid');
});

test('Inferno: a raised shield facing it stops the flame in front of the body', () => {
    const body = { x: 0, y: 1, z: -10, r: 0.8 };
    const s = streamStop(O, D, 22, { shields: [body] });
    assert.equal(s.by, 'shield');
    assert.ok(Math.abs(s.t - 9.2) < 1e-6);
    assert.ok(!inStream(O, D, s.t, body, 0.5), 'the one behind the shield is not burnt');
    assert.equal(streamStop(O, D, 22, { shields: [{ x: 5, y: 1, z: -10, r: 0.8 }] }).by, null, 'a shield aside does nothing');
});
