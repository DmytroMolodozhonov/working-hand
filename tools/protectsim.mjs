/**
 * protectsim.mjs — synthetic people crossing their arms (and doing everything else) in front of a camera, through the
 * game's own path: the camera's pictures (15–60 a second, its latency, noise, a wrist lost for 1–3 pictures, occluded
 * wrists seen worse) → CrossedArms.CrossTrack fed each RAW picture as it comes (PoseService.onRawPose) — and, for
 * «before», the old path: PoseStabilizer's smoothed points read once a game frame by CrossedGesture (hold 0.35 s).
 *
 * The body is in its own measure (as CrossTrack reads it): u — towards the person's LEFT, v — down, from the shoulders'
 * middle, in shoulder widths W; shoulders at u = ±0.5; the upper arm ≈ 0.85 W, the forearm ≈ 0.7 W (a person's
 * proportions: shoulders 0.39 m, upper arm 0.33, forearm 0.27). Moves are minimum-jerk between key poses, each arm its
 * own timing (one arrives later), each person a little different (size in the picture, where the crossed wrists go,
 * one hand higher, a mirror / not).
 *
 * The moment «the arms are in the pose» (T0) — the first instant the TRUE (noiseless) arms are strictly crossed
 * (CrossTrack's own entry limits). Lags: total = shield − T0 (the camera's latency in it); game = shield − the arrival
 * of the first picture taken after T0 (what the game itself adds; < 0 — it was ahead of the pose).
 */
import { CrossTrack, CrossedGesture, crossedPose, crossMeasure, CROSS } from '../src/game/CrossedArms.js';
import { PoseStabilizer } from '../src/input/TrackingGuard.js';

export function rng(seed = 1) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const mj = (s) => (s <= 0 ? 0 : s >= 1 ? 1 : s * s * s * (10 - 15 * s + 6 * s * s)); // minimum jerk
const lerp = (a, b, k) => a + (b - a) * k;
const R = (r, a, b) => a + (b - a) * r();

// ---- key poses of the LEFT arm (u, v of the elbow and the wrist); the right arm is the mirror (u → −u), with its own numbers
export const KEYS = {
    hang: { e: [0.6, 0.85], w: [0.66, 1.65] },
    side: { e: [0.68, 0.8], w: [0.8, 1.55] }, // (a little out: standing at ease)
    forward: { e: [0.56, 0.55], w: [0.5, 0.25] }, // (the arm at the camera: the wrist seen near the shoulder — casting)
    raised: { e: [0.7, -0.6], w: [0.72, -1.4] },
    T: { e: [1.35, 0.02], w: [2.05, 0.02] },
    spread: { e: [1.25, 0.35], w: [1.85, 0.75] }, // (a dome's arms: out and a little down)
    chest: { e: [0.62, 0.85], w: [0.25, 0.45] }, // (a hand before the chest, its own side — a book, a scroll)
    clap: { e: [0.55, 0.8], w: [0.03, 0.4] },
    pocket: { e: [0.7, 0.85], w: [0.42, 1.75] },
    mouth: { e: [0.4, 0.6], w: [0.08, -0.55] },
    belt: { e: [0.62, 0.9], w: [0.15, 1.45] },
};
const mirror = (k) => ({ e: [-k.e[0], k.e[1]], w: [-k.w[0], k.w[1]] });

/** A crossed pose of this person (the left arm's numbers; its own for the right). */
function crossedKey(r, style) {
    if (style === 'dead') return { e: [R(r, 0.15, 0.4), R(r, 0.7, 0.95)], w: [-R(r, 0.35, 0.55), R(r, -0.05, 0.2)] }; // (hands on the opposite shoulders)
    if (style === 'low') return { e: [R(r, 0.6, 0.85), R(r, 0.85, 1.05)], w: [-R(r, 0.15, 0.45), R(r, 0.85, 1.25)] }; // (crossed at the belly)
    if (style === 'high') return { e: [R(r, 0.55, 0.8), R(r, 0.55, 0.85)], w: [-R(r, 0.25, 0.55), R(r, -0.2, 0.15)] }; // (at the collarbones)
    return { e: [R(r, 0.55, 0.85), R(r, 0.7, 1.0)], w: [-R(r, 0.2, 0.6), R(r, 0.25, 0.9)] }; // (before the chest)
}

