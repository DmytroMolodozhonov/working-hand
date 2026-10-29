/**
 * WizardMind.js — how a wizard (of a tower, a settlement, a hamlet, a lone wanderer) thinks in trouble (pure, node-testable).
 * The numbers and the tables the author asked for; WizardLife / WizardFight / Burning / CastleLife only run them.
 *
 *   1. REACT_LAG       — how fast he reacts to a brawl or a killing: a beginner is lost for seconds, the Master — in a blink.
 *   2. FIRE            — nearly all know «Firefighting» (80 %) and put themselves out for mana; the rest run to water.
 *   3. MAGIC_REACT     — what an attack by fire / water / ice / wind / lightning / a blast makes him do.
 *   4. chooseShield    — the hand «Protection» or the dome («Protection Maxima»): the strong ones (300+ mana) use the dome
 *                        when it is really worth it (a heavy volley, many foes, a boss), not always.
 *   5. HUNT            — the hidden «interest» in catching a criminal (GTA's stars, never shown): who hides, who searches,
 *                        how far from home, how long, where (the last known place, then the likely ways).
 *   6. SMOKE           — the stroke of the wand (from above downwards, aslant) that turns a wave of smoke aside: 3 mana, no words.
 */

import { hashString } from '../core/math.js';

/** A small deterministic generator (0..1) from a number: a wizard's own traits are the same on every computer and every day. */
export function seededRng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ 1. reaction
/** Levels of reaction by rank: 1 — junior, 2 — middle, 3 — strong, 4 — the head of the tower. */
export const REACT_LEVEL = { novice: 1, adept: 2, teacher: 3, elder: 3, master: 4 };
export const REACT_LEVEL_RU = { 1: 'младший', 2: 'средний', 3: 'сильный', 4: 'глава башни' };

/**
 * Seconds from «something happened» (a brawl, a killing, a blast) to «the wand is out, the first spell is on the way».
 * `lost`: a junior may be lost altogether (he wants to help, but doesn't understand) — that much longer.
 */
export const REACT_LAG = {
    1: { min: 2.5, max: 5.0, lost: 0.3, lostExtra: 2.5 },
    2: { min: 1.2, max: 2.4, lost: 0.1, lostExtra: 1.5 },
    3: { min: 0.5, max: 1.1, lost: 0, lostExtra: 0 },
    4: { min: 0.15, max: 0.35, lost: 0, lostExtra: 0 },
};

export const reactLevel = (rank) => REACT_LEVEL[rank] || 2;

/** The delay of one wizard (rng 0..1). → {t, lost, level} */
export function reactLag(rank, rng = Math.random) {
    const level = reactLevel(rank), R = REACT_LAG[level];
    let t = R.min + (R.max - R.min) * rng();
    const lost = R.lost > 0 && rng() < R.lost;
    if (lost) t += R.lostExtra;
    return { t: Math.round(t * 100) / 100, lost, level };
}

/** The text for the «решение:» log. */
export function reactLagText(lag) {
    return `реакция (${REACT_LEVEL_RU[lag.level]}): ${lag.t.toFixed(2)} с до палочки и первого заклинания${lag.lost ? ' — растерялся, не сразу сообразил' : ''}`;
}

// ------------------------------------------------------------------ 2. fire
export const FIRE = {
    KNOW: 0.8, // the share who know «Firefighting»
    COST: 3, // mana to put himself out
    SELF_T: [0.9, 1.6], // s: how long it takes a wizard of a level to say it (strong — quicker)
};

/** Does this wizard know «Firefighting»? (A fixed share of them, by his id — the same on every computer; the Master always.) */
export function knowsFirefighting(id, rank = 'adept') {
    if (rank === 'master') return true;
    return (hashString(String(id) + ':ff') % 1000) / 1000 < FIRE.KNOW;
}

/**
 * A wizard is burning. → {a: 'douse' | 'run', t}: puts himself out for mana (t seconds to say and do it), or — not knowing it,
 * out of mana, or the wand gone — runs (to water if there is, else away from the fire), burning on.
 */
export function onFire({ knows, mana, noWand = false, rank = 'adept' }, rng = Math.random) {
    if (!knows || noWand || mana < FIRE.COST) return { a: 'run', t: 0 };
    const lvl = reactLevel(rank);
    const [lo, hi] = FIRE.SELF_T;
    return { a: 'douse', t: Math.round((hi - (hi - lo) * ((lvl - 1) / 3) + rng() * 0.2) * 100) / 100 };
}

