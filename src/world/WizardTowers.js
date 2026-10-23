/**
 * WizardTowers.js — the wizards' towers (academies) and the wizards' houses around them.
 *
 * There is ONE tower in the whole world (the author: «башня магов всегда одна»; the wizards' towns may
 * be many): in a castle-free cell of the castle grid (480 m) 0.5–1.3 km from the spawn (further out
 * only if no cell there will do). Old worlds too: their other towers are no more (TowerIndex.isLost —
 * their saved block edits are dropped, WorldSave.restoreWorld). It is a
 * wide round tower of blue-grey arcane stone: a cellar (the vault) and six floors
 * joined by a spiral stair along the wall, an observatory and the Master's study
 * under a pointed violet roof. Every floor is two rooms (a wall across the middle
 * with a doorway): the hall and the scroll shop, the library, the classroom, the
 * laboratory, the students' dormitory… Glowing crystal lamps light it. Around it a
 * plaza with runes and obelisks, a ring road and 4–6 «slightly magic» houses with
 * chests of scrolls. No fields, no pens — wizards don't farm.
 *
 * Pure data, deterministic from the seed (every computer builds the same tower);
 * the shape of a site record is the same as a castle's (src/world/Castles.js), so
 * the people, the houses, the doors, the chests and the saves work on it as they
 * do on castles. Rot-local coordinates: centre (0, 0), the door at the front (−v).
 *
 * (Imports Terrain.js for BLOCK: never read BLOCK at the top level here.)
 */

import { BLOCK } from './Terrain.js';
import { CASTLE_CELL, BLEND, hash01, Plan, buildHouse, rotLot, inwardRy } from './Castles.js';
import { createRng } from '../core/math.js';
import { offEarth } from './Planets.js';

export const TOWER_ZONE = 58; // half-size of the levelled land
const TOWER_P = 0.2; // (old worlds: the share of castle-free cells that held a tower — only to find them: isLost)
const TOWER_M = TOWER_ZONE + BLEND + 10; // the tower land stays ≥ 10 m inside its cell
const TOWER_SPAN = CASTLE_CELL - 2 * TOWER_M;
const TRIES = 12;
const MIN_SPAWN = 300 + TOWER_ZONE;
const SPAWN_RING = [500, 1300];
const FAR_RING = 4000; // (no cell in the ring will do: the nearest good one further out)
/** The Master of the one tower (the lore — src/game/LoreBooks.js: wise, bearded, thorough; avoids fights). */
export const TOWER_MASTER = 'Джовалилиус Правдиус Нотан';
const WANDER_CELL = 700;

// ------------------------------------------------------------- the shape
export const LEVELS = [-7, 0, 7, 14, 21, 28, 35]; // l of each floor (the cellar first)
const R_OUT = 17, R_IN = 15; // the drum
const BAND_IN = 11.5, BAND_R = 13.25; // the stair band (r 11.5 … 15) and its walking line
const DELTA = 2.6 / BAND_R; // one step: 2.6 m of arc
const STEPS = 7; // per flight (7 layers per floor)
const TH0 = 20 * Math.PI / 180;
const TAU = Math.PI * 2;
const ROOF_L = 41;
const DEG = Math.PI / 180;

/** Start angle of flight k (from LEVELS[k] up to LEVELS[k+1]). */
export const flightAngle = (k) => TH0 + 9 * k * DELTA;
const norm = (a) => a - Math.floor(a / TAU) * TAU;
/** Is angle a inside the arc [a0, a0 + span] (with a margin)? */
const inArc = (a, a0, span, m = 0) => norm(a - (a0 - m)) <= span + 2 * m;

export const TOWER_ROOMS = {
    vault: 'Хранилище', store: 'Кладовая', hall: 'Большой зал', shop: 'Лавка свитков', library: 'Библиотека',
    reading: 'Читальня', classroom: 'Класс', teachers: 'Учительская', alchemy: 'Лаборатория', herbs: 'Травница',
    common: 'Гостиная', dorm: 'Спальня учеников', study: 'Кабинет Мастера', observatory: 'Обсерватория',
};
// [back half, front half] of every floor
const FLOOR_ROOMS = [['vault', 'store'], ['hall', 'shop'], ['library', 'reading'], ['classroom', 'teachers'], ['alchemy', 'herbs'], ['common', 'dorm'], ['study', 'observatory']];

const NAMES_A = ['Звёздный', 'Лунный', 'Туманный', 'Сапфировый', 'Аметистовый', 'Северный', 'Хрустальный', 'Сумеречный', 'Небесный', 'Старый'];
const NAMES_B = ['Шпиль', 'Купол', 'Свиток', 'Посох', 'Пик'];
// (the author: a tower's Master is always an old man with a long white beard, as Dumbledore — no women Masters)
const MASTER_A = ['Элдрин', 'Корвин', 'Северин', 'Аурелий', 'Мельхиор', 'Ингвар', 'Октавиан', 'Велимир', 'Радомир', 'Мирослав'];
const MASTER_B = ['Седобородый', 'Звездочёт', 'Мудрый', 'Огненный', 'Тихий', 'Всевидящий', 'Лунный'];
export const FEMALE_MASTERS = new Set();

/** Distance from point (x, z) to segment a–b. */
function segDist(x, z, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}
/** Distance from a rectangle [u0,u1]×[v0,v1] (local metres) to a segment. */
export function rectSegDist(u0, u1, v0, v1, a, b) {
    // (inside or crossing → 0; else the smaller of the corner/edge distances)
    const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1));
    let best = Infinity;
    for (let i = 0; i <= steps; i++) {
        const u = a[0] + (b[0] - a[0]) * i / steps, v = a[1] + (b[1] - a[1]) * i / steps;
        const du = Math.max(u0 - u, 0, u - u1), dv = Math.max(v0 - v, 0, v - v1);
        const d = Math.hypot(du, dv);
        if (d < best) best = d;
        if (best === 0) break;
    }
    return best;
}

// ------------------------------------------------------------- the tower
/**
 * Builds the tower and its walking graph into plan `p`. Returns what the site
 * record needs (rooms, chests, beds, the counter, spots...).
 */
