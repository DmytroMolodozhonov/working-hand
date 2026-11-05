/**
 * PotionLairPlan.js — «Логово зельевара» (Творческий, «Где появиться»): чистый план (без THREE) закрытого каменного зала в небе —
 * затемнённая пещера, посередине котёл на очаге, сбоку ручей, вокруг полки: по ингредиенту на полке, отдельная полка с пустыми
 * колбами и две полки с готовыми зельями.
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

export const LAIR = {
    CX: 1400, CZ: -1400, // где стоит в мире (в небе: на любой местности)
    F: 96, // слой пола
    A: 24, B: 19, // полуоси зала (м)
    SHELL: 3,
    RACK_LEN: 6, // блоков в полке (две стойки и 4 места между ними)
    TIERS: [2, 4, 6], // слои досок над полом
    RIVER_X: 15, RIVER_W: 1.6,
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

const norm4 = (x, z, A, B) => (Math.abs(x) / A) ** 4 + (Math.abs(z) / B) ** 4;

/** В зале ли (внутри воздуха)? Края шероховатые. */
export function inHall(x, z, grow = 0) {
    const w = (hash01(x >> 1, z >> 1, 0, 3) - 0.5) * 0.06;
    return norm4(x, z, LAIR.A + grow, LAIR.B + grow) <= 1 + w;
}

/** Слоёв воздуха над полом в столбце (свод: выше посередине, ниже у стен). */
export function ceilingAt(x, z) {
    const r = Math.sqrt(norm4(x, z, LAIR.A, LAIR.B));
    return Math.max(6, Math.round(12 - 5 * r + (hash01(x, z, 1, 5) - 0.5) * 1.4));
}

export const riverX = (z) => LAIR.RIVER_X + 2.2 * Math.sin(z / 4.5);
export const inRiver = (x, z) => Math.abs(x - riverX(z)) <= LAIR.RIVER_W && Math.abs(z) <= LAIR.B - 2;

/** Полки: север (ингредиенты ×4), юг (зелья ×2, колбы, книги). x0 — крайний левый блок (стойка). */
export function racks() {
    const L = LAIR.RACK_LEN, out = [];
    const xs = [-14, -7, 0, 7];
    const roles = { N: ['ing', 'ing', 'ing', 'ing'], S: ['potion', 'potion', 'flask', 'books'] };
    for (const side of ['N', 'S']) {
        const sg = side === 'N' ? -1 : 1;
        xs.forEach((x0, i) => out.push({ role: roles[side][i], side, x0, x1: x0 + L - 1, zBack: sg * 16, zFront: sg * 15, front: sg * 15 }));
    }
    return out;
}

/**
 * Весь план. → { blocks: [[x, L, z, type, shape]…] (смещения от середины), slots: {ing, potion, flask}: [{x, y, z}…] (y — высота, куда
 * ставить вещь над полом = слой−0,5; смещения), lamps, cauldron, hero, rect, marker, bounds }
 */
