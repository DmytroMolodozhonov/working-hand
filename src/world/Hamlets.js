/**
 * Hamlets.js — the small places of the world between the castles (the author: «хочу сделать мир живым:
 * ты идёшь и видишь — тут одни живут, там другие, мир разнообразен»):
 *
 *  - 'magehut'      a lone wizard's house: small and beautiful — arcane stone, a violet roof, glowing
 *                   lamps, a rune circle before the door, a herb garden, a crystal obelisk; a weak or a
 *                   middling wizard lives there (never a strong one); a chest of magic things inside; the
 *                   house stands under «Protection House» (HamletLife.js);
 *  - 'hermit'       a lone hermit's hut: an ordinary person without magic, a vegetable plot, a woodpile,
 *                   a ring of stones for a fire; a chest of simple things;
 *  - 'magevillage'  4–9 wizards' houses round a round fire in the middle, weak and middling wizards (each
 *                   with a chest of his own), 3–4 weak sellers of magic things at their stalls;
 *  - 'village'      4–9 ordinary houses round a fire (farmers, builders), a field or two, a watchman.
 *
 * The site records have the shape of a castle's (src/world/Castles.js), so the people, the houses, the
 * doors, the beds, the chests, the night and the saves work on them as on castles (CastleLife + the
 * hamlets' own day and night — src/game/HamletLife.js). Placement: the castle grid (480 m), up to SLOTS
 * spots a cell; never on a castle's / a tower's land, the Ice Castle, water, steep or high ground.
 * Pure data, deterministic from the seed (every computer makes the same), made in the workers too
 * (terrain.worker.js 'site'). Their land is levelled like a castle's, over a short slope (HAMLET.BLEND).
 *
 * (Imports Terrain.js for BLOCK: never read BLOCK at the top level here.)
 */

import { pawnStall } from './PawnStall.js';
import { BLOCK } from './Terrain.js';
import { CASTLE_CELL, hash01, Plan, buildHouse, buildWizHut, rotLot, POOR_HOUSES } from './Castles.js';
import { createRng } from '../core/math.js';
import { offEarth } from './Planets.js';

export const HAMLET = {
    SLOTS: 3, // spots a castle cell may hold
    CHANCE: 0.5, // a spot holds something this often (before its ground is checked)
    // …and a spot left empty holds a lone wizard's house this often more (the author: lone wizards' houses 37 % more often —
    // 0.15 a spot → 0.2055). Laid after the others, in spots that were empty: the hamlets already in a world stay as they were.
    EXTRA_MAGEHUT: 0.0555,
    WEIGHTS: { magehut: 0.3, hermit: 0.3, village: 0.25, magevillage: 0.15 },
    BLEND: 14, // m of slope from the levelled land into the wild
    MIN_SPAWN: 130, // m from the world's start
    MAP_R: 800, // m: on the minimap (a pointer on the edge when beyond it) only villages this near; the lone houses are never shown
    HI: 16, SPREAD: 5, // the ground: not higher, not rougher
};
const ZONE = { magehut: 17, hermit: 15, village: 38, magevillage: 38 };
export const HAMLET_TYPES = Object.keys(ZONE);
const TRIES = 6;
/** Wizards live there (their people are wizards: WizardLife, the wizards' loot, «Lumos» at night). */
export const isMageHamlet = (def) => !!def && def.kind === 'hamlet' && (def.type === 'magehut' || def.type === 'magevillage');

const NAMES_A = ['Тихая', 'Лесная', 'Ясная', 'Медовая', 'Ольховая', 'Ручейная', 'Липовая', 'Полевая', 'Сосновая', 'Рябиновая'];
const NAMES_B = ['Заводь', 'Поляна', 'Опушка', 'Балка', 'Горка', 'Падь', 'Лука', 'Роща'];
const MAGE_A = ['Звёздная', 'Лунная', 'Туманная', 'Хрустальная', 'Сумеречная', 'Серебряная', 'Аметистовая'];
const MAGE_B = ['Поляна', 'Роща', 'Лощина', 'Обитель', 'Долина'];

