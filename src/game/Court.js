/**
 * Court.js — the king's court: the treasury, the people's troubles, and the vizier who reports them (the author: «главный визирь
 * сам инициирует разговор… знает, сколько денег в казне, какие проблемы у жителей… 20 самых распространённых проблем, он назовёт
 * одну-две или десять в зависимости от событий… эти проблемы можно решать… может подвести к конкретному персонажу: у него низкий
 * урожай»). Pure (no THREE / DOM): tests/unit/court.test.js. The game side: CourtLife.js.
 *
 * Shaped after what other games found works (CK3's "hold court": a few petitioners at a time, each ruling shifts the realm;
 * Dwarf Fortress petitions; Usurper's petitions touching treasury, reputation and loyalty): a SMALL set of open troubles, each with a
 * person who has it, several ways to answer it (money, supplies, work, guards, a word), and a price in the treasury and the mood
 * of the town. Nothing is scripted by a calendar: troubles come from the state of the castle (an empty treasury, a raid, a
 * long peace) and from chance.
 */

export const COURT = {
    START_COINS: 300, PER_KNIGHT: 60, // the treasury at first: 300 + 60 per knight
    TICK: 60, // s: one "month" of income and wages (real seconds of play)
    MAX_OPEN: 8, // open troubles at once
    FIRST_AFTER: 90, // s of the king's rule before the first trouble
    GAP: [150, 330], // s between two new troubles (shorter when things are bad)
    BRIEF_COOLDOWN: 300, // s between two reports the vizier starts himself
    MOOD_START: 55,
};

export const newCourt = (def = {}, rng = Math.random) => ({
    coins: COURT.START_COINS + (def.knights || 4) * COURT.PER_KNIGHT + Math.floor(rng() * 80),
    mood: COURT.MOOD_START, tax: 1, problems: [], nextAt: COURT.FIRST_AFTER, clock: 0, tickT: 0, solved: 0, briefedAt: -1e9, nextId: 1, topic: null,
});

/**
 * The troubles. `who`: the kind of person who has it (role) — 'any' for anyone of the people. `ways`: how it can be answered:
 * money (give coins), supplies (seeds, planks, grain… from the stores: coins too, less), work (the builders do it: time, no coins),
 * guard (the knights go: free, a patrol), feast, tax (lower the tax), healer, word (the king speaks with them), judge.
 * `cost` by way, `mood` the town's mood it moves when solved, `weight` how common.
 */
