/**
 * DragonMind.js — the fighting mind of a dragon: when it flies and when it SITS and fights (pure: no THREE, no game).
 *
 * The author: «Драконы не обязательно должны постоянно летать. Они могут летать, улетать, пикировать. Но если они сражаются,
 * особенно с НАЗЕМНОЙ целью, они должны как-то и СИДЯ атаковать, кусать и так далее.»
 *
 * The posture (`air` / `ground`) and the way between them (the table below; the code is Dragons.js):
 *
 *   sleeps on its hoard → noticed / offended → rises (a run-up, wing-beats, a climb) → circles / dives (fire from the dive, a talon pass)
 *   → LANDS by the target (a shock wave, dust, a shove) → fights on its feet (bite, claws, tail, wing gust, short fire, a roar)
 *   → … takes off again when the target is far / in the air / high up on a tower or a deck, when there are many of them, when it is
 *   hurt (≤ 30 % — it flies away to its lair or far off, once; then it fights to the end), when it is tired (stamina);
 *   after the fight it flies home and sleeps.
 *
 * Hysteresis: a posture is kept at least MIN_AIR / MIN_GROUND seconds (no take-off — landing — take-off) — only a «must» (hurt, the
 * target gone, nowhere to stand) breaks it. Distances are in the dragon's own `size` (the model's scale: ~1.25 for a common one).
 */
import { FACE } from './FaceTarget.js';

const DEG = Math.PI / 180;

export const MIND = {
    MIN_AIR: 7, // s in the air before it may land again
    MIN_GROUND: 8, // s on its feet before it may take off again
    LAND_NEAR: 34, // m (flat): a target on the ground this near — it lands and fights
    LEAVE_FAR: 52, // m (flat): on its feet, the target farther — it takes off after it (a gap wider than LAND_NEAR: no flicker)
    HIGH: 9, // m: a target's feet this far above the ground under it (flying, on a tower / a deck) is «high»: it stays in the air
    CROWD: 3, // players round the target (within CROWD_R): this many or more — too dangerous to sit, it stays in the air…
    CROWD_R: 28,
    CROWD_LEAVE: 4, // …and sitting, this many — it takes off
    HURT: 0.3, // hp fraction: it retreats (once)
    RETREAT_T: [16, 28], // s it keeps away
    AIR_SECS: 55, // s of flight a full stamina lasts
    REST_AT: 0.22, // stamina: below it, it lands (to rest — fighting on its feet if there is somebody)
    BACK_SECS: 20, // s on the ground to fill the stamina (sleeping: ×3)
    TIRED_SLOW: 0.65, // speed × when it is tired and cannot land
    LAND_FAIL: 10, // s it does not try to land after a failed landing (nowhere flat, too long)
    LAND_TIMEOUT: 22, // s of approach, then it gives up
    STUCK_T: 3.2, // s of no progress on foot while it needs to be nearer: it takes off over the obstacle
    LIFT_T: 1.4, // s of take-off: a crouch, the run-up, the wing-beats, the climb
    STAND_OFF: 11, // × size: where it lands from the target — far enough that the HEAD is in view, not only the neck (the author); the jaws lunge 10
};

/** The moves of the dragon on its feet (and the dive's pass in the air): reach in × size, windows in s from the move's start. */
export const MOVES = {
    // wind: s of the wind-up; hit: when the blow lands (the target is looked at THEN — a step aside dodges it); end: s till it is free; snd: when its sound
    bite: { reach: 10, face: FACE.BITE, wind: 0.38, hit: 0.38, end: 0.95, snd: 0.3, dmg: 14, push: 6, up: 3, kind: 'bite', ru: 'укус' },
    claw: { reach: 8, face: 35 * DEG, wind: 0.3, hit: 0.3, end: 0.8, snd: 0.22, dmg: 8, push: 7, up: 2, kind: 'claw', ru: 'удар когтями' },
    tail: { reach: 10, behind: 1.9, wind: 0.55, hit: 0.8, end: 1.25, snd: 0.5, dmg: 9, push: 11, up: 5, kind: 'tail', ru: 'удар хвоста' },
    gust: { reach: 13, min: 3.5, face: 60 * DEG, wind: 0.7, beats: [0.8, 1.2], end: 1.6, snd: 0.55, dmg: 3, push: 14, up: 4, kind: 'gust', ru: 'порыв крыльев' },
    roar: { wind: 0.4, hit: -1, end: 1.6, snd: 0.05, kind: 'roar', ru: 'рёв' },
    dive: { reach: 5.5, wind: 0.2, hit: 0.2, end: 0.9, snd: 0.05, dmg: 10, push: 8, up: 6, kind: 'dive', ru: 'удар когтями с пике' },
};
export const MOVE_IDS = ['bite', 'claw', 'tail', 'gust', 'roar', 'dive']; // (over the net: only ever appended)

