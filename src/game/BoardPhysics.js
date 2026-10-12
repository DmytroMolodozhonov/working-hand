/**
 * BoardPhysics.js — a surfboard on the water (pure, no THREE).
 *
 * The board floats on the surface the water gives (SurfWater.sample): it rises
 * and falls and tilts with the waves. Its speed along its nose (u) and sideways
 * (w) change by real causes only:
 *   - gravity along the slope of the water under it (a wave's front face pushes
 *     it shorewards, the back slope brakes it),
 *   - drag of the water (more while ploughing slowly, less once planing),
 *   - leg strokes of the rider's paddling leg (each a push, a little turn away
 *     from the paddle side),
 *   - the fin, which holds the line (sideways speed dies fast),
 *   - leaning: a carve whose turn rate makes the lean right (a bike's rule).
 * "Riding" a wave is not a timer: the board stays on the front face only while it
 * goes at about the wave's own speed — faster, it runs into the flat trough;
 * slower, the crest passes under it. `riding` is only a label for that state.
 * Balance (standing, or on one foot while riding) is an unstable inverted
 * pendulum the rider keeps with the lean; crouching and arms out slow it down.
 */

export const SURF = {
    G: 20, L: 4.4, W: 1.3, T: 0.18, ROCKER: 0.16,
    DRAFT: 0.06, RIDER_DRAFT: 0.05,
    STROKE_DU: 0.85, PADDLE_MAX: 5.0, STROKE_YAW: 0.06,
    K_DISP: 0.08, PLANE_U: 5.5, K_PLANE: 0.07, K_FIN: 3.5,
    SLIDE: 1.0, TRIM: 0.5, YAW_MAX: 1.2,
    CATCH_SLOPE: 0.10, CATCH_RATIO: 0.55, CATCH_COS: 0.5, CATCH_T: 0.3, LOSE_T: 1.2,
    TAU: 1.4, ERR_GAIN: 2.2, FALL_BETA: 0.55,
    CROUCH_TAU: 1.6, ARMS_TAU: 1.4, ONE_FOOT_TAU: 0.6,
    PEARL_SLOPE: 0.55, PEARL_TRIM: 0.6, STALL_DRAG: 1.5,
    GROUND_DEPTH: 0.35, THROW_U: 4, FREE_SLIDE: 0.6,
    GRAB_REACH: 0.35, SLIP: 0.45, MOUNT_REACH: 1.8,
};

export class BoardBody {
    constructor({ x = 0, z = 0, y = 0, yaw = 0, u = 0, w = 0 } = {}) {
        Object.assign(this, { x, z, y, yaw, u, w, vy: 0, beta: 0, faceT: 0, offT: 0, riding: false, grounded: false, fallen: null, pitch: 0, roll: 0 });
        this._s = {};
    }

    /**
     * @param {number} dt
     * @param {(x, z, t, out) => object} water  SurfWater.sample bound
     * @param {object} input {mode: 'free'|'one'|'stand', strokes, strokeSide, lean, trim, crouch, armsOut, t}
     * @returns {Array} events [{type: 'caught'|'lost'|'fall', cause?}]
     */
    step(dt, water, input) {
        const ev = [];
        const n = Math.max(1, Math.ceil(dt / (1 / 60)));
        const h = dt / n;
        for (let i = 0; i < n && !this.fallen; i++) this._sub(h, water, { ...input, t: (input.t || 0) + i * h }, ev, i === 0);
        return ev;
    }

