// Startle.js: a spell that missed, a comrade killed near — the people turn, look for who, fight or search.
// Death.dropHeld: what a dead creature held falls to the ground (a loose thing «Акцио» can take).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CastleLife } from '../../src/game/CastleLife.js';
import { STARTLE, segDist2, startleReaction } from '../../src/game/Startle.js';
import { DeathSystem, heldDrop } from '../../src/game/Death.js';

function life({ me = { x: 0, y: 1.95, z: 0 }, sees = true } = {}) {
    const L = Object.create(CastleLife.prototype);
    const g = { authority: true, localId: 'me', remotes: new Map(), isNight: false, character: { group: { position: new THREE.Vector3(me.x, me.y, me.z) } }, collision: { lineOfSight: () => sees } };
    Object.assign(L, { game: g, states: new Map(), castles: new Map(), byId: new Map(), said: [] });
    L._say = (v, t) => L.said.push([v.id, t]);
    const cs = { def: { id: 'c1', kind: 'castle' }, active: new Map(), hostile: new Map(), graph: { nodes: [] } };
    L.castles.set('c1', cs);
    const add = (id, role, x, z, extra = {}) => { const v = { id, role, cs, x, y: 0, z, yaw: 0, hp: 10, ...extra }; cs.active.set(id, v); L.byId.set(id, v); return v; };
    return { L, cs, add };
}

test('a charge flying close past a knight: he flinches, turns to it and goes to search where it came from', () => {
    const { L, add } = life({ me: { x: 0, y: 1.95, z: -80 } }); // (far: he doesn't see who)
    const k = add('c1:1', 'knight', 0, 0);
    const far = add('c1:2', 'knight', 0, 60); // (far from the charge: nothing)
    L.passBy(new THREE.Vector3(-5, 2.5, 1.5), new THREE.Vector3(5, 2.5, 1.5), 'me', { x: 0, y: 0, z: -80 });
    assert.ok(k.flinchT > 0, 'he flinches');
    assert.ok(k.investigate && k.investigate.z === -80 && k.investigate.by == null, 'he goes to look where it came from (no culprit named: nobody saw)');
    assert.ok(!far.flinchT && !far.investigate);
    assert.equal(k.foe, undefined, 'not seen: no fight yet');
});

test('the caster seen: the knight fights him; a farmer runs; the knights near hear the cry', () => {
    const { L, cs, add } = life({ me: { x: 0, y: 1.95, z: -15 } });
    const k = add('c1:1', 'knight', 0, 0), k2 = add('c1:3', 'knight', 6, 0);
    const f = add('c1:2', 'farmer', 2, 0);
    L.fright = { scare: (v) => { v.fear = { level: 2 }; } };
    L.passBy(new THREE.Vector3(-5, 2.5, 0.5), new THREE.Vector3(5, 2.5, 0.5), 'me', { x: 0, y: 0, z: -15 });
    assert.equal(k.foe, 'me');
    assert.ok(cs.hostile.get('me') > Date.now());
    assert.ok(f.fear, 'the farmer runs');
    assert.equal(k2.foe, 'me', 'the other knight comes');
});

test('a spell that does not hurt (Остолбеней…) on a wanderer far away: he still turns and searches', () => {
    const { L, add } = life({ me: { x: 0, y: 1.95, z: -70 } });
    const w = add('c1:1', 'wanderer', 0, 0, { wizard: true, W: {} });
    assert.ok(L.startle(w, 'me', { x: 0, y: 0, z: -70 }, { hit: true }));
    assert.ok(w.investigate && w.readyUntil > Date.now());
    assert.equal(startleReaction({ fights: true, knows: true }), 'fight');
    assert.equal(startleReaction({ fights: false, knows: false }), 'run');
});

test('a comrade killed beside him: the knight does not stand still — he searches, and cries out', () => {
    const { L, add } = life({ me: { x: 0, y: 1.95, z: -60 } });
    const dead = add('c1:1', 'knight', 0, 0);
    const k = add('c1:2', 'knight', 3, 0);
    L._comradeDown(dead, 'me');
    assert.ok(k.flinchT > 0 && k.investigate, 'he looks for the killer');
    assert.ok(L.said.some(([id]) => id === k.id));
});

test('segDist2: how close a charge passes', () => {
    assert.equal(segDist2(-1, 0, 0, 1, 0, 0, 0, 0, 3), 9);
    assert.equal(segDist2(0, 0, 0, 1, 0, 0, 3, 0, 0), 4);
    assert.ok(STARTLE.BOLT_R > 2);
});

test('death: the wand / the sword falls from the hand as a thing on the ground (Акцио takes it)', () => {
    const model = (tool) => ({ toolKind: tool, setHeldTool(k) { this.toolKind = k; } });
    const loose = [], swords = [];
    const g = { items: { auth: true, spawnLoose: (item, p, o) => loose.push({ item, p: p.clone(), vel: o.vel }) }, weapons: { byId: new Map(), spawn: (type) => { const w = { type }; swords.push(w); return w; }, markMagic: (w) => w } };
    const D = Object.create(DeathSystem.prototype);
    D.game = g;
    const wiz = { role: 'wanderer', wizard: true, x: 1, y: 0, z: 2, model: model('wand') };
    const d = D.dropHeld(wiz);
    assert.ok(d.kind === 'wand' && !d.staff, 'the wand');
    assert.equal(loose.length, 1);
    assert.ok(loose[0].p.y > 1, 'from the hand, it falls');
    assert.equal(wiz.model.toolKind, 'none');
    assert.equal(D.dropHeld(wiz), null, 'never twice');
    // a knocked-out wand is not dropped again
    assert.equal(heldDrop({ model: model('wand'), noWand: true }), null);
    const knight = { role: 'knight', x: 0, y: 0, z: 0, model: model('sword') };
    D.dropHeld(knight);
    assert.equal(swords.length, 1);
    assert.ok(knight.disarmed);
    assert.equal(heldDrop({ model: model('hoe') }), null, 'no such thing in the world: goes with the body');
});

test('the road folk: about a third are brave and fight (fists too) — the rest run', async () => {
    const { roadBrave } = await import('../../src/game/Travelers.js');
    let n = 0;
    for (let i = 0; i < 1000; i++) if (roadBrave({ entry: { seed: (i * 2654435761) >>> 0 } })) n++;
    assert.ok(n > 200 && n < 500, `brave: ${n} of 1000`);
    assert.equal(roadBrave({ entry: { seed: 0 }, brave: 0.9, elder: true }), false, 'not an old one');
});

test('a knight killed: his plates fall by the body — and the body lies without them (no double)', async () => {
    const { ArmorSystem: Armor } = await import('../../src/game/Armor.js');
    const A = Object.create(Armor.prototype);
    A.game = { authority: true };
    let restyled = 0;
    A._restyle = (v) => { restyled++; v.stripped = true; };
    const v = { role: 'knight', armor: 30, maxArmor: 50, dead: true, model: { setHeldTool() {}, update() {}, isDeadDone: true } };
    const loot = A.villagerLoot(v);
    assert.equal(loot.length, 3);
    assert.equal(restyled, 1, 'the lying body is made without the steel');
    assert.equal(v.armor, 0);
    assert.equal(A.villagerLoot(v).length, 0, 'never twice');
});
