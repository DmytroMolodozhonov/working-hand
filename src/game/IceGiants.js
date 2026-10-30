/**
 * IceGiants.js — the pure rules of the Ice Castle's fight (no THREE: tests and the worker can read it):
 *
 *  1. THE MELTING of the ice giants (the queen's ice monsters) and the evil snowmen. The author: «Когда я использую Инферно или любые
 *     заклинания, связанные с огнём, ледяные гиганты (и снеговики) должны СРАЗУ становиться меньше. Могут уменьшаться медленнее, не
 *     так быстро, как сейчас, когда я их убиваю. Но с каждым разом всё меньше и меньше, и меньше урона наносят с каждым разом: вначале
 *     очень сильные, потом всё слабее. Адский огонь в 2 раза эффективнее против них.»
 *     A creature has a `melt` 0…1; its size is 1 → MELT.MIN (0.3) along it; the fire fills it up, a table (MELT_STEPS) says how
 *     strong it still is; only when it is at the least size can the fire kill it.
 *  2. THE QUEEN'S TACTICS: freeze from afar (10…24 m), then — if the freeze took — run up fast, the rod grows into a blade in her hand,
 *     and she breaks the frozen one. The Protection / Protection Maxima hold all of it (the table QUEEN_VS).
 */

// ================================================================ the melting
export const MELT = {
    MIN: 0.3, // the least size (a share of the full one): below it the fire kills instead of shrinking
    TICK: 0.15, // s: a creature takes the fire's effect at most this often (a stream of flame calls every frame — the melting must not depend on it)
    POOL: { monster: 75, snowman: 20 }, // fire power (damage × MELT_K) that melts a creature from its full size down to the least
    HP_SHARE: 0.35, // while it is still shrinking the fire takes this share of its HP (and never the last one: it cannot die before it is least)
    HOT: 2.5, // s: steam keeps rising from it after the last fire
};

/**
 * How well each kind of fire melts the ice (relative to «Инферно» = 1). The Hellfire is twice the «Инферно» (the author), the great
 * fire of Fire Maxima and a dragon's flame a little more, a campfire's spark or a torch much less.
 */
export const MELT_K = { fire: 0.5, burn: 0.5, Fire: 0.5, Campfire: 0.4, Inferno: 1, FireMaxima: 1.4, Hellfire: 2, heat: 0.15, dragonFire: 1.4, phoenixFire: 0.5, torch: 0.35 };

/**
 * The stages of the melting: at `at` of the way down (0 whole … 1 the least) it hits for `dmg` of its full blow, walks at `speed` of its
 * pace, and its blow reaches `reach` of its full reach. Between two rows — in between (meltStats). «Вначале очень сильные, потом
 * всё слабее».
 */
export const MELT_STEPS = [
    { at: 0.0, dmg: 1.0, speed: 1.0, reach: 1.0, name: 'ледяной великан' },
    { at: 0.2, dmg: 0.82, speed: 0.95, reach: 0.95, name: 'подтаявший великан' },
    { at: 0.4, dmg: 0.62, speed: 0.9, reach: 0.9, name: 'тающий великан' },
    { at: 0.6, dmg: 0.46, speed: 0.85, reach: 0.85, name: 'оплывший великан' },
    { at: 0.8, dmg: 0.36, speed: 0.8, reach: 0.8, name: 'ледяная глыба' },
    { at: 1.0, dmg: 0.3, speed: 0.75, reach: 0.75, name: 'ледяной обломок' },
];

/** Is `kind` a fire the ice melts under (and how much)? 0: not a fire. */
export const meltK = (kind) => MELT_K[kind] || 0;

/** The size (1 … MELT.MIN) of a creature that has melted `melt` (0…1) of the way. */
export const meltScale = (melt) => 1 - (1 - MELT.MIN) * Math.max(0, Math.min(1, melt || 0));

