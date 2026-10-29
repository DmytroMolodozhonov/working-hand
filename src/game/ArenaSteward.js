/**
 * ArenaSteward.js — the steward of a duel arena and the queue he keeps (pure: ArenaDuels.js plays it,
 * CastleTalk.js asks him, the tests drive it).
 *
 * The author: «возле КАЖДОГО дуэльного колизея стоит человек-распорядитель — по виду как торговец, только без
 * товара. Он записывает на бой (плату НЕ берёт). Спрашивает: «Хотите сразиться?» — «да» — «В случае победы — 100
 * монет». Если прошлый бой ещё идёт — ждёшь; потом встаёшь на ПОДСВЕЧЕННОЕ место, ждёшь соперника — отсчёт и бой.
 * Ушёл с места или отказался — запись снимается.»
 *
 * Who / what (CLAUDE.md): the steward is a living man of the tower (or the settlement) — a villager of its roster in
 * a steward's robe (CastleLife: he is hit, struck down, frightened, ordered and ruled by Imperius like every villager,
 * his steadiness is the wizard's — Steadiness.steadyKind); only he stays on his place. He takes no coins and sells nothing.
 */

export const STEWARD = {
    ASK_R: 7, // m: a player this near (and not signed up) is asked «Хотите сразиться?»
    ASK_EVERY: 90, // s: he asks the same player again no sooner than this
    ANSWER_T: 45, // s: a bare «да» after his question counts this long
    HEAR_R: 14, // m: a player this far still hears him (and may answer)
    LEAVE_R: 40, // m: a signed-up player further than this from the steward (waiting) is struck off
    RING: 1.8, // m: the radius of the lit ring (ArenaMarkFx)
    MARK_R: 3.5, // m: standing on the lit place
    MARK_AWAY: 5.5, // m: a player stepping this far off his lit place before «3-2-1» has gone — struck off
};

/**
 * What he says (all made in his voice in advance: CastleTalk._prepareFillers).
 * The fee (the author: «платные бои… победил — тебе возвращают сумму и добавляют столько же; проиграл — деньги пропали»): the stake is the
 * coins of the opponent's tier (50 / 100 / 150), paid to him when the player chooses; a win — the stake back and as much again; a loss — gone;
 * a draw / the arena's trouble / the queue left before the turn — the stake back. In Creative nothing is paid (a win gives the tier's coins).
 */
export const STEWARD_LINES = {
    ask: ['Хотите сразиться?', 'Желаете выйти на арену?', 'Хотите попробовать свои силы в дуэли?'],
    choose: 'С кем хотите сразиться? Младший волшебник — ставка 50 монет, средний — 100, сильный преподаватель — 150. Скажите «младший», «средний» или «сильный» — или коснитесь нужной фигурки на прилавке. С главой башни сражаться нельзя.',
    master: 'С главой башни сражаться нельзя. Выберите младшего, среднего или сильного волшебника.',
    terms_novice: 'Хорошо! Младший волшебник. Ставка 50 монет: победите — получите 100, проиграете — ставка пропадёт.',
    terms_adept: 'Хорошо! Средний волшебник. Ставка 100 монет: победите — получите 200, проиграете — ставка пропадёт.',
    terms_teacher: 'Хорошо! Сильный преподаватель. Ставка 150 монет: победите — получите 300, проиграете — ставка пропадёт.',
    terms_free_novice: 'Хорошо! Младший волшебник. В случае победы — 50 монет.',
    terms_free_adept: 'Хорошо! Средний волшебник. В случае победы — 100 монет.',
    terms_free_teacher: 'Хорошо! Сильный преподаватель. В случае победы — 150 монет.',
    full: 'Очередь на арену полна — подойдите чуть позже.',
    poor: 'Не хватает монет для ставки. Младший — 50, средний — 100, сильный преподаватель — 150.',
    wait: 'Сейчас идёт бой — вы в очереди, она на табло. Я позову вас, когда арена освободится.',
    soon: 'Арена свободна — скоро позову вас на арену.',
    again: 'Вы уже записаны — ждите.',
    off: 'Хорошо, запись снята, ставка возвращена.',
    none: 'Вы ни на что не записаны.',
    night: 'Ночью дуэлей нет — приходите днём.',
    wand: 'Возьмите палочку в руку — без неё дуэль не начать.',
    call: 'Ваш черёд! Встаньте на светящееся место на арене.',
    go: 'Соперник на месте — отсчёт!',
    missed: 'Вы не вышли на арену — запись снята, ставка возвращена.',
    left: 'Вы ушли с места — запись снята, ставка возвращена.',
    win: 'Победа! Вот ваша награда — ваша ставка и столько же сверху.',
    info: 'Выберите соперника на прилавке — младшего (ставка 50 монет), среднего (100) или сильного преподавателя (150) и заплатите ставку. Победите — вам вернут ставку и добавят столько же, проиграете — ставка пропадёт. Дуэль одна за раз, очередь на табло. Встаньте на светящееся место — и бой. С главой башни сражаться нельзя.',
};

