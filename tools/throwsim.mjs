/**
 * throwsim.mjs — synthetic human throws and opening hands, run through the game's own camera path, for
 * tools/throwbench.mjs and tests/unit/release-model.test.js. Pure (no THREE, no browser).
 *
 * The true motion (body space: x right, y up from the hips, z back; game metres — the hero 3.5 m, arm 1.9 m,
 * shoulders at ±0.7, 0.5):
 *   rest hold → wind-up (0.3–0.6 s) → the throw along a curve (minimum-jerk speed: the peak in its middle,
 *   the acceleration 80–150 ms) → the fingers open at the peak (or a little after) → follow-through → stop.
 * The camera: a picture every 1/f s, seen `lat` ms later, noise on the points (σ, the depth ×2.5) and on the
 * fingers, the hand (its fingers) lost for k pictures at the swing's peak (the blur); the body's wrist keeps
 * coming (the pose model sees it). Then the game's filters: the 1€ filters of TrackingGuard (body points and
 * the hand), the blend between pictures (PoseSmoother) — and HandTrack at 60 frames a second.
 */
import { OneEuroFilter } from '../src/core/math.js';
import { PoseSmoother } from '../src/input/PoseSmoother.js';
import { POSE_ARM_DCUTOFF } from '../src/input/TrackingGuard.js';
import { HandTrack, WristTrace, launchVelocity, massGain, speedCap, RELEASE } from '../src/game/ThrowModel.js';

/** A small seeded random (mulberry32). */
export function rng(seed = 1) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const lerp3 = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
const bez = (P, u) => { const a = 1 - u; return { x: a * a * a * P[0].x + 3 * a * a * u * P[1].x + 3 * a * u * u * P[2].x + u * u * u * P[3].x, y: a * a * a * P[0].y + 3 * a * a * u * P[1].y + 3 * a * u * u * P[2].y + u * u * u * P[3].y, z: a * a * a * P[0].z + 3 * a * a * u * P[1].z + 3 * a * u * u * P[2].z + u * u * u * P[3].z }; };
const mj = (s) => (s <= 0 ? 0 : s >= 1 ? 1 : s * s * s * (10 - 15 * s + 6 * s * s)); // minimum jerk

/** The kinds of throw (right hand; the left mirrors x): the curve's 4 points. */
export const THROWS = {
    overhand: [{ x: 0.9, y: 1.7, z: 0.5 }, { x: 0.9, y: 2.0, z: -0.4 }, { x: 0.6, y: 1.2, z: -1.6 }, { x: 0.1, y: -0.4, z: -1.2 }],
    overhead: [{ x: 0.4, y: 2.3, z: 0.6 }, { x: 0.4, y: 2.4, z: -0.5 }, { x: 0.4, y: 1.0, z: -1.7 }, { x: 0.3, y: -0.2, z: -1.3 }], // from behind the head
    chest: [{ x: 0.4, y: 0.3, z: -0.3 }, { x: 0.4, y: 0.4, z: -0.8 }, { x: 0.35, y: 0.6, z: -1.6 }, { x: 0.3, y: 0.6, z: -1.85 }],
    underhand: [{ x: 0.8, y: -1.2, z: 0.7 }, { x: 0.8, y: -1.4, z: -0.4 }, { x: 0.6, y: 0.0, z: -1.6 }, { x: 0.5, y: 1.1, z: -1.2 }],
    lob: [{ x: 0.7, y: -1.0, z: 0.4 }, { x: 0.7, y: -1.2, z: -0.4 }, { x: 0.6, y: 0.2, z: -1.4 }, { x: 0.5, y: 1.2, z: -1.0 }],
    sidearm: [{ x: 1.7, y: 0.3, z: 0.4 }, { x: 1.6, y: 0.4, z: -1.0 }, { x: 0.2, y: 0.4, z: -1.7 }, { x: -0.6, y: 0.3, z: -1.0 }],
    down: [{ x: 0.5, y: 1.2, z: -0.6 }, { x: 0.5, y: 1.0, z: -1.2 }, { x: 0.5, y: -0.4, z: -1.2 }, { x: 0.5, y: -1.1, z: -0.9 }], // at the feet
    up: [{ x: 0.6, y: -0.6, z: -0.6 }, { x: 0.6, y: 0.2, z: -1.0 }, { x: 0.5, y: 1.6, z: -0.8 }, { x: 0.5, y: 2.2, z: -0.3 }],
};
const SHOULDER = { x: 0.7, y: 0.5, z: 0 };
const REST = { x: 0.55, y: 0.2, z: -0.9 }; // the thing held in front (elbow bent)

