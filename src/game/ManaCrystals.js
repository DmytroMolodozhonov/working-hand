/**
 * ManaCrystals.js — glowing blue mana crystals deep in caves.
 *
 *   Where: in the far part of a cave's chamber (never at the way in), by the wall,
 *          in about 40 % of caves: one cluster of 3–5 crystals growing out of the
 *          rock — hexagonal prisms with pointed tips, translucent, glowing, a soft
 *          blue light around them. The same cave always has the same crystals
 *          (from the world's seed); the ones taken are gone for everybody (synced,
 *          and kept in the world save). In Creative one lies on a pedestal too.
 *   Break (the author: «раскалываю прямо где он находится — сжимаю его прямо в скале»):
 *          - by hand, right in the rock: reach out with an open hand (the hand lies on the crystal —
 *            it never goes through it: HandBlocks asks `solidAt`) and squeeze the fingers on it — it
 *            cracks where it grows: shards, a ring, a flash, and its power flies as sparkles into
 *            the one who broke it: +1 cell of mana (Mana.crystal — cells are the MAXIMUM). It never
 *            goes into the slots that way. A fist bumping into it breaks nothing.
 *          - by ANYTHING that breaks it: «Бомбардо» (Game.applyExplosion), «Liquidation», «Инспириус»,
 *            Total Destruction, lightning, an earthquake under it, a blade swung into it, «Акцио»
 *            tearing it out, the rock under its foot gone — the same burst, the power to whoever broke
 *            it (`burst`). The host decides who that was (a guest asks it: 'mcq'), everybody sees the
 *            burst and the sparkles fly to that player ('mcb'). Creatures and NPC (wizards, monsters,
 *            villagers…) get nothing: the power has nobody to go into — it scatters.
 *   Keep:  only «Gather» pointed at the cluster takes them whole — into the slots. A crystal taken
 *          from a slot is in the hand (seen: Items GRIPPED); squeeze the hand — it cracks: +1 cell.
 *          (Chests, the wizards' shop and Creative's pedestal give them as things too.)
 *   Broken ones are gone for everybody (synced, kept in the world save: `taken`, a set of short ids;
 *   a cave's cluster far behind is put away and made again with them still gone).
 */

import * as THREE from 'three';
import { crystalMesh } from './CrystalModel.js';
import { newUid } from './ItemTypes.js';
import { CappedLog } from '../core/CappedLog.js';
import { BLOCK, CHUNK } from '../world/Terrain.js';

export const CRYSTAL = {
    CHANCE: 0.4, // share of caves with a cluster (rare)
    MIN: 3,
    MAX: 5,
    NEAR: 90, // m: clusters are made for caves this close
    FAR: 260, // m (x or z): a cluster this far is put away
    // (the camera guesses how far forward a hand is only roughly: a hand closing on a crystal
    // the eye sees it at is taken — it was 0.16 m, and the fingers mostly closed on air)
    TOUCH: 0.35, // m from a crystal's surface: the fingers close on it
    LIGHT_RANGE: 18, // m: the soft light shines at the nearest cluster this close
    OPEN: 0.42, // finger curl below this: an open hand
    CLOSED: 0.55, // …above this: the fingers closed on it (squeezed)
    OPEN_MS: 2.5, // s: the hand was open this lately (reaching out open, then squeezing) — a fist bumping into it breaks nothing
    GATHER_RANGE: 10, // m
    GATHER_CONE: 0.45, // rad (as «Акцио»)
    BLADE_SPEED: 1.5, // m/s: a blade's tip moving this fast into a crystal cracks it
    POWER_SPEED: 9, // m/s: the power flying to the one who broke it (faster as it goes)
    BLAME_S: 5, // s: rock gone under a crystal this soon after a blast near it — that blast broke it
    SKIN: 0.02, // m: the hand lies on its surface
};

