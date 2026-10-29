/**
 * GhostRooms.js — the gloomy furniture of the Castle of Ghosts' rooms (GhostBuild.js lays the rooms out; GhostKit.js has the pieces).
 *
 * In the manner of CastleFurniture.js (furniture by the room's purpose, from the world's blocks, passages ≥ 3 blocks), but gloomy:
 * dust sheets over the furniture, cobwebs in the corners, torn drapes, cold hearths with pale embers, mirrors that glow, portraits,
 * candles and candelabras (loose props a ghost moves — drawn by another system), chandeliers hung only from solid ceilings.
 *
 * Every piece is put through `GhostRoom.put`: a footprint on the room's floor grid that is accepted only while every doorway and the
 * room's middle stay joined by a way 3 blocks wide (a flood over the cells whose 3 × 3 is free). So no furniture ever closes a passage.
 * Chairs and stools (props) take their cell on the grid too. Measures (CLAUDE.md): a table 2 m high, a seat 1 m, a bed under a canopy
 * 4 × 6, a wardrobe 5 m high, nothing hanging lower than 5 layers over a free floor.
 */
import { BLOCK } from './Terrain.js';

const CLOTHS = () => [BLOCK.CARPET_RED, BLOCK.CARPET_PURPLE, BLOCK.CARPET_BLUE, BLOCK.CARPET_GREEN, BLOCK.CLOTH_YELLOW];

/** A room's floor grid: the local interior u0..u1 × v0..v1 standing on layer l − 1 with h free layers (ceiling at l + h). */
export class GhostRoom {
    constructor(K, id, kind, name, u0, u1, v0, v1, l, h, { record = true } = {}) {
        Object.assign(this, { K, id, kind, name, u0, u1, v0, v1, l, h });
        this.W = u1 - u0 + 1; this.D = v1 - v0 + 1;
        this.occ = new Uint8Array(this.W * this.D);
        this.keys = []; // cells that must stay joined (doors' second rows, the middle)
        this.doors = [];
        if (record) K.room(id, kind, name, u0, u1, v0, v1, l, h);
        this.lc = l + h; // (the ceiling's lowest solid layer)
        this.cu = Math.round((u0 + u1) / 2); this.cv = Math.round((v0 + v1) / 2);
    }

    in(u, v) { return u >= this.u0 && u <= this.u1 && v >= this.v0 && v <= this.v1; }
    at(u, v) { return (v - this.v0) * this.W + (u - this.u0); }
    isFree(u, v) { return this.in(u, v) && !this.occ[this.at(u, v)]; }

    /** A doorway in a wall of the room, its middle cell (u, v) on the wall (or just outside the interior). */
    addDoor(u, v) {
        const cu = Math.max(this.u0, Math.min(this.u1, u)), cv = Math.max(this.v0, Math.min(this.v1, v));
        // the second row in from that wall (its 3 × 3 lies inside the room)
        const ku = cu === this.u0 && u < this.u0 ? cu + 1 : cu === this.u1 && u > this.u1 ? cu - 1 : Math.max(this.u0 + 1, Math.min(this.u1 - 1, cu));
        const kv = cv === this.v0 && v < this.v0 ? cv + 1 : cv === this.v1 && v > this.v1 ? cv - 1 : Math.max(this.v0 + 1, Math.min(this.v1 - 1, cv));
        this.doors.push({ u, v, cu, cv });
        this.keys.push([ku, kv]);
        // the doorway's own approach: 3 wide, 3 deep, never furnished
        for (let a = -1; a <= 1; a++) for (let d = 0; d <= 2; d++) {
            const uu = u < this.u0 ? this.u0 + d : u > this.u1 ? this.u1 - d : cu + a;
            const vv = v < this.v0 ? this.v0 + d : v > this.v1 ? this.v1 - d : cv + a;
            const u2 = (u < this.u0 || u > this.u1) ? uu : cu + a, v2 = (v < this.v0 || v > this.v1) ? vv : cv + a;
            if (this.in(u2, v2)) this.occ[this.at(u2, v2)] = 2;
        }
        this.K.door(u, v, this.l, this.id);
        return this;
    }

