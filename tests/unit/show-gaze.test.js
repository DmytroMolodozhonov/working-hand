// I point with my leading hand and the people near look that way (ShowGaze.js, the author 19.11): held steady, no command; not while I cast or fight; the
// sleeping, the fleeing, the far ones and the enemies do not; each turns after his own pause; they look on while I keep pointing and go back after.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShowGaze, SHOW, steady, canNotice, viewers, lookPoint } from '../../src/game/ShowGaze.js';

const person = (id, x, z, extra = {}) => ({ id, x, z, ...extra });
function rig({ people = [], dom = 'right', raised = true, fingers = { index: 0.1, middle: 0.9, ring: 0.9, pinky: 0.9 }, holding = null, dir = { x: 0, y: 0.1, z: -1 }, ground = { x: 0, z: -30 }, busy = {} } = {}) {
    const state = { raised, dir: { ...dir } };
    const g = {
        dom, localId: 'me', isDeadLocal: false, combat: { dead: false, immobile: false }, _castAt: -1e9, focus: { held: () => (busy.held ? 'Levitation' : null) },
        inFight: () => !!busy.fight,
        items: { held: { [dom]: holding } }, weapons: { hands: { right: {}, left: {} } },
        character: { group: { position: { x: 0, y: 0, z: 0 } }, isArmRaised: (s) => state.raised && s === dom, getActiveHands: () => ({ [dom]: { targetState: { fingers } } }) },
        castleLife: { byId: new Map(people.map((p) => [p.id, p])) },
    };
    if (busy.cast) g._castAt = performance.now();
    const sg = new ShowGaze(g, (side, o, d) => { o.x = 0; o.y = 3; o.z = 0; d.x = state.dir.x; d.y = state.dir.y; d.z = state.dir.z; }, (ray) => (ground ? { x: ray.o.x + ray.d.x * 30, z: ray.o.z + ray.d.z * 30 } : null));
    const run = (sec, dt = 0.05) => { for (let t = 0; t < sec; t += dt) sg.update(dt); };
    return { g, sg, state, run };
}

test('pure rules: steadiness, who may notice, the nearest few, where they look', () => {
    assert.ok(steady({ x: 0, y: 0, z: -1 }, { x: 0.05, y: 0, z: -0.9987 }));
    assert.ok(!steady({ x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }));
    const me = { x: 0, z: 0 };
    assert.ok(canNotice(person('a', 5, 5), me));
    for (const bad of [{ dead: true }, { sleep: true }, { foe: {} }, { fleeT: 3 }, { lev: {} }]) assert.ok(!canNotice(person('b', 5, 5, bad), me), JSON.stringify(bad));
    assert.ok(!canNotice(person('c', SHOW.NEAR + 1, 0), me), 'far');
    const many = Array.from({ length: 9 }, (_, i) => person('p' + i, i + 1, 0));
    assert.ok(SHOW.MAX_VIEWERS <= 2 && SHOW.NEAR <= 12, 'only those close by (the author 20.11: they looked though not asked)');
    const v = viewers(many, me);
    assert.equal(v.length, SHOW.MAX_VIEWERS);
    assert.deepEqual(v.map((x) => x.v.id), ['p0', 'p1'].slice(0, SHOW.MAX_VIEWERS), 'the nearest');
    assert.ok(v.every((x) => x.delay >= SHOW.REACT_MIN && x.delay <= SHOW.REACT_MIN + SHOW.REACT_SPAN), 'each his own pause');
    assert.ok(new Set(v.map((x) => x.delay.toFixed(3))).size > 1, 'not all at once');
    const p = lookPoint({ o: { x: 0, y: 3, z: 0 }, d: { x: 0, y: 0, z: -1 } }, null);
    assert.ok(Math.abs(p.z + SHOW.LOOK_D) < 1e-6 && Math.abs(p.x) < 1e-6);
    assert.deepEqual(lookPoint({ o: { x: 0, y: 3, z: 0 }, d: { x: 0, y: 0, z: -1 } }, { x: 0, z: -12 }), { x: 0, z: -12 }, 'the ground point if nearer');
});

test('the hand held up and steady: the people near turn to look where it points — after their own pauses, nobody before the hold time', () => {
    const a = person('a', 6, 2, { animT: 0 }), b = person('b', -8, 5), far = person('far', 60, 0), sleeper = person('s', 3, 3, { sleep: true });
    const r = rig({ people: [a, b, far, sleeper] });
    r.run(SHOW.HOLD_S - 0.2);
    assert.ok(!a.glance && !b.glance, 'not yet: a hand just raised is nothing');
    r.run(0.4 + SHOW.REACT_MIN + SHOW.REACT_SPAN + 0.3);
    for (const v of [a, b]) { assert.ok(v.glance, v.id + ' looks'); assert.ok(Math.abs(v.glance.x) < 3 && Math.abs(v.glance.z + 30) < 3, 'at the point the hand shows'); assert.ok(v.glance.show); }
    assert.ok(!far.glance && !sleeper.glance, 'the far one and the sleeper do not');
});

test('while I keep pointing they keep looking (the glance is refreshed to the hand\'s point); drop the hand — it is left to run out', () => {
    const a = person('a', 6, 2);
    const r = rig({ people: [a] });
    r.run(2.5);
    assert.ok(a.glance);
    a.glance.t -= 2; // (his picture ticks it down)
    r.run(0.3);
    assert.ok(a.glance.t > SHOW.GLANCE_S - 0.5, 'refreshed while I point');
    r.state.dir = { x: 0.7, y: 0.1, z: -0.7 }; // (the hand turns: after a hold they look at the new place)
    r.run(1.2);
    assert.ok(a.glance.x > 10, 'follows the hand: ' + a.glance.x);
    r.state.raised = false;
    const t0 = a.glance.t;
    r.run(1.0);
    assert.equal(a.glance.t, t0, 'the hand is down: nothing refreshes it — it runs out by itself');
});

