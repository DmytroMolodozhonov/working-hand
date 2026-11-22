/**
 * HorseMotion.js — how a horse of the roads moves under a rider (the author 21.11: «анимация коня: ходьба, дрифт… чтобы реально чувствовалось, что это конь,
 * многогранный, что они используют его по максимуму»; especially for the robber gangs).
 *
 * What it gives (host; the horses of Riders._move):
 *   • the real gaits by speed — a four-beat WALK, the TROT, the CANTER and the GALLOP, each its own cadence (a gallop covers more ground per stride);
 *   • speed has weight: the horse gathers itself (the croup lowers) as it picks up, and does not stop in a frame;
 *   • the DRIFT: the body turns faster than the line of travel — at a gallop a sharp turn slides the horse wide (the hooves dig, it leans into the
 *     turn like a bike, dust flies from the hooves);
 *   • the SLIDING STOP: a hard brake from a gallop — the fore legs braced forward, the hind legs gathered under, the croup low, a long slide in dust;
 *   • the REAR: a horse stopped hard (or told to — `rearUp`) rises on its hind legs, the fore legs folded, the head thrown up, and comes down;
 *   • the body lives: it rocks with the stride, the neck pumps, the tail streams out at a gallop, the head tosses at a stop.
 * The numbers are m/s (a ridden horse: Riders.RIDE WALK / RUN; the robbers' gallop ≈ 9).
 *
 * What can go wrong (and is handled): a NaN never stays in a pose (every number is checked); a horse out of the saddle is released (`settle` — level, still);
 * a wall ahead stops it at once (its speed is zero and the pose brakes, no slide through the wall); a horse that is dead / lying / in a cart / flying is not touched;
 * the dust is the shared spark pool, a few specks a frame, none out of sight. Guests see the gait from the horse's speed (a.spd); the rear and the slide are the host's pose.
 */

