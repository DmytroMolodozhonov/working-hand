Nothing was edited in /home/user/working-hand. Of the five items, only the bow's aim (part of #78) is already done; everything else is still open. I measured the problems below in the running game with synthetic poses and in node, and the fitted finger poses were checked offline in node with the real `SimplifiedHand`. The other proposed code was not run.

Experiment scripts are in /tmp/claude-0/-home-user-working-hand/c56317fb-a629-5b40-ba8b-0996403aa7d1/scratchpad/inv5/:
- `exp1.mjs` – accidental drops and throws
- `exp2.mjs` – how each kind sits in the hand
- `exp3.mjs` – pick-up from pedestals and the chest
- `exp4c.mjs` – the bow, with the committed archer pose
- `gripfit.mjs`, `gripfit2.mjs`, `verify.mjs` – fitting and checking finger poses offline

Commit b2a5c02 landed while I was working, so the bow numbers below are from the current code.

**What is already done (verified):**
- **#78 aim:** `bowAim` (Gear.js:55-67, used at 169-171) makes the arrow fly along the bow arm. With the committed archer pose the shot went 4.5° from straight ahead. It is covered by tests/unit/bow-aim.test.js and holding.test.mjs:160.
- **#82, partly:** a lost hand never drops a weapon (Weapons.js:257-261, `tracked` requires a hand seen within 400 ms). Items never drop by opening at all. Measured: hand unseen for 3 s, or the whole pose gone for 3 s, and the sword stayed.
- **#87, partly:** weapons already need the fingers to close on the handle (Weapons.js:280-302). The pedestal sword handle (y 2.37–2.87, shoulder at 2.75) is reachable: closest grip point to handle 0.35, grab radius 0.55.

---

## #82 Nothing drops by accident

**Current behaviour (measured)**
- **Weapons drop on any open hand, wherever the arm is.** Weapons.js:256-272 releases when the tracked curl is below 0.28 for 160 ms. Measured:
  - Sword held, arm hanging at the side, half-open hand (curl 0.16): the sword fell.
  - Arm down, open hand: the sword fell.
  - Weapons.js:259 also counts a hand never seen (`lastTrackingTime` 0) as tracked.
- **Items "throw" on any world-speed spike.** Items.js:318-342 throws on a fast move that stops (≥7 m/s, +1.2 per weight unit, curl ≤0.45, 3 samples in a row). The speed it uses is the palm's world velocity (Character.js:392-404), so body motion counts. Measured with a loosely held hand (curl reading about 0.25):
  - Running at 7.5 m/s for 1.2 s, then stopping: the apple, the wand and even the shield (which needs 10.6 m/s) were thrown.
  - Crouching then standing up: the apple left the hand.
  - A quick jab from 'down' to 'forward' with no wind-up (peak 7.86 m/s): the apple was thrown.
- **Wood throw:** Beds.js:324-345 (`_updateWoodThrow`) is even looser (peak over 6.5 then stop, no curl check).
- **`isArmExtended` can't be reused** (Character.js:282-286): it only checks distance, so a hanging arm reads "extended" (measured for every curl).
- **SimplifiedHand loss handling:** after 2 s lost, the fingers decay to open (SimplifiedHand.js:203-215) and `getGripCurl` reads 0. Only the 400 ms tracking check stops that from causing a drop.

**Root cause**
- The weapon release looks only at the fingers, never at where the arm is.
- The items' throw uses world velocity and has no wind-up.
- The arm model always guesses the arm is in front of the body (Character.js:179-188, `dz = -zFactor*2`), so "behind the shoulder" can only come from the pose landmark z, not from the 3D model.

**Code changes**

