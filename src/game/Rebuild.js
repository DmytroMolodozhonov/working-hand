/**
 * Rebuild.js — after the danger, the builders put the castle back.
 *
 * Whatever was destroyed in a castle or its village (a blast, «Total
 * Destruction», fire, stones pulled out by «Gather») is remembered as a place.
 * When it has been quiet there for a while (REBUILD.CALM — minutes), builders
 * come out of the houses with their hammers, a cart of stone stands by, and
 * they put back, block by block, exactly what the castle was built as (the
 * world is made from its seed: what a place was is generated again and
 * compared with what is there now):
 *   first the rubble lying about is cleared, the craters filled, then the walls
 *   go up from the bottom, then the roofs and the small things (glass, lanterns,
 *   carpets). High up they stand on scaffolding they put up and climb.
 * Slowly (a castle brought down whole takes many game hours); new danger
 * stops them (they hide like everybody — VillagerFear.js) and they come back
 * when it is quiet again. Out of sight (nobody near the castle) the work goes
 * on at the same slow pace.
 *
 * Never touched («на кого и на что» — Danger.js REBUILT): blocks a player put
 * there (Builder's blocks, ice), what the new king of a captured castle took
 * apart himself, anything outside the castle's land or deep under it, wizards'
 * towers. Multiplayer: the host decides, the blocks go to everybody as edits
 * (saved with the world like built blocks); the scaffolding and the cart are sent
 * too. A save keeps what was rebuilt after which blast (so loading a world
 * doesn't blow up again what the builders already put back).
 */

import * as THREE from 'three';
import { BLOCK, MIN_LAYER, MAX_LAYER, CHUNK, isSolid } from '../world/Terrain.js';
import { isWizSite } from './WizardLife.js';

export const REBUILD = {
    CALM: 120, // s of quiet in the castle's land before the builders come out (2 game hours)
    HIT: 0.9, // s, one hammer stroke
    HITS: 2, // strokes per block
    BATCH: 2, // blocks put at once (a course of a wall)
    WORKERS: 8,
    OFFLINE: 1.2, // blocks per s with nobody there to see it
    REACH: 4, // layers above the feet a builder reaches from where he stands
    LOG: 40000,
    DEEP: 6, // layers under the castle's floor still filled back (craters); deeper — left
};

const BLOCK_NAME = Object.fromEntries(Object.entries(BLOCK).map(([k, v]) => [v, k]));
/** Natural ground (filled back into craters). */
const GROUND = new Set(['GRASS', 'DIRT', 'STONE', 'SNOW', 'SAND', 'GRAVEL', 'FARMLAND', 'PATH'].map((k) => BLOCK[k]).filter((t) => t != null));
/** Roofs and small things: put last, on finished walls. */
const DETAIL = /ROOF|THATCH|GLASS|PANE|LANTERN|LAMP|CARPET|CLOTH|BANNER|FLAG|FLOWER|WHEAT|VEG|HAY|LEAVES|TORCH|CANDLE|RUNE/;

export function blockKind(t) {
    if (GROUND.has(t)) return 1;
    return DETAIL.test(BLOCK_NAME[t] || '') ? 3 : 2;
}

/**
 * What to do in a region (pure: works on any get-functions) → ops [{x, L, z, t, k}]:
 * k 0 — clear rubble (t = AIR), 1 — fill ground, 2 — walls, 3 — roofs and details.
 * @param {(x,L,z)=>number} cur  the world now
 * @param {(x,L,z)=>number} orig  the world as generated
 * @param {object} o  {x0, x1, z0, z1, L0, L1, floor (the castle's floor layer), placed(key) (a player's block), kept(key) (the owner took it), protects(x,L,z)}
 */
