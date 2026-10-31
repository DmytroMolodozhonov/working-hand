/**
 * monsterrig.mjs — the monster form (×7) walking the world's REAL ground without a browser: the game's own body (VoxelCharacter.update),
 * the game's own wall code (Collision.resolveCylinder with the monster's radius, as Game._resolveMe), MonsterTransform itself
 * (hops over ledges, squeezing through cracks, lifting out — MonsterClimb.js). For tools/monsterwalkbench.mjs and tests/unit/monster-climb-world.test.js.
 */
import * as THREE from 'three';
import { TerrainData } from '../src/world/Terrain.js';
import { CollisionWorld } from '../src/world/Collision.js';
import { VoxelCharacter, PLAYER_GROUND_OFFSET, BODY_H } from '../src/entities/Character.js';
import { MonsterTransform } from '../src/game/MonsterTransform.js';
import { MONSTER } from '../src/game/MonsterForm.js';

const PLAYER_RADIUS = 0.48;
/** Chunk boxes of the scarlet canyons in the seed 20261015 (found by a scan; other seeds: pass `regions`). */
export const MESA_REGIONS = [{ cx0: -60, cx1: -40, cz0: -60, cz1: -36 }, { cx0: 36, cx1: 60, cz0: -60, cz1: -36 }];
const iround = Math.round;

export function makeWorld({ seed = 20261015 } = {}) {
    const T = new TerrainData();
    T.generate({ seed, mountains: true, seas: true, deepCaves: true, lush: true, slopes: true, wizHuts: true, furnish: true, meshTrees: true });
    const col = new CollisionWorld(); col.setTerrain(T);
    return { T, col };
}

/** One monster on the ground at (x, z): a body, a game stand-in, the form already ×7 (the change itself is tested elsewhere). */
export function makeMonster(W, x, z, { climb = true } = {}) {
    const { T, col } = W;
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter(scene);
    const g = {
        scene, character: ch, terrain: { data: T }, collision: col, config: { mode: 'creative' }, localId: 'me', authority: true,
        combat: { enabled: false, hp: 500, maxHp: 500, fatigue: 0, dead: false, frozen: false }, playerHP: 500, maxHP: 500,
        items: { held: { left: null, right: null }, loose: new Map() }, weapons: { hands: { left: {}, right: {} } },
        hud: { setVoice() {}, setMonsterTimer() {}, toast() {} }, fx: { shake: 0, spark() {}, debrisFrom() {} },
        sound: { playGiantStep() {}, playCrack() {}, playCollapse() {}, playLand() {}, spellCast() {} }, sync: {},
        knock: { down: false }, flight: { busy: false },
        builder: { _sendEdits() {} }, castleLife: { alarm() {}, damaged() {}, breakWays() {} }, perf: { note: (t) => g.notes.push(t) }, notes: [],
        wards: { protects: () => false }, gravityK: 1, isDeadLocal: false,
    };
    g.monster = new MonsterTransform(g);
    if (!climb) g.monster._climbStep = () => {}; // (the old behaviour: only the step)
    const m = g.monster;
    m.phase = 'on'; m.left = 600; m.t = 0;
    ch.setSize(MONSTER.SCALE); ch.sizeRun = MONSTER.RUN_K; ch.jumpK = MONSTER.JUMP_K;
    const top = T.floorBelow(iround(x), iround(z), T.topLayer(iround(x), iround(z))) - 0.5;
    ch.group.position.set(x, top + PLAYER_GROUND_OFFSET * MONSTER.SCALE, z);
    ch.onGround = true;
    g._lastFree = ch.group.position.clone();
    return g;
}

/** The game's _bodyInRock / _resolveMe for the monster (Game.js). */
function resolveMe(g, p) {
    const ch = g.character, S = ch.size || 1;
    g.monster.smashAt(p);
    const feet = p.y - PLAYER_GROUND_OFFSET * S;
    return g.collision.resolveCylinder(p, PLAYER_RADIUS * S * g.monster.squeeze, feet, ch.bodyHeight(), 1.05 * S + (ch.jumpAir ? 0.3 * S : 0), true, ch.bodyHeight(true));
}
function bodyInRock(g, p) {
    const T = g.terrain.data, ch = g.character, S = ch.size || 1;
    const feet = p.y - PLAYER_GROUND_OFFSET * S, ix = iround(p.x), iz = iround(p.z), reach = Math.floor(feet + 1.05 * S + 0.5 + 1e-9);
    const stand = Math.max(feet, T.floorBelow(ix, iz, reach) - 0.5);
    return T.solidIn(ix, iz, reach + 1, Math.floor(stand + ch.bodyHeight(true) + 1.5 - 1e-3));
}

