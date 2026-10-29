/**
 * BurnWreck.js — a house that burns down: nothing is left hanging in the air.
 *
 * Fire (src/world/Fire.js) eats the wooden blocks of a house one by one. Before, the
 * stone and brick parts that stood on the burnt beams, the roof over burnt walls and
 * the chests' things stayed where they were — floating. Now, on every computer (the
 * fire burns the same everywhere; what falls is worked out from the same blocks):
 *  - every few tenths of a second the places where blocks burnt away are checked
 *    (src/world/Collapse.js, as after a blast): bricks, stones, a roof, a piece of
 *    floor that is no longer joined to the ground fall down and land on what is under
 *    them (src/fx/FallingBlocks.js — seen falling, dust, whoever is under them is hurt);
 *    a block still burning falls burning;
 *  - doors with nothing to hang on, beds and chests without a floor, glass without a
 *    wall over it — as after a blast (src/game/Wreck.js);
 *  - things lying on a floor that burnt away fall (they wake up and their physics
 *    finds the floor below);
 *  - a wooden chest standing in the fire catches it and burns down (a few seconds in
 *    the flames). What was in it — on the host, who decides the things:
 *      burns: food (bread, cheese, pie, meat, apples), wool, arrows, a plain bow,
 *             a backpack, logs, cobweb;
 *      falls to the floor / the ground: metal and stone (coins, swords, axes, shields,
 *             cannonballs, horns, a flask, a potion, glass, crystals, the dragon's egg),
 *             the phoenix's feather (it does not burn) and every magic thing (wands,
 *             scrolls, spell books, the hammer, magic weapons: magic keeps them whole).
 *    An opened chest's things floating over it go the same way; an unopened chest's
 *    things are rolled as on opening and only what survives the fire lies in the ashes.
 *
 * A burnt chest stays gone (the house's record makes no new one) until the builders
 * have put the house back (src/game/Rebuild.js → rebuilt()): then the house has its
 * chests again. Not saved (as the burnt blocks themselves).
 */

import * as THREE from 'three';
import { collapseAfter } from '../world/Collapse.js';
import { BLOCK } from '../world/Terrain.js';
import { isMagicItem } from './ItemTypes.js';

export const BURN = {
    LOG_TIME: 3.5, // s a log lying in flames takes to burn down (a little longer or shorter each)
    LOG_SPREAD: 1.6, // m: a burning log lights the logs this near

    TICK: 0.3, // s between the checks of the burnt places
    CELL: 4, // m: burnt blocks closer than this are checked together
    CHEST_HEAT: 3.5, // s in the flames before a chest burns down
    REACH: 1.1, // m: how near the fire must be to a chest
};

/** Kinds of things that burn in a burning chest (the rest falls out of its ashes). */
const FLAMMABLE = new Set(['bread', 'cheese', 'pie', 'steak', 'meat', 'redApple', 'baksadi_pear', 'fern_frond', 'azure_berry', 'sun_herb', 'glowcap_mushroom', 'wool', 'arrows', 'bow', 'backpack', 'logs', 'web']);

/** Does this thing burn in a house fire? (magic keeps magic things whole; metal, stone, glass don't burn) */
export function burnsInFire(it) {
    if (!it) return false;
    if (isMagicItem(it)) return false;
    return FLAMMABLE.has(it.kind);
}

/** Kinds that catch fire lying on the ground (the rest of FLAMMABLE burns only in a burning chest or when its carrier burns). */
const GROUND_FUEL = new Set(['logs']);
export const burnsOnGround = (it) => !!it && GROUND_FUEL.has(it.kind) && burnsInFire(it);

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

export class BurnWreck {
    constructor(game) {
        this.game = game;
        this.cells = []; // [x, L, z] burnt since the last check
        this.t = 0;
        this.burnt = new Set(); // ids of chests burnt down
        this.fuel = new Map(); // uid of a log on the ground -> {t, dur, spread}: burning now
    }

