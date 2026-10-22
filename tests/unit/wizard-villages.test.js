import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';
import { VILLAGE_TRADES, LIBRARY_SPELLS, STATUE_NAME, MAX_HOUSES } from '../../src/world/WizardVillages.js';
import { START_SPELLS } from '../../src/game/SpellBook.js';
import { wizardRoster } from '../../src/game/WizardAI.js';
import { wizardGood, pawnPrice, fenceTakes, WAND_POWER } from '../../src/game/WizardMarket.js';
import { itemValue } from '../../src/game/ItemTypes.js';

const worlds = new Map();
function world(seed) {
    if (!worlds.has(seed)) { const t = new TerrainData(); t.generate({ seed, mountains: true }); worlds.set(seed, t); }
    return worlds.get(seed);
}
function spawnVillage(t) {
    const k = t.villages.spawnKey();
    assert.ok(k !== -1, 'a settlement near the spawn');
    const gz = ((k % 65536) + 65536 + 32768) % 65536 - 32768, gx = Math.round((k - gz) / 65536);
    return t.villages.cellOf(gx, gz);
}

test('wizards’ settlements: the same on every computer, one near the spawn, never in a castle’s or a tower’s cell', () => {
    const a = new TerrainData(); a.generate({ seed: 4242, mountains: true });
    const b = new TerrainData(); b.generate({ seed: 4242, mountains: true });
    b.villages.cellOf(6, 6); b.heightAt(2500, -2500); // (another order)
    let n = 0;
    for (let gz = -6; gz <= 6; gz++) for (let gx = -6; gx <= 6; gx++) {
        const x = a.villages.cellOf(gx, gz), y = b.villages.cellOf(gx, gz);
        assert.equal(!!x, !!y);
        if (!x) continue;
        n++;
        assert.deepEqual([x.id, x.x, x.z, x.F, x.parts.length, x.nodes.length, x.name], [y.id, y.x, y.z, y.F, y.parts.length, y.nodes.length, y.name]);
        assert.ok(!a.castles.cellOf(gx, gz) && !a.towers.cellOf(gx, gz), 'one site per cell');
    }
    assert.ok(n >= 2, `settlements about the world (${n})`);
    const s = spawnVillage(world(4242));
    const d = Math.hypot(s.x, s.z);
    assert.ok(d >= 500 && d <= 2300, `the spawn's settlement at ${d}`);
    assert.equal(world(4242).heightAt(Math.round(s.x), Math.round(s.z)), s.F, 'its land is levelled');
});

test('a settlement: ~100 houses, the hall, the cauldron hall, the library, the crooked market, the statue, the arena’s place', () => {
    const s = spawnVillage(world(4242));
    assert.equal(s.kind, 'wizvillage');
    assert.ok(s.dwellings >= 80 && s.dwellings <= MAX_HOUSES, `houses ${s.dwellings}`);
    for (const h of s.houses.slice(0, s.dwellings)) assert.ok(h.doorRec && h.bedSpots.length && h.chests.length, `${h.id}: a door, a bed, a chest`);
    assert.deepEqual(s.houses.slice(s.dwellings).map((h) => h.kind), ['hall', 'cauldronHall', 'library']);
    assert.deepEqual(s.stalls.map((t) => t.trade).sort(), VILLAGE_TRADES.slice().sort());
    assert.ok(s.stalls.find((t) => t.trade === 'pawn').pawn && s.stalls.find((t) => t.trade === 'cauldrons').cauldron);
    const L = s.library.scrolls;
    assert.ok(L.length >= 2 && L.length <= 5 && L.every((k) => LIBRARY_SPELLS.includes(k) && !START_SPELLS.has(k)), L.join());
    assert.equal(s.library.spots.length, L.length);
    assert.equal(s.statue.name, STATUE_NAME);
    assert.ok(s.arena && s.arena.r >= 20 && s.fire && s.throne && s.chests.length === 2);
});

