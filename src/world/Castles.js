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

export const CASTLE_CELL = 480;
const MIN_SPAWN_DIST = 360;
const BLEND = 26; // m of slope between the flat castle land and the wild

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
function hash01(a, b, seed) {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ plan
/** Collects block parts in local coordinates and turns them into world parts. */
class Plan {
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
        for (let k = 0; k <= half; k++) p.box(u - half + k, u + half - k, top + 1 + k, top + 1 + k, v - half + k, v + half - k, roof);
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
        const h = Math.round(r * 1.6);
        for (let k = 0; k <= h; k++) {
            const rr = (r + 0.5) * (1 - k / (h + 1));
            if (rr < 0.4) break;
            p.cyl(u, v, rr, top + 1 + k, top + 1 + k, roof);
        }
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
    for (let i = 0; i < n; i++) {
        const v = v0 + dir * i;
        p.box(u0, u1, l0, l0 + i, v, v, t);
    }
}

function stairsU(p, u0, dir, v0, v1, n, t, l0 = 0) {
    for (let i = 0; i < n; i++) {
        const u = u0 + dir * i;
        p.box(u, u, l0, l0 + i, v0, v1, t);
    }
}

// ------------------------------------------------------------ furniture
function furnish(p0, room, s, chests, aisles = []) {
    const { u0, u1, v0, v1, kind } = room;
    // furniture never stands in the way of the walking paths (aisles) through the room
    const hits = (a0, a1, b0, b1) => aisles.some((r) => a1 >= r.u0 && a0 <= r.u1 && b1 >= r.v0 && b0 <= r.v1);
    const p = {
        box: (a0, a1, l0, l1, b0, b1, t) => {
            if (l1 >= room.l && l0 <= room.l + 5 && hits(Math.min(a0, a1), Math.max(a0, a1), Math.min(b0, b1), Math.max(b0, b1))) return;
            p0.box(a0, a1, l0, l1, b0, b1, t);
        },
        pt: (...a) => p0.pt(...a), yaw: (a) => p0.yaw(a),
    };
    const chest = (u, v, yaw) => { if (!hits(u, u, v, v)) chests.push({ ...p0.pt(u, v, room.l), yaw, room: kind }); };
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
            chest(fu, v1 - 1, p.yaw(0));
            lantern(farU, cv);
            break;
        }
        case 'treasury': {
            for (let i = 0; i < 4; i++) {
                const v = v0 + 1 + Math.round((D - 3) * i / 3);
                chest(farU === u1 ? u1 - 1 : u0 + 1, v, p.yaw(farU === u1 ? -Math.PI / 2 : Math.PI / 2));
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
            chest(fu, v0 + 1, p.yaw(0));
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
            const bw = big ? 2 : 1;
            p.box(fu - bw, fu + bw, l, l, v1 - 5, v1, BLOCK.PLANKS_DARK);
            p.box(fu - bw, fu + bw, l + 1, l + 1, v1 - 5, v1 - 1, big ? s.carpet : BLOCK.CLOTH_WHITE);
            p.box(fu - bw, fu + bw, l + 1, l + 1, v1, v1, BLOCK.CLOTH_WHITE);
            if (big) { p.box(fu - bw, fu + bw, l + 2, l + 4, v1, v1, BLOCK.GOLD); chest(fu + bw + 2, v1 - 1, p.yaw(0)); }
            p.box(cu - 2, cu + 2, l - 1, l - 1, v0 + 1, v1 - 7, s.carpet);
            lantern(cu, v0);
            break;
        }
        default: break;
    }
}

// ------------------------------------------------------------------ keep
/**
 * The keep: a throne room in the middle (two storeys high), rooms on both
 * sides and behind the throne, and the same around it upstairs.
 */
