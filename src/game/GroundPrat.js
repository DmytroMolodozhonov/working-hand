/**
 * GroundPrat.js — «Ground Prat» (10 mana, +2 cells of mana at the first cast, a scroll): the ground rises into a wall.
 * It belongs to the Protection group (the author: «сэкономить на Protection»): another wizard's spell hits the wall.
 *
 * The wand points at the ground a few steps ahead (2.5–9 m, downwards). From that spot a wall grows across the way
 * «from me to the spot»: 7 blocks wide, 2 thick, 5 high — the hero is ~3.5 m, so «чуть выше твоего роста» is 5 m.
 * Each column of the wall is made of what the ground is under that very column (`wallMaterial`): stone → stone,
 * sand → sand, grass / earth → earth under a cap of grass, snow → snow, gravel → gravel, a planet's rock → its rock;
 * a column over wood, leaves, ice, a castle's block takes the earthy block under it. So on the seam of sand and
 * rock the wall is honestly patched.
 *
 * The top is not a board: every column is 5 high ±1 at the edges and now and then a block short inside (a toothed
 * crest, drawn from the cast's seed — the same on every computer), and a little scree of single blocks lies at the
 * foot. It grows from the middle to the edges and from the bottom up in `GROW` = 2 s: not at once, not slowly.
 *
 * It does not work on: the enchanted stone (arena floors, the wizards' tower walls) and the gifts of the gods
 * (`godGift`, the temple of the gods) — those columns are left out, and if the whole strip is such, the spell does not
 * work and costs nothing; water (the wall does not grow from the water); a ship's deck; a house's foreign ward;
 * space. On the planets it works with the planet's own rock.
 *
 * What it lays are ordinary blocks (Builder._sendEdits): solid at once — a spell or an arrow hits the wall, «Бомбардо»
 * breaks it as any wall, «Gather» takes it apart; saved with the world. Nothing hangs: a column grows from its own
 * ground, and when a cell has to be left out (a body stands in it for 1.5 s) the rest of the column above it is left out.
 * Instant spell (not held — Concentration.js).
 *
 * Who decides: the caster's computer finds the place and lays the blocks; the spell goes to everybody ('spell':
 * o = the spot, d = the way from the caster) so every computer sees the ground rise and plans the same wall.
 */

import * as THREE from 'three';
import { BLOCK, isLeaves, isWood, isPlanetBlock } from '../world/Terrain.js';
import { isEnchanted } from '../world/EnchantedStone.js';
import { castingHand } from './WandAim.js';
import { occupied } from './Stitching.js';

export const GROUND_PRAT = {
    REACH: 12, // m along the hand when looking for the ground
    NEAR: 2.5, FAR: 9, // m from the caster to the spot
    W: 7, T: 2, H: 5, // blocks: width, thickness, height (the hero is ~3.5 m: «чуть выше роста»)
    GROW: 2, // s from the first block to the last
    WAIT: 1.5, // s a block waits for a body to step aside
    SEND: 0.12, // s: the blocks laid go out together
    STEP: 3, // blocks: the ground under a column at most this far from the spot's level (no pillars over a cliff)
    SCREE: 0.28, // chance of a lump of rubble on a free place at the foot
};

