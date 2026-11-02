#!/usr/bin/env node
/**
 * armstab.mjs — does the hero's arm tremble? The author: «когда я поднимаю руку вверх, она может шататься, дрожать… когда
 * я близко подхожу к стене или горе, рука… начинает дрожать, у неё истерика… когда размахиваю рукой — тоже дрожание».
 *
 * The whole way a camera's arm takes to the hero's arm on the screen, the game's own code: a person's arm (human poses and
 * movements) seen by a noisy camera (30 pictures a second with a jittery clock, picture noise, MediaPipe's much noisier
 * depth) → TrackingGuard.PoseStabilizer (1€ on every point) → PoseSmoother (between pictures, 60 game frames a second) →
 * VoxelCharacter.updateArmsLookAt (ArmSolver, the bones) → HandBlocks (the hand never in a block) → where the hand and
 * the arm are drawn.
 *
 *   node tools/armstab.mjs [--check] [--v] [--only still|swing|moving|step|wall]
 *
 * Metrics (game metres → cm; the hero's arm is 1.9 m from the shoulder):
 *   still — (a good camera and a noisy one) the drawn hand's trembling while the player holds the arm still (RMS about its mean, cm; the forearm's, degrees),
 *     arm down / raised overhead / sideways / forward / pointing up; worst of them;
 *   swing — a swing back and forth 1…6 Hz: how much of it is drawn (amplitude, %) and how late (ms);
 *   step — a quick move and a stop: how far it goes past (overshoot, % of the move);
 *   wall — the hand pushed into a wall / a slope / a ceiling, the shoulder at a wall, walking along it: how deep the drawn
 *     hand goes in (cm), how much it trembles while pressed (RMS, cm: all of it — along the wall it is the player's own
 *     arm — and in and out of the wall), how often it turns back and forth in and out (per second).
 */
import * as THREE from 'three';
import { VoxelCharacter } from '../src/entities/Character.js';
import { PoseStabilizer } from '../src/input/TrackingGuard.js';
import { PoseSmoother } from '../src/input/PoseSmoother.js';
import { HandBlocks } from '../src/game/HandBlocks.js';
import { BLOCK } from '../src/world/Terrain.js';

/** Thresholds (only ever tighten). */
export const LIMITS = {
    // raised arms, the hands out of the picture's top (edge): before ArmGuard + the straight-arm turn fix 26…65 cm, 640…1650 cm/s,
    // the forearm spun up to 180° a frame; after ≤ 4.4 cm / 28 cm/s / 1°
    edgeCm: 6, edgeSpeed: 40, edgeSpin: 3,
    // a real camera (15 pictures a second, noisy, MediaPipe's depth noisier still) - the arm held bent forward / hanging: the
    // biggest jump of the drawn hand in one frame. Before (ArmSolver flipping the forearm behind the body on the depth's noise,
    // drawn there at once - the author 02.11: «резко скачет назад»): 166 / 77 cm; after the side's guard: 22 / 28
    camJumpCm: 35,
    // the arm held still, the worst pose (the hand in game metres — the hero is 3.5 m — and the forearm): a usual camera (noise
    // ×0.3: ≈ 0.4 cm of a real arm per point, as tools/handbench/pointing.mjs's 720p webcam) and a very noisy one (×1: ≈ 1.4 cm;
    // MediaPipe's depth far worse). Before (the side flipping on the noise, √ steep at the plane): 6…10 cm / 3…4° and
    // 18…21 cm / 8…10°
    goodCm: 0.8, goodDeg: 0.6, noisyCm: 5.5, noisyDeg: 4.0,
    // «рывки в покое» — how fast the still hand is drawn moving (cm/s RMS, frame to frame): what the eye sees as trembling. 31.10
    // the arm's own filter was switched off on a usual camera (for the wand's slow aim) and this went 2…3 → 22…38 cm/s (the
    // author: «руки начали трястись»); with the filter back (opened by a deliberate move): 2…7 cm/s; very noisy: 155…210 → ≤ 170
    goodSpeed: 8, noisySpeed: 185,
    // «рывки в движении» — the arm moving a wand (a careful aim, waving, circles; a usual camera): the drawn hand's jerk frame
    // to frame (mm per frame², RMS) — a smooth move has next to none, the camera's 30 pictures a second drawn as steps and a
    // carry ahead switching on/off at a picture make it. Before the arm's rework (31.10, before ArmSolver): 2.4 / 5.1 / 7.7;
    // 01.11 (the author: «с палочкой рука подрагивает») 11 / 36 / 38; with the drawn arm's light smoothing and a gliding carry: ≤ 6 / 16 / 17
    moveAim: 7, moveWave: 19, moveCircle: 18,
    // (01.11: 50 → 52 — the drawn arm's light smoothing back (the arm moving a wand: jerks 38 → 15) costs ~1 ms on a 1 Hz swing;
    // the author asked for the steady arm; the swing's own lag is the camera's filter and the blend, ~49 ms without it)
    swingLagMs: 52, swingAmp3: 0.92, // a swing up to 3 Hz: drawn ≥ 92 %, ≤ 50 ms late (before: 48 ms; the camera's filter and the blend between pictures)
    overshoot: 0.03, // a quick move and a stop
    // the hand at a wall, a usual camera: never in it, still while pressed, no twitch (before: a shoulder at the wall let the
    // arm 38 cm through; 0.6…0.8 cm in and out, 3…9 times a second, twitches of up to 18 cm)
    wallDepthCm: 1, wallCm: 0.5, wallFlips: 4, wallJumpCm: 3, // (31.10, the filter back: 1.3 /s, 2.2 cm; without it 7 /s, 4 cm)
};