/** Anything but a dragon or an owl catches fire passing through a fire: how long a creature must be in the flames (s). */
export const FIRE_TOUCH = { STAND: 0.35, MOVING: 0.12, EDGE: 0.35 };

// ------------------------------------------------------------------ 3. attack → reaction
/**
 * What attacks them → what a wizard does about it. Each: `first` (at once), `then` (when it is over or he is safe).
 * Actions: 'shield' (hand Protection), 'dome' (Protection Maxima, strong only), 'run' (away, never past it), 'shelter' (behind a wall / into a
 * building), 'spread' (not into a heap with the others), 'douse' (Firefighting on himself), 'heal', 'sidestep', 'brace',
 * 'counter' (attack back at whoever is known), 'hunt' (look for the one who did it), 'watch'.
 */
export const MAGIC_REACT = {
    fire: { first: ['shelter', 'douse'], then: ['shield', 'counter'], why: 'огонь обходит щит (щит держит лишь половину) — главное уйти за стену или в здание и потушиться; потом защита и ответ' },
    hellfire: { first: ['shelter', 'spread', 'douse'], then: ['dome', 'counter'], why: 'море огня: бежать в безопасное место (за стену, в здание), не в кучу; потом защищаться и бить' },
    water: { first: ['sidestep', 'brace'], then: ['counter'], why: 'поток воды толкает: уйти с его пути боком, упереться; щит от воды не спасает' },
    ice: { first: ['shield', 'sidestep'], then: ['douse', 'counter'], why: 'ледяной заряд держит щит; замёрзшего ждёт оттаивание — потом ответ' },
    wind: { first: ['brace', 'sidestep'], then: ['shield', 'counter'], why: 'ветер сбивает с ног: пригнуться, уйти боком от удара' },
    lightning: { first: ['run', 'shelter'], then: ['shield', 'counter'], why: 'молния бьёт сверху: прочь с открытого места под крышу' },
    blast: { first: ['shield', 'sidestep'], then: ['hunt', 'counter'], why: 'взрыв: щит гасит половину (купол — три четверти), отскочить и искать, откуда прилетело' },
    quake: { first: ['run', 'spread'], then: ['watch'], why: 'земля рушится: прочь от стен и крыш, по разным сторонам' },
    storm: { first: ['shelter'], then: ['counter'], why: 'буря: под крышу' },
    curse: { first: ['shield', 'counter'], then: ['hunt'], why: 'заряд заклинания: щит или ответное заклинание' },
};

/**
 * The chosen first reaction for this wizard. sit: {kind, burning, knowsFire, mana, noWand, hpK, sheltered}
 * → an action from MAGIC_REACT[kind].first that he can do (the first possible), 'run' if none.
 */
export function reaction(sit) {
    const R = MAGIC_REACT[sit.kind] || MAGIC_REACT.curse;
    if (sit.hpK != null && sit.hpK < 0.3 && !sit.noWand && sit.mana >= 6) return 'heal';
    for (const a of R.first) {
        if (a === 'douse' && !(sit.burning && sit.knowsFire && sit.mana >= FIRE.COST && !sit.noWand)) continue;
        if (a === 'shelter' && sit.sheltered) continue;
        if ((a === 'shield' || a === 'dome') && (sit.noWand || sit.mana < 5)) continue;
        return a;
    }
    return 'run';
}

// ------------------------------------------------------------------ 4. shield
export const SHIELD = {
    MAXIMA_MANA: 300, // the strong ones: a wizard with this much mana (a settlement's strong wizard ≈ 400, the Master ≈ 500)
    HEAVY: new Set(['AvadaKedavra', 'BombardoMaxima', 'TotalDestruction', 'Boom', 'Inspirius', 'Hellfire', 'JoltMaxima', 'CircleAttack']),
    DOME: { hits: 3, t: 5, cd: 30 }, // the dome of a strong wizard who is not the Master (the Master's own is in WizardAI.WIZ)
    COST_HAND: 5, COST_DOME: 20,
};

/** May this wizard use «Protection Maxima»? (The Master always; the others with 300+ mana.) */
export const canDome = (maxMana, rank) => rank === 'master' || maxMana >= SHIELD.MAXIMA_MANA;