// ------------------------------------------------------------- the pieces
/** A wizard's touch in a house (as the towers' cottages: WizardTowers.buildWizardHouses). */
function wizardStyle(rng) {
    const B = BLOCK;
    const decorate = (P, { w, d, da, top, house, table, cauldron }) => {
        if (cauldron) P.box(cauldron[0], cauldron[0], 0, 0, cauldron[1], cauldron[1], B.POTION);
        if (table) P.box(table[0], table[0], 2, 2, table[1], table[1], B.ARCANE_LAMP);
        P.box(w - 2, w - 2, 0, 0, -d - 1, -d - 1, B.FLOWERS);
        P.box(0, 0, top, top, 0, 0, B.ARCANE_LAMP_VIOLET);
        P.box(da + 2, da + 2, 4, 4, -d - 1, -d - 1, B.ARCANE_LAMP);
        house.wizard = true;
    };
    return {
        houseStone: B.ARCANE, villageRoof: B.ROOF_PURPLE, poorRoof: rng() < 0.35 ? B.ROOF_BLUE : B.ROOF_PURPLE, poorWall: B.PLASTER,
        roof: B.ROOF_PURPLE, carpet: B.CARPET_PURPLE, bedRich: 'purple', doorTop: 5, noWoodpile: true, decorate,
    };
}

function folkStyle(rng) {
    const B = BLOCK;
    return {
        houseStone: B.COBBLE, villageRoof: rng() < 0.5 ? B.ROOF_RED : B.THATCH, poorRoof: rng() < 0.6 ? B.THATCH : B.ROOF_RED, poorWall: rng() < 0.5 ? B.PLASTER : B.PLANKS,
        roof: B.ROOF_SLATE, carpet: B.CARPET_RED, bedRich: 'red',
    };
}

/** A 1-wide path of blocks along a straight local line (the walking nodes are made apart). */
function pathLine(p, u0, v0, u1, v1) {
    const n = Math.max(Math.abs(u1 - u0), Math.abs(v1 - v0));
    for (let i = 0; i <= n; i++) {
        const u = Math.round(u0 + (u1 - u0) * i / Math.max(1, n)), v = Math.round(v0 + (v1 - v0) * i / Math.max(1, n));
        p.box(u, u, -1, -1, v, v, BLOCK.PATH);
    }
}

/** A field of `kind` blocks (wheat or vegetables) centred at local (u, v): a farmer's place ('field'). */
function field(p, u, v, half, crop, out, link) {
    const B = BLOCK;
    p.box(u - half, u + half, -1, -1, v - half, v + half, B.FARMLAND);
    for (let k = u - half; k <= u + half; k += 2) p.box(k, k, 0, 0, v - half, v + half, crop);
    const node = p.node(u, v - half - 2, 0, 'field');
    if (link != null) p.link(node, link);
    out.fields.push({ ...p.pt(u, v, 1), ...p.rect(u - half, u + half, v - half, v + half), node });
    return node;
}

// ------------------------------------------------------------- lone houses
/** A lone wizard's house (door to −v) with its garden; returns the walking nodes made. */
function buildMageHut(p, rng, out, roomy = false) {
    const B = BLOCK;
    // (generation 7: roomy houses a wizard can walk about in — Castles.buildWizHut; older worlds keep the small ones)
    const kind = rng() < 0.45 ? (roomy ? 'wiztower' : 'towerhouse') : (roomy ? 'wizcottage' : 'cottage');
    const door = roomy ? buildWizHut(p, kind, rng, wizardStyle(rng), out) : buildHouse(p, kind, 0, 0, 0, rng, wizardStyle(rng), out);
    const h = out.houses[0];
    // a rune circle before the door with lamp posts, a path to it
    p.cyl(0, -12, 3.2, -1, -1, B.RUNE, 2.2);
    pathLine(p, 0, -7, 0, -15);
    for (const su of [-1, 1]) { p.box(su * 4, su * 4, 0, 2, -9, -9, B.ARCANE_DARK); p.box(su * 4, su * 4, 3, 3, -9, -9, B.ARCANE_LAMP); }
    // a crystal obelisk behind the house, a herb garden at the side
    p.box(-9, -9, 0, 3, 7, 7, B.ARCANE_DARK); p.box(-9, -9, 4, 4, 7, 7, B.ARCANE_LAMP_VIOLET);
    p.box(9, 12, -1, -1, 2, 7, B.FARMLAND);
    for (let v = 2; v <= 7; v += 2) p.box(9, 12, 0, 0, v, v, B.FLOWERS);
    p.box(-12, -9, 0, 0, -3, -2, B.FLOWERS);
    const yard = p.node(0, -12, 0, 'yard');
    p.link(door, yard);
    const garden = p.node(10, -1, 0, 'yard');
    p.link(yard, garden);
    out.posts.push({ ...p.pt(0, -11, 0), yaw: p.yaw(0) });
    return h;
}

