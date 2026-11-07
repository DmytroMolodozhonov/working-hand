/**
 * TornadoWeather.js — the land tornado and the whirlpool: where and when they are, and what a whirlpool does to a ship (pure and deterministic: no THREE, Node-testable).
 *
 * The author 07.11: «У нас есть торнадо, оно работает только в воде. Будет и земная версия — подхватывает землю, постройки и всё, что на пути; в воду войти не может; создаётся
 * через заклинание Tornado, или само появляется на земле — в 2 раза реже, чем водяное; через время само исчезает. И ещё водоворот: засасывает корабли — большие быстрее, маленьким
 * проще выбраться, но не обязательно выберутся, есть предел; единственный, кто выбирается, — капитан Чёрные Усы (в 90 % случаев, но ему непросто — это должно быть видно). Водовороты
 * попадаются сами в 3 раза реже, чем водяное торнадо, и их можно вызвать заклинанием — 400 маны.»
 *
 * The timetable is OceanWeather's (the same SLOT, the same storm gate, the same hash), so «2 times / 3 times rarer» is exact against the waterspouts:
 *   a sea's slot brings 0 / 1 / 2 spouts with 35 % / 45 % / 20 % → 0.85 on average;
 *   a land cell's slot brings 0 / 1 / 2 land tornadoes with 67.5 % / 22.5 % / 10 % → 0.425 (half);
 *   a sea's slot brings 0 / 1 whirlpool with 71.7 % / 28.3 % → 0.283 (a third).
 */
import { OCEAN, stormWeight } from './OceanWeather.js';
import { BLOCK, isLeaves, isWood, isCastleBlock } from './Terrain.js';

export const TORNADO = {
    CELL: 640, // m: a land cell (one slot's tornadoes are born inside it)
    NEAR: 900, // m: the cells round me looked at
    LIFE: [90, 170], // s a natural land tornado lives
    GROW: 10, FADE: 14,
    SPEED: 4.2, // m/s it walks with the wind (slower over land)
    SWAY: 30,
    R: 7, // m: its core (what it tears up)
    PULL: 34, // m: the wind round it
    HEIGHT: 120,
    SUMMON_LIFE: 4 * 60, // s: a called one stands this long at most (the author: «через какое-то время само исчезает»)
    SUMMON_AHEAD: 45, // m ahead of the caster it comes down
    SUMMON_WATER_MARGIN: 30, // m of water-free ground round the place it is called
    SUMMON_ROAM: [40, 30],
    MAX_SUMMONED: 3,
    // what it tears: a few cells a tick, by hardness (TearRules)
    TICK: 0.25, // s between the tearing steps
    CELLS: 22, // cells touched per step at most
    REACH_UP: 26, // m above the ground the funnel tears
    SOIL: 2, // layers of the ground itself it lifts (the topsoil), never a crater
};

export const WHIRL = {
    SLOT: OCEAN.SLOT,
    LIFE: [110, 200], // s a natural whirlpool lives
    GROW: 14, FADE: 18,
    MIN_S: 70, // m off the shore it is born (deep water)
    DIE_S: 30,
    R: 18, // m: the eye (a hull that gets here is gone)
    NO_RETURN: 46, // m: inside this nothing without a power of its own gets out
    PULL: 120, // m: the water starts to draw things in
    DRIFT: 0.25, // m/s the whole whirlpool wanders
    SUMMON_COST: 400,
    SUMMON_LIFE: 6 * 60, // s: a called one
    SUMMON_AHEAD: 60, // m ahead of the caster
    SUMMON_MIN_S: 40,
    MAX_SUMMONED: 3,
    BLACK_ESCAPE: 0.9, // the author: Captain Black Moustache gets out in 9 cases of 10
};

const TAU = Math.PI * 2;

function h01(a, b, c, d) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519) + Math.imul(d | 0, 3266489917)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** How many land tornadoes a cell's slot brings, from the slot's roll n (0…1): half the spouts' rate. */
export const landCount = (n) => (n < 0.675 ? 0 : n < 0.9 ? 1 : 2);
/** How many whirlpools a sea's slot brings, from the roll n: a third of the spouts' rate. */
export const whirlCount = (n) => (n < 0.7167 ? 0 : 1);

/**
 * The natural land tornadoes round (cx, cz) at time t: [{id, x, z, k, born, life, spin, land: true}].
 * `landAt(x, z)` → true where the ground is dry land (not water, not the sea's shore); a tornado is born only on land, and `water(x, z)` (true over water) kills it: it never enters the water.
 */
