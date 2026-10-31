/**
 * HellMap.js — АД: план мира ада (КОНТРАКТ для всех сессий про ад — не менять сигнатуры без нужды).
 *
 * Автор: «НОВАЯ ПЕНТАГРАММА — ПЕНТАГРАММА АДА (можно попасть в мир ада)… АД БУДЕТ ОГРОМНЫМ — просто фантастический, величественный ад: огромное
 * количество ЛАВЫ, которая ФОНТАНАМИ льётся, светится; он такой ПРИГЛУШЁННО-ТЁМНЫЙ. Не как в Майнкрафте».
 *
 * Ад — далёкая область ТОГО ЖЕ воксельного мира (как карта Ледяной Королевы — QueenMap.js, и поверхности планет — PlanetSurface.js): ходьба,
 * коллизии, взрывы, стройка, сохранение и сеть работают как дома. Квадрат 4096 × 4096 м в дальней зоне (x ≥ SPACE.ZONE_X − 64) в промежутке между
 * картой Королевы (до x = 247936) и первым слотом планет (с x = 253616): там `offEarth` (замков, деревень, данжей, пещер, логов Земли нет) и не
 * `earthly` (зомби, стада, книги-птицы, драконы Земли не появляются). Землю ада строит HellLand.js (в воркерах, по чанкам), план — этот модуль.
 *
 * Мир ада есть во ВСЕХ мирах (HELL_FROM_GEN = 1): он в дальней зоне и землю Земли не меняет ни на бит (tests/unit/terrain-worker.test.js), поэтому
 * ни новое поколение мира, ни отказ старым мирам не нужны — старое сохранение получает ад сразу.
 *
 * КОНТРАКТ (берут сессии «Дьяволос», «Тароны/горгульи ада»):
 *   HELL_FROM_GEN, HELL (центр/размер/уровни), inHell(x, z), hellChunk(cx, cz),
 *   hellPlan(seed) → {
 *     spawn: {x, z, y, yaw}            — где герой появляется (y — слой пола, стоит на y − 0.5… как SpawnSpots.standLayer); рядом с меткой
 *     returnMark: {x, z, y, r}         — метка возврата (пентаграмма ада, тот же рисунок), r — радиус круга
 *     devilSeat: {x, z, r, y}          — тронная котловина дьявола: плоский пол слоя y в радиусе r (90 м)
 *     chainAnchor: {x, y, z}           — куда крепится цепь дьявола (кольцо на огромном столбе в середине котловины)
 *     chainLen: number                 — длина цепи (м)
 *     taronCamps: [{x, z, n, r, y}]    — лагеря Таронов: плоское плато слоя y радиуса r, n — сколько Таронов
 *     gargoyleLairs: [{x, z, y}]       — логова горгулий ада: площадка на вершине скалы-башни, y — её слой
 *     lavaFalls: [{x, z, top, bottom, w, dir, pool: {x, z, r}}] — лавопады (колонна лавы с края плато в озеро)
 *     fountains: [{x, z, y, h}]        — лавовые фонтаны (кратеры вулканов, лавопады): искры и брызги — частицы, y — слой лавы, h — высота струй
 *     bridges: [{x0, z0, x1, z1, y, w}] — мосты из чёрного камня над лавой (y — слой настила, w — ширина)
 *     roads: [[{x, z, h}…]…]           — дороги (ломаные): от метки к котловине, от дорог к лагерям — по ним всё достижимо пешком
 *   }
 *
 * Слои: MIN_LAYER −17 … MAX_LAYER 120 (Terrain.js); блок 1 м, герой ~3,5 м.
 */

import { createRng, createNoise2D } from '../core/math.js';

/** Ад во всех мирах (см. выше: дальняя зона, Землю не меняет). Контракт: сессии сверяют `gen >= HELL_FROM_GEN`. */
export const HELL_FROM_GEN = 1;

export const HELL = {
    CX: 250752, CZ: 0, // м: середина ада (дальняя зона; целое число чанков от края)
    HALF: 2048, // м: квадрат ±HALF от середины (128 чанков); дальше — ничего (стена скал перед краем)
    BASE: 18, // слой: обычная земля ада
    LAVA_Y: 3, // слой: верх лавы в озёрах и реках
    SEAT_Y: 14, SEAT_R: 90, MOAT_R0: 96, MOAT_R1: 110, WALL_R: 128, WALL_H: 72, WALL_OUT: 230, // тронная котловина: пол, ров лавы, кольцевая стена
    ANCHOR_R: 7, ANCHOR_H: 34, RING_R: 10.5, RING_TUBE: 1.8, RING_Y: 10, // столб цепи в середине котловины и кованое кольцо на нём
    CHAIN_LEN: 70, // м
    SPAWN_D: 1250, SPAWN_Y: 24, SPAWN_R: 28, MARK_R: 3.5, // плато прибытия и метка возврата
    ROAD_W: 5, // м: половина ширины дороги / моста (проход 8,4 м между парапетами)
    RIM: 280, // м от края: стена скал до неба
    TOP: 116, // слой: выше ничего не строится (MAX_LAYER 120)
    OPEN_S: 20, // с: круг «открыт» после жертвы (можно войти нескольким)
    STEP_S: 1.5, // с: постоять в открытом круге — переход
    FADE_S: 1, // с: затемнение и вспышка перехода
};

