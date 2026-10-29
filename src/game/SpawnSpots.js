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
import { iceApproach } from '../world/IceCastle.js';
import { denSpots, denAxisPoints } from '../world/SpiderDens.js';

/** Сколько метров от босса: безопасно (не внутри него, не в его зоне поражения), но видно. */
export const SPOT_DIST = { dragon: 55, queen: 40, castleGate: 0 };

/** Точки появления. `where`: 'start' | 'dragon' | 'queen' | 'castle'. */
export const SPAWN_SPOTS = Object.freeze([
    { id: 'start', label: 'Начальная площадка', hint: 'Как раньше: рядом с постаментами, где лежат оружие и свитки.' },
    { id: 'dragon', label: 'У горы дракона', hint: 'Настоящее логово дракона: огромная пещера в большой горе, вы у её входа, дракон спит внутри на своём сокровище. Рядом больше никого — ни Ледяной Королевы, ни замков. Удобно проверять дракона отдельно. Если до логова далеко, вас перенесёт туда: подождите несколько секунд, пока загрузится земля.' },
    { id: 'queen', label: 'У Ледяной Королевы', hint: 'Далеко от начальной площадки, на ледяной горе: уступ перед дворцом Ледяной Королевы и ледяная лестница к нему. Рядом больше никого — ни дракона, ни замков. Удобно проверять Королеву, снеговиков и ледяных монстров. Если далеко, вас перенесёт туда: подождите несколько секунд, пока загрузится земля.' },
    { id: 'castle', label: 'У замка короля', hint: 'У ворот ближнего замка Творческой площадки: король, рыцари, жители и торговцы.' },
    { id: 'port', label: 'В порту', hint: 'На причале порта у замка Творческой площадки: рядом стоят корабли с командой. Удобно проверять моряков и корабли.' },
    { id: 'tower', label: 'У башни волшебников', hint: 'У входа в башню волшебников — единственную в мире. Внутри живёт её глава. Если до башни далеко, вас перенесёт туда: подождите несколько секунд, пока загрузится земля.' },
    { id: 'arena', label: 'Перед дуэлью на арене (10 секунд до начала)', hint: 'Режим «только дуэли»: вы стоите на своём месте на арене, трибуны полны болельщиков, напротив уже ждёт соперник, идёт отсчёт 10…1 — и бой. Проиграли или погибли — сразу новая дуэль с новым волшебником того же уровня. Соперника выбираете ниже. На сервере (мультиплеер) волшебника нет: соперником станет друг, который зайдёт на ваш сервер, — пока он не зашёл, бой не начнётся; остальные игроки смотрят с трибун.' },
    { id: 'village', label: 'В городе волшебников', hint: 'На площади большого города волшебников: жители, библиотека и магазин свитков.' },
    { id: 'magevillage', label: 'В поселении волшебников', hint: 'У небольшого поселения: 4–9 домов волшебников вокруг костра, торговцы живут в этих домах.' },
    { id: 'magehut', label: 'У одинокого волшебника', hint: 'Рядом с домом одинокого волшебника.' },
    { id: 'spider', label: 'Логово паучихи (тёмная пещера)', hint: 'Тёмная пещера в горе: вы стоите у входа, а гигантская паучиха лежит в глубине зала — в 20–25 метрах, и её видно. Света почти нет: скажите «Люмос». Она не нападёт, пока вы не нападёте первым. Сундуков у неё нет. Если до пещеры далеко, вас перенесёт туда: подождите несколько секунд, пока загрузится земля.' },
    { id: 'blackship', label: 'На корабле в море (встреча с Чёрными Усами)', hint: 'Вы на палубе обычного корабля посреди открытого моря. Через какое-то время рядом появится чёрный корабль капитана Чёрные Усы. Хотите без капитана и скелетов — включите «Корабли без моряков».' },
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
        if (ctx.apart) return null; // (the places apart: a real lair — HeroApply finds it, `lairSpot`)
        const p = pointToward(TEST_DRAGON_SPOT, { x: 0, z: 0 }, SPOT_DIST.dragon);
        return { ...p, yaw: Math.atan2(TEST_DRAGON_SPOT.x - p.x, TEST_DRAGON_SPOT.z - p.z) };
    }
    if (id === 'queen') {
        const far = ctx.iceApproach?.(); // (the places apart — gen 11: the world's own ice castle, far off)
        if (far) return far;
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
    if (id === 'arena') { // (the player's own place on the floor, facing the opponent's: the duel mode — ArenaDuels.startDuelMode)
        const a = S?.arenas?.ofTower?.(S.towers?.only?.()) || S?.arenas?.ofVillage?.(S?.villages?.spawnVillage?.());
        const m = a?.gates?.[0]?.mark, o = a?.gates?.[1]?.mark;
        if (!a || !fin(m) || !fin(o)) return null;
        return { x: Math.round(m.x), z: Math.round(m.z), yaw: faceTo(m, o), arenaId: a.id, duel: true };
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
    if (id === 'magevillage' || id === 'magehut') {
        const index = S?.hamlets;
        if (!index?.cellOf) return null;
        // Search complete nearby rings, keeping the real indexed site (terrain and people use it too).
        for (let ring = 0; ring <= 12; ring++) {
            let best = null, distance = Infinity;
            for (let gz = -ring; gz <= ring; gz++) for (let gx = -ring; gx <= ring; gx++) {
                if (Math.max(Math.abs(gx), Math.abs(gz)) !== ring) continue;
                for (const h of index.cellOf(gx, gz)) {
                    if (h.kind !== 'hamlet' || h.type !== id || !fin(h.gate)) continue;
                    const d = Math.hypot(h.x, h.z);
                    if (d < distance) { best = h; distance = d; }
                }
            }
            if (best) return { x: Math.round(best.gate.x), z: Math.round(best.gate.z), yaw: best.gateYaw || 0, siteId: best.id };
        }
    }
    return null;
}

/**
 * Твёрдое место для героя в столбце (x, z): слой пола `L` (блок твёрдый), над ним `clear` слоёв свободного воздуха (не камень, не вода) —
 * голова не в потолке, ноги не в камне. Ищет сверху вниз от `hi` до `lo` (в пещере — рядом с полом зала, не на вершине горы над ней).
 * `solid(ix, L, iz)` и `free(ix, L, iz)` — блоки мира (`free` — воздух). Герой стоит на y = L − 0.5.
 * @returns {number|null} слой пола или null, если такого места нет
 */
export function standLayer(solid, free, x, z, lo, hi, clear = 6) {
    const ix = Math.round(x), iz = Math.round(z);
    for (let L = Math.floor(hi); L >= Math.floor(lo); L--) {
        if (!solid(ix, L, iz)) continue;
        let ok = true;
        for (let k = 1; k <= clear && ok; k++) ok = free(ix, L + k, iz);
        if (ok) return L;
    }
    return null;
}

/** Дальше этого от дворца Королевы и от пещеры паучихи (м) должно быть логово, к которому ставим героя «У горы дракона»: места — врозь. */
export const APART = 400;

/** Годится ли логово `L` для «У горы дракона» в мире с раздельными местами (`data`: Terrain): не у дворца Королевы и не у пещеры паучихи. */
export function lairUsable(L, data) {
    const P = data?.iceCastle?.plan, d = data?.den?.spot;
    if (P && Math.hypot(L.x - P.x, L.z - P.z) < APART) return false;
    if (d && Math.hypot(L.x - d.x, L.z - d.z) < APART) return false;
    return true;
}

/** Настоящее логово дракона `L` (Terrain.lairOf().lair): герой на уступе у входа, лицом в зал; дракон на сокровище — в 25–30 м. */
export function lairSpot(L) {
    return { x: Math.round(L.mouth.x + L.dx * 4), z: Math.round(L.mouth.z + L.dz * 4), yaw: Math.atan2(-L.dx, -L.dz), layer: L.F, up: 2, down: 6, boss: { x: L.hoard.x, z: L.hoard.z }, need: [{ x: L.x, z: L.z }, { x: L.hoard.x, z: L.hoard.z }], cave: true, dist: [18, 60] };
}

/**
 * Пещера паучихи (Terrain.spiderDen().lair): герой внутри зала под сводом, паучиха в глубине — в ~22 м, лицом ко входу. Точные места
 * считаются, когда земля зала готова (`refine`: нужна высота свода над полом) — до этого цель приблизительная, на оси зала.
 * @param {(x:number,z:number)=>number} free  сколько слоёв воздуха над полом зала в столбце (читает блоки; земля там уже есть)
 */
export function denSpot(L, free = null) {
    const pts = denAxisPoints(L);
    const spots = denSpots(L, free || (() => 99));
    const h = spots.hero;
    return {
        x: Math.round(h.x), z: Math.round(h.z), yaw: h.yaw, layer: L.F, up: 2, down: 6, boss: spots.spider, need: pts, cave: true, dist: [18, 45],
        refine: (freeNow) => denSpot(L, freeNow),
    };
}

/** Перед дворцом Ледяной Королевы (мир с раздельными местами): уступ за ущельем у начала ледяной лестницы. Королева в зале — от 40 м. */
export function queenApproach(plan) {
    const a = iceApproach(plan);
    return { ...a, layer: plan.F - 10, up: 4, down: 8, boss: { x: plan.hall.x, z: plan.hall.z }, need: [{ x: plan.hall.x, z: plan.hall.z }], dist: [38, 120] };
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

/**
 * Соперник в режиме «Перед дуэлью»: кого вы хотите видеть напротив. `ranks` — звания волшебников башни (WizardAI.WIZ_RANKS);
 * null — любой из четырёх уровней, каждый раз новый.
 */
export const DUEL_FOES = Object.freeze([
    { id: 'mid', label: 'Средний (продвинутый волшебник)', ranks: ['adept'] },
    { id: 'weak', label: 'Слабый (начинающий волшебник)', ranks: ['novice'] },
    { id: 'strong', label: 'Сильный (преподаватель)', ranks: ['teacher', 'elder'] },
    { id: 'master', label: 'Мастер башни (её глава)', ranks: ['master'] },
    { id: 'random', label: 'Случайный', ranks: null },
]);
export const normalizeFoe = (id) => (DUEL_FOES.some((f) => f.id === id) ? id : 'mid');

/** Звания для этой дуэли: у выбранного соперника — свои; «случайный» — один из четырёх уровней. */
export function foeRanks(id, rng = Math.random) {
    const f = DUEL_FOES.find((x) => x.id === id) || DUEL_FOES[0];
    if (f.ranks) return f.ranks;
    const pool = DUEL_FOES.filter((x) => x.ranks);
    return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].ranks;
}