/** A hermit's hut with a vegetable plot, a woodpile and a ring of stones. */
function buildHermitHut(p, rng, out) {
    const B = BLOCK;
    const kind = ['hut', 'cottage', 'hut', 'longhouse'][Math.floor(rng() * 4)];
    const door = buildHouse(p, kind, 0, 0, 0, rng, folkStyle(rng), out);
    pathLine(p, 0, -7, 0, -11);
    const yard = p.node(0, -11, 0, 'yard');
    p.link(door, yard);
    p.cyl(-7, -11, 1.6, 0, 0, B.COBBLE, 0.7); // (the ring of stones of his fire)
    p.box(-1, 1, 0, 0, -14, -14, B.WOOD); // (a log to sit on)
    field(p, 9, -9, 3, rng() < 0.5 ? B.VEG : B.WHEAT, out, yard);
}

// ------------------------------------------------------------- villages
/** The lots round the fire: 2 a side (door to the fire) and 4 corners (lot coordinates: u, v, face). */
const LOTS = [
    { u: -9, v: 27, face: 0 }, { u: 9, v: 27, face: 0 }, { u: -9, v: -27, face: 2 }, { u: 9, v: -27, face: 2 },
    { u: -27, v: -9, face: 1 }, { u: -27, v: 9, face: 1 }, { u: 27, v: -9, face: 3 }, { u: 27, v: 9, face: 3 },
    { u: 23, v: 23, face: 0, corner: true }, { u: -23, v: 23, face: 0, corner: true }, { u: 23, v: -23, face: 2, corner: true }, { u: -23, v: -23, face: 2, corner: true },
];
const RING_R = 10, RING_N = 12;

/** 4–9 houses round a round fire; the wizards' one has 3–4 stalls of magic things. */
function buildVillage(p, rng, out, mage, pawn = false) {
    const B = BLOCK;
    // the fire in the middle: a ring of stones, logs to sit on, the round road round it
    p.cyl(0, 0, 2.6, 0, 0, B.COBBLE, 1.6);
    p.box(0, 0, -1, -1, 0, 0, B.GRAVEL);
    for (const [a0, a1, b0, b1] of [[-1, 1, 5, 5], [-1, 1, -5, -5], [5, 5, -1, 1], [-5, -5, -1, 1]]) p.box(a0, a1, 0, 0, b0, b1, B.WOOD);
    p.cyl(0, 0, RING_R + 1.2, -1, -1, mage ? B.RUNE : B.PATH, RING_R - 1.2);
    const ring = [];
    for (let i = 0; i < RING_N; i++) {
        const a = i * Math.PI * 2 / RING_N;
        ring.push({ id: p.node(Math.round(RING_R * Math.cos(a)), Math.round(RING_R * Math.sin(a)), 0, i % 3 === 0 ? 'yard' : i % 3 === 1 ? 'fire' : ''), a });
    }
    for (let i = 0; i < RING_N; i++) p.link(ring[i].id, ring[(i + 1) % RING_N].id);
    const ringNear = (u, v) => { const a = Math.atan2(v, u); let best = ring[0], bd = Infinity; for (const r of ring) { let d = Math.abs(a - r.a); d = Math.min(d, Math.PI * 2 - d); if (d < bd) { bd = d; best = r; } } return best.id; };
    // the houses
    const lots = LOTS.map((l) => ({ ...l }));
    for (let i = lots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [lots[i], lots[j]] = [lots[j], lots[i]]; }
    const n = 4 + Math.floor(rng() * 6);
    const style = mage ? wizardStyle(rng) : folkStyle(rng);
    const kinds = mage ? ['cottage', 'towerhouse', 'cottage', 'manor', 'stone'] : POOR_HOUSES.filter((k) => k !== 'barn').concat(['manor']);
    const used = lots.slice(0, n), free = lots.slice(n);
    for (const lot of used) {
        const kind = kinds[Math.floor(rng() * kinds.length)];
        const door = buildHouse(p, kind, lot.u, lot.v, lot.face, rng, style, out);
        const dn = p.nodes[door];
        const r = p.nodes[ringNear(dn._u, dn._v)];
        pathLine(p, dn._u, dn._v, r._u, r._v);
        const steps = p.line(dn._u, dn._v, r._u, r._v, 0, 6);
        p.link(door, steps[0]);
        p.link(steps[steps.length - 1], r.id);
    }
    // the folk: a field or two on free corners, a well-kept little road out
    if (!mage) {
        let f = 0;
        for (const lot of free) {
            if (!lot.corner || f >= 2 || rng() < 0.3) continue;
            const node = field(p, lot.u, lot.v, 5, rng() < 0.6 ? B.WHEAT : B.VEG, out, null);
            const fn = p.nodes[node], r = p.nodes[ringNear(fn._u, fn._v)];
            const steps = p.line(fn._u, fn._v, r._u, r._v, 0, 6);
            p.link(node, steps[0]); p.link(steps[steps.length - 1], r.id);
            f++;
        }
    }
    // the wizards' stalls: on the sides between the fire and the houses, the seller on the far side
    if (mage) {
        const S = 3 + (rng() < 0.5 ? 1 : 0);
        for (let k = 0; k < S; k++) out.stalls.push(magicStall(p, k, ringNear));
        // the buyer (by the author's wish — in old worlds too, unlike the usual rule): in a diagonal gap of the houses; takes no rng
        if (pawn) out.stalls.push(pawnStall(p, 3, 48, ringNear));
    }
    // (no post: the night watch walks its rounds round the fire and the houses — NightLife._watch)
}

