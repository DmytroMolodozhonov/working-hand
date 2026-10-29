/**
 * GhostKit.js — the builder's tools of the Castle of Ghosts (GhostBuild.js lays the plan, GhostRooms.js furnishes the rooms).
 *
 * Plain data over a Castles.Plan (no THREE): round towers with a spiral stair of ring sectors (as the wizards' tower, WizardTowers.js),
 * spires, lancet and broken windows, flush wall pieces (mirrors: a pale glowing panel in a dark frame; portraits: a frame and cloth),
 * chandeliers hung from solid ceilings, statues, dead trees, and the records the game reads (rooms, spots, props, chests, doors).
 *
 * Measures (CLAUDE.md «Размеры»): a block 1 m, the hero ~3.5 m (5 free layers over a floor), a door 3 wide × 6 high, a storey 8 layers
 * (7 of air and the slab), passages ≥ 3 blocks, steps 1 high and ≥ 2 m deep along their walking line.
 * BLOCK is read inside the functions only (Terrain.js imports the castles: an import cycle at the top level).
 */
import { BLOCK } from './Terrain.js';

const TAU = Math.PI * 2;
const norm = (a) => a - Math.floor(a / TAU) * TAU;
/** Do the arcs [a0, a0+s0] and [a1, a1+s1] meet (angles in radians, any turn)? */
export function arcsMeet(a0, s0, a1, s1) {
    const d = norm(a1 - a0);
    return d <= s0 || d + s1 >= TAU;
}
const inArc = (a, a0, s) => norm(a - a0) <= s;

/** The kit: a plan, a random stream, and the lists the castle hands to the game. */
export class GhostKit {
    constructor(p, rng) {
        this.p = p;
        this.rng = rng;
        this.props = [];
        this.spots = [];
        this.rooms = [];
        this.chests = [];
        this.doors = [];
        this.stairs = [];
    }

    r(a, b) { return a + this.rng() * (b - a); }
    ri(a, b) { return Math.floor(a + this.rng() * (b - a + 1)); }
    pick(list) { return list[Math.floor(this.rng() * list.length)]; }

    // ----------------------------------------------------------------- records
    /** A room (local rectangle u0..u1 × v0..v1, standing layer l, h free layers): its world box. */
    room(id, kind, name, u0, u1, v0, v1, l, h) {
        const p = this.p, r = p.rect(u0, u1, v0, v1);
        const rec = { id, kind, name, x0: r.x0 - 0.5, x1: r.x1 + 0.5, z0: r.z0 - 0.5, z1: r.z1 + 0.5, y0: p.L(l) - 1.5, y1: p.L(l + h) - 1.5 };
        this.rooms.push(rec);
        return rec;
    }

    /** A place a ghost may float up from: the floor's surface at local (u, v) standing on layer l − 1. */
    spot(u, v, l, room) {
        const q = this.p.pt(u, v, l);
        this.spots.push({ x: q.x, y: q.y, z: q.z, room });
    }

    /** A doorway's middle on its floor (the ghosts' passages; the bench keeps it clear). */
    door(u, v, l, room = '') {
        const q = this.p.pt(u, v, l);
        this.doors.push({ x: q.x, y: q.y, z: q.z, room });
    }

    /** World yaw of a local facing (fu, fv) — as the chests' `a` (Kit.chest): atan2(dx, dz) of the direction it faces. */
    yawOf(u, v, fu, fv) {
        const p = this.p, x = p.wx(u, v), z = p.wz(u, v);
        return Math.atan2(p.wx(u + fu, v + fv) - x, p.wz(u + fu, v + fv) - z);
    }

    /** A loose thing (chair, stool, candle, candelabra, urn) standing on the top of layer lTop (local) at (u, v), facing (fu, fv). */
    prop(kind, u, v, lTop, fu = 0, fv = -1) {
        const p = this.p;
        this.props.push({ kind, x: p.wx(u, v), y: p.L(lTop) - 0.5, z: p.wz(u, v), a: this.yawOf(u, v, fu, fv) });
    }

