/**
 * WandererMind.js — how the people of the roads (wandering wizards, knights errant, ordinary travellers: Travelers.js) answer
 * a player who attacks them or shoots near them (pure, node-testable; CastleLife / Travelers run it).
 *
 * The author: «рыцари и волшебники-странники должны реагировать, даже если луч в них НЕ попал, но прошёл РЯДОМ… а обычные
 * путники — если на них напали, 90 % бьют в ответ; если убили кого-то — 50 на 50».
 *
 *   1. ZONES   — how far a miss passed from the body: «задело» (≤ 6 м — it counts as an attack), «рядом пролетело» (≤ 15 м),
 *                «слышно» (≤ 30 м, только громкое: взрыв, молния, Бомбардо). A wall muffles: through it only a LOUD thing is heard.
 *   2. missVerdict — knights and wizards: fight / turn and watch / search the place (the usual «лицом к цели» holds: they strike
 *                only after turning — CastleLife's fight does it).
 *   3. commonerDecide — an ordinary traveller: attacked → 90 % hit back, 10 % run; a killing seen → 50 / 50; the weak (old men,
 *                children) always run. The die is thrown ONCE per person per episode, from his id + the episode — the same on every
 *                computer — and kept for MEMORY_S seconds (no changing of mind from frame to frame).
 *   4. forget  — a threat that stays away for CALM_S seconds is over (no endless fear); a chase ends at LEASH metres.
 *
 * «Кто/что × как» (CLAUDE.md) — WANDERER_TARGETS below. The numbers live here only (the guide to the player never gives them).
 */

import { hashString } from '../core/math.js';
import { seededRng, reactLag, REACT_LEVEL } from './WizardMind.js';

export const WANDER = {
    ZONE: { HIT: 6, NEAR: 15, HEARD: 30 }, // m from the body
    FIGHT: { knight: 0.7, wizard: { 1: 0.3, 2: 0.5, 3: 0.65, 4: 0.85 } }, // a fight when the culprit is known and the shot came «near» (a wizard: the higher the rank, the likelier)
    COMMONER: { ATTACKED: 0.9, WITNESS: 0.5 }, // share who hit back: after a blow; after a killing seen
    MEMORY_S: 60, // s: the decision stays
    CALM_S: 75, // s without a threat: the fear is gone (60…90)
    LEASH: 60, // m: the chase of a commoner ends this far from the road's party / his place
    WITNESS_R: 40, // m: who sees a killing
    LOUD: new Set(['blast', 'boom', 'lightning', 'Bombardo', 'BombardoMaxima', 'Inspirius', 'Thunderwave', 'explosion']),
};

/** Road sites (WizardTowers.wanderDef): 'wander' wizards, 'errant' knights, 'folk' ordinary people. */
export const WANDER_SITES = new Set(['wander', 'errant', 'folk']);
export const isWandererSite = (siteKind) => WANDER_SITES.has(siteKind);

/** 'knight' | 'wizard' | 'commoner' | null (not a road person). */
export function wandererClass({ role, wizard = false, siteKind = null } = {}) {
    if (!isWandererSite(siteKind)) return null;
    if (role === 'knight') return 'knight';
    if (wizard) return 'wizard';
    return 'commoner';
}

export const WANDERER_TARGETS = {
    knightErrant: { does: 'miss → turn / fight', why: 'странствующий рыцарь: промах ≤ 6 м — нападение; ≤ 15 м — оборот и 70 % в бой; ≤ 30 м громкое — оборот' },
    wanderingWizard: { does: 'miss → shield, turn / fight', why: 'странник-волшебник: то же, шанс боя растёт с рангом; щит в сторону выстрела (WizardLife.answerShot), задержка по рангу (REACT_LAG)' },
    folk: { does: 'attacked → 90 % hit back; kill seen → 50/50', why: 'путники: ударили/ранили — 90 % бьют в ответ, 10 % бегут; убили своего — свидетели 50/50; слабые всегда бегут' },
    castleGuard: { does: 'old rules', why: 'стража и жители замков отвечают по старым правилам (KNIGHT_SEE, Startle)' },
    lords: { does: 'none', why: 'король и друзья короля не затронуты' },
};

// ------------------------------------------------------------------ 1. zones
/**
 * Which zone a miss at distance `d` (m from the body) is in: 'hit' | 'near' | 'heard' | null.
 * `loud`: a blast / lightning / Bombardo. `blocked`: a wall between (the line of sight is not free).
 */
export function missZone(d, { loud = false, blocked = false } = {}) {
    const Z = WANDER.ZONE;
    if (!(d >= 0)) return null;
    if (blocked) return loud && d <= Z.HEARD ? 'heard' : null; // (a wall: only a loud thing is heard through it)
    if (d <= Z.HIT) return 'hit';
    if (d <= Z.NEAR) return 'near';
    if (d <= Z.HEARD && loud) return 'heard';
    return null;
}

