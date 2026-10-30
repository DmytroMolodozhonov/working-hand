// The Ice Queen's far blows FLY (src/game/QueenBolts.js): seen for ≥ 0.35 s, 24–56 m/s, stopped by a wall, hit on arrival.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOLT, boltSpeed, boltFlight, wallAlong, segDist, gustArrives } from '../../src/game/QueenBolts.js';
import { QUEEN_AI } from '../../src/game/IceGiants.js';

test('every freeze distance of hers: the bolt is in the air at least 0.35 s and never faster than 56 m/s', () => {
    for (let d = QUEEN_AI.FREEZE_MIN; d <= QUEEN_AI.FREEZE_MAX + 10; d += 1) {
        assert.ok(boltFlight(d) >= BOLT.SEEN - 1e-9, `${d} m: ${boltFlight(d)} s`);
        assert.ok(boltSpeed(d) <= BOLT.SPEED_MAX && boltSpeed(d) >= BOLT.SPEED_MIN);
    }
    assert.ok(boltSpeed(24) >= 40, 'the far shot is fast: 40–60');
});

test('a wall stops a bolt at the wall (a one-block wall is never jumped over)', () => {
    const wall = (x) => x >= 10 && x < 11; // one block thick
    const len = wallAlong((x) => wall(x), { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 30);
    assert.ok(len < 10.01 && len > 8.9, `stopped at ${len}`);
    assert.equal(wallAlong(() => false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 18), 18, 'clear: the whole way');
});

test('a body is hit when it is near the path the bolt flew — not before it arrives, not off to the side', () => {
    const a = { x: 0, y: 0, z: 0 }, b = { x: 0.8, y: 0, z: 0 };
    assert.ok(segDist(a, b, { x: 0.4, y: 0.5, z: 0.9 }) < BOLT.HIT_R, 'in its way');
    assert.ok(segDist(a, b, { x: 20, y: 0, z: 0 }) > BOLT.HIT_R, 'still far ahead: not yet');
    assert.ok(segDist(a, b, { x: 0.4, y: 0, z: 4 }) > BOLT.HIT_R, 'a step aside: a miss');
});

test('the gust arrives with its front: later for the far, never behind a wall', () => {
    assert.ok(gustArrives(5, 99) < gustArrives(15, 99));
    assert.equal(gustArrives(15, 8), Infinity, 'a wall at 8 m');
    assert.equal(gustArrives(BOLT.GUST_LEN + 2, 99), Infinity, 'out of reach');
    assert.ok(gustArrives(15, 99) >= 0.3, 'the blow is not at the moment of the cast');
});