    /**
     * A chest at (u, v) facing its niche's opening (fu, fv) on the floor of layer l − 1, in a niche 5 wide × 3 deep × 5 high
     * that is cleared here (with its floor), framed by two pilasters and a lintel of `trim` when `frame`.
     */
    chest(id, look, part, u, v, fu, fv, l, { frame = true, trim = BLOCK.GHOST_BRICK, floor = BLOCK.GHOST_TILE } = {}) {
        const p = this.p;
        const across = (a, b, c, d) => (fv ? [u + a, u + b, v + c * fv, v + d * fv] : [u + c * fu, u + d * fu, v + a, v + b]);
        const B = (q, l0, l1, t) => p.box(Math.min(q[0], q[1]), Math.max(q[0], q[1]), l0, l1, Math.min(q[2], q[3]), Math.max(q[2], q[3]), t);
        if (frame) {
            B(across(-3, -3, -1, 1), l, l + 5, trim); // (the pilasters: the niche's sides, 3 deep)
            B(across(3, 3, -1, 1), l, l + 5, trim);
            B(across(-3, 3, -1, 1), l + 5, l + 5, trim); // (the lintel)
            B(across(-2, 2, -2, -2), l, l + 5, trim); // (the back)
        }
        B(across(-2, 2, -1, 2), l, l + 4, 0); // (the niche's air: 5 wide, 5 high, in front of the back)
        B(across(-2, 2, -1, 2), l - 1, l - 1, floor);
        this.chests.push({ id, x: p.wx(u, v), y: p.L(l) - 1.5, z: p.wz(u, v), a: this.yawOf(u, v, fu, fv), look, flavor: 'ghost', part });
    }

    // ----------------------------------------------------------------- wall pieces (flush in the wall plane: they never narrow a passage)
    /**
     * Cells of a wall face: the room cell (u, v) touching the wall, the wall lies at (u − nu, v − nv) where (nu, nv) points into the room.
     * `along` the wall's direction. fn(wu, wv) for the cell `s` blocks along.
     */
    _wall(u, v, nu, nv, s) { return [u - nu + (nv ? s : 0), v - nv + (nu ? s : 0)]; }

    /** A mirror: a pale glowing panel (w × h) in a dark/gold frame, its bottom at layer l0, centred at (u, v) on the wall behind. */
    mirror(u, v, nu, nv, l0, w = 2, h = 3, frameT = BLOCK.GOLD) {
        const p = this.p, B = BLOCK;
        const hw = Math.floor(w / 2);
        const a = this._wall(u, v, nu, nv, -hw - 1), b = this._wall(u, v, nu, nv, w - hw);
        p.box(Math.min(a[0], b[0]), Math.max(a[0], b[0]), l0 - 1, l0 + h, Math.min(a[1], b[1]), Math.max(a[1], b[1]), frameT);
        const c = this._wall(u, v, nu, nv, -hw), d = this._wall(u, v, nu, nv, w - hw - 1);
        p.box(Math.min(c[0], d[0]), Math.max(c[0], d[0]), l0, l0 + h - 1, Math.min(c[1], d[1]), Math.max(c[1], d[1]), B.GHOST_LAMP);
    }

    /** A portrait: a frame 5 × 5 (gold or dark wood), a dark background, a pale face, the sitter's coloured clothes. */
    portrait(u, v, nu, nv, l0, cloth, frameT) {
        const p = this.p, B = BLOCK;
        const box = (s0, s1, l0_, l1_, t) => { const a = this._wall(u, v, nu, nv, s0), b = this._wall(u, v, nu, nv, s1); p.box(Math.min(a[0], b[0]), Math.max(a[0], b[0]), l0_, l1_, Math.min(a[1], b[1]), Math.max(a[1], b[1]), t); };
        box(-2, 2, l0, l0 + 4, frameT || (this.rng() < 0.5 ? B.GOLD : B.PLANKS_DARK));
        box(-1, 1, l0 + 1, l0 + 3, B.ARCANE_DARK); // (the dark varnish of the background)
        box(-1, 1, l0 + 1, l0 + 2, cloth); // (the sitter's dress)
        box(0, 0, l0 + 3, l0 + 3, B.CLOTH_WHITE); // (the pale face)
    }

