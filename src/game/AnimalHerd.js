/**
 * AnimalHerd.js — how a herd of ordinary animals keeps its distance and lives.
 *
 * Every animal has a personal space measured from its own model (the real body
 * length from the bounding box — so new models just work): sheep keep closer
 * than cows, but no two ever touch. Each one lives on its own: grazes with its
 * head down, stands, looks around, lies down to rest, walks to a new spot, or
 * follows the leader at a distance. Only a fright bunches them up (they flee
 * together, still not touching). Someone walking right at an animal makes it
 * step aside; a calm tamed horse comes to its owner.
 *
 * Pure helpers (no game state) used by Animals.js and the unit tests.
 */

import * as THREE from 'three';

/** Calm personal space between centres, × the body length (sheep closest, horses widest). */
export const ROOM = { sheep: 0.95, pig: 1.1, cow: 1.3, horse: 1.4 };
/** How far apart they like to graze, × the personal space. */
export const LOOSE = 1.55;
/** What each species likes to do when calm (relative weights). */
export const IDLE_WEIGHTS = {
    sheep: { graze: 0.42, stand: 0.12, look: 0.12, rest: 0.12, walk: 0.22 },
    pig: { graze: 0.40, stand: 0.12, look: 0.10, rest: 0.16, walk: 0.22 },
    cow: { graze: 0.44, stand: 0.14, look: 0.10, rest: 0.12, walk: 0.20 },
    horse: { graze: 0.40, stand: 0.18, look: 0.14, rest: 0.05, walk: 0.23 },
};
/** Seconds a calm state lasts [min, max]. */
export const IDLE_TIME = { graze: [6, 16], stand: [3, 8], look: [2.5, 5], rest: [18, 40], walk: [6, 12] };
/** Pose code sent to guests: what the head / body does. */
export const POSE = { stand: 0, graze: 1, rest: 2, look: 3 };

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _c = new THREE.Vector3();

/**
 * The body measured from the model (scaled, facing −Z): length along Z, width along X,
 * height, leg length. Measured with the model straightened at the origin.
 */
export function measureBody(model) {
    const pos = model.position.clone(), rot = model.rotation.clone();
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.updateMatrixWorld(true);
    _box.setFromObject(model);
    _box.getSize(_size);
    const s = model.scale.y || 1;
    const legs = model.userData.legs || [];
    const legH = legs.length ? legs[0].position.y * s : _size.y * 0.35;
    const out = {
        len: Math.max(0.3, _size.z), wid: Math.max(0.2, _size.x), height: Math.max(0.2, _size.y), legH,
        minZ: _box.min.z / s, maxZ: _box.max.z / s, minY: _box.min.y / s, maxY: _box.max.y / s,
    };
    model.position.copy(pos);
    model.rotation.copy(rot);
    model.updateMatrixWorld(true);
    return out;
}

/**
 * A pivot for the head (neck base), so the head can go down to the grass or look about.
 * Uses the model's own `userData.head` if it has one; otherwise takes the parts at the
 * front of the body (their centres in the front 40% of its length) under one pivot.
 */
export function rigHead(model, dims) {
    if (model.userData.neck || model.userData.head) return model.userData.neck || model.userData.head;
    const front = dims.minZ + 0.4 * (dims.maxZ - dims.minZ);
    const legs = new Set(model.userData.legs || []);
    const parts = model.children.filter((m) => m.isMesh && !legs.has(m) && m !== model.userData.saddle && m.position.z < front);
    if (!parts.length) return null;
    let y = Infinity;
    for (const m of parts) y = Math.min(y, m.position.y);
    const pivot = new THREE.Group();
    pivot.position.set(0, y, front);
    for (const m of parts) {
        model.remove(m);
        m.position.sub(pivot.position);
        pivot.add(m);
    }
    model.add(pivot);
    model.userData.head = pivot;
    return pivot;
}

/** How far the body reaches from its centre towards a direction (an ellipse of length × width). */
export function reach(a, dx, dz) {
    const d = Math.hypot(dx, dz) || 1;
    const yaw = a.group.rotation.y;
    // body axis (forward −Z turned by yaw)
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const c = Math.abs((dx * fx + dz * fz) / d), s = Math.sqrt(Math.max(0, 1 - c * c));
    const L = a.dims.len / 2, W = a.dims.wid / 2;
    return Math.sqrt((L * c) ** 2 + (W * s) ** 2);
}

/** The smallest distance between two bodies' centres so they don't touch (plus a small gap). */
export function solidGap(a, b, dx, dz) {
    return reach(a, dx, dz) + reach(b, dx, dz) + 0.08 * (a.dims.wid + b.dims.wid);
}

/** Calm personal space between two animals (centre to centre). */
export function pairRoom(a, b) {
    return 0.5 * (a.room + b.room);
}

/** A weighted random calm state. */
export function pickIdle(type, rnd = Math.random) {
    const w = IDLE_WEIGHTS[type] || IDLE_WEIGHTS.cow;
    let sum = 0;
    for (const k in w) sum += w[k];
    let r = rnd() * sum;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'stand';
}

export function idleTime(state, rnd = Math.random) {
    const [lo, hi] = IDLE_TIME[state] || [3, 6];
    return lo + rnd() * (hi - lo);
}