export const PROBLEMS = {
    poor_harvest: { who: 'farmer', weight: 8, title: 'слабый урожай', vizier: 'у {name} слабый урожай', says: ['Ваше Величество… урожай в этом году совсем слабый, нечем кормить семью.', 'Государь, поле почти ничего не дало. Нужны семена или помощь.'], ways: { money: 40, supplies: 30, tax: 0, work: 0 }, mood: 4, sev: 2 },
    pests: { who: 'farmer', weight: 5, title: 'крысы в амбаре', vizier: 'в амбаре у {name} завелись крысы', says: ['Крысы в амбаре, государь, всё грызут!', 'Зерно портится: крыс развелось — не счесть.'], ways: { supplies: 25, money: 30, guard: 0 }, mood: 2, sev: 1 },
    drought: { who: 'any', weight: 4, title: 'пересох колодец', vizier: 'у {name} пересох колодец', says: ['Колодец пересох, Ваше Величество. Воду таскаем издалека.', 'Нет воды, государь. Колодец надо углубить.'], ways: { work: 0, money: 60 }, mood: 3, sev: 2 },
    broken_plow: { who: 'farmer', weight: 5, title: 'сломан плуг', vizier: 'у {name} сломан плуг', says: ['Плуг сломался, государь, пахать нечем.', 'Сломал плуг. Новый бы…'], ways: { money: 35, supplies: 25, work: 0 }, mood: 2, sev: 1 },
    leaking_roof: { who: 'any', weight: 6, title: 'течёт крыша', vizier: 'у {name} течёт крыша', says: ['Крыша течёт, Ваше Величество. Дети мокнут.', 'Крышу бы починить, государь, а то зима близко.'], ways: { work: 0, supplies: 40, money: 45 }, mood: 3, sev: 1 },
    cracked_wall: { who: 'knight', weight: 4, title: 'трещина в стене', vizier: 'рыцарь {name} докладывает о трещине в стене', says: ['Государь, в стене трещина. Если зомби налягут — не выдержит.', 'Стена пошла трещиной, Ваше Величество. Нужна починка.'], ways: { work: 0, money: 80, supplies: 60 }, mood: 4, sev: 3 },
    no_materials: { who: 'builder', weight: 5, title: 'не хватает досок и камня', vizier: 'строителю {name} не хватает материалов', says: ['Досок нет, камня нет — строить не из чего, государь.', 'Материалов не хватает, Ваше Величество. Работа встала.'], ways: { money: 50, supplies: 40 }, mood: 2, sev: 2 },
    low_sales: { who: 'merchant', weight: 5, title: 'торговля встала', vizier: 'у торговца {name} торговля встала', says: ['Покупателей нет, государь. Торговля встала.', 'Мало кто заходит на рынок, Ваше Величество. Налоги душат.'], ways: { tax: 0, feast: 70, money: 40 }, mood: 3, sev: 1 },
    thieves: { who: 'merchant', weight: 5, title: 'воры у прилавка', vizier: 'у торговца {name} воруют с прилавка', says: ['Воры, государь! Тащат прямо с прилавка.', 'Опять пропал товар. Нужна стража на рынке.'], ways: { guard: 0, money: 30 }, mood: 3, sev: 2 },
    high_taxes: { who: 'any', weight: 5, title: 'тяжёлый налог', vizier: '{name} жалуется на налог', says: ['Налог тяжёлый, Ваше Величество. Едва свожу концы с концами.', 'Государь, налоги съедают всё. Нельзя ли облегчить?'], ways: { tax: 0, word: 0 }, mood: 4, sev: 1 },
    unpaid_wages: { who: 'knight', weight: 6, title: 'не выплачено жалование', vizier: 'рыцарь {name} говорит, что жалование задерживают', says: ['Государь, жалование задерживают. Люди ропщут.', 'Мы служим верно, Ваше Величество, но жалования не видели давно.'], ways: { money: 'wages' }, mood: 5, sev: 3 },
    rusty_weapons: { who: 'knight', weight: 5, title: 'затупилось оружие', vizier: 'у рыцаря {name} затупилось оружие', says: ['Меч затупился, Ваше Величество. Кузнецу бы заплатить.', 'Оружие в плохом состоянии, государь. Нужна оружейная.'], ways: { money: 60, supplies: 45 }, mood: 2, sev: 2 },
    tired_guards: { who: 'knight', weight: 5, title: 'стража выбилась из сил', vizier: 'стража выбилась из сил, говорит {name}', says: ['Мы валимся с ног, государь. Постов много, людей мало.', 'Стража устала, Ваше Величество. Нужна смена.'], ways: { word: 0, feast: 60, money: 40 }, mood: 3, sev: 2 },
    low_morale: { who: 'knight', weight: 4, title: 'упал боевой дух', vizier: 'у рыцаря {name} упал боевой дух', says: ['Дух у людей упал, Ваше Величество. Нужно что-то поднимающее настроение.', 'Рыцари приуныли, государь. Пир бы…'], ways: { feast: 80, word: 0 }, mood: 3, sev: 2 },
    hunger: { who: 'any', weight: 5, title: 'голодают', vizier: 'в доме {name} голодают', says: ['Мы голодаем, государь… дети плачут.', 'Хлеба нет, Ваше Величество. Помогите, чем можете.'], ways: { supplies: 70, money: 80, feast: 90 }, mood: 5, sev: 3 },
    sickness: { who: 'any', weight: 4, title: 'болезнь в доме', vizier: 'у {name} в доме болезнь', says: ['Болезнь в доме, государь. Нужен лекарь.', 'Жена слегла, Ваше Величество. Лекаря бы…'], ways: { healer: 50, money: 60 }, mood: 4, sev: 3 },
    wolves: { who: 'farmer', weight: 4, title: 'волки у околицы', vizier: 'у околицы {name} видели волков', says: ['Волки у околицы, государь! Скот режут.', 'Волки повадились к нашим овцам. Нужна стража.'], ways: { guard: 0, money: 30 }, mood: 3, sev: 2 },
    orphan: { who: 'any', weight: 3, title: 'сирота без крова', vizier: '{name} приютил сироту, но нечем кормить', says: ['Я приютил сироту, государь, а кормить нечем.', 'У мальчишки никого не осталось, Ваше Величество. Помогите, а?'], ways: { money: 30, supplies: 25, word: 0 }, mood: 3, sev: 1 },
    feud: { who: 'any', weight: 4, title: 'ссора соседей', vizier: '{name} в ссоре с соседом', says: ['Мы с соседом поругались из-за межи, государь. Рассудите нас.', 'Сосед мне враг, Ваше Величество. Пусть король решит, кто прав.'], ways: { judge: 0, word: 0 }, mood: 2, sev: 1 },
    rumors: { who: 'any', weight: 3, title: 'слухи о недовольстве', vizier: '{name} слышал дурные слухи о вас', says: ['Ходят слухи, государь, что вы забыли про нужды людей.', 'Говорят, народом недовольны. Лучше бы вы показались людям, Ваше Величество.'], ways: { word: 0, feast: 70 }, mood: 4, sev: 2 },
    wizard_supplies: { who: 'wizard', weight: 4, title: 'не хватает ингредиентов', vizier: 'волшебнику {name} не хватает ингредиентов', says: ['Ингредиентов для зелий не хватает, государь.', 'Запасы трав иссякли, Ваше Величество. Нужны деньги на закупку.'], ways: { money: 50, supplies: 35 }, mood: 2, sev: 1 },
};
export const PROBLEM_IDS = Object.keys(PROBLEMS);