/** One frame of the game's body for the monster walking at `yaw` (running if `go`). */
export function frame(g, dt, yaw, go = true) {
    const ch = g.character, p = ch.group.position;
    ch.group.rotation.y = yaw;
    ch.setRunning(go, 1);
    g.monster.update(dt);
    const fx = p.x, fz = p.z;
    ch.update(dt, g.collision, true);
    const dx = p.x - fx, dz = p.z - fz, d = Math.hypot(dx, dz);
    if (d > 0.25 && d < 40) { // (the walk in short pieces against the walls: Game.js)
        const n = Math.ceil(d / 0.25);
        p.x = fx; p.z = fz;
        for (let i = 0; i < n; i++) { p.x += dx / n; p.z += dz / n; resolveMe(g, p); }
    }
    resolveMe(g, p);
    if (bodyInRock(g, p)) { if (g._lastFree.distanceToSquared(p) < 400 * 49) { p.copy(g._lastFree); if (ch.verticalVelocity > 0) ch.verticalVelocity = 0; } }
    else g._lastFree.copy(p);
}

/**
 * A walk straight at (x1, z1) (the hero's body walks where it is turned): seconds until within `near` metres, or `max` s.
 * Also: the longest time without 2 m of way (`still`), hops, squeeze minimum, the notes of the journal.
 */
export function walk(g, x1, z1, { max = 120, near = 8, dt = 1 / 30 } = {}) {
    const ch = g.character, p = ch.group.position;
    let t = 0, still = 0, stillMax = 0, last = p.clone(), lastT = 0, sq = 1, maxStuck = 0;
    for (; t < max; t += dt) {
        const yaw = Math.atan2(-(x1 - p.x), -(z1 - p.z)); // (forward = (−sin, −cos))
        frame(g, dt, yaw, true);
        sq = Math.min(sq, g.monster.squeeze);
        maxStuck = Math.max(maxStuck, g.monster._stuckT || 0);
        if (t - lastT >= 1) { if (Math.hypot(p.x - last.x, p.z - last.z) < 2) still++; else still = 0; stillMax = Math.max(stillMax, still); last.copy(p); lastT = t; }
        if (Math.hypot(x1 - p.x, z1 - p.z) < near) return { ok: true, t, still: stillMax, hops: g.monster._hops || 0, squeezeMin: sq, maxStuck, notes: g.notes };
    }
    return { ok: false, t, still: stillMax, hops: g.monster._hops || 0, squeezeMin: sq, maxStuck, left: Math.hypot(x1 - p.x, z1 - p.z), notes: g.notes };
}

/** The ground columns of the scarlet canyons ("mesa"): a list of [x, z] taken on the chunks that are mostly mesa. */
export function mesaSpots(W, { n = 12, seed = 7, region = MESA_REGIONS[0] } = {}) {
    const { T } = W;
    let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const out = [];
    for (let k = 0; k < 4000 && out.length < n; k++) {
        const cx = region.cx0 + Math.floor(rnd() * (region.cx1 - region.cx0 + 1)), cz = region.cz0 + Math.floor(rnd() * (region.cz1 - region.cz0 + 1));
        const c = T.chunk(cx, cz);
        if (c.mesa[500] < 128) continue;
        const x = cx * 32 + 16 + Math.floor((rnd() - 0.5) * 24), z = cz * 32 + 16 + Math.floor((rnd() - 0.5) * 24);
        const wet = T.get(iround(x), T.topLayer(iround(x), iround(z)) + 1, iround(z)) === 8;
        if (wet) continue;
        out.push([x, z]);
    }
    return out;
}
/**
 * Canyons: columns on the mesa land with a wall at least `wall` m higher on BOTH sides of a gap at most `maxW` m wide
 * (across, one of 4 directions), with the gap running on for 20+ m. Returns [{x, z, ax, az, w}] — a point in the gap and the way along it.
 */
