/**
 * ManaCrystals.js — glowing blue mana crystals deep in caves.
 *
 *   Where: in the far part of a cave's chamber (never at the way in), by the wall,
 *          in about 40 % of caves: one cluster of 3–5 crystals growing out of the
 *          rock — hexagonal prisms with pointed tips, translucent, glowing, a soft
 *          blue light around them. The same cave always has the same crystals
 *          (from the world's seed); the ones taken are gone for everybody (synced,
 *          and kept in the world save). In Creative one lies on a pedestal too.
 *   Take:  - by hand: reach out to a crystal with an open hand and close the fingers on it —
 *            it breaks off into the hand (a fist bumping into it takes nothing);
 *          - «Gather» pointed at the cluster: all its crystals go into the slots;
 *          - «Акцио» pointed at a crystal: it breaks off and flies to the hand (one by one).
 *   Use:   hold it in one hand, take hold of it with the other hand too (fingers
 *          closed on it), then pull the hands apart or twist them — it shatters into
 *          sparkles and the mana maximum grows by +5 (Mana.js).
 */

import * as THREE from 'three';
import { crystalMesh, crystalItemModel } from './CrystalModel.js';
import { newUid, disposeModel } from './ItemTypes.js';
import { CappedLog } from '../core/CappedLog.js';

