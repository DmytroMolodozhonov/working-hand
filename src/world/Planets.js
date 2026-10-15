/**
 * Planets.js — the Solar System of the game: the one shared list of planets (the registry).
 * Pure (no THREE): the game, the terrain worker and the tests use it alike.
 *
 * ── API for the other «Космос» sessions (the Gods' temple on Venus, the planet spells) ─────────
 *
 *   import { PLANETS, SPACE, PlanetRegistry, planetPosition, realmAt, slotRect,
 *            surfaceToDir, dirToSurface, earthToDir, dirToEarth } from '../world/Planets.js';
 *
 *   game.space.planets  — the PlanetRegistry of this game (the host decides it; saved with the world):
 *       .list / .get(id) / .rocky()            every body: {id, name, kind, radius, orbit, gravity, air, …}
 *       .clusters                              the meteor clusters (скопления метеоритов) of the belts:
 *                                              {id, a, period, phase, incl, r, count, used} — «Create a planet»
 *                                              turns one into a planet (mark it `used`)
 *       .add(def) → id                         a new planet (created by a player): {name, a, radius, color, …,
 *                                              created: playerName}; gets a seed and a surface slot of its own
 *       .update(id, patch)                     radius ×1.3 («Увеличить планету»), {terraformed: true, …}
 *                                              («Терраформировать»), {orbit: {…}} («Wingardium Leviosa Super Maxima»)
 *       .onChange(fn)                          called after any add / update / apply (the view rebuilds it)
 *   game.space.change(id, patch) / game.space.create(def)   the same from a spell: the host applies it,
 *                                              a guest asks the host; every computer and the save get it
 *   planetPosition(def, t, out, reg)           where a body is at the shared time t (s): heliocentric, space units
 *   realmAt(x, y, z, reg) → 'space' | 'earth' | planet id     which world a world position is in
 *   slotRect(def)                              a rocky planet's surface in the voxel world: {x0, z0, w, h, cx, cz}
 *   surfaceToDir(def, x, z) / dirToSurface     a place on the surface ↔ a unit direction from the planet's centre
 *                                              (in the planet's own turning frame)
 *   game.space.surfaceSpot(id, kind)           a deterministic spot on a planet: {x, z, y} in the world
 *   game.space.templeSpot()                    THE place of the Gods' temple on Venus (the same in a world);
 *   game.space.registerTemple({x, z, name})    the temple stands: its mark on Venus' map (GodsTemple.js calls it)
 *
 * ── How the worlds fit together ──────────────────────────────────────────────────────────────
 *   The game's Earth is the endless voxel world. Other planets' surfaces are far regions of the very
 *   same voxel world (x ≥ SPACE.ZONE_X), each made by its own recipe (PlanetSurface.js): one slot per
 *   rocky planet, SLOT_W × SLOT_H metres, its longitude along x (seamless round the planet). So walking,
 *   collisions, explosions, building, saving and the network all work there as at home.
 *   Space itself is high above everything (y ≥ SPACE.FLOOR_Y): a hero in space is at world position
 *   (P.x, SPACE.ORIGIN_Y + P.y, P.z) where P is the heliocentric position in space units (1 unit = 1 m).
 *   The realm of anybody is known from their position alone (realmAt) — saves and the network need
 *   nothing more.
 *
 * ── Sizes ───────────────────────────────────────────────────────────────────────────────────
 *   Real data (NASA / JPL planetary fact sheets): order, sizes relative to the Earth, distances in AU,
 *   gravity, tilts, rings. Squeezed for play: radius = 600·(R/R⊕)^0.6, the Sun's 6000; distance =
 *   32000·(a/AU)^0.7; a year of the Earth is 2 hours (Kepler's T ∝ a^1.5 for the rest); days ∝ √(real).
 *   The order and the feel (tiny Pluto far out, huge Jupiter, Saturn's rings) stay true.
 */

