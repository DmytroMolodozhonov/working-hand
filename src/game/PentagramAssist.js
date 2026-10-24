/**
 * PentagramAssist.js — drawing a pentagram WITH HELP (pure, no THREE; node-testable). The author: «рисовать очень сложно — линия слишком
 * точно следует руке, а у людей руки трясутся».
 *
 *  1. THE CIRCLE comes first, always. The hand only goes round an approximate circle; the circle on the ground is a perfect one
 *     fitted to the hand (`fitCircle`: least squares on all the stitches — centre and radius), and the line laid goes along it, not along the
 *     trembling hand. It closes by itself when ≥ `ASSIST.CLOSE_COVER` of the way round is passed and the shape is round enough
 *     (rough is fine). Its size is the one the hero drew, between `ASSIST.R_MIN` and `ASSIST.R_MAX` m.
 *  2. THE GUIDING POINTS. When the circle closes, glowing points appear inside it — the corners and crossings of the figures the hero has
 *     LEARNT (a burnt scroll): the five corners and five inner crossings of the star, the four corners of the square of teleportation…
 *     Every drawing has them; the points of several learnt figures are shown together. The wand is drawn to the nearest point (the magnet,
 *     `magnet()`); the hero leads it from point to point and the line lies straight between them, the trembling does not matter.
 *     Only a connection that belongs to some learnt figure is drawn (a chord of the star may be led over its crossings in one move);
 *     any other is refused, nothing is drawn («ведите к светящейся точке»). When every line of one figure is drawn, the pentagram counts.
 *     Nothing learnt: no points, nothing counts.
 */

import { figureLines } from './PentagramRules.js';

export const ASSIST = {
    R_MIN: 3, R_MAX: 8, // m: the circle's radius (a hero is 3.5 m; the author)
    CLOSE_COVER: 0.78, // the share of the way round that must be passed (36 sectors)
    MAX_RMS: 0.3, // of the radius: how far the stitches may lie from the fitted circle on average (rough is fine)
    SHOW_RMS: 0.5, // … the fitted circle is shown (laid) while the hand is this round
    MIN_PTS: 10, // stitches before a circle is fitted
    STEP: 0.3, // m between two stitches of the hand
    MAX_PTS: 420,
    MAGNET_MAX: 0.8, // m: the point draws the wand in from this far (never more than 45 % of the gap between two points)
    MERGE: 0.03, // (unit radius) two points of figures this near are one
};

const TAU = Math.PI * 2;
const SECTORS = 36;

/** The circle through the stitches `pts` ([[x, z]…]) fitted by least squares (Kåsa): {cx, cz, r, rms (of r)} | null. */
export function fitCircle(pts) {
    const n = pts.length;
    if (n < 3) return null;
    let sx = 0, sz = 0;
    for (const p of pts) { sx += p[0]; sz += p[1]; }
    const mx = sx / n, mz = sz / n; // (centred: steadier numbers)
    let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
    for (const p of pts) {
        const u = p[0] - mx, v = p[1] - mz;
        suu += u * u; suv += u * v; svv += v * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
    }
    const det = suu * svv - suv * suv;
    if (Math.abs(det) < 1e-9) return null;
    const a = (suuu + suvv) / 2, b = (svvv + svuu) / 2;
    const uc = (a * svv - b * suv) / det, vc = (b * suu - a * suv) / det;
    const cx = mx + uc, cz = mz + vc;
    let r2 = 0;
    for (const p of pts) r2 += Math.hypot(p[0] - cx, p[1] - cz);
    const r = r2 / n;
    if (!(r > 1e-6)) return null;
    let e = 0;
    for (const p of pts) { const d = Math.hypot(p[0] - cx, p[1] - cz) - r; e += d * d; }
    return { cx, cz, r, rms: Math.sqrt(e / n) / r };
}

/** The share of the way round the centre (cx, cz) that the stitches have passed (sectors hit). */
export function arcCoverage(pts, cx, cz) {
    const hit = new Uint8Array(SECTORS);
    const ang = (p) => Math.atan2(p[1] - cz, p[0] - cx);
    const mark = (a) => { hit[Math.min(SECTORS - 1, Math.floor((((a % TAU) + TAU) % TAU) / TAU * SECTORS))] = 1; };
    for (let i = 0; i < pts.length; i++) {
        const a0 = ang(pts[i]);
        mark(a0);
        if (i === 0) continue;
        let d = a0 - ang(pts[i - 1]);
        d = Math.atan2(Math.sin(d), Math.cos(d)); // (the short way between two stitches: the sectors between them are passed too, a small circle has few stitches)
        if (Math.abs(d) > 1.2) continue; // (a jump across the middle is no arc)
        const k = Math.ceil(Math.abs(d) / (TAU / SECTORS));
        for (let j = 1; j < k; j++) mark(ang(pts[i - 1]) + (d * j) / k);
    }
    let k = 0;
    for (let i = 0; i < SECTORS; i++) k += hit[i];
    return k / SECTORS;
}

