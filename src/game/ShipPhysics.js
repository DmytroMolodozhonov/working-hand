/**
 * ShipPhysics.js — how a heavy ship moves (pure, Node-testable).
 *
 * The state (per ship): world x, z, yaw; body-frame speeds u (forward), v (to
 * starboard), r (yaw rate, + = turning to port); the wheel angle; the wind of
 * the spells on the sails (spellWind, dying down with time constant tau).
 * Sails give thrust from the apparent wind (the yards are braced round, so
 * they help up to ~110° off the stern; a wind from ahead pushes them aback),
 * the water drags (heavy ships speed up and slow down slowly), the rudder only
 * turns a ship that moves. Mooring lines are springs; the hull stops on the
 * ground (and is damaged by a hard hit).
 */

import { HELM_LOCK } from './ShipTypes.js';

export const RUDDER_MAX = 0.61; // ±35°

/** Thrust of the sails per unit mass in the body frame. */
export function sailForce(cls, openFrac, along, across) {
    const va2 = along * along + across * across;
    if (!(va2 > 1e-8) || !(openFrac > 0)) return { Fu: 0, Fv: 0, N: 0 };
    const ang = Math.atan2(across, along); // 0: the wind blows from astern (pushes forward)
    const co = Math.cos(ang);
    const eff = Math.max(0, (co + 0.35) / 1.35);
    const aback = co < -0.5 ? -(-co - 0.5) : 0;
    const q = cls.sailK * openFrac * va2;
    // the lateen mizzen gives only a little weather helm: the hull's lateral resistance and the rudder hold
    // her (it used to out-turn the rudder itself and spun a ship with the wheel amidships)
    const N = Math.max(-0.001, Math.min(0.001, 0.02 * q * (cls.lateenFrac || 0) * Math.sin(ang)));
    return { Fu: q * (eff + aback), Fv: q * 0.3 * Math.sin(ang) * Math.max(eff, 0.2), N };
}

/** The spells' wind dies down. */
export function decayWind(st, h) {
    if (!st.spellWind) return;
    const tau = st.tau || 30;
    if (!isFinite(tau)) return;
    const k = Math.exp(-h / tau);
    st.spellWind.x *= k;
    st.spellWind.z *= k;
    if (Math.abs(st.spellWind.x) < 1e-3 && Math.abs(st.spellWind.z) < 1e-3) { st.spellWind.x = 0; st.spellWind.z = 0; }
}

/**
 * Mooring lines: springs from the bollards (world) to the bitts (ship-local).
 * Returns body-frame accelerations and a yaw acceleration; marks a line's strain.
 */
export function mooringForces(st, cls, lines, h = 0) {
    const out = { u: 0, v: 0, r: 0 };
    if (!lines || !lines.length) return out;
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    const I = (cls.L * cls.L) / 12;
    for (const ln of lines) {
        if (ln.state !== 'tied') continue;
        // the bitt in the world
        const bx = st.x + ln.bitt.x * c + ln.bitt.z * s;
        const bz = st.z - ln.bitt.x * s + ln.bitt.z * c;
        const dx = ln.bollard.x - bx, dz = ln.bollard.z - bz;
        const d = Math.hypot(dx, dz);
        const stretch = d - ln.L0;
        if (stretch <= 0 || d < 1e-6) { ln.strain = 0; ln.over = 0; continue; }
        const k = 0.1; // per metre (per unit mass)
        const F = k * stretch;
        // a line snaps after more than 3 s at a pull above 0.3
        ln.strain = F;
        ln.over = F > 0.3 ? (ln.over || 0) + h : 0;
        if (ln.over > 3) { ln.state = 'snapped'; ln.strain = 0; continue; }
        const fx = (dx / d) * F, fz = (dz / d) * F;
        // world → body: forward (−s, −c), starboard (c, −s)
        out.u += fx * -s + fz * -c;
        out.v += fx * c + fz * -s;
        // torque about the centre (local): τ = lz·Fx_local − lx·Fz_local, yaw + = port
        const lfx = fx * c - fz * s, lfz = fx * s + fz * c;
        out.r += (ln.bitt.z * lfx - ln.bitt.x * lfz) / I;
        // a taut line also holds the drift: damping along it
        out.u -= 0.08 * st.u * Math.min(1, F * 10);
        out.v -= 0.08 * st.v * Math.min(1, F * 10);
    }
    return out;
}