/** The ways to answer, by the words of the king. */
export const WAYS = {
    money: { name: 'деньги', ru: 'выделить деньги' },
    supplies: { name: 'припасы', ru: 'выдать припасы' },
    work: { name: 'работа', ru: 'послать работников' },
    guard: { name: 'стража', ru: 'послать стражу' },
    feast: { name: 'пир', ru: 'устроить пир' },
    tax: { name: 'налог', ru: 'снизить налог' },
    healer: { name: 'лекарь', ru: 'позвать лекаря' },
    word: { name: 'слово', ru: 'поговорить с людьми' },
    judge: { name: 'суд', ru: 'рассудить' },
};

// ------------------------------------------------------------------ the treasury and the months
/** The months pass: taxes come in, wages go out; the mood of the town drifts (open troubles weigh on it, a fair tax lifts it). */
export function tick(court, dt, ctx = {}) {
    court.clock += dt;
    court.tickT += dt;
    const ev = [];
    while (court.tickT >= COURT.TICK) {
        court.tickT -= COURT.TICK;
        const pop = ctx.population || 20, knights = ctx.knights || 4;
        const income = Math.round(pop * 0.9 * court.tax * (0.5 + court.mood / 100));
        const wages = Math.round(knights * 0.8 * 10) / 10;
        court.coins += income - wages;
        const weight = court.problems.filter((p) => !p.done).reduce((n, p) => n + PROBLEMS[p.kind].sev, 0);
        court.mood = clamp(court.mood - weight * 0.35 + (court.tax < 1 ? 0.6 : court.tax > 1 ? -0.8 : 0) + (court.mood < 50 ? 0.4 : -0.1), 0, 100);
        if (court.coins < 0) { court.coins = 0; ev.push({ kind: 'bankrupt' }); }
    }
    // a new trouble comes
    if (court.clock >= court.nextAt && court.problems.filter((p) => !p.done).length < COURT.MAX_OPEN) {
        const p = genProblem(court, ctx);
        if (p) ev.push({ kind: 'problem', problem: p });
        const [a, b] = COURT.GAP;
        const urgency = court.mood < 35 ? 0.6 : court.mood > 70 ? 1.3 : 1;
        court.nextAt = court.clock + ((a + (b - a) * (ctx.rng || Math.random)()) * urgency);
    }
    return ev;
}

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** The weights now: what the state of the castle makes likely (an empty treasury — wages; a raid — walls and the sick; a long peace — feuds). */
export function weights(court, ctx = {}) {
    const w = {};
    for (const id of PROBLEM_IDS) w[id] = PROBLEMS[id].weight;
    const open = new Set(court.problems.filter((p) => !p.done).map((p) => p.kind));
    if (court.coins < 80) w.unpaid_wages *= 4;
    if (court.tax > 1) { w.high_taxes *= 3; w.low_sales *= 2; }
    if ((ctx.raids || 0) > 0) { w.cracked_wall *= 3; w.sickness *= 2; w.low_morale *= 2; w.tired_guards *= 2; w.wolves *= 1.5; }
    if ((ctx.hurt || 0) > 0) { w.sickness *= 2; w.rumors *= 2; }
    if (court.mood < 40) { w.rumors *= 3; w.hunger *= 1.5; w.feud *= 1.5; }
    if (!ctx.hasWizards) w.wizard_supplies = 0;
    if (!ctx.hasMerchants) { w.low_sales = 0; w.thieves = 0; }
    for (const k of open) w[k] = 0; // (the same trouble is not opened twice)
    return w;
}

