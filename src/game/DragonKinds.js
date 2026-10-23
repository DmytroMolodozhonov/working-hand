/**
 * DragonKinds.js — the dragons' kinds, their strength, the hoard, and the table «на кого и на что»
 * (what touches a dragon and how; what a dragon's flame touches). Pure data and rules: no THREE,
 * Node-testable. The dragons themselves: Dragons.js; their looks: DragonModel.js.
 *
 * (the author) «Драконы в игре редкие, но они есть. Несколько видов, до пяти, у каждого свой вид.
 * Одни сильнее, другие слабее — всегда зависит от вида и от случайности. Сила — это скорость
 * реакции и сила пламени, которым он дышит. У дракона 500 HP. На огонь не реагирует вообще —
 * как ни жги, даже адским огнём, ему всё равно.»
 */

import { TEMPLE_SCROLLS } from '../world/GodsTemple.js';
import { scaleCoins } from './CoinScale.js';

/** The spells of the gods (the scrolls of their library): every boss is open to them — «на то они и божественные». */
export const GODS = new Set([...TEMPLE_SCROLLS, 'FlyingMaxima']); // (and «Flying Maxima», the gods' own flight — Mana.GOD_SPELLS)
export const isGodSpell = (kind) => !!kind && GODS.has(kind);

/** Every dragon: its health. */
export const DRAGON_HP = 500; // (the author: 1000 was too much)

/**
 * The five kinds. react: how quick it is (wakes, turns, strikes, flies — ×); flame: how strong its
 * fire is (its reach and its burn — ×). Each dragon gets its kind's numbers ± chance (rollDragon).
 * size: its body against the common one.
 */
export const DRAGON_KINDS = {
    emerald: {
        name: 'Изумрудный лесной дракон', short: 'изумрудный', react: 1.0, flame: 1.0, size: 1.0,
        body: 0x2f7a3a, belly: 0xa9d46e, wing: 0x3f9a4a, horn: 0xe8e0c8, eye: 0xfff066, fire: [0xffe066, 0x9cff3a, 0xff8a1e],
    },
    crimson: {
        name: 'Багровый огненный дракон', short: 'багровый', react: 1.2, flame: 1.35, size: 1.08,
        body: 0x9a1b1b, belly: 0xe2a345, wing: 0x7a1010, horn: 0x241414, eye: 0xffb020, fire: [0xfff2a0, 0xff9a1e, 0xff3b0f],
    },
    obsidian: {
        name: 'Чёрный обсидиановый дракон', short: 'обсидиановый', react: 1.1, flame: 1.5, size: 1.18,
        body: 0x17151c, belly: 0x2c2733, wing: 0x221e2a, horn: 0x5a5560, eye: 0xff3b1f, vein: 0xff4a12, fire: [0xffffff, 0xff5a1e, 0x8a0f0f],
    },
    golden: {
        name: 'Золотой пустынный дракон', short: 'золотой', react: 1.35, flame: 0.9, size: 0.95,
        body: 0xc9a227, belly: 0xf3e2a0, wing: 0xb5761c, horn: 0x6b4a1a, eye: 0x35e0ff, fire: [0xffffff, 0xffd84a, 0xff8a1e],
    },
    ice: {
        name: 'Ледяной синий дракон', short: 'ледяной', react: 0.9, flame: 0.85, size: 1.0,
        body: 0x6fa8dc, belly: 0xe6f4ff, wing: 0x9cc8ee, horn: 0xf4fbff, eye: 0x7af0ff, fire: [0xffffff, 0x9fe8ff, 0x2f7dff],
    },
};
export const KIND_IDS = Object.keys(DRAGON_KINDS);

/** One dragon of a kind (or a random kind): its kind and its own strength. */
export function rollDragon(rng = Math.random, kind = null) {
    const k = kind && DRAGON_KINDS[kind] ? kind : KIND_IDS[Math.floor(rng() * KIND_IDS.length) % KIND_IDS.length];
    const K = DRAGON_KINDS[k];
    // (chance: a quick or a slow one, a fierce or a weak flame — around its kind's numbers)
    const react = Math.round(K.react * (0.8 + rng() * 0.4) * 100) / 100;
    const flame = Math.round(K.flame * (0.8 + rng() * 0.45) * 100) / 100;
    return { kind: k, react, flame };
}

