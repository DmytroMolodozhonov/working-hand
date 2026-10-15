/**
 * Stitching.js — «Stitching» (7 mana, no scroll): a passage the hand points at is sewn shut.
 *
 * The raised hand (the wand) points at a hole — a tunnel of a cave, a doorway without a door, a
 * gap in a wall, a hole in a floor. The magic looks along the hand for the NARROWEST empty
 * cross-section that is closed all round by material (rock, stone, brick, planks…): that is the
 * passage. If the emptiness is not closed all round (open air, a field, a hall too wide), the magic
 * does not work. Then stones of the same material as round the hole come flying off the walls
 * one after another — glowing seams of magic between them — and are laid into the passage: stone
 * by stone, from the bottom up, until it is shut. What is laid is an ordinary solid block of the
 * world: nobody walks or shoots through it, «Бомбардо» and the rest break it like any wall.
 *
 * Who decides: the spell goes to everybody ('spell') and every computer sees the stones fly; the
 * caster's computer lays the blocks (Builder._sendEdits — everybody gets them, they are saved). A
 * stone waits while somebody stands in its place (never laid into a body) and is left out when
 * they don't move away.
 */

import * as THREE from 'three';
import { BLOCK, BASE_COLORS, isLeaves } from '../world/Terrain.js';

export const STITCH = {
    REACH: 14, // m along the hand
    NEAR: 1.2, // m: never the cross-section the caster stands in
    MAX_CELLS: 24, // a wider emptiness is no passage («hall»)
    STEP: 0.14, // s between two stones
    FLY: 0.45, // s a stone flies
};

/** Not material to sew with: thin, soft or living things (and nothing). */
const NOT_MATERIAL = new Set([BLOCK.AIR, BLOCK.WATER, BLOCK.ICE_SHAPE, BLOCK.FENCE, BLOCK.FLOWERS, BLOCK.WHEAT, BLOCK.VEG, BLOCK.LANTERN,
    BLOCK.CARPET_RED, BLOCK.CARPET_BLUE, BLOCK.CARPET_GREEN, BLOCK.CARPET_PURPLE, BLOCK.ARCANE_LAMP, BLOCK.ARCANE_LAMP_VIOLET, BLOCK.POTION, BLOCK.BOOKS, BLOCK.GOLD]);
const open = (t) => t === BLOCK.AIR;
const material = (t) => !NOT_MATERIAL.has(t) && !isLeaves(t);
/** Natural ground turns to the rock under it when it walls a passage (grass is no wall). */
const AS_WALL = { [BLOCK.GRASS]: BLOCK.DIRT, [BLOCK.FARMLAND]: BLOCK.DIRT, [BLOCK.PATH]: BLOCK.DIRT, [BLOCK.SNOW]: BLOCK.STONE };

/** A world point → its cell (Terrain: block (x, L, z) fills y ∈ [L−1.5, L−0.5]). */
export const cellOf = (p) => ({ x: Math.round(p.x), L: Math.floor(p.y + 1.5), z: Math.round(p.z) });

/**
 * The plane of the cross-section for a hand pointing along `d`: 'x' / 'z' (a wall's opening,
 * a tunnel: x or z fixed) or 'y' (a hole in a floor or a ceiling: the layer fixed).
 */
export function planeOf(d) {
    if (Math.abs(d.y) > 0.75) return 'y';
    return Math.abs(d.x) >= Math.abs(d.z) ? 'x' : 'z';
}

/** The 4 neighbours of a cell inside its plane. */
function around(c, plane) {
    if (plane === 'x') return [[c.x, c.L + 1, c.z], [c.x, c.L - 1, c.z], [c.x, c.L, c.z + 1], [c.x, c.L, c.z - 1]];
    if (plane === 'z') return [[c.x, c.L + 1, c.z], [c.x, c.L - 1, c.z], [c.x + 1, c.L, c.z], [c.x - 1, c.L, c.z]];
    return [[c.x + 1, c.L, c.z], [c.x - 1, c.L, c.z], [c.x, c.L, c.z + 1], [c.x, c.L, c.z - 1]];
}

