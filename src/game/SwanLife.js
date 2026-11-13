/**
 * SwanLife.js — ordinary swans on freshwater lakes; their wings are potion ingredients.
 *
 * A swan is an animal of Animals.js (type 'swan': every spell, blow, blast, Leviosa, «Империус», the carcass, the meat, the network
 * and the save already know the animals); this file is how it lives:
 *   - where: a flock (a pair, sometimes 3–5) on a lake — a still fresh water at least DEPTH deep with open water round it, not the sea
 *     (SITES: a place in a herd cell of its own roll, so the other herds of the world are not moved);
 *   - calm: it glides slowly about its part of the lake, the pair near each other, turns smoothly, bobs a little, now and then dips its
 *     head under the water to feed (the pose 'graze') or holds it up looking about; its feet paddle under it;
 *   - thrown on the land: it waddles back to the water (or flies to it);
 *   - a person comes close: one in AGGRO hisses, raises its wings (flyCode 5) and goes at them — it bites (BITE); the others run along
 *     the water beating their wings and fly off to another part of the lake / another lake (PigFlight's flight, landing on the water);
 *   - hit: AGGRO.HIT fight back, the rest fly off (Animals.hit);
 *   - killed: ordinary wings fall off for the potion of wings; the carcass floats.
 * Every swan is ordinary; old saved colours also use the ordinary model.
 * Cheap: a few block reads a step for the swans near; the lake found once per place (TerrainData.landMade first — never made in the frame).
 */
import { waterAt } from './CreatureSwim.js';
import { takeOff, stepFlight, FLY } from './PigFlight.js';
import { POSE } from './AnimalHerd.js';
import { WATERLINE } from './SwanModel.js';
import { hash01 } from '../world/Castles.js';
import { newUid } from './ItemTypes.js';
import { slowFactor } from './Slow.js';

export const SWAN = {
    SIZE: 2.0, // the model's scale (the body ~1.9 m long; the hero 3.5 m)
    MAGIC: 0, // All swans are ordinary; the old colour remains readable in saves.
    SITE_CHANCE: 0.55, // of the herd cells: a swan place is tried (it stays only where a lake is)
    MIN: 2, MAX: 5, // swans in a flock (most often a pair)
    DEPTH: 2, // water layers at least (a lake, not a puddle)
    OPEN: 4, // m round the spot: all water
    WANDER: 16, // m from home over the water
    SPEED: [0.45, 0.95], // m/s gliding
    FAST: 2.6, // m/s swimming at someone / away
    TURN: 1.2, // rad/s
    NEAR: 6.5, // m: a person this near — it acts
    RUN_AT: 11, // m: a person running at it this near — it acts
    AGGRO: 0.3, // of the swans meeting a person: hiss and come at them (the rest fly off)
    AGGRO_HIT: 0.4, // of the swans hit: fight back
    BITE: 1, BITE_R: 2.6, BITE_EVERY: 1.3, // a bite: dmg, reach (m), every s
    CHASE_T: 9, // s it keeps after someone, then calms
    FLEE_DIST: [45, 95], // m to fly off over the water
    LAND_R: 30, // m round a wanted spot where a water landing is looked for
    BOB: 0.03, // m of a gentle bob
};
const LAKE_OFFSETS=[[4,0],[-4,0],[0,4],[0,-4],[2.8,2.8],[-2.8,2.8],[2.8,-2.8],[-2.8,-2.8]];

/**
 * The swan place of a herd cell (gx, gz) of a world (seed), or null — before the lake is checked (Animals._siteLand → SwanLife.siteWater).
 * Its own roll (seed + 9301…): the herds of the world stay as they were.
 */
export function swanSiteAt(gx, gz, seed, CELL = 80) {
    if (hash01(gx, gz, seed + 9301) >= SWAN.SITE_CHANCE) return null;
    return {
        key: 's' + gx + ',' + gz, gx, gz, swans: true, type: 'swan',
        x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL,
        n: SWAN.MIN + Math.min(SWAN.MAX - SWAN.MIN, Math.floor((hash01(gx, gz, seed + 9302) ** 2.2) * (SWAN.MAX - SWAN.MIN + 1))), // (mostly pairs)
    };
}

/** Compatibility for old callers: there are no magical swans. */
export function swanMagic() { return false; }

