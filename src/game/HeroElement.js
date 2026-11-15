/**
 * HeroElement.js — the hero as a mage of ONE element (water, earth, fire, air). The author 15.11: «ты можешь быть только одним магом… все заклинания,
 * связанные с этой категорией, тебе будут стоить в 2 раза дешевле. Это будет у всех NPC тоже»; the key spell of each element (Water / Ground / Fire /
 * Air Vortex) is the element's own, its modes (a hand to aim, crossed arms to guard) come with it (stage 3), the guard becomes the element's.
 *
 * Rules here are pure (no THREE): the element's ids, the discount (`elementK`), the way a pentagram switches the element (`switchTo`: the new one
 * replaces the old, the old advantage is lost, the spells stay known). The game part is the small class `HeroElement` (`g.heroElement`: the
 * state, the save, the network flag).
 *
 * «А если»: dead hero (the element stays — it is a gift of the learning, not of the body); a second pentagram of the same element (nothing changes,
 * no mana back); a pentagram of another element while a vortex of the old one is going (the old vortex goes on to its end, only the price changes);
 * an old world / a save without the field (no element); a guest (his own element, told to the host by the pose flag `Dread.PERK`-like `el`);
 * the spell that belongs to two categories (cheaper if ANY of its categories is the hero's); a free-mana hero (nothing to pay: no change).
 */
import { spellElements } from '../ui/SpellElements.js';

export const ELEMENTS = ['water', 'earth', 'fire', 'air'];
export const ELEMENT_NAME = { water: 'вода', earth: 'земля', fire: 'огонь', air: 'воздух' };
export const ELEMENT_ICON = { water: '💧', earth: '🪨', fire: '🔥', air: '🌬️' };
/** The key spell of each element (the vortex round the mage; its modes — aim / guard / …). */
export const KEY_SPELL = { water: 'WaterVortex', earth: 'GroundVortex', fire: 'FireVortex', air: 'AirVortex' };
export const DISCOUNT = 0.5; // the price of the element's own spells

export const isElement = (id) => ELEMENTS.includes(id);
export const normalizeElement = (id) => (isElement(id) ? id : null);

/** The price factor of a spell for a mage of this element (0.5 for his own category, else 1). */
export function elementK(element, spellId) {
    if (!isElement(element) || !spellId) return 1;
    return spellElements(spellId).includes(element) ? DISCOUNT : 1;
}

/** A pentagram of `next` is used by a mage of `cur`: → what he is after it, and whether the old advantage was lost. */
export function switchTo(cur, next) {
    const n = normalizeElement(next);
    if (!n) return { element: normalizeElement(cur), lost: null, changed: false };
    if (n === cur) return { element: n, lost: null, changed: false };
    return { element: n, lost: normalizeElement(cur), changed: true };
}

export class HeroElement {
    constructor(game) { this.game = game; this.id = null; }
    get element() { return this.id; }
    /** The cost factor for the hero's own cast (Combat.costOf). */
    k(spellId) { return elementK(this.id, spellId); }
    /** Become a mage of this element (a pentagram, the Creative setting). → what changed. */
    set(id, { say = true } = {}) {
        const r = switchTo(this.id, id);
        if (!r.changed) return r;
        this.id = r.element;
        const g = this.game;
        if (say) g.hud?.setVoice?.(r.lost
            ? `${ELEMENT_ICON[r.element]} Вы стали магом стихии «${ELEMENT_NAME[r.element]}». Преимущество стихии «${ELEMENT_NAME[r.lost]}» потеряно`
            : `${ELEMENT_ICON[r.element]} Вы стали магом стихии «${ELEMENT_NAME[r.element]}»: её заклинания стоят вдвое дешевле`, true);
        g.sync?.perk?.(this.id);
        return r;
    }
    clear() { this.id = null; }
    snapshot() { return this.id; }
    restore(s) { this.id = normalizeElement(s); }
}
