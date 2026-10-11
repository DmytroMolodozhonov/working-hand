/**
 * Knockdown.js — my hero off its feet (and reeling) — the local player only.
 *
 *   stagger  a push between STAGGER_V and KNOCKDOWN_V: the body leans, the legs step back
 *            (the push itself slides it), arms flail; it is over in under a second.
 *   falling  0.45 s: the body tips over the way it was pushed (on the back, face down, a side).
 *   down     lies at least `minDown` s (1.5 by default). Then the PLAYER gets up with their own body:
 *            a real squat (crouch held ≥ 0.2 s, then straight up) — or, sitting at the desk, a deep
 *            bow and back. Getting up too early does nothing (the squat must be done again).
 *            No camera at all for 2 s: up by itself after 6 s (never stuck on the ground).
 *            Or another player helps: our hands hold each other, and as their hand goes up my body
 *            follows it (HandHold.js sets `liftWant`); let go too early and it sinks back down.
 *   rising   0.7 s back on the feet.
 * A fall from a height (Leviosa let go, a blast, a cliff, a tired flight) knocks over too:
 * a drop ≥ 5 or landing at ≥ 13 (hero m/s). Never in water; never after a gentle release.
 * Nothing in the hands is dropped (things fall only when the hand opens).
 */

import { KD, fallDir, IMPACT } from './Impact.js';

export const KNOCK = { MIN_DOWN: 1.5, FALL_T: 0.45, RISE_T: 0.7, SQUAT_T: 0.2, BOW_LOW: 0.15, BOW_UP: 0.45, NO_POSE_T: 2, AUTO_RISE: 6, STAGGER_MAX: 0.8,
    LIFT_T: 0.35, SINK_T: 0.5, LIFT_UP: 0.9 }; // (pulled up by a hand: the body's fastest rise / sinking back (s for all the way); up at this much)

/** The getting-up movement, pure: a real squat (crouch held ≥ SQUAT_T, then straight) — or, seated, a deep bow and back. */
export function getUpStep(st, pose, dt, allowed) {
    if (!pose || !pose.hasPose) return false;
    if (pose.isCrouching) { st.squatT += dt; if (st.squatT >= KNOCK.SQUAT_T) st.squatted = true; return false; }
    st.squatT = 0;
    const nr = pose.torso?.noseRel;
    if (nr != null) { if (nr < KNOCK.BOW_LOW) st.bowT += dt; else if (nr > KNOCK.BOW_UP && st.bowT >= KNOCK.SQUAT_T) { st.bowT = 0; st.squatted = true; } }
    if (!st.squatted) return false;
    st.squatted = false;
    return allowed;                       // (stood up too early: the squat must be done again)
}

export class Knockdown {
    constructor(game) { this.game = game; this.reset(); }

    reset() {
        this.state = 'up'; this.dir = 'back'; this.t = 0; this.minDown = 0; this.by = null; this.kind = null;
        this.squatT = 0; this.bowT = 0; this.squatted = false; this.noPoseT = 0; this.staggerT = 0;
        this.lift = 0; this.liftWant = 0;
        this._seenLanding = performance.now();
        const ch = this.game.character;
        if (ch) {
            ch.knockedDown = false; ch.stepping = 0; ch.staggerLean = 0; ch.staggerRoll = 0; ch.liftUp = 0;
            // (respawn / a fresh start: upright at once, not slowly getting up)
            if (ch._pitchOwned) { ch._fallPitch = 0; ch._pitchOwned = false; if (ch.group) ch.group.rotation.x = 0; }
            if (ch._fallRoll) { ch._fallRoll = 0; if (ch.group) ch.group.rotation.z = 0; }
        }
    }

    get down() { return this.state === 'falling' || this.state === 'down' || this.state === 'rising'; }
    netCode() { return this.state === 'falling' || this.state === 'down' ? KD[this.dir] : 0; }

    /** Off the feet: falls `dir`, lies at least `down` s, then gets up by the player's own movement. */
    knock({ dir, down = KNOCK.MIN_DOWN, by = null, kind = 'push', toss = 0 } = {}) {
        const g = this.game, ch = g.character;
        if (this.state === 'falling' || this.state === 'down') {
            this.minDown = Math.max(this.minDown, (this.state === 'down' ? this.t : 0) + down);
            return false;
        }
        if (g.beds?.lying) g.beds.standUp?.();
        if (g.animals?.riding) g.animals.dismount?.();
        if (g.flight?.busy) g.flight.land?.('knocked');
        g.handHold?.breakAll?.('knocked');
        this.state = 'falling'; this.dir = dir || 'back'; this.t = 0; this.minDown = down; this.by = by; this.kind = kind;
        this.squatT = this.bowT = 0; this.squatted = false; this.noPoseT = 0; this.lift = this.liftWant = 0; ch.liftUp = 0;
        ch.knockedDown = true; ch.fallDir = this.dir; ch.stepping = 0; ch.staggerLean = 0;
        if (toss > 2) { ch.group.position.y += 0.7; ch.verticalVelocity = Math.max(ch.verticalVelocity || 0, toss); ch.onGround = false; }
        g.hud?.setVoice?.('💥 Вас сбили с ног!', true);
        return true;
    }

