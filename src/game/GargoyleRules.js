/**
 * GargoyleRules.js — the infernal gargoyles of the pentagram «Пентаграмма адских горгулий» (pure, no THREE, node-testable).
 *
 * The author's words: a black mage draws the pentagram, 150 mana go at once, for ~5 s the hellfire runs round the circle
 * and grows, then 30 red gargoyles burst out of it (up, then every way), the sky over the place closes with black-crimson
 * storm clouds and lightning strikes about. The gargoyles do not touch their summoner for ~20 s; then they go for him as
 * well as for everybody else. They are not met anywhere else: no spawn in the world, only this ritual.
 *
 *  - The ritual (`PHASE`): `FIRE_T` 5 s of fire (a ring of flame runs round and grows) → the release (`RELEASE_T` 2.4 s:
 *    30 gargoyles one after another) → the storm (`STORM_T` s of clouds, at most `BOLTS` real lightning strikes, each in a
 *    random place of the radius, half of them near somebody alive). The sky radius `SKY_R` is limited — run out of it.
 *  - Mana: `MANA` 150 are taken the moment the ritual STARTS (the picture is drawn and good). Less mana — the picture
 *    stays, nothing is taken, no ritual; standing in the circle later with 150 mana starts it (`PentagramGargoyles`).
 *  - The gargoyle: 40 HP, quick (`SPEED`, a dive `DIVE`), bites and claws 3–5 (people), a shove (CreatureImpact); no
 *    bleeding (stone claws). A magical creature: fire does not touch it (hellish); cold slows it; «Protection» holds it;
 *    the gods' spells shatter it; «Авада» does not act (not alive: stone and hellfire); a blow, an arrow, a simple blast
 *    hurt. Lives `LIFE` 5–10 min, then crumbles into stone and ash. At most `MAX` 60 in the world.
 *  - Whom they hunt (`ENEMIES`): players (the summoner only after `GRACE`), castle people, animals, zombies, sailors.
 *    They leave alone: dragons, the spider, the Ice Castle, living trees, the birds. They keep inside `LEASH` 120 m of
 *    the pentagram; farther they turn back.
 */

import { isDivine } from './ProtectionGods.js';

export const GARGOYLE = {
    HP: 40,
    COUNT: 30, // one ritual
    MANA: 150, // taken when the ritual starts
    MAX: 60, // all the gargoyles of the world
    // ---- the ritual
    FIRE_T: 5, // s of the hellfire before they come out
    RELEASE_T: 2.4, // s over which the 30 burst out
    STORM_T: 80, // s the sky stays closed (from the start of the fire)
    SKY_R: 100, // m: the clouds and the strikes (the author: 80–120)
    SKY_FADE: 40, // m beyond SKY_R the gloom fades out
    SKY_H: 62, // m above the pentagram: the cloud deck
    CLOUD_IN: 4, // s: the clouds gather
    BOLTS: 12, // real strikes at most
    BOLT_FIRST: 3.5, BOLT_GAP: [2.2, 5.5], // s after the release begins; between two strikes
    BOLT_NEAR: 0.55, // a share of the strikes aimed near somebody living (so the storm is felt)
    // ---- the gargoyle
    GRACE: 20, // s after it appears: it does not touch the summoner
    LEASH: 120, // m from the pentagram
    LIFE: [300, 600], // s
    CRUMBLE_T: 3.2, // s the body falls apart
    SPEED: 15, DIVE: 25, CLIMB: 11, // m/s
    SEARCH: 70, // m: it sees a victim this far
    REACH: 2.7, // m: bite / claws
    BITE: [3, 5], // HP of a person
    HIT_CD: 1.1, // s between blows
    SHOVE: 5, // m/s of the push
    BEAST_DMG: 1.4, // × against animals and zombies (they have more HP / less armour)
    PACK: 3, // at most this many on one victim (the others look for another)
    SIZE: 1, // × the model
    HEIGHT: 2.8, SPAN: 4.8, // m: the model standing (horns to the feet) and the wings spread
    // ---- the picture on the ground
    CIRCLE_R: 4.6, // m: the ring of fire (the pentagram's own circle is the pentagram session's)
};

/** Phases of the ritual by time `t` (s from its start). */
export const PHASE = Object.freeze({ FIRE: 'fire', RELEASE: 'release', STORM: 'storm', DONE: 'done' });