/** How much further a hit of fire melts a creature of `type` ('monster' | 'snowman'): `dmg` before the creature's weakness to fire. */
export function meltGain(type, kind, dmg) {
    const pool = MELT.POOL[type], k = MELT_K[kind];
    if (!pool || !k || !(dmg > 0)) return 0;
    return (dmg * k) / pool;
}

/** What a creature that has melted `melt` of the way can still do: {scale, dmg, speed, reach, stage, name}. */
export function meltStats(melt) {
    const m = Math.max(0, Math.min(1, melt || 0));
    let i = 0;
    while (i < MELT_STEPS.length - 2 && m >= MELT_STEPS[i + 1].at) i++;
    const a = MELT_STEPS[i], b = MELT_STEPS[i + 1];
    const t = (m - a.at) / (b.at - a.at);
    const mix = (k) => a[k] + (b[k] - a[k]) * t;
    const scale = meltScale(m);
    return { scale, dmg: mix('dmg'), speed: mix('speed'), reach: mix('reach'), stage: i + (t >= 1 ? 1 : 0), name: (t >= 0.5 ? b : a).name };
}

/** The stage number (0…5) of a melt — the sounds and the words change with it. */
export const meltStage = (melt) => {
    const m = Math.max(0, Math.min(1, melt || 0));
    let s = 0;
    for (let i = 0; i < MELT_STEPS.length; i++) if (m >= MELT_STEPS[i].at - 1e-9) s = i;
    return s;
};

/**
 * The fire hits an ice giant / snowman: → {melt, hp, hurt}. `fireDmg` is what the fire does to it by IceQueen.iceDamage (its weakness
 * included). While it is not at the least size the fire shrinks it and takes only MELT.HP_SHARE of that from its HP, never the last
 * point (the author: «убийство — после минимального размера»); at the least size it is a plain blow.
 */
export function applyFire(type, kind, rawDmg, fireDmg, melt, hp) {
    const gain = meltGain(type, kind, rawDmg);
    const next = Math.min(1, melt + gain);
    if (next >= 1 && melt >= 1) return { melt: 1, hp: hp - fireDmg, grew: 0 };
    const take = fireDmg * MELT.HP_SHARE;
    return { melt: next, hp: Math.max(Math.min(hp, 1), hp - take), grew: next - melt };
}

// ================================================================ the queen's fight
export const QUEEN_AI = {
    KEEP_MIN: 10, KEEP_MAX: 22, // m: she holds this distance from her foe (by his edge) while she shoots
    FREEZE_MIN: 10, FREEZE_MAX: 24, // m: the rod's freeze is thrown from here (not point blank)
    FREEZE_T: 5, // s: a player frozen by her
    FREEZE_GAP: 7, // s: between two freezes (and a foe that held it off is left to the other spells)
    CHARGE_SPEED: 10, // m/s: she skates up to a frozen one (her walk is 2.6)
    CHARGE_RANGE: 24, // m: nearer than this when he froze, and she goes for him
    STRIKE: 8.5, // m: the blade's reach from her feet to the foe's edge
    GROW: 0.8, // s: the rod grows into a blade
    WINDUP: 0.5, // s: the blade raised before the blow
    SHEATH: 6, // s: after the blow (or if the foe is gone) the blade turns back into the rod
    BLADE_DMG: 18, // HP: the blade on one who is not frozen (the armour and the shield stand in the way)
    BLADE_LEN: 2.4, // the blade's length in rod units (the rod is 1.45; the queen holds it ×1.9, she herself ×1.5)
    LOSE_SIGHT: 1.6, // s: a foe lost behind a wall is still where she last saw him for this long (no turning back at every step)
    GATE_ZONE: 9, // m: from the gate — the gateway's neighbourhood (no sidestepping beside the wall)
    EVADE: 0.55, // chance per second that she sidesteps while she keeps her distance
    ARMOR_CUT: 0.6, // magic armour / a magic robe with a reserve: the freeze is this share of its time (the reserve is spent)
};

