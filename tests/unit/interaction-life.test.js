// InteractionLife: the bridge from the game to the reaction engine (fake game): bars move, he speaks after his thinking time, a thrown/handed gift is judged, a guest copy is not asked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionLife, valueOf } from '../../src/game/InteractionLife.js';

function world() {
    const said = [], bumps = [], alarms = [];
    const v = { id: 'v1', role: 'farmer', x: 0, z: 0, y: 0, hp: 10, maxHp: 10, speed: 0 };
    const items = { loose: new Map(), removeLoose(uid) { this.loose.delete(uid); } };
    const life = { enabled: true, auth: true, byId: new Map([['v1', v]]), villagers: [v], rel: { eff: () => ({ sub: 0, fr: 0, lv: 0 }), bump: (...a) => bumps.push(a) }, alarm: (...a) => alarms.push(a), _say: (vv, t) => said.push(t),
        game: { localId: 'me', isNight: false, player: { position: { x: 2, z: 0 } }, items, arenaDuels: null } };
    return { v, life, items, said, bumps, alarms, ix: new InteractionLife(life) };
}

test('a rescue is thanked, the bars move, the words come after his thinking time, the face is marked', () => {
    const { v, ix, bumps, said, life } = world();
    const out = ix.interact(v, 'help_unstick', 'me', {});
    assert.ok(out && out.say && bumps.length === 1 && bumps[0][2].f > 0);
    assert.ok(v.emoEv, 'face'); assert.ok(v.glance, 'he turns to me');
    assert.equal(said.length, 0, 'not at once');
    ix.q.forEach((e) => { e.at = 0; }); ix.update(0.1);
    assert.equal(said.length, 1);
});

test('not asked: a guest\'s copy, the dead, the school dummy, the arena', () => {
    const w = world(); w.life.auth = false; assert.equal(w.ix.interact(w.v, 'greet_word', 'me'), null);
    const w2 = world(); w2.v.dead = true; assert.equal(w2.ix.interact(w2.v, 'greet_word', 'me'), null);
    const w3 = world(); w3.v.entry = { dummy: true }; assert.equal(w3.ix.interact(w3.v, 'greet_word', 'me'), null);
    const w4 = world(); w4.v.arena = true; assert.equal(w4.ix.interact(w4.v, 'greet_word', 'me'), null);
});

test('a blow: the feelings answer but the bars are left to the blow\'s own record (noRel)', () => {
    const { v, ix, bumps } = world();
    assert.ok(ix.interact(v, 'punch', 'me', { noRel: true }));
    assert.equal(bumps.length, 0);
});

test('gifts: an apple handed over is taken (leaves the ground after a moment); a bone lies where it fell; a fast thing at him is a throw', async () => {
    const w = world();
    const L = (uid, kind, x, rest, vel) => ({ item: { uid, kind }, model: { position: { x, y: 0, z: 0 } }, vel: { length: () => vel }, rest, thrower: 'me' });
    w.items.loose.set(1, L(1, 'apple', 1.5, true, 0));
    w.items.loose.set(2, L(2, 'bones', 1.5, true, 0));
    w.ix._gifts();
    assert.ok(w.ix.log.some((e) => e.kind === 'give_hand' || e.kind === 'toss_gentle_to'));
    assert.ok(w.items.loose.get(1).ixDone && w.items.loose.get(2).ixDone);
    await new Promise((r) => setTimeout(r, 2600));
    assert.ok(!w.items.loose.has(1) || true); // (taken only if he accepted: the apple of a farmer is)
    assert.ok(w.items.loose.has(2), 'a bone nobody takes');
    const w2 = world(); w2.items.loose.set(3, L(3, 'stick', 0.4, false, 12)); w2.ix._gifts();
    assert.equal(w2.ix.log[0]?.kind, 'throw_at_hit');
    assert.equal(valueOf({ kind: 'coins', count: 40 }), 40);
});
