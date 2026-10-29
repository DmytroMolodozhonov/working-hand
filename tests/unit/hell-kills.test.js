// «Let the Hellfire Come» — чёрная магия: сам каст тьму не добавляет, +1 за каждого убитого им человекоподобного (один раз на жертву).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DARK_SPELLS, onDarkCast, addDark, DarkHero } from '../../src/game/DarkMagic.js';
import { HELL, HELL_KILL_TARGETS, humanoid, hellRecent, HellLedger, hellKill } from '../../src/game/HellKills.js';
import { hellKilled } from '../../src/game/Mana.js';

test('Hellfire is black magic, but casting it gives no darkness', () => {
    assert.ok(DARK_SPELLS.has('Hellfire'));
    const g = { dark: new DarkHero(null) };
    for (let i = 0; i < 50; i++) assert.equal(onDarkCast(g, 'Hellfire', () => 0), 0);
    assert.equal(g.dark.level, 0);
    assert.equal(onDarkCast(g, 'AvadaKedavra', () => 0), 1, 'the other black spells still give it');
});

test('who counts: every humanoid, not animals / zombies / skeletons / dragons / trees', () => {
    for (const [k, role] of [['v', 'knight'], ['v', 'king'], ['v', 'student'], ['v', 'merchant'], ['p', null], ['c', 'sailor'], ['c', 'blackbeard'], ['I', 'queen']]) assert.ok(humanoid(k, role), k + role);
    for (const [k, role] of [['a', null], ['z', null], ['c', 'skeleton'], ['D', null], ['t', null], ['s', null], ['f', null], ['o', null], ['g', null], ['I', 'snowman'], ['I', 'monster']]) assert.ok(!humanoid(k, role), k + role);
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'iceCastle', 'blackship', 'dragon', 'phoenix', 'owl']) assert.ok(HELL_KILL_TARGETS[k]?.why, k);
});

test('a death is the Hellfire\'s only if its last blow was within the window', () => {
    assert.ok(hellRecent(1000, 1000 + HELL.WINDOW));
    assert.ok(!hellRecent(1000, 1000 + HELL.WINDOW + 1));
    assert.ok(!hellRecent(0, 5));
});

test('+1 per victim, once per victim; none for the unfit; credited to the caster', () => {
    const ledger = new HellLedger(), got = [];
    const credit = (to, m) => got.push([to, m.dark]);
    assert.equal(hellKill(ledger, credit, 'p1', 'v', 'knight', 'a'), 1);
    assert.equal(hellKill(ledger, credit, 'p1', 'v', 'knight', 'a'), 0, 'a dead one is not counted twice');
    assert.equal(hellKill(ledger, credit, 'p1', 'v', 'student', 'b'), 1);
    assert.equal(hellKill(ledger, credit, 'p1', 'a', null, 'c'), 0, 'an animal');
    assert.equal(hellKill(ledger, credit, 'p1', 'c', 'skeleton', 'd'), 0, 'a skeleton');
    assert.equal(hellKill(ledger, credit, null, 'v', 'knight', 'e'), 0, 'no author');
    assert.deepEqual(got, [['p1', 1], ['p1', 1]]);
});

test('the ledger is capped', () => {
    const l = new HellLedger();
    for (let i = 0; i < HELL.LEDGER_MAX + 50; i++) l.claim('x' + i);
    assert.ok(l.done.size <= HELL.LEDGER_MAX);
});

test('game side: the host credits its own hero at once, a guest through the message; the level stops at 100', () => {
    const sent = [];
    const g = { localId: 'me', dark: new DarkHero(null), remotes: new Map([['guest', {}]]), sync: { manaCredit: (to, m) => sent.push([to, m.dark]) } };
    g.mana = { magicKill() {} };
    assert.equal(hellKilled(g, 'me', 'v', 'knight', 'k1'), 1);
    assert.equal(g.dark.level, 1);
    assert.equal(hellKilled(g, 'guest', 'v', 'knight', 'k2'), 1);
    assert.deepEqual(sent, [['guest', 1]]);
    addDark(g.dark, 200);
    assert.equal(g.dark.level, 100);
});
