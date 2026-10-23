/**
 * BlockShapes.js — the shapes a block can have besides the whole cube: slabs (half a block, the lower or
 * the upper half), ramps (a wedge rising 1 m over 1 m — 45° — in four directions, on the floor or upside
 * down under a ceiling) and the corners where two ramps meet (the outer corner of a hip roof, the inner
 * corner of a valley), on the floor and under a ceiling.
 *
 * The shape is a second layer of a chunk (`c.shape`, the same indexing as `c.blocks`, made only when a
 * chunk has a shaped block): the block's material stays its id (grass, stone, planks, roof tiles…), the
 * shape only says which part of the cell it fills. 0 is the whole cube — every world made before has no
 * shapes at all and stays exactly as it was.
 *
 * Every shape is described the same way: the heights (0, ½ or 1) of its four top corners — at the cell's
 * (−x,−z), (+x,−z), (−x,+z), (+x,+z) — and whether it hangs from the ceiling (`ceil`: the solid is the top
 * of the cell, its underside at 1 − h). The surface between the corners is two triangles split along the
 * diagonal through the corner that differs from the other three (a hip line, a valley line); for a slab
 * or a ramp both triangles lie in one plane.
 *
 * Pure data and maths (no THREE): the worker's mesher (Terrain.buildChunkArrays), the collisions
 * (Terrain.surfaceY / floorAt / ceilingAt), the plans of the buildings (Castles.Plan) all use it.
 */

/** Shape codes (0: the whole block). */
export const SHAPE = {
    FULL: 0,
    SLAB: 1, SLAB_TOP: 2, // half a block: the lower half / the upper half
    // ramps rising towards +x, −x, +z, −z (the high side there)
    RAMP_PX: 3, RAMP_NX: 4, RAMP_PZ: 5, RAMP_NZ: 6,
    // the same upside down (under a ceiling, a vault): thick at the named side
    CEIL_PX: 7, CEIL_NX: 8, CEIL_PZ: 9, CEIL_NZ: 10,
    // outer corners (one corner high: the hip of a roof) — by the high corner −x−z, +x−z, −x+z, +x+z
    OUT_00: 11, OUT_10: 12, OUT_01: 13, OUT_11: 14,
    // inner corners (three corners high: the valley) — by the low corner
    IN_00: 15, IN_10: 16, IN_01: 17, IN_11: 18,
    // the corners upside down
    COUT_00: 19, COUT_10: 20, COUT_01: 21, COUT_11: 22,
    CIN_00: 23, CIN_10: 24, CIN_01: 25, CIN_11: 26,
};
export const SHAPE_COUNT = 27;

/** Corner heights [h(−x−z), h(+x−z), h(−x+z), h(+x+z)] of every shape. */
const H = new Float32Array(SHAPE_COUNT * 4);
/** Hangs from the ceiling (1) or stands on the floor (0). */
const CEIL = new Uint8Array(SHAPE_COUNT);
/** The diagonal its surface is split along: 0 → corners 0–3, 1 → corners 1–2. */
const DIAG = new Uint8Array(SHAPE_COUNT);
function def(code, h, ceil = 0) {
    H.set(h, code * 4);
    CEIL[code] = ceil;
    // (the corner that differs from the other three: the split goes through it)
    let odd = -1;
    for (let k = 0; k < 4; k++) {
        let same = 0;
        for (let j = 0; j < 4; j++) if (j !== k && h[j] === h[k]) same++;
        if (same === 0) odd = k;
    }
    DIAG[code] = odd === 1 || odd === 2 ? 1 : 0;
}
def(SHAPE.FULL, [1, 1, 1, 1]);
def(SHAPE.SLAB, [0.5, 0.5, 0.5, 0.5]);
def(SHAPE.SLAB_TOP, [0.5, 0.5, 0.5, 0.5], 1);
const RAMPS = [[0, 1, 0, 1], [1, 0, 1, 0], [0, 0, 1, 1], [1, 1, 0, 0]]; // (+x, −x, +z, −z)
for (let k = 0; k < 4; k++) { def(SHAPE.RAMP_PX + k, RAMPS[k]); def(SHAPE.CEIL_PX + k, RAMPS[k], 1); }
for (let k = 0; k < 4; k++) {
    const out = [0, 0, 0, 0], inn = [1, 1, 1, 1];
    out[k] = 1; inn[k] = 0;
    def(SHAPE.OUT_00 + k, out); def(SHAPE.IN_00 + k, inn);
    def(SHAPE.COUT_00 + k, out, 1); def(SHAPE.CIN_00 + k, inn, 1);
}

