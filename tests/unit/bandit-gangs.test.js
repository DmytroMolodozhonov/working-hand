// The robber gangs on horses (the author 21.11): sizes 2…5, four strategies, roles, rings and flanks, morale, the torso's turn, the two new riding poses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BANDIT, STRATEGY, gangSize, pickStrategy, rolesFor, ringAt, ringHeading, flankPoints, behindPoint, broken, shotTurn, headTo, BanditGangs } from '../../src/game/BanditGangs.js';
import { MODES } from '../../src/entities/VillagerModel.js';
import { roleTitle } from '../../src/game/CastleLife.js';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('a gang has 2…5 riders, every size comes up', () => {
    const seen = new Set();
    for (let i = 0; i < 400; i++) { const n = gangSize(); assert.ok(n >= 2 && n <= 5); seen.add(n); }
    assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
    assert.equal(gangSize(() => 0), 2); assert.equal(gangSize(() => 0.9999), 5);
});

test('the strategies: all four are chosen, by weight', () => {
    const c = {};
    for (let i = 0; i < 2000; i++) { const s = pickStrategy(3); c[s] = (c[s] || 0) + 1; }
    assert.deepEqual(Object.keys(c).sort(), Object.keys(STRATEGY).sort());
    assert.ok(Object.values(c).every((x) => x > 150), JSON.stringify(c));
});

test('who is who: at least one swordsman always; a carousel has an archer; some gangs are a bow and two swords', () => {
    for (let n = 2; n <= 5; n++) for (const st of Object.keys(STRATEGY)) for (let i = 0; i < 60; i++) {
        const r = rolesFor(n, st);
        assert.equal(r.length, n);
        assert.ok(r.includes('rider'), `${n} ${st}: no swordsman`);
        if (st === 'circle') assert.ok(r.includes('archer'), 'carousel: an archer');
    }
    // the author's example: one archer and two swordsmen
    assert.deepEqual(rolesFor(3, 'charge', seq(0.9, 0.9, 0.9, 0.9)).sort(), ['archer', 'rider', 'rider']);
});

test('the ring: the tangent plus a pull to the radius; a flank; behind the back', () => {
    // at the radius: the heading is the tangent (a quarter turn from the radial line), outside it leans in, inside it leans out
    const R = 15, on = ringHeading(R, 0, 0, 0, R, 1), out = ringHeading(R + 10, 0, 0, 0, R, 1), inn = ringHeading(R - 10, 0, 0, 0, R, 1);
    const dirOf = (h) => ({ x: -Math.sin(h), z: -Math.cos(h) });
    assert.ok(Math.abs(dirOf(on).x) < 1e-6 && Math.abs(dirOf(on).z) > 0.99, 'at the ring: along it');
    assert.ok(dirOf(out).x < -0.1, 'outside: back towards the centre');
    assert.ok(dirOf(inn).x > 0.1, 'inside: out to the ring');
    const p = ringAt(10, 5, 20, 0); assert.deepEqual([p.x, p.z], [30, 5]);
    const [l, r] = flankPoints(0, 0, 100, 0, 30);
    assert.ok(Math.hypot(l.x, l.z) > 29.9 && l.z * r.z < 0, 'two opposite sides of the line they come along');
    const b = behindPoint(0, 0, 0, 42); assert.ok(Math.abs(b.z - 42) < 1e-9, 'a player looking along −z has his back at +z');
});

test('morale: half down — the rest ride away', () => {
    assert.equal(broken(2, 2), false); assert.equal(broken(1, 2), true);
    assert.equal(broken(2, 3), false); assert.equal(broken(1, 3), true);
    assert.equal(broken(3, 5), false); assert.equal(broken(2, 5), true); assert.equal(broken(2, 4), true); assert.equal(broken(3, 4), false);
});

test('the torso turns to the target: ahead 0, to the left +, behind — no shot', () => {
    // a horse looking along −z (yaw 0); a target ahead / to the left (−x) / to the right / behind
    assert.ok(Math.abs(shotTurn(0, 0, -10).rel) < 1e-9 && shotTurn(0, 0, -10).ok);
    const left = shotTurn(0, -10, -10), right = shotTurn(0, 10, -10);
    assert.ok(left.rel > 0 && right.rel < 0 && left.ok && right.ok);
    assert.equal(shotTurn(0, 0, 10).ok, false, 'straight behind: no');
    assert.ok(Math.abs(headTo(0, -1)) < 1e-12);
});

test('the robbers: the poses exist (and are last in the list: the old modes keep their numbers), a title of their own, a quick horse', () => {
    assert.ok(MODES.includes('rideAttack') && MODES.includes('rideShoot'));
    assert.ok(MODES.indexOf('rideAttack') > MODES.indexOf('earthRest'), 'new modes at the end: the net keeps numbers');
    assert.equal(roleTitle({ role: 'knight', title: 'Разбойница', female: true }), 'Разбойница');
    assert.ok(BANDIT.CHARGE > 8.5 && BANDIT.RUN > 8.5, 'faster than an ordinary rider of the roads (8.5 m/s)');
    assert.ok(BANDIT.SIZE[0] === 2 && BANDIT.SIZE[1] === 5);
});

