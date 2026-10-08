/**
 * Inventory.js — five slots under the fatigue bar (like Minecraft's hotbar).
 *
 * A slot holds a stack of a resource (up to 100 blocks of one kind: stone,
 * earth, oak, birch… gathered with «Gather»), a weapon (sword / axe) or a
 * book of spells (from a book-bird).
 *
 * Before the slots there is the «hand» cell: nothing can be put there, it
 * just means «the right hand is free».
 *
 * Hands, no words:
 *   - right pocket: lift the hand a little and STRIKE it down onto the right
 *     hip — the sword / axe / book in it goes into a slot (simply lowering
 *     the hand never does: you can run with a sword held down);
 *   - left pocket: strike the left hip the same way — the next cell is
 *     chosen, and what is in it appears in the right hand (a weapon to hold,
 *     a book, or a small block of the resource the building spells use).
 * Keys 1–5 choose a slot too, the key 0 / ` — the free hand.
 */

import * as THREE from 'three';
import { BLOCK, TREE_KINDS } from '../world/Terrain.js';
import { ITEM_INFO } from './ItemTypes.js';

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

/**
 * Is it a strike on the pocket? `hist` — the hand's recent heights (body
 * space, y up from the hips), `local` — where it is now, `sx` — +1 right, −1 left.
 */
export function pocketStrike(hist, local, sx) {
    if (!(local.x * sx > 0.3 && local.y < 0.55 && local.y > -1.3 && Math.abs(local.z) < 0.85)) return false;
    let top = -Infinity, fast = 0;
    for (let i = 0; i < hist.length; i++) {
        top = Math.max(top, hist[i].y);
        if (i > 0) {
            const dt = (hist[i].t - hist[i - 1].t) / 1000;
            if (dt > 0) fast = Math.max(fast, (hist[i - 1].y - hist[i].y) / dt);
        }
    }
    return top - local.y > 0.45 && fast > 2.4;
}
const _inv = new THREE.Matrix4();

