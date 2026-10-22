/**
 * WizardMarket.js — what the shops of a wizards' settlement sell and buy (pure, node-testable).
 *
 * The crooked market lane (src/world/WizardVillages.js) has a trade in every shop — the author:
 * «обширное разнообразие магических предметов — это очень важно, в других местах их мало»:
 *  - cauldrons  the master of cauldrons and potions: flasks, ingredients, a big cauldron beside (CastleTalk's
 *               POTION_GOODS / WIZARD_RARE, Cauldrons.js);
 *  - potions    healing potions (~50), flasks, rare ingredients, now and then the potion of invisibility;
 *  - robes      magic robes (some soften 2–3 strong spells) and plain ones;
 *  - wands      small and middling wands (power 3–30: ~210–510 coins). The strongest (31–50) are NOT
 *               sold anywhere — only found in chests (the author: «их никто не продаст»);
 *  - armor      magic armour pieces (a helmet, a breastplate, greaves), now and then a plain one;
 *  - scrolls    health and mana scrolls and scrolls of simple spells (no strong spell: those are found);
 *  - curios     mana crystals, the magic pouch, a magic shield, a spell book, feathers;
 *  - pawn       the pawnshop sells nothing: it BUYS anything, plain or magic, 40 % under the price
 *               (PAWN_RATE of itemValue). The other sellers of the lane only sell.
 * And in the ordinary towns (castles' villages, src/world/Castles.js) a shady buyer in a hut out of
 * the way (the stall's `fence`): he buys plain things at the same 40 % under, never magic ones.
 *
 * A good: {item, price} — the price is for the whole lot on the counter (three flasks: one price).
 */

import { newUid, itemValue, isMagicItem, rollWand, spellScroll, WAND_DIRS } from './ItemTypes.js';
import { makePiece, makeRobe, armorValue, PIECES } from './ArmorTypes.js';
import { scrollShopPrice } from './WizardShop.js';
import { createRng } from '../core/math.js';

export const PAWN_RATE = 0.6; // (the author: «на 40 % ниже обычной цены»)
/** What the pawnshop / the shady buyer pays for a thing. */
export const pawnPrice = (it) => Math.max(1, Math.round(itemValue(it) * PAWN_RATE));

/** Magic things the shady buyer of a town never takes (the magic ones, potions and their rare ingredients). */
const NOT_FOR_FENCE = new Set(['potion', 'crystal', 'phoenixFeather', 'owlFeather', 'dragonEgg', 'iceRod', 'minotaurHorn', 'web', 'hammer']);
export const fenceTakes = (it) => !!it && !isMagicItem(it) && !NOT_FOR_FENCE.has(it.kind) && itemValue(it) > 0;

/** The wands: small (power 3–15), middling (16–30); never stronger. Price: 180 + 11 × power. */
export const WAND_POWER = { small: [3, 15], middle: [16, 30], max: 30 };
export const wandPrice = (power) => 180 + 11 * power;

/** Simple spells the scroll shop sells (strong ones are only found). */
export const SHOP_SIMPLE_SPELLS = ['LightningStrike', 'Thunderwave', 'ToTheSun', 'AlohomoraMaxima', 'Brainrot', 'Overgrown', 'Snowman', 'Drawdown', 'Waterball', 'Unfurl', 'AirBubble', 'LetItRain'];

const HEAL_COLOR = 0xe0405a;
const randInt = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];

/**
 * The good of slot `k` (0–2) of a trade's counter; `n` turns the choice now and then (the same on
 * every computer for the same n). null: this trade sells nothing (the pawnshop).
 */
export function wizardGood(trade, k, n = 0) {
    const r = createRng(((n * 2654435761) ^ (k * 40503) ^ (trade.length * 9176)) >>> 0);
    r();
    switch (trade) {
        case 'potions': {
            if (k < 2) return { item: { kind: 'potion', uid: newUid(), rec: 'heal', color: HEAL_COLOR }, price: 50 };
            const x = r();
            if (x < 0.3) return { item: { kind: 'flask', uid: newUid(), count: 3 }, price: 15 };
            if (x < 0.5) return { item: { kind: 'potion', uid: newUid(), rec: 'invis', color: 0x9a7bd8 }, price: 350 };
            if (x < 0.7) return { item: { kind: 'web', uid: newUid(), count: 1 }, price: 150 };
            if (x < 0.85) return { item: { kind: 'minotaurHorn', uid: newUid() }, price: 260 };
            return { item: { kind: 'glass', uid: newUid(), count: 3 }, price: 10 };
        }
        case 'robes': {
            const magic = k !== 1 || r() < 0.5;
            const it = makeRobe(magic, r);
            return { item: it, price: Math.round(armorValue(it) * 1.4) };
        }
        case 'armor': {
            const it = makePiece(PIECES[(k + n) % 3], { magic: k !== 2 || r() < 0.7 });
            return { item: it, price: Math.round(armorValue(it) * 1.6) };
        }
        case 'wands': {
            const [a, b] = k === 2 ? WAND_POWER.middle : r() < 0.4 ? WAND_POWER.middle : WAND_POWER.small;
            const it = rollWand(r);
            it.power = randInt(r, a, b);
            if (!it.dir) it.dir = pick(r, Object.keys(WAND_DIRS)); // (the shop sells only wands with properties: a direction, a favourite, a power)
            delete it.plain;
            return { item: it, price: wandPrice(it.power) };
        }
        case 'scrolls': {
            const it = k === 0 ? (r() < 0.5 ? { kind: 'scroll', uid: newUid(), stat: 'hp', amount: randInt(r, 1, 5) } : { kind: 'scroll', uid: newUid(), stat: 'fatigue', amount: randInt(r, 1, 10) })
                : spellScroll(pick(r, SHOP_SIMPLE_SPELLS));
            return { item: it, price: scrollShopPrice(it) };
        }
        case 'curios': {
            if (k === 0) return { item: { kind: 'crystal', uid: newUid(), count: 1 }, price: 70 };
            const x = r();
            if (k === 1) {
                // (no coin pouch for sale: every hero has the one bottomless pouch — CoinBelt)
                const max = randInt(r, 20, 40);
                return { item: { kind: 'shield', uid: newUid(), type: 2, magic: true, max }, price: Math.round((90 + max) * 1.4) };
            }
            if (x < 0.4) { const id = 100000 + Math.floor(r() * 1e6); return { item: { kind: 'book', uid: newUid(), id }, price: 120 }; } // (its spells: CastleTalk fills them — BookBirds.bookSpells)
            if (x < 0.7) return { item: { kind: 'phoenixFeather', uid: newUid(), count: 1 }, price: 380 };
            if (x < 0.85) return { item: { kind: 'owlFeather', uid: newUid(), count: 1 }, price: 90 };
            return { item: { kind: 'apple', uid: newUid(), count: 1 }, price: 35 };
        }
        default: return null; // the pawnshop (and an unknown trade): nothing on the counter
    }
}

/** The names of the trades for talk and the codex. */
export const TRADE_RU = {
    cauldrons: 'мастер котлов и зелий', potions: 'зельевар', robes: 'портной мантий', wands: 'мастер палочек',
    armor: 'бронник', scrolls: 'продавец свитков', curios: 'лавка диковин', pawn: 'скупщик (ломбард)',
};
