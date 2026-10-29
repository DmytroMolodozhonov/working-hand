/**
 * Castles.js — castles, their villages, markets and fields.
 *
 * Every CASTLE_CELL × CASTLE_CELL square of the endless world may hold one
 * castle (on plains, far from spawn). Each castle is put together from ready
 * pieces — curtain walls, round or square towers, a gatehouse, a keep with a
 * throne room in its heart and 10–15 rooms around it, a courtyard with
 * barracks, a smithy and a well; around it a village of wooden and stone
 * houses along roads, a market with stalls in front of the gate and fields —
 * so no two castles are the same. Styles: «grand» (huge, high towers with
 * cones), «compact» (tight, square towers) and «fortress» (thick dark walls,
 * many towers). Five kinds of stone, three roofs, five castle colours.
 *
 * Pure data, deterministic from the seed (every computer builds the same
 * castle). The blocks are real terrain blocks: Bombardo breaks the walls.
 * A plan also carries the places the villagers use: roads, doors, rooms,
 * the throne, market stalls, fields, the wall walk (a small walking graph).
 *
 * Local coordinates of a plan: u to the right, v to the back (the gate is at
 * the front, v < 0), l = layers above the ground (l = 0 is the first layer
 * of air over the grass, l = −1 the ground itself). The player is ~4.6
 * blocks tall, so doors are 3 wide and 5–6 high and floors 8 layers apart.
 */

import { BLOCK } from './Terrain.js';
import { createRng } from '../core/math.js';
import { offEarth } from './Planets.js';
import { roofShapes } from './PlanSlopes.js';
import { furnishRoom } from './CastleFurniture.js';
import { SHAPE } from './BlockShapes.js';
import { placeTownBuildings } from './Buildings.js';
import { knightCount } from './KnightPosts.js';

export const CASTLE_CELL = 480;
/** A cell holds a castle this often (before its land is checked): the giant spider's lairs are rarer by it (SpiderLairs.js). */
export const CASTLE_CHANCE = 0.92;
const MIN_SPAWN_DIST = 360;
export const BLEND = 26; // m of slope between the flat castle land and the wild

const CASTLE_NAMES_A = ['Белый', 'Вороний', 'Старый', 'Северный', 'Золотой', 'Каменный', 'Высокий', 'Серый', 'Королевский', 'Туманный', 'Дубовый', 'Орлиный', 'Волчий', 'Солнечный', 'Лунный', 'Красный'];
const CASTLE_NAMES_B = ['Утёс', 'Камень', 'Холм', 'Бор', 'Щит', 'Рог', 'Дол', 'Град', 'Вал', 'Брод', 'Клык', 'Перевал'];
const KING_NAMES = ['Ричард', 'Артур', 'Генрих', 'Леопольд', 'Ярослав', 'Святослав', 'Всеволод', 'Олаф', 'Эдгар', 'Фридрих', 'Казимир', 'Людвиг', 'Альфред', 'Владислав', 'Роланд', 'Бертольд'];
const KING_EPITHETS = ['Мудрый', 'Храбрый', 'Строгий', 'Добрый', 'Седой', 'Железный', 'Великий', 'Справедливый', 'Грозный', 'Щедрый'];

export const STYLE_NAMES = { grand: 'Величественный замок', compact: 'Замок', fortress: 'Крепость' };
export const ROOM_NAMES = {
    throne: 'Тронный зал', kitchen: 'Кухня', dining: 'Трапезная', armoury: 'Оружейная', treasury: 'Сокровищница',
    chapel: 'Часовня', library: 'Библиотека', barracks: 'Казарма', bedroom: 'Спальня', king: 'Покои короля',
    storeroom: 'Кладовая', guardroom: 'Караульная', stairs: 'Лестница', smithy: 'Кузница', hall: 'Зал', gallery: 'Галерея',
};

/** Cheap deterministic hash → [0, 1). */
export function hash01(a, b, seed) {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ plan
/** Collects block parts in local coordinates and turns them into world parts. */
export class Plan {
    constructor(X, Z, F, rot) {
        this.X = X; this.Z = Z; this.F = F; this.rot = rot;
        this.parts = [];
        this.nodes = []; // walking graph {id, x, z, y, tag}
        this.edges = [];
        this._nodeIds = new Map();
    }

    /** local (u, v) → world (x, z) */
    wx(u, v) { const r = this.rot; return this.X + (r === 0 ? u : r === 1 ? -v : r === 2 ? -u : v); }
    wz(u, v) { const r = this.rot; return this.Z + (r === 0 ? v : r === 1 ? u : r === 2 ? -v : -u); }
    L(l) { return this.F + 1 + l; }

    /** A filled box (inclusive ranges); t = 0 carves air. */
    box(u0, u1, l0, l1, v0, v1, t) {
        if (u1 < u0) [u0, u1] = [u1, u0];
        if (v1 < v0) [v0, v1] = [v1, v0];
        const xa = this.wx(u0, v0), xb = this.wx(u1, v1), za = this.wz(u0, v0), zb = this.wz(u1, v1);
        this.parts.push({ k: 0, x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb), L0: this.L(l0), L1: this.L(l1), t });
    }

    /** A filled disc column; with `hr` ≥ 0 only the ring outside radius hr. */
    cyl(u, v, r, l0, l1, t, hr = -1) {
        const cx = this.wx(u, v), cz = this.wz(u, v);
        this.parts.push({ k: 1, cx, cz, r, hr, x0: cx - Math.ceil(r), x1: cx + Math.ceil(r), z0: cz - Math.ceil(r), z1: cz + Math.ceil(r), L0: this.L(l0), L1: this.L(l1), t });
    }

    /**
     * A sector of a ring (or of a disc when hr < 0) between local angles a0…a1
     * (radians, counter-clockwise from +u towards +v), layers l0…l1.
     */
    sector(u, v, r, hr, a0, a1, l0, l1, t) {
        const cx = this.wx(u, v), cz = this.wz(u, v);
        const span = a1 - a0; // (world start angle = a0 + rot·π/2: wx/wz are proper rotations)
        // the world-angle direction: local (cos a, sin a) in (u, v) turns into world (x, z) like wx/wz do
        const dir = (a) => [this.wx(Math.cos(a), Math.sin(a)) - this.X, this.wz(Math.cos(a), Math.sin(a)) - this.Z];
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        const add = (a) => {
            const [dx, dz] = dir(a);
            for (const rr of [r, Math.max(0, hr)]) {
                const x = cx + dx * rr, z = cz + dz * rr;
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
            }
        };
        add(a0); add(a1);
        for (let k = Math.ceil(a0 / (Math.PI / 2)); k * Math.PI / 2 <= a1; k++) add(k * Math.PI / 2);
        this.parts.push({ k: 2, cx, cz, r, hr, a0w: Math.atan2(dir(a0)[1], dir(a0)[0]), span, x0: Math.floor(x0) - 1, x1: Math.ceil(x1) + 1, z0: Math.floor(z0) - 1, z1: Math.ceil(z1) + 1, L0: this.L(l0), L1: this.L(l1), t });
    }

    /** Hollow walls around a rectangle (inner air is not carved). */
    walls(u0, u1, v0, v1, l0, l1, t, th = 1) {
        this.box(u0, u1, l0, l1, v0, v0 + th - 1, t);
        this.box(u0, u1, l0, l1, v1 - th + 1, v1, t);
        this.box(u0, u0 + th - 1, l0, l1, v0, v1, t);
        this.box(u1 - th + 1, u1, l0, l1, v0, v1, t);
    }

    /** Battlements: every other block along the outline of a rectangle at layer l. */
    crenels(u0, u1, v0, v1, l, t, h = 2) {
        for (let u = u0; u <= u1; u += 2) { this.box(u, u, l, l + h - 1, v0, v0, t); this.box(u, u, l, l + h - 1, v1, v1, t); }
        for (let v = v0 + 2; v <= v1 - 2; v += 2) { this.box(u0, u0, l, l + h - 1, v, v, t); this.box(u1, u1, l, l + h - 1, v, v, t); }
    }

    /** A walking-graph node at local (u, v), standing on layer l − 1. Returns its id. */
    node(u, v, l, tag = '') {
        const key = `${u},${v},${l}`;
        if (this._nodeIds.has(key)) {
            const id = this._nodeIds.get(key);
            if (tag && !this.nodes[id].tag) this.nodes[id].tag = tag;
            return id;
        }
        const id = this.nodes.length;
        this.nodes.push({ id, x: this.wx(u, v), z: this.wz(u, v), y: this.L(l) - 1.5, tag, _u: u, _v: v, _l: l });
        this._nodeIds.set(key, id);
        return id;
    }

    link(a, b) { if (a !== b) this.edges.push([a, b]); }

    /**
     * The roof built since part `mark` (layer by layer, a stair of whole blocks of `mats`) gets its ramps (PlanSlopes.js):
     * its top cells marked as ramps, hips and valleys — used by a world of generation 6, the blocks the same in every world.
     */
    slopeTop(mark, ...mats) {
        const s = roofShapes(this.parts.slice(mark), mats);
        if (s) this.parts.push(s);
    }

    /**
     * A half block (generation 8's furniture: table tops, seats, cushions): the block already put at (u, v) on layer l
     * becomes a slab (BlockShapes.js; a world without slopes keeps the whole block). Marks go out with flushSlabs, after
     * the room's blocks.
     */
    slabAt(u, v, l, shape = SHAPE.SLAB) { (this._slabs || (this._slabs = [])).push(this.wx(u, v), this.L(l), this.wz(u, v), shape); }

    flushSlabs() {
        const c = this._slabs;
        if (!c || !c.length) return;
        this._slabs = null;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, L0 = Infinity, L1 = -Infinity;
        for (let i = 0; i < c.length; i += 4) {
            if (c[i] < x0) x0 = c[i]; if (c[i] > x1) x1 = c[i];
            if (c[i + 1] < L0) L0 = c[i + 1]; if (c[i + 1] > L1) L1 = c[i + 1];
            if (c[i + 2] < z0) z0 = c[i + 2]; if (c[i + 2] > z1) z1 = c[i + 2];
        }
        this.parts.push({ k: 3, x0, x1, z0, z1, L0, L1, t: 0, cells: c });
    }

    /** A straight road (centre line); every node later found on it is linked to its neighbours. */
    roadLine(axis, fixed, from, to, l = 0) { (this.roads || (this.roads = [])).push({ axis, fixed, from: Math.min(from, to), to: Math.max(from, to), l }); }

    /** Link the nodes lying on each road line in order (intersections, doors' road points...). */
    joinRoads() {
        for (const r of this.roads || []) {
            const on = this.nodes.filter((n) => n._l === r.l && (r.axis === 'u' ? n._v === r.fixed && n._u >= r.from && n._u <= r.to : n._u === r.fixed && n._v >= r.from && n._v <= r.to));
            on.sort((a, b) => (r.axis === 'u' ? a._u - b._u : a._v - b._v));
            for (let i = 1; i < on.length; i++) this.link(on[i - 1].id, on[i].id);
        }
    }

    /** A chain of nodes along a straight line (every `step` blocks), linked. */
    line(u0, v0, u1, v1, l, step = 8) {
        const len = Math.max(Math.abs(u1 - u0), Math.abs(v1 - v0));
        const n = Math.max(1, Math.round(len / step));
        let prev = null;
        const out = [];
        for (let i = 0; i <= n; i++) {
            const id = this.node(Math.round(u0 + (u1 - u0) * i / n), Math.round(v0 + (v1 - v0) * i / n), l);
            if (prev != null) this.link(prev, id);
            prev = id;
            out.push(id);
        }
        return out;
    }

    /** World point of a local spot (feet y on layer l − 1). */
    pt(u, v, l = 0) { return { x: this.wx(u, v), z: this.wz(u, v), y: this.L(l) - 1.5 }; }

    /** World yaw for a local facing (0 = towards −v, the front). */
    yaw(localYaw) {
        // character yaw: rotation.y with the model facing −Z; local −v is world −Z at rot 0
        return localYaw - this.rot * Math.PI / 2;
    }

    /** World rectangle of a local one. */
    rect(u0, u1, v0, v1) {
        const xa = this.wx(u0, v0), xb = this.wx(u1, v1), za = this.wz(u0, v0), zb = this.wz(u1, v1);
        return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb) };
    }
}

// ----------------------------------------------------------------- pieces
function squareTower(p, u, v, half, top, stone, roof, opts) {
    p.box(u - half, u + half, -3, top, v - half, v + half, stone);
    p.box(u - half + 2, u + half - 2, 0, top - 1, v - half + 2, v + half - 2, 0); // hollow
    p.box(u - half + 2, u + half - 2, -1, -1, v - half + 2, v + half - 2, BLOCK.COBBLE);
    p.crenels(u - half, u + half, v - half, v + half, top + 1, stone);
    if (opts.cone) {
        // a pointed roof
        const m = p.parts.length;
        for (let k = 0; k <= half; k++) p.box(u - half + k, u + half - k, top + 1 + k, top + 1 + k, v - half + k, v + half - k, roof);
        p.slopeTop(m, roof); // (its four faces ramps, its corners hips — generation 6)
    }
    // slit windows (through the walls only)
    for (let l = 6; l < top - 2; l += 7) {
        p.box(u, u, l, l + 1, v - half, v - half + 1, 0); p.box(u, u, l, l + 1, v + half - 1, v + half, 0);
        p.box(u - half, u - half + 1, l, l + 1, v, v, 0); p.box(u + half - 1, u + half, l, l + 1, v, v, 0);
    }
    if (opts.walkL != null) p.box(u - half + 2, u + half - 2, opts.walkL, opts.walkL, v - half + 2, v + half - 2, BLOCK.PLANKS_DARK);
}

function roundTower(p, u, v, r, top, stone, roof, opts) {
    p.cyl(u, v, r, -3, top, stone);
    p.cyl(u, v, r - 2, 0, top - 1, 0);
    p.cyl(u, v, r - 2, -1, -1, BLOCK.COBBLE);
    // battlement ring with gaps
    p.cyl(u, v, r, top + 1, top + 2, stone, r - 1);
    for (let a = 0; a < 8; a++) {
        const du = Math.round(Math.cos(a * Math.PI / 4) * r), dv = Math.round(Math.sin(a * Math.PI / 4) * r);
        p.box(u + du, u + du, top + 2, top + 2, v + dv, v + dv, 0);
    }
    if (opts.cone) {
        // a tall cone
        const h = Math.round(r * 1.6), m = p.parts.length;
        for (let k = 0; k <= h; k++) {
            const rr = (r + 0.5) * (1 - k / (h + 1));
            if (rr < 0.4) break;
            p.cyl(u, v, rr, top + 1 + k, top + 1 + k, roof);
        }
        p.slopeTop(m, roof);
        p.box(u, u, top + h + 1, top + h + 3, v, v, BLOCK.PLANKS_DARK); // flagpole
    }
    for (let l = 6; l < top - 2; l += 7) {
        p.box(u, u, l, l + 1, v - r, v - r + 2, 0); p.box(u, u, l, l + 1, v + r - 2, v + r, 0);
        p.box(u - r, u - r + 2, l, l + 1, v, v, 0); p.box(u + r - 2, u + r, l, l + 1, v, v, 0);
    }
    if (opts.walkL != null) p.cyl(u, v, r - 2, opts.walkL, opts.walkL, BLOCK.PLANKS_DARK);
}

function tower(p, s, u, v, top, opts) {
    if (s.roundTowers) roundTower(p, u, v, opts.size, top, s.stone, s.roof, opts);
    else squareTower(p, u, v, opts.size, top, s.stone, s.roof, opts);
}

/** A straight staircase rising along +v (dir 1) or −v (dir −1) from l0 by `n` steps. */
function stairsV(p, u0, u1, v0, dir, n, t, l0 = 0) {
    const m = p.parts.length;
    for (let i = 0; i < n; i++) {
        const v = v0 + dir * i;
        p.box(u0, u1, l0, l0 + i, v, v, t);
    }
    p.slopeTop(m, t); // (generation 6: each step a ramp — the stair walked up as a slope; the top step level)
}

function stairsU(p, u0, dir, v0, v1, n, t, l0 = 0) {
    const m = p.parts.length;
    for (let i = 0; i < n; i++) {
        const u = u0 + dir * i;
        p.box(u, u, l0, l0 + i, v0, v1, t);
    }
    p.slopeTop(m, t);
}

// ------------------------------------------------------------ furniture
export function furnish(p0, room, s, chests, aisles = []) {
    if (s.furnish) return furnishRich(p0, room, s, chests, aisles); // (generation 8: CastleFurniture.js)
    const { u0, u1, v0, v1, kind } = room;
    // furniture never stands in the way of the walking paths (aisles) through the room
    const hits = (a0, a1, b0, b1) => aisles.some((r) => a1 >= r.u0 && a0 <= r.u1 && b1 >= r.v0 && b0 <= r.v1);
    const filled = new Set(); // (what stands on the floor — placeChests)
    const box = floorCells((...a) => p0.box(...a), room.l, filled);
    const p = {
        box: (a0, a1, l0, l1, b0, b1, t) => {
            if (l1 >= room.l && l0 <= room.l + 5 && hits(Math.min(a0, a1), Math.max(a0, a1), Math.min(b0, b1), Math.max(b0, b1))) return;
            box(a0, a1, l0, l1, b0, b1, t);
        },
        pt: (...a) => p0.pt(...a), yaw: (a) => p0.yaw(a),
    };
    const wants = []; // the chests: where each one is wanted (placed at the end, against a wall)
    const chest = (u, v) => wants.push([u, v]);
    const l = room.l;
    const W = u1 - u0 + 1, D = v1 - v0 + 1;
    const cu = Math.round((u0 + u1) / 2), cv = Math.round((v0 + v1) / 2);
    // (doors are in the walls next to the room; keep 2 cells along the door side free)
    const along = room.doorSide; // 'u0' | 'u1' | 'v0' | 'v1'
    const lantern = (u, v) => p.box(u, u, l + 5, l + 5, v, v, BLOCK.LANTERN);
    const farU = along === 'u0' ? u1 : u0;
    const fu = Math.round((cu + farU) / 2); // between the middle and the far wall
    switch (kind) {
        case 'kitchen': {
            // hearth against the far wall, a long table, barrels
            const hu = farU;
            const du = along === 'u0' ? -2 : 0;
            p.box(hu + du, hu + du + 2, l, l + 3, cv - 2, cv + 2, BLOCK.COBBLE);
            p.box(hu + du + (along === 'u0' ? 0 : 1), hu + du + (along === 'u0' ? 1 : 2), l, l + 1, cv - 1, cv + 1, BLOCK.LANTERN);
            p.box(fu - 1, fu, l, l + 1, v0 + 2, v1 - 2, BLOCK.PLANKS);
            for (let v = v0; v <= v1; v += 3) p.box(along === 'u0' ? u1 : u0, along === 'u0' ? u1 : u0, l, l + 1, v, v, BLOCK.PLANKS_DARK);
            break;
        }
        case 'dining':
        case 'guardroom': {
            p.box(fu - 1, fu + 1, l, l + 1, v0 + 2, v1 - 2, BLOCK.PLANKS);
            p.box(fu - 3, fu - 3, l, l, v0 + 2, v1 - 2, BLOCK.PLANKS_DARK);
            p.box(fu + 3, fu + 3, l, l, v0 + 2, v1 - 2, BLOCK.PLANKS_DARK);
            lantern(farU, cv);
            break;
        }
        case 'armoury': {
            for (let v = v0 + 1; v <= v1 - 1; v += 2) p.box(farU, farU, l + 1, l + 3, v, v, BLOCK.PLANKS_DARK);
            p.box(fu, fu + 1, l, l, cv, cv, BLOCK.CS_DARK);
            chest(fu, v1 - 1);
            lantern(farU, cv);
            break;
        }
        case 'treasury': {
            for (let i = 0; i < 4; i++) {
                const v = v0 + 1 + Math.round((D - 3) * i / 3);
                chest(farU === u1 ? u1 - 1 : u0 + 1, v);
            }
            p.box(fu - 1, fu, l, l, cv - 1, cv, BLOCK.GOLD);
            p.box(fu - 1, fu - 1, l + 1, l + 1, cv, cv, BLOCK.GOLD);
            lantern(cu, v1);
            break;
        }
        case 'storeroom': {
            for (let v = v0; v <= v1 - 1; v += 3) {
                p.box(farU === u1 ? u1 - 1 : u0, farU === u1 ? u1 : u0 + 1, l, l + 1, v, v + 1, BLOCK.PLANKS);
                p.box(farU, farU, l + 2, l + 2, v, v, BLOCK.HAY);
            }
            chest(fu, v0 + 1);
            break;
        }
        case 'chapel': {
            p.box(cu - 2, cu + 2, l, l + 1, v1 - 1, v1, BLOCK.CS_WHITE);
            p.box(cu - 2, cu + 2, l + 2, l + 2, v1 - 1, v1, BLOCK.CLOTH_WHITE);
            p.box(cu, cu, l + 3, l + 6, v1, v1, BLOCK.GOLD);
            p.box(cu - 2, cu + 2, l + 4, l + 4, v1, v1, BLOCK.GOLD);
            for (let v = v0 + 2; v <= v1 - 4; v += 2) { p.box(u0 + 1, cu - 2, l, l, v, v, BLOCK.PLANKS_DARK); p.box(cu + 2, u1 - 1, l, l, v, v, BLOCK.PLANKS_DARK); }
            p.box(cu - 1, cu + 1, l - 1, l - 1, v0, v1 - 2, s.carpet);
            lantern(u0, v1 - 2); lantern(u1, v1 - 2);
            break;
        }
        case 'library': {
            for (let v = v0; v <= v1; v++) { p.box(u0, u0, l, l + 4, v, v, BLOCK.BOOKS); p.box(u1, u1, l, l + 4, v, v, BLOCK.BOOKS); }
            p.box(fu - 1, fu + 1, l, l + 1, cv - 1, cv + 1, BLOCK.PLANKS_DARK);
            lantern(cu, v1);
            break;
        }
        case 'bedroom':
        case 'king': {
            const big = kind === 'king';
            // (the bed off the way through the room: on the far side, else the other side; the king's
            // wide bed narrower where the room is small)
            const otherU = Math.round((cu + (farU === u0 ? u1 : u0)) / 2);
            const tries = big ? [[fu, 2], [otherU, 2], [fu, 1], [otherU, 1], [farU === u0 ? u0 + 1 : u1 - 1, 1]] : [[fu, 1], [otherU, 1]];
            const fit = tries.find(([u, w]) => !hits(u - w, u + w, v1 - 5, v1) && u - w >= u0 && u + w <= u1);
            // (no room along the room: across it, by a wall the way through does not touch, the pillow to the side wall)
            const across = !fit && [v0 + 1, v1 - 1].map((cv2) => [cv2, !hits(u0, u0 + 5, cv2 - 1, cv2 + 1) ? u0 : !hits(u1 - 5, u1, cv2 - 1, cv2 + 1) ? u1 : null]).find(([, pu]) => pu != null);
            let sleep = null; // [middle u, v, pillow u, v]
            if (across) {
                const [bv, pu] = across, du = pu === u0 ? 1 : -1;
                p.box(Math.min(pu, pu + du * 5), Math.max(pu, pu + du * 5), l, l, bv - 1, bv + 1, BLOCK.PLANKS_DARK);
                p.box(Math.min(pu + du, pu + du * 5), Math.max(pu + du, pu + du * 5), l + 1, l + 1, bv - 1, bv + 1, big ? s.carpet : BLOCK.CLOTH_WHITE);
                p.box(pu, pu, l + 1, l + 1, bv - 1, bv + 1, BLOCK.CLOTH_WHITE);
                if (big) p.box(pu, pu, l + 2, l + 4, bv - 1, bv + 1, BLOCK.GOLD);
                sleep = [pu + du * 2.4, bv, pu, bv];
            } else {
                const [bu, bw] = fit || tries[0];
                p.box(bu - bw, bu + bw, l, l, v1 - 5, v1, BLOCK.PLANKS_DARK);
                p.box(bu - bw, bu + bw, l + 1, l + 1, v1 - 5, v1 - 1, big ? s.carpet : BLOCK.CLOTH_WHITE);
                p.box(bu - bw, bu + bw, l + 1, l + 1, v1, v1, BLOCK.CLOTH_WHITE);
                if (big) { p.box(bu - bw, bu + bw, l + 2, l + 4, v1, v1, BLOCK.GOLD); chest(fu + bw + 2, v1 - 1); }
                if (fit) sleep = [bu, v1 - 2.4, bu, v1];
            }
            p.box(cu - 2, cu + 2, l - 1, l - 1, v0 + 1, v1 - 7, s.carpet);
            lantern(cu, v0);
            // (where somebody sleeps in it at night — src/game/NightLife.js: the middle of the body, the head to the pillow)
            if (room.beds && sleep) { const a = p.pt(sleep[0], sleep[1], l + 2), h = p.pt(sleep[2], sleep[3], l + 2); room.beds.push({ x: a.x, y: a.y, z: a.z, yaw: Math.atan2(h.x - a.x, h.z - a.z), room: kind }); }
            break;
        }
        default: break;
    }
    if (kind === 'library') wants.length = 0; // (no chests in a library — the author; books stand on their own stands)
    // the chests: against a wall, their lids to the room, off the ways through it and the door side
    const keep = aisles.map((r) => [r.u0 - 0.5, r.u1 + 0.5, r.v0 - 0.5, r.v1 + 0.5]);
    const ds = { u0: [u0 - 0.5, u0 + 1.5, v0 - 0.5, v1 + 0.5], u1: [u1 - 1.5, u1 + 0.5, v0 - 0.5, v1 + 0.5], v0: [u0 - 0.5, u1 + 0.5, v0 - 0.5, v0 + 1.5], v1: [u0 - 0.5, u1 + 0.5, v1 - 1.5, v1 + 0.5] }[along];
    if (ds) keep.push(ds);
    const o = p0.pt(0, 0);
    // (a treasure chest; where none fits, a smaller one)
    placeChests({ a0: u0 - 0.5, a1: u1 + 0.5, b0: v0 - 0.5, b1: v1 + 0.5, filled, keep, wants, scales: [3, 2.5, HOUSE_CHEST_SCALE] }, (u, v, fu0, fv0, scale) => {
        const q = p0.pt(fu0, fv0); // (the chest's front, +Z, looks along local (fu0, fv0))
        chests.push({ ...p0.pt(u, v, l), yaw: Math.atan2(q.x - o.x, q.z - o.z), gap: CHEST_GAP, scale, room: kind });
    });
}