    /** Keep a rectangle free (an aisle, a stair's foot). */
    keep(u0, u1, v0, v1) { for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) if (this.in(u, v)) this.occ[this.at(u, v)] = 2; }
    key(u, v) { this.keys.push([u, v]); }

    /** Is a footprint free (inside, nothing on it)? */
    fits(u0, u1, v0, v1) {
        if (u1 < u0) [u0, u1] = [u1, u0];
        if (v1 < v0) [v0, v1] = [v1, v0];
        for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) if (!this.isFree(u, v)) return false;
        return true;
    }

    /** The cells whose 3 × 3 is free, flooded from the first key: do all keys meet? */
    joined() {
        if (this.keys.length < 2) return true;
        const W = this.W, D = this.D, wide = new Uint8Array(W * D), seen = new Uint8Array(W * D);
        for (let v = this.v0 + 1; v < this.v1; v++) for (let u = this.u0 + 1; u < this.u1; u++) {
            let ok = true;
            for (let dv = -1; dv <= 1 && ok; dv++) for (let du = -1; du <= 1; du++) if (this.occ[this.at(u + du, v + dv)] === 1) { ok = false; break; }
            if (ok) wide[this.at(u, v)] = 1;
        }
        const [su, sv] = this.keys[0];
        if (!this.in(su, sv) || !wide[this.at(su, sv)]) return false;
        const st = [this.at(su, sv)]; seen[st[0]] = 1;
        while (st.length) {
            const i = st.pop(), u = i % W, v = (i - u) / W;
            for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const uu = u + du, vv = v + dv;
                if (uu < 0 || vv < 0 || uu >= W || vv >= D) continue;
                const j = vv * W + uu;
                if (wide[j] && !seen[j]) { seen[j] = 1; st.push(j); }
            }
        }
        return this.keys.every(([u, v]) => this.in(u, v) && seen[this.at(u, v)]);
    }

    /** Take a footprint for a piece: only when it is free and the room stays passable; then lay it (fn). */
    put(u0, u1, v0, v1, fn) {
        if (u1 < u0) [u0, u1] = [u1, u0];
        if (v1 < v0) [v0, v1] = [v1, v0];
        if (!this.fits(u0, u1, v0, v1)) return false;
        for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) this.occ[this.at(u, v)] = 1;
        if (!this.joined()) { for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) this.occ[this.at(u, v)] = 0; return false; }
        if (fn) fn();
        return true;
    }

    /** Places along the walls for a piece `w` long, `d` deep: [{u0, u1, v0, v1, nu, nv, cu, cv}] (nu, nv into the room), every `step`. */
    alongWalls(w, d, step = 1) {
        const out = [];
        for (let u = this.u0; u + w - 1 <= this.u1; u += step) {
            out.push({ u0: u, u1: u + w - 1, v0: this.v0, v1: this.v0 + d - 1, nu: 0, nv: 1, cu: u + (w >> 1), cv: this.v0 });
            out.push({ u0: u, u1: u + w - 1, v0: this.v1 - d + 1, v1: this.v1, nu: 0, nv: -1, cu: u + (w >> 1), cv: this.v1 });
        }
        for (let v = this.v0; v + w - 1 <= this.v1; v += step) {
            out.push({ u0: this.u0, u1: this.u0 + d - 1, v0: v, v1: v + w - 1, nu: 1, nv: 0, cu: this.u0, cv: v + (w >> 1) });
            out.push({ u0: this.u1 - d + 1, u1: this.u1, v0: v, v1: v + w - 1, nu: -1, nv: 0, cu: this.u1, cv: v + (w >> 1) });
        }
        return out;
    }

    /** A wall slot for a flush piece (portrait, mirror, banner) w wide: cells on the room's edge, away from doors. */
    wallSlots(w, gap = 2) {
        const out = [];
        const nearDoor = (u, v) => this.doors.some((d) => Math.abs(d.cu - u) + Math.abs(d.cv - v) <= 2 + (w >> 1));
        for (let u = this.u0 + gap + (w >> 1); u <= this.u1 - gap - (w >> 1); u += w + gap) {
            if (!nearDoor(u, this.v0)) out.push({ u, v: this.v0, nu: 0, nv: 1 });
            if (!nearDoor(u, this.v1)) out.push({ u, v: this.v1, nu: 0, nv: -1 });
        }
        for (let v = this.v0 + gap + (w >> 1); v <= this.v1 - gap - (w >> 1); v += w + gap) {
            if (!nearDoor(this.u0, v)) out.push({ u: this.u0, v, nu: 1, nv: 0 });
            if (!nearDoor(this.u1, v)) out.push({ u: this.u1, v, nu: -1, nv: 0 });
        }
        return out;
    }

    /** Ghost spots: the middle (or the nearest wide cell), corners behind which a ghost lurks. */
    spots(n = 3) {
        const K = this.K, got = [];
        const ok = (u, v) => {
            if (!this.in(u, v) || this.occ[this.at(u, v)] === 1) return false;
            for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) if (this.in(u + du, v + dv) && this.occ[this.at(u + du, v + dv)] === 1) return false;
            return !got.some(([a, b]) => Math.abs(a - u) + Math.abs(b - v) < 4);
        };
        const tryAt = (u, v) => { if (ok(u, v)) { got.push([u, v]); K.spot(u, v, this.l, this.id); return true; } return false; };
        // the middle, or near it
        let done = false;
        for (let r = 0; r < 6 && !done; r++) for (let dv = -r; dv <= r && !done; dv++) for (let du = -r; du <= r && !done; du++) if (Math.max(Math.abs(du), Math.abs(dv)) === r) done = tryAt(this.cu + du, this.cv + dv);
        const cs = [[this.u0 + 1, this.v0 + 1], [this.u1 - 1, this.v1 - 1], [this.u1 - 1, this.v0 + 1], [this.u0 + 1, this.v1 - 1]];
        for (const [u, v] of cs) { if (got.length >= n) break; if (!tryAt(u, v)) tryAt(u + Math.sign(this.cu - u), v + Math.sign(this.cv - v)); }
        return got;
    }

    /** Fill a rectangle of the floor (layer l − 1) with a rug, its border another cloth. */
    rug(u0, u1, v0, v1, t, border) {
        const p = this.K.p;
        p.box(u0, u1, this.l - 1, this.l - 1, v0, v1, border || t);
        if (border && u1 - u0 >= 2 && v1 - v0 >= 2) p.box(u0 + 1, u1 - 1, this.l - 1, this.l - 1, v0 + 1, v1 - 1, t);
    }

    /** The floor: black tiles with a stone border, an inlaid cross of brick in big rooms; ribs of brick across the ceiling. */
    floor({ tile = BLOCK.GHOST_TILE, ribs = true } = {}) {
        const p = this.K.p, B = BLOCK, l = this.l;
        p.box(this.u0, this.u1, l - 1, l - 1, this.v0, this.v1, B.GHOST_STONE);
        if (this.W > 4 && this.D > 4) p.box(this.u0 + 1, this.u1 - 1, l - 1, l - 1, this.v0 + 1, this.v1 - 1, tile);
        if (this.W >= 11 && this.D >= 11) {
            p.box(this.cu, this.cu, l - 1, l - 1, this.v0 + 2, this.v1 - 2, B.GHOST_STONE);
            p.box(this.u0 + 2, this.u1 - 2, l - 1, l - 1, this.cv, this.cv, B.GHOST_STONE);
            p.box(this.cu, this.cu, l - 1, l - 1, this.cv, this.cv, B.GHOST_LAMP); // (a pale stone at the cross's heart)
        }
        if (ribs && this.W >= 7) {
            for (let v = this.v0 + 3; v <= this.v1 - 3; v += 6) p.box(this.u0, this.u1, this.lc, this.lc, v, v, B.GHOST_BRICK);
        }
    }
}