/** Opens a new trouble for a person fitting it. `ctx.people`: [{idx, id, name, role, wizard}]. Returns the trouble (or null). */
export function genProblem(court, ctx = {}) {
    const rng = ctx.rng || Math.random;
    const w = weights(court, ctx);
    const people = ctx.people || [];
    const fits = (kind, p) => { const who = PROBLEMS[kind].who; return who === 'any' ? p.role !== 'king' && p.role !== 'advisor' : who === 'wizard' ? !!p.wizard : p.role === who && !p.wizard; };
    const choices = PROBLEM_IDS.filter((k) => w[k] > 0 && people.some((p) => fits(k, p)));
    if (!choices.length) return null;
    let sum = 0; for (const k of choices) sum += w[k];
    let r = rng() * sum, kind = choices[0];
    for (const k of choices) { r -= w[k]; if (r <= 0) { kind = k; break; } }
    const cands = people.filter((p) => fits(kind, p));
    const who = cands[Math.floor(rng() * cands.length)];
    const pr = { id: court.nextId++, kind, idx: who.idx, vid: who.id, name: who.name, at: court.clock, done: false, told: false, led: false };
    court.problems.push(pr);
    return pr;
}

// ------------------------------------------------------------------ answering
/** What answering a trouble by `way` costs (coins), or null if this way does not fit it. `knights`: for the wages. */
export function costOf(court, problem, way, knights = 4) {
    const def = PROBLEMS[problem.kind];
    if (!(way in def.ways)) return null;
    const c = def.ways[way];
    if (c === 'wages') return Math.round(knights * 35);
    if (way === 'tax') return 0;
    return c;
}

/**
 * The king answers a trouble: `way` (one of WAYS); `amount` an own sum for "money" (more than asked is a gift, less is a half-answer).
 * → {ok, line, spent, mood, bonus: {f, s}, half}  — the treasury and the mood are changed here.
 */
export function solve(court, problem, way, { amount = null, knights = 4 } = {}) {
    const def = PROBLEMS[problem.kind];
    if (!def || problem.done) return { ok: false, line: 'Это дело уже решено, Ваше Величество.' };
    const cost = costOf(court, problem, way, knights);
    if (cost == null) return { ok: false, line: `Этому не поможет «${WAYS[way]?.name || way}», Ваше Величество. Тут нужно: ${Object.keys(def.ways).map((k) => WAYS[k].name).join(', ')}.`, fits: Object.keys(def.ways) };
    let pay = way === 'money' && amount != null ? Math.max(0, Math.floor(amount)) : cost;
    if (pay > court.coins) return { ok: false, line: `В казне ${Math.floor(court.coins)} монет, а нужно ${pay}, Ваше Величество.`, short: true };
    // half the asked sum: a half-answer; the man is not content, but a little relieved
    const half = cost > 0 && way === 'money' && pay < cost * 0.7;
    court.coins -= pay;
    if (way === 'tax') { court.tax = Math.max(0.5, Math.round((court.tax - 0.25) * 100) / 100); }
    if (way === 'feast') { court.coins -= 0; }
    const k = half ? 0.4 : pay > cost * 1.5 && cost > 0 ? 1.4 : 1;
    court.mood = clamp(court.mood + def.mood * k, 0, 100);
    if (!half) { problem.done = true; court.solved++; }
    else problem.paid = (problem.paid || 0) + pay;
    return { ok: true, spent: pay, half, line: '', mood: def.mood * k, bonus: { f: half ? 2 : 6 + def.sev * 2, s: half ? 0 : 3 + def.sev } };
}

/** A trouble left without an answer: the person's patience runs out — he thinks the worse of the king (per minute open, > 8 min). */
export function neglect(court) {
    const out = [];
    for (const p of court.problems) if (!p.done && court.clock - p.at > 480) out.push(p);
    return out;
}

