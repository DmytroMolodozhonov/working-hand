import test from 'node:test';
import assert from 'node:assert/strict';
import {
    REB, blank, valueOf, note, slainKing, ease, ramp, friendDrag, homeChance, risingKnights, reactionOf, ROLE_REACT, unpackRecord, packRecord, nextPeriod,
} from '../../src/game/Rebellion.js';
import { COMMAND_ROLES } from '../../src/ai/TalkCommands.js';
import { RebellionLife } from '../../src/game/RebellionLife.js';
import { RelationsLife } from '../../src/game/RelationsLife.js';

test('killing the old king throws the unrest high at once; it never goes down below what it was', () => {
    assert.equal(valueOf(slainKing(blank())), REB.KING_SLAIN);
    assert.equal(valueOf(slainKing({ v: 90 })), 90);
});

test('bad deeds grow it, helping eases it, the top and the bottom hold', () => {
    let r = slainKing(blank());
    const a = valueOf(r);
    r = note(r, 'execution'); assert.ok(valueOf(r) > a);
    r = note(r, 'wreck', 10000); assert.ok(valueOf(r) <= REB.MAX && valueOf(r) - a <= 6 + 10 + 0.01, 'a big wreck is capped');
    let q = { v: 50 };
    for (const k of ['foe', 'saved', 'gift', 'repair', 'rank', 'court']) { const b = valueOf(q); q = note(q, k); assert.ok(valueOf(q) < b, k); }
    for (let i = 0; i < 100; i++) q = note(q, 'saved');
    assert.equal(valueOf(q), 0);
    assert.equal(valueOf(note({ v: 99 }, 'slay', 50)), REB.MAX);
    assert.deepEqual(note(blank(), 'nonsense'), blank());
});

test('time eases it slowly; calm stays calm', () => {
    const r = ease({ v: 70 }, 900);
    assert.ok(valueOf(r) < 70 && valueOf(r) > 55, `${valueOf(r)}`);
    assert.equal(valueOf(ease({ v: 1 }, 1e6)), 0);
    assert.equal(valueOf(ease(blank(), 10)), 0);
});

test('a house: rich 80 %, poor 40 % at full unrest; calm — never; a friend is spared', () => {
    assert.equal(homeChance(REB.RAMP_FULL, true), 0.8);
    assert.equal(homeChance(REB.RAMP_FULL, false), 0.4);
    assert.ok(homeChance(60, false) < 0.4);
    assert.equal(homeChance(5, true), 0);
    assert.ok(homeChance(35, false) < 0.4 && homeChance(35, false) > 0);
    assert.ok(homeChance(70, true, 45) < homeChance(70, true, 0) * 0.5);
    assert.ok(homeChance(100, true) <= 0.95);
});

test('knights: ~25 % each, a band of two or three, never the herd, none when calm', () => {
    const ks = Array.from({ length: 12 }, (_, i) => ({ id: 'k' + i, fr: 0 }));
    assert.deepEqual(risingKnights(ks, 5), []);
    let total = 0, maxBand = 0, anyBand = 0; const N = 4000;
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) { const p = risingKnights(ks, 70, rnd); total += p.length; maxBand = Math.max(maxBand, p.length); if (p.length) anyBand++; assert.equal(new Set(p).size, p.length); }
    assert.ok(maxBand <= REB.GROUP_MAX, `band ${maxBand}`);
    assert.ok(anyBand / N > 0.9, 'with twelve knights at 25 % somebody nearly always rises');
    assert.ok(total / N > 2 && total / N <= 3);
    // two knights: not both; one knight: that one may
    for (let i = 0; i < 500; i++) assert.ok(risingKnights(ks.slice(0, 2), 100, rnd).length <= 1);
    // friends of the king are slower to rise
    const friends = ks.map((k) => ({ ...k, fr: 80 })); let f = 0; for (let i = 0; i < N; i++) f += risingKnights(friends, 70, rnd).length;
    assert.ok(f < total * 0.5);
    assert.ok(nextPeriod(() => 0) >= 200 && nextPeriod(() => 1) <= 420);
});

