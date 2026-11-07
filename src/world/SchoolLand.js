/**
 * SchoolLand.js — the school castle Akseldorf (docs/rules/school.md; the author 07.11) as a place of the REAL world: the world's own
 * land — mountains, woods, rivers, lakes (the author: «ужасный вид… искусственно, нет гор красивых») — and on it, near the start, a
 * levelled terrace for the castle that melts into the slopes round it, and a road down from its gates. Pure (no THREE): the terrain
 * workers make it the same on every computer (Terrain: the mode «Школа», `school` — SchoolSite like VampireCastleSite).
 *
 * The castle is in the spirit of an old school of magic, but its own — no names, crests or houses of any book:
 *   - the CURTAIN WALL (60 × 120 m inside) with merlons and a wall-walk, four round CORNER TOWERS with tall slate spires;
 *   - the GATEHOUSE in the south: two round towers and a tall pointed archway (8 × 12 m), the road from the valley's edge to it;
 *   - the COURTYARD (flagstones, a round fountain, lamp posts);
 *   - the GREAT HALL in the north (32 × 48 m inside, walls 20 m, a steep slate roof): tall pointed windows, banners between them,
 *     four long tables with benches, the teachers' dais with their long table and the Director's high chair, floating candles
 *     (arcane lamps) under the roof, a rose window over the door;
 *   - the WINGS round the courtyard (one storey of 8 m, slate roofs): the classrooms — defence against the dark arts, potions
 *     (cauldron hearths), pentagrams, the history of the world — the dormitory and the library (shelves of books);
 *   - the ASTRONOMY TOWER, the highest, over the north-east corner.
 * Measures from the world's: a block 1 m, the hero 3.5 m, doors 3 × 6 (the hall's 6 × 9), passages ≥ 3, a table 2 m (at the waist),
 * a bench 1 m, a storey 8 m.
 */
import { BLOCK, CHUNK } from './Terrain.js';
import { roofShapes } from './PlanSlopes.js';
import { createRng } from '../core/math.js';

export const SCHOOL = {
    WALL: { u: 60, v0: -78, v1: 50 }, // the curtain wall's line round the castle's centre (inner half-width, north and south)
    FOOT: { u: 74, v0: -94, v1: 62 }, // the levelled terrace (the castle and a margin)
    BLEND: 55, // m over which the land round the hill melts into the world's
    // the author 07.11 (second look): «величественный замок на горе, зелёные лужайки, обрыв и мост, по которому мы идём»
    RISE: 28,  // m: the castle's hill over the meadows round it
    CLIFF: 18, // m: the hill's rocky slope (steep, from the plateau's edge down to the meadow)
    GORGE: { v0: 64, v1: 106, u: 96, deep: 16, water: 3 }, // the gorge before the gate (south): from v0 to v1, ±u wide, `deep` m under the meadow, a river in it
    HEAD: { u: 30, v1: 146 }, // the headland on the far side of the gorge (the bridge's other end, where the coach stops)
    BRIDGE: { w: 3, v0: 60, v1: 110, piers: [74, 86, 98] }, // the stone bridge over the gorge: half-width of the deck, its ends, its piers
    ROAD: { w: 3, len: 160 }, // the road from the headland down to the meadows (its half-width, its length)
    GREEN: 360, // m round the castle: green meadows whatever the world's land is there (blended at the edge)
    RING: [170, 700], // m from the start where the school is looked for
};

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * Where the school stands: {x, z, F} — flat dry land near the start, water near it, mountains round it (the most beautiful such place).
 * @param raw  the world's raw height field (raw(ix, iz) → top layer; raw.water / raw.sea after a call)
 * @param busy (x, z, r) → another site is within r there
 */
export function schoolSpot(seed, raw, busy) {
    const H = (x, z) => raw(Math.round(x), Math.round(z));
    const wet = (x, z) => { raw(Math.round(x), Math.round(z)); return !!(raw.water || raw.sea); };
    const rng = createRng(((seed * 7349) ^ 0x51c0a1d) >>> 0);
    const a0 = rng() * Math.PI * 2, F0 = SCHOOL.FOOT;
    let best = null;
    for (let i = 0; i < 40; i++) {
        const a = a0 + (i / 40) * Math.PI * 2;
        for (let j = 0; j < 4; j++) {
            const d = SCHOOL.RING[0] + (j + rng()) / 4 * (SCHOOL.RING[1] - SCHOOL.RING[0]);
            const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
            if (busy(x, z, 230)) continue;
            // the terrace's ground: dry, how far from flat
            let lo = Infinity, hi = -Infinity, dry = true;
            for (let u = F0.u * -1; u <= F0.u && dry; u += 21) for (let v = F0.v0; v <= F0.v1; v += 22) {
                if (wet(x + u, z + v)) { dry = false; break; }
                const h = H(x + u, z + v); lo = Math.min(lo, h); hi = Math.max(hi, h);
            }
            if (!dry || hi - lo > 26 || lo < 3) continue;
            // meadows round it (the author: green lawns — low, gentle land; no high mountains right at the hill), water near
            let water = 0, rough = 0, n = 0, sum = 0;
            for (let k = 0; k < 20; k++) {
                const b = (k / 20) * Math.PI * 2;
                for (const r of [140, 210, 280]) { if (wet(x + Math.cos(b) * r, z + Math.sin(b) * r)) water++; const h = H(x + Math.cos(b) * r, z + Math.sin(b) * r); sum += h; n++; rough += Math.abs(h - lo); }
            }
            const mid = (lo + hi) / 2, around = sum / n;
            const score = (hi - lo) * 1.2 + (water ? 0 : 20) + (rough / n) * 0.8 + Math.max(0, around - 30) * 0.6 + d * 0.01;
            if (!best || score < best.score) best = { x, z, M: Math.round(mid), score };
        }
    }
    if (best) return { x: best.x, z: best.z, M: best.M, F: best.M + SCHOOL.RISE };
    const h = Math.max(6, H(260, 0)); // (no fitting land at all: the hill is made where it is)
    return { x: 260, z: 0, M: h, F: h + SCHOOL.RISE };
}