/**
 * The furnished room of generation 8 (CastleFurniture.js decides what stands in it): the same floor cells, chests and
 * beds as the old one, but the things are many and by the room's purpose; chests of different looks and loot
 * (`look`: Chest.js, `flavor`: ItemTypes.rollStoreLoot) — the king's, clothes chests, food crates, arms. Returns what was put.
 */
function furnishRich(p0, room, s, chests, aisles) {
    const { u0, u1, v0, v1, kind, l } = room;
    const filled = new Set();
    const box = floorCells((...a) => p0.box(...a), l, filled);
    const keep = aisles.map((r) => [r.u0 - 0.5, r.u1 + 0.5, r.v0 - 0.5, r.v1 + 0.5]);
    for (const r of room.pre || []) keep.push([r.u0 - 0.5, r.u1 + 0.5, r.v0 - 0.5, r.v1 + 0.5]);
    const o = p0.pt(0, 0);
    const chestOf = (u, v, fu, fv, scale, w) => {
        const q = p0.pt(fu, fv); // (the chest's front, +Z, looks along local (fu, fv))
        const c = { ...p0.pt(u, v, l), yaw: Math.atan2(q.x - o.x, q.z - o.z), gap: CHEST_GAP, scale, room: w?.room || kind };
        if (w?.look) c.look = w.look;
        if (w?.flavor) c.flavor = w.flavor;
        chests.push(c);
    };
    const place = (list, rects = []) => {
        for (const r of rects) keep.push(r);
        const n = keep.length;
        placeChests({ a0: u0 - 0.5, a1: u1 + 0.5, b0: v0 - 0.5, b1: v1 + 0.5, filled, keep, wants: list.map((w) => [w.at[0], w.at[1], w]), scales: [3, 2.5, HOUSE_CHEST_SCALE] },
            (u, v, fu, fv, scale, w) => chestOf(u, v, fu, fv, scale, w));
        return keep.slice(n);
    };
    const env = {
        room, s, rng: s.frng, aisles, pre: room.pre || [], windows: room.windows || [], beds: room.nBeds || 1,
        box, slabAt: (u, v, L, shape) => p0.slabAt(u, v, L, shape),
        chests: place,
        putChest: ({ u, v, fu, fv, scale, look, room: rm, flavor }) => {
            chestOf(u, v, fu, fv, scale, { look, room: rm, flavor });
            const W = CHEST_W * scale / 2, D = CHEST_D * scale / 2;
            keep.push(Math.abs(fu) > 0.5 ? [u - D, u + D, v - W, v + W] : [u - W, u + W, v - D, v + D]);
        },
        bed: ({ sleep, king }) => {
            if (!room.beds) return;
            const a = p0.pt(sleep[0], sleep[1], l + 2), h = p0.pt(sleep[2], sleep[3], l + 2);
            room.beds.push({ x: a.x, y: a.y, z: a.z, yaw: Math.atan2(h.x - a.x, h.z - a.z), room: king ? 'king' : kind });
        },
    };
    const stat = furnishRoom(env);
    p0.flushSlabs();
    return stat;
}

// ------------------------------------------------------------------ keep
/**
 * The keep: a throne room in the middle (two storeys high), rooms on both
 * sides and behind the throne, and the same around it upstairs.
 */
function buildKeep(p, s, rng, out) {
    const { KW, KD, kv } = s;
    const st = s.stone;
    const fz = !!s.furnish; // generation 8: a roomy king's chamber (8 high, 15 × 12), furnished rooms (CastleFurniture.js)
    const top = fz ? 17 : 16;
    const ext = fz ? 4 : 0; // (generation 8: the keep goes 4 further back — the rooms behind the throne are 12 deep: the king's chamber; the hall and the rooms along it as long as before)
    const u0 = -KW, u1 = KW, v0 = kv - KD, v1 = kv + KD + ext;
    s.keepBox = { u0, u1, v0, v1 };
    p.box(u0, u1, -3, top, v0, v1, st);
    p.box(u0 + 2, u1 - 2, 0, top - 1, v0 + 2, v1 - 2, 0);
    p.box(u0 + 2, u1 - 2, -1, -1, v0 + 2, v1 - 2, s.floor);
    p.crenels(u0, u1, v0, v1, top + 1, st);
    const hw = s.hallHalf;
    const RN = fz ? 12 : 8; // (the depth of the rooms behind the throne: the king's chamber upstairs wants 12)
    const iv0 = v0 + 2, iv1 = v1 - 2;
    const hallV1 = iv1 - RN - 1;
    // walls between the hall and the side rooms / the rooms behind the throne
    p.box(-hw - 1, -hw - 1, 0, top - 1, iv0, iv1, st);
    p.box(hw + 1, hw + 1, 0, top - 1, iv0, iv1, st);
    p.box(-hw, hw, 0, top - 1, hallV1 + 1, hallV1 + 1, st);
    p.box(0, 0, 0, fz ? 7 : top - 1, hallV1 + 2, iv1, st); // (generation 8: the wall between the two rooms behind the throne stops at the floor of the upper one — the king's chamber is one)
    // the upper floor over the side rooms and behind the throne
    p.box(u0 + 2, -hw - 2, 8, 8, iv0, iv1, BLOCK.PLANKS_DARK);
    p.box(hw + 2, u1 - 2, 8, 8, iv0, iv1, BLOCK.PLANKS_DARK);
    p.box(-hw, hw, 8, 8, hallV1 + 2, iv1, BLOCK.PLANKS_DARK);
    // front door: a porch with an arch, banners and lanterns on both sides
    const gd = s.style === 'grand' ? 3 : 2;
    p.box(-gd - 2, gd + 2, -1, 8, v0 - 2, v0 - 1, st);
    p.box(-gd - 1, gd + 1, 9, 9, v0 - 2, v0 - 1, st);
    p.box(-gd, gd, 0, 6, v0 - 2, v0 + 1, 0);
    p.box(-gd, gd, -1, -1, v0 - 2, v0 + 1, s.carpet);
    for (const su of [-1, 1]) {
        p.box(su * (gd + 4), su * (gd + 5), 4, 12, v0 - 1, v0 - 1, s.carpet);
        p.box(su * (gd + 3), su * (gd + 3), 6, 6, v0 - 3, v0 - 3, BLOCK.LANTERN);
    }
    // a band of other stone round the keep, corner turrets with roofs
    const band = st === BLOCK.COBBLE ? BLOCK.CS_GREY : BLOCK.COBBLE;
    p.walls(u0, u1, v0, v1, 8, 8, band);
    p.box(-gd, gd, 7, 8, v0 - 2, v0 - 1, st);
    for (const [cu, cv] of [[u0 - 2, v0 - 2], [u1 + 2, v0 - 2], [u0 - 2, v1 + 2], [u1 + 2, v1 + 2]]) {
        if (s.roundTowers) {
            p.cyl(cu, cv, 3.2, -1, top + 6, st);
            p.cyl(cu, cv, 3.2, top + 7, top + 7, st, 2.2);
            const m = p.parts.length;
            for (let k = 0; k <= 5; k++) { const rr = 3.7 * (1 - k / 6); if (rr > 0.4) p.cyl(cu, cv, rr, top + 7 + k, top + 7 + k, s.roof); }
            p.slopeTop(m, s.roof);
        } else {
            p.box(cu - 3, cu + 3, -1, top + 6, cv - 3, cv + 3, st);
            p.crenels(cu - 3, cu + 3, cv - 3, cv + 3, top + 7, st);
            if (s.cones) { const m = p.parts.length; for (let k = 0; k <= 3; k++) p.box(cu - 3 + k, cu + 3 - k, top + 7 + k, top + 7 + k, cv - 3 + k, cv + 3 - k, s.roof); p.slopeTop(m, s.roof); }
        }
    }
    // windows high up
    for (let u = u0 + 4; u <= u1 - 4; u += 5) { p.box(u, u, 11, 12, v0, v0 + 1, 0); p.box(u, u, 11, 12, v1 - 1, v1, 0); }
    for (let v = v0 + 4; v <= v1 - 4; v += 5) { p.box(u0, u0 + 1, 11, 12, v, v, 0); p.box(u1 - 1, u1, 11, 12, v, v, 0); }

    // ---- the throne room
    const hall = { kind: 'throne', u0: -hw, u1: hw, v0: iv0, v1: hallV1, l: 0 };
    p.box(-1, 1, -1, -1, v0, hallV1 - 4, s.carpet); // the carpet from the door to the throne
    const doorRows = []; // (pillars keep clear of the doors into the side rooms)
    const pillars = () => {
        for (let v = iv0 + 3; v <= hallV1 - 5; v += 6) {
            for (const su of [-1, 1]) {
                const pu = su * (hw - 2);
                if (!doorRows.some((d) => d.su === su && Math.abs(d.v - v) <= 3 && Math.abs(d.v - (v + 1)) <= 3)) {
                    p.box(pu, pu + su, 0, top - 1, v, v + 1, st);
                    p.box(pu, pu, 6, 6, v - 1, v - 1, BLOCK.LANTERN);
                }
                // banners of the castle colour between the pillars
                p.box(su * hw, su * hw, 6, 11, v + 3, v + 4, s.carpet);
            }
        }
    };
    // the dais and the throne at the far end
    p.box(-3, 3, 0, 0, hallV1 - 4, hallV1, st);
    p.box(-2, 2, 0, 0, hallV1 - 3, hallV1, s.carpet);
    p.box(-1, 1, 1, 1, hallV1 - 1, hallV1, BLOCK.GOLD); // the seat
    p.box(-1, 1, 2, 6, hallV1, hallV1, BLOCK.GOLD); // the back
    p.box(0, 0, 7, 7, hallV1, hallV1, s.carpet);
    p.box(-2, -2, 1, 2, hallV1 - 1, hallV1, BLOCK.GOLD); // armrests
    p.box(2, 2, 1, 2, hallV1 - 1, hallV1, BLOCK.GOLD);
    p.box(-hw, hw, 9, 13, hallV1 + 1, hallV1 + 1, s.carpet); // a big banner behind it
    // light: lanterns along both walls, beside the throne, a chandelier over the hall
    for (let v = iv0 + 2; v <= hallV1 - 1; v += 3) { p.box(-hw, -hw, 7, 7, v, v, BLOCK.LANTERN); p.box(hw, hw, 7, 7, v, v, BLOCK.LANTERN); }
    p.box(-3, -3, 1, 3, hallV1, hallV1, BLOCK.LANTERN); p.box(3, 3, 1, 3, hallV1, hallV1, BLOCK.LANTERN);
    for (const cv of [Math.round((iv0 + hallV1) / 2) - 5, Math.round((iv0 + hallV1) / 2) + 3]) {
        p.box(0, 0, 13, 15, cv, cv, BLOCK.GOLD);
        p.box(-2, 2, 12, 12, cv, cv, BLOCK.GOLD); p.box(0, 0, 12, 12, cv - 2, cv + 2, BLOCK.GOLD);
        for (const [a, b] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) p.box(a, a, 11, 11, cv + b, cv + b, BLOCK.LANTERN);
    }
    // (the king sits facing the door: local −v)
    out.throne = { ...p.pt(0, hallV1 - 1, 2), yaw: p.yaw(0) };
    out.throneFront = p.pt(0, hallV1 - 7, 0);
    out.rooms.push({ ...hall, name: ROOM_NAMES.throne, ...p.rect(hall.u0, hall.u1, hall.v0, hall.v1), y: p.L(0) - 1.5 });
    // the gates of the throne room in the front doorway (two leaves, opening inwards — src/game/Alohomora.js):
    // the castle's people pass, a stranger needs «Алохомора Максима» or a blast
    const gc = p.pt(0, v0 + 0.5, 0), gIn = p.pt(0, v0 + 1.5, 0);
    out.throneGate = { x: gc.x, y: gc.y, z: gc.z, ry: Math.atan2(-(gIn.x - gc.x), -(gIn.z - gc.z)), w: 2 * gd + 1, h: 7 };

    // ---- walking graph inside
    const doorOut = p.node(0, v0 - 5, 0, 'keepDoor');
    const doorIn = p.node(0, iv0 + 1, 0, 'keepIn');
    p.link(doorOut, doorIn);
    const hallMid = p.node(0, Math.round((iv0 + hallV1) / 2), 0, 'hall');
    p.link(doorIn, hallMid);
    const throneFront = p.node(0, hallV1 - 6, 0, 'throneFront');
    p.link(hallMid, throneFront);
    out.keepDoor = doorOut;

    // ---- rooms on the sides (2 or 3 each), behind the throne (2), the same upstairs
    // Paths through a room go door → (corner) → middle → (corner) → next door in straight
    // legs; furniture keeps off them.
    const leg = (a, b) => ({ u0: Math.min(a[0], b[0]) - 1, u1: Math.max(a[0], b[0]) + 1, v0: Math.min(a[1], b[1]) - 1, v1: Math.max(a[1], b[1]) + 1 });
    // the corner of an L from a door point: through a wall across u → go along u first
    const corner = (door, uWall, mid) => (uWall ? [mid[0], door[1]] : [door[0], mid[1]]);
    const nodes = (pts, l, tagLast) => {
        let prev = null;
        const ids = [];
        pts.forEach((q, i) => {
            const id = p.node(q[0], q[1], l, i === pts.length - 1 ? tagLast : '');
            if (prev != null) p.link(prev, id);
            prev = id;
            ids.push(id);
        });
        return ids;
    };
    // the cells of an upper room next to a window of the keep's outer walls (curtains hang there)
    const windowCells = (rm) => {
        const w = [];
        for (let u = u0 + 4; u <= u1 - 4; u += 5) {
            if (u < rm.u0 || u > rm.u1) continue;
            if (rm.v0 === v0 + 2) w.push([u, rm.v0]);
            if (rm.v1 === v1 - 2) w.push([u, rm.v1]);
        }
        for (let v = v0 + 4; v <= v1 - 4; v += 5) {
            if (v < rm.v0 || v > rm.v1) continue;
            if (rm.u0 === u0 + 2) w.push([rm.u0, v]);
            if (rm.u1 === u1 - 2) w.push([rm.u1, v]);
        }
        return w;
    };
    const nRows = iv1 - iv0 + 1 - ext; // (the rows the side rooms are shared out by: the old length; the last room gets the extension)
    const nSide = nRows >= 39 ? 3 : 2;
    const kinds = ['kitchen', 'dining', 'armoury', 'storeroom', 'guardroom', 'chapel'];
    const upKinds = ['bedroom', 'library', 'bedroom', 'chapel', 'bedroom', 'library', 'bedroom'];
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    let kIdx = 0, upIdx = 0;
    const sideRooms = [];
    for (const su of [-1, 1]) {
        const ru0 = su < 0 ? u0 + 2 : hw + 2, ru1 = su < 0 ? -hw - 2 : u1 - 2;
        for (let i = 0; i < nSide; i++) {
            const rv0 = iv0 + Math.round(nRows * i / nSide), rv1 = i === nSide - 1 ? iv1 : iv0 + Math.round(nRows * (i + 1) / nSide) - 1;
            if (i > 0) { p.box(ru0, ru1, 0, top - 1, rv0, rv0, st); }
            const r0 = i > 0 ? rv0 + 1 : rv0;
            const isStairs = su > 0 && i === 0;
            const kind = isStairs ? 'stairs' : kinds[kIdx++ % kinds.length];
            const cu = Math.round((ru0 + ru1) / 2), cvv = Math.round((r0 + rv1) / 2);
            // a door into the hall (where this part of the side is next to the hall)
            const wallU = su < 0 ? -hw - 1 : hw + 1;
            const dv = Math.min(cvv, hallV1 - 2);
            p.box(wallU, wallU, 0, 5, dv - 1, dv + 1, 0);
            doorRows.push({ su, v: dv });
            const room = { kind, u0: ru0, u1: ru1, v0: r0, v1: rv1, l: 0, doorSide: su < 0 ? 'u1' : 'u0' };
            if (isStairs) {
                // stairs up along the outer wall, and the hole above them
                const su0 = u1 - 5, su1 = u1 - 3;
                stairsV(p, su0, su1, r0 + 1, 1, 9, BLOCK.PLANKS_DARK);
                p.box(su0, su1, 8, 8, r0 + 1, r0 + 8, 0);
                const ids = nodes([[wallU - su * 3, dv], [wallU + su * 2, dv], [su0 - 2, dv], [su0 - 2, r0], [su0 + 1, r0]], 0, 'stairsBottom');
                p.link(hallMid, ids[0]);
                out.stairsTop = p.node(su0 + 1, r0 + 10, 9, 'stairsTop');
                out.stairsTopPt = [su0 + 1, r0 + 10];
                p.link(ids[ids.length - 1], out.stairsTop);
            } else {
                const door = [wallU, dv], mid = [cu, cvv];
                const c1 = corner(door, true, mid);
                const st2 = furnish(p, room, s, out.chests, [leg(door, c1), leg(c1, mid)]);
                if (st2) room.items = st2.items;
                const ids = nodes([[wallU - su * 3, dv], [wallU + su * 2, dv], c1, mid], 0, 'room:' + kind);
                p.link(hallMid, ids[0]);
            }
            out.rooms.push({ ...room, name: ROOM_NAMES[kind], ...p.rect(ru0, ru1, r0, rv1), y: p.L(0) - 1.5 });
            sideRooms.push({ su, ru0, ru1, r0, rv1, i });
        }
    }
    pillars();
    if (fz) {
        // braziers (a stone bowl with a fire) at the throne room's walls between the pillars — off the doors, off the carpet
        for (let v = iv0 + 3; v <= hallV1 - 5; v += 6) {
            for (const su of [-1, 1]) {
                const bv = v + 2;
                if (doorRows.some((d) => d.su === su && Math.abs(d.v - bv) <= 3)) continue;
                p.box(su * hw, su * hw, 0, 0, bv, bv, BLOCK.CS_DARK);
                p.box(su * hw, su * hw, 1, 1, bv, bv, BLOCK.LANTERN);
            }
        }
    }
    // behind the throne: the treasury and a store / study
    for (const su of [-1, 1]) {
        const ru0 = su < 0 ? -hw : 1, ru1 = su < 0 ? -1 : hw;
        const kind = su < 0 ? 'treasury' : 'storeroom';
        const du = su * Math.round(hw / 2);
        p.box(du - 1, du + 1, 0, 5, hallV1 + 1, hallV1 + 1, 0);
        const room = { kind, u0: ru0, u1: ru1, v0: hallV1 + 2, v1: iv1, l: 0, doorSide: 'v0' };
        const st2 = furnish(p, room, s, out.chests, [leg([du, hallV1 + 1], [du, hallV1 + 5])]);
        if (st2) room.items = st2.items;
        const ids = nodes([[du, hallV1 - 2], [du, hallV1 + 5]], 0, 'room:' + kind);
        p.link(throneFront, ids[0]);
        out.rooms.push({ ...room, name: ROOM_NAMES[kind], ...p.rect(ru0, ru1, hallV1 + 2, iv1), y: p.L(0) - 1.5 });
    }
    // upstairs: the rooms above, connected through doors one after another (a U around the hall)
    const upl = 9;
    const ring = [];
    for (const r of sideRooms.filter((x) => x.su > 0)) ring.push(r);
    if (fz) ring.push({ su: 1, ru0: -hw, ru1: hw, r0: hallV1 + 2, rv1: iv1, north: true, king: true }); // (one big chamber over both rooms behind the throne)
    else ring.push({ su: 1, ru0: 1, ru1: hw, r0: hallV1 + 2, rv1: iv1, north: true }, { su: -1, ru0: -hw, ru1: -1, r0: hallV1 + 2, rv1: iv1, north: true });
    for (const r of sideRooms.filter((x) => x.su < 0).reverse()) ring.push(r);
    // the doors between neighbours of the ring: [point, through a u-wall?]
    const doors = [];
    for (let i = 0; i + 1 < ring.length; i++) {
        const r = ring[i], next = ring[i + 1];
        if (!r.north && !next.north) {
            const du = Math.round((r.ru0 + r.ru1) / 2);
            const vb = r.su > 0 ? r.rv1 + 1 : r.r0 - 1;
            p.box(du - 1, du + 1, upl, upl + 5, vb, vb, 0);
            doors.push([[du, vb], false]);
        } else {
            const du = !r.north ? (r.su > 0 ? hw + 1 : -hw - 1) : next.north ? 0 : (next.su > 0 ? hw + 1 : -hw - 1);
            const dv = fz ? hallV1 + 3 : Math.round((hallV1 + 2 + iv1) / 2); // the middle of the rooms behind the throne (the king's chamber: its front, the rest of it is free for the bed)
            p.box(du, du, upl, upl + 5, dv - 1, dv + 1, 0);
            doors.push([[du, dv], true]);
        }
    }
    for (let i = 0; i < ring.length; i++) {
        const r = ring[i];
        const isStairRoom = i === 0;
        const kind = isStairRoom ? 'gallery' : r.north && r.su > 0 ? 'king' : upKinds[upIdx++ % upKinds.length];
        const mid = r.king ? [0, hallV1 + 3] : [Math.round((r.ru0 + r.ru1) / 2), Math.round((r.r0 + r.rv1) / 2)];
        const entry = i === 0 ? [out.stairsTopPt, true] : doors[i - 1];
        const exit = doors[i];
        const pts = [entry[0], corner(entry[0], entry[1], mid), mid];
        if (exit) pts.push(corner(exit[0], exit[1], mid), exit[0]);
        const aisles = [];
        for (let k = 1; k < pts.length; k++) aisles.push(leg(pts[k - 1], pts[k]));
        if (!isStairRoom || fz) {
            const fr = { kind, u0: r.ru0, u1: r.ru1, v0: r.r0, v1: r.rv1, l: upl, doorSide: 'v0', beds: out.beds };
            if (fz) {
                fr.nBeds = s.style === 'compact' ? 1 : 2;
                fr.windows = windowCells(fr);
                // (the stairwell: the stairs and the hole over them are not floor)
                if (isStairRoom) fr.pre = [{ u0: u1 - 5, u1: u1 - 3, v0: r.r0, v1: r.r0 + 9 }];
            }
            const st2 = furnish(p, fr, s, out.chests, aisles);
            out.rooms.push({ kind, name: ROOM_NAMES[kind], ...p.rect(r.ru0, r.ru1, r.r0, r.rv1), y: p.L(upl) - 1.5, l: upl, ...(st2 ? { items: st2.items } : {}) });
        }
        // windows over the throne room from the side rooms (a gallery)
        if (!r.north) {
            const wallU = r.su < 0 ? -hw - 1 : hw + 1;
            for (let v = r.r0 + 1; v <= Math.min(r.rv1, hallV1) - 1; v += 3) p.box(wallU, wallU, upl + 1, upl + 2, v, v, 0);
        }
        // nodes: the middle carries the room tag
        let prev = null;
        pts.forEach((q, k) => {
            const id = p.node(q[0], q[1], upl, k === 2 && !isStairRoom ? 'room:' + kind : '');
            if (prev != null) p.link(prev, id);
            prev = id;
        });
    }
    // a great tower on the keep (grand castles)
    if (s.style === 'grand') {
        const tu = u0 + 5, tv = v1 - 5;
        p.box(tu - 5, tu + 5, top + 1, top + 14, tv - 5, tv + 5, st);
        p.box(tu - 3, tu + 3, top + 1, top + 13, tv - 3, tv + 3, 0);
        p.crenels(tu - 5, tu + 5, tv - 5, tv + 5, top + 15, st);
        const m = p.parts.length;
        for (let k = 0; k <= 5; k++) p.box(tu - 5 + k, tu + 5 - k, top + 15 + k, top + 15 + k, tv - 5 + k, tv + 5 - k, s.roof);
        p.slopeTop(m, s.roof);
    }
    out.hall = hall;
}

