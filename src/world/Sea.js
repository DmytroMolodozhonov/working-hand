/**
 * Sea.js — the seas of a world (generation 2+) and their waves.
 *
 * Pure and deterministic (Node-testable, no THREE): every computer finds the
 * same seas for a seed, and every computer computes the same wave at the same
 * place and time. ONE wave function is used for everything — the drawn water
 * (the GLSL copy from `waveGlsl()`), swimming, things floating, the surfboard
 * and the ships.
 *
 * The world is cut into SEA.CELL × SEA.CELL squares; a square may hold one sea:
 * a big low basin around a centre whose shore is a noisy circle (radius
 * 380–640 m, wobbling by about a third), with 0–2 islands. Seas are rare and
 * never near spawn (the nearest shore is kilometres away).
 *
 * `signedDist(x, z)` is the key number: metres from the shore, > 0 in the sea,
 * < 0 on land. Depth (in water layers) and the size of the waves follow from it:
 * a sandy beach, a shallow shelf, then deep water (16 layers — far deeper than
 * any lake, which is at most 7).
 *
 * Waves: small near the shore, bigger further out.
 *   - Shore waves: crests parallel to the shore, running in towards the beach
 *     (≈4.5 m/s), 0.12 high at the waterline, up to 0.6 in the surf zone
 *     (30–80 m out), then fading under the open swell.
 *   - Open swell: three long waves crossing (70, 50 and 30 m long), up to 0.9
 *     high from 140 m out.
 *   Every frequency is a whole number of turns per WAVES.PERIOD seconds, so the
 *   wave clock (Game.seaTime) can wrap round without a jump.
 */

import { createNoise2D, createRng } from '../core/math.js';

export const SEA = {
    CELL: 2048, CHANCE: 0.42, MARGIN: 940, MIN_SPAWN: 1100,
    R_MIN: 380, R_MAX: 640, N: 512, // radius profile samples
    BEACH: 16, TAPER: 120, SHELF: 30, DEEP: 170, MAX_DEPTH: 16, ISLANDS: 2,
};

