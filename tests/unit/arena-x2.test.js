/**
 * The duel arena twice as large (the author: «Колизей раза в два больше»), the figures on the stall apart, the hero's circle at the far end, the dome as a wall for bodies.
 * Worlds of generation ARENA_X2_FROM_GEN; older ones keep their arenas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, ARENA_X2_FROM_GEN, WORLD_GEN } from '../../src/world/Terrain.js';
import { ARENA, ARENA_X2, ARENA_BIG, ARENA_BIG_X2, ARENA_ROUND, ARENA_ROUND_X2, onArenaFloor } from '../../src/world/DuelArenas.js';
import { dollSpots, TIER_ORDER, FIG } from '../../src/game/ArenaSteward.js';
import { cageOf, cageClamp, domeOf, CAGE } from '../../src/game/ArenaDome.js';
import { DUEL } from '../../src/game/Duel.js';
import { ArenaDuels } from '../../src/game/ArenaDuels.js';

const OPTS = { seed: 7, mountains: true, seas: true, lush: true, deepCaves: true, arenaEntries: true };
const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const pairs = (list) => { const out = []; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]]); return out; };
const towerArena = (t) => { for (const tw of t.towers.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))) { const a = t.sites.arenas.ofTower(tw); if (a) return a; } throw new Error('no arena'); };
const made = new Map();
function world(x2, seed = 7) {
    const k = x2 + ':' + seed;
    if (!made.has(k)) { const t = new TerrainData(); t.generate({ ...OPTS, seed, arenaX2: x2 }); made.set(k, t); }
    return made.get(k);
}
function villageArena(x2, seed = 4242) {
    const t = new TerrainData();
    t.generate({ seed, mountains: true, arenaEntries: x2, arenaX2: x2 });
    const vd = t.villages.spawnVillage();
    return { t, vd, a: t.sites.arenas.ofVillage(vd) };
}

test('the generation is one number and the new worlds have it', () => {
    assert.ok(WORLD_GEN >= ARENA_X2_FROM_GEN);
    assert.equal(ARENA_X2.W, 2 * ARENA.W);
    assert.equal(ARENA_BIG_X2.W, 2 * ARENA_BIG.W);
    assert.equal(ARENA_ROUND_X2.W, 2 * ARENA_ROUND.W);
});

test('a tower\'s arena: the floor twice as wide, more rows, 2.5× the seats; an older world keeps its arena', () => {
    const n = towerArena(world(true)), o = towerArena(world(false));
    assert.equal(n.axis.r, 2 * o.axis.r, 'the floor\'s radius ×2');
    assert.ok(n.outer > 1.6 * o.outer, 'the stands are wider: ' + n.outer + ' / ' + o.outer);
    assert.ok(n.seats.length >= 2.5 * o.seats.length, `seats ${n.seats.length} / ${o.seats.length}`);
    assert.ok(dist(n.axis.a, n.axis.b) === 2 * ARENA_X2.S);
});

test('the marks: the hero\'s circle is at the far end from the fighters\' gate, the wizard\'s by the gate; the foe never walks near the hero', () => {
    for (const a of [towerArena(world(true)), towerArena(world(false)), villageArena(true).a]) {
        const P = a.gates[0].mark, F = a.gates[1].mark, gate = a.gates[0].out, gin = a.gates[0].in;
        const diameter = 2 * a.axis.r;
        assert.ok(dist(P, gate) >= 0.8 * diameter, `the hero's circle ${dist(P, gate).toFixed(1)} m from the gate, floor ${diameter}`);
        assert.ok(dist(F, gate) < dist(P, gate), 'the wizard\'s circle is the nearer to the gate');
        // the foe\'s way: gate → in → his circle; it never comes within 8 m of the hero\'s circle
        for (let k = 0; k <= 60; k++) {
            const q = k <= 20 ? { x: gate.x + (gin.x - gate.x) * k / 20, z: gate.z + (gin.z - gate.z) * k / 20 } : { x: gin.x + (F.x - gin.x) * (k - 20) / 40, z: gin.z + (F.z - gin.z) * (k - 20) / 40 };
            assert.ok(dist(q, P) >= 8, 'the foe\'s way is ≥ 8 m from the hero: ' + dist(q, P).toFixed(1));
        }
        assert.ok(2 * dist(P, a.centre) < DUEL.RANGE, 'the circles are within a charge\'s reach');
        assert.ok(onArenaFloor(a, P.x, P.z) && onArenaFloor(a, F.x, F.z));
    }
});

function counterChecks(t, a) {
    const d = dollSpots(a);
    assert.deepEqual(d.map((x) => x.tier), TIER_ORDER);
    for (const [p, q] of pairs(d)) assert.ok(dist(p, q) >= 1.3, 'figures apart: ' + dist(p, q).toFixed(2));
    for (const x of d) {
        assert.ok(Number.isFinite(x.x) && Number.isFinite(x.y) && Number.isFinite(x.z) && Number.isFinite(x.yaw));
        assert.ok(x.onCounter, 'on the counter');
        const ix = Math.round(x.x), iz = Math.round(x.z), k = Math.round(x.y + 0.5);
        assert.ok([BLOCK.PLANKS, BLOCK.PLANKS_DARK].includes(t.get(ix, k, iz)), 'a block of the counter under the figure');
        assert.equal(t.get(ix, k + 1, iz), BLOCK.AIR, 'air over it');
    }
    // plates (1,3 m) and bodies (1 m) do not touch: the AABBs on the counter are apart
    for (const [p, q] of pairs(d)) assert.ok(Math.abs(p.x - q.x) >= 1.3 || Math.abs(p.z - q.z) >= 1.3, 'the boxes do not overlap');
    return d;
}

test('the three figures at an x2 tower arena stand apart on the counter', () => { counterChecks(world(true), towerArena(world(true))); });

test('the wizards\' city: the round arena has the stall and its three figures stand at three places (the author: «все на одних координатах»)', () => {
    const { t, a } = villageArena(true);
    assert.equal(a.axis.r, ARENA_ROUND_X2.W);
    assert.ok(a.desk.stall && a.visit, 'the stall and the stair');
    const d = counterChecks(t, a);
    // the old fault: a == b (a round floor) made every figure stand on one spot
    assert.ok(dist(d[0], d[2]) >= 3, 'the three along the counter: ' + dist(d[0], d[2]).toFixed(2));
});

test('an older world\'s round arena (no stall): the figures still stand at three places', () => {
    const { a } = villageArena(false);
    assert.equal(a.axis.r, ARENA_ROUND.W);
    const d = dollSpots(a);
    assert.equal(d.length, 3);
    for (const [p, q] of pairs(d)) assert.ok(dist(p, q) >= 1.3, 'apart: ' + dist(p, q).toFixed(2));
});

test('the city\'s arena is on its own place: no road, house or fire inside it, the walking graph is whole', () => {
    const { vd, a } = villageArena(true);
    const R = a.outer + 2;
    for (const n of vd.nodes) if (n.tag !== 'arena') assert.ok(dist(n, a) > R, 'no node of the town\'s roads in the arena: ' + dist(n, a).toFixed(1));
    for (const h of vd.houses) assert.ok(dist(h.doorRec || h, a) > R, 'no house on the arena');
    assert.ok(dist(vd.fire, a) > R + 10);
    const ids = new Map(vd.nodes.map((n) => [n.id, []]));
    for (const [x, y] of vd.edges) { ids.get(x)?.push(y); ids.get(y)?.push(x); }
    const seen = new Set([vd.nodes.find((n) => n.tag === 'plaza').id]), q = [...seen];
    while (q.length) for (const nb of ids.get(q.pop()) || []) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
    const lost = vd.nodes.filter((n) => !seen.has(n.id));
    assert.ok(lost.length <= 2, 'the roads are one network (' + lost.length + ' apart)');
});

test('the cage: a body thrown out at 80 m/s stays inside the floor\'s cylinder, under the roof', () => {
    for (const a of [towerArena(world(true)), villageArena(true).a]) {
        const C = cageOf(a);
        const D = domeOf(a);
        assert.ok(D.R * D.K >= CAGE.H - 1e-6, 'the dome is at least 30 m high');
        for (let k = 0; k < 360; k += 15) {
            const ang = k * Math.PI / 180, nx = Math.cos(ang), nz = Math.sin(ang);
            const p = { x: a.centre.x, y: a.floorY, z: a.centre.z }, v = { x: nx * 80, y: 40, z: nz * 80 };
            for (let i = 0; i < 400; i++) {
                v.y -= 14 * 0.016;
                p.x += v.x * 0.016; p.y += v.y * 0.016; p.z += v.z * 0.016;
                cageClamp(C, p, v);
                assert.ok(onArenaFloor(a, p.x, p.z, 0.4), 'within the floor at step ' + i);
                assert.ok(p.y <= C.top + 1e-6, 'under the roof');
            }
        }
        // one huge step is one clamp: even 5 km in a frame
        const p = { x: a.centre.x + 5000, y: a.floorY + 900, z: a.centre.z - 3000 }, v = { x: 900, y: 500, z: 0 };
        const h = cageClamp(C, p, v);
        assert.ok(h, 'struck');
        assert.ok(onArenaFloor(a, p.x, p.z, 0.4) && p.y <= C.top, 'one clamp holds it');
        assert.ok(v.y <= 0, 'and the lift is gone');
    }
});

test('a duellist shoved by a wind at an arena in a duel (the hook of CreatureImpact) never leaves the floor, and a wand knocked out stays inside', () => {
    const a = towerArena(world(true));
    const g = { impact: { active: new Map() }, sound: {}, authority: true };
    const d = Object.assign(Object.create(ArenaDuels.prototype), { game: g, list: new Map(), domeFx: { hit() {} } });
    const A = { id: a.id, def: a, duel: { phase: 'fight' } };
    d.list.set(a.id, A);
    const v = { id: 5, x: a.centre.x, y: a.floorY, z: a.centre.z, vy: 0, arena: { id: a.id, kind: 'duel', leg: 2 } };
    const s = { vx: 0, vz: 0 };
    g.impact.active.set('v|5', { s });
    // a Wind Maxima: 80 m/s along the long axis, then sideways, frame after frame
    const dir = [[0, 1], [1, 0], [0, -1], [-1, 0], [0.7, 0.7]];
    for (const [ux, uz] of dir) {
        s.vx = ux * 80; s.vz = uz * 80;
        for (let i = 0; i < 120; i++) {
            v.x += s.vx * 0.016; v.z += s.vz * 0.016; s.vx *= 0.97; s.vz *= 0.97;
            d.cageNpc(v);
            assert.ok(onArenaFloor(a, v.x, v.z, 0.4), 'on the floor');
        }
    }
    // not in a duel (or not yet on the floor): not held
    A.duel.phase = 'idle';
    v.x = a.centre.x + 500;
    assert.equal(d.cageNpc(v), false);
    A.duel.phase = 'fight'; v.arena.leg = 1;
    assert.equal(d.cageNpc(v), false, 'a wizard still walking in at the gate is no prisoner');
});
test('the cage gives back a little speed (a wall, not a trap) and lets a body at rest alone', () => {
    const a = towerArena(world(true)), C = cageOf(a);
    const p = { x: a.centre.x, y: a.floorY, z: a.centre.z }, v = { x: 3, y: 0, z: 0 };
    assert.equal(cageClamp(C, p, v), null, 'inside: nothing');
    const dx = (a.axis.b.x - a.axis.a.x), dz = (a.axis.b.z - a.axis.a.z), l = Math.hypot(dx, dz);
    // a point beyond the side wall (perpendicular to the axis)
    const nx = -dz / l, nz = dx / l;
    const q = { x: a.centre.x + nx * (C.R + 5), y: a.floorY, z: a.centre.z + nz * (C.R + 5) }, w = { x: nx * 30, y: 0, z: nz * 30 };
    const h = cageClamp(C, q, w);
    assert.ok(h && h.wall === 'side');
    assert.ok(w.x * nx + w.z * nz < 0 && Math.abs(w.x * nx + w.z * nz) < 30 * 0.4, 'the speed goes back, weaker');
});

test('the duel-only mode (Creative «Перед дуэлью»): the arena is twice as wide as before too, the circles and figures as ever', () => {
    let big = 0;
    for (const seed of [1, 5, 11, 15, 22, 31, 36, 2026]) {
        const t = new TerrainData();
        t.generate({ seed, mountains: true, seas: true, lush: true, deepCaves: true, test: true, bigArena: true, arenaEntries: true, arenaX2: true });
        const a = t.sites.arenas.ofTower(t.towers.only());
        assert.ok(a, `seed ${seed}: an arena`);
        if (a.axis.r === ARENA_BIG_X2.W) big++; else assert.equal(a.axis.r, ARENA_BIG.W, 'else the earlier big one');
        const P = a.gates[0].mark, F = a.gates[1].mark;
        assert.ok(dist(P, F) < DUEL.RANGE, 'within a charge\'s reach');
        assert.ok(dist(P, a.gates[0].out) >= 0.8 * 2 * a.axis.r, 'the hero\'s circle far from the gate');
        const d = dollSpots(a);
        for (const [p, q] of pairs(d)) assert.ok(dist(p, q) >= 1.3);
    }
    assert.ok(big >= 4, 'most of them have room for the twice-as-wide one: ' + big);
});
