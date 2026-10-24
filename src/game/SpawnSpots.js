/**
 * SpawnSpots.js — «Где появиться» в настройках героя Творческого мира (HeroSetup.spawn; применяет HeroApply).
 * Автор: проверять каждого босса отдельно — герой появляется (при входе и после возрождения) рядом с ним.
 * Чистые правила: таблица точек и безопасное место (не в воде, не в блоке). Игровая часть — HeroApply.spawnTo.
 *
 * Точки берутся из Творческой площадки (она у каждого Творческого мира одна и та же): гора дракона и дворец Ледяной
 * Королевы стоят на горе TEST_CAVE, замок короля — «близкий замок» площадки (клетка 0, −1). Они в пределах дальности
 * прорисовки от старта, поэтому земля там уже есть: ждать её не приходится, и землю в кадре не делаем (`landMade`).
 * Дальние места (стоят где придётся по семени мира, в сотнях метров и дальше): башня волшебников, арена дуэлей, поселение
 * волшебников, логово паучихи, чёрный корабль, порт. Их точку считает `farTarget` (чистая функция по данным мира); герой
 * сначала зависает над ней, пока воркеры не принесли землю (`HeroApply.step`), и только потом встаёт на твёрдое.
 * Храм богов на Венере сюда не входит: до него можно долететь только через космос, это не «старт».
 */

import { TEST_CAVE, TEST_DRAGON_SPOT } from '../world/Terrain.js';

/** Сколько метров от босса: безопасно (не внутри него, не в его зоне поражения), но видно. */
export const SPOT_DIST = { dragon: 55, queen: 40, castleGate: 0 };

/** Точки появления. `where`: 'start' | 'dragon' | 'queen' | 'castle'. */
export const SPAWN_SPOTS = Object.freeze([
    { id: 'start', label: 'Начальная площадка', hint: 'Как раньше: рядом с постаментами, где лежат оружие и свитки.' },
    { id: 'dragon', label: 'У горы дракона', hint: 'Рядом со спящим драконом на вершине Творческой горы — в 55 метрах от него. Удобно проверять дракона отдельно.' },
    { id: 'queen', label: 'У Ледяной Королевы', hint: 'Перед дворцом Ледяной Королевы у подножия горы. Удобно проверять Королеву, снеговиков и ледяных монстров.' },
    { id: 'castle', label: 'У замка короля', hint: 'У ворот ближнего замка Творческой площадки: король, рыцари, жители и торговцы.' },
    { id: 'port', label: 'В порту', hint: 'На причале порта у замка Творческой площадки: рядом стоят корабли с командой. Удобно проверять моряков и корабли.' },
    { id: 'tower', label: 'У башни волшебников', hint: 'У входа в башню волшебников — единственную в мире. Внутри живёт её глава. Если до башни далеко, вас перенесёт туда: подождите несколько секунд, пока загрузится земля.' },
    { id: 'arena', label: 'У арены дуэлей', hint: 'У ворот арены дуэлей рядом с башней волшебников — там, где волшебники сражаются. Если арены рядом с башней нет, вы окажетесь у арены поселения волшебников.' },
    { id: 'village', label: 'В поселении волшебников', hint: 'На площади ближнего поселения волшебников: жители, библиотека и магазин свитков.' },
    { id: 'spider', label: 'У логова паучихи', hint: 'Рядом с логовом ближайшей гигантской паучихи. Она выходит из логова ночью — днём вы увидите только паутину и пещеру.' },
    { id: 'blackship', label: 'На чёрном корабле', hint: 'На палубе чёрного корабля капитана Чёрные Усы, посреди открытого моря. Капитан и скелеты на борту. Хотите без них — включите «Корабли без моряков».' },
]);

export const SPAWN_IDS = SPAWN_SPOTS.map((s) => s.id);
export const spawnLabel = (id) => SPAWN_SPOTS.find((s) => s.id === id)?.label || SPAWN_SPOTS[0].label;
export const normalizeSpawn = (id) => (SPAWN_IDS.includes(id) ? id : 'start');

/** Дальше этого от героя (м) место считается дальним: его землю ещё надо дождаться. */
export const FAR_SPOT = 150;

const fin = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const faceTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

/** Точка в `dist` метрах от `anchor` в сторону `from` (по умолчанию — к постаментам). */
export function pointToward(anchor, from = { x: 0, z: 0 }, dist = 40) {
    const dx = from.x - anchor.x, dz = from.z - anchor.z, d = Math.hypot(dx, dz) || 1;
    return { x: Math.round(anchor.x + dx / d * dist), z: Math.round(anchor.z + dz / d * dist) };
}

/**
 * Желаемая точка спота (без высоты). `ctx.castleGate()` — ворота замка площадки (или null).
 * @returns {{x:number,z:number,yaw:number}|null} null — у спота нет точки (по умолчанию — старт)
 */
