/**
 * WizardShop.js — what wizards keep and sell (pure, node-testable).
 *
 *  - A chest in a wizard's house: scrolls (health, strength), now and then a spell
 *    scroll, a spell book, a plain wand; else food.
 *  - The scroll shop of a tower: 3 scrolls on the counter (common ones mostly);
 *    the price depends on the scroll's strength — always more than a merchant
 *    pays for it (so nobody gets rich buying here and selling at the market).
 */

import { newUid, itemValue, SPELL_RU, fitThings } from './ItemTypes.js';
import { bookSpells, WARD_ID } from './BookBirds.js';
import { rollChestArmor } from './ArmorTypes.js';

const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const randInt = (r, a, b) => a + Math.floor(r() * (b - a + 1));

/**
 * A lone wizard's house keeps what a house needs (the author: «в домах одиночных волшебников свитки про дом, защиту
 * дома, улучшение дома — в разы чаще, 40%»): its chest holds one thing about houses with this chance
 * (the towers' and the wizards' villages' chests are as they were).
 */
export const LONE_HOUSE = { CHANCE: 0.4 };

/** Things about a house: «Improve a House» / «Create a House» scrolls, «Alohomora Maxima» (doors), the book of protection (its five spells). */
const HOUSE_THINGS = [['ImproveHouse', 3], ['CreateHouse', 3], ['AlohomoraMaxima', 1.5], ['ward', 3]];

/** One thing about houses (see HOUSE_THINGS). */
export function rollHouseThing(r = Math.random) {
    let y = r() * HOUSE_THINGS.reduce((a, [, w]) => a + w, 0);
    for (const [k, w] of HOUSE_THINGS) {
        if ((y -= w) >= 0) continue;
        if (k === 'ward') { const id = WARD_ID + Math.floor(r() * 1e6); return { kind: 'book', uid: newUid(), id, spells: bookSpells(id), ward: true }; }
        return { kind: 'scroll', uid: newUid(), stat: 'spell', spell: k };
    }
    return { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'ImproveHouse' };
}

/** Is this thing one of those about a house? */
export const isHouseThing = (it) => !!it && ((it.kind === 'scroll' && it.stat === 'spell' && HOUSE_THINGS.some(([k]) => k === it.spell)) || (it.kind === 'book' && !!it.ward));

/** A chest in a wizards' house: 1–3 things (a rich house a little more). `lone`: a lone wizard's house (LONE_HOUSE). */
export function rollWizardHouseLoot(r = Math.random, rich = false, count = 0, lone = false) {
    const out = [];
    const n = randInt(r, 1, rich ? 3 : 2) + (rich && r() < 0.3 ? 1 : 0);
    for (let i = 0; i < n; i++) {
        const x = r();
        if (x < 0.55) out.push(r() < 0.5 ? { kind: 'scroll', uid: newUid(), stat: 'hp', amount: randInt(r, 1, 5) } : { kind: 'scroll', uid: newUid(), stat: 'fatigue', amount: randInt(r, 1, 10) });
        else if (x < 0.64) {
            const y = r();
            out.push({ kind: 'scroll', uid: newUid(), stat: 'spell', spell: y < 0.3 ? 'ToTheSun' : y < 0.55 ? 'Thunderwave' : y < 0.7 ? 'LightningStrike' : pick(r, SHOP_SPELLS) });
        } else if (x < 0.77) { const id = 100000 + Math.floor(r() * 1e6); out.push({ kind: 'book', uid: newUid(), id, spells: bookSpells(id) }); }
        else if (x < 0.82) out.push({ kind: 'wand', uid: newUid(), plain: true, model: 0, color: 0x6b4426, dir: null, fav: null, power: 0 });
        else out.push({ ...pick(r, [{ kind: 'bread', count: 1 }, { kind: 'cheese', count: 1 }, { kind: 'apple', count: 1 }, { kind: 'pie', count: 1 }]), uid: newUid() });
    }
    // (the wizards keep magic armour more often than anybody — and now and then a magic robe: ArmorTypes)
    const arm = rollChestArmor(r, { wizard: true });
    if (arm) out.push(arm);
    const things = count > 0 ? fitThings(out, count, r) : out;
    if (lone && r() < LONE_HOUSE.CHANCE) {
        // (it takes the place of the plainest thing: food, a health / mana scroll — else a random one; never an extra, the chest keeps its count)
        const plain = (it) => ['bread', 'cheese', 'apple', 'pie'].includes(it.kind) || (it.kind === 'scroll' && it.stat !== 'spell');
        let at = things.findIndex(plain);
        if (at < 0) at = Math.floor(r() * things.length) % Math.max(1, things.length);
        if (things.length) things[at] = rollHouseThing(r); else things.push(rollHouseThing(r));
    }
    return things;
}

/** The wizards' own spells (the towers' shop and their houses): what a beginner does not know yet — the strong ones once each. */
export const SHOP_SPELLS = ['LumosFollowing', 'LumosFollowing', 'Brainrot', 'Brainrot', 'Snowman', 'Overgrown', 'Overgrown', 'Drawdown', 'Drawdown', 'Groundprud', 'VisibleGodi', 'GroundVortex', 'JoltMaxima', 'ProtectionMaxima', 'ProtectionMaxima',
    'EarthquakeMaxima', 'LiquidationMaxima', 'IceMaxima', 'CircleAttack', 'Imperius'];

/** The price of a scroll in a tower's shop (coins). */
export function scrollShopPrice(it) {
    if (!it || it.kind !== 'scroll') return null;
    const n = it.amount || 1;
    switch (it.stat) {
        case 'hp': return 70 + 10 * n;
        case 'fatigue': return 65 + 5 * n;
        case 'flight': return 380;
        case 'spell': return { LumosFollowing: 180, ToTheSun: 240, Thunderwave: 260, LightningStrike: 320, Brainrot: 260, Snowman: 260, Overgrown: 280, Drawdown: 280, JoltMaxima: 340, ProtectionMaxima: 360, EarthquakeMaxima: 380, LiquidationMaxima: 380, IceMaxima: 420, CircleAttack: 900, AvadaKedavra: 500, Accentric: 500, Electrum: 550, Pilbidrio: 800, Imperius: 850, TotalDestruction: 900, Inspirius: 3000 }[it.spell] ?? 300;
        default: return 100;
    }
}

/** One scroll for the shop's counter: common 75 % (health / strength), spells 25 % (no flight: only the swift book-bird teaches it). */
export function rollShopScroll(r = Math.random) {
    const x = r();
    if (x < 0.75) return r() < 0.5 ? { kind: 'scroll', uid: newUid(), stat: 'hp', amount: randInt(r, 1, 5) } : { kind: 'scroll', uid: newUid(), stat: 'fatigue', amount: randInt(r, 1, 10) };
    const y = r();
    return { kind: 'scroll', uid: newUid(), stat: 'spell', spell: y < 0.25 ? 'ToTheSun' : y < 0.45 ? 'Thunderwave' : y < 0.6 ? 'LightningStrike' : pick(r, SHOP_SPELLS) };
}

/** «свиток здоровья +3», «свиток «Lightning Strike»», «свиток полёта». */
export function scrollName(it) {
    if (!it || it.kind !== 'scroll') return 'свиток';
    if (it.stat === 'hp') return `свиток здоровья +${it.amount || 1}`;
    if (it.stat === 'fatigue') return `свиток маны +${it.amount || 1}`;
    if (it.stat === 'flight') return 'свиток полёта';
    if (it.stat === 'spell') return `свиток «${SPELL_RU[it.spell] || it.spell}»`;
    return 'свиток';
}

export { itemValue };