export const HM = {
    ACC: 5.2, DEC: 7.5, BRAKE: 15, // m/s²: picking up, easing off, braking hard
    SKID_FROM: 7, SKID_DROP: 5, // a stop from at least this fast, wanting this much slower: the slide
    GRIP: 7.5, GRIP_FAST: 2.6, // 1/s: how fast the line of travel follows the body (slow = a drift); at a gallop the grip is the lower one
    TURN: 3.2, TURN_FAST: 2.0, // 1/s: how fast the body turns to the aim
    REAR_T: 1.1, REAR_MAX: 0.85, // s, rad: a rear up
    WALK_TO: 2.8, TROT_TO: 6, CANTER_TO: 9.2, // the gait borders (m/s)
    DUST_V: 6, // m/s: dust from the hooves in a slide or a hard turn
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => (Number.isFinite(a) ? a - Math.PI * 2 * Math.round(a / (Math.PI * 2)) : 0);
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
export const turnTo = (a, b, k) => a + wrap(b - a) * clamp(k, 0, 1);

/** The gait's name by speed. */
export function gaitOf(s) { return s < 0.25 ? 'stand' : s < HM.WALK_TO ? 'walk' : s < HM.TROT_TO ? 'trot' : s < HM.CANTER_TO ? 'canter' : 'gallop'; }

/** The horse's own motion state (made once). */
export function hmOf(a) {
    return a.hm || (a.hm = { s: 0, dir: null, yawRate: 0, roll: 0, pitch: 0, slip: 0, skid: 0, skidSpd: 0, rear: 0, rearT: 0, accel: 0, toss: 0, blocked: 0 });
}

/**
 * One step of the horse's motion (before it is moved): the body turned, the speed with weight, the line of travel with its drift.
 * → { ux, uz, speed } the unit direction the horse travels in and its speed this frame.
 */
export function drive(a, aim, want, dt) {
    const H = hmOf(a);
    dt = clamp(num(dt, 0.016), 0, 0.1);
    const yaw0 = num(a.group.rotation.y);
    if (H.dir == null || !Number.isFinite(H.dir)) H.dir = yaw0;
    want = Math.max(0, num(want));
    // a rear up: the horse stands (it is up on its hind legs)
    if (H.rear > 0) { want = 0; H.rear = Math.max(0, H.rear - dt); }
    // a hard brake from a run: the slide
    const fast = H.s >= HM.SKID_FROM;
    if (H.skid <= 0 && fast && H.rear <= 0 && want < H.s - HM.SKID_DROP) { H.skid = 0.4 + H.s * 0.05; H.skidSpd = H.s; }
    let dec = HM.DEC;
    if (H.skid > 0) { want = 0; dec = HM.BRAKE; H.skid = Math.max(0, H.skid - dt); if (H.skid <= 0 && H.skidSpd > 9.5 && H.s < 3 && Math.random() < 0.55) rearUp(a, HM.REAR_T); }
    const s0 = H.s;
    H.s = approach(H.s, want, (want > H.s ? HM.ACC : dec) * dt);
    H.accel = dt > 0 ? (H.s - s0) / dt : 0;
    // the body turns to the aim (wide at a gallop), the line of travel follows it (a drift when fast)
    const fastK = smooth(4, 10, H.s);
    const turnK = (HM.TURN + (HM.TURN_FAST - HM.TURN) * fastK) * (H.skid > 0 ? 1.6 : 1) * (H.rear > 0 ? 0.3 : 1);
    const yaw = turnTo(yaw0, aim, dt * turnK);
    H.yawRate = dt > 0 ? wrap(yaw - yaw0) / dt : 0;
    a.group.rotation.y = yaw;
    const grip = HM.GRIP + (HM.GRIP_FAST - HM.GRIP) * fastK;
    H.dir = turnTo(H.dir, yaw, dt * grip * (H.skid > 0 ? 0.55 : 1));
    H.slip = wrap(yaw - H.dir); // (how far the body points off the line it travels: the drift)
    if (H.s < 0.6) { H.dir = yaw; H.slip = 0; } // (standing: no line to slide along)
    return { ux: -Math.sin(H.dir), uz: -Math.cos(H.dir), speed: H.s };
}

/** The way was shut (a wall, a tree, the crowd): the horse is stopped dead — no slide through. */
export function blocked(a) { const H = hmOf(a); if (H.s > 4) H.toss = 0.8; H.s = 0; H.skid = 0; H.blocked = 0.4; }

/** Rear up for `dur` s (a horse told to; or stopped hard from a gallop). Not a horse in the air / dead. */
export function rearUp(a, dur = HM.REAR_T) {
    if (!a || a.dead || a.airborne) return false;
    const H = hmOf(a);
    if (H.rear > 0) return false;
    H.rear = H.rearT = dur; H.skid = 0;
    return true;
}

/** The pose of the model for this frame (after the legs were animated). `dt` s; `fx` the effects (dust), optional. */
export function pose(a, dt, fx = null) {
    const H = hmOf(a), m = a.model, ud = m?.userData;
    if (!m || !ud) return;
    dt = clamp(num(dt, 0.016), 0.001, 0.1);
    const s = H.s, gal = smooth(HM.TROT_TO + 0.5, HM.CANTER_TO, s);
    a.gallop = gal; // (the legs of Animals.animateLegs blend from the trot into the gallop)
    const phase = num(a.walkT);
    const k = 1 - (a.lie || 0);
    // (the four-beat walk: its own legs below the trot — each hoof on its own beat, a long calm swing)
    const walkK = 1 - smooth(HM.WALK_TO - 0.6, HM.WALK_TO + 0.6, s);
    const legs = ud.legs;
    if (legs && walkK > 0.02 && s > 0.15 && k > 0.5) {
        const ph = [0.25, 0.75, 0, 0.5]; // (FR, FL, HR, HL: the lateral sequence — hind right, fore right, hind left, fore left)
        const amp = Math.min(1, s / 2.4) * 0.42;
        for (let i = 0; i < legs.length; i++) {
            const l = legs[i], front = l.userData.front ?? i < 2;
            const p = phase * 0.55 + (ph[i] ?? 0) * Math.PI * 2, sn = Math.sin(p), cs = Math.cos(p);
            const want = sn * amp * (front ? 1 : 0.85);
            l.rotation.x += (want - l.rotation.x) * walkK;
            const lower = l.userData.lower;
            if (lower) { const bend = Math.max(0, cs) * amp * 1.1; lower.rotation.x += ((front ? -bend * 1.2 : bend * 0.9) - lower.rotation.x) * walkK; }
        }
    }
    // the sliding stop: the fore legs braced forward, the hind legs gathered under
    const skidK = clamp(H.skid / 0.3, 0, 1);
    // the rear: an envelope up and down
    let rearK = 0;
    if (H.rear > 0 && H.rearT > 0) { const u = 1 - H.rear / H.rearT; rearK = Math.sin(Math.PI * clamp(u, 0, 1)) ** 0.7; }
    if (legs && (skidK > 0.01 || rearK > 0.01)) {
        for (let i = 0; i < legs.length; i++) {
            const l = legs[i], front = l.userData.front ?? i < 2, lower = l.userData.lower;
            if (skidK > 0) {
                l.rotation.x += ((front ? 0.85 : 0.95) - l.rotation.x) * skidK;
                if (lower) lower.rotation.x += ((front ? -0.05 : 0.7) - lower.rotation.x) * skidK;
            }
            if (rearK > 0) {
                l.rotation.x += ((front ? 1.35 : -0.22) - l.rotation.x) * rearK; // (the fore legs tucked up and forward, the hind legs straight under)
                if (lower) lower.rotation.x += ((front ? -2.1 : 0.1) - lower.rotation.x) * rearK;
            }
        }
    }
    // the body: pitch (squat as it picks up, rock-back as it brakes, the rear), roll into a turn, a rock with the stride
    const rock = Math.sin(phase * (1 + gal * 0.4) + 0.6) * 0.05 * Math.max(gal, smooth(1, 6, s) * 0.5);
    const accelPitch = clamp(-H.accel * 0.012, -0.12, 0.1) * (1 - rearK); // (picking up: the croup sinks, the nose lifts a little; braking: the croup low, the nose dips)
    const pitchWant = rock + accelPitch + (skidK > 0 ? -0.1 * skidK : 0) + rearK * HM.REAR_MAX;
    H.pitch += (pitchWant - H.pitch) * Math.min(1, dt * 12);
    const rollWant = clamp(-H.yawRate * Math.max(0, s) * 0.032 + -H.slip * 0.5 * smooth(3, 8, s), -0.42, 0.42) * (1 - rearK);
    H.roll += (rollWant - H.roll) * Math.min(1, dt * 6);
    m.rotation.x = H.pitch;
    m.rotation.z = H.roll;
    // (the rear turns the body about the hind hooves, not about its middle: the hooves stay on the ground)
    const sc = num(m.scale?.y, 1) || 1, zh = 0.95 * sc;
    const th = H.pitch > 0 ? H.pitch : 0;
    m.position.y = Math.max(0, Math.sin(phase * (1 + gal * 0.4) + 2.4)) * 0.1 * gal + zh * Math.sin(th) - skidK * 0.12;
    m.position.z = zh * (1 - Math.cos(th));
    // the neck pumps with the stride; the head tosses at a stop and a rear; the head up in the rear
    const neck = ud.neck, head = ud.head;
    H.toss = Math.max(0, H.toss - dt);
    if (neck) {
        if (!ud.rest) ud.rest = { nx: neck.rotation.x, hy: head ? head.rotation.y : 0, hx: head ? head.rotation.x : 0 };
        const toss = (skidK > 0 || H.toss > 0 ? Math.sin(phase * 0.5 + performance.now() * 0.02) * 0.18 : 0);
        neck.rotation.x = ud.rest.nx + a.headP * 0 + Math.sin(phase * (1 + gal * 0.4) + 1.2) * 0.13 * gal - 0.18 * gal - rearK * 0.45 + toss;
    }
    // the tail streams out at a gallop
    const tail = ud.tail;
    if (tail) {
        tail.rotation.x += ((-0.55 * gal - 0.18 * rearK) - tail.rotation.x) * Math.min(1, dt * 6);
        tail.rotation.z = Math.sin(phase * 0.7) * 0.12 * (0.3 + gal);
    }
    // the dust: out of the hooves in a slide or a hard drift
    if (fx && (s > HM.DUST_V * 0.5 || skidK > 0) && (skidK > 0.2 || (Math.abs(H.slip) > 0.3 && s > HM.DUST_V) || rearK > 0.9)) {
        H.dustT = (H.dustT || 0) - dt;
        if (H.dustT <= 0) {
            H.dustT = skidK > 0.2 ? 0.04 : 0.09;
            const p = a.group.position;
            for (let i = 0; i < 2; i++) {
                const side = (Math.random() - 0.5) * 1.6;
                fx.spark?.({ x: p.x + side, y: p.y - 0.35, z: p.z + (Math.random() - 0.5) * 1.6 }, 0xb9a57c, 0.45 + Math.random() * 0.4, { x: (Math.random() - 0.5) * 1.6, y: 0.8 + Math.random() * 1.1, z: (Math.random() - 0.5) * 1.6 }, 0.6 + Math.random() * 0.5);
            }
        }
    }
}

/** The horse leaves its rider (or its rider's path): the pose level again, the speed none. */
export function settle(a) {
    const H = a.hm;
    if (!H) return;
    H.s = 0; H.skid = 0; H.rear = 0; H.slip = 0; H.yawRate = 0; H.dir = null;
    const m = a.model;
    if (m) { m.rotation.x = 0; m.rotation.z = 0; m.position.y = 0; m.position.z = 0; }
    const tail = m?.userData?.tail; if (tail) { tail.rotation.x = 0; tail.rotation.z = 0; }
    a.gallop = 0; H.pitch = 0; H.roll = 0;
}
