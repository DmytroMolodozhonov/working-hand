/**
 * How a person moves — each in their own way (VillagerModel): a walk of their own for everybody (the
 * king's stately step, a knight's march, an old man's shuffle…), and for a wizard his own fighting
 * manner — his stance with the wand, his swing when he casts, how he strains in a duel, his shield, how
 * he ducks, what he does with the wand when idle.
 *
 * The manner comes from the person's look seed alone (the same on every computer — nothing is sent),
 * and it is all bone angles on the same model: no new shapes, no new materials.
 *
 * Angles (VillagerModel pose keys): aRX/aLX an arm up forward (0 down, π/2 ahead, π up), aRZ + the
 * right arm out to the side / aLZ − the left one out, hx − leaning forward, hy + the right shoulder
 * forward, hz a lean to the side, lL/lR a leg forward, kL/kR − a knee bent, headX + looking up. The
 * wand's own angle (from straight down toward ahead) is aRX + wrist + π — `wand()` sets the wrist for it.
 */

/** Ways to walk (the numbers: stride, steps a second, knees bent, lean, arm swing). */
export const GAITS = {
    plain:   { amp: 1, cad: 1, knee: 0, lean: 0, arm: 1 },
    stately: { amp: 0.8, cad: 0.8, knee: 0, lean: 0.05, arm: 0.25 }, // upright and slow, a hand behind the back
    brisk:   { amp: 0.9, cad: 1.35, knee: 0.05, lean: -0.14, arm: 1.3 }, // hurrying, short quick steps
    sneak:   { amp: 0.7, cad: 0.75, knee: 0.45, lean: -0.3, arm: 0.2 }, // crouched, soft steps, the hands ready
    elder:   { amp: 0.55, cad: 0.85, knee: 0.2, lean: -0.32, arm: 0.3 }, // bent, short steps (a staff to lean on)
    swagger: { amp: 1.05, cad: 0.95, knee: 0, lean: 0.03, arm: 1.4 }, // the shoulders rolling, the arms swinging wide
    march:   { amp: 1.1, cad: 1.05, knee: 0.1, lean: 0.02, arm: 1.2 }, // a soldier's step
};
/** A wizard's stance in a fight, between spells. */
export const STANCES = ['forward', 'high', 'low', 'fencer', 'guard', 'twohand'];
/** How he swings the wand when he casts. */
export const SWINGS = ['flick', 'thrust', 'chop', 'whip', 'circle'];
/** His shield: the palm out, the wand upright before the face, or leaning into it. */
export const SHIELDS = ['palm', 'wandUp', 'lean'];
/** What his hands do with the wand while nothing happens. */
export const FIDGETS = ['twirl', 'inspect', 'tap', 'still'];

const PI = Math.PI;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (x) => x * x * (3 - 2 * x);

