import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { PORT_SHIPS } from '../../src/world/Castles.js';

const worlds = new Map();
function world(seed) {
    if (!worlds.has(seed)) {
        const t = new TerrainData();
        t.generate({ seed, mountains: true, seas: true });
        worlds.set(seed, t);
    }
    return worlds.get(seed);
}
function seaCastles(t) {
    const out = [];
    for (let gz = -6; gz <= 6; gz++) for (let gx = -6; gx <= 6; gx++) {
        const c = t.castles.cellOf(gx, gz);
        if (c && c.variant === 'sea') out.push(c);
    }
    return out;
}
/** Water layers above the bottom of a column. */
function waterDepth(t, x, z) {
    const ix = Math.round(x), iz = Math.round(z);
    let n = 0;
    for (let L = 0; L > -20 && t.get(ix, L, iz) === BLOCK.WATER; L--) n++;
    return n;
}
/** Local plan (u, v) → world, as the castle's plan does it. */
function W(c, u, v) {
    const r = c.rot;
    return { x: c.x + (r === 0 ? u : r === 1 ? -v : r === 2 ? -u : v), z: c.z + (r === 0 ? v : r === 1 ? u : r === 2 ? -v : -u) };
}

test('sea castles stand on the shores of the seas, the same on every computer', () => {
    for (const seed of [12345, 777, 4242]) {
        const list = seaCastles(world(seed));
        assert.ok(list.length >= 1, `seed ${seed}: a sea castle`);
        const again = new TerrainData();
        again.generate({ seed, mountains: true, seas: true });
        const c = list[0], d = again.castles.cellOf(c.gx, c.gz);
        assert.deepEqual([d.id, d.x, d.z, d.rot, d.port.berths.length], [c.id, c.x, c.z, c.rot, c.port.berths.length]);
    }
    // old worlds: no sea castles
    const old = new TerrainData();
    old.generate({ seed: 4242, mountains: true });
    for (let gz = -6; gz <= 6; gz++) for (let gx = -6; gx <= 6; gx++) assert.notEqual(old.castles.cellOf(gx, gz)?.variant, 'sea');
});

test('sea castle: the quay at castle level, the sea right beyond it, the back of the castle in the water', () => {
    for (const seed of [12345, 777, 4242]) {
        const t = world(seed);
        for (const c of seaCastles(t)) {
            const P = c.port;
            assert.equal(c.F, 2);
            // the quay (between two piers' stairs) is at castle level and the water is just beyond it
            const b = P.berths[0];
            const quay = W(c, P.keepU + 4, P.vShore - 10);
            assert.equal(t.topLayer(Math.round(quay.x), Math.round(quay.z)), c.F, 'quay level');
            const sea = W(c, P.basin.u0 + 1, P.vShore + 5);
            assert.ok(waterDepth(t, sea.x, sea.z) >= 1, 'water 5 m beyond the quay');
            // the castle's walls stand on its ground, the back wall reaches the sea
            assert.ok(P.keepV > P.vShore);
            const behind = W(c, 0, P.keepV + 12);
            assert.ok(waterDepth(t, behind.x, behind.z) >= 1 || t.get(Math.round(behind.x), 0, Math.round(behind.z)) !== BLOCK.AIR, 'water (or the sea tower) behind the castle');
            const side = W(c, -P.keepU - 6, P.keepV - 2);
            assert.ok(waterDepth(t, side.x, side.z) >= 1, 'the sea beside the back of the castle');
            for (let u = -P.keepU + 4; u <= P.keepU - 4; u += 9) {
                const q = W(c, u, P.vShore + 3);
                assert.ok(t.topLayer(Math.round(q.x), Math.round(q.z)) >= c.F, 'castle ground over the old sea');
            }
            assert.ok(b);
        }
    }
});