/**
 * The first phase: the hand goes round, the circle is fitted. `add(x, z)` per frame with where the wand meets the ground →
 * `{t: 'stitch', x, z}` (a point of the perfect circle to lay) | `{t: 'closed', cx, cz, r}` | `{t: 'bad', why: 'small'|'large'}` | null.
 */
export class CircleAssist {
    constructor() { this.pts = []; this.fit = null; this.cover = 0; }

    add(x, z) {
        const P = this.pts, l = P[P.length - 1];
        if (l && Math.hypot(x - l[0], z - l[1]) < ASSIST.STEP) return null;
        if (P.length >= ASSIST.MAX_PTS) P.shift();
        P.push([x, z]);
        if (P.length < ASSIST.MIN_PTS) return { t: 'stitch', x, z };
        const f = this.fit = fitCircle(P);
        if (!f || f.rms > ASSIST.SHOW_RMS) return { t: 'stitch', x, z };
        this.cover = arcCoverage(P, f.cx, f.cz);
        if (this.cover >= ASSIST.CLOSE_COVER && f.rms <= ASSIST.MAX_RMS) {
            if (f.r < ASSIST.R_MIN) return { t: 'bad', why: 'small', ...f };
            if (f.r > ASSIST.R_MAX) return { t: 'bad', why: 'large', ...f };
            return { t: 'closed', cx: f.cx, cz: f.cz, r: f.r };
        }
        const d = Math.hypot(x - f.cx, z - f.cz) || 1; // (the stitch laid lies on the perfect circle, not on the hand)
        return { t: 'stitch', x: f.cx + (x - f.cx) / d * f.r, z: f.cz + (z - f.cz) / d * f.r };
    }
}

// ---------------------------------------------------------------- the graph of the figures (unit radius)


/** Where segments (p, q) and (r, s) cross inside both (not at their ends): [x, z] | null. */
function crossing(p, q, r, s) {
    const d1x = q[0] - p[0], d1z = q[1] - p[1], d2x = s[0] - r[0], d2z = s[1] - r[1];
    const den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((r[0] - p[0]) * d2z - (r[1] - p[1]) * d2x) / den, u = ((r[0] - p[0]) * d1z - (r[1] - p[1]) * d1x) / den;
    const e = 0.02;
    if (t <= e || t >= 1 - e || u <= e || u >= 1 - e) return null;
    return [p[0] + d1x * t, p[1] + d1z * t];
}

/**
 * The guiding points and the lines of the figures `ids`: {nodes: [{u: [x, z], ids: [id…]}], edges: [{a, b, key, ids}], chords: [{nodes: [i…], ids}], need: {id: [edge key…]}}.
 * A chord is one straight line of a figure with the points lying on it in order (a chord of the star runs over two crossings).
 * Pure: unit radius, the figure's own orientation.
 */
export function buildGraph(ids) {
    const nodes = [], edges = new Map(), chords = [], need = {};
    const nodeAt = (u, id) => {
        let i = nodes.findIndex((n) => Math.hypot(n.u[0] - u[0], n.u[1] - u[1]) < ASSIST.MERGE);
        if (i < 0) { nodes.push({ u: [u[0], u[1]], ids: [] }); i = nodes.length - 1; }
        if (!nodes[i].ids.includes(id)) nodes[i].ids.push(id);
        return i;
    };
    for (const id of ids) {
        const segs = [];
        for (const poly of figureLines(id, 0)) {
            if (poly.length === 2) segs.push([poly[0], poly[1]]);
            else for (let k = 0; k < poly.length; k++) segs.push([poly[k], poly[(k + 1) % poly.length]]);
        }
        need[id] = [];
        const own = new Set();
        const pts = segs.map(([p, q]) => ({ p, q, on: [{ u: p, t: 0 }, { u: q, t: 1 }] }));
        for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
            const x = crossing(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
            if (!x) continue;
            for (const s of [i, j]) {
                const { p, q } = pts[s], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
                pts[s].on.push({ u: x, t: Math.hypot(x[0] - p[0], x[1] - p[1]) / d });
            }
        }
        for (const s of pts) {
            s.on.sort((a, b) => a.t - b.t);
            const list = s.on.map((o) => nodeAt(o.u, id));
            const dedup = list.filter((n, k) => k === 0 || n !== list[k - 1]);
            if (dedup.length < 2) continue;
            const chord = chords.find((c) => c.nodes.join() === dedup.join() || c.nodes.slice().reverse().join() === dedup.join());
            if (chord) { if (!chord.ids.includes(id)) chord.ids.push(id); } else chords.push({ nodes: dedup, ids: [id] });
            for (let k = 0; k + 1 < dedup.length; k++) {
                const a = dedup[k], b = dedup[k + 1], key = a < b ? `${a}-${b}` : `${b}-${a}`;
                let e = edges.get(key);
                if (!e) edges.set(key, (e = { a: Math.min(a, b), b: Math.max(a, b), key, ids: [] }));
                if (!e.ids.includes(id)) e.ids.push(id);
                if (!own.has(key)) { own.add(key); need[id].push(key); }
            }
        }
    }
    return { nodes, edges: [...edges.values()], chords, need, ids: ids.slice() };
}