1) New pure module `src/game/HandRelease.js`:
```js
/** When a held thing leaves the hand: only (1) an OUTSTRETCHED hand clearly opened, or
 *  (2) a real throw (wind-up by the head / behind the shoulder, fast swing, fingers open). */
export const DROP = { OPEN: 0.25, CLOSED: 0.5, HOLD_MS: 250, REACH: 0.8, FORWARD: 0.5, STILL: 2.5, PALM_UP: 0.6 };
export const THROW = { UP: 0.3, BACK: 0.1, DEPTH: 0.12, WINDOW_MS: 900, SPEED: 6, PER_KG: 1.2, TRAVEL: 0.6, OPEN: 0.4, LATE_MS: 300 };

/** The camera's depth says the wrist is behind the shoulder (pose z: bigger = further). */
export const poseBehind = (pose, side) => {
    const w = pose?.[side + 'Wrist'], s = pose?.[side + 'Shoulder'];
    return !!(w && s && (w.z || 0) - (s.z || 0) > THROW.DEPTH);
};

export class DropGate {
    constructor() { this.reset(true); }
    /** armed=false: the thing came into an open hand (Accio / slot) — kept until it has closed once */
    reset(armed = true) { this.armed = armed; this.since = 0; }
    /** reach: |hand−shoulder|/armLen, forward: cos to straight ahead, speed: vs the body, palmUp: cos(palm normal, up) */
    update({ now, curl, tracked, reach, forward, speed, palmUp }) {
        if (!tracked) { this.since = 0; return false; }              // a lost hand never drops
        if (curl > DROP.CLOSED) this.armed = true;
        const opening = this.armed && curl < DROP.OPEN && reach > DROP.REACH && forward > DROP.FORWARD
            && speed < DROP.STILL && palmUp < DROP.PALM_UP;          // (an apple on a flat palm, for a horse, stays)
        if (!opening) { this.since = 0; return false; }
        if (!this.since) this.since = now;
        return now - this.since >= DROP.HOLD_MS;
    }
}

export class ThrowDetector {
    constructor() { this.reset(); }
    reset() { this.cockAt = -1e9; this.cock = null; this.peak = null; }
    /** hand/shoulder/vRel: body space (x right, y up, z back), vWorld [x,y,z]; → null | {speed, vRel, vWorld, at} */
    update({ now, hand, shoulder, vRel, vWorld, curl, tracked, behind = false, weight = 1 }) {
        const speed = Math.hypot(vRel.x, vRel.y, vRel.z);
        if (!this.peak && (hand.y - shoulder.y > THROW.UP || hand.z - shoulder.z > THROW.BACK || behind)) {
            this.cockAt = now; this.cock = { x: hand.x, y: hand.y, z: hand.z };
        }
        if (this.cock && !this.peak && now - this.cockAt > THROW.WINDOW_MS) this.cock = null;
        if (this.cock && speed > THROW.SPEED + THROW.PER_KG * weight && (-vRel.z > 0 || vRel.y < 0)
            && Math.hypot(hand.x - this.cock.x, hand.y - this.cock.y, hand.z - this.cock.z) > THROW.TRAVEL
            && (!this.peak || speed > this.peak.speed)) this.peak = { speed, vRel: [vRel.x, vRel.y, vRel.z], vWorld: [...vWorld], at: now };
        if (!this.peak) return null;
        if (now - this.peak.at > THROW.LATE_MS) { this.reset(); return null; }  // the fist kept hold: a chop, not a throw
        if (tracked && curl < THROW.OPEN) { const p = this.peak; this.reset(); return p; }  // (a hand lost in the blur waits ≤300 ms)
        return null;
    }
}
```

2) `Character.js`: add a hand velocity relative to the body, plus two helpers.
```js
// constructor
this.handRelVelocity = { left: new THREE.Vector3(), right: new THREE.Vector3() }; this._lastHandLocal = { left: null, right: null };
// update(), after the world-velocity loop (392-404)
this.group.updateMatrixWorld(true); _m4.copy(this.group.matrixWorld).invert();
for (const side of ['left', 'right']) {
    this.getGripObject(side).getWorldPosition(_v1).applyMatrix4(_m4);
    const last = this._lastHandLocal[side];
    if (last && dt > 0) { this.handRelVelocity[side].lerp(_v2.subVectors(_v1, last).divideScalar(dt), 0.5); last.copy(_v1); }
    else this._lastHandLocal[side] = _v1.clone();
}
/** The arm in the body's space: hand, shoulder, reach (×arm length), forward (cos), speed vs the body, palmUp (cos). */
armState(side, out = {}) {
    this.group.updateMatrixWorld(true); _m4.copy(this.group.matrixWorld).invert();
    out.shoulder = (side === 'left' ? this.leftArmAnchor : this.rightArmAnchor).getWorldPosition(out.shoulder || new THREE.Vector3()).applyMatrix4(_m4);
    out.hand = this.getHandWorldPosition(side, out.hand || new THREE.Vector3()).applyMatrix4(_m4);
    const d = _v3.subVectors(out.hand, out.shoulder), len = d.length() || 1e-6;
    out.reach = len / (this.BONE_LENGTH_UPPER + this.BONE_LENGTH_LOWER); out.forward = -d.z / len;
    out.vRel = this.handRelVelocity[side]; out.speed = out.vRel.length(); out.vWorld = this.handVelocity[side];
    const g = this.getGripObject(side);   // the palm side is −Z of the palm box (both hands)
    out.palmUp = g.name === 'palm' ? -_v1.setFromMatrixColumn(g.matrixWorld, 2).normalize().y : 0;
    return out;
}
isHandTracked(side) { const h = this.getActiveHands()[side]; return !!h && h.lastTrackingTime > 0 && Date.now() - h.lastTrackingTime < 400; }
```

3) `Weapons.js`:
- `_handState` (65-67): add `drop: new DropGate(), thr: new ThrowDetector()`. Remove `openSince`, `RELEASE_CURL` and `RELEASE_HOLD_MS`.
- In `_updateHand`, replace lines 259-272:
```js
const tracked = ch.isHandTracked(side);
if (curl < OPEN_CURL && tracked) { hs.lastOpen = now; hs.lastOpenFrame = this.frame; }
if (hs.held) {
    const w = hs.held;
    if (w.holder == null || w.holder.side !== side) { this._forget(side, hand); return; }
    const arm = ch.armState(side, hs.arm || (hs.arm = {}));
    const thr = hs.thr.update({ now, hand: arm.hand, shoulder: arm.shoulder, vRel: arm.vRel, vWorld: arm.vWorld.toArray(), curl, tracked, behind: poseBehind(this.game.currentPose, side), weight: w.mass });
    if (thr) { this.release(side); w.velocity.fromArray(thr.vWorld).clampLength(0, 22); return; }
    if (hs.drop.update({ now, curl, tracked, ...arm })) { this.release(side); return; }
    this._driveHeld(side, dt, ch); return;
}
```
- `grab()`: call `hs.drop.reset(true); hs.thr.reset()`.
- Accio.js:196, Inventory.js:260 and Inventory.js:416: replace `hands[side].waitClose = true` with `hands[side].drop.reset(false)`.

