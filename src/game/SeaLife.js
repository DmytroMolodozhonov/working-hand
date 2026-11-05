/**
 * SeaLife.js — the creatures of the sea (the sea update, the author 05.11: «подводный мир океана: рыбы, акулы, дельфины, магические»).
 * Each is an animal of Animals.js (types 'shark', 'dolphin', 'glowfin' — every spell, blow, blast, Leviosa, the carcass, the meat, the
 * network and the save already know the animals); this file is how they live under the water. Models — SeaModels.js.
 *
 *   shark    out in the open sea, alone or a pair, cruising at mid depth. It leaves a swimmer alone — only one who HURT it it comes for:
 *            circles, and bites (BITE, its jaw opening), then sheers off and comes again (Animals.hit: state 'attack' for 15 s).
 *            Hit — it fights back. Nobody in the water — it never leaves it (a deck, a beach, the air are safe).
 *   dolphin  a pod of 3–6 near the surface, swimming together; now and then one leaps out of the water in an arc (a splash, its clicks);
 *            curious — it comes to a swimmer and swims round them; harmless. Hit — the pod flees.
 *   glowfin  «Светлохвост», the magic fish of the deep: rare (1 in GLOW_CHANCE places), alone, slow over the bottom, lit from within
 *            (brighter at night); a person within SHY m — it darts off. Killed — its tail falls (the item 'glowfinTail': the potion of
 *            the mermaid wants it). A magic creature (Mana.creditKill).
 *   all      only where the sea is deep (DEPTH layers+, never a lake); they keep in the water (between the bottom and the surface),
 *            never through the ground; a waterspout near — they flee it and dive (OceanStorm.nearSpout); thrown out of the water (a
 *            blast, Leviosa let go) — they flop and die slowly on land, or slip back where water is close; dead — the body floats up
 *            and lies belly up on the surface.
 * The host decides (Animals: think on the host; the guests get their place, yaw and pitch, and pose them here).
 */
import * as THREE from 'three';
import { waterAt } from './CreatureSwim.js';
import { hash01 } from '../world/Castles.js';
import { newUid } from './ItemTypes.js';
import { GLOW } from './SeaModels.js';

export const SEA_LIFE = {
    CELL: 80, // the herd cells (Animals' own size)
    SITE_CHANCE: 0.2, // of the cells: a sea creature's place is tried (it stays only where the sea is deep)
    GLOW_CHANCE: 0.07, // of the places: a glowfin
    SHARK_CHANCE: 0.12, // of the places: sharks (the rest dolphins) — rare (the author 05.11: «сразу приплыли ко мне акулы… нафига? лучше пусть интересные рыбки»)
    SHARK_SHY: 16, // m: a shark not angry keeps this far from a swimmer — it turns away
    DEPTH: 6, // water layers at least
    GLOW_DEPTH: 9,
    WANDER: 45, // m round home
    SPEED: { shark: [2.2, 7.5], dolphin: [3, 9], glowfin: [1.2, 8] }, // m/s cruising / at full
    TURN: { shark: 1.0, dolphin: 1.6, glowfin: 1.3 }, // rad/s
    HUNT: 32, // m: (kept for the tools) how far a shark smelled a swimmer — it hunts no more: only one who hurt it (Animals.hit)
    BITE: 3, BITE_R: 2.8, BITE_EVERY: 1.6,
    CURIOUS: 26, // m: a dolphin comes to a swimmer
    SHY: 14, // m: a glowfin darts off
    LEAP_EVERY: [6, 16], // s between a dolphin's leaps
    BEACHED_HURT: 0.5, // hp a second on the land
};

const _sp = new THREE.Vector3(), _sv = new THREE.Vector3();
const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const rr = (a, b) => a + Math.random() * (b - a);
export const SEA_TYPES = new Set(['shark', 'dolphin', 'glowfin']);
export const isSeaType = (type) => SEA_TYPES.has(type);

