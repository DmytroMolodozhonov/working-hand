// Победа над волшебником без столкновения лучей и без убийства (автор 19.11, уточнено 21.11): победа — это когда его обезоружили (палочка выбита или
// уничтожена), он убежал или умер. Оглушение, лёд, «Левиоса» — не победа.
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
test('the wand knocked out («Экспеллиармус») or destroyed: won — once; but only a wizard who HAD a wand while he fought', () => {
    const { w, calls } = fake();
    const v = mage(); w.beatenCheck(v, 0.25); v.noWand = true; v.lostWand = { uid: 'x' };
    w.beatenCheck(v, 0.25); w.beatenCheck(v, 0.25);
    assert.equal(calls.length, 1);
    assert.match(calls[0][5], /обезоружен/);
    const b = fake(); const bare = mage({ id: 'w2', noWand: true });
    b.w.beatenCheck(bare, 0.25); b.w.beatenCheck(bare, 0.25);
    assert.equal(b.calls.length, 0, 'no wand from the start: no win');
    const c = fake(); const v3 = mage({ id: 'w3' }); c.w.beatenCheck(v3, 0.25); v3.noWand = true; v3.lostWand = null; c.w.beatenCheck(v3, 0.25);
    assert.match(c.calls[0][5], /уничтожена/);
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