function buildTower(p, rng, out) {
    const B = BLOCK;
    const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
    const ipol = (r, a) => [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))];
    // ---- the shell
    p.cyl(0, 0, R_OUT, -8, ROOF_L, B.ARCANE_WARD); // (its walls: the enchanted stone, as the duel arenas' — EnchantedStone.js)
    p.cyl(0, 0, R_IN, -7, ROOF_L - 1, B.AIR);
    for (const l of LEVELS.slice(1)) {
        p.cyl(0, 0, R_IN, l - 1, l - 1, B.ARCANE_DARK);
        p.cyl(0, 0, R_OUT + 0.5, l - 1, l - 1, B.CS_WHITE, R_OUT - 0.5); // a string course outside
    }
    p.cyl(0, 0, R_OUT + 0.5, ROOF_L, ROOF_L, B.CS_WHITE, R_OUT - 0.5);
    // buttresses on the diagonals
    for (let i = 0; i < 4; i++) {
        const [bu, bv] = ipol(R_OUT + 1, (45 + 90 * i) * DEG);
        p.box(bu - 1, bu, -1, 8, bv - 1, bv, B.ARCANE_DARK);
    }
    // ---- the pointed roof, a violet crystal on the tip, golden stars
    const cone = p.parts.length;
    for (let k = 0; k <= 13; k++) {
        const rr = 19 * (1 - k / 14);
        if (rr < 0.4) break;
        p.cyl(0, 0, rr, ROOF_L + k, ROOF_L + k, B.ROOF_PURPLE);
    }
    p.slopeTop(cone, B.ROOF_PURPLE); // (a cone of ramps — generation 6)
    p.box(0, 0, ROOF_L + 14, ROOF_L + 14, 0, 0, B.ARCANE_LAMP_VIOLET);
    for (let i = 0; i < 6; i++) {
        const k = 3 + (i % 3) * 3, rr = 19 * (1 - k / 14) - 0.3;
        const [su, sv] = ipol(rr, (30 + 60 * i) * DEG);
        p.box(su, su, ROOF_L + k, ROOF_L + k, sv, sv, B.GOLD);
    }
    // ---- the spiral stair: flight k from floor k to floor k+1 along the wall
    const flights = [];
    for (let k = 0; k + 1 < LEVELS.length; k++) {
        const l = LEVELS[k], th = flightAngle(k), mark = p.parts.length;
        for (let i = 0; i < STEPS; i++) {
            const a0 = th + i * DELTA, a1 = a0 + DELTA;
            p.sector(0, 0, R_IN, BAND_IN, a0, a1, l + i + 1, l + i + 5, B.AIR); // headroom (cuts the floor above)
            p.sector(0, 0, R_IN, BAND_IN, a0, a1, l, l + i, B.ARCANE_DARK); // the step
        }
        p.slopeTop(mark, B.ARCANE_DARK); // (generation 6: the steps' edges ramps where the flight rises straight along x or z)
        const up = LEVELS[k + 1];
        p.sector(0, 0, BAND_IN, BAND_IN - 1, th, th + STEPS * DELTA, up, up + 1, B.FENCE); // the railing round the hole
        p.sector(0, 0, R_IN, BAND_IN, th, th + DELTA, up, up + 1, B.FENCE); // (the hole's closed end)
        flights.push({ k, l, up, th });
    }
    // ---- windows (2 wide, 4 high), crystal lamps in the wall
    const windows = [];
    const along = (du, dv) => { const o = p.pt(0, 0), q = p.pt(du, dv); return Math.atan2(-(q.z - o.z), q.x - o.x); };
    LEVELS.forEach((l, li) => {
        if (li === 0) return; // (the cellar is under the ground)
        const near = flights.filter((f) => f.k === li - 1 || f.k === li).map((f) => [f.th, STEPS * DELTA]);
        const angles = li === LEVELS.length - 1 ? [0, 45, 90, 135, 180, 225, 270, 315] : [0, 90, 180, 270];
        for (const deg of angles) {
            const a = deg * DEG;
            if (li === 1 && deg === 270) continue; // (the door)
            if (near.some(([a0, sp]) => inArc(a, a0, sp, 15 * DEG))) continue;
            const c = Math.cos(a), s = Math.sin(a);
            // a hole through the wall (r 14.5 … 17.5): 2 wide across the radius
            const tu = -s, tv = c;
            for (let r = 14.5; r <= 17.6; r += 0.5) for (const w of [-0.5, 0.5]) {
                const u = Math.round(c * r + tu * w), v = Math.round(s * r + tv * w);
                p.box(u, u, l + 2, l + 5, v, v, B.AIR);
            }
            const q = p.pt(c * 16, s * 16);
            windows.push({ x: q.x, z: q.z, y: (p.L(l + 2) + p.L(l + 5)) / 2 - 1, ry: along(tu, tv), w: 2, h: 4 });
        }
        for (let deg = 15; deg < 360; deg += 30) {
            const a = deg * DEG;
            if (near.some(([a0, sp]) => inArc(a, a0, sp, 4 * DEG))) continue;
            const [u, v] = ipol(16, a);
            if (Math.abs(v) < 2 && li === 1) continue;
            p.box(u, u, l + 4, l + 4, v, v, B.ARCANE_LAMP);
        }
    });
    // ---- the entrance: a high doorway, pillars with a lamp keystone
    p.box(-2, 2, 0, 5, -R_OUT - 1, -R_IN + 1, B.AIR);
    p.box(-2, 2, -1, -1, -R_OUT - 1, -R_IN + 1, B.ARCANE_DARK);
    for (const su of [-1, 1]) p.box(su * 3, su * 3, 0, 7, -R_OUT - 1, -R_OUT - 1, B.ARCANE_DARK);
    p.box(-2, 2, 6, 6, -R_OUT - 1, -R_OUT - 1, B.ARCANE_DARK);
    p.box(0, 0, 6, 6, -R_OUT - 1, -R_OUT - 1, B.ARCANE_LAMP);

    // ---- every floor: a wall across the middle with a doorway, two rooms
    const rooms = [], chests = [], bedSpots = [], spots = [], dummies = [], lore = [], res = new Set();
    const stall = {};
    let throne = null, throneFront = null, dormNode = null, studyNode = null;
    LEVELS.forEach((l, li) => {
        p.box(-11, 11, l, l + 5, 0, 0, B.ARCANE);
        p.box(-1, 1, l, l + 4, 0, 0, B.AIR);
        // the walking graph of this floor
        const inF = flights.find((f) => f.k === li - 1), outF = flights.find((f) => f.k === li);
        const blocked = [inF, outF].filter(Boolean).map((f) => [f.th, STEPS * DELTA]);
        const free = (a, m = 8 * DEG) => !blocked.some(([a0, sp]) => inArc(a, a0, sp, m));
        const [kb, kf] = FLOOR_ROOMS[li];
        const cb = p.node(0, li === 6 ? 4 : 6, l, 'room:' + kb), cf = p.node(0, -6, l, 'room:' + kf);
        const db = p.node(0, 1, l), df = p.node(0, -1, l);
        p.link(cb, db); p.link(db, df); p.link(df, cf);
        const legs = [[[0, li === 6 ? 4 : 6], [0, 1]], [[0, 1], [0, -1]], [[0, -1], [0, -6]]];
        const nodeAt = (r, a, tag) => { const [u, v] = ipol(r, a); return { id: p.node(u, v, l, tag), u, v }; };
        // the band: a node every 30° where no stair is
        const band = [];
        for (let i = 0; i < 12; i++) {
            const a = i * 30 * DEG;
            band.push(free(a) ? nodeAt(BAND_R, a) : null);
        }
        for (let i = 0; i < 12; i++) {
            const A = band[i], Bn = band[(i + 1) % 12];
            if (A && Bn && free(i * 30 * DEG + 15 * DEG, 8 * DEG)) { p.link(A.id, Bn.id); legs.push([[A.u, A.v], [Bn.u, Bn.v]]); }
        }
        // radial links: from the band into a room (one per half, nearest the middle of the half)
        const radial = (half, centre) => {
            const want = half > 0 ? 90 : 270;
            const order = [0, -30, 30, -60, 60].map((d) => want + d);
            for (const deg of order) {
                const i = (deg / 30) % 12;
                if (!band[i]) continue;
                if (li === 6 && half > 0 && deg === 90) continue; // (the Master's chair stands there)
                if (li === 5 && half > 0) return; // (the common room: its beds; reached by the doorway)
                const m = nodeAt(9, deg * DEG);
                p.link(band[i].id, m.id); p.link(m.id, centre.id);
                legs.push([[band[i].u, band[i].v], [m.u, m.v]], [[m.u, m.v], [centre.u, centre.v]]);
                return;
            }
        };
        const C = { b: { id: cb, u: 0, v: li === 6 ? 4 : 6 }, f: { id: cf, u: 0, v: -6 } };
        radial(1, C.b);
        if (li !== 1) radial(-1, C.f);
        // the stairs: the bottom of the flight going up, the landing of the one coming up
        const pocket = [];
        if (outF) {
            const bottom = nodeAt(BAND_R, outF.th - 0.6 * DELTA, li === 0 ? 'stairsBottom' : 'stairsBottom');
            let prev = bottom.id;
            for (let i = 0; i < STEPS; i++) {
                const [u, v] = ipol(BAND_R, outF.th + (i + 0.5) * DELTA);
                const id = p.node(u, v, l + i + 1, 'step');
                p.link(prev, id);
                prev = id;
            }
            outF.top = prev;
            pocket.push(bottom);
        }
        if (inF) {
            const landing = nodeAt(BAND_R, inF.th + (STEPS + 0.6) * DELTA, 'landing');
            p.link(inF.top, landing.id);
            pocket.push(landing);
        }
        for (const q of pocket) {
            // to the band if it is right there, else through the room
            const a = Math.atan2(q.v, q.u);
            let linked = false;
            for (let i = 0; i < 12 && !linked; i++) {
                if (!band[i]) continue;
                const bi = i * 30 * DEG;
                const d = norm(bi - a), back = norm(a - bi);
                const span = Math.min(d, back);
                if (span > 31 * DEG) continue;
                const mid = d < back ? a + span / 2 : a - span / 2;
                if (!free(mid, 2 * DEG)) continue;
                p.link(q.id, band[i].id); legs.push([[q.u, q.v], [band[i].u, band[i].v]]);
                linked = true;
            }
            if (pocket.length === 2 && q === pocket[1]) { p.link(pocket[0].id, q.id); legs.push([[pocket[0].u, pocket[0].v], [q.u, q.v]]); }
            if (!linked && (pocket.length === 1 || q === pocket[1])) {
                // a node just inside the band, then to the room of that half
                const am = pocket.length === 2 ? Math.atan2(pocket[0].v + q.v, pocket[0].u + q.u) : a;
                const m = nodeAt(9.5, am);
                const c = m.v > 0 ? C.b : C.f;
                p.link(q.id, m.id); p.link(m.id, c.id);
                legs.push([[q.u, q.v], [m.u, m.v]], [[m.u, m.v], [c.u, c.v]]);
            }
        }
        // the entrance
        if (li === 1) {
            const gate = p.node(0, -22, 0, 'towerGate'), door = p.node(0, -16, 0), tin = p.node(0, -12, 0, 'towerIn');
            p.link(gate, door); p.link(door, tin); p.link(tin, cf);
            legs.push([[0, -16], [0, -12]], [[0, -12], [0, -6]]);
            if (band[9]) { p.link(tin, band[9].id); legs.push([[0, -12], [band[9].u, band[9].v]]); }
            out.gateNode = gate;
        }
        // ---- the rooms
        for (const half of [1, -1]) {
            const kind = half > 0 ? kb : kf;
            const room = { kind, half, l, li, name: TOWER_ROOMS[kind] };
            furnishTower(p, room, rng, legs, { chests, bedSpots, spots, dummies, lore, res, stall, set: (k, v) => { if (k === 'throne') throne = v; if (k === 'throneFront') throneFront = v; } });
            const r = half > 0 ? p.rect(-14, 14, 1, 14) : p.rect(-14, 14, -14, -1);
            rooms.push({ kind, name: TOWER_ROOMS[kind], ...r, y: p.L(l) - 1.5, l, floor: li });
        }
        if (kf === 'dorm') dormNode = cf;
        if (kb === 'study') studyNode = cb;
    });
    // tag nodes for the jobs
    for (const sp of spots) sp.node = p.node(sp.nu, sp.nv, sp.l, sp.kind);
    for (const sp of spots) {
        // linked to the nearest room centre of its floor
        const c = p.node(0, sp.nv > 0 ? (sp.l === 35 ? 4 : 6) : -6, sp.l);
        p.link(sp.node, c);
    }
    Object.assign(out, { rooms, chests, bedSpots, spots, dummies, lore, stall, throne, throneFront, windows, dormNode, studyNode });
}