export const SPACE = {
    ORIGIN_Y: 60000, // world y of the Sun's plane (space is above everything else)
    FLOOR_Y: 30000, // a world position above this is in space
    ZONE_X: 240000, // x ≥ this: other planets' surfaces (never reached on foot from the Earth)
    SLOT_W: 32768, // a planet's surface: once round the planet along x (m) …
    SLOT_H: 16384, // … and from pole to pole along z
    SLOT_COLS: 5,
    SLOT_X0: 270000, // the first slot's centre
    SLOT_DX: 40000,
    SLOT_DZ: 24000,
    SLOT_ROWS: 40,
    EARTH_D: 32768, // the Earth's globe: the start at its north pole, this far (m) to the south pole (azimuthal)
    ANCHOR_X: 290000, // a hero in space is kept round this empty place of the world (between the planets' slots) …
    ANCHOR_Z: 12000,
    FLOAT: 1500, // … within this many metres (the true place in space is kept apart: Space.js)
    YEAR: 7200, // s: the Earth's year in the game (2 hours: the planets move slowly)
    AU: 32000, // distance scale: 32000·a^0.7
    EARTH_R: 600,
    SUN_R: 6000,
    HEAT_R: 15000, // nearer the Sun than this the heat grows (warning) — Mercury (16.5 km out) is just outside
    DEATH_R: 9600, // … and here nothing survives (any mode, any protection)
};

const AUd = (au) => Math.round(SPACE.AU * Math.pow(au, 0.7));
const Rr = (r) => Math.round(SPACE.EARTH_R * Math.pow(r, 0.6));
const Tk = (au) => SPACE.YEAR * Math.pow(au, 1.5);
/** A day (s) from the real solar day in Earth days: √ of it × the game's 24-minute day. */
const DAY = (d) => Math.sign(d) * 1440 * Math.sqrt(Math.abs(d));

/**
 * The bodies. kind: 'star' | 'rocky' (can land) | 'gas' (no surface) | 'moon' (rocky, round a planet).
 * air: 'none' (vacuum: magic to breathe), 'thin' (Mars: not breathable either), 'air' (breathable).
 * look: how its picture from space is made (PlanetTextures.js); ground: its surface recipe (PlanetSurface.js).
 */
