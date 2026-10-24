import test from 'node:test';
import assert from 'node:assert/strict';
import { HILL, trackSlope, slopePace, slopeLean, RoutePlanner, HillNav } from '../../src/game/HillWay.js';

/** A field of walls: `wall(x, z)` true = a cliff nobody climbs. Every other step is 1:1 ground. */
const field = (wall) => ({ step: (x, z, y, nx, nz) => (wall(nx, nz) || wall((x + nx) / 2, (z + nz) / 2) ? null : y) });

test('pace: slower uphill, quicker downhill, flat = 1', () => {
    assert.equal(slopePace(0), 1);
    assert.ok(slopePace(1) < 0.75 && slopePace(1) >= HILL.PACE_MIN);
    assert.ok(slopePace(-1) > 1 && slopePace(-1) <= HILL.PACE_MAX);
    assert.ok(slopePace(5) >= HILL.PACE_MIN);
    assert.ok(slopeLean(1) > 0.2 && slopeLean(-1) < 0 && slopeLean(0) === 0);
});

test('trackSlope: the slope comes from how it really moved; a teleport is no slope', () => {
    const v = { x: 0, y: 0, z: 0 };
    trackSlope(v);
    for (let i = 1; i <= 40; i++) { v.x = i * 0.1; v.y = i * 0.1; trackSlope(v); } // 45° up
    assert.ok(v.slope > 0.8 && v.slope < 1.1, `slope ${v.slope}`);
    for (let i = 1; i <= 80; i++) { v.x += 0.1; v.y -= 0.1; trackSlope(v); }
    assert.ok(v.slope < -0.8, `down ${v.slope}`);
    v.x += 50; v.y += 30; trackSlope(v);
    assert.equal(v.slope, 0);
});

test('RoutePlanner: round a long cliff through its gap', () => {
    // a wall along x = 0 from z = -30 to z = 30, a gap at z in [26, 30]
    const wall = (x, z) => Math.abs(x) < 1 && z > -30 && z < 26;
    const p = new RoutePlanner(field(wall), { x: -20, z: 0, y: 0 }, { x: 20, z: 0 }, { margin: 40 });
    while (!p.work(5));
    assert.ok(p.route, 'a route exists');
    const last = p.route[p.route.length - 1];
    assert.ok(Math.hypot(last.x - 20, last.z) < 4);
    assert.ok(p.route.some((c) => c.z >= 26), 'it goes through the gap');
    for (const c of p.route) assert.ok(!wall(c.x, c.z), 'never into the cliff');
});

test('RoutePlanner: out of a pit with steep sides by its ramp', () => {
    // a pit x,z in [-10, 10]; a ramp on its east side z in [-1, 1] is the only way out; the goal is west, beyond the pit's wall
    const wall = (x, z) => Math.max(Math.abs(x), Math.abs(z)) >= 10 && Math.max(Math.abs(x), Math.abs(z)) < 12 && !(x > 0 && Math.abs(z) < 2);
    const p = new RoutePlanner(field(wall), { x: 0, z: 0, y: 0 }, { x: -40, z: 0 }, { margin: 40 });
    while (!p.work(5));
    assert.ok(p.route, 'a route out of the pit');
    assert.ok(p.route.some((c) => c.x > 8), 'by the east ramp');
});

test('RoutePlanner: no way through an endless wall → only up to its foot, never into it', () => {
    const wall = (x) => x > -2 && x < 2;
    const p = new RoutePlanner(field((x) => wall(x)), { x: -20, z: 0, y: 0 }, { x: 20, z: 0 }, { margin: 10, maxCells: 800 });
    while (!p.work(5));
    for (const c of p.route || []) assert.ok(!wall(c.x), 'never into the wall');
    // (nothing to gain: standing at the start is no route)
    const q = new RoutePlanner(field(() => true), { x: 0, z: 0, y: 0 }, { x: 30, z: 0 }, { margin: 10 });
    while (!q.work(5));
    assert.equal(q.route, null);
    assert.equal(q.failed, true);
});

test('RoutePlanner: a goal too far is walked to as far as the way goes (nearest cell)', () => {
    const p = new RoutePlanner(field(() => false), { x: 0, z: 0, y: 0 }, { x: 600, z: 0 }, { margin: 40, maxCells: 300 });
    while (!p.work(5));
    assert.ok(p.route, 'a partial route');
    const last = p.route[p.route.length - 1];
    assert.ok(last.x > 6, `it went ${last.x}`);
});

test('RoutePlanner: a slice never takes long', () => {
    const p = new RoutePlanner(field(() => false), { x: 0, z: 0, y: 0 }, { x: 600, z: 0 }, { margin: 40, maxCells: 4500 });
    const t0 = performance.now();
    p.work(1);
    assert.ok(performance.now() - t0 < 25);
});

test('HillNav: nearer to the goal → no search; stalled → one search, then the route is followed and dropped', () => {
    const nav = new HillNav();
    let clock = 0, left = 100;
    for (let i = 0; i < 300; i++) { clock += 0.1; left -= 0.2; nav.tick(0.1, clock, left, 0, 0); }
    assert.equal(nav.wantPlan(clock), false, 'it gets on: no search');
    for (let i = 0; i < 150; i++) { clock += 0.1; nav.tick(0.1, clock, left, 0, 0); } // 15 s, no nearer
    assert.equal(nav.wantPlan(clock), true);
    nav.begin(clock, { work: () => true, route: [{ x: 5, z: 0 }, { x: 5, z: 9 }] });
    assert.equal(nav.wantPlan(clock), false, 'a search is running');
    nav.work();
    assert.deepEqual(nav.aim(), { x: 5, z: 0 });
    nav.tick(0.1, clock, left, 4.5, 0); // near the first point → the next
    assert.deepEqual(nav.aim(), { x: 5, z: 9 });
    nav.tick(0.1, clock, left, 5, 8.5);
    assert.equal(nav.aim(), null, 'arrived: the route is over');
});

test('HillNav: waiting for good reason does not count; a route nobody follows is dropped', () => {
    const nav = new HillNav();
    let clock = 0;
    for (let i = 0; i < 400; i++) { clock += 0.1; nav.tick(0.1, clock, 50, 0, 0, true); }
    assert.equal(nav.wantPlan(clock), false);
    nav.route = [{ x: 9, z: 9 }]; nav.i = 0;
    for (let i = 0; i < 80; i++) { clock += 0.1; nav.tick(0.1, clock, 50, 0, 0); } // 8 s on the spot
    assert.equal(nav.aim(), null);
});
