import test from 'node:test';
import assert from 'node:assert/strict';
import { KNIGHTS, knightCount, postPlan, KNIGHT_POSTS } from '../../src/world/KnightPosts.js';
import { TerrainData, WORLD_GEN, KNIGHT_CAP_FROM_GEN } from '../../src/world/Terrain.js';

const gen = (seed, knightCap) => { const d = new TerrainData(); d.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, furnish: true, knightCap }); return d; };
const castlesOf = (d) => { const out = []; for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) { const c = d.castles.cellOf(gx, gz); if (c) out.push(c); } return out; };

test('counts by size: 10 / 12–13 / 14–15, never over 15', () => {
    assert.ok(KNIGHT_CAP_FROM_GEN <= WORLD_GEN);
    for (let i = 0; i < 100; i++) {
        const u = i / 100;
        assert.equal(knightCount('compact', u), 10);
        assert.ok([12, 13].includes(knightCount('fortress', u)));
        assert.ok([14, 15].includes(knightCount('grand', u)));
    }
    assert.equal(knightCount('grand', 5), 15); // (a bad number never breaks the cap)
});

test('the posts: 2 gate, 2 throne, 4 tower, 2 patrol, the rest by the quay / barracks / treasury / kitchen', () => {
    for (let n = KNIGHTS.MIN; n <= KNIGHTS.MAX; n++) {
        for (const port of [false, true]) {
            const plan = postPlan(n, { port });
            assert.equal(plan.length, n);
            const c = (k) => plan.filter((x) => x === k).length;
            assert.deepEqual([c('gate'), c('throne'), c('tower'), c('patrol')], KNIGHT_POSTS.map((p) => p.n));
            assert.equal(c('port') > 0, port && n >= 11);
            if (!port) assert.equal(c('port'), 0);
        }
    }
});

test('20 seeds: every castle has 10–15 knights, the old worlds keep their crowds, the king is not counted', () => {
    let seen = 0, oldBig = 0;
    for (let seed = 1; seed <= 20; seed++) {
        for (const c of castlesOf(gen(seed, true))) {
            seen++;
            assert.ok(c.knights >= KNIGHTS.MIN && c.knights <= KNIGHTS.MAX, `${c.id} ${c.style}: ${c.knights}`);
            assert.equal(c.capped, true);
            assert.equal(c.towerPosts.length, 4, 'four different corners of the wall walk');
            assert.equal(new Set(c.towerPosts).size, 4);
            assert.ok(c.posts.length >= 2, 'two at the gate');
        }
        for (const c of castlesOf(gen(seed, false))) if (c.knights > 15) oldBig++;
    }
    assert.ok(seen >= 20, `castles seen ${seen}`);
    assert.ok(oldBig > 0, 'old worlds are not changed');
});

test('the cap does not move the rest of the castle: the same names, kings, populations, walls', () => {
    for (let seed = 1; seed <= 6; seed++) {
        const a = castlesOf(gen(seed, true)), b = castlesOf(gen(seed, false));
        assert.equal(a.length, b.length);
        a.forEach((c, i) => { assert.equal(c.name, b[i].name); assert.equal(c.king, b[i].king); assert.equal(c.population, b[i].population); assert.equal(c.throne.x, b[i].throne.x); assert.equal(c.stalls.length, b[i].stalls.length); });
    }
});

test('staffing: posts spread 2/2/4/2, nobody on one spot, every post reachable from the barracks by the walk graph', async () => {
    const { Graph } = await import('../../src/game/CastleLife.js');
    const { staffKnights } = await import('../../src/game/KnightStaff.js');
    let castles = 0;
    for (let seed = 1; seed <= 20; seed++) {
        for (const def of castlesOf(gen(seed, true))) {
            castles++;
            const cs = { def, graph: new Graph(def) };
            const got = [];
            const knight = (at, job, post) => { const v = { x: at.x, y: at.y, z: at.z, job, post }; got.push(v); return v; };
            const life = { alog: null };
            const plan = staffKnights(life, cs, knight);
            const kinds = (k) => got.filter((v) => v.postKind === k).length;
            assert.ok(got.length + 2 <= def.knights, `${def.id}: ${got.length} + 2 by the throne ≤ ${def.knights}`);
            assert.equal(plan.length + 2, def.knights, 'the throne two make up the rest');
            assert.equal(kinds('gate'), 2); assert.equal(kinds('tower'), 4); assert.equal(kinds('patrol'), 2);
            // the standing ones are never on one spot
            const stand = got.filter((v) => v.job === 'guard');
            for (let i = 0; i < stand.length; i++) for (let j = i + 1; j < stand.length; j++) assert.ok(Math.hypot(stand[i].x - stand[j].x, stand[i].z - stand[j].z) > 1, `${def.id}: two on one spot (${stand[i].postKind}, ${stand[j].postKind})`);
            // the barracks door to each post (the gate guards stand outside the walls: they walk in by the gate node)
            const from = cs.graph.tagged('barracksDoor')[0] ?? cs.graph.tagged('gateIn')[0];
            const reach = cs.graph.reach(from);
            for (const v of got) {
                if (v.postKind === 'gate') continue;
                const id = cs.graph.nearest(v.x, v.y, v.z, 4);
                assert.ok(id >= 0 && reach.has(id), `${def.id}: the post «${v.postKind}» (${Math.round(v.x)}, ${Math.round(v.z)}) cannot be reached`);
            }
        }
    }
    assert.ok(castles >= 20);
});
