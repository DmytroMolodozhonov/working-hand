/**
 * pointing.mjs — «куда указывает палочка»: the whole chain a camera picture goes through until the wand's aim on the
 * screen, on a simulated clock (pure node: THREE, no browser). Used by tools/handbench/pointbench.mjs and
 * tests/unit/pointing.test.js.
 *
 * The truth: the player's straight arm and hand (index along the forearm, the thumb up — a wand held as a pointer)
 * pointing at d*(t) in the body's space (x right, y up, z back). The camera sees it: the picture's points with noise
 * (x, y; MediaPipe's depth weaker and much noisier), a camera at `camHz`, every picture reaching the game `latency` ms
 * after it was taken (exposure + USB + the networks + the stream), sometimes a little late (`jitterMs`). Then the
 * game's own way: PoseService (PoseStabilizer + HandStabilizer on the picture's own clock), PoseInterpreter,
 * PoseSmoother at the game's `drawHz`, VoxelCharacter.updateArmsLookAt (ArmSolver), the V5 wand (Items._v5Wand: the
 * palm's wand axis mixed with the forearm, steadied by its own speed). Measured per drawn frame against the truth at
 * that same moment:
 *   - err   — the angle between the aim and where the arm really points NOW (degrees): bias + lag + jitter;
 *   - lagMs — the delay that best explains the drawn aim (the drawn aim against the truth shifted back);
 *   - jit   — at rest: the RMS of the drawn aim around its own mean (degrees).
 */
import * as THREE from 'three';
import { PoseStabilizer, HandStabilizer } from '../../src/input/TrackingGuard.js';
import { PoseInterpreter } from '../../src/input/PoseInterpreter.js';
import { PoseSmoother } from '../../src/input/PoseSmoother.js';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { AimSteady, wandAimDir } from '../../src/game/V5WandAim.js';
import { frame } from '../../tests/e2e/poses.mjs';
import { synthHand, ASPECT } from '../../tests/unit/synth-hand.mjs';

const video = { videoWidth: 1280, videoHeight: 720 };
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gaussOf = (r) => () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