export const CRYSTAL = {
    CHANCE: 0.4, // share of caves with a cluster (rare)
    MIN: 3,
    MAX: 5,
    NEAR: 90, // m: clusters are made for caves this close
    FAR: 260, // m (x or z): a cluster this far is put away
    // (the camera guesses how far forward a hand is only roughly: a hand closing on a crystal
    // the eye sees it at is taken — it was 0.16 m, and the fingers mostly closed on air)
    TOUCH: 0.3, // m from a crystal's surface: the fingers close on it
    LIGHT_RANGE: 18, // m: the soft light shines at the nearest cluster this close
    OPEN: 0.42, // finger curl below this: an open hand
    CLOSED: 0.55, // …above this: the fingers closed on it
    OPEN_MS: 1.5, // s: the hand was open this lately (reaching out open, then closing) — a fist bumping into it takes nothing
    LET_GO: 0.3, // s: a hand breaking it may look open for a moment (the camera blurs a fast pull)
    BOTH: 0.45, // m between the palms: the other hand on the held crystal (two palms round a small gem)
    PULL: 0.22, // m the hands move apart (both still holding it): it breaks
    TWIST: 0.9, // rad the hands turn against each other: it breaks
    GATHER_RANGE: 10, // m
    GATHER_CONE: 0.45, // rad (as «Акцио»)
    ACCIO_SPEED: 18, // m/s
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

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

/** Distance from p to the segment a–b. */
function segDist(p, a, b) {
    const ab = _v3.subVectors(b, a);
    const t = Math.max(0, Math.min(1, _v.subVectors(p, a).dot(ab) / (ab.lengthSq() || 1)));
    return _v.copy(a).addScaledVector(ab, t).distanceTo(p);
}

export class ManaCrystals {
    constructor(game) {
        this.game = game;
        this.enabled = !game.config?.map && game.config?.mode !== 'test';
        this.clusters = new Map(); // cave id -> {data, group, list:[{id, mesh, base, tip, center, r}]} | null
        this.taken = new Set(); // crystal ids broken off (everybody's)
        this.flying = []; // crystals flying to my hand («Акцио»)
        this._t = 0;
        this._time = 0;
        this._open = { right: -1e9, left: -1e9 }; // when each hand was last seen open
        this._break = null; // both hands on a held crystal: {side, d0, ang0}
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
        if (this._t <= 0) { this._t = 1; this._ensureNear(); }
        this._light();
        if (this.game.currentPose && !this.game.combat?.dead) {
            this._hands();
            this._twoHands();
        }
        this._fly(dt);
    }

    _ensureNear() {
        const t = this.game.terrain?.data;
        if (!t?.cavesNear) return;
        const p = this.game.character.group.position;
        // (a cave's cluster far behind is put away — made again from the same seed when one comes back;
        // the broken-off ones stay broken: `taken`. A long flight otherwise left every cave's crystals.)
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
            list.push({ id: c.id, mesh, base, tip, center: base.clone().lerp(tip, 0.5), r: c.r, cluster: caveId });
        }
        this.game.scene?.add(group);
        const cl = { data, group, list };
        this.clusters.set(caveId, cl);
        return cl;
    }

    /** Crystals still growing (not broken off). */
    growing() {
        const out = [];
        for (const cl of this.clusters.values()) if (cl) for (const c of cl.list) if (!this.taken.has(c.id)) out.push(c);
        return out;
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
    /** Crystals are broken off (here; told to the others). */
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
            for (const cl of this.clusters.values()) if (cl) for (const c of cl.list) if (c.id === id) c.mesh.visible = false;
        }
    }

    snapshot() {
        return [...this.taken];
    }

    restore(list) {
        if (Array.isArray(list)) this.applyGone(list.map(String));
    }

    // ============================================================== taking
    /** A crystal into my hand (or the slots when the hand is busy). */
    _give(side, n = 1) {
        const g = this.game;
        const h = g.items?.held[side];
        if (h && h.item.kind === 'crystal') { h.item.count = (h.item.count || 1) + n; return; }
        const item = { kind: 'crystal', uid: newUid(), count: n };
        if (!h && !g.weapons?.hands?.[side]?.held && g.items?.takeIntoHand(item, side)) return;
        g.inventory?.storeItem?.(item);
    }

    /** Break this crystal off into the hand. */
    breakOff(c, side) {
        if (!this.take([c.id]).length) return false;
        this._give(side);
        this._sparks(c.center, 18);
        if (this.game.sound) this.game.sound.playIce?.();
        this.game.hud?.setVoice?.('💎 Кристалл маны в руке — возьмитесь за него <b>второй рукой</b> и разломите', true);
        this.log.push({ ev: 'hand', id: c.id, side });
        return true;
    }

    /**
     * The fingers close on a crystal: a hand that was open a moment ago (reaching out open, as for
     * anything) closes at a crystal — it breaks off into it. A fist bumping into it takes nothing.
     */
    _hands() {
        const g = this.game, ch = g.character;
        const now = this._time;
        for (const side of ['right', 'left']) {
            const held = g.items?.held[side];
            if ((held && held.item.kind !== 'crystal') || g.weapons?.hands?.[side]?.held) continue;
            const curl = ch.getGripCurl ? ch.getGripCurl(side) : 0;
            if (curl < CRYSTAL.OPEN) { this._open[side] = now; continue; }
            if (curl < CRYSTAL.CLOSED || now - this._open[side] > CRYSTAL.OPEN_MS) continue;
            const hand = ch.getGripObject ? ch.getGripObject(side).getWorldPosition(_v2) : ch.getHandWorldPosition(side, _v2); // (the palm)
            const near = this.nearest(hand);
            if (!near) continue;
            const other = g.items?.held[side === 'right' ? 'left' : 'right'];
            if (other?.item.kind === 'crystal' && other.model.position.distanceTo(hand) < CRYSTAL.BOTH * 0.6) continue; // (closing on the crystal in the other hand: to break it)
            this._open[side] = -1e9; // (one closing — one crystal)
            this.breakOff(near, side);
        }
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
        return `💎 +${ids.length} ${ids.length === 1 ? 'кристалл' : ids.length < 5 ? 'кристалла' : 'кристаллов'} маны в ячейке`;
    }

    /** Rock between the hand and the crystal? */
    _blocked(o, d, dist) {
        const t = this.game.terrain?.data;
        const hit = t?.raycast?.(o, d, dist);
        return !!hit && Math.hypot(hit.x - o.x, hit.y - o.y, hit.z - o.z) < dist - 0.6;
    }

    /** «Акцио» at a crystal: it breaks off and flies to the hand. */
    accio(c, side) {
        if (!this.take([c.id]).length) return null;
        const model = crystalItemModel();
        model.position.copy(c.center);
        this.game.scene?.add(model);
        const f = { model, side, t: 0, done: false };
        this.flying.push(f);
        this._sparks(c.center, 12);
        return f;
    }

    _fly(dt) {
        if (!this.flying.length) return;
        const g = this.game;
        for (const f of [...this.flying]) {
            f.t += dt;
            const hand = g.character.getGripObject(f.side).getWorldPosition(_v2);
            const to = _v.subVectors(hand, f.model.position);
            const d = to.length();
            if (d > 1e-3) f.model.position.addScaledVector(to, Math.min(1, (CRYSTAL.ACCIO_SPEED * dt) / d));
            f.model.rotation.y += dt * 6;
            if (Math.random() < 0.5) g.fx?.spark(f.model.position, 0x9fd8ff, 0.07, _v3.set(0, 0.4, 0), 0.3);
            if (d < 0.8 || f.t > 4) {
                f.done = true;
                this.flying.splice(this.flying.indexOf(f), 1);
                g.scene?.remove(f.model);
                disposeModel(f.model);
                this._give(f.side);
                g.mana?.success('Accio'); // (it came to the hand)
                this.log.push({ ev: 'accio', side: f.side });
            }
        }
    }

    // ============================================================ breaking
    /**
     * A crystal in one hand, the other hand takes hold of it too (fingers closed on it),
     * then the hands pull apart or twist: it shatters — the mana maximum +5.
     */
    _twoHands() {
        const g = this.game, ch = g.character;
        let A = null;
        for (const s of ['right', 'left']) if (g.items?.held[s]?.item.kind === 'crystal') { A = s; break; }
        if (!A) { this._break = null; return; }
        const B = A === 'right' ? 'left' : 'right';
        const heldB = g.items.held[B];
        if ((heldB && heldB.item.kind !== 'crystal') || g.weapons?.hands?.[B]?.held) { this._break = null; return; }
        const crystal = g.items.held[A].model.position;
        // (the palms, where the fingers close — not the wrists)
        const palm = (sd) => (ch.getGripObject ? ch.getGripObject(sd).getWorldPosition(new THREE.Vector3()) : ch.getHandWorldPosition(sd, new THREE.Vector3()));
        const hA = palm(A), hB = palm(B);
        const curlA = ch.getGripCurl ? ch.getGripCurl(A) : 1;
        const curlB = ch.getGripCurl ? ch.getGripCurl(B) : 0;
        const dirA = ch.getHandDirection(A, new THREE.Vector3()), dirB = ch.getHandDirection(B, new THREE.Vector3());
        const ang = dirA.angleTo(dirB);
        const d = hA.distanceTo(hB);
        const onIt = hB.distanceTo(crystal) < CRYSTAL.BOTH && curlB > 0.45 && curlA > 0.3;
        const K = this._break;
        if (!K) {
            if (onIt) this._break = { side: A, d0: d, ang0: ang, at: this._time, loose: 0 };
            return;
        }
        if (K.side !== A) { this._break = null; return; }
        // (the hands, closed on it, came closer still: the pull is counted from there)
        if (onIt && d < K.d0) K.d0 = d;
        const pulled = d - K.d0 > CRYSTAL.PULL;
        const twisted = Math.abs(ang - K.ang0) > CRYSTAL.TWIST;
        if (pulled || twisted) { this._break = null; this.shatter(A, pulled ? 'pull' : 'twist'); return; }
        // a hand let go of it (not just a blurred moment of a fast pull)
        if (curlB < 0.3 || curlA < 0.2) { K.loose += this._dt || 0; if (K.loose > CRYSTAL.LET_GO) this._break = null; } else K.loose = 0;
    }

    /** The held crystal breaks into sparkles: +5 to the mana maximum. */
    shatter(side, how = 'pull') {
        const g = this.game;
        const h = g.items?.held[side];
        if (!h || h.item.kind !== 'crystal') return false;
        const p = h.model.position.clone();
        h.item.count = (h.item.count || 1) - 1;
        if (h.item.count <= 0) g.items.releaseHand(side);
        else g.sync?.itemHold?.(side, h.item);
        this.shatterFx(p);
        g.sync?.crystalFx?.(p);
        g.mana?.crystal();
        this.log.push({ ev: 'shatter', how });
        return true;
    }

    shatterFx(p) {
        const g = this.game;
        this._sparks(p, 60, 6);
        g.fx?.lightFlash?.(p, 0x4fa8ff, 3, 0.4, 12);
        if (g.sound) g.sound.playFrozenHit?.();
    }

    _sparks(p, n, speed = 3) {
        const fx = this.game.fx;
        if (!fx) return;
        for (let i = 0; i < n; i++) fx.spark(p, i % 3 ? 0x5cb8ff : 0xdff4ff, 0.08 + Math.random() * 0.08, _v3.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed), 0.7);
    }

    dispose() {
        for (const cl of this.clusters.values()) if (cl) this.game.scene?.remove(cl.group);
        for (const f of this.flying) this.game.scene?.remove(f.model);
        this.light?.parent?.remove(this.light);
    }
}
