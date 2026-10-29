/**
 * VisibleGodi.js — «Visible Godi» (only from a scroll): steam from the wand paints a cloud; you see through the steam.
 *
 * The author: «Как только ты произносишь, идёт сначала пар из палочки — такой большой жирный пар, и ты этим паром
 * рисуешь эту тучку. У пара есть ограничение: рано или поздно он заканчивается, нельзя прям много рисовать. Ты как
 * бы видишь через этот пар. И другие игроки тоже могут видеть (пар) — это не только для тебя заклинание.
 * Сквозь стены вид размытый: чем толще стена — тем хуже; дерево, одноблочная стена — очень чётко. Не работает в
 * магических и божественных стенах. Работает, только если ты прямо реально возле стены.»
 *
 * Held (Concentration.HELD): 20 mana at once (Combat.SPELL_COST), then 1 mana a second; «стоп», no mana, death,
 * a stun end it. +5 cells of the mana maximum the first time it REALLY showed something behind a wall.
 *
 * The steam (SteamFx.js draws it, on every computer): while the spell is on, the wand's jet reaches ahead (SEE.JET_MAX m;
 * it sticks to the first solid face it meets, else hangs SEE.JET_FREE m ahead) and a fat puff is left every SEE.PUFF_GAP m
 * the jet moves — so you PAINT with the wand. The steam is finite: SEE.STEAM puffs, then the jet runs dry; the painted
 * puffs thin out after SEE.PUFF_LIFE s. Nobody collides with it; it harms and frightens nobody.
 *
 * How it sees (the rules live here, pure and tested; the picture is SeeThroughFx.js): the eyes' ray goes through the
 * real blocks (0.1 m steps; ships' hulls, doors, others' house spheres too); only when the first solid thing is at most
 * REACH (3 m) away. Where the hero's own steam covers the screen the wall is not drawn:
 *   - the wall the ray passes (one mass: planks against stone count together; a room behind it ends it — the far wall
 *     of the room is seen as a wall, never skipped) is added up: every
 *     material has an extinction per metre μ (SEE_THROUGH), the clearness is exp(−Σ μ·thickness):
 *        1 block of planks ≈ 88%, of stone ≈ 65%, 3 of stone ≈ 27%, 6 of stone ≈ 8% (only shapes), 8+ — nothing;
 *   - the picture behind is drawn from the far side of that cluster (the camera's near plane stands there), so the
 *     wall itself is not in it; the less clear, the more it is blurred, greyer-blue and grainy.
 *   - magic stops the look: the enchanted stone (arenas, wizards' towers), arcane stone, the Ice Queen's ice, the
 *     gods' temple (golden shield), the black ship's cursed hull, another's house sphere — a milky «nothing».
 *
 * Others see the steam (messages 'vgs': a puff / the end); only the caster looks through it.
 */

import { BLOCK } from '../world/Terrain.js';
import { castingHand } from './WandAim.js';

/** Constants (the author's words in the header; the numbers are the main session's decisions). */
export const SEE = {
    REACH: 3, // m: the first solid thing must be this near («прямо реально возле стены»)
    MAX_LEN: 28, // m: how far the look is followed behind the wall
    GAP_MAX: 0.25, // m: air inside one wall that still counts as that wall (a chink, a door in its frame). Never a room: what
    // is seen through the wall must be what is really inside — the author found a villager «inside» who was not there
    // when the look skipped a small room (4 m) and showed what stood behind its far wall
    STEP: 0.1, // m: the ray's step
    DRAIN: 1, // mana a second while it is on (the cost at once: Combat.SPELL_COST.VisibleGodi)
    FIRST: 5, // cells of the mana maximum at the first real look (Mana.FIRST_SPELL.VisibleGodi)
    WORKED: 0.05, // the clearness from which it «really showed» something (and the second picture is drawn at all)
    SHAPES: 0.08, // below this only dim shapes are left, no details
    SCAN_T: 0.1, // s between two rays
    NEAR_PAD: 0.12, // m behind the far side of the wall where the camera's near plane stands
    // the steam (the author: «рано или поздно он заканчивается»)
    STEAM: 36, // puffs the jet can leave in one casting
    PUFF_GAP: 0.7, // m the jet must move for the next puff (a still hand wastes nothing)
    JET_MAX: 8, // m: how far the jet reaches ahead of the wand
    JET_FREE: 3.5, // m: where the steam hangs when the jet meets nothing
    JET_STICK: 0.5, // m: it stops this far before the solid face it meets (on the near side of the wall)
    PUFF_LIFE: 45, // s a painted puff lasts before it thins out
    PUFF_R: 1.35, // m: a puff's radius (the hero is 3.5 m tall: a puff is about a head and a half wide)
    EMIT_T: 0.06, // s between two looks of the jet
    OWNER_MAX: 40, // puffs one hero's steam keeps on every computer
};

