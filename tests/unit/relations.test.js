import test from 'node:test';
import assert from 'node:assert/strict';
import { baseSub, effective, bump, blank, visibleBars, TONE, flirtResult, blankRep, isKnown, opinion, firstImpression, hatred, obeys, mayEnterHome, mayTakeThing, plotOf, strikesAlone, DEED } from '../../src/game/Relations.js';

test('a new king gets about 80 of 100 at once; a stranger none; the stubborn a little less', () => {
    assert.equal(baseSub('king', 50), 80);
    assert.ok(baseSub('king', 100) > 80 && baseSub('king', 0) < 80);
    assert.equal(baseSub('traveller'), 0);
    assert.equal(baseSub('commander', 50), 60);
    assert.equal(effective(blank(), 80).sub, 80);
});

test('bars: friendship and love are not drawn at zero (the author\'s rule)', () => {
    assert.deepEqual(visibleBars(effective(blank(), 0)), [], 'a stranger: nothing at all');
    assert.deepEqual(visibleBars(effective(blank(), 80)).map((b) => b.key), ['sub']);
    const r = bump(blank(), { f: 3 });
    assert.deepEqual(visibleBars(effective(r, 80)).map((b) => b.key), ['sub', 'fr']);
    assert.deepEqual(visibleBars(effective(bump(r, { l: 2 }), 80)).map((b) => b.key), ['sub', 'fr', 'lv']);
    assert.deepEqual(visibleBars(effective(bump(blank(), { f: -2 }), 0)).map((b) => `${b.key}${b.value}`), ['fr-2'], 'minus shows too');
});

test('bumps clamp, and love never goes below zero', () => {
    let r = blank();
    for (let i = 0; i < 80; i++) r = bump(r, { f: 5, l: 5 });
    assert.equal(effective(r).fr, 100); assert.equal(effective(r).lv, 100);
    assert.equal(effective(bump(blank(), { l: -9 })).lv, 0);
    assert.equal(effective(bump(blank(), { f: -999 })).fr, -100);
});

test('what the town knows gives a stranger his first opinion; nobody knows — none', () => {
    assert.equal(isKnown(blankRep()), false);
    assert.equal(opinion(blankRep()), 0);
    assert.deepEqual(firstImpression(blankRep(), { kindness: 90 }), blank());
    const good = { ...blankRep(), n: 20, saved: 6, foes: 8 };
    assert.ok(opinion(good) > 20);
    assert.ok(firstImpression(good, { kindness: 80 }).f > 5);
    const bloody = { ...blankRep(), n: 20, slain: 3, hurt: 5 };
    assert.ok(opinion(bloody) < -30);
    assert.ok(firstImpression(bloody, { temper: 80 }).f < -10);
    assert.ok(firstImpression(bloody, {}).s < 0, 'the formal respect falls too');
});

test('words: a kind one warms, an insult chills; a flirt is welcome only from a friend', () => {
    assert.ok(TONE.compliment.f > 0 && TONE.insult.f < 0 && TONE.threat.s < 0);
    assert.ok(flirtResult({ sub: 0, fr: 20, lv: 0 }, { kindness: 60 }).l > 0);
    assert.equal(flirtResult({ sub: 0, fr: 0, lv: 0 }, { kindness: 40 }).l, 0);
    assert.ok(flirtResult({ sub: 0, fr: 0, lv: 0 }, { kindness: 40 }).f < 0);
    assert.ok(DEED.slay.witness.f < DEED.hurt.witness.f);
});

test('duty and friendship both make a man obey — a friend as a friend', () => {
    const c = { obedience: 50 };
    assert.equal(obeys({ sub: 80, fr: 0, lv: 0 }, c, 'serve').yes, true);
    assert.equal(obeys({ sub: 80, fr: 0, lv: 0 }, c, 'serve').by, 'duty');
    const stranger = obeys({ sub: 0, fr: 0, lv: 0 }, c, 'serve');
    assert.equal(stranger.yes, false);
    const friend = obeys({ sub: 0, fr: 70, lv: 0 }, c, 'serve');
    assert.equal(friend.yes, true); assert.equal(friend.by, 'friend');
    assert.equal(obeys({ sub: 0, fr: 40, lv: 0 }, c, 'army').yes, false, 'a friend does not march an army');
    assert.equal(obeys({ sub: -30, fr: -10, lv: 0 }, c, 'basic').yes, false);
});

test('the house and the hand open to friends only', () => {
    assert.equal(mayEnterHome({ sub: 80, fr: 0, lv: 0 }), false, 'a king is not a guest in every house by that');
    assert.equal(mayEnterHome({ sub: 0, fr: 45, lv: 0 }), true);
    assert.equal(mayTakeThing({ sub: 0, fr: 45, lv: 0 }), false);
    assert.equal(mayTakeThing({ sub: 0, fr: 60, lv: 0 }), true);
    assert.equal(mayTakeThing({ sub: 0, fr: 0, lv: 70 }), true);
});

test('hate: disrespect and enmity; love softens it', () => {
    assert.equal(hatred({ sub: 80, fr: 0, lv: 0 }, {}), 0);
    assert.equal(hatred({ sub: -5, fr: -2, lv: 0 }, { temper: 50 }) < 10, true, '«минус один, минус пять» — dislikes, no more');
    assert.ok(hatred({ sub: -60, fr: -70, lv: 0 }, { temper: 50 }) >= 90);
    assert.ok(hatred({ sub: 0, fr: -60, lv: 40 }, {}) < hatred({ sub: 0, fr: -60, lv: 0 }, {}));
    assert.equal(strikesAlone(95, {}), true); assert.equal(strikesAlone(80, { temper: 70 }), true); assert.equal(strikesAlone(80, { temper: 20 }), false); assert.equal(strikesAlone(50, { temper: 99 }), false);
});

test('a plot: enough angry knights conspire; too few — none; the vizier needs both long hate and followers', () => {
    const K = (id, hate) => ({ id, role: 'knight', hate });
    const six = [K('a', 60), K('b', 55), K('c', 10), K('d', 5), K('e', 0), K('f', 0)];
    assert.equal(plotOf(six).plot, false, '2 of 6 are not enough');
    const many = [K('a', 60), K('b', 55), K('c', 70), K('d', 5), K('e', 0), K('f', 0)];
    const p = plotOf(many);
    assert.equal(p.plot, true); assert.equal(p.leader, 'c'); assert.deepEqual(p.members.sort(), ['a', 'b', 'c']); assert.ok(p.loyal.includes('d'));
    const V = (hate) => ({ id: 'v', role: 'advisor', hate });
    const four = [K('a', 45), K('b', 41), K('c', 42), K('d', 44), K('e', 0), K('f', 0), K('g', 0), K('h', 0)];
    assert.equal(plotOf([V(80), ...four], { vizierLong: 30 }).plot, false, 'not long enough');
    const coup = plotOf([V(80), ...four], { vizierLong: 200 });
    assert.equal(coup.plot, true); assert.equal(coup.leader, 'v'); assert.equal(coup.why, 'vizier');
    assert.equal(plotOf([V(80), K('a', 45), K('b', 45), K('c', 0)], { vizierLong: 500 }).plot, false, 'few followers: no coup');
});