export function planRepair(cur, orig, o, out = []) {
    const floor = o.floor ?? 0;
    for (let z = o.z0; z <= o.z1; z++) {
        for (let x = o.x0; x <= o.x1; x++) {
            for (let L = o.L0; L <= o.L1; L++) {
                const a = orig(x, L, z), b = cur(x, L, z);
                if (a === b) continue;
                const key = x + ',' + L + ',' + z;
                if (o.placed?.(key) || o.protects?.(x, L, z)) continue;
                if (isSolid(a)) {
                    if (a === BLOCK.ICE_SHAPE) continue;
                    if (GROUND.has(a) && L < floor - REBUILD.DEEP) continue; // (deep under: left)
                    if (o.kept?.(key)) continue;
                    out.push({ x, L, z, t: a, k: blockKind(a) });
                } else if (isSolid(b) && b !== BLOCK.ICE && b !== BLOCK.ICE_SHAPE && L >= floor - 1) {
                    if (a === BLOCK.WATER) continue; // (a river / the sea: leave it be)
                    out.push({ x, L, z, t: BLOCK.AIR, k: 0 }); // rubble, a fallen piece
                }
            }
        }
    }
    return out;
}

/** The order of the work: rubble from the top down, then ground, walls and roofs from the bottom up. */
export function orderOps(ops) {
    return ops.sort((p, q) => p.k - q.k || (p.k === 0 ? q.L - p.L : p.L - q.L) || p.x - q.x || p.z - q.z);
}

/**
 * Which logged rebuilt blocks still stand after the blasts that came later
 * (explosions: [{p:[x,y,z], r, ruin}]) — on load / when joining.
 */
export function stillStanding(log, explosions) {
    const out = [];
    for (const e of log) {
        const [x, L, z, , seq] = e;
        let gone = false;
        for (let j = seq; j < explosions.length && !gone; j++) {
            const b = explosions[j];
            const dx = x - b.p[0], dz = z - b.p[2], dy = (L - 1) - b.p[1];
            gone = b.ruin ? dx * dx + dz * dz <= (b.r + 1) * (b.r + 1) : dx * dx + dy * dy + dz * dz <= (b.r + 1.5) * (b.r + 1.5);
        }
        if (!gone) out.push(e);
    }
    return out;
}

const WOODC = 0x9b6b3c, POLE = 0x7a5230, STONEC = 0x9a9a92;
const _box = new THREE.BoxGeometry(1, 1, 1);
const _cyl = new THREE.CylinderGeometry(0.5, 0.5, 0.18, 10);

export class Rebuild {
    constructor(life) {
        this.life = life;
        this.game = life.game;
        this.sites = new Map(); // castle id -> {def, box, at, plan, scan, workers, scaf, cart, credit}
        this.log = new Map(); // "x,L,z" -> [x, L, z, type, seq] what was put back (seq: blasts before it); a player's later edit there forgets it
        this._t = 0;
        this._tickT = 0;
        this._edits = [];
        this._mat = null;
        this.meshes = new Map(); // castle id -> THREE.Group (scaffolding, the cart)
    }

    get data() { return this.game.world?.terrain?.data || this.game.terrain?.data || null; }

    // ------------------------------------------------------------ damage
    /** (host) Something of a castle was destroyed round `pos`. */
    damaged(pos, r = 4, by = null, loud = true) {
        const idx = this.life.index;
        if (!idx) return;
        for (const def of idx.near(pos.x, pos.z, 0)) {
            if (isWizSite(def) || !def.zone || !this.life._inLand(def, pos, 12)) continue;
            let s = this.sites.get(def.id);
            const R = Math.ceil(r + 3);
            const box = [Math.floor(pos.x - R), Math.ceil(pos.x + R), Math.floor(pos.z - R), Math.ceil(pos.z + R)];
            if (!s) { s = { def, box, at: this._t, plan: null, scan: null, workers: new Set(), scaf: [], cart: null, credit: 0 }; this.sites.set(def.id, s); }
            else { s.box = [Math.min(s.box[0], box[0]), Math.max(s.box[1], box[1]), Math.min(s.box[2], box[2]), Math.max(s.box[3], box[3])]; s.at = this._t; }
            s.plan = null; s.scan = null; // (things changed: look again when it is quiet)
        }
    }

    _clip(s) {
        const d = s.def, Z = d.zone;
        return [Math.max(s.box[0], d.x - Z), Math.min(s.box[1], d.x + Z), Math.max(s.box[2], d.z - Z), Math.min(s.box[3], d.z + Z)];
    }