// the codes the ray's sampler gives besides block ids
export const SEEN = { SHIP_WOOD: 1001, SHIP_CURSED: 1002, DOOR: 1003, GOD: 1004, WARD: 1005 };

/**
 * Extinction per metre of every material (the clearness of a path is exp(−Σ μ·metres)). Chosen so that
 * 1 block of planks 0.88, of stone 0.65; 3 of stone 0.27; 6 of stone 0.076 (shapes only); 8 of stone 0.03 (nothing).
 */
export const MU = {
    AIRY: 0.03, // leaves, fences, plants, cloth, carpets, lanterns: nearly a window
    LIGHT: 0.1, // thatch, hay, ice, snow
    WOOD: 0.128, // planks, logs, doors, a ship's boards: 1 block ≈ 88%
    MID: 0.28, // earth, sand, bricks, plaster, tiles, shelves
    STONE: 0.43, // stone and castle stone: 1 block ≈ 65%, 3 ≈ 27%
    DENSE: 0.8, // deep stone, gold
    BEDROCK: 1.6,
};

/** The black ship's curse (Ships.isCursed, written out here: that module is heavy): a magic ship nobody owns. */
const isCursed = (s) => !!(s?.cls?.magic && !s.owner);

const _T = BLOCK;
/** block name → [μ, the name for the codex and the log] */
const TABLE = [
    [['WHEAT', 'FLOWERS', 'VEG'], MU.AIRY * 0.7, 'растения'],
    [['FENCE'], MU.AIRY, 'решётка забора'],
    [['LEAVES', 'BIRCH_LEAVES', 'SPRUCE_LEAVES', 'CHERRY_LEAVES', 'DARK_LEAVES', 'PLANET_LEAF'], 0.05, 'листва'],
    [['CLOTH_WHITE', 'CLOTH_YELLOW', 'CARPET_RED', 'CARPET_BLUE', 'CARPET_GREEN', 'CARPET_PURPLE'], 0.06, 'ткань'],
    [['LANTERN'], 0.05, 'фонарь'],
    [['THATCH', 'HAY'], MU.LIGHT, 'солома'],
    [['ICE', 'ICE_SHAPE', 'PLANET_ICE'], MU.LIGHT, 'лёд'],
    [['SNOW'], 0.14, 'снег'],
    [['WOOD', 'BIRCH', 'SPRUCE', 'CHERRY', 'DARK', 'PLANKS', 'PLANKS_DARK', 'PLANET_WOOD'], MU.WOOD, 'дерево'],
    [['PLASTER'], 0.22, 'штукатурка'],
    [['SAND'], 0.24, 'песок'],
    [['BOOKS', 'POTION'], 0.25, 'полки'],
    [['DIRT', 'GRASS', 'PATH', 'FARMLAND', 'PLANET_GRASS', 'REGOLITH'], MU.MID, 'земля'],
    [['BRICK', 'GRAVEL', 'ROOF_RED', 'ROOF_BLUE', 'ROOF_PURPLE'], 0.3, 'кирпич и черепица'],
    [['ROOF_SLATE'], 0.36, 'сланец'],
    [['COBBLE'], 0.4, 'булыжник'],
    [['STONE', 'CS_GREY', 'CS_SAND', 'CS_DARK', 'CS_WHITE', 'CS_MOSSY', 'PLANET_ROCK', 'PLANET_DARK'], MU.STONE, 'камень'],
    [['GOLD'], 0.55, 'золото'],
    [['DEEPSTONE'], MU.DENSE, 'глубокий камень'],
    [['BEDROCK'], MU.BEDROCK, 'скала'],
];
/** Magic stops the look: block name → why (the codex and the tests read it). */
const MAGIC = [
    [['ENCHANTED', 'ENCHANTED_SEAT', 'ARCANE_WARD'], 'enchanted', 'заколдованный камень (арены, стены башен волшебников)'],
    [['ARCANE', 'ARCANE_DARK', 'ARCANE_LAMP', 'ARCANE_LAMP_VIOLET', 'RUNE'], 'arcane', 'арканный камень волшебников'],
    [['ICE_WALL', 'ICE_GLOW', 'ICE_FLOOR', 'ICE_DARK'], 'queen', 'лёд Ледяной Королевы (её магия не пускает взгляд)'],
];

