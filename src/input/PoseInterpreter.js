/**
 * PoseInterpreter.js — turns landmarks into game input (original rules):
 * arm landmarks, run intensity (shoulder bobbing), punch (fast wrist),
 * crouch (nose height with hysteresis), head yaw/pitch (Kalidokit face solver).
 */

import { mouthOpenness } from '../game/VoiceGate.js';
import { LegReader } from './LegReader.js';
import { HeadFromBody } from './HeadFromBody.js';

/**
 * The head tilted back: a real head goes back ~40–45° before the camera loses the
 * face — by then the eyes look straight up. So upward the game turns the view
 * further (up to ~88°: the sky right above), small nods stay as they are; down, a
 * little further too (to see one's own body).
 * Positive = up (rad).
 */
export function lookPitch(p) {
    // looking down: past a small nod a little further than the head (~12–16% more), so one
    // sees one's own body (the belt, the wand on it) without bending the neck too far
    if (p < -0.25) return Math.max(-1.45, p + (p + 0.25) * 0.25);
    if (!(p > 0.3)) return p;
    return Math.min(Math.PI / 2 - 0.03, p + (p - 0.3) * 2.2);
}

/**
 * Is this hand in its trouser pocket (as the camera sees it)? The wrist is at the
 * hip (the pocket's opening is about at the hip joint), the elbow is bent (a hand
 * hanging relaxed has a straight arm), and the hand is gone into the pocket (not
 * seen) or its fingers point down into it. Hands on the waist point their fingers
 * sideways; a hand reaching down to the ground goes far below the hip.
 * Measured in torso heights (shoulder → hip), so the distance to the camera
 * doesn't matter. true / false, or null when the hip or the shoulder isn't seen.
 */
export function pocketPose(lm, hand, side, aspect = 4 / 3, hipSide = side) {
    const [s, e, w] = side === 'left' ? [11, 13, 15] : [12, 14, 16];
    const h = hipSide === 'left' ? 23 : 24; // (the right hand can reach across to the LEFT pocket: the wand's)
    const sh = lm?.[s], el = lm?.[e], wr = lm?.[w], hip = lm?.[h];
    if (!sh || !el || !wr || !hip) return null;
    if ((hip.visibility ?? 1) < 0.5 || (sh.visibility ?? 1) < 0.5) return null;
    const T = hip.y - sh.y;
    if (T < 0.05) return null;
    const out = hipSide === 'left' ? 1 : -1; // (the person's left is the picture's right)
    const dy = (wr.y - hip.y) / T;
    const dxOut = ((wr.x - hip.x) * out * aspect) / T;
    // (the wrist in FRONT of the hip, where the pocket is — not beside the thigh, where a lowered
    // arm with a thing in the hand hangs: lowering a hand never puts what it holds away)
    if (dy < -0.3 || dy > 0.25 || dxOut < -0.25 || dxOut > 0.18) return false;
    // the elbow bent (the upper arm and the forearm in the picture)
    const ux = (el.x - sh.x) * aspect, uy = el.y - sh.y, fx = (wr.x - el.x) * aspect, fy = wr.y - el.y;
    const nu = Math.hypot(ux, uy), nf = Math.hypot(fx, fy);
    if (nu < 1e-4 || nf < 1e-4) return false;
    const bend = Math.acos(Math.max(-1, Math.min(1, (ux * fx + uy * fy) / (nu * nf))));
    if (bend < 0.5) return false; // (~30°: a straight or relaxed hanging arm — a hand going into a pocket bends the elbow)
    // the hand: gone into the pocket, or its fingers pointing down
    if (!hand || hand.length < 21) return true;
    const dxh = (hand[9].x - hand[0].x) * aspect, dyh = hand[9].y - hand[0].y;
    const len = Math.hypot(dxh, dyh);
    return len > 1e-4 && dyh / len > 0.8; // (within ~35° of straight down)
}