function buildKeep(p, s, rng, out) {
    const { KW, KD, kv } = s;
    const st = s.stone;
    const top = 16;
    const u0 = -KW, u1 = KW, v0 = kv - KD, v1 = kv + KD;
    p.box(u0, u1, -3, top, v0, v1, st);
    p.box(u0 + 2, u1 - 2, 0, top - 1, v0 + 2, v1 - 2, 0);
    p.box(u0 + 2, u1 - 2, -1, -1, v0 + 2, v1 - 2, s.floor);
    p.crenels(u0, u1, v0, v1, top + 1, st);
    const hw = s.hallHalf;
    const RN = 8;
    const iv0 = v0 + 2, iv1 = v1 - 2;
    const hallV1 = iv1 - RN - 1;
    // walls between the hall and the side rooms / the rooms behind the throne
    p.box(-hw - 1, -hw - 1, 0, top - 1, iv0, iv1, st);
    p.box(hw + 1, hw + 1, 0, top - 1, iv0, iv1, st);
    p.box(-hw, hw, 0, top - 1, hallV1 + 1, hallV1 + 1, st);
    p.box(0, 0, 0, top - 1, hallV1 + 2, iv1, st);
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
            for (let k = 0; k <= 5; k++) { const rr = 3.7 * (1 - k / 6); if (rr > 0.4) p.cyl(cu, cv, rr, top + 7 + k, top + 7 + k, s.roof); }
        } else {
            p.box(cu - 3, cu + 3, -1, top + 6, cv - 3, cv + 3, st);
            p.crenels(cu - 3, cu + 3, cv - 3, cv + 3, top + 7, st);
            if (s.cones) for (let k = 0; k <= 3; k++) p.box(cu - 3 + k, cu + 3 - k, top + 7 + k, top + 7 + k, cv - 3 + k, cv + 3 - k, s.roof);
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
    const nSide = (iv1 - iv0 + 1) >= 39 ? 3 : 2;
    const kinds = ['kitchen', 'dining', 'armoury', 'storeroom', 'guardroom', 'chapel'];
    const upKinds = ['bedroom', 'library', 'bedroom', 'chapel', 'bedroom', 'library', 'bedroom'];
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    let kIdx = 0, upIdx = 0;
    const sideRooms = [];
    for (const su of [-1, 1]) {
        const ru0 = su < 0 ? u0 + 2 : hw + 2, ru1 = su < 0 ? -hw - 2 : u1 - 2;
        for (let i = 0; i < nSide; i++) {
            const rv0 = iv0 + Math.round((iv1 - iv0 + 1) * i / nSide), rv1 = iv0 + Math.round((iv1 - iv0 + 1) * (i + 1) / nSide) - 1;
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
                furnish(p, room, s, out.chests, [leg(door, c1), leg(c1, mid)]);
                const ids = nodes([[wallU - su * 3, dv], [wallU + su * 2, dv], c1, mid], 0, 'room:' + kind);
                p.link(hallMid, ids[0]);
            }
            out.rooms.push({ ...room, name: ROOM_NAMES[kind], ...p.rect(ru0, ru1, r0, rv1), y: p.L(0) - 1.5 });
            sideRooms.push({ su, ru0, ru1, r0, rv1, i });
        }
    }
    pillars();
    // behind the throne: the treasury and a store / study
    for (const su of [-1, 1]) {
        const ru0 = su < 0 ? -hw : 1, ru1 = su < 0 ? -1 : hw;
        const kind = su < 0 ? 'treasury' : 'storeroom';
        const du = su * Math.round(hw / 2);
        p.box(du - 1, du + 1, 0, 5, hallV1 + 1, hallV1 + 1, 0);
        const room = { kind, u0: ru0, u1: ru1, v0: hallV1 + 2, v1: iv1, l: 0, doorSide: 'v0' };
        furnish(p, room, s, out.chests, [leg([du, hallV1 + 1], [du, hallV1 + 5])]);
        const ids = nodes([[du, hallV1 - 2], [du, hallV1 + 5]], 0, 'room:' + kind);
        p.link(throneFront, ids[0]);
        out.rooms.push({ ...room, name: ROOM_NAMES[kind], ...p.rect(ru0, ru1, hallV1 + 2, iv1), y: p.L(0) - 1.5 });
    }
    // upstairs: the rooms above, connected through doors one after another (a U around the hall)
    const upl = 9;
    const ring = [];
    for (const r of sideRooms.filter((x) => x.su > 0)) ring.push(r);
    ring.push({ su: 1, ru0: 1, ru1: hw, r0: hallV1 + 2, rv1: iv1, north: true }, { su: -1, ru0: -hw, ru1: -1, r0: hallV1 + 2, rv1: iv1, north: true });
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
            const dv = Math.round((hallV1 + 2 + iv1) / 2); // the middle of the rooms behind the throne
            p.box(du, du, upl, upl + 5, dv - 1, dv + 1, 0);
            doors.push([[du, dv], true]);
        }
    }
    for (let i = 0; i < ring.length; i++) {
        const r = ring[i];
        const isStairRoom = i === 0;
        const kind = isStairRoom ? 'gallery' : r.north && r.su > 0 ? 'king' : upKinds[upIdx++ % upKinds.length];
        const mid = [Math.round((r.ru0 + r.ru1) / 2), Math.round((r.r0 + r.rv1) / 2)];
        const entry = i === 0 ? [out.stairsTopPt, true] : doors[i - 1];
        const exit = doors[i];
        const pts = [entry[0], corner(entry[0], entry[1], mid), mid];
        if (exit) pts.push(corner(exit[0], exit[1], mid), exit[0]);
        const aisles = [];
        for (let k = 1; k < pts.length; k++) aisles.push(leg(pts[k - 1], pts[k]));
        if (!isStairRoom) {
            furnish(p, { kind, u0: r.ru0, u1: r.ru1, v0: r.r0, v1: r.rv1, l: upl, doorSide: 'v0' }, s, out.chests, aisles);
            out.rooms.push({ kind, name: ROOM_NAMES[kind], ...p.rect(r.ru0, r.ru1, r.r0, r.rv1), y: p.L(upl) - 1.5, l: upl });
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
        for (let k = 0; k <= 5; k++) p.box(tu - 5 + k, tu + 5 - k, top + 15 + k, top + 15 + k, tv - 5 + k, tv + 5 - k, s.roof);
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
        for (let k = 8; k <= 11; k++) p.box(bu0 - 1 + (k - 8), bu1 + 1 - (k - 8), k, k, bv0 - 1, bv1 + 1, s.roof);
        for (let v = bv0 + 2; v <= bv1 - 2; v += 3) { if (v >= bv0 + 7 && v <= bv0 + 11) continue; p.box(bu1 - 4, bu1 - 1, 0, 0, v, v, BLOCK.PLANKS_DARK); p.box(bu1 - 4, bu1 - 2, 1, 1, v, v, BLOCK.CLOTH_WHITE); }
        p.box(bu0 + 2, bu0 + 2, 5, 5, bv0 + 4, bv0 + 4, BLOCK.LANTERN);
        out.rooms.push({ kind: 'barracks', name: ROOM_NAMES.barracks, ...p.rect(bu0 + 1, bu1 - 1, bv0 + 1, bv1 - 1), y: p.L(0) - 1.5, l: 0 });
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
    loop.push(...p.line(mw, ms, me, ms, walk + 1, 10));
    loop.push(...p.line(me, ms, me, mn, walk + 1, 10).slice(1));
    loop.push(...p.line(me, mn, mw, mn, walk + 1, 10).slice(1));
    loop.push(...p.line(mw, mn, mw, ms, walk + 1, 10).slice(1));
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
function buildHouse(p, kind, cu, cv, face, rng, s, out) {
    // rotate the house inside the plan: the door side towards `face` (0: −v, 1: +u, 2: +v, 3: −u)
    const P = {
        box: (a0, a1, l0, l1, b0, b1, t) => {
            const [x0, z0] = rotLot(a0, b0, face), [x1, z1] = rotLot(a1, b1, face);
            p.box(cu + x0, cu + x1, l0, l1, cv + z0, cv + z1, t);
        },
        pt: (a, b, l) => { const [x, z] = rotLot(a, b, face); return p.pt(cu + x, cv + z, l); },
        node: (a, b, l, tag) => { const [x, z] = rotLot(a, b, face); return p.node(cu + x, cv + z, l, tag); },
    };
    const types = {
        hut: { w: 3, d: 3, h: 5, wall: BLOCK.PLANKS, base: BLOCK.PLANKS_DARK, roof: BLOCK.THATCH },
        cottage: { w: 4, d: 3, h: 6, wall: BLOCK.PLANKS, base: BLOCK.COBBLE, roof: s.villageRoof },
        longhouse: { w: 5, d: 3, h: 5, wall: BLOCK.PLANKS_DARK, base: BLOCK.PLANKS_DARK, roof: BLOCK.THATCH },
        stone: { w: 4, d: 4, h: 7, wall: s.houseStone, base: s.houseStone, roof: s.villageRoof },
        brick: { w: 4, d: 3, h: 6, wall: BLOCK.BRICK, base: BLOCK.COBBLE, roof: BLOCK.ROOF_SLATE },
        towerhouse: { w: 3, d: 3, h: 11, wall: s.houseStone, base: s.houseStone, roof: s.roof },
        barn: { w: 5, d: 4, h: 6, wall: BLOCK.PLANKS, base: BLOCK.PLANKS_DARK, roof: BLOCK.ROOF_RED },
    };
    const T = types[kind];
    const { w, d, h } = T;
    // floor, walls, the lower course in the base material
    P.box(-w, w, -1, -1, -d, d, BLOCK.PLANKS_DARK);
    P.box(-w, w, 0, h - 1, -d, -d, T.wall); P.box(-w, w, 0, h - 1, d, d, T.wall);
    P.box(-w, -w, 0, h - 1, -d, d, T.wall); P.box(w, w, 0, h - 1, -d, d, T.wall);
    P.box(-w, w, 0, 1, -d, -d, T.base); P.box(-w, w, 0, 1, d, d, T.base);
    P.box(-w, -w, 0, 1, -d, d, T.base); P.box(w, w, 0, 1, -d, d, T.base);
    // corner posts
    for (const [a, b] of [[-w, -d], [w, -d], [-w, d], [w, d]]) P.box(a, a, 0, h - 1, b, b, BLOCK.PLANKS_DARK);
    // the door and windows
    const dw = kind === 'barn' ? 2 : 1;
    P.box(-dw, dw, 0, 4, -d, -d, 0);
    for (const a of [-w + 2, w - 2]) if (Math.abs(a) > dw + 1) P.box(a, a, 2, 3, -d, -d, 0);
    P.box(-w, -w, 2, 3, 0, 0, 0); P.box(w, w, 2, 3, 0, 0, 0);
    // the roof
    if (kind === 'towerhouse') {
        P.box(-w, w, h, h, -d, d, T.wall);
        for (let k = 0; k <= w + 1; k++) P.box(-w - 1 + k, w + 1 - k, h + 1 + k, h + 1 + k, -d - 1 + k, d + 1 - k, T.roof);
    } else {
        // a gable roof along u: a sloping shell, the gable ends in the wall material
        for (let k = 0; k <= d + 1; k++) {
            P.box(-w - 1, w + 1, h + k, h + k, -d - 1 + k, d + 1 - k, T.roof);
            if (k <= d) P.box(-w + 1, w - 1, h + k, h + k, -d + k, d - k, 0);
            if (k >= 1 && k <= d) { P.box(-w, -w, h + k, h + k, -d + k, d - k, T.wall); P.box(w, w, h + k, h + k, -d + k, d - k, T.wall); }
        }
    }
    // inside: a bed, a table (or hay in a barn)
    if (kind === 'barn') { P.box(-w + 1, -w + 2, 0, 1, d - 2, d - 1, BLOCK.HAY); P.box(w - 2, w - 1, 0, 2, d - 2, d - 1, BLOCK.HAY); }
    else {
        P.box(w - 2, w - 1, 0, 0, d - 3, d - 1, BLOCK.PLANKS_DARK);
        P.box(w - 2, w - 1, 1, 1, d - 3, d - 2, BLOCK.CLOTH_WHITE);
        P.box(-w + 1, -w + 2, 0, 1, d - 1, d - 1, BLOCK.PLANKS);
    }
    const door = P.node(0, -d - 3, 0);
    const inside = P.node(0, 0, 0, 'home');
    p.link(door, inside);
    out.houses.push({ kind, door: P.pt(0, -d - 3, 0), inside: P.pt(0, 0, 0), doorNode: door, homeNode: inside, beds: kind === 'barn' ? 0 : kind === 'longhouse' ? 6 : kind === 'towerhouse' ? 3 : 4 });
    return door;
}

/** Rotate lot-local (a, b) so that −b (the door side) points to `face`. */
function rotLot(a, b, face) {
    if (face === 0) return [a, b];
    if (face === 1) return [-b, a];
    if (face === 2) return [-a, -b];
    return [b, -a];
}

function buildVillage(p, s, rng, out) {
    const { W, D } = s;
    const roadT = BLOCK.PATH;
    const R1 = W + 12, R1z = D + 12; // inner ring road (centre line)
    const R2 = W + 44, R2z = D + 44; // outer ring road
    const Rv = s.villageR;
    // roads (3 wide)
    const road = (u0, u1, v0, v1) => p.box(u0, u1, -1, -1, v0, v1, roadT);
    road(-R1 - 1, R1 + 1, -R1z - 1, -R1z + 1); road(-R1 - 1, R1 + 1, R1z - 1, R1z + 1);
    road(-R1 - 1, -R1 + 1, -R1z - 1, R1z + 1); road(R1 - 1, R1 + 1, -R1z - 1, R1z + 1);
    road(-R2 - 1, R2 + 1, -R2z - 1, -R2z + 1); road(-R2 - 1, R2 + 1, R2z - 1, R2z + 1);
    road(-R2 - 1, -R2 + 1, -R2z - 1, R2z + 1); road(R2 - 1, R2 + 1, -R2z - 1, R2z + 1);
    // spokes: south (from the gate), north, east, west
    road(-2, 2, -Rv, -D - 1); road(-1, 1, R1z, Rv); road(R1, Rv, -1, 1); road(-Rv, -R1, -1, 1);
    // walking graph along the roads: nodes at the corners and crossings and every
    // ~12 m; everything lying on a road line is joined up at the end (joinRoads)
    const roadNodes = (axis, fixed, from, to) => {
        p.roadLine(axis, fixed, from, to);
        for (let t = from; t <= to; t += 12) p.node(axis === 'u' ? t : fixed, axis === 'u' ? fixed : t, 0);
        p.node(axis === 'u' ? to : fixed, axis === 'u' ? fixed : to, 0);
    };
    for (const [R, Rz] of [[R1, R1z], [R2, R2z]]) {
        roadNodes('u', -Rz, -R, R); roadNodes('u', Rz, -R, R);
        roadNodes('v', -R, -Rz, Rz); roadNodes('v', R, -Rz, Rz);
        // the crossings with the spokes
        p.node(0, -Rz, 0); p.node(0, Rz, 0); p.node(-R, 0, 0); p.node(R, 0, 0);
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
        return true;
    };
    const kindsPool = ['hut', 'cottage', 'cottage', 'longhouse', 'stone', 'brick', 'towerhouse', 'barn', 'hut', 'cottage'];
    const addLots = (along, fixed, from, to, side, face) => {
        // along u (fixed v) or along v (fixed u); `side` = which way from the road the lot lies
        for (let t = from; t <= to; t += 13) {
            const off = 9;
            const u = along === 'u' ? t : fixed + side * off;
            const v = along === 'u' ? fixed + side * off : t;
            if (!free(u, v, 6)) continue;
            if (rng() < 0.18) continue; // gardens / empty lots
            lots.push({ u, v, face });
        }
    };
    // inner ring: lots outside it (between the rings), facing the inner road
    addLots('u', -R1z, -R1 + 4, R1 - 4, -1, 2); addLots('u', R1z, -R1 + 4, R1 - 4, 1, 0);
    addLots('v', -R1, -R1z + 4, R1z - 4, -1, 1); addLots('v', R1, -R1z + 4, R1z - 4, 1, 3);
    // outer ring: lots inside it (back to back with the first row) and outside it
    addLots('u', -R2z, -R2 + 8, R2 - 8, 1, 0); addLots('u', R2z, -R2 + 8, R2 - 8, -1, 2);
    addLots('v', -R2, -R2z + 8, R2z - 8, 1, 3); addLots('v', R2, -R2z + 8, R2z - 8, -1, 1);
    addLots('u', -R2z, -R2 + 8, R2 - 8, -1, 2); addLots('u', R2z, -R2 + 8, R2 - 8, 1, 0);
    addLots('v', -R2, -R2z + 8, R2z - 8, -1, 1); addLots('v', R2, -R2z + 8, R2z - 8, 1, 3);
    // (back-to-back rows must not overlap)
    const used = [];
    const fields = [];
    for (const lot of lots) {
        if (used.some((o) => Math.abs(o.u - lot.u) < 12 && Math.abs(o.v - lot.v) < 12)) continue;
        used.push(lot);
        const outer = Math.abs(lot.u) > R2 || Math.abs(lot.v) > R2z;
        if (outer && rng() < 0.45) {
            // a field: ploughed rows of wheat
            const fu0 = lot.u - 5, fu1 = lot.u + 5, fv0 = lot.v - 5, fv1 = lot.v + 5;
            p.box(fu0, fu1, -1, -1, fv0, fv1, BLOCK.FARMLAND);
            for (let k = fu0; k <= fu1; k += 2) p.box(k, k, 0, 0, fv0, fv1, BLOCK.WHEAT);
            const fnode = p.node(lot.u, lot.v, 1, 'field');
            fields.push({ ...p.pt(lot.u, lot.v, 1), ...p.rect(fu0, fu1, fv0, fv1), node: fnode });
            // reach it from the road
            const [ra, rb] = rotLot(0, -9, lot.face);
            p.link(fnode, p.node(lot.u + ra, lot.v + rb, 0));
            continue;
        }
        const kind = kindsPool[Math.floor(rng() * kindsPool.length)];
        const door = buildHouse(p, kind, lot.u, lot.v, lot.face, rng, s, out);
        // the door node joins the nearest road node in front
        const [ra, rb] = rotLot(0, -9, lot.face);
        p.link(door, p.node(lot.u + ra, lot.v + rb, 0));
    }
    out.fields = fields;
}

// ---------------------------------------------------------------- styles
function pickStyle(rng) {
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
    s.carpet = col.carpet;
    s.color = col.hex;
    s.colorName = col.name;
    s.floor = s.stone === BLOCK.CS_DARK ? BLOCK.CS_GREY : BLOCK.COBBLE;
    // the keep sits towards the back of the courtyard
    s.kv = Math.max(0, s.D - s.T - s.KD - 8);
    s.villageR = Math.max(s.W, s.D) + 66;
    return s;
}

// -------------------------------------------------------------- the index
/**
 * Finds and remembers castles; answers "is this column inside castle land"
 * (for the flat ground) and "which parts touch this chunk".
 */
export class CastleIndex {
    /**
     * @param {number} seed
     * @param {(ix:number, iz:number) => number} rawHeight the wild height field (with .water)
     */
    constructor(seed, rawHeight) {
        this.seed = seed;
        this.raw = rawHeight;
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
        if (hash01(gx * 5 + 1, gz * 3 + 7, this.seed + 900) > 0.92) return null;
        const rng = createRng((this.seed * 7919 + gx * 104729 + gz * 1299709) >>> 0);
        const s = pickStyle(rng);
        const zone = s.villageR + 8; // flat land radius (square half-size)
        const H = this.raw;
        for (let t = 0; t < 8; t++) {
            const margin = zone + BLEND + 10;
            const span = CASTLE_CELL - 2 * margin;
            if (span <= 0) return null;
            const X = Math.round(gx * CASTLE_CELL + margin + rng() * span);
            const Z = Math.round(gz * CASTLE_CELL + margin + rng() * span);
            if (Math.hypot(X, Z) < MIN_SPAWN_DIST + zone) continue;
            // plains (rivers and lakes may cross: the castle land is raised over them),
            // no mountains, a gentle ground
            let ok = true, wet = 0, all = 0;
            const hs = [];
            for (let dz = -zone; dz <= zone && ok; dz += 12) {
                for (let dx = -zone; dx <= zone; dx += 12) {
                    const h = H(X + dx, Z + dz);
                    all++;
                    if (H.water) { wet++; continue; }
                    if (h > 10) { ok = false; break; }
                    hs.push(h);
                }
            }
            if (!ok || wet > all * 0.35 || hs.length < 10) continue;
            hs.sort((a, b) => a - b);
            if (hs[Math.floor(hs.length * 0.9)] - hs[Math.floor(hs.length * 0.1)] > 7) continue;
            const sum = hs[Math.floor(hs.length / 2)], n = 1;
            const F = Math.max(0, Math.min(5, Math.round(sum / n)));
            return this._buildCastle(gx, gz, X, Z, F, s, rng, zone);
        }
        return null;
    }

    _buildCastle(gx, gz, X, Z, F, s, rng, zone) {
        const rot = Math.floor(rng() * 4);
        const p = new Plan(X, Z, F, rot);
        const out = { rooms: [], chests: [], houses: [], stalls: [], fields: [] };
        buildVillage(p, s, rng, out);
        buildCastle(p, s, rng, out);
        p.joinRoads();
        const name = `${s.style === 'fortress' ? 'Крепость' : 'Замок'} ${CASTLE_NAMES_A[Math.floor(rng() * CASTLE_NAMES_A.length)]} ${CASTLE_NAMES_B[Math.floor(rng() * CASTLE_NAMES_B.length)]}`;
        const king = `${KING_NAMES[Math.floor(rng() * KING_NAMES.length)]} ${KING_EPITHETS[Math.floor(rng() * KING_EPITHETS.length)]}`;
        const popBase = s.style === 'grand' ? 600 : s.style === 'fortress' ? 300 : 100;
        const population = popBase + Math.floor(rng() * (s.style === 'grand' ? 400 : 300));
        const knights = Math.round(population * (s.style === 'fortress' ? 0.12 : 0.07));
        // world bounds of the flat land and of the castle walls
        const walls = p.rect(-s.W - s.towerSize - 1, s.W + s.towerSize + 1, -s.D - s.towerSize - 1, s.D + s.towerSize + 1);
        const castle = {
            id: 'cs' + gx + '_' + gz, gx, gz, x: X, z: Z, F, rot, style: s.style, styleName: STYLE_NAMES[s.style],
            name, king, population, knights, color: s.color, colorName: s.colorName, stone: s.stone,
            zone, walls, inner: p.rect(-s.W + s.T, s.W - s.T, -s.D + s.T, s.D - s.T),
            keep: p.rect(-s.KW, s.KW, s.kv - s.KD, s.kv + s.KD),
            gate: p.pt(0, -s.D - 5, 0), gateIn: p.pt(0, -s.D + s.T + 2, 0), gateYaw: p.yaw(0),
            throne: out.throne, throneFront: out.throneFront, rooms: out.rooms, chests: out.chests.map((c, i) => ({ ...c, id: 'cs' + gx + '_' + gz + '_ch' + i })),
            houses: out.houses, stalls: out.stalls, fields: out.fields, market: out.market, posts: out.posts,
            nodes: p.nodes, edges: p.edges, wallWalk: out.wallWalk,
            parts: p.parts,
            topL: F + 1 + s.H + s.towerExtra + 30,
        };
        // parts by chunk (filled lazily)
        castle._byChunk = new Map();
        return castle;
    }

    /** Castles whose land reaches within `r` of a point. */
    near(x, z, r = 0) {
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
        return { castle: k, w: w * w * (3 - 2 * w) };
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
