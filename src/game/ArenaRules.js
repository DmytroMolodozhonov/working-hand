/**
 * ArenaRules.js — the rules of the duel arena (the author's words), pure: the game (ArenaDuels.js), the
 * codex and the tests read them.
 *
 *   «Смертельные запрещены (Авада и любое смертельное). Остолбеней, отталкивающие (Вайнд, Вайнд Максима,
 *   Джолт) — можно, Экспеллиармус — спокойно, Вингардиум Левиоса — можно. Frozen, Левиоса и даже Бомбардо
 *   не запрещены, но могут ранить — главное не убить, использовать с осторожностью. Если убил — на тебя
 *   нападут другие волшебники (не все, часть), ты нарушил правила. Исключение: если он умер от падения
 *   после твоей Вингардиум Левиосы — несчастный случай, не считается.»
 *
 * A duel: two beams as ours (Duel.js). Won — the opponent's wand knocked out («Экспеллиармус») and taken
 * («Акцио» — never destroyed): the one left without a wand has lost. At most 5 minutes (nobody won — it
 * ends, a draw); no duels at night. The player signs up at the lectern by the front gate (a hand on the
 * book of duels), comes out to his mark, «3-2-1» — and a real duel with a wizard; won — 100 coins at the
 * lectern, lost — nothing. A legal fight: nobody minds the spells (CastleLife.hit → ArenaDuels.onHit).
 */

export const ARENA_DUEL = {
    MAX_T: 300, // s: a duel ends at 5 minutes, won or not (the bots' too)
    COUNT: 10, // «10…1», then «Бой!»
    REWARD: 100, // coins for beating the arena's wizard
    REST: [18, 40], // s between two duels (one pair goes, the next comes)
    FANS: [10, 18], // how many come to watch
    AVENGE: 0.45, // the share of the wizards near who attack a player who killed at the arena (never all)
    AVENGE_R: 70, // m: the wizards that far from the arena hear of it
    LIVE_R: 170, // m: a player that near the arena — it lives (the fans come, the duels go on)
    CALL_WAIT: 60, // s: a player called out who does not come to his mark — his turn is lost
    OFF_FLOOR: 12, // s: a duellist off the floor that long — gave the duel up
    FAR_FLOOR: 2.5, // m a duellist may step out over the floor's edge
    FALL_COST: 0.18, // a duellist knocked down loses this share of his mana (rounds: worn down fall by fall)
    FINISH_FRESH: 0.6, // only one this worn out (or down the 4th time) is disarmed while down; a fresher one is let up
    PRACTICE_T: 120, // s: a training fight on the field by a tower (not to the end — a training)
    PRACTICE_REST: [180, 480], // s between two trainings («иногда»)
};