/**
 * What the duel does with the stake (pure; ArenaDuels._end). `stake`: the coins the player paid (0 — nothing, Creative), `tier`: whom he chose,
 * `who`: 'p' the player won, 'a' he lost (the wizard won), null — nobody won; `why`: how it ended.
 *   win     → the stake back and as much again (a free entry: the tier's coins, as ever)
 *   lost    → nothing (he lost the duel, gave it up by walking off the floor, or killed the wizard — a foul)
 *   refund  → the stake back (a draw at 5 minutes, the wizard gone, he did not come out to the mark)
 */
export function settleStake({ tier, stake = 0, who = null, why = null } = {}) {
    if (who === 'p') return { kind: 'win', coins: stake > 0 ? stake * 2 : tierCoins(tier) };
    if (who === 'a' || why === 'foul') return { kind: 'lost', coins: 0 };
    return { kind: stake > 0 ? 'refund' : 'none', coins: stake };
}

/**
 * The opponents he offers (the author: «как продавец… куколки: младший, средний, сильный; с главой башни нельзя; за победу 50, 100, 150»):
 * the tier → what it is called, the coins for a win, which ranks of the tower's wizards may stand against the player (WizardAI.WIZ_RANKS).
 */
export const TIERS = {
    novice: { ru: 'Младший', who: 'младший волшебник', coins: 50, ranks: ['novice'] },
    adept: { ru: 'Средний', who: 'средний волшебник', coins: 100, ranks: ['adept'] },
    teacher: { ru: 'Сильный', who: 'сильный преподаватель', coins: 150, ranks: ['teacher', 'elder'] },
};
export const TIER_ORDER = ['novice', 'adept', 'teacher'];
export const tierCoins = (tier) => TIERS[tier]?.coins ?? 100;

const T_MASTER = /(^|[^а-я])(глав[а-я]*|мастер[а-я]*|джовал[а-я]*|нотан[а-я]*|босс[а-я]*)([^а-я]|$)/;
const T_WORDS = [
    ['novice', /(^|[^а-я])(младш[а-я]*|слаб[а-я]*|начинающ[а-я]*|новичок|новичк[а-я]*|ученик[а-я]*|студент[а-я]*)([^а-я]|$)/],
    ['adept', /(^|[^а-я])(средн[а-я]*|продвинут[а-я]*)([^а-я]|$)/],
    ['teacher', /(^|[^а-я])(сильн[а-я]*|преподавател[а-я]*|учител[а-я]*|мощн[а-я]*)([^а-я]|$)/],
];

/** Whom the player named: 'novice' | 'adept' | 'teacher' | 'master' (not allowed) | null. */
export function stewardTier(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[.,!?…]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    if (T_MASTER.test(t)) return 'master';
    for (const [k, re] of T_WORDS) if (re.test(t)) return k;
    return null;
}

/** Every line he may say (for the voice to make in advance). */
export const stewardPool = () => [...STEWARD_LINES.ask, ...Object.entries(STEWARD_LINES).filter(([k]) => k !== 'ask').map(([, v]) => v)];

const YES = /(^|[^а-яa-z0-9])(да|ага|угу|давай(те)?|конечно|хочу|желаю|хотим|согласен|согласна|запиши(те)?|записывай(те)?|буду|готов|готова|yes|sure|ok)([^а-яa-z0-9]|$)/;
const NO = /(^|[^а-яa-z0-9])(нет|не хочу|не надо|не буду|отмена|отмени(ть)?|передумал|передумала|не сейчас|потом|no|cancel)([^а-яa-z0-9]|$)/;
const WANT = /(сразиться|сражаться|драться|подраться|подуэлить|дуэл|записа[тьй]|на арену|на бой|выйти на арену|хочу в бой)/;
const INFO = /(награ|сколько|монет|правил|как это|что тут|что здесь|что за|плата|плат[иы]т)/;

/**
 * What the player said to the steward: 'want' (to fight / sign up — at any time), 'yes' (a bare «да» — counts
 * only after his question), 'no' (refuses / cancels), 'info' (asks about the reward / the rules), null.
 */
