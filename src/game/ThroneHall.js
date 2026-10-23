/**
 * ThroneHall.js — where people stand in a castle's throne room (pure: works on the castle's plan).
 *
 * The throne stands at the far end on a dais with armrests; the gold seat and the dais are
 * obstacles for walking. Whoever has to be near the king (the knights who follow a new king sitting
 * on it, the army waiting round him) goes to a FREE place on the floor in front of the dais, each to
 * his own — never into the throne and never all to one point (they used to press into the throne and
 * into each other). The same for the vizier's place at the doors (he must always hear the king).
 *
 * Directions as in the game: a body with yaw looks along (−sin yaw, −cos yaw); its right is (cos yaw, −sin yaw).
 */

const STEP = 2.6; // m between two standing people (a body is ~1 m across; 2.5 blocks at the least)

const dirs = (yaw) => ({ fx: -Math.sin(yaw), fz: -Math.cos(yaw), rx: Math.cos(yaw), rz: -Math.sin(yaw) });

/** The throne room's plan (its rectangle) or null. */
export function hallOf(def) {
    const room = def?.rooms?.find((r) => r.kind === 'throne');
    return room && def.throne ? room : null;
}

/** Is the point inside the throne room's walls (+ margin m)? */
export function inHall(def, p, margin = 0) {
    const r = hallOf(def);
    return !!r && p.x >= r.x0 - margin && p.x <= r.x1 + margin && p.z >= r.z0 - margin && p.z <= r.z1 + margin;
}

/** Is the point on the throne's dais (or at the seat): nobody stands or walks there to be near the king. */
export function onDais(def, p, margin = 0) {
    const t = def?.throne;
    if (!t) return false;
    const { fx, fz, rx, rz } = dirs(t.yaw);
    const dx = p.x - t.x, dz = p.z - t.z;
    const along = dx * fx + dz * fz, across = dx * rx + dz * rz;
    return along > -2.5 - margin && along < 3.6 + margin && Math.abs(across) < 3.6 + margin;
}

/**
 * Free standing places in front of the dais, the nearest to the throne first: rows from 8.5 m, 2.6 m apart, up to 16 m from
 * the throne (the guards' own posts are at 6 m, ±4 m — left alone), 2.6 m apart across the hall, away from
 * the pillars along its walls. [{x, y, z, yaw}] — yaw: facing the throne.
 */
export function hallSpots(def) {
    const room = hallOf(def);
    if (!room) return [];
    const t = def.throne, { fx, fz, rx, rz } = dirs(t.yaw);
    const wAcross = Math.abs(rx) > Math.abs(rz) ? room.x1 - room.x0 : room.z1 - room.z0;
    const wAlong = Math.abs(fx) > Math.abs(fz) ? room.x1 - room.x0 : room.z1 - room.z0;
    const half = Math.max(0, wAcross / 2 - 3.2); // (the pillars stand 2 m inside the walls)
    const out = [];
    for (let d = 8.5; d <= Math.min(16, wAlong - 6.5); d += STEP) {
        const n = Math.floor(half / STEP);
        for (let k = -n; k <= n; k++) {
            const s = k * STEP;
            out.push({ x: t.x + fx * d + rx * s, y: def.throneFront?.y ?? t.y, z: t.z + fz * d + rz * s, yaw: Math.atan2(fx, fz), d: Math.hypot(d, s) });
        }
    }
    return out.sort((a, b) => a.d - b.d);
}

/**
 * Places by the doors of the throne room, inside it: to the side of the doorway (the way in stays clear),
 * facing the hall; the first is the vizier's. [{x, y, z, yaw}]
 */
export function doorSpots(def) {
    const G = def?.throneGate;
    if (!G || !def.throne) return [];
    const { fx, fz, rx, rz } = dirs(def.throne.yaw); // (the doors are in the direction the throne looks)
    const out = [];
    for (const [depth, side] of [[3, 1], [3, -1], [5.4, 1], [5.4, -1]]) {
        const s = side * (G.w / 2 + 1.3);
        out.push({ x: G.x - fx * depth + rx * s, y: G.y, z: G.z - fz * depth + rz * s, yaw: Math.atan2(fx, fz) });
    }
    return out;
}

/**
 * Whose place is whose: each person claims the nearest free place of a list; a claim lapses a second
 * after it was last asked for (the person left or died).
 */
export class Claims {
    constructor() { this.by = new Map(); } // key → Map(spot index → {id, at})

    spot(key, spots, v, now) {
        let m = this.by.get(key);
        if (!m) { m = new Map(); this.by.set(key, m); }
        for (const [i, c] of m) if (now - c.at > 1) m.delete(i);
        for (const [i, c] of m) if (c.id === v.id) { c.at = now; return spots[i] || null; }
        let best = -1, bd = Infinity;
        spots.forEach((s, i) => {
            if (m.has(i)) return;
            const d = Math.hypot(s.x - v.x, s.z - v.z);
            if (d < bd) { bd = d; best = i; }
        });
        if (best < 0) return null;
        m.set(best, { id: v.id, at: now });
        return spots[best];
    }
}
