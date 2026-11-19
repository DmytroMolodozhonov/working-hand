import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadSearch, ROAD } from '../../src/game/RoadPlan.js';

/** A world of blocked rectangles; an edge is ok when its straight line meets none (sampled each metre). */
const world = (blocks) => (ax, az, bx, bz) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az));
    for (let s = 0; s <= n; s++) { const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n; if (blocks.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) return false; }
    return true;
};
const run = (o) => { const s = new RoadSearch(o); while (s.status === 'run') s.step(80); return s; };
const reach = (s, g) => { const p = s.path[s.path.length - 1]; return Math.hypot(p.x - g.x, p.z - g.z); };

test('open ground: a straight way, one or two waypoints', () => {
    const s = run({ sx: 0, sz: 0, gx: 80, gz: 0, edgeOk: world([]) });
    assert.equal(s.status, 'found');
    assert.ok(s.path.length <= 2 && reach(s, { x: 80, z: 0 }) <= ROAD.REACH);
});

test('a lake between: goes round it, never through', () => {
    const lake = [[30, -40, 50, 40]];
    const ok = world(lake), s = run({ sx: 0, sz: 0, gx: 80, gz: 0, edgeOk: ok });
    assert.equal(s.status, 'found');
    let px = 0, pz = 0;
    for (const p of s.path) { assert.ok(ok(px, pz, p.x, p.z), 'every leg is free'); px = p.x; pz = p.z; }
    assert.ok(reach(s, { x: 80, z: 0 }) <= ROAD.REACH);
});

test('a dead-end bay (U shape) facing the goal: finds the way out and round', () => {
    const u = [[30, -30, 34, 30], [30, 26, 70, 30], [30, -30, 70, -26]]; // (open to the east, goal at the bottom of... behind the wall)
    const s = run({ sx: 40, sz: 0, gx: 20, gz: 0, edgeOk: world(u) });
    assert.equal(s.status, 'found');
});

test('no way (the goal walled in): gives the nearest reachable cell, does not hang', () => {
    const box = [[60, -30, 64, 30], [96, -30, 100, 30], [60, -30, 100, -26], [60, 26, 100, 30]];
    const s = run({ sx: 0, sz: 0, gx: 80, gz: 0, edgeOk: world(box), maxNodes: 800 });
    assert.ok(['partial', 'fail'].includes(s.status));
    assert.ok(s.expanded <= 800);
});

test('the search is incremental: a step of a few nodes never finishes a long plan', () => {
    const s = new RoadSearch({ sx: 0, sz: 0, gx: 400, gz: 0, edgeOk: world([]) });
    assert.equal(s.step(3), 'run');
    assert.ok(s.expanded <= 3);
});