    /** (Fire) A block burnt away (t: what it was). */
    blockGone(x, L, z, t = BLOCK.PLANKS) { this.cells.push([x, L, z, t]); }

    /**
     * (host) Flames at p (radius r): the logs lying there catch fire and burn down in a few seconds
     * (smoke, then ash; a burning log lights those beside it). A log in the hand or the bag burns only with its carrier.
     */
    igniteLoose(p, r = 1.5) {
        const g = this.game;
        if (!g.authority || !g.items?.loose?.size) return;
        for (const [uid, L] of g.items.loose) {
            if (L.hover || this.fuel.has(uid) || !burnsOnGround(L.item)) continue;
            const m = L.model.position;
            if (Math.hypot(m.x - p.x, m.z - p.z) > r + 0.4 || Math.abs(m.y - p.y) > 2.5) continue;
            this.fuel.set(uid, { t: 0, dur: BURN.LOG_TIME * (0.8 + Math.random() * 0.4), spread: 0 });
        }
    }

    _burnLogs(dt) {
        const g = this.game, loose = g.items?.loose;
        for (const [uid, b] of [...this.fuel]) {
            const L = loose?.get(uid);
            if (!L) { this.fuel.delete(uid); continue; }
            const m = L.model.position;
            b.t += dt;
            g.fx?.glow?.spawn(m.x, m.y + 0.2, m.z, (Math.random() - 0.5) * 0.6, 1 + Math.random(), (Math.random() - 0.5) * 0.6, [0xffe08a, 0xffa020, 0xff5a00][(Math.random() * 3) | 0], 0.3, 0.5, { shrink: 1.5 });
            g.fx?.smoke?.spawn(m.x, m.y + 0.6, m.z, (Math.random() - 0.5) * 0.4, 1.4, (Math.random() - 0.5) * 0.4, 0x3a3a3a, 1, 2, { shrink: -0.4 });
            if ((b.spread -= dt) <= 0) { b.spread = 1; this.igniteLoose(m, BURN.LOG_SPREAD); g.fire?.ignite && !b.lit && (b.lit = true, g.fire.ignite(m, 1)); }
            if (b.t < b.dur) continue;
            this.fuel.delete(uid);
            for (let k = 0; k < 5; k++) g.fx?.debrisFrom?.([{ x: m.x + (Math.random() - 0.5) * 0.8, y: m.y + 0.1, z: m.z + (Math.random() - 0.5) * 0.8, color: k % 3 ? 0x2a2420 : 0x6e4a2a, size: 0.3 }], _v.set(m.x, m.y, m.z), 8);
            this._burnItem(L); // (the log is gone, for everybody)
        }
    }

    update(dt) {
        const g = this.game;
        if (this.fuel.size && g.authority) this._burnLogs(dt);
        this.t -= dt;
        if (this.t > 0) return;
        this.t = BURN.TICK;
        this._chests(BURN.TICK);
        if (!this.cells.length) return;
        const list = this.cells;
        this.cells = [];
        const data = g.world?.terrain?.data;
        if (!data) return;
        // the burnt places, a few metres apart
        const groups = new Map();
        for (const c of list) {
            const [x, L, z] = c;
            const k = Math.floor(x / BURN.CELL) + ',' + Math.floor(L / BURN.CELL) + ',' + Math.floor(z / BURN.CELL);
            const e = groups.get(k);
            if (e) { e.x0 = Math.min(e.x0, x); e.x1 = Math.max(e.x1, x); e.L0 = Math.min(e.L0, L); e.L1 = Math.max(e.L1, L); e.z0 = Math.min(e.z0, z); e.z1 = Math.max(e.z1, z); e.gone.push(c); }
            else groups.set(k, { x0: x, x1: x, L0: L, L1: L, z0: z, z1: z, gone: [c] });
        }
        for (const e of groups.values()) {
            const cx = (e.x0 + e.x1) / 2, cz = (e.z0 + e.z1) / 2, cy = (e.L0 + e.L1) / 2 - 1;
            const r = Math.max(e.x1 - e.x0, e.L1 - e.L0, e.z1 - e.z0) / 2 + 0.9;
            // (and the house round it: a beam burnt through — what it held may come down, Structure.js; a burning block falls burning)
            const falls = collapseAfter(data, cx, cy, cz, r, 0, e.gone, null, (late) => { for (const f of late) this._carryFire(f); g._collapsed?.(late); });
            for (const f of falls) { this._carryFire(f); g.falling?.add(f); }
            _c.set(cx, cy, cz);
            g.wreck?.afterBlast(_c, r + 1, 0); // (doors, beds, chests, glass: as after a blast)
            this.wakeAround(_c, r + 3);
        }
    }