/** Fresh still water at (x, z) deep enough with open water round: {surface, depth} | null. `t`: TerrainData. */
export function lakeAt(t, x, z) {
    if (!t?.floorBelow) return null; // (a world without water lookups: no lakes)
    const ix = Math.round(x), iz = Math.round(z);
    if(t.landMade&&!t.landMade(ix,iz))return null;
    if (t.isSeaColumn?.(ix, iz)) return null; // (the sea is no swans' lake)
    const w = waterAt(t, ix, iz, t.topLayer(ix, iz) + 30);
    if (!w || w.depth < SWAN.DEPTH) return null;
    for (const [dx, dz] of LAKE_OFFSETS) {
        const o = waterAt(t, ix + dx, iz + dz, w.surface + 2);
        if (!o || Math.abs(o.surface - w.surface) > 0.6) return null;
    }
    return w;
}

/** The height of a floating swan's origin over a water surface (the waterline of the model at the water's visible top). */
export const floatY = (surface, size = SWAN.SIZE) => surface + 0.5 - WATERLINE * size;

const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const rr = (a, b) => a + Math.random() * (b - a);

export class SwanLife {
    /** animals: the Animals system. */
    constructor(animals) {
        this.A = animals;
        this.game = animals.game;
    }

    get t() { return this.game.terrain?.data; }

    /**
     * (host) The water of a swan place: a lake spot found in its cell (a few candidates by the seed), the site moved onto it.
     * → true (found), false (no lake there), null (the land not made yet — ask later).
     */
    siteWater(r) {
        const t = this.t;
        if (!t) return false;
        const seed = this.game.seed || 1, C = 80;let pending=false;
        for (let k = 0; k < 14; k++) {
            const x = r.gx * C + 8 + hash01(r.gx * 31 + k, r.gz, seed + 9310) * (C - 16), z = r.gz * C + 8 + hash01(r.gx, r.gz * 31 + k, seed + 9311) * (C - 16);
            // A cell can be only partly loaded, especially round a guest. Try its
            // loaded candidates and never cache incomplete lake data as "no lake".
            if(t.landMade&&(!t.landMade(Math.round(x),Math.round(z))||LAKE_OFFSETS.some(([dx,dz])=>!t.landMade(Math.round(x+dx),Math.round(z+dz))))){pending=true;continue;}
            if ((t.sites || t.castles)?.landAt?.(Math.round(x), Math.round(z))) continue; // (a castle's moat, a village's pond: not theirs)
            if (lakeAt(t, x, z)) { r.x = x; r.z = z; return true; }
        }
        return pending?null:false;
    }

    /** (host) An ordinary flock on the water at its place, each a little apart. */
    spawnFlock(r) {
        const A = this.A, t = this.t, out = [];
        const herd = { x: r.x, z: r.z, hx: r.x, hz: r.z, id: Math.floor(Math.random() * 1e9), leader: null, swans: true };
        const yaw = Math.random() * Math.PI * 2;
        for (let i = 0; i < r.n; i++) {
            let x = r.x, z = r.z;
            for (let k = 0; k < 6 && i; k++) {
                const a = yaw + i * 2.1 + k, d = 3 + i * 1.6 + k;
                if (t && lakeAt(t, r.x + Math.cos(a) * d, r.z + Math.sin(a) * d)) { x = r.x + Math.cos(a) * d; z = r.z + Math.sin(a) * d; break; }
            }
            const w = t ? waterAt(t, x, z, t.topLayer(Math.round(x), Math.round(z)) + 30) : null;
            const y = w ? floatY(w.surface) : this.game.collision.groundY(x, z) + 0.5;
            const a = A._spawnSwan(x, y, z, { herd, yaw: yaw + (Math.random() - 0.5) * 0.8 });
            out.push(a);
        }
        herd.leader = out[0]?.id ?? null;
        return out;
    }

    /** The water under a swan (the lake it floats on) or null. */
    water(a) {
        const t = this.t, p = a.group.position;
        if (!t) return null;
        return waterAt(t, p.x, p.z, p.y);
    }