4) `Items.js`:
- Constructor: add per-side `DropGate` and `ThrowDetector` (`this._drop`, `this._thr`) and `this._arm`.
- `takeIntoHand(item, side, { closed = false } = {})`: call `this._drop[side].reset(closed)`. `_gotItem` passes `closed: true`.
- Replace lines 318-342:
```js
for (const side of ['right', 'left']) {
    const h = this.held[side]; if (!h) continue;
    if ((h.item.kind === 'bow' && g.gear?.nock) || (h.item.kind === 'book' && g.books?.readingSide) || (h.item.kind === 'scroll' && g.scrolls?.readingSide) || this._otherHandTakes(side, h)) { this._thr[side].reset(); this._drop[side].since = 0; continue; }
    const arm = ch.armState(side, this._arm[side]), curl = ch.getGripCurl(side), tracked = ch.isHandTracked(side);
    const thr = this._thr[side].update({ now, hand: arm.hand, shoulder: arm.shoulder, vRel: arm.vRel, vWorld: arm.vWorld.toArray(), curl, tracked, behind: poseBehind(g.currentPose, side), weight: ITEM_INFO[h.item.kind]?.weight ?? 1 });
    if (thr) { this._throw(side, this._throwVelocity(side, thr, new THREE.Vector3()), { spin: ch.palmSpin?.[side] }); continue; }
    if (this._drop[side].update({ now, curl, tracked, ...arm })) this._throw(side, ch.handVelocity[side].clone().clampLength(0, 2));
}
```
  - `_otherHandTakes` returns true when the other, empty hand's fist (curl > 0.6) is within 1 m of the thing. Without it, Gear.js:201's hand switch (opening the bow hand) would drop the bow before the switch happens.
- Delete `_handHist` (lines 53 and 319-323).
- Beds.js:324-345: drive the wood-stack throw through the same `ThrowDetector` (right hand, weight 1.2).

**Tests**
- Unit, new `tests/unit/hand-release.test.js`. `DropGate` (armed, palm down):
  - Outstretched (reach 0.9, forward 0.9), curl 0.1, still: `false` at 200 ms, `true` at 260 ms.
  - Same with reach 0.95 but forward −0.9 (hanging arm), held 3 s: never `true`.
  - `tracked: false`, curl 0, 5 s: never `true`.
  - Open 100 ms, one frame closed, open 100 ms: never `true`.
  - `palmUp: 0.9`: never `true`.
  - `speed: 5`: never `true`.
  - `reset(false)`: open never drops until curl 0.6 is seen once, then it drops after 250 ms.
- Unit, same file. `ThrowDetector`:
  - Overhand: hand 0.5 above the shoulder at t=0, then vRel (0, −3, −9) for 3 frames (travel over 0.6), curl 0.2 at t=150 → returns `speed > 9` and `vWorld` equal to the peak frame's.
  - Same swing starting from the hip (y −0.6, z 0) → `null`.
  - Wind-up and swing but curl stays 0.9 → `null`, and opening at peak+400 ms → still `null`.
  - Swing, then `tracked: false` for 200 ms, then seen with curl 0.1 → returns the peak.
  - vRel 0 with vWorld 7.5 (running) and curl 0.2 → `null`.
  - Weight 4 at 8 m/s → `null`; at 12 m/s → throws.
  - Wind-up at t=0, swing at t=1200 → `null`.
- Unit, Character: move `group.position` at 7.5 m/s for 30 frames with the arms still → `handRelVelocity.right.length() < 0.3` and `handVelocity.right.length() ≈ 7.5 ± 0.5`. Turning yaw 2 rad/s → `handRelVelocity < 0.3`.
- Unit, update `tests/unit/weapons.test.js:165-179`: the release step must first point the right arm forward (`ch.rightArmAnchor.lookAt(<point 2 m ahead>)`, elbow rotation 0) and fake tracking with `hand.lastTrackingTime = Date.now()`. Add the case "arm hanging + open for 1 s → still held".
- e2e, `holding.test.mjs`, "nothing falls by accident". Take an apple into the right hand and grab a sword in the left, then:
  - `feed({ arms: 'hang', rightCurl: 0.1, leftCurl: 0.1 }, 60)` → both still held.
  - `feed({ rightCurl: null, leftCurl: null }, 90)` → both held.
  - Monkeypatch `ch.update` to move 7.5 m/s for 1.2 s then stop (as in exp1), with `rightCurl: 0.12` → no loose apple.
  - Feed `noseY` 0.6 then 0.25 → apple held.
  - Jab 'down' ↔ 'forward' 4 times with `rightCurl: 0.15` → apple held.
  - Then `feed({ arms: 'forward', rightCurl: 0 }, 20)` → the apple is loose with `L.vel.length() < 3`, and the left-hand sword drops the same way (`hands.left.held === null`, `w.holder === null`).

## #83 Throwing

