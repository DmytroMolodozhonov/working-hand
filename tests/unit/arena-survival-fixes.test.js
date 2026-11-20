// The author 20.11 (survival arena): a won wand is his for good (it was deleted at the next duel and a plain one given); a signed-up player may change the opponent before the duel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaDuels } from '../../src/game/ArenaDuels.js';

test('survival: a trophy wand is kept (the flag goes) — nothing is dropped, no stand-in wand is given', () => {
    let given = 0, dropped = 0;
    const own = { kind: 'wand', uid: 'w1', arenaWand: true, power: 49 };
    const self = { log: [], mode: null, game: { config: { mode: 'freeworld' }, items: { held: { right: { item: own } }, releaseHand: () => { dropped++; } }, inventory: { slots: [], heldWand: () => {}, _render() {}, ensureStarterWand: () => { given++; } } } };
    ArenaDuels.prototype.dropTrophyWands.call(self);
    assert.equal(own.arenaWand, undefined);
    assert.equal(dropped + given, 0);
});

test('Creative duel: the won wand of the last fight still goes', () => {
    let dropped = 0, given = 0;
    const slots = [{ kind: 'wand', uid: 'w2', arenaWand: true }];
    const self = { log: [], mode: { arenaId: 1 }, game: { config: { mode: 'creative' }, items: { held: {}, releaseHand() { dropped++; } }, inventory: { slots, _render() {}, ensureStarterWand: () => { given++; } } } };
    ArenaDuels.prototype.dropTrophyWands.call(self);
    assert.equal(slots[0], null); assert.equal(given, 1);
});

test('choose(): a player already signed up for another opponent changes his mind — the stake is given back and he is signed up again', () => {
    const tells = [], queue = { list: ['me'], has: (id) => queue.list.includes(id), prune(f) { const o = queue.list.filter(f); queue.list = queue.list.filter((x) => !o.includes(x)); return o; }, length: 1 };
    const A = { id: 1, queue, tiers: new Map([['me', 'adept']]), stakes: new Map([['me', 100]]), duel: null, def: { desk: null }, ph: 'idle' };
    const self = { auth: true, count: null, mode: null, pay: null, log: [], myQueue: 1, choosingAt: 0, askedAt: 0, _send() {}, _tell: (id, m) => tells.push(m), _refund: ArenaDuels.prototype._refund, _tryPay: () => false, _join() {},
        game: { localId: 'me', isNight: false, items: { wand: { kind: 'wand' } }, config: { mode: 'freeworld' }, sound: null, hud: null } };
    const r = ArenaDuels.prototype.choose.call(self, A, 'novice');
    assert.ok(!A.queue.has('me'), 'the old sign-up is gone');
    assert.ok(tells.some((m) => m.e === 'pay' && m.coins === 100), 'the stake of the middle one is given back');
    assert.ok(self.pay && self.pay.tier === 'novice', 'now the stake of the junior is asked: ' + JSON.stringify(r));
});

import { rollWizardWand } from '../../src/game/Expelliarmus.js';
test('the wizards\' wands are their own (the author 20.11): the same person — the same wand every time; different people — different designs and woods; not one plain stick for all students', () => {
    const mk = (id, role = 'student', seed) => ({ id, role, look: { seed } });
    const a1 = rollWizardWand(mk('t:1', 'student', 101)), a2 = rollWizardWand(mk('t:1', 'student', 101));
    assert.deepEqual(a1, { ...a2, uid: a1.uid }, 'the same person, the same wand');
    const seen = new Set();
    for (let i = 0; i < 40; i++) { const w = rollWizardWand(mk('t:' + i, 'student', i * 37 + 5)); seen.add(w.model + ':' + w.color); assert.ok(!w.plain, 'not the plain stick'); assert.ok(w.power >= 1 && w.power <= 20, 'a student\'s wand is weak'); }
    assert.ok(seen.size >= 15, 'many different wands: ' + seen.size);
});
