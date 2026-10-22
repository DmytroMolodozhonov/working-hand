/**
 * CoinBelt.js — the hero's one coin pouch: tied to the belt on the right side, beside the hip
 * (the wand's place is in front, on the left: WandBelt.js). Seen on the hero.
 * A left-hander (Настройки: Левша): all mirrored — on the left hip, the right hand.
 *
 * There is ONE kind of pouch in the game: red velvet with a golden ribbon, bottomless («с незримым
 * расширением»; the author: «Все мешочки будут магическими, с безграничным количеством монет»).
 * Every hero has it from the very start (a new game, after death, joining a server), it costs
 * nothing, is not sold and is not found in chests. Any other pouch picked up (a chest's coins,
 * change, a dragon's hoard, a body's) pours its coins into mine and is gone: a hero has one pouch.
 *
 * The pouch is the OTHER hand's, as the things' pocket (the author: a right-hander's LEFT hand
 * reaches across to it; the right hand is the wand's and never takes or ties one there), and
 * only looking down at it (Inventory.headDown: as in life, never by chance).
 *   - Tie it back on: the left hand holding the pouch is brought across to the right side
 *     of the belt, beside the hip, and kept there a moment — or its fingers opened there; the
 *     coins jingle.
 *   - Take it off: look down at it, bring the open left hand to it and close the
 *     fingers — it comes into the hand whole, with all the coins (to give, to pay, to throw).
 * A hanging, lowered or swinging arm never does it (its elbow is straight: PoseInterpreter.offHip).
 *
 * The coins in it are the player's (Inventory.coins(): paying at the market, the save); at death
 * it drops whole, with all the coins, and the reborn hero gets a new empty one. Other players see it.
 * Outside it stays small (pouchSize: it grows a little and stops).
 */

import * as THREE from 'three';
import { makeItemModel, disposeModel, newUid } from './ItemTypes.js';
import { POUCH_NECK_Y, tickPouchMagic } from './PouchModel.js';
import { CappedLog } from '../core/CappedLog.js';

const TIE_S = 0.35; // s the hand is kept at the side to tie the pouch on
const OPEN_S = 0.12; // s at the side before opening the fingers ties it on at once
const AWAY_S = 0.25; // s the camera may lose the hand at the side (a real camera's points jump)

/** A new pouch (empty, or with `count` coins): the only kind there is. */
export const makeMagicPouch = (uid, count = 0) => ({ kind: 'coins', uid, count, magic: true });

/** The pouch for `n` coins on the belt: always one, all the coins in it. */
export function purseBags(n) {
    return [Math.max(0, Math.floor(n || 0))];
}

/** Put `n` coins into the pouch that has `have` (it has no end; a pouch off the belt takes nothing: rest — all). */
export function purseAdd(have, n, tied = true) {
    const k = tied ? Math.max(0, n) : 0;
    return { have: have + k, rest: n - k };
}

/** How big the pouch of `c` coins is (×): it grows a little and stops at a neat middle size, however many go in (its unseen room). */
export function pouchSize(c) {
    return 0.5 + 0.12 * (1 - Math.exp(-Math.max(0, c || 0) / 120));
}

/** Where the pouch hangs (the hero's space: +X its right, −Z ahead; the belt at y≈0). */
export const PURSE_AT = [new THREE.Vector3(0.6, 0.02, -0.14)];

/** The pouch of `n` coins as one model, hung on a body's group (the hero's own, or another player's); a left-hander's on the left hip. */
export function makePurseModel(n, leftHanded = false) {
    const g = new THREE.Group();
    g.name = 'coin-belt';
    const m = makeItemModel({ kind: 'coins', count: n, magic: true });
    const s = pouchSize(n);
    m.scale.multiplyScalar(s);
    // tied by its neck to the belt: the neck (the ribbon) at the belt, the pouch below it
    m.position.copy(PURSE_AT[0]).y -= POUCH_NECK_Y * 1.8 * s;
    m.rotation.y = -0.4;
    if (leftHanded) { m.position.x = -m.position.x; m.rotation.y = -m.rotation.y; } // (mirrored: the left hip)
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    g.add(m);
    return g;
}