/** A seller's stall on side `face` of the fire (lot coordinates: outward = +b). */
function magicStall(p, face, ringNear) {
    const B = BLOCK;
    const at = (a, b) => rotLot(a, b, face);
    const box = (a0, a1, l0, l1, b0, b1, t) => { const [u0, v0] = at(a0, b0), [u1, v1] = at(a1, b1); p.box(u0, u1, l0, l1, v0, v1, t); };
    const pt = (a, b, l = 0) => { const [u, v] = at(a, b); return p.pt(u, v, l); };
    box(-1, 1, 0, 1, 15, 15, B.PLANKS_DARK); // the counter
    box(-1, 1, 1, 1, 15, 15, B.CLOTH_WHITE);
    box(2, 2, 0, 2, 16, 16, B.ARCANE_DARK); box(2, 2, 3, 3, 16, 16, B.ARCANE_LAMP); // a lamp post
    const [fu, fv] = at(0, 13);
    const frontNode = p.node(fu, fv, 0, 'stall');
    p.link(frontNode, ringNear(fu, fv));
    const c0 = pt(-1, 15), c1 = pt(1, 15), o = pt(0, 0), f = pt(0, -1);
    return {
        magic: true, // (a seller of magic things: CastleTalk._restock — HamletLife.magicStallGood)
        front: pt(0, 13), back: pt(0, 16.6), frontNode,
        counter: { x0: Math.min(c0.x, c1.x), x1: Math.max(c0.x, c1.x), z0: Math.min(c0.z, c1.z), z1: Math.max(c0.z, c1.z), top: p.L(1) - 0.5 },
        yaw: Math.atan2(-(f.x - o.x), -(f.z - o.z)), // (facing the fire)
    };
}

