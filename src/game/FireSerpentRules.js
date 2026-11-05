/**
 * The fire serpent of «Let the Hellfire Come» — its rules (pure, no THREE): the numbers, the words, who/what it acts on,
 * what the spells do to it, and how a wizard (NPC) weighs it among his foes.
 *
 * The author (31.10 / 01.11 / 05.11): while one's own «Let the Hellfire Come» burns, a shout «Serpent» (English only) — out of the
 * fire rises a huge serpent made of the fire itself (as tall as the pentagram's monster), where the wand points; it is a spell
 * of its own on top of the Hellfire (never both at once): to call it one must HAVE 350 mana; while it lives the Hellfire's
 * drain per second is doubled (two spells held at once). Black magic: +10 to the dark level. It pours out of the fire once,
 * then lives on its own beside its master: lies, crawls about him like a snake, rests and watches (05.11); «Атак» at someone — it bites and sets on fire; at a place — it goes there and burns everything; it fights
 * one-on-one; «Firefighting Maxima» on it puts it out. A helper: it defends its master when he is really attacked.
 * Wizards: a weak one runs from it, a strong one fights it.
 */
export const SERPENT = {
    NAME: 'FireSerpent',
    NEED_MANA: 350, // mana one must HAVE at the call (the author 05.11: «нужно иметь 350 маны»)
    COST: 60, // mana at once (the rest: the doubled Hellfire drain)
    DRAIN_K: 2, // the Hellfire's drain ×2 while the serpent lives
    DARK: 10, // +10 to the dark level at the call (black magic)
    // (the author 05.11, the second time: «он больше раза в 3, наверное… а может, в 5… он больше как бы лежит, а не стоит… один раз вылез из
    //  огня… и потом сам живёт своей жизнью рядом с тобой… и ползает» — the serpent of Dumbledore and Voldemort's duel: a river of fire)
    SEGS: 64, // rings of the body (head last; the video card places them — ≤ 64: the uniforms' room)
    SEG_LEN: 3.0, // m between rings (~190 m of body)
    R_BODY: 5.2, // m: the body's radius at its thickest (~10 m through)
    HEAD_H: 12, // m: the head raised over the ground (a cobra's neck: the body lies, only the front rears)
    CRAWL_LIFT: 0.6, // how much of HEAD_H the head is up while it crawls (resting / watching: 1, rearing to strike: 1.5)
    NECK: 10, // rings of the neck that rise from the lying body to the head
    HEAD_LEN: 16, // m: the head, nose to the back of the skull
    WANDER: 75, // m: it crawls round its master within this (wide: ~190 m of body lies in long loops, never in a knot)…
    NEAR: 22, // …but never closer than this (it never crawls over its master)
    TURN_R: 26, // m: the tightest turn it makes (a body ~10 m thick bends in wide curves)
    FOLLOW: 110, // m: the master further than this — it crawls after him faster (FOLLOW_K × SPEED)
    FOLLOW_K: 2.2,
    SPEED: 8, // m/s it crawls (the head; a lunge: LUNGE)
    LUNGE: 34,
    GROW_S: 8, // s it pours out of the fire (the whole body crawls out of the blaze)
    BITE: 20, // a bite (the author 05.11: «укус должен быть 20» — black magic) + set on fire at once
    // the author 05.11: «может поднимать игрока, как плотоядное растение… хватать и бросать… проходит сквозь существо — огонь вдвойне…
    // поднять и проглотить — он пройдёт по кишечнику и упадёт, всё это время горит. Несколько видов атак»
    ATTACKS: { bite: 0.34, through: 0.24, toss: 0.22, swallow: 0.2 }, // how often it strikes so (grabbing ones only at what it can lift)
    GRAB_BITE: 10, // the jaws closing on what it lifts
    LIFT_S: 1.3, // s it holds its prey up in its jaws (shaking it)
    TOSS_V: 17, // m/s it throws it away (sideways) …
    TOSS_UP: 9, // … and up
    GUT_S: 3.2, // s a swallowed one slides down inside the fiery body (burning) before it falls out of it (the fire is not solid)
    GUT_RINGS: 22, // rings from the head it slides through
    THROUGH_ON: 18, // m the head goes on through and beyond its target
    BITE_EVERY: 1.6,
    BITE_R: 8, // m: the jaws reach
    BURN_TICK: 0.25, // s between burns of what it touches
    HEAD_FIRE_R: 7, // m: the head is a blaze of this radius…
    BODY_FIRE_R: 5, // …the body on the ground
    SWEEP_S: 7, // s it ravages a place pointed at
    SWEEP_R: 16, // m round the place
    HP: 100, // its fire's strength
    REGEN: 5, // a second, while its Hellfire burns
    DOUSE_KNOCK: 30, // «Firefighting» (a burst) takes this…
    DOUSE_RATE: 70, // …«Firefighting Maxima» held on it, a second: it goes out in ~1.5 s
    GUARD_R: 26, // m: it defends its master from those this near
    GUARD_MS: 8000, // ms: «really attacked» — a hit on the master this recent
    SEND: 0.1, // s between network updates
    STALE: 1.5, // s without news: another computer's serpent is gone
    FADE_S: 2.4, // s it collapses into embers and steam
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * May it be called now? null = yes; else why not: 'fire' (no Hellfire of mine burns), 'alive' (one is already there),
 * 'mana' (less than NEED_MANA mana now). `enabled`: the free world's mana rules apply (Creative: never 'mana').
 */
export function serpentBlock({ enabled, mana, fire, alive }) {
    if (!fire) return 'fire';
    if (alive) return 'alive';
    if (enabled && !((mana ?? 0) >= SERPENT.NEED_MANA)) return 'mana';
    return null;
}

/** The Hellfire's drain multiplier now (×2 while the serpent lives). */
export const serpentDrainK = (alive) => (alive ? SERPENT.DRAIN_K : 1);

// «Serpent» as the Russian recognizer writes it: «серпент», «сёрпент», «сэрпент», «серпэнт», «сирпент», «сорпент»…
// (never «серпантин» — a mountain road, never «серп» — a sickle)
const SERPENT_W = /^(?:с[еёэио]р?п[еэаи]н[тд]с?|сёрпн?т|serpents?|serpentis|serpant|sirpent)$/;

/** Was «Serpent» (or «Fire Serpent», «Serpentis») said? English only (the author). */
export function serpentWords(text) {
    const w = String(text || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я]+/).filter(Boolean);
    if (!w.length || w.length > 4) return false; // (a sentence is not a call)
    return w.some((x) => SERPENT_W.test(x));
}

