/**
 * Builder.js — gathering resources and building with magic.
 *
 *   «Gather»            point a raised hand at a tree / stone / earth / leaves
 *                       (≤ 10 m): it comes apart and flies into a slot. A whole
 *                       tree gives 20 wood of its kind.
 *   «Create a Floor»    a block of the chosen resource appears where the hand
 *   «Create a Wall»     points; then reach with the hand and the floor / wall /
 *   «Create a Ceiling»  ceiling / roof grows towards where it points, block by
 *   «Build a Roof»      block flowing out of the hand, while the resource lasts.
 *                       Lower the hand (or say «Stand» / «стоп») to finish.
 *   With a water ball in the hand, everything is built of ICE, which melts
 *   away within a game day (24 min), dripping.
 *
 * Creative: every spell works. Other modes: only the spells learned from the
 * books of the book-birds.
 */

import * as THREE from 'three';
import { BLOCK, TREE_KINDS, isWood, isLeaves } from '../world/Terrain.js';
import { RESOURCE, STACK, resourceOf } from './Inventory.js';

export const BUILD_SPELLS = {
    Gather: { name: 'Gather', ru: 'собрать ресурс', cost: 3 },
    CreateFloor: { name: 'Create a Floor', ru: 'пол', cost: 4 },
    CreateWall: { name: 'Create a Wall', ru: 'стена', cost: 4 },
    CreateCeiling: { name: 'Create a Ceiling', ru: 'потолок', cost: 4 },
    BuildRoof: { name: 'Build a Roof', ru: 'крыша', cost: 6 },
    CreateDoor: { name: 'Create a Door', ru: 'дверь', cost: 4 },
};