/** The school as the terrain sees it: its spot (lazily), its plan, its terrace and road in the land, its parts in a chunk. */
export class SchoolSite {
    constructor(seed, raw, busy) {
        this.seed = seed; this.raw = raw; this.busy = busy;
        this._plan = undefined;
        this._byChunk = new Map();
        this.lifted = false;
    }
    get spot() { if (this._spot === undefined) this._spot = schoolSpot(this.seed, this.raw, this.busy); return this._spot; }
    get plan() {
        if (this._plan === undefined) {
            const S = this.spot;
            this._plan = schoolCastlePlan(S, (x, z) => { const h = this.raw(Math.round(x), Math.round(z)); return this.shapeAt(Math.round(x), Math.round(z), h); });
        }
        return this._plan;
    }
    /**
     * The land at a column (`h` the world's land there). Sets this.lifted, this.wet (the gorge's river: water depth), this.green (the
     * meadows' weight 0…1 — Terrain paints grass), this.rock (the hill's / the gorge's cliffs: bare stone).
     *   the HILL: the castle's plateau at F, a steep rocky slope (CLIFF) down to the meadows, then the meadows melt into the world's land;
     *   the GORGE before the gate: vertical walls, a river at its bottom; the HEADLAND beyond it at F (the bridge's far end);
     *   the ROAD from the headland down to the meadows.
     */
    shapeAt(ix, iz, h) {
        const S = this.spot, F0 = SCHOOL.FOOT, G = SCHOOL.GORGE, HD = SCHOOL.HEAD, R = SCHOOL.ROAD, B = SCHOOL.BLEND, C = SCHOOL.CLIFF;
        this.lifted = false; this.wet = 0; this.rock = false;
        const dx = ix - S.x, dz = iz - S.z, dd = Math.hypot(dx, dz - 30);
        this.green = dd < SCHOOL.GREEN ? 1 : dd < SCHOOL.GREEN + 60 ? 1 - smooth((dd - SCHOOL.GREEN) / 60) : 0;
        if (dx < -F0.u - C - B - 10 || dx > F0.u + C + B + 10 || dz < F0.v0 - C - B - 10 || dz > HD.v1 + R.len + 10) return h;
        const M = S.M, F = S.F;
        // the meadows round the hill: the world's land eased toward the meadow level near it
        const ox = Math.max(0, Math.abs(dx) - F0.u), oz = Math.max(0, F0.v0 - dz, dz - F0.v1), d = Math.hypot(ox, oz);
        const meadowK = 1 - smooth((Math.min(d, Math.hypot(Math.max(0, Math.abs(dx) - HD.u), Math.max(0, G.v1 - dz, dz - HD.v1))) - C) / (B + 30));
        let out = h + (M - h) * meadowK * 0.85, w = meadowK;
        // a raised block (the plateau at F, a rocky slope of C m, then the meadow)
        const wob = (Math.sin(dx * 0.071 + 1.3) + Math.cos(dz * 0.053 - 0.4) + Math.sin((dx + dz) * 0.031)) * 2.2; // (the cliffs' line: never a ruler's)
        const raised = (dist) => (dist <= 1 ? F : dist - wob < C ? F - (F - M) * Math.pow(smooth((Math.max(1, dist - wob) - 1) / (C - 1)), 0.75) : -1e9);
        const hill = raised(d);
        if (hill > out) { out = hill; w = 1; if (d > 2) this.rock = true; }
        const hd = Math.hypot(Math.max(0, Math.abs(dx) - HD.u), Math.max(0, G.v1 - dz, dz - HD.v1)), head = raised(hd);
        if (head > out) { out = head; w = 1; if (hd > 2) this.rock = true; }
        // the road from the headland down to the meadows: a ramp, eased into the land at its sides
        const along = dz - HD.v1;
        if (along > -2 && along < R.len) {
            const side = Math.max(0, Math.abs(dx) - R.w - 1), k = smooth(1 - side / 7);
            if (k > 0) { const ramp = F + (M - F) * smooth(Math.max(0, along) / R.len); const r = out * (1 - k) + ramp * k; if (k > 0.5 || r > out) out = r; w = Math.max(w, k); if (k > 0.5) this.rock = false; }
        }
        // the gorge: straight walls, a river at its bottom; its ends rise back to the meadows
        const gv0 = G.v0 + Math.round(2.5 * Math.sin(dx * 0.09) + 1.5 * Math.sin(dx * 0.23)), gv1 = G.v1 + Math.round(2.5 * Math.cos(dx * 0.07 + 1) + 1.5 * Math.sin(dx * 0.19 + 2)); // (the gorge's walls: wavy)
        if (dz >= gv0 && dz <= gv1 && Math.abs(dx) <= G.u + 30) {
            const e = Math.min(dz - gv0, gv1 - dz), ends = smooth((Math.abs(dx) - G.u) / 30); // (e: m from its nearer wall)
            const floor = M - G.deep, wall = e < 1 ? out : e < 3 ? floor + (out - floor) * (1 - (e - 1) / 2) * 0.5 : floor;
            const cut = wall + (out - wall) * ends;
            if (cut < out) { out = cut; w = 1; this.rock = e < 4 && ends < 0.5; if (e >= 4 && ends < 0.2) this.wet = G.water; }
        }
        if (w <= 0) return h;
        this.lifted = true;
        return Math.round(out);
    }
    /** No trees here (the terrace, the road). */
    clear(ix, iz) {
        const S = this.spot, F0 = SCHOOL.FOOT, dx = ix - S.x, dz = iz - S.z;
        if (Math.abs(dx) <= F0.u + SCHOOL.CLIFF + 4 && dz >= F0.v0 - SCHOOL.CLIFF - 4 && dz <= F0.v1 + 14) return true;
        if (dz >= SCHOOL.GORGE.v0 - 2 && dz <= SCHOOL.HEAD.v1 + 6 && Math.abs(dx) <= SCHOOL.HEAD.u + SCHOOL.CLIFF + 4) return true; // (the gorge, the headland)
        return dz > SCHOOL.HEAD.v1 && dz < SCHOOL.HEAD.v1 + SCHOOL.ROAD.len && Math.abs(dx) <= SCHOOL.ROAD.w + 5;
    }
    /** A column of the school's roofed rooms (the hall, the wings, the library, the dormitory): lit as rooms — never dark as a cave (Terrain's light). */
    litAt(ix, iz) {
        const S = this.spot, F0 = SCHOOL.FOOT, dx = ix - S.x, dz = iz - S.z;
        if (Math.abs(dx) > F0.u + 2 || dz < F0.v0 - 2 || dz > F0.v1 + 2) return false;
        for (const r of this.plan.lit) if (ix >= r[0] && ix <= r[2] && iz >= r[1] && iz <= r[3]) return true;
        return false;
    }
    near(x, z, r) { const S = this.spot; return Math.hypot(x - S.x, z - S.z) < r + 160 + SCHOOL.HEAD.v1 + SCHOOL.ROAD.len; }
    partsForChunk(cx, cz, C = CHUNK) {
        const k = this.plan, x0 = cx * C, z0 = cz * C, x1 = x0 + C - 1, z1 = z0 + C - 1;
        if (k.x1 < x0 || k.x0 > x1 || k.z1 < z0 || k.z0 > z1) return [];
        const key = cx * 65536 + cz;
        let list = this._byChunk.get(key);
        if (!list) { list = k.parts.filter((p) => p.x1 >= x0 && p.x0 <= x1 && p.z1 >= z0 && p.z0 <= z1); if (this._byChunk.size > 400) this._byChunk.clear(); this._byChunk.set(key, list); }
        return list.length ? [list] : [];
    }
}

// ------------------------------------------------------------------ the castle
const TAU = Math.PI * 2;