    /** A banner of cloth hanging flush on a wall (1 wide, from l1 down to l0), a gold rod over it. */
    banner(u, v, nu, nv, l0, l1, cloth) {
        const p = this.p, B = BLOCK;
        const [wu, wv] = this._wall(u, v, nu, nv, 0);
        p.box(wu, wu, l0, l1, wv, wv, cloth);
        p.box(wu, wu, l1 + 1, l1 + 1, wv, wv, B.GOLD);
    }

    /** A candle niche: a glowing block sunk in the wall face. */
    lampNiche(u, v, nu, nv, l) {
        const [wu, wv] = this._wall(u, v, nu, nv, 0);
        this.p.box(wu, wu, l, l, wv, wv, BLOCK.GHOST_LAMP);
    }

    /**
     * A hearth against a wall: the room cell (u, v) at the wall, (nu, nv) into the room. Its footprint in the room: 5 along the wall × 2
     * deep (the breast up to the ceiling lc, the mantel shelf in front); the dark opening goes into the wall, pale embers on its floor.
     */
    hearth(u, v, nu, nv, l, lc, stone = BLOCK.GHOST_BRICK) {
        const p = this.p, B = BLOCK;
        const box = (s0, s1, d0, d1, l0, l1, t) => {
            const a = [u + (nv ? s0 : 0) + nu * d0, v + (nu ? s0 : 0) + nv * d0], b = [u + (nv ? s1 : 0) + nu * d1, v + (nu ? s1 : 0) + nv * d1];
            p.box(Math.min(a[0], b[0]), Math.max(a[0], b[0]), l0, l1, Math.min(a[1], b[1]), Math.max(a[1], b[1]), t);
        };
        box(-2, 2, 0, 0, l, lc - 1, stone); // (the breast, up to the ceiling)
        box(-1, 1, -1, 0, l, l + 2, 0); // (the opening, into the wall)
        box(-1, 1, -1, -1, l - 1, l - 1, B.GHOST_LAMP); // (the cold, pale embers)
        box(-2, 2, 1, 1, l, l, stone); // (the hearthstone's kerb)
        box(-2, -2, 1, 1, l + 1, l + 3, stone); box(2, 2, 1, 1, l + 1, l + 3, stone); // (the jambs)
        box(-2, 2, 1, 1, l + 4, l + 4, stone); // (the mantel shelf)
        box(-1, 1, 1, 1, l + 1, l + 3, 0);
    }

    /** A chandelier hung from a ceiling whose lowest solid layer is lc: a gold chain, a gold ring, pale candles round it. Its lowest block is lc − 1 − chain. */
    chandelier(u, v, lc, chain = 0, big = false) {
        const p = this.p, B = BLOCK;
        if (chain > 0) p.box(u, u, lc - chain, lc - 1, v, v, B.GOLD);
        const lb = lc - 1 - chain;
        const r = big ? 2 : 1;
        p.box(u - r, u + r, lb, lb, v - r, v + r, B.GOLD);
        p.box(u - r + 1, u + r - 1, lb, lb, v - r + 1, v + r - 1, 0); // (a ring, open in the middle)
        p.box(u, u, lb, lb, v, v, B.GOLD);
        for (const [du, dv] of [[-r, -r], [r, -r], [-r, r], [r, r]]) p.box(u + du, u + du, lb, lb, v + dv, v + dv, B.GHOST_LAMP);
        if (big) for (const [du, dv] of [[0, -r], [0, r], [-r, 0], [r, 0]]) p.box(u + du, u + du, lb, lb, v + dv, v + dv, B.GHOST_LAMP);
    }

    /** Cobwebs in a room's upper corner: torn white tatters from the ceiling (lc the ceiling's lowest solid layer), never below lc − 2. */
    cobweb(u, v, du, dv, lc) {
        const p = this.p, B = BLOCK;
        p.box(u, u, lc - 2, lc - 1, v, v, B.CLOTH_WHITE);
        p.box(u + du, u + du, lc - 1, lc - 1, v, v, B.CLOTH_WHITE);
        p.box(u, u, lc - 1, lc - 1, v + dv, v + dv, B.CLOTH_WHITE);
    }

