import test from 'node:test';
import assert from 'node:assert/strict';
import { RelationsLife } from '../../src/game/RelationsLife.js';
import { SocialLife } from '../../src/game/SocialLife.js';

function world(n = 3) {
    const said = [], orders = [];
    const def = { id: 'c1', x: 0, z: 0 };
    const cs = { def, active: new Map(), hostile: new Map(), awake: true };
    const st = { owner: 'me', ownerName: 'Я', kingDead: false, killed: new Set(), ranks: {} };
    const released = [];
    const life = {
        enabled: true, auth: true, castles: new Map([['c1', cs]]), byId: new Map(), game: { localId: 'me', hud: { notify() {} }, character: { group: { position: { x: 0, y: 0, z: 0 } } }, isNight: false },
        state: () => st, rankOf: () => 0, _sees: () => true, _isPlayer: (id) => id === 'me', _playerPos: () => ({ x: 3, y: 0, z: 3 }), _fights: (v) => v.role === 'knight' || !!v.wizard,
        _players: () => [{ id: 'me', p: { x: 3, y: 0, z: 3 } }], _say: (v, t) => said.push([v.id, t]), _sendState() {},
        talk: { brain: (v) => ({ character: v.ch || { temper: 40, kindness: 60, obedience: 50, brave: 60, helpful: 60, trust: 50, greed: 35 }, mood: v.mood || 0 }), _status: () => 'traveller', attention: null, _partner: null, inTalk: () => false },
        orders: { run: (v, name, args) => orders.push([v.id, name, args]), _release: (v) => { released.push(v.id); v.follow = null; } },
        guard: { threats: () => [{ hits: true }] },
    };
    const mk = (id, role, x, z, extra = {}) => { const v = { id, idx: cs.active.size + 1, role, x, y: 0, z, cs, dead: false, foe: null, entry: { seed: 1000 + cs.active.size, home: -1 }, ...extra }; cs.active.set(v.idx, v); life.byId.set(id, v); return v; };
    const people = [];
    for (let i = 0; i < n; i++) people.push(mk('k' + i, 'knight', 5 + i, 5));
    const w = mk('wiz', 'wizard', 6, 6, { wizard: true });
    life.rel = new RelationsLife(life);
    life.social = new SocialLife(life);
    return { life, cs, st, said, orders, people, w, released, mk };
}

test('every person has a goal of his own, the same every time', () => {
    const { life, people } = world();
    const g = life.social.goal(people[0]);
    assert.ok(g.text.length > 5);
    assert.equal(life.social.goal(people[0]), g);
    assert.match(life.social.askGoal(people[0]), /^Моя цель — /);
});

test('on the road: a stranger refuses; a close friend of like goal goes; the host decides again', () => {
    const { life, people, cs } = world();
    const k = people[0];
    k.goal = { theme: 'valor', text: 'победить в турнире', importance: 0.4, flex: 0.6 };
    assert.equal(life.social.invite(k).answer, 'refuse');
    life.social.heroSays(k, 'моя цель убить дракона');
    assert.ok(life.social.heroGoal.themes.includes('valor'));
    life.rel.bump(k, 'me', { f: 70 });
    const r = life.social.invite(k);
    assert.equal(r.answer, 'join');
    life.social.hostInvite(k, 'me', {});
    assert.equal(k.companion.pid, 'me'); assert.equal(k.follow, 'me'); assert.equal(k.followFar, true); assert.equal(k.guard, true);
    assert.equal(life.social.invite(k).answer, 'already');
    // a stranger cannot be made a companion by a forged order
    const other = people[1];
    life.social.hostInvite(other, 'me', {});
    assert.equal(other.companion, undefined);
    void cs;
});

test('a stubborn man tied to his land says his goal is more important; love can persuade him', () => {
    const { life, people } = world();
    const k = people[0];
    k.goal = { theme: 'land', text: 'вырастить небывалый урожай', importance: 0.9, flex: 0.2 };
    life.rel.bump(k, 'me', { f: 40 });
    assert.notEqual(life.social.invite(k).answer, 'join');
});