export function landTornadoesOf(seed, t, cx, cz, landAt, out = [], radius = TORNADO.NEAR) {
    out.length = 0;
    const C = TORNADO.CELL;
    const i1 = Math.floor(t / OCEAN.SLOT), i0 = Math.floor((t - TORNADO.LIFE[1]) / OCEAN.SLOT);
    const gx0 = Math.floor((cx - radius) / C), gx1 = Math.floor((cx + radius) / C), gz0 = Math.floor((cz - radius) / C), gz1 = Math.floor((cz + radius) / C);
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
        for (let i = i0; i <= i1; i++) {
            const n = h01(gx + 77, gz - 31, i, seed + 5521);
            const count = landCount(n);
            for (let j = 0; j < count; j++) {
                const r = (q) => h01(gx * 31 + j * 7 + q, gz * 17 + q, i, seed + 5522);
                const born = i * OCEAN.SLOT + r(1) * OCEAN.SLOT * 0.8;
                const life = TORNADO.LIFE[0] + r(2) * (TORNADO.LIFE[1] - TORNADO.LIFE[0]);
                const age = t - born;
                if (age < 0 || age > life) continue;
                if (stormWeight(seed, born) < 0.5) continue; // (born only in a storm, as the spouts)
                const x0 = (gx + r(3)) * C, z0 = (gz + r(4)) * C;
                if (!landAt(x0, z0)) continue; // (not born over water)
                const a = r(5) * TAU;
                const sway = Math.sin(age / 19 + r(6) * TAU) * TORNADO.SWAY;
                const x = x0 + Math.cos(a) * TORNADO.SPEED * age - Math.sin(a) * sway, z = z0 + Math.sin(a) * TORNADO.SPEED * age + Math.cos(a) * sway;
                const k = Math.min(1, age / TORNADO.GROW, (life - age) / TORNADO.FADE);
                out.push({ id: `L${gx}:${gz}:${i}:${j}`, x, z, k: Math.max(0, k), born, life, spin: r(7) < 0.5 ? 1 : -1, land: true });
            }
        }
    }
    return out;
}

/** The natural whirlpools of a sea at time t: [{id, x, z, k, born, life, spin, whirl: true}] (born only in a storm — the same gate as the spouts). */
export function whirlpoolsOf(index, sea, seed, t, out = []) {
    out.length = 0;
    const i1 = Math.floor(t / WHIRL.SLOT), i0 = Math.floor((t - WHIRL.LIFE[1]) / WHIRL.SLOT);
    for (let i = i0; i <= i1; i++) {
        const n = h01(sea.gx + 13, sea.gz + 5, i, seed + 7331);
        if (!whirlCount(n)) continue;
        const r = (q) => h01(sea.gx * 29 + q, sea.gz * 13 + q, i, seed + 7332);
        const born = i * WHIRL.SLOT + r(1) * WHIRL.SLOT * 0.8;
        const life = WHIRL.LIFE[0] + r(2) * (WHIRL.LIFE[1] - WHIRL.LIFE[0]);
        const age = t - born;
        if (age < 0 || age > life) continue;
        if (stormWeight(seed, born) < 0.5) continue;
        const a = r(3) * TAU;
        const p0 = index.pointAt(sea, a, WHIRL.MIN_S + r(4) * Math.max(10, sea.r0 * 0.4));
        if (index.signedDist(p0.x, p0.z) < WHIRL.MIN_S * 0.8) continue; // (an island there)
        const da = r(5) * TAU;
        const x = p0.x + Math.cos(da) * WHIRL.DRIFT * age, z = p0.z + Math.sin(da) * WHIRL.DRIFT * age;
        const sd = index.signedDist(x, z);
        if (sd < WHIRL.DIE_S) continue;
        const k = Math.min(1, age / WHIRL.GROW, (life - age) / WHIRL.FADE);
        out.push({ id: `${sea.id}:w${i}`, x, z, k: Math.max(0, k), born, life, spin: r(6) < 0.5 ? 1 : -1, whirl: true });
    }
    return out;
}

// ------------------------------------------------------------------------------------------------ what a whirlpool does to a ship
/**
 * The whirlpool's draw on a ship of length `L` m at distance `d` from its centre (strength `k` 0…1, spin ±1):
 *   → { in (m/s towards the centre), round (m/s swirling), grip (0…1: how far in the grip it is), eye (inside the eye) } or null when out of reach.
 * A bigger hull catches more of the current: its draw is stronger (the author: «которые побольше — засасываются быстрее»).
 */