/**
 * The furniture of one half-room. Nothing may stand within 1 m of a walking leg
 * (`legs`: segments in local metres of this floor); nothing in the stair band.
 */
function furnishTower(p, room, rng, legs, o) {
    const B = BLOCK;
    const { l, half, kind } = room;
    const H = half; // +1 back (v > 0), −1 front
    const clear = (u0, u1, v0, v1, m = 1.0) => {
        const a0 = Math.min(u0, u1) - 0.5, a1 = Math.max(u0, u1) + 0.5, b0 = Math.min(v0, v1) - 0.5, b1 = Math.max(v0, v1) + 0.5;
        for (const [a, b] of legs) if (rectSegDist(a0, a1, b0, b1, a, b) < m) return false;
        // inside the room's half, off the stair band
        for (const [u, v] of [[a0, b0], [a1, b0], [a0, b1], [a1, b1]]) if (Math.hypot(u, v) > 11.3 || v * H < 0.4) return false;
        return true;
    };
    const occ = new Set(); // the floor cells with furniture on them ('u,v')
    /** A box of furniture (rot-local u, mirrored v by the half: b > 0 = away from the dividing wall). */
    const box = (u0, u1, l0, l1, b0, b1, t) => {
        const v0 = H * b0, v1 = H * b1;
        if (!clear(u0, u1, v0, v1)) return false;
        p.box(u0, u1, l + l0, l + l1, v0, v1, t);
        if (l0 <= 2) for (let u = Math.min(u0, u1); u <= Math.max(u0, u1); u++) for (let v = Math.min(v0, v1); v <= Math.max(v0, v1); v++) occ.add(u + ',' + v); // (what stands on the floor: the stands keep off it)
        return true;
    };
    const floorMark = (u0, u1, b0, b1, t) => p.box(u0, u1, l - 1, l - 1, H * b0, H * b1, t); // (in the floor: never in the way)
    const yawTo = (du, db) => p.yaw(Math.atan2(-du, -(H * db))); // local facing of a (du, dv) direction: yaw 0 = towards −v
    const chest = (u, b, fu, fb, roomTag) => {
        if (kind === 'library' || kind === 'reading') return false; // (no chests in a library)
        const v = H * b;
        if (!clear(u - 0.6, u + 0.6, v - 0.5, v + 0.5)) return false;
        o.chests.push({ ...p.pt(u, v, l), yaw: yawTo(fu, fb), room: roomTag });
        return true;
    };
    const bed = (u, b) => {
        // pillow at the dividing wall: the bed (2.5 × 5.5 m) lies along v
        const v = H * b;
        if (!clear(u - 1.25 + 0.5, u + 1.25 - 0.5, v - 2.75 + 0.5, v + 2.75 - 0.5, 1.0)) return false;
        o.bedSpots.push({ ...p.pt(u, v, l), yaw: yawTo(0, -1) });
        return true;
    };
    const spot = (kind2, u, b, nu, nb, extra = {}) => { o.spots.push({ kind: kind2, ...p.pt(u, H * b, l), nu, nv: H * nb, l, ...extra }); };
    const firstOf = (cands, f) => { for (const c of cands) if (f(...c)) return c; return null; };
    const lamp = (u, b) => p.box(u, u, l + 5, l + 5, H * b, H * b, B.ARCANE_LAMP);
    /**
     * Reading stands of the world's history (LoreStand.js): up to `max` of them in this half-room, each on a post
     * of two blocks with a free cell before it (the reader stands there), keeping off the shelves, the ways and
     * each other; they face the middle of the room. A book lies on each (LoreLibrary.js — LoreBooks.js).
     */
    const loreStands = (max) => {
        const free = (u, v) => !occ.has(u + ',' + v) && !o.res.has(l + ':' + u + ',' + v) && clear(u, u, v, v, 1.0);
        const crowded = (u, v) => { for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) if (o.res.has('p' + l + ':' + (u + a) + ',' + (v + c))) return true; return false; }; // (a stand next to it, even a corner: the boards would meet)
        for (let b = 3; b <= 10 && max > 0 && o.lore.length < 7; b++) {
            for (let u = -10; u <= 10 && max > 0 && o.lore.length < 7; u++) {
                const v = H * b;
                if (!free(u, v) || crowded(u, v)) continue;
                const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([du, db]) => free(u + du, H * (b + db)) && free(u + 2 * du, H * (b + 2 * db)) && free(u + db, v + H * du) && free(u - db, v - H * du));
                if (!dirs.length) continue;
                dirs.sort((a2, c) => (c[0] * -u + c[1] * (6 - b)) - (a2[0] * -u + a2[1] * (6 - b))); // (towards the middle of the room first)
                const [du, db] = dirs[0];
                box(u, u, 0, 1, b, b, B.PLANKS_DARK);
                o.res.add('p' + l + ':' + u + ',' + v);
                for (const k of [1, 2]) o.res.add(l + ':' + (u + k * du) + ',' + H * (b + k * db)); // (where the reader stands: no stand there)
                const q = p.pt(u, v, l), r = p.pt(u + du, H * (b + db), l);
                o.lore.push({ x: q.x, y: q.y, z: q.z, face: Math.atan2(r.x - q.x, r.z - q.z) });
                max--;
            }
        }
    };
    switch (kind) {
        case 'vault': {
            let n = 0;
            for (const [u, b] of [[-7, 3], [-4, 8], [6, 6], [7, 3], [-7, 6], [4, 8], [-2, 9], [2, 9]]) if (n < 3 && chest(u, b, -Math.sign(u) || 1, 0, 'vault')) n++;
            for (let a = 0; a < 16; a++) { const u = Math.round(3 * Math.cos(a * TAU / 16)) + 4, b = Math.round(3 * Math.sin(a * TAU / 16)) + 5; if (b > 1) floorMark(u, u, b, b, B.RUNE); }
            box(-9, -8, 0, 0, 5, 7, B.GOLD); box(-8, -8, 1, 1, 6, 6, B.GOLD);
            lamp(-3, 4); lamp(4, 5);
            break;
        }
        case 'store': {
            for (const [u, b] of [[-8, 3], [-8, 6], [7, 3], [7, 6], [-5, 8], [4, 8]]) box(u, u + 1, 0, 1, b, b + 1, B.PLANKS);
            box(-6, -5, 0, 0, 3, 4, B.HAY);
            if (box(5, 8, 0, 0, 9, 9, B.PLANKS_DARK)) box(5, 8, 1, 1, 9, 9, B.POTION);
            chest(-3, 9, 0, -1, 'store');
            lamp(0, 7);
            break;
        }
        case 'hall': {
            for (const [u0, u1] of [[-8, -4], [3, 7]]) {
                if (box(u0, u1, 0, 1, 6, 8, B.PLANKS)) { box(u0, u1, 0, 0, 4, 4, B.PLANKS_DARK); box(u0, u1, 0, 0, 10, 10, B.PLANKS_DARK); }
            }
            for (let a = 0; a < 8; a++) { const u = Math.round(3.5 * Math.cos(a * TAU / 8)), b = Math.round(6 + 3.5 * Math.sin(a * TAU / 8)); p.box(u, u, l + 5, l + 5, H * b, H * b, B.ARCANE_LAMP); }
            for (const u of [-8, -5, 5, 8]) p.box(u, u, l + 1, l + 4, H * 1, H * 1, B.CARPET_PURPLE); // banners on the wall
            break;
        }
        case 'shop': {
            // the scroll counter at the left wall, the seller behind it
            p.box(-9, -8, l, l + 1, -5, -1, B.PLANKS_DARK);
            p.box(-9, -8, l + 1, l + 1, -4, -2, B.CLOTH_WHITE);
            o.stall.front = p.pt(-6, -3, l);
            o.stall.back = p.pt(-10.5, -3, l);
            o.stall.frontNode = p.node(-6, -3, l, 'stall');
            p.link(o.stall.frontNode, p.node(0, -6, l));
            o.stall.counter = { ...p.rect(-9, -8, -5, -1), top: p.L(l + 1) - 0.5 };
            o.stall.yaw = p.yaw(-Math.PI / 2);
            box(6, 8, 0, 3, 3, 3, B.BOOKS);
            for (let a = 0; a < 12; a++) { const u = Math.round(2.4 * Math.cos(a * TAU / 12)), b = Math.round(9 + 2.4 * Math.sin(a * TAU / 12)); floorMark(u, u, b, b, B.RUNE); }
            lamp(-4, 4); lamp(4, 4);
            break;
        }
        case 'library': {
            for (let u = -10; u <= 10; u++) if (Math.abs(u) >= 2) box(u, u, 0, 4, 1, 1, B.BOOKS);
            for (const deg of [35, 60, 120, 145]) {
                const a = deg * DEG;
                for (let r = 4; r <= 8; r++) { const u = Math.round(r * Math.cos(a)), b = Math.round(r * Math.sin(a)); box(u, u, 0, 3, b, b, B.BOOKS); }
            }
            box(-2, 2, 0, 1, 9, 9, B.PLANKS_DARK);
            lamp(-5, 5); lamp(5, 5);
            loreStands(7); // (the stands of the world's history: what room is left after the shelves)
            break;
        }
        case 'reading': {
            for (const u of [-6, 6]) { box(u, u, 0, 1, 4, 4, B.PLANKS_DARK); box(u, u, 2, 2, 4, 4, B.BOOKS); }
            for (const [u, b] of [[-7, 8], [7, 8], [-3, 9], [3, 9]]) box(u, u, 0, 0, b, b, B.CARPET_PURPLE);
            if (box(5, 5, 0, 0, 8, 8, B.PLANKS_DARK)) box(5, 5, 1, 1, 8, 8, B.ARCANE_LAMP);
            lamp(0, 9);
            loreStands(3); // (the stands the library had no room for)
            break;
        }
        case 'classroom': {
            p.box(-7, -2, l + 1, l + 4, 0, 0, B.CS_DARK); p.box(2, 7, l + 1, l + 4, 0, 0, B.CS_DARK); // the blackboard
            box(3, 3, 0, 1, 2, 2, B.PLANKS_DARK); // the lectern
            spot('lectern', 3, 3, 3, 4, { yaw: yawTo(0, 1) });
            for (const b of [5, 7]) { box(-7, -2, 0, 0, b, b, B.PLANKS); box(2, 7, 0, 0, b, b, B.PLANKS); }
            let d = 0;
            for (const [u, b] of [[-8, 3], [8, 3], [-7, 8], [7, 8], [-5, 9], [5, 9]]) {
                if (d >= 2) break;
                if (box(u, u, 0, 1, b, b, B.FENCE)) { p.box(u, u, l + 2, l + 3, H * b, H * b, B.HAY); o.dummies.push({ ...p.pt(u, H * b, l), top: p.L(l + 3) }); d++; }
            }
            for (const u of [-4, 4]) spot('desk', u, 6, u, 6);
            lamp(-4, 6); lamp(4, 6);
            break;
        }
        case 'teachers': {
            box(-6, -3, 0, 1, 7, 8, B.PLANKS_DARK);
            box(3, 6, 0, 3, 9, 9, B.BOOKS);
            for (const [u, b] of [[-7, 4], [6, 4]]) box(u, u, 0, 0, b, b, B.CARPET_PURPLE);
            lamp(0, 8);
            break;
        }
        case 'alchemy': {
            let n = 0;
            firstOf([[-5, 6], [5, 6], [-6, 9], [6, 9], [-3, 9], [3, 9], [-6, 3], [6, 3]], (u, b) => {
                if (n >= 2) return true;
                if (!clear(u - 2, u + 2, H * (b - 2), H * (b + 2))) return false;
                p.cyl(u, H * b, 1.5, l, l, B.COBBLE, 0.6);
                p.box(u, u, l, l, H * b, H * b, B.POTION);
                spot('cauldron', u, b, u, b - 2 * Math.sign(b), { yaw: yawTo(0, 1) });
                n++;
                return false;
            });
            box(-9, -8, 0, 2, 4, 4, B.PLANKS_DARK); box(-9, -8, 3, 3, 4, 4, B.POTION);
            lamp(0, 7);
            break;
        }
        case 'herbs': {
            for (const [u, b] of [[-7, 4], [-7, 7], [6, 4], [6, 7]]) if (box(u, u + 1, 0, 0, b, b + 1, B.PLANKS)) box(u, u + 1, 1, 1, b, b + 1, B.FLOWERS);
            for (const u of [-4, 0, 4]) p.box(u, u, l + 5, l + 5, H * 9, H * 9, B.WHEAT);
            lamp(0, 5);
            break;
        }
        case 'common': {
            for (const u of [7, 4, -7, -4]) if (o.bedSpots.filter((s) => s.room === 'common').length < 2 && bed(u, 3.35)) o.bedSpots[o.bedSpots.length - 1].room = 'common';
            box(-9, -9, 0, 3, 5, 7, B.COBBLE); box(-9, -9, 0, 0, 6, 6, B.LANTERN); // the fireplace
            for (const [u, b] of [[-6, 9], [-3, 10]]) box(u, u, 0, 0, b, b, B.CARPET_PURPLE);
            box(-5, -4, 0, 0, 6, 7, B.CS_DARK); // a chessboard table
            lamp(0, 8);
            break;
        }
        case 'dorm': {
            for (const u of [-7, -4, 4, 7, -10, 10]) if (o.bedSpots.filter((s) => s.room === 'dorm').length < 4 && bed(u, 3.35)) o.bedSpots[o.bedSpots.length - 1].room = 'dorm';
            box(-2, 2, 0, 0, 9, 9, B.PLANKS_DARK);
            lamp(0, 8);
            break;
        }
        case 'study': {
            // the Master's chair (facing the door), the desk before it, gold, a crystal ball
            p.box(0, 0, l, l, 7, 7, B.PLANKS_DARK);
            p.box(-1, 1, l + 1, l + 3, 8, 8, B.PLANKS_DARK);
            p.box(0, 0, l + 4, l + 4, 8, 8, B.ARCANE_LAMP_VIOLET);
            o.set('throne', { ...p.pt(0, 7, l + 1), yaw: p.yaw(0) });
            o.set('throneFront', p.pt(0, 3, l));
            box(-3, -2, 0, 1, 6, 7, B.PLANKS_DARK); box(-3, -3, 2, 2, 6, 6, B.GOLD); box(-2, -2, 2, 2, 7, 7, B.ARCANE_LAMP);
            for (const u of [-8, -7, 6, 7]) box(u, u, 0, 4, 2, 2, B.BOOKS);
            firstOf([[5, 7], [-6, 4], [5, 4], [-5, 8], [7, 5], [-7, 7], [6, 3], [-4, 3], [-8, 5]], (u, b) => chest(u, b, 0, -1, 'study'));
            for (let a = 0; a < 5; a++) { const u = Math.round(2 * Math.cos(a * TAU / 5)) - 5, b = Math.round(2 * Math.sin(a * TAU / 5)) + 5; floorMark(u, u, b, b, B.RUNE); }
            lamp(-4, 5); lamp(4, 5);
            break;
        }
        case 'observatory': {
            // the golden telescope, rising through a cut in the roof
            p.box(3, 7, ROOF_L, ROOF_L + 3, -14, -8, B.AIR);
            box(5, 5, 0, 0, 4, 4, B.PLANKS_DARK);
            for (let k = 0; k <= 6; k++) p.box(5, 5, l + 1 + k, l + 1 + k, -4 - k, -4 - k, B.GOLD);
            spot('telescope', 3, 4, 3, 4, { yaw: yawTo(1, 1) });
            for (let a = 0; a < 7; a++) { const u = Math.round(4 * Math.cos(a * TAU / 7)), b = Math.round(7 + 2 * Math.sin(a * TAU / 7)); if (b > 1) floorMark(u, u, b, b, B.RUNE); }
            lamp(-5, 5);
            break;
        }
        default: break;
    }
}