export function stewardIntent(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[.,!?…]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    if (NO.test(t) && !/(хочу|желаю|давай)/.test(t.replace(/не хочу/g, ''))) return 'no';
    if (WANT.test(t)) return /не (хочу|буду|надо)/.test(t) ? 'no' : 'want';
    if (YES.test(t)) return 'yes';
    if (INFO.test(t)) return 'info';
    return null;
}

/**
 * The queue of an arena: the players signed up, in order. Pure — `here(id)` tells who is still about.
 * A player is in the queue until his turn (`take`), then he is the one `called`; struck off by `cancel`.
 */
export class ArenaQueue {
    constructor() { this.list = []; }

    get length() { return this.list.length; }
    has(id) { return this.list.includes(id); }

    /** Sign `id` up → his place in the line (0 — the next), or -1 if he was signed already. */
    sign(id) {
        if (this.list.includes(id)) return -1;
        this.list.push(id);
        return this.list.length - 1;
    }

    /** Strike `id` off → was he in? */
    cancel(id) {
        const i = this.list.indexOf(id);
        if (i < 0) return false;
        this.list.splice(i, 1);
        return true;
    }

    /** His turn: the first of the line that is still about (`here(id)`); the ones gone are struck off. → id or null. */
    take(here) {
        while (this.list.length) {
            const id = this.list.shift();
            if (here(id)) return id;
        }
        return null;
    }

    /** Strike off everyone `far(id)` says has gone → the ids struck off. */
    prune(far) {
        const out = this.list.filter(far);
        if (out.length) this.list = this.list.filter((id) => !out.includes(id));
        return out;
    }

    /** Players before `id` in the line, counting a duel going on now. */
    ahead(id, duelOn) { const i = this.list.indexOf(id); return i < 0 ? 0 : i + (duelOn ? 1 : 0); }
}

/** The places of a duel (world points of the arena `def`): the player's lit place, the opponent's, the steward's. */
export function duelSpots(def) {
    return { player: def.gates[0].mark, foe: def.gates[1].mark, steward: def.desk?.stand || def.desk?.front || null };
}

/**
 * Is the signed-up player still on (or near) his lit place, at `d` m from it? Before his turn — anywhere near the
 * steward is fine; from the call to the count — he must stay on the place.
 */
export const onPlace = (d, phase) => (phase === 'call' ? true : d <= STEWARD.MARK_AWAY);


/**
 * Where the three small figures stand (the author: «как крытый рынок/прилавок продавца, а вместо товаров — МАЛЕНЬКИЕ ФИГУРКИ волшебников
 * (не во весь рост), подписанные: младший / средний / сильный… они накладываются друг на друга — взаимодействовать нельзя»).
 * A world of generation ARENA_ENTRIES_FROM_GEN: on the stall's counter (DuelArenas.entries — `desk.stall.slots`, 1,6 m apart, each its own slot).
 * An older world / the round arena: in a row on little stones past the lectern, on the side AWAY from the gate's lane (the lane stays free), 1,8 m apart.
 * → [{tier, x, y, z, yaw, onCounter}], every one at its own point (`FIG.GAP` m from the next at least).
 */
export const FIG = { H: 1.0, GAP: 1.4, TOUCH_R: 0.55 };
export function dollSpots(def) {
    const S = def?.desk?.stand;
    if (!S || !def.axis) return [];
    const yaw = (x, z) => Math.atan2(-(x - def.x), -(z - def.z)); // (the model looks along −Z at yaw 0: this turns it away from the arena's middle)
    const st = def.desk.stall;
    if (st?.slots) return st.slots.map((q) => ({ tier: q.tier, x: q.x, y: q.y, z: q.z, yaw: yaw(q.x, q.z), onCounter: true }));
    const { a, b } = def.axis;
    const al = Math.hypot(b.x - a.x, b.z - a.z) || 1, ax = (b.x - a.x) / al, az = (b.z - a.z) / al; // (the axis: the gates' line)
    let lx = -az, lz = ax; // (across it)
    const B = def.desk.book || def.desk.front;
    if (B && (B.x - S.x) * lx + (B.z - S.z) * lz < 0) { lx = -lx; lz = -lz; } // (towards the lectern's side, away from the lane)
    const ox = S.x - def.x, oz = S.z - def.z, ol = Math.hypot(ox, oz) || 1; // (a little further out from the arena)
    return TIER_ORDER.map((tier, i) => {
        const x = S.x + lx * (3.6 + i * 1.8) + ox / ol * 2, z = S.z + lz * (3.6 + i * 1.8) + oz / ol * 2;
        return { tier, x, y: S.y, z, yaw: yaw(x, z), onCounter: false };
    });
}