/** What a dragon's strength means (react / flame, see rollDragon). */
export const DRAGON = {
    WAKE: 1.6, // s from noticing a thief to rising (÷ react)
    TURN: 1.6, // rad/s turning (× react)
    WALK: 6, // m/s on its feet (× react)
    FLY: 16, // m/s in the air (× react)
    FLAME_REACH: 14, // m of its fire…
    FLAME_PER: 9, // …+ this × its flame power
    FLAME_TIME: 2.2, // s a breath lasts
    FLAME_REST: 4.5, // s between breaths (÷ react)
    FLAME_PLAYER: 2.5, // HP a burn of a player (× flame), every FLAME_TICK
    FLAME_TICK: 0.4,
    BITE: 14, // HP (a bite: close in front of it)
    TAIL: 9, // HP (a sweep of the tail: close behind / beside it) — and it throws you
    BLOW_REST: 2.4, // s between bites / sweeps (÷ react)
    GIVE_UP: 150, // m from its lair (or where the chase began): then it turns back
    GUARD: 10, // m beyond the hall's wall: an intruder there is chased
    HEAR: 60, // m: a blast, a spell's thunder this near wakes it
    SLEEP_SEE: 9, // m: it wakes when somebody comes this near while it sleeps…
    SLEEP_SEE_LIGHT: 24, // …a light («Люмос», a torch) this near…
    SLEEP_SEE_RUN: 16, // …somebody running this near
    CALM: 40, // s with nobody near: it settles down to sleep again
};

/** Its fire's reach (m) for a flame power. */
export const flameReach = (flame) => DRAGON.FLAME_REACH + DRAGON.FLAME_PER * flame;

// ============================================================ «на кого и на что»
/**
 * EVERY fire there is — a dragon does not care about any of it (the author: «как ни жги, даже
 * адским огнём, ему всё равно»): «Инферно» (and its Максима), «Fire» (a campfire, burning ground),
 * «Fire Maxima» (the fire flower), «Let the Hellfire Come», burning trees and ground, a dragon's
 * own flame (its own kind's and any other's), lava (none in the game yet: written so it stays so).
 */
export const FIRE_KINDS = new Set(['Inferno', 'InfernoMaxima', 'Fire', 'FireMaxima', 'Hellfire', 'LetTheHellfireCome', 'fire', 'campfire', 'burn', 'burning', 'DragonFire', 'lava']);
export const isFire = (kind) => FIRE_KINDS.has(kind);

/**
 * What touches a dragon (the host decides; every computer sees its health): the damage it takes
 * (× of the blow's own damage, or a fixed number), whether it moves, and why. «Не действует» is a
 * decision too — written here with its reason.
 */