/** The sea creatures' place of a herd cell (gx, gz) of a world (seed), or null — before the sea is checked (SeaLife.siteWater). */
export function seaSiteAt(gx, gz, seed, CELL = SEA_LIFE.CELL) {
    if (hash01(gx, gz, seed + 12301) >= SEA_LIFE.SITE_CHANCE) return null;
    const r = hash01(gx, gz, seed + 12302);
    const type = r < SEA_LIFE.GLOW_CHANCE ? 'glowfin' : r < SEA_LIFE.GLOW_CHANCE + SEA_LIFE.SHARK_CHANCE ? 'shark' : 'dolphin';
    const k = hash01(gx, gz, seed + 12303);
    const n = type === 'glowfin' ? 1 : type === 'shark' ? (k < 0.7 ? 1 : 2) : 3 + Math.floor(k * 4);
    return { key: 'm' + gx + ',' + gz, gx, gz, sea: true, type, n, x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL };
}

/** Calls fn(site) for every sea creatures' place within r m of (x, z). */
export function seaSitesNear(x, z, r, seed, fn, CELL = SEA_LIFE.CELL) {
    for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++) {
        for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++) {
            const s = seaSiteAt(gx, gz, seed, CELL);
            if (s && Math.hypot(s.x - x, s.z - z) <= r + CELL * 0.5) fn(s);
        }
    }
}

/** Deep sea water at (x, z): {surface, bottom, depth} | null. `t`: TerrainData. */
export function deepSeaAt(t, x, z, depth = SEA_LIFE.DEPTH) {
    if (!t?.floorBelow) return null;
    const ix = Math.round(x), iz = Math.round(z);
    if (t.isSeaColumn && !t.isSeaColumn(ix, iz)) return null; // (a lake is no sea)
    const w = waterAt(t, ix, iz, 40);
    return w && w.depth >= depth ? w : null;
}

/** The depth band (y) a kind keeps to in water w: [lo, hi]. */
export function band(type, w) {
    if (type === 'dolphin') return [Math.max(w.bottom + 1.5, w.surface - 4), w.surface - 1];
    if (type === 'glowfin') return [w.bottom + 1, Math.min(w.surface - 2, w.bottom + 5)];
    return [w.bottom + 2, w.surface - 2]; // (the shark: the middle)
}

export class SeaLife {
    constructor(animals) {
        this.A = animals;
        this.game = animals.game;
        this.t = 0;
    }

    get T() { return this.game.terrain?.data; }

    /** (host) The water of a sea place: a deep sea spot in its cell. → true / false / null (the land not made yet). */
    siteWater(r) {
        const t = this.T;
        if (!t) return false;
        const seed = this.game.seed || 1, C = SEA_LIFE.CELL;
        const need = r.type === 'glowfin' ? SEA_LIFE.GLOW_DEPTH : SEA_LIFE.DEPTH;
        for (let k = 0; k < 10; k++) {
            const x = r.gx * C + 8 + hash01(r.gx * 31 + k, r.gz, seed + 12310) * (C - 16), z = r.gz * C + 8 + hash01(r.gx, r.gz * 31 + k, seed + 12311) * (C - 16);
            if (t.landMade && !t.landMade(Math.round(x), Math.round(z))) return null;
            if (deepSeaAt(t, x, z, need)) { r.x = x; r.z = z; return true; }
        }
        return false;
    }

