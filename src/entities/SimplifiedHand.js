/**
 * SimplifiedHand.js — "V3 (Стабильная)" voxel hand.
 *
 * The model, proportions, finger analysis and animation are the author's
 * original Version 20 ("Organic Freedom") code, ported 1:1 so the hands look
 * and move exactly as before. Added on top (all opt-in, no visual change):
 *   - wrist-twist flip guard (atan2 wrap-around glitches are ignored unless they persist)
 *   - grip override: fingers wrap a held handle instead of passing through it
 *   - serializeState()/applyState() for multiplayer avatars
 *   - allocation-free history averaging
 *   - the wrist turn is only trusted when the knuckles are seen well (an
 *     edge-on hand doesn't flip the model over)
 */

import * as THREE from 'three';
import { lerpAngle } from '../core/math.js';
import { handFrame, fingerJoints } from './HandPose.js';

/**
 * How far the wrist is bent to the little finger's side (+) or the thumb's (−), rad, from
 * the picture: bending it carries the knuckles along the knuckle line (index → little
 * finger) away from the wrist, whichever way the hand is turned, and seen from any side
 * (with the arm pointing at the camera too); the palm's length is ~1.1 knuckle widths.
 * null: the knuckle line is not seen well enough.
 */
export function wristBend(lm, aspect = 1) {
    const w = lm[0], i = lm[5], m = lm[9], p = lm[17];
    const ux = (p.x - i.x) * aspect, uy = p.y - i.y;
    const span = Math.hypot(ux, uy);
    if (span < 0.012) return null;
    const hx = (m.x - w.x) * aspect, hy = m.y - w.y;
    // (the knuckle line slants: the little finger's knuckle is nearer the wrist — a straight
    // wrist still shows the knuckles ~0.18 of the hand's length towards the index side)
    const along = (hx * ux + hy * uy) / span + 0.18 * Math.hypot(hx, hy);
    return Math.asin(Math.max(-1, Math.min(1, along / (1.1 * span))));
}
/** A hand on a blade: the bend read from the picture is shown this much stronger (the camera
 * sees a fist's bend short), up to these limits (to the little finger's side / to the thumb's). */
export const BLADE_BEND_GAIN = 1.6, BLADE_BEND_ULNAR = 1.25, BLADE_BEND_RADIAL = 0.45;

/** The fingers bend at most this far from the forearm at the wrist (a real wrist's range). */
const MAX_WRIST_BEND = 1.4; // rad (~80°)
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3(), _vz = new THREE.Vector3(0, 0, 1);
const JOINT_FINGERS = ['index', 'middle', 'ring', 'pinky'];

/**
 * A wand held like a pen (the palm's own joint angles): the thumb's pad and the
 * index's pad on either side of the wand, the middle finger under it, the ring and
 * little fingers tucked in; the wand's back rests in the web of the thumb.
 * Fingers: [knuckle, middle, end, aside]; thumb: [base turn x, y, z, middle, end].
 */
export const PEN_GRIP = {
    index: [0.2, 0.69, 0.6, -0.25],
    middle: [0.34, 0.9, 0.56, -0.14],
    ring: [0.95, 1.25, 0.8, 0],
    pinky: [1.05, 1.25, 0.8, 0],
    thumb: [0.14, -1.5, 0.51, -0.1, -0.2],
};
/**
 * A handshake: the fingers wrapped round the other hand's palm (knuckles bent, the
 * middle joints round its edge), the thumb lying across the back of it.
 */
export const SHAKE_GRIP = {
    index: [0.85, 0.95, 0.45, 0.06],
    middle: [0.9, 1.0, 0.45, 0],
    ring: [0.95, 1.0, 0.45, -0.05],
    pinky: [1.0, 0.95, 0.45, -0.1],
    thumb: [0.05, -0.55, 0.95, 0.15, 0.1],
};
/**
 * The same grip pointing (as one points a wand or a brush): the index finger nearly
 * straight along the wand, the thumb's pad pressing it against the index's middle
 * bone. The hand shows a grip between the two (`penT`: 0 pointing … 1 writing; the
 * wand 5° … 30° off the palm's line towards the palm).
 */
export const PEN_POINT_GRIP = {
    index: [0, 0.7, 0.24, -0.3],
    middle: PEN_GRIP.middle,
    ring: PEN_GRIP.ring,
    pinky: PEN_GRIP.pinky,
    thumb: [-0.05, -1.43, 0.17, -0.03, -0.39],
};
/**
 * How the fingers lie round each kind of thing held (the palm's own joint angles, fitted so the
 * middle and end bones of every finger touch the thing and none goes into it — the shapes they
 * were fitted to: GRIP_SHAPES).
 */
export const GRIP_POSES = {
    pen: PEN_GRIP,
    shake: SHAKE_GRIP,
    power: { index: [1.1, 1.3, 0, -0.05], middle: [1.2, 1.45, 0, 0], ring: [1.15, 1.2, 0, 0.05], pinky: [0.6, 1.35, 0, 0.12], thumb: [-0.6, -0.8, 0.6, 0, -0.6] },
    thick: { index: [0.9, 1.3, 0, -0.05], middle: [1.05, 1.4, 0, 0], ring: [1.1, 1, 0, 0.05], pinky: [0.6, 1.15, 0, 0.12], thumb: [-0.6, 0, 0.4, -0.6, 0.8] },
    thin: { index: [0.95, 1.75, 0, -0.05], middle: [1.35, 1.55, 0.1, 0], ring: [1.05, 1.6, 0, 0.05], pinky: [0.6, 1.6, 0, 0.12], thumb: [-0.6, -0.6, -0.2, 1, -0.6] },
    neck: { index: [0.8, 1.3, 0, -0.05], middle: [1.15, 1.1, 0, 0], ring: [0.85, 1.2, 0, 0.05], pinky: [0.6, 1, 0, 0.12], thumb: [-0.6, -1.8, 0.6, 0, 1] },
    roll: { index: [0.6, 1.25, 0, -0.05], middle: [0.75, 1.35, 0, 0], ring: [0.85, 0.85, 0, 0.05], pinky: [0.6, 0.65, 0, 0.12], thumb: [-0.6, -1.8, -0.2, 1, -0.6] },
    ball: { index: [0.3, 1.05, 0, -0.12], middle: [0.55, 0.8, 0, -0.02], ring: [0.4, 0.85, 0, 0.08], pinky: [0.55, 0.5, 0, 0.18], thumb: [-0.6, -1.8, -0.2, 0, -0.6] },
    wool: { index: [0.25, 0.7, 0, -0.15], middle: [0.2, 0.9, 0, -0.03], ring: [0.4, 0.4, 0, 0.1], pinky: [0.4, 0.35, 0, 0.22], thumb: [-0.6, -1.4, 0.8, 0, -0.6] },
    block: { index: [0.25, 1.4, 0, -0.05], middle: [0.6, 1.15, 0.1, 0], ring: [0.45, 1.15, 0, 0.05], pinky: [-0.2, 1.25, 0.2, 0.12], thumb: [-0.6, -1.2, 0.6, 0.6, 0.4] },
    hook: { index: [-0.15, 1.3, 0, -0.05], middle: [-0.1, 1.6, 0.1, 0], ring: [0.05, 1, 0.2, 0.05], pinky: [0.3, 0.1, 0.1, 0.12], thumb: [-0.4, -1, -0.2, -0.2, 0.4] },
};
/**
 * What each grip closes round, in the palm's frame (y towards the fingers, z out of the back of
 * the hand; the palm's face at z −0.07): a cylinder across the palm (along x) at (y, z) of radius
 * r, or a ball. Where the held thing's handle / body goes.
 */
