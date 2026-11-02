/**
 * BodyGuard.js — a body of ANY creature never goes into a solid thing, however it is pushed (the author: «житель врезается в угол дома,
 * проваливается под кровать и в текстуры дома. Такого не должно быть… лежит как упал, но без прохода в текстуры»).
 *
 * The world has two kinds of solids: the BLOCKS of the terrain (walls, floors, furniture made of blocks — `terrain.solidIn`) and the
 * COLLISION BOXES (`CollisionWorld.addBox`: beds, chests, cauldrons, trunks, doors…). The villagers' walking test (`CastleLife._walkable`)
 * knows only the blocks — a pushed villager flew through a bed and lay inside it. This module is the one place that knows both:
 *
 *   1. `stepBody`       a standing body is moved in sub-steps of at most half its radius (a 60 m/s Jolt never skips a block or a bed);
 *                       what blocks it makes it slide along the face and lose the speed that hit (`bounce`).
 *   2. `lieProbe`       a LYING body is a chain of capsules along the ground (head 3 m from the feet, shoulders, pelvis, legs): where it
 *                       rests on something low (a bed, a chest lid) it lies ON it (`rest` — how much to raise it), where it lies
 *                       in something tall (a cupboard, a wall, a table of blocks) it is shoved back out of it (`push`) — never up through,
 *                       never under.
 *   3. `freeSpot`       the safety net: a body found inside a solid is led to the nearest place that is free for its whole size, on the
 *                       side it came from — never behind a wall, never under a bed.
 *
 * Pure numbers: `world` is {boxes(minX,maxX,minZ,maxZ) → array of {minX,maxX,minY,maxY,noSupport?}, solid(ix, iz, layerLo, layerHi) →
 * bool (terrain blocks; optional), floor(x, z, reachY) → floor height}. No THREE, no garbage in the hot path (module arrays).
 */

export const GUARD = {
    SUB_K: 0.5,        // a sub-step is at most this share of the body's radius
    LOW: 0.45,         // a box lower than this above the feet is a step (walked over), not a wall
    BOUNCE: 0.25,      // share of the speed that comes back off a wall (a body thrown at a wall slides, a little comes back)
    BODY_H: 3.5,       // a standing body's height (m)
    LIE_LEN: 3.4,      // a lying villager: feet → head along the ground (m)
    LIE_W: 0.6,        // half the width of the lying body (m)
    LIE_UP: 1.6,       // a box up to this high (above the floor) is lain ON; a taller one is a wall the body is shoved out of
    LIE_THICK: 0.55,   // the body's thickness lying (m): it must not lie with this much sunk into a block
    SAFE_R: 4,         // the safety net searches this far (m)
};

/**
 * The world as BodyGuard.js sees it: the collision boxes (beds, chests, cauldrons…) and the terrain's blocks. Made once per game.
 * (the author: a pushed villager flew through a bed and lay inside it — his walking test knew only the blocks)
 */
export function guardWorld(g) {
    if (g._guardWorld) return g._guardWorld;
    const w = {
        boxes: (a, b, c, d) => g.collision?.queryBoxes ? g.collision.queryBoxes(a, b, c, d) : NO_BOXES,
        solid: (ix, iz, lo, hi) => { const t = g.world?.terrain?.data || g.terrain?.data; return !!(t?.solidIn && t.solidIn(ix, iz, lo, hi)); },
        floor: (x, z, reachY) => g.collision?.groundAt ? g.collision.groundAt(x, z, reachY) : 0,
    };
    return (g._guardWorld = w);
}
const NO_BOXES = [];
const ALONG = [0, 0.2, 0.4, 0.6, 0.8, 1], ACROSS = [0, -1, 1];

/** Is there a solid box on the cylinder (x, z, r) between feet+low and feet+height? Returns the box or null. */
export function boxHit(world, x, z, r, feetY, height = GUARD.BODY_H, low = GUARD.LOW) {
    const list = world.boxes(x - r, x + r, z - r, z + r);
    for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.maxY <= feetY + low || b.minY >= feetY + height) continue;
        // (the circle against the rectangle)
        const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x, cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz < r * r) return b;
    }
    return null;
}

