/**
 * TaronRules.js — the Tarons («Тароны»): rules, numbers and the «who / what» table (pure, no THREE; node-testable).
 *
 * WHO THEY ARE (the author): paunchy, fat, reddish men with horns, twice a man's size (~7 m), with a huge axe-hammer. Slow (half the
 * player's speed), a heavy tread. They are Diabolos's old servants, grown fat from idleness. They live in the camps of the underworld
 * (`hellPlan(seed).taronCamps`, 3–8 a camp), guard them, and do not chase farther than `LEASH` from the camp. 100 HP; mortal — spells and
 * blades kill them; black magic works on them too (they are not immortal).
 *
 * Their weapon: a two-handed axe-hammer — a blade on one side, a hammer on the other. The blade hits from above or aside (−22, a hard
 * shove, breaks a «Protection» shield as a strong blow), the hammer side stuns (−14 and a daze). The swing is slow and SEEN (a 0.9 s wind-up).
 *
 * NUMBERS are here once; Taron.js and TaronModel.js use them.
 */

export const TARON = {
    HP: 100,
    // ---- size (the measures of the world: the hero ≈ 3.5 m, eyes ≈ 3.4 m; a Taron is twice that)
    HEIGHT: 7.0, // m: the top of the horns (the head ≈ 6.4)
    SIZE_VAR: 0.08, // ± of the size, per Taron
    R: 1.6, // m: the body's radius for walking round (a belly 3.2 m across); BODY_R.taron
    BELLY: 3.4, // m across (the widest)
    NARROW: 5, // m: a passage narrower than this is too tight for him (he stands and waits there, swinging)
    // ---- movement: HALF the player's (the hero walks 2.5 and runs 9.75 — about 4.9 on average)
    PLAYER_SPEED: 4.9,
    SPEED_K: 0.5,
    get WALK() { return this.PLAYER_SPEED * this.SPEED_K; }, // 2.45 m/s, also when chasing (a Taron does not run)
    TREMOR_R: 15, // m: his steps shake creatures this near (CreatureImpact), a little dust and sparks of lava
    STEP_T: 0.9, // s per step (a heavy tread)
    // ---- the camp and temper
    LEASH: 70, // m from the camp's middle: he turns back
    NOTICE: 40, // m: he sees a player (a visible one) this far and guards the camp
    HOLD_GRUDGE: 30, // s: whoever hurt him is his enemy this long wherever he is within the leash
    FORGET: 6, // s without a target: back to the camp
    SHARE_R: 45, // m: a Taron that is hurt calls the camp's others (their aggro is shared — but each picks a target of its own)
    PACK: 3, // at most this many on one victim (the others look for someone else, or wait)
    CAMP: { min: 3, max: 8 },
    CAMP_R: [20, 40], // m: the camp's size
    RESPAWN_S: 15 * 60, // s of game time: an emptied camp gets +1 (never more than its `n`)
    // ---- the swing
    REACH: 9, // m: an axe-hammer plus an arm (measured from his middle)
    WIND_T: 0.9, // s: the wind-up (the arms up and back; seen and heard)
    SWING_T: 0.5, // s: the blow itself
    RECOVER_T: 0.8,
    COOL: [1.2, 2.2], // s between two swings
    BLADE: { dmg: 22, push: 12, side: 'blade' },
    HAMMER: { dmg: 14, push: 9, daze: 2.2, side: 'hammer' }, // the butt: a daze (a player cannot cast for a moment)
    HAMMER_SHARE: 0.35, // of the swings come from the hammer side
    ARC: 1.15, // rad: half of the cone in front of him that the swing covers
    SHIELD_MANA: 18, // mana a «Protection» shield loses to a blade swing (Combat.SPELL_COST.TaronBlade 36 → half); the hammer 10; it gives way when the mana is out
    BREAK_BLOCKS: 3, // blocks broken per swing at most (wood and the like; stone holds)
    // ---- his own body
    HIT_STUN: 0.25, // s: a hit does not stagger a Taron for long
    STEADY: 85, // Steadiness: a heavy body (NPC_STEADY.taron)
    LIFT_MAX: 500, // kg: Levitation Maxima can lift him (slowly)
    // ---- spoils and the achievement
    LOOT: { axe: 0.22, iron: [1, 3], stone: [0, 2], coins: [8, 30] }, // axe: a chance
    ACHIEVEMENT: { kills: 10, cells: 50 },
};

/** The creature kinds a Taron fights (a guard of his camp: whoever is not his own). */
export const ENEMY_KINDS = Object.freeze(['player', 'man', 'animal', 'zombie', 'skeleton', 'servant']);
/** Whom he never touches (the underworld's own). */
export const FRIENDS = Object.freeze(['taron', 'devil', 'gargoyle']);

