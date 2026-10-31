// WandererMind.js: the people of the roads answer an attack and a miss near them (radii, walls, the 90 % / 50:50 die, the weak, the king).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CastleLife } from '../../src/game/CastleLife.js';
import { WANDER, missZone, missVerdict, fightChance, commonerDecide, dieOf, isWeak, wandererClass, threatOver, tooFar } from '../../src/game/WandererMind.js';

function life({ me = { x: 0, y: 1.95, z: 0 }, sees = true, site = 'errant' } = {}) {
    const L = Object.create(CastleLife.prototype);
    const g = { authority: true, localId: 'me', remotes: new Map(), isNight: false, character: { group: { position: new THREE.Vector3(me.x, me.y, me.z) } }, collision: { lineOfSight: () => sees } };
    Object.assign(L, { game: g, states: new Map(), castles: new Map(), byId: new Map(), said: [], log: [] });
    L._say = (v, t) => L.said.push([v.id, t]);
    L.alog = { decision: (v, t) => L.log.push(t) };
    const cs = { def: { id: 'c1', kind: site }, active: new Map(), hostile: new Map(), graph: { nodes: [] } };
    L.castles.set('c1', cs);
    const add = (id, role, x, z, extra = {}) => { const v = { id, role, cs, x, y: 0, z, yaw: 0, hp: 10, ...extra }; cs.active.set(id, v); L.byId.set(id, v); return v; };
    return { L, cs, add };
}

test('zones: ≤6 hit, ≤15 near, ≤30 only a loud thing; a wall keeps only the loud', () => {
    assert.equal(missZone(3), 'hit');
    assert.equal(missZone(10), 'near');
    assert.equal(missZone(20), null);
    assert.equal(missZone(20, { loud: true }), 'heard');
    assert.equal(missZone(40, { loud: true }), null);
    assert.equal(missZone(3, { blocked: true }), null, 'a quiet charge behind a wall: nothing');
    assert.equal(missZone(3, { blocked: true, loud: true }), 'heard', 'a blast through a wall: heard only');
});

test('verdicts: hit zone = attack; near = die by class and rank; unseen culprit = search; heard = turn', () => {
    assert.equal(missVerdict({ cls: 'knight', zone: 'hit', knows: true }).act, 'fight');
    assert.equal(missVerdict({ cls: 'knight', zone: 'hit', knows: false }).act, 'search');
    assert.equal(missVerdict({ cls: 'knight', zone: 'near', knows: true, roll: 0.69 }).act, 'fight');
    assert.equal(missVerdict({ cls: 'knight', zone: 'near', knows: true, roll: 0.71 }).act, 'turn');
    assert.equal(missVerdict({ cls: 'wizard', rank: 'adept', zone: 'near', knows: true, roll: 0.49 }).act, 'fight');
    assert.equal(missVerdict({ cls: 'wizard', rank: 'adept', zone: 'near', knows: true, roll: 0.51 }).act, 'turn');
    assert.equal(missVerdict({ cls: 'knight', zone: 'heard', knows: true }).act, 'turn');
    assert.ok(fightChance('wizard', 'master') > fightChance('wizard', 'teacher') && fightChance('wizard', 'teacher') > fightChance('wizard', 'adept') && fightChance('wizard', 'adept') > fightChance('wizard', 'novice'));
    assert.equal(missVerdict({ cls: 'commoner', zone: 'hit', knows: true }).act, 'none');
});

test('1000 travellers: ~90 % hit back after a blow, ~50 % after a killing; the die is deterministic', () => {
    let a = 0, w = 0;
    for (let i = 0; i < 1000; i++) {
        if (commonerDecide({ id: 'p' + i, kind: 'attacked' }).stance === 'attack') a++;
        if (commonerDecide({ id: 'p' + i, kind: 'witness' }).stance === 'attack') w++;
    }
    assert.ok(a > 860 && a < 940, 'attacked: ' + a);
    assert.ok(w > 450 && w < 550, 'witness: ' + w);
    assert.equal(dieOf('x1', 1), dieOf('x1', 1));
    assert.deepEqual(commonerDecide({ id: 'q', kind: 'attacked', now: 5 }).stance, commonerDecide({ id: 'q', kind: 'attacked', now: 5 }).stance);
});

test('the decision holds 60 s (no changing of mind), then a new die; the weak always run', () => {
    const d1 = commonerDecide({ id: 'z9', kind: 'attacked', now: 1000 });
    const d2 = commonerDecide({ id: 'z9', kind: 'witness', prev: d1.mem, now: 1000 + 59000 });
    assert.equal(d2.fresh, false); assert.equal(d2.stance, d1.stance);
    const d3 = commonerDecide({ id: 'z9', kind: 'attacked', prev: d1.mem, now: 1000 + 61000 });
    assert.equal(d3.fresh, true); assert.equal(d3.mem.n, 2);
    for (let i = 0; i < 200; i++) assert.equal(commonerDecide({ id: 'w' + i, weak: true }).stance, 'flee');
    assert.ok(isWeak({ elder: true }) && isWeak({ weak: true }) && !isWeak({}));
    assert.ok(threatOver(0, WANDER.CALM_S * 1000 + 1) && !threatOver(0, 1000) && tooFar(WANDER.LEASH + 1) && !tooFar(10));
    assert.equal(wandererClass({ role: 'knight', siteKind: 'castle' }), null, 'castle people: the old rules');
    assert.equal(wandererClass({ role: 'knight', siteKind: 'errant' }), 'knight');
});

