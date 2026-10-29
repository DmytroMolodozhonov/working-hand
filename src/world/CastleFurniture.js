/**
 * CastleFurniture.js — the rooms of a king's castle, furnished (world generation 8; FURNISH_FROM_GEN, Terrain.js).
 *
 * The author, after taking a kingdom: «посмотрел по комнатам — комнаты ПУСТЫЕ. Они должны быть по-своему чем-то
 * заполнены. Должна быть БОЛЬШАЯ КОРОЛЕВСКАЯ СПАЛЬНЯ… Больше сундуков разных». Pure data (no THREE): it only puts
 * blocks of the castle into a room through the plan's `box` (Castles.furnish calls it).
 *
 * Sizes are from the world (1 block = 1 m; the hero ~3.5 m, with the hat ~4.6; doors 3 × 5…6; a table top at the waist,
 * 2 m; a seat at the knee, 1.5 m; a bed 3 × 6 (a king's 5 × 7) and 2 m high — the NightLife bed height):
 *  - things stand against the walls or as islands, their front free (an «access» cell) and never on the ways through
 *    the room (`aisles`: door → middle → door, 3 wide); a thing that would cut the free floor (3 wide: the hero with
 *    his arms out) off from a door is not put at all;
 *  - nothing hangs lower than 5 over a free wall cell (the hat): lamps and tapestries are above it;
 *  - table tops, seats, cushions are half blocks (slabs, BlockShapes.js) so the things look like things, not boxes.
 * The chests are placed by Castles.placeChests (`env.chests`), after the big things and before the small ones, so
 * a chest never lands on a thing nor shuts a way.
 * Own random numbers (`env.rng`): the castle's other numbers go on as before.
 */

import { BLOCK as B } from './Terrain.js';
import { SHAPE } from './BlockShapes.js';

/** The room's height over the floor (layers). */
export const ROOM_H = 8;
const WALLS = ['v0', 'v1', 'u0', 'u1'];
const OPPOSITE = { u0: 'u1', u1: 'u0', v0: 'v1', v1: 'v0' };

/**
 * env: { room: {kind, u0, u1, v0, v1, l, doorSide}, s: style, rng, aisles: [{u0,u1,v0,v1}], pre: [{u0,u1,v0,v1}] (blocked),
 *        box(u0,u1,l0,l1,v0,v1,t), slabAt(u,v,l,shape), chests(list), putChest({...}), bed({...}), windows: [[u,v]], beds: n }
 * Returns { items, decor, kinds } (what was put).
 */
