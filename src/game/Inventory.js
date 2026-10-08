/**
 * Inventory.js — five slots under the fatigue bar (like Minecraft's hotbar).
 *
 * A slot holds a stack of a resource (up to 100 blocks of one kind: stone,
 * earth, oak, birch… gathered with «Gather»), a weapon (sword / axe) or a
 * book of spells (from a book-bird).
 *
 * Hands, no words:
 *   - right pocket: bring the hand holding something down to the right hip —
 *     the sword / axe / book in it goes into a slot;
 *   - left pocket: touch the left hip — the next slot is chosen, and what is
 *     in it appears in the right hand (a weapon to hold, a book, or a small
 *     block of the resource that the building spells use).
 * Keys 1–5 choose a slot too.
 */

import * as THREE from 'three';
import { BLOCK, TREE_KINDS } from '../world/Terrain.js';

export const SLOT_COUNT = 5;
export const STACK = 100;

/** Names and colours of the resources (blocks) for the slots. */
export const RESOURCE = {
    [BLOCK.STONE]: { name: 'Камень', color: 0x8a8a8a },
    [BLOCK.DIRT]: { name: 'Земля', color: 0x7a5230 },
    [BLOCK.GRASS]: { name: 'Земля', color: 0x7a5230 }, // (gathered grass gives earth)
    [BLOCK.SAND]: { name: 'Песок', color: 0xd6c48a },
    [BLOCK.SNOW]: { name: 'Снег', color: 0xf2f6f8 },
    [BLOCK.ICE]: { name: 'Лёд', color: 0xc9ecff },
};
const WOOD_COL = [0x8B4513, 0xe6e0cf, 0x5a3a1e, 0x6b2f2a, 0x3e2716];
const LEAF_COL = [0x2e8b2e, 0x8fcf4a, 0x1f5a35, 0xf2a7c3, 0x2d4f1e];
TREE_KINDS.forEach((k, i) => {
    RESOURCE[k.wood] = { name: k.name, color: WOOD_COL[i] };
    RESOURCE[k.leaves] = { name: 'Листва (' + k.name.toLowerCase() + ')', color: LEAF_COL[i] };
});
/** What a gathered block turns into (grass → earth). */
export const resourceOf = (block) => (block === BLOCK.GRASS ? BLOCK.DIRT : block);

const _v = new THREE.Vector3();
const _inv = new THREE.Matrix4();

export class Inventory {
    constructor(game) {
        this.game = game;
        this.slots = new Array(SLOT_COUNT).fill(null);
        this.selected = 0;
        this.inHand = null; // {slot, kind, weapon?}: what of the selected slot is in the right hand
        this._pocket = { left: { out: 0, raisedAt: 0 }, right: { out: 0, raisedAt: 0 } };
        this._handBlock = null;
        this._buildBar();
    }

    // ================================================================ stacks
    /** Add `count` of a resource block; returns how many did not fit. */
    addResource(block, count) {
        block = resourceOf(block);
        let left = count;
        for (const s of this.slots) {
            if (left <= 0) break;
            if (s && s.kind === 'res' && s.block === block && s.count < STACK) {
                const n = Math.min(left, STACK - s.count);
                s.count += n;
                left -= n;
            }
        }
        for (let i = 0; i < SLOT_COUNT && left > 0; i++) {
            if (this.slots[i]) continue;
            const n = Math.min(left, STACK);
            this.slots[i] = { kind: 'res', block, count: n };
            left -= n;
        }
        this._render();
        return left;
    }

    /** The resource the building spells use: the chosen slot (or any resource slot). */
    buildResource() {
        const s = this.slots[this.selected];
        if (s && s.kind === 'res' && s.count > 0) return s;
        return null;
    }

    /** Take one block from a stack (building). */
    take(stack, n = 1) {
        if (!stack || stack.count < n) return false;
        stack.count -= n;
        if (stack.count <= 0) {
            const i = this.slots.indexOf(stack);
            if (i >= 0) this.slots[i] = null;
        }
        this._render();
        return true;
    }