// ----------------------------------------------------------------- pieces (blocks)
function table(K, R, u0, u1, v0, v1) {
    const p = K.p, B = BLOCK, l = R.l;
    p.box(u0, u1, l + 1, l + 1, v0, v1, B.PLANKS_DARK);
    for (const u of [u0, u1]) for (const v of [v0, v1]) p.box(u, u, l, l, v, v, B.FENCE);
}
function sheet(K, R, u0, u1, v0, v1, h) { K.p.box(u0, u1, R.l, R.l + h - 1, v0, v1, BLOCK.CLOTH_WHITE); } // (furniture under a dust sheet)
/** The cell of a wall piece's face (the side towards the room), at the middle. */
function faceOf(s) { return s.nv === 1 ? [s.cu, s.v1] : s.nv === -1 ? [s.cu, s.v0] : s.nu === 1 ? [s.u1, s.cv] : [s.u0, s.cv]; }
function wardrobe(K, R, s) {
    const p = K.p, B = BLOCK, l = R.l;
    p.box(s.u0, s.u1, l, l + 4, s.v0, s.v1, B.PLANKS_DARK);
    const [fu, fv] = faceOf(s);
    p.box(fu, fu, l + 2, l + 2, fv, fv, B.GOLD); // (the knob)
    p.box(fu, fu, l + 4, l + 4, fv, fv, B.CLOTH_WHITE); // (a dust sheet thrown over its top)
}
function shelf(K, R, s, books = true) {
    const p = K.p, B = BLOCK, l = R.l;
    p.box(s.u0, s.u1, l, l + 4, s.v0, s.v1, books ? B.BOOKS : B.PLANKS_DARK);
    p.box(s.u0, s.u1, l + 5, l + 5, s.v0, s.v1, B.PLANKS_DARK);
    if (R.h > 6) p.box(s.u0, s.u1, l + 6, R.lc - 1, s.v0, s.v1, B.PLANKS_DARK); // (up to the ceiling: it rests on nothing else)
}
function bed(K, R, s, cover) {
    // s: 4 wide along the wall, 6 deep into the room; the headboard at the wall
    const p = K.p, B = BLOCK, l = R.l;
    p.box(s.u0, s.u1, l, l, s.v0, s.v1, B.PLANKS_DARK);
    p.box(s.u0, s.u1, l + 1, l + 1, s.v0, s.v1, cover);
    // the pillows at the head (by the wall)
    const hu0 = s.nu === 1 ? s.u0 : s.nu === -1 ? s.u1 : s.u0, hu1 = s.nu === 1 ? s.u0 : s.nu === -1 ? s.u1 : s.u1;
    const hv0 = s.nv === 1 ? s.v0 : s.nv === -1 ? s.v1 : s.v0, hv1 = s.nv === 1 ? s.v0 : s.nv === -1 ? s.v1 : s.v1;
    p.box(hu0, hu1, l + 1, l + 1, hv0, hv1, B.CLOTH_WHITE);
    p.box(hu0, hu1, l + 2, l + 3, hv0, hv1, B.PLANKS_DARK); // (the headboard)
    // the canopy on four posts, torn curtains
    if (R.h >= 7) {
        const top = Math.min(R.lc - 1, l + 6);
        for (const u of [s.u0, s.u1]) for (const v of [s.v0, s.v1]) p.box(u, u, l + 1, top - 1, v, v, B.FENCE);
        p.box(s.u0, s.u1, top, top, s.v0, s.v1, cover);
        if (s.nv) { p.box(s.u0, s.u0, l + 4, top - 1, s.v0 + 1, s.v1 - 1, cover); } else { p.box(s.u0 + 1, s.u1 - 1, l + 4, top - 1, s.v0, s.v0, cover); } // (a torn curtain left on one side)
    }
}
function harp(K, R, u, v, nu, nv) {
    const p = K.p, B = BLOCK, l = R.l;
    const su = nv ? 1 : 0, sv = nu ? 1 : 0; // (along the wall)
    p.box(u, u, l, l + 4, v, v, B.GOLD); // (the pillar)
    p.box(Math.min(u, u + 2 * su), Math.max(u, u + 2 * su), l, l, Math.min(v, v + 2 * sv), Math.max(v, v + 2 * sv), B.GOLD); // (the sound box)
    p.box(u + su, u + su, l + 3, l + 4, v + sv, v + sv, B.GOLD); // (the neck)
    p.box(u + 2 * su, u + 2 * su, l + 1, l + 2, v + 2 * sv, v + 2 * sv, B.GOLD);
    p.box(u + su, u + su, l + 1, l + 2, v + sv, v + sv, B.CLOTH_WHITE); // (the strings: pale)
}
function piano(K, R, s) {
    const p = K.p, B = BLOCK, l = R.l;
    p.box(s.u0, s.u1, l, l + 1, s.v0, s.v1, B.PLANKS_DARK);
    // the keys along the room side, the raised lid by the wall
    if (s.nv) { const kv = s.nv === 1 ? s.v1 : s.v0; p.box(s.u0, s.u1, l + 1, l + 1, kv, kv, B.CS_WHITE); const lv = s.nv === 1 ? s.v0 : s.v1; p.box(s.u0, s.u1, l + 2, l + 3, lv, lv, B.PLANKS_DARK); }
    else { const ku = s.nu === 1 ? s.u1 : s.u0; p.box(ku, ku, l + 1, l + 1, s.v0, s.v1, B.CS_WHITE); const lu = s.nu === 1 ? s.u0 : s.u1; p.box(lu, lu, l + 2, l + 3, s.v0, s.v1, B.PLANKS_DARK); }
}
function clock(K, R, u, v) {
    const p = K.p, B = BLOCK, l = R.l;
    p.box(u, u, l, l + 4, v, v, B.PLANKS_DARK);
    p.box(u, u, l + 3, l + 3, v, v, B.GOLD); // (the stopped face)
}
function crate(K, R, u0, u1, v0, v1, h, t) { K.p.box(u0, u1, R.l, R.l + h - 1, v0, v1, t); }
function barrel(K, R, u, v, standing = true) {
    const p = K.p, B = BLOCK, l = R.l;
    p.box(u, u + 1, l, l + 1, v, v + 1, B.PLANKS);
    p.box(u, u + 1, l + (standing ? 1 : 0), l + (standing ? 1 : 0), v, v + 1, B.PLANKS_DARK); // (the hoop)
}
function armour(K, R, u, v) {
    const p = K.p, B = BLOCK, l = R.l;
    p.box(u, u, l, l, v, v, B.GHOST_BRICK);
    p.box(u, u, l + 1, l + 3, v, v, B.CS_DARK);
    p.box(u, u, l + 4, l + 4, v, v, B.GOLD); // (the helm)
}