// ------------------------------------------------------------ the castle
function buildCastle(p, s, rng, out) {
    const { W, D, T, H } = s;
    const st = s.stone;
    // ground inside the walls: cobbles under the gate path, grass elsewhere
    // ---- curtain walls
    p.box(-W, W, -3, H - 1, -D, -D + T - 1, st);
    p.box(-W, W, -3, H - 1, D - T + 1, D, st);
    p.box(-W, -W + T - 1, -3, H - 1, -D, D, st);
    p.box(W - T + 1, W, -3, H - 1, -D, D, st);
    // battlements on the outer edge
    p.crenels(-W, W, -D, D, H, st);
    // walkway level (the top of the walls)
    const walk = H - 1;
    // ---- the gate
    const g = s.style === 'grand' ? 3 : 2;
    p.box(-g, g, 0, 7, -D, -D + T - 1, 0);
    p.box(-g - 1, g + 1, 8, 8, -D, -D, st);
    // ---- towers
    const tTop = H + s.towerExtra;
    const opts = { size: s.towerSize, cone: s.cones, walkL: walk };
    const corners = [[-W, -D], [W, -D], [-W, D], [W, D]];
    for (const [u, v] of corners) tower(p, s, u, v, tTop, opts);
    // gate towers
    const gt = g + 1 + s.towerSize;
    tower(p, s, -gt, -D, tTop - 2, { ...opts, size: s.towerSize - 1 });
    tower(p, s, gt, -D, tTop - 2, { ...opts, size: s.towerSize - 1 });
    // towers along the walls
    const mids = [];
    for (let k = 1; k < s.midTowers + 1; k++) {
        const f = k / (s.midTowers + 1);
        const uu = Math.round(-W + 2 * W * f), vv = Math.round(-D + 2 * D * f);
        mids.push([uu, D], [-W, vv], [W, vv]);
    }
    for (const [u, v] of mids) tower(p, s, u, v, tTop - 3, { ...opts, size: s.towerSize - 1, cone: s.cones && s.style !== 'fortress' });
    // openings along the walk through every tower (so the guards can walk round)
    // (the walk runs along the middle of the wall: u = ±(W−1), v = ±(D−1))
    const tw = s.towerSize + 1;
    const cut = (u0, u1, v0, v1) => p.box(u0, u1, walk + 1, walk + 6, v0, v1, 0);
    for (const [u, v] of [...mids, [-gt, -D], [gt, -D]]) {
        const wv = Math.sign(v) * (D - 1), wu = Math.sign(u) * (W - 1);
        if (Math.abs(v) === D) cut(u - tw, u + tw, wv - 1, wv + 1); // on the front / back wall: along u
        else cut(wu - 1, wu + 1, v - tw, v + tw); // on a side wall: along v
    }
    for (const [u, v] of corners) {
        const wu = Math.sign(u) * (W - 1), wv = Math.sign(v) * (D - 1);
        // from the tower's middle inwards along both walls
        cut(Math.min(wu, u - Math.sign(u) * tw), Math.max(wu, u - Math.sign(u) * tw), wv - 1, wv + 1);
        cut(wu - 1, wu + 1, Math.min(wv, v - Math.sign(v) * tw), Math.max(wv, v - Math.sign(v) * tw));
        cut(wu - 1, wu + 1, wv - 1, wv + 1);
    }
    // ---- stairs up to the walls: along the front wall on both sides of the gate,
    // or (a small castle) along the west wall — wherever no tower is in the way
    const sv = -D + T;
    const S0 = gt + s.towerSize + 3;
    const nSt = walk + 1;
    const towerBoxes = [...corners.map(([u, v]) => [u, v, s.towerSize]), [-gt, -D, s.towerSize - 1], [gt, -D, s.towerSize - 1], ...mids.map(([u, v]) => [u, v, s.towerSize - 1])];
    const freeOfTowers = (a0, a1, b0, b1) => !towerBoxes.some(([u, v, h]) => a1 >= u - h - 1 && a0 <= u + h + 1 && b1 >= v - h - 1 && b0 <= v + h + 1);
    const stairPlans = [];
    if (freeOfTowers(-S0 - nSt, -S0, sv, sv + 2)) stairPlans.push({ axis: 'u', dir: -1, start: -S0 });
    if (freeOfTowers(S0, S0 + nSt, sv, sv + 2)) stairPlans.push({ axis: 'u', dir: 1, start: S0 });
    if (!stairPlans.length) {
        const sv0 = -D + s.towerSize + 4, uu = -W + T;
        if (freeOfTowers(uu, uu + 2, sv0, sv0 + nSt)) stairPlans.push({ axis: 'v', dir: 1, start: sv0, uu });
    }
    for (const sp of stairPlans) {
        if (sp.axis === 'u') stairsU(p, sp.start, sp.dir, sv, sv + 2, nSt, st);
        else stairsV(p, sp.uu, sp.uu + 2, sp.start, 1, nSt, st);
    }
    // ---- the courtyard
    p.box(-g, g, -1, -1, -D - 3, s.kv - s.KD, BLOCK.COBBLE); // the way from the gate to the keep
    // the well
    const wu = Math.round(-W * 0.45), wv = Math.round(-D * 0.35);
    p.cyl(wu, wv, 2.2, 0, 1, BLOCK.COBBLE);
    p.cyl(wu, wv, 1.2, -1, 1, BLOCK.CS_DARK);
    p.box(wu - 2, wu - 2, 2, 4, wv, wv, BLOCK.PLANKS_DARK); p.box(wu + 2, wu + 2, 2, 4, wv, wv, BLOCK.PLANKS_DARK);
    p.box(wu - 2, wu + 2, 5, 5, wv, wv, BLOCK.PLANKS_DARK);
    // barracks along the east wall
    const bu1 = W - T, bu0 = bu1 - 10, bv0 = Math.round(-D * 0.6), bv1 = bv0 + 18;
    if (bu0 > s.KW + 9) {
        p.box(bu0, bu1, -1, 7, bv0, bv1, st);
        p.box(bu0 + 1, bu1 - 1, 0, 6, bv0 + 1, bv1 - 1, 0);
        p.box(bu0, bu0, 0, 4, bv0 + 8, bv0 + 10, 0);
        const m = p.parts.length;
        for (let k = 8; k <= 11; k++) p.box(bu0 - 1 + (k - 8), bu1 + 1 - (k - 8), k, k, bv0 - 1, bv1 + 1, s.roof);
        p.slopeTop(m, s.roof);
        for (let v = bv0 + 2; v <= bv1 - 2; v += 3) { if (v >= bv0 + 7 && v <= bv0 + 11) continue; p.box(bu1 - 4, bu1 - 1, 0, 0, v, v, BLOCK.PLANKS_DARK); p.box(bu1 - 4, bu1 - 2, 1, 1, v, v, BLOCK.CLOTH_WHITE); }
        p.box(bu0 + 2, bu0 + 2, 5, 5, bv0 + 4, bv0 + 4, BLOCK.LANTERN);
        // the knights' bunks (head to the wall) and straw mats on the floor by the door side (NightLife.js)
        for (let v = bv0 + 2; v <= bv1 - 2; v += 3) {
            if (v >= bv0 + 7 && v <= bv0 + 11) continue;
            const a = p.pt(bu1 - 2.6, v, 2), h = p.pt(bu1, v, 2), m = p.pt(bu0 + 3.3, v, 0), mh = p.pt(bu0 + 6, v, 0);
            out.beds.push({ x: a.x, y: a.y, z: a.z, yaw: Math.atan2(h.x - a.x, h.z - a.z), room: 'barracks' });
            out.beds.push({ x: m.x, y: m.y, z: m.z, yaw: Math.atan2(mh.x - m.x, mh.z - m.z), room: 'barracks', mat: true });
        }
        let bst = null;
        if (s.furnish) {
            // (generation 8: weapon racks, benches, barrels and the soldiers' footlockers along the door's wall; the bunks' side and the mats are left to the sleepers)
            const lying = []; // (the rows where knights lie — on the bunks and on the straw mats by them: 3 rows each, across the room)
            for (let v = bv0 + 2; v <= bv1 - 2; v += 3) { if (v >= bv0 + 7 && v <= bv0 + 11) continue; lying.push({ u0: bu0 + 1, u1: bu1 - 1, v0: v - 1, v1: v + 1 }); }
            bst = furnish(p, { kind: 'barracks', u0: bu0 + 1, u1: bu1 - 1, v0: bv0 + 1, v1: bv1 - 1, l: 0, doorSide: 'u0', pre: lying },
                s, out.chests, [{ u0: bu0 - 1, u1: bu0 + 5, v0: bv0 + 8, v1: bv0 + 10 }]);
        }
        out.rooms.push({ kind: 'barracks', name: ROOM_NAMES.barracks, ...p.rect(bu0 + 1, bu1 - 1, bv0 + 1, bv1 - 1), y: p.L(0) - 1.5, l: 0, ...(bst ? { items: bst.items } : {}) });
        const bOut = p.node(bu0 - 3, bv0 + 9, 0, 'barracksDoor');
        const bIn = p.node(bu0 + 4, bv0 + 9, 0, 'room:barracks');
        p.link(bOut, bIn);
        out._barracks = bOut;
    }
    // a smithy (open hut) and training dummies on the west side
    const su0 = -W + T + 1, su1 = su0 + 8, sv0 = Math.round(D * 0.1), sv1 = sv0 + 8;
    if (su1 < -s.KW - 10) {
        p.box(su0, su0, 0, 6, sv0, sv1, BLOCK.COBBLE);
        p.box(su0, su1, 0, 6, sv1, sv1, BLOCK.COBBLE);
        p.box(su1, su1, 0, 6, sv1, sv1, BLOCK.PLANKS_DARK);
        p.box(su1, su1, 0, 6, sv0, sv0, BLOCK.PLANKS_DARK);
        p.box(su0, su1, 7, 7, sv0, sv1, s.roof);
        p.box(su0 + 1, su0 + 2, 0, 1, sv1 - 2, sv1 - 1, BLOCK.COBBLE);
        p.box(su0 + 1, su0 + 2, 2, 2, sv1 - 2, sv1 - 1, BLOCK.LANTERN);
        p.box(su0 + 4, su0 + 5, 0, 0, sv0 + 3, sv0 + 3, BLOCK.CS_DARK);
        out.rooms.push({ kind: 'smithy', name: ROOM_NAMES.smithy, ...p.rect(su0 + 1, su1 - 1, sv0 + 1, sv1 - 1), y: p.L(0) - 1.5, l: 0 });
        out._smithy = [su0 + 5, sv0 + 4, su1 + 2];
    }
    for (let k = 0; k < 2; k++) {
        const du = -W + T + 4 + k * 4, dv = Math.round(-D * 0.1) - 6;
        p.box(du, du, 0, 2, dv, dv, BLOCK.HAY);
        p.box(du - 1, du + 1, 2, 2, dv, dv, BLOCK.HAY);
    }
    // ---- the keep
    buildKeep(p, s, rng, out);
    // ---- walking graph: gate → courtyard → keep; the wall walk round the castle
    const gateOut = p.node(0, -D - 5, 0, 'gateOut');
    const gateIn = p.node(0, -D + T + 2, 0, 'gateIn');
    p.link(gateOut, gateIn);
    const yard = p.line(0, -D + T + 2, 0, s.kv - s.KD - 3, 0, 8);
    p.link(yard[yard.length - 1], out.keepDoor);
    const yardMid = yard[Math.floor(yard.length / 2)];
    p.nodes[yardMid].tag = p.nodes[yardMid].tag || 'yard';
    const well = p.node(wu + 4, wv, 0, 'well');
    p.link(yard[0], well);
    if (out._barracks != null) p.link(yard[Math.min(1, yard.length - 1)], out._barracks);
    // the guards' posts at the gate
    out.posts = [
        { ...p.pt(-g - 2, -D - 3, 0), yaw: p.yaw(0) },
        { ...p.pt(g + 2, -D - 3, 0), yaw: p.yaw(0) },
        { ...p.pt(-g - 2, -D + T + 2, 0), yaw: p.yaw(0) },
        { ...p.pt(g + 2, -D + T + 2, 0), yaw: p.yaw(0) },
    ];
    // the wall walk: a loop over the walls
    const mw = -W + 1, me = W - 1, mn = D - 1, ms = -D + 1;
    const loop = [];
    const corners4 = []; // (the loop's corners: the guard's posts on four different towers — KnightPosts.js)
    loop.push(...p.line(mw, ms, me, ms, walk + 1, 10)); corners4.push(0, loop.length - 1);
    loop.push(...p.line(me, ms, me, mn, walk + 1, 10).slice(1)); corners4.push(loop.length - 1);
    loop.push(...p.line(me, mn, mw, mn, walk + 1, 10).slice(1)); corners4.push(loop.length - 1);
    loop.push(...p.line(mw, mn, mw, ms, walk + 1, 10).slice(1));
    out.towerPosts = corners4.slice(0, 4);
    p.link(loop[loop.length - 1], loop[0]);
    out.wallWalk = loop;
    // stairs to the walk
    // (round the gate tower: in along the yard, across, then to the foot of the stairs)
    const ty = -D + T + s.towerSize + 3;
    const a1 = p.node(0, ty, 0);
    p.link(gateIn, a1);
    if (out._smithy) {
        const [wu2, wv2, ou] = out._smithy;
        const ids = [p.node(wu2, wv2, 0, 'work:smithy'), p.node(ou, wv2, 0), p.node(ou, ty, 0)];
        p.link(ids[0], ids[1]); p.link(ids[1], ids[2]); p.link(ids[2], a1);
    }
    const sp = stairPlans[0];
    if (sp) {
        let ids;
        if (sp.axis === 'u') {
            const topU = sp.start + sp.dir * (nSt - 1);
            ids = [a1, p.node(sp.start - sp.dir, ty, 0), p.node(sp.start - sp.dir, sv + 1, 0, 'wallStairs'), p.node(topU, sv + 1, walk + 1), p.node(topU, ms, walk + 1)];
        } else {
            const topV = sp.start + nSt - 1;
            ids = [a1, p.node(sp.uu + 4, ty, 0), p.node(sp.uu + 4, sp.start - 1, 0), p.node(sp.uu + 1, sp.start - 1, 0, 'wallStairs'), p.node(sp.uu + 1, topV, walk + 1), p.node(mw, topV, walk + 1)];
        }
        for (let k = 1; k < ids.length; k++) p.link(ids[k - 1], ids[k]);
        const onWall = ids[ids.length - 1];
        // join the loop at the nearest node of the wall walk
        let best = loop[0], bd = Infinity;
        for (const id of loop) { const n = p.nodes[id]; const d = Math.hypot(n.x - p.nodes[onWall].x, n.z - p.nodes[onWall].z); if (Math.abs(n.y - p.nodes[onWall].y) < 0.1 && d < bd) { bd = d; best = id; } }
        p.link(onWall, best);
    }
}

// ---------------------------------------------------------------- village
/** One house on a lot; its door looks at the road (local −v of the lot). */
// House kinds: half-sizes (w across the front, d deep), wall height, wealth
const HOUSE_KINDS = {
    hut: { w: 4, d: 4, h: 6, rich: false },
    cottage: { w: 5, d: 4, h: 6, rich: false },
    longhouse: { w: 6, d: 4, h: 6, rich: false },
    barn: { w: 6, d: 5, h: 7, rich: false, barn: true },
    manor: { w: 6, d: 5, h: 7, rich: true },
    stone: { w: 6, d: 5, h: 7, rich: true },
    brick: { w: 6, d: 5, h: 7, rich: true },
    towerhouse: { w: 4, d: 4, h: 11, rich: true },
};
export const POOR_HOUSES = ['hut', 'cottage', 'cottage', 'longhouse', 'hut', 'barn'];
export const RICH_HOUSES = ['manor', 'stone', 'brick', 'manor', 'towerhouse'];

/**
 * A house on a lot: the door side (−b) towards the road. Poor houses: one room
 * (a bed, a hearth, a table, a chest); rich ones: a living room and a bedroom,
 * carpets, books, two chests. Each one a little different (windows, chimney,
 * flower boxes, a woodpile...). The game puts the real door, the glass, the
 * beds and the chests in (src/game/Houses.js) from the records in `out.houses`.
 */
/**
 * A door's rotation.y turned so that its leaf opens INTO the room (the author: «двери должны
 * открываться внутрь дома» — a gust or a shove said from outside throws it open): a door opens
 * towards its local −Z (src/game/Doors.js); (ix, iz) points from the doorway into the room.
 */
export function inwardRy(ry, ix, iz) {
    return -Math.sin(ry) * ix - Math.cos(ry) * iz >= 0 ? ry : ry + Math.PI;
}

