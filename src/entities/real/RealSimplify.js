/**
 * RealSimplify.js — fewer triangles where the surface is flat, the same where it bends (the lips, the eyelids, the
 * knuckles keep their vertices): quadric error metrics (Garland & Heckbert), half-edge collapses — a vertex goes into
 * a neighbour, which keeps its own place, normal and everything it carries (so the surface's true normals from the
 * distance field stay exact). An edge between two parts (the lips' border, a nail's edge) and the open edge of a mesh
 * never move; a collapse that would turn a triangle over or tear the surface is not made.
 */

/**
 * @param {Float32Array} pos  xyz per vertex
 * @param {Uint32Array} idx   triangles
 * @param {number} target     how many triangles to keep
 * @param {Uint8Array} [part] what each vertex is (the borders between parts stay)
 * @returns {{idx: Uint32Array, keep: Int32Array}} the triangles over the kept vertices, and the old → new index map (−1 gone)
 */
export function simplify(pos, idx, target, part = null) {
    const nv = pos.length / 3;
    let nt = idx.length / 3;
    const tri = new Int32Array(idx); // (−1: removed)
    const alive = new Uint8Array(nt).fill(1);
    // vertex → its triangles
    const vt = Array.from({ length: nv }, () => []);
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) vt[tri[t * 3 + k]].push(t);
    // quadrics (10 numbers each: a symmetric 4×4)
    const Q = new Float64Array(nv * 10);
    const addPlane = (v, a, b, c, d, w) => {
        const o = v * 10;
        Q[o] += w * a * a; Q[o + 1] += w * a * b; Q[o + 2] += w * a * c; Q[o + 3] += w * a * d;
        Q[o + 4] += w * b * b; Q[o + 5] += w * b * c; Q[o + 6] += w * b * d;
        Q[o + 7] += w * c * c; Q[o + 8] += w * c * d; Q[o + 9] += w * d * d;
    };
    for (let t = 0; t < nt; t++) {
        const n = triNormal(pos, tri, t);
        if (!n) continue;
        const [a, b, c, area] = n, p = tri[t * 3];
        const d = -(a * pos[p * 3] + b * pos[p * 3 + 1] + c * pos[p * 3 + 2]);
        for (let k = 0; k < 3; k++) addPlane(tri[t * 3 + k], a, b, c, d, area);
    }
    // the fixed vertices: on a mesh's open edge, or where two parts meet
    const fixed = new Uint8Array(nv);
    {
        const edgeCount = new Map();
        for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
            const a = tri[t * 3 + k], b = tri[t * 3 + (k + 1) % 3];
            const key = a < b ? a * nv + b : b * nv + a;
            edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        }
        for (const [key, n] of edgeCount) if (n !== 2) { fixed[Math.floor(key / nv)] = 1; fixed[key % nv] = 1; }
        if (part) for (let t = 0; t < nt; t++) {
            const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
            if (part[a] !== part[b] || part[b] !== part[c]) { fixed[a] = fixed[b] = fixed[c] = 1; }
        }
    }
    const cost = (u, v) => {
        // Q_u at v's place (half-edge collapse u → v)
        const o = u * 10, x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        return Q[o] * x * x + 2 * Q[o + 1] * x * y + 2 * Q[o + 2] * x * z + 2 * Q[o + 3] * x
            + Q[o + 4] * y * y + 2 * Q[o + 5] * y * z + 2 * Q[o + 6] * y
            + Q[o + 7] * z * z + 2 * Q[o + 8] * z + Q[o + 9];
    };
    // a heap of candidate collapses (lazy: stale entries are skipped by the vertices' stamps)
    const stamp = new Int32Array(nv);
    const heap = new Heap();
    const neigh = (u, out) => {
        out.length = 0;
        for (const t of vt[u]) {
            if (!alive[t]) continue;
            for (let k = 0; k < 3; k++) { const w = tri[t * 3 + k]; if (w !== u && !out.includes(w)) out.push(w); }
        }
        return out;
    };
    const nb = [], nb2 = [];
    const pushVertex = (u) => {
        if (fixed[u]) return;
        let best = Infinity, bv = -1;
        for (const v of neigh(u, nb)) { const c = cost(u, v); if (c < best) { best = c; bv = v; } }
        if (bv >= 0) heap.push(best, u, bv, stamp[u]);
    };
    for (let u = 0; u < nv; u++) pushVertex(u);
    const dead = new Uint8Array(nv);
    while (nt > target && heap.size) {
        const e = heap.pop();
        const u = e.u, v = e.v;
        if (dead[u] || dead[v] || e.s !== stamp[u]) continue;
        if (!canCollapse(u, v)) { stamp[u]++; continue; }
        // collapse u → v
        for (const t of vt[u]) {
            if (!alive[t]) continue;
            const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
            if (a === v || b === v || c === v) { alive[t] = 0; nt--; continue; }
            for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === u) tri[t * 3 + k] = v;
            vt[v].push(t);
        }
        dead[u] = 1;
        for (let k = 0; k < 10; k++) Q[v * 10 + k] += Q[u * 10 + k];
        vt[v] = vt[v].filter((t) => alive[t]);
        stamp[v]++;
        pushVertex(v);
        for (const w of neigh(v, nb2)) { stamp[w]++; pushVertex(w); }
    }

    function canCollapse(u, v) {
        // the link condition: u and v share exactly the two vertices of the triangles on their edge
        const nu = neigh(u, nb), nvv = neigh(v, nb2);
        let shared = 0;
        for (const w of nu) if (nvv.includes(w)) shared++;
        if (shared !== 2) return false;
        // no triangle turns over (or becomes a needle)
        for (const t of vt[u]) {
            if (!alive[t]) continue;
            const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
            if (a === v || b === v || c === v) continue;
            const n0 = triNormal(pos, tri, t);
            const s = [a === u ? v : a, b === u ? v : b, c === u ? v : c];
            const n1 = normalOf(pos, s[0], s[1], s[2]);
            if (!n0 || !n1) return false;
            if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0.5) return false;
            if (n1[3] < n0[3] * 0.05) return false;
        }
        return true;
    }

    // what is left, renumbered
    const keep = new Int32Array(nv).fill(-1);
    let k = 0;
    const out = [];
    for (let t = 0; t < tri.length / 3; t++) {
        if (!alive[t]) continue;
        for (let j = 0; j < 3; j++) { const w = tri[t * 3 + j]; if (keep[w] < 0) keep[w] = k++; out.push(keep[w]); }
    }
    return { idx: new Uint32Array(out), keep, count: k };
}

function triNormal(pos, tri, t) { return normalOf(pos, tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]); }
function normalOf(P, a, b, c) {
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-14) return null;
    return [nx / l, ny / l, nz / l, l * 0.5];
}

/** A binary min-heap of {c, u, v, s}. */
class Heap {
    constructor() { this.c = []; this.d = []; this.size = 0; }
    push(c, u, v, s) {
        let i = this.size++;
        this.c[i] = c; this.d[i] = { u, v, s };
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.c[p] <= this.c[i]) break;
            this._swap(i, p); i = p;
        }
    }
    pop() {
        const top = this.d[0];
        const n = --this.size;
        if (n > 0) {
            this.c[0] = this.c[n]; this.d[0] = this.d[n];
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1;
                let m = i;
                if (l < n && this.c[l] < this.c[m]) m = l;
                if (r < n && this.c[r] < this.c[m]) m = r;
                if (m === i) break;
                this._swap(i, m); i = m;
            }
        }
        this.c.length = n; this.d.length = n;
        return top;
    }
    _swap(a, b) { const c = this.c[a]; this.c[a] = this.c[b]; this.c[b] = c; const d = this.d[a]; this.d[a] = this.d[b]; this.d[b] = d; }
}