test('not a pointing finger: a spell just cast, a held spell, a fight, the sky, a shaking hand, the off hand, a dead hero', () => {
    const mk = () => person('a', 6, 2);
    for (const busy of [{ cast: true }, { held: true }, { fight: true }]) { const a = mk(), r = rig({ people: [a], busy }); r.run(3); assert.ok(!a.glance, JSON.stringify(busy)); }
    { const a = mk(), r = rig({ people: [a], dir: { x: 0, y: 0.9, z: -0.3 } }); r.run(3); assert.ok(!a.glance, 'into the sky'); }
    { const a = mk(), r = rig({ people: [a] }); for (let i = 0; i < 60; i++) { r.state.dir = { x: i % 2 ? 0.8 : -0.8, y: 0.1, z: -0.6 }; r.run(0.1); } assert.ok(!a.glance, 'a hand waved about is not held'); }
    { const a = mk(), r = rig({ people: [a], raised: false }); r.run(3); assert.ok(!a.glance, 'hand down'); }
    { const a = mk(), r = rig({ people: [a] }); r.g.isDeadLocal = true; r.run(3); assert.ok(!a.glance, 'dead'); }
    { const a = person('a', 6, 2, { foe: {} }), r = rig({ people: [a] }); r.run(3); assert.ok(!a.glance, 'an enemy does not turn to see'); }
});

test('a glance a command gave is not taken over (his own order stays)', () => {
    const a = person('a', 6, 2, { glance: { x: 50, z: 50, t: 4 } });
    const r = rig({ people: [a] });
    r.run(3);
    assert.equal(a.glance.x, 50, 'the command\'s point');
});

import { assessPlace, commentOf, COMMENTS } from '../../src/game/ShowGaze.js';

test('what he makes of the place: the danger first, then bodies, animals, people, things, houses, nothing', () => {
    const pt = { x: 0, z: -30 };
    const at = (x, z) => ({ group: { position: { x, y: 0, z } } });
    const base = () => ({ zombies: [], animals: { list: [] }, death: { bodies: new Map() }, items: { loose: new Map() }, castleLife: { byId: new Map(), castles: new Map() }, remotes: new Map(), character: { group: { position: { x: 0, y: 0, z: 0 } } } });
    assert.equal(assessPlace(base(), pt).kind, 'nothing');
    const g1 = base(); g1.zombies.push(at(2, -28));
    assert.equal(assessPlace(g1, pt).kind, 'zombie');
    const g2 = base(); g2.zombies.push(at(2, -28)); g2.animals.list.push(at(1, -30));
    assert.equal(assessPlace(g2, pt).kind, 'zombie', 'the danger is first');
    const g3 = base(); g3.death.bodies.set(1, { x: 3, y: 0, z: -31 }); g3.animals.list.push(at(1, -30));
    assert.equal(assessPlace(g3, pt).kind, 'corpse');
    const g4 = base(); g4.animals.list.push(at(1, -30));
    assert.equal(assessPlace(g4, pt).kind, 'animal');
    const g5 = base(); g5.castleLife.byId.set('v', { id: 'v', x: 2, z: -29 });
    assert.equal(assessPlace(g5, pt).kind, 'people');
    assert.equal(assessPlace(g5, pt, g5.castleLife.byId.get('v')).kind, 'nothing', 'not himself');
    const g6 = base(); g6.items.loose.set('u', { item: {}, model: { position: { x: 1, y: 0, z: -29 } } });
    assert.equal(assessPlace(g6, pt).kind, 'item');
    const g7 = base(); g7.fire = { burningAt: () => true };
    assert.equal(assessPlace(g7, pt).kind, 'fire');
    const far = base(); far.zombies.push(at(80, 80));
    assert.equal(assessPlace(far, pt).kind, 'nothing', 'a zombie far from the place shown is not there');
    for (const k of Object.keys(COMMENTS)) assert.ok(commentOf(k, 'x').length > 5);
});

test('one remark per pointing: the nearest person who looks says it, once; another pointing — another remark after the pause', () => {
    const a = person('a', 6, 2), b = person('b', 9, 4);
    const r = rig({ people: [a, b] });
    const said = [];
    r.sg.sayIt = (v, as) => said.push([v.id, as.kind]);
    r.run(SHOW.HOLD_S + SHOW.REACT_MIN + SHOW.REACT_SPAN + SHOW.ASSESS_AFTER + 1.5);
    assert.equal(said.length, 1, JSON.stringify(said));
    assert.equal(said[0][0], 'a', 'the nearest');
    r.run(3);
    assert.equal(said.length, 1, 'not twice for one pointing');
});

test('only a real POINTING finger shows: an open or fisted hand, a wand or any thing in it, an aimed wand — nobody turns (the author 20.11)', () => {
    const a = person('a', 5, 2);
    for (const [name, opt] of [['open hand', { fingers: { index: 0, middle: 0, ring: 0, pinky: 0 } }], ['fist', { fingers: { index: 1, middle: 1, ring: 1, pinky: 1 } }], ['a wand in it', { holding: { item: { kind: 'wand' } } }], ['no fingers seen', { fingers: null }]]) {
        const r = rig({ people: [a], ...opt }); r.run(3);
        assert.ok(!a.glance, name + ': nobody looks');
    }
    const r = rig({ people: [a] }); r.run(3); assert.ok(a.glance, 'the index out, the rest curled, empty hand: they look');
});