export const PLANETS = [
    { id: 'sun', name: 'Солнце', kind: 'star', radius: SPACE.SUN_R, a: 0, color: 0xffd27a, look: 'sun', day: DAY(25) },
    { id: 'mercury', name: 'Меркурий', kind: 'rocky', a: AUd(0.387), radius: Rr(0.383), color: 0x9a8f86, gravity: 0.38, air: 'none', tilt: 0.03, day: DAY(176), phase: 1.1, incl: 7.0,
        look: 'mercury', ground: { dust: 0x8c847c, rock: 0x6e6862, dark: 0x4f4b47, ice: 0xcfcac2, craters: 1.0, hills: 0.5, scarps: 0.6 }, slot: 0, sky: 'vacuum' },
    { id: 'venus', name: 'Венера', kind: 'rocky', a: AUd(0.723), radius: Rr(0.949), color: 0xe8c78a, gravity: 0.9, air: 'air', tilt: 177.4, day: -DAY(117), phase: 2.6, incl: 3.4,
        look: 'venus', clouds: 0xead2a0, storms: true, ground: { dust: 0x9a6a3c, rock: 0x6d4a2c, dark: 0x4a3322, ice: 0xc4a274, domes: 1.0, flows: 0.8, hills: 0.7 }, slot: 1, sky: 'venus' },
    { id: 'earth', name: 'Земля', kind: 'home', a: AUd(1), radius: SPACE.EARTH_R, color: 0x4f86c6, gravity: 1, air: 'air', tilt: 23.4, day: 1440, phase: 0.4, incl: 0, look: 'earth', atmosphere: 0x6fb2ff },
    { id: 'moon', name: 'Луна', kind: 'moon', parent: 'earth', a: 3200, radius: Rr(0.273), color: 0xb9b6b0, gravity: 0.165, air: 'none', tilt: 6.7, day: 0, period: 600, phase: 0.9, incl: 5.1,
        look: 'moon', ground: { dust: 0xa9a6a0, rock: 0x86837e, dark: 0x5e5c59, ice: 0xdedcd8, craters: 1.3, maria: 1.0, hills: 0.6 }, slot: 2, sky: 'vacuum' },
    { id: 'mars', name: 'Марс', kind: 'rocky', a: AUd(1.524), radius: Rr(0.532), color: 0xc1562e, gravity: 0.38, air: 'thin', tilt: 25.2, day: DAY(1.03), phase: 4.2, incl: 1.85,
        look: 'mars', atmosphere: 0xd99a6c, ground: { dust: 0xb5522a, rock: 0x7e3a20, dark: 0x5a2a18, ice: 0xf1ece6, rocks: 1.0, dunes: 0.8, mesas: 0.8, hills: 0.8, caps: 1 }, slot: 3, sky: 'mars' },
    { id: 'jupiter', name: 'Юпитер', kind: 'gas', a: AUd(5.204), radius: Rr(11.21), color: 0xd2b48c, gravity: 2.53, air: 'gas', tilt: 3.1, day: DAY(0.41), phase: 0.3, incl: 1.3, look: 'jupiter', atmosphere: 0xe8c9a0 },
    { id: 'saturn', name: 'Сатурн', kind: 'gas', a: AUd(9.58), radius: Rr(9.45), color: 0xe3cf9a, gravity: 1.07, air: 'gas', tilt: 26.7, day: DAY(0.44), phase: 5.1, incl: 2.5, look: 'saturn', atmosphere: 0xf0dcae,
        rings: { inner: 1.24, outer: 2.27, color: 0xd8c49a, alpha: 0.85 } },
    { id: 'uranus', name: 'Уран', kind: 'gas', a: AUd(19.2), radius: Rr(4.01), color: 0x9fdde3, gravity: 0.89, air: 'gas', tilt: 97.8, day: -DAY(0.72), phase: 3.3, incl: 0.8, look: 'uranus', atmosphere: 0xb6eef2,
        rings: { inner: 1.64, outer: 2.0, color: 0x6f7a80, alpha: 0.35 } },
    { id: 'neptune', name: 'Нептун', kind: 'gas', a: AUd(30.05), radius: Rr(3.88), color: 0x3f63d8, gravity: 1.14, air: 'gas', tilt: 28.3, day: DAY(0.67), phase: 1.9, incl: 1.8, look: 'neptune', atmosphere: 0x6f8ff0 },
    { id: 'pluto', name: 'Плутон', kind: 'rocky', a: AUd(39.5), radius: Rr(0.186), color: 0xd8c2a4, gravity: 0.063, air: 'none', tilt: 122.5, day: -DAY(6.39), phase: 5.6, incl: 17.2, ecc: 0.25,
        look: 'pluto', ground: { dust: 0xd9c9b0, rock: 0x8f6a52, dark: 0x6a3a2a, ice: 0xf2f0ea, plains: 1.0, mountains: 0.9, hills: 0.4 }, slot: 4, sky: 'vacuum' },
];
for (const p of PLANETS) {
    p.base = true;
    if (p.kind !== 'star' && !p.period) p.period = Tk(Math.pow(p.a / SPACE.AU, 1 / 0.7));
}

/** The two belts of small rocks and their meteor clusters (скопления метеоритов). */
export const BELTS = {
    asteroids: { inner: AUd(2.2), outer: AUd(3.2), count: 1400, size: [6, 60] },
    kuiper: { inner: AUd(30.5), outer: AUd(50), count: 1800, size: [10, 90], incl: 6 },
};

/** Where in its orbit a body is (radians) at time t. */
const angleAt = (def, t) => (def.phase || 0) + (2 * Math.PI * t) / (def.period || 1);
const DEG = Math.PI / 180;

/**
 * The position of a body at the shared time `t` (s), heliocentric, in space units: out = {x, y, z}.
 * The orbit is a circle (Pluto: a little stretched) tilted by `incl` round the line of its `node`.
 */