/**
 * One scenario. o: { kind (THROWS key | 'drop' | 'hold' | 'walk' | 'wave' | 'chop' | 'punch' | 'lostRest' | 'glitch'),
 *   side, fps (camera), lat (ms), sigma (m), lose (pictures lost at the peak), speed (m/s peak of the hand), weight,
 *   late (ms the fingers open after the peak), seed, run (m/s the body moves forward) }
 * Returns { truth: {t, vHand, vLaunch, act}, got: decision|null, at (game ms of the decision), log }.
 */
export function simulate(o) {
    const r = rng(o.seed ?? 1);
    const side = o.side || 'left', sx = side === 'left' ? -1 : 1;
    const fps = o.fps ?? 30, lat = o.lat ?? 80, sig = o.sigma ?? 0.02, weight = o.weight ?? 0.2;
    const camDt = 1000 / fps;
    const closed = 0.72 + 0.22 * r(), open = 0.04 + 0.2 * r(); // this player's fist and open hand
    const run = o.run ?? 0;
    const kind = o.kind || 'overhand';
    // ---- the true timeline (ms): hold 600, then the action
    const T0 = 700;
    const wind = 300 + 300 * r(); // wind-up
    const acc = 80 + 70 * r(); // acceleration to the peak (half of the throw's minimum-jerk)
    const dur = 2 * acc + 120 * r(); // the throw from A to E
    const late = o.late ?? (-10 + 40 * r()); // the fingers open this after the peak (people release at or just past it)
    const openMs = kind === 'drop' ? 150 + 150 * r() : 40 + 40 * r();
    const P = (THROWS[kind] || THROWS.overhand).map((p) => ({ x: p.x * sx, y: p.y, z: p.z }));
    const rest = { x: REST.x * sx, y: REST.y, z: REST.z };
    // scale the throw's curve to the wanted peak speed: minimum jerk peaks at 1.875·L/T
    let L = 0; { let q = bez(P, 0); for (let i = 1; i <= 50; i++) { const p = bez(P, i / 50); L += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); q = p; } }
    const want = o.speed ?? 9;
    const T = Math.max(180, (1.875 * L / want) * 1000); // ms (the acceleration — half of it — 90–150 ms: a human arm)
    const tA = T0 + wind, tPeak = tA + T / 2, tOpen = kind === 'drop' ? T0 + 400 : tPeak + late;
    const posAt = (t) => {
        if (kind === 'drop' || kind === 'hold' || kind === 'glitch' || kind === 'lostRest') {
            const out = { x: rest.x * 1.35, y: rest.y + 0.3, z: rest.z * 1.6 }; // the arm held out
            return { x: out.x + 0.01 * Math.sin(t / 300), y: out.y, z: out.z };
        }
        if (kind === 'lower') {
            const out = { x: rest.x * 1.35, y: rest.y + 0.3, z: rest.z * 1.6 }, hang = { x: rest.x * 1.1, y: -1.35, z: 0.05 };
            return t < T0 + 300 ? out : lerp3(out, hang, mj((t - T0 - 300) / 350)); // (lowered to the side in 0.35 s)
        }
        if (kind === 'walk') return { x: rest.x, y: rest.y - 1.0 + 0.1 * Math.sin(t / 159), z: 0.35 * Math.sin(t / 318) }; // arm swinging by the side
        if (kind === 'wave') return { x: rest.x + 0.6 * Math.sin(t / 120), y: 1.2, z: -0.8 };
        if (kind === 'chop' || kind === 'punch') {
            // a fast blow with the fist closed: chop down / punch forward and back
            const ph = ((t - T0) % 900) / 900;
            if (t < T0) return rest;
            const Q = kind === 'chop' ? [rest, { x: rest.x, y: 1.6, z: -0.4 }, { x: rest.x, y: -0.9, z: -1.2 }, rest] : [rest, { x: rest.x * 0.6, y: 0.6, z: -0.4 }, { x: rest.x * 0.6, y: 0.6, z: -1.8 }, rest];
            return bez(Q, mj(ph));
        }
        if (t < T0) return rest;
        if (t < tA) return lerp3(rest, P[0], mj((t - T0) / wind));
        if (t < tA + T) return bez(P, mj((t - tA) / T));
        return P[3];
    };
    const curlAt = (t) => {
        if (kind === 'lower') return t < T0 + 350 ? closed : closed + (open - closed) * mj((t - T0 - 350) / 200); // (relaxed on the way down)
        if (kind === 'hold' || kind === 'walk' || kind === 'wave' || kind === 'chop' || kind === 'punch' || kind === 'lostRest' || kind === 'glitch') return closed;
        if (t < tOpen) return closed;
        return closed + (open - closed) * mj((t - tOpen) / openMs);
    };
    const velAt = (t) => { const a = posAt(t - 0.5), b = posAt(t + 0.5); return { x: (b.x - a.x) * 1000, y: (b.y - a.y) * 1000, z: (b.z - a.z) * 1000 }; };
    // ---- the truth
    const truth = { act: ['hold', 'walk', 'wave', 'chop', 'punch', 'lostRest', 'glitch', 'lower'].includes(kind) ? null : kind === 'drop' ? 'drop' : 'throw', t: tOpen };
    if (truth.act === 'throw') {
        const tr = tOpen + RELEASE.REL_LEVEL * openMs * 0.5; // (the fingers' 30%: the thing slips there)
        const vh = velAt(tr);
        truth.vHand = vh;
        const sp = Math.hypot(vh.x, vh.y, vh.z), k = Math.min(speedCap(weight), sp * massGain(weight)) / sp;
        truth.vLaunch = { x: vh.x * k, y: vh.y * k, z: vh.z * k - run }; // (yaw 0: the body faces −z, runs along −z)
    }
    // ---- the camera and the game
    const ht = new HandTrack();
    const trace = new WristTrace(); // (PoseService: the wrist raw and filtered, picture by picture)
    if (o.trace !== false) ht.trace = trace;
    const sm = new PoseSmoother();
    const dc = o.dCutoff ?? POSE_ARM_DCUTOFF; // (TrackingGuard.PoseStabilizer: the wrists' filters)
    const fx = new OneEuroFilter(2.0, 3.0, dc), fy = new OneEuroFilter(2.0, 3.0, dc);
    // (the hand's depth: the game does not take the camera's rough z as it is — the arm solver builds it from the elbow and
    // the wrist in the picture and the arm's length, so it follows the picture's filter; its own noise stays bigger)
    const fz = new OneEuroFilter(2.0, 3.0, dc);
    // the fingers: TrackingGuard.HandFilter — ONE speed for the whole hand (its points in palms per second: the hand's
    // travel and the fingers' own move), minCutoff 0.6 Hz, beta 8, dCutoff 4 Hz; a hand flying in a throw passes at once
    const fc = { x: null, sp: 0, t: 0, hx: 0, hy: 0, filter(c, hx, hy, ts) {
        if (this.x === null) { this.x = c; this.t = ts; this.hx = hx; this.hy = hy; return c; }
        const dt = Math.max(1e-3, ts - this.t), PALM = 0.05; // (a palm ≈ 5% of the picture)
        const raw = (Math.hypot(hx - this.hx, hy - this.hy) / PALM + Math.abs(c - this.x) * 1.2) / dt;
        const al = (fc) => 1 / (1 + 1 / (2 * Math.PI * fc) / dt);
        this.sp += al(4) * (raw - this.sp);
        this.x += al(0.6 + 8 * this.sp) * (c - this.x);
        this.t = ts; this.hx = hx; this.hy = hy; return this.x;
    } };
    const IMG = 0.13; // image fraction per game metre (the 1€ filters work in the picture's units)
    const peakLost = new Set();
    const lose = o.lose ?? 0;
    if (lose > 0) { const k0 = Math.round((tPeak - 0.5 * lose * camDt) / camDt); for (let k = 0; k < lose; k++) peakLost.add(k0 + k); }
    // lost at rest / glitches
    const lostRest = kind === 'lostRest' ? [T0 + 200, T0 + 200 + 500 + 2500 * r()] : null;
    const pending = [];
    let nextCam = 0, frame = 0, got = null, at = -1, fresh = false;
    const end = (truth.act ? tOpen : T0) + 1600;
    let lastSeen = -1e9, curl = closed, cam = null, lastDue = -1e9, handNow = true;
    const gameDt = 1000 / (o.gameFps || 60); // (the game's own frames: a slow computer draws 20)
    for (let t = 0; t <= end; t += gameDt, frame++) {
        // camera pictures taken at k·camDt, arriving lat later (jitter ±10%)
        while (nextCam * camDt <= t) {
            const tc = nextCam * camDt;
            const p = posAt(tc);
            const handSeen = !peakLost.has(nextCam) && !(lostRest && tc > lostRest[0] && tc < lostRest[1]);
            let c = curlAt(tc - (o.curlLag || 0)) + gauss(r) * 0.035; // (curlLag: the fingers read late in the blur)
            if (kind === 'glitch' && r() < 0.06) c = closed - 0.35 - 0.2 * r(); // a bad picture: the fingers seen half open
            lastDue = Math.max(lastDue + 1, tc + lat + (r() - 0.5) * 2 * (o.jitter ?? 6)); // (pictures arrive in order; the inference time wanders ±6 ms)
            pending.push({ due: lastDue, tc, p: { x: p.x + gauss(r) * sig, y: p.y + gauss(r) * sig, z: p.z + gauss(r) * sig * 2.5 }, c, handSeen });
            nextCam++;
        }
        while (pending.length && pending[0].due <= t) {
            const q = pending.shift(), ts = q.due / 1000;
            const wx = fx.filter(q.p.x * IMG, ts), wy = fy.filter(q.p.y * IMG, ts);
            const wz = fz.filter(q.p.z * IMG, ts);
            trace.push(q.due, q.p.x * IMG, q.p.y * IMG, wx, wy);
            const pose = { leftWrist: { x: wx, y: wy, z: wz } /* (picture units, as the game's smoother gets them) */, leftHandLandmarks: [{ x: q.handSeen ? fc.filter(q.c, q.p.x * IMG, q.p.y * IMG, ts) : curl, y: 0, z: 0 }] }; // (the fingers ride in the hand's landmarks: blended as the game blends them)
            sm.push(pose, q.due);
            if (q.handSeen) lastSeen = q.due;
            handNow = q.handSeen;
            fresh = true;
        }
        cam = sm.sample(t);
        if (!cam) continue;
        const hp = { x: cam.leftWrist.x / IMG, y: cam.leftWrist.y / IMG, z: cam.leftWrist.z / IMG };
        curl = cam.leftHandLandmarks[0].x;
        const seen = handNow; // (the game: the newest picture has the hand's landmarks — SimplifiedHand.lastTrackingTime this frame)
        const te = sm.eff; // (the moment the shown pose stands for — as Items passes it)
        const world = { x: hp.x, y: hp.y + 4, z: hp.z - run * te / 1000 };
        ht.push({ t: te, hand: hp, world, yaw: 0, curl, seen, fresh, camMs: sm.interval });
        fresh = false;
        const sh = { x: SHOULDER.x * sx, y: SHOULDER.y, z: SHOULDER.z };
        const dx = hp.x - sh.x, dy = hp.y - sh.y, dz = hp.z - sh.z, len = Math.hypot(dx, dy, dz) || 1e-6;
        const arm = { reach: len / 1.9, forward: -dz / len, up: dy / len, palmUp: 0 };
        const d = ht.decide({ t: te, arm, weight });
        if (d && d.act) { got = { ...d, v: { ...d.v }, vRel: { ...d.vRel }, pos: { ...d.pos } }; at = t; break; }
    }
    let launch = null;
    if (got) launch = launchVelocity(got, weight, null, { x: 0, y: 0, z: 0 });
    return { truth, got, at, launch, tPeak, lat, velAt };
}

