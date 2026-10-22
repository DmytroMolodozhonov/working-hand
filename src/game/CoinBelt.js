/**
 * CoinBelt.js — the coin pouches' place on the body: tied to the belt on the right side,
 * beside the hip (the wand's place is in front, on the left: WandBelt.js). Seen on the hero.
 * A left-hander (Настройки: Левша): all mirrored — on the left hip, the right hand.
 *
 * The pouches are the OTHER hand's, as the things' pocket (the author: a right-hander's LEFT hand
 * reaches across to them; the right hand is the wand's and never takes or ties one there), and
 * only looking down at them (Inventory.headDown: as in life, never by chance).
 *   - Tie a pouch on: the left hand holding a coin pouch is brought across to the right side
 *     of the belt, beside the hip, and kept there a moment — or its fingers opened there; the
 *     coins jingle. The first pouch is tied there; the next ones are emptied into it — the
 *     pouch grows with its coins. A pouch holds 500 coins: more, and a second pouch hangs
 *     beside it, then a third (1500 coins on the belt at most). What does not fit stays in
 *     the pouch in the hand.
 *   - Take one off: look down at it, bring the open left hand to it and close the
 *     fingers — the fullest pouch comes into the hand (to give, to pay, to throw).
 * A hanging, lowered or swinging arm never does it (its elbow is straight: PoseInterpreter.offHip).
 *
 * The coins on the belt are the player's (Inventory.coins(): paying at the market, the
 * save, death — they drop as pouches); other players see the pouches.
 *
 * The magic pouch (red velvet, a golden ribbon: {kind:'coins', magic:true} — «с незримым
 * расширением»): the same pouch to hold, tie on, take off, give, pay with, throw — but it holds
 * coins without end, and outside it stays small (pouchSize: it grows a little and stops). Tied on,
 * it is the only pouch on the belt: the plain ones tied on after it are emptied into it (and the
 * coins already on the belt go into it when it is tied on), and the belt's limit is gone.
 * Taken off, it comes into the hand whole, with all the coins; at death it drops so, whole.
 */

import * as THREE from 'three';
import { makeItemModel, disposeModel, newUid } from './ItemTypes.js';
import { POUCH_NECK_Y, tickPouchMagic } from './PouchModel.js';
import { CappedLog } from '../core/CappedLog.js';

/** Coins one pouch holds; pouches on the belt. */
export const POUCH_MAX = 500; // (the author: «обычный мешочек — 500 монет», was 100)
export const POUCHES = 3;
export const BELT_MAX = POUCH_MAX * POUCHES;
const TIE_S = 0.35; // s the hand is kept at the side to tie the pouch on
const OPEN_S = 0.12; // s at the side before opening the fingers ties it on at once
const AWAY_S = 0.25; // s the camera may lose the hand at the side (a real camera's points jump)

/** The magic pouch's price at the wizards' master of potions (coins: CastleTalk WIZARD_RARE). */
export const MAGIC_POUCH_PRICE = 750;

/** A new magic pouch (empty, or with `count` coins). */
export const makeMagicPouch = (uid, count = 0) => ({ kind: 'coins', uid, count, magic: true });

/** The pouches for `n` coins on the belt: [500, 500, 37]; the magic pouch — itself, all in it: [n]. */
export function purseBags(n, magic = false) {
    if (magic) return [Math.max(0, Math.floor(n || 0))];
    n = Math.max(0, Math.min(BELT_MAX, Math.floor(n || 0)));
    const out = [];
    while (n > 0) { out.push(Math.min(POUCH_MAX, n)); n -= POUCH_MAX; }
    return out;
}

/** Put `n` coins onto the belt that has `have`: { have, rest } (rest — what did not fit; into the magic pouch — all). */
export function purseAdd(have, n, magic = false) {
    const k = Math.max(0, magic ? n : Math.min(n, BELT_MAX - have));
    return { have: have + k, rest: n - k };
}

/**
 * How big a pouch of `c` coins is (×, to the plain pouch): a few coins — small, 100 — big. The
 * magic one grows a little and stops at a neat middle size, however many go in (its unseen room).
 */
export function pouchSize(c, magic = false) {
    if (magic) return 0.5 + 0.12 * (1 - Math.exp(-Math.max(0, c || 0) / 120));
    return 0.35 + 0.4 * Math.sqrt(Math.max(0, Math.min(POUCH_MAX, c)) / POUCH_MAX);
}

/** Where the pouches hang (the hero's space: +X its right, −Z ahead; the belt at y≈0). */
export const PURSE_AT = [new THREE.Vector3(0.6, 0.02, -0.14), new THREE.Vector3(0.6, 0.02, 0.1), new THREE.Vector3(0.56, 0.02, 0.33)];