export function phaseAt(t) {
    if (t < GARGOYLE.FIRE_T) return PHASE.FIRE;
    if (t < GARGOYLE.FIRE_T + GARGOYLE.RELEASE_T) return PHASE.RELEASE;
    return t < GARGOYLE.STORM_T ? PHASE.STORM : PHASE.DONE;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

/** How strong the hellfire is (0…1) at `t`: it kindles and grows for FIRE_T s, burns on until the last gargoyle, then dies down. */
export function fireStrength(t) {
    const A = GARGOYLE.FIRE_T, B = A + GARGOYLE.RELEASE_T;
    if (t <= 0) return 0;
    if (t < A) return smooth(t / A);
    if (t < B) return 1;
    return 1 - smooth((t - B) / 3);
}

/** The head of the running flame (rad): it runs round faster and faster. */
export function ringAngle(t) {
    const x = clamp(t, 0, GARGOYLE.FIRE_T);
    return 1.8 * x + 0.55 * x * x; // (≈ 1.4 turns a second at the end)
}

/** The sky's darkness (0…1) at `t`: the clouds gather in CLOUD_IN s, stay, thin out over the last 12 s. */
export function skyStrength(t) {
    if (t <= 0 || t >= GARGOYLE.STORM_T) return 0;
    return Math.min(smooth(t / GARGOYLE.CLOUD_IN), smooth((GARGOYLE.STORM_T - t) / 12));
}

/** How much of the ritual's gloom reaches a point `d` m from the pentagram: full inside SKY_R, fading over SKY_FADE. */
export function skyReach(d) {
    return 1 - smooth((d - GARGOYLE.SKY_R) / GARGOYLE.SKY_FADE);
}

/** Can the ritual begin with this much mana? `{ok, need}` (nothing is taken when not). */
export function canStart(mana, creative = false) {
    if (creative) return { ok: true, need: 0 };
    return { ok: (+mana || 0) >= GARGOYLE.MANA, need: GARGOYLE.MANA };
}

/** Does a gargoyle that appeared `age` s ago spare its summoner? */
export const sparesSummoner = (age) => age < GARGOYLE.GRACE;

/** Seeded generator (mulberry32): every computer draws the same release. */
export function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The release: for each of the 30, when it bursts out (s after the fire is over), its first climb and the way it scatters.
 * The author: «сначала вверх, потом врассыпную» — a column up (CLIMB_T s) and then every way, evenly round the compass.
 */
export function releasePlan(seed, n = GARGOYLE.COUNT) {
    const r = rng(seed ^ 0x6a7790);
    const out = [];
    const turn = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
        out.push({
            delay: (i / n) * GARGOYLE.RELEASE_T + r() * 0.05,
            climb: 1.1 + r() * 0.9, // s straight up before it scatters
            bearing: turn + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.35, // evenly round, a little scattered
            up: 7 + r() * 9, // m/s of the first climb
            scale: 0.9 + r() * 0.2, // a little different from the others
            tint: Math.floor(r() * 3),
            flap: r() * 6.28,
            life: GARGOYLE.LIFE[0] + r() * (GARGOYLE.LIFE[1] - GARGOYLE.LIFE[0]),
        });
    }
    return out;
}

/**
 * The strikes of the storm: `[time (s from the start), near (a living target near the point?), seed]` — the host draws,
 * every computer sees the same bolts. At most BOLTS, from the release on.
 */
export function boltPlan(seed, count = GARGOYLE.BOLTS) {
    const r = rng(seed ^ 0xb017);
    const out = [];
    let t = GARGOYLE.FIRE_T + GARGOYLE.BOLT_FIRST;
    for (let i = 0; i < count; i++) {
        if (t >= GARGOYLE.STORM_T - 6) break;
        out.push({ t, near: r() < GARGOYLE.BOLT_NEAR, seed: Math.floor(r() * 1e9) });
        t += GARGOYLE.BOLT_GAP[0] + r() * (GARGOYLE.BOLT_GAP[1] - GARGOYLE.BOLT_GAP[0]);
    }
    return out;
}

/** A point in the circle of radius `R` round (0,0): even by area, from a seed in 0…1 twice. */
export function inDisc(u, v, R) {
    const a = u * Math.PI * 2, d = Math.sqrt(v) * R;
    return { x: Math.cos(a) * d, z: Math.sin(a) * d };
}

// ======================================================================= whom they hunt
/** Kinds of victims by the name the systems use. */
export const ENEMIES = Object.freeze(['player', 'villager', 'animal', 'zombie', 'sailor']);

/** Cannot be a victim: dragons, the spider, the Ice Castle, living trees, birds (see TARGETS.creatures). */
export const IGNORED = Object.freeze(['dragon', 'spider', 'ice', 'tree', 'book', 'phoenix', 'owl', 'gargoyle']);

