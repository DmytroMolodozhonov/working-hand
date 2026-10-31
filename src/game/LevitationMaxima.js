/**
 * LevitationMaxima.js — «Вингардиум Левиоса Максима».
 *
 * The big form of «Вингардиум Левиоса»: it lifts what the plain one never could.
 *   Mana       50 at once, then 2 a second while it holds (no mana comes back meanwhile) — as long
 *              as there is mana it holds; «стоп» (or no mana) lets go: what it held falls.
 *              Saying the words again sets it down gently. Creative: no mana rules.
 *              Outside Creative it is learnt from a burnt scroll (a lilac ribbon).
 *   A group    the hand (the wand) points at a creature: every creature round it (GROUP_R) rises
 *              at once — players, villagers, knights, wizards, sailors, zombies, animals, the giant
 *              spider, living trees — each hanging where it was against the hand's line and
 *              following the hand (kicking, struggling). Let go: they fall and get hurt (Levitation).
 *   A tree     pointed at, it does not come by itself: the caster works it loose with the wand —
 *              rocks it to and fro (side to side or up and down) and pulls up, like pulling a tooth
 *              (wiggleStep: every swing loosens it by its size × briskness × the pull; no rocking —
 *              nothing, and it settles back). It leans with the wand, creaks, earth crumbles off;
 *              loose enough (effortNeed: heavier — more) and pulled up, it tears out with its roots
 *              and a lump of earth (a hole is left), then floats after the hand.
 *   A house    the same, without roots: it creaks and cracks, then tears off the ground whole with
 *              what is inside (the people inside rise with it; the beds, chests, door and glass break).
 *   A wall     a piece of a castle wall / tower / fence (~3×3 round where the wand points; a house's
 *              own wall is the house) — worked loose the same way, carried, thrown, set down.
 *   Earth      a lump of the ground (a bowl ~3 m, deeper in the middle) — the same; a pit is left.
 *   A ship     rises out of the water at once (the sea pours off its keel) with its crew and all on
 *              its deck — they ride it in its own coordinates (Ships._carry).
 *   Let go     a house / a tree falls by gravity and breaks where it lands: a heap of rubble / a
 *              felled tree, and it crushes what it falls on (CRUSH: creatures under it are hurt and
 *              knocked down, the blocks it lands on break). Set down gently: a house stands again
 *              whole where it was put, a tree is planted upright. A ship dropped into the sea takes
 *              damage by the height; dropped on land it is a wreck (set down gently on land: it is
 *              stranded, whole).
 *   Armour     the plain «Левиоса» is stopped by magic armour (levBlocked); the Maxima goes through.
 *   Collisions what is carried does not pass through the world: it rises over what is under it;
 *              a lifted house / tree has its own collision boxes (walls, floor, trunk, crown) that
 *              move with it on every computer.
 *   Network    the host decides everything (who rises, the pulling, the carrying, the landing and
 *              its block edits); the caster's own computer counts the mana and says when it ends.
 *              A house / a tree is drawn on every computer as ONE instanced mesh from that
 *              computer's own world data (the same everywhere) — cheap, it does not drop the FPS.
 *
 * «На кого и на что» (CLAUDE.md): MAXIMA_TARGETS below.
 */

import { isDivine } from './DivineSword.js';
import { isEnchanted } from '../world/EnchantedStone.js';
import * as THREE from 'three';
import { BLOCK, TREE_KINDS, BASE_COLORS, WATER_LEVEL_Y, patternOf } from '../world/Terrain.js';
import { applyVoxelDetail } from '../world/VoxelShading.js';
import { Chest } from '../entities/Chest.js';
import { createRng } from '../core/math.js';
import { aimOffset, applyAimOffset, steadyDir, fallDamage, levBlocked } from './Levitation.js';
import { spiderCenter } from './Spider.js';
import { keelY } from './ShipLayout.js';
import { isCursed } from './Ships.js';
import { ItemSwarm } from './ItemSwarm.js';
import { swarmDrain, SWARM, SWARM_TARGETS } from './ItemSwarmRules.js';

export const LEV_MAX = {
    NAME: 'LevitationMaxima',
    COST: 50, // mana at once
    DRAIN: 2, // mana a second while it holds
    RANGE: 60, // m: what the hand can reach
    CONE: 0.4, // rad round the hand's line (a creature)
    GROUP_R: 7, // m round the creature pointed at: all of them rise
    MAX_GROUP: 24,
    FOLLOW: 1.6, // 1/s: a house / a tree / a ship follows the hand (heavier than the plain one: 3.5)
    MIN_HOLD: 4,
    LOWER: 2.5, // m/s: set down gently
    G: 22, // m/s² (as everything that falls in the game)
    SAME_PHRASE: 2.5, // s: the same words again within this are the same phrase (not «let it down»)
};

/**
 * Working it loose — like pulling a tooth (CLAUDE.md: nothing «by itself», no timer). Only the
 * wand's own movement does it: the hand rocks it to and fro (side to side, or up and down) while
 * pulling up. Each swing of the wand that turns back (WIGGLE.MIN rad or more) loosens it by its
 * size (up to WIGGLE.MAX) × how brisk it was (a turn every FAST…SLOW s is right; trembling or
 * dawdling counts little) × how hard the hand pulls up against where it started (TENSE rad of
 * the wand's pitch, or the hand raised). Not rocked for IDLE s — it settles back (DECAY a second).
 * Heavier — more effort (effortNeed). Loose enough, it tears out only on a pull (TEAR) and after
 * ROCKS swings at least.
 */
export const WIGGLE = { MIN: 0.05, MAX: 0.35, FAST: 0.15, SLOW: 1.2, IDLE: 0.8, DECAY: 0.1, TENSE: 0.3, SLACK: 0.25, TEAR: 0.5, ROCKS: 4 };
/** The effort (Σ swing × briskness × pull) for a thing of the usual size (REF blocks) of each kind. */
export const EFFORT = { tree: 3.2, house: 4.2, wall: 1.8, earth: 1.6 };
export const EFFORT_REF = { tree: 60, house: 400, wall: 20, earth: 16 };
/** How far it leans with the wand when loose (rad), and how much it rises on a pull (m). */
const TILT = { tree: 0.2, house: 0.035, wall: 0.08, earth: 0.06 };
const LIFT = { tree: 0.35, house: 0.15, wall: 0.2, earth: 0.25 };
const KIND_RU = {
    tree: { icon: '🌳', name: 'дерево', thrown: 'Дерево брошено!' },
    house: { icon: '🏠', name: 'дом', thrown: 'Дом брошен!' },
    wall: { icon: '🧱', name: 'кусок стены', thrown: 'Кусок стены брошен!' },
    earth: { icon: '🪨', name: 'глыба земли', thrown: 'Глыба земли брошена!' },
};

/** How much rocking a thing of this kind and size (blocks) takes: heavier — more. */
export function effortNeed(kind, n) {
    const base = EFFORT[kind] ?? 2;
    const k = Math.sqrt(Math.max(1, n) / (EFFORT_REF[kind] ?? 60));
    return base * Math.min(2.5, Math.max(0.7, k));
}

const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * One frame of the wand working it loose. `W` is its state ({} at first), `s` the hand now:
 * {yaw, pitch (rad, where the wand points), rel (the hand's height against the body, m)}, `t` the
 * time (s). → the swing counted this frame (rad, 0 if none). W.effort grows, W.lean is how far the
 * wand is off the middle of its rocking (side, up), W.tension how hard it pulls (0…1). Pure.
 */
export function wiggleStep(W, s, t, dt) {
    if (!W.base) {
        W.base = { yaw: s.yaw, pitch: s.pitch, rel: s.rel };
        W.effort = 0; W.rocks = 0; W.idle = 0; W.tension = 0;
        W.mid = { x: 0, y: 0 }; W.lean = { x: 0, y: 0 };
        W.ax = { x: { dir: 0, peak: null, last: null, t: null }, y: { dir: 0, peak: null, last: null, t: null } };
    }
    const x = wrapA(s.yaw - W.base.yaw), y = s.pitch - W.base.pitch;
    const up = y + (s.rel - W.base.rel) * 0.8;
    W.tension = Math.max(0, Math.min(1, up / WIGGLE.TENSE));
    let got = 0;
    for (const [k, v] of [['x', x], ['y', y]]) {
        const A = W.ax[k];
        if (!A.dir) {
            if (A.peak == null) { A.peak = A.last = v; continue; }
            if (Math.abs(v - A.peak) > WIGGLE.MIN * 0.5) { A.dir = Math.sign(v - A.peak); A.last = A.peak; A.peak = v; }
            continue;
        }
        if ((A.dir > 0 && v > A.peak) || (A.dir < 0 && v < A.peak)) { A.peak = v; continue; }
        if (Math.abs(v - A.peak) < WIGGLE.MIN * 0.5) continue; // (not turned back yet — or only a tremble)
        // it turned back at the peak: one swing, the size of last → peak
        const amp = Math.abs(A.peak - A.last);
        const gap = A.t != null ? t - A.t : null;
        A.last = A.peak; A.peak = v; A.dir = -A.dir; A.t = t;
        if (amp < WIGGLE.MIN) continue;
        const brisk = gap == null ? 0.6 : gap < WIGGLE.FAST ? gap / WIGGLE.FAST : gap > WIGGLE.SLOW ? Math.max(0, 1 - (gap - WIGGLE.SLOW) / WIGGLE.SLOW) : 1;
        const e = Math.min(amp, WIGGLE.MAX) * brisk * (WIGGLE.SLACK + (1 - WIGGLE.SLACK) * W.tension);
        if (e <= 0) continue;
        W.effort += e;
        W.rocks++;
        got = Math.max(got, amp);
    }
    if (got) W.idle = 0;
    else {
        W.idle += dt;
        if (W.idle > WIGGLE.IDLE) W.effort = Math.max(0, W.effort - WIGGLE.DECAY * dt);
    }
    // the middle of the rocking follows the hand slowly; the lean is the wand off it
    const k = 1 - Math.exp(-dt * 1.5);
    W.mid.x += (x - W.mid.x) * k; W.mid.y += (y - W.mid.y) * k;
    W.lean.x = x - W.mid.x; W.lean.y = y - W.mid.y;
    return got;
}

/** Loose enough and pulled up now: out it comes. */
export function tearReady(W, need) {
    return !!W.base && W.effort >= need && W.rocks >= WIGGLE.ROCKS && W.tension >= WIGGLE.TEAR;
}

/**
 * «На кого и на что» (CLAUDE.md) — what «Вингардиум Левиоса Максима» does to every creature and thing.
 * «Не действует» is a decision too: written here with why. tests/unit/levitation-maxima.test.js checks it.
 */
export const MAXIMA_TARGETS = {
    me: { why: 'свой же — нет: заклинание держит рука колдующего' },
    players: { why: 'игроки в области поднимаются вместе с остальными (на своём компьютере — liftMe), магические доспехи не спасают; «Protection» в сторону колдующего вырывает, как от обычной' },
    zombies: { why: 'поднимаются группой, дрыгают ногами; отпущенные с высоты падают с ног и ушибаются (хост)' },
    castlePeople: { why: 'жители, рыцари, король, волшебники замков — поднимаются группой, машут руками; жители пугаются (castleLife.alarm)' },
    animals: { why: 'поднимаются группой, бьют ногами; падение ранит' },
    sailors: { why: 'с палубы — поднимаются отдельно (летят «за бортом»), отпущенные падают в воду или на палубу; поднятый корабль несёт их в своих координатах' },
    spider: { why: 'гигантская паучиха поднимается группой (дёргает лапами), падение ранит её втрое сильнее (тяжёлая)' },
    livingTrees: { why: 'живое дерево поднимается группой; падение ему не вредит — его ранит только огонь' },
    bookBirds: { why: 'не действует: книги-птицы летают сами, Максима берёт стоящих на земле (книгу ловит обычная «Левиоса»)' },
    phoenix: { why: 'не действует: феникс летит сам (его ловит обычная «Левиоса»)' },
    owl: { why: 'не действует: сова вспархивает раньше — она летит сама; то, что падает, её не накроет (увёртывается)' },
    canary: { why: 'поднимается группой, дрыгает ногами, роняет валун; отпущенный с высоты падает и ушибается; лагерь сердится на колдующего' },
    taron: { why: 'тяжёл (до 500 кг): берёт, но поднимает медленно; роняет топор-молот; отпущенный с высоты падает и ушибается; лагерь сердится на колдующего (Taron.hit)' },
    spencer: { why: 'не действует: птичка Спенсера вспархивает раньше — она летит сама; то, что падает, её не накроет' },
    ghost: { why: 'не действует: призрак бестелесный — «Левиоса» не берёт бестелесное' },
    custom: { why: 'созданное существо до 4 м поднимается группой и бьётся в воздухе; большее — не поднимается; отпущенное с высоты падает и ранится' },
    gargoyle: { why: 'не действует: тяжёлая каменная горгулья рвётся из невидимой руки и улетает; то, что падает, её только ранит (×1,2)' },
    dragon: { why: 'не действует: дракон вырывается из любой Левиосы — он сильнее магии' },
    iceCastle: { why: 'не действует: ледяная магия королевы держит её, монстров и снеговиков на земле' },
    blackship: { why: 'чёрный корабль не поднимается (заколдован, пока его не взяли); капитан и скелеты на палубе — как моряки' },
    servants: { why: 'слуги «Брейнрота» — это жители/зомби/животные: поднимаются как они' },
    ships: { why: 'корабль целиком поднимается из воды с экипажем и всем на палубе; брошенный в море — пробоины по высоте, на суше — обломки; чёрный корабль капитана Чёрные Усы, пока его не взяли, — не поднимается: он заколдован (Ships.isCursed)' },
    houses: { why: 'дом шатается, трещит и отрывается от земли целиком (без корней) — те же блоки, дверь, окна, кровати, сундуки; замахом руки его бросают; упав или ударившись о стену, дом, существо — разлетается на блоки в груду, сундуки выпадают, кто под ним — ранен; поставленный — стоит целый с мебелью на новом месте' },
    trees: { why: 'дерево раскачивается, игрок тянет вверх — вырывается с корнями и комом земли (остаётся яма); брошенное — лежит поваленным, поставленное — растёт стоя' },
    castleWalls: { why: 'кусок стены, башни, забора (то, во что упёрлась палочка, ~3×3 блока): расшатывается палочкой и выламывается, дальше несётся как дом; брошенный — груда камней; поставленный — встаёт куском. Жители пугаются, строители замка потом закладывают дыру (Rebuild). Под сферой защиты чужого дома — нет. Стена самого дома — это дом: он вырывается целиком' },
    looseThings: { why: 'вещи на земле: Максима, направленная на вещь, делает «дирижёра предметов» — слова один раз, дальше палочка указывает на новые вещи (до 32); вещи висят в воздухе и идут за палочкой цепочкой, крутятся вихрем вокруг героя (рука кругами), «Shield» — щит из вещей, «Атак» — залп в цель (ItemSwarm.js, ItemSwarmRules.SWARM_TARGETS). Вещи на палубе едут с кораблём; оружие и книги берёт обычная «Левиоса»' },
    swarm: { why: 'рой вещей: кто/что — в ItemSwarmRules.SWARM_TARGETS (залп ранит и толкает существ, щит принимает чужие заклинания, дары богов не берутся)' },
    water: { why: 'не действует: воду поднимают водяные заклинания' },
    ground: { why: 'глыба земли (дёрн, земля, камень, песок — чашей ~3 м): расшатывается и выдирается палочкой, остаётся яма; что стоит на ней (дом, стена, дерево) — не берёт: тогда вырывается то, что стоит. Коренная порода и лёд не выдираются. Брошенная — рассыпается грудой; в замке строители засыпают яму' },
};

/** Magic armour stops the plain «Левиоса» — never the Maxima: Levitation.levBlocked. */
export { levBlocked };

/** Natural ground (stays when a house is torn off; a tree takes a lump of it on its roots). */
const GROUND = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SNOW, BLOCK.BEDROCK, BLOCK.SAND, BLOCK.GRAVEL, BLOCK.DEEPSTONE, BLOCK.WATER, BLOCK.ICE, BLOCK.ICE_SHAPE]);
/** A village's ground round a house (not the house itself). */
const YARD = new Set([BLOCK.PATH, BLOCK.FARMLAND, BLOCK.WHEAT, BLOCK.VEG, BLOCK.FLOWERS]);
/** How far (m) behind the ground hit a tree beside the line still counts (the hand points a little low). */
export const TREE_SLACK = 3;
const isTreeBlock = (t) => TREE_KINDS.some((k) => k.wood === t || k.leaves === t);

