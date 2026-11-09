import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Beds } from '../../src/game/Beds.js';
import { HouseMagic } from '../../src/game/HouseMagic.js';
import { BED } from '../../src/game/BedModels.js';
import { PLAYER_GROUND_OFFSET } from '../../src/entities/Character.js';

function fixture() {
    const messages = [], sent = [];
    const g = { authority: true, localId: 'H', dayCycle: true, world: { nightAmount: 1, setDayPhase() {} },
        keeper: { myKey: 'id:owner' }, net: { players: new Map([['guest', { pid: 'visitor', name: 'Same name' }]]) },
        combat: { dead: false }, character: { group: new THREE.Group(), leftLegPivot: new THREE.Group(), rightLegPivot: new THREE.Group() },
        hud: { setVoice: (s) => messages.push(s), toast: (s) => messages.push(s) },
        sync: { bed: (m) => sent.push(m) }, dayPhase: () => 0.9 };
    const magic = Object.create(HouseMagic.prototype);
    magic.game = g;
    magic.list = new Map([
        ['mine', { id: 'mine', owner: 'id:owner', rect: { x0: -5, x1: 5, z0: -5, z1: 5 } }],
        ['theirs', { id: 'theirs', owner: 'id:visitor', rect: { x0: 15, x1: 25, z0: -5, z1: 5 } }],
    ]);
    magic.plan = (rec) => rec;
    g.houseMagic = magic;
    const beds = new Beds(g), mine = { id: 'mineb0', x: 0, y: 0, z: 0, ry: 0 },
        theirs = { id: 'theirb0', x: 20, y: 0, z: 0, ry: 0 }, npc = { id: 'npcb0', x: 40, y: 0, z: 0, ry: 0, gen: true },
        outside = { id: 'outside', x: 60, y: 0, z: 0, ry: 0 };
    for (const b of [mine, theirs, npc, outside]) beds.list.set(b.id, b);
    return { g, beds, mine, theirs, npc, outside, messages, sent };
}

test('only the creator can lie down; NPC beds and loose beds outside a created home never trigger auto-lying', () => {
    const { beds, g, mine, theirs, npc, outside } = fixture();
    for (const b of [theirs, npc, outside]) {
        beds.lieDown(b);
        assert.equal(beds.lying, null);
        const on = new THREE.Vector3(b.x, b.y + BED.top + PLAYER_GROUND_OFFSET, b.z);
        assert.equal(beds._onBed(on), null);
        assert.equal(beds._bedAt(on), null);
    }
    // Being granted other privileges or having the same name cannot grant bed ownership.
    g.net.players.get('guest').name = 'owner';
    assert.equal(beds._ownHouse(mine, 'guest'), null);
    assert.equal(beds._ownHouse(theirs, 'guest').id, 'theirs');
    beds.lieDown(mine);
    assert.equal(beds.lying, mine.id);
    assert.equal(beds.home, null, 'lying down alone never registers respawn');
});

test('only completing the night commits the new home; lying by day or an interrupted night keeps the previous bed', () => {
    const { g, beds, mine, messages } = fixture();
    beds.lieDown(mine);
    beds._stillT = 3;
    beds._beginSleep(1234);
    beds._updateFade(2.1);
    assert.equal(beds.home, null);
    beds._updateFade(0.1);
    assert.equal(beds.home.id, mine.id);
    assert.equal(beds.home.slept, 1);
    assert.equal(beds.home.owner, 'id:owner');
    assert.equal(beds.home.house, 'mine');
    assert.ok(messages.some((s) => /Ночь проспана/.test(s)));
    beds.sleeping = null;
    const other = { ...mine, id: 'second', x: 2 };
    beds.list.set(other.id, other);
    beds.lieDown(other);
    assert.equal(beds.home.id, mine.id);
    beds._stillT = 3;
    beds._beginSleep(2345);
    beds.lying = null; // A real jump, death, destruction or flight interrupts participation.
    beds._updateFade(2.3);
    assert.equal(beds.home.id, mine.id);
    beds.sleeping = null;
    g.world.nightAmount = 0;
    beds.lieDown(other);
    beds._stillT = 10;
    beds._beginSleep(3456);
    beds._updateFade(2.3);
    assert.equal(beds.home.id, mine.id, 'daytime rest cannot register a bed');
});

test('a dead participant or a changed owner cannot register a home even when morning arrives', () => {
    for (const condition of ['death', 'ownership']) {
        const { g, beds, mine } = fixture();
        beds.lieDown(mine); beds._stillT = 3; beds._beginSleep(1234);
        if (condition === 'death') g.combat.dead = true;
        else g.houseMagic.list.get('mine').owner = 'id:someone-else';
        beds._updateFade(2.3);
        assert.equal(beds.home, null);
    }
});

test('save restore retains completed sleep, rejects old instant-bed saves, and validates ownership/destruction at respawn', () => {
    const { beds, mine, g } = fixture();
    beds.setHome(mine);
    assert.equal(beds.home, null, 'old saved instant claim is not evidence of a night');
    beds.setHome(mine, true);
    const saved = JSON.parse(JSON.stringify(beds.home));
    const next = new Beds(g);
    next.setHome(saved); // Player snapshots may arrive before the house records.
    assert.equal(next.home.id, mine.id);
    next.list.set(mine.id, mine);
    next._standSpot = () => ({ x: 3, y: 0, z: 0, ry: 0 });
    assert.equal(next.respawnSpot().spot.x, 3);
    next.list.delete(mine.id);
    assert.deepEqual(next.respawnSpot(), { gone: true });
    assert.equal(next.home, null);
    next.setHome(saved); next.list.set(mine.id, mine);
    g.houseMagic.list.get('mine').owner = 'id:someone-else';
    assert.deepEqual(next.respawnSpot(), { gone: true });
    assert.equal(next.home, null);
});

test('the host accepts sleep readiness only for a guest’s own home, including after connection id changes', () => {
    const { beds, g, mine, theirs, npc } = fixture();
    for (const bed of [mine.id, npc.id, 'missing']) {
        beds.onNet({ a: 'lie', from: 'guest', bed, ready: 1 });
        assert.equal(beds.others.has('guest'), false);
    }
    beds.onNet({ a: 'lie', from: 'guest', bed: theirs.id, ready: 1 });
    assert.equal(beds.others.get('guest').ready, true);
    g.net.players.set('reconnected', { pid: 'visitor', name: 'New name' });
    assert.equal(beds._ownHouse(theirs, 'reconnected').id, 'theirs');
    beds.onNet({ a: 'lie', from: 'guest', bed: null });
    assert.equal(beds.others.has('guest'), false);
});
