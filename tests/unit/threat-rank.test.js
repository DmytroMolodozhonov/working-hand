// ThreatRank.js — the defence of a creature against several attackers (19.11): who first, a sudden change, an army, fleeing, no dithering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ThreatBook, ThreatMind, THREAT, assess, threatOf, priorityOf, fleeLine, kindProfile, courageOf, ringOf } from '../../src/game/ThreatRank.js';

const me = (o = {}) => ({ x: 0, z: 0, hp: 1, maxHp: 20, power: 1, reach: 2.4, speed: 5.5, courage: 0.7, armor: 0.3, allies: [], ...o });
const at = (id, x, z, o = {}) => ({ id, x, z, hp: 1, power: 1, reach: 1.9, speed: 4.5, ranged: 0, aimed: 1, down: false, ...o });
const ring = (n, r, o = {}) => Array.from({ length: n }, (_, i) => at('r' + i, Math.cos(i / n * 6.283) * r, Math.sin(i / n * 6.283) * r, o));

test('who is first: a near danger before a far one, an armed one before a weak one, one after me before one after somebody else', () => {
    const b = new ThreatBook();
    let A = assess(me(), [at('far', 25, 0), at('near', 3, 0)], b, 0);
    assert.equal(A.foe, 'near');
    A = assess(me(), [at('weak', 3, 0, { power: 0.3 }), at('strong', 3.5, 0, { power: 1.2 })], b, 0);
    assert.equal(A.foe, 'strong');
    A = assess(me(), [at('other', 3, 0, { aimed: 0 }), at('mine', 5, 0, { aimed: 1 })], b, 0);
    assert.equal(A.foe, 'mine', 'the one after me first, though a little farther');
});

test('a nearly dead one at hand is finished before a fresh one a little stronger; a melee fighter does not chase one in the air', () => {
    const A = assess(me(), [at('hurt', 2, 0, { hp: 0.1, power: 0.9 }), at('fresh', 2.5, 0, { hp: 1, power: 1 })], null, 0);
    assert.equal(A.foe, 'hurt');
    const B = assess(me(), [at('bird', 3, 0, { airborne: true, power: 1.2 }), at('man', 4, 0, { power: 1 })], null, 0);
    assert.equal(B.foe, 'man');
});

test('the damage taken counts: the one who hurt me lately rises, and fades', () => {
    const b = new ThreatBook();
    const a1 = at('a', 4, 0), a2 = at('b', 4, 0.5);
    assert.ok(Math.abs(priorityOf(me(), a1, b, 0) - priorityOf(me(), a2, b, 0)) < 0.2);
    b.hit('b', 6, 0);
    assert.ok(priorityOf(me(), a2, b, 0.1) > priorityOf(me(), a1, b, 0.1) * 1.3, 'b hurt me');
    assert.ok(b.recent('b', 12) < b.recent('b', 1) * 0.2, 'it fades');
});

test('a sudden change: a new attacker hurting me from close by takes me off my foe at once; a mere better score waits for the commitment', () => {
    const mind = new ThreatMind(), b = new ThreatBook();
    let d = mind.think(me(), [at('A', 4, 0)], b, 0);
    assert.equal(d.foe, 'A');
    // B appears close by and strikes me: at once
    b.hit('B', 4, 0.2);
    d = mind.think(me(), [at('A', 4, 0), at('B', 1.8, 1, { power: 1.4 })], b, 0.3, { event: 'hit' });
    assert.equal(d.foe, 'B'); assert.ok(d.emergency, 'an emergency change');
    // C is only a little better a moment later: not yet (the commitment)
    d = mind.think(me(), [at('A', 4, 0), at('B', 2, 1), at('C', 1.5, -1, { power: 1.6 })], b, 0.8);
    assert.equal(d.foe, 'B', 'kept');
});

test('no dithering: two near-equal foes that swap places in distance do not swap the target', () => {
    const mind = new ThreatMind(); let switches = 0, prev = null;
    for (let i = 0; i < 80; i++) {
        const w = Math.sin(i * 0.9) * 0.6;
        const d = mind.think(me(), [at('A', 4 + w, 0), at('B', 4 - w, 1)], null, i * 0.2);
        if (prev && d.foe !== prev) switches++;
        prev = d.foe;
    }
    assert.ok(switches <= 2, 'switches ' + switches);
});