/** The land: its shock wave when it lands (× size), and the cool-downs (s, ÷ react). */
export const LANDING = { R: 11, DMG: 6, PUSH: 9, TOSS: 4 };
export const COOL = { GUST: 8, ROAR: 25, DIVE: 5 };

/**
 * ON WHOM AND ON WHAT each move acts (the table; the code is Dragons._strike → players, DragonSmash → blocks / creatures).
 * `does`: 'hurt' | 'push' | 'break' | 'none'.
 */
export const MOVES_VS = {
    players: { does: 'hurt', why: 'укус и когти — тот, на кого дракон зол и кто перед пастью; хвост — кто сзади/сбоку; порыв и посадка — все рядом (урон считает компьютер игрока, щит Protection держит укус и хвост)' },
    villagers: { does: 'push', why: 'жители замков, рыцари, волшебники, моряки: толчок CreatureImpact от крыльев, хвоста и приземления + удар по скорости (DragonSmash); дракон на них сам не охотится' },
    animals: { does: 'push', why: 'звери и скот: толчок и удар как у жителей' },
    zombies: { does: 'hurt', why: 'зомби: удар хвоста и лап по скорости, как у «Империуса Максима»' },
    ships: { does: 'break', why: 'корпус и паруса: хвост и крылья ломают их (Ships.smash); чёрный корабль проклят — барьер вспыхивает' },
    blocks: { does: 'break', why: 'постройки: хвост, лапа, крыло и приземление ломают блоки по твёрдости (DragonSmash; земля, вода, камень гор — нет)' },
    dragons: { does: 'none', why: 'драконы друг друга не бьют' },
    spider: { does: 'push', why: 'гигантский паук, ожившие деревья: удар по скорости, толчок' },
    queen: { does: 'none', why: 'Ледяная Королева: порыв и толчок на неё не действуют (иммунитет к своему врагу — тяжёлое тело стоит как стояло); урон — как от тяжёлого удара' },
    godGifts: { does: 'none', why: 'дары богов, храм богов и заколдованный камень не ломаются (Terrain.set отказывает)' },
    wards: { does: 'none', why: 'дом под сферой защиты — удар не проходит' },
};

/** The target's «height»: 'ground' (it can stand and fight there) or 'high' (flying, on a tower, a roof, a deck). `feet`: metres above the ground under it. */
export function targetClass(feet, onWater = false) {
    if (onWater) return 'high';
    return feet > MIND.HIGH ? 'high' : 'ground';
}

/** Players round the target (flat distance ≤ CROWD_R) — how many (the target itself too). */
export function crowdAround(tp, others) {
    let n = 0;
    for (const q of others) if (Math.hypot(q.x - tp.x, q.z - tp.z) <= MIND.CROWD_R) n++;
    return n;
}

/** The stamina after `dt` s: the flight tires, the ground, the lair's sleep rest it. */
export function staminaStep(stam, flying, sleeping, dt) {
    const v = flying ? -1 / MIND.AIR_SECS : (sleeping ? 3 : 1) / MIND.BACK_SECS;
    return Math.max(0, Math.min(1, stam + v * dt));
}

/**
 * The posture's decision. c: {posture: 'air'|'ground', stay: s in it, dist: flat m to the target (null: none), cls: 'ground'|'high',
 * hp: 0…1, stam: 0…1, crowd: players round the target, canLand: a good place exists, failT: s since a failed landing (cool-down left),
 * cornered: it has fled once already, lair: the target is in its own lair's hall (it fights there on its feet anyway)}.
 * → { act: 'stay' | 'land' | 'takeoff' | 'retreat', why }
 */