export function buildHouse(p, kind, cu, cv, face, rng, s, out) {
    const P = {
        box: (a0, a1, l0, l1, b0, b1, t) => {
            const [x0, z0] = rotLot(a0, b0, face), [x1, z1] = rotLot(a1, b1, face);
            p.box(cu + x0, cu + x1, l0, l1, cv + z0, cv + z1, t);
        },
        pt: (a, b, l = 0) => { const [x, z] = rotLot(a, b, face); return p.pt(cu + x, cv + z, l); },
        node: (a, b, l, tag) => { const [x, z] = rotLot(a, b, face); return p.node(cu + x, cv + z, l, tag); },
        // world yaw of a facing along lot (a, b) (character yaw: the model faces −Z)
        yaw: (a, b) => { const o = P.pt(0, 0), q = P.pt(a, b); return Math.atan2(-(q.x - o.x), -(q.z - o.z)); },
        // world rotation.y of a thin thing lying along lot direction (a, b) (a door, a pane)
        along: (a, b) => { const o = P.pt(0, 0), q = P.pt(a, b); return Math.atan2(-(q.z - o.z), q.x - o.x); },
    };
    const T = HOUSE_KINDS[kind];
    const { w, d, h, rich } = T;
    const filled = new Set(); // (what stands on the floor inside — placeChests)
    P.box = floorCells(P.box, 0, filled);
    const wall = kind === 'brick' ? BLOCK.BRICK : kind === 'stone' || kind === 'towerhouse' ? s.houseStone : rich ? BLOCK.PLASTER : kind === 'longhouse' ? BLOCK.PLANKS_DARK : s.poorWall;
    const base = rich ? s.houseStone : kind === 'cottage' ? BLOCK.COBBLE : BLOCK.PLANKS_DARK;
    const roof = kind === 'towerhouse' ? s.roof : rich ? s.villageRoof : kind === 'barn' ? BLOCK.ROOF_RED : s.poorRoof;
    const timber = BLOCK.PLANKS_DARK;
    const L = (l) => p.L(l);
    const house = {
        kind, rich, id: null, door: null, inside: null, doorNode: null, homeNode: null, beds: 0,
        doorRec: null, windows: [], chests: [], bedSpots: [], c: P.pt(0, 0), r: Math.max(w, d) + 1,
    };
    // ---- the shell: floor, walls, a stone course below, corner posts
    P.box(-w, w, -1, -1, -d, d, rich ? BLOCK.PLANKS : BLOCK.PLANKS_DARK);
    P.box(-w, w, 0, h - 1, -d, -d, wall); P.box(-w, w, 0, h - 1, d, d, wall);
    P.box(-w, -w, 0, h - 1, -d, d, wall); P.box(w, w, 0, h - 1, -d, d, wall);
    P.box(-w, w, 0, 0, -d, -d, base); P.box(-w, w, 0, 0, d, d, base);
    P.box(-w, -w, 0, 0, -d, d, base); P.box(w, w, 0, 0, -d, d, base);
    P.box(-w + 1, w - 1, 0, h - 1, -d + 1, d - 1, 0); // (nothing grows inside)
    for (const [a, b] of [[-w, -d], [w, -d], [-w, d], [w, d]]) P.box(a, a, 0, h - 1, b, b, kind === 'stone' || kind === 'brick' ? s.houseStone : timber);
    if (kind === 'manor') { // half-timbering: a beam under the eaves and one across the middle
        P.box(-w, w, h - 1, h - 1, -d, -d, timber); P.box(-w, w, h - 1, h - 1, d, d, timber);
        P.box(-w, w, 3, 3, -d, -d, timber); P.box(-w, w, 3, 3, d, d, timber);
    }
    // ---- the door (3 wide, 5 high; a barn: 5 wide, open)
    const da = rich && kind !== 'towerhouse' ? -2 : 0;
    const dw = T.barn ? 2 : 1;
    const doorTop = s.doorTop ?? 4; // (wizards' houses: a door one higher, for the pointed hats)
    P.box(da - dw, da + dw, 0, doorTop, -d, -d, 0);
    P.box(da - dw - 1, da + dw + 1, doorTop + 1, doorTop + 1, -d, -d, timber); // the lintel
    P.box(da - dw, da + dw, -1, -1, -d - 2, -d - 1, BLOCK.PATH); // the doorstep
    if (!T.barn) {
        const dp = P.pt(da, -d);
        const di = P.pt(da, -d + 1);
        house.doorRec = { x: dp.x, y: dp.y, z: dp.z, ry: inwardRy(P.along(1, 0), di.x - dp.x, di.z - dp.z), w: 3, h: doorTop + 1 };
    }
    // ---- windows (holes the game glazes): front, sides, the back of a rich house
    const win = (a0, a1, b0, b1, l0, l1) => {
        P.box(a0, a1, l0, l1, b0, b1, 0);
        const q0 = P.pt(a0, b0), q1 = P.pt(a1, b1);
        const alongA = b0 === b1;
        house.windows.push({
            x: (q0.x + q1.x) / 2, z: (q0.z + q1.z) / 2, y: (L(l0) + L(l1)) / 2 - 1,
            ry: alongA ? P.along(1, 0) : P.along(0, 1),
            w: (alongA ? a1 - a0 : b1 - b0) + 1, h: l1 - l0 + 1,
        });
    };
    const wl0 = 2, wl1 = rich ? 4 : 3;
    if (rich && kind !== 'towerhouse') {
        win(1, 2, -d, -d, wl0, wl1); win(4, 4, -d, -d, wl0, wl1);
        win(-w, -w, -3, -2, wl0, wl1); win(w, w, -3, -2, wl0, wl1);
        win(-4, -3, d, d, wl0, wl1);
        if (rng() < 0.6) for (const a of [1, 2, 4]) P.box(a, a, 1, 1, -d - 1, -d - 1, BLOCK.FLOWERS); // flower boxes
    } else if (T.barn) {
        win(-w, -w, 0, 0, 3, 4); win(w, w, 0, 0, 3, 4);
    } else {
        const fa = w - 2;
        win(-fa, -fa, -d, -d, wl0, wl1);
        if (rng() < 0.75) win(fa, fa, -d, -d, wl0, wl1);
        win(-w, -w, -2, -2, wl0, wl1);
        if (rng() < 0.5) win(w, w, -2, -2, wl0, wl1);
        if (kind === 'towerhouse') { win(0, 0, -d, -d, 7, 8); win(0, 0, d, d, 7, 8); win(-w, -w, -1, -1, 7, 8); win(w, w, 1, 1, 7, 8); } // (the left: beside the chimney)
        if (rng() < 0.3) P.box(-fa, -fa, 1, 1, -d - 1, -d - 1, BLOCK.FLOWERS);
    }
    // ---- the roof (a gable along a; a towerhouse: a pyramid)
    let top;
    const roofMark = p.parts.length;
    if (kind === 'towerhouse') {
        P.box(-w, w, h, h, -d, d, wall);
        for (let k = 0; k <= w + 1; k++) P.box(-w - 1 + k, w + 1 - k, h + 1 + k, h + 1 + k, -d - 1 + k, d + 1 - k, roof);
        top = h + w + 2;
    } else {
        for (let k = 0; k <= d + 1; k++) {
            P.box(-w - 1, w + 1, h + k, h + k, -d - 1 + k, d + 1 - k, roof);
            if (k <= d) P.box(-w + 1, w - 1, h + k, h + k, -d + k, d - k, 0);
            if (k >= 1 && k <= d) { P.box(-w, -w, h + k, h + k, -d + k, d - k, wall); P.box(w, w, h + k, h + k, -d + k, d - k, wall); }
        }
        top = h + d + 1;
    }
    p.slopeTop(roofMark, roof); // (the roof's slopes of ramps — generation 6)
    // ---- inside
    const L0 = 0;
    const lantern = (a, b, l) => P.box(a, a, l, l, b, b, BLOCK.LANTERN);
    const wants = []; // the chests: the corner each one is wanted in (placed at the end — placeChests)
    const chest = (a, b) => wants.push([a, b]);
    const beds = [], keep = []; // floor kept free of chests (lot rects a0, a1, b0, b1): the beds, the way in
    // a bed against the back wall, pillow to the wall (Beds: 2.5 × 5.5 m)
    const bed = (a) => {
        const q = P.pt(a, d - 0.5 - 2.85, L0);
        house.bedSpots.push({ ...q, yaw: P.yaw(0, 1) });
        beds.push([a - BED_W / 2, a + BED_W / 2, d - 0.5 - 2.85 - BED_L / 2, d - 0.5 - 2.85 + BED_L / 2]);
    };
    const hearth = (a, b) => {
        // a stone hearth on the side wall with a glowing fire, the chimney above the roof
        const sx = a < 0 ? -1 : 1;
        P.box(a, a, 0, 3, b - 1, b + 1, BLOCK.COBBLE);
        P.box(a, a, 0, 0, b, b, BLOCK.LANTERN);
        P.box(a + sx, a + sx, 0, top + 2, b, b, BLOCK.COBBLE);
    };
    let table, cauldron; // (where a wizard's crystal ball and cauldron go — s.decorate)
    const bedColour = rich ? s.bedRich : (rng() < 0.5 ? 'white' : rng() < 0.5 ? 'brown' : 'gray');
    if (T.barn) {
        P.box(-w + 1, -w + 2, 0, 1, d - 2, d - 1, BLOCK.HAY); P.box(w - 2, w - 1, 0, 2, d - 2, d - 1, BLOCK.HAY);
        P.box(-1, 1, 0, 0, d - 1, d - 1, BLOCK.PLANKS); // a trough
        lantern(0, 0, h - 1);
        const q = P.pt(0, 0);
        house.pen = { x: q.x, y: q.y, z: q.z, r: Math.min(w, d) - 2, animals: rng() < 0.5 ? ['cow', 'cow'] : ['pig', 'pig', 'sheep'] };
    } else if (rich && kind !== 'towerhouse') {
        // a wall between the living room (left) and the bedroom (right), a doorway in it
        P.box(1, 1, 0, h - 1, -d + 1, d - 1, wall === BLOCK.PLASTER ? timber : wall);
        P.box(1, 1, 0, 4, -2, 0, 0);
        P.box(-4, 0, -1, -1, -3, 1, s.carpet); // a rug
        hearth(-w + 1, 1);
        P.box(-3, -2, 0, 1, 2, 3, BLOCK.PLANKS); // the table, benches
        table = [-3, 2]; cauldron = [-w + 2, 1];
        P.box(-4, -4, 0, 0, 2, 3, timber); P.box(-1, -1, 0, 0, 2, 3, timber);
        P.box(-2, 0, 0, 3, d - 1, d - 1, BLOCK.BOOKS); // shelves
        lantern(-2, 0, h - 1); lantern(3, -1, h - 1);
        bed(w - 1.85);
        chest(2, d - 1);
        chest(-w + 1, -d + 1);
        P.box(w - 1, w - 1, 0, 3, -d + 1, -d + 2, BLOCK.PLANKS_DARK); // a wardrobe
        if (rng() < 0.5) P.box(w - 1, w - 1, 0, 0, -2, -2, BLOCK.GOLD); // something precious
        house.beds = 2;
    } else {
        // the back wall: a chest (houseChests). A towerhouse: two chests in a hut's room — the
        // hearth further back, the left front corner for the second chest, a small table
        const tower = kind === 'towerhouse';
        hearth(-w + 1, tower ? 1 : 0);
        if (tower) {
            P.box(-1, 0, 0, 1, 0, 0, BLOCK.PLANKS); // a table and a stool
            P.box(-2, -2, 0, 0, 0, 0, timber);
            table = [-1, 0]; cauldron = [-w + 2, 0];
        } else { // a table and a bench in the front corner
            P.box(-w + 1, -w + 2, 0, 1, -d + 1, -d + 1, BLOCK.PLANKS);
            P.box(-w + 1, -w + 2, 0, 0, -d + 2, -d + 2, timber);
            table = [-w + 1, -d + 1]; cauldron = [-w + 2, 0];
        }
        lantern(0, -1, h - 1);
        bed(w - 1.85);
        chest(-w + 1, d - 1);
        if (rich) chest(w - 1, -d + 1); // (a towerhouse: the rich have more)
        house.beds = kind === 'longhouse' ? 4 : 2;
    }
    // a woodpile by a poor house
    if (!s.noWoodpile && !rich && !T.barn && rng() < 0.6) P.box(w + 1, w + 1, 0, 1, 1, 3, BLOCK.WOOD);
    // the walking graph: in front of the door → inside (→ the bedroom)
    const door = P.node(da, -d - 3, 0);
    const inside = P.node(da, -1, 0, 'home');
    p.link(door, inside);
    if (rich && kind !== 'towerhouse') { const mid = P.node(1, -1, 0); p.link(inside, mid); p.link(mid, P.node(3, -2, 0, 'home')); }
    house.door = P.pt(da, -d - 3, 0);
    house.inside = P.pt(da, -1, 0);
    house.doorNode = door; house.homeNode = inside;
    house.bedColour = bedColour;
    s.decorate?.(P, { kind, w, d, h, rich, da, top, house, table, cauldron });
    // the way in stays free: the door's swing, the walk to the middle (and through to the bedroom)
    keep.push([da - dw - 0.5, da + dw + 0.5, -d + 0.5, -0.5]);
    if (rich && kind !== 'towerhouse') keep.push([da - 1.5, 3.5, -2.5, 0.5]);
    placeChests({ a0: -w + 0.5, a1: w - 0.5, b0: -d + 0.5, b1: d - 0.5, filled, beds, keep, wants, inner: rich && kind !== 'towerhouse' ? [1] : [], scales: [HOUSE_CHEST_SCALE] },
        (a, b, fa, fb) => house.chests.push({ ...P.pt(a, b, L0), yaw: P.yaw(fa, fb), gap: CHEST_GAP, scale: HOUSE_CHEST_SCALE }));
    out.houses.push(house);
    return door;
}

// ----------------------------------------------------------------- roomy houses (generation 14, HOUSE_SIZE_FROM_GEN)
/**
 * The villagers' homes of generation 14 (the author: «дома жителей слишком тесные — трудно двигаться и взаимодействовать. Даже у бедных вдвое
 * просторнее по площади. У богатых — двухэтажные дома: строить вверх, а не вширь»). Half-sizes (w across the front, d deep) and the wall height
 * h; the floor inside is (2w − 1) × (2d − 1): a hut 11 × 9 (the old one: 7 × 7), a cottage 13 × 11 (9 × 7), a longhouse 15 × 11 (11 × 7), a barn
 * 17 × 13 (11 × 9) — every poor home at least twice the old floor, ONE room with the bed(s), the fire, the table, the stores (CastleFurniture
 * `homeMain`); a rich home 17 × 15 on EACH of two floors (the old: 11 × 9 on one): below a living room and a kitchen with a wall between and a
 * 4 wide archway, a stair (3 wide) along the back wall to the floor above, there two bedrooms and a balcony over the door. A floor is 8 free layers
 * (ROOM_H) high; every way inside is 3 wide at least (the furnisher keeps them: CastleFurniture.furnishRoom).
 */
export const BIG_HOUSES = {
    hut: { w: 6, d: 5, h: 8, rich: false, beds: 1 },
    cottage: { w: 7, d: 6, h: 8, rich: false, beds: 2 },
    longhouse: { w: 8, d: 6, h: 8, rich: false, beds: 3 },
    barn: { w: 9, d: 7, h: 9, rich: false, barn: true },
    manor: { w: 9, d: 8, h: 17, rich: true },
    stone: { w: 9, d: 8, h: 17, rich: true },
    brick: { w: 9, d: 8, h: 17, rich: true },
    towerhouse: { w: 9, d: 8, h: 17, rich: true },
};
/** The layer the upper floor of a rich home is walked on (its slab is BIG_UP − 1); the stair has this many steps. */
export const BIG_UP = 9;
/** A big home's lot: how far the house's middle is from the road line, the gap between lots along the road (the rich: 17 wide + the eaves). */
export const BIG_LOT = { OFF: 13, PITCH: 25, FREE: 10, SKIP: 18, RING_EXTRA: 14 };

