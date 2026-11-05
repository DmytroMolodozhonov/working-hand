/**
 * PotionLairPlan.js — «Логово зельевара» (Творческий, «Где появиться»): чистый план (без THREE) закрытого каменного зала в небе —
 * затемнённая пещера, посередине котёл на очаге, сбоку ручей, вокруг полки: по ингредиенту на полке, отдельная полка с пустыми
 * колбами и две полки с готовыми зельями.
 *
 * (05.11, второй вариант — автор: «дико светлый… из светлого камня не нравится; хочу тёмный купол, как будто из гранита, с факелами, тёмный»:
 *  круглый купол из тёмного базальта, гладкий свод, факелы на каменных стойках, свет — только их огонь.)
 *
 * Слова автора: «пещера, затемнённая, но там будет, конечно, свет. Посередине котёл, уже с водой, и под ним огонь. Рядом в пещере небольшая
 * река, откуда можно брать воду. Вокруг полки, в каждой по ингредиенту — все ингредиенты мира. Отдельная полка с пустыми склянками и
 * отдельная, где по одному зелью каждого вида. Красиво оформим; достаточно светло, но затемнено».
 *
 * Мерки (от мерок мира: блок 1 м, герой ~3,5 м, дверь 3×6, проход ≥ 3): зал 48 × 38 м (скруглённый прямоугольник), свод 8–12 м, ручей 3 м
 * шириной, полки по 6 м (между стойками 4 места), три яруса на высоте 2, 4 и 6 м (рука достаёт), между полками и котлом свободно ≥ 9 м,
 * проход вдоль стены ≥ 3 м.
 *
 * Зал целиком из блоков НАД землёй (слои F−3…F+13, F = 96), поэтому землю не режет, мир не меняет и не зависит от рельефа: стены — оболочка
 * в 3 блока, внутри воздух. Координаты — смещения (x на восток, z на юг) от середины зала; `cx, cz` — где он стоит в мире.
 */

import { BLOCK } from './Terrain.js';

const TAU = Math.PI * 2;

export const LAIR = {
    CX: 1400, CZ: -1400, // где стоит в мире (в небе: на любой местности)
    F: 96, // слой пола
    R: 26, // радиус купола (м); A, B — те же числа для старых проверок
    A: 26, B: 26,
    DOME: 9, // м: высота свода над краем (посередине 4 + DOME + 0,6 = ~13,6 м)
    SHELL: 3,
    RACK_LEN: 6, // блоков в полке (две стойки и 4 места между ними)
    TIERS: [2, 4, 6], // слои досок над полом
    RIVER_X: 16, RIVER_W: 1.6,
    HERO: { x: 0, z: 11 }, // где встаёт герой (лицом на север, к котлу)
    CAULDRON: { x: 0, z: -1 },
    MARKER: { x: 0, z: 0 }, // блок очага: есть — зал уже построен
};

const AIR = BLOCK.AIR;
const SKIP = 255;