const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const DEG = 180 / Math.PI;

/** The right arm's poses (body space: x out to the right, y up, z back): [upper arm, forearm]. */
export const POSES = {
    rest: [[0.1, -1, 0.02], [0.1, -1, -0.15]],
    overhead: [[0.2, 1, 0.02], [0.1, 1, 0.05]],
    tpose: [[1, 0, 0.02], [1, 0, 0.02]],
    reach: [[0.15, -0.1, -1], [0, 0, -1]],
    pointUp: [[0.8, 0.6, -0.05], [0.8, 0.6, -0.05]],
    raisedBent: [[0.9, 0.35, 0.05], [0.05, 1, 0]], // «рука поднята»: elbow out, the hand up by the head
    down45: [[0.3, -0.5, -0.8], [0.25, -0.55, -0.8]], // the hand forward and down (at the ground in front)
};

/**
 * A person in front of a camera. arm(t) → [u, f] of the hero's right arm (body space). The left arm hangs down.
 * Returns the frames' measurements: { t, hand: Vector3 (world), fore: Vector3 (unit), up: Vector3 (upper arm unit) }.
 */
export function run({ arm, seconds, seed = 1, camHz = 30, gameHz = 60, noise = 1, world = null, body = null, pre = null, y0 = 0.4, edge = false }) {
    const r = rng(seed);
    const sw = 0.38, upper = sw * 0.78, fore = sw * 0.7, scale = 0.45, aspect = 16 / 9;
    const zScale = 0.6, zNoise = 0.04 * noise, xyNoise = 0.006 * noise; // (≈ 1–2 cm of a real arm; MediaPipe's depth much worse)
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter(scene, { remote: true });
    ch.handNow = () => clock * 1000;
    const guard = new PoseStabilizer(), sm = new PoseSmoother();
    const game = world ? { character: ch, world: { terrain: { data: { get: (ix, L, iz) => (world(ix, L, iz) ? BLOCK.STONE : BLOCK.AIR) } } } } : null;
    const hb = game ? new HandBlocks(game) : null;
    let clock = 0, nextCam = 0, camCount = 0;
    const dtG = 1 / gameHz, out = [];
    const pic = (X, Y, Z) => {
        const p = { x: 0.5 - (X * scale) / aspect + gauss(r) * xyNoise / aspect, y: y0 - Y * scale + gauss(r) * xyNoise, z: (Z * scale * zScale) / aspect + gauss(r) * zNoise / aspect, visibility: 0.99 };
        // (edge: a point out of the picture's top is the network's guess - low visibility flickering round 0.35, the place
        // wandering several centimetres picture to picture, pulled towards the edge - as a real camera does with raised arms)
        if (edge && p.y < 0.02) {
            const out = Math.min(1, (0.02 - p.y) / 0.06);
            p.visibility = Math.max(0.05, 0.6 - 0.35 * out + (r() - 0.5) * 0.4);
            p.y = p.y * 0.6 + gauss(r) * 0.03 * (0.4 + out);
            p.x += gauss(r) * 0.02 * (0.4 + out) / aspect;
            p.z += gauss(r) * zNoise;
        }
        return p;
    };
    const lmFill = (lm, i, X, Y, Z) => { lm[i] = pic(X, Y, Z); };
    for (let step = 0; clock < seconds; step++) {
        clock = step * dtG;
        if (body) body(ch, clock);
        while (nextCam <= clock) {
            // a picture: the person as at nextCam (the camera's clock jitters ±4 ms)
            const tc = nextCam;
            const [u0, f0] = arm(tc);
            const u = norm(u0), f = norm(f0);
            const lm = new Array(33);
            for (let i = 0; i < 33; i++) lm[i] = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
            const shR = [sw / 2, 0, 0], shL = [-sw / 2, 0, 0];
            const el = [shR[0] + u[0] * upper, u[1] * upper, u[2] * upper];
            const wr = [el[0] + f[0] * fore, el[1] + f[1] * fore, el[2] + f[2] * fore];
            lmFill(lm, 12, ...shR); lmFill(lm, 14, ...el); lmFill(lm, 16, ...wr);
            lmFill(lm, 11, ...shL); lmFill(lm, 13, -sw / 2 - 0.03, -upper, 0); lmFill(lm, 15, -sw / 2 - 0.05, -upper - fore, -0.04);
            lmFill(lm, 0, 0, 0.32, -0.05); lmFill(lm, 23, sw * 0.3, -0.9, 0); lmFill(lm, 24, -sw * 0.3, -0.9, 0);
            const g = guard.process(lm, tc * 1000);
            const P = (i) => ({ x: g[i].x, y: g[i].y, z: g[i].z || 0 });
            const pose = { aspect, leftShoulder: P(11), leftElbow: P(13), leftWrist: P(15), rightShoulder: P(12), rightElbow: P(14), rightWrist: P(16), nose: P(0) };
            // (the picture reaches the game a little later; its own time as PoseService gives it — the program's stamp, 35 ms
            // before it arrives: PoseSmoother.PREDICT carries the arm ahead by that age as in the game — tools/handbench/pointing.mjs)
            const at = tc * 1000 + 25 + (r() - 0.5) * 12;
            pose.ts = at - 35;
            sm.push(pose, at);
            camCount++;
            nextCam += 1 / camHz + (r() - 0.5) * 0.008;
        }
        const pose = sm.sample(clock * 1000 + 25);
        if (!pose) continue;
        if (pre) pre(ch, clock);
        ch.updateArmsLookAt(pose, dtG);
        if (hb) hb.keepOut(ch, dtG);
        const hand = ch.getHandWorldPosition('right', new THREE.Vector3());
        const S = ch.rightArmAnchor.getWorldPosition(new THREE.Vector3());
        const E = ch.rightElbowAnchor.getWorldPosition(new THREE.Vector3());
        out.push({ t: clock, hand, S, E, qE: ch.rightElbowAnchor.getWorldQuaternion(new THREE.Quaternion()), fore: hand.clone().sub(E).normalize(), up: E.clone().sub(S).normalize(), pushed: hb ? hb.pushed.right : 0, K: hb?._mem?.get(ch)?.right.K.clone() ?? null, ch });
    }
    return out;
}