    /** «Up» (UpSpell.js): back on the feet now, lying or still falling. */
    standNow() {
        if (this.state !== 'falling' && this.state !== 'down') return false;
        this.state = 'rising'; this.t = 0; this.game.character.knockedDown = false; this._told = false;
        return true;
    }

    /** Reeling: a few steps back (or aside), the body leaning, the arms flailing. */
    stagger({ dir, v }) {
        if (this.down) return;
        const ch = this.game.character;
        this.state = 'stagger'; this.dir = dir; this.t = 0;
        this.staggerT = Math.min(KNOCK.STAGGER_MAX, 0.25 + v / 20);
        ch.stepping = this.staggerT;
        ch.staggerLean = dir === 'back' ? 0.12 + 0.01 * v : dir === 'front' ? -0.12 - 0.006 * v : 0;
        ch.staggerRoll = dir === 'left' ? 0.1 + 0.008 * v : dir === 'right' ? -0.1 - 0.008 * v : 0;
    }

    /** Any landing (Leviosa, a blast, wind, a cliff, a tired flight). */
    _landing() {
        const g = this.game, L = g.character.landing;
        if (!L || L.at <= this._seenLanding) return;
        this._seenLanding = L.at;
        if (g.character.swimY != null || performance.now() < (g.impact?.gentleUntil || 0)) return;
        if (g.combat?.dead) return;
        if (this.down) { g.fx.shake = Math.max(g.fx.shake || 0, 0.6); return; }
        if (L.drop < IMPACT.FALL_KNOCK_DROP && L.speed < IMPACT.FALL_KNOCK_SPEED) return;
        const kb = g.knockback, ch = g.character;
        this.knock({ dir: kb && Math.hypot(kb.x, kb.z) > 1 ? fallDir(kb.x, kb.z, ch.group.rotation.y) : 'back', kind: 'fall' });
        this.state = 'down'; this.t = 0; // (already on the ground)
        g.fx.shake = Math.max(g.fx.shake || 0, 0.9);
        g.hud?.flashColor?.('rgba(0,0,0,0.45)');
    }

    /** Pulled up by another's hand (HandHold sets `liftWant` each frame): the body follows it, no faster
     * than a body can be pulled up; without it, sinks back. True: up on the feet. */
    _liftStep(dt, can) {
        const ch = this.game.character;
        const want = can ? Math.max(0, Math.min(1, this.liftWant || 0)) : 0;
        this.liftWant = 0;
        const d = want - this.lift;
        this.lift += d > 0 ? Math.min(d, dt / KNOCK.LIFT_T) : Math.max(d, -dt / KNOCK.SINK_T);
        ch.liftUp = this.lift;
        return this.lift >= KNOCK.LIFT_UP;
    }

    update(dt) {
        const g = this.game, ch = g.character;
        this._landing();
        this.t += dt;
        switch (this.state) {
            case 'stagger':
                if (this.t >= this.staggerT) { this.state = 'up'; ch.staggerLean = 0; ch.staggerRoll = 0; }
                break;
            case 'falling':
                if (this.t >= KNOCK.FALL_T) {
                    this.state = 'down'; this.t = 0;
                    g.fx.shake = Math.max(g.fx.shake || 0, 0.8);
                    g.hud?.flashColor?.('rgba(0,0,0,0.45)');
                }
                break;
            case 'down': {
                const can = !(g.combat?.dead || this.minDown === Infinity || g.combat?.stunned || g.combat?.frozen);
                if (this._liftStep(dt, can)) {
                    this.state = 'rising'; this.t = 0; ch.knockedDown = false; this._told = false;
                    this.lift = 0; ch.liftUp = 0;
                    g.handHold?.helpedUp?.();
                    g.hud?.setVoice?.('🤝 Вас подняли на ноги', true);
                    break;
                }
                if (g.combat?.dead || this.minDown === Infinity) break;
                if (g.combat?.stunned || g.combat?.frozen) { this.squatT = 0; this.squatted = false; break; }
                const pose = g.currentPose;                                    // (not the null pose of a stun: the camera itself)
                this.noPoseT = pose && pose.hasPose ? 0 : this.noPoseT + dt;
                const ready = this.t >= this.minDown;
                if (ready && !this._told) { this._told = true; g.hud?.setVoice?.('🧍 Чтобы встать — присядьте и выпрямитесь', true); }
                if (getUpStep(this, pose, dt, ready)
                    || (this.noPoseT > KNOCK.NO_POSE_T && this.t >= KNOCK.AUTO_RISE)) {
                    this.state = 'rising'; this.t = 0; ch.knockedDown = false; this._told = false;
                    this.lift = 0; ch.liftUp = 0;
                }
                break;
            }
            case 'rising':
                if (this.t >= KNOCK.RISE_T) this.state = 'up';
                break;
        }
    }
}