const angle = (a, b) => {
    const la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b.x, b.y, b.z);
    if (!la || !lb) return 180;
    return (Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb)))) * 180) / Math.PI;
};

/** Run a grid of scenarios; returns the metrics. */
export function bench({ seeds = 3, fpsList = [15, 24, 30, 60], lats = [50, 100, 150], sigmas = [0.01, 0.02], loses = [0, 2, 4, 6], sides = ['left', 'right'], kinds = Object.keys(THROWS), speeds = [5, 9, 14], weights = [0.2, 1.5], quick = false } = {}) {
    const m = { fell: [], throws: 0, thrown: 0, fellDown: 0, asDrop: 0, missed: 0, spdErr: [], angErr: [], lagGame: [], lagTotal: [], drops: 0, dropped: 0, dropLag: [], falseN: 0, falseAct: 0, falseWhy: {}, fails: [] };
    let seed = 1;
    for (const side of sides) for (const fps of fpsList) for (const lat of lats) for (const sigma of sigmas) {
        for (const kind of kinds) for (const speed of speeds) for (const lose of loses) for (const weight of weights) for (let s = 0; s < seeds; s++) {
            if (quick && (seed++ % 3)) continue;
            const curlLag = [0, 0, 0, 90, 180, 260][(m.throws + s) % 6], sd = seed * 7919 + s + m.throws * 31;
            const gameFps = [60, 60, 30, 20][(m.throws >> 1) % 4]; // (a slow computer draws 20–30 frames a second)
            const res = simulate({ kind, side, fps, lat, sigma, lose, speed, weight, curlLag, gameFps, seed: sd });
            m.throws++;
            const g = res.got;
            if (!g) { m.missed++; if (m.fails.length < 12) m.fails.push({ kind, side, fps, lat, sigma, lose, speed, weight, why: 'ничего' }); continue; }
            if (g.act !== 'throw') { m.asDrop++; if (m.fails.length < 12) m.fails.push({ kind, side, fps, lat, sigma, lose, speed, weight, why: g.why }); continue; }
            m.thrown++;
            const tv = res.truth.vLaunch, gv = res.launch;
            const tl = Math.hypot(tv.x, tv.y, tv.z), gl = Math.hypot(gv.x, gv.y, gv.z);
            if (gl < 0.4 * tl) { m.fellDown++; m.fell.push({ kind, side, fps, lat, sigma, lose, speed, weight, seed: sd, curlLag, gameFps, why: 'упал вниз: ' + g.why + ` (${gl.toFixed(1)} из ${tl.toFixed(1)})` }); }
            m.spdErr.push(Math.abs(gl - tl) / tl);
            m.angErr.push(angle(tv, gv));
            m.lagGame.push(res.at - (res.truth.t + res.lat + curlLag)); // (from when the camera let the opening be seen)
            m.lagTotal.push(res.at - res.truth.t);
        }
        // calm openings
        for (let s = 0; s < seeds * 4; s++) {
            if (quick && (seed++ % 3)) continue;
            const res = simulate({ kind: 'drop', side, fps, lat, sigma, seed: seed * 104729 + s });
            m.drops++;
            if (res.got?.act === 'drop' || res.got?.act === 'throw') { m.dropped++; m.dropLag.push(res.at - (res.truth.t + res.lat)); }
            else if (m.fails.length < 12) m.fails.push({ kind: 'drop', side, fps, lat, sigma, why: res.got?.why || 'ничего' });
        }
        // nothing must leave the hand
        for (const kind of ['hold', 'walk', 'wave', 'chop', 'punch', 'lostRest', 'glitch', 'lower']) for (const lose of [0, 3]) for (let s = 0; s < seeds; s++) {
            if (quick && (seed++ % 3)) continue;
            const res = simulate({ kind, side, fps, lat, sigma, lose: kind === 'chop' || kind === 'punch' ? lose : 0, seed: seed * 15485863 + s });
            m.falseN++;
            if (res.got) { m.falseAct++; m.falseWhy[kind] = (m.falseWhy[kind] || 0) + 1; }
        }
    }
    const pct = (a, q) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    return {
        throws: m.throws, thrownShare: m.thrown / m.throws, fellDown: m.fellDown, asDrop: m.asDrop, missed: m.missed,
        spdErrMean: mean(m.spdErr), spdErrP90: pct(m.spdErr, 0.9), angErrMean: mean(m.angErr), angErrP90: pct(m.angErr, 0.9),
        lagGameP50: pct(m.lagGame, 0.5), lagGameP95: pct(m.lagGame, 0.95), lagTotalP95: pct(m.lagTotal, 0.95),
        drops: m.drops, dropShare: m.dropped / Math.max(1, m.drops), dropLagP95: pct(m.dropLag, 0.95),
        falseN: m.falseN, falseShare: m.falseAct / Math.max(1, m.falseN), falseWhy: m.falseWhy, fails: m.fails, fell: m.fell,
    };
}