const BY_TYPE = new Map(); // block id → { mu, name } or { blocked, name }
for (const [names, mu, name] of TABLE) for (const n of names) if (_T[n] != null) BY_TYPE.set(_T[n], { mu, name, blocked: null });
for (const [names, why, name] of MAGIC) for (const n of names) if (_T[n] != null) BY_TYPE.set(_T[n], { mu: Infinity, name, blocked: why });
BY_TYPE.set(SEEN.SHIP_WOOD, { mu: MU.WOOD, name: 'корабельные доски', blocked: null });
BY_TYPE.set(SEEN.DOOR, { mu: MU.WOOD, name: 'дверь', blocked: null });
BY_TYPE.set(SEEN.SHIP_CURSED, { mu: Infinity, name: 'проклятый корпус чёрного корабля', blocked: 'cursed' });
BY_TYPE.set(SEEN.GOD, { mu: Infinity, name: 'дар богов (золотая защита)', blocked: 'gods' });
BY_TYPE.set(SEEN.WARD, { mu: Infinity, name: 'защита чужого дома', blocked: 'ward' });
const OTHER = { mu: MU.STONE, name: 'камень', blocked: null }; // (an unknown block is taken for stone: the safe side)

/** What stops or dims the look: a block id or one of SEEN → { mu, name, blocked }. */
export const seeThrough = (code) => BY_TYPE.get(code) || OTHER;

/** The table for the codex and the tests: material → { mu, blocked }. */
export const SEE_THROUGH = Object.fromEntries([...BY_TYPE].map(([k, v]) => [k, v]));

/** Why a look is stopped — the hint (one line; the same for every kind of magic: the author's words). */
export const BLOCK_HINT = '🔮 Магия этой стены не пускает ваш взгляд';

/** The clearness (0…1) of a path: exp(−Σ μ · metres) — `segs`: [{ code, from, to }]. A stopped path is 0. */
export function clearOf(segs) {
    let sum = 0;
    for (const s of segs) {
        const p = seeThrough(s.code);
        if (p.blocked) return 0;
        sum += p.mu * Math.max(0, s.to - s.from);
    }
    return Math.exp(-sum);
}

/** How it looks at this clearness (the log and the hints): 'milk' | 'shapes' | 'dim' | 'good' | 'clear'. */
export function bandOf(clear) {
    return clear < SEE.WORKED ? 'milk' : clear < SEE.SHAPES ? 'shapes' : clear < 0.35 ? 'dim' : clear < 0.7 ? 'good' : 'clear';
}

