// «Дирижёр предметов» («Вингардиум Левиоса Максима» на вещь): рой вещей — набор, предел, паровозик,
// вихрь, щит, залп, падение при «стоп» / мане, мана, «кто/что» (ItemSwarmRules.js, ItemSwarm.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SWARM, SWARM_TARGETS, SwarmSim, ModeKeeper, swarmDrain, itemRefusal, aimedAt, hitDamage, hitPush, absorbOf, wallBreaks, wallSlots, ringSlots, wallHalfArc } from '../../src/game/ItemSwarmRules.js';

const I0 = () => ({ head: { x: 0, y: 4, z: 6 }, body: { x: 0, y: 1, z: 0 }, omega: 0, wandYaw: 0, bodies: [], selfId: 'p:me', blocked: null, floorY: () => 0 });
const run = (sim, I, sec, dt = 1 / 60) => { const ev = []; for (let t = 0; t < sec; t += dt) ev.push(...sim.step(dt, I)); return ev; };
const mk = (n) => { const s = new SwarmSim(); for (let i = 0; i < n; i++) s.add('u' + i, { x: i * 2, y: 0.5, z: 3 }); return s; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('the first thing obeys, others join by the wand — up to the limit, no repeats', () => {
    const s = new SwarmSim();
    assert.ok(s.add('a', { x: 0, y: 0, z: 0 }));
    assert.ok(!s.add('a', { x: 0, y: 0, z: 0 }), 'the same thing twice');
    for (let i = 0; i < SWARM.MAX_ITEMS + 10; i++) s.add('t' + i, { x: i, y: 0, z: 0 });
    assert.equal(s.size, SWARM.MAX_ITEMS);
    assert.ok(SWARM.MAX_ITEMS >= 24, 'dozens of things (the author: очень много)');
});

test('mana: a little for each thing after the first, never past the cap', () => {
    assert.equal(swarmDrain(0), 0);
    assert.equal(swarmDrain(1), 0);
    assert.ok(swarmDrain(2) > 0);
    assert.ok(swarmDrain(10) > swarmDrain(5));
    assert.equal(swarmDrain(SWARM.MAX_ITEMS), Math.min(SWARM.CAP, SWARM.PER_ITEM * (SWARM.MAX_ITEMS - 1)));
    assert.ok(swarmDrain(1000) <= SWARM.CAP);
});

test('what cannot join: gifts of the gods, unpaid goods, things already held or being summoned', () => {
    const ok = { item: { kind: 'apple', uid: 'x' } };
    assert.equal(itemRefusal(ok), null);
    assert.match(itemRefusal({ item: { kind: 'iceRod', uid: 'r', godGift: true } }), /дар богов/);
    assert.match(itemRefusal({ item: { kind: 'apple', uid: 'y', shop: { paid: false, price: 3 } } }), /не оплачен/);
    assert.equal(itemRefusal({ item: { kind: 'apple', uid: 'y', shop: { paid: true } } }), null);
    assert.ok(itemRefusal({ ...ok, lev: true }));
    assert.ok(itemRefusal({ ...ok, swarm: true }));
    assert.ok(itemRefusal({ ...ok, accio: true }));
    assert.ok(itemRefusal({ ...ok, inCaul: true }));
    assert.ok(itemRefusal(null));
});

test('the wand takes the thing it points at, not the nearest', () => {
    const items = [{ id: 'near', x: 5, y: 0, z: 1.8, r: 0.4 }, { id: 'aimed', x: 0, y: 0, z: 12, r: 0.4 }, { id: 'far', x: 0, y: 0, z: 90, r: 0.4 }];
    const hit = aimedAt(items, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    assert.equal(hit.id, 'aimed');
    assert.equal(aimedAt([items[2]], { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), null, 'out of range');
});

test('the train: the first hangs at the wand, the rest follow in the order lifted, with a lag, spaced', () => {
    const s = mk(6), I = I0();
    run(s, I, 4);
    const m = s.members;
    assert.ok(dist(m[0], I.head) < 0.5, 'the head is at the wand');
    for (let i = 1; i < m.length; i++) assert.ok(Math.abs(dist(m[i], m[i - 1]) - SWARM.SPACING) < 0.5, `link ${i}`);
    // the wand moves away: the tail lags (it is farther from the new point than the head)
    I.head = { x: 12, y: 4, z: 6 };
    run(s, I, 0.3);
    assert.ok(dist(m[5], I.head) > dist(m[0], I.head) + 2, 'the tail lags behind the head');
    assert.ok(m.every((x) => !x.fly));
});

test('the vortex: the things wind round the hero at ring radii, turning as fast as the hand', () => {
    const s = mk(14), I = I0();
    s.mode = 'orbit';
    I.omega = 6;
    run(s, I, 3);
    const nRing = ringSlots(14);
    s.members.forEach((m, i) => {
        const r = Math.hypot(m.x - I.body.x, m.z - I.body.z);
        const want = SWARM.R0 + nRing[i].ring * SWARM.R_GAP;
        assert.ok(Math.abs(r - want) < 0.3, `ring ${nRing[i].ring}: ${r} vs ${want}`);
    });
    const a0 = s.spin;
    run(s, I, 1);
    const fast = s.spin - a0;
    I.omega = 2; const b0 = s.spin; run(s, I, 1);
    assert.ok(fast > (s.spin - b0) * 2, 'faster hand — faster rings');
    I.omega = -6; const c0 = s.spin; run(s, I, 0.5);
    assert.ok(s.spin < c0, 'the other way round');
});

test('the hand circling decides the mode; the shield and the volley are not changed by it', () => {
    const k = new ModeKeeper();
    assert.equal(k.next('train', 0.2, 0.1), 'train');
    assert.equal(k.next('train', 1.2, 0.1), 'orbit');
    assert.equal(k.next('orbit', 0.05, 0.3), 'orbit', 'a short pause');
    let m = 'orbit'; for (let t = 0; t < 1.5; t += 0.1) m = k.next(m, 0.05, 0.1);
    assert.equal(m, 'train', 'the hand stops: back to the train');
    assert.equal(k.next('shield', 3, 0.1), 'shield');
    assert.equal(k.next('launch', 3, 0.1), 'launch');
});

test('the shield: a wall between the hero and where the wand points; blows land in the things', () => {
    const s = mk(8), I = I0();
    s.mode = 'shield'; s.wallYaw = 0;
    I.wandYaw = 0;
    run(s, I, 3);
    assert.ok(s.wallUp());
    for (const m of s.members) assert.ok(Math.abs(Math.hypot(m.x, m.z) - SWARM.SHIELD_D) < 0.4, 'on the wall, in front');
    assert.ok(s.members.every((m) => m.z > 0), 'in front of the hero');
    assert.ok(s.faces(0, 10), 'a blow from the front');
    assert.ok(!s.faces(0, -10), 'not from behind');
    assert.ok(!s.faces(10, 0.1), 'not from the side');
    const r = s.absorb(0, 10, absorbOf('Sapira'));
    assert.ok(r && !r.broke, 'a weak charge: the thing holds');
    // a strong one breaks the thing out: it falls
    const r2 = s.absorb(0, 10, absorbOf('AvadaKedavra'));
    assert.ok(r2.broke || s.absorb(0, 10, 1).broke);
    const out = s.members.filter((m) => m.out);
    assert.ok(out.length >= 1);
    const ev = run(s, I, 3);
    assert.ok(ev.some((e) => e.type === 'land' && e.m.out), 'the broken-out thing falls to the ground');
    // too few things — no wall
    const small = mk(2); small.mode = 'shield';
    assert.ok(!small.faces(0, 10));
    assert.ok(wallHalfArc(30) > wallHalfArc(3), 'more things — a wider wall');
    assert.equal(wallSlots(9).length, 9);
    assert.ok(wallBreaks(true) && !wallBreaks(false), 'the gods\' spells sweep the wall away');
    assert.ok(absorbOf('Sapira') < absorbOf('Bombardo') || absorbOf('Sapira') < absorbOf('AvadaKedavra'));
});

test('the volley: things fly one after another at the aimed creature, hit once with their weight × speed, and fall', () => {
    const s = mk(5), I = I0();
    run(s, I, 2);
    const body = { id: 'z:1', kind: 'z', cid: 1, x: 0, y: 1, z: 30, r: 0.9, hy: 1.6 };
    I.bodies = [body];
    const n = s.launch({ aim: { x: 0, y: 1, z: 30 }, dir: { x: 0, y: 0, z: 1 } }, body.id);
    assert.equal(n, 5);
    const ev = run(s, I, 3);
    const hits = ev.filter((e) => e.type === 'hit');
    assert.equal(hits.length, 5, 'each one hits once');
    for (const h of hits) { assert.ok(h.v > SWARM.LAUNCH_V0 - 1); assert.equal(h.body.id, 'z:1'); }
    assert.ok(s.members.every((m) => m.done), 'then they fall by themselves (the game gives them to the physics)');
    // damage by weight × speed, never endless
    assert.ok(hitDamage(4, 30) > hitDamage(0.2, 30));
    assert.ok(hitDamage(0.15, 20) >= 1);
    assert.ok(hitDamage(100, 100) <= SWARM.MAX_DMG);
    assert.ok(hitPush(4, 30) > hitPush(0.2, 30) && hitPush(100, 100) <= 7);
});

test('a flying thing stops at a wall and never goes through the ground', () => {
    const s = mk(1), I = I0();
    run(s, I, 1);
    I.blocked = (x, y, z) => z > 12 && y < 20; // a wall at z = 12
    I.selfId = 'p:me';
    s.launch({ aim: null, dir: { x: 0, y: 0, z: 1 } });
    const ev = run(s, I, 2);
    assert.ok(ev.some((e) => e.type === 'land' && e.how === 'wall'));
    assert.ok(s.members[0].z <= 12.5, 'did not pass the wall');
    assert.ok(!ev.some((e) => e.type === 'hit'));
});

test('the creature the thing was thrown from (the hero) is never hit', () => {
    const s = mk(1), I = I0();
    run(s, I, 1);
    I.bodies = [{ id: 'p:me', kind: 'p', cid: 'me', x: 0, y: 1, z: 6, r: 1, hy: 2 }];
    s.launch({ aim: null, dir: { x: 0, y: 0, z: 1 } });
    const ev = run(s, I, 1);
    assert.ok(!ev.some((e) => e.type === 'hit'));
});

test('«стоп» / out of mana: every thing is let go and falls (nothing hangs); set down gently — no speed', () => {
    const s = mk(7), I = I0();
    I.head = { x: 12, y: 4, z: 6 };
    run(s, I, 0.4);
    const rough = s.drop(false);
    assert.equal(rough.length, 7);
    assert.equal(s.size, 0);
    assert.ok(rough.some((e) => Math.hypot(e.vx, e.vy, e.vz) > 0), 'the swing it had');
    const g = mk(4); run(g, I, 0.4);
    assert.ok(g.drop(true).every((e) => e.vx === 0 && e.vy === 0 && e.vz === 0), 'set down gently');
});

test('collisions: held things slide along a wall and do not go under the ground', () => {
    const s = mk(4), I = I0();
    I.blocked = (x, y, z) => x > 9 && y < 30;
    I.head = { x: 40, y: 4, z: 6 };
    run(s, I, 3);
    assert.ok(s.members.every((m) => m.x <= 9.5), 'the wall holds the train');
    const t = mk(3); const J = I0(); J.head = { x: 0, y: -50, z: 6 }; J.floorY = () => 2;
    run(t, J, 3);
    assert.ok(t.members.every((m) => m.y >= 2.5), 'never under the floor');
});

test('«кто/что»: SWARM_TARGETS answers for every creature and thing', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'phoenix', 'owl', 'dragon', 'iceCastle', 'ships', 'looseThings', 'godGifts', 'world', 'shield']) {
        assert.ok(SWARM_TARGETS[k]?.why?.length > 10, `no answer for ${k}`);
    }
});