/** The spells at the arena: 'ok' allowed, 'care' allowed but can wound (with care), 'banned' — a foul. */
export const ARENA_SPELLS = {
    Stupefy: { rule: 'ok', why: '«Остолбеней» — можно' },
    Jolt: { rule: 'ok', why: 'отталкивающее — можно' },
    JoltMaxima: { rule: 'ok', why: 'отталкивающее — можно' },
    Wind: { rule: 'ok', why: '«Вайнд» — можно' },
    WindMaxima: { rule: 'ok', why: '«Вайнд Максима» — можно' },
    Expelliarmus: { rule: 'ok', why: '«Экспеллиармус» — спокойно: так и выигрывают' },
    LevitateDuel: { rule: 'ok', why: '«Вингардиум Левиоса» — можно; смерть от падения после неё — несчастный случай' },
    Accio: { rule: 'ok', why: '«Акцио» — забрать выбитую палочку' },
    LiquidationDuel: { rule: 'ok', why: '«Liquidation» (дуэльный) берёт только немагическое — волшебную палочку не тронет: можно' },
    LiquidationMaximaDuel: { rule: 'care', why: '«Liquidation Максима» рассыпает палочку соперника — осторожно: свою палочку соперник получит у распорядителя после дуэли, а чужую (с арены) заклинание не берёт' },
    Protection: { rule: 'ok', why: 'щит — можно' },
    ProtectionMaxima: { rule: 'ok', why: 'купол — можно' },
    IceDuel: { rule: 'care', why: '«Айс» / Frozen — не запрещено, но может ранить' },
    Frozen: { rule: 'care', why: 'Frozen — не запрещено, но может ранить' },
    Levitation: { rule: 'care', why: '«Левиоса» — не запрещено, но падение ранит' },
    SapiraDuel: { rule: 'care', why: '«Сапира» ранит — осторожно' },
    Bombardo: { rule: 'care', why: '«Бомбардо» не запрещено: камень арены выдержит, но взрыв ранит — главное не убить' },
    BombardoMaxima: { rule: 'care', why: 'то же, вдвое сильнее — очень осторожно' },
    AvadaKedavra: { rule: 'banned', why: '«Авада Кедавра» — смертельное: запрещено' },
    Die: { rule: 'banned', why: 'смертельное: запрещено' },
    Inspirius: { rule: 'banned', why: 'смертельное: запрещено' },
    Boom: { rule: 'banned', why: 'смертельное: запрещено' },
    TotalDestruction: { rule: 'banned', why: 'смертельное: запрещено' },
    TotalDestructionMaxima: { rule: 'banned', why: 'смертельное: запрещено' },
    Hellfire: { rule: 'banned', why: 'смертельное: запрещено' },
};

/** Is this spell a foul at the arena (deadly)? */
export const isBanned = (spell) => ARENA_SPELLS[spell]?.rule === 'banned';

/**
 * What a duellist's death at the arena is: 'accident' — he fell after «Вингардиум Левиоса» (Levitation's
 * fall: `via` 'leviosa', a body's fall `kind` 'fall'), 'foul' — killed by his opponent any other way
 * (the rules broken), 'none' — not by his opponent.
 */
export function killVerdict({ byOpponent = false, via = null, kind = null } = {}) {
    if (!byOpponent) return 'none';
    if (via === 'leviosa' || kind === 'fall') return 'accident';
    return 'foul';
}

/**
 * Who of the wizards round the arena attack the one who broke the rules (the author: «не все, часть»):
 * ~AVENGE of the ones who fight, at least one, never all of them (when two or more). `list` — candidates,
 * `rng` → 0…1. Returns the chosen.
 */
export function avengers(list, rng = Math.random) {
    if (!list.length) return [];
    const n = list.length === 1 ? 1 : Math.max(1, Math.min(list.length - 1, Math.round(list.length * ARENA_DUEL.AVENGE)));
    const pool = list.slice(), out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
}

/** How a duel at time `t` (s since «go») stands: 'on', or 'draw' at the 5 minutes (nobody won — it ends). */
export const duelClock = (t) => (t >= ARENA_DUEL.MAX_T ? 'draw' : 'on');

/**
 * A duellist of the arena chooses his spell (never a deadly one): stun, the shoves, «Экспеллиармус», the
 * lift; «Айс» and «Сапира» only now and then and never at one already weak (`foeHp` ≤ 15 — «главное не
 * убить»). `finish`: the opponent can't answer now (stunned, frozen, down) — «Экспеллиармус».
 */
