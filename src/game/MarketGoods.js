/**
 * MarketGoods.js — what each market stall of a castle sells.
 *
 * Every stall has its own trade (a baker, a butcher, a cheesemaker, a fruiterer, an armourer,
 * a bowyer, a weaver, a glassmaker): its counter holds only that trade's goods, so neighbouring
 * stalls never sell the same things (the author: «у каждого продавца должны быть свои товары»).
 * Which stall gets which trade is fixed by the castle (its id): the same in every game, on
 * every computer, after a save. The host lays the goods (CastleTalk._restock).
 */

export const TRADES = [
    { id: 'baker', ru: 'пекарь', goods: [{ kind: 'bread', price: 3 }, { kind: 'pie', price: 6 }, { kind: 'bread', price: 3 }] },
    { id: 'butcher', ru: 'мясник', goods: [{ kind: 'steak', price: 6 }, { kind: 'meat', price: 3 }, { kind: 'steak', price: 6 }] },
    { id: 'cheese', ru: 'сыровар', goods: [{ kind: 'cheese', price: 4 }, { kind: 'cheese', price: 4, count: 3 }, { kind: 'cheese', price: 4 }] },
    { id: 'fruit', ru: 'садовник', goods: [{ kind: 'redApple', price: 2, count: 3 }, { kind: 'apple', price: 30 }, { kind: 'redApple', price: 2, count: 3 }] },
    { id: 'armourer', ru: 'щитник', goods: [{ kind: 'shield', price: 25, type: 0 }, { kind: 'shield', price: 40, type: 1 }, { kind: 'shield', price: 25, type: 0 }] },
    { id: 'bowyer', ru: 'лучный мастер', goods: [{ kind: 'bow', price: 30 }, { kind: 'arrows', price: 8, count: 10 }, { kind: 'arrows', price: 8, count: 10 }] },
    { id: 'weaver', ru: 'ткач', goods: [{ kind: 'wool', price: 4, count: 3 }, { kind: 'wool', price: 4, count: 3 }, { kind: 'wool', price: 7, count: 5 }] },
    { id: 'glass', ru: 'стекольщик', goods: [{ kind: 'glass', price: 5, count: 3 }, { kind: 'flask', price: 6, count: 2 }, { kind: 'glass', price: 5, count: 3 }] },
];

/**
 * What the shops of the settlement buildings (Buildings.js; a stall's `shop`) sell — each its own goods. The smith sells plain arms
 * (a sword, an axe, a shield, arrows), the baker bread and pies, the herbalist flasks, apples and healing herbs, the innkeeper
 * hot food. Prices a little above a market stall's (a shop, not a barrow).
 */
export const SHOPS = {
    smith: { ru: 'кузнец', goods: [{ kind: 'weapon', type: 'sword', price: 60 }, { kind: 'weapon', type: 'axe', price: 50 }, { kind: 'shield', price: 35, type: 0 }] },
    baker: { ru: 'пекарь', goods: [{ kind: 'bread', price: 3, count: 2 }, { kind: 'pie', price: 7 }, { kind: 'bread', price: 3 }] },
    herbs: { ru: 'травник', goods: [{ kind: 'flask', price: 8, count: 2 }, { kind: 'redApple', price: 2, count: 3 }, { kind: 'apple', price: 30 }] },
    tavern: { ru: 'трактирщик', goods: [{ kind: 'steak', price: 7 }, { kind: 'cheese', price: 4 }, { kind: 'pie', price: 7 }] },
};

function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

/** The trades of a castle's stalls, in order: all different while there are trades enough (a market has up to 8 stalls). */
export function stallTrades(castleId, n) {
    const order = TRADES.map((t, i) => i);
    let s = hash(String(castleId)) || 1;
    for (let i = order.length - 1; i > 0; i--) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const j = s % (i + 1);
        [order[i], order[j]] = [order[j], order[i]];
    }
    const out = [];
    for (let i = 0; i < n; i++) out.push(TRADES[order[i % order.length]]);
    return out;
}

/** The trade of one stall. */
export const stallTrade = (castleId, i, n = 8) => stallTrades(castleId, Math.max(n, i + 1))[i];

/**
 * How far before a counter's front face the buyer's body stays (m, beyond its own radius): close
 * enough that the hands reach the goods on the counter top, far enough that the arms are not
 * squeezed against it (the author: «я слишком близко подхожу к стойке… неудобно руками класть»).
 */
export const COUNTER_GAP = 0.55;

/**
 * The floor area a body may not stand in at a stall: the counter itself and a strip of COUNTER_GAP
 * before its front face (the buyer's side) → {minX, maxX, minZ, maxZ}; the merchant's side is free.
 */
export function counterZone(stall, gap = COUNTER_GAP) {
    const c = stall.counter;
    const z = { minX: c.x0 - 0.5, maxX: c.x1 + 0.5, minZ: c.z0 - 0.5, maxZ: c.z1 + 0.5 };
    const along = c.x1 - c.x0 >= c.z1 - c.z0; // (long in x: its front is across z)
    if (along) { if (stall.front.z >= (c.z0 + c.z1) / 2) z.maxZ += gap; else z.minZ -= gap; }
    else if (stall.front.x >= (c.x0 + c.x1) / 2) z.maxX += gap; else z.minX -= gap;
    return z;
}
