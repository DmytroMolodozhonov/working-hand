/**
 * Lives.js — a person's own life: a goal of his own (≈200 of them), what he lets a friend have, and whether he will go with the
 * hero on his road (the author: «у каждого персонажа своя цель в жизни, до 200 целей… рыцарь — скорее что-то с рыцарством, но не
 * обязательно… можно уговорить, но не у всех получится: характеры не совпадают… он может сказать: моя цель мне важнее — или:
 * моя цель важна, но я хочу тебе помочь… маг не отдаст дом бесплатно, палочку и деньги не даст, даже будь вы очень сильные друзья —
 * разве что любовь»). Pure (no THREE / DOM): tests/unit/lives.test.js. The character itself is Attitude.characterOf (kindness,
 * helpfulness, obedience, bravery, trust, greed, temper); here we add what is derived from it.
 */

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function rng32(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The themes a goal belongs to (a person's goals and the hero's are compared by them). `road`: can be followed on a journey. */
export const THEMES = {
    valor: { ru: 'доблесть', road: true }, honor: { ru: 'честь', road: true }, justice: { ru: 'справедливость', road: true }, fame: { ru: 'слава', road: true },
    adventure: { ru: 'приключения', road: true }, freedom: { ru: 'свобода', road: true }, revenge: { ru: 'месть', road: true },
    magic: { ru: 'магия', road: true }, knowledge: { ru: 'знания', road: true }, faith: { ru: 'вера', road: true },
    wealth: { ru: 'богатство', road: false }, trade: { ru: 'торговля', road: false }, craft: { ru: 'ремесло', road: false },
    land: { ru: 'земля и хозяйство', road: false }, family: { ru: 'семья', road: false }, peace: { ru: 'покой', road: false },
    love: { ru: 'любовь', road: false }, health: { ru: 'здоровье', road: false },
};

/** ≈200 goals, first person ("Хочу…"), by theme. */
const GOALS = {
    valor: ['стать лучшим мечником во всём королевстве', 'победить в рыцарском турнире', 'выстоять одному против десятка', 'убить настоящего дракона', 'стать командиром стражи', 'научить новобранцев держать строй', 'пройти ночь в логове нежити и вернуться', 'защитить замок от большой орды', 'выковать себе доспех, которому нет равных', 'победить гигантскую паучиху', 'заслужить шпоры за подвиг', 'ни разу не отступить в бою', 'научиться драться двумя мечами', 'победить великана-людоеда в одиночку', 'сразиться с каждым рыцарем замка и ни разу не проиграть'],
    honor: ['умереть с честью, а не в постели', 'вернуть доброе имя своей семье', 'исполнить клятву, данную отцу', 'остаться верным королю до конца', 'не нарушить ни одного обещания за год', 'стать примером для молодых', 'заслужить уважение тех, кто меня презирал', 'ни разу не солгать', 'отдать долг чести человеку, спасшему мне жизнь', 'быть достойным своего оружия', 'спасти честь павшего товарища', 'принять присягу перед всем замком', 'не взять ни одной взятки за всю жизнь'],
    justice: ['наказать воров, что грабят торговцев', 'чтобы слабых в замке никто не обижал', 'найти того, кто подставил моего друга', 'добиться честного суда для бедняков', 'изгнать всех разбойников с дорог', 'раскрыть, кто воровал из казны', 'чтобы налоги собирали по справедливости', 'вывести на чистую воду лжесвидетеля', 'защитить сирот от жадных опекунов', 'навести порядок на рынке', 'чтобы каждый вор получил по заслугам', 'добиться пересмотра несправедливого приговора', 'построить в замке настоящий суд'],
    fame: ['чтобы обо мне пели песни', 'остаться в летописях замка', 'прославиться на всё королевство', 'чтобы моё имя знали в каждой деревне', 'сделать то, чего не делал никто', 'получить титул', 'чтобы меня узнавали на улице', 'совершить подвиг, о котором будут рассказывать внукам', 'сложить песню, которую запоёт весь замок', 'основать династию, о которой будут помнить', 'стать любимцем народа'],
    adventure: ['увидеть далёкие земли за горами', 'найти древний клад', 'дойти до края мира', 'исследовать все пещеры в округе', 'переплыть море', 'найти затерянный город', 'побывать на других планетах', 'пройти путь, о котором все говорят, что он невозможен', 'увидеть северное сияние', 'отыскать источник великой реки', 'найти остров, которого нет на картах', 'повидать драконье гнездо издалека', 'переночевать в каждом замке королевства', 'пройти по всем дорогам королевства', 'увидеть вулкан вблизи', 'найти пещеру, где никто не бывал', 'узнать, что скрыто в самой глубокой пещере'],
    freedom: ['уйти из-под чужой власти', 'жить так, как хочу, и никому не кланяться', 'выкупить себя из долгов', 'накопить на собственный дом и не зависеть ни от кого', 'бросить службу и уйти странствовать', 'больше не бояться стражи', 'чтобы никто мной не командовал', 'построить собственный корабль и уплыть', 'скопить на вольную и уехать на север', 'уйти в лес и жить отшельником'],
    revenge: ['найти тех, кто сжёг мою деревню', 'отомстить зомби за погибшую семью', 'рассчитаться с обидчиком', 'найти убийцу брата', 'вернуть то, что у меня украли', 'вывести пирата, что разорил мой корабль', 'доказать, что меня оболгали', 'заставить того торговца вернуть украденное', 'найти того, кто предал нас в бою', 'проучить задиру, что унижал меня при всех'],
    magic: ['выучить все заклинания древней книги', 'стать великим магом', 'создать собственное заклинание', 'найти свиток, о котором ходят легенды', 'победить мастера башни в дуэли', 'научиться летать без метлы', 'сварить зелье, которое никто не смог повторить', 'понять, откуда берётся мана', 'стать Высшим магом', 'найти посох Ледяной Королевы и изучить его', 'расшифровать старые пентаграммы', 'приручить дракона словом', 'открыть школу магии', 'вернуть утраченное заклинание', 'передать знания достойному ученику', 'найти все тайные библиотеки башен', 'создать волшебную палочку лучше всех', 'зачаровать свой посох так, чтобы он служил поколениям', 'научиться понимать пентаграммы с первого взгляда', 'победить в магической дуэли без единой потери маны', 'найти ингредиент для величайшего зелья', 'создать сад волшебных растений'],
    knowledge: ['написать книгу о всём, что видел', 'узнать, что лежит под замком', 'прочесть все книги библиотеки', 'найти ответ, откуда взялись зомби', 'составить карту всех земель', 'понять язык зверей', 'разгадать тайну древних руин', 'узнать, что за звёздами', 'записать историю этого королевства', 'изучить повадки драконов', 'собрать коллекцию редких трав', 'найти способ лечить болезнь, что унесла мою семью', 'узнать, кто построил старую башню', 'научить читать всех детей замка', 'собрать все легенды о драконах', 'найти потерянную страницу из древней книги'],
    faith: ['построить часовню для людей', 'совершить паломничество к далёкому храму', 'найти знак богов', 'замолить старый грех', 'донести слово богов до тех, кто не знает', 'найти храм богов на Венере', 'спасти хоть одну заблудшую душу', 'сохранить священные книги', 'очистить старую святыню от нежити', 'принести дар богам на самой высокой горе', 'построить колокольню, слышную на весь замок'],
    wealth: ['накопить тысячу золотых', 'разбогатеть и купить дом в городе', 'найти сундук с сокровищами', 'выбраться из нищеты', 'собрать коллекцию драгоценных вещей', 'стать самым богатым в замке', 'откупить землю у короля', 'завести тайный тайник на чёрный день', 'нажить состояние на редких товарах', 'выкупить родовой перстень', 'заработать на приданое дочери', 'скопить на старость и не просить ни у кого'],
    trade: ['открыть свою лавку на главной площади', 'торговать с дальними землями', 'продать самый дорогой товар в жизни', 'собрать самую богатую лавку', 'наладить торговый путь по морю', 'найти поставщика редких специй', 'обогнать соседа-торговца', 'открыть второй прилавок', 'найти покупателя на старую вещь, которую никто не хочет', 'построить рынок шире всех в королевстве', 'открыть лавку редкостей в столице', 'продать вещь самому королю'],
    craft: ['построить дом, который простоит сто лет', 'выковать идеальный меч', 'построить башню выше всех в округе', 'освоить новое ремесло', 'построить мост через реку', 'передать мастерство сыну', 'сделать лучшую в мире дверь', 'обучить подмастерьев', 'построить собственную мастерскую', 'починить старую стену так, чтобы никто не заметил', 'вырезать статую короля', 'сложить печь, в которой хлеб не пригорает', 'научиться ковать зачарованные клинки', 'перестроить старый амбар в красивый дом'],
    land: ['вырастить небывалый урожай', 'расширить своё поле', 'вывести породу самых тучных коров', 'посадить яблоневый сад', 'засеять пустошь у леса', 'вырыть свой колодец', 'сохранить урожай от крыс', 'завести большое стадо', 'вырастить самую большую тыкву', 'собрать урожай без единого зомби в поле', 'вырастить пшеницу, что не боится засухи', 'запастись зерном на три зимы', 'огородить пастбище, чтобы волки не лезли'],
    family: ['увидеть, как вырастут мои дети', 'найти пропавшего брата', 'помириться с отцом', 'построить большой дом для всей семьи', 'вырастить внуков', 'найти сестру, что ушла из дома', 'чтобы семья ни в чём не нуждалась', 'похоронить родных как положено', 'собрать всю семью за одним столом', 'научить сына ремеслу', 'выдать дочь замуж по любви'],
    peace: ['дожить спокойно до старости', 'чтобы в замке не было больше ни одной драки', 'чтобы ночью было не страшно', 'чтобы зомби перестали приходить', 'тихо жить у реки', 'чтобы дети не знали войны', 'просто ничего не бояться', 'чтобы у костра пели, а не плакали', 'прожить год без единой тревоги', 'поставить забор вокруг деревни и спать спокойно'],
    love: ['найти ту единственную', 'признаться в любви', 'сыграть свадьбу под яблонями', 'вернуть расположение любимого человека', 'чтобы меня кто-нибудь по-настоящему полюбил', 'написать любимой письмо, которое она не забудет', 'вернуться к той, что ждёт меня', 'научиться говорить о чувствах', 'подарить любимой цветок, какого нет ни у кого'],
    health: ['вылечить старую рану', 'найти лекарство для больного', 'прожить дольше своих родителей', 'поправить здоровье и больше не хворать', 'найти целебный источник', 'научиться лечить травами', 'пережить зиму без болезней', 'научиться ходить без костыля'],
};
export const GOAL_COUNT = Object.values(GOALS).reduce((n, a) => n + a.length, 0);
export const GOAL_LIST = Object.entries(GOALS).flatMap(([theme, a]) => a.map((text, i) => ({ id: `${theme}.${i}`, theme, text })));

/** How likely each theme is, by role (the rest get a small chance: «не обязательно»). */
const ROLE_THEMES = {
    knight: { valor: 8, honor: 6, justice: 4, fame: 4, adventure: 3, family: 2, revenge: 2, love: 1.5, freedom: 1, peace: 1, faith: 1, land: 0.5, wealth: 1 },
    king: { honor: 6, justice: 4, peace: 4, fame: 3, wealth: 2, family: 2 },
    advisor: { knowledge: 6, justice: 4, honor: 4, peace: 4, wealth: 2, fame: 1.5, family: 1 },
    wizard: { magic: 10, knowledge: 7, adventure: 2, fame: 2, faith: 1, wealth: 1, peace: 1, freedom: 1 },
    merchant: { trade: 8, wealth: 7, adventure: 2, family: 2, freedom: 1.5, fame: 1, love: 1 },
    seller: { trade: 8, wealth: 6, family: 2, love: 1.5, freedom: 1 },
    builder: { craft: 9, family: 3, wealth: 2, peace: 2, fame: 1.5, love: 1, freedom: 1 },
    farmer: { land: 9, family: 5, peace: 4, health: 2, wealth: 2, love: 1.5, faith: 1.5, freedom: 1 },
    sailor: { adventure: 8, freedom: 5, wealth: 3, revenge: 2, fame: 2, love: 1.5, valor: 2 },
    traveler: { adventure: 7, freedom: 4, wealth: 3, knowledge: 2, fame: 2, love: 2 },
};
const OTHER = 0.35; // every other theme: a small chance — "не обязательно"

/** A person's goal from his seed and role — the same every time he is met. `flex`: how easily he sets it aside for a friend (0 stubborn … 1 pliant). */
export function goalOf(seed, role = 'farmer', wizard = false) {
    const r = rng32(((seed >>> 0) ^ 0x9e3779b1) >>> 0);
    const key = wizard ? 'wizard' : ROLE_THEMES[role] ? role : 'traveler';
    const w = ROLE_THEMES[key];
    const themes = Object.keys(THEMES);
    let sum = 0; const ws = themes.map((t) => { const x = w[t] ?? OTHER; sum += x; return x; });
    let x = r() * sum, theme = themes[0];
    for (let i = 0; i < themes.length; i++) { x -= ws[i]; if (x <= 0) { theme = themes[i]; break; } }
    const pool = GOAL_LIST.filter((g) => g.theme === theme);
    const g = pool[Math.floor(r() * pool.length)];
    return { ...g, importance: Math.round((0.35 + r() * 0.65) * 100) / 100, flex: Math.round(r() * 100) / 100 };
}

export const goalLine = (g) => `Моя цель — ${g.text}.`;

// ------------------------------------------------------------------ the hero's goal, in words
const HERO_THEMES = [
    [/(дракон|победить|убить|сразить|воева|бой|битв|турнир|рыцар|армию|орду|зомби|паук)/, ['valor', 'adventure']],
    [/(найти|искать|поход|путешеств|исследов|открыть|клад|сокровищ|карт|планет|пещер|земл[ие]\s+за|остров)/, ['adventure', 'knowledge']],
    [/(маг|заклинани|колдов|палочк|зелье|пентаграмм|волшеб|башн)/, ['magic', 'knowledge']],
    [/(золот|богат|монет|денег|торгов|лавк)/, ['wealth', 'trade']],
    [/(постро|замок|дом|крепост|башню|мост|ремесл)/, ['craft']],
    [/(король|корол|трон|править|власт|захват|корону)/, ['honor', 'fame']],
    [/(защит|спасти|спас|мир|покой|безопасн)/, ['peace', 'justice']],
    [/(месть|отомст|наказ|справедлив|накажу)/, ['revenge', 'justice']],
    [/(свобод|независим)/, ['freedom']],
    [/(слав|известн|легенд)/, ['fame']],
    [/(знани|книг|узнать|понять|изучить)/, ['knowledge']],
    [/(бог|храм|вер[аыу])/, ['faith']],
    [/(любов|женить|свадьб)/, ['love']],
];

/** The themes of what the hero says his goal is («моя цель — убить дракона»). */
export function heroThemes(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    const out = new Set();
    for (const [re, th] of HERO_THEMES) if (re.test(t)) for (const x of th) out.add(x);
    return [...out];
}

/** What the person feels about the hero's goal and his own. 0 … 1: how well they fit. */
export function fit(goal, themes) {
    if (!goal || !themes?.length) return 0;
    if (themes.includes(goal.theme)) return 1;
    // neighbours: valor with honor, magic with knowledge, adventure with freedom…
    const NEAR = { valor: ['honor', 'justice', 'fame', 'adventure'], honor: ['valor', 'justice'], magic: ['knowledge', 'adventure'], knowledge: ['magic', 'adventure'], adventure: ['freedom', 'fame', 'knowledge', 'valor'], wealth: ['trade'], trade: ['wealth'], justice: ['honor', 'peace', 'valor'], peace: ['justice', 'family'], fame: ['valor', 'adventure'] };
    return (NEAR[goal.theme] || []).some((x) => themes.includes(x)) ? 0.5 : 0;
}

// ------------------------------------------------------------------ the road together
/**
 * Will he go with the hero? `eff` the bars {sub, fr, lv}; `c` the character; `goal` his goal; `hero` the hero's goal themes (or []).
 * → {answer: 'join'|'help'|'later'|'refuse', why, days?}
 *   join    gladly: goes on without a term;
 *   help    «моя цель важна, но я хочу тебе помочь»: goes for a while (`minutes`), then goes his own way;
 *   later   «не сейчас» — close, but his own thing first;
 *   refuse  «нет»: not friends enough, or his goal / his nature says no.
 */
export function roadTogether(eff, c, goal, hero = [], { role = 'farmer', king = false } = {}) {
    const ch = c || {};
    const bond = eff.fr * 0.6 + eff.lv * 0.6 + (king ? eff.sub * 0.1 : 0);
    const f = fit(goal, hero);
    const homebody = !THEMES[goal?.theme]?.road;
    const need = 28 + (goal?.importance ?? 0.5) * 30 - f * 22 + (homebody ? 22 : 0) - ((ch.brave ?? 50) - 50) * 0.12 + ((ch.temper ?? 50) - 50) * 0.08 - ((ch.helpful ?? 50) - 50) * 0.1 + (role === 'king' ? 100 : 0);
    if (eff.fr < 10 && eff.lv < 10) return { answer: 'refuse', why: 'stranger', need: Math.round(need) };
    if (bond >= need + 10) return { answer: 'join', why: f >= 0.5 ? 'shared' : 'friend', need: Math.round(need) };
    if (bond >= need && (goal?.flex ?? 0.5) >= 0.3) return { answer: 'help', why: 'help', minutes: 8 + Math.round((ch.helpful ?? 50) / 10) * 2, need: Math.round(need) };
    if (bond >= need - 14) return { answer: 'later', why: homebody ? 'home' : 'goal', need: Math.round(need) };
    return { answer: 'refuse', why: (goal?.importance ?? 0.5) > 0.7 ? 'goal' : 'bond', need: Math.round(need) };
}

/** The reasons said in his words. */
export const ROAD_LINES = {
    join: ['Идём! Давно хотелось сменить обстановку.', 'С тобой — хоть на край света.', 'Ну, раз ты зовёшь — идём вместе!'],
    shared: ['Твоя цель мне близка. Идём — вместе веселее!', 'О, это как раз по моей части! Я с тобой.'],
    help: ['У меня свои дела, но тебе помогу — на какое-то время.', 'Моя цель важна, но друзей не бросают. Пойду с тобой, пока не понадоблюсь дома.'],
    later: ['Не сейчас. Дай сперва закончить своё — потом, может, и пойду.', 'Хотелось бы, но у меня свои заботы. Спроси позже.'],
    home: ['Я не могу бросить дом и хозяйство. Не обижайся.', 'Мне здесь надо быть — тут моё дело.'],
    stranger: ['Мы же едва знакомы. С чего бы мне идти с тобой?', 'Я тебя почти не знаю. Нет.'],
    bond: ['Мы не настолько близки, чтобы я бросил всё и пошёл.', 'Прости, но нет. Пока нет.'],
    goal: ['Моя цель мне важнее. Прости, я не могу.', 'У меня есть дело всей жизни. Я не уйду с твоей дороги — но и не пойду по ней.'],
    nature: ['Я не люблю дороги. Нет.'],
};

// ------------------------------------------------------------------ what a friend may have
/**
 * What he lets the hero have, and how close they must be: rummage, the home, small money, great money, his weapon / wand, his house.
 * (the author: a wizard will not give his house for nothing — at most "полазить"; no wand, no money — unless there is love)
 */
export const ASKS = {
    enter: { fr: 40, lv: 55, ru: 'войти в дом' },
    rummage: { fr: 58, lv: 66, ru: 'порыться в вещах' },
    loan: { fr: 72, lv: 60, ru: 'одолжить немного денег', greedy: true },
    purse: { fr: 96, lv: 78, ru: 'отдать много денег', greedy: true },
    tool: { fr: 94, lv: 82, ru: 'отдать своё оружие или инструмент' },
    wand: { fr: 101, lv: 92, ru: 'отдать свою палочку' }, // fr 101 can never be met by friendship alone: love only
    house: { fr: 101, lv: 100, ru: 'отдать дом' },
};

/** How much more a greedy or a wizardly person asks: wizards guard their things (their house, wand, money). */
export function askNeeds(ask, c, role = 'farmer', wizard = false) {
    const a = ASKS[ask];
    if (!a) return null;
    const greed = ((c?.greed ?? 35) - 35) * (a.greedy ? 0.25 : 0.1);
    const trust = ((c?.trust ?? 45) - 45) * -0.08;
    const guard = wizard && ['loan', 'purse', 'wand', 'tool', 'house', 'rummage'].includes(ask) ? 8 : 0; // a wizard keeps his things closer
    return { fr: a.fr >= 101 ? 101 : clamp(a.fr + greed + trust + guard, 20, 100), lv: clamp(a.lv + greed * 0.6, 20, 100) }; // (love opens a wizard's hand as it opens anyone's)
}

/** May the hero ask this of him? → {yes, by: 'friend'|'love'|null, need}. */
export function mayAsk(ask, eff, c, role = 'farmer', wizard = false) {
    const n = askNeeds(ask, c, role, wizard);
    if (!n) return { yes: false, by: null };
    if (eff.lv >= n.lv) return { yes: true, by: 'love', need: n };
    if (eff.fr >= n.fr) return { yes: true, by: 'friend', need: n };
    return { yes: false, by: null, need: n };
}

export const ASK_LINES = {
    enter: { yes: ['Заходи, не стесняйся.', 'Конечно, входи. Для друга — всегда открыто.'], no: ['В дом? Мы пока не так близки.', 'Нет, дом — не место для посторонних.'] },
    rummage: { yes: ['Можешь посмотреть, что там есть. Только аккуратно.', 'Лазь, где хочешь — у меня от тебя секретов нет.'], no: ['Рыться в моих вещах? Нет уж.', 'Это мои вещи. Не дам.'] },
    loan: { yes: ['Ладно, немного одолжу — но верни.', 'Держи, сколько могу. Верну — хорошо, нет — не обижусь.'], no: ['Денег? Нет, не одолжу.', 'Сам считаю каждую монету. Прости.'] },
    purse: { yes: ['Бери… для тебя ничего не жалко.', 'Всё, что есть, твоё. Только береги себя.'], no: ['Много денег? Ты шутишь.', 'Нет. Такие деньги я не отдаю никому.'] },
    tool: { yes: ['Бери. Мне будет спокойнее, если это у тебя.', 'Моё оружие — твоё. Не посрами.'], no: ['Своё оружие не отдам. Оно — часть меня.', 'Нет. Это я не отдаю.'] },
    wand: { yes: ['Палочка… ты — единственный, кому бы я её доверил. Бери.', 'Это моя жизнь, но тебе я отдам её.'], no: ['Палочку? Ни за что. Даже не проси.', 'Свою палочку не отдаю никому.'] },
    house: { yes: ['Живи тут. Дом — твой, я найду себе другой.', 'Для тебя — хоть дом.'], no: ['Дом? Ты в своём уме?', 'Дом не отдам. Это всё, что у меня есть.'] },
};

// ------------------------------------------------------------------ reactions to what the hero does
/**
 * He watches a spell: impressed, indifferent or sneering — by his nature, his mood and how the spell was.
 * `power` 0…1 (a small spark … a great one), `eff` the bars, `mood` −1…1, `c` the character, `roll` 0…1.
 * → {kind: 'wow'|'nice'|'meh'|'sneer'|'afraid', f: change of friendship}
 */
export function reactToMagic(power, eff, c, mood = 0, roll = 0.5, { wizard = false } = {}) {
    const ch = c || {};
    const awe = power * 60 + ((ch.trust ?? 45) - 45) * 0.3 + ((ch.kindness ?? 55) - 55) * 0.25 + mood * 25 + eff.fr * 0.15 + (roll - 0.5) * 30 - (wizard ? 22 : 0);
    const fear = ((ch.brave ?? 50) < 30 ? 10 : 0) + (power > 0.7 ? 14 : 0) - (ch.brave ?? 50) * 0.15 - eff.fr * 0.1;
    if (fear >= 18) return { kind: 'afraid', f: -0.5 }; // (the timid are frightened even when it is wonderful)
    if (awe >= 40) return { kind: 'wow', f: 2 };
    if (awe >= 22) return { kind: 'nice', f: 1 };
    if (awe >= 8) return { kind: 'meh', f: 0 };
    return { kind: 'sneer', f: (ch.kindness ?? 55) < 40 || mood < -0.2 ? -1.5 : -0.5 };
}

export const MAGIC_LINES = {
    wow: ['Ого! Вот это да!', 'Ничего себе! Как ты это делаешь?', 'Потрясающе!', 'Вот это сила!', 'Невероятно!'],
    nice: ['Неплохо, неплохо.', 'Красиво.', 'Ловко это у тебя выходит.', 'А ты умеешь, оказывается.'],
    meh: ['Хм. Ну да.', 'Ну… видал и получше.', 'Ага. Занятно.'],
    sneer: ['Слабовато.', 'И это всё? Я думал, будет эффектнее.', 'Ой, было бы чем хвастаться.', 'Фокусы для детей.'],
    afraid: ['Ой… убери это от меня!', 'Не надо так! Страшно же.', 'Осторожнее, ты же людей напугаешь!'],
};

/** Tired of the friendship (the author: «в какой-то момент скажет: всё, я устал дружить»): chance per minute. */
export function burnoutChance(eff, c, { minutesSinceTalk = 0, grievances = 0, recentMean = 0 } = {}) {
    if (eff.fr < 8) return 0;
    const ch = c || {};
    let p = 0;
    p += Math.max(0, minutesSinceTalk - 25) * 0.0015; // forgotten
    p += grievances * 0.02; // he was wronged, again and again
    p += recentMean * 0.03;
    p += ((ch.temper ?? 35) - 35) * 0.0003;
    p -= ((ch.kindness ?? 55) - 55) * 0.0004 + eff.lv * 0.0006;
    return clamp(p, 0, 0.35);
}
export const BURNOUT_LINES = ['Знаешь, я устал от этой дружбы. Не обижайся, но хватит.', 'Мне надоело так дружить. Давай каждый сам по себе.', 'Всё, не хочу больше. Ты мне стал чужим.', 'Прости, но я больше не хочу дружить. Это не для меня.'];
export const LEAVE_LINES = ['Мне пора — моя цель сама себя не выполнит. Береги себя!', 'Дальше я пойду своей дорогой. Спасибо, что был рядом.', 'Здесь наши дороги расходятся. Удачи!'];
export const GOODBYE_LINES = ['Ну, бывай. Если что — найдёшь меня.', 'Хорошо, остаюсь. Заходи, когда захочешь.'];

/** Ask-for-help: whether a friend steps in for the hero's cause (needs `roadTogether`'s help/join). */
export const CHAT_GOAL = (g) => `Знаешь, моя цель — ${g.text}.`;

// ------------------------------------------------------------------ standing up for the hero
/**
 * Will he step in when the hero is attacked — of his own will, not because he was told (the author: «если на тебя нападают, он пойдёт
 * защищать тебя, вступит в бой — сам, потому что у вас взаимоотношения»)? A friend, a lover, a man who owes duty, a companion on the road;
 * the brave sooner, the timid not. → 0…100; he steps in from `DEFEND_AT`.
 */
export const DEFEND_AT = 38;
export function defendDesire(eff, c, { companion = false, king = false } = {}) {
    const ch = c || {};
    const bond = eff.fr * 0.5 + eff.lv * 0.6 + (king ? Math.max(0, eff.sub) * 0.2 : Math.max(0, eff.sub) * 0.08);
    return Math.round(bond + ((ch.brave ?? 50) - 50) * 0.4 + ((ch.helpful ?? 50) - 50) * 0.2 + (companion ? 25 : 0) - Math.max(0, -eff.fr) * 0.5);
}

/** What a friend says when the hero attacks someone (so: "зачем ты напал?"), by his nature; or cheers when the victim was an enemy. */
export function reproach(eff, c, { justified = false, roll = 0.5 } = {}) {
    const ch = c || {};
    if (justified) return { kind: 'cheer', f: 0.8, line: pick(['Правильно! Так им и надо!', 'Молодец, не дал спуску!', 'Вовремя ты его!'], roll) };
    if (eff.fr < 22 && eff.lv < 22) return null; // (a stranger says nothing: it is not his business)
    if ((ch.temper ?? 35) >= 60) return { kind: 'angry', f: -3, line: pick(['Ты с ума сошёл?! Зачем ты на него напал?!', 'Ты что творишь?! Прекрати немедленно!', 'Я думал, ты не такой! Зачем?!'], roll) };
    if ((ch.kindness ?? 55) >= 55) return { kind: 'sad', f: -1.5, line: pick(['Зачем ты напал? Он же ничего тебе не сделал…', 'Не надо так, прошу тебя. Это неправильно.', 'Мне больно на это смотреть. Зачем?'], roll) };
    return { kind: 'cold', f: -1, line: pick(['Твоё дело. Но я бы так не поступил.', 'Зря ты так.', 'Хм. Не ожидал от тебя.'], roll) };
}
const pick = (a, r = 0.5) => a[Math.min(a.length - 1, Math.floor(r * a.length))];