export function spotTarget(id, ctx = {}) {
    if (id === 'dragon') {
        const p = pointToward(TEST_DRAGON_SPOT, { x: 0, z: 0 }, SPOT_DIST.dragon);
        return { ...p, yaw: Math.atan2(TEST_DRAGON_SPOT.x - p.x, TEST_DRAGON_SPOT.z - p.z) };
    }
    if (id === 'queen') {
        const c = { x: TEST_CAVE.X - 6, z: TEST_CAVE.Z - 4 }; // (the palace's centre: Terrain.IceCastleSite)
        const p = pointToward(c, { x: 0, z: 0 }, 26 + SPOT_DIST.queen * 0.5);
        return { ...p, yaw: Math.atan2(c.x - p.x, c.z - p.z) };
    }
    if (id === 'castle') {
        const g = ctx.castleGate?.();
        return g && Number.isFinite(g.x) && Number.isFinite(g.z) ? { x: Math.round(g.x), z: Math.round(g.z), yaw: Number.isFinite(g.yaw) ? g.yaw : 0 } : null;
    }
    return null;
}

/**
 * Дальние места по данным мира `data` (`data.sites`: towers / arenas / villages) — без землекопания и без кадровой работы.
 * @param {string} id  башня / арена / поселение / порт
 * @param {{sites?:object, test?:boolean, seed?:number}} data
 * @param {{port?:()=>({x:number,z:number}|null)}} ctx  `port()` — причал порта Творческой площадки
 * @returns {{x:number,z:number,yaw:number}|null}  null — такого места в мире нет
 */
export function farTarget(id, data, ctx = {}) {
    const S = data?.sites;
    if (id === 'tower') {
        const t = S?.towers?.only?.();
        if (!t || !fin(t.gate)) return null;
        return { x: Math.round(t.gate.x), z: Math.round(t.gate.z), yaw: Number.isFinite(t.gateYaw) ? t.gateYaw : 0 };
    }
    if (id === 'arena') {
        const a = S?.arenas?.ofTower?.(S.towers?.only?.()) || S?.arenas?.ofVillage?.(S?.villages?.spawnVillage?.());
        const g = a?.gates?.[0]?.out;
        if (!a || !fin(g)) return null;
        return { x: Math.round(g.x), z: Math.round(g.z), yaw: a.centre ? faceTo(g, a.centre) : 0 };
    }
    if (id === 'village') {
        const v = S?.villages?.spawnVillage?.();
        if (!v) return null;
        const tp = S.villages.tpSpot?.(v.gx, v.gz);
        const p = fin(tp) ? tp : { x: v.x, z: v.z };
        return { x: Math.round(p.x), z: Math.round(p.z), yaw: faceTo(p, { x: v.x, z: v.z }) };
    }
    if (id === 'port') {
        const p = ctx.port?.();
        return fin(p) ? { x: Math.round(p.x), z: Math.round(p.z), yaw: Math.PI } : null; // (the sea lies to −z: Castles.testSeaCastleSpot)
    }
    return null;
}

/**
 * Ячейки вокруг старта от ближней к дальней — где искать логово паучихи (по одной за кадр: каждая ячейка может строить пещеры).
 * @returns {{gx:number,gz:number}[]}
 */
export function lairCells(cell, rings = 6, from = { x: 0, z: 0 }) {
    const cx = Math.floor(from.x / cell), cz = Math.floor(from.z / cell), out = [];
    for (let dz = -rings; dz <= rings; dz++) for (let dx = -rings; dx <= rings; dx++) out.push({ gx: cx + dx, gz: cz + dz, d: Math.hypot((cx + dx + 0.5) * cell - from.x, (cz + dz + 0.5) * cell - from.z) });
    return out.sort((a, b) => a.d - b.d || a.gx - b.gx || a.gz - b.gz).map(({ gx, gz }) => ({ gx, gz }));
}

/** Точка у логова паучихи: в 28 м от него, ближе к старту (вход в логово — не под ногами). */
export const spiderSpot = (lair, from = { x: 0, z: 0 }) => {
    const p = pointToward(lair, from, 28);
    return { x: p.x, z: p.z, yaw: faceTo(p, lair) };
};

/**
 * Безопасное место у цели: сама цель, потом кольца вокруг неё. `ok(x, z)` — сухая земля (не вода, не внутри блока).
 * @returns {{x:number,z:number}|null}
 */
export function safeNear(t, ok, { rings = [0, 3, 6, 10, 16], around = 8 } = {}) {
    for (const r of rings) {
        const n = r === 0 ? 1 : around;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const x = Math.round(t.x + Math.cos(a) * r), z = Math.round(t.z + Math.sin(a) * r);
            if (ok(x, z)) return { x, z };
        }
    }
    return null;
}