function mix(seed, k) {
    let h = ((seed | 0) ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}
const pick = (arr, seed, k) => arr[mix(seed, k) % arr.length];

/**
 * The manner of a person (from their look). `wizard` — a wizard's look (VillagerModel WIZARD_LOOK_ROLES).
 * @returns {{gait: string, stance: string, swing: string, shield: string, fidget: string, side: number, every: number}}
 */
export function styleOf(look, wizard) {
    const s = look?.seed | 0, role = look?.role;
    let gait;
    if (look?.skeleton) gait = 'plain';
    else if (role === 'king') gait = 'stately';
    else if (role === 'knight') gait = pick(['march', 'march', 'swagger'], s, 1);
    else if (role === 'master' || role === 'teacher') gait = pick(['stately', 'stately', 'plain', 'elder'], s, 1);
    else if (role === 'wanderer') gait = pick(['elder', 'plain', 'sneak'], s, 1);
    else if (wizard) gait = pick(['plain', 'brisk', 'sneak', 'swagger', 'stately'], s, 1);
    else if (role === 'merchant') gait = pick(['plain', 'stately', 'brisk', 'swagger'], s, 1);
    else gait = pick(['plain', 'plain', 'brisk', 'swagger', 'elder'], s, 1);
    return {
        gait,
        stance: pick(STANCES, s, 2),
        swing: pick(SWINGS, s, 3),
        shield: pick(SHIELDS, s, 4),
        fidget: pick(FIDGETS, s, 5),
        side: mix(s, 6) & 1 ? 1 : -1, // (which way he ducks)
        every: 3 + (mix(s, 7) % 30) / 10, // (s between his feints in a fight)
    };
}

/** The wrist for the wand to point at angle `w` (from straight down toward ahead). */
function wand(T, w) { T.wrist = w - PI - T.aRX; }

/**
 * The walk's own manner, after the plain walk cycle has been set (VillagerModel.update). `gk` 1 at a
 * walk → 0 at a run (a run is a run for anybody); `s` sin of the step's phase.
 */
export function gaitPose(T, gait, s, gk, t, staff) {
    const G = GAITS[gait] || GAITS.plain;
    if (G === GAITS.plain || gk <= 0) return;
    const arm = lerp(1, G.arm, gk);
    T.aLX *= arm; T.aRX *= arm;
    T.kL -= G.knee * gk; T.kR -= G.knee * gk;
    T.hx += G.lean * gk;
    switch (gait) {
        case 'stately':
            T.aLX = lerp(T.aLX, -0.35, gk); T.aLZ = lerp(T.aLZ, 0.35, gk); // the left hand behind the back
            T.headX += 0.1 * gk;
            break;
        case 'brisk':
            T.headX -= 0.1 * gk;
            break;
        case 'sneak':
            T.aRX += 0.55 * gk; T.aLX += 0.45 * gk; T.aLZ -= 0.2 * gk; T.aRZ += 0.1 * gk;
            T.headX += 0.3 * gk;
            T.hy += Math.sin(t * 0.9) * 0.15 * gk; // (looking about as he goes)
            break;
        case 'elder':
            T.headX += 0.3 * gk;
            if (staff) { T.aRX = lerp(T.aRX, 0.5 + s * 0.15, gk); wand(T, PI - 0.35 + s * 0.1); } // (leaning on the staff: upright, it goes ahead with each step)
            T.aLZ += 0.15 * gk;
            break;
        case 'swagger':
            T.hy += s * 0.12 * gk; T.headZ += s * 0.05 * gk;
            T.aLZ -= 0.18 * gk; T.aRZ += 0.18 * gk;
            break;
        case 'march':
            T.headX += 0.05 * gk;
            T.lL *= 1 + 0.1 * gk; T.lR *= 1 + 0.1 * gk;
            break;
    }
}

/** A wizard's stance between spells: the wand on the foe (`aim` up/down), each in his manner. */
function stancePose(T, st, aim, t) {
    const sway = Math.sin(t * 1.6) * 0.04; // (never quite still in a fight)
    switch (st) {
        case 'high': // the wand raised over the head, pointing down at the foe
            T.aRX = 2.55; T.aRZ = -0.12; wand(T, 1.35 + aim * 0.6 + sway);
            T.aLX = 0.7; T.aLZ = 0.15;
            T.lL = 0.2; T.lR = -0.2; T.hx = 0.05; T.headX = 0.05;
            break;
        case 'low': // crouched low, a foot back, the free arm out for balance
            T.aRX = 1.15 + aim * 0.5; wand(T, PI / 2 + aim + sway);
            T.aLX = 0.55; T.aLZ = -0.75;
            T.lL = 0.5; T.kL = -0.75; T.lR = -0.5; T.kR = -0.45;
            T.hx = -0.32; T.headX = 0.28;
            break;
        case 'fencer': // side-on, the wand arm straight out, the other hand up behind like a fencer's
            T.hy = 0.55; T.headY = -0.45;
            T.aRX = PI / 2 + aim; T.aRZ = 0.4; wand(T, PI / 2 + aim + sway); // (the arm round to the foe again)
            T.aLX = -0.5; T.aLZ = -1.6;
            T.lL = -0.3; T.kL = -0.3; T.lR = 0.3; T.kR = -0.15;
            T.hx = 0.02;
            break;
        case 'guard': // the wand upright before the face, the free hand open ahead
            T.aRX = 1.85; T.aRZ = -0.45; wand(T, PI - 0.15 + sway);
            T.aLX = 1.2; T.aLZ = 0.3;
            T.lL = 0.15; T.lR = -0.25; T.kR = -0.15; T.hx = -0.05;
            break;
        case 'twohand': // both hands on the wand, held out before him
            T.aRX = 1.3 + aim * 0.6; T.aRZ = -0.32; wand(T, PI / 2 + aim + sway);
            T.aLX = 1.3 + aim * 0.6; T.aLZ = 0.48;
            T.lL = 0.25; T.lR = -0.3; T.kL = -0.15; T.kR = -0.2; T.hx = -0.1;
            break;
        default: // 'forward': the arm forward, the wand on the foe (as it always was)
            T.aRX = 1.3 + aim * 0.7; T.aRZ = 0.05; wand(T, PI / 2 + aim + sway);
            T.aLX = 0.3; T.aLZ = -0.35;
            T.lL = 0.15; T.lR = -0.15; T.hx = -0.05;
    }
}

/** The wand arm straight at where the spell goes, whatever the body's lean and turn (the charge leaves the tip that way). */
function aimArm(T, aim) {
    T.aRX = PI / 2 + aim - T.hx; T.aRZ = 0.05 + T.hy; T.wrist = -PI;
}

/** The cast's last moment: the arm straight at where the spell goes; the body and legs in his manner. */
function aimPose(T, st, aim) {
    T.aLX = 0.35; T.aLZ = -0.25; T.hx = -0.05;
    T.headX = -aim * 0.5;
    if (st === 'low') { T.lL = 0.5; T.kL = -0.7; T.lR = -0.5; T.kR = -0.4; T.hx = -0.25; T.aLZ = -0.75; T.aLX = 0.5; }
    else if (st === 'fencer') { T.hy = 0.5; T.headY = -0.4; T.aLX = -0.5; T.aLZ = -1.6; T.lL = -0.3; T.kL = -0.3; T.lR = 0.3; }
    else if (st === 'twohand') { T.aLX = PI / 2 + aim - 0.05; T.aLZ = 0.6; T.lL = 0.25; T.lR = -0.3; }
    else { T.lL = 0.2; T.lR = -0.2; }
    aimArm(T, aim);
}

/** The swing into the cast (u 0 → 1, it ends in `aimPose`). */
function swingPose(T, sw, u, aim) {
    const e = ease(u), A = PI / 2 + aim;
    switch (sw) {
        case 'thrust': // drawn back, then a lunge: the front foot forward, the body behind the wand
            T.aRX = lerp(0.5, A, e); wand(T, lerp(PI * 0.75, A, e));
            T.hy = lerp(-0.35, 0.15, e); T.hx = lerp(0.05, -0.25, e);
            T.lL = lerp(0.1, 0.6, e); T.kL = lerp(0, -0.45, e); T.lR = lerp(0, -0.4, e);
            break;
        case 'chop': // from over the head, straight down at the foe
            T.aRX = lerp(2.9, A, e); wand(T, lerp(PI + 0.5, A, e));
            T.hx = lerp(0.12, -0.22, e); T.headX = lerp(0.2, -aim * 0.5, e);
            T.kL = T.kR = lerp(0, -0.25, e);
            break;
        case 'whip': // from out at the side, across and on at the foe
            T.aRX = lerp(1.1, A, e); T.aRZ = lerp(1.25, -0.1, e); wand(T, lerp(1.2, A, e));
            T.hy = lerp(-0.45, 0.12, e);
            break;
        case 'circle': { // a circle in the air with the wand, then on at the foe
            const a = u * PI * 2;
            T.aRX = A - 0.25 + Math.cos(a) * 0.35 * (1 - e); T.aRZ = Math.sin(a) * 0.4 * (1 - e);
            T.wrist = -PI + Math.sin(a) * 0.3 * (1 - e);
            break;
        }
        default: // 'flick': a sharp flick of the wrist
            T.aRX = A; T.wrist = -PI + 0.6 * (1 - e) - 0.3 * Math.sin(e * PI);
    }
}

/**
 * A wizard's moves by the moment (VillagerModel.update, before the plain poses). Returns the pose's
 * pace (`rate`), or 0 when this moment is not his own (the plain pose for the mode then).
 * `m` the model: its style, the time since his last spell (_fightT), in his cast (_castHeld, _swingT).
 */
export function wizardPose(m, T, mode, loco, dt, t) {
    const S = m.style, aim = m.aimPitch || 0;
    if (mode === 'cast' || mode === 'shield' || mode === 'attack') m._fightT = 0;
    else m._fightT = (m._fightT ?? 99) + dt;
    const fight = m._fightT < 8;
    switch (mode) {
        case 'cast': {
            if (m.castNow) { m.castNow = false; m._flickT = 0.12; m._swingT = 0; m._castHeld = 0; }
            m._castHeld = (m._castHeld || 0) + dt;
            m._swingT = (m._swingT ?? 1) + dt;
            const u = m._swingT / 0.3;
            aimPose(T, S.stance, aim);
            if (u < 1) { swingPose(T, S.swing, u, aim); return 55; }
            // held on (a duel: the beams push): the strain — braced, leaning in, the arm shaking;
            // now and then pushed back a step and leaning in again
            const k = clamp01((m._castHeld - 0.8) / 0.6);
            if (k > 0) {
                const push = Math.max(0, Math.sin(t * 0.9 + (m.look.seed % 5)));
                const sh = Math.sin(t * 31) * 0.03 * k;
                T.lL = lerp(T.lL, 0.45, k); T.kL = lerp(T.kL, -0.55 + push * 0.2, k);
                T.lR = lerp(T.lR, -0.55 - push * 0.15, k); T.kR = lerp(T.kR, -0.2, k);
                T.hx = lerp(T.hx, -0.28 + push * 0.22, k); T.headX = lerp(T.headX, 0.1, k);
                if (S.stance === 'twohand' || S.stance === 'guard' || S.stance === 'high') { T.aLX = lerp(T.aLX, T.aRX - 0.05, k); T.aLZ = lerp(T.aLZ, 0.5, k); } // (the other hand on the wand too)
                else { T.aLX = lerp(T.aLX, -0.25, k); T.aLZ = lerp(T.aLZ, -0.7, k); } // (the other arm back for balance)
                aimArm(T, aim);
                T.aRX += sh; T.wrist += sh * 0.6; T.aRZ += Math.sin(t * 23) * 0.02 * k; // (the arm shakes with the strain)
            }
            return 30;
        }
        case 'shield':
            T.aRX = PI / 2 + aim; T.wrist = -PI;
            if (S.shield === 'wandUp') { T.aRX = 1.9; T.aRZ = -0.5; wand(T, PI - 0.1); T.aLX = 1.75; T.aLZ = 0.35; T.headX = -0.05; }
            else if (S.shield === 'lean') { T.aLX = PI / 2 + 0.22; T.aLZ = 0.15; T.lL = 0.4; T.kL = -0.45; T.lR = -0.5; T.kR = -0.15; T.hx = -0.22; T.headX = 0.15; aimArm(T, aim); }
            else { T.aLX = PI / 2; T.aLZ = 0.2; }
            return 30;
        case 'flinch':
            // a spell at him: he ducks aside (each his own side), knees bent, the wand kept up
            T.hz = 0.38 * S.side; T.hx = -0.25; T.headX = 0.2;
            T.kL = -0.75; T.kR = -0.75; T.lL = 0.3; T.lR = -0.1;
            T.aRX = 1.4; wand(T, PI / 2 + 0.1); T.aLX = 1.6; T.aLZ = -0.6;
            return 32;
        case 'idle':
            if (loco) return 0;
            if (fight) {
                // just cast: he holds his aim a moment (the charge still on its way from his wand)
                if (m._fightT < 1.1) { aimPose(T, S.stance, aim); return 20; }
                stancePose(T, S.stance, aim, t);
                // a feint now and then: the wand drawn back / a little circle, as if a spell were coming
                const f = (m._fightT % S.every) / 0.9;
                if (f < 1) {
                    const b = Math.sin(f * PI);
                    if (S.stance === 'high') { T.aRZ += Math.sin(f * PI * 2) * 0.35 * b; T.wrist += 0.4 * b; }
                    else { T.aRX -= 0.55 * b; T.wrist += 0.5 * b; T.hy -= 0.15 * b; }
                }
                return 14;
            }
            if (m.toolKind === 'wand' && S.fidget !== 'still') {
                // nothing to do: now and then something with the wand, by his habit
                // (after standing a while: the last 3 s of every 9–15 s idle)
                m._idleT = (m._idleT || 0) + dt;
                const per = 9 + ((m.look.seed >>> 0) % 7), f = (m._idleT % per - (per - 3)) / 3;
                if (f > 0.08 && f < 0.92) {
                    if (S.fidget === 'twirl') { T.aRX = 0.9; T.aRZ = -0.15 + Math.sin(t * 5) * 0.08; T.wrist = -PI + 0.6 + Math.sin(t * 9) * 0.8; }
                    else if (S.fidget === 'inspect') { T.aRX = 1.55; T.aRZ = -0.6; wand(T, PI * 0.62); T.headX = -0.22; T.aLX = 0.9; T.aLZ = 0.45; }
                    else { T.aRX = 0.85; T.aRZ = -0.4; T.aLX = 0.85; T.aLZ = 0.5; T.wrist = -1.9 + Math.max(0, Math.sin(t * 7)) * 0.45; T.headX = -0.2; } // (taps his palm with it)
                    return 9;
                }
            }
            return 0;
        case 'walk': case 'run':
            if (!fight || !loco) return 0;
            // on the move in a fight: the wand kept on the foe, not swinging
            T.aRX = 1.15 + aim * 0.5; T.aRZ = 0.05; wand(T, PI / 2 + aim * 0.8);
            T.aLX *= 0.5;
            return 28;
    }
    return 0;
}

/** Everybody standing about: the weight now on one foot, now on the other (slowly, by the person). */
export function idleShift(T, t, seed) {
    const w = Math.sin(t * 0.21 + (seed % 11));
    if (w > 0.35) { T.kR -= 0.14; T.hz -= 0.025; } else if (w < -0.35) { T.kL -= 0.14; T.hz += 0.025; }
}