export function furnishRoom(env) {
    const { room, s, rng, aisles = [], pre = [] } = env;
    const { kind, u0, u1, v0, v1, l } = room;
    const inRoom = (u, v) => u >= u0 && u <= u1 && v >= v0 && v <= v1;
    const inRect = (r, u, v) => u >= r.u0 && u <= r.u1 && v >= r.v0 && v <= r.v1;
    // (the checks below run thousands of times a castle: the cells of the room, its ways and its blocked places are flat arrays)
    let gu0 = u0 - 3, gu1 = u1 + 3, gv0 = v0 - 3, gv1 = v1 + 3;
    for (const r of aisles) { gu0 = Math.min(gu0, r.u0 - 3); gu1 = Math.max(gu1, r.u1 + 3); gv0 = Math.min(gv0, r.v0 - 3); gv1 = Math.max(gv1, r.v1 + 3); }
    const GH = gv1 - gv0 + 1, GN = (gu1 - gu0 + 1) * GH;
    /** A cell's number: its place in the arrays (cells outside them: a negative number of their own). */
    const key = (u, v) => (u >= gu0 && u <= gu1 && v >= gv0 && v <= gv1 ? (u - gu0) * GH + (v - gv0) : -1 - ((u + 8192) * 16384 + (v + 8192)));
    const occA = new Uint8Array(GN), resA = new Uint8Array(GN), aisA = new Uint8Array(GN), preA = new Uint8Array(GN), roomA = new Uint8Array(GN);
    for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) roomA[(u - gu0) * GH + (v - gv0)] = 1;
    for (const r of aisles) for (let u = r.u0; u <= r.u1; u++) for (let v = r.v0; v <= r.v1; v++) aisA[(u - gu0) * GH + (v - gv0)] = 1;
    for (const r of pre) for (let u = Math.max(r.u0, gu0); u <= Math.min(r.u1, gu1); u++) for (let v = Math.max(r.v0, gv0); v <= Math.min(r.v1, gv1); v++) preA[(u - gu0) * GH + (v - gv0)] = 1;
    const inAisle = (u, v) => { const k = key(u, v); return k >= 0 && aisA[k] === 1; };
    const blockedPre = (u, v) => { const k = key(u, v); return k >= 0 && preA[k] === 1; };
    const cellSet = (A) => ({ has: (k) => k >= 0 && A[k] === 1, add: (k) => { if (k >= 0) A[k] = 1; }, delete: (k) => { if (k >= 0) A[k] = 0; }, *[Symbol.iterator]() { for (let i = 0; i < GN; i++) if (A[i]) yield i; } });
    const occ = cellSet(occA); // cells with a thing on the floor
    const reserve = cellSet(resA); // the free cell in front of a thing
    const cellOf = (k) => [gu0 + Math.floor(k / GH), gv0 + (k % GH)];
    const topH = new Map(); // cell → how high a thing stands there (layers over the floor)
    const hung = new Set(); // wall cells with a tapestry / lamp up high
    const stat = { items: 0, decor: 0, kinds: {} };
    const carpet = s.carpet;
    const trim = carpet === B.CLOTH_YELLOW ? B.CLOTH_WHITE : B.CLOTH_YELLOW; // (cloth: hems, coverlets)
    const edge = B.PLANKS; // (the border of a rug and its medallion: boards of the floor itself — a floor made of cloth would not hold, Structure.js)

    // ---- the free floor 3 wide: the ways through the room must stay joined
    const freeAt = (k) => (roomA[k] === 1 ? occA[k] === 0 && preA[k] === 0 : aisA[k] === 1); // (k in the arrays)
    const freeExt = (u, v) => { const k = key(u, v); return k >= 0 && freeAt(k); };
    const wideAt = (k) => { // (the nine cells round the cell k, k at least one cell inside the arrays)
        return freeAt(k) && freeAt(k - 1) && freeAt(k + 1) && freeAt(k - GH) && freeAt(k - GH - 1) && freeAt(k - GH + 1) && freeAt(k + GH) && freeAt(k + GH - 1) && freeAt(k + GH + 1);
    };
    const wide = (u, v) => { const k = key(u, v); return k >= 0 && wideAt(k); };
    const anchors = aisles.map((r) => [Math.round((r.u0 + r.u1) / 2), Math.round((r.v0 + r.v1) / 2)]);
    const stamp = new Int32Array(GN), queue = new Int32Array(GN);
    let mark = 0;
    /** The 3-wide free floor joined to the first way (stamped cells of `stamp`), or false where the way itself is not 3 wide. */
    const region = () => {
        if (!anchors.length || !wide(...anchors[0])) return false;
        mark++;
        let qh = 0, qt = 0;
        const k0 = key(...anchors[0]);
        stamp[k0] = mark; queue[qt++] = k0;
        while (qh < qt) {
            const k = queue[qh++];
            for (const nk of [k + GH, k - GH, k + 1, k - 1]) {
                if (stamp[nk] === mark || nk < 0 || nk >= GN || !wideAt(nk)) continue;
                stamp[nk] = mark; queue[qt++] = nk;
            }
        }
        return true;
    };
    /**
     * Free floor cells (in the box) in a gap 1 or 2 wide between two THINGS along a row or a column of the room: too narrow for
     * the hero (3 wide with his arms out) — a gap between things is 3 wide or none (a niche against a wall or in a corner is not a way).
     */
    const slots = (b0u, b1u, b0v, b1v) => {
        const out = [];
        const thing = (u, v) => inRoom(u, v) && (occA[key(u, v)] === 1 || preA[key(u, v)] === 1);
        const free = (u, v) => { const k = key(u, v); return k >= 0 && freeAt(k); };
        for (let u = Math.max(u0, b0u); u <= Math.min(u1, b1u); u++) for (let v = Math.max(v0, b0v); v <= Math.min(v1, b1v); v++) {
            const k0 = key(u, v);
            if (occA[k0] === 1 || preA[k0] === 1) continue;
            for (let dir = 0; dir < 2; dir++) {
                const du = dir === 0 ? 1 : 0, dv = dir === 0 ? 0 : 1;
                let n = 0;
                while (n < 3 && free(u + du * (n + 1), v + dv * (n + 1))) n++;
                if (n >= 2) continue;
                let m = 0;
                while (m + n < 3 && free(u - du * (m + 1), v - dv * (m + 1))) m++;
                if (m + n + 1 > 2) continue; // (3 or more free: a way)
                if (thing(u + du * (n + 1), v + dv * (n + 1)) && thing(u - du * (m + 1), v - dv * (m + 1))) { out.push(k0); break; }
            }
        }
        return out;
    };
    const connected = () => {
        if (anchors.length < 2) return true;
        if (!region()) return false;
        for (const a of anchors) if (stamp[key(a[0], a[1])] !== mark) return false;
        return true;
    };
    const enforce = anchors.length < 2 || connected(); // (a room whose aisles are not 3 wide in themselves is not judged by it)
    const baseSlots = new Set(enforce ? slots(u0, u1, v0, v1) : []);
    /** May this thing (its cells just taken) stand: the ways stay joined and it leaves no new narrow gap. */
    const roomy = (cells) => {
        if (!enforce) return true;
        if (!connected()) return false;
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (const [u, v] of cells) { if (u < a0) a0 = u; if (u > a1) a1 = u; if (v < b0) b0 = v; if (v > b1) b1 = v; }
        for (const k of slots(a0 - 3, a1 + 3, b0 - 3, b1 + 3)) if (!baseSlots.has(k)) return false;
        return true;
    };

    // ---- frames: a along a wall, d out of it into the room, h up
    const frame = (ou, ov, au, av, du, dv) => {
        const cell = (a, d) => [ou + a * au + d * du, ov + a * av + d * dv];
        const F = {
            cell,
            u: (a, d) => ou + a * au + d * du, v: (a, d) => ov + a * av + d * dv, // (the same without making an array: the cheap check of commit)
            put(a0, a1, d0, d1, h0, h1, t) {
                const [x0, z0] = cell(a0, d0), [x1, z1] = cell(a1, d1);
                env.box(x0, x1, l + h0, l + h1, z0, z1, t);
            },
            slab(a0, a1, d0, d1, h, t, top = false) {
                F.put(a0, a1, d0, d1, h, h, t);
                for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++) for (let d = Math.min(d0, d1); d <= Math.max(d0, d1); d++) {
                    const [u, v] = cell(a, d);
                    env.slabAt(u, v, l + h, top ? SHAPE.SLAB_TOP : SHAPE.SLAB);
                }
            },
        };
        return F;
    };
    // a wall's basis: its (a = 0, d = 0) cell, a along it, d into the room
    const BASIS = { v0: [u0, v0, 1, 0, 0, 1], v1: [u0, v1, 1, 0, 0, -1], u0: [u0, v0, 0, 1, 1, 0], u1: [u1, v0, 0, 1, -1, 0] };
    const wallLen = (w) => (w === 'v0' || w === 'v1' ? u1 - u0 + 1 : v1 - v0 + 1);
    const wallDepth = (w) => (w === 'v0' || w === 'v1' ? v1 - v0 + 1 : u1 - u0 + 1);
    // a frame in a wall's coordinates: the thing's own (a, d) = wall (a, d); `dir` turns it:
    // 0: as the wall, 1: its front the other way (d reversed), 2: its a along the wall's d, 3: the same, its d the other way
    const at0 = (wl, a, d, dir = 0) => {
        const [ou, ov, au, av, du, dv] = BASIS[wl];
        const o = [ou + a * au + d * du, ov + a * av + d * dv];
        const A = dir < 2 ? [au, av] : [du, dv];
        const D = dir === 0 ? [du, dv] : dir === 1 ? [-du, -dv] : dir === 2 ? [au, av] : [-au, -av];
        return frame(o[0], o[1], A[0], A[1], D[0], D[1]);
    };

    /** Put a thing on the floor if its cells and its front are free and the ways stay open. */
    const commit = (F, spec, opt = {}) => {
        const { w, dp } = spec;
        const access = opt.access ?? spec.access ?? 1, flat = !!(opt.flat ?? spec.flat), loose = !!opt.loose;
        for (let a = 0; a < w; a++) for (let d = 0; d < dp; d++) {
            const u = F.u(a, d), v = F.v(a, d);
            if (!inRoom(u, v)) return false;
            const k = key(u, v);
            if (occA[k] === 1 || preA[k] === 1 || aisA[k] === 1 || (!flat && !loose && resA[k] === 1)) return false;
        }
        const cells = [];
        for (let a = 0; a < w; a++) for (let d = 0; d < dp; d++) cells.push(F.cell(a, d));
        const front = [];
        for (let a = 0; a < w && access; a++) for (let d = dp; d < dp + access; d++) front.push(F.cell(a, d));
        if (front.length && front.every(([u, v]) => !inRoom(u, v) || occ.has(key(u, v)) || blockedPre(u, v))) return false; // (no way to it)
        if (!flat) for (const [u, v] of cells) occ.add(key(u, v));
        if (!flat && !roomy(cells)) { for (const [u, v] of cells) occ.delete(key(u, v)); return false; }
        for (const [u, v] of front) if (inRoom(u, v) && !occ.has(key(u, v))) reserve.add(key(u, v));
        const r = spec.draw(F);
        for (const [u, v] of cells) topH.set(key(u, v), Math.max(topH.get(key(u, v)) || 0, spec.hMax || 4));
        if (!flat) { stat.items += spec.weight ?? 1; if (spec.tag) stat.kinds[spec.tag] = (stat.kinds[spec.tag] || 0) + 1; } else stat.decor++;
        return r === undefined ? true : r;
    };

    const spots = (len, w, pos, exact) => {
        if (exact && typeof pos === 'number') return pos >= 0 && pos + w <= len ? [pos] : [];
        const out = [];
        for (let a = 0; a + w <= len; a++) out.push(a);
        const mid = (len - w) / 2;
        if (pos === 'end') out.reverse();
        else if (pos === 'mid') out.sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid));
        else if (typeof pos === 'number') out.sort((x, y) => Math.abs(x - pos) - Math.abs(y - pos));
        return out;
    };
    /** Against a wall (or the first of the walls in a list that takes it). → { wall, a, F, r } or null. */
    const wall = (walls, spec, opt = {}) => {
        for (const wl of [].concat(walls)) {
            for (const a of spots(wallLen(wl), spec.w, opt.pos || 'start', opt.exact)) {
                const F = at0(wl, a, 0, 0);
                const r = commit(F, spec, opt);
                if (r) return { wall: wl, a, F, r };
            }
        }
        return null;
    };
    /** Exactly at (a, d) of a wall's coordinates, turned by `dir`. */
    const at = (wl, a, d, spec, opt = {}) => {
        const F = at0(wl, a, d, opt.dir || 0);
        const r = commit(F, spec, opt);
        return r ? { wall: wl, a, d, F, r } : null;
    };
    /** The nearest free place around (a, d). */
    const near = (wl, a, d, spec, opt = {}) => {
        const R = opt.reach ?? 3;
        const tries = [];
        for (let da = -R; da <= R; da++) for (let dd = -R; dd <= R; dd++) tries.push([da, dd, Math.abs(da) + Math.abs(dd)]);
        tries.sort((x, y) => x[2] - y[2]);
        for (const [da, dd] of tries) { const r = at(wl, a + da, d + dd, spec, opt); if (r) return r; }
        return null;
    };
    /** The free place for an island nearest to the middle of the room, as the wall's (a, d) of each wall in the list. */
    const scan = (spec, walls = ['v0', 'u0'], opt = {}) => {
        const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
        const tries = [];
        for (const wl of walls) {
            const len = wallLen(wl), dep = wallDepth(wl);
            for (let a = 0; a + spec.w <= len; a++) for (let d = 0; d + spec.dp <= dep; d++) {
                const [x, y] = at0(wl, a + (spec.w - 1) / 2, d + (spec.dp - 1) / 2, 0).cell(0, 0);
                tries.push([wl, a, d, Math.abs(x - cu) + Math.abs(y - cv) + (opt.bias ? opt.bias(x, y) : 0)]);
            }
        }
        tries.sort((p, q) => p[3] - q[3]);
        for (const [wl, a, d] of tries) { const r = at(wl, a, d, spec, opt); if (r) return r; }
        return null;
    };
    const ABcell = (wl, a, d) => at0(wl, a, d, 0).cell(0, 0);
    /** A seat at (a, d) of a wall's coordinates for somebody who looks (fa, fd) in them: the back behind it. */
    const seat = (wl, a, d, fa, fd, spec, opt = {}) => {
        const dir = fd > 0 ? 1 : fd < 0 ? 0 : fa > 0 ? 3 : 2;
        return at(wl, a, d, spec, { ...opt, dir, access: 0 });
    };
    // hung things (tapestry, lamps, chandelier) — over cells whose things are low enough
    const lowEnough = (cells, h) => cells.every(([u, v]) => inRoom(u, v) && (topH.get(key(u, v)) || 0) <= h);
    const decor = (n = 1) => { stat.decor += n; };
    // a second carpet colour for the pattern of a rug (a carpet is a carpet to the structure: the floor itself)
    // (a rug is part of the floor: the yellow castles' «carpet» is cloth, too weak for it — they get a purple one)
    const rugC = carpet === B.CLOTH_YELLOW ? B.CARPET_PURPLE : carpet;
    const carpet2 = { [B.CARPET_RED]: B.CARPET_PURPLE, [B.CARPET_BLUE]: B.CARPET_PURPLE, [B.CARPET_GREEN]: B.CARPET_BLUE, [B.CARPET_PURPLE]: B.CARPET_RED }[rugC] || B.CARPET_PURPLE;
    const rug = (a0, a1, b0, b1, border = true, pattern = false) => {
        a0 = Math.max(a0, u0); a1 = Math.min(a1, u1); b0 = Math.max(b0, v0); b1 = Math.min(b1, v1);
        if (a1 - a0 < 2 || b1 - b0 < 2) return;
        env.box(a0, a1, l - 1, l - 1, b0, b1, rugC);
        if (pattern && a1 - a0 >= 8 && b1 - b0 >= 8) { // a field of the second colour inside, an edge of the first round it, the first again in the middle
            env.box(a0 + 2, a1 - 2, l - 1, l - 1, b0 + 2, b1 - 2, carpet2);
            env.box(a0 + 4, a1 - 4, l - 1, l - 1, b0 + 4, b1 - 4, rugC);
        }
        if (border) {
            env.box(a0, a1, l - 1, l - 1, b0, b0, edge); env.box(a0, a1, l - 1, l - 1, b1, b1, edge);
            env.box(a0, a0, l - 1, l - 1, b0, b1, edge); env.box(a1, a1, l - 1, l - 1, b0, b1, edge);
        }
        decor();
    };
    /** A tapestry in the castle's colour with a gold hem, on a free stretch of a wall, 3 high from 5 up (over the hat). */
    const tapestry = (wl, w = 2, pos = 'mid') => {
        for (const a of spots(wallLen(wl), w, pos)) {
            const F = at0(wl, a, 0, 0), cells = [];
            for (let i = 0; i < w; i++) cells.push(F.cell(i, 0));
            if (!lowEnough(cells, 5) || cells.some(([u, v]) => inAisle(u, v) || hung.has(key(u, v)))) continue;
            for (const [u, v] of cells) hung.add(key(u, v));
            F.put(0, w - 1, 0, 0, 5, 7, carpet);
            F.put(0, w - 1, 0, 0, 7, 7, B.GOLD);
            F.put(Math.floor(w / 2), Math.floor(w / 2), 0, 0, 6, 6, trim);
            decor();
            return true;
        }
        return false;
    };
    /** A lamp on the wall (a glowing block at 5) every few blocks wherever the wall is free. */
    const sconces = (every = 5) => {
        let n = 0;
        for (const wl of WALLS) {
            const F = at0(wl, 0, 0, 0), len = wallLen(wl);
            for (let a = 2; a < len - 1; a += every) {
                const [u, v] = F.cell(a, 0);
                if (!lowEnough([[u, v]], 5) || inAisle(u, v) || hung.has(key(u, v))) continue;
                hung.add(key(u, v));
                F.put(a, a, 0, 0, 5, 5, B.LANTERN); n++;
            }
        }
        decor(n);
        return n;
    };
    /** A chandelier: a chain from the ceiling, a gold ring and four lamps. */
    const chandelier = (cu, cv) => {
        const cells = [[cu, cv], [cu + 1, cv], [cu - 1, cv], [cu, cv + 1], [cu, cv - 1], [cu + 1, cv + 1], [cu - 1, cv + 1], [cu + 1, cv - 1], [cu - 1, cv - 1]];
        if (!lowEnough(cells, 5)) return false;
        const box = (u, v, h0, h1, t) => env.box(u, u, l + h0, l + h1, v, v, t);
        box(cu, cv, 6, 7, B.FENCE);
        for (const [du, dv] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) box(cu + du, cv + dv, 5, 5, B.GOLD);
        for (const [du, dv] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) box(cu + du, cv + dv, 5, 5, B.LANTERN);
        decor();
        return true;
    };
    /** Curtains either side of a window (the cell next to the wall's glass): the castle's colour, 4 high from 1 up. */
    const drapes = () => {
        for (const [wu, wv] of env.windows || []) {
            for (const wl of WALLS) {
                const F = at0(wl, 0, 0, 0);
                // the window's cell on this wall? (the room's cell next to it)
                for (let a = 0; a < wallLen(wl); a++) {
                    const [u, v] = F.cell(a, 0);
                    if (u !== wu || v !== wv) continue;
                    for (const da of [-1, 1]) {
                        const [cu, cv] = F.cell(a + da, 0);
                        if (!inRoom(cu, cv) || occ.has(key(cu, cv)) || inAisle(cu, cv) || hung.has(key(cu, cv))) continue;
                        F.put(a + da, a + da, 0, 0, 1, 4, carpet); F.put(a + da, a + da, 0, 0, 5, 5, B.GOLD);
                        occ.add(key(cu, cv)); topH.set(key(cu, cv), 6); hung.add(key(cu, cv));
                        decor();
                    }
                }
            }
        }
    };

    /** Chests (placed by Castles.placeChests against the walls, off the things and their fronts); the cells they take are marked. */
    const chests = (list) => {
        const rects = [];
        for (const k of reserve) { const [u, v] = cellOf(k); rects.push([u - 0.5, u + 0.5, v - 0.5, v + 0.5]); }
        const placed = env.chests(list, rects) || [];
        for (const r of placed) {
            for (let u = Math.ceil(r[0] - 0.5 + 0.2); u <= Math.floor(r[1] + 0.5 - 0.2); u++) for (let v = Math.ceil(r[2] - 0.5 + 0.2); v <= Math.floor(r[3] + 0.5 - 0.2); v++) {
                if (inRoom(u, v)) { occ.add(key(u, v)); topH.set(key(u, v), Math.max(topH.get(key(u, v)) || 0, 3)); }
            }
        }
        // the room in front of each (the lid opens that way): kept free — the chest stands with its back to the nearest wall
        for (const r of placed) {
            const gap = [r[0] - (u0 - 0.5), (u1 + 0.5) - r[1], r[2] - (v0 - 0.5), (v1 + 0.5) - r[3]]; // (to the walls u0, u1, v0, v1)
            const w = gap.indexOf(Math.min(...gap));
            const front = [];
            if (w === 0) for (let v = Math.ceil(r[2] - 0.5 + 0.2); v <= Math.floor(r[3] + 0.5 - 0.2); v++) front.push([Math.round(r[1] + 0.5), v]);
            else if (w === 1) for (let v = Math.ceil(r[2] - 0.5 + 0.2); v <= Math.floor(r[3] + 0.5 - 0.2); v++) front.push([Math.round(r[0] - 0.5), v]);
            else if (w === 2) for (let u = Math.ceil(r[0] - 0.5 + 0.2); u <= Math.floor(r[1] + 0.5 - 0.2); u++) front.push([u, Math.round(r[3] + 0.5)]);
            else for (let u = Math.ceil(r[0] - 0.5 + 0.2); u <= Math.floor(r[1] + 0.5 - 0.2); u++) front.push([u, Math.round(r[2] - 0.5)]);
            for (const [u, v] of front) if (inRoom(u, v) && !occ.has(key(u, v))) reserve.add(key(u, v));
        }
        stat.items += placed.length;
        return placed;
    };
    const P = pieces(s, rng, carpet, trim);
    let rr = Math.floor(rng() * 4); // (which wall the next thing tries first: the rooms of one kind are not the same)
    const K = {
        chests, any: () => { const k = rr++ % 4; return WALLS.slice(k).concat(WALLS.slice(0, k)); },
        env, s, rng, P, wall, at, near, scan, seat, ABcell, wallLen, wallDepth, frame, rug, tapestry, sconces, chandelier, drapes,
        occ, topH, inRoom, inAisle, lowEnough, decor, stat, u0, u1, v0, v1, l, key, carpet, rugC, trim, room, at0, commit, enforce,
        chance: (p) => rng() < p, pick: (list) => list[Math.floor(rng() * list.length) % list.length],
        cu: Math.round((u0 + u1) / 2), cv: Math.round((v0 + v1) / 2),
    };
    (ROOMS[kind] || ROOMS.generic)(K);
    topUp(K);
    return stat;
}

