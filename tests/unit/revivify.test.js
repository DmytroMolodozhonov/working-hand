import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Revivify } from '../../src/game/Revivify.js';
import { DEATH } from '../../src/game/Death.js';
import { SPELL_COST } from '../../src/game/SpellCosts.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('Revivify raises NPC bones for 1000 mana and leaves player bodies untouched', () => {
    const npc = { id: 'body', k: 'v', who: 'town:1', age: DEATH.BODY_S + 20, x: 0, y: 0, z: -10 };
    const hero = { ...npc, id: 'player', k: 'p', z: -5 };
    const bodies = new Map([[npc.id, npc], [hero.id, hero]]);
    const calls = [];
    const g = {
        authority: true, wandSide: () => 'right', castOrigin: () => new THREE.Vector3(0, .55, 0),
        character: { getHandDirection: (_, d) => d.set(0, 0, -1) },
        death: { bodies, removeBody: id => bodies.delete(id) },
        castleLife: { reviveVillager: b => (calls.push(b.who), true) },
        combat: { check: () => null, pay: name => calls.push(SPELL_COST[name]) }
    };
    const r = new Revivify(g);
    assert.equal(matchSpell('ревивифай'), 'Revivify');
    assert.equal(r.cast(false), null);
    assert.equal(r.cast(true), 'Revivify');
    assert.equal(r.cast(true), null);
    assert.deepEqual(calls, [npc.who, 1000]);
    assert.deepEqual([...bodies.keys()], [hero.id]);
});
