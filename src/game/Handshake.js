/**
 * Handshake.js — hands meeting hands (pure maths, unit-tested): when a hand closes
 * round another creature's hand, where two hands shaking each other are drawn, how a
 * held body is led by the hand that holds it, and when it breaks free.
 * HandHold.js does the game side (players over the network, villagers).
 *
 * World units: the hero is ~2.8 units per real metre (≈ 2.5× a real person): the palm
 * (SimplifiedHand) is 0.28 wide, 0.45 long, 0.14 thick; the arm is 1.9 long.
 */

export const HAND = {
    PALM_FWD: 0.22,   // the palm's middle: this far past the wrist along the forearm
    GRAB_R: 0.55,     // my palm this near the other hand (≈ 20 cm): my fingers can close round it
    OPEN: 0.35,       // tracked finger curl: an open hand …
    CLOSED: 0.6,      // … a closed one (round a hand: it cannot close further)
    CLOSE_T: 0.7,     // the closing (open → closed) must happen within this, while near
    RELEASE_T: 0.15,  // fingers open this long: let go
    APART: 1.15,      // shaking palms pulled this far apart (≈ 40 cm) …
    APART_T: 0.15,    // … this long: the hands slip out of each other
    GAP: 0.09,        // two palms clasped: each one's middle this far from the joint (half a palm + skin)
    WRAP: 0.72,       // the fingers round another hand close no further than this
    FACING: 0.45,     // palms "roughly facing": |n₁·n₂| and the line between them along the normal
    // holding / leading by the hand
    REACH: 1.9,       // a hero's arm (the held one's shoulder may be this far from the holding palm)
    SLACK: 0.2,
    BREAK_EXCESS: 0.6, BREAK_T: 0.25, // walking away from the holder this hard, this long: free
    LAG_EXCESS: 2.2, LAG_T: 0.6,      // far beyond reach (a wall, lag, a teleport): free
    AWAY_COS: -0.34,  // walking away: facing more than 110° from the holder
    HIT_V: 9,         // the free hand flung this fast (a blow): free (≈ 3.2 m/s of a real fist)
    STALE: 2.0,       // the other one not heard from this long: let go
    PENDING_T: 1.0,
};

/**
 * The fingers really closing round a hand: open and near, then closed and still near
 * within CLOSE_T. A fist already made and pushed into a hand does not grab, nor does a
 * hand that closes far away and is brought there. hist: [{t, c, near}] newest last.
 */
export function closingAround(hist, now) {
    const last = hist[hist.length - 1];
    if (!last || last.c < HAND.CLOSED || !last.near) return false;
    for (let i = hist.length - 1; i >= 0; i--) {
        const h = hist[i];
        if (now - h.t > HAND.CLOSE_T || !h.near) return false; // (it went away in between)
        if (h.c <= HAND.OPEN) return true;
    }
    return false;
}

/**
 * Two palms roughly facing each other: their planes about parallel and the line from one
 * to the other along the normal (palm to palm, not side by side / one on the other's back
 * of the fingers). n1, n2: palm normals (unit), d: palm 1 → palm 2. Plain {x,y,z}.
 */
export function palmsFacing(n1, n2, d) {
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    if (Math.abs(dot(n1, n2)) < HAND.FACING) return false;
    const L = Math.hypot(d.x, d.y, d.z);
    if (L < 0.12) return true; // (already touching)
    return Math.abs(dot(n1, d)) / L >= HAND.FACING * 0.8 || Math.abs(dot(n2, d)) / L >= HAND.FACING * 0.8;
}

/**
 * Two hands clasped: the joint is the midpoint of the two real hands, and each palm sits
 * GAP from it on its own side (the hands never go into each other). a, b: the tracked
 * palms. Returns {joint, a, b} (new plain objects).
 */
export function clasp(a, b, gap = HAND.GAP) {
    const j = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    let ux = a.x - b.x, uy = a.y - b.y, uz = a.z - b.z;
    const L = Math.hypot(ux, uy, uz);
    if (L < 1e-6) { ux = 1; uy = 0; uz = 0; } else { ux /= L; uy /= L; uz /= L; }
    return {
        joint: j,
        a: { x: j.x + ux * gap, y: j.y + uy * gap, z: j.z + uz * gap },
        b: { x: j.x - ux * gap, y: j.y - uy * gap, z: j.z - uz * gap },
    };
}

/**
 * One step of the hand that leads a held body (on the held one's own computer, or the
 * host for a villager). me: the held one's shoulder, them: the holding palm ({x, z}).
 * The arm keeps them within reach: past it they are drawn after the hand by the excess
 * (they stumble after it). Walking away from the holder against the pull: `away`.
 */
export function leash({ me, them, facing = null, walking = false, reach = HAND.REACH + HAND.SLACK }) {
    const dx = them.x - me.x, dz = them.z - me.z, d = Math.hypot(dx, dz), e = d - reach;
    if (e <= 0 || d < 1e-6) return { move: null, excess: Math.max(0, e), away: false };
    const ux = dx / d, uz = dz / d;
    const away = !!(walking && facing && facing.x * ux + facing.z * uz < HAND.AWAY_COS);
    if (away) return { move: null, excess: e, away: true };
    return { move: { x: ux * e, z: uz * e }, excess: e, away: false };
}

/**
 * The held one breaking free (state kept between frames: {awayT, lagT}). Easy, as in life:
 * pulling away hard, a sharp jerk of the held arm, a blow with the free hand.
 * Returns the reason or null.
 */
export function breakFree(state, { dt, away = false, excess = 0, jerk = false, blow = false }) {
    state.awayT = away && excess > HAND.BREAK_EXCESS ? (state.awayT || 0) + dt : 0;
    state.lagT = excess > HAND.LAG_EXCESS ? (state.lagT || 0) + dt : 0;
    if (jerk) return 'jerk';
    if (blow) return 'blow';
    if (state.awayT >= HAND.BREAK_T) return 'away';
    if (state.lagT >= HAND.LAG_T) return 'far';
    return null;
}

/** Letting go of a held hand: fingers opened long enough (state {openT}). */
export function lettingGo(state, curl, dt) {
    state.openT = curl <= HAND.OPEN ? (state.openT || 0) + dt : 0;
    return state.openT >= HAND.RELEASE_T;
}

/** Two shaking hands pulled apart (state {apartT}): the real palms too far from each other. */
export function pulledApart(state, dist, dt) {
    state.apartT = dist > HAND.APART ? (state.apartT || 0) + dt : 0;
    return state.apartT >= HAND.APART_T;
}

/**
 * A villager's arm (it hangs from the shoulder along −Y, `len` long) reaching a point:
 * the direction in the torso's space, the arm no longer than it is. shoulder, point in
 * the same space. Returns the unit direction {x,y,z} and whether the hand gets there.
 */
export function armTo(shoulder, point, len) {
    let x = point.x - shoulder.x, y = point.y - shoulder.y, z = point.z - shoulder.z;
    const L = Math.hypot(x, y, z);
    if (L < 1e-6) return { dir: { x: 0, y: -1, z: 0 }, reaches: true };
    x /= L; y /= L; z /= L;
    return { dir: { x, y, z }, reaches: L <= len + 0.05 };
}
