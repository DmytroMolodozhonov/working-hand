/**
 * RealBuild.js — the «Реалистичный» hero's skin made from its shapes (no THREE: realbody.worker.js runs it once a
 * session, the result is shared by every such hero): the body with both hands, the head with its eyes, teeth and
 * tongue; each with the bones that move every vertex (≤ 4, smooth over the joints) and what the vertex is:
 *
 *   info  = (zone, ao, flush, head) zone: 0 skin, 3 eye (the separate pieces); ao: how hidden; head: 1 on the head's
 *                                    own mesh (its patterns are read in the head's old measures — RealRig.HEADX);
 *                                    flush: how red the skin is there (cheeks, nose, ears, knuckles, knees…)
 *   mix   = (lip, nail, mouth, 0)   the skin's own places (they melt into the skin: blended, not numbered)
 *   limb  = (arm, armC, leg, legC)  how much of an arm / a leg it is and where along it (0 the shoulder / hip,
 *                                    1 the wrist / ankle, > 1 the hand / foot) — the clothes' edges are measured on it
 */
import { meshSdf } from './RealSdf.js';
import { simplify } from './RealSimplify.js';
import { bodyShape, headShape, handShape, BOUNDS, PART } from './RealAnatomy.js';
import { ANAT, B, Y, FINGER_NAMES, FINGERS, SPINE_REST, restPose, armRest, legRest, fingerRest, m4Apply, m4Inv, m4Dir, headX, headXn } from './RealRig.js';

/**
 * Cell sizes and how many triangles are kept (LOD 0: near; 1: far and the shadow). The world's style: soft facets
 * (the shader shades each facet a little on its own — RealSkinMaterial), so the skin is thinned hard: ~4× fewer
 * triangles than the «real» one had (77 000 → ~17 000 near).
 */
export const LODS = [
    { body: 0.03, head: 0.006, hand: 0.01, keep: { body: 0.12, head: 0.06, hand: 0.3 }, ao: true },
    { body: 0.06, head: 0.02, hand: 0.017, keep: { body: 0.45, head: 0.45, hand: 0.5 }, ao: true },
];

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const H = (y) => y - Y(0); // (group y → height over the floor)

/** A mesh being put together: plain arrays, then typed. */
class Pack {
    constructor() { this.pos = []; this.nor = []; this.idx = []; this.si = []; this.sw = []; this.info = []; this.mix = []; this.limb = []; this.n = 0; }
    vertex(p, n, w, info, mix, limb) {
        this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]);
        const top = topWeights(w);
        for (let k = 0; k < 4; k++) { this.si.push(top[k * 2]); this.sw.push(top[k * 2 + 1]); }
        this.info.push(...info); this.mix.push(...mix); this.limb.push(...limb);
        return this.n++;
    }
    tri(a, b, c) { this.idx.push(a, b, c); }
    done() {
        return {
            n: this.n,
            pos: new Float32Array(this.pos), nor: new Float32Array(this.nor), idx: new Uint32Array(this.idx),
            skinIndex: new Uint16Array(this.si), skinWeight: new Float32Array(this.sw),
            info: new Float32Array(this.info), mix: new Float32Array(this.mix), limb: new Float32Array(this.limb),
        };
    }
}