/**
 * Is this hand at the coin pouches' place — at its own hip, on the belt (CoinBelt.js)? As a
 * real camera sees a hand brought there: the wrist from the waist down to just under the
 * hip joint, beside the hip or a little in front of it (a low hand by the body is often
 * seen poorly: a weak wrist point still counts), and the elbow BENT. An arm hanging or
 * just lowered is straight — never this; a hand reaching across to the other side
 * (the wand's belt) is not at its own hip.
 */
/**
 * The REAL hand at the wand's place on the waistband (WandBelt.js), from the camera's
 * skeleton: the wrist at the waist (between the waist and the hip line), in front of the
 * body from just right of its middle to the person's left hip, the elbow bent (a lowered
 * or hanging arm is straight and its wrist is at or below the hips, beside the thigh).
 * Returns {at, near, dy, u, bend}: dy — the wrist below the hip line in torso heights
 * (negative: above), u — towards the person's left from the hips' middle; or null.
 */
export function beltPose(lm, side, aspect = 4 / 3) {
    const [s, e, w] = side === 'left' ? [11, 13, 15] : [12, 14, 16];
    const sh = lm?.[s], el = lm?.[e], wr = lm?.[w], lh = lm?.[23], rh = lm?.[24];
    if (!sh || !el || !wr || !lh || !rh) return null;
    if ((lh.visibility ?? 1) < 0.5 || (rh.visibility ?? 1) < 0.5 || (sh.visibility ?? 1) < 0.5) return null;
    const hx = (lh.x + rh.x) / 2, hy = (lh.y + rh.y) / 2;
    const T = hy - sh.y;
    if (T < 0.05) return null;
    const dy = (wr.y - hy) / T;
    const u = ((wr.x - hx) * aspect) / T; // (the person's left is the picture's right: +x)
    const ux = (el.x - sh.x) * aspect, uy = el.y - sh.y, fx = (wr.x - el.x) * aspect, fy = wr.y - el.y;
    const nu = Math.hypot(ux, uy), nf = Math.hypot(fx, fy);
    const bend = nu > 1e-4 && nf > 1e-4 ? Math.acos(Math.max(-1, Math.min(1, (ux * fx + uy * fy) / (nu * nf)))) : 0;
    const at = dy > -0.45 && dy < 0.1 && u > -0.15 && u < 0.21 && bend > 0.55; // (u ~0.25: the left hip, its trouser pocket)
    const near = dy > -0.6 && dy < 0.25 && u > -0.3 && u < 0.6 && bend > 0.35;
    return { at, near, dy, u, bend };
}

/**
 * Which of the body's own places a hand is at, as the camera sees it — ONE answer, so reaching
 * for the wand never takes a coin pouch (the places used to overlap: the pouches' zone began
 * just right of the belly's middle, where the right hand reaching for the wand is):
 *   'wand'  — in front of the belly (the wand's place: WandBelt), beltPose's zone;
 *   'purse' — the coin pouches' place: really at the right hip — at or outside the hip joint,
 *             never towards the middle (purseHand, and the wrist no further in than the hip);
 *   null    — neither, or a doubtful point between them (the nearest place must be clearly
 *             nearer: in doubt, nothing).
 * `side` is the hand; the right hand's own hip is its pouches'. Pure.
 */
export function bodyPlace(lm, side, aspect = 4 / 3) {
    const b = beltPose(lm, side, aspect);
    if (!b) return null;
    const sh = lm[side === 'left' ? 11 : 12], lh = lm[23], rh = lm[24];
    const T = (lh.y + rh.y) / 2 - sh.y;
    const hw = (Math.abs(lh.x - rh.x) * aspect) / (2 * T); // (the hip joints' half spread, torso heights)
    // (u: towards the person's left from the hips' middle — the right hip is at −hw)
    const purse = side === 'right' && purseHand(lm, 'right', aspect) === true && b.u <= -hw + 0.02;
    const wand = b.near;
    if (purse === wand) {
        if (!purse) return null;
        const dW = Math.abs(b.u - 0.03), dP = Math.abs(b.u + hw + 0.1); // (the wand's handle a little left of the middle; the pouches just outside the hip)
        if (Math.abs(dW - dP) < 0.08) return null;
        return dW < dP ? 'wand' : 'purse';
    }
    return purse ? 'purse' : 'wand';
}

