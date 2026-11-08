// The wizards' ward against blasts by rank (the author 08.11): head of the tower 100 %, strong 80 %, middle 60 %, weak 40 %.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLAST_WARD_CHANCE, hasBlastWard, npcBlastFactor, wardRank } from '../../src/game/BlastWardNpc.js';

const share = (mk, n = 4000) => { let k = 0; for (let i = 0; i < n; i++) if (hasBlastWard(mk(i))) k++; return k / n; };

test('the chances by rank: 100 / 80 / 60 / 40 %', () => {
    assert.equal(share((i) => ({ id: 'wt1:' + i, wizard: true, role: 'master', rank: 'master' })), 1);
    assert.ok(Math.abs(share((i) => ({ id: 'wt1:' + i, wizard: true, rank: 'teacher' })) - 0.8) < 0.03);
    assert.ok(Math.abs(share((i) => ({ id: 'wt1:' + i, wizard: true, rank: 'elder' })) - 0.8) < 0.03);
    assert.ok(Math.abs(share((i) => ({ id: 'wt1:' + i, wizard: true, rank: 'adept' })) - 0.6) < 0.03);
    assert.ok(Math.abs(share((i) => ({ id: 'wt1:' + i, wizard: true, rank: 'novice' })) - 0.4) < 0.03);
    assert.equal(BLAST_WARD_CHANCE.master, 1);
});

test('a wizard either has it or not — always the same; the not-wizards never have it', () => {
    const w = { id: 'wt3:7', wizard: true, rank: 'adept' };
    assert.equal(hasBlastWard(w), hasBlastWard({ ...w }));
    assert.equal(hasBlastWard({ id: 'cs1:2', role: 'knight' }), false);
    assert.equal(hasBlastWard({ id: 'cs1:3', role: 'farmer', wizard: false, rank: 'master' }), false);
    assert.equal(wardRank({ wizard: true }), 'adept');
});

test('with the ward: Bombardo none, Boom / Inspirius half, the rest whole; without it: all whole', () => {
    const head = { id: 'x', wizard: true, role: 'master' };
    assert.equal(npcBlastFactor(head, 'Bombardo'), 0);
    assert.equal(npcBlastFactor(head, 'BombardoMaxima'), 0);
    assert.equal(npcBlastFactor(head, 'Inspirius'), 0.5);
    assert.equal(npcBlastFactor(head, 'Inferno'), 1);
    assert.equal(npcBlastFactor(head, null), 1);
    assert.equal(npcBlastFactor({ id: 'k', role: 'knight' }, 'Bombardo'), 1);
});