/** Body-space direction from yaw (+ right) and pitch (+ up), degrees; forward is −z. */
export function dirOf(yaw, pitch, out = new THREE.Vector3()) {
    const y = yaw * D2R, p = pitch * D2R;
    return out.set(Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
}

/** The movements: a function t (ms) → {yaw, pitch} (degrees) of the pointing arm. */
export const MOVES = {
    // still, at the places one points at on the screen (the right hand: in front, out to its side, up, down)
    still: (o) => () => ({ yaw: o.yaw ?? 15, pitch: o.pitch ?? 5 }),
    // a slow aim from one target to another (0.6 s), then held
    aim: (o) => (t) => { const k = Math.max(0, Math.min(1, (t - 300) / 600)); const e = k * k * (3 - 2 * k); return { yaw: 5 + 35 * e, pitch: 0 + 15 * e }; },
    // a quick flick to a new target (150 ms) — a duel shot
    flick: () => (t) => { const k = Math.max(0, Math.min(1, (t - 300) / 150)); const e = k * k * (3 - 2 * k); return { yaw: -10 + 45 * e, pitch: 0 + 10 * e }; },
    // sweeping back and forth (drawing, following a flying thing): period 1.4 s, ±25°
    sweep: () => (t) => ({ yaw: 15 + 25 * Math.sin(2 * Math.PI * t / 1400), pitch: 5 + 8 * Math.sin(2 * Math.PI * t / 2100) }),
    // slow tracking (a careful aim: 12°/s)
    track: () => (t) => ({ yaw: -10 + 0.012 * Math.max(0, t), pitch: 3 }),
};

/** The chain's own numbers (what the game uses), changed by the bench to compare. */
export const CHAIN = {
    camHz: 30, // pictures a second
    latency: 70, // ms from the moment a picture is taken until the game has it (the camera's own + the networks + the stream)
    camOwn: 35, // ms of it the game can't know: from the light on the sensor until the program reads the picture (exposure, USB, decoding)
    jitterMs: 6, // ± how unevenly the pictures arrive
    drawHz: 60,
    noise: 0.0025, // the picture's x, y jitter of the hand's points (height units; a 1280×720 webcam, a far player)
    zNoise: 0.008, // the network's depth (much worse)
    poseNoise: 0.002, // the body network's points
    poseZNoise: 0.012,
    zScale: 0.6, // MediaPipe's depth is weaker than real
    scale: 0.32, // the shoulders' width in the picture (height units: a player ~2 m from a 720p camera)
};

/**
 * Runs the chain for `ms` after a 1.5 s warm-up; returns the drawn frames {t, aim, truth, truthAt(ms)}.
 * opts: move, side ('right'|'left'), seed, chain overrides, aim(…) — a replacement for the wand's aim (tests).
 */
export function run(opts = {}) {
    const C = { ...CHAIN, ...(opts.chain || {}) };
    const side = opts.side || 'right';
    const mv = (MOVES[opts.move || 'still'])(opts);
    const r = rng(opts.seed ?? 7), g = gaussOf(r);
    const guard = new PoseStabilizer();
    const hg = { left: new HandStabilizer(), right: new HandStabilizer() };
    const interp = new PoseInterpreter();
    const smoother = new PoseSmoother();
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setShowHands(true);
    ch.setHandVersion('v5');
    let clock = 0;
    ch.handNow = () => clock;
    const hand = side === 'right' ? ch.rightSimplifiedHand : ch.leftSimplifiedHand;
    const base = frame({ arms: 'down', leftCurl: null, rightCurl: null }).poseLandmarks;
    const iS = side === 'right' ? 12 : 11, iE = iS + 2, iW = iS + 4;
    const sw = Math.hypot((base[11].x - base[12].x) * ASPECT, base[11].y - base[12].y) || C.scale;
    const Lu = sw * 0.78, Lf = sw * 0.66;
    const truthAt = (t, out = new THREE.Vector3()) => { const a = mv(t); return dirOf(side === 'right' ? a.yaw : -a.yaw, a.pitch, out); };
    const toPic = (P0, v, k, zs) => ({ x: P0.x - (v.x * k) / ASPECT, y: P0.y - v.y * k, z: (P0.z || 0) + (v.z * k * zs) / ASPECT });
    const picture = (t) => {
        const d = truthAt(t);
        const pose = base.map((p) => ({ ...p }));
        const S = pose[iS];
        const E = toPic(S, d, Lu, C.zScale), W = toPic(E, d, Lf, C.zScale);
        pose[iE] = { ...pose[iE], ...E, visibility: 0.99 };
        pose[iW] = { ...pose[iW], ...W, visibility: 0.99 };
        for (const p of pose) { p.x += g() * C.poseNoise; p.y += g() * C.poseNoise; p.z = (p.z || 0) + g() * C.poseZNoise; }
        // the hand: index along the arm, the thumb up (a pointer grip), the fingers a little bent round a wand
        const y = d.clone();
        const x = new THREE.Vector3(0, -1, 0).addScaledVector(y, y.y).normalize(); // (index → little finger: down)
        if (side === 'left') x.negate();
        const z = new THREE.Vector3().crossVectors(x, y);
        const R = new THREE.Matrix4().makeBasis(x, y, z);
        const lm = synthHand(R, { side, at: [W.x, W.y], size: sw * 0.42, bends: { middle: [1.2, 1.2, 0.8], ring: [1.3, 1.3, 0.8], pinky: [1.3, 1.3, 0.8], index: [0.3, 0.3, 0.2] } });
        for (const p of lm) { p.x += g() * C.noise; p.y += g() * C.noise; p.z = (p.z || 0) + g() * C.zNoise + (W.z || 0); }
        return { pose, lm };
    };
    // the camera's pictures: taken at tk, reach the game at tk + latency (± jitter), newest wins
    const step = 1000 / C.camHz, draw = 1000 / C.drawHz;
    const queue = [];
    let nextTake = -1500;
    const rows = [];
    const until = opts.ms ?? 2000;
    const steady = new AimSteady();
    let q = null;
    const qOut = new THREE.Quaternion();
    for (clock = -1500; clock < until; clock += draw) {
        while (nextTake <= clock) {
            queue.push({ at: nextTake + C.latency + (r() * 2 - 1) * C.jitterMs, taken: nextTake, pic: picture(nextTake) });
            nextTake += step;
        }
        // the newest picture that has arrived (older ones still waiting are dropped, as PoseService does)
        let got = null;
        while (queue.length && queue[0].at <= clock) got = queue.shift();
        if (got) {
            // PoseService: the picture's own time — the program says when it was taken; the game takes `now − age`
            // (the program stamps the moment it read the picture: the camera's own delay before it is unknown)
            const age = clock - (got.taken + Math.min(C.camOwn, C.latency));
            const ts = clock - Math.max(0, age);
            const pose = guard.process(got.pic.pose, ts);
            const key = side === 'right' ? 'rightHandLandmarks' : 'leftHandLandmarks';
            const results = { poseLandmarks: pose, [key]: hg[side].process(got.pic.lm, ts) };
            const pd = interp.process(results, video);
            pd.ts = ts;
            smoother.push(pd, clock);
        }
        const p = smoother.sample(clock);
        if (!p) continue;
        ch.updateArmsLookAt(p, draw / 1000);
        ch.group.updateMatrixWorld(true);
        // the V5 wand's aim (Items._v5Wand)
        const want = opts.aim ? opts.aim(ch, hand, side) : wandAimDir(ch, hand, side, new THREE.Vector3());
        if (!want) continue;
        const target = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), want);
        if (!q) q = target.clone();
        else q.slerp(target, steady.alpha(new THREE.Vector3(0, 1, 0).applyQuaternion(q), want, draw / 1000));
        qOut.copy(q);
        const aim = new THREE.Vector3(0, 1, 0).applyQuaternion(qOut).normalize();
        if (clock >= 0) rows.push({ t: clock, aim, truth: truthAt(clock) });
    }
    return { rows, truthAt };
}

