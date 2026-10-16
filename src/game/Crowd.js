/**
 * Crowd.js — every creature on the ground in one place, so each walker sees the others (pure core).
 *
 * Each system that has creatures on the ground (castle people, players, animals, zombies, the
 * spider, living trees, skeletons, travellers and their carts, servants, walking dragons…)
 * registers a source: once a frame the crowd asks each source for its bodies and puts them into a
 * grid of cells (CELL m), so a walker asks only the cells around it — never all with all.
 * The crowd also remembers where every body was the frame before, so it knows how each one moves
 * (the walker then sees where the other will be, not only where it is — Avoid.js).
 *
 * `steer(st, p, u, opts)` is what a walker calls each step: the way to go now (round the others,
 * waiting in a narrow spot, and after waiting long — a way round the jam), or null: stand this step.
 *
 * Network: the crowd is only the host's (or a single player's) — it's used where the creatures are
 * moved (the host), and the others see the moved positions as before.
 */

import { avoidStep } from './Avoid.js';

export const CROWD = {
    CELL: 4, // m: a grid cell
    LOOK: 2.6, // m ahead a walker of a man's size looks (more for big ones, more when quick)
    PATIENCE: 1.1, // s: waiting in a narrow spot before looking for another way
    DETOUR: 1.4, // s: going the other way round
    JAM: 6, // s held up in all (waiting, giving way) before squeezing past
};

/** Body radius of a kind (m): the size others keep clear of. */
export const BODY_R = {
    man: 0.5, knight: 0.7, player: 0.6, zombie: 0.5, skeleton: 0.5, servant: 0.5,
    pig: 0.6, sheep: 0.7, cow: 1.0, horse: 1.1, carriage: 2.0, spider: 2.4, dragon: 3.5, tree: 1.0,
    snowman: 0.85, iceQueen: 1.0, iceMonster: 1.6, // (the Ice Castle: IceQueen.js)
    owl: 0.3, // (a clever owl hopping on the ground: Owls.js)
};

export class Crowd {
    constructor() {
        this.sources = [];
        this.cells = new Map();
        this.bodies = [];
        this.frame = -1;
        this.prev = new WeakMap(); // ref → {x, z, t}
        this.time = 0;
    }

    /** fn(push) — push({x, y, z, r, ref, vx?, vz?, still?}) for every body of this system on the ground. */
    addSource(fn) { this.sources.push(fn); return fn; }

    removeSource(fn) { const i = this.sources.indexOf(fn); if (i >= 0) this.sources.splice(i, 1); }

    /** Build the grid for this frame (once; later calls in the same frame do nothing). */
    update(frame, time) {
        if (frame === this.frame) return;
        const dt = this.frame >= 0 ? Math.max(1e-3, time - this.time) : 0;
        this.frame = frame;
        this.time = time;
        this.cells.clear();
        const B = this.bodies = [];
        const push = (b) => { if (b && Number.isFinite(b.x) && Number.isFinite(b.z)) B.push(b); };
        for (const s of this.sources) { try { s(push); } catch { /* a source mid-teardown */ } }
        const C = CROWD.CELL;
        for (const b of B) {
            if (b.y === undefined) b.y = 0;
            if (b.r === undefined) b.r = BODY_R.man;
            // how it moves (from where it was the last frame), unless the source says
            if (b.vx === undefined && b.ref && typeof b.ref === 'object') {
                const q = this.prev.get(b.ref);
                if (q && dt > 0 && dt < 0.5) {
                    // (smoothed, so one jerky frame doesn't look like a dash)
                    const vx = (b.x - q.x) / dt, vz = (b.z - q.z) / dt;
                    const ok = Math.hypot(vx, vz) < 30; // (a teleport isn't a walk)
                    b.vx = ok ? q.vx * 0.5 + vx * 0.5 : 0; b.vz = ok ? q.vz * 0.5 + vz * 0.5 : 0;
                } else { b.vx = 0; b.vz = 0; }
                this.prev.set(b.ref, { x: b.x, z: b.z, vx: b.vx, vz: b.vz });
            }
            b.vx = b.vx || 0; b.vz = b.vz || 0;
            const k = cellKey(Math.floor(b.x / C), Math.floor(b.z / C));
            let c = this.cells.get(k);
            if (!c) this.cells.set(k, (c = []));
            c.push(b);
        }
    }

