/**
 * DungeonKit.js — the tools to build the dungeons of the wild with (DungeonBuild.js: under the ground, DungeonRuins.js: on it; Dungeons.js places them).
 *
 * Every dungeon is drawn with the castles' Plan (Castles.js): boxes and discs of blocks in a frame turned by rot·90°, u across, v along
 * (the front, the way in, at −v), layer l = 0 the first layer above the plan's floor F (l = −1 is the floor itself).
 *   - A RUIN stands on levelled ground (F = the ground); its walls are not walls but the remains of walls — each column a different height by a
 *     slow wobble and now and then a broken tooth, the top courses mossier than the bottom, windows and doorways left in, heaps of rubble
 *     where a wall came down, pillars snapped at different heights, bushes and dead trees grown up through the floors, a floor of flags
 *     with grass showing through. Magical ones are of arcane stone with violet lamps that still glow, rune circles in the floor.
 *   - A dungeon UNDER the ground has its plan's F at the rooms' floor; a stair (a half-sunk house at the yard) leads down to it. The shell is laid
 *     first, the air carved out of it, the pieces last — so a doorway is always open and nothing of the decoration stops a way.
 * Pure data (no THREE): the same blocks on every computer. (Imports Terrain.js for BLOCK: never read BLOCK at the top level here.)
 */

import { BLOCK } from './Terrain.js';

export const TAU = Math.PI * 2;

// ------------------------------------------------------------------ themes: what a place is made of
let _themes = null;
export function themes() {
    if (_themes) return _themes;
    const B = BLOCK;
    _themes = {
        ruin: {
            stone: [[B.COBBLE, 4], [B.CS_GREY, 3], [B.CS_MOSSY, 3], [B.BRICK, 0.5], [B.CS_DARK, 0.5]],
            moss: [[B.CS_MOSSY, 4], [B.COBBLE, 1]],
            floor: [[B.CS_GREY, 3], [B.COBBLE, 2], [B.CS_MOSSY, 1.5], [B.CS_DARK, 0.5]],
            rubble: [[B.COBBLE, 4], [B.GRAVEL, 2], [B.CS_MOSSY, 2], [B.CS_GREY, 1]],
            fine: B.CS_DARK, wood: B.PLANKS_DARK, lamp: B.LANTERN, accent: B.BRICK,
        },
        magic: {
            stone: [[B.ARCANE, 4], [B.CS_MOSSY, 2.5], [B.ARCANE_DARK, 1.5], [B.CS_WHITE, 1.5], [B.COBBLE, 0.8]],
            moss: [[B.CS_MOSSY, 4], [B.ARCANE, 1]],
            floor: [[B.CS_WHITE, 2], [B.ARCANE, 2.5], [B.CS_MOSSY, 1.5], [B.ARCANE_DARK, 1]],
            rubble: [[B.ARCANE, 3], [B.COBBLE, 2], [B.CS_MOSSY, 2], [B.GRAVEL, 1]],
            fine: B.ARCANE_DARK, wood: B.PLANKS_DARK, lamp: B.ARCANE_LAMP_VIOLET, accent: B.RUNE,
        },
        // (underground: no STONE / GRAVEL / DEEPSTONE in the shells — those are the cave rock that a chunk's vaulting rounds off, Terrain._vaultCaves)
        mine: {
            stone: [[B.COBBLE, 4], [B.CS_DARK, 2], [B.CS_GREY, 2], [B.CS_MOSSY, 1]],
            moss: [[B.COBBLE, 3], [B.CS_MOSSY, 2]],
            floor: [[B.PATH, 4], [B.COBBLE, 2], [B.CS_GREY, 2], [B.CS_DARK, 1]],
            rubble: [[B.COBBLE, 3], [B.CS_DARK, 2], [B.CS_GREY, 2], [B.PATH, 2]],
            fine: B.PLANKS_DARK, wood: B.PLANKS_DARK, lamp: B.LANTERN, accent: B.GOLD,
        },
        crypt: {
            stone: [[B.COBBLE, 3], [B.CS_DARK, 3.5], [B.CS_MOSSY, 2.5], [B.CS_GREY, 1.2]],
            moss: [[B.CS_MOSSY, 4], [B.CS_DARK, 1]],
            floor: [[B.CS_DARK, 3], [B.CS_GREY, 2], [B.CS_MOSSY, 1.5], [B.COBBLE, 1]],
            rubble: [[B.COBBLE, 3], [B.CS_DARK, 2], [B.CS_MOSSY, 2]],
            fine: B.CS_WHITE, wood: B.PLANKS_DARK, lamp: B.LANTERN, accent: B.CS_WHITE,
        },
        tomb: {
            stone: [[B.CS_SAND, 4], [B.CS_WHITE, 1.5], [B.CS_DARK, 1], [B.CS_GREY, 1.5], [B.CS_MOSSY, 0.6]],
            moss: [[B.CS_GREY, 3], [B.CS_SAND, 2]],
            floor: [[B.CS_SAND, 3], [B.CS_WHITE, 2], [B.CS_GREY, 1.5], [B.CS_DARK, 1]],
            rubble: [[B.CS_SAND, 3], [B.CS_GREY, 2], [B.CS_WHITE, 1]],
            fine: B.CS_WHITE, wood: B.PLANKS_DARK, lamp: B.LANTERN, accent: B.GOLD,
        },
        temple: {
            stone: [[B.ARCANE_DARK, 4], [B.CS_DARK, 2.5], [B.ARCANE, 1.5], [B.CS_MOSSY, 1.2]],
            moss: [[B.CS_MOSSY, 3], [B.CS_DARK, 2]],
            floor: [[B.ARCANE_DARK, 3], [B.CS_DARK, 2], [B.ARCANE, 1.5], [B.CS_MOSSY, 0.8]],
            rubble: [[B.CS_DARK, 3], [B.COBBLE, 2], [B.ARCANE_DARK, 2]],
            fine: B.ARCANE, wood: B.PLANKS_DARK, lamp: B.ARCANE_LAMP_VIOLET, accent: B.RUNE,
        },
    };
    return _themes;
}