    /** (host) A pod / a pair / one at its place, at its depth. */
    spawnGroup(r) {
        const A = this.A, t = this.T, out = [];
        const herd = { x: r.x, z: r.z, hx: r.x, hz: r.z, id: Math.floor(Math.random() * 1e9), leader: null, sea: true };
        const yaw = Math.random() * Math.PI * 2;
        for (let i = 0; i < r.n; i++) {
            const a0 = yaw + i * 1.3, d = i ? 3 + i * 2.2 : 0;
            let x = r.x + Math.cos(a0) * d, z = r.z + Math.sin(a0) * d;
            let w = deepSeaAt(t, x, z, 3);
            if (!w) { x = r.x; z = r.z; w = deepSeaAt(t, x, z, 3); }
            if (!w) continue;
            const [lo, hi] = band(r.type, w);
            const a = A._spawn(r.type, new THREE.Vector3(x, (lo + hi) / 2, z), { herd, yaw: yaw + (Math.random() - 0.5) * 0.5 });
            a.home = { x: r.x, z: r.z };
            a.target.set(x, (lo + hi) / 2, z);
            a.leapT = rr(...SEA_LIFE.LEAP_EVERY);
            out.push(a);
        }
        herd.leader = out[0]?.id ?? null;
        return out;
    }

    /** The water column under a creature (cached for a moment: a few block reads a step). */
    water(a) {
        const p = a.group.position, c = a._wc;
        if (c && Math.abs(c.x - p.x) < 0.7 && Math.abs(c.z - p.z) < 0.7 && (a.t || 0) - c.t < 0.5) return c.w;
        const t = this.T;
        const w = t ? waterAt(t, p.x, p.z, p.y) : null;
        a._wc = { x: p.x, z: p.z, t: a.t || 0, w };
        return w;
    }

    /** (host) One step of a sea creature's life. */
    think(a, dt) {
        const A = this.A, g = this.game, p = a.group.position;
        a.t = (a.t || 0) + dt;
        if (a.leap) { this._leapStep(a, dt); return; }
        const w = this.water(a);
        if (!w || w.depth < 1.5 || p.y > w.surface + 0.3) { this._beached(a, dt, w); return; }
        a.beached = 0;
        const [lo, hi] = band(a.type, w);
        let speed = SEA_LIFE.SPEED[a.type][0], tx = a.target.x, ty = a.target.y, tz = a.target.z;
        // a waterspout near: away from it and down
        const sp = g.oceanStorm?.nearSpout?.(p.x, p.z, 25);
        if (sp) { const dx = p.x - sp.x, dz = p.z - sp.z, l = Math.hypot(dx, dz) || 1; tx = p.x + dx / l * 30; tz = p.z + dz / l * 30; ty = lo; speed = SEA_LIFE.SPEED[a.type][1]; }
        else if (a.state === 'flee') {
            a.stateT -= dt;
            const from = A._playerPos(a.attacker) || a.scareFrom;
            if (a.stateT <= 0 || !from) { a.state = 'graze'; a.attacker = null; }
            else { const dx = p.x - from.x, dz = p.z - from.z, l = Math.hypot(dx, dz) || 1; tx = p.x + dx / l * 25; tz = p.z + dz / l * 25; ty = a.type === 'dolphin' ? hi : lo; speed = SEA_LIFE.SPEED[a.type][1]; }
        } else if (a.type === 'shark') {
            const r = this._shark(a, dt, w);
            if (r) { tx = r.x; ty = r.y; tz = r.z; speed = r.speed; }
        } else if (a.type === 'dolphin') {
            const r = this._dolphin(a, dt, w);
            if (r === 'leap') return;
            if (r) { tx = r.x; ty = r.y; tz = r.z; speed = r.speed; }
        } else if (a.type === 'glowfin') {
            const near = this._nearSwimmer(a, SEA_LIFE.SHY);
            if (near) { a.state = 'flee'; a.scareFrom = { x: near.p.x, z: near.p.z }; a.stateT = 6; a.attacker = near.id; g.sound?.playSea?.(p, 'chime', 0.6); }
        }
        if (a.state === 'graze' && !sp && a.servantOf == null && !(a.type === 'shark' && a.hunt) && !a.curious) {
            // calm: towards its wander point; a new one when there (in the deep sea round home, at its depth)
            if (Math.hypot(a.target.x - p.x, a.target.z - p.z) < 3 || (a.wanderT = (a.wanderT ?? 0) - dt) <= 0) this._wander(a, w);
            tx = a.target.x; ty = a.target.y; tz = a.target.z;
            // a pod keeps together: towards its leader
            const L = a.herd?.leader != null && a.herd.leader !== a.id ? A.byId.get(a.herd.leader) : null;
            if (L && !L.dead && L.group.position.distanceTo(p) > 9) { tx = L.group.position.x; tz = L.group.position.z; ty = L.group.position.y; }
        }
        ty = Math.max(lo, Math.min(hi, ty));
        this._swim(a, dt, tx, ty, tz, speed, w);
    }

