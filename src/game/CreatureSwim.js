/**
 * CreatureSwim.js — land creatures in deep water (knights, the castle people, the king,
 * merchants, wizards, the people of the roads, the beasts).
 *
 * What they do (the author: «they must be able to swim — but never go into the water after you;
 * fallen in, they try to get out; not sure they can»):
 *
 *  - Never in on their own: deep water is no ground to walk on (`deepAt` — CastleLife._walkable,
 *    the beasts' steps, the zombies' steps), so no path, chase or crowd step leads into it. A foe
 *    swimming: they stay on the bank — the archers shoot, the rest wait and shout (KnightTactics).
 *  - Fallen in (a spell, a blast, off a bridge / a wall / a ship): the body floats at the top, the
 *    head over the water, the arms and legs going (VillagerModel 'swim' / 'paddle'), splashes.
 *    Slower than walking. Shallow water (less than `deep` layers) is waded through as before.
 *  - Out: they swim to the nearest place where they can get out — a low edge, a beach, the
 *    shallows (`findExit`: a ring search over the cells, once in a while, only for those in the
 *    water). A high bank is no way out: the search finds the low place further along it, and they
 *    swim round to it (along the wall when it is in the way). At the edge: hands on it, pulled out.
 *  - A knight / the king in plates: heavy — slow, low in the water, the head going under now and
 *    then; a pull out only where the edge is at the water (no lifting the steel up a step). Not out
 *    in SHED seconds (or no way out for him at all): he throws the plates off (they sink — there
 *    they lie on the bottom, to be dived for: Armor.shedVillager) and swims on lighter.
 *  - Nowhere to go (the open sea): they swim on towards home, tire (TIRE s), go under more and
 *    more, the air runs out as a player's does (AIR s, then −1 HP a second) — they drown; the
 *    body floats.
 *  - Zombies don't breathe: they don't float either — they walk the bottom, slowly (Zombie.js);
 *    they don't go into deep water on their own.
 *
 * Network: the host moves them (as everything about them); the guests see where they are and
 * how they move ('swim' / 'paddle' modes) — the splashes are made on every computer from that.
 *
 * Cheap: a few block reads a step; the exit search only for those in the water, once in 1.5 s.
 */

import { BLOCK } from '../world/Terrain.js';

export const CSWIM = {
    DEEP: 3, // water layers over the floor: a person is off their feet (as the player: Swimming.SWIM_DEPTH)
    DEEP_BEAST: 2, // a four-legged beast swims sooner
    AIR: 20, // s of air under the water (as the player: Swimming.AIR_MAX)
    TIRE: 150, // s of swimming before the strength goes (the open sea)
    SHED: 30, // s a knight in plates tries before he throws them off
    SHED_NOWAY: 8, // … when there is no way out for him at all
    FIND_EVERY: 1.5, // s between the searches for a way out
    R: 22, // m: how far round a way out is looked for
    REACH: 1.15, // m from the edge: hands on it — out
};

/** How each kind swims: speed (m/s), how high the edge may be over the water to get out, the float. */
export const SWIMMERS = {
    person: { speed: 1.5, climb: 1.0, float: 1.5, eyes: 1.75, air: CSWIM.AIR, deep: CSWIM.DEEP },
    heavy: { speed: 0.8, climb: 0.5, float: 1.75, eyes: 1.75, air: CSWIM.AIR, deep: CSWIM.DEEP, bob: 0.55, heavy: true }, // (in plates)
    horse: { speed: 1.7, climb: 0.5, float: 0, eyes: 0, air: 30, deep: CSWIM.DEEP_BEAST },
    cow: { speed: 1.0, climb: 0.5, float: 0, eyes: 0, air: 25, deep: CSWIM.DEEP_BEAST },
    pig: { speed: 0.7, climb: 0.5, float: 0, eyes: 0, air: 18, deep: CSWIM.DEEP_BEAST, bob: 0.2, flounder: true },
    sheep: { speed: 0.7, climb: 0.5, float: 0, eyes: 0, air: 18, deep: CSWIM.DEEP_BEAST, bob: 0.2, flounder: true },
};

const solid = (b) => b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.ICE_SHAPE && b != null;

/**
 * The water at (x, z) for a body whose feet are at `y`: {surface, bottom, depth (layers), floor}
 * or null (no water over the floor there). A bridge / a deck over the water is a floor, the
 * water under it is nobody's business.
 */