/** ON WHOM AND ON WHAT (CLAUDE.md). The wall is blocks laid on the ground; it never strikes. */
export const GROUND_PRAT_TARGETS = {
    me: { does: 'none', why: 'колдующего не задевает: стена растёт на расстоянии от 2,5 м; если он стоит на её месте — блок ждёт' },
    players: { does: 'wait', why: 'блок не кладётся в игрока: ждёт 1,5 с, потом это место пропускается (и всё, что над ним в столбце); никого не толкает и не ранит' },
    zombies: { does: 'wait', why: 'в тело блок не кладётся; зомби упирается в стену и обходит её (коллизия блоков)' },
    castlePeople: { does: 'wait', why: 'жителей не пугает и не задевает (стена — не опасность, не тревога); они обходят её, пути пересчитываются; строители замка её не убирают' },
    animals: { does: 'wait', why: 'в животное блок не кладётся; животные обходят стену' },
    sailors: { does: 'none', why: 'корабль — не земля: на палубе стена не растёт' },
    spider: { does: 'wait', why: 'в паучиху блок не кладётся' },
    livingTrees: { does: 'wait', why: 'в живое дерево блок не кладётся; столбец с деревом над землёй пропускается' },
    bookBirds: { does: 'none', why: 'летают — не касается' },
    iceCastle: { does: 'wait', why: 'Королеву, снеговиков, ледяных монстров не задевает; блок ждёт, пока уйдут' },
    blackship: { does: 'none', why: 'капитан и скелеты на корабле в море — там нет земли, стена не растёт' },
    dragon: { does: 'wait', why: 'в дракона блок не кладётся; дракон огнём и телом ломает такую стену как любые блоки' },
    phoenix: { does: 'none', why: 'не касается' },
    owl: { does: 'none', why: 'не касается' },
    blocks: { does: 'build', why: 'вырастает из материала земли под каждым столбцом (камень, песок, земля с травой, снег, гравий, порода планеты); обычные блоки мира: их ломают «Бомбардо», «Gather», Total Destruction и так далее' },
    items: { does: 'lift', why: 'вещи на земле под стеной поднимаются на её верх, а не остаются замурованными' },
    water: { does: 'none', why: 'из воды стена не растёт: столбцы над водой пропускаются, если вся полоса на воде — «там вода»' },
    ground: { does: 'build', why: 'цель — земля перед игроком: палочка вниз-вперёд на 2,5–9 м; в стену, в небо или в дом — подсказка «направьте на землю»' },
    trees: { does: 'none', why: 'деревья не трогает; из дерева не строит — столбец над стволом пропускается' },
    houses: { does: 'none', why: 'стены домов и замков не ломает и не задевает; столбцы, где занято, пропускаются' },
    ships: { does: 'none', why: 'палуба — не земля, корабль не блоки мира' },
    ward: { does: 'none', why: 'в чужой сфере защиты дома не растёт (HouseWards.forbids)' },
    godGift: { does: 'none', why: 'дары богов (храм, пьедесталы) не подчиняются: столбцы над ними не растут' },
    enchanted: { does: 'none', why: 'заколдованный камень (арены, башни волшебников) не слушается: столбцы над ним не растут' },
    space: { does: 'none', why: 'в космосе под ногами нет земли (spaceSpellBlock); на планетах работает из их породы' },
    spells: { does: 'block', why: 'заряды дуэли, стрелы и лучи упираются в твёрдые блоки стены; взрыв ломает те блоки, что попали в круг' },
};

const free = (t) => t === BLOCK.AIR;
const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** The wall's material over a ground block `b`, or null when that block is not earth to build of (the caller looks lower). */
export function wallMaterial(b) {
    if (b === BLOCK.GRASS || b === BLOCK.DIRT || b === BLOCK.STONE || b === BLOCK.SNOW || b === BLOCK.SAND || b === BLOCK.GRAVEL || b === BLOCK.DEEPSTONE) return b;
    if (b === BLOCK.FARMLAND || b === BLOCK.PATH) return BLOCK.DIRT;
    if (isPlanetBlock(b)) return b;
    return null;
}
/** The material a column takes from the ground at layer g (the block, else the ones under it up to 6 down, else earth). */
export function columnMaterial(get, x, g, z) {
    for (let k = 0; k <= 6; k++) {
        const b = get(x, g - k, z);
        if (isWood(b) || isLeaves(b)) continue;
        const m = wallMaterial(b);
        if (m != null) return m;
    }
    return BLOCK.DIRT;
}

/** One column's height in blocks: 5, ±1 at the two edges, a block short here and there inside. Same seed → same crest. */
export function columnHeight(seed, x, z, w) {
    const r = hash(seed, x, z), edge = Math.abs(w) >= 3;
    if (edge) return GROUND_PRAT.H + (r < 0.4 ? -1 : r > 0.8 ? 1 : 0);
    return GROUND_PRAT.H - (r < 0.25 ? 1 : 0);
}