    // ------------------------------------------------------------ planning
    _startScan(s) {
        const [x0, x1, z0, z1] = this._clip(s);
        if (x0 > x1 || z0 > z1) { this.sites.delete(s.def.id); return; }
        const g = this.game;
        // whose blocks are there: the last edit of every cell (a player's block, or the king's own taking apart)
        const last = new Map();
        for (const e of g.blockEdits || []) if (e[0] >= x0 && e[0] <= x1 && e[2] >= z0 && e[2] <= z1) last.set(e[0] + ',' + e[1] + ',' + e[2], e[3]);
        const owned = !!this.life.state(s.def.id).owner;
        const chunks = [];
        const S = Math.log2(CHUNK);
        for (let cz = z0 >> S; cz <= z1 >> S; cz++) for (let cx = x0 >> S; cx <= x1 >> S; cx++) chunks.push([cx, cz]);
        s.scan = {
            x0, x1, z0, z1, chunks, i: 0, ops: [],
            placed: (k) => { const t = last.get(k); return t != null && t !== BLOCK.AIR && t !== BLOCK.WATER; },
            kept: (k) => owned && last.get(k) === BLOCK.AIR,
        };
    }

    /** One chunk of the comparison (a frame each: generating the old castle again takes a moment). */
    _scanStep(s) {
        const data = this.data, S = s.scan;
        if (!data) return;
        const [cx, cz] = S.chunks[S.i++];
        const fresh = data._generateChunk(cx, cz); // (the place as it was made)
        const X0 = cx * CHUNK, Z0 = cz * CHUNK;
        const at = (c) => (x, L, z) => (L < MIN_LAYER || L > MAX_LAYER ? BLOCK.AIR : c.blocks[((L - MIN_LAYER) * CHUNK + (z - Z0)) * CHUNK + (x - X0)]);
        const now = data.chunk(cx, cz);
        const floor = Math.round(s.def.F ?? 0);
        const wards = this.game.wards;
        planRepair(at(now), at(fresh), {
            x0: Math.max(S.x0, X0), x1: Math.min(S.x1, X0 + CHUNK - 1), z0: Math.max(S.z0, Z0), z1: Math.min(S.z1, Z0 + CHUNK - 1),
            L0: Math.max(MIN_LAYER + 1, floor - REBUILD.DEEP), L1: Math.min(MAX_LAYER, Math.max(fresh.maxTop, now.maxTop) + 1), floor,
            placed: S.placed, kept: S.kept, protects: wards?.list?.size ? (x, L, z) => wards.protects(x, L - 1, z) : null,
        }, S.ops);
        if (S.i >= S.chunks.length) {
            const ops = orderOps(S.ops);
            s.scan = null;
            if (!ops.length) { this._finish(s); return; }
            s.plan = { ops, i: 0, total: ops.length };
            this._placeCart(s);
        }
    }

    // ------------------------------------------------------------- frame
    update(dt) {
        this._t += dt;
        if (!this.life.auth) return;
        for (const s of this.sites.values()) if (s.scan) { this._scanStep(s); break; } // (one chunk a frame)
        this._tickT -= dt;
        if (this._tickT <= 0) {
            this._tickT = 1;
            for (const s of [...this.sites.values()]) this._tick(s, 1);
        }
        this._flush();
    }

    /** Is it quiet enough at this castle to work? */
    _quiet(s) {
        const cs = this.life.castles.get(s.def.id);
        const q = Math.min(this._t - s.at, cs ? this.life.fright.quietFor(cs) : Infinity);
        return q >= REBUILD.CALM;
    }

    _tick(s, dt) {
        const cs = this.life.castles.get(s.def.id);
        if (!this._quiet(s)) { if (s.workers.size) this._send(s); return; }
        if (!s.plan) { if (!s.scan) this._startScan(s); return; }
        if (!this._hasBuilders(s.def)) return; // (no builder left alive in this castle: nobody to do it)
        // (a builder gone — went home, out of sight, killed — leaves his block to the others)
        for (let i = s.plan.i; i < s.plan.ops.length; i++) { const o = s.plan.ops[i]; if (o.by && this.life.byId.get(o.by)?.task !== o) o.by = null; }
        if (cs?.awake) {
            this._crew(s, cs);
            // (the far side of a big site, out of sight: the others are at it there too)
            s.credit = Math.min(3, s.credit + REBUILD.OFFLINE * 0.6 * dt);
            while (s.credit >= 1 && s.plan) { s.credit--; if (!this._far(s)) break; }
        } else {
            // nobody there to see it: the work goes on at the same slow pace
            s.credit += REBUILD.OFFLINE * dt;
            while (s.credit >= 1 && s.plan) { s.credit--; this._next(s, null); }
        }
    }