export function buildHouseBig(p, kind, cu, cv, face, rng, s, out) {
    const T = BIG_HOUSES[kind];
    const { w, d, h, rich } = T;
    const B = BLOCK;
    const up = BIG_UP;
    const R = (a, b) => { const [x, z] = rotLot(a, b, face); return [cu + x, cv + z]; };
    const unlot = (u, v) => { const x = u - cu, z = v - cv; return face === 0 ? [x, z] : face === 1 ? [z, -x] : face === 2 ? [-x, -z] : [-z, x]; };
    const P = {
        box: (a0, a1, l0, l1, b0, b1, t) => { const [x0, z0] = R(a0, b0), [x1, z1] = R(a1, b1); p.box(x0, x1, l0, l1, z0, z1, t); },
        pt: (a, b, l = 0) => { const [x, z] = R(a, b); return p.pt(x, z, l); },
        node: (a, b, l, tag) => { const [x, z] = R(a, b); return p.node(x, z, l, tag); },
        yaw: (a, b) => { const o = P.pt(0, 0), q = P.pt(a, b); return Math.atan2(-(q.x - o.x), -(q.z - o.z)); },
        along: (a, b) => { const o = P.pt(0, 0), q = P.pt(a, b); return Math.atan2(-(q.z - o.z), q.x - o.x); },
    };
    /** A rectangle of the lot (a, b) as the plan's own (u, v) rectangle (the furnisher works in the plan's coordinates). */
    const prect = (a0, a1, b0, b1) => { const [u0, v0] = R(a0, b0), [u1, v1] = R(a1, b1); return { u0: Math.min(u0, u1), u1: Math.max(u0, u1), v0: Math.min(v0, v1), v1: Math.max(v0, v1) }; };
    /** The wall of the plan that lies towards the lot's direction (da, db). */
    const sideOf = (da, db) => { const [x, z] = rotLot(da, db, face); return Math.abs(x) >= Math.abs(z) ? (x > 0 ? 'u1' : 'u0') : (z > 0 ? 'v1' : 'v0'); };
    const wall = kind === 'brick' ? B.BRICK : kind === 'stone' || kind === 'towerhouse' ? s.houseStone : rich ? B.PLASTER : kind === 'longhouse' ? B.PLANKS_DARK : s.poorWall;
    const base = rich ? s.houseStone : kind === 'cottage' ? B.COBBLE : B.PLANKS_DARK;
    const roof = kind === 'towerhouse' ? s.roof : rich ? s.villageRoof : kind === 'barn' ? B.ROOF_RED : s.poorRoof;
    const timber = B.PLANKS_DARK;
    const inner = timber; // (the walls inside: timber — boards hold a lintel where stone would tear)
    const L = (l) => p.L(l);
    const house = {
        kind, rich, id: null, door: null, inside: null, doorNode: null, homeNode: null, beds: 0,
        doorRec: null, windows: [], chests: [], bedSpots: [], c: P.pt(0, 0), r: Math.max(w, d) + 2, floors: rich ? 2 : 1, up: rich ? up : 0, rooms: [],
    };
    const fr = s.frng || rng;
    // ---- the shell: floor, walls, a stone course below, corner posts
    P.box(-w, w, -1, -1, -d, d, rich ? B.PLANKS : B.PLANKS_DARK);
    P.box(-w, w, 0, h - 1, -d, -d, wall); P.box(-w, w, 0, h - 1, d, d, wall);
    P.box(-w, -w, 0, h - 1, -d, d, wall); P.box(w, w, 0, h - 1, -d, d, wall);
    const baseH = rich ? 1 : 0;
    P.box(-w, w, 0, baseH, -d, -d, base); P.box(-w, w, 0, baseH, d, d, base);
    P.box(-w, -w, 0, baseH, -d, d, base); P.box(w, w, 0, baseH, -d, d, base);
    P.box(-w + 1, w - 1, 0, h - 1, -d + 1, d - 1, 0); // (nothing grows inside)
    for (const [a, b] of [[-w, -d], [w, -d], [-w, d], [w, d]]) P.box(a, a, 0, h - 1, b, b, kind === 'stone' || kind === 'brick' ? s.houseStone : timber);
    if (rich) { // the belt between the floors, and (a manor) the half-timbering: a stud every 4 blocks on each wall
        P.box(-w, w, up - 1, up - 1, -d, -d, timber); P.box(-w, w, up - 1, up - 1, d, d, timber);
        P.box(-w, -w, up - 1, up - 1, -d, d, timber); P.box(w, w, up - 1, up - 1, -d, d, timber);
        P.box(-w, w, h - 1, h - 1, -d, -d, timber); P.box(-w, w, h - 1, h - 1, d, d, timber);
        if (kind === 'manor') for (let a = -w + 4; a < w; a += 4) { P.box(a, a, 2, up - 2, -d, -d, timber); P.box(a, a, up, h - 2, -d, -d, timber); P.box(a, a, 2, up - 2, d, d, timber); P.box(a, a, up, h - 2, d, d, timber); }
    } else if (kind === 'cottage' || kind === 'longhouse') { P.box(-w, w, h - 1, h - 1, -d, -d, timber); P.box(-w, w, h - 1, h - 1, d, d, timber); } // (a beam under the eaves)
    // ---- the door (3 wide, 6 high; a barn: 5 wide, open) with a lintel and a doorstep
    const da = rich ? -4 : 0;
    const dw = T.barn ? 2 : 1;
    const doorTop = 5;
    P.box(da - dw, da + dw, 0, doorTop, -d, -d, 0);
    P.box(da - dw - 1, da + dw + 1, doorTop + 1, doorTop + 1, -d, -d, timber);
    P.box(da - dw, da + dw, -1, -1, -d - 2, -d - 1, B.PATH);
    if (!T.barn) {
        const dp = P.pt(da, -d), di = P.pt(da, -d + 1);
        house.doorRec = { x: dp.x, y: dp.y, z: dp.z, ry: inwardRy(P.along(1, 0), di.x - dp.x, di.z - dp.z), w: 3, h: doorTop + 1 };
    }
    // ---- windows (holes the game glazes): 2 wide, 4 high
    const win = (a0, a1, b0, b1, l0, l1) => {
        P.box(a0, a1, l0, l1, b0, b1, 0);
        const q0 = P.pt(a0, b0), q1 = P.pt(a1, b1);
        const alongA = b0 === b1;
        house.windows.push({
            x: (q0.x + q1.x) / 2, z: (q0.z + q1.z) / 2, y: (L(l0) + L(l1)) / 2 - 1,
            ry: alongA ? P.along(1, 0) : P.along(0, 1),
            w: (alongA ? a1 - a0 : b1 - b0) + 1, h: l1 - l0 + 1,
        });
    };
    // ---- the roof (a gable along a; the tower house: a pyramid)
    let top;
    const roofMark = p.parts.length;
    for (let k = 0; k <= d + 1; k++) {
        P.box(-w - 1, w + 1, h + k, h + k, -d - 1 + k, d + 1 - k, roof);
        if (k <= d) P.box(-w + 1, w - 1, h + k, h + k, -d + k, d - k, 0);
        if (k >= 1 && k <= d) { P.box(-w, -w, h + k, h + k, -d + k, d - k, wall); P.box(w, w, h + k, h + k, -d + k, d - k, wall); }
    }
    top = h + d + 1;
    p.slopeTop(roofMark, roof);
    if (!T.barn) P.box(-w + 1, w - 1, h, h, -d + 1, d - 1, rich ? B.PLANKS : B.PLANKS_DARK); // the ceiling (a gable's attic above it stays shut): lamps, hung food and chandeliers hang from it
    const stacks = []; // the chimneys of the fires (plan cells), built last (a stack through the floor above and the roof)
    const chimney = (stat) => { if (stat?.chimney) stacks.push(stat.chimney); };

    // ---- the furnisher (CastleFurniture.furnishRoom) for one room of the home: the rooms are given in the plan's coordinates
    const furnishHome = (rm, aisles) => {
        const { u0, u1, v0, v1, l } = rm;
        const filled = new Set();
        const box = floorCells((...a) => p.box(...a), l, filled);
        const keep = aisles.map((r) => [r.u0 - 0.5, r.u1 + 0.5, r.v0 - 0.5, r.v1 + 0.5]);
        for (const r of rm.pre || []) keep.push([r.u0 - 0.5, r.u1 + 0.5, r.v0 - 0.5, r.v1 + 0.5]);
        const o = p.pt(0, 0);
        const chestOf = (u, v, fu, fv, scale) => {
            const q = p.pt(fu, fv); // (the chest's front looks along (fu, fv); a house chest's yaw is turned by π — Houses.js)
            house.chests.push({ ...p.pt(u, v, l), yaw: Math.atan2(q.x - o.x, q.z - o.z) + Math.PI, gap: CHEST_GAP, scale: HOUSE_CHEST_SCALE });
        };
        const place = (list, rects = []) => {
            for (const r of rects) keep.push(r);
            const n = keep.length;
            placeChests({ a0: u0 - 0.5, a1: u1 + 0.5, b0: v0 - 0.5, b1: v1 + 0.5, filled, keep, wants: list.map((x) => [x.at[0], x.at[1], { scales: [HOUSE_CHEST_SCALE] }]), scales: [HOUSE_CHEST_SCALE] },
                (u, v, fu, fv, scale) => chestOf(u, v, fu, fv, scale));
            return keep.slice(n);
        };
        const env = {
            room: rm, s, rng: fr, aisles, pre: rm.pre || [], windows: [], beds: rm.nBeds || 1,
            box, slabAt: (u, v, LL, shape) => p.slabAt(u, v, LL, shape),
            occupy: (u, v) => filled.add(u + ',' + v), // (a bed standing there, drawn by the game: the chests keep off it)
            chests: place,
            putChest: ({ u, v, fu, fv, scale }) => {
                chestOf(u, v, fu, fv, HOUSE_CHEST_SCALE);
                const W = CHEST_W * scale / 2, D = CHEST_D * scale / 2;
                keep.push(Math.abs(fu) > 0.5 ? [u - D, u + D, v - W, v + W] : [u - W, u + W, v - D, v + D]);
            },
            bed: ({ sleep }) => {
                const a = p.pt(sleep[0], sleep[1], l), hd = p.pt(sleep[2], sleep[3], l);
                house.bedSpots.push({ x: a.x, y: a.y, z: a.z, yaw: Math.atan2(-(hd.x - a.x), -(hd.z - a.z)) }); // (the head to the wall; Houses.js sets the bed)
            },
        };
        const stat = furnishRoom(env);
        p.flushSlabs();
        chimney(stat);
        house.rooms.push({ name: rm.kind, l, rect: { u0, u1, v0, v1 }, aisles, items: stat.items, decor: stat.decor, kinds: stat.kinds }); // (what was put — the tests and the bench read it)
        return stat;
    };
    const roomAt = (name, a0, a1, b0, b1, l, door, extra = {}) => ({ kind: name, ...prect(a0, a1, b0, b1), l, doorSide: sideOf(door[0], door[1]), bedEntity: true, ...extra });

    const nodes = [];
    if (T.barn) {
        // ---- a barn: windows high on the sides, hay in the corners and a trough; the animals of its pen (the game puts them in)
        win(-w, -w, 0, 0, 3, 5); win(w, w, 0, 0, 3, 5); win(-w, -w, -4, -3, 3, 5); win(w, w, 3, 4, 3, 5);
        P.box(-w + 1, -w + 3, 0, 2, d - 3, d - 1, B.HAY); P.box(w - 3, w - 1, 0, 3, d - 3, d - 1, B.HAY);
        P.box(-2, 2, 0, 0, d - 1, d - 1, B.PLANKS); // a trough
        for (const a of [-w + 1, w - 1]) for (const b of [-3, 3]) P.box(a, a, 5, 5, b, b, B.LANTERN); // (lamps on the side walls)
        const q = P.pt(0, 0);
        house.pen = { x: q.x, y: q.y, z: q.z, r: Math.min(w, d) - 2, animals: rng() < 0.5 ? ['cow', 'cow'] : ['pig', 'pig', 'sheep'] };
        nodes.push(P.node(da, -1, 0, 'home'));
    } else if (!rich) {
        // ---- a poor home: one room
        const fa = w - 2;
        win(-fa, -fa + 1, -d, -d, 2, 5); win(fa - 1, fa, -d, -d, 2, 5);
        win(-w, -w, -2, -1, 2, 5); win(w, w, -2, -1, 2, 5); win(-1, 0, d, d, 2, 5);
        if (d >= 6) { win(-w, -w, 2, 3, 2, 5); win(w, w, 2, 3, 2, 5); }
        if (rng() < 0.5) for (const a of [-fa, -fa + 1, fa - 1, fa]) P.box(a, a, 1, 1, -d - 1, -d - 1, B.FLOWERS); // flower boxes
        const rm = roomAt('homeMain', -w + 1, w - 1, -d + 1, d - 1, 0, [0, -1], { nBeds: T.beds });
        const stat = furnishHome(rm, [prect(da - 1, da + 1, -d + 1, 0), prect(-3, 3, -1, 1)]);
        if (rng() < 0.6) P.box(w + 1, w + 1, 0, 1, 1, 3, B.WOOD); // a woodpile outside
        const inside = P.node(da, -1, 0, 'home');
        nodes.push(inside);
        p.link(inside, P.node(-3, 2, 0)); p.link(inside, P.node(3, 2, 0));
        house.beds = kind === 'longhouse' ? 4 : 2;
    } else {
        // ---- a rich home: two floors
        const sa0 = -w + 1, sb0 = d - 3, sb1 = d - 1; // the stair: along the back wall, rising towards +a, 3 wide
        const slab = up - 1;
        P.box(-w + 1, w - 1, slab, slab, -d + 1, d - 1, B.PLANKS); // the floor between
        // the stair: BIG_UP steps; the slab is open over the upper steps (head room), the last step is level with the floor above
        const mark = p.parts.length;
        for (let i = 0; i < up; i++) P.box(sa0 + i, sa0 + i, 0, i, sb0, sb1, timber);
        p.slopeTop(mark, timber);
        const holeA0 = sa0 + up - 5, holeA1 = sa0 + up - 2; // (steps up − 5 … up − 2)
        P.box(holeA0, holeA1, slab, slab, sb0, sb1, 0);
        const topA = sa0 + up - 1; // (the top step's column)
        // the wall between the living room and the kitchen (the ground), a 3 wide archway in it, and the same wall upstairs between the bedrooms
        P.box(topA, topA, 0, slab - 1, -d + 1, sb0 - 1, inner);
        P.box(topA, topA, 0, 5, -2, 0, 0); // the archway below: 3 wide, 6 high
        P.box(topA, topA, up, h - 1, -d + 1, sb0 - 5, inner);
        P.box(topA, topA, up, h - 1, sb0 - 4, sb0 - 1, 0); // upstairs: a 4 wide opening beside the stair's head (the landing), 6 high …
        P.box(topA, topA, up + 6, h - 1, sb0 - 4, sb0 - 1, inner); // … and the wall over it
        for (let k = 0; k <= d; k++) P.box(topA, topA, h + k, h + k, -d + k, d - k, wall); // the gable's cross wall
        // the fence round the hole upstairs (at the waist): on the side of the bedroom and of the nook
        P.box(holeA0, topA - 1, up, up + 1, sb0 - 1, sb0 - 1, B.FENCE);
        P.box(holeA0 - 1, holeA0 - 1, up, up + 1, sb0, sb1, B.FENCE);
        // lamps over the stair and at the landing
        for (const a of [sa0 + 2, sa0 + 6]) P.box(a, a, 6, 6, d - 1, d - 1, B.LANTERN);
        P.box(topA + 1, topA + 1, up + 4, up + 4, d - 1, d - 1, B.LANTERN);
        // windows: the ground (the living room and the kitchen), the upper floor (the bedrooms)
        for (const [l0, l1] of [[2, 5], [up + 2, up + 5]]) {
            win(-8, -7, -d, -d, l0, l1); win(-2, -1, -d, -d, l0, l1); win(2, 3, -d, -d, l0, l1); win(6, 7, -d, -d, l0, l1);
            for (const [b0, b1] of [[-5, -4], [-1, 0], [2, 3]]) win(-w, -w, b0, b1, l0, l1);
            for (const [b0, b1] of [[-5, -4], [-1, 0], [2, 3], [5, 6]]) win(w, w, b0, b1, l0, l1);
            win(3, 4, d, d, l0, l1); win(6, 7, d, d, l0, l1);
        }
        win(-7, -6, d, d, up + 2, up + 5); // (the nook over the stair)
        // the balcony over the door: a door out of the bedroom, a floor 5 × 3 on two posts, a fence round it, flowers; the porch under it
        P.box(da - 1, da + 1, up, up + 5, -d, -d, 0);
        P.box(da - 2, da + 2, up + 6, up + 6, -d, -d, timber);
        P.box(da - 2, da + 2, slab, slab, -d - 3, -d - 1, B.PLANKS);
        for (const a of [da - 2, da + 2]) { P.box(a, a, 0, slab - 1, -d - 3, -d - 3, timber); P.box(a, a, slab + 1, slab + 2, -d - 3, -d - 3, B.FENCE); }
        P.box(da - 1, da + 1, slab + 1, slab + 2, -d - 3, -d - 3, B.FENCE);
        for (const b of [-d - 2, -d - 1]) for (const a of [da - 2, da + 2]) P.box(a, a, slab + 1, slab + 2, b, b, B.FENCE);
        P.box(da - 1, da + 1, slab + 1, slab + 1, -d - 3, -d - 3, B.FLOWERS);
        P.box(da - 2, da - 2, slab - 1, slab - 1, -d - 1, -d - 1, B.LANTERN); P.box(da + 2, da + 2, slab - 1, slab - 1, -d - 1, -d - 1, B.LANTERN);
        // the rooms: the living room (front left) and the kitchen (right) below; the master bedroom (left) and the children's (right) above
        const liv = roomAt('homeLiving', -w + 1, topA - 1, -d + 1, sb0 - 1, 0, [0, -1]);
        const kit = roomAt('homeKitchen', topA + 1, w - 1, -d + 1, d - 1, 0, [-1, 0]);
        const stL = furnishHome(liv, [prect(da - 1, da + 1, -d + 1, -2), prect(-w + 3, topA - 1, -2, 0), prect(-w + 1, -w + 3, 0, sb0 - 1)]);
        const stK = furnishHome(kit, [prect(topA + 1, topA + 3, -2, 0), prect(topA + 2, topA + 4, -d + 1, d - 1)]);
        const cellRect = (c) => ({ u0: c[0], u1: c[0], v0: c[1], v1: c[1] });
        const chimU = [stL.chimney, stK.chimney].filter(Boolean).flat().map(cellRect); // (the chimneys rise through the floor above: nothing stands there)
        const masterR = prect(-w + 1, topA - 1, -d + 1, sb0 - 2), kidsR = prect(topA + 1, w - 1, -d + 1, d - 1);
        const inR = (r, c) => c.u0 >= r.u0 && c.u1 <= r.u1 && c.v0 >= r.v0 && c.v1 <= r.v1;
        const master = roomAt('homeBedroom', -w + 1, topA - 1, -d + 1, sb0 - 2, up, [1, 0], { nBeds: 1, pre: chimU.filter((c) => inR(masterR, c)) });
        const kids = roomAt('homeBedroom', topA + 1, w - 1, -d + 1, d - 1, up, [-1, 0], { nBeds: 2, pre: chimU.filter((c) => inR(kidsR, c)) });
        furnishHome(master, [prect(da - 1, da + 1, -d + 1, 1), prect(da - 1, topA - 1, 1, sb0 - 2)]);
        furnishHome(kids, [prect(topA + 1, topA + 3, sb0 - 4, d - 1)]);
        // the walking graph: the door → the living room → the archway → the kitchen; the stair; the landing → the bedrooms
        const inside = P.node(da, -2, 0, 'home');
        const archW = P.node(topA - 1, -1, 0), archE = P.node(topA + 1, -1, 0), kn = P.node(topA + 3, -1, 0);
        const foot = P.node(sa0 + 1, sb0 - 1, 0), s0 = P.node(sa0, sb0 + 1, 1), s4 = P.node(sa0 + 4, sb0 + 1, 5), head = P.node(topA, sb0 + 1, up);
        const land = P.node(topA, sb0 - 2, up), mr = P.node(da, 1, up), kr = P.node(topA + 3, sb0 - 2, up), kr2 = P.node(topA + 3, -2, up);
        p.link(inside, archW); p.link(archW, archE); p.link(archE, kn); p.link(inside, foot); p.link(foot, s0); p.link(s0, s4); p.link(s4, head);
        p.link(head, land); p.link(land, mr); p.link(head, kr); p.link(kr, kr2); p.link(land, kr);
        nodes.push(inside);
        house.beds = 3;
    }
    // ---- the chimneys of the fires: a stack from the roof of the hearth's room up through the roof
    for (const cellsOf of stacks) for (const [u, v] of cellsOf) {
        const [a, b] = unlot(u, v);
        const t0 = 8; // (the hearth's breast ends at layer 7)
        const roofTop = h + d + 1 - Math.abs(b); // (the roof's top layer over that cell)
        const t1 = Math.max(t0, roofTop) + 2;
        P.box(a, a, t0, t1, b, b, B.COBBLE);
        P.box(a, a, t1 + 1, t1 + 1, b, b, B.CS_DARK);
    }
    // ---- the way in: in front of the door → inside
    const door = P.node(da, -d - 3, 0);
    p.link(door, nodes[0]);
    house.door = P.pt(da, -d - 3, 0);
    house.inside = P.pt(da, rich ? -2 : -1, 0);
    house.doorNode = door; house.homeNode = nodes[0];
    house.bedColour = rich ? s.bedRich : (rng() < 0.5 ? 'white' : rng() < 0.5 ? 'brown' : 'gray');
    out.houses.push(house);
    return door;
}

/**
 * The houses of the lone wizards (generation 7; the author: «они такие маленькие, ужатые, что нормально в них находиться
 * нельзя… небольшими, но чтобы плюс-минус нормально ходить»). Sizes from the hero (3.5 m tall, ~2 blocks across with the
 * arms, a pointed hat — a door 6 high and 3 wide): a room to walk in with the furniture (a way 3 wide between things),
 * a floor 7 m high. w, d: half-sizes (outside 2w+1 × 2d+1), h: wall height.
 *  - 'wizcottage': one room, 11 × 9 inside (the old cottage: 9 × 7), 7 m under the eaves;
 *  - 'wiztower': a ground floor 9 × 9 inside (the old tower house: 7 × 7) and a study above it, a stair 3 wide between them.
 */
export const WIZ_HUTS = {
    wizcottage: { w: 6, d: 5, h: 7, rich: false },
    wiztower: { w: 5, d: 5, h: 15, rich: true, up: 8 }, // up: the layer the upper floor is walked on (its slab is up − 1)
};
// (the tower's stair: 3 wide, 8 steps rising towards +b; the slab over it is open from the step whose head would touch it)
export const WIZ_STAIR = { a0: -4, a1: -2, b0: -3, n: 8, hole: 3 };

export function buildWizHut(p, kind, rng, s, out) {
    const T = WIZ_HUTS[kind];
    const { w, d, h, rich } = T;
    const tower = kind === 'wiztower';
    const B = BLOCK;
    const filled = new Set(); // (what stands on the ground floor — placeChests)
    const P = {
        box: floorCells((a0, a1, l0, l1, b0, b1, t) => p.box(a0, a1, l0, l1, b0, b1, t), 0, filled),
        pt: (a, b, l = 0) => p.pt(a, b, l),
        node: (a, b, l, tag) => p.node(a, b, l, tag),
        yaw: (a, b) => { const o = p.pt(0, 0), q = p.pt(a, b); return Math.atan2(-(q.x - o.x), -(q.z - o.z)); },
        along: (a, b) => { const o = p.pt(0, 0), q = p.pt(a, b); return Math.atan2(-(q.z - o.z), q.x - o.x); },
    };
    const wall = tower ? s.houseStone : s.poorWall;
    const base = s.houseStone;
    const roof = tower ? s.roof : s.poorRoof;
    const timber = B.PLANKS_DARK;
    const L = (l) => p.L(l);
    const house = {
        kind, rich, id: null, door: null, inside: null, doorNode: null, homeNode: null, beds: 0,
        doorRec: null, windows: [], chests: [], bedSpots: [], c: P.pt(0, 0), r: Math.max(w, d) + 1,
    };
    // ---- the shell: floor, walls, a stone course below, corner posts
    P.box(-w, w, -1, -1, -d, d, B.PLANKS);
    P.box(-w, w, 0, h - 1, -d, -d, wall); P.box(-w, w, 0, h - 1, d, d, wall);
    P.box(-w, -w, 0, h - 1, -d, d, wall); P.box(w, w, 0, h - 1, -d, d, wall);
    P.box(-w, w, 0, 0, -d, -d, base); P.box(-w, w, 0, 0, d, d, base);
    P.box(-w, -w, 0, 0, -d, d, base); P.box(w, w, 0, 0, -d, d, base);
    P.box(-w + 1, w - 1, 0, h - 1, -d + 1, d - 1, 0);
    for (const [a, b] of [[-w, -d], [w, -d], [-w, d], [w, d]]) P.box(a, a, 0, h - 1, b, b, tower ? s.houseStone : timber);
    if (!tower) { P.box(-w, w, h - 1, h - 1, -d, -d, timber); P.box(-w, w, h - 1, h - 1, d, d, timber); } // (a beam under the eaves)
    // ---- the door (3 wide, 6 high for the pointed hats)
    const doorTop = s.doorTop ?? 5;
    P.box(-1, 1, 0, doorTop, -d, -d, 0);
    P.box(-2, 2, doorTop + 1, doorTop + 1, -d, -d, timber); // the lintel
    P.box(-1, 1, -1, -1, -d - 2, -d - 1, B.PATH); // the doorstep
    { const dp = P.pt(0, -d), di = P.pt(0, -d + 1); house.doorRec = { x: dp.x, y: dp.y, z: dp.z, ry: inwardRy(P.along(1, 0), di.x - dp.x, di.z - dp.z), w: 3, h: doorTop + 1 }; }
    // ---- windows (holes the game glazes)
    const win = (a0, a1, b0, b1, l0, l1) => {
        P.box(a0, a1, l0, l1, b0, b1, 0);
        const q0 = P.pt(a0, b0), q1 = P.pt(a1, b1);
        const alongA = b0 === b1;
        house.windows.push({
            x: (q0.x + q1.x) / 2, z: (q0.z + q1.z) / 2, y: (L(l0) + L(l1)) / 2 - 1,
            ry: alongA ? P.along(1, 0) : P.along(0, 1),
            w: (alongA ? a1 - a0 : b1 - b0) + 1, h: l1 - l0 + 1,
        });
    };
    // ---- the roof (a gable along a; the tower house: a pyramid)
    let top;
    const roofMark = p.parts.length;
    if (tower) {
        P.box(-w, w, h, h, -d, d, wall);
        for (let k = 0; k <= w + 1; k++) P.box(-w - 1 + k, w + 1 - k, h + 1 + k, h + 1 + k, -d - 1 + k, d + 1 - k, roof);
        top = h + w + 2;
    } else {
        for (let k = 0; k <= d + 1; k++) {
            P.box(-w - 1, w + 1, h + k, h + k, -d - 1 + k, d + 1 - k, roof);
            if (k <= d) P.box(-w + 1, w - 1, h + k, h + k, -d + k, d - k, 0);
            if (k >= 1 && k <= d) { P.box(-w, -w, h + k, h + k, -d + k, d - k, wall); P.box(w, w, h + k, h + k, -d + k, d - k, wall); }
        }
        top = h + d + 1;
    }
    p.slopeTop(roofMark, roof);
    // ---- inside
    const lantern = (a, b, l) => P.box(a, a, l, l, b, b, B.LANTERN);
    const wants = [], beds = [], keep = [];
    const bed = (a) => { // a bed against the back wall, pillow to the wall (Beds: 2.5 × 5.5 m)
        const q = P.pt(a, d - 0.5 - 2.85, 0);
        house.bedSpots.push({ ...q, yaw: P.yaw(0, 1) });
        beds.push([a - BED_W / 2, a + BED_W / 2, d - 0.5 - 2.85 - BED_L / 2, d - 0.5 - 2.85 + BED_L / 2]);
    };
    // a fireplace in a wall: the fire a lantern in a niche between two stone posts, a lintel, a flue through the roof
    const fireplace = (a, b, alongA, flue = 0) => {
        const [da, db] = alongA ? [1, 0] : [0, 1];
        P.box(a - da, a - da, 0, 3, b - db, b - db, B.COBBLE); P.box(a + da, a + da, 0, 3, b + db, b + db, B.COBBLE);
        P.box(a, a, 3, 3, b, b, B.COBBLE);
        P.box(a, a, 0, 0, b, b, B.LANTERN);
        P.box(a + flue * (alongA ? 1 : 0), a + flue * (alongA ? 1 : 0), 4, top + 2, b + flue * (alongA ? 0 : 1), b + flue * (alongA ? 0 : 1), B.COBBLE);
    };
    let table = null, cauldron;
    const nodes = [];
    if (!tower) {
        // the cottage, 11 × 9 inside (a −5…5, b −4…4): everything stands by the walls, the middle is free — the fire in the
        // left wall, the books and the desk at the back, a counter of potions and the cauldron in the front left corner,
        // the bed in the back right corner; the way from the door to each of them is 3 wide
        fireplace(-5, 0, false);
        cauldron = [-5, -4];
        P.box(-5, 0, 0, 4, 4, 4, B.BOOKS); P.box(-5, 0, 5, 5, 4, 4, timber); // the bookshelves, 6 wide, 5 high
        P.box(-5, -5, 0, 1, -3, -2, B.PLANKS_DARK); P.box(-5, -5, 2, 2, -3, -2, B.POTION); // a counter with the potions
        P.box(1, 2, 0, 0, 4, 4, timber); P.box(1, 2, 1, 1, 4, 4, B.PLANKS); // the writing desk (a lamp on it: decorate), the books
        P.box(2, 2, 2, 2, 4, 4, B.BOOKS); P.box(1, 1, 5, 5, 4, 4, B.BOOKS);
        table = [1, 4];
        P.box(-3, 1, -1, -1, -3, 2, s.carpet); // the rug
        P.box(-5, 5, h - 1, h - 1, 0, 0, timber); P.box(-5, 5, h - 1, h - 1, -3, -3, timber); // beams across, lanterns hung under them
        lantern(-3, 0, h - 2); lantern(1, 0, h - 2); lantern(-3, -3, h - 2); lantern(3, -3, h - 2);
        lantern(5, -3, 4);
        bed(w - 1.85);
        wants.push([5, -4]);
        // windows: the front, the sides (not behind the fire), the back over the bed
        win(-4, -4, -d, -d, 2, 4); win(4, 4, -d, -d, 2, 4);
        win(-w, -w, 3, 3, 2, 4); win(w, w, -2, -2, 2, 4);
        win(-3, -3, d, d, 2, 4);
        for (const a of [-4, 4]) P.box(a, a, 1, 1, -d - 1, -d - 1, B.FLOWERS); // flower boxes
        const inside = P.node(0, -1, 0, 'home');
        nodes.push(inside, P.node(-3, -1, 0), P.node(0, 2, 0));
        p.link(nodes[0], nodes[1]); p.link(nodes[0], nodes[2]);
    } else {
        // the tower house, 9 × 9 inside (a, b −4…4): the stair along the left wall to the study (the slab is the layer up − 1),
        // below it the bedroom with the fire at the back, the cauldron before it, the bed in the back right corner
        const { a0, a1, b0, n, hole } = WIZ_STAIR, slab = T.up - 1;
        P.box(-w + 1, w - 1, slab, slab, -d + 1, d - 1, B.PLANKS); // the slab, then the hole over the stair
        P.box(a0, a1, slab, slab, b0 + hole, b0 + n - 2, 0);
        const mark = p.parts.length;
        for (let i = 0; i < n; i++) P.box(a0, a1, 0, i, b0 + i, b0 + i, B.PLANKS_DARK);
        p.slopeTop(mark, B.PLANKS_DARK); // (generation 6: each step a ramp)
        fireplace(0, 4, true, 1); // (the flue over the right post: the way up from the stair stays free)
        cauldron = [0, 3];
        P.box(-1, 0, 4, 4, 4, 4, B.POTION); // flasks on the mantel
        P.box(-1, 1, -1, -1, -3, 2, s.carpet);
        lantern(4, -3, 4); lantern(-1, -4, 4);
        bed(w - 1.85);
        wants.push([3, -4]); // (a chest by the door, right of it)
        win(-3, -3, -d, -d, 2, 4); win(3, 3, -d, -d, 2, 4);
        win(-w, -w, 0, 0, 4, 6); win(w, w, -2, -2, 2, 4); win(3, 3, d, d, 2, 4);
        win(0, 0, -d, -d, 10, 12); win(3, 3, -d, -d, 10, 12); win(-w, -w, -1, -1, 10, 12); win(-w, -w, 2, 2, 10, 12);
        win(-3, -3, d, d, 10, 12); win(3, 3, d, d, 10, 12); win(w, w, -3, -3, 10, 12);
        // ---- the study upstairs (a floor at layer up, 7 m high): books, a desk under a window, a crystal on a stand, a rug
        const up = T.up, filledUp = new Set();
        const U = (a0_, a1_, l0, l1, b0_, b1_, t) => {
            p.box(a0_, a1_, l0, l1, b0_, b1_, t);
            if (t) for (let a = Math.min(a0_, a1_); a <= Math.max(a0_, a1_); a++) for (let b = Math.min(b0_, b1_); b <= Math.max(b0_, b1_); b++) filledUp.add(a + ',' + b);
        };
        for (let a = a0; a <= a1; a++) for (let b = b0 + hole; b <= b0 + n - 2; b++) filledUp.add(a + ',' + b); // (the hole)
        U(1, 3, up + 1, up + 1, -4, -4, B.PLANKS); for (const a of [1, 3]) P.box(a, a, up, up, -4, -4, timber); // the desk, its legs
        P.box(2, 2, up + 2, up + 2, -4, -4, B.ARCANE_LAMP); P.box(3, 3, up + 2, up + 2, -4, -4, B.BOOKS); P.box(1, 1, up + 2, up + 2, -4, -4, B.ARCANE_LAMP_VIOLET); // (a crystal, a lamp, books)
        P.box(2, 2, up, up, -3, -3, timber); // the stool
        U(4, 4, up, up + 3, -1, 3, B.BOOKS); P.box(4, 4, up + 4, up + 4, -1, 3, timber); // the bookshelves on the right
        U(3, 4, up, up + 2, 4, 4, B.BOOKS); // the scrolls at the back
        P.box(0, 3, slab, slab, -2, 2, s.carpet);
        for (let b = 0; b <= 1; b++) U(-1, -1, up, up + 1, b, b, B.FENCE); // the rails round the hole (where the fall is high)
        for (let a = a0; a <= a1; a++) U(a, a, up, up + 1, b0 + hole - 1, b0 + hole - 1, B.FENCE);
        U(-4, -4, up, up + 3, -4, -2, B.BOOKS); P.box(-4, -4, up + 4, up + 4, -4, -2, timber); // a reading nook: shelves on the left wall
        P.box(-3, -2, up, up, -4, -4, timber); P.box(-3, -2, up + 1, up + 1, -4, -4, s.carpet); // a bench with cushions
        P.box(-4, 4, up + 6, up + 6, 0, 0, timber); // a beam with lanterns
        lantern(-2, 0, up + 5); lantern(1, 0, up + 5); lantern(3, 0, up + 5);
        lantern(-3, 4, up + 4); lantern(4, 4, up + 4);
        const wantsUp = [[4, -3]], keepUp = [];
        placeChests({ a0: -w + 0.5, a1: w - 0.5, b0: -d + 0.5, b1: d - 0.5, filled: filledUp, beds: [], keep: keepUp, wants: wantsUp, inner: [], scales: [HOUSE_CHEST_SCALE] },
            (a, b, fa, fb) => house.chests.push({ ...P.pt(a, b, up), yaw: P.yaw(fa, fb), gap: CHEST_GAP, scale: HOUSE_CHEST_SCALE }));
        const inside = P.node(0, -1, 0, 'home');
        const foot = P.node(-1, -3, 0), step0 = P.node(-3, -3, 1), head = P.node(-3, 4, up), study = P.node(0, 3, up), desk = P.node(0, -2, up);
        p.link(inside, foot); p.link(foot, step0); p.link(step0, head); p.link(head, study); p.link(study, desk); // (up the stair column, 3 wide)
        nodes.push(inside);
        p.link(inside, P.node(0, 1, 0));
    }
    // the way in stays free: the door's swing and the walk to the middle
    keep.push([-1.5, 1.5, -d + 0.5, -0.5]);
    house.beds = 2;
    const door = P.node(0, -d - 3, 0);
    p.link(door, nodes[0]);
    house.door = P.pt(0, -d - 3, 0);
    house.inside = P.pt(0, -1, 0);
    house.doorNode = door; house.homeNode = nodes[0];
    house.bedColour = s.bedRich;
    s.decorate?.(P, { kind, w, d, h, rich, da: 0, top, house, table, cauldron });
    placeChests({ a0: -w + 0.5, a1: w - 0.5, b0: -d + 0.5, b1: d - 0.5, filled, beds, keep, wants, inner: [], scales: [HOUSE_CHEST_SCALE] },
        (a, b, fa, fb) => house.chests.push({ ...P.pt(a, b, 0), yaw: P.yaw(fa, fb), gap: CHEST_GAP, scale: HOUSE_CHEST_SCALE }));
    out.houses.push(house);
    return door;
}