/** Cheap deterministic hash → [0, 1). */
function hash01(a, b, seed) {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

const TAU = Math.PI * 2;

export class SeaIndex {
    /**
     * @param {number} seed
     * @param {{x:number, z:number}|null} testShore the creative test ground (generation 3): a sea
     *   whose shore runs through this point (east–west, the sea to −z) — by its sea castle's quay
     */
    constructor(seed, testShore = null) {
        this.seed = seed;
        this.noise = createNoise2D((seed ^ 0x51ed270b) >>> 0);
        this.cells = new Map();
        this._last = null;
        this.test = null;
        if (testShore) {
            const R = 900; // (a big circle: along the castle's quay the shore is nearly straight)
            this.test = { id: 'seatest', gx: 0, gz: -1, x: testShore.x, z: testShore.z - R, r0: R, rMax: R, prof: new Float32Array(SEA.N).fill(R), islands: [] };
        }
    }

    /** The test sea when (x, z) is anywhere near it. */
    _testAt(x, z) {
        const t = this.test;
        return t && Math.abs(x - t.x) < t.rMax + SEA.TAPER + 300 && Math.abs(z - t.z) < t.rMax + SEA.TAPER + 300 ? t : null;
    }

    /**
     * The sea of a cell, or null. Deterministic.
     * {id, gx, gz, x, z, r0, rMax, prof: Float32Array(N), islands: [{x, z, r}]}
     */
    cellOf(gx, gz) {
        const key = gx * 65536 + gz;
        if (this.cells.has(key)) return this.cells.get(key);
        let sea = null;
        if (hash01(gx * 11 + 5, gz * 7 + 3, this.seed + 7001) < SEA.CHANCE) {
            const rng = createRng(((this.seed * 31) ^ Math.imul(gx, 7919) ^ Math.imul(gz, 104729) ^ 0x5ea5ea) >>> 0);
            const span = SEA.CELL - 2 * SEA.MARGIN;
            const x = gx * SEA.CELL + SEA.MARGIN + rng() * span;
            const z = gz * SEA.CELL + SEA.MARGIN + rng() * span;
            const r0 = SEA.R_MIN + rng() * (SEA.R_MAX - SEA.R_MIN);
            if (Math.hypot(x, z) - 1.4 * r0 - SEA.TAPER >= SEA.MIN_SPAWN) {
                const prof = new Float32Array(SEA.N);
                const cap = SEA.MARGIN - SEA.TAPER - 12; // never past the cell
                let rMax = 0;
                for (let i = 0; i < SEA.N; i++) {
                    const a = i / SEA.N * TAU, c = Math.cos(a), s = Math.sin(a);
                    const r = r0 * (1 + 0.24 * this.noise(c * 1.3 + gx * 7.1, s * 1.3 + gz * 3.3) + 0.09 * this.noise(c * 4 + 17 + gx, s * 4 - 9 + gz));
                    prof[i] = Math.max(SEA.R_MIN * 0.6, Math.min(cap, r));
                    if (prof[i] > rMax) rMax = prof[i];
                }
                const islands = [];
                const n = Math.floor(rng() * (SEA.ISLANDS + 1));
                for (let k = 0; k < n; k++) {
                    const a = rng() * TAU, d = r0 * (0.2 + rng() * 0.4);
                    islands.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, r: 30 + rng() * 50 });
                }
                sea = { id: 'sea' + gx + '_' + gz, gx, gz, x, z, r0, rMax, prof, islands };
            }
        }
        this.cells.set(key, sea);
        return sea;
    }

    /** The sea of the cell holding (x, z), or null. */
    seaAt(x, z) {
        const t = this._testAt(x, z);
        if (t) return t;
        const gx = Math.floor(x / SEA.CELL), gz = Math.floor(z / SEA.CELL);
        const l = this._last;
        if (l && l.gx === gx && l.gz === gz) return l.sea;
        const sea = this.cellOf(gx, gz);
        this._last = { gx, gz, sea };
        return sea;
    }

    /** Shore radius of a sea in direction `a` (radians, atan2(dz, dx)). */
    radiusAt(sea, a) {
        let f = (a / TAU) % 1;
        if (f < 0) f += 1;
        const p = f * SEA.N, i = Math.floor(p), t = p - i;
        return sea.prof[i % SEA.N] * (1 - t) + sea.prof[(i + 1) % SEA.N] * t;
    }

    /** > 0 inside the sea (metres from the shore), < 0 on land; −1e9 where no sea is near. */
    signedDist(x, z) {
        const sea = this.seaAt(x, z);
        if (!sea) return -1e9;
        const dx = x - sea.x, dz = z - sea.z;
        const d = Math.hypot(dx, dz);
        if (d > sea.rMax + 1000) return -1e9;
        let s = this.radiusAt(sea, Math.atan2(dz, dx)) - d;
        for (const i of sea.islands) s = Math.min(s, Math.hypot(x - i.x, z - i.z) - i.r);
        return s;
    }

    /** A point at signed distance `s` from the shore in direction `a` from the centre (tests, castles). */
    pointAt(sea, a, s) {
        const R = this.radiusAt(sea, a) - s;
        return { x: sea.x + Math.cos(a) * R, z: sea.z + Math.sin(a) * R };
    }

    /** Seas whose shore comes within `r` of a point, nearest first. */
    near(x, z, r) {
        const out = [];
        const g0x = Math.floor((x - r) / SEA.CELL), g1x = Math.floor((x + r) / SEA.CELL);
        const g0z = Math.floor((z - r) / SEA.CELL), g1z = Math.floor((z + r) / SEA.CELL);
        for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
            const sea = this.cellOf(gx, gz);
            if (sea && Math.hypot(sea.x - x, sea.z - z) - sea.rMax - SEA.TAPER <= r) out.push(sea);
        }
        const t = this.test;
        if (t && Math.hypot(t.x - x, t.z - z) - t.rMax - SEA.TAPER <= r) out.push(t);
        return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    }

    /** The nearest sea (by centre) searching rings of cells, or null. */
    nearest(x, z, maxCells = 6) {
        const cx = Math.floor(x / SEA.CELL), cz = Math.floor(z / SEA.CELL);
        let best = null, bd = Infinity;
        if (this.test) { best = this.test; bd = Math.hypot(best.x - x, best.z - z) - best.r0; }
        for (let R = 0; R <= maxCells; R++) {
            for (let gz = cz - R; gz <= cz + R; gz++) for (let gx = cx - R; gx <= cx + R; gx++) {
                if (Math.max(Math.abs(gx - cx), Math.abs(gz - cz)) !== R) continue;
                const sea = this.cellOf(gx, gz);
                if (!sea) continue;
                const d = Math.hypot(sea.x - x, sea.z - z) - sea.r0;
                if (d < bd) { bd = d; best = sea; }
            }
            if (best && bd < (R - 0.5) * SEA.CELL) break;
        }
        return best;
    }
}

/** Water layers at signed distance s (0 on land). */
export function seaDepth(s, jitter = 0) {
    if (s <= 0) return 0;
    if (s <= 6) return 1;
    if (s <= SEA.SHELF) return 1 + Math.round((s - 6) / (SEA.SHELF - 6) * 2);
    return Math.max(3, Math.min(SEA.MAX_DEPTH, 3 + Math.round((s - SEA.SHELF) / (SEA.DEEP - SEA.SHELF) * (SEA.MAX_DEPTH - 3)) + jitter));
}

