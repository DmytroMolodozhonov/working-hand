/**
 * WizardAI.js — who the wizards are and how they decide (pure, node-testable).
 *
 * The people of a wizards' tower (src/world/WizardTowers.js) and the wandering
 * wizards on the roads: students, teachers, the scroll seller, the Master of the
 * academy (twice as strong as a teacher: health, ward, skill, mana; casts twice
 * as fast) and the wanderers. No knights: wizards defend themselves with real
 * duel spells (src/game/Duel.js), which a player can block with «Protection» or
 * meet with a spell of their own (a beam clash).
 *
 * `decide` and `react` are pure functions of what the wizard knows; WizardLife
 * (src/game/WizardLife.js) applies what they return.
 */

import { createRng } from '../core/math.js';

export const WIZARD_ROLES = ['student', 'teacher', 'seller', 'master', 'wanderer', 'townwiz', 'mage'];

/**
 * hp, ward (magic armour: takes spells and magic blows), mana and its regen per s,
 * duel skill, the pause between casts (s), how often they react to a spell coming
 * at them and how fast, how long a stun holds them (×), their range, their spells.
 */
export const WIZ = {
    student: { hp: 12, ward: 0, mana: 30, regen: 1.0, skill: 0.8, cast: 3.2, react: 0.35, reactT: 0.7, stunK: 1.0, range: [7, 14], spells: { Stupefy: 0.5, SapiraDuel: 0.5 } },
    teacher: { hp: 16, ward: 10, mana: 40, regen: 1.5, skill: 1.0, cast: 2.2, react: 0.6, reactT: 0.45, stunK: 0.7, range: [8, 16], spells: { Stupefy: 0.25, SapiraDuel: 0.3, IceDuel: 0.2, LevitateDuel: 0.15, Jolt: 0.1 } },
    master: {
        hp: 32, ward: 20, mana: 80, regen: 3.0, skill: 2.0, cast: 1.1, react: 0.9, reactT: 0.25, stunK: 0.4, range: [10, 20],
        spells: { Stupefy: 0.2, SapiraDuel: 0.35, IceDuel: 0.2, LevitateDuel: 0.15, JoltMaxima: 0.1 }, // (the Master's «Джолт» is a «Максима»)
        dome: { hits: 3, t: 6, cd: 25 }, wind: { r: 4.5, cd: 6 }, blink: { cd: 20 }, heal: 0.25,
    },
};
// (between a student and a teacher: a senior student — «продвинутый»)
WIZ.adept = { hp: 14, ward: 5, mana: 100, regen: 1.0, skill: 0.9, cast: 2.7, react: 0.48, reactT: 0.55, stunK: 0.85, range: [7, 15], spells: { Stupefy: 0.4, SapiraDuel: 0.4, IceDuel: 0.1, Jolt: 0.1 } };
WIZ.seller = WIZ.teacher;
WIZ.wanderer = { ...WIZ.teacher, mana: 50, range: [8, 18] }; // (a wanderer has seen more: a duel won against him is worth more)
WIZ.townwiz = { ...WIZ.teacher }; // (a wizard of a settlement — WizardVillages.js: his rank decides how he fights)
WIZ.mage = WIZ.teacher; // (a wizard of a hamlet — Hamlets.js: his rank decides how he fights)

/**
 * A wizard's RANK (the author's rules): how much mana he has — and with it how strong he is in a
 * duel, how often and with what he casts. Every wizard gets his own amount: the rank's mana ±
 * `spread` (rolled from the world: always the same, on every computer). The Master — one per tower.
 *   novice  «начинающий» ≈ 50   (42–57)
 *   adept   «продвинутый» ≈ 100 (85–115)
 *   teacher «преподаватель» ≈ 200 (170–230)
 *   master  «главный мастер», the head of the tower ≈ 500 (450–550)
 * ±15 %: a novice never reaches an adept (57 < 85), an adept never a teacher (115 < 170), but two
 * of one rank still differ noticeably. The Master's ±10 %: there is one of him, he stays far above all.
 * `as`: whose fighting habits (WIZ) the rank has — the spells, the pause between casts, reactions.
 */
export const WIZ_RANKS = {
    novice: { mana: 50, spread: 0.15, as: 'student' },
    adept: { mana: 100, spread: 0.15, as: 'adept' },
    teacher: { mana: 200, spread: 0.15, as: 'teacher' },
    master: { mana: 500, spread: 0.10, as: 'master' },
    elder: { mana: 400, spread: 0.10, as: 'teacher' }, // (a settlement's strong wizard: ~400 — only the Master of a tower is stronger)
};
export const WIZ_RANK_RU = {
    novice: ['начинающий волшебник', 'начинающая волшебница'], adept: ['продвинутый волшебник', 'продвинутая волшебница'],
    teacher: ['преподаватель', 'преподавательница'], master: ['главный мастер башни', 'главный мастер башни'],
    elder: ['сильный волшебник', 'сильная волшебница'],
};

