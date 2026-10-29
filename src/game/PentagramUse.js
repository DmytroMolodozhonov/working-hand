/**
 * PentagramUse.js — what standing on the good pentagrams does (pure rules, node-testable; the game part is Pentagranium.js).
 * The author's words: «нарисовал один раз — потом остаётся на земле навсегда и пользоваться можно сколько угодно раз. Встаёшь на неё (в круг),
 * платишь 50 маны». Nothing is said: one just stands in the circle.
 *
 *  teleport  — two pentagrams, the first and the second drawn (any distance apart): 3 s of standing still, 50 mana, a glowing ring, and the
 *              hero is on the pair. No pair: «Нужна вторая точка…». No mana: nothing is paid, nothing happens.
 *  life      — 50 mana: the health is full again, the bleeding stops (the dead are not raised). Full health: nothing is paid.
 *              Every USE.LIFE_CD seconds at most (step off and back on, or be hurt again).
 *  mend      — the worn armour is mended to full, each piece for its own price (MEND_COST); magic pieces first, then the plain; what the
 *              mana does not reach stays as it was; whole pieces cost nothing.
 *
 * ON WHOM / ON WHAT: see PENTAGRAM_USE_TARGETS.
 */

export const USE = {
    COST: 50, // mana for teleport and life (the rite of the devil pentagram too: PentagramRules)
    TELEPORT_HOLD: 3, // s standing still before the jump
    LIFE_CD: 10, MEND_CD: 10, // s between two uses on the same pentagram
    PERM_MAX: 24, // permanent pentagrams in the world (the oldest goes out): the frame's budget
    INSIDE_K: 0.85, // standing this near the middle (of the radius) counts as «in the circle»
    STILL: 0.6, // m: stepping this far from where the countdown began cancels the teleport
};

/** The price of mending one piece: by its kind, a magic piece twice a plain one (the author: «обычный шлем 10, магический 20…»). */
export const MEND_COST = { helmet: { plain: 10, magic: 20 }, chest: { plain: 20, magic: 40 }, legs: { plain: 15, magic: 30 } };
export const mendPrice = (it) => MEND_COST[it?.piece]?.[it?.magic ? 'magic' : 'plain'] ?? 0;

/**
 * What to mend with `mana`: `worn` {slot: piece|null}, `maxOf(piece)` its full points. Magic pieces first (dearer first), then the plain;
 * a piece the mana does not reach stays as it was and the next, cheaper, one may still be mended.
 * @returns {{fix: string[], short: string[], cost: number}} slots mended / left unmended for want of mana / the total price
 */
export function mendPlan(worn, mana, maxOf, free = false) {
    const hurt = Object.entries(worn || {}).filter(([, it]) => it && it.kind === 'armor' && (it.hp ?? maxOf(it)) < maxOf(it));
    hurt.sort(([, a], [, b]) => (b.magic ? 1 : 0) - (a.magic ? 1 : 0) || mendPrice(b) - mendPrice(a));
    const fix = [], short = [];
    let left = mana, cost = 0;
    for (const [slot, it] of hurt) {
        const c = mendPrice(it);
        if (free || c <= left) { fix.push(slot); if (!free) { left -= c; cost += c; } } else short.push(slot);
    }
    return { fix, short, cost };
}

/** A new teleport pentagram `m` ({id, by, pair}) takes the latest unpaired one of the same owner as its pair (the first and the second). @returns the partner or null */
export function pairUp(marks, m) {
    let mate = null;
    for (const o of marks) if (o !== m && o.pent === 'teleport' && !o.pair && o.by === m.by) mate = o;
    if (!mate || m.pent !== 'teleport') return null;
    mate.pair = m.id; m.pair = mate.id;
    return mate;
}

/** Texts for the person (what the hint says when the use does not go). */
export const USE_HINT = {
    noMana: 'Не хватает маны: нужно 50',
    noPair: 'Нужна вторая точка: создайте вторую пентаграмму телепортации («Pentagranium Teleportis»)',
    full: 'Здоровье и так полное',
    whole: 'Броня целая — чинить нечего',
    noLand: 'Там, куда вы идёте, земля ещё не готова — подождите немного',
    stepped: 'Вы сошли с круга — телепортация отменена',
};

export const PENTAGRAM_USE_TARGETS = {
    me: { does: 'use', why: 'герой встаёт в круг: платит 50 маны (броня — по частям), получает свою пользу' },
    players: { does: 'use', why: 'в сети каждый пользуется на своём компьютере и платит сам; другие видят свет и кольца (сообщение pgm)' },
    zombies: { does: 'none', why: 'на существ не действует: пользуются только герои' },
    castlePeople: { does: 'none', why: 'жителей не лечит, не чинит и не телепортирует' },
    animals: { does: 'none', why: 'не действует на животных' },
    sailors: { does: 'none', why: 'не действует' },
    spider: { does: 'none', why: 'не действует' },
    livingTrees: { does: 'none', why: 'не действует' },
    bookBirds: { does: 'none', why: 'не действует' },
    iceCastle: { does: 'none', why: 'не действует' },
    dragon: { does: 'none', why: 'не действует' },
    phoenix: { does: 'none', why: 'не действует' },
    owl: { does: 'none', why: 'не действует' },
    canary: { does: 'none', why: 'не действует' },
    spencer: { does: 'none', why: 'не действует' },
    custom: { does: 'none', why: 'не действует' },
    items: { does: 'mend', why: 'починка брони — только той, что надета на герое; вещи на земле не трогает' },
    ground: { does: 'stay', why: 'постоянные: остаются навсегда (сохраняются), гаснут, если землю под ними изменили; не больше PERM_MAX на мир — самая старая гаснет' },
    spells: { does: 'none', why: 'заклинания и удары сквозь пентаграмму идут как обычно' },
};
