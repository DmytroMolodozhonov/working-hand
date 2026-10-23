/**
 * Fire.js — trees catch fire and the fire spreads.
 *
 * «Инферно» aimed at a tree, or a Bombardo blast next to one, sets it on fire.
 * A burning tree flames and smokes for a while, then its crown is gone and
 * the trunk is charred; before that the fire jumps to trees nearby. Both
 * kinds of trees burn: the instanced ones near spawn and the voxel trees of
 * the endless world (their leaf/wood blocks burn away block by block).
 *
 * Spreading uses deterministic "random" (a hash of the position), so every
 * player's computer burns the same trees.
 */

import * as THREE from 'three';
import { BLOCK, isFlammable, isCastleBlock } from './Terrain.js';

export const FIRE = {
    BURN_TIME: 9, // s a tree burns
    SPREAD_RADIUS: 9, // m to the next tree
    SPREAD_CHANCE: 0.55,
    BLOCK_BURN: 2.6, // s a leaf/wood block burns
    MAX_BLOCKS: 260, // burning blocks at once (performance)
};

/**
 * The snow block (the mountains' snow, generation 5): what acts on it, and how.
 */
export const SNOW_TARGETS = {
    fire: { does: 'melt', why: 'любой огонь мира (FireSystem: «Инферно», огонь рукой, Hellfire, огонь драконов и стражей, горящий феникс) — снег тает облачком пара, вода стекает' },
    Bombardo: { does: 'blast + melt', why: 'воронка, как в любой земле (World.explode), а жар вокруг неё (fire.ignite) растапливает снег по краю' },
    hands: { does: 'dig', why: 'копается и ломается руками, как другие блоки земли; кладётся снова (ресурс «Снег»)' },
    water: { does: 'none', why: 'вода и лёд («Айс», водные заклинания) снегу ничего не делают: он и так холодный, не горит' },
    lightning: { does: 'as fire', why: 'где молния поджигает (через FireSystem), там и топит' },
    creatures: { does: 'none', why: 'по снегу ходят все, как по земле; шаг игрока по снегу — мягкий хруст' },
    collapse: { does: 'fall', why: 'снег — земля: проседает и падает с тем, что под ним (Collapse, Drawdown, Quake)' },
};

const _v = new THREE.Vector3();
const MELT_AROUND = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
const _c = new THREE.Color();

