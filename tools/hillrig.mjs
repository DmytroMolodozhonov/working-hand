/**
 * hillrig.mjs — the real ground of the world's seed and the game's own walking code, without a browser (for tools/hillbench.mjs and
 * tests/unit/hill-walk.test.js). `makeRig({ seed, slopes })` → the trips of a man (`tripKnight`), of a party of the road (`tripRoad`),
 * of a zombie / a beast (`tripBody(kind)`), the picker of real hills (`pickTrips`) and the ground helpers.
 */
import * as THREE from 'three';
import { TerrainData } from '../src/world/Terrain.js';
import { CollisionWorld } from '../src/world/Collision.js';
import { CastleLife } from '../src/game/CastleLife.js';
import { Travelers } from '../src/game/Travelers.js';

export async function makeRig({ seed: SEED = 20261015, slopes: SLOPES = true } = {}) {
const HW = await import('../src/game/HillWay.js').catch(() => null); // (the slope pace and the watchdog: not in the old code)
let stuckLines = 0;
const t = new TerrainData();
t.generate({ seed: SEED, mountains: true, seas: true, deepCaves: true, lush: true, slopes: SLOPES, wizHuts: true, furnish: true, meshTrees: true });
const col = new CollisionWorld(); col.setTerrain(t);
const game = { world: { terrain: { data: t } }, collision: col, frameCount: 0, authority: true };
const L = Object.create(CastleLife.prototype); L.game = game; L._clock = 0;
const T = Object.create(Travelers.prototype); T.game = game; game.castleLife = L;
const warn = console.warn; console.warn = (...a) => { if (String(a[0]).includes('[stuck]')) stuckLines++; };
const rig_restore = () => { console.warn = warn; };
const iround = Math.round;
const top = (x, z) => t.floorBelow(iround(x), iround(z), t.topLayer(iround(x), iround(z)));
const gy = (x, z) => top(x, z) - 0.5;
const isWater = (x, z) => t.isSeaColumn?.(iround(x), iround(z)) || t.get(iround(x), t.topLayer(iround(x), iround(z)) + 1, iround(z)) === 8;
const inLand = (x, z) => { const idx = t.sites || t.castles; return !!(idx?.landAt && idx.landAt(iround(x), iround(z))); };

/** Is there a way at all (cells a man can stand on, 4-neighbours; ledges of two blocks are climbed)? */
function reachable(x0, z0, x1, z1) {
    const X0 = iround(Math.min(x0, x1)) - 40, X1 = iround(Math.max(x0, x1)) + 40, Z0 = iround(Math.min(z0, z1)) - 40, Z1 = iround(Math.max(z0, z1)) + 40;
    const W = X1 - X0 + 1, key = (x, z) => (z - Z0) * W + (x - X0), seen = new Uint8Array(W * (Z1 - Z0 + 1));
    const gx = iround(x1), gz = iround(z1), q = [[iround(x0), iround(z0)]];
    seen[key(q[0][0], q[0][1])] = 1;
    for (let i = 0; i < q.length; i++) {
        const [x, z] = q[i];
        if (Math.abs(x - gx) <= 4 && Math.abs(z - gz) <= 4) return true;
        const y = gy(x, z);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < X0 || nx > X1 || nz < Z0 || nz > Z1 || seen[key(nx, nz)]) continue;
            if (!L._walkable(nx, nz, y) && !L._walkable(nx, nz, y + 1)) continue;
            seen[key(nx, nz)] = 1; q.push([nx, nz]);
        }
    }
    return false;
}

/** The trips of a band: [x0, z0, x1, z1]. */
function pickTrips(lo, hi, n, rnd, maxStep = 2, needCliff = false) {
    const out = [];
    for (let k = 0; out.length < n && k < 400000; k++) {
        const x0 = (rnd() - 0.5) * 1600, z0 = (rnd() - 0.5) * 1600, a = rnd() * 6.2832, D = 60 + rnd() * 80;
        const x1 = x0 + Math.cos(a) * D, z1 = z0 + Math.sin(a) * D;
        if (isWater(x0, z0) || isWater(x1, z1) || inLand(x0, z0) || inLand(x1, z1)) continue;
        const m = Math.ceil(D), ys = [];
        let bad = false, mx = 0, gr = 0;
        for (let i = 0; i <= m && !bad; i++) { const xx = x0 + (x1 - x0) * i / m, zz = z0 + (z1 - z0) * i / m; ys.push(top(xx, zz)); if (isWater(xx, zz) || inLand(xx, zz)) bad = true; }
        if (bad) continue;
        for (let i = 1; i <= m; i++) mx = Math.max(mx, Math.abs(ys[i] - ys[i - 1]));
        for (let i = 6; i <= m; i++) gr = Math.max(gr, Math.abs(ys[i] - ys[i - 6]) / 6);
        if (mx > maxStep || gr < lo || gr >= hi || (needCliff && mx < 3)) continue;
        if (!reachable(x0, z0, x1, z1)) continue;
        out.push([x0, z0, x1, z1, D]);
    }
    return out;
}

