/**
 * GroundVortexRules.js — «Ground Vortex» («Граунд Вортекс», a scroll): the rules, pure (no THREE) and node-testable.
 * The spell itself is GroundVortex.js, the picture is src/fx/GroundVortexFx.js.
 *
 * The author: похоже на Water Vortex, но с землёй. Направляешь палочку на землю — поднимаешь блоки (материал земли, что
 * там есть), они кружатся вокруг героя, когда рука делает круги. Чем больше показываешь на землю — тем больше блоков, можно
 * загрести больше и сделать вихрь больше. Атака — в
 * других (игроков, существ). Перестал кружить и просто направляешь палочку — вихрь следует за ней «паровозиком» (хвостом).
 * «Shield» — блоки сжимаются в заслон, чужое заклинание попадает В БЛОКИ, а не в героя.
 *
 * Numbers (main session's decisions; the hero is ~3.5 m, a block is 1 m):
 *   cost       20 mana at once, then 1 mana a second while held (VortexCost.js; the shield costs no more); +8 cells of the mana maximum at the first real lift;
 *              held (Concentration): «стоп» ends it, as do death, a stun, the ice, a fall, no mana, the wand put away.
 *   gather     the wand on the ground (within REACH, not nearer than NEAR): BASE blocks a second even with a still hand, and every
 *              full turn of the hand brings TURN blocks more (a faster hand: more, up to ×1.6). MAX_BLOCKS = 160 in all
 *              (a funnel ~7 m tall above the feet and ~9 m wide at the top), rings of the funnel hold 9, 11, 13, … blocks.
 *   what       any block of the world (the author: земля, камень, дерево и другие): earth, grass, stone, sand, snow, wood, leaves, bricks,
 *              a planet's rock… Never: water, bedrock, thin plants, the enchanted / arcane stone, the Queen's ice, the gods' gifts, a ship's deck,
 *              inside another's house sphere. Loose THINGS (a sword, a coin) are not blocks: not taken (the author).
 *   dig        round the spot the wand shows (DIG_R = 6 m), the top block (a tree: crown first) of the nearest column, down to DIG_DEPTH = 5 layers below
 *              the spot's level, never within NEAR_ME = 2.2 m of the hero's feet (no hole under him).
 *   train      the hand stops going round (calm for TRAIN_CALM s) and points: the vortex leaves the hero and follows the wand as a
 *              snake — a helix of blocks along the wand's trail (TRAIN_STEP s a block, ≤ 3 s of tail); a hand going round again — back round the hero.
 *   attack     «Атака» (or a sharp throw of the wand hand: a salvo of SALVO blocks): the blocks fly at what the wand shows, SPEED m/s,
 *              VOLLEY blocks a second, steered by the wand a little; each block that hits hurts (BLOCK_DMG, a wizard/player 2) and
 *              pushes (a few in a row knock down). One that misses or hits a wall is laid back as a block where it stopped
 *              (the caster's computer; if the cell is not free or not allowed it crumbles); one that hits a creature crumbles.
 *   shield     «Shield» (SHIELD_MIN = 12 blocks): the blocks close into 4 rings of 12 (48 blocks) at SHIELD_R = 2.3 m, a second shell at
 *              3.2 m for the 49th-96th; the rest circle outside. A spell that would hit the hero hits the blocks facing it: each
 *              blow takes blocks away (HIT_BLOCKS, near the blow) and the hero is not touched while the blocks facing it hold (≥ 2
 *              within 25° of the blow). Fewer than SHIELD_MIN left → it opens. The gods' spells break it all (the blocks fly apart).
 *              It does not cover from above (Thunderwave), nor from a blow in melee (a creature standing next to him), nor arrows
 *              of other things — only what Protection stops by the same rules (Combat.shieldFactor / _blocked).
 *   the end    every block falls from where it is (flung out of the ring a little) and, landing, is laid back as a block in the nearest free
 *              cell (the caster's computer; stacking up to 3 high); the ones that find no place crumble. Saving the world / leaving
 *              the game lays all of them at once round the hero (returnAll) — nothing is lost for good except what the blows crumbled.
 */

import { BLOCK, isPlanetBlock } from '../world/Terrain.js';
import { isEnchanted } from '../world/EnchantedStone.js';
import { SWARM, hash2 } from './ObjectSwarm.js';
import { VORTEX_PRICE } from './VortexCost.js';