/** A victim of kind `k` is hunted now? `isSummoner`: it is the one who drew the pentagram. */
export function mayHunt(k, { isSummoner = false, age = 0 } = {}) {
    if (!ENEMIES.includes(k)) return false;
    return !(isSummoner && sparesSummoner(age));
}

/** Damage of one bite / claw to a victim of kind `k`. `u`: a number in 0…1. */
export function biteDamage(k, u = 0.5) {
    const d = GARGOYLE.BITE[0] + u * (GARGOYLE.BITE[1] - GARGOYLE.BITE[0]);
    const x = k === 'animal' || k === 'zombie' ? GARGOYLE.BEAST_DMG : 1;
    return Math.round(d * x * 10) / 10;
}

/** Kinds of harm that are fire (a hellish creature: they do nothing), cold (they slow it). */
export const FIRE_KINDS = new Set(['Inferno', 'InfernoMaxima', 'Fire', 'FireMaxima', 'Hellfire', 'fire', 'burn', 'flame', 'Burning', 'Lava', 'lava', 'Ritual', 'Pentagram']);
export const COLD_KINDS = new Set(['Ice', 'IceDuel', 'Frozen', 'Snow', 'cold', 'chill', 'freeze', 'FreezeRay', 'IceTrap']);
/** Shields the stone: a blow / arrow loses a little. */
export const BLOW_FACTOR = { melee: 1, punch: 0.8, arrow: 0.6, crush: 1.2, blade: 1, fist: 0.8 };

/**
 * ON WHAT AND ON WHOM (CLAUDE.md «На кого и на что»): what every harm does to a gargoyle (`does`) and why; and what the
 * gargoyle does to every creature and thing.
 */
