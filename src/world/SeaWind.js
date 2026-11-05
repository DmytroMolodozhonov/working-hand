/**
 * SeaWind.js — the world's wind as one system (the author: «ветер как система, волны 10 уровней по ветру и месту»).
 *
 * Pure and deterministic (no THREE, Node-testable): the wind at a moment is a function of the world's seed and the clock — Game feeds
 * the real clock (Date.now()/1000, the same on every computer to a second; a night slept through or a save loaded never makes the
 * wind jump) — so every computer feels the same wind without a packet.
 *
 *   windAt(seed, t)  → {dir, speed, level, gust}   dir: radians (where it blows TO, atan2(z, x)), speed m/s, level 0…9
 *   waveFactor(level)                              how high the sea's waves are against the old fixed sea (level 5 = 1)
 *   seaLevelAt(level, s, harbour)                  the waves' level at a place: the open sea feels the whole wind, the shore
 *                                                  less (the waves are also smaller there by Sea.js's own envelope), a harbour
 *                                                  behind its breakwater hardly any
 *
 * The weather drifts slowly: a calm day, a fresh breeze, now and then a gale; a storm (8–9) is rare and lasts minutes, not hours.
 * Levels follow the Beaufort scale shortened to ten steps (LEVELS: the upper wind speed of each, m/s).
 */

export const WIND = {
    // upper m/s of each level: 0 calm … 9 a storm
    LEVELS: [0.8, 2.5, 4.5, 6.8, 9.5, 12.5, 16, 20, 24.5, Infinity],
    NAMES: ['штиль', 'тихий ветер', 'лёгкий ветер', 'слабый ветер', 'умеренный ветер', 'свежий ветер', 'сильный ветер', 'крепкий ветер', 'шторм', 'сильный шторм'],
    // how high the waves get per level (× the old sea's waves, which were made for a fresh breeze)
    WAVE: [0.22, 0.32, 0.45, 0.62, 0.82, 1.0, 1.3, 1.7, 2.25, 2.9],
    STORM_AT: 8, // from this level: storm clouds, rain, lightning and waterspouts over the sea (OceanStorm.js)
};

const TAU = Math.PI * 2;

/** A cheap deterministic hash → [0, 1). */
function h01(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** Smooth value noise of time (cosine between knots every `step` s), one stream per `k`. */
function drift(seed, k, t, step) {
    const u = t / step, i = Math.floor(u), f = u - i;
    const a = h01(seed + k * 7919, i), b = h01(seed + k * 7919, i + 1);
    const w = (1 - Math.cos(f * Math.PI)) / 2;
    return a + (b - a) * w;
}

/** The level (0…9) of a wind speed (m/s). */
export function windLevel(speed) {
    for (let i = 0; i < WIND.LEVELS.length; i++) if (speed < WIND.LEVELS[i]) return i;
    return 9;
}

/**
 * The wind at world time t (s). The weather: a slow «mood» (every ~20 min) and a quicker swing (every ~4 min); a gale only when both
 * are high, a storm only rarely (≈ 4–6 % of the time), a calm sometimes. Gusts: a few seconds' swell over the mean.
 */
export function windAt(seed, t, out = {}) {
    seed = seed | 0;
    const mood = drift(seed, 1, t, 1200), swing = drift(seed, 2, t, 240), gustN = drift(seed, 3, t, 7);
    // the mean speed: mostly 2–9 m/s, a gale when the mood is wild, a storm at its very top
    const m = Math.pow(mood, 1.6) * 0.75 + swing * 0.25; // 0…1, skewed to calm
    let speed = 1.2 + m * 17;
    if (m > 0.68) speed += (m - 0.68) * 75; // (the wild weather climbs fast: a storm 25+ m/s)
    speed = Math.max(0, speed);
    const gust = speed * 0.25 * (gustN - 0.5) * 2; // ±25 %
    // the direction: veers slowly (a full turn takes hours), wobbles a little
    const dir = (drift(seed, 4, t, 3000) * TAU * 3 + (drift(seed, 5, t, 90) - 0.5) * 0.5) % TAU;
    out.dir = dir;
    out.speed = speed;
    out.gust = gust;
    out.level = windLevel(speed);
    out.x = Math.cos(dir) * speed;
    out.z = Math.sin(dir) * speed;
    return out;
}

/** How high the sea's waves are at a level (× the old fixed sea). */
export function waveFactor(level) {
    const L = Math.max(0, Math.min(9, level));
    const i = Math.floor(L), f = L - i;
    return i >= 9 ? WIND.WAVE[9] : WIND.WAVE[i] + (WIND.WAVE[i + 1] - WIND.WAVE[i]) * f;
}

/**
 * The waves' level at a place: s — metres from the shore (Sea.signedDist, > 0 in the sea); a harbour behind its breakwater — at most 1.
 * The shore's shallow water breaks the sea down by up to three levels (the fetch is short and the bottom takes the swell).
 */
export function seaLevelAt(level, s, harbour = false) {
    if (harbour) return Math.min(level, 1);
    if (s <= 0) return 0;
    const shelter = s < 140 ? 3 * (1 - s / 140) : 0;
    return Math.max(0, level - shelter);
}

/** Sea.js's `storm` number (it multiplies the waves by 1 + 0.8·storm) for a level (fractional allowed). */
export function stormOf(level) {
    return (waveFactor(level) - 1) / 0.8;
}

/** The level as a smooth number (5.4 — between 5 and 6): the waves grow without steps as the wind rises. */
export function windLevelSmooth(speed) {
    const L = WIND.LEVELS;
    for (let i = 0; i < L.length; i++) {
        if (speed < L[i]) { const lo = i ? L[i - 1] : 0; return i === 9 ? 9 : i + (speed - lo) / (L[i] - lo); }
    }
    return 9;
}