// ----------------------------------------------------------------- furnishing by kind
/** Gloom common to every room: cobwebs in the upper corners, a few candles on the floor, mirrors and portraits. */
function gloom(K, R, { webs = 2, portraits = 0, mirrors = 0, banners = 0, chandeliers = 0, lamps = 2 } = {}) {
    const corners = [[R.u0, R.v0, 1, 1], [R.u1, R.v1, -1, -1], [R.u1, R.v0, -1, 1], [R.u0, R.v1, 1, -1]];
    for (let i = 0; i < Math.min(webs, 4); i++) { const [u, v, du, dv] = corners[(i + K.ri(0, 3)) % 4]; K.cobweb(u, v, du, dv, R.lc); }
    const slots = R.wallSlots(5, 3);
    let si = K.ri(0, 3);
    const take = () => { if (!slots.length) return null; si = (si + 1 + K.ri(0, 1)) % slots.length; return slots.splice(si, 1)[0]; };
    for (let i = 0; i < portraits; i++) { const s = take(); if (s) K.portrait(s.u, s.v, s.nu, s.nv, R.l + 1, K.pick(CLOTHS())); }
    for (let i = 0; i < mirrors; i++) { const s = take(); if (s) K.mirror(s.u, s.v, s.nu, s.nv, R.l + 1, 2, Math.min(4, R.h - 3)); }
    for (let i = 0; i < banners; i++) { const s = take(); if (s) K.banner(s.u, s.v, s.nu, s.nv, R.l + 2, Math.min(R.lc - 2, R.l + 9), K.pick([BLOCK.CARPET_PURPLE, BLOCK.CARPET_RED, BLOCK.ARCANE_DARK])); }
    for (let i = 0; i < lamps; i++) { const s = take(); if (s) K.lampNiche(s.u, s.v, s.nu, s.nv, R.l + 3); }
    if (chandeliers) {
        const along = R.W >= R.D;
        for (let i = 0; i < chandeliers; i++) {
            const f = (i + 1) / (chandeliers + 1);
            const u = along ? Math.round(R.u0 + f * (R.W - 1)) : R.cu, v = along ? R.cv : Math.round(R.v0 + f * (R.D - 1));
            const chain = Math.max(0, R.h - 7);
            K.chandelier(u, v, R.lc, chain, R.W >= 12 && R.D >= 12);
        }
    }
}

/** Candles and candelabras on a piece's top (layer lTop) at its cells. */
function candlesOn(K, cells, lTop, n = 2) {
    for (let i = 0; i < n && cells.length; i++) {
        const j = K.ri(0, cells.length - 1);
        const [u, v] = cells.splice(j, 1)[0];
        K.prop(K.rng() < 0.3 ? 'candelabra' : 'candle', u, v, lTop, 0, -1);
    }
}