/**
 * Follow a look from `o` along `d` (a unit vector) through the world. `sample(x, y, z, t)` gives 0 where it is open
 * and else a block id or a SEEN code. Pure.
 * @returns {{ state: 'open'|'far'|'blocked'|'see', first: number, exit: number, thick: number, clear: number, why: string|null,
 *   name: string, segs: object[] }}
 *   state: 'open' nothing solid in the way, 'far' the first solid thing is farther than REACH, 'blocked' magic stops the
 *   look, 'see' the look goes through; first: m to the first solid thing; exit: m to the far side of the cluster.
 */
export function traceView(sample, o, d, { maxLen = SEE.MAX_LEN, step = SEE.STEP, reach = SEE.REACH, gap = SEE.GAP_MAX } = {}) {
    const out = { state: 'open', first: Infinity, exit: 0, thick: 0, clear: 1, why: null, name: '', segs: [], stopAt: Infinity, endless: false };
    const n = Math.ceil(maxLen / step);
    let cur = null, lastEnd = -Infinity, started = false;
    const close = () => { if (cur) { out.segs.push(cur); lastEnd = cur.to; cur = null; } };
    for (let i = 0; i < n; i++) {
        const t = (i + 0.5) * step, a = i * step;
        const code = sample(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t, t);
        if (code) {
            if (!started) {
                started = true;
                out.first = a;
                if (a > reach) { out.state = 'far'; return out; } // (the first solid thing is too far: no look)
            }
            if (cur && cur.code === code) { cur.to = a + step; continue; }
            if (cur) close();
            else if (out.segs.length && a - lastEnd > gap) break; // (the air between was too wide: that is another wall)
            if (out.segs.length && seeThrough(code).blocked) { out.stopAt = a; break; } // (magic farther on is not part of this wall: it stays a wall, the look stops before it)
            cur = { code, from: a, to: a + step };
        } else if (cur) close();
        else if (started && a - lastEnd > gap) break;
    }
    close();
    if (!out.segs.length) return out;
    const first = out.segs[0], p = seeThrough(first.code);
    if (p.blocked) { out.state = 'blocked'; out.why = p.blocked; out.name = p.name; out.clear = 0; out.exit = first.to; out.segs = [first]; return out; }
    const last = out.segs[out.segs.length - 1];
    out.exit = last.to;
    out.endless = last.to >= maxLen - step && out.stopAt === Infinity; // (the wall goes on beyond what is followed)
    out.thick = out.segs.reduce((s, x) => s + (x.to - x.from), 0);
    out.clear = out.endless ? 0 : clearOf(out.segs);
    out.state = 'see';
    // the material that takes most of the clearness (the log)
    let best = 0;
    for (const s of out.segs) { const w = seeThrough(s.code).mu * (s.to - s.from); if (w >= best) { best = w; out.name = seeThrough(s.code).name; } }
    return out;
}

/** Where the camera's near plane stands for the picture behind the wall: just past its far side, never into magic stone behind it. */
export const nearOf = (info) => Math.max(0.2, Math.min(info.exit + SEE.NEAR_PAD, info.stopAt - 0.02));

/**
 * Where the wand's jet leaves its puff: along `dir` from `tip`, on the near side of the first solid thing within JET_MAX
 * (steam sticks to a wall's face), else JET_FREE ahead. `sample` as in traceView. Writes into `out` {x,y,z}. Pure.
 */
export function steamPoint(sample, tip, dir, out = { x: 0, y: 0, z: 0 }) {
    let hit = Infinity;
    for (let t = SEE.STEP * 0.5; t < SEE.JET_MAX; t += SEE.STEP) {
        if (sample(tip.x + dir.x * t, tip.y + dir.y * t, tip.z + dir.z * t, t)) { hit = t; break; }
    }
    const d = hit === Infinity ? SEE.JET_FREE : Math.max(0.6, Math.min(SEE.JET_MAX, hit - SEE.JET_STICK));
    out.x = tip.x + dir.x * d; out.y = tip.y + dir.y * d; out.z = tip.z + dir.z * d;
    return out;
}

