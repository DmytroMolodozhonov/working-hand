/**
 * HillWay.js — people on hills (pure core, no THREE).
 *
 * The author: «Рыцари-путешественники поднимаясь по холмам — даже не очень высоким — просто
 * застревают… это не только рыцари, а все человекоподобные существа. Они должны уметь так ходить
 * спокойно». What was found (tools/hillbench.mjs, the real hills of the world's seed):
 *  - up to ~50° (a block a metre and a bit) a step-by-step walk (CastleLife._steer / _walkable /
 *    _tryClimb) goes up and down by itself; what stopped the road folk was the *road*: they look for
 *    a free heading only 8 m ahead (Travelers._footHeading) and keep no memory — at a cliff, a pit
 *    with steep sides or a hill that must be gone round they stood or swung left-right for ever
 *    (and a follower trying to reach its leader in a straight line stood at the first slope the
 *    leader had gone round);
 *  - nothing made it easier going up: a hill took the same time as flat ground, the body stayed
 *    straight.
 * So here: (1) pace by slope (slower uphill, faster downhill), (2) the lean of the body on a slope
 * (VillagerModel), (3) a watchdog `HillNav` — no way made towards the goal for HILL.STALL s → a route
 * round the hill is searched (`RoutePlanner`: A* over a 2 m grid, a couple of ms a frame, only when
 * stalled, so a walk costs nothing extra) and followed point by point.
 */