/** How long a freeze of the queen lasts on one in `armor` ('magic' = a magic set or a robe with a reserve left). */
export const freezeSeconds = (T, magic) => (magic ? T * QUEEN_AI.ARMOR_CUT : T);

/**
 * Where she stands to her foe: 'near' (closer than KEEP_MIN: she steps back), 'ok', 'far' (she goes closer). d — to his edge.
 */
export function rangeBand(d) {
    return d < QUEEN_AI.KEEP_MIN ? 'near' : d > QUEEN_AI.KEEP_MAX ? 'far' : 'ok';
}

/** May she throw the rod's freeze at a foe d m away (a freeze came `since` seconds ago, or never)? */
export const mayFreeze = (d, since) => d >= QUEEN_AI.FREEZE_MIN && d <= QUEEN_AI.FREEZE_MAX && (since == null || since >= QUEEN_AI.FREEZE_GAP);

/** Does she run up to a foe frozen for `left` more seconds, d m away? (She must arrive and swing before he thaws.) */
export function chargeOn(d, left) {
    if (!(left > 0.8) || d > QUEEN_AI.CHARGE_RANGE) return false;
    const travel = Math.max(0, d - QUEEN_AI.STRIKE + 1) / QUEEN_AI.CHARGE_SPEED;
    return travel + QUEEN_AI.WINDUP + 0.25 < left;
}

/** How far the blade has grown (0 rod … 1 blade) when she has been charging `t` s / is within `d` m of her foe. */
export function bladeGrow(t, d) {
    const byTime = Math.min(1, t / QUEEN_AI.GROW);
    const byDist = d < QUEEN_AI.STRIKE + 6 ? 1 : 0;
    return byDist ? byTime : Math.min(byTime, 0.55); // (the last metres she is sure of it: the blade is out)
}

/** What her blow does to one standing before her: 'shatter' (frozen: broken to pieces), 'cut' (BLADE_DMG), or 'held' (the shield took it). */
export function bladeResult(foe) {
    if (foe.held) return 'held';
    return foe.frozen ? 'shatter' : 'cut';
}

/**
 * «Кто/что × как действует» for the QUEEN'S OWN attacks on a player (the author: «Королева не должна мочь пробить Protection или
 * Protection Maxima, но пробивает магическую мантию»). One table for the freeze, the shards, the spikes, the gust, the blade.
 */
export const QUEEN_VS = {
    protection: { does: 'held', why: '«Protection» перед вами держит заморозку, льдины, шипы, вьюгу и клинок Королевы: вспышка, она платит половину маны заклятия; не хватило маны — щит разбит и удар идёт дальше' },
    protectionMaxima: { does: 'held', why: '«Protection Maxima» (купол) держит всё то же со всех сторон и вдвое дешевле — выдерживает дольше' },
    protectionGods: { does: 'held', why: 'золотой щит богов держит всё без маны' },
    magicRobe: { does: 'pierce', why: 'магическая мантия и магические доспехи НЕ останавливают ледяной удар Королевы: он проходит, а запас прочности уходит по цене заклинания; заморозка с ними короче (×0,6)' },
    plainArmor: { does: 'pierce', why: 'обычный доспех её лёд не держит; заморозка — как есть' },
    rodHolder: { does: 'pierce', why: 'Ледяной Жезл в руках игрока Королеву не защищает: её лёд — тот же, божественный; но «Protection» перед ней держит и его' },
    frozen: { does: 'shatter', why: 'замороженного клинок разбивает насмерть («Вас разбил жезл Королевы»); если заморозка не прошла — клинок ранит на 18' },
    noShield: { does: 'shatter', why: 'без щита: заморозка издали, бег, клинок. Бегите, держите «Protection» или «Protection Maxima» между собой и ею' },
    duel: { does: 'none', why: 'Дуэль, арена, корабль и космос Королеву не касаются: она живёт в своём замке' },
};