/** The pouches of `n` coins as one model, hung on a body's group (the hero's own, or another player's); a left-hander's on the left hip; magic — the one magic pouch. */
export function makePurseModel(n, leftHanded = false, magic = false) {
    const g = new THREE.Group();
    g.name = 'coin-belt';
    purseBags(n, magic).forEach((c, i) => {
        const m = makeItemModel({ kind: 'coins', count: c, magic: magic || undefined });
        const s = pouchSize(c, magic);
        m.scale.multiplyScalar(s);
        // tied by its neck to the belt: the neck (the cord, the ribbon) at the belt, the pouch below it
        m.position.copy(PURSE_AT[i]).y -= POUCH_NECK_Y * 1.8 * s;
        m.rotation.y = -0.4 + i * 0.5;
        if (leftHanded) { m.position.x = -m.position.x; m.rotation.y = -m.rotation.y; } // (mirrored: the left hip)
        m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        g.add(m);
    });
    return g;
}

export class CoinBelt {
    constructor(game) {
        this.game = game;
        this.count = 0; // the coins on the belt
        this.magic = false; // the magic pouch is tied on (all the coins in it, no limit)
        this.magicUid = null; // (its own uid: the same thing taken off again)
        this.model = null;
        this._shown = -1;
        this._tie = 0;
        this._away = 1;
        this._side = null;
        this._open = false;
        this._left = true;
        this._at = 0;
        this.log = new CappedLog(); // (what it did: tests)
    }

    /** Add coins straight onto the belt (picked up with both hands busy, «Gather»): what did not fit. */
    add(n) {
        const r = purseAdd(this.count, n, this.magic);
        this.count = r.have;
        return r.rest;
    }

    /** Take up to `n` coins off the belt (paying): how many were taken. */
    spend(n) {
        const k = Math.max(0, Math.min(n, this.count));
        this.count -= k;
        return k;
    }

    update(dt) {
        const g = this.game, ch = g.character, items = g.items;
        if (!ch || !items) return;
        tickPouchMagic(performance.now() / 1000); // (the magic pouches shimmer: shared materials, once a frame)
        this._show();
        const pose = g.currentPose;
        if (!pose || g.combat?.immobile || g.combat?.dead || ch.flying) return;
        if (ch.isRunning) { this._away = 1; this._left = true; this._tie = 0; return; } // (arms swinging: never)
        // the pouches hang at the leading hand's hip (the right one for a right-hander, the left for a
        // left-hander), and only the OTHER hand reaches them, across the body, looking down at them
        const dom = g.dom || 'right', off = dom === 'right' ? 'left' : 'right';
        const side = pose.purse?.off === true && g.inventory?.headDown ? off : null;
        if (side) { this._away = 0; this._side = side; } else this._away += dt;
        if (this._away > AWAY_S) { this._left = true; this._open = false; this._tie = 0; return; }
        if (!side) return; // (lost for a moment: wait)
        // (after tying one on or taking one, the hand must leave the side first)
        if (!this._left || performance.now() - this._at < 700) return;
        const h = items.held[side];
        const curl = ch.getGripCurl ? ch.getGripCurl(side) : 1;
        if (h && h.item.kind === 'coins' && !h.item.shop) { // (a pouch for sale, not paid for: not tied on)
            // tied on: kept at the hip a moment, or the fingers opened there (letting go of it onto the belt)
            this._tie += dt;
            if (this._tie > TIE_S || (this._tie > OPEN_S && curl < 0.35)) { this._tie = 0; this._tieOn(side); }
            return;
        }
        this._tie = 0;
        // taking one (looking down at it: above): the empty hand came open and closes on it
        if (curl < 0.4) this._open = true;
        const free = !h && !g.weapons?.hands?.[side]?.held;
        if (free && (this.count > 0 || this.magic) && this._open && curl > 0.45) this._take(side);
    }

    /** Something on the belt to see / to take (coins, or the magic pouch, even empty). */
    get any() { return this.count > 0 || this.magic; }

    /** Can this pouch in the hand be tied on / emptied into the belt now? */
    canTie(item) {
        if (!item || item.kind !== 'coins' || item.shop) return false; // (a magic pouch not paid for yet: a good, not mine)
        if (item.magic) return !this.magic || (item.count || 0) > 0; // (a second magic pouch: its coins only)
        return this.magic || this.count < BELT_MAX;
    }

    /**
     * The magic pouch tied on (from the hand, or picked up with both hands busy): the coins already
     * on the belt go into it, the plain pouches are gone (emptied into it). True — it is on the belt.
     */
    tieMagic(item) {
        if (!item?.magic || this.magic) return false;
        this.magic = true;
        this.magicUid = item.uid || newUid();
        this.count += Math.max(0, item.count || 0);
        item.count = 0;
        return true;
    }

    /** Everything on the belt taken off (death: they drop as they were) — the pouches' items. */
    takeAll() {
        const out = this.magic ? [makeMagicPouch(this.magicUid || newUid(), this.count)] : purseBags(this.count).map((c) => ({ kind: 'coins', uid: newUid(), count: c }));
        this.count = 0;
        this.magic = false;
        this.magicUid = null;
        return out;
    }