export function planetPosition(def, t, out = { x: 0, y: 0, z: 0 }, reg = null) {
    if (!def || !def.a) { out.x = out.y = out.z = 0; return out; }
    const th = angleAt(def, t);
    const e = def.ecc || 0;
    const r = def.a * (1 - e * e) / (1 + e * Math.cos(th));
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const i = (def.incl || 0) * DEG, n = (def.node ?? def.phase ?? 0) * 0.7;
    // tilt round the node line (in the ecliptic plane at angle n)
    const cn = Math.cos(n), sn = Math.sin(n);
    const u = x * cn + z * sn, v = -x * sn + z * cn; // along / across the node line
    const vy = v * Math.sin(i), vv = v * Math.cos(i);
    out.x = u * cn - vv * sn;
    out.z = u * sn + vv * cn;
    out.y = vy;
    if (def.parent && reg) {
        const p = reg.get(def.parent);
        if (p) { const px = out.x, py = out.y, pz = out.z; planetPosition(p, t, out, reg); out.x += px; out.y += py; out.z += pz; }
    }
    return out;
}

/** How far the body has turned round its own axis at time t (radians). */
export function spinAt(def, t) {
    return def.day ? (2 * Math.PI * t) / def.day : 0;
}

// ─────────────────────────────────────────────────────────────── surfaces in the voxel world

/** The surface rectangle of a slot (centre and corners, metres). */
export function slotRect(defOrSlot) {
    const s = typeof defOrSlot === 'number' ? defOrSlot : defOrSlot?.slot;
    if (s == null || s < 0) return null;
    const col = s % SPACE.SLOT_COLS, row = Math.floor(s / SPACE.SLOT_COLS);
    // rows alternate either side of z = 0: 0, -1, +1, -2, +2…
    const rz = row === 0 ? 0 : (row % 2 ? -1 : 1) * Math.ceil(row / 2);
    const cx = SPACE.SLOT_X0 + col * SPACE.SLOT_DX, cz = rz * SPACE.SLOT_DZ;
    return { slot: s, cx, cz, w: SPACE.SLOT_W, h: SPACE.SLOT_H, x0: cx - SPACE.SLOT_W / 2, z0: cz - SPACE.SLOT_H / 2 };
}

/** The slot a ground column is in (or -1). */
export function slotAt(x, z) {
    if (x < SPACE.ZONE_X) return -1;
    const col = Math.round((x - SPACE.SLOT_X0) / SPACE.SLOT_DX);
    if (col < 0 || col >= SPACE.SLOT_COLS) return -1;
    const rz = Math.round(z / SPACE.SLOT_DZ);
    const row = rz === 0 ? 0 : rz < 0 ? -2 * rz - 1 : 2 * rz;
    if (row >= SPACE.SLOT_ROWS) return -1;
    const cx = SPACE.SLOT_X0 + col * SPACE.SLOT_DX, cz = rz * SPACE.SLOT_DZ;
    if (Math.abs(x - cx) > SPACE.SLOT_W / 2 || Math.abs(z - cz) > SPACE.SLOT_H / 2) return -1;
    return col + row * SPACE.SLOT_COLS;
}

/**
 * Which world a world position is in: 'space' (high above everything), a planet's id (on its surface)
 * or 'earth'. A column in the far zone that belongs to no planet is still 'earth' (nobody goes there).
 */
export function realmAt(x, y, z, reg = null) {
    if (y >= SPACE.FLOOR_Y) return 'space';
    if (x < SPACE.ZONE_X) return 'earth';
    const s = slotAt(x, z);
    const def = s >= 0 ? (reg || defaultRegistry()).bySlot(s) : null;
    return def ? def.id : 'earth';
}

/** Is a column (or a chunk's corner) in the far zone of the planets? (castles, caves… are never there) */
export const offEarth = (x) => x >= SPACE.ZONE_X - 64;

/**
 * A place on a planet's surface → a unit direction from its centre in its own (turning) frame:
 * x along the slot = longitude, z = latitude (north at −z). out = {x, y, z} (y = the planet's axis).
 */
export function surfaceToDir(def, x, z, out = { x: 0, y: 0, z: 0 }) {
    const r = slotRect(def);
    const lon = ((x - r.cx) / r.w) * 2 * Math.PI;
    const lat = -((z - r.cz) / r.h) * Math.PI;
    return lonLatDir(lon, lat, out);
}

/** A unit direction in the planet's frame → the place on its surface ({x, z} metres). */
export function dirToSurface(def, d, out = { x: 0, z: 0 }) {
    const r = slotRect(def);
    const { lon, lat } = dirLonLat(d);
    out.x = r.cx + (lon / (2 * Math.PI)) * r.w;
    out.z = r.cz - (lat / Math.PI) * r.h;
    return out;
}

