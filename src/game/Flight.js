/**
 * Flight.js — the «Флайн» spell: fly like Superman.
 *
 *   1. Take-off: both arms up + say «флайн». The hero rises straight up,
 *      faster and faster. During the first second the arms must stay up —
 *      that's how the game knows you really want to fly (drop them early and
 *      the spell fizzles: you float back down).
 *   2. Cruise: the body smoothly turns horizontal (Superman pose) and speeds
 *      up to a top speed. Arms are free now — every spell works in the air.
 *      The torso steers: lean sideways to turn, lean forward to dive, lean
 *      back to climb (looking down/up helps as well).
 *   3. Landing: point yourself at the ground; touching it ends the flight.
 *
 * Pure logic (no THREE): Game.js feeds inputs and applies the outputs.
 */

import { clamp, lerp } from '../core/math.js';

export const FLIGHT = {
    CONFIRM_TIME: 0.9, // s: arms must stay up this long after the word
    ARMS_GRACE: 0.45, // s: tracking glitches / arms a bit low while confirming are forgiven
    TAKEOFF_TIME: 1.6, // s of vertical climb before turning horizontal
    TAKEOFF_ACCEL: 7, // m/s² upwards
    TAKEOFF_MAX: 9, // m/s
    CRUISE_ACCEL: 5, // m/s²
    MAX_SPEED: 26, // m/s
    MAX_TILT: 1.35, // rad: body almost horizontal (Superman)
    TILT_RATE: 0.9, // rad/s
    TURN_RATE: 1.7, // rad/s at full sideways lean
    PITCH_RATE: 1.4, // how fast the flight path follows the torso
    MAX_DIVE: -1.15, // rad
    MAX_CLIMB: 0.85, // rad
    LAND_ALTITUDE: 2.4, // m above ground (body centre) at which a dive lands
    LAND_PITCH: -0.12, // path must point at the ground at least this much
    MIN_ALTITUDE: 1.6, // skimming the ground never goes lower than this
    CEILING: 110,
};

export class FlightController {
    constructor() {
        this.reset();
    }

    reset() {
        this.state = 'idle'; // idle | takeoff | cruise | landing
        this.t = 0;
        this.speed = 0;
        this.pitch = 0; // flight path pitch (+ up)
        this.tilt = 0; // body tilt from upright towards horizontal
        this.armsDownFor = 0;
        this.neutral = null;
        this.samples = 0;
        this.lastEvent = null;
    }

    get active() {
        return this.state === 'takeoff' || this.state === 'cruise';
    }

    get busy() {
        return this.state !== 'idle';
    }

    /** Start flying (the caller already checked: arms up + the word). */
    start() {
        if (this.active) return false;
        this.reset();
        this.state = 'takeoff';
        this.pitch = Math.PI / 2;
        return true;
    }

    /** Stop flying (touched the ground / cancelled). The body turns upright again. */
    land(reason = 'landed') {
        if (!this.busy) return;
        this.state = 'landing';
        this.t = 0;
        this.lastEvent = reason;
    }

    _calibrate(torso) {
        if (!torso) return;
        const n = this.neutral || { lateral: 0, depth: null, noseRel: 0 };
        const k = 1 / (++this.samples);
        n.lateral = lerp(n.lateral, torso.lateral, k);
        n.noseRel = lerp(n.noseRel, torso.noseRel, k);
        if (torso.depth != null) n.depth = n.depth == null ? torso.depth : lerp(n.depth, torso.depth, k);
        this.neutral = n;
    }

    /** Steering inputs in [-1, 1] from the torso relative to the take-off pose. */
    steering(torso, headPitch = 0) {
        let turn = 0, dive = 0;
        if (torso && this.neutral) {
            turn = clamp((torso.lateral - this.neutral.lateral) * 2.2, -1, 1);
            if (torso.depth != null && this.neutral.depth != null) dive += (this.neutral.depth - torso.depth) * 6;
            dive += (this.neutral.noseRel - torso.noseRel) * 1.6;
        }
        // Looking down (head pitch < 0 means looking down here) helps diving
        dive += -headPitch * 0.6;
        // Dead zone so a calm body flies straight
        const dz = (v, d) => (Math.abs(v) < d ? 0 : v - Math.sign(v) * d);
        return { turn: dz(turn, 0.12), dive: clamp(dz(dive, 0.08), -1, 1) };
    }