export function whirlDraw(w, L, d, out = {}) {
    if (d > WHIRL.PULL || w.k <= 0.05) return null;
    const near = 1 - d / WHIRL.PULL; // 0 at the rim … 1 in the middle
    const size = Math.min(1.6, Math.max(0.35, L / 60)); // 44 m pinnace 0.73, 60 m 1, 80 m 1.33, the black ship 1.53
    out.in = w.k * size * (1.0 + 8 * near * near);
    out.round = w.spin * w.k * size * (2 + 9 * near);
    out.grip = d < WHIRL.NO_RETURN ? 1 : Math.max(0, 1 - (d - WHIRL.NO_RETURN) / (WHIRL.PULL - WHIRL.NO_RETURN));
    out.eye = d < WHIRL.R;
    return out;
}

/**
 * How hard a ship can pull away (m/s, outwards): her sails and her rudder. A small handy ship has more than the draw at the rim — and not near the middle. `wind` 0…1 how well the
 * wind fills her sails; `crew` 0…1 how well she is sailed (a crewless drifting hull 0.05; a handled ship 1; Captain Black Moustache's ship 1.6).
 */
export function shipPull(L, wind = 0.6, crew = 1) {
    const handy = Math.min(1.4, Math.max(0.5, 80 / Math.max(30, L))); // small ships are handier
    return 3.2 * handy * Math.max(0.1, wind) * Math.max(0.05, crew) * 2.2;
}

/**
 * The net step of a ship for dt seconds: is she pulled in or does she claw out?
 * → { net (m/s inwards, + drags in), fight (0…1 how hard she strains), lost (true when she is in the eye) }.
 * Past the point of no return (NO_RETURN) the draw wins over every ordinary ship; the black ship's roll `blackLuck` (0…1) decides whether she makes it.
 */
export function shipNet(w, L, d, { wind = 0.6, crew = 1, black = false, blackLuck = 0.5 } = {}) {
    const f = whirlDraw(w, L, d, _f);
    if (!f) return { net: 0, fight: 0, lost: false };
    let pull = shipPull(L, wind, crew);
    let fight = Math.min(1, pull / Math.max(0.01, f.in));
    if (black) {
        // Captain Black Moustache: the skill to get out — in nine cases of ten; it is never easy: she strains at the very limit (net ≈ a crawl outwards), the tenth she is dragged
        if (blackLuck < WHIRL.BLACK_ESCAPE) { pull = Math.max(pull, f.in * 1.12 + 0.35); fight = 1; }
        else pull *= 0.8;
    } else if (f.grip >= 1) {
        pull *= 0.55; // (past the point of no return: no ordinary ship has enough)
    }
    return { net: f.in - pull, fight, lost: f.eye && !(black && blackLuck < WHIRL.BLACK_ESCAPE) };
}
const _f = {};