// ------------------------------------------------------------------ waves
const PERIOD = 600; // s: every wave repeats exactly within it (the clock may wrap)
const om = (turns) => TAU * turns / PERIOD; // an angular frequency of whole turns per PERIOD

export const WAVES = {
    PERIOD,
    ampShore: 0.12, // at the waterline
    ampSurf: 0.6, // shore waves in the surf zone
    surfAt: 40, // m out: the surf zone is fully grown
    surfFade: [70, 190], // m out: the shore waves fade into the swell
    ampOpen: 0.9, openAt: 140, storm: 0.8,
    // open swell: [kx, kz, ω, φ, weight] (Σ weight = 1)
    open: [[0.090, 0.040, om(91), 0.0, 0.55], [-0.050, 0.110, om(115), 1.7, 0.30], [0.170, -0.130, om(181), 4.1, 0.15]],
    // shore waves: crests parallel to the shore, running in (phase = k·s + ω·t → crests move to smaller s)
    shore: { k: 0.22, omega: om(159) }, // λ ≈ 28.6 m, ≈ 4.5 m/s
};

const smooth01 = (v) => { const k = v < 0 ? 0 : v > 1 ? 1 : v; return k * k * (3 - 2 * k); };

/** Height of the shore waves (their envelope) at signed distance s. */
export function shoreAmp(s) {
    if (s <= -2) return 0;
    const rise = smooth01((s + 2) / (WAVES.surfAt + 2));
    const fade = 1 - 0.75 * smooth01((s - WAVES.surfFade[0]) / (WAVES.surfFade[1] - WAVES.surfFade[0]));
    return (WAVES.ampShore + (WAVES.ampSurf - WAVES.ampShore) * rise) * fade;
}
/** How much of the open swell reaches s (0 at the shore … 1 out at sea). */
export function openAmp(s) {
    if (s <= -2) return 0;
    return WAVES.ampOpen * smooth01(s / WAVES.openAt);
}
/** The wave envelope (how high waves get) at signed distance s; 0 on land. */
export function waveAmp(s, storm = 0) {
    if (s <= -2) return 0;
    return (shoreAmp(s) + openAmp(s)) * (1 + WAVES.storm * storm);
}

/** The sea surface's height above WATER_LEVEL_Y at (x, z), time t (s), signed distance s. */
export function seaWaveHeight(x, z, t, s, storm = 0) {
    if (s <= -2) return 0;
    let swell = 0;
    for (const [kx, kz, w, p, a] of WAVES.open) swell += a * Math.sin(kx * x + kz * z - w * t + p);
    const shore = Math.sin(WAVES.shore.k * s + WAVES.shore.omega * t);
    return (shoreAmp(s) * shore + openAmp(s) * swell) * (1 + WAVES.storm * storm);
}

/** The same wave as GLSL: `float seaWave(vec2 p, float t, float s, float storm)` (numbers from WAVES). */
export function waveGlsl() {
    const f = (v) => { const s = String(+v.toFixed(7)); return s.includes('.') || s.includes('e') ? s : s + '.0'; };
    const sw = WAVES.open.map(([kx, kz, w, p, a]) => `sw += ${f(a)} * sin(${f(kx)} * p.x + ${f(kz)} * p.y - ${f(w)} * t + ${f(p)});`).join('\n    ');
    return /* glsl */ `
float seaSmooth01(float v) { float k = clamp(v, 0.0, 1.0); return k * k * (3.0 - 2.0 * k); }
float seaShoreAmp(float s) {
    if (s <= -2.0) return 0.0;
    float rise = seaSmooth01((s + 2.0) / ${f(WAVES.surfAt + 2)});
    float fade = 1.0 - 0.75 * seaSmooth01((s - ${f(WAVES.surfFade[0])}) / ${f(WAVES.surfFade[1] - WAVES.surfFade[0])});
    return (${f(WAVES.ampShore)} + ${f(WAVES.ampSurf - WAVES.ampShore)} * rise) * fade;
}
float seaOpenAmp(float s) { return s <= -2.0 ? 0.0 : ${f(WAVES.ampOpen)} * seaSmooth01(s / ${f(WAVES.openAt)}); }
float seaWave(vec2 p, float t, float s, float storm) {
    if (s <= -2.0) return 0.0;
    float sw = 0.0;
    ${sw}
    float sh = sin(${f(WAVES.shore.k)} * s + ${f(WAVES.shore.omega)} * t);
    return (seaShoreAmp(s) * sh + seaOpenAmp(s) * sw) * (1.0 + ${f(WAVES.storm)} * storm);
}
`;
}

