/**
 * Small math helpers shared by every system. Pure functions only — safe to
 * import from Node unit tests (no THREE, no DOM).
 */

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
};

/** Shortest-path angle interpolation (radians). */
export function lerpAngle(current, target, step) {
    let diff = target - current;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return current + diff * step;
}

/** Wrap angle into (-PI, PI]. */
export function wrapAngle(a) {
    while (a <= -Math.PI) a += Math.PI * 2;
    while (a > Math.PI) a -= Math.PI * 2;
    return a;
}

/** Frame-rate independent exponential smoothing factor. */
export const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);

/** Deterministic PRNG (mulberry32). Same seed => same world on every client. */
export function createRng(seed) {
    let s = (seed >>> 0) || 1;
    const rng = () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = (min, max) => min + Math.floor(rng() * (max - min + 1));
    rng.range = (min, max) => min + rng() * (max - min);
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    return rng;
}

/** Hash a string to a 32-bit seed. */
export function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * Smooth 2D value noise (deterministic). Returns roughly [-1, 1].
 * Used for mountains — cheap and good enough for blocky terrain.
 */
export function createNoise2D(seed) {
    const perm = new Uint8Array(512);
    const rng = createRng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const values = new Float32Array(256);
    for (let i = 0; i < 256; i++) values[i] = rng() * 2 - 1;

    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const v = (ix, iz) => values[perm[(ix & 255) + perm[iz & 255]]];

    return (x, z) => {
        const ix = Math.floor(x), iz = Math.floor(z);
        const fx = x - ix, fz = z - iz;
        const u = fade(fx), w = fade(fz);
        const a = v(ix, iz), b = v(ix + 1, iz), c = v(ix, iz + 1), d = v(ix + 1, iz + 1);
        return lerp(lerp(a, b, u), lerp(c, d, u), w);
    };
}

/**
 * One Euro Filter — the standard low-latency jitter filter for tracking data.
 * Strong smoothing when still, almost no lag when moving fast.
 * (Casiez et al., CHI 2012)
 */
export class OneEuroFilter {
    constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.reset();
    }

    reset() {
        this.x = null;
        this.dx = 0;
        this.lastTime = null;
    }

    static alpha(cutoff, dt) {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dt);
    }

    filter(value, timeSec) {
        if (this.x === null || this.lastTime === null) {
            this.x = value;
            this.lastTime = timeSec;
            return value;
        }
        let dt = timeSec - this.lastTime;
        if (!(dt > 0)) dt = 1 / 30;
        if (dt > 0.5) { // long gap: restart instead of dragging old state
            this.x = value; this.dx = 0; this.lastTime = timeSec;
            return value;
        }
        this.lastTime = timeSec;
        const dxRaw = (value - this.x) / dt;
        this.dx += OneEuroFilter.alpha(this.dCutoff, dt) * (dxRaw - this.dx);
        const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
        this.x += OneEuroFilter.alpha(cutoff, dt) * (value - this.x);
        return this.x;
    }
}

/** Closest point parameter t∈[0,1] on segment AB to point P (plain {x,y,z}). */
export function closestTOnSegment(ax, ay, az, bx, by, bz, px, py, pz) {
    const vx = bx - ax, vy = by - ay, vz = bz - az;
    const len2 = vx * vx + vy * vy + vz * vz;
    if (len2 < 1e-12) return 0;
    return clamp01(((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / len2);
}

/**
 * Squared distance between two 3D segments (P0P1, Q0Q1).
 * Used for blade-vs-body hit tests. Arrays [x,y,z].
 */
export function segmentSegmentDistSq(p0, p1, q0, q1) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = q1[0] - q0[0], vy = q1[1] - q0[1], vz = q1[2] - q0[2];
    const wx = p0[0] - q0[0], wy = p0[1] - q0[1], wz = p0[2] - q0[2];
    const a = ux * ux + uy * uy + uz * uz;
    const b = ux * vx + uy * vy + uz * vz;
    const c = vx * vx + vy * vy + vz * vz;
    const d = ux * wx + uy * wy + uz * wz;
    const e = vx * wx + vy * wy + vz * wz;
    const D = a * c - b * b;
    let sN, sD = D, tN, tD = D;
    const EPS = 1e-9;
    if (D < EPS) {
        sN = 0; sD = 1; tN = e; tD = c;
    } else {
        sN = b * e - c * d;
        tN = a * e - b * d;
        if (sN < 0) { sN = 0; tN = e; tD = c; }
        else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
    }
    if (tN < 0) {
        tN = 0;
        if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; }
    } else if (tN > tD) {
        tN = tD;
        if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a; }
    }
    const sc = Math.abs(sN) < EPS ? 0 : sN / sD;
    const tc = Math.abs(tN) < EPS ? 0 : tN / tD;
    const dx = wx + sc * ux - tc * vx;
    const dy = wy + sc * uy - tc * vy;
    const dz = wz + sc * uz - tc * vz;
    return dx * dx + dy * dy + dz * dz;
}