/** The edges (keys) one move from point `a` to point `b` draws: along a chord of some figure, over the points between; [] if no figure joins them. */
export function pathBetween(graph, a, b) {
    for (const c of graph.chords) {
        const i = c.nodes.indexOf(a), j = c.nodes.indexOf(b);
        if (i < 0 || j < 0 || i === j) continue;
        const out = [];
        for (let k = Math.min(i, j); k < Math.max(i, j); k++) { const x = c.nodes[k], y = c.nodes[k + 1]; out.push(x < y ? `${x}-${y}` : `${y}-${x}`); }
        return out;
    }
    return [];
}

/** The second phase: the wand is led from point to point on the closed circle. */
export class LineAssist {
    /** @param graph buildGraph(ids)  @param circle {cx, cz, r, rot} (rot: the figure turned in the plane — the apex away from the hero) */
    constructor(graph, circle) {
        this.graph = graph; this.circle = circle;
        this.drawn = new Set(); this.cur = -1; this.hover = -1; this.done = null;
        const ca = Math.cos(circle.rot || 0), sa = Math.sin(circle.rot || 0);
        this.world = graph.nodes.map((n) => [circle.cx + circle.r * (n.u[0] * ca - n.u[1] * sa), circle.cz + circle.r * (n.u[0] * sa + n.u[1] * ca)]);
        let gap = Infinity;
        for (let i = 0; i < this.world.length; i++) for (let j = i + 1; j < this.world.length; j++) gap = Math.min(gap, Math.hypot(this.world[i][0] - this.world[j][0], this.world[i][1] - this.world[j][1]));
        this.magnetR = Math.min(ASSIST.MAGNET_MAX, 0.45 * (Number.isFinite(gap) ? gap : 2));
    }

    /** The point the wand at (x, z) is drawn to (-1: none). */
    nearest(x, z) {
        let best = -1, bd = this.magnetR;
        for (let i = 0; i < this.world.length; i++) { const d = Math.hypot(this.world[i][0] - x, this.world[i][1] - z); if (d <= bd) { bd = d; best = i; } }
        return best;
    }

    edgeEnds(key) { const e = this.graph.edges.find((o) => o.key === key); return e ? [this.world[e.a], this.world[e.b]] : null; }

    /**
     * The wand is at (x, z): events `[{t: 'attach', node}, {t: 'edges', keys, from, to}, {t: 'refuse', from, to}, {t: 'done', id}]`.
     */
    step(x, z) {
        const ev = [];
        const n = this.nearest(x, z);
        this.hover = n;
        if (n < 0 || n === this.cur || this.done) return ev;
        if (this.cur < 0) { this.cur = n; ev.push({ t: 'attach', node: n }); return ev; }
        const path = pathBetween(this.graph, this.cur, n);
        const from = this.cur;
        this.cur = n;
        if (!path.length) { ev.push({ t: 'refuse', from, to: n }); return ev; }
        const fresh = path.filter((k) => !this.drawn.has(k));
        for (const k of fresh) this.drawn.add(k);
        if (fresh.length) ev.push({ t: 'edges', keys: fresh, from, to: n });
        const id = this.graph.ids.find((f) => this.graph.need[f].length && this.graph.need[f].every((k) => this.drawn.has(k)));
        if (id) { this.done = id; ev.push({ t: 'done', id }); }
        return ev;
    }
}

/** Guiding points to show: `[{x, z, ids}]` of the world. */
export const anchorsOf = (la) => la.world.map((w, i) => ({ x: w[0], z: w[1], ids: la.graph.nodes[i].ids }));

/** The figure's turn so that its apex points away from the hero standing at (hx, hz) (it reads upright from where he stands). */
export const turnAway = (cx, cz, hx, hz) => { const dx = cx - hx, dz = cz - hz, d = Math.hypot(dx, dz) || 1; return Math.atan2(-dx / d, dz / d); };

export const ASSIST_HINT = {
    small: 'Круг слишком мал — тело не поместится: ведите палочку по кругу побольше (в рост человека и больше)',
    large: 'Круг слишком велик — магия не дотянется до края: ведите по кругу поменьше',
    lead: 'Ведите палочку к светящейся точке',
    refuse: 'Отсюда в ту точку линию не провести — ведите к другой светящейся точке',
    circle: 'Сначала обведите палочкой круг на земле — ровно рисовать не нужно, он ляжет сам',
};