/** The blocks of a house record `h` (Castles.js: c, r): everything built from its floor up, not the ground. */
export function houseCells(data, h, max = 6000) {
    const out = [];
    const Lf = Math.round(h.c.y + 0.5); // (the floor: layer L(−1) — Castles.pt: y = L(0) − 1.5)
    const R = Math.ceil(h.r) + 1;
    const cx = Math.round(h.c.x), cz = Math.round(h.c.z);
    for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++) {
        for (let L = Lf; L <= Lf + 34; L++) { // (a rich home of generation 14 is 26 high to its ridge, its chimneys 3 more)
            const t = data.get(x, L, z);
            if (!t || GROUND.has(t) || YARD.has(t) || isTreeBlock(t)) continue;
            if (isEnchanted(t)) return []; // (the wizards' tower: its walls of enchanted stone — no spell tears it off: EnchantedStone.js)
            out.push([x, L, z, t]);
            if (out.length >= max) return out;
        }
    }
    return out;
}

/** A tree's blocks from one of them (wood and leaves of its kind) + a lump of the earth under its trunk. */
export function treeCells(data, x0, L0, z0, max = 900) {
    const t0 = data.get(x0, L0, z0);
    const k = TREE_KINDS.find((q) => q.wood === t0 || q.leaves === t0);
    if (!k) return null;
    const ok = (t) => t === k.wood || t === k.leaves;
    const seen = new Set([x0 + ',' + L0 + ',' + z0]);
    const cells = [[x0, L0, z0, t0]];
    for (let i = 0; i < cells.length && cells.length < max; i++) {
        const [cx, cL, cz] = cells[i];
        for (const [dx, dL, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
            const x = cx + dx, L = cL + dL, z = cz + dz, key = x + ',' + L + ',' + z;
            if (seen.has(key)) continue;
            seen.add(key);
            if (Math.hypot(x - x0, (L - L0) * 0.6, z - z0) > 8) continue;
            const t = data.get(x, L, z);
            if (!ok(t)) continue;
            cells.push([x, L, z, t]);
        }
    }
    // the trunk's foot: the lowest wood (and a tree has its crown: logs alone are a wall, a woodpile — no tree)
    let minL = Infinity;
    for (const c of cells) if (c[3] === k.wood) minL = Math.min(minL, c[1]);
    if (!Number.isFinite(minL) || !cells.some((c) => c[3] === k.leaves)) return null;
    const foot = cells.filter((c) => c[3] === k.wood && c[1] === minL);
    let fx = 0, fz = 0;
    for (const c of foot) { fx += c[0]; fz += c[2]; }
    fx = Math.round(fx / foot.length); fz = Math.round(fz / foot.length);
    // the lump of earth on the roots: 3×3, two deep (only the earth: grass, dirt, sand, snow)
    const earth = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let d = 1; d <= 2; d++) {
        if (d === 2 && Math.abs(dx) + Math.abs(dz) === 2) continue; // (round below)
        const t = data.get(fx + dx, minL - d, fz + dz);
        if (t === BLOCK.GRASS || t === BLOCK.DIRT || t === BLOCK.SAND || t === BLOCK.SNOW) earth.push([fx + dx, minL - d, fz + dz, t]);
    }
    return { cells: cells.concat(earth), kind: TREE_KINDS.indexOf(k), foot: [fx, minL, fz], earth: earth.length };
}

/** A spawn-area tree (World.trees, an instanced model): blocks of the same look (to carry and to lay down). */
export function instTreeCells(t, groundL) {
    const k = TREE_KINDS[t.kind || 0];
    const x = Math.round(t.x), z = Math.round(t.z);
    const cells = [];
    for (let i = 0; i < 7; i++) cells.push([x, groundL + i, z, k.wood]);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dL = 0; dL <= 3; dL++) {
        if (dx * dx + dz * dz + (dL - 1.5) * (dL - 1.5) > 6.5 || (!dx && !dz && dL < 2)) continue;
        cells.push([x + dx, groundL + 5 + dL, z + dz, k.leaves]);
    }
    return { cells, kind: t.kind || 0, foot: [x, groundL, z], earth: 0 };
}

/** A piece of a wall / of the ground: how big (m round the block pointed at) and at most how many blocks. */
export const FRAG = { WALL_R: 1.6, WALL_MAX: 60, EARTH_R: 1.8, EARTH_DEEP: 3, EARTH_MAX: 60, MIN: 4 };
/** Earth that can be torn out (not bedrock, deep stone, ice, water). */
const EARTH = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SNOW, BLOCK.SAND, BLOCK.GRAVEL, BLOCK.PATH, BLOCK.FARMLAND, BLOCK.WHEAT, BLOCK.VEG, BLOCK.FLOWERS]);
export const isEarth = (t) => EARTH.has(t);
/** Built (a wall, a tower, a fence…): not the ground, the yard, a tree, water or bedrock. */
const isBuilt = (t) => !!t && !GROUND.has(t) && !YARD.has(t) && !TREE_KINDS.some((k) => k.leaves === t) && !isEnchanted(t); // (logs too: a wall of them; never the enchanted stone — EnchantedStone.js)

/**
 * A piece of a wall: the built blocks joined to the one pointed at, within FRAG.WALL_R of it
 * (`skip(x, L, z)` — a block that must stay, e.g. a house's). → [[x, L, z, t]] or null.
 */
export function wallCells(data, x0, L0, z0, skip = null) {
    if (!isBuilt(data.get(x0, L0, z0))) return null;
    const out = [], seen = new Set([x0 + ',' + L0 + ',' + z0]), q = [[x0, L0, z0]];
    while (q.length && out.length < FRAG.WALL_MAX) {
        const [x, L, z] = q.shift();
        const t = data.get(x, L, z);
        if (!isBuilt(t) || skip?.(x, L, z)) continue;
        out.push([x, L, z, t]);
        for (const [dx, dL, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
            const nx = x + dx, nL = L + dL, nz = z + dz, key = nx + ',' + nL + ',' + nz;
            if (seen.has(key) || Math.hypot(nx - x0, nL - L0, nz - z0) > FRAG.WALL_R) continue;
            seen.add(key);
            q.push([nx, nL, nz]);
        }
    }
    return out.length >= FRAG.MIN - 1 ? out : null;
}

/**
 * A lump of the ground: a bowl round the column pointed at (deeper in the middle). A column with
 * anything standing on it (a house, a wall, a tree), water or rock that won't come is left.
 * → {cells, foot: [x, L, z]} or null. Pure.
 */
export function earthCells(data, x0, L0, z0) {
    const cells = [];
    let top0 = -Infinity;
    const R = Math.ceil(FRAG.EARTH_R);
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
        const r = Math.hypot(dx, dz);
        if (r > FRAG.EARTH_R) continue;
        const x = x0 + dx, z = z0 + dz;
        const top = data.topLayer(x, z);
        if (Math.abs(top - L0) > 2 || !EARTH.has(data.get(x, top, z))) continue; // (something stands there, or water)
        const deep = r < 1 ? FRAG.EARTH_DEEP : r < 1.5 ? 2 : 1;
        for (let d = 0; d < deep; d++) {
            const t = data.get(x, top - d, z);
            if (!EARTH.has(t)) break;
            cells.push([x, top - d, z, t]);
        }
        if (!dx && !dz) top0 = top;
    }
    if (cells.length < FRAG.MIN || cells.length > FRAG.EARTH_MAX * 2) return null;
    if (!Number.isFinite(top0)) top0 = Math.max(...cells.map((c) => c[1]));
    return { cells: cells.slice(0, FRAG.EARTH_MAX), foot: [x0, top0, z0] };
}

/** A throw: the hand moves this far (m) within WINDOW s, each step a real move (no camera jump). */
export const THROW = { DIST: 1.1, WINDOW: 0.25, JUMP: 0.6, AFTER: 0.8, MAX: 38 };

/**
 * Was that a swing and a throw? `hist` keeps the hand's last positions; → the hand's speed (m/s,
 * a vector) when it swung far and fast enough (not in the first AFTER s of carrying), else null.
 */
export function throwOf(hist, t, p, carried) {
    const last = hist[hist.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) > THROW.JUMP) hist.length = 0; // (the camera lost the hand)
    hist.push({ t, x: p.x, y: p.y, z: p.z });
    while (hist.length && t - hist[0].t > THROW.WINDOW) hist.shift();
    if (carried < THROW.AFTER || hist.length < 3) return null;
    const o = hist[0], dt = t - o.t;
    const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z;
    if (dt < 0.1 || Math.hypot(dx, dy, dz) < THROW.DIST) return null;
    hist.length = 0;
    return new THREE.Vector3(dx / dt, dy / dt, dz / dt);
}

/** Hurt by what fell on it: by the height and how heavy it is. */
export function crushDamage(kind, h) {
    const base = kind === 'ship' ? 10 : kind === 'house' ? 8 : 5;
    return Math.min(kind === 'ship' ? 45 : 35, Math.round(base + Math.max(0, h) * (kind === 'tree' ? 1.2 : 2)));
}

/**
 * Where a falling house's blocks end up: about half of them break (rubble flies), the rest pile
 * up in their columns (shifted by dx, dz) on what is there. → {set: [[x, L, z, t]], broken: [...]}
 * `top(x, z)` is the highest solid layer of a column. Pure: tests use it.
 * `how` — how it came down: {v: [vx, vy, vz] its speed, h: m it fell, tilt: [sx, sz] its lean (the group's
 * rotation x / z)}. Then it breaks as it fell: the side that struck first is crushed, the upper storeys and the
 * roof topple over that way (the higher, the further), and the harder the fall, the more of it is broken —
 * thrown to the east it lies spread out to the east, never the same heap twice.
 */
export function rubbleOf(cells, dx, dz, top, rnd = Math.random, keep = 0.5, how = null) {
    const heights = new Map();
    const set = [], broken = [];
    const sorted = cells.slice().sort((a, b) => a[1] - b[1]);
    let ux = 0, uz = 0, E = 0, cx = 0, cz = 0, half = 1, minL = 0, span = 1, speed = 0;
    if (how && sorted.length) {
        const v = how.v || [0, 0, 0], tilt = how.tilt || [0, 0];
        speed = Math.hypot(v[0], v[2]);
        // which way it goes over: where it flies; dropped straight down — where it leans; upright — any way
        if (speed > 0.8) { ux = v[0] / speed; uz = v[2] / speed; } else {
            const lx = -tilt[1], lz = tilt[0], l = Math.hypot(lx, lz);
            if (l > 1e-3) { ux = lx / l; uz = lz / l; } else { const a = rnd() * Math.PI * 2; ux = Math.cos(a); uz = Math.sin(a); }
        }
        E = Math.min(1, (Math.max(0, how.h || 0) + Math.abs(v[1] || 0) * 0.4 + speed * 0.5) / 14); // (how hard it struck)
        for (const c of sorted) { cx += c[0]; cz += c[2]; }
        cx /= sorted.length; cz /= sorted.length;
        for (const c of sorted) half = Math.max(half, Math.abs((c[0] - cx) * ux + (c[2] - cz) * uz));
        minL = sorted[0][1]; span = Math.max(1, sorted[sorted.length - 1][1] - minL + 1);
    }
    for (const c of sorted) {
        let x = c[0] + dx, z = c[2] + dz;
        if (how) {
            const up = (c[1] - minL) / span, along = ((c[0] - cx) * ux + (c[2] - cz) * uz) / half; // (0 floor … 1 roof; −1 back … 1 the side that struck)
            const p = Math.min(0.95, Math.max(0.05, (1 - keep) * (0.55 + 0.9 * E) * (0.55 + 0.7 * up) * (1 + 0.55 * along)));
            if (rnd() < p) { broken.push([x, c[1], z, c[3]]); continue; }
            // it topples over that way: the higher it stood, the further it falls (and a little aside)
            const fall = up * span * Math.min(1.1, 0.3 + 0.6 * E + speed / 25) + (rnd() - 0.5) * 1.6 * up;
            const side = (rnd() - 0.5) * 1.4 * up;
            x += Math.round(ux * fall - uz * side);
            z += Math.round(uz * fall + ux * side);
        } else if (rnd() > keep) { broken.push([x, c[1], z, c[3]]); continue; }
        const key = x + ',' + z;
        const L = (heights.has(key) ? heights.get(key) : top(x, z)) + 1;
        heights.set(key, L);
        set.push([x, L, z, c[3]]);
    }
    return { set, broken };
}

/**
 * A tree lying where it fell: the trunk along `dir` (+x, −x, +z or −z) from its foot, its crown
 * beyond; each block on top of what is in its column. Pure: tests use it.
 */
export function felledOf(cells, foot, dir, top, rnd = Math.random) {
    const [fx, fL, fz] = foot;
    const ax = dir === 'x' ? 1 : dir === '-x' ? -1 : 0, az = dir === 'z' ? 1 : dir === '-z' ? -1 : 0;
    const heights = new Map();
    const set = [], broken = [];
    for (const c of cells.slice().sort((a, b) => a[1] - b[1])) {
        const up = c[1] - fL; // (how high it stood: now how far along the ground)
        if (up < 0) { broken.push(c); continue; } // (the lump of earth breaks up)
        const side = ax ? c[2] - fz : c[0] - fx;
        const x = fx + ax * up + (ax ? 0 : side), z = fz + az * up + (az ? 0 : side);
        if (isLeafType(c[3]) && rnd() < 0.3) { broken.push([x, c[1], z, c[3]]); continue; }
        const key = x + ',' + z;
        const L = (heights.has(key) ? heights.get(key) : top(x, z)) + 1;
        if (L > top(x, z) + 3) { broken.push([x, L, z, c[3]]); continue; }
        heights.set(key, L);
        set.push([x, L, z, c[3]]);
    }
    return { set, broken };
}
const isLeafType = (t) => TREE_KINDS.some((k) => k.leaves === t);

