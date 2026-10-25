/**
 * pilotsim.mjs — walking scenarios for Pilot.js without the game (pure Node): corridors, doorways, a crowd round a player, crossings.
 *   node tools/pilotsim.mjs [--only corridor] [--v]
 * Each scenario reports: arrived, the deepest overlap of two bodies (m; ≤ 0.05 is touching), the longest stand of any walker (s).
 * tests/unit/pilot.test.js runs the same scenarios and holds the numbers.
 */
import { pilot, newPilotState, separate } from '../src/game/Pilot.js';
import { steer as oldSteer } from '../src/game/Crowd.js';
import { SPACE } from '../src/game/PersonalSpace.js';

let OLD = false; // the old Avoid.js-based steer, for comparison (--old)
export const useOld = (on) => { OLD = on; };

const DT = 1 / 30;

/** A walker: { id, x, z, r, speed, goals:[{x,z,stop}], rank } */
export function simulate({ room, agents, fixed = [], seconds = 120, onFrame = null }) {
    const S = agents.map((a) => ({ ...a, st: newPilotState(), vx: 0, vz: 0, gi: 0, done: false, doneAt: null, stillT: 0, maxStill: 0, lastX: a.x, lastZ: a.z, winX: a.x, winZ: a.z, winT: 0 }));
    let minGap = Infinity, deepest = 0;
    const bodiesFor = (me) => {
        const out = [];
        for (const o of S) if (o !== me) out.push({ x: o.x, z: o.z, r: o.r, vx: o.vx, vz: o.vz, id: o.id, ref: o, pilot: o.st, rank: o.rank || 0, still: Math.hypot(o.vx, o.vz) < 0.2 });
        for (const f of fixed) out.push({ x: f.x, z: f.z, r: f.r, vx: 0, vz: 0, id: f.id ?? 'fixed', ref: f, fixed: true, still: true });
        return out;
    };
    let t = 0, unsticks = 0;
    for (; t < seconds; t += DT) {
        for (const a of S) {
            if (a.done) { a.vx = a.vz = 0; continue; }
            const g = a.goals[a.gi];
            let dx = g.x - a.x, dz = g.z - a.z, d = Math.hypot(dx, dz);
            if (d <= (g.stop ?? 0.4)) {
                if (a.gi < a.goals.length - 1) { a.gi++; continue; }
                a.done = true; a.doneAt = t; a.vx = a.vz = 0; continue;
            }
            const u = { x: dx / d, z: dz / d };
            const others = bodiesFor(a).filter((b) => Math.abs(b.x - a.x) < 17 && Math.abs(b.z - a.z) < 17);
            const res = OLD ? oldSteer(a.st, a, u, { others, r: a.r, speed: a.speed, dt: DT, maxF: d - (g.stop ?? 0.4), room, id: a.id }) : pilot(a.st, a, u, others, { r: a.r, speed: a.speed, dt: DT, maxF: d - (g.stop ?? 0.4), room, id: a.id, rank: a.rank || 0, clock: t, askWay: (o, p, uu) => { if (o.ref && !o.fixed) o.ref.makeWay = { x: -uu.z * (((o.x - p.x) * -uu.z + (o.z - p.z) * uu.x) >= 0 ? 1 : -1), z: uu.x * (((o.x - p.x) * -uu.z + (o.z - p.z) * uu.x) >= 0 ? 1 : -1), t: 1.2 }; } });
            if (!res) { a.vx = a.vz = 0; }
            else if (res.unstick) { a.x = res.unstick.x; a.z = res.unstick.z; a.vx = a.vz = 0; unsticks++; }
            else {
                const sp = a.speed * (res.k ?? 1);
                const nx = a.x + res.x * sp * DT, nz = a.z + res.z * sp * DT;
                if (room(nx, nz) && room(nx + res.x * 0.4, nz + res.z * 0.4)) { a.vx = res.x * sp; a.vz = res.z * sp; a.x = nx; a.z = nz; }
                else if (room(nx, a.z)) { a.vx = res.x * sp; a.vz = 0; a.x = nx; }
                else if (room(a.x, nz)) { a.vx = 0; a.vz = res.z * sp; a.z = nz; }
                else { a.vx = a.vz = 0; }
            }
        }
        // asked to make way: a step aside
        for (const a of S) if (a.makeWay) {
            a.makeWay.t -= DT;
            if (a.makeWay.t <= 0) a.makeWay = null;
            else { const nx = a.x + a.makeWay.x * 0.9 * DT, nz = a.z + a.makeWay.z * 0.9 * DT; if (room(nx, nz)) { a.x = nx; a.z = nz; } }
        }
        // the hard guarantee: bodies never stay in each other
        for (const a of S) {
            const others = bodiesFor(a).filter((b) => Math.abs(b.x - a.x) < 3 && Math.abs(b.z - a.z) < 3);
            const p = separate(a, a.r, others, { id: a.id, yield: a.done });
            if (p.x || p.z) {
                if (room(a.x + p.x, a.z + p.z)) { a.x += p.x; a.z += p.z; }
                else if (room(a.x + p.x * 0.5, a.z + p.z * 0.5)) { a.x += p.x * 0.5; a.z += p.z * 0.5; }
                else if (room(a.x + p.x, a.z)) a.x += p.x;
                else if (room(a.x, a.z + p.z)) a.z += p.z;
            }
        }
        // metrics
        for (let i = 0; i < S.length; i++) {
            const a = S[i];
            for (let j = i + 1; j < S.length; j++) { const b = S[j]; const gap = Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r; if (gap < minGap) minGap = gap; if (-gap > deepest) deepest = -gap; }
            for (const f of fixed) { const gap = Math.hypot(a.x - f.x, a.z - f.z) - a.r - f.r; if (gap < minGap) minGap = gap; if (-gap > deepest) deepest = -gap; }
            // a stand: under 0.25 m moved in the last 1.5 s while a goal is still far
            if (!a.done) {
                a.winT += DT;
                if (a.winT >= 1.5) {
                    const g = a.goals[a.gi];
                    const moved = Math.hypot(a.x - a.winX, a.z - a.winZ);
                    const far = Math.hypot(g.x - a.x, g.z - a.z) > (g.stop ?? 0.4) + 1.2;
                    if (moved < 0.25 && far) a.stillT += a.winT; else a.stillT = 0;
                    if (a.stillT > a.maxStill) a.maxStill = a.stillT;
                    a.winT = 0; a.winX = a.x; a.winZ = a.z;
                }
            }
        }
        if (onFrame) onFrame(t, S);
        if (S.every((a) => a.done)) break;
    }
    const arrived = S.filter((a) => a.done).length;
    return { arrived, total: S.length, deepestOverlap: +deepest.toFixed(3), minGap: +minGap.toFixed(3), maxStand: +Math.max(0, ...S.map((a) => a.maxStill)).toFixed(1), time: +t.toFixed(1), unsticks, agents: S };
}