/**
 * The Earth: a place in the endless world ↔ a direction on the globe. The start of the world is the
 * globe's north pole (the hero who flies straight up from home sees home below), the distance from it
 * runs down to the south pole (EARTH_D away), the direction from it is the longitude — an azimuthal
 * map: every place of the world round the start has its own spot on the globe, and back.
 * (The Earth does not turn under the hero — its clouds do.)
 */
export function earthToDir(x, z, out = { x: 0, y: 0, z: 0 }) {
    const d = Math.hypot(x, z);
    const colat = Math.min(Math.PI, (Math.PI * d) / SPACE.EARTH_D);
    const az = d > 1e-6 ? Math.atan2(x, z) : 0;
    const s = Math.sin(colat);
    out.x = s * Math.sin(az); out.y = Math.cos(colat); out.z = s * Math.cos(az);
    return out;
}

export function dirToEarth(d, out = { x: 0, z: 0 }) {
    const l = Math.hypot(d.x, d.y, d.z) || 1;
    const colat = Math.acos(Math.max(-1, Math.min(1, d.y / l)));
    const az = Math.atan2(d.x, d.z);
    const dist = (colat / Math.PI) * SPACE.EARTH_D;
    out.x = Math.sin(az) * dist; out.z = Math.cos(az) * dist;
    return out;
}

function lonLatDir(lon, lat, out) {
    const c = Math.cos(lat);
    out.x = Math.sin(lon) * c;
    out.y = Math.sin(lat);
    out.z = Math.cos(lon) * c;
    return out;
}

function dirLonLat(d) {
    const l = Math.hypot(d.x, d.y, d.z) || 1;
    return { lon: Math.atan2(d.x, d.z), lat: Math.asin(Math.max(-1, Math.min(1, d.y / l))) };
}

// ─────────────────────────────────────────────────────────────── the registry

function hash32(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
}

/** The meteor clusters of a world (deterministic from its seed). */
function makeClusters(seed) {
    const out = [];
    const add = (belt, n, tag) => {
        for (let i = 0; i < n; i++) {
            const h = hash32(seed + 77, i * 31 + tag);
            const r01 = (k) => (hash32(h, k) % 10000) / 10000;
            const a = Math.round(belt.inner + (belt.outer - belt.inner) * (0.15 + 0.7 * r01(1)));
            out.push({ id: `${tag === 1 ? 'ab' : 'kb'}${i}`, belt: tag === 1 ? 'asteroids' : 'kuiper', a, phase: r01(2) * Math.PI * 2, period: Tk(Math.pow(a / SPACE.AU, 1 / 0.7)),
                incl: (r01(3) - 0.5) * (belt.incl || 3), node: r01(4) * 6, r: Math.round(260 + r01(5) * 420), count: 36 + Math.floor(r01(6) * 40), used: false });
        }
    };
    add(BELTS.asteroids, 8, 1);
    add(BELTS.kuiper, 5, 2);
    return out;
}

/** The planets of one world. The base ones come from the code; created ones and every change are data. */
export class PlanetRegistry {
    constructor(seed = 1) {
        this.seed = seed | 0;
        this.version = 0;
        this._fns = [];
        this.reset();
    }

    reset() {
        this.list = PLANETS.map((p) => ({ ...p, seed: hash32(this.seed, hashId(p.id)), created: false, terraformed: false }));
        this.byId = new Map(this.list.map((p) => [p.id, p]));
        this._bySlot = new Map();
        for (const p of this.list) if (p.slot != null) this._bySlot.set(p.slot, p);
        this.clusters = makeClusters(this.seed);
    }

    get(id) { return this.byId.get(id) || null; }
    bySlot(s) { return this._bySlot.get(s) || null; }
    /** Bodies one can land on (with a surface slot). */
    rocky() { return this.list.filter((p) => p.slot != null && p.slot >= 0); }
    cluster(id) { return this.clusters.find((c) => c.id === id) || null; }

    onChange(fn) { this._fns.push(fn); return () => { this._fns = this._fns.filter((f) => f !== fn); }; }
    _changed() { this.version++; for (const f of this._fns) f(this); }