/** The rank of a tower's / a wandering wizard by his job (rng 0..1; the Master is always the master). */
export function rollRank(role, rng) {
    if (role === 'master') return 'master';
    if (role === 'teacher') return 'teacher';
    const x = rng();
    if (role === 'student') return x < 0.7 ? 'novice' : 'adept'; // (most of the tower: beginners; the older ones — adepts)
    if (role === 'seller') return x < 0.65 ? 'adept' : 'teacher';
    return x < 1 / 3 ? 'novice' : x < 2 / 3 ? 'adept' : 'teacher'; // a wanderer: anybody (never the Master: he lives in his tower)
}

/** His own mana for this rank (rng 0..1): the rank's ± its spread, a whole number. */
export function rollMana(rank, rng) {
    const R = WIZ_RANKS[rank] || WIZ_RANKS.adept;
    return Math.round(R.mana * (1 + (rng() * 2 - 1) * R.spread));
}

/** A wizard's fighting stats: his job's (WIZ) with his rank's habits, his own mana; mana back as a player's. */
export function wizardStats(role, rank, mana) {
    const R = WIZ_RANKS[rank];
    const base = WIZ[role] || WIZ.teacher;
    if (!R) return base;
    const H = WIZ[R.as];
    return { ...base, hp: H.hp, ward: H.ward, skill: H.skill, cast: H.cast, react: H.react, reactT: H.reactT, stunK: H.stunK, spells: H.spells, mana: mana ?? R.mana, regen: REGEN };
}

/** Mana back a second — the same as a player's (Combat PVP.FATIGUE_REGEN). */
export const REGEN = 1;

/**
 * «Максима» in a beam clash (as a player shouts it: 5 mana, at most once in 3 s): how readily a
 * wizard of this rank shouts it when he may — a beginner seldom, a teacher nearly always, the Master always.
 */
export const NPC_MAXIMA = { student: 0.5, adept: 0.75, teacher: 0.9, master: 1 };
export function wantsMaxima(skillRole, mana, rng = Math.random) {
    return mana >= 5 && rng() < (NPC_MAXIMA[skillRole] ?? 0.5);
}

/**
 * After a spell a wizard STANDS where he cast it (the author: «пускает и бежит — нереалистично»):
 * he holds the pose CAST_HOLD s (a random 1.5–2.5), and longer while his own charge still flies
 * (its beam is drawn from his wand: running, he would make it snake) — at most CAST_HOLD_MAX s.
 * Only then he moves: dodges, changes his place, looks for cover. A danger right at him breaks it.
 */
export const CAST_HOLD = { MIN: 1.5, MAX: 2.5, MAX_T: 4, NEAR: 2 };
export function castHold(rng = Math.random) {
    return CAST_HOLD.MIN + rng() * (CAST_HOLD.MAX - CAST_HOLD.MIN);
}
/**
 * Before EVERY spell a wizard says it (the author): «даже если знает, что на него нападают, даже если
 * видел — всё равно одна секунда»: he stands, faces the foe, the wand up and glowing, the words said
 * (too quick to hear) — about a second — and only then the charge flies. So a player has time to get
 * ready. Every rank, the Master and the wanderers too; no exception for one already on the alert.
 * GIVE_UP: s he may still wait for the shot (a turn, a clear line) before he lets it go.
 */
export const CAST_PREP = { T: 1.0, JITTER: 0.25, GIVE_UP: 3 };
export function prepTime(rng = Math.random) {
    return CAST_PREP.T + rng() * CAST_PREP.JITTER;
}

/** Is he still holding still after his cast? `held` s since the cast, `left` s of the pose left, `flying` his charge still in the air. */
export function holdsCast({ left = 0, held = 0, flying = false, fleeing = false, foeDist = Infinity }) {
    if (fleeing || foeDist < CAST_HOLD.NEAR) return false;
    if (held >= CAST_HOLD.MAX_T) return false;
    return left > 0 || flying;
}

/**
 * How far a wizard keeps from his foe in a fight (the author: «им выгоднее, чтобы я был не то чтобы
 * далеко, но не близко» — room for a real duel): within his range, from its middle to near its far
 * end — never pressing close. The foe behind a «Protection» — further still (no use walking at a
 * shield). → [lo, hi] m. (Only in a fight: talking, he comes as near as people do.)
 */