/** The castle's plan: its parts (boxes k 0, discs/rings k 1, roof ramps k 3) and where things are. Fixed at (0, 0): gates to the south (+z). */
export function schoolCastlePlan(P = { x: 0, z: 0, F: 20 }, groundAt = null) {
    const B = BLOCK; // (read here, not at the module's top: Terrain.js imports this file — its BLOCK is not ready then)
    const S = SCHOOL, F = P.F, OX = P.x, OZ = P.z, parts = [], tableCandles = [], floatCandles = [];
    // (laid out round (0, 0) — the castle's centre — and moved to its place in the world here)
    const box = (x0, x1, z0, z1, L0, L1, t) => parts.push({ k: 0, x0: Math.min(x0, x1) + OX, x1: Math.max(x0, x1) + OX, z0: Math.min(z0, z1) + OZ, z1: Math.max(z0, z1) + OZ, L0, L1, t });
    const cyl = (cx, cz, r, hr, L0, L1, t) => { const q = Math.ceil(r); cx += OX; cz += OZ; parts.push({ k: 1, cx, cz, r, hr, x0: Math.floor(cx - q), x1: Math.ceil(cx + q), z0: Math.floor(cz - q), z1: Math.ceil(cz + q), L0, L1, t }); };
    const roofOf = (start) => { const sp = roofShapes(parts.slice(start), [B.ROOF_SLATE, B.ROOF_BLUE]); if (sp) parts.push(sp); };
    const STONE = B.CS_GREY, TRIM = B.CS_WHITE, DARK = B.CS_DARK, MOSS = B.CS_MOSSY;

    /** A round tower with string courses, lancet windows, a gallery and a tall slate cone with a gilt finial. */
    const tower = (cx, cz, r, h, cone, roof = B.ROOF_SLATE) => {
        const top = F + h;
        cyl(cx, cz, r, r - 1.4, F + 1, top, STONE);
        cyl(cx, cz, r + 0.5, -1, F + 1, F + 2, MOSS); // (the mossy plinth)
        for (let L = F + 8; L < top - 2; L += 8) cyl(cx, cz, r + 0.35, r - 1, L, L, TRIM);
        for (let L = F + 6; L < top - 4; L += 8) for (let k = 0; k < 4; k++) {
            const a = (k / 4) * TAU + 0.6 + L * 0.13, wx = Math.round(cx + Math.sin(a) * (r - 0.6)), wz = Math.round(cz + Math.cos(a) * (r - 0.6));
            box(wx, wx, wz, wz, L, L + 2, B.AIR);
        }
        cyl(cx, cz, r + 1, r - 0.5, top + 1, top + 1, TRIM); // (the gallery's floor)
        for (let k = 0; k < 16; k += 2) { const a = (k / 16) * TAU, mx = Math.round(cx + Math.sin(a) * (r + 0.5)), mz = Math.round(cz + Math.cos(a) * (r + 0.5)); box(mx, mx, mz, mz, top + 2, top + 2, STONE); }
        const s0 = parts.length, steps = Math.max(3, Math.round(cone / 2));
        for (let i = 0; i < steps; i++) cyl(cx, cz, Math.max(0.5, r - (i * r) / steps), -1, top + 2 + i * 2, top + 3 + i * 2, roof);
        roofOf(s0);
        const tip = top + 3 + steps * 2;
        box(cx, cx, cz, cz, tip, tip + 2, B.GOLD);
        return top;
    };
    /** A hall-like wing: walls, a floor, a steep slate roof (ridge along its long side), windows, a door. */
    const wing = (x0, x1, z0, z1, wallH, roof, axisX) => {
        box(x0, x1, z0, z1, F, F, B.PLANKS);
        box(x0, x1, z0, z1, F + 1, F + wallH, STONE);
        box(x0 + 1, x1 - 1, z0 + 1, z1 - 1, F + 1, F + wallH, B.AIR);
        box(x0, x1, z0, z1, F + 1, F + 1, MOSS); box(x0 + 1, x1 - 1, z0 + 1, z1 - 1, F + 1, F + 1, B.AIR); // (a mossy foot)
        box(x0, x1, z0, z1, F + wallH, F + wallH, TRIM); box(x0 + 1, x1 - 1, z0 + 1, z1 - 1, F + wallH, F + wallH, B.AIR); // (the eaves' band)
        const s0 = parts.length, half = Math.ceil((axisX ? z1 - z0 : x1 - x0) / 2);
        for (let i = 0; i <= half; i++) {
            if (axisX) box(x0 - 1, x1 + 1, z0 - 1 + i, z1 + 1 - i, F + wallH + 1 + i, F + wallH + 1 + i, roof);
            else box(x0 - 1 + i, x1 + 1 - i, z0 - 1, z1 + 1, F + wallH + 1 + i, F + wallH + 1 + i, roof);
        }
        roofOf(s0);
        // the gables up under the roof
        for (let i = 0; i <= half; i++) {
            if (axisX) for (const x of [x0, x1]) box(x, x, z0 + i, z1 - i, F + wallH + 1 + i, F + wallH + 1 + i, STONE);
            else for (const z of [z0, z1]) box(x0 + i, x1 - i, z, z, F + wallH + 1 + i, F + wallH + 1 + i, STONE);
        }
    };
    /** Pointed windows along a wall (x fixed or z fixed), every `step` m, sills F+3. */
    const windowsAlong = (fixed, isX, a0, a1, step, h = 4) => {
        for (let a = a0; a <= a1; a += step) {
            if (isX) { box(fixed, fixed, a, a + 1, F + 3, F + 3 + h, B.AIR); box(fixed, fixed, a, a, F + 4 + h, F + 4 + h, B.AIR); }
            else { box(a, a + 1, fixed, fixed, F + 3, F + 3 + h, B.AIR); box(a, a, fixed, fixed, F + 4 + h, F + 4 + h, B.AIR); }
        }
    };
    const door = (x0, x1, z0, z1, h = 6) => box(x0, x1, z0, z1, F + 1, F + h, B.AIR);

    // ---- the courtyard: flagstones in two greys, a border of white stone
    const W = S.WALL;
    for (let z = W.v0 + 2; z <= W.v1 - 2; z += 4) for (let x = -W.u + 2; x <= W.u - 2; x += 4) box(x, Math.min(x + 3, W.u - 2), z, Math.min(z + 3, W.v1 - 2), F, F, ((x + z) / 4) & 1 ? STONE : TRIM);
    // ---- the curtain wall: 2 thick, 12 high, a wall-walk and merlons; mossy at its foot
    const WH = 12;
    for (const [x0, x1, z0, z1] of [[-W.u - 2, W.u + 2, W.v0 - 2, W.v0 - 1], [-W.u - 2, W.u + 2, W.v1 + 1, W.v1 + 2], [-W.u - 2, -W.u - 1, W.v0 - 2, W.v1 + 2], [W.u + 1, W.u + 2, W.v0 - 2, W.v1 + 2]]) {
        box(x0, x1, z0, z1, F + 1, F + WH, STONE);
        box(x0, x1, z0, z1, F + 1, F + 2, MOSS);
        box(x0, x1, z0, z1, F + WH, F + WH, TRIM);
    }
    for (let x = -W.u - 2; x <= W.u + 2; x += 2) for (const z of [W.v0 - 2, W.v1 + 2]) box(x, x, z, z, F + WH + 1, F + WH + 1, STONE);
    for (let z = W.v0 - 2; z <= W.v1 + 2; z += 2) for (const x of [-W.u - 2, W.u + 2]) box(x, x, z, z, F + WH + 1, F + WH + 1, STONE);
    // the four corner towers
    for (const [x, z] of [[-W.u - 2, W.v0 - 2], [W.u + 2, W.v0 - 2], [-W.u - 2, W.v1 + 2], [W.u + 2, W.v1 + 2]]) tower(x, z, 6, 30, 16);

    // ---- the gatehouse: two towers, the archway 8 wide, 12 high (pointed), the road's carpet of path to it
    const GZ = W.v1 + 1;
    for (const s of [-1, 1]) tower(s * 9, GZ, 5, 24, 14, B.ROOF_BLUE);
    box(-6, 6, GZ - 3, GZ + 3, F + 1, F + 16, STONE); // (the gate's block between the towers)
    box(-6, 6, GZ - 3, GZ + 3, F + 16, F + 16, TRIM);
    for (let x = -6; x <= 6; x += 2) for (const z of [GZ - 3, GZ + 3]) box(x, x, z, z, F + 17, F + 17, STONE);
    box(-4, 4, GZ - 3, GZ + 3, F + 1, F + 12, B.AIR); box(-3, 3, GZ - 3, GZ + 3, F + 13, F + 13, B.AIR); box(-2, 2, GZ - 3, GZ + 3, F + 14, F + 14, B.AIR);
    box(-1, 1, GZ + 3, GZ + 3, F + 15, F + 15, B.GOLD); // (a gilt keystone)
    box(-3, 3, GZ - 3, GZ + 3, F, F, B.PATH);

    // ---- the GREAT HALL: inside 32 × 48, walls 2 thick and 20 high, a steep slate roof
    const HX = 17, HZ0 = W.v0 + 2, HZ1 = HZ0 + 50, HH = 20;
    box(-HX, HX, HZ0, HZ1, F, F, B.CS_WHITE);
    for (let z = HZ0 + 2; z < HZ1 - 1; z += 2) for (let x = -HX + 2; x < HX - 1; x += 2) box(x, x, z, z, F, F, ((x + z) / 2) & 1 ? DARK : TRIM); // (a chequered floor)
    box(-HX, HX, HZ0, HZ1, F + 1, F + HH, STONE);
    box(-HX + 2, HX - 2, HZ0 + 2, HZ1 - 2, F + 1, F + HH, B.AIR);
    box(-HX, HX, HZ0, HZ1, F + 1, F + 2, MOSS); box(-HX + 2, HX - 2, HZ0 + 2, HZ1 - 2, F + 1, F + 2, B.AIR);
    box(-HX, HX, HZ0, HZ1, F + 10, F + 10, TRIM); box(-HX + 2, HX - 2, HZ0 + 2, HZ1 - 2, F + 10, F + 10, B.AIR);
    // round ROSE WINDOWS in the north wall over the dais (the author: «окна там, где учителя стоят, хотя бы круглые»): a great one over the
    // Director's chair and two smaller beside it — a white stone ring, gilt tracery (eight spokes and an inner ring), petals of glowing
    // violet and moon-blue glass between them, open to the sky in the middle
    const rose = (cx, cy, r) => {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
            const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
            if (d > r + 0.35) continue;
            const a = Math.atan2(dy, dx), spoke = Math.abs(Math.sin(a * 4)) < 0.1 + 0.35 / Math.max(1, d) && d > r * 0.4; // (thin gilt spokes from the inner ring out)
            const petal = (Math.floor((a + Math.PI) / (Math.PI / 4)) + 8) % 2;
            const t = d > r - 0.8 ? TRIM : Math.abs(d - r * 0.4) < 0.4 || spoke ? B.GOLD : d < r * 0.4 - 0.4 ? (d < 0.9 ? B.ARCANE_LAMP : B.ARCANE_LAMP_VIOLET) : petal ? B.ARCANE_LAMP_VIOLET : B.CARPET_BLUE; // (the heart white light, a violet ring; petals violet and deep blue glass)
            box(x, x, HZ0, HZ0 + 1, y, y, t);
        }
    };
    rose(0, F + 13.5, 6.2); rose(-11, F + 12, 3.6); rose(11, F + 12, 3.6);
    // buttresses with pinnacles along its long sides
    for (let z = HZ0 + 4; z <= HZ1 - 4; z += 7) for (const s of [-1, 1]) {
        box(s * (HX + 1), s * (HX + 2), z, z + 1, F + 1, F + 16, STONE);
        box(s * (HX + 1), s * (HX + 1), z, z, F + 17, F + 19, TRIM);
        box(s * (HX + 1), s * (HX + 1), z, z, F + 20, F + 20, B.GOLD);
    }
    // tall pointed windows between them, banners inside between the windows
    for (let z = HZ0 + 7; z <= HZ1 - 6; z += 7) for (const s of [-1, 1]) {
        box(s * HX, s * (HX - 1), z, z + 1, F + 5, F + 15, B.AIR);
        box(s * HX, s * (HX - 1), z, z, F + 16, F + 17, B.AIR);
        const bz = z + 3;
        if (bz < HZ1 - 3) { box(s * (HX - 2), s * (HX - 2), bz, bz + 1, F + 8, F + 16, (z / 7) & 1 ? B.CARPET_PURPLE : B.CARPET_BLUE); box(s * (HX - 2), s * (HX - 2), bz, bz + 1, F + 7, F + 7, B.GOLD); }
    }
    // the roof: slate slabs stepping in to a ridge (ramps), gables of stone
    const r0 = parts.length;
    for (let i = 0; i <= HX; i++) box(-HX - 1 + i, HX + 1 - i, HZ0 - 1, HZ1 + 1, F + HH + 1 + i, F + HH + 1 + i, B.ROOF_SLATE);
    roofOf(r0);
    for (const z of [HZ0, HZ1]) for (let i = 0; i <= HX; i++) box(-HX + i, HX - i, z, z, F + HH + 1 + i, F + HH + 1 + i, STONE);
    // the door to the courtyard (6 × 9, pointed) and a rose window over it
    door(-3, 3, HZ1 - 1, HZ1, 8); box(-2, 2, HZ1 - 1, HZ1, F + 9, F + 9, B.AIR); box(-4, 4, HZ1, HZ1, F + 10, F + 10, TRIM);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU, rx = Math.round(Math.sin(a) * 3), rl = Math.round(Math.cos(a) * 3); box(rx, rx, HZ1, HZ1, F + 15 + rl, F + 15 + rl, B.ARCANE_LAMP); }
    box(0, 0, HZ1, HZ1, F + 15, F + 15, B.GOLD);
    // the four long tables (2 high: at the waist; 2 wide), benches either side (1 high), a runner down the middle
    const TZ0 = HZ0 + 14, TZ1 = HZ1 - 6;
    for (const tx of [-11, -5, 4, 10]) {
        box(tx, tx + 1, TZ0, TZ1, F + 2, F + 2, B.PLANKS_DARK);
        for (let z = TZ0; z <= TZ1; z += 6) box(tx, tx + 1, z, z, F + 1, F + 1, B.PLANKS_DARK); // (the legs)
        box(tx - 1, tx - 1, TZ0, TZ1, F + 1, F + 1, B.PLANKS); box(tx + 2, tx + 2, TZ0, TZ1, F + 1, F + 1, B.PLANKS); // (benches)
        for (let z = TZ0 + 2; z <= TZ1 - 2; z += 5) tableCandles.push({ x: tx + 1 + OX, y: F + 3, z: z + 0.5 + OZ }); // (candlesticks on the tables — models: SchoolDecor.js)
    }
    box(-1, 0, TZ0 - 4, HZ1 - 2, F, F, B.CARPET_RED);
    // the teachers' dais at the north end: two steps, the long table across, the Director's high chair in the middle
    const DZ = HZ0 + 2;
    box(-HX + 2, HX - 2, DZ, DZ + 8, F + 1, F + 1, DARK);
    box(-HX + 4, HX - 4, DZ, DZ + 6, F + 2, F + 2, DARK);
    box(-10, 10, DZ + 4, DZ + 5, F + 4, F + 4, B.PLANKS_DARK); // (the teachers' table: on the dais, at the waist)
    for (let x = -10; x <= 10; x += 5) box(x, x, DZ + 4, DZ + 5, F + 3, F + 3, B.PLANKS_DARK);
    box(-10, 10, DZ + 4, DZ + 5, F + 5, F + 5, B.AIR);
    for (let x = -9; x <= 9; x += 3) box(x, x, DZ + 2, DZ + 2, F + 3, F + 3, B.PLANKS); // (the teachers' seats)
    box(-1, 1, DZ + 1, DZ + 2, F + 3, F + 3, B.CARPET_PURPLE); // (the Director's seat)
    box(-1, 1, DZ, DZ, F + 3, F + 9, B.PLANKS_DARK); box(0, 0, DZ, DZ, F + 10, F + 11, B.GOLD); // (its high back, a gilt crest)
    box(-1, 1, DZ + 1, DZ + 1, F + 4, F + 8, B.CARPET_PURPLE);
    for (const s of [-1, 1]) box(s * 12, s * 12, DZ + 3, DZ + 3, F + 3, F + 6, B.GOLD), box(s * 12, s * 12, DZ + 3, DZ + 3, F + 7, F + 7, B.ARCANE_LAMP_VIOLET); // (crystal lamps on gilt posts — no candles: the author)
    // the floating candles under the roof (models, not blocks — SchoolDecor.js): rows, each a little off its row, at 13…16 m
    for (let z = HZ0 + 6; z <= HZ1 - 4; z += 4) for (let x = -13; x <= 13; x += 3.25) floatCandles.push({ x: x + OX + ((z * 7 + x * 3) % 5) * 0.2, y: F + 13 + ((x * 11 + z * 5) % 7) * 0.45, z: z + OZ + ((x * 5) % 3) * 0.3 });

    // ---- the WINGS round the courtyard (one storey, 8 high)
    const WS = 8;
    // west: the potions classroom (north) and the history classroom (south)
    const wxo = -W.u, wxi = -HX - 6;
    wing(wxo, wxi, HZ0, HZ0 + 24, WS, B.ROOF_SLATE, true); // (the ridge along the long side: a roof of 12 steps, not a pyramid)
    wing(wxo, wxi, HZ0 + 26, HZ0 + 50, WS, B.ROOF_SLATE, true);
    // east: defence against the dark arts (north, the big one) and pentagrams (south)
    const exi = HX + 6, exo = W.u;
    wing(exi, exo, HZ0, HZ0 + 24, WS, B.ROOF_SLATE, true);
    wing(exi, exo, HZ0 + 26, HZ0 + 50, WS, B.ROOF_SLATE, true);
    // south-west: the library; south-east: the dormitory (along the courtyard's sides, toward the gate)
    const SZ0 = HZ1 + 10, SZ1 = W.v1 - 10;
    wing(-W.u, -W.u + 22, SZ0, SZ1, WS, B.ROOF_BLUE, false);
    wing(W.u - 22, W.u, SZ0, SZ1, WS, B.ROOF_BLUE, false);
    // their doors (3 × 6) to the courtyard and windows
    for (const [x0, x1, z0, z1] of [[wxi - 1, wxi, HZ0 + 11, HZ0 + 13], [wxi - 1, wxi, HZ0 + 37, HZ0 + 39], [exi, exi + 1, HZ0 + 11, HZ0 + 13], [exi, exi + 1, HZ0 + 37, HZ0 + 39],
        [-W.u + 21, -W.u + 22, (SZ0 + SZ1) / 2 - 1 | 0, ((SZ0 + SZ1) / 2 | 0) + 1], [W.u - 22, W.u - 21, (SZ0 + SZ1) / 2 - 1 | 0, ((SZ0 + SZ1) / 2 | 0) + 1]]) door(x0, x1, z0, z1);
    for (const [zA, zB] of [[HZ0 + 3, HZ0 + 21], [HZ0 + 29, HZ0 + 47]]) { windowsAlong(wxi, true, zA, zB, 5); windowsAlong(exi, true, zA, zB, 5); }
    windowsAlong(SZ1, false, -W.u + 3, -W.u + 19, 5); windowsAlong(SZ1, false, W.u - 19, W.u - 3, 5);
    // inside: the potions room's hearths (cauldrons go on them — the school's life), the library's shelves, the dormitory's beds' places
    // the pentagram room's floor: a great circle of runes; the defence room: a duelling strip
    cyl(39, HZ0 + 38, 8, 7, F, F, B.RUNE); box(30, 50, HZ0 + 12, HZ0 + 12, F, F, B.CARPET_BLUE);
    { // the pentagram itself inside the circle: a five-pointed star drawn in runes (lines from point to every second point), a small inner ring
        const cx = 39, cz = HZ0 + 38, R = 6.6, pts = [0, 1, 2, 3, 4].map((k) => [cx + Math.sin(k * 2 * Math.PI / 5) * R, cz - Math.cos(k * 2 * Math.PI / 5) * R]);
        for (let k = 0; k < 5; k++) { const [ax, az] = pts[k], [bx, bz] = pts[(k + 2) % 5], n = Math.ceil(Math.hypot(bx - ax, bz - az) * 1.5);
            for (let i = 0; i <= n; i++) { const x = Math.round(ax + (bx - ax) * i / n), z = Math.round(az + (bz - az) * i / n); box(x, x, z, z, F, F, B.RUNE); } }
        cyl(cx, cz, 2, 1, F, F, B.RUNE);
    }
    // the defence room: red banners with gilt tops on the outer wall, bookcases (books of the protective arts) along the end walls,
    // a target ring on the floor where the dummy stands
    for (const bz of [HZ0 + 4, HZ0 + 9, HZ0 + 15, HZ0 + 20]) { box(exo - 1, exo - 1, bz, bz + 1, F + 2, F + 6, B.CARPET_RED); box(exo - 1, exo - 1, bz, bz + 1, F + 7, F + 7, B.GOLD); }
    for (const bz of [HZ0 + 1, HZ0 + 23]) { box(exi + 2, exi + 6, bz, bz, F + 1, F + 4, B.BOOKS); box(exo - 6, exo - 2, bz, bz, F + 1, F + 4, B.BOOKS); }
    cyl(Math.round((exi + exo) / 2) + 5, HZ0 + 6, 2, 1, F, F, B.CARPET_RED);
    // lamps in the wings
    for (const [x, z] of [[-40, HZ0 + 12], [-40, HZ0 + 38], [40, HZ0 + 12], [40, HZ0 + 38], [-W.u + 11, (SZ0 + SZ1) / 2 | 0], [W.u - 11, (SZ0 + SZ1) / 2 | 0]]) box(x, x, z, z, F + 7, F + 7, B.ARCANE_LAMP);

    // ---- THE ROOMS FURNISHED (the author 07.11: «кабинеты пустые… должны быть реально заполнены, интересно, красиво, подробно; чтобы
    // чувствовалась магия»). Measures from the world: a table at the waist (2 m), a shelf's boards every metre, nothing lower than 5 m over a
    // free floor cell, a free way 3 wide from the door to the middle; the magic: rune stone (ARCANE), crystal lamps, wards, potions' glass.
    const cauldrons = [], tableSpots = [];
    const shelf = (x0, x1, z0, z1, h, alt) => { // a tall rack against a wall: a dark frame, boards of potions' glass / books by turns
        box(x0, x1, z0, z1, F + 1, F + h, B.PLANKS_DARK);
        for (let L = F + 1; L < F + h; L++) box(x0, x1, z0, z1, L, L, (L + (alt || 0)) % 3 === 0 ? B.BOOKS : (L % 2 ? B.POTION : B.BOOKS));
        box(x0, x1, z0, z1, F + h, F + h, B.PLANKS_DARK);
    };
    const table = (x0, x1, z0, z1) => { box(x0, x1, z0, z1, F + 2, F + 2, B.PLANKS_DARK); for (const x of [x0, x1]) for (const z of [z0, z1]) box(x, x, z, z, F + 1, F + 1, B.PLANKS_DARK); };
    const pillar = (x, z, h, top) => { box(x, x, z, z, F + 1, F + h, B.ARCANE); box(x, x, z, z, F + h + 1, F + h + 1, top); };
    const rug = (x0, x1, z0, z1, c, edge) => { box(x0, x1, z0, z1, F, F, edge); box(x0 + 1, x1 - 1, z0 + 1, z1 - 1, F, F, c); };
    // POTIONS (west wing, north): the teacher's great cauldron on a rune ring by the far wall, four pupils' hearths in two rows, racks of
    // potions and books along both long walls, work tables with ingredients (real things — School puts them there), bunches of herbs drying
    // under the roof, a stone basin of water by the door (the author: «вода для котла»), violet crystal lamps
    {
        const x0 = wxo + 1, x1 = wxi - 1, z0 = HZ0 + 1, z1 = HZ0 + 23, zm = HZ0 + 12;
        cyl(x0 + 6, zm, 3.5, 2.5, F, F, B.RUNE); box(x0 + 5, x0 + 7, zm - 1, zm + 1, F, F, B.CS_DARK);
        cauldrons.push({ x: x0 + 6 + OX, z: zm + OZ, big: true });
        for (const [x, z] of [[x0 + 14, z0 + 5], [x0 + 23, z0 + 5], [x0 + 14, z1 - 5], [x0 + 23, z1 - 5]]) { cyl(x, z, 2, 1.2, F, F, B.CS_DARK); cauldrons.push({ x: x + OX, z: z + OZ }); }
        for (let x = x0 + 2; x <= x1 - 6; x += 6) { shelf(x, x + 3, z0, z0, 5, x); shelf(x, x + 3, z1, z1, 5, x + 1); }
        shelf(x0, x0, z0 + 2, zm - 4, 6, 0); shelf(x0, x0, zm + 4, z1 - 2, 6, 1);
        for (const z of [z0 + 7, z1 - 8]) { table(x1 - 9, x1 - 4, z, z + 1); box(x1 - 8, x1 - 8, z, z, F + 3, F + 3, B.POTION); tableSpots.push({ x: x1 - 6 + OX, z: z + 0.5 + OZ }, { x: x1 - 5 + OX, z: z + 0.5 + OZ }); }
        box(x1 - 3, x1 - 1, z0 + 1, z0 + 3, F + 1, F + 1, B.CS_DARK); box(x1 - 2, x1 - 2, z0 + 2, z0 + 2, F + 1, F + 1, B.WATER); // (the basin)
        for (let x = x0 + 4; x <= x1 - 4; x += 5) for (const z of [z0 + 3, z1 - 3]) box(x, x, z, z, F + 7, F + 7, (x / 5) & 1 ? B.FLOWERS : B.LEAVES); // (bunches of herbs drying under the roof)
        for (const z of [z0 + 6, z1 - 6]) box(x0 + 18, x0 + 18, z, z, F + 7, F + 7, B.ARCANE_LAMP_VIOLET);
    }
    // HISTORY (west wing, south): desks in rows facing the teacher, a great map of the world on the far wall, bookcases, a pedestal with a
    // slowly turning globe of crystal (the light), old banners
    {
        const x0 = wxo + 1, x1 = wxi - 1, z0 = HZ0 + 27, z1 = HZ0 + 49, zm = HZ0 + 38;
        box(x0, x0, z0 + 4, z1 - 4, F + 2, F + 6, B.CARPET_GREEN); box(x0, x0, z0 + 6, z0 + 10, F + 3, F + 5, B.CARPET_BLUE); box(x0, x0, zm, zm + 6, F + 2, F + 4, B.CARPET_BLUE); box(x0, x0, z0 + 3, z1 - 3, F + 7, F + 7, B.GOLD); // (the map: seas, lands, a gilt frame)
        box(x0 + 3, x0 + 3, zm - 1, zm + 1, F + 1, F + 1, B.PLANKS_DARK); box(x0 + 3, x0 + 3, zm, zm, F + 2, F + 2, B.BOOKS); // (the teacher's lectern)
        pillar(x0 + 3, zm + 5, 2, B.ARCANE_LAMP); // (the crystal globe on its pedestal)
        for (let x = x0 + 8; x <= x1 - 5; x += 5) for (const z of [zm - 7, zm - 3, zm + 3, zm + 7]) { table(x, x + 2, z, z); if ((x + z) % 3 === 0) box(x + 1, x + 1, z, z, F + 3, F + 3, B.BOOKS); box(x + 1, x + 1, z + 1, z + 1, F + 1, F + 1, B.PLANKS); } // (rows of two desks — the way from the door (zm−1…zm+1) stays free)
        for (let x = x0 + 5; x <= x1 - 4; x += 5) { shelf(x, x + 2, z0, z0, 5, x); shelf(x, x + 2, z1, z1, 5, x + 2); }
        for (const z of [z0 + 6, z1 - 6]) box(x0 + 16, x0 + 16, z, z, F + 7, F + 7, B.ARCANE_LAMP);
    }
    // DEFENCE (east wing, north): crystal ward-pillars in the corners, a rack of practice wands, shields of warding on the wall, the duelling
    // strip; the dummy stands on its ring (School)
    {
        const x0 = exi + 1, x1 = exo - 1, z0 = HZ0 + 1, z1 = HZ0 + 23;
        for (const [x, z] of [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]]) pillar(x, z, 5, B.ARCANE_LAMP);
        for (const z of [z0 + 6, z0 + 11, z0 + 16]) box(x1, x1, z, z + 1, F + 2, F + 3, B.ARCANE_WARD);
        box(x0 + 8, x0 + 14, z0, z0, F + 1, F + 2, B.PLANKS_DARK); for (let x = x0 + 8; x <= x0 + 14; x += 2) box(x, x, z0, z0, F + 3, F + 3, B.ENCHANTED); // (the cabinet of practice wands: enchanted cases on a dark chest)
        rug(x0 + 2, x0 + 9, z1 - 6, z1 - 1, B.CARPET_RED, B.GOLD); // (the teacher's corner)
        table(x0 + 4, x0 + 6, z1 - 3, z1 - 2); box(x0 + 5, x0 + 5, z1 - 3, z1 - 3, F + 3, F + 3, B.ENCHANTED); // (the teacher's table, a warded box on it)
        // the DUELLING PISTE across the room, flush with the floor (nothing to trip on): dark stone, rune borders, a rune circle at each end
        const zm = HZ0 + 12;
        box(x0 + 8, x1 - 6, zm - 2, zm + 2, F, F, DARK); box(x0 + 8, x1 - 6, zm - 2, zm - 2, F, F, B.RUNE); box(x0 + 8, x1 - 6, zm + 2, zm + 2, F, F, B.RUNE);
        for (const cx of [x0 + 9, x1 - 7]) cyl(cx, zm, 3, 2, F, F, B.RUNE);
        // the targets on the far wall: warding shields in gilt frames, crystal lights over them
        for (const z of [z0 + 5, z0 + 11, z0 + 17]) { box(x1, x1, z - 1, z + 1, F + 2, F + 4, TRIM); box(x1, x1, z, z, F + 3, F + 3, B.ARCANE_WARD); box(x1, x1, z - 1, z + 1, F + 5, F + 5, B.GOLD); box(x1, x1, z, z, F + 6, F + 6, B.ARCANE_LAMP); }
        // lamps hanging on chains from the beams (5.5 m over the floor: over every hat)
        for (let x = x0 + 8; x <= x1 - 8; x += 8) for (const z of [z0 + 5, z1 - 5]) box(x, x, z, z, F + 7, F + 7, B.ARCANE_LAMP); // (crystal lights set in the ceiling — a «chain» of fence read as a floating box)
        // the pupils' benches along the south wall (sitting height), a rack of practice shields behind them
        for (let x = x0 + 14; x <= x1 - 10; x += 7) { box(x, x + 4, z1 - 1, z1 - 1, F + 1, F + 1, B.PLANKS); box(x, x + 4, z1, z1, F + 3, F + 3, B.ARCANE_WARD); }
    }
    // PENTAGRAMS (east wing, south): the great rune circle with eight crystal pillars round it, star charts on the walls, grimoires, a dark
    // board with a white figure drawn on it
    {
        const x0 = exi + 1, x1 = exo - 1, z0 = HZ0 + 27, z1 = HZ0 + 49;
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, px = Math.round(39 + Math.cos(a) * 10), pz = Math.round(HZ0 + 38 + Math.sin(a) * 10); if (pz > z0 && pz < z1 && px > x0 && px < x1) pillar(px, pz, 3, B.ARCANE_LAMP_VIOLET); }
        for (const z of [z0 + 4, z1 - 8]) { box(x1, x1, z, z + 4, F + 2, F + 6, B.CARPET_PURPLE); for (let i = 0; i < 5; i++) box(x1, x1, z + (i * 3) % 5, z + (i * 3) % 5, F + 3 + (i % 3), F + 3 + (i % 3), B.GOLD); } // (star charts)
        const zb = (z0 + z1) / 2 | 0; box(x1, x1, zb - 2, zb + 2, F + 2, F + 6, B.CS_DARK); box(x1, x1, zb - 1, zb + 1, F + 4, F + 4, B.CS_WHITE); box(x1, x1, zb, zb, F + 3, F + 5, B.CS_WHITE); // (the board — on the far wall, not before the door)
        for (let x = x0 + 4; x <= x1 - 4; x += 6) { shelf(x, x + 2, z0, z0, 5, x); shelf(x, x + 2, z1, z1, 5, x + 1); }
    }
    // the LIBRARY (south-west): rows of tall bookcases across the room with ladders, reading tables with crystal lamps between them
    {
        const x0 = -W.u + 1, x1 = -W.u + 21, z0 = SZ0 + 1, z1 = SZ1 - 1, zm = (SZ0 + SZ1) / 2 | 0;
        for (let z = z0 + 2; z <= z1 - 2; z += 6) if (Math.abs(z - zm) > 2) { box(x0, x0 + 9, z, z, F + 1, F + 6, B.BOOKS); box(x0, x0 + 9, z, z, F + 7, F + 7, B.PLANKS_DARK); box(x0 + 10, x0 + 10, z, z, F + 1, F + 5, B.FENCE); }
        for (let z = z0 + 5; z <= z1 - 5; z += 6) if (Math.abs(z - zm) > 3) { table(x1 - 7, x1 - 4, z, z + 1); box(x1 - 6, x1 - 6, z, z, F + 3, F + 3, B.ARCANE_LAMP); box(x1 - 5, x1 - 5, z + 1, z + 1, F + 3, F + 3, B.BOOKS); }
        rug(x1 - 9, x1 - 2, zm - 2, zm + 2, B.CARPET_RED, B.GOLD);
    }
    // the DORMITORY (south-east): the beds are the game's own (School puts twelve by the long walls); trunks at their feet, nightstands with
    // little crystal lamps between them, a long rug, a hearth of stone on the end wall
    const dormBeds = [];
    {
        const x0 = W.u - 21, x1 = W.u - 1, z0 = SZ0 + 1, z1 = SZ1 - 1, n = 6, step = Math.min(6, (z1 - z0 - 10) / (n - 1));
        for (let i = 0; i < n; i++) {
            const z = Math.round(z0 + 6 + i * step);
            for (const side of [0, 1]) {
                const bx = side ? x1 - 3.2 : x0 + 3.2;
                dormBeds.push({ x: bx + OX, z: z + OZ, yaw: side ? -Math.PI / 2 : Math.PI / 2, side, i });
                const tx = side ? x1 - 7 : x0 + 7; box(tx, tx, z - 1, z + 1, F + 1, F + 1, B.PLANKS_DARK); box(tx, tx, z, z, F + 1, F + 1, B.GOLD); // (the trunk at the foot)
                const nx = side ? x1 - 1 : x0 + 1; if (i < n - 1) { box(nx, nx, z + 3, z + 3, F + 1, F + 1, B.PLANKS_DARK); box(nx, nx, z + 3, z + 3, F + 2, F + 2, B.ARCANE_LAMP); } // (the nightstand)
            }
        }
        rug((x0 + x1) / 2 - 2 | 0, (x0 + x1) / 2 + 2 | 0, z0 + 3, z1 - 3, B.CARPET_PURPLE, B.CARPET_BLUE);
        box((x0 + x1) / 2 - 2 | 0, (x0 + x1) / 2 + 2 | 0, z1, z1, F + 1, F + 4, B.COBBLE); box((x0 + x1) / 2 - 1 | 0, (x0 + x1) / 2 + 1 | 0, z1, z1, F + 1, F + 2, B.LANTERN); // (the hearth)
    }

    // ---- the courtyard: a round fountain (stone basin, water, a column with a gilt crown), lamp posts along the way
    const FZ = Math.round((HZ1 + W.v1) / 2);
    cyl(0, FZ, 6, 5, F + 1, F + 2, TRIM); cyl(0, FZ, 5, -1, F, F, B.CS_DARK); cyl(0, FZ, 5, -1, F + 1, F + 1, B.WATER);
    cyl(0, FZ, 1.2, -1, F + 1, F + 6, TRIM); box(0, 0, FZ, FZ, F + 7, F + 7, B.GOLD);
    for (let z = HZ1 + 4; z <= W.v1 - 4; z += 9) for (const s of [-1, 1]) { box(s * 7, s * 7, z, z, F + 1, F + 4, B.CS_DARK); box(s * 7, s * 7, z, z, F + 5, F + 5, B.LANTERN); }

    // ---- the astronomy tower, the highest, over the hall's north-east
    tower(HX + 3, HZ0 + 3, 5, 52, 16, B.ROOF_BLUE);

    // ---- the BRIDGE over the gorge (the author: «обрыв и мост, по которому мы идём»): a deck of dark flagstones at the plateau's level,
    // parapets with lanterns on posts every 6 m, three tall piers from the river up, stepped arches between them; a paved forecourt at the
    // gate, a little square on the headland where the coach stops, the road down from it to the meadows
    const BR = S.BRIDGE, bw = BR.w, Mf = (P.M ?? F - S.RISE) - S.GORGE.deep;
    box(-6, 6, GZ + 3, BR.v0, F, F, B.PATH);
    box(-bw, bw, BR.v0, BR.v1, F, F, DARK); box(-bw, bw, BR.v0, BR.v1, F - 1, F - 1, STONE);
    for (let v = BR.v0; v <= BR.v1; v += 4) box(-bw + 1, bw - 1, v, v, F, F, B.PATH); // (a lighter course every 4 m)
    for (const sd of [-1, 1]) {
        box(sd * (bw + 1), sd * (bw + 1), BR.v0, BR.v1, F - 1, F + 1, STONE); box(sd * (bw + 1), sd * (bw + 1), BR.v0, BR.v1, F + 2, F + 2, TRIM);
        for (let v = BR.v0 + 2; v <= BR.v1; v += 6) { box(sd * (bw + 1), sd * (bw + 1), v, v, F + 3, F + 4, DARK); box(sd * (bw + 1), sd * (bw + 1), v, v, F + 5, F + 5, B.LANTERN); }
    }
    const ends = [BR.v0, ...BR.piers, BR.v1];
    for (const pv of BR.piers) { box(-bw - 2, bw + 2, pv - 2, pv + 2, Mf - 2, F - 2, STONE); box(-bw - 3, bw + 3, pv - 3, pv + 3, Mf - 2, Mf + 3, MOSS); box(-bw - 2, bw + 2, pv - 2, pv + 2, F - 6, F - 6, TRIM); }
    for (let k = 0; k + 1 < ends.length; k++) { // (the arches: deep at the piers, a thin crown in the middle)
        const a = ends[k] + (k ? 3 : 0), b = ends[k + 1] - (k + 2 < ends.length ? 3 : 0), mid = (a + b) / 2, half = Math.max(1, (b - a) / 2);
        for (let v = a; v <= b; v++) { const q = (v - mid) / half, yb = F - 2 - Math.round(7 * q * q); box(-bw, bw, v, v, yb, F - 2, STONE); }
    }
    // the headland's square: flagstones, four lamp posts, a bench of stone on each side
    const HV = S.HEAD.v1 - 34;
    box(-9, 9, S.GORGE.v1 + 1, S.HEAD.v1, F, F, B.PATH);
    for (let v = S.GORGE.v1 + 5; v <= S.HEAD.v1; v += 9) box(-9, 9, v, v, F, F, DARK);
    for (const [x, v] of [[-10, S.GORGE.v1 + 3], [10, S.GORGE.v1 + 3], [-10, HV + 14], [10, HV + 14]]) { box(x, x, v, v, F + 1, F + 4, DARK); box(x, x, v, v, F + 5, F + 5, B.LANTERN); }
    for (const sd of [-1, 1]) box(sd * 8, sd * 8, HV - 3, HV + 3, F + 1, F + 1, TRIM);
    // the road down from the headland to the meadows: flagstones on the ramp (SchoolSite.shapeAt), lanterns along it
    let arrive = { x: OX, y: F + 0.5, z: OZ + HV };
    let coachFrom = { x: OX, y: F + 0.5, z: OZ + S.HEAD.v1 + S.ROAD.len - 10 };
    if (groundAt) {
        const r0 = parts.length;
        for (let v = S.HEAD.v1; v < S.HEAD.v1 + S.ROAD.len; v++) {
            const L = groundAt(OX, OZ + v);
            box(-S.ROAD.w, S.ROAD.w, v, v, L, L, (v & 7) === 0 ? DARK : B.PATH);
            if (v % 14 === 0) for (const sd of [-1, 1]) { const Lp = groundAt(OX + sd * (S.ROAD.w + 1), OZ + v); box(sd * (S.ROAD.w + 1), sd * (S.ROAD.w + 1), v, v, Lp + 1, Lp + 3, B.CS_DARK); box(sd * (S.ROAD.w + 1), sd * (S.ROAD.w + 1), v, v, Lp + 4, Lp + 4, B.LANTERN); }
        }
        { const sp = roofShapes(parts.slice(r0), [B.PATH, DARK]); if (sp) parts.push(sp); } // (the road's flagstones as ramps, never a stair)
        const v = S.HEAD.v1 + S.ROAD.len - 10;
        coachFrom = { x: OX, y: groundAt(OX, OZ + v) + 0.5, z: OZ + v };
    }
    const at = (x, z, L = F + 0.5) => ({ x: x + OX, y: L, z: z + OZ });
    const out = {
        parts, F,
        hall: { x0: -HX + 2, x1: HX - 2, z0: HZ0 + 2, z1: HZ1 - 2, door: at(0, HZ1 + 2), dais: at(0, DZ + 3, F + 2.5), director: at(0, DZ + 1.5, F + 3.5), tables: [-11, -5, 4, 10].map((tx) => ({ x: tx + 0.5, z0: TZ0, z1: TZ1 })) },
        gate: at(0, GZ + 4), courtyard: at(0, FZ + 8), fountain: at(0, FZ),
        rooms: {
            potions: { x0: wxo + 1, x1: wxi - 1, z0: HZ0 + 1, z1: HZ0 + 23, door: at(wxi + 2, HZ0 + 12) },
            history: { x0: wxo + 1, x1: wxi - 1, z0: HZ0 + 27, z1: HZ0 + 49, door: at(wxi + 2, HZ0 + 38) },
            defence: { x0: exi + 1, x1: exo - 1, z0: HZ0 + 1, z1: HZ0 + 23, door: at(exi - 2, HZ0 + 12) },
            pentagrams: { x0: exi + 1, x1: exo - 1, z0: HZ0 + 27, z1: HZ0 + 49, door: at(exi - 2, HZ0 + 38) },
            library: { x0: -W.u + 1, x1: -W.u + 21, z0: SZ0 + 1, z1: SZ1 - 1, door: at(-W.u + 24, (SZ0 + SZ1) / 2) },
            dormitory: { x0: W.u - 21, x1: W.u - 1, z0: SZ0 + 1, z1: SZ1 - 1, door: at(W.u - 24, (SZ0 + SZ1) / 2) },
        },
        cauldrons: cauldrons.map((c) => ({ ...c, y: F + 0.5 })), tableSpots: tableSpots.map((t) => ({ ...t, y: F + 2.5 })), dormBeds, arrive, coachFrom, road: { z0: OZ + S.HEAD.v1, len: S.ROAD.len }, gateZ: OZ + GZ, bridge: { v0: OZ + BR.v0, v1: OZ + BR.v1, x: OX }, centre: { x: OX, z: OZ }, F, M: P.M ?? F - S.RISE, tableCandles, floatCandles,
    };
    // (the rooms' and the hall's bounds and the tables: laid out round (0, 0) — to the world's place too)
    for (const r of [out.hall, ...Object.values(out.rooms)]) { r.x0 += OX; r.x1 += OX; r.z0 += OZ; r.z1 += OZ; }
    for (const t of out.hall.tables) { t.x += OX; t.z0 += OZ; t.z1 += OZ; }
    out.x0 = Math.min(...parts.map((p) => p.x0)); out.x1 = Math.max(...parts.map((p) => p.x1));
    out.z0 = Math.min(...parts.map((p) => p.z0)); out.z1 = Math.max(...parts.map((p) => p.z1));
    // the rooms under a roof (lit as rooms, never dark as a cave): the hall and the wings
    out.lit = [[-HX, HZ0, HX, HZ1], [wxo, HZ0, wxi, HZ0 + 50], [exi, HZ0, exo, HZ0 + 50], [-W.u, SZ0, -W.u + 22, SZ1], [W.u - 22, SZ0, W.u, SZ1]].map(([a, b, c, d]) => [a + OX, b + OZ, c + OX, d + OZ]);
    return out;
}

