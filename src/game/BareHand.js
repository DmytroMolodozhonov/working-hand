/**
 * BareHand.js — «колдовать без палочки» (pure rules, node-testable; the game part is Game._wandGate and Pentagranium.js).
 * The author: «сейчас можно колдовать БЕЗ палочки, рукой. Эту возможность убрать — волшебник ещё слишком слаб».
 *
 *  - From the start, without a wand, only «Акцио» and «Protection» (+ «Protection Maxima», and the gods' shield with the same gesture) work:
 *    the simplest spells, a wizard makes them with the bare hand. «Стоп» is no spell but the end of one — it works with empty hands too.
 *  - EVERYTHING else needs a magic wand in the hand — any wand (the plain wooden first one too), either hand.
 *  - After the rite of the white pentagram «Pentagranium Manus» (burn its scroll, lay it, step into the circle: 50 mana) every spell may be cast
 *    bare-handed — until death (death takes it; «Give Me My Power» brings it back: Legacy.js).
 *  - Creative: no limits (the author: «в Творческом все заклинания без ограничений и без палочки»).
 *  - Imperius: the hero casts nothing at all (Concentration.js says so first — this gate comes after it).
 *  - The wizards of the world always have a wand (WizardAI): this gate is for the hero's voice only. Another player's spell reaches me as a
 *    network message (the spell was already allowed on his computer); in a duel the wand is the wand held in the hand (Game.wandSide).
 *
 * WHAT COUNTS AS A WAND: an item of kind 'wand' held in a hand (Items.heldOf('wand')). In the pocket, on the belt, on the ground — not held.
 * The monster form hides the wand (MonsterForm) and casts nothing anyway.
 */

/** Spells a wizard makes with the bare hand from the start (the keys of SpellBook). */
export const BARE_FREE = new Set(['Accio', 'Protection', 'ProtectionMaxima', 'ProtectionGods', 'ProtectionGodsMaxima']);

export const BARE = {
    COST: 50, // mana, taken the moment the hero steps into the circle
    STAND: 1.2, // s in the circle before the rite begins (a step through does not trigger it)
    RITE: 4.5, // s the rite lasts (light from the palms, runes round the hands, a ring)
};

/** «Стоп» ends spells, it casts none: with empty hands too. */
export const isStop = (name) => name === 'Stand' || name === 'Stop';

/**
 * May the hero cast `name` now? Pure.
 * @param {{hasWand: boolean, creative?: boolean, bareMaster?: boolean}} st
 * @returns {{ok: boolean, why?: 'wand'}}
 */
export function bareGate(name, st) {
    if (st.hasWand || st.creative || st.bareMaster) return { ok: true };
    if (BARE_FREE.has(name) || isStop(name)) return { ok: true };
    return { ok: false, why: 'wand' };
}

/** What the player is told (a large hint, once a session). */
export const BARE_HINT = 'Без палочки вы можете творить только Акцио и Protection. Возьмите палочку в руку';

/** On whom / on what (CLAUDE.md): the rite works on the hero only. */
export const BARE_TARGETS = {
    me: { does: 'learn', why: 'герой встаёт в круг: 50 маны, навсегда (до смерти) может колдовать любые заклинания без палочки' },
    players: { does: 'learn', why: 'в сети каждый учится на своём компьютере; остальные видят свет, руны и кольцо (сообщение pgm, k bare)' },
    zombies: { does: 'none', why: 'не действует: колдуют только герои и волшебники' },
    castlePeople: { does: 'none', why: 'жители не учатся; у волшебников палочка всегда в руке' },
    animals: { does: 'none', why: 'не действует' },
    sailors: { does: 'none', why: 'не действует' },
    spider: { does: 'none', why: 'не действует' },
    livingTrees: { does: 'none', why: 'не действует' },
    bookBirds: { does: 'none', why: 'не действует' },
    iceCastle: { does: 'none', why: 'не действует' },
    dragon: { does: 'none', why: 'не действует' },
    items: { does: 'none', why: 'вещей не трогает; нужна палочка только чтобы создать рисунок' },
};
