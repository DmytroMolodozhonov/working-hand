/**
 * ArenaDome.js — the magic dome over a duel arena's floor (pure geometry; the look — fx/ArenaDomeFx.js; the hook — Duel._step).
 *
 * The author: «Купол. Магический. Невидимый, пока человек не попадёт туда… Заклинание не должно нацеливаться на зрителей, а если и
 * попадёт — то не в зрителя, а в невидимую магическую защитную арку. И в игре, и в дуэльном режиме.»
 *
 * The dome is the floor's outline (a stadium: the axis `def.axis` a→b, radius `r`) lifted into a half-cylinder with a half-sphere at each end:
 * a point (x, y, z) is inside when its flat distance d to the axis is ≤ R and its height over the floor ≤ √(R² − d²). R is a little wider
 * than the floor, so the stands (spectators) lie outside. A duel charge that crosses its skin — either way — bursts on it (the spectators behind
 * are never touched); the two duellists' charges, flying inside, never meet it. Bodies walk through it (it stops spells, not people).
 *
 * Who / what (CLAUDE.md): charges of players and wizards (all duel spells, the deadly ones too) — stopped; the spectators of the stands are no
 * target of a charge (`isSpectator`); explosions and the wind are not stopped (not a charge — decided so, in the report).
 */

/** The dome's measures: R = the floor's radius + MARGIN (m). */
export const DOME = { MARGIN: 0.6, NEAR: 4, FLASH: 1.4 };
const CAGE_H = 30; // m: the dome is never lower than this over the floor (CAGE.H)

/** The dome of an arena: {ax, az, bx, bz, R, y0} or null (a training field has none). */
export function domeOf(def) {
    if (!def || def.practice || !def.axis) return null;
    const { a, b, r } = def.axis;
    const R = r + DOME.MARGIN;
    // K: a vertical stretch, so that the dome is at least CAGE_H high over the floor (a narrow floor's half-sphere is lower)
    return { ax: a.x, az: a.z, bx: b.x, bz: b.z, R, y0: def.floorY ?? a.y ?? 0, K: Math.max(1, CAGE_H / R) };
}

/** Flat distance of (x, z) to the dome's axis segment. */
function flat(D, x, z) {
    const dx = D.bx - D.ax, dz = D.bz - D.az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - D.ax) * dx + (z - D.az) * dz) / l2)) : 0;
    return Math.hypot(x - (D.ax + dx * t), z - (D.az + dz * t));
}

/** Is the point inside the dome (the floor's air up to the skin)? */
export function insideDome(D, x, y, z) {
    const d = flat(D, x, z);
    if (d >= D.R) return false;
    const h = y - D.y0;
    return h <= (D.K || 1) * Math.sqrt(D.R * D.R - d * d) && h > -6;
}

/**
 * Where the segment from→to crosses the dome's skin (inside↔outside): {s, x, y, z} with s 0…1, or null (it stays on one side).
 * Found by halving (the skin is smooth; a step of a charge is metres).
 */
export function domeCross(D, f, t) {
    if (!D) return null;
    const a = insideDome(D, f.x, f.y, f.z), b = insideDome(D, t.x, t.y, t.z);
    if (a === b) return null;
    let lo = 0, hi = 1;
    for (let i = 0; i < 16; i++) {
        const m = (lo + hi) / 2;
        const inside = insideDome(D, f.x + (t.x - f.x) * m, f.y + (t.y - f.y) * m, f.z + (t.z - f.z) * m);
        if (inside === a) lo = m; else hi = m;
    }
    return { s: lo, x: f.x + (t.x - f.x) * lo, y: f.y + (t.y - f.y) * lo, z: f.z + (t.z - f.z) * lo };
}

/** How near a point is to the skin (m, ≥ 0; far inside / outside → large): the dome shows itself to someone this close. */
export function skinDistance(D, x, y, z) {
    const d = flat(D, x, z), h = Math.max(0, y - D.y0) / (D.K || 1);
    return Math.abs(Math.hypot(d, h) - D.R);
}

/** A spectator of the stands (a fan of the arena): no charge targets him. */
export const isSpectator = (v) => !!v && v.arena?.kind === 'fan';

/**
 * The dome's skin as a mesh (flat arrays, THREE-free): the half-cylinder over the floor's long side and the half-spheres over its ends.
 * @returns {{pos: Float32Array, idx: Uint32Array}}
 */