/** A Taron's speed: always the player's half (a heavy tread), slower when wounded to a quarter. */
export const walkSpeed = (hpFrac = 1) => TARON.WALK * (hpFrac < 0.25 ? 0.8 : 1);

/** Does he sight this one? (`visible`: not invisible, not behind a wall, not inside a roofed house.) */
export function sees(dist, { visible = true, grudge = false } = {}) {
    if (!visible) return false;
    return dist <= (grudge ? TARON.LEASH : TARON.NOTICE);
}

/** Is a target worth chasing, from where the camp is (the leash)? */
export const withinLeash = (campDist) => campDist <= TARON.LEASH;

/** The swing he makes: 'blade' or 'hammer' by a roll 0…1. */
export const swingSide = (u) => (u < TARON.HAMMER_SHARE ? TARON.HAMMER : TARON.BLADE);

/**
 * The aggro of a camp is shared, but not as a mob: how many Tarons of those awake go for one victim.
 * → the index (0 … n−1) of the Tarons that may go for the one victim; the others wait their turn / pick another.
 */
export function packSlots(victims, n) {
    return Math.max(1, Math.min(TARON.PACK, Math.ceil(n / Math.max(1, victims))));
}

/** The swing's reach test: is the victim (at distance d, off the heading by `ang` rad) in the cone? */
export const swingHits = (d, ang) => d <= TARON.REACH && Math.abs(ang) <= TARON.ARC;

/** The damage of a swing by the victim's kind (a player: HP of a hero 20; beasts and men are cut down). */
export function swingDamage(side, kind) {
    const base = side.dmg;
    if (kind === 'player') return base;
    if (kind === 'animal' || kind === 'zombie') return base * 2; // (their HP is lower and they have no armour)
    return base * 1.5;
}

/** Camp size from a plan record: 3…8 (a plan may give `n`). */
export const campSize = (n) => Math.max(TARON.CAMP.min, Math.min(TARON.CAMP.max, Math.round(+n || TARON.CAMP.min)));

/** The camp's regrowth: an emptied camp (alive < n) gets +1 every RESPAWN_S. → the new timer and whether to spawn. */
export function respawnStep(timer, dt, alive, n) {
    if (alive >= n) return { t: 0, spawn: false };
    const t = timer + dt;
    if (t >= TARON.RESPAWN_S) return { t: 0, spawn: true };
    return { t, spawn: false };
}

/** The look of the Nth Taron: its seed → colouring, horns, size, scar, hair, axe (all from one number; the same on every computer). */
export function taronLook(seed) {
    let s = (seed >>> 0) * 2654435761 + 17;
    const r = () => { s = (s ^ (s >>> 15)) * 2246822519 >>> 0; s = (s ^ (s >>> 13)) * 3266489917 >>> 0; s ^= s >>> 16; return (s >>> 0) / 4294967296; };
    return {
        skin: [0xb8574a, 0xa84a3c, 0xc4665a, 0x9c4636, 0xb55f48][Math.floor(r() * 5)], // (reddish, a little different each)
        hornKind: Math.floor(r() * 3), // 0 short curved, 1 thick stubs, 2 wide ram-like
        size: 1 + (r() * 2 - 1) * TARON.SIZE_VAR,
        scar: Math.floor(r() * 4), // 0 none, 1 cheek, 2 brow, 3 chest
        hair: Math.floor(r() * 4), // 0 bald, 1 topknot, 2 side tufts, 3 mohawk stubble
        belly: 0.93 + r() * 0.16,
        axe: Math.floor(r() * 3), // the blade/hammer head differs a little
        garb: Math.floor(r() * 3), // 0 loincloth + straps, 1 + pauldron, 2 + iron bracers and belt plates
        tusks: r() < 0.7,
        ring: r() < 0.35, // a nose ring
    };
}

/**
 * ON WHAT AND ON WHOM (CLAUDE.md «На кого и на что»): what every harm does to a Taron.
 * does: 'hit' (damage by the table) | 'kill' | 'stun' | 'slow' | 'push' | 'none' | 'special'.
 */