// ------------------------------------------------------------- the site
/** One hamlet of `type` at (X, Z), floor layer F. Returns the castle-shaped record. */
export function buildHamlet(seed, type, gx, gz, slot, X, Z, F, rng, wizHuts = false) {
    const rot = Math.floor(rng() * 4);
    const p = new Plan(X, Z, F, rot);
    const out = { houses: [], fields: [], stalls: [], posts: [] };
    const mage = type === 'magehut' || type === 'magevillage';
    if (type === 'magehut') buildMageHut(p, rng, out, wizHuts);
    else if (type === 'hermit') buildHermitHut(p, rng, out);
    else buildVillage(p, rng, out, mage, type === 'magevillage');
    p.joinRoads();
    const id = 'hm' + gx + '_' + gz + '_' + slot;
    const houses = out.houses.map((h, i) => ({ ...h, id: id + '_h' + i }));
    const lone = type === 'magehut' || type === 'hermit';
    const name = type === 'magehut' ? 'Дом волшебника' : type === 'hermit' ? 'Хижина отшельника'
        : mage ? `Поселение магов «${MAGE_A[Math.floor(rng() * MAGE_A.length)]} ${MAGE_B[Math.floor(rng() * MAGE_B.length)]}»`
            : `Деревушка «${NAMES_A[Math.floor(rng() * NAMES_A.length)]} ${NAMES_B[Math.floor(rng() * NAMES_B.length)]}»`;
    const S = out.stalls.length;
    // (the roster: 0 nobody, 1…knights the watchman, then the sellers, then the people of the houses — HamletLife.hamletRoster)
    const knights = type === 'village' ? 1 : 0;
    const population = lone ? 2 : knights + 1 + S + houses.length * 2 + Math.floor(rng() * 3);
    const zone = ZONE[type];
    const def = {
        id, kind: 'hamlet', type, mage, gx, gz, slot, x: X, z: Z, F, rot, name, king: '', population, knights, wseed: seed,
        color: mage ? 0x6a2c91 : 0x7a5a3a, colorName: mage ? 'фиолетовые' : 'бурые', stone: mage ? BLOCK.ARCANE : BLOCK.COBBLE, zone,
        style: 'hamlet', styleName: name, walls: null, inner: null, keep: null,
        gate: p.pt(0, -zone + 2), gateIn: p.pt(0, -zone + 6), gateYaw: p.yaw(0),
        throne: null, throneFront: null, rooms: [], chests: [], houses, pens: [], stalls: out.stalls, fields: out.fields, market: null,
        graveyards: [], graves: [], posts: out.posts, beds: [], wallWalk: [], dummies: [], spots: [],
        fire: lone ? null : p.pt(0, 0, 0), // (the round fire in the middle: a real campfire while somebody is near — HamletLife)
        nodes: p.nodes, edges: p.edges, parts: p.parts,
        topL: F + 1 + 22,
    };
    def._byChunk = new Map();
    return def;
}

// ------------------------------------------------------------- placement
/** Level, dry, low ground for a hamlet of half-size `zone` at (X, Z): its floor layer, or null. */
export function hamletGround(raw, X, Z, zone) {
    const hs = [];
    const step = zone > 20 ? 6 : 4;
    for (let dz = -zone; dz <= zone; dz += step) for (let dx = -zone; dx <= zone; dx += step) {
        const h = raw(X + dx, Z + dz);
        if (raw.water || raw.sea) return null; // (no house over a river)
        if (h > HAMLET.HI || h < -2) return null;
        hs.push(h);
    }
    hs.sort((a, b) => a - b);
    if (hs[hs.length - 1] - hs[0] > HAMLET.SPREAD + (zone > 20 ? 2 : 0)) return null;
    return Math.max(0, Math.round(hs[Math.floor(hs.length / 2)]));
}

/** Pick a type by the weights (x in 0..1). */
export function pickType(x) {
    let s = 0;
    for (const k of HAMLET_TYPES) s += HAMLET.WEIGHTS[k];
    let r = x * s;
    for (const k of HAMLET_TYPES) { r -= HAMLET.WEIGHTS[k]; if (r < 0) return k; }
    return 'hermit';
}

/** Finds and remembers the hamlets (the same shape of answers as CastleIndex / TowerIndex). */
export class HamletIndex {
    /** `busy(x, z, r)`: another site (a castle, a tower, the Ice Castle) is within `r` of a point. */
    constructor(seed, raw, busy, wizHuts = false) {
        this.seed = seed; this.raw = raw; this.busy = busy; this.wizHuts = wizHuts; // (generation 7: the lone wizards' houses roomy)
        this.cells = new Map(); // cell key → [defs]
        this._lastCell = null;
    }

    _key(gx, gz) { return gx * 65536 + gz; }

    cellOf(gx, gz) {
        const key = this._key(gx, gz);
        let l = this.cells.get(key);
        if (!l) { l = this._makeCell(gx, gz); this.cells.set(key, l); }
        return l;
    }