// ------------------------------------------------------------------ scenarios
const rect = (x0, z0, x1, z1) => (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
const anyOf = (...f) => (x, z) => f.some((g) => g(x, z));

/** Two rooms joined by a corridor of width w and length len (along x). Walkers cross both ways. */
export function corridor(w = 1.6, len = 14, n = 4, rooms = 9) {
    const room = anyOf(rect(-rooms, -rooms / 2, 0, rooms / 2), rect(0, -w / 2, len, w / 2), rect(len, -rooms / 2, len + rooms, rooms / 2));
    const agents = [];
    for (let i = 0; i < n; i++) {
        agents.push({ id: 'L' + i, x: -2 - (i % 3) * 1.6, z: -2.4 + ((i / 3) | 0) * 2.4, r: 0.5, speed: 1.6, goals: [{ x: 0.2, z: 0, stop: 1.6 }, { x: len - 0.2, z: 0, stop: 1.6 }, { x: len + 4 + (i % 3) * 1.5, z: -3 + ((i / 3) | 0) * 3, stop: 1.0 }] });
        agents.push({ id: 'R' + i, x: len + 2 + (i % 3) * 1.6, z: -2.4 + ((i / 3) | 0) * 2.4, r: 0.5, speed: 1.6, goals: [{ x: len - 0.2, z: 0, stop: 1.6 }, { x: 0.2, z: 0, stop: 1.6 }, { x: -4 - (i % 3) * 1.5, z: -3 + ((i / 3) | 0) * 3, stop: 1.0 }] });
    }
    return { room, agents };
}

/** A wall with a doorway of width w, a crowd on each side going through, both ways. */
export function doorway(w = 1.4, n = 6) {
    const room = (x, z) => Math.abs(x) <= 12 && Math.abs(z) <= 8 && !(Math.abs(x) < 0.4 && Math.abs(z) > w / 2);
    const agents = [];
    for (let i = 0; i < n; i++) {
        agents.push({ id: 'a' + i, x: -4 - (i % 3) * 1.3, z: -3 + ((i / 3) | 0) * 1.5, r: 0.5, speed: 1.6, goals: [{ x: 0, z: 0, stop: 1.4 }, { x: 4 + (i % 3) * 1.6, z: -3 + ((i / 3) | 0) * 2, stop: 1.0 }] });
        agents.push({ id: 'b' + i, x: 4 + (i % 3) * 1.3, z: -3 + ((i / 3) | 0) * 1.5, r: 0.5, speed: 1.6, goals: [{ x: 0, z: 0, stop: 1.4 }, { x: -4 - (i % 3) * 1.6, z: -3 + ((i / 3) | 0) * 2, stop: 1.0 }] });
    }
    return { room, agents };
}

/** n followers come to a standing player (r 0.6): where do they end up? (stop = the distance they keep.) */
export function aroundPlayer(n = 10, stop = 2.4) {
    const room = (x, z) => Math.abs(x) < 30 && Math.abs(z) < 30;
    const agents = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.3, d = 12 + (i % 4) * 2;
        agents.push({ id: 'k' + i, x: Math.cos(a) * d, z: Math.sin(a) * d, r: 0.7, speed: 1.8, rank: 1, goals: [{ x: 0, z: 0, stop }] });
    }
    return { room, agents, fixed: [{ x: 0, z: 0, r: 0.6, id: 'player' }] };
}

