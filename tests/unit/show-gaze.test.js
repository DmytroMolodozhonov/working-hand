// I point with my leading hand and the people near look that way (ShowGaze.js, the author 19.11): held steady, no command; not while I cast or fight; the
// sleeping, the fleeing, the far ones and the enemies do not; each turns after his own pause; they look on while I keep pointing and go back after.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ShowGaze, SHOW, steady, canNotice, viewers, lookPoint } from '../../src/game/ShowGaze.js';

const person = (id, x, z, extra = {}) => ({ id, x, z, ...extra });
function rig({ people = [], dom = 'right', raised = true, dir = { x: 0, y: 0.1, z: -1 }, ground = { x: 0, z: -30 }, busy = {} } = {}) {
    const state = { raised, dir: { ...dir } };
    const g = {
        dom, localId: 'me', isDeadLocal: false, combat: { dead: false, immobile: false }, _castAt: -1e9, focus: { held: () => (busy.held ? 'Levitation' : null) },
        inFight: () => !!busy.fight,
        character: { group: { position: { x: 0, y: 0, z: 0 } }, isArmRaised: (s) => state.raised && s === dom },
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
    const v = viewers(many, me);
    assert.equal(v.length, SHOW.MAX_VIEWERS);
    assert.deepEqual(v.map((x) => x.v.id), ['p0', 'p1', 'p2', 'p3'], 'the nearest');
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