/**
 * The shield for this moment: 'dome' (Protection Maxima), 'hand' (Protection) or null (no mana).
 * sit: {mana, maxMana, rank, spell, incoming (charges flying at him), foes (enemies at him), boss (the foe is a boss), hpK, domeReady}
 * The dome only when it is really worth it: a heavy spell, a volley, a crowd of foes, a boss, or a bad state — and not on every shot.
 */
export function chooseShield(sit, rng = Math.random) {
    if (sit.mana < SHIELD.COST_HAND) return null;
    const strong = canDome(sit.maxMana ?? sit.mana, sit.rank);
    if (strong && sit.domeReady !== false && sit.mana >= SHIELD.COST_DOME + 6) {
        const heavy = SHIELD.HEAVY.has(sit.spell);
        const worth = heavy || (sit.incoming || 0) >= 3 || (sit.foes || 0) >= 3 || !!sit.boss || ((sit.hpK ?? 1) < 0.45 && (sit.incoming || 0) >= 1);
        if (worth && rng() < (heavy || sit.boss ? 0.95 : 0.7)) return 'dome';
    }
    return 'hand';
}

// ------------------------------------------------------------------ 5. hunt
/**
 * How the people of a place go after a criminal, by the (hidden) wanted level 0…3 (Wanted.js).
 *   leash   how far past their land the hunters follow (m)
 *   search  how long they search the last known place and the likely ways (s)
 *   share   the share of the fighters who go (the rest keep the place)
 *   guesses how many likely places they check after the last known one
 */
export const HUNT = {
    0: { leash: 30, search: 20, share: 0.25, guesses: 1 },
    1: { leash: 60, search: 45, share: 0.4, guesses: 2 },
    2: { leash: 120, search: 90, share: 0.65, guesses: 3 },
    3: { leash: 240, search: 180, share: 0.9, guesses: 4 },
};

/** Roles that are never tied to a place by a duty (a lone wizard goes after whoever shot at him). */
export const LONERS = new Set(['wanderer', 'mage', 'townwiz']);

/**
 * Does this wizard go hunting, hide, or keep his place?
 * who: {role, rank, level (wanted level), saw (he SAW the deed or the shot come), tied (the Master on his chair, a seller at his counter),
 *       timid (a beginner who does not fight), hasWand}
 * → 'hunt' | 'hide' | 'guard' | 'none'
 */
export function huntRole(who, rng = Math.random) {
    const H = HUNT[Math.max(0, Math.min(3, who.level | 0))];
    if (who.hasWand === false) return 'hide';
    if (who.timid) return 'hide';
    // a lone wizard who saw where it came from: he is the target himself, and nobody holds him at a house
    if (LONERS.has(who.role) && who.saw) return 'hunt';
    if (who.tied || who.rank === 'master') return 'guard';
    if (who.rank === 'novice' && who.level < 2) return rng() < 0.25 ? 'hunt' : 'hide'; // (a beginner hides in the houses — it is logical)
    return rng() < H.share + (who.saw ? 0.25 : 0) ? 'hunt' : 'guard';
}

/** How far from his home a hunter may be drawn (m): a lone wizard who saw it follows far, a settled one by the level. */
export function huntLeash(who) {
    const H = HUNT[Math.max(0, Math.min(3, who.level | 0))];
    if (LONERS.has(who.role) && who.saw) return Math.max(H.leash, 150);
    return H.leash;
}

/**
 * A search for a man who is out of sight. State: {x, z (the last known place), dx, dz (the way he was going, unit or 0), t, phase, picks, spots}.
 * The hunter goes to the last known place, looks round there, then checks the likely places: on along his way, then to the sides, then back
 * (a man hides behind the nearest cover). The one he never saw (an invisible hero) is not guessed at: no `start` with an unseen target.
 */
export function huntStart(known, level, now = 0) {
    const H = HUNT[Math.max(0, Math.min(3, level | 0))];
    const len = Math.hypot(known.dx || 0, known.dz || 0);
    return {
        x: known.x, z: known.z, dx: len > 0.01 ? known.dx / len : 0, dz: len > 0.01 ? known.dz / len : 0,
        t: H.search, phase: 'go', look: 0, picks: 0, max: H.guesses, spots: [], at: now,
    };
}

