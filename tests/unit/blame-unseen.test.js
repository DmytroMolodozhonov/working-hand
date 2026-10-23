// An unseen blast (Бомбардо from a mountain): people panic, knights go to LOOK AT THE PLACE, nobody is named,
// nobody is wanted. Seen near the place / seen casting → the old reactions (Blame.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CastleLife } from '../../src/game/CastleLife.js';

function world({ me, sees = true, night = false }) {
    const L = Object.create(CastleLife.prototype);
    let cs;
    const g = { authority: true, localId: 'me', remotes: new Map(), isNight: night, character: { group: { position: new THREE.Vector3(me.x, me.y ?? 1.95, me.z) } }, collision: { lineOfSight: () => sees }, world: { terrain: { data: { sites: { near: () => [cs.def] } } } } };
    cs = { def: { id: 'c1', kind: 'castle', x: 0, z: 0, zone: 60, knights: 0 }, active: new Map(), hostile: new Map(), graph: { nodes: [], tagged: () => [] }, awake: true };
    const deeds = [], fright = [];
    Object.assign(L, {
        game: g, states: new Map(), castles: new Map([['c1', cs]]), byId: new Map(), said: [], enabled: true,
        fright: { add: (...a) => fright.push(a), keepOut: () => 0 },
        wizards: { danger() {} }, rebuild: { damaged() {} }, night: null,
    });
    L.breakWays = () => {}; L._ground = () => {}; L._goTo = () => {}; L._followPath = () => false; L._steer = () => {}; L._say = () => {}; L._runtime = () => cs; L.state = () => ({}); L.deed = (by, k) => deeds.push([by, k]);
    const add = (id, role, x, z) => { const v = { id, role, cs, x, y: 0, z, yaw: 0, hp: 10 }; cs.active.set(id, v); L.byId.set(id, v); return v; };
    return { L, cs, add, deeds, fright };
}

test('Bombardo from a mountain 200 m away: knights go to look, nobody is named, nobody wanted, nobody attacks', () => {
    for (const blocks of [0, 12]) {
        const { L, cs, add, deeds } = world({ me: { x: 0, z: -200 }, sees: false });
        const k = add('c1:1', 'knight', 0, 10), k2 = add('c1:2', 'knight', 20, 5), f = add('c1:3', 'farmer', 5, 5);
        L.damaged({ x: 0, y: 0, z: 0 }, 'me', blocks, true, { r: 6, kind: 'blast' });
        assert.ok(k.investigate && k.investigate.by == null && k2.investigate.by == null, 'they go to the place, no culprit');
        assert.ok(!k.foe && !k2.foe && !f.foe, 'no target');
        assert.equal(deeds.length, 0, 'wanted level does not grow');
        assert.ok(!(cs.hostile.get('me') > 0), 'not hostile');
        // on the way they do not see the player: back to their business
        k.investigate.t = 0.1; L._investigate(k, 0.2);
        assert.equal(k.investigate, null);
        assert.ok(!k.foe);
    }
});

test('the knight at the place does not catch a player he cannot see (far / dark) — but does one he really sees', () => {
    const far = world({ me: { x: 0, z: -35 }, sees: true, night: true }); // (35 m from the place, night: sight 14)
    const k = far.add('c1:1', 'knight', 0, 5);
    far.L.damaged({ x: 0, y: 0, z: 0 }, 'me', 0, true, { r: 6, kind: 'blast' });
    k.investigate.lookT = 0; k.lookT = 0;
    far.L._investigate(k, 0.1);
    assert.ok(!k.foe, 'not seen in the dark');
    const near = world({ me: { x: 0, z: -20 }, sees: true });
    const k2 = near.add('c1:1', 'knight', 0, 5);
    near.L.damaged({ x: 0, y: 0, z: 0 }, 'me', 0, true, { r: 6, kind: 'blast' });
    k2.lookT = 0;
    near.L._investigate(k2, 0.1);
    assert.equal(k2.foe, 'me', 'seen near the place by day: suspect, the guard goes for him');
});

test('a blast right in front of the guard that breaks walls: they know — wanted grows, the guard goes for the player', () => {
    const { L, add, deeds } = world({ me: { x: 0, z: -15 }, sees: true });
    const k = add('c1:1', 'knight', 0, 5);
    L.damaged({ x: 0, y: 0, z: 0 }, 'me', 8, true, { r: 6, kind: 'blast' });
    assert.equal(k.foe, 'me');
    assert.ok(deeds.length >= 1);
});

test('fright is not given the culprit (the frightened run from the thing itself)', () => {
    const { L, fright } = world({ me: { x: 0, z: -200 }, sees: false });
    L.damaged({ x: 0, y: 0, z: 0 }, 'me', 0, true, { r: 6, kind: 'blast' });
    L.alarm({ x: 0, y: 0, z: 0 }, 'quake', 'me', 6);
    assert.ok(fright.length >= 2 && fright.every(([, , o]) => !o.by));
});