/** Terrain blocks on the body's span (feet..feet+height) at a cell. */
export function blockHit(world, x, z, feetY, height = GUARD.BODY_H) {
    if (!world.solid) return false;
    const lo = Math.round(feetY + 1.5); // (the layer of the feet — the first one over the floor, as CastleLife._walkCell counts it)
    return world.solid(Math.round(x), Math.round(z), lo, lo + Math.max(1, Math.round(height) - 1));
}

/** Can a standing body of radius `r` be at (x, z)? The shoulders count (the cross of four points), the boxes by the circle. */
export function standFree(world, x, z, r, feetY, height = GUARD.BODY_H) {
    if (boxHit(world, x, z, r, feetY, height)) return false;
    if (!world.solid) return true;
    return !blockHit(world, x, z, feetY, height) && !blockHit(world, x + r, z, feetY, height) && !blockHit(world, x - r, z, feetY, height)
        && !blockHit(world, x, z + r, feetY, height) && !blockHit(world, x, z - r, feetY, height);
}

/**
 * Move a standing body (p: {x, z}) by (dx, dz) in sub-steps of at most SUB_K·r. Each sub-step is tried whole, then along x, then along z
 * (it slides along a face); stopped for good → it ends. `extra(x, z)` — the caller's own test (the villagers' `_walkable`).
 * Returns the number of metres actually moved along x and z in `out` ({x, z}) — the caller takes the speed off what was blocked.
 */
export function stepBody(world, p, dx, dz, r, feetY, out = { x: 0, z: 0 }, extra = null) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * GUARD.SUB_K)));
    const sx = dx / n, sz = dz / n;
    const x0 = p.x, z0 = p.z;
    const ok = (x, z) => standFree(world, x, z, r, feetY) && (!extra || extra(x, z));
    for (let i = 0; i < n; i++) {
        if (ok(p.x + sx, p.z + sz)) { p.x += sx; p.z += sz; }
        else if (sx && ok(p.x + sx, p.z)) p.x += sx;
        else if (sz && ok(p.x, p.z + sz)) p.z += sz;
        else break;
    }
    out.x = p.x - x0; out.z = p.z - z0;
    return out;
}

/** After a step: the speed (vx, vz) loses what was blocked — a body that hit a wall slides along it, a little comes back. */
export function bounce(v, want, got, k = GUARD.BOUNCE) {
    const bx = Math.abs(want.x) > 1e-6 && Math.abs(got.x) < Math.abs(want.x) * 0.5;
    const bz = Math.abs(want.z) > 1e-6 && Math.abs(got.z) < Math.abs(want.z) * 0.5;
    if (bx) v.vx *= -k;
    if (bz) v.vz *= -k;
    return bx || bz;
}

// ------------------------------------------------------------------ the lying body
const _probe = { rest: 0, pushX: 0, pushZ: 0, hit: 0, tall: 0 };

/**
 * A body lying with its feet at (fx, fz) on the floor `floorY`, its head along the unit direction (ax, az), `len` m long.
 * → {rest: how high above the floor it rests (the top of the highest low box under it, 0 if none),
 *    pushX/pushZ: unit direction to shove it away from tall solids (0, 0 if lying clear), hit: samples inside tall solids, tall: the box}.
 * (the returned object is reused — read it at once)
 */