/** Is a new puff due: the jet's end moved far enough from the last one (and steam is left)? Pure. */
export const puffDue = (last, p, steam) => steam > 0 && (!last || Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) >= SEE.PUFF_GAP);

/** How strongly a puff of age `age` s is there (0…1): it swells in 0.6 s, thins out in its last 8 s. */
export const puffStrength = (age) => Math.min(1, Math.max(0, age / 0.6)) * (1 - Math.min(1, Math.max(0, (age - (SEE.PUFF_LIFE - 8)) / 8)));

/** ON WHOM AND ON WHAT (CLAUDE.md). `does`: see | none | blocked. */
export const VISIBLE_TARGETS = {
    me: { does: 'see', why: 'только я вижу тучку: она на моём экране' },
    players: { does: 'see', why: 'другие игроки ВИДЯТ пар и нарисованную тучку (сообщения «vgs»), но смотрят на неё снаружи; сквозь стены смотрит только колдующий' },
    steam: { does: 'none', why: 'пар не толкает, не ранит, не пугает, не горит и не мешает ходить (коллизий у него нет); его конечное количество — SEE.STEAM порций, потом струя иссякает; пар редеет за PUFF_LIFE с' },
    servants: { does: 'none', why: 'мои слуги ничего не замечают' },
    zombies: { does: 'see', why: 'зомби за стеной я вижу; они меня и заклинание не замечают — на них оно не действует' },
    castlePeople: { does: 'see', why: 'жителей, рыцарей, короля и волшебников за стеной вижу; они не пугаются и не тревожатся (castleLife.alarm не зовём): взгляд — не преступление' },
    animals: { does: 'see', why: 'зверей за стеной вижу; их не тревожит' },
    sailors: { does: 'see', why: 'матросов за бортом деревянного корабля вижу (борт и палуба — дерево, просвечивается); чёрный корабль — проклятие не пускает' },
    spider: { does: 'see', why: 'паучиху вижу в логове за камнем; она об этом не знает' },
    livingTrees: { does: 'see', why: 'ожившие деревья вижу; им всё равно' },
    bookBirds: { does: 'see', why: 'книги-птиц вижу; им всё равно' },
    dragon: { does: 'see', why: 'дракона в логове вижу сквозь скалу, если стена тонкая; он не знает о заклинании — не злится' },
    phoenix: { does: 'see', why: 'феникса вижу; он не знает' },
    owl: { does: 'see', why: 'сову вижу; она не знает' },
    canary: { does: 'see', why: 'канарика вижу; он не знает' },
    gargoyle: { does: 'see', why: 'горгулью вижу; она не знает' },
    iceCastle: { does: 'blocked', why: 'стены Ледяного замка — магия Королевы: взгляд не пускают (молочное «ничего»)' },
    blackship: { does: 'blocked', why: 'корпус чёрного корабля проклят: взгляд не пускает; обычные корабли — дерево, просвечивается' },
    bosses: { does: 'see', why: 'боссы заклинанием не защищены, но и не узнают о нём; сундуки босса видно, если стена пропускает взгляд' },
    blocks: { does: 'see', why: 'блоки стен: прозрачность по материалу и толщине (SEE_THROUGH): дерево — чётко, камень — хуже, много камня — ничего' },
    doors: { does: 'see', why: 'дверь — тонкое дерево: видно почти как есть' },
    ships: { does: 'see', why: 'палуба и борт обычного корабля — дерево, просвечивается' },
    water: { does: 'none', why: 'вода — не преграда, под водой видно как всегда' },
    ward: { does: 'blocked', why: 'сфера защиты чужого дома непрозрачна для взгляда (своя и выданная мне — нет)' },
    godGift: { does: 'blocked', why: 'дары богов и весь храм богов — золотая защита не пускает взгляд' },
    enchanted: { does: 'blocked', why: 'заколдованный камень (арены, стены башен волшебников) и арканный камень — магия не пускает взгляд' },
    space: { does: 'see', why: 'в космосе стен нет — смотреть не на что; на планетах те же правила по породе планеты (реголит, скала, лёд)' },
    spells: { does: 'none', why: 'мои заклинания, взрывы и удары остаются теми же: тучка только смотрит, ничего не меняет в мире' },
    concentration: { does: 'see', why: 'удерживаемое: пока оно включено, другие заклинания не работают (кроме «стоп», Люмос, Нокс…)' },
};

