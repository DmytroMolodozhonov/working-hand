/**
 * The hand latency / steadiness measurement (see hand-latency.test.js): the whole
 * chain a hand's 21 points go through (stabilizer → interpreter → blending → arm
 * solver → the hand model) on a simulated clock — the camera gives 30 results a
 * second, the game draws 60 frames.
 */
import * as THREE from 'three';
import { PoseStabilizer, HandStabilizer } from '../../src/input/TrackingGuard.js';
import { PoseInterpreter } from '../../src/input/PoseInterpreter.js';
import { PoseSmoother } from '../../src/input/PoseSmoother.js';
import { VoxelCharacter } from '../../src/entities/Character.js';
import { frame } from '../e2e/poses.mjs';
import { synthHand } from './synth-hand.mjs';

const video = { videoWidth: 1280, videoHeight: 720 };
export const rot = (ax, ay, az) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax, ay, az, 'XYZ'));

/** A seeded normal random number (the camera network's jitter). */
function gauss(seed) {
    let s = seed;
    const u = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

/**
 * Runs the chain. The right hand turns from `R0` to `R1` within `moveMs` (0: at once,
 * at t = 0), the index finger bends from `b0` to `b1`; `noise`: the jitter of every
 * point (picture units). Returns a row per drawn frame: {t, q (the palm's world turn), ix (index bend)}.
 */
export function run({ R0 = rot(0, 0, 0), R1 = rot(-1.0, 0, 0), moveMs = 0, b0 = 0, b1 = 0, noise = 0, zNoise = null, poseNoise = 0, size = 0.1, side = 'right', cam = 1000 / 30, draw = 1000 / 60, until = 800 } = {}) {
    const guard = new PoseStabilizer();
    const hg = new HandStabilizer();
    const interp = new PoseInterpreter();
    const smoother = new PoseSmoother();
    const ch = new VoxelCharacter(new THREE.Scene());
    ch.setShowHands(true);
    ch.setHandVersion('v4'); // (the full hand)
    const hand = side === 'right' ? ch.rightSimplifiedHand : ch.leftSimplifiedHand;
    const pose = frame({ arms: 'up', leftCurl: null, rightCurl: null }).poseLandmarks;
    const wr = pose[side === 'right' ? 16 : 15];
    const qa = new THREE.Quaternion().setFromRotationMatrix(R0), qb = new THREE.Quaternion().setFromRotationMatrix(R1);
    const g = gauss(12345);
    const lmAt = (t) => {
        const k = moveMs ? Math.max(0, Math.min(1, t / moveMs)) : (t >= 0 ? 1 : 0);
        const q = qa.clone().slerp(qb, k);
        const b = b0 + (b1 - b0) * k;
        const lm = synthHand(new THREE.Matrix4().makeRotationFromQuaternion(q), { side, at: [wr.x, wr.y], size, bends: { index: [b, b, b * 0.7] } });
        if (noise) for (const p of lm) { p.x += g() * noise; p.y += g() * noise; p.z += g() * (zNoise ?? noise); }
        return lm;
    };
    const rows = [];
    let t = -1500, nextCam = -1500;
    const qw = new THREE.Quaternion();
    const key = side === 'right' ? 'rightHandLandmarks' : 'leftHandLandmarks';
    while (t < moveMs + until) {
        if (t >= nextCam) {
            nextCam += cam;
            const lm = hg.process(lmAt(t), t);
            const pz = poseNoise ? pose.map((p) => ({ ...p, x: p.x + g() * poseNoise, y: p.y + g() * poseNoise, z: (p.z || 0) + g() * poseNoise * 2 })) : pose;
            smoother.push(interp.process({ poseLandmarks: guard.process(pz, t), [key]: lm }, video), t);
        }
        const p = smoother.sample(t);
        if (p) ch.updateArmsLookAt(p, draw / 1000);
        ch.group.updateMatrixWorld(true);
        hand.palm.getWorldQuaternion(qw);
        rows.push({ t, q: qw.clone(), ix: hand.fingerMeshes.index[1].pivot.rotation.x });
        t += draw;
    }
    return rows;
}

/**
 * The ms after the move ended until the drawn palm turned 90% of the way (turnMs)
 * and the index finger bent 90% (bendMs); null where nothing moved.
 */
export function measure(opts = {}) {
    const moveMs = opts.moveMs || 0, draw = opts.draw || 1000 / 60;
    const rows = run(opts);
    const last = rows[rows.length - 1];
    const start = rows.filter((r) => r.t < 0).pop();
    const total = start.q.angleTo(last.q);
    const turned = total > 1e-3 ? rows.find((r) => r.t >= 0 && r.q.angleTo(last.q) < total * 0.1) : null;
    const bendTotal = Math.abs(last.ix - start.ix);
    const bent = bendTotal > 1e-3 ? rows.find((r) => r.t >= 0 && Math.abs(r.ix - last.ix) < bendTotal * 0.1) : null;
    // during a slow move: how far behind the half-way point is drawn (ms)
    const half = total > 1e-3 ? rows.find((r) => r.t >= 0 && r.q.angleTo(start.q) > total * 0.5) : null;
    return {
        midMs: half ? half.t - moveMs / 2 : null,
        turnMs: turned ? turned.t - moveMs : null, turnFrames: turned ? Math.round((turned.t - moveMs) / draw) : null, total,
        bendMs: bent ? bent.t - moveMs : null, bendTotal,
    };
}

/** A still hand with the network's jitter: the mean turn of the drawn palm between drawn frames (rad) and its spread. */
export function jitter(noise = 0.003, opts = {}) {
    const rows = run({ R1: opts.R0 || rot(0, 0, 0), noise, until: 2000, ...opts }).filter((r) => r.t > 0);
    let step = 0, ix = 0;
    const mean = rows[0].q.clone();
    let spread = 0;
    for (let i = 1; i < rows.length; i++) {
        step += rows[i].q.angleTo(rows[i - 1].q);
        ix += Math.abs(rows[i].ix - rows[i - 1].ix);
    }
    for (const r of rows) spread = Math.max(spread, r.q.angleTo(mean));
    return { step: step / (rows.length - 1), finger: ix / (rows.length - 1), spread };
}