export const HILL = {
    UP_SLOW: 0.30, // pace lost per unit of slope going up (slope = rise / run: 1 is 45°) → at 45° 70 % of the pace
    PACE_MIN: 0.6,
    DOWN_FAST: 0.10, // pace gained going down
    PACE_MAX: 1.12,
    LEAN_UP: 0.30, // rad: the body leans forward at slope 1 (uphill)
    LEAN_DOWN: 0.10, // rad: and a little back going down
    SLOPE_MAX: 1.5, // the slope worth counting (a ledge climb is no slope)
    STALL: 10, // s without getting nearer to the goal → look for a way round
    GAIN: 3, // m nearer that counts as getting on
    REPLAN: 20, // s between two searches of one walker
    CELL: 2, // m: the search grid
    MARGIN: 40, // m: room round the start and the goal for the search
    MAX_CELLS: 4500, // cells looked at in one search
    STALE: 5, // s without moving on a route → the route is dropped
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * The slope under a walker, from how it has really moved (smoothed): rise / run, + up, − down.
 * Call once a frame after it was moved and put on the ground. Keeps its small memory on `v`.
 */
export function trackSlope(v) {
    if (v.slX === undefined) { v.slX = v.x; v.slY = v.y; v.slZ = v.z; v.slope = 0; return 0; }
    const h = Math.hypot(v.x - v.slX, v.z - v.slZ);
    if (h > 0.03) {
        if (h < 3) {
            const inst = clamp((v.y - v.slY) / h, -HILL.SLOPE_MAX, HILL.SLOPE_MAX);
            v.slope += (inst - v.slope) * Math.min(1, h * 0.8);
        } else v.slope = 0; // (a jump of place — a teleport: not a walk)
        v.slX = v.x; v.slY = v.y; v.slZ = v.z;
    } else if (v.slope) v.slope *= 0.97;
    return v.slope;
}

/** The pace of a walker on its slope (× its speed): slower up, quicker down. */
export function slopePace(slope) {
    if (!slope) return 1;
    return slope > 0 ? Math.max(HILL.PACE_MIN, 1 - HILL.UP_SLOW * Math.min(slope, 1.2)) : Math.min(HILL.PACE_MAX, 1 - HILL.DOWN_FAST * Math.max(slope, -1));
}

/** The forward lean of the body on a slope (rad, + forward; a little back going down). */
export function slopeLean(slope) {
    if (!slope) return 0;
    return slope > 0 ? HILL.LEAN_UP * Math.min(slope, 1.2) : -HILL.LEAN_DOWN * Math.min(-slope, 1);
}

/**
 * A* over a grid of HILL.CELL m from `from` {x, z, y} towards `to` {x, z}. `env.step(x, z, y, nx, nz)` →
 * the height (y) at (nx, nz) when one can walk there from (x, z, y) (one cell, 8 directions), else null.
 * Worked in slices (`work(ms)`) so that a frame never waits for it. Done: `route` — the corners
 * [{x, z}…] — or null (`failed`). When the goal itself cannot be reached within MAX_CELLS cells, the
 * route runs to the cell that is nearest to it among those at least 3 cells from the start (a way
 * past the hill as far as it goes; the walker then goes on from there and looks again).
 */
export class RoutePlanner {
    constructor(env, from, to, o = {}) {
        this.env = env;
        this.C = o.cell ?? HILL.CELL;
        this.max = o.maxCells ?? HILL.MAX_CELLS;
        this.near = o.near ?? this.C * 1.6; // m: «arrived»
        this.sx = from.x; this.sz = from.z;
        this.to = { x: to.x, z: to.z };
        const m = o.margin ?? HILL.MARGIN, C = this.C;
        this.x0 = Math.floor((Math.min(from.x, to.x) - m) / C); this.x1 = Math.ceil((Math.max(from.x, to.x) + m) / C);
        this.z0 = Math.floor((Math.min(from.z, to.z) - m) / C); this.z1 = Math.ceil((Math.max(from.z, to.z) + m) / C);
        this.W = this.x1 - this.x0 + 1;
        this.nodes = []; // {x, z, y, g, f, from, closed}
        this.at = new Map();
        this.heap = [];
        this.n = 0;
        this.done = false;
        this.route = null;
        this.failed = false;
        const cx = Math.round(from.x / C), cz = Math.round(from.z / C);
        this.start = this._node(cx, cz, from.y, 0, null);
        this._push(this.start);
        this.best = null; this.bestH = Infinity;
    }

    _key(cx, cz) { return (cz - this.z0) * this.W + (cx - this.x0); }

    _h(x, z) { return Math.hypot(this.to.x - x, this.to.z - z); }

    _node(cx, cz, y, g, from) {
        const x = cx * this.C, z = cz * this.C;
        const nd = { cx, cz, x, z, y, g, f: g + this._h(x, z), from, closed: false };
        this.at.set(this._key(cx, cz), nd);
        return nd;
    }

    _push(nd) {
        const H = this.heap;
        H.push(nd);
        let i = H.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (H[p].f <= H[i].f) break;
            [H[p], H[i]] = [H[i], H[p]];
            i = p;
        }
    }

    _pop() {
        const H = this.heap, top = H[0], last = H.pop();
        if (H.length) {
            H[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1;
                let m = i;
                if (l < H.length && H[l].f < H[m].f) m = l;
                if (r < H.length && H[r].f < H[m].f) m = r;
                if (m === i) break;
                [H[m], H[i]] = [H[i], H[m]];
                i = m;
            }
        }
        return top;
    }

    /** Work for about `ms` ms. True when finished (see `route`). */
    work(ms = 1.5) {
        if (this.done) return true;
        const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        let k = 0;
        while (this.heap.length) {
            if ((++k & 15) === 0 && (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 > ms) return false;
            const cur = this._pop();
            if (cur.closed) continue;
            cur.closed = true;
            this.n++;
            const h = this._h(cur.x, cur.z);
            if (h <= this.near) return this._finish(cur);
            if (h < this.bestH && Math.hypot(cur.x - this.sx, cur.z - this.sz) >= this.C * 3) { this.bestH = h; this.best = cur; }
            if (this.n >= this.max) break;
            for (const [dx, dz] of DIRS) {
                const cx = cur.cx + dx, cz = cur.cz + dz;
                if (cx < this.x0 || cx > this.x1 || cz < this.z0 || cz > this.z1) continue;
                const key = this._key(cx, cz), old = this.at.get(key);
                if (old && old.closed) continue;
                const ny = this.env.step(cur.x, cur.z, cur.y, cx * this.C, cz * this.C);
                if (ny === null || ny === undefined) continue;
                // (a diagonal must have both its sides open: no cutting a corner of a cliff)
                if (dx && dz && (this.env.step(cur.x, cur.z, cur.y, cur.x + dx * this.C, cur.z) == null || this.env.step(cur.x, cur.z, cur.y, cur.x, cur.z + dz * this.C) == null)) continue;
                const g = cur.g + Math.hypot(dx, dz) * this.C * (1 + Math.min(1, Math.abs(ny - cur.y) * 0.15)); // (a climb costs a little more)
                if (old) {
                    if (g < old.g) { old.g = g; old.f = g + this._h(old.x, old.z); old.from = cur; old.y = ny; this._push({ ...old }); old.closed = false; }
                } else this._push(this._node(cx, cz, ny, g, cur));
            }
        }
        // (searched what it could: the nearest it came)
        return this._finish(this.best && this.bestH < this._h(this.sx, this.sz) - HILL.GAIN ? this.best : null);
    }

    _finish(end) {
        this.done = true;
        if (!end) { this.failed = true; return true; }
        const cells = [];
        for (let n = end; n; n = n.from) cells.push({ x: n.x, z: n.z });
        cells.reverse();
        // (only where it turns: a straight run is one step)
        const out = [];
        for (let i = 1; i < cells.length; i++) {
            const a = cells[i - 1], b = cells[i], c = cells[i + 1];
            if (!c || Math.abs((b.x - a.x) - (c.x - b.x)) > 1e-6 || Math.abs((b.z - a.z) - (c.z - b.z)) > 1e-6) out.push(b);
        }
        if (end.x !== this.to.x || end.z !== this.to.z) { if (Math.hypot(end.x - this.to.x, end.z - this.to.z) <= this.near) out.push({ x: this.to.x, z: this.to.z }); }
        this.route = out.length ? out : null;
        this.failed = !this.route;
        return true;
    }
}

/**
 * The watchdog of one walker (or party) on its way to a goal: `tick` each frame it wants to go.
 * Nearer the goal by GAIN m within STALL s → all is well. Else it asks for a route round
 * (`wantPlan`); the planner is worked by the owner (`plan.work`); the route is followed point
 * by point (`aim`). A route no longer followed (no move for STALE s) is dropped.
 */
export class HillNav {
    constructor() { this.best = Infinity; this.t = 0; this.plan = null; this.route = null; this.i = 0; this.idle = 0; this.lastPlan = -1e9; this.px = NaN; this.pz = NaN; this.start = null; this.prevStart = null; }

    /** left: m to the goal; x, z: where the walker is; clock: seconds of game time; waiting: held up for a good reason (not counted). */
    tick(dt, clock, left, x, z, waiting = false) {
        if (this.route) {
            // (on a route: the walker moves, or the route is dropped)
            const moved = Math.hypot(x - this.px, z - this.pz);
            this.px = x; this.pz = z;
            this.idle = moved < 0.05 * dt * 30 ? this.idle + dt : 0;
            if (this.idle > HILL.STALE) { this.drop(clock); return; }
            const p = this.route[this.i];
            if (!p) { this.drop(clock, true); return; }
            if (Math.hypot(p.x - x, p.z - z) < 1.3) {
                this.i++;
                if (this.i >= this.route.length) this.drop(clock, true);
            }
            return;
        }
        if (waiting) return;
        if (left < this.best - HILL.GAIN) { this.best = left; this.t = 0; } else this.t += dt;
    }

    /** True when it is time to look for a way round (stalled, no search running, not too soon after the last). */
    wantPlan(clock) { return !this.route && !this.plan && this.t > HILL.STALL && clock - this.lastPlan > HILL.REPLAN; }

    /** Begin a search (the walker stands at `at` {x, z}). */
    begin(clock, planner, at) { this.plan = planner; this.lastPlan = clock; this.t = 0; this.prevStart = this.start; this.start = at ? { x: at.x, z: at.z } : null; }

    /** Work the search a little; when finished the route (if any) is taken. */
    work(ms = 1.5) {
        const p = this.plan;
        if (!p) return;
        if (!p.work(ms)) return;
        this.plan = null;
        if (!p.route) return;
        // (a route that leads back to where the last one began: going to and fro between two places — not another round, a long wait)
        const end = p.route[p.route.length - 1], ps = this.prevStart;
        if (ps && Math.hypot(end.x - ps.x, end.z - ps.z) < HILL.CELL * 3) { this.lastPlan += HILL.REPLAN * 2; this.prevStart = null; return; }
        this.route = p.route; this.i = 0; this.idle = 0; this.px = NaN; this.pz = NaN;
    }

    /** The point to steer to now ({x, z}), or null: no route. */
    aim() { return this.route ? this.route[this.i] || null : null; }

    drop(clock, arrived = false) {
        this.route = null; this.i = 0; this.idle = 0;
        this.best = Infinity; this.t = 0;
        if (arrived) this.lastPlan = Math.min(this.lastPlan, clock - HILL.REPLAN + 4); // (it may look again soon)
    }

    /** The walker was set somewhere else / a new goal. */
    reset() { this.plan = null; this.route = null; this.i = 0; this.best = Infinity; this.t = 0; this.idle = 0; }
}