/** Is it a shape at all (not the whole block, a known code)? */
export const isShaped = (s) => s > 0 && s < SHAPE_COUNT;
/** Does it hang from the ceiling (its solid at the top of the cell)? */
export const isCeilShape = (s) => CEIL[s] === 1;
/** A ramp on the floor (any direction)? */
export const isRamp = (s) => s >= SHAPE.RAMP_PX && s <= SHAPE.RAMP_NZ;
/** The four corner heights of a shape (a view, not a copy). */
export const cornerHeights = (s) => H.subarray(s * 4, s * 4 + 4);
/** The diagonal its surface is split along (0: −x−z to +x+z, 1: +x−z to −x+z). */
export const shapeDiag = (s) => DIAG[s];

/**
 * Which materials may take a shape: any solid block that is a block of stuff — earth, rock, sand, snow,
 * planks, bricks, castle stone, roofs, ice walls… — not water, leaves, plants, glass-like lamps, doors,
 * fences, carpets and the like (they keep their own form).
 */
const NO_SHAPE = new Set([0, 8, 7, 11, 13, 15, 17, 19, 36, 40, 43, 45, 46, 47, 52, 53, 55, 60, 69]);
// (0 air, 8 water, leaves 7 13 15 17 19, 11 ICE_SHAPE, 36 wheat, 40 lantern, 43 books, 45 fence, 46 veg, 47 flowers,
//  52/53 arcane lamps, 55 potions, 60 glowing ice, 69 a planet's leaves)
export const canShape = (type) => type > 0 && !NO_SHAPE.has(type);