    _makeCell(gx, gz) {
        const out = [];
        if (offEarth((gx + 1) * CASTLE_CELL)) return out; // (nobody lives on the other planets: Planets.js)
        const place = (s, type) => {
            const rng = createRng((this.seed * 48271 + gx * 92821 + gz * 68917 + s * 7331 + 17) >>> 0);
            const zone = ZONE[type], m = zone + HAMLET.BLEND + 6, span = CASTLE_CELL - 2 * m;
            for (let t = 0; t < TRIES; t++) {
                const X = Math.round(gx * CASTLE_CELL + m + rng() * span), Z = Math.round(gz * CASTLE_CELL + m + rng() * span);
                if (Math.hypot(X, Z) < HAMLET.MIN_SPAWN + zone) continue;
                if (out.some((o) => Math.max(Math.abs(o.x - X), Math.abs(o.z - Z)) < o.zone + zone + 2 * HAMLET.BLEND + 8)) continue;
                if (this.busy(X, Z, zone + HAMLET.BLEND + 12)) continue;
                const F = hamletGround(this.raw, X, Z, zone);
                if (F == null) continue;
                out.push(buildHamlet(this.seed, type, gx, gz, s, X, Z, F, rng, this.wizHuts));
                break;
            }
        };
        for (let s = 0; s < HAMLET.SLOTS; s++) {
            if (hash01(gx * 17 + s * 5 + 3, gz * 29 + s * 11 + 1, this.seed + 4242) > HAMLET.CHANCE) continue;
            place(s, pickType(hash01(gx * 23 + s * 7 + 9, gz * 31 + s * 3 + 2, this.seed + 4343)));
        }
        for (let s = 0; s < HAMLET.SLOTS; s++) { // (the extra lone wizards' houses, after all the others)
            const h = hash01(gx * 17 + s * 5 + 3, gz * 29 + s * 11 + 1, this.seed + 4242);
            if (h > HAMLET.CHANCE && h <= HAMLET.CHANCE + HAMLET.EXTRA_MAGEHUT) place(s, 'magehut');
        }
        return out;
    }

    /** The hamlet of an id «hm<gx>_<gz>_<slot>». */
    byId(gx, gz, slot) { return this.cellOf(gx, gz).find((d) => d.slot === slot) || null; }

    /** Hamlets whose land reaches within `r` of a point. */
    near(x, z, r = 0) {
        if (offEarth(x - r)) return [];
        const out = [];
        const g0x = Math.floor((x - r) / CASTLE_CELL), g1x = Math.floor((x + r) / CASTLE_CELL);
        const g0z = Math.floor((z - r) / CASTLE_CELL), g1z = Math.floor((z + r) / CASTLE_CELL);
        for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
            for (const c of this.cellOf(gx, gz)) if (Math.max(Math.abs(c.x - x), Math.abs(c.z - z)) <= c.zone + HAMLET.BLEND + r) out.push(c);
        }
        return out;
    }

    landAt(ix, iz) {
        const gx = Math.floor(ix / CASTLE_CELL), gz = Math.floor(iz / CASTLE_CELL);
        let c = this._lastCell;
        if (!c || c.gx !== gx || c.gz !== gz) c = this._lastCell = { gx, gz, list: this.cellOf(gx, gz) };
        for (const k of c.list) {
            const d = Math.max(Math.abs(ix - k.x), Math.abs(iz - k.z));
            if (d > k.zone + HAMLET.BLEND) continue;
            const w = d <= k.zone ? 1 : 1 - (d - k.zone) / HAMLET.BLEND;
            return { castle: k, w: w * w * (3 - 2 * w) };
        }
        return null;
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

    /** The hamlets close by for the minimap (within HAMLET.MAP_R), nearest first; cached per 40 m. */
    nearestForMap(p, r = HAMLET.MAP_R) {
        const now = Math.floor(p.x / 40) + ',' + Math.floor(p.z / 40);
        if (this._mapKey !== now) {
            this._mapKey = now;
            this._mapList = this.near(p.x, p.z, r).filter((c) => (c.type === 'village' || c.type === 'magevillage') && Math.hypot(c.x - p.x, c.z - p.z) <= r)
                .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 4);
        }
        return this._mapList;
    }
}
