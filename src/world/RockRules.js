/**
 * RockRules.js — the boulders by the rivers (world generation ROCKS_FROM_GEN; the author 16.11: «рядом с реками иногда бывают камни…
 * не квадратные, а как в реальности»). Pure (no three.js): where they lie and how big, from the seed and the land, the same on every computer.
 *
 * A boulder is a rock of its own (RockModel.js draws it: an uneven, faceted stone with grain, cracks and moss), not blocks: it lies on the
 * ground of its chunk, partly buried, alone or in a little group (a big one with small ones beside it and pebbles), on the banks of the
 * rivers, in the shallows, and at the foot of every waterfall. Nothing lies in a built place, on a bluff, in deep water, on the sea's beach.
 */
export const ROCKS_FROM_GEN = 32;

export const ROCK = {
    CHUNK: 16,
    SUB: 8, // m: the cell of the candidates (four in a chunk)
    NEAR_RIVER: 20, // m: a boulder lies within this of a river's water
    CHANCE: 0.34, // a candidate cell by the river has a group by this chance (the nearer the water the likelier)
    SHALLOW: 2, // blocks: the deepest water a boulder lies in (it shows above it)
    SIZE: { pebble: [0.45, 0.8], small: [0.9, 1.5], medium: [1.6, 2.6], big: [2.8, 4.4] }, // m (the radius: a hero is 3.5 m high)
    VARIANTS: 8, // shapes (RockModel.js)
};