export const TARGETS = {
    // ---- blows and things: a stone body — hurt, but less than flesh
    blade: { does: 'hit', why: 'меч, топор: камень отбивает часть удара (×1), горгулья не отлетает' },
    fist: { does: 'hit', why: 'кулак: ×0,8 — каменная кожа; рука болит, горгулья — нет' },
    arrow: { does: 'hit', why: 'стрела: ×0,6, скользит по камню' },
    cauldron: { does: 'hit', why: 'упавший котёл, падающий камень: ×1,2, дробит' },
    // ---- the simple spells (known without a scroll)
    plainSpells: { does: 'hit', why: 'простые заклинания (Бомбардо и заряды дуэли): камень берут слабо — столько, сколько урона у заклинания, без добавок' },
    Stupefy: { does: 'hit', why: '«Остолбеней»: −6 — камень не оглушить, но трескается' },
    Jolt: { does: 'hit', why: '«Джолт»: −8, толчок' },
    Expelliarmus: { does: 'none', why: 'в когтях ничего нет — не действует' },
    Disarmor: { does: 'none', why: 'на каменной шкуре нечего снять — не действует' },
    SapiraDuel: { does: 'none', why: '«Сапира»: не действует (камень)' },
    SandsDuel: { does: 'none', why: '«Даст»: песок в камне — не действует' },
    LevitateDuel: { does: 'none', why: 'вырывается из невидимой руки — не действует' },
    Bombardo: { does: 'hit', why: '«Бомбардо» и пушки: взрыв дробит камень — полный урон, толчок' },
    BombardoMaxima: { does: 'hit', why: '«Бомбардо Максима»: полный урон (×2)' },
    Inferno: { does: 'immune', why: 'огонь «Инферно», «Fire», «Fire Maxima», «Hellfire»: горгулья — адская, огонь её не берёт' },
    Hellfire: { does: 'immune', why: '«Let the Hellfire Come»: свой огонь — не берёт' },
    FireMaxima: { does: 'immune', why: 'адская — огонь не берёт' },
    Burning: { does: 'immune', why: 'горящий дом, дерево, лава — не загорается, не получает урона' },
    Ice: { does: 'slow', why: 'холод («Ice», «Frozen», снег, ледяные ловушки): замедляет вдвое на 5 с, урона нет, не замораживает' },
    Wind: { does: 'push', why: '«Вайнд»: отбрасывает как всякое существо (устойчивость 20–30), урона нет' },
    Earthquake: { does: 'none', why: 'в воздухе не касается; на земле вспархивает' },
    Levitation: { does: 'none', why: '«Левиоса» не удерживает — вырывается и летит дальше' },
    WaterVortex: { does: 'push', why: 'вода толкает, урона нет (камень не тонет, не боится воды)' },
    WaterStorm: { does: 'push', why: 'водяная буря, волна: толкает' },
    CircleAttack: { does: 'hit', why: '«Circle Attack»: урон по зоне и толчок' },
    Firefighting: { does: 'none', why: 'не действует' },
    Liquidation: { does: 'hit', why: '«Liquidation»: обычный урон' },
    Brainrot: { does: 'none', why: '«Брейнрот»: горгульи подчиняются пентаграмме, не заклинателю — не действует' },
    Drawdown: { does: 'none', why: 'в воздухе не касается' },
    Stitching: { does: 'none', why: 'не касается' },
    CreateBridge: { does: 'none', why: 'не касается' },
    Groundprud: { does: 'none', why: 'не касается' },
    GroundVortex: { does: 'hit', why: '«Ground Vortex»: летящие блоки бьют, залп −3 и толчок' },
    VisibleGodi: { does: 'none', why: 'тучка только на экране колдующего' },
    Fireworks: { does: 'none', why: 'искры высоко над головой' },
    Invisibility: { does: 'blind', why: 'невидимого игрока не замечает, пока рядом не коснётся (как Дракон)' },
    Alohomora: { does: 'none', why: 'живое существо без замков' },
    Lock: { does: 'none', why: 'запирает только двери' },
    Accio: { does: 'none', why: 'живое существо не притянуть' },
    Rescue: { does: 'none', why: 'не лечит камень' },
    Imperius: { does: 'maxima', why: '«Империус Максима»: вселиться в горгулью можно (магическое существо, полёт); обычный «Империус» — нет' },
    Protection: { does: 'blocked', why: '«Protection» держит укус и когти (щит впереди, купол вокруг); горгулья отлетает' },
    ProtectionHouse: { does: 'push', why: 'сфера защиты дома не пускает внутрь' },
    // ---- the scroll's spells
    scrollSpells: { does: 'hit', why: 'заклинания со свитка: урон как обычно' },
    AvadaKedavra: { does: 'none', why: '«Авада Кедавра» убивает живое: горгулья — камень и адское пламя, не живая — как на живое дерево не действует (вспышка)' },
    Accentric: { does: 'hit', why: '−40 за 8 с — насмерть' },
    Pilbidrio: { does: 'hit', why: '−80 — разрывает' },
    Electrum: { does: 'hit', why: 'удар тока: насмерть' },
    Die: { does: 'kill', why: '«Дай»: чёрный луч богов — рассыпается в пыль' },
    Lightning: { does: 'hit', why: 'молния со свитка: −20 (молнии самой бури ритуала их не бьют — свои)' },
    Thunderwave: { does: 'hit', why: 'громовая волна: −8' },
    TotalDestruction: { does: 'hit', why: 'взрыв: насмерть' },
    Inspirius: { does: 'hit', why: '«Inspirius»: −100 / −50 / −25 — насмерть' },
    WindImpulse: { does: 'push', why: 'отбрасывает волной воздуха' },
    LevitationMaxima: { does: 'none', why: 'не держит — улетает' },
    Boom: { does: 'kill', why: '«Бум» и все заклинания богов (ProtectionGods.isDivine): горгулья разбивается на камни — в зоне насмерть' },
    divine: { does: 'kill', why: 'любое заклинание богов (свитки храма, «Flying Maxima»): рассыпается в камни и угли' },
    // ---- creatures it meets (what IT does)
    players: { does: 'hunt', why: 'охотится на игроков; призывателя не трогает первые 20 с (GRACE), потом нападает и на него' },
    zombies: { does: 'hunt', why: 'бьёт зомби (×1,4) — всех подряд' },
    castlePeople: { does: 'hunt', why: 'жители, рыцари, волшебники, торговцы: бросается и рвёт; рыцари и стража отбиваются мечом, остальные бегут (alarm «monster»)' },
    animals: { does: 'hunt', why: 'зверей бьёт (×1,4): лошади, свиньи, коровы, бараны' },
    sailors: { does: 'hunt', why: 'моряков и скелетов Чёрных Усов бьёт; в корабли не врезается' },
    creatures: { does: 'ignore', why: 'драконы, паучиха, Ледяная Королева и её слуги, живые деревья, книги-птицы, совы и фениксы — не трогает (они не «всех подряд»: боссы и птицы сами по себе)' },
    // ---- the world
    world: { does: 'none', why: 'не ломает постройки; летит над землёй, не сквозь стены; прилетает к людям внутри только до двери' },
    ships: { does: 'none', why: 'над палубой летает как над землёй, в корпус не врезается' },
    space: { does: 'none', why: 'пентаграмму рисуют на Земле; в космос и на другие планеты не гонятся (realmAt)' },
};