/** A pick from a weighted list [[value, weight], …] by a draw x (0…1). */
export function weigh(list, x) {
    let t = 0;
    for (const [, w] of list) t += w;
    let r = x * t;
    for (const [v, w] of list) { r -= w; if (r < 0) return v; }
    return list[list.length - 1][0];
}

// ------------------------------------------------------------------ the kit
/** A builder's tools over a Plan: three layers of boxes (shell → air → pieces), walls that are remains of walls, pillars, rubble, chests. */
export class Kit {
    constructor(p, rng, theme, under, want) {
        this.p = p; this.r = rng; this.th = theme; this.under = under; this.want = want;
        this.s = []; this.a = []; this.d = []; // (shell, air, pieces: laid in this order)
        this.chests = [];
        this.rooms = []; // (for the tests: a box of air that is a room or a passage)
        this._w = Array.from({ length: 128 }, () => rng());
    }

    mix(list) { return weigh(list, this.r()); }
    stone() { return weigh(this.th.stone, this.r()); }
    moss() { return weigh(this.th.moss, this.r()); }
    flag() { return weigh(this.th.floor, this.r()); }
    heap() { return weigh(this.th.rubble, this.r()); }
    /** A slow wobble 0…1 along x (the same on every computer). */
    wob(x) {
        const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
        const a = this._w[i & 127], b = this._w[(i + 1) & 127];
        return a + (b - a) * s;
    }
    rint(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }

    solid(u0, u1, l0, l1, v0, v1, t) { this.s.push([u0, u1, l0, l1, v0, v1, t]); }
    /** Air: carved after the shell under the ground, in sequence among the pieces on it. */
    air(u0, u1, l0, l1, v0, v1) { (this.under ? this.a : this.d).push([u0, u1, l0, l1, v0, v1, 0]); }
    put(u0, u1, l0, l1, v0, v1, t) { this.d.push([u0, u1, l0, l1, v0, v1, t]); }
    cylS(u, v, r, l0, l1, t, hr = -1) { this.s.push({ cyl: [u, v, r, l0, l1, t, hr] }); }
    cylA(u, v, r, l0, l1) { (this.under ? this.a : this.d).push({ cyl: [u, v, r, l0, l1, 0, -1] }); }
    cylP(u, v, r, l0, l1, t, hr = -1) { this.d.push({ cyl: [u, v, r, l0, l1, t, hr] }); }

    flush() {
        const p = this.p;
        for (const list of [this.s, this.a, this.d]) for (const q of list) { if (q.cyl) p.cyl(...q.cyl); else p.box(...q); }
    }

