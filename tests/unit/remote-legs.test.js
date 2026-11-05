/**
 * A friend's legs never go back on a guess of his camera (the author: «ноги друга выворачиваются назад, когда он подходит к
 * монитору — никогда не назад, в таком случае стоять»): the standard body's crouch swings both legs back, so a friend crouches
 * only as much as a real roof over him needs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { crouchOk } from '../../src/net/RemoteAvatar.js';

const open = { ceilingAt: () => Infinity };
const roof = (y) => ({ ceilingAt: () => y });
const pos = { x: 0, y: 12, z: 0 }; // feet at 10, head top at 14.75

test('in the open: a squat from the camera is not drawn — he stands', () => {
    assert.equal(crouchOk(1, pos, open), 0);
    assert.equal(crouchOk(0.4, pos, open), 0);
    assert.equal(crouchOk(1, pos, null), 0);
});

test('under a low roof: he bends as much as the roof needs, never more than he sent', () => {
    assert.ok(crouchOk(1, pos, roof(14.2)) > 0.5);
    assert.ok(crouchOk(0.3, pos, roof(13)) <= 0.3);
    assert.equal(crouchOk(1, pos, roof(20)), 0, 'a high ceiling: standing');
    assert.equal(crouchOk(0, pos, roof(13)), 0);
});