// ---------------------------------------------------------------------------------------------- the things
export function pieces(s, rng, carpet, trim) {
    const P = {};
    const chance = (p) => rng() < p;
    const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
    const spec = (w, dp, hMax, draw, extra = {}) => ({ w, dp, hMax, draw, ...extra });

    P.bookshelf = (w, hgt = 4) => spec(w, 1, hgt + 1, (F) => {
        F.put(0, w - 1, 0, 0, 0, hgt - 1, B.BOOKS);
        F.slab(0, w - 1, 0, 0, hgt, B.PLANKS_DARK);
        if (w >= 3 && chance(0.5)) F.put(1, 1, 0, 0, 2, 2, pick([B.POTION, B.PLANKS_DARK])); // a bottle or a board among the books
    }, { tag: 'bookshelf' });
    P.wardrobe = spec(2, 1, 5, (F) => { // 4.5 m: a hero and a half
        F.put(0, 0, 0, 0, 0, 3, B.PLANKS_DARK); F.put(1, 1, 0, 0, 0, 3, B.PLANKS); // two doors, dark and light
        F.slab(0, 1, 0, 0, 4, B.PLANKS_DARK); // the cornice
    }, { tag: 'wardrobe' });
    // a chest of drawers 2 m high; with a mirror over it (a gold sill at 2, the glass from 3 to 5 — the hero's eyes are at 3.4)
    P.dresser = (mirror) => spec(2, 1, mirror ? 6 : 3, (F) => {
        F.put(0, 1, 0, 0, 0, 0, B.PLANKS); F.put(0, 1, 0, 0, 1, 1, B.PLANKS_DARK);
        if (mirror) { F.put(0, 1, 0, 0, 2, 2, B.GOLD); F.put(0, 1, 0, 0, 3, 4, B.CS_WHITE); F.put(0, 1, 0, 0, 5, 5, B.GOLD); } // a silver glass in a gold frame
        else { F.put(0, 0, 0, 0, 2, 2, pick([B.FLOWERS, B.BOOKS])); F.put(1, 1, 0, 0, 2, 2, B.LANTERN); }
    }, { tag: 'dresser' });
    P.nightstand = spec(1, 1, 3, (F) => { F.put(0, 0, 0, 0, 0, 0, B.PLANKS_DARK); F.put(0, 0, 0, 0, 1, 1, B.LANTERN); }, { tag: 'nightstand', access: 0 });
    P.barrel = (stack = 1) => spec(1, 1, stack + 1, (F) => { F.put(0, 0, 0, 0, 0, stack - 1, B.PLANKS_DARK); F.slab(0, 0, 0, 0, stack, B.PLANKS); }, { tag: 'barrel', access: 0 });
    P.crate = (stack = 1, top = null) => spec(1, 1, stack + 1, (F) => { F.put(0, 0, 0, 0, 0, stack - 1, B.PLANKS); if (top) F.put(0, 0, 0, 0, stack, stack, top); }, { tag: 'crate', access: 0 });
    P.sacks = spec(1, 1, 2, (F) => { F.put(0, 0, 0, 0, 0, 0, B.CLOTH_YELLOW); F.slab(0, 0, 0, 0, 1, B.CLOTH_YELLOW); }, { tag: 'sacks', access: 0 });
    // a pile of crates, barrels and sacks of different heights (an island in a store)
    P.stack = (w, dp) => spec(w, dp, 4, (F) => {
        for (let a = 0; a < w; a++) for (let d = 0; d < dp; d++) {
            const k = Math.floor(rng() * 4), h = 1 + Math.floor(rng() * 3);
            if (k === 0) { F.put(a, a, d, d, 0, h - 1, B.PLANKS); if (h > 1 && chance(0.4)) F.put(a, a, d, d, h, h, B.VEG); }
            else if (k === 1) { F.put(a, a, d, d, 0, Math.max(0, h - 2), B.PLANKS_DARK); F.slab(a, a, d, d, Math.max(0, h - 2) + 1, B.PLANKS); }
            else if (k === 2) { F.put(a, a, d, d, 0, 0, B.CLOTH_YELLOW); F.slab(a, a, d, d, 1, B.CLOTH_YELLOW); }
            else F.put(a, a, d, d, 0, h > 2 ? 1 : 0, B.HAY);
        }
    }, { tag: 'stack', access: 1 });
    P.hay = spec(1, 1, 2, (F) => { F.put(0, 0, 0, 0, 0, 1, B.HAY); }, { tag: 'hay', access: 0 });
    P.lampStand = spec(1, 1, 3, (F) => { F.put(0, 0, 0, 0, 0, 1, B.FENCE); F.put(0, 0, 0, 0, 2, 2, B.LANTERN); }, { tag: 'lamp', access: 0 });
    P.brazier = spec(1, 1, 2, (F) => { F.put(0, 0, 0, 0, 0, 0, B.CS_DARK); F.put(0, 0, 0, 0, 1, 1, B.LANTERN); }, { tag: 'brazier', access: 0 });
    // seats are 1 m high (the knee of a hero 3.5 m tall), tables 1.5 m (the same proportion as at home): a stool is a block, a chair a block and a post behind it
    P.stool = spec(1, 1, 1, (F) => { F.put(0, 0, 0, 0, 0, 0, B.PLANKS); }, { tag: 'stool', access: 0 });
    // a chair: the seat at d = 0, the back at d = 1
    P.chair = spec(1, 2, 4, (F) => { F.put(0, 0, 0, 0, 0, 0, B.PLANKS_DARK); F.put(0, 0, 1, 1, 0, 3, B.FENCE); }, { tag: 'chair', access: 0 });
    P.armchair = spec(1, 2, 4, (F) => {
        F.put(0, 0, 0, 0, 0, 0, carpet); // the seat: a cushion
        F.put(0, 0, 1, 1, 0, 3, B.PLANKS_DARK); F.put(0, 0, 1, 1, 2, 2, carpet);
    }, { tag: 'armchair', access: 0 });
    // a wing chair in one cell: a cushion block and a high back over it (where there is no room for the two-cell one)
    P.armchair1 = spec(1, 1, 4, (F) => { F.put(0, 0, 0, 0, 0, 0, carpet); F.put(0, 0, 0, 0, 1, 2, B.PLANKS_DARK); F.slab(0, 0, 0, 0, 3, carpet); }, { tag: 'armchair', access: 0 });
    P.bench = (w) => spec(w, 1, 1, (F) => { // a plank on posts at its ends (and in the middle of a long one): its top at 1 m
        F.put(0, 0, 0, 0, 0, 0, B.FENCE); F.put(w - 1, w - 1, 0, 0, 0, 0, B.FENCE);
        if (w >= 5) F.put(Math.floor(w / 2), Math.floor(w / 2), 0, 0, 0, 0, B.FENCE);
        for (let a = 1; a < w - 1; a++) if (!(w >= 5 && a === Math.floor(w / 2))) F.slab(a, a, 0, 0, 0, B.PLANKS, true);
    }, { tag: 'bench', access: 0 });
    // a table: a half-block top (1.5 m), a post at each corner (and in the long ones every 3); `cover(F, w, dp)` lays it: its things go
    // where the top is (in the cell: a lamp, a bottle, a basket stand 1 m tall on it), what hangs over it (h ≥ 4) is where it is
    P.table = (w, dp, cover = null, cloth = false) => spec(w, dp, 3, (F) => {
        F.slab(0, w - 1, 0, dp - 1, 1, B.PLANKS_DARK);
        const post = (a, d) => F.put(a, a, d, d, 0, 0, B.FENCE);
        post(0, 0); post(w - 1, 0); post(0, dp - 1); post(w - 1, dp - 1);
        if (w >= 7) for (let a = 3; a < w - 2; a += 3) { post(a, 0); post(a, dp - 1); }
        if (cloth && w >= 3) F.slab(1, w - 2, dp > 2 ? 1 : 0, dp > 2 ? dp - 2 : dp - 1, 1, B.CLOTH_WHITE); // a runner
        if (cover) {
            const lower = (h) => (h >= 4 ? h : h - 1);
            cover({ cell: F.cell, put: (a0, a1, d0, d1, h0, h1, t) => F.put(a0, a1, d0, d1, lower(h0), lower(h1), t), slab: (a0, a1, d0, d1, h, t, top) => F.slab(a0, a1, d0, d1, lower(h), t, top) }, w, dp);
        }
    }, { tag: 'table', access: 1 });
    // a table with a bench along each long side (and a high chair at each end): one thing, its footprint (w + 2·chairs) × (dp + 2)
    P.set = (w, dp, cover = null, { chairs = false, cloth = false } = {}) => {
        const o = chairs ? 1 : 0;
        return spec(w + 2 * o, dp + 2, 3, (F) => {
            const T = P.table(w, dp, cover, cloth);
            // the table at (o, 1): its own frame shifted
            const G = {
                cell: (a, d) => F.cell(a + o, d + 1),
                put: (a0, a1, d0, d1, h0, h1, t) => F.put(a0 + o, a1 + o, d0 + 1, d1 + 1, h0, h1, t),
                slab: (a0, a1, d0, d1, h, t, top) => F.slab(a0 + o, a1 + o, d0 + 1, d1 + 1, h, t, top),
            };
            T.draw(G);
            for (const d of [0, dp + 1]) { // a bench along each long side: a plank on posts, its top at 1 m
                F.put(o, o, d, d, 0, 0, B.FENCE); F.put(o + w - 1, o + w - 1, d, d, 0, 0, B.FENCE);
                if (w >= 5) F.put(o + Math.floor(w / 2), o + Math.floor(w / 2), d, d, 0, 0, B.FENCE);
                for (let a = 1; a < w - 1; a++) if (!(w >= 5 && a === Math.floor(w / 2))) F.slab(o + a, o + a, d, d, 0, B.PLANKS, true);
            }
            if (chairs) for (const a of [0, w + 1]) { // (a high-backed chair at each end: a seat block, the back over it)
                const d = Math.floor((dp + 1) / 2);
                F.put(a, a, d, d, 0, 0, B.PLANKS_DARK); F.put(a, a, d, d, 1, 3, B.PLANKS_DARK);
            }
        }, { tag: 'table', access: 0, weight: 3 });
    };
    P.fireplace = (w = 5, big = false) => spec(w, 2, 8, (F) => {
        F.put(0, 0, 0, 1, 0, 3, B.COBBLE); F.put(w - 1, w - 1, 0, 1, 0, 3, B.COBBLE); // the jambs
        F.put(1, w - 2, 0, 0, 0, 0, B.LANTERN); // the fire (a glowing block)
        F.slab(1, w - 2, 1, 1, 0, B.COBBLE); // the hearthstone
        F.put(0, w - 1, 0, 1, 3, 3, B.CS_DARK); // the mantel beam
        F.put(1, w - 2, 0, 0, 4, 7, B.COBBLE); // the chimney breast to the ceiling
        F.put(0, 0, 0, 0, 4, 4, pick([B.FLOWERS, B.BOOKS])); F.put(w - 1, w - 1, 0, 0, 4, 4, B.LANTERN);
        F.put(0, 0, 0, 0, 5, 7, B.COBBLE); F.put(w - 1, w - 1, 0, 0, 5, 7, B.COBBLE);
        if (big) { // a crane and a pot over the fire
            F.put(2, w - 3, 0, 0, 1, 1, B.FENCE);
            F.put(Math.floor(w / 2), Math.floor(w / 2), 0, 0, 1, 1, B.CS_DARK);
        }
    }, { tag: 'fireplace', access: 1 });
    P.pedestal = (top) => spec(1, 1, 3, (F) => { F.put(0, 0, 0, 0, 0, 1, B.CS_WHITE); if (top) F.slab(0, 0, 0, 0, 2, top); }, { tag: 'pedestal', access: 0 });
    P.armorStand = spec(1, 1, 5, (F) => {
        F.put(0, 0, 0, 0, 0, 0, B.PLANKS_DARK); F.put(0, 0, 0, 0, 1, 2, B.CS_GREY); F.put(0, 0, 0, 0, 3, 3, B.CS_DARK);
        F.slab(0, 0, 0, 0, 4, carpet); // the plume
    }, { tag: 'armor', access: 0 });
    P.spearRack = (w = 3) => spec(w, 1, 6, (F) => {
        F.put(0, w - 1, 0, 0, 0, 0, B.PLANKS_DARK);
        F.put(0, w - 1, 0, 0, 1, 4, B.FENCE);
        F.slab(0, w - 1, 0, 0, 5, B.CS_GREY, true); // the heads
    }, { tag: 'rack' });
    P.shieldRack = (w = 3) => spec(w, 1, 4, (F) => {
        F.put(0, w - 1, 0, 0, 0, 0, B.PLANKS_DARK);
        for (let a = 0; a < w; a++) F.put(a, a, 0, 0, 1, 2, [carpet, B.CLOTH_YELLOW, B.CS_GREY][(a + (w & 1)) % 3]);
        F.put(0, w - 1, 0, 0, 3, 3, B.PLANKS_DARK);
    }, { tag: 'rack' });
    P.swordRack = (w = 3) => spec(w, 1, 4, (F) => {
        F.put(0, w - 1, 0, 0, 0, 1, B.PLANKS_DARK);
        F.slab(0, w - 1, 0, 0, 2, B.CS_GREY);
        for (let a = 0; a < w; a += 2) F.put(a, a, 0, 0, 3, 3, B.FENCE);
    }, { tag: 'rack' });
    P.anvilBlock = spec(1, 1, 3, (F) => { F.put(0, 0, 0, 0, 0, 0, B.WOOD); F.put(0, 0, 0, 0, 1, 1, B.CS_DARK); F.slab(0, 0, 0, 0, 2, B.CS_DARK); }, { tag: 'anvil' });
    P.coinPile = (big) => {
        const n = big ? 3 : 2;
        return spec(n, n, n, (F) => {
            F.put(0, n - 1, 0, n - 1, 0, 0, B.GOLD);
            F.put(0, n - 2, 0, n - 2, 1, 1, B.GOLD);
            if (big) F.put(0, 0, 0, 0, 2, 2, B.GOLD);
        }, { tag: 'coins', access: 0 });
    };
    P.lectern = spec(1, 1, 2, (F) => { F.put(0, 0, 0, 0, 0, 0, B.PLANKS_DARK); F.put(0, 0, 0, 0, 1, 1, B.BOOKS); }, { tag: 'lectern', access: 1 });
    P.statue = (gold) => spec(1, 1, 5, (F) => { F.put(0, 0, 0, 0, 0, 1, B.CS_DARK); F.put(0, 0, 0, 0, 2, 3, B.CS_WHITE); F.slab(0, 0, 0, 0, 4, gold ? B.GOLD : B.CS_WHITE); }, { tag: 'statue', access: 0 });
    P.ladder = spec(1, 1, 5, (F) => { F.put(0, 0, 0, 0, 0, 4, B.FENCE); }, { tag: 'ladder', access: 0 });
    P.stump = spec(1, 1, 1, (F) => { F.put(0, 0, 0, 0, 0, 0, B.WOOD); }, { tag: 'stump', access: 0 });
    P.cupboard = (w = 2) => spec(w, 1, 4, (F) => {
        F.put(0, w - 1, 0, 0, 0, 1, B.PLANKS_DARK);
        F.put(0, w - 1, 0, 0, 2, 2, B.POTION); // the crockery and the bottles
        F.slab(0, w - 1, 0, 0, 3, B.PLANKS);
    }, { tag: 'cupboard' });
    P.rack = (w = 2, h = 3) => spec(w, 1, h + 1, (F) => { // stores on shelves: sacks, jars, crates
        for (let a = 0; a < w; a++) {
            F.put(a, a, 0, 0, 0, 0, B.PLANKS);
            for (let k = 1; k < h; k++) F.put(a, a, 0, 0, k, k, [B.POTION, B.CLOTH_YELLOW, B.PLANKS, B.VEG][(a + k) % 4]);
        }
        F.slab(0, w - 1, 0, 0, h, B.PLANKS_DARK);
    }, { tag: 'rack' });
    P.altar = spec(5, 2, 8, (F) => {
        F.put(0, 4, 0, 1, 0, 1, B.CS_WHITE); F.put(0, 4, 0, 1, 2, 2, B.CLOTH_WHITE); // the table of stone and its cloth
        F.put(2, 2, 0, 0, 3, 6, B.GOLD); F.put(1, 3, 0, 0, 4, 4, B.GOLD); // the cross
        F.put(0, 0, 0, 0, 3, 3, B.LANTERN); F.put(4, 4, 0, 0, 3, 3, B.LANTERN); // the candles
    }, { tag: 'altar', access: 1 });
    P.pew = (w) => spec(w, 2, 4, (F) => { // the seat at d = 0 (a plank on posts, 1 m), the back at d = 1
        F.put(0, 0, 0, 0, 0, 0, B.FENCE); F.put(w - 1, w - 1, 0, 0, 0, 0, B.FENCE);
        for (let a = 1; a < w - 1; a++) F.slab(a, a, 0, 0, 0, B.PLANKS, true);
        F.put(0, w - 1, 1, 1, 0, 2, B.PLANKS_DARK);
    }, { tag: 'pew', access: 0 });
    P.vitrage = spec(3, 1, 6, (F) => { // a window of coloured glass: the lamps of three colours in a stone frame
        F.put(0, 2, 0, 0, 1, 1, B.CS_GREY); F.put(0, 2, 0, 0, 6, 6, B.CS_GREY);
        const glass = [B.LANTERN, B.ARCANE_LAMP, B.ARCANE_LAMP_VIOLET];
        for (let a = 0; a < 3; a++) for (let h = 2; h <= 5; h++) F.put(a, a, 0, 0, h, h, glass[(a + h) % 3]);
    }, { tag: 'vitrage', access: 0, flat: false });
    P.portrait = spec(3, 1, 6, (F) => { // a gold frame round a painting (a coloured cloth)
        F.put(0, 2, 0, 0, 3, 5, B.GOLD);
        F.put(1, 1, 0, 0, 4, 4, pick([B.CARPET_BLUE, B.CARPET_GREEN, B.CARPET_RED, B.CARPET_PURPLE]));
    }, { tag: 'portrait', access: 0, flat: true }); // (it hangs on the wall: the floor under it is free)
    P.scales = spec(1, 1, 5, (F) => { F.put(0, 0, 0, 0, 0, 0, B.GOLD); F.put(0, 0, 0, 0, 1, 3, B.FENCE); F.slab(0, 0, 0, 0, 4, B.GOLD); }, { tag: 'scales', access: 0 });
    P.hangFood = (F, a, d) => { F.put(a, a, d, d, 6, 7, B.FENCE); F.put(a, a, d, d, 5, 5, chance(0.5) ? B.VEG : B.HAY); }; // strings of onions and garlic over a table
    P.tableware = (F, w, dp) => { // what stands on a table: candles, bottles, fruit, flowers
        const cells = [];
        for (let a = 0; a < w; a++) for (let d = 0; d < dp; d++) cells.push([a, d]);
        for (const [a, d] of cells) {
            if (chance(0.55)) continue;
            F.put(a, a, d, d, 2, 2, pick([B.LANTERN, B.POTION, B.VEG, B.FLOWERS, B.POTION, B.LANTERN]));
        }
    };
    return P;
}