// ------------------------------------------------------------------ the vizier's words
export const money = (n) => `${Math.floor(n)} ${plural(Math.floor(n), 'монета', 'монеты', 'монет')}`;
function plural(n, a, b, c) { const m = n % 100; if (m >= 11 && m <= 14) return c; const d = n % 10; return d === 1 ? a : d >= 2 && d <= 4 ? b : c; }

export function treasuryLine(court) {
    const c = Math.floor(court.coins);
    const how = c < 80 ? 'Казна почти пуста.' : c < 250 ? 'Казна небогата.' : c < 700 ? 'Казна в порядке.' : 'Казна полна.';
    const tax = court.tax < 1 ? ' Налог сейчас сниженный.' : court.tax > 1 ? ' Налог повышен.' : '';
    return `В казне ${money(c)}. ${how}${tax}`;
}

export function moodLine(court) {
    const m = court.mood;
    return m >= 75 ? 'Народ доволен вами, Ваше Величество.' : m >= 55 ? 'В целом народ спокоен.' : m >= 35 ? 'Народ ропщет, но терпит.' : m >= 18 ? 'Народ недоволен, государь. Это опасно.' : 'Народ на грани бунта, Ваше Величество.';
}

/** The brief report: how many troubles and the most urgent one or two. */
export function briefLine(court, rng = Math.random) {
    const open = court.problems.filter((p) => !p.done).sort((a, b) => PROBLEMS[b.kind].sev - PROBLEMS[a.kind].sev || a.at - b.at);
    if (!open.length) return 'Ваше Величество, всё спокойно: жалоб нет. ' + treasuryLine(court);
    const say = (p) => PROBLEMS[p.kind].vizier.replace('{name}', p.name);
    const lead = open.length === 1 ? `Одно дело: ${say(open[0])}.` : open.length <= 3 ? `Дел ${open.length}. Самое срочное: ${say(open[0])}. Ещё: ${say(open[1])}.` : `Дел накопилось ${open.length}. Самое срочное: ${say(open[0])}.`;
    void rng;
    return `Ваше Величество, позвольте доложить. ${lead} Желаете подробнее?`;
}

export function listLine(court) {
    const open = court.problems.filter((p) => !p.done);
    if (!open.length) return 'Жалоб нет, Ваше Величество.';
    return open.slice(0, 8).map((p, i) => `${i + 1}. ${PROBLEMS[p.kind].title} — ${p.name}`).join('. ') + '.';
}

/** What the vizier says of one trouble, with the ways to answer it and their price. */
export function detailLine(court, problem, knights = 4) {
    const def = PROBLEMS[problem.kind];
    const ways = Object.keys(def.ways).map((w) => { const c = costOf(court, problem, w, knights); return c ? `${WAYS[w].ru} (${money(c)})` : WAYS[w].ru; });
    return `${def.vizier.replace('{name}', problem.name)}. Можно: ${ways.join('; ')}. Или скажите «веди к нему», и я проведу вас к человеку.`;
}

/** The complaint of the person himself, when the king comes to him. */
export function complaint(problem, rng = Math.random) {
    const says = PROBLEMS[problem.kind].says;
    return says[Math.floor(rng() * says.length)];
}

/** What the person says once his trouble is solved (and what he says to a half-answer). */
export function thanks(problem, half = false) {
    return half ? 'Что ж… и на этом спасибо, Ваше Величество. Хоть немного.' : ['Спасибо вам, государь! Вы вернули мне надежду.', 'Благослови вас боги, Ваше Величество!', 'Вот это король! Спасибо!'][problem.id % 3];
}