const MAX_SPAN = 6; // cells from the first block in each direction
const BUILD_TIME = 14; // s at most per spell
const ICE_LIFE = 24 * 60; // s: ice buildings melt within a game day
const WOOD_PER_TREE = 20;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export class Builder {
    constructor(game) {
        this.game = game;
        this.build = null;
        this.ice = []; // {x, L, z, until}
        this._dripT = 0;
    }

    get data() {
        return this.game.terrain ? this.game.terrain.data : null;
    }

    /** May this spell be used now? (creative: all; elsewhere: learned from a book) */
    knows(spell) {
        if (this.game.config.mode === 'creative') return true;
        return !!this.game.books?.learned?.has(spell);
    }

    // =================================================================== aim
    /** The raised hand (preferring the spell hand) and its ray. */
    _hand() {
        const ch = this.game.character;
        const pref = this.game.magicHand || this.game.lastMagicHand || 'right';
        const side = ch.isArmRaised(pref) ? pref : ['right', 'left'].find((s) => ch.isArmRaised(s));
        if (!side) return null;
        return { side, o: ch.getHandWorldPosition(side, new THREE.Vector3()), d: ch.getHandDirection(side, new THREE.Vector3()) };
    }

    /** First solid block along the ray: {x, L, z, type}. */
    _hitCell(o, d, max = 10) {
        const data = this.data;
        if (!data) return null;
        const hit = data.raycast(o, d, max);
        if (!hit) return null;
        const p = _v1.set(hit.x + d.x * 0.05, hit.y + d.y * 0.05, hit.z + d.z * 0.05);
        const x = Math.round(p.x), L = Math.floor(p.y + 1.5), z = Math.round(p.z);
        return { x, L, z, type: data.get(x, L, z), point: new THREE.Vector3(hit.x, hit.y, hit.z) };
    }

    // ================================================================ gather
    gather() {
        const g = this.game;
        const h = this._hand();
        if (!h) return '🪄 Поднимите руку и направьте её на дерево, камень или землю — и скажите «Gather»';
        // A spawn-area tree (drawn separately from the blocks)?
        const tree = this._treeOnRay(h.o, h.d, 10);
        if (tree) {
            const kind = TREE_KINDS[tree.kind || 0];
            const n = Math.min(WOOD_PER_TREE, this._room(kind.wood));
            if (n <= 0) return '🎒 Ячейки полны';
            g.world.removeTree(tree);
            if (g.sync) g.sync.treeGone?.(tree.index);
            this._flyToHand(new THREE.Vector3(tree.x, 4, tree.z), RESOURCE[kind.wood].color, 30, h.side);
            g.inventory.addResource(kind.wood, n);
            g.hud.toast?.(`🪵 +${n} ${kind.name}`);
            return null;
        }
        const cell = this._hitCell(h.o, h.d, 10);
        if (!cell || cell.type === BLOCK.AIR || cell.type === BLOCK.BEDROCK || cell.type === BLOCK.WATER || cell.type === BLOCK.ICE_SHAPE) {
            return '🪄 Направьте руку на дерево, камень, землю или листву (не дальше 10 м)';
        }
        const data = this.data;
        let cells, res, amount;
        if (isWood(cell.type)) {
            // the whole tree: its trunk and its crown
            const kind = TREE_KINDS.find((k) => k.wood === cell.type);
            cells = this._flood(cell, (t) => t === kind.wood || t === kind.leaves, 6, 500);
            res = kind.wood;
            amount = WOOD_PER_TREE;
        } else {
            const type = cell.type;
            cells = this._flood(cell, (t) => t === type, isLeaves(type) ? 3 : 1.6, isLeaves(type) ? 24 : 8);
            res = resourceOf(type);
            amount = cells.length;
        }
        const room = this._room(res);
        if (room <= 0) return '🎒 Ячейки полны — освободите ячейку (правый карман)';
        if (!isWood(cell.type) && cells.length > room) cells.length = room;
        amount = Math.min(amount, room);
        const edits = [];
        for (const c of cells) { data.set(c.x, c.L, c.z, BLOCK.AIR); edits.push([c.x, c.L, c.z, BLOCK.AIR]); }
        this._sendEdits(edits);
        const color = RESOURCE[res]?.color ?? 0xffffff;
        for (let i = 0; i < Math.min(cells.length, 30); i++) this._flyToHand(_v2.set(cells[i].x, cells[i].L - 1, cells[i].z), color, 2, h.side);
        g.inventory.addResource(res, amount);
        g.hud.toast?.(`✨ +${amount} ${RESOURCE[res]?.name || ''}`);
        return null;
    }

    /** How much of this resource still fits into the slots. */
    _room(block) {
        block = resourceOf(block);
        let room = 0;
        for (const s of this.game.inventory.slots) {
            if (!s) room += STACK;
            else if (s.kind === 'res' && s.block === block) room += STACK - s.count;
        }
        return room;
    }

    /** Connected blocks (6-neighbours) matching `ok` within `radius` of the start. */
    _flood(start, ok, radius, max) {
        const data = this.data;
        const seen = new Set([start.x + ',' + start.L + ',' + start.z]);
        const out = [{ x: start.x, L: start.L, z: start.z }];
        for (let i = 0; i < out.length && out.length < max; i++) {
            const c = out[i];
            for (const [dx, dL, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
                const x = c.x + dx, L = c.L + dL, z = c.z + dz;
                const k = x + ',' + L + ',' + z;
                if (seen.has(k)) continue;
                seen.add(k);
                if (Math.hypot(x - start.x, (L - start.L) * 0.6, z - start.z) > radius) continue;
                if (!ok(data.get(x, L, z))) continue;
                out.push({ x, L, z });
                if (out.length >= max) break;
            }
        }
        return out;
    }

    _treeOnRay(o, d, max) {
        let best = null, bestT = max;
        for (const t of this.game.world.trees || []) {
            if (!t.alive) continue;
            const tx = t.x - o.x, tz = t.z - o.z;
            const along = tx * d.x + tz * d.z;
            const flat = Math.hypot(d.x, d.z) || 1;
            const tt = along / (flat * flat);
            if (tt < 0 || tt > bestT) continue;
            const px = o.x + d.x * tt, pz = o.z + d.z * tt, py = o.y + d.y * tt;
            if (Math.hypot(px - t.x, pz - t.z) > 2.2 || py < -1 || py > 12) continue;
            bestT = tt;
            best = t;
        }
        return best;
    }

    /** Sparkles fly from `from` into the hand (the magic carrying the resource). */
    _flyToHand(from, color, n, side) {
        const g = this.game;
        const hand = g.character.getHandWorldPosition(side, _v3);
        for (let i = 0; i < n; i++) {
            const p = _v1.copy(from).add(_v2.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5));
            const v = _v2.subVectors(hand, p).multiplyScalar(1.6);
            g.fx.spark(p, i % 3 ? color : 0xfff2a8, 0.18, v, 0.6);
        }
    }

    // ================================================================= build
    /** «Create a Floor / Wall / Ceiling», «Build a Roof»: the first block appears. */
    start(kind) {
        const g = this.game;
        if (this.build) this.finish();
        const h = this._hand();
        if (!h) return '🧱 Поднимите руку туда, где строить, и скажите заклинание';
        const water = g.water?.active && g.water.state.phase === 'held' ? g.water : null;
        const stack = water ? null : g.inventory.buildResource();
        if (!water && !stack) return '🧱 Нет ресурса: выберите ячейку с ресурсом (коснитесь левого кармана) или возьмите водяной шар';
        const block = water ? BLOCK.ICE : stack.block;
        const hit = this._hitCell(h.o, h.d, 14);
        let ax, az, ground;
        if (hit) { ax = hit.x; az = hit.z; ground = this.data.topLayer(ax, az); }
        else {
            const p = _v1.copy(g.character.group.position).addScaledVector(_v2.set(h.d.x, 0, h.d.z).normalize(), 3);
            ax = Math.round(p.x); az = Math.round(p.z); ground = this.data.topLayer(ax, az);
        }
        const high = kind === 'CreateCeiling' || kind === 'BuildRoof';
        const L0 = ground + (high ? 4 : 1);
        // A wall runs across the view (sideways)
        const yaw = g.character.group.rotation.y;
        const axisX = Math.abs(Math.cos(yaw)) >= Math.abs(Math.sin(yaw)); // facing ±z → wall along x
        this.build = { kind, block, stack, water, ax, az, L0, axisX, placed: new Set(), t: 0, low: 0, side: h.side, count: 0 };
        this._place(ax, L0, az);
        g.hud.setVoice?.(`🧱 ${BUILD_SPELLS[kind].name}: тяните руку — ${BUILD_SPELLS[kind].ru} растёт. Опустите руку или скажите «Stand», чтобы закончить`, true);
        return null;
    }

    finish() {
        const b = this.build;
        if (!b) return;
        this.build = null;
        this.lastCount = b.count;
        if (b.count) this.game.hud.toast?.(`🧱 Построено блоков: ${b.count}`);
    }

    /** Desired cells for the current hand target. */
    _cells(b, h) {
        const out = [];
        if (b.kind === 'CreateWall') {
            // vertical plane through the first block, across the view
            const n = b.axisX ? _v1.set(0, 0, 1) : _v1.set(1, 0, 0);
            const denom = h.d.dot(n);
            if (Math.abs(denom) < 1e-3) return null;
            const t = (_v2.set(b.ax, 0, b.az).sub(h.o)).dot(n) / denom;
            if (t < 0 || t > 30) return null;
            const p = _v3.copy(h.o).addScaledVector(h.d, t);
            const u1 = Math.round(b.axisX ? p.x : p.z), u0 = b.axisX ? b.ax : b.az;
            const L1 = Math.floor(p.y + 1.5);
            const ua = Math.max(u0 - MAX_SPAN, Math.min(u0, u1)), ub = Math.min(u0 + MAX_SPAN, Math.max(u0, u1));
            const La = b.L0, Lb = Math.max(b.L0, Math.min(b.L0 + MAX_SPAN, L1));
            for (let L = La; L <= Lb; L++) for (let u = ua; u <= ub; u++) out.push(b.axisX ? [u, L, b.az] : [b.ax, L, u]);
            return out;
        }
        // horizontal plane at the first block's height
        const y = b.L0 - 1.0;
        if (Math.abs(h.d.y) < 1e-3) return null;
        const t = (y - h.o.y) / h.d.y;
        if (t < 0 || t > 30) return null;
        const p = _v3.copy(h.o).addScaledVector(h.d, t);
        const x1 = Math.round(p.x), z1 = Math.round(p.z);
        const xa = Math.max(b.ax - MAX_SPAN, Math.min(b.ax, x1)), xb = Math.min(b.ax + MAX_SPAN, Math.max(b.ax, x1));
        const za = Math.max(b.az - MAX_SPAN, Math.min(b.az, z1)), zb = Math.min(b.az + MAX_SPAN, Math.max(b.az, z1));
        const w = xb - xa + 1, d = zb - za + 1;
        for (let z = za; z <= zb; z++) for (let x = xa; x <= xb; x++) {
            let L = b.L0;
            if (b.kind === 'BuildRoof') {
                // a gable roof: steps rise from both long edges to the ridge
                const off = w >= d ? Math.min(z - za, zb - z) : Math.min(x - xa, xb - x);
                L = b.L0 + off;
            }
            out.push([x, L, z]);
        }
        return out;
    }

    _place(x, L, z) {
        const b = this.build;
        const data = this.data;
        const key = x + ',' + L + ',' + z;
        if (b.placed.has(key)) return true;
        const cur = data.get(x, L, z);
        if (cur !== BLOCK.AIR && cur !== BLOCK.WATER) { b.placed.add(key); return true; }
        // pay: one block of the resource, or a little of the water ball
        if (b.water) {
            const s = b.water.state;
            if (!s || s.volume < 0.12) return false;
            s.volume -= 0.25;
            if (s.volume < 0.12) b.water._end();
        } else if (!this.game.inventory.take(b.stack, 1)) return false;
        data.set(x, L, z, b.block);
        b.placed.add(key);
        b.count++;
        if (b.block === BLOCK.ICE) this.ice.push({ x, L, z, until: performance.now() + ICE_LIFE * 1000 * (0.85 + Math.random() * 0.15) });
        this._pending = this._pending || [];
        this._pending.push([x, L, z, b.block]);
        // the block flows out of the hand
        const hand = this.game.character.getHandWorldPosition(b.side, _v1);
        const target = _v2.set(x, L - 1, z);
        const col = b.block === BLOCK.ICE ? 0xc9ecff : (RESOURCE[b.block]?.color ?? 0xffffff);
        for (let i = 0; i < 3; i++) this.game.fx.spark(hand, i ? col : 0xfff2a8, 0.16, _v3.subVectors(target, hand).multiplyScalar(2.2), 0.45);
        return true;
    }

    update(dt) {
        const b = this.build;
        if (b) {
            b.t += dt;
            const h = this._hand();
            b.low = h ? 0 : b.low + dt;
            if (b.low > 0.8 || b.t > BUILD_TIME) this.finish();
            else if (h) {
                const cells = this._cells(b, h);
                if (cells) {
                    // nearest first, a few per frame (it grows, block by block)
                    cells.sort((p, q) => Math.abs(p[0] - b.ax) + Math.abs(p[2] - b.az) + Math.abs(p[1] - b.L0) - (Math.abs(q[0] - b.ax) + Math.abs(q[2] - b.az) + Math.abs(q[1] - b.L0)));
                    let n = 0;
                    for (const [x, L, z] of cells) {
                        if (n >= 4) break;
                        if (b.placed.has(x + ',' + L + ',' + z)) continue;
                        if (!this._place(x, L, z)) { this.game.hud.toast?.('🧱 Ресурс кончился'); this.finish(); break; }
                        n++;
                    }
                }
            }
        }
        if (this._pending && this._pending.length) { this._sendEdits(this._pending); this._pending = []; }
        this._melt(dt);
    }

    /** Ice buildings drip, and melt away block by block when their time is up. */
    _melt(dt) {
        if (!this.ice.length) return;
        const now = performance.now();
        this._dripT -= dt;
        const drip = this._dripT <= 0;
        if (drip) this._dripT = 0.25;
        const edits = [];
        for (let i = this.ice.length - 1; i >= 0; i--) {
            const c = this.ice[i];
            if (this.data.get(c.x, c.L, c.z) !== BLOCK.ICE) { this.ice.splice(i, 1); continue; }
            const left = (c.until - now) / 1000;
            if (left <= 0) {
                this.data.set(c.x, c.L, c.z, BLOCK.AIR);
                edits.push([c.x, c.L, c.z, BLOCK.AIR]);
                this.ice.splice(i, 1);
                continue;
            }
            // drips more and more as it melts
            if (drip && Math.random() < 0.02 + 0.3 * Math.max(0, 1 - left / ICE_LIFE)) {
                this.game.fx.spark(_v1.set(c.x + (Math.random() - 0.5) * 0.8, c.L - 1.55, c.z + (Math.random() - 0.5) * 0.8), 0x9fd8ff, 0.07, _v2.set(0, -4, 0), 0.5);
            }
        }
        if (edits.length) this._sendEdits(edits);
    }

    _sendEdits(list) {
        if (!list.length) return;
        this.game.blockEdits = this.game.blockEdits || [];
        for (const e of list) this.game.blockEdits.push(e);
        if (this.game.blockEdits.length > 30000) this.game.blockEdits.splice(0, this.game.blockEdits.length - 30000);
        if (this.game.sync) this.game.sync.blocks?.(list);
    }

    /** Edits from another player (or the welcome message). */
    applyEdits(list) {
        const data = this.data;
        if (!data) return;
        for (const e of list) {
            if (!Array.isArray(e) || e.length < 4) continue;
            data.set(e[0] | 0, e[1] | 0, e[2] | 0, e[3] | 0);
            if ((e[3] | 0) === BLOCK.ICE) this.ice.push({ x: e[0] | 0, L: e[1] | 0, z: e[2] | 0, until: performance.now() + ICE_LIFE * 1000 });
        }
        this.game.blockEdits = (this.game.blockEdits || []).concat(list);
    }
}
