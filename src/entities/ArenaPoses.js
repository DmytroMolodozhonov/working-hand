/**
 * ArenaPoses.js — how the wizards try at the arena (src/game/ArenaDuels.js; the author: «волшебники должны
 * стараться — до 12 разных анимаций, как они стараются победить»), and the crowd on the stands.
 *
 * Every pose is a set of joint targets for VillagerModel (the same keys as its own modes: hx the body's
 * lean, headX/headY, the arms aLX/aLZ, aRX/aRZ, the wrist, the legs lL/lR and knees kL/kR, bounce); the
 * wand arm follows `aim` (the pitch to the opponent) in every casting pose, so the charge leaves where
 * the wand points. `flick`: the moment a spell leaves the wand.
 */

/** The twelve efforts of a duellist (VillagerModel modes). */
export const DUEL_EFFORTS = ['lunge', 'overhead', 'sweep', 'spin', 'push', 'strain', 'dodge', 'guard', 'flourish', 'winded', 'stagger', 'triumph'];
/** The crowd and the one who lost. */
export const ARENA_CROWD = ['sitCheer', 'sad'];
export const ARENA_MODES = [...DUEL_EFFORTS, ...ARENA_CROWD];
/** Efforts that cast (the wand arm on the aim): the spell is said in one of them. */
export const CAST_EFFORTS = ['lunge', 'overhead', 'sweep', 'spin'];

const HALF_PI = Math.PI / 2;