/** Столбец (x, z) в аду (`margin` — на столько метров за краем тоже: соседи, на которые смотрят откосы чанка)? */
export const inHell = (x, z, margin = 0) => x >= HELL.CX - HELL.HALF - margin && x < HELL.CX + HELL.HALF + margin && z >= HELL.CZ - HELL.HALF - margin && z < HELL.CZ + HELL.HALF + margin;
/** Чанк (cx, cz) шириной C м — в аду? Край ада — по краям чанков: чанк целиком внутри или снаружи. */
export const hellChunk = (cx, cz, C = 32) => inHell(cx * C, cz * C);

const TAU = Math.PI * 2;
const smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

/** Расстояние от (x, z) до отрезка; `segT` — где на отрезке ближайшая точка (0…1). */
let segT = 0;
function segDist(x, z, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    segT = t;
    const ex = x - (ax + dx * t), ez = z - (az + dz * t);
    return Math.sqrt(ex * ex + ez * ez);
}

/** Расстояние от точки до ломаной дороги. */
function roadDist(x, z, road) {
    let best = Infinity;
    for (let i = 1; i < road.length; i++) { const d = segDist(x, z, road[i - 1].x, road[i - 1].z, road[i].x, road[i].z); if (d < best) best = d; }
    return best;
}

/**
 * Уровень дорог ада в точке: одно плавное поле для всех дорог (уклон не круче ~1:17) — развилки и перекрёстки сходятся без ступеней.
 * У котловины — уровень её пола, у метки — плато прибытия, у лагеря — его плато.
 */
export function roadLevel(P, x, z) {
    const H = HELL;
    let r = 20 + 6 * P.noise3(x / 900, z / 900);
    for (const c of P.taronCamps) { const d = Math.hypot(x - c.x, z - c.z); if (d < c.r + 260) r += (c.y - r) * smooth((c.r + 260 - d) / 260); }
    const dc = Math.hypot(x - H.CX, z - H.CZ);
    if (dc < H.WALL_OUT + 330) r += (H.SEAT_Y - r) * smooth((H.WALL_OUT + 330 - dc) / 300);
    const m = P.returnMark, ds = Math.hypot(x - m.x, z - m.z);
    if (ds < H.SPAWN_R + 300) r += (H.SPAWN_Y - r) * smooth((H.SPAWN_R + 300 - ds) / 300);
    return r;
}

const _plans = new Map();

/**
 * План ада из сида мира (одинаковый на всех компьютерах и в воркерах; считается один раз и запоминается).
 * Чистые числа — без блоков; блоки строит HellLand.js по этому плану.
 */
export function hellPlan(seed) {
    const key = seed | 0;
    let P = _plans.get(key);
    if (P) return P;
    P = makePlan(key);
    if (_plans.size > 4) _plans.clear();
    _plans.set(key, P);
    return P;
}