    // ----------------------------------------------------------------- outside pieces
    /** A lancet window through a straight wall: 3 wide, `h` high, a pointed head; (nu, nv) out of the building; the wall from d0 to d1 deep. */
    lancet(u, v, nu, nv, l0, h, th = 2, broken = false) {
        const p = this.p, B = BLOCK;
        const box = (s0, s1, d0, d1, l1_, l2_, t) => {
            const a = [u + (nv ? s0 : 0) + nu * d0, v + (nu ? s0 : 0) + nv * d0], b = [u + (nv ? s1 : 0) + nu * d1, v + (nu ? s1 : 0) + nv * d1];
            p.box(Math.min(a[0], b[0]), Math.max(a[0], b[0]), l1_, l2_, Math.min(a[1], b[1]), Math.max(a[1], b[1]), t);
        };
        box(-1, 1, 0, th - 1, l0, l0 + h - 2, 0);
        box(0, 0, 0, th - 1, l0 + h - 1, l0 + h - 1, 0);
        box(-1, 1, th, th, l0 - 1, l0 - 1, B.GHOST_BRICK); // (the sill, one block out)
        box(-2, -2, th, th, l0, l0 + h - 1, B.GHOST_BRICK); // (the jambs' moulding)
        box(2, 2, th, th, l0, l0 + h - 1, B.GHOST_BRICK);
        if (broken) {
            // the jagged edge of a broken window: a few teeth of the frame left (not glass: «just openings with jagged edges»)
            const s = this.rng() < 0.5 ? -1 : 1;
            box(s, s, 0, 0, l0 + h - 2, l0 + h - 2, B.GHOST_STONE);
            box(-s, -s, th - 1, th - 1, l0, l0, B.GHOST_STONE);
        } else {
            box(0, 0, th - 1, th - 1, l0, l0 + h - 2, B.GHOST_LAMP); // (a mullion of pale light: the tracery)
        }
    }

    /** A cone spire (centre u, v, base radius r at layer l0, h layers), a pale lamp and a gold finial on its tip; returns the top layer. */
    spire(u, v, r, l0, h, finial = true) {
        const p = this.p, B = BLOCK;
        const m = p.parts.length;
        let top = l0;
        for (let k = 0; k < h; k++) {
            const rr = r * (1 - k / h);
            if (rr < 0.45) { p.box(u, u, l0 + k, l0 + k, v, v, B.GHOST_ROOF); top = l0 + k; continue; }
            p.cyl(u, v, rr, l0 + k, l0 + k, B.GHOST_ROOF);
            top = l0 + k;
        }
        p.slopeTop(m, B.GHOST_ROOF);
        if (finial) {
            p.box(u, u, top + 1, top + 1, v, v, B.GHOST_LAMP);
            p.box(u, u, top + 2, top + 2, v, v, B.GOLD);
            top += 2;
        }
        return top;
    }

    /** A hooded mourning statue of black stone on a pedestal at (u, v) standing on layer l − 1, its face to (fu, fv); wings when `angel`. */
    statue(u, v, l, fu, fv, { angel = false, broken = false, mat = BLOCK.GHOST_STONE, ped = BLOCK.GHOST_BRICK } = {}) {
        const p = this.p, B = BLOCK;
        p.box(u - 1, u + 1, l, l + 1, v - 1, v + 1, ped); // (the pedestal)
        p.box(u - 1, u + 1, l + 2, l + 2, v - 1, v + 1, B.GHOST_TILE); // (its cap)
        const top = broken ? l + 4 : l + 6;
        p.box(u, u, l + 3, top, v, v, mat); // (the robed body)
        if (!broken) {
            p.box(u - (fv ? 1 : 0), u + (fv ? 1 : 0), l + 5, l + 5, v - (fu ? 1 : 0), v + (fu ? 1 : 0), mat); // (the shoulders)
            p.box(u + fu, u + fu, l + 4, l + 4, v + fv, v + fv, mat); // (the hands joined in front)
            p.box(u, u, l + 7, l + 7, v, v, mat); // (the hooded head)
            if (angel) {
                p.box(u - fu - (fv ? 1 : 0), u - fu + (fv ? 1 : 0), l + 5, l + 8, v - fv - (fu ? 1 : 0), v - fv + (fu ? 1 : 0), mat); // (the folded wings behind)
                p.box(u - fu, u - fu, l + 9, l + 9, v - fv, v - fv, mat);
            }
        } else {
            p.box(u + (fv ? 1 : 0) + fu, u + (fv ? 1 : 0) + fu, l, l, v + (fu ? 1 : 0) + fv, v + (fu ? 1 : 0) + fv, mat); // (the fallen head at its foot)
        }
    }