const mean3 = (a) => { const m = new THREE.Vector3(); for (const v of a) m.add(v); return m.multiplyScalar(1 / a.length); };
const rms3 = (a) => { const m = mean3(a); let s = 0; for (const v of a) s += v.distanceToSquared(m); return Math.sqrt(s / a.length); };
const rmsAng = (a) => { const m = mean3(a).normalize(); let s = 0; for (const v of a) { const x = Math.acos(Math.max(-1, Math.min(1, v.dot(m)))); s += x * x; } return Math.sqrt(s / a.length) * DEG; };

/** The arm held still in each pose. */
export function still({ seeds = 3, noise = 1 } = {}) {
    const res = {};
    for (const name of Object.keys(POSES)) {
        let cm = 0, deg = 0, sp = 0;
        for (let s = 0; s < seeds; s++) {
            const fr = run({ arm: () => POSES[name], seconds: 5.5, seed: 11 + s * 31 + name.length, noise }).filter((f) => f.t > 2.5);
            cm = Math.max(cm, rms3(fr.map((f) => f.hand)) * 100);
            deg = Math.max(deg, rmsAng(fr.map((f) => f.fore)));
            // «рывки в покое»: how fast the still hand is drawn moving, frame to frame (cm/s RMS) — what the eye sees as trembling
            // (a slow wander of 1 cm is not seen; the same 1 cm jumping picture to picture is: 31.10 the hand at rest went 2…3 → 22…38)
            let s2 = 0;
            for (let i = 1; i < fr.length; i++) s2 += fr[i].hand.distanceToSquared(fr[i - 1].hand) / (fr[i].t - fr[i - 1].t) ** 2;
            sp = Math.max(sp, Math.sqrt(s2 / (fr.length - 1)) * 100);
        }
        res[name] = { cm, deg, sp };
    }
    return res;
}