export const ON_DRAGON = {
    // fire: nothing at all
    fire: { mult: 0, why: 'огонь — любой: Инферно, Fire, Fire Maxima, адский огонь, горящая земля, пламя драконов — дракону всё равно' },
    // the duel charges (Duel.js): they hit its big body
    AvadaKedavra: { dmg: 25, why: 'древняя кровь дракона сильнее смертельного проклятия: «Авада» только ранит (−25, как сказал автор), не убивает' },
    Stupefy: { dmg: 15, stun: 1, why: 'оглушает на секунду (−15) — дракон слишком большой, чтобы упасть' },
    SapiraDuel: { dmg: 25, why: 'заряд «Сапиры» ранит (−25)' },
    SandsDuel: { dmg: 8, blind: 3, why: 'песок в глаза: 3 секунды он не видит цель (−8)' },
    IceDuel: { dmg: 0, why: '«Айс» / «Frozen»: целиком такого великана не заморозить — без эффекта; нужна «Айс Максима» (StrongMagic)' },
    IceMaxima: { mult: 1, why: '«Айс Максима»: −10 HP/с 10 с; в морду — трясёт головой и не атакует, в лапу — хромает, в туловище — вдвое медленнее (StrongSpells.ICE_PART)' },
    Accentric: { mult: 1, why: '«Акцентрик»: −5/с (всего 40), минуту медленнее и растерян — удачных атак вдвое меньше' },
    Pilbidrio: { mult: 1, why: '«Пилбидрио»: −80; было ≤ 80 — дракона разрывает' },
    Electrum: { mult: 1, why: '«Электром»: −25, потом −20 HP/с, пока держат молнию' },
    Die: { dmg: 1e9, why: '«Дай»: божественное — убивает дракона сразу, сколько бы HP ни было' },
    Expelliarmus: { dmg: 0, why: 'нет палочки и оружия — выбивать нечего, не действует' },
    Disarmor: { dmg: 0, why: 'чешуя — не доспех, снять нечего: не действует' },
    // blasts, rays, lightning (Game.explode / birdRay / lightningAt), Total Destruction, a cauldron's blast
    Bombardo: { mult: 1, why: 'взрыв ранит (взрыв — не огонь)' },
    TotalDestruction: { mult: 1, why: 'разрушение ранит' },
    CircleAttack: { mult: 1, why: '«Circle Attack»: волна и лучи света ранят (это не огонь); великан только качается' },
    CircleAttackMaxima: { mult: 1, why: '«Circle Attack Maxima»: ранит, как волна' },
    Inspirius: { mult: 1, why: '«Inspirius»: сама магия, а не огонь — ранит по зоне (−100 / −50 / −25)' },
    Boom: { mult: 1, why: '«Бум»: гору разрывает изнутри — это не огонь: в кратере −1000 (насмерть даже дракону), дальше −150 / −40 по зоне; великан только качается' },
    Cauldron: { mult: 1, why: 'взрыв котла ранит' },
    Lightning: { dmg: 40, why: 'молния бьёт сильно (−40)' },
    Thunderwave: { mult: 1, why: 'громовая волна ранит' },
    Sapira: { mult: 1, why: 'луч «Сапиры» ранит' },
    Ice: { mult: 1, slow: 2, why: 'ледяной луч ранит и немного замедляет' },
    // weapons and hands: the scales are thick
    melee: { mult: 0.35, why: 'меч и топор: чешуя толстая — треть урона, отрубить ничего нельзя' },
    arrow: { mult: 0.3, why: 'стрелы почти отскакивают от чешуи — треть урона' },
    fist: { mult: 0.05, why: 'кулаком дракона не пробить' },
    servant: { mult: 0.5, why: 'слуги («Брейнрот», живое дерево) бьют вполсилы' },
    Ward: { mult: 1, why: 'сфера защиты дома отталкивает и его' },
    bleed: { mult: 0, why: 'не истекает кровью: ничего не отрублено' },
    // the rest (Dragons.js says it where it happens)
    Wind: { dmg: 0, why: '«Вайнд» и толчки: дракон чуть качнётся — сдуть или свалить такого великана нельзя' },
    Jolt: { dmg: 0, why: '«Джолт»: дракон только качнётся и разозлится — отбросить такого великана нельзя' },
    JoltMaxima: { dmg: 0, why: '«Джолт Максима»: тоже только качнётся' },
    Levitation: { dmg: 0, why: '«Левиоса» не поднимет — слишком тяжёлый' },
    Accio: { dmg: 0, why: '«Акцио» — для вещей, не для существ' },
    Brainrot: { dmg: 0, why: '«Брейнрот» не действует: разум дракона слишком силён' },
    Alohomora: { dmg: 0, why: 'нечего отпирать — не действует' },
    Lock: { dmg: 0, why: '«Lock» запирает только двери — не действует' },
    WaterVortex: { dmg: 0, why: 'водяной шар не вмещает его: вода только окатывает — дракон слишком большой' },
    WaveAttack: { dmg: 0, why: 'волна только окатывает — дракон слишком тяжёлый' },
    Firefighting: { dmg: 0, why: '«Firefighting»: без воздуха его пламя гаснет (Firefighting.js), самого дракона не ранит и не сдвигает' },
    FirefightingMaxima: { dmg: 0, why: '«Firefighting Максима»: тоже только гасит пламя' },
    Earthquake: { dmg: 10, why: 'земля трясётся — он спотыкается (−10), но не падает' },
    WindImpulse: { dmg: 0, why: '«Wind Impulse»: волна воздуха — дракон только качнётся' },
    WindImpulseMaxima: { dmg: 0, why: '«Wind Impulse Максима»: тоже только качнётся' },
    Liquidation: { dmg: 3, why: '«Liquidation»: живое существо — −3, не рассыпается' },
    LiquidationMaxima: { dmg: 3, why: '«Liquidation Максима»: тоже −3 (Максима сильнее только по волшебным вещам)' },
    Drawdown: { dmg: 0, why: '«Drawdown»: земля под ним проседает — стоящий на ней дракон опускается вместе с ней, без урона' },
    Stitching: { dmg: 0, why: '«Stitching»: камни в дракона не кладутся' },
    CreateBridge: { dmg: 0, why: '«Create a Bridge»: доски в дракона не кладутся' },
    Groundprud: { dmg: 0, why: '«Groundprud»: блок в дракона не кладётся — стена вырастает рядом, когда он отойдёт' },
    Fireworks: { dmg: 0, why: '«Fireworks»: никого не ранит и не злит — дракон может поглядеть, обиды не копит' },
    Invisibility: { dmg: 0, why: 'невидимого игрока дракон не видит — теряет его' },
};