export function waterAt(t, x, z, y) {
    if (!t) return null;
    const ix = Math.round(x), iz = Math.round(z);
    const f = t.floorBelow(ix, iz, Math.floor(y + 1.5) + 1);
    if (t.get(ix, f + 1, iz) !== BLOCK.WATER) return null;
    let n = 1;
    while (n < 32 && t.get(ix, f + 1 + n, iz) === BLOCK.WATER) n++;
    return { surface: f + n - 0.5, bottom: f - 0.5, depth: n, floor: f };
}

/** Deep water (off the feet) at (x, z) for feet at `y`: no ground to walk on. Cheap (1–4 reads). */
export function deepAt(t, x, z, y, deep = CSWIM.DEEP) {
    if (!t) return false;
    const ix = Math.round(x), iz = Math.round(z);
    const f = t.floorBelow(ix, iz, Math.floor(y + 1.5) + 1);
    for (let k = 1; k <= deep; k++) if (t.get(ix, f + k, iz) !== BLOCK.WATER) return false;
    return true;
}

/** Where the body (feet) floats in this water: `float` m under the surface (a beast: its legs under). */
export function floatY(w, kind, legH = 0) {
    return w.surface - (kind.float || legH * 1.1 + 0.15);
}

/**
 * The nearest place to get out of the water at `surface` round (x, z): a cell with a floor
 * (the shallows, a beach, an edge no higher than `climb` over the water) and room for the body.
 * → {x, z, y (where the feet will stand), edge (m over the water), d} or null.
 */
export function findExit(t, x, z, surface, climb = 1, R = CSWIM.R, deep = CSWIM.DEEP) {
    if (!t) return null;
    const cx = Math.round(x), cz = Math.round(z);
    const Ls = Math.round(surface + 0.5); // (the top water layer)
    let best = null, bd = Infinity;
    for (let r = 1; r <= R; r++) {
        if (r - 1 > bd) break; // (a nearer ring can't be beaten now)
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                const d = Math.hypot(dx, dz);
                if (d >= bd) continue;
                const ix = cx + dx, iz = cz + dz;
                const f = t.floorBelow(ix, iz, Ls + 2);
                const stand = f - 0.5;
                if (stand > surface + climb + 1e-6) continue; // (too high to pull out)
                let wd = 0;
                while (wd < deep && t.get(ix, f + 1 + wd, iz) === BLOCK.WATER) wd++;
                if (wd >= deep) continue; // (still deep there)
                if (solid(t.get(ix, f + 1, iz)) || solid(t.get(ix, f + 2, iz))) continue; // (no room for the body)
                bd = d;
                best = { x: ix, z: iz, y: stand, edge: stand - surface, d };
            }
        }
    }
    return best;
}