    /** Bodies within `range` m (square) of (x, z) and `dy` m up/down, without `self` (a ref). */
    near(x, z, y, range, self = null, dy = 2.5, out = []) {
        out.length = 0;
        const C = CROWD.CELL;
        const x0 = Math.floor((x - range) / C), x1 = Math.floor((x + range) / C);
        const z0 = Math.floor((z - range) / C), z1 = Math.floor((z + range) / C);
        for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
            const c = this.cells.get(cellKey(cx, cz));
            if (!c) continue;
            for (const b of c) {
                if (b.ref === self || (self && b.ref && b.ref === self.ref)) continue;
                if (Math.abs(b.x - x) > range + b.r || Math.abs(b.z - z) > range + b.r) continue;
                if (y !== null && y !== undefined && Math.abs(b.y - y) > dy) continue;
                out.push(b);
            }
        }
        return out;
    }
}

const cellKey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

/**
 * One step of a walker through the crowd.
 * st: the walker's own little memory ({} kept on it); p: {x, z}; u: unit way to its goal;
 * opts: {others (bodies near), r, speed, look, maxF (m to the goal), room(x, z), dt, id (a number:
 * who gives way when two wait for each other)}.
 * Returns {x, z} — the way to step now — or null: stand still this step (waiting for room).
 */
export function steer(st, p, u, opts) {
    const dt = opts.dt ?? 1 / 60;
    const others = opts.others || [];
    const room = opts.room || (() => true);
    // giving way in a narrow spot: back out of it, stepping aside as soon as there's room, then
    // stand a moment while the other comes through
    if (st.backT > 0) {
        st.backT -= dt;
        for (const [sx, sz] of [[-u.z, u.x], [u.z, -u.x], [-u.x, -u.z]]) {
            if (!room(p.x + sx * 0.9, p.z + sz * 0.9) || !room(p.x + sx * 1.5, p.z + sz * 1.5)) continue;
            if (others.some((o) => blocks(p, sx, sz, o, opts.r ?? 0.55))) continue;
            if (sx !== -u.x || sz !== -u.z) st.backT = Math.min(st.backT, 0.6); // (aside: enough, soon)
            if (st.backT <= 0) st.holdT = 1.3;
            return { x: sx, z: sz, back: true };
        }
        st.backT = 0; st.holdT = 1.3;
    }
    if (st.holdT > 0) { st.holdT -= dt; st.jamT = (st.jamT || 0) + dt; return null; }
    // going the other way round a jam it waited at
    if (st.detourT > 0) {
        st.detourT -= dt;
        const c = Math.cos(st.detourA), s = Math.sin(st.detourA);
        const dx = u.x * c - u.z * s, dz = u.x * s + u.z * c;
        const a = avoidStep(p, { x: dx, z: dz }, others, { ...opts, look: Math.min(opts.look ?? CROWD.LOOK, 1.6) });
        if (!a.wait && room(p.x + a.x * 0.8, p.z + a.z * 0.8)) return { x: a.x, z: a.z, detour: true };
        st.detourT = 0;
    }
    if (!others.length) { st.waitT = 0; st.jamT = 0; return { x: u.x, z: u.z }; }
    // held up long (waited, gave way, tried round — and still shut, e.g. two wanting the same spot by
    // a rail): it squeezes past sideways, shoulder first, as people do in a tight spot — slowly, the
    // bodies' own push keeps them from going into each other
    if (st.squeezeT > 0) {
        st.squeezeT -= dt;
        const a = avoidStep(p, u, others, { ...opts, r: 0.15, look: 1.2, room: () => true });
        return { x: a.x, z: a.z, squeeze: true };
    }
    const a = avoidStep(p, u, others, opts);
    if (!a.wait) { st.waitT = Math.max(0, (st.waitT || 0) - dt * 2); st.jamT = Math.max(0, (st.jamT || 0) - dt); return { x: a.x, z: a.z, by: a.by }; }
    st.jamT = (st.jamT || 0) + dt;
    if (st.jamT > CROWD.JAM) { st.jamT = 0; st.squeezeT = 1.5; return null; }
    // in the way, no room on either side: wait a moment (the one with the lower number a little
    // shorter — so of two waiting for each other, one goes first, not both together)
    st.waitT = (st.waitT || 0) + dt;
    // one standing in the way (busy, talking, idle): «посторонись» — it steps aside (makeWay)
    if (st.waitT > 0.4 && a.by) askWay(a.by, p, u);
    const patience = CROWD.PATIENCE * (1 + ((numId(opts.id) ?? 0) % 7) * 0.12);
    if (st.waitT < patience) return null;
    // waited long: the way is shut — look for another way round (a wider swing, either side)
    st.waitT = 0;
    // (a thing, not a creature — a mast, a gun: the walker's own feel for walls takes it round)
    if (a.by?.thing) return { x: u.x, z: u.z };
    for (const ang of [1.0, -1.0, 1.6, -1.6, 2.3, -2.3]) {
        const c = Math.cos(ang), s = Math.sin(ang);
        const dx = u.x * c - u.z * s, dz = u.x * s + u.z * c;
        if (!room(p.x + dx * 0.9, p.z + dz * 0.9) || !room(p.x + dx * 1.8, p.z + dz * 1.8)) continue;
        if (others.some((o) => blocks(p, dx, dz, o, opts.r ?? 0.55))) continue;
        st.detourA = ang; st.detourT = CROWD.DETOUR;
        return { x: dx, z: dz, detour: true };
    }
    // shut all round. Two waiting for each other in a narrow spot: one gives way (backs out) — the
    // one with the smaller number, or anyone held up by a body that has none
    const o = a.by, oid = o ? numId(o.id ?? o.ref?.id) : null;
    const mine = numId(opts.id);
    if (o && (oid === null || mine < oid || st.tries > 2)) { st.backT = 2.2; st.tries = 0; return null; }
    st.tries = (st.tries || 0) + 1;
    return null; // (stand, and look again in a moment)
}