// ---------------------------------------------------------------------------------------------- the rooms
const ROOMS = {};

/** A bed against a wall's cells: head to the wall; returns its sleeping place for the night life. */
function bed(K, wl, pos, { king = false, exact = false } = {}) {
    const { P, carpet, trim } = K;
    const w = king ? 5 : 3, dp = king ? 7 : 6;
    const sp = {
        w, dp, hMax: king ? 8 : 4, tag: 'bed', access: 1, draw: (F) => {
            if (K.room.bedEntity) { // (a villager's home: the bed is a thing of its own, set by the game — Houses.js; here its place only)
                for (let a = 0; a < w; a++) for (let d = 0; d < dp; d++) { const [bu, bv] = F.cell(a, d); K.env.occupy?.(bu, bv); } // (no chest may stand on it)
                const [mu, mv] = F.cell((w - 1) / 2, 2.4), [hu, hv] = F.cell((w - 1) / 2, 0);
                const [cu0, cv0] = F.cell(0, 0), [cu1, cv1] = F.cell(0, 1);
                return { sleep: [mu, mv, hu, hv], head: [hu, hv], dir: [cu1 - cu0, cv1 - cv0], dp };
            }
            F.put(0, w - 1, 1, dp - 1, 0, 0, B.PLANKS_DARK); // the frame
            F.put(0, w - 1, 1, dp - 1, 1, 1, B.CLOTH_WHITE); // the sheets
            F.put(0, w - 1, 3, dp - 2, 1, 1, carpet); // the coverlet
            if (king) F.put(0, w - 1, dp - 2, dp - 2, 1, 1, trim);
            F.put(0, w - 1, 0, 0, 0, king ? 3 : 2, B.PLANKS_DARK); // the headboard
            F.put(0, w - 1, dp - 1, dp - 1, 0, 1, B.PLANKS_DARK); // the footboard
            if (king) {
                F.put(1, w - 2, 0, 0, 2, 3, carpet); F.put(0, w - 1, 0, 0, 4, 4, B.GOLD);
                for (let a = 0; a < w; a++) for (let d = 0; d < dp; d++) {
                    if ((a === 0 || a === w - 1) && (d === 0 || d === dp - 1)) continue;
                    F.slab(a, a, d, d, 6, carpet, true); // the canopy (half blocks, the corners are the posts' gold)
                }
                for (const [a, d] of [[0, 0], [w - 1, 0], [0, dp - 1], [w - 1, dp - 1]]) { F.put(a, a, d, d, 0, 5, B.PLANKS_DARK); F.put(a, a, d, d, 6, 6, B.GOLD); } // the posts
                for (const a of [0, w - 1]) for (const d of [1, 2, 4, 5]) F.put(a, a, d, d, 3, 5, carpet); // the curtains
            } else {
                F.put(0, 0, 0, 0, 3, 3, B.FENCE); F.put(w - 1, w - 1, 0, 0, 3, 3, B.FENCE);
            }
            const [mu, mv] = F.cell((w - 1) / 2, 2.4), [hu, hv] = F.cell((w - 1) / 2, 0);
            const [cu0, cv0] = F.cell(0, 0), [cu1, cv1] = F.cell(0, 1);
            return { sleep: [mu, mv, hu, hv], head: [hu, hv], dir: [cu1 - cu0, cv1 - cv0], dp };
        },
    };
    const r = K.wall(wl, sp, { pos, exact });
    if (!r) return null;
    K.env.bed({ ...r.r, king });
    return r;
}