function hash01(a, b, c) {
    let h = (Math.imul(Math.round(a * 7), 374761393) + Math.imul(Math.round(b * 7), 668265263) + Math.imul(Math.round(c * 7), 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class FireSystem {
    constructor(game) {
        this.game = game;
        this.burningTrees = []; // {tree, t}
        this.burningBlocks = new Map(); // "x,L,z" -> {x, L, z, t}
        this._smokeT = 0;
    }

    get world() {
        return this.game.world;
    }

    // ============================================================ ignition
    /** A point is on fire (Inferno, Bombardo, Hellfire): trees and leaf blocks there catch fire. @returns true if something new caught fire */
    ignite(p, radius = 1.5) {
        const w = this.world;
        let hit = false;
        for (const t of w.trees || []) {
            if (!t.alive || t.burning || t.burnt) continue;
            const dx = t.x - p.x, dz = t.z - p.z, gy = (t.y ?? -0.5) + 0.5; // (its foot: a tree anywhere, not only at the start)
            if (dx * dx + dz * dz > (radius + 3) * (radius + 3) || p.y - gy > (t.h ?? 12.5) + 0.5 || p.y - gy < -2) continue;
            this._igniteTree(t);
            hit = true;
        }
        const terrain = this.game.terrain?.data;
        if (!terrain) return hit;
        const r = Math.ceil(radius);
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) {
            const x = Math.round(p.x) + dx, z = Math.round(p.z) + dz, L = Math.floor(p.y + 1.5) + dy;
            const b = terrain.get(x, L, z);
            if (isFlammable(b) && this._igniteBlock(x, L, z)) hit = true;
            else if (b === BLOCK.SNOW) this._melt(terrain, x, L, z);
        }
        this._meltDone();
        return hit;
    }

    /** Fire along a ray (the Inferno stream): returns true if something caught fire. */
    igniteAlong(origin, dir, length) {
        const terrain = this.game.terrain?.data;
        let hit = false;
        for (let d = 1; d <= length; d += 1.5) {
            _v.copy(origin).addScaledVector(dir, d);
            // instanced trees: trunk or crown in the stream
            for (const t of this.world.trees || []) {
                if (!t.alive || t.burning || t.burnt) continue;
                const dx = t.x - _v.x, dz = t.z - _v.z, gy = (t.y ?? -0.5) + 0.5;
                if (dx * dx + dz * dz < 9 && _v.y - gy > -1 && _v.y - gy < (t.h ?? 11.5) + 0.5) { this._igniteTree(t); hit = true; }
            }
            if (terrain) {
                const x = Math.round(_v.x), z = Math.round(_v.z), L = Math.floor(_v.y + 1.5);
                const b = terrain.get(x, L, z);
                if (isFlammable(b)) { this._igniteBlock(x, L, z); hit = true; }
                if (b === BLOCK.SNOW) {
                    // the stream melts the snow it hits (and round it: it is half a metre wide and hot)
                    for (const [dx, dy, dz] of MELT_AROUND) if (terrain.get(x + dx, L + dy, z + dz) === BLOCK.SNOW) this._melt(terrain, x + dx, L + dy, z + dz);
                }
                if (b !== BLOCK.AIR && b !== BLOCK.WATER) break; // the stream stops at solid things
            }
        }
        this._meltDone();
        return hit;
    }

    /** Is there fire at this point (a burning block, a burning tree's crown or trunk)? */
    burningAt(p, r = 1) {
        for (const b of this.burningBlocks.values()) {
            if (Math.abs(b.x - p.x) < 0.5 + r && Math.abs(b.z - p.z) < 0.5 + r && Math.abs(b.L - 1 - p.y) < 0.5 + r) return true;
        }
        for (const { tree: t } of this.burningTrees) {
            if (t.alive && Math.hypot(t.x - p.x, t.z - p.z) < 0.8 + r) return true;
        }
        return false;
    }

    /** Water over a place («Water Vortex Super Maxima»): burning trees and blocks there go out. @returns how many */
    douse(p, radius) {
        let n = 0;
        for (let i = this.burningTrees.length - 1; i >= 0; i--) {
            const t = this.burningTrees[i].tree;
            const gy = (t.y ?? -0.5) + 0.5;
            if (Math.hypot(t.x - p.x, t.z - p.z) > radius + 2.5 || p.y - gy > (t.h ?? 12.5) + 1.5 || p.y - gy < -3) continue;
            t.burning = false; // (still standing: what burnt off is gone, the rest is wet)
            this.burningTrees.splice(i, 1);
            n++;
        }
        for (const [key, b] of this.burningBlocks) {
            const dx = b.x - p.x, dz = b.z - p.z, dy = b.L - 1 - p.y;
            if (dx * dx + dz * dz + dy * dy > (radius + 1) * (radius + 1)) continue;
            this.burningBlocks.delete(key);
            n++;
        }
        return n;
    }

    /**
     * «Вайнд Максима» upward: a wave of wind puts out every fire whose place `reached(x, y, z)` says it ran
     * over (`y` null for a tree: only along the ground). `out(x, y, z)` is called for each fire put out.
     * @returns how many
     */
    douseWhere(reached, out = null) {
        let n = 0;
        for (let i = this.burningTrees.length - 1; i >= 0; i--) {
            const t = this.burningTrees[i].tree;
            if (!reached(t.x, null, t.z)) continue;
            t.burning = false; // (what burnt off is gone)
            this.burningTrees.splice(i, 1);
            out?.(t.x, 3, t.z);
            n++;
        }
        for (const [key, b] of this.burningBlocks) {
            if (!reached(b.x, b.L - 1, b.z)) continue;
            this.burningBlocks.delete(key);
            if ((n & 3) === 0) out?.(b.x, b.L, b.z); // (a puff for every fourth: a burning house has hundreds)
            n++;
        }
        return n;
    }

    /**
     * Fire melts snow (any fire: «Инферно», a burning hand, «Бомбардо»'s blast, Hellfire…): the
     * block is gone in a puff of steam, its water runs off. Like the burning blocks it happens the
     * same on every computer (no chance in it); kept in the world's changes (a save).
     */
    _melt(terrain, x, L, z) {
        if (this.game.wards?.protects?.(x, L - 1, z)) return;
        const was = terrain.get(x, L, z);
        terrain.set(x, L, z, BLOCK.AIR);
        (this._melted || (this._melted = [])).push([x, L, z, BLOCK.AIR]);
        this.onBlockGone?.(x, L, z, was); // (what stood on it falls)
        const fx = this.game.fx;
        if (fx?.smoke && (this._melted.length & 3) === 1) fx.smoke.spawn(x, L - 0.6, z, (Math.random() - 0.5) * 0.4, 1.6 + Math.random(), (Math.random() - 0.5) * 0.4, 0xe8eef2, 0.9 + Math.random() * 0.5, 1.6, { shrink: -0.5 });
    }

    _meltDone() {
        const m = this._melted;
        if (!m || !m.length) return;
        const g = this.game;
        g.blockEdits = g.blockEdits || [];
        for (const e of m) g.blockEdits.push(e);
        m.length = 0;
    }

    _igniteTree(t) {
        t.burning = true;
        this.burningTrees.push({ tree: t, t: 0, spread: false });
    }

    _igniteBlock(x, L, z) {
        if (this.game.wards?.protects(x, L - 1, z)) return false; // (a house's sphere of protection: nothing inside catches fire)
        const key = x + ',' + L + ',' + z;
        if (this.burningBlocks.has(key) || this.burningBlocks.size >= FIRE.MAX_BLOCKS) return false;
        this.burningBlocks.set(key, { x, L, z, t: 0, spread: false });
        return true;
    }

    // =============================================================== update
    update(dt) {
        if (!this.burningTrees.length && !this.burningBlocks.size) return;
        const fx = this.game.fx;
        // Instanced trees
        for (let i = this.burningTrees.length - 1; i >= 0; i--) {
            const b = this.burningTrees[i];
            const t = b.tree;
            b.t += dt;
            const k = Math.min(1, b.t / 1.5); // flames grow
            // (where it burns: its own foot, crown and size — a real tree is up to 25 m tall and 15 wide)
            const gy = (t.y ?? -0.5) + 0.5, c0 = t.c0 ?? 5, top = t.h ?? 11, cw = t.crown ? Math.min(6, (t.crown.maxX - t.crown.minX) / 2) : 3;
            if (t.alive) {
                this.game.fireLights?.want(t.x, gy + (c0 + top) / 2, t.z, 1.5 * k); // (the burning crown lights what is round it)
                for (let n = 0; n < (t.mesh ? 5 : 3); n++) {
                    const y = gy + c0 + Math.random() * (top - c0) * k, rr = cw * k;
                    fx.glow.spawn(t.x + (Math.random() - 0.5) * rr * 2, y, t.z + (Math.random() - 0.5) * rr * 2, (Math.random() - 0.5), 2 + Math.random() * 3, (Math.random() - 0.5),
                        [0xffe08a, 0xffa020, 0xff5a00, 0xd02000][(Math.random() * 4) | 0], 0.5 + Math.random() * 0.7, 0.5 + Math.random() * 0.4, { shrink: 1.2 });
                }
                if (Math.random() < 0.25) {
                    const g = 60 + ((Math.random() * 40) | 0);
                    fx.smoke.spawn(t.x, gy + top - 1 + Math.random() * 2, t.z, (Math.random() - 0.5) * 0.6, 2 + Math.random(), (Math.random() - 0.5) * 0.6, (g << 16) | (g << 8) | g, 1.4 + Math.random(), 3, { shrink: -0.4 });
                }
            }
            // The fire jumps to trees nearby
            if (!b.spread && b.t > 3.5) {
                b.spread = true;
                for (const o of this.world.trees) {
                    if (o === t || !o.alive || o.burning || o.burnt) continue;
                    const d = Math.hypot(o.x - t.x, o.z - t.z);
                    if (d < FIRE.SPREAD_RADIUS && hash01(o.x, o.z, t.x) < FIRE.SPREAD_CHANCE) this._igniteTree(o);
                }
                // and to voxel leaves around
                this.ignite(_v.set(t.x, gy + c0 + 2, t.z), 3);
            }
            if (b.t > FIRE.BURN_TIME) {
                this.burningTrees.splice(i, 1);
                t.burning = false;
                t.burnt = true;
                this.world.burnTree(t);
            }
        }
        // Voxel blocks
        const terrain = this.game.terrain?.data;
        if (!terrain) return;
        for (const [key, b] of this.burningBlocks) {
            b.t += dt;
            this.game.fireLights?.want(b.x, b.L - 1, b.z, 0.8);
            if (Math.random() < 0.5) {
                fx.glow.spawn(b.x + (Math.random() - 0.5), b.L - 1 + (Math.random() - 0.3), b.z + (Math.random() - 0.5), 0, 1.5 + Math.random() * 2, 0,
                    [0xffe08a, 0xffa020, 0xff5a00][(Math.random() * 3) | 0], 0.35 + Math.random() * 0.4, 0.4, { shrink: 1.5 });
            }
            if (!b.spread && b.t > FIRE.BLOCK_BURN * 0.6) {
                b.spread = true;
                for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
                    const nb = terrain.get(b.x + dx, b.L + dy, b.z + dz);
                    if (isFlammable(nb) && hash01(b.x + dx, b.L + dy, b.z + dz) < 0.8) this._igniteBlock(b.x + dx, b.L + dy, b.z + dz);
                }
            }
            if (b.t > FIRE.BLOCK_BURN) {
                this.burningBlocks.delete(key);
                const was = terrain.get(b.x, b.L, b.z);
                if (was !== BLOCK.AIR) terrain.set(b.x, b.L, b.z, BLOCK.AIR);
                if (isCastleBlock(was)) this.onCastleBurn?.(b.x, b.L, b.z);
                if (was !== BLOCK.AIR) this.onBlockGone?.(b.x, b.L, b.z, was); // (what stood on it falls: BurnWreck.js)
                if (Math.random() < 0.3) {
                    const g = 50 + ((Math.random() * 30) | 0);
                    fx.smoke.spawn(b.x, b.L - 0.5, b.z, 0, 1.5, 0, (g << 16) | (g << 8) | g, 1.0, 2.5, { shrink: -0.4 });
                }
            }
        }
    }
}

/** Charcoal colour for a burnt trunk. */
export const BURNT = _c.set(0x2a2420);