/**
 * The wall for the spot A ({x, z, L: the ground layer there}) and the way f ({x, z}, flat, unit: from the caster):
 * {cells: [[x, L, z, block, t, col, k]…], cols, w, h} | {why: 'holy' | 'water' | 'none'}.
 * get(x, L, z) → block; top(x, z) → the highest solid layer; gift(x, L, z) → a gift of the gods.
 * t = the second (0…GROW) the cell appears; col = the column (`next` is the layer it needs next); k = its layer in it.
 */
export function groundPratPlan(get, top, A, f, seed = 1, gift = null) {
    const sx = -f.z, sz = f.x, G = GROUND_PRAT;
    const cols = new Map(); // "x,z" → column
    const half = (G.W - 1) / 2;
    const nw = Math.round(G.W / 0.35);
    for (let i = 0; i <= nw; i++) {
        const w = -half + (G.W - 1) * i / nw;
        for (let t = 0; t <= G.T - 1 + 0.01; t += 0.5) {
            const x = Math.round(A.x + sx * w + f.x * t), z = Math.round(A.z + sz * w + f.z * t);
            const k = x + ',' + z;
            if (!cols.has(k)) cols.set(k, { x, z, w: Math.round(w) });
        }
    }
    let holy = 0, wet = 0;
    const list = [], cells = [];
    for (const c of cols.values()) {
        const g = top(c.x, c.z);
        const b = get(c.x, g, c.z);
        if (isEnchanted(b) || (gift && gift(c.x, g, c.z))) { holy++; continue; }
        if (b === BLOCK.WATER || get(c.x, g + 1, c.z) === BLOCK.WATER) { wet++; continue; }
        if (Math.abs(g - A.L) > G.STEP || !free(get(c.x, g + 1, c.z))) continue;
        c.g = g; c.mat = columnMaterial(get, c.x, g, c.z);
        c.h = columnHeight(seed, c.x, c.z, c.w);
        c.next = 0; c.dead = false;
        list.push(c);
    }
    if (!list.length) return { why: holy ? 'holy' : wet ? 'water' : 'none' };
    const rise = G.GROW * 0.62, lead = G.GROW - rise;
    for (const c of list) {
        const delay = lead * Math.min(1, Math.abs(c.w) / half);
        for (let k = 0; k < c.h; k++) {
            const L = c.g + 1 + k;
            if (!free(get(c.x, L, c.z))) break;
            const block = c.mat === BLOCK.GRASS ? (k === c.h - 1 ? BLOCK.GRASS : BLOCK.DIRT) : c.mat; // (grass: earth under a cap of grass)
            cells.push([c.x, L, c.z, block, delay + rise * (k + 1) / c.h, c, k]);
        }
    }
    // a little scree at the foot: single lumps in front of and behind the wall, on free ground of the same level
    const seen = new Set([...cols.keys()]);
    for (const c of list) {
        for (const [dx, dz] of [[f.x, f.z], [-f.x, -f.z]]) {
            const x = Math.round(c.x + dx * 1.2), z = Math.round(c.z + dz * 1.2), key = x + ',' + z;
            if (seen.has(key)) continue;
            seen.add(key);
            if (hash(seed + 7, x, z) > G.SCREE) continue;
            const g = top(x, z);
            if (Math.abs(g - c.g) > 0 || !free(get(x, g + 1, z)) || isEnchanted(get(x, g, z)) || (gift && gift(x, g, z)) || get(x, g + 1, z) === BLOCK.WATER) continue;
            const col = { x, z, w: c.w, g, mat: columnMaterial(get, x, g, z), h: 1, next: 0, dead: false };
            cells.push([x, g + 1, z, col.mat, G.GROW * 0.85 + hash(seed, z, x) * 0.15, col, 0]);
        }
    }
    cells.sort((a, b) => a[4] - b[4] || a[1] - b[1]);
    return { cells, cols: list, w: G.W, h: G.H };
}