/** The pose's points seen in a mirror (x → 1 − x, the left and the right points swapped): a left-hander as a right-hander. */
const MIRROR_PAIRS = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
export function mirrorPose(lm) {
    if (!lm) return lm;
    const out = lm.map((p) => (p ? { ...p, x: 1 - p.x } : p));
    for (const [a, b] of MIRROR_PAIRS) if (a < out.length && b < out.length) [out[a], out[b]] = [out[b], out[a]];
    return out;
}
const mirrorHand = (h) => (h ? h.map((p) => ({ ...p, x: 1 - p.x })) : h);

/**
 * The OTHER hand (a right-hander's left) reaching across the body to the leading hand's hip, where
 * the things' pocket and the coin pouches are (the author: a right-hander takes things out of the
 * right pocket with the LEFT hand; the right hand is for the wand). Read as a right-hander's (the
 * left hand at the right hip; a left-hander is read in a mirror). ONE answer, never both:
 *   'pocket' — in front of the hip: the wrist from just inside the hip joint to a little outside it
 *              (the pocket's opening), at the waist or a little lower; the hand gone in (not seen)
 *              or its fingers pointing down into it;
 *   'purse'  — further out, beside the hip (the pouches hang at the side, on the belt);
 *   false    — neither (the hand at its own side, hanging, in front of the belly, the gap between
 *              the two places); null — the hip or the shoulder not seen.
 * Both places are well outside the belly's middle, so a hand going to the wand never touches them.
 */
export const OFF_POCKET = [-0.12, 0.08]; // (the wrist outward of the hip joint, torso heights)
export const OFF_PURSE = [0.14, 0.6];
export function offHip(lm, hand, aspect = 4 / 3) {
    const sh = lm?.[11], el = lm?.[13], wr = lm?.[15], hip = lm?.[24];
    if (!sh || !el || !wr || !hip) return null;
    if ((hip.visibility ?? 1) < 0.5 || (sh.visibility ?? 1) < 0.5) return null;
    if ((wr.visibility ?? 1) < 0.3) return false;
    const T = hip.y - sh.y;
    if (T < 0.05) return null;
    const dy = (wr.y - hip.y) / T;
    const wOut = ((hip.x - wr.x) * aspect) / T; // (the right hip's outside is the picture's left)
    // the elbow bent (reaching across always bends it; a hanging arm is straight)
    const ux = (el.x - sh.x) * aspect, uy = el.y - sh.y, fx = (wr.x - el.x) * aspect, fy = wr.y - el.y;
    const nu = Math.hypot(ux, uy), nf = Math.hypot(fx, fy);
    if (nu < 1e-4 || nf < 1e-4) return false;
    if (Math.acos(Math.max(-1, Math.min(1, (ux * fx + uy * fy) / (nu * nf)))) < 0.45) return false;
    if (wOut >= OFF_POCKET[0] && wOut <= OFF_POCKET[1] && dy > -0.3 && dy < 0.25) {
        if (!hand || hand.length < 21) return 'pocket';
        const dxh = (hand[9].x - hand[0].x) * aspect, dyh = hand[9].y - hand[0].y;
        const len = Math.hypot(dxh, dyh);
        // (fingers down into it, within ~55°: reaching across, the hand comes in at a slant)
        return len > 1e-4 && dyh / len > 0.55 ? 'pocket' : false;
    }
    if (wOut >= OFF_PURSE[0] && wOut <= OFF_PURSE[1] && dy > -0.5 && dy < 0.2) return 'purse';
    return false;
}

