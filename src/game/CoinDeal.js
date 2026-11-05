/**
 * CoinDeal.js — coins come out of the pouch only when you buy or sell (the author: «монеты можно было
 * достать из инвентаря только в момент покупки или продажи»).
 *
 * A deal is on when a merchant / seller / buyer (the pawnshop, the shady buyer) stands near, awake,
 * alive, not an enemy, not frightened, and his market is open (at night: only while a deal is held
 * open — NightLife.dealHeld), or a pouch of mine lies on a counter. Then the pouch comes off the belt
 * as always (CoinBelt._take) and pays by hand. When the deal is over (he went off, night, he was
 * killed / scared / fell asleep, I walked away) the pouch left in a hand — and the one left on a
 * counter — goes back into the belt after a short grace (GRACE_S): no coin hangs in a hand or lies
 * about. Creative: as before (coins are not needed there). Coins picked up from the world pour into
 * the belt as always (Items.pickUp); dying drops the pouch whole (CoinBelt.takeAll) — both unchanged.
 * Old saves: coins lying in a slot are poured into the belt once.
 *
 * What the player is told (rarely): HINT.
 */

export const DEAL = {
    NEAR: 9, // m: a merchant this close to me (the counter is 5×2 m, the buyer stands ~3 m before it) is a deal
    GRACE_S: 2, // s after the deal ended before a pouch in a hand goes back to the belt
    LOOK_S: 0.2, // s between looks at the people (not every frame)
    SWEEP_S: 1, // s between looks at the counters for left pouches
    HINT_S: 6, // s: the hint is not shown more often
    COACH_NEAR: 6, // m: the “you can pay now” hint only when I stand at the counter, not just walking by
    COACH_AFTER_S: 1.5, // s at the counter before it
    COACH_GAP_S: 150, // s between two such hints
    COACH_MAX: 3, // times in all; once the player has taken the pouch out in a deal twice he knows how
};

export const HINT = 'Монеты достаются только когда вы покупаете или продаёте';
export const COACH = 'Хотите заплатить? Достаньте мешочек с монетами с пояса: монеты достаются только пока вы покупаете или продаёте';

/** Can this person deal now (pure: tests)? v: {dead, foe, sleep, fleeT, x, y, z}; me: {x, z}. */
export function dealer(v, me, near = DEAL.NEAR) {
    if (!v || v.dead || v.foe || v.sleep || v.fleeT > 0) return false;
    const dx = v.x - me.x, dz = v.z - me.z;
    return dx * dx + dz * dz <= near * near;
}

export class CoinDeal {
    constructor(game) {
        this.game = game;
        this._open = false;
        this._look = 0;
        this._sweep = 0;
        this._shut = 0; // s since the deal ended
        this._hintAt = -1e9;
        this._moved = false;
        this._near = 1e9; // m² to the nearest dealer
        this._at = 0; // s at a counter in this deal
        this._coachAt = -1e9;
        this._coached = 0;
        this._learned = 0; // times the pouch was taken out in a deal
        this.mine = new Set(); // uids of the pouches that were in my hands (a counter pouch of another player is not swept)
        this.log = [];
    }

    /** Is the pouch allowed out of the belt now? */
    mayTake() {
        const g = this.game;
        if (g.config?.mode === 'creative') return true;
        if (g.isDeadLocal) return false;
        if (this._look <= 0) this._refresh(); // (asked before the first look: look now)
        return this._open;
    }

    /** The hint «only when you buy or sell» (not more often than every HINT_S, only when the player really tried). */
    hint() {
        const now = performance.now();
        if (now - this._hintAt < DEAL.HINT_S * 1000) return;
        this._hintAt = now;
        this.game.hud?.toast?.('💰 ' + HINT, 2200);
    }

    _refresh() {
        const g = this.game, life = g.castleLife, me = g.character?.group?.position;
        this._look = DEAL.LOOK_S;
        let open = false;
        this._near = 1e9;
        if (life && me) {
            const talk = life.talk, night = life.night;
            for (const v of life.byId.values()) {
                const steward = v.steward && v.arena?.kind === 'steward'; // (the arena's steward takes the duel's stake by hand: ArenaDuels._payStep)
                if (!dealer(v, me) || !(talk?._trader?.(v) || (steward && !g.isNight))) continue;
                if (!steward && night?.closed?.() && !(v.entry?.stall != null && night.dealHeld(v.cs, v.entry.stall))) continue; // (the market is shut; only a deal already held open goes on)
                open = true;
                const dx = v.x - me.x, dz = v.z - me.z;
                this._near = Math.min(this._near, dx * dx + dz * dz);
            }
            if (!open && me && this._counterPouches(true)) open = true; // (my pouch lies on a counter: the deal is not over)
        }
        if (open !== this._open) { this._open = open; g.inventory?._renderPouch?.(); } // (the pouch cell shows whether it opens now)
    }