/** The bed's footprint (src/game/Beds.js): across, along. */
const BED_W = 2.5, BED_L = 5.5;
/**
 * A household chest: smaller than a castle's treasure chest (src/entities/Chest.js — its size
 * per unit of scale CHEST_W × CHEST_D; tests/unit/house-chests.test.js keeps them equal).
 */
export const HOUSE_CHEST_SCALE = 2;
const CHEST_W = 1.25, CHEST_D = 0.85;
/** A chest stands this far from its wall (the lid leans on it — Chest.setWallGap). */
export const CHEST_GAP = 0.15;
/** Floor kept free in front of a chest (of furniture and beds): room to kneel and lift the lid. */
const CHEST_FRONT = 0.75;

/** Cells (lot / plan a, b) with something standing on layers l0..l0 + 2 — chests go where nothing is. */
export function floorCells(box, l0, filled) {
    return (a0, a1, l1, l2, b0, b1, t) => {
        box(a0, a1, l1, l2, b0, b1, t);
        const lo = Math.min(l1, l2) - l0, hi = Math.max(l1, l2) - l0;
        if (hi < 0 || lo > 2 || (!t && (lo > 0 || hi < 2))) return;
        for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++) for (let b = Math.min(b0, b1); b <= Math.max(b0, b1); b++) {
            if (t) filled.add(a + ',' + b); else filled.delete(a + ',' + b);
        }
    };
}

/**
 * Put chests (`wants`: the spot each is wanted at) against the walls of a room (its floor
 * a0..a1 × b0..b1, cell edges; `inner`: a of inside walls): the whole chest (CHEST_W × CHEST_D
 * × `scale`) inside the room, its back CHEST_GAP from a wall, its front (the lid) to the room,
 * on no furniture (`filled` cells), on no bed (`beds` rects a0, a1, b0, b1), not in the way
 * (`keep` rects: the chest itself; the room in front of it may be), and room in front to open
 * it. Each one the nearest such place to its spot, of the first size (`scales`) that has one;
 * none fits — no chest. put(a, b, fa, fb, scale): the chest's middle, the way its front looks.
 */
export function placeChests({ a0, a1, b0, b1, filled, beds = [], keep, wants, inner = [], scales }, put) {
    const eps = 1e-6;
    const free = (r0, r1, s0, s1, way = true) => {
        if (r0 < a0 - eps || r1 > a1 + eps || s0 < b0 - eps || s1 > b1 + eps) return false;
        for (const r of way ? [...beds, ...keep] : beds) if (r1 > r[0] + eps && r0 < r[1] - eps && s1 > r[2] + eps && s0 < r[3] - eps) return false;
        for (let a = Math.ceil(r0 - 0.5 + eps); a <= Math.floor(r1 + 0.5 - eps); a++) {
            for (let b = Math.ceil(s0 - 0.5 + eps); b <= Math.floor(s1 + 0.5 - eps); b++) if (filled.has(a + ',' + b)) return false;
        }
        return true;
    };
    // the walls: [along a?, where the face is, which way the room is from it]
    const walls = [[false, a0, 1], [false, a1, -1], [true, b0, 1], [true, b1, -1]];
    for (const a of inner) walls.push([false, a - 0.5, -1], [false, a + 0.5, 1]);
    for (const want of wants) {
        const [pa, pb] = want;
        let best = null;
        for (const scale of want[2]?.scales || scales) {
            if (best) break;
            const W = CHEST_W * scale, D = CHEST_D * scale, span = CHEST_GAP + D;
            for (const [alongA, face, into] of walls) {
                const lo = alongA ? a0 : b0, hi = alongA ? a1 : b1;
                for (let c = lo + W / 2; c <= hi - W / 2 + eps; c += 0.25) {
                    const rect = (f0, f1) => {
                        const n0 = Math.min(face + into * f0, face + into * f1), n1 = Math.max(face + into * f0, face + into * f1);
                        return alongA ? [c - W / 2, c + W / 2, n0, n1] : [n0, n1, c - W / 2, c + W / 2];
                    };
                    const r = rect(0, span);
                    if (!free(...r) || !free(...rect(span, span + CHEST_FRONT), false)) continue;
                    const n = face + into * (CHEST_GAP + D / 2);
                    const ca = alongA ? c : n, cb = alongA ? n : c;
                    const dist = Math.hypot(ca - pa, cb - pb);
                    if (!best || dist < best.dist - eps) best = { dist, ca, cb, r, f: alongA ? [0, into] : [into, 0], scale };
                }
            }
        }
        if (!best) continue;
        keep.push(best.r);
        put(best.ca, best.cb, best.f[0], best.f[1], best.scale, want[2]);
    }
}

/** A fenced garden (vegetable rows, flowers) or a pen with animals on a free lot. */
function buildYard(p, cu, cv, face, rng, s, out, pen) {
    const P = {
        box: (a0, a1, l0, l1, b0, b1, t) => {
            const [x0, z0] = rotLot(a0, b0, face), [x1, z1] = rotLot(a1, b1, face);
            p.box(cu + x0, cu + x1, l0, l1, cv + z0, cv + z1, t);
        },
        pt: (a, b, l = 0) => { const [x, z] = rotLot(a, b, face); return p.pt(cu + x, cv + z, l); },
    };
    const R = 5;
    // the fence: rails one high, posts two high every 3, a gate towards the road
    P.box(-R, R, 0, 0, -R, -R, BLOCK.FENCE); P.box(-R, R, 0, 0, R, R, BLOCK.FENCE);
    P.box(-R, -R, 0, 0, -R, R, BLOCK.FENCE); P.box(R, R, 0, 0, -R, R, BLOCK.FENCE);
    for (let k = -R; k <= R; k += 3) for (const [a, b] of [[k, -R], [k, R], [-R, k], [R, k]]) P.box(a, a, 1, 1, b, b, BLOCK.FENCE);
    P.box(-1, 1, 0, 1, -R, -R, 0);
    if (pen) {
        P.box(-R + 1, R - 1, -1, -1, -R + 1, R - 1, BLOCK.DIRT);
        P.box(R - 2, R - 1, 0, 0, R - 2, R - 1, BLOCK.HAY);
        P.box(-R + 1, -R + 3, 0, 0, R - 1, R - 1, BLOCK.PLANKS); // a trough
        const q = P.pt(0, 0);
        const kinds = [['sheep', 'sheep', 'sheep'], ['pig', 'pig'], ['cow', 'cow'], ['sheep', 'pig', 'sheep']];
        out.pens.push({ x: q.x, y: q.y, z: q.z, r: R - 1.5, animals: kinds[Math.floor(rng() * kinds.length)] });
    } else {
        P.box(-R + 1, R - 1, -1, -1, -R + 1, R - 1, BLOCK.FARMLAND);
        for (let a = -R + 1; a <= R - 1; a += 2) P.box(a, a, 0, 0, -R + 2, R - 1, rng() < 0.75 ? BLOCK.VEG : BLOCK.FLOWERS);
    }
}

/**
 * The village graveyard — a big place of its own (29 × 29) outside the houses, a tall fence with a wide
 * gate towards the road and two huge crosses at the gate, a path through the middle. Two rows of
 * six graves made for the people of this world (a man is ~5 m: a plot 3 × 7 of earth), each with a
 * tall headstone slab (4 high) or a huge cross (8 high). Every grave goes into out.graves: «Alive»
 * said at one raises its dead (LivingTrees.js — a skeleton), and that grave stays dug open (block
 * edits, saved with the world).
 */
export const GRAVE_COLS = [-12, -8, -4, 1, 5, 9]; // (the plot's first a; it is 3 wide, the path is a = −1…0)
export const GRAVE_ROWS = [-10, 3]; // (the plot's first b; it is 7 long, the stone just behind it)
export const GRAVEYARD_R = 14;
function buildGraveyard(p, cu, cv, face, s, out) {
    const P = {
        box: (a0, a1, l0, l1, b0, b1, t) => {
            const [x0, z0] = rotLot(a0, b0, face), [x1, z1] = rotLot(a1, b1, face);
            p.box(cu + x0, cu + x1, l0, l1, cv + z0, cv + z1, t);
        },
        pt: (a, b, l = 0) => { const [x, z] = rotLot(a, b, face); return p.pt(cu + x, cv + z, l); },
    };
    const R = GRAVEYARD_R;
    // the fence (rails 1 high, posts 4 high every 2), a wide gate towards the road
    P.box(-R, R, 0, 0, -R, -R, BLOCK.FENCE); P.box(-R, R, 0, 0, R, R, BLOCK.FENCE);
    P.box(-R, -R, 0, 0, -R, R, BLOCK.FENCE); P.box(R, R, 0, 0, -R, R, BLOCK.FENCE);
    for (let k = -R; k <= R; k += 2) for (const [a, b] of [[k, -R], [k, R], [-R, k], [R, k]]) P.box(a, a, 1, 3, b, b, BLOCK.FENCE);
    P.box(-3, 2, 0, 5, -R, -R, 0);
    P.box(-1, 0, -1, -1, -R, R - 1, BLOCK.PATH); // (a path in from the gate to the far end)
    // two huge crosses at the gate, seen from the road
    for (const [a, o] of [[-5, -2], [4, 2]]) { P.box(a, a, 0, 8, -R, -R, BLOCK.CS_GREY); P.box(Math.min(a, a + o), Math.max(a, a + o), 6, 6, -R, -R, BLOCK.CS_GREY); }
    const graves = out.graves || (out.graves = []);
    let i = 0;
    for (const b0 of GRAVE_ROWS) {
        for (const a of GRAVE_COLS) {
            P.box(a, a + 2, -1, -1, b0, b0 + 6, BLOCK.DIRT); // the plot, 3 × 7
            const h = hash01(cu * 7 + a, cv * 13 + b0, i++);
            const sb = b0 + 7; // the stone row, behind the plot's head
            if (h < 0.4) { // a huge cross (its arms stay in the plot's width beside the path)
                const near = a === -4 || a === 1;
                P.box(a, a + 2, 0, 0, sb, sb, BLOCK.CS_GREY); // the foot
                P.box(a + 1, a + 1, 1, 7, sb, sb, BLOCK.CS_GREY);
                P.box(near ? a : a - 1, near ? a + 2 : a + 3, 5, 5, sb, sb, BLOCK.CS_GREY);
            } else { // a wide headstone slab, 4 high
                P.box(a, a + 2, 0, 3, sb, sb, h < 0.7 ? BLOCK.CS_MOSSY : BLOCK.CS_GREY);
            }
            const c = P.pt(a + 1, b0 + 3), ex = P.pt(a + 1, b0 - 2), st = P.pt(a + 1, sb);
            const cells = [];
            for (let da = 0; da < 3; da++) for (let db = 0; db < 7; db++) { // (the first two: along the plot — the heap goes beside them)
                const [xx, zz] = rotLot(a + da, b0 + db, face);
                cells.push([p.wx(cu + xx, cv + zz), p.wz(cu + xx, cv + zz)]);
            }
            graves.push({
                x: c.x, y: c.y, z: c.z, // the middle of the plot, on the ground
                exit: { x: ex.x, z: ex.z }, // where the dead climbs out to (the foot of the grave)
                stone: { x: st.x, z: st.z },
                cells,
                L: p.L(-1), // the plot's layer
                yaw: Math.atan2(-(ex.x - st.x), -(ex.z - st.z)), // (the dead faces away from its stone)
            });
        }
    }
    const q = P.pt(0, 0);
    out.graveyards = (out.graveyards || []).concat([{ x: q.x, y: q.y, z: q.z, r: R }]);
}

/** Rotate lot-local (a, b) so that −b (the door side) points to `face`. */
export function rotLot(a, b, face) {
    if (face === 0) return [a, b];
    if (face === 1) return [-b, a];
    if (face === 2) return [-a, -b];
    return [b, -a];
}

