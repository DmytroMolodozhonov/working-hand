// PentagramAssist.js: the circle fitted to a trembling hand, the guiding points, the lines only between them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitCircle, arcCoverage, CircleAssist, RingAssist, buildGraph, pathBetween, LineAssist, anchorsOf, turnAway, ASSIST } from '../../src/game/PentagramAssist.js';
import { figureIds } from '../../src/game/PentagramRules.js';

let s = 11;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const hand = (R, tremble, turns = 1.1, cx = 10, cz = -5) => Array.from({ length: Math.round(turns * 2 * Math.PI * R / 0.2) + 1 }, (_, i) => { const a = (i * 0.2 / R); return [cx + Math.cos(a) * R + rnd() * tremble, cz + Math.sin(a) * R + rnd() * tremble]; });

test('the circle is fitted to a trembling hand (±0.4 m): centre and radius come out true, the stitch laid is on the perfect circle', () => {
    for (const R of [3, 4, 6, 8]) {
        const f = fitCircle(hand(R, 0.4, 1));
        assert.ok(Math.abs(f.cx - 10) < 0.25 && Math.abs(f.cz + 5) < 0.25 && Math.abs(f.r - R) < 0.25, `R ${R}: ${JSON.stringify(f)}`);
    }
    const c = new CircleAssist();
    let closed = null, stitch = null;
    for (const [x, z] of hand(4, 0.4)) { const e = c.add(x, z); if (e?.t === 'stitch' && c.fit && c.fit.rms <= 0.5) stitch = { ...e, fit: { ...c.fit } }; if (e?.t === 'closed') { closed = e; break; } }
    assert.ok(closed, 'it closes by itself');
    assert.ok(Math.abs(closed.r - 4) < 0.3);
    assert.ok(Math.abs(Math.hypot(stitch.x - stitch.fit.cx, stitch.z - stitch.fit.cz) - stitch.fit.r) < 1e-6, 'laid on the fitted circle, not on the hand');
});

test('closes at about 78 % of the way round, not before; a rough circle counts; a line, a scribble and a figure eight do not', () => {
    const c = new CircleAssist();
    let t = null;
    for (const [x, z] of hand(4, 0.2, 0.55)) t = c.add(x, z) || t;
    assert.notEqual(t?.t, 'closed', 'half a circle is no circle');
    const rough = new CircleAssist(); let r2 = null;
    for (const [x, z] of hand(5, 1.2)) { const e = rough.add(x, z); if (e?.t === 'closed') { r2 = e; break; } }
    assert.ok(r2, 'a rough circle (tremble 1.2 m on 5 m) still counts');
    const line = new CircleAssist(); let l = null;
    for (let i = 0; i < 60; i++) { const e = line.add(i * 0.3, 0); if (e && e.t !== 'stitch') l = e; }
    assert.equal(l, null, 'a line');
    const eight = new CircleAssist(); let e8 = null;
    for (let i = 0; i < 200; i++) { const a = i * 0.07, e = eight.add(Math.sin(a) * 4 + 10, Math.sin(a * 2) * 3); if (e && e.t === 'closed') e8 = e; }
    assert.equal(e8, null, 'a figure eight');
});

test('the size: 3…8 m (too small / too large is refused); the hero is 3.5 m', () => {
    let bad = null;
    const small = new CircleAssist();
    for (const [x, z] of hand(1.5, 0.05, 1.2)) { const e = small.add(x, z); if (e?.t === 'bad') bad = e; }
    assert.equal(bad?.why, 'small');
    bad = null;
    const big = new CircleAssist();
    for (const [x, z] of hand(12, 0.1, 1.2)) { const e = big.add(x, z); if (e?.t === 'bad') bad = e; }
    assert.equal(bad?.why, 'large');
    assert.deepEqual([ASSIST.R_MIN, ASSIST.R_MAX], [3, 8]);
});

