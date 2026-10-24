/**
 * Justice.js — the king's law: «убейте всех моряков», «арестуйте его», «обыщите дом» (the author: «рыцари понимают класс персонажей: убейте
 * всех моряков — пойдут и убьют; убейте всех жителей — откажутся… арестовать можно только конкретного, нельзя всех, максимум группу:
 * подходят, надевают наручники, уводят… тюрьма: куда увели, они там не обязательно сидят — там просто кто-то сидит… арестованные
 * говорят «я не виноват»… обыскать дом»). Pure (no THREE / DOM): tests/unit/justice.test.js; the game side: JusticeLife.js.
 */

// ------------------------------------------------------------------ classes of targets
const L = '(?<![а-яa-z0-9])';
const R = '(?![а-яa-z0-9])';

/**
 * The classes a king may name. `act`: what the guard does: 'attack' (hunts them: VillagerOrders target), 'refuse' (and why).
 * The order of the list matters: the first that fits.
 */
export const CLASSES = [
    { id: 'livestock', re: /(?<![а-я])(коров|свиней|свиньи|свинью|баран|овец|овц|лошад|коней|кур[ыи]|куриц|скот)/, act: 'refuse', why: 'livestock', ru: 'скот' },
    { id: 'sailors', re: /(моряк|матрос|пират|корсар|флибустьер|экипаж|команд\S* корабл|бандит\S* с корабл)/, act: 'attack', target: 'sailors', ru: 'моряков' },
    { id: 'dragon', re: /(дракон)/, act: 'attack', target: 'dragon', ru: 'драконов' },
    { id: 'spider', re: /(паук|паучих|паучищ)/, act: 'attack', target: 'spider', ru: 'пауков' },
    { id: 'zombies', re: /(зомби|нежит|мертвец|мертвяк|скелет|упыр|вурдалак)/, act: 'attack', target: 'zombies', ru: 'нежить' },
    { id: 'beasts', re: /(зверей|звери|зверя|дик\S* животн|волк|медвед|кабан)/, act: 'attack', target: 'animals', ru: 'зверей' },
    { id: 'enemies', re: /(враг|противник|неприятел|захватчик|недругов|чужаков)/, act: 'attack', target: 'enemies', ru: 'врагов' },
    { id: 'wizards', re: /(волшебник|маг[иов]|чародей|колдун|чернокнижник)/, act: 'refuse', why: 'mages', ru: 'волшебников' },
    { id: 'knights', re: /(рыцар|стражник|стражу|гвардейц|воинов|солдат|дружин)/, act: 'refuse', why: 'own', ru: 'рыцарей' },
    { id: 'civilians', re: /(жител|горожан|крестьян|селян|людей|народ|строител|фермер|торговц|купц|женщин|детей|мирн|ремесленник|поселян|горожанин)/, act: 'refuse', why: 'civilians', ru: 'жителей' },
];

/** What class of beings the words name («всех моряков» → sailors), or null. */
export function classOf(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    for (const c of CLASSES) if (c.re.test(t)) return c;
    return null;
}

/** Why the guard will not: in his words (by the reason). */
export const REFUSE_CLASS = {
    civilians: ['Это же наши люди, Ваше Величество! На такое мы не пойдём.', 'Убивать мирных жителей? Нет, государь. Это не по чести.', 'Я присягал защищать людей, а не убивать их.'],
    own: ['Своих? Нет, Ваше Величество, мы же братья по оружию!', 'Рыцари не убивают рыцарей по приказу. Такого я не сделаю.'],
    mages: ['Против магов у нас нет шансов, государь. Это верная смерть — не пойдём.', 'Маги нам не по зубам, Ваше Величество. Не вижу в этом смысла.'],
    livestock: ['Это же скот, государь — наша еда. Зачем его убивать?', 'Коров и овец? Зачем, Ваше Величество? Чем будем кормиться?'],
    ship: ['Это же наши моряки, государь!', 'Своих моряков? Нет.'],
    none: ['Не вижу, кого убивать, Ваше Величество.'],
};
/** The words said when they go. */
export const GO_CLASS = {
    sailors: ['Моряки так моряки. Выступаем!', 'Есть! Перебьём всех на кораблях!', 'За короля! На корабли!'],
    zombies: ['Нежить? С удовольствием!', 'Сейчас мы им покажем!'],
    spider: ['Паучиха? Будет трудно, но идём!', 'За мной! На паука!'],
    dragon: ['Дракон… Что ж, умрём как герои!', 'На дракона?! Ну, ладно… Вперёд!'],
    animals: ['Зверей так зверей. Выходим!', 'Прогоним их из округи!'],
    enemies: ['Враги будут разбиты!', 'В атаку!'],
};

// ------------------------------------------------------------------ arrest
export const ARREST = { MAX: 4, MAX_RANK_NOTE: 'не больше четырёх за раз' };

/** May these be arrested? `targets` the people; `all`: «всех». → {ok, line?} */
export function mayArrest(targets, { all = false, ownerId = null } = {}) {
    if (all) return { ok: false, line: 'Всех арестовать нельзя, Ваше Величество. Укажите, кого именно.' };
    const list = targets.filter((t) => t && !t.dead && t.role !== 'king' && t.id !== ownerId);
    if (!list.length) return { ok: false, line: 'Кого арестовать? Покажите рукой или назовите по имени.' };
    if (list.length > ARREST.MAX) return { ok: true, targets: list.slice(0, ARREST.MAX), note: `Беру ${ARREST.MAX}, остальных — после.` };
    return { ok: true, targets: list };
}