function buildVillage(p, s, rng, out) {
    const { W, D } = s;
    const roadT = BLOCK.PATH;
    // a sea castle: the village stays behind the quay (the sea is beyond it)
    const lim = s.sea ? s.sea.vShore - 8 : Infinity;
    const big = !!s.bigHouses; // generation 14: roomy homes — the outer ring further out, the lots wider apart
    const R1 = W + 12, R1z = D + 12; // inner ring road (centre line)
    const R2 = W + 44 + (big ? BIG_LOT.RING_EXTRA : 0), R2z = D + 44 + (big ? BIG_LOT.RING_EXTRA : 0); // outer ring road
    const Rv = s.villageR;
    // roads (3 wide)
    const road = (u0, u1, v0, v1) => { v1 = Math.min(v1, lim); if (v0 <= v1) p.box(u0, u1, -1, -1, v0, v1, roadT); };
    road(-R1 - 1, R1 + 1, -R1z - 1, -R1z + 1); road(-R1 - 1, R1 + 1, R1z - 1, R1z + 1);
    road(-R1 - 1, -R1 + 1, -R1z - 1, R1z + 1); road(R1 - 1, R1 + 1, -R1z - 1, R1z + 1);
    road(-R2 - 1, R2 + 1, -R2z - 1, -R2z + 1); road(-R2 - 1, R2 + 1, R2z - 1, R2z + 1);
    road(-R2 - 1, -R2 + 1, -R2z - 1, R2z + 1); road(R2 - 1, R2 + 1, -R2z - 1, R2z + 1);
    // spokes: south (from the gate), north, east, west
    road(-2, 2, -Rv, -D - 1); road(-1, 1, R1z, Rv); road(R1, Rv, -1, 1); road(-Rv, -R1, -1, 1);
    // walking graph along the roads: nodes at the corners and crossings and every
    // ~12 m; everything lying on a road line is joined up at the end (joinRoads)
    const roadNodes = (axis, fixed, from, to) => {
        if (axis === 'u' && fixed > lim) return;
        if (axis === 'v') to = Math.min(to, lim);
        if (from > to) return;
        p.roadLine(axis, fixed, from, to);
        for (let t = from; t <= to; t += 12) p.node(axis === 'u' ? t : fixed, axis === 'u' ? fixed : t, 0);
        p.node(axis === 'u' ? to : fixed, axis === 'u' ? fixed : to, 0);
    };
    for (const [R, Rz] of [[R1, R1z], [R2, R2z]]) {
        roadNodes('u', -Rz, -R, R); roadNodes('u', Rz, -R, R);
        roadNodes('v', -R, -Rz, Rz); roadNodes('v', R, -Rz, Rz);
        // the crossings with the spokes
        p.node(0, -Rz, 0); if (Rz <= lim) p.node(0, Rz, 0); p.node(-R, 0, 0); p.node(R, 0, 0);
    }
    roadNodes('v', 0, -Rv + 2, -D - 5); roadNodes('v', 0, R1z, Rv - 2);
    roadNodes('u', 0, R1, Rv - 2); roadNodes('u', 0, -Rv + 2, -R1);
    out.roads = { R1, R1z, R2, R2z, Rv };

    // ---- the market on the south spoke between the rings
    const mv0 = -R2z + 4, mv1 = -R1z - 4;
    const mcv = Math.round((mv0 + mv1) / 2);
    p.box(-13, 13, -1, -1, mv0, mv1, BLOCK.COBBLE);
    out.market = { ...p.pt(0, mcv, 0), ...p.rect(-13, 13, mv0, mv1) };
    p.node(0, mcv, 0, 'market');
    const stalls = [];
    const nSt = Math.max(2, Math.min(4, Math.floor((mv1 - mv0 - 2) / 8)));
    for (const su of [-1, 1]) {
        for (let i = 0; i < nSt; i++) {
            const sv = mv0 + 3 + i * 8;
            // the counter (2 high) facing the middle of the square, posts and a striped canopy
            const cu = su * 8;
            p.box(cu, cu + su, 0, 1, sv, sv + 4, BLOCK.PLANKS);
            const bu = cu + su * 4;
            for (const [a, b] of [[cu, sv - 1], [cu, sv + 5], [bu, sv - 1], [bu, sv + 5]]) p.box(a, a, 0, 6, b, b, BLOCK.PLANKS_DARK);
            for (let k = 0; k <= 6; k++) p.box(cu, bu, 7, 7, sv - 1 + k, sv - 1 + k, k % 2 ? BLOCK.CLOTH_WHITE : s.carpet);
            const front = p.pt(cu - su * 3, sv + 2, 0), back = p.pt(cu + su * 2.5, sv + 2, 0);
            const fn = p.node(cu - su * 3, sv + 2, 0, 'stall');
            p.link(fn, p.node(0, mcv, 0));
            stalls.push({
                front, back, frontNode: fn,
                counter: { ...p.rect(cu, cu + su, sv, sv + 4), top: p.L(1) - 0.5 },
                yaw: p.yaw(su < 0 ? -Math.PI / 2 : Math.PI / 2), // the merchant looks at the square
            });
        }
    }
    out.stalls = stalls;
    p.roadLine('v', 0, mv0, mv1); // (the market square lies on the south spoke)

    // ---- house lots along the rings (facing the road) and fields outside
    const lots = [];
    const free = (u, v, r) => {
        if (Math.abs(u) < 6 + r || Math.abs(v) < 6 + r) return false; // spokes
        if (Math.abs(u) <= 16 + r && v >= mv0 - r - 2 && v <= mv1 + r + 2) return false; // market
        if (s.sea && v + r > s.sea.vShore - 16) return false; // the quay and the sea
        return true;
    };
    const addLots = (along, fixed, from, to, side, face, inner) => {
        // along u (fixed v) or along v (fixed u); `side` = which way from the road the lot lies
        for (let t = from; t <= to; t += big ? BIG_LOT.PITCH : 17) {
            const off = big ? BIG_LOT.OFF : 9;
            const u = along === 'u' ? t : fixed + side * off;
            const v = along === 'u' ? fixed + side * off : t;
            if (!free(u, v, big ? BIG_LOT.FREE : 7)) continue;
            lots.push({ u, v, face, inner });
        }
    };
    // inner ring: lots outside it (between the rings), facing the inner road
    addLots('u', -R1z, -R1 + 4, R1 - 4, -1, 2, true); addLots('u', R1z, -R1 + 4, R1 - 4, 1, 0, true);
    addLots('v', -R1, -R1z + 4, R1z - 4, -1, 1, true); addLots('v', R1, -R1z + 4, R1z - 4, 1, 3, true);
    // outer ring: lots inside it (back to back with the first row) and outside it
    addLots('u', -R2z, -R2 + 8, R2 - 8, 1, 0); addLots('u', R2z, -R2 + 8, R2 - 8, -1, 2);
    addLots('v', -R2, -R2z + 8, R2z - 8, 1, 3); addLots('v', R2, -R2z + 8, R2z - 8, -1, 1);
    addLots('u', -R2z, -R2 + 8, R2 - 8, -1, 2); addLots('u', R2z, -R2 + 8, R2 - 8, 1, 0);
    addLots('v', -R2, -R2z + 8, R2z - 8, -1, 1); addLots('v', R2, -R2z + 8, R2z - 8, 1, 3);
    // (back-to-back rows must not overlap)
    const used = [];
    const houseRects = []; // (generation 14: the footprints of the roomy houses, eaves and balconies included)
    const fields = [];
    // the graveyard first (a big place of its own: it takes the first free outer lot, no other lot within 26 m; no rng drawn)
    const gy = lots.find((l) => (Math.abs(l.u) > R2 || Math.abs(l.v) > R2z) && free(...[l.u, l.v].map((x, k) => x + rotLot(0, 7, l.face)[k]), GRAVEYARD_R + 2));
    if (gy) {
        // (pushed 7 m away from the road so that the gate and the fence stay off it)
        const [da, db] = rotLot(0, 7, gy.face);
        gy.u += da; gy.v += db; gy.big = true; used.push(gy);
        buildGraveyard(p, gy.u, gy.v, gy.face, s, out);
    }
    if (s.buildings) placeTownBuildings(p, s, out, lots, used, { mcv, R2, R2z, free, rotLot }); // (generation 11: a well, a granary, a smithy, a tavern, a church… on lots of their own)
    for (const lot of lots) {
        const skip = big ? BIG_LOT.SKIP : 14;
        if (used.some((o) => Math.abs(o.u - lot.u) < (o.big ? 26 : skip) && Math.abs(o.v - lot.v) < (o.big ? 26 : skip))) continue;
        used.push(lot);
        const outer = Math.abs(lot.u) > R2 || Math.abs(lot.v) > R2z;
        const [ra, rb] = rotLot(0, big ? -BIG_LOT.OFF : -9, lot.face);
        const roadNode = () => p.node(lot.u + ra, lot.v + rb, 0);
        if (outer && rng() < 0.4) {
            // a field: ploughed rows of wheat
            const fu0 = lot.u - 6, fu1 = lot.u + 6, fv0 = lot.v - 6, fv1 = lot.v + 6;
            p.box(fu0, fu1, -1, -1, fv0, fv1, BLOCK.FARMLAND);
            for (let k = fu0; k <= fu1; k += 2) p.box(k, k, 0, 0, fv0, fv1, BLOCK.WHEAT);
            const fnode = p.node(lot.u, lot.v, 1, 'field');
            fields.push({ ...p.pt(lot.u, lot.v, 1), ...p.rect(fu0, fu1, fv0, fv1), node: fnode });
            p.link(fnode, roadNode());
            continue;
        }
        // one small graveyard a village, on the first outer lot (not drawing on rng: the rest stays as it was)
        // gardens and pens between the houses
        const y = rng();
        if (y < 0.16) { buildYard(p, lot.u, lot.v, lot.face, rng, s, out, rng() < 0.5); continue; }
        // the rich live near the castle
        const rich = rng() < (lot.inner ? 0.5 : 0.12);
        const pool = rich ? RICH_HOUSES : POOR_HOUSES;
        const kind = pool[Math.floor(rng() * pool.length)];
        let hu = lot.u, hv = lot.v;
        if (big) {
            // generation 14: the house is set to its own depth (the road in front of the door at the same distance), and may not touch another one
            const T = BIG_HOUSES[kind], sh = BIG_LOT.OFF - (T.d + 5);
            const [su, sv] = rotLot(0, -sh, lot.face);
            hu += su; hv += sv;
            const rotated = lot.face % 2 === 1;
            const ex = rotLot(0, -1, lot.face); // (towards the road: the rich home's balcony reaches 3 further)
            const hx = (rotated ? T.d : T.w) + 1, hz = (rotated ? T.w : T.d) + 1, bal = T.rich ? 3 : 0;
            const r = { x0: hu - hx - (ex[0] < 0 ? bal : 0), x1: hu + hx + (ex[0] > 0 ? bal : 0), z0: hv - hz - (ex[1] < 0 ? bal : 0), z1: hv + hz + (ex[1] > 0 ? bal : 0) };
            if (houseRects.some((o) => r.x1 + 1 > o.x0 && o.x1 + 1 > r.x0 && r.z1 + 1 > o.z0 && o.z1 + 1 > r.z0)) continue;
            houseRects.push(r);
        }
        const door = (big ? buildHouseBig : buildHouse)(p, kind, hu, hv, lot.face, rng, s, out);
        // the door node joins the nearest road node in front
        p.link(door, roadNode());
    }
    out.fields = fields;
    // no outer lot was left for the graveyard (a sea castle, a crowded ring): any free place outside the outer road
    if (!out.graves) {
        const spots = [];
        for (let t = -R2 + 14; t <= R2 - 14; t += 12) spots.push([t, -R2z - 16, 0], [t, R2z + 16, 2]);
        for (let t = -R2z + 14; t <= R2z - 14; t += 12) spots.push([-R2 - 16, t, 3], [R2 + 16, t, 1]);
        const at = spots.find(([u, v]) => free(u, v, GRAVEYARD_R + 2) && !used.some((o) => Math.abs(o.u - u) < 26 && Math.abs(o.v - v) < 26));
        if (at) buildGraveyard(p, at[0], at[1], at[2], s, out);
    }
    buildFence(p, out);
}

/**
 * The shady buyer of a town (src/game/WizardMarket.js — the author: «особый покупатель, не на основном
 * рынке, а в отдельном скрытном месте, будто не совсем легально»): a dark shack of planks out of the way,
 * past the outer ring's front corner, a counter of crates in its one opening, a dim lantern. He buys plain
 * things 40 % under their price and never magic ones. (No rng drawn: the rest of the castle stays as it was.)
 */
function buildFence(p, out) {
    const B = BLOCK, { R2, R2z } = out.roads;
    const cu = R2 + 11, cv = -R2z - 10;
    p.box(cu - 3, cu + 3, -1, -1, cv - 3, cv + 3, B.PLANKS_DARK);
    p.walls(cu - 3, cu + 3, cv - 3, cv + 3, 0, 4, B.PLANKS_DARK);
    p.box(cu - 2, cu + 2, 0, 4, cv - 2, cv + 2, 0);
    p.box(cu - 4, cu + 4, 5, 5, cv - 4, cv + 4, B.THATCH);
    // the one opening (towards the road's corner), a counter of crates in it
    p.box(cu - 3, cu - 3, 0, 4, cv - 1, cv + 1, 0);
    p.box(cu - 3, cu - 2, 0, 1, cv - 1, cv + 1, B.PLANKS); // (2 deep: things lie on it)
    p.box(cu + 2, cu + 2, 0, 1, cv + 1, cv + 2, B.HAY);
    p.box(cu, cu, 4, 4, cv + 1, cv + 1, B.LANTERN);
    const fn = p.node(cu - 6, cv, 0, 'fence');
    p.link(fn, p.node(R2, -R2z, 0));
    out.stalls.push({
        fence: true, front: p.pt(cu - 5.5, cv, 0), back: p.pt(cu - 0.5, cv, 0), frontNode: fn,
        counter: { ...p.rect(cu - 3, cu - 2, cv - 1, cv + 1), top: p.L(1) - 0.5 },
        yaw: p.yaw(Math.PI / 2), // (he looks out of the opening)
    });
}

// --------------------------------------------------------- sea castles
/**
 * Ships a port is built for (17th-century classes; the «ships» session builds the ships).
 * L × B (m), draft (m), the pier's top layer (the pier top is about 1 m under the main deck).
 */
export const PORT_SHIPS = {
    pinnace: { L: 44, B: 12, draft: 3.2, pierLayer: 3, ru: 'Пинас' },
    fluyt: { L: 60, B: 15, draft: 4, pierLayer: 4, ru: 'Флейт' },
    galleon: { L: 80, B: 20, draft: 5, pierLayer: 5, ru: 'Галеон' },
};
/** World direction of a plan's local +v (the back of the castle) for each rotation. */
const V_DIR = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const PIER_W = 7; // a pier is 7 wide (u_k ± 3)
/** The rotation whose local +v points closest to the world direction (nx, nz). */
function rotFacing(nx, nz) {
    let best = 0, bd = -Infinity;
    for (let r = 0; r < 4; r++) { const d = V_DIR[r][0] * nx + V_DIR[r][1] * nz; if (d > bd) { bd = d; best = r; } }
    return best;
}
const HARBOUR_DEPTH = 8; // water layers dug in the harbour (≥ the galleon's draft + 2)

/** The ships of a sea castle by style. */
function portShips(s, rng) {
    return s.style === 'grand' ? ['galleon', 'fluyt', 'pinnace'] : s.style === 'fortress' ? ['galleon', 'pinnace'] : [rng() < 0.5 ? 'fluyt' : 'pinnace'];
}

/** Local layout of a port (u along the quay, v out to sea): piers and berths. */
function portLayout(s, ships) {
    const vShore = s.D - 8; // the back 8 m of the castle stand where the sea was
    const u0 = s.W + s.towerSize + 6;
    let uk = u0 + 3;
    const piers = [];
    let maxL = 0;
    for (const cls of ships) {
        const S = PORT_SHIPS[cls];
        const us = uk + 3 + 1.5 + S.B / 2; // the ship lies along the pier's +u side
        piers.push({ cls, uk, us, vs: vShore + 7 + S.L / 2, len: S.L + 14 });
        maxL = Math.max(maxL, S.L);
        uk = us + S.B / 2 + 4.5 + 3.5;
    }
    const last = piers[piers.length - 1];
    const ub0 = Math.ceil(last.us + PORT_SHIPS[last.cls].B / 2 + 5); // the breakwater's inner edge
    return { vShore, u0, piers, ub0, u1: ub0 + 3, len: maxL + 20 };
}

/**
 * The back of a sea castle stands in the sea: a stone plinth under it, an
 * embankment along the shore, a round sea tower joined to the back wall walk
 * by a bridge on piers (cannon places on its top).
 */
function buildSeaWorks(p, s, rng, out) {
    const { W, D, H } = s, ts = s.towerSize, F = p.F, st = s.stone, vShore = s.sea.vShore;
    const deep = -F - 16; // (down to the bedrock: everything under the water is stone)
    p.box(-W - ts, W + ts, deep, -F - 1, vShore, D + ts, st); // the plinth (a ledge at the water)
    // the embankment along the shore on both sides of the castle
    const R = s.sea.rect;
    p.box(R.u0, -W - ts - 1, deep, -1, vShore, vShore, st);
    p.box(W + ts + 1, R.u1, deep, -1, vShore, vShore, st);
    // the sea tower and the bridge from the back wall walk
    const walk = H - 1, tTop = H + s.towerExtra, tv = D + 24, r = 7;
    p.cyl(0, tv, r, deep, -4, st);
    roundTower(p, 0, tv, r, tTop, st, s.roof, { cone: false, walkL: walk });
    p.box(-2, 2, walk - 1, walk, D + 1, tv - r + 1, st); // the bridge deck
    p.box(-2, -2, walk + 1, walk + 1, D + 1, tv - r, st); p.box(2, 2, walk + 1, walk + 1, D + 1, tv - r, st); // parapets
    p.box(-1, 1, H, H + 1, D - 1, D, 0); // through the battlements
    p.box(-1, 1, walk + 1, walk + 5, tv - r - 1, tv - r + 3, 0); // the tower door
    for (const v of [D + 8, D + 14]) p.box(-2, 2, deep, walk - 2, v, v + 1, st); // the bridge's piers (arches between)
    // cannon places on the tower top (looking out to sea and along the shore)
    const topY = p.L(tTop + 1) - 1.5;
    for (const [du, dv, yaw] of [[0, r - 2, Math.PI], [-(r - 2), 0, Math.PI / 2], [r - 2, 0, -Math.PI / 2]]) {
        out.cannons.push({ ...p.pt(du, tv + dv, tTop + 1), y: topY, yaw: p.yaw(yaw), at: 'tower' });
    }
    out.seaTower = { ...p.pt(0, tv, walk + 1), r };
}

/**
 * The port beside the castle: a cobbled quay, a wooden pier per ship (stairs
 * up from the quay, piles, bollards, a lantern at the end), a dug harbour, a
 * breakwater wall with battlements and cannon places, a lighthouse at its end,
 * crates, barrels and the port's chests on the quay.
 */
function buildPort(p, s, rng, out) {
    const P = s.sea.port, F = p.F, st = s.stone, deep = -F - 16;
    const { vShore, piers, ub0, u1, len } = P;
    const qu0 = s.W + s.towerSize + 1;
    // the quay
    p.box(qu0, u1, -1, -1, vShore - 14, vShore, BLOCK.COBBLE);
    p.box(qu0, u1, deep, -1, vShore, vShore, st);
    const quayV = vShore - 8;
    const R1 = s.W + 12;
    p.roadLine('u', quayV, R1, u1 - 2);
    for (let u = R1; u <= u1 - 2; u += 12) p.node(u, quayV, 0, u === R1 ? '' : 'quay');
    p.node(u1 - 2, quayV, 0, 'quay');
    const berths = [], pierRecs = [];
    piers.forEach((pr, k) => {
        const S = PORT_SHIPS[pr.cls];
        const n = S.pierLayer - F; // steps up from the quay
        const uk = Math.round(pr.uk), lDeck = n - 1, v0 = vShore + 1, v1 = vShore + pr.len;
        // stairs on the quay, the deck, the beams, the piles
        stairsV(p, uk - 3, uk + 3, vShore - n + 1, 1, n, BLOCK.PLANKS);
        p.box(uk - 3, uk + 3, lDeck, lDeck, v0, v1, BLOCK.PLANKS);
        p.box(uk - 3, uk + 3, lDeck - 1, lDeck - 1, v0, v1, BLOCK.PLANKS_DARK);
        for (let v = v0 + 2; v <= v1; v += 6) for (const du of [-3, 3]) p.box(uk + du, uk + du, deep, lDeck - 2, v, v, BLOCK.PLANKS_DARK);
        const bollards = [];
        for (let v = v0 + 4; v <= v1 - 2; v += 10) for (const du of [-3, 3]) {
            p.box(uk + du, uk + du, lDeck + 1, lDeck + 2, v, v, BLOCK.PLANKS_DARK);
            if (du > 0) bollards.push({ ...p.pt(uk + du, v, lDeck + 1), v });
        }
        p.box(uk, uk, lDeck + 1, lDeck + 4, v1, v1, BLOCK.PLANKS_DARK);
        p.box(uk, uk, lDeck + 5, lDeck + 5, v1, v1, BLOCK.LANTERN);
        // walking: from the quay up the stairs to the end of the pier
        const foot = p.node(uk, quayV, 0);
        const bottom = p.node(uk, vShore - n - 1, 0, 'quay');
        const top = p.node(uk, v0 + 1, n);
        const end = p.node(uk, v1 - 2, n, 'pier');
        p.link(foot, bottom); p.link(bottom, top); p.link(top, end);
        // the berth: the ship along the pier, bow out to sea
        const c = p.pt(pr.us, pr.vs, 0);
        const fwd = V_DIR[p.rot];
        const yaw = Math.atan2(-fwd[0], -fwd[1]);
        const sx = Math.cos(yaw), sz = -Math.sin(yaw); // the ship's starboard (local +x) in the world
        const pierC = p.pt(uk, pr.vs, 0);
        const side = Math.sign(sx * (pierC.x - c.x) + sz * (pierC.z - c.z)) || 1;
        const deckTop = p.L(lDeck) - 0.5;
        const bow = pr.vs + S.L / 2, stern = pr.vs - S.L / 2;
        const near = (v) => bollards.reduce((a, b) => (Math.abs(b.v - v) < Math.abs(a.v - v) ? b : a));
        const strip = ({ v, ...q }) => ({ x: q.x, y: deckTop, z: q.z });
        berths.push({
            cls: pr.cls, pier: k, x: c.x, z: c.z, yaw, side, L: S.L, B: S.B, draft: S.draft,
            plankA: { ...p.pt(uk + 3.5, pr.vs, 0), y: deckTop },
            bollards: [strip(near(bow - 6)), strip(near(stern + 6))],
        });
        pierRecs.push({ k, cls: pr.cls, a: p.pt(uk, v0, 0), b: p.pt(uk, v1, 0), y: deckTop, w: PIER_W, layer: S.pierLayer });
        // crates and barrels, and the port's chest at the back of the quay
        const cu = Math.round(pr.us);
        p.box(cu - 4, cu - 3, 0, 1, vShore - 14, vShore - 13, BLOCK.PLANKS);
        p.box(cu - 1, cu - 1, 0, 0, vShore - 14, vShore - 14, BLOCK.HAY);
        p.box(cu + 3, cu + 3, 0, 1, vShore - 14, vShore - 14, BLOCK.PLANKS_DARK);
        out.chests.push({ ...p.pt(cu + 1, vShore - 12, 0), yaw: p.yaw(Math.PI), room: 'port' });
    });
    // the breakwater: a stone wall on the far side of the harbour, battlements outside, cannon places
    const vEnd = vShore + len;
    p.box(ub0, u1, deep, 2, vShore + 1, vEnd, st);
    const cannonV = [];
    for (let v = vShore + 14; v <= vEnd - 10; v += 16) cannonV.push(v);
    for (let v = vShore + 1; v <= vEnd; v += 2) if (!cannonV.some((c) => Math.abs(c - v) <= 2)) p.box(u1, u1, 3, 4, v, v, st);
    for (const v of cannonV) out.cannons.push({ ...p.pt(u1 - 1, v, 3), yaw: p.yaw(-Math.PI / 2), at: 'wall' });
    stairsV(p, ub0, u1, vShore - 2, 1, 3, st);
    const wb = p.node(u1 - 2, vShore - 3, 0);
    p.link(p.node(u1 - 2, quayV, 0), wb);
    const wt = p.node(u1 - 2, vShore + 3, 3);
    p.link(wb, wt);
    p.link(wt, p.node(u1 - 2, vEnd - 8, 3, 'wall'));
    // the lighthouse at the end of the breakwater
    const lu = ub0 + 1, lv = vEnd + 4;
    p.cyl(lu, lv, 4, deep, -4, st);
    roundTower(p, lu, lv, 4, 18, BLOCK.CS_WHITE, s.roof, { cone: false });
    p.cyl(lu, lv, 1.5, 19, 20, BLOCK.LANTERN);
    p.cyl(lu, lv, 2.5, 21, 21, s.roof);
    out.cannons.push({ ...p.pt(lu, lv + 2, 19), yaw: p.yaw(Math.PI), at: 'lighthouse' });
    out.lighthouse = { ...p.pt(lu, lv, 19) };
    out.berths = berths;
    out.piers = pierRecs;
    out.quayV = quayV;
}

// ---------------------------------------------------------------- styles
function pickStyle(rng, big = false) {
    const r = rng();
    const style = r < 0.36 ? 'grand' : r < 0.72 ? 'compact' : 'fortress';
    const stones = [BLOCK.CS_GREY, BLOCK.CS_SAND, BLOCK.CS_DARK, BLOCK.CS_WHITE, BLOCK.CS_MOSSY];
    const roofs = [BLOCK.ROOF_RED, BLOCK.ROOF_BLUE, BLOCK.ROOF_SLATE];
    const colours = [
        { carpet: BLOCK.CARPET_RED, hex: 0xb3202c, name: 'алые' },
        { carpet: BLOCK.CARPET_BLUE, hex: 0x2f4fa8, name: 'синие' },
        { carpet: BLOCK.CARPET_GREEN, hex: 0x2f7a3e, name: 'зелёные' },
        { carpet: BLOCK.CLOTH_YELLOW, hex: 0xe9c43a, name: 'жёлтые' },
    ];
    const col = colours[Math.floor(rng() * colours.length)];
    let s;
    if (style === 'grand') {
        s = { W: 54 + Math.floor(rng() * 8), D: 52 + Math.floor(rng() * 8), T: 3, H: 17 + Math.floor(rng() * 4), towerSize: 6 + Math.floor(rng() * 2), towerExtra: 8, midTowers: 1 + Math.floor(rng() * 2), roundTowers: rng() < 0.75, cones: true, KW: 24, KD: 22, hallHalf: 8 };
    } else if (style === 'compact') {
        s = { W: 36 + Math.floor(rng() * 6), D: 34 + Math.floor(rng() * 6), T: 3, H: 14 + Math.floor(rng() * 3), towerSize: 4 + Math.floor(rng() * 2), towerExtra: 5, midTowers: rng() < 0.5 ? 1 : 0, roundTowers: rng() < 0.3, cones: rng() < 0.6, KW: 19, KD: 17, hallHalf: 7 };
    } else {
        s = { W: 46 + Math.floor(rng() * 8), D: 40 + Math.floor(rng() * 6), T: 4, H: 16 + Math.floor(rng() * 3), towerSize: 5, towerExtra: 4, midTowers: 2, roundTowers: rng() < 0.45, cones: false, KW: 22, KD: 18, hallHalf: 8 };
    }
    s.style = style;
    s.stone = style === 'fortress' && rng() < 0.6 ? BLOCK.CS_DARK : stones[Math.floor(rng() * stones.length)];
    s.roof = roofs[Math.floor(rng() * roofs.length)];
    s.villageRoof = rng() < 0.5 ? BLOCK.ROOF_RED : s.roof;
    s.houseStone = rng() < 0.5 ? BLOCK.COBBLE : s.stone;
    // the village's own look: the same walls / roofs / bed colours throughout
    s.poorWall = rng() < 0.6 ? BLOCK.PLANKS : BLOCK.PLASTER;
    s.poorRoof = rng() < 0.55 ? BLOCK.THATCH : s.villageRoof;
    s.bedRich = ['red', 'blue', 'green', 'purple', 'yellow'][Math.floor(rng() * 5)];
    s.carpet = col.carpet;
    s.color = col.hex;
    s.colorName = col.name;
    s.floor = s.stone === BLOCK.CS_DARK ? BLOCK.CS_GREY : BLOCK.COBBLE;
    // the keep sits towards the back of the courtyard
    s.kv = Math.max(0, s.D - s.T - s.KD - 8);
    s.bigHouses = !!big;
    s.villageR = Math.max(s.W, s.D) + 66 + (big ? BIG_LOT.RING_EXTRA : 0); // (generation 14: the outer ring road further out — the roomy homes need the room)
    return s;
}