test('the harbour is deep enough for every ship, piers reach past the bows at the right height', () => {
    for (const seed of [12345, 777, 4242, 1]) {
        const t = world(seed);
        for (const c of seaCastles(t)) {
            const P = c.port;
            const style = { grand: 3, fortress: 2, compact: 1 }[c.style];
            assert.equal(P.ships.length, style, `${c.style}: ${P.ships}`);
            if (c.style === 'grand') assert.deepEqual(P.ships, ['galleon', 'fluyt', 'pinnace']);
            if (c.style === 'fortress') assert.deepEqual(P.ships, ['galleon', 'pinnace']);
            assert.equal(P.berths.length, P.ships.length);
            P.berths.forEach((b, k) => {
                const S = PORT_SHIPS[b.cls];
                assert.equal(b.L, S.L);
                // the hull footprint: water at least draft + 2 layers deep
                const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), sx = Math.cos(b.yaw), sz = -Math.sin(b.yaw);
                for (const [a, w] of [[0.45, 0.4], [0.45, -0.4], [0, 0.45], [0, -0.45], [-0.45, 0.4], [-0.45, -0.4]]) {
                    const x = b.x + fx * a * S.L + sx * w * S.B, z = b.z + fz * a * S.L + sz * w * S.B;
                    const d = waterDepth(t, x, z);
                    assert.ok(d >= S.draft + 2, `${c.id} ${b.cls} footprint depth ${d}`);
                    assert.ok(!t.solidIn(Math.round(x), Math.round(z), -1, 12), 'nothing solid where the ship lies');
                }
                // the pier: its deck top at the class height, its far end past the bow, beside the ship
                const pr = P.piers[k];
                assert.equal(pr.y, S.pierLayer - 0.5);
                const mid = { x: (pr.a.x + pr.b.x) / 2, z: (pr.a.z + pr.b.z) / 2 };
                assert.equal(t.topLayer(Math.round(mid.x), Math.round(mid.z)), S.pierLayer, 'pier deck');
                const bow = { x: b.x + fx * S.L / 2, z: b.z + fz * S.L / 2 };
                const along = (pr.b.x - pr.a.x) * fx + (pr.b.z - pr.a.z) * fz;
                assert.ok(along > 0 && (pr.b.x - b.x) * fx + (pr.b.z - b.z) * fz >= S.L / 2, 'the pier reaches past the bow');
                assert.ok(Math.hypot(bow.x - b.x, bow.z - b.z) > 1);
                // the plank lands on the pier's edge at midships, the pier is on the ship's `side`
                assert.ok(Math.abs(b.plankA.y - pr.y) < 1e-9);
                const toPier = (b.plankA.x - b.x) * sx + (b.plankA.z - b.z) * sz;
                assert.equal(Math.sign(toPier), b.side);
                assert.equal(b.bollards.length, 2);
                // out to sea: the bow points away from the shore
                const fromShore = W(c, 0, P.vShore + 100);
                assert.ok((fromShore.x - c.x) * fx + (fromShore.z - c.z) * fz > 0);
            });
            // cannon places on the walls (and the sea tower), on solid stone, with a free view
            assert.ok(P.cannons.length >= 4);
            for (const m of P.cannons) {
                const L = Math.round(m.y + 1.5);
                assert.ok(t.solidIn(Math.round(m.x), Math.round(m.z), L - 1, L - 1), `${m.at} cannon place stands on stone`);
                assert.ok(!t.solidIn(Math.round(m.x), Math.round(m.z), L, L + 1), `${m.at} cannon place is free`);
                assert.ok(Number.isFinite(m.yaw));
            }
            assert.ok(P.cannons.some((m) => m.at === 'wall') && P.cannons.some((m) => m.at === 'tower'));
            // the port's chests on the quay
            const portChests = c.chests.filter((ch) => ch.room === 'port');
            assert.equal(portChests.length, P.ships.length);
            for (const ch of portChests) assert.equal(t.topLayer(Math.round(ch.x), Math.round(ch.z)), c.F);
        }
    }
});

test('sea castle village: houses on dry land, every path can be walked, the quay and piers too', () => {
    for (const seed of [12345, 777, 4242, 1]) {
        const t = world(seed);
        for (const c of seaCastles(t)) {
            for (const h of c.houses) assert.equal(waterDepth(t, h.door.x, h.door.z), 0, `${c.id} house door in the water`);
            const stand = (y) => Math.round(y + 1.5);
            const ok = (x, z, L) => {
                const ix = Math.round(x), iz = Math.round(z);
                const f = t.floorBelow(ix, iz, L);
                if (f < L - 2 || f > L) return 'no floor';
                if (t.solidIn(ix, iz, f + 1, f + 5)) return 'blocked';
                return null;
            };
            for (const n of c.nodes) assert.equal(ok(n.x, n.z, stand(n.y)), null, `${c.id} node ${n.id} ${n.tag}`);
            for (const [a, b] of c.edges) {
                const A = c.nodes[a], B = c.nodes[b];
                if (A.y !== B.y) continue; // (stairs)
                const steps = Math.max(1, Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / 0.5));
                for (let i = 1; i < steps; i++) {
                    const f = i / steps;
                    assert.equal(ok(A.x + (B.x - A.x) * f, A.z + (B.z - A.z) * f, stand(A.y)), null, `${c.id} edge ${a}-${b} ${A.tag}/${B.tag}`);
                }
            }
            const adj = new Map();
            for (const [a, b] of c.edges) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
            const start = c.nodes.find((n) => n.tag === 'gateOut').id;
            const seen = new Set([start]);
            const q = [start];
            while (q.length) { const n = q.pop(); for (const m of adj.get(n) || []) if (!seen.has(m)) { seen.add(m); q.push(m); } }
            for (const tag of ['pier', 'quay', 'wall', 'market', 'room:treasury']) {
                const n = c.nodes.find((x) => x.tag === tag);
                assert.ok(n && seen.has(n.id), `${c.id}: ${tag} reachable from the gate`);
            }
        }
    }
});

test('the harbour is calm behind its breakwater (small waves, not the open swell)', async () => {
    const { SeaWaves } = await import('../../src/world/Sea.js');
    for (const seed of [12345, 4242]) {
        const t = world(seed);
        const waves = new SeaWaves(t.seas, () => 0, (ix, iz) => { t.heightAt(ix, iz); if (!t.heightAt.sea) return false; return t.castles.landAt(ix, iz)?.harbour ? 'harbour' : true; });
        for (const c of seaCastles(t)) {
            for (const b of c.port.berths) {
                let mx = 0;
                for (let tt = 0; tt < 60; tt += 0.5) mx = Math.max(mx, Math.abs(waves.height(b.x, b.z, tt)));
                assert.ok(mx < 0.25, `${c.id} berth ${b.cls}: waves ${mx.toFixed(2)}`);
            }
        }
    }
});