test('a bolt passing 10 m from a road knight (culprit seen): flinch, turn; a near wizard shield; no fight needed at 20 m', () => {
    const { L, add } = life({ me: { x: 0, y: 1.95, z: -12 } });
    const k = add('c1:1', 'knight', 10, 0);
    L.passBy(new THREE.Vector3(-5, 2.5, 0), new THREE.Vector3(0, 2.5, 0), 'me', { x: 0, y: 0, z: -12 });
    assert.ok(k.flinchT > 0 && k.readyUntil > Date.now(), 'he turned and is alert (10 m, near zone)');
    assert.ok(L.log.some((t) => /nearMiss/.test(t)));
    const far = add('c1:2', 'knight', 40, 0);
    L.passBy(new THREE.Vector3(-5, 2.5, 0), new THREE.Vector3(0, 2.5, 0), 'me', { x: 0, y: 0, z: -12 });
    assert.ok(!far.flinchT, 'a quiet bolt 40 m away: nothing');
});

test('a bolt within 6 m of a road knight who sees the caster: he fights after his reaction time', () => {
    const { L, cs, add } = life({ me: { x: 0, y: 1.95, z: -12 } });
    const k = add('c1:1', 'knight', 3, 0);
    L.passBy(new THREE.Vector3(-5, 2.5, 0), new THREE.Vector3(0, 2.5, 0), 'me', { x: 0, y: 0, z: -12 });
    assert.ok(k.foe === 'me' || (k.wLag && k.wLag.t > 0), 'a fight or about to be (the lag)');
    if (k.wLag) k.wLag.fn();
    assert.equal(k.foe, 'me');
    assert.ok(cs.hostile.get('me') > Date.now());
});

test('behind a wall a quiet bolt is not noticed; a blast is heard up to 30 m', () => {
    const { L, add } = life({ sees: false });
    const k = add('c1:1', 'knight', 4, 0);
    L.passBy(new THREE.Vector3(-5, 2.5, 0), new THREE.Vector3(0, 2.5, 0), 'me', { x: 0, y: 0, z: -12 });
    assert.ok(!k.flinchT, 'quiet, behind a wall');
    const k2 = add('c1:2', 'knight', 25, 0);
    L.startleAround({ x: 0, y: 2, z: 0 }, 4, 'me', { x: 0, y: 0, z: -12 });
    assert.ok(k2.flinchT > 0, 'a blast through a wall: heard, turned');
});

test('ordinary travellers: a blow makes ~90 % hit back (and their party); the king / friends are not touched', () => {
    let fought = 0;
    for (let i = 0; i < 300; i++) {
        const { L, add } = life({ site: 'folk' });
        L.fright = { scare: (v) => { v.fear = { level: 2 }; } };
        const v = add('c1:' + i, 'farmer', 3, 0);
        L.wanderAttacked(v, 'me', 'attacked');
        if (v.foe === 'me') fought++; else assert.ok(v.fear, 'the rest run');
        assert.equal(v.roadBrave, v.foe === 'me');
        const again = v.foe;
        L.wanderAttacked(v, 'me', 'attacked'); // (a second blow: the same decision)
        assert.equal(v.foe, again);
    }
    assert.ok(fought > 250 && fought < 295, 'fought: ' + fought);
});

test('a killing: the travellers who see it split ~50/50, the ones behind a wall do not react; old men always run', () => {
    const { L, add } = life({ site: 'folk' });
    L.fright = { scare: (v) => { v.fear = { level: 2 }; } };
    const dead = add('c1:d', 'farmer', 0, 0); dead.dead = true;
    let fought = 0, ran = 0;
    for (let i = 0; i < 200; i++) { const v = add('c1:w' + i, 'farmer', 5, 0); L._wanderWitness(dead, 'me'); if (v.foe === 'me') fought++; else if (v.fear) ran++; }
    assert.equal(fought + ran, 200);
    assert.ok(fought > 70 && fought < 130, 'fought: ' + fought);
    const old = add('c1:old', 'farmer', 6, 0, { elder: true }); L._wanderWitness(dead, 'me');
    assert.ok(!old.foe && old.fear);
    L.game.collision.lineOfSight = () => false;
    const hid = add('c1:hid', 'farmer', 7, 0); L._wanderWitness(dead, 'me');
    assert.ok(!hid.wm && !hid.foe, 'did not see');
});

test('the fear is over: the decision runs out and the fighter stands down; castle farmers keep the old rules', () => {
    const { L, add } = life({ site: 'folk' });
    const v = add('c1:1', 'farmer', 3, 0, { roadBrave: false });
    L.fright = { scare: () => {} };
    const dd = commonerDecide({ id: v.id, kind: 'attacked' });
    L.wanderAttacked(v, 'me', 'attacked');
    v.wm.until = Date.now() - 1; v.wm.stance = 'attack'; v.foe = 'me'; v.roadBrave = true;
    L._wanderCalm(v);
    assert.equal(v.roadBrave, false); assert.equal(v.foe, null); assert.ok(dd);
    const c = life({ site: 'castle' });
    const f = c.add('c1:9', 'farmer', 2, 0);
    assert.equal(c.L.wanderAttacked(f, 'me', 'attacked'), false);
});
