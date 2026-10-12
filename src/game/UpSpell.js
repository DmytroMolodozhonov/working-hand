/**
 * UpSpell.js — «Up» («Ап»): a raised hand and the word.
 *
 *   lying on the ground (knocked down)  → I get up at once (the usual 0.7 s back on the feet).
 *   swimming in deep water (lake, sea)  → the water throws me up and out: a real arc under
 *                                         gravity, towards where the raised hand points
 *                                         (its horizontal part; straight up = straight up).
 *   standing on anything (ground, a deck, a roof, a rock) → the same leap up from where I stand.
 *   in the air (already falling or flying) → nothing: the spell needs something to push from.
 * 7 mana (Combat.SPELL_COST). Not while stunned («Остолбеней») or frozen — Game checks that first.
 * «Up» is a short word: it counts only as the whole phrase and only with a hand raised up —
 * ordinary speech never throws anyone into the air.
 */

import * as THREE from 'three';

/** The words the recognizer writes for «Up» (a short word: often heard as «аб», «оп»…). */
const UP_WORDS = new Set(['up', 'upp', 'ap', 'app', 'ab', 'op', 'ап', 'апп', 'аап', 'ааап', 'эп', 'апъ', 'апь', 'аб', 'оп', 'уп']);
/** «Stand up» («стенд ап»): the first word… */
const STAND_WORDS = new Set(['stand', 'stend', 'стенд', 'стэнд', 'стент', 'стэнт', 'стен', 'стань']);
/** …or the two said as one. */
const UP_ONE = new Set(['standup', 'стендап', 'стэндап', 'стенап', 'стендапп']);