/** Two nightstands, one each side of a bed. */
function stands(K, b) {
    if (!b) return;
    const w = K.room.kind === 'king' ? 5 : 3;
    for (const a of [b.a - 1, b.a + w]) K.at(b.wall, a, 0, K.P.nightstand, {});
}

/**
 * A chest at the foot of a bed, its back to the footboard, its lid to the room (the wide chest across the bed): the
 * cells it covers are taken first (it must fit and leave the way to it free); true if it stands.
 */
function footChest(K, b, scale, extra) {
    if (!b) return false;
    const bw = K.room.kind === 'king' ? 5 : 3, dp = b.r.dp;
    const W = 1.25 * scale, D = 0.85 * scale;
    const across = Math.min(bw, Math.max(1, Math.round(W))), deep = Math.max(1, Math.round(D + 0.2));
    const spec = { w: across, dp: deep, hMax: 2, draw: () => {}, access: 1 };
    const F = K.at0(b.wall, b.a + Math.floor((bw - across) / 2), dp, 0);
    if (!K.commit(F, spec, { loose: true })) return false;
    const dist = dp - 0.5 + 0.2 + 0.425 * scale;
    K.env.putChest({ u: b.r.head[0] + b.r.dir[0] * dist, v: b.r.head[1] + b.r.dir[1] * dist, fu: b.r.dir[0], fv: b.r.dir[1], scale, ...extra });
    K.stat.items++;
    return true;
}

ROOMS.generic = (K) => {
    K.wall(K.any(), K.P.cupboard(2));
};

