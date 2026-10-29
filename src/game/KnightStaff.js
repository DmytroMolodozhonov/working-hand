/**
 * Where the knights of a castle of generation 21+ stand (the table of posts: world/KnightPosts.js). The king, his advisor and the merchants are
 * not counted here. A post is a place with its facing; the knight's `post` is also his «home» — after an alarm (Danger.js, KNIGHT_SEE) he walks
 * back to it by the guard job (CastleLife: case 'guard'), a patrol picks its loop up again.
 */
import { postPlan } from '../world/KnightPosts.js';

const faceOut = (def, n) => Math.atan2(-(n.x - def.x), -(n.z - def.z)); // (yaw 0 looks along −z: forward = (−sin, −cos))

/** The place of a room of this kind: the walk-graph node nearest its middle (never in a piece of furniture). */
function roomPost(cs, kinds) {
    const g = cs.graph;
    for (const k of kinds) {
        const r = cs.def.rooms.find((q) => q.kind === k);
        if (!r) continue;
        const id = g.nearest((r.x0 + r.x1) / 2, r.y, (r.z0 + r.z1) / 2, 4);
        const n = id >= 0 ? g.nodes[id] : null;
        if (n) return { x: n.x, y: n.y, z: n.z, yaw: faceOut(cs.def, n) + Math.PI };
    }
    return null;
}

/**
 * (host) Put the day's knights at their posts: `knight(at, job, post)` takes the next free knight (CastleLife._staffDay). The two by the throne
 * are put by the caller before this. Returns the plan (for the log and the tests).
 */
export function staffKnights(life, cs, knight) {
    const def = cs.def, g = cs.graph;
    const plan = postPlan(def.knights, { port: !!def.port });
    const loop = def.wallWalk || [];
    let tower = 0, patrol = 0, quay = 0;
    const out = [];
    const mark = (v, kind) => { if (v) { v.postKind = kind; life.alog?.decision?.(v, `пост: ${kind}`); } return v; };
    for (const kind of plan) {
        let v = null;
        if (kind === 'throne') continue; // (put already: the king's two)
        if (kind === 'gate') {
            const p = def.posts[Math.min(def.posts.length - 1, out.filter((o) => o === 'gate').length)];
            if (p) v = knight(p, 'guard', p);
        } else if (kind === 'tower') {
            const n = g.nodes[loop[def.towerPosts?.[tower++ % 4] ?? 0]];
            if (n) { const at = { x: n.x, y: n.y, z: n.z, yaw: faceOut(def, n) }; v = knight(at, 'guard', at); }
        } else if (kind === 'patrol') {
            if (patrol++ === 0 && loop.length >= 6) { // (the wall walk, from the middle of the front wall)
                const n = g.nodes[loop[Math.floor(loop.length / 8)]];
                v = knight({ x: n.x, y: n.y, z: n.z }, 'patrol');
                if (v) v.loopI = Math.floor(loop.length / 8);
            } else { // (the yard: the gate, the yard's nodes, the keep's door)
                const ids = g.tagged('gateIn').concat(g.tagged('yard'), g.tagged('keepDoor'));
                const n = g.nodes[ids[0]];
                v = n && knight({ x: n.x, y: n.y, z: n.z }, 'patrol');
                if (v) { v.loopIds = ids; v.loopI = 0; }
            }
        } else if (kind === 'port') {
            const ids = g.tagged('quay');
            const n = g.nodes[ids[quay % Math.max(1, ids.length)]];
            if (n) { v = knight({ x: n.x, y: n.y, z: n.z }, 'patrol'); if (v) { v.loopIds = ids; v.loopI = quay * Math.floor(ids.length / 2); } }
            quay++;
        } else if (kind === 'barracks' || kind === 'treasury' || kind === 'kitchen') {
            const at = kind === 'barracks'
                ? (g.tagged('barracksDoor')[0] != null ? (() => { const n = g.nodes[g.tagged('barracksDoor')[0]]; return { x: n.x, y: n.y, z: n.z, yaw: faceOut(def, n) }; })() : null)
                : roomPost(cs, kind === 'treasury' ? ['treasury', 'storeroom'] : ['kitchen', 'dining']);
            if (at) v = knight(at, 'guard', at);
        }
        if (!v && kind !== 'yard') { // (no such place in this castle: a round of the yard instead)
            const n = g.nodes[g.tagged('yard')[0] ?? 0];
            if (n) v = knight({ x: n.x, y: n.y, z: n.z }, 'yard');
        } else if (!v) {
            const ids = g.tagged('yard').concat(g.tagged('well'));
            const n = g.nodes[ids[out.length % Math.max(1, ids.length)]];
            if (n) v = knight({ x: n.x, y: n.y, z: n.z }, 'yard');
        }
        out.push(kind);
        mark(v, kind);
    }
    return out;
}
