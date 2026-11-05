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

/**
 * Полки: север (ингредиенты ×4: четыре РАЗНЫХ стеллажа по смыслу), юг (зелья ×2, колбы, книги). x0 — крайний левый блок (стойка).
 * Автор 06.11: «полки должны быть разнообразными, интересными, магическими… вмещать разные типы ингредиентов».
 * `style`: herbs — берёзовый стеллаж с сушёными пучками и корзинами; beasts — костяные стойки и железные доски с фиолетовыми лампами; minerals — арканный
 * камень со светящимися ледяными досками и стеной кристальных ламп; rare — золотой алтарь с рунами; potions — арканный шкаф со стеной бутылок; flasks —
 * светлый стеллаж с фонарями; books — вишнёвый стеллаж с книгами.
 */
export function racks() {
    const L = LAIR.RACK_LEN, out = [];
    const xs = [-17, -10, -3, 4];
    const styles = { N: ['herbs', 'beasts', 'minerals', 'rare'], S: ['potions', 'potions', 'flasks', 'books'] };
    const roles = { N: ['ing', 'ing', 'ing', 'ing'], S: ['potion', 'potion', 'flask', 'books'] };
    const titles = { herbs: 'травы и припасы', beasts: 'звериное', minerals: 'камни и кристаллы', rare: 'редкое', potions: 'готовые зелья', flasks: 'пустые колбы', books: 'книги' };
    for (const side of ['N', 'S']) {
        const sg = side === 'N' ? -1 : 1;
        xs.forEach((x0, i) => out.push({ role: roles[side][i], style: styles[side][i], title: titles[styles[side][i]], side, x0, x1: x0 + L - 1, zBack: sg * 13, zFront: sg * 12, front: sg * 12 }));
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
    // ---- полки: у каждого вида свои блоки и убранство (слоты — места под вещи — везде на тех же местах: доска на ярусах 2/4/6 м, четыре на ярус)
    const slots = { ing: [], potion: [], flask: [], books: [], byStyle: { herbs: [], beasts: [], minerals: [], rare: [] } };
    const PAL = {
        herbs: { post: BLOCK.BIRCH, board: BLOCK.PLANKS, back: BLOCK.PLANKS, cap: BLOCK.BIRCH },
        beasts: { post: BLOCK.HELL_BONE, board: BLOCK.HELL_IRON, back: BLOCK.HELL_BASALT, cap: BLOCK.HELL_BONE },
        minerals: { post: BLOCK.ARCANE_DARK, board: BLOCK.ICE_GLOW, back: BLOCK.ARCANE, cap: BLOCK.ARCANE_DARK },
        rare: { post: BLOCK.GOLD, board: BLOCK.GOLD, back: BLOCK.ARCANE_DARK, cap: BLOCK.GOLD },
        potions: { post: BLOCK.ARCANE, board: BLOCK.ARCANE_DARK, back: BLOCK.POTION, cap: BLOCK.ARCANE },
        flasks: { post: BLOCK.CHERRY, board: BLOCK.PLANKS, back: BLOCK.CLOTH_YELLOW, cap: BLOCK.CHERRY },
        books: { post: BLOCK.CHERRY, board: BLOCK.PLANKS_DARK, back: BLOCK.PLANKS_DARK, cap: BLOCK.CHERRY },
    };
    const topTier = LAIR.TIERS[LAIR.TIERS.length - 1];
    const torches = [];
    const bowl = (x, y, z) => { put(x, y, z, BLOCK.HELL_OBSIDIAN); torches.push({ x, y: y - 0.5 + 0.4, z }); };
    for (const r of racks()) {
        const sg = r.side === 'N' ? -1 : 1, P = PAL[r.style];
        // (the front of a rack looks toward the hall's middle: N racks face +z, S racks face −z; `out` is the step away from the hall's middle)
        const toMid = -sg;
        for (const z of [r.zBack, r.zFront]) {
            for (const x of [r.x0, r.x1]) for (let y = F + 1; y <= F + topTier; y++) put(x, y, z, P.post);
            for (const t of LAIR.TIERS) for (let x = r.x0; x <= r.x1; x++) put(x, F + t, z, P.board);
        }
        // a back panel between the two rows of each tier: the wall of the rack (each style its own)
        for (const t of LAIR.TIERS) for (let x = r.x0 + 1; x < r.x1; x++) {
            for (let y = F + t + 1; y <= F + t + 1; y++) {
                const k = hash01(x, t, r.zBack, 21);
                if (r.style === 'minerals') put(x, y, r.zBack, k < 0.5 ? BLOCK.ARCANE_LAMP : BLOCK.ARCANE); // a wall of glowing crystal lamps
                else if (r.style === 'potions') put(x, y, r.zBack, BLOCK.POTION); // a wall of bottles
                else if (r.style === 'rare') put(x, y, r.zBack, k < 0.4 ? BLOCK.RUNE : BLOCK.ARCANE_DARK);
                else if (r.style === 'flasks') put(x, y, r.zBack, k < 0.5 ? BLOCK.CLOTH_YELLOW : BLOCK.CHERRY);
                else if (r.style === 'beasts') put(x, y, r.zBack, k < 0.3 ? BLOCK.HELL_BONE : BLOCK.HELL_BASALT);
            }
        }
        // the crown of each rack and the floor in front of it
        for (let x = r.x0; x <= r.x1; x++) {
            put(x, F + topTier + 3, r.zBack, P.cap); put(x, F + topTier + 3, r.zFront, P.cap);
            if (r.style === 'herbs') { // a drying beam with hanging bundles (flowers, vegetables, hay) and baskets on the floor
                if (x > r.x0 && x < r.x1) { put(x, F + topTier + 2, r.zBack, [BLOCK.FLOWERS, BLOCK.VEG, BLOCK.HAY, BLOCK.FLOWERS][(x - r.x0) % 4]); put(x, F + topTier + 1, r.zBack, hash01(x, 3, 3, 4) < 0.5 ? [BLOCK.HAY, BLOCK.FLOWERS][(x + 1) & 1] : AIR); }
                if (x > r.x0 && x < r.x1 && (x - r.x0) % 2 === 1) put(x, F + 1, r.zFront + toMid * 1, BLOCK.HAY);
            } else if (r.style === 'beasts') { // bone horns on the crown and violet lamps
                if (x === r.x0 || x === r.x1) { put(x, F + topTier + 4, r.zFront, BLOCK.HELL_BONE); put(x, F + topTier + 5, r.zFront, BLOCK.HELL_BONE); put(x, F + topTier + 4, r.zBack, BLOCK.HELL_BONE); }
                else if ((x - r.x0) % 2 === 0) put(x, F + topTier + 4, r.zBack, BLOCK.ARCANE_LAMP_VIOLET);
            } else if (r.style === 'minerals') { // an arch of arcane stone with lamps
                if (x === r.x0 + 2 || x === r.x1 - 2) { put(x, F + topTier + 4, r.zBack, BLOCK.ARCANE_LAMP); put(x, F + topTier + 4, r.zFront, BLOCK.ARCANE_LAMP); }
                else if (x > r.x0 + 1 && x < r.x1 - 1) put(x, F + topTier + 4, r.zBack, BLOCK.ARCANE_DARK);
            } else if (r.style === 'rare') { // a golden cornice, lamps, a rune floor in front
                if (x === r.x0 || x === r.x1) put(x, F + topTier + 4, r.zFront, BLOCK.ARCANE_LAMP_VIOLET);
                if (x > r.x0 && x < r.x1) put(x, F, r.zFront + toMid * 1, hash01(x, 7, 7, 3) < 0.5 ? BLOCK.RUNE : BLOCK.GOLD);
            } else if (r.style === 'potions') { // a crown of lamps
                if ((x - r.x0) % 2 === 1) put(x, F + topTier + 4, r.zBack, BLOCK.ARCANE_LAMP_VIOLET);
            } else if (r.style === 'flasks') { if (x === r.x0 || x === r.x1) put(x, F + topTier + 4, r.zFront, BLOCK.LANTERN); }
        }
        // the places for things
        for (const t of LAIR.TIERS) for (let x = r.x0 + 1; x < r.x1; x++) {
            if (r.role === 'books') { if (hash01(x, t, r.zFront, 9) < 0.8) put(x, F + t + 1, r.zFront, BLOCK.BOOKS); }
            else {
                const sp = { x, y: F + t - 0.5 + 0.02, z: r.zFront, rack: r.x0 + r.side, tier: t, style: r.style };
                slots[r.role].push(sp);
                if (r.role === 'ing') slots.byStyle[r.style].push(sp);
            }
        }
    }
    // ---- факелы: кронштейн из тёмного камня на стене (блок, прижатый к стене) с огнём над ним — кольцо по стене; и чаши на стойках полок.
    // (Свободных столбов и сталагмитов нет: автор — «какие-то тупые столбы, убрать».) Пламя рисует игра над верхней гранью блока-чаши.
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