ROOMS.king = (K) => {
    const { P, u0, u1, v0, v1, l, env } = K;
    // the rug over the whole floor, a gold medallion in its middle
    K.rug(u0, u1, v0, v1, true, true);
    const mu = K.cu, mv = Math.round((v0 + 5 + v1) / 2);
    env.box(mu - 1, mu + 1, l - 1, l - 1, mv - 1, mv + 1, B.PLANKS);
    env.box(mu, mu, l - 1, l - 1, mv, mv, B.PLANKS_DARK);
    const b = bed(K, 'v1', 'mid', { king: true });
    stands(K, b);
    // the fireplace on a side wall with two armchairs and a little table before it
    const fw = K.chance(0.5) ? 'u0' : 'u1', ww = OPPOSITE[fw];
    const lenS = K.wallLen(fw);
    const fire = K.wall(fw, P.fireplace(5), { pos: Math.max(0, Math.round((lenS - 5) / 2) + 1) });
    if (fire) {
        for (const a of [fire.a, fire.a + 4]) { // (a seat by the hearth, the back behind it: they look at the fire)
            K.seat(fw, a, 2, 0, -1, P.armchair, { loose: true }) || K.seat(fw, a, 2, 0, -1, P.armchair1, { loose: true });
        }
        K.at(fw, fire.a + 2, 2, P.table(1, 1, (F) => F.put(0, 0, 0, 0, 2, 2, K.pick([B.POTION, B.FLOWERS, B.LANTERN]))), { access: 0, loose: true });
    }
    // chests: at the foot of the bed the king's own (carved, gold); the clothes chest and the strongbox with scrolls by the walls
    footChest(K, b, 2.4, { look: 'rich', room: 'king', flavor: null });
    K.chests([
        { at: K.ABcell(ww, 3, 7), look: 'painted', flavor: 'clothes', room: 'bedroom', scales: [2.5, 2, 1.6] },
        { at: K.ABcell('v0', 2, 3), look: 'plain', flavor: 'scrolls', room: 'bedroom', scales: [2, 1.6] },
    ]);
    // opposite the fire: wardrobes, a dresser with a mirror; a crown on a pedestal and an armour stand by the bed
    K.wall(ww, P.wardrobe, { pos: 'start' }); K.wall(ww, P.wardrobe, { pos: 'start' });
    K.wall(ww, P.dresser(true), { pos: 'end' });
    K.wall('v1', P.pedestal(B.GOLD), { pos: 'start' });
    K.wall('v1', P.armorStand, { pos: 'end' });
    // the writing desk by a side wall, a chair, a shelf of books
    const desk = K.wall([fw === 'u0' ? 'u1' : 'u0'], P.table(3, 2, (F) => { F.put(0, 0, 0, 0, 2, 2, B.BOOKS); F.put(1, 1, 0, 0, 2, 2, B.LANTERN); F.put(2, 2, 1, 1, 2, 2, B.CLOTH_WHITE); }), { pos: 'end' });
    if (desk) K.seat(desk.wall, desk.a + 1, 2, 0, -1, P.chair);
    K.wall(['v1', 'u0', 'u1'], P.bookshelf(3, 4), { pos: 'start' });
    K.wall(['v1'], P.lampStand, { pos: 'mid' });
    // hangings: the king's colour on every free stretch of wall, curtains at the windows, chandeliers, lamps
    K.drapes();
    for (const wl of WALLS) { K.tapestry(wl, 3, 'start'); K.tapestry(wl, 3, 'end'); K.tapestry(wl, 2, 'mid'); }
    K.chandelier(mu - 4, mv); K.chandelier(mu + 4, mv); K.chandelier(mu, mv + 2);
    K.sconces(4);
};

ROOMS.bedroom = (K) => {
    const { P } = K;
    K.rug(K.u0 + 1, K.u1 - 1, K.v0 + 1, K.v1 - 1);
    const grand = (K.env.beds || 1) > 1;
    const b1 = bed(K, 'v1', grand ? 'start' : 'mid');
    stands(K, b1);
    let b2 = null;
    if (grand) { b2 = bed(K, 'v1', 'end'); stands(K, b2); }
    footChest(K, b1, 2, { look: 'painted', room: 'bedroom', flavor: 'clothes' });
    K.wall(['u0', 'u1'], P.wardrobe, { pos: 'end' });
    K.wall(['u1', 'u0'], P.dresser(false), { pos: 'start' });
    const desk = K.wall(['u0', 'u1'], P.table(2, 2, (F) => { F.put(0, 0, 0, 0, 2, 2, B.BOOKS); F.put(1, 1, 0, 0, 2, 2, B.LANTERN); }), { pos: 'mid' });
    if (desk) K.seat(desk.wall, desk.a, 2, 0, -1, P.chair);
    K.wall(['v0', 'u0', 'u1'], P.bookshelf(2, 3), { pos: 'mid' });
    K.wall(['v0', 'v1', 'u0', 'u1'], P.lampStand, { pos: 'start' });
    K.wall(['u0', 'u1', 'v0'], P.armchair, { pos: 'end' });
    K.drapes();
    for (const wl of WALLS) K.tapestry(wl, 2, 'mid');
    K.chandelier(K.cu, K.cv);
    K.sconces(5);
};

ROOMS.kitchen = (K) => {
    const { P, room } = K;
    const far = OPPOSITE[room.doorSide] || 'u0';
    const mid = Math.round((K.wallLen(far) - 7) / 2);
    K.wall(far, P.fireplace(7, true), { pos: mid });
    K.chests([{ at: K.ABcell(far, 1, 3), look: 'crate', flavor: 'food', room: 'kitchen', scales: [2, 1.6] }]);
    // two work tables with food on them and strings of onions over them
    const tbl = (F, w, dp) => {
        K.P.tableware(F, w, dp);
        for (let a = 1; a < w - 1; a += 2) P.hangFood(F, a, 0);
    };
    for (let n = 0; n < 2; n++) for (let L = 5; L >= 3; L--) if (K.scan(P.table(L, 2, tbl), ['v0', 'u0'], { access: 1 })) break;
    K.wall(K.any(), P.cupboard(3)); K.wall(K.any(), P.cupboard(2));
    K.wall(K.any(), P.rack(3, 3));
    for (let i = 0; i < 4; i++) K.wall(K.any(), P.barrel(i % 2 ? 1 : 2), { pos: i % 2 ? 'end' : 'start' });
    for (let i = 0; i < 3; i++) K.wall(K.any(), P.crate(i ? 2 : 1, B.VEG), { pos: 'mid' });
    K.wall(K.any(), P.sacks); K.wall(K.any(), P.stump);
    K.scan(P.stack(2, 2), ['v0', 'u0']);
    K.sconces(5);
};

ROOMS.dining = (K) => {
    const { P, room } = K;
    K.rug(K.u0 + 2, K.u1 - 2, K.v0 + 2, K.v1 - 2, true, true);
    const far = OPPOSITE[room.doorSide] || 'u0';
    K.wall(far, P.fireplace(5), { pos: 'mid' });
    const set = (F, w, dp) => {
        K.P.tableware(F, w, dp);
        for (let a = 1; a < w - 1; a += 3) P.hangFood(F, a, 1);
    };
    // the long table with its benches and the high chairs at the ends: the longest that fits
    for (let L = 9; L >= 4; L--) if (K.scan(P.set(L, 3, set, { chairs: true, cloth: true }), ['v0', 'u0'])) break;
    K.wall(K.any(), P.cupboard(3)); K.wall(K.any(), P.cupboard(2), { pos: 'end' });
    K.wall(K.any(), P.barrel(1)); K.wall(K.any(), P.lampStand, { pos: 'end' });
    for (const w of WALLS) K.tapestry(w, 3, 'mid');
    K.chandelier(K.cu, K.cv);
    K.sconces(5);
};

ROOMS.guardroom = (K) => {
    const { P } = K;
    const set = (F, w, dp) => { F.put(0, 0, 0, 0, 2, 2, B.LANTERN); if (w > 2) F.put(w - 1, w - 1, dp - 1, dp - 1, 2, 2, B.POTION); F.put(Math.floor(w / 2), Math.floor(w / 2), 0, 0, 2, 2, B.CLOTH_YELLOW); };
    for (let L = 6; L >= 3; L--) if (K.scan(P.set(L, 2, set), ['v0', 'u0'])) break;
    K.wall(K.any(), P.spearRack(3)); K.wall(K.any(), P.spearRack(3), { pos: 'end' });
    K.wall(K.any(), P.shieldRack(3), { pos: 'mid' });
    K.wall(K.any(), P.swordRack(3));
    K.wall(K.any(), P.barrel(2)); K.wall(K.any(), P.barrel(1), { pos: 'end' });
    K.wall(K.any(), P.brazier); K.wall(K.any(), P.lampStand, { pos: 'end' });
    K.wall(K.any(), P.cupboard(2), { pos: 'mid' });
    K.sconces(5);
};

ROOMS.armoury = (K) => {
    const { P } = K;
    K.rug(K.u0 + 2, K.u1 - 2, K.v0 + 2, K.v1 - 2, false);
    K.chests([
        { at: K.ABcell('v1', 2, 2), look: 'iron', flavor: 'arms', room: 'armoury', scales: [3, 2.5, 2] },
        { at: K.ABcell('v0', 2, 2), look: 'crate', flavor: 'arms', room: 'armoury', scales: [2.4, 2] },
    ]);
    for (let i = 0; i < 2; i++) { K.wall(K.any(), P.spearRack(3), { pos: i ? 'end' : 'start' }); K.wall(K.any(), P.shieldRack(3), { pos: i ? 'start' : 'end' }); K.wall(K.any(), P.swordRack(3), { pos: 'mid' }); }
    for (let i = 0; i < 3; i++) K.wall(K.any(), P.armorStand, { pos: i ? 'end' : 'mid' });
    // a work table with blades on it and the sharpening block
    const set = (F, w, dp) => { for (let a = 0; a < w; a++) F.slab(a, a, 0, 0, 2, B.CS_GREY); F.put(w - 1, w - 1, dp - 1, dp - 1, 2, 2, B.LANTERN); };
    for (let L = 5; L >= 3; L--) if (K.scan(P.table(L, 2, set), ['v0', 'u0'])) break;
    K.wall(K.any(), P.anvilBlock); K.wall(K.any(), P.barrel(2)); K.wall(K.any(), P.crate(2, null));
    K.wall(K.any(), P.brazier);
    K.sconces(5);
};