/** What the arrested says — by his nature. */
export function protest(c, roll = 0.5) {
    const ch = c || {};
    const pick = (a) => a[Math.min(a.length - 1, Math.floor(roll * a.length))];
    if ((ch.temper ?? 35) >= 60) return pick(['Руки прочь! Я ничего не сделал!', 'Да как вы смеете?! Это произвол!', 'Отпустите меня! Я не виноват!']);
    if ((ch.brave ?? 50) < 35) return pick(['Ой, не надо! Я ничего не делал, правда!', 'За что?! Я ни в чём не виноват!', 'Умоляю, это ошибка!']);
    if ((ch.kindness ?? 55) >= 60) return pick(['Это какая-то ошибка… я ни в чём не виноват.', 'Что я сделал? Объясните хотя бы!', 'Я не понимаю… за что меня?']);
    return pick(['Не виноват я, слышите?!', 'Это ошибка. Я ничего не делал.', 'За что? Я честный человек!']);
}
export const ARREST_SAY = ['Именем короля вы арестованы!', 'Вы задержаны по приказу короля!', 'Следуйте за мной. Приказ короля.'];
export const HANDED = ['Заключённый сдан.', 'Он в тюрьме, Ваше Величество.', 'Передал под замок.'];
/** The captive tugging along: now and then. */
export const WALK_SAY = ['Я не виноват!', 'Куда вы меня ведёте?', 'Это неправда, я ничего не делал!', 'Пустите меня!'];

// ------------------------------------------------------------------ the jail
/** The jail of a castle: {list: [{idx, name, role, at, who}]} — kept in the state; those in it are not out and about. */
export const newJail = () => ({ list: [] });
export const isJailed = (jail, idx) => !!jail && jail.list.some((j) => j.idx === idx);

export function lock(jail, p, now = 0) {
    const j = jail || newJail();
    if (!isJailed(j, p.idx)) j.list.push({ idx: p.idx, name: p.name, role: p.role, at: now });
    return j;
}

/** Lets out: by idx list, or all (null). Returns [released]. */
export function unlock(jail, idxs = null) {
    if (!jail) return [];
    const out = [];
    jail.list = jail.list.filter((j) => { const free = idxs == null || idxs.includes(j.idx); if (free) out.push(j); return !free; });
    return out;
}

/** The people always in the cells (nobody the king jailed; just a prison is never empty): a seeded few, by the castle. */
const INMATE_NAMES = ['Гуго', 'Бертран', 'Ансельм', 'Освальд', 'Рагнвальд', 'Лиам', 'Тобиас', 'Генрих', 'Мартин', 'Эдмунд', 'Матильда', 'Агата', 'Берта'];
export function inmates(seed) {
    let a = seed >>> 0; const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const n = 2 + Math.floor(r() * 4);
    const out = [];
    for (let i = 0; i < n; i++) out.push(INMATE_NAMES[Math.floor(r() * INMATE_NAMES.length)]);
    return [...new Set(out)];
}

export function prisonLine(jail, seed) {
    const mine = jail?.list || [];
    const old = inmates(seed);
    const own = mine.length ? `Ваши арестанты: ${mine.map((j) => j.name).join(', ')}. ` : '';
    return `${own}В тюрьме сидит ещё ${old.length} ${old.length === 1 ? 'человек' : old.length < 5 ? 'человека' : 'человек'} со старых времён: ${old.join(', ')}.`.replace(/ ,/g, ',');
}

/** What the released says — by his nature: the wronged are sour. */
export function releaseLine(c, roll = 0.5) {
    const ch = c || {};
    const pick = (a) => a[Math.min(a.length - 1, Math.floor(roll * a.length))];
    if ((ch.kindness ?? 55) >= 60) return { kind: 'forgive', f: 1, s: 0, line: pick(['Спасибо, что выпустили, Ваше Величество. Я знал, что это ошибка.', 'Слава богам, свобода! Спасибо вам.']) };
    if ((ch.temper ?? 35) >= 60) return { kind: 'angry', f: -4, s: -3, line: pick(['Я же говорил, что не виноват! Этого я не забуду.', 'Меня держали ни за что! Запомню это, король.']) };
    return { kind: 'sour', f: -2, s: -1, line: pick(['Наконец-то. Я же говорил, что я не виноват.', 'Ни за что посидел… ну да ладно.']) };
}

// ------------------------------------------------------------------ searching a house
/**
 * What the search finds: the things lying in the house, and now and then a hidden stash. → {loose: n, stash: bool, line}
 * `n` things lying there, `roll` 0…1.
 */
export function searchResult(n, roll = 0.5, { poor = false } = {}) {
    const stash = roll < (poor ? 0.18 : 0.3);
    const total = n + (stash ? 1 : 0);
    const line = total === 0 ? 'Ничего подозрительного, Ваше Величество. Дом чист.' : stash ? 'Нашли тайник под полом! Несём вам находки.' : `Нашли ${n} ${n === 1 ? 'вещь' : n < 5 ? 'вещи' : 'вещей'}. Несём вам.`;
    return { loose: n, stash, line };
}
/** The house's people when strangers go through it. */
export const RESIDENT_SAY = ['Что вы делаете в моём доме?!', 'Это мой дом! Уходите!', 'Стража в моём доме… за что?', 'Только не трогайте детские вещи, прошу!'];
export const SEARCH_START = ['Обыск именем короля!', 'Всем стоять! Идёт обыск.', 'Дом осматривают по приказу короля.'];