    _tieOn(side) {
        const g = this.game, inv = g.inventory;
        const h = g.items.held[side];
        if (!h) return;
        inv?.pocketHold?.(side); // (the hand, empty now, still at the hip: it takes nothing out of the pocket — Inventory._handsOff)
        this._left = false;
        this._at = performance.now();
        const n = h.item.count || 0;
        // the magic pouch tied on: the belt's coins go into it (the plain pouches are emptied into it)
        if (h.item.magic && !this.magic) {
            const had = this.count;
            this.tieMagic(h.item);
            this.log.push('tie-magic:' + side);
            const it = g.items.releaseHand(side);
            if (inv?.inHand?.item === it) inv.inHand = null;
            inv?._render?.();
            g.sound?.playCoins?.();
            inv?._fx?.(had > 0 ? `✨ Магический мешочек на поясе: в нём ${this.count} монет (${had} пересыпаны из мешочков)` : `✨ Магический мешочек привязан к поясу (${this.count} монет)`, side);
            return;
        }
        if (h.item.magic && n <= 0) { this.log.push('full:' + side); g.hud.toast?.('✨ На поясе уже есть магический мешочек — в него влезает сколько угодно', 1800); return; }
        if (!this.magic && this.count >= BELT_MAX) { this.log.push('full:' + side); g.hud.toast?.(`💰 На поясе уже ${POUCHES} полных мешочка (${BELT_MAX} монет)`, 1800); return; }
        const first = this.count === 0 && !this.magic;
        const rest = this.add(n);
        h.item.count = rest;
        this.log.push('tie:' + side);
        if (rest <= 0 && !h.item.magic) { // (a second magic pouch, emptied, stays in the hand: it is a thing of its own)
            const it = g.items.releaseHand(side);
            if (inv?.inHand?.item === it) inv.inHand = null;
        }
        inv?._render?.();
        g.sound?.playCoins?.();
        const what = first ? '💰 Мешочек привязан к поясу' : this.magic ? `✨ +${n - rest} монет в магический мешочек (в нём ${this.count})` : `💰 +${n - rest} монет в мешочки на поясе`;
        inv?._fx?.(rest > 0 ? `${what} — ${rest} не влезли, остались в руке` : what, side);
    }

    _take(side) {
        const g = this.game, inv = g.inventory;
        // the magic pouch: it comes into the hand whole, with all the coins
        if (this.magic) {
            const it = makeMagicPouch(this.magicUid || newUid(), this.count);
            if (!g.items.takeIntoHand(it, side)) { this.log.push('take-failed:' + side); return; }
            inv?.pocketHold?.(side);
            this.count = 0; this.magic = false; this.magicUid = null;
            this.log.push('take-magic:' + side);
            this._open = false; this._left = false; this._at = performance.now();
            inv?._render?.();
            inv?._fx?.(`✨ Магический мешочек в руке: ${it.count} монет`, side);
            return;
        }
        // the fullest pouch (not the last small one: 101 coins on the belt gave a pouch of ONE coin —
        // put on a counter, it paid for nothing, and the coins seemed to be just gone)
        const c = purseBags(this.count)[0];
        if (!c || !g.items.takeIntoHand({ kind: 'coins', uid: newUid(), count: c }, side)) { this.log.push('take-failed:' + side); return; }
        inv?.pocketHold?.(side); // (the pouch in the hand at the hip never goes straight into the pocket)
        this.count -= c;
        this.log.push('take:' + side);
        this._open = false;
        this._left = false;
        this._at = performance.now();
        inv?._render?.();
        inv?._fx?.(`💰 Мешочек в руке: ${c} монет`, side);
    }

    /** The pouches seen on the hero (and told to the other players when they change). */
    _show() {
        const ch = this.game.character;
        const lefty = this.game.dom === 'left';
        // (the magic pouch grows so little that a new model only when its look changes: not per coin)
        const look = this.magic ? 'm' + pouchSize(this.count, true).toFixed(2) : this.count;
        if (look !== this._shown || lefty !== this._lefty) {
            this._shown = look;
            this._lefty = lefty;
            this._drop();
            if (this.any) { this.model = makePurseModel(this.count, lefty, this.magic); ch.group.add(this.model); }
            this.resend();
        }
        if (this.model) this.model.visible = !!ch.group.visible;
    }

    /** Tell the other players what hangs on my belt (also when somebody joins). */
    resend() {
        this.game.sync?.itemHold?.('purse', this.any ? { kind: 'purse', count: this.count, left: this.game.dom === 'left', magic: this.magic || undefined } : null); // (left: a left-hander's, on the left hip; magic: the magic pouch)
    }

    _drop() {
        if (!this.model) return;
        this.model.parent?.remove(this.model);
        disposeModel(this.model);
        this.model = null;
    }

    dispose() { this._drop(); }
}
