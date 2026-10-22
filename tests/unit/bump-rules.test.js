import test from 'node:test';
import assert from 'node:assert/strict';
import { blowSpeed, knockOutcome, isApology, strikeLine } from '../../src/game/BumpRules.js';
import { IMPACT } from '../../src/game/Impact.js';

const N = [0, 0, 1]; // the body's surface looks towards +z; a hand coming from there moves in −z
const MIN = IMPACT.TOUCH_V;

test('a villager walking into a still hand is no blow', () => {
    assert.equal(blowSpeed([0, 0, 0], [0, 0, 0], [0, 0, 0], N, MIN), 0);
});

test('a slow palm by the counter is no blow', () => {
    assert.equal(blowSpeed([0, 0, -1], [0, 0, -1], [0, 0, 0], N, MIN), 0);
});

test('a one-frame flick (tracking jitter) is no blow, a real swing is', () => {
    assert.equal(blowSpeed([0, 0, -4], [0, 0, 0], [0, 0, 0], N, MIN), 0);
    assert.equal(blowSpeed([0, 0, -6], [0, 0, -5], [0, 0, 0], N, MIN), 6);
    assert.equal(blowSpeed([0, 0, -90], [0, 0, -90], [0, 0, 0], N, MIN), 0, 'a tracking jump');
});

test('my body walking into somebody carries the hand: not a hand blow', () => {
    assert.equal(blowSpeed([0, 0, -3], [0, 0, -3], [0, 0, -3], N, MIN), 0);
});

test('a first light knock is only told off, a second within 20 s fights, a hard one fights at once', () => {
    assert.equal(knockOutcome({ hard: false, count: 1 }), 'told');
    assert.equal(knockOutcome({ hard: false, count: 2 }), 'fight');
    assert.equal(knockOutcome({ hard: true, count: 1 }), 'fight');
    assert.equal(knockOutcome({ hard: false, count: 2, owner: true }), 'offended');
});

test('sorry is recognised', () => {
    for (const t of ['извините', 'Простите!', 'прошу прощения', 'извини', 'прости', 'сорри', 'ой, извините меня']) assert.ok(isApology(t), t);
    for (const t of ['покажи товары', 'сколько стоит', 'проститутка']) assert.ok(!isApology(t), t);
});

test('the journal line says what, how fast, who and whom', () => {
    const l = strikeLine({ kind: 'punch', part: 'body', speed: 5.234, hand: 'left', who: 'Маг Ион', by: 'me', hard: false });
    assert.match(l, /punch/); assert.match(l, /5\.2 м\/с/); assert.match(l, /Маг Ион/);
});

import { beating, windDowns, lessonSpell, packHostile, unpackHostile, LESSON } from '../../src/game/BumpRules.js';
import { CastleLife } from '../../src/game/CastleLife.js';

test('a wizard is beaten into a lesson only by several real blows, not one', () => {
    let rec = null, now = 1000;
    for (let i = 1; i <= 3; i++) { const r = beating(rec, 'me', 1, now += 1000); rec = r.rec; assert.equal(r.lesson, false); }
    assert.equal(beating(rec, 'me', 1, now + 1000).lesson, true);
    assert.equal(beating(rec, 'other', 1, now).lesson, false, 'another player starts anew');
});

test('wind: knocked down once is a protest, twice within 20 s a lesson', () => {
    const a = windDowns([], 1000);
    assert.equal(a.lesson, false);
    assert.equal(windDowns(a.list, 10000).lesson, true);
    assert.equal(windDowns(a.list, 30000).lesson, false);
});

test('a lesson is never freezing or deadly', () => {
    for (let i = 0; i <= 10; i++) assert.ok(['Expelliarmus', 'Stupefy'].includes(lessonSpell(i / 10)));
});

test('anger keeps the time left, not the clock', () => {
    assert.equal(packHostile(100000, 40000), 60000);
    assert.equal(packHostile(1000, 5000), 0);
    assert.equal(unpackHostile(60000, 500000), 560000);
});

function stubLife() {
    const life = Object.create(CastleLife.prototype);
    const cs = { def: { id: 'c1' }, hostile: new Map(), active: new Map() };
    Object.assign(life, { castles: new Map([['c1', cs]]), states: new Map(), game: { authority: true, localId: 'me', remotes: new Map(), arenaDuels: null }, said: [] });
    life._isPlayer = (id) => id === 'me';
    life.state = () => ({ owner: null });
    life._fights = () => true;
    life._say = (v, t) => life.said.push(t);
    return { life, cs };
}

test('anger of a place survives snapshot → restore with the time left', () => {
    const { life, cs } = stubLife();
    cs.hostile.set('me', Date.now() + 90000);
    const snap = life.snapshot();
    assert.ok(snap.__hostile.c1 > 80000 && snap.__hostile.c1 <= 90000);
    const b = stubLife();
    b.life.restore(JSON.parse(JSON.stringify(snap)));
    const left = b.cs.hostile.get('me') - Date.now();
    assert.ok(left > 80000 && left <= 90000, 'remaining ' + left);
});

test('wind that touches a wizard never starts a fight; two falls in 20 s let him alone give a lesson', () => {
    const { life, cs } = stubLife();
    const w = { id: 1, wizard: true, cs, name: 'Ион', x: 0, z: 0, y: 0 };
    const other = { id: 2, wizard: true, cs, name: 'Лис' };
    life.windKnocked(w, 'me');
    assert.ok(!w.foe && !w.lesson, 'one fall: words only');
    life.windKnocked(w, 'me');
    assert.equal(w.foe, 'me');
    assert.ok(w.lesson);
    assert.ok(!other.foe && !cs.hostile.size, 'nobody else, no hostility');
});

test('lesson ends when the pupil is stunned, and the wizard goes back to his business', () => {
    const { life, cs } = stubLife();
    const w = { id: 1, wizard: true, cs, name: 'Ион' };
    assert.ok(life._lesson(w, 'me'));
    life.game.combat = { stunned: true };
    assert.equal(life._pupilDown('me'), true);
    life._lessonOver(w);
    assert.ok(!w.foe && !w.lesson && !w.grudge);
    assert.equal(life._lesson(w, 'me'), false, 'not again at once');
});
