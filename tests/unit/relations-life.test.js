import test from 'node:test';
import assert from 'node:assert/strict';
import { RelationsLife } from '../../src/game/RelationsLife.js';

function world(n = 6) {
    const said = [], orders = [];
    const def = { id: 'c1', x: 0, z: 0 };
    const cs = { def, active: new Map(), hostile: new Map(), awake: true };
    const st = { owner: 'me', ownerName: 'Я', kingDead: false, killed: new Set(), ranks: {} };
    const life = {
        enabled: true, auth: true, castles: new Map([['c1', cs]]), byId: new Map(), game: { localId: 'me', hud: { notify() {} }, character: { group: { position: { x: 0, y: 0, z: 0 } } }, sync: null },
        state: () => st, rankOf: () => 9, _sees: () => true, _isPlayer: (id) => id === 'me', _playerPos: () => ({ x: 3, y: 0, z: 3 }),
        _players: () => [{ id: 'me', p: { x: 3, y: 0, z: 3 } }], _say: (v, t) => said.push([v.id, t]), _sendState() {},
        talk: { brain: (v) => ({ character: v.ch || { temper: 50, kindness: 50, obedience: 50 } }), _status: () => 'king', attention: null, _partner: null },
        orders: { run: (v, name, args, by) => orders.push([v.id, name, args, by]) },
    };
    for (let i = 0; i < n; i++) {
        const v = { id: 'k' + i, idx: i + 1, role: 'knight', x: 5 + i, y: 0, z: 5, cs, dead: false, foe: null, entry: { home: -1 } };
        cs.active.set(v.idx, v); life.byId.set(v.id, v);
    }
    const adv = { id: 'adv', idx: -1, role: 'advisor', x: 2, y: 0, z: 2, cs, dead: false, foe: null, entry: { home: -1 } };
    cs.active.set(-1, adv); life.byId.set('adv', adv);
    const rl = new RelationsLife(life);
    return { life, cs, st, rl, said, orders, knights: [...cs.active.values()].filter((v) => v.role === 'knight'), adv };
}

test('a king starts with ~80 subordination and no friendship / love at all', () => {
    const { rl, knights } = world();
    const e = rl.eff(knights[0]);
    assert.ok(e.sub >= 70 && e.sub <= 90); assert.equal(e.fr, 0); assert.equal(e.lv, 0);
});

test('kind words warm him, the same word twice in a breath is one, and talk alone makes at most the cap', () => {
    const { rl, knights } = world();
    const k = knights[0];
    rl.talked(k, { intent: 'compliment' });
    assert.ok(rl.eff(k).fr >= 2);
    const after = rl.eff(k).fr;
    rl.talked(k, { intent: 'compliment' });
    assert.equal(rl.eff(k).fr, after, 'cooldown');
    for (let i = 0; i < 60; i++) { rl._cool.clear(); rl.talked(k, { intent: 'compliment' }); }
    assert.ok(rl.eff(k).fr <= 36, `chatter alone cannot buy a friend: ${rl.eff(k).fr}`);
    rl._cool.clear(); rl.talked(k, { intent: 'insult' });
    assert.ok(rl.eff(k).fr < 36 && rl.eff(k).sub < 80, 'an insult chills at once');
});

test('a flirt from a stranger is refused (and cools him); from a friend it is love', () => {
    const { rl, knights } = world();
    const [a, b] = knights;
    rl.talked(a, { intent: 'flirt' });
    assert.equal(rl.eff(a).lv, 0); assert.ok(rl.eff(a).fr < 0);
    rl.bump(b, 'me', { f: 25 }); rl._cool.clear();
    rl.talked(b, { intent: 'flirt' });
    assert.ok(rl.eff(b).lv > 0);
});

test('a killing: the witnesses think worse of him and the town remembers; a stranger who hears of it is cold from the start', () => {
    const { rl, knights, st, cs } = world();
    const victim = knights[0]; victim.x = 4; victim.z = 4;
    rl.onHit(victim, 'me', true);
    assert.equal(st.rep.me.slain, 1);
    assert.ok(rl.eff(knights[1]).fr < 0, 'a witness');
    assert.ok(rl.eff(victim).fr <= -40 + 1, 'the victim');
    // another village hears: nobody has seen the hero there, but the rep is shared per castle here
    for (let i = 0; i < 3; i++) rl._rep(cs, 'me', 'slain');
    const fresh = { id: 'x', idx: 99, role: 'farmer', x: 50, y: 0, z: 50, cs, dead: false, entry: {} };
    assert.ok(rl.eff(fresh).fr < -5, 'the first impression is dark');
});

test('monsters killed before their eyes make them grateful; a spell seen is remembered', () => {
    const { rl, knights, st } = world();
    rl.foeSlain({ x: 6, y: 0, z: 6 }, 'me');
    assert.ok(rl.eff(knights[0]).fr > 0);
    assert.equal(st.rep.me.foes, 1);
    rl.sawCast('Fire');
    assert.ok(knights[0].sawMagic >= 1); assert.ok(st.rep.me.magic >= 1);
    assert.match(rl.knownText(knights[0]), /колдует/);
});