// (the swarm's maths — funnel, train, shield, volley — lives in ObjectSwarm.js and is re-exported here)
export * from './ObjectSwarm.js';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export const GV = {
    ...SWARM,
    NAME: 'GroundVortex',
    SHIELD_NAME: 'GroundShield',
    COST: VORTEX_PRICE.COST_ONCE,
    DRAIN: VORTEX_PRICE.PER_SECOND, // mana a second while it is held (the author: 20 at once + 1 a second — VortexCost.js)
    FIRST: 8, // cells of the mana maximum at the first real lift (Mana.FIRST_SPELL)
    MAX_BLOCKS: 160,
    REACH: 16, // m: the wand shows ground this far
    NEAR: 1.5, // m: the spot must be this far from the hero
    NEAR_ME: 2.2, // m: no block is taken within this of the hero's feet
    DIG_R: 6,
    DIG_DEPTH: 5,
    BASE: 2.5, // blocks a second while the wand shows ground
    TURN: 10, // blocks one full turn of the hand brings (at a calm speed)
    TURN_FAST: 1.6, // × at a fast hand
    TAKE_PER_FRAME: 6,
    SEND_EDITS: 0.12, // s: the taken blocks go out together
    IDLE_END: 14, // s with no block lifted: the vortex falls apart (nothing to hold)
    MAX_LIFE: 240,
    BLOCK_DMG: 3, // HP a block to a creature (a wizard / villager / animal / zombie)
    PLAYER_DMG: 2,
    PUSH: 6, // m³ of «vortex volume» a block pushes with (WaterVortex.pushOf); a victim hit again within KNOCK_WINDOW gets more
};

/** Never lifted: water, bedrock, thin plants, the magic stone (enchanted / arcane / the Queen's ice). Everything else solid goes: earth, stone, wood, leaves, bricks… */
const NEVER = new Set(['AIR', 'WATER', 'BEDROCK', 'WHEAT', 'FLOWERS', 'VEG', 'ARCANE', 'ARCANE_DARK', 'ARCANE_LAMP', 'ARCANE_LAMP_VIOLET', 'RUNE', 'ICE_WALL', 'ICE_GLOW', 'ICE_FLOOR', 'ICE_DARK'].map((n) => BLOCK[n]).filter((x) => x != null));

/** Can this block be lifted? (the author: земля, камень, дерево и другие блоки — всё, что связано с блоками) */
export function liftable(b) {
    if (b == null || NEVER.has(b)) return false;
    return !isEnchanted(b);
}

/** What a lifted block is drawn (and laid back) as: farmland and path are earth. */
export const lifted = (b) => (b === BLOCK.FARMLAND || b === BLOCK.PATH ? BLOCK.DIRT : b);

/**
 * ON WHOM AND ON WHAT (CLAUDE.md). A vortex of earth: lifts the ground, circles, hits with blocks, shields with blocks.
 * `does` — what it does there; `why` — the reason (« не действует » is written too).
 */
