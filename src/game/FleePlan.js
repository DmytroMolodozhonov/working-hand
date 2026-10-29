/**
 * FleePlan.js — where a frightened one runs (pure, Node-testable).
 *
 * The author: «Ты должен, наоборот, бежать от меня, и не по дорожке, а просто как можно дальше,
 * если боишься». So a fleeing person never takes a way that passes the thing it runs from (the
 * attacker, the blast, the hole it left): the paths are weighed with a big cost near every threat
 * (`threatCost` → Graph.path), the place it runs to is the one farthest from all of them that it
 * can reach without passing them (`pickRefuge`), and out in the open it does not keep to the roads
 * at all — it runs straight away across the land (`openWay`), round what it can't go through.
 *
 * threats: [{x, z, r}] — r: how near it is deadly / dreadful (m).
 */

export const FLEE = {
    SAFE: 45, // m beyond a threat's r: far enough — it stops and watches (keeps away while it lasts)
    REPLAN: 2.0, // s between looks for a better way
    NEAR: 6, // m beyond r: a path node this near a threat costs a lot (passing it)
    STEP: 16, // m: how far ahead a run across the open land is planned
    CROWD: 9, // the score a place loses for every other runner already heading there (spread out, do not pile up)
};

/** How far p is from the nearest threat (beyond its r; negative: inside it). */
export function threatDist(p, threats) {
    let d = Infinity;
    for (const t of threats) d = Math.min(d, Math.hypot(p.x - t.x, p.z - t.z) - (t.r || 0));
    return d;
}

/** Extra cost (m) of going through node n: nothing far off, a lot near a threat, «never» inside one. */
export function threatCost(n, threats) {
    let c = 0;
    for (const t of threats) {
        const d = Math.hypot(n.x - t.x, n.z - t.z) - (t.r || 0);
        if (d < 0) c += 400;
        else if (d < FLEE.NEAR) c += 60 * (1 - d / FLEE.NEAR) + 20;
    }
    return c;
}

/** The unit way straight away from all threats (the nearer ones pull harder). */
export function awayDir(p, threats) {
    let ax = 0, az = 0;
    for (const t of threats) {
        const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz) || 1e-3;
        const w = 1 / Math.max(1, d - (t.r || 0) * 0.5);
        ax += dx / d * w; az += dz / d * w;
    }
    const L = Math.hypot(ax, az);
    return L < 1e-6 ? { x: 1, z: 0 } : { x: ax / L, z: az / L };
}

/**
 * The place to run to among the graph's nodes: the farthest from the threats it can get to without
 * going nearer them on the way (the straight line to it doesn't pass a threat), not too far to run.
 * nodes: [{id, x, y, z}] (candidates); from: {x, y, z}. → node id or -1. (The path itself is then
 * weighed with threatCost, so it doesn't run past them either.)
 */
export function pickRefuge(nodes, from, threats, opts = {}) {
    return rankRefuges(nodes, from, threats, opts)[0] ?? -1;
}

/** The places to run to, best first (pickRefuge's order) — the next is tried when the way to one passes a threat. */
export function rankRefuges(nodes, from, threats, { maxRun = 90, minGain = 4, floorK = 0.6, top = 5 } = {}) {
    const d0 = threatDist(from, threats);
    const out = [];
    for (const n of nodes) {
        const run = Math.hypot(n.x - from.x, n.z - from.z) + Math.abs(n.y - from.y) * floorK;
        if (run > maxRun || run < 3) continue;
        const d = threatDist(n, threats);
        if (d < Math.min(FLEE.SAFE, d0 + minGain)) continue; // (not farther than here: no use running there)
        if (passes(from, n, threats)) continue;
        out.push({ id: n.id, s: Math.min(d, FLEE.SAFE + 25) - 0.35 * run });
    }
    out.sort((a, b) => b.s - a.s);
    return out.slice(0, top).map((o) => o.id);
}

/** Does this way (nodes) take one into a threat (nearer than it is now, within its r)? Then it's no way to flee by. */
export function pathPasses(path, nodes, from, threats) {
    const d0 = threatDist(from, threats);
    const lim = Math.min(0, d0 - 1);
    for (const id of path) if (threatDist(nodes[id], threats) < lim) return true;
    return false;
}

/** Does going straight from p to q pass within a threat's r (+3 m) — while p itself is out of it? (The refuge is farther from them all: pickRefuge.) */
export function passes(p, q, threats) {
    for (const t of threats) {
        const R = (t.r || 0) + 3;
        const sx = q.x - p.x, sz = q.z - p.z, L2 = sx * sx + sz * sz || 1;
        const k = Math.max(0, Math.min(1, ((t.x - p.x) * sx + (t.z - p.z) * sz) / L2));
        const cx = p.x + sx * k, cz = p.z + sz * k;
        if (Math.hypot(t.x - cx, t.z - cz) < R && Math.hypot(t.x - p.x, t.z - p.z) > R) return true;
    }
    return false;
}

/**
 * Across the open land: a point about `len` m away from the threats that one can run to —
 * `walk(x, z)` says where one can stand. Tries straight away first, then wider and wider either
 * side (never back towards a threat). → {x, z} or null (no way: cornered).
 */
