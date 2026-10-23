/**
 * Unstick.js — «стоит без причины»: a walker that should be going and isn't (pure core, no THREE).
 *
 * The author: «Рыцарь просто стоит на месте и ничего не делает. Или телега просто стоит на месте.»
 * A walker that wants to go (walk / run / a path to follow) and has made no way for STILL s is
 * stuck: the reason is written to the log (once a minute per creature) and it is helped out —
 * first a new way (`replan`), and if that does not move it either and nobody sees it, to the nearest
 * place where one can stand (`nearestFree`). Sleeping, talking, waiting for a player, a post by the
 * schedule, a fight — are not stuck (`skip`).
 *
 * env: { skip(b) → string|null (why it's fine to stand), diagnose(b) → string, replan(b) → bool,
 *        unseen(b) → bool, nearestFree(b) → {x, y, z}|null, log(text), now (s) }.
 */

export const STUCK = {
    STILL: 30, // s: standing and wanting to go → stuck
    MOVE: 1.5, // m: less than this over STILL s is «not going anywhere»
    LOG: 60, // s: one line per creature a minute
    PORT_AFTER: 15, // s after the new way didn't help: out of sight → to the nearest free place
};

export class StuckWatch {
    constructor(env) { this.env = env; this.count = 0; this.fixed = 0; }

    /** b: a walker ({x, y, z, …, stk: kept on it}); wants: it means to go (walk / run / a path). */
    watch(b, dt, wants) {
        const e = this.env;
        let s = b.stk;
        if (!s) s = b.stk = { x: b.x, z: b.z, t: 0, logAt: -1e9, phase: 0 };
        if (!wants || e.skip(b) || Math.hypot(b.x - s.x, b.z - s.z) > STUCK.MOVE) {
            s.x = b.x; s.z = b.z; s.t = 0; s.phase = 0;
            return false;
        }
        s.t += dt;
        if (s.t < STUCK.STILL) return false;
        const now = e.now;
        if (now - s.logAt >= STUCK.LOG) { s.logAt = now; this.count++; e.log(`стоит без причины ${Math.round(s.t)} с: ${e.diagnose(b)}`, b); }
        if (s.phase === 0) {
            s.phase = 1; s.t = STUCK.STILL - STUCK.PORT_AFTER; // (a new way, then a while to see if it goes)
            if (e.replan(b)) { this.fixed++; }
            return true;
        }
        // (the new way didn't move it: out of sight → to the nearest place to stand)
        if (e.unseen(b)) {
            const p = e.nearestFree(b);
            if (p) { b.x = p.x; b.y = p.y; b.z = p.z; b.path = null; this.fixed++; s.x = b.x; s.z = b.z; s.t = 0; s.phase = 0; return true; }
        }
        s.phase = 0; s.t = STUCK.STILL - STUCK.PORT_AFTER;
        return true;
    }
}

/**
 * A walker pushing at a wall (it wants to go on, and the step is shut): the wall guard of `_steer`.
 * Returns what to do now: 'go' (not held up), 'plan' (held up a moment: look for a way round the
 * walls), 'wait' (no way: stand off the wall and wait), 'leave' (waited long: give the goal up).
 * st: {t (held up), noWay (s since it found no way)} kept on the walker.
 */
export const WALL = { PLAN: 1.0, KEEP: 3.5, LEAVE: 20 };

export function wallState(st, held, dt, noWayFound) {
    if (!held) { st.t = Math.max(0, (st.t || 0) - dt * 2); if (st.t === 0 && !st.noWay) return 'go'; }
    else st.t = (st.t || 0) + dt;
    if (noWayFound) st.noWay = st.noWay || 0.001;
    if (st.noWay) {
        st.noWay += dt;
        if (st.noWay > WALL.LEAVE) { st.noWay = 0; st.t = 0; return 'leave'; }
        return 'wait';
    }
    return st.t > WALL.PLAN ? 'plan' : 'go';
}
