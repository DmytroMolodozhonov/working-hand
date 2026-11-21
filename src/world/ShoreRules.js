/**
 * ShoreRules.js — the small things of the rivers' and lakes' edges (world generation SHORE_FROM_GEN; the author 21.11: «поработать над мелкими
 * деталями возле рек и озёр, максимально подробно, как с лесом»). Pure (no three.js): what stands in the shallows and lies on the bank, from the
 * seed and the land (heightAt), the same on every computer.
 *
 * In the water (≤ 2 blocks deep): reeds and cattails standing from the bed, lily pads with flowers floating on a lake or a still bend.
 * On the bank (within ~5 m of water): pebbles and stones at the waterline, sedge, yellow flag iris and marsh marigold in the wet, bleached driftwood
 * thrown up by the water. Only fresh water (rivers, lakes — never the sea, it has its own beach), not on built ground, not on a waterfall's bluff.
 * Thick near the water's edge, thinning inland; drifts of one sort by a patch noise.
 */
import { BLOCK, CHUNK } from './Terrain.js';

export const SHORE_FROM_GEN = 36;
export const SHORE = { CELL: 3, BANK: 6, SHALLOW: 2 };
/** The kinds, with the number of shapes each has (ShoreModel.js draws them). */
export const SHORE_KINDS = { reed: 3, lily: 2, pebbles: 2, iris: 1, marigold: 1, sedge: 2, drift: 2 };

