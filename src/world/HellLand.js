/**
 * HellLand.js — блоки ада по плану HellMap.js: чанк за чанком, в воркерах (как поверхности планет — PlanetSurface.js).
 *
 * Земля (столбец снизу вверх): базальт с прожилками обсидиана, на ровном — пепел, у лавы — раскалённый камень; озёра и реки лавы; дороги из
 * чёрного тёсаного камня; мосты над лавой (настил, парапеты, опоры с арками снизу). Над землёй (нависает, поэтому чанк `caved` — тень под
 * арками считает свет пещер): арки, колонны соборов, кости титанов (позвоночник, рёбра, череп с рогами), столб цепи с кованым кольцом, колонны
 * лавопадов, костровища и тотемы лагерей, помост метки.
 * Землю Земли этот модуль не трогает: Terrain.js зовёт его только для чанков `hellChunk` (дальняя зона).
 */

import { BLOCK, CHUNK, MIN_LAYER, MAX_LAYER } from './Terrain.js';
import { HELL, hellGround, hellNear } from './HellMap.js';

const smoothSin = (t) => Math.sin(Math.PI * (t < 0 ? 0 : t > 1 ? 1 : t));
function hash(x, z, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

let segT = 0;
function segDist(x, z, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    segT = t;
    const ex = x - (ax + dx * t), ez = z - (az + dz * t);
    return Math.sqrt(ex * ex + ez * ez);
}

/**
 * Один чанк ада. `P` — hellPlan(seed), `bedrock` — верх бедрока мира.
 * @returns чанк в формате Terrain (blocks, top, maxTop, minOpen, …; `hell: true`)
 */
export function generateHellChunk(cx, cz, P, bedrock) {
    const HEIGHT = MAX_LAYER - MIN_LAYER + 1;
    const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const top = new Int16Array(CHUNK * CHUNK);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    let maxTop = MIN_LAYER, minOpen = MAX_LAYER, over = false;
    let hollow = null;
    const put = (lx, lz, L, t) => { if (L >= MIN_LAYER && L <= MAX_LAYER) blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = t; };
    const get = (lx, lz, L) => (L >= MIN_LAYER && L <= MAX_LAYER ? blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] : 0);
    const H = HELL, mark = P.returnMark, seed = P.seed | 0;
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx, z = z0 + lz, col = lz * CHUNK + lx;
        const c = hellGround(P, x, z);
        let h = c.h, lava = c.lava;
        const kind = c.kind, deck = c.deck, pier = c.pier, parapet = c.parapet, along = c.along;
        const near = hellNear(P, x, z);
        // (лавопады: русло лавы на плато к краю и стена, облитая лавой — раскалённая)
        let fallTop = -999, fallHot = false;
        for (let i = 0; i < near.length; i++) {
            const f = near[i];
            if (f.k !== 'fall') continue;
            const cd = Math.cos(f.dir), sd = Math.sin(f.dir), ex = x - f.x, ez = z - f.z;
            const al = ex * cd + ez * sd, ac = -ex * sd + ez * cd, hw = f.w / 2;
            if (Math.abs(ac) < hw + 1 && al > -16 && al < -1.5 && h >= f.top - 3) { h = f.top - 2; lava = f.top; } // (русло на плато)
            if (Math.abs(ac) < hw + (f.top - H.LAVA_Y) * 0.012 && al >= -1.5 && al < 2) fallTop = Math.max(fallTop, f.top); // (колонна лавопада)
            if (Math.abs(ac) < hw + 2.5 && al > -4 && al < -1) fallHot = true;
        }
        const dm = Math.hypot(x - mark.x, z - mark.z);
        const r1 = hash(x, z, seed + 1), r2 = hash(x >> 1, z >> 1, seed + 2);
        // --- земля
        for (let L = MIN_LAYER; L <= h; L++) {
            let t;
            if (L <= bedrock) t = BLOCK.BEDROCK;
            else if (L === h) {
                if (lava) t = BLOCK.HELL_EMBER; // (дно лавы раскалено)
                else if (kind === 'road') t = BLOCK.HELL_BRICK;
                else if (kind === 'seat') t = dm < H.SPAWN_R + 1 ? (dm > 4.4 && dm < 5.6 ? BLOCK.HELL_OBSIDIAN : BLOCK.HELL_BRICK) : (r2 < 0.08 ? BLOCK.HELL_EMBER : BLOCK.HELL_OBSIDIAN);
                else if (h <= H.LAVA_Y + 2) t = r1 < 0.7 ? BLOCK.HELL_EMBER : BLOCK.HELL_BASALT;
                else if (kind === 'ash') t = r1 < 0.06 ? BLOCK.HELL_BASALT : BLOCK.HELL_ASH;
                else if (kind === 'obs') t = BLOCK.HELL_OBSIDIAN;
                else t = r1 < 0.12 ? BLOCK.HELL_ASH : BLOCK.HELL_BASALT;
            } else if (fallHot && L > h - 40) t = BLOCK.HELL_EMBER;
            else if (kind === 'obs' && L > h - 60) t = (L + (x & 3)) % 9 === 0 ? BLOCK.HELL_BASALT : BLOCK.HELL_OBSIDIAN;
            else t = hash(x >> 2, L, (z >> 2) + seed) < 0.05 ? BLOCK.HELL_OBSIDIAN : hash(x, L, z) < 0.012 ? BLOCK.HELL_EMBER : BLOCK.HELL_BASALT; // (жилы обсидиана, тлеющие вкрапления)
            blocks[((L - MIN_LAYER) * CHUNK + lz) * CHUNK + lx] = t;
        }
        let ht = h;
        for (let L = h + 1; L <= lava; L++) { put(lx, lz, L, BLOCK.HELL_LAVA); ht = L; }
        const base = ht; // (верх земли/лавы: от него — воздух)
        // --- мост: настил, парапеты, опоры, арки снизу
        if (deck != null) {
            const ph = (along % 24) - 12, archD = 2 + Math.round(5 * (ph * ph) / 144);
            for (let L = deck - archD; L <= deck; L++) if (L > base) put(lx, lz, L, BLOCK.HELL_BRICK);
            if (parapet) put(lx, lz, deck + 1, BLOCK.HELL_BRICK);
            if (pier) for (let L = h + 1; L < deck - archD; L++) put(lx, lz, L, BLOCK.HELL_BRICK);
            over = true;
        }
        // --- колонна лавопада (с края плато до озера)
        if (fallTop > base) { for (let L = base + 1; L <= fallTop; L++) put(lx, lz, L, BLOCK.HELL_LAVA); over = true; }
        // --- формы над землёй
        for (let i = 0; i < near.length; i++) {
            const f = near[i];
            switch (f.k) {
                case 'arch': {
                    const d = segDist(x, z, f.ax, f.az, f.bx, f.bz), t = segT, s = smoothSin(t);
                    const w = f.w * (1 + 0.7 * (1 - s));
                    if (d >= w) break;
                    const y = f.y0 + (f.top - f.y0) * Math.pow(s, f.gothic ? 0.42 : 0.58);
                    const th = f.th * (1 + 1.6 * (1 - s)) * (1 - 0.35 * (d / w) * (d / w));
                    const tp = f.gothic ? BLOCK.HELL_BRICK : f.gate ? BLOCK.HELL_OBSIDIAN : BLOCK.HELL_BASALT;
                    for (let L = Math.max(MIN_LAYER + 1, Math.round(y - th)); L <= Math.round(y) && L <= H.TOP; L++) if (get(lx, lz, L) === 0 || L <= base) put(lx, lz, L, tp);
                    over = true;
                    break;
                }
                case 'pillar': {
                    const d = Math.hypot(x - f.x, z - f.z);
                    if (d > f.r * 1.45) break;
                    const a = Math.atan2(z - f.z, x - f.x), flute = d > f.r * 0.86 && Math.sin(a * 10) > 0.55;
                    for (let L = base + 1; L <= f.top; L++) {
                        const rr = L < base + 4 ? f.r * 1.4 : L > f.top - 3 ? f.r * 1.3 : flute ? f.r * 0.86 : f.r;
                        if (d <= rr) put(lx, lz, L, L > f.top - 3 || L < base + 4 ? BLOCK.HELL_OBSIDIAN : BLOCK.HELL_BRICK);
                    }
                    break;
                }
                case 'titan': {
                    const ux = f.x1 - f.x0, uz = f.z1 - f.z0, Ls = Math.hypot(ux, uz);
                    // позвоночник с остистыми отростками
                    const d = segDist(x, z, f.x0, f.z0, f.x1, f.z1), sAl = segT * Ls;
                    if (d < 3.2) {
                        const proc = (sAl % 10) < 3 && d < 1.8 ? 4 + Math.round(2 * Math.sin(sAl)) : 0;
                        for (let L = f.y - 3; L <= f.y + proc; L++) if (L > base) put(lx, lz, L, BLOCK.HELL_BONE);
                        over = true;
                    }
                    // рёбра: от позвоночника вниз и наружу, дугой
                    for (let k = 0; k < f.ribs.length; k++) {
                        const rb = f.ribs[k];
                        const dd = segDist(x, z, rb.ax, rb.az, rb.bx, rb.bz);
                        if (dd > 1.7) continue;
                        const u = segT, y = f.y + (H.BASE - 6 - f.y) * Math.pow(u, 1.7) + 9 * Math.sin(Math.PI * u);
                        for (let L = Math.round(y - 2.2); L <= Math.round(y); L++) if (L > base) put(lx, lz, L, BLOCK.HELL_BONE);
                        over = true;
                    }
                    // череп: огромный, глазницы — чёрные провалы, рога дугами вверх
                    const sk = f.skull, ex = x - sk.x, ez = z - sk.z, dr = Math.hypot(ex, ez);
                    const cy = f.y + 5;
                    if (dr < sk.r) {
                        const k = Math.sqrt(1 - (dr / sk.r) * (dr / sk.r)) * 8;
                        const fwd = (ex * ux + ez * uz) / Ls, side = (-ex * uz + ez * ux) / Ls;
                        for (let L = Math.round(cy - k); L <= Math.round(cy + k); L++) {
                            if (L <= base) continue;
                            const eye = fwd > sk.r * 0.55 && Math.abs(Math.abs(side) - 4) < 2 && L >= cy && L <= cy + 4; // (глазницы)
                            const jaw = fwd > sk.r * 0.2 && L < cy - 3 && L > cy - 6; // (пасть)
                            if (!eye && !jaw) put(lx, lz, L, BLOCK.HELL_BONE);
                        }
                        over = true;
                    }
                    for (const sd of [-1, 1]) { // рога
                        const nx = -uz / Ls * sd, nz = ux / Ls * sd;
                        const ax = sk.x + nx * 6, az = sk.z + nz * 6, bx = sk.x + nx * 22 + ux / Ls * 6, bz = sk.z + nz * 22 + uz / Ls * 6;
                        const dd = segDist(x, z, ax, az, bx, bz), u = segT;
                        const w = 2.4 * (1 - u * 0.7);
                        if (dd > w) continue;
                        const y = cy + 6 + 26 * Math.pow(u, 1.6);
                        for (let L = Math.round(y - 3 * (1 - u) - 1); L <= Math.round(y); L++) if (L > base) put(lx, lz, L, BLOCK.HELL_BONE);
                        over = true;
                    }
                    break;
                }
                case 'prop:pit': {
                    const d = Math.hypot(x - f.x, z - f.z);
                    if (d < 1.4) put(lx, lz, f.y, BLOCK.HELL_EMBER); // (угли)
                    else if (d < 2.6) put(lx, lz, f.y + 1, BLOCK.HELL_BRICK); // (кольцо камней)
                    break;
                }
                case 'prop:totem': {
                    if (Math.abs(x - f.x) <= 0 && Math.abs(z - f.z) <= 0) { for (let L = f.y + 1; L <= f.y + f.h; L++) put(lx, lz, L, BLOCK.HELL_BONE); over = true; }
                    else if (Math.abs(x - f.x) <= 1 && Math.abs(z - f.z) <= 1 && (x === f.x || z === f.z)) put(lx, lz, f.y + f.h - 1, BLOCK.HELL_BONE); // (перекладина — рога тотема)
                    break;
                }
                default: break;
            }
        }
        // --- столб цепи дьявола и кованое кольцо (середина котловины)
        const dc = Math.hypot(x - H.CX, z - H.CZ);
        if (dc < H.RING_R + H.RING_TUBE + 1) {
            const ytop = H.SEAT_Y + H.ANCHOR_H;
            if (dc < H.ANCHOR_R * 1.35) for (let L = H.SEAT_Y + 1; L <= ytop; L++) {
                const rr = L < H.SEAT_Y + 4 ? H.ANCHOR_R * 1.35 : L > ytop - 2 ? H.ANCHOR_R * 1.2 : H.ANCHOR_R;
                if (dc <= rr) put(lx, lz, L, L === H.SEAT_Y + H.RING_Y ? BLOCK.HELL_IRON : BLOCK.HELL_BRICK);
            }
            const e = dc - H.RING_R;
            if (Math.abs(e) < H.RING_TUBE) {
                const k = Math.sqrt(H.RING_TUBE * H.RING_TUBE - e * e), y = H.SEAT_Y + H.RING_Y;
                for (let L = Math.round(y - k); L <= Math.round(y + k); L++) put(lx, lz, L, BLOCK.HELL_IRON);
            }
            // (спицы кольца к столбу — четыре)
            const a = Math.atan2(z - H.CZ, x - H.CX);
            if (dc > H.ANCHOR_R && dc < H.RING_R && Math.abs(Math.sin(2 * a)) < 0.12) put(lx, lz, H.SEAT_Y + H.RING_Y, BLOCK.HELL_IRON);
            over = true;
        }
        // --- верх столбца
        let tp = MAX_LAYER;
        while (tp > MIN_LAYER && get(lx, lz, tp) === 0) tp--;
        top[col] = tp;
        if (tp > maxTop) maxTop = tp;
        if (base + 1 < minOpen) minOpen = base + 1;
        if (tp > base) (hollow || (hollow = new Int16Array(CHUNK * CHUNK).fill(MIN_LAYER)))[col] = tp - 1;
    }
    const ch = { cx, cz, blocks, top, maxTop, modified: false, minOpen, sea: null, hell: true };
    if (over) { ch.caved = true; ch.hollow = hollow; }
    return ch;
}