function makePlan(seed) {
    const H = HELL, rng = createRng((seed ^ 0x6e11a5) >>> 0);
    const CX = H.CX, CZ = H.CZ;
    const P = { seed, spawn: null, returnMark: null, devilSeat: null, chainAnchor: null, chainLen: H.CHAIN_LEN, taronCamps: [], gargoyleLairs: [], lavaFalls: [], fountains: [], bridges: [], roads: [],
        // (что строит земля — HellLand.js; не часть контракта)
        mesas: [], craters: [], spires: [], arches: [], pillars: [], titans: [], props: [] };
    // --- метка и плато прибытия: на круге в SPAWN_D от середины
    const a0 = rng() * TAU;
    const mx = Math.round(CX + Math.cos(a0) * H.SPAWN_D), mz = Math.round(CZ + Math.sin(a0) * H.SPAWN_D);
    const toC = Math.atan2(CZ - mz, CX - mx); // (от метки — к середине)
    P.toC = toC;
    P.returnMark = { x: mx, z: mz, y: H.SPAWN_Y, r: H.MARK_R };
    const sx = Math.round(mx + Math.cos(toC) * 8), sz = Math.round(mz + Math.sin(toC) * 8);
    P.spawn = { x: sx, z: sz, y: H.SPAWN_Y, yaw: Math.atan2(-(CX - sx), -(CZ - sz)) }; // (yaw как у героя: лицом к середине — −z вперёд)
    P.devilSeat = { x: CX, z: CZ, r: H.SEAT_R, y: H.SEAT_Y };
    P.chainAnchor = { x: CX, y: H.SEAT_Y + H.RING_Y, z: CZ };
    // --- дороги: главная — от метки к котловине, извилистая; высоты — плавные (уклон не круче 1:14)
    const road = (ax, az, ah, bx, bz, bh, wig) => {
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), n = Math.max(2, Math.ceil(L / 170));
        const px = -dz / L, pz = dx / L;
        const pts = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n, edge = i === 0 || i === n ? 0 : i === 1 || i === n - 1 ? 0.45 : 1;
            const w = (rng() * 2 - 1) * wig * edge;
            pts.push({ x: Math.round(ax + dx * t + px * w), z: Math.round(az + dz * t + pz * w), h: 0 });
        }
        // (уклон не круче 1:14 — вперёд, потом назад, к концу)
        for (const p of pts) p.h = Math.round(roadLevel(P, p.x, p.z)); // (one smooth field for every road: junctions and crossings meet level)
        return pts;
    };
    const ea = Math.atan2(mz - CZ, mx - CX), ex = Math.round(CX + Math.cos(ea) * (H.SEAT_R - 14)), ez = Math.round(CZ + Math.sin(ea) * (H.SEAT_R - 14));
    const wx = Math.round(CX + Math.cos(ea) * (H.WALL_OUT + 30)), wz = Math.round(CZ + Math.sin(ea) * (H.WALL_OUT + 30));
    P.noise3 = createNoise2D((seed ^ 0x2d0d) >>> 0);
    const main = road(mx, mz, H.SPAWN_Y, wx, wz, H.SEAT_Y, 70); // (down to the floor's level before the basin's wall …)
    main.push({ x: ex, z: ez, h: H.SEAT_Y }); // (… then level through the wall's gorge, over the moat, onto the floor — not to the pillar of the chain)
    P.roads.push(main);
    const allRoadDist = (x, z) => { let d = Infinity; for (const r of P.roads) d = Math.min(d, roadDist(x, z, r)); return d; };
    const nearRoadNode = (x, z) => { let best = null, bd = Infinity; for (const r of P.roads) for (const p of r) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd && Math.hypot(p.x - CX, p.z - CZ) > H.WALL_OUT) { bd = d; best = p; } } return best; };
    // --- лагеря Таронов: 3–6 плато в 500–1300 м от середины, дорога от ближайшей точки дорог
    const nc = 3 + Math.floor(rng() * 4);
    for (let k = 0, tries = 0; k < nc && tries < 200; tries++) {
        const a = a0 + (k + 1) * (TAU / (nc + 1)) + (rng() - 0.5) * 0.5, d = 500 + rng() * 800;
        const x = Math.round(CX + Math.cos(a) * d), z = Math.round(CZ + Math.sin(a) * d);
        if (Math.hypot(x - mx, z - mz) < 320) continue;
        if (P.taronCamps.some((c) => Math.hypot(c.x - x, c.z - z) < 380)) continue;
        if (Math.abs(x - CX) > H.HALF - H.RIM - 80 || Math.abs(z - CZ) > H.HALF - H.RIM - 80) continue;
        const r = 20 + Math.round(rng() * 20), y = Math.round(roadLevel(P, x, z));
        const camp = { x, z, n: 3 + Math.floor(rng() * 4), r, y };
        P.taronCamps.push(camp); // (before its road: the road's field is level over the camp)
        const from = nearRoadNode(x, z);
        P.roads.push(road(from.x, from.z, from.h, x, z, y, 40));
        k++;
    }
    // --- что не на дорогах и не на площадках
    const busy = (x, z, r) => {
        if (Math.abs(x - CX) > H.HALF - H.RIM + r * 0.3 || Math.abs(z - CZ) > H.HALF - H.RIM + r * 0.3) return true;
        if (Math.hypot(x - CX, z - CZ) < H.WALL_OUT + r + 30) return true;
        if (Math.hypot(x - mx, z - mz) < H.SPAWN_R + r + 40) return true;
        for (const c of P.taronCamps) if (Math.hypot(x - c.x, z - c.z) < c.r + r + 30) return true;
        return allRoadDist(x, z) < r + 18;
    };
    const taken = []; // [{x, z, r}] — большие формы не налезают друг на друга
    const free = (x, z, r) => !busy(x, z, r) && !taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r + 12);
    const place = (r, fn, near = null) => {
        for (let t = 0; t < 120; t++) {
            let x, z;
            if (near) { const a = near.a + (rng() - 0.5) * near.spread, d = near.d0 + rng() * (near.d1 - near.d0); x = Math.round(near.x + Math.cos(a) * d); z = Math.round(near.z + Math.sin(a) * d); }
            else { x = Math.round(CX + (rng() * 2 - 1) * (H.HALF - H.RIM - r)); z = Math.round(CZ + (rng() * 2 - 1) * (H.HALF - H.RIM - r)); }
            if (!free(x, z, r)) continue;
            taken.push({ x, z, r });
            return fn(x, z);
        }
        return null;
    };
    // --- плато-столовые горы с лавопадами (два — прямо перед глазами прибывшего)
    const mesa = (x, z, r, h, face = null) => {
        const m = { x, z, r, h, falls: [] };
        const nf = face != null ? 2 : 1 + Math.floor(rng() * 2);
        for (let f = 0; f < nf; f++) {
            const dir = face != null ? face + (f ? 0.45 : -0.25) : rng() * TAU, w = 3 + Math.floor(rng() * 3);
            const fx = x + Math.cos(dir) * r * 0.72, fz = z + Math.sin(dir) * r * 0.72; // (the back of a cleft cut into the cliff: the fall pours out of the rock, never stands off it)
            const pool = { x: Math.round(x + Math.cos(dir) * (r + 9)), z: Math.round(z + Math.sin(dir) * (r + 9)), r: 10 + w };
            const fall = { x: Math.round(fx), z: Math.round(fz), top: h - 1, bottom: H.LAVA_Y, w, dir, pool, mesa: m };
            m.falls.push(fall);
            P.lavaFalls.push(fall);
            P.fountains.push({ x: pool.x, z: pool.z, y: H.LAVA_Y, h: 6 + w * 2, fall: true });
        }
        P.mesas.push(m);
        return m;
    };
    for (let k = 0; k < 2; k++) { const r = 34 + Math.round(rng() * 14), h = 62 + Math.round(rng() * 16); place(r * 1.18 + 14, (x, z) => mesa(x, z, r, h, Math.atan2(mz - z, mx - x)), { x: mx, z: mz, a: toC + (k ? 0.75 : -0.75), spread: 0.4, d0: 170 + r, d1: 280 + r }); } // (their falls face the arrival: the first sight of hell)
    for (let k = 0; k < 12; k++) { const r = 30 + Math.round(rng() * 40), h = 50 + Math.round(rng() * 40); place(r * 1.18 + 14, (x, z) => mesa(x, z, r, h)); }
    // --- вулканы: кратер с озером лавы и фонтаном
    for (let k = 0; k < 4; k++) { const cr0 = 80 + Math.round(rng() * 40); place(cr0, (x, z) => {
        const c = { x, z, r: cr0, h: 56 + Math.round(rng() * 22), cr: 18 + Math.round(rng() * 10) };
        c.lava = c.h - 9;
        P.craters.push(c);
        P.fountains.push({ x, z, y: c.lava, h: 22 + Math.round(rng() * 14) });
        return c;
    }); }
    // --- титаны: огромные кости — позвоночник, рёбра, череп с рогами
    for (let k = 0; k < 3; k++) { const L = 110 + rng() * 80; place(L / 2 + 36, (x, z) => {
        const a = rng() * TAU;
        const t = { x0: Math.round(x - Math.cos(a) * L / 2), z0: Math.round(z - Math.sin(a) * L / 2), x1: Math.round(x + Math.cos(a) * L / 2), z1: Math.round(z + Math.sin(a) * L / 2), y: 20 + Math.round(rng() * 8), a, ribs: [] };
        const nx = -Math.sin(a), nz = Math.cos(a);
        for (let s = 18; s < L - 30; s += 10) {
            const bx = t.x0 + Math.cos(a) * s, bz = t.z0 + Math.sin(a) * s, reach = 22 + 8 * Math.sin(Math.PI * s / L);
            for (const sd of [-1, 1]) t.ribs.push({ ax: bx, az: bz, bx: bx + nx * reach * sd + Math.cos(a) * 6, bz: bz + nz * reach * sd + Math.sin(a) * 6 });
        }
        t.skull = { x: t.x1 + Math.cos(a) * 9, z: t.z1 + Math.sin(a) * 9, r: 11 };
        P.titans.push(t);
        return t;
    }); }
    // --- соборы из колонн (руины титанов): две ряда колонн, арки между ними
    for (let k = 0; k < 3; k++) place(80, (x, z) => {
        const a = rng() * TAU, n = 5 + Math.floor(rng() * 3), step = 22, half = 15 + Math.round(rng() * 5), top = 64 + Math.round(rng() * 18);
        const ux = Math.cos(a), uz = Math.sin(a), nx = -uz, nz = ux;
        const col = [];
        for (let i = 0; i < n; i++) {
            const s = (i - (n - 1) / 2) * step;
            for (const sd of [-1, 1]) {
                if (rng() < 0.18 && i > 0 && i < n - 1) { col.push(null); continue; } // (рухнувшая колонна)
                const c = { x: x + ux * s + nx * half * sd, z: z + uz * s + nz * half * sd, r: 3.2, top: top - Math.round(rng() * 10) };
                P.pillars.push(c); col.push(c);
            }
        }
        for (let i = 0; i < col.length; i++) {
            const c = col[i]; if (!c) continue;
            const along = col[i + 2], across = i % 2 === 0 ? col[i + 1] : null;
            if (along) P.arches.push({ ax: c.x, az: c.z, bx: along.x, bz: along.z, y0: Math.min(c.top, along.top) - 12, top: Math.min(c.top, along.top) - 1, w: 2.5, th: 3, gothic: true });
            if (across) P.arches.push({ ax: c.x, az: c.z, bx: across.x, bz: across.z, y0: Math.min(c.top, across.top) - 6, top: Math.min(c.top, across.top) + 8, w: 2.5, th: 3, gothic: true });
        }
        return true;
    });
    // --- огромные арки: три — врата над дорогами, остальные — по миру
    for (let k = 0, i = 0; k < 3 && i < 40; i++) {
        const r = P.roads[k % P.roads.length], j = 1 + Math.floor(rng() * (r.length - 2));
        const p = r[j], q = r[j + 1] || r[j - 1];
        if (Math.hypot(p.x - CX, p.z - CZ) < H.WALL_OUT + 40 || Math.hypot(p.x - mx, p.z - mz) < 120) continue;
        const ux = (q.x - p.x), uz = (q.z - p.z), L = Math.hypot(ux, uz), nx = -uz / L, nz = ux / L, half = 28 + rng() * 14;
        P.arches.push({ ax: p.x + nx * half, az: p.z + nz * half, bx: p.x - nx * half, bz: p.z - nz * half, y0: -6, top: Math.max(p.h + 44, 70 + Math.round(rng() * 25)), w: 5 + rng() * 3, th: 7, gate: true });
        k++;
    }
    for (let k = 0; k < 9; k++) { const half = 35 + rng() * 45; place(half + 10, (x, z) => {
        const a = rng() * TAU;
        const ar = { ax: x + Math.cos(a) * half, az: z + Math.sin(a) * half, bx: x - Math.cos(a) * half, bz: z - Math.sin(a) * half, y0: -6, top: 70 + Math.round(rng() * 40), w: 5 + rng() * 4, th: 6 + rng() * 4 };
        if (ar.top > H.TOP) ar.top = H.TOP;
        P.arches.push(ar);
        return ar;
    }); }
    // (no arch leg or low arc over a road: what is lower over a road than 7 above it is taken away)
    const W = H.ROAD_W;
    P.arches = P.arches.filter((a) => {
        for (let t = 0; t <= 1.0001; t += 0.02) {
            const x = a.ax + (a.bx - a.ax) * t, z = a.az + (a.bz - a.az) * t, s = Math.sin(Math.PI * t);
            const y = a.y0 + (a.top - a.y0) * Math.pow(s, a.gothic ? 0.42 : 0.58) - a.th * (1 + 1.6 * (1 - s));
            if (allRoadDist(x, z) < W + a.w * (1 + 0.7 * (1 - s)) + 3 && y < roadLevel(P, x, z) + 8) return false;
        }
        return true;
    });
    // --- логова горгулий ада: скалы-башни с площадкой наверху
    for (let k = 0; k < 6; k++) place(34, (x, z) => {
        const y = 72 + Math.round(rng() * 22);
        P.spires.push({ x, z, r: 15 + rng() * 5, top: y, lair: true, tw: rng() * TAU });
        P.gargoyleLairs.push({ x, z, y });
        return true;
    });
    // --- шпили базальта и обсидиана: сотни метров над лавой
    for (let k = 0; k < 150; k++) { const r = 5 + rng() * 11; place(r * 1.7 + 2, (x, z) => {
        const top = Math.min(H.TOP, Math.round(46 + rng() * 70));
        P.spires.push({ x, z, r, top, obs: rng() < 0.35, tw: rng() * TAU });
        return true;
    }); }
    // --- лагеря: костровища и тотемы из костей (мелкие постройки на плато)
    for (const c of P.taronCamps) {
        const pits = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < pits; i++) {
            const a = rng() * TAU, d = rng() * c.r * 0.5;
            const x = Math.round(c.x + Math.cos(a) * d), z = Math.round(c.z + Math.sin(a) * d);
            if (allRoadDist(x, z) > H.ROAD_W + 4) P.props.push({ k: 'pit', x, z, y: c.y }); // (the way through the camp stays clear)
        }
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * TAU + rng() * 0.4, d = c.r - 3;
            const x = Math.round(c.x + Math.cos(a) * d), z = Math.round(c.z + Math.sin(a) * d), th = 5 + Math.floor(rng() * 4);
            if (allRoadDist(x, z) > H.ROAD_W + 3) P.props.push({ k: 'totem', x, z, y: c.y, h: th });
        }
    }
    P.props.push({ k: 'mark', x: mx, z: mz, y: H.SPAWN_Y });
    buildIndex(P);
    // --- мосты: где дорога идёт над лавой или пропастью (по земле без дорог)
    for (const r of P.roads) {
        for (let i = 1; i < r.length; i++) {
            const a = r[i - 1], b = r[i], L = Math.hypot(b.x - a.x, b.z - a.z);
            let run = null;
            for (let s = 0; s <= L; s += 2) {
                const t = s / L, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, h = Math.round(roadLevel(P, x, z));
                const g = groundNoRoads(P, x, z);
                const over = g.lava || g.h < h - 6;
                if (over && !run) run = { x0: Math.round(x), z0: Math.round(z), x1: Math.round(x), z1: Math.round(z), y: h, w: H.ROAD_W * 2 };
                if (run) { run.x1 = Math.round(x); run.z1 = Math.round(z); run.y = Math.max(run.y, h); }
                if (!over && run) { P.bridges.push(run); run = null; }
            }
            if (run) P.bridges.push(run);
        }
    }
    return P;
}