/**
 * The emptiness of one cross-section round `start` (flood inside the plane): {cells, walls} when it
 * is closed all round by material, null when it runs out (open air, a too wide hall).
 */
export function crossSection(get, start, plane, max = STITCH.MAX_CELLS) {
    if (!open(get(start.x, start.L, start.z))) return null;
    const seen = new Set([`${start.x},${start.L},${start.z}`]);
    const cells = [start], walls = new Map();
    for (let i = 0; i < cells.length; i++) {
        for (const [x, L, z] of around(cells[i], plane)) {
            const k = `${x},${L},${z}`;
            if (seen.has(k)) continue;
            seen.add(k);
            const t = get(x, L, z);
            if (open(t)) {
                cells.push({ x, L, z });
                if (cells.length > max) return null;
            } else if (material(t)) walls.set(t, (walls.get(t) || 0) + 1);
            else return null; // (water, a fence, flowers, a lantern…: not closed by material — the magic finds no hold)
        }
    }
    return { cells, walls };
}

/** The material of the walls round it (the most common; ground as the rock it is). */
export function materialOf(walls) {
    let best = BLOCK.STONE, n = -1;
    for (const [t, k] of walls) if (k > n) { best = t; n = k; }
    return AS_WALL[best] ?? best;
}

/**
 * Along the hand: the passage to sew — the narrowest closed cross-section between NEAR and the
 * first wall the hand points at (a doorway seen from a room is narrower than the room).
 * get(x, L, z) → block. → {cells, block, plane} | {why: 'none' | 'open'}
 */
export function findPassage(get, o, d, { reach = STITCH.REACH, near = STITCH.NEAR, max = STITCH.MAX_CELLS } = {}) {
    const plane = planeOf(d);
    const key = (c) => (plane === 'x' ? c.x : plane === 'z' ? c.z : c.L);
    const tried = new Set();
    let best = null, sawOpen = false;
    const p = new THREE.Vector3();
    for (let t = near; t <= reach; t += 0.2) {
        p.copy(o).addScaledVector(d, t);
        const c = cellOf(p);
        const b = get(c.x, c.L, c.z);
        if (!open(b)) { if (material(b) || b === BLOCK.WATER) break; continue; } // (the wall behind: look no further)
        sawOpen = true;
        const k = key(c);
        if (tried.has(k)) continue;
        tried.add(k);
        const s = crossSection(get, c, plane, max);
        if (s && (!best || s.cells.length < best.cells.length)) best = s;
    }
    if (!best) return { why: sawOpen ? 'open' : 'none' };
    // stone by stone: from the bottom up, along the row
    const cells = best.cells.slice().sort((a, b) => a.L - b.L || a.x - b.x || a.z - b.z);
    return { cells, block: materialOf(best.walls), plane };
}

/**
 * ON WHOM AND ON WHAT (CLAUDE.md). Stitching lays stones; it never strikes.
 */