ROOMS.treasury = (K) => {
    const { P } = K;
    K.rug(K.u0 + 1, K.u1 - 1, K.v0 + 1, K.v1 - 1);
    // a great heap of gold in a corner first, then the strongboxes: iron and carved (the old four), then the rest
    K.wall(['u0', 'u1', 'v1'], P.coinPile(true), { pos: 'end' });
    const list = [];
    for (let i = 0; i < 4; i++) list.push({ at: K.ABcell(K.room.doorSide ? OPPOSITE[K.room.doorSide] : 'v1', 1 + i * 2, 2), look: i % 2 ? 'rich' : 'iron', flavor: null, room: 'treasury', scales: [3, 2.5, 2] });
    K.chests(list);
    K.wall(['u1', 'u0', 'v1'], P.coinPile(false), { pos: 'start' });
    K.wall(['v1', 'u0', 'u1'], P.coinPile(false), { pos: 'mid' });
    for (let i = 0; i < 3; i++) K.wall(K.any(), P.pedestal(i % 2 ? B.GOLD : B.LANTERN), { pos: i ? 'end' : 'start' });
    // a counting table with scales
    const set = (F, w, dp) => { F.put(0, 0, 0, 0, 2, 2, B.GOLD); F.put(w - 1, w - 1, 0, 0, 2, 2, B.POTION); F.put(Math.floor(w / 2), Math.floor(w / 2), dp - 1, dp - 1, 2, 2, B.BOOKS); };
    const t = K.wall(K.any(), P.table(3, 2, set), { pos: 'mid' });
    if (t) K.wall(K.any(), P.scales, { pos: 'mid' });
    K.wall(K.any(), P.cupboard(2), { pos: 'end' });
    K.sconces(4);
};

ROOMS.storeroom = (K) => {
    const { P } = K;
    K.chests([{ at: K.ABcell('v1', 2, 2), look: 'crate', flavor: 'food', room: 'storeroom', scales: [2.5, 2] }]);
    for (let i = 0; i < 3; i++) K.wall(K.any(), P.rack(3, 3), { pos: i ? 'end' : 'start' });
    for (let i = 0; i < 5; i++) K.wall(K.any(), P.barrel(i % 2 ? 1 : 2), { pos: i % 2 ? 'end' : 'start' });
    for (let i = 0; i < 4; i++) K.wall(K.any(), P.crate(i % 3 ? 1 : 2, i % 2 ? B.VEG : null), { pos: 'mid' });
    for (let i = 0; i < 3; i++) K.wall(K.any(), P.sacks, { pos: 'start' });
    K.wall(K.any(), P.hay, { pos: 'end' }); K.wall(K.any(), P.hay, { pos: 'end' });
    // hams and onions from the beams over a packing table
    K.wall(K.any(), P.table(3, 2, (F) => { P.hangFood(F, 1, 0); P.hangFood(F, 0, 1); F.put(0, 0, 0, 0, 2, 2, B.VEG); F.put(2, 2, 1, 1, 2, 2, B.POTION); }), { pos: 'mid' });
    for (let n = 0; n < 3; n++) for (const [w, dp] of [[3, 2], [2, 2], [2, 1]]) if (K.scan(P.stack(w, dp), ['v0', 'u0'])) break;
    K.wall(K.any(), P.lampStand, { pos: 'end' });
    K.sconces(5);
};

ROOMS.chapel = (K) => {
    const { P } = K;
    // the altar at the wall furthest from the way in, the pews in rows facing it, candles, a window of coloured glass
    const alongV = (K.v1 - K.v0) >= (K.u1 - K.u0);
    const altarWall = alongV ? 'v1' : (K.room.doorSide === 'u0' ? 'u1' : 'u0');
    const aw = K.wallLen(altarWall), ad = K.wallDepth(altarWall);
    const alt = K.wall(altarWall, P.altar, { pos: 'mid' });
    // a carpet along the middle, from the door to the altar
    const mid = Math.floor((aw - 3) / 2);
    const F0 = K.at0(altarWall, mid, 0, 0);
    const [ra, rb] = [F0.cell(0, 0), F0.cell(2, ad - 1)];
    K.env.box(Math.min(ra[0], rb[0]), Math.max(ra[0], rb[0]), K.l - 1, K.l - 1, Math.min(ra[1], rb[1]), Math.max(ra[1], rb[1]), K.rugC); K.decor();
    if (alt) {
        // pews: rows from d = 4 on, a block each side of the middle carpet (a seat and a back, the back away from the altar)
        const side = Math.max(2, Math.floor((aw - 3) / 2) - 1);
        for (let d = 4; d + 2 <= ad - 1; d += 3) {
            K.at(altarWall, 1, d, P.pew(side), { dir: 0, access: 0 });
            K.at(altarWall, aw - 1 - side, d, P.pew(side), { dir: 0, access: 0 });
        }
        K.at(altarWall, mid + 3, 2, P.lectern, {});
    }
    K.wall(K.any(), P.vitrage, { pos: 'mid' }); K.wall(K.any(), P.vitrage, { pos: 'start' });
    K.wall(K.any(), P.lampStand, { pos: 'start' }); K.wall(K.any(), P.lampStand, { pos: 'end' });
    K.wall(K.any(), P.cupboard(2), { pos: 'end' });
    K.sconces(5);
    K.chandelier(K.cu, K.cv);
};

ROOMS.library = (K) => {
    const { P } = K;
    K.rug(K.u0 + 2, K.u1 - 2, K.v0 + 2, K.v1 - 2, true, true);
    // shelves of books to the ceiling along the walls, a ladder, reading tables with benches and lamps, a lectern
    for (const wl of WALLS) {
        let n = 0;
        while (n < 4 && K.wall(wl, P.bookshelf(3, 5), { pos: 'start' })) n++;
    }
    K.wall(K.any(), P.ladder, { pos: 'mid' });
    const set = (F, w, dp) => { F.put(0, 0, 0, 0, 2, 2, B.BOOKS); F.put(w - 1, w - 1, 0, 0, 2, 2, B.LANTERN); F.put(Math.floor(w / 2), Math.floor(w / 2), dp - 1, dp - 1, 2, 2, B.CLOTH_WHITE); };
    for (let n = 0; n < 2; n++) for (let L = 5; L >= 3; L--) if (K.scan(P.set(L, 2, set), ['v0', 'u0'])) break;
    K.wall(K.any(), P.lectern, { pos: 'end' });
    K.wall(K.any(), P.armchair, { pos: 'mid' });
    K.wall(K.any(), P.lampStand, { pos: 'end' });
    K.drapes();
    K.chandelier(K.cu, K.cv);
    K.sconces(5);
};

ROOMS.gallery = (K) => {
    const { P } = K;
    K.rug(K.u0 + 1, K.u1 - 1, K.v0 + 1, K.v1 - 1);
    for (const wl of WALLS) { for (let n = 0; n < 4; n++) { if (!K.wall(wl, P.portrait, { pos: n % 2 ? 'end' : 'start' })) break; } }
    for (let i = 0; i < 4; i++) K.wall(K.any(), P.statue(i % 2 === 1), { pos: i % 2 ? 'start' : 'end' });
    for (let i = 0; i < 3; i++) K.wall(K.any(), P.bench(3), { pos: 'mid' });
    K.wall(K.any(), P.armorStand, { pos: 'start' }); K.wall(K.any(), P.armorStand, { pos: 'end' });
    K.wall(K.any(), P.lampStand, { pos: 'mid' });
    K.drapes();
    K.chandelier(K.cu, K.cv);
    K.sconces(5);
};

ROOMS.barracks = (K) => {
    const { P } = K;
    // (the bunks and the mats by them are the knights' — the rows they lie in are not touched; what is left: the east wall, the way in, the ends)
    K.chests([{ at: K.ABcell('u1', 6, 1), look: 'crate', flavor: 'arms', room: 'barracks', scales: [2, 1.6] }]); // (the soldiers' footlocker: one — the castle's chests are counted: 5–10 more than before)
    // the table with the map of the lands, stools round it
    const map = (F, w, dp) => { F.slab(0, w - 1, 0, dp - 1, 2, B.CLOTH_YELLOW); F.put(0, 0, 0, 0, 3, 3, B.LANTERN); F.put(w - 1, w - 1, dp - 1, dp - 1, 3, 3, B.GOLD); F.put(1, 1, 1, 1, 3, 3, B.CS_DARK); };
    for (let L = 4; L >= 3; L--) if (K.scan(P.table(L, 2, map), ['v0', 'u0'])) break;
    K.wall(K.any(), P.spearRack(3), { pos: 'start' }); K.wall(K.any(), P.shieldRack(3), { pos: 'end' }); K.wall(K.any(), P.swordRack(3), { pos: 'mid' });
    K.wall(K.any(), P.barrel(2), { pos: 'start' }); K.wall(K.any(), P.barrel(1), { pos: 'start' });
    K.wall(K.any(), P.armorStand, { pos: 'start' }); K.wall(K.any(), P.armorStand, { pos: 'end' });
    K.wall(K.any(), P.bench(3), { pos: 'start' });
    K.wall(K.any(), P.stool, { pos: 'mid' }); K.wall(K.any(), P.stool, { pos: 'end' });
    K.wall(K.any(), P.lampStand, { pos: 'end' });
};

// ---------------------------------------------------------------------------------------------- the villagers' homes
// (generation 14, HOUSE_SIZE_FROM_GEN — Castles.buildHouseBig: roomy homes, the rich in two floors with a stair). The rooms of a home are
// seen from its door: `room.doorSide` is the wall the way in is in, the far wall is across from it.
const SIDE_WALLS = { u0: ['v0', 'v1'], u1: ['v0', 'v1'], v0: ['u0', 'u1'], v1: ['u0', 'u1'] };
function homeWalls(K) {
    const door = K.room.doorSide || 'v0';
    return { door, far: OPPOSITE[door], side: SIDE_WALLS[door] };
}
/** A bed on the first of the walls that takes it (a room narrow for a bed across keeps it along its long wall). */
function homeBed(K, walls, pos) {
    for (const wl of walls) { const b = bed(K, wl, pos); if (b) return b; }
    return null;
}