const _o = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 }, _end = { x: 0, y: 0, z: 0 };

export class VisibleGodi {
    constructor(game) {
        this.game = game;
        this.on = false;
        this.info = { state: 'open', first: Infinity, exit: 0, thick: 0, clear: 1, why: null, name: '', segs: [], stopAt: Infinity };
        this._scanT = 0;
        this._worked = false; // it really showed something: the first-time bonus was asked for
        this._hinted = new Set(); // hints already shown since it was switched on
        this._ships = []; // (the ships round the eyes — for the ray)
        this._wards = []; // (the spheres of others' houses)
        this._doorAt = -1; // m along the ray where a door's leaf is
        this._cx = NaN; this._cz = NaN; this._made = true; // (the chunk last asked about: is its land made?)
        this.rays = 0; // (tests/log) how many rays were followed
        this.puffs = []; // my painted steam: { x, y, z, t0 (s, performance clock), seed } — the picture's mask and the net's copy
        this.steam = SEE.STEAM; // puffs left in the jet
        this.jet = null; // { tip, head } now (SteamFx draws the thread of steam between them)
        this._jetT = 0;
        this._puff = { x: 0, y: 0, z: 0 };
        this.sample = (x, y, z, t) => this._sample(x, y, z, t);
    }

    /** What is at this point of the world for the look: 0 open, else a block id or a SEEN code. */
    _sample(x, y, z, t) {
        const g = this.game, data = g.terrain?.data;
        // a door's leaf (found once per ray: Doors.segmentHit)
        if (this._doorAt >= 0 && t >= this._doorAt && t < this._doorAt + 0.2) return SEEN.DOOR;
        // ships: the shell, the decks, the masts…; the cursed black ship stops the look
        for (let i = 0; i < this._ships.length; i++) {
            const s = this._ships[i], col = s.collider;
            if (col.hasXZ(x, z) && col.pointBlocked(x, y, z)) return isCursed(s) ? SEEN.SHIP_CURSED : SEEN.SHIP_WOOD;
        }
        // the temple's own colliders (its statues and pedestals are not blocks)
        const tc = g.temple?.collider;
        if (tc && tc.hasXZ(x, z) && tc.pointBlocked(x, y, z)) return SEEN.GOD;
        // another's house sphere
        for (let i = 0; i < this._wards.length; i++) {
            const w = this._wards[i], dx = x - w.c.x, dy = y - w.c.y, dz = z - w.c.z;
            if (dx * dx + dy * dy + dz * dz < w.r * w.r) return SEEN.WARD;
        }
        if (!data) return 0;
        const ix = Math.round(x), L = Math.floor(y + 1.5), iz = Math.round(z);
        // the land must be there: asking for a chunk that is not made would make it in the middle of a frame
        const cx = ix >> 5, cz = iz >> 5;
        if (cx !== this._cx || cz !== this._cz) { this._cx = cx; this._cz = cz; this._made = data.landMade ? data.landMade(ix, iz) : true; }
        if (!this._made) return 0;
        const type = data.get(ix, L, iz);
        if (type === BLOCK.AIR || type === BLOCK.WATER) return 0;
        const s = data.shapeAt ? data.shapeAt(ix, L, iz) : 0;
        if (s && data.isSolidAt && !data.isSolidAt(x, y, z)) return 0; // (a slab, a ramp: the empty part of the cell)
        if (data.godGiftAt && data.godGiftAt(ix, L, iz)) return SEEN.GOD;
        return type;
    }

