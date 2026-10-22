/**
 * Stock.js — what the hero carries for the spells that need resources (a house, a bed…).
 *
 * The author: «чтобы построить дом, не обязательно выкидывать предметы — можно просто держать их
 * в интерфейсе (инвентаре), главное, чтобы их было достаточно». Wool, sand and logs count wherever
 * they are on the hero: in the slots (pockets / bag) and in the hands; what lies on the ground near
 * the aimed point counts too (the old way — throw them beside — still works). Pure of THREE.
 */

import { BLOCK, isWood } from '../world/Terrain.js';

const KINDS = ['wool', 'sand', 'logs'];

/** The places a kind is carried in: [{n, cut(k)}]. */
function places(game, kind) {
    const inv = game.inventory;
    const out = [];
    const match = (it) => {
        if (!it) return false;
        if (kind === 'wool') return it.kind === 'wool';
        if (kind === 'sand') return (it.kind === 'res' || it.kind === 'blocks') && it.block === BLOCK.SAND;
        return it.kind === 'logs' || (it.kind === 'res' && isWood(it.block) && !it.endless);
    };
    (inv?.slots || []).forEach((s, i) => {
        if (match(s)) out.push({ n: s.count || 1, cut: (k) => { s.count = (s.count || 1) - k; if (s.count <= 0) inv.slots[i] = null; } });
    });
    for (const side of ['right', 'left']) {
        const h = game.items?.held?.[side];
        if (h && match(h.item)) out.push({ n: h.item.count || 1, cut: (k) => { h.item.count = (h.item.count || 1) - k; if (h.item.count <= 0) game.items.releaseHand(side); } });
    }
    return out;
}

/** {wool, sand, logs} carried: slots and hands. */
export function stockOf(game) {
    const out = { wool: 0, sand: 0, logs: 0 };
    for (const k of KINDS) for (const p of places(game, k)) out[k] += p.n;
    return out;
}

/** Use up `need` ({wool, sand, logs}) from what is carried; returns false (and takes nothing) if it is not all there. */
export function stockTake(game, need) {
    const plan = [];
    for (const k of KINDS) {
        let left = Math.max(0, Math.floor(+need?.[k] || 0));
        if (!left) continue;
        for (const p of places(game, k)) {
            if (left <= 0) break;
            const use = Math.min(p.n, left);
            plan.push(() => p.cut(use));
            left -= use;
        }
        if (left > 0) return false;
    }
    for (const f of plan) f();
    game.inventory?._render?.();
    return true;
}

/** A claim from another computer made safe: whole numbers 0…5000. */
export function cleanClaim(c) {
    const out = {};
    for (const k of KINDS) out[k] = Math.max(0, Math.min(5000, Math.floor(+c?.[k] || 0)));
    return out;
}