export function canyonSpots(W, { n = 12, wall = 8, maxW = 14, minW = 2, regions = MESA_REGIONS, seed = 5, run = 14 } = {}) {
    const { T } = W;
    const top = (x, z) => T.floorBelow(iround(x), iround(z), T.topLayer(iround(x), iround(z))) - 0.5;
    const out = [];
    let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 60000 && out.length < n; k++) {
        const region = regions[Math.floor(rnd() * regions.length)];
        const x = (region.cx0 + rnd() * (region.cx1 - region.cx0 + 1)) * 32, z = (region.cz0 + rnd() * (region.cz1 - region.cz0 + 1)) * 32;
        const c = T.chunk(Math.floor(x / 32), Math.floor(z / 32));
        if (c.mesa[((iround(z) & 31) * 32) + (iround(x) & 31)] < 128) continue;
        const y0 = top(x, z);
        for (const [ax, az] of [[1, 0], [0, 1], [0.7071, 0.7071], [0.7071, -0.7071]]) {
            const cx = -az, cz = ax; // across
            let a = 0, b = 0;
            for (let d = 1; d <= maxW && !a; d++) if (top(x + cx * d, z + cz * d) - y0 >= wall) a = d;
            for (let d = 1; d <= maxW && !b; d++) if (top(x - cx * d, z - cz * d) - y0 >= wall) b = d;
            const w = a + b;
            if (!a || !b || w < minW || w > maxW) continue;
            // the gap runs on along (ax, az): the floor stays low for 20 m in some direction
            let ok = 0;
            for (let d = 2; d <= run; d += 2) if (Math.abs(top(x + ax * d, z + az * d) - y0) < 4) ok++; else break;
            if (ok < run / 2) continue;
            if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 40)) continue;
            out.push({ x, z, ax, az, w });
            break;
        }
    }
    return out;
}
/** Dry land with little relief (spread ≤ 6 over w × d metres) near (x0, z0): [x, z] of its corner, or null. */
export function calmSpot(W, x0 = 200, z0 = 200, w = 170, d = 70) {
    const { T } = W;
    for (let r = 0; r < 4000; r += 30) for (let a = 0; a < 6.3; a += 0.6) {
        const x = Math.round(x0 + Math.cos(a) * r), z = Math.round(z0 + Math.sin(a) * r);
        let lo = 1e9, hi = -1e9, bad = false;
        for (let i = 0; i <= w && !bad; i += 10) for (let j = 0; j <= d; j += 10) {
            const ix = x + i, iz = z + j, top = T.topLayer(ix, iz);
            if (T.get(ix, top, iz) === 8 || T.get(ix, top + 1, iz) === 8) { bad = true; break; }
            lo = Math.min(lo, top); hi = Math.max(hi, top);
        }
        if (!bad && hi - lo <= 6) return [x, z];
    }
    return null;
}

/** Make a stretch exactly flat (the highest column of it): plain stone filled up to it — the scenes then differ only by what is built on it. */
export function flatten(W, x0, z0, w, d, level = null, block = 3) {
    const { T } = W;
    let hi = level ?? -1e9;
    if (level == null) for (let iz = z0; iz <= z0 + d; iz++) for (let ix = x0; ix <= x0 + w; ix++) hi = Math.max(hi, T.topLayer(ix, iz));
    for (let iz = z0; iz <= z0 + d; iz++) for (let ix = x0; ix <= x0 + w; ix++) {
        const top = T.topLayer(ix, iz);
        for (let L = top + 1; L <= hi; L++) T.set(ix, L, iz, block);
        for (let L = hi + 1; L <= top; L++) T.set(ix, L, iz, 0); // (a hump above: cut)
    }
    return hi;
}

/** Real blocks on real ground: a box of `block` from layer `y0` over the columns [x0..x1] × [z0..z1], `h` blocks up from the ground of (x0, z0). */
export function raise(W, x0, x1, z0, z1, h, block) {
    const { T } = W;
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
        const top = T.topLayer(ix, iz);
        for (let L = top + 1; L <= top + h; L++) T.set(ix, L, iz, block);
    }
}

/** A canyon along +x: two rock walls `h` high, the gap `w` wide (z from z0 to z0 + w), `len` long, from x0. Returns {start, goal}. */
export function canyon(W, x0, z0, w, h, len = 60, block = 3) {
    raise(W, x0, x0 + len, z0 - 14, z0 - 1, h, block);
    raise(W, x0, x0 + len, z0 + w, z0 + w + 13, h, block);
    return { start: [x0 - 40, z0 + w / 2 - 0.5], goal: [x0 + len + 30, z0 + w / 2 - 0.5] };
}

/** A ledge across the way: a plateau `h` high from x0 on, 40 m wide, 30 m deep. Returns {start, goal}. */
export function ledge(W, x0, z0, h, block = 3) {
    raise(W, x0, x0 + 30, z0 - 20, z0 + 20, h, block);
    return { start: [x0 - 40, z0], goal: [x0 + 50, z0] };
}
export { BODY_H };