    // ---------------------------------------------------------- the ruins' pieces
    /**
     * A wall that is the remains of a wall, from (u0, v0) to (u1, v1) (along u or along v), `h` high when whole: `decay` (0…1) how far it has
     * fallen, `th` thick (towards `side`), `gaps` doorways [[from, to], …] (blocks along the wall), `wins` windows [[from, to, l0, l1], …].
     */
    wall(u0, v0, u1, v1, h, { th = 1, decay = 0.4, gaps = [], wins = [], lift = 0, mat = null, side = 1, ivy = 0.1, cren = false } = {}) {
        const alongU = v0 === v1, len = alongU ? Math.abs(u1 - u0) : Math.abs(v1 - v0), dir = (alongU ? Math.sign(u1 - u0) : Math.sign(v1 - v0)) || 1;
        const seed = this.r() * 60, seed2 = this.r() * 60, B = BLOCK;
        for (let i = 0; i <= len; i++) {
            if (gaps.some((g) => i >= g[0] && i <= g[1])) continue;
            let f = 1 - decay * (this.wob(i / 2.6 + seed) * 1.25 - 0.1);
            if (this.r() < decay * 0.28) f -= 0.3 + this.r() * 0.3; // (a broken tooth)
            let hi = Math.round(h * Math.max(0, Math.min(1, f)));
            if (hi < 1) { if (this.r() < 0.45) hi = 1; else continue; }
            const win = wins.find((w) => i >= w[0] && i <= w[1]);
            for (let t = 0; t < th; t++) {
                const u = alongU ? u0 + dir * i : u0 + t * side, v = alongU ? v0 + t * side : v0 + dir * i;
                // (the stone of a stretch of wall: patches of one kind, not stripes — the bricks of a repair, a mossy length)
                const m = mat || weigh(this.th.stone, 0.72 * this.wob(i / 3.2 + seed2 + t * 7) + 0.28 * this.r()), cap = decay > 0.15 && this.r() < 0.55 ? this.moss() : m;
                const put = (a, b, mm) => { if (b >= a) this.put(u, u, lift + a, lift + b, v, v, mm); };
                if (win && hi - 1 > win[2]) {
                    put(0, win[2] - 1, m);
                    if (hi - 1 > win[3]) { put(win[3] + 1, hi - 2, m); put(hi - 1, hi - 1, cap); }
                } else { put(0, hi - 2, m); put(hi - 1, hi - 1, cap); }
                if (cren && hi === h && i % 2 === 0) put(hi, hi, m);
            }
            // ivy grown up its foot
            if (ivy && this.r() < ivy) {
                const uu = alongU ? u0 + dir * i : u0 - side, vv = alongU ? v0 - side : v0 + dir * i;
                this.put(uu, uu, lift, lift + this.rint(0, 1), vv, vv, this.r() < 0.5 ? B.LEAVES : B.BIRCH_LEAVES);
            }
        }
    }

    /** A round wall (the ring from radius hr to r) of 16 sectors, each its own height; the fallen side faces `fall` (radians). */
    ring(u, v, r, hr, h, { fall = null, lo = 2, lift = 0, mat = null, doors = [] } = {}) {
        const N = Math.max(12, Math.round(r * 3.2)), seed = this.r() * 40;
        for (let i = 0; i < N; i++) {
            const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU, am = (a0 + a1) / 2;
            if (doors.some((d) => Math.abs(((am - d.a + Math.PI * 3) % TAU) - Math.PI) < d.w)) continue; // (a doorway: no wall)
            let f = 0.55 + 0.45 * this.wob(i / 1.7 + seed);
            if (fall != null) {
                const d = Math.abs(((am - fall + Math.PI * 3) % TAU) - Math.PI); // 0 at the fall, π opposite
                f = lo / h + (1 - lo / h) * Math.min(1, d / (Math.PI * 0.8)) * (0.7 + 0.3 * this.wob(i / 1.3 + seed));
            }
            const hi = Math.max(1, Math.round(h * Math.min(1, f)));
            const m = mat || this.stone();
            this.p.sector(u, v, r, hr, a0, a1, lift, lift + hi - 2, m);
            this.p.sector(u, v, r, hr, a0, a1, lift + hi - 1, lift + hi - 1, this.r() < 0.5 ? this.moss() : m);
        }
    }

    /** A pillar (a base, a shaft, a capital) `h` high; broken (0…1) the chance it has snapped. */
    pillar(u, v, h, { broken = 0.3, base = null, cap = null, mat = null, lift = 0 } = {}) {
        const B = BLOCK, snapped = this.r() < broken;
        const top = snapped ? Math.max(1, Math.round(h * (0.25 + this.r() * 0.5))) : h;
        const m = mat || this.stone();
        this.put(u, u, lift, lift, v, v, base ?? this.th.fine);
        if (top > 1) this.put(u, u, lift + 1, lift + top - 1, v, v, m);
        if (!snapped) this.put(u, u, lift + top, lift + top, v, v, cap ?? this.th.fine);
        else if (this.r() < 0.8) this.rubble(u + (this.r() < 0.5 ? 1 : -1), v + (this.r() < 0.5 ? 1 : -1), 1.4);
        void B;
    }

