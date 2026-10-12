/**
 * Knockdown.js — my hero off its feet (and reeling) — the local player only.
 *
 *   stagger  a push between STAGGER_V and KNOCKDOWN_V: the body leans, the legs step back
 *            (the push itself slides it), arms flail; it is over in under a second.
 *   falling  0.45 s: the body tips over the way it was pushed (on the back, face down, a side).
 *   down     lies at least `minDown` s (1.5 by default). Then the PLAYER gets up with their own body:
 *            a real squat (the nose ≥ 0.17 picture lower than when upright, held ≥ 0.14 s, then
 *            straight up) — or, sitting at the desk, a deep bow and back. A frame or two of camera jitter
 *            breaks nothing; a squat done ≤ 0.5 s too early counts when the time is up, earlier ones do not.
 *            No camera at all for 2 s: up by itself after 6 s (never stuck on the ground).
 *            Or another player helps: our hands hold each other, and as their hand goes up my body
 *            follows it (HandHold.js sets `liftWant`); let go too early and it sinks back down.
 *   rising   0.7 s back on the feet.
 * A fall from a height (Leviosa let go, a blast, a cliff, a tired flight) knocks over too:
 * a drop ≥ 5 or landing at ≥ 13 (hero m/s). Never in water; never after a gentle release.
 * Nothing in the hands is dropped (things fall only when the hand opens).
 * Afterwards the head spins (`dizzy`) for 5 … 10 s, the harder the fall the longer and stronger —
 * on my own screen only (Game sways the camera, Hud blurs it, the walk wavers); not after a stun's
 * or the ice's fall.
 * Thrown (`fly`, «Jolt»): no ground slows the body until it lands (Game's knockback), and it
 * tumbles over in the air (`tumble` turns: `tumbleAng`, drawn by Character, sent to the others).
 */

import { KD, fallDir, IMPACT } from './Impact.js';
import { knockMessage, lyingMessage } from './Hints.js';

export const KNOCK = { MIN_DOWN: 1.5, FALL_T: 0.45, RISE_T: 0.7, SQUAT_T: 0.14, BOW_LOW: 0.3, BOW_UP: 0.4, NO_POSE_T: 2, AUTO_RISE: 6, STAGGER_MAX: 0.8,
    LIFT_T: 0.35, SINK_T: 0.5, LIFT_UP: 0.9, // (pulled up by a hand: the body's fastest rise / sinking back (s for all the way); up at this much)
    // the squat measured from the person's own upright height (any camera framing): the nose this much lower
    // (picture heights) is a squat, back within UP_DROP is straight; a frame or two of jitter (GAP_T s) breaks nothing;
    // a squat finished up to EARLY s before the lying time is up still counts once it is
    LOW_DROP: 0.17, UP_DROP: 0.12, CROUCH_DROP: 0.08, GAP_T: 0.12, EARLY: 0.5, BASE_RISE: 8, BASE_DRIFT: 0.03,
    DIZZY_MIN: 5, DIZZY_MAX: 10, // (the head spins after a fall: s, the lightest … the hardest)
    FLY_MAX: 3 }; // (s: thrown through the air at most this long before the ground slows it again)

/** The person's upright nose height (picture y, down = more): the highest it has been lately (slowly forgotten). */
export function trackStand(st, pose, dt) {
    const ny = pose?.hasPose ? pose.nose?.y : null;
    if (ny == null) return;
    if (st.baseY == null) st.baseY = ny;
    else if (ny < st.baseY) st.baseY += (ny - st.baseY) * Math.min(1, dt * KNOCK.BASE_RISE); // (not one wild frame at once)
    else st.baseY += Math.min(ny - st.baseY, KNOCK.BASE_DRIFT * dt);
}

/**
 * The getting-up movement, pure: a real squat (down held ≥ SQUAT_T, then straight) — or, seated, a deep bow and back.
 * `wait`: true (allowed now) / false / s still to lie. True: up on the feet.
 */
