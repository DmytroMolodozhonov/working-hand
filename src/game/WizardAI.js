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

export const WIZARD_ROLES = ['student', 'teacher', 'seller', 'master', 'wanderer'];

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
WIZ.seller = WIZ.teacher;
WIZ.wanderer = { ...WIZ.teacher, mana: 50, range: [8, 18] }; // (a wanderer has seen more: a duel won against him is worth more)

/** Mana a spell costs a wizard (the same as a player's base spell). */
export const NPC_COST = { Stupefy: 12, SapiraDuel: 20, IceDuel: 10, LevitateDuel: 6, Jolt: 5, JoltMaxima: 15, AvadaKedavra: 25, Protection: 5, ProtectionMaxima: 20, Wind: 8 };

export const WIZ_ROLE_RU = {
    student: ['Ученик', 'Ученица'], teacher: ['Наставник', 'Наставница'], seller: ['Торговец свитками', 'Торговка свитками'],
    master: ['Мастер', 'Мастер'], wanderer: ['Странник', 'Странница'],
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
    return { idx, role, female, name, home, stall, seed, brave, wizard: true, robe };
}

/** How strong a wizard is in a beam clash (the same scale as a player's). */
export function duelStrength(role, mana, hp, luck = 0) {
    const W = WIZ[role] || WIZ.teacher;
    return W.skill * (Math.max(0, mana) / W.mana) + 0.35 * (Math.max(0, hp) / W.hp) + luck;
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
 *    closeT (s the foe has stayed within 3 m), spell (the one it would cast) }
 * → { a: 'flee'|'clash'|'giveup'|'dome'|'wind'|'blink'|'hold'|'move'|'cast'|'wait', spell? }
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
    if (input.castReady && input.mana >= (NPC_COST[spell] ?? 10)) return { a: 'cast', spell };
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