test('a settlement: every path of its people can be walked, everything reached from the gate', () => {
    const t = world(4242);
    const c = spawnVillage(t);
    const stand = (y) => Math.round(y + 1.5);
    const ok = (x, z, Lr) => {
        const ix = Math.round(x), iz = Math.round(z);
        const f = t.floorBelow(ix, iz, Lr);
        if (f < Lr - 2 || f > Lr) return 'no floor';
        if (t.solidIn(ix, iz, f + 1, f + 5)) return 'blocked';
        return null;
    };
    for (const n of c.nodes) assert.equal(ok(n.x, n.z, stand(n.y)), null, `node ${n.id} ${n.tag} (${n._u}, ${n._v})`);
    for (const [a, b] of c.edges) {
        const A = c.nodes[a], B = c.nodes[b];
        const steps = Math.max(1, Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / 0.5));
        for (let i = 1; i < steps; i++) {
            const f = i / steps;
            assert.equal(ok(A.x + (B.x - A.x) * f, A.z + (B.z - A.z) * f, stand(A.y)), null, `edge (${A._u}, ${A._v}) – (${B._u}, ${B._v})`);
        }
    }
    const adj = new Map();
    for (const [a, b] of c.edges) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
    const start = c.nodes.find((n) => n.tag === 'gateOut').id;
    const seen = new Set([start]);
    const q = [start];
    while (q.length) for (const y of adj.get(q.pop()) || []) if (!seen.has(y)) { seen.add(y); q.push(y); }
    assert.equal(seen.size, c.nodes.length, `unreachable: ${c.nodes.filter((n) => !seen.has(n.id)).map((n) => `${n.tag}(${n._u},${n._v})`).join(' ')}`);
});

test('the settlement’s wizards: 60 % weak, 35 % middling, 5 % strong; sellers weak; the Elder strong', () => {
    const s = spawnVillage(world(4242));
    const ranks = { novice: 0, adept: 0, elder: 0 };
    const first = 1 + s.stalls.length;
    for (let i = first; i < first + 2000; i++) ranks[wizardRoster({ ...s, population: 1e6 }, i).rank]++;
    assert.ok(Math.abs(ranks.novice / 2000 - 0.6) < 0.05 && Math.abs(ranks.adept / 2000 - 0.35) < 0.05 && Math.abs(ranks.elder / 2000 - 0.05) < 0.025, JSON.stringify(ranks));
    const elder = wizardRoster(s, 0);
    assert.ok(elder.elder && elder.rank === 'elder' && elder.mana >= 360 && elder.mana < 450);
    for (let i = 1; i < first; i++) { const e = wizardRoster(s, i); assert.equal(e.role, 'seller'); assert.equal(e.rank, 'novice'); }
    for (let i = first; i < first + 50; i++) { const e = wizardRoster(s, i); assert.ok(e.home >= 0 && e.home < s.dwellings); }
});

test('the market: goods of every trade, no wand stronger than middling; the pawnshop and the shady buyer pay 40 % under', () => {
    for (const trade of VILLAGE_TRADES) {
        for (let n = 0; n < 30; n++) for (let k = 0; k < 3; k++) {
            const g = wizardGood(trade, k, n);
            if (trade === 'pawn') { assert.equal(g, null); continue; }
            if (trade === 'cauldrons') continue; // (CastleTalk's potion goods)
            assert.ok(g && g.item && g.price > 0, `${trade} ${k}`);
            if (g.item.kind === 'wand') assert.ok(g.item.power <= WAND_POWER.max && g.price <= 520);
        }
    }
    assert.equal(wizardGood('potions', 0, 3).price, 50);
    const sword = { kind: 'weapon', type: 'sword', magic: false };
    assert.equal(pawnPrice(sword), Math.round(itemValue(sword) * 0.6));
    assert.ok(fenceTakes(sword) && !fenceTakes({ kind: 'wand', power: 10 }) && !fenceTakes({ kind: 'robe', magic: true }) && !fenceTakes({ kind: 'potion', rec: 'heal' }));
});

test('every castle’s town has its shady buyer: a stall of its own, out of the market', () => {
    const t = world(4242);
    let n = 0;
    for (let gz = -3; gz <= 3; gz++) for (let gx = -3; gx <= 3; gx++) {
        const c = t.castles.cellOf(gx, gz);
        if (!c) continue;
        const f = c.stalls.filter((s) => s.fence);
        assert.equal(f.length, 1, c.id);
        const m = c.market;
        assert.ok(f[0].front.x < m.x0 - 20 || f[0].front.x > m.x1 + 20 || f[0].front.z < m.z0 - 20 || f[0].front.z > m.z1 + 20, 'away from the market');
        n++;
    }
    assert.ok(n > 0);
});