/**
 * A move: per arm a list of segments [t0, t1, from, to] (minimum jerk between key poses), the rest held.
 * `at(t)` → { le:[u,v], lw, re, rw } in body units.
 */
class Move {
    constructor() { this.L = []; this.Rt = []; }
    arm(side, t0, t1, from, to) { (side === 'L' ? this.L : this.Rt).push([t0, t1, from, to]); return this; }
    _arm(list, t) {
        let k = list[0];
        for (const s of list) if (t >= s[0]) k = s;
        const s = mj((t - k[0]) / Math.max(1e-6, k[1] - k[0]));
        return { e: [lerp(k[2].e[0], k[3].e[0], s), lerp(k[2].e[1], k[3].e[1], s)], w: [lerp(k[2].w[0], k[3].w[0], s), lerp(k[2].w[1], k[3].w[1], s)] };
    }
    at(t) { const l = this._arm(this.L, t), r = this._arm(this.Rt, t); return { le: l.e, lw: l.w, re: r.e, rw: r.w }; }
}

/** Is the TRUE body strictly crossed (CrossTrack's entry limits, noiseless)? */
const _tm = {};
function trulyCrossed(b) {
    const p = picture(b, { cx: 0.5, sy: 0.4, W: 0.2, dir: 1 }, null, 0, null);
    const m = crossMeasure(p, _tm);
    if (!m) return false;
    const inZ = (u, v) => Math.abs(u) <= CROSS.SIDE_IN && v >= CROSS.HIGH_IN && v <= CROSS.LOW_IN;
    return m.swap >= CROSS.SWAP_IN && inZ(m.lu, m.lv) && inZ(m.ru, m.rv);
}

/** The camera's 33 points of a body (x right, y down); `noise` — σ in picture units; `lost` — the wrists' visibility. */
const BLANK = () => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.9, z: 0, visibility: 0.95 }));
export function picture(b, cam, r, noise, lost, out = BLANK()) {
    const { cx, sy, W, dir } = cam;
    const n = () => (r && noise ? gauss(r) * noise : 0);
    const put = (i, u, v, vis) => { const q = out[i]; q.x = cx + u * W * dir + n(); q.y = sy + v * W + n(); q.z = 0; q.visibility = vis; };
    put(11, 0.5, 0, 0.99); put(12, -0.5, 0, 0.99);
    put(0, 0, -1.0, 0.99);
    put(13, b.le[0], b.le[1], 0.95); put(14, b.re[0], b.re[1], 0.95);
    put(15, b.lw[0], b.lw[1], lost?.l ?? 0.95); put(16, b.rw[0], b.rw[1], lost?.r ?? 0.95);
    return out;
}

// ---------------------------------------------------------------- the real crosses
const STARTS = ['hang', 'side', 'forward', 'raised', 'T', 'spread', 'chest'];
const STYLES = ['chest', 'chest', 'dead', 'low', 'high'];

/** One real cross: from a start pose, the arms cross (`dur` s, one arm `lagR` later), held `hold` s, then open. */
export function realMove(r, { start = 'hang', style = 'chest', dur = 0.35, lagR = 0, hold = 1.0 } = {}) {
    const s0 = KEYS[start], cL = crossedKey(r, style), cR = mirror(crossedKey(r, style));
    // (the other arm a little different: one hand higher)
    cR.w[1] += R(r, -0.2, 0.2);
    const t0 = 0.3, mv = new Move();
    const a = R(r, 0.8, 1.2), bR = R(r, 0.8, 1.2);
    mv.arm('L', 0, t0, s0, s0).arm('L', t0, t0 + dur * a, s0, cL).arm('L', t0 + dur * a + hold, t0 + dur * a + hold + 0.35, cL, KEYS.hang);
    mv.arm('R', 0, t0, mirror(s0), mirror(s0)).arm('R', t0 + lagR, t0 + lagR + dur * bR, mirror(s0), cR).arm('R', t0 + lagR + dur * bR + hold, t0 + lagR + dur * bR + hold + 0.35, cR, mirror(KEYS.hang));
    const end = t0 + Math.max(dur * a, lagR + dur * bR) + hold;
    return { mv, len: end + 0.8, holdEnd: end };
}