export const isLoud = (kind) => WANDER.LOUD.has(kind);

// ------------------------------------------------------------------ 2. knights and wizards
/** Chance of going into the fight from the «near» zone. */
export function fightChance(cls, rank = 'adept') {
    if (cls === 'knight') return WANDER.FIGHT.knight;
    if (cls === 'wizard') return WANDER.FIGHT.wizard[REACT_LEVEL[rank] || 2] ?? WANDER.FIGHT.wizard[2];
    return 0;
}

/**
 * A knight / a wizard of the road and a miss. `knows`: he saw who did it (Blame.js). `roll` 0…1 (his own die).
 * → { act: 'fight' | 'turn' | 'search' | 'none', zone }
 *   fight  — the culprit is known and it is an attack (hit zone) or the die says so (near zone);
 *   turn   — face the source, flinch, stay alert (the shield ready);
 *   search — he did not see who: look at the place it came from (a hunt: WizardMind.HUNT / investigate).
 */
export function missVerdict({ cls, rank = 'adept', zone, knows = false, roll = 0.5 }) {
    if (!zone || (cls !== 'knight' && cls !== 'wizard')) return { act: 'none', zone: zone || null };
    if (zone === 'heard') return { act: 'turn', zone };
    if (zone === 'hit') return { act: knows ? 'fight' : 'search', zone };
    // near
    if (!knows) return { act: 'search', zone };
    return { act: roll < fightChance(cls, rank) ? 'fight' : 'turn', zone };
}

/** The reaction lag of a road fighter (s): a wizard by rank, a knight like a strong one (level 3). */
export function wandererLag(cls, rank, rng = Math.random) {
    return reactLag(cls === 'knight' ? 'teacher' : rank, rng);
}

// ------------------------------------------------------------------ 3. ordinary travellers
/** A die 0…1 from the person's id and the episode: the same on every computer, and never changes. */
export function dieOf(id, episode, salt = 'w') {
    return seededRng(hashString(`${salt}|${id}|${episode}`))();
}

/** Who always runs: the old, the children, the sickly (`weak` in the data, or an elder / child look). */
export const isWeak = (v) => !!(v && (v.weak || v.elder || v.child || v.kid));

/**
 * One traveller meets an attack. `kind`: 'attacked' (he was struck / hit by a spell / hurt, not killed, or his own party was) or
 * 'witness' (he saw one of his own killed). `prev`: his memory {until, stance, n} (null: none). `now`: ms.
 * → { stance: 'attack' | 'flee', fresh: bool, mem: {...}, roll, p } — `fresh`: the die was thrown now (log it once).
 */
export function commonerDecide({ id, weak = false, kind = 'attacked', prev = null, now = 0 }) {
    if (prev && prev.until > now) {
        // (a person who runs but sees a killing now stays running; one who fights keeps fighting: no changing of mind within the memory)
        return { stance: prev.stance, fresh: false, mem: prev, roll: prev.roll, p: prev.p };
    }
    const n = (prev?.n || 0) + 1;
    const p = kind === 'witness' ? WANDER.COMMONER.WITNESS : WANDER.COMMONER.ATTACKED;
    const roll = dieOf(id, n);
    const stance = weak ? 'flee' : roll < p ? 'attack' : 'flee';
    const mem = { stance, until: now + WANDER.MEMORY_S * 1000, n, roll, p, kind, weak };
    return { stance, fresh: true, mem, roll, p };
}

// ------------------------------------------------------------------ 4. forgetting
/** Is the threat over (nothing happened for CALM_S seconds)? */
export const threatOver = (lastThreatMs, now) => now - lastThreatMs > WANDER.CALM_S * 1000;

/** Is the chase of a commoner too far (leash)? */
export const tooFar = (d) => d > WANDER.LEASH;

// ------------------------------------------------------------------ journal text («решение:»)
export function missText(name, d, zone, verdict) {
    const z = { hit: 'задело', near: 'рядом пролетело', heard: 'слышно' }[zone] || '—';
    const a = { fight: 'бой', turn: 'повернулся, насторожился', search: 'ищет, откуда прилетело', none: 'ничего' }[verdict.act] || verdict.act;
    return `странник ${name}: nearMiss ${d.toFixed(1)} м (${z}) → ${a}`;
}

export function commonerText(name, d) {
    const w = d.mem?.weak ? ' (слабый — всегда бежит)' : '';
    if (!d.fresh) return `странник ${name}: прежнее решение держится — ${d.stance === 'attack' ? 'бьёт' : 'бежит'}`;
    const what = d.mem.kind === 'witness' ? 'видел убийство' : 'нападение';
    return `странник ${name}: ${what} → ${Math.round(d.p * 100)} % атака (бросок ${d.roll.toFixed(2)} → ${d.stance === 'attack' ? 'атакует' : 'бежит'})${w}`;
}