export const STITCH_TARGETS = {
    me: { does: 'none', why: 'колдующего не замуровывает: проход ищется не ближе 1.2 м, а камень не ложится туда, где стоит тело' },
    players: { does: 'wait', why: 'камень не кладётся в игрока: ждёт, пока он отойдёт (не ушёл — это место остаётся пустым)' },
    zombies: { does: 'wait', why: 'так же: в тело камень не ложится; заделанный проход зомби не проходят (коллизия блоков)' },
    castlePeople: { does: 'wait', why: 'жителей, рыцарей не замуровывает; закрытый проход — стена для них' },
    animals: { does: 'wait', why: 'так же — ждёт, пока отойдут' },
    sailors: { does: 'none', why: 'корабль — не блоки мира: проход в корабле не сшивается' },
    spider: { does: 'wait', why: 'паучиха большая — камни не ложатся в её тело' },
    livingTrees: { does: 'wait', why: 'в живое дерево камень не кладётся' },
    bookBirds: { does: 'none', why: 'летают — их не касается' },
    dragon: { does: 'wait', why: 'в дракона камень не кладётся; вход в логово можно сшить, если дракон не в нём (вход большой — шире 24 клеток не сшивается)' },
    phoenix: { does: 'none', why: 'не касается' },
    blocks: { does: 'build', why: 'проход закладывается блоками того же камня / кирпича / дерева, что вокруг; это обычная твёрдая стена — Бомбардо и другие её ломают' },
    houses: { does: 'build', why: 'проём без двери в доме или в стене замка заделывается; дверь, если стоит, — не пустота: её не сшить' },
    caves: { does: 'build', why: 'проход пещеры заделывается камнем пещеры' },
    open: { does: 'none', why: 'пустота не окружена материалом (открытое поле, небо, широкий зал) — магия не работает' },
    water: { does: 'none', why: 'проход, где стоит вода, не сшивается (вода — не пустота и не опора для камня)' },
    ships: { does: 'none', why: 'корабль — не блоки мира' },
    ward: { does: 'none', why: 'дом под чужой сферой защиты не трогает (HouseWards.forbids)' },
};

const _v = new THREE.Vector3();

export class Stitching {
    constructor(game) {
        this.game = game;
        this._geo = null;
    }

    _get() {
        const data = this.game.terrain?.data;
        return data ? (x, L, z) => data.get(x, L, z) : null;
    }

    /** Voice on my computer. */
    cast(isFinal) {
        const g = this.game;
        const now = performance.now();
        if (now - (this._lastAt || -1e9) < 1500) return null;
        const ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        const side = g.wandSide() || (ch.isArmRaised(pref) ? pref : ['right', 'left'].find((s) => ch.isArmRaised(s)));
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (!side || !ch.isArmRaised(side)) return hint('🧵 Поднимите руку (палочку), направьте её на проход — и скажите «Stitching»');
        const get = this._get();
        if (!get) return null;
        const origin = g.castOrigin(side);
        const dir = ch.getHandDirection(side);
        const found = findPassage(get, origin, dir);
        if (!found.cells) return hint(found.why === 'open'
            ? '🧵 Здесь пустота не окружена камнем или стеной — магия не работает. Направьте руку на проход (пещера, проём без двери)'
            : '🧵 Не вижу прохода — направьте руку на дыру в стене или проход пещеры (не дальше 14 м)');
        if (g.wards?.forbids?.(origin, _v.set(found.cells[0].x, found.cells[0].L - 1, found.cells[0].z))) return hint('🛡️ Этот дом под защитой — сшить нельзя');
        const tired = g.combat.check('Stitching');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('Stitching');
        this._lastAt = now;
        g.spells.cast('Stitching', origin, dir, side, g.localId);
        g.sync?.spell('Stitching', origin, dir, side);
        return 'Stitching';
    }