// ------------------------------------------------------------- the grounds
function buildGrounds(p, rng, out) {
    const B = BLOCK;
    // the plaza with a ring of runes and four obelisks
    p.cyl(0, 0, 26, -1, -1, B.COBBLE);
    p.cyl(0, 0, 22, -1, -1, B.RUNE, 21);
    for (let i = 0; i < 4; i++) {
        const a = (45 + 90 * i) * DEG;
        const u = Math.round(23 * Math.cos(a)), v = Math.round(23 * Math.sin(a));
        p.box(u, u, 0, 4, v, v, B.ARCANE_DARK);
        p.box(u, u, 5, 5, v, v, B.ARCANE_LAMP);
    }
    // lamp pillars before the door
    for (const su of [-1, 1]) { p.box(su * 5, su * 5, 0, 3, -20, -20, B.ARCANE_DARK); p.box(su * 5, su * 5, 4, 4, -20, -20, B.ARCANE_LAMP); }
    // the ring road and the road to the door (3 wide)
    const R = 33;
    const road = (u0, u1, v0, v1) => p.box(u0, u1, -1, -1, v0, v1, B.PATH);
    road(-R - 1, R + 1, -R - 1, -R + 1); road(-R - 1, R + 1, R - 1, R + 1);
    road(-R - 1, -R + 1, -R - 1, R + 1); road(R - 1, R + 1, -R - 1, R + 1);
    road(-1, 1, -TOWER_ZONE, -26);
    for (let v = -54; v <= -30; v += 10) for (const su of [-1, 1]) { p.box(su * 3, su * 3, 0, 2, v, v, B.FENCE); p.box(su * 3, su * 3, 3, 3, v, v, B.ARCANE_LAMP); }
    // the gate arch
    for (const su of [-1, 1]) p.box(su * 3, su * 3, 0, 6, -52, -52, B.ARCANE_DARK);
    p.box(-3, 3, 7, 7, -52, -52, B.ARCANE_DARK);
    p.box(0, 0, 8, 8, -52, -52, B.ARCANE_LAMP_VIOLET);
    // the walking graph along the roads
    const roadNodes = (axis, fixed, from, to) => {
        p.roadLine(axis, fixed, from, to);
        for (let t = from; t <= to; t += 11) p.node(axis === 'u' ? t : fixed, axis === 'u' ? fixed : t, 0);
        p.node(axis === 'u' ? to : fixed, axis === 'u' ? fixed : to, 0);
    };
    roadNodes('u', -R, -R, R); roadNodes('u', R, -R, R);
    roadNodes('v', -R, -R, R); roadNodes('v', R, -R, R);
    p.roadLine('v', 0, -TOWER_ZONE + 2, -22);
    p.node(0, -TOWER_ZONE + 2, 0, 'gateOut'); p.node(0, -44, 0); p.node(0, -R, 0, 'ring');
    out.posts = [{ ...p.pt(-4, -24, 0), yaw: p.yaw(0) }, { ...p.pt(4, -24, 0), yaw: p.yaw(0) }];
}

