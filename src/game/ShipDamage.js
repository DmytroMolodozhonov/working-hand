/**
 * ShipDamage.js — holes, leaks, fire and sinking (pure, Node-testable).
 *
 * A Bombardo or a cannonball near the hull knocks a hole in it; holes under
 * the waterline let the sea in (the more and the bigger, the faster). Fire
 * grows, spreads along the deck and up into the sails, burns the hull. When
 * the ship is full of water it sinks: it settles, lists to one side, goes
 * down by the bow and comes to rest on the bottom — a wreck.
 */

export const DMG = {
    HOLE_K: 0.35, HOLE_MAX: 3, LEAK_K: 0.006,
    FIRE_GROW: 0.1, SPREAD_R: 7, SPREAD_P: 0.3, SPREAD_T: 4, FIRE_DPS: 0.5, SAIL_BURN: 0.12, MAX_FIRES: 24,
    SINK_V0: 0.15, SINK_V1: 0.8, LIST_MAX: 0.38, PITCH_MAX: 0.1,
    BALL_DMG: 18, BALL_HOLE: 0.9, // a cannonball
};

/** Hull damage of a blast `dHull` metres from the hull. */
export function blastDamage(dHull, radius, power) {
    const reach = radius + 3;
    if (!(dHull < reach)) return 0;
    return Math.round(35 * Math.pow(power, 0.8) * (1 - dHull / reach));
}

export const holeRadius = (radius) => Math.min(DMG.HOLE_MAX, DMG.HOLE_K * radius);

/**
 * Flooding per second (fraction of the ship's flood volume) from the holes whose height in the
 * world (`wy`, recomputed as the ship rolls and sinks) is under the water line (+0.3 for waves).
 */
export function leakRate(holes, wlY, vol) {
    let L = 0;
    for (const h of holes) if (h.wy < wlY + 0.3) L += h.r * h.r * DMG.LEAK_K;
    return L / vol;
}

/**
 * Fire on board. st.fires: [{lx, ly, lz, k (0..1 intensity), age, sail?: id}], st.sails: [{id, burnt, center}].
 * rng: () → [0, 1). wet: rain (fires die 3× faster). Returns { hull: damage this step, events: [] }.
 */
export function stepFire(st, dt, rng, wet = false) {
    const out = { hull: 0, events: [] };
    const fires = st.fires;
    if (!fires.length) return out;
    for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i];
        f.age = (f.age || 0) + dt;
        // grows to full, then (with no fuel left nearby) slowly dies; the rain puts it out
        const life = wet ? 12 : 45;
        f.k = Math.min(1, f.k + DMG.FIRE_GROW * dt) * (f.age > life ? Math.exp(-dt / (wet ? 2 : 6)) : 1);
        if (wet) f.k -= dt * 0.08;
        if (f.k < 0.05) { fires.splice(i, 1); out.events.push({ k: 'out', f }); continue; }
        out.hull += DMG.FIRE_DPS * f.k * dt;
        // a burning sail
        if (f.sail) {
            const s = st.sails.find((x) => x.id === f.sail);
            if (s && s.burnt < 1) {
                s.burnt = Math.min(1, s.burnt + DMG.SAIL_BURN * f.k * dt * (wet ? 0.3 : 1));
                if (s.burnt >= 1) out.events.push({ k: 'burnt', sail: s.id });
            }
            if (!s || s.burnt >= 1) { fires.splice(i, 1); continue; }
        }
        // spreading: every SPREAD_T seconds a chance to catch something within SPREAD_R
        f.t = (f.t || 0) + dt;
        if (f.t >= DMG.SPREAD_T && fires.length < DMG.MAX_FIRES && f.k > 0.5) {
            f.t = 0;
            if (rng() < DMG.SPREAD_P * (wet ? 0.3 : 1)) {
                const a = rng() * Math.PI * 2, d = 2 + rng() * (DMG.SPREAD_R - 2);
                const nf = { lx: f.lx + Math.cos(a) * d * 0.5, ly: f.ly, lz: f.lz + Math.sin(a) * d, k: 0.2, age: 0 };
                // fire climbing into a sail above
                const sail = st.sails.find((s) => !s.burnt0 && s.burnt < 1 && s.open > 0.3 && Math.abs(s.center.z - f.lz) < 6 && !fires.some((x) => x.sail === s.id));
                if (sail && rng() < 0.4) { nf.sail = sail.id; nf.lx = sail.center.x; nf.ly = sail.center.y; nf.lz = sail.center.z; }
                fires.push(nf);
                out.events.push({ k: 'spread', f: nf });
            }
        }
    }
    return out;
}

/**
 * Sinking (st.flood ≥ 1): st.sinkY (how far the hull has settled), st.listSide (±1), st.sinkRoll,
 * st.sinkPitch. The deck goes under: flooded; the keel on the bottom: a wreck.
 * deckWorld(st) → the main deck's world y now; keelWorld(st) → the keel's world y; seabedY.
 */
export function stepSinking(st, cls, dt, seabedY, waterY) {
    if (st.wreck) return st;
    st.sinkT = (st.sinkT || 0) + dt;
    const v = DMG.SINK_V0 + (DMG.SINK_V1 - DMG.SINK_V0) * Math.min(1, st.sinkT / 40);
    st.sinkY = (st.sinkY || 0) + v * dt;
    const k = Math.min(1, st.sinkT / 25);
    st.sinkRoll = (st.listSide || 1) * DMG.LIST_MAX * k;
    st.sinkPitch = -DMG.PITCH_MAX * k;
    const dip = Math.abs(Math.sin(st.sinkPitch)) * cls.L * 0.5; // (bow down)
    const deckY = waterY + cls.deck - st.sinkY - dip;
    if (deckY < waterY - 0.3) st.flooded = true;
    const keel = waterY - cls.draft - st.sinkY - dip;
    if (keel <= seabedY + 0.3) { st.wreck = true; st.flooded = true; st.sinkY -= (seabedY + 0.3 - keel); }
    return st;
}