    /** (host) One step of a swan's life. */
    think(a, dt) {
        const A = this.A, p = a.group.position, S = this.game;
        if (a.fly) { this._fly(a, dt); return; }
        const w = this.water(a);
        const onWater = !!w && w.depth >= 1;
        a.onWater = onWater;
        // a person near: hiss and come at them, or fly off
        if (a.state === 'graze' && a.servantOf == null) this._watch(a);
        if (a.state === 'flee' && this._takeOff(a)) return;
        let speed = 0, tx = a.target.x, tz = a.target.z;
        a.flyCode = 0;
        if(a.state==='flee'){
            a.stateT-=dt;const from=a.scareFrom||A._playerPos(a.attacker);
            if(a.stateT<=0)a.state='graze';
            else{const dx=p.x-(from?.x??p.x-1),dz=p.z-(from?.z??p.z),d=Math.hypot(dx,dz)||1;tx=p.x+dx/d*8;tz=p.z+dz/d*8;speed=SWAN.FAST;}
        }else if (a.state === 'attack') {
            a.stateT -= dt;
            const tp = A._playerPos(a.attacker);
            if (!tp || a.stateT <= 0) { a.state = 'graze'; a.attacker = null; }
            else {
                tx = tp.x; tz = tp.z;
                const d = Math.hypot(tp.x - p.x, tp.z - p.z);
                speed = d > SWAN.BITE_R ? SWAN.FAST : 0;
                a.flyCode = 5; // (the wings raised: the threat)
                a.biteT = (a.biteT || 0) - dt;
                const yawTo = Math.atan2(-(tp.x - p.x), -(tp.z - p.z));
                if (d <= SWAN.BITE_R && a.biteT <= 0 && Math.abs(wrap(yawTo - a.group.rotation.y)) < 0.5) { // (it bites only turned to them)
                    a.biteT = SWAN.BITE_EVERY;
                    A._butt(a, a.attacker, { dmg: SWAN.BITE, k: 3 });
                    S.sound?.playSwan?.(p, 'hiss');
                }
                if ((a.hissT = (a.hissT || 0) - dt) <= 0) { a.hissT = rr(1.6, 3); S.sound?.playSwan?.(p, 'hiss'); }
            }
        } else if (a.servantOf != null) {
            // «Брейнрот»: it follows its master over the water / the land
            const sv = S.servants?.plan('a', a, p, 3);
            if (sv && sv.mode !== 'stay') { tx = sv.x; tz = sv.z; speed = sv.mode === 'chase' ? SWAN.FAST : 1.2; }
            if (sv?.mode === 'strike' && (a.biteT = (a.biteT || 0) - dt) <= 0) { a.biteT = SWAN.BITE_EVERY; S.servants.damage(sv.enemy, SWAN.BITE, null, a.servantOf); }
        } else if (!onWater) {
            // on the land (thrown, landed badly): back to the water, or up and off to it
            const back = this._nearWater(a);
            if (back) { tx = back.x; tz = back.z; speed = 1.1; }
            else if (this._takeOff(a)) return;
        } else speed = this._calm(a, dt, w);
        if (a.state === 'attack' || a.servantOf != null || !onWater || speed > 0) { a.target.x = tx; a.target.z = tz; }
        this._move(a, dt, speed, w);
    }

    /** Calm on the water: drift about its part of the lake; dip the head to feed; look about. → speed. */
    _calm(a, dt, w) {
        const p = a.group.position;
        a.idleT = (a.idleT ?? 0) - dt;
        if (a.idleT <= 0) {
            const r = Math.random();
            a.idle = r < 0.45 ? 'swim' : r < 0.7 ? 'feed' : r < 0.88 ? 'look' : 'rest';
            a.idleT = a.idle === 'swim' ? rr(6, 14) : a.idle === 'feed' ? rr(3, 7) : rr(3, 8);
            a.pose = a.idle === 'feed' ? POSE.graze : a.idle === 'look' ? POSE.look : POSE.stand;
            if (a.idle === 'swim') {
                // somewhere over the water near home (a pair keeps together: towards the flock's middle)
                const h = a.herd || a.home, hx = h.hx ?? h.x, hz = h.hz ?? h.z;
                for (let k = 0; k < 6; k++) {
                    const ang = Math.random() * Math.PI * 2, d = Math.random() * SWAN.WANDER;
                    const x = hx + Math.cos(ang) * d, z = hz + Math.sin(ang) * d;
                    if (this.t && lakeAt(this.t, x, z)) { a.target.set(x, p.y, z); break; }
                }
                a.cruise = rr(...SWAN.SPEED);
            } else a.target.copy(p);
        }
        if (Math.random() < dt / 30) this.game.sound?.playSwan?.(p, 'call'); // (now and then a pair calls to each other)
        if (a.idle !== 'swim') return 0;
        const d = Math.hypot(a.target.x - p.x, a.target.z - p.z);
        if (d < 0.8) { a.idleT = 0; return 0; }
        return (a.cruise || 0.6) * Math.min(1, d / 3);
    }

