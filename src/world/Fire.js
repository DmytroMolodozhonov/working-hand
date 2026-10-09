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

const _v = new THREE.Vector3();
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
    /** A point is on fire (Inferno, Bombardo): trees and leaf blocks there catch fire. */
    ignite(p, radius = 1.5) {
        const w = this.world;
        for (const t of w.trees || []) {
            if (!t.alive || t.burning || t.burnt) continue;
            const dx = t.x - p.x, dz = t.z - p.z;
            if (dx * dx + dz * dz > (radius + 3) * (radius + 3) || p.y > 13 || p.y < -2) continue;
            this._igniteTree(t);
        }
        const terrain = this.game.terrain?.data;
        if (!terrain) return;
        const r = Math.ceil(radius);
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) {
            const x = Math.round(p.x) + dx, z = Math.round(p.z) + dz, L = Math.floor(p.y + 1.5) + dy;
            const b = terrain.get(x, L, z);
            if (isFlammable(b)) this._igniteBlock(x, L, z);
        }
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
                const dx = t.x - _v.x, dz = t.z - _v.z;
                if (dx * dx + dz * dz < 9 && _v.y > -1 && _v.y < 12) { this._igniteTree(t); hit = true; }
            }
            if (terrain) {
                const x = Math.round(_v.x), z = Math.round(_v.z), L = Math.floor(_v.y + 1.5);
                const b = terrain.get(x, L, z);
                if (isFlammable(b)) { this._igniteBlock(x, L, z); hit = true; }
                if (b !== BLOCK.AIR && b !== BLOCK.WATER) break; // the stream stops at solid things
            }
        }
        return hit;
    }

    _igniteTree(t) {
        t.burning = true;
        this.burningTrees.push({ tree: t, t: 0, spread: false });
    }

    _igniteBlock(x, L, z) {
        const key = x + ',' + L + ',' + z;
        if (this.burningBlocks.has(key) || this.burningBlocks.size >= FIRE.MAX_BLOCKS) return;
        this.burningBlocks.set(key, { x, L, z, t: 0, spread: false });
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
            if (t.alive) {
                for (let n = 0; n < 3; n++) {
                    const y = 5 + Math.random() * 6 * k, rr = 3 * k;
                    fx.glow.spawn(t.x + (Math.random() - 0.5) * rr * 2, y, t.z + (Math.random() - 0.5) * rr * 2, (Math.random() - 0.5), 2 + Math.random() * 3, (Math.random() - 0.5),
                        [0xffe08a, 0xffa020, 0xff5a00, 0xd02000][(Math.random() * 4) | 0], 0.5 + Math.random() * 0.7, 0.5 + Math.random() * 0.4, { shrink: 1.2 });
                }
                if (Math.random() < 0.25) {
                    const g = 60 + ((Math.random() * 40) | 0);
                    fx.smoke.spawn(t.x, 10 + Math.random() * 2, t.z, (Math.random() - 0.5) * 0.6, 2 + Math.random(), (Math.random() - 0.5) * 0.6, (g << 16) | (g << 8) | g, 1.4 + Math.random(), 3, { shrink: -0.4 });
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
                this.ignite(_v.set(t.x, 8, t.z), 3);
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