    /** One block put back where no player sees it (of the first waiting ones). */
    _far(s) {
        const P = s.plan, pl = this.life._players();
        for (let i = P.i, n = 0; i < P.ops.length && n < 80; i++) {
            const o = P.ops[i];
            if (o.done || o.by) continue;
            n++;
            if (pl.every((p) => Math.hypot(p.p.x - o.x, p.p.z - o.z) > 45)) { this._next(s, o); return true; }
        }
        return false;
    }

    _hasBuilders(def) {
        if (def._builders == null || def._buildersAt !== this.life.state(def.id).killed.size) {
            const st = this.life.state(def.id);
            const first = def.knights + 1 + def.stalls.length;
            const last = Math.min(Math.max(first + 1, def.population), first + 400);
            let n = 0;
            for (let i = first; i < last && n < 1; i++) if (!st.killed.has(i) && this.life._roster(def, i).role === 'builder') n++;
            def._builders = n > 0;
            def._buildersAt = st.killed.size;
        }
        return def._builders;
    }

    /** Builders come out to work (as many as the job needs). */
    _crew(s, cs) {
        const life = this.life;
        for (const id of [...s.workers]) { const v = life.byId.get(id); if (!v || v.dead || v.job !== 'rebuild') s.workers.delete(id); }
        const left = s.plan.ops.length - s.plan.i;
        const want = Math.min(REBUILD.WORKERS, 1 + Math.ceil(left / 60));
        if (s.workers.size >= want) return;
        // a builder already about in the village takes up his hammer; else one comes out of a house
        let v = [...cs.active.values()].find((o) => !o.dead && o.role === 'builder' && o.job === 'wander' && !o.fear && !o.foe && !o.talking);
        if (v) { v.job = 'rebuild'; v.path = null; v.goingHome = false; }
        else {
            const idx = life._freeCommoner(cs, 'builder');
            if (idx < 0) return;
            const op = s.plan.ops[s.plan.i];
            const homes = cs.graph.tagged('home').concat(cs.graph.tagged('gateIn'));
            if (!homes.length) return;
            let best = homes[0], bd = Infinity;
            for (const h of homes) { const n = cs.graph.nodes[h]; const d = Math.hypot(n.x - op.x, n.z - op.z); if (d < bd && d > 6) { bd = d; best = h; } }
            const n = cs.graph.nodes[best];
            v = life._activate(cs, idx, { x: n.x, y: n.y, z: n.z }, 'rebuild');
            if (!v) return;
            v.node = best;
        }
        v.site = s.def.id;
        s.workers.add(v.id);
        if (s.workers.size === 1 && Math.random() < 0.8) life._say(v, s.plan.i === 0 ? 'Ну, за работу! Камень сюда, ребята.' : 'Тихо вроде. Продолжаем!', 4);
    }

    /** Danger again / the work is done: the builders go home. */
    _send(s) {
        for (const id of s.workers) {
            const v = this.life.byId.get(id);
            if (!v || v.dead) continue;
            this._leaveScaf(v, s);
            if (v.task) { v.task.by = null; v.task = null; }
            if (v.job === 'rebuild') { v.job = 'wander'; v.trips = 0; v.path = null; }
        }
        s.workers.clear();
        this._dropScaf(s);
    }