/** The likely next places after the last known one (a ring of candidates, the best first). */
export function huntGuess(h, from, rng = Math.random) {
    const base = h.dx || h.dz ? Math.atan2(h.dz, h.dx) : Math.atan2(h.z - from.z, h.x - from.x);
    const step = [0, 0.7, -0.7, 1.5, -1.5, Math.PI][h.picks % 6];
    const d = 14 + 10 * (h.picks % 3) + rng() * 4;
    const a = base + step;
    return { x: h.x + Math.cos(a) * d, z: h.z + Math.sin(a) * d };
}

/**
 * One step of the search. me: {x, z}; sees: he sees the target (then the hunt is over: a fight). → {a: 'go'|'look'|'give' , goal?, yaw?}
 *   go   — walk to goal; look — turn round on the spot; give — the time is out (or nothing to check)
 */
export function huntStep(h, me, sees, dt, rng = Math.random) {
    if (sees) return { a: 'found' };
    h.t -= dt;
    if (h.t <= 0) return { a: 'give' };
    if (h.phase === 'go') {
        const goal = h.spots.length ? h.spots[h.spots.length - 1] : { x: h.x, z: h.z };
        if (Math.hypot(goal.x - me.x, goal.z - me.z) < 3) { h.phase = 'look'; h.look = 3 + rng() * 2; return { a: 'look' }; }
        return { a: 'go', goal };
    }
    h.look -= dt;
    if (h.look > 0) return { a: 'look' };
    if (h.picks >= h.max) return { a: 'give' };
    const g = huntGuess(h, me, rng);
    h.picks++;
    h.spots.push(g);
    h.phase = 'go';
    return { a: 'go', goal: g };
}

// ------------------------------------------------------------------ 6. smoke
export const SMOKE = {
    COST: 3, // mana — a stroke
    MIN_SPEED: 4.5, // m/s of the wand tip
    MIN_DROP: 0.55, // the stroke goes down at least this much of its length (from above downwards)
    MIN_SIDE: 0.25, // …and aslant: at least this much of it sideways (a straight chop down does not turn smoke)
    MIN_LEN: 0.9, // m the tip travels in one stroke
    MAX_T: 0.7, // s a stroke lasts at most
    R: 9, // m: the reach of the wave of the wand
    PUSH: 7, // m/s given to the smoke at the middle of the reach
    CD: 0.6, // s between strokes
};

/**
 * The wand's tip moved by (dx, dy, dz) metres in `t` seconds. Is it the stroke «from above downwards, aslant»?
 * → null or {sx, sz (the unit way the smoke is turned: along the stroke's side), speed}.
 */
export function smokeStroke(dx, dy, dz, t) {
    if (!(t > 0) || t > SMOKE.MAX_T) return null;
    const len = Math.hypot(dx, dy, dz);
    if (len < SMOKE.MIN_LEN || len / t < SMOKE.MIN_SPEED) return null;
    const side = Math.hypot(dx, dz);
    if (-dy / len < SMOKE.MIN_DROP || side / len < SMOKE.MIN_SIDE) return null;
    return { sx: dx / side, sz: dz / side, speed: len / t };
}

/**
 * The velocity added to one puff of smoke at `d` m from the wand by a stroke (a wave, strongest in front and near,
 * nothing beyond SMOKE.R): the puff is thrown along the stroke's side and a little away and down (the wave is turned aside, driven to the ground).
 * `ax, az`: the unit way from the wand to the puff.
 */
export function smokeKick(stroke, d, ax, az, out = {}) {
    if (!stroke || d >= SMOKE.R) return null;
    const k = (1 - d / SMOKE.R) * Math.min(1.4, stroke.speed / 8);
    out.vx = (stroke.sx * 0.75 + ax * 0.25) * SMOKE.PUSH * k;
    out.vy = -0.25 * SMOKE.PUSH * k;
    out.vz = (stroke.sz * 0.75 + az * 0.25) * SMOKE.PUSH * k;
    return out;
}

/** A wizard (an NPC) sweeps a wave of smoke aside: he does it when smoke is coming at him, has 3 mana, a wand, and a free hand. */
export function npcSweeps({ smokeNear, mana, noWand, castCd, busy }) {
    return !!smokeNear && !noWand && !busy && mana >= SMOKE.COST && castCd <= 0;
}
