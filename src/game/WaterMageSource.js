/**
 * WaterMageSource.js — where a water mage gets his water (pure; the world's blocks are asked through `get(x, y, z)`).
 *
 * The author 14.11: «когда маг воды ставит протекшн, он как будто появляется из ниоткуда. Он должен манипулировать той водой, которая у него есть. Он не может просто брать воду
 * из потолка». The water mage's shield / dome / wave is made of WATER HE HAS: a real water block within `REACH` m (a stream flies from it), or the tank on his back, or the
 * moisture of the air for the ones born with that gift. The fight logic (ElementalMages.waterSource) and the picture (WaterMageGuard) use the same answer.
 */
export const WATER_REACH = { XZ: 10, STEP: 2, DOWN: 5, UP: 3 };
/** The nearest water block round (x, y, z): {x, y, z} or null. `get(x, y, z)` → block id; `isWater(id)`; `made(x, z)` — false for land not made yet. */
export const WIDE_WATER = { XZ: 40, STEP: 4, DOWN: 5, UP: 3 }; // (a wider look, when none is near)
export function findWater(get, isWater, x, y, z, made = null, reach = WATER_REACH) {
    const R = reach;
    let best = null, bd = Infinity;
    for (let dx = -R.XZ; dx <= R.XZ; dx += R.STEP) for (let dz = -R.XZ; dz <= R.XZ; dz += R.STEP) {
        const X = Math.round(x + dx), Z = Math.round(z + dz);
        if (made && !made(X, Z)) continue;
        const d = dx * dx + dz * dz;
        if (d >= bd) continue;
        for (let k = -R.DOWN; k <= R.UP; k++) if (isWater(get(X, Math.round(y) + k + 1, Z))) { best = { x: X, y: Math.round(y) + k, z: Z }; bd = d; break; }
    }
    return best;
}
/** Where the water comes from for the picture: 'water' (a block — the stream flies from it), 'tank' (the tank on his back), 'air' (the moisture round him). */
export function waterKind(src, hasTank) { return src ? 'water' : hasTank ? 'tank' : 'air'; }
/** A point on the stream from `a` to `b`, arched up by `lift`, at u 0…1. */
export function streamPoint(a, b, lift, u, out = {}) {
    out.x = a.x + (b.x - a.x) * u;
    out.y = a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * lift;
    out.z = a.z + (b.z - a.z) * u;
    return out;
}
export const GUARD_BUILD = { SHIELD: 0.35, DOME: 0.6, FADE: 0.45 }; // s: the water gathers into the guard / falls back