export const GROUND_VORTEX_TARGETS = {
    me: { does: 'shield', why: 'колдующий в центре: вихрь его не задевает; «Shield» ставит блоки между ним и ударом (Combat.shieldFactor/_blocked); сам он может бросить блоки в себя, повернув палочку на себя — ушиб как от чужого' },
    players: { does: 'hit', why: 'блок бьёт игрока: −2 HP, толчок, несколько подряд сбивают с ног; свой «Protection» лицом к блоку держит (hitBySpell); решает компьютер того игрока, который знает свой щит' },
    zombies: { does: 'hit', why: 'блок бьёт зомби: −3 HP и толчок (host: damageZombie + _push); кружащиеся блоки без атаки зомби не задевают' },
    castlePeople: { does: 'hit', why: 'жителей, рыцарей, короля, волшебников, торговцев бьёт летящий блок (−3 HP, толчок; host); рыцари и волшебники не колдуют это (заклинание без свитка NPC); страх и тревога: castleLife.alarm' },
    animals: { does: 'hit', why: 'животных бьёт летящий блок (−3 HP, толчок; host: animals.hit); кружащие блоки их не задевают' },
    sailors: { does: 'hit', why: 'моряки и скелеты (ships.crew): летящий блок −3 HP и толчок, как по жителю; в море земли нет — вихрь копает только на суше' },
    spider: { does: 'hit', why: 'гигантская паучиха: блок −3 HP (толстая шкура: толчка нет)' },
    livingTrees: { does: 'none', why: 'ожившее дерево: блок отскакивает, дерево не ранит — не действует' },
    bookBirds: { does: 'none', why: 'книги-птицы быстрые и летают — блок их не настигает (как и водяной вихрь), не касается' },
    iceCastle: { does: 'hit', why: 'снеговики и ледяные монстры: блок −3 HP и толчок; Ледяная Королева: простые заклинания на неё не действуют, но каменный блок — предмет, ранит как удар (−3 HP), к холоду это отношения не имеет' },
    blackship: { does: 'hit', why: 'капитан Чёрные Усы отбивает летящий блок шпагой (parryBolt не нужен — блок, а не заряд), скелеты рассыпаются как от удара по костям (Sailors.pirateBoneDamage, kind GroundVortex); корпус проклятого корабля блок не повреждает — барьер вспыхивает' },
    dragon: { does: 'none', why: 'дракон слишком большой и прочный — блок отскакивает; но каждый удар по нему — нападение на него: Dragons.hit(...offended) запоминает обиду' },
    phoenix: { does: 'none', why: 'феникс уворачивается — не касается (Phoenixes.js)' },
    owl: { does: 'none', why: 'сова улетает — не касается (Owls.js)' },
    servants: { does: 'hit', why: 'слуги волшебника: блок как по жителю; хозяин не ранит своих' },
    bosses: { does: 'hit', why: 'король, глава башни, паучиха, пират: бьёт как обычное существо (по таблице выше); сундуки у них прежние' },
    blocks: { does: 'lift', why: 'любые блоки мира: земля, трава (с шапкой), камень, песок, снег, гравий, дерево, листва, кирпич…; снятые правкой builder._sendEdits(settle): здание, потерявшее опору, рушится по правилам Structure/Collapse' },
    items: { does: 'none', why: 'вещи на земле вихрь не берёт (решение автора: вихрь только из земли); блок, упавший на вещь, ложится рядом, вещь не давит' },
    water: { does: 'none', why: 'воду не берёт; блоки в воду не кладутся — упавший в воду блок крошится' },
    ground: { does: 'lift', why: 'цель — блоки (земля, стена, дерево), куда показывает палочка (до 16 м, не ближе 1,5 м): в небо, в воду, в дом — подсказка «покажите на землю»' },
    trees: { does: 'lift', why: 'деревья — блоки (ствол, листва): берутся сверху вниз как любые; дерево, потерявшее ствол, — по правилам Structure; ожившее дерево (существо) — не блок, см. livingTrees' },
    houses: { does: 'lift', why: 'блоки домов и замков берутся сверху вниз (по одному, не ближе 2,2 м от героя); что потеряло опору, рушится (Structure/Collapse); жители пугаются (castleLife.alarm uproot); чужая сфера защиты дома и заколдованный камень — нет' },
    ships: { does: 'none', why: 'палуба — не земля; блок, упавший на палубу, крошится; в чужие корабли летящий блок не ломает, а отскакивает' },
    ward: { does: 'none', why: 'в чужой сфере защиты дома блоки не берутся (HouseWards.forbids); влетевший блок не ломает защиту' },
    godGift: { does: 'none', why: 'дары богов (храм, пьедесталы, Ледяной Жезл) не берутся и не ломаются блоками' },
    enchanted: { does: 'none', why: 'заколдованный камень (арены, башни волшебников) не слушается: не берётся и не ломается летящим блоком (ENCHANTED_VS.GroundVortex)' },
    space: { does: 'none', why: 'в открытом космосе под ногами нет земли (spaceSpellBlock); на планетах работает из породы планеты, кроме Солнца' },
    spells: { does: 'shield', why: 'заряды дуэли, лучи, взрывы: «Shield» принимает их на блоки (−HIT_BLOCKS блоков за удар); заклинания богов сметают заслон целиком и идут дальше' },
    concentration: { does: 'held', why: 'удерживаемое: пока вихрь жив, другое заклинание не сработает (Concentration.HELD.GroundVortex: свои слова «Shield», «Атака»); сброс — смерть, оглушение, лёд, падение' },
};

/**
 * Blocks a blow takes off the shield (the nearest to it). kind: the spell's name as Combat knows it.
 * A blast is bigger the stronger its power; the beams (Inferno…) take one a tick.
 */
export const HIT_BLOCKS = {
    Sapira: 2, Sands: 2, Stupefy: 3, IceBall: 3, Ice: 1, Inferno: 1, Wind: 0, WindMaxima: 0, Thunderwave: 4, Electrum: 1, Jolt: 3, JoltMaxima: 7, Disarmor: 2,
    Expelliarmus: 2, Bombardo: 10, BombardoMaxima: 24, Cannon: 6, Frozen: 3, Die: 12, Accentric: 4, Pilbidrio: 5, WaterVortex: 3, GroundVortex: 3, Bounce: 1,
};
export const hitBlocks = (kind) => HIT_BLOCKS[kind] ?? 4;

/** The gods' spells (and the ones that break any wall) sweep the shield away. */
export const sweepsShield = (kind) => /^(AvadaKedavra|Die|TotalDestruction|TotalDestructionMaxima|Inspirius|Boom|Hellfire|PlanetLiquidation|WaterVortexSuperMaxima|LightningStrike|CircleAttackMaxima)$/.test(kind || '');

// ------------------------------------------------------------------ gathering
/** Blocks one full turn of the hand brings at a hand speed (m/s). */
export function turnBlocks(handSpeed) {
    return GV.TURN * (0.6 + 0.4 * clamp(handSpeed / 1.5, 0, 2.5)); // (a calm hand 1×, a fast one up to 1.6×)
}