/**
 * The sea of a game as one object (`game.sea`): where the sea is, and its
 * waves at any place and time. Used by swimming, the surfboard and the ships.
 *
 *   sea.time()                       wave clock (s), the same on every computer
 *   sea.s(x, z)                      signed distance from the shore as the WATER sees it
 *                                    (a castle harbour is sea, reclaimed quays are land)
 *   sea.height(x, z, t?)             surface height above WATER_LEVEL_Y (0 off the sea)
 *   sea.sample(x, z, t, out)         {h, gx, gz, vx, vz, c, dx, dz, breaking, depth, s} or null off the sea
 *   sea.beachesNear(x, z, r)         [{x, z, yaw, s}] dry sand spots facing the sea
 */
export class SeaWaves {
    /**
     * @param {SeaIndex} index
     * @param {() => number} timeFn  wave clock (s)
     * @param {(ix, iz) => boolean|string|null} [column] what the terrain made of a column: true sea water,
     *   'harbour' a castle's harbour (calm), false land
     */
    constructor(index, timeFn, column = null) {
        this.index = index;
        this._time = timeFn;
        this.column = column;
        this.storm = 0;
    }

    time() { return this._time ? this._time() : 0; }

    s(x, z) {
        let s = this.index.signedDist(x, z);
        if (this.column && s > -SEA.TAPER) {
            const c = this.column(Math.round(x), Math.round(z));
            if (c === 'harbour') s = Math.min(Math.max(s, 2), 5); // a castle's harbour: calm water behind the breakwater
            else if (c === true && s < 2) s = 2; // a dug harbour: sea water
            else if (c === false && s > -3.5) s = -3.5; // a quay / castle land over the sea
        }
        return s;
    }

    height(x, z, t = this.time()) {
        const s = this.s(x, z);
        return s <= -2 ? 0 : seaWaveHeight(x, z, t, s, this.storm);
    }

    sample(x, z, t = this.time(), o = {}) {
        const s = this.s(x, z);
        if (s <= -2) return null;
        const e = 0.5;
        const st = this.storm;
        o.s = s;
        o.h = seaWaveHeight(x, z, t, s, st);
        const sxp = this.s(x + e, z), sxm = this.s(x - e, z), szp = this.s(x, z + e), szm = this.s(x, z - e);
        o.gx = (seaWaveHeight(x + e, z, t, sxp, st) - seaWaveHeight(x - e, z, t, sxm, st)) / (2 * e);
        o.gz = (seaWaveHeight(x, z + e, t, szp, st) - seaWaveHeight(x, z - e, t, szm, st)) / (2 * e);
        // towards the shore = where s gets smaller
        let dx = -(sxp - sxm), dz = -(szp - szm);
        const dl = Math.hypot(dx, dz);
        if (dl > 1e-6) { dx /= dl; dz /= dl; } else { dx = 1; dz = 0; }
        // the dominant wave: the shore waves near the beach, the main swell out at sea
        const sh = shoreAmp(s), op = openAmp(s);
        const [kx, kz, w] = WAVES.open[0];
        const k0 = Math.hypot(kx, kz);
        if (sh >= op * WAVES.open[0][4]) {
            o.c = WAVES.shore.omega / WAVES.shore.k; o.dx = dx; o.dz = dz;
            const om0 = WAVES.shore.omega;
            o.vx = o.h * om0 * dx; o.vz = o.h * om0 * dz;
        } else {
            o.c = w / k0; o.dx = kx / k0; o.dz = kz / k0;
            o.vx = o.h * w * o.dx; o.vz = o.h * w * o.dz;
        }
        o.depth = Math.max(seaDepth(s), s > 0 ? 1 : 0);
        // whitewater where the little waves run up the beach
        const crest = Math.sin(WAVES.shore.k * s + WAVES.shore.omega * t);
        o.breaking = s < 10 && crest > 0.5 ? (1 - Math.max(0, s) / 10) * (crest - 0.5) * 2 : 0;
        return o;
    }

    /** Dry sand spots (beach) facing the sea within r of a point. */
    beachesNear(x, z, r) {
        const out = [];
        for (const sea of this.index.near(x, z, r)) {
            const n = Math.max(16, Math.round(sea.r0 * TAU / 16));
            for (let i = 0; i < n; i++) {
                const a = i / n * TAU;
                const p = this.index.pointAt(sea, a, -6);
                if (Math.hypot(p.x - x, p.z - z) > r) continue;
                if (this.s(p.x, p.z) > -4) continue; // (in a harbour or under a quay)
                if (Math.abs(this.index.signedDist(p.x, p.z) + 6) > 3) continue; // (an island in the way)
                // facing the sea: towards the centre
                out.push({ x: p.x, z: p.z, s: -6, yaw: Math.atan2(-(sea.x - p.x), -(sea.z - p.z)), sea: sea.id });
            }
        }
        return out;
    }
}