/**
 * The body's own places for the hands (the camera's skeleton), for a right- or a left-hander.
 * A right-hander: the wand in front, a little to the left (the right hand takes it across), the
 * coin pouches and the things' pocket on the right — reached by the LEFT hand across the body.
 * A left-hander: all of it mirrored — read here by mirroring the picture and reading it as a
 * right-hander's.
 *   belt, place — by the REAL hand ({left, right}: beltPose, bodyPlace);
 *   pocket — {off}: the other hand in the things' pocket (offHip);
 *   purse — {off}: the other hand at the coin pouches (offHip).
 * The leading hand never takes from / puts into the pocket or the pouches (it is the wand's).
 */
export function bodyPlaces(lm, leftHand, rightHand, aspect = 4 / 3, leftHanded = false) {
    const L = leftHanded ? mirrorPose(lm) : lm;
    // (in the mirror the person's left hand is the "right" one)
    const ho = leftHanded ? mirrorHand(rightHand) : leftHand;
    const real = (o) => (leftHanded ? { left: o.right, right: o.left } : o);
    const belt = { left: beltPose(L, 'left', aspect), right: beltPose(L, 'right', aspect) };
    // which place each hand is at (the wand's in front, the pouches' at the leading hand's hip): one answer
    const place = { left: bodyPlace(L, 'left', aspect), right: bodyPlace(L, 'right', aspect) };
    const o = offHip(L, ho, aspect);
    const pocket = { off: o == null ? null : o === 'pocket' };
    const purse = { off: o == null ? null : o === 'purse' };
    return { belt: real(belt), place: real(place), pocket, purse };
}

export function purseHand(lm, side, aspect = 4 / 3, hipSide = side) {
    const [s, e, w] = side === 'left' ? [11, 13, 15] : [12, 14, 16];
    const h = hipSide === 'left' ? 23 : 24; // (the left hand can reach across to the RIGHT hip)
    const cross = hipSide !== side;
    const sh = lm?.[s], el = lm?.[e], wr = lm?.[w], hip = lm?.[h];
    if (!sh || !el || !wr || !hip) return null;
    if ((hip.visibility ?? 1) < 0.5 || (sh.visibility ?? 1) < 0.5 || (wr.visibility ?? 1) < 0.3) return null;
    const T = hip.y - sh.y;
    if (T < 0.05) return null;
    const out = hipSide === 'left' ? 1 : -1; // (the person's left is the picture's right)
    const outOf = (p) => ((p.x - hip.x) * out * aspect) / T;
    const dy = (wr.y - hip.y) / T;
    if (dy < -0.6 || dy > 0.25) return false; // (the belt: not the chest, not the thigh)
    const wOut = outOf(wr);
    if (wOut < -0.15 || wOut > (cross ? 0.4 : 0.8)) return false; // (at the hip: beside it or a little in front)
    if (!cross && outOf(el) < wOut - 0.05) return false; // (the elbow not tucked inside: a hand put on the hip)
    const ux = (el.x - sh.x) * aspect, uy = el.y - sh.y, fx = (wr.x - el.x) * aspect, fy = wr.y - el.y;
    const nu = Math.hypot(ux, uy), nf = Math.hypot(fx, fy);
    if (nu < 1e-4 || nf < 1e-4) return false;
    return Math.acos(Math.max(-1, Math.min(1, (ux * fx + uy * fy) / (nu * nf)))) > 0.45; // (~26°: bent)
}

/**
 * The hand brought to the mouth (eating): in the picture the hand covers the mouth —
 * the palm's middle (or, unseen, the wrist just under it) close to the mouth, the
 * elbow below. Sizes in shoulder widths, so near or far from the camera is the same.
 */