    /** A heap of fallen blocks: its middle highest (1 or 2 blocks), the edge a stray stone. */
    rubble(u, v, rad, lift = 0, maxH = this.under ? 1 : 2) {
        const R = Math.ceil(rad);
        for (let du = -R; du <= R; du++) for (let dv = -R; dv <= R; dv++) {
            const d = Math.hypot(du, dv);
            if (d > rad) continue;
            const hmax = Math.min(maxH, Math.round((1 - d / rad) * 1.9 + this.r() * 0.7));
            if (hmax > 0) this.put(u + du, u + du, lift, lift + hmax - 1, v + dv, v + dv, this.heap());
        }
    }

    /** A bush (leaves a block or two high) and, in the middle of big ones, a taller crown. */
    bush(u, v, r = 1.5, lift = 0) {
        const B = BLOCK, leaf = this.r() < 0.35 ? B.BIRCH_LEAVES : B.LEAVES;
        this.cylP(u, v, r, lift, lift + 1, leaf);
        if (r >= 1.5) this.cylP(u, v, r * 0.55, lift + 2, lift + 2, leaf);
    }

    /** A dead tree: a trunk with a few boughs and a few leaves left. */
    deadTree(u, v, h = 5, lift = 0) {
        const B = BLOCK, w = this.r() < 0.5 ? B.BIRCH : B.DARK;
        this.put(u, u, lift, lift + h - 1, v, v, w);
        for (let i = 0; i < 3; i++) {
            const a = this.r() * TAU, du = Math.round(Math.cos(a) * 1.2), dv = Math.round(Math.sin(a) * 1.2), y = lift + h - 2 + (i % 2);
            if (du || dv) { this.put(u + du, u + du, y, y, v + dv, v + dv, w); if (this.r() < 0.6) this.put(u + du * 2, u + du * 2, y + 1, y + 1, v + dv * 2, v + dv * 2, B.DARK_LEAVES); }
        }
    }

    /** Flags over a rectangle at layer l (a floor): two kinds mixed, some cells of another, holes where the ground shows. */
    flags(u0, u1, v0, v1, { l = -1, worn = 0.12, hole = 0.08, coarse = 1 } = {}) {
        const B = BLOCK;
        this.put(u0, u1, l, l, v0, v1, this.flag());
        for (let u = u0; u <= u1; u += coarse) for (let v = v0; v <= v1; v += coarse) {
            const x = this.r();
            if (x < hole) this.put(u, u + coarse - 1, l, l, v, v + coarse - 1, this.r() < 0.6 ? B.GRASS : B.DIRT);
            else if (x < hole + worn) this.put(u, u + coarse - 1, l, l, v, v + coarse - 1, this.flag());
        }
    }

    // ---------------------------------------------------------- chests
    /**
     * A chest at (u, v) facing (fu, fv) (one of the four axes) on the floor of layer l − 1: clears its nook (5 wide, 3 high, one
     * block behind, two in front) and lays its floor. Returns false when the kind wants no more chests.
     */
    chest(u, v, fu, fv, l = 0, room = '') {
        if (this.chests.length >= this.want) return false;
        const across = (a, b, c, d) => (fv ? [u + a, u + b, v + c * fv, v + d * fv] : [u + c * fu, u + d * fu, v + a, v + b]);
        const [ua, ub, va, vb] = across(-2, 2, -1, 2);
        const floorBox = across(-2, 2, -2, 3);
        this.d.push([Math.min(floorBox[0], floorBox[1]), Math.max(floorBox[0], floorBox[1]), l - 1, l - 1, Math.min(floorBox[2], floorBox[3]), Math.max(floorBox[2], floorBox[3]), this.flag()]);
        const clear = [Math.min(ua, ub), Math.max(ua, ub), l, l + 3, Math.min(va, vb), Math.max(va, vb), 0];
        this.d.push(clear); // (in the order of the pieces: what was put before it gives way, what comes after must keep clear)
        const p = this.p, x = p.wx(u, v), z = p.wz(u, v);
        const a = Math.atan2(p.wx(u + fu, v + fv) - x, p.wz(u + fu, v + fv) - z);
        this.chests.push({ x, y: p.pt(u, v, l).y, z, a, room, look: null });
        return true;
    }
}

