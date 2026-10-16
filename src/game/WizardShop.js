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
import { bookSpells } from './BookBirds.js';
import { rollChestArmor } from './ArmorTypes.js';

const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const randInt = (r, a, b) => a + Math.floor(r() * (b - a + 1));

/** A chest in a wizards' house: 1–3 things (a rich house a little more). */
export function rollWizardHouseLoot(r = Math.random, rich = false, count = 0) {
    const out = [];
    const n = randInt(r, 1, rich ? 3 : 2) + (rich && r() < 0.3 ? 1 : 0);
    for (let i = 0; i < n; i++) {
        const x = r();
        if (x < 0.55) out.push(r() < 0.5 ? { kind: 'scroll', uid: newUid(), stat: 'hp', amount: randInt(r, 1, 5) } : { kind: 'scroll', uid: newUid(), stat: 'fatigue', amount: randInt(r, 1, 10) });
        else if (x < 0.64) {
            const y = r();
            out.push({ kind: 'scroll', uid: newUid(), stat: 'spell', spell: y < 0.45 ? 'ToTheSun' : y < 0.8 ? 'Thunderwave' : 'LightningStrike' });
        } else if (x < 0.77) { const id = 100000 + Math.floor(r() * 1e6); out.push({ kind: 'book', uid: newUid(), id, spells: bookSpells(id) }); }
        else if (x < 0.82) out.push({ kind: 'wand', uid: newUid(), plain: true, model: 0, color: 0x6b4426, dir: null, fav: null, power: 0 });
        else out.push({ ...pick(r, [{ kind: 'bread', count: 1 }, { kind: 'cheese', count: 1 }, { kind: 'apple', count: 1 }, { kind: 'pie', count: 1 }]), uid: newUid() });
    }
    // (the wizards keep magic armour more often than anybody — and now and then a magic robe: ArmorTypes)
    const arm = rollChestArmor(r, { wizard: true });
    if (arm) out.push(arm);
    return count > 0 ? fitThings(out, count, r) : out;
}

/** The price of a scroll in a tower's shop (coins). */
export function scrollShopPrice(it) {
    if (!it || it.kind !== 'scroll') return null;
    const n = it.amount || 1;
    switch (it.stat) {
        case 'hp': return 70 + 10 * n;
        case 'fatigue': return 65 + 5 * n;
        case 'flight': return 380;
        case 'spell': return { ToTheSun: 240, Thunderwave: 260, LightningStrike: 320, AvadaKedavra: 500, TotalDestruction: 900, Inspirius: 3000 }[it.spell] ?? 300;
        default: return 100;
    }
}

/** One scroll for the shop's counter: common 75 % (health / strength), spells 25 % (no flight: only the swift book-bird teaches it). */
export function rollShopScroll(r = Math.random) {
    const x = r();
    if (x < 0.75) return r() < 0.5 ? { kind: 'scroll', uid: newUid(), stat: 'hp', amount: randInt(r, 1, 5) } : { kind: 'scroll', uid: newUid(), stat: 'fatigue', amount: randInt(r, 1, 10) };
    const y = r();
    return { kind: 'scroll', uid: newUid(), stat: 'spell', spell: y < 0.4 ? 'ToTheSun' : y < 0.75 ? 'Thunderwave' : 'LightningStrike' };
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
