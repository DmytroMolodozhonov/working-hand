/**
 * «Раскрой свои секреты»: which thing the spell is about. Pure maths (no THREE), so it is unit-tested.
 * The order (author): 1) what the wand points at (a narrow cone, nearest to the axis, then the nearer);
 * 2) else any thing close to the player (the other hand's too); 3) only when there is nothing near at all —
 * the wand in the hand itself (it never beats a thing near).
 */
export const REVEAL = { CONE: 0.22, RANGE: 10, RUN_RANGE: 30, RUN_CONE: 0.3, NEAR: 2.5, FAR_AIM: 0.2 };

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const angle = (a, b) => {
    const l = len(a) * len(b);
    if (l < 1e-9) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / l)));
};

/**
 * tip, dir — the wand's tip and the way it points. things: [{ pos, ...anything, run? }] — everything that can be
 * revealed (never the casting wand). Returns { thing } | { far: metres } (a running book aimed at, too far) | { thing: null }.
 */
export function pickRevealTarget(tip, dir, things) {
    let best = null, bestAng = Infinity, bestD = Infinity;
    let far = null;
    for (const t of things) {
        const to = sub(t.pos, tip), d = len(to);
        const range = t.run ? REVEAL.RUN_RANGE : REVEAL.RANGE;
        const cone = (t.run ? REVEAL.RUN_CONE : REVEAL.CONE) + Math.atan2(0.15, Math.max(0.3, d));
        const ang = angle(dir, to);
        if (ang > cone) continue;
        if (d > range) { if (t.run && ang < REVEAL.FAR_AIM && (!far || d < far)) far = d; continue; }
        if (ang < bestAng - 1e-4 || (Math.abs(ang - bestAng) <= 1e-4 && d < bestD)) { best = t; bestAng = ang; bestD = d; }
    }
    if (best) return { thing: best };
    // nothing on the line: the nearest thing about the player
    let near = null, nearD = REVEAL.NEAR;
    for (const t of things) {
        if (t.run) continue;
        const d = len(sub(t.pos, tip));
        if (d < nearD) { near = t; nearD = d; }
    }
    if (near) return { thing: near };
    return far ? { far, thing: null } : { thing: null };
}
