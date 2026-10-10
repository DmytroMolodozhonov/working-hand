import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Duel } from '../../src/game/Duel.js';

test('duel: turning round with the arm out is no jerk of the hand (the hand is seen in the body\'s own turn)', () => {
    const group = new THREE.Group();
    const d = Object.create(Duel.prototype);
    d.jerk = { left: [], right: [] };
    d._t = 0;
    d.game = { character: { group, getHandWorldPosition: (side, out) => out.set(side === 'left' ? -0.6 : 0.6, 1.2, -2).applyQuaternion(group.quaternion).add(group.position) } };
    let jerked = false;
    for (let i = 0; i <= 9; i++) {
        group.rotation.y = (Math.PI / 2) * Math.min(1, i / 9); // a quarter turn in 0.3 s
        group.updateMatrixWorld();
        d._t = i / 30;
        d._trackHands();
        if (d._jerked('right')) jerked = true;
    }
    assert.equal(jerked, false);
});