    /** A burning block that falls goes on burning where it lands. */
    _carryFire(f) {
        const F = this.game.fire;
        if (!F?.burningBlocks.size || !(f.d > 0)) return;
        for (const [x, L, z] of f.cells) {
            const k = x + ',' + L + ',' + z, b = F.burningBlocks.get(k);
            if (!b) continue;
            F.burningBlocks.delete(k);
            if (!f.landed.some((c) => c[0] === x && c[1] === L - f.d && c[2] === z)) continue; // (it broke in the fall)
            b.L = L - f.d;
            F.burningBlocks.set(x + ',' + b.L + ',' + z, b);
        }
    }

    /**
     * Things near a place whose floor may be gone: lying ones wake up (their physics finds
     * the floor below), the ones floating over a chest that is gone or fell drop.
     */
    wakeAround(p, r) {
        const g = this.game;
        for (const L of g.items?.loose.values() || []) {
            const m = L.model.position;
            if (Math.abs(m.x - p.x) > r || Math.abs(m.z - p.z) > r || Math.abs(m.y - p.y) > r + 3) continue;
            if (L.hover) { if (!g.authority) continue; if (!this._chestUnder(m)) this._drop(L); continue; }
            if (L.rest) { L.rest = false; L.sentRest = false; }
        }
        for (const w of g.weapons?.weapons || []) {
            if (w.holder) continue;
            const m = w.position;
            if (Math.abs(m.x - p.x) > r || Math.abs(m.z - p.z) > r || Math.abs(m.y - p.y) > r + 3) continue;
            if (w.hover) { if (!g.authority || this._chestUnder(w.hover.base || m)) continue; w.hover = null; }
            w.wake?.();
        }
    }

    /** Is there still a chest right under a thing floating at p? */
    _chestUnder(p) {
        for (const c of this.game.chests || []) {
            const q = c.getPosition();
            if (Math.abs(q.x - p.x) < 2.2 && Math.abs(q.z - p.z) < 2.2 && p.y > q.y - 0.3 && p.y < q.y + 3.2) return true;
        }
        return false;
    }

    /** (host) A floating thing falls (it was over a chest that is gone). */
    _drop(L) {
        L.hover = null;
        L.rise = null;
        L.rest = false; L.sentRest = false;
        L.vel.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
    }

    // ------------------------------------------------------------- chests
    /** Wooden chests standing in the fire heat up and burn down. */
    _chests(dt) {
        const g = this.game, F = g.fire;
        if (!F) return;
        const any = F.burningBlocks.size > 0;
        for (const c of [...(g.chests || [])]) {
            if (c.ship || c.burnt) continue; // (a ship's fire is its own: Ships.js)
            const p = c.getPosition();
            const hot = any && F.burningAt(_v.set(p.x, p.y + 0.4, p.z), BURN.REACH * (c.scale || 1) / 1.5 + 0.4);
            if (!hot) { c.heat = Math.max(0, (c.heat || 0) - dt * 0.5); continue; }
            c.heat = (c.heat || 0) + dt;
            if (Math.random() < 0.6) g.fx?.glow?.spawn(p.x + (Math.random() - 0.5), p.y + 0.3 + Math.random() * 0.6, p.z + (Math.random() - 0.5), 0, 1.5 + Math.random(), 0,
                [0xffe08a, 0xffa020, 0xff5a00][(Math.random() * 3) | 0], 0.3 + Math.random() * 0.3, 0.4, { shrink: 1.5 });
            if (c.heat > BURN.CHEST_HEAT) this.burnChest(c);
        }
    }

