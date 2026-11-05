/**
 * The raised dead understand their master's words as a villager does (the author 05.11: «атакуй всё село — пойдут и атакуют всё село»;
 * a radius they keep; one that goes too far is gone alone). Bodies are solid: they never walk through one another.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUndeadOrder, leashPoint, raidMeans, UNDEAD } from '../../src/game/UndeadOrders.js';
import { Servants } from '../../src/game/Servants.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('the words: raid, that one, there, follow, stay, guard, stop', () => {
    const cases = {
        'атакуйте всё село': ['raid', 'people'], 'атакуй всю деревню': ['raid', 'people'], 'нападайте на замок': ['raid', 'people'],
        'убейте всех жителей': ['raid', 'people'], 'перебейте всех рыцарей': ['raid', 'knights'], 'убейте стражу': ['raid', 'knights'],
        'убейте зомби': ['raid', 'zombies'], 'атакуйте коров': ['raid', 'animals'],
        'атакуй его': ['that'], 'убей того': ['that'], 'идите туда': ['go'], 'иди вон туда': ['go'],
        'за мной': ['follow'], 'идите ко мне': ['follow'], 'стойте здесь': ['stay'], 'ждите тут': ['stay'],
        'охраняйте меня': ['guard'], 'защищай меня': ['guard'], 'отставить': ['stop'], 'отставить атаку': ['stop'], 'хватит, не трогайте их': ['stop'],
    };
    for (const [t, want] of Object.entries(cases)) {
        const o = parseUndeadOrder(t);
        if (!want) { assert.equal(o, null, t); continue; }
        assert.equal(o?.do, want[0], t); if (want[1]) assert.equal(o.who, want[1], t);
    }
    for (const t of ['стоп', 'Атак', 'привет как дела', 'какая хорошая погода', 'Бомбардо']) assert.equal(parseUndeadOrder(t), null, t);
    for (const t of ['атакуйте всё село', 'стойте здесь', 'за мной']) assert.notEqual(matchSpell(t), 'Stand', t + ' is no «стоп»');
});

test('the leash: a goal beyond it is taken onto its edge', () => {
    const q = leashPoint(100, 0, 0, 0);
    assert.ok(Math.abs(q.x - UNDEAD.LEASH) < 1e-9 && q.z === 0);
    assert.deepEqual(leashPoint(10, 5, 0, 0), { x: 10, z: 5 });
    assert.ok(raidMeans('people', 'v', { role: 'knight' }) && raidMeans('knights', 'v', { role: 'knight' }) && !raidMeans('knights', 'v', { role: 'farmer' }));
});

test('a raid: the nearest person of the place inside the leash; «стойте здесь» holds; «за мной» ends it', () => {
    const people = new Map([[1, { id: 1, x: 10, y: 0, z: 0, role: 'farmer' }], [2, { id: 2, x: 80, y: 0, z: 0, role: 'farmer' }], [3, { id: 3, x: 20, y: 0, z: 0, role: 'knight' }]]);
    const g = { localId: 'me', character: { group: { position: { x: 0, y: 0, z: 0 } } }, castleLife: { byId: people }, livingTrees: { list: [] }, zombies: [], animals: { list: [] }, remotes: new Map() };
    const S = new Servants(g);
    S._masterPos = () => ({ x: 0, z: 0 });
    S.masterOf = () => 'me';
    const tree = { id: 7, master: 'me', masterUntil: 0 };
    S.order('me', { kind: 'raid', who: 'people', x: 0, z: 0 });
    const e = S.enemyFor({ k: 't', id: 7 }, 'me', { x: 0, z: 0 });
    assert.equal(e?.id, 1, 'the nearest one');
    people.delete(1);
    assert.equal(S.enemyFor({ k: 't', id: 7 }, 'me', { x: 0, z: 0 })?.id, 3, 'the knight next; the one 80 m off is beyond the leash');
    S.order('me', { kind: 'stay' });
    people.clear();
    const p = S.plan('t', tree, { x: 5, z: 5 }, 3);
    assert.ok(p.hold && p.mode === 'stay' && p.x === 5, 'stands where it is');
    S.order('me', { kind: 'follow' });
    assert.equal(S.orders.has('me'), false);
});
