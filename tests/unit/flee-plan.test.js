/**
 * FleePlan: a frightened one runs away from the threats, never past them (the author: «бежать от
 * меня, и не по дорожке, а просто как можно дальше»).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLEE, threatDist, awayDir, fleeSearch, pathPasses, openWay } from '../../src/game/FleePlan.js';

/** A little graph: nodes {id, x, y, z}, ways [a, b]. */
function graph(nodes, ways) {
    const N = nodes.map((n, id) => ({ id, y: 0, ...n }));
    const adj = N.map(() => []);
    for (const [a, b] of ways) { adj[a].push(b); adj[b].push(a); }
    return { nodes: N, adj };
}

test('away from the threats: the nearer one pulls harder; the distance counts their size', () => {
    const T = [{ x: 0, z: 0, r: 5 }];
    assert.equal(threatDist({ x: 12, z: 0 }, T), 7);
    const a = awayDir({ x: 3, z: 4 }, T);
    assert.ok(Math.abs(a.x - 0.6) < 1e-9 && Math.abs(a.z - 0.8) < 1e-9);
});

test('a building with one door right by the attacker: it runs to the back room, not out past him', () => {
    // the tower: 0 the hall by the door, 1 the door, 2 outside by the attacker, 3 the far road;
    // 4, 5 the back rooms (inside, away from the door)
    const g = graph([
        { x: 0, z: 0 }, { x: 0, z: 8 }, { x: 0, z: 14 }, { x: 0, z: 60 },
        { x: 0, z: -10 }, { x: 0, z: -18 },
    ], [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5]]);
    const T = [{ x: 0, z: 18, r: 14 }]; // (the attacker just outside the door)
    const r = fleeSearch(g, 0, g.nodes[0], T);
    assert.ok(r, 'it has a place to go');
    assert.equal(r.goal, 5, 'the farthest back room');
    assert.ok(!r.path.includes(1) && !r.path.includes(2), 'never through the door by him');
    assert.ok(!pathPasses(r.path, g.nodes, g.nodes[0], T));
});

test('two ways out: the one away from the threat, even if longer', () => {
    // a square yard: the threat by the east gate; the west gate is farther from where it stands
    const g = graph([
        { x: 0, z: 0 }, { x: 15, z: 0 }, { x: 40, z: 0 }, { x: -20, z: 0 }, { x: -70, z: 0 },
    ], [[0, 1], [1, 2], [0, 3], [3, 4]]);
    const T = [{ x: 18, z: 0, r: 8 }];
    const r = fleeSearch(g, 0, g.nodes[0], T);
    assert.equal(r.goal, 4);
    assert.ok(!r.path.includes(1));
});

test('far enough already: nowhere better — it stays (no running for nothing)', () => {
    const g = graph([{ x: 0, z: 0 }, { x: 3, z: 0 }], [[0, 1]]);
    const T = [{ x: -200, z: 0, r: 10 }];
    assert.ok(threatDist(g.nodes[0], T) > FLEE.SAFE);
    const r = fleeSearch(g, 0, g.nodes[0], T);
    assert.ok(!r || r.goal === 1); // (at most a step: never towards it)
});

test('a way that leads into the threat is no way to flee by', () => {
    const nodes = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }];
    const T = [{ x: 10, z: 0, r: 4 }];
    assert.equal(pathPasses([0, 1, 2], nodes, nodes[0], T), true);
    assert.equal(pathPasses([0], nodes, nodes[0], T), false);
});

test('across the open land: straight away from it — round a wall when straight is shut', () => {
    const T = [{ x: 0, z: 0, r: 5 }];
    const open = openWay({ x: 10, z: 0 }, T, () => true);
    assert.ok(open && open.x > 20 && Math.abs(open.z) < 1, 'straight away');
    // a wall right behind it (x > 12): it goes off to a side, still away from the threat
    const q = openWay({ x: 10, z: 0 }, T, (x) => x < 12);
    assert.ok(q, 'a way round');
    assert.ok(threatDist(q, T) > threatDist({ x: 10, z: 0 }, T), 'and it takes it farther');
    // walls all round: cornered
    assert.equal(openWay({ x: 10, z: 0 }, T, () => false), null);
});
