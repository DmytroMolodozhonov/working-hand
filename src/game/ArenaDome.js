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

/** The dome of an arena: {ax, az, bx, bz, R, y0} or null (a training field has none). */
export function domeOf(def) {
    if (!def || def.practice || !def.axis) return null;
    const { a, b, r } = def.axis;
    return { ax: a.x, az: a.z, bx: b.x, bz: b.z, R: r + DOME.MARGIN, y0: def.floorY ?? a.y ?? 0 };
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
    return h <= Math.sqrt(D.R * D.R - d * d) && h > -6;
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
    const d = flat(D, x, z), h = Math.max(0, y - D.y0);
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
    grid(nt, nr, (t, f) => { const a = f * Math.PI, c = Math.cos(a) * R, h = Math.sin(a) * R; return [D.ax + ux * L * t + nx * c, D.y0 + h, D.az + uz * L * t + nz * c]; });
    // the ends: a half-sphere round each end of the axis
    for (const [cx, cz, s] of [[D.bx, D.bz, 1], [D.ax, D.az, -1]]) {
        grid(ne, nr, (la, f) => {
            const lam = la * Math.PI / 2, psi = f * Math.PI, ch = Math.cos(lam) * R;
            return [cx + ch * (Math.cos(psi) * nx + Math.sin(psi) * ux * s), D.y0 + Math.sin(lam) * R, cz + ch * (Math.cos(psi) * nz + Math.sin(psi) * uz * s)];
        });
    }
    return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}