export function getUpStep(st, pose, dt, wait) {
    wait = wait === true ? 0 : wait === false || wait == null ? Infinity : wait;
    if (st.pending && wait <= 0) { st.pending = false; return true; }  // (squatted and stood up just before the time was up)
    if (!pose || !pose.hasPose) return false;
    trackStand(st, pose, dt);
    const ny = pose.nose?.y;
    let low, high;
    if (ny != null && st.baseY != null) {
        const drop = ny - st.baseY;
        low = drop > KNOCK.LOW_DROP || (!!pose.isCrouching && drop > KNOCK.CROUCH_DROP);
        high = !low && drop < KNOCK.UP_DROP;
    } else { low = !!pose.isCrouching; high = !low; }
    const stood = () => { if (wait <= 0) return true; if (wait <= KNOCK.EARLY) st.pending = true; return false; };
    // the squat
    if (low) { st.gapT = 0; st.squatT += dt; if (st.squatT >= KNOCK.SQUAT_T) st.squatted = true; return false; }
    st.gapT = (st.gapT || 0) + dt;
    if (st.gapT > KNOCK.GAP_T) st.squatT = 0;
    if (st.squatted && high) { st.squatted = false; return stood(); } // (stood up too early: the squat must be done again)
    // the bow (seated at the desk)
    const nr = pose.torso?.noseRel;
    if (nr == null || st.squatted) return false;
    if (nr < KNOCK.BOW_LOW) { st.bowGap = 0; st.bowT += dt; if (st.bowT >= KNOCK.SQUAT_T) st.bowed = true; return false; }
    st.bowGap = (st.bowGap || 0) + dt;
    if (st.bowGap > KNOCK.GAP_T) st.bowT = 0;
    if (st.bowed && nr > KNOCK.BOW_UP) { st.bowed = false; return stood(); }
    return false;
}

/** How hard a fall was, 0 … 1: a blow's speed (hero m/s) over the knock-down one, or a landing (drop m / speed). */
export function fallStrength({ v = null, drop = 0, speed = 0 } = {}) {
    const c = (x) => Math.max(0, Math.min(1, x));
    if (v != null) return c((v - IMPACT.KNOCKDOWN_V) / 24);
    return c(Math.max((drop - IMPACT.FALL_KNOCK_DROP) / 15, (speed - IMPACT.FALL_KNOCK_SPEED) / 12));
}

/** The head spinning after a fall: how long (s) for a fall this hard (0 … 1). */
export const dizzyTime = (s) => KNOCK.DIZZY_MIN + (KNOCK.DIZZY_MAX - KNOCK.DIZZY_MIN) * Math.max(0, Math.min(1, s));

export class Knockdown {
    constructor(game) { this.game = game; this.reset(); }

    reset() {
        this.state = 'up'; this.dir = 'back'; this.t = 0; this.minDown = 0; this.by = null; this.kind = null; this.cause = null;
        this.squatT = 0; this.bowT = 0; this.squatted = false; this.bowed = false; this.pending = false; this.noPoseT = 0; this.staggerT = 0;
        this.lift = 0; this.liftWant = 0;
        this.flyT = 0; this.tumble = null;
        this.dizzyLeft = 0; this.dizzyDur = 0; this.dizzyS = 0;
        this._seenLanding = performance.now();
        const ch = this.game.character;
        if (ch) {
            ch.knockedDown = false; ch.stepping = 0; ch.staggerLean = 0; ch.staggerRoll = 0; ch.liftUp = 0;
            // (respawn / a fresh start: upright at once, not slowly getting up)
            if (ch._pitchOwned) { ch._fallPitch = 0; ch._pitchOwned = false; if (ch.group) ch.group.rotation.x = 0; }
            if (ch._fallRoll) { ch._fallRoll = 0; if (ch.group) ch.group.rotation.z = 0; }
            ch.tumbleAng = 0;
        }
    }

    get down() { return this.state === 'falling' || this.state === 'down' || this.state === 'rising'; }
    netCode() { return this.state === 'falling' || this.state === 'down' ? KD[this.dir] : 0; }

