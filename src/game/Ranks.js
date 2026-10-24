/**
 * Ranks.js — what the king may entrust to a friend (the author: «скажу визирю: это мой друг… поручаю ему должность… слушайтесь его… —
 * визирь передал всем… градация слушания»). The king says it to his vizier (the advisor); the vizier tells the whole castle: the
 * state of the castle keeps `ranks: {player id → {level, title, name}}` (saved, sent to the guests).
 *
 * The four steps (each includes the one before):
 *   1 friend     «это мой друг» — nobody of the castle lifts a hand on him, and what he does to them is forgiven (no crime, no
 *                alarm); they do not obey him.
 *   2 honored    «уважайте его» — also: greeted with respect, called by his name and title; still no orders.
 *   3 commander  «слушайтесь его», «назначаю командиром» — the guard obeys his orders (follow, formations, patrol, a spar,
 *                an arrest…) as the king's; the people take him for the king's man. Not the king's right to give ranks.
 *   4 deputy     «мой наместник», «он главный вместо меня» — all the king's orders to the castle's people; still not the right to
 *                give or take ranks (only the king himself), and the king's own seat is not his.
 * Pure (no THREE / DOM): tests/unit/ranks.test.js.
 */

export const RANK = { FRIEND: 1, HONORED: 2, COMMANDER: 3, DEPUTY: 4 };
export const RANK_KEYS = { friend: 1, honored: 2, commander: 3, deputy: 4 };

/** The standard title of each step (and what a named office may call him: «казначей», «маршал»…). */
export const RANK_TITLES = { 1: 'друг замка', 2: 'почётный гость', 3: 'командир стражи', 4: 'наместник' };
const OFFICES = [
    [/(маршал)/, 'маршал'], [/(казначе)/, 'казначей'], [/(начальник\S* стражи|начальник\S* охраны|начальник\S* гарнизона)/, 'начальник стражи'],
    [/(капитан)/, 'капитан стражи'], [/(полководц)/, 'полководец'], [/(командир|командоват)/, 'командир стражи'], [/(наместник)/, 'наместник'],
    [/(заместител)/, 'заместитель короля'], [/(регент)/, 'регент'], [/(управляющ)/, 'управляющий'], [/(правая рука|правой рукой)/, 'правая рука короля'],
    [/(ключник|хранител\S* ключей)/, 'хранитель ключей'], [/(советник)/, 'советник'],
];

/** The office named in the king's words (or the standard title of the step). */
export function titleFor(level, text = '') {
    if (level >= 3) for (const [re, name] of OFFICES) if (re.test(text)) return name; // (an office only for the steps that command)
    return RANK_TITLES[level] || RANK_TITLES[1];
}

/** What a step lets him do — the one table the castle looks at. */
export const RANK_POWERS = {
    forgiven: 1, // his deeds are no crime; the castle's people never take him for an enemy
    respected: 2, // greeted, bowed to
    commands: 3, // the king's orders to the guard (and the people)
    deputy: 4, // …all of them, the king's absence
};

/** Level of a player in the castle's ranks (0: none). */
export function levelOf(ranks, pid) {
    const r = ranks && pid != null ? ranks[pid] : null;
    return r ? r.level | 0 : 0;
}
export const isForgiven = (ranks, pid) => levelOf(ranks, pid) >= RANK_POWERS.forgiven;
export const isRespected = (ranks, pid) => levelOf(ranks, pid) >= RANK_POWERS.respected;
export const commandsGuard = (ranks, pid) => levelOf(ranks, pid) >= RANK_POWERS.commands;

/** Sets / takes a rank (pure: returns the new map). `level` 0 takes it away. */
export function withRank(ranks, pid, level, title, name) {
    const out = { ...(ranks || {}) };
    if (!level) delete out[pid];
    else out[pid] = { level, title: title || RANK_TITLES[level], name: name || '' };
    return out;
}

/** The vizier's answer to the king: what he will tell the castle. */
export function vizierLine(level, who, title, previous = 0) {
    const n = who || 'этот человек';
    if (!level) return previous ? `Слушаюсь, Ваше Величество. ${n} больше не ${RANK_TITLES[previous] === 'друг замка' ? 'друг замка' : 'в должности'} — передаю страже.` : `${n} и так без особых прав, Ваше Величество.`;
    switch (level) {
        case 1: return `Слушаюсь, Ваше Величество. ${n} — друг замка. Передам страже: его не трогать, о его проступках не докладывать.`;
        case 2: return `Будет исполнено, Ваше Величество. ${n} — почётный гость: встречать с уважением, не обижать. Передаю всем.`;
        case 3: return `Как прикажете, Ваше Величество. ${n} назначен: ${title}. Страже велено слушаться его приказов. Объявлю сейчас.`;
        default: return `Приказ принят, Ваше Величество. ${n} — ${title}: он говорит от вашего имени. Объявляю по всему замку.`;
    }
}

/** What a knight says when the king's friend comes by / is announced (by the step). */
export const GREET_RANKED = {
    1: ['Здравствуйте, {title} {name}!', 'Друг короля — наш друг.'],
    2: ['Рады видеть вас, {name}!', 'Добро пожаловать, {name}. Желаете чего-нибудь?'],
    3: ['Слушаем вас, {title} {name}!', 'Приказывайте, {name}.', 'Рыцари к вашим услугам, {name}!'],
    4: ['Наместник {name}! Слушаем вас, как короля.', 'Ваша воля — воля короля, {name}.'],
};
export const fill = (s, name, title) => s.replace('{name}', name || '').replace('{title}', title || '').replace(/\s+/g, ' ').replace(/ ([!.,])/g, '$1').trim();
