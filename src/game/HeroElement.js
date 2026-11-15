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
export const DISCOUNT = 0.5;
export const ELEMENT_COST = 150; // mana for the rite of an element pentagram (the author 15.11)
/** Which element a pentagram id gives. */
export const ELEMENT_OF_PENT = { elwater: 'water', elearth: 'earth', elfire: 'fire', elair: 'air' }; // the price of the element's own spells

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
    constructor(game) { this.game = game; this.id = null; this.givenByRite = false; }
    get element() { return this.id; }
    /** The cost factor for the hero's own cast (Combat.costOf). */
    k(spellId) { return elementK(this.id, spellId); }
    /** Become a mage of this element (a pentagram, the Creative setting). → what changed. */
    set(id, { say = true, rite = false } = {}) {
        const r = switchTo(this.id, id);
        if (!r.changed) return r;
        this.id = r.element; this.givenByRite = !!rite;
        const g = this.game;
        if (say) g.hud?.setVoice?.(r.lost
            ? `${ELEMENT_ICON[r.element]} Вы стали магом стихии «${ELEMENT_NAME[r.element]}». Преимущество стихии «${ELEMENT_NAME[r.lost]}» потеряно`
            : `${ELEMENT_ICON[r.element]} Вы стали магом стихии «${ELEMENT_NAME[r.element]}»: её заклинания стоят вдвое дешевле`, true);
        g.sync?.perk?.(this.id);
        return r;
    }
    clear() { this.id = null; this.givenByRite = false; }
    /** Death takes what a pentagram gave (the Creative setting's element stays). */
    onDeath() { if (this.givenByRite) this.clear(); }
    snapshot() { return this.id ? (this.givenByRite ? { e: this.id, r: 1 } : this.id) : null; }
    restore(s) { const o = s && typeof s === 'object'; this.id = normalizeElement(o ? s.e : s); this.givenByRite = !!(this.id && o && s.r); }
    /**
     * The circle of an element pentagram: stand in it and pay (Pentagranium.js asks every frame the hero stands in a lit circle).
     * @returns {boolean} given (the circle is then quiet for a while)
     */
    useCircle(element, ctx) {
        const g = this.game;
        if (g.isDeadLocal || g.combat?.dead) return false;
        if (this.id === element) { ctx.hint?.(`${ELEMENT_ICON[element]} Вы уже маг стихии «${ELEMENT_NAME[element]}»`); return false; }
        if (ctx.pays) {
            if (ctx.mana < ELEMENT_COST) { ctx.hint?.(`😮‍💨 Не хватает маны: нужно ${ELEMENT_COST}`); return false; }
            g.combat.fatigue -= ELEMENT_COST; g.combat._hudKey = '';
        }
        this.set(element, { rite: true });
        ctx.fx?.();
        g.perf?.note?.(`${ELEMENT_ICON[element]} Пентаграмма мага: ${ELEMENT_NAME[element]}`);
        return true;
    }
}

/** The network form of an element: 0 none, 1…4 = ELEMENTS index + 1. */
export const elementIndex = (id) => ELEMENTS.indexOf(id) + 1;
export const elementAt = (n) => ELEMENTS[(n | 0) - 1] || null;

/**
 * A mage of an element casts the spells of his OWN element with a bare hand, no wand (the author 15.11: «маги стихий свою стихию могут без палочки колдовать, если получат
 * через пентаграмму такой стиль»): the spell's categories include his element, or it is one of the element's own modes (the ice shards of water).
 */
export const ELEMENT_MODES = { water: ['IceShards'], earth: ['EarthDust'], fire: [], air: [] };
export function bareOwn(element, spellId) {
    if (!isElement(element) || !spellId) return false;
    return spellElements(spellId).includes(element) || KEY_SPELL[element] === spellId || (ELEMENT_MODES[element] || []).includes(spellId);
}