function h01(a, b, s) {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** How near a river's water the point is (m), up to NEAR_RIVER, or Infinity: eight directions, three rings. */
export function riverDistance(raw, x, z, max = ROCK.NEAR_RIVER) {
    let best = Infinity;
    raw(Math.round(x), Math.round(z));
    if (raw.river && raw.water > 0) return 0;
    for (let r = 5; r <= max; r += 5) {
        for (let a = 0; a < 8; a++) {
            const ang = a * Math.PI / 4 + 0.3;
            raw(Math.round(x + Math.cos(ang) * r), Math.round(z + Math.sin(ang) * r));
            if (raw.river && raw.water > 0 && r < best) best = r;
        }
        if (best < Infinity) break;
    }
    return best;
}

/**
 * The boulders of a chunk: [{ id, x, y, z, r, v, yaw, tilt, kind }] — `y` the top of the ground under it, `r` the radius, `v` the shape.
 * `data`: a TerrainData (its heightAt with its flags; its sites and falls to keep off).
 */
export function rocksOfChunk(data, cx, cz) {
    const raw = data.rawHeight || data.heightAt, H = data.heightAt, seed = data.seed | 0;
    const x0 = cx * ROCK.CHUNK, z0 = cz * ROCK.CHUNK, out = [];
    // the foot of every waterfall that reaches into this chunk's neighbourhood: a heap of boulders where the water lands
    if (data.falls) {
        for (const p of data.falls.around(x0 + 8, z0 + 8, 22)) {
            const n = p.kind === 'great' ? 9 : p.kind === 'fall' ? 6 : 4;
            for (let i = 0; i < n; i++) {
                const a = h01(i, p.x, seed + 31) * Math.PI * 2, d = 3 + h01(i + 7, p.z, seed + 32) * (p.W * 0.55);
                const tx = -p.nz, tz = p.nx; // along the river
                const side = (h01(i, p.z, seed + 33) - 0.5) * 2;
                const x = p.x - p.nx * (1.5 + h01(i, p.x, seed + 34) * 4) + tx * side * d, z = p.z - p.nz * (1.5 + h01(i, p.x, seed + 34) * 4) + tz * side * d;
                void a;
                if (x < x0 || x >= x0 + ROCK.CHUNK || z < z0 || z >= z0 + ROCK.CHUNK) continue;
                const ground = H(Math.round(x), Math.round(z)), wet = H.water;
                if (H.sea || (wet > ROCK.SHALLOW) || ground < -ROCK.SHALLOW) continue;
                const size = h01(i, p.x + p.z, seed + 35);
                const r = size < 0.5 ? lerpR(ROCK.SIZE.small, size * 2) : size < 0.85 ? lerpR(ROCK.SIZE.medium, (size - 0.5) / 0.35) : lerpR(ROCK.SIZE.big, (size - 0.85) / 0.15);
                out.push(make(seed, x, z, ground, wet, r, 'fall' + i));
            }
        }
    }
    for (let sz = 0; sz < 2; sz++) for (let sx = 0; sx < 2; sx++) {
        const cellX = (x0 + sx * ROCK.SUB), cellZ = (z0 + sz * ROCK.SUB);
        const key = (cellX >> 3), kz = (cellZ >> 3);
        if (h01(key, kz, seed + 41) > ROCK.CHANCE * 1.6) continue; // (the cheap test first: most cells have none)
        const x = cellX + 1 + h01(key, kz, seed + 42) * (ROCK.SUB - 2), z = cellZ + 1 + h01(kz, key, seed + 43) * (ROCK.SUB - 2);
        const rd = riverDistance(raw, x, z);
        if (rd === Infinity) continue;
        const near = 1 - rd / (ROCK.NEAR_RIVER + 4); // (1 at the water, 0 at the edge)
        if (h01(key + 5, kz - 3, seed + 44) > ROCK.CHANCE * (0.5 + near)) continue;
        const ground = H(Math.round(x), Math.round(z)), wet = H.water;
        if (H.sea || H.beach && ground < 0 || wet > ROCK.SHALLOW || ground < -ROCK.SHALLOW) continue;
        if (data.sites && (data.sites.landAt(Math.round(x), Math.round(z)) || data.sites.near(x, z, 6).length)) continue;
        if (data.falls?.near(x, z, 0)) continue; // (on the bluff: the fall's own rocks are the ones at its foot)
        // a group: one big or medium, small ones beside it, pebbles
        const roll = h01(key, kz, seed + 45);
        const lead = roll < 0.12 ? ROCK.SIZE.big : roll < 0.45 ? ROCK.SIZE.medium : ROCK.SIZE.small;
        out.push(make(seed, x, z, ground, wet, lerpR(lead, h01(key, kz, seed + 46)), 'm' + key + ',' + kz));
        const extra = lead === ROCK.SIZE.big ? 3 : lead === ROCK.SIZE.medium ? 2 : 1;
        for (let i = 0; i < extra; i++) {
            const a = h01(key + i, kz, seed + 47) * Math.PI * 2, d = lead[1] * (0.9 + h01(key, kz + i, seed + 48) * 1.6);
            const ex = x + Math.cos(a) * d, ez = z + Math.sin(a) * d;
            if (ex < x0 || ex >= x0 + ROCK.CHUNK || ez < z0 || ez >= z0 + ROCK.CHUNK) continue;
            const g2 = H(Math.round(ex), Math.round(ez)), w2 = H.water;
            if (H.sea || w2 > ROCK.SHALLOW || g2 < -ROCK.SHALLOW || (data.falls?.near(ex, ez, 0))) continue;
            const sm = h01(key + i, kz + 9, seed + 49) < 0.45 ? ROCK.SIZE.pebble : ROCK.SIZE.small;
            out.push(make(seed, ex, ez, g2, w2, lerpR(sm, h01(key + i, kz, seed + 50)), 'm' + key + ',' + kz + 'e' + i));
        }
    }
    // the lead's own cell may lie outside the chunk by a step (the spread): keep only those inside
    return out.filter((r) => r.x >= x0 && r.x < x0 + ROCK.CHUNK && r.z >= z0 && r.z < z0 + ROCK.CHUNK);
}

const lerpR = (range, t) => range[0] + (range[1] - range[0]) * Math.max(0, Math.min(1, t));

function make(seed, x, z, ground, wet, r, id) {
    const k = Math.floor(x * 7) * 131 + Math.floor(z * 7);
    // (the top of the ground: block layer g spans up to g − 0.5; a river's bed likewise — the water stands over it)
    return {
        id, x, z, y: ground - 0.5, r, v: Math.floor(h01(k, 3, seed + 61) * ROCK.VARIANTS),
        yaw: h01(k, 4, seed + 62) * Math.PI * 2, tilt: (h01(k, 5, seed + 63) - 0.5) * 0.35,
        squash: 0.62 + h01(k, 6, seed + 64) * 0.3, wet: wet > 0,
        kind: r >= ROCK.SIZE.big[0] ? 'big' : r >= ROCK.SIZE.medium[0] ? 'medium' : r >= ROCK.SIZE.small[0] ? 'small' : 'pebble',
    };
}