    /** Off the feet: falls `dir`, lies at least `down` s, then gets up by the player's own movement. */
    knock({ dir, down = KNOCK.MIN_DOWN, by = null, kind = 'push', cause = null, toss = 0, strength = 0.3, fly = false, tumble = 0 } = {}) {
        const g = this.game, ch = g.character;
        if (kind !== 'Stupefy' && !g.combat?.stunned && !g.combat?.frozen) this.daze(strength); // (not the stun's or the ice's stiff fall)
        // thrown through the air: until the feet… the back touches the ground again (it may already be lying)
        if (fly) this.flyT = KNOCK.FLY_MAX;
        if (tumble > 0 && toss > 2) this.tumble = { turns: tumble, t: 0, dur: Math.max(0.55, (2 * toss / 20 + 0.1) * 0.9), dir: null };
        if (this.state === 'falling' || this.state === 'down') {
            this.minDown = Math.max(this.minDown, (this.state === 'down' ? this.t : 0) + down);
            return false;
        }
        if (g.beds?.lying) g.beds.standUp?.();
        if (g.animals?.riding) g.animals.dismount?.();
        if (g.flight?.busy) g.flight.land?.('knocked');
        g.handHold?.breakAll?.('knocked');
        this.state = 'falling'; this.dir = dir || 'back'; this.t = 0; this.minDown = down; this.by = by; this.kind = kind; this.cause = cause || kind;
        this.squatT = this.bowT = 0; this.squatted = this.bowed = this.pending = false; this.noPoseT = 0; this.lift = this.liftWant = 0; ch.liftUp = 0;
        ch.knockedDown = true; ch.fallDir = this.dir; ch.stepping = 0; ch.staggerLean = 0;
        if (toss > 2) { ch.group.position.y += 0.7; ch.verticalVelocity = Math.max(ch.verticalVelocity || 0, toss); ch.onGround = false; }
        if (this.tumble) this.tumble.dir = this.dir;
        // (why I am on the ground: «вас отбросило взрывом…», «вас сбил рыцарь (Имя)»…)
        const who = by && by !== g.localId ? g.remotes?.get?.(by)?.name || '' : '';
        g.hud?.setVoice?.(knockMessage(this.cause, { by: who, down }), true);
        return true;
    }

    /** The head spins for 5 … 10 s after a fall `s` (0 … 1) hard (the harder one wins). */
    daze(s) {
        s = Math.max(0, Math.min(1, s || 0));
        const dur = dizzyTime(s);
        if (dur <= this.dizzyLeft) return;
        this.dizzyLeft = this.dizzyDur = dur; this.dizzyS = s;
    }

    /** How dizzy right now, 0 … 1: the lightest fall ~0.35, the hardest 1; fades out over the second half. */
    get dizzy() {
        if (!(this.dizzyLeft > 0)) return 0;
        const f = this.dizzyLeft / this.dizzyDur, k = Math.min(1, f / 0.5);
        return (0.35 + 0.65 * this.dizzyS) * k * k * (3 - 2 * k);
    }

    /** Flipping over in the air (a whole number of turns, eased: it ends lying as it began falling). */
    _tumbleStep(dt) {
        const ch = this.game.character, T = this.tumble;
        if (!T) { if (ch.tumbleAng) ch.tumbleAng = 0; return; }
        T.t += dt;
        const k = Math.min(1, T.t / T.dur);
        ch.tumbleAng = T.turns * Math.PI * 2 * k * k * (3 - 2 * k);
        ch.tumbleDir = T.dir || this.dir;
        if (k >= 1 || !this.down) { this.tumble = null; ch.tumbleAng = 0; }
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
        const hard = L.drop >= IMPACT.FALL_KNOCK_DROP || L.speed >= IMPACT.FALL_KNOCK_SPEED;
        if (this.down) { g.fx.shake = Math.max(g.fx.shake || 0, 0.6); if (hard && !g.combat?.stunned && !g.combat?.frozen) this.daze(fallStrength(L)); return; }
        if (!hard) return;
        const kb = g.knockback, ch = g.character;
        this.knock({ dir: kb && Math.hypot(kb.x, kb.z) > 1 ? fallDir(kb.x, kb.z, ch.group.rotation.y) : 'back', kind: 'fall', strength: fallStrength(L) });
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
        if (this.dizzyLeft > 0) this.dizzyLeft = Math.max(0, this.dizzyLeft - dt);
        if (this.flyT > 0) { this.flyT -= dt; if ((ch.onGround && this.t > 0.15) || ch.swimY != null) this.flyT = 0; }
        this._tumbleStep(dt);
        if (this.state !== 'down') trackStand(this, g.currentPose, dt); // (knows the person's upright height before a fall)
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
                if (g.combat?.stunned || g.combat?.frozen) { this.squatT = 0; this.squatted = this.bowed = this.pending = false; break; }
                const pose = g.currentPose;                                    // (not the null pose of a stun: the camera itself)
                this.noPoseT = pose && pose.hasPose ? 0 : this.noPoseT + dt;
                const ready = this.t >= this.minDown;
                if (ready && !this._told) { this._told = true; g.hud?.setVoice?.(lyingMessage(this.cause), true); }
                if (getUpStep(this, pose, dt, this.minDown - this.t)
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