export function handAtMouth(lm, hand, side, aspect = 4 / 3) {
    const [e, w] = side === 'left' ? [13, 15] : [14, 16];
    const ls = lm?.[11], rs = lm?.[12], nose = lm?.[0], el = lm?.[e], wr = lm?.[w];
    if (!ls || !rs || !nose || !el || !wr) return null;
    if ((nose.visibility ?? 1) < 0.5) return null;
    const W = Math.abs(ls.x - rs.x) * aspect;
    if (W < 0.03) return null;
    const m9 = lm[9], m10 = lm[10];
    const mouth = m9 && m10 && (m9.visibility ?? 1) > 0.5 && (m10.visibility ?? 1) > 0.5
        ? { x: (m9.x + m10.x) / 2, y: (m9.y + m10.y) / 2 } : { x: nose.x, y: nose.y + 0.12 * W };
    if (el.y < wr.y) return false; // (the forearm goes up to the face)
    if (hand && hand.length >= 21) {
        const cx = (hand[0].x + hand[5].x + hand[9].x + hand[17].x) / 4, cy = (hand[0].y + hand[5].y + hand[9].y + hand[17].y) / 4;
        return Math.hypot((cx - mouth.x) * aspect, cy - mouth.y) / W < 0.45;
    }
    const dx = (wr.x - mouth.x) * aspect / W, dy = (wr.y - mouth.y) / W;
    return Math.abs(dx) < 0.35 && dy > -0.1 && dy < 0.7;
}

/**
 * A hand put on the body, as the picture shows it (armour put on by hand — Armor.js): on the head
 * (the wrist at the face or above it, over the head), on the chest (between the shoulders, on the
 * upper half of the body), at the knee (reached down well below the hips — a hand hanging at the
 * side is not). → {head, chest, knee} | null (the body not seen).
 */
export function bodyTouch(lm, side, aspect = 4 / 3) {
    const w = side === 'left' ? 15 : 16;
    const ls = lm?.[11], rs = lm?.[12], nose = lm?.[0], wr = lm?.[w], lh = lm?.[23], rh = lm?.[24];
    if (!ls || !rs || !nose || !wr || (wr.visibility ?? 1) < 0.4) return null;
    const W = Math.abs(ls.x - rs.x) * aspect;
    if (W < 0.03) return null;
    const sy = (ls.y + rs.y) / 2, mx = (ls.x + rs.x) / 2;
    const T = lh && rh && (lh.visibility ?? 1) > 0.3 && (rh.visibility ?? 1) > 0.3 ? Math.max(0.5 * W, (lh.y + rh.y) / 2 - sy) : 1.3 * W; // (the torso's length)
    const hy = sy + T;
    const hx = (wr.x - nose.x) * aspect / W, hdy = (wr.y - nose.y) / W;
    const cx = (wr.x - mx) * aspect / W, cdy = (wr.y - sy) / T;
    return {
        head: Math.abs(hx) < 0.75 && hdy > -1.1 && hdy < 0.4, // (from the chin up)
        chest: Math.abs(cx) < 0.5 && cdy > 0.08 && cdy < 0.65,
        knee: wr.y > hy + 0.45 * T,
    };
}

export class PoseInterpreter {
    /**
     * @param {object} [faceSolver] Kalidokit.Face (optional; head rotation)
     */
    constructor(faceSolver = null) {
        this.faceSolver = faceSolver;
        this.shoulderHistory = [];
        this.prevWrists = null;
        this.wasCrouching = false;
        this.lastHead = { yaw: 0, pitch: 0 };
        // the head's turn: still → small jitter smoothed away; a real turn passes at once
        this.headFilter = { yaw: new OneEuro(0.2, 0.5), pitch: new OneEuro(0.2, 0.5) };
        this.headBody = new HeadFromBody(); // (no face found — farther from the camera: the nose and the ears)
        this.leftHanded = false; // (Настройки: Левша — the body's places mirrored: bodyPlaces)
        // «Earthquake» stomp: a knee lifted, then put down hard
        this.legs = { left: { liftedAt: 0 }, right: { liftedAt: 0 } };
        this.stompAt = 0;
        this.legsSeenAt = 0;
        this.legReader = new LegReader(); // (the surfboard: getting on, paddling with a leg)
    }