/** Everyone on a circle goes to the opposite point. */
export function crossing(n = 24, R = 10) {
    const room = (x, z) => Math.abs(x) < 40 && Math.abs(z) < 40;
    const agents = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        agents.push({ id: 'c' + i, x: Math.cos(a) * R, z: Math.sin(a) * R, r: 0.5, speed: 1.5, goals: [{ x: -Math.cos(a) * R, z: -Math.sin(a) * R, stop: 0.6 }] });
    }
    return { room, agents };
}

/** A one-wide passage with a pocket to pull into 6 m back: two meet head-on in it. */
export function headOn() {
    const room = anyOf(rect(-6, -3, 0, 3), rect(0, -0.55, 16, 0.55), rect(16, -3, 22, 3), rect(5, 0.55, 7, 2));
    return { room, agents: [
        { id: 'A', x: -2, z: 0, r: 0.5, speed: 1.6, goals: [{ x: 20, z: 0, stop: 0.5 }] },
        { id: 'B', x: 18, z: 0, r: 0.5, speed: 1.6, goals: [{ x: -4, z: 0, stop: 0.5 }] },
    ] };
}

/** A narrow stair-like passage 1.3 wide, 20 m long, 3 each way, no pockets: the hardest. */
export function stairs(w = 1.3) {
    const room = anyOf(rect(-8, -3, 0, 3), rect(0, -w / 2, 20, w / 2), rect(20, -3, 28, 3));
    const agents = [];
    for (let i = 0; i < 3; i++) {
        agents.push({ id: 'u' + i, x: -2 - i * 1.4, z: 0, r: 0.5, speed: 1.4, goals: [{ x: 0.2, z: 0, stop: 1.4 }, { x: 19.8, z: 0, stop: 1.4 }, { x: 24 + i * 1.5, z: (i - 1) * 1.8, stop: 1.0 }] });
        agents.push({ id: 'd' + i, x: 22 + i * 1.4, z: 0, r: 0.5, speed: 1.4, goals: [{ x: 19.8, z: 0, stop: 1.4 }, { x: 0.2, z: 0, stop: 1.4 }, { x: -4 - i * 1.5, z: (i - 1) * 1.8, stop: 1.0 }] });
    }
    return { room, agents };
}

export const SCENARIOS = {
    'коридор 1,6 м': () => corridor(1.6),
    'коридор 1,6 м, давка 6+6': () => corridor(1.6, 14, 6),
    'дверь 3 м, давка 10+10': () => doorway(3, 10),
    'коридор 2 м': () => corridor(2),
    'коридор 3 м': () => corridor(3),
    'дверь 1,4 м': () => doorway(1.4),
    'дверь 3 м': () => doorway(3),
    'вокруг игрока': () => aroundPlayer(),
    'вокруг говорящего (новое расстояние)': () => aroundPlayer(10, SPACE.FOLLOW_R0),
    'перекрёсток': () => crossing(),
    'встреча в проходе с карманом': () => headOn(),
    'узкая лестница 1,3 м': () => stairs(1.3),
    'узкая лестница 2 м': () => stairs(2),
};

if (process.argv[1] && process.argv[1].endsWith('pilotsim.mjs')) {
    if (process.argv.includes('--old')) useOld(true);
    const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
    for (const [name, make] of Object.entries(SCENARIOS)) {
        if (only && !name.includes(only)) continue;
        const sc = make();
        const r = simulate({ ...sc, seconds: 180 });
        console.log(`${name.padEnd(32)} дошли ${r.arrived}/${r.total} за ${String(r.time).padStart(5)} с | глубже всего вошли друг в друга ${String(r.deepestOverlap).padStart(5)} м | дольше всех стояли ${String(r.maxStand).padStart(5)} с | выставлено на место ${r.unsticks}`);
        if (process.argv.includes('--v')) for (const a of r.agents.filter((x) => !x.done)) console.log('   не дошёл', a.id, a.x.toFixed(1), a.z.toFixed(1));
    }
}