// ------------------------------------------------------------------ the land of hell (heights) — pure numbers, read by HellLand.js

const CELL = 128;
/** Сетка ускорения: в каждой клетке 128 м — формы, которые её задевают. */
function buildIndex(P) {
    const grid = new Map();
    const put = (f, x0, z0, x1, z1) => {
        for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
            const k = gx * 65536 + gz;
            let a = grid.get(k); if (!a) grid.set(k, (a = []));
            a.push(f);
        }
    };
    for (const m of P.mesas) { m.k = 'mesa'; put(m, m.x - m.r - 14, m.z - m.r - 14, m.x + m.r + 14, m.z + m.r + 14); for (const f of m.falls) { f.k = 'fall'; put(f, Math.min(f.x, f.pool.x) - f.pool.r - 4, Math.min(f.z, f.pool.z) - f.pool.r - 4, Math.max(f.x, f.pool.x) + f.pool.r + 4, Math.max(f.z, f.pool.z) + f.pool.r + 4); } }
    for (const c of P.craters) { c.k = 'crater'; put(c, c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r); }
    for (const s of P.spires) { s.k = 'spire'; put(s, s.x - s.r * 1.6, s.z - s.r * 1.6, s.x + s.r * 1.6, s.z + s.r * 1.6); }
    for (const p of P.pillars) { p.k = 'pillar'; put(p, p.x - p.r - 2, p.z - p.r - 2, p.x + p.r + 2, p.z + p.r + 2); }
    for (const a of P.arches) { a.k = 'arch'; const m = a.w + 4; put(a, Math.min(a.ax, a.bx) - m, Math.min(a.az, a.bz) - m, Math.max(a.ax, a.bx) + m, Math.max(a.az, a.bz) + m); }
    for (const t of P.titans) {
        t.k = 'titan';
        put(t, Math.min(t.x0, t.x1) - 40, Math.min(t.z0, t.z1) - 40, Math.max(t.x0, t.x1) + 40, Math.max(t.z0, t.z1) + 40);
        put(t, t.skull.x - 24, t.skull.z - 24, t.skull.x + 24, t.skull.z + 24);
    }
    for (const c of P.taronCamps) { const f = { k: 'camp', c }; put(f, c.x - c.r - 14, c.z - c.r - 14, c.x + c.r + 14, c.z + c.r + 14); }
    for (const p of P.props) { p.k = 'prop:' + p.k; put(p, p.x - 6, p.z - 6, p.x + 6, p.z + 6); }
    for (const r of P.roads) for (let i = 1; i < r.length; i++) {
        const a = r[i - 1], b = r[i], m = HELL.ROAD_W + 8;
        put({ k: 'road', a, b, L: Math.hypot(b.x - a.x, b.z - a.z) }, Math.min(a.x, b.x) - m, Math.min(a.z, b.z) - m, Math.max(a.x, b.x) + m, Math.max(a.z, b.z) + m);
    }
    P.grid = grid;
    P.noise = createNoise2D((P.seed ^ 0x4e11) >>> 0);
    P.noise2 = createNoise2D((P.seed ^ 0x13a7) >>> 0);
}