    /** Follow the look now (from the camera, straight ahead); sets `info`. */
    scan() {
        const g = this.game, cam = g.camera;
        if (!cam) return this.info;
        const e = cam.matrixWorld.elements;
        _o.x = e[12]; _o.y = e[13]; _o.z = e[14];
        _d.x = -e[8]; _d.y = -e[9]; _d.z = -e[10];
        const len = Math.hypot(_d.x, _d.y, _d.z) || 1;
        _d.x /= len; _d.y /= len; _d.z /= len;
        // the things that are not blocks: ships near, a door on the ray, the spheres of others' houses
        this._ships.length = 0;
        if (g.ships?.list) for (const s of g.ships.list.values()) if (s.collider && s.collider.hasXZ(_o.x, _o.z, SEE.MAX_LEN + 4)) this._ships.push(s);
        this._wards.length = 0;
        if (g.wards?.list) for (const w of g.wards.list.values()) if (!g.wards.mine(w)) this._wards.push(w);
        this._doorAt = -1;
        if (g.doors?.segmentHit) {
            _end.x = _o.x + _d.x * (SEE.REACH + 1); _end.y = _o.y + _d.y * (SEE.REACH + 1); _end.z = _o.z + _d.z * (SEE.REACH + 1);
            const h = g.doors.segmentHit(_o, _end, 0);
            if (h) this._doorAt = h.s * (SEE.REACH + 1);
        }
        this.rays++;
        this.info = traceView(this.sample, _o, _d);
        return this.info;
    }

    /** Voice on my computer. */
    cast(isFinal) {
        const g = this.game;
        const hint = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (this.on) return hint('👁️ «Visible Godi» уже работает. «Стоп» — закрыть тучку');
        if (!castingHand(g)) return hint('👁️ Поднимите палочку (руку) и скажите «Visible Godi»');
        if (g.swim?.underwater) return hint('👁️ Под водой пар не держится');
        const tired = g.combat.check('VisibleGodi');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('VisibleGodi');
        this.set(true);
        g.hud.setVoice('👁️ Из палочки идёт пар — рисуйте им тучку на стене, потом смотрите сквозь неё (пар кончится; 1 мана в секунду, «стоп» — закрыть)', true);
        return 'VisibleGodi';
    }

    /** On / off on my computer. */
    set(on, why = null) {
        if (this.on === on) return;
        const g = this.game;
        this.on = on;
        this._hinted.clear();
        this._scanT = 0;
        this.info = { state: 'open', first: Infinity, exit: 0, thick: 0, clear: 1, why: null, name: '', segs: [], stopAt: Infinity };
        this.puffs.length = 0;
        this.steam = SEE.STEAM;
        this.jet = null;
        g.seeFx?.setOn?.(on);
        g.steam?.setJet?.('local', null, null, false);
        if (!on) { g.steam?.clear?.('local'); g.sync?.steamOff?.(); }
        g.perf?.note?.(on ? '👁️ Visible Godi: включена' : '👁️ Visible Godi: выключена' + (why ? ' (' + why + ')' : ''));
        if (!on) {
            if (why === 'steam') g.hud.setVoice('👁️ Пар разошёлся — тучки больше нет', true);
            else if (why === 'mana') g.hud.setVoice('👁️ Мана кончилась — тучка растаяла', true);
            else if (why === 'stop') g.hud.setVoice('👁️ Тучка закрыта', true);
        }
    }

    /** «стоп» / a broken concentration: true when it was on. */
    stop(why = 'stop') {
        if (!this.on) return false;
        this.set(false, why);
        return true;
    }

    /** One hint per switching on (only when the player does something: looks at a wall). */
    _hint(key, text) {
        if (this._hinted.has(key)) return;
        this._hinted.add(key);
        this.game.hud?.setVoice?.(text, true);
    }