// ---------------------------------------------------------------- the moves that must NOT put a shield up
const P = (e, w) => ({ e, w });
/** Builds each false move (≈ 2–6 s); `r` makes each one a little different. */
export const FALSE = {
    walk: (r) => swing(r, 0.9, 0.12, 0.35, KEYS.hang, P([0.6, 0.8], [0.45, 1.25])), // (arms swing at the sides, forward a little in)
    run: (r) => swing(r, 1.5, 0.08, 0.3, P([0.75, 0.7], [0.5, 0.9]), P([0.55, 0.75], [0.1, 0.5])), // (bent arms pumping, the hands come in towards the middle)
    wave: (r) => oneArm(r, 'L', [KEYS.raised, P([0.95, -0.55], [1.25, -1.25]), KEYS.raised, P([0.95, -0.55], [1.25, -1.25])], 0.25),
    clap: (r) => both(r, [KEYS.chest, KEYS.clap, KEYS.chest, KEYS.clap, KEYS.chest, KEYS.clap], 0.18),
    scroll: (r) => both(r, [KEYS.chest, P([0.6, 0.85], [0.06, 0.45]), P([0.65, 0.85], [0.6, 0.45]), P([0.65, 0.85], [0.6, 0.45]), KEYS.hang], 0.4),
    book: (r) => both(r, [KEYS.hang, P([0.62, 0.85], [0.3, 0.6]), P([0.62, 0.85], [0.35, 0.6]), P([0.62, 0.85], [0.3, 0.6]), KEYS.hang], 0.5),
    flightT: (r) => both(r, [KEYS.hang, KEYS.T, P([1.3, 0.1], [2.0, 0.15]), KEYS.T, KEYS.hang], 0.45),
    superman: (r) => both(r, [KEYS.hang, KEYS.forward, P([0.55, -0.2], [0.45, -0.7]), KEYS.forward, KEYS.hang], 0.4),
    domeSpread: (r) => both(r, [KEYS.hang, KEYS.spread, KEYS.spread, KEYS.hang], 0.4),
    swim: (r) => both(r, [KEYS.chest, P([0.45, 0.4], [0.05, 0.1]), P([1.1, 0.3], [1.6, 0.4]), KEYS.chest, P([0.45, 0.4], [0.05, 0.1]), P([1.1, 0.3], [1.6, 0.4]), KEYS.chest], 0.35),
    chop: (r) => oneArm(r, 'L', [KEYS.raised, P([0.1, 0.5], [-0.8, 1.3]), KEYS.raised, P([0.1, 0.5], [-0.8, 1.3])], 0.22), // (a sword chop down across the body; the other hangs)
    chopBoth: (r) => both(r, [KEYS.raised, P([0.2, 0.4], [-0.4, 1.3]), KEYS.raised], 0.25, true), // (a two-handed chop: the hands together on the hilt)
    throw: (r) => oneArm(r, 'L', [KEYS.side, P([0.9, -0.3], [0.8, -1.1]), P([0.1, 0.6], [-0.7, 1.2]), KEYS.hang], 0.2),
    handshake: (r) => oneArm(r, 'R', [mirror(KEYS.hang), P([-0.5, 0.7], [-0.25, 0.75]), P([-0.5, 0.72], [-0.25, 0.85]), P([-0.5, 0.7], [-0.25, 0.75]), mirror(KEYS.hang)], 0.35),
    catch: (r) => both(r, [KEYS.hang, P([0.55, 0.6], [0.1, 0.35]), P([0.5, 0.65], [0.08, 0.5]), KEYS.hang], 0.3),
    stretchUp: (r) => both(r, [KEYS.hang, P([0.6, -0.7], [0.1, -1.6]), P([0.5, -0.75], [-0.15, -1.65]), P([0.6, -0.7], [0.1, -1.6]), KEYS.hang], 0.6), // (the hands crossed over the head)
    stretchAcross: (r) => stretchAcross(r),
    talk: (r) => talk(r),
    jump: (r) => both(r, [KEYS.hang, P([0.75, 0.5], [0.95, 1.0]), KEYS.raised, KEYS.hang], 0.25),
    fall: (r) => both(r, [KEYS.hang, P([1.1, -0.2], [1.6, -0.6]), P([0.9, 0.3], [1.3, 0.9]), P([1.2, -0.1], [1.7, -0.3])], 0.15),
    pocketCross: (r) => oneArm(r, 'L', [KEYS.hang, P([0.55, 0.95], [-0.45, 1.6]), P([0.55, 0.95], [-0.45, 1.6]), KEYS.hang], 0.4), // (the left hand into the right pocket)
    beltCross: (r) => oneArm(r, 'R', [mirror(KEYS.hang), P([-0.6, 0.95], [0.25, 1.4]), mirror(KEYS.hang)], 0.4),
    eat: (r) => oneArm(r, 'L', [KEYS.hang, KEYS.mouth, KEYS.mouth, KEYS.hang], 0.4),
    armSwings: (r) => armSwings(r), // (the warm-up: straight arms swung open and crossed in front, again and again)
    wandCast: (r) => oneArm(r, 'R', [mirror(KEYS.hang), mirror(KEYS.forward), P([-0.55, 0.5], [-0.35, 0.1]), mirror(KEYS.forward), mirror(KEYS.hang)], 0.3),
    reachShoulder: (r) => oneArm(r, 'L', [KEYS.hang, P([0.15, 0.75], [-0.5, 0.05]), P([0.15, 0.75], [-0.5, 0.05]), KEYS.hang], 0.4), // (a hand on the other shoulder; the other hangs)
    pickUp: (r) => both(r, [KEYS.hang, P([0.5, 0.8], [0.15, 1.5]), P([0.5, 0.8], [0.1, 1.45]), KEYS.chest, KEYS.hang], 0.4),
};