/**
 * A free spot around (cx, cz) within radius r: of a few random tries, the one farthest
 * from the others (their bodies and where they are going). `others` = [{x, z, room}].
 */
export function pickSpot(cx, cz, r, room, others, rnd = Math.random) {
    let best = null, bestD = -Infinity;
    for (let i = 0; i < 10; i++) {
        const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r;
        const x = cx + Math.cos(ang) * rr, z = cz + Math.sin(ang) * rr;
        let near = Infinity;
        for (const o of others) near = Math.min(near, Math.hypot(o.x - x, o.z - z) / (0.5 * (room + o.room)));
        if (near > bestD) { bestD = near; best = { x, z }; }
        if (near > LOOSE) break;
    }
    return best;
}

/** Turn an angle difference into −π..π. */
export function wrapAngle(d) {
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}

/**
 * The head and the body follow what the animal does (smoothly): the head down to the
 * grass, up and turning when looking around; the legs fold when it lies down.
 */
export function animatePose(a, dt, pose) {
    const k = Math.min(1, dt * 2.5);
    const wantLie = pose === POSE.rest ? 1 : 0;
    a.lie = (a.lie || 0) + (wantLie - (a.lie || 0)) * Math.min(1, dt * 1.2);
    // (grazing: the muzzle down to the grass — a horse's long neck goes down further)
    const wantPitch = pose === POSE.graze ? (a.model?.userData?.grazePitch ?? -1.05) : pose === POSE.look ? 0.18 : pose === POSE.rest ? -0.25 : 0;
    a.headP = (a.headP || 0) + (wantPitch - (a.headP || 0)) * k;
    a.lookT = (a.lookT || 0) + dt;
    const wantYaw = pose === POSE.look ? Math.sin(a.lookT * 0.9 + a.id) * 0.7 : pose === POSE.graze ? Math.sin(a.lookT * 0.5 + a.id) * 0.15 : 0;
    a.headY = (a.headY || 0) + (wantYaw - (a.headY || 0)) * k;
    // (the neck lowers / raises the head when the model has one; the head turns; both from their own rest angles)
    const ud = a.model.userData;
    const neck = ud.neck || ud.head, head = ud.head || ud.neck;
    if (!neck) return;
    if (!ud.rest) ud.rest = { nx: neck.rotation.x, hy: head.rotation.y };
    neck.rotation.x = ud.rest.nx + a.headP;
    head.rotation.y = ud.rest.hy + a.headY;
}

/** Lying: the legs folded under the body (lie 0…1 blends from how they stand / walk). */
export function foldLegs(model, lie) {
    for (const l of model.userData.legs || []) {
        const front = l.userData.front ?? (l.position.z < 0);
        // (the upper leg flat under the belly, the lower one folded back along it)
        l.rotation.x += ((front ? -1.5 : 1.5) - l.rotation.x) * lie;
        const lower = l.userData.lower;
        if (lower) lower.rotation.x += ((front ? 2.9 : -2.9) - lower.rotation.x) * lie;
    }
}

/**
 * The animal's real body now, as an upright segment with a radius: from its feet to the
 * top of its body (its current size — a bronze bull grown 2×, the ram turned into the
 * ~5.6 m minotaur), and half its real width. For rays (fire, ray spells) aimed at its chest.
 * @returns {{x:number, z:number, bot:number, top:number, r:number}}
 */
export function bodySpan(a, out = {}) {
    const p = a.group.position;
    out.x = p.x; out.z = p.z;
    if (a.model?.userData?.minotaur?.visible && a.bodyH) {
        out.bot = p.y - 0.5; out.top = p.y + a.bodyH; out.r = Math.max(0.6, a.bodyR || 1);
        return out;
    }
    const d = a.dims, sy = a.group.scale.y || 1;
    if (!d || !(d.maxY > d.minY)) { out.bot = p.y - 0.5; out.top = p.y + 1.5; out.r = 0.8; return out; }
    const k = (sy * (d.maxY - d.minY)) / d.height; // (how much it has grown since it was measured)
    out.bot = p.y + d.minY * sy;
    out.top = p.y + d.maxY * sy;
    out.r = Math.max(0.4, a.bodyR || 0.5 * Math.max(d.wid, 0.6 * d.len) * k);
    return out;
}

/**
 * How close the ray segment o + d·s (s ∈ [0, len], d unit) passes to the upright segment
 * (x, bot…top, z). Returns the distance, and `along` (s at the closest point).
 */
export function rayToSpan(o, d, len, x, bot, top, z, out = {}) {
    const wx = o.x - x, wy = o.y - bot, wz = o.z - z;
    const b = d.y, dd = d.x * wx + d.y * wy + d.z * wz, h = Math.max(0, top - bot);
    const den = 1 - b * b;
    let s = den > 1e-6 ? (b * wy - dd) / den : 0;
    s = Math.max(0, Math.min(len, s));
    let t = Math.max(0, Math.min(h, wy + b * s));
    s = Math.max(0, Math.min(len, b * t - dd)); // (again for the clamped point on the body)
    t = Math.max(0, Math.min(h, wy + b * s));
    const ex = wx + d.x * s, ey = wy + d.y * s - t, ez = wz + d.z * s;
    out.dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
    out.along = s;
    return out;
}