export const DUEL_BAND = { LO: 0.45, LO_SHIELD: 0.7, HI: 0.9 };
export function duelBand(range, shield = false) {
    const [r0, r1] = range;
    return [r0 + (r1 - r0) * (shield ? DUEL_BAND.LO_SHIELD : DUEL_BAND.LO), r1 * DUEL_BAND.HI];
}
/** Where in the band to stand, being `d` m away now: where he is, if that is in it; else its edge (too near — he backs off). */
export function duelDist(d, range, shield = false) {
    const [lo, hi] = duelBand(range, shield);
    return Math.min(Math.max(d, lo), hi);
}

/** Low on mana (under a third): he casts more slowly (× this pause). */
export function manaPace(mana, max) {
    return max > 0 && mana < max / 3 ? 1.6 : 1;
}

/** Mana a spell costs a wizard (the same as a player's base spell). */
export const NPC_COST = { Expelliarmus: 8, Stupefy: 12, SapiraDuel: 20, IceDuel: 10, LevitateDuel: 6, Jolt: 5, JoltMaxima: 15, AvadaKedavra: 25, Protection: 5, ProtectionMaxima: 20, Wind: 8 };

export const WIZ_ROLE_RU = {
    student: ['Ученик', 'Ученица'], teacher: ['Наставник', 'Наставница'], seller: ['Торговец свитками', 'Торговка свитками'],
    master: ['Мастер', 'Мастер'], wanderer: ['Странник', 'Странница'], townwiz: ['Волшебник', 'Волшебница'], mage: ['Волшебник', 'Волшебница'],
};

const MALE = ['Альберт', 'Бенедикт', 'Валентин', 'Гаспар', 'Дориан', 'Евстафий', 'Игнатий', 'Леонард', 'Максимилиан', 'Натаниэль', 'Освальд', 'Персиваль', 'Руфус', 'Себастьян', 'Теодор', 'Феликс', 'Финеас', 'Эразм', 'Юлиан', 'Ярополк', 'Мирослав', 'Велимир', 'Светозар', 'Остромир'];
const FEMALE = ['Аделина', 'Беатриса', 'Вивиана', 'Гвиневра', 'Изольда', 'Лукреция', 'Минерва', 'Морриган', 'Оливия', 'Пенелопа', 'Розалинда', 'Селена', 'Сибилла', 'Флора', 'Элоиза', 'Ядвига', 'Весняна', 'Злата', 'Милослава', 'Ружена'];

function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

/**
 * Who is wizard number `idx` of a tower (always the same): 0 the Master, then the
 * scroll sellers (one per counter), the teachers (at home in a cottage), the
 * students (at home in the tower's dormitory). A wandering «site»: all wanderers.
 */
export function wizardRoster(def, idx) {
    const seed = (strHash(def.id) ^ Math.imul(idx + 1, 2654435761)) >>> 0;
    const rng = createRng(seed);
    if (def.kind === 'wizvillage') return villageRoster(def, idx, seed, rng);
    const S = def.stalls.length, T = def.teachers || 0;
    const cottages = def.houses.length ? def.houses.length - 1 : 0; // (the last «house» is the tower itself)
    let role;
    if (def.kind === 'wander') role = 'wanderer';
    else if (idx === 0) role = 'master';
    else if (idx <= S) role = 'seller';
    else if (idx <= S + T) role = 'teacher';
    else role = 'student';
    let female = rng() < (role === 'student' ? 0.5 : 0.45);
    let name;
    if (role === 'master') { name = def.master || def.king; female = !!def.masterFemale; }
    else name = (female ? FEMALE : MALE)[Math.floor(rng() * (female ? FEMALE : MALE).length)];
    let home = -1;
    if (role === 'teacher' || role === 'seller') home = cottages ? (idx - 1) % cottages : -1;
    else if (role === 'student') home = def.houses.length - 1;
    else if (role === 'master') home = def.houses.length - 1;
    const stall = role === 'seller' ? idx - 1 : -1;
    const brave = rng();
    // a magic robe (ArmorTypes): the Master always, one wizard in five — a stronger wand, «Protection» more often
    const robe = role === 'master' || rng() < 0.2;
    // the rank and his own mana: from the world's seed (another world — other ranks); a roll of its
    // own, so the names, homes and robes of the towers stay as they were. Every computer rolls the same.
    const rr = createRng((seed ^ strHash('rank:' + String(def.wseed ?? ''))) >>> 0);
    const rank = rollRank(role, rr);
    const mana = rollMana(rank, rr);
    return { idx, role, female, name, home, stall, seed, brave, wizard: true, robe, rank, mana };
}