    /** A new planet (a player made it): returns its id. Rocky by default: it gets a surface slot. */
    add(def) {
        const n = this.list.filter((p) => !p.base).length;
        const id = def.id || `p${this.seed % 1000}_${n + 1}`;
        if (this.byId.has(id)) return id;
        let slot = -1;
        if ((def.kind || 'rocky') === 'rocky') { slot = 5; while (this._bySlot.has(slot)) slot++; if (slot >= SPACE.SLOT_COLS * SPACE.SLOT_ROWS) slot = -1; }
        const a = def.a || SPACE.AU * 2;
        const p = {
            kind: 'rocky', radius: 200, color: 0x8a7a6a, gravity: 0.2, air: 'none', tilt: 10, day: 1800, phase: 0, incl: 0, look: 'rock',
            ground: { dust: 0x8a7f74, rock: 0x6a6058, dark: 0x4a4440, ice: 0xdedad2, craters: 0.8, hills: 0.7 }, sky: 'vacuum',
            ...def, id, a, period: def.period || Tk(Math.pow(a / SPACE.AU, 1 / 0.7)), slot, base: false,
            seed: def.seed ?? hash32(this.seed, hashId(id)), created: def.created || true, terraformed: !!def.terraformed,
        };
        this.list.push(p); this.byId.set(id, p);
        if (slot >= 0) this._bySlot.set(slot, p);
        this._changed();
        return id;
    }

    /** Change a planet (bigger, terraformed, a new orbit …): only these fields (nothing is lost). */
    update(id, patch) {
        const p = this.byId.get(id);
        if (!p || !patch) return false;
        for (const k of Object.keys(patch)) {
            if (k === 'id' || k === 'slot' || k === 'base') continue;
            if (k === 'ground' && patch.ground) p.ground = { ...(p.ground || {}), ...patch.ground };
            else p[k] = patch[k];
        }
        if (patch.a && !patch.period) p.period = Tk(Math.pow(p.a / SPACE.AU, 1 / 0.7));
        this._changed();
        return true;
    }

    /** A cluster changes (used up by «Create a planet»). */
    updateCluster(id, patch) {
        const c = this.cluster(id);
        if (!c) return false;
        Object.assign(c, patch);
        this._changed();
        return true;
    }

    /**
     * What differs from the code's planets (saved with the world, sent to the guests): created planets
     * whole, changed fields of the base ones, used clusters.
     */
    toJSON() {
        const fresh = new Map(PLANETS.map((p) => [p.id, p]));
        const changed = {}, created = [];
        for (const p of this.list) {
            if (!p.base) { created.push(p); continue; }
            const b = fresh.get(p.id), d = {};
            for (const k of Object.keys(p)) {
                if (k === 'seed' || k === 'created' || k === 'base' || k === 'terraformed') continue;
                if (JSON.stringify(p[k]) !== JSON.stringify(b[k])) d[k] = p[k];
            }
            if (p.terraformed) d.terraformed = true;
            if (Object.keys(d).length) changed[p.id] = d;
        }
        const clusters = this.clusters.filter((c) => c.used).map((c) => c.id);
        return { v: 1, changed, created, clusters };
    }

    /** Back from a save / the host. */
    applyJSON(s) {
        if (!s || typeof s !== 'object') return;
        this.reset();
        for (const [id, d] of Object.entries(s.changed || {})) { const p = this.byId.get(id); if (p && d && typeof d === 'object') Object.assign(p, d); }
        for (const c of Array.isArray(s.created) ? s.created.slice(0, 120) : []) {
            if (!c || typeof c.id !== 'string' || this.byId.has(c.id)) continue;
            const p = { ...c, base: false };
            this.list.push(p); this.byId.set(p.id, p);
            if (p.slot != null && p.slot >= 0) this._bySlot.set(p.slot, p);
        }
        for (const id of Array.isArray(s.clusters) ? s.clusters : []) { const c = this.cluster(id); if (c) c.used = true; }
        this._changed();
    }
}

function hashId(id) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

let _default = null;
/** A registry with only the base planets (for code that has no game at hand: the far-zone lookups). */
export function defaultRegistry() { return _default || (_default = new PlanetRegistry(1)); }