export function domeGeometry(D, nt = 10, nr = 16, ne = 8) {
    const dx = D.bx - D.ax, dz = D.bz - D.az, L = Math.hypot(dx, dz);
    const ux = L > 0 ? dx / L : 0, uz = L > 0 ? dz / L : 1, nx = -uz, nz = ux, R = D.R;
    const pos = [], idx = [];
    const grid = (rows, cols, at) => {
        const base = pos.length / 3;
        for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) { const p = at(i / rows, j / cols); pos.push(p[0], p[1], p[2]); }
        for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
            const a = base + i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
    };
    // the long side: along the axis, over the half-circle from one side to the other
    grid(nt, nr, (t, f) => { const a = f * Math.PI, c = Math.cos(a) * R, h = Math.sin(a) * R; return [D.ax + ux * L * t + nx * c, D.y0 + h * (D.K || 1), D.az + uz * L * t + nz * c]; });
    // the ends: a half-sphere round each end of the axis
    for (const [cx, cz, s] of [[D.bx, D.bz, 1], [D.ax, D.az, -1]]) {
        grid(ne, nr, (la, f) => {
            const lam = la * Math.PI / 2, psi = f * Math.PI, ch = Math.cos(lam) * R;
            return [cx + ch * (Math.cos(psi) * nx + Math.sin(psi) * ux * s), D.y0 + Math.sin(lam) * R * (D.K || 1), cz + ch * (Math.cos(psi) * nz + Math.sin(psi) * uz * s)];
        });
    }
    return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

/**
 * The cage: the dome as a wall for BODIES while a duel is on (the author: «Если волшебник отскакивает от моего Wind, он не должен перелетать через арену… Пока идёт бой
 * ты находишься в таком МАГИЧЕСКОМ ВАКУУМЕ: не защита, но чтобы нельзя было свалить оттуда»). The duellists, a wand knocked out of a hand, anything thrown by a shove / a blast /
 * a lift stays inside the floor's capsule (a half metre from the stands' first step) and under the roof (`H` above the floor): the wall gives back a little of the speed (`BOUNCE`),
 * it never lets a body through, however fast it comes (80 m/s is one clamp). Spells are stopped by the dome's skin (domeCross); bodies by this wall.
 */
export const CAGE = { PAD: 0.5, H: 30, BOUNCE: 0.3, FLASH_EVERY: 0.35 };

/** The cage of an arena: {ax, az, bx, bz, R (what a body keeps within), skin (the dome's R), y0, top} or null (a training field has none). */
export function cageOf(def) {
    const D = domeOf(def);
    return D ? { ...D, skin: D.R, R: def.axis.r - CAGE.PAD, top: D.y0 + CAGE.H } : null; // (the dome's crest is CAGE.H or more: the roof of the cage lies inside it)
}

/**
 * Keep a body in the cage: `p` {x, y, z} and its velocity `v` {x, y, z} (m/s; any may be null) are changed in place.
 * → null (inside), or {x, y, z, wall: 'side' | 'roof'} the point on the dome's skin where the body struck (for the flash).
 */
export function cageClamp(C, p, v = null) {
    let hit = null;
    const dx = C.bx - C.ax, dz = C.bz - C.az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - C.ax) * dx + (p.z - C.az) * dz) / l2)) : 0;
    const cx = C.ax + dx * t, cz = C.az + dz * t, d = Math.hypot(p.x - cx, p.z - cz);
    if (d > C.R) {
        const nx = d > 1e-6 ? (p.x - cx) / d : 1, nz = d > 1e-6 ? (p.z - cz) / d : 0;
        p.x = cx + nx * C.R; p.z = cz + nz * C.R;
        if (v) { const vn = (v.x || 0) * nx + (v.z || 0) * nz; if (vn > 0) { v.x -= (1 + CAGE.BOUNCE) * vn * nx; v.z -= (1 + CAGE.BOUNCE) * vn * nz; } }
        hit = { x: cx + nx * C.skin, y: p.y, z: cz + nz * C.skin, wall: 'side' };
    }
    if (p.y > C.top) {
        p.y = C.top;
        if (v && v.y > 0) v.y = -v.y * CAGE.BOUNCE;
        hit = hit || { x: p.x, y: C.top, z: p.z, wall: 'roof' };
    }
    return hit;
}