**Current behaviour (measured)**
- **Detection:** no wind-up (see #82); the release velocity is the smoothed peak world velocity (Items.js:340).
- **Weight:** the launch speed is scaled by `1.2/(0.4+0.5w)`, clamped to 0.25–1.3 (Items.js:267).
- **Spin and orientation:** `spawnLoose` resets the thing's rotation and gives it a random spin (Items.js:67-68). The hand's orientation and the wrist's snap are lost. Spin is applied as Euler-angle increments (Items.js:366), which is not a real angular velocity.
- **Flight:** gravity 14, linear drag 1.6/s if weight is under 0.7, else 0.15/s (Items.js:361-364). There are no collisions except the ground. Measured in node with the real `ItemSystem` and a fake game, launching from (0,3,0) at (10,6,0):

| Thing | Lands at x |
|---|---|
| apple | 5.47 |
| scroll | 5.47 (same as the apple) |
| hammer | 12.72 (heavy things fly 2.3× further for the same launch) |

  An apple thrown at a wall spanning x 2.5..7.5 got to x 5.30, i.e. inside the wall.
- **Network:** a guest's throw sends position and velocity only (NetSync.js:497), no orientation or spin.

**Code changes**
- **Detection:** the `ThrowDetector` from #82.
- **Release velocity:** the camera can't see arm depth, so the direction is where the thrower looks, raised slightly above eye line. Speed comes from momentum (a heavy thing gets less), plus the body's own speed.
```js
const ARM_MASS = 1.2;
_throwVelocity(side, thr, out) {
    const ch = this.game.character, m = ITEM_INFO[this.held[side].item.kind]?.weight ?? 1;
    out.set(0, 0, -1).applyQuaternion(ch.getHeadQuaternion(_q)); out.y += 0.25; out.normalize();
    const body = _v2.fromArray(thr.vWorld).sub(_v.fromArray(thr.vRel).applyQuaternion(ch.group.quaternion));
    return out.multiplyScalar(thr.speed * 1.1 * Math.sqrt(ARM_MASS / (ARM_MASS + m))).add(body).clampLength(0, 22);
}
```
- **`_throw(side, vel, { spin } = {})`:** keep the signature, because world.test.mjs:350 and book.test call `_throw(side, vec)`. Pass `quat: h.model.quaternion` and `spin` into `spawnLoose` and into `sync.itemThrow(item, pos, v, q, w)` (NetSync.js:497 and 669). Drop the weight factor at Items.js:267, since the momentum formula above replaces it.
- **Palm spin:** `Character.palmSpin[side]`, in rad/s, from the palm's world quaternion change per frame: `2·acos(w)·axis / dt`, smoothed with a 0.5 blend and capped at 20 rad/s.
- **`spawnLoose(item, pos, { vel, quat, spin, hover, rise })`:** copy `quat`. Only randomise the spin when none is given (loot spills).
- **`_physics`** (Items.js:358-372):
```js
const AERO = { book: 0.25, scroll: 0.12, wool: 0.12, backpack: 0.05, shield: 0.04, pie: 0.03, bow: 0.025, bread: 0.02, wand: 0.02, cheese: 0.015, meat: 0.015, steak: 0.015, arrows: 0.01, coins: 0.008, apple: 0.008, logs: 0.006, hammer: 0.004 };
L.vel.y -= 14 * dt;
L.vel.multiplyScalar(1 / (1 + (AERO[L.item.kind] ?? 0.02) * L.vel.length() * dt));      // quadratic drag: shape and weight
const w = L.spin.length();
if (w > 1e-3) { m.quaternion.premultiply(_q.setFromAxisAngle(_v.copy(L.spin).divideScalar(w), w * dt)); L.spin.multiplyScalar(1 - 0.2 * dt); }
const ground = /* as now */, steps = Math.max(1, Math.ceil(L.vel.length() * dt / 0.25)), h = dt / steps;
for (let s = 0; s < steps; s++) {
    _v.copy(m.position).addScaledVector(L.vel, h);
    if (_v.y > ground + 0.15 && this.game.collision.pointBlocked(_v.x, _v.y, _v.z)) {        // a wall / tree / chest: bounce off
        for (const ax of ['x', 'z', 'y']) { _v2.copy(m.position); _v2[ax] += L.vel[ax] * h; if (this.game.collision.pointBlocked(_v2.x, _v2.y, _v2.z)) L.vel[ax] *= -0.3; }
        L.vel.multiplyScalar(0.7); L.spin.multiplyScalar(0.5); break;
    }
    m.position.copy(_v);
}
// host: a fast thing (|v|>6) into a zombie/animal within 0.9 m hurts it once: round(0.5·m·v²/25), knock-back along v
```

**Tests**
- Unit, new `tests/unit/throw-physics.test.js` (fake game as in my node probe: `{scene, collision: new CollisionWorld(), fx: {spark(){}}, sync: null, authority: true, hud: {setVoice(){}}}`):
  - Same launch (10,6,0) from (0,3,0): apple range > 2× book range, and `|hammer − apple| / apple < 0.15`. Currently 12.72 vs 5.47, so this fails today.
  - Throw a wand and a hammer with the same detector result: `|v_wand| / |v_hammer|` between 1.8 and 2.1.
  - `spawnLoose` with a quaternion q and spin (0,0,10): at t=0 `L.model.quaternion.angleTo(q) < 1e-6`; after 0.1 s about 1.0 ± 0.05 rad turned.
  - `setWalls([{x:5,z:0}],5,8)`, apple at (10,4,0): max x < 2.8, and it comes to rest at x < 2.5.
- e2e, `holding.test.mjs`. Add a `windup: 'right'|'left'` option to `poses.mjs` `frame()`: elbow `[0.31, sh-0.02]` with z 0.05, wrist `[0.36, sh-0.15]` with z 0.15.
  - Apple: `feed({windup:'right', rightCurl:0.9}, 10)`, then 2 'forward' frames with curl 0.9, then `feed({arms:'forward', rightCurl:0}, 6)` → the apple is loose with `thrower === g.localId`, its horizontal angle to the camera's forward < 15°, it lands more than 8 m from the hand, and nothing is in the right hand.
  - Shield, same sequence → it lands at less than 0.6× the apple's distance.
  - Same sequence with the sword and `rightCurl` staying 0.9 → the sword stays held (a chop, not a throw).

## #87 Taking things from pedestals and chests

**Current behaviour (measured)**
- **No closing needed.** Items.js:306-317: an empty hand whose wrist comes within `PICK_RADIUS` 0.9 (Items.js:23) of the model's origin takes the thing. Measured (exp3): a closed fist pointed at the pedestal wand, shield and scroll took all three. The distance is from the wrist to the model origin, not from the fingers to the thing's surface.
- **A bow taken with the right hand jumps into the left** (Items.js:409-413). In exp3 `held.right` was null after the take.
- **Pedestals:** hovering items sit at top + 1.3 = 3.27 (Game.js:325 and 338; pedestal top 1.97, World.js:356-385). That is 0.52 above the shoulder (2.75) and 2.0 m from the shoulder, because the collision box is ±1.4 (World.js:381) while the visible top is only 0.95 wide. The hand reaches only with a perfectly aimed straight arm (closest wrist 0.10–0.16 m, closest grip point 0.26–0.36 m). The hover bobs ±0.12 and spins at 1.2 rad/s (Items.js:352-356).
- **Chests:** loot sits 2.2 above the reward point (Items.js:87). The reward point is floor + 1.86 (Chest.js:117-119, scale 3), so things end up at floor + 4.06. Coins go +3.2 above it (Game.js:568), at floor + 5.06. Measured on the creative test chest: the scroll was 0.79 above the shoulder; the coins were 1.93 above it and 3.0 m from the shoulder, which is out of reach (arm 1.9 + radius 0.9 = 2.8).
  - The row is spread along world X (Items.js:87), not along the chest. A chest turned 90° lines the things up front-to-back.
  - Items appear instantly at full height; only weapons rise out of the chest (Weapons.js:95-102 and 118-128).

**Code changes**
- **Pick-up needs the fingers to close** (replace Items.js:306-317):
```js
const PICK_REACH = 0.35;
for (const side of ['right', 'left']) {
    if (this.held[side] || g.weapons.hands[side].held || g.books?.reading?.handBusy(side)) continue;
    const ws = g.weapons.hands[side], G = g.weapons.palmFrame(side, this._pfs[side]).G;
    let best = null, bestD = 0.8;
    for (const L of this.loose.values()) { if (now < L.noPick || L.asked) continue; const d = this._reachTo(L, G); if (d < bestD) { bestD = d; best = L; } }
    if (!best) continue;
    best.offered = now;                                   // a hovering thing holds still for the reaching hand
    const closing = ch.getGripCurl(side) > 0.55 && (g.now() - ws.lastOpen < 900 || g.weapons.frame - ws.lastOpenFrame <= 12);
    if (bestD > PICK_REACH || !closing) continue;
    if (this.auth) this.pickUp(best.item.uid, g.localId, side);
    else { best.asked = true; g.sync?.itemTake?.(best.item.uid, side); setTimeout(() => { best.asked = false; }, 1500); }
}
```
- **`_reachTo(L, G)`:** for wand, hammer and bow, measure from the grip point G to the handle segment; for everything else, to the surface of the model's bounding sphere (cached at spawn).
- **Steady hover:** in the hover branch of `_physics`, `L.still` eases to 0 for 300 ms after `offered`. It multiplies the bob and the spin.
- **Rise out of the chest:** `spawnLoose(..., { rise })` sinks the thing by 1.2 m and eases it up over 1 s, as `Weapons.update` does.
- **`lootChest(pos, rng, house, chest, extra = [])`:**
  - Put the things in a row along the chest's own width: `across = (1,0,0)` and `front = (0,0,1)`, both rotated by the chest's quaternion.
  - Spacing `min(0.9, 3.2/n)`, 0.3 toward the chest's front.
  - Height `p.y += 1.1`, which gives floor + 2.96, just under a standing shoulder (floor + 3.25).
  - Weapons in the row get +0.8, so their handles are at shoulder height.
  - Game.js:564-568: pass `chest` along, and put the coin pouch in `extra` (same row) instead of +3.2.
- **Pedestals:** Game.js:325 and 338 `top + 1.3` → `top + 0.75`, which is about shoulder height. Optionally shrink the pedestal collision box at World.js:381 to ±1.1.
- **Bow:** delete Items.js:409-413, so the bow stays in the hand that closed on it. Switching hands remains Gear.js:201's gesture.

**Tests**
- Unit, new `tests/unit/loot.test.js`: `lootChest(c, rng, null, new Chest(scene, c, 'loot', -Math.PI/2))`. For every spawned hover position p:
  - `|p.y − (floor + 2.96)| < 0.05`
  - `|dot(p − c, front) − 0.3| < 0.05` and `|dot(p − c, across)| ≤ 1.6`
  - Distance from the shoulder point (c + front·1.75 + up·3.25) < 2.3
  - Coins in the same row.
- Unit: `_reachTo` returns 0 for a grip point inside the apple, and is about d − r outside.
- e2e, `holding.test.mjs`. Aiming the arm at a 3D point needs the exp3 approach (wrap `ch.updateArmsLookAt` and `lookAt` the arm anchor), because 2D synthetic poses can't aim the model arm precisely. Stand at the wand pedestal:
  - Fist the whole time (`rightCurl: 0.9`, 40 frames) → `held.right === null`.
  - Open for 10 frames, then 0.9 → `held.right.item.uid === 'cw0'`.
  - The bow taken with the right hand → `held.right.item.kind === 'bow'`.
  - Hover height: `|L.hover.y − shoulderY| < 0.3`.
- e2e, chest: walk to the creative test chest (12, −6). Every new loose thing has height above the shoulder between −0.6 and +0.35 and is less than 2.3 m from the shoulder. Each one is then taken by aiming the arm and doing open→close.

## #71 Every thing held like the sword

**Measured hold of each kind** (exp2: fist pose, arm forward; the share of the thing's surface samples inside the palm or finger bones, plus which bones touch). "through" means surface inside the hand. Paths: "grip" is Items.js:146-189 (the fist hold); "other" is Items.js:298-301, which puts the model's origin at the palm centre with the palm's rotation and sets no finger grip.

| kind | now | measured | what's wrong |
|---|---|---|---|
| sword/axe (reference) | Weapons.grab:399 `setGrip(0.62)`, grip point G = (0, 0.13, −0.135) in the palm frame (Weapons.js:319) | offline: little finger bones 1–2 through the handle (r .065); thumb tip 8.8 cm off | curl-only grip: the short little finger curls into the handle; the axe handle (r .094) is fatter than the grip point allows |
| wand | pen pose (Items.js:32, 154-182) | 19.9% through: thumb base 87, thumb tip 36, index 29, palm 22 samples | the wand's axis goes through the web point *on* the palm, and its handle (r .077 world) is as thick as a finger |
| hammer | grip, curl 0.62 | 5.3% through (little finger through the handle) | same as the sword |
| bow (at rest) | grip | 3.1% through (palm 7, little finger, ring finger, thumb); the string runs through the bow hand's thumb | grip box (r .085) at z −0.135 sits 2 cm inside the palm |
| bow (drawn) | Items.js:291-297 places it at the palm centre | grip inside the palm; arrow through the palm (see #78) | leaves the fingers |
| scroll | grip, axis x, curl .5 | 7.8% through (palm 58 samples) | roll r .12 centred 5.5 cm too close; sits in the palm |
| shield | grip `face:'back'`, +0.25 along back of hand (Items.js:170, 183) | 0% through, but no finger touches (nearest 7.5 cm) | floats behind the back of the hand; no handle or strap |
| book | by the spine (BookReading, #90 in progress) | 0.9% (minor) | fine-tune only |
| apple | other | 46.8% (palm 227 samples) | the ball sits in the palm |
| meat/steak | other | 8.3% | the palm is in the middle of the meat; the bone is ignored |
| bread / cheese / pie | other | 38% / 31% / 40% | inside the palm |
| coins | other | 27.4% | the pouch is around the palm |
| backpack | other | 0% (but the whole hand is *inside* the bag: centred at the palm, half-sizes .56/.68/.28; nearest finger 3.4 cm) | the hand is swallowed by the bag |
| arrows | other | 2.6%, fanned 0.48 m wide | through the palm, not a bundle |
| wool | other | 25.6% | inside the palm |
| logs | other (never really held: they go to the wood stack, Beds.gotItem) | 2.7% | — |
| wood/stone block in hand | Inventory.js:474-489: a 0.28 cube 0.3 above the palm, spinning | floating | floats |
| other players' hands | Items.js:588-605: grip position/rotation, wand and hammer turned 90° | no grip, no finger wrap | others see things through the palm |

**Proposal**
- **Finger poses:** add `GRIP_POSES` next to `PEN_GRIP` in SimplifiedHand.js. The joint angles were fitted per finger so the middle and end bones touch the shape and nothing goes in.
- **Verification:** the real `animateModel` path, right and left hands, was checked with `verify.mjs`. power, thick, roll and ball: no bone more than 4 mm inside, all 5 end bones touching. thin, neck, wool, box, block and hook: no penetration in the fit (`gripfit.out`, `gripfit2.out`), but not run through `verify.mjs`. The hook pose leaves the thumb off the strap, which is intended.
- **Thumb values:** the thumb's first value often sits on the search grid's edge (−0.6), so treat the thumb values as starting points. The unit test below checks the geometry rather than the exact numbers.
```js
export const GRIP_POSES = {
  pen: PEN_GRIP,
  power: { index:[1.1,1.3,0,-0.05], middle:[1.2,1.45,0,0], ring:[1.15,1.2,0,0.05], pinky:[0.6,1.35,0,0.12], thumb:[-0.6,-0.8,0.6,0,-0.6] },   // handle r .065 (sword); hammer r .074 ≈ same
  thick: { index:[0.9,1.3,0,-0.05], middle:[1.05,1.4,0,0], ring:[1.1,1,0,0.05], pinky:[0.6,1.15,0,0.12], thumb:[-0.6,0,0.4,-0.6,0.8] },        // r .085 bow grip, axe
  thin:  { index:[0.95,1.75,0,-0.05], middle:[1.35,1.55,0.1,0], ring:[1.05,1.6,0,0.05], pinky:[0.6,1.6,0,0.12], thumb:[-0.6,-0.6,-0.2,1,-0.6] }, // r .045 meat bone, arrows bundle, shield handle
  neck:  { index:[0.8,1.3,0,-0.05], middle:[1.15,1.1,0,0], ring:[0.85,1.2,0,0.05], pinky:[0.6,1,0,0.12], thumb:[-0.6,-1.8,0.6,0,1] },           // r .10 coin-pouch neck
  roll:  { index:[0.6,1.25,0,-0.05], middle:[0.75,1.35,0,0], ring:[0.85,0.85,0,0.05], pinky:[0.6,0.65,0,0.12], thumb:[-0.6,-1.8,-0.2,1,-0.6] },  // r .12 scroll
  ball:  { index:[0.3,1.05,0,-0.12], middle:[0.55,0.8,0,-0.02], ring:[0.4,0.85,0,0.08], pinky:[0.55,0.5,0,0.18], thumb:[-0.6,-1.8,-0.2,0,-0.6] },// apple r .198
  wool:  { index:[0.25,0.7,0,-0.15], middle:[0.2,0.9,0,-0.03], ring:[0.4,0.4,0,0.1], pinky:[0.4,0.35,0,0.22], thumb:[-0.6,-1.4,0.8,0,-0.6] },  // r .30
  box:   { index:[0.7,0.95,0,-0.05], middle:[0.85,0.95,0.1,0], ring:[0.65,1,0,0.05], pinky:[-0.1,1.35,0.4,0.12], thumb:[-0.6,-0.8,0.6,-0.4,0.6] }, // bread/cheese (.22 thick)
  block: { index:[0.25,1.4,0,-0.05], middle:[0.6,1.15,0.1,0], ring:[0.45,1.15,0,0.05], pinky:[-0.2,1.25,0.2,0.12], thumb:[-0.6,-1.2,0.6,0.6,0.4] },// 0.28 cube
  hook:  { index:[-0.15,1.3,0,-0.05], middle:[-0.1,1.6,0.1,0], ring:[0.05,1,0.2,0.05], pinky:[0.3,0.1,0.1,0.12], thumb:[-0.4,-1,-0.2,-0.2,0.4] }, // strap r .035
};
setGrip(curl, pose = null) { this.gripOverride = curl == null ? null : { curl, thumb: Math.min(1, curl + 0.15), pose: typeof pose === 'string' ? GRIP_POSES[pose] ?? null : pose }; }
```

- **Where each thing sits:** replace `GRIPPED` (Items.js:31-38) with a `GRIPS` table. `hold` is [y, z] in the palm frame (palm face at z −0.07, so for a cylinder z = −(0.07 + r)):

| kind | pose | grip point | how it lies |
|---|---|---|---|
| hammer | power | (0.13, −0.148) | as now |
| sword | power | (0.13, −0.135) | change Weapons.js:399 to `setGrip(0.62, 'power')` |
| axe | thick | (0.13, −0.164) | make Weapons.js:319's `_G` z = −(0.07 + handleRadius·S) |
| bow | thick | (0.13, −0.155) | stays in the fist while drawing (see #78) |
| scroll | roll | (0.15, −0.194) | rolled across the palm |
| apple | ball | centre (0.2, −0.272) | cupped |
| wool | wool | centre (0.22, −0.374) | cupped |
| meat/steak | thin | (0.13, −0.119) | by the bone: model X across the palm, origin shifted by the bone's 0.306 so the meat is out of the thumb side |
| bread | box | centre (0.17, −0.209) | long axis across the palm, top toward the fingers |
| cheese | box | centre (0.17, −0.219) | same as bread |
| pie | flat tray, palm up | (0.1, −0.133) | slides off when the palm turns down (palm-up cos < 0.2 → drop) |
| coins | neck | at the neck | hangs: model up = world up, turned with the body, origin 0.216 below the neck |
| backpack | hook | new top loop mesh (box 0.3×0.05×0.04 local at y 0.47) | hangs below the fist, 0.75 below |
| arrows | thin | — | tight bundle when held (spacing 0.025, no fan), shafts across the palm |
| wand | pen | — | shift the wand axis off the web/pinch line by its radius toward the palm side, or thin the handle to r .02 local (#85, in progress) |
| shield, round (type 0) | thin | new handle bar mesh on the back (r .02 local along local X, z −0.09) at the grip point | face normal = palm −Z, the boss over the fist |
| shield, heater/tower (types 1, 2) | thin | grip bar at the grip point | strapped to the forearm: face = palm +Z, centre at G − Y·0.3 + Z·0.25, the shield's y along the palm's X |
| block in hand | block | centre (0.17, −0.214) | Inventory.js:474-489: no float, no spin |

  Related: Gear.shieldFaces (Gear.js:85) should then use the shield's real face normal instead of the body's facing.
- **Other players:** factor out `_holdPose(kind, palmFrame) → {pos, quat, pose}` and use it in `updateRemote` with the remote character's palm, plus `setGrip(pose)` on the remote hand.

**Tests**
- Unit, new `tests/unit/grips.test.js`. For each `GRIP_POSES` entry and its shape, for `new SimplifiedHand('right'|'left')`: `setGrip(0.6, name)`, step 40 frames, then:
  - no bone sample more than 6 mm inside the shape;
  - every finger's end bone within 1 cm of the surface (4 fingers; the thumb too for power, thick, roll and ball);
  - the palm face is not inside the shape.

  `verify.mjs` is the template.
- Unit: `VoxelCharacter` with hands shown and a fist. For every kind in `GRIPS`, run `_holdPose`, then sample the model's surface the way exp2 does: inside-the-hand share < 1%, at least 3 finger bones within 2 cm (the hand closes on it), and for hanging things the fingers within 2 cm of the neck or loop.
- e2e, `holding.test.mjs`: loop over all 17 kinds with `takeIntoHand` and `feed({arms:'forward', rightCurl:0.85, leftCurl:0.85}, 12)`, using exp2's in-page measurer. Assert inside share < 1.5% and at least 3 fingers touching. Currently the apple is 46.8%, bread 38.3%, pie 39.8%, wand 19.9%, scroll 7.8%; the shield and backpack have 0 fingers touching.

## #78 The bow

**Current behaviour, after b2a5c02** (exp4c, committed archer pose `frame({archer:'left', draw, leftCurl:.9, leftTilt:1.3, leftRot:1.57})`)
- **Aim:** done (shot 4.5° from straight ahead).
- **String through the bow hand at rest:** 5 samples inside the bow hand's thumb (the second thumb bone). The brace height is only 0.19 m (`tipX = R·0.35·(cos0.9−1)`, ItemTypes.js:360).
- **The string does not follow the drawing fingers.** Gear.js:177-181 puts the string's corner on the aim line at `bowPos − aim·(0.19 + pull)`. The drawing hand is about 60° off that line (the camera's depth guess), so the corner is 1.33 m from the drawing fingers (1.39 m from the wrist) at a draw of 0.53.
- **The arrow goes through the bow hand.** Its axis passes exactly through the grip centre (Gear.js:181, distance 0.000), with 18 samples inside the bow hand's palm and 5 inside the middle finger.
- **Drawn, the bow leaves the fist.** It switches to the aimed path (Items.js:291-297) and its grip sits at the palm centre, inside the palm.
- **The limbs never bend:** `setBowString` only moves the string.
- **Nocking is unreliable.** "Hand at the bow" is a 3D distance under 1.0 (Gear.js:143, 160), but hands that overlap in the picture can be about 1 m apart in 3D (measured 1.03 with my own archer frame).

**Code changes**
1. **Keep the bow in the fist while aiming.** Replace the bow's aimed branch with `_bowInFist`:
   - x = aim; y = the fist's thumb line made perpendicular to the aim; z = x × y.
   - Rotation smoothed with `dt·16`.
   - Position = P + Y·0.13 + Z·(−0.155), the 'thick' grip point.
   - The archer test already holds the fist upright, so the existing "upright < 15°" assertion still holds.
2. **The string corner sits at the drawing fingers.**
   - Fingers point: `pinch` = midpoint of the drawing hand's index and middle tips (`fingerMeshes[f][2].pivot.localToWorld(0, 0.14, 0)`).
   - Draw amount from the picture, which doesn't depend on depth: `draw = clamp((|wrist_draw − wrist_bow|₂D / shoulderWidth₂D − 0.25) / 0.75, 0, 1)`, using `currentPose.leftWrist`, `rightWrist` and the shoulders.
   - The corner is the nock point on the aim line, `rest − aim·(0.19 + draw·1.1·R·S)`, and `setBowString(bow, nockX, nockY = 0, flex = draw)`.
   - New `Character.reachArm(side, target)`: a two-bone IK (upper arm 1.0, forearm 0.9, elbow out and down) applied after `updateArmsLookAt` while drawing, so the drawing hand's grip point lands on that corner. The camera gives up/down and the draw; the depth it can't see comes from the string.
   - Set the 'hook' grip on the drawing hand while the arrow is on the string.
3. **The arrow rests beside the grip.**
   - Rest point = `bow.model.localToWorld(0.02, 0.075, side === 'left' ? -0.05 : 0.05)` in bow-local units: on the index knuckle, next to the grip box.
   - Arrow from the string corner through the rest point: `n.model.position = nockW + d·0.96`.
   - Shoot from the rest point (Gear.js:224 `_shoot`).
4. **Brace height and flexing limbs.**
   - `bowModel` (ItemTypes.js:349-370): limb curve factor 0.35 → 0.5, giving a brace of about 0.27 m world.
   - `setBowString(bow, nockX, nockY, flex)`: each limb segment's angle `a → a·(1 − 0.12·flex)`; the tips move back by up to 0.12·R and in by 6%; the strands run from the moved tips.
5. **Nocking from the picture:** the drawing wrist within 0.6 shoulder-widths of the bow wrist in 2D, or the current 3D test.

**Tests**
- Unit, new `tests/unit/bow-string.test.js` with `makeItemModel({kind:'bow', type:0})`:
  - Strand ends at the tips and at (x, y) of `setBowString(bow, x, y)`, within 1e-3.
  - Rest brace `|tipX|·2.4 ≥ 0.25`.
  - With flex 1 the tips are ≥ 0.05 local further back than with flex 0.
- e2e: extend the archer test at holding.test.mjs:160 with exp4c's probe.
  - At rest: no string sample inside the bow hand's palm or finger bones (currently 5 in the thumb).
  - After the draw:

| Assertion | Now |
|---|---|
| string corner to drawing-finger pinch < 0.12 m | 1.33 |
| arrow axis to grip centre ≥ 0.10 m | 0 |
| arrow samples inside the bow hand = 0 | 23 |
| bow grip within 0.03 m of the fist's grip point | at the palm centre |
| arrow within 15° of the bow arm | 4.5 (keep) |