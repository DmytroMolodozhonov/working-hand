// «Inspirius» never goes through a creature or a ship: it bursts on what it touches, and what it
// touches is hurt and thrown (creatures) or torn open, dismasted and sunk (ships).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Inspirius, INSP } from '../../src/game/Inspirius.js';
import { Ships, INSP_SHIP } from '../../src/game/Ships.js';
import { buildLayout } from '../../src/game/ShipLayout.js';
import { ShipPose, ShipCollider } from '../../src/game/ShipCollision.js';
import { newShipState } from '../../src/game/ShipPhysics.js';
import { SHIP_CLASSES } from '../../src/game/ShipTypes.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

test('the ball bursts on a body in its way (a zombie at chest height, not only at the feet), not beyond it', () => {
    const body = { kind: 'z', id: 1, a: V(10, 0.2, 0), b: V(10, 1.9, 0), r: 0.45 };
    const g = { duel: { me: 'me', _bodies: () => [body] } };
    const I = new Inspirius(g);
    // a frame's flight that crosses the body (it would have flown on through it)
    const hit = I._touch(V(9.6, 1.5, 0), V(10.3, 1.5, 0), { mine: true });
    assert.ok(hit, 'it touched the body');
    assert.ok(hit.x < 10 && hit.x > 9.6 - 1e-6, `bursts at the near side of the body, x=${hit.x}`);
    // beside it: no
    assert.equal(I._touch(V(9.6, 1.5, 3), V(10.3, 1.5, 3), { mine: true }), null);
});

test('the burst hurts and throws a villager (knight), a zombie and an animal (the host)', () => {
    const log = [];
    const zombie = { group: { position: V(5, 0, 0) }, isDead: false };
    const knight = { x: -8, y: 0, z: 0, dead: false };
    const cow = { group: { position: V(0, 0, 12) }, dead: false };
    const g = {
        authority: true, localId: 'me',
        zombies: [zombie],
        castleLife: { byId: new Map([['k', knight]]), hit: (c, dmg) => log.push(['villager', dmg]), alarm: () => log.push(['alarm']), damaged() {} },
        animals: { list: [cow], hit: (c, dmg) => log.push(['animal', dmg]) },
        damageZombie: (z, dmg) => log.push(['zombie', dmg]),
        creatureImpact: { apply: (c, o) => log.push(['thrown', c === zombie ? 'zombie' : c === knight ? 'villager' : 'animal', o.v.length(), o.toss]) },
    };
    const I = new Inspirius(g);
    const b = I.explode(V(0, 0, 0), 'me');
    for (let i = 0; i < 60; i++) I._blast(b, 0.05);
    for (const k of ['zombie', 'villager', 'animal']) {
        assert.ok(log.some((e) => e[0] === k && e[1] === 100), `${k} hurt −100`);
        const th = log.find((e) => e[0] === 'thrown' && e[1] === k);
        assert.ok(th && th[2] > 10 && th[3] > 4, `${k} thrown hard`);
    }
    assert.ok(log.some((e) => e[0] === 'alarm'), 'the people are warned');
});

function fakeShips() {
    const events = [];
    const g = { authority: true, localId: 'me', hud: { setVoice() {} }, sync: { net: { send: (m) => events.push(m) } } };
    const S = Object.create(Ships.prototype);
    S.game = g;
    S.awake = new Set();
    S.crew = { provoke() {} };
    S.me = null;
    const L = buildLayout('fluyt');
    const pose = new ShipPose();
    pose.set(0, 0, 0, 0, 0, 0);
    const s = {
        id: 'ship1', cls: SHIP_CLASSES.fluyt, layout: L, pose, collider: new ShipCollider(L), st: newShipState(0, 0, 0), model: null, state: 'free',
        hp: SHIP_CLASSES.fluyt.hp, flood: 0, holes: [], fires: [], broken: new Set(), awake: true,
        sails: L.sails.map((sp) => ({ ...sp, open: 1, target: 1, fill: 0, side: 1, gust: 0, burnt: 0 })),
    };
    S.awake.add(s);
    return { S, s, L, events };
}

test('a ship stops the ball: its hull, its mast, an open sail', () => {
    const { S, L } = fakeShips();
    // across the side, under the deck
    const h = S.segmentHit(V(L.B, 1, 0), V(-L.B, 1, 0));
    assert.equal(h?.part, 'hull');
    // at a mast, high over the deck
    const m = L.masts[0];
    const mh = S.segmentHit(V(5, m.top - 3, m.z), V(-5, m.top - 3, m.z));
    assert.ok(mh && (mh.part === 'mast' || mh.part === 'sail'), `mast/sail: ${mh?.part}`);
    // far off: nothing
    assert.equal(S.segmentHit(V(80, 1, 0), V(70, 1, 0)), null);
});

test('a direct hit tears the hull open below the water line, breaks the mast near it, tears the sails — sent to all', () => {
    const { S, s, L, events } = fakeShips();
    const m = L.masts[0];
    const hp0 = s.hp;
    S.shock(V(0, L.deck + 3, m.z), 'other');
    assert.ok(s.hp < hp0 && s.hp === 0, 'the hull is wrecked');
    assert.ok(s.holes.length >= INSP_SHIP.HOLES, `holes: ${s.holes.length}`);
    assert.ok(s.holes.some((h) => !h.deck && h.ly < 0), 'a hole below the water line (the sea comes in)');
    assert.ok(s.broken.has(m.id), 'the mast is broken');
    const cut = s.collider.solids.find((b) => b.kind === 'mast' && Math.abs((b.z0 + b.z1) / 2 - m.z) < 0.01);
    assert.ok(cut.y1 < m.top - 3, 'nothing invisible where the mast stood');
    assert.ok(L.solids.some((b) => b.kind === 'mast' && b.y1 >= m.top - 0.01), 'the shared layout is untouched');
    assert.ok(s.sails.filter((x) => x.mast === m.id).every((x) => x.burnt >= 1), 'its sails are lost');
    for (const k of ['hole', 'mast', 'burnt']) assert.ok(events.some((e) => e.t === 'shipev' && e.k === k), `sent: ${k}`);
    assert.ok(Math.abs(s.st.roll) > 0.05 || Math.abs(s.st.pitch) > 0.05 || s.st.heave > 0.5, 'the ship is rocked');
});

test('a far burst only rocks and harms the ship (no hole)', () => {
    const { S, s } = fakeShips();
    S.shock(V(30, 2, 0), 'other');
    assert.equal(s.holes.length, 0);
    assert.equal(s.broken.size, 0);
    assert.ok(s.hp < SHIP_CLASSES.fluyt.hp);
    assert.ok(INSP.ORB_R > 0);
});