    /** Glide / paddle towards a.target at `speed`, the body on the water (or walking on the land), turning smoothly; the flock apart. */
    _move(a, dt, speed, w) {
        const A = this.A, p = a.group.position;
        const dx = a.target.x - p.x, dz = a.target.z - p.z, d = Math.hypot(dx, dz);
        if (speed > 0 && d > 0.3) {
            const want = Math.atan2(-dx, -dz), dy = wrap(want - a.group.rotation.y), rate = SWAN.TURN * dt * (a.state === 'attack' ? 2 : 1);
            a.group.rotation.y += Math.max(-rate, Math.min(rate, dy));
            speed *= 0.4 + 0.6 * Math.max(0, Math.cos(dy)); // (round a turn slower)
        } else speed = 0;
        a.spd = (a.spd || 0) + (speed - (a.spd || 0)) * Math.min(1, dt * 1.5); // (a swan glides on: it slows softly)
        const sk = (a.slowK ?? 1);
        const fx = -Math.sin(a.group.rotation.y), fz = -Math.cos(a.group.rotation.y);
        const nx = p.x + fx * a.spd * sk * dt, nz = p.z + fz * a.spd * sk * dt;
        // on the water it never paddles up onto the bank by itself (the land is reached only when it means to go there)
        if (w && a.state === 'graze' && this.t && !waterAt(this.t, nx, nz, p.y)) a.spd = 0;
        else { p.x = nx; p.z = nz; }
        // the flock: never on top of each other
        for (const o of A.list) {
            if (o === a || o.dead || o.type !== 'swan') continue;
            const ox = p.x - o.group.position.x, oz = p.z - o.group.position.z, dd = ox * ox + oz * oz;
            if (dd < 4.4 && dd > 1e-6) { const k = (2.1 - Math.sqrt(dd)) * 0.5; const l = Math.sqrt(dd); p.x += ox / l * k; p.z += oz / l * k; }
        }
        a.t = (a.t || 0) + dt;
        const ww = this.water(a);
        if (ww && ww.depth >= 1) {
            // afloat: on the surface, a gentle bob, a little rock with the strokes
            a.airborne = false;
            const y = floatY(ww.surface) + SWAN.BOB * Math.sin(a.t * 1.7 + a.id);
            p.y += (y - p.y) * Math.min(1, dt * 6);
            a.group.rotation.x = 0.02 * Math.sin(a.t * 1.3 + a.id);
            if (a.vel) a.vel.set(0, 0, 0);
            if (a.spd > 0.3 && Math.random() < dt * a.spd * 2) this.game.fx?.spark?.(p.clone().setY(ww.surface + 0.5), 0xdcefff, 0.06, { x: (Math.random() - 0.5) * 0.6, y: 0.4, z: (Math.random() - 0.5) * 0.6 }, 0.5); // (its wake)
        } else A._body(a, dt);
        a.walkT += dt * (2 + a.spd * 3); // (the feet paddle / waddle)
        A._animate(a, Math.min(1, 0.25 + a.spd / 3), dt);
    }

    /** (host) Someone near: hiss and come at them (AGGRO), else the flock flies off. */
    _watch(a) {
        const p = a.group.position;
        for (const q of this.A._crowd || []) {
            const d = Math.hypot(q.x - p.x, q.z - p.z);
            const towards = (q.vx * (p.x - q.x) + q.vz * (p.z - q.z)) / Math.max(1e-3, d);
            if (d < SWAN.NEAR || (d < SWAN.RUN_AT && towards > 3.5)) {
                if (Math.random() < SWAN.AGGRO) { a.state = 'attack'; a.attacker = q.id; a.stateT = SWAN.CHASE_T; this.game.sound?.playSwan?.(p, 'hiss'); }
                else this.scare(a, q);
                return;
            }
        }
    }

    /** (host) Frightened by `from` {x, z} (or nothing it can tell): it — and its flock — will take off. */
    scare(a, from) {
        if (a.dead || a.servantOf != null) return;
        for (const o of this.A.list) {
            if (o.type !== 'swan' || o.dead || o.fly || o.state === 'attack' || o.servantOf != null) continue;
            if (o !== a && (o.herd !== a.herd || o.group.position.distanceTo(a.group.position) > 25)) continue;
            o.state = 'flee'; o.stateT = 6; o.scareFrom = from ? { x: from.x, z: from.z } : null;
        }
    }