test('a hand raised against the people: everybody thinks a little worse', () => {
    const { rl, knights } = world();
    const far = knights[5]; far.x = 200; far.z = 200; // saw nothing
    rl.onHit(knights[0], 'me', false);
    assert.ok(rl.eff(far).fr < 0, 'the word goes round');
});

test('a lone fighter who cannot bear him strikes; the others do not', () => {
    const { rl, knights, cs, life } = world();
    const k = knights[0]; k.ch = { temper: 80, kindness: 30, obedience: 10 };
    rl.bump(k, 'me', { f: -70, s: -110 });
    rl._scan(cs, 1.5);
    assert.equal(k.foe, 'me'); assert.ok(cs.hostile.get('me') > Date.now());
    assert.equal(knights[1].foe, null);
    void life;
});

test('knights who hate him conspire, whisper, then strike; the loyal go at them', () => {
    const { rl, knights, cs, orders, said } = world(8);
    // four of eight hate him (50 %), the others stay loyal
    for (const k of knights.slice(0, 4)) rl.bump(k, 'me', { f: -62, s: -120 });
    const hot = (k) => { k.ch = { temper: 40, kindness: 50, obedience: 20 }; };
    knights.slice(0, 4).forEach(hot);
    rl._scan(cs, 1.5);
    const plot = rl.plots.get('c1');
    assert.ok(plot && plot.stage === 'whisper', 'a plot is hatched');
    assert.ok(plot.members.size >= 3);
    for (let t = 0; t < 120 && plot.stage !== 'strike'; t += 1.5) rl._scan(cs, 1.5);
    assert.equal(plot.stage, 'strike');
    assert.ok(knights.slice(0, 4).filter((k) => k.foe === 'me').length >= 3, 'the traitors go at the king');
    assert.ok(orders.some((o) => o[1] === 'cmd' && o[2].id === 'fight_him' && o[2].mode === 'deadly'), 'loyal knights fight them');
    assert.ok(said.length > 0);
});

test('too few haters: no plot', () => {
    const { rl, knights, cs } = world(8);
    for (const k of knights.slice(0, 2)) rl.bump(k, 'me', { f: -62, s: -120 });
    rl._scan(cs, 1.5);
    assert.equal(rl.plots.size, 0);
});

test('the vizier hates him long and has followers: he leads the coup; with few — he does not', () => {
    const { rl, knights, cs, adv } = world(8);
    adv.ch = { temper: 60, kindness: 30, obedience: 10 };
    rl.bump(adv, 'me', { f: -75, s: -130 });
    for (const k of knights.slice(0, 4)) { rl.bump(k, 'me', { f: -50 }); k.ch = { temper: 30, kindness: 50, obedience: 20 }; }
    for (let t = 0; t < 100; t += 1.5) rl._scan(cs, 1.5);
    assert.equal(rl.plots.size, 0, 'not long enough yet (or not angry enough): no plot');
    for (let t = 0; t < 200 && rl.plots.size === 0; t += 1.5) rl._scan(cs, 1.5);
    const plot = rl.plots.get('c1');
    assert.ok(plot, 'after a long hate, the coup');
    assert.equal(plot.leader, 'adv'); assert.equal(plot.why, 'vizier');
});

test('a plot is against a king only (a traveller hated is just hated)', () => {
    const { rl, knights, cs, st } = world(8);
    st.owner = 'someone else';
    rl.life.talk._status = () => 'traveller';
    for (const k of knights.slice(0, 5)) rl.bump(k, 'me', { f: -62, s: -60 });
    rl._scan(cs, 1.5);
    assert.equal(rl.plots.size, 0);
});

test('the state is packed small, and unpacked the same', () => {
    const { rl, knights, st, cs } = world();
    rl.bump(knights[0], 'me', { f: 5, l: 2 });
    rl.sawCast('Fire');
    const pack = rl.pack(cs);
    assert.ok(pack.rel[knights[0].idx].me);
    assert.equal(Object.keys(pack.rel).length, 1, 'only those with something');
    const st2 = { rel: {}, rep: {} };
    rl.unpack(st2, JSON.parse(JSON.stringify(pack)));
    assert.deepEqual(st2.rel, pack.rel); assert.deepEqual(st2.rep, pack.rep);
    void st;
});

test('friendship opens a home; duty alone does not; a friend\'s will to obey is by friendship', () => {
    const { rl, knights, cs } = world();
    const k = knights[0]; k.entry.home = 3;
    assert.equal(rl.homeAllows(cs, { h: 3 }, 'me', 'enter'), false);
    rl.bump(k, 'me', { f: 45 });
    assert.equal(rl.homeAllows(cs, { h: 3 }, 'me', 'enter'), true);
    assert.equal(rl.homeAllows(cs, { h: 3 }, 'me', 'take'), false);
    rl.bump(k, 'me', { f: 15 });
    assert.equal(rl.homeAllows(cs, { h: 3 }, 'me', 'take'), true);
    assert.equal(rl.willObey(k, 'serve').yes, true);
});