// ------------------------------------------------------------------ the king's words to the vizier
const L = '(?<![а-яa-z0-9])';
const R = '(?![а-яa-z0-9])';
const RX = {
    problems: new RegExp(`${L}(какие проблемы|что за проблемы|есть проблемы|есть жалобы|какие жалобы|жалобы есть|что нового в замке|что с жителями|как живут люди|как жители|кто недоволен|на что жалуются|доложи о делах|доложите о делах|докладывай о делах|доложи что происходит|что происходит в замке|какие дела в замке|как дела в замке|какие новости в замке|чем недовольны|проблемы жителей|проблемы людей|проблемы замка|что тревожит людей|кого что беспокоит)${R}`),
    treasury: new RegExp(`${L}(сколько в казне|что в казне|сколько денег в казне|сколько у нас денег|сколько денег|сколько золота|как казна|как с казной|как у нас с деньгами|состояние казны|доложи о казне|доложите о казне|казна|что с казной|отчет по казне|отчёт по казне|финансы|как финансы)${R}`),
    mood: new RegExp(`${L}(как настроение (у )?народ\\S*|как народ|что думает народ|что говорит народ|довольны ли люди|довольны люди|как относится народ|настроение (в )?замк\\S*|настроение людей|как люди ко мне относятся|как ко мне относятся)${R}`),
    details: new RegExp(`${L}(подробнее|расскажи подробнее|расскажите подробнее|давай подробнее|давайте подробнее|поподробнее|что именно|что там|в чем дело|в чём дело|говори|рассказывай|слушаю|да подробнее|да рассказывай|ну расскажи|расскажи|ну давай|давай|да)${R}`),
    lead: new RegExp(`${L}(веди (меня )?к (нему|ней|этому|тому|нему человеку)|проведи (меня )?к (нему|ней)|отведи (меня )?к (нему|ней)|покажи (мне )?(его|ее|ту|того)|веди меня|проведи меня|отведи меня|давай к нему|пойдем к нему|пойдём к нему|пойдем посмотрим|пойдём посмотрим|покажи где|покажи кто|покажи человека|я хочу с ним поговорить|хочу поговорить с ним)${R}`),
    next: new RegExp(`${L}(следующ\\S*|дальше|что еще|что ещё|еще что|ещё что|что ещё есть|и еще|и ещё|другое дело|другая проблема|давай следующ\\S*)${R}`),
    auto: new RegExp(`${L}(реши сам|решай сам|разберись сам|разберись с этим|займись этим|займись всем|пусть казначей разберется|делай как знаешь|на твое усмотрение|на твоё усмотрение|ты решай|тебе решать)${R}`),
    later: new RegExp(`${L}(потом|позже|не сейчас|оставь|оставим|пока оставь|подождет|подождёт|отложи|отложим|пусть ждет|пусть ждёт)${R}`),
};
const WAY_RX = [
    ['money', new RegExp(`${L}(выдели|выделить|выдай|выдайте|заплати|заплатите|дай|дайте|отсыпь|отсыпьте|назначь|пожертвуй)( [а-я0-9]+){0,3} (деньги|денег|монет\\S*|золота|золото|рублей|сумму|на это|на то|ему|ей|им)${R}|${L}(выделить|выдели) (из казны|деньги)${R}|${L}(\\d+|десять|двадцать|тридцать|пятьдесят|сто|двести|триста) монет`)],
    ['supplies', new RegExp(`${L}(купи|купите|закупи|закупите|выдай|выдайте|привези|привезите|достань|доставь|раздобудь|обеспечь|обеспечьте)( [а-я]+){0,2} (семена|семян|зерно|зерна|хлеб|хлеба|припасы|припасов|доски|досок|материалы|материалов|камень|камня|еду|еды|продукты|инструменты|инструментов|травы|ингредиенты|ингредиентов|оружие|плуг|гвозди)${R}|${L}(выдай|выдайте) (из запасов|со склада|припасы)${R}`)],
    ['work', new RegExp(`${L}(почините|почини|отремонтируйте|отремонтируй|пусть (починят|построят|выкопают|углубят|отремонтируют|залатают)|пошли(те)? (строителей|работников|рабочих|мастеров)|отправь(те)? (строителей|работников|рабочих|мастеров)|углубите|выкопайте|залатайте|подлатайте|исправьте|восстановите|надо починить|нужно починить)${R}`)],
    ['guard', new RegExp(`${L}(пошли(те)? (стражу|стражников|рыцарей|патруль)|отправь(те)? (стражу|стражников|рыцарей|патруль)|усильте (патруль|охрану|караул)|усиль (патруль|охрану|караул)|выставите (стражу|караул|охрану)|выстави (стражу|караул|охрану)|пусть (стража|рыцари|стражники)( \\S+)? (разберется|разберутся|присмотрит|присмотрят|охраняет|охраняют|патрулируют)|поставь(те)? (стражу|охрану|караул))${R}`)],
    ['feast', new RegExp(`${L}(устрой(те)? (пир|праздник|гулянье|гуляния|застолье)|накрой(те)? столы|раздай(те)? (хлеб|еду) (народу|людям)|пир на весь мир|давайте устроим пир|нужен пир)${R}`)],
    ['tax', new RegExp(`${L}(сниз\\S* налог\\S*|уменьш\\S* налог\\S*|облегч\\S* налог\\S*|освободи(те)? (его|ее|их)? ?от налог\\S*|отмени(те)? налог\\S*|убавь(те)? налог\\S*|налог\\S* (снизить|уменьшить|облегчить))${R}`)],
    ['healer', new RegExp(`${L}(позови(те)? (лекаря|врача|знахаря|целителя)|пошли(те)? (лекаря|врача|знахаря|целителя)|вызови(те)? (лекаря|врача|знахаря|целителя)|лекаря (сюда|к нему|к ней)|нужен лекарь|привед\\S* (лекаря|врача))${R}`)],
    ['word', new RegExp(`${L}(я (поговорю|скажу|выступлю|обращусь)( с| к)? ?(людьми|народом|им|ним|ним)?|поговорю с (людьми|ним|ней|народом)|обращусь к (народу|людям)|успокой(те)? (людей|народ|его|ее)|объясни(те)? (людям|народу|ему|ей)|скажи(те)? (им|ему|ей|людям) (что|чтобы)|пусть знают|вежливо объясни)${R}`)],
    ['judge', new RegExp(`${L}(рассуди(те)?( их)?|я (рассужу|разберу)|приведи(те)? (обоих|соседей)|суди(те)? (их|его)|пусть придут на суд|созови(те)? суд)${R}`)],
];

