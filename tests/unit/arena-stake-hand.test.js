/**
 * The duel's stake is paid by hand (the author: «монетка не должна автоматически списываться»): the steward names it, a pouch laid on
 * his counter pays it — the coins are taken out, the change is left, the player is signed up. And a guest's copy of the steward is the
 * steward too (bit 8 of the villagers' net: the author's friend got a villager who only chatted).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArenaDuels } from '../../src/game/ArenaDuels.js';
import { STEWARD, STEWARD_LINES, FIG } from '../../src/game/ArenaSteward.js';

function fake({ coins = [], night = false, auth = true } = {}) {
    const loose = new Map();
    const picked = [], spawned = [], joined = [], said = [];
    for (const [uid, count, x, y, z] of coins) loose.set(uid, { item: { kind: 'coins', uid, count }, model: { position: new THREE.Vector3(x, y, z) }, vel: new THREE.Vector3() });
    const A = { id: 'ar1', def: { desk: { stand: { x: 0, y: 10, z: 0 }, book: { x: 1, y: 11, z: 0 }, front: { x: 1, y: 10, z: 1 } } }, queue: { length: 0 }, ph: 'idle', duel: null };
    const self = {
        list: new Map([[A.id, A]]), auth, log: [],
        game: {
            isNight: night,
            character: { group: { position: new THREE.Vector3(0, 10, 3) } },
            items: { loose, pickUp: (uid) => { picked.push(uid); loose.delete(uid); }, spawnLoose: (it) => spawned.push(it) },
            hud: { setVoice: (t) => said.push(t) }, sound: {}, localId: 'me', sync: { arena: (m) => joined.push(m) },
        },
        _join: (A2, id, tier, stake) => joined.push({ id, tier, stake }),
    };
    return { self, A, picked, spawned, joined, said };
}

test('the stake: a pouch laid on the counter pays it, the change stays, then the sign-up', () => {
    const f = fake({ coins: [['c1', 130, 1.2, 11, 0.3]] });
    f.self.pay = { aid: 'ar1', tier: 'adept', fee: 100, t: 0, short: null };
    ArenaDuels.prototype._payStep.call(f.self, 0.3);
    assert.deepEqual(f.picked, ['c1'], 'the pouch is taken');
    assert.equal(f.spawned[0]?.count, 30, 'the change is left');
    assert.deepEqual(f.joined[0], { id: 'me', tier: 'adept', stake: 100 });
    assert.equal(f.self.pay, null);
});

test('not enough on the counter: nothing is taken, he says how much more', () => {
    const f = fake({ coins: [['c1', 40, 1, 11, 0]] });
    f.self.pay = { aid: 'ar1', tier: 'adept', fee: 100, t: 0, short: null };
    ArenaDuels.prototype._payStep.call(f.self, 0.3);
    assert.equal(f.picked.length, 0);
    assert.equal(f.joined.length, 0);
    assert.ok(f.said.some((t) => t.includes('60')), 'add 60 more');
});

test('no pouch on the counter, the player walked off / night / timeout: the choice is dropped, nothing taken', () => {
    for (const k of ['walk', 'night', 'time']) {
        const f = fake({ night: k === 'night' });
        f.self.pay = { aid: 'ar1', tier: 'novice', fee: 50, t: k === 'time' ? STEWARD.PAY_T + 1 : 1, short: null };
        if (k === 'walk') f.self.game.character.group.position.set(STEWARD.LEAVE_R + 5, 10, 0);
        ArenaDuels.prototype._payStep.call(f.self, 0.3);
        assert.equal(f.self.pay, null, k);
        assert.equal(f.joined.length, 0, k);
    }
});

test('a guest: pays the same way, the sign-up goes to the host with the stake', () => {
    const f = fake({ coins: [['c1', 50, 0.5, 10, 0.5]], auth: false });
    f.self.pay = { aid: 'ar1', tier: 'novice', fee: 50, t: 0, short: null };
    ArenaDuels.prototype._payStep.call(f.self, 0.3);
    assert.deepEqual(f.joined[0], { e: 'join', id: 'ar1', tier: 'novice', stake: 50 });
    assert.equal(f.self.myQueue, 'ar1');
});

test('a guest\'s copy of the steward is the steward (netSteward): the nearest arena with a counter', () => {
    const f = fake();
    const v = { x: 0.5, z: 0.4 };
    ArenaDuels.prototype.netSteward.call(f.self, v);
    assert.equal(v.arena?.kind, 'steward');
    assert.equal(v.arena.id, 'ar1');
    assert.ok(v.steward);
});

test('the figures are half the size (the author); the steward names the stake and closes at night', () => {
    assert.equal(FIG.H, 0.5);
    assert.ok(STEWARD_LINES.put.includes('{n}'));
    assert.ok(STEWARD_LINES.closing.length > 10);
});