    /** (host) Up and off to water further away (a run along the water beating the wings — PigFlight 'up'). → true when it flies. */
    _takeOff(a) {
        const A = this.A, p = a.group.position;
        if (a.lev || a.stunT > 0 || a.rider || a.dead) return false;
        if (A._floor(p.x, p.z) > p.y + 1.5) return false; // (under a roof: no room)
        const from = a.scareFrom || A._playerPos?.(a.attacker);
        const h = a.herd;
        let dest = h?.flyTo && h.flyTo.until > performance.now() ? this.pickWater(h.flyTo.x + (Math.random() - 0.5) * 6, h.flyTo.z + (Math.random() - 0.5) * 6, 10) : null;
        if (!dest) {
            let dx = from ? p.x - from.x : Math.random() - 0.5, dz = from ? p.z - from.z : Math.random() - 0.5;
            const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
            for (let k = 0; k < 5 && !dest; k++) {
                const turn = (Math.random() - 0.5) * (0.6 + k * 0.7), d = rr(...SWAN.FLEE_DIST);
                const c = Math.cos(turn), s = Math.sin(turn);
                dest = this.pickWater(p.x + (dx * c - dz * s) * d, p.z + (dx * s + dz * c) * d, SWAN.LAND_R);
            }
            if (!dest) dest = this.pickWater(a.home.x, a.home.z, SWAN.LAND_R);
            if (dest && h) h.flyTo = { x: dest.x, z: dest.z, until: performance.now() + 5000 };
        }
        if (!dest) return false;
        takeOff(a, 'flee', dest, { home: { x: p.x, z: p.z } });
        a.flyCode = 1;
        this.game.sound?.playSwan?.(p, 'run');
        return true;
    }

    /** A lake spot near (x, z) within r: {x, z} | null. */
    pickWater(x, z, r) {
        const t = this.t;
        if (!t) return null;
        const ok = (px, pz) => (!t.landMade || t.landMade(Math.round(px), Math.round(pz))) && !!lakeAt(t, px, pz);
        if (ok(x, z)) return { x, z };
        for (let i = 0; i < 18; i++) {
            const ang = Math.random() * Math.PI * 2, d = r * Math.sqrt((i + 1) / 18);
            const px = x + Math.cos(ang) * d, pz = z + Math.sin(ang) * d;
            if (ok(px, pz)) return { x: px, z: pz };
        }
        return null;
    }

    /** The nearest water a swan on the land can waddle to (≤ 18 m): {x, z} | null. */
    _nearWater(a) {
        const t = this.t, p = a.group.position;
        if (!t) return null;
        if (a.toWater && a.toWater.until > (a.t || 0)) return a.toWater;
        let best = null;
        for (let r = 2; r <= 18 && !best; r += 2) for (let k = 0; k < 12; k++) {
            const ang = k / 12 * Math.PI * 2, x = p.x + Math.cos(ang) * r, z = p.z + Math.sin(ang) * r;
            const w = waterAt(t, x, z, p.y + 2);
            if (w && w.depth >= 1) { best = { x, z }; break; }
        }
        a.toWater = best ? { ...best, until: (a.t || 0) + 3 } : null;
        return best;
    }

    /** The world a swan's flight sees: the water is where it lands (PigFlight). */
    _W() {
        const A = this.A;
        return this._w || (this._w = {
            floor: (x, z) => {
                const f = A._floor(x, z), t = this.t;
                const w = t ? waterAt(t, x, z, f + 2) : null;
                return w ? Math.max(f, floatY(w.surface) - FLY.BASE) : f; // (over the water: its surface is the floor)
            },
            landOk: (x, z) => !!(this.t && lakeAt(this.t, x, z)),
            pickLanding: (x, z, r) => this.pickWater(x, z, r),
        });
    }

    _fly(a, dt) {
        const A = this.A;
        a.slowK = slowFactor(a);
        if (stepFlight(a, dt, this._W()) === 'landed') {
            A._land(a);
            a.onWater = true;
            a.idleT = 0;
            this.game.sound?.playSwan?.(a.group.position, 'splash');
        } else if (a.fly && (a.fly.wingSnd = (a.fly.wingSnd || 0) - dt) <= 0 && (a.flyCode & 7) === 1) { a.fly.wingSnd = 0.9; this.game.sound?.playSwan?.(a.group.position, 'wings'); }
        a.spd = 0;
        a.walkT += dt * 2;
        A._animate(a, 0, dt);
    }

    /** (host) A swan killed: its wings fall off it (the potion of wings wants a magic swan's — Potions 'wings'). */
    died(a) {
        const g = this.game;
        if (!g.items?.spawnLoose) return;
        const p = a.group.position.clone();
        p.y += 1.2;
        g.items.spawnLoose({ kind: 'swanWings', uid: newUid(), count: 1 }, p, {});
    }
}

/** Calls fn(site) for every swan place within r m of (x, z) (the herd cells, CELL m). */
export function swanSitesNear(x, z, r, seed, fn, CELL = 80) {
    for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++) {
        for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++) {
            const s = swanSiteAt(gx, gz, seed, CELL);
            if (s && Math.hypot(s.x - x, s.z - z) <= r + CELL * 0.5) fn(s);
        }
    }
}