/** Целое число из координат (0…1): везде одно и то же (миры у всех одинаковые). */
export function hash01(x, y, z = 0, s = 0) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(s | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** В куполе ли (внутри воздуха)? Круг — гладкая стена, без шероховатости. */
export function inHall(x, z, grow = 0) {
    return Math.hypot(x, z) <= LAIR.R + grow;
}

/** Слоёв воздуха над полом в столбце: гладкий купол — 4 у края, ~13 посередине. */
export function ceilingAt(x, z) {
    const q = Math.min(1, Math.hypot(x, z) / LAIR.R);
    return Math.max(5, Math.round(4 + LAIR.DOME * Math.sqrt(Math.max(0, 1 - q * q)) + 0.6));
}

export const riverX = (z) => LAIR.RIVER_X + 2.2 * Math.sin(z / 4.5);
export const inRiver = (x, z) => Math.abs(x - riverX(z)) <= LAIR.RIVER_W && inHall(x, z, -3);

/** Полки: север (ингредиенты ×4), юг (зелья ×2, колбы, книги). x0 — крайний левый блок (стойка). */
export function racks() {
    const L = LAIR.RACK_LEN, out = [];
    const xs = [-17, -10, -3, 4];
    const roles = { N: ['ing', 'ing', 'ing', 'ing'], S: ['potion', 'potion', 'flask', 'books'] };
    for (const side of ['N', 'S']) {
        const sg = side === 'N' ? -1 : 1;
        xs.forEach((x0, i) => out.push({ role: roles[side][i], side, x0, x1: x0 + L - 1, zBack: sg * 13, zFront: sg * 12, front: sg * 12 }));
    }
    return out;
}

/**
 * Весь план. → { blocks: [[x, L, z, type, shape]…] (смещения от середины), slots: {ing, potion, flask}: [{x, y, z}…] (y — высота, куда
 * ставить вещь над полом = слой−0,5; смещения), lamps, cauldron, hero, rect, marker, bounds }
 */
export function layout() {
    const { A, B, F, SHELL } = LAIR;
    const X = Math.ceil(A + SHELL + 2), Z = Math.ceil(B + SHELL + 2), y0 = F - 4, y1 = F + 21;
    const W = X * 2 + 1, D = Z * 2 + 1, H = y1 - y0 + 1;
    const grid = new Uint8Array(W * D * H).fill(SKIP);
    const at = (x, y, z) => ((y - y0) * D + (z + Z)) * W + (x + X);
    const put = (x, y, z, t) => { if (Math.abs(x) <= X && Math.abs(z) <= Z && y >= y0 && y <= y1) grid[at(x, y, z)] = t; };
    const get = (x, y, z) => grid[at(x, y, z)];

    // ---- оболочка, воздух, пол
    for (let z = -Z; z <= Z; z++) for (let x = -X; x <= X; x++) {
        const inner = inHall(x, z), outer = inHall(x, z, SHELL);
        if (!outer) continue;
        const hh = inner ? ceilingAt(x, z) : ceilingAt(x * (A - 0.5) / Math.max(A - 0.5, Math.hypot(x, z)), z * (A - 0.5) / Math.max(A - 0.5, Math.hypot(x, z)));
        for (let y = F - 3; y <= F + hh + SHELL; y++) {
            let t;
            if (inner && y > F && y <= F + hh) t = AIR; // воздух
            else {
                // (тёмный гранит: базальт, редко обсидиан и тёмный тёсаный камень; пол — плиты базальта и тёмного камня шахматкой)
                const k = hash01(x, y, z, 11);
                if (y <= F) t = ((x + z) & 1) ? BLOCK.HELL_OBSIDIAN : BLOCK.HELL_BASALT; // (тёмная шахматка; светлого тёсаного камня нет — он светло-бежевый)
                else t = k < 0.06 ? BLOCK.HELL_OBSIDIAN : BLOCK.HELL_BASALT;
            }
            put(x, y, z, t);
        }
    }
    // ---- очаг: круг булыжника с тёмным ободом (на нём стоит котёл над костром)
    const hx = LAIR.CAULDRON.x, hz = LAIR.CAULDRON.z;
    for (let z = -5; z <= 3; z++) for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x - hx, z - hz);
        if (d <= 3.6) put(x, F, z, d >= 2.7 ? BLOCK.HELL_BASALT : BLOCK.HELL_OBSIDIAN);
    }
    put(LAIR.MARKER.x, F, LAIR.MARKER.z, BLOCK.COBBLE); // (метка «зал построен»: одна булыжная плитка под котлом)
    // ---- ручей: русло на блок ниже пола, вода наполовину глубины; берега — булыжник
    for (let z = -(A - 2); z <= A - 2; z++) {
        const xr = riverX(z);
        for (let x = Math.floor(xr - 3); x <= Math.ceil(xr + 3); x++) {
            if (!inHall(x, z, -1)) continue;
            if (inRiver(x, z)) { put(x, F, z, AIR); put(x, F - 1, z, BLOCK.WATER); put(x, F - 2, z, BLOCK.HELL_BASALT); }
            else if (Math.abs(x - xr) <= LAIR.RIVER_W + 1.1 && hash01(x, z, 2, 7) < 0.6) put(x, F, z, BLOCK.HELL_BASALT);
        }
    }
    // ---- полки
    const slots = { ing: [], potion: [], flask: [], books: [] };
    for (const r of racks()) {
        const sg = r.side === 'N' ? -1 : 1;
        const zs = [r.zBack, r.zFront];
        const topTier = LAIR.TIERS[LAIR.TIERS.length - 1];
        for (const z of zs) {
            for (const x of [r.x0, r.x1]) for (let y = F + 1; y <= F + topTier; y++) put(x, y, z, BLOCK.PLANKS_DARK); // стойки
            for (const t of LAIR.TIERS) for (let x = r.x0; x <= r.x1; x++) put(x, F + t, z, BLOCK.PLANKS_DARK);
        }
        // книги на одной полке: по блоку книг на ярусах
        for (const t of LAIR.TIERS) for (let x = r.x0 + 1; x < r.x1; x++) {
            if (r.role === 'books') { if (hash01(x, t, r.zFront, 9) < 0.8) put(x, F + t + 1, r.zFront, BLOCK.BOOKS); }
            else slots[r.role].push({ x, y: F + t - 0.5 + 0.02, z: r.zFront, rack: r.x0 + r.side, tier: t });
        }
    }
    // ---- факелы: кронштейн из тёмного камня на стене (блок, прижатый к стене) с огнём над ним — кольцо по стене; и чаши на стойках полок.
    // (Свободных столбов и сталагмитов нет: автор — «какие-то тупые столбы, убрать».) Пламя рисует игра над верхней гранью блока-чаши.
    const torches = [];
    const bowl = (x, y, z) => { put(x, y, z, BLOCK.HELL_OBSIDIAN); torches.push({ x, y: y - 0.5 + 0.4, z }); };
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU + 0.13;
        for (let r = LAIR.R - 0.5; r >= LAIR.R - 2.5; r -= 0.5) { // (ближайшая к стене пустая клетка на этом луче)
            const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
            if (inRiver(x, z) || !inHall(x, z) || get(x, F + 3, z) !== AIR) continue;
            bowl(x, F + 3, z);
            break;
        }
    }
    for (const r of racks()) for (const x of [r.x0, r.x1]) bowl(x, F + LAIR.TIERS[LAIR.TIERS.length - 1] + 1, r.zFront);
    // ---- в блоки
    const blocks = [];
    for (let y = y0; y <= y1; y++) for (let z = -Z; z <= Z; z++) for (let x = -X; x <= X; x++) {
        const t = grid[at(x, y, z)];
        if (t !== SKIP) blocks.push([x, y, z, t, 0]);
    }
    return {
        blocks, slots, lamps: torches, torches, racks: racks(),
        cauldron: { ...LAIR.CAULDRON }, hero: { ...LAIR.HERO },
        rect: { x0: -(A + SHELL + 1), x1: A + SHELL + 1, z0: -(B + SHELL + 1), z1: B + SHELL + 1 },
        marker: { ...LAIR.MARKER, L: F, type: BLOCK.COBBLE },
    };
}