/**
 * What a harm of kind `kind` and strength `dmg` does to a gargoyle: `{does, dmg, slow}` — `does` 'hit' (dmg taken), 'kill'
 * (shattered), 'immune' (nothing: fire), 'slow' (cold: no damage, slowed), 'push', 'none'. Pure (tests).
 */
export function harmOf(kind, dmg = 0) {
    dmg = Math.max(0, +dmg || 0);
    const k = String(kind || '');
    if (isDivine(k) || TARGETS[k]?.does === 'kill') return { does: 'kill', dmg: 1e9, slow: 0 };
    if (FIRE_KINDS.has(k)) return { does: 'immune', dmg: 0, slow: 0 };
    if (COLD_KINDS.has(k)) return { does: 'slow', dmg: 0, slow: 5 };
    if (k === 'AvadaKedavra') return { does: 'none', dmg: 0, slow: 0 };
    const row = TARGETS[k];
    if (row && (row.does === 'none' || row.does === 'blind')) return { does: 'none', dmg: 0, slow: 0 };
    if (row && row.does === 'push') return { does: 'push', dmg: Math.min(dmg, 0), slow: 0 };
    const f = BLOW_FACTOR[k] ?? 1;
    return { does: dmg > 0 ? 'hit' : 'none', dmg: Math.round(dmg * f * 10) / 10, slow: 0 };
}

/** Is the world's count at the limit? */
export const atLimit = (count) => count >= GARGOYLE.MAX;

/** How many may a new ritual bring when `existing` are alive (never above MAX). */
export const roomFor = (existing, n = GARGOYLE.COUNT) => Math.max(0, Math.min(n, GARGOYLE.MAX - existing));

/** Is the gargoyle's time up? */
export const expired = (age, life) => age >= life;

/** A gargoyle too far from its pentagram turns back. */
export const outOfLeash = (d) => d > GARGOYLE.LEASH;

// ----------------------------------------------------------------- пентаграмма
const starPts = (() => { // a five-point star drawn in one stroke, a point DOWN (inverted), radius 0.78
    const out = [];
    for (let k = 0; k < 5; k++) { const a = Math.PI / 2 + k * 4 * Math.PI / 5; out.push([+(Math.cos(a) * 0.78).toFixed(3), +(-Math.sin(a) * 0.78).toFixed(3)]); }
    out.push(out[0]);
    return out;
})();

/**
 * The drawing for the table PENTAGRAMS (figures in units of the radius R, the centre 0,0): a circle, an INVERTED five-point star
 * in it (a point down), two horns curving up out of the top of the circle and a wing's notch each side — unlike the devil-power star
 * (upright), the teleport, life, armour, enchant and the other pentagrams.
 */
export const GARGOYLE_DRAW = [
    { t: 'circle', r: 1 },
    { t: 'poly', pts: starPts },
    { t: 'poly', pts: [[-0.42, -0.9], [-0.62, -1.22], [-0.9, -1.38], [-0.8, -1.14], [-0.66, -0.98]] }, // the left horn
    { t: 'poly', pts: [[0.42, -0.9], [0.62, -1.22], [0.9, -1.38], [0.8, -1.14], [0.66, -0.98]] }, // the right horn
    { t: 'poly', pts: [[-1.0, 0.1], [-1.28, 0.28], [-1.12, 0.46], [-1.0, 0.36]] }, // a wing's tip, left
    { t: 'poly', pts: [[1.0, 0.1], [1.28, 0.28], [1.12, 0.46], [1.0, 0.36]] },
];

/** The entry for the table `PENTAGRAMS` (`Pentagram*.js` picks it up by id): a black mage's, hell-red; the use starts the ritual. */
export const GARGOYLE_PENTAGRAM = {
    id: 'gargoyles', dark: true, glow: 0xff2a10, gold: 0xff7a2a,
    ru: 'Пентаграмма адских горгулий', radius: GARGOYLE.CIRCLE_R, draw: GARGOYLE_DRAW,
    cost: GARGOYLE.MANA, permanent: false, scroll: 'GargoylePentagram',
    /** Called on the drawer's computer when the picture is good: pays and begins (not enough mana: nothing happens, the picture stays). */
    use(game, { center, by } = {}) { return game.gargoyles?.startRitual(center, { by }); },
};