    /**
     * Knee lift and stomp. Image y grows downwards; a standing knee is about half
     * a torso below the hip, a lifted knee comes up to the hip's height.
     */
    _legs(lm, data, now = performance.now()) {
        const torso = Math.abs((lm[23].y + lm[24].y) / 2 - (lm[11].y + lm[12].y) / 2) || 0.3;
        for (const [side, hip, knee] of [['left', 23, 25], ['right', 24, 26]]) {
            const k = lm[knee], h = lm[hip];
            if ((k.visibility ?? 1) < 0.5 || (h.visibility ?? 1) < 0.5) continue;
            this.legsSeenAt = now;
            const below = (k.y - h.y) / torso; // ~0.5 standing, ~0 knee up
            const leg = this.legs[side];
            if (below < 0.28) leg.liftedAt = now;
            else if (below > 0.42 && leg.liftedAt && now - leg.liftedAt < 1500) {
                this.stompAt = now; // put down after a lift
                leg.liftedAt = 0;
            }
            data[side + 'KneeUp'] = below < 0.28;
        }
    }

    /**
     * How far each arm is lifted, from the camera picture itself: 0 = hanging,
     * ~0.13 = lifted ~30°, 1 = at shoulder height, more = above (1 - cos of the
     * angle from hanging). The wrist's drop below the shoulder is compared with the
     * whole arm's length (shoulder → elbow → wrist), both in shoulder widths (the
     * same at any distance from the camera). The arm's length is this person's own,
     * learned as they play: the longest the arm has looked lately — and it looks
     * whole both hanging and lifted sideways, so holding an arm up doesn't unlearn it.
     * (The 3D arm can't tell: its tilt towards the camera is guessed from how short
     * the arm looks, so a player standing further away seems to hold the arms forward.)
     */
    _armLift(lm) {
        const sw = Math.hypot(lm[11].x - lm[12].x, lm[11].y - lm[12].y);
        if (sw < 0.02) return null;
        const t = performance.now() / 1000;
        const dt = Math.min(1, Math.max(0, t - (this._liftT || t)));
        this._liftT = t;
        const L = this._armLen || (this._armLen = { left: 0, right: 0, full: 1.5 });
        const seg = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y) / sw;
        let longest = 0;
        for (const [side, s, e, w] of [['left', 11, 13, 15], ['right', 12, 14, 16]]) {
            if ((lm[w].visibility ?? 1) < 0.3 || (lm[e].visibility ?? 1) < 0.3) continue;
            // smoothed (~0.3 s): one jumpy picture doesn't stretch the arm
            const len = seg(s, e) + seg(e, w);
            L[side] = L[side] ? L[side] + (len - L[side]) * Math.min(1, dt / 0.3) : len;
            longest = Math.max(longest, L[side]);
        }
        // the whole arm: the longest seen lately (forgotten slowly — a new player, another camera)
        L.full = Math.max(1.1, longest, L.full - 0.01 * dt);
        const out = {};
        for (const [side, s, w] of [['left', 11, 15], ['right', 12, 16]]) {
            if ((lm[w].visibility ?? 1) < 0.3) { out[side] = 0; continue; } // (below the picture: hanging)
            out[side] = 1 - (lm[w].y - lm[s].y) / sw / L.full;
        }
        return out;
    }

    /**
     * @param {object} results  {poseLandmarks, faceLandmarks, leftHandLandmarks, rightHandLandmarks}
     * @param {HTMLVideoElement|object} video  for face solver aspect ratio
     */
    process(results, video) {
        const data = {
            headRotation: { yaw: this.lastHead.yaw, pitch: this.lastHead.pitch },
            bodyRotation: 0,
            leftShoulder: null, leftElbow: null, leftWrist: null,
            rightShoulder: null, rightElbow: null, rightWrist: null,
            leftHandLandmarks: null, rightHandLandmarks: null,
            nose: null,
            isRunning: false,
            runIntensity: 0,
            isCrouching: this.wasCrouching,
            isPunching: false,
            punchingHand: null,
            hasPose: false,
        };
        // the picture's shape (a hand's turn and a pocket are measured in it)
        if (video && video.videoWidth > 0 && video.videoHeight > 0) data.aspect = video.videoWidth / video.videoHeight;
        const lm = results.poseLandmarks;
        if (lm && lm.length >= 33) {
            data.hasPose = true;
            const P = (i) => ({ x: lm[i].x, y: lm[i].y, z: lm[i].z || 0 });
            data.leftShoulder = P(11); data.leftElbow = P(13); data.leftWrist = P(15);
            data.rightShoulder = P(12); data.rightElbow = P(14); data.rightWrist = P(16);
            data.nose = P(0);
            data.mouth = { x: (lm[9].x + lm[10].x) / 2, y: (lm[9].y + lm[10].y) / 2, z: 0 }; // (a bow's anchor is just under it)
            data.armLift = this._armLift(lm);
            // the body's own places (the wand's belt, the pouches, the pockets) — mirrored for a left-hander
            Object.assign(data, bodyPlaces(lm, results.leftHandLandmarks, results.rightHandLandmarks, data.aspect, this.leftHanded));
            data.mouthHand = { left: handAtMouth(lm, results.leftHandLandmarks, 'left', data.aspect), right: handAtMouth(lm, results.rightHandLandmarks, 'right', data.aspect) };
            data.bodyTouch = { left: bodyTouch(lm, 'left', data.aspect), right: bodyTouch(lm, 'right', data.aspect) }; // (armour put on by hand: Armor.js)

            const zDiff = (lm[11].z || 0) - (lm[12].z || 0);
            data.bodyRotation = Math.max(-1, Math.min(1, zDiff * 5));
            data.torso = torsoMetrics(lm);

            // Run intensity from shoulder bobbing (8-frame window)
            this.shoulderHistory.push((lm[11].y + lm[12].y) / 2);
            if (this.shoulderHistory.length > 8) this.shoulderHistory.shift();
            if (this.shoulderHistory.length >= 3) {
                let total = 0;
                for (let i = 1; i < this.shoulderHistory.length; i++) total += Math.abs(this.shoulderHistory[i] - this.shoulderHistory[i - 1]);
                data.runIntensity = Math.max(0, Math.min(1, (total - 0.02) / 0.13));
                data.isRunning = data.runIntensity > 0.1;
            }

            // Punch: wrist moved fast since last frame
            if (!this.prevWrists) this.prevWrists = { left: { ...data.leftWrist }, right: { ...data.rightWrist } };
            const leftDist = Math.hypot(data.leftWrist.x - this.prevWrists.left.x, data.leftWrist.y - this.prevWrists.left.y);
            const rightDist = Math.hypot(data.rightWrist.x - this.prevWrists.right.x, data.rightWrist.y - this.prevWrists.right.y);
            this.prevWrists = { left: { ...data.leftWrist }, right: { ...data.rightWrist } };
            const punchThreshold = 0.08;
            data.isPunching = leftDist > punchThreshold || rightDist > punchThreshold;
            data.punchingHand = leftDist > rightDist ? 'left' : 'right';

            this._legs(lm, data);
            data.legs = this.legReader.read(lm);

            // Crouch with hysteresis
            const noseY = data.nose.y;
            if (!this.wasCrouching) { if (noseY > 0.5) this.wasCrouching = true; }
            else if (noseY < 0.45) this.wasCrouching = false;
            data.isCrouching = this.wasCrouching;
        }

        data.stompAt = this.stompAt;
        data.legsSeenAt = this.legsSeenAt;
        if (results.rightHandLandmarks) data.rightHandLandmarks = results.rightHandLandmarks;
        if (results.leftHandLandmarks) data.leftHandLandmarks = results.leftHandLandmarks;

        // the mouth (is it me who speaks? — VoiceGate)
        data.mouth = mouthOpenness(results.faceLandmarks);
        const body = data.hasPose ? this.headBody.read(lm, data.aspect || 4 / 3) : null;
        let head = null;
        if (results.faceLandmarks && this.faceSolver) {
            try {
                const faceRig = this.faceSolver.solve(results.faceLandmarks, { runtime: 'mediapipe', video, smooth: true });
                if (faceRig && faceRig.head && Number.isFinite(faceRig.head.y) && Number.isFinite(faceRig.head.x)) {
                    head = { yaw: -faceRig.head.y, pitch: faceRig.head.x };
                    this.headBody.learn(body, head.yaw, head.pitch); // (how the nose and the ears map onto it, for later)
                }
            } catch (e) {
                // A broken face frame must never stop the game
            }
        }
        // the face is too small for the face net (a step farther from the camera): the body's nose and ears
        if (!head && body) {
            const t = performance.now() / 1000;
            head = this.headBody.estimate(body, this._headT ? Math.min(0.5, t - this._headT) : 1 / 20);
        }
        if (head) {
            const t = performance.now() / 1000;
            this._headT = t;
            this.lastHead.yaw = this.headFilter.yaw.filter(head.yaw, t);
            this.lastHead.pitch = this.headFilter.pitch.filter(head.pitch, t);
            data.headRotation.yaw = this.lastHead.yaw;
            data.headRotation.pitch = this.lastHead.pitch;
        }
        return data;
    }
}

