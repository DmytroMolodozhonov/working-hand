/**
 * OceanWeather.js — the storms over the sea (the author: «грозы и смерчи над океаном»): where and when lightning strikes the sea and
 * where the waterspouts walk. Pure and deterministic (no THREE, Node-testable): from the world's seed, the sea and the real clock —
 * every computer sees the same bolts and the same spouts without a packet (the host alone does the harm to the creatures and ships).
 *
 * The weather is SeaWind.js's: a storm (level ≥ WIND.STORM_AT) over a sea brings
 *   - lightning into the sea: every second a chance (≈ one bolt in 4 s over a sea at a full storm), anywhere 15 m and more off
 *     the shore; a ship near the bolt draws it to her masts (OceanStorm.js);
 *   - waterspouts: every SLOT seconds 0–2 are born out at sea (where the water is deep), live LIFE s (they grow, stand, fade),
 *     walk with the wind (~SPEED m/s, swaying), and die where they reach the shore's shallows.
 * A spout is born only in the storm, but once born lives its life out (a storm that is passing still has its spout).
 */

import { windAt, windLevelSmooth, WIND } from './SeaWind.js';

export const OCEAN = {
    SLOT: 120, // s: a spout's birth window
    LIFE: [70, 130], // s a spout lives
    GROW: 12, FADE: 15, // s
    SPEED: 5, // m/s it walks with the wind
    SWAY: 22, // m it swings off its line
    MIN_S: 90, // m off the shore it is born (deep water)
    DIE_S: 22, // m off the shore: it falls apart in the shallows
    R: 6, // m: its core (the water lifted)
    PULL: 38, // m: the wind round it pulls and swirls
    HEIGHT: 140, // m up into the cloud
    BOLT_P: 0.25, // a bolt's chance a second over a sea at a full storm
    BOLT_MIN_S: 15,
};

const TAU = Math.PI * 2;

function h01(a, b, c, d) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519) + Math.imul(d | 0, 3266489917)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** How stormy (0…1) the natural wind is at time t: 0 under level 7.5, 1 from 8.5. */
export function stormWeight(seed, t) {
    const L = windLevelSmooth(windAt(seed, t, _w).speed);
    return Math.max(0, Math.min(1, L - (WIND.STORM_AT - 0.5)));
}
const _w = {};

/**
 * The waterspouts of a sea at time t: [{id, x, z, k (0…1 how strong), born, life}]. `index`: SeaIndex (signedDist, pointAt).
 */
export function spoutsOf(index, sea, seed, t, out = []) {
    out.length = 0;
    const i1 = Math.floor(t / OCEAN.SLOT), i0 = Math.floor((t - OCEAN.LIFE[1]) / OCEAN.SLOT);
    for (let i = i0; i <= i1; i++) {
        const n = h01(sea.gx, sea.gz, i, seed);
        const count = n < 0.35 ? 0 : n < 0.8 ? 1 : 2;
        for (let j = 0; j < count; j++) {
            const r = (q) => h01(sea.gx * 31 + j * 7 + q, sea.gz * 17 + q, i, seed + 991);
            const born = i * OCEAN.SLOT + r(1) * OCEAN.SLOT * 0.8;
            const life = OCEAN.LIFE[0] + r(2) * (OCEAN.LIFE[1] - OCEAN.LIFE[0]);
            const age = t - born;
            if (age < 0 || age > life) continue;
            if (stormWeight(seed, born) < 0.5) continue; // (born only in a storm)
            const a = r(3) * TAU;
            const p0 = index.pointAt(sea, a, OCEAN.MIN_S + r(4) * Math.max(10, sea.r0 * 0.45));
            if (index.signedDist(p0.x, p0.z) < OCEAN.MIN_S * 0.7) continue; // (an island there)
            const wb = windAt(seed, born, _w);
            const dx = Math.cos(wb.dir), dz = Math.sin(wb.dir);
            const sway = Math.sin(age / 17 + r(5) * TAU) * OCEAN.SWAY;
            const x = p0.x + dx * OCEAN.SPEED * age - dz * sway, z = p0.z + dz * OCEAN.SPEED * age + dx * sway;
            const sd = index.signedDist(x, z);
            if (sd < OCEAN.DIE_S - 8) continue;
            const shore = Math.max(0, Math.min(1, (sd - (OCEAN.DIE_S - 8)) / 10));
            const k = Math.min(1, age / OCEAN.GROW, (life - age) / OCEAN.FADE) * shore;
            out.push({ id: `${sea.id}:${i}:${j}`, x, z, k: Math.max(0, k), born, life, spin: r(6) < 0.5 ? 1 : -1 });
        }
    }
    return out;
}

/**
 * The bolts that strike a sea in [t0, t1): [{id, t, x, z}] (a second each, at most a few a call).
 */
export function boltsOf(index, sea, seed, t0, t1, out = []) {
    out.length = 0;
    for (let s = Math.floor(t0); s < t1 && out.length < 4; s++) {
        if (s < t0) continue;
        const p = OCEAN.BOLT_P * stormWeight(seed, s);
        if (p <= 0 || h01(sea.gx, sea.gz, s, seed + 4441) >= p) continue;
        const a = h01(sea.gx + 3, sea.gz, s, seed + 4442) * TAU;
        const q = index.pointAt(sea, a, OCEAN.BOLT_MIN_S + h01(sea.gx, sea.gz + 5, s, seed + 4443) * sea.r0 * 0.9);
        if (index.signedDist(q.x, q.z) < OCEAN.BOLT_MIN_S) continue;
        out.push({ id: `${sea.id}:b${s}`, t: s, x: q.x, z: q.z });
    }
    return out;
}

/**
 * What a spout does to a body at (x, y, z) (y: metres above the water): {vx, vy, vz} — the wind's swirl round it, a pull in, and in
 * the core a lift; null when out of its reach. `spin` ±1: which way it turns.
 */
export function spoutPush(sp, x, y, z, out = {}) {
    const dx = x - sp.x, dz = z - sp.z, d = Math.hypot(dx, dz);
    if (d > OCEAN.PULL || y > OCEAN.HEIGHT * 0.5 || sp.k <= 0.05) return null;
    const ux = d > 1e-3 ? dx / d : 1, uz = d > 1e-3 ? dz / d : 0;
    const near = 1 - d / OCEAN.PULL; // 0 at the edge … 1 at the core
    const swirl = sp.k * (6 + 22 * near * near) * sp.spin; // m/s round
    const pull = sp.k * (2 + 10 * near * near); // m/s in
    out.vx = -uz * swirl - ux * pull;
    out.vz = ux * swirl - uz * pull;
    out.vy = d < OCEAN.R * 1.6 ? sp.k * (14 + 10 * (1 - d / (OCEAN.R * 1.6))) : 0; // (the core lifts)
    out.core = d < OCEAN.R;
    out.near = near;
    return out;
}