const DT = 1 / 30, TMAX = 240;
const stillMeter = () => ({ x: NaN, z: NaN, t: 0, max: 0, ck: 0 });
function still(m, x, z, dt) { // (the longest time without 0.4 m of way)
    m.ck += dt;
    if (m.ck < 1) return;
    m.ck = 0;
    if (Math.hypot(x - m.x, z - m.z) < 0.4) { m.t += 1; m.max = Math.max(m.max, m.t); } else m.t = 0;
    m.x = x; m.z = z;
}

/** A man (knight) straight to the goal by his own steps — what every walker of the castles does. */
function tripKnight(x0, z0, x1, z1) {
    const v = { x: x0, z: z0, y: gy(x0, z0), yaw: 0, id: 1, role: 'knight', speed: 0, hp: 10 };
    const st = stillMeter();
    for (let tm = 0; tm < TMAX; tm += DT) {
        L._clock = tm; game.frameCount++;
        if (Math.hypot(x1 - v.x, z1 - v.z) < 1.5) return { ok: true, tm, still: st.max };
        if (v.climb) L._climbStep(v, DT); else { L._steer(v, x1, z1, 2.3, DT, 0.5); L._ground(v); }
        HW?.trackSlope(v);
        still(st, v.x, v.z, DT);
    }
    return { ok: false, tm: TMAX, still: st.max };
}

/** A party of the road: a leader (Travelers.step: the heading, the route round) and a follower after him. */
function tripRoad(x0, z0, x1, z1) {
    const mk = (id, dx) => ({ x: x0 + dx, z: z0 + dx, y: gy(x0 + dx, z0 + dx), yaw: 0, id, role: 'knight', speed: 0, hp: 10, walk: 2.3, job: 'road', dead: false, talking: 0 });
    const a = mk(1, 0), b = mk(2, 2);
    const P = { id: 'road' + Math.round(x0), kind: 'knights', state: 'go', dest: { x: x1, z: z1, r: 6 }, members: [a, b] };
    a.party = b.party = P;
    T._arrive = (p) => { p.state = 'arrived'; };
    L._players = () => [{ id: 'me', p: { x: a.x, z: a.z } }];
    L._nearestFree = () => null;
    const sa = stillMeter(), sb = stillMeter();
    let lagMax = 0;
    for (let tm = 0; tm < TMAX; tm += DT) {
        L._clock = tm; game.frameCount++;
        for (const v of [a, b]) {
            if (v.climb) L._climbStep(v, DT); else T.step(v, DT);
            HW?.trackSlope(v);
        }
        still(sa, a.x, a.z, DT);
        lagMax = Math.max(lagMax, Math.hypot(a.x - b.x, a.z - b.z));
        if (P.state === 'arrived') return { ok: true, tm, still: sa.max, lag: lagMax };
    }
    return { ok: false, tm: TMAX, still: sa.max, lag: lagMax };
}

const BODY = { zombie: { r: 0.88, step: 1.05, h: 3.5, gOff: 1.0, sp: 2.4 }, pig: { r: 0.6, step: 1.1, h: 2, gOff: 0.5, sp: 2.0 } };
/** A zombie / a beast straight to the goal (resolveCylinder pushes it out of walls, the ground carries it). */
function tripBody(kind) {
    const B = BODY[kind];
    return (x0, z0, x1, z1) => {
        const p = new THREE.Vector3(x0, col.groundAt(x0, z0, 1e3) + B.gOff, z0), st = stillMeter();
        for (let tm = 0; tm < TMAX; tm += DT) {
            const dx = x1 - p.x, dz = z1 - p.z, d = Math.hypot(dx, dz);
            if (d < 1.5) return { ok: true, tm, still: st.max };
            p.x += dx / d * B.sp * DT; p.z += dz / d * B.sp * DT;
            col.resolveCylinder(p, B.r, p.y - B.gOff, B.h, B.step);
            const g = col.groundAt(p.x, p.z, p.y - B.gOff + 1.1) + B.gOff;
            p.y = p.y > g + 0.05 ? Math.max(g, p.y - 0.4) : g;
            still(st, p.x, p.z, DT);
        }
        return { ok: false, tm: TMAX, still: st.max };
    };
}


return { t, col, L, T, HW, top, gy, isWater, inLand, reachable, pickTrips, tripKnight, tripRoad, tripBody, BODY, DT, TMAX, stuckLines: () => stuckLines, resetStuck: () => { stuckLines = 0; }, restore: rig_restore };
}
