/**
 * ResistRules.js — the two white pentagrams of protection (pure, node-testable; the game part is PentagramResist.js, the circles: Pentagranium.js).
 * The author 06.11: both are WHITE magic (`dark: false`) — they add no darkness and frighten nobody.
 *
 *  darkward «Pentagranium Albedo»  — protection from the dark magic. Make the circle, throw THREE flowers into it (one of each: a sunherb, a glowcap, an azure berry bush's
 *                                    berry), stand in it, 150 mana: for good (until death) every dark spell against you is TWICE as weak.
 *                                    ONLY while the hero's dark level is ≤ 10 (`DARK_MAX`); a hero above it cannot get the mark, and one who has it and rises above 10 loses it
 *                                    at once. The mark and the mark of «Breakward» (breaking the magic protection) are opposites: only one of them can ever be had.
 *  fireward «Pentagranium Ignaris» — protection from fire. A Brightflower's heart (the fire flower's drop) lies in the circle, stand in it, 150 mana: for good (until death)
 *                                    ordinary fire does nothing (no harm, no catching fire: a campfire, «Inferno», a dragon's or phoenix's flame, the Brightflower's breath).
 *                                    NOT absolute: the hell's fire still hurts (the Hellfire — full, but it can no more set the hero alight; the lava too) and the fire serpent,
 *                                    made of hell fire, hurts at HALF.
 *
 * Each is learnt by burning its scroll; a death takes the gift away, «Give Me My Power» brings it back (Legacy.js). The harm is cut on the victim's own computer (Combat.damage).
 */
import { isDark } from './DarkMagic.js';

export const RESIST = {
    COST: 150, // mana for either (paid when standing in the circle, once)
    DARK_MAX: 10, // the dark level a hero may have to get / keep the protection from the dark
    DARK_K: 0.5, // dark spells against me: × this
    SERPENT_K: 0.5, // the fire serpent against a hero with the fire ward: × this (hell fire, but «twice as weak»)
    ANIM_T: 3.6, // s: the picture of the gift
    CHECK_S: 1, // s: how often the dark level is looked at
    FLOWERS: ['sun_herb', 'glowcap_mushroom', 'azure_berry'], // the three flowers of the white circle (the wild flowers of the world that can be picked)
    FIRE_ITEM: 'brightCore', // the heart of the Brightflower — the fire flower
};

export const FLOWER_NAME = { sun_herb: 'солнечница', glowcap_mushroom: 'светлошляпка', azure_berry: 'лазурница' };

/** Ordinary fire: nothing of it gets through the fire ward (kinds as Combat.damage gets them). */
export const FIRE_OK = new Set(['Inferno', 'InfernoMaxima', 'Fire', 'FireMaxima', 'fire', 'campfire', 'burn', 'burning', 'Burning', 'flame', 'DragonFire']);
/** The hell's fire: it still takes the hero (full), only it can no more set him alight. */
export const HELL_FIRE = new Set(['Hellfire', 'LetTheHellfireCome', 'lava', 'Lava']);
/** The fire serpent (made of hell fire): hurts, but at half. */
export const SERPENT_KINDS = new Set(['FireSerpent', 'Serpent']);

/** How much of a blow of `kind` gets through the fire ward: 0 (none), SERPENT_K, 1 (all). Pure. */
export function fireFactor(kind) {
    if (FIRE_OK.has(kind)) return 0;
    if (SERPENT_KINDS.has(kind)) return RESIST.SERPENT_K;
    return 1;
}
/** How much of a blow of `kind` gets through the dark ward: DARK_K for a dark spell, else 1. Pure. */
export const darkFactor = (kind) => (isDark(kind) ? RESIST.DARK_K : 1);

