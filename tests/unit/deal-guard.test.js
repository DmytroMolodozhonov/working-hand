// A deal at a counter: no spell by accident (DealGuard.js, the author 19.11) and an unpaid good is never lifted by «Левиоса» (it was duplicated and bought twice).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dealRefuses, DEAL_ALLOWED, DEAL_GUARD } from '../../src/game/DealGuard.js';
import { Levitation } from '../../src/game/Levitation.js';
import { itemRefusal } from '../../src/game/ItemSwarmRules.js';

const at = { deal: true, near2: 3 * 3, fight: false };

test('at a counter in a deal: any spell is refused, only light (and «стоп») passes', () => {
    for (const n of ['Levitation', 'Bombardo', 'Accio', 'Fire', 'Frozen', 'Protection']) assert.equal(dealRefuses(n, at), true, n);
    for (const n of ['Lumos', 'LumosMaxima', 'Nox', 'Stand']) assert.equal(dealRefuses(n, at), false, n);
    assert.ok(DEAL_ALLOWED.has('Lumos') && DEAL_ALLOWED.has('LumosMaxima'));
});

test('not at a counter (far, no deal) or in a fight: nothing is refused', () => {
    assert.equal(dealRefuses('Levitation', { deal: false, near2: 4, fight: false }), false);
    assert.equal(dealRefuses('Levitation', { deal: true, near2: (DEAL_GUARD.NEAR_COUNTER + 1) ** 2, fight: false }), false, 'only passing by');
    assert.equal(dealRefuses('Bombardo', { ...at, fight: true }), false, 'attacked at the market: defends himself');
    assert.equal(dealRefuses(null, at), false);
});

test('«Вингардиум Левиоса» does not lift an unpaid good of a counter; a paid one — as any thing', () => {
    const mk = (shop) => ({ item: { kind: 'apple', uid: 'u', ...(shop ? { shop } : {}) }, model: { position: { x: 0, y: 0, z: 0 } } });
    const goods = mk({ stall: 'c:s0', price: 5 }), mine = mk({ stall: 'c:s0', price: 5, paid: true }), plain = mk(null);
    const g = { weapons: { weapons: [] }, items: { auth: true, loose: new Map([['a', goods], ['b', mine], ['c', plain]]) }, books: null };
    const out = Levitation.prototype._candidates.call({ game: g }).filter((c) => c.kind === 'item').map((c) => c.obj);
    assert.deepEqual(out, [mine, plain]);
    assert.ok(itemRefusal(goods), 'the swarm refuses it too');
});