/** Why it cannot grow — the hint for the player. */
export function groundPratHint(why) {
    if (why === 'holy') return '🧱 Заколдованный камень и дары богов не слушаются — «Ground Prat» здесь не поднять';
    if (why === 'water') return '🌊 Из воды стена не растёт — найдите сухую землю';
    if (why === 'near') return '🧱 Покажите на землю чуть дальше от себя — стена вырастет перед вами';
    if (why === 'far') return '🧱 Земля слишком далеко — подойдите ближе или покажите на землю поближе';
    if (why === 'unknown') return '🧱 Там земля ещё не готова — подождите секунду';
    return '🧱 Направьте палочку на землю перед собой';
}

/**
 * Where the wand shows: the spot on the ground and the way from the caster.
 * get / top / gift as in groundPratPlan; origin, dir: the hand; me: the caster's feet (x, y, z). → {A, f, plan} | {why}
 */
export function groundPratAim(data, origin, dir, me, known = null, gift = null) {
    if (!data) return { why: 'none' };
    if (dir.y > -0.12) return { why: 'none' }; // (not at the ground: forward, up)
    const hit = data.raycast(origin, dir, GROUND_PRAT.REACH);
    if (!hit) return { why: 'none' };
    const x = Math.round(hit.x), z = Math.round(hit.z);
    if (known && !known(x, z)) return { why: 'unknown' };
    const get = (a, L, b) => data.get(a, L, b), top = (a, b) => data.topLayer(a, b);
    const g = top(x, z);
    if (Math.abs(hit.y - (g - 0.5)) > 0.9) return { why: 'none' }; // (the side of a cliff, a wall: not the ground)
    const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz);
    if (d < GROUND_PRAT.NEAR) return { why: 'near' };
    if (d > GROUND_PRAT.FAR) return { why: 'far' };
    const f = { x: dx / d, z: dz / d };
    const A = { x, z, L: g };
    const seed = (x * 73856093) ^ (z * 19349663) ^ Math.round(f.x * 100) * 83492791;
    const plan = groundPratPlan(get, top, A, f, seed, gift);
    return plan.cells ? { A, f, plan, seed } : plan;
}