/** Chairs (props) round a table's footprint, facing it — each takes its cell on the room grid. */
function chairsRound(K, R, u0, u1, v0, v1, step = 2) {
    let n = 0;
    for (let u = u0; u <= u1; u += step) {
        if (R.put(u, u, v0 - 1, v0 - 1)) { K.prop('chair', u, v0 - 1, R.l - 1, 0, 1); n++; }
        if (R.put(u, u, v1 + 1, v1 + 1)) { K.prop('chair', u, v1 + 1, R.l - 1, 0, -1); n++; }
    }
    for (let v = v0; v <= v1; v += step) {
        if (v1 - v0 < 4) break;
        if (R.put(u0 - 1, u0 - 1, v, v)) { K.prop('chair', u0 - 1, v, R.l - 1, 1, 0); n++; }
        if (R.put(u1 + 1, u1 + 1, v, v)) { K.prop('chair', u1 + 1, v, R.l - 1, -1, 0); n++; }
        break;
    }
    return n;
}

/** A long table down the middle of the room with its chairs, candles and candelabras on it. */
function longTable(K, R, margin = 4) {
    const along = R.W >= R.D;
    const len = Math.max(3, (along ? R.W : R.D) - 2 * margin - 2);
    const u0 = along ? R.cu - (len >> 1) : R.cu - 1, u1 = along ? u0 + len - 1 : R.cu + 1;
    const v0 = along ? R.cv - 1 : R.cv - (len >> 1), v1 = along ? R.cv + 1 : v0 + len - 1;
    // the table, then its chairs (a chair stays only where the room keeps its 3-wide ways)
    if (!R.put(u0 - 1, u1 + 1, v0 - 1, v1 + 1)) return false;
    // free the ring round it again, and seat chairs into it one by one
    for (let v = v0 - 1; v <= v1 + 1; v++) for (let u = u0 - 1; u <= u1 + 1; u++) if (u < u0 || u > u1 || v < v0 || v > v1) R.occ[R.at(u, v)] = 0;
    table(K, R, u0, u1, v0, v1);
    chairsRound(K, R, u0, u1, v0, v1, 2);
    const cells = []; for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) cells.push([u, v]);
    candlesOn(K, cells, R.l + 1, Math.min(6, 2 + (len >> 2)));
    return true;
}

/** Pieces along the walls: tries a list of makers [w, d, fn(slot)] at random wall places. */
function againstWalls(K, R, list, tries = 40) {
    let n = 0;
    for (const [w, d, fn, want = 1] of list) {
        const slots = R.alongWalls(w, d, 1);
        let got = 0;
        for (let t = 0; t < tries && got < want && slots.length; t++) {
            const s = slots.splice(K.ri(0, slots.length - 1), 1)[0];
            if (R.put(s.u0, s.u1, s.v0, s.v1, () => fn(s))) { got++; n++; }
        }
    }
    return n;
}

/** Candelabras (props) in the room's free corners. */
function cornerLights(K, R, n = 2) {
    const cs = [[R.u0 + 1, R.v0 + 1], [R.u1 - 1, R.v1 - 1], [R.u1 - 1, R.v0 + 1], [R.u0 + 1, R.v1 - 1]];
    let got = 0;
    for (const [u, v] of cs) { if (got >= n) break; if (R.put(u, u, v, v)) { K.prop('candelabra', u, v, R.l - 1); got++; } }
}