export const GRIP_SHAPES = {
    power: { y: 0.13, z: -0.135, r: 0.065 },
    thick: { y: 0.13, z: -0.155, r: 0.085 },
    thin: { y: 0.13, z: -0.115, r: 0.045 },
    neck: { y: 0.13, z: -0.17, r: 0.1 },
    roll: { y: 0.15, z: -0.19, r: 0.12 },
    ball: { y: 0.2, z: -0.268, r: 0.198, ball: true },
    wool: { y: 0.22, z: -0.37, r: 0.3, ball: true },
    block: { y: 0.17, z: -0.214, r: 0.14 },
    hook: { y: 0.34, z: -0.145, r: 0.035 }, // (a strap / a loop hanging in the bent fingers)
};
/** Where the pen grip touches the wand: the web (palm frame), the index's and the thumb's pads (on their end bones); indexMid: the index's middle bone (pointing). */
export const PEN_POINTS = { web: [-0.17, 0.17, -0.04], index: [0, 0.049, -0.038], indexMid: [0, 0.06, -0.04], thumb: [0, 0.104, -0.045] };
/** The wand's line off the palm's line towards the palm (rad): pointing, writing. */
export const PEN_TILT = [0.09, 0.52];
/** The steady grip: between pointing and writing — the wand ~16° off the palm's line (30° pointed it down). */
export const PEN_T_STEADY = 0.45;

/**
 * A book (or any flat thing) held by its edge, like in life: the edge deep in the web
 * between the thumb and the index finger, the palm and the fingers flat on one side,
 * the thumb on the other. The fingers don't take a fixed shape: each one closes from
 * `open` towards `closed` only until it touches the thing (fitGrip) — it lies on it.
 * The thumb, when it can't come round to the other side, lies back along the hand.
 * Same joints as PEN_GRIP.
 */
export const BOOK_GRIP = {
    open: { index: [0, 0, 0, 0], middle: [0, 0, 0, 0], ring: [0, 0, 0, 0.04], pinky: [0, 0, 0, 0.08], thumb: [0.24, -1.38, 1.57, 0, 0] },
    closed: { index: [1.2, 1.2, 0.9, 0], middle: [1.2, 1.2, 0.9, 0], ring: [1.2, 1.2, 0.9, 0.04], pinky: [1.2, 1.2, 0.9, 0.08], thumb: [0.24, -1.38, 1.57, 1.5, 1.2] },
    // where the thumb goes when it can't come round: back along the hand, across the palm, tucked behind the index
    back: { thumb: [[0.09, 0.03, 0.34, 0.1, 0.1], [-0.21, 0.27, -0.9, 0.1, 0.1], [-2.85, 0.03, -3.05, 0.1, 0.1]] },
};
/**
 * The V5 wand grip, held like a pen (the author's own grip): the wand's back in the web between the
 * thumb and the index finger, the wand going on along the index finger; the thumb lies along it, the
 * fingers close round it from outside. Each finger closes from `open` towards `closed` only until it
 * touches the wand as thick as it really is (fitGrip with the wand's cylinder) — never into it.
 */
export const WAND_GRIP = {
    open: { index: [0, 0.1, 0.1, -0.05], middle: [0.1, 0.2, 0.1, 0], ring: [0.3, 0.4, 0.3, 0.04], pinky: [0.3, 0.4, 0.3, 0.08], thumb: [-0.69, 2.14, 0.17, 0.31, 0.58] },
    closed: { index: [1.4, 1.5, 1.1, -0.1], middle: [1.5, 1.6, 1.1, -0.05], ring: [1.5, 1.6, 1.1, 0], pinky: [1.5, 1.6, 1.1, 0.05], thumb: [-1.82, 2.55, 1.2, 1.22, 0.55] },
};
/**
 * Where the V5 wand lies in the palm's frame (right hand; a left one is its mirror; y towards the
 * fingers, z out of the back of the hand, the palm's face at z −0.07): across the palm aslant, from
 * the heel on the little finger's side out between the thumb and the index finger — the fingers
 * close round it from outside, the thumb lies along it. Its axis passes `at` (x, y; z: just in front
 * of the palm's face, as far as the wand is thick), going `dir`.
 */
/**
 * How thick a long thing is along its own y (a wand): [{y0, y1, r}] in the world's units (its scale
 * taken in) — every part's box, so a ring or a knob counts. For the grip to close on it as it is.
 */
export function lengthProfile(model) {
    model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const s = model.scale.x || 1;
    const out = [];
    const m = new THREE.Matrix4(), box = new THREE.Box3();
    model.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
        const r = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
        out.push({ y0: box.min.y * s, y1: box.max.y * s, r: r * s });
    });
    return out;
}

export const WAND_LINE = { at: [0, 0.2], gap: 0.008, dir: [-0.55, 0.8, 0] };
/**
 * The wrist bent to the little finger's side holding the V5 wand (rad): as a real hand pointing a wand held aslant across
 * the palm — the wand then goes where the hand and the forearm point (tools/handbench/pointbench.mjs: without it the aim was
 * the grip's 34.5° off towards the thumb, «не указывает туда, куда нужно»). The fingers keep their grip: the whole palm turns.
 */
export const WAND_BEND = Math.atan2(-WAND_LINE.dir[0], WAND_LINE.dir[1]);

/** In the palm's frame (right hand; a left one is its mirror): where a held edge lies — x of the web, the palm's face. */
export const BOOK_POINTS = { edgeX: -0.12, edgeY: 0.05, face: -0.075 };

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/**
 * A speed-adaptive easing (One-Euro-like) for the drawn hand: the speed above the
 * camera's own jitter (its floor: dropping at once, rising over `floorT` s) opens it —
 * a real move passes at once, a still hand's tremble is smoothed away.
 */