/**
 * Raw torso measurements used to steer flight (the body is the steering
 * wheel). Values are relative; the flight controller calibrates a neutral
 * pose at take-off and works with the differences.
 *   lateral  — sideways lean (shoulder centre vs hip centre, or shoulder roll
 *              when the hips are out of the camera), + = leaning to the
 *              person's LEFT
 *   depth    — shoulders' depth relative to the hips (smaller = leaning
 *              forward towards the camera); null without hips
 *   noseRel  — nose height above the shoulder line / shoulder width
 *              (drops when leaning forward or looking down)
 */
export function torsoMetrics(lm) {
    const ls = lm[11], rs = lm[12], lh = lm[23], rh = lm[24], nose = lm[0];
    const sw = Math.max(0.05, Math.abs(ls.x - rs.x));
    const sMidX = (ls.x + rs.x) / 2, sMidY = (ls.y + rs.y) / 2, sMidZ = ((ls.z || 0) + (rs.z || 0)) / 2;
    const hipsOk = lh && rh && (lh.visibility ?? 1) > 0.5 && (rh.visibility ?? 1) > 0.5 && lh.y > sMidY;
    let lateral, depth = null;
    if (hipsOk) {
        const hMidX = (lh.x + rh.x) / 2, hMidZ = ((lh.z || 0) + (rh.z || 0)) / 2;
        // Image is not mirrored: the person's left is the image right.
        lateral = (sMidX - hMidX) / sw;
        depth = sMidZ - hMidZ;
    } else {
        // Shoulder roll: leaning left drops the person's left shoulder (lm 11)
        lateral = (ls.y - rs.y) / sw;
    }
    return { lateral, depth, noseRel: (sMidY - nose.y) / sw, hips: !!hipsOk };
}

/**
 * The 1€ filter (Casiez, Roussel, Vogel 2012): smoothing that adapts to speed —
 * strong while the value barely moves (kills jitter), weak while it moves fast
 * (no lag on a real movement).
 */
export class OneEuro {
    constructor(minCutoff = 1, beta = 0.5, dCutoff = 1) {
        this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
        this.x = null; this.dx = 0; this.t = 0;
    }

    filter(v, t) {
        if (this.x === null || !Number.isFinite(this.x)) { this.x = v; this.t = t; return v; }
        const dt = Math.max(1e-3, t - this.t);
        this.t = t;
        const a = (cutoff) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
        const dv = (v - this.x) / dt;
        this.dx += a(this.dCutoff) * (dv - this.dx);
        const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
        this.x += a(cutoff) * (v - this.x);
        return this.x;
    }
}
