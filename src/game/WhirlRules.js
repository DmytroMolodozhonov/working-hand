/**
 * WhirlRules.js — «Spiralis» («Спиралис»), the duel's spell of 500 mana (pure rules; Whirl.js plays them). The author 06.11: «Во время дуэли ты выкрикиваешь это заклинание — и оба луча (твой и
 * соперника: игрока или NPC) начинают подчиняться тебе. Дуэль — просто полоса, и ты вытягиваешь её вокруг себя: она перестаёт быть ровной, становится извилистой; у соперника она отрывается от
 * палочки, и ты вокруг себя вихрем машешь двумя слившимися полосами. Не больше 10 секунд. Если резко перестал махать — заклинание врежется в тебя, и не только его, но и твоё. Нужно направить на
 * игрока (и сказать «Attack» — не обязательно): два заклинания одним лучом летят в него. Он может крикнуть заклинание — снова дуэль: так можно сделать двойную атаку. Не работает, если у кого-то
 * из двух заклинание «Дай» (Die)».
 *
 * Play: in my beam clash I say the word (500 mana; my maximum mana must be 500+) → the clash is taken over: both beams leave the two wands and meet in MY wand; I swing the arm round (the ribbon of
 * both colours whirls round me); ≤ MAX_T s. Stop swinging (a hand held calmly) AIMED at the opponent → both spells fly at him in one go (a twin charge); stop anywhere else, or never swing, or 10 s
 * pass → both spells hit ME. «Attack» said aimed (after a swing of MIN_SWING) lets them go at once.
 */
export const WHIRL = {
    COST: 500, // mana, paid at the word (Combat.SPELL_COST)
    MIN_MAX_MANA: 500, // the hero's mana maximum must be this
    MAX_T: 10, // s: the longest the beams are whirled
    START_GRACE: 2, // s after the word to begin the swing (else the beams fall back on me)
    SWING_SPEED: 5, // m/s: the wand hand's speed that counts as swinging
    STOP_GRACE: 0.5, // s of a calm hand that ends the swing
    MIN_SWING: 1.2, // s of swinging before the beams may be let go (a whirl must be raised first)
    AIM_COS: 0.9, // the wand at the opponent: the cosine of the angle (≈ 25°)
    TRAIL: 44, // points of the ribbon
    TRAIL_DT: 0.03, // s between them
};

/** The state of one whirl. */
export const newWhirl = () => ({ t: 0, swing: 0, idle: 0, started: false });

/**
 * One step of a whirl (pure). `speed`: the wand hand's speed (m/s), `aimed`: the wand points at the opponent.
 * → null (goes on) | 'release' (the beams fly at him) | 'stop' (stopped away from him) | 'idle' (never swung) | 'timeout' (10 s)
 */
export function stepWhirl(S, dt, speed, aimed) {
    S.t += dt;
    if (speed >= WHIRL.SWING_SPEED) { S.swing += dt; S.idle = 0; S.started = true; } else S.idle += dt;
    if (S.t >= WHIRL.MAX_T) return 'timeout';
    if (!S.started) return S.t >= WHIRL.START_GRACE ? 'idle' : null;
    if (S.idle >= WHIRL.STOP_GRACE) return aimed && S.swing >= WHIRL.MIN_SWING ? 'release' : 'stop';
    return null;
}

/** «Attack» said: let them go now — only aimed at him after a real swing. → 'release' | null */
export const attackNow = (S, aimed) => (aimed && S.started && S.swing >= WHIRL.MIN_SWING ? 'release' : null);

/** Does the wand (origin, unit dir) point at `target` closely enough? (plain {x,y,z}) */
export function aimedAt(origin, dir, target, cos = WHIRL.AIM_COS) {
    const dx = target.x - origin.x, dy = target.y - origin.y, dz = target.z - origin.z;
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) return true;
    return (dx * dir.x + dy * dir.y + dz * dir.z) / l >= cos;
}

/** May the whirl be started in this clash? (the spells of both sides: «Дай» — no.) → null | the reason */
export function whirlRefusal(spellA, spellB, maxMana) {
    if (spellA === 'Die' || spellB === 'Die') return '«Дай» сильнее любого вихря: с ним «Спиралис» не работает';
    if (maxMana < WHIRL.MIN_MAX_MANA) return `Нужен запас маны не меньше ${WHIRL.MIN_MAX_MANA} ячеек`;
    return null;
}

/** ON WHOM / WHAT (CLAUDE.md): the spell lives only inside a beam clash — it takes both beams; what it does to everyone. */
export const WHIRL_TARGETS = {
    me: { does: 'caster', why: 'колдует тот, кто в дуэли лучей; платит 500 маны; машет рукой; не удержал — оба заклинания врезаются в него' },
    players: { does: 'opponent', why: 'другой игрок в дуэли: его луч отрывается от палочки; он может крикнуть новое заклинание — снова дуэль; видит вихрь' },
    npcWizards: { does: 'opponent', why: 'волшебник башни/арены в дуэли: луч отрывается, он ошеломлён на пару секунд; двойной удар по нему — как по игроку' },
    zombies: { does: 'none', why: 'зомби в дуэли лучей не участвуют' },
    animals: { does: 'none', why: 'звери в дуэли лучей не участвуют' },
    bosses: { does: 'none', why: 'боссы в дуэль лучей не вступают (их свои бои); дракон/паучиха/Королева — не соперники' },
    die: { does: 'refused', why: '«Дай» у любого из двух — заклинание не работает (оно сильнее вихря)' },
};