/** The amount in the words («выдели 50 монет», «сто монет»): a number, or null. */
export function amountOf(t) {
    const NUM = { десять: 10, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90, сто: 100, двести: 200, триста: 300, пятьсот: 500, тысячу: 1000, тысяча: 1000 };
    const m = t.match(/(\d+) ?(монет|золот|руб)?/);
    if (m && /монет|золот|руб|\d{2,}/.test(t)) return parseInt(m[1], 10);
    for (const [w, n] of Object.entries(NUM)) if (new RegExp(`${L}${w}${R}`).test(t)) return n;
    return null;
}

/** What the king said to the vizier about the court → {kind, way?, amount?} or null. */
export function parseCourt(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    // the ways first (they are specific); then the questions
    for (const [way, re] of WAY_RX) if (re.test(t)) return { kind: 'solve', way, amount: way === 'money' ? amountOf(t) : null };
    if (RX.treasury.test(t)) return { kind: 'treasury' };
    if (RX.mood.test(t)) return { kind: 'mood' };
    if (RX.lead.test(t)) return { kind: 'lead' };
    if (RX.auto.test(t)) return { kind: 'auto' };
    if (RX.later.test(t) && t.split(' ').length <= 5) return { kind: 'later' };
    if (RX.problems.test(t)) return { kind: 'problems' };
    if (RX.next.test(t) && t.split(' ').length <= 4) return { kind: 'next' };
    if (RX.details.test(t) && t.split(' ').length <= 3) return { kind: 'details' };
    return null;
}

/** The trouble now discussed (the topic), else the most urgent open one. */
export function currentProblem(court) {
    const open = court.problems.filter((p) => !p.done);
    return open.find((p) => p.id === court.topic) || open.sort((a, b) => PROBLEMS[b.kind].sev - PROBLEMS[a.kind].sev || a.at - b.at)[0] || null;
}

/** The vizier solves it himself within his means: the cheapest fitting way he can afford (never the whole treasury: at most 40 %). */
export function autoSolve(court, problem, knights = 4) {
    const def = PROBLEMS[problem.kind];
    const free = Object.keys(def.ways).filter((w) => costOf(court, problem, w, knights) === 0 && w !== 'tax');
    const order = [...free, ...Object.keys(def.ways).filter((w) => w !== 'tax').sort((a, b) => costOf(court, problem, a, knights) - costOf(court, problem, b, knights))];
    for (const w of order) {
        const c = costOf(court, problem, w, knights);
        if (c <= court.coins * 0.4) return solve(court, problem, w, { knights });
    }
    return { ok: false, line: 'Для этого не хватит средств, не потратив слишком много, Ваше Величество.' };
}