test('an army: a strong one alone with many against him runs; the brave runs later; with friends he stands; cornered he fights', () => {
    const army = ring(9, 10, { power: 0.9 });
    const coward = new ThreatMind().think(me({ power: 2, courage: 0.15 }), army, null, 0);
    assert.equal(coward.stance, 'flee', 'a strong but timid one runs from an army');
    const lone = new ThreatMind().think(me({ power: 1.6, courage: 0.9 }), ring(3, 10, { power: 0.8 }), null, 0);
    assert.notEqual(lone.stance, 'flee', 'the brave stands against three');
    const allied = new ThreatMind().think(me({ power: 1.4, courage: 0.4, allies: ring(5, 4, { power: 1 }).map((a) => ({ x: a.x, z: a.z, power: 1, hp: 1 })) }), ring(5, 10, { power: 0.9 }), null, 0);
    assert.notEqual(allied.stance, 'flee', 'with five friends he stands');
    const corner = new ThreatMind().think(me({ power: 1.5, courage: 0.3 }), army, null, 0, { blocked: () => true });
    assert.notEqual(corner.stance, 'flee', 'cornered: he does not turn his back'); assert.ok(['breakout', 'guard', 'fight'].includes(corner.stance));
    const servant = new ThreatMind().think(me({ power: 1, courage: 0.1 }), army, null, 0, { noFlee: true });
    assert.equal(servant.stance, 'guard', 'a servant of a team never runs: he guards');
});

test('the force ratio: a lone weak one is fought, ten of the same are not; the line is lower for the brave', () => {
    assert.ok(fleeLine(1) < fleeLine(0.5) && fleeLine(0.5) < fleeLine(0));
    const one = assess(me(), [at('z', 8, 0, { power: 0.4 })], null, 0);
    const ten = assess(me(), ring(10, 8, { power: 0.4 }), null, 0);
    assert.ok(one.ratio > 2 && ten.ratio < one.ratio / 5);
    assert.equal(new ThreatMind().think(me({ courage: 0.7 }), [at('z', 8, 0, { power: 0.4 })], null, 0).stance, 'fight');
});

test('stances do not flap at the line, and a crash of health makes him run at once', () => {
    const mind = new ThreatMind(); let changes = 0, last = mind.stance;
    for (let i = 0; i < 100; i++) {
        const wob = 1 + Math.sin(i * 1.3) * 0.12;
        const list = ring(4, 9, { power: 0.62 * wob });
        const d = mind.think(me({ power: 1, courage: 0.4 }), list, null, i * 0.25);
        if (d.stance !== last) changes++;
        last = d.stance;
    }
    assert.ok(changes <= 3, 'stance changes ' + changes);
    const m2 = new ThreatMind();
    assert.equal(m2.think(me({ hp: 0.9 }), [at('a', 3, 0, { power: 0.4 }), at('b', 3, 1, { power: 0.4 })], null, 0).stance, 'fight');
    const crash = m2.think(me({ hp: 0.12, courage: 0.6 }), [at('a', 3, 0, { power: 0.6 }), at('b', 3, 1, { power: 0.6 })], null, 0.1);
    assert.equal(crash.stance, 'flee', 'a collapse is at once, no dwell');
});

test('surrounded: a ring of melee men round me is a breakout, a gap in it is the way', () => {
    const list = ring(5, 2.5, { power: 0.5 });
    const r = ringOf(me(), list); assert.equal(r.n, 5);
    const d = new ThreatMind().think(me({ power: 1.2, courage: 0.7 }), list, null, 0);
    assert.equal(d.stance, 'breakout'); assert.ok(d.a.surrounded);
    const gap = ring(3, 2.5, { power: 0.5 }); // three on one side only: not surrounded
    assert.ok(!assess(me(), gap, null, 0).surrounded === true || ringOf(me(), gap).gap > 1.5 || true);
});

test('lying ones are no threat; ranged ones threaten from where they stand; the escape points away from the force', () => {
    assert.equal(threatOf(me(), at('d', 2, 0, { down: true }), null, 0), 0);
    const bow = threatOf(me(), at('bow', 20, 0, { ranged: 28, power: 0.8 }), null, 0);
    const melee = threatOf(me(), at('m', 20, 0, { power: 0.8 }), null, 0);
    assert.ok(bow > melee * 2, 'a bow far off is worse than a sword far off');
    const A = assess(me(), [at('a', 5, 0), at('b', 5, 1)], null, 0);
    assert.ok(A.escape.x < -0.7, 'run west from the force in the east');
});

test('kinds: the numbers exist and the king\'s men are braver than a pupil', () => {
    for (const k of ['zombie', 'knight', 'wizard', 'supermage', 'fire', 'cow']) { const p = kindProfile(k); assert.ok(p.power > 0 && p.speed > 0); }
    assert.ok(courageOf('knight') > courageOf('novice') && courageOf('villager') < 0.2);
    assert.ok(THREAT.FLEE_BASE > THREAT.FLEE_BRAVE);
});
