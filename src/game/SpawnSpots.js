/**
 * SpawnSpots.js — «Где появиться» в настройках героя Творческого мира (HeroSetup.spawn; применяет HeroApply).
 * Автор: проверять каждого босса отдельно — герой появляется (при входе и после возрождения) рядом с ним.
 * Чистые правила: таблица точек и безопасное место (не в воде, не в блоке). Игровая часть — HeroApply.spawnTo.
 *
 * Точки берутся из Творческой площадки (она у каждого Творческого мира одна и та же): гора дракона и дворец Ледяной
 * Королевы стоят на горе TEST_CAVE, замок короля — «близкий замок» площадки (клетка 0, −1). Они в пределах дальности
 * прорисовки от старта, поэтому земля там уже есть: ждать её не приходится, и землю в кадре не делаем (`landMade`).
 * Не нашлось в Творческом (стоят где придётся по семени мира, на старте их нет): башня волшебников, паучиха, чёрный корабль,
 * корабль без моряков — их точек пока нет (в отчёте автору).
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
]);

export const SPAWN_IDS = SPAWN_SPOTS.map((s) => s.id);
export const spawnLabel = (id) => SPAWN_SPOTS.find((s) => s.id === id)?.label || SPAWN_SPOTS[0].label;
export const normalizeSpawn = (id) => (SPAWN_IDS.includes(id) ? id : 'start');

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
