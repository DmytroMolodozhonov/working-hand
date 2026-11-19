/**
 * TravelerGaze.js — where a person on the road looks (the author 19.11: «странники на телегах или идущие вообще головой не двигают… должны быть
 * наблюдательными, куда-то смотреть; новый персонаж, игрок — быть настороже… это не современные города, где безопасно»).
 *
 * Pure: `gazeAt(person, t, others)` → { x, z, alert } or null (look ahead). Every computer works it out for itself from the same inputs (a head turn is
 * only a picture — nothing goes over the net); the rest of the behaviour (slowing, a word) is the host's (Travelers).
 *   • a stranger (a player) within SEE_R in front or beside: the head turns to him at once and follows him; within WARY_R he stays on him (alert),
 *     the look is held HOLD_S at least, then back to scanning only when he is out of range — a man on a road does not take his eyes off a stranger;
 *   • otherwise the person scans: a sweep to one side or the other (the road's edges, the trees, behind him for the one on a cart's bench), held 1–2.5 s,
 *     with a rest between; every person has his own rhythm (a hash of his id) so two on one cart never turn together; sometimes a glance far ahead;
 *   • the driver looks ahead most of the time (the road), the passengers scan more.
 */
export const GAZE = {
    SEE_R: 38, // m: a stranger this near is noticed
    WARY_R: 16, // m: and watched all the way
    HOLD_S: 1.6, // s a look is held at least
    SIDE: 1.15, // rad: the widest turn of a sweep (the head turns ±70° only: the body does not follow)
};

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

/**
 * p: { id, x, z, yaw (the body's), driver (bool), ahead (the way's direction: rad, the same convention as yaw) }; t: seconds; others: [{ x, z }] strangers.
 * The state (the held look) is kept on `p._gz`. Returns { x, z, alert } to look at (14 m away along the look), or null.
 */
export function gazeAt(p, t, others = []) {
    const st = p._gz || (p._gz = { until: 0, tx: 0, tz: 0, alert: false, who: null, rest: 0 });
    // a stranger first
    let best = null, bd = Infinity;
    for (const o of others) {
        const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
        if (d > GAZE.SEE_R || d >= bd) continue;
        // (not through his own back: the driver sees a stranger behind him only when he is near)
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), cosA = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
        if (cosA < -0.2 && d > GAZE.WARY_R * 0.6) continue;
        best = o; bd = d;
    }
    if (best) {
        st.alert = bd < GAZE.WARY_R; st.tx = best.x; st.tz = best.z; st.until = t + GAZE.HOLD_S; st.who = best;
        return { x: best.x, z: best.z, alert: st.alert };
    }
    if (st.who && t < st.until) return { x: st.tx, z: st.tz, alert: false }; // (a held look: a moment more after he is gone)
    st.who = null; st.alert = false;
    // scanning
    if (t >= st.until) {
        const h1 = hash(p.id + '|' + Math.floor(t / 7)), h2 = hash(p.id + '#' + Math.floor(t / 3.1));
        if (st.rest > t) { st.tx = st.tz = null; st.until = st.rest; }
        else {
            const ahead = p.ahead ?? p.yaw;
            const side = (h2 < 0.5 ? -1 : 1) * (0.35 + 0.8 * hash(p.id + '~' + Math.floor(t / 2.3)));
            const far = (p.driver ? 0.65 : 0.25) > h1; // (the driver mostly watches the road)
            const a = ahead + (far ? side * 0.25 : side * GAZE.SIDE);
            st.tx = p.x - Math.sin(a) * 14; st.tz = p.z - Math.cos(a) * 14;
            st.until = t + 1 + 1.5 * hash(p.id + '^' + Math.floor(t / 4.7));
            st.rest = st.until + (p.driver ? 1.5 : 0.6) + 2.2 * h1;
        }
    }
    return st.tx == null ? null : { x: st.tx, z: st.tz, alert: false };
}