function both(r, keys, dt, together = false) {
    const mv = new Move();
    let t = 0;
    for (let i = 1; i < keys.length; i++) {
        const d = dt * R(r, 0.7, 1.3), lag = R(r, 0, 0.06);
        const a = keys[i - 1], b = keys[i];
        mv.arm('L', t, t + d, a, b);
        mv.arm('R', t + lag, t + lag + d, together ? { e: [-a.e[0] + 0.3, a.e[1]], w: [a.w[0] + 0.05, a.w[1]] } : mirror(a), together ? { e: [-b.e[0] + 0.3, b.e[1]], w: [b.w[0] + 0.05, b.w[1]] } : mirror(b));
        t += d + R(r, 0, 0.2);
    }
    return { mv, len: t + 0.5 };
}
function oneArm(r, side, keys, dt) {
    const mv = new Move(), still = side === 'L' ? mirror(KEYS.hang) : KEYS.hang;
    mv.arm(side === 'L' ? 'R' : 'L', 0, 1, still, still);
    let t = 0;
    for (let i = 1; i < keys.length; i++) {
        const d = dt * R(r, 0.7, 1.3);
        mv.arm(side, t, t + d, keys[i - 1], keys[i]);
        t += d + R(r, 0, 0.3);
    }
    return { mv, len: t + 0.5 };
}
function swing(r, hz, _dt, amp, back, front) {
    const mv = new Move(), half = 1 / hz / 2;
    let t = 0;
    for (let i = 0; i < 8; i++) {
        const f = i % 2 ? back : front, b = i % 2 ? front : back;
        mv.arm('L', t, t + half, b, f);
        mv.arm('R', t, t + half, mirror(f), mirror(b)); // (the other arm the other way)
        t += half;
    }
    return { mv, len: t };
}
function armSwings(r) {
    const mv = new Move(), out = P([1.3, 0.15], [2.0, 0.25]), inn = P([-0.05, 0.25], [-0.75, 0.45]); // (straight: the elbow midway)
    let t = 0;
    for (let i = 0; i < 6; i++) {
        const d = R(r, 0.3, 0.55), a = i % 2 ? inn : out, b = i % 2 ? out : inn;
        mv.arm('L', t, t + d, a, b);
        mv.arm('R', t, t + d, { e: [-a.e[0], a.e[1] + 0.05], w: [-a.w[0], a.w[1] + 0.1] }, { e: [-b.e[0], b.e[1] + 0.05], w: [-b.w[0], b.w[1] + 0.1] });
        t += d;
    }
    return { mv, len: t + 0.3 };
}
function stretchAcross(r) { // (the left arm straight across the chest, the right forearm hooks it at the elbow)
    const mv = new Move(), aL = P([-0.2, 0.15], [-1.1, 0.2]), aR = P([-0.75, 0.75], [-0.1, 0.25]);
    mv.arm('L', 0, 0.5, KEYS.hang, aL).arm('L', 2.5, 3.0, aL, KEYS.hang);
    mv.arm('R', 0.1, 0.6, mirror(KEYS.hang), aR).arm('R', 2.5, 3.0, aR, mirror(KEYS.hang));
    return { mv, len: 3.4 };
}
function talk(r) { // (hands moving in front as people speak — each on its own side, a little over the middle at most)
    const mv = new Move();
    let tl = 0, tr = 0;
    let pl = KEYS.chest, pr = mirror(KEYS.chest);
    for (let i = 0; i < 10; i++) {
        const nl = P([R(r, 0.5, 0.9), R(r, 0.6, 0.95)], [R(r, -0.1, 0.9), R(r, 0.1, 1.1)]);
        const nr = P([-R(r, 0.5, 0.9), R(r, 0.6, 0.95)], [-R(r, -0.1, 0.9), R(r, 0.1, 1.1)]);
        const dl = R(r, 0.2, 0.5), dr = R(r, 0.2, 0.5);
        mv.arm('L', tl, tl + dl, pl, nl); mv.arm('R', tr, tr + dr, pr, nr);
        tl += dl + R(r, 0, 0.3); tr += dr + R(r, 0, 0.3); pl = nl; pr = nr;
    }
    return { mv, len: Math.max(tl, tr) + 0.3 };
}