/**
 * The great door of the academy in its high doorway (5 wide, 6 high: the pointed hats pass): it
 * stands closed; the wizards open it as they come (Houses), a player with the hand (Doors.js).
 */
function towerDoor(p) {
    const o = p.pt(0, 0), q = p.pt(1, 0), d = p.pt(0, -(R_IN + 1));
    return { x: d.x, y: d.y, z: d.z, ry: inwardRy(Math.atan2(-(q.z - o.z), q.x - o.x), o.x - d.x, o.z - d.z), w: 5, h: 6 }; // (opens into the tower)
}

/** 4–6 wizards' houses on lots facing the ring road; their doors join the road. */
function buildWizardHouses(p, rng, out) {
    const B = BLOCK;
    const lots = [
        { u: -42, v: -10, face: 1 }, { u: -42, v: 12, face: 1 },
        { u: 42, v: -10, face: 3 }, { u: 42, v: 12, face: 3 },
        { u: -12, v: 42, face: 0 }, { u: 12, v: 42, face: 0 },
    ];
    // a shuffle; keep 4–6
    for (let i = lots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [lots[i], lots[j]] = [lots[j], lots[i]]; }
    const n = 4 + Math.floor(rng() * 3);
    const kinds = ['cottage', 'manor', 'towerhouse', 'cottage', 'stone'];
    const decorate = (P, { w, d, da, top, house, table, cauldron }) => {
        // a cauldron at the hearth, a crystal ball on the table, herbs under the window, lamps
        if (cauldron) P.box(cauldron[0], cauldron[0], 0, 0, cauldron[1], cauldron[1], B.POTION);
        if (table) P.box(table[0], table[0], 2, 2, table[1], table[1], B.ARCANE_LAMP);
        P.box(w - 2, w - 2, 0, 0, -d - 1, -d - 1, B.FLOWERS);
        P.box(0, 0, top, top, 0, 0, B.ARCANE_LAMP_VIOLET);
        P.box(da + 2, da + 2, 4, 4, -d - 1, -d - 1, B.ARCANE_LAMP);
        house.wizard = true;
    };
    const style = {
        houseStone: B.ARCANE, villageRoof: B.ROOF_PURPLE, poorRoof: rng() < 0.35 ? B.ROOF_BLUE : B.ROOF_PURPLE, poorWall: B.PLASTER,
        roof: B.ROOF_PURPLE, carpet: B.CARPET_PURPLE, bedRich: 'purple', doorTop: 5, noWoodpile: true, decorate,
    };
    lots.slice(0, n).forEach((lot, i) => {
        const kind = kinds[Math.floor(rng() * kinds.length)];
        const door = buildHouse(p, kind, lot.u, lot.v, lot.face, rng, style, out);
        const [ra, rb] = rotLot(0, -9, lot.face);
        const road = p.node(lot.u + ra, lot.v + rb, 0);
        p.link(door, road);
        if (i === 0) out.potionStall = potionStall(p, lot, road);
    });
}