export class Steady {
    constructor({ minCutoff = 0.8, beta = 6, dCutoff = 5, floorK = 2, floorT = 2 } = {}) {
        Object.assign(this, { minCutoff, beta, dCutoff, floorK, floorT });
        this.speed = 0; this.floor = null;
    }

    static a(cutoff, dt) { return 1 / (1 + 1 / (2 * Math.PI * cutoff * dt)); }

    /** The easing (0…1) for this drawn frame; `seen`: how fast it moves (per second). */
    alpha(seen, dt) {
        if (!(dt > 0)) return 1;
        if (this.floor == null) this.floor = seen;
        this.floor += (seen < this.floor ? 0.3 : Math.min(1, dt / this.floorT)) * (seen - this.floor);
        const raw = Math.max(0, seen - this.floorK * this.floor);
        this.speed += Steady.a(this.dCutoff, dt) * (raw - this.speed);
        return Steady.a(this.minCutoff + this.beta * this.speed, dt);
    }
}

export class SimplifiedHand {
    constructor(side = 'right') {
        this.side = side;
        this.group = new THREE.Group();

        this.skinColor = 0xDCAE82;
        this.material = new THREE.MeshLambertMaterial({ color: this.skinColor });

        this.PALM_W = 0.28;
        this.PALM_H = 0.45;
        this.PALM_D = 0.14;

        // The landmarks come 1€-filtered (TrackingGuard, the whole hand at once) and
        // blended between camera pictures (PoseSmoother): any average or easing on top
        // only made the hand lag (it took ~10 drawn frames to follow a turn of the wrist)
        this.HISTORY_LENGTH = 2; // (V4: 1)
        this.landmarkHistory = [];
        this._historyPool = [];
        this._avg = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));

        this.lastTrackingTime = 0;
        this.PERSISTENCE_DURATION = 2000;
        this.isHoldingPose = false;

        this.fingerMeshes = {};
        this.createModel();

        this.currentState = {
            fingers: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
            fingerSpread: 0,
            thumbSpread: 0,
            wristTwist: 0, wristTilt: 0, wristRoll: 0,
        };
        this.targetState = JSON.parse(JSON.stringify(this.currentState));

        // easing per drawn frame: only for the hands of other players (their network
        // snapshots come in steps); our own hand follows the camera's directly (FOLLOW)
        this.LERP_SPEED = 0.5;
        this.ROT_LERP_SPEED = 0.45;
        this.FOLLOW = 1;
        // the network lost the hand for a moment: meanwhile the hand stays as it was ON THE
        // FOREARM (it moves with the arm, not frozen in the air); when it is seen again it
        // glides into the new pose over REACQUIRE_MS instead of jumping there
        this.REACQUIRE_GAP = 120; // ms without the hand
        this.REACQUIRE_MS = 220;
        this.REACQUIRE_K = 0.3; // per drawn frame
        this._reacq = null;
        this._k = this.LERP_SPEED;
        this._kr = this.ROT_LERP_SPEED;

        // Safeguards
        this._pendingTwist = null;
        this._pendingTwistFrames = 0;
        this.gripOverride = null; // {curl, thumb} when holding a handle

        // The whole hand as the camera sees it (HandPose.js): the palm's full turn and every
        // finger joint. `body` — the hero (its space), `aspect` — the picture's width/height.
        this.body = null;
        this.aspect = 4 / 3;
        this.fullPose = false; // (V3 by default; setMode('full') — V4)
        this.mode = 'stable';
        this._frame = null; // {X, Y, Z} the hand in the hero's space (from the points)
        this._jointsT = null; // target joint angles; _jointsC: current (smoothed)
        this._jointsC = null;
        this._pend = null; // a sudden turn-over waiting to be confirmed
        this._pendN = 0;
        this.netPalm = null; // (remote avatars) the palm's turn sent over the network
        // the pen grip between pointing and writing (0 … 1): steady, or as a real stick seen
        // in the hand lies (stickTilt: its line off the palm's, rad — set by the game)
        this.penT = PEN_T_STEADY;
        this.stickTilt = null;
        this._penPose = { index: [0, 0, 0, 0], middle: PEN_GRIP.middle, ring: PEN_GRIP.ring, pinky: PEN_GRIP.pinky, thumb: [0, 0, 0, 0, 0] };

        this.group.traverse((obj) => { if (obj.isMesh) obj.frustumCulled = false; });
    }

    createModel() {
        this.handPivot = new THREE.Group();
        this.group.add(this.handPivot);

        this.palm = new THREE.Mesh(new THREE.BoxGeometry(this.PALM_W, this.PALM_H, this.PALM_D), this.material);
        this.palm.position.y = this.PALM_H / 2;
        this.palm.name = 'palm';
        this.handPivot.add(this.palm);
        // a softer shape: the knuckle ridge and the heel of the hand
        this.knuckleMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(this.skinColor).multiplyScalar(0.9) });
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(this.PALM_W * 0.96, 0.06, this.PALM_D * 1.12), this.knuckleMat);
        ridge.position.y = this.PALM_H / 2 - 0.03;
        this.palm.add(ridge);
        const heel = new THREE.Mesh(new THREE.BoxGeometry(this.PALM_W * 0.8, 0.1, this.PALM_D * 1.08), this.material);
        heel.position.y = -this.PALM_H / 2 + 0.06;
        this.palm.add(heel);

        this.handPivot.rotation.x = Math.PI / 2;
        this.handPivot.rotation.y = 0;

        const fingerConfigs = {
            thumb: { x: -0.14, y: 0.10, z: 0.06, len: 0.52, w: 0.10, isThumb: true },
            index: { x: -0.09, y: 0.45, z: 0, len: 0.42, w: 0.08 },
            middle: { x: 0.00, y: 0.48, z: 0, len: 0.48, w: 0.08 },
            ring: { x: 0.09, y: 0.45, z: 0, len: 0.40, w: 0.075 },
            pinky: { x: 0.13, y: 0.40, z: 0, len: 0.32, w: 0.07 },
        };
        for (const [name, cfg] of Object.entries(fingerConfigs)) {
            const segments = this.createFinger(cfg);
            this.fingerMeshes[name] = segments;
            this.palm.add(segments[0].pivot);
        }
        if (this.side === 'left') this.group.scale.set(-1, 1, 1);
    }

    /** The skin colour of the hand (from the hero's look). */
    setSkin(color) {
        this.material.color.setHex(color);
        this.knuckleMat?.color.setHex(color).multiplyScalar(0.9);
    }

    createFinger(cfg) {
        const segments = [];
        const segLen = cfg.len / 3;
        let lastParent = null;
        if (!this.nailMat) this.nailMat = new THREE.MeshLambertMaterial({ color: 0xf6d9d0 });
        for (let i = 0; i < 3; i++) {
            const pivot = new THREE.Group();
            // fingers get a little thinner towards the tip; a nail on the last bone
            const w = cfg.w * (1 - 0.1 * i);
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, segLen * 0.96, w * 0.95), this.material);
            mesh.position.y = segLen / 2;
            pivot.add(mesh);
            if (i === 2) {
                const nail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, segLen * 0.45, 0.012), this.nailMat);
                nail.position.set(0, segLen * 0.7, w * 0.48); // (on the back: the fingers bend towards −z, the palm)
                pivot.add(nail);
            }
            if (i === 0) {
                pivot.position.set(cfg.x, cfg.y - this.PALM_H / 2, cfg.z);
                if (cfg.isThumb) {
                    pivot.rotation.z = 0.8;
                    pivot.rotation.x = 0.3;
                    pivot.rotation.y = -0.4;
                }
            } else {
                pivot.position.y = segLen;
            }
            segments.push({ pivot, mesh });
            if (lastParent) lastParent.add(pivot);
            lastParent = pivot;
        }
        return segments;
    }

    lerpAngle(current, target, step) {
        return lerpAngle(current, target, step);
    }

    /**
     * @param {Array|null} landmarks  21 MediaPipe hand landmarks (already validated) or null
     * @param {number} bodyRotation  unused by the model, kept for API compatibility
     * @param {number} [now]  ms timestamp (defaults to Date.now())
     */
    update(landmarks, bodyRotation = 0, now = Date.now()) {
        const timeGap = now - this.lastTrackingTime;

        this._dt = this._now ? Math.max(0.001, Math.min(0.1, (now - this._now) / 1000)) : 1 / 60;
        this._now = now;
        this._lost = !(landmarks && landmarks.length >= 21);
        if (!this._lost) {
            // back after the network lost it: glide into the new pose (no jump)
            if (this.lastTrackingTime && timeGap > this.REACQUIRE_GAP) { this._reacq = now; this._qShown = null; this._pendN = 0; }
            if (timeGap > 300 && this.landmarkHistory.length > 0) {
                this._recycleHistory();
                this.currentState.wristTwist = this.targetState.wristTwist;
            }
            this.lastTrackingTime = now;
            this.isHoldingPose = false;
            const frame = this._historyPool.pop() || Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
            for (let i = 0; i < 21; i++) {
                frame[i].x = landmarks[i].x; frame[i].y = landmarks[i].y; frame[i].z = landmarks[i].z || 0;
            }
            this.landmarkHistory.push(frame);
            if (this.landmarkHistory.length > this.HISTORY_LENGTH) this._historyPool.push(this.landmarkHistory.shift());
            this.analyzeLandmarks(this.getAverageLandmarks(), bodyRotation);
        } else {
            const timeSinceLost = now - this.lastTrackingTime;
            if (timeSinceLost < this.PERSISTENCE_DURATION) {
                this.isHoldingPose = true;
            } else {
                const returnSpeed = 0.05;
                for (const f in this.targetState.fingers) this.targetState.fingers[f] *= (1 - returnSpeed);
                this.targetState.fingerSpread *= (1 - returnSpeed);
                this.targetState.thumbSpread *= (1 - returnSpeed);
                // (the wrist keeps its last turn — a lost hand must not roll over palm up)
                this.targetState.wristTilt = lerpAngle(this.targetState.wristTilt, 0, returnSpeed * 0.3);
                this.targetState.wristRoll = lerpAngle(this.targetState.wristRoll, 0, returnSpeed * 0.3);
                if (this.landmarkHistory.length > 0) this._recycleHistory();
            }
        }

        this._k = this._kr = this.FOLLOW;
        if (!this.fullPose) { this._k = this.LERP_SPEED; this._kr = this.ROT_LERP_SPEED; } // (V3: eased as it always was)
        if (this._reacq != null && now - this._reacq < this.REACQUIRE_MS) this._k = this._kr = this.REACQUIRE_K;
        this._stepState();
        this.animateModel();
    }

    _recycleHistory() {
        while (this.landmarkHistory.length) this._historyPool.push(this.landmarkHistory.pop());
    }

    _stepState() {
        const cs = this.currentState, ts = this.targetState;
        for (const f in cs.fingers) {
            let target = ts.fingers[f];
            if (this.gripOverride) {
                // Fingers close around the handle, never through it.
                if (f === 'thumb') target = Math.max(0.45, Math.min(target, this.gripOverride.thumb));
                else target = Math.min(this.gripOverride.curl + 0.04, Math.max(this.gripOverride.curl - 0.06, target));
            }
            // (fingers closing round a handle settle into it rather than snap)
            cs.fingers[f] += (target - cs.fingers[f]) * (this.gripOverride ? this.LERP_SPEED : this._k);
        }
        const k = this._k, kr = this._kr;
        cs.fingerSpread += ((this.gripOverride ? 0 : ts.fingerSpread) - cs.fingerSpread) * k;
        cs.thumbSpread += (ts.thumbSpread - cs.thumbSpread) * k;
        cs.wristTwist = lerpAngle(cs.wristTwist, ts.wristTwist, kr);
        cs.wristTilt = lerpAngle(cs.wristTilt, ts.wristTilt, kr);
        cs.wristRoll = lerpAngle(cs.wristRoll, ts.wristRoll, kr);
        if (this._jointsT) {
            // our own V4 hand: every joint steadied by how fast the fingers really move
            let kj = k;
            if (k === this.FOLLOW && this.fullPose) {
                let sp = 0;
                for (const n of JOINT_FINGERS) for (let i = 0; i < 4; i++) sp = Math.max(sp, Math.abs(this._jointsT[n][i] - this._jointsC[n][i]));
                kj = (this._jointSteady || (this._jointSteady = new Steady({ minCutoff: 1.5, beta: 5 }))).alpha(sp / (this._dt || 1 / 60), this._dt || 1 / 60);
            }
            for (const n of JOINT_FINGERS) {
                const t = this._jointsT[n], c = this._jointsC[n];
                for (let i = 0; i < 4; i++) c[i] += (t[i] - c[i]) * kj;
            }
        }
    }

    getAverageLandmarks() {
        const count = this.landmarkHistory.length;
        if (count === 0) return null;
        const avg = this._avg;
        for (let i = 0; i < 21; i++) {
            let x = 0, y = 0, z = 0, weightSum = 0;
            for (let idx = 0; idx < count; idx++) {
                const p = this.landmarkHistory[idx][i];
                const weight = (idx + 1) / count;
                x += p.x * weight; y += p.y * weight; z += p.z * weight;
                weightSum += weight;
            }
            avg[i].x = x / weightSum; avg[i].y = y / weightSum; avg[i].z = z / weightSum;
        }
        return avg;
    }

    analyzeLandmarks(landmarks) {
        const wrist = landmarks[0];
        const getCurl = (baseIdx, tipIdx) => {
            const tip = landmarks[tipIdx];
            const base = landmarks[baseIdx];
            const dTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
            const dBase = Math.hypot(base.x - wrist.x, base.y - wrist.y);
            const ratio = dTip / (dBase + 0.05);
            return Math.max(0, Math.min(1, (1.15 - ratio) * 3.2));
        };
        const ts = this.targetState;
        ts.fingers.index = getCurl(5, 8);
        ts.fingers.middle = getCurl(9, 12);
        ts.fingers.ring = getCurl(13, 16);
        ts.fingers.pinky = getCurl(17, 20);

        const tBase = landmarks[1];
        const tTip = landmarks[4];
        const tDist = Math.hypot(tTip.x - tBase.x, tTip.y - tBase.y);
        ts.fingers.thumb = Math.max(0, Math.min(1, (0.09 - tDist) * 20));

        const iTip = landmarks[8];
        const pTip = landmarks[20];
        const fanDist = Math.hypot(iTip.x - pTip.x, iTip.y - pTip.y);
        ts.fingerSpread = Math.max(0, Math.min(1, (fanDist - 0.15) * 3.5));

        const iKnuckle = landmarks[5];
        const thumbDist = Math.hypot(tTip.x - iKnuckle.x, tTip.y - iKnuckle.y);
        ts.thumbSpread = Math.max(0, Math.min(1, (thumbDist - 0.05) * 4.0));

        const indexB = landmarks[5];
        const pinkyB = landmarks[17];
        const middleB = landmarks[9];

        const dx = pinkyB.x - indexB.x;
        const dy = pinkyB.y - indexB.y;
        // How well the knuckle line is seen compared to the hand's length: an
        // edge-on hand shows almost a dot and its angle is noise — then hold the turn
        const handLen = Math.hypot(middleB.x - wrist.x, middleB.y - wrist.y) + 1e-6;
        const conf = Math.max(0, Math.min(1, (Math.hypot(dx, dy) / handLen - 0.22) / 0.3));
        // Which way the palm faces, from the depth of the points (3D): the cross product of
        // wrist→index knuckle and wrist→pinky knuckle. Its sign flips only when the hand
        // really turns over — the 2D knuckle line alone also «flips» when seen edge-on.
        const ax = indexB.x - wrist.x, ay = indexB.y - wrist.y, az = (indexB.z || 0) - (wrist.z || 0);
        const bx = pinkyB.x - wrist.x, by = pinkyB.y - wrist.y, bz = (pinkyB.z || 0) - (wrist.z || 0);
        const nz = ax * by - ay * bx;
        const nlen = Math.hypot(ay * bz - az * by, az * bx - ax * bz, nz) + 1e-9;
        const facingNow = Math.abs(nz) / nlen > 0.35 ? Math.sign(nz) : 0; // (0: edge-on, unsure)
        if (facingNow && facingNow !== this._facing) {
            this._facingVotes = (this._facingVotes || 0) + 1;
            if (this._facing === undefined || this._facingVotes >= 4) { this._facing = facingNow; this._facingVotes = 0; this._facingAt = performance.now(); }
        } else this._facingVotes = 0;
        if (conf > 0 && dx * dx + dy * dy > 0.0008) {
            const twist = Math.atan2(dy, dx);
            const targetTwist = this.side === 'right' ? -twist + 0.25 : twist - Math.PI - 0.25;
            // SAFEGUARD: a sudden ~180° jump is almost always a tracking glitch
            // (edge-on hand, atan2 wrap). Accept it only if it persists AND the palm's
            // 3D facing turned over too.
            const jump = Math.abs(lerpAngle(0, targetTwist - ts.wristTwist, 1));
            if (jump > 1.8) {
                const t = performance.now();
                if (this._pendingTwist !== null && Math.abs(lerpAngle(0, targetTwist - this._pendingTwist, 1)) < 0.6) {
                    this._pendingTwistFrames++;
                } else {
                    this._pendingTwist = targetTwist;
                    this._pendingTwistFrames = 1;
                    this._pendingTwistAt = t;
                }
                const turnedOver = this._facingAt && t - this._facingAt < 1500;
                if (this._pendingTwistFrames >= 8 && t - this._pendingTwistAt > 250 && conf > 0.55 && (turnedOver || this._pendingTwistFrames >= 30)) {
                    ts.wristTwist = lerpAngle(ts.wristTwist, targetTwist, 0.6);
                    this._pendingTwist = null;
                    this._pendingTwistFrames = 0;
                }
            } else {
                this._pendingTwist = null;
                this._pendingTwistFrames = 0;
                // (a hand turns at a human pace: at most ~0.35 rad per recognition)
                const step = lerpAngle(0, targetTwist - ts.wristTwist, 1) * 0.6 * conf;
                ts.wristTwist += Math.max(-0.35, Math.min(0.35, step));
            }
        }

        const targetTilt = Math.max(-1.2, Math.min(1.2, (middleB.y - wrist.y) * 3.0));
        ts.wristTilt += (targetTilt - ts.wristTilt) * 0.6;

        const rawRoll = ((pinkyB.z || 0) - (indexB.z || 0)) * 6;
        let targetRoll = Math.max(-0.8, Math.min(0.8, rawRoll));
        // A fist on a sword's handle: the wrist bent to the little finger's side (as for pointing
        // the blade forward, a thrust) or to the thumb's — read from the picture, see wristBend()
        if (this.bladeGrip) {
            const bend = wristBend(landmarks, this.aspect);
            if (bend != null) this._bladeBend = this._bladeBend == null ? bend : this._bladeBend + (bend - this._bladeBend) * 0.5;
            targetRoll = -Math.max(-BLADE_BEND_RADIAL, Math.min(BLADE_BEND_ULNAR, (this._bladeBend || 0) * BLADE_BEND_GAIN));
        } else this._bladeBend = null;
        ts.wristRoll += (targetRoll - ts.wristRoll) * 0.45;

        if (this.fullPose) this._fullPose(landmarks);
    }

    /** The palm's whole turn and the finger joints from the points (see HandPose.js). */
    _fullPose(landmarks) {
        const fr = handFrame(landmarks, this.aspect, this._frBuf || (this._frBuf = {}));
        if (!fr) return;
        const prev = this._frame;
        if (!prev) this._frame = { X: fr.X.clone(), Y: fr.Y.clone(), Z: fr.Z.clone() };
        const f = this._frame;
        f.Y.copy(fr.Y);
        if (fr.quality < 0.25 && prev) {
            // an edge-on hand: its roll about the fingers is a guess — keep the last one
            f.X.addScaledVector(f.Y, -f.X.dot(f.Y));
            if (f.X.lengthSq() < 1e-6) f.X.copy(fr.X); else f.X.normalize();
        } else f.X.copy(fr.X);
        f.Z.crossVectors(f.X, f.Y);
        const j = fingerJoints(landmarks, this.aspect, this.side, this._jBuf || (this._jBuf = {}));
        if (!j) return;
        if (!this._jointsT) { this._jointsT = {}; this._jointsC = {}; for (const n of JOINT_FINGERS) { this._jointsT[n] = [0, 0, 0, 0]; this._jointsC[n] = [0, 0, 0, 0]; } }
        for (const n of JOINT_FINGERS) {
            const t = this._jointsT[n];
            t[0] = Math.max(-0.35, Math.min(1.75, j[n][0]));
            t[1] = Math.max(0, Math.min(1.9, j[n][1]));
            t[2] = Math.max(0, Math.min(1.6, j[n][2]));
            t[3] = Math.max(-0.45, Math.min(0.45, j.spread[n] || 0));
        }
    }

    /**
     * The palm's turn (in the hand pivot's frame) that puts the model's hand where the
     * camera sees the real one. The hero's space → the forearm's (the hand hangs on it),
     * bent at the wrist at most MAX_WRIST_BEND (a wrong guess of the arm's depth must
     * not break the wrist), then into the palm's own frame (a mirrored left model too).
     */
    _palmTarget(out) {
        const f = this._frame;
        const elbow = this.group.parent;
        if (!f || !elbow || !this.body) return null;
        elbow.updateWorldMatrix(true, false);
        this.body.updateWorldMatrix(true, false);
        // the forearm in the hero's space
        const qE = _qa.copy(this.body.getWorldQuaternion(_qb).invert()).multiply(elbow.getWorldQuaternion(_qc));
        // the hand's frame in the forearm's space
        const A = _m1.makeBasis(f.X, f.Y, f.Z).premultiply(_m2.makeRotationFromQuaternion(qE.invert()));
        // the wrist's range: the fingers within MAX_WRIST_BEND of the forearm (+Z)
        const Y = _va.setFromMatrixColumn(A, 1);
        const bend = Y.angleTo(_vz);
        if (bend > MAX_WRIST_BEND) {
            const axis = _vb.crossVectors(Y, _vz);
            if (axis.lengthSq() > 1e-10) A.premultiply(_m2.makeRotationAxis(axis.normalize(), bend - MAX_WRIST_BEND));
        }
        // into the palm's own frame: (group·pivot)⁻¹ · A · S (S flips Z for the mirrored model)
        const GP = _m2.makeScale(this.group.scale.x, 1, 1).multiply(_m3.makeRotationFromEuler(this.handPivot.rotation));
        const R = GP.invert().multiply(A);
        if (this.group.scale.x < 0) R.multiply(_m3.makeScale(1, 1, -1));
        // a V5 wand in this hand (Items sets it every frame): the palm bent at the wrist so the wand lies along the real hand
        this.wandBent = this.wandBendAt != null && performance.now() - this.wandBendAt < 250;
        if (this.wandBent) R.multiply(_m3.makeRotationZ(-WAND_BEND));
        return out.setFromRotationMatrix(R);
    }

    animateModel() {
        const cs = this.currentState;
        // (a lost hand keeps its turn on the forearm: its last seen turn in the hero's space
        // would twist the wrist as the arm moves on)
        const q = this.netPalm || (this.fullPose && !this._lost ? this._palmTarget(this._qT || (this._qT = new THREE.Quaternion())) : null);
        if (this._lost && !this.netPalm && this._qShown) {
            // keep the palm as it is
        } else if (q) {
            // the whole turn of the real hand; a sudden turn-over (an edge-on glitch) must last to be believed
            if (this._qShown && this._qShown.angleTo(q) > 1.6 && !this.netPalm) {
                if (this._pend && this._pend.angleTo(q) < 0.5) this._pendN++;
                else { this._pend = (this._pend || new THREE.Quaternion()).copy(q); this._pendN = 1; }
                if (this._pendN < 6) q.copy(this._qShown);
                else { this._pend = null; this._pendN = 0; }
            } else this._pendN = 0;
            (this._qShown || (this._qShown = new THREE.Quaternion())).copy(q);
            // (our own V4 hand: the palm's turn steadied by how fast it really turns — a still
            // hand doesn't tremble with the camera's noise, a real turn passes at once)
            let kr = this._kr;
            if (kr === this.FOLLOW && !this.netPalm) kr = (this._palmSteady || (this._palmSteady = new Steady())).alpha(this.palm.quaternion.angleTo(q) / (this._dt || 1 / 60), this._dt || 1 / 60);
            this.palm.quaternion.slerp(q, kr);
        } else {
            this.palm.rotation.y = cs.wristTwist;
            this.palm.rotation.x = cs.wristTilt;
            this.palm.rotation.z = cs.wristRoll;
        }

        const maxBend = Math.PI / 1.95;
        const spread = cs.fingerSpread;
        const thumbOut = cs.thumbSpread;
        let pose = this.gripOverride?.pose;
        if (pose === PEN_GRIP) pose = this._penBlend();
        if (pose?.closed) pose = this._fittedPose(pose, this.gripOverride.fit);
        if (pose) {
            // the fingers settle into the grip the thing needs (a pen grip on a wand)
            const k = this.LERP_SPEED;
            const to = (o, key, v) => { o[key] += (v - o[key]) * k; };
            for (const name of JOINT_FINGERS) {
                const J = pose[name], seg = this.fingerMeshes[name];
                to(seg[0].pivot.rotation, 'z', -J[3]);
                for (let i = 0; i < seg.length; i++) to(seg[i].pivot.rotation, 'x', -J[i]);
            }
            const T = pose.thumb, th = this.fingerMeshes.thumb;
            to(th[0].pivot.rotation, 'x', T[0]); to(th[0].pivot.rotation, 'y', T[1]); to(th[0].pivot.rotation, 'z', T[2]);
            to(th[1].pivot.rotation, 'x', -T[3]); to(th[2].pivot.rotation, 'x', -T[4]);
            return;
        }
        for (const name of FINGERS) {
            const segments = this.fingerMeshes[name];
            const rotDelta = cs.fingers[name] * maxBend;
            const pivot = segments[0].pivot;
            if (name === 'thumb') {
                pivot.rotation.z = 0.8 + (thumbOut * 0.5);
                for (let i = 0; i < segments.length; i++) {
                    const seg = segments[i];
                    seg.pivot.rotation.x = -rotDelta * 0.5;
                    if (i === 0) {
                        seg.pivot.rotation.y = -0.4 - (rotDelta * 0.6);
                        seg.pivot.rotation.z += -rotDelta * 0.2;
                    }
                }
            } else {
                let spreadDir = 0;
                if (name === 'index') spreadDir = 0.2;
                if (name === 'middle') spreadDir = 0.05;
                if (name === 'ring') spreadDir = -0.1;
                if (name === 'pinky') spreadDir = -0.25;
                const J = !this.gripOverride && this._jointsC?.[name];
                if (J) {
                    // every joint as the camera sees it (the knuckle, the middle and the end joints)
                    pivot.rotation.z = -J[3];
                    for (let i = 0; i < segments.length; i++) segments[i].pivot.rotation.x = -J[i];
                } else {
                    pivot.rotation.z = spreadDir * spread;
                    for (const seg of segments) seg.pivot.rotation.x = -rotDelta;
                }
            }
        }
    }

    /** The pen grip between pointing and writing, as the real index finger (or a real stick) shows it. */
    _penBlend() {
        // one steady grip (the network's points of fingers pinching a stick jump about: a grip
        // following them twisted the fingers and shook the wand) — only a real stick seen by
        // the camera sets it
        const tilt = this.stickTilt;
        const t0 = tilt != null ? Math.max(0, Math.min(1, (tilt - PEN_TILT[0]) / (PEN_TILT[1] - PEN_TILT[0]))) : PEN_T_STEADY;
        this.penT += (t0 - this.penT) * 0.2;
        const t = this.penT, o = this._penPose;
        for (let i = 0; i < 4; i++) o.index[i] = PEN_POINT_GRIP.index[i] + (PEN_GRIP.index[i] - PEN_POINT_GRIP.index[i]) * t;
        for (let i = 0; i < 5; i++) o.thumb[i] = PEN_POINT_GRIP.thumb[i] + (PEN_GRIP.thumb[i] - PEN_POINT_GRIP.thumb[i]) * t;
        return o;
    }

    /** Where the index finger touches a wand held like a pen (world): its middle bone pointing, its pad writing. */
    penIndexPoint(out) {
        const fm = this.fingerMeshes.index, t = this.penT;
        const a = fm[1].pivot.localToWorld(_va.fromArray(PEN_POINTS.indexMid));
        fm[2].pivot.localToWorld(out.fromArray(PEN_POINTS.index));
        return out.lerp(a, 1 - t);
    }

    /**
     * 'stable' (V3, the default): the hand as it was before the full hand — its turn from
     * the knuckles (left / right, up / down, a little roll), whole fingers bending, eased
     * per frame; a wand in the fist. 'full' (V4, being finished): the palm's whole turn
     * from the 21 points, every finger joint, a wand held like a pen.
     */
    setMode(mode) {
        const full = mode === 'full';
        if (full === this.fullPose && this.mode) return;
        this.mode = full ? 'full' : 'stable';
        this.fullPose = full;
        this.HISTORY_LENGTH = full ? 1 : 2;
        this._frame = null; this._qShown = null; this._pend = null; this._pendN = 0;
        this._jointsT = this._jointsC = null;
        if (this.gripOverride?.pose === PEN_GRIP && !full) this.gripOverride.pose = null;
    }

    setShowHands(visible) { this.group.visible = visible; }
    setQuality() { }

    /**
     * Hold a thing: fingers wrap to `curl` (0..1); `pose`: how they lie round it — a GRIP_POSES name
     * ('pen', 'shake' a handshake, 'power' a handle, 'ball' an apple…) or the joint angles themselves. null releases.
     */
    setGrip(curl, pose = null) {
        if (curl != null && pose === 'book' && this.gripOverride?.pose === BOOK_GRIP) return; // (already round it: keep where the fingers lie)
        // (the pen grip is V4's; V3 holds a wand in the fist)
        this.gripOverride = curl == null ? null : { curl, thumb: Math.min(1, curl + 0.15), pose: typeof pose === 'string' ? (pose === 'book' ? BOOK_GRIP : pose === 'pen' && !this.fullPose ? null : GRIP_POSES[pose] ?? null) : pose };
        if (this.gripOverride?.pose === BOOK_GRIP) this.gripOverride.fit = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
    }

    /** A grip that closes on the thing (BOOK_GRIP): each finger as far as `fit` says (−1, −2…: out of the way). */
    _fittedPose(pose, fit) {
        const out = this._fitPose || (this._fitPose = { index: [0, 0, 0, 0], middle: [0, 0, 0, 0], ring: [0, 0, 0, 0], pinky: [0, 0, 0, 0], thumb: [0, 0, 0, 0, 0] });
        for (const name of FINGERS) {
            const t = fit?.[name] ?? 0, o = out[name];
            const back = t < 0 && pose.back?.[name]?.[-t - 1];
            if (back) { for (let i = 0; i < o.length; i++) o[i] = back[i]; continue; }
            const a = pose.open[name], b = pose.closed[name], k = Math.max(0, Math.min(1, t));
            for (let i = 0; i < o.length; i++) o[i] = a[i] + (b[i] - a[i]) * k;
        }
        return out;
    }

    /** Put one finger straight into the joint angles J (as animateModel does for a pose). */
    _setFinger(name, J) {
        const seg = this.fingerMeshes[name];
        if (name === 'thumb') {
            seg[0].pivot.rotation.set(J[0], J[1], J[2]);
            seg[1].pivot.rotation.x = -J[3];
            seg[2].pivot.rotation.x = -J[4];
            return;
        }
        seg[0].pivot.rotation.z = -J[3];
        for (let i = 0; i < seg.length; i++) seg[i].pivot.rotation.x = -J[i];
    }

    /** Is any part of this finger (its bones, `margin` thick) inside one of the boxes (or cylinders)? */
    _fingerIn(name, boxes, margin) {
        const seg = this.fingerMeshes[name];
        seg[0].pivot.updateMatrixWorld(true);
        const p = _va;
        for (const s of seg) {
            const len = s.mesh.position.y * 2;
            const half = s.mesh.geometry.parameters.width / 2; // (the bone's own thickness: its sides touch first)
            for (const k of [0.3, 0.65, 1]) {
                s.pivot.localToWorld(p.set(0, len * k, 0));
                for (const b of boxes) {
                    if (b.cyl) {
                        // a cylinder (the wand): axis point a, unit direction d, radius r, along it from … to
                        const t = _vb.copy(p).sub(b.a).dot(b.d);
                        if (t < b.from - margin || t > b.to + margin) continue;
                        const dist = _vc.copy(p).sub(b.a).addScaledVector(b.d, -t).length();
                        if (dist < (b.rAt ? b.rAt(t) : b.r) + half + margin) return true;
                        continue;
                    }
                    const l = _vb.copy(p).applyMatrix4(b.inv), m = margin / (b.scale || 1);
                    if (l.x > b.min.x - m && l.x < b.max.x + m && l.y > b.min.y - m && l.y < b.max.y + m && l.z > b.min.z - m && l.z < b.max.z + m) return true;
                }
            }
        }
        return false;
    }

    /**
     * Close the fingers of a BOOK_GRIP on the thing: each finger from open towards closed,
     * stopping where it would first go into one of the boxes — it lies on the surface.
     * boxes: [{inv: world → the box's own frame, min, max, scale: world units per its unit}].
     * Returns the fit {finger: 0…1; −1, −2…: the thumb out of the way, as BOOK_GRIP.back} (also kept for the drawing).
     */
    fitGrip(boxes, margin = 0.035, steps = 20) {
        const go = this.gripOverride;
        if (!go?.pose?.closed || !this.group.visible) return null;
        const P = go.pose, fit = go.fit || (go.fit = {});
        this.group.updateMatrixWorld(true);
        const J = [0, 0, 0, 0, 0];
        const at = (name, t) => {
            const a = P.open[name], b = P.closed[name];
            for (let i = 0; i < a.length; i++) J[i] = a[i] + (b[i] - a[i]) * t;
            this._setFinger(name, J);
            return this._fingerIn(name, boxes, margin);
        };
        for (const name of FINGERS) {
            const seg = this.fingerMeshes[name];
            const saved = seg.map((s) => [s.pivot.rotation.x, s.pivot.rotation.y, s.pivot.rotation.z]);
            let t = 0;
            if (at(name, 0)) {
                const backs = P.back?.[name] || [];
                for (let i = 0; i < backs.length; i++) { this._setFinger(name, backs[i]); if (!this._fingerIn(name, boxes, margin)) { t = -1 - i; break; } }
            } else {
                for (let i = 1; i <= steps; i++) { if (at(name, i / steps)) break; t = i / steps; }
            }
            seg.forEach((s, i) => s.pivot.rotation.set(saved[i][0], saved[i][1], saved[i][2]));
            seg[0].pivot.updateMatrixWorld(true);
            fit[name] = t;
        }
        return fit;
    }

    /**
     * The V5 wand's axis (WAND_LINE) in the world for a wand of radius r: a (the point by the web)
     * and d (unit, towards the tip). The palm's own frame — as steady as the palm, whatever the
     * fingers do.
     */
    wandAxis(r, a, d) {
        const L = WAND_LINE;
        this.palm.updateWorldMatrix(true, false);
        const z = -this.PALM_D / 2 - r - L.gap;
        this.palm.localToWorld(a.set(L.at[0], L.at[1], z));
        this.palm.localToWorld(d.set(L.at[0] + L.dir[0], L.at[1] + L.dir[1], z + L.dir[2])).sub(a).normalize();
        return a;
    }

    /**
     * Close the V5 wand grip on a wand: `profile` (lengthProfile of its model), `back` — how far its
     * own end is behind the axis point by the palm (WAND_LINE.at). Each finger and the thumb close
     * only until they touch it as thick as it is there. Returns {r, fit}.
     */
    gripWand(profile, back) {
        // (the axis sits off the palm by the wand's thickness in the palm: its thickest part there)
        let r = 0.02;
        for (const p of profile) if (p.y1 - back > -0.25 && p.y0 - back < 0.35) r = Math.max(r, p.r);
        const rAt = (t) => { let v = 0; for (const p of profile) if (t + back >= p.y0 && t + back <= p.y1) v = Math.max(v, p.r); return v; };
        let to = -back;
        for (const p of profile) to = Math.max(to, p.y1 - back);
        this.setGrip(0.5, WAND_GRIP);
        this.group.updateMatrixWorld(true);
        const a = new THREE.Vector3(), d = new THREE.Vector3();
        this.wandAxis(r, a, d);
        this._wandFit = { r, fit: this.fitGrip([{ cyl: true, a, d, r, rAt, from: -back, to }], 0.004) };
        return this._wandFit;
    }

    // ------------------------------------------------------------- networking
    serializeState() {
        const c = this.currentState, f = c.fingers;
        const r = (v) => Math.round(v * 100) / 100;
        const out = [r(f.thumb), r(f.index), r(f.middle), r(f.ring), r(f.pinky), r(c.fingerSpread), r(c.thumbSpread), r(c.wristTwist), r(c.wristTilt), r(c.wristRoll)];
        // the palm's whole turn and the joints (others see the hand as it is)
        if (this._qShown) {
            const q = this.palm.quaternion;
            out.push(r(q.x), r(q.y), r(q.z), r(q.w));
            if (this._jointsC && !this.gripOverride) for (const n of JOINT_FINGERS) for (const v of this._jointsC[n]) out.push(r(v));
        }
        return out;
    }

    /** Remote avatar: drive the hand from a network snapshot (smoothed). */
    applyState(arr) {
        if (!Array.isArray(arr) || arr.length < 10) return;
        const t = this.targetState;
        t.fingers.thumb = arr[0]; t.fingers.index = arr[1]; t.fingers.middle = arr[2]; t.fingers.ring = arr[3]; t.fingers.pinky = arr[4];
        t.fingerSpread = arr[5]; t.thumbSpread = arr[6]; t.wristTwist = arr[7]; t.wristTilt = arr[8]; t.wristRoll = arr[9];
        if (arr.length >= 14) {
            this.netPalm = (this.netPalm || new THREE.Quaternion()).set(arr[10], arr[11], arr[12], arr[13]).normalize();
            if (arr.length >= 30) {
                if (!this._jointsT) { this._jointsT = {}; this._jointsC = {}; for (const n of JOINT_FINGERS) { this._jointsT[n] = [0, 0, 0, 0]; this._jointsC[n] = [0, 0, 0, 0]; } }
                JOINT_FINGERS.forEach((n, k) => { for (let i = 0; i < 4; i++) this._jointsT[n][i] = arr[14 + k * 4 + i]; });
            } else this._jointsT = this._jointsC = null;
        } else { this.netPalm = null; this._jointsT = this._jointsC = null; }
        this._k = this.LERP_SPEED; this._kr = this.ROT_LERP_SPEED;
        this._stepState();
        this.animateModel();
    }

    getCollisionBoxes() {
        const boxes = [];
        if (!this.group.visible) return boxes;
        const worldPos = new THREE.Vector3();
        this.palm.getWorldPosition(worldPos);
        boxes.push({ box: new THREE.Box3().setFromCenterAndSize(worldPos, new THREE.Vector3(0.32, 0.45, 0.16)), object: this.palm, type: 'palm' });
        for (const [name, segments] of Object.entries(this.fingerMeshes)) {
            segments.forEach((seg, i) => {
                const p = new THREE.Vector3();
                seg.mesh.getWorldPosition(p);
                const size = name === 'thumb' ? 0.16 : 0.14;
                boxes.push({ box: new THREE.Box3().setFromCenterAndSize(p, new THREE.Vector3(size, size, size)), object: seg.mesh, type: 'finger', finger: name, segment: i });
            });
        }
        return boxes;
    }
}