/** A poor home: ONE room (11 × 9 and more) — the beds at the far wall, the fire in a side wall with a seat, a table with benches, the cupboards and barrels, chests. */
ROOMS.homeMain = (K) => {
    const { P, room } = K;
    const { far, side } = homeWalls(K);
    K.rug(K.cu - 2, K.cu + 2, K.cv - 2, K.cv + 2, true, false);
    const nBeds = room.nBeds || 1;
    const b1 = homeBed(K, [far, ...side], 'start'); stands(K, b1);
    const b2 = nBeds > 1 ? homeBed(K, [far, ...side], 'end') : null; stands(K, b2);
    if (nBeds > 2) { const b3 = homeBed(K, side, 'mid'); stands(K, b3); }
    if (b1) footChest(K, b1, 2, { look: 'plain', room: 'home', flavor: 'clothes' });
    const fw = K.chance(0.5) ? side[0] : side[1];
    const fire = K.wall(fw, P.fireplace(5), { pos: 'mid' }) || K.wall(side, P.fireplace(5), { pos: 'mid' });
    if (fire) K.stat.chimney = [1, 2, 3].map((a) => fire.F.cell(a, 0)); // (the stack through the roof, as wide as the breast: Castles.buildHouseBig)
    if (fire) K.seat(fire.wall, fire.a + 2, 2, 0, -1, P.armchair1, { loose: true }) || K.seat(fire.wall, fire.a + 2, 2, 0, -1, P.stool, { loose: true });
    K.chests([{ at: K.ABcell(far, 2, 2), look: 'plain', flavor: 'clothes', room: 'home', scales: [2] }, { at: K.ABcell(side[0], 2, 2), look: 'plain', flavor: 'food', room: 'home', scales: [2] }]);
    const set = (F, w, dp) => { P.tableware(F, w, dp); for (let a = 1; a < w - 1; a += 3) P.hangFood(F, a, 1); };
    for (let L = 7; L >= 3; L--) if (K.scan(P.set(L, 2, set), ['v0', 'u0'])) break;
    K.wall(K.any(), P.cupboard(3)); K.wall(K.any(), P.cupboard(2), { pos: 'end' });
    K.wall(K.any(), P.rack(2, 3), { pos: 'mid' });
    for (let i = 0; i < 3; i++) K.wall(K.any(), P.barrel(i % 2 ? 1 : 2), { pos: i % 2 ? 'end' : 'start' });
    K.wall(K.any(), P.crate(1, B.VEG)); K.wall(K.any(), P.sacks); K.wall(K.any(), P.lampStand, { pos: 'end' });
    K.sconces(5);
};

/** A rich home's ground room: a rug, the fire with armchairs, a long table with benches and high chairs, shelves, a dresser, tapestries and a chandelier. */
ROOMS.homeLiving = (K) => {
    const { P } = K;
    const { far, side } = homeWalls(K);
    K.rug(K.u0 + 1, K.u1 - 1, K.v0 + 1, K.v1 - 1, true, true);
    const fire = K.wall(far, P.fireplace(5), { pos: 'mid' }) || K.wall(side, P.fireplace(5), { pos: 'mid' });
    if (fire) K.stat.chimney = [1, 2, 3].map((a) => fire.F.cell(a, 0));
    // the family's chests first (they need a stretch of wall and room before the lid), then the rest
    K.chests([
        { at: K.ABcell(side[0], 2, 2), look: 'painted', flavor: 'clothes', room: 'home', scales: [2] },
        { at: K.ABcell(side[1], 2, 2), look: 'plain', flavor: 'scrolls', room: 'home', scales: [2] },
        { at: K.ABcell(far, 2, 2), look: 'plain', flavor: 'food', room: 'home', scales: [2] },
    ]);
    if (fire) {
        for (const a of [fire.a, fire.a + 4]) K.seat(fire.wall, a, 2, 0, -1, P.armchair, { loose: true }) || K.seat(fire.wall, a, 2, 0, -1, P.armchair1, { loose: true });
        K.at(fire.wall, fire.a + 2, 2, P.table(1, 1, (F) => F.put(0, 0, 0, 0, 2, 2, K.pick([B.POTION, B.FLOWERS, B.LANTERN]))), { access: 0, loose: true });
    }
    const set = (F, w, dp) => { P.tableware(F, w, dp); };
    for (let L = 6; L >= 3; L--) if (K.scan(P.set(L, 2, set, { chairs: false, cloth: true }), ['v0', 'u0'])) break;
    K.wall([...side, far], P.bookshelf(3, 4), { pos: 'start' }); K.wall([...side, far], P.bookshelf(2, 3), { pos: 'end' });
    K.wall(K.any(), P.dresser(true), { pos: 'mid' });
    K.wall(K.any(), P.cupboard(2), { pos: 'end' });
    K.wall(K.any(), P.lampStand, { pos: 'start' }); K.wall(K.any(), P.lampStand, { pos: 'end' });
    K.wall(K.any(), P.portrait, { pos: 'mid' });
    for (const wl of WALLS) K.tapestry(wl, 2, 'mid');
    K.chandelier(K.cu, K.cv);
    K.sconces(5);
};

/** A rich home's kitchen: the big fire with a crane, work tables with food and hanging onions, cupboards, racks, barrels and crates. */
ROOMS.homeKitchen = (K) => {
    const { P } = K;
    const { far, side } = homeWalls(K);
    const fire = K.wall(far, P.fireplace(5, true), { pos: 'mid' }) || K.wall(side, P.fireplace(5, true), { pos: 'mid' });
    if (fire) K.stat.chimney = [1, 2, 3].map((a) => fire.F.cell(a, 0));
    K.chests([{ at: K.ABcell(far, 1, 3), look: 'crate', flavor: 'food', room: 'kitchen', scales: [2] }]);
    const tbl = (F, w, dp) => { P.tableware(F, w, dp); for (let a = 1; a < w - 1; a += 2) P.hangFood(F, a, 0); };
    for (let n = 0; n < 2; n++) for (let L = 5; L >= 3; L--) if (K.scan(P.table(L, 2, tbl), ['v0', 'u0'], { access: 1 })) break;
    K.wall(K.any(), P.cupboard(3)); K.wall(K.any(), P.cupboard(2)); K.wall(K.any(), P.rack(3, 3));
    for (let i = 0; i < 4; i++) K.wall(K.any(), P.barrel(i % 2 ? 1 : 2), { pos: i % 2 ? 'end' : 'start' });
    for (let i = 0; i < 3; i++) K.wall(K.any(), P.crate(i ? 2 : 1, B.VEG), { pos: 'mid' });
    K.wall(K.any(), P.sacks); K.wall(K.any(), P.stump);
    K.wall(K.any(), P.lampStand, { pos: 'end' });
    K.sconces(5);
};

/** A rich home's bedroom upstairs: a rug, a bed (two in a big one) with stands and a chest at its foot, a wardrobe, a dresser, a desk, shelves, curtains. */
ROOMS.homeBedroom = (K) => {
    const { P, room } = K;
    const { far, side, door } = homeWalls(K);
    K.rug(K.u0 + 1, K.u1 - 1, K.v0 + 1, K.v1 - 1);
    // (the beds' heads at the two walls beside the door wall — a long narrow room keeps them at its ends, far apart, each with a way to its side)
    const walls = [far, ...side.filter((w) => w !== door)];
    const b1 = homeBed(K, [side[0], ...walls], 'start'); stands(K, b1);
    const b2 = (room.nBeds || 1) > 1 ? homeBed(K, [side[1], ...walls], 'start') : null; stands(K, b2);
    if (b1) footChest(K, b1, 2, { look: 'painted', room: 'bedroom', flavor: 'clothes' });
    K.chests([{ at: K.ABcell(walls[0] || far, 2, 2), look: 'plain', flavor: 'clothes', room: 'bedroom', scales: [2] }]);
    K.wall(K.any(), P.wardrobe, { pos: 'end' });
    K.wall(K.any(), P.dresser(false), { pos: 'start' });
    const desk = K.wall(K.any(), P.table(2, 2, (F) => { F.put(0, 0, 0, 0, 2, 2, B.BOOKS); F.put(1, 1, 0, 0, 2, 2, B.LANTERN); }), { pos: 'mid' });
    if (desk) K.seat(desk.wall, desk.a, 2, 0, -1, P.chair);
    K.wall(K.any(), P.bookshelf(2, 3), { pos: 'mid' });
    K.wall(K.any(), P.lampStand, { pos: 'start' });
    K.wall(K.any(), P.armchair, { pos: 'end' });
    for (const wl of WALLS) K.tapestry(wl, 2, 'mid');
    K.chandelier(K.cu, K.cv);
    K.sconces(5);
};

/** How many things a room of each kind has at the least (a thing counts once; a table with its benches three): topUp fills up to it. */
export const MIN_ITEMS = { kitchen: 14, dining: 12, armoury: 14, treasury: 8, storeroom: 18, chapel: 12, library: 16, bedroom: 10, king: 14, guardroom: 14, gallery: 12, barracks: 6, generic: 6, homeMain: 12, homeLiving: 9, homeKitchen: 11, homeBedroom: 8 };
/** Fills a room that is still thin with plain things for its kind (never empty). */
function topUp(K) {
    const min = MIN_ITEMS[K.room.kind] ?? 6;
    const fillers = [K.P.barrel(1), K.P.crate(1), K.P.lampStand, K.P.cupboard(2), K.P.bench(3), K.P.sacks, K.P.stool];
    const tries = /^home/.test(K.room.kind) ? 12 : 40; // (a villager's home that cannot be filled further is not tried for long: the castle's plan is made in a frame's time)
    for (let i = 0; i < tries && K.stat.items < min; i++) K.wall(K.any(), fillers[i % fillers.length], { pos: i % 2 ? 'end' : 'start' });
}