    /** The pouch was taken out in a deal: the player knows how (the hint below is told less and less). */
    noteTaken() { this._learned++; }

    /** Now and then, at a counter: «to pay, take the pouch off the belt» (not when it is in a hand, empty, or learned). */
    _coach(dt) {
        const g = this.game, inv = g.inventory;
        if (g.config?.mode === 'creative' || this._near > DEAL.COACH_NEAR * DEAL.COACH_NEAR) { this._at = 0; return; }
        this._at += dt;
        if (this._at < DEAL.COACH_AFTER_S || this._coached >= DEAL.COACH_MAX || this._learned >= 2) return;
        const now = performance.now();
        if (now - this._coachAt < DEAL.COACH_GAP_S * 1000) return;
        if (!inv.purse.magic || inv.purse.count <= 0 || g.combat?.dead || g.combat?.immobile) return; // (pouch not on the belt / no coins / busy)
        this._coachAt = now; this._coached++;
        g.hud?.toast?.('💰 ' + COACH, 4500);
    }

    /** Pouches lying still on a counter of an awake market (`any`: is there one; else: all of them). */
    _counterPouches(any) {
        const g = this.game, life = g.castleLife, out = any ? null : [];
        const me = g.character.group.position;
        for (const cs of life.castles.values()) {
            if (!cs.awake || !cs.def.stalls) continue;
            for (let i = 0; i < cs.def.stalls.length; i++) {
                const st = cs.def.stalls[i];
                if (!st?.counter) continue;
                const c = st.counter, dx = Math.max(c.x0 - me.x, 0, me.x - c.x1), dz = Math.max(c.z0 - me.z, 0, me.z - c.z1);
                if (dx * dx + dz * dz > DEAL.NEAR * DEAL.NEAR) continue; // (only a counter I stand at: the deal is mine)
                const list = life.talk._counterCoins(cs.def, i);
                if (list.length) { if (any) return true; out.push(...list); }
            }
        }
        return any ? false : out;
    }

    /** Old saves: coins lying in a slot go into the belt (the cell is the pouch's, no other place for coins). */
    migrate() {
        const inv = this.game.inventory;
        if (!inv?.slots || !inv.purse) return;
        let moved = false;
        for (let i = 0; i < inv.slots.length; i++) {
            const s = inv.slots[i];
            if (s && s.kind === 'coins' && !s.shop) {
                if (inv.purse.magic) inv.purse.add(s.count || 0);
                else { inv.purse.tieMagic(s); }
                inv.slots[i] = null;
                moved = true;
            }
        }
        if (moved) inv._render?.();
    }

    update(dt) {
        const g = this.game, inv = g.inventory, items = g.items;
        if (!inv || !items || !g.character) return;
        if (!this._moved) { this._moved = true; this.migrate(); }
        for (const side of ['right', 'left']) { const h = items.held[side]; if (h && h.item.kind === 'coins' && !h.item.shop && this.mine.size < 16) this.mine.add(h.item.uid); }
        this._look -= dt;
        if (this._look <= 0) this._refresh();
        if (this._open) { this._shut = 0; this._coach(dt); return; }
        this._at = 0;
        if (this.log.length > 40) this.log.splice(0, 20);
        this._shut += dt;
        if (this._shut < DEAL.GRACE_S) return;
        // the deal is over: a pouch in a hand goes back to the belt (the fingers opened over it)
        for (const side of ['right', 'left']) {
            const h = items.held[side];
            if (h && h.item.kind === 'coins' && !h.item.shop && inv.purse.canTie(h.item)) {
                inv.purse._tieOn(side);
                this.log.push('back:' + side);
            }
        }
        // …and a pouch of mine left on a counter I am at (or the change he gave): also home
        this._sweep -= dt;
        if (this._sweep <= 0 && g.castleLife) {
            this._sweep = DEAL.SWEEP_S;
            const me = g.character.group.position;
            const alone = !(g.remotes?.size > 0); // (alone: any pouch at my counter is mine — the change too; with friends only those that were in my hands)
            for (const L of this._counterPouches(false)) {
                if (!alone && !this.mine.has(L.item.uid)) continue;
                const n = L.item.count || 0;
                items.removeLoose(L.item.uid);
                this.mine.delete(L.item.uid);
                if (inv.purse.magic) inv.purse.add(n); else inv.purse.tieMagic({ ...L.item, count: n });
                this.log.push('sweep:' + n);
                inv._render?.();
            }
        }
    }
}