/** Height of a floor shape's surface over the cell's local point (fx, fz ∈ 0…1, 0 at the −x / −z side). */
function surf(s, fx, fz) {
    const o = s * 4, h0 = H[o], h1 = H[o + 1], h2 = H[o + 2], h3 = H[o + 3];
    if (DIAG[s] === 0) {
        // triangles (0,1,3) — below the diagonal z < x — and (0,3,2)
        return fz <= fx ? h0 + (h1 - h0) * fx + (h3 - h1) * fz : h0 + (h3 - h2) * fx + (h2 - h0) * fz;
    }
    // triangles (0,1,2) — fx + fz ≤ 1 — and (1,3,2)
    return fx + fz <= 1 ? h0 + (h1 - h0) * fx + (h2 - h0) * fz : h3 + (h3 - h2) * (fx - 1) + (h3 - h1) * (fz - 1);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The top of the solid in the cell at (fx, fz) — 0…1 above the cell's bottom (a ceiling shape: 1). */
export function shapeTop(s, fx, fz) {
    if (!s) return 1;
    if (CEIL[s]) return 1;
    return surf(s, clamp01(fx), clamp01(fz));
}

/** The underside of the solid in the cell at (fx, fz) — 0…1 above the cell's bottom (a floor shape: 0). */
export function shapeBottom(s, fx, fz) {
    if (!s || !CEIL[s]) return 0;
    return 1 - surf(s, clamp01(fx), clamp01(fz));
}

/** Is the cell's local point (fx, fy, fz ∈ 0…1) inside the shape's solid? */
export function shapeHas(s, fx, fy, fz) {
    if (!s) return true;
    const h = surf(s, clamp01(fx), clamp01(fz));
    return CEIL[s] ? fy >= 1 - h : fy <= h;
}

/**
 * The two corner heights along one side of the cell: dir 0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z (sides only:
 * 0, 1, 4, 5) — ordered by the other horizontal axis (z for an x side, x for a z side), low first.
 */
export function sideHeights(s, dir, out) {
    const o = s * 4;
    if (dir === 0) { out[0] = H[o + 1]; out[1] = H[o + 3]; }
    else if (dir === 1) { out[0] = H[o]; out[1] = H[o + 2]; }
    else if (dir === 4) { out[0] = H[o + 2]; out[1] = H[o + 3]; }
    else { out[0] = H[o]; out[1] = H[o + 1]; }
    return out;
}

/**
 * Does the shape cover the whole face of its cell on side `dir` (0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z)? Then
 * the neighbour's face against it is hidden, as against a whole block.
 */
const FULL_FACE = new Uint8Array(SHAPE_COUNT * 6);
{
    const t = [0, 0];
    for (let s = 0; s < SHAPE_COUNT; s++) {
        const o = s * 4, all = H[o] === 1 && H[o + 1] === 1 && H[o + 2] === 1 && H[o + 3] === 1;
        for (const d of [0, 1, 4, 5]) { sideHeights(s, d, t); FULL_FACE[s * 6 + d] = t[0] === 1 && t[1] === 1 ? 1 : 0; }
        // a floor shape's bottom is whole, its top only when it is the whole block; a ceiling shape the other way round
        FULL_FACE[s * 6 + 2] = CEIL[s] || all ? 1 : 0;
        FULL_FACE[s * 6 + 3] = !CEIL[s] || all ? 1 : 0;
    }
}
export const faceFull = (s, dir) => FULL_FACE[s * 6 + dir] === 1;
/** The table itself (the mesher's hot loop reads it straight: FULL_FACE[s * 6 + dir]). */
export const FULL_FACES = FULL_FACE;

const _a = [0, 0], _b = [0, 0];
/**
 * Is a shape's side face (`s` on side `dir`) all hidden behind its neighbour (`n`, with the side facing
 * back)? Both shaped: the neighbour's part of the shared square must hold all of this one's.
 */
export function sideCovered(s, dir, n) {
    if (!n) return true; // (a whole block)
    if (FULL_FACE[n * 6 + (dir ^ 1)]) return true;
    sideHeights(s, dir, _a);
    if (_a[0] === 0 && _a[1] === 0) return true; // (nothing on that side)
    if (CEIL[s] !== CEIL[n]) return false;
    sideHeights(n, dir ^ 1, _b);
    return _b[0] >= _a[0] && _b[1] >= _a[1];
}

/**
 * The shape turned by quarter turns about the vertical axis (k = 1: +x → +z → −x → −z), for the plans
 * of the buildings (a roof facing any way).
 */
export function rotateShape(s, k) {
    k = ((k % 4) + 4) % 4;
    if (!k || !s || s === SHAPE.SLAB || s === SHAPE.SLAB_TOP) return s;
    // corner heights turned: the corner (x, z) goes to (−z, x) — in the cell's ±1 corners
    const o = s * 4, h = [H[o], H[o + 1], H[o + 2], H[o + 3]];
    for (let r = 0; r < k; r++) {
        // corner index = (x>0) + 2·(z>0); (x, z) → (−z, x)
        const t = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) {
            const x = i & 1 ? 1 : -1, z = i & 2 ? 1 : -1;
            const nx = -z, nz = x;
            t[(nx > 0 ? 1 : 0) + (nz > 0 ? 2 : 0)] = h[i];
        }
        h.splice(0, 4, ...t);
    }
    for (let c = 1; c < SHAPE_COUNT; c++) {
        if (CEIL[c] !== CEIL[s]) continue;
        const q = c * 4;
        if (H[q] === h[0] && H[q + 1] === h[1] && H[q + 2] === h[2] && H[q + 3] === h[3]) return c;
    }
    return s;
}

/** The ramp rising towards (dx, dz) — one of the four sides; `ceil`: upside down. */
export function rampToward(dx, dz, ceil = false) {
    const k = dx > 0 ? 0 : dx < 0 ? 1 : dz > 0 ? 2 : 3;
    return (ceil ? SHAPE.CEIL_PX : SHAPE.RAMP_PX) + k;
}

/** How much of the cell the shape fills (0…1): a slab and a ramp half, an outer corner a third, an inner one two thirds. */
export function shapeVolume(s) {
    if (!s) return 1;
    const o = s * 4, h0 = H[o], h1 = H[o + 1], h2 = H[o + 2], h3 = H[o + 3];
    // (two triangles of half the cell each: their mean height)
    const v = DIAG[s] === 0 ? ((h0 + h1 + h3) + (h0 + h3 + h2)) / 6 : ((h0 + h1 + h2) + (h1 + h3 + h2)) / 6;
    return v;
}