/**
 * The little shop of the master of cauldrons and potions, by the first wizards' house: a counter
 * beside the house towards the road (flasks and ingredients on it), the master behind it, and
 * a big cauldron for sale standing next to it (Cauldrons.js puts it out).
 */
function potionStall(p, lot, road) {
    const B = BLOCK;
    const at = (a, b) => { const [x, z] = rotLot(a, b, lot.face); return [lot.u + x, lot.v + z]; };
    const box = (a0, a1, l0, l1, b0, b1, t) => { const [u0, v0] = at(a0, b0), [u1, v1] = at(a1, b1); p.box(u0, u1, l0, l1, v0, v1, t); };
    const pt = (a, b, l = 0) => { const [u, v] = at(a, b); return p.pt(u, v, l); };
    box(8, 11, 0, 1, -7, -7, B.PLANKS_DARK); // the counter
    box(8, 11, 1, 1, -7, -7, B.CLOTH_WHITE);
    box(8, 8, 2, 2, -7, -7, B.POTION); // a potion bottle for a sign
    box(11, 11, 0, 3, -5, -5, B.PLANKS_DARK); // a post with a lamp
    box(11, 11, 4, 4, -5, -5, B.ARCANE_LAMP);
    const [fu, fv] = at(9, -9), frontNode = p.node(fu, fv, 0, 'stall');
    p.link(frontNode, road);
    const c0 = pt(8, -7), c1 = pt(11, -7);
    const o = pt(0, 0), f = pt(0, -1);
    const caul = pt(13.5, -5);
    return {
        potions: true, // (Cauldrons.js / CastleTalk.js: what this master sells)
        front: pt(9.5, -9), back: pt(9.5, -5), frontNode,
        counter: { x0: Math.min(c0.x, c1.x), x1: Math.max(c0.x, c1.x), z0: Math.min(c0.z, c1.z), z1: Math.max(c0.z, c1.z), top: p.L(1) - 0.5 },
        yaw: Math.atan2(-(f.x - o.x), -(f.z - o.z)), // (facing the road)
        cauldron: { x: caul.x, y: caul.y, z: caul.z, yaw: Math.atan2(f.x - o.x, f.z - o.z) },
    };
}