const sparkColor = (b) => (b === BLOCK.SAND ? 0xe6d8a0 : b === BLOCK.SNOW ? 0xf4f8ff : b === BLOCK.GRASS ? 0x7fbf5a : b === BLOCK.DIRT ? 0x8a6a44 : 0xb8b4aa);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class GroundPrat {
    constructor(game) {
        this.game = game;
        this._lastAt = -1e9;
    }

    get data() { return this.game.terrain?.data || null; }

    /** Voice on my computer. `aim` ({origin, dir}) is for tests. */
    cast(isFinal, aim = null) {
        const g = this.game;
        const now = performance.now();
        if (now - this._lastAt < 1500) return null;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        const hand = aim ? { side: 'right', origin: aim.origin, dir: aim.dir } : castingHand(g);
        if (!hand) return hint(groundPratHint('none'));
        const data = this.data;
        const p = g.character.group.position;
        const at = groundPratAim(data, hand.origin, hand.dir, p, data?.landMade ? (x, z) => data.landMade(x, z) : null, data?.godGiftAt ? (x, L, z) => data.godGiftAt(x, L, z) : null);
        if (!at.plan) return hint(groundPratHint(at.why));
        const mid = _v.set(at.A.x, at.A.L, at.A.z);
        if (g.wards?.forbids?.(hand.origin, mid)) return hint('🛡️ Здесь чужая защита дома — стену не поднять');
        if (g.ships?.footprintAt?.(at.A.x, at.A.L - 1, at.A.z)) return hint('⚓ Корабль — не земля: стена здесь не растёт');
        const tired = g.combat.check('GroundPrat');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('GroundPrat');
        this._lastAt = now;
        const o = new THREE.Vector3(at.A.x, at.A.L, at.A.z), d = new THREE.Vector3(at.f.x, 0, at.f.z);
        this.grow(o, d, g.localId, at.plan);
        g.sync?.spell('GroundPrat', o, d, hand.side);
        return 'GroundPrat';
    }

    /**
     * (every computer) The ground rises: block after block, from the middle to the edges and from the bottom up,
     * in dust and crumbs; the caster's computer lays the blocks. o: the spot (x, ground layer, z); d: the way from the caster.
     */
    grow(o, d, casterId, plan = null) {
        const g = this.game;
        const data = this.data;
        if (!data) return;
        const A = { x: Math.round(o.x), L: Math.round(o.y), z: Math.round(o.z) };
        const h = Math.hypot(d.x, d.z) || 1, f = { x: d.x / h, z: d.z / h };
        if (!plan) {
            const seed = (A.x * 73856093) ^ (A.z * 19349663) ^ Math.round(f.x * 100) * 83492791;
            plan = groundPratPlan((x, L, z) => data.get(x, L, z), (x, z) => data.topLayer(x, z), A, f, seed, data.godGiftAt ? (x, L, z) => data.godGiftAt(x, L, z) : null);
        }
        if (!plan.cells) return;
        const mine = casterId === g.localId || casterId === 'local';
        const cells = plan.cells.map((c) => ({ c, wait: 0, done: false }));
        const out = [];
        const flush = () => {
            if (!out.length) return;
            g.builder?._sendEdits(out.splice(0));
            g.castleLife?.breakWays?.({ x: A.x, y: A.L, z: A.z }, 6); // (the ways of the people round it are worked out again)
        };
        let t = 0, sendT = 0, finished = false, first = true;
        g.spells.spells.push({
            life: GROUND_PRAT.GROW + GROUND_PRAT.WAIT + 1.5,
            onUpdate: (spell, dt) => {
                t += dt;
                let left = 0;
                for (const e of cells) {
                    if (e.done) continue;
                    const [x, L, z, block, at, col, k] = e.c;
                    if (at > t) { left++; continue; }
                    if (col.dead) { e.done = true; continue; } // (a cell below was left out: this one would hang)
                    if (col.next !== k) { left++; continue; } // (the one under it is still to come)
                    if (occupied(g, { x, L, z })) {
                        e.wait += dt;
                        if (e.wait < GROUND_PRAT.WAIT) { left++; continue; }
                        col.dead = true; e.done = true; continue;
                    }
                    e.done = true; col.next++;
                    if (Math.random() < 0.6) {
                        g.fx.spark(_v.set(x, L - 1, z), sparkColor(block), 0.14, _w.set((Math.random() - 0.5) * 2.4, 1.2 + Math.random() * 2.2, (Math.random() - 0.5) * 2.4), 0.55);
                        if (k === 0 && Math.random() < 0.5) g.fx.spark(_v.set(x, L - 0.9, z), 0xc9b48a, 0.2, _w.set((Math.random() - 0.5) * 3, 0.6, (Math.random() - 0.5) * 3), 0.7);
                    }
                    if (!mine || !free(data.get(x, L, z))) continue;
                    data.set(x, L, z, block);
                    out.push([x, L, z, block]);
                    this._liftThings(x, L, z, col.g + col.h);
                    if (first) { first = false; g.mana?.success?.('GroundPrat'); }
                }
                sendT += dt;
                if (sendT >= GROUND_PRAT.SEND) { sendT = 0; flush(); }
                if (!left && t >= GROUND_PRAT.GROW && !finished) {
                    finished = true;
                    flush();
                    g.sound?.playStep?.();
                    spell.life = 0;
                }
            },
            onEnd: () => flush(),
        });
    }

    /** (the caster's computer, who owns the things) Things lying in the cell come up on the top of the wall. */
    _liftThings(x, L, z, topLayer) {
        const loose = this.game.items?.loose;
        if (!loose) return;
        for (const it of loose.values()) {
            const p = it.model?.position;
            if (!p || Math.abs(p.x - x) > 0.6 || Math.abs(p.z - z) > 0.6 || p.y > L - 0.4 || p.y < L - 1.6) continue;
            p.y = topLayer - 0.5 + 0.12; // (on the top of the column's last block)
            it.rest = false; it.sentRest = false;
        }
    }
}