// ---------------------------------------------------------------- one run through the camera and the detector
/**
 * Runs `move` through a camera; returns the shield's events (game time, s) for the NEW path and the OLD one.
 * cam: { fps, lat (s), jit (s), noise, drop (chance a picture loses a wrist for 1–3 pictures), occl (crossed wrists seen worse), gameFps }
 */
export function run(move, r, cam, opts = {}) {
    const old = opts.old ?? true;
    let T0g = null;
    if (opts.trace) for (let s = 0; s < move.len; s += 0.002) if (trulyCrossed(move.mv.at(s))) { T0g = s + cam.lat; break; }
    const person = { cx: R(r, 0.4, 0.6), sy: R(r, 0.35, 0.45), W: R(r, 0.09, 0.26), dir: r() < 0.5 ? 1 : -1 };
    const T = new CrossTrack();
    const ev = [];
    const pics = [];
    let t = R(r, 0, 1 / cam.fps), lostLeft = 0, lostSide = 'l';
    while (t < move.len) {
        const b = move.mv.at(t);
        let lost = null;
        if (lostLeft > 0) { lostLeft--; lost = { [lostSide]: 0.1 }; } else if (r() < cam.drop) { lostLeft = 1 + Math.floor(r() * 3) - 1; lostSide = r() < 0.5 ? 'l' : 'r'; lost = { [lostSide]: 0.1 }; }
        const cross = trulyCrossed(b);
        if (cross && cam.occl && !lost) lost = { l: R(r, 0.45, 0.9), r: R(r, 0.45, 0.9) };
        const p = picture(b, person, r, cam.noise, lost);
        const arrive = t + cam.lat + Math.abs(gauss(r)) * cam.jit;
        pics.push({ t, arrive, p: p.map((q) => ({ ...q })) });
        t += 1 / cam.fps * R(r, 0.9, 1.1);
    }
    pics.sort((a, b) => a.arrive - b.arrive);
    let lastArr = -1;
    for (const pc of pics) {
        if (pc.arrive < lastArr) continue;
        lastArr = pc.arrive;
        // (the game's own idle step runs once a frame; a picture: at once)
        const e = T.feed(pc.t, pc.p);
        if (e) ev.push({ e, at: pc.arrive, why: T.why });
        if (opts.trace) { const F = T.flags || {}, m = F.m; opts.trace.push(`${((pc.arrive - (T0g ?? 0)) * 1000).toFixed(0)} ${T.state} ${e || ''} sw ${m?.swap?.toFixed(2)} L ${m?.lu?.toFixed(2)},${m?.lv?.toFixed(2)} R ${m?.ru?.toFixed(2)},${m?.rv?.toFixed(2)} E ${m?.leu?.toFixed(2)},${m?.lev?.toFixed(2)} ${m?.reu?.toFixed(2)},${m?.rev?.toFixed(2)} wv ${m?.wv?.toFixed(2)} s ${T.sL?.toFixed(1)}/${T.sR?.toFixed(1)} st ${F.strict ? 1 : 0}${F.slow ? 'S' : ''}${F.brake ? 'B' : ''} stay ${F.stay?.toFixed(2)}`); }
    }
    // the OLD path: PoseStabilizer → the game's frame → CrossedGesture (0.35 s)
    const oldEv = [];
    if (old) {
        const st = new PoseStabilizer(), G = new CrossedGesture();
        let k = 0, last = null, lastAt = -1;
        for (let gt = 0; gt < move.len + 0.5; gt += 1 / cam.gameFps) {
            while (k < pics.length && pics[k].arrive <= gt) { last = st.process(pics[k].p, pics[k].t * 1000); lastAt = pics[k].arrive; k++; }
            const fresh = last && gt - lastAt < 0.5;
            const e = G.step(1 / cam.gameFps, !!(fresh && crossedPose(last, G.on)));
            if (e) oldEv.push({ e, at: gt });
        }
    }
    // the moment the true arms are in the pose, and the first picture taken after it
    let T0 = null;
    for (let s = 0; s < move.len; s += 0.002) if (trulyCrossed(move.mv.at(s))) { T0 = s; break; }
    let first = null;
    if (T0 != null) for (const pc of pics) if (pc.t >= T0 && (!first || pc.arrive < first.arrive)) { first = pc; break; }
    return { ev, oldEv, T0, firstArr: first?.arrive ?? null, frameGap: 1 / cam.fps, gameFrame: 1 / cam.gameFps };
}

