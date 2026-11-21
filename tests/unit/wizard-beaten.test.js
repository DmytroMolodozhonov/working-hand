// Победа над волшебником без столкновения лучей и без убийства (автор 19.11, уточнено 21.11): победа — это когда его палочка перешла ко мне (выбита и взята: «Акцио» / подобрал) или рассыпана «Liquidation Maxima», он убежал (даже с палочкой) или умер. Оглушение, лёд, «Левиоса» — не победа.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WizardLife } from '../../src/game/WizardLife.js';

function fake(me = 'me') {
    const calls = [];
    const game = { localId: me, character: { group: { position: { x: 0, z: 0 } } }, mana: { duelWonAlive: (...a) => { calls.push(a); return 1; } } };
    const w = Object.create(WizardLife.prototype); w.game = game;
    return { w, calls };
}
const mage = (o = {}) => ({ id: 'w1', hp: 100, maxHp: 100, maxMana: 60, x: 10, z: 0, castAtPlayers: new Set(['me']), ...o });

test('stunned, frozen, lifted, carried — however long — is NOT a defeat (he gets up and fights on)', () => {
    const { w, calls } = fake();
    for (const f of [{ stunT: 30 }, { lev: true }, { carriedBy: 'x' }]) {
        const v = mage({ id: 'k' + Object.keys(f)[0], ...f });
        for (let i = 0; i < 80; i++) w.beatenCheck(v, 0.25); // 20 s
    }
    assert.equal(calls.length, 0);
});
test('the wand knocked out is NOT yet a win (he may pick it up); in MY hand (Акцио / picked up) — won, once; destroyed — won; no wand from the start — never', () => {
    const { w, calls } = fake();
    const v = mage(); w.beatenCheck(v, 0.25); v.noWand = true; v.lostWand = { uid: 'wand1' };
    w.beatenCheck(v, 0.25); w.beatenCheck(v, 0.25);
    assert.equal(calls.length, 0, 'lying on the ground: nothing yet');
    w.game.items = { held: { right: null, left: { item: { uid: 'other' } } } };
    w.beatenCheck(v, 0.25);
    assert.equal(calls.length, 0, 'another thing in my hand');
    w.game.items.held.right = { item: { uid: 'wand1' } };
    w.beatenCheck(v, 0.25); w.beatenCheck(v, 0.25);
    assert.equal(calls.length, 1, 'his wand came to me: won, once');
    assert.match(calls[0][5], /палочка у вас/);
    const r = fake(); const v2 = mage({ id: 'w4' }); r.w.beatenCheck(v2, 0.25); v2.noWand = true; v2.lostWand = { uid: 'wand2' };
    r.w.beatenCheck(v2, 0.25); v2.noWand = false; v2.lostWand = null; r.w.beatenCheck(v2, 0.25); // (he ran up and took it back)
    assert.equal(r.calls.length, 0);
    const b = fake(); const bare = mage({ id: 'w2', noWand: true });
    b.w.beatenCheck(bare, 0.25); b.w.beatenCheck(bare, 0.25);
    assert.equal(b.calls.length, 0, 'no wand from the start: no win');
    // «Liquidation Maxima» crumbled the wand in his hand (HeldBreak sets wandDestroyed): won; a wand lost any other way (no flag) — not
    const c = fake(); const v3 = mage({ id: 'w3' }); c.w.beatenCheck(v3, 0.25); v3.noWand = true; v3.lostWand = null; v3.wandDestroyed = true; c.w.beatenCheck(v3, 0.25);
    assert.match(c.calls[0][5], /Liquidation Maxima/);
    const d = fake(); const v5 = mage({ id: 'w5' }); d.w.beatenCheck(v5, 0.25); v5.noWand = true; v5.lostWand = null; d.w.beatenCheck(v5, 0.25);
    assert.equal(d.calls.length, 0, 'no wand and no destruction: nothing');
});
test('ran away: fleeing 40 m and more for 6 s on end — won; fleeing close by is not', () => {
    const { w, calls } = fake();
    const near = mage({ id: 'n', fleeT: 5, x: 20 });
    for (let i = 0; i < 40; i++) w.beatenCheck(near, 0.25);
    assert.equal(calls.length, 0, 'close by: he may come back');
    const far = mage({ id: 'f', fleeT: 5, x: 80 });
    for (let i = 0; i < 20; i++) w.beatenCheck(far, 0.25); // 5 s
    assert.equal(calls.length, 0);
    for (let i = 0; i < 8; i++) w.beatenCheck(far, 0.25);
    assert.deepEqual(calls.map((c) => c[0]), ['f']);
});
test('never cast at me: not; dead: not (the kill has its own reward); hurt to a third but standing: not', () => {
    const { w, calls } = fake();
    w.beatenCheck(mage({ id: 'c', stunT: 30, castAtPlayers: new Set(['other']) }), 10);
    w.beatenCheck(mage({ id: 'd', dead: true, stunT: 30 }), 10);
    w.beatenCheck(mage({ id: 'e', hp: 10 }), 10);
    assert.equal(calls.length, 0);
});