/** The metrics of one run: mean / p90 error (deg), lag (ms: the shift of the truth that fits best), jitter (deg RMS). */
export function measure(opts = {}) {
    const { rows, truthAt } = run(opts);
    const errs = rows.map((r) => r.aim.angleTo(r.truth) * R2D).sort((a, b) => a - b);
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    const p90 = errs[Math.floor(errs.length * 0.9)];
    // bias: the mean aim against the mean truth over the last half (at rest it is the static error)
    const tail = rows.slice(rows.length >> 1);
    const ma = new THREE.Vector3(), mt = new THREE.Vector3();
    for (const r of tail) { ma.add(r.aim); mt.add(r.truth); }
    ma.normalize(); mt.normalize();
    const bias = ma.angleTo(mt) * R2D;
    let jit = 0;
    for (const r of tail) jit += (r.aim.angleTo(ma) * R2D) ** 2;
    jit = Math.sqrt(jit / tail.length);
    // «плавность»: the jerk of the drawn aim — its second difference frame to frame (deg), the whole run: steps between the
    // camera's pictures and trembling show here, a smooth move (however fast) doesn't
    let tremble = 0;
    const dv = new THREE.Vector3(), ddv = new THREE.Vector3();
    for (let i = 2; i < rows.length; i++) {
        ddv.copy(rows[i].aim).sub(dv.copy(rows[i - 1].aim).multiplyScalar(2)).add(rows[i - 2].aim);
        tremble += (ddv.length() * R2D) ** 2;
    }
    tremble = Math.sqrt(tremble / Math.max(1, rows.length - 2));
    // the lag: the shift L (ms) of the truth that the drawn aim matches best
    let lagMs = null;
    if (opts.move && opts.move !== 'still') {
        let best = Infinity;
        const tv = new THREE.Vector3(), tmp = new THREE.Vector3();
        // (debias: a constant offset taken out first — to read the lag of a chain that also points off, as the old one)
        const corr = opts.debias ? measure({ ...opts, move: 'still', debias: false, yaw: undefined }).corr : null;
        for (let L = -100; L <= 400; L += 5) {
            let s = 0;
            for (const r of rows) s += (corr ? tmp.copy(r.aim).applyQuaternion(corr) : r.aim).angleTo(truthAt(r.t - L, tv)) ** 2;
            if (s < best) { best = s; lagMs = L; }
        }
    }
    return { mean, p90, bias, jit, tremble, lagMs, corr: new THREE.Quaternion().setFromUnitVectors(ma, mt) };
}

/** A step: after a quick flick, how long until the drawn aim is within `deg` of the new target (ms after the move ended). */
export function settle(opts = {}, deg = 5) {
    const { rows } = run({ ...opts, move: 'flick' });
    const end = 450;
    const last = rows[rows.length - 1].aim;
    const hit = rows.find((r) => r.t >= end && rows.filter((q) => q.t >= r.t).every((q) => q.aim.angleTo(last) * R2D < deg));
    // how far the aim overshoots the target (deg)
    let over = 0;
    for (const r of rows) if (r.t > end) over = Math.max(over, r.aim.angleTo(last) * R2D * (r.aim.angleTo(rows[0].aim) > last.angleTo(rows[0].aim) ? 1 : 0));
    return { ms: hit ? hit.t - end : null, over };
}
