/**
 * Where the segment p–q (a charge's move this frame) comes closest to the segment a–b:
 * {s: 0…1 on p–q, k: 0…1 on a–b, dist}.
 */
export function segmentToSegment(p, q, a, b, out = {}) {
    const d1x = q.x - p.x, d1y = q.y - p.y, d1z = q.z - p.z;
    const d2x = b.x - a.x, d2y = b.y - a.y, d2z = b.z - a.z;
    const rx = p.x - a.x, ry = p.y - a.y, rz = p.z - a.z;
    const A = d1x * d1x + d1y * d1y + d1z * d1z, E = d2x * d2x + d2y * d2y + d2z * d2z;
    const F = d2x * rx + d2y * ry + d2z * rz;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    let s = 0, k = 0;
    if (A <= 1e-12 && E <= 1e-12) { s = 0; k = 0; }
    else if (A <= 1e-12) { s = 0; k = clamp01(F / E); }
    else {
        const C = d1x * rx + d1y * ry + d1z * rz;
        if (E <= 1e-12) { k = 0; s = clamp01(-C / A); }
        else {
            const Bv = d1x * d2x + d1y * d2y + d1z * d2z;
            const den = A * E - Bv * Bv;
            s = den > 1e-12 ? clamp01((Bv * F - C * E) / den) : 0;
            k = (Bv * s + F) / E;
            if (k < 0) { k = 0; s = clamp01(-C / A); }
            else if (k > 1) { k = 1; s = clamp01((Bv - C) / A); }
        }
    }
    const px = rx + d1x * s - d2x * k, py = ry + d1y * s - d2y * k, pz = rz + d1z * s - d2z * k;
    out.s = s;
    out.k = k;
    out.dist = Math.sqrt(px * px + py * py + pz * pz);
    return out;
}
