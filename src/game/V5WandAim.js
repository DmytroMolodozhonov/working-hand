/**
 * V5WandAim.js — where the V5 wand points (Items._v5Wand) as one small function, so the game and the pointing bench
 * (tools/handbench/pointbench.mjs, tests/unit/pointing.test.js) measure the very same thing.
 *
 * The wand lies across the palm aslant (SimplifiedHand WAND_LINE), and the drawn wrist is bent to the little finger's side
 * by that angle (WAND_BEND) — as a real hand pointing a wand: so the wand points where the real hand points, mixed with the
 * forearm (the palm's turn of a 50 px fist is a guess; the forearm is not). Before: the forearm carried the grip's angle, and
 * the aim went 34.5° off towards the thumb (tools/handbench/pointbench.mjs).
 */
import * as THREE from 'three';

export const V5_WAND = {
    BACK: 0.35, // how far the wand's own end is behind its point in the palm (its butt at the heel of the hand)
    PALM: 0.4, // how much the hand's own turn leads the wand; the rest — the forearm (V3 points like this: «V3 points exactly where I point»)
    // the wand's own steadying (AimSteady: by its turning speed — a still wand doesn't tremble, a turn passes at once)
    STEADY: { minCutoff: 1.2, beta: 6, dCutoff: 3, dead: 0.3 },
};

/**
 * The wand's own steadying, per drawn frame: a One-Euro on the turn (Casiez et al. 2012) whose speed is the wand's
 * angular VELOCITY steadied as a vector (rad/s) — the camera's jitter turns it every way and averages out, a real turn
 * (even a slow careful aim) does not. The old one (SimplifiedHand.Steady) took the size of each frame's turn and a floor
 * of it that rose to any speed held for 2 s: a slow aim was smoothed like jitter (tools/handbench/pointbench.mjs: 160 ms
 * behind at 12°/s). `dead`: rad/s a still hand still shows.
 */
export class AimSteady {
    constructor(o = V5_WAND.STEADY) {
        this.o = o;
        this.w = new THREE.Vector3(); // the steadied angular velocity (axis × rad/s)
        this.has = false;
    }

    /** The easing (0…1) towards `target` (unit) from `cur` (unit) this frame. */
    alpha(cur, target, dt) {
        if (!(dt > 0)) return 1;
        const o = this.o;
        const ang = cur.angleTo(target);
        _w.crossVectors(cur, target);
        if (_w.lengthSq() > 1e-12) _w.normalize().multiplyScalar(ang / dt); else _w.set(0, 0, 0);
        const ad = 1 / (1 + 1 / (2 * Math.PI * (o.dCutoff ?? 3) * dt));
        if (!this.has) { this.w.copy(_w); this.has = true; } else this.w.lerp(_w, ad);
        const speed = Math.max(0, this.w.length() - (o.dead ?? 0));
        return 1 / (1 + 1 / (2 * Math.PI * (o.minCutoff + o.beta * speed) * dt));
    }

    reset() { this.has = false; this.w.set(0, 0, 0); }
}
const _w = new THREE.Vector3();

const _a = new THREE.Vector3(), _up = new THREE.Vector3(), _f = new THREE.Vector3(), _x = new THREE.Vector3();
const _hq = new THREE.Quaternion();

/**
 * The V5 wand's direction this frame before its own steadying (world, unit) — written into `out` and returned.
 * ch: the hero (getForearmDirection), hand: the drawn SimplifiedHand (wandAxis, palm), r: the wand's radius in the palm.
 */
export function wandAimDir(ch, hand, side, out, r = 0.03) {
    hand.wandBendAt = performance.now(); // (the drawn wrist bends so the aslant wand lies along the real hand: SimplifiedHand.WAND_BEND)
    hand.wandAxis(r, _a, out);
    // where the real hand points: the wand's axis once the wrist is bent (the palm's own «up» while it is not yet)
    const point = hand.wandBent ? out : _up.set(0, 1, 0).applyQuaternion(hand.palm.getWorldQuaternion(_hq));
    if (point !== out) out.copy(point);
    const fore = ch.getForearmDirection(side, _f);
    return out.multiplyScalar(V5_WAND.PALM).addScaledVector(fore, 1 - V5_WAND.PALM).normalize();
}

/** The palm's «across» axis for the wand's own frame (x of its basis), unit. */
export function wandSideAxis(hand, d, out = _x) {
    out.set(1, 0, 0).applyQuaternion(hand.palm.getWorldQuaternion(_hq));
    out.addScaledVector(d, -out.dot(d));
    if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
    return out.normalize();
}