const pct = (a, q) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/** What a run's events mean: the shield up (confirmed / guessed), when, did it flicker while held, when down. */
function readReal(res, holdEnd) {
    const on = res.ev.find((x) => x.e === 'on');
    const tent = res.ev.find((x) => x.e === 'tent');
    let protectAt = null;
    // (protected from: the guess that came true, or the confirmation)
    if (on) {
        const before = res.ev.filter((x) => x.at <= on.at);
        const lastCancel = [...before].reverse().find((x) => x.e === 'cancel');
        const t = [...before].reverse().find((x) => x.e === 'tent');
        protectAt = t && (!lastCancel || lastCancel.at < t.at) ? t.at : on.at;
    }
    const offs = res.ev.filter((x) => x.e === 'off');
    const flicker = on ? offs.filter((x) => x.at > on.at && x.at < holdEnd + 0.05).length : 0;
    const oldOn = res.oldEv.find((x) => x.e === 'on');
    return { ok: !!on, on: on?.at ?? null, protectAt, tent: !!tent, flicker, why: on?.why, offAt: offs.find((x) => on && x.at > holdEnd)?.at ?? null, oldOn: oldOn?.at ?? null };
}

export const CAMS = { fps: [15, 24, 30, 60], lat: [0.05, 0.1, 0.15], noise: [0.002, 0.005, 0.009] };

