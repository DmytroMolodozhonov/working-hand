/**
 * A flame is stopped at the player's SHIELD, not 0.8 m from his middle (the author 14.11: «Протекшн должен сдерживать огонь, а он поджигает место, где я стою»).
 * The hand shield stops it 1.7 m from my middle, the dome of «Protection Maxima» 2.7 m: the flame's end — where the ground is lit — is out in front, never at my feet.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { streamStop } from '../../src/fx/InfernoStream.js';

const o = new T.Vector3(0, 2.5, 0), d = new T.Vector3(0, 0, -1);
test('the flame ends at the shield\'s reach in front of the player', () => {
    const me = { x: 0, y: 2.5, z: -12 };
    for (const [r, label] of [[0.8, 'old'], [1.7, 'hand shield'], [2.7, 'dome']]) {
        const s = streamStop(o, d, 30, { shields: [{ ...me, r }] });
        assert.equal(s.by, 'shield');
        assert.ok(Math.abs(s.t - (12 - r)) < 0.01, `${label}: flame length ${s.t.toFixed(2)} (≈ ${12 - r})`);
    }
    const dome = streamStop(o, d, 30, { shields: [{ ...me, r: 2.7 }] }), hand = streamStop(o, d, 30, { shields: [{ ...me, r: 1.7 }] });
    assert.ok(dome.t < hand.t, 'the dome holds it farther from me than the hand shield does');
});
test('a flame that does not point at the player is not stopped by his shield', () => {
    const s = streamStop(o, d, 30, { shields: [{ x: 9, y: 2.5, z: -12, r: 2.7 }] });
    assert.equal(s.by, null);
});
