/**
 * FirmRules.js — «Pentagranium Firmitas»: the white pentagram of absolute steadiness (pure, node-testable; the game part is Firmitas.js, the circle
 * itself is Pentagranium.js, the flag lives in Steadiness.js).
 *
 * The author: «Создаёшь её, становишься на неё, платишь 300 маны — и получаешь навсегда абсолютную устойчивость. Неважно, сколько устойчивости было до
 * этого: теперь абсолютная — от ВСЕГО. От любого падения, даже с 500 метров. От любого заклинания — Wind, Wind Maxima, неважно. Но нужно ещё положить на
 * метку ВОЛШЕБНЫЙ КАМУШЕК — он пропадает. Камушек выпадает из существ, которые живут на болотах — маленькие, типа карлики (Канарики)».
 *
 * What «absolute» means (Steadiness.absolute): the hero is never knocked off their feet and never staggers into the air — no spell (Wind, Wind Maxima,
 * Inspirius, Bombardo Maxima, the gods' spells, Levitation's throws, the vortices), no fall from any height (the damage of the fall stays as it was: it
 * is a matter of the body, not of balance), no blow of a beast. A push still moves the body, but only as much as it moves a man standing firm
 * (`PUSH_K` of it) and never throws it into the air (no toss). Not covered (they are no loss of balance): «Остолбеней» (the stun lays the body
 * down), «Авада» (death), ice (frozen stiff), swimming. The gift is for good — until death: a death takes it into the body (Legacy.js), «Give Me My
 * Power» brings it back; saved with the hero.
 * In Creative nothing is paid and no pebble is used up, but the circle must still be stood in.
 */

export const FIRM = {
    COST: 300, // mana, paid when the hero stands in the circle with the pebble lying on it
    ITEM: 'magicPebble', // the pebble that is used up
    PUSH_K: 0.25, // a push moves a firm body this much of what it moves another
    ANIM_T: 4.2, // s of the rite
    SHAKE: 0.45, // the ground's tremble at the flash
};

/** Kinds of knock-down that even absolute steadiness does not stop (no matter of balance: sleep, death). */
export const ABSOLUTE_EXEMPT = new Set(['Stupefy', 'avada']);

/** Does absolute steadiness stop this knock? `kind`: the spell or kind (BodyImpact / Knockdown). */
export const absoluteStops = (kind) => !ABSOLUTE_EXEMPT.has(kind);

/**
 * The pebble lying still in the circle: `loose` [{uid, item, rest}] already filtered to the circle. → the first with ≥ 1 pebble, or null. Pure.
 * (It must LIE on the mark: the author says «положить на метку» — one in the bag or in the hand does not count.)
 */
export function findPebble(loose = []) {
    for (const L of loose) if (L?.item && L.item.kind === FIRM.ITEM && (L.item.count ?? 1) >= 1 && L.rest !== false) return L;
    return null;
}

/** Texts for the person (what the hint says). */
export const FIRM_HINT = {
    have: 'Вы уже стоите неколебимо — второй раз не нужно',
    noMana: (n) => `Не хватает маны: нужно ${n}`,
    noPebble: 'Положите на пентаграмму волшебный камушек (его носят болотные карлики — канарики) и встаньте в круг',
    done: '🗿 Вы стали неколебимым: теперь вас не повалит ни ветер, ни заклинание, ни падение — до самой смерти',
    lost: '🗿 Неколебимость уходит вместе с жизнью',
    stood: '🗿 Вы устояли',
};

/** ON WHOM / ON WHAT — what standing in this circle does (CLAUDE.md): only to the hero in the circle. */
export const FIRM_TARGETS = {
    me: { does: 'gift', why: 'герой в круге платит 300 маны и отдаёт камушек — и навсегда (до смерти) его не сбить с ног: абсолютная устойчивость от всего' },
    players: { does: 'gift', why: 'в сети каждый платит и получает дар на своём компьютере; остальные видят свет обряда (сообщение pgm fx) и то, как герой стоит неколебимо (поза «устоял», флаг ab)' },
    zombies: { does: 'none', why: 'на существ не действует: круг даёт устойчивость только герою' },
    castlePeople: { does: 'none', why: 'жителям устойчивости не даёт' },
    animals: { does: 'none', why: 'не действует' },
    sailors: { does: 'none', why: 'не действует' },
    spider: { does: 'none', why: 'не действует' },
    livingTrees: { does: 'none', why: 'не действует' },
    bookBirds: { does: 'none', why: 'не действует' },
    iceCastle: { does: 'none', why: 'не действует; удары Ледяной Королевы по неколебимому идут как обычно, но с ног не валят (заморозка — не потеря равновесия, она остаётся)' },
    dragon: { does: 'none', why: 'не действует' },
    phoenix: { does: 'none', why: 'не действует' },
    owl: { does: 'none', why: 'не действует' },
    canary: { does: 'none', why: 'не действует; камушек падает из канариков (CanaryRules.PEBBLE)' },
    items: { does: 'use', why: 'волшебный камушек, лежащий на пентаграмме, растворяется светом — один на обряд; в сумке или в руке он не считается' },
    ground: { does: 'stay', why: 'постоянная: остаётся (сохраняется), как пентаграммы зрения; гаснет, если землю под ней изменили' },
    spells: { does: 'none', why: 'заклинания и удары сквозь пентаграмму идут как обычно' },
};
