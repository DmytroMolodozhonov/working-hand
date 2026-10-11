/**
 * New herds never pop up next to the player or in sight: far away (75–115 m), behind
 * where the player looks, rarely, and small.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Animals, HERDS, outOfSight } from '../../src/game/Animals.js';
import { BLOCK } from '../../src/world/Terrain.js';

test('a new herd appears far away and behind the player, a few animals at a time, and rarely', () => {
    const me = new THREE.Vector3(10, 0, 20);
    const look = new THREE.Vector3(0, 0, -1);
    const spots = [];
    const fake = {
        game: { character: { group: { position: me } }, terrain: { data: { topLayer: () => 1, get: (x, L) => (L === 1 ? BLOCK.GRASS : 0) } }, remotes: new Map() },
        _look: (out) => out.copy(look),
        _unseenByOthers: Animals.prototype._unseenByOthers,
        spawnHerdAt: (type, n, x, z) => spots.push({ n, x, z }),
    };
    for (let i = 0; i < 300; i++) Animals.prototype._spawnHerd.call(fake);
    assert.ok(spots.length > 200, 'herds do appear');
    for (const s of spots) {
        const d = Math.hypot(s.x - me.x, s.z - me.z);
        assert.ok(d >= HERDS.MIN_D && d <= HERDS.MAX_D, `far away (${d.toFixed(0)} m)`);
        assert.ok(outOfSight(me, look, s.x, s.z), 'never where the player looks');
        assert.ok((s.z - me.z) > 0 || Math.abs(s.x - me.x) > 60, 'behind the player');
        assert.ok(s.n >= 2 && s.n <= 5, 'a small herd');
    }
    assert.ok(HERDS.EVERY >= 60 && HERDS.MAX_NEAR <= 8, 'rarely, and not many around');
    assert.ok(HERDS.GONE > HERDS.MAX_D + 50, 'a herd is not removed right where new ones appear');
});