/**
 * The damage a dragon takes from a blow of `kind` worth `dmg`. Fire — always 0.
 * @returns {{dmg:number, rule:object|null}}
 */
export function dragonDamage(kind, dmg) {
    if (isGodSpell(kind)) return { dmg: Math.max(0, dmg || 0), rule: ON_DRAGON[kind] || null }; // (a spell of the gods: no scales, no fire-proofness hold)
    if (isFire(kind)) return { dmg: 0, rule: ON_DRAGON.fire };
    const r = ON_DRAGON[kind];
    if (!r) return { dmg: Math.max(0, dmg || 0), rule: null };
    if (r.dmg != null) return { dmg: r.dmg, rule: r };
    return { dmg: Math.max(0, (dmg || 0) * (r.mult ?? 1)), rule: r };
}

/**
 * What a dragon's flame touches (it is fire like the game's fire: shields and water stop it).
 * Who decides: every computer burns its own player; the host — the creatures and the world.
 */
export const DRAGON_FLAME = {
    players: 'горят (каждый компьютер — своего игрока): −2,5 HP × сила пламени раз в 0,4 с; щит «Protection» спереди и вода (водяной шар, «Water Vortex», река) пламя останавливают',
    zombies: 'горят',
    castlePeople: 'горят (жители, рыцари, король, волшебники)',
    sailors: 'горят — и паруса с палубой загораются',
    animals: 'горят',
    spider: 'горит',
    livingTrees: 'горят (огонь — то, что их убивает)',
    bookBirds: 'падают (огонь), книга защиты тоже',
    dragons: 'не действует: дракону огонь не страшен — и чужое пламя тоже',
    servants: 'горят, как своё существо',
    trees: 'загораются, сухие блоки тоже',
    ships: 'паруса и палуба загораются',
    houses: 'стёкла лопаются, стены держат пламя',
    paper: 'свитки и книги в огне сгорают',
    water: 'шипит паром — дальше не идёт',
    stone: 'стены и скала останавливают пламя',
    items: 'не горят (золото, яйцо, палочки)',
};

// ============================================================ the hoard
/** Coins one pouch holds (CoinBelt.POUCH_MAX). */
const POUCH = 500;

/**
 * A lair's hoard (deterministic from its seed): 1000–5000 coins, most of it a heap of loose coins,
 * the rest in pouches lying about on and round the heap — none of them full (room to scoop more in).
 * @returns {{total:number, loose:number, bags:number[]}}
 */
export function rollHoard(rng) {
    const total = scaleCoins(1000 + Math.floor(rng() * 4001)); // (1000–5000 cut by 40 %: CoinScale.js)
    const inBags = Math.floor(total * (0.2 + rng() * 0.15));
    const bags = [];
    let left = inBags;
    while (left > 0) {
        const n = Math.min(left, 35 + Math.floor(rng() * 50)); // (35–84)
        bags.push(n);
        left -= n;
    }
    return { total, loose: total - inBags, bags };
}

/** A handful scooped from a heap: how many coins a hand closes on. */
export const HANDFUL = { MIN: 12, MAX: 25 };
export { POUCH as POUCH_MAX_COINS };

// ============================================================ the wand and the egg
/**
 * The dragon's wand (a killed dragon drops one): deep crimson, dark-red wood glowing like embers.
 * Every fire spell is 60% stronger with it; its mana is the same (the author: «за эти 60% мана не
 * тратится»). Which spells are fire (exactly):
 *   «Инферно» (Inferno, and «Инферно Максима»), «Fire» (the campfire: it burns 60% longer),
 *   «Fire Maxima» (the fire flower), «Let the Hellfire Come» (Hellfire).
 * Not fire: «Бомбардо» (a blast — its fire on trees is a side effect, the blast is its power),
 * «Lightning Strike», «Thunderwave», «Сапира»… — like any wand for them (+15%).
 */
export const FIRE_SPELLS = new Set(['Inferno', 'InfernoMaxima', 'Fire', 'FireMaxima', 'Hellfire']);
export const DRAGON_WAND_FIRE = 1.6;

export function dragonWand(uid) {
    return { kind: 'wand', uid, dragon: true, model: 0, color: 0x8a0f14, dir: null, fav: null, power: 0 };
}

/** A dragon's egg (an item: for potions later — no hatching). kind: the dragon's kind (its look). */
export function dragonEgg(uid, kind) {
    return { kind: 'dragonEgg', uid, of: DRAGON_KINDS[kind] ? kind : 'emerald' };
}