/** May this hero get the dark ward now? `level`: the dark level, `broken`: the mark of «Breakward» is on him. → { ok } | { ok: false, why }. Pure. */
export function canGetDarkWard({ level = 0, broken = false, has = false } = {}) {
    if (has) return { ok: false, why: 'have' };
    if (broken) return { ok: false, why: 'broken' };
    if (level > RESIST.DARK_MAX) return { ok: false, why: 'dark' };
    return { ok: true };
}
/** May the mark of «Breakward» be put on this hero? (the opposite of the dark ward) `ward`: he has the dark ward. Pure. */
export const canBreakProtection = ({ ward = false } = {}) => !ward;
/** Does a hero with the dark ward keep it? Pure. */
export const keepsDarkWard = ({ level = 0, broken = false } = {}) => level <= RESIST.DARK_MAX && !broken;

/**
 * The things the dark ward wants LYING on the circle: one of each flower. `loose`: [{uid, item}]. → { ok, used: [{uid, item}], missing: [names] }. Pure.
 * (the fire ward: the same call with `RESIST.FIRE_ITEM` — see `findFireHeart`.)
 */
export function findFlowers(loose = []) {
    const used = [], missing = [];
    for (const kind of RESIST.FLOWERS) {
        const L = loose.find((x) => x?.item?.kind === kind && (x.item.count ?? 1) >= 1 && !used.includes(x));
        if (L) used.push(L); else missing.push(FLOWER_NAME[kind] || kind);
    }
    return { ok: !missing.length, used, missing };
}
/** The Brightflower's heart lying on the circle → {uid, item} | null. Pure. */
export const findFireHeart = (loose = []) => loose.find((x) => x?.item?.kind === RESIST.FIRE_ITEM && (x.item.count ?? 1) >= 1) || null;

/** Texts for the person. */
export const RESIST_HINT = {
    darkHave: 'У вас уже есть защита от тёмной магии — второй раз не нужно',
    fireHave: 'У вас уже есть защита от огня — второй раз не нужно',
    broken: 'На вас метка слома магической защиты — она и защита от тёмной магии противоположны: можно иметь только одну',
    dark: (lvl) => `Тьма в вас слишком сильна (уровень ${lvl}, а нужно не больше ${RESIST.DARK_MAX}) — свет не примет вас`,
    noFlowers: (names) => `Нужно бросить в круг по цветку каждого вида — не хватает: ${names.join(', ')}`,
    noHeart: 'Нужно бросить в круг сердцевину Ярколета (огненного цветка) — тогда встаньте в круг снова',
    noMana: (n) => `Не хватает маны: нужно ${n}`,
    darkDone: '🤍 Белый свет окутал вас: тёмные заклинания против вас теперь вдвое слабее',
    fireDone: '🛡️ Огонь вас больше не берёт — только адский огонь ещё жжёт (но не поджигает), а огненный змей жжёт вдвое слабее',
    darkLost: '🜏 Тьма в вас стала слишком сильной — защита от тёмной магии ушла',
    darkLostBroken: '🜏 Защита от тёмной магии ушла: на вас метка слома магической защиты',
    breakRefused: 'У вас есть защита от тёмной магии — метка слома магической защиты ей противоположна: можно иметь только одну',
};

/** ON WHOM / ON WHAT (CLAUDE.md): who the gifts act on (only the hero who stands in the circle) and what the circles do to the rest. */
export const RESIST_TARGETS = {
    me: { does: 'gift', why: 'герой в белом круге платит 150 маны и получает дар навсегда (до смерти); тёмные заклинания по нему вдвое слабее / обычный огонь его не берёт' },
    players: { does: 'gift', why: 'в сети каждый платит и получает дар на своём компьютере; удар по нему режется там же, где он принят (Combat.damage), хосту знать не нужно' },
    zombies: { does: 'none', why: 'на существ круг не действует' },
    castlePeople: { does: 'none', why: 'жителей не пугает: белая магия' },
    animals: { does: 'none', why: 'не действует' },
    items: { does: 'use', why: 'три цветка (или сердцевина Ярколета) сгорают в круге — по одному на дар; остальные вещи на круге не трогаются' },
    spells: { does: 'cut', why: 'тёмные заклинания по герою вдвое слабее (DARK_SPELLS); обычный огонь ничего не делает, адский (Hellfire, лава) бьёт полностью, змей — вдвое слабее; поджечь не может ни тот, ни другой' },
};