    /** (every computer) the stones fly into the passage; the caster's computer lays them. */
    sew(origin, dir, casterId) {
        const g = this.game;
        const get = this._get();
        if (!get) return;
        const found = findPassage(get, origin, dir.clone().normalize());
        if (!found.cells) return;
        const mine = casterId === g.localId || casterId === 'local';
        const color = BASE_COLORS[found.block] ?? 0x8a8a8a;
        const mat = new THREE.MeshLambertMaterial({ color, emissive: 0x6a5cff, emissiveIntensity: 0.35 });
        if (!this._geo) this._geo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
        // where each stone comes from: a point on the walls round the passage, a little out of them
        const mid = new THREE.Vector3();
        for (const c of found.cells) mid.add(_v.set(c.x, c.L - 1, c.z));
        mid.divideScalar(found.cells.length);
        const stones = found.cells.map((c, i) => {
            const to = new THREE.Vector3(c.x, c.L - 1, c.z);
            const a = Math.random() * Math.PI * 2;
            const from = to.clone().add(_v.set(Math.cos(a) * 2.5, (Math.random() - 0.3) * 2.5, Math.sin(a) * 2.5));
            return { c, to, from, at: i * STITCH.STEP, mesh: null, laid: false, waitT: 0 };
        });
        g.sound?.playWhoosh?.();
        g.fx.lightFlash?.(mid, 0x8f80ff, 2.5, 0.4, 14);
        let t = 0;
        const total = stones.length * STITCH.STEP + STITCH.FLY + 3; // (+3 s: a stone waits for a body to step aside)
        g.spells.spells.push({
            life: total,
            onUpdate: (spell, dt) => {
                t += dt;
                let left = 0;
                for (const s of stones) {
                    if (s.laid) continue;
                    left++;
                    const lt = t - s.at;
                    if (lt < 0) continue;
                    if (!s.mesh) {
                        s.mesh = new THREE.Mesh(this._geo, mat);
                        s.mesh.scale.setScalar(0.3);
                        g.scene.add(s.mesh);
                        // a puff of grit where it leaves the wall
                        for (let i = 0; i < 6; i++) g.fx.spark(s.from, color, 0.08, _v.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.5);
                    }
                    const k = Math.min(1, lt / STITCH.FLY);
                    const e = k * k * (3 - 2 * k);
                    s.mesh.position.lerpVectors(s.from, s.to, e);
                    s.mesh.position.y += Math.sin(k * Math.PI) * 0.8; // (an arc)
                    s.mesh.rotation.set((1 - e) * 4, (1 - e) * 3, 0);
                    s.mesh.scale.setScalar(0.3 + 0.7 * e);
                    if (Math.random() < 0.5) g.fx.spark(s.mesh.position, 0xb9b0ff, 0.06, _v.set(0, 0.3, 0), 0.4); // (the thread of magic behind it)
                    if (k < 1) continue;
                    // in place: never into a body — it waits for it to step aside
                    if (this._occupied(s.c)) { s.waitT += dt; if (s.waitT < 3) continue; this._drop(s); continue; }
                    this._lay(s, found.block, mine, color);
                }
                if (!left) spell.life = 0;
            },
            onEnd: () => { for (const s of stones) if (s.mesh) this._drop(s); mat.dispose(); },
        });
    }

    _drop(s) {
        if (!s.mesh) return;
        this.game.scene.remove(s.mesh);
        s.mesh = null;
        s.laid = true;
    }

    /** The stone is in: a seam of light round it; the caster's computer makes it a block of the world. */
    _lay(s, block, mine, color) {
        const g = this.game;
        this._drop(s);
        for (let i = 0; i < 10; i++) g.fx.spark(s.to, i % 2 ? 0xd8d0ff : color, 0.07, _v.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3), 0.35);
        g.sound?.playStep?.();
        if (!mine) return;
        const data = g.terrain?.data;
        if (!data || data.get(s.c.x, s.c.L, s.c.z) !== BLOCK.AIR) return;
        data.set(s.c.x, s.c.L, s.c.z, block);
        g.builder?._sendEdits([[s.c.x, s.c.L, s.c.z, block]]);
    }

    /** Somebody's body is in this cell (the players, every creature Duel._bodies knows). */
    _occupied(c) {
        const g = this.game;
        const lo = c.L - 1.5, hi = c.L - 0.5;
        for (const e of g.duel?._bodies?.() || []) {
            const yl = Math.min(e.a.y, e.b.y) - e.r, yh = Math.max(e.a.y, e.b.y) + e.r;
            if (yh < lo || yl > hi) continue;
            const mx = (e.a.x + e.b.x) / 2, mz = (e.a.z + e.b.z) / 2;
            if (Math.abs(mx - c.x) < 0.5 + e.r && Math.abs(mz - c.z) < 0.5 + e.r) return true;
        }
        return false;
    }
}
