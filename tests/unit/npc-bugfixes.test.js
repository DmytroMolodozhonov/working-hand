import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WizardHome } from '../../src/game/WizardHome.js';
import { knowsFlight } from '../../src/game/WizardMind.js';
import { CastleLife } from '../../src/game/CastleLife.js';
import { Animals } from '../../src/game/Animals.js';
import { CreatureImpact, KINDS } from '../../src/game/CreatureImpact.js';
import { Duel, firstTouched } from '../../src/game/Duel.js';
import { animalModel } from '../../src/game/AnimalModels.js';
import { measureBody } from '../../src/game/AnimalHerd.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function home() {
    const ward = { id: 'site:hut', c: { x: 0, y: 0, z: 0 }, r: 13, hp: 70 };
    const house = { r: 6, door: { x: 0, y: 0, z: 8 } };
    const cs = { def: { id: 'hut', type: 'magehut', houses: [house] }, wardId: ward.id, hostile: new Map(), active: new Map() };
    const v = { id: 'mage', cs, wizard: true, W: {}, x: 0, y: 0, z: 0, mana: 100, fx: 0, sleep: true };
    cs.active.set(v.id, v);
    let changes = 0;
    const L = { castles: new Map([['hut', cs]]), _knows: () => true, _sees: () => true, _playerPos: () => ({ x: 25, y: 2, z: 0 }), night: { wake(v) { v.sleep = false; } }, _ground() {}, _goSpot(v, x, z) { v.x = x; v.z = z; return true; } };
    const g = { wards: { list: new Map([[ward.id, ward]]), _changed() { changes++; } } };
    const H = new WizardHome({ life: L, game: g });
    return { H, v, ward, L, g, changes: () => changes };
}

test('house alarm wakes its wizard and sends him OUT, with an intact ward still limiting combat positions', () => {
    const { H, v, ward } = home();
    H.attacked(ward, 'player');
    assert.equal(v.sleep, false);
    assert.equal(v.foe, 'player');
    assert.equal(H.step(v, 0.1), false, 'after reaching the door he can fight');
    assert.ok(v.z >= 8, 'out of the house');
    const p = H.spot(v, { x: 80, z: 0 });
    assert.ok(Math.hypot(p.x, p.z) < ward.r - 1);
    assert.deepEqual(H.spot(v, { x: 0, z: 0 }), { ...v.cs.def.houses[0].door, run: undefined }, 'combat never chooses a place back indoors');
});

test('intact protection: no chase when the attacker leaves, repairs spend mana; broken protection permits pursuit', () => {
    const { H, v, ward, L, g } = home();
    H.alarm(v, { x: 30, z: 0 }, 'player');
    H.step(v, 0.1);
    L._playerPos = () => null;
    v.foe = 'player';
    H.step(v, 7);
    assert.equal(v.foe, null);
    assert.equal(v.hunt, null);
    assert.ok(ward.hp > 70 && v.mana < 100, 'repairs are paid');
    assert.ok(Math.hypot(v.x, v.z) < ward.r);
    g.wards.list.clear();
    v.foe = 'player';
    assert.equal(H.step(v, 0.1), false);
    assert.equal(v.foe, 'player', 'ordinary pursuit may continue after the ward breaks');
    assert.deepEqual(H.spot(v, { x: 80, z: 0 }), { x: 80, z: 0 });
});

test('knight losing a target searches its LAST seen location, never the invisible player current position', () => {
    const L = Object.create(CastleLife.prototype);
    L._playerPos = () => null;
    const v = { foe: 'player', cs: { hostile: new Map([['player', Date.now() + 60000]]) }, lastFoe: { x: 10, y: 0, z: 20, by: 'player' } };
    L._fight(v, 0.1);
    assert.equal(v.foe, null);
    assert.equal(v.investigate.search, true);
    assert.equal(v.investigate.x, 10);
    assert.equal(v.investigate.z, 20);
});

