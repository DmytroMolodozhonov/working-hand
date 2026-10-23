/**
 * Pentagrams.js — таблица пентаграмм (`PENTAGRAMS`): id, dark, glow, рисунок. Другие пентаграммы (дьявольской силы, телепортации,
 * жизни, ремонта брони, горгулий, монстра, зачарования) добавляются СЮДА ЖЕ строкой `PENTAGRAMS.<id> = {...}` (см. `registerPentagram`).
 *
 * Рисунок — данные для распознавания и для отрисовки: `ring` (круг, доля радиуса), `star` (число лучей звезды; 5 — пентаграмма),
 * `skip` (через сколько вершин соединять), `gaps` (разорванные линии звезды — индексы), `crack` (зигзаг-трещина через центр, точки в долях радиуса).
 */

export const PENTAGRAMS = {
    breakward: {
        id: 'breakward',
        title: 'Слом магической защиты',
        once: true, // одноразовая: после срабатывания гаснет и исчезает (метка остаётся до смерти)
        dark: true, // чёрная магия: +1 к уровню за использование (Breakward.js)
        glow: 0x8a0f24, // тёмно-багровый
        cost: 50, // маны, когда встаёшь
        scroll: 'BreakwardScroll', // сжечь свиток — узнать рисунок
        // круг + звезда с РАЗОРВАННЫМ щитом: две линии звезды обрываются, поперёк — трещина; отличается от целой звезды других пентаграмм
        shape: { ring: 1, star: 5, skip: 2, gaps: [1, 3], crack: [[-0.55, 0.28], [-0.2, 0.05], [0.1, 0.3], [0.38, -0.12], [0.62, 0.08]], shieldArc: [0.1, 0.4] },
    },
    gargoyles: {
        id: 'gargoyles',
        title: 'Адские горгульи',
        once: true, // после вылета последней горгульи выжигается навсегда и больше не работает; земля вокруг остаётся чёрной (Gargoyles.js)
        dark: true, // чёрная магия: +1 к уровню за каждое использование (addDark 'ritual')
        glow: 0xff2a10, // тёмно-красный адский
        cost: 150, // маны сразу, когда рисунок удался; меньше — ничего не списывается и ритуал не начинается
        scroll: 'GargoylePentagram',
        // круг + ПЕРЕВЁРНУТАЯ звезда (лучом вниз) с двумя рогами над кругом и крыльями по бокам (GargoyleRules.GARGOYLE_DRAW)
        shape: { ring: 1, star: 5, skip: 2, inverted: true, horns: true, wings: true },
        use: 'gargoyles.startRitual', // game.gargoyles.startRitual(center, { by }) — GargoyleRules.GARGOYLE_PENTAGRAM.use
    },
};

export const registerPentagram = (def) => { PENTAGRAMS[def.id] = def; };
export const pentagram = (id) => PENTAGRAMS[id] || null;
