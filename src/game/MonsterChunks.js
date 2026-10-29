/**
 * MonsterChunks.js — «Пентаграмма страшного монстра»: куски построек в лапе (pure, no THREE, node-testable).
 *
 * Слова автора (смысл): монстр ломает сильнее — шаг проламывает стены, кулак пробивает дом, топот трясёт землю — и может
 * БРАТЬ В РУКИ куски построек (часть стены, башни, дерева): отломить, поднять кистью, нести, швырять и бить ими.
 * Кусок — это настоящие блоки мира (с их текстурами), у него есть вес; от веса и скорости зависят урон по существам и слом
 * зданий. Здесь — числа и решения; игровая часть — MonsterTransform.js, вид — BlockSwarmFx (GroundVortexFx.js).
 *
 * Мерки (CLAUDE.md): блок 1 м, лапа монстра ×7 (кисть ≈ 4–5 м), кусок до CHUNK.MAX блоков (~7 × 7 × 9 м — угол башни).
 */

import { stuffOf } from '../world/Structure.js';
import { BLOCK } from '../world/Terrain.js';

export const CHUNK = {
    R: 6,            // м: шар у ладони, откуда берётся кусок (кисть ×7 — прежние 2,6 м были меньше самой ладони)
    MAX: 420,        // блоков в одной лапе
    FLY_MAX: 1400,   // блоков в полёте разом (куски + осколки): предел отрисовки и сети
    CHUNKS_MAX: 6,   // кусков в воздухе
    SCATTER_MAX: 600,// осколков (поодиночке), что ещё летят
    GRAB_CD: 0.6,    // с: после броска/разжатия новый хват не раньше
    G: 22,           // м/с²: тяжесть куска
    LIFE: 9,         // с: дольше в воздухе не живёт — ложится
    HIT_V: 9,        // м/с: летящий/занесённый кусок уже бьёт существ
    SMASH_V: 13,     // м/с: бьёт и ломает здания
    WEAR: 0.12,      // доля блоков куска, что крошится при каждом ударе занесённым куском (дубина изнашивается)
    NET_BLOCKS: 160, // блоков куска, что уходят гостям (остальное достраивает их кадр — см. netPack)
    SWING_MIN: 10,   // м/с: занесённым куском бьют, только если лапа резко двигалась (в воздухе, не вдоль земли)
};

/** Вес куска (в «каменных блоках»): листва и солома почти ничего не весят, камень — единица. */
export function massOf(blocks) {
    let m = 0;
    for (const b of blocks) m += stuffOf(b.t).w;
    return m;
}
/** Радиус шара вокруг куска (по числу блоков, приблизительно): для столкновений и ударов. */
export const radiusOf = (n) => Math.max(0.8, Math.cbrt(Math.max(1, n)) * 0.62);

/** Земля: берётся, только если рядом нет построенного (как MonsterForm.GROUND, но без зависимости от THREE). */
const GROUND = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SNOW, BLOCK.SAND, BLOCK.ICE, BLOCK.GRAVEL, BLOCK.DEEPSTONE,
    BLOCK.REGOLITH, BLOCK.PLANET_ROCK, BLOCK.PLANET_ICE, BLOCK.PLANET_DARK, BLOCK.PLANET_GRASS, BLOCK.FARMLAND, BLOCK.PATH]);
export const isGround = (t) => GROUND.has(t);

const NB = [];
for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const k = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
    if (k > 0 && k <= 2) NB.push([dx, dy, dz]); // (грани и рёбра: тонкая диагональная стена тоже один кусок)
}

/**
 * Что отломать лапой: СВЯЗНЫЙ кусок постройки у ладони `at` (шар `R`, не больше `max` блоков), начиная с ближайшего к ладони
 * блока и идя по соседним — ближние к ладони первыми. Если у ладони только земля — кусок земли. Так в лапе настоящий обломок
 * стены/башни/дерева, а не случайный шар.
 * `get(ix, iy, iz)` → тип блока (слой iy; воздух — 0), `ok(ix, iy, iz, t)` → можно ли брать этот блок (защиты, дары богов…).
 * @returns {{ix:number,iy:number,iz:number,t:number}[]}
 */
export function pickChunk(get, ok, at, R = CHUNK.R, max = CHUNK.MAX) {
    const cells = [];
    for (let iy = Math.round(at.y - R); iy <= Math.round(at.y + R); iy++) for (let iz = Math.round(at.z - R); iz <= Math.round(at.z + R); iz++) for (let ix = Math.round(at.x - R); ix <= Math.round(at.x + R); ix++) {
        const d2 = (ix - at.x) ** 2 + (iy - at.y) ** 2 + (iz - at.z) ** 2;
        if (d2 > R * R) continue;
        const t = get(ix, iy, iz);
        if (!t || !ok(ix, iy, iz, t)) continue;
        cells.push({ d2, ix, iy, iz, t });
    }
    if (!cells.length) return [];
    cells.sort((a, b) => a.d2 - b.d2);
    const seed = cells.find((c) => !isGround(c.t)) || cells[0];
    const building = !isGround(seed.t);
    const key = (x, y, z) => ((x + 4096) * 8192 + (y + 4096)) * 8192 + (z + 4096);
    const inSphere = new Map(cells.map((c) => [key(c.ix, c.iy, c.iz), c]));
    // (очередь с приоритетом «ближе к ладони»: простой «слоями» обход с сортировкой фронта — фронт мал)
    const taken = new Set([key(seed.ix, seed.iy, seed.iz)]);
    const out = [seed];
    let front = [seed];
    while (front.length && out.length < max) {
        const next = [];
        for (const c of front) for (const [dx, dy, dz] of NB) {
            const k = key(c.ix + dx, c.iy + dy, c.iz + dz);
            if (taken.has(k)) continue;
            const n = inSphere.get(k);
            if (!n || (building && isGround(n.t))) continue;
            taken.add(k);
            next.push(n);
        }
        next.sort((a, b) => a.d2 - b.d2);
        for (const n of next) { if (out.length >= max) break; out.push(n); }
        front = next;
    }
    return out.map(({ ix, iy, iz, t }) => ({ ix, iy, iz, t }));
}