export function bench({ seeds = 2, quick = false, old = true } = {}) {
    const out = { real: 0, ok: 0, lag: [], lagGame: [], lagFrames: [], oldLag: [], oldOk: 0, tentShare: 0, flicker: 0, release: [], fails: [], byFps: {} };
    const fpsL = quick ? [15, 30, 60] : CAMS.fps;
    let tents = 0;
    for (let seed = 1; seed <= seeds; seed++) {
        const r = rng(seed * 7919);
        for (const fps of fpsL) for (const lat of CAMS.lat) for (const noise of CAMS.noise) for (const start of STARTS) for (const style of STYLES) {
            const dur = R(r, 0.15, 0.6), lagR = r() < 0.3 ? R(r, 0.03, 0.12) : 0, hold = R(r, 0.5, 1.6);
            const cam = { fps, lat, jit: 0.006, noise, drop: 0.03, occl: true, gameFps: [60, 30, 20][Math.floor(r() * 3)] };
            const mv = realMove(r, { start, style, dur, lagR, hold });
            const res = run(mv, r, cam, { old });
            const x = readReal(res, mv.holdEnd);
            out.real++;
            if (x.tent) tents++;
            if (x.flicker) out.flicker++;
            const bf = out.byFps[fps] || (out.byFps[fps] = { n: 0, ok: 0, lagGame: [] });
            bf.n++;
            if (x.ok && res.T0 != null) {
                out.ok++; bf.ok++;
                const lg = (x.protectAt - res.firstArr) * 1000;
                out.lag.push((x.protectAt - res.T0) * 1000); out.lagGame.push(lg); bf.lagGame.push(lg);
                out.lagFrames.push((x.protectAt - res.firstArr) * fps);
                if (x.offAt != null) out.release.push((x.offAt - mv.holdEnd) * 1000);
            } else if (out.fails.length < 12) out.fails.push({ start, style, fps, lat, noise, dur: +dur.toFixed(2), T0: res.T0, ev: res.ev.map((e) => e.e).join(',') });
            if (x.oldOn != null && res.T0 != null) { out.oldOk++; out.oldLag.push((x.oldOn - res.T0) * 1000); }
        }
    }
    out.okShare = out.ok / out.real;
    out.oldShare = out.oldOk / out.real;
    out.tentShare = tents / out.real;
    out.lagP50 = pct(out.lag, 0.5); out.lagP95 = pct(out.lag, 0.95);
    out.lagGameP50 = pct(out.lagGame, 0.5); out.lagGameP95 = pct(out.lagGame, 0.95);
    out.lagFramesP95 = pct(out.lagFrames, 0.95);
    out.oldLagP50 = pct(out.oldLag, 0.5); out.oldLagP95 = pct(out.oldLag, 0.95);
    out.releaseP95 = pct(out.release, 0.95);
    for (const k of Object.keys(out.byFps)) { const b = out.byFps[k]; b.p95 = pct(b.lagGame, 0.95); b.p50 = pct(b.lagGame, 0.5); delete b.lagGame; }
    // ---- the false moves: each kind × cameras × seeds, and an hour of play made of them
    out.falseN = 0; out.falseOn = 0; out.falseTent = 0; out.falseWhy = {}; out.oldFalseOn = 0;
    for (let seed = 1; seed <= seeds; seed++) {
        const r = rng(seed * 104729);
        for (const [kind, make] of Object.entries(FALSE)) for (const fps of fpsL) for (const noise of CAMS.noise) for (let rep = 0; rep < 3; rep++) {
            const cam = { fps, lat: 0.1, jit: 0.006, noise, drop: 0.03, occl: false, gameFps: 60 };
            const res = run(make(r), r, cam, { old });
            out.falseN++;
            const on = res.ev.filter((x) => x.e === 'on').length, te = res.ev.filter((x) => x.e === 'tent').length;
            if (on) { out.falseOn++; out.falseWhy[kind] = (out.falseWhy[kind] || 0) + 1; }
            out.falseTent += te;
            if (res.oldEv.some((x) => x.e === 'on')) out.oldFalseOn++;
        }
    }
    out.falseShare = out.falseOn / out.falseN;
    // an hour: one false move after another, a random camera each
    const rh = rng(4242), kinds = Object.keys(FALSE);
    let secs = 0;
    out.hourOn = 0; out.hourTent = 0; out.hourWhy = {};
    while (secs < (quick ? 600 : 3600)) {
        const kind = kinds[Math.floor(rh() * kinds.length)];
        const mv = FALSE[kind](rh);
        const cam = { fps: CAMS.fps[Math.floor(rh() * 4)], lat: 0.1, jit: 0.006, noise: CAMS.noise[Math.floor(rh() * 3)], drop: 0.03, occl: false, gameFps: 60 };
        const res = run(mv, rh, cam, { old: false });
        const on = res.ev.filter((x) => x.e === 'on').length;
        if (on) { out.hourOn += on; out.hourWhy[kind] = (out.hourWhy[kind] || 0) + on; }
        out.hourTent += res.ev.filter((x) => x.e === 'tent').length;
        secs += mv.len;
    }
    out.hourSecs = secs;
    out.hourTentPerMin = out.hourTent / (secs / 60);
    return out;
}