test('friendship drops with the unrest; formal duty is not touched here', () => {
    assert.equal(friendDrag(0), 0);
    assert.ok(friendDrag(70) >= 30 && friendDrag(100) <= 60);
    assert.ok(friendDrag(70, 90) > friendDrag(70, 10));
    assert.ok(ramp(0) === 0 && ramp(70) === 1 && ramp(100) > 1);
});

test('every humanoid role has a reaction row', () => {
    for (const r of COMMAND_ROLES) assert.ok(ROLE_REACT[r], r);
    assert.equal(reactionOf('merchant', 5, 0).kind, 'none');
    assert.equal(reactionOf('merchant', 70, 0.01, { trade: true }).kind, 'refuse');
    assert.equal(reactionOf('merchant', 70, 0.99, { trade: true }).kind, 'none');
    assert.equal(reactionOf('farmer', 90, 0.01).kind, 'flee');
    assert.equal(reactionOf('farmer', 30, 0.1).kind, 'whisper');
    assert.equal(reactionOf('king', 100, 0).kind, 'none');
    assert.equal(reactionOf('ghost', 100, 0).kind, 'none');
});

test('old saves (no field), a number, junk: calm or the number; pack drops calm', () => {
    assert.equal(valueOf(unpackRecord(undefined)), 0);
    assert.equal(valueOf(unpackRecord(null)), 0);
    assert.equal(valueOf(unpackRecord('x')), 0);
    assert.equal(valueOf(unpackRecord(42)), 42);
    assert.equal(valueOf(unpackRecord({ v: 500 })), REB.MAX);
    assert.equal(valueOf(unpackRecord({ v: -5 })), 0);
    assert.equal(packRecord(blank()), null);
    assert.equal(valueOf(unpackRecord(packRecord({ v: 33.3 }))), 33.3);
});

// ---- the game side
function world(nKnights = 8) {
    const said = [], orders = [];
    const def = { id: 'c1', name: 'Замок', x: 0, z: 0, kind: 'castle', houses: [{ id: 'h0', c: { x: 10, y: 0, z: 10 }, r: 6, rich: true, inside: { x: 10, y: 0, z: 10 } }, { id: 'h1', c: { x: 40, y: 0, z: 10 }, r: 6, rich: false, inside: { x: 40, y: 0, z: 10 } }] };
    const cs = { def, active: new Map(), hostile: new Map(), awake: true };
    const st = { owner: 'me', ownerName: 'Я', kingDead: true, killed: new Set(), ranks: {} };
    const life = {
        enabled: true, auth: true, castles: new Map([['c1', cs]]), byId: new Map(), game: { localId: 'me', hud: { notify() {} }, character: { group: { position: { x: 0, y: 0, z: 0 } } } },
        state: () => st, rankOf: () => 9, _sees: () => true, _isPlayer: (id) => id === 'me', _playerPos: () => life.pos, pos: { x: 3, y: 0, z: 3 },
        _say: (v, t) => said.push([v.id, t]), _sendState() {}, alog: { note() {}, decision() {} }, fright: { scare() {} },
        talk: { brain: () => ({ character: { temper: 50, kindness: 50, obedience: 50 } }), _status: () => 'king', attention: null, _partner: null },
        orders: { run: (v, name, args, by) => orders.push([v.id, name, args, by]) },
    };
    life.reb = new RebellionLife(life);
    life.rel = new RelationsLife(life);
    const add = (id, role, home = -1, x = 5) => { const v = { id, idx: cs.active.size + 1, role, x, y: 0, z: 5, cs, dead: false, foe: null, mode: 'idle', entry: { home } }; cs.active.set(v.idx, v); life.byId.set(id, v); return v; };
    for (let i = 0; i < nKnights; i++) add('k' + i, 'knight');
    return { life, cs, st, said, orders, add };
}

test('game: only the owner\'s deeds count; the king\'s killing makes him owner with high unrest and a hated king', () => {
    const { life, cs, st, add } = world();
    const v = add('f1', 'farmer');
    assert.equal(life.reb.note(cs, 'other', 'slay'), null);
    life.reb.note(cs, 'me', 'slainKing');
    assert.equal(life.reb.value(cs), REB.KING_SLAIN);
    life.reb.note(cs, 'me', 'execution');
    assert.ok(life.reb.value(cs) > REB.KING_SLAIN);
    const e = life.rel.eff(v, 'me');
    assert.ok(e.sub >= 70, 'formally they obey');
    assert.ok(e.fr < -25, `but they hate: ${e.fr}`);
    assert.equal(life.rel.eff(v, 'me', true).fr, 0);
    void st;
});