/**
 * Что делает кусок на лету или занесённый (в руке) при ударе. `mass` — вес, `speed` — м/с.
 * dmg — урон существу, push — толчок (м/с на массу 1), smash — {r (м), max (блоков)} или null: ломает здание,
 * lost — какая доля блоков куска рассыпается о преграду (0…1; 1 — разлетелся весь).
 */
export function impactOf(mass, speed) {
    if (speed < CHUNK.HIT_V) return { dmg: 0, push: 0, smash: null, lost: 0 };
    const k = Math.min(1, (speed - CHUNK.HIT_V) / 26);          // 0…1 по скорости (≈ 35 м/с — полный удар)
    const w = Math.min(1, Math.cbrt(Math.max(0, mass)) / 5);     // 0…1 по весу (125 «каменных» блоков — полный вес)
    const dmg = Math.round(8 + 130 * k * (0.25 + 0.75 * w));
    const push = 12 + 55 * k * (0.3 + 0.7 * w);
    let smash = null;
    if (speed >= CHUNK.SMASH_V) {
        const r = Math.min(7, 1.4 + Math.cbrt(Math.max(0, mass)) * 0.55 * (speed / 20));
        smash = { r: Math.round(r * 10) / 10, max: Math.min(480, Math.round(mass * 1.1 * (0.5 + k))) };
    }
    const lost = Math.min(1, 0.2 + 0.8 * k * (1.1 - 0.5 * w));
    return { dmg, push, smash, lost };
}

/** Урон монстрозащиты существ не рассматриваем: кусок — как удар обычным телом ("thrown"), а не заклинание (MonsterForm.PLAIN). */
export const CHUNK_KIND = 'thrown';

/**
 * Кто и что — на куски (таблица «кто/что» для справочника и тестов): вид → {does, why}.
 * Тот же куст, что FIST_TARGETS, но по массе: тяжёлый кусок бьёт сильнее и дальше толкает.
 */
export const CHUNK_TARGETS = {
    zombie: { does: 'dmg+push', why: 'рассыпается, отлетает (CreatureImpact), урон от веса и скорости' },
    villager: { does: 'dmg+push', why: 'жители, рыцари, король, волшебники — урон и полёт; виновник — герой (если видели); тревога «монстр»' },
    animal: { does: 'dmg+push', why: 'звери отлетают (масса — CREATURE_BODY)' },
    sailor: { does: 'dmg+push', why: 'моряки, пираты, скелеты (кости ломаются — вид «thrown»)' },
    tree: { does: 'dmg', why: 'ожившее дерево — урон, корни держат' },
    dragon: { does: 'dmg+anger', why: 'дракон — урон и обида (Dragons.hit → _anger); его не отбросить' },
    spider: { does: 'dmg', why: 'паучиха — урон' },
    ice: { does: 'dmg', why: 'Ледяная Королева и её создания — обычный удар телом (iceDamage PLAIN), а не холод и не заклинание' },
    player: { does: 'dmg+push', why: 'другой игрок — урон и полёт (через его компьютер, как удар)' },
    blocks: { does: 'smash', why: 'здания и деревья в шаре у удара ломаются (кроме бедрока, заколдованного камня, даров богов, храма богов)' },
    ships: { does: 'none', why: 'корпус корабля — не блоки мира: кусок разбивается о борт, корабль качает, не ломает' },
    water: { does: 'splash', why: 'в воду кусок падает и тонет (блоки воды не заменяются), брызги' },
    godGift: { does: 'none', why: 'не действует — дар богов (храм, пьедесталы, Ледяной Жезл): золотая защита; куски не берутся и не бьют их' },
    enchanted: { does: 'none', why: 'заколдованный камень куски не берутся и не ломаются (кроме божественных «ломателей»)' },
    frozen: { does: 'drop', why: 'заморожен Ледяным Жезлом — лапы не двигаются, куски выпадают и ложатся' },
};

/**
 * Сколько гостям: кусок из тысяч блоков по сети не шлют — уходит форма (до NET_BLOCKS блоков, равномерно по кусочку),
 * остальные блоки гость достраивает по размеру. Возвращает компактные массивы [t, ox, oy, oz] (метры, 0,1 м).
 */
export function netPack(blocks, limit = CHUNK.NET_BLOCKS) {
    const step = Math.max(1, Math.ceil(blocks.length / limit));
    const out = [];
    for (let i = 0; i < blocks.length; i += step) {
        const b = blocks[i];
        out.push([b.t, Math.round(b.off.x * 10) / 10, Math.round(b.off.y * 10) / 10, Math.round(b.off.z * 10) / 10]);
    }
    return { step, blocks: out };
}
