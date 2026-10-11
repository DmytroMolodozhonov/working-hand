# Design: physical interaction between players and with spells

**Scope note.** The user's latest message asks for something else: rename the fatigue bar to "мана" and let its maximum grow with practice (task #123). This document covers the computed task (#118, physical interaction). Section 11 lists the few hooks from this design that #123 needs, for example how a caster learns that a spell really hit a player. Nothing in the repo was edited and no scratch files were written. All line numbers below refer to commit 0cd7789.

---

## 0. What exists today

| Area | Where | Behaviour now |
|---|---|---|
| Player knockback | `Game.knockback` (Game.js:99). Applied and decayed at 1854-1858 (`×(1−4dt)`) | A plain velocity vector. Blasts, wind, knights and animals add to it. |
| "Knocked down" | `Character.knockedDown` (Character.js:93, 491-493, 509) | Only used by Earthquake. The body rolls 1.4 rad around z, the origin drops 1.45, and it rises when the stun ends (Combat.js:486). It is sent as `kd: 0/1` (Character.js:648) and read by RemoteAvatar.js:118. |
| Stun | `Combat.stun` (Combat.js:247). `immobile` makes the pose null in `_updatePlayer` (Game.js:1815) | The player cannot move, look or cast. |
| Punches on players | `Combat.updatePunches` (Combat.js:591-610) | A column test (≤1.15 m flat) plus `handVelocity` toward the target > 4, no run. It sends `phit` for 1 dmg. There is no head or body part, no head jolt, no hand stop, and the cooldown is 0.45 s. |
| `phit` | NetSync.js:375-379 (send), 741 (receive) | The victim calls `combat.meleeHit` itself. Damage only, no impulse. |
| Spells vs players | `_spellPlayers` (Game.js:1441). Only the local entry applies anything. | Thunderwave pushes 26 (SpellManager.js:340). Wind and Wave go through `_blowMe` (Game.js:1391). Blast knockback and up-throw are at Game.js:481-496. Earthquake goes through `_quakeMe` (stun + knockedDown, Game.js:1169). Duel spells use `Duel.applyToMe` (Duel.js:410). |
| Fall from height | `Levitation._myLanding` (Levitation.js:582) | Damage after a Leviosa drop only. Nothing makes the player fall over. |
| Players are solid | BodyContact.js + `_keepBodiesApart` (Game.js:1877) | A lying body is already a lying capsule (`heroBody` uses the up vector). |
| Hands stopped by things | `Weapons._pushHandBack` (Weapons.js:421) | Offsets `hand.group.position`. Character.update springs it back (Character.js:550-557). |
| Handshake | none (task #100, `src/game/Handshake.js` does not exist yet) | |

Hero scale: about 4.85 units tall, about 2.8 units per real metre. Shoulders are at +1.25 above the body origin. The head mesh centre is at +2.1 (a 1.2 box plus hair to +2.85). The torso box is 1.2×1.5×0.8 centred at +0.75. The arm is 1.9 long. Gravity is 20 u/s².

---

## 1. Principles and who decides

1. **Each computer moves only its own body.** This is the existing rule from `phit` and the spell replay.
   - Spells: the spell is replayed on every machine, and the victim's own computer decides the push, stagger, knockdown and jolt on its body. This is unchanged.
   - Hands: the **attacker's** computer detects the strike. It alone knows its real camera hand at full frame rate. It sends `phit` (with damage) or `ppush` (no damage) with an impulse and a hit point. The **victim's** computer validates the message (reach, rate, shields, dome) and applies everything to itself.
   - Hand holding: the holder proposes with `hold`. The held player's computer accepts or refuses and owns breaking free (`held`). The leash is applied by each computer to its own body only.
2. **Physics first** (CLAUDE.md). The outcome comes from the resulting velocity of the body, not from a per-spell flag. Two thresholds decide it: `STAGGER_V = 3` and `KNOCKDOWN_V = 11` (hero m/s). Spell push magnitudes are tuned so that the intended result follows. Only four effects knock down by their nature: Stupefy, Avada, Earthquake (the ground runs away) and Lightning (electrocution).
3. **Hands never pass through bodies.** Strike detection uses the tracked hand (elbow anchor plus forearm, not affected by drawn offsets). The drawn hand is held on the surface with the existing `hand.group.position` offset mechanism.
4. **No accidental actions.** A strike needs real contact with a body part, a speed into the surface, and the right hand shape (fist or palm). Touching does nothing. Arms swinging while running never punch.
5. **Modes.** Pushes, staggers, knockdowns, jolts and hand holding work in every multiplayer mode. Damage still follows the existing rules (free world only). Spells reach players only where they reach them today: `_spellPlayers` in the free world; Wind, Wave and blasts everywhere. Creative keeps falling over (a decision point, on by default).

---

## 2. Phases

| Phase | Content | Can ship alone |
|---|---|---|
| 1 | Body model: fall directions, stagger, landing tracking, `kd`/`sg` codes. `Impact.js` (pure maths, HeadJolt). `Knockdown.js` (state machine, get-up gesture, fall from height). `BodyImpact.js` core. Earthquake moved onto it. Victim camera effects. | yes |
| 2 | Every spell gets its physical effect (`SPELL_PHYSICS`, Combat/Game/SpellManager/Duel/WaterMagic/Gear/CastleLife wiring, shield recoil, WallRise sync). | yes, after 1 |
| 3 | Real-hand strikes: `BodyStrikes.js` (punch, slap, guard, one-hand push, two-hand shove, sustained push). `phit` extension and new `ppush`. Hands stop at bodies. | yes, after 1 |
| 4 | Hand holding: `HandHold.js`, `hold`/`held`, leash, linked-arm visuals, Handshake compatibility. | yes, after 1 |
| 5 | Polish: remote hands stop at my body, flight body-bump, Codex/HUD texts, death fall, `sok` ack for mana. | yes |

---

## 3. Phase 1: body model, knockdown, camera

### 3.1 New file `src/game/Impact.js` (pure maths, unit-testable)

```js
/** Impact.js — what a blow does to a hero's body (pure maths; both ends of the wire use it). Hero units (≈2.8 per metre). */
export const IMPACT = {
    STAGGER_V: 3, KNOCKDOWN_V: 11, CROUCH_K: 1.4, KNOCK_ANY: 18,
    BLOCKED_K: 0.25, BLAST_DOME_K: 0.25, BLAST_SHIELD_K: 0.5, SWIM_K: 0.5,
    // hands (Phase 3)
    TOUCH_V: 1.5, PUSH_V: 2, SLAP_V: 3, PUNCH_V: 4,               // (PUNCH_V = the tuned value of Combat.updatePunches)
    FIST_CURL: 0.6, PALM_CURL: 0.35, FIST_R: 0.22, KNUCKLES: 0.3,
    PUSH_GAIN: 0.9, ONE_HAND: 0.6, BODY_GAIN: 0.8, PUNCH_BODY: 0.35, PUNCH_HEAD_BODY: 0.25, SLAP_BODY: 0.15, GUARD_GAIN: 0.2,
    BOTH_WINDOW: 0.15, HAND_COOLDOWN: 0.35, MAX_IMPULSE: 30, REACH_SLACK: 1.5, RATE: 0.12,
    // head jolt
    NECK: 0.6, JOLT_GAIN: 0.9, JOLT_W_MAX: 8, JOLT_MAX: 0.7, JOLT_K: 90, JOLT_ZETA: 0.45, JOLT_TURN: 0.3,
    // falls
    FALL_KNOCK_DROP: 5, FALL_KNOCK_SPEED: 13,
};

/** Fall direction codes on the wire (pose `kd`). 1 = the old quake roll (to the hero's left). */
export const KD = { left: 1, back: 2, front: 3, right: 4 };
export const KD_NAME = [null, 'left', 'back', 'front', 'right'];

/** What a body does with a speed v (|impulse|): 'none' | 'stagger' | 'knockdown' | 'shatter'. */
export function classify(v, m = {}) {
    if (m.dome) return 'none';
    const k = v * (m.blocked ? IMPACT.BLOCKED_K : 1) * (m.swim ? IMPACT.SWIM_K : 1);
    if (m.frozen) return k >= IMPACT.STAGGER_V ? 'shatter' : 'none';      // (a frozen statue pushed over breaks)
    const kd = IMPACT.KNOCKDOWN_V * (m.crouch ? IMPACT.CROUCH_K : 1);
    if (!m.blocked && !m.swim && k >= kd) return 'knockdown';
    return k >= IMPACT.STAGGER_V ? 'stagger' : 'none';
}

/** Which way a body pushed by (ix, iz) falls: pushed from the front → on its back. yaw: the body's (faces −Z at 0). */
export function fallDir(ix, iz, yaw) {
    const fwd = ix * -Math.sin(yaw) + iz * -Math.cos(yaw);
    const side = ix * Math.cos(yaw) + iz * -Math.sin(yaw);               // (the body's right, as BodyContact)
    if (Math.abs(fwd) >= Math.abs(side)) return fwd < 0 ? 'back' : 'front';
    return side > 0 ? 'right' : 'left';
}

/** Swept fist (radius r) a→b, in a box's own frame (centre 0, half extents): first entry or null. */
export function segmentBox(a, b, half, r = 0) {
    let t0 = 0, t1 = 1, axis = -1, sign = 0;
    for (let k = 0; k < 3; k++) {
        const h = half[k] + r, d = b[k] - a[k];
        if (Math.abs(d) < 1e-9) { if (a[k] < -h || a[k] > h) return null; continue; }
        let ta = (-h - a[k]) / d, tb = (h - a[k]) / d, s = -1;
        if (ta > tb) { const x = ta; ta = tb; tb = x; s = 1; }
        if (ta > t0) { t0 = ta; axis = k; sign = s; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) return null;
    }
    const n = [0, 0, 0];
    if (axis < 0) {                                                        // a already inside: the nearest face
        let best = Infinity;
        for (let k = 0; k < 3; k++) for (const s of [-1, 1]) { const dd = half[k] + r - s * a[k]; if (dd < best) { best = dd; n.fill(0); n[k] = s; } }
        return { t: 0, n, inside: true };
    }
    n[axis] = sign;                                                        // outward normal of the entered face
    return { t: t0, n, inside: false };
}

/** Head spin (rad/s, head frame) from a blow at lp (head frame, centre 0) along unit dir at `speed`: torque about the neck. */
export function headKick(lp, dir, speed) {
    const rx = lp[0], ry = lp[1] + IMPACT.NECK, rz = lp[2], k = IMPACT.JOLT_GAIN * speed;
    let wx = (ry * dir[2] - rz * dir[1]) * k, wy = (rz * dir[0] - rx * dir[2]) * k, wz = (rx * dir[1] - ry * dir[0]) * k;
    const m = Math.hypot(wx, wy, wz);
    if (m > IMPACT.JOLT_W_MAX) { const s = IMPACT.JOLT_W_MAX / m; wx *= s; wy *= s; wz *= s; }
    return { pitch: wx, yaw: wy, roll: wz };                               // pitch>0: the face goes up (snaps back)
}

/** Damped spring per axis: the head snaps and comes back (frame-rate independent). */
export class HeadJolt {
    constructor() { this.a = [0, 0, 0]; this.w = [0, 0, 0]; }            // [pitch, yaw, roll]
    kick({ pitch = 0, yaw = 0, roll = 0 }) { this.w[0] += pitch; this.w[1] += yaw; this.w[2] += roll; }
    step(dt) {
        const K = IMPACT.JOLT_K, c = 2 * IMPACT.JOLT_ZETA * Math.sqrt(K), n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
            this.w[k] += (-K * this.a[k] - c * this.w[k]) * h;
            this.a[k] = Math.max(-IMPACT.JOLT_MAX, Math.min(IMPACT.JOLT_MAX, this.a[k] + this.w[k] * h));
        }
        return this;
    }
    get pitch() { return this.a[0]; } get yaw() { return this.a[1]; } get roll() { return this.a[2]; }
    reset() { this.a.fill(0); this.w.fill(0); }
}

// Phase 2 adds: SPELL_PHYSICS, thunderPush(d), spellPush(name, d), spellOutcome(name, d) — §4.2
```

### 3.2 `src/entities/Character.js` changes

- Constructor additions: `this.fallDir = 'left'`, `this._fallPitch = 0`, `this._pitchOwned = false`, `this.staggerLean = 0`, `this.stepping = 0`, `this.slowScale = 1`, `this.airTop = null`, `this.landing = null`.
- Fall pose, replacing lines 491-493:
  ```js
  const FALL = { left: [0, 1.4], back: [1.45, 0], front: [-1.45, 0], right: [0, -1.4] };   // [rotation.x, rotation.z]
  const [px, rz] = this.knockedDown ? FALL[this.fallDir] || FALL.left : [this.staggerLean, 0];
  const kf = Math.min(1, dt * (this.knockedDown ? 6 : 3));
  this._fallPitch += (px - this._fallPitch) * kf;
  this._fallRoll += (rz - this._fallRoll) * kf;
  if (Math.abs(this._fallRoll) > 0.002 || this.group.rotation.z !== 0) this.group.rotation.z = this._fallRoll;
  // (x is shared with flight / bed: owned only while falling, lying, rising or reeling — those exclude flight and bed)
  const own = this.knockedDown || Math.abs(this._fallPitch) > 0.002;
  if (own) this.group.rotation.x = this._fallPitch;
  else if (this._pitchOwned) this.group.rotation.x = 0;
  this._pitchOwned = own;
  ```
- Legs at 537: `else if (this.isRunning || this.stepping > 0)`. Use the intensity `this.isRunning ? this.runIntensity : 0.6`. Movement (499-502) still needs `isRunning`. `this.stepping = Math.max(0, this.stepping - dt)`.
- Speed at 499: `* (this.speedScale ?? 1) * (this.slowScale ?? 1)`. Swimming overwrites `speedScale` every frame, so the ice chill uses `slowScale`.
- Landing tracking in the falling branch (517-522). Read `vy` before zeroing it:
  ```js
  this.airTop = Math.max(this.airTop ?? y, y);
  ...
  if (this.onGround) { this.landing = { drop: this.airTop - this.group.position.y, speed: -this.verticalVelocity, at: performance.now() }; this.airTop = null; this.verticalVelocity = 0; }
  ```
  The two other branches (swim and on ground) set `this.airTop = null`.
- `serializePose` (646-648): `run: this.isRunning || this.stepping > 0 ? r2(this.isRunning ? this.runIntensity : 0.6) : -1`, `kd: this.knockedDown ? (KD[this.fallDir] || 1) : 0`, `sg: this.stepping > 0 ? 1 : undefined`.
- New helper, generalising `Weapons._pushHandBack`:
  ```js
  /** Show this hand held `worldDelta` away from where it is tracked (it rests on something); springs back next frame. */
  setHandOffset(side, worldDelta, max = 0.6) {
      const hand = this.getActiveHands()[side];
      if (!hand || !hand.group.visible || !hand.group.parent) return;
      _v1.copy(worldDelta).clampLength(0, max);
      hand.group.parent.getWorldQuaternion(_q1).invert();
      _v1.applyQuaternion(_q1);
      const rest = hand.group.userData.restOffset;
      hand.group.position.set((rest?.x || 0) + _v1.x, (rest?.y || 0) + _v1.y, this.BONE_LENGTH_LOWER + (rest?.z || 0) + _v1.z);
  }
  ```

### 3.3 `src/net/RemoteAvatar.js` changes

- At the start of `update()`, call `ch.restoreArms()` before the slerps (lines 111-115). Otherwise a `reachHand` from last frame (Phase 4) overwrites this frame's network arms when `ch.update` calls `restoreArms`.
- Replace 107-108 and 118:
  ```js
  const kd = s.s.kd | 0, sg = !!s.s.sg;
  ch.knockedDown = kd > 0;
  ch.fallDir = KD_NAME[kd] || ch.fallDir;
  ch.staggerLean = sg ? 0.18 : 0;
  if (sg) ch.stepping = 0.2;
  if (!kd && !sg && !ch._pitchOwned) ch.group.rotation.x += ((s.s.rx || 0) - ch.group.rotation.x) * k;
  ch.flying = !kd && !sg && Math.abs(s.s.rx || 0) > 0.05;
  ```
- Velocity estimate, used by strikes and the leash:
  ```js
  // ctor: this.vel = new THREE.Vector3(); this._pp = new THREE.Vector3(); this._ppOk = false;
  // after the position update:
  if (this._ppOk && dt > 0) { _d.subVectors(g, this._pp).divideScalar(dt); if (_d.lengthSq() < 900) this.vel.lerp(_d, 0.3); else this.vel.set(0, 0, 0); }
  this._pp.copy(g); this._ppOk = true;
  ```

### 3.4 New file `src/game/Knockdown.js`

```js
import { KD, fallDir, IMPACT } from './Impact.js';
export const KNOCK = { MIN_DOWN: 1.5, FALL_T: 0.45, RISE_T: 0.7, SQUAT_T: 0.2, BOW_LOW: 0.15, BOW_UP: 0.45, NO_POSE_T: 2, AUTO_RISE: 6, STAGGER_MAX: 0.8 };

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
        this._seenLanding = performance.now();
        const ch = this.game.character; if (ch) { ch.knockedDown = false; ch.stepping = 0; ch.staggerLean = 0; }
    }
    get down() { return this.state === 'falling' || this.state === 'down' || this.state === 'rising'; }
    netCode() { return this.state === 'falling' || this.state === 'down' ? KD[this.dir] : 0; }

    /** Off the feet: falls `dir`, lies at least `down` s, then gets up by the player's own movement. */
    knock({ dir, down = KNOCK.MIN_DOWN, by = null, kind = 'push', toss = 0 }) {
        const g = this.game, ch = g.character;
        if (this.down) { this.minDown = Math.max(this.minDown, this.t + (this.state === 'down' ? down : 0)); return false; }
        g.beds?.lying && g.beds.standUp();
        g.animals?.riding && g.animals.dismount();
        if (g.flight?.busy) g.flight.land('knocked');
        g.handHold?.breakAll('knocked');
        this.state = 'falling'; this.dir = dir || 'back'; this.t = 0; this.minDown = down; this.by = by; this.kind = kind;
        this.squatT = this.bowT = 0; this.squatted = false; this.noPoseT = 0;
        ch.knockedDown = true; ch.fallDir = this.dir; ch.stepping = 0; ch.staggerLean = 0;
        if (toss > 2) { ch.group.position.y += 0.7; ch.verticalVelocity = Math.max(ch.verticalVelocity || 0, toss); ch.onGround = false; }
        g.hud.setStatus?.('Вас сбили с ног!');
        return true;
    }

    stagger({ dir, v }) {
        if (this.down) return;
        const ch = this.game.character;
        this.state = 'stagger'; this.dir = dir; this.staggerT = Math.min(KNOCK.STAGGER_MAX, 0.25 + v / 20);
        ch.stepping = this.staggerT; ch.staggerLean = dir === 'back' ? 0.12 + 0.01 * v : dir === 'front' ? -0.12 : 0;
    }

    /** Generic landing (any fall: Leviosa, blast, wind, a cliff, a tired flight). */
    _landing() {
        const g = this.game, L = g.character.landing;
        if (!L || L.at <= this._seenLanding) return;
        this._seenLanding = L.at;
        if (g.character.swimY != null || performance.now() < (g.impact?.gentleUntil || 0)) return;
        if (this.down) { g.fx.shake = Math.max(g.fx.shake, 0.6); return; }
        if (L.drop < IMPACT.FALL_KNOCK_DROP && L.speed < IMPACT.FALL_KNOCK_SPEED) return;
        const kb = g.knockback, ch = g.character;
        this.knock({ dir: Math.hypot(kb.x, kb.z) > 1 ? fallDir(kb.x, kb.z, ch.group.rotation.y) : 'back', kind: 'fall' });
        this.state = 'down'; this.t = 0; // (already on the ground)
        g.fx.shake = Math.max(g.fx.shake, 0.9);
    }

    update(dt) {
        const g = this.game, ch = g.character;
        this._landing();
        this.t += dt;
        switch (this.state) {
        case 'stagger':
            if (this.t >= this.staggerT) { this.state = 'up'; ch.staggerLean = 0; }
            break;
        case 'falling':
            if (this.t >= KNOCK.FALL_T) { this.state = 'down'; this.t = 0; g.fx.shake = Math.max(g.fx.shake, 0.8); g.hud.flashColor?.('rgba(0,0,0,0.45)'); }
            break;
        case 'down': {
            if (g.combat.dead || this.minDown === Infinity) break;
            if (g.combat.stunned || g.combat.frozen) { this.squatT = 0; this.squatted = false; break; }
            const pose = g.currentPose;                                    // (not the null pose of a stun: the camera itself)
            this.noPoseT = pose && pose.hasPose ? 0 : this.noPoseT + dt;
            const ready = this.t >= this.minDown;
            if (ready) g.hud.setStatus?.('Чтобы встать — присядьте и выпрямитесь');
            if (getUpStep(this, pose, dt, ready) || (this.noPoseT > KNOCK.NO_POSE_T && this.t >= KNOCK.AUTO_RISE)) {
                this.state = 'rising'; this.t = 0; ch.knockedDown = false; g.hud.setStatus?.('');
            }
            break;
        }
        case 'rising':
            if (this.t >= KNOCK.RISE_T) this.state = 'up';
            break;
        }
    }
}
```

### 3.5 New file `src/game/BodyImpact.js` (the local victim side)

```js
import * as THREE from 'three';
import { IMPACT, classify, fallDir, headKick, HeadJolt, SPELL_PHYSICS, spellPush } from './Impact.js';
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();

export class BodyImpact {
    constructor(game) { this.game = game; this.jolt = new HeadJolt(); this.gentleUntil = 0; this._last = new Map(); }

    /**
     * Something hits my body. o: {v: Vector3 world impulse (hero m/s), from: Vector3|null (null: no shield check),
     *   by, spell|kind, toss, head: {lp, dir, speed}|null, jolt: rad/s away from `from`, always: {down}|null,
     *   blast, noShield, down}
     * @returns 'none'|'stagger'|'knockdown'|'shatter'|'blocked'
     */
    apply(o) {
        const g = this.game, c = g.combat, ch = g.character;
        if (c.dead || g.isDeadLocal || g.spiders?.held) return 'none';
        if (g.levitation?.lifted) { this._kickHead(o); return 'none'; }   // (the magic holds the body)
        const dome = !!(c.shield && c.shield.type === 2 && c.shield.left > 0);
        const facing = !o.noShield && o.from && !dome && c.shieldFactor(o.from) >= 1;
        const m = { crouch: ch.isCrouching, swim: ch.swimY != null, frozen: c.frozen,
            dome: dome && !o.blast, blocked: facing && !o.blast };
        let k = m.dome ? 0 : m.blocked ? IMPACT.BLOCKED_K : 1;
        if (o.blast) k = dome ? IMPACT.BLAST_DOME_K : facing ? IMPACT.BLAST_SHIELD_K : 1;
        let res = classify(o.v.length() * (o.blast ? k : 1), o.blast ? { crouch: m.crouch, swim: m.swim, frozen: m.frozen, blocked: o.blast && k < 1 } : m);
        if (o.always && !dome && !facing && !m.frozen && !m.swim) res = 'knockdown';
        if (o.v.length() * k >= IMPACT.KNOCK_ANY && res === 'stagger' && !m.swim && !m.blocked) res = 'knockdown';
        // the push itself
        if (g.flight?.active) g.knockback.addScaledVector(o.v, k);
        else {
            g.knockback.x += o.v.x * k; g.knockback.z += o.v.z * k;
            const toss = Math.max(o.toss || 0, o.v.y > 2 ? o.v.y : 0) * k;
            if (toss > 2 && res !== 'knockdown') { ch.group.position.y += 0.7; ch.verticalVelocity = Math.max(ch.verticalVelocity || 0, toss); ch.onGround = false; }
            o.toss = toss;
        }
        if (res === 'shatter') { c.die(o.by, 'shatter'); return res; }
        this._kickHead(o, k);
        const dir = fallDir(o.v.x, o.v.z, ch.group.rotation.y);
        if (res === 'knockdown') {
            if (g.flight?.busy) g.flight.land('blown');
            g.knock.knock({ dir, down: o.always?.down ?? o.down ?? undefined, by: o.by, kind: o.spell || o.kind, toss: o.toss });
        } else if (res === 'stagger') g.knock.stagger({ dir, v: o.v.length() * k });
        if (facing && !dome) this._recoil(o, k);
        if (o.spell && o.by && o.by !== g.localId && res !== 'none') g.sync?.spellLanded?.(o.by, o.spell, res);  // (#123)
        return facing && res === 'none' ? 'blocked' : res;
    }

    /** Spell head-kick away from the source, or the exact blow (hand strikes). */
    _kickHead(o, k = 1) {
        const ch = this.game.character;
        ch.head.getWorldQuaternion(_q).invert();
        if (o.head) {
            const d = _d.fromArray(o.head.dir).applyQuaternion(_q).normalize();
            const w = headKick(o.head.lp, [d.x, d.y, d.z], o.head.speed * k);
            this.jolt.kick(w);
            this.game.cameraBaseRotation += IMPACT.JOLT_TURN * w.yaw / Math.sqrt(IMPACT.JOLT_K);   // a hook leaves the view turned a little
            this.game.fx.shake = Math.max(this.game.fx.shake, Math.min(0.8, 0.08 * o.head.speed));
        } else if (o.jolt && o.from) {
            const d = _d.copy(this.game.combat.center(_v)).sub(o.from).normalize().applyQuaternion(_q);
            this.jolt.kick(headKick([-d.x * 0.6, -d.y * 0.6, -d.z * 0.6], [d.x, d.y, d.z], o.jolt * k / (IMPACT.JOLT_GAIN * 0.7)));
        }
    }

    /** A blocked spell is still felt: the shield arm is pushed back, the body slides a little (never falls). */
    _recoil(o, k) {
        const g = this.game, side = g.combat.shield?.side || 'right';
        g.character.setHandOffset(side, _v.copy(o.v).setLength(Math.min(0.35, 0.05 * o.v.length())));
        g.fx.shake = Math.max(g.fx.shake, 0.2);
    }

    /** A spell from SpellManager / Combat hit me (push may be given by the spell, else from SPELL_PHYSICS). */
    spellHit(kind, from, byId, push = null) {
        const P = SPELL_PHYSICS[kind];
        if (!P && !push) return 'none';
        const me = this.game.combat.center(new THREE.Vector3());
        const v = push ? push.clone() : me.clone().sub(from).setY(0).normalize().multiplyScalar(spellPush(kind, me.distanceTo(from)));
        return this.apply({ v, from, by: byId, spell: kind, jolt: P?.jolt || 0, toss: P?.toss || 0,
            always: P?.always ? { down: P.down } : null, noShield: true /* (Combat checked the shield already) */ });
    }

    /** Phase 3: a hand strike from another player (phit / ppush). */
    onStrike(m, shieldTook = false) { /* §5.4 */ }
}
```

### 3.6 `src/game/Game.js` wiring for Phase 1

- `init` after `this.combat`: `this.impact = new BodyImpact(this); this.knock = new Knockdown(this);`. Also `this._headBase = { yaw: 0, pitch: 0 }` and `this.bodyVel = new THREE.Vector3()`.
- `_updatePlayer` (1810-1868):
  ```js
  if (pose) {
      if (pose.headRotation) { /* …unchanged smoothing / drift… */
          this._headBase.yaw = this.smoothHead.yaw - (s.drifting ? this.yawNeutral : 0);
          this._headBase.pitch = this.smoothHead.pitch;            // (replaces the direct updateHeadRotation at 1842)
      }
      ch.updateArmsLookAt(pose, dt);
      const down = this.knock.down;
      ch.setCrouching(flying || down ? false : pose.isCrouching);
      ch.setRunning(flying || down ? false : pose.isRunning, pose.runIntensity);
  }
  // head: the tracked turn + the blow's jolt (+ lying face down: the cheek on the ground, the eyes along it)
  const J = this.impact.jolt.step(dt);
  if (!flying) {
      ch.updateHeadRotation(this._headBase.yaw + J.yaw + (this.knock.down && this.knock.dir === 'front' ? 1.1 : 0), this._headBase.pitch + J.pitch);
      ch.head.rotation.z = J.roll;
  }
  this.knock.update(dt);                     // (before ch.update: knockedDown / fallDir this frame)
  ...
  // knockback decay: a lying body slides less far
  this.knockback.multiplyScalar(Math.max(0, 1 - (this.knock.down ? 8 : 4) * dt));
  ```
  With a stun and `iced`, `pose` is null, but the jolt and knockdown still run.
- `_updateCamera` (third person): after `lookAt`, `this.camera.rotateY(J.yaw * 0.5); this.camera.rotateX(J.pitch * 0.5)` (store J on `this._jolt`).
- `castLocalSpell` after line 694: `if (this.knock.down && /^(Flight|Earthquake|Breakthrough)/.test(name)) { if (isFinal) this.hud.setVoice('Сначала встаньте', true); return null; }`. `startFlight`: `if (this.knock.down) return false`. Lying, the player can still look, aim, raise Protection and cast.
- `respawn` (1489): `this.knock.reset(); this.impact.jolt.reset(); this.handHold?.breakAll('respawn');`.
- `frame()` after `_keepBodiesApart()`: `this._trackBodyVel(dt)` (EMA of the position delta) and `bodyVelocity(out)`.
- `_quakeMe` (1169) now uses Knockdown and no longer stuns:
  ```js
  _quakeMe(casterId, origin, reached, power, dir) {
      if (casterId === 'local' || casterId === this.localId) return false;
      const c = this.combat;
      if (!c.enabled || c.dead || this.flight.active) return false;
      if (!reached(this.character.group.position)) return false;
      if (c.shield && c.shield.type === 2 && c.shield.left > 0) { c._blocked(origin); return true; }
      const max = power > 1;
      // the ground runs away under the feet along the wave: the body falls back against it
      this.impact.apply({ v: dir.clone().setY(0).normalize().multiplyScalar(max ? -5 : -3), from: null, by: casterId,
          spell: max ? 'EarthquakeMaxima' : 'Earthquake', always: { down: max ? 2.5 : 1.5 }, toss: max ? 6 : 4 });
      this.fx.shake = Math.max(this.fx.shake, 1.2);
      c.damage(max ? 9 : 3, casterId, 'Earthquake');
      return true;
  }
  ```
  SpellManager.js:515 passes `dir`: `this.hooks.quakeMe(casterId, origin, reached, power, dir)`. Game.js:169 forwards it.
- `Combat.js`:
  - `revive()`: replace `this.game.character.knockedDown = false` with `this.game.knock?.reset()`.
  - `update()`: delete the `quake` reset at 486 and keep the Stupefy message.
  - `_hud()`: `if (this.stunned || this.game.knock?.down) return;` before `setStatus`.
  - Chill: `this.game.character.slowScale = this.frozen ? 0 : 1 - 0.6 * this.chill;`.

### 3.7 Victim camera effects

| Event | Camera |
|---|---|
| Head punch or slap | Head jolt (FPV camera = head quaternion; others see it through `hy`/`hp`). `fx.shake` up to 0.8. A hook leaves the view turned by `JOLT_TURN·yaw/√K` (about 0.1-0.2 rad). |
| Body punch, push, stagger | The body lean (0.12-0.25 rad) tilts the FPV view. Legs step. |
| Knockdown | The camera follows the lying head: on the back it sees the sky; face down the head is turned 1.1 rad so the view runs along the ground (no clipping into terrain). On hitting the ground: shake 0.8 and a 0.45 dark flash. |
| Spell hits | `jolt` per spell (§4.2). Lightning: white flash (`hud.flashColor('rgba(220,235,255,0.8)')`) plus the existing shake. Sands: a sand-coloured flash for 0.8 s. |

---

## 4. Phase 2: every spell and its physical effect

### 4.1 Full review: now vs. proposed

Push values are hero m/s. The outcome comes from `classify`: under 3 nothing, 3 to 11 stagger, 11 or more knockdown. Crouching ×1.4 to the thresholds; water ×0.5 and never knocks down.

| Spell (where) | Now on players | Proposed |
|---|---|---|
| Lumos / LumosMaxima / Nox (WandMagic) | none (light; thrown light flies) | none (light spell). Optional: LumosMaxima at a face within 3 m dazzles (white overlay 0.4 s, no push). |
| Draw (Латин Вратин), Reveal | none | none |
| Accio | things only | none |
| ChangeColor, CreateBed, Gather, CreateFloor/Wall/Ceiling, BuildRoof, CreateDoor, Stand/«стоп» | none (blocks push bodies out by collision) | none |
| Fire (campfire) | 1 dmg/tick when standing in fire (Campfires.js:527) | + flinch jolt 0.6, no push |
| Brainrot | zombies only | none |
| ToTheSun, Storm, LightningCatch, LightningHold | none (caster flash/shake) | none |
| AirBubble(+Max), Waterball, Maxima, WaterForming, Frozen (ball) | none | none for the spell. A ball another player drops or throws: liquid = push 4 (stagger), no damage. Ice = dmg 3+3r (free world) + push 6 (stagger); r ≥ 1.2 gives push 12 (knockdown); head height adds a jolt (WaterMagic `_updateFalling`). |
| Flight / Pause | own body | none for the spell. Phase 5: a flier hitting a player above 15 u/s sends `ppush` with v·0.6. |
| Protection | blocks straight spells; blasts ×0.5 | Blocked spells recoil: 25 % of the push, never a knockdown, the shield arm is pushed back. Blasts: ×0.5 push, no knockdown. |
| ProtectionMaxima | blocks all; blasts ×0.25 | No push from spells. Blasts ×0.25 push (stagger at most). Earthquake already blocked. |
| Rescue | heals | none |
| Levitation (things) | none; a swung levitated sword hits through `checkHits` → `phit` | the `phit` carries an impulse of 0.3·tip speed (stagger on strong swings) |
| Attack (levitated weapon flies) | dmg 4-5 + impale (Levitation.js:284) | + push 6 along its flight (stagger) through `phit.i` |
| LevitateDuel (on a wizard) | lifted; let go → fall damage | Same, plus the landing rule: a drop ≥ 5 or landing speed ≥ 13 makes the player fall over. A gentle release (`dropMe(true)`) never knocks down (`impact.gentleUntil = now + 3000`). |
| Inferno | 1 HP / 0.6 s in the cone | + push 1.5 per tick along the flames (a slow drift back), jolt 0.6; never knocks down |
| Sands (Даст) | 3 HP | + push 5 (stagger), jolt 2.5 (sand in the face), sand overlay 0.8 s |
| Ice (beam) / IceDuel | chill → frozen 20 s; any hit shatters | + chill slows walking (`slowScale = 1 − 0.6·chill`). A frozen player pushed at ≥ 3 topples and shatters (`classify` → 'shatter'). |
| Sapira (ray, debug) / SapiraDuel | 4 HP | + heavy push 12 along the charge → knockdown 1.5 s back, jolt 3 |
| Stupefy | stun 15 s standing | Falls stiff on the back (`always`, down 1.5) **and** stays stunned 15 s. When the stun ends, the player needs the get-up gesture. |
| AvadaKedavra | death | The body crumples back (`knock` with down ∞). Remotes delay `setDead` hiding by 1.2 s when `kd` is set (bodies staying is #122). |
| Thunderwave | 3 HP + push 26 (6.5 m slide) | push `thunderPush(d) = 20·max(0.1, 1−0.9·d/40)`: knockdown within 20 m, stagger at 20-36 m, jolt 3 |
| Wind | push 13·(1−0.6d/14), lift if v.y > 2, no damage | Same push: stagger across the cone, knockdown only point-blank (< 3.6 m), jolt 1 |
| WindMaxima | push 39·(1−0.6d/24) | Same push: knockdown in the whole 24 m cone (thrown off the feet), jolt 2 |
| WaveAttack | push 15 + up 3.5, harmless | push `4+6p` = 10 + up 3.5: stagger and carried, wet (no fall damage) |
| WaveAttackMaxima | push 22.2 + up 4.7 | `4+6·2.2` = 17.2: knockdown, wet |
| Bombardo | dmg by distance; knockback (r+3−d)·4·√p; up-throw if k > 0.35 | Same push: knockdown within about 3.9 m (k > 0.42, thrown), stagger to 5.9 m, jolt 3·k. Applies to my own blast too. |
| BombardoMaxima | same ×√3 | knockdown within about 7.6 m, down 2.5 s, jolt 4·k |
| Earthquake / Maxima | stun 2.5/4 s + side roll + 3/9 HP | Real knockdown against the wave, **no stun** (hands free), down 1.5/2.5, toss 4/6, same damage |
| LightningStrike (LightningBeam/LightningHit, Thor's hammer) | 12 HP within 3.7 | + `always` knockdown 2 s, push 8 away from the point, white flash, jolt 2. Held too long (self-strike): the same on the caster. |
| Breakthrough / Maxima | wall throws zombies; players nothing | Synced as a `WallRise` spell. Players on the wall's footprint: push 8 + toss 6 (stagger, thrown back); Maxima push 12 + toss 8 (knockdown). |

Non-spells, for consistency: arrows (Gear.js:337-344) push 2 plus a jolt on a head hit. Knight strike (CastleLife.struck 891-899) push 5, toss 2 → stagger, jolt 1.5. Animal butt (Animals.js:654) push 6 → stagger. Spider (Spider.js:239) push 10, toss 4 → stagger.

### 4.2 `Impact.js` additions

```js
/** Per spell (null = nothing physical). push: hero m/s at the source; range: linear falloff 1−0.6·d/range (null: none);
 *  always: knocks down by nature; down: s lying at least; jolt: head kick (rad/s); toss: up m/s. */
export const SPELL_PHYSICS = {
    Lumos: null, LumosMaxima: null, Nox: null, Draw: null, Reveal: null, Accio: null, ChangeColor: null, CreateBed: null,
    Gather: null, CreateFloor: null, CreateWall: null, CreateCeiling: null, BuildRoof: null, CreateDoor: null, Stand: null,
    Brainrot: null, ToTheSun: null, Storm: null, LightningCatch: null, LightningHold: null, Rescue: null, Pause: null, Flight: null,
    AirBubble: null, AirBubbleMaxima: null, Waterball: null, Maxima: null, WaterForming: null, Frozen: null,
    Protection: null, ProtectionMaxima: null, Levitation: null, LevitateDuel: null, Ice: null, IceDuel: null,
    Fire: { push: 0, jolt: 0.6 },
    Inferno: { push: 1.5, jolt: 0.6 },
    Sands: { push: 5, jolt: 2.5 },
    Wind: { push: 13, range: 14, jolt: 1 }, WindMaxima: { push: 39, range: 24, jolt: 2 },
    WaveAttack: { push: 10, toss: 3.5, wet: true }, WaveAttackMaxima: { push: 17.2, toss: 4.7, wet: true },
    Thunderwave: { push: 20, thunder: true, jolt: 3 },
    Sapira: { push: 12, jolt: 3 }, SapiraDuel: { push: 12, jolt: 3 },
    Stupefy: { push: 4, always: true, down: 1.5 }, AvadaKedavra: { push: 3, always: true, down: Infinity },
    Bombardo: { blast: true, jolt: 3, down: 1.5 }, BombardoMaxima: { blast: true, jolt: 4, down: 2.5 },
    Earthquake: { push: 3, always: true, down: 1.5, toss: 4 }, EarthquakeMaxima: { push: 5, always: true, down: 2.5, toss: 6 },
    Lightning: { push: 8, always: true, down: 2, jolt: 2 },
    WallRise: { push: 8, toss: 6 }, WallRiseMaxima: { push: 12, toss: 8 },
    Attack: { push: 6, jolt: 1.5 },
};
export const thunderPush = (d) => 20 * Math.max(0.1, 1 - 0.9 * d / 40);
export function spellPush(name, d = 0) {
    const P = SPELL_PHYSICS[name]; if (!P) return 0;
    if (P.thunder) return thunderPush(d);
    return P.push * (P.range ? Math.max(0, 1 - 0.6 * d / P.range) : 1);
}
/** Blast speed (as Game.applyExplosion). */
export const blastPush = (d, radius, power) => Math.max(0, (radius + 3 - d) * 4 * Math.sqrt(power));
export function spellOutcome(name, d = 0, m = {}) {
    const P = SPELL_PHYSICS[name]; if (!P) return 'none';
    if (P.always) return m.dome || m.blocked ? 'none' : 'knockdown';
    return classify(P.blast ? blastPush(d, name === 'BombardoMaxima' ? 6.24 : 3.6, name === 'BombardoMaxima' ? 3 : 1) : spellPush(name, d), m);
}
```

### 4.3 Wiring

- `Combat.hitBySpell` (Combat.js:378-388):
  ```js
  if (this.shieldFactor(from) >= 1) { this._blocked(from, kind); this.game.impact?.apply({ v: (push || this._pushOf(kind, from)), from, by: byId, spell: kind, noShield: false }); return false; }
  ...
  this.damage(PLAYER_DAMAGE[kind] ?? 2, byId, kind);
  this.game.impact?.spellHit(kind, from, byId, push);          // (replaces `if (push) this.game.knockback.add(push)`)
  ```
  The blocked branch calls `apply` with `from` and without `noShield`. `apply` sees `facing` and recoils at 25 % without a knockdown. `_pushOf` uses `spellPush` along from → me. For `Bounce`, nothing changes.
- SpellManager:
  - Thunderwave (340): `p.hit('Thunderwave', origin, dirTo.clone().setY(0.2).normalize().multiplyScalar(thunderPush(dist)))`.
  - `castWind` (628) and `castWave` (703): pass the name as a 4th argument to `blowMe(casterId, origin, pushAt, name)`.
  - Wave push formula: `const k = 4 + 6 * power`.
  - New cases `WallRise` / `WallRiseMaxima` → `castWallRise(o, d, casterId, width)`:
    ```js
    castWallRise(center, dir, casterId, width) {
        const side = new THREE.Vector3(-dir.z, 0, dir.x), max = width > 5;
        const push = (p) => { const to = _a.subVectors(p, center); if (Math.abs(to.dot(side)) > width / 2 + 1 || Math.abs(to.dot(dir)) > 1.6) return null;
            return _b.copy(dir).multiplyScalar(max ? 12 : 8).setY(max ? 8 : 6); };
        if (this.auth) for (const z of this.zombies) { if (z.isDead) continue; const v = push(z.group.position); if (v) { z.windVel = (z.windVel || new THREE.Vector3()).add(v.clone().setY(0)); z.vy = Math.max(z.vy || 0, v.y); } }
        if (this.hooks.blowMe) this.hooks.blowMe(casterId, center, push, max ? 'WallRiseMaxima' : 'WallRise');
    }
    ```
- `Game._blowMe` (1391-1400):
  ```js
  _blowMe(casterId, origin, pushAt, name = 'Wind') {
      if (casterId === 'local' || casterId === this.localId || this.combat.dead) return;
      const v = pushAt(this.combat.center(new THREE.Vector3()));
      if (!v) return;
      const P = SPELL_PHYSICS[name] || {};
      if (this.combat.shieldFactor(origin) >= 1) this.combat._blocked(origin);
      this.impact.apply({ v: v.clone(), from: origin, by: casterId, spell: name, jolt: P.jolt || 0 });
  }
  ```
  The old code returned at the shield; now the shield recoils at 25 %.
- `Game._raiseWall` (975-1005): remove the zombie loop at 999-1003 (moved to SpellManager) and add:
  ```js
  const o = new THREE.Vector3(cx, ch.group.position.y - 1.5, cz), d = new THREE.Vector3(fx, 0, fz), n = max ? 'WallRiseMaxima' : 'WallRise';
  this.spells.cast(n, o, d, null, this.localId); if (this.sync) this.sync.spell(n, o, d, null);
  ```
- `Game.applyExplosion` (481-496), with the shake kept:
  ```js
  if (dPlayer < radius + 3) {
      const k = 1 - dPlayer / (radius + 3);
      _v1.set(pp.x - pos.x, 0, pp.z - pos.z).normalize().multiplyScalar(blastPush(dPlayer, radius, power));
      const name = power > 1 ? 'BombardoMaxima' : 'Bombardo';
      this.impact.apply({ v: _v1.clone(), from: pos.clone(), by: casterId === 'local' ? this.localId : casterId, spell: name, blast: true,
          toss: k > 0.35 && !this.flight.active ? 10 * k * push : 0, jolt: SPELL_PHYSICS[name].jolt * k, down: SPELL_PHYSICS[name].down });
  }
  ```
  Keep the order: `combat.explosion` damage first. If the player dies, `apply` returns 'none'.
- `Duel.applyToMe(spell, byId, side)` (410-436): compute `from` from the caster's hand (`_handOf`) and `dir = me − from`.
  - Stupefy: `c.stun(DUEL.STUN_TIME, byId); g.impact.apply({ v: dir·4, from, by: byId, spell: 'Stupefy', always: { down: 1.5 }, noShield: true });` (the shield was already checked on arrival).
  - SapiraDuel: after the damage, `apply({ v: dir·12, …, spell: 'SapiraDuel', jolt: 3, noShield: true })`.
  - AvadaKedavra: `g.knock.knock({ dir: 'back', down: Infinity, by: byId, kind: 'avada' })` before `c.die`.
  - The losing side of a clash (`_finishClash` → `applyToMe`) gets the same effects.
- `castLightningHit` → `p.hit('Lightning', point)`. Already goes through `hitBySpell` → `spellHit('Lightning')` (always knockdown).
- `Levitation.dropMe(gentle)` (567): `if (gentle) g.impact.gentleUntil = performance.now() + 3000`. The landing rule in `Knockdown._landing` does the rest. Fall damage stays in `_myLanding`.
- `WaterMagic`: `remoteDrop` stores `b.by = m.by`. In `_updateFalling`, for `!b.local && b.by !== me && b.vel.length() > 3 && !b._hitMe` within `b.r + 0.8` of `combat.center()`: set `_hitMe`, then
  `impact.apply({ v: b.vel.clone().setY(0).setLength(b.frozen ? (b.r >= 1.2 ? 12 : 6) : 4), from: b.pos, by: b.by, kind: 'ice', head: … })`. Frozen balls in the free world also do `combat.damage(round(3 + 3r))`.
- Gear arrows (341), `CastleLife.struck` (897), `Animals` (654), `Spider` (239): replace `knockback.add(...)` with `impact.apply({ v, from, kind, jolt })`, using the values in §4.1.
- `Combat.update`: `ch.slowScale` from the chill (§3.6).

---

## 5. Phase 3: strikes with the real hands

### 5.1 Geometry, on the attacker's screen

- **Fist point:** tracked knuckles = `getHandWorldPosition(side) + getForearmDirection(side)·0.3`. This is not the drawn palm, so drawn offsets never corrupt the speed.
- **Hand velocity:** `BodyStrikes` keeps its own finite difference (EMA 0.5) of the knuckle point. `Character.handVelocity` is not used because it follows the drawn grip.
- **Hand shape:** tracked curl `ch.getGripCurl(side)`. ≥ 0.6 is a fist, ≤ 0.35 an open palm, in between "half" (counts as a palm with 0.6× push).
- **Victim parts:** the drawn meshes of the remote character, in their own frames (so knocked-down or turned bodies just work). The first part the swept fist enters wins:
  - `arm` (guard): each forearm box in elbow-anchor frame, centre (0,0,0.45), half (0.2,0.2,0.45)
  - `head`: `character.head` frame, centre (0,0.1,0), half (0.62,0.72,0.62) (includes the hair)
  - `body`: `character.body` frame, half (0.6,0.75,0.4)
- **Swept test:** `segmentBox(p0Local, p1Local, half, FIST_R)`. One frame's fist path is tested, so fast punches at low FPS are not missed.
- **Speed into the surface:** `approach = −(v_hand − r.vel)·n_out_world`.
- **Decision**, with a cooldown of 0.35 s per (hand, victim):

| Part | Fist | Palm / half |
|---|---|---|
| arm | `guard`: `ppush{k:'guard', i: 0.2·v}` (blocked, no damage, no head jolt) | same |
| head | approach ≥ 4 and not running → `punch`: `phit` dmg 1 (2 if approach > 9), `i = 0.25·v`, head kick | approach ≥ 3 → `slap`: `ppush`, `i = 0.15·v`, head kick, no damage |
| body | approach ≥ 4 and not running → `punch`: `phit` dmg 1, `i = 0.35·v` | approach ≥ 2 → push (queued for the two-hand window) |

- **Push:** both palms on the same victim within 0.15 s give **one** `shove` with n = 2: `|i| = 0.9·avg + 0.8·(my body speed toward them)`. A single palm gives `push`, n = 1, ×0.6. While running, only a two-hand shove counts. Examples: standing two-hand shove at 6 u/s → 5.4 (stagger); running shove at 7.5 → 0.9·6 + 0.8·7.5 = 11.4 (knockdown).
- **Sustained push** (optional 3b): while both palms stay in body contact (`inside`) and I walk (`isRunning`), send `ppush{k:'shove', c:1, i: my walking velocity}` 10×/s. The victim's computer moves it along unless it walks toward me (resisting): `net = max(0, |i| − victimSpeed·cos)`.
- **Hand stop:** every frame while the tracked knuckles are inside a part (expanded box), `ch.setHandOffset(side, exitVector)` holds the drawn hand on the surface. The same rule applies to the remote dome (sphere 2.6): hands cannot enter it and nothing lands.

### 5.2 New file `src/game/BodyStrikes.js` (skeleton)

```js
import * as THREE from 'three';
import { IMPACT, segmentBox } from './Impact.js';
import { PLAYER_DAMAGE } from './Combat.js';

const PARTS = [   // [part, frame object of a VoxelCharacter, centre in it, half extents]
    ['arm', (c, s) => (s === 'left' ? c.leftElbowAnchor : c.rightElbowAnchor), [0, 0, 0.45], [0.2, 0.2, 0.45]],
    ['head', (c) => c.head, [0, 0.1, 0], [0.62, 0.72, 0.62]],
    ['body', (c) => c.body, [0, 0, 0], [0.6, 0.75, 0.4]],
];
const _m = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3();
const A = [0, 0, 0], B = [0, 0, 0];
const r2 = (v) => Math.round(v * 100) / 100, arr = (v) => [r2(v.x), r2(v.y), r2(v.z)];

/** Every body part of a drawn hero the swept fist p0→p1 (world) enters; the earliest. */
export function sweepParts(character, p0, p1, r = IMPACT.FIST_R) {
    let best = null;
    for (const [part, frame, c, half] of PARTS) for (const s of part === 'arm' ? ['left', 'right'] : [null]) {
        const o = frame(character, s);
        _m.copy(o.matrixWorld).invert();
        _a.copy(p0).applyMatrix4(_m); _b.copy(p1).applyMatrix4(_m);
        A[0] = _a.x - c[0]; A[1] = _a.y - c[1]; A[2] = _a.z - c[2]; B[0] = _b.x - c[0]; B[1] = _b.y - c[1]; B[2] = _b.z - c[2];
        const h = segmentBox(A, B, half, r);
        if (!h || (best && h.t >= best.t)) continue;
        const lp = [A[0] + (B[0] - A[0]) * h.t, A[1] + (B[1] - A[1]) * h.t, A[2] + (B[2] - A[2]) * h.t];
        best = { part, armSide: s, t: h.t, inside: h.inside, lp, frame: o,
            nOut: new THREE.Vector3().fromArray(h.n).transformDirection(o.matrixWorld),
            depth: Math.max(0, ...[0, 1, 2].map((k) => half[k] + r - Math.abs(B[k]))) };
    }
    return best;
}

export class BodyStrikes {
    constructor(game) {
        this.game = game;
        this.prev = { left: new THREE.Vector3(), right: new THREE.Vector3() }; this.has = { left: false, right: false };
        this.vel = { left: new THREE.Vector3(), right: new THREE.Vector3() };
        this.cool = new Map(); this.pushes = []; this.contact = { left: null, right: null }; this.log = [];
    }
    _knuckles(side, out) { const ch = this.game.character; ch.getHandWorldPosition(side, out); return out.addScaledVector(ch.getForearmDirection(side, _f), IMPACT.KNUCKLES); }

    update(dt) {
        const g = this.game, ch = g.character;
        for (const [k, v] of this.cool) (v - dt <= 0 ? this.cool.delete(k) : this.cool.set(k, v - dt));
        this._flushPushes(dt);
        const off = !g.remotes.size || g.combat.dead || g.combat.frozen || g.combat.stunned || !g.currentPose;
        for (const side of ['left', 'right']) {
            const p1 = this._knuckles(side, new THREE.Vector3());
            if (this.has[side] && dt > 0) this.vel[side].lerp(_d.subVectors(p1, this.prev[side]).divideScalar(Math.max(dt, 1 / 240)), 0.5); else this.vel[side].set(0, 0, 0);
            const p0 = this.has[side] ? this.prev[side].clone() : p1.clone();
            this.prev[side].copy(p1); this.has[side] = true; this.contact[side] = null;
            if (off || g.weapons.hands[side].held || g.books?.reading || g.handHold?.holding(side)) continue;   // (a blade: Weapons.checkHits)
            const curl = ch.getGripCurl(side);
            const shape = curl >= IMPACT.FIST_CURL ? 'fist' : curl <= IMPACT.PALM_CURL ? 'palm' : 'half';
            if (shape !== 'fist' && g.items?.held?.[side]) continue;     // (a wand / food in the fist can still punch)
            for (const [id, r] of g.remotes) {
                if (r.dead || !r.target || (r.combat.shield === 2 && r.combat.shieldLeft > 0)) continue;
                const hit = sweepParts(r.character, p0, p1);
                if (!hit) continue;
                this.contact[side] = { id, part: hit.part };
                if (hit.depth > 0) ch.setHandOffset(side, _a.copy(hit.nOut).multiplyScalar(hit.depth));   // the drawn hand rests on the body
                if (hit.inside) continue;                                                                 // (still touching: no new blow)
                const vRel = _d.subVectors(this.vel[side], r.vel), speed = -vRel.dot(hit.nOut), key = side + '|' + id;
                if (speed < IMPACT.TOUCH_V || this.cool.has(key)) continue;
                this._strike(side, id, r, hit, shape, speed, vRel.clone().normalize());
            }
        }
    }

    _strike(side, id, r, hit, shape, speed, dir) {
        const g = this.game, ch = g.character;
        const base = { pt: hit.part, lp: hit.lp.map(r2), s: side, sp: r2(speed) };
        let msg = null, dmg = 0;
        if (hit.part === 'arm') msg = { k: 'guard', i: arr(dir.clone().multiplyScalar(IMPACT.GUARD_GAIN * speed)) };
        else if (shape === 'fist') {
            if (ch.isRunning || speed < IMPACT.PUNCH_V) return;
            dmg = PLAYER_DAMAGE.Punch * (hit.part === 'head' && speed > 9 ? 2 : 1);
            msg = { k: 'punch', i: arr(dir.clone().multiplyScalar((hit.part === 'head' ? IMPACT.PUNCH_HEAD_BODY : IMPACT.PUNCH_BODY) * speed)) };
        } else if (hit.part === 'head') { if (speed < IMPACT.SLAP_V) return; msg = { k: 'slap', i: arr(dir.clone().multiplyScalar(IMPACT.SLAP_BODY * speed)) }; }
        else { if (speed >= IMPACT.PUSH_V) this._queuePush(side, id, speed * (shape === 'half' ? 0.6 : 1), dir); return; }
        Object.assign(msg, base);
        this.cool.set(side + '|' + id, IMPACT.HAND_COOLDOWN);
        this.log.push({ ...msg, to: id }); if (this.log.length > 20) this.log.shift();
        if (msg.k === 'punch' && g.combat.enabled) g.combat.hitRemote(g.combat.meleeTarget(id), dmg, false, null, msg);
        else g.sync?.playerPush(id, msg);
        if (g.sound) g.sound.playHit?.();
    }

    _queuePush(side, id, speed, dir) {
        const other = this.pushes.find((p) => p.id === id && p.side !== side);
        if (other) { this.pushes.splice(this.pushes.indexOf(other), 1); this._sendPush(id, [other, { side, speed, dir }]); }
        else if (!this.pushes.some((p) => p.id === id && p.side === side)) this.pushes.push({ side, id, speed, dir, t: IMPACT.BOTH_WINDOW });
    }
    _flushPushes(dt) { for (const p of [...this.pushes]) if ((p.t -= dt) <= 0) { this.pushes.splice(this.pushes.indexOf(p), 1); this._sendPush(p.id, [p]); } }
    _sendPush(id, hands) {
        const g = this.game, n = hands.length;
        if (g.character.isRunning && n < 2) return;
        const avg = hands.reduce((s, h) => s + h.speed, 0) / n;
        const dir = hands.reduce((s, h) => s.add(h.dir), new THREE.Vector3()).setY(0).normalize();
        const body = Math.max(0, g.bodyVelocity(_d).dot(dir));
        const v = (IMPACT.PUSH_GAIN * avg + IMPACT.BODY_GAIN * body) * (n === 2 ? 1 : IMPACT.ONE_HAND);
        for (const h of hands) this.cool.set(h.side + '|' + id, IMPACT.HAND_COOLDOWN);
        const msg = { k: n === 2 ? 'shove' : 'push', n, pt: 'body', i: arr(dir.multiplyScalar(v)), s: hands[0].side };
        this.log.push({ ...msg, to: id }); if (this.log.length > 20) this.log.shift();
        g.sync?.playerPush(id, msg);
    }
}
```

`Combat` changes:
- `meleeTarget(id)` returns or creates the `targets` entry (the same objects as `meleeTargets`).
- `hitRemote(target, dmg, magic, hit, extra = null)` passes `extra` to `sync.playerHit`.
- Delete `updatePunches`. `Game.frame` calls `this.strikes.update(dt)` in its place (Game.js:1754). `init` adds `this.strikes = new BodyStrikes(this)`.

Blades: in `Game.onLocalHit` for `z.isPlayer` (Game.js:411), pass `extra = { k: 'blade', pt: hit && hit.y > 1.5 ? 'head' : 'body', i: arr(dir·min(8, 0.3·(hit?.speed||0))) }`. `Levitation._updateAttack` (284) passes `{ k: 'lev', pt: 'body', i: arr(to·6) }`.

### 5.3 Network

```js
// NetSync — outgoing
playerHit(to, dmg, magic = false, hit = null, x = null) {
    const r = (v) => Math.round(v * 100) / 100;
    const h = hit && Number.isFinite(hit.lx) ? [r(hit.lx), r(hit.y), r(hit.lz)] : undefined;
    this.net.send({ t: 'phit', by: this.me, to, dmg, mg: magic ? 1 : 0, h, ...(x ? { k: x.k, pt: x.pt, i: x.i, lp: x.lp, s: x.s, sp: x.sp } : {}) }, true);
}
playerPush(to, x) { this.net.send({ t: 'ppush', by: this.me, to, k: x.k, n: x.n || 1, pt: x.pt, i: x.i, lp: x.lp, s: x.s, sp: x.sp, c: x.c ? 1 : 0 }, true); }

// incoming (replaces line 741)
case 'phit': if (m.to === this.me) {
    const landed = g.combat.enabled ? g.combat.meleeHit(Math.min(8, Math.round(m.dmg) || 1), m.by, !!m.mg, Array.isArray(m.h) ? m.h.slice(0, 3).map(Number) : null) : true;
    g.impact?.onStrike(m, landed === false);
} break;
case 'ppush': if (m.to === this.me) g.impact?.onStrike(m, false); break;
```

`Combat.meleeHit` returns `false` when a held shield takes the blow (Combat.js:436) and `true` otherwise.

### 5.4 Victim validation: `BodyImpact.onStrike(m, shieldTook)`

```js
onStrike(m, shieldTook) {
    const g = this.game, r = g.remotes.get(m.by);
    if (!r || r.dead || !Array.isArray(m.i)) return;
    // (lag-tolerant reach: their body to mine ≤ two half-bodies + an arm + slack)
    if (r.position.distanceTo(g.character.group.position) > 0.9 * 2 + 1.9 + IMPACT.REACH_SLACK + 1.2) return;
    const key = m.by + '|' + (m.s || ''), now = performance.now() / 1000;
    if (!m.c && now - (this._last.get(key) || -9) < IMPACT.RATE) return;
    this._last.set(key, now);
    const v = new THREE.Vector3(+m.i[0] || 0, +m.i[1] || 0, +m.i[2] || 0).clampLength(0, IMPACT.MAX_IMPULSE);
    const from = r.position.clone().add(_d.set(0, 1.25, 0));
    if (shieldTook || m.k === 'guard') { this.apply({ v: v.multiplyScalar(shieldTook ? 0.3 : 1), from: null, by: m.by, kind: m.k }); return; }
    const head = m.pt === 'head' && Array.isArray(m.lp) ? { lp: m.lp.slice(0, 3).map((x) => Math.max(-1, Math.min(1, +x || 0))), dir: v.clone().normalize().toArray(), speed: Math.min(20, +m.sp || v.length() * 4) } : null;
    if (m.c) { /* sustained shove: carried unless I walk into it */ this._carry(v); return; }
    this.apply({ v, from: null, by: m.by, kind: m.k, head });
}
```

The victim refuses everything while its dome is up (`apply` with `m.dome`). A frozen victim pushed at ≥ 3 shatters (`classify`). A punch on a frozen victim already shatters in `meleeHit`.

---

## 6. Phase 4: holding hands

### 6.1 Rules (the author's words, made physical)

- **Grab:** my open hand (curl ≤ 0.35) is within 0.5 of the other player's palm, and my fingers close (curl ≥ 0.65) within 0.6 s **while still that near**. The act of closing around the hand counts; an already-made fist pushed against a hand does not. My hand must be free (no weapon, item or book).
- **Accept** (the held player's computer): my hand on that side is free; I am not dead, knocked down, lifted, flying, in a bed or riding; their palm on my screen is within 1.3 of mine (lag tolerance); that hand is not held already. Otherwise refuse.
- **Fingers:** the holder's fingers close as the camera hand closes but stop on the other hand: `setGrip(min(trackedCurl, 0.72))`. Released with `setGrip(null)`.
- **Leash** (constraint |holder's palm − held player's shoulder| ≤ reach 1.9 + slack 0.15). Each computer moves only its own body:
  - **Held player standing still:** never moved. On the holder's screen the holder is stopped at the rope's length ("if they stand still you can't drag them").
  - **Held player walking roughly along or toward** (facing · u > cos 110°): pulled, i.e. moved by the excess toward the holder's palm ("if they walk along they are pulled").
  - **Held player walking away** with excess > 0.7 for 0.25 s: breaks free. Also breaks free with a sharp jerk of the held arm (`sharpJerk(game.duel.jerk[side])`, after 0.4 s), with excess > 1.7 for 0.5 s (lag or teleport), when the holder is stale > 1 s, or when either player is knocked down, lifted, flying, dead or respawning. Breaking free is meant to be easy.
  - **Holder lets go:** curl ≤ 0.35 for 0.15 s.
- **Walking hand in hand works side by side:** the arms reach sideways (the 2D→3D arm mapping cannot put an arm behind the body). The constraint is direction-agnostic, so this needs nothing special.
- **Visuals:** on my screen the remote's linked arm reaches my palm with `r.character.reachHand(theirSide, myPalm, 1, 0.25)`, called after `r.update`. My own arm stays tracked, per CLAUDE.md. Links between two other players (known from `held` broadcasts) are drawn the same way.

### 6.2 New file `src/game/HandHold.js` (skeleton)

```js
import * as THREE from 'three';
import { sharpJerk } from './Jerk.js';
export const HOLD = { GRAB_R: 0.5, ACCEPT_R: 1.3, OPEN: 0.35, CLOSED: 0.65, CLOSE_T: 0.6, RELEASE_T: 0.15, REACH: 1.9, SLACK: 0.15,
    BREAK_EXCESS: 0.7, BREAK_T: 0.25, LAG_EXCESS: 1.7, LAG_T: 0.5, AWAY_COS: -0.34, STILL_V: 0.5, STALE: 1.0, WRAP: 0.72, PENDING_T: 1.2, JERK_AFTER: 0.4 };

/** Closing round a hand: open-and-near, then closed-and-near within CLOSE_T. hist: [{t, c, near}] (newest last). */
export function closingAround(hist, now) {
    const last = hist[hist.length - 1];
    if (!last || last.c < HOLD.CLOSED || !last.near) return false;
    return hist.some((h) => now - h.t <= HOLD.CLOSE_T && h.c <= HOLD.OPEN && h.near);
}

/** One leash step on MY body (pure). me/them: {x, z}. role 'held': me = my shoulder, them = holder's palm;
 *  role 'holder': me = my palm, them = the held one's shoulder. */
export function leash({ role, me, them, walking = false, facing = null, otherWalking = false, reach = HOLD.REACH + HOLD.SLACK }) {
    const dx = them.x - me.x, dz = them.z - me.z, d = Math.hypot(dx, dz), e = d - reach;
    if (e <= 0) return { move: null, excess: 0, away: false };
    const ux = dx / d, uz = dz / d;
    if (role === 'held') {
        if (!walking) return { move: null, excess: e, away: false };
        if (facing && facing.x * ux + facing.z * uz < HOLD.AWAY_COS) return { move: null, excess: e, away: true };
        return { move: { x: ux * e, z: uz * e }, excess: e, away: false };
    }
    if (otherWalking) return { move: null, excess: e, away: false };
    return { move: { x: ux * e, z: uz * e }, excess: e, away: false };
}

export class HandHold {
    constructor(game) {
        this.game = game;
        this.mine = { left: null, right: null };   // {to, ts, state: 'pending'|'on', t, openT}
        this.held = { left: null, right: null };   // {by, hs, t, awayT, lagT}
        this.others = new Map();                   // heldId|side → {held, ts, holder, hs}
        this.hist = { left: [], right: [] };
        this._t = 0;
    }
    holding(side) { return !!this.mine[side]; }
    palm(ch, side, out) { ch.getHandWorldPosition(side, out); return out.addScaledVector(ch.getForearmDirection(side, new THREE.Vector3()), 0.25); }
    _busy(side) { const g = this.game; return !!(g.weapons.hands[side].held || g.items?.held?.[side] || g.books?.reading); }
    _free() { const g = this.game; return !(g.combat.dead || g.knock?.down || g.levitation?.lifted || g.flight?.busy || g.beds?.lying || g.animals?.riding); }

    update(dt) {
        this._t += dt;
        const g = this.game;
        if (!g.remotes.size) return;
        this._detectGrab(dt); this._holderStep(dt); this._heldStep(dt); this._draw();
    }

    _detectGrab() {
        const g = this.game, ch = g.character;
        if (!g.currentPose || !this._free()) return;
        for (const side of ['left', 'right']) {
            if (this.mine[side] || this.held[side] || this._busy(side)) { this.hist[side].length = 0; continue; }
            const p = this.palm(ch, side, new THREE.Vector3());
            let near = null, best = HOLD.GRAB_R;
            for (const [id, r] of g.remotes) { if (r.dead || !r.target) continue;
                for (const ts of ['left', 'right']) { const d = this.palm(r.character, ts, new THREE.Vector3()).distanceTo(p); if (d < best) { best = d; near = { id, ts }; } } }
            const h = this.hist[side];
            h.push({ t: this._t, c: ch.getGripCurl(side), near: !!near, who: near && near.id + near.ts });
            while (h.length && this._t - h[0].t > 0.8) h.shift();
            if (near && closingAround(h.filter((x) => !x.who || x.who === near.id + near.ts), this._t)) {
                this.mine[side] = { to: near.id, ts: near.ts, state: 'pending', t: 0, openT: 0 };
                h.length = 0;
                g.sync?.handHold(near.id, side, near.ts, true);
            }
        }
    }

    _holderStep(dt) {
        const g = this.game, ch = g.character;
        for (const side of ['left', 'right']) {
            const L = this.mine[side]; if (!L) continue;
            const r = g.remotes.get(L.to);
            L.t += dt;
            const curl = ch.getGripCurl(side);
            L.openT = curl <= HOLD.OPEN ? L.openT + dt : 0;
            const stale = !r || r.dead || performance.now() - (r.lastUpdate || 0) > HOLD.STALE * 1000;
            if (L.openT >= HOLD.RELEASE_T || stale || !this._free() || (L.state === 'pending' && L.t > HOLD.PENDING_T)) { this._letGo(side); continue; }
            ch.getActiveHands()[side]?.setGrip?.(Math.min(curl, HOLD.WRAP));       // fingers close round the hand, no further
            if (L.state !== 'on') continue;
            const myPalm = this.palm(ch, side, new THREE.Vector3());
            const sh = (L.ts === 'left' ? r.character.leftArmAnchor : r.character.rightArmAnchor).getWorldPosition(new THREE.Vector3());
            const otherWalking = (r.target?.s?.run ?? -1) >= 0 || Math.hypot(r.vel.x, r.vel.z) > HOLD.STILL_V;
            const res = leash({ role: 'holder', me: myPalm, them: sh, otherWalking });
            if (res.move) this._moveMe(res.move);                                     // "can't drag a standing one"
        }
    }

    _heldStep(dt) {
        const g = this.game, ch = g.character;
        for (const side of ['left', 'right']) {
            const L = this.held[side]; if (!L) continue;
            const r = g.remotes.get(L.by);
            L.t += dt;
            if (!r || r.dead || performance.now() - (r.lastUpdate || 0) > HOLD.STALE * 1000 || !this._free()) { this._free_(side, false); continue; }
            if (L.t > HOLD.JERK_AFTER && sharpJerk(g.duel?.jerk?.[side])) { this._free_(side, true); continue; }
            const sh = (side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor).getWorldPosition(new THREE.Vector3());
            const theirPalm = this.palm(r.character, L.hs, new THREE.Vector3());
            const yaw = ch.group.rotation.y;
            const res = leash({ role: 'held', me: sh, them: theirPalm, walking: ch.isRunning, facing: { x: -Math.sin(yaw), z: -Math.cos(yaw) } });
            L.awayT = res.away && res.excess > HOLD.BREAK_EXCESS ? L.awayT + dt : 0;
            L.lagT = res.excess > HOLD.LAG_EXCESS ? L.lagT + dt : 0;
            if (L.awayT >= HOLD.BREAK_T || L.lagT >= HOLD.LAG_T) { this._free_(side, true); continue; }
            if (res.move) this._moveMe(res.move);                                     // "walking along: pulled"
        }
    }

    _moveMe(mv) {
        const g = this.game, p = (g.animals?.riding?.group.position) || g.character.group.position;
        p.x += mv.x; p.z += mv.z;
        g.collision.resolveCylinder(g.character.group.position, 0.48, g.character.group.position.y - 2.0, 3.5);
    }

    _draw() {
        const g = this.game, ch = g.character, v = new THREE.Vector3();
        for (const side of ['left', 'right']) {
            const L = this.mine[side]; const r = L && L.state === 'on' && g.remotes.get(L.to);
            if (r) r.character.reachHand(L.ts, this.palm(ch, side, v), 1, 0.25);
            const H = this.held[side]; const h = H && g.remotes.get(H.by);
            if (h) h.character.reachHand(H.hs, this.palm(ch, side, v), 1, 0.25);
        }
        for (const o of this.others.values()) {
            const a = g.remotes.get(o.held), b = g.remotes.get(o.holder);
            if (a && b) a.character.reachHand(o.ts, this.palm(b.character, o.hs, v), 1, 0.25);
        }
    }

    onNet(m) {
        const g = this.game, me = g.localId;
        if (m.t === 'hold' && m.to === me) return this._onHold(m);
        if (m.t === 'held') {
            const k = m.by + '|' + m.ts;
            if (m.holder === me) {
                const L = this.mine[m.s === 'left' ? 'left' : 'right'];
                if (L && L.to === m.by) { if (m.on) L.state = 'on'; else { this._letGo(m.s, false); if (m.f) g.hud.setVoice(`${g.playerName(m.by)} вырвался`, true); } }
            }
            if (m.on) this.others.set(k, { held: m.by, ts: m.ts, holder: m.holder, hs: m.s }); else this.others.delete(k);
        }
    }

    _onHold(m) {
        const g = this.game, ts = m.ts === 'left' ? 'left' : 'right', r = g.remotes.get(m.by);
        if (!m.on) { if (this.held[ts]?.by === m.by) this._free_(ts, false); return; }
        const ok = r && !r.dead && this._free() && !this.held[ts] && !this._busy(ts) && !this.mine[ts]
            && this.palm(g.character, ts, new THREE.Vector3()).distanceTo(this.palm(r.character, m.s, new THREE.Vector3())) < HOLD.ACCEPT_R;
        if (!ok) { g.sync?.handHeld(m.by, m.s, ts, false, false); return; }
        this.held[ts] = { by: m.by, hs: m.s, t: 0, awayT: 0, lagT: 0 };
        g.sync?.handHeld(m.by, m.s, ts, true, false);
        g.hud.setVoice(`${g.playerName(m.by)} держит вас за руку — резко дёрните рукой, чтобы вырваться`, true);
    }

    _letGo(side, send = true) {
        const L = this.mine[side]; if (!L) return;
        this.mine[side] = null;
        this.game.character.getActiveHands()[side]?.setGrip?.(null);
        if (send) this.game.sync?.handHold(L.to, side, L.ts, false);
    }
    _free_(side, broke) {
        const L = this.held[side]; if (!L) return;
        this.held[side] = null;
        this.game.sync?.handHeld(L.by, L.hs, side, false, broke);
        if (broke) this.game.hud.setVoice('Вы вырвались', true);
    }
    breakAll() { for (const s of ['left', 'right']) { this._letGo(s); this._free_(s, false); } }
    onLeave(id) {
        for (const s of ['left', 'right']) { if (this.mine[s]?.to === id) this._letGo(s, false); if (this.held[s]?.by === id) this._free_(s, false); }
        for (const [k, o] of this.others) if (o.held === id || o.holder === id) this.others.delete(k);
    }
}
```

NetSync additions:
- `handHold(to, s, ts, on)` → `{t:'hold', by: me, to, s, ts, on: on?1:0}`.
- `handHeld(holder, s, ts, on, free)` → `{t:'held', by: me, holder, s, ts, on: on?1:0, f: free?1:0}`.
- Handlers: `case 'hold': case 'held': if (m.by !== this.me) g.handHold?.onNet(m); break;`.
- `_onLeave(id)` adds `g.handHold?.onLeave(id)`.

Game:
- `init`: `this.handHold = new HandHold(this)`.
- `frame()`: right after `for (const r of this.remotes.values()) r.update(dt);`, call `this.handHold.update(dt);`, then `_keepBodiesApart()`.

**Handshake.js compatibility.** If `src/game/Handshake.js` lands first, HandHold imports its palm-contact and grip helpers instead of `palm`/`closingAround`, and the two features share one message family. One option is `{t:'hand', a:'hold'|'held'|'shake', …}`, where a handshake is a mutual hold (both players send `hold`) plus a detected vertical shake. If HandHold lands first, Handshake should reuse `closingAround`, `palm`, `leash`, `HOLD`. During a mutual hold both sides are holders, so whoever stands still anchors.

---

## 7. Phase 5: polish

1. **Remote hands stop at my body** (cosmetic, my screen): after `r.update`, `sweepParts(myCharacter, prevPalm, palm, 0.18)` for each remote palm against my head and torso and other remote bodies. Set the remote's `setHandOffset` to the surface (springs back by itself).
2. **Flight bump:** on the flier's computer, when `_keepBodiesApart` reports `res.hit` and flight speed > 15, send `ppush{k:'bump', i: flightDir·0.6·speed}` (cooldown 1 s). The flier's own flight speed is multiplied by 0.35 (as against terrain).
3. **Codex pvp texts** (Codex.js 23-62):
   - Тандервейв «3 + сбивает с ног (до 20 м)»
   - Вайнд «отбрасывает; вплотную — сбивает с ног», Максима «сбивает с ног»
   - Earthquake «3 + сбивает с ног (встать — присесть и выпрямиться)»
   - Бомбардо «урон + сбивает с ног рядом»
   - Сапира «4 + сбивает с ног»
   - Остолбеней «падает навзничь, 15 с не двигается»
   - Wave Attack «смывает; Максима — сбивает с ног»
   - Breakthrough «стоящих перед стеной отбрасывает»
   - Даст «3 + песок в глаза»
4. **HUD lines** (keep the game's usual emoji prefixes): 'Вас сбили с ног!', 'Чтобы встать — присядьте и выпрямитесь', '{name} держит вас за руку — резко дёрните рукой, чтобы вырваться', 'Вы держите {name} за руку', '{name} стоит на месте — не сдвинуть' (holder stopped, toast at most every 3 s), 'Вы вырвались', 'Сначала встаньте'.
5. **Death fall:** `RemoteAvatar.setDead(true)` waits 1.2 s before hiding when `character.knockedDown`. Task #122 may keep the body anyway.
6. **`sok` acknowledgement** (§11).

---

## 8. Network messages (all with `reliable = true`)

| `t` | Direction | Fields | Receiver |
|---|---|---|---|
| `phit` (extended) | attacker → all | `by, to, dmg, mg, h` + new `k:'punch'|'blade'|'lev', pt:'head'|'body', i:[x,y,z], lp:[x,y,z], s, sp` | `to`: `meleeHit` (free world) then `impact.onStrike` (impulse, jolt) |
| `ppush` (new) | attacker → all | `by, to, k:'push'|'shove'|'slap'|'guard'|'bump', n:1|2, pt, i, lp, s, sp, c:0|1` | `to`: `impact.onStrike` (no damage ever) |
| `hold` (new) | holder → all | `by, to, s (holder side), ts (held side), on` | `to`: accept or refuse; others ignore |
| `held` (new) | held → all | `by (held), holder, s, ts, on, f (broke free)` | holder: pending→on or dropped; everyone: link map for drawing |
| `spell` (new names) | caster → all | `name: 'WallRise' | 'WallRiseMaxima'` | each machine: `castWallRise` → `blowMe` for the local player |
| `sok` (new, for #123) | victim → caster | `by (victim), to (caster), n (spell), r: 'stagger'|'knockdown'|'hit'` | caster: `game.onSpellLanded(n, by, r)` |
| `p` pose (fields) | everyone | `s.kd`: 0 up, 1 left (legacy quake), 2 back, 3 front, 4 right; `s.sg`: 1 while reeling; `s.run` ≥ 0 while stepping | RemoteAvatar: fall pose, lean, legs, `flying` only if `!kd && !sg` |

Old clients take extra `phit` fields harmlessly. `ppush`, `hold`, `held` and `sok` fall into the `default` of the `switch` (ignored). The version check in the menu already separates builds.

---

## 9. Edge cases

- **Lag:** the attacker sees the victim 50-150 ms late. The victim validates reach (≤ ≈ 6.4 between bodies), rate (one strike per 0.12 s per hand), and caps the impulse at 30. Pushes never carry damage, so a stale shove cannot kill.
- **Tunnelling:** a swept segment per frame for fists and the stepped `moveSolid` for bodies, so a fast punch at low FPS still lands.
- **Touch vs blow:** a resting or slowly moving hand only stops the drawn hand on the surface. No message is sent.
- **Running:** arms swinging on the run never punch or push one-handed. A two-hand shove while running is the deliberate strong shove.
- **Guard:** a forearm in front of the face is hit first along the fist's path. The result is blocked (small push, no damage, no jolt).
- **Shields:**
  - Protection facing the source: spells recoil at 25 % without a knockdown; blasts ×0.5 without a knockdown; a magic shield in the hand taking a punch: ×0.3 push only.
  - Dome: no pushes from spells or hands (hands cannot enter it); blasts ×0.25.
  - Earthquake: only the dome blocks it, as now.
- **Frozen:** any push ≥ 3 topples and shatters the statue (killed by the pusher). Damage still shatters as before.
- **Stunned (Stupefy):** lies stunned. The pose is null, so there is no gesture and no auto-rise from "no camera" (it counts `g.currentPose`, not the stun's null pose). The gesture is needed after the stun ends.
- **Already lying:** new impulses slide the body (friction 8/s). `knock()` extends `minDown` without restarting the fall. Landing while down only shakes.
- **Get-up gesture:**
  - A squat and stand before `MIN_DOWN` is discarded and must be redone.
  - Crouching is ignored while down (`setCrouching(false)`), but `pose.isCrouching` is read for the gesture.
  - Without a camera for 2 s, the player gets up by itself after 6 s.
- **Flight:** pushes go into 3D knockback. A knockdown-level impulse lands the flight ('blown') and the player falls. A tired flight that falls from height falls over on landing. Flight cannot start while down.
- **Riding:** a knockdown throws the rider off (`dismount`). A stagger leaves the horse alone.
- **Bed:** an impact stands the player up from the bed first, then the normal rules apply.
- **Swimming:** pushes ×0.5, never a knockdown, no fall-over landing in water.
- **Levitation:** while lifted, pushes are ignored (only the head jolts). A gentle release gives no knockdown for 3 s. A jerk throw keeps `L.vel·1.5` knockback, and the landing rule applies.
- **Items:** a knockdown never drops what the hands hold (CLAUDE.md: things fall only when the hand is opened or a real throw is made). A held Protection, water ball or Leviosa object continues.
- **Hand holding:**
  - Grabbing a hand that holds a sword, item or book, or is already held → refused (`held` off).
  - Pending without an acknowledgement for 1.2 s → cancelled.
  - Disconnect (`onLeave`), respawn, knockdown, lift, flight or death breaks the link.
  - Both gripping (mutual): both are holders, so whoever stands still anchors.
  - The hold never moves the other computer's body.
- **BodyContact vs a lying body:** standing players are blocked by a lying capsule (top ≈ ground + 1.2). This is acceptable; stepping over is out of scope.
- **Rising under someone:** BodyContact parts the bodies the next frame.
- **Creative:** falling over is on (decision point `KNOCK_IN_CREATIVE`, default true). There is no damage.
- **Existing tests that teleport a victim:** after a hit, the victim may now be lying. Add `g.knock.reset()` next to `g.knockback.set(0,0,0)` in the `aim()` helpers of multiplayer.test.mjs (lines 409 and 526) and after Stupefy (`stunLeft = 0` at 551/568).

---

## 10. Tests

### 10.1 New pose helpers in `tests/e2e/poses.mjs`

- Add per-arm overrides to `frame()`: `armL` / `armR` = `{ e: [x, y], w: [x, y] }`, applied after the presets. The hand landmarks are rebuilt at the new wrist. Only x and y matter: `getRelativeDirection` derives depth from the 2D length.
- Constants and helpers:
  ```js
  export const GUARD_R = { e: [0.36, 0.54], w: [0.45, 0.33] };            // fist at the chin
  export const JAB_R = { e: [0.40, 0.41], w: [0.41, 0.38] };              // straight at the camera, a little up (head height)
  export const CHEST = { l: { e: [0.64, 0.57], w: [0.57, 0.50] }, r: { e: [0.36, 0.57], w: [0.43, 0.50] } };
  export const SHOVE = { l: { e: [0.60, 0.45], w: [0.59, 0.44] }, r: { e: [0.40, 0.45], w: [0.41, 0.44] } };
  export async function jab(page, { side = 'right', fast = true } = {}) { /* GUARD 12 frames → JAB: fast = 3 frames @33 ms; slow = 20 interpolated frames @70 ms; fist curl 0.9 */ }
  export async function shove(page, { fast = true } = {}) { /* CHEST 15 → SHOVE 3 @33 ms, both curl 0 */ }
  export async function squatUp(page) { await feed(page, { arms: 'down', noseY: 0.62 }, 12, 40); await feed(page, { arms: 'down', noseY: 0.25 }, 12, 40); }
  export async function grip(page, side, from = 0, to = 0.9, n = 4) { /* `raise: 90` (arms out sideways), the side's curl from → to over n frames */ }
  export async function jerk(page, side) { /* raise 90 for 10 frames, then arms 'hang' 3 frames @33 ms (straight, fast, ≥ 1.4 units) */ }
  ```

### 10.2 Unit tests (`npm test`)

**`tests/unit/impact.test.js`**
1. **classify:**
   - `classify(2.9)==='none'`, `classify(3)==='stagger'`, `classify(10.99)==='stagger'`, `classify(11)==='knockdown'`
   - `classify(14,{crouch:true})==='stagger'`, `classify(15.5,{crouch:true})==='knockdown'`
   - `classify(30,{dome:true})==='none'`, `classify(30,{blocked:true})==='stagger'`, `classify(11,{blocked:true})==='none'`
   - `classify(40,{swim:true})==='stagger'` (never a knockdown in water)
   - `classify(3,{frozen:true})==='shatter'`, `classify(2,{frozen:true})==='none'`
2. **fallDir:**
   - At yaw 0: impulse (0,0,+1) → 'back'; (0,0,−1) → 'front'; (+1,0,0) → 'right'; (−1,0,0) → 'left'.
   - At yaw π/2: (+1,0,0) → 'back'.
   - `KD_NAME[KD[d]]===d` for all four; `KD.left===1`.
3. **segmentBox:**
   - half [0.6,0.6,0.6]: a=[0,0,−2], b=[0,0,2] → t≈0.35, n=[0,0,−1].
   - a=[0,0,−1], b=[0,0,1] → t≈0.2 (the box crossed within one step).
   - Parallel at x=0.8: r=0.1 → null; r=0.25 → hit.
   - a=[0,0,0.5], b=[0,0,0.55] → `{t:0, inside:true, n:[0,0,1]}`.
4. **headKick:**
   - Jab lp [0,0.1,−0.6], dir [0,0,1], speed 6: pitch > 0, |yaw| < 1e−9, |roll| < 1e−9; pitch(9) > pitch(6).
   - Speed 100: |w| ≤ 8 + 1e−9.
   - Hook lp [0.6,0.1,−0.3], dir [−1,0,0]: yaw > 0 and roll > 0.
5. **HeadJolt:**
   - `kick({pitch:3.8})`, steps of 1/60: the peak `a` is in [0.15, 0.35] at t ∈ [0.08, 0.20]; |a| ≤ 0.7 always; after 0.9 s |a| < 0.02; the minimum stays above −0.1.
   - Peaks at dt 1/30 and 1/144 are within 10 % of each other.
6. **thunderPush:** `thunderPush(0)===20`, `thunderPush(20)≈11`, `thunderPush(30)≈6.5`, `thunderPush(40)===2`.

**`tests/unit/spell-physics.test.js`**
1. **Every spell is reviewed:** for every name in `Object.keys(SPELL_COST)` ∪ `Object.keys(DUEL_SPELLS)` ∪ `['Sapira','Sands','Inferno','Ice','Lightning','LightningCatch','LightningHold','Storm','WallRise','WallRiseMaxima','Attack','Nox','Draw','Reveal','Rescue','Stand','Pause','Maxima','Frozen','Gather','CreateFloor','CreateWall','CreateCeiling','BuildRoof','CreateDoor','Fire','Waterball','WaterForming','Flight']`, `Object.prototype.hasOwnProperty.call(SPELL_PHYSICS, n)` is true.
2. **Light spells move nobody:** Lumos, LumosMaxima, Nox, Draw, Reveal, Accio, ChangeColor, CreateBed, Gather, Brainrot, ToTheSun, Rescue, Stand all give `spellOutcome(n, 1)==='none'`.
3. **Graded outcomes** (`spellOutcome`):
   - Inferno(5) 'none'; Sands(5) 'stagger'
   - Wind(8) 'stagger', Wind(2) 'knockdown'; WindMaxima(10) 'knockdown'
   - WaveAttack 'stagger'; WaveAttackMaxima 'knockdown'
   - Thunderwave(10) 'knockdown', Thunderwave(30) 'stagger'
   - Bombardo(2) 'knockdown', (5) 'stagger', (6.5) 'none'; BombardoMaxima(7) 'knockdown'
   - SapiraDuel 'knockdown'; Stupefy, Earthquake, EarthquakeMaxima, Lightning 'knockdown'
   - WallRise 'stagger', WallRiseMaxima 'knockdown'
   - Stupefy with `{dome:true}` → 'none'
4. **Combat path:** with `fakeGame` from combat.test.js plus `impact = new BodyImpact(g)` and `knock = new Knockdown(g)` (character stub with rotation/head/isCrouching):
   - `hitBySpell('Thunderwave', FRONT10, 'enemy', push(thunderPush(10)))` → hp 17, `knock.state==='falling'`, `knock.dir==='back'`.
   - With Protection facing: blocked, hp 20, `knock.state==='up'`, `|knockback| ≈ 0.25·v` (±0.1).

**`tests/unit/knockdown.test.js`** (fake game: character stub or a real `VoxelCharacter`; hud/flight/beds/animals/levitation/combat stubs; `g.currentPose` set per step)
1. **Squat to rise:**
   - `knock({dir:'back'})` → 'falling', `ch.knockedDown`, `ch.fallDir==='back'`, `netCode()===2`; after 0.5 s → 'down'.
   - At down-t 1.0: crouch 0.3 s, then stand → still 'down'.
   - At ≥ 1.5: crouch 0.3 s, stand → 'rising' then 'up' after 0.7 s; `knockedDown` false; `netCode()===0`.
   - A 0.1 s crouch plus stand → no rise.
2. **Bow:** `torso.noseRel` 0.1 for 0.3 s, then 0.6 → rises (after `MIN_DOWN`).
3. **Stun:** `combat.stunned=true` for 3 s with squats → stays 'down'; then stunned=false, squat → rises.
4. **No camera vs camera:**
   - `currentPose=null` → 'up' by t ≈ 6 s (within 6.0-6.3).
   - Pose standing with no gesture for 20 s → still 'down'.
5. **Second knock:** a second `knock` at 1.2 s with down 2.5 → state stays 'down' (not 'falling'), `minDown ≥ 3.7`.
6. **Landing:**
   - `ch.landing={drop:6, speed:15, at:now+1}` → 'down'.
   - `{drop:3, speed:7.7}` → 'up'.
   - `swimY=0` → 'up'.
   - `impact.gentleUntil=now+3000` → 'up'.
7. **Stagger:** `stagger({dir:'back', v:6})` → 'stagger', `ch.stepping>0`, `ch.staggerLean>0`, `serializePose().sg===1`; 'up' after ≤ 0.8 s.
8. **Character (real VoxelCharacter):**
   - `knockedDown=true, fallDir='back'`, update 1 s → `rotation.x` within 1.45±0.05, `rotation.z≈0`.
   - `'right'` → `rotation.z≈−1.4`.
   - Back up for 2 s → `rotation.x===0` exactly (ownership released).
   - `serializePose().kd===2`.
   - The lying `heroBody` from the group quaternion has `hypot(ux,uz) ≥ 0.5`.
9. **Landing tracking:** a real VoxelCharacter with a ground stub at −0.5, `y=ground+2+8`, update until on the ground → `landing.drop≈8` (±0.3), `landing.speed≈17.9` (±1).

**`tests/unit/body-strikes.test.js`** (migrates "punch: only a fast fist…" from combat.test.js:249-276; the victim is a real `VoxelCharacter` facing the attacker; the attacker is a stub character whose knuckle point and velocity are set by the test; spies on `sync.playerHit` and `sync.playerPush`)
1. Fist resting 0.3 in front of the face, still → no message.
2. Slow fist (2 u/s) into the face → no message; `contact.right.part==='head'`; `setHandOffset` called with length ≈ depth.
3. Fast fist (7 u/s) into the face → exactly one `playerHit` with `k:'punch', pt:'head'`, `lp[2] < −0.4` (the face side), `i` along the punch, `|i|≈0.25·7`.
4. The same hand again within 0.35 s → nothing more.
5. `isRunning=true` → no punch.
6. Victim 4 units beyond reach → nothing.
7. Fast open palm (curl 0.1) into the face → `playerPush{k:'slap'}`, no `playerHit`.
8. Victim's forearm rotated across the face (elbow anchor set to guard) → `playerPush{k:'guard', pt:'arm'}`, no head hit.
9. Both palms into the chest 0.1 s apart → exactly one `playerPush{k:'shove', n:2}`, `|i|≈0.9·v`. Palms 0.3 s apart → two `{k:'push', n:1}`, each `≈0.6·0.9·v`.
10. Running shove (attacker `bodyVelocity` 7.5 toward the victim, two palms at 6) → `|i| ≥ 11`.
11. Tunnelling: the fist moves 1.6 units through the head in one step → still a punch.
12. Remote dome (`combat.shield=2, shieldLeft>0`) → no message.
13. **Victim side:** `BodyImpact.onStrike` with `{k:'punch', pt:'head', lp:[0,0.1,−0.6], i:[0,0,1.75], sp:7}` → `jolt.pitch` peaks > 0.1 within 0.2 s and `knock.state==='up'`. With `i` length 40 → clamped (`|knockback|≤30`). The same message twice within 0.1 s → applied once. An attacker 10 units away → ignored.

**`tests/unit/hand-hold.test.js`**
1. **leash:**
   - Held standing, holder palm 1 beyond reach → `move===null`, `excess≈1`.
   - Held walking toward it → `move` ≈ u·1.
   - Held walking away (facing −u) → `away===true`, `move===null`.
   - Holder with a standing held player → `move` pulls the holder by e toward their shoulder.
   - Holder with `otherWalking` → `move===null`.
   - Within reach → nothing.
2. **closingAround:**
   - Open-near at t=0, closed-near at t=0.4 → true.
   - A fist (0.8) all along → false.
   - Open far, then closed near → false.
   - Closing over 1.0 s → false.
3. **HandHold with a fake game** (two stub remotes with characters and `palm` positions, a sync spy):
   - Closing near → `hold on` sent and `mine.right.state==='pending'`; on `held{on:1, holder:me}` → 'on'.
   - Holder curl 0.2 for 0.2 s → `hold on:0`, `setGrip(null)`.
   - **Held side:** a straight 1.6 move in 0.2 s in `duel.jerk.right` after 0.5 s → `held{on:0, f:1}`.
   - Held hand holding a sword → `held{on:0}` (refusal).
   - `onLeave(id)` clears everything.

### 10.3 E2E: new file `tests/e2e/physical.test.mjs` (`npm run test:e2e`)

PORT `ZNS_TEST_PORT||8195`, PEER 9030. `openPlayer` as in multiplayer.test.mjs (free world is the default for `#mp-private-btn`). Reuse the flat-lane finder (multiplayer.test.mjs:194-210). Probes use the `requestAnimationFrame` watcher pattern (`__solidWatch`, 233-249).

**Test 1. A real punch in the face: the head snaps back, the victim's view turns, 1 HP; a slow touch does nothing; the fist never goes inside**
1. Attacker A (host, yaw 0) on the lane. `feed(A, JAB pose, 15)`, read the knuckle point K (`g.strikes._knuckles('right')`), then `feed(A, GUARD, 15)`.
2. Victim V: origin = K + forward·0.35 − (0,2.1,0), yaw π, `knock.reset()`. Wait until A sees V within 0.3.
3. Probes:
   - V: max `|jolt.pitch|` and max camera quaternion `angleTo` its baseline.
   - A: max penetration of A's drawn right palm into V's head box (`head.worldToLocal`).
   - A: max `|Δ head.rotation.x|` of the remote V.
4. `jab(A, {fast:true})`.
5. Assert within 3 s:
   - V `combat.hp===19`
   - V probe maxPitch ≥ 0.12 and maxCam ≥ 0.1
   - `A.strikes.log` has `{k:'punch', pt:'head'}`
   - A's palm penetration ≤ 0.1
   - A sees V's head pitch change ≥ 0.08
   - after 1.5 s V `|jolt.pitch| < 0.03` and `knock.state==='up'`
6. Slow touch: `jab(A, {fast:false})` → after 2 s V hp still 19, V maxPitch (new probe) < 0.03, no new punch in the log.
7. Guard: `feed(V, GUARD, 15)` (V's forearm before its face), then `jab(A)` → V hp 19, V maxPitch < 0.05, A log last `{k:'guard'}`.
8. `realErrors` empty on both pages.

**Test 2. Two hands shove: a stagger back without harm; a running shove knocks down on the back; up only after a squat; everybody sees it**
1. Place V so its chest is 0.45 beyond A's extended palms (SHOVE pose measured as in Test 1).
2. `shove(A)` →
   - V moved ≥ 0.8 along A's forward within 1.5 s
   - the V probe saw `knock.state==='stagger'` and never 'falling'
   - V hp 20
   - A saw V's `target.s.sg===1` at least once
3. Running shove: re-place V; `A.character.setRunning(true,1)` for 0.25 s, then `shove(A)` →
   - A log `{k:'shove', n:2}` with `|i| ≥ 11` (log it if not; for determinism also a direct `A.sync.playerPush(V, {k:'shove', n:2, i:[0,0,−14]})`)
   - V `knock.down`, `knock.dir==='back'`, `rotation.x>1.2` within 1 s
   - A sees `remote.character.knockedDown===true`, `rotation.x>1.0`, `flying===false`
   - V hp 20
4. Get up: at V down-t < 1.5, `squatUp(V)` → still down. After 1.6 s, `squatUp(V)` → V `knock.state==='up'` within 1.5 s, `rotation.x<0.05`; A sees `knockedDown===false`.
5. Knock V again and feed no poses → 'up' within 8 s (auto-rise).

**Test 3. Spells move players by their strength**
Host H casts at guest G with `castAt` (multiplayer.test.mjs:417), `G.knock.reset()` between steps.
1. Thrown Lumos at G (`wandMagic.addThrown`) → G displacement < 0.05, `knock.state==='up'`.
2. Wind at 8 → G displacement ≥ 1, the probe saw 'stagger', hp unchanged.
3. Thunderwave at 10 → G down 'back', hp −3. Thunderwave at 30 → stagger only.
4. Earthquake toward G (`g.spells.cast('Earthquake', groundOrigin, dir, 'right', id)` + `sync.spell`) →
   - G `knock.down`, `combat.stunned===false`, hp 17
   - while lying, `G.castLocalSpell('protection')==='Protection'` (with `isArmExtended` stubbed true)
   - Flight refused while down
5. Protection facing H, Thunderwave at 10 → hp 20, `knock.state==='up'`, displacement < 1.5.
6. Leviosa fall: `G.levitation.liftMe(hostId)`, set G y += 8 at its hold point, `dropMe(false)` →
   - after landing G `knock.down` and hp decreased by `fallDamage(drop)`
   - repeat from +2 → no knockdown
   - `dropMe(true)` from +8 → no knockdown
7. Breakthrough: H `_raiseWall(false)` with G standing 3.5 in front → G thrown back ≥ 1.5 and 'stagger'. Maxima → 'down'.

**Test 4. Holding hands**
1. A and B side by side facing −Z, arms out (`raise: 90`, open). Place B so A's left palm ≈ B's right palm (±0.2), computed from both pages.
2. `grip(A, 'left')` →
   - `A.handHold.mine.left.state==='on'` within 2 s
   - `B.handHold.held.right.by===A`
   - both HUD voices contain «за руку»
   - on A's screen, B's right palm is within 0.35 of A's left palm (`reachHand` applied)
3. **Standing can't be dragged:** B stands; `A.setRunning(true,0.5)` for 2 s → A's displacement ≤ 0.8 and B's ≤ 0.1. The link holds.
4. **Walking along is pulled:** `B.setRunning(true,0.3)`, `A.setRunning(true,1)` for 2 s → B moved ≥ 2.5 forward; on B's screen `|A palm − B shoulder| ≤ 2.35`. The link holds.
5. **Walking away breaks free:** B turns (yaw π) and walks → B's `held` cleared within 1.5 s, A's `mine` cleared, B's HUD shows «вырвались».
6. Re-grab; `jerk(B,'right')` → broken within 1 s on both pages.
7. **Refusal:** B takes a sword in the right hand (`weapons` grab helper) and A grips → A's `mine.left` is null within 1.5 s.

**Test 5 (single player, creative). Falling from height makes you fall over; get up by squatting**
1. `openPage` + `startFromMenu('creative')`, `feed` standing poses.
2. `g.character.group.position.y += 9`; wait → `knock.state==='down'` within 3 s, hp unchanged (creative).
3. `squatUp` after 1.6 s → 'up'.
4. `+2.5` → never down.
5. Thrown off by your own Bombardo at 2 m (`g.explode(nearPos, 3.6, g.localId)`) → down 'back' or a side, plus a landing shake.

---

## 11. Hooks for the mana request (#123)

The user's current message asks for these. This design gives them what they need:
- **"A spell counts only if it really worked on a player."** Only the victim's computer knows that. `BodyImpact.apply` sends `sok{to: caster, n: spell, r}` whenever a player-targeted spell had an effect (stagger, knockdown, damage). On the caster, `Game.onSpellLanded(n, victimId, r)` calls the mana practice rule (+1 max mana; +3 the first time for a strong spell). Duel spells already report on arrival (`dend` 'hit'); `onSpellLanded` can also be fed from `Duel.remoteEnd(id, 'hit')` for own bolts.
- Leviosa "really lifted something" stays local to the caster (`Levitation.cast` success, `onNetLift` on).
- Knockdown, stagger and death resets do not touch mana. Respawn resets the knockdown, jolt and hand links (§3.6), and #123 resets max mana to 30 in the same `respawn()`.

---

## 12. Files touched

New:
- `src/game/Impact.js`
- `src/game/Knockdown.js`
- `src/game/BodyImpact.js`
- `src/game/BodyStrikes.js`
- `src/game/HandHold.js`
- `tests/unit/impact.test.js`
- `tests/unit/spell-physics.test.js`
- `tests/unit/knockdown.test.js`
- `tests/unit/body-strikes.test.js`
- `tests/unit/hand-hold.test.js`
- `tests/e2e/physical.test.mjs`

Modified:
- `src/entities/Character.js`: fall dirs, pitch ownership, stagger, stepping, `slowScale`, landing, `kd`/`sg`, `setHandOffset`
- `src/net/RemoteAvatar.js`: `restoreArms` first, `kd`/`sg`, `flying` rule, `vel`, delayed hide
- `src/net/NetSync.js`: `phit` extended, `ppush`, `hold`, `held`, `sok`, `onLeave`, header doc
- `src/game/Combat.js`: `hitBySpell` → impact, `meleeHit` return value, `hitRemote(extra)`, `meleeTarget`, `updatePunches` removed, `revive`/`update`/`_hud`, chill `slowScale`
- `src/game/Game.js`: construct the five systems, `_updatePlayer` (head base + jolt, down ⇒ no walk or crouch, friction), `_updateCamera` jolt, `castLocalSpell`/`startFlight` guards, `_quakeMe`, `_blowMe`, `applyExplosion`, `_raiseWall` sync, `onLocalHit` extra, `respawn`, frame order, `bodyVelocity`
- `src/fx/SpellManager.js`: Thunderwave push, quake dir, `blowMe` name, Wave formula, `WallRise`
- `src/game/Duel.js`: `applyToMe` physics
- `src/game/Levitation.js`: `gentleUntil`; Attack extra
- `src/game/WaterMagic.js`: balls hit players
- `src/game/Gear.js`, `src/game/CastleLife.js`, `src/game/Animals.js`, `src/game/Spider.js`: `impact.apply`
- `src/ui/Codex.js`: texts
- `tests/e2e/poses.mjs`: overrides + helpers
- `tests/unit/combat.test.js`: the punch test moved to body-strikes
- `tests/e2e/multiplayer.test.mjs`: `knock.reset()` in `aim` helpers

Conflict risk with the engineer already working in the repo: Game.js (frame order, `_updatePlayer`), NetSync.js (`switch` cases) and Combat.js are hot spots. Each phase touches small, separate hunks.