    _sub(dt, water, I, ev, first) {
        const S = SURF, s = water(this.x, this.z, I.t, this._s);
        const hx = -Math.sin(this.yaw), hz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        const free = I.mode === 'free';
        if (s.kind === 'land' || (s.depth ?? 9) < S.GROUND_DEPTH) {
            // on the beach: the fins dig into the sand
            if (!this.grounded) {
                this.grounded = true;
                ev.push({ type: 'fall', cause: this.u > S.THROW_U && !free ? 'thrown' : 'shore' });
            }
            this.u *= Math.max(0, 1 - 6 * dt); this.w *= Math.max(0, 1 - 6 * dt);
            this.x += (this.u * hx + this.w * rx) * dt; this.z += (this.u * hz + this.w * rz) * dt;
            this.y = s.surface + (s.h || 0) + S.T / 2;
            this.riding = false;
            return;
        }
        this.grounded = false;
        const wu = s.vx * hx + s.vz * hz, ww = s.vx * rx + s.vz * rz; // the water's own motion in board axes
        const slopeF = -(s.gx * hx + s.gz * hz), slopeR = -(s.gx * rx + s.gz * rz); // downhill along the nose / to the right
        const ur = this.u - wu, wr = this.w - ww;
        const trim = free ? 0 : I.trim || 0;
        const k = (Math.abs(ur) < S.PLANE_U ? S.K_DISP : S.K_PLANE) * (trim < -0.4 ? 1 + S.STALL_DRAG * -trim : 1);
        const du = S.G * slopeF * (free ? S.FREE_SLIDE : S.SLIDE * (1 + S.TRIM * trim)) - Math.sign(ur) * k * ur * ur;
        if (first && I.strokes > 0 && I.mode === 'one') {
            // a leg stroke pushes the board on (less as it gets faster), the nose turns a little away
            for (let i = 0; i < I.strokes; i++) this.u += S.STROKE_DU * Math.max(0, 1 - this.u / S.PADDLE_MAX);
            this.yaw += I.strokes * S.STROKE_YAW * (I.strokeSide === 'left' ? -1 : 1);
        }
        this.u += du * dt;
        this.w += (S.G * slopeR * 0.3 - S.K_FIN * wr) * dt;
        // turning: a carve; the rail only grips with some speed
        const grip = Math.max(0, Math.min(1, (this.u - 1) / 3));
        const lean = free ? 0 : I.lean || 0;
        const yawRate = Math.max(-S.YAW_MAX, Math.min(S.YAW_MAX, S.G * Math.tan(lean) / Math.max(this.u, 1))) * grip;
        this.yaw += yawRate * dt;
        this.x += (this.u * hx + this.w * rx) * dt; this.z += (this.u * hz + this.w * rz) * dt;
        // on the face of the wave, going with it at about its speed?
        const onFace = slopeF > S.CATCH_SLOPE && s.c > 0 && this.u > S.CATCH_RATIO * s.c && hx * s.dx + hz * s.dz > S.CATCH_COS;
        this.faceT = onFace ? this.faceT + dt : 0;
        this.offT = onFace ? 0 : this.offT + dt;
        if (!this.riding && this.faceT > S.CATCH_T && !free) { this.riding = true; ev.push({ type: 'caught' }); }
        if (this.riding && this.offT > S.LOSE_T) { this.riding = false; ev.push({ type: 'lost' }); }
        // balance: standing (or on one foot while riding) is an inverted pendulum held by the lean
        if (I.mode === 'stand' || (I.mode === 'one' && this.riding)) {
            const chop = (s.breaking || 0) * 0.25 * Math.sin(7.3 * I.t + this.x * 0.9);
            const need = Math.atan(this.u * yawRate / S.G) + 0.5 * Math.atan(slopeR) + chop;
            const tau = S.TAU * (I.crouch ? S.CROUCH_TAU : 1) * (I.armsOut ? S.ARMS_TAU : 1) * (I.mode === 'one' ? S.ONE_FOOT_TAU : 1);
            this.beta += (this.beta / tau + S.ERR_GAIN * (lean - need) * Math.min(1, Math.max(0.3, this.u / 3))) * dt;
            if (Math.abs(this.beta) > S.FALL_BETA) { this.fallen = 'balance'; ev.push({ type: 'fall', cause: 'balance' }); }
        } else this.beta *= Math.max(0, 1 - 3 * dt);
        if (!free && slopeF > S.PEARL_SLOPE && trim > S.PEARL_TRIM) { this.fallen = 'pearl'; ev.push({ type: 'fall', cause: 'pearl' }); }
        if (this.riding && (s.breaking || 0) > 0.8 && slopeF > 0.7 && s.h > 0) { this.fallen = 'wipeout'; ev.push({ type: 'fall', cause: 'wipeout' }); }
        // the surface carries it (a rider presses it a little deeper)
        this.y = s.surface + s.h + S.T / 2 - S.DRAFT - (free ? 0 : S.RIDER_DRAFT);
        this.pitch = Math.atan(slopeF);
        this.roll = Math.atan(slopeR);
    }
}

/** Lean and trim from the torso against the neutral taken at mounting (like Flight's steering). */
export function riderInput(torso, neutral) {
    if (!torso || !neutral) return { lean: 0, trim: 0 };
    const lean = Math.max(-0.8, Math.min(0.8, (torso.lateral - neutral.lateral) * 1.2));
    let trim = ((neutral.noseRel ?? 0) - (torso.noseRel ?? 0)) * 1.6;
    if (torso.depth != null && neutral.depth != null) trim += (neutral.depth - torso.depth) * 6;
    const dz = (v, d) => (Math.abs(v) < d ? 0 : v - Math.sign(v) * d);
    return { lean: dz(lean, 0.04), trim: Math.max(-1, Math.min(1, dz(trim, 0.08))) };
}