    /** A dead, gnarled tree of dark wood (no leaves) rooted on layer l − 1, its height h; a few crooked branches. */
    deadTree(u, v, l, h) {
        const p = this.p, B = BLOCK;
        p.box(u, u, l, l + h - 1, v, v, B.WOOD);
        p.box(u - 1, u + 1, l, l, v, v, B.WOOD); // (the roots' flare)
        p.box(u, u, l, l, v - 1, v + 1, B.WOOD);
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        let last = -1;
        for (let i = 0; i < 3; i++) {
            let d = this.ri(0, 3);
            if (d === last) d = (d + 1) % 4;
            last = d;
            const [du, dv] = dirs[d];
            const lb = l + Math.floor(h * (0.45 + 0.18 * i));
            const len = 2 + this.ri(0, 2);
            p.box(Math.min(u, u + du * len), Math.max(u, u + du * len), lb, lb, Math.min(v, v + dv * len), Math.max(v, v + dv * len), B.WOOD);
            p.box(u + du * len, u + du * len, lb + 1, lb + 2, v + dv * len, v + dv * len, B.WOOD); // (a crooked twig up)
        }
    }

    // ----------------------------------------------------------------- the round tower
    /**
     * A round tower with floors and a spiral stair of ring sectors along its wall (WizardTowers.js): `floors` the standing layers
     * (one flight of whole-block steps between each two, 1 high, along the band bandIn…Rin), `doors` [{floor, du, dv, off, h}] radial
     * doorways along an axis (du, dv) at a sideways offset `off`, and `keep` [{floor, ang, half}] other angles that must stay free
     * (a chest, a bed). The flights' start angles are found so that every door and kept angle on a floor is clear of the stair and of
     * the hole of the flight below. Returns {flights, free(floorIndex, angle)}.
     */
    roundTower(u, v, { R, Rin, bandIn, floors, from = -1, top, stone, slab, stepT, doors = [], keep = [], windows = true, courses = true }) {
        const p = this.p, B = BLOCK;
        const n = floors.length;
        const walkR = (bandIn + Rin) / 2;
        const D = 2.3 / walkR; // (a step: 2.3 m of arc along the walking line)
        const m = 0.08;
        // the shell, its floors
        p.cyl(u, v, R, from, top, stone);
        p.cyl(u, v, Rin, floors[0], top - 1, 0);
        for (let i = 0; i < n; i++) p.cyl(u, v, Rin, floors[i] - 1, floors[i] - 1, i === 0 && from === floors[0] - 1 ? slab : slab);
        if (courses) for (let i = 1; i < n; i++) p.cyl(u, v, R + 0.6, floors[i] - 1, floors[i] - 1, B.GHOST_BRICK, R - 0.4);
        // the angles that must stay free on each floor (doors and kept places)
        const need = floors.map(() => []);
        const angOf = (d) => Math.atan2(d.dv * (R - 0.5) + (d.du ? d.off : 0), d.du * (R - 0.5) + (d.dv ? d.off : 0));
        for (const d of doors) need[d.floor].push([angOf(d), Math.asin(Math.min(1, 2.2 / (bandIn + 1))) + m]);
        for (const k of keep) need[k.floor].push([k.ang, k.half]);
        const hs = []; for (let i = 0; i + 1 < n; i++) hs.push(floors[i + 1] - floors[i]);
        const occ = (i, th) => { // the band taken on floor i by the hole of flight i−1 and by flight i
            const o = [];
            if (i >= 1) o.push([th[i - 1] + 2 * D - m, (hs[i - 1] - 2) * D + 2 * m]);
            if (i < n - 1) o.push([th[i] - m, hs[i] * D + 2 * m]);
            return o;
        };
        const ok = (i, th) => {
            for (const [a0, s] of occ(i, th)) for (const [a, h] of need[i]) if (arcsMeet(a0, s, a - h, 2 * h)) return false;
            if (i >= 1 && i < n - 1 && arcsMeet(th[i - 1] + 3 * D - m - 0.05, (hs[i - 1] - 3) * D + 2 * m + 0.1, th[i] - m, hs[i] * D + 2 * m)) return false; // (a flight never under the steps of the one below)
            return true;
        };
        const th = [];
        const C = 72, start = Math.floor(this.rng() * C);
        const solve = (i) => {
            if (i === n - 1) return ok(n - 1, th);
            for (let c = 0; c < C; c++) {
                th[i] = ((start + c * 29) % C) / C * TAU;
                if (ok(i, th) && solve(i + 1)) return true;
            }
            return false;
        };
        if (!solve(0)) throw new Error('GhostKit.roundTower: no stair fits the doors at ' + u + ',' + v);
        // the flights
        const flights = [];
        for (let i = 0; i + 1 < n; i++) {
            const l = floors[i], h = hs[i], t0 = th[i], mark = p.parts.length;
            for (let s = 0; s < h; s++) {
                const a0 = t0 + s * D, a1 = a0 + D;
                p.sector(u, v, Rin, bandIn, a0, a1, l + s + 1, l + s + 5, 0); // (the headroom: cuts the floor above)
                p.sector(u, v, Rin, bandIn, a0, a1, l, l + s, stepT);
            }
            p.slopeTop(mark, stepT);
            const up = floors[i + 1];
            p.sector(u, v, bandIn, bandIn - 1, t0 + 2 * D, t0 + h * D, up, up, B.FENCE); // (the railing round the hole)
            p.sector(u, v, Rin, bandIn - 1, t0 + D, t0 + 2 * D, up, up, B.FENCE); // (the hole's closed end)
            flights.push({ i, l, up, th: t0, span: h * D, D, walkR });
            this.stairs.push({ u, v, l, up, th: t0, D, walkR, h });
        }
        // the doors
        for (const d of doors) {
            const l = floors[d.floor], hh = (d.h || 6) - 1;
            if (d.du) { const a = u + d.du * (Rin - 1.5), b = u + d.du * (R + 1); p.box(Math.round(Math.min(a, b)), Math.round(Math.max(a, b)), l, l + hh, v + d.off - 1, v + d.off + 1, 0); }
            else { const a = v + d.dv * (Rin - 1.5), b = v + d.dv * (R + 1); p.box(u + d.off - 1, u + d.off + 1, l, l + hh, Math.round(Math.min(a, b)), Math.round(Math.max(a, b)), 0); }
        }
        // the windows (lancets 2 wide × 4 high through the wall) and candle niches, never over a stair
        const free = (i, a, h = 0.12) => !occ(i, th).some(([a0, s]) => arcsMeet(a0, s, a - h, 2 * h)) && !need[i].some(([b, hb]) => arcsMeet(b - hb, 2 * hb, a - h, 2 * h));
        if (windows) floors.forEach((l, i) => {
            const k = Math.max(4, Math.round(R / 2.5));
            for (let j = 0; j < k; j++) {
                const a = (j + 0.5) / k * TAU + i * 0.4;
                if (!free(i, a, 0.22)) continue;
                const c = Math.cos(a), s = Math.sin(a);
                if (windows === 'lamps' || (typeof windows === 'function' && !windows(i, a))) {
                    const wu = Math.round(u + c * (Rin + 0.6)), wv = Math.round(v + s * (Rin + 0.6));
                    p.box(wu, wu, l + 3, l + 3, wv, wv, B.GHOST_LAMP);
                    continue;
                }
                for (let r = Rin - 0.5; r <= R + 0.6; r += 0.5) for (const w of [-0.5, 0.5]) {
                    const wu = Math.round(u + c * r - s * w), wv = Math.round(v + s * r + c * w);
                    p.box(wu, wu, l + 2, l + 5, wv, wv, 0);
                }
                const tu = Math.round(u + c * (R - 0.5)), tv = Math.round(v + s * (R - 0.5));
                p.box(tu, tu, l + 6, l + 6, tv, tv, 0); // (the pointed head)
            }
        });
        return { flights, free, th, D };
    }
}

/** Is angle a inside the arc [a0, a0 + s]? */
export { inArc };
