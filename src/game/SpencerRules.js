/**
 * SpencerRules.js — the bird of Spencer: numbers and the table «who / what» (pure, node-testable; the creature is SpencerBirds.js, the look —
 * fx/InvisibleModels.js).
 *
 * The author: a small flying bird, ALWAYS invisible; whoever has gone through the pentagram of seeing (SecondSight.js) sees it — rose-pink and
 * glowing. It appears about as often as the ordinary book-birds (4 near a hero, one more tried every 6 s) but ONLY near a player who sees the
 * invisible (nobody else could ever meet it). It does nothing special: flies from tree to tree, perches, sings. A mind can go into it («Империус
 * Максима»). Killed, it leaves ONE feather (also invisible), the ingredient of the pentagram of seeing — and it is sold in the market of magic things.
 */

export const SPENCER = {
    HP: 3,
    NEAR: 4, // birds round one seer (the same as the book-birds: BookBirds BIRDS)
    MAX: 12, // in all (several seers apart)
    SPAWN_T: 6, // s between two tries (the book-birds: 6)
    SPAWN_R: [38, 80], // m from the seer a new one appears
    ALT: [4.5, 13], // m above the ground it flies
    SPEED: 5.4, // m/s
    FORGET: 170, // m: farther than this from every seer it is put away (nothing piles up)
    PERCH: [3, 8], FLY: [9, 22], // s on a perch / in the air
    CHIRP: [4, 11], // s between two songs
    BODY_R: 0.32, // m: its body for hits
    FLEE_T: 3.5, // s of a startled flight
    FEATHERS: 1, // dropped when it is killed
};

/**
 * What a harm does to it. `kind` is the name the world gives a blow / a spell ('melee', 'arrow', 'Bombardo', 'Lightning', 'Inferno',
 * 'AvadaKedavra', 'Wind'…); `dmg` how much. → 'die' | 'hurt' | 'flee' | 'none'.
 *   gentle ones (a gust, «Левиоса», a pull, a disarming charge) only startle it: it slips away;
 *   anything that really harms (a blow, an arrow, a blast, fire, cold, lightning, a deadly charge) kills it at its HP (3), else hurts and startles;
 *   a harm of 0 startles.
 */
export const GENTLE = new Set(['Wind', 'WindMaxima', 'Levitation', 'LevitateDuel', 'Expelliarmus', 'Disarmor', 'Accio', 'Lumos', 'Reveal', 'Draw', 'Up']);
export function verdict(kind, dmg, hp = SPENCER.HP) {
    if (GENTLE.has(kind)) return 'flee';
    if (!(dmg > 0)) return 'flee';
    return dmg >= hp ? 'die' : 'hurt';
}

/** The duel charges: what each does to the bird (every charge that harms is deadly for so small a body). */
export const DUEL_DEADLY = new Set(['AvadaKedavra', 'Stupefy', 'IceDuel', 'SapiraDuel', 'SandsDuel', 'Jolt', 'JoltMaxima']);

/** ON WHOM / ON WHAT (CLAUDE.md «кто/что»): how every spell and blow acts on the bird (SpencerBirds.hit / hitAt / hitRay / boltHit). */
export const SPENCER_TARGETS = {
    melee: { does: 'die', why: 'удар рукой, мечом или топором убивает (тельце хрупкое); касание вскользь — вспугивает' },
    arrow: { does: 'die', why: 'стрела убивает' },
    blast: { does: 'die', why: 'взрыв («Бомбардо», «Бум», Total Destruction, «Хеллфайр») в радиусе убивает — птичку не видят, но она есть' },
    fire: { does: 'die', why: 'огонь («Инферно», «Файр») сжигает; перо при этом не сгорает — выпадает на землю' },
    cold: { does: 'die', why: 'лёд и холод («Айс», «Фроузен») убивают' },
    lightning: { does: 'die', why: 'молния и «Тандервейв» убивают' },
    duel: { does: 'die', why: 'дуэльный заряд («Авада», «Остолбеней», «Сапира», «Джолт»…) убивает; «Экспеллиармус», «Левиоса» — только вспугивают' },
    wind: { does: 'flee', why: '«Вайнд» и порывы сдувают, птичка улетает, не пострадав' },
    levitation: { does: 'flee', why: '«Левиоса» не удерживает: она выскальзывает и улетает' },
    water: { does: 'flee', why: 'вода вспугивает, не убивает (она улетает)' },
    imperius: { does: 'take', why: 'в неё можно вселиться заклинанием «Империус Максима» (только Максима, и только тот, кто видит невидимое — иначе её не найти взглядом)' },
    brainrot: { does: 'none', why: '«Брейнрот» на неё не действует: слишком мала для приказов' },
    protection: { does: 'none', why: 'щит и защита её не касаются' },
};

/** Who may hear the bird sing and see it: only a seer (Invisibles.seesInvisible). The bird itself is "who/what" of the registry — see Invisibles.INVISIBLE_WORLD. */
export const SPENCER_TALK = ['Чик-чирик!', 'Тирлю-лю…', 'Фьють!'];