/** The whole site: tower, grounds, houses. Returns the castle-shaped record. */
export function buildTowerSite(seed, gx, gz, X, Z, F, rng) {
    const rot = Math.floor(rng() * 4);
    const p = new Plan(X, Z, F, rot);
    const out = { houses: [], pens: [], chests: [] };
    buildGrounds(p, rng, out);
    buildWizardHouses(p, rng, out);
    buildTower(p, rng, out);
    p.joinRoads();
    // link the tower gate to the road
    p.link(out.gateNode, p.node(0, -33, 0));
    const id = 'wt' + gx + '_' + gz;
    const name = `Академия «${NAMES_A[Math.floor(rng() * NAMES_A.length)]} ${NAMES_B[Math.floor(rng() * NAMES_B.length)]}»`;
    const masterFirst = MASTER_A[Math.floor(rng() * MASTER_A.length)];
    void MASTER_B[Math.floor(rng() * MASTER_B.length)]; // (the rng goes on as before: the same tower)
    const master = TOWER_MASTER;
    const population = 24 + Math.floor(rng() * 25);
    const teachers = 3 + Math.floor(rng() * 3);
    const houses = out.houses.map((h, i) => ({ ...h, id: id + '_h' + i }));
    // the tower itself as a «house» (glass in its windows, the students' beds)
    houses.push({
        kind: 'tower', rich: true, wizard: true, id: id + '_h' + houses.length, c: p.pt(0, 0), r: R_OUT + 1,
        doorRec: towerDoor(p), windows: out.windows, chests: [], bedSpots: out.bedSpots.map(({ room, ...b }) => b), homeNode: out.dormNode, doorNode: out.gateNode,
        door: p.pt(0, -22), inside: p.pt(0, -6, 28), beds: out.bedSpots.length, bedColour: 'purple',
    });
    const def = {
        id, kind: 'tower', gx, gz, x: X, z: Z, F, rot, name, king: master, master, masterFemale: FEMALE_MASTERS.has(masterFirst),
        color: 0x6a2c91, colorName: 'фиолетовые', stone: BLOCK.ARCANE, zone: TOWER_ZONE,
        style: 'tower', styleName: 'Академия',
        walls: p.rect(-19, 19, -19, 19), inner: p.rect(-R_IN, R_IN, -R_IN, R_IN), keep: p.rect(-R_IN, R_IN, -R_IN, R_IN),
        gate: p.pt(0, -22), gateIn: p.pt(0, -12), gateYaw: p.yaw(0), door: p.pt(0, -22), doorIn: p.pt(0, -12),
        population, knights: 0, teachers, wseed: seed, // (the world's seed: the wizards' ranks — WizardAI.wizardRoster)
        throne: out.throne, throneFront: out.throneFront, posts: out.posts,
        rooms: out.rooms, chests: out.chests.map((c, i) => ({ ...c, id: id + '_ch' + i })),
        houses, stalls: [out.stall, out.potionStall].filter(Boolean), fields: [], pens: [], market: null, wallWalk: [],
        dummies: out.dummies, spots: out.spots,
        lore: out.lore, // (the desk of the library: where the books of the world's history lie — LoreLibrary.js)
        nodes: p.nodes, edges: p.edges, parts: p.parts,
        topL: F + 1 + ROOF_L + 14,
    };
    def._byChunk = new Map();
    return def;
}

// ------------------------------------------------------------- placement
/** Level, dry, low ground for a tower at (X, Z)? */
export function flatDryGround(raw, X, Z) {
    let wet = 0, all = 0;
    const hs = [];
    const lush = !!raw.land; // (generation 5's plains roll a little more: see CastleIndex)
    for (let dz = -TOWER_ZONE; dz <= TOWER_ZONE; dz += 8) for (let dx = -TOWER_ZONE; dx <= TOWER_ZONE; dx += 8) {
        const h = raw(X + dx, Z + dz);
        all++;
        if (raw.water) { wet++; continue; }
        if (h > (lush ? 11 : 9)) return false;
        hs.push(h);
    }
    if (wet > all * 0.15 || hs.length < 10) return false;
    hs.sort((a, b) => a - b);
    return hs[Math.floor(hs.length * 0.9)] - hs[Math.floor(hs.length * 0.1)] <= (lush ? 7 : 6);
}

/** Finds and remembers the towers (the same shape of answers as CastleIndex). */
export class TowerIndex {
    constructor(seed, raw, castles) {
        this.seed = seed; this.raw = raw; this.castles = castles;
        this.cells = new Map();
        this._lastCell = null;
        this._spawn = undefined;
        this._wander = new Map();
    }

    _key(gx, gz) { return gx * 65536 + gz; }

    cellOf(gx, gz) {
        const key = this._key(gx, gz);
        if (this.cells.has(key)) return this.cells.get(key);
        const t = this._makeTower(gx, gz);
        this.cells.set(key, t);
        return t;
    }

    _rng(gx, gz) { return createRng((this.seed * 31337 + gx * 7919 + gz * 104723) >>> 0); }

    /** The first good spot of a cell (or null), and the rng to go on with. */
    _place(gx, gz) {
        const rng = this._rng(gx, gz);
        for (let t = 0; t < TRIES; t++) {
            const X = Math.round(gx * CASTLE_CELL + TOWER_M + rng() * TOWER_SPAN);
            const Z = Math.round(gz * CASTLE_CELL + TOWER_M + rng() * TOWER_SPAN);
            if (Math.hypot(X, Z) < MIN_SPAWN) continue;
            if (!flatDryGround(this.raw, X, Z)) continue;
            return { X, Z, rng };
        }
        return null;
    }