/**
 * The wizards of a settlement (WizardVillages.js), the author's rule: 60 % weak (beginners, ≈50 —
 * every seller is one of them), 35 % middling (adepts, ≈100), 5 % strong (≈400; the Master of a
 * tower, ≈500, stays the strongest of all). Number 0 is the Elder (in the town hall by day, a strong
 * one), then the sellers (one per counter), then the townsfolk, each at home in one of the houses.
 */
export const VILLAGE_RANKS = { weak: 0.6, middle: 0.35, strong: 0.05 };
export function villageRank(x) { return x < VILLAGE_RANKS.weak ? 'novice' : x < VILLAGE_RANKS.weak + VILLAGE_RANKS.middle ? 'adept' : 'elder'; }
function villageRoster(def, idx, seed, rng) {
    const S = def.stalls.length;
    const role = idx === 0 ? 'townwiz' : idx <= S ? 'seller' : 'townwiz';
    const elder = idx === 0;
    const female = elder ? false : rng() < 0.5;
    const name = elder ? def.elder || def.king : (female ? FEMALE : MALE)[Math.floor(rng() * (female ? FEMALE : MALE).length)];
    const homes = def.dwellings ?? def.houses.length;
    const home = homes > 0 ? Math.floor(rng() * homes) : -1;
    const stall = role === 'seller' ? idx - 1 : -1;
    const brave = rng();
    const rr = createRng((seed ^ strHash('rank:' + String(def.wseed ?? ''))) >>> 0);
    const rank = elder ? 'elder' : role === 'seller' ? 'novice' : villageRank(rr());
    const mana = rollMana(rank, rr);
    const robe = rank === 'elder' || rng() < 0.15;
    return { idx, role, female, name, home, stall, seed, brave, wizard: true, robe, rank, mana, elder, town: true };
}

/**
 * How strong anybody is in a beam clash — a player, a tower's wizard, a wanderer: ONE scale for all, in plain points.
 * Points = the mana he has NOW (+ the duel mastery for a player): 50 mana is 50 points for everybody; health takes
 * up to a third off (full health ×1, almost dead ×0.65); luck ±10 %. No softening: 500 against 30 is 500 against 30 —
 * the weak one does not win a duel, he wins by cunning (the author: «никаких защитных элементов»).
 */
export const HEALTH_FLOOR = 0.65;
export function duelPower(mana, hpK = 1, luck = 0) {
    const hp = HEALTH_FLOOR + (1 - HEALTH_FLOOR) * Math.max(0, Math.min(1, hpK));
    return Math.max(0, mana) * hp * (1 + luck);
}

/**
 * How big the meeting point's push is for two strengths: the share of the stronger's lead (so the ratio decides, not the
 * absolute numbers) on the clash's old scale. Equal → 0; 500 against 30 → a clear win in seconds; 100 against 50 → slow.
 */
export const CLASH_SCALE = 4;
export function strengthGap(sa, sb) {
    const t = sa + sb;
    return t > 0 ? CLASH_SCALE * (sa - sb) / t : 0;
}

/** Typical duel strength of a rank (the same scale as duelPower: full mana, full health, no luck). */
export const rankDuelPower = (rank) => duelPower((WIZ_RANKS[rank] || WIZ_RANKS.adept).mana, 1, 0);
/** The weakest possible and the strongest possible wizard's strength (a novice's least mana … the Master's most). */
export const rankDuelRange = (rank) => {
    const R = WIZ_RANKS[rank] || WIZ_RANKS.adept;
    return [duelPower(R.mana * (1 - R.spread), 1, 0), duelPower(R.mana * (1 + R.spread), 1, 0)];
};

/** A wizard's strength in a beam clash: his mana now, his health (duelPower). */
export function duelStrength(role, mana, hp, luck = 0, maxHp = null) {
    const W = WIZ[role] || WIZ.teacher;
    return duelPower(mana, Math.max(0, hp) / (maxHp || W.hp), luck);
}

/** Which duel spell to cast (a student never uses Ice, Leviosa or Avada; Avada only back at an Avada user). */
export function pickSpell(role, rng = Math.random, { foeUsedAvada = false } = {}) {
    if (role === 'master' && foeUsedAvada && rng() < 0.35) return 'AvadaKedavra';
    const W = WIZ[role] || WIZ.teacher;
    let x = rng(), last = 'Stupefy';
    for (const [name, p] of Object.entries(W.spells)) { last = name; if ((x -= p) < 0) return name; }
    return last;
}

