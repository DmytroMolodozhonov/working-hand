/**
 * ElementalMove.js — how the elemental mages (earth, water, fire, air) move about the fight, and the watchdog that never lets one stand frozen.
 *
 * The author 14.11: «они часто перемещаются вправо и влево, и это перемещение нереалистичное. Они должны перемещаться, не стоять на месте, но
 * сейчас нереалистично»; «маг земли через какое-то время замирает на месте — при ходьбе назад или если его взорвало».
 * Before: every frame a point 6 m off on a circle round the foe, the body turned to the foe while the legs walked forward (a slide, a moonwalk), and a
 * blocked retreat only flipped the circle's side — a mage backed into a wall pushed at it for good.
 * Now (pure rules here, the walking itself is CastleLife._steer): the mage moves in HOPS — a few metres to a free spot, then a short pause (his own
 * length), and walks facing the way he goes (a person does not walk sideways); a hop that does not move him is dropped for another way (the opposite
 * side, then forward, then a long way round) and a mage who has made no progress for `STUCK.T` seconds is set going again (`StuckWatch`).
 *
 * «А если»: the foe is behind a wall (the hop is only a place to stand: never through a wall — `free(x, z)` asks the world); no free place at all (he
 * waits — never a spin); knocked up / stunned / lifted (`still(v)`: the watch does not count those seconds); the foe too close (a step back first,
 * the side only after); a ledge in the way (the pilot climbs it); the mage dies / is put to sleep (the state is a plain object on him: gone with him).
 */
export const HOP = {
    LEN: [2.6, 5.4], // m of one hop
    PAUSE: [0.45, 1.5], // s between hops (a person stops to look)
    TIMEOUT: 3.2, // s: a hop that is not done by then is dropped
    NEAR_EPS: 0.45, // m: a hop is done
    BLOCK_T: 0.5, // s without moving: this way is shut
    TRIES: 8,
};
/** The watch: no progress (not a step, not a new phase) for this long while a foe lives → set going again. */
export const STUCK = { T: 5.5, STEP: 0.06, COOL: 4 };

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The next hop's way: where the foe is (dx, dz from the mage), the distance band he likes, the side he last went (±1), a die 0…1.
 * → candidate directions in order of liking (unit vectors).
 */
export function hopDirections(dx, dz, band, side, roll) {
    const d = Math.hypot(dx, dz) || 1, fx = dx / d, fz = dz / d; // (towards the foe)
    const lx = -fz * side, lz = fx * side; // (to the side)
    const dirs = [];
    const push = (ax, az) => { const n = Math.hypot(ax, az) || 1; dirs.push({ x: ax / n, z: az / n }); };
    if (d < band - 2.5) { // too close: back off first (a step away, a little aslant), then the side
        push(-fx * 1 + lx * 0.45, -fz * 1 + lz * 0.45); push(-fx - lx * 0.45, -fz - lz * 0.45); push(lx, lz); push(-lx, -lz);
    } else if (d > band + 3.5) { // too far: closer, aslant
        push(fx + lx * 0.4, fz + lz * 0.4); push(fx - lx * 0.4, fz - lz * 0.4); push(fx, fz); push(lx, lz);
    } else { // in the band: a sidestep, now and then a step back or in
        if (roll < 0.62) { push(lx + fx * 0.25, lz + fz * 0.25); push(-lx + fx * 0.25, -lz + fz * 0.25); push(-fx, -fz); push(fx, fz); }
        else if (roll < 0.85) { push(-fx + lx * 0.5, -fz + lz * 0.5); push(lx, lz); push(-lx, -lz); push(fx, fz); }
        else { push(fx + lx * 0.5, fz + lz * 0.5); push(lx, lz); push(-lx, -lz); push(-fx, -fz); }
    }
    return dirs;
}

/** A fresh hop state (a plain object kept on the mage: `v.hop`). */
export function newHop() { return { tx: 0, tz: 0, go: false, t: 0, wait: 0.2, side: 0, blockT: 0, shut: 0 }; }

/**
 * One frame of the movement. `io` = { steer(tx, tz, speed, dt), free(x, z) → bool (a body fits there), pos: {x, z}, rng() } — the world's side, so this is testable.
 * → 'hop' (walking) | 'wait' (standing between hops) | 'stuck' (no way found: the watchdog's business).
 */
export function stepHop(h, foe, band, speed, dt, io) {
    const p = io.pos;
    if (!h.side) h.side = io.rng() < 0.5 ? 1 : -1;
    if (h.go) {
        h.t += dt;
        const d = Math.hypot(h.tx - p.x, h.tz - p.z);
        const before = { x: p.x, z: p.z };
        if (d > HOP.NEAR_EPS && h.t < HOP.TIMEOUT) {
            io.steer(h.tx, h.tz, speed, dt);
            h.blockT = Math.hypot(p.x - before.x, p.z - before.z) < 0.002 ? h.blockT + dt : 0;
            if (h.blockT < HOP.BLOCK_T) return 'hop';
            h.side = -h.side; h.shut++; // this way is shut: the other side next
        }
        h.go = false; h.blockT = 0; h.wait = lerp(HOP.PAUSE[0], HOP.PAUSE[1], io.rng()) * (h.shut ? 0.4 : 1);
        return 'wait';
    }
    if (h.wait > 0) { h.wait -= dt; return 'wait'; }
    const dx = foe.x - p.x, dz = foe.z - p.z;
    const dirs = hopDirections(dx, dz, band, h.side, io.rng());
    const len = lerp(HOP.LEN[0], HOP.LEN[1], io.rng());
    for (let i = 0; i < Math.min(HOP.TRIES, dirs.length * 2); i++) {
        const k = i % dirs.length, L = len * (i < dirs.length ? 1 : 0.5); // (the second round: a shorter hop)
        const tx = p.x + dirs[k].x * L, tz = p.z + dirs[k].z * L;
        if (io.free(p.x + dirs[k].x * (L * 0.5), p.z + dirs[k].z * (L * 0.5)) && io.free(tx, tz)) {
            h.tx = tx; h.tz = tz; h.go = true; h.t = 0; h.blockT = 0; h.shut = i === 0 ? 0 : h.shut;
            return 'hop';
        }
    }
    h.wait = 0.5; h.shut++;
    return 'stuck';
}

/**
 * The watchdog: call every frame with what the mage is doing. → true when he has made no progress for STUCK.T seconds (then reset the way and go).
 * Progress = he moved, or his phase/cycle changed, or he is not in a fight (no foe), or he is held (`still`: stunned, lifted, in the air).
 */
export function newWatch() { return { t: 0, x: NaN, z: NaN, key: '', cool: 0 }; }
export function stuckStep(w, v, foeNear, key, dt, still = false) {
    w.cool = Math.max(0, w.cool - dt);
    const moved = !(Math.hypot(v.x - w.x, v.z - w.z) < STUCK.STEP);
    if (moved || key !== w.key || !foeNear || still) { w.t = 0; w.x = v.x; w.z = v.z; w.key = key; return false; }
    w.t += dt;
    if (w.t >= STUCK.T && w.cool <= 0) { w.t = 0; w.cool = STUCK.COOL; return true; }
    return false;
}