/** Joint targets of an arena pose into T (VillagerModel's targets). Returns the smoothing rate. */
export function arenaPose(T, mode, t, aim = 0, flick = false) {
    const arm = HALF_PI + aim; // (the wand arm straight at the opponent)
    const fl = flick ? 0.3 : 0;
    switch (mode) {
        case 'lunge': // a deep step in with the cast: the front knee bent, the free arm back for balance
            T.lL = 0.65; T.kL = -0.55; T.lR = -0.45; T.kR = -0.1;
            T.hx = -0.28; T.headX = -aim * 0.5 - 0.05;
            T.aRX = arm; T.aRZ = 0.05; T.wrist = -Math.PI - fl;
            T.aLX = -0.7; T.aLZ = -0.35;
            return 30;
        case 'overhead': { // the wand brought down from over the head (the spell flies at the bottom of the swing)
            const up = Math.max(0, Math.sin(t * 3.2)) * 0.9;
            T.aRX = arm + up; T.aRZ = -0.1; T.wrist = -Math.PI + 0.3 * up - fl;
            T.hx = -0.1 + up * 0.15; T.headX = -aim * 0.5 - 0.1;
            T.aLX = 0.5; T.aLZ = -0.5;
            T.lL = 0.25; T.kL = -0.25; T.lR = -0.2;
            return 24;
        }
        case 'sweep': { // low, from the side across: knees bent, the wand swinging level
            const s = Math.sin(t * 4.5);
            T.kL = -0.55; T.kR = -0.55; T.lL = 0.35; T.lR = 0.25;
            T.hx = -0.32; T.hy = -0.2 * s;
            T.aRX = arm - 0.25; T.aRZ = 0.55 * s; T.wrist = -Math.PI - fl;
            T.aLX = 0.3; T.aLZ = -0.8;
            T.headX = -aim * 0.4;
            return 26;
        }
        case 'spin': { // a turn of the body and a twirl of the wand, then the cast
            const a = t * 7;
            T.hy = 0.35 * Math.sin(t * 2.4);
            T.aRX = arm + 0.22 * Math.sin(a); T.aRZ = 0.22 * Math.cos(a); T.wrist = -Math.PI + 0.25 * Math.sin(a * 1.3) - fl;
            T.aLX = 0.9; T.aLZ = -0.9;
            T.lL = 0.3; T.lR = -0.3; T.kL = -0.3;
            T.headX = -aim * 0.5;
            return 28;
        }
        case 'push': { // in the clash of the beams: the free hand on the wand arm, legs braced, shaking with the strain
            const sh = Math.sin(t * 38) * 0.035;
            T.aRX = arm + sh; T.aRZ = 0.04; T.wrist = -Math.PI;
            T.aLX = arm - 0.15 + sh; T.aLZ = 0.38;
            T.lL = 0.45; T.kL = -0.6; T.lR = -0.55; T.kR = -0.2;
            T.hx = -0.22; T.headX = -aim * 0.5 + 0.1;
            return 34;
        }
        case 'strain': { // losing the clash: leaning back, knees deep, the free arm out to keep the feet
            const sh = Math.sin(t * 31) * 0.05;
            T.aRX = arm + sh; T.wrist = -Math.PI;
            T.aLX = 0.9; T.aLZ = -0.75;
            T.kL = -0.95; T.kR = -0.85; T.lL = 0.55; T.lR = 0.2;
            T.hx = 0.22; T.headX = -aim * 0.4 - 0.15;
            return 30;
        }
        case 'dodge': // a quick step aside, ducked: an arm out for balance
            T.kL = -0.95; T.kR = -0.35; T.lL = 0.35; T.lR = -0.15;
            T.hx = -0.42; T.headX = 0.2;
            T.aLX = 1.25; T.aLZ = -0.95;
            T.aRX = 1.0; T.aRZ = 0.35; T.wrist = -Math.PI + 0.4;
            return 32;
        case 'guard': // the free hand up before him (the shield of light), the wand ready
            T.aLX = HALF_PI + 0.1; T.aLZ = 0.22;
            T.aRX = arm - 0.3; T.aRZ = 0.12; T.wrist = -Math.PI + 0.2;
            T.kL = -0.28; T.kR = -0.28; T.lL = 0.2; T.lR = -0.15;
            T.hx = -0.12;
            return 28;
        case 'flourish': // a challenge: the wand twirled up high, the chin up
            T.aRX = 2.2 + 0.3 * Math.sin(t * 6); T.aRZ = -0.4 + 0.2 * Math.cos(t * 6); T.wrist = -Math.PI + 0.5 * Math.sin(t * 9);
            T.aLX = 0.2; T.aLZ = -0.45;
            T.headX = -0.2; T.hx = 0.06;
            return 18;
        case 'winded': { // out of breath: hands on the knees, the back heaving
            const b = Math.sin(t * 5);
            T.hx = -0.62 + b * 0.04; T.headX = -0.35;
            T.aLX = 0.95; T.aRX = 0.95; T.aLZ = -0.12; T.aRZ = 0.12; T.wrist = -0.9;
            T.kL = -0.38; T.kR = -0.38; T.lL = 0.3; T.lR = 0.3;
            return 12;
        }
        case 'stagger': { // struck and reeling: thrown back, arms flung out
            const w = Math.sin(t * 9) * 0.15;
            T.hx = 0.38; T.headX = -0.35 + w;
            T.aLX = 1.5; T.aLZ = -1.0; T.aRX = 1.3; T.aRZ = 0.95; T.wrist = -Math.PI + 0.6;
            T.lL = -0.35; T.kL = -0.2; T.lR = 0.25; T.kR = -0.5;
            return 26;
        }
        case 'triumph': // won: the wand thrust high, the other fist up, a little bounce
            T.aRX = 3.0; T.aRZ = -0.1; T.wrist = -Math.PI;
            T.aLX = 2.6 + Math.sin(t * 7) * 0.15; T.aLZ = -0.3;
            T.headX = -0.25; T.bounce = Math.abs(Math.sin(t * 6)) * 0.22;
            return 22;
        case 'sitCheer': // on the stands: sitting, the arms up and waving, bouncing on the seat
            T.lL = T.lR = HALF_PI; T.kL = T.kR = -HALF_PI;
            T.aLX = 2.7 + Math.sin(t * 8) * 0.25; T.aRX = 2.7 - Math.sin(t * 8) * 0.25;
            T.aLZ = -0.4; T.aRZ = 0.4; T.headX = -0.15;
            T.bounce = Math.abs(Math.sin(t * 6)) * 0.12;
            return 22;
        case 'sad': // lost: the head down, the shoulders dropped, slow steps
            T.headX = 0.55; T.hx = -0.15;
            T.aLX = 0.05; T.aRX = 0.05; T.aLZ = -0.02; T.aRZ = 0.02; T.wrist = -0.2;
            return 8;
        default: return 10;
    }
}