    // ------------------------------------------------------- one builder
    /** (CastleLife._think) a builder at work. true: handled. */
    work(v, dt) {
        const life = this.life;
        const s = this.sites.get(v.cs.def.id);
        if (!s || !s.plan || !this._quiet(s)) {
            if (s && v.task) { v.task.by = null; v.task = null; }
            if (s) this._leaveScaf(v, s);
            v.job = 'wander'; v.trips = 0; v.path = null; v.goingHome = false;
            return false;
        }
        if (!v.task) {
            const op = this._take(s, v);
            if (!op) { v.speed = 0; v.mode = 'idle'; life._ground(v); return true; }
            v.task = op; op.by = v.id; v.taskT = 0; v.hits = 0; v.hitT = 0; v.direct = false; v.bestD = Infinity; v.bestT = 0;
            const spot = this._spot(s, op, v);
            v.spot = spot;
            if (v.onScaf && (!spot.scaf || Math.hypot(spot.x - v.onScaf.x, spot.z - v.onScaf.z) > 0.5 || Math.abs(spot.y - v.onScaf.y1) > 0.1)) this._leaveScaf(v, s);
            v.path = null;
        }
        const op = v.task, sp = v.spot;
        v.taskT += dt;
        // gone already (done by somebody, or the place changed)
        if (this.data && this.data.get(op.x, op.L, op.z) === op.t) { this._done(s, op); v.task = null; return true; }
        if (!v.onScaf) {
            const d = Math.hypot(sp.x - v.x, sp.z - v.z);
            const feet = Math.round(v.y + 1.5);
            // (no nearer for a while — rubble, a wall stub in the way: from here, if it is in reach of a long arm)
            if (d < v.bestD - 0.3) { v.bestD = d; v.bestT = v.taskT; }
            const stuck = v.taskT - v.bestT > 6;
            const oh = Math.hypot(op.x - v.x, op.z - v.z);
            const near = !sp.scaf && (oh < 3.4 || (stuck && oh < 6)) && op.L - feet <= REBUILD.REACH && feet - op.L <= 5; // (in reach already)
            if (d > 0.7 && !stuck && v.taskT < 30 && !near) {
                if (d > 6 && !v.direct) {
                    // along the streets to the nearest place, then straight to it
                    if (!v.path) life._goTo(v, v.cs.graph.nearest(sp.x, sp.y, sp.z, 8));
                    if (life._followPath(v, dt, v.walk || 2.3)) { v.path = null; v.direct = true; }
                } else life._steer(v, sp.x, sp.z, 2.3, dt, 0.4);
                v.mode = v.speed > 0 ? 'walk' : 'idle';
                life._ground(v);
                return true;
            }
            if (d > 0.7 && !near) { this._skip(s, v); return true; } // (could not get there)
            if (sp.scaf) { this._upScaf(v, s, sp); return true; }
        }
        // at work: turned to the place, the hammer going
        life._steer(v, op.x, op.z, 0, dt, 99);
        v.speed = 0;
        v.mode = 'work';
        if (!v.onScaf) life._ground(v);
        v.hitT += dt;
        if (v.hitT >= REBUILD.HIT) {
            v.hitT = 0;
            if (++v.hits >= REBUILD.HITS) {
                v.task = null;
                this._next(s, op, v);
            }
        }
        return true;
    }

    /** The next op for this builder: of the first few waiting, the nearest. */
    _take(s, v) {
        const P = s.plan;
        while (P.i < P.ops.length && P.ops[P.i].done) P.i++;
        let best = null, bd = Infinity, seen = 0;
        for (let i = P.i; i < P.ops.length && seen < 30; i++) {
            const o = P.ops[i];
            if (o.done || o.by) continue;
            seen++;
            const d = Math.hypot(o.x - v.x, o.z - v.z) + Math.abs(o.L - (v.y + 1.5)) * 0.5 + seen * 0.4;
            if (d < bd) { bd = d; best = o; }
        }
        return best;
    }