/** Can a body swim into (x, z) at the water's top layer (no wall, no bank there)? */
function open(t, x, z, Ls) {
    const ix = Math.round(x), iz = Math.round(z);
    return !solid(t.get(ix, Ls, iz)) && !solid(t.get(ix, Ls + 1, iz));
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * One step of a body in deep water. `b`: {x, y, z, yaw} (feet), `sw`: its swim state (kept on
 * the body), `kind`: SWIMMERS row, `env`: {t, home?: {x, z}, legH?}. Moves the body; returns
 *   'swim'  — still in the water
 *   {out: {x, y, z}} — at the edge: get out there now (climb / hop)
 *   'shed'  — (in plates) it is time to throw them off
 *   'drown' — out of air this second: −1 HP
 */
export function swimStep(b, sw, kind, env, dt) {
    const t = env.t;
    const w = waterAt(t, b.x, b.z, b.y);
    if (!w || w.depth < (kind.deep || CSWIM.DEEP)) return null; // (not deep here: on its feet)
    sw.t = (sw.t || 0) + dt;
    if (sw.air == null) sw.air = kind.air;
    // a way out: looked for now and then (the body moves, the bank comes in sight)
    sw.findT = (sw.findT || 0) - dt;
    if (sw.findT <= 0) {
        sw.findT = CSWIM.FIND_EVERY;
        sw.exit = findExit(t, b.x, b.z, w.surface, kind.climb, CSWIM.R, kind.deep || CSWIM.DEEP);
        if (!sw.exit) sw.noWayT = (sw.noWayT || 0) + CSWIM.FIND_EVERY; else sw.noWayT = 0;
    }
    // in plates and no way out for so long: off with them
    if (kind.heavy && (sw.t > CSWIM.SHED || sw.noWayT > CSWIM.SHED_NOWAY)) return 'shed';
    const Ls = Math.round(w.surface + 0.5);
    // where to: the way out, or (none: the open sea) home
    const goal = sw.exit || env.home || null;
    let speed = kind.speed;
    const tired = Math.max(0, (sw.t - CSWIM.TIRE) / 40); // (the strength going: slower, lower)
    speed *= Math.max(0.25, 1 - tired * 0.6);
    if (goal) {
        const dx = goal.x - b.x, dz = goal.z - b.z, d = Math.hypot(dx, dz);
        if (sw.exit && d < CSWIM.REACH + 0.2) {
            sw.findT = 0; // (out: the search starts again next time it falls in)
            return { out: { x: sw.exit.x, y: sw.exit.y, z: sw.exit.z } };
        }
        if (d > 1e-3) {
            const a0 = Math.atan2(dx, dz);
            const s = Math.min(speed * dt, d);
            // straight on; a bank / a wall in the way: along it (the side tried last time first)
            const side = sw.side || 1;
            for (const da of [0, 0.6 * side, -0.6 * side, 1.2 * side, -1.2 * side, 1.9 * side, -1.9 * side]) {
                const a = a0 + da;
                const ux = Math.sin(a), uz = Math.cos(a);
                const nx = b.x + ux * s, nz = b.z + uz * s;
                // (the last metre to the way out: up to its edge)
                const near = sw.exit && Math.hypot(sw.exit.x - nx, sw.exit.z - nz) < 1.0;
                if (!near && !open(t, nx + ux * 0.45, nz + uz * 0.45, Ls)) continue;
                if (!near && !deepAt(t, nx, nz, w.bottom, 1)) continue; // (not onto a dry floor but the exit's)
                b.x = nx; b.z = nz;
                if (da) sw.side = Math.sign(da);
                b.yaw = b.yaw + Math.max(-dt * 4, Math.min(dt * 4, wrap(Math.atan2(-ux, -uz) - b.yaw)));
                break;
            }
        }
    }
    sw.moving = !!goal;
    // up and down in the water: the plates pull the head under now and then; the tired go lower
    const bob = kind.bob || 0.08;
    const k = 0.5 + 0.5 * Math.sin(sw.t * (kind.bob ? 1.9 : 2.6));
    const sink = bob * k + tired * 0.9;
    const want = floatY(w, kind, env.legH) - sink;
    b.y += (want - b.y) * Math.min(1, dt * 3);
    // the air: the eyes under the water
    const eyes = kind.eyes ? b.y + kind.eyes : b.y + (env.legH || 0.5) + 0.6;
    sw.under = eyes < w.surface;
    if (sw.under) sw.air = Math.max(0, sw.air - dt);
    else sw.air = Math.min(kind.air, sw.air + dt * 2);
    if (sw.air <= 0) {
        sw.drownT = (sw.drownT || 0) + dt;
        if (sw.drownT >= 1) { sw.drownT -= 1; return 'drown'; }
    } else sw.drownT = 0;
    return 'swim';
}

const _p = { x: 0, y: 0, z: 0 }, _q = { x: 0, y: 0, z: 0 };

/** Splashes round a swimmer now and then (every computer: from its mode). */
export function splashes(game, x, y, z, dt, heavy, state) {
    state.splT = (state.splT || 0) - dt;
    if (state.splT > 0) return;
    state.splT = heavy ? 0.35 : 0.6 + Math.random() * 0.4;
    const fx = game.fx;
    if (fx?.spark) {
        const n = heavy ? 4 : 2;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            _p.x = x + Math.cos(a) * 0.5; _p.y = y; _p.z = z + Math.sin(a) * 0.5;
            _q.x = Math.cos(a) * 1.2; _q.y = 2 + Math.random() * 1.5; _q.z = Math.sin(a) * 1.2;
            fx.spark(_p, i % 2 ? 0xdff4ff : 0x9fd3f5, 0.09, _q, 0.5);
        }
    }
    const me = game.character?.group?.position;
    if (me && Math.abs(me.x - x) + Math.abs(me.z - z) < 30 && Math.random() < (heavy ? 0.5 : 0.3)) { _p.x = x; _p.y = y; _p.z = z; game.sound?.playSplashAt?.(_p, heavy ? 0.5 : 0.3); }
}
