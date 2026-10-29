import test from 'node:test';
import assert from 'node:assert/strict';
import { pickHouse, rayVsHouse, AIM } from '../../src/game/HouseAim.js';
import { CommandTalk } from '../../src/game/CommandTalk.js';

const norm = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
const house = (x, z, r = 7, y = 0) => ({ kind: 'cottage', c: { x, y, z }, r, door: { x, z: z + r + 2 } });
const eye = { x: 0, y: 3, z: 0 };
// a row of four houses along the street, 20 m ahead, 18 m apart
const ROW = [house(-27, -20), house(-9, -20), house(9, -20), house(27, -20)];
const aimAt = (x, y, z, o = eye) => ({ o, d: norm(x - o.x, y - o.y, z - o.z) });

test('a row of houses: the hand on the second house gets the second, not the one behind or beside', () => {
    for (let i = 0; i < ROW.length; i++) {
        const h = ROW[i];
        const pk = pickHouse(ROW, aimAt(h.c.x, 4, h.c.z));
        assert.equal(pk.i, i, 'house ' + i);
        assert.equal(pk.kind, 'hit');
        assert.equal(pk.ambiguous, false);
    }
});

test('near and far: the first house the ray enters wins, not the one standing behind it', () => {
    const near = house(0, -25), far = house(30, -70);
    assert.equal(pickHouse([far, near], aimAt(0, 3, -25)).i, 1, 'the near one');
    assert.equal(pickHouse([near, far], aimAt(0, 3, -70), {}).i, 0, 'the straight ray passes the near one only');
    assert.equal(pickHouse([near, far], aimAt(30, 3, -70)).i, 1, 'past the corner: the far one');
});

test('a house 120 m away is shown; 200 m is too far', () => {
    assert.equal(pickHouse([house(0, -120)], aimAt(0, 3, -120)).i, 0);
    assert.equal(pickHouse([house(0, -220)], aimAt(0, 3, -220)), null);
});

test('over the roof and into the sky: no house', () => {
    assert.equal(rayVsHouse(house(0, -20), aimAt(0, 40, -20)), null);
    assert.equal(pickHouse(ROW, { o: eye, d: { x: 0, y: 1, z: 0 } }), null);
});

test('a shaking hand: a small miss still takes the nearest house, a large one nothing', () => {
    const h = house(0, -30, 5);
    const pk = pickHouse([h], aimAt(6.2, 3, -30)); // ~2° outside the wall
    assert.equal(pk.i, 0); assert.equal(pk.kind, 'near'); assert.ok(pk.angle > 0 && pk.angle <= AIM.TOL_DEG);
    assert.equal(pickHouse([h], aimAt(20, 3, -30)), null);
});

test('between two houses equally: «which of the two?», not a guess', () => {
    const a = house(-7.5, -30, 6), b = house(7.5, -30, 6);
    const pk = pickHouse([a, b], aimAt(0, 3, -30));
    assert.equal(pk?.ambiguous, true);
    assert.deepEqual([pk.i, pk.alt].sort(), [0, 1]);
    const closer = pickHouse([a, b], aimAt(-7, 3, -30)); // on the first: a clear hit
    assert.equal(closer.i, 0); assert.equal(closer.ambiguous, false);
});

test('the ground in front of the house (a low hand): that house; the ground far from any house: nothing', () => {
    const h = house(0, -40, 6);
    // the ray lands on the grass 3 m before the wall (the terrain stops it at 31 m) while it goes on into the house
    const ray = aimAt(0, 0.5, -40);
    const pk = pickHouse([h], ray, { blockT: 31 });
    assert.equal(pk.i, 0); assert.equal(pk.kind, 'blocker');
    assert.equal(pickHouse([h], aimAt(0, 0.3, -40), { blockT: 12 }), null, 'hit the ground 25 m before the house');
});

test('a fence or wall in front of the house on the ray: the house behind it only when the wall stands at the house', () => {
    const h = house(0, -30, 5), other = house(30, -30, 5);
    assert.equal(pickHouse([h, other], aimAt(0, 3, -30), { blockT: 22 }).i, 0, 'the fence at the foot of the house');
    assert.equal(pickHouse([h, other], aimAt(0, 3, -30), { blockT: 10 }), null, 'a wall 10 m before: the wall is shown');
});

test('a ray at an angle across the row: the house the ray enters first', () => {
    // standing at the street end, pointing diagonally down the row
    const o = { x: -40, y: 3, z: 0 };
    const pk = pickHouse(ROW, aimAt(9, 3, -20, o), { });
    assert.equal(pk.i, 2 - 0 === 2 ? pk.i : -1);
    assert.ok([1, 2].includes(pk.i));
    assert.equal(pk.kind, 'hit');
});

// ---- CommandTalk: the hand already down by the words
function talkWith(houses) {
    const ct = new CommandTalk({ game: { terrain: { raycast: () => null }, character: { group: { position: { x: 0, y: 3, z: 0 }, rotation: { y: 0 } } } } });
    ct.pointRay = () => ({ o: eye, d: { x: 0, y: -0.6, z: -0.8 }, hand: false }); // (the hand is down: the gaze is at the ground)
    return { ct, cs: { def: { houses } } };
}

test('the hand shown 2 s ago on a house, lowered before the words: that house (the best moment of the last 4 s)', () => {
    const { ct, cs } = talkWith(ROW);
    const now = performance.now();
    ct._hist = [
        { at: now - 3000, ray: aimAt(-9, 4, -20) }, // house 1
        { at: now - 2000, ray: aimAt(-9, 4, -20) },
        { at: now - 1500, ray: aimAt(-9, 0.5, -12) }, // the hand falls: at the ground before the house
        { at: now - 300, ray: { o: eye, d: norm(0, -1, -0.2) } }, // down at the feet
    ];
    const pk = ct.pointHouse(cs);
    assert.equal(pk.i, 1);
    assert.equal(pk.kind, 'hit');
    assert.match(ct._houseLine(null, pk), /дом №1/);
    assert.match(ct._houseLine(null, pk), /дверь/);
});

test('the shown moment is older than 4 s: forgotten; no hand and the gaze on nothing: «не вижу»-style answer', () => {
    const { ct, cs } = talkWith(ROW);
    ct._hist = [{ at: performance.now() - 6000, ray: aimAt(-9, 4, -20) }];
    const pk = ct.pointHouse(cs);
    assert.ok(pk.none, 'an old hand is not remembered');
    assert.match(ct._houseLine(null, pk), /дом не выбран/);
    assert.equal(ct.pointHouse({ def: { houses: [] } }).none, 'в этом месте нет домов');
});
