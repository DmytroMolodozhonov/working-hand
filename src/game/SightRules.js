/**
 * SightRules.js — the two white pentagrams of sight (pure, node-testable; the game part is SecondSight.js, the circles are Pentagranium.js):
 *
 *  night  «Pentagranium Noctis»   — 50 mana. Stand in the circle: for ever (until death) you see 50 % better in the dark — at night
 *                                   and in caves (the picture is brighter in the dark and the dark is seen 1.5 times as far).
 *  sight  «Pentagranium Spectris» — 150 mana and ONE feather of Spencer's bird (or a sheaf of Beslan's grass). Stand in the circle:
 *                                   for ever (until death) you see everything invisible (Invisibles.js).
 *
 * Each is learnt by burning its scroll (PentagramRules); a death takes the gift away, «Give Me My Power» brings it back (Legacy.js).
 * In Creative nothing is paid or used up, but the circle must still be stood in.
 */

export const SIGHT = {
    NIGHT_COST: 50, // mana
    SEE_COST: 150, // mana
    NIGHT_K: 0.5, // «на 50 % лучше»: the brightness in the dark × 1.5, a cave 50 % less dark
    FOG_K: 1.5, // the darkness is seen 1.5 times as far (fog far × 1.5 at night / in a cave)
    ANIM_T: 3.2, // s: the opening of the eyes (the circle's glow and a ripple of the air)
    INGREDIENTS: ['spencerFeather', 'beslanGrass'], // the feather first (the bird's power), the grass instead
};

/** How much darker than day it is where the hero stands: 0 (day, outside) … 1 (deep night / deep in a cave). */
export const darkness = (night, cave) => Math.max(0, Math.min(1, Math.max(night || 0, cave || 0)));

/** The brightening of the light (ambient + hemisphere) for a hero with the night gift: × 1 … 1.5, only as much as it is dark. */
export const lightBoost = (nv, dark) => 1 + SIGHT.NIGHT_K * Math.max(0, Math.min(1, nv)) * Math.max(0, Math.min(1, dark));
/** The fog's far end for such a hero: × 1 … 1.5. */
export const fogBoost = (nv, dark) => 1 + (SIGHT.FOG_K - 1) * Math.max(0, Math.min(1, nv)) * Math.max(0, Math.min(1, dark));
/** The cave's dimming (World.setStorm: dim = 1 − 0.8 × cave) made 50 % milder: 0.8 → 0.8 / 1.5. */
export const caveDim = (cave, nv) => 1 - (0.8 * cave) / (1 + SIGHT.NIGHT_K * Math.max(0, Math.min(1, nv)));

/**
 * The ingredient for the circle of sight: in the bag (`slots`), in the hands (`held`: [item…]) or lying inside the circle (`loose`: [{uid, item}]).
 * The feather before the grass; the bag before the circle. → { kind, from: 'slot' | 'hand' | 'loose', ref } | null. Pure.
 */
export function findIngredient({ slots = [], held = [], loose = [] }) {
    for (const kind of SIGHT.INGREDIENTS) {
        for (const it of slots) if (it && it.kind === kind && (it.count ?? 1) >= 1) return { kind, from: 'slot', ref: it };
        for (const it of held) if (it && it.kind === kind && (it.count ?? 1) >= 1) return { kind, from: 'hand', ref: it };
        for (const L of loose) if (L?.item && L.item.kind === kind && (L.item.count ?? 1) >= 1) return { kind, from: 'loose', ref: L };
    }
    return null;
}

/** Texts for the person (what the hint says). */
export const SIGHT_HINT = {
    nightHave: 'Вы уже видите в темноте лучше — ещё раз не нужно',
    seeHave: 'Вы уже видите невидимое — ещё раз не нужно',
    noMana: (n) => `Не хватает маны: нужно ${n}`,
    noIngredient: 'Нужно перо птички Спенсера (или пучок травы Беслана): положите его в сумку или в круг и встаньте снова',
    nightDone: '🌙 Вы стали видеть в темноте на 50 % лучше — и ночью, и в пещерах',
    seeDone: '👁️ Вы видите невидимое! Теперь вам видны птички Спенсера, трава Беслана и всё, что скрыто от других',
    lost: '👁️ Зрение невидимого и ночное зрение уходят вместе с жизнью',
};

/** ON WHOM / ON WHAT — what standing in these circles does (CLAUDE.md): only to the hero in the circle. */
export const SIGHT_TARGETS = {
    me: { does: 'gift', why: 'герой в круге платит и получает дар навсегда (до смерти)' },
    players: { does: 'gift', why: 'в сети каждый пользуется на своём компьютере и платит сам; свой дар ведёт у себя (признак «видит» уходит остальным: другие игроки рисуются ему полупрозрачными, если он видит невидимое)' },
    zombies: { does: 'none', why: 'на существ не действует: круг даёт зрение только герою' },
    castlePeople: { does: 'none', why: 'жителям зрения не даёт' },
    animals: { does: 'none', why: 'не действует' },
    sailors: { does: 'none', why: 'не действует' },
    spider: { does: 'none', why: 'не действует' },
    livingTrees: { does: 'none', why: 'не действует' },
    bookBirds: { does: 'none', why: 'не действует' },
    iceCastle: { does: 'none', why: 'не действует' },
    dragon: { does: 'none', why: 'не действует' },
    phoenix: { does: 'none', why: 'не действует' },
    owl: { does: 'none', why: 'не действует' },
    items: { does: 'use', why: 'перо птички Спенсера (или трава Беслана) сгорает — одно на круг зрения; в круге ночного зрения вещи не нужны' },
    ground: { does: 'stay', why: 'постоянные: остаются навсегда, как пентаграммы жизни и починки' },
    spells: { does: 'none', why: 'заклинания и удары сквозь пентаграмму идут как обычно' },
};
