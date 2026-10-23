import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';

const OPTS = { mountains: true, lush: true, seas: true };
const make = (seed, buyers) => { const t = new TerrainData(); t.generate({ seed, ...OPTS, buyers }); return t; };
const SEEDS = [4242, 12345, 1, 777, 20261015];
const hamlets = (t, type, r = 6) => {
    const out = [];
    for (let gz = -r; gz < r; gz++) for (let gx = -r; gx < r; gx++) for (const h of t.hamlets.cellOf(gx, gz)) if (h.type === type) out.push(h);
    return out;
};
const pawns = (def) => def.stalls.filter((s) => s.pawn);
const hit = (a, b) => a.k === 0 && b.k === 0 && a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1 && a.L0 <= b.L1 && b.L0 <= a.L1;

function tower(t) { const k = t.towers.spawnKey(); const gx = Math.round(k / 65536); return t.towers.cellOf(gx, k - gx * 65536); }

test('pawn stall: one by the tower in a new world, none in an old one; the rest of the tower is the same', () => {
    for (const seed of SEEDS) {
        const a = tower(make(seed, true)), b = tower(make(seed, false));
        assert.equal(pawns(a).length, 1, 'a buyer outside the tower');
        assert.equal(pawns(b).length, 0, 'an old world has none');
        assert.equal(a.stalls.length, b.stalls.length + 1);
        assert.deepEqual([a.x, a.z, a.name, a.houses.length, a.nodes.length - 2], [b.x, b.z, b.name, b.houses.length, b.nodes.length]);
        // what was there stays; the new blocks touch none of the old ones (the ground apart: layer below 0)
        const extra = a.parts.slice(b.parts.length);
        assert.ok(extra.length > 10);
        for (const e of extra) for (const o of b.parts) if (o.L1 >= 0 && e.L0 >= 0) assert.ok(!hit(e, o), `overlap ${JSON.stringify(e)} ${JSON.stringify(o)}`);
        const s = pawns(a)[0];
        assert.equal(s.trade, 'pawn');
        assert.ok(s.counter.x1 > s.counter.x0 || s.counter.z1 > s.counter.z0);
        assert.ok(a.nodes[s.frontNode], 'the way to the counter');
        assert.ok(a.edges.some(([x, y]) => x === s.frontNode || y === s.frontNode), 'linked to the road');
    }
});

test('pawn stall: exactly one in each small wizard village of a new world, none elsewhere', () => {
    let seen = 0;
    for (const seed of SEEDS) {
        const t = make(seed, true), old = make(seed, false);
        for (const type of ['magevillage', 'magehut', 'village', 'hermit']) {
            for (const h of hamlets(t, type)) {
                assert.equal(pawns(h).length, type === 'magevillage' ? 1 : 0, type);
                if (type !== 'magevillage') continue;
                seen++;
                const s = pawns(h)[0];
                assert.ok(h.edges.some(([x, y]) => x === s.frontNode || y === s.frontNode));
                const o = hamlets(old, type).find((x) => x.id === h.id);
                assert.equal(h.stalls.length, o.stalls.length + 1);
                for (const e of h.parts.slice(o.parts.length)) for (const q of o.parts) if (q.L1 >= 0 && e.L0 >= 0) assert.ok(!hit(e, q), `${h.id} overlap`);
            }
            for (const h of hamlets(old, type)) assert.equal(pawns(h).length, 0);
        }
    }
    assert.ok(seen >= 3, `villages seen ${seen}`);
});