/** The six faces of a block: [normal, its four corners from the block's low corner (counter-clockwise seen from outside)]. */
const FACES = [
    [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
    [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
    [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
    [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
    [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
    [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
];

/**
 * The blocks' outer faces as one geometry, in the carried thing's own frame (its foot's middle at
 * (ax, baseL, az) = 0): the same colours (data.faceColor) and patterns (voxPat) the world draws
 * them with, so it looks exactly like the house / tree it was.
 */
export function voxelGeometry(cells, ax, baseL, az, data = null) {
    const has = new Set(cells.map((c) => c[0] + ',' + c[1] + ',' + c[2]));
    const pos = [], nor = [], col = [], pat = [], sky = [], idx = [];
    const c3 = new THREE.Color();
    for (const [x, L, z, t] of cells) {
        const ox = x - ax - 0.5, oy = L - baseL, oz = z - az - 0.5;
        for (const [n, corners] of FACES) {
            if (has.has((x + n[0]) + ',' + (L + n[1]) + ',' + (z + n[2]))) continue;
            const hex = data?.faceColor ? data.faceColor(t, x, L, z, n[1] === 1) : (BASE_COLORS[t] ?? 0x888888);
            c3.setHex(hex);
            // (the daylight the face had where it stood — a rock torn from a cave's wall is as dark as it was)
            const lit = data?.skyAt ? data.skyAt(x + n[0], L + n[1] - 1.5, z + n[2]) : 1;
            const b = pos.length / 3;
            for (const k of corners) {
                pos.push(ox + k[0], oy + k[1], oz + k[2]);
                nor.push(n[0], n[1], n[2]);
                col.push(c3.r, c3.g, c3.b);
                pat.push(patternOf(t, !!data?.lush));
                sky.push(lit);
            }
            idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('voxPat', new THREE.Float32BufferAttribute(pat, 1));
    geo.setAttribute('voxSky', new THREE.Float32BufferAttribute(sky, 1));
    geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return geo;
}

/**
 * The world's block material (VoxelShading) for a moving piece of it: its patterns are worked out
 * from where each block WAS (`origin` + its own frame), so they stay on the blocks as it flies,
 * instead of sliding over them.
 */
export function voxelMaterial(origin) {
    const mat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111 }));
    const base = mat.onBeforeCompile;
    const o = { value: new THREE.Vector3().copy(origin) };
    mat.onBeforeCompile = (shader, r) => {
        base(shader, r);
        shader.uniforms.uVoxOrigin = o;
        shader.vertexShader = shader.vertexShader
            .replace('varying vec3 vVoxPos;', 'varying vec3 vVoxPos;\nuniform vec3 uVoxOrigin;')
            .replace('vVoxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;', 'vVoxPos = transformed + uVoxOrigin;')
            .replace('vVoxNormal = normalize(mat3(modelMatrix) * normal);', 'vVoxNormal = normal;');
    };
    mat.customProgramCacheKey = () => 'levmax-voxel';
    return mat;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _hd = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

const ROOT = new THREE.CylinderGeometry(0.06, 0.22, 1, 5).translate(0, -0.5, 0);

export class LevitationMaxima {
    constructor(game) {
        this.game = game;
        this.mine = null; // (my computer) my spell: {id, side, players: [], t}
        this.lifts = new Map(); // id -> lift (host: everything; others: what they draw — houses, trees)
        this.swarm = new ItemSwarm(game); // «дирижёр предметов»: things lying about (ItemSwarm.js)
        this._seq = 0;
        this._last = 0;
        this._netT = 0;
        this.rootMat = new THREE.MeshLambertMaterial({ color: 0x5b3a1e });
    }

    get auth() { return this.game.authority || !this.game.sync; }
    get active() { return !!this.mine; }
    get creative() { const m = this.game.config?.mode; return m === 'creative' || m === 'test'; }

    // ================================================================ cast (my computer)
    /** «Вингардиум Левиоса Максима» said. */
    cast(isFinal = true) {
        const g = this.game;
        const now = Date.now();
        const early = g._interimCast;
        if (isFinal && early && early.name === LEV_MAX.NAME && now - early.at < 3000) { g._interimCast = null; return null; }
        if (now - this._last < 1500) return null;
        const say = (t) => { if (isFinal) g.hud?.setVoice?.(t, true); return null; };
        // said again: set it down gently
        if (this.mine) {
            if (this.mine.t < LEV_MAX.SAME_PHRASE) return null;
            this._last = now;
            this.release(true);
            return 'Stop';
        }
        // (the first words were heard as the plain «Левиоса» a moment ago: that was this — undo it)
        if (early && early.name === 'Levitation' && now - early.at < 3000 && g.levitation?.active) g.levitation.release(true);
        const h = g.builder?._hand?.();
        if (!h) return say('✋ Поднимите руку (или палочку) и направьте её на то, что хотите поднять');
        // the divine sword (DivineSword.js) is a gift of the gods that magic CAN lift: the hand at it — Leviosa Maxima holds it as Leviosa does, «Атак» sends it
        const lw = g.levitation && !g.levitation.state ? g.levitation._pick?.() : null;
        if (lw?.kind === 'weapon' && isDivine(lw.obj)) {
            const tired = g.combat?.check?.(LEV_MAX.NAME);
            if (tired) return say(tired);
            const no = g.levitation.cast();
            if (no) return say(no);
            g.combat?.pay?.(LEV_MAX.NAME);
            this._last = now;
            g.hud?.setVoice?.('🪶 <b>Левиоса Максима!</b> Клинок парит у вашей руки. «Атак» — он полетит вперёд; «стоп» — опустится', true);
            return LEV_MAX.NAME;
        }
        const aim = this.pick(h.o, h.d);
        if (!aim) return say('🪶 Направьте руку на людей, животных, дерево, дом, стену, землю или корабль — не дальше 60 м — и скажите «Вингардиум Левиоса Максима»');
        if (aim.no) return say(aim.no);
        const tired = g.combat?.check?.(LEV_MAX.NAME);
        if (tired) return say(tired);
        // a thing lying about: the first one obeys; the wand points at the others (ItemSwarm.js)
        if (aim.desc.k === 'swarm') {
            if (!this.swarm.start(h.side, aim.desc.u, g.localId)) return say('🪶 Эту вещь сейчас не поднять');
            g.combat?.pay?.(LEV_MAX.NAME);
            this._last = now;
            g._interimCast = isFinal ? null : { name: LEV_MAX.NAME, at: now };
            this.mine = { id: (g.localId || 'h') + ':m' + (++this._seq), side: h.side, players: [], t: 0, kind: 'swarm', emptyT: 0 };
            g.hud?.setVoice?.(`🪶 <b>Левиоса Максима!</b> Вещь послушна. Не говорите заклинание снова — просто указывайте палочкой на другие вещи (до ${SWARM.MAX_ITEMS}), и они пойдут за палочкой. Рукой кругами — вихрь, «Shield» — щит, «Атак» — залп; «стоп» — вещи упадут`, true);
            return LEV_MAX.NAME;
        }
        g.combat?.pay?.(LEV_MAX.NAME);
        this._last = now;
        g._interimCast = isFinal ? null : { name: LEV_MAX.NAME, at: now };
        const id = (g.localId || 'h') + ':m' + (++this._seq);
        this.mine = { id, side: h.side, players: aim.players || [], t: 0, kind: aim.desc.k };
        // the players in the group: their own computers lift them
        for (const pid of this.mine.players) this._liftPlayer(pid, h.side, true);
        if (this.auth) this.begin(id, g.localId, h.side, aim.desc);
        else g.sync?.levMax?.({ a: 'on', id, side: h.side, d: aim.desc });
        for (let i = 0; i < 30; i++) {
            const p = _v1.copy(h.o).lerp(aim.at, Math.random());
            g.fx?.spark(p, i % 2 ? 0xffe9a8 : 0xc9a8ff, 0.14, _v2.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.9);
        }
        g.sound?.playBombardoCast?.();
        const k = aim.desc.k;
        g.hud?.setVoice?.(k === 'tree' ? '🌳 <b>Левиоса Максима!</b> Дерево держится корнями — раскачивайте его палочкой туда-сюда, как зуб, и тяните вверх'
            : k === 'house' ? '🏠 <b>Левиоса Максима!</b> Дом трещит — раскачивайте палочку туда-сюда и тяните вверх, пока он не оторвётся от земли'
            : k === 'wall' ? '🧱 <b>Левиоса Максима!</b> Кусок стены держится — раскачивайте его палочкой туда-сюда и тяните на себя вверх'
            : k === 'earth' ? '🪨 <b>Левиоса Максима!</b> Земля держит глыбу — раскачивайте палочкой туда-сюда и тяните вверх'
            : k === 'ship' ? '⛵ <b>Левиоса Максима!</b> Корабль поднимается из воды'
            : `🪶 <b>Левиоса Максима!</b> Поднято: ${aim.n}. Держится, пока есть мана (2 в секунду); «стоп» — отпустить, слова ещё раз — опустить`, true);
        return LEV_MAX.NAME;
    }

    /** «Стоп»: what I hold falls. */
    stop() {
        if (!this.mine) return false;
        this.release(false);
        return true;
    }

    /** I let go (gently: set down). */
    release(gentle) {
        const M = this.mine;
        if (!M) return;
        this.mine = null;
        const g = this.game;
        if (M.kind === 'swarm') { this.swarm.release(gentle); return; }
        for (const pid of M.players) this._liftPlayer(pid, M.side, false, gentle);
        if (this.auth) this.end(M.id, gentle);
        else g.sync?.levMax?.({ a: 'off', id: M.id, g: gentle ? 1 : 0 });
    }

    _liftPlayer(pid, side, on, gentle = false) {
        const g = this.game;
        if (pid === g.localId) return;
        if (on) g.sync?.levMax?.({ a: 'p', to: pid, side });
        else g.sync?.lev?.('p', pid, side, 0, false, gentle);
    }

    // ================================================================ aim
    /** Living bodies spells can lift: {ck, c, pos, r} (the host's list; on a guest the same creatures as drawn). */
    _bodies() {
        const g = this.game;
        const out = [];
        const centre = (ck, c) => { const p = new THREE.Vector3(); this.centre(ck, c, p); return p; };
        for (const z of g.zombies || []) if (!z.isDead && !z.isDying && !z.lev) out.push({ ck: 'z', c: z, pos: centre('z', z), r: 0.9 });
        for (const a of g.animals?.targets?.() || []) if (!a.dead && !a.rider && !a.lev && g.animals.riding !== a) out.push({ ck: 'a', c: a, pos: centre('a', a), r: g.duel?._animalBody?.(a)?.r || 1 });
        for (const v of g.castleLife?.targets?.() || []) if (!v.dead && !v.lev && !v.seated && !v.climb) out.push({ ck: 'v', c: v, pos: centre('v', v), r: 1.2 });
        for (const v of g.ships?.crew?.byId?.values?.() || []) if (!v.dead && !v.lev) out.push({ ck: 's', c: v, pos: centre('s', v), r: 1.2 });
        for (const t of g.livingTrees?.targets?.() || []) if (!t.lev && !t.isDead) out.push({ ck: 't', c: t, pos: centre('t', t), r: 2.5 });
        for (const s of g.spiders?.targets?.() || []) if (!s.lev) out.push({ ck: 'sp', c: s, pos: spiderCenter(s, new THREE.Vector3()), r: 3 });
        for (const n of g.canaries?.targets?.() || []) if (!n.lev) out.push({ ck: 'N', c: n, pos: centre('N', n), r: 1.3 });
        for (const n of g.tarons?.targets?.() || []) if (!n.lev) out.push({ ck: 'T', c: n, pos: centre('T', n), r: 3.2 }); // (a Taron: heavy and huge — taken slowly)
        for (const n of g.customCreatures?.targets?.() || []) if (!n.lev && n.D.H * n.scale <= 4) out.push({ ck: 'C', c: n, pos: g.customCreatures.centre(n), r: n.r }); // (a creature of one's own up to 4 m) // (the swamp canaries: carried like a living tree)
        for (const [id, r] of g.remotes || []) if (!r.dead) out.push({ ck: 'p', c: { id }, pos: new THREE.Vector3(r.position.x, r.position.y - 0.5, r.position.z), r: 1 });
        return out;
    }

    /**
     * What the hand points at: the nearest of a creature (→ the group round it), a ship, a house,
     * a tree. → {desc, at, players, n} | {no: hint} | null
     */
    pick(o, d) {
        const g = this.game;
        const R = LEV_MAX.RANGE;
        let best = null;
        // a creature
        let cr = null;
        for (const b of this._bodies()) {
            const to = _v1.subVectors(b.pos, o);
            const dist = to.length();
            if (dist > R || dist < 0.5) continue;
            const ang = d.angleTo(to.normalize());
            if (ang > LEV_MAX.CONE + Math.atan2(b.r, dist)) continue;
            const score = Math.max(0, ang - Math.atan2(b.r, dist)) * 10 + dist * 0.01;
            if (!cr || score < cr.score) cr = { ...b, dist, score };
        }
        // a dragon: no
        for (const dr of g.dragons?.targets?.() || []) {
            const p = _v2.copy(dr.model.position); p.y += 3 * dr.size;
            const dist = p.distanceTo(o);
            if (dist < R && d.angleTo(_v1.subVectors(p, o).normalize()) < Math.atan2(3 * dr.size, dist) + 0.1 && (!cr || dist < cr.dist)) return { no: '🐉 Дракона не поднимет даже «Левиоса Максима» — он вырывается из любой магии' };
        }
        if (cr) best = { kind: 'group', dist: cr.dist, cr };
        // a thing lying about: the conductor of things (a creature pointed at more truly wins; a thing nearer than a house or the ground behind it)
        const th = this.swarm.pickThing(o, d);
        if (th && !th.no && (!best || th.d < best.dist)) best = { kind: 'thing', dist: th.d, uid: th.uid };
        else if (th?.no && !best) return { no: '🪶 ' + th.no[0].toUpperCase() + th.no.slice(1) + ' — эту вещь не поднять' };
        // a ship (along the line, metre by metre)
        if (g.ships?.awake?.size) {
            for (let t = 2; t <= R && (!best || t < best.dist); t += 1) {
                _v1.copy(o).addScaledVector(d, t);
                const s = g.ships.shipAt(_v1.x, _v1.y, _v1.z);
                if (s && isCursed(s)) return { no: '🏴‍☠️ Чёрный корабль заколдован — «Левиоса Максима» его не поднимет' }; // (Ships.isCursed)
                if (s && !s.lifted) { best = { kind: 'ship', dist: t, s, at: _v1.clone() }; break; }
            }
        }
        // a block: a tree or a house
        let cell = g.builder?._hitCell?.(o, d, R);
        // (a hand never points exactly, and «чуть вниз» lands in the soil at the trunk's foot: a tree beside the line wins over the ground — and over
        //  nothing at all; a built wall / a house pointed at truly stays what it is)
        if (!cell || cell.type === BLOCK.AIR || isEarth(cell.type) || GROUND.has(cell.type) || YARD.has(cell.type)) {
            const near = g.livingTrees?._treeNearRay?.(o, d, cell ? Math.min(R, cell.point.distanceTo(o) + TREE_SLACK) : R);
            if (near) cell = { x: near.x, L: near.L, z: near.z, type: near.type, point: new THREE.Vector3(near.x, near.L - 1, near.z) };
        }
        if (cell && (!best || cell.point.distanceTo(o) < best.dist)) {
            const dist = cell.point.distanceTo(o);
            const data = g.world?.terrain?.data || g.terrain?.data;
            // (a house first — a magic house's walls are logs; a tree only with its crown: logs of a wall are a wall, no roots)
            const h = this._houseAt(cell.x, cell.L, cell.z);
            if (h) best = { kind: 'house', dist, h, at: cell.point.clone() };
            else if (isTreeBlock(cell.type) && data && treeCells(data, cell.x, cell.L, cell.z)) best = { kind: 'tree', dist, cell };
            // (the ground: only when nothing living is pointed at — the hand at a creature's feet lifts the creature)
            else if (isEarth(cell.type)) { if (!cr) best = { kind: 'earth', dist, cell }; }
            else if (isBuilt(cell.type)) best = { kind: 'wall', dist, cell };
        }
        const inst = g.builder?._treeOnRay?.(o, d, R);
        if (inst && (!best || Math.hypot(inst.x - o.x, inst.z - o.z) < best.dist + (best.kind === 'earth' ? TREE_SLACK : 0))) best = { kind: 'inst', dist: Math.hypot(inst.x - o.x, inst.z - o.z), inst };
        if (!best) return null;
        if (best.kind === 'thing') {
            const L = g.items?.loose?.get(best.uid);
            return { desc: { k: 'swarm', u: best.uid }, at: L ? L.model.position.clone() : o.clone(), players: [], n: 1 };
        }
        if (best.kind === 'group') {
            const c0 = best.cr.pos;
            const members = [], players = [];
            for (const b of this._bodies()) {
                if (Math.hypot(b.pos.x - c0.x, b.pos.z - c0.z) > LEV_MAX.GROUP_R || Math.abs(b.pos.y - c0.y) > 8) continue;
                if (b.ck === 'p') players.push(b.c.id);
                else if (members.length < LEV_MAX.MAX_GROUP) members.push([b.ck, b.c.id]);
            }
            return { desc: { k: 'group', m: members, np: players.length }, at: c0.clone(), players, n: members.length + players.length };
        }
        if (best.kind === 'ship') return { desc: { k: 'ship', id: best.s.id }, at: best.at, players: this._playersNear(best.at, best.s.cls.L / 2 + 2, true), n: 1 };
        if (best.kind === 'house') {
            const h = best.h;
            // (a house's sphere of protection: only its owner and the ones let in — HouseWards.js)
            if (h.magic && g.wards?.forbids?.(o, _v1.set(h.c.x, h.c.y + 1, h.c.z))) return { no: '🛡️ Здесь сфера защиты чужого дома — не поднять' };
            return { desc: { k: 'house', id: h.id, x: h.c.x, z: h.c.z }, at: best.at, players: this._playersNear(h.c, h.r + 0.5, false), n: 1 };
        }
        if (best.kind === 'wall' || best.kind === 'earth') {
            const c = best.cell;
            // (a house's sphere of protection: only its owner and the ones let in — HouseWards.js)
            if (g.wards?.forbids?.(o, _v1.set(c.x, c.L - 1, c.z))) return { no: '🛡️ Здесь сфера защиты чужого дома — не выломать' };
            return { desc: { k: best.kind, c: [c.x, c.L, c.z] }, at: c.point.clone(), players: [], n: 1 };
        }
        if (best.kind === 'inst') return { desc: { k: 'tree', i: best.inst.index }, at: new THREE.Vector3(best.inst.x, o.y, best.inst.z), players: [], n: 1 };
        return { desc: { k: 'tree', c: [best.cell.x, best.cell.L, best.cell.z] }, at: best.cell.point.clone(), players: [], n: 1 };
    }

    /** Other players standing in that place (on that ship's deck they ride it: not lifted apart). */
    _playersNear(p, r, onShip) {
        if (onShip) return [];
        const out = [];
        for (const [id, rp] of this.game.remotes || []) if (!rp.dead && Math.hypot(rp.position.x - p.x, rp.position.z - p.z) < r) out.push(id);
        return out;
    }

    /** The village / castle house whose walls hold a block (x, L, z). */
    _houseAt(x, L, z, id = null) {
        // a house made by magic («Create a House»: HouseMagic.js) — of its own blocks
        const hm = this.game.houseMagic;
        if (hm) {
            const rec = id != null ? (String(id).startsWith('m:') ? hm.list.get(String(id).slice(2)) : null) : hm.houseOfBlock(x, L, z);
            if (rec) return this._magicHouse(rec);
            if (id != null && String(id).startsWith('m:')) return null;
        }
        const data = this.game.world?.terrain?.data || this.game.terrain?.data;
        const idx = data?.sites || data?.castles;
        if (!idx?.near) return null;
        for (const def of idx.near(x, z, 40)) for (const h of def.houses || []) {
            if (id != null ? h.id !== id : (h.lifted || Math.abs(x - h.c.x) > h.r + 1.5 || Math.abs(z - h.c.z) > h.r + 1.5 || L < Math.round(h.c.y + 0.5))) continue;
            return h;
        }
        return null;
    }

    /** A magic house as a house to lift: {id: 'm:…', magic: its record, c, r, lifted}. */
    _magicHouse(rec) {
        const hm = this.game.houseMagic, rc = hm._rectOf(rec);
        return { id: 'm:' + rec.id, magic: rec, c: { x: (rc.x0 + rc.x1) / 2, y: rec.G - 1.5, z: (rc.z0 + rc.z1) / 2 }, r: Math.max(rc.x1 - rc.x0, rc.z1 - rc.z0) / 2 + 1, lifted: hm.lifting.has(rec.id) };
    }

    // ================================================================ bodies (every kind)
    /** A body's middle (where the magic holds it) into `out`; returns how high that is above its feet. */
    centre(ck, c, out) {
        if (ck === 's') { const o = c.overboard; out.set(o ? o.x : c.x, (o ? o.y : c.y) + 2.4, o ? o.z : c.z); return 2.4; }
        if (ck === 't') { out.copy(c.model.position); out.y += 4; return 4; }
        if (ck === 'N') { out.copy(c.model.position); out.y += 1.2; return 1.2; }
        if (ck === 'sp') { spiderCenter(c, out); return out.y - c.model.position.y; }
        if (this.game.levitation) return this.game.levitation._centre(ck, c, out);
        out.set(c.x || 0, (c.y || 0) + 1, c.z || 0);
        return 1;
    }

    _move(ck, c, d) {
        if (ck === 's') { const o = c.overboard; o.x += d.x; o.y += d.y; o.z += d.z; }
        else if (ck === 't' || ck === 'sp' || ck === 'N') c.model.position.add(d);
    }

    _creature(ck, id) {
        const g = this.game;
        if (ck === 's') { const v = g.ships?.crew?.byId?.get(id); return v && !v.dead ? v : null; }
        if (ck === 't') { const t = g.livingTrees?.byId?.get(id); return t && !t.isDead ? t : null; }
        if (ck === 'N') { const n = g.canaries?.byId?.(id); return n && !n.dead ? n : null; }
        if (ck === 'T') { const n = g.tarons?.byId?.(id); return n && !n.dead ? n : null; }
        if (ck === 'C') return g.customCreatures?.byId?.(id) || null;
        if (ck === 'sp') { const s = g.spiders?.list?.find((x) => x.id === id); return s && !s.dead ? s : null; }
        return g.levitation?._creature(ck, id) || null;
    }

    // ================================================================ host
    /** (host) A caster's Maxima begins: lift what it is pointed at (or say no). */
    begin(id, by, side, desc) {
        const g = this.game;
        if (!desc || this.lifts.has(id)) return false;
        const L = { id, by, side, kind: desc.k, desc, members: [], bodies: [], t: 0 };
        if (desc.k === 'group') {
            for (const [ck, cid] of (desc.m || []).slice(0, LEV_MAX.MAX_GROUP)) this._grabBody(L, String(ck), cid);
            if (!L.members.length && !L.bodies.length && !(desc.np > 0)) return this._refuse(id, by);
            this.lifts.set(id, L);
            return true;
        }
        if (desc.k === 'ship') {
            const s = g.ships?.list?.get(desc.id);
            if (!s || s.lifted || !s.awake || isCursed(s)) return this._refuse(id, by);
            this.lifts.set(id, L);
            this._shipStart(L, s);
            return true;
        }
        if (!this._bigStart(L, desc)) return this._refuse(id, by);
        this.lifts.set(id, L);
        g.sync?.levMax?.({ a: 'big', id, by, side, d: desc });
        this._takeBlocks(L);
        return true;
    }

    _refuse(id, by) {
        const g = this.game;
        if (by === g.localId) { this._over(id); g.hud?.setVoice?.('🪶 Это уже поднято или до него не дотянуться', true); }
        else g.sync?.levMax?.({ a: 'no', id, to: by });
        return false;
    }

    /** (host) One body joins the group. */
    _grabBody(L, ck, id) {
        const g = this.game;
        const c = this._creature(ck, id);
        if (!c || c.lev) return;
        const p = new THREE.Vector3();
        const up = this.centre(ck, c, p);
        let hold = LEV_MAX.MIN_HOLD;
        if (g.duel?._handOf(L.by, L.side, _hp, _hd)) hold = Math.min(LEV_MAX.RANGE, Math.max(2, p.distanceTo(_hp)));
        if (ck === 'z' || ck === 'a' || ck === 'v') {
            if (!g.levitation?.grab(ck, c, L.by, L.side, hold)) return;
            c.lev.mx = L.id;
            L.members.push({ ck, c });
            return;
        }
        // the others: carried here (sailors fly «overboard», living trees and the spider stop)
        if (ck === 's') {
            if (!c.overboard) c.overboard = { x: c.x, y: c.y, z: c.z, vy: 0, vx: 0, vz: 0, t: 0, wet: false };
            c.overboard.vy = 0; c.overboard.vx = c.overboard.vz = 0; c.overboard.wet = false;
            c.mode = 'idle'; c.fs = null; c.busy = false;
        }
        c.lev = { by: L.by, side: L.side, hold, target: p.clone(), vel: new THREE.Vector3(), top: p.y - up, mx: L.id };
        if (g.duel?._handOf(L.by, L.side, _hp, _hd)) c.lev.off = aimOffset(_hd, _v1.subVectors(p, _hp));
        L.bodies.push({ ck, c });
    }

    /** (host) A house / a tree is taken: its blocks (and what it rests on) — or false. */
    _bigStart(L, desc) {
        const g = this.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        if (!data) return false;
        if (desc.k === 'house') {
            const h = this._houseAt(desc.x, 0, desc.z, desc.id);
            if (!h || h.lifted) return false;
            // the people inside rise with it
            const members = [];
            for (const b of this._bodies()) if (b.ck !== 'p' && Math.abs(b.pos.x - h.c.x) < h.r && Math.abs(b.pos.z - h.c.z) < h.r && b.pos.y < h.c.y + 14) members.push(b);
            if (!this._makeBig(L, desc)) return false;
            for (const b of members) this._grabBody(L, b.ck, b.c.id);
            return true;
        }
        return this._makeBig(L, desc);
    }

    /** (every computer) The carried house / tree: its blocks as one instanced mesh, its collision boxes. */
    _makeBig(L, desc) {
        const g = this.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        if (!data) return false;
        let cells = null, tree = null;
        if (desc.k === 'house') {
            const h = this._houseAt(desc.x, 0, desc.z, desc.id);
            if (!h || h.lifted) return false;
            cells = h.magic ? g.houseMagic.blocksOf(h.magic) : houseCells(data, h);
            if (cells.length < 8) return false;
            L.house = h;
            h.lifted = true;
        } else if (desc.k === 'tree') {
            if (desc.i != null) {
                const t = g.world?.trees?.find((x) => x.index === desc.i);
                if (!t || !t.alive) return false;
                tree = instTreeCells(t, data.topLayer(Math.round(t.x), Math.round(t.z)) + 1);
                L.inst = t;
                L.instWas = { x: t.x, y: t.y ?? -0.5, z: t.z, fallen: t.fallen || null };
            } else if (Array.isArray(desc.c)) tree = treeCells(data, desc.c[0] | 0, desc.c[1] | 0, desc.c[2] | 0);
            if (!tree) return false;
            cells = tree.cells;
            L.tree = tree;
        } else if ((desc.k === 'wall' || desc.k === 'earth') && Array.isArray(desc.c)) {
            const [x, Lc, z] = desc.c.map((v) => v | 0);
            // (a house's own wall stays with its house — that one is torn out whole)
            cells = desc.k === 'wall' ? wallCells(data, x, Lc, z, (bx, bL, bz) => !!this._houseAt(bx, bL, bz)) : earthCells(data, x, Lc, z)?.cells;
            if (!cells) return false;
        } else return false;
        // the anchor: the middle of its foot (houses: the floor; trees: the trunk's foot)
        let minL = Infinity, maxL = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const c of cells) { minL = Math.min(minL, c[1]); maxL = Math.max(maxL, c[1]); x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); z0 = Math.min(z0, c[2]); z1 = Math.max(z1, c[2]); }
        const ax = tree ? tree.foot[0] : Math.round((x0 + x1) / 2), az = tree ? tree.foot[2] : Math.round((z0 + z1) / 2);
        const baseL = tree ? tree.foot[1] : minL;
        L.cells = cells;
        L.baseL = baseL;
        L.base = new THREE.Vector3(ax, baseL - 1.5, az); // (the world y of the bottom of its foot)
        L.pos = L.base.clone();
        L.vel = new THREE.Vector3();
        L.ext = { x0: x0 - ax - 0.5, x1: x1 - ax + 0.5, z0: z0 - az - 0.5, z1: z1 - az + 0.5, y0: minL - baseL, y1: maxL - baseL + 1 };
        L.phase = 'loosen';
        L.loose = 0;
        L.sway = { x: 0, z: 0 };
        // the mesh: the very same blocks with the world's own look (its faces, colours and the
        // voxel patterns of stone, planks, roof tiles…) — one draw call; it rocks round its foot
        const group = new THREE.Group();
        group.position.copy(L.pos);
        if (L.inst) group.add(...this._instModel(L.inst, L.base)); // (a spawn-area tree: its own model, not blocks)
        else {
            const mat = voxelMaterial(L.base);
            const mesh = new THREE.Mesh(voxelGeometry(cells, ax, baseL, az, data), mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;
            group.add(mesh);
            L.mat = mat;
            // (a piece of a cave keeps its dark while it is there; out in the open the daylight reaches it)
            const sky = mesh.geometry.getAttribute('voxSky');
            if (sky.array.some((v) => v < 1)) { L.sky0 = sky.array.slice(); L.skyMesh = mesh; }
        }
        if (tree) group.add(this._roots(tree, baseL));
        g.scene?.add(group);
        group.updateMatrixWorld(true);
        L.group = group;
        // what is in the house goes with it: its door, glass, beds, chests (then it no longer lives there)
        if (L.house?.magic) { this._takeMagicFurniture(L, group); g.houseMagic.liftUp(L.house.magic); }
        else if (L.house) { L.furn = this._takeFurniture(L, group); g.houses?.liftedAway?.(L.house); }
        L.boxes = [];
        this._boxes(L);
        return true;
    }

    /**
     * The house's door, glass, beds and chests: copies of their models ride in the carried house
     * (the real ones leave the world with it — Houses.liftedAway). → what to put back / drop when it lands.
     */
    _takeFurniture(L, group) {
        const g = this.game;
        const rec = g.houses?.active?.get(L.house.id);
        const furn = { chests: [], beds: [], door: null };
        if (!rec) return furn;
        const carry = (obj) => {
            if (!obj) return;
            obj.updateWorldMatrix(true, true);
            const c = obj.clone(true);
            c.traverse((o) => { o.userData = { ...o.userData, shared: true }; }); // (the real one's shapes: not disposed with the carried house)
            obj.matrixWorld.decompose(c.position, c.quaternion, c.scale);
            group.attach(c);
        };
        const door = rec.doorId && g.doors?.list.get(rec.doorId);
        if (door) { carry(door.model); furn.door = { ...L.house.doorRec }; }
        for (const id of rec.bedIds) {
            const b = g.beds?.list.get(id);
            if (!b) continue;
            carry(b.model);
            furn.beds.push({ x: b.model.position.x, y: b.model.position.y, z: b.model.position.z, ry: b.model.rotation.y, color: b.color });
        }
        for (const c of rec.chests) {
            carry(c.mesh);
            furn.chests.push({ id: c.id, x: c.mesh.position.x, y: c.mesh.position.y, z: c.mesh.position.z, ry: c.mesh.rotation.y, scale: c.scale, open: !!c.isOpen });
        }
        // the glass of its windows (not the broken ones)
        const panes = (g.houses.panes || []).filter((p) => p.house === rec);
        if (panes.length && g.houses.glassMat) {
            const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.08), g.houses.glassMat, panes.length);
            panes.forEach((p, k) => {
                _q.setFromAxisAngle(_v2.set(0, 1, 0), p.ry);
                _m.compose(_v1.set(p.x - L.base.x, p.y - L.base.y, p.z - L.base.z), _q, _s.set(p.w, p.h, 1));
                glass.setMatrixAt(k, _m);
            });
            glass.renderOrder = 2;
            glass.frustumCulled = false;
            group.add(glass);
        }
        return furn;
    }

    /** A magic house's door, beds, chests and glass ride in it (copies; HouseMagic.liftUp takes the real ones away). */
    _takeMagicFurniture(L, group) {
        const g = this.game, id = L.house.magic.id;
        const objs = [g.doors?.list.get(id + 'd')?.model, ...[...(g.beds?.list.values() || [])].filter((b) => String(b.id).startsWith(id + 'b')).map((b) => b.model), ...g.houseMagic._chestsOf(id).map((c) => c.mesh)];
        for (const obj of objs) {
            if (!obj) continue;
            obj.updateWorldMatrix(true, true);
            const c = obj.clone(true);
            c.traverse((o) => { o.userData = { ...o.userData, shared: true }; });
            obj.matrixWorld.decompose(c.position, c.quaternion, c.scale);
            group.attach(c);
        }
        const panes = (g.houses?.panes || []).filter((p) => p.extra === id);
        if (panes.length && g.houses.glassMat) {
            const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.08), g.houses.glassMat, panes.length);
            panes.forEach((p, k) => {
                _q.setFromAxisAngle(_v2.set(0, 1, 0), p.ry);
                _m.compose(_v1.set(p.x - L.base.x, p.y - L.base.y, p.z - L.base.z), _q, _s.set(p.w, p.h, 1));
                glass.setMatrixAt(k, _m);
            });
            glass.renderOrder = 2;
            glass.frustumCulled = false;
            group.add(glass);
        }
    }

    /**
     * (every computer) It came down: set down whole — its door, beds and chests stand in it again where
     * it now is; broken — the chests fall out on the ground beside the heap (with what was in them),
     * the door and the beds are smashed.
     */
    _putFurniture(L, d, broken) {
        const g = this.game;
        const F = L.furn;
        if (!F || L.furnDone) return;
        L.furnDone = true;
        const [dx, dy, dz] = d;
        const k = L.id + 'f'; // (the same on every computer)
        if (!broken) {
            if (F.door && g.doors) g.doors._place({ id: k + 'd', ...F.door, x: F.door.x + dx, y: F.door.y + dy, z: F.door.z + dz, color: 0x7a4f2a, a: 0 });
            F.beds.forEach((b, i) => g.beds?.spawnBed?.({ x: b.x + dx, y: b.y + dy, z: b.z + dz }, b.ry, b.color, { id: k + 'b' + i, broadcast: false }));
        }
        F.chests.forEach((c, i) => {
            let x = c.x + dx, z = c.z + dz;
            if (broken) { const a = Math.atan2(c.z - L.base.z, c.x - L.base.x) || i; x = L.pos.x + Math.cos(a) * ((L.ext.x1 - L.ext.x0) / 2 + 1.5); z = L.pos.z + Math.sin(a) * ((L.ext.z1 - L.ext.z0) / 2 + 1.5); }
            const y = broken ? (g.collision?.groundY?.(x, z) ?? c.y + dy) : c.y + dy;
            const chest = new Chest(g.scene, new THREE.Vector3(x, y, z), 'loot', c.ry, k + 'c' + i, { scale: c.scale });
            chest.mesh.rotation.y = c.ry + (broken ? (i % 2 ? 0.5 : -0.4) : 0);
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision?.addBox(chest.getCollisionBox());
            if (c.open) chest.setOpenInstant?.();
            g.chests?.push(chest);
        });
    }

    /**
     * A spawn-area tree (World.trees) as it stands: its trunk and crown — the world's own shapes, materials
     * and tint — in the carried group's frame (its foot at `base`).
     */
    _instModel(t, base) {
        const w = this.game.world;
        const back = new THREE.Matrix4().makeTranslation(-base.x, -base.y, -base.z);
        return w.treeParts(t).map((p) => {
            const one = new THREE.InstancedMesh(p.geometry, p.material, 1);
            one.setMatrixAt(0, back.clone().multiply(p.matrix));
            if (p.color) one.setColorAt(0, p.color);
            if (p.depth) one.customDepthMaterial = p.depth;
            one.castShadow = true;
            one.receiveShadow = true;
            one.frustumCulled = false;
            one.userData.shared = true; // (the world's geometry: never disposed with it)
            return one;
        });
    }

    /** For Game.prewarm: the carried blocks' material (a lifted house / rock, a living tree of its own blocks). */
    sampleModels() {
        // (the lump / house / tree as one mesh, and the blocks of a shattered one flying — instanced: another shader)
        const one = new THREE.InstancedMesh(voxelGeometry([[0, 0, 0, BLOCK.STONE]], 0, 0, 0).translate(0, -0.5, 0), voxelMaterial(new THREE.Vector3(0, -1, 0)), 1);
        one.setMatrixAt(0, new THREE.Matrix4());
        return [new THREE.Mesh(voxelGeometry([[0, 0, 0, BLOCK.STONE]], 0, 0, 0), voxelMaterial(new THREE.Vector3())), one, ...this.swarm.sampleModels()];
    }

    /** Roots under a torn-out tree's lump of earth (hidden in the ground until it comes out). */
    _roots(tree, baseL) {
        const n = 9;
        const roots = new THREE.InstancedMesh(ROOT, this.rootMat, n);
        roots.castShadow = true;
        roots.frustumCulled = false;
        const depth = tree.earth ? -1.6 : -0.2;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + (i % 2) * 0.3;
            const len = 1.4 + ((i * 37) % 10) / 6;
            _e.set(Math.cos(a) * 0.9, 0, Math.sin(a) * -0.9);
            _q.setFromEuler(_e);
            _m.compose(_v1.set(Math.cos(a) * 0.6, depth + 0.4, Math.sin(a) * 0.6), _q, _s.set(1, len, 1));
            roots.setMatrixAt(i, _m);
        }
        roots.instanceMatrix.needsUpdate = true;
        return roots;
    }

    /** Its collision boxes where it is now (a house: floor, four walls, the roof; a tree: trunk and crown). */
    _boxes(L) {
        const col = this.game.collision;
        if (!col) return;
        for (const id of L.boxes) col.removeBox(id);
        L.boxes.length = 0;
        if (L.gone) return;
        const p = L.pos, e = L.ext;
        const add = (x0, x1, y0, y1, z0, z1) => L.boxes.push(col.addBox({ minX: p.x + x0, maxX: p.x + x1, minY: p.y + y0, maxY: p.y + y1, minZ: p.z + z0, maxZ: p.z + z1, kind: 'levmax' }));
        if (L.kind === 'house') {
            const h = e.y1;
            add(e.x0, e.x1, 0, 1, e.z0, e.z1); // the floor
            add(e.x0, e.x0 + 1, 0, h, e.z0, e.z1); add(e.x1 - 1, e.x1, 0, h, e.z0, e.z1);
            add(e.x0, e.x1, 0, h, e.z0, e.z0 + 1); add(e.x0, e.x1, 0, h, e.z1 - 1, e.z1);
            add(e.x0, e.x1, h - 1.5, h, e.z0, e.z1); // the roof
        } else if (L.kind !== 'tree') {
            add(e.x0, e.x1, e.y0, e.y1, e.z0, e.z1); // a piece of a wall / a lump of earth: one block of it
        } else {
            const t = L.tree;
            add(-0.6, 0.6, Math.min(0, e.y0), Math.max(4, e.y1 * 0.55), -0.6, 0.6); // the trunk (and its lump of earth)
            add(e.x0, e.x1, e.y1 * 0.45, e.y1, e.z0, e.z1); // the crown
            if (t?.earth) add(-1.5, 1.5, e.y0, 0, -1.5, 1.5);
        }
        L.boxAt = p.clone();
    }

    /** (host) The blocks leave the world (the others build the same mesh from the same data first). */
    _takeBlocks(L) {
        const g = this.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        if (L.inst) { g.world.removeTree(L.inst); g.sync?.treeGone?.(L.inst.index); return; }
        const edits = [];
        for (const c of L.cells) { data.set(c[0], c[1], c[2], BLOCK.AIR); edits.push([c[0], c[1], c[2], BLOCK.AIR]); }
        g.builder?._sendEdits?.(edits, true); // (a piece lifted out of a wall: what it held may come down)
        if (L.house?.magic) g.castleLife?.alarm?.(L.base, 'uproot', L.by, 10); // (a magic house: no castle's builders put it back)
        else if (L.house) g.castleLife?.damaged?.(L.base, L.by, edits.length, true, { r: 10, kind: 'uproot' });
        // (a piece of a castle wall / its ground: the guards come, the builders put it back later — Rebuild)
        else if (L.kind === 'wall' || L.kind === 'earth') g.castleLife?.damaged?.(L.base, L.by, edits.length, true, { r: 4, kind: 'uproot' });
        else g.castleLife?.alarm?.(L.base, 'uproot', L.by, 6);
    }

    // ---------------------------------------------------------------- the ship
    _shipStart(L, s) {
        const g = this.game;
        s.lifted = L;
        L.ship = s;
        s.liftY = s.liftY || 0;
        L.vel = new THREE.Vector3();
        L.phase = 'carry';
        L.top = s.liftY;
        s.lines?.forEach((l) => { if (l.state === 'tied') l.state = 'snapped'; });
        if (s.state === 'moored') s.state = 'free';
        if (s.plank?.state === 'laid') g.ships._plankFalls?.(s);
        s.st.u = s.st.v = s.st.r = 0;
        s.changed = true;
        if (g.duel?._handOf(L.by, L.side, _hp, _hd)) {
            _v1.set(s.st.x, WATER_LEVEL_Y + s.liftY, s.st.z);
            L.off = aimOffset(_hd, _v2.subVectors(_v1, _hp));
            L.hold = Math.min(LEV_MAX.RANGE, Math.max(LEV_MAX.MIN_HOLD, _v2.length()));
        } else L.hold = 20;
        g.castleLife?.alarm?.(_v1.set(s.st.x, WATER_LEVEL_Y, s.st.z), 'uproot', L.by, s.cls.L / 2);
        if (s.owner !== L.by) g.ships?.crew?.provoke?.(s, L.by, '⛵ Корабль подняли в воздух!');
        g.sound?.playWaterRise?.();
    }

    /** The lowest point of a ship's hull below its waterline (local y, < 0). */
    _keel(s) {
        const La = s.layout;
        return Math.min(keelY(La, 0), keelY(La, La.L * 0.3), keelY(La, -La.L * 0.3));
    }

    /** The highest LAND under a ship's hull (world y; the sea and the seabed under it count as WATER_LEVEL_Y: it floated there). */
    _groundUnderShip(s, x, z) {
        const data = this.game.terrain?.data || this.game.world?.terrain?.data;
        let y = WATER_LEVEL_Y;
        if (!data) return y;
        const c = Math.cos(s.st.yaw), sn = Math.sin(s.st.yaw);
        for (const lz of [-s.cls.L * 0.42, -s.cls.L * 0.2, 0, s.cls.L * 0.2, s.cls.L * 0.42]) for (const lx of [-s.cls.B * 0.4, 0, s.cls.B * 0.4]) {
            const top = data.surfaceY(x + lx * c + lz * sn, z - lx * sn + lz * c);
            if (top > WATER_LEVEL_Y + 0.5) y = Math.max(y, top);
        }
        return y;
    }

    _carryShip(L, dt) {
        const g = this.game;
        const s = L.ship;
        if (!s || !g.ships?.list.has(s.id)) { this._finish(L); return; }
        const st = s.st;
        const keel = this._keel(s);
        st.u = st.v = st.r = 0;
        if (L.phase === 'carry' || L.phase === 'lower') {
            const hand = this._hand(L, dt);
            if (!hand && L.phase === 'carry') { L.phase = 'fall'; return; }
            const want = L.phase === 'carry' ? _v3.copy(hand.p).addScaledVector(hand.d, L.hold) : _v3.set(st.x, WATER_LEVEL_Y + s.liftY - LEV_MAX.LOWER * 4 * dt, st.z);
            const k = 1 - Math.exp(-dt * LEV_MAX.FOLLOW);
            const nx = st.x + (want.x - st.x) * k, nz = st.z + (want.z - st.z) * k;
            let ny = s.liftY + (want.y - WATER_LEVEL_Y - s.liftY) * k;
            if (L.phase === 'lower') ny = want.y - WATER_LEVEL_Y;
            // the hull rises over what is under it — never through the land
            const ground = this._groundUnderShip(s, nx, nz);
            const minLift = ground > WATER_LEVEL_Y ? ground - WATER_LEVEL_Y - keel + 0.2 : 0;
            L.vel.set((nx - st.x) / dt, (Math.max(ny, minLift) - s.liftY) / dt, (nz - st.z) / dt);
            st.x = nx; st.z = nz;
            s.liftY = Math.max(0, ny, minLift);
            L.top = Math.max(L.top, s.liftY);
            if (L.phase === 'lower' && s.liftY <= Math.max(0, minLift) + 0.01) { this._landShip(L, true); return; }
        } else if (L.phase === 'fall') {
            L.vel.y -= LEV_MAX.G * dt;
            st.x += L.vel.x * dt; st.z += L.vel.z * dt;
            L.vel.x *= Math.exp(-dt * 0.3); L.vel.z *= Math.exp(-dt * 0.3);
            s.liftY += L.vel.y * dt;
            const ground = this._groundUnderShip(s, st.x, st.z);
            const minLift = ground > WATER_LEVEL_Y ? ground - WATER_LEVEL_Y - keel : 0;
            if (s.liftY <= Math.max(0, minLift)) { s.liftY = Math.max(0, minLift); this._landShip(L, false); return; }
        }
        s.changed = true;
        // the sea pours off the keel as it rises
        if (s.liftY > 0.2 && s.liftY < 10 && Math.random() < 0.7) {
            const c = Math.cos(st.yaw), sn = Math.sin(st.yaw), lz = (Math.random() - 0.5) * s.cls.L * 0.8, lx = (Math.random() - 0.5) * s.cls.B * 0.6;
            g.fx?.spark(_v1.set(st.x + lx * c + lz * sn, WATER_LEVEL_Y + s.liftY + keel, st.z - lx * sn + lz * c), Math.random() < 0.5 ? 0xe8f6ff : 0x9fd3ea, 0.18, _v2.set(0, -6, 0), 0.8);
        }
    }

    /** (host) The ship comes down: into the sea (hurt by the height) or on land (a wreck; gently: stranded, whole). */
    _landShip(L, gentle) {
        const g = this.game;
        const s = L.ship;
        const h = L.top - s.liftY;
        const onLand = s.liftY > 0.05;
        const dmg = gentle ? (onLand ? 5 : 0) : crushDamage('ship', h);
        if (!onLand) {
            for (let i = 0; i < 60; i++) g.fx?.spark(_v1.set(s.st.x + (Math.random() - 0.5) * s.cls.B, WATER_LEVEL_Y + 0.3, s.st.z + (Math.random() - 0.5) * s.cls.L * 0.6), i % 3 ? 0xe8f6ff : 0x9fd3ea, 0.22, _v2.set((Math.random() - 0.5) * 8, 3 + Math.random() * (gentle ? 3 : 9), (Math.random() - 0.5) * 8), 1.1);
            g.sound?.playSplash?.();
            if (!gentle && h > 3) {
                g.ships?.damage?.(s, Math.round(h * 4), L.by);
                if (h > 8) g.ships?.hole?.(s, 0, this._keel(s) + 0.8, (Math.random() - 0.5) * s.cls.L * 0.4, Math.min(2, 0.6 + h * 0.06), L.by);
            }
        } else {
            g.ships?.damage?.(s, gentle ? 5 : Math.round(20 + h * 6), L.by);
            if (!gentle) { s.state = 'wreck'; s.st.u = s.st.v = s.st.r = 0; }
            g.sound?.playExplosion?.(_v1.set(s.st.x, WATER_LEVEL_Y + s.liftY, s.st.z), g.character?.group?.position, 0.5);
        }
        // what was under it
        if (!gentle || onLand) {
            const c = Math.cos(s.st.yaw), sn = Math.sin(s.st.yaw);
            const hx = Math.abs(c) * s.cls.B / 2 + Math.abs(sn) * s.cls.L / 2, hz = Math.abs(sn) * s.cls.B / 2 + Math.abs(c) * s.cls.L / 2;
            const y0 = WATER_LEVEL_Y + s.liftY + this._keel(s);
            this.crush({ x0: s.st.x - hx, x1: s.st.x + hx, z0: s.st.z - hz, z1: s.st.z + hz, y0 }, gentle ? 3 : dmg, L.by, 'ship', s);
        }
        this._finish(L);
    }

    // ---------------------------------------------------------------- the hand
    /** The caster's hand now: {p, d} (its line turned by the offset this was taken at), or null. */
    _hand(L, dt) {
        const g = this.game;
        if (L.by !== g.localId && !g.remotes?.has(L.by)) return null;
        if (!g.duel?._handOf(L.by, L.side, _hp, _hd)) return null;
        steadyDir(L.steady || (L.steady = {}), _hd, dt);
        if (L.off) applyAimOffset(_hd, L.off, _hd);
        return { p: _hp, d: _hd };
    }

    /** How high the caster's hand is against their body, and how far up it points. */
    _handRise(L) {
        const g = this.game;
        if (!g.duel?._handOf(L.by, L.side, _hp, _hd)) return null;
        const body = L.by === g.localId ? g.character.group.position : g.remotes?.get(L.by)?.position;
        if (!body) return null;
        return { rel: _hp.y - body.y, pitch: Math.asin(Math.max(-1, Math.min(1, _hd.y))), yaw: Math.atan2(_hd.x, _hd.z), hx: _hp.x, hz: _hp.z };
    }

    // ---------------------------------------------------------------- houses and trees
    _carryBig(L, dt) {
        const g = this.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        if (L.phase === 'loosen') {
            // only the wand works it loose: rocked to and fro and pulled up, like a tooth
            const now = this._handRise(L);
            if (!now) { L.phase = 'settle'; return; }
            const W = L.wig || (L.wig = {});
            const swing = wiggleStep(W, now, L.t, dt);
            const need = L.need || (L.need = effortNeed(L.kind, L.cells.length));
            const p = Math.min(1, W.effort / need);
            L.loose = p;
            // it leans with the wand: sideways across the caster's line, towards them when the wand rises
            let fx = L.base.x - now.hx, fz = L.base.z - now.hz;
            const fl = Math.hypot(fx, fz) || 1;
            fx /= fl; fz /= fl;
            const tilt = (TILT[L.kind] || 0.05) * (0.15 + 0.85 * p);
            const lx = Math.max(-1, Math.min(1, W.lean.x / 0.25)) * tilt, ly = Math.max(-1, Math.min(1, W.lean.y / 0.25)) * tilt;
            const vx = fz * lx - fx * ly, vz = -fx * lx - fz * ly;
            const k = Math.min(1, dt * 12);
            L.sway.x += (vz - L.sway.x) * k;
            L.sway.z += (-vx - L.sway.z) * k;
            L.pos.set(L.base.x, L.base.y + p * W.tension * (LIFT[L.kind] || 0.2), L.base.z);
            if (swing) {
                for (let i = 0, n = 1 + Math.round(p * 4); i < n; i++) this._crumbs(L, p);
                if (Math.random() < 0.7) g.sound?.playCrack?.(L.pos, 0.3 + p * 0.5);
            } else if (Math.random() < 0.04 * p) this._crumbs(L, p);
            if (tearReady(W, need)) this._tearOut(L);
            return;
        }
        if (L.phase === 'carry') {
            const hand = this._hand(L, dt);
            if (!hand) { L.phase = 'fall'; return; }
            const want = _v3.copy(hand.p).addScaledVector(hand.d, L.hold);
            want.y -= (L.ext.y1 * 0.5); // (held by its middle)
            L.pos.lerp(want, 1 - Math.exp(-dt * LEV_MAX.FOLLOW));
            // over what is under it — never through a hill, a wall or a roof
            const floor = this._groundUnder(L, data) - L.ext.y0 + 0.15;
            if (L.pos.y < floor) L.pos.y = floor;
            L.vel.subVectors(L.pos, L.prev || L.pos).divideScalar(Math.max(1e-3, dt));
            L.prev = (L.prev || new THREE.Vector3()).copy(L.pos);
            L.top = Math.max(L.top ?? L.pos.y, L.pos.y);
            // it swings a little as it is carried
            L.sway.x += (-L.vel.z * 0.012 - L.sway.x) * Math.min(1, dt * 2);
            L.sway.z += (L.vel.x * 0.012 - L.sway.z) * Math.min(1, dt * 2);
            if (L.kind === 'tree' && Math.random() < 0.2) this._crumbs(L, 0.3, true);
            // a swing of the arm and a throw: it flies off with the swing (the hand is far nearer than it)
            L.carryT = (L.carryT || 0) + dt;
            const v = throwOf(L.hist || (L.hist = []), L.t, hand.p, L.carryT);
            if (v) {
                const k = Math.max(3, Math.min(10, L.hold / 1.2));
                L.vel.addScaledVector(v, k);
                if (L.vel.length() > THROW.MAX) L.vel.setLength(THROW.MAX);
                L.vel.y = Math.max(L.vel.y, 2);
                L.phase = 'fall';
                L.thrown = true;
                g.sound?.playWhoosh?.();
                if (L.by === g.localId) g.hud?.setVoice?.(`${KIND_RU[L.kind]?.icon || '🏠'} ${KIND_RU[L.kind]?.thrown || 'Брошено!'}`, true);
            }
            return;
        }
        // (let go while still rocking: it settles back into its own place)
        const ground = L.phase === 'settle' ? L.base.y : this._groundUnder(L, data) - L.ext.y0;
        if (L.phase === 'lower' || L.phase === 'settle') {
            L.pos.y = Math.max(ground, L.pos.y - LEV_MAX.LOWER * dt);
            L.sway.x *= Math.exp(-dt * 3); L.sway.z *= Math.exp(-dt * 3);
            if (L.pos.y <= ground + 0.01) this._landBig(L, true);
            return;
        }
        if (L.phase === 'fall') {
            L.vel.y -= LEV_MAX.G * dt;
            L.vel.x *= Math.exp(-dt * 0.2); L.vel.z *= Math.exp(-dt * 0.2);
            L.pos.addScaledVector(L.vel, dt);
            L.sway.x += L.vel.z * 0.002 * dt; L.sway.z -= L.vel.x * 0.002 * dt;
            const g2 = this._groundUnder(L, data) - L.ext.y0;
            if (L.pos.y <= g2) { L.pos.y = g2; this._landBig(L, false); return; }
            // flying into a wall, another house, a tree, a hill — or into somebody: it breaks there
            if (this._strikes(L, data)) this._landBig(L, false);
        }
    }

    /** (host) Does the flying house / tree run into a block or a body now? */
    _strikes(L, data) {
        const e = L.ext, p = L.pos, v = L.vel;
        if (data && Math.hypot(v.x, v.z) > 1) {
            // its leading side, low, middle and high
            const fx = v.x > 0.5 ? [1] : v.x < -0.5 ? [0] : [0.2, 0.8], fz = v.z > 0.5 ? [1] : v.z < -0.5 ? [0] : [0.2, 0.8];
            for (const a of fx) for (const b of fz) for (const hy of [0.15, 0.5, 0.85]) {
                const x = p.x + e.x0 + (e.x1 - e.x0) * a + Math.sign(v.x) * 0.4, z = p.z + e.z0 + (e.z1 - e.z0) * b + Math.sign(v.z) * 0.4;
                if (data.isSolidAt(x, p.y + e.y0 + (e.y1 - e.y0) * hy, z)) return true;
            }
        }
        const g = this.game;
        const inside = (q, up = 1) => q && q.x > p.x + e.x0 && q.x < p.x + e.x1 && q.z > p.z + e.z0 && q.z < p.z + e.z1 && q.y + up > p.y + e.y0 && q.y - up < p.y + e.y1;
        if (inside(g.character?.group?.position, 1.5) && L.by !== g.localId) return true;
        for (const r of g.remotes?.values?.() || []) if (!r.dead && r.id !== L.by && inside(r.position, 1.5)) return true;
        for (const z of g.zombies || []) if (!z.isDead && !z.lev && inside(z.group.position)) return true;
        for (const a of g.animals?.list || []) if (!a.dead && !a.lev && inside(a.group.position)) return true;
        for (const c of g.castleLife?.targets?.() || []) if (!c.dead && !c.lev && inside({ x: c.x, y: c.y + 1.5, z: c.z })) return true;
        return false;
    }

    /** The highest ground (any solid block) under its footprint, world y. */
    _groundUnder(L, data) {
        if (!data) return L.base.y;
        const e = L.ext, p = L.pos;
        let y = -Infinity;
        for (const fx of [0.15, 0.5, 0.85]) for (const fz of [0.15, 0.5, 0.85]) {
            const x = Math.round(p.x + e.x0 + (e.x1 - e.x0) * fx), z = Math.round(p.z + e.z0 + (e.z1 - e.z0) * fz);
            y = Math.max(y, data.topLayer(x, z) - 0.5);
        }
        return y;
    }

    /** Earth and splinters round its foot as it works loose / dirt falling off the roots. */
    _crumbs(L, p, roots = false) {
        const fx = this.game.fx;
        if (!fx) return;
        const r = L.kind === 'tree' ? 1.5 : Math.max(2, (L.ext.x1 - L.ext.x0) / 2);
        const a = Math.random() * Math.PI * 2;
        const at = roots ? _v1.set(L.pos.x + (Math.random() - 0.5) * 2, L.pos.y + L.ext.y0, L.pos.z + (Math.random() - 0.5) * 2) : _v1.set(L.base.x + Math.cos(a) * r, L.base.y + 0.1, L.base.z + Math.sin(a) * r);
        fx.spark(at, Math.random() < 0.6 ? 0x6b4a2a : 0x8a7a5a, 0.14 + p * 0.1, _v2.set((Math.random() - 0.5) * 2, roots ? -2 : 1 + p * 3, (Math.random() - 0.5) * 2), 0.7);
    }

    /** (host) Out it comes. */
    _tearOut(L) {
        const g = this.game;
        L.phase = 'carry';
        L.top = L.pos.y;
        if (g.duel?._handOf(L.by, L.side, _hp, _hd)) {
            _v1.copy(L.pos); _v1.y += L.ext.y1 * 0.5;
            L.off = aimOffset(_hd, _v2.subVectors(_v1, _hp));
            L.hold = Math.min(LEV_MAX.RANGE, Math.max(LEV_MAX.MIN_HOLD, _v2.length()));
        } else L.hold = 15;
        L.steady = null;
        this._tornFx(L);
        g.sync?.levMax?.({ a: 'torn', id: L.id });
    }

    /** (every computer) Torn out: earth bursts, a crack and a rumble. */
    _tornFx(L) {
        const g = this.game;
        const items = [];
        const r = L.kind === 'tree' ? 2 : Math.max(2.5, (L.ext.x1 - L.ext.x0) / 2);
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, d = Math.random() * r;
            const own = L.kind === 'wall' || L.kind === 'earth' ? BASE_COLORS[L.cells[(i * 7) % L.cells.length][3]] : null;
            items.push({ x: L.base.x + Math.cos(a) * d, y: L.base.y + 0.2, z: L.base.z + Math.sin(a) * d, color: own ?? (i % 3 ? 0x6b4a2a : 0x4a7a2a) });
        }
        g.fx?.debrisFrom?.(items, _v1.set(L.base.x, L.base.y - 1, L.base.z), 80);
        g.sound?.playCrack?.(L.base, 1);
        g.sound?.playLandThud?.(L.base, g.character?.group?.position);
        g.fx && (g.fx.shake = Math.max(g.fx.shake || 0, L.kind === 'house' ? 0.5 : 0.3));
    }

    /** (host) A house / a tree comes down: set down whole (gently) or broken where it falls. */
    _landBig(L, gentle) {
        const g = this.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        const h = Math.max(0, (L.top ?? L.pos.y) - L.pos.y) + (L.thrown ? Math.min(12, L.vel.length() * 0.4) : 0);
        // let go while still rocking: back into its own place; set down: whole where it is; else broken
        const mode = L.phase === 'settle' || (gentle && L.top == null) ? 'back' : gentle ? 'whole' : 'broken';
        const d = mode === 'back' ? [0, 0, 0] : [Math.round(L.pos.x - L.base.x), mode === 'whole' ? Math.round(L.pos.y + 1.5) - L.baseL : 0, Math.round(L.pos.z - L.base.z)];
        const edits = [];
        // broken: it crushes what it lands on first (a roof, a fence, a wall — not the ground)
        if (mode === 'broken' && h > 3) {
            const e = L.ext;
            for (let x = Math.round(L.pos.x + e.x0 + 0.5); x <= Math.round(L.pos.x + e.x1 - 0.5); x++) for (let z = Math.round(L.pos.z + e.z0 + 0.5); z <= Math.round(L.pos.z + e.z1 - 0.5); z++) {
                for (let k = 0; k < 2; k++) {
                    const Lt = data.topLayer(x, z), t = data.get(x, Lt, z);
                    if (!t || GROUND.has(t)) break;
                    data.set(x, Lt, z, BLOCK.AIR);
                    edits.push([x, Lt, z, BLOCK.AIR]);
                }
            }
            if (edits.length) g.builder?._sendEdits?.(edits.splice(0), true); // (a roof crushed: what it held may come down)
        }
        const v = L.vel;
        // (a tree falls the way it flew — or, dropped straight down, the way it leans)
        const fx = Math.hypot(v.x, v.z) > 0.8 ? v.x : -L.sway.z, fz = Math.hypot(v.x, v.z) > 0.8 ? v.z : L.sway.x;
        const dir = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 'x' : '-x') : (fz > 0 ? 'z' : fz < 0 ? '-z' : ['x', '-x', 'z', '-z'][Math.floor(Math.random() * 4)]);
        const seed = (Math.random() * 1e9) | 0;
        const e = L.ext;
        const box = { x0: L.pos.x + e.x0, x1: L.pos.x + e.x1, z0: L.pos.z + e.z0, z1: L.pos.z + e.z1, y0: L.pos.y + e.y0 };
        const dmg = mode === 'broken' ? crushDamage(L.kind, h) : 0;
        const r1 = (x) => Math.round(x * 100) / 100;
        const msg = { a: 'land', id: L.id, mode, d, dir, seed, p: [r1(L.pos.x), r1(L.pos.y), r1(L.pos.z)], v: [r1(v.x), r1(v.y), r1(v.z)], s: [r1(L.sway.x), r1(L.sway.z)], h: r1(h), b: [box.x0, box.x1, box.z0, box.z1, box.y0].map(r1), dmg, by: L.by };
        const res = this._comeDown(L, msg);
        // the world gets its blocks: at once (whole), or as the pieces settle (broken: they fly first)
        if (mode === 'broken') this.pending.push({ at: this._clock + res.T, edits: res.set.slice() });
        else { for (const c of res.set) { data.set(c[0], c[1], c[2], c[3]); edits.push(c); } }
        g.sync?.levMax?.(msg); // (before the blocks: the others work out the same from the same world)
        if (edits.length) g.builder?._sendEdits?.(edits);
        if (dmg) this.crush(box, dmg, L.by, L.kind);
        if (mode === 'broken') g.castleLife?.alarm?.(L.pos, 'uproot', L.by, Math.max(4, (e.x1 - e.x0) / 2));
        this._finish(L);
    }

    /**
     * (every computer, the same from the host's message) It comes down: where its blocks end up
     * (whole / a heap / a felled tree), its furniture, and — broken — every block flying apart and
     * falling into the heap (Shards). → {set, broken, T}
     */
    _comeDown(L, m) {
        const g = this.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        const [dx, dL, dz] = m.d;
        const top = (x, z) => data.topLayer(x, z);
        if (Array.isArray(m.p)) L.pos.set(+m.p[0], +m.p[1], +m.p[2]);
        let res;
        if (L.inst && g.world?.placeTree) {
            // a spawn-area tree: the same tree stands again (put back / set down) or lies felled where it fell
            const W = L.instWas, ox = L.pos.x - L.base.x, oz = L.pos.z - L.base.z;
            if (m.mode === 'back') g.world.placeTree(L.inst, W.x, W.y, W.z, W.fallen);
            else if (m.mode === 'whole') g.world.placeTree(L.inst, W.x + ox, L.pos.y, W.z + oz, null);
            else { const x = W.x + ox, z = W.z + oz; g.world.placeTree(L.inst, x, top(Math.round(x), Math.round(z)) - 0.5, z, m.dir); }
            const box = { x0: L.pos.x + L.ext.x0, x1: L.pos.x + L.ext.x1, z0: L.pos.z + L.ext.z0, z1: L.pos.z + L.ext.z1, y0: L.pos.y + L.ext.y0 };
            this._landFx(L, box, [], m.mode === 'broken' ? Math.max(1, m.dmg | 0) : 0);
            return { set: [], broken: [], T: 0 };
        }
        if (m.mode !== 'broken') {
            res = { set: [], broken: [], T: 0 };
            for (const c of L.cells) {
                const x = c[0] + dx, Lc = c[1] + dL, z = c[2] + dz, was = data.get(x, Lc, z);
                if (was && was !== BLOCK.WATER) res.broken.push([x, Lc, z, c[3]]); else res.set.push([x, Lc, z, c[3]]);
            }
            const box = { x0: L.pos.x + L.ext.x0, x1: L.pos.x + L.ext.x1, z0: L.pos.z + L.ext.z0, z1: L.pos.z + L.ext.z1, y0: L.pos.y + L.ext.y0 };
            this._landFx(L, box, res.broken, 0);
        } else {
            const rnd = createRng(m.seed | 0);
            if (L.kind !== 'tree') res = rubbleOf(L.cells, dx, dz, top, rnd, 0.5, { v: m.v, h: +m.h || 0, tilt: m.s || [0, 0] }); // (it breaks as it fell)
            else res = felledOf(L.cells.map((c) => [c[0] + dx, c[1], c[2] + dz, c[3]]), [L.tree.foot[0] + dx, L.tree.foot[1], L.tree.foot[2] + dz], m.dir, top, rnd);
            res.T = this._shatter(L, res, m, rnd);
            const box = { x0: L.pos.x + L.ext.x0, x1: L.pos.x + L.ext.x1, z0: L.pos.z + L.ext.z0, z1: L.pos.z + L.ext.z1, y0: L.pos.y + L.ext.y0 };
            this._landFx(L, box, [], Math.max(1, m.dmg | 0));
        }
        if (L.house?.magic) this.game.houseMagic?.putDown(L.house.magic, [dx, dL || 0, dz], m.mode === 'broken', L.pos); // (the same house where it was set down / gone)
        else if (L.house) this._putFurniture(L, [dx, (dL || 0), dz], m.mode === 'broken');
        return res;
    }

    /**
     * It breaks apart: each block of it flies off from where it was in the air (spinning, in an arc)
     * and drops into its place in the heap; the broken ones fly further and crumble to dust.
     * One instanced mesh, a couple of seconds. → seconds until it has all settled
     */
    _shatter(L, res, m, rnd) {
        const g = this.game;
        const data = g.world?.terrain?.data || g.terrain?.data;
        const n = Math.min(L.cells.length, 6000);
        if (!g.scene || !n) return 0.8;
        // where each block is now (in the air) — in the same order as the heap was worked out
        const [dx, , dz] = m.d;
        const ax = L.base.x, az = L.base.z, oy = L.pos.y - (L.baseL - 1.5);
        const startOf = new Map();
        for (const c of L.cells) startOf.set((c[0] + dx) + ',' + c[1] + ',' + (c[2] + dz), c);
        const from = (c) => [L.pos.x + (c[0] - ax), c[1] - 1 + oy, L.pos.z + (c[2] - az)];
        const items = [];
        const v = Array.isArray(m.v) ? m.v.map(Number) : [0, 0, 0];
        const sorted = L.cells.slice().sort((a, b) => a[1] - b[1]);
        const minL = sorted[0][1], maxL = sorted[sorted.length - 1][1];
        // (the heap's blocks: matched back to the block they came from, by kind, nearest first)
        const pool = new Map();
        for (const c of res.set) { const k = c[3]; if (!pool.has(k)) pool.set(k, []); pool.get(k).push(c); }
        for (const c of sorted) {
            if (items.length >= n) break;
            const S = from(c);
            const list = pool.get(c[3]);
            const E = list?.length ? list.shift() : null;
            const up = (c[1] - minL) / Math.max(1, maxL - minL);
            const it = {
                S, broken: !E, color: data?.faceColor ? data.faceColor(c[3], c[0], c[1], c[2], false) : BASE_COLORS[c[3]] ?? 0x888888, // (its own colour, as the world drew it)
                E: E ? [E[0], E[1] - 1, E[2]] : [S[0] + (rnd() - 0.5) * 9 + v[0] * 0.15, S[1] - 2 - rnd() * 3, S[2] + (rnd() - 0.5) * 9 + v[2] * 0.15],
                delay: up * 0.35 + rnd() * 0.15, T: 0.55 + rnd() * 0.6 + up * 0.3, h: 0.6 + rnd() * 2.2,
                ax: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), spin: (rnd() - 0.5) * 9,
            };
            items.push(it);
        }
        // each block flies with the world's own look (its textures, colours and patterns — the same shader as the lump and the
        // ground), not as a plain coloured cube: one instanced mesh per kind of block (and tint)
        const T = Math.max(...items.map((it) => it.delay + it.T));
        const groups = new Map();
        sorted.slice(0, items.length).forEach((c, i) => {
            let key = c[3] + ':' + (data?.faceColor ? data.faceColor(c[3], c[0], c[1], c[2], true) : 0);
            if (!groups.has(key) && groups.size >= 12) key = c[3] + ':x'; // (a few tints at most: the draw calls stay few)
            if (!groups.has(key)) groups.set(key, { cell: c, idx: [] });
            groups.get(key).idx.push(i);
        });
        const mat = voxelMaterial(_v2.set(0, -1, 0)); // (a block centred on itself: its layer spans y −0.5…0.5, the world's −1.5…−0.5 above)
        const parts = [];
        const geos = [...groups.values()].map(({ cell, idx }) => ({ idx, geo: voxelGeometry([[cell[0], cell[1], cell[2], cell[3]]], cell[0], cell[1], cell[2], data).translate(0, -0.5, 0) }));
        // (a face that was buried in the ground has no daylight where it was: all the blocks are lit as the brightest face of the piece — a cave's piece stays as dark as it was)
        let lit = 0;
        for (const { geo } of geos) for (const v of geo.getAttribute('voxSky').array) lit = Math.max(lit, v);
        for (const { idx, geo } of geos) {
            geo.getAttribute('voxSky').array.fill(lit);
            const mesh = new THREE.InstancedMesh(geo, mat, idx.length);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;
            g.scene.add(mesh);
            parts.push({ mesh, idx });
        }
        this.shards.push({ parts, mat, items, t: 0, T, dust: 0 });
        this._shardStep(this.shards[this.shards.length - 1], 0);
        return T;
    }

    _shardStep(S, dt) {
        S.t += dt;
        const { parts, items, t } = S;
        for (const { mesh, idx } of parts) {
            for (let j = 0; j < idx.length; j++) {
                const it = items[idx[j]];
                const u = Math.max(0, Math.min(1, (t - it.delay) / it.T));
                const e = u * u; // (falling: faster and faster)
                const arc = 4 * it.h * u * (1 - u);
                _v1.set(it.S[0] + (it.E[0] - it.S[0]) * u, it.S[1] + (it.E[1] - it.S[1]) * e + arc, it.S[2] + (it.E[2] - it.S[2]) * u);
                _q.setFromAxisAngle(it.ax, it.spin * u * (1 - u) * 2);
                const k = it.broken ? Math.max(0, 1 - Math.max(0, u - 0.55) / 0.45) : 1;
                _m.compose(_v1, _q, _s.set(k, k, k));
                mesh.setMatrixAt(j, _m);
            }
            mesh.instanceMatrix.needsUpdate = true;
        }
    }

    /** (every computer) Dust, flying rubble and the thud as it lands. */
    _landFx(L, box, broken, dmg) {
        const g = this.game;
        const c = _v1.set((box.x0 + box.x1) / 2, box.y0 + 0.5, (box.z0 + box.z1) / 2);
        const debris = broken.slice(0, 300).map(([x, Lb, z, t]) => ({ x, y: Math.min(Lb - 1, box.y0 + 2), z, color: BASE_COLORS[t] ?? 0x888888 }));
        for (let i = 0; i < 30; i++) debris.push({ x: box.x0 + Math.random() * (box.x1 - box.x0), y: box.y0 + 0.2, z: box.z0 + Math.random() * (box.z1 - box.z0), color: 0x9a8f80, size: 0.6 });
        g.fx?.debrisFrom?.(debris, c, dmg ? 220 : 60);
        if (dmg) { g.sound?.playExplosion?.(c, g.character?.group?.position, Math.min(0.8, 0.25 + dmg * 0.02)); if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.6); }
        else g.sound?.playCrack?.(c, 0.6);
    }

    /**
     * What it fell on is crushed: every creature under the box is hurt (dmg) and knocked down —
     * my own player on every computer, the creatures by the host.
     */
    crush(b, dmg, by, kind, ship = null) {
        const g = this.game;
        const under = (p, h = 4.6) => p.x > b.x0 - 0.4 && p.x < b.x1 + 0.4 && p.z > b.z0 - 0.4 && p.z < b.z1 + 0.4 && p.y > b.y0 - h - 1 && p.y < b.y0 + 1.5;
        const me = g.character?.group?.position;
        // (on the ship's own deck one is not under it)
        if (me && !g.isDeadLocal && !(ship && g.ships?.me?.ship === ship) && under({ x: me.x, y: me.y - 1.95, z: me.z })) {
            if (g.combat?.enabled) g.combat.damage(dmg, by, 'crush'); else g.damageLocalPlayer?.(dmg);
            g.hud?.setVoice?.(`${kind === 'tree' ? '🌳 На вас упало дерево' : kind === 'ship' ? '⛵ На вас упал корабль' : kind === 'wall' ? '🧱 На вас рухнул кусок стены' : kind === 'earth' ? '🪨 На вас упала глыба земли' : '🏚️ На вас рухнул дом'}: −${dmg}`, true);
        }
        if (!this.auth) return;
        const c = new THREE.Vector3((b.x0 + b.x1) / 2, b.y0 - 1, (b.z0 + b.z1) / 2);
        const r = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + 0.4;
        for (const z of [...(g.zombies || [])]) if (!z.isDead && under({ x: z.group.position.x, y: z.group.position.y - 1, z: z.group.position.z })) g.damageZombie?.(z, dmg, false, _v2.set(0, -1, 0), by);
        g.castleLife?.hitAt?.(c, r, dmg, by);
        g.animals?.hitAt?.(c, r, dmg, by);
        if (!ship) g.ships?.crew?.hitAt?.(c, r, dmg, by, 'crush');
        g.spiders?.hitAt?.(c, r, dmg, 'crush', by);
        g.phoenixes?.hitAt?.(c, r, dmg, 'crush', by);
        g.gargoyles?.hitAt?.(c, r, dmg, 'crush', by); // (an infernal gargoyle: stone, a house falling on it hurts — GargoyleRules.TARGETS.cauldron)
        g.owls?.hitAt?.(c, r, dmg, 'crush', by); // (an owl: quicker than a falling house — it darts away)
        g.canaries?.hitAt?.(c, r, dmg, 'crush', by);
        g.tarons?.hitAt?.(c, r, dmg, 'crush', by);
        g.customCreatures?.hitAt?.(c, r, dmg, 'crush', by); // (a creature of one's own under it) // (a canary under it: crushed; the camp turns on the caster)
        g.iceCastle?.hitAt?.(c, r, dmg, 'crush', by); // (a house falling on the queen: it is no spell — it hurts)
        // (a living tree is hurt only by fire; a dragon is never under it — it flies; book-birds fly)
        // knocked down
        for (const ent of [...(g.zombies || []), ...(g.castleLife?.targets?.() || []), ...(g.animals?.targets?.() || [])]) {
            const p = ent.group?.position || ent;
            if (!under({ x: p.x, y: (p.y ?? 0) - 1, z: p.z }) || ent.dead || ent.isDead) continue;
            g.creatureImpact?.apply?.(ent, { v: _v2.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), by, kind: 'fall', always: { down: 2 } });
        }
    }

    /** (host) A caster lets go: the group falls (or is set down), the big thing falls (or comes down gently). */
    end(id, gentle) {
        const g = this.game;
        const L = this.lifts.get(id);
        if (!L) return;
        for (const { ck, c } of L.members) if (c.lev?.mx === id) g.levitation?.letGo(ck, c, gentle);
        L.members.length = 0;
        for (const b of L.bodies) this._letBody(b, gentle);
        L.bodies.length = 0;
        if (L.kind === 'group') { this._finish(L); return; }
        if (L.kind === 'ship') { L.phase = gentle ? 'lower' : 'fall'; return; }
        L.phase = L.phase === 'loosen' ? 'settle' : gentle ? 'lower' : 'fall';
    }

    /** (host) Let go of a sailor / a living tree / the spider. */
    _letBody(b, gentle) {
        const { ck, c } = b;
        const Lv = c.lev;
        if (!Lv) return;
        c.lev = null;
        const v = gentle ? _v1.set(0, 0, 0) : _v1.copy(Lv.vel).multiplyScalar(1.5);
        if (ck === 's' && c.overboard) {
            Object.assign(c.overboard, { vy: gentle ? -1 : v.y, vx: v.x, vz: v.z, top: Lv.top, by: Lv.by, gentle });
            return;
        }
        this.falls.push({ ck, c, vy: gentle ? -1 : v.y, vx: v.x, vz: v.z, top: Lv.top, by: Lv.by, gentle, t: 0 });
    }

    get falls() { return this._falls || (this._falls = []); }

    /** (host) A living tree / the spider falling after it was let go. */
    _fallStep(dt) {
        const g = this.game;
        for (let i = this.falls.length - 1; i >= 0; i--) {
            const f = this.falls[i];
            const p = f.c.model?.position;
            f.t += dt;
            if (!p || f.c.lev || f.c.dead || f.t > 12) { this.falls.splice(i, 1); continue; }
            f.vy -= LEV_MAX.G * dt;
            p.x += f.vx * dt; p.z += f.vz * dt; p.y += f.vy * dt;
            const ground = g.collision?.groundY?.(p.x, p.z) ?? 0;
            if (p.y > ground) continue;
            p.y = ground;
            this.falls.splice(i, 1);
            if (f.ck === 'N' && !f.gentle) {
                const d = fallDamage(f.top - ground);
                if (d) g.canaries?.hit?.(f.c, d, 'fall', f.by);
                else g.canaries?.hit?.(f.c, 0, 'fall', f.by);
            }
            if (f.ck === 'T' && !f.gentle) g.tarons?.hit?.(f.c, fallDamage(f.top - ground), 'fall', f.by); // (a Taron dropped from a height: bruised)
            if (f.ck === 'sp' && !f.gentle) {
                const d = fallDamage(f.top - ground) * 3;
                if (d) g.spiders?.hit?.(f.c, d, 'fall', f.by);
            }
        }
    }

    /** (host) Carry the group's own bodies (sailors, living trees, the spider) after the hand. */
    _carryBodies(L, dt) {
        const g = this.game;
        for (let i = L.bodies.length - 1; i >= 0; i--) {
            const b = L.bodies[i];
            const { ck, c } = b;
            const Lv = c.lev;
            if (!Lv || !this._creature(ck, c.id)) { if (Lv) c.lev = null; L.bodies.splice(i, 1); continue; }
            const up = this.centre(ck, c, _v1);
            if (Lv.off) Lv.off.dp *= Math.exp(-dt * 2.5);
            const want = g.levitation?.holdPoint(Lv.by, Lv.side, Lv.hold, up, _v2, Lv.off, Lv.steady || (Lv.steady = {}), dt);
            if (!want) { this._letBody(b, false); L.bodies.splice(i, 1); continue; }
            Lv.target.lerp(want, 1 - Math.exp(-dt * 3));
            _v3.subVectors(Lv.target, _v1);
            Lv.vel.lerp(_v3.multiplyScalar(4), Math.min(1, dt * 6));
            this._move(ck, c, _v3.copy(Lv.vel).multiplyScalar(dt));
            Lv.top = Math.max(Lv.top, _v1.y - up);
            // struggling in the air
            if (ck === 's') { c.mode = 'idle'; c.speed = 0; }
            if (ck === 't') { c.walkT = (c.walkT || 0) + dt * 6; c.speed = 1; }
            if (ck === 'sp') g.spiders?._animate?.(c, 1, dt);
            if (ck === 'N') { c.mode = 'flinch'; c.speed = 0; c.stT = 0.15; g.canaries?._dropRock?.(c); } // (struggling in the air, the boulder dropped)
            if (ck === 'T') { c.mode = 'flinch'; c.speed = 0; c.stT = 0.15; } // (struggling in the air)
        }
    }

    _finish(L) {
        const g = this.game;
        L.gone = true;
        this.lifts.delete(L.id);
        if (L.ship) { L.ship.lifted = null; L.ship.changed = true; }
        for (const { ck, c } of L.members) if (c.lev?.mx === L.id) g.levitation?.letGo(ck, c, false);
        for (const b of L.bodies) this._letBody(b, false);
        this._dropVisual(L);
        if (this.auth) g.sync?.levMax?.({ a: 'done', id: L.id });
        this._over(L.id);
    }

    /** My spell is over (what it held is down, or gone): the players it held are let go too. */
    _over(id) {
        const M = this.mine;
        if (M?.id !== id) return;
        this.mine = null;
        for (const pid of M.players) this._liftPlayer(pid, M.side, false, false);
    }

    _dropVisual(L) {
        const g = this.game;
        if (L.group) {
            g.scene?.remove(L.group);
            L.group.traverse((o) => { if (o.isInstancedMesh) o.dispose?.(); else if (o.isMesh && !o.userData.shared) o.geometry.dispose(); }); // (its own block mesh; the world's / the furniture's shapes are shared)
            L.mat?.dispose();
            L.group = null;
        }
        if (L.boxes) { const col = g.collision; for (const id of L.boxes) col?.removeBox(id); L.boxes.length = 0; }
    }

    // ================================================================ frame
    get shards() { return this._shards || (this._shards = []); }
    get pending() { return this._pending || (this._pending = []); }

    update(dt) {
        const g = this.game;
        this._clock = (this._clock || 0) + dt;
        // pieces flying apart; the heap's blocks go into the world as they settle (host)
        for (let i = this.shards.length - 1; i >= 0; i--) {
            const S = this.shards[i];
            this._shardStep(S, dt);
            if (S.t > S.T + 0.6) { for (const { mesh } of S.parts) { g.scene?.remove(mesh); mesh.geometry.dispose(); mesh.dispose?.(); } S.mat.dispose(); this.shards.splice(i, 1); }
        }
        for (let i = this.pending.length - 1; i >= 0; i--) {
            const P = this.pending[i];
            if (this._clock < P.at) continue;
            this.pending.splice(i, 1);
            const data = g.world?.terrain?.data || g.terrain?.data;
            if (!data) continue;
            const edits = [];
            for (const c of P.edits) { const was = data.get(c[0], c[1], c[2]); if (!was || was === BLOCK.WATER) { data.set(c[0], c[1], c[2], c[3]); edits.push(c); } }
            if (edits.length) g.builder?._sendEdits?.(edits);
        }
        // my mana: 2 a second while it holds (nothing comes back meanwhile)
        this.swarm.update(dt);
        const M = this.mine;
        if (M && M.kind === 'swarm') {
            // the conductor lost its things (taken by hands…) or the swarm ended on its own: the spell ends
            if (!this.swarm.active) this.mine = null;
            else if (this.swarm.n === 0) { M.emptyT += dt; if (M.emptyT > 8) { g.hud?.setVoice?.('🪶 Вещей не осталось — заклинание отпущено', true); this.release(true); } }
            else M.emptyT = 0;
        }
        if (this.mine && this.mine === M) {
            M.t += dt;
            const c = g.combat;
            const need = (LEV_MAX.DRAIN + (M.kind === 'swarm' ? this.swarm.extraDrain : 0)) * dt; // (2 a second, and a little for each thing after the first — SWARM.PER_ITEM, capped)
            if (c && !this.creative && c.drain(need, dt) === false) {
                g.hud?.setVoice?.('😮‍💨 Мана кончилась — «Левиоса Максима» отпускает', true);
                this.release(false);
            }
        }
        if (this.auth) {
            for (const L of [...this.lifts.values()]) {
                L.t += dt;
                if (L.bodies.length) this._carryBodies(L, dt);
                if (L.members.length) for (let i = L.members.length - 1; i >= 0; i--) if (L.members[i].c.lev?.mx !== L.id) L.members.splice(i, 1);
                // the caster gone: what it held falls
                if (L.by !== g.localId && !g.remotes?.has(L.by) && L.phase !== 'fall' && L.phase !== 'lower' && L.phase !== 'settle') this.end(L.id, false);
                if (L.kind === 'ship') this._carryShip(L, dt);
                else if (L.kind === 'group') { if (!L.members.length && !L.bodies.length && !(L.desc.np > 0) && L.t > 0.5) this._finish(L); }
                else if (!L.gone) this._carryBig(L, dt);
            }
            if (this._falls?.length) this._fallStep(dt);
            this._net(dt);
        } else {
            for (const L of this.lifts.values()) this._follow(L, dt);
        }
        // every computer: the house / tree where it is, and its collision boxes
        for (const L of this.lifts.values()) {
            if (!L.group) continue;
            // my hand pulls it: how far it has come loose
            if (L.by === g.localId && (this.auth ? L.phase === 'loosen' : L.netPull >= 0)) {
                L.hintT = (L.hintT || 0) - dt;
                if (L.hintT <= 0) {
                    L.hintT = 0.6;
                    const p = Math.round(100 * (this.auth ? L.loose || 0 : L.netPull));
                    const K = KIND_RU[L.kind] || KIND_RU.house;
                    g.hud?.setVoice?.(`${K.icon} Раскачивайте палочкой туда-сюда и тяните вверх — ${K.name} поддаётся: ${p}%`, true);
                }
            }
            L.group.position.copy(L.pos);
            L.group.rotation.set(L.sway.x, 0, L.sway.z);
            if (L.sky0 && (L.skyT = (L.skyT || 0) - dt) <= 0) this._daylight(L);
            if (!L.boxAt || L.boxAt.distanceToSquared(L.pos) > 0.01) this._boxes(L);
        }
    }

    /** A piece of a cave carried out: each face as lit as where it stood, or as the air it is in now if lighter. */
    _daylight(L) {
        L.skyT = 0.25;
        const data = this.game.world?.terrain?.data || this.game.terrain?.data;
        const k = data?.skyAt ? data.skyAt(L.pos.x, L.pos.y + L.ext.y1 * 0.5, L.pos.z) : 1;
        if (k === L.skyK) return;
        L.skyK = k;
        const a = L.skyMesh.geometry.getAttribute('voxSky');
        for (let i = 0; i < a.array.length; i++) a.array[i] = Math.max(L.sky0[i], k);
        a.needsUpdate = true;
    }

    _net(dt) {
        const g = this.game;
        if (!g.sync) return;
        this._netT += dt;
        if (this._netT < 0.1) return;
        this._netT = 0;
        const l = [];
        const r2 = (v) => Math.round(v * 100) / 100;
        for (const L of this.lifts.values()) if (L.group) l.push([L.id, r2(L.pos.x), r2(L.pos.y), r2(L.pos.z), r2(L.sway.x * 100) / 100, r2(L.sway.z * 100) / 100, L.phase === 'loosen' ? r2(L.loose || 0) : -1]);
        if (l.length) g.sync.levMaxState?.(l);
    }

    /** (guests) The host's house / tree, smoothly. */
    _follow(L, dt) {
        if (!L.net) return;
        L.pos.lerp(L.net.p, Math.min(1, dt * 8));
        L.sway.x += (L.net.sx - L.sway.x) * Math.min(1, dt * 10);
        L.sway.z += (L.net.sz - L.sway.z) * Math.min(1, dt * 10);
    }

    // ================================================================ network
    onNet(m, isHost) {
        const g = this.game;
        const from = m.from || m.by;
        switch (m.a) {
            case 'on': if (isHost && m.d && typeof m.id === 'string' && m.id.startsWith(String(from) + ':')) this.begin(m.id, from, m.side === 'left' ? 'left' : 'right', m.d); return;
            case 'off': if (isHost) { const L = this.lifts.get(m.id); if (L && L.by === from) this.end(m.id, !!m.g); } return;
            case 'p': if (m.to === g.localId) g.levitation?.liftMe?.(from, m.side === 'left' ? 'left' : 'right', { mx: true }); return;
            case 'no': if (m.to === g.localId && this.mine?.id === m.id) { this._over(m.id); g.hud?.setVoice?.('🪶 Это уже поднято или до него не дотянуться', true); } return;
            case 'big': {
                if (isHost || this.lifts.has(m.id)) return;
                const L = { id: m.id, by: m.by, side: m.side, kind: m.d?.k, desc: m.d, members: [], bodies: [], t: 0 };
                if (this._makeBig(L, m.d || {})) this.lifts.set(m.id, L);
                return;
            }
            case 'torn': if (!isHost) { const L = this.lifts.get(m.id); if (L) { L.phase = 'carry'; this._tornFx(L); } } return;
            case 'land': {
                if (isHost || !Array.isArray(m.b)) return;
                const [x0, x1, z0, z1, y0] = m.b.map(Number);
                const box = { x0, x1, z0, z1, y0 };
                const L = this.lifts.get(m.id);
                if (L && Array.isArray(m.d)) { this._comeDown(L, { ...m, d: m.d.map((v) => v | 0) }); this.lifts.delete(m.id); this._dropVisual(L); }
                if (+m.dmg > 0) this.crush(box, Math.min(45, +m.dmg), m.by, L?.kind || 'house');
                return;
            }
            case 'done': if (!isHost) { const L = this.lifts.get(m.id); if (L) { this.lifts.delete(m.id); this._dropVisual(L); } this._over(m.id); } return;
            default:
        }
    }

    /** (guests) The host's houses and trees in the air (~10×/s). */
    onNetState(list) {
        if (!Array.isArray(list)) return;
        for (const a of list) {
            if (!Array.isArray(a)) continue;
            const L = this.lifts.get(a[0]);
            if (!L) continue;
            L.net = L.net || { p: new THREE.Vector3() };
            L.net.p.set(+a[1] || 0, +a[2] || 0, +a[3] || 0);
            L.net.sx = +a[4] || 0; L.net.sz = +a[5] || 0;
            L.netPull = +a[6];
            if (!L.pos) L.pos = L.net.p.clone();
        }
    }

    /** A player left: what they held falls. */
    onLeave(id) {
        if (!this.auth) return;
        for (const L of [...this.lifts.values()]) if (L.by === id) this.end(L.id, false);
    }

    dispose() {
        this.swarm.dispose();
        for (const L of this.lifts.values()) this._dropVisual(L);
        this.lifts.clear();
    }
}
