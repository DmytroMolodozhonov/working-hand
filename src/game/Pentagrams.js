/**
 * Pentagrams.js — таблица пентаграмм (`PENTAGRAMS`): id, dark, glow, рисунок. Другие пентаграммы (дьявольской силы, телепортации,
 * жизни, ремонта брони, горгулий, монстра, зачарования) добавляются СЮДА ЖЕ строкой `PENTAGRAMS.<id> = {...}` (см. `registerPentagram`).
 *
 * Рисунок — данные для распознавания и для отрисовки: `ring` (круг, доля радиуса), `star` (число лучей звезды; 5 — пентаграмма),
 * `skip` (через сколько вершин соединять), `gaps` (разорванные линии звезды — индексы), `lines` — готовые линии по точкам кольца (PentagramFigures.js). У каждой пентаграммы СВОЙ рисунок (фигура, не цвет): tests/unit/pentagram-figures.test.js.
 */

import { MONSTER_PENTAGRAM } from './PentagramMonster.js';
import { BREAKWARD_LINES, GARGOYLE_LINES } from './PentagramFigures.js';

export const PENTAGRAMS = {
    // «Пентаграмма страшного монстра»: круг и оскаленная пасть (четыре клыка, челюсть дугой); встал в круг — 200 маны — ×7 на 10 минут (PentagramMonster.js, MonsterTransform.js)
    monster: MONSTER_PENTAGRAM,
    breakward: {
        id: 'breakward',
        title: 'Слом магической защиты',
        once: true, // одноразовая: после срабатывания гаснет и исчезает (метка остаётся до смерти)
        dark: true, // чёрная магия: +1 к уровню за использование (Breakward.js)
        glow: 0x8a0f24, // тёмно-багровый
        cost: 50, // маны, когда встаёшь
        scroll: 'BreakwardScroll', // сжечь свиток — узнать рисунок
        // круг + разорванное кольцо с молнией-трещиной (PentagramFigures.BREAKWARD_LINES): свой рисунок, не звезда
        lines: BREAKWARD_LINES,
    },
    gargoyles: {
        id: 'gargoyles',
        title: 'Адские горгульи',
        once: true, // после вылета последней горгульи выжигается навсегда и больше не работает; земля вокруг остаётся чёрной (Gargoyles.js)
        dark: true, // чёрная магия: +1 к уровню за каждое использование (addDark 'ritual')
        glow: 0xff2a10, // тёмно-красный адский
        cost: 150, // маны сразу, когда рисунок удался; меньше — ничего не списывается и ритуал не начинается
        scroll: 'GargoylePentagram',
        // круг + морда вершиной вниз с двумя рогами и крыльями (PentagramFigures.GARGOYLE_LINES): свой рисунок, не звезда
        lines: GARGOYLE_LINES,
        use: 'gargoyles.startRitual', // game.gargoyles.startRitual(center, { by }) — GargoyleRules.GARGOYLE_PENTAGRAM.use
    },
};

export const registerPentagram = (def) => { PENTAGRAMS[def.id] = def; };
export const pentagram = (id) => PENTAGRAMS[id] || null;
