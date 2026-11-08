/**
 * The arena by a wizards' tower must be reachable on foot (the author: «арена выше земли… волшебники не могут подняться»).
 * Generation 29 (`arenaFlat`): the terrace in front of each end of the arena comes down to the wild beyond the levelled zone, a block every 2 m
 * (up to FORE_MAX steps), and a place with a cliff round it is passed over while another is free. Older worlds keep their arenas as they were.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData } from '../../src/world/Terrain.js';
import { FORE_MAX, RING_MAX } from '../../src/world/DuelArenas.js';

const O = { mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, wizHuts: true, furnish: true, bigHouses: true, buildings: true, dungeons: true, apart: true, arenaX2: true, arenaEntries: true, knightCap: true, wizShops: true, seabed: true, caveLake: true };
const arenas = (seed, flat) => {
    const d = new TerrainData(); d.generate({ seed, ...O, arenaFlat: flat }); d.skipSeaTop = true;
    const out = [];
    for (let gx = -6; gx <= 6; gx++) for (let gz = -6; gz <= 6; gz++) { const t = d.towers.cellOf(gx, gz); const a = t && d.sites.arenas.ofTower(t); if (a) out.push(a); }
    return { d, list: out };
};
// the ground along an end's axis from the zone's edge outwards (m): the biggest drop of one block step down (a natural cliff UP the other way is the wild's own)
const axisDrop = (d, a) => {
    const ux = a.axis.b.x - a.axis.a.x, uz = a.axis.b.z - a.axis.a.z, L = Math.hypot(ux, uz) || 1;
    let worst = 0;
    for (const s of [-1, 1]) { let prev = null; for (let r = a.zone - 4; r <= a.zone + 30; r++) { const h = d.surfaceY(a.x + (ux / L) * s * r, a.z + (uz / L) * s * r); if (prev != null) worst = Math.max(worst, prev - h); prev = h; } }
    return worst;
};

test('generation 29: the arenas stand easier to reach — the biggest one-metre drop past the zone is smaller than in the older generation', () => {
    let nOld = 0, nNew = 0, sumOld = 0, sumNew = 0, maxNew = 0;
    for (const seed of [31, 34, 40, 41, 42, 43]) {
        for (const [flat, tag] of [[false, 'old'], [true, 'new']]) {
            const { d, list } = arenas(seed, flat);
            for (const a of list) { const w = axisDrop(d, a); if (tag === 'old') { nOld++; sumOld += w; } else { nNew++; sumNew += w; maxNew = Math.max(maxNew, w); } }
        }
    }
    assert.ok(nOld > 0 && nNew > 0);
    assert.ok(sumNew / nNew < sumOld / nOld, `mean worst drop ${(sumNew / nNew).toFixed(2)} < ${(sumOld / nOld).toFixed(2)}`);
});

test('the older generation keeps its arenas: no flat option → the same arenas as before (the 7-step terrace)', () => {
    const { list } = arenas(34, false);
    assert.ok(list.every((a) => a.F != null));
    assert.ok(FORE_MAX > 7 && RING_MAX > 0);
});