test('a searching knight checks several places, then a companion, and eventually stops searching', () => {
    const L = Object.create(CastleLife.prototype);
    Object.assign(L, { game: { remotes: new Map() }, _playerPos: () => null, _ground() {}, fright: { keepOut: () => 0 } });
    const v = { idx: 1, x: 0, y: 0, z: 0, yaw: 0, lookT: 10, party: { members: [] }, investigate: { x: 0, z: 0, t: 35, search: true, origin: { x: 0, z: 0 }, probe: 0 } };
    const mate = { x: -10, y: 0, z: -10, dead: true };
    v.party.members = [v, mate];
    for (let n = 0; n < 4; n++) { const I = v.investigate; v.x = I.x; v.z = I.z; L._investigate(v, 2.1); }
    assert.equal(v.investigate.x, mate.x);
    assert.equal(v.investigate.z, mate.z);
    v.x = mate.x; v.z = mate.z;
    assert.equal(L._investigate(v, 2.1), false);
    assert.equal(v.investigate, null);
});

test('flight: weak and middle never, half of strong, tower head and Saviour always; stable across loads', () => {
    for (const rank of ['novice', 'adept']) for (let i = 0; i < 100; i++) assert.equal(knowsFlight('w' + i, rank), false);
    for (const rank of ['elder', 'teacher']) {
        let count = 0;
        for (let i = 0; i < 1000; i++) { const id = 'w' + i; const k = knowsFlight(id, rank); assert.equal(knowsFlight(id, rank), k); count += k; }
        assert.ok(count > 450 && count < 550, rank + ': ' + count);
    }
    assert.equal(knowsFlight('head', 'master'), true);
    assert.equal(knowsFlight('save', 'savior'), true);
});

test('a spell at the rider torso misses his horse; a spell at the horse torso still hits it', () => {
    const m = animalModel('horse');
    const horse = { type: 'horse', id: 1, model: m, group: m, dims: measureBody(m) };
    const D = Object.create(Duel.prototype);
    const e = { kind: 'a', id: 1, a: V(0, 0, 0), b: V(0, 0, 0) };
    D._roundBody('a', horse, e);
    const torso = e.a.y;
    assert.equal(firstTouched(V(-10, torso, 0), V(10, torso, 0), [e])?.body.id, 1);
    assert.equal(firstTouched(V(-10, 6.2, 0), V(10, 6.2, 0), [e]), null);
    assert.ok(e.r < 1.5, 'its length is never used as its hit radius');
});

test('death during an old living knockback: no false death doll; releasing the impact lays the body down again', () => {
    const A = Object.create(Animals.prototype);
    A.game = { creatureImpact: { ragDeath() {}, ragOf: () => true, deadRags: new Map() }, collision: { groundAt: () => 0 } };
    const a = { id: 1, type: 'horse', group: new THREE.Group() };
    assert.equal(A._ragDeath(a), false, 'a leftover pose cannot own the corpse');
    let laid = 0;
    const C = Object.create(CreatureImpact.prototype);
    C.deadRags = new Map(); C.game = { animals: { _layDown() { laid++; } } };
    a.isAnimal = true;
    C._release({ pivot: () => ({ obj: a.group, base: 0 }), head: () => null, arms: () => [], legs: () => [] }, a, {}, true);
    assert.equal(laid, 1);
});

test('a house without castle walls still uses the door/stair route, and repeated explosions do not restart it', () => {
    const { H, v, L } = home();
    v.cs.graph = { nodes: [{}, {}] }; v.cs.def.houses[0].doorNode = 1;
    let planned = 0, steps = 0;
    L._goTo = (v, node) => { assert.equal(node, 1); planned++; v.path = [0, 1]; };
    L._followPath = () => ++steps >= 3;
    H.alarm(v, { x: 25, z: 0 }, 'player');
    assert.equal(H.step(v, 0.1), true);
    H.alarm(v, { x: 25, z: 0 }, 'player');
    assert.equal(H.step(v, 0.1), true);
    assert.equal(H.step(v, 0.1), false);
    assert.equal(planned, 1, 'a new blast does not discard the path already being followed');
    assert.equal(v.z, 8);
});

test('an intact ward also blocks escaping route detours; a broken ward allows them', () => {
    const { H, v, g } = home(), before = { x: 10, y: 0, z: 0 };
    v.x = 14; v.path = [1]; v.speed = 5;
    H.keep(v, before);
    assert.equal(v.x, 10); assert.equal(v.path, null); assert.equal(v.speed, 0);
    g.wards.list.clear(); v.x = 14;
    H.keep(v, before);
    assert.equal(v.x, 14);
});
