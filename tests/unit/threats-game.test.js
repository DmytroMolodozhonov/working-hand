// Threats.js — the game side of the defence (19.11): a knight attacked by several players switches foe, a lone timid wizard runs from an army and does not turn back at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Threats, kindOfPerson } from '../../src/game/Threats.js';

function world(players) {
    const said = [], log = [];
    const L = {
        said, log,
        _playerPos: (id) => players[id] || null,
        lordOf: () => null,
        _say: (v, t) => said.push(t),
        alog: { decision: (v, t) => log.push(t) },
        _walkable: () => true,
    };
    const g = { localId: 'me', combat: { enabled: false }, castleLife: L, servants: null };
    return { g, L, said, log };
}
const person = (o = {}) => ({ id: 'k1', x: 0, y: 0, z: 0, hp: 40, maxHp: 40, armor: 0, role: 'knight', foe: null, dead: false, cs: { active: new Map(), hostile: new Map() }, ...o });

test('a knight with a foe is hit by another: the emergency change of foe; a harmless newcomer far away does not take him off', () => {
    const players = { p1: { x: 4, y: 2, z: 0 }, p2: { x: 25, y: 2, z: 0 } };
    const { g, log } = world(players);
    const T = new Threats(g); T.now = () => 10;
    const v = person(); v.cs.hostile.set('p1', Date.now() + 1e5); v.cs.hostile.set('p2', Date.now() + 1e5); v.cs.active.set(0, v);
    v.foe = 'p1';
    T.step(v, 1, { event: 'feed' });
    assert.equal(v.foe, 'p1', 'the near one stays');
    players.p2 = { x: 2.2, y: 2, z: 1.5 };              // p2 runs up and strikes him
    T.noteHit(v, 'p2', 5); T.now = () => 10.4;
    T.step(v, 1, { event: 'hit' });
    assert.equal(v.foe, 'p2', 'the one who struck him is the first now');
    assert.ok(log.some((t) => /решение/.test(t)), 'the decision is in the journal');
});

test('a timid wizard against an army: he runs (flee state, a shout), does not turn back for a while; a brave knight with friends stands', () => {
    const players = {}; const hostile = new Map();
    for (let i = 0; i < 8; i++) { players['p' + i] = { x: 6 + Math.cos(i) * 3, y: 2, z: Math.sin(i) * 3 }; hostile.set('p' + i, Date.now() + 1e5); }
    const { g, said } = world(players);
    const T = new Threats(g); T.now = () => 5;
    const w = person({ id: 'w1', role: 'student', wizard: true, rank: 'novice', hp: 18, maxHp: 20 }); w.cs.hostile = hostile; w.cs.active.set(0, w); w.foe = 'p0';
    const ran = T.step(w, 1, { event: 'feed' });
    assert.ok(ran, 'he decides to run'); assert.equal(w.stance, 'flee'); assert.equal(w.foe, null); assert.ok(w.fleeT > 5); assert.ok(said.length >= 1);
    assert.equal(T.mayEngage(w), false, 'not back at once');
    // a knight with five knights beside him: three attackers are not an army
    const players2 = { a: { x: 6, y: 2, z: 0 }, b: { x: 7, y: 2, z: 2 }, c: { x: 7, y: 2, z: -2 } };
    const W2 = world(players2); const T2 = new Threats(W2.g); T2.now = () => 5;
    const k = person({ foe: 'a' }); for (const id of ['a', 'b', 'c']) k.cs.hostile.set(id, Date.now() + 1e5);
    k.cs.active.set(0, k); for (let i = 1; i <= 5; i++) k.cs.active.set(i, person({ id: 'k' + (i + 1), x: 1 + i * 0.5, z: 2, foe: 'a' }));
    assert.ok(!T2.step(k, 1, { event: 'feed' })); assert.notEqual(k.stance, 'flee');
});

test('kinds of people map to the rules\' kinds', () => {
    assert.equal(kindOfPerson({ role: 'knight' }), 'knight');
    assert.equal(kindOfPerson({ wizard: true, rank: 'supermage' }), 'supermage');
    assert.equal(kindOfPerson({ element: 'fire' }), 'fire');
    assert.equal(kindOfPerson({ brawl: { def: { id: 'zombie' } } }), 'zombie');
    assert.equal(kindOfPerson({ role: 'farmer' }), 'villager');
});
