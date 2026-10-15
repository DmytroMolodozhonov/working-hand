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
 *     pouch grows with its coins. A pouch holds 100 coins: more, and a second pouch hangs
 *     beside it, then a third (300 coins on the belt at most). What does not fit stays in
 *     the pouch in the hand.
 *   - Take one off: look down at it, bring the open left hand to it and close the
 *     fingers — the fullest pouch comes into the hand (to give, to pay, to throw).
 * A hanging, lowered or swinging arm never does it (its elbow is straight: PoseInterpreter.offHip).
 *
 * The coins on the belt are the player's (Inventory.coins(): paying at the market, the
 * save, death — they drop as pouches); other players see the pouches.
 */

import * as THREE from 'three';
import { makeItemModel, disposeModel, newUid } from './ItemTypes.js';

/** Coins one pouch holds; pouches on the belt. */
export const POUCH_MAX = 100;
export const POUCHES = 3;
export const BELT_MAX = POUCH_MAX * POUCHES;
const TIE_S = 0.35; // s the hand is kept at the side to tie the pouch on
const OPEN_S = 0.12; // s at the side before opening the fingers ties it on at once
const AWAY_S = 0.25; // s the camera may lose the hand at the side (a real camera's points jump)

/** The pouches for `n` coins on the belt: [100, 100, 37]. */
export function purseBags(n) {
    n = Math.max(0, Math.min(BELT_MAX, Math.floor(n || 0)));
    const out = [];
    while (n > 0) { out.push(Math.min(POUCH_MAX, n)); n -= POUCH_MAX; }
    return out;
}

/** Put `n` coins onto the belt that has `have`: { have, rest } (rest — what did not fit). */
export function purseAdd(have, n) {
    const k = Math.max(0, Math.min(n, BELT_MAX - have));
    return { have: have + k, rest: n - k };
}

/** How big a pouch of `c` coins is (×, to the plain pouch): a few coins — small, 100 — big. */
export function pouchSize(c) {
    return 0.35 + 0.4 * Math.sqrt(Math.max(0, Math.min(POUCH_MAX, c)) / POUCH_MAX);
}

/** Where the pouches hang (the hero's space: +X its right, −Z ahead; the belt at y≈0). */
export const PURSE_AT = [new THREE.Vector3(0.6, 0.02, -0.14), new THREE.Vector3(0.6, 0.02, 0.1), new THREE.Vector3(0.56, 0.02, 0.33)];

/** The pouches of `n` coins as one model, hung on a body's group (the hero's own, or another player's); a left-hander's on the left hip. */
export function makePurseModel(n, leftHanded = false) {
    const g = new THREE.Group();
    g.name = 'coin-belt';
    purseBags(n).forEach((c, i) => {
        const m = makeItemModel({ kind: 'coins', count: c });
        const s = pouchSize(c);
        m.scale.multiplyScalar(s);
        // tied by its neck to the belt: the neck at the belt, the pouch below it
        m.position.copy(PURSE_AT[i]).y -= 0.14 * 1.8 * s;
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
        this.model = null;
        this._shown = -1;
        this._tie = 0;
        this._away = 1;
        this._side = null;
        this._open = false;
        this._left = true;
        this._at = 0;
        this.log = []; // (what it did: tests)
    }

    /** Add coins straight onto the belt (picked up with both hands busy, «Gather»): what did not fit. */
    add(n) {
        const r = purseAdd(this.count, n);
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
        if (h && h.item.kind === 'coins') {
            // tied on: kept at the hip a moment, or the fingers opened there (letting go of it onto the belt)
            this._tie += dt;
            if (this._tie > TIE_S || (this._tie > OPEN_S && curl < 0.35)) { this._tie = 0; this._tieOn(side); }
            return;
        }
        this._tie = 0;
        // taking one (looking down at it: above): the empty hand came open and closes on it
        if (curl < 0.4) this._open = true;
        const free = !h && !g.weapons?.hands?.[side]?.held;
        if (free && this.count > 0 && this._open && curl > 0.45) this._take(side);
    }

    _tieOn(side) {
        const g = this.game, inv = g.inventory;
        const h = g.items.held[side];
        if (!h) return;
        this._left = false;
        this._at = performance.now();
        const n = h.item.count || 0;
        if (this.count >= BELT_MAX) { this.log.push('full:' + side); g.hud.toast?.(`💰 На поясе уже ${POUCHES} полных мешочка (${BELT_MAX} монет)`, 1800); return; }
        const first = this.count === 0;
        const rest = this.add(n);
        h.item.count = rest;
        this.log.push('tie:' + side);
        if (rest <= 0) {
            const it = g.items.releaseHand(side);
            if (inv?.inHand?.item === it) inv.inHand = null;
        }
        inv?._render?.();
        g.sound?.playCoins?.();
        const what = first ? '💰 Мешочек привязан к поясу' : `💰 +${n - rest} монет в мешочки на поясе`;
        inv?._fx?.(rest > 0 ? `${what} — ${rest} не влезли, остались в руке` : what, side);
    }

    _take(side) {
        const g = this.game, inv = g.inventory;
        // the fullest pouch (not the last small one: 101 coins on the belt gave a pouch of ONE coin —
        // put on a counter, it paid for nothing, and the coins seemed to be just gone)
        const c = purseBags(this.count)[0];
        if (!c || !g.items.takeIntoHand({ kind: 'coins', uid: newUid(), count: c }, side)) { this.log.push('take-failed:' + side); return; }
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
        if (this.count !== this._shown || lefty !== this._lefty) {
            this._shown = this.count;
            this._lefty = lefty;
            this._drop();
            if (this.count > 0) { this.model = makePurseModel(this.count, lefty); ch.group.add(this.model); }
            this.resend();
        }
        if (this.model) this.model.visible = !!ch.group.visible;
    }

    /** Tell the other players what hangs on my belt (also when somebody joins). */
    resend() {
        this.game.sync?.itemHold?.('purse', this.count > 0 ? { kind: 'purse', count: this.count, left: this.game.dom === 'left' } : null); // (left: a left-hander's, on the left hip)
    }

    _drop() {
        if (!this.model) return;
        this.model.parent?.remove(this.model);
        disposeModel(this.model);
        this.model = null;
    }

    dispose() { this._drop(); }
}