    update(dt) {
        const g = this.game;
        if (!this.on) return;
        if (g.combat?.dead || g.isDeadLocal) { this.set(false, 'dead'); return; }
        if (g.combat?.drain(SEE.DRAIN * dt, dt) === false) { this.set(false, 'mana'); return; }
        this._scanT -= dt;
        if (this._scanT <= 0) {
            this._scanT = SEE.SCAN_T;
            const i = this.scan();
            if (i.state === 'blocked') {
                this._hint('blocked', BLOCK_HINT);
                g.perf?.note?.(`👁️ Visible Godi: взгляд не пущен (${i.name})`);
            } else if (i.state === 'see' && i.clear >= SEE.WORKED && !this._worked && g.seeFx?.coverage !== 0) {
                this._worked = true;
                g.mana?.success?.('VisibleGodi'); // (the first real look behind a wall: +5 cells, once)
                g.perf?.note?.(`👁️ Visible Godi: первый просвет — ${i.name}, ${i.thick.toFixed(1)} м, ясность ${Math.round(i.clear * 100)}%`);
            }
        }
        this._paint(dt);
        g.seeFx?.setTarget?.(this.info);
        g.seeFx?.setPuffs?.(this.puffs, performance.now() / 1000);
    }

    /** The jet: looks ahead of the wand a few times a second, leaves a puff where the wand has moved on; old puffs go. */
    _paint(dt) {
        const g = this.game, now = performance.now() / 1000;
        while (this.puffs.length && now - this.puffs[0].t0 > SEE.PUFF_LIFE) this.puffs.shift();
        this._jetT -= dt;
        if (this._jetT <= 0) {
            this._jetT = SEE.EMIT_T;
            const hand = this.steam > 0 ? castingHand(g) : null;
            if (!hand) { if (this.jet) { this.jet = null; g.steam?.setJet?.('local', null, null, false); } }
            else {
                const door = this._doorAt;
                this._doorAt = -1;
                this._refreshThings(hand.origin);
                const end = steamPoint(this.sample, hand.origin, hand.dir, this._puff);
                this._doorAt = door;
                this.jet = { tip: hand.origin, head: end };
                g.steam?.setJet?.('local', hand.origin, end, true);
                if (puffDue(this.puffs[this.puffs.length - 1], end, this.steam)) this._addPuff(end, now);
            }
        }
        if (this.steam <= 0 && !this._hinted.has('dry')) { this.jet = null; g.steam?.setJet?.('local', null, null, false); this._hint('dry', '👁️ Пар кончился — смотрите сквозь то, что нарисовали'); }
        if (this.steam <= 0 && !this.puffs.length) this.set(false, 'steam');
    }

    _addPuff(p, now) {
        const g = this.game, seed = (Math.random() * 4294967296) >>> 0;
        this.steam--;
        this.puffs.push({ x: p.x, y: p.y, z: p.z, t0: now, seed });
        if (this.puffs.length > SEE.OWNER_MAX) this.puffs.shift();
        g.steam?.addPuff?.('local', p.x, p.y, p.z, seed, now);
        g.sync?.steamPuff?.(p, seed);
    }

    /** The ships and spheres round a point (the same things scan() looks at, for the jet's own ray). */
    _refreshThings(o) {
        const g = this.game;
        this._ships.length = 0;
        if (g.ships?.list) for (const s of g.ships.list.values()) if (s.collider && s.collider.hasXZ(o.x, o.z, SEE.JET_MAX + 4)) this._ships.push(s);
        this._wards.length = 0;
        if (g.wards?.list) for (const w of g.wards.list.values()) if (!g.wards.mine(w)) this._wards.push(w);
    }

    /** Another player's steam ('vgs': k 'p' a puff at p with a seed, k 'o' the end of their spell). */
    onNet(by, m) {
        const g = this.game;
        if (by === g.localId) return;
        if (m.k === 'o') { g.steam?.clear?.(by); return; }
        if (m.k !== 'p' || !Array.isArray(m.p)) return;
        const p = m.p.map(Number);
        if (p.some((x) => !Number.isFinite(x))) return;
        g.steam?.addPuff?.(by, p[0], p[1], p[2], Number(m.s) >>> 0, performance.now() / 1000);
    }
}
