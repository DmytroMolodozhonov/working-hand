/**
 * BuyerDeal.js — the pawnshop's and the shady buyer's short deal (pure logic, no THREE).
 *
 * The author: «если положил тот же предмет снова — цена должна быть такая же, а не выдумываться каждый раз
 * новая. Это про эту краткосрочную сделку, а не про общую цену предметов в мире».
 * The price named for a thing at a stall is kept ~10 minutes (or until the player walks far from the stall);
 * the same thing put down again gets the very same sum.
 */

export const DEAL_MS = 10 * 60 * 1000;
export const DEAL_FAR = 40; // m: the player went off — the deals at that stall are forgotten

/** The key of a thing on a counter: a loose thing's uid, a weapon's id. */
export const dealKey = (found) => (found.uid ? 'u' + found.uid : 'w' + found.wid);

export class DealPrices {
    constructor() { this.m = new Map(); }

    /** The sum for this thing at this stall: the one named before (still fresh), else `compute()` (kept). */
    price(stallKey, key, compute, now) {
        const k = stallKey + '|' + key, e = this.m.get(k);
        if (e && now - e.at < DEAL_MS) return e.price;
        const price = Math.max(1, Math.round(compute()));
        this.m.set(k, { price, at: now, stall: stallKey });
        return price;
    }

    /** The sum named before for it, or null. */
    peek(stallKey, key, now) {
        const e = this.m.get(stallKey + '|' + key);
        return e && now - e.at < DEAL_MS ? e.price : null;
    }

    /** The thing was sold: its deal is over. */
    close(stallKey, key) { this.m.delete(stallKey + '|' + key); }

    /** The player went far from a stall: its deals are forgotten. */
    leave(stallKey) { for (const [k, e] of this.m) if (e.stall === stallKey) this.m.delete(k); }

    /** Old deals go (called now and then). */
    sweep(now) { for (const [k, e] of this.m) if (now - e.at >= DEAL_MS) this.m.delete(k); }
}

/** The hand that is NOT the leading one (the right-hander puts things with the left). */
export const offSide = (leftHanded) => (leftHanded ? 'right' : 'left');

/** Is a point over a buyer's counter (the hand reaches out above it at the counter's height or higher)? */
export function overCounter(stall, p, margin = 0.1) {
    const c = stall?.counter;
    if (!c) return false;
    return p.x >= c.x0 - margin && p.x <= c.x1 + margin && p.z >= c.z0 - margin && p.z <= c.z1 + margin && p.y > c.top - 0.2 && p.y < c.top + 2.6;
}

/** The point of the counter nearest to p (a thing let go lies on it, never beside it). */
export function clampToCounter(stall, p, inset = 0.25) {
    const c = stall.counter;
    const clamp = (v, lo, hi) => (hi - lo < 2 * inset ? (lo + hi) / 2 : Math.min(hi - inset, Math.max(lo + inset, v)));
    p.x = clamp(p.x, c.x0, c.x1);
    p.z = clamp(p.z, c.z0, c.z1);
    return p;
}

/**
 * The «Скупка» plaque over a buyer's counter. Sizes from the world's measures (a block is 1 m, the hero
 * ~3.5 m, the counter 2 m high, eyes ≈ 3.4 m): hung 3–4 m above the ground, over the counter, facing the buyer.
 * @returns {{x,y,z,yaw,w,h,top,kind}|null} y — its centre; top — where the chains end (the roof beam)
 */
export const COUNTER_H = 2; // m: the counter's height (ground = counter.top − COUNTER_H)
export function signSpec(stall) {
    const c = stall?.counter;
    if (!c || !(stall.pawn || stall.fence)) return null;
    const along = c.x1 - c.x0 >= c.z1 - c.z0;
    const mx = (c.x0 + c.x1) / 2, mz = (c.z0 + c.z1) / 2;
    const sx = along ? 0 : (stall.front.x >= mx ? 1 : -1), sz = along ? (stall.front.z >= mz ? 1 : -1) : 0;
    const IN = 0.35; // m: behind the counter's front face (it hangs over the counter, never sticks out)
    const x = along ? mx : (sx > 0 ? c.x1 : c.x0) - sx * IN;
    const z = along ? (sz > 0 ? c.z1 : c.z0) - sz * IN : mz;
    const ground = c.top - COUNTER_H;
    const pawn = !!stall.pawn;
    const w = pawn ? 2 : 1.6, h = pawn ? 1 : 0.7;
    return { x, z, y: ground + (pawn ? 3.5 : 3.2), yaw: Math.atan2(sx, sz), w, h, top: ground + (pawn ? 6 : 5), kind: pawn ? 'pawn' : 'fence' };
}