export function arenaSpell({ role = 'student', foeHp = 20, finish = false, player = false, last = null, foeFresh = 1, t = 0, rng = Math.random } = {}) {
    if (finish) return 'Expelliarmus';
    const strong = role === 'teacher' || role === 'master' || role === 'adept';
    // (two wizards of the arena: a disarm that hits ends the duel, so it is not thrown at a fresh one in the first minute — the author: «не так, что кинул магию,
    //  другой, и за 5 секунд всё закончилось»; the stuns, shoves, the lift and the shields make the fight, the disarm comes when the other is worn down)
    const disarm = player ? 0.22 : (foeFresh < 0.6 || t > 70 ? 0.2 : 0.03);
    // (against a player: never the hurting ones — the wizard keeps the rules better than anyone)
    const table = [
        // (the disarm mostly when the other is down — `finish`: a duel is fought first, won after)
        ['Stupefy', 0.3], ['Jolt', strong ? 0.12 : 0.16], ['JoltMaxima', strong && !player ? 0.08 : 0], ['Expelliarmus', disarm], ['LevitateDuel', 0.12],
        ['IceDuel', strong ? 0.1 : 0.05], ['SapiraDuel', foeHp > 15 && !player ? 0.06 : 0],
        // (more of a show: «Даст» slows, «Disarmor» strips the armour, the strong ones' «Айс Максима»)
        ['SandsDuel', 0.1], ['Disarmor', 0.06], ['IceDuelMaxima', strong && !player && foeHp > 15 ? 0.06 : 0],
    ];
    let sum = 0;
    for (const e of table) { if (e[0] === last) e[1] *= 0.25; sum += e[1]; } // (not the same one twice in a row: the show goes on)
    let x = rng() * sum;
    for (const [s, w] of table) { x -= w; if (x <= 0) return s; }
    return 'Stupefy';
}

/**
 * A duellist's answer to a charge flying at him (the author: «дуэли должны быть интересными, не так, что
 * кинул магию, другой, и за 5 секунд всё закончилось»): fresh, a good one meets nearly every charge — a
 * spell back (the beams meet), the shield, a step aside; tired (mana low) he misses more. → 'counter' |
 * 'shield' | 'dodge' | null (he takes it). `eta` s till it reaches him, `canCounter` the time and the wand for it.
 */
export function arenaDefence({ skill = 1, mana = 30, maxMana = 30, t = 0, eta = 1, canCounter = false, rng = Math.random } = {}) {
    const fresh = arenaFresh(mana, maxMana, t);
    const pMeet = Math.min(0.985, 0.5 + 0.12 * Math.min(1.5, skill) + 0.37 * fresh); // (fresh: nearly all; worn out: ~2 of 3)
    if (rng() > pMeet) return null;
    const x = rng();
    if (canCounter && mana >= 8 && x < 0.38) return 'counter';
    if (mana >= 4 && x < 0.78) return 'shield';
    if (eta > 0.35) return 'dodge';
    return mana >= 4 ? 'shield' : null;
}

/** How fresh a duellist is (0…1): his mana left, and the duel's minutes wear anyone down. */
export function arenaFresh(mana, maxMana, t = 0) {
    const m = maxMana > 0 ? Math.min(1, 1.25 * mana / maxMana) : 0;
    return Math.max(0, Math.min(m, 1 - t / 260));
}

/**
 * How long a duellist lies stunned / thrown down at the arena (s): a fresh one is up again in a moment and
 * fights on (the other must be quick with «Экспеллиармус»), a worn-out one stays down as anyone.
 */
export const arenaDownTime = (fresh) => 2.5 + 9 * (1 - Math.max(0, Math.min(1, fresh)));

/**
 * (two wizards of the arena — a friendly duel) The blow one of them gets from the other never kills: at most
 * down to one heart (his ward taking its share — CastleLife.hit). A player's blows are never softened (a kill is a foul).
 */
export function softBlow(dmg, hp, armor = 0) {
    return Math.max(0, Math.min(dmg, hp - 1 + 0.8 * Math.max(0, armor)));
}

/**
 * Where a duellist wants to stand (the author: «двигаются — отступают, обходят по дуге, сближаются, когда
 * соперник ослаб; не стоят на месте»): worn out (low mana) he backs off and keeps away, the other worn out —
 * he closes in; otherwise a band round him. → { min, max, side } (side: how readily he circles, 0…1).
 */
export function arenaStance({ mana = 30, maxMana = 30, foeMana = 30, foeMaxMana = 30, t = 0 } = {}) {
    const me = arenaFresh(mana, maxMana, t), foe = arenaFresh(foeMana, foeMaxMana, t);
    if (me < 0.3 && foe > me) return { min: 12, max: 22, side: 0.8, mood: 'back' };
    if (foe < 0.3 && me > foe) return { min: 5, max: 11, side: 0.5, mood: 'press' };
    return { min: 8, max: 19, side: 0.6, mood: 'even' };
}