/** The arms' poses with the hands out of the picture's top (the player close, arms raised): the elbow seen, the wrist a guess. */
export const EDGE_POSES = {
    overhead: POSES.overhead,
    raisedBent: POSES.raisedBent,
    halfBentUp: [[0.75, 0.65, 0.05], [-0.35, 1, 0.05]], // (the author: raised, the arms half bent, the hands not seen)
    vUp: [[0.55, 0.85, 0.02], [0.45, 0.9, 0.02]],
};

/**
 * Raised arms whose hands are out of the picture (the author: «руки полусгибаются, и кисти не видны, но это не повод чтобы руки
 * мигали или дрожали или их искривляло»): the hand's trembling (cm, RMS), its frame-to-frame speed (cm/s), the forearm's
 * direction (°) and its spin round its own length (° per frame, RMS - the hand on it whirls), with the camera's usual noise.
 */
export function edge({ seeds = 3, noise = 0.3 } = {}) {
    const res = {};
    for (const name of Object.keys(EDGE_POSES)) {
        let cm = 0, deg = 0, sp = 0, spin = 0, spinMax = 0;
        for (let s = 0; s < seeds; s++) {
            // (as a player does: the arms seen in front first, then raised over 0.5 s - the hands go out of the picture)
            const [U, F] = EDGE_POSES[name], A = POSES.reach;
            const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
            const arm = (t) => { const k = Math.max(0, Math.min(1, (t - 1.2) / 0.5)), e = k * k * (3 - 2 * k); return [mix(A[0], U, e), mix(A[1], F, e)]; };
            const fr = run({ arm, seconds: 6, seed: 5 + s * 17 + name.length, noise, y0: 0.17, edge: true }).filter((f) => f.t > 3);
            cm = Math.max(cm, rms3(fr.map((f) => f.hand)) * 100);
            deg = Math.max(deg, rmsAng(fr.map((f) => f.fore)));
            let s2 = 0, w2 = 0;
            const q = new THREE.Quaternion();
            for (let i = 1; i < fr.length; i++) {
                s2 += fr[i].hand.distanceToSquared(fr[i - 1].hand) / (fr[i].t - fr[i - 1].t) ** 2;
                q.copy(fr[i - 1].qE).invert().multiply(fr[i].qE); // (the turn in the forearm's own frame: its z is the length)
                const tw = Math.abs(2 * Math.atan2(q.z, q.w)) * DEG, twist = Math.min(tw, 360 - tw);
                w2 += twist * twist; spinMax = Math.max(spinMax, twist);
            }
            sp = Math.max(sp, Math.sqrt(s2 / (fr.length - 1)) * 100);
            spin = Math.max(spin, Math.sqrt(w2 / (fr.length - 1)));
        }
        res[name] = { cm, deg, sp, spin, spinMax };
    }
    return res;
}

/** A real camera (15 a second, noisy): the arm held still - bent forward (the forearm towards the camera), hanging. */
export function realcam({ seeds = 4 } = {}) {
    const res = {};
    const poses = { holdBent: [[0.3, -0.6, -0.6], [0.1, 0.3, -0.9]], rest: POSES.rest, reach: POSES.reach };
    for (const [name, p] of Object.entries(poses)) {
        let jump = 0;
        for (let s = 0; s < seeds; s++) {
            const fr = run({ arm: () => p, seconds: 5, seed: 3 + s * 7, camHz: 15, noise: 1 }).filter((f) => f.t > 1.5);
            for (let i = 1; i < fr.length; i++) jump = Math.max(jump, fr[i].hand.distanceTo(fr[i - 1].hand) * 100);
        }
        res[name] = { jump };
    }
    return res;
}

/** The angle of a direction in a plane (a, b: the plane's axes). */
const angIn = (v, a, b) => Math.atan2(v.dot(b), v.dot(a));