/**
 * The cells to take round the spot A ({x, z, L: the ground layer there}): `n` of them, the nearest columns first, the top block of
 * each; get(x, L, z) → block; top(x, z) → the highest solid layer; `skip(x, L, z)` → true for a cell not to touch (a gift, a ward,
 * a body's, a ship's); me: the hero's feet {x, z} (nothing taken within NEAR_ME). Taken cells are not offered again (they are AIR now).
 * @returns {Array<[x, L, z, block]>}
 */
export function digCells(get, top, A, me, n, skip = null) {
    const R = GV.DIG_R, out = [];
    const cols = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        const x = A.x + dx, z = A.z + dz;
        if (me && Math.hypot(x - me.x, z - me.z) < GV.NEAR_ME) continue;
        cols.push([d2 + 0.01 * hash2(x, z), x, z]);
    }
    cols.sort((a, b) => a[0] - b[0]);
    for (const [, x, z] of cols) {
        const g = top(x, z);
        if (g < A.L - GV.DIG_DEPTH) continue;
        const b = get(x, g, z);
        if (!liftable(b)) continue;
        // (nothing may stand on it that is not air: a tree, a wall, a roof on this column)
        const above = get(x, g + 1, z);
        if (above !== BLOCK.AIR && above !== undefined) continue;
        if (skip && skip(x, g, z)) continue;
        out.push([x, g, z, b]);
        if (out.length >= n) break;
    }
    return out;
}

// ------------------------------------------------------------------ the end: where a block lands
/**
 * The free cell for a block that fell at (x, z): from the ground layer up to 3 layers: the first AIR cell with a solid one under it.
 * get / top as above. → [x, L, z] | null
 */
export function landingCell(get, top, x, z, skip = null) {
    const bx = Math.round(x), bz = Math.round(z);
    // (the cell it fell in, then the four beside it)
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cx = bx + dx, cz = bz + dz, g = top(cx, cz);
        for (let k = 1; k <= 3; k++) {
            const L = g + k;
            if (get(cx, L, cz) !== BLOCK.AIR) continue;
            const under = get(cx, L - 1, cz);
            if (under === BLOCK.AIR || under === BLOCK.WATER) continue;
            if (skip && skip(cx, L, cz)) continue;
            return [cx, L, cz];
        }
    }
    return null;
}

/** The first n free cells in a spiral round (x, z) for returnAll. */
export function spiralCells(get, top, x, z, n, skip = null) {
    const out = [], used = new Set();
    for (let r = 0; r <= 14 && out.length < n; r++) {
        for (let dx = -r; dx <= r && out.length < n; dx++) for (let dz = -r; dz <= r && out.length < n; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const cx = Math.round(x) + dx, cz = Math.round(z) + dz;
            if (Math.hypot(dx, dz) < 1.4) continue;
            const g = top(cx, cz);
            for (let k = 1; k <= 6 && out.length < n; k++) {
                const L = g + k, key = cx + ',' + L + ',' + cz;
                if (used.has(key)) continue;
                if (get(cx, L, cz) !== BLOCK.AIR || get(cx, L - 1, cz) === BLOCK.AIR || get(cx, L - 1, cz) === BLOCK.WATER) continue;
                if (skip && skip(cx, L, cz)) continue;
                used.add(key);
                out.push([cx, L, cz]);
                break;
            }
        }
    }
    return out;
}

// ------------------------------------------------------------------ can it be cast here
/** Why not: null = may; else a short reason key for the hint. */
export function castBlock({ side, spot, dist, ward, ship }) {
    if (!side) return 'wand';
    if (!spot) return 'ground';
    if (ward) return 'ward';
    if (ship) return 'ship';
    if (dist != null && dist > GV.REACH) return 'far';
    return null;
}

export function hintFor(why) {
    switch (why) {
        case 'wand': return '🪄 «Ground Vortex» работает только с волшебной палочкой в руке';
        case 'ground': return '🌪️ Покажите палочкой на землю — тогда скажите «Ground Vortex»';
        case 'ward': return '🛡️ Здесь чужая защита дома — землю не поднять';
        case 'ship': return '⚓ Палуба — не земля: вихрь здесь не поднять';
        case 'far': return '🌪️ Слишком далеко — покажите поближе';
        case 'holy': return '🧱 Заколдованный камень и дары богов не слушаются — «Ground Vortex» здесь ничего не поднимет';
        case 'nothing': return '🌪️ Здесь нечего поднять — покажите на землю, где она не занята';
        case 'busy': return '🌪️ Вихрь уже кружит — «стоп», чтобы закончить';
        default: return '🌪️ Покажите палочкой на землю';
    }
}