export function decide(c) {
    const must = (act, why) => ({ act, why });
    if (c.hp <= MIND.HURT && !c.cornered) return must('retreat', 'ранен: улетает');
    if (c.dist == null) return c.posture === 'ground' ? must('takeoff', 'цели нет') : must('stay', 'цели нет');
    if (c.posture === 'air') {
        if (c.stay < MIND.MIN_AIR) return must('stay', 'ещё не время садиться');
        if (c.failT > 0) return must('stay', 'сесть не вышло');
        if (!c.canLand) return must('stay', 'негде сесть');
        if (c.stam < MIND.REST_AT && c.cls === 'ground') return must('land', 'устал: садится и бьёт сидя');
        if (c.cls === 'high') return must('stay', 'цель высоко');
        if (c.crowd >= MIND.CROWD) return must('stay', 'много целей: сверху безопаснее');
        if (c.dist <= MIND.LAND_NEAR) return must('land', 'цель на земле рядом');
        return must('stay', 'цель далеко');
    }
    // on its feet
    if (c.stay < MIND.MIN_GROUND) return must('stay', 'ещё не время взлетать');
    if (c.cls === 'high') return must('takeoff', 'цель в воздухе / на высоте');
    if (c.crowd >= MIND.CROWD_LEAVE) return must('takeoff', 'много целей');
    if (c.dist > MIND.LEAVE_FAR) return must('takeoff', 'цель убегает');
    return must('stay', 'бьётся');
}

/** Shall a landed dragon that «cannot land» tire? (the flight speed × while it is tired and cannot come down.) */
export const tiredK = (stam, canLand) => (stam < MIND.REST_AT && !canLand ? MIND.TIRED_SLOW : 1);

/**
 * Which move on its feet. c: {dist: flat m to the target, ang: rad (+ left / − right, 0 = straight ahead), size, blowCd, gustCd, crowd:
 * players within MOVES.gust.reach of it, last: the previous move, rnd: 0…1, breathReady: its fire is ready}.
 * → a MOVES key or null.
 */
export function pickMove(c) {
    const s = c.size || 1, a = Math.abs(c.ang), d = c.dist;
    if (c.blowCd <= 0) {
        if (d < MOVES.tail.reach * s && a > MOVES.tail.behind) return 'tail'; // (somebody beside / behind it: the tail)
        if (d < MOVES.bite.reach * s && a < MOVES.bite.face) return d < 7 * s && c.last !== 'claw' && c.rnd < 0.45 ? 'claw' : 'bite';
        if (d < MOVES.claw.reach * s && a < MOVES.claw.face) return 'claw';
    }
    if (c.gustCd <= 0 && a < MOVES.gust.face && d > MOVES.gust.min * s && d < MOVES.gust.reach * s && (c.crowd >= 2 || !c.breathReady || c.rnd < 0.5)) return 'gust';
    return null;
}

/** Is `ang` (rad) within the move's face window (the aim at the strike's moment)? */
export function aimedAt(kind, ang, dist, size = 1) {
    const M = MOVES[kind], a = Math.abs(ang);
    if (!M || M.reach == null) return false;
    if (dist > M.reach * size + 1) return false;
    if (kind === 'tail') return a > M.behind - 0.5;
    if (kind === 'gust') return a < M.face && dist > (M.min || 0) * size - 1;
    return a < (M.face || Math.PI) + 0.12;
}

