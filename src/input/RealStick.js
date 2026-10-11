/**
 * RealStick.js — a real stick (a pen, a paintbrush, a wand) in the player's hand.
 *
 * The camera program (stick_detect.py; in the browser StickDetector.js) finds a thin
 * straight thing sticking out of a hand and sends its direction in the picture:
 * {wrist: [x, y] (which hand, picture 0…1), dir: [dx, dy] (picture pixels, x right,
 * y down, from the hand to the tip), out (how far it sticks out past the hand, palm
 * sizes), conf 0…1}. Here it becomes the direction of the wand in the hero's hand:
 *
 *   - matchSticks: which hand it is in (the nearest wrist),
 *   - StickTracker: believed only when seen in several pictures running (nothing
 *     happens by accident), held over a short miss, steadied without delay,
 *   - stickDirection: the picture shows the stick's direction across the picture; its
 *     depth (towards / away from the camera) comes from how short it looks against
 *     the longest it was seen (a stick pointing at the camera looks short) and from the
 *     hand's own turn (the fingers' pen direction says which way: to or from the camera).
 *
 * Pure maths, no game state.
 */

import * as THREE from 'three';

const _u = new THREE.Vector3(), _k = new THREE.Vector3(0, 0, 1);

/** The sticks to the hands they are in: {left, right} (null where none). */
export function matchSticks(sticks, leftLm, rightLm) {
    const out = { left: null, right: null };
    if (!Array.isArray(sticks) || !sticks.length) return out;
    for (const s of sticks) {
        if (!s || !Array.isArray(s.wrist) || !Array.isArray(s.dir)) continue;
        let best = null, bestD = 0.08; // (the stick's hand must be one of the hands we have)
        for (const [side, lm] of [['left', leftLm], ['right', rightLm]]) {
            if (!lm || !lm[0]) continue;
            const d = Math.hypot(lm[0].x - s.wrist[0], lm[0].y - s.wrist[1]);
            if (d < bestD) { bestD = d; best = side; }
        }
        if (best && (!out[best] || (s.conf || 0) > (out[best].conf || 0))) out[best] = s;
    }
    return out;
}

/**
 * One hand's stick over time. update(stick | null, now ms, fresh) — `fresh`: a new
 * camera result (the same one comes to every drawn frame). Returns the believed
 * stick {dx, dy, out, outMax, conf} or null.
 */
export class StickTracker {
    constructor({ minConf = 0.45, need = 3, hold = 400 } = {}) {
        this.minConf = minConf;
        this.need = need; // pictures in a row to believe it
        this.hold = hold; // ms it is kept over a miss
        this.reset();
    }

    reset() {
        this.run = 0;
        this.lastSeen = -Infinity;
        this.state = null;
        this.outMax = 0;
        this.outMaxAt = 0;
    }

    update(stick, now, fresh = true) {
        if (fresh) {
            const ok = stick && (stick.conf ?? 0) >= this.minConf && Number.isFinite(stick.dir?.[0]) && Number.isFinite(stick.dir?.[1]);
            if (ok) {
                const n = Math.hypot(stick.dir[0], stick.dir[1]) || 1;
                const dx = stick.dir[0] / n, dy = stick.dir[1] / n;
                const s = this.state;
                if (s && dx * s.dx + dy * s.dy < 0.5 && this.run >= this.need) {
                    // a sudden turn of over 60° between two pictures: a new stick is confirmed afresh
                    this.run = 1;
                } else this.run++;
                this.lastSeen = now;
                // the longest it stuck out lately: how long it really is (slowly forgotten)
                const out = stick.out || 0;
                if (out >= this.outMax || now - this.outMaxAt > 5000) { this.outMax = out; this.outMaxAt = now; }
                if (!s) this.state = { dx, dy, out, conf: stick.conf, outMax: this.outMax };
                else {
                    // steadied by its own speed: a quick turn passes at once, a still stick stays still
                    const turn = Math.acos(Math.max(-1, Math.min(1, dx * s.dx + dy * s.dy)));
                    const k = Math.min(1, 0.35 + turn * 4);
                    s.dx += (dx - s.dx) * k; s.dy += (dy - s.dy) * k;
                    const m = Math.hypot(s.dx, s.dy) || 1;
                    s.dx /= m; s.dy /= m;
                    s.out += (out - s.out) * 0.5;
                    s.conf = stick.conf;
                    s.outMax = this.outMax;
                }
            } else if (now - this.lastSeen > this.hold) {
                this.run = 0;
                this.state = null;
            }
        }
        if (now - this.lastSeen > this.hold) { this.run = 0; this.state = null; }
        return this.run >= this.need ? this.state : null;
    }
}

/**
 * The stick's direction in the hero's space (it looks along −Z, +X its right, +Y up;
 * a picture point is (−x·aspect, −y, z·aspect)). `s`: a believed stick (StickTracker);
 * `finger`: the direction the fingers give (the pen grip, hero's space, unit) — it
 * says which way the depth goes and how much when the stick's length isn't known yet.
 */
export function stickDirection(s, finger, out = new THREE.Vector3()) {
    const u = _u.set(-s.dx, -s.dy, 0).normalize(); // (across the picture, in the hero's space)
    const gu = finger ? finger.dot(u) : 1, gz = finger ? finger.dot(_k) : 0;
    // how much of it lies across the picture (cos of its tilt to / from the camera)
    const fromFingers = Math.hypot(gu, gz) > 1e-6 ? Math.max(0, gu) / Math.hypot(gu, gz) : 1;
    let across = fromFingers;
    if (s.outMax >= 1 && s.out > 0) {
        // it looks shorter than its real length: it points to / from the camera
        const fromLength = Math.max(0.15, Math.min(1, s.out / s.outMax));
        across = finger ? 0.7 * fromLength + 0.3 * fromFingers : fromLength; // (the length is seen; the fingers' depth is the network's guess)
    }
    across = Math.max(0.2, Math.min(1, across));
    // (unsure which way: a stick seen short mostly points ahead, at the camera — the hero's −Z)
    const depth = Math.sqrt(1 - across * across) * (gz > 0.05 ? 1 : -1);
    return out.copy(u).multiplyScalar(across).addScaledVector(_k, depth).normalize();
}