/** Deterministic roll (0…1) for a ship in a whirlpool (the same on every computer). */
export function luckOf(whirlId, shipId) {
    let h = 2166136261 >>> 0;
    for (const ch of `${whirlId}|${shipId}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h01(h, h >>> 7, 3, 9);
}

// ------------------------------------------------------------------------------------------------ the land tornado: what it does
/**
 * The wind of a land tornado `tn` ({x, z, k, spin}) on a body at (x, y above the ground, z): {vx, vy, vz} — the swirl, the pull, the lift in the core; null out of reach.
 */
export function tornadoPush(tn, x, y, z, out = {}) {
    const dx = x - tn.x, dz = z - tn.z, d = Math.hypot(dx, dz);
    if (d > TORNADO.PULL || y > TORNADO.HEIGHT * 0.5 || tn.k <= 0.05) return null;
    const ux = d > 1e-3 ? dx / d : 1, uz = d > 1e-3 ? dz / d : 0;
    const near = 1 - d / TORNADO.PULL;
    const swirl = tn.k * (5 + 20 * near * near) * tn.spin;
    const pull = tn.k * (2 + 9 * near * near);
    out.vx = -uz * swirl - ux * pull;
    out.vz = ux * swirl - uz * pull;
    out.vy = d < TORNADO.R * 1.7 ? tn.k * (13 + 10 * (1 - d / (TORNADO.R * 1.7))) : 0;
    out.core = d < TORNADO.R;
    out.near = near;
    return out;
}

/**
 * How many steps of the tornado's tearing a block takes before it is lifted (0: never — the ground's rock, water, ice, the gods' and the enchanted stone, hell, the planets').
 * Loose things go at once; wood and thatch in two; plaster and brick in three; the castles' stone in four; the pyramids' (four times as hard) never in a tornado's time.
 */
export function tearHits(t) {
    switch (t) {
        case BLOCK.GRASS: case BLOCK.DIRT: case BLOCK.SAND: case BLOCK.SNOW: case BLOCK.GRAVEL: case BLOCK.FARMLAND: case BLOCK.WHEAT: case BLOCK.PATH:
        case BLOCK.HAY: case BLOCK.FLOWERS: case BLOCK.VEG: case BLOCK.THATCH: case BLOCK.FENCE: case BLOCK.CLOTH_WHITE: case BLOCK.CLOTH_YELLOW:
        case BLOCK.CARPET_RED: case BLOCK.CARPET_BLUE: case BLOCK.CARPET_GREEN: case BLOCK.CARPET_PURPLE: case BLOCK.BOOKS: case BLOCK.POTION: case BLOCK.LANTERN:
            return 1;
        case BLOCK.PLASTER: case BLOCK.BRICK: case BLOCK.COBBLE: return 3;
        case BLOCK.GOLD: return 6;
        default: break;
    }
    if (isLeaves(t)) return 1;
    if (isWood(t) || t === BLOCK.PLANKS || t === BLOCK.PLANKS_DARK || t === BLOCK.ROOF_RED || t === BLOCK.ROOF_BLUE || t === BLOCK.ROOF_SLATE || t === BLOCK.ROOF_PURPLE) return 2;
    if (t === BLOCK.ARCANE || t === BLOCK.ARCANE_DARK || t === BLOCK.ARCANE_LAMP || t === BLOCK.ARCANE_LAMP_VIOLET || t === BLOCK.RUNE) return 6;
    if (isCastleBlock(t)) return 4; // (castle stone, towers, halls)
    return 0;
}
/** The loose ground a tornado lifts in thin layers (never a crater). */
export const isSoil = (t) => t === BLOCK.GRASS || t === BLOCK.DIRT || t === BLOCK.SAND || t === BLOCK.SNOW || t === BLOCK.GRAVEL;

// ------------------------------------------------------------------------------------------------ «кто/что × как действует» (CLAUDE.md)
/** The land tornado ('Tornado' away from the sea, or its own): who and what it acts on. */
export const LAND_TARGETS = {
    player: { does: 'push', why: 'игроки (и по сети): закручивает и тянет к себе, в ядре подбрасывает и выбрасывает; абсолютная устойчивость держит; каждый компьютер двигает своего героя' },
    creatures: { does: 'push', why: 'жители, звери, зомби, моряки на берегу: толкает и подбрасывает (CreatureImpact), хост; люди боятся (Danger «twister»)' },
    ground: { does: 'tear', why: 'земля: два тонких слоя рыхлого грунта (дёрн, земля, песок, снег, гравий), никогда не кратер; скала и дно не берутся' },
    buildings: { does: 'tear', why: 'постройки: крыши, доски, штукатурка, кирпич, замковый камень — по твёрдости (tearHits), сверху вниз; что потеряло опору — обрушивается (Builder._sendEdits settle)' },
    wards: { does: 'none', why: 'дом под защитой «Protection House» — не трогает' },
    gifts: { does: 'none', why: 'заколдованный камень, дары богов, замок призраков, ад, лёд, пирамиды (в 4 раза крепче), планеты: не берёт' },
    water: { does: 'none', why: 'вода: в воду смерч войти не может — над водой он рассыпается и не возвращается' },
    ships: { does: 'none', why: 'корабли: смерч на суше, до воды не доходит' },
    space: { does: 'none', why: 'за пределами Земли и в аду его нет' },
};
/** The whirlpool («Maelstrom», or its own): who and what it acts on. */
export const WHIRL_TARGETS = {
    ships: { does: 'draw', why: 'корабли: чем больше, тем быстрее тянет; маленький легче вырывается, но за точкой невозврата не выберется; в центре топит; Чёрные Усы выбирается в 9 случаях из 10, с трудом' },
    player: { does: 'draw', why: 'пловец и тот, кто на воде: тянет к центру, в центре утягивает вниз; на палубе несёт корабль; в воздухе и на воде под Aquambula — нет' },
    seaLife: { does: 'flee', why: 'рыбы, дельфины, акулы: уплывают прочь (SeaLife)' },
    crews: { does: 'flee', why: 'команды кораблей: руль от водоворота (fleet.flee)' },
    land: { does: 'none', why: 'берег и суша: водоворот рождается только на глубокой воде и в мелководье рассыпается' },
    buildings: { does: 'none', why: 'постройки, блоки, земля: не трогает' },
    sky: { does: 'none', why: 'летящие (дракон, птицы, герой выше 3 м над водой): не берёт' },
};
