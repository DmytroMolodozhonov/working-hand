/**
 * ThreatBack.js — «Отход назад от нападающих» (a setting; the author 05.11, after the lean of the back would not do: «ходьба назад будет
 * работать только если на тебя бежит кто-то, и он относительно недалеко… но если ты развернёшься в другую сторону, ты все равно
 * побежишь вперёд»). The whole reason to walk backwards is to keep facing who comes at you and go on fighting — so the body's lean is
 * not read at all:
 *   - a FOE: any body of the crowd (CrowdSources: people, knights, animals, zombies, the spider, other players…) within R m that comes
 *     at me fast (its distance shrinking at CLOSE m/s or more — running, not strolling up to talk), or one already that close (NEAR m)
 *     that had come at me; it stays a foe HOLD s after it stopped coming (it stands and strikes), while within R;
 *   - stepping on the spot with a foe IN FRONT (within FACE° of where the hero looks) — the hero steps backwards, facing it;
 *   - turned away from it (past FACE°) — the steps go forward as always: running away.
 *   - only ITS movement counts: walking up to somebody who stands still is no attack; a body that is after me (`hostile`: a villager
 *     angry at me, a zombie hunting me) is a foe at once.
 * Pure (Node-testable): the game gives the bodies and the hero's place and yaw each frame.
 */

export const THREAT_BACK = {
    R: 16, // m: a foe this near counts
    CLOSE: 2.2, // m/s: its distance shrinking at least this fast — it comes at me
    NEAR: 5, // m: this close, a foe that came stays one while it stands and strikes
    HOLD: 3, // s it stays a foe after it stopped coming
    FACE: 70, // ° between where the hero looks and the foe: in front
    SMOOTH: 6, // 1/s: the closing speed smoothed
};

const D2R = Math.PI / 180;

/**
 * One frame. st: this player's memory ({}), me: {x, z, yaw} (the hero's yaw: it looks along (−sin yaw, −cos yaw)), bodies: [{id, x, z}]
 * (without me; `hostile`: it is after me), dt s, now s. → {back: bool, foe: {id, d, ang} | null}.
 */
export function threatStep(st, me, bodies, dt, now) {
    const T = THREAT_BACK;
    const seen = st.seen || (st.seen = new Map());
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    let best = null;
    for (const b of bodies) {
        const dx = b.x - me.x, dz = b.z - me.z, d = Math.hypot(dx, dz);
        if (d > T.R) { seen.delete(b.id); continue; }
        let s = seen.get(b.id);
        if (!s) { s = { x: b.x, z: b.z, v: 0, until: -1 }; seen.set(b.id, s); }
        else if (dt > 0) {
            // ITS OWN speed towards me — not the distance shrinking: me walking up to somebody standing is no attack (the author 05.11:
            // «когда я подошёл к нему, он ещё не был нападающим»)
            const ux = -dx / (d || 1e-6), uz = -dz / (d || 1e-6);
            const v = ((b.x - s.x) * ux + (b.z - s.z) * uz) / dt;
            s.v += (v - s.v) * Math.min(1, dt * T.SMOOTH);
            s.x = b.x; s.z = b.z;
        }
        s.at = now;
        if (b.hostile || s.v >= T.CLOSE) s.until = now + T.HOLD; // (hostile: it is after me — a villager angry at me, a knight, a zombie…)
        if (s.until > 0 && d <= T.NEAR && s.v > -T.CLOSE) s.until = Math.max(s.until, now + 0.2); // (standing at me, striking: still a foe)
        if (now > s.until) continue;
        const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1e-6)))) / D2R;
        if (!best || d < best.d) best = { id: b.id, d, ang };
    }
    for (const [id, s] of seen) if (now - (s.at ?? now) > 2) seen.delete(id); // (gone from the crowd: forgotten)
    st.foe = best;
    return { back: !!best && best.ang <= T.FACE, foe: best };
}