test('game: a rich house at full unrest — the family falls on the king; once per visit', () => {
    const { life, cs, add, said } = world();
    life.reb.note(cs, 'me', 'slainKing');
    const fam = [add('a', 'farmer', 0), add('b', 'farmer', 0), add('c', 'farmer', 0)];
    life.pos = { x: 10, y: 0, z: 10 };
    const real = Math.random; Math.random = () => 0.01;
    try { life.reb._homes(cs, 'me', life.pos, life.reb.value(cs)); } finally { Math.random = real; }
    assert.equal(fam.filter((v) => v.foe === 'me').length, 2, 'two at most');
    assert.ok(said.length >= 2);
    fam.forEach((v) => { v.foe = null; });
    life.reb._homes(cs, 'me', life.pos, life.reb.value(cs)); // (the same visit: no new roll)
    assert.equal(fam.filter((v) => v.foe === 'me').length, 0);
});

test('game: a fit raises a few knights, not all; the loyal ones go at them; a plot is left to its own strike', () => {
    const { life, cs, orders } = world(10);
    life.reb.note(cs, 'me', 'slainKing');
    const real = Math.random; let s = 3; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let maxRise = 0;
    try {
        for (let i = 0; i < 300; i++) {
            for (const v of cs.active.values()) { v.foe = null; v.cmd = null; }
            life.reb._fit(cs, 'me', 70, 1e6);
            maxRise = Math.max(maxRise, [...cs.active.values()].filter((v) => v.foe === 'me').length);
        }
    } finally { Math.random = real; }
    assert.ok(maxRise >= 1 && maxRise <= 3, `band ${maxRise}`);
    assert.ok(orders.every((o) => o[2].rebel === true && o[2].mode === 'deadly'));
    life.rel._underPlot = () => true;
    for (const v of cs.active.values()) v.foe = null;
    life.reb._fit(cs, 'me', 70, 1e6);
    assert.equal([...cs.active.values()].filter((v) => v.foe === 'me').length, 0);
});

test('game: the state keeps it; an old state comes up calm; the guest copy follows the host', () => {
    const { life, cs, st } = world();
    life.reb.note(cs, 'me', 'slainKing');
    const packed = life.rel.pack(cs);
    assert.equal(packed.reb.v, REB.KING_SLAIN);
    const fresh = {};
    life.rel.unpack(fresh, packed);
    assert.equal(fresh.reb.v, REB.KING_SLAIN);
    const old = { reb: { v: 50, t: 0 } };
    life.rel.unpack(old, { rel: {}, rep: {} });
    assert.equal(old.reb.v, 0, 'an old save / a calm host: calm');
    life.reb.note(cs, 'me', 'wreck', 5);
    assert.ok(st.reb.v > REB.KING_SLAIN);
});

test('game: merchants refuse the king in a hated place, and not in a calm one', () => {
    const { life, cs, add, said } = world();
    const m = add('m1', 'merchant');
    assert.equal(life.reb.refusesTrade(m, 'me'), false);
    life.reb.note(cs, 'me', 'slainKing');
    life.reb.note(cs, 'me', 'execution', 5);
    let refused = 0; const real = Math.random; Math.random = () => 0.01;
    try { life.reb._shop = null; if (life.reb.refusesTrade(m, 'me')) refused++; } finally { Math.random = real; }
    assert.equal(refused, 1); assert.ok(said.length >= 1);
    assert.equal(life.reb.refusesTrade(m, 'other'), false, 'only the owner is refused');
});

test('game: repairs and a stone monster brought down ease the unrest of the owner\'s place (and only his)', () => {
    const { life, cs } = world();
    life.reb.note(cs, 'me', 'slainKing');
    const a = life.reb.value(cs);
    life.reb.note(cs, 'me', 'repair'); assert.ok(life.reb.value(cs) < a);
    const b = life.reb.value(cs);
    life.reb.note(cs, 'me', 'saved'); assert.ok(life.reb.value(cs) < b);
    const c = life.reb.value(cs);
    life.reb.note(cs, 'other', 'repair'); assert.equal(life.reb.value(cs), c);
});