/** Is the whole phrase «Up» (said again and again: «ап ап ап») or «Stand up»? Never a word inside a sentence. */
export function isUpWord(text) {
    const w = String(text || '').toLowerCase().replace(/[^a-zа-яё\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (w.length < 1 || w.length > 4) return false;
    if (w.length === 1 && UP_ONE.has(w[0])) return true;
    if (w.length === 2 && STAND_WORDS.has(w[0]) && UP_WORDS.has(w[1])) return true;
    return w.every((x) => UP_WORDS.has(x));
}

/** The leap: up speed and the most sideways speed (hero m/s). */
export const UP = { VY: 21.2, H: 9, MIN_T: 0.3, MAX_T: 6, ARM_UP: 0.35, LIFT_DOWN: 0.85, LIFT_UP: 1.6 }; // (VY 21.2 with the body's gravity 20: ~11 m up — twice the old 15)

/**
 * What «Up» does now. `armUp`: a hand raised up. → 'rise' | 'leap' | a hint (string) | null (nothing to do).
 * (stunned / frozen are answered before: Combat.check)
 */
export function upAction({ down, swimming, armUp, standing = false, stunned = false, frozen = false }) {
    if (stunned || frozen) return null;
    if (!down && !swimming && !standing) return '⬆️ «Up» не работает в воздухе — нужно стоять, лежать или плавать';
    if (!armUp) return down ? '⬆️ Вытяните руку вперёд или поднимите её и скажите «Up»' : '⬆️ Поднимите руку вверх и скажите «Up»';
    return down ? 'rise' : 'leap';
}

/** The leap's velocity from the raised arm's direction (world, any length). */
export function leapVelocity(arm, out = { x: 0, y: 0, z: 0 }) {
    const len = Math.hypot(arm.x, arm.y, arm.z) || 1;
    const hx = arm.x / len, hz = arm.z / len, h = Math.hypot(hx, hz);
    const k = h < 0.08 ? 0 : UP.H * Math.min(1, h / 0.6) / h; // (an arm out at ~37° above level: full sideways speed)
    out.x = hx * k; out.y = UP.VY; out.z = hz * k;
    return out;
}

const _sh = new THREE.Vector3(), _hd = new THREE.Vector3(), _up = new THREE.Vector3(), _q = new THREE.Quaternion();

export class UpSpell {
    constructor(game) {
        this.game = game;
        this.leap = null; // {vx, vz, t}
    }

    /** The water must let go of the body while it flies up out of it (Swimming.js). */
    get rising() {
        const L = this.leap;
        return !!L && (L.t < UP.MIN_T || (this.game.character.verticalVelocity || 0) > 0);
    }

    /** The arm (shoulder → hand) of a hand raised up along the body, or null. Both up: their mean. */
    raisedArm(out = new THREE.Vector3()) {
        const ch = this.game.character;
        ch.group.updateMatrixWorld(true);
        ch.group.getWorldQuaternion(_q);
        _up.set(0, 1, 0).applyQuaternion(_q);
        out.set(0, 0, 0);
        let n = 0;
        for (const s of ['left', 'right']) {
            if (ch.handLost?.(s)) continue;
            (s === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor).getWorldPosition(_sh);
            ch.getHandWorldPosition(s, _hd).sub(_sh);
            const len = _hd.length();
            if (len < 1e-3 || _hd.dot(_up) / len < UP.ARM_UP) continue; // (up: well above the shoulder)
            out.addScaledVector(_hd, 1 / len); n++;
        }
        return n ? out : null;
    }

    /** «Up» heard (Game.castLocalSpell). Returns 'Up' or null. */
    cast(isFinal) {
        const g = this.game, ch = g.character;
        const down = g.knock.state === 'falling' || g.knock.state === 'down';
        const swimming = !!g.swim?.swimming && !this.leap;
        const arm = this.raisedArm();
        // the real arm on the camera (armLift: 0 hanging, 1 out level, 2 straight up): lying, the hero's
        // «up» along his body is not the real «up» — an arm held out straight or raised counts
        const lift = g.currentPose?.armLift;
        const real = lift ? Math.max(lift.left || 0, lift.right || 0) : 0;
        const armUp = !!arm || real >= (down ? UP.LIFT_DOWN : UP.LIFT_UP);
        // standing on anything solid: the ground, a ship's deck, a roof, a rope ladder's rung
        const standing = !down && !swimming && !this.leap && !g.flight?.active
            && (!!ch.onGround || !!g.ships?.rigging?.climbing);
        const what = upAction({ down, swimming, armUp, standing });
        if (what !== 'rise' && what !== 'leap') { if (what && isFinal) g.hud.setVoice(what, true); return null; }
        const tired = g.combat.check('Up');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        g.combat.pay('Up');
        if (what === 'rise') {
            g.knock.standNow();
            g.hud.setVoice('⬆️ <span style="color:#7fe3ff">Up!</span> Вы встаёте', true);
        } else {
            const v = leapVelocity(arm || { x: 0, y: 1, z: 0 }); // (the real arm straight up: straight up)
            this.leap = { vx: v.x, vz: v.z, t: 0 };
            if (g.ships?.rigging?.climbing) g.ships.rigging.letGo?.();
            ch.swimY = null; ch.onGround = false; ch.airTop = null;
            ch.verticalVelocity = v.y;
            g.hud.setVoice(swimming ? '⬆️ <span style="color:#7fe3ff">Up!</span> Вода выбрасывает вас вверх'
                : '⬆️ <span style="color:#7fe3ff">Up!</span> Вас подбрасывает вверх', true);
        }
        try { g.sound?.playWhoosh?.(); if (what === 'leap' && swimming) g.sound?.playSplash?.(); } catch { /* (no sound) */ }
        return 'Up';
    }

    /** The arc's sideways part (gravity is the body's own: Character). Before Character.update. */
    update(dt) {
        const L = this.leap;
        if (!L) return;
        const ch = this.game.character;
        L.t += dt;
        if (L.t > UP.MAX_T || this.game.combat?.dead || this.game.flight?.active
            || (L.t >= UP.MIN_T && (ch.onGround || ch.swimY != null))) { this.leap = null; return; }
        ch.group.position.x += L.vx * dt;
        ch.group.position.z += L.vz * dt;
        // the water's throw sets you down softly (on the shore, on a deck) — no fall-over landing
        const imp = this.game.impact;
        if (imp) imp.gentleUntil = Math.max(imp.gentleUntil || 0, performance.now() + 250);
    }

    reset() { this.leap = null; }
}
