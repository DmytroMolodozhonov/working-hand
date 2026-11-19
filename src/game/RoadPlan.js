/**
 * RoadPlan.js — a cart (or any slow wheeled thing) finds its way round a lake, a ridge, a forest edge, a village: A* over a coarse grid of
 * the land (the author 19.11: «странники то в озеро падают, то не могут через горбы гор пройти… полностью переписать»). The old driver
 * looked only a few metres ahead along 11 headings and could not leave a dead end (a bay, a cliff, a trunk wall); this plans the whole way.
 *
 * Pure (no THREE, no game): the caller gives `edgeOk(ax, az, bx, bz)` — «can the cart roll from a to b» (Carriages: `wayFree` with the cart's
 * width, slopes, water, trees, walls, drops) — and a time budget per frame; the search runs a few nodes a frame (never a long job in the frame).
 *
 *   const s = new RoadSearch({ sx, sz, gx, gz, edgeOk });   // goal nearer than `reach` counts as reached
 *   while (s.status === 'run') s.step(60);                   // 60 nodes a frame
 *   s.path                                                    // [{x, z}, …] from the start's next cell to the goal's cell (smoothed)
 *
 * «А если»: no way (an island, the goal behind water) → status 'fail' after `maxNodes` (the caller falls back and tries again later);
 * the goal is itself blocked → the nearest reached cell to it wins when the search runs out (`best`), so the cart goes as near as it can;
 * the start is on a bad cell — the edges from it are tried all the same (the cart may be a little off the road).
 */
export const ROAD = {
    CELL: 4, // m: the grid
    MAX_NODES: 3500, // a plan is given up after this many cells (≈ 56 × 56 m of cells all open): a dead end is found, not searched for ever
    HEURISTIC: 1.25, // weighted A*: a little greedy — a plan in few nodes, not the shortest by a hair
    REACH: 6, // m: the goal's cell is reached when a cell this near is
    TURN_COST: 0.6, // m per radian of turn: straighter ways are preferred (a cart turns slowly)
};

const DIRS = [];
for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; DIRS.push({ dx: Math.round(Math.cos(a)), dz: Math.round(Math.sin(a)), len: i % 2 ? Math.SQRT2 : 1, a }); }

/** A binary min-heap on `.f`. */
class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() {
        const a = this.a, top = a[0], last = a.pop();
        if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
        return top;
    }
}

export class RoadSearch {
    constructor({ sx, sz, gx, gz, edgeOk, cell = ROAD.CELL, maxNodes = ROAD.MAX_NODES, reach = ROAD.REACH }) {
        this.o = { cell, maxNodes, reach, edgeOk, gx, gz };
        this.status = 'run';
        this.path = null;
        this.expanded = 0;
        this.open = new Heap();
        this.seen = new Map(); // 'i,j' → node {i, j, g, f, from, dir, closed}
        this.cx = sx; this.cz = sz; // the grid's origin: the start itself (cells are start + k × cell)
        const n = this._node(0, 0, 0, null, -1);
        n.f = this._h(0, 0);
        this.open.push(n);
        this.best = n; this.bestH = this._h(0, 0);
    }

    _pos(i, j) { return { x: this.cx + i * this.o.cell, z: this.cz + j * this.o.cell }; }
    _h(i, j) { const p = this._pos(i, j); return Math.hypot(this.o.gx - p.x, this.o.gz - p.z) * ROAD.HEURISTIC; }
    _node(i, j, g, from, dir) { const n = { i, j, g, f: 0, from, dir, closed: false }; this.seen.set(i + ',' + j, n); return n; }

    /** Expand up to `n` cells. Returns the status ('run' | 'found' | 'fail'). */
    step(n = 50) {
        if (this.status !== 'run') return this.status;
        const o = this.o;
        while (n-- > 0) {
            if (!this.open.size || this.expanded >= o.maxNodes) return this._finish(this.open.size ? 'fail' : 'fail');
            const cur = this.open.pop();
            if (cur.closed) continue;
            cur.closed = true; this.expanded++;
            const cp = this._pos(cur.i, cur.j);
            const toGoal = Math.hypot(o.gx - cp.x, o.gz - cp.z);
            if (toGoal < this.bestH / ROAD.HEURISTIC) { this.best = cur; this.bestH = toGoal * ROAD.HEURISTIC; }
            if (toGoal <= o.reach) return this._finish('found', cur);
            for (let k = 0; k < 8; k++) {
                const d = DIRS[k], ni = cur.i + d.dx, nj = cur.j + d.dz, key = ni + ',' + nj;
                const old = this.seen.get(key);
                if (old?.closed) continue;
                const np = this._pos(ni, nj);
                let turn = 0;
                if (cur.dir >= 0) { turn = Math.abs(d.a - DIRS[cur.dir].a); if (turn > Math.PI) turn = 2 * Math.PI - turn; }
                const g = cur.g + d.len * o.cell + turn * ROAD.TURN_COST * o.cell * 0.25;
                if (old && old.g <= g) continue;
                if (!o.edgeOk(cp.x, cp.z, np.x, np.z)) { if (!old) this._node(ni, nj, Infinity, null, -1).closed = true; continue; } // (a blocked edge: not tried again from here — a cell blocked from ALL sides stays unseen)
                const nn = old || this._node(ni, nj, g, cur, k);
                nn.g = g; nn.from = cur; nn.dir = k; nn.f = g + this._h(ni, nj); nn.closed = false;
                this.open.push(nn);
            }
        }
        return 'run';
    }

    _finish(status, end = null) {
        if (status === 'fail') {
            // (no way to the goal: the nearest cell reached — the caller may go there and plan again; an empty path = nothing better than the start)
            if (this.best && this.best.from) { this.status = 'partial'; this.path = this._trace(this.best); return 'partial'; }
            this.status = 'fail'; return 'fail';
        }
        this.status = 'found'; this.path = this._trace(end);
        return 'found';
    }

    _trace(end) {
        const cells = [];
        for (let n = end; n && n.from; n = n.from) cells.push(this._pos(n.i, n.j));
        cells.reverse();
        // (cells on one straight line are one waypoint: fewer turns to follow)
        const out = [];
        for (let k = 0; k < cells.length; k++) {
            const a = cells[k - 1] || { x: this.cx, z: this.cz }, b = cells[k], c = cells[k + 1];
            if (c && Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) < 1e-6) continue;
            out.push(b);
        }
        return out;
    }
}