export class CoinBelt {
    constructor(game) {
        this.game = game;
        this.count = 0; // the coins in the pouch on the belt
        this.magic = true; // the pouch is tied on (every hero has it from the start; false — it is in a hand / a slot / lost)
        this.magicUid = newUid(); // (its own uid: the same thing taken off again)
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

    /**
     * Every hero has the pouch: if there is none on the belt, in a slot or in a hand, a new empty one
     * is tied on (a new game, after death, a save without it). True — one was given.
     */
    ensure() {
        if (this.magic || this.game.inventory?.hasMagicPouch?.()) return false;
        return this.tieMagic(makeMagicPouch(newUid()));
    }

    /** Add coins straight into the pouch on the belt (no end to it): what did not fit — all, if the pouch is not on the belt. */
    add(n) {
        const r = purseAdd(this.count, n, this.magic);
        this.count = r.have;
        return r.rest;
    }

    /** Take up to `n` coins out of the pouch on the belt (paying): how many were taken. */
    spend(n) {
        const k = Math.max(0, Math.min(n, this.count));
        this.count -= k;
        return k;
    }

    update(dt) {
        const g = this.game, ch = g.character, items = g.items;
        if (!ch || !items) return;
        tickPouchMagic(performance.now() / 1000); // (the pouch shimmers: shared materials, once a frame)
        this._show();
        const pose = g.currentPose;
        if (!pose || g.combat?.immobile || g.combat?.dead || ch.flying) return;
        if (ch.isRunning) { this._away = 1; this._left = true; this._tie = 0; return; } // (arms swinging: never)
        // the pouch hangs at the leading hand's hip (the right one for a right-hander, the left for a
        // left-hander), and only the OTHER hand reaches it, across the body, looking down at it
        const dom = g.dom || 'right', off = dom === 'right' ? 'left' : 'right';
        const side = pose.purse?.off === true && g.inventory?.headDown ? off : null;
        if (side) { this._away = 0; this._side = side; } else this._away += dt;
        if (this._away > AWAY_S) { this._left = true; this._open = false; this._tie = 0; return; }
        if (!side) return; // (lost for a moment: wait)
        // (after tying it on or taking it, the hand must leave the side first)
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
        // taking it (looking down at it: above): the empty hand came open and closes on it
        if (curl < 0.4) this._open = true;
        const free = !h && !g.weapons?.hands?.[side]?.held;
        if (free && this.magic && this._open && curl > 0.45) this._take(side);
    }

    /** Something on the belt to see / to take (the pouch, even empty). */
    get any() { return this.magic; }

    /** Can this pouch in the hand be tied on / emptied into the belt now? */
    canTie(item) {
        if (!item || item.kind !== 'coins' || item.shop) return false; // (a pouch not paid for yet: a good, not mine)
        return !this.magic || (item.count || 0) > 0; // (a second one: its coins only)
    }

    /**
     * The pouch tied on (from the hand, or picked up with both hands busy): its coins are in the belt's
     * pouch. True — it is on the belt now.
     */
    tieMagic(item) {
        if (!item || item.kind !== 'coins' || this.magic) return false;
        this.magic = true;
        this.magicUid = item.uid || newUid();
        this.count += Math.max(0, item.count || 0);
        item.count = 0;
        return true;
    }

    /** The pouch on the belt taken off whole, with all its coins (death: it drops so) — the items. */
    takeAll() {
        const out = this.magic ? [makeMagicPouch(this.magicUid || newUid(), this.count)] : [];
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
        const release = () => {
            const it = g.items.releaseHand(side);
            if (inv?.inHand?.item === it) inv.inHand = null;
            inv?._render?.();
            g.sound?.playCoins?.();
        };
        // my pouch tied back on: its coins are the belt's
        if (!this.magic) {
            this.tieMagic(h.item);
            this.log.push('tie-magic:' + side);
            release();
            inv?._fx?.(`✨ Мешочек привязан к поясу (${this.count} монет)`, side);
            return;
        }
        if (n <= 0) { this.log.push('full:' + side); g.hud.toast?.('✨ На поясе уже есть мешочек — он у вас один', 1800); return; }
        // a second pouch: its coins go into mine, it is gone
        this.add(n);
        h.item.count = 0;
        this.log.push('tie:' + side);
        release();
        inv?._fx?.(`✨ +${n} монет в мешочек (в нём ${this.count})`, side);
    }

    _take(side) {
        const g = this.game, inv = g.inventory;
        // the pouch comes into the hand whole, with all the coins
        const it = makeMagicPouch(this.magicUid || newUid(), this.count);
        if (!g.items.takeIntoHand(it, side)) { this.log.push('take-failed:' + side); return; }
        inv?.pocketHold?.(side);
        this.count = 0; this.magic = false; this.magicUid = null;
        this.log.push('take-magic:' + side);
        this._open = false; this._left = false; this._at = performance.now();
        inv?._render?.();
        inv?._fx?.(`✨ Мешочек в руке: ${it.count} монет`, side);
    }

    /** The pouch seen on the hero (and told to the other players when it changes). */
    _show() {
        const ch = this.game.character;
        const lefty = this.game.dom === 'left';
        // (it grows so little that a new model only when its look changes: not per coin)
        const look = this.magic ? 'm' + pouchSize(this.count).toFixed(2) : 'none';
        if (look !== this._shown || lefty !== this._lefty) {
            this._shown = look;
            this._lefty = lefty;
            this._drop();
            if (this.any) { this.model = makePurseModel(this.count, lefty); ch.group.add(this.model); }
            this.resend();
        }
        if (this.model) this.model.visible = !!ch.group.visible;
    }

    /** Tell the other players what hangs on my belt (also when somebody joins). */
    resend() {
        this.game.sync?.itemHold?.('purse', this.any ? { kind: 'purse', count: this.count, left: this.game.dom === 'left', magic: true } : null); // (left: a left-hander's, on the left hip)
    }

    _drop() {
        if (!this.model) return;
        this.model.parent?.remove(this.model);
        disposeModel(this.model);
        this.model = null;
    }

    dispose() { this._drop(); }
}
