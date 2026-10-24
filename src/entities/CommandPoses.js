/**
 * CommandPoses.js — the body's answers to «присядь», «отдай честь», «станцуй», «помаши», «кивни», «смейся», «обними»
 * (src/ai/TalkCommands.js; carried out by src/game/VillagerCommands.js).
 *
 * Every pose is a set of joint targets for VillagerModel (the same keys as its own modes: hx the body's lean, hy its
 * twist, headX/headY/headZ, the arms aLX/aLZ and aRX/aRY/aRZ (0 hangs, π/2 forward, π up), the wrist, the legs lL/lR and
 * knees kL/kR, bounce). The pelvis follows the legs by itself, so a crouch lowers the whole body. Pure: no THREE.
 */

export const COMMAND_MODES = ['crouch', 'salute', 'wave', 'nod', 'dance', 'laugh', 'hug', 'attn'];

/** Joint targets of a command pose into T. Returns the smoothing rate (or 0: not mine). */
export function commandPose(T, mode, t) {
    switch (mode) {
        case 'crouch': // down on the haunches, the forearms on the knees, the head up
            T.lL = T.lR = 1.2; T.kL = T.kR = -2.15;
            T.hx = 0.5; T.headX = -0.45;
            T.aLX = 0.95; T.aRX = 0.85; T.aLZ = -0.12; T.aRZ = 0.12;
            return 14;
        case 'salute': // the right hand to the brow, the back straight, the chin up
            T.aRX = 2.75; T.aRZ = 0.42; T.wrist = -0.2;
            T.aLX = 0.02; T.aLZ = -0.05;
            T.hx = -0.07; T.headX = -0.08;
            T.lL = 0.03; T.lR = -0.03;
            return 16;
        case 'wave': { // the right arm up, the hand swinging from side to side; a smile in the head
            const s = Math.sin(t * 8);
            T.aRX = 2.85; T.aRZ = 0.55 + s * 0.38; T.wrist = -0.6 + s * 0.3;
            T.headX = -0.05; T.headZ = s * 0.06; T.hx = -0.03;
            return 14;
        }
        case 'nod': { // a few deep nods of the head
            const k = Math.abs(Math.sin(t * 6.5));
            T.headX = 0.12 + k * 0.32; T.hx = k * 0.05;
            return 22;
        }
        case 'dance': { // hops from foot to foot, the arms swinging, the body twisting with the beat
            const b = t * 5.2, s = Math.sin(b), c = Math.cos(b);
            T.bounce = Math.abs(s) * 0.2;
            T.lL = s * 0.55; T.lR = -s * 0.55;
            T.kL = -Math.max(0, c) * 0.9; T.kR = -Math.max(0, -c) * 0.9;
            T.aLX = 2.1 + s * 0.7; T.aRX = 2.1 - s * 0.7; T.aLZ = -0.55; T.aRZ = 0.55;
            T.hy = Math.sin(b * 0.5) * 0.45; T.headZ = s * 0.14; T.headX = -0.05;
            T.cape = -0.3 - Math.abs(c) * 0.2;
            return 18;
        }
        case 'laugh': { // head back, shoulders shaking, a hand on the belly
            const sh = Math.sin(t * 17);
            T.hx = -0.2 + sh * 0.045; T.headX = -0.38 + sh * 0.08;
            T.aLX = 1.0; T.aLZ = 0.25; T.aRX = 0.6 + sh * 0.1; T.aRZ = 0.25;
            T.bounce = Math.abs(sh) * 0.04;
            return 24;
        }
        case 'hug': // both arms wide, open to you
            T.aLX = 1.5; T.aRX = 1.5; T.aLZ = -1.0; T.aRZ = 1.0;
            T.headX = 0.08; T.hx = 0.05;
            return 12;
        case 'attn': // «смирно»: straight, arms along the seams, chin level, not a muscle moves
            T.aLX = 0; T.aRX = 0; T.aLZ = -0.03; T.aRZ = 0.03;
            T.hx = -0.07; T.headX = -0.02; T.headY = 0;
            T.lL = 0.02; T.lR = -0.02;
            return 16;
        default:
            return 0;
    }
}