/**
 * Ask one standing in the way to step aside: off the walker's line, on the side it already is
 * (`ref._makeWay = {x, z, t}` — the systems that move it do the step: makeWayStep).
 */
export function askWay(o, p, u) {
    const ref = o.ref || o;
    if (!ref || typeof ref !== 'object' || Math.hypot(o.vx || 0, o.vz || 0) > 0.4) return;
    const lat = (o.x - p.x) * -u.z + (o.z - p.z) * u.x;
    const side = lat >= 0 ? 1 : -1;
    ref._makeWay = { x: -u.z * side, z: u.x * side, t: 1.2 };
}

/**
 * The step aside of one asked to make way (m to move now along {x, z}, or null). Its system checks
 * the room and moves it; t runs down.
 */
export function makeWayStep(c, dt, speed = 0.9) {
    const w = c._makeWay;
    if (!w) return null;
    w.t -= dt;
    if (w.t <= 0) { c._makeWay = null; return null; }
    return { x: w.x * speed * dt, z: w.z * speed * dt };
}

/** Is `o` in the way of a 1.8 m step from p along (dx, dz)? */
function blocks(p, dx, dz, o, R) {
    const ox = o.x - p.x, oz = o.z - p.z;
    const f = ox * dx + oz * dz;
    if (f < -0.2 || f > 1.8 + o.r) return false;
    return Math.abs(ox * -dz + oz * dx) < R + o.r + 0.1;
}

/** A number for anything that names a creature (a number as is; a string hashed). */
export function numId(id) {
    if (typeof id === 'number') return Math.abs(id);
    if (typeof id !== 'string') return null;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return Math.abs(h);
}

/** A walker's own body as the crowd knows it — for skipping itself in `near`. */
export const bodyOf = (ref) => ({ ref });
