// Shared helpers of the building bench and tests: blocks of a plan as a map, a plain style, the checks of a building.
import { BLOCK } from '../../src/world/Terrain.js';

/** The plan's box / disc parts (k 0, 1) applied in order → Map "x,L,z" → block (0 = air carved). */
export function rasterParts(parts) {
    const g = new Map();
    for (const q of parts) {
        if (q.k === 0) {
            for (let x = q.x0; x <= q.x1; x++) for (let z = q.z0; z <= q.z1; z++) for (let L = q.L0; L <= q.L1; L++) g.set(`${x},${L},${z}`, q.t);
        } else if (q.k === 1) {
            const r2 = q.r * q.r + q.r * 0.6, h2 = q.hr >= 0 ? q.hr * q.hr + q.hr * 0.6 : -1;
            for (let x = q.x0; x <= q.x1; x++) for (let z = q.z0; z <= q.z1; z++) {
                const d2 = (x - q.cx) ** 2 + (z - q.cz) ** 2;
                if (d2 > r2 || d2 <= h2) continue;
                for (let L = q.L0; L <= q.L1; L++) g.set(`${x},${L},${z}`, q.t);
            }
        }
    }
    return g;
}

export function makeStyle() {
    const B = BLOCK;
    return { houseStone: B.COBBLE, stone: B.CS_GREY, villageRoof: B.ROOF_RED, roof: B.ROOF_SLATE, poorRoof: B.THATCH, poorWall: B.PLANKS, carpet: B.CARPET_RED, bedRich: 'red', floor: B.COBBLE };
}

const solid = (t) => t != null && t !== 0 && t !== BLOCK.WATER;

/**
 * Checks of one building built alone (floor layer 0 at plan.F): returns { problems: [...] }.
 *  - the door's doorway is 3 × 6 and open; the way from the door node to the inside spots is 3 wide (a hero with his arms out);
 *  - nothing hangs in the air: every block over the ground has a block under it or beside it holding it (a rough check: a
 *    column of blocks with air below and no neighbour to hold it); the stalls' counters are 2 high.
 */
export function fitsMap(p, g) {
    const L0 = p.F + 1, at = (x, L, z) => g.get(`${x},${L},${z}`);
    return (x, z) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { for (let l = 0; l < 5; l++) if (solid(at(x + a, L0 + l, z + b))) return false; if (!solid(at(x + a, L0 - 1, z + b))) return false; } return true; };
}

export function checkBuilding(p, out, kind, g) {
    const problems = [];
    const F = p.F, at = (x, L, z) => g.get(`${x},${L},${z}`);
    const house = out.houses.at(-1);
    const L0 = F + 1; // the floor layer's index (layer 0)
    if (house && house.doorRec) {
        const d = house.doorRec;
        if (d.w !== 3 || d.h < 6) problems.push(`дверь ${d.w}×${d.h}, нужна 3×6`);
        const cx = Math.round(d.x), cz = Math.round(d.z);
        // the doorway is open on 3 cells across (either x or z), 6 up
        const across = Math.abs(Math.cos(d.ry)) > 0.5 ? 'x' : 'z';
        for (let k = -1; k <= 1; k++) for (let l = 0; l < 6; l++) {
            const x = across === 'x' ? cx + k : cx, z = across === 'z' ? cz + k : cz;
            if (solid(at(x, L0 + l, z))) problems.push(`проём двери занят: ${x},${l},${z}`);
        }
    }
    // the 3-wide walk: from the "inside" spot to every used spot (bed, counter back, front, chests' fronts)
    if (house && house.inside) {
        const fits = (x, z) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let l = 0; l < 5; l++) if (solid(at(x + a, L0 + l, z + b))) return false; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (!solid(at(x + a, L0 - 1, z + b))) return false; return true; };
        const sx = Math.round(house.inside.x), sz = Math.round(house.inside.z);
        const seen = new Set([sx + ',' + sz]);
        const q = [[sx, sz]];
        if (!fits(sx, sz)) problems.push(`место у двери внутри не 3 в ширину (${sx},${sz})`);
        else {
            while (q.length) {
                const [x, z] = q.pop();
                for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, k = nx + ',' + nz; if (seen.has(k) || !fits(nx, nz)) continue; seen.add(k); q.push([nx, nz]); if (seen.size > 4000) break; }
            }
            // the targets must be reachable (within 1 cell of a wide-free cell)
            const near = (x, z) => { for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (seen.has((x + a) + ',' + (z + b))) return true; return false; };
            for (const bs of house.bedSpots) if (!near(Math.round(bs.x), Math.round(bs.z))) problems.push('к кровати не пройти');
            for (const st of out.stalls) { if (st.building !== kind) continue; if (!near(Math.round(st.back.x), Math.round(st.back.z))) problems.push('к продавцу за прилавком не пройти'); if (!near(Math.round(st.front.x), Math.round(st.front.z))) problems.push('к месту покупателя не пройти'); }
            for (const c of house.chests) if (!near(Math.round(c.x), Math.round(c.z))) problems.push('к сундуку не пройти');
        }
    }
    // hanging blocks: a solid block with no solid below it and none of its 4 neighbours on its layer or below (skips roofs: ramps hold)
    let hang = 0;
    for (const [k, t] of g) {
        if (!solid(t)) continue;
        const [x, L, z] = k.split(',').map(Number);
        if (L <= F) continue;
        if (solid(at(x, L - 1, z)) || solid(at(x, L + 1, z))) continue; // (a rope or a lantern hangs from what is above it)
        let held = false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (solid(at(x + dx, L, z + dz)) || solid(at(x + dx, L - 1, z + dz))) held = true;
        if (!held) { hang++; if (hang <= 3) problems.push(`блок в воздухе: ${x},${L - F - 1},${z}`); }
    }
    if (hang > 3) problems.push(`…и ещё ${hang - 3} в воздухе`);
    return { problems };
}
