import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../../src/game/Game.js';
import { Servants } from '../../src/game/Servants.js';
import { NetSync } from '../../src/net/NetSync.js';

for (const [name, role, wizard] of [['житель', 'villager', false], ['рыцарь', 'knight', false], ['волшебник', 'master', true]]) {
    test(`«Брейнрот»: ${name} не подчиняется локально или по запросу гостя`, () => {
        const npc = { id: name, role, wizard, x: 0, y: 0, z: -5, dead: false, foe: 'other', path: ['old'] };
        const before = structuredClone(npc);
        let paid = 0, sent = 0, casts = 0;
        const g = {
            character: { head: { getWorldPosition: (out) => out.set(0, 2.4, 0) } },
            camera: { quaternion: new THREE.Quaternion() }, localId: 'me', zombies: [],
            castleLife: { targets: () => [npc], byId: new Map([[npc.id, npc]]) },
            combat: { check: () => null, pay: () => { paid++; } },
            hud: { setVoice() {} }, spells: { cast: () => { casts++; } },
            sync: { spell: () => { sent++; }, brainrot: () => { sent++; } },
            active: true,
        };
        g.servants = new Servants(g);
        assert.equal(Game.prototype._castBrainrot.call(g, true), null);
        assert.equal(paid, 0);
        assert.equal(casts, 0);
        assert.equal(sent, 0);
        const sync = Object.assign(Object.create(NetSync.prototype), { game: g, net: { isHost: true } });
        sync._onMessage({ t: 'brainrot', k: 'v', id: npc.id, from: 'guest' });
        assert.equal(npc.servantOf, undefined);
        assert.deepEqual(npc, before);
    });
}

test('«Брейнрот»: зомби, корова, лошадь и чужое живое дерево остаются доступными', () => {
    const cow = { id: 'cow', state: 'attack', group: { position: new THREE.Vector3() } };
    const horse = { id: 'horse', state: 'attack', group: { position: new THREE.Vector3() } };
    const tree = { id: 'tree', owner: 'other', master: 'other', group: { position: new THREE.Vector3() } };
    const brainrot = [];
    const g = {
        animals: { byId: new Map([['cow', cow], ['horse', horse]]) },
        livingTrees: { byId: new Map([['tree', tree]]) }, applyBrainrot: (id, by) => brainrot.push([id, by]),
    };
    const s = new Servants(g);
    assert.equal(s.make('z', 7, 'me'), true);
    assert.deepEqual(brainrot, [[7, 'me']]);
    for (const a of [cow, horse]) {
        assert.equal(s.make('a', a.id, 'me'), true);
        assert.equal(a.servantOf, 'me');
        assert.equal(a.state, 'graze');
    }
    assert.equal(s.make('t', 'tree', 'me'), true);
    assert.equal(tree.master, 'me');
    assert.equal(tree.owner, 'other');
});