    /** Put an item (weapon / book) into a free slot (the chosen one first). */
    store(item) {
        let i = this.slots[this.selected] ? this.slots.findIndex((s) => !s) : this.selected;
        if (i < 0) { this.game.hud.toast?.('🎒 Все ячейки заняты'); return false; }
        this.slots[i] = item;
        this._render();
        return true;
    }

    select(i) {
        if (i === this.selected && this.inHand) return;
        this._putBackHand();
        this.selected = ((i % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
        this._takeIntoHand();
        this._render();
    }

    // =========================================================== hand / item
    /** What of the chosen slot appears in the right hand. */
    _takeIntoHand() {
        const s = this.slots[this.selected];
        const g = this.game;
        if (!s) return;
        if (s.kind === 'weapon') {
            if (g.weapons.hands.right.held) return; // the hand is busy
            const ch = g.character;
            const p = ch.getGripObject('right').getWorldPosition(new THREE.Vector3());
            const w = g.weapons.spawn(s.type, p, new THREE.Quaternion(), s.id);
            if (g.sync) g.sync.weaponAppeared?.(w);
            w.wake();
            g.weapons.grab(w, 'right', 0.5);
            g.weapons.hands.right.waitClose = true;
            this.slots[this.selected] = null;
            this.inHand = { kind: 'weapon', weapon: w };
            return;
        }
        if (s.kind === 'book') {
            g.books?.takeIntoHand(s);
            this.slots[this.selected] = null;
            this.inHand = { kind: 'book' };
            return;
        }
        if (s.kind === 'res') this.inHand = { kind: 'res', stack: s };
    }

    /** Switching slots: a weapon taken out of the chosen slot goes back into it. */
    _putBackHand() {
        const h = this.inHand;
        this.inHand = null;
        if (!h) return;
        if (h.kind === 'weapon' && this.game.weapons.hands.right.held === h.weapon && !this.slots[this.selected]) this._storeWeapon(h.weapon, this.selected);
        if (h.kind === 'book' && this.game.books?.inHand && !this.slots[this.selected]) this.slots[this.selected] = this.game.books.putAway();
    }

    _storeWeapon(w, slot = null) {
        const g = this.game;
        const item = { kind: 'weapon', type: w.type, id: w.id };
        for (const side of ['left', 'right']) if (g.weapons.hands[side].held === w) g.weapons._forget(side, g.character.getActiveHands()[side]);
        if (slot != null && !this.slots[slot]) { this.slots[slot] = item; this._render(); } else if (!this.store(item)) return false;
        if (g.sync) g.sync.weaponGone?.(w);
        g.weapons.remove(w);
        return true;
    }

    /** Right pocket: what the hand holds goes into a slot. */
    pocketRight() {
        const g = this.game;
        for (const side of ['right', 'left']) {
            const w = g.weapons.hands[side].held;
            if (w) {
                if (this.inHand?.weapon === w) this.inHand = null;
                if (this._storeWeapon(w)) this._fx('🎒 ' + (w.type === 'axe' ? 'Топор' : 'Меч') + ' в ячейке');
                return;
            }
        }
        if (g.books?.inHand) {
            const book = g.books.putAway();
            if (this.store(book)) this._fx('🎒 Книга в ячейке');
            if (this.inHand?.kind === 'book') this.inHand = null;
        }
    }

    _fx(text) {
        this.game.hud.toast?.(text, 1200);
        const p = this.game.character.getHandWorldPosition('right');
        for (let i = 0; i < 12; i++) this.game.fx.spark(p, i % 2 ? 0xfff2a8 : 0xffffff, 0.08, _v.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.4);
    }

    // ============================================================== gestures
    /**
     * A hand that was up / in front and then comes down to the hip on its side
     * = touching the pocket. (A hand simply hanging down never counts.)
     */
    update(dt) {
        const g = this.game;
        if (!g.currentPose || g.combat.immobile) { this._updateHandBlock(); return; }
        const ch = g.character;
        ch.group.updateMatrixWorld(true);
        _inv.copy(ch.group.matrixWorld).invert();
        const now = performance.now();
        for (const side of ['left', 'right']) {
            const st = this._pocket[side];
            const local = ch.getHandWorldPosition(side, _v).applyMatrix4(_inv);
            const sx = side === 'right' ? 1 : -1;
            // hand up or reaching forward: the start of a "put it away" movement
            if (local.y > 0.9 || local.z < -0.9) st.raisedAt = now;
            const atHip = local.x * sx > 0.35 && local.y > -0.95 && local.y < 0.55 && Math.abs(local.z) < 0.7;
            if (atHip && !st.inZone && now - st.raisedAt < 1500 && now - st.out > 800) {
                st.inZone = true;
                st.out = now;
                if (side === 'right') this.pocketRight();
                else this.select(this.selected + 1);
            } else if (!atHip) st.inZone = false;
        }
        this._updateHandBlock();
    }

    /** A small glowing block of the chosen resource floats in the right hand. */
    _updateHandBlock() {
        const s = this.inHand && this.inHand.kind === 'res' ? this.inHand.stack : null;
        const show = s && s.count > 0 && this.slots.includes(s);
        if (!show) { if (this._handBlock) this._handBlock.visible = false; return; }
        if (!this._handBlock) {
            this._handBlock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 }));
            this.game.scene.add(this._handBlock);
        }
        const b = this._handBlock;
        b.visible = true;
        b.material.color.setHex(RESOURCE[s.block]?.color ?? 0xffffff);
        const p = this.game.character.getGripObject('right').getWorldPosition(_v);
        const t = performance.now() / 1000;
        b.position.set(p.x, p.y + 0.3 + Math.sin(t * 3) * 0.04, p.z);
        b.rotation.set(t * 0.7, t, 0);
    }

    // =================================================================== HUD
    _buildBar() {
        if (typeof document === 'undefined') return;
        let bar = document.getElementById('hotbar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'hotbar';
            document.body.appendChild(bar);
        }
        bar.innerHTML = '';
        this.cells = [];
        for (let i = 0; i < SLOT_COUNT; i++) {
            const c = document.createElement('div');
            c.className = 'hotbar-slot';
            c.innerHTML = '<div class="hb-icon"></div><div class="hb-count"></div><div class="hb-key">' + (i + 1) + '</div>';
            bar.appendChild(c);
            this.cells.push(c);
        }
        this.bar = bar;
        this._render();
    }

    show(on) {
        if (this.bar) this.bar.style.display = on ? 'flex' : 'none';
    }

    _render() {
        if (!this.cells) return;
        this.cells.forEach((c, i) => {
            const s = this.slots[i];
            const icon = c.querySelector('.hb-icon');
            const count = c.querySelector('.hb-count');
            c.classList.toggle('sel', i === this.selected);
            c.title = '';
            icon.style.background = 'none';
            icon.textContent = '';
            count.textContent = '';
            if (!s) return;
            if (s.kind === 'res') {
                const r = RESOURCE[s.block];
                const col = '#' + (r?.color ?? 0xffffff).toString(16).padStart(6, '0');
                icon.style.background = `linear-gradient(135deg, ${col}, ${col} 60%, rgba(0,0,0,.35))`;
                count.textContent = s.count;
                c.title = r?.name || '';
            } else if (s.kind === 'weapon') {
                icon.textContent = s.type === 'axe' ? '🪓' : '🗡️';
            } else if (s.kind === 'book') {
                icon.textContent = '📖';
            }
        });
    }

    dispose() {
        if (this._handBlock) { this.game.scene.remove(this._handBlock); this._handBlock.geometry.dispose(); this._handBlock.material.dispose(); }
        this.show(false);
    }
}
