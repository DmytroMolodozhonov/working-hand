/**
 * RealJoints.js — how far each joint of the «Реалистичный» hero bends (a person's ranges, the author: «реалистичный с
 * точки зрения гибкости тела»), as plain numbers and small pure functions (no THREE: tests read them as they are).
 *
 * The game's own parts stay the base — the palms and fingers where the game has them, the arms' anchors — and the
 * drawn body bends round them within these ranges:
 *   the spine (4 bones) takes the lean, the steps' sway, and what the neck cannot turn; the neck (with the head) turns
 *   ±80°, nods 60° down / 50° up, tilts 40°; the collarbones lift and come forward (a shrug, a reach); the elbow bends
 *   0…150° and only one way (the game's ArmSolver keeps it so — the drawn arm follows it); the wrist bends 80° / 70°
 *   (the drawn elbow swings round the shoulder–wrist line to keep it so — `elbowCost`); the knee 0…140°, only forward.
 * Angles in radians unless the name says degrees.
 */

const D = Math.PI / 180;
export const JOINTS = {
    elbow: { maxDeg: 150 },
    knee: { maxDeg: 140 },
    // the neck alone (the head on the chest)
    neck: { yaw: 80 * D, down: 60 * D, up: 50 * D, roll: 40 * D },
    // the whole spine (hips → upper chest) on top of it
    spine: { yaw: 35 * D, fwd: 50 * D, back: 25 * D, roll: 25 * D },
    // how much of a head's turn the spine takes even while the neck could do it all (a person turns the chest too)
    spineShare: 0.18,
    wrist: { maxDeg: 80 },
    clav: { lift: 0.38, fwd: 0.22, back: 0.1 },
    breath: { period: 4.2, runPeriod: 1.3, chest: 0.014, shoulders: 0.012 },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** The least shoulder→wrist (hip→ankle) distance that keeps the middle joint within `maxDeg` of bending. */
export function minReach(L1, L2, maxDeg) {
    const inner = Math.PI - maxDeg * D;
    return Math.sqrt(L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos(inner));
}
/** How far (rad) a two-bone limb with the ends `dist` apart is bent at its middle joint. */
export function bendOf(L1, L2, dist) {
    const d = clamp(dist, Math.abs(L1 - L2), L1 + L2);
    const c = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
    return Math.PI - Math.acos(c);
}

/**
 * A head's turn on the body (yaw left +, pitch up +, roll), split: the spine takes `spineShare` of it and whatever the
 * neck cannot (within its own range); what neither can is not done. Writes {neck: {y, x, z}, spine: {y, x, z}} into
 * `out` (no garbage).
 */
export function splitHeadTurn(yaw, pitch, roll, out = { neck: { y: 0, x: 0, z: 0 }, spine: { y: 0, x: 0, z: 0 } }) {
    const N = JOINTS.neck, S = JOINTS.spine, k = JOINTS.spineShare;
    const part = (v, nLo, nHi, sLo, sHi) => {
        let sp = v * k;
        let nk = clamp(v - sp, nLo, nHi);
        sp = clamp(v - nk, sLo, sHi);
        nk = clamp(v - sp, nLo, nHi);
        return [nk, sp];
    };
    let r = part(yaw, -N.yaw, N.yaw, -S.yaw, S.yaw); out.neck.y = r[0]; out.spine.y = r[1];
    // (pitch: + up — the spine bends back only a little, forward more)
    r = part(pitch, -N.down, N.up, -S.fwd, S.back); out.neck.x = r[0]; out.spine.x = r[1];
    r = part(roll, -N.roll, N.roll, -S.roll, S.roll); out.neck.z = r[0]; out.spine.z = r[1];
    return out;
}

/** A head's turn kept within the neck's own range (yaw, pitch up +, roll) — in place on a {y, x, z}. */
export function clampNeck(e) {
    const N = JOINTS.neck;
    e.y = clamp(e.y, -N.yaw, N.yaw);
    e.x = clamp(e.x, -N.down, N.up);
    e.z = clamp(e.z, -N.roll, N.roll);
    return e;
}

/**
 * The price of an elbow's place (lower is better): far from where the camera saw it, the wrist bent past its range,
 * the elbow inside the chest. `wristDeg` — the angle between the forearm and the palm; `insideChest` 0…1 — how deep.
 */
export function elbowCost(swing, wristDeg, insideChest) {
    const over = Math.max(0, wristDeg - JOINTS.wrist.maxDeg) / 30;
    return swing * swing * 0.6 + over * over * 4 + insideChest * 12;
}

/** A breath's length (s): calm, or quick while running. */
export function breathPeriod(run = 0) {
    const B = JOINTS.breath;
    return B.period + (B.runPeriod - B.period) * clamp(run, 0, 1);
}
/** The breath at its phase (rad, accumulated — the period may change without a jump): 0 out … 1 in. */
export function breathAt(phase) { return 0.5 - 0.5 * Math.cos(phase); }