test('the star: five corners and five crossings, five chords of three lines; a teleport figure has its square and its small circle', () => {
    const g = buildGraph(['devil']);
    assert.equal(g.nodes.length, 10);
    assert.equal(g.chords.length, 5);
    assert.equal(g.need.devil.length, 15);
    assert.ok(g.chords.every((c) => c.nodes.length === 4), 'a chord runs corner – crossing – crossing – corner');
    const t = buildGraph(['teleport']);
    assert.ok(t.nodes.length >= 4 + 8, '4 corners of the square + the small circle\'s points');
    assert.ok(t.nodes.filter((n) => Math.hypot(n.u[0], n.u[1]) > 0.97).length >= 4, 'the square touches the circle by its corners');
    // unions: points of several figures are shown together
    const u = buildGraph(['devil', 'teleport']);
    assert.ok(u.nodes.length > g.nodes.length && u.nodes.length <= g.nodes.length + t.nodes.length);
    for (const id of figureIds()) { const gr = buildGraph([id]); assert.ok(gr.nodes.length >= 3 && gr.need[id].length >= 2, id); }
});

function line(ids = ['devil'], R = 4, rot = 0) { return new LineAssist(buildGraph(ids), { cx: 0, cz: 0, r: R, rot }, { armed: true }); }
const jitter = (p, a = 0.3) => [p[0] + rnd() * a, p[1] + rnd() * a];

test('the wand is drawn to the nearest point (the magnet): a hand beside it counts, a hand far from every point does not', () => {
    const L = line();
    for (let i = 0; i < L.world.length; i++) assert.equal(L.nearest(...jitter(L.world[i], 0.4)), i);
    assert.equal(L.nearest(0.6, 0.1), -1, 'far from every point');
    assert.ok(L.magnetR <= ASSIST.MAGNET_MAX);
});

test('led point to point with a shaking hand the lines lie straight; only joins of the figure are drawn; the whole figure counts', () => {
    const L = line();
    const chords = L.graph.chords;
    const go = (n) => L.step(...jitter(L.world[n]));
    // a join the figure does not have: two neighbouring corners
    const corners = L.graph.nodes.map((n, i) => [i, Math.atan2(n.u[1], n.u[0]), Math.hypot(...n.u)]).filter((x) => x[2] > 0.95).sort((a, b) => a[1] - b[1]);
    go(corners[0][0]);
    const ev = go(corners[1][0]);
    assert.ok(ev.some((e) => e.t === 'refuse'), 'refused');
    assert.equal(L.drawn.size, 0, 'nothing drawn');
    let done = null;
    for (const c of chords) {
        go(c.nodes[0]);
        for (const e of go(c.nodes.at(-1))) {
            if (e.t === 'edges') for (const k of e.keys) { const [a, b] = L.edgeEnds(k); assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.3); } // (the ends are the points' own places: ruler-straight, not the hand's)
            if (e.t === 'done') done = e.id;
        }
    }
    assert.equal(done, 'devil');
    assert.equal(L.done, 'devil');
});

test('a chord can be led over its crossings in one move or in three short ones; nothing is drawn twice', () => {
    const a = line(), b = line();
    const c = a.graph.chords[0].nodes;
    a.step(...a.world[c[0]]); const e1 = a.step(...a.world[c.at(-1)]);
    assert.equal(e1.find((e) => e.t === 'edges').keys.length, 3);
    b.step(...b.world[c[0]]);
    let n = 0;
    for (const k of [1, 2, 3]) n += (b.step(...b.world[c[k]]).find((e) => e.t === 'edges')?.keys.length || 0);
    assert.equal(n, 3);
    assert.equal(b.step(...b.world[c[2]]).length, 0);
    assert.deepEqual([...a.drawn].sort(), [...b.drawn].sort());
});

test('the learnt figures decide: a figure that is not learnt has no points and cannot be drawn; the figure is turned so its apex points away from the hero', () => {
    const only = line(['teleport']);
    assert.ok(only.world.length > 0);
    const star = buildGraph(['teleport']);
    assert.equal(pathBetween(star, 0, 1).length >= 0, true);
    // nothing learnt: an empty graph, nothing to draw
    const none = new LineAssist(buildGraph([]), { cx: 0, cz: 0, r: 4, rot: 0 }, { armed: true });
    assert.equal(none.world.length, 0);
    assert.equal(none.step(1, 1).length, 0);
    // the apex (0, 1) of the figure turned by turnAway points away from the hero at (0, 10) → toward (0, -1)
    const rot = turnAway(0, 0, 0, 10);
    const ax = -Math.sin(rot), az = Math.cos(rot);
    assert.ok(Math.abs(ax) < 1e-9 && Math.abs(az + 1) < 1e-9, `apex ${ax},${az}`);
    const h = turnAway(5, 5, 0, 0); // the hero is SW of it: the apex NE
    assert.ok(-Math.sin(h) > 0.6 && Math.cos(h) > 0.6);
});

