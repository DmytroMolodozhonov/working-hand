/**
 * SunHallPlan.js — the Hall of the Sun (Godhood.js): a pure plan (no THREE) of a round golden hall, built of blocks high in the sky
 * when a god first comes into it (as «Логово зельевара» — PotionLairPlan.js: the world's ground is never cut, old worlds stay as they were).
 *
 * The story (CLAUDE.md «Сюжет»): the gods gave their power to the Sun. Who killed every titan (the shards of that power) is a god:
 * the Sun does not burn him — it takes him into its Hall. There: the GOLDEN BOOK of the world's story on a reading stand, and the
 * PENTAGRAM OF RENEWAL on the floor — who stands in its circle (Godhood: SUN_HALL.MORTAL_T s) is mortal again: «можно начать заново
 * смертным» (the bosses and the titans stay dead). The arch in the south takes him home to the Earth.
 *
 * Measures (the world's: a block 1 m, the hero ~3.5 m, a door 3 × 6, a way ≥ 3): a round hall of radius 24 m, walls 12 m, a dome
 * up to ~23 m over the floor; twelve golden columns (2 × 2) on a ring of 17 m; the pentagram's circle — 7 m round the middle; the
 * stand of the book in the north 15 m out; the arch in the south (4 wide, 7 high).
 * Coordinates are offsets (x east, z south) from the middle; `CX, CZ` — where it stands in the world.
 */
import { BLOCK } from './Terrain.js';

const TAU = Math.PI * 2;

export const SUN_HALL = {
    CX: -1400, CZ: 1400, // (in the sky over any land: the lair is at 1400, −1400 — far apart)
    F: 96, // the floor's layer
    R: 24, WALL: 12, DOME: 11,
    COLS: 12, COL_R: 17,
    PENT_R: 7, // the pentagram's circle
    BOOK: { x: 0, z: -15 }, // the stand of the golden book (its reader stands to its south)
    EXIT: { x: 0, z: 22 }, // the arch home
    HERO: { x: 0, z: 13 }, // where a god comes in (facing north: the book and the sun over it)
    MARKER: { x: 0, z: 0 }, // the middle of the pentagram: a GOLD block there — the hall stands
    MORTAL_T: 5, // s in the circle: mortal again
    EXIT_T: 1.5, // s in the arch: home
    SLICE: 2600, // blocks a frame while it is built
};

/** The pentagram's lines (a five-pointed star in the circle): is the cell (x, z) on them? */
export function onPentagram(x, z, R = SUN_HALL.PENT_R) {
    const d = Math.hypot(x, z);
    if (Math.abs(d - R) < 0.6) return true; // (the circle)
    const pts = [];
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; pts.push([Math.cos(a) * (R - 0.6), Math.sin(a) * (R - 0.6)]); }
    for (let i = 0; i < 5; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 2) % 5];
        const vx = bx - ax, vz = bz - az, L = Math.hypot(vx, vz), t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (L * L)));
        if (Math.hypot(ax + vx * t - x, az + vz * t - z) < 0.55) return true;
    }
    return false;
}

/** The hall's blocks: [[dx, L, dz, type], …] (every cell of its shell and its inside — air too, so a second build is exact). */
export function sunHallPlan() {
    const S = SUN_HALL, F = S.F, out = [], B = BLOCK;
    const put = (x, L, z, t) => out.push([x, L, z, t]);
    const R = S.R, ext = R + 2;
    const domeTop = F + S.WALL + S.DOME;
    for (let z = -ext; z <= ext; z++) for (let x = -ext; x <= ext; x++) {
        const d = Math.hypot(x, z);
        if (d > R + 1.5) continue;
        const a = Math.atan2(z, x), ray = Math.abs(Math.sin(a * 6)) > 0.86; // (twelve golden rays out from the middle)
        // the floor (two layers): white marble with golden rays; the pentagram in runes; its middle — gold (the marker)
        put(x, F - 2, z, B.CS_WHITE);
        let floor = ray && d > S.PENT_R + 1 ? B.GOLD : d < 2 ? B.GOLD : B.CS_WHITE;
        if (d <= S.PENT_R + 0.6 && onPentagram(x, z)) floor = B.GOLD; // (a golden star on white marble: the dark runes read as a hole in the floor)
        if (d > R - 0.5) floor = B.GOLD; // (a golden edge round the floor)
        put(x, F - 1, z, floor);
        // the wall: a ring R−0.5 … R+1.5; golden bands; windows of light every 30°; the arch in the south
        const inWall = d >= R - 0.5;
        const arch = z > 0 && Math.abs(x) <= 2;
        for (let L = F; L < domeTop + 2; L++) {
            const h = L - F;
            let t = B.AIR;
            if (inWall && h < S.WALL) {
                t = h === 0 || h === 6 || h === S.WALL - 1 ? B.GOLD : B.CS_WHITE;
                const win = Math.abs(Math.sin(a * 6 + Math.PI / 2)) > 0.93 && h >= 3 && h <= 8; // (tall windows of the Sun's light)
                if (win) t = B.ARCANE_LAMP;
                if (arch && h < 7) t = h === 6 || (Math.abs(x) === 2 && h < 6) ? B.GOLD : B.AIR; // (the arch home: gold round an open way)
                if (arch && h < 7 && Math.abs(x) < 2 && d > R + 0.5) t = B.AIR;
            } else if (h >= S.WALL) {
                // the dome: a shell over the hall — r(h) shrinks as a quarter circle; golden ribs along the rays; a sun of light at the top
                const k = (h - S.WALL) / S.DOME, rr = R * Math.sqrt(Math.max(0, 1 - k * k));
                if (d <= rr + 0.6 && d >= rr - 1.2) t = ray ? B.GOLD : B.CS_WHITE;
                if (d < 3 && h >= S.WALL + S.DOME - 1) t = B.ARCANE_LAMP;
                if (h === S.WALL && d >= R - 0.5) t = B.GOLD;
            }
            // the columns: twelve, 2 × 2, gold with white capitals
            for (let i = 0; i < S.COLS; i++) {
                const ca = (i / S.COLS) * TAU + TAU / 24, cx = Math.round(Math.cos(ca) * S.COL_R), cz = Math.round(Math.sin(ca) * S.COL_R);
                if (x >= cx && x <= cx + 1 && z >= cz && z <= cz + 1 && h < S.WALL) t = h === S.WALL - 1 || h === 0 ? B.CS_WHITE : B.GOLD;
            }
            if (t !== B.AIR || d < R - 0.5) put(x, L, z, t);
        }
    }
    // the stand of the golden book: its post (two blocks — LoreStand)
    put(S.BOOK.x, F, S.BOOK.z, B.GOLD); put(S.BOOK.x, F + 1, S.BOOK.z, B.GOLD);
    // the pentagram's middle (the marker): a golden block in the floor
    put(S.MARKER.x, F - 1, S.MARKER.z, B.GOLD);
    return out;
}

/** The book stand's spot (LoreLibrary: a `lore` spot) in the world. */
export function sunHallBookSpot() { const S = SUN_HALL; return { x: S.CX + S.BOOK.x, y: S.F - 1.5, z: S.CZ + S.BOOK.z, face: 0 }; } // (y: the floor's top — the floor is layer F−1; LoreStand.postCell → the post at F, F+1)