export const TARGETS = {
    blade: { does: 'hit', why: 'меч, топор: обычный урон; отрубание частей — как у людей, кровь тёмная' },
    fist: { does: 'hit', why: 'кулак: ×0,4 — толстая шкура и сало' },
    arrow: { does: 'hit', why: 'стрела: обычный урон' },
    plainSpells: { does: 'hit', why: 'простые заклинания дуэли: столько, сколько урона у заряда' },
    Stupefy: { does: 'stun', why: '«Остолбеней»: оглушает на 2 с; тяжёлый — не падает' },
    Avada: { does: 'kill', why: '«Авада Кедавра»: чёрная магия на Тарона действует — он не бессмертный' },
    Expelliarmus: { does: 'special', why: '«Экспеллиармус»: топор-молот выбит из рук и падает; Тарон идёт за ним и дерётся кулаками (−8)' },
    Inferno: { does: 'hit', why: 'огонь: обычный урон, горит (шкура красная — жарче, но не иммунитет)' },
    Hellfire: { does: 'none', why: 'адский огонь: он свой в подземном мире — не действует' },
    Ice: { does: 'slow', why: 'холод: замедляет, но подземный мир греет — недолго (вода и лёд там слабы)' },
    Wind: { does: 'none', why: '«Вайнд»: устойчивость 85 — не сдвинуть' },
    WindMaxima: { does: 'push', why: '«Вайнд Максима»: сдвигает на шаг-два, не сбивает' },
    Levitation: { does: 'none', why: '«Левиоса»: слишком тяжёл — вырывается' },
    LevitationMaxima: { does: 'special', why: '«Левиоса Максима»: берёт (до 500 кг), поднимает медленно' },
    Bombardo: { does: 'hit', why: 'взрывы ранят; Максима вдвое' },
    Boom: { does: 'kill', why: '«Бум», «Инспириус», «Тотальное разрушение Максима» (заклинания богов): насмерть' },
    ImperiusMaxima: { does: 'special', why: '«Империус Максима»: берёт; простой «Империус» не берёт — ум тяжёл (IMPERIUS_TARGETS.taron.magic)' },
    Brainrot: { does: 'none', why: '«Брейнрот»: упрямый тяжёлый ум не берёт' },
    CircleAttack: { does: 'hit', why: '«Circle Attack»: обычный урон по зоне, толчка нет (устойчивость)' },
    ToTheSun: { does: 'none', why: 'в подземном мире нет солнца' },
    Liquidation: { does: 'hit', why: '«Liquidation»: обычный урон' },
    Nihilis: { does: 'none', why: '«Nihilis Atra» — против духов; Тарон из плоти' },
    Overgrown: { does: 'none', why: '«Overgrown»: не растение — не действует' },
};

/** Spell kinds → the Taron's own damage-by-kind multiplier. */
export const DMG_K = { melee: 1, fist: 0.4, punch: 0.4, arrow: 1, Bombardo: 1, BombardoMaxima: 2, Lightning: 1, crush: 1, Inferno: 1, Fire: 1 };
export const KILL_KINDS = new Set(['Avada', 'AvadaKedavra', 'Inspirius', 'TotalDestruction', 'Boom']);
export const FIRE_IMMUNE = new Set(['Hellfire', 'Lava', 'lava']);
export const COLD_KINDS = new Set(['Ice', 'IceDuel', 'Frozen', 'chill', 'cold', 'IceBall', 'Snowman']);
export const STUN_KINDS = new Set(['Stupefy']);

/** What a harm of `kind` does to `hp` (and a short verdict) — one place for Taron.hit and the tests. */
export function harmOf(kind, dmg, { frozenImmune = false } = {}) {
    if (FIRE_IMMUNE.has(kind)) return { dmg: 0, kill: false, stun: 0, slow: 0 };
    if (KILL_KINDS.has(kind)) return { dmg: TARON.HP + 1, kill: true, stun: 0, slow: 0 };
    if (STUN_KINDS.has(kind)) return { dmg: 0, kill: false, stun: 2, slow: 0 };
    if (COLD_KINDS.has(kind)) return { dmg: 0, kill: false, stun: 0, slow: frozenImmune ? 0 : 4 };
    return { dmg: Math.max(0, (+dmg || 0) * (DMG_K[kind] ?? 1)), kill: false, stun: 0, slow: 0 };
}

/** The achievement: ten Tarons killed (the hunter). */
export const hunterDone = (kills) => kills >= TARON.ACHIEVEMENT.kills;

/** The spoils of one Taron from a roll function (so the test draws many): { axe, iron, stone, coins }. */
export function lootRoll(r) {
    const span = (a) => a[0] + Math.floor(r() * (a[1] - a[0] + 1));
    return { axe: r() < TARON.LOOT.axe, iron: span(TARON.LOOT.iron), stone: span(TARON.LOOT.stone), coins: span(TARON.LOOT.coins) };
}

/** Footsteps: a step is felt as a tremor (m) — a heavy step each STEP_T of walking. */
export const stepEvery = () => TARON.STEP_T;
