/**
 * HouseAim.js — which house the hand (the wand, the gaze) points at. Pure numbers, no THREE.
 *
 * The author: «показываю рукой на дом — рыцарь не понял, куда». The old way marched the ray to the GROUND and took the nearest house
 * centre within 28 m — a ray into a wall passes the house and lands behind it (the next house, the next street), and a row of houses was
 * a lottery. Now the ray is tested against the houses themselves (a round footprint of the house's radius, its height), the first one
 * the ray enters wins; a ray stopped by the ground / a wall right before a house takes that house; a slightly missed shot (a shaking hand)
 * takes the nearest house inside a small angle; two such near-misses of the same quality are «ambiguous» (the knight asks to point again).
 *
 *   pickHouse(houses, ray, { blockT, tolDeg, maxDist, height }) →
 *     { i, kind: 'hit' | 'blocker' | 'near', dist, angle, miss, ambiguous, alt } | null
 *   – ray: { o: {x,y,z}, d: {x,y,z} } (d unit);  blockT: how far the ray goes before the world stops it (terrain raycast), or null.
 */

export const AIM = {
    TOL_DEG: 3.5,     // a shaking hand: the angle a missed house still counts within
    MAX_DIST: 150,    // the farthest house a hand can show
    HEIGHT: 10,       // how tall a house is for the ray (above its floor)
    BLOCK_NEAR: 4,    // the ground / wall the ray hit is this close to a house wall: that house
    AMBIGUITY: 1.35,  // the second near-miss within this factor of the first angle: not sure which
};

const hyp = Math.hypot;

/** The ray against one house: { t1, t2 } where it is inside the footprint circle (and not above / below the house), or null. */
export function rayVsHouse(h, ray, height = AIM.HEIGHT) {
    const R = h.r || 6, cx = h.c.x, cz = h.c.z;
    const dx = ray.d.x, dz = ray.d.z, ox = ray.o.x - cx, oz = ray.o.z - cz;
    const a = dx * dx + dz * dz;
    if (a < 1e-6) return null; // (straight up / down)
    const b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - R * R;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
    if (t2 <= 0) return null;
    const te = Math.max(t1, 0);
    if (h.c.y != null) {
        const y0 = ray.o.y + ray.d.y * te, y1 = ray.o.y + ray.d.y * t2;
        const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
        if (hi < h.c.y - 1.5 || lo > h.c.y + height) return null; // (over the roof or under the floor)
    }
    return { t1: te, t2 };
}

/** How near the ray passes the house (the angle at the hand, of the gap between the ray and the house wall). */
export function missOf(h, ray) {
    const R = h.r || 6;
    const px = h.c.x - ray.o.x, pz = h.c.z - ray.o.z;
    const t = px * ray.d.x + pz * ray.d.z;
    if (t <= 0.5) return { miss: Infinity, angle: Infinity, t };
    const dxz = hyp(ray.d.x, ray.d.z) || 1;
    const along = t / dxz;
    const off = Math.abs(px * ray.d.z - pz * ray.d.x) / dxz; // the sideways distance of the centre from the ray
    const gap = Math.max(0, off - R);
    return { miss: gap, angle: Math.atan2(gap, along) * 180 / Math.PI, t: along };
}

export function pickHouse(houses, ray, opts = {}) {
    if (!ray || !houses?.length) return null;
    const maxDist = opts.maxDist ?? AIM.MAX_DIST, tol = opts.tolDeg ?? AIM.TOL_DEG, height = opts.height ?? AIM.HEIGHT;
    const blockT = opts.blockT != null && isFinite(opts.blockT) ? opts.blockT : null;
    const hits = [], near = [];
    houses.forEach((h, i) => {
        const r = rayVsHouse(h, ray, height);
        if (r && r.t1 <= maxDist) hits.push({ i, t: r.t1 });
        else {
            const m = missOf(h, ray);
            if (m.angle <= tol && m.t <= maxDist) near.push({ i, angle: m.angle, miss: m.miss, t: m.t });
        }
    });
    hits.sort((a, b) => a.t - b.t);
    near.sort((a, b) => a.angle - b.angle);
    // the ground / a wall stopped the ray before the house it was going to: the house standing by that place, or nothing by it
    const blocked = (t) => blockT != null && t > blockT + 1.5;
    let blockPt = null;
    if (blockT != null) blockPt = { x: ray.o.x + ray.d.x * blockT, z: ray.o.z + ray.d.z * blockT };
    const atBlock = () => {
        if (!blockPt) return -1;
        let bi = -1, bd = Infinity;
        houses.forEach((h, i) => { const d = hyp(h.c.x - blockPt.x, h.c.z - blockPt.z) - (h.r || 6); if (d < AIM.BLOCK_NEAR && d < bd) { bd = d; bi = i; } });
        return bi;
    };
    const free = hits.filter((e) => !blocked(e.t));
    if (free.length) {
        const e = free[0];
        return { i: e.i, kind: 'hit', dist: e.t, angle: 0, miss: 0, ambiguous: false, alt: free[1]?.i ?? null };
    }
    if (hits.length) { // (every house the ray enters stands behind the thing it hit)
        const bi = atBlock();
        if (bi >= 0) return { i: bi, kind: 'blocker', dist: blockT, angle: 0, miss: 0, ambiguous: false, alt: null };
        return null;
    }
    const bi = atBlock();
    if (bi >= 0) return { i: bi, kind: 'blocker', dist: blockT, angle: 0, miss: 0, ambiguous: false, alt: null };
    const ok = near.filter((e) => !blocked(e.t));
    if (!ok.length) return null;
    const e = ok[0], e2 = ok[1];
    const ambiguous = !!e2 && e2.angle <= e.angle * AIM.AMBIGUITY + 0.4;
    return { i: e.i, kind: 'near', dist: e.t, angle: e.angle, miss: e.miss, ambiguous, alt: e2?.i ?? null };
}