/**
 * Who/what the serpent acts on (CLAUDE.md: the table «кто/что × как действует»). Its body and head are the Hellfire's own
 * blaze (Hellfire._burn): every creature burns as in the Hellfire; the bite adds BITE and sets the bitten on fire.
 */
export const SERPENT_TARGETS = {
    players: { does: 'укус −9 и поджигает; тело жжёт как адский огонь; хозяина не жжёт (он им правит)', net: 'игрока решает его компьютер' },
    zombies: { does: 'укус и огонь — горят', net: 'хост' },
    villagers: { does: 'укус, огонь; бегут от него (страх как от адского огня); рыцари бьются', net: 'хост' },
    wizards: { does: 'слабые (младшие) бегут, сильные бьют его льдом/водой; укус и огонь', net: 'хост' },
    animals: { does: 'укус и огонь, бегут', net: 'хост' },
    sailors: { does: 'укус и огонь на палубе', net: 'хост' },
    spider: { does: 'укус ×2 (огонь)', net: 'хост' },
    livingTrees: { does: 'огонь — единственное, что убивает живое дерево', net: 'хост' },
    dragons: { does: 'не действует: дракону огонь нипочём (DragonKinds.FIRE_KINDS), но злит', net: 'хост' },
    phoenixes: { does: 'не действует: рождён из огня', net: 'хост' },
    iceCastle: { does: 'ледяные тают сильнее всего (×3,5); Королева — тоже огонь (IceQueen.FIRE_K)', net: 'хост' },
    tarons: { does: 'не действует: адский огонь — их собственный', net: 'хост' },
    ghosts: { does: 'не действует: огонь проходит сквозь', net: 'хост' },
    diabolos: { does: 'не действует: его же огонь — только злит', net: 'хост' },
    gargoyles: { does: 'адская горгулья боится только адского огня — бежит', net: 'хост' },
    bookBirds: { does: 'падают (огонь)', net: 'каждый компьютер' },
    trees: { does: 'загораются деревья, листва, трава, дерево (Fire.ignite)', net: 'каждый компьютер' },
    blocks: { does: 'камень не горит; стекло лопается; лёд Ледяного замка тает', net: 'каждый компьютер' },
    water: { does: 'в воде шипит и слабеет (как адский огонь); «Firefighting» сбивает, «Firefighting Maxima» гасит', net: 'компьютер хозяина' },
    ships: { does: 'команда горит; корпус — как от адского огня', net: 'хост' },
    wards: { does: 'купол защиты дома держит огонь и изнашивается', net: 'каждый компьютер' },
    giftsOfGods: { does: 'не действует: дары богов неразрушимы', net: '—' },
};