test('the companion leaves when the term is over, or when the friendship is gone; the goodbye is said', () => {
    const { life, people, said, released } = world();
    const k = people[0];
    k.goal = { theme: 'valor', text: 'x', importance: 0.3, flex: 0.8 };
    life.rel.bump(k, 'me', { f: 80 });
    life.social.hostInvite(k, 'me', {});
    k.companion.until = performance.now() - 1;
    life.social._companions();
    assert.equal(k.companion, null); assert.ok(released.includes('k0')); assert.ok(said.some((s) => s[0] === 'k0'));
    life.social.hostInvite(k, 'me', {});
    life.rel.bump(k, 'me', { f: -200 });
    life.social._companions();
    assert.equal(k.companion, null);
});

test('a friend steps in of his own will: bond and courage decide, not an order', () => {
    const { life, people } = world();
    const [friend, stranger, coward] = people;
    life.rel.bump(friend, 'me', { f: 70 }); coward.ch = { brave: 5, helpful: 20, kindness: 50, temper: 30 };
    life.rel.bump(coward, 'me', { f: 40 });
    life.social._defend();
    assert.equal(friend.gOwner, 'me'); assert.ok(friend.gHelp > performance.now());
    assert.equal(stranger.gOwner, undefined, 'a stranger does not');
    assert.equal(coward.gOwner, undefined, 'a timid friend does not');
});

test('a companion fights for the hero with less bond', () => {
    const { life, people } = world();
    const k = people[0];
    k.goal = { theme: 'valor', text: 'x', importance: 0.3, flex: 0.8 };
    life.rel.bump(k, 'me', { f: 62 });
    life.social.hostInvite(k, 'me', {});
    life.rel.bump(k, 'me', { f: -20 });
    life.social._defend();
    assert.equal(k.gOwner, 'me');
});

test('watching a spell: asked to look, he looks and reacts; an unasked stranger does not', () => {
    const { life, people, said } = world();
    const [a, b] = people;
    life.social.watch(a);
    assert.ok(a.watch > performance.now());
    life.social.onSpell('BombardoMaxima', { x: 0, y: 0, z: 0 });
    assert.ok(said.some((s) => s[0] === 'a' || s[0] === 'k0'), 'the one asked to look says something');
    assert.equal(said.filter((s) => s[0] === 'k1').length, 0, 'a stranger who was not asked says nothing');
    void b;
});

test('a friend who sees the hero strike an innocent asks why; a stranger keeps out of it; the hot-tempered shout', () => {
    const { life, people, said } = world();
    const [friend, stranger, hot] = people;
    const victim = life.byId.get('wiz');
    life.rel.bump(friend, 'me', { f: 40 }); life.rel.bump(hot, 'me', { f: 40 }); hot.ch = { temper: 90, kindness: 20 };
    life.social.witnessedBlow(friend, victim, 'me', false);
    life.social.witnessedBlow(stranger, victim, 'me', false);
    life.social.witnessedBlow(hot, victim, 'me', false);
    assert.equal(said.filter((s) => s[0] === 'k1').length, 0);
    assert.ok(said.some((s) => s[0] === 'k0'));
    assert.match(said.find((s) => s[0] === 'k2')[1], /!/, 'the hot one shouts');
    assert.ok(life.rel.eff(friend).fr < 40, 'and thinks less of him');
});

test('tired of friendship: a friend leaves the friendship, and will not make it again soon', () => {
    const { life, people, said } = world();
    const k = people[0];
    life.rel.bump(k, 'me', { f: 30 });
    life.social._breakOff(k, 'me');
    assert.ok(life.rel.eff(k).fr < 0);
    assert.ok(said.length >= 1);
    assert.ok(life.social._s(k).noFriendUntil > performance.now());
    life.rel.bump(k, 'me', { f: 90 });
    assert.equal(life.social.invite(k).answer, 'refuse', 'not now');
});

test('what a friend gives: the wizard lets a friend in, lends nothing to a mere friend, and the wand is for love only', () => {
    const { life, w } = world();
    life.rel.bump(w, 'me', { f: 50 });
    assert.equal(life.social.ask(w, 'enter').yes, true);
    assert.equal(life.social.ask(w, 'loan').yes, false);
    assert.equal(life.social.ask(w, 'wand').yes, false);
    life.rel.bump(w, 'me', { f: 50 });
    assert.equal(life.social.ask(w, 'wand').yes, false, 'a best friend still does not give his wand');
    life.rel.bump(w, 'me', { l: 95 });
    assert.equal(life.social.ask(w, 'wand').yes, true);
    const loan = life.social.ask(w, 'loan');
    assert.equal(loan.yes, true); assert.ok(loan.give > 0);
    assert.equal(life.social.ask(w, 'loan').yes, false, 'once in ten minutes');
});