/** A small seeded random generator from a string (same string + seed → same numbers). */
function rng(str, seed) {
    let h = 2166136261 ^ (Math.floor(Number(seed) || 0) | 0);
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    let s = h >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** How far a point is from the cave's way in (m). */
export function caveDepth(cv, x, z) {
    return Math.hypot(x - cv.ex, z - cv.ez);
}

/** Deep in the cave: in the chamber (or its wall) and far from the way in. */
export function isDeepInCave(cv, x, z) {
    return Math.hypot(x - cv.kx, z - cv.kz) <= cv.r + 1 && caveDepth(cv, x, z) >= Math.max(8, cv.r + 2);
}

/** Is this column dug out by the cave (Terrain._carveCaves: the tunnel and the chamber)? */
function carved(cv, x, z) {
    const cx = Math.round(x), cz = Math.round(z);
    if (Math.hypot(cx - cv.kx, cz - cv.kz) <= cv.r) return true;
    const sx = cv.kx - cv.ex, sz = cv.kz - cv.ez;
    const t = Math.max(0, Math.min(1, ((cx - cv.ex) * sx + (cz - cv.ez) * sz) / (sx * sx + sz * sz || 1)));
    return Math.hypot(cx - (cv.ex + sx * t), cz - (cv.ez + sz * t)) <= 1.6;
}

/**
 * The crystal cluster of a cave (Terrain.caveOf), or null (most caves have none).
 * Deterministic: the same cave and seed always give the same crystals.
 * `heightAt(x, z)` (the world's recipe, TerrainData.heightAt): crystals only where rock is
 * really over them (a chamber whose wall comes out in the open has none there).
 * @returns {{id, cave, x, y, z, crystals: {id, x, y, z, h, r, ax, ay, az}[]}|null}
 */
export function crystalCluster(cv, seed = 0, heightAt = null) {
    if (!cv) return null;
    const rnd = rng(cv.id, seed);
    if (rnd() >= CRYSTAL.CHANCE && !cv.test) return null; // (the creative test cave always has them)
    // the far side of the chamber (away from the tunnel), out of its rock wall at hand height
    const ta = Math.atan2(cv.ez - cv.kz, cv.ex - cv.kx);
    const a = ta + Math.PI + (rnd() - 0.5) * 1.6;
    const ux = Math.cos(a), uz = Math.sin(a);
    let t = cv.r - 1.5;
    while (t < cv.r + 2 && carved(cv, cv.kx + ux * t, cv.kz + uz * t)) t += 0.05;
    t += 0.12; // (the feet sunk in the rock)
    const x = cv.kx + ux * t, z = cv.kz + uz * t;
    const floor = cv.F - 0.5; // the top of the chamber's floor
    const y = floor + 1.5 + rnd() * 0.35;
    const n = CRYSTAL.MIN + Math.floor(rnd() * (CRYSTAL.MAX - CRYSTAL.MIN + 1));
    const inX = -ux, inZ = -uz; // out of the wall, into the chamber
    const tx = -uz, tz = ux; // along the wall
    const crystals = [];
    for (let i = 0; i < n; i++) {
        const along = i === 0 ? 0 : (rnd() - 0.5) * 0.7, up = i === 0 ? 0 : (rnd() - 0.5) * 0.5;
        const h = (i === 0 ? 0.62 : 0.32) + rnd() * 0.3;
        const r = 0.05 + h * 0.1 + rnd() * 0.02;
        const rise = (i === 0 ? 0.35 : 0.1) + rnd() * 0.55; // tips up a little, like gems in a geode
        const turn = (rnd() - 0.5) * 1.0;
        const hx = inX * Math.cos(turn) - inZ * Math.sin(turn), hz = inX * Math.sin(turn) + inZ * Math.cos(turn);
        // (the wall is jagged: the foot goes back into the rock, the crystal sticks well out of it)
        let bx = x + tx * along, bz = z + tz * along;
        for (let k = 0; k < 40 && carved(cv, bx, bz); k++) { bx -= inX * 0.05; bz -= inZ * 0.05; }
        let out = 0;
        while (out < 2 && !carved(cv, bx + hx * out, bz + hz * out)) out += 0.05;
        const len = Math.max(h, (out + 0.25) / Math.cos(rise));
        const cy = Math.min(y + up, floor + 2.0 - len * Math.sin(rise));
        if (heightAt && heightAt(Math.round(bx), Math.round(bz)) < Math.floor(cy + 1.5) + 1) continue; // (no rock to grow out of)
        crystals.push({
            id: `${cv.id}:${i}`,
            x: bx, y: cy, z: bz,
            h: len, r, ax: hx * Math.cos(rise), ay: Math.sin(rise), az: hz * Math.cos(rise),
        });
    }
    if (crystals.length < CRYSTAL.MIN) return null;
    return { id: 'mc' + cv.id, cave: cv.id, x, y, z, floor, crystals };
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _p = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

/** Distance from p to the segment a–b. */
function segDist(p, a, b) {
    const ab = _v3.subVectors(b, a);
    const t = Math.max(0, Math.min(1, _v.subVectors(p, a).dot(ab) / (ab.lengthSq() || 1)));
    return _v.copy(a).addScaledVector(ab, t).distanceTo(p);
}

/** Closest distance between the segments p1–q1 and p2–q2 (a blade and a crystal). */
export function segSegDist(p1, q1, p2, q2) {
    const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
    const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
    const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    let s = 0, t = 0;
    if (a < 1e-9) t = e < 1e-9 ? 0 : Math.max(0, Math.min(1, f / e));
    else {
        const c = d1x * rx + d1y * ry + d1z * rz;
        if (e < 1e-9) s = Math.max(0, Math.min(1, -c / a));
        else {
            const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
            s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
            t = (b * s + f) / e;
            if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
        }
    }
    return Math.hypot(rx + d1x * s - d2x * t, ry + d1y * s - d2y * t, rz + d1z * s - d2z * t);
}

export class ManaCrystals {
    constructor(game) {
        this.game = game;
        this.enabled = !game.config?.map && game.config?.mode !== 'test';
        this.clusters = new Map(); // cave id -> {data, group, list:[{id, mesh, base, tip, center, r}]} | null
        this.taken = new Set(); // crystal ids broken (everybody's)
        this.powers = []; // the power of a broken crystal flying to the one who broke it
        this.near = []; // the growing crystals by me (hands lie on them: solidAt)
        this._recent = []; // the last blasts near crystals (who broke the rock under one): {p, r, by, t}
        this._t = 0;
        this._time = 0;
        this._open = { right: -1e9, left: -1e9 }; // when each hand was last seen open
        this._hold = { right: null, left: null }; // a crystal held from a slot: {uid, open} — squeezed after the hand opened
        this._tip = { right: null, left: null }; // a held blade's tip last frame (its speed)
        this.log = new CappedLog(); // (tests) what happened
        // ONE soft light for the nearest cluster: made now, before the shaders are compiled
        if (game.scene) {
            this.light = new THREE.PointLight(0x4fa8ff, 0, 8, 2);
            this.light.castShadow = false;
            game.scene.add(this.light);
        }
    }

    get seed() {
        return this.game.terrain?.data?.seed ?? this.game.seed ?? 0;
    }

    // ============================================================ the caves
    update(dt) {
        if (!this.enabled) return;
        this._time += dt;
        this._dt = dt;
        this._t -= dt;
        if (this._t <= 0) { this._t = 1; this._ensureNear(); this._unsupported(); }
        this._nearMe();
        this._light();
        if (this.game.currentPose && !this.game.combat?.dead) {
            this._hands();
            this._crush();
            this._blades(dt);
        }
        this._fly(dt);
    }

    _ensureNear() {
        const t = this.game.terrain?.data;
        if (!t?.cavesNear) return;
        const p = this.game.character.group.position;
        // (a cave's cluster far behind is put away — made again from the same seed when one comes back;
        // the broken ones stay broken: `taken`. A long flight otherwise left every cave's crystals.)
        for (const [id, cl] of this.clusters) {
            const far = cl ? Math.abs(cl.data.x - p.x) > CRYSTAL.FAR || Math.abs(cl.data.z - p.z) > CRYSTAL.FAR : this.clusters.size > 400;
            if (!far) continue;
            if (cl) this.game.scene?.remove(cl.group);
            this.clusters.delete(id);
        }
        for (const cv of t.cavesNear(p.x, p.z, CRYSTAL.NEAR)) {
            if (this.clusters.has(cv.id)) continue;
            this.addCluster(cv.id, crystalCluster(cv, t.seed, t.heightAt));
        }
    }

    /** Make a cluster's crystals (null: that cave has none). */
    addCluster(caveId, data) {
        if (!data) { this.clusters.set(caveId, null); return null; }
        const group = new THREE.Group();
        const list = [];
        for (const c of data.crystals) {
            const mesh = crystalMesh(c.h, c.r);
            const axis = new THREE.Vector3(c.ax, c.ay, c.az).normalize();
            mesh.position.set(c.x, c.y, c.z);
            mesh.quaternion.setFromUnitVectors(_Y, axis);
            mesh.rotateY((c.h * 97) % (Math.PI / 3)); // (each turned its own way round its axis)
            mesh.visible = !this.taken.has(c.id);
            group.add(mesh);
            const base = new THREE.Vector3(c.x, c.y, c.z);
            const tip = base.clone().addScaledVector(axis, c.h);
            list.push({ id: c.id, mesh, base, tip, center: base.clone().lerp(tip, 0.5), r: c.r, h: c.h, cluster: caveId, rock: false });
        }
        this.game.scene?.add(group);
        const cl = { data, group, list };
        this.clusters.set(caveId, cl);
        return cl;
    }

    /** Crystals still growing (not broken). */
    growing() {
        const out = [];
        for (const cl of this.clusters.values()) if (cl) for (const c of cl.list) if (!this.taken.has(c.id)) out.push(c);
        return out;
    }

    /** The growing crystals within a few metres of me (a short list: the hands' collision asks it often). */
    _nearMe() {
        const p = this.game.character?.group?.position;
        this.near.length = 0;
        if (!p) return;
        for (const cl of this.clusters.values()) {
            if (!cl || Math.abs(cl.data.x - p.x) > 8 || Math.abs(cl.data.z - p.z) > 8) continue;
            for (const c of cl.list) if (!this.taken.has(c.id)) this.near.push(c);
        }
    }

    /**
     * Is this point inside a growing crystal by me? (HandBlocks: the palm and the fingertips never go
     * into it — the hand lies on it; what the hand holds neither.)
     */
    solidAt(x, y, z) {
        const L = this.near;
        if (!L.length) return false;
        for (let i = 0; i < L.length; i++) {
            const c = L[i];
            if (Math.abs(x - c.center.x) > c.h || Math.abs(y - c.center.y) > c.h || Math.abs(z - c.center.z) > c.h) continue;
            if (segDist(_p.set(x, y, z), c.base, c.tip) < c.r + CRYSTAL.SKIN) return true;
        }
        return false;
    }

    _light() {
        const L = this.light;
        if (!L) return;
        const p = this.game.character.group.position;
        let best = null, bd = CRYSTAL.LIGHT_RANGE;
        for (const cl of this.clusters.values()) {
            if (!cl || !cl.list.some((c) => !this.taken.has(c.id))) continue;
            const d = Math.hypot(cl.data.x - p.x, cl.data.z - p.z);
            if (d < bd) { bd = d; best = cl; }
        }
        if (!best) { L.intensity = 0; return; }
        L.position.set(best.data.x, best.data.y + 0.7, best.data.z);
        const left = best.list.filter((c) => !this.taken.has(c.id)).length;
        L.intensity = (0.9 + 0.25 * left / best.list.length) * (0.85 + 0.15 * Math.sin(this._time * 1.7));
    }

    // ======================================================== taken / sync
    /** Crystals are taken whole («Gather»: into the slots — here; told to the others). */
    take(ids, broadcast = true) {
        const now = ids.filter((id) => !this.taken.has(id));
        if (!now.length) return [];
        this.applyGone(now);
        if (broadcast) this.game.sync?.crystalsGone?.(now);
        return now;
    }

    /** (network / save) these crystals are gone. */
    applyGone(ids) {
        for (const id of ids || []) {
            this.taken.add(String(id));
            const c = this._byId(String(id));
            if (c) c.mesh.visible = false;
        }
    }

    _byId(id) {
        const cl = this.clusters.get(id.slice(0, id.lastIndexOf(':')));
        if (cl) for (const c of cl.list) if (c.id === id) return c;
        for (const k of this.clusters.values()) if (k) for (const c of k.list) if (c.id === id) return c;
        return null;
    }

    snapshot() {
        return [...this.taken];
    }

    restore(list) {
        if (Array.isArray(list)) this.applyGone(list.map(String));
    }

    // ============================================================ breaking
    /**
     * These growing crystals are broken by `by` (a player's id; anything else — a creature, nobody —
     * gets nothing). The HOST decides: a guest asks it for its own breaking ('mcq'); the host
     * bursts them for everybody ('mcb'). True: done (or asked).
     */
    burst(ids, by = null, kind = null) {
        const g = this.game;
        if (by === 'local') by = g.localId;
        const now = ids.filter((id) => !this.taken.has(id));
        if (!now.length) return false;
        if (!g.authority) {
            if (by === g.localId) g.sync?.crystalAsk?.(now, kind);
            return by === g.localId;
        }
        const pts = now.map((id) => { const c = this._byId(id); return c ? c.center.clone() : null; });
        this.onBurst(now, by, pts, kind);
        g.sync?.crystalBurst?.(now, by, pts);
        return true;
    }

    /** (every computer) the crystals crack where they grow: shards, a ring, a flash — the power flies to `by`. */
    onBurst(ids, by, pts = [], kind = null) {
        const g = this.game;
        const fresh = ids.filter((id) => !this.taken.has(String(id)));
        const cs = ids.map((id) => this._byId(String(id)));
        this.applyGone(ids);
        ids.forEach((id, i) => {
            const p = cs[i]?.center || (pts[i] ? _v2.set(pts[i].x, pts[i].y, pts[i].z) : null);
            if (!p) return;
            this.shatterFx(p);
            this._power(p, by, by === g.localId && fresh.includes(id));
        });
        this.log.push({ ev: 'burst', n: ids.length, by, kind });
    }

    /**
     * Anything that breaks things in an area (blasts, Inspirius, Total Destruction, lightning, an
     * earthquake) — on the host: the crystals in it crack, their power to `by` (a player) or to nobody.
     * `flat`: an earthquake shakes the rock under it this deep too (only the horizontal distance counts).
     */
    hitAt(p, r, by = null, kind = null, flat = 0) {
        const g = this.game;
        if (!this.enabled || !g.authority || !p) return 0;
        if (g.temple?.wards?.(p, r)) return 0; // (the gods' ward: nothing in it breaks)
        if (by === 'local') by = g.localId;
        let any = false; // (no crystals about — the usual case: nothing to remember, no garbage)
        for (const cl of this.clusters.values()) if (cl && Math.abs(cl.data.x - p.x) < r + 20 && Math.abs(cl.data.z - p.z) < r + 20) { any = true; break; }
        if (!any) return 0;
        this._recent.push({ p: new THREE.Vector3(p.x, p.y, p.z), r, by, t: this._time, flat });
        if (this._recent.length > 8) this._recent.shift();
        const ids = [];
        for (const cl of this.clusters.values()) {
            if (!cl || Math.abs(cl.data.x - p.x) > r + 3 || Math.abs(cl.data.z - p.z) > r + 3) continue;
            for (const c of cl.list) {
                if (this.taken.has(c.id)) continue;
                const d = flat ? (Math.abs(c.center.y - p.y) < flat ? Math.hypot(c.center.x - p.x, c.center.z - p.z) : Infinity) : segDist(p, c.base, c.tip) - c.r;
                if (d < r) ids.push(c.id);
            }
        }
        if (ids.length) this.burst(ids, by, kind);
        return ids.length;
    }

    /**
     * (the host, once a second) a crystal whose rock is gone under its foot (dug, melted, washed away,
     * blown up) cracks — nothing hangs in the air. Whose doing: the last blast near it, else nobody.
     * (Only once its rock was seen there, in a chunk this computer has: a part of the world not yet built
     * here is not "gone".)
     */
    _unsupported() {
        const g = this.game, data = g.terrain?.data;
        if (!g.authority || !data?.get) return;
        let lost = null;
        for (const cl of this.clusters.values()) {
            if (!cl) continue;
            for (const c of cl.list) {
                if (this.taken.has(c.id)) continue;
                const ix = Math.round(c.base.x), iz = Math.round(c.base.z);
                if (data.hasChunk && !data.hasChunk(Math.floor(ix / CHUNK), Math.floor(iz / CHUNK))) continue; // (never made here: never a chunk built in the frame)
                const t = data.get(ix, Math.floor(c.base.y + 1.5), iz);
                const gone = t === BLOCK.AIR || t === BLOCK.WATER;
                if (!gone) { c.rock = true; continue; }
                if (c.rock) (lost || (lost = [])).push(c);
            }
        }
        if (!lost) return;
        for (const c of lost) this.burst([c.id], this._blame(c.center), 'rock');
    }

    _blame(p) {
        for (let i = this._recent.length - 1; i >= 0; i--) {
            const b = this._recent[i];
            if (this._time - b.t > CRYSTAL.BLAME_S) break;
            const d = b.flat ? Math.hypot(b.p.x - p.x, b.p.z - p.z) : b.p.distanceTo(p);
            if (d < b.r + 4) return b.by;
        }
        return null;
    }

    /**
     * Squeezed right in the rock: a hand that was open a moment ago (reaching out open) closes on a
     * crystal — it cracks there and then. A fist bumping into it breaks nothing.
     */
    _hands() {
        const g = this.game, ch = g.character;
        const now = this._time;
        for (const side of ['right', 'left']) {
            if (g.items?.held[side] || g.weapons?.hands?.[side]?.held) continue; // (a crystal in the hand: _crush)
            const curl = ch.getGripCurl ? ch.getGripCurl(side) : 0;
            if (curl < CRYSTAL.OPEN) { this._open[side] = now; continue; }
            if (curl < CRYSTAL.CLOSED || now - this._open[side] > CRYSTAL.OPEN_MS) continue;
            const hand = ch.getGripObject ? ch.getGripObject(side).getWorldPosition(_v2) : ch.getHandWorldPosition(side, _v2); // (the palm)
            const near = this.nearest(hand);
            if (!near) continue;
            this._open[side] = -1e9; // (one squeeze — one crystal)
            this.squeeze(near, side);
        }
    }

    /** My hand squeezed this growing crystal: it cracks, its power into me. */
    squeeze(c, side = 'right') {
        if (this.taken.has(c.id)) return false;
        if (!this.burst([c.id], this.game.localId, 'hand')) return false;
        this.log.push({ ev: 'squeeze', id: c.id, side });
        return true;
    }

    /** The growing crystal a hand at `hand` closes on (within TOUCH of its surface), or null. */
    nearest(hand) {
        let near = null, nd = CRYSTAL.TOUCH;
        for (const cl of this.clusters.values()) {
            if (!cl || Math.abs(cl.data.x - hand.x) > 3 || Math.abs(cl.data.z - hand.z) > 3) continue;
            for (const c of cl.list) {
                if (this.taken.has(c.id) || c.center.distanceTo(hand) > 1.2) continue;
                const d = segDist(hand, c.base, c.tip) - c.r;
                if (d < nd) { nd = d; near = c; }
            }
        }
        return near;
    }

    /**
     * A crystal held in a hand (from a slot: «Gather», a chest, the shop): the hand opens on it, then
     * squeezes — it cracks in the fist, its power into me. (Held in an open palm it is carried — to a
     * cauldron, say.)
     */
    _crush() {
        const g = this.game, ch = g.character;
        for (const side of ['right', 'left']) {
            const h = g.items?.held[side];
            if (!h || h.item.kind !== 'crystal') { this._hold[side] = null; continue; }
            let k = this._hold[side];
            if (!k || k.uid !== h.item.uid) k = this._hold[side] = { uid: h.item.uid, open: false };
            const curl = ch.getGripCurl ? ch.getGripCurl(side) : 0;
            if (curl < CRYSTAL.OPEN) k.open = true;
            else if (k.open && curl > CRYSTAL.CLOSED) { k.open = false; this.crushHeld(side); }
        }
    }

    /** The held crystal cracks in the fist: +1 cell of mana. (My own thing: no host needed.) */
    crushHeld(side) {
        const g = this.game;
        const h = g.items?.held[side];
        if (!h || h.item.kind !== 'crystal') return false;
        const p = h.model.position.clone();
        h.item.count = (h.item.count || 1) - 1;
        if (h.item.count <= 0) g.items.releaseHand(side);
        else g.sync?.itemHold?.(side, h.item);
        this.shatterFx(p);
        this._power(p, g.localId, true);
        g.sync?.crystalFx?.(p, g.localId);
        this.log.push({ ev: 'crush', side });
        return true;
    }

    /**
     * (host) crystals that were things (lying about, `n` of them) broken by `by` — a splash of
     * «Liquidation»: they crack, their power to `by` (told to everybody, `by` credited on his computer).
     */
    thingBurst(p, n = 1, by = null) {
        const g = this.game;
        if (by === 'local') by = g.localId;
        this.shatterFx(p);
        for (let i = 0; i < n; i++) this._power(p, by, by === g.localId);
        g.sync?.crystalFx?.(p, by, n);
        this.log.push({ ev: 'thing', n, by });
    }

    /** (network) a crystal cracked in somebody's fist (or a thing broken by the host's say — `n` cells to `by`). */
    remoteFx(p, by, n = 0) {
        const g = this.game;
        this.shatterFx(p);
        if (!by) return;
        if (by !== g.localId) this._power(p, by, false);
        else for (let i = 0; i < Math.min(10, n); i++) this._power(p, by, true); // (mine: the host says so)
    }

    /** A blade in my hand swung into a growing crystal: it cracks. */
    _blades(dt) {
        const g = this.game;
        for (const side of ['right', 'left']) {
            const w = g.weapons?.hands?.[side]?.held;
            if (!w?.getBladeSegment || !this.near.length) { this._tip[side] = null; continue; }
            const [a, b] = w.getBladeSegment(_v2.set(0, 0, 0), _p.set(0, 0, 0));
            const last = this._tip[side] || (this._tip[side] = b.clone());
            const speed = last.distanceTo(b) / Math.max(1e-3, dt);
            last.copy(b);
            if (speed < CRYSTAL.BLADE_SPEED) continue;
            for (const c of this.near) {
                if (this.taken.has(c.id)) continue;
                if (segSegDist(a, b, c.base, c.tip) < c.r + 0.04) { this.burst([c.id], g.localId, 'blade'); this.log.push({ ev: 'blade', id: c.id }); break; }
            }
        }
    }

    /** «Gather» at a cluster: all its crystals into the slots. A message, or null if none was pointed at. */
    gatherAt(o, d, side = 'right') {
        let best = null;
        for (const c of this.growing()) {
            const to = _v.subVectors(c.center, o);
            const dist = to.length();
            if (dist > CRYSTAL.GATHER_RANGE) continue;
            const ang = d.angleTo(to.normalize());
            if (ang > CRYSTAL.GATHER_CONE) continue;
            if (this._blocked(o, to.clone(), dist)) continue; // (along the line to it)
            if (!best || ang < best.ang) best = { c, ang };
        }
        if (!best) return null;
        const cl = this.clusters.get(best.c.cluster);
        const ids = cl.list.filter((c) => !this.taken.has(c.id)).map((c) => c.id);
        const item = { kind: 'crystal', uid: newUid(), count: ids.length };
        if (!this.game.inventory?.storeItem?.(item)) return '🎒 Ячейки полны';
        this.take(ids);
        this.game.builder?._flyToHand?.(best.c.center.clone(), 0x5cb8ff, 24, side);
        this._sparks(best.c.center, 24);
        this.log.push({ ev: 'gather', n: ids.length });
        return `💎 +${ids.length} ${ids.length === 1 ? 'кристалл' : ids.length < 5 ? 'кристалла' : 'кристаллов'} маны в ячейке — возьмите в руку и сожмите`;
    }

    /** Rock between the hand and the crystal? */
    _blocked(o, d, dist) {
        const t = this.game.terrain?.data;
        const hit = t?.raycast?.(o, d, dist);
        return !!hit && Math.hypot(hit.x - o.x, hit.y - o.y, hit.z - o.z) < dist - 0.6;
    }

    /**
     * «Акцио» at a growing crystal: it is torn out of the rock — and a mana crystal torn out cracks
     * (only «Gather» takes them whole): its power flies to me. ({done} for Accio's state.)
     */
    accio(c, side) {
        if (!this.burst([c.id], this.game.localId, 'accio')) return null;
        this.log.push({ ev: 'accio', side });
        return { done: true };
    }

    // ============================================================ the power
    /**
     * The power of a broken crystal flies as blue sparkles into the player `by` (me or another
     * player as this computer sees him); `credit`: it is mine — +1 cell when it reaches me.
     * Nobody (a creature broke it, a falling rock): it scatters where it was.
     */
    _power(p, by, credit) {
        const g = this.game;
        if (credit && !g.scene) { g.mana?.crystal(); return; } // (no picture: at once)
        if (!by || (by !== g.localId && !g.remotes?.get?.(by))) { this._sparks(p, 20, 1.5); return; }
        if (this.powers.length > 12) { const f = this.powers.shift(); if (f.credit) g.mana?.crystal(); }
        this.powers.push({ p: new THREE.Vector3().copy(p), by, credit, t: 0, v: 2 });
    }

    _target(by, out) {
        const g = this.game;
        if (by === g.localId) return g.combat?.center ? g.combat.center(out) : out.copy(g.character.group.position).setY(out.y + 0.6);
        const r = g.remotes?.get?.(by);
        return r?.character?.group ? out.copy(r.character.group.position).setY(out.y + 0.6) : null;
    }

    _fly(dt) {
        if (!this.powers.length) return;
        const g = this.game;
        for (let i = this.powers.length - 1; i >= 0; i--) {
            const f = this.powers[i];
            f.t += dt;
            const to = this._target(f.by, _v2);
            let done = !to || f.t > 3;
            if (to) {
                f.v = Math.min(CRYSTAL.POWER_SPEED * 2.5, f.v + CRYSTAL.POWER_SPEED * dt * 2);
                const d = _v.subVectors(to, f.p).length();
                if (d > 1e-3) f.p.addScaledVector(_v, Math.min(1, (f.v * dt) / d));
                for (let k = 0; k < 2; k++) g.fx?.spark(f.p, k ? 0xdff4ff : 0x5cb8ff, 0.07 + Math.random() * 0.06, _v3.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6), 0.35);
                if (d < 0.5) done = true;
            }
            if (!done) continue;
            this.powers.splice(i, 1);
            if (to) { this._sparks(to, 14, 2); g.fx?.lightFlash?.(to, 0x4fa8ff, 1.5, 0.25, 6); }
            if (f.credit) { g.mana?.crystal(); this.log.push({ ev: 'power' }); }
        }
    }

    shatterFx(p) {
        const g = this.game;
        this._sparks(p, 60, 6);
        g.fx?.lightFlash?.(p, 0x4fa8ff, 3, 0.4, 12);
        if (g.sound) { g.sound.playFrozenHit?.(); g.sound.playIce?.(); }
    }

    _sparks(p, n, speed = 3) {
        const fx = this.game.fx;
        if (!fx) return;
        for (let i = 0; i < n; i++) fx.spark(p, i % 3 ? 0x5cb8ff : 0xdff4ff, 0.08 + Math.random() * 0.08, _v3.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed), 0.7);
    }

    dispose() {
        for (const cl of this.clusters.values()) if (cl) this.game.scene?.remove(cl.group);
        this.light?.parent?.remove(this.light);
    }
}