/**
 * A duel charge (or a spell) hit the serpent: how much of its fire it takes. It is fire, not flesh: «Авада» and the mind
 * spells pass through; cold and water hurt it most; a blow scatters the flames a little (they gather again); the gods'
 * spells end it at once (CLAUDE.md: «на то они и божественные»).
 */
export function serpentHit(spell, divine = false) {
    if (divine) return { dmg: 1e6, why: 'gods' };
    const s = String(spell || '');
    if (/^(AvadaKedavra|Imperius|ImperiusMaxima|Brainrot|BrainrotMaxima|Levitat|LevitateDuel|Expelliarmus|Die)/.test(s)) return { dmg: 0, why: 'passes' };
    if (/^(IceDuel|Ice|IceMaxima|Frozen|RodFrozen|RodIce)$/.test(s)) return { dmg: 30, why: 'cold' };
    if (/^(Waterball|WaveAttack|WaveAttackMaxima|WaterVortex|AirBubble|AirBubbleMaxima|LetItRain)/.test(s)) return { dmg: 25, why: 'water' };
    if (/^(Firefighting)$/.test(s)) return { dmg: SERPENT.DOUSE_KNOCK, why: 'water' };
    if (/^(Fire|FireMaxima|Inferno|Hellfire)/.test(s)) return { dmg: -10, why: 'feeds' }; // (fire feeds fire)
    if (/^(WindImpulse|WindImpulseMaxima|Wind|WindMaxima)/.test(s)) return { dmg: 12, why: 'wind' };
    return { dmg: 6, why: 'scatter' }; // (Jolt, Stupefy, Sapira, Bombarda…: the flames scatter and gather again)
}

// ---------------------------------------------------------------- the wizards (NPC) against several foes
/**
 * How dangerous a foe is to a wizard (the author 01.11: «самые опасные — ближайшие или кто первым напал; в целом игрок —
 * приоритет; слабого, маленького помощника — сначала, потом игрока»). f: {kind: 'player' | 'serpent' | 'tree' | 'servant',
 * dist (m), hitMe (s since he hit me, or null), first (he struck first), small (a weak little helper), hp (0…1)}.
 * Higher — answer him first.
 */
export function threatScore(f) {
    const base = f.kind === 'player' ? 10 : f.kind === 'serpent' ? 9 : f.kind === 'tree' ? 6 : 5;
    let s = base;
    s += clamp(14 - (f.dist ?? 30) * 0.5, -4, 12); // (the nearest is the most dangerous)
    if (f.hitMe != null && f.hitMe < 6) s += 8 - f.hitMe; // (the one hitting me now)
    if (f.first) s += 3; // (who began it)
    if (f.small) s += 7 * clamp(1 - (f.hp ?? 1) + 0.4, 0, 1); // (a little helper first: one blow and it's out of the way)
    return Math.round(s * 100) / 100;
}

/** The foe a wizard answers first (the list of foes as threatScore takes them) — the index, or −1. */
export function pickThreat(foes) {
    let best = -1, bs = -Infinity;
    for (let i = 0; i < (foes?.length || 0); i++) {
        const s = threatScore(foes[i]);
        if (s > bs) { bs = s; best = i; }
    }
    return best;
}

/**
 * The serpent near a wizard of `rank` (WizardMind ranks): 'flee' — a junior or a middle one without the mana, or a strong one
 * nearly spent; 'fight' — strike it (cold, water); null — it is far. (The author: «слабый — убегает, сильный — бьётся».)
 */
export function serpentResponse({ rank, mana, dist, hpK = 1 }) {
    if (!(dist < 40)) return null;
    const level = { novice: 1, adept: 2, teacher: 3, elder: 3, master: 4 }[rank] || 2;
    if (level <= 1) return 'flee';
    if (level === 2) return (mana ?? 0) >= 40 && hpK > 0.5 ? 'fight' : 'flee';
    return (mana ?? 0) >= 15 && hpK > 0.25 ? 'fight' : 'flee';
}

/** The body's radius at ring `i` of `n` (0 the tail … n−1 the head): thin tail, thick middle, the neck, the wide head. */
export function serpentRadius(i, n = SERPENT.SEGS) {
    const k = i / (n - 1);
    if (k > 0.95) return SERPENT.R_BODY * (0.78 - (k - 0.95) * 6); // (inside the skull: the head is drawn by its own shape)
    if (k > 0.88) return SERPENT.R_BODY * 0.8; // (the throat under the head: a thick neck, no strand — the author 05.11)
    if (k > 0.75) return SERPENT.R_BODY * (1 - (k - 0.75) * 1.5); // (the neck, a little slimmer than the body)
    return SERPENT.R_BODY * Math.max(0.12, Math.sin(Math.min(1, k / 0.5) * Math.PI * 0.5) ** 0.9); // (from the tail thickening)
}