export function lieProbe(world, fx, fz, ax, az, floorY, len = GUARD.LIE_LEN, halfW = GUARD.LIE_W) {
    const n = Math.hypot(ax, az) || 1; ax /= n; az /= n;
    let rest = 0, hit = 0, px = 0, pz = 0, tall = null, lowN = 0, lx = 0, lz = 0, lowBox = null;
    for (let i = 0; i < ALONG.length; i++) {
        const k = ALONG[i];
        for (let j = 0; j < ACROSS.length; j++) {
            const w = ACROSS[j] * halfW;
            const x = fx + ax * len * k - az * w, z = fz + az * len * k + ax * w;
            const list = world.boxes(x, x, z, z);
            for (let q = 0; q < list.length; q++) {
                const b = list[q];
                if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
                const top = b.maxY - floorY;
                if (top <= 0.05 || b.minY > floorY + GUARD.LIE_UP) continue; // (nothing, or hanging high over the body)
                if (top <= GUARD.LIE_UP && !b.noSupport) { // (low: lain ON — if most of the body is on it; else it is a step the body is shoved off)
                    if (top > rest) rest = top;
                    lowN++; lowBox = b;
                    const mx = (b.minX + b.maxX) / 2, mz = (b.minZ + b.maxZ) / 2;
                    const ex = (b.maxX - b.minX) / 2 - Math.abs(x - mx), ez = (b.maxZ - b.minZ) / 2 - Math.abs(z - mz);
                    if (ex < ez) lx += x < mx ? -1 : 1; else lz += z < mz ? -1 : 1;
                    continue;
                }
                hit++; tall = b;
                // away from the box's middle (along the shorter way out of it)
                const mx = (b.minX + b.maxX) / 2, mz = (b.minZ + b.maxZ) / 2;
                const ex = (b.maxX - b.minX) / 2 - Math.abs(x - mx), ez = (b.maxZ - b.minZ) / 2 - Math.abs(z - mz);
                if (ex < ez) px += x < mx ? -1 : 1; else pz += z < mz ? -1 : 1;
            }
            if (world.solid && world.solid(Math.round(x), Math.round(z), Math.round(floorY + 1.5), Math.round(floorY + 1.5))) { hit++; px -= ax * (1 - k * 0.5); pz -= az * (1 - k * 0.5); } // (a block: back along the body)
        }
    }
    if (lowN && lowN * 2 < ALONG.length * ACROSS.length) { rest = 0; hit += lowN; px += lx; pz += lz; tall = lowBox; } // (mostly beside it: not lain on, shoved off)
    const m = Math.hypot(px, pz);
    _probe.rest = rest; _probe.hit = hit; _probe.tall = tall;
    _probe.pushX = m > 1e-6 ? px / m : 0; _probe.pushZ = m > 1e-6 ? pz / m : 0;
    return _probe;
}

/**
 * The safety net: the nearest place to (x, z) where a standing body of radius r is free (spiral search, rings of 0.5 m, 16 directions,
 * nearest first); `prefer` (a unit vector) is the way it came from. `extra(x, z)` — the caller's own test. null: nothing free in SAFE_R.
 */
export function freeSpot(world, x, z, r, feetY, extra = null, prefer = null, out = { x: 0, z: 0 }) {
    for (let d = 0.5; d <= GUARD.SAFE_R; d += 0.5) {
        let best = -Infinity, bx = 0, bz = 0;
        for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2, cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
            if (!standFree(world, cx, cz, r, feetY) || (extra && !extra(cx, cz))) continue;
            // (no jumping through a wall: the straight way to the spot is free of blocks)
            if (!straightFree(world, x, z, cx, cz, r, feetY)) continue;
            const score = prefer ? Math.cos(a) * prefer.x + Math.sin(a) * prefer.z : 0;
            if (score > best) { best = score; bx = cx; bz = cz; }
        }
        if (best > -Infinity) { out.x = bx; out.z = bz; return out; }
    }
    return null;
}

/** The way from (x0, z0) to (x1, z1) is free of tall boxes and blocks in steps of half the radius (the start itself may be inside). */
export function straightFree(world, x0, z0, x1, z1, r, feetY) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / (r * GUARD.SUB_K)));
    const own = boxHit(world, x0, z0, r, feetY); // (the thing the body is in: leaving it is the point)
    for (let i = 1; i < n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        const b = boxHit(world, x, z, r * 0.7, feetY);
        if (b && b !== own) return false;
        if (blockHit(world, x, z, feetY) || blockHit(world, x + r * 0.7, z, feetY) || blockHit(world, x - r * 0.7, z, feetY) || blockHit(world, x, z + r * 0.7, feetY) || blockHit(world, x, z - r * 0.7, feetY)) return false;
    }
    return true;
}

/** Is a standing body of radius r inside a solid right now (not merely touching: its middle)? → the box / true / null. */
export function insideSolid(world, x, z, r, feetY) {
    const b = boxHit(world, x, z, r * 0.6, feetY);
    if (b) return b;
    return blockHit(world, x, z, feetY) ? true : null;
}

/** A readable name of what the body was in (for the journal). */
export function solidName(s) {
    if (!s) return 'твёрдого';
    if (s === true) return 'стены';
    return s.kind === 'bed' ? 'кровати' : s.kind ? `предмета «${s.kind}»` : 'предмета';
}
