import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { settlePawn } from '../../src/world/PawnStall.js';

const make = (seed) => { const t = new TerrainData(); t.generate({ seed, mountains: true, lush: true, seas: true }); return t; };
const SEEDS = [4242, 12345, 1, 777, 20261015];
const hamlets = (t, type, r = 6) => {
    const out = [];
    for (let gz = -r; gz < r; gz++) for (let gx = -r; gx < r; gx++) for (const h of t.hamlets.cellOf(gx, gz)) if (h.type === type) out.push(h);
    return out;
};
const pawns = (def) => def.stalls.filter((s) => s.pawn);
const hit = (a, b) => a.k === 0 && b.k === 0 && a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1 && a.L0 <= b.L1 && b.L0 <= a.L1;
function tower(t) { const k = t.towers.spawnKey(); const gx = Math.round(k / 65536); return t.towers.cellOf(gx, k - gx * 65536); }

// the old site = the same one without the buyer's blocks (they come last, taking no rng)
function checkSite(t, def) {
    const s = pawns(def)[0];
    assert.ok(s, def.id);
    const [a, b] = s.parts;
    assert.equal(b, def.parts.length, 'the buyer is the last thing built');
    const rest = def.parts.slice(0, a);
    for (const e of def.parts.slice(a)) for (const o of rest) if (o.L1 >= 0 && e.L0 >= 0) assert.ok(!hit(e, o), `${def.id} overlap`);
    assert.ok(def.edges.some(([x, y]) => x === s.frontNode || y === s.frontNode), 'linked to the road');
    assert.equal(s.trade, 'pawn');
    return s;
}

test('pawn stall: one by the tower in any world; none lost to the rest of the site', () => {
    for (const seed of SEEDS) {
        const t = make(seed), d = tower(t);
        assert.equal(pawns(d).length, 1);
        checkSite(t, d);
    }
});

test('pawn stall: exactly one in each small wizard village, none elsewhere', () => {
    let seen = 0;
    for (const seed of SEEDS) {
        const t = make(seed);
        for (const type of ['magevillage', 'magehut', 'village', 'hermit']) for (const h of hamlets(t, type)) {
            assert.equal(pawns(h).length, type === 'magevillage' ? 1 : 0, type);
            if (type === 'magevillage') { seen++; checkSite(t, h); }
        }
    }
    assert.ok(seen >= 3, `villages seen ${seen}`);
});

test('pawn stall: where it was built it stays; an old save without its blocks (or built over) switches it off, no errors', () => {
    const t = make(4242), d = tower(t);
    // the land of the tower made (a chunk of the site is made on demand)
    const s = pawns(d)[0], q = s.probe;
    assert.equal(t.get(q.cx, q.cL, q.cz), BLOCK.CLOTH_WHITE, 'the cloth on the counter');
    assert.equal(t.get(q.sx, q.sL, q.sz), BLOCK.AIR, 'room for the seller');
    assert.equal(settlePawn(t, d), true);
    assert.ok(s.pawn && !s.off);
    // a save from before: the chunk holds no stall
    const old = tower(make(4242)), os = pawns(old)[0];
    const bare = { landMade: () => true, get: () => BLOCK.AIR };
    assert.equal(settlePawn(bare, old), true);
    assert.ok(!os.pawn && os.off && old.stalls.length === d.stalls.length, 'switched off, the roster stays');
    // the player built a wall where the seller stands
    const t2 = make(4242), d2 = tower(t2), s2 = pawns(d2)[0];
    t2.set(s2.probe.sx, s2.probe.sL + 1, s2.probe.sz, BLOCK.STONE);
    settlePawn(t2, d2);
    assert.ok(s2.off && !s2.pawn);
});