const EMPTY = [];
/** Формы плана, задевающие клетку столбца (x, z). */
export function hellNear(P, x, z) {
    return P.grid.get(Math.floor(x / CELL) * 65536 + Math.floor(z / CELL)) || EMPTY;
}

/**
 * Земля ада в столбце БЕЗ дорог (мосты ищутся по ней): {h — верхний твёрдый слой, lava — до какого слоя лава над ним (0 — нет),
 * hot — раскалённый край лавы, kind — 'rock' | 'ash' | 'obs' | 'seat' | 'bone'}. Один общий объект — не держать.
 */
const _g = { h: 0, lava: 0, hot: 0, kind: 'rock', rim: 0 };
export function groundNoRoads(P, x, z) {
    const H = HELL, n = P.noise, n2 = P.noise2, g = _g;
    const dx = x - H.CX, dz = z - H.CZ;
    // равнины, гряды и каньоны: крупное — где озёра лавы, хребты — где скалы
    const macro = n(x / 720, z / 720) * 0.7 + n(x / 260 + 17, z / 260 - 9) * 0.3;
    const ridge = 1 - Math.abs(n2(x / 300 - 41, z / 300 + 23));
    let h = H.BASE + 10 * macro + 26 * ridge * ridge * ridge + 3 * n(x / 47 + 5, z / 47 - 3) + 1.2 * n2(x / 13, z / 13);
    let kind = 'rock', lava = 0;
    // уступы: высокие склоны — ступенями обрывов по 7 м
    if (h > 30) { const s = h - 30, st = 11; h = 30 + Math.floor(s / st) * st + Math.pow((s % st) / st, 3) * st; } // (high ground: cliffs of rock, then a slope up to the next)
    // реки лавы: узкие извилистые русла
    const rv = Math.abs(n(x / 340 + 77, z / 340 - 41));
    if (rv < 0.075) h = h + (H.LAVA_Y - 3 - h) * smooth((0.075 - rv) / 0.04);
    // озёра лавы в низинах
    if (macro < -0.22) h = Math.min(h, H.LAVA_Y - 1 - (-0.22 - macro) * 22);
    // стена скал по краю ада
    const edge = H.HALF - Math.max(Math.abs(dx), Math.abs(dz));
    g.rim = 0;
    if (edge < H.RIM) { const k = smooth((H.RIM - edge) / (H.RIM - 40)); h += k * (90 + 20 * ridge); g.rim = k; }
    // тронная котловина: пол, ров лавы, кольцевая стена, внешний склон
    const dc = Math.sqrt(dx * dx + dz * dz);
    if (dc < H.WALL_OUT) {
        const wobble = 4 * n(Math.atan2(dz, dx) * 3, 3.3);
        if (dc < H.SEAT_R) { h = H.SEAT_Y; kind = 'seat'; }
        else if (dc < H.MOAT_R0) h = H.SEAT_Y - (dc - H.SEAT_R) * 1.5;
        else if (dc < H.MOAT_R1) h = H.LAVA_Y - 3;
        else if (dc < H.WALL_R + wobble) h = H.LAVA_Y + (H.WALL_H - H.LAVA_Y) * smooth((dc - H.MOAT_R1) / (H.WALL_R + wobble - H.MOAT_R1)) + 3 * n2(x / 9, z / 9);
        else h = Math.max(h, H.WALL_H + 4 * n2(x / 11, z / 11) - (H.WALL_H - h) * smooth((dc - H.WALL_R - wobble) / (H.WALL_OUT - H.WALL_R - wobble)));
    }
    // плато прибытия: балкон над озером лавы — первое, что видит прибывший (дорога идёт мостом)
    const ds = Math.hypot(x - P.returnMark.x, z - P.returnMark.z);
    if (ds > H.SPAWN_R + 6 && ds < 300) {
        let da = Math.atan2(z - P.returnMark.z, x - P.returnMark.x) - P.toC;
        da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
        const k = smooth((1.05 - da) / 0.35) * smooth((ds - H.SPAWN_R - 6) / 14) * smooth((300 - ds) / 60);
        if (k > 0) h = h + (H.LAVA_Y - 4 + 2 * n2(x / 20, z / 20) - h) * k;
    }
    if (ds < H.SPAWN_R + 10) { const k = smooth((H.SPAWN_R + 10 - ds) / 10); h = h + (H.SPAWN_Y - h) * k; if (ds < H.SPAWN_R) { h = H.SPAWN_Y; kind = 'seat'; } }
    const near = hellNear(P, x, z);
    for (let i = 0; i < near.length; i++) {
        const f = near[i];
        switch (f.k) {
            case 'mesa': {
                const d = Math.hypot(x - f.x, z - f.z), a = Math.atan2(z - f.z, x - f.x);
                const r = f.r * (1 + 0.12 * n(Math.cos(a) * 2 + f.x * 0.01, Math.sin(a) * 2) + 0.05 * n2(a * 5, f.z * 0.01));
                if (d < r) { h = f.h + Math.round(1.5 * n2(x / 6, z / 6)); kind = 'ash'; }
                else if (d < r + 12) { const t = (d - r) / 12; h = Math.max(h, f.h - (f.h - h) * Math.pow(t, 0.35) - 2); } // (подножие — осыпь)
                break;
            }
            case 'crater': {
                const d = Math.hypot(x - f.x, z - f.z);
                if (d < f.r) {
                    let c;
                    if (d < f.cr) c = f.lava - 4; // (жерло под лавой)
                    else if (d < f.cr + 8) c = f.lava - 4 + (f.h - f.lava + 4) * smooth((d - f.cr) / 8);
                    else c = f.h - (f.h - H.BASE + 4) * Math.pow((d - f.cr - 8) / (f.r - f.cr - 8), 0.7) + 3 * n2(x / 8, z / 8);
                    h = Math.max(h, c);
                    if (d < f.cr) { h = c; lava = f.lava; }
                }
                break;
            }
            case 'spire': {
                const d = Math.hypot(x - f.x, z - f.z), a = Math.atan2(z - f.z, x - f.x) + f.tw;
                const r = f.r * (1 + 0.16 * Math.sin(a * 5) + 0.08 * Math.sin(a * 11 + f.tw) + 0.14 * n(a * 2, f.x * 0.003)); // (рёбра и выступы по кругу)
                const t = d / r;
                if (t < 1.55) {
                    let s;
                    if (f.lair && t < 0.55) s = f.top; // (площадка логова наверху)
                    else if (t < 1) { s = f.top - (f.top - H.BASE) * 0.7 * Math.pow(t, 2.2) + 1.5 * n2(x / 4, z / 4); const ledge = 9 + 4 * f.tw; s = Math.floor(s / ledge) * ledge + Math.min(ledge, (s % ledge) * 1.8); } // (ledges and overhangs of the stone up the spire)
                    else { const u = 1 - (t - 1) / 0.55; s = H.BASE + (f.top - H.BASE) * 0.3 * u * u; }
                    if (s > h) { h = s; kind = f.obs && t < 1 ? 'obs' : 'rock'; }
                }
                break;
            }
            case 'camp': {
                const c = f.c, d = Math.hypot(x - c.x, z - c.z);
                if (d < c.r) { h = c.y; kind = 'ash'; }
                else if (d < c.r + 14) { const k = smooth((c.r + 14 - d) / 14); h = h + (c.y - h) * k; }
                break;
            }
            case 'fall': {
                const d = Math.hypot(x - f.pool.x, z - f.pool.z);
                if (d < f.pool.r + 6) { const k = smooth((f.pool.r + 6 - d) / 6); h = h + (H.LAVA_Y - 3 - h) * k; }
                break;
            }
            default: break;
        }
    }
    if (h > H.TOP) h = H.TOP;
    g.h = Math.round(h);
    if (g.h < H.LAVA_Y && !lava) lava = H.LAVA_Y;
    if (lava && lava <= g.h) lava = 0;
    g.lava = lava;
    g.kind = kind;
    return g;
}