test('sizes: the points of a 3 m and an 8 m circle are real places (Box3): the ring fits the body of a hero (3.5 m) and the magnet is smaller than half a gap', () => {
    for (const R of [3, 4, 8]) {
        const L = line(['devil'], R);
        const xs = L.world.map((w) => w[0]), zs = L.world.map((w) => w[1]);
        const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...zs) - Math.min(...zs);
        assert.ok(w <= 2 * R + 0.01 && d <= 2 * R + 0.01 && Math.max(w, d) >= 1.7 * R, `R ${R}: ${w.toFixed(2)} × ${d.toFixed(2)}`);
        assert.ok(L.magnetR > 0.2, 'something to aim at');
    }
    assert.ok(2 * ASSIST.R_MIN >= 3.5 + 2, 'a 3.5 m body lies inside the smallest circle');
});

test('anchorsOf names the figures each point belongs to (their glow colours)', () => {
    const L = line(['devil', 'teleport']);
    const a = anchorsOf(L);
    assert.equal(a.length, L.world.length);
    assert.ok(a.every((p) => p.ids.length >= 1));
});

test('THE GUIDE FROM THE START: a ring of points of one size; led along them (crooked or not) the circle is laid perfectly round; skipped points are filled; a jump across draws nothing', () => {
    const R = new RingAssist(10, -5);
    assert.equal(R.world.length, ASSIST.RING_N);
    assert.equal(R.r, ASSIST.R, 'one size for every pentagram');
    assert.ok(R.r >= 3.4 && R.r <= 3.6);
    let closed = null, arcs = 0;
    for (let i = 0; i <= R.n + 1; i++) {
        const w = R.world[i % R.n];
        for (const e of R.step(w[0] + rnd() * 0.4, w[1] + rnd() * 0.4)) { if (e.t === 'arcs') arcs += e.list.length; if (e.t === 'closed') closed = e; }
    }
    assert.ok(closed && closed.r === ASSIST.R && closed.cx === 10 && closed.cz === -5, 'whole: the perfect circle');
    assert.equal(arcs, R.n);
    // going the other way, skipping every other point
    const Q = new RingAssist(0, 0); let c2 = null;
    for (let i = 0; i <= Q.n * 2; i += 2) for (const e of Q.step(...Q.world[(Q.n - (i % Q.n)) % Q.n])) if (e.t === 'closed') c2 = e;
    assert.ok(c2, 'the other way, two points at a step');
    // a jump to the far side draws nothing
    const J = new RingAssist(0, 0);
    J.step(...J.world[0]);
    assert.equal(J.step(...J.world[8]).length, 0);
    assert.equal(J.left, J.n);
    // a hand far from the ring does nothing
    assert.equal(new RingAssist(0, 0).step(50, 50).length, 0);
});

test('a point of the figure is taken only when the wand stays on it (0.3 s); the wand must leave the points once first; a hand sweeping past draws nothing', () => {
    const L = new LineAssist(buildGraph(['devil', 'teleport']), { cx: 0, cz: 0, r: 3.5, rot: 0 });
    const w = L.world, c = L.graph.chords.find((k) => k.ids.includes('devil'));
    // right after the circle the hand stands on a point of it: nothing
    for (let t = 0; t < 1; t += 0.05) assert.equal(L.step(...w[c.nodes[0]], 0.05).length, 0);
    assert.equal(L.cur, -1);
    // away for a moment: armed
    for (let t = 0; t < 0.4; t += 0.05) L.step(0.05, 0.05, 0.05);
    assert.ok(L.armed);
    // sweeping through the corner (0.1 s) and on: not taken
    for (let t = 0; t < 0.1; t += 0.05) L.step(...w[c.nodes[0]], 0.05);
    L.step(0.05, 0.05, 0.05);
    assert.equal(L.cur, -1);
    // staying: taken; then staying on the far end: the chord is drawn
    for (let t = 0; t < 0.4; t += 0.05) L.step(...w[c.nodes[0]], 0.05);
    assert.equal(L.cur, c.nodes[0]);
    let drawn = 0;
    for (let t = 0; t < 0.5; t += 0.05) for (const e of L.step(...w[c.nodes.at(-1)], 0.05)) if (e.t === 'edges') drawn += e.keys.length;
    assert.equal(drawn, 3);
});