/** The 4 strongest bones of a {bone: weight} map, normalised: [b0, w0, b1, w1, …]. */
function topWeights(w) {
    const e = Object.entries(w).filter(([, x]) => x > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let s = 0;
    for (const [, x] of e) s += x;
    const out = [0, 0, 0, 0, 0, 0, 0, 0];
    if (!e.length) { out[0] = B.hips; out[1] = 1; return out; }
    e.forEach(([b, x], i) => { out[i * 2] = +b; out[i * 2 + 1] = x / s; });
    return out;
}
const W = () => ({});
const addW = (w, b, x) => { if (x > 0) w[b] = (w[b] || 0) + x; };
function scaleW(w, k) { for (const b in w) w[b] *= k; return w; }

// ------------------------------------------------------------------ the body's weights
const SPINE = SPINE_REST.slice(0, 5).map(([n, h]) => [B[n], h]);
function spineW(w, h, k = 1) {
    if (h <= SPINE[0][1]) { addW(w, SPINE[0][0], k); return; }
    for (let i = 0; i < SPINE.length - 1; i++) {
        const [b0, h0] = SPINE[i], [b1, h1] = SPINE[i + 1];
        if (h <= h1) { const t = (h - h0) / (h1 - h0); addW(w, b0, k * (1 - t)); addW(w, b1, k * t); return; }
    }
    addW(w, B.neck, k);
}
/** The neck (in the body and in the head the same: the body's neck stays inside the head's) — new heights. */
function neckW(w, h, k = 1) {
    const a = sm(3.36, 3.48, h), b = sm(3.52, 3.62, h);
    addW(w, B.upperChest, k * (1 - a)); addW(w, B.neck, k * a * (1 - b)); addW(w, B.head, k * a * b);
}

const ARM = armRest(), LEG = legRest();
const sideOf = (x) => (x < 0 ? 'L' : 'R');
/** Where a point is along the arm of its side: c (m from the shoulder) and its distance from the arm's line. */
function armCoord(p) {
    const s = p[0] < 0 ? -1 : 1, S = [ARM.S[0] * s, ARM.S[1], ARM.S[2]], u = [ARM.u[0] * s, ARM.u[1], ARM.u[2]];
    const d = [p[0] - S[0], p[1] - S[1], p[2] - S[2]], c = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    return c;
}
function legCoord(p) {
    const s = p[0] < 0 ? -1 : 1, Hj = [LEG.Hj[0] * s, LEG.Hj[1], LEG.Hj[2]], v = [ANAT.legDir[0] * s, ANAT.legDir[1], ANAT.legDir[2]];
    return (p[0] - Hj[0]) * v[0] + (p[1] - Hj[1]) * v[1] + (p[2] - Hj[2]) * v[2];
}

function bodyVertex(p, part) {
    const w = W(), h = H(p[1]), s = sideOf(p[0]);
    let arm = 0, armC = 0, leg = 0, legC = 0, flush = 0;
    const L12 = ANAT.L1 + ANAT.L2, Lleg = ANAT.Lth + ANAT.Lsh;
    if (part === PART.arm) {
        const c = armCoord(p);
        const up = 1 - sm(ANAT.L1 - 0.08, ANAT.L1 + 0.1, c), fore = 1 - up;
        const tw = sm(ANAT.L1 + 0.2, L12 - 0.1, c), hand = sm(L12 - 0.07, L12 + 0.04, c);
        const sh = sm(-0.05, 0.22, c);
        addW(w, B['upperArm' + s], sh * up);
        addW(w, B['forearm' + s], sh * fore * (1 - tw));
        addW(w, B['twist' + s], sh * fore * tw * (1 - hand));
        addW(w, B['hand' + s], sh * fore * tw * hand);
        addW(w, B['clav' + s], (1 - sh) * 0.55); addW(w, B.upperChest, (1 - sh) * 0.45);
        arm = sm(-0.06, 0.1, c); armC = Math.max(0, c / L12);
        flush = 0.3 * Math.exp(-((c - ANAT.L1) ** 2) / 0.01) * (p[2] > 0 ? 1 : 0.3); // (the elbow)
    } else if (part === PART.leg || part === PART.glute) {
        const c = legCoord(p);
        const th = 1 - sm(ANAT.Lth - 0.09, ANAT.Lth + 0.1, c), sh = 1 - th, ft = sm(Lleg - 0.12, Lleg, c);
        const hip = part === PART.glute ? 0.35 + 0.35 * sm(-0.1, 0.15, c) : sm(-0.12, 0.2, c);
        addW(w, B['thigh' + s], hip * th);
        addW(w, B['shin' + s], hip * sh * (1 - ft));
        addW(w, B['foot' + s], hip * sh * ft);
        if (part === PART.glute) addW(w, B.hips, 1 - hip); else spineW(w, h, 1 - hip);
        leg = part === PART.glute ? 0.0 : sm(-0.1, 0.1, c); legC = Math.max(0, c / Lleg);
        flush = 0.3 * Math.exp(-((c - ANAT.Lth) ** 2) / 0.012) * (p[2] < 0 ? 1 : 0.3); // (the knee)
    } else if (part === PART.foot || part === PART.toe) {
        const ballZ = LEG.ball[2], toes = part === PART.toe ? sm(ballZ + 0.03, ballZ - 0.05, p[2]) : 0;
        const shin = sm(0.28, 0.46, h);
        addW(w, B['shin' + s], shin);
        addW(w, B['foot' + s], (1 - shin) * (1 - toes));
        addW(w, B['toes' + s], (1 - shin) * toes);
        leg = 1; legC = 1 + Math.max(0, 0.35 - h) * 0.3;
        flush = part === PART.toe ? 0.35 : (p[2] > LEG.A[2] + 0.04 && h < 0.12 ? 0.3 : 0.08);
    } else if (part === PART.neck) {
        neckW(w, h);
    } else {
        // the torso; near the shoulders some of the collarbone and the arm, near the hips some of the thigh
        const S = [ARM.S[0] * (p[0] < 0 ? -1 : 1), ARM.S[1], ARM.S[2]];
        const dS = Math.hypot(p[0] - S[0], p[1] - S[1], p[2] - S[2]);
        const kS = (1 - sm(0.12, 0.42, dS)) * sm(0.28, 0.44, Math.abs(p[0]));
        const pit = kS * sm(3.22, 3.0, h) * 0.45; // (the armpit's skin goes with the arm)
        const Hj = [LEG.Hj[0] * (p[0] < 0 ? -1 : 1), LEG.Hj[1], LEG.Hj[2]];
        const dH = Math.hypot(p[0] - Hj[0], p[1] - Hj[1], p[2] - Hj[2]);
        const kH = (1 - sm(0.1, 0.38, dH)) * sm(2.2, 1.95, h) * 0.4;
        const rest = 1 - kS - kH;
        spineW(w, h, Math.max(0, rest));
        addW(w, B['clav' + s], kS - pit); addW(w, B['upperArm' + s], pit);
        addW(w, B['thigh' + s], kH);
    }
    return { w, info: [0, 1, flush, 0], mix: [0, 0, 0, 0], limb: [arm, armC, leg, legC] };
}

// ------------------------------------------------------------------ the head's weights (and the face's bones)
const g3 = (p, c, r) => Math.exp(-(((p[0] - c[0]) / r[0]) ** 2 + ((p[1] - c[1]) / r[1]) ** 2 + ((p[2] - c[2]) / r[2]) ** 2));
/** (p: the head's OLD measures, as it is sculpted; the neck's bones go by the drawn heights) */
function headVertex(p, part) {
    const w = W(), h = H(p[1]), s = sideOf(p[0]), sx = p[0] < 0 ? -1 : 1, ax = Math.abs(p[0]);
    const hn = H(headX(p)[1]);
    const mix = [part === PART.lip ? 1 : 0, 0, part === PART.mouthIn ? 1 : 0, 0];
    if (part === PART.neck) { neckW(w, hn); return { w, info: [0, 1, 0, 1], mix, limb: [0, 0, 0, 0] }; }
    const face = W();
    // (the brows and the mouth are PAINTED on the face and move in the shader — RealSkinMaterial `uFace`: no skin is
    // pulled round the mouth — the author: «этот рот… невероятно крипово»)
    const jaw = 0;
    let sum = 0;
    for (const b in face) sum += face[b];
    if (sum > 0.95) { scaleW(face, 0.95 / sum); sum = 0.95; }
    const restK = 1 - sum;
    addW(w, B.jaw, restK * jaw);
    addW(w, B.head, restK * (1 - jaw));
    // (the head's bottom at the neck: as the neck)
    if (hn < 3.62) { const k = sm(3.62, 3.5, hn); scaleW(w, 1 - k); neckW(w, hn, k); }
    for (const b in face) addW(w, b, face[b]);
    const flush = 0.45 * g3(p, [0.12 * sx, Y(4.0), -0.25], [0.045, 0.035, 0.05]) + 0.3 * g3(p, [0, Y(4.07), -0.27], [0.03, 0.03, 0.03])
        + (part === PART.ear ? 0.35 : 0);
    return { w, info: [0, 1, Math.min(1, flush), 1], mix, limb: [0, 0, 0, 0] };
}

// ------------------------------------------------------------------ the hand's weights (its palm's space)
const FR = Object.fromEntries(FINGER_NAMES.map((f) => [f, fingerRest(f).map(m4Inv)]));
function handVertex(p, part, zone, s) {
    const w = W();
    let flush = 0;
    const mix = [0, part === PART.nail ? 1 : 0, 0, 0];
    if (zone <= 14) {
        const fi = Math.floor(zone / 3), f = FINGER_NAMES[fi], seg = FINGERS[f].len / 3;
        const inv = FR[f];
        // where along the finger (its bones' own y)
        const j = zone % 3, y = m4Apply(inv[j], p)[1], t = j * seg + y;
        const a0 = sm(-0.04, 0.018, t), a1 = sm(seg - 0.022, seg + 0.022, t), a2 = sm(2 * seg - 0.02, 2 * seg + 0.02, t);
        addW(w, B['hand' + s], 1 - a0);
        addW(w, B[f + '0' + s], a0 - a1);
        addW(w, B[f + '1' + s], a1 - a2);
        addW(w, B[f + '2' + s], a2);
        flush = 0.12 + 0.3 * a2 + (p[2] < 0 ? 0.08 : 0);
    } else if (zone === 16) {
        const tw = sm(-0.2, -0.33, p[1]);
        addW(w, B['hand' + s], 1 - tw); addW(w, B['twist' + s], tw);
    } else {
        addW(w, B['hand' + s], 1);
        // the knuckles' skin goes a little with the fingers
        if (p[1] > 0.16) for (const f of ['index', 'middle', 'ring', 'pinky']) {
            const k = 0.3 * sm(0.16, 0.24, p[1]) * Math.exp(-((p[0] - FINGERS[f].x) ** 2) / 0.0012);
            if (k > 0.01) { addW(w, B[f + '0' + s], k); w[B['hand' + s]] -= k; }
        }
        flush = p[2] < -0.02 ? 0.25 : (p[1] > 0.17 ? 0.3 : 0.05);
    }
    return { w, info: [0, 1, flush, 0], mix, limb: [1, 1.05, 0, 0] };
}

// ------------------------------------------------------------------ putting the meshes together
function addMesh(pack, m, vertexFn, { xf = null, map: pmap = null, mirror = false, keep = 1, extra = null } = {}) {
    let idx = m.idx, map = null, count = m.n;
    if (keep < 1) {
        // (thinned once: the left hand is the right one mirrored)
        const r = m._thin?.keep === keep ? m._thin.r : simplify(m.pos, m.idx, Math.round(m.idx.length / 3 * keep), m.part);
        m._thin = { keep, r };
        idx = r.idx; map = r.keep; count = r.count;
    }
    const base = pack.n, order = new Int32Array(count);
    if (map) for (let v = 0; v < m.n; v++) { if (map[v] >= 0) order[map[v]] = v; } else for (let v = 0; v < m.n; v++) order[v] = v;
    for (let i = 0; i < count; i++) {
        const v = order[i];
        let p = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]], n = [m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]];
        const r = vertexFn(p, m.part[v], m.zone[v]);
        if (xf) { p = m4Apply(xf, p); n = m4Dir(xf, n); }
        if (pmap) { p = pmap.p(p); n = pmap.n(n); }
        if (mirror) { p[0] = -p[0]; n[0] = -n[0]; }
        r.info[1] = m.ao[v];
        if (extra) extra(r, p);
        pack.vertex(p, n, r.w, r.info, r.mix, r.limb);
    }
    for (let t = 0; t < idx.length; t += 3) {
        if (mirror) pack.tri(base + idx[t], base + idx[t + 2], base + idx[t + 1]);
        else pack.tri(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
    }
}