// -------------------------------------------------------------- the index
/**
 * Finds and remembers castles; answers "is this column inside castle land"
 * (for the flat ground) and "which parts touch this chunk".
 */
/**
 * The creative test ground's sea castle (generation 3): in the castle cell (0, −1), its back to
 * the sea at −z, its village starting ~60 m from the pedestals. Deterministic for the seed — the
 * terrain asks it first to lay the test sea's shore along its quay. null: it can't fit its cell.
 */
export function testSeaCastleSpot(seed, big = false) {
    const rng = createRng((seed * 7919 + 424242) >>> 0);
    const s = pickStyle(rng, big);
    const own = portShips(s, rng);
    // (the test ground's port always shows all three kinds of ship — galleon, fluyt, pinnace — when they fit)
    const all = ['galleon', 'fluyt', 'pinnace'];
    const fits = (sh) => { const L = portLayout(s, sh); const vr0 = s.villageR + 8; const u1 = Math.max(vr0, L.u1 + 8); return 24 + u1 + vr0 + 2 * (BLEND + 10) <= CASTLE_CELL && vr0 + L.vShore + L.len + 12 + 24 + 2 * (BLEND + 10) <= CASTLE_CELL; };
    const ships = fits(all) ? all : own;
    const P = portLayout(s, ships);
    const vr = s.villageR + 8;
    const rect = { u0: -vr, u1: Math.max(vr, P.u1 + 8), v0: -vr, v1: P.vShore + P.len + 12 };
    const zone = Math.max(-rect.u0, rect.u1, -rect.v0, rect.v1);
    const gx = 0, gz = -1, rot = 2, pad = BLEND + 10; // (rot 2: x = X − u, z = Z − v — the sea to −z)
    const X = gx * CASTLE_CELL + pad + 24 + rect.u1, Z = (gz + 1) * CASTLE_CELL - pad - 24 + rect.v0;
    if (X - rect.u0 > (gx + 1) * CASTLE_CELL - pad || Z - rect.v1 < gz * CASTLE_CELL + pad) return null;
    return { rng, s, ships, P, rect, zone, rot, X, Z, shore: { x: X, z: Z - P.vShore } };
}

export class CastleIndex {
    /**
     * @param {number} seed
     * @param {(ix:number, iz:number) => number} rawHeight the wild height field (with .water)
     */
    constructor(seed, rawHeight, seas = null, test = false, furnish = false, bigHouses = false, buildings = false, knightCap = false) {
        this.seed = seed;
        this.knightCap = !!knightCap; // generation 21: 10–15 knights a castle, each at a post (KnightPosts.js; KNIGHT_CAP_FROM_GEN, Terrain.js)
        this.bigHouses = !!bigHouses; // generation 14: roomy homes, the rich in two floors (HOUSE_SIZE_FROM_GEN, Terrain.js)
        this.buildings = !!buildings; // generation 17: different buildings in the villages (Buildings.js; BUILDINGS_FROM_GEN, Terrain.js)
        this.furnish = furnish; // generation 8: the castles' rooms furnished, more chests (FURNISH_FROM_GEN, Terrain.js)
        this.raw = rawHeight;
        this.seas = seas; // SeaIndex (generation-2 worlds): sea castles with a port
        this.test = test; // the creative test ground: a castle close by (cell 0, −1)
        this.cells = new Map();
        this._lastCell = null;
    }

    _key(gx, gz) { return gx * 65536 + gz; }

    /** The castle of a cell (or null). Deterministic for the seed. */
    cellOf(gx, gz) {
        const key = this._key(gx, gz);
        if (this.cells.has(key)) return this.cells.get(key);
        const c = this._makeCastle(gx, gz);
        this.cells.set(key, c);
        return c;
    }

    _makeCastle(gx, gz) {
        if (offEarth((gx + 1) * CASTLE_CELL)) return null; // (no castles on other planets: Planets.js)
        if (this.test && gx === 0 && gz === -1) return (this.seas?.test && this._makeTestSeaCastle(gx, gz)) || this._makeTestCastle(gx, gz);
        if (hash01(gx * 5 + 1, gz * 3 + 7, this.seed + 900) > CASTLE_CHANCE) return null;
        const rng = createRng((this.seed * 7919 + gx * 104729 + gz * 1299709) >>> 0);
        const s = pickStyle(rng, this.bigHouses);
        const zone = s.villageR + 8; // flat land radius (square half-size)
        const H = this.raw;
        // a sea shore crossing the cell: a sea castle with a port (generation-2 worlds)
        if (this.seas) {
            const cx = (gx + 0.5) * CASTLE_CELL, cz = (gz + 0.5) * CASTLE_CELL;
            const sd = this.seas.signedDist(cx, cz);
            if (Math.abs(sd) < CASTLE_CELL * 0.75) {
                const c = this._makeSeaCastle(gx, gz, s, rng, this.seas.seaAt(cx, cz));
                if (c) return c;
            }
        }
        for (let t = 0; t < 8; t++) {
            const margin = zone + BLEND + 10;
            const span = CASTLE_CELL - 2 * margin;
            if (span <= 0) return null;
            const X = Math.round(gx * CASTLE_CELL + margin + rng() * span);
            const Z = Math.round(gz * CASTLE_CELL + margin + rng() * span);
            if (Math.hypot(X, Z) < MIN_SPAWN_DIST + zone) continue;
            // plains (rivers and lakes may cross: the castle land is raised over them),
            // no mountains, a gentle ground
            // (generation 5's plains roll a little more: its castles may stand on a little rougher land —
            // the castle's land is levelled all the same and slopes gently into the wild round it)
            const lush = !!H.land, hiMax = lush ? 12 : 10, spread = lush ? 8 : 7;
            let ok = true, wet = 0, all = 0;
            const hs = [];
            for (let dz = -zone; dz <= zone && ok; dz += 12) {
                for (let dx = -zone; dx <= zone; dx += 12) {
                    const h = H(X + dx, Z + dz);
                    all++;
                    if (H.water) { wet++; continue; }
                    if (h > hiMax) { ok = false; break; }
                    hs.push(h);
                }
            }
            if (!ok || wet > all * 0.35 || hs.length < 10) continue;
            hs.sort((a, b) => a - b);
            if (hs[Math.floor(hs.length * 0.9)] - hs[Math.floor(hs.length * 0.1)] > spread) continue;
            const sum = hs[Math.floor(hs.length / 2)], n = 1;
            const F = Math.max(0, Math.min(5, Math.round(sum / n)));
            return this._buildCastle(gx, gz, X, Z, F, s, rng, zone);
        }
        return null;
    }

    /**
     * The creative test ground's castle: as close to the pedestals as its cell allows (its
     * land starts ~50 m out, past the test river) — a castle, its village and people to try things on.
     */
    _makeTestCastle(gx, gz) {
        const rng = createRng((this.seed * 7919 + 424242) >>> 0);
        const s = pickStyle(rng, this.bigHouses);
        const zone = s.villageR + 8;
        const m = zone + BLEND + 10;
        const off = Math.min(m + 40, CASTLE_CELL / 2); // (its land always inside its own cell)
        return this._buildCastle(gx, gz, gx * CASTLE_CELL + off, (gz + 1) * CASTLE_CELL - off, 0, s, rng, zone);
    }

    /** The creative test ground's sea castle (its port, its people), on the test sea's shore. */
    _makeTestSeaCastle(gx, gz) {
        const t = testSeaCastleSpot(this.seed);
        if (!t) return null;
        return this._buildCastle(gx, gz, t.X, t.Z, 2, t.s, t.rng, t.zone, { rot: t.rot, sea: this.seas.test.id, vShore: t.P.vShore, port: t.P, ships: t.ships, zone: t.zone, rect: t.rect });
    }

    /** A castle on a sea shore: its back in the sea, a port with piers for 1–3 ships. */
    _makeSeaCastle(gx, gz, s, rng, sea) {
        if (!sea) return null;
        const ships = portShips(s, rng);
        const P = portLayout(s, ships);
        // the castle's land: the village on three sides, the port on one side, the harbour out to sea
        const vr = s.villageR + 8;
        const rect = { u0: -vr, u1: Math.max(vr, P.u1 + 8), v0: -vr, v1: P.vShore + P.len + 12 };
        const zone = Math.max(-rect.u0, rect.u1, -rect.v0, rect.v1);
        // the castle's centre must lie in the window that keeps its land inside the cell; the shore
        // must cross local +v at vShore. Scan lines through the window for each facing.
        const cands = [];
        for (let rot = 0; rot < 4; rot++) {
            const [dx, dz] = V_DIR[rot];
            // the window keeping the land (and its blend) inside the cell, for this facing
            const q = new Plan(0, 0, 0, rot);
            const xs = [q.wx(rect.u0, rect.v0), q.wx(rect.u1, rect.v1)], zs = [q.wz(rect.u0, rect.v0), q.wz(rect.u1, rect.v1)];
            const pad = BLEND + 10;
            const x0 = gx * CASTLE_CELL + pad - Math.min(...xs), x1 = (gx + 1) * CASTLE_CELL - pad - Math.max(...xs);
            const z0 = gz * CASTLE_CELL + pad - Math.min(...zs), z1 = (gz + 1) * CASTLE_CELL - pad - Math.max(...zs);
            if (x1 - x0 < 4 || z1 - z0 < 4) continue;
            // (the real shore may be up to SLACK m off the quay line: a little land is dug away or
            // a little sea filled in — the site check below keeps that small)
            const SLACK = 24;
            const clampX = (x) => Math.max(x0, Math.min(x1, x)), clampZ = (z) => Math.max(z0, Math.min(z1, z));
            for (let k = 0; k < 7; k++) {
                const f = (k + 0.5) / 7;
                let prev = null;
                const lo = (dx !== 0 ? x0 : z0) - SLACK, hi = (dx !== 0 ? x1 : z1) + SLACK;
                for (let a = lo; a <= hi + 0.01; a += 4) {
                    // along +v (the perpendicular position fixed by f)
                    const w = (dx || dz) > 0 ? a : lo + hi - a;
                    const X = dx !== 0 ? w : x0 + f * (x1 - x0);
                    const Z = dz !== 0 ? w : z0 + f * (z1 - z0);
                    const sd = this.seas.signedDist(X + dx * P.vShore, Z + dz * P.vShore);
                    if (prev && prev.sd <= 0 && sd > 0) {
                        // the shore lies between: the castle centre where it is exactly vShore ahead
                        const q = -prev.sd / (sd - prev.sd);
                        const cx0 = prev.X + (X - prev.X) * q, cz0 = prev.Z + (Z - prev.Z) * q;
                        const cX = clampX(cx0), cZ = clampZ(cz0);
                        if (Math.hypot(cX - cx0, cZ - cz0) <= SLACK) cands.push({ rot, X: Math.round(cX), Z: Math.round(cZ), key: rng() });
                    }
                    prev = { X, Z, sd };
                }
            }
        }
        cands.sort((a, b) => a.key - b.key);
        for (const c of cands.slice(0, 16)) {
            const { rot, X, Z } = c;
            const [dx, dz] = V_DIR[rot];
            // the sea must really lie ahead (+v), the land behind
            if (!(this.seas.signedDist(X + dx * (P.vShore + 40), Z + dz * (P.vShore + 40)) > 10)) continue;
            if (!(this.seas.signedDist(X + dx * (P.vShore - 40), Z + dz * (P.vShore - 40)) < -10)) continue;
            if (Math.hypot(X, Z) < MIN_SPAWN_DIST + zone) continue;
            if (!this._seaSiteOk(X, Z, rot, s, P, rect)) continue;
            return this._buildCastle(gx, gz, X, Z, 2, s, rng, zone, { rot, sea: sea.id, vShore: P.vShore, port: P, ships, zone, rect });
        }
        return null;
    }

    /** Land behind the shore (gentle, mostly dry), the sea in front of the port and behind the castle. */
    _seaSiteOk(X, Z, rot, s, P, rect) {
        const H = this.raw;
        const p = new Plan(X, Z, 2, rot);
        let all = 0, sea = 0, wet = 0;
        const hs = [];
        for (let v = rect.v0; v <= P.vShore - 10; v += 12) for (let u = rect.u0; u <= rect.u1; u += 12) {
            const h = H(p.wx(u, v), p.wz(u, v));
            all++;
            if (H.sea) { sea++; continue; }
            if (H.water) { wet++; continue; }
            if (h > 22) return false; // (no mountains: the land by the sea is low)
            hs.push(h);
        }
        if (sea > all * 0.12 || sea + wet > all * 0.3 || hs.length < 10) return false;
        hs.sort((a, b) => a - b);
        if (hs[Math.floor(hs.length * 0.8)] > 10 || hs[Math.floor(hs.length * 0.9)] - hs[Math.floor(hs.length * 0.1)] > 10) return false;
        const seaFrac = (u0, u1, v0, v1, step) => {
            let n = 0, k = 0;
            for (let v = v0; v <= v1; v += step) for (let u = u0; u <= u1; u += step) { H(p.wx(u, v), p.wz(u, v)); n++; if (H.sea) k++; }
            return k / Math.max(1, n);
        };
        if (seaFrac(P.u0, P.u1, P.vShore + 4, P.vShore + P.len, 8) < 0.8) return false; // the harbour
        if (seaFrac(-s.W, s.W, s.D + 4, s.D + 30, 8) < 0.7) return false; // behind the castle
        return true;
    }

    _buildCastle(gx, gz, X, Z, F, s, rng, zone, seaOpts = null) {
        const rot = seaOpts ? seaOpts.rot : Math.floor(rng() * 4);
        const p = new Plan(X, Z, F, rot);
        const out = { rooms: [], chests: [], houses: [], stalls: [], fields: [], pens: [], cannons: [], beds: [] };
        s.sea = seaOpts;
        // generation 8: furnished rooms. Its own numbers (the castle's go on as before): the same castle, its rooms filled.
        s.furnish = !!this.furnish;
        if (s.furnish) s.frng = createRng((this.seed * 6469 + gx * 90001 + gz * 1000003 + 0x2f6b9) >>> 0);
        s.buildings = !!this.buildings;
        buildVillage(p, s, rng, out);
        buildCastle(p, s, rng, out);
        if (seaOpts) { buildSeaWorks(p, s, rng, out); buildPort(p, s, rng, out); }
        p.joinRoads();
        const name = `${s.style === 'fortress' ? 'Крепость' : 'Замок'} ${CASTLE_NAMES_A[Math.floor(rng() * CASTLE_NAMES_A.length)]} ${CASTLE_NAMES_B[Math.floor(rng() * CASTLE_NAMES_B.length)]}`;
        const king = `${KING_NAMES[Math.floor(rng() * KING_NAMES.length)]} ${KING_EPITHETS[Math.floor(rng() * KING_EPITHETS.length)]}`;
        const popBase = s.style === 'grand' ? 600 : s.style === 'fortress' ? 300 : 100;
        const population = popBase + Math.floor(rng() * (s.style === 'grand' ? 400 : 300));
        // (generation 21: 10–15 knights by the castle's size — its own numbers, the castle's others go on as before)
        const knights = this.knightCap
            ? knightCount(s.style, createRng((this.seed * 8461 + gx * 70001 + gz * 1000033 + 0x4b17) >>> 0)())
            : Math.round(population * (s.style === 'fortress' ? 0.12 : 0.07));
        // world bounds of the flat land and of the castle walls
        const walls = p.rect(-s.W - s.towerSize - 1, s.W + s.towerSize + 1, -s.D - s.towerSize - 1, s.D + s.towerSize + 1);
        const castle = {
            id: 'cs' + gx + '_' + gz, gx, gz, x: X, z: Z, F, rot, style: s.style, styleName: STYLE_NAMES[s.style],
            name, king, population, knights, capped: !!this.knightCap, color: s.color, colorName: s.colorName, stone: s.stone,
            zone, walls, inner: p.rect(-s.W + s.T, s.W - s.T, -s.D + s.T, s.D - s.T),
            keep: p.rect(-s.KW, s.KW, s.keepBox.v0, s.keepBox.v1),
            gate: p.pt(0, -s.D - 5, 0), gateIn: p.pt(0, -s.D + s.T + 2, 0), gateYaw: p.yaw(0),
            throne: out.throne, throneFront: out.throneFront, throneGate: out.throneGate || null, rooms: out.rooms, chests: out.chests.map((c, i) => ({ ...c, id: 'cs' + gx + '_' + gz + '_ch' + i })),
            houses: out.houses.map((h, i) => ({ ...h, id: 'cs' + gx + '_' + gz + '_h' + i })), pens: out.pens.map((q, i) => ({ ...q, id: 'cs' + gx + '_' + gz + '_p' + i })),
            fx: out.fx || [], wells: out.wells || [], buildings: out.buildings || [],
            stalls: out.stalls, fields: out.fields, market: out.market, graveyards: out.graveyards || [], graves: (out.graves || []).map((q, i) => ({ ...q, id: 'cs' + gx + '_' + gz + '_g' + i })), posts: out.posts, beds: out.beds,
            nodes: p.nodes, edges: p.edges, wallWalk: out.wallWalk, towerPosts: out.towerPosts || [],
            parts: p.parts,
            topL: F + 1 + s.H + s.towerExtra + 30,
        };
        if (seaOpts) {
            const P = seaOpts.port;
            castle.variant = 'sea';
            castle.sea = seaOpts.sea;
            // the port: the ships session moors its ships at the berths and fires the cannons from the places
            castle.port = {
                vShore: P.vShore, keepU: s.W + s.towerSize, keepV: s.D, depth: HARBOUR_DEPTH, rect: seaOpts.rect,
                basin: { u0: P.u0 - 2, u1: P.ub0 - 1, v0: P.vShore + 1, v1: P.vShore + P.len + 2 },
                quay: { y: F - 0.5, ...p.rect(s.W + s.towerSize + 1, P.u1, P.vShore - 14, P.vShore) },
                ships: seaOpts.ships.slice(), berths: out.berths, piers: out.piers,
                cannons: out.cannons, lighthouse: out.lighthouse, seaTower: out.seaTower,
                // world yaw of «out to sea» (the ships' bows at their berths point this way)
                seaYaw: out.berths[0].yaw,
            };
        }
        // parts by chunk (filled lazily)
        castle._byChunk = new Map();
        return castle;
    }

    /** Castles whose land reaches within `r` of a point. */
    near(x, z, r = 0) {
        if (offEarth(x - r)) return [];
        const out = [];
        const g0x = Math.floor((x - r) / CASTLE_CELL) - 1, g1x = Math.floor((x + r) / CASTLE_CELL) + 1;
        const g0z = Math.floor((z - r) / CASTLE_CELL) - 1, g1z = Math.floor((z + r) / CASTLE_CELL) + 1;
        for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
            const c = this.cellOf(gx, gz);
            if (!c) continue;
            const d = Math.max(Math.abs(c.x - x), Math.abs(c.z - z));
            if (d <= c.zone + BLEND + r) out.push(c);
        }
        return out;
    }

    /**
     * The castle whose land covers a column, and how much (1 inside the flat
     * land, falling to 0 over BLEND metres). Fast: one cell lookup.
     */
    landAt(ix, iz) {
        const gx = Math.floor(ix / CASTLE_CELL), gz = Math.floor(iz / CASTLE_CELL);
        let c = this._lastCell;
        if (!c || c.gx !== gx || c.gz !== gz) {
            const castle = this.cellOf(gx, gz);
            c = this._lastCell = { gx, gz, castle };
        }
        const k = c.castle;
        if (!k) return null;
        const d = Math.max(Math.abs(ix - k.x), Math.abs(iz - k.z));
        if (d > k.zone + BLEND) return null;
        const w = d <= k.zone ? 1 : 1 - (d - k.zone) / BLEND;
        if (!k.port) return { castle: k, w: w * w * (3 - 2 * w) };
        // a sea castle: its land is a rectangle in plan coordinates (the port on one side);
        // beyond the quay line is the sea (dug deep in the harbour), except under the castle
        const P = k.port, dx = ix - k.x, dz = iz - k.z, r = k.rot, R = P.rect;
        const u = r === 0 ? dx : r === 1 ? dz : r === 2 ? -dx : -dz;
        const v = r === 0 ? dz : r === 1 ? -dx : r === 2 ? -dz : dx;
        const out = Math.max(R.u0 - u, u - R.u1, R.v0 - v, v - R.v1, 0);
        if (out > BLEND) return null;
        const ws = out <= 0 ? 1 : 1 - out / BLEND;
        const sea = v > P.vShore && !(Math.abs(u) <= P.keepU && v <= P.keepV);
        const B = P.basin;
        return { castle: k, w: ws * ws * (3 - 2 * ws), side: sea ? 'sea' : 'land', harbour: sea && u >= B.u0 && u <= B.u1 && v >= B.v0 && v <= B.v1 };
    }

    /** The nearest castles for the minimap (within `r`), nearest first. */
    nearestForMap(p, r = 900) {
        const now = Math.floor(p.x / 40) + ',' + Math.floor(p.z / 40);
        if (this._mapKey !== now) {
            this._mapKey = now;
            this._mapList = this.near(p.x, p.z, r).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 2);
        }
        return this._mapList;
    }

    /** Parts of every castle touching a chunk (in build order). */
    partsForChunk(cx, cz, CHUNK) {
        const x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = x0 + CHUNK - 1, z1 = z0 + CHUNK - 1;
        const out = [];
        for (const c of this.near(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK)) {
            const key = cx * 65536 + cz;
            let list = c._byChunk.get(key);
            if (!list) {
                list = c.parts.filter((p) => p.x1 >= x0 && p.x0 <= x1 && p.z1 >= z0 && p.z0 <= z1);
                c._byChunk.set(key, list);
            }
            if (list.length) out.push(list);
        }
        return out;
    }
}
