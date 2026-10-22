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
 *   - the coin pouches tied to the belt on the right side (CoinBelt.js), beside the hip;
 *   - the right pocket, in front of the right hip: the LEFT hand reaching across, looking down
 *     at it, puts away what it holds; put in empty, it takes out the next thing of the slots
 *     (food, a scroll, a book, the building blocks…) into the left hand.
 *   The pocket and the pouches are the OTHER hand's (the author: a right-hander takes things out
 *   of the right pocket with the left hand — the right hand is the wand's, it never takes from or
 *   puts into them), and only looking down at them (as in life: never by chance). A left-hander:
 *   all mirrored (the left pocket and pouches, the right hand).
 *   - over the shoulder: swords, axes, shields, the bow, the hammer — on the back,
 *     or taken from it.
 * The «hand» cell shows what the hands hold. Keys 1–5 choose a slot too, 0 / ` — the free hand.
 */

import * as THREE from 'three';
import { BLOCK, TREE_KINDS } from '../world/Terrain.js';
import { ITEM_INFO, starterWand } from './ItemTypes.js';
import { WandBelt } from './WandBelt.js';
import { CoinBelt } from './CoinBelt.js';
import { armorIcon } from './Armor.js';
import { armorName } from './ArmorTypes.js';
import { accioCatcher } from './Accio.js';

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
export const resourceOf = (block) => (block === BLOCK.GRASS ? BLOCK.DIRT : block === BLOCK.GRAVEL || block === BLOCK.DEEPSTONE || block === BLOCK.PLANET_ROCK || block === BLOCK.PLANET_DARK ? BLOCK.STONE
    : block === BLOCK.REGOLITH ? BLOCK.SAND : block === BLOCK.PLANET_ICE ? BLOCK.ICE : block === BLOCK.PLANET_GRASS ? BLOCK.DIRT : block === BLOCK.PLANET_WOOD ? BLOCK.WOOD : block === BLOCK.PLANET_LEAF ? BLOCK.LEAVES : block); // (another planet's ground: its dust is sand, its rock stone — Space.js; a terraformed one's moss is earth, its trees wood and leaves)

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
/** The hand away from the pocket this long (s) — the chosen slot's thing stays in it. */
export const POCKET_PICK = 1.0;
/**
 * The head bowed to look at the pocket / the pouches (the view's forward, down, in the body's own
 * space: ~20° down). Taking or putting there needs it; a glance (the wand's −0.1) does not.
 */
export const POCKET_LOOK = -0.34;
const LOOK_ON = 0.1; // s looking down before it counts (a nod passing by does not)
const LOOK_OFF = 0.3; // s it still counts after the head comes up (the camera's head jitters)

/** The head bowed down, kept a moment (steady: no flicker). `st` — {on, t}; → st.on. */
export function lookSteady(st, down, dt) {
    if (down === st.on) st.t = 0;
    else if ((st.t += dt) > (down ? LOOK_ON : LOOK_OFF)) { st.on = down; st.t = 0; }
    return st.on;
}

/** Things that go on the back (over the shoulder) rather than into a pocket. */
export const BACK_KINDS = new Set(['weapon', 'hammer', 'bow', 'shield', 'dragonEgg', 'iceRod']); // (a dragon's egg is too big for a pocket)

/** The hand is over the shoulder, behind the head, and keeps still there. */
export function behindBack(local, speed) {
    return local.y > 1.55 && local.z > -0.15 && Math.abs(local.x) < 1.05 && speed < 2.2;
}
const _inv = new THREE.Matrix4();

/** Two things of one kind that look the same stack (a pig's meat with a cow's, a red potion with a blue one — not). Pure (tests). */
export function sameLook(a, b) {
    for (const k of LOOK_KEYS) if ((a[k] ?? null) !== (b[k] ?? null)) return false;
    return true;
}
const LOOK_KEYS = ['color', 'rec', 'cooked', 'stat', 'spell', 'model', 'type', 'from'];

/** The little pouch of the pouch cell: red velvet with a golden ribbon and ∞ (the only pouch there is). */
export function pouchIcon() {
    const [body, edge, tie] = ['#b3202a', '#5e0c13', '#f2c14e'];
    return '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' +
        `<path d="M8.6 7.4C3.4 10.6 3 21 12 21s8.6-10.4 3.4-13.6z" fill="${body}" stroke="${edge}" stroke-width="1.2"/>` +
        `<path d="M8.9 7.6 7.2 3.6Q12 5.2 16.8 3.6l-1.7 4z" fill="${body}" stroke="${edge}" stroke-width="1.1"/>` +
        `<rect x="7.4" y="6.6" width="9.2" height="2" rx="1" fill="${tie}" stroke="${edge}" stroke-width="0.5"/>` +
        `<text x="12" y="17.8" font-size="9" font-weight="bold" text-anchor="middle" fill="${tie}" font-family="sans-serif">∞</text>` +
        '</svg>';
}

export class Inventory {
    constructor(game) {
        this.game = game;
        this.slots = new Array(SLOT_COUNT).fill(null);
        this.selected = -1; // -1: the «hand» cell (free right hand)
        this.inHand = null; // {slot, kind, weapon?, side}: what of the selected slot is in a hand
        this._look = { on: false, t: 0 }; // (looking down at the pocket / the pouches: lookSteady)
        this.headDown = false;
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
            if (h.item.count <= 0 && !h.item.magic) this.game.items.releaseHand(side); // (the pouch stays, empty: a thing of its own)
        }
        for (let i = 0; i < this.slots.length && left > 0; i++) {
            const s = this.slots[i];
            if (!s || s.kind !== 'coins') continue;
            const k = Math.min(left, s.count || 0);
            s.count -= k; left -= k;
            if (s.count <= 0 && !s.magic) this.slots[i] = null;
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
        this.purse?.ensure(); // (every hero has the one bottomless pouch: a new game, a guest, after death…)
        const has = this.slots.some((s) => s?.kind === 'wand') || ['left', 'right'].some((side) => g.items?.held[side]?.item.kind === 'wand');
        if (has) return false;
        const i = this.slots.findIndex((s) => !s);
        if (i < 0) return false;
        this.slots[i] = { ...starterWand(), spare: true }; // (a stand-in: my own wand, if it lies somewhere, takes its place again — gotWand)
        this._render();
        return true;
    }

    /**
     * A wand came into my hand: it is «my wand» (`ownWand`, kept in the save) — unless it is the stand-in while my own
     * one is still lost (lying on the ground: dropped, knocked out, left there when the game was left).
     */
    heldWand(item) {
        if (!item || item.kind !== 'wand' || !item.uid) return;
        if (item.spare && this.ownWand && this.ownWand !== item.uid && !this.hasUid(this.ownWand)) return;
        this.ownWand = item.uid;
    }

    /**
     * My own lost wand is mine again («Акцио», picked up — after leaving the game too): the plain stand-in given
     * meanwhile (ensureStarterWand) is gone — one wand, one place in the slots (the author saw two wands after it).
     */
    gotWand(item) {
        if (!item || item.kind !== 'wand' || item.spare || !item.uid || item.uid !== this.ownWand) return false;
        const g = this.game;
        const k = this.slots.findIndex((x) => x?.kind === 'wand' && x.spare && x !== item);
        if (k >= 0) this.slots[k] = null;
        else {
            const side = ['left', 'right'].find((sd) => g.items?.held[sd]?.item.kind === 'wand' && g.items.held[sd].item.spare && g.items.held[sd].item !== item);
            if (!side) return false;
            const it = g.items.releaseHand(side);
            if (this.inHand?.item === it) this.inHand = null;
        }
        this._render();
        return true;
    }

    /** Is the thing with this uid mine already (in a slot or a hand)? (one thing — one place: never twice) */
    hasUid(uid) {
        if (!uid) return false;
        if (this.slots.some((x) => x?.uid === uid)) return true;
        const h = this.game.items?.held;
        return !!(h && (h.right?.item.uid === uid || h.left?.item.uid === uid));
    }

    /** Is there room in the slots for this thing (a free slot, or room on a stack of it)? */
    canStore(item) {
        if (!item) return false;
        if (this.slots.some((x) => !x)) return true;
        const max = item.kind === 'coins' ? 0 : ITEM_INFO[item.kind]?.stack;
        if (!max) return false;
        let room = 0;
        for (const x of this.slots) if (x && x.kind === item.kind && !x.magic && sameLook(x, item)) room += Math.max(0, max - (x.count || 1));
        return room >= (item.count || 1);
    }

    /** A found thing into a slot (food stacks up to 10, coins up to 500). */
    storeItem(item) {
        const max = item.kind === 'coins' ? 0 : ITEM_INFO[item.kind]?.stack; // (the magic pouch: a thing of its own, never stacked)
        if (max) {
            for (const s of this.slots) {
                if (s && s !== item && s.kind === item.kind && !s.magic && sameLook(s, item) && (s.count || 1) < max) {
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
        if (item && (this.slots.includes(item) || (item.uid && this.hasUid(item.uid)))) { this._render(); return true; } // (already mine: never a second entry of it)
        let i = this.selected >= 0 && !this.slots[this.selected] ? this.selected : this.slots.findIndex((s) => !s);
        if (i < 0) { this.game.hud.toast?.('🎒 Все ячейки заняты'); return false; }
        this.slots[i] = item;
        this._render();
        return true;
    }

    /** Choose a cell: -1 is the free hand, 0… the slots. */
    select(i, side = null) {
        if (i === this.selected && (this.inHand || i < 0)) return;
        this._putBackHand(side);
        const n = this.slots.length + 1;
        this.selected = ((((i + 1) % n) + n) % n) - 1;
        this._takeIntoHand(side);
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
    /** What of the chosen slot appears in the hand: the leading one (keys), or `side` (taken from the pocket by the other hand). */
    _takeIntoHand(side = null) {
        const s = this.selected >= 0 ? this.slots[this.selected] : null;
        const g = this.game, D = side || g.dom || 'right';
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
            this.inHand = { kind: 'weapon', weapon: w, side: D };
            return;
        }
        if (s.kind === 'res') { this.inHand = { kind: 'res', stack: s, side }; return; } // (seen in a free hand: resSide)
        // any other thing (wand, scroll, shield, food…)
        if (g.items && !g.items.held[D] && !g.weapons.hands[D].held) {
            g.items.takeIntoHand(s, D);
            this.slots[this.selected] = null;
            this.inHand = { kind: 'item', item: s, side: D };
        }
    }

    /**
     * Switching slots: a weapon taken out of the chosen slot goes back into it. `by`: the hand taking the next
     * thing (the pocket): only what THAT hand holds goes back — the other hand's wand never leaves it so (the
     * author: the wand went into a slot by itself while the other hand reached into the pocket); the wand goes
     * away by a hand only to the waistband (WandBelt), by the keys / a click on the slots still.
     */
    _putBackHand(by = null) {
        const h = this.inHand;
        this.inHand = null;
        if (!h) return;
        const slot = this.selected >= 0 && !this.slots[this.selected] ? this.selected : null;
        const D = h.side || this.game.dom || 'right';
        if (by && (by !== D || (h.kind === 'item' && h.item?.kind === 'wand'))) return;
        if (h.kind === 'weapon' && this.game.weapons.hands[D].held === h.weapon) this._storeWeapon(h.weapon, slot);
        if (h.kind === 'item' && this.game.items?.held[D]?.item === h.item) {
            if (slot == null && !this.canStore(h.item)) return; // (no room: it stays in the hand, never vanishes)
            const it = this.game.items.releaseHand(D);
            if (slot != null) this.slots[slot] = it; else this.storeItem(it);
        }
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

    /**
     * The things' pocket (the right one; a left-hander's left): what the hand holds goes into a slot.
     * `only` — just that hand (the other hand reaching into it); none — either hand, the leading one first.
     */
    pocketRight(only = null) {
        const g = this.game, dom = g.dom || 'right';
        if (g.boards?.hold) { g.hud.toast?.('🏄 Доска слишком большая для кармана'); return; }
        const sides = only ? [only] : [dom, dom === 'right' ? 'left' : 'right'];
        // a sword, an axe, a hammer, a bow, a shield never go into a pocket: only on the back (over the shoulder)
        for (const side of sides) {
            const w = g.weapons.hands[side].held;
            const h = g.items?.held[side];
            if (w || (h && BACK_KINDS.has(h.item.kind))) {
                const name = w ? (w.type === 'axe' ? 'Топор' : 'Меч') : ITEM_INFO[h.item.kind]?.name || 'Это';
                g.hud.toast?.(`${name} не влезет в карман — заведите руку с ним за плечо, чтобы убрать за спину`, 1800);
                return;
            }
        }
        for (const side of sides) {
            const h = g.items?.held[side];
            // (the leading hand's wand goes only to the waistband: WandBelt; a second wand in the other hand — into a slot)
            if (!h || (h.item.kind === 'wand' && side === dom)) continue;
            if (h.item.kind === 'coins' && this.purse.canTie(h.item)) { this.purse._tieOn(side); return; } // (money goes to the pouches on the belt)
            // (no room in the slots: it stays in the hand — a pouch, a scroll never vanish into a full pocket)
            if (!this.canStore(h.item)) { g.hud.toast?.('🎒 Все ячейки заняты'); return; }
            this._handsOff(side);
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

    /**
     * The pocket and the pouches are at the same hip: what one of them just did, the hand there does not
     * do again in the other at once (the author: a pouch tied on, the empty hand still there took the meat
     * out of the pocket — «the coins counted as a second meat»). The hand goes away from the hip first.
     */
    _handsOff(side) {
        const now = performance.now();
        this.pocketHold(side);
        if (this.purse) { this.purse._left = false; this.purse._at = now; this.purse._open = false; this.purse._tie = 0; }
    }

    /** The pocket on this hand's side waits until the hand has gone away from the hip (the pouches just did something). */
    pocketHold(side) {
        const st = this._pocket[side];
        if (st) { st.armed = false; st.inT = 0; st.outT = 0; st.hold = performance.now() + 700; }
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
        // looking down at the pocket / the pouches (held a moment: a nod passing by, or the camera's jitter, never)
        this.headDown = lookSteady(this._look, !!this.belt.lookingDown(POCKET_LOOK), dt);
        for (const side of ['left', 'right']) {
            const st = this._pocket[side];
            const local = ch.getHandWorldPosition(side, _v).applyMatrix4(_inv);
            const sx = side === 'right' ? 1 : -1;
            st.hist.push({ t: now, y: local.y });
            while (st.hist.length && now - st.hist[0].t > 600) st.hist.shift();
            if (ch.isRunning || ch.flying) { st.hist.length = 0; continue; }
            // the hand put INTO the pocket (as the camera sees it): it stays there a moment
            // (a slap on the hip no longer counts: people did it by accident)
            // (the things' pocket is at the leading hand's hip — the right one, a left-hander's left —
            // and only the OTHER hand reaches into it, across the body: PoseInterpreter.offHip;
            // the leading hand is the wand's and never takes from it or puts into it)
            const pk = g.currentPose.pocket, dom = g.dom || 'right', off = dom === 'right' ? 'left' : 'right';
            let inPocket = side === off ? pk?.off : false;
            // a thing in the other hand brought to the pouches, as a pouch is tied on (the hand is
            // seen holding it, so its fingers never point down into the pocket): it goes into a slot too
            if (side === off && inPocket !== true && g.currentPose.purse?.off === true && this._pocketable(off)) inPocket = true;
            // ...and only looking down at it (as in life — never by chance)
            if (inPocket && !this.headDown) inPocket = false;
            // (the wand is not put away / drawn by a pocket — lowering the arm did it by
            // accident: it has its own place at the waistband, WandBelt.js)
            st.inT = inPocket ? (st.inT || 0) + dt : 0;
            st.outT = inPocket === false || inPocket == null ? (st.outT || 0) + dt : 0;
            if (st.outT > 0.4) st.armed = true; // (taken out again: ready for the next time)
            if (this._cyc?.side === side && st.outT > POCKET_PICK) this._cyc = null; // (the hand went away and did not come back: what it holds is its choice)
            const putIn = st.armed && st.inT > POCKET_DWELL && now >= (st.hold || 0);
            if (putIn && now - st.out > 700) {
                st.armed = false;
                st.out = now;
                st.hist.length = 0;
                this.pocketTouch(side);
                this._handsOff(side);
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
            if (!this.canStore(h.item)) { this.game.hud.toast?.('🎒 Все ячейки заняты — палочка остаётся в руке'); return false; } // (never lost)
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

    /**
     * The hand touched the pocket. The hand holding what it just took out of a slot (a touch again, after it
     * moved away): that thing goes back into ITS slot and the next one comes into the hand — slot after slot,
     * in a circle (the author: touch — the first, move away and touch — the second…; never thrown out).
     * Any other thing in the hand goes into a slot; an empty hand takes the next thing.
     */
    pocketTouch(side) {
        const g = this.game, c = this._cyc;
        if (c && c.side === side) {
            const h = g.items?.held[side];
            if (c.weapon && g.weapons.hands[side].held === c.weapon) {
                this._cyc = null;
                this.inHand = null;
                this.selected = -1;
                this._next = c.slot;
                if (this._storeWeapon(c.weapon, c.slot)) return this.takeNext(side);
                return false;
            }
            if (c.pouch) { // (the pouch from the belt, the last of the circle: back onto the belt, the circle goes on from the start)
                this._cyc = null;
                if (h && h.item === c.item && this.purse.canTie(h.item)) {
                    this._next = this.slots.length;
                    this.purse._tieOn(side);
                    this._render();
                    return this.takeNext(side);
                }
                return g.items?.held[side] || g.weapons.hands[side].held ? this.pocketRight(side) : this.takeNext(side);
            }
            if (h && c.item && h.item === c.item) {
                const it = g.items.releaseHand(side);
                this.slots[c.slot] = it; // (back into its own slot: it fits, it came from there)
                if (this.inHand?.item === it) this.inHand = null;
                this.selected = -1;
                this._cyc = null;
                this._next = c.slot;
                return this.takeNext(side);
            }
            if (!h && c.res && !g.weapons.hands[side].held) { this._cyc = null; return this.takeNext(side); } // (blocks: no thing in the hand)
            this._cyc = null;
        }
        if (g.items?.held[side] || g.weapons.hands[side].held) return this.pocketRight(side);
        return this.takeNext(side);
    }

    /** Is this hand in the middle of going through the slots (its thing is not let go of by any release: no drop, no throw)? */
    pocketCycling(side) {
        return !!this._cyc && this._cyc.side === side;
    }

    /**
     * This hand took a thing out of the pocket just now (ms). The other hand reaching across to the pocket passes the
     * waistband looking down: a wand it just took must not be tucked into the belt on the way back (the author: the
     * second wand was chosen, but it was at the belt, not in the left hand — WandBelt).
     */
    justTook(side, ms = 5000) {
        return performance.now() - (this._tookAt?.[side] || -1e9) < ms;
    }

    /** The things' pocket, an empty hand: the next thing of the slots into it (not the wand, not what goes on the back). */
    takeNext(side = 'right') {
        const n = this.slots.length + 1; // (the last of the circle — the pouch from the belt)
        const start = this._next ?? -1;
        for (let k = 1; k <= n; k++) {
            const i = (start + k) % n;
            if (i === this.slots.length) { // the pouch cell: the best pouch of the belt comes into the hand
                if (!this.purse.any) continue;
                const g = this.game;
                if (g.items?.held[side] || g.weapons.hands[side].held) { this.game.hud.toast?.('🎒 Руки заняты — достать нечем'); return false; }
                this._putBackHand(side);
                this.selected = -1;
                this._next = i;
                this.purse._take(side);
                const got = g.items?.held[side];
                if (!got || got.item.kind !== 'coins') { this._cyc = null; this._render(); return false; }
                this._cyc = { side, pouch: true, item: got.item, slot: -1 };
                (this._tookAt || (this._tookAt = { left: 0, right: 0 }))[side] = performance.now();
                this._render();
                return true;
            }
            const it = this.slots[i];
            if (!it) continue; // (everything in the circle, in order: wands, weapons, shields too — the author: the wand never came)
            this._next = i;
            this.select(i, side);
            const ih = this.inHand;
            if (!ih || ih.side !== side && ih.kind !== 'res') {
                this._cyc = null;
                this.game.hud.toast?.('🎒 Руки заняты — достать нечем'); // (never skipped silently)
                return false;
            }
            this._cyc = { side, slot: i, item: ih.kind === 'item' ? ih.item : null, weapon: ih.kind === 'weapon' ? ih.weapon : null, res: it.kind === 'res' };
            (this._tookAt || (this._tookAt = { left: 0, right: 0 }))[side] = performance.now();
            this._fx(`${it.kind === 'res' ? '🧱' : ITEM_INFO[it.kind]?.icon || '✋'} ${it.kind === 'res' ? RESOURCE[it.block]?.name || 'Блоки' : ITEM_INFO[it.kind]?.name || 'Предмет'}`, side);
            return true;
        }
        this.game.hud.toast?.('🎒 В кармане пусто');
        return false;
    }

    /** What a hand holds, as a thing to draw (a weapon as {kind:'weapon', type}), or null. */
    _handThing(side) {
        const g = this.game;
        const w = g.weapons?.hands?.[side]?.held;
        if (w) return { kind: 'weapon', type: w.type, magic: !!w.magic };
        return g.items?.held?.[side]?.item || null;
    }

    /** What the hands hold, as a short key (to redraw the «hand» cell when it changes). */
    _handKey() {
        const one = (side) => {
            const t = this._handThing(side);
            return t ? (t.kind === 'weapon' ? 'w' + t.type : t.kind + ':' + (t.uid || '')) : '';
        };
        return one('left') + '|' + one('right');
    }

    /**
     * A thing's picture in a cell: its own model drawn small (ItemIcons.js) — or, until that is made, its emoji.
     * `el` — the cell's icon box.
     */
    _pic(el, it, emoji) {
        const url = this.game.itemIcons?.url(it);
        if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = emoji || '';
            img.className = 'hb-pic';
            el.appendChild(img);
            return true;
        }
        el.appendChild(document.createTextNode(emoji || '❔'));
        return false;
    }

    static emojiOf(it) {
        if (!it) return '';
        if (it.kind === 'weapon') return it.type === 'axe' ? '🪓' : '🗡️';
        return ITEM_INFO[it.kind]?.icon || '❔';
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
                if (!this.canStore(t.h.item)) { g.hud.toast?.('🎒 Все ячейки заняты'); return; } // (it stays in the hand)
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

    /**
     * The hand the chosen resource is in: the hand that took it from the pocket, else a free one — never a
     * hand that holds something (the wand, a sword…): the leading one if free, else the other (Accio's
     * rule: accioCatcher). null: both hands busy (the stack stays chosen for building, in no hand).
     */
    resSide() {
        const h = this.inHand, g = this.game;
        if (!h || h.kind !== 'res' || !(h.stack?.count > 0) || !this.slots.includes(h.stack)) return null;
        const free = (sd) => !g.items?.held?.[sd] && !g.weapons?.hands?.[sd]?.held && !g.boards?.handBusy?.(sd);
        return h.side && free(h.side) ? h.side : accioCatcher(free, g.dom || 'right');
    }

    /** A small glowing block of the chosen resource floats in the hand that holds it (resSide). */
    _updateHandBlock() {
        const s = this.inHand && this.inHand.kind === 'res' ? this.inHand.stack : null;
        const side = this.resSide();
        if (!side) { if (this._handBlock) this._handBlock.visible = false; return; }
        if (!this._handBlock) {
            this._handBlock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 }));
            this.game.scene.add(this._handBlock);
        }
        const b = this._handBlock;
        b.visible = true;
        b.material.color.setHex(RESOURCE[s.block]?.color ?? 0xffffff);
        const p = this.game.character.getGripObject(side).getWorldPosition(_v);
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
        // the pouch cell on the right (the hand's cell mirrored): the best pouch, and how many of them
        const pouch = document.createElement('div');
        pouch.className = 'hotbar-slot hand pouch';
        pouch.innerHTML = '<div class="hb-icon"></div><div class="hb-count"></div>';
        pouch.onclick = () => this.pouchClick();
        bar.appendChild(pouch);
        this.pouchCell = pouch;
        this._pouchKey = null;
        this.bar = bar;
        this._render();
    }

    /** The pouch cell: redrawn only when something changed (the coins on hover; no count of pouches: it is one). */
    _renderPouch() {
        const c = this.pouchCell;
        if (!c) return;
        const o = this.pouchInfo(), sel = !!this._cyc?.pouch;
        const key = o.have + '|' + o.coins + '|' + sel;
        if (key === this._pouchKey) return;
        this._pouchKey = key;
        c.classList.toggle('sel', sel);
        c.classList.toggle('empty', !o.have);
        c.querySelector('.hb-icon').innerHTML = pouchIcon();
        c.querySelector('.hb-count').textContent = '';
        c.title = 'Бездонный мешочек, монет: ' + o.coins;
    }

    /** My pouch: have I it (on the belt, in a slot or in a hand), and all the coins. */
    pouchInfo() {
        return { have: this.hasMagicPouch(), coins: this.coins() };
    }

    /** A click on the pouch cell: a pouch in a hand goes back onto the belt, else the best pouch of the belt comes into a free hand. */
    pouchClick() {
        const g = this.game, dom = g.dom || 'right';
        const sides = [dom, dom === 'right' ? 'left' : 'right'];
        const hs = sides.find((sd) => g.items?.held[sd]?.item.kind === 'coins' && this.purse.canTie(g.items.held[sd].item));
        if (hs) { this._cyc = null; this.purse._tieOn(hs); this._render(); return; }
        if (!this.purse.any) { g.hud.toast?.('💰 Мешочков на поясе нет'); return; }
        const free = sides.find((sd) => !g.items?.held[sd] && !g.weapons.hands[sd].held);
        if (!free) { g.hud.toast?.('🎒 Руки заняты — достать нечем'); return; }
        this._putBackHand(free);
        this.selected = -1;
        this._next = this.slots.length;
        this.purse._take(free);
        this._cyc = null;
        this._render();
    }

    /** Have I my pouch (on the belt, in a slot or in a hand)? It is the only one: coins without end. */
    hasMagicPouch() {
        if (this.purse?.magic) return true;
        const mine = (it) => !!it && it.kind === 'coins' && !it.shop; // (one for sale, not paid for: not mine)
        if (this.slots.some(mine)) return true;
        for (const side of ['right', 'left']) if (mine(this.game.items?.held[side]?.item)) return true;
        return false;
    }

    /** The coin counter at the top right of the screen: 🪙 and all my coins. */
    _renderCoins() {
        if (typeof document === 'undefined') return;
        this._renderPouch();
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
        this._renderPouch();
        this.handCell?.classList.toggle('sel', this.selected < 0);
        if (this.handCell) {
            const l = this._handThing('left'), r = this._handThing('right');
            const icon = this.handCell.querySelector('.hb-icon');
            if (icon) {
                icon.textContent = '';
                icon.classList.toggle('two', !!(l && r));
                if (!l && !r) icon.textContent = '✋';
                for (const t of [l, r]) if (t) this._pic(icon, t, Inventory.emojiOf(t));
            }
            this.handCell.title = l || r ? 'В руках: ' + [l, r].filter(Boolean).map((t) => (t.kind === 'weapon' ? (t.type === 'axe' ? 'Топор' : 'Меч') : ITEM_INFO[t.kind]?.name || 'Предмет')).join(', ') : 'Свободная рука';
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
            icon.classList.remove('magic');
            count.textContent = '';
            if (!s) return;
            if (s.kind === 'res') {
                const r = RESOURCE[s.block];
                const col = '#' + (r?.color ?? 0xffffff).toString(16).padStart(6, '0');
                icon.style.background = `linear-gradient(135deg, ${col}, ${col} 60%, rgba(0,0,0,.35))`;
                count.textContent = s.count;
                c.title = r?.name || '';
            } else if (s.kind === 'weapon') {
                this._pic(icon, s, Inventory.emojiOf(s));
                if (s.magic) icon.classList.add('magic');
                c.title = (s.type === 'axe' ? 'Топор' : 'Меч') + (s.magic ? ' (магический)' : '');
            } else if (s.kind === 'armor' || s.kind === 'robe') {
                // a piece of armour / a robe: its own model drawn small; until then its little drawn picture (Armor.js)
                if (!this.game.itemIcons?.url(s)) icon.innerHTML = armorIcon(s.kind === 'robe' ? 'robe' : s.piece, s.named ? 3 : s.magic ? 2 : 1, s.color || 0);
                else this._pic(icon, s, '');
                if (s.magic) icon.classList.add('magic');
                c.title = armorName(s);
            } else {
                // the thing itself, drawn small: a wand of its own wood and shape, a scroll with its ribbon, a potion of its colour…
                this._pic(icon, s, Inventory.emojiOf(s));
                if (s.magic) icon.classList.add('magic');
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