/**
 * The whole skin, both LODs. Returns {lods: [{body, head}, …], rest: Float64Array[]} (the meshes' arrays as
 * Pack.done gives them; `rest` — every bone's rest matrix).
 */
export function buildRealBody(lodList = [0, 1]) {
    const rest = restPose();
    const shapes = { body: bodyShape(), head: headShape(), hand: handShape() };
    const HM = { p: headX, n: headXn };
    const lods = [];
    for (const li of lodList) {
        const L = LODS[li];
        // ---- the body + both hands
        const body = new Pack();
        const bm = meshSdf(shapes.body, BOUNDS.body[0], BOUNDS.body[1], L.body, { ao: L.ao });
        addMesh(body, bm, bodyVertex, { keep: L.keep.body });
        const hm = meshSdf(shapes.hand, BOUNDS.hand[0], BOUNDS.hand[1], L.hand, { ao: L.ao });
        const handR = rest[B.handR];
        addMesh(body, hm, (p, part, zone) => handVertex(p, part, zone, 'R'), { xf: handR, keep: L.keep.hand });
        // (the left hand: the right one mirrored — and its bones the left ones)
        addMesh(body, hm, (p, part, zone) => handVertex(p, part, zone, 'L'), { xf: handR, mirror: true, keep: L.keep.hand });
        // ---- the head: skin and eyes (sculpted in the old measures, drawn in the new; no teeth, no tongue)
        const head = new Pack();
        const aoAll = { dist: (x, y, z) => shapes.head.dist(x, y, z) };
        const hd = meshSdf(shapes.head, BOUNDS.head[0], BOUNDS.head[1], L.head, { ao: L.ao, aoShape: aoAll });
        addMesh(head, hd, headVertex, { keep: L.keep.head, map: HM });
        lods.push({ body: body.done(), head: head.done() });
    }
    return { lods, rest };
}

/** The arrays to hand over from a worker (transferred, not copied). */
export function transferList(built) {
    const out = [];
    for (const l of built.lods) for (const m of Object.values(l)) for (const k of ['pos', 'nor', 'idx', 'skinIndex', 'skinWeight', 'info', 'mix', 'limb']) out.push(m[k].buffer);
    return out;
}