/** Hull sample points (ship-local) for the ground: the keel line and the waterline ring. */
export function hullSamples(cls) {
    const pts = [];
    const L = cls.L, B = cls.B;
    for (let i = 0; i <= 6; i++) {
        const lz = -L / 2 + 1 + (L - 2) * i / 6;
        const t = (2 * lz) / L;
        pts.push({ x: 0, y: -cls.draft * (1 - 0.4 * Math.pow(Math.abs(t), 4)) + 0.3, z: lz });
    }
    for (let i = 1; i <= 4; i++) {
        const lz = -L / 2 + L * i / 5;
        const t = (2 * lz) / L;
        const w = t < 0 ? (B / 2) * (1 - Math.pow(-t, 2.2)) : (B / 2) * (1 - 0.4 * Math.pow(t, 4));
        pts.push({ x: w * 0.92, y: -0.4, z: lz }, { x: -w * 0.92, y: -0.4, z: lz });
    }
    pts.push({ x: 0, y: 0, z: -L / 2 - 0.5 }); // the stem at the waterline
    return pts;
}

/**
 * The hull against the ground (solidAt(x, y, z) → true for rock / sand / a pier): the ship stops,
 * bounces a little and is damaged by a hard hit ((|vn| − 1.5)·12).
 */
export function groundContacts(st, cls, solidAt, h, onHit) {
    if (!solidAt) return;
    const pts = st._samples || (st._samples = hullSamples(cls));
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    const fx = -s, fz = -c, rx = c, rz = -s;
    const vx = fx * st.u + rx * st.v, vz = fz * st.u + rz * st.v;
    let nx = 0, nz = 0, hits = 0, torque = 0;
    for (const p of pts) {
        const wx = st.x + p.x * c + p.z * s, wz = st.z - p.x * s + p.z * c;
        const wy = (st.y0 ?? 0) + p.y;
        if (!solidAt(wx, wy, wz)) continue;
        // the way out: from the point back towards the ship's centre line, against the motion
        const px = p.x * c + p.z * s, pz = -p.x * s + p.z * c;
        const len = Math.hypot(px, pz) || 1;
        const ox = -px / len, oz = -pz / len;
        nx += ox; nz += oz; hits++;
        torque += p.z;
    }
    if (!hits) { st.aground = false; return; }
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    const vn = vx * nx + vz * nz; // < 0: moving into the ground
    if (vn < 0) {
        const e = 0.2;
        const dvx = -(1 + e) * vn * nx, dvz = -(1 + e) * vn * nz;
        const nvx = vx + dvx, nvz = vz + dvz;
        st.u = nvx * fx + nvz * fz;
        st.v = nvx * rx + nvz * rz;
        if (-vn > 1.5 && onHit) onHit(Math.round((-vn - 1.5) * 12), -vn);
        // pushed back out of the ground
        st.x += nx * Math.min(0.5, -vn * h + 0.05);
        st.z += nz * Math.min(0.5, -vn * h + 0.05);
    } else {
        st.x += nx * 0.03;
        st.z += nz * 0.03;
    }
    st.u *= Math.max(0, 1 - 2 * h);
    st.v *= Math.max(0, 1 - 2 * h);
    st.r *= Math.max(0, 1 - 3 * h);
    void torque;
    st.aground = true;
}

/**
 * One step of a ship (fixed 1/30 s sub-steps).
 * env: { wind: {x,z}, openFrac, moorings, solidAt, onHit }
 */