/**
 * Земля ада в столбце с дорогами: {h, lava, kind, deck — слой настила моста (или null), pier — опора моста, parapet — парапет}.
 * Дорога режет скалы (ущелья со стенами), насыпью идёт над низиной и мостом — над лавой и пропастью.
 */
const _c = { h: 0, lava: 0, kind: 'rock', deck: null, pier: false, parapet: false, road: false, roadH: 0, rim: 0, along: 0 };
export function hellGround(P, x, z) {
    const g = groundNoRoads(P, x, z), c = _c;
    c.h = g.h; c.lava = g.lava; c.kind = g.kind; c.deck = null; c.pier = false; c.parapet = false; c.road = false; c.rim = g.rim; c.along = 0;
    const near = hellNear(P, x, z);
    let best = Infinity, rh = 0, along = 0;
    for (let i = 0; i < near.length; i++) {
        const f = near[i];
        if (f.k !== 'road') continue;
        const d = segDist(x, z, f.a.x, f.a.z, f.b.x, f.b.z);
        if (d < best) { best = d; along = segT * f.L; }
    }
    const W = HELL.ROAD_W;
    if (best < W + 6) {
        rh = Math.round(roadLevel(P, x, z));
        c.roadH = rh; c.along = along;
        if (best < W) {
            c.road = true;
            if (c.lava || c.h < rh - 6) { // мост
                c.deck = rh;
                c.parapet = best > W - 0.9;
                c.pier = (along % 24) < 3.2 && best < W - 1;
            } else { c.h = rh; c.lava = 0; c.kind = 'road'; } // насыпь / ущелье
        } else if (c.h > rh && !c.lava) {
            // обочина ущелья: стены поднимаются к земле
            const k = (best - W) / 6;
            c.h = Math.round(Math.min(c.h, rh + (c.h - rh) * k * k + 1));
        }
    }
    return c;
}

/** Слой, на который можно ступить в столбце ада (настил моста или земля/лава) — для heightAt. */
export function hellFloor(P, x, z) {
    const c = hellGround(P, x, z);
    return c.deck != null ? c.deck : Math.max(c.h, c.lava || -999);
}