/** The wand arm: the upper arm a little down and out, the forearm pointing (yaw from straight ahead, right +; pitch up +). */
function wandArm(yaw, pitch) {
    const y = yaw / DEG, p = pitch / DEG, f = [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
    return [norm([f[0] * 0.6 + 0.35, f[1] * 0.6 - 0.45, f[2] * 0.6]), f];
}
export const WAND_MOVES = {
    aim: (t) => wandArm(-10 + 12 * t, 3), // a careful aim, 12°/s
    wave: (t) => wandArm(15 + 12 * Math.sin(2 * Math.PI * t), 5 + 6 * Math.sin(2 * Math.PI * t * 0.7)), // waving the wand, 1 Hz ±12°
    circle: (t) => wandArm(15 + 15 * Math.cos(4.4 * t), 5 + 15 * Math.sin(4.4 * t)), // circles, 0.7 Hz
};

/** The arm moving a wand: the drawn hand's jerk frame to frame (mm per frame², RMS; relative to the body). */
export function moving({ seeds = 2, noise = 0.3 } = {}) {
    const res = {};
    for (const [name, arm] of Object.entries(WAND_MOVES)) {
        let mm = 0;
        for (let s = 0; s < seeds; s++) {
            const fr = run({ arm, seconds: 6, seed: 3 + s * 11, noise }).filter((x) => x.t > 2);
            const h = fr.map((x) => x.hand.clone().sub(x.ch.group.position));
            let s2 = 0;
            for (let i = 2; i < h.length; i++) s2 += h[i].clone().sub(h[i - 1]).sub(h[i - 1]).add(h[i - 2]).lengthSq();
            mm += Math.sqrt(s2 / (h.length - 2)) * 1000 / seeds;
        }
        res[name] = mm;
    }
    return res;
}

/** A swing (both segments, the whole arm turning about the shoulder in the picture's plane) at f Hz: drawn amplitude and lag. */
export function swing({ freqs = [1, 2, 3, 4, 6], seeds = 2 } = {}) {
    const res = {};
    const ax = new THREE.Vector3(1, 0, 0), ay = new THREE.Vector3(0, 1, 0);
    for (const f of freqs) {
        const A = (f <= 3 ? 30 : 15) / DEG, base = 10 / DEG;
        let amp = 0, lag = 0;
        for (let s = 0; s < seeds; s++) {
            const arm = (t) => { const th = base + A * Math.sin(2 * Math.PI * f * t); const d = [Math.cos(th), Math.sin(th), 0.03]; return [d, d]; };
            const fr = run({ arm, seconds: 1.5 + 4 / f, seed: 5 + s * 17 + f }).filter((x) => x.t > 1.5);
            // fit a·sin + b·cos at f to the drawn upper arm's angle (the true one is base + A sin)
            let ss = 0, sc = 0, n = 0, m = 0;
            for (const x of fr) m += angIn(x.fore, ax, ay);
            m /= fr.length;
            for (const x of fr) { const y = angIn(x.fore, ax, ay) - m, w = 2 * Math.PI * f * x.t; ss += y * Math.sin(w); sc += y * Math.cos(w); n++; }
            ss *= 2 / n; sc *= 2 / n;
            amp += Math.hypot(ss, sc) / A / seeds;
            lag += (-Math.atan2(sc, ss) / (2 * Math.PI * f)) * 1000 / seeds; // (y ≈ amp·sin(w − φ): φ / w = the delay)
        }
        res[f] = { amp, lagMs: lag };
    }
    return res;
}

/** A quick move from the arm down to sideways (0.25 s) and a stop: how far past the end it is drawn (% of the move). */
export function step({ seeds = 3 } = {}) {
    const ax = new THREE.Vector3(1, 0, 0), ay = new THREE.Vector3(0, 1, 0);
    let worst = 0;
    for (let s = 0; s < seeds; s++) {
        const a0 = -80 / DEG, a1 = 10 / DEG;
        const arm = (t) => { const k = Math.min(1, Math.max(0, (t - 1) / 0.25)), e = k * k * (3 - 2 * k), th = a0 + (a1 - a0) * e; const d = [Math.cos(th), Math.sin(th), 0.03]; return [d, d]; };
        const fr = run({ arm, seconds: 2.6, seed: 3 + s * 7, noise: 0.15 });
        let mx = -Infinity;
        for (const x of fr) if (x.t > 1) mx = Math.max(mx, angIn(x.fore, ax, ay));
        worst = Math.max(worst, (mx - a1) / (a1 - a0));
    }
    return { overshoot: Math.max(0, worst) };
}

/**
 * The hand at the world: each case puts a solid thing where the hand goes. `inside(p)`: how deep a point is in it (m, ≤ 0
 * out). Pressed: the frames where the player's own hand is in it.
 */
export const WALLS = {
    // the arm sideways into a wall on the right (blocks x ≥ 2 → the face at x 1.5), the hand 30 cm in it
    side: { n: [1, 0, 0], pose: 'tpose', world: (ix) => ix >= 2, inside: (p) => p.x - 1.5, place: (h) => [1.8 - h.x, 0, 0] },
    // standing sideways at the wall: the shoulder itself in it (the body's edge 0.48 from its middle, the shoulder at 0.7)
    shoulder: { n: [1, 0, 0], pose: 'reach', world: (ix) => ix >= 2, inside: (p) => p.x - 1.5, place: () => [1.5 - 0.5, 0, 0] },
    // the hand forward and down into a rising slope of steps (a mountain: its top at y 1.5 − z)
    slope: { n: [0, 1, 0], pose: 'down45', world: (ix, L, iz) => L <= 2 - iz, inside: () => null, place: (h) => [-h.x, 1.2 - h.y, -h.z] },
    // the hand raised under a low ceiling (blocks from layer 6 up → its underside at y 4.5), 30 cm into it
    ceiling: { n: [0, 1, 0], pose: 'overhead', world: (ix, L) => L >= 6, inside: (p) => p.y - 4.5, place: (h) => [0, 4.8 - h.y, 0] },
    // pressed on a wall in front (palm forward, 25 cm in it), walking along it with the body's sway
    front: { n: [0, 0, -1], pose: 'reach', world: (ix, L, iz) => iz <= -2, inside: (p) => -1.5 - p.z, place: (h, t) => [Math.sin(t * 5) * 0.03 + t * 0.4, Math.abs(Math.sin(t * 5)) * 0.03, -1.75 - h.z + Math.sin(t * 2.5) * 0.02] },
};

/** Where the hand of this pose is drawn from the body (no wall), for placing the body. */
const _cal = new Map();
function handOffset(pose) {
    if (!_cal.has(pose)) { const fr = run({ arm: () => POSES[pose], seconds: 2, noise: 0 }); const f = fr.at(-1); _cal.set(pose, f.hand.clone().sub(f.ch.group.position)); }
    return _cal.get(pose);
}

/** Is a world point in the case's solid thing (as HandBlocks sees blocks)? */
const solidAt = (W, p) => W.world(Math.round(p.x), Math.floor(p.y + 1.5), Math.round(p.z));
/** How deep a point is in the blocks (m): along the case's normal when it has one, else 0/1 cm steps out along +y. */
function depthOf(W, p) {
    const d = W.inside(p);
    if (d != null) return solidAt(W, p) ? Math.max(0, d) : 0;
    if (!solidAt(W, p)) return 0;
    let k = 0;
    while (k < 100 && solidAt(W, { x: p.x, y: p.y + k * 0.01, z: p.z })) k++;
    return k * 0.01;
}

export function wall({ seeds = 3, only = null, noise = 1 } = {}) {
    const res = {};
    for (const [name, W] of Object.entries(WALLS)) {
        if (only && only !== name) continue;
        let depth = 0, cm = 0, ncm = 0, flips = 0, jump = 0;
        for (let s = 0; s < seeds; s++) {
            const fr = run({ arm: () => POSES[W.pose], seconds: 5.5, seed: 21 + s * 13 + name.length, noise, world: W.world, body: (ch, t) => { const p = W.place(handOffset(W.pose), t); ch.group.position.set(p[0], p[1], p[2]); } });
            const pressed = fr.filter((f) => f.t > 2.5);
            // how deep: the hand, the palm's end (0.35 along the forearm)
            for (const f of pressed) {
                const tip = f.hand.clone().addScaledVector(f.fore, 0.35);
                depth = Math.max(depth, depthOf(W, f.hand), depthOf(W, tip));
            }
            // trembling: the hand relative to the body (the body walks in «front»)
            const rel = pressed.map((f) => f.hand.clone().sub(f.ch.group.position));
            // (the walk along the wall moves it on purpose: take its slow part out — 0.3 s running mean)
            const hp = rel.map((v, i) => { const a = Math.max(0, i - 9), b = Math.min(rel.length - 1, i + 9); const m = new THREE.Vector3(); for (let j = a; j <= b; j++) m.add(rel[j]); return v.clone().sub(m.multiplyScalar(1 / (b - a + 1))); });
            let s2 = 0; for (const v of hp) s2 += v.lengthSq();
            cm = Math.max(cm, Math.sqrt(s2 / hp.length) * 100);
            // in and out of the wall: the hand along the wall's normal (the trembling the author saw — «истерика»): its RMS and
            // how often it turns back with a step over 3 mm (per second)
            const N = new THREE.Vector3(...W.n);
            let s3 = 0; for (const v of hp) s3 += v.dot(N) ** 2;
            ncm = Math.max(ncm, Math.sqrt(s3 / hp.length) * 100);
            let n = 0, last = 0, acc = 0;
            for (let i = 1; i < rel.length; i++) {
                acc += rel[i].dot(N) - rel[i - 1].dot(N);
                if (Math.abs(acc) > 0.003) { const sg = Math.sign(acc); if (last && sg !== last) n++; last = sg; acc = 0; }
            }
            flips = Math.max(flips, n / (pressed.length / 60));
            // a jump: the most the hand moves in one frame (a still arm: a few mm; a face swapped, an elbow flipped: decimetres)
            for (let i = 1; i < rel.length; i++) jump = Math.max(jump, rel[i].distanceTo(rel[i - 1]) * 100);
        }
        res[name] = { depthCm: depth * 100, cm, ncm, flips, jump };
    }
    return res;
}

export function all(opts = {}) {
    const o = opts.only;
    return {
        good: !o || o === 'still' ? still({ noise: 0.3 }) : null,
        edge: !o || o === 'edge' ? edge() : null,
        realcam: !o || o === 'realcam' ? realcam() : null,
        still: !o || o === 'still' ? still() : null,
        swing: !o || o === 'swing' ? swing() : null,
        moving: !o || o === 'moving' ? moving() : null,
        step: !o || o === 'step' ? step() : null,
        wall: !o || o === 'wall' ? wall({ only: opts.wall, noise: 0.3 }) : null,
        wallNoisy: !o || o === 'wall' ? wall({ only: opts.wall, noise: 1 }) : null, // (shown, no limits: see verdict)
    };
}

/**
 * (A very noisy camera at a wall has no limits yet: PoseSmoother.PREDICT — the carry ahead the wand's aim needs, the hands'
 * session's — catches that noise too and the hand twitches 10–35 cm now and then; the arm's own filter can't take it out without
 * making the aim slow. Before: 6–51 cm.)
 */
export function verdict(r) {
    const bad = [];
    if (r.realcam) for (const [k, v] of Object.entries(r.realcam)) if (v.jump > LIMITS.camJumpCm) bad.push(`камера 15/с ${k}: рывок ${v.jump.toFixed(1)} см за кадр > ${LIMITS.camJumpCm}`);
    if (r.edge) for (const [k, v] of Object.entries(r.edge)) {
        if (v.cm > LIMITS.edgeCm) bad.push(`руки подняты, кисти за кадром ${k}: дрожь ${v.cm.toFixed(2)} см > ${LIMITS.edgeCm}`);
        if (v.sp > LIMITS.edgeSpeed) bad.push(`руки подняты, кисти за кадром ${k}: рывки ${v.sp.toFixed(1)} см/с > ${LIMITS.edgeSpeed}`);
        if (v.spinMax > LIMITS.edgeSpin) bad.push(`руки подняты, кисти за кадром ${k}: прокрутка предплечья ${v.spinMax.toFixed(1)}° за кадр > ${LIMITS.edgeSpin}`);
    }
    for (const [key, cmL, degL, spL, name] of [['good', LIMITS.goodCm, LIMITS.goodDeg, LIMITS.goodSpeed, 'хорошая камера'], ['still', LIMITS.noisyCm, LIMITS.noisyDeg, LIMITS.noisySpeed, 'шумная камера']]) {
        if (r[key]) for (const [k, v] of Object.entries(r[key])) {
            if (v.cm > cmL) bad.push(`покой (${name}) ${k}: ${v.cm.toFixed(2)} см > ${cmL}`);
            if (v.deg > degL) bad.push(`покой (${name}) ${k}: ${v.deg.toFixed(2)}° > ${degL}`);
            if (v.sp > spL) bad.push(`покой (${name}) ${k}: рывки ${v.sp.toFixed(1)} см/с > ${spL}`);
        }
    }
    if (r.swing) for (const [f, v] of Object.entries(r.swing)) {
        if (+f <= 3 && v.amp < LIMITS.swingAmp3) bad.push(`взмах ${f} Гц: ${(v.amp * 100).toFixed(0)} % < ${LIMITS.swingAmp3 * 100}`);
        if (+f <= 3 && v.lagMs > LIMITS.swingLagMs) bad.push(`взмах ${f} Гц: ${v.lagMs.toFixed(0)} мс > ${LIMITS.swingLagMs}`);
    }
    if (r.moving) for (const [k, lim] of [['aim', LIMITS.moveAim], ['wave', LIMITS.moveWave], ['circle', LIMITS.moveCircle]]) {
        if (r.moving[k] > lim) bad.push(`рывки в движении (${k}): ${r.moving[k].toFixed(1)} мм/кадр² > ${lim}`);
    }
    if (r.step && r.step.overshoot > LIMITS.overshoot) bad.push(`остановка: перелёт ${(r.step.overshoot * 100).toFixed(1)} % > ${LIMITS.overshoot * 100}`);
    if (r.wall) for (const [k, v] of Object.entries(r.wall)) {
        if (v.depthCm > LIMITS.wallDepthCm) bad.push(`стена ${k}: в ней ${v.depthCm.toFixed(1)} см > ${LIMITS.wallDepthCm}`);
        if (v.ncm > LIMITS.wallCm) bad.push(`стена ${k}: в стену и обратно ${v.ncm.toFixed(2)} см > ${LIMITS.wallCm}`);
        if (v.jump > LIMITS.wallJumpCm) bad.push(`стена ${k}: рывок ${v.jump.toFixed(1)} см за кадр > ${LIMITS.wallJumpCm}`);
        if (v.flips > LIMITS.wallFlips) bad.push(`стена ${k}: туда-сюда ${v.flips.toFixed(1)}/с > ${LIMITS.wallFlips}`);
    }
    return bad;
}

export function print(r) {
    const f = (x, d = 2) => x.toFixed(d);
    if (r.good) console.log('покой, хорошая камера (дрожь кисти, см / предплечья, ° / рывки кисти, см/с): ' + Object.entries(r.good).map(([k, v]) => `${k} ${f(v.cm)} / ${f(v.deg)} / ${f(v.sp, 1)}`).join(', '));
    if (r.realcam) console.log('камера 15/с, рука держится (самый большой рывок кисти за кадр, см): ' + Object.entries(r.realcam).map(([k, v]) => `${k} ${f(v.jump, 1)}`).join(', '));
    if (r.edge) console.log('руки подняты, кисти за кадром (дрожь кисти, см / предплечья, ° / рывки кисти, см/с / прокрутка предплечья, °/кадр, макс): ' + Object.entries(r.edge).map(([k, v]) => `${k} ${f(v.cm)} / ${f(v.deg)} / ${f(v.sp, 1)} / ${f(v.spin)}, ${f(v.spinMax, 1)}`).join(', '));
    if (r.still) console.log('покой, шумная камера: ' + Object.entries(r.still).map(([k, v]) => `${k} ${f(v.cm)} / ${f(v.deg)} / ${f(v.sp, 1)}`).join(', '));
    if (r.swing) console.log('взмахи (видно %, опоздание мс): ' + Object.entries(r.swing).map(([k, v]) => `${k} Гц ${f(v.amp * 100, 0)} % ${f(v.lagMs, 0)}`).join(', '));
    if (r.moving) console.log('рывки в движении, рука с палочкой (мм за кадр², наведение / помахивание / круги): ' + Object.values(r.moving).map((v) => f(v, 1)).join(' / '));
    if (r.step) console.log(`остановка: перелёт ${f(r.step.overshoot * 100, 1)} %`);
    if (r.wallNoisy) console.log('у стены, шумная камера (без порогов): ' + Object.entries(r.wallNoisy).map(([k, v]) => `${k} ${f(v.depthCm, 1)}; ${f(v.cm)} / ${f(v.ncm)}; ${f(v.flips, 1)}; рывок ${f(v.jump, 1)}`).join(', '));
    if (r.wall) console.log('у стены, обычная камера (в ней см; дрожь всего / в стену и обратно, см; туда-сюда /с; рывок за кадр, см): ' + Object.entries(r.wall).map(([k, v]) => `${k} ${f(v.depthCm, 1)}; ${f(v.cm)} / ${f(v.ncm)}; ${f(v.flips, 1)}; рывок ${f(v.jump, 1)}`).join(', '));
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const oi = args.indexOf('--only'), wi = args.indexOf('--wall');
    const r = all({ only: oi >= 0 ? args[oi + 1] : null, wall: wi >= 0 ? args[wi + 1] : null });
    print(r);
    if (args.includes('--check')) {
        const bad = verdict(r);
        if (bad.length) { console.log('ПРОВАЛ:\n  ' + bad.join('\n  ')); process.exit(1); }
        console.log('ok');
    }
}
