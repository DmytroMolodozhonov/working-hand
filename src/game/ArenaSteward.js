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

/** What he says (all made in his voice in advance: CastleTalk._prepareFillers). */
export const STEWARD_LINES = {
    ask: ['Хотите сразиться?', 'Желаете выйти на арену?', 'Хотите попробовать свои силы в дуэли?'],
    terms: 'В случае победы — 100 монет.',
    wait: 'Сейчас идёт бой — подождите, я позову вас, когда арена освободится.',
    soon: 'Арена свободна — скоро позову вас на арену.',
    again: 'Вы уже записаны — ждите.',
    off: 'Хорошо, запись снята.',
    none: 'Вы ни на что не записаны.',
    night: 'Ночью дуэлей нет — приходите днём.',
    wand: 'Возьмите палочку в руку — без неё дуэль не начать.',
    call: 'Ваш черёд! Встаньте на светящееся место на арене.',
    go: 'Соперник на месте — отсчёт!',
    missed: 'Вы не вышли на арену — запись снята.',
    left: 'Вы ушли с места — запись снята.',
    win: 'Победа! Вот ваши 100 монет.',
    info: 'Запишитесь, встаньте на светящееся место — и бой с волшебником. Победа — 100 монет, платить за участие не нужно.',
};

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