    /** A chest burns down: gone (charcoal and smoke); its things burn or fall out of the ashes. */
    burnChest(c) {
        const g = this.game;
        c.burnt = true;
        this.burnt.add(c.id);
        const p = c.getPosition().clone();
        c.mesh.updateMatrixWorld(true);
        const rp = c.getRewardPosition(new THREE.Vector3());
        const wasOpen = c.isOpen || g._openedChests?.has(c.id);
        if (c.boxId != null) { g.collision.removeBox(c.boxId); c.boxId = null; }
        c.dispose();
        const i = g.chests.indexOf(c);
        if (i >= 0) g.chests.splice(i, 1);
        (g._openedChests = g._openedChests || new Set()).add(c.id); // (nothing comes out of it any more)
        // charcoal and smoke
        const debris = [];
        for (let k = 0; k < 10; k++) debris.push({ x: p.x + (Math.random() - 0.5) * 1.4, y: p.y + Math.random() * 0.8, z: p.z + (Math.random() - 0.5) * 1.4, color: k % 3 ? 0x2a2420 : 0x6e4a2a, size: 0.4 });
        g.fx?.debrisFrom?.(debris, _v.set(p.x, p.y + 0.3, p.z), 16);
        for (let k = 0; k < 4; k++) g.fx?.smoke?.spawn(p.x, p.y + 0.8 + k * 0.3, p.z, (Math.random() - 0.5) * 0.4, 1.4, (Math.random() - 0.5) * 0.4, 0x3a3a3a, 1.2, 2.5, { shrink: -0.4 });
        if (!g.authority) return;
        if (wasOpen) {
            // its things floating over it: they burn, or fall into the ashes
            for (const L of [...g.items.loose.values()]) {
                if (!L.hover) continue;
                const m = L.model.position;
                if (Math.abs(m.x - p.x) > 2.2 || Math.abs(m.z - p.z) > 2.2 || m.y < p.y - 0.3 || m.y > p.y + 3.2) continue;
                if (burnsInFire(L.item)) this._burnItem(L);
                else this._drop(L);
            }
            for (const w of g.weapons?.weapons || []) {
                if (!w.hover || w.holder) continue;
                const m = w.hover.base || w.position;
                if (Math.abs(m.x - p.x) > 2.2 || Math.abs(m.z - p.z) > 2.2 || m.y < p.y - 0.3 || m.y > p.y + 3.2) continue;
                w.hover = null; w.wake?.(); // (steel: it falls)
            }
        } else g.spillBurntChest?.(c, rp); // (never opened: what survives the fire lies in the ashes)
    }

    /** (host) A thing burns up (a puff of flame, gone for everybody). */
    _burnItem(L) {
        const g = this.game, m = L.model.position;
        for (let k = 0; k < 6; k++) g.fx?.glow?.spawn(m.x, m.y, m.z, (Math.random() - 0.5), 1 + Math.random() * 2, (Math.random() - 0.5), [0xffe08a, 0xffa020, 0xff5a00][k % 3], 0.3, 0.5, { shrink: 1.5 });
        g.items.removeLoose(L.item.uid);
        g.sync?.itemGone?.(L.item.uid, null, null);
    }

    /** The builders put this castle / village back: its houses get their chests again. */
    rebuilt(def) {
        if (!this.burnt.size || !def) return;
        const ids = new Set((def.chests || []).map((c) => c.id));
        const pre = (def.houses || []).map((h) => h.id + 'c');
        for (const id of [...this.burnt]) {
            if (!ids.has(id) && !pre.some((s) => String(id).startsWith(s))) continue;
            this.burnt.delete(id);
            this.game._openedChests?.delete(id);
        }
        const cs = this.game.castleLife?.castles?.get(def.id);
        if (cs && [...ids].length) cs.chestsMade = false; // (the castle's chests are made again)
    }
}