export class Inventory {
    constructor(game) {
        this.game = game;
        this.slots = new Array(SLOT_COUNT).fill(null);
        this.selected = -1; // -1: the «hand» cell (free right hand)
        this.inHand = null; // {slot, kind, weapon?}: what of the selected slot is in the right hand
        this._pocket = { left: { out: 0, hist: [] }, right: { out: 0, hist: [] } };
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
        for (let i = 0; i < this.slots.length && left > 0; i++) {
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

    /** A found thing into a slot (food stacks up to 10). */
    storeItem(item) {
        const max = ITEM_INFO[item.kind]?.stack;
        if (max) {
            for (const s of this.slots) {
                if (s && s.kind === item.kind && (s.count || 1) < max) {
                    const n = Math.min(max - (s.count || 1), item.count || 1);
                    s.count = (s.count || 1) + n;
                    item.count = (item.count || 1) - n;
                    if (item.count <= 0) { this._render(); return true; }
                }
            }
        }
        return this.store(item);
    }

    /** Put an item (weapon / book) into a free slot (the chosen one first). */
    store(item) {
        let i = this.selected >= 0 && !this.slots[this.selected] ? this.selected : this.slots.findIndex((s) => !s);
        if (i < 0) { this.game.hud.toast?.('🎒 Все ячейки заняты'); return false; }
        this.slots[i] = item;
        this._render();
        return true;
    }

    /** Choose a cell: -1 is the free hand, 0… the slots. */
    select(i) {
        if (i === this.selected && (this.inHand || i < 0)) return;
        this._putBackHand();
        const n = this.slots.length + 1;
        this.selected = ((((i + 1) % n) + n) % n) - 1;
        this._takeIntoHand();
        this._render();
    }

    /** A backpack adds 3–5 slots (0 takes them off; what was there is kept if it fits). */
    setExtraSlots(n) {
        const want = SLOT_COUNT + n;
        while (this.slots.length < want) this.slots.push(null);
        while (this.slots.length > want) {
            const it = this.slots.pop();
            if (it) { const j = this.slots.findIndex((s) => !s); if (j >= 0) this.slots[j] = it; }
        }
        if (this.selected >= this.slots.length) this.selected = -1;
        this._buildBar();
    }

    // =========================================================== hand / item
    /** What of the chosen slot appears in the right hand. */
    _takeIntoHand() {
        const s = this.selected >= 0 ? this.slots[this.selected] : null;
        const g = this.game;
        if (!s) return;
        if (s.kind === 'weapon') {
            if (g.weapons.hands.right.held) return; // the hand is busy
            const ch = g.character;
            const p = ch.getGripObject('right').getWorldPosition(new THREE.Vector3());
            const w = g.weapons.markMagic(g.weapons.spawn(s.type, p, new THREE.Quaternion(), s.id), s.magic ? s.bonus : 0);
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
        if (s.kind === 'res') { this.inHand = { kind: 'res', stack: s }; return; }
        // any other thing (wand, scroll, shield, food…)
        if (g.items && !g.items.held.right && !g.weapons.hands.right.held) {
            g.items.takeIntoHand(s, 'right');
            this.slots[this.selected] = null;
            this.inHand = { kind: 'item', item: s };
        }
    }

    /** Switching slots: a weapon taken out of the chosen slot goes back into it. */
    _putBackHand() {
        const h = this.inHand;
        this.inHand = null;
        if (!h) return;
        const slot = this.selected >= 0 && !this.slots[this.selected] ? this.selected : null;
        if (h.kind === 'weapon' && this.game.weapons.hands.right.held === h.weapon) this._storeWeapon(h.weapon, slot);
        if (h.kind === 'book' && this.game.books?.inHand) { const b = this.game.books.putAway(); if (slot != null) this.slots[slot] = b; else this.store(b); }
        if (h.kind === 'item' && this.game.items?.held.right?.item === h.item) { const it = this.game.items.releaseHand('right'); if (slot != null) this.slots[slot] = it; else this.storeItem(it); }
    }

    _storeWeapon(w, slot = null) {
        const g = this.game;
        const item = { kind: 'weapon', type: w.type, id: w.id, magic: !!w.magic, bonus: w.bonus || 0 };
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
                if (this._storeWeapon(w)) { this._fx('🎒 ' + (w.type === 'axe' ? 'Топор' : 'Меч') + ' в ячейке'); this.selected = -1; this._render(); }
                return;
            }
        }
        for (const side of ['right', 'left']) {
            const h = g.items?.held[side];
            if (!h) continue;
            const it = g.items.releaseHand(side);
            if (this.inHand?.item === it) this.inHand = null;
            if (this.storeItem(it)) this._fx('🎒 ' + (ITEM_INFO[it.kind]?.name || 'Предмет') + ' в ячейке');
            this.selected = -1;
            this._render();
            return;
        }
        if (g.books?.inHand) {
            const book = g.books.putAway();
            if (this.store(book)) this._fx('🎒 Книга в ячейке');
            if (this.inHand?.kind === 'book') this.inHand = null;
            this.selected = -1;
            this._render();
        }
    }

    _fx(text) {
        this.game.hud.toast?.(text, 1200);
        const p = this.game.character.getHandWorldPosition('right');
        for (let i = 0; i < 12; i++) this.game.fx.spark(p, i % 2 ? 0xfff2a8 : 0xffffff, 0.08, _v.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.4);
    }

    // ============================================================== gestures
    /**
     * A strike on the pocket: within the last ~0.6 s the hand was at least
     * 0.45 m higher and came down fast (> 2.4 m/s) onto the hip on its side.
     * A hand just hanging down, or lowered slowly, never counts; nor do the
     * arms swinging while running.
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
            st.hist.push({ t: now, y: local.y });
            while (st.hist.length && now - st.hist[0].t > 600) st.hist.shift();
            if (ch.isRunning || ch.flying) { st.hist.length = 0; continue; }
            const atHip = pocketStrike(st.hist, local, sx);
            if (atHip && !st.inZone && now - st.out > 700) {
                st.inZone = true;
                st.out = now;
                st.hist.length = 0;
                if (side === 'right') this.pocketRight();
                else this.select(this.selected + 1);
            } else if (local.y > 0.7) st.inZone = false;
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
        const hand = document.createElement('div');
        hand.className = 'hotbar-slot hand';
        hand.title = 'Свободная рука';
        hand.innerHTML = '<div class="hb-icon">✋</div><div class="hb-key">0</div>';
        hand.onclick = () => this.select(-1);
        bar.appendChild(hand);
        this.handCell = hand;
        for (let i = 0; i < this.slots.length; i++) {
            const c = document.createElement('div');
            c.className = 'hotbar-slot';
            c.innerHTML = '<div class="hb-icon"></div><div class="hb-count"></div><div class="hb-key">' + (i < 9 ? i + 1 : '') + '</div>';
            c.onclick = () => this.select(i);
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
        this.handCell?.classList.toggle('sel', this.selected < 0);
        this.cells.forEach((c, i) => {
            const s = this.slots[i];
            const icon = c.querySelector('.hb-icon');
            const count = c.querySelector('.hb-count');
            c.classList.toggle('sel', i === this.selected);
            c.title = '';
            icon.style.background = 'none';
            icon.style.textShadow = '';
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
                if (s.magic) icon.style.textShadow = '0 0 8px #6fb8ff, 0 0 3px #fff';
            } else if (s.kind === 'book') {
                icon.textContent = '📖';
            } else {
                icon.textContent = ITEM_INFO[s.kind]?.icon || '❔';
                if (s.kind === 'wand' && s.color != null) icon.style.background = `radial-gradient(circle, #${(s.color >>> 0).toString(16).padStart(6, '0')}55, transparent 70%)`;
                if (s.kind === 'weapon') icon.textContent = s.type === 'axe' ? '🪓' : '🗡️';
                if (s.count > 1) count.textContent = s.count;
                if (s.kind === 'bow') count.textContent = s.arrows ?? '';
                c.title = ITEM_INFO[s.kind]?.name || '';
            }
        });
    }

    dispose() {
        if (this._handBlock) { this.game.scene.remove(this._handBlock); this._handBlock.geometry.dispose(); this._handBlock.material.dispose(); }
        this.show(false);
    }
}