/**
 * What a wizard does now in a fight. `input`:
 *  { role, hp, mana, brave, dist, sees, castReady, domeReady, windReady, blinkReady,
 *    incoming (charges flying at them), inClash, clashP (how well the clash goes, 0..1),
 *    foeHelpless (stunned / frozen / lifted), hurtAgo (s since this wizard was last hurt),
 *    closeT (s the foe has stayed within 3 m), spell (the one it would cast),
 *    faced (false: not turned fully to the foe yet — FaceTarget.js) }
 * → { a: 'flee'|'clash'|'giveup'|'dome'|'wind'|'blink'|'hold'|'move'|'cast'|'turn'|'wait', spell? }
 */
export function decide(input, rng = Math.random) {
    const W = WIZ[input.role] || WIZ.teacher;
    const hpK = input.hp / W.hp;
    if (input.role === 'student' && (hpK < 0.3 || input.brave < 0.55) && !input.inClash) return { a: 'flee' };
    if (input.inClash) {
        if (input.role === 'student' && input.clashP < 0.2 && input.mana < 5) return { a: 'giveup' };
        return { a: 'clash' };
    }
    if (input.role === 'master') {
        if (input.domeReady && input.mana >= NPC_COST.ProtectionMaxima && (hpK < 0.6 || input.incoming >= 2)) return { a: 'dome' };
        if (input.windReady && input.dist < W.wind.r && input.mana >= NPC_COST.Wind) return { a: 'wind' };
        if (input.blinkReady && input.closeT > 1.5) return { a: 'blink' };
    }
    // mercy: a helpless foe is not finished off (unless they just hurt this wizard)
    if (input.foeHelpless && !(input.hurtAgo < 5)) return { a: 'hold' };
    if (!input.sees || input.dist > W.range[1] || input.dist < W.range[0] * 0.5) return { a: 'move' };
    const spell = input.spell || pickSpell(input.role, rng);
    // «лицом к цели» (FaceTarget.js): from the side or with his back he first turns, then casts
    if (input.castReady && input.mana >= (NPC_COST[spell] ?? 10)) return input.faced === false ? { a: 'turn', spell } : { a: 'cast', spell };
    return { a: input.dist > W.range[1] * 0.9 ? 'move' : 'wait' };
}

/**
 * A spell flies at a wizard: counter it (a spell back — the two meet in a clash),
 * raise a shield, or (the Master) the dome. → 'counter' | 'shield' | 'dome' | null
 */
export function react({ role, mana, shieldReady = true, domeReady = false, spell = 'Stupefy', eta = 1, robe = false }, rng = Math.random) {
    const W = WIZ[role] || WIZ.teacher;
    // (a wizard in a magic robe is a better one: answers more often, and with a shield rather than a spell)
    if (rng() >= (robe ? Math.min(0.97, W.react + 0.3) : W.react)) return null;
    if (robe && shieldReady && mana >= NPC_COST.Protection && rng() < 0.5) return 'shield';
    if (role === 'master' && domeReady && mana >= NPC_COST.ProtectionMaxima && (spell === 'AvadaKedavra' || rng() < 0.3)) return 'dome';
    const counterCost = NPC_COST.Stupefy;
    if (mana >= counterCost && eta > 0.25 && rng() < 0.6) return 'counter';
    if (shieldReady && mana >= NPC_COST.Protection) return 'shield';
    return null;
}

/**
 * Can a wizard answer a charge flying at him — and how? Like a real man: only one he SEES (in front
 * or at the side of his eyes, nothing in the way — a charge from behind is never seen), and only if
 * there is time. A wizard not ready (walking, talking, at his desk, the wand down — a surprise, even
 * if he saw you) first has to understand and raise the wand: the shield comes late, the spell back
 * later still. Ready (already fighting / the tower on the alert): only his reaction time.
 *   facing  cos of the angle between where he looks and where the charge is (1 — straight ahead)
 *   sees    a free line from his eyes to the charge
 * → { seen, shield (time for the hand shield), counter (time for a spell back: a duel) }
 */
export const NOTICE = { FOV: -0.15, SURPRISE: 0.9, SEATED: 0.5, SIDE: 0.2, WAND: 0.3 };
export function noticeCharge({ facing = 1, sees = true, ready = false, seated = false, eta = 1, reactT = 0.5 }) {
    if (facing < NOTICE.FOV || !sees) return { seen: false, shield: false, counter: false };
    const t = reactT + (ready ? 0 : NOTICE.SURPRISE) + (seated ? NOTICE.SEATED : 0) + (facing < 0.5 ? NOTICE.SIDE : 0);
    return { seen: true, shield: eta > t, counter: eta > t + NOTICE.WAND };
}