/** The body's pose in a move at `t` s from its start: {lunge, claw, side, sweep, rise, mouth, lower}. `side`: +1 / −1 the way it turns. */
export function moveAnim(kind, t, side = 1) {
    const M = MOVES[kind], o = { lunge: 0, claw: 0, side, sweep: 0, rise: 0, mouth: 0, lower: 0, wingFlare: 0, beat: 0 };
    if (!M) return o;
    const wind = Math.min(1, t / M.wind), after = Math.max(0, Math.min(1, (t - M.wind) / Math.max(0.01, M.end - M.wind)));
    const strikeEnv = t < M.wind ? 0 : Math.max(0, 1 - after * after);
    switch (kind) {
        case 'bite': // the head draws back (up), then lunges down and the jaws close
            o.lunge = t < M.wind ? -0.35 * wind : -0.35 + (1.35 * Math.min(1, (t - M.wind) / 0.12)) * (1 - after * 0.9); o.mouth = t < M.wind ? wind * 0.9 : Math.max(0, 1 - (t - M.wind) * 6); o.lower = t < M.wind ? 0 : 1;
            break;
        case 'claw': // a front leg is raised, then swept down and across
            o.claw = t < M.wind ? wind : -0.4 + strikeEnv * 1.4 - after * 0.6; o.lunge = t < M.wind ? 0 : 0.25 * strikeEnv; break;
        case 'tail': // the tail cocked the other way, then swept round
            { const k = Math.max(0, Math.min(1, (t - M.wind) / 0.45)), sm = k * k * (3 - 2 * k); // (a heavy swing: slow enough for the world to feel it)
              o.sweep = (t < M.wind ? -wind * 0.5 : -0.5 + 1.4 * sm) * side * (t > M.wind + 0.45 ? Math.max(0, 1 - (t - M.wind - 0.45) / 0.5) : 1); }
            break;
        case 'gust': // it rears up, the wings go up and sweep down, twice
            o.rise = Math.min(1, t / 0.5) * (1 - after * 0.8); o.wingFlare = Math.min(1, t / 0.4); o.beat = t < M.wind ? wind : Math.cos(((t - M.wind) / (M.end - M.wind)) * Math.PI * 2 * 2);
            o.mouth = 0.3; break;
        case 'roar': // the head goes up and back, the jaws wide
            o.rise = Math.min(1, t / 0.4) * (t < 1.1 ? 1 : Math.max(0, 1 - (t - 1.1) / 0.5)); o.mouth = t > M.wind ? 1 : wind * 0.7; o.lunge = -0.5 * o.rise; break;
        case 'dive': o.claw = Math.sin(Math.min(1, t / M.end) * Math.PI); o.lunge = 0.3; break;
        default: break;
    }
    return o;
}

/** Shall the shove / hurt of the move land at this moment (in s)? Each of `beats` (or the single strike's moment) once. → how many are due now (prev → now). */
export function strikesDue(kind, prevT, t) {
    const M = MOVES[kind];
    if (!M) return 0;
    const at = M.beats || (M.hit != null && M.hit >= 0 ? [M.hit] : []);
    let n = 0;
    for (const b of at) if (prevT < b && t >= b) n++;
    return n;
}

/** A landing spot's goodness (pure; the game gives the numbers): ok when flat, dry, open above, and not on the target. */
export function spotOk(s) {
    if (!s.made || s.water) return false;
    if (Math.abs(s.surface - s.terrain) > 2.5) return false; // (a roof / a tree top / a floating island: not the ground)
    if (s.slope > 3.2) return false; // (m of height across its body's width)
    if (!s.open) return false;
    if (s.toTarget < 5) return false;
    return true;
}

/** Where to try to land: the angles round the target (rad), the nearer to the dragon's side first, and the radii (m, × size). */
export function landCandidates(fromAngle, size) {
    const out = [];
    for (const r of [MIND.STAND_OFF, MIND.STAND_OFF + 3, MIND.STAND_OFF + 6, MIND.STAND_OFF - 2]) {
        for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3]) out.push({ a: fromAngle + da, r: r * size });
    }
    return out;
}

/** A take-off's phases at `t` s: {crouch 0…1, climb 0…1 (how much of the lift), flap (wing-beat speed), spread}. */
export function liftPhase(t) {
    const T = MIND.LIFT_T;
    const crouch = t < 0.35 ? t / 0.35 : Math.max(0, 1 - (t - 0.35) / 0.25);
    const climb = t < 0.45 ? 0 : Math.min(1, (t - 0.45) / (T - 0.45));
    return { crouch, climb, flap: 5 + 3 * Math.min(1, t / 0.6), spread: Math.min(1, t / 0.5) };
}

/** A shock wave's push (m/s) at flat distance `d` from the landing, for a dragon `size` (pure; the game shoves the creatures with it). */
export function waveAt(d, size, scale = 1) {
    const R = LANDING.R * size;
    if (d >= R) return 0;
    return LANDING.PUSH * scale * (1 - d / R) * Math.max(0.6, size / 1.25);
}