export function openWay(p, threats, walk, len = FLEE.STEP) {
    const a = awayDir(p, threats);
    for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75, 2.1, -2.1]) {
        const c = Math.cos(da), s = Math.sin(da);
        const ux = a.x * c - a.z * s, uz = a.x * s + a.z * c;
        let ok = true, far = 0;
        for (let r = 1.5; r <= len; r += 1.5) {
            if (!walk(p.x + ux * r, p.z + uz * r)) { ok = r > 6; break; }
            far = r;
        }
        if (!ok || far < 6) continue;
        const q = { x: p.x + ux * far, z: p.z + uz * far };
        if (threatDist(q, threats) < threatDist(p, threats) + far * (Math.abs(da) > 1.5 ? 0.2 : 0.4)) continue; // (a way round a wall: at least it takes one farther)
        return q;
    }
    return null;
}

/**
 * The way to flee through a building / a castle's ways: one search from where it stands over all the
 * ways (never through a cut one, never through a place inside a threat — nearer than it is now), and
 * of all the places it can so reach, the one farthest from the threats for the least running.
 * graph: {nodes, adj}; from: start node; p: {x, y, z} where it stands; cut: Set of edge keys; key(a, b).
 * → {goal, path} (node ids) or null.
 */
export function fleeSearch(graph, from, p, threats, { cut = null, key = null, maxRun = 120, minGain = 4, bonus = null, load = null } = {}) {
    const N = graph.nodes, adj = graph.adj;
    if (from < 0 || !N[from]) return null;
    const d0 = threatDist(p, threats);
    const lim = Math.min(0, d0 - 1);
    const dist = new Map([[from, 0]]), prev = new Map();
    const open = [[0, from]];
    const done = new Set();
    let best = -1, bs = -Infinity;
    while (open.length) {
        // (a small binary heap)
        const top = open[0], last = open.pop();
        if (open.length) { open[0] = last; siftDown(open, 0); }
        const [c, cur] = top;
        if (done.has(cur)) continue;
        done.add(cur);
        const n = N[cur];
        const d = threatDist(n, threats);
        if (cur !== from && c > 3 && d >= Math.min(FLEE.SAFE, d0 + minGain)) {
            // (bonus: a sheltered place — behind a wall, in a building; load: others run there already — spread out, no heap: WizardMind / CastleLife)
            const sc = Math.min(d, FLEE.SAFE + 25) - 0.35 * c + (bonus ? bonus(n, cur) : 0) - (load ? FLEE.CROWD * load(cur) : 0);
            if (sc > bs) { bs = sc; best = cur; }
        }
        for (const nb of adj[cur]) {
            if (done.has(nb) || (cut?.size && key && cut.has(key(cur, nb)))) continue;
            const m = N[nb];
            if (threatDist(m, threats) < lim) continue; // (into the threat: no way)
            const nc = c + Math.hypot(m.x - n.x, (m.y - n.y) * 1.5, m.z - n.z) + threatCost(m, threats) * 0.25;
            if (nc > maxRun || nc >= (dist.get(nb) ?? Infinity)) continue;
            dist.set(nb, nc); prev.set(nb, cur);
            open.push([nc, nb]); siftUp(open, open.length - 1);
        }
    }
    if (best < 0) return null;
    const path = [best];
    for (let c = best; prev.has(c);) { c = prev.get(c); path.push(c); }
    return { goal: best, path: path.reverse() };
}

function siftUp(h, i) {
    while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
}
function siftDown(h, i) {
    for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) return;
        [h[m], h[i]] = [h[i], h[m]]; i = m;
    }
}

/**
 * Cornered: a trader pressed to her counter, a body in a pocket between a wall and the thing it runs from (the author's log: «пути нет», 10 s
 * on the spot). Looks all round for the open way that is longest and not towards a threat: along a wall is fine when nothing else is free.
 * `walk(x, z)` says where one can stand. → {x, z} (a point 3–10 m off) or null (really shut in on all sides).
 */
export function escapeWay(p, threats, walk, len = 10) {
    const d0 = threatDist(p, threats);
    let best = null, bs = -Infinity;
    for (let k = 0; k < 24; k++) {
        const a = k * Math.PI / 12, ux = Math.cos(a), uz = Math.sin(a);
        let far = 0;
        for (let r = 1; r <= len; r += 1) { if (!walk(p.x + ux * r, p.z + uz * r) || !walk(p.x + ux * (r + 0.5), p.z + uz * (r + 0.5))) break; far = r; }
        if (far < 3) continue;
        const q = { x: p.x + ux * far, z: p.z + uz * far };
        const gain = threatDist(q, threats) - d0;
        if (gain < -1.5 || passes(p, q, threats)) continue; // (never nearer them, never past them)
        let side = 0; // (room at the sides of the way: a wide way is better than hugging a wall)
        for (const m of [-1, 1]) if (walk(p.x + ux * far * 0.5 - uz * m * 1.2, p.z + uz * far * 0.5 + ux * m * 1.2)) side++;
        const s = Math.min(gain, 25) + far * 0.8 + side;
        if (s > bs) { bs = s; best = q; }
    }
    return best;
}