    /**
     * @param {number} dt
     * @param {object} input {armsUp:boolean, torso:{lateral,depth,noseRel}|null, headPitch:number}
     * @returns {{vx:number, vy:number, vz:number, yawRate:number, tilt:number, pitch:number}}
     *   velocity in the body's yaw frame: vz = forward speed, vy = vertical
     */
    update(dt, input = {}) {
        const out = { forward: 0, up: 0, yawRate: 0, tilt: this.tilt, pitch: this.pitch };
        if (this.state === 'idle') return out;
        this.t += dt;

        if (this.state === 'landing') {
            this.tilt = Math.max(0, this.tilt - dt * 2.8);
            this.speed = Math.max(0, this.speed - dt * 30);
            this.pitch = 0;
            out.forward = this.speed;
            out.tilt = this.tilt;
            if (this.tilt <= 0 && this.speed <= 0) this.state = 'idle';
            return out;
        }

        if (this.state === 'takeoff') {
            if (this.t < 0.6 + FLIGHT.CONFIRM_TIME) this._calibrate(input.torso);
            // Confirmation: arms must stay up for the first second
            if (this.t < FLIGHT.CONFIRM_TIME) {
                this.armsDownFor = input.armsUp ? 0 : this.armsDownFor + dt;
                if (this.armsDownFor > FLIGHT.ARMS_GRACE) {
                    this.land('cancelled');
                    return this.update(0, input);
                }
            }
            this.speed = Math.min(FLIGHT.TAKEOFF_MAX, this.speed + FLIGHT.TAKEOFF_ACCEL * dt);
            this.pitch = Math.PI / 2;
            // Start leaning forward towards the end of the climb
            const k = clamp((this.t - FLIGHT.TAKEOFF_TIME * 0.5) / (FLIGHT.TAKEOFF_TIME * 0.5), 0, 1);
            this.tilt = 0.35 * k;
            if (this.t >= FLIGHT.TAKEOFF_TIME) {
                this.state = 'cruise';
                this.t = 0;
                this.pitch = 0.9; // still climbing, then follows the torso
            }
        } else {
            // Cruise
            const steer = this.steering(input.torso, input.headPitch || 0);
            this.speed = Math.min(FLIGHT.MAX_SPEED, this.speed + FLIGHT.CRUISE_ACCEL * dt);
            const target = steer.dive >= 0 ? steer.dive * FLIGHT.MAX_DIVE : -steer.dive * FLIGHT.MAX_CLIMB;
            // Right after take-off the path levels out by itself
            const level = clamp(1 - this.t / 2.0, 0, 1);
            const wanted = lerp(target, 0.0, level * 0.7);
            this.pitch += (wanted - this.pitch) * Math.min(1, FLIGHT.PITCH_RATE * dt * 2);
            out.yawRate = steer.turn * FLIGHT.TURN_RATE;
            // Superman pose: horizontal when cruising, more upright when climbing steeply
            const tiltTarget = FLIGHT.MAX_TILT - Math.max(0, this.pitch) * 0.55 + Math.max(0, -this.pitch) * 0.15;
            this.tilt += clamp(tiltTarget - this.tilt, -FLIGHT.TILT_RATE * dt, FLIGHT.TILT_RATE * dt);
        }

        out.forward = this.speed * Math.cos(this.pitch);
        out.up = this.speed * Math.sin(this.pitch);
        out.tilt = this.tilt;
        out.pitch = this.pitch;
        return out;
    }

    /**
     * Ground check from the game: lands when diving into the ground.
     * @returns {boolean} true if the flight ended now
     */
    touchGround(altitude) {
        if (this.state !== 'cruise') return false;
        if (altitude < FLIGHT.LAND_ALTITUDE && this.pitch < FLIGHT.LAND_PITCH) {
            this.land('landed');
            return true;
        }
        return false;
    }
}
