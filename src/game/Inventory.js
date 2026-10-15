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
 * Hands, no words (a hand really put INTO the pocket for a moment — a slap on the
 * hip, a hand hanging or swinging never does anything):
 *   - the wand has its own place, tucked into the waistband in front (WandBelt.js):
 *     tucked in there to put it away, taken from there looking down at it;
 *   - the coin pouches tied to the belt on the right side (CoinBelt.js): a pouch in the
 *     right hand put on the side is tied on (the next ones emptied into it), taken off
 *     looking down at it;
 *   - the right pocket: the right hand holding a thing puts it away; put in empty,
 *     it takes out the next thing of the slots (food, a scroll, a book, the building
 *     blocks…);
 *   - over the shoulder: swords, axes, shields, the bow, the hammer — on the back,
 *     or taken from it.
 * The «hand» cell shows what the hands hold. Keys 1–5 choose a slot too, 0 / ` — the free hand.
 */

import * as THREE from 'three';
import { BLOCK, TREE_KINDS } from '../world/Terrain.js';
import { ITEM_INFO, starterWand } from './ItemTypes.js';
import { WandBelt } from './WandBelt.js';
import { CoinBelt, BELT_MAX } from './CoinBelt.js';
import { armorIcon } from './Armor.js';
import { armorName } from './ArmorTypes.js';

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
export const resourceOf = (block) => (block === BLOCK.GRASS ? BLOCK.DIRT : block === BLOCK.GRAVEL || block === BLOCK.DEEPSTONE ? BLOCK.STONE : block);

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _y = new THREE.Vector3(0, 1, 0);

/**
 * Is it a strike on the pocket? `hist` — the hand's recent heights (body
 * space, y up from the hips), `local` — where it is now, `sx` — +1 right, −1 left.
 */
export function pocketStrike(hist, local, sx) {
    // at the hip on its own side (the hero's body: shoulders at y 1.25, hips near −0.3)
    if (!(local.x * sx > 0.3 && local.y < 0.4 && local.y > -1.1 && Math.abs(local.z) < 0.8)) return false;
    const n = hist.length;
    if (n < 3) return false;
    let top = -Infinity, fast = 0, fastI = -1;
    for (let i = 0; i < n; i++) {
        top = Math.max(top, hist[i].y);
        if (i > 0) {
            const dt = (hist[i].t - hist[i - 1].t) / 1000;
            const sp = dt > 0 ? (hist[i - 1].y - hist[i].y) / dt : 0;
            if (sp > fast) { fast = sp; fastI = i; }
        }
    }
    // the hand stopped on the hip (a hit), it did not just go on down
    const lastDt = (hist[n - 1].t - hist[n - 2].t) / 1000;
    const now = lastDt > 0 ? (hist[n - 2].y - hist[n - 1].y) / lastDt : fast;
    return top - local.y > 0.6 && fast > 3.2 && fastI < n - 1 && now < fast * 0.5;
}

/** s the hand must stay in the pocket (the camera: wrist at the hip, elbow bent, hand gone in). */
export const POCKET_DWELL = 0.3;

/** Things that go on the back (over the shoulder) rather than into a pocket. */
export const BACK_KINDS = new Set(['weapon', 'hammer', 'bow', 'shield', 'dragonEgg', 'iceRod']); // (a dragon's egg is too big for a pocket)

/** The hand is over the shoulder, behind the head, and keeps still there. */
export function behindBack(local, speed) {
    return local.y > 1.55 && local.z > -0.15 && Math.abs(local.x) < 1.05 && speed < 2.2;
}
const _inv = new THREE.Matrix4();

export class Inventory {
    constructor(game) {
        this.game = game;
        this.slots = new Array(SLOT_COUNT).fill(null);
        this.selected = -1; // -1: the «hand» cell (free right hand)
        this.inHand = null; // {slot, kind, weapon?}: what of the selected slot is in the right hand
        this._pocket = { left: { out: 0, hist: [], armed: true }, right: { out: 0, hist: [], armed: true } };
        this.belt = new WandBelt(game); // (the wand's place at the waistband: WandBelt.js)
        this.purse = new CoinBelt(game); // (the coin pouches on the belt's right side: CoinBelt.js)
        this._back = { left: { t: 0, at: 0 }, right: { t: 0, at: 0 } };
        this._backModels = []; // the weapons seen on the back
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

    /** Creative: building needs nothing in the slots — an endless stack of wood (oak). */
    get free() {
        return this.game.config?.mode === 'creative';
    }

    endlessWood() {
        return this._endless || (this._endless = { kind: 'res', block: BLOCK.WOOD, count: STACK, endless: true });
    }

    /** The resource the building spells use: the chosen slot (or any resource slot); creative: endless wood. */
    buildResource() {
        const s = this.slots[this.selected];
        if (s && s.kind === 'res' && s.count > 0) return s;
        return this.free ? this.endlessWood() : null;
    }

    /** Take one block from a stack (building). Creative: nothing is used up. */
    take(stack, n = 1) {
        if (stack && (stack.endless || (this.free && stack.kind === 'res'))) return true;
        if (!stack || stack.count < n) return false;
        stack.count -= n;
        if (stack.count <= 0) {
            const i = this.slots.indexOf(stack);
            if (i >= 0) this.slots[i] = null;
        }
        this._render();
        return true;
    }

    /** All the coins I have (on the belt, in the slots and in my hands). */
    coins() {
        let n = this.purse?.count || 0;
        for (const s of this.slots) if (s && s.kind === 'coins') n += s.count || 0;
        for (const side of ['right', 'left']) { const h = this.game.items?.held[side]; if (h && h.item.kind === 'coins') n += h.item.count || 0; }
        return n;
    }

    /** Pay `n` coins (false — not enough). */
    spendCoins(n) {
        if (this.coins() < n) return false;
        let left = n;
        for (const side of ['right', 'left']) {
            const h = this.game.items?.held[side];
            if (!h || h.item.kind !== 'coins' || left <= 0) continue;
            const k = Math.min(left, h.item.count || 0);
            h.item.count -= k; left -= k;
            if (h.item.count <= 0) this.game.items.releaseHand(side);
        }
        for (let i = 0; i < this.slots.length && left > 0; i++) {
            const s = this.slots[i];
            if (!s || s.kind !== 'coins') continue;
            const k = Math.min(left, s.count || 0);
            s.count -= k; left -= k;
            if (s.count <= 0) this.slots[i] = null;
        }
        if (left > 0) left -= this.purse.spend(left); // (the last pouch on the belt first)
        this._render();
        return true;
    }

    /**
     * Every wizard has a wand: the plain wooden one, if there is no wand in the
     * slots or the hands (a new game, a guest, after death…).
     */
    ensureStarterWand() {
        const g = this.game;
        const has = this.slots.some((s) => s?.kind === 'wand') || ['left', 'right'].some((side) => g.items?.held[side]?.item.kind === 'wand');
        if (has) return false;
        const i = this.slots.findIndex((s) => !s);
        if (i < 0) return false;
        this.slots[i] = starterWand();
        this._render();
        return true;
    }

    /** A found thing into a slot (food stacks up to 10, coins up to 500). */
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
    /** What of the chosen slot appears in the leading hand (the right one; a left-hander's left). */
    _takeIntoHand() {
        const s = this.selected >= 0 ? this.slots[this.selected] : null;
        const g = this.game, D = g.dom || 'right';
        if (!s) return;
        if (s.kind === 'weapon') {
            if (g.weapons.hands[D].held) return; // the hand is busy
            const ch = g.character;
            const p = ch.getGripObject(D).getWorldPosition(new THREE.Vector3());
            const w = g.weapons.markMagic(g.weapons.spawn(s.type, p, new THREE.Quaternion(), s.id), s.magic ? s.bonus : 0);
            if (g.sync) g.sync.weaponAppeared?.(w);
            w.wake();
            g.weapons.grab(w, D, 0.5);
            g.weapons.hands[D].waitClose = true;
            this.slots[this.selected] = null;
            this.inHand = { kind: 'weapon', weapon: w };
            return;
        }
        if (s.kind === 'res') { this.inHand = { kind: 'res', stack: s }; return; }
        // any other thing (wand, scroll, shield, food…)
        if (g.items && !g.items.held[D] && !g.weapons.hands[D].held) {
            g.items.takeIntoHand(s, D);
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
        const D = this.game.dom || 'right';
        if (h.kind === 'weapon' && this.game.weapons.hands[D].held === h.weapon) this._storeWeapon(h.weapon, slot);
        if (h.kind === 'item' && this.game.items?.held[D]?.item === h.item) { const it = this.game.items.releaseHand(D); if (slot != null) this.slots[slot] = it; else this.storeItem(it); }
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

    /** The leading hand's pocket (the right one; a left-hander's left): what the hand holds goes into a slot. */
    pocketRight() {
        const g = this.game, dom = g.dom || 'right';
        if (g.boards?.hold) { g.hud.toast?.('🏄 Доска слишком большая для кармана'); return; }
        // a sword, an axe, a hammer, a bow, a shield never go into a pocket: only on the back (over the shoulder)
        for (const side of [dom, dom === 'right' ? 'left' : 'right']) {
            const w = g.weapons.hands[side].held;
            const h = g.items?.held[side];
            if (w || (h && BACK_KINDS.has(h.item.kind))) {
                const name = w ? (w.type === 'axe' ? 'Топор' : 'Меч') : ITEM_INFO[h.item.kind]?.name || 'Это';
                g.hud.toast?.(`${name} не влезет в карман — заведите руку с ним за плечо, чтобы убрать за спину`, 1800);
                return;
            }
        }
        for (const side of [dom, dom === 'right' ? 'left' : 'right']) {
            const h = g.items?.held[side];
            if (!h || h.item.kind === 'wand') continue; // (the wand goes only to the waistband: WandBelt)
            if (h.item.kind === 'coins' && this.purse.count < BELT_MAX) { this.purse._tieOn(side); return; } // (money goes to the pouches on the belt)
            const it = g.items.releaseHand(side);
            if (this.inHand?.item === it) this.inHand = null;
            if (this.storeItem(it)) this._fx('🎒 ' + (ITEM_INFO[it.kind]?.name || 'Предмет') + ' в ячейке');
            this.selected = -1;
            this._render();
            return;
        }
    }

    /** The hand holds a thing that goes into a slot (not the wand, not coins — the belt's, not a weapon — the back's). */
    _pocketable(side) {
        const g = this.game;
        const h = g.items?.held[side];
        if (!h || g.weapons?.hands?.[side]?.held || g.boards?.hold) return false;
        const k = h.item.kind;
        return k !== 'wand' && k !== 'coins' && !BACK_KINDS.has(k);
    }

    _fx(text, side = 'right') {
        this.game.hud.toast?.(text, 1200);
        const p = this.game.character.getHandWorldPosition(side);
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
        this._renderCoins();
        if (!g.currentPose || g.combat.immobile) { this.belt._show(); this.purse._show(); this._updateHandBlock(); return; }
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
            // the hand put INTO the pocket (as the camera sees it): it stays there a moment
            // (a slap on the hip no longer counts: people did it by accident)
            // (the things' pocket is the leading hand's: the right one, a left-hander's left — PoseInterpreter.bodyPlaces)
            const pk = g.currentPose.pocket, dom = g.dom || 'right';
            let inPocket = side === dom ? pk?.dom : pk?.off;
            // a thing in the leading hand brought to its hip, as a pouch is tied on (the hand is
            // seen holding it, so its fingers never point down into the pocket): it goes into a slot too
            if (side === dom && inPocket !== true && g.currentPose.purse?.dom === true && this._pocketable(dom)) inPocket = true;
            // the right hand reaching across into the LEFT pocket: the wand's pocket too
            // (the wand is no longer put away / drawn by a pocket — lowering the arm did it by
            // accident: it has its own place at the waistband, WandBelt.js)
            st.inT = inPocket ? (st.inT || 0) + dt : 0;
            st.outT = inPocket === false || inPocket == null ? (st.outT || 0) + dt : 0;
            if (st.outT > 0.4) st.armed = true; // (taken out again: ready for the next time)
            const putIn = st.armed && st.inT > POCKET_DWELL;
            if (putIn && now - st.out > 700) {
                st.armed = false;
                st.out = now;
                st.hist.length = 0;
                if (side !== dom) { /* (the other hand's pocket was the wand's: see WandBelt) */ }
                else if (g.items?.held[dom] || g.weapons.hands[dom].held) this.pocketRight();
                else this.takeNext(dom);
            }
            // over the shoulder: put the weapon / hammer / bow / shield on the back, or take it
            const b = this._back[side];
            if (behindBack(local, ch.handVelocity[side].length())) b.t += dt; else b.t = 0;
            if (b.t > 0.5 && now - b.at > 1200) { b.t = 0; b.at = now; this._backGesture(side); }
        }
        this.belt.update(dt);
        this.purse.update(dt);
        this._updateHandBlock();
        this._updateBack();
        // the «hand» cell shows what the hands hold
        const hk = this._handKey();
        if (hk !== this._hk) { this._hk = hk; this._render(); }
    }

    /**
     * The wand's pocket (the left one): put the wand away (from whichever hand holds it), or draw
     * it — always into the RIGHT hand (the left only if the right is busy), whichever hand went in.
     */
    wandPocket(side) {
        const g = this.game;
        const holder = ['right', 'left'].find((sd) => g.items?.held[sd]?.item.kind === 'wand');
        if (holder) side = holder;
        else {
            const busy = (sd) => !!(g.items?.held[sd] || g.weapons.hands[sd].held);
            side = !busy('right') ? 'right' : !busy('left') ? 'left' : side;
        }
        const h = g.items?.held[side];
        if (h && h.item.kind === 'wand') {
            const it = g.items.releaseHand(side);
            if (this.inHand?.item === it) this.inHand = null;
            const free = this.slots.findIndex((x) => !x);
            if (free >= 0) { this.slots[free] = it; this._render(); } else if (!this.storeItem(it)) return false;
            this._fx('🪄 Палочка в кармане', side);
            return true;
        }
        if (h || g.weapons.hands[side].held) return false; // (the hand is busy)
        const i = this.slots.findIndex((x) => x?.kind === 'wand');
        if (i < 0) { this.game.hud.toast?.('🪄 В кармане нет палочки'); return false; }
        if (!this._fromSlot(i, side)) return false;
        this._fx('🪄 Палочка в руке', side);
        this._render();
        return true;
    }

    /** The right pocket, an empty hand: the next thing of the slots (not the wand, not what goes on the back). */
    takeNext(side = 'right') {
        const n = this.slots.length;
        const start = this._next ?? -1;
        for (let k = 1; k <= n; k++) {
            const i = (start + k) % n;
            const it = this.slots[i];
            if (!it || it.kind === 'wand' || BACK_KINDS.has(it.kind)) continue;
            this._next = i;
            this.select(i);
            this._fx(`${it.kind === 'res' ? '🧱' : ITEM_INFO[it.kind]?.icon || '✋'} ${it.kind === 'res' ? RESOURCE[it.block]?.name || 'Блоки' : ITEM_INFO[it.kind]?.name || 'Предмет'}`, side);
            return true;
        }
        this.game.hud.toast?.('🎒 В кармане пусто');
        return false;
    }

    /** What the hands hold, as a short key (to redraw the «hand» cell when it changes). */
    _handKey() {
        const g = this.game;
        const one = (side) => {
            const w = g.weapons?.hands?.[side]?.held;
            if (w) return w.type === 'axe' ? '🪓' : '🗡️';
            const h = g.items?.held?.[side];
            return h ? ITEM_INFO[h.item.kind]?.icon || '❔' : '';
        };
        return one('left') + '|' + one('right');
    }

    /** What the hand holds, if it goes on the back: {kind:'weapon', w} | {kind:'item', h}. */
    _backThing(side) {
        const g = this.game;
        const w = g.weapons.hands[side].held;
        if (w) return { kind: 'weapon', w };
        const h = g.items?.held[side];
        if (h && BACK_KINDS.has(h.item.kind)) return { kind: 'item', h };
        return null;
    }

    _backGesture(side) {
        const g = this.game;
        const t = this._backThing(side);
        if (t) {
            // on the back (and into a slot)
            if (t.kind === 'weapon') {
                if (this.inHand?.weapon === t.w) this.inHand = null;
                if (this._storeWeapon(t.w)) this._fx((t.w.type === 'axe' ? '🪓 Топор' : '🗡️ Меч') + ' за спиной', side);
            } else {
                const it = g.items.releaseHand(side);
                if (this.inHand?.item === it) this.inHand = null;
                if (this.storeItem(it)) this._fx(`${ITEM_INFO[it.kind]?.icon || '🎒'} ${ITEM_INFO[it.kind]?.name || 'Предмет'} за спиной`, side);
            }
            this.selected = -1;
            this._render();
            return;
        }
        // an empty hand over the shoulder takes what is on the back (the bow hand's other hand takes arrows instead)
        const other = side === 'right' ? 'left' : 'right';
        if (g.items?.held[side] || g.weapons.hands[side].held || g.items?.held[other]?.item.kind === 'bow') return;
        const i = this.slots.findIndex((s) => s && BACK_KINDS.has(s.kind));
        if (i < 0) return;
        if (this._fromSlot(i, side)) this._fx('✋ Достали со спины', side);
        this._render();
    }

    /** A slot's thing into a hand (weapon, bow, shield, hammer…). */
    _fromSlot(i, side) {
        const g = this.game;
        const s = this.slots[i];
        if (!s) return false;
        if (s.kind === 'weapon') {
            if (g.weapons.hands[side].held) return false;
            const p = g.character.getGripObject(side).getWorldPosition(new THREE.Vector3());
            const w = g.weapons.markMagic(g.weapons.spawn(s.type, p, new THREE.Quaternion(), s.id), s.magic ? s.bonus : 0);
            if (g.sync) g.sync.weaponAppeared?.(w);
            w.wake();
            g.weapons.grab(w, side, 0.5);
            g.weapons.hands[side].waitClose = true;
            this.slots[i] = null;
            return true;
        }
        if (g.items && !g.items.held[side] && !g.weapons.hands[side].held) {
            g.items.takeIntoHand(s, side);
            this.slots[i] = null;
            return true;
        }
        return false;
    }

    /** The weapons (and bow / shield / hammer) in the slots are seen on the back. */
    _updateBack() {
        const g = this.game;
        const ch = g.character;
        const want = this.slots.filter((s) => s && BACK_KINDS.has(s.kind)).slice(0, 3);
        const key = want.map((s) => s.kind + (s.type ?? '') + (s.uid || s.id || '')).join('|');
        if (key !== this._backKey) {
            this._backKey = key;
            for (const m of this._backModels) g.scene.remove(m);
            this._backModels = want.map((s) => this._backModel(s)).filter(Boolean);
            for (const m of this._backModels) g.scene.add(m);
        }
        if (!this._backModels.length) return;
        const vis = !(g.config?.handsHidden) && ch.group.visible;
        ch.torso.getWorldPosition(_v);
        const q = ch.group.getWorldQuaternion(_q);
        const pack = g.items?.worn?.backpack ? 0.45 : 0;
        this._backModels.forEach((m, k) => {
            m.visible = vis;
            const tilt = [0.55, -0.55, 0][k] ?? 0;
            m.position.copy(_v).add(_v2.set((k - 1) * 0.25, 0.15, 0.55 + pack + k * 0.12).applyQuaternion(q));
            m.quaternion.copy(q).multiply(_q2.setFromAxisAngle(_z, Math.PI + tilt));
            if (m.userData.flat) m.quaternion.multiply(_q2.setFromAxisAngle(_y, Math.PI));
        });
    }

    _backModel(s) {
        const g = this.game;
        if (s.kind === 'weapon') {
            if (!this._buildWeapon) return null;
            const { group, spec } = this._buildWeapon(s.type, g.renderer);
            group.scale.setScalar(spec?.scale || 2.6);
            const holder = new THREE.Group();
            group.position.y = -0.9; // (the handle up over the shoulder)
            holder.add(group);
            return holder;
        }
        if (!this._makeItemModel) return null;
        const m = this._makeItemModel(s);
        const holder = new THREE.Group();
        holder.add(m);
        holder.userData.flat = s.kind === 'shield' || s.kind === 'bow';
        return holder;
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
        const p = this.game.character.getGripObject(this.game.dom || 'right').getWorldPosition(_v);
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

    /** The coin counter at the top right of the screen: 🪙 and all my coins. */
    _renderCoins() {
        if (typeof document === 'undefined') return;
        const n = this.coins();
        if (n === this._coinsShown) return;
        const el = document.getElementById('coin-count');
        if (!el) return;
        this._coinsShown = n;
        el.textContent = n;
    }

    show(on) {
        if (this.bar) this.bar.style.display = on ? 'flex' : 'none';
    }

    _render() {
        if (!this.cells) return;
        this.handCell?.classList.toggle('sel', this.selected < 0);
        if (this.handCell) {
            const [l, r] = this._handKey().split('|');
            const icon = this.handCell.querySelector('.hb-icon');
            if (icon) icon.textContent = l || r ? (l && r ? l + r : l || r) : '✋';
            this.handCell.title = l || r ? 'В руках' : 'Свободная рука';
        }
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
            } else if (s.kind === 'armor' || s.kind === 'robe') {
                // a piece of armour / a robe: its own little picture (Armor.js)
                icon.innerHTML = armorIcon(s.kind === 'robe' ? 'robe' : s.piece, s.named ? 3 : s.magic ? 2 : 1, s.color || 0);
                if (s.magic) icon.style.textShadow = '0 0 8px #6fb8ff';
                c.title = armorName(s);
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
        this.purse.dispose();
        if (this._handBlock) { this.game.scene.remove(this._handBlock); this._handBlock.geometry.dispose(); this._handBlock.material.dispose(); }
        this.show(false);
    }
}