function h01(a, b, s) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
function patch(x, z, seed, salt) {
    const X = x / 11, Z = z / 11, ix = Math.floor(X), iz = Math.floor(Z), fx = X - ix, fz = Z - iz;
    const u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
    const a = h01(ix, iz, seed + salt), b = h01(ix + 1, iz, seed + salt), c = h01(ix, iz + 1, seed + salt), d = h01(ix + 1, iz + 1, seed + salt);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

/** Whether any fresh water lies in (or just round) the chunk — a coarse look, so dry chunks cost nothing. */
export function chunkHasWater(data, cx, cz) {
    const H = data.heightAt, x0 = cx * CHUNK, z0 = cz * CHUNK;
    for (let z = -6; z <= CHUNK + 6; z += 8) for (let x = -6; x <= CHUNK + 6; x += 8) {
        H(x0 + x, z0 + z);
        if (H.water > 0 && !H.sea) return true;
    }
    return false;
}

/**
 * The shore things of one terrain chunk `c`: [{ id, k, v, x, y, z, s, yaw, … }] — `y` the foot (the bed in the water, the ground on the bank);
 * lily pads have `surf` (the water's top, where they float). `data`: the TerrainData.
 */
export function shoreOfChunk(data, c) {
    const out = [];
    if (!c) return out;
    const cx = c.cx, cz = c.cz;
    if (!chunkHasWater(data, cx, cz)) return out;
    const H = data.heightAt, seed = data.seed | 0, x0 = cx * CHUNK, z0 = cz * CHUNK, S = data.sites;
    const cell = { h: 0, w: 0, river: false, sea: false, big: false };
    const at = (x, z) => { const h = H(Math.round(x), Math.round(z)); cell.h = h; cell.w = H.water || 0; cell.river = !!H.river; cell.sea = !!H.sea; cell.big = !!H.big; return cell; };
    const busy = (x, z) => !!(S && (S.landAt(Math.round(x), Math.round(z)) || S.near(x, z, 6).length)) || !!data.falls?.near?.(x, z, 3);
    const push = (o) => { o.id = o.k + cx + ',' + cz + ':' + out.length; out.push(o); return o; };
    /** the open grass / sand / dirt block at a column of this chunk (or null): its top y */
    const bankY = (x, z) => {
        const lx = Math.round(x) - x0, lz = Math.round(z) - z0; // (a block spans ±0.5 round its whole number)
        if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK || x < x0 || z < z0 || x >= x0 + CHUNK || z >= z0 + CHUNK) return null;
        const col = lz * CHUNK + lx, L = c.top[col], i = (L - -53) * CHUNK * CHUNK + col; // (MIN_LAYER −53)
        const t = c.blocks[i];
        if (t !== BLOCK.GRASS && t !== BLOCK.SAND && t !== BLOCK.DIRT && t !== BLOCK.GRAVEL) return null;
        const above = c.blocks[i + CHUNK * CHUNK];
        if (above !== BLOCK.AIR && above !== undefined) return null;
        return L - 0.5;
    };
    /** the distance to the nearest fresh water from a point (m), up to BANK, looking four ways and two rings */
    const waterWithin = (x, z) => {
        for (const r of [1.5, 3, 4.5, 6]) for (let a = 0; a < 8; a += 1) {
            const g = at(x + Math.cos(a * 0.7854) * r, z + Math.sin(a * 0.7854) * r);
            if (g.w > 0 && !g.sea) return r;
        }
        return Infinity;
    };
    const CELL = SHORE.CELL;
    for (let lz = 0; lz < CHUNK; lz += CELL) for (let lx = 0; lx < CHUNK; lx += CELL) {
        const gx = x0 + lx, gz = z0 + lz, kx = Math.floor(gx / CELL), kz = Math.floor(gz / CELL);
        const jx = gx + 0.3 + h01(kx, kz, seed + 7101) * (CELL - 0.6), jz = gz + 0.3 + h01(kz, kx, seed + 7102) * (CELL - 0.6);
        if (jx >= x0 + CHUNK || jz >= z0 + CHUNK) continue; // (the last cell of 3 m sticks out of a 32 m chunk)
        const g = at(jx, jz);
        if (g.sea) continue;
        const rr = (n) => h01(kx * 5 + n, kz * 3 - n, seed + 7140 + n);
        const yaw = rr(0) * Math.PI * 2;
        if (g.w > 0) { // ---- in the water
            if (g.w > SHORE.SHALLOW + 1 || busy(jx, jz)) continue;
            const bed = g.h - 0.5, surf = g.h + g.w - 0.5, still = !g.river;
            // a rim of shallows (depth 1…2) is where reeds stand; lilies float a little deeper and need still water
            const rim = g.w <= SHORE.SHALLOW;
            const reedP = patch(jx, jz, seed, 7110);
            if (rim && rr(1) < 0.32 + 0.4 * reedP) {
                const v = reedP > 0.62 ? 1 : reedP < 0.28 ? 2 : 0; // (cattails in the thickest patches, short rushes in the thin)
                const n = 1 + Math.floor(rr(2) * 3);
                for (let i = 0; i < n; i++) {
                    const a = rr(3 + i) * 6.28, d = rr(6 + i) * 1.6, x = jx + Math.cos(a) * d, z = jz + Math.sin(a) * d, q = at(x, z);
                    if (x < x0 || z < z0 || x >= x0 + CHUNK || z >= z0 + CHUNK) continue;
                    if (!(q.w > 0) || q.w > SHORE.SHALLOW || q.sea) continue;
                    push({ k: 'reed', v: i === 0 ? v : (rr(9 + i) < 0.3 ? 1 : v), x, y: q.h - 0.5, z, s: 0.8 + rr(12 + i) * 0.55, yaw: rr(15 + i) * 6.28, surf: q.h + q.w - 0.5 });
                }
            }
            if (still && g.w >= 1 && g.w <= SHORE.SHALLOW + 1 && patch(jx, jz, seed, 7111) > 0.45 && rr(18) < 0.5) {
                push({ k: 'lily', v: rr(19) < 0.4 ? 1 : 0, x: jx, y: bed, z: jz, s: 0.8 + rr(20) * 0.6, yaw, surf });
            }
            continue;
        }
        // ---- on the bank
        const wd = waterWithin(jx, jz);
        if (wd === Infinity || busy(jx, jz)) continue;
        const y = bankY(jx, jz);
        if (y == null) continue;
        const near = 1 - wd / (SHORE.BANK + 1); // (1 at the water, 0 inland)
        const wetP = patch(jx + 50, jz - 20, seed, 7112), flowerP = patch(jx, jz + 70, seed, 7113);
        // pebbles and stones at the waterline: the commonest thing on a bank
        if (rr(21) < 0.2 + 0.6 * near) {
            const x = jx + (rr(22) - 0.5) * 2, z = jz + (rr(23) - 0.5) * 2, py = bankY(x, z);
            if (py != null) push({ k: 'pebbles', v: rr(24) < 0.5 ? 1 : 0, x, y: py, z, s: 0.7 + rr(25) * 0.8, yaw });
        }
        // sedge and rushes: tufts of wide blades in the damp
        if (rr(26) < 0.18 + 0.4 * near * (0.5 + wetP)) {
            const x = jx + (rr(27) - 0.5) * 2, z = jz + (rr(28) - 0.5) * 2, py = bankY(x, z);
            if (py != null) push({ k: 'sedge', v: rr(29) < 0.4 ? 1 : 0, x, y: py, z, s: 0.8 + rr(30) * 0.6, yaw });
        }
        // yellow flowers in drifts at the very edge
        if (near > 0.3 && flowerP > 0.5 && rr(31) < 0.55) {
            const n = 1 + Math.floor(rr(32) * 3), iris = rr(33) < 0.5;
            for (let i = 0; i < n; i++) {
                const x = jx + (rr(34 + i) - 0.5) * 2.4, z = jz + (rr(37 + i) - 0.5) * 2.4, py = bankY(x, z);
                if (py != null) push({ k: iris ? 'iris' : 'marigold', v: 0, x, y: py, z, s: 0.8 + rr(40 + i) * 0.5, yaw: rr(43 + i) * 6.28 });
            }
        }
        // driftwood thrown up by the water
        if (near > 0.4 && rr(46) < 0.07) push({ k: 'drift', v: rr(47) < 0.5 ? 1 : 0, x: jx, y, z: jz, s: 0.8 + rr(48) * 0.7, yaw });
    }
    return out;
}