export function stepShip(st, cls, env, dt) {
    const H = 1 / 30;
    for (let t = 0; t < dt - 1e-9; t += H) sub(Math.min(H, dt - t));
    function sub(h) {
        const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
        const fx = -s, fz = -c, rx = c, rz = -s; // forward, starboard (world)
        const sw = st.spellWind || { x: 0, z: 0 };
        // the spells' wind drives her ahead along her own course (the yards braced to it): it turns with her.
        // (left behind in the world it became a cross wind in a turn that pushed the stern round further —
        // the ship skidded and kept spinning)
        const swm = Math.hypot(sw.x, sw.z);
        if (swm > 0) { const m = sw.x * fx + sw.z * fz >= 0 ? swm : -swm; sw.x = fx * m; sw.z = fz * m; }
        const Wx = (env.wind?.x || 0) + sw.x, Wz = (env.wind?.z || 0) + sw.z;
        const vx = fx * st.u + rx * st.v, vz = fz * st.u + rz * st.v;
        const ax = Wx - vx, az = Wz - vz; // apparent wind (where it blows to)
        const along = ax * fx + az * fz, across = ax * rx + az * rz;
        const F = sailForce(cls, env.openFrac || 0, along, across);
        const M = mooringForces(st, cls, env.moorings, h);
        const delta = RUDDER_MAX * Math.max(-1, Math.min(1, (st.wheel || 0) / HELM_LOCK));
        // above its hull speed a ship drags its own bow wave: it can't be driven much faster, however hard the wind
        const uh = 0.9 * Math.sqrt(cls.L) * (cls.hullK || 1), over = Math.abs(st.u) - uh; // (hullK: the black ship's cursed keel cuts its own bow wave)
        const wave = over > 0 ? 0.02 * over * over * Math.sign(st.u) : 0;
        st.u += (F.Fu + M.u - cls.c1 * st.u - cls.c2 * st.u * Math.abs(st.u) - wave) * h;
        st.v += (F.Fv + M.v - 10 * (cls.c1 * st.v + cls.c2 * st.v * Math.abs(st.v))) * h;
        // wheel > 0 (clockwise) → the bow goes to starboard → yaw decreases. The rudder turns the ship
        // towards a rate u·δ/turnR (the same turning circle at any speed, like a real hull), the yaw
        // follows it with inertia — quicker the faster she goes; amidships the yaw dies out: she holds her course
        const want = -st.u * (delta / RUDDER_MAX) / cls.turnR;
        const follow = cls.yawD1 * (1 + Math.abs(st.u) / 4);
        st.r += ((want - st.r) * follow + F.N + M.r) * h;
        if (st.forced) {
            if (st.forced.u != null) st.u = st.forced.u;
            if (st.forced.r != null) st.r = st.forced.r;
        }
        st.x += (fx * st.u + rx * st.v) * h;
        st.z += (fz * st.u + rz * st.v) * h;
        st.yaw += st.r * h;
        groundContacts(st, cls, env.solidAt, h, env.onHit);
        decayWind(st, h);
    }
    return st;
}

/**
 * Heave, roll and pitch from the water surface under the hull (sample(lx, lz) → height),
 * followed slowly (heavier ships lag more); heelFv adds a heel from the sails' side push.
 */
export function waveResponse(st, cls, sample, dt, heel = 0) {
    const L = cls.L, B = cls.B;
    let hb = 0, hs = 0, hp = 0, hst = 0, hc = 0;
    if (sample) {
        hb = sample(0, -L * 0.4); hs = sample(0, L * 0.4);
        hp = sample(-B * 0.45, 0); hst = sample(B * 0.45, 0); hc = sample(0, 0);
    }
    const heave = (hb + hs + hp + hst + hc) / 5;
    const pitch = Math.atan2(hb - hs, 0.8 * L);
    const roll = Math.atan2(hst - hp, 0.9 * B) + heel;
    const k = Math.min(1, dt / cls.waveLag);
    st.heave = (st.heave || 0) + (heave - (st.heave || 0)) * k;
    st.pitch = (st.pitch || 0) + (pitch - (st.pitch || 0)) * k;
    st.roll = (st.roll || 0) + (roll - (st.roll || 0)) * k;
    return st;
}

/** A new physics state for a ship at rest. */
export function newShipState(x, z, yaw) {
    return { x, z, yaw, u: 0, v: 0, r: 0, wheel: 0, spellWind: { x: 0, z: 0 }, tau: 30, heave: 0, roll: 0, pitch: 0, forced: null, aground: false };
}