test('a gang is made once and only for a hero that can be hurt', () => {
    const g = { combat: { enabled: true, dead: false }, isDeadLocal: false, castleLife: null };
    const b = new BanditGangs({ ...g, animals: {} });
    assert.equal(b.enabled(), true);
    assert.equal(new BanditGangs({ ...g, combat: { enabled: false } }).enabled(), false, 'Creative-immortal: none');
    assert.equal(new BanditGangs({ ...g, tutorial: { done: false } }).enabled(), false, 'the lesson: none');
    assert.equal(new BanditGangs({ ...g, school: { phase: 'class' } }).enabled(), false, 'the school: none');
    assert.equal(new BanditGangs({ ...g, arenaDuels: { mode: {} } }).enabled(), false, 'the duel mode: none');
    assert.equal(new BanditGangs({ ...g, combat: { enabled: true, dead: true } }).enabled(), false, 'a dead hero: none');
});

import { RAID, raiderStats, isWizPlace, settleOk } from '../../src/game/DarkRaiders.js';
import { DAY_MS, RAID_FREE_DAYS, inCaveAt } from '../../src/game/BanditGangs.js';
import { darkOfEntry } from '../../src/game/DarkMagic.js';
import { OUTFIT_KINDS, OUTFIT_RU } from '../../src/entities/VillagerOutfits.js';

test('dark raiders: black magic 40…80, mana 50…100 cells, the rank by the mana; both ends come up', () => {
    const dk = new Set(), mn = new Set();
    for (let i = 0; i < 3000; i++) {
        const s = raiderStats();
        assert.ok(s.dark >= 40 && s.dark <= 80 && s.mana >= 50 && s.mana <= 100);
        assert.equal(s.rank, s.mana < 75 ? 'novice' : 'adept');
        dk.add(s.dark); mn.add(s.mana);
    }
    assert.ok(dk.has(40) && dk.has(80) && mn.has(50) && mn.has(100));
    assert.deepEqual(raiderStats(() => 0), { dark: 40, mana: 50, rank: 'novice' });
    assert.deepEqual(raiderStats(() => 0.9999), { dark: 80, mana: 100, rank: 'adept' });
});

test('dark raiders: their level is the entry\'s own (the marks on the body); the black robe exists but is never rolled for an ordinary wizard', () => {
    assert.equal(darkOfEntry({ kind: 'wander' }, { role: 'wanderer', dark: 63 }, 'x'), 63);
    assert.ok(!OUTFIT_KINDS.includes('blackmage') && OUTFIT_RU.blackmage);
});

test('dark raiders: mostly near wizards\' places; a wizards\' place is a tower, a wizards\' settlement or a wizards\' hamlet', () => {
    assert.ok(isWizPlace({ kind: 'tower' }) && isWizPlace({ kind: 'wizvillage' }) && isWizPlace({ kind: 'hamlet', mage: true }));
    assert.ok(!isWizPlace({ kind: 'hamlet' }) && !isWizPlace({ kind: 'castle' }) && !isWizPlace(null));
    assert.equal(settleOk(2, () => 0.99), true);
    assert.equal(settleOk(0, () => 0.99), false);
    assert.equal(settleOk(0, () => 0.05), true, 'a few come from nowhere');
    let near = 0; for (let i = 0; i < 2000; i++) if (settleOk(0)) near++;
    assert.ok(near / 2000 < 0.25);
});

test('the first two days are quiet (play time kept in the save); a cave is no place for a raid', () => {
    const b = new BanditGangs({ combat: { enabled: true }, animals: {} });
    assert.equal(b.open(), false);
    b.playMs = RAID_FREE_DAYS * DAY_MS - 1; assert.equal(b.open(), false);
    b.playMs = RAID_FREE_DAYS * DAY_MS; assert.equal(b.open(), true);
    const c = new BanditGangs({ combat: { enabled: true }, animals: {} });
    c.restore(b.snapshot()); assert.equal(c.open(), true, 'kept with the world');
    c.restore({ playMs: 5 }); assert.equal(c.open(), false);
    // underground: the hero's own flag, or the depth below the original surface
    const pos = { x: 0, y: 10, z: 0 };
    assert.equal(inCaveAt({ _inCave: true, character: { group: { position: pos } } }, pos), true);
    assert.equal(inCaveAt({ terrain: { data: { heightAt: () => 40 } } }, { x: 0, y: 10, z: 0 }), true, '30 m below the surface');
    assert.equal(inCaveAt({ terrain: { data: { heightAt: () => 10 } } }, { x: 0, y: 12, z: 0 }), false, 'on the ground');
    assert.equal(inCaveAt({ space: { offEarth: true }, terrain: { data: { heightAt: () => 99 } } }, pos), false, 'off the Earth: no caves');
    assert.ok(RAID.NEAR[0] > 90);
});
