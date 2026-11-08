// The host decides a guest's blows: the people near a GUEST (far from the host) are targets (the author 08.11: a guest could not fight some wizards).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CastleLife } from '../../src/game/CastleLife.js';

const mk = (auth, remotes) => {
    const life = Object.create(CastleLife.prototype);
    Object.defineProperty(life, 'auth', { get: () => auth });
    life.game = { character: { group: { position: { x: 0, z: 0 } } }, remotes: new Map(remotes) };
    life.byId = new Map([['near', { id: 'near', x: 10, z: 5 }], ['far', { id: 'far', x: 900, z: 900 }], ['dead', { id: 'dead', x: 1, z: 1, dead: true }]]);
    return life;
};

test('targets: the host sees the people near himself AND near a guest', () => {
    const life = mk(true, [['g1', { dead: false, position: { x: 905, z: 897 } }]]);
    assert.deepEqual(life.targets(40).map((v) => v.id).sort(), ['far', 'near']);
});
test('targets: a guest asks only about the ones near himself; a dead guest adds nothing', () => {
    assert.deepEqual(mk(false, [['h', { position: { x: 900, z: 900 } }]]).targets(40).map((v) => v.id), ['near']);
    assert.deepEqual(mk(true, [['g1', { dead: true, position: { x: 900, z: 900 } }]]).targets(40).map((v) => v.id), ['near']);
});