// ================================================================ blasts on the ice
/**
 * «Бомбарда и Бомбарда Максима очень сильные — должны влиять на ледяных великанов и снеговиков: разлетаться, уничтожаться или хотя бы трескаться,
 * в зависимости от структуры» (the author). What a blast does to each, by how near its centre it was (`dmg` is the spell's own number: the peak at
 * the centre, falling to 0.3 of it at the edge — IceQueen.hitAt) and by what the thing is made of:
 *  — the evil snowman / the friendly one: packed snow — any Bombardo bursts it into lumps (the old ×3 of the spell kills it);
 *  — the ice giant: ice a few metres thick — a plain Bombardo CRACKS it (BLAST.GIANT_PLAIN of its strength at the centre; the cracks show on its body
 *    by the share of strength lost), a Bombardo Maxima takes BLAST.GIANT_MAX at the centre and BREAKS it into blocks when it is that near (SHATTER_NEAR)
 *    — or when what it has left is less than that;
 *  — «Бум», «Инспириус», «Total Destruction Максима» and every spell of the gods break whatever is made of snow or of ice at once;
 *  — the Queen: she is not torn apart (her frost is magic, not packed ice): a plain blast is a shove and a few HP, «Максима» as on anyone (a scroll spell),
 *    and either throws her back a few steps (BLAST.QUEEN_PUSH).
 */
export const BLAST = {
    PEAK: { Bombardo: 8, BombardoMaxima: 24 }, // (Damage.BlastPeak × the spell's power: its number at the very centre)
    GIANT_PLAIN: 0.1, GIANT_MAX: 0.45, SHATTER_NEAR: 0.5,
    QUEEN_PLAIN: 0.5, // (share of a plain Bombardo's own number that reaches her)
    QUEEN_PUSH: 6, GIANT_PUSH: 3, // m/s at the centre
    CRACKS: 8, // the fissures a giant's model can show
};
/** Spells that break whatever is of snow or ice at once (the gods' ones are added by the caller: GOD_SPELLS). */
export const SHATTER_KINDS = new Set(['Boom', 'Inspirius', 'TotalDestructionMaxima']);

/** Is this kind a blast (it shoves and may break)? */
export const isBlast = (kind, god = false) => kind in BLAST.PEAK || SHATTER_KINDS.has(kind) || !!god;

/**
 * What the blow `kind` of strength `dmg` does to the ice creature `type` ('monster' | 'snowman' | 'friend' | 'queen') of `max` strength.
 * → null: not a blast (the usual table decides: iceDamage), else {dmg, breaks, k}: the damage taken, whether it flies apart if this kills it,
 * k — how near the centre (0…1: the shove).
 */
export function blastVerdict(type, kind, dmg, max, god = false) {
    if (!(dmg > 0) || !isBlast(kind, god)) return null;
    const heavy = god || SHATTER_KINDS.has(kind);
    const peak = BLAST.PEAK[kind];
    const k = heavy || !peak ? 1 : Math.max(0, Math.min(1, dmg / peak));
    if (type === 'queen') {
        if (heavy) return { dmg, breaks: false, k };
        return { dmg: kind === 'Bombardo' ? dmg * BLAST.QUEEN_PLAIN : dmg, breaks: false, k };
    }
    if (type === 'snowman' || type === 'friend') return { dmg: heavy ? max : Math.max(dmg * 3, k > 0.5 ? max : 0), breaks: true, k };
    // the ice giant
    if (heavy) return { dmg: max, breaks: true, k };
    if (kind === 'Bombardo') return { dmg: max * BLAST.GIANT_PLAIN * k, breaks: true, k };
    return { dmg: k >= BLAST.SHATTER_NEAR ? max : max * BLAST.GIANT_MAX * k, breaks: true, k };
}

/** How many of its fissures a giant shows with `hp` of `max` left. */
export const crackCount = (hp, max) => (max > 0 ? Math.max(0, Math.min(BLAST.CRACKS, Math.floor((1 - hp / max) * (BLAST.CRACKS + 0.99)))) : 0);