    /** A player / a guest in the water near (within r): {id, p, d, hurt} | null. */
    _nearSwimmer(a, r) {
        const g = this.game, p = a.group.position;
        let best = null;
        const look = (id, q, hurt) => {
            if (!q) return;
            const d = Math.hypot(q.x - p.x, q.z - p.z, q.y - p.y);
            if (d > r * (hurt ? 2 : 1)) return;
            const w = waterAt(this.T, q.x, q.z, q.y);
            if (!w || q.y - 2 > w.surface) return; // (not in the water: on a deck, on the beach, in the air)
            if (!best || d < best.d) best = { id, p: q, d, hurt };
        };
        if (!g.isDeadLocal && !g.combat?.dead) look(g.localId, g.character.group.position, (g.combat?.hp ?? 100) < (g.combat?.maxHp ?? 100) * 0.5);
        for (const [id, rm] of g.remotes || []) if (!rm.dead) look(id, rm.position, (rm.hp ?? 100) < 10);
        return best;
    }

    /** The shark: cruise; a swimmer near — come, circle, bite, sheer off, come again. → a target or null. */
    _shark(a, dt, w) {
        const A = this.A, g = this.game, p = a.group.position;
        let prey = null;
        if (a.state === 'attack' && a.attacker != null) { const q = A._playerPos(a.attacker); if (q) prey = { id: a.attacker, p: q, d: q.distanceTo(p) }; if ((a.stateT -= dt) <= 0) { a.state = 'graze'; a.attacker = null; } }
        // (no hunting of its own: a shark goes for one who hurt it, never a swimmer passing by — the author 05.11: «акулы нападают только
        //  тогда, когда ты на них нападаешь»; Animals.hit turns it on the attacker)
        a.hunt = !!prey;
        a.biteT = (a.biteT || 0) - dt;
        a.biteK = Math.max(0, (a.biteK || 0) - dt * 3);
        if (!prey) {
            // (left alone it keeps its distance: a swimmer near — it turns and glides off, never circles him)
            const me = g.character?.group?.position;
            if (me && !g.isDeadLocal) {
                const dx = p.x - me.x, dz = p.z - me.z, d = Math.hypot(dx, dz);
                if (d < SEA_LIFE.SHARK_SHY && Math.abs(p.y - me.y) < 10) return { x: p.x + dx / (d || 1) * 20, y: p.y, z: p.z + dz / (d || 1) * 20, speed: SEA_LIFE.SPEED.shark[0] * 1.4 };
            }
            return null;
        }
        const q = prey.p;
        // out of the water now: it loses them
        const wq = waterAt(this.T, q.x, q.z, q.y);
        if (!wq || q.y - 2 > wq.surface) { a.hunt = false; return null; }
        if (a.sheerT > 0) { // (after a bite: off in a wide circle, then again)
            a.sheerT -= dt;
            const ang = Math.atan2(p.z - q.z, p.x - q.x) + 0.9;
            return { x: q.x + Math.cos(ang) * 14, y: q.y - 1, z: q.z + Math.sin(ang) * 14, speed: SEA_LIFE.SPEED.shark[1] * 0.7 };
        }
        const yawTo = Math.atan2(-(q.x - p.x), -(q.z - p.z));
        if (prey.d <= SEA_LIFE.BITE_R && a.biteT <= 0 && Math.abs(wrap(yawTo - a.group.rotation.y)) < 0.6) { // (it bites only turned to them)
            a.biteT = SEA_LIFE.BITE_EVERY; a.biteK = 1;
            A._butt(a, prey.id, { dmg: SEA_LIFE.BITE, k: 3 });
            g.sound?.playSea?.(p, 'bite', 1);
            for (let i = 0; i < 10; i++) g.fx?.spark?.(q, 0x9b0f1a, 0.12, _sv.set((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2), 1.2); // (a cloud of blood in the water)
            if (Math.random() < 0.6) a.sheerT = rr(3, 6);
        }
        return { x: q.x, y: q.y - 0.4, z: q.z, speed: SEA_LIFE.SPEED.shark[1] };
    }

    /** The dolphin: leaps now and then near the surface; comes to a swimmer and swims round them. → a target, 'leap' or null. */
    _dolphin(a, dt, w) {
        const g = this.game, p = a.group.position;
        a.leapT = (a.leapT ?? 8) - dt;
        if ((a.clickT = (a.clickT ?? rr(4, 12)) - dt) <= 0) { a.clickT = rr(5, 14); g.sound?.playSea?.(p, 'click', 0.7); }
        const s = this._nearSwimmer(a, SEA_LIFE.CURIOUS);
        a.curious = !!s;
        if (a.leapT <= 0 && p.y > w.surface - 2.5 && (a.spd || 0) > 2.5 && !s) { this._leap(a, w); return 'leap'; }
        if (s) {
            // round the swimmer, a few metres off, looking at them
            a.circ = (a.circ ?? Math.random() * 6.28) + dt * 0.5;
            const r = 5 + (a.id % 3);
            return { x: s.p.x + Math.cos(a.circ) * r, y: Math.min(w.surface - 1, s.p.y), z: s.p.z + Math.sin(a.circ) * r, speed: SEA_LIFE.SPEED.dolphin[0] * 1.3 };
        }
        return null;
    }

    _wander(a, w) {
        const t = this.T, h = a.home || a.herd || a.group.position;
        a.wanderT = rr(8, 18);
        for (let k = 0; k < 8; k++) {
            const ang = Math.random() * Math.PI * 2, d = Math.random() * SEA_LIFE.WANDER;
            const x = (h.hx ?? h.x) + Math.cos(ang) * d, z = (h.hz ?? h.z) + Math.sin(ang) * d;
            const ww = deepSeaAt(t, x, z, a.type === 'glowfin' ? SEA_LIFE.GLOW_DEPTH - 2 : 4);
            if (!ww) continue;
            const [lo, hi] = band(a.type, ww);
            a.target.set(x, lo + Math.random() * Math.max(0, hi - lo), z);
            return;
        }
        a.target.copy(a.group.position);
    }

    /** Swim towards (tx, ty, tz) at `speed`: turning (yaw) and pitching smoothly, never into the ground, within the water. */
    _swim(a, dt, tx, ty, tz, speed, w) {
        const p = a.group.position, R = a.group.rotation;
        const dx = tx - p.x, dz = tz - p.z, dh = Math.hypot(dx, dz);
        const want = dh > 0.5 ? Math.atan2(-dx, -dz) : R.y;
        const dy = wrap(want - R.y), rate = SEA_LIFE.TURN[a.type] * dt * (a.hunt || a.state === 'flee' ? 1.6 : 1);
        R.y += Math.max(-rate, Math.min(rate, dy));
        const turnSlow = 0.45 + 0.55 * Math.max(0, Math.cos(dy));
        const sk = a.slowK ?? 1;
        a.spd = (a.spd || 0) + (speed * turnSlow * sk - (a.spd || 0)) * Math.min(1, dt * 1.2);
        // the pitch: towards the target's height, never steep
        const wantP = Math.max(-0.6, Math.min(0.6, Math.atan2(ty - p.y, Math.max(2, dh))));
        a.pitch = (a.pitch || 0) + (wantP - (a.pitch || 0)) * Math.min(1, dt * 2);
        const fx = -Math.sin(R.y) * Math.cos(a.pitch), fz = -Math.cos(R.y) * Math.cos(a.pitch), fy = Math.sin(a.pitch);
        const nx = p.x + fx * a.spd * dt, nz = p.z + fz * a.spd * dt, ny = p.y + fy * a.spd * dt;
        // never into the ground: the step is kept only where the water is
        const t = this.T, ww = t ? waterAt(t, nx, nz, ny) : null;
        if (ww && ww.depth >= 1.5) {
            p.x = nx; p.z = nz;
            const [lo, hi] = band(a.type, ww);
            p.y = Math.max(ww.bottom + 0.8, Math.min(ww.surface - 0.4, ny));
            if (p.y < lo - 2) p.y += dt; // (back up into its band)
            if (p.y > hi + 2 && !a.leap) p.y -= dt;
        } else { R.y += dt * 1.5; a.spd *= 0.5; a.wanderT = 0; } // (the bottom rises / the shore: it turns away)
        // the pod / a pair: never inside each other
        for (const o of this.A.list) {
            if (o === a || o.dead || !isSeaType(o.type)) continue;
            const op = o.group.position, ox = p.x - op.x, oz = p.z - op.z, oy = p.y - op.y;
            const d2 = ox * ox + oy * oy + oz * oz, min = 2.2;
            if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2), k = (min - d) * 0.5; p.x += ox / d * k; p.y += oy / d * k * 0.5; p.z += oz / d * k; }
        }
        R.x = a.pitch;
        this.pose(a, dt);
    }

    /** A dolphin's leap: out of the water in an arc, a splash as it goes in again. */
    _leap(a, w) {
        const g = this.game, p = a.group.position;
        a.leapT = rr(...SEA_LIFE.LEAP_EVERY);
        const sp = Math.max(6, a.spd || 6);
        a.leap = { vy: 7 + Math.random() * 2.5, vf: sp, surface: w.surface };
        g.sound?.playSea?.(p, 'tail', 0.8);
        this._splash(p.x, w.surface, p.z, 18);
    }

    _leapStep(a, dt) {
        const p = a.group.position, L = a.leap, R = a.group.rotation;
        L.vy -= 14 * dt;
        p.x += -Math.sin(R.y) * L.vf * dt; p.z += -Math.cos(R.y) * L.vf * dt; p.y += L.vy * dt;
        a.pitch = Math.atan2(L.vy, L.vf);
        R.x = a.pitch;
        if (p.y < L.surface - 1 && L.vy < 0) {
            this._splash(p.x, L.surface, p.z, 24);
            this.game.sound?.playSea?.(p, 'tail', 1);
            a.leap = null;
            a.spd = L.vf * 0.8;
        }
        this.pose(a, dt);
    }

    _splash(x, y, z, n) {
        const fx = this.game.fx;
        if (!fx?.spark) return;
        _sp.set(x, y + 0.4, z);
        for (let i = 0; i < n; i++) fx.spark(_sp, i % 3 ? 0xe6f5ff : 0xffffff, 0.09, _sv.set((Math.random() - 0.5) * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 4), 0.8);
    }

    /** Out of the water (thrown, a blast, let go in the air): it falls (Animals' body), flops, and slowly dies on the land. */
    _beached(a, dt, w) {
        const A = this.A, p = a.group.position;
        A._body(a, dt);
        if (a.airborne) return;
        // water right by it: it flops back in
        const t = this.T;
        for (let k = 0; k < 8; k++) {
            const ang = k / 8 * Math.PI * 2, x = p.x + Math.cos(ang) * 2.5, z = p.z + Math.sin(ang) * 2.5;
            const ww = t ? waterAt(t, x, z, p.y + 2) : null;
            if (ww && ww.depth >= 2) { p.x += (x - p.x) * dt; p.z += (z - p.z) * dt; break; }
        }
        a.beached = (a.beached || 0) + dt;
        a.flop = (a.flop || 0) + dt * 6;
        a.group.rotation.z = Math.PI / 2 * 0.85 + 0.25 * Math.sin(a.flop);
        if (a.beached > 2) { a.hp -= SEA_LIFE.BEACHED_HURT * dt; if (a.hp <= 0) A._die(a, false, null); }
    }

    /** The parts move: the tail sweeps (side to side; a dolphin's up and down), the head counters it, the shark's jaw opens to bite. */
    pose(a, dt) {
        const u = a.model.userData;
        if (!u.tail) return;
        a.swimPh = (a.swimPh || 0) + dt * (2.2 + 1.1 * Math.min(8, a.spd || (a.netMoving ? 3 : 0.6)));
        const amp = 0.18 + 0.05 * Math.min(1, (a.spd || 0) / 6);
        const s = Math.sin(a.swimPh), s2 = Math.sin(a.swimPh - 1.1);
        if (u.sea === 'dolphin') {
            u.tail.rotation.x = s * amp * 0.9; u.tailFin.rotation.x = s2 * amp * 1.4;
            if (u.head) u.head.rotation.x = -s * amp * 0.12;
        } else {
            u.tail.rotation.y = s * amp; u.tailFin.rotation.y = s2 * amp * 1.5;
            if (u.head) u.head.rotation.y = -s * amp * 0.25;
        }
        if (u.jaw) u.jaw.rotation.x = 0.5 * (a.biteK || 0) + 0.04 * (1 + Math.sin(a.swimPh * 0.3));
    }

    /** Dead: the body floats up and lies belly up on the surface. */
    deadBody(a, dt) {
        const p = a.group.position, w = this.water(a);
        a.group.rotation.x *= Math.max(0, 1 - dt * 2);
        a.group.rotation.z += (Math.PI - a.group.rotation.z) * Math.min(1, dt * 1.5);
        if (w && w.depth >= 1.5) { p.y = Math.min(w.surface - 0.25, p.y + dt * 1.2); return true; }
        return false; // (on the land: the plain body)
    }

    /** (host) Killed: a glowfin's tail falls (the potion of the mermaid). */
    died(a) {
        const g = this.game;
        if (a.type !== 'glowfin' || !g.items?.spawnLoose) return;
        const p = a.group.position.clone();
        p.y += 0.5;
        g.items.spawnLoose({ kind: 'glowfinTail', uid: newUid(), count: 1 }, p, {});
    }

    /** (host) Frightened (a hit, a blast): a dolphin's pod / a glowfin flees from `from`. */
    scare(a, from) {
        if (a.dead || a.type === 'shark') return;
        for (const o of this.A.list) {
            if (o.dead || !isSeaType(o.type) || o.type === 'shark') continue;
            if (o !== a && (o.herd !== a.herd || o.group.position.distanceTo(a.group.position) > 30)) continue;
            o.state = 'flee'; o.stateT = 7; o.scareFrom = from ? { x: from.x, z: from.z } : null;
        }
    }

    /** Every frame (host and guests): the glowfins' light breathes, brighter at night. */
    frame(dt) {
        this.t += dt;
        const night = this.game.world?._night || 0;
        const k = (0.75 + 0.25 * Math.sin(this.t * 1.7)) * (1 + 0.8 * night);
        for (const m of GLOW.mats) m.emissiveIntensity = m.userData.glowBase * k;
        if (GLOW.mats.length) for (const m of GLOW.mats) if (m.isMeshBasicMaterial) m.color.setRGB(0.72 * k, 0.98 * Math.min(1.3, k), 1);
    }
}