export function layout() {
    const { A, B, F, SHELL } = LAIR;
    const X = Math.ceil(A + SHELL + 2), Z = Math.ceil(B + SHELL + 2), y0 = F - 4, y1 = F + 14;
    const W = X * 2 + 1, D = Z * 2 + 1, H = y1 - y0 + 1;
    const grid = new Uint8Array(W * D * H).fill(SKIP);
    const at = (x, y, z) => ((y - y0) * D + (z + Z)) * W + (x + X);
    const put = (x, y, z, t) => { if (Math.abs(x) <= X && Math.abs(z) <= Z && y >= y0 && y <= y1) grid[at(x, y, z)] = t; };
    const get = (x, y, z) => grid[at(x, y, z)];

    // ---- оболочка, воздух, пол
    for (let z = -Z; z <= Z; z++) for (let x = -X; x <= X; x++) {
        const inner = inHall(x, z), outer = inHall(x, z, SHELL);
        if (!outer) continue;
        const hh = inner ? ceilingAt(x, z) : ceilingAt(Math.sign(x) * Math.min(Math.abs(x), A - 1), Math.sign(z) * Math.min(Math.abs(z), B - 1));
        for (let y = F - 3; y <= F + hh + SHELL; y++) {
            let t;
            if (inner && y > F && y <= F + hh) t = AIR; // воздух
            else {
                const k = hash01(x, y, z, 11);
                t = k < 0.22 ? BLOCK.DEEPSTONE : k < 0.26 ? BLOCK.GRAVEL : BLOCK.STONE;
            }
            put(x, y, z, t);
        }
    }
    // ---- очаг: круг булыжника с тёмным ободом (на нём стоит котёл над костром)
    const hx = LAIR.CAULDRON.x, hz = LAIR.CAULDRON.z;
    for (let z = -5; z <= 3; z++) for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x - hx, z - hz);
        if (d <= 3.6) put(x, F, z, d >= 2.7 ? BLOCK.CS_DARK : BLOCK.COBBLE);
    }
    put(LAIR.MARKER.x, F, LAIR.MARKER.z, BLOCK.COBBLE);
    // ---- ручей: русло на блок ниже пола, вода наполовину глубины; берега — булыжник
    for (let z = -(B - 2); z <= B - 2; z++) {
        const xr = riverX(z);
        for (let x = Math.floor(xr - 3); x <= Math.ceil(xr + 3); x++) {
            if (!inHall(x, z, -1)) continue;
            if (inRiver(x, z)) { put(x, F, z, AIR); put(x, F - 1, z, BLOCK.WATER); put(x, F - 2, z, BLOCK.STONE); }
            else if (Math.abs(x - xr) <= LAIR.RIVER_W + 1.1 && hash01(x, z, 2, 7) < 0.55) put(x, F, z, BLOCK.COBBLE);
        }
    }
    // ---- полки
    const slots = { ing: [], potion: [], flask: [], books: [] };
    const lamps = [];
    for (const r of racks()) {
        const sg = r.side === 'N' ? -1 : 1;
        const zs = [r.zBack, r.zFront];
        const topTier = LAIR.TIERS[LAIR.TIERS.length - 1];
        for (const z of zs) {
            for (const x of [r.x0, r.x1]) for (let y = F + 1; y <= F + topTier; y++) put(x, y, z, BLOCK.PLANKS_DARK); // стойки
            for (const t of LAIR.TIERS) for (let x = r.x0; x <= r.x1; x++) put(x, F + t, z, BLOCK.PLANKS);
        }
        // фонарь на каждой стойке спереди
        for (const x of [r.x0, r.x1]) { put(x, F + topTier + 1, r.zFront, BLOCK.LANTERN); lamps.push({ x, y: F + topTier + 1, z: r.zFront }); }
        // книги на одной полке: по блоку книг на ярусах
        for (const t of LAIR.TIERS) for (let x = r.x0 + 1; x < r.x1; x++) {
            if (r.role === 'books') { if (hash01(x, t, r.zFront, 9) < 0.8) put(x, F + t + 1, r.zFront, BLOCK.BOOKS); }
            else slots[r.role].push({ x, y: F + t - 0.5 + 0.02, z: r.zFront, rack: r.x0 + r.side, tier: t });
        }
    }
    // ---- подвесные фонари на своде (кольцо вокруг очага и по углам зала)
    const ring = [];
    for (let i = 0; i < 6; i++) ring.push({ x: Math.round(Math.cos(i * Math.PI / 3 + 0.5) * 8), z: Math.round(Math.sin(i * Math.PI / 3 + 0.5) * 7) });
    ring.push({ x: -19, z: 0 }, { x: 19, z: -8 }, { x: 19, z: 9 }, { x: -18, z: -10 }, { x: -18, z: 10 });
    for (const p of ring) {
        if (!inHall(p.x, p.z, -2)) continue;
        const y = F + ceilingAt(p.x, p.z);
        put(p.x, y, p.z, BLOCK.LANTERN); lamps.push({ x: p.x, y, z: p.z });
    }
    // ---- сосульки-сталактиты и сталагмиты (не над полками, очагом и ручьём)
    const free = (x, z) => !inRiver(x, z) && Math.hypot(x, z + 1) > 7 && Math.abs(z) < 13.5 && Math.abs(x) < A - 3;
    for (let z = -13; z <= 13; z++) for (let x = -(A - 3); x <= A - 3; x++) {
        if (!inHall(x, z, -2) || !free(x, z) || hash01(x, z, 4, 21) > 0.045) continue;
        const hh = ceilingAt(x, z), len = 1 + Math.floor(hash01(x, z, 5, 22) * 3);
        for (let k = 0; k < len; k++) if (get(x, F + hh - k, z) === AIR) put(x, F + hh - k, z, BLOCK.STONE);
        if (hash01(x, z, 6, 23) < 0.4 && get(x, F + 1, z) === AIR && get(x, F, z) === BLOCK.STONE) {
            const l2 = 1 + Math.floor(hash01(x, z, 7, 24) * 2);
            for (let k = 1; k <= l2; k++) put(x, F + k, z, BLOCK.DEEPSTONE);
        }
    }
    // ---- в блоки
    const blocks = [];
    for (let y = y0; y <= y1; y++) for (let z = -Z; z <= Z; z++) for (let x = -X; x <= X; x++) {
        const t = grid[at(x, y, z)];
        if (t !== SKIP) blocks.push([x, y, z, t, 0]);
    }
    return {
        blocks, slots, lamps, racks: racks(),
        cauldron: { ...LAIR.CAULDRON }, hero: { ...LAIR.HERO },
        rect: { x0: -(A + SHELL + 1), x1: A + SHELL + 1, z0: -(B + SHELL + 1), z1: B + SHELL + 1 },
        marker: { ...LAIR.MARKER, L: F, type: BLOCK.COBBLE },
    };
}
