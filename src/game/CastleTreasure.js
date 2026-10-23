/**
 * CastleTreasure.js — a king's fortune (the author: «У короля должно быть от 500 до 1500 монеток, рандомно, и
 * разбросаны по нескольким сундукам: это единая сумма, а по сундукам поменьше — он же не в одном всё хранит»).
 *
 * Each castle has ONE fortune, 500…1500, fixed by the castle (the same on every computer, however the chests are
 * opened): a small part (PURSE) is the king's own pouch — it falls where he falls — and the rest is shared among
 * the castle's chests by their rooms (the treasury and the vault hold the most, the study and the royal rooms less,
 * any other chest a little). So the coins of all the castle's chests and of the king together are the fortune.
 * Pure (tests).
 */

export const TREASURE = {
    MIN: 500, MAX: 1500,
    PURSE: 0.12, // the share the king carries himself
    MIN_CHEST: 5,
    // a room's weight among the castle's chests (any other room: 1; the sailors' stores of the port are not the king's)
    WEIGHT: { treasury: 4, vault: 4, king: 3, throne: 3, study: 2.5 },
    NOT_KINGS: new Set(['port']),
};

const strHash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function unit(s, salt) {
    let h = (strHash(s) ^ Math.imul(salt, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** Is this site a king's castle (not a tower, a hamlet or a wizards' town)? */
export const isKingsCastle = (def) => !!def && !!def.king && (def.kind == null || def.kind === 'castle');

/** The castle's whole fortune. */
export function castleFortune(id) {
    return TREASURE.MIN + Math.floor(unit(id, 7) * (TREASURE.MAX - TREASURE.MIN + 1));
}

const cache = new WeakMap();
/**
 * { fortune, purse, byId: Map(chest id → coins) } of a castle def — the shares add up to the fortune exactly
 * (largest remainders); every chest at least MIN_CHEST.
 */
export function treasureShares(def) {
    let t = cache.get(def);
    if (t) return t;
    const fortune = castleFortune(def.id);
    const purse = Math.round(fortune * TREASURE.PURSE);
    const chests = (def.chests || []).filter((c) => c && c.id != null && !TREASURE.NOT_KINGS.has(c.room));
    const byId = new Map();
    const rest = fortune - purse;
    if (chests.length) {
        const ws = chests.map((c) => TREASURE.WEIGHT[c.room] ?? 1), W = ws.reduce((a, b) => a + b, 0);
        const spare = rest - TREASURE.MIN_CHEST * chests.length;
        const raw = ws.map((w) => (w / W) * spare);
        const base = raw.map((x) => Math.floor(x));
        let left = spare - base.reduce((a, b) => a + b, 0);
        const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
        for (let k = 0; left > 0; k = (k + 1) % order.length, left--) base[order[k][1]]++;
        chests.forEach((c, i) => byId.set(c.id, TREASURE.MIN_CHEST + base[i]));
    }
    t = { fortune, purse: chests.length ? purse : fortune, byId };
    cache.set(def, t);
    return t;
}

/** The coins of one castle chest (null: not a part of the king's fortune — the caller's own rule). */
export function chestCoins(def, chest) {
    if (!isKingsCastle(def) || chest?.id == null) return null;
    return treasureShares(def).byId.get(chest.id) ?? null;
}

/** The king's own pouch (null: not a king's castle). */
export function kingPurse(def) {
    return isKingsCastle(def) ? treasureShares(def).purse : null;
}
