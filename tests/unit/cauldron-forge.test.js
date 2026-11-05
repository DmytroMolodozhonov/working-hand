/**
 * «Create a Cauldron» (the author 05.11): three metal armour pieces (any: magic or not, the same too) pointed at on the ground or held in
 * the slots — they fly up, glow, melt, and a cauldron is cast out of their metal; then it is a real cauldron. A robe is cloth: not metal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CauldronForge, FORGE, isForgeMetal } from '../../src/game/CauldronForge.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

function fakeGame({ ground = [], slots = [], creative = false } = {}) {
    const loose = new Map();
    for (const [i, it] of ground.entries()) { const model = new THREE.Group(); model.position.set(5 + i * 0.5, 0.3, 0); loose.set('u' + i, { item: { uid: 'u' + i, ...it }, model }); }
    const spawned = [];
    const g = {
        localId: 'me', authority: true, config: { mode: creative ? 'creative' : 'survival' }, scene: new THREE.Scene(),
        character: { group: { position: new THREE.Vector3(0, 2, 0), rotation: { y: Math.PI / 2 } } },
        builder: { _hand: () => ({ o: new THREE.Vector3(0, 3, 0), d: new THREE.Vector3(1, -0.55, 0).normalize() }) },
        terrain: { raycast: () => ({ x: 5.5, y: 0, z: 0 }) },
        collision: { groundY: () => 0 },
        items: { loose, removeLoose: (uid) => { const L = loose.get(uid); loose.delete(uid); return L?.item; } },
        inventory: { slots, take: (s, n) => { const i = slots.indexOf(s); if (i >= 0) slots[i] = null; } },
        cauldrons: { list: new Map(), spawn: (rec) => { spawned.push(rec); return rec; }, _send() {} },
        hud: { setVoice() {} },
    };
    return { g, spawned };
}
const run = (F, s) => { for (let t = 0; t < s; t += 1 / 30) F.update(1 / 30); };

test('three armour pieces on the ground: taken, melted, a real cauldron stands where they were', () => {
    const { g, spawned } = fakeGame({ ground: [{ kind: 'armor', piece: 'helmet' }, { kind: 'armor', piece: 'helmet', magic: true }, { kind: 'armor', piece: 'legs' }, { kind: 'apple' }] });
    const F = new CauldronForge(g);
    assert.equal(F.cast(), null);
    assert.equal([...g.items.loose.values()].filter((L) => L.item.kind === 'armor').length, 0, 'the armour is used up');
    assert.equal(g.items.loose.size, 1, 'the apple stays');
    assert.equal(F.list.length, 1);
    run(F, 3);
    assert.equal(spawned.length, 0, 'still being cast');
    run(F, 6);
    assert.equal(spawned.length, 1); assert.ok(Math.abs(spawned[0].x - 5.5) < 1e-6);
    assert.equal(F.list.length, 0); assert.equal(g.scene.children.length, 0, 'the look is gone');
});

test('from the slots; too few → a hint and nothing taken; a robe is no metal; Creative needs none', () => {
    const slots = [{ kind: 'armor', piece: 'chest' }, { kind: 'robe' }, { kind: 'armor', piece: 'chest' }, null, null];
    const a = fakeGame({ slots });
    const F = new CauldronForge(a.g);
    assert.match(F.cast(), /3 металлических доспеха/);
    assert.equal(slots.filter(Boolean).length, 3, 'nothing taken');
    slots[3] = { kind: 'armor', piece: 'legs' };
    assert.equal(F.cast(), null);
    assert.deepEqual(slots.filter(Boolean).map((s) => s.kind), ['robe'], 'the three armour pieces are used, the robe stays');
    assert.ok(!isForgeMetal({ kind: 'robe' }) && isForgeMetal({ kind: 'armor', magic: true }));
    const c = fakeGame({ creative: true });
    assert.equal(new CauldronForge(c.g).cast(), null, 'Creative: no armour needed');
});

test('the words', () => {
    for (const t of ['Create a Cauldron', 'крейт э колдрон', 'криейт э кодрон']) assert.equal(matchSpell(t), 'CreateCauldron', t);
    for (const t of ['котёл', 'какой красивый котёл', 'Create a Boat']) assert.notEqual(matchSpell(t), 'CreateCauldron', t);
    assert.ok(FORGE.NEED === 3);
});
