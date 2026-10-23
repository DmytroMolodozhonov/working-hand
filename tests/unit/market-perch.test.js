// Goods on a market counter stay on it: after settling, after a glitch of the ground under them, after sinking
// into the counter — every stall, both sides of the market, worlds of the old and the new generation.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ItemSystem } from '../../src/game/Items.js';
import { CollisionWorld } from '../../src/world/Collision.js';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { frontEdge } from '../../src/game/CastleTalk.js';

const make = (seed, gen) => { const t = new TerrainData(); t.generate({ seed, mountains: true, lush: true, slopes: gen >= 6, wizHuts: gen >= 7, seas: true }); return t; };
function game(t) {
    t.blockAt = (ix, L, iz) => t.get(ix, L, iz); // (what TerrainView gives the game)
    const col = new CollisionWorld(); col.terrain = t;
    const g = { scene: new THREE.Scene(), collision: col, fx: { spark() {} }, sync: null, authority: true, hud: { setVoice() {} }, localId: 'me', zombies: [] };
    g.items = new ItemSystem(g);
    return g;
}
/** Where CastleTalk._restock lays the k-th good of a stall. */
function spot(st, k) {
    const c = st.counter, along = c.x1 - c.x0 >= c.z1 - c.z0, f = (k + 0.5) / 3;
    return new THREE.Vector3(along ? c.x0 + (c.x1 - c.x0 + 1) * f - 0.5 : frontEdge(st, 0.35), c.top + 0.3, along ? frontEdge(st, 0.35) : c.z0 + (c.z1 - c.z0 + 1) * f - 0.5);
}
const run = (g, L, s) => { for (let i = 0; i < s * 60; i++) g.items._physics(L, 1 / 60); };
function* stalls(t) {
    for (let gz = -2; gz <= 2; gz++) for (let gx = -2; gx <= 2; gx++) {
        const d = t.castles.cellOf(gx, gz);
        if (d) for (const st of d.stalls) if (!st.pawn && !st.fence) yield [d, st];
    }
}

for (const gen of [5, 7]) {
    test(`market goods (world generation ${gen}): on the counter top, also when the ground under them glitches or they sank`, () => {
        const t = make(4242, gen), g = game(t);
        let n = 0, sides = new Set();
        for (const [d, st] of stalls(t)) {
            const c = st.counter, k = n % 3, uid = `g${n++}`;
            sides.add(Math.sign(st.front.x - (c.x0 + c.x1) / 2) + ',' + Math.sign(st.front.z - (c.z0 + c.z1) / 2));
            const L = g.items.spawnLoose({ kind: 'apple', uid }, spot(st, k));
            L.perch = c;
            run(g, L, 5);
            const y = () => L.model.position.y;
            assert.ok(L.rest && Math.abs(y() - (c.top + 0.12)) < 0.2, `${d.id}: lies on the counter, y ${y().toFixed(2)} top ${c.top}`);
            // the ground under it reads as the far floor for a moment (a chunk swapped): it stays
            const real = g.collision.groundAt;
            g.collision.groundAt = () => c.top - 6;
            L.rest = true; L.chk = 1; run(g, L, 3);
            L.rest = false; run(g, L, 2);
            g.collision.groundAt = real;
            run(g, L, 2);
            assert.ok(y() > c.top - 0.2, `${d.id}: still on the counter after the glitch, y ${y().toFixed(2)}`);
            // sunk into / under the counter by some other way: it comes back up
            L.model.position.y = c.top - 1.5; L.rest = true; L.chk = 1; run(g, L, 1);
            assert.ok(Math.abs(y() - (c.top + 0.12)) < 0.2, `${d.id}: put back, y ${y().toFixed(2)}`);
            g.items.removeLoose(uid);
        }
        assert.ok(n >= 8, `stalls ${n}`);
        assert.ok(sides.size >= 2, 'both sides of the market: ' + [...sides]);
    });
}

test('market goods: a counter blown away — the goods fall with it, nothing holds them in the air', () => {
    const t = make(4242, 5), g = game(t);
    const [, st] = stalls(t).next().value, c = st.counter;
    const L = g.items.spawnLoose({ kind: 'apple', uid: 'blow' }, spot(st, 1));
    L.perch = c;
    run(g, L, 3);
    const x = Math.round(L.model.position.x), z = Math.round(L.model.position.z), top = Math.round(c.top + 0.5);
    for (let l = top; l >= top - 1; l--) t.set(x, l, z, BLOCK.AIR);
    L.chk = 1; run(g, L, 4);
    assert.ok(L.model.position.y < c.top - 1, `fell to the floor, y ${L.model.position.y.toFixed(2)} top ${c.top}`);
});
