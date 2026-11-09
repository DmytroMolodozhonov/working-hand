import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ItemSystem } from '../../src/game/Items.js';
import { CastleTalk } from '../../src/game/CastleTalk.js';
import { NetSync } from '../../src/net/NetSync.js';

function market(authority, mage = true) {
    const g = { authority, active: true, localId: authority ? 'H' : 'guest', scene: new THREE.Scene(),
        character: { group: new THREE.Group() }, weapons: { weapons: [] }, hud: { setVoice() {} } };
    g.character.group.position.set(authority ? 5000 : 1, 4, authority ? 5000 : 5);
    g.items = new ItemSystem(g);
    const stall = { magic: mage, counter: { x0: 0, x1: 5, z0: 0, z1: 2, top: 2 }, front: { x: 2, z: 5 } };
    const def = { id: 'hv_test', kind: 'hamlet', mage, stalls: [stall] };
    const cs = { def, awake: true, hostile: new Map() };
    const v = { id: 'hv_test:1', cs, role: mage ? 'seller' : 'merchant', entry: { stall: 0 }, x: 2, z: -1, talkedAt: -10000 };
    const talk = Object.create(CastleTalk.prototype), said = [];
    talk.game = g;
    talk.life = { castles: new Map([[def.id, cs]]), byId: new Map([[v.id, v]]) };
    talk.stalls = new Map([['hv_test:s0', { goods: ['good'] }]]);
    talk._labelOff = new Set();
    talk._unpaid = () => [];
    talk._sayReply = (_v, text) => said.push(text);
    talk._sayForGuestOrMe = (_v, _by, text) => said.push(text);
    g.castleLife = { talk };
    const sync = Object.create(NetSync.prototype); sync.game = g;
    g.sync = sync;
    return { g, talk, v, said, sync };
}

function peers(mage = true) {
    const host = market(true, mage), guest = market(false, mage), packets = [];
    const wire = m => JSON.parse(JSON.stringify(m));
    host.sync.net = { isHost: true, localId: 'H', send(m) { packets.push(wire(m)); guest.sync._onMessage(wire(m)); } };
    guest.sync.net = { isHost: false, localId: 'guest', send(m) { host.sync._onMessage({ ...wire(m), from: 'guest' }); } };
    return { host, guest, packets };
}

for (const mage of [false, true]) test(`a guest can buy at a hamlet counter while the host stands far away (magic settlement: ${mage})`, t => {
    t.mock.method(performance, 'now', () => 20000);
    const { host, guest, packets } = peers(mage);
    try {
        const pos = new THREE.Vector3(1, 2.3, 1);
        // The guest puts money down; production ithrow/inew carries its initial nonzero velocity to the guest.
        guest.sync.itemThrow({ kind: 'coins', magic: mage, uid: 'purse', count: 100 }, pos, new THREE.Vector3(0, -0.8, 0));
        const money = host.g.items.loose.get('purse');
        host.g.items.spawnLoose({ kind: 'redApple', uid: 'good', shop: { stall: 'hv_test:s0', price: 30 } }, new THREE.Vector3(3, 2.3, 1));
        assert.ok(guest.g.items.loose.get('purse').vel.lengthSq() > 0.05);
        assert.equal(guest.talk._counterCoins(guest.v.cs.def, 0).length, 0, 'moving money is not accepted');
        // Host physics has landed the pouch. Its last update must include the rest flag, even when sent only once.
        money.vel.set(0, 0, 0); money.rest = true;
        host.g.items._netT = 0; host.g.items._netSend(1);
        assert.ok(packets.find(m => m.t === 'ipos').l.some(row => row[0] === 'purse' && row[4] === 1));
        const visible = guest.g.items.loose.get('purse');
        for (let i = 0; i < 90; i++) guest.g.items._physics(visible, 1 / 60);
        assert.equal(visible.vel.lengthSq(), 0); assert.equal(visible.rest, true);
        guest.talk._watchMarket();
        assert.ok(guest.said.some(s => s.includes('Что желаешь купить')));
        assert.equal(guest.talk._payByName(guest.v, 'красное яблоко'), true);
        assert.equal(host.g.items.loose.get('good').item.shop.paid, true);
        assert.equal(guest.g.items.loose.get('good').item.shop.paid, true, 'the guest can take the paid good');
        assert.equal(host.g.items.loose.has('purse'), false);
        host.talk._flushChange(1);
        const change = [...guest.g.items.loose.values()].filter(L => L.item.kind === 'coins');
        assert.equal(change.length, 1); assert.equal(change[0].item.count, 70);
        guest.talk._watchMarket();
        assert.equal(guest.said.filter(s => s.includes('Что желаешь купить')).length, 1, 'no new question about change');
    } finally { host.g.items.dispose(); guest.g.items.dispose(); }
});

test('greeting cooldown delays the purchase question instead of permanently swallowing it', t => {
    let now = 20000;
    t.mock.method(performance, 'now', () => now);
    const { host, guest } = peers();
    try {
        host.g.items.spawnLoose({ kind: 'coins', uid: 'purse', count: 80 }, new THREE.Vector3(1, 2.3, 1));
        guest.v.talkedAt = now;
        guest.talk._watchMarket();
        assert.equal(guest.said.length, 0);
        now += 6100;
        guest.talk._watchMarket(); guest.talk._watchMarket();
        assert.equal(guest.said.filter(s => s.includes('Что желаешь купить')).length, 1);
    } finally { host.g.items.dispose(); guest.g.items.dispose(); }
});

test('guest interpolation measures motion for old position packets too, and a later host movement wakes a resting item', () => {
    const { host, guest } = peers();
    try {
        host.g.items.spawnLoose({ kind: 'coins', uid: 'purse', count: 80 }, new THREE.Vector3(1, 3, 1), { vel: new THREE.Vector3(0, -5, 0) });
        const L = guest.g.items.loose.get('purse');
        guest.g.items.applyPositions([['purse', 1, 2.3, 1]]);
        for (let i = 0; i < 120; i++) guest.g.items._physics(L, 1 / 60);
        assert.ok(L.vel.lengthSq() < 0.05);
        guest.g.items.applyPositions([['purse', 1, 2.3, 1, 1]]);
        guest.g.items._physics(L, 1 / 60); assert.equal(L.rest, true);
        guest.talk.purse = { v: guest.v, uid: 'purse' };
        assert.equal(guest.talk._pursePay(guest.v), L);
        guest.g.items.applyPositions([['purse', 4, 4, 1, 0]]);
        guest.g.items._physics(L, 1 / 60);
        assert.equal(L.rest, false); assert.ok(L.vel.lengthSq() > 0.05);
        assert.equal(guest.talk._pursePay(guest.v), null, 'an old purse reference cannot pay after the host moves it');
        guest.g.items.applyPositions([['purse', 1, 2.3, 1, 0]]);
        for (let i = 0; i < 240; i++) guest.g.items._physics(L, 1 / 60);
        assert.equal(guest.talk._counterCoins(guest.v.cs.def, 0).length, 0, 'a delayed movement packet cannot masquerade as confirmed rest');
        guest.g.items.applyPositions([['purse', 1, 2.3, 1, 1]]);
        guest.g.items._physics(L, 1 / 60);
        assert.equal(guest.talk._counterCoins(guest.v.cs.def, 0).length, 1);
    } finally { host.g.items.dispose(); guest.g.items.dispose(); }
});