const MAKERS = {
    dining(K, R) {
        longTable(K, R, 3);
        againstWalls(K, R, [[3, 1, (s) => { crate(K, R, s.u0, s.u1, s.v0, s.v1, 2, BLOCK.PLANKS_DARK); candlesOn(K, cellsOf(s), R.l + 1, 1); }, 2], [5, 2, (s) => K.hearth(s.cu, s.cv, s.nu, s.nv, R.l, R.lc), 1], [2, 2, (s) => sheet(K, R, s.u0, s.u1, s.v0, s.v1, 2), 1]]);
        gloom(K, R, { webs: 3, portraits: 3, chandeliers: 2, lamps: 2 });
        cornerLights(K, R, 2);
    },
    hall(K, R) { // the great hall: two long tables of benches, a cold hearth, banners, the lord's table
        const along = R.D >= R.W;
        for (const off of [-3, 3]) {
            const u0 = along ? R.cu + off - 1 : R.u0 + 4, u1 = along ? R.cu + off : R.u1 - 4;
            const v0 = along ? R.v0 + 5 : R.cv + off - 1, v1 = along ? R.v1 - 5 : R.cv + off;
            if (!(along ? R.W >= 12 : R.D >= 12)) break;
            if (R.put(u0, u1, v0, v1, () => table(K, R, u0, u1, v0, v1))) {
                const cells = []; for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) cells.push([u, v]);
                candlesOn(K, cells, R.l + 1, 4);
                for (let v = v0; v <= v1; v += 3) { const su = off < 0 ? u0 - 1 : u1 + 1; if (along && R.put(su, su, v, v)) K.prop('stool', su, v, R.l - 1, off < 0 ? 1 : -1, 0); }
            }
        }
        againstWalls(K, R, [[5, 2, (s) => K.hearth(s.cu, s.cv, s.nu, s.nv, R.l, R.lc), 1], [2, 2, (s) => { barrel(K, R, s.u0, s.v0); }, 3], [1, 1, (s) => armour(K, R, s.u0, s.v0), 4]]);
        gloom(K, R, { webs: 4, banners: 6, portraits: 2, chandeliers: 3, lamps: 4 });
        cornerLights(K, R, 3);
    },
    kitchen(K, R) {
        againstWalls(K, R, [[5, 2, (s) => K.hearth(s.cu, s.cv, s.nu, s.nv, R.l, R.lc), 1], [3, 1, (s) => { shelf(K, R, s, false); K.p.box(s.u0, s.u1, R.l + 2, R.l + 2, s.v0, s.v1, BLOCK.POTION); }, 2], [2, 2, (s) => barrel(K, R, s.u0, s.v0), 3], [3, 2, (s) => { table(K, R, s.u0, s.u1, s.v0, s.v1); candlesOn(K, cellsOf(s), R.l + 1, 1); }, 2]]);
        if (R.W >= 9 && R.D >= 9) { const u0 = R.cu - 1, v0 = R.cv - 1; if (R.put(u0, u0 + 2, v0, v0 + 1, () => table(K, R, u0, u0 + 2, v0, v0 + 1))) { K.prop('urn', u0 + 1, v0, R.l + 1); if (R.put(u0 - 1, u0 - 1, v0, v0)) K.prop('stool', u0 - 1, v0, R.l - 1, 1, 0); } }
        gloom(K, R, { webs: 4, lamps: 2, chandeliers: 1 });
    },
    armoury(K, R) {
        againstWalls(K, R, [[1, 1, (s) => armour(K, R, s.u0, s.v0), 6], [3, 1, (s) => { K.p.box(s.u0, s.u1, R.l, R.l + 3, s.v0, s.v1, BLOCK.FENCE); K.p.box(s.u0, s.u1, R.l + 4, R.l + 4, s.v0, s.v1, BLOCK.PLANKS_DARK); }, 3], [2, 2, (s) => crate(K, R, s.u0, s.u1, s.v0, s.v1, 2, BLOCK.PLANKS), 3]]);
        gloom(K, R, { webs: 3, banners: 3, lamps: 2, chandeliers: 1 });
        cornerLights(K, R, 1);
    },
    gallery(K, R) { // the portrait gallery: the ancestors along the walls, benches, candelabras
        gloom(K, R, { webs: 3, portraits: 12, lamps: 2, chandeliers: 2 });
        const along = R.D >= R.W;
        for (let i = 0; i < 3; i++) {
            const f = (i + 1) / 4;
            const u = along ? R.cu - 1 : Math.round(R.u0 + f * R.W), v = along ? Math.round(R.v0 + f * R.D) : R.cv - 1;
            const u1 = along ? u + 2 : u, v1 = along ? v : v + 2;
            R.put(u, u1, v, v1, () => K.p.box(u, u1, R.l, R.l, v, v1, BLOCK.PLANKS_DARK));
        }
        cornerLights(K, R, 4);
    },
    mirror(K, R) { // the mirror hall: pale panels on every wall, urns, a chandelier
        gloom(K, R, { webs: 2, mirrors: 10, lamps: 0, chandeliers: 2 });
        againstWalls(K, R, [[1, 1, (s) => K.p.box(s.u0, s.u0, R.l, R.l, s.v0, s.v0, BLOCK.GHOST_BRICK), 4]]);
        let n = 0; for (const s of R.alongWalls(1, 1, 5)) { if (n >= 6) break; if (R.put(s.u0, s.u0, s.v0, s.v0)) { K.prop('urn', s.u0, s.v0, R.l - 1); n++; } }
        cornerLights(K, R, 2);
    },
    library(K, R) {
        againstWalls(K, R, [[4, 1, (s) => shelf(K, R, s), 8], [3, 1, (s) => shelf(K, R, s), 4]], 80);
        const u0 = R.cu - 2, v0 = R.cv - 1;
        if (R.put(u0, u0 + 4, v0, v0 + 2, () => table(K, R, u0, u0 + 4, v0, v0 + 2))) {
            const cells = []; for (let u = u0; u <= u0 + 4; u++) for (let v = v0; v <= v0 + 2; v++) cells.push([u, v]);
            candlesOn(K, cells, R.l + 1, 3);
            chairsRound(K, R, u0, u0 + 4, v0, v0 + 2, 2);
        }
        gloom(K, R, { webs: 4, lamps: 2, chandeliers: 2 });
    },
    chapel(K, R) { // pews in rows with an aisle, an altar on a dais at the far end, candles, a cross of gold
        const along = R.D >= R.W; // (the altar at +v end when along)
        const far = along ? R.v1 : R.u1;
        // the altar's dais
        if (along) {
            K.p.box(R.u0 + 2, R.u1 - 2, R.l, R.l, far - 3, far, BLOCK.GHOST_BRICK);
            R.put(R.u0 + 2, R.u1 - 2, far - 3, far, () => {
                K.p.box(R.cu - 2, R.cu + 2, R.l + 1, R.l + 2, far - 1, far - 1, BLOCK.CS_WHITE);
                K.p.box(R.cu, R.cu, R.l + 3, R.l + 7, far, far, BLOCK.GOLD); K.p.box(R.cu - 2, R.cu + 2, R.l + 6, R.l + 6, far, far, BLOCK.GOLD);
                K.prop('candelabra', R.cu - 2, far - 1, R.l + 2); K.prop('candelabra', R.cu + 2, far - 1, R.l + 2); K.prop('candle', R.cu, far - 1, R.l + 2);
            });
            for (let v = R.v0 + 4; v <= far - 8; v += 4) {
                for (const [a, b] of [[R.u0 + 1, R.cu - 3], [R.cu + 3, R.u1 - 1]]) {
                    if (b - a < 1) continue;
                    R.put(a, b, v, v + 1, () => { K.p.box(a, b, R.l, R.l, v, v, BLOCK.PLANKS_DARK); K.p.box(a, b, R.l, R.l + 1, v + 1, v + 1, BLOCK.PLANKS_DARK); });
                }
            }
        }
        gloom(K, R, { webs: 4, banners: 4, lamps: 4, chandeliers: 2 });
        cornerLights(K, R, 2);
    },
    bedroom(K, R) {
        const cover = K.pick([BLOCK.CARPET_PURPLE, BLOCK.CARPET_RED, BLOCK.CARPET_BLUE]);
        againstWalls(K, R, [[4, 6, (s) => bed(K, R, s, cover), 1]], 60);
        againstWalls(K, R, [[3, 2, (s) => wardrobe(K, R, s), 1], [3, 1, (s) => { crate(K, R, s.u0, s.u1, s.v0, s.v1, 2, BLOCK.PLANKS_DARK); candlesOn(K, cellsOf(s), R.l + 1, 2); }, 1], [2, 2, (s) => sheet(K, R, s.u0, s.u1, s.v0, s.v1, 2), 2], [1, 1, (s) => clock(K, R, s.u0, s.v0), 1], [5, 2, (s) => K.hearth(s.cu, s.cv, s.nu, s.nv, R.l, R.lc), 1]]);
        const n = R.W * R.D > 140 ? 2 : 1;
        for (let i = 0; i < n; i++) { const u = R.cu + K.ri(-2, 2), v = R.cv + K.ri(-2, 2); if (R.put(u, u, v, v)) K.prop('chair', u, v, R.l - 1, K.pick([1, -1, 0]), 0); }
        R.rug(R.cu - 2, R.cu + 2, R.cv - 2, R.cv + 2, cover, BLOCK.ARCANE_DARK);
        gloom(K, R, { webs: 3, portraits: 1, mirrors: 1, lamps: 2, chandeliers: 1 });
        cornerLights(K, R, 1);
    },
    ballroom(K, R) {
        againstWalls(K, R, [[3, 2, (s) => piano(K, R, s), 1], [3, 1, (s) => harp(K, R, s.u0, s.v0, s.nu, s.nv), 1]]);
        for (const s of R.alongWalls(1, 1, 4)) if (K.rng() < 0.5 && R.put(s.u0, s.u0, s.v0, s.v0)) K.prop('chair', s.u0, s.v0, R.l - 1, s.nu, s.nv);
        R.rug(R.u0 + 3, R.u1 - 3, R.v0 + 3, R.v1 - 3, BLOCK.CARPET_PURPLE, BLOCK.ARCANE_DARK);
        gloom(K, R, { webs: 4, mirrors: 6, portraits: 2, lamps: 2, chandeliers: 3 });
        cornerLights(K, R, 4);
    },
    music(K, R) {
        againstWalls(K, R, [[3, 1, (s) => harp(K, R, s.u0, s.v0, s.nu, s.nv), 2], [3, 2, (s) => piano(K, R, s), 1], [4, 1, (s) => shelf(K, R, s), 1]]);
        for (let i = 0; i < 4; i++) { const u = R.cu + K.ri(-3, 3), v = R.cv + K.ri(-3, 3); if (R.put(u, u, v, v)) K.prop('chair', u, v, R.l - 1, 0, 1); }
        gloom(K, R, { webs: 3, portraits: 2, mirrors: 1, lamps: 2, chandeliers: 1 });
    },
    study(K, R) {
        againstWalls(K, R, [[4, 1, (s) => shelf(K, R, s), 3], [1, 1, (s) => clock(K, R, s.u0, s.v0), 1], [2, 2, (s) => { K.p.box(s.u0, s.u0, R.l, R.l, s.v0, s.v0, BLOCK.GOLD); K.p.box(s.u0, s.u0, R.l + 1, R.l + 1, s.v0, s.v0, BLOCK.CARPET_BLUE); }, 1]]);
        const u0 = R.cu - 1, v0 = R.cv - 1;
        if (R.put(u0, u0 + 2, v0, v0 + 1, () => table(K, R, u0, u0 + 2, v0, v0 + 1))) { K.prop('candle', u0 + 1, v0, R.l + 1); if (R.put(u0 + 1, u0 + 1, v0 + 2, v0 + 2)) K.prop('chair', u0 + 1, v0 + 2, R.l - 1, 0, -1); }
        gloom(K, R, { webs: 3, portraits: 1, lamps: 2, chandeliers: 1 });
    },
    nursery(K, R) {
        for (let i = 0; i < 3; i++) againstWalls(K, R, [[2, 3, (s) => { K.p.box(s.u0, s.u1, R.l, R.l, s.v0, s.v1, BLOCK.PLANKS_DARK); K.p.box(s.u0, s.u1, R.l + 1, R.l + 1, s.v0, s.v1, BLOCK.CLOTH_WHITE); }, 1]]);
        againstWalls(K, R, [[1, 1, (s) => { K.p.box(s.u0, s.u0, R.l, R.l, s.v0, s.v0, BLOCK.PLANKS); K.p.box(s.u0, s.u0, R.l + 1, R.l + 1, s.v0, s.v0, BLOCK.CLOTH_YELLOW); }, 3]]); // (toys: a little horse, a doll)
        for (let i = 0; i < 2; i++) { const u = R.cu + K.ri(-2, 2), v = R.cv + K.ri(-2, 2); if (R.put(u, u, v, v)) K.prop('stool', u, v, R.l - 1); }
        gloom(K, R, { webs: 4, portraits: 1, mirrors: 1, lamps: 1 });
    },
    servants(K, R) {
        for (let i = 0; i < 4; i++) againstWalls(K, R, [[2, 4, (s) => { K.p.box(s.u0, s.u1, R.l, R.l, s.v0, s.v1, BLOCK.PLANKS); K.p.box(s.u0, s.u1, R.l + 1, R.l + 1, s.v0, s.v1, BLOCK.CLOTH_WHITE); }, 1]]);
        const u0 = R.cu - 1, v0 = R.cv - 1;
        if (R.put(u0, u0 + 2, v0, v0 + 1, () => table(K, R, u0, u0 + 2, v0, v0 + 1))) { K.prop('candle', u0, v0, R.l + 1); chairsRound(K, R, u0, u0 + 2, v0, v0 + 1, 2); }
        gloom(K, R, { webs: 3, lamps: 2 });
    },
    store(K, R) {
        againstWalls(K, R, [[2, 2, (s) => crate(K, R, s.u0, s.u1, s.v0, s.v1, 2, BLOCK.PLANKS), 6], [2, 2, (s) => barrel(K, R, s.u0, s.v0), 6], [2, 1, (s) => crate(K, R, s.u0, s.u1, s.v0, s.v1, 1, BLOCK.CLOTH_WHITE), 4]], 80);
        gloom(K, R, { webs: 4, lamps: 2 });
        cornerLights(K, R, 1);
    },
    wine(K, R) { // racks of barrels in rows with aisles 3 wide; vault pillars are the plan's
        const along = R.D >= R.W;
        if (along) {
            for (let u = R.u0 + 1; u + 1 <= R.u1 - 1; u += 5) {
                const a = R.v0 + 4, b = R.v1 - 4;
                R.put(u, u + 1, a, b, () => { for (let v = a; v + 1 <= b; v += 2) barrel(K, R, u, v, false); K.p.box(u, u + 1, R.l + 2, R.l + 2, a, b, BLOCK.PLANKS_DARK); });
            }
        } else {
            for (let v = R.v0 + 1; v + 1 <= R.v1 - 1; v += 5) {
                const a = R.u0 + 4, b = R.u1 - 4;
                R.put(a, b, v, v + 1, () => { for (let u = a; u + 1 <= b; u += 2) barrel(K, R, u, v, false); K.p.box(a, b, R.l + 2, R.l + 2, v, v + 1, BLOCK.PLANKS_DARK); });
            }
        }
        gloom(K, R, { webs: 4, lamps: 3 });
        cornerLights(K, R, 2);
    },
    cell(K, R) { // a dungeon cell: straw, a bone pile, chains on the wall
        againstWalls(K, R, [[2, 1, (s) => crate(K, R, s.u0, s.u1, s.v0, s.v1, 1, BLOCK.HAY), 1], [1, 1, (s) => K.p.box(s.u0, s.u0, R.l, R.l, s.v0, s.v0, BLOCK.CS_WHITE), 1]]);
        const sl = R.wallSlots(1, 1);
        if (sl.length) { const s = sl[K.ri(0, sl.length - 1)]; const [wu, wv] = K._wall(s.u, s.v, s.nu, s.nv, 0); K.p.box(wu, wu, R.l + 2, R.l + 3, wv, wv, BLOCK.GOLD); } // (the shackles' iron ring in the wall)
        gloom(K, R, { webs: 2, lamps: 0 });
    },
    treasury(K, R) {
        againstWalls(K, R, [[2, 2, (s) => { crate(K, R, s.u0, s.u1, s.v0, s.v1, 1, BLOCK.GOLD); }, 2], [1, 1, (s) => K.p.box(s.u0, s.u0, R.l, R.l, s.v0, s.v0, BLOCK.GOLD), 2]]);
        let n = 0; for (const s of R.alongWalls(1, 1, 3)) { if (n >= 3) break; if (R.put(s.u0, s.u0, s.v0, s.v0)) { K.prop('urn', s.u0, s.v0, R.l - 1); n++; } }
        gloom(K, R, { webs: 2, portraits: 1, lamps: 2 });
        cornerLights(K, R, 2);
    },
    crypt(K, R) { gloom(K, R, { webs: 4, lamps: 0 }); },
    tower(K, R) { // a round tower's floor: a few things on its middle disc
        gloom(K, R, { webs: 0, lamps: 0 });
    },
};

function cellsOf(s) { const out = []; for (let u = s.u0; u <= s.u1; u++) for (let v = s.v0; v <= s.v1; v++) out.push([u, v]); return out; }

/**
 * Furnish a room of the castle by its kind (the room's grid already knows its doors): blocks into the plan, props, ghost spots.
 * kind: dining | hall | kitchen | armoury | gallery | mirror | library | chapel | bedroom | ballroom | music | study | nursery | servants |
 *       store | wine | cell | treasury | crypt | tower.
 */
export function furnishGhostRoom(R, kind = R.kind, { spots = 3, floor = true } = {}) {
    const K = R.K;
    if (floor) R.floor();
    const fn = MAKERS[kind] || MAKERS.tower;
    fn(K, R);
    R.spots(spots);
    K.p.flushSlabs();
    return R;
}