    /**
     * The cell of the world's one tower (a key, or −1): the nearest good castle-free cell 0.5–1.3 km from
     * the spawn (the same cell old worlds had there), else the nearest good one further out.
     */
    spawnKey() {
        if (this._spawn !== undefined) return this._spawn;
        this._spawn = -1; this._spawnCell = null; // (a key may be negative — even −1, the cell (0, −1): ask _spawnCell)
        const cells = [];
        const n = Math.ceil(FAR_RING / CASTLE_CELL) + 1;
        for (let gz = -n; gz <= n; gz++) for (let gx = -n; gx <= n; gx++) {
            const d = Math.hypot((gx + 0.5) * CASTLE_CELL, (gz + 0.5) * CASTLE_CELL);
            if (d >= SPAWN_RING[0] && d <= FAR_RING) cells.push({ gx, gz, d, ring: d <= SPAWN_RING[1] ? 0 : 1 });
        }
        cells.sort((a, b) => a.ring - b.ring || a.d - b.d || a.gx - b.gx || a.gz - b.gz);
        for (const c of cells) {
            if (offEarth((c.gx + 1) * CASTLE_CELL)) continue;
            if (this.castles.cellOf(c.gx, c.gz)) continue;
            if (this._place(c.gx, c.gz)) { this._spawn = this._key(c.gx, c.gz); this._spawnCell = c; this.cells.delete(this._spawn); break; } // (asked while it was being found: not yet known then)
        }
        return this._spawn;
    }

    /** The world's one tower (null only when no place on the Earth would do). */
    only() {
        this.spawnKey();
        if (!this._spawnCell) return null;
        return this.cellOf(this._spawnCell.gx, this._spawnCell.gz);
    }

    _makeTower(gx, gz) {
        if (offEarth((gx + 1) * CASTLE_CELL)) return null; // (no towers on other planets)
        if (this.castles.cellOf(gx, gz)) return null; // (one site per cell)
        this.spawnKey();
        const c = this._spawnCell;
        if (!c || c.gx !== gx || c.gz !== gz) return null; // (the one tower of the world)
        const at = this._place(gx, gz);
        if (!at) return null;
        return buildTowerSite(this.seed, gx, gz, at.X, at.Z, 0, at.rng);
    }

    /**
     * A tower an old world had here and has no more (the world keeps one tower now): its land rect
     * {x0, x1, z0, z1} or null. Its saved block edits lay on its walls — on the bare land now they would
     * be holes and floating stones, so the save drops them (WorldSave.restoreWorld). Cached per cell.
     */
    isLost(gx, gz) {
        const key = this._key(gx, gz);
        const lost = this._lost || (this._lost = new Map());
        if (lost.has(key)) return lost.get(key);
        let r = null;
        this.spawnKey();
        const one = this._spawnCell && this._spawnCell.gx === gx && this._spawnCell.gz === gz;
        if (!offEarth((gx + 1) * CASTLE_CELL) && !one && !this.castles.cellOf(gx, gz)
            && hash01(gx * 11 + 3, gz * 13 + 5, this.seed + 1700) <= TOWER_P) {
            const at = this._place(gx, gz);
            if (at) { const m = TOWER_ZONE + BLEND; r = { x0: at.X - m, x1: at.X + m, z0: at.Z - m, z1: at.Z + m }; }
        }
        lost.set(key, r);
        return r;
    }

    /** Drops the saved block edits [x, L, z, block] that lay on towers an old world has no more. */
    dropLostEdits(edits) {
        return edits.filter((e) => {
            if (!Array.isArray(e)) return true;
            const r = this.isLost(Math.floor(e[0] / CASTLE_CELL), Math.floor(e[2] / CASTLE_CELL));
            return !r || e[0] < r.x0 || e[0] > r.x1 || e[2] < r.z0 || e[2] > r.z1;
        });
    }

    /** Towers whose land reaches within `r` of a point. */
    near(x, z, r = 0) {
        if (offEarth(x - r)) return [];
        const out = [];
        const g0x = Math.floor((x - r) / CASTLE_CELL) - 1, g1x = Math.floor((x + r) / CASTLE_CELL) + 1;
        const g0z = Math.floor((z - r) / CASTLE_CELL) - 1, g1z = Math.floor((z + r) / CASTLE_CELL) + 1;
        for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
            const c = this.cellOf(gx, gz);
            if (!c) continue;
            if (Math.max(Math.abs(c.x - x), Math.abs(c.z - z)) <= c.zone + BLEND + r) out.push(c);
        }
        return out;
    }

    /** Towers already known (no generation): for talk and the wanderers. */
    knownNear(x, z, r) {
        const out = [];
        for (const c of this.cells.values()) if (c && Math.hypot(c.x - x, c.z - z) <= r) out.push(c);
        return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    }

    landAt(ix, iz) {
        const gx = Math.floor(ix / CASTLE_CELL), gz = Math.floor(iz / CASTLE_CELL);
        let c = this._lastCell;
        if (!c || c.gx !== gx || c.gz !== gz) c = this._lastCell = { gx, gz, castle: this.cellOf(gx, gz) };
        const k = c.castle;
        if (!k) return null;
        const d = Math.max(Math.abs(ix - k.x), Math.abs(iz - k.z));
        if (d > k.zone + BLEND) return null;
        const w = d <= k.zone ? 1 : 1 - (d - k.zone) / BLEND;
        return { castle: k, w: w * w * (3 - 2 * w) };
    }

    partsForChunk(cx, cz, CHUNK) {
        const x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = x0 + CHUNK - 1, z1 = z0 + CHUNK - 1;
        const out = [];
        for (const c of this.near(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK)) {
            const key = cx * 65536 + cz;
            let list = c._byChunk.get(key);
            if (!list) {
                list = c.parts.filter((q) => q.x1 >= x0 && q.x0 <= x1 && q.z1 >= z0 && q.z0 <= z1);
                c._byChunk.set(key, list);
            }
            if (list.length) out.push(list);
        }
        return out;
    }

    nearestForMap(p, r = 900) {
        const now = Math.floor(p.x / 40) + ',' + Math.floor(p.z / 40);
        if (this._mapKey !== now) {
            this._mapKey = now;
            this._mapList = this.near(p.x, p.z, r).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 1);
        }
        return this._mapList;
    }

    /**
     * The people of the roads of a 700 m cell (no land, no blocks): `type` 'ww' wandering wizards,
     * 'wk' knights errant (their roster: knights from number 1 on), 'wc' travelling folk (farmers,
     * builders, merchants from number 1 on). Travelers.js leads them; the site follows its party.
     */
    wanderDef(gx, gz, type = 'ww') {
        const key = type + this._key(gx, gz);
        let d = this._wander.get(key);
        if (!d) {
            const kind = type === 'wk' ? 'errant' : type === 'wc' ? 'folk' : 'wander';
            d = {
                id: type + gx + '_' + gz, kind, gx, gz, x: (gx + 0.5) * WANDER_CELL, z: (gz + 0.5) * WANDER_CELL, F: 0,
                wseed: this.seed, population: type === 'ww' ? 3 : 40, knights: type === 'wk' ? 99 : 0, stalls: [], houses: [], chests: [], nodes: [], edges: [], pens: [], fields: [], rooms: [], posts: [],
                wallWalk: [], zone: 0, color: type === 'wk' ? 0x6b4a2a : 0x7a6a55, colorName: 'серые', name: kind === 'errant' ? 'Странствующие рыцари' : kind === 'folk' ? 'Путники' : 'Дороги', king: '', parts: [], _byChunk: new Map(),
            };
            this._wander.set(key, d);
        }
        return d;
    }
}

export const WANDER_GRID = WANDER_CELL;