    /** Where to stand for it: a free spot beside the place (on the ground, or a scaffold up to it). */
    _spot(s, op, v) {
        const t = this.data;
        const F = Math.round(s.def.F ?? 0);
        let best = null, bs = Infinity;
        for (let r = 1; r <= 4; r++) {
            for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                const x = op.x + dx, z = op.z + dz;
                const f = t.floorBelow(x, z, Math.max(op.L - 1, F)); // (the floor beside it; a crater is filled from its edge)
                if (f < MIN_LAYER) continue;
                if (t.solidIn(x, z, f + 1, f + 4)) continue; // (no room to stand)
                const y = f - 0.5;
                // (close to it; on the ground beside it rather than up on the unfinished wall or down in the crater)
                const s1 = r + Math.hypot(x - v.x, z - v.z) * 0.15 + Math.max(0, f - F) * 0.8 + Math.max(0, F - f) * 3;
                if (s1 < bs) { bs = s1; best = { x, y, z, f }; }
            }
        }
        if (!best) return { x: op.x, y: v.y, z: op.z, scaf: false };
        const high = op.L - (best.f + 1) > REBUILD.REACH;
        if (high) { const y1 = op.L - 3 - 0.5; return { x: best.x, y: y1, z: best.z, y0: best.y, scaf: true }; }
        return { x: best.x, y: best.y, z: best.z, scaf: false };
    }

    _skip(s, v) {
        const op = v.task;
        v.task = null;
        if (!op) return;
        op.by = null;
        op.skips = (op.skips || 0) + 1;
        // (nobody can get to it: done «from the other side» — by the others, unseen)
        if (op.skips >= 2) this._next(s, op);
    }

    /** Up the scaffold (put up where it is needed): climbs it. */
    _upScaf(v, s, sp) {
        let sc = s.scaf.find((q) => Math.abs(q.x - sp.x) < 0.5 && Math.abs(q.z - sp.z) < 0.5);
        if (!sc) { sc = { x: sp.x, z: sp.z, y0: sp.y0, y1: sp.y, n: 0 }; s.scaf.push(sc); this._sendSite(s); }
        else if (sc.y1 < sp.y) { sc.y1 = sp.y; this._sendSite(s); }
        sc.n++;
        v.onScaf = sc;
        v.climb = { t: 0, dur: 0.8 + (sp.y - v.y) * 0.35, x0: v.x, y0: v.y, z0: v.z, x1: sp.x, y1: sp.y, z1: sp.z };
    }

    _leaveScaf(v, s) {
        const sc = v.onScaf;
        if (!sc) return;
        v.onScaf = null;
        sc.n--;
        // down the ladder
        v.climb = { t: 0, dur: 0.6 + (v.y - sc.y0) * 0.25, x0: v.x, y0: v.y, z0: v.z, x1: v.x, y1: sc.y0, z1: v.z };
        // (its part of the wall finished: taken down)
        if (sc.n <= 0 && !s.plan?.ops.some((o) => !o.done && Math.abs(o.x - sc.x) <= 3 && Math.abs(o.z - sc.z) <= 3 && o.L - 1 > sc.y0 + REBUILD.REACH)) {
            s.scaf.splice(s.scaf.indexOf(sc), 1);
            this._sendSite(s);
        }
    }

    /** Put a block (and a few next to it of the same stage) in place. */
    _next(s, op, v = null) {
        const P = s.plan;
        if (!P) return;
        const list = op ? [op] : [];
        if (!op) { while (P.i < P.ops.length && (P.ops[P.i].done || P.ops[P.i].by)) P.i++; if (P.i < P.ops.length) list.push(P.ops[P.i]); }
        if (op && REBUILD.BATCH > 1) {
            for (let i = P.i, seen = 0; i < P.ops.length && list.length < REBUILD.BATCH && seen < 20; i++) {
                const o = P.ops[i];
                if (o === op || o.done || o.by) continue;
                seen++;
                if (o.k === op.k && Math.abs(o.x - op.x) + Math.abs(o.z - op.z) + Math.abs(o.L - op.L) <= 1) list.push(o);
            }
        }
        for (const o of list) this._put(s, o, v);
        while (P.i < P.ops.length && P.ops[P.i].done) P.i++;
        if (P.i >= P.ops.length) this._finish(s);
    }

    _put(s, o, v) {
        o.done = true; o.by = null;
        const t = this.data;
        if (!t) return;
        const cur = t.get(o.x, o.L, o.z);
        if (cur === o.t) return;
        if (o.t !== BLOCK.AIR && this._occupied(o)) { const n = (o.skips || 0) + 1; if (n < 6) s.plan.ops.push({ ...o, done: false, by: null, skips: n }); return; }
        t.set(o.x, o.L, o.z, o.t);
        this._edits.push([o.x, o.L, o.z, o.t]);
        const k = o.x + ',' + o.L + ',' + o.z;
        this.log.delete(k);
        this.log.set(k, [o.x, o.L, o.z, o.t, this.game.explosions?.length || 0]);
        if (this.log.size > REBUILD.LOG) this.log.delete(this.log.keys().next().value);
        // (a puff of dust where it went in; heard near)
        const fx = this.game.fx, me = this.game.character?.group.position;
        if (v && fx?.spark && me && Math.hypot(me.x - o.x, me.z - o.z) < 60) {
            for (let i = 0; i < 4; i++) fx.spark(new THREE.Vector3(o.x + (Math.random() - 0.5), o.L - 1 + (Math.random() - 0.5), o.z + (Math.random() - 0.5)), 0xb8ad98, 0.12, new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.8, (Math.random() - 0.5) * 1.5), 0.7);
        }
    }

    _done(s, op) { op.done = true; op.by = null; }

    /** Somebody stands where the block goes (a player, a person, an animal): later. */
    _occupied(o) {
        const g = this.game;
        const y = o.L - 1;
        const inside = (x, fy, z, h = 4.6) => Math.abs(x - o.x) < 0.9 && Math.abs(z - o.z) < 0.9 && y > fy - 0.6 && y < fy + h;
        const me = g.character?.group.position;
        if (me && inside(me.x, me.y - 1.95, me.z)) return true;
        for (const [, r] of g.remotes || []) if (r.position && inside(r.position.x, r.position.y - 1.95, r.position.z)) return true;
        for (const v of this.life.byId.values()) if (!v.dead && inside(v.x, v.y, v.z)) return true;
        for (const a of g.animals?.list || []) if (!a.dead && inside(a.group.position.x, a.group.position.y, a.group.position.z, 2)) return true;
        return false;
    }

    _finish(s) {
        this._send(s);
        s.plan = null;
        s.cart = null;
        this._sendSite(s);
        this.sites.delete(s.def.id);
        const g = this.game, me = g.character?.group.position;
        if (me && this.life._inLand(s.def, me, 40)) g.hud?.toast?.(`🏗️ Строители закончили: ${s.def.name || 'замок'} снова как был`);
    }

    /**
     * The blocks put back go to everybody. (Not into the players' own edits: the save keeps them in
     * `log`, replayed after the blasts — so a big repair never pushes a player's buildings out of it.)
     */
    _flush() {
        if (!this._edits.length) return;
        const list = this._edits;
        this._edits = [];
        this.game.sync?.blocks?.(list);
    }

    /** A player changed these cells (built, took, melted) after the builders: theirs now. */
    forget(list) {
        if (!this.log.size) return;
        for (const e of list) this.log.delete(e[0] + ',' + e[1] + ',' + e[2]);
    }

    // ---------------------------------------------- the cart, scaffolding
    _placeCart(s) {
        const cs = this.life.castles.get(s.def.id);
        const op = s.plan.ops[0];
        const g2 = cs?.graph;
        if (!g2) return;
        const n = g2.nodes[g2.nearest(op.x, s.def.F ?? 0, op.z, 6)];
        if (!n) return;
        s.cart = [n.x + 1.5, n.y, n.z + 1.5, Math.random() * Math.PI * 2];
        this._sendSite(s);
    }

    _dropScaf(s) {
        if (!s.scaf.length) return;
        s.scaf = [];
        this._sendSite(s);
    }

    _sendSite(s) {
        const scaf = s.scaf.map((q) => [q.x, q.z, Math.round(q.y0 * 10) / 10, Math.round(q.y1 * 10) / 10]);
        const cart = s.plan ? s.cart : null;
        this.show(s.def.id, scaf, cart);
        this.game.sync?.rebuildSite?.(s.def.id, scaf, cart);
    }

    /** Draw a castle's scaffolding and the cart (host and guests alike). */
    show(id, scaf, cart) {
        const g = this.game;
        if (!g.scene) return;
        const old = this.meshes.get(id);
        if (old) { g.scene.remove(old); old.traverse((o) => { if (o.isMesh) o.material.dispose?.(); }); this.meshes.delete(id); }
        if (!scaf?.length && !cart) return;
        const grp = new THREE.Group();
        const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
        const wood = mat(WOODC), pole = mat(POLE), stone = mat(STONEC);
        const box = (m, sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(_box, m); b.scale.set(sx, sy, sz); b.position.set(x, y, z); b.castShadow = true; grp.add(b); return b; };
        for (const [x, z, y0, y1] of scaf || []) {
            const h = y1 - y0 + 1.2;
            for (const [ox, oz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) box(pole, 0.14, h, 0.14, x + ox, y0 + h / 2, z + oz);
            box(wood, 1.9, 0.12, 1.9, x, y1 - 0.06, z); // the boards they stand on
            for (let y = y0 + 1.5; y < y1 - 0.5; y += 1.5) { box(pole, 1.7, 0.09, 0.09, x, y, z - 0.8); box(pole, 1.7, 0.09, 0.09, x, y, z + 0.8); } // the rungs
        }
        if (cart) {
            const [x, y, z, yaw] = cart;
            const c = new THREE.Group();
            c.position.set(x, y, z); c.rotation.y = yaw;
            const add = (m, sx, sy, sz, px, py, pz) => { const b = new THREE.Mesh(_box, m); b.scale.set(sx, sy, sz); b.position.set(px, py, pz); b.castShadow = true; c.add(b); };
            add(wood, 2.2, 0.15, 1.3, 0, 0.75, 0);
            add(wood, 2.2, 0.45, 0.08, 0, 1.0, 0.62); add(wood, 2.2, 0.45, 0.08, 0, 1.0, -0.62);
            add(wood, 0.08, 0.45, 1.3, 1.08, 1.0, 0); add(wood, 0.08, 0.45, 1.3, -1.08, 1.0, 0);
            add(pole, 1.6, 0.1, 0.1, 1.9, 0.75, 0.35); add(pole, 1.6, 0.1, 0.1, 1.9, 0.75, -0.35); // the shafts
            for (const [px, pz, k] of [[-0.5, 0.2, 0.42], [0.1, -0.25, 0.5], [0.55, 0.2, 0.4], [-0.15, 0.3, 0.36], [0.3, 0.05, 0.45]]) add(stone, k, k, k, px, 1.05 + k / 2, pz);
            for (const sz of [0.7, -0.7]) { const w = new THREE.Mesh(_cyl, wood); w.scale.set(1.2, 1, 1.2); w.rotation.x = Math.PI / 2; w.position.set(0, 0.6, sz); c.add(w); }
            grp.add(c);
        }
        g.scene.add(grp);
        this.meshes.set(id, grp);
    }

    /** (guests) the host's scaffolding and cart. */
    applyNet(id, scaf, cart) { this.show(String(id), Array.isArray(scaf) ? scaf.slice(0, 64) : [], Array.isArray(cart) ? cart : null); }

    // ------------------------------------------------------- save, net
    snapshot() {
        const sites = [];
        for (const s of this.sites.values()) sites.push([s.def.id, s.box, Math.round(Math.min(3600, this._t - s.at))]);
        return { sites, log: [...this.log.values()] };
    }

    /** After the blasts were replayed (load / joining): what the builders put back stands again. */
    restore(data) {
        if (!data) return;
        const t = this.data;
        const log = Array.isArray(data.log) ? data.log.filter((e) => Array.isArray(e) && e.length >= 5) : [];
        const keep = stillStanding(log, this.game.explosions || []);
        if (t) for (const [x, L, z, type] of keep) if (t.get(x, L, z) !== type) t.set(x, L, z, type);
        this.log = new Map(keep.map((e) => [e[0] + ',' + e[1] + ',' + e[2], e]));
        for (const [id, box, quiet] of data.sites || []) {
            const cs = this.life._runtimeById?.(id);
            if (!cs || !Array.isArray(box)) continue;
            this.sites.set(id, { def: cs.def, box, at: this._t - (quiet || 0), plan: null, scan: null, workers: new Set(), scaf: [], cart: null, credit: 0 });
        }
    }

    dispose() {
        for (const id of [...this.meshes.keys()]) this.show(id, [], null);
        this.sites.clear();
    }
}