test('wiring: the Maxima starts the conductor on a thing, charges the mana, Combat asks the wall, Shield/Attack words reach it', () => {
    const lm = fs.readFileSync('src/game/LevitationMaxima.js', 'utf8');
    assert.match(lm, /this\.swarm\.pickThing/);
    assert.match(lm, /this\.swarm\.start/);
    assert.match(lm, /this\.swarm\.extraDrain/);
    assert.match(lm, /swarm\.release\(gentle\)/);
    const cb = fs.readFileSync('src/game/Combat.js', 'utf8');
    assert.match(cb, /levMax\?\.swarm\?\.faces/);
    assert.match(cb, /swarm\.took\(from, kind\)/);
    const g = fs.readFileSync('src/game/Game.js', 'utf8');
    assert.match(g, /name === 'GroundShield'\) && this\.levMax\?\.swarm\?\.active/);
    assert.match(g, /this\.levMax\?\.swarm\?\.active\) \{ const r = this\.levMax\.swarm\.attack/);
    // the plain «Левиоса» and «Акцио» leave the swarm's things alone
    assert.match(fs.readFileSync('src/game/Levitation.js', 'utf8'), /!L\.accio && !L\.asked && !L\.swarm/);
    assert.match(fs.readFileSync('src/game/Accio.js', 'utf8'), /L\.asked \|\| L\.accio \|\| L\.swarm/);
});
