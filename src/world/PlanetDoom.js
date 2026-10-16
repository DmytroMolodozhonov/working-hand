/**
 * PlanetDoom.js — «Planet Liquidation» (уничтожение планеты), its pure part (no THREE): the times of its
 * picture, what it costs, which bodies the gods protect, the meteor cluster left of a planet.
 * Used by the spell (src/game/PlanetDestroy.js), the view (src/world/DoomView.js), the registry's save and the tests.
 *
 * The time line (seconds from def.doomAt — the shared clock: the same on every computer):
 *   0 … BEAM        the great beam of magic from the hand (the wand) to the planet
 *   CRACK0 … T      the planet cracks, its red-hot core shines through the cracks, it shakes and swells
 *   T               the blast: a flash, a ring of the shock wave, the rocks flying apart; the planet is gone
 *                   (the host takes it out of the registry and leaves a meteor cluster of its rocks)
 *   T … T + AFTER   the fire ball, the rings, the rocks slowing down into a heap (the new cluster)
 */
import { SPACE, planetPosition, orbitThrough } from './Planets.js';

export const DOOM = {
    BEAM: 3.2, // s: the beam flies out and feeds the planet
    CRACK0: 2.2, // s: the first cracks
    T: 12, // s: the blast
    AFTER: 14, // s: the fire, the rings, the flying rocks after the blast
    FLASH: 1.6, // s: the white flash of the blast
    BASE: 1500, // mana: the spell itself (the author)
    PER_MASS: 1000, // mana × √(the planet's mass in the Earth's masses) on top
    KILL_AIR: 300, // m: nearer its ground than this + half its radius (in its air, over it) — killed by the blast
    WARN: 2, // s between the warnings to those on it
};

/**
 * How heavy a planet is, in the Earth's masses (the game's own Earth: gravity 1, radius 600 m): the pull at its
 * ground is g ∝ M / R², so M ∝ g · R². A planet made bigger by «Enlarge Planet» (+30 % radius and gravity) is
 * heavier: ×1.3³ ≈ 2.2 each time.
 */
export function planetMass(def) {
    if (!def) return 0;
    const r = (def.radius || 200) / SPACE.EARTH_R;
    return Math.max(0, def.gravity ?? 0.2) * r * r;
}

/**
 * The mana for the planet's mass, on top of the BASE 1500: 1000 × √(mass). The square root keeps it in reason:
 * the masses go from ~0.01 (Pluto) to ~36 (Jupiter) — 3600 times, — the price only 60 times: small worlds (Pluto,
 * the Moon, a new planet of meteors) add tens to a couple of hundred, Mercury and Mars three–four hundred, the
 * giants thousands (Jupiter ~6000) — dear, but never millions. Rounded to tens.
 */
export function massCost(def) {
    return Math.round((DOOM.PER_MASS * Math.sqrt(planetMass(def))) / 10) * 10;
}

/** The whole price: {base, mass, total}. */
export function liquidationCost(def) {
    const mass = massCost(def);
    return { base: DOOM.BASE, mass, total: DOOM.BASE + mass };
}

/** The bodies the gods protect: the Earth (everybody's home) and Venus (their temple — a gift of the gods). */
export const GOD_PROTECTED = new Set(['earth', 'venus']);

/** May this body be blown up? (the Sun and the gods' two: never) */
export const doomable = (def) => !!def && def.kind !== 'star' && !GOD_PROTECTED.has(def.id);

/** Why «Planet Liquidation» does not work on `def` (or null). `t` — now (a planet already dying). */
export function liquidationRefusal(def, t = null) {
    if (!def) return null;
    if (GOD_PROTECTED.has(def.id)) return '🛡️ Этот объект защищён силой богов';
    if (def.kind === 'star') return '☀️ Солнце — звезда, а не планета: «Planet Liquidation» взрывает только планеты, а звезду не берёт никакая магия';
    if (def.doomAt && (t == null || t - def.doomAt < DOOM.T)) return `💥 «${def.name}» уже гибнет — её не остановить`;
    return null;
}

/** How far a planet's end is (s since doomAt), or -1 when it is not dying. */
export function doomAge(def, t) {
    if (!def?.doomAt || !doomable(def)) return -1;
    const a = t - def.doomAt;
    return a >= 0 ? a : -1;
}

/**
 * The meteor cluster left of a blown-up planet (on its own orbit: where it was at the blast, going on the
 * same way round the Sun). A moon (round its planet) leaves its rocks on a circle round the Sun through where
 * it was. More rocks of a heavier planet (40…90); a planet made of them later is a small one as always.
 */
export function debrisCluster(def, t, reg = null) {
    const m = planetMass(def);
    const base = { id: `dbr_${def.id}`, belt: 'debris', from: def.name, r: Math.round(Math.max(320, Math.min(1100, def.radius * 1.4))),
        count: Math.max(40, Math.min(90, 40 + Math.round(22 * Math.sqrt(m)))), bornAt: t, used: false, color: def.color ?? 0x8a7a6a };
    if (def.parent) {
        const p = planetPosition(def, t, { x: 0, y: 0, z: 0 }, reg);
        return { ...base, ...orbitThrough(p.x, p.z, t), lift: Math.round(p.y) };
    }
    const o = { a: def.a, period: def.period, phase: def.phase || 0, incl: def.incl || 0, node: def.node ?? def.phase ?? 0, ecc: def.ecc || 0 };
    if (def.lift) { o.lift = def.lift; if (def.liftT != null) o.liftT = def.liftT; } // (a planet moved off the plane: its rocks settle as it would)
    return { ...base, ...o };
}
