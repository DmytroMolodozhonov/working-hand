**Surfboard (#120) design for /home/user/working-hand: read-only design, no repo files touched**

Scope note: the relayed user message is about #123 (fatigue renamed to "mana", the maximum grows +1 per successful spell, +3 the first time for a strong new spell, back to 30 on death). The computed task asks for the surfboard (#120). This design covers #120 and plugs into #123 in one place:
- A successful «Create a Board» (the board actually appears) calls the mana design's practice hook.
- It counts as a normal spell (+1 to the maximum), not a "very strong" one (no +3).
- Paddling and riding are physical activity. They cost no mana and give no practice.

---

## 0. What the code already decides for this design

**Hero scale.**
- `PLAYER_GROUND_OFFSET = 2.0`, legs are 1.95 long, the head top is about 4.7 above the feet. So 1 unit ≈ 0.38 m.
- The upper arm is 1.0 and the forearm 0.9. Arm anchors sit at x = ±0.7, 1.25 above the group origin.
- Gravity in `Character.update` is 20 u/s². The board uses `G = 20`.
- Board size follows from this: length 4.4, width 1.3, thickness 0.18 (about a 1.7 m funboard next to this hero).

**Existing patterns to copy.**
- Pure logic module plus a manager (`Flight.js` + `Game._updateFlight`; `BookPhysics.js` + `BookReading.js`).
- A riding owner moves the thing itself (`Animals._ride`, `aride`/`apos`).
- Host owns free things (`Items`/`Weapons`; `itake`/`igone`, `grab`/`wown`).
- Creations are broadcast by the creator (`Doors`: `door` message, `snapshot`/`restore`, welcome, save).

**Grab gating.** A hand is already blocked from grabbing by `items.held[side]`, `weapons.hands[side].held` and `books.reading.handBusy(side)`. Add `boards.handBusy(side)` in the same three places.

**Leg landmarks.**
- 25–32 reach `PoseInterpreter` unfiltered (`PoseStabilizer.POSE_KEYS` covers only 0, 11–16, 23, 24).
- `_legs()` already sets `pose.leftKneeUp` / `rightKneeUp` (`below < 0.28`).
- The synthetic `frame()` leaves knees at the default (0.5, 0.8), the same height as the hips. Every existing e2e frame therefore reads as "both knees up". The new `legs` option must be opt-in so old tests don't change.

**Pitfalls to avoid.**
- `Character.update` rewrites `group.rotation.z = _fallRoll` every frame. Board roll would be wiped unless this becomes `_fallRoll + boardRoll`.
- `RemoteAvatar.update` sets `ch.flying = |rx| > 0.05`. A rider pitched on a wave face would be drawn in the Superman pose. Use `ch.flying = !s.bd && …`.
- `knowsSpell()` gates every name listed in `SCROLL_SPELL_COLOR` to "scroll only". «Create a Board» must also be learnable from a book, so it must **not** go into that map. Use a separate ribbon-colour map.
- `bookSpells(id)` draws from `BOOK_POOL`. Adding a spell changes which spells future ground books get. Books already in hands or slots keep `item.spells`.
- `PoseSmoother.sample()` copies discrete fields from the newest result for many render frames. Leg gestures must be exposed as monotonic counters, not one-shot events.
- `matchSpell`: «абордаж» (boarding, for the future ships, #128) contains «борд». The Russian «борд» token needs a create-word and must exclude «абордаж».
- Crouching is the dismount gesture on a horse. On a board, crouching is the surf stance, so it must not dismount.
- `books` is null in test mode, so knowledge checks need `?.`.

---

## 1. The wave field this needs from the sea design (#117)

The board reads water only through one adapter, `SurfWater`. The sea design must provide (exact names can differ; only `SurfWater` adapts):

```js
// game.sea (sea design)
sea.sample(x, z, t, out) -> out | null  // null: not sea here
//   out.h        elevation above WATER_LEVEL_Y (blocks)
//   out.gx,gz    ∂h/∂x, ∂h/∂z
//   out.vx,vz    horizontal water velocity at the surface (orbital + whitewater push)
//   out.c        local phase speed of the dominant wave (u/s), 0 = none
//   out.dx,dz    unit direction the waves travel (towards the shore)
//   out.breaking 0..1  (1 = whitewater / lip pitching)
//   out.depth    water depth (blocks), 0 on the beach
sea.time() -> seconds, the same on every computer (host clock + skew)
sea.beachesNear(x, z, r) -> [{x, z, yaw /* facing the sea */, len}]   // dry sand strips
```

**Shared clock.** If the sea design has none, add `now: Date.now()` to `welcomeMessage()`. On join, the client sets `g.clockSkew = msg.now - Date.now()` (good enough, like `dayStart`). Wave time is `(Date.now() + g.clockSkew) / 1000`.

**New file `src/game/SurfWater.js`** (pure apart from `game` lookups):

```js
import { WATER_LEVEL_Y } from '../world/Terrain.js';
export const WAVE_G = 20;

export class SurfWater {
    constructor(game) { this.game = game; this.sea = null /* tests may inject */; this.transients = []; }
    get field() { return this.sea || this.game.sea || null; }
    time() { const f = this.field; return f?.time ? f.time() : (Date.now() + (this.game.clockSkew || 0)) / 1000; }
    /** Water under (x, z): the sea's waves, else still block water (lakes/rivers), else land. */
    sample(x, z, t = this.time(), o = {}) {
        o.h = o.gx = o.gz = o.vx = o.vz = o.c = o.breaking = 0; o.dx = 1; o.dz = 0;
        if (this.field?.sample?.(x, z, t, o)) { o.kind = 'sea'; o.surface = WATER_LEVEL_Y; }
        else {
            const w = this.game.swim?.waterAt(x, z);
            if (w) { o.kind = 'lake'; o.surface = w.surface - 0.12; o.depth = w.depth; } // (drawn surface)
            else { o.kind = 'land'; o.surface = this.game.collision.groundY(x, z); o.depth = 0; }
        }
        for (const w of this.transients) addTransient(o, w, x, z, t); // Wave Attack
        return o;
    }
    /** «Wave Attack» made a moving wall of water: rideable while it lives. */
    addTransient({ x, z, dirX, dirZ, speed, height, width, dist }) {
        this.transients.push({ x, z, dirX, dirZ, speed, height, width, born: this.time(), life: (dist + 3) / speed });
    }
    update() { const t = this.time(); this.transients = this.transients.filter((w) => t - w.born < w.life); }
}

/** A raised-cosine bump travelling along (dirX, dirZ): adds h, gradient, push, c, dir. */
function addTransient(o, w, x, z, t) { /* along = (x-w.x)·dir − w.speed·(t−w.born); |along|<2.5 && |across|<width/2 → h += H·½(1+cos(π·along/2.5)), gx/gz from it, c = speed, dx/dz = dir, breaking = rise<1 ? 0 : 0.4 */ }

/** Stub sea for tests and for the e2e (long-crested swell, optional sloping beach). */
export function makeSwell({ dirX = 1, dirZ = 0, height = 1.6, length = 36, depth = 6, shore = null /* {s0, slope} */, phase = 0 } = {}) {
    const k = 2 * Math.PI / length, c0 = Math.sqrt(WAVE_G * depth), w = k * c0;
    return {
        time: null,
        sample(x, z, t, o) {
            const s = x * dirX + z * dirZ;
            const d = shore ? Math.min(depth, (shore.s0 - s) * shore.slope) : depth;
            if (!(d > 0.05)) return null;
            const A = Math.min(height / 2 * Math.pow(depth / d, 0.25), 0.39 * d); // shoaling, capped (breaks at H≈0.78d)
            const ph = k * s - w * t + phase, h = A * Math.sin(ph), dhs = A * k * Math.cos(ph);
            const c = Math.sqrt(WAVE_G * d);
            o.h = h; o.gx = dhs * dirX; o.gz = dhs * dirZ;
            o.vx = (h / d) * c * dirX; o.vz = (h / d) * c * dirZ;   // shallow-water orbital velocity
            o.c = c; o.dx = dirX; o.dz = dirZ; o.depth = d;
            o.breaking = Math.max(0, Math.min(1, (2 * A / d - 0.6) / 0.18));
            return o;
        },
    };
}
```

Without a sea everything still works on lakes: floating, mounting, paddling, and riding Wave Attack waves. Only big natural surf needs `game.sea`.

---

## 2. Data structures

**Board record** (plain, network/save friendly). It lives in `BoardRegistry`; the manager adds `model` and `body`.

```js
{ id: 'b…' | 'cb_<ix>_<iz>_<i>' | 'cboard0',
  wood: 0..4,                 // TREE_KINDS index → colours
  st: 'stand'|'rest'|'float'|'fall'|'held'|'ridden',
  p: [x,y,z], q: [qx,qy,qz,qw], v: [vx,vy,vz],
  owner: playerId|null, mode: 0|1|2|3|4|5,   // 1 two hands, 2 one hand, 3 ride left foot, 4 ride right foot, 5 ride standing
  beach: true|undefined }
```

**Constants (`BoardPhysics.js`).** These are tunables. The unit tests pin behaviour, not exact numbers.

```js
export const SURF = {
    G: 20, L: 4.4, W: 1.3, T: 0.18, ROCKER: 0.16,
    DRAFT: 0.06, RIDER_DRAFT: 0.05,
    STROKE_DU: 0.85, PADDLE_MAX: 5.0, STROKE_YAW: 0.06,
    K_DISP: 0.16, PLANE_U: 5.5, K_PLANE: 0.07, K_FIN: 3.5,
    SLIDE: 1.0, TRIM: 0.5, YAW_MAX: 1.2,
    CATCH_SLOPE: 0.10, CATCH_RATIO: 0.55, CATCH_COS: 0.5, CATCH_T: 0.3, LOSE_T: 1.2,
    TAU: 1.4, ERR_GAIN: 2.2, FALL_BETA: 0.55,
    CROUCH_TAU: 1.6, ARMS_TAU: 1.4, ONE_FOOT_TAU: 0.6,
    PEARL_SLOPE: 0.55, PEARL_TRIM: 0.6, STALL_DRAG: 1.5,
    GROUND_DEPTH: 0.35, THROW_U: 4, FREE_SLIDE: 0.6,
    GRAB_REACH: 0.35, SLIP: 0.45, MOUNT_REACH: 1.2,
};
```

---

## 3. New files

### 3.1 `src/entities/BoardModel.js` (THREE only)

`boardModel(woodIndex) -> THREE.Group`

- **Local frame:** +X right, +Y deck normal, −Z nose (same as the hero's forward).
- **Outline:** a `THREE.Shape` with a pointed nose at z = −L/2, the widest point 0.15·L behind the middle, and a squash tail at +L/2. Build it with `ExtrudeGeometry` (depth T, bevel 0.04), rotated so the extrude axis becomes Y.
- **Rocker:** after building, `pos.y += ROCKER * (2z/L)²` per vertex.
- **Details:**
  - A stringer: a 0.05-wide box along Z, colour `woodColor` × 0.6.
  - Three fins: thin triangles under the tail at z = +L/2 − 0.35.
  - Deck colour from `TREE_KINDS[wood]`, using the same palette as `Doors.woodColor`.
- **userData:** `{ dims: {L, W, T}, rail: Float32Array }`. The rail is 48 outline points in local XZ at y = 0. They are used for grabbing, collision and the "hands on the rail" points.

`disposeBoard(g)`.

### 3.2 `src/game/BoardPhysics.js` (pure, no THREE)

```js
export class BoardBody {
    constructor({ x = 0, z = 0, yaw = 0 } = {}) { Object.assign(this, { x, z, y: 0, yaw, u: 0, w: 0, vy: 0, beta: 0, faceT: 0, offT: 0, riding: false, grounded: false, fallen: null, pitch: 0, roll: 0 }); this._s = {}; }
    /**
     * @param water (x, z, t, out) => sample (SurfWater.sample bound)
     * @param input {mode: 'free'|'one'|'stand', strokes: n since last step, strokeSide: 'left'|'right',
     *               lean (rad, + = rider's left), trim (−1 back … 1 forward), crouch, armsOut, t}
     * @returns events: [{type: 'caught'|'lost'|'fall', cause?: 'balance'|'pearl'|'wipeout'|'thrown'|'shore'}]
     */
    step(dt, water, input) {
        const ev = []; const n = Math.max(1, Math.ceil(dt / (1 / 60))); const h = dt / n;
        for (let i = 0; i < n && !this.fallen; i++) this._sub(h, water, input, ev, i === 0);
        return ev;
    }
    _sub(dt, water, I, ev, first) {
        const S = SURF, s = water(this.x, this.z, I.t, this._s);
        const hx = -Math.sin(this.yaw), hz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        if (s.kind === 'land' || s.depth < S.GROUND_DEPTH) {           // grounding on the beach
            if (!this.grounded) { this.grounded = true; if (this.u > S.THROW_U && I.mode !== 'free') ev.push({ type: 'fall', cause: 'thrown' }); else ev.push({ type: 'fall', cause: 'shore' }); }
            this.u *= Math.max(0, 1 - 6 * dt); this.w *= Math.max(0, 1 - 6 * dt); /* y = ground + T/2 */ return;
        }
        const wu = s.vx * hx + s.vz * hz, ww = s.vx * rx + s.vz * rz;          // water velocity in board axes
        const slopeF = -(s.gx * hx + s.gz * hz), slopeR = -(s.gx * rx + s.gz * rz);
        const ur = this.u - wu, wr = this.w - ww;
        const trim = I.mode === 'free' ? 0 : I.trim || 0;
        const k = (Math.abs(ur) < S.PLANE_U ? S.K_DISP : S.K_PLANE) * (trim < -0.4 ? 1 + S.STALL_DRAG * -trim : 1);
        let du = S.G * slopeF * (I.mode === 'free' ? S.FREE_SLIDE : S.SLIDE * (1 + S.TRIM * trim)) - Math.sign(ur) * k * ur * ur;
        if (first && I.strokes > 0 && I.mode === 'one') {                      // leg strokes (once per step)
            this.u += I.strokes * S.STROKE_DU * Math.max(0, 1 - this.u / S.PADDLE_MAX);
            this.yaw += I.strokes * S.STROKE_YAW * (I.strokeSide === 'left' ? -1 : 1);
        }
        this.u += du * dt;
        this.w += (S.G * slopeR * 0.3 - S.K_FIN * wr) * dt;                    // the fin holds the line
        // turning: a carve whose rate makes the lean exactly right; limited by the rail
        const grip = Math.max(0, Math.min(1, (this.u - 1) / 3));
        const lean = I.mode === 'free' ? 0 : I.lean || 0;
        const yawRate = Math.max(-S.YAW_MAX, Math.min(S.YAW_MAX, S.G * Math.tan(lean) / Math.max(this.u, 1))) * grip;
        this.yaw += yawRate * dt;
        this.x += (this.u * hx + this.w * rx) * dt; this.z += (this.u * hz + this.w * rz) * dt;
        // on the face?
        const onFace = slopeF > S.CATCH_SLOPE && s.c > 0 && this.u > S.CATCH_RATIO * s.c && hx * s.dx + hz * s.dz > S.CATCH_COS;
        this.faceT = onFace ? this.faceT + dt : 0; this.offT = onFace ? 0 : this.offT + dt;
        if (!this.riding && this.faceT > S.CATCH_T && I.mode !== 'free') { this.riding = true; ev.push({ type: 'caught' }); }
        if (this.riding && this.offT > S.LOSE_T) { this.riding = false; ev.push({ type: 'lost' }); }
        // balance (standing, or riding on one foot)
        if (I.mode === 'stand' || (I.mode === 'one' && this.riding)) {
            const chop = s.breaking * 0.25 * Math.sin(7.3 * I.t + this.x * 0.9);
            const need = Math.atan(this.u * yawRate / S.G) + 0.5 * Math.atan(slopeR) + chop;
            const tau = S.TAU * (I.crouch ? S.CROUCH_TAU : 1) * (I.armsOut ? S.ARMS_TAU : 1) * (I.mode === 'one' ? S.ONE_FOOT_TAU : 1);
            this.beta += (this.beta / tau + S.ERR_GAIN * (lean - need) * Math.min(1, Math.max(0.3, this.u / 3))) * dt;
            if (Math.abs(this.beta) > S.FALL_BETA) { this.fallen = 'balance'; ev.push({ type: 'fall', cause: 'balance' }); }
        } else this.beta *= Math.max(0, 1 - 3 * dt);
        if (I.mode !== 'free' && slopeF > S.PEARL_SLOPE && trim > S.PEARL_TRIM) { this.fallen = 'pearl'; ev.push({ type: 'fall', cause: 'pearl' }); }
        if (this.riding && s.breaking > 0.8 && slopeF > 0.7 && s.h > 0) { this.fallen = 'wipeout'; ev.push({ type: 'fall', cause: 'wipeout' }); }
        // the surface carries it
        this.y = s.surface + s.h + S.T / 2 - S.DRAFT - (I.mode !== 'free' ? S.RIDER_DRAFT : 0);
        this.pitch = Math.atan(slopeF); this.roll = Math.atan(slopeR);
        this.grounded = false;
    }
}
/** Lean/trim from the torso relative to the neutral taken at mounting (like FlightController.steering). */
export function riderInput(torso, neutral) {
    if (!torso || !neutral) return { lean: 0, trim: 0 };
    const lean = Math.max(-0.8, Math.min(0.8, (torso.lateral - neutral.lateral) * 1.2));
    let trim = (neutral.noseRel - torso.noseRel) * 1.6;
    if (torso.depth != null && neutral.depth != null) trim += (neutral.depth - torso.depth) * 6;
    const dz = (v, d) => (Math.abs(v) < d ? 0 : v - Math.sign(v) * d);
    return { lean: dz(lean, 0.04), trim: Math.max(-1, Math.min(1, dz(trim, 0.08))) };
}
```

Why the catch is physical, not a timer: on the front face, gravity along the slope pushes the board shoreward while drag holds it back.
- Faster than the wave: the board runs into the flat trough, loses slope and slows down.
- Slower: the crest passes underneath, the back slope brakes it, and it is "lost".

So a board only stays on the face at about the wave's own speed. `riding` is just a label for that state.

### 3.3 `src/input/LegReader.js` (pure)

```js
import { OneEuro } from './PoseInterpreter.js';   // (or move OneEuro to core/math.js and import from both)
/** Knees (and ankles when seen) → per-leg state + monotonic counters (safe under PoseSmoother repeats). */
export class LegReader {
    constructor() { this.L = { left: this._leg(), right: this._leg() }; this.seenAt = -1e9; }
    _leg() { return { up: false, heel: false, below: 0.5, f: new OneEuro(1.2, 0.4), shin: 0, lifts: 0, plants: 0, strokes: 0, liftAt: 0, upSince: 0 }; }
    /** @returns {{seen, left, right}} each leg: {up, heel, planted, below, lifts, plants, strokes, liftAt} */
    read(lm, now = performance.now()) {
        const T = Math.abs((lm[23].y + lm[24].y) / 2 - (lm[11].y + lm[12].y) / 2) || 0.3;
        for (const [side, hip, knee, ankle] of [['left', 23, 25, 27], ['right', 24, 26, 28]]) {
            const S = this.L[side], k = lm[knee], h = lm[hip], a = lm[ankle];
            if ((k.visibility ?? 1) < 0.5 || (h.visibility ?? 1) < 0.5) continue;
            this.seenAt = now;
            S.below = S.f.filter((k.y - h.y) / T, now / 1000);
            // heel kicked back: the ankle comes up towards the knee (only when the ankle is seen)
            if (a && (a.visibility ?? 1) > 0.5) { const sh = (a.y - k.y) / T; S.shin = Math.max(S.shin * 0.999, sh); S.heel = S.shin > 0.2 && sh < S.shin * 0.45; }
            const wasUp = S.up || S.heel;
            if (!S.up && S.below < 0.26) { S.up = true; S.upSince = now; }
            else if (S.up && S.below > 0.40) S.up = false;
            const isUp = S.up || S.heel;
            if (isUp && !wasUp) { S.lifts++; S.liftAt = now; }
            if (!isUp && wasUp) { S.plants++; if (now - S.liftAt < 1200) S.strokes++; }
        }
        const seen = now - this.seenAt < 500;
        const out = (S) => ({ up: S.up || S.heel, heel: S.heel, planted: !(S.up || S.heel) && S.below > 0.40, below: S.below, lifts: S.lifts, plants: S.plants, strokes: S.strokes, liftAt: S.liftAt });
        return { seen, left: out(this.L.left), right: out(this.L.right) };
    }
}
```

`PoseInterpreter`: in the constructor add `this.legReader = new LegReader()`. In `process()`, after `this._legs(lm, data)`, add `data.legs = this.legReader.read(lm);`.

### 3.4 `src/game/BoardHold.js` (pure, THREE math)

```js
/** The nearest point of the rail to a hand (board-local), and its distance. */
export function nearestRail(localP, rail /* Float32Array xz pairs */, out = {}) { /* segment search, y = 0 */ }

/**
 * Two hands hold the board at local grips gA, gB. The line between the grips follows the hands.
 * The free turn θ about that line: minimum of  m·g·y_COM(θ) − κ·(deckNormal(θ)·palmUp)  (gravity
 * against the wrists), sampled in 10° steps from the previous θ ±60° and refined. Then the board is
 * pushed out of the torso box along the hero's forward (it can't go through the body), and lifted
 * out of the ground / held at the water surface (it can't go through either).
 * @returns {pos, quat, theta, drawA, drawB, slip}  drawA/B: where the drawn hands go (the grips);
 *          slip: 'A'|'B' when |hA−hB| differs from |gA−gB| by more than SURF.SLIP (the weaker grip opens)
 */
export function solveTwoHands({ gA, gB, hA, hB, curlA, curlB, palmUpA, palmUpB, prevTheta, torso /* {center, halfX, halfY, halfZ, quat} */, floorY /* (x,z)=>y */, surfaceY /* (x,z)=>y|null */ }) { … }

/**
 * One hand holds it: the board hangs from the grip; if it is longer than the grip is high its far
 * end rests on the ground and drags behind the hand's motion (trail = −hand velocity).
 */
export function solveOneHand({ g, h, trail, floorY, prevQuat }) { … }
```

### 3.5 `src/game/BoardRegistry.js` (pure, for unit tests and save)

```js
export class BoardRegistry {
    constructor() { this.map = new Map(); this.beachTaken = new Set(); }
    add(rec) { if (!this.map.has(rec.id)) this.map.set(rec.id, { v: [0, 0, 0], owner: null, mode: 0, ...rec }); return this.map.get(rec.id); }
    /** host: first come wins; a ridden or held board is never taken from its owner */
    take(id, by, mode) { const b = this.map.get(id); if (!b || (b.owner && b.owner !== by)) return false; b.owner = by; b.mode = mode; b.st = mode >= 3 ? 'ridden' : 'held'; if (b.beach) this.beachTaken.add(id); return true; }
    free(id, by, { p, q, v, st }) { const b = this.map.get(id); if (!b || (b.owner && b.owner !== by)) return false; Object.assign(b, { owner: null, mode: 0, p, q, v: v || [0, 0, 0], st }); return true; }
    leave(playerId) { const out = []; for (const b of this.map.values()) if (b.owner === playerId) { b.owner = null; b.mode = 0; b.st = 'fall'; out.push(b.id); } return out; }
    snapshot() { return [...this.map.values()].filter((b) => !(b.beach && !this.beachTaken.has(b.id) && b.st === 'stand')).map(({ id, wood, st, p, q }) => ({ id, wood, st: st === 'held' || st === 'ridden' ? 'fall' : st, p, q })); }
    restore(list, beachTaken = []) { for (const s of list || []) this.add({ ...s, owner: null, mode: 0 }); for (const id of beachTaken) this.beachTaken.add(id); }
}
```

### 3.6 `src/game/SurfBoards.js`: the manager

```js
export class SurfBoards {
    constructor(game) {
        this.game = game; this.water = new SurfWater(game); this.reg = new BoardRegistry();
        this.models = new Map();               // id -> {model, body: BoardBody, net: {p,q}|null}
        this.hold = null;                      // {id, grips: {left: localV3|null, right: localV3|null}, theta, q}
        this.ride = null;                      // {id, body, foot: 'left'|'right'|null (null = both on the deck), neutral, legs0: counters, since}
        this.making = null;                    // creation sparkle/grow animation
        this._open = { left: 0, right: 0 }; this._netT = 0;
    }
    get mounted() { return !!this.ride; }
    get riding() { return this.ride?.body.riding ? this.ride : null; }
    handBusy(side) { return !!this.hold?.grips[side]; }

    // ---- creation («Create a Board», from Game._castBuild)
    create() { /* see §4 phase 2 */ }

    // ---- frame (Game.frame: right after swim.update)
    update(dt) {
        this.water.update();
        this._hands(dt);          // grab / carry / let go / push with an open hand
        this._legsAndRide(dt);    // mount / paddle / ride / fall
        if (this.game.authority) this._freePhysics(dt);
        this._remoteBoards(dt);
        this._beachRacks(dt);     // creative + host + game.sea
        this._net(dt);
    }
    // network / save
    netMine() { /* [id, x,y,z, qx,qy,qz,qw, mode] of the board I hold/ride, or undefined */ }
    onNet(m) { /* bdnew | bds | bdtake | bdown | bdfree | bdgone */ }
    snapshot() { return { list: this.reg.snapshot(), beachTaken: [...this.reg.beachTaken] }; }
    restore(s) { this.reg.restore(s?.list, s?.beachTaken); for (const b of this.reg.map.values()) this._ensureModel(b); }
    // things that knock a rider off
    onPush(v) { /* from Game._blowMe / knockback / explosions */ }
    fall(cause) { /* §4 phase 5 */ }
    dropAll(reason) { /* death, flight, leaving: let go of / step off my board */ }
    dispose() {}
}
```

---

## 4. Phases

### Phase 0: contracts and test plumbing (no gameplay yet)

1. Add `src/game/SurfWater.js` (§1) and `src/input/LegReader.js` (§3.3). Wire `data.legs` in `PoseInterpreter.process`.
2. Add a `legs` option to `tests/e2e/poses.mjs` `frame()`. It is opt-in, so old frames are unchanged.
   ```js
   // legs: {left, right}: 'stand' | 'up' (knee to the hip) | 'heel' (the foot kicked up behind) | 'off' (not seen)
   if (legs) {
       const T = 0.8 - sh;
       for (const [side, kneeI, ankleI, hx] of [['left', 25, 27, 0.57], ['right', 26, 28, 0.43]]) {
           const st = legs[side] || 'stand', vis = st === 'off' ? 0.1 : 0.95;
           const knee = st === 'up' ? { x: hx, y: 0.8 + 0.05 * T, z: -0.3 } : { x: hx, y: 0.8 + 0.5 * T, z: 0 };
           const ay = st === 'heel' ? knee.y + 0.12 * T : knee.y + 0.5 * T;
           p[kneeI] = { ...knee, visibility: vis };
           p[ankleI] = { x: hx, y: ay, z: st === 'heel' ? 0.25 : knee.z, visibility: ay < 1 ? vis : 0.3 };
       }
   }
   ```
3. `Character.js`:
   - **Knees.** Each leg pivot gets a thigh (0.5×0.95×0.5) and a `kneePivot` at y = −0.95 holding the shin (0.5×1.0×0.5). Total length stays 1.95 and the default angle is 0, so the look is identical.
   - **`this.legPose = null`.** When set to `{left: {hip, knee}, right: {…}}`, `update()` lerps the pivots to it (k = 10·dt) instead of the run/crouch animation.
   - **`this.boardRoll = 0`.** Fix the roll overwrite: `if (|_fallRoll| > 0.002 || this.boardRoll || rotation.z !== 0) rotation.z = _fallRoll + boardRoll`.
   - **`serializePose()`** adds `lg` (4 numbers, only when `legPose` is set) and `rz` (only when `boardRoll` is set).
   - **`RemoteAvatar.update`** applies `lg` and `rz` and changes the flying test to `ch.flying = !s.bd && Math.abs(rx) > 0.05`.

**Tests:** `leg-reader.test.js`, `surf-water.test.js` (§6).

### Phase 1: the board as a thing in the world

1. Add `BoardModel.js`, `BoardRegistry.js`, `BoardPhysics.js` (free mode only to start), and `SurfBoards.js` with `_ensureModel`, `_freePhysics` and the network/save parts.
2. **Free board physics** (host, or single player; boards within 150 u of any player; others frozen):
   - `stand`: kinematic, upright, nose up, 0.6 of its length sunk in the sand. It gets a collision box like a door (`collision.addBox`, kind `'board'`).
   - `rest`: lying flat on the ground (on its fins/rocker). Static until touched.
   - `fall`: gravity 20 plus spin. On reaching the ground it becomes `rest`. On reaching water (`sample.kind !== 'land'` and y ≤ surface + h) it becomes `float` with a splash (`fx.spark` ×20, `sound.playSplash?.()`).
   - `float`: `BoardBody.step(dt, water, {mode: 'free'})`. Waves wash free boards towards the shore, where `grounded` turns them into `rest` on the sand. Orientation is yaw first, then aligned to the surface normal `(−gx, 1, −gz)`, slerped at k = 6·dt.
3. **Game wiring:**
   - `Game.init`: `this.boards = new SurfBoards(this)` after `this.swim`.
   - `frame()`: `this.boards.update(dt)` right after `this.swim.update(dt)`, so it runs before `items.update` and the hands.
   - `dispose`: `this.boards.dispose()`.
4. **Creative test board:** in `_populate` (creative) add `this.boards.spawn({ id: 'cboard0', wood: 0, st: 'stand', p: [-17.5, ground, -12], yaw: 0 })` next to the gear pedestals. A fixed id, like `tA`/`tS`, so a save moves it rather than duplicating it.
5. **Network and save:** `bdnew`, `bds`, `bdgone`; welcome `boards`; `WorldKeeper.snapshot().boards` / `restoreWorld` (§5).
6. **`debugState()`:** `boards: [...reg.map.values()].map(b => ({id: b.id, st: b.st, owner: b.owner, mode: b.mode, p: b.p}))` and `ride: this.boards.ride && {foot, riding, u, beta, yaw}`.

### Phase 2: «Create a Board» and how it is learned

1. **`matchSpell`**, right after the `CreateBed` line and before the building words:
   ```js
   if (!has('абордаж', 'abordag', 'aborda') && (has('surfboard', 'surf board', 'серфборд', 'сёрфборд', 'серф борд') ||
       (has('board', 'борд', 'bord', 'борт', 'доск', 'bored') && has('creat', 'крейт', 'криейт', 'криэйт', 'креит', 'созда', 'сдела', 'make', 'мейк')))) return 'CreateBoard';
   ```
2. **`Builder.js`:**
   - `BUILD_SPELLS.CreateBoard = { name: 'Create a Board', ru: 'доска для волн', cost: 6 }`.
   - `knows(spell)` becomes: creative, or `books?.learned.has(spell)`, or `!!game.bonus?.spells?.[spell]` (the scroll).
3. **`Game._castBuild`:**
   - Route `else if (name === 'CreateBoard') hint = this.boards.create();`.
   - Not-learned text for the board: `'🏄 «Create a Board» ещё не изучено — найдите его в книге птицы или сожгите свиток'`.
   - After success, next to the existing fatigue deduction: `this.combat.practice?.('CreateBoard')`. This is the mana design's success hook (+1 to the maximum, not a "strong" spell).
4. **`SurfBoards.create()`:**
   - **Aim:** `builder._hand()` (a raised hand, ray ≤ 10).
     - A spawn-area tree: `builder._treeOnRay`. Remove it with `world.removeTree(t)` and `sync.treeGone(t.index)`, the same as Gather.
     - A block tree: `builder._hitCell`, then `TREE_KINDS.find(k => k.wood === cell.type)`, then `builder._flood(cell, t => t === kind.wood || t === kind.leaves, 6, 500)`. It needs at least 4 trunk cells. All cells are set to AIR via `builder._sendEdits` (the whole tree goes, as with Gather).
     - Other wood blocks (WOOD/PLANKS/PLANKS_DARK walls): needs 6 connected cells, consumes 6. On `isCastleBlock`, call `castleLife.damaged(...)` (the guards come, like Gather).
     - Creative: nothing is consumed. The board appears where the hand points: the tree's foot, or the ground/water point of the ray.
   - **Hints:** no raised hand gives `'🏄 Поднимите руку, покажите на дерево и скажите «Create a Board»'`. No wood hit gives `'🏄 Покажите рукой на дерево (до 10 м)'`. Small wood gives `'🏄 Мало дерева — нужен ствол (4 бревна)'`.
   - **Result:** `id = 'b' + Date.now().toString(36) + rand`. Wood = the tree kind. `st = 'stand'` at the trunk's foot, deck facing the caster (`yaw = ch.rotation.y + π`). If the target point is water: `float`.
   - **Feedback:** a 0.8 s grow (`making` scales 0.1 → 1, sparkles from the trunk to the board, `builder._flyToHand`-style). Then `reg.add`, `_ensureModel`, `sync.boardNew(rec)` and the voice line `'🏄 Доска готова! Возьмите её двумя руками за края'`.
5. **`BookBirds.js`:**
   - `BOOK_POOL.push('CreateBoard')`.
   - `HOW.CreateBoard = { words: 'Create a Board', hand: 'board', text: 'Поднимите руку, покажите на дерево и скажите заклинание — ствол станет доской для волн. Возьмите её двумя руками за края, отнесите к воде, положите на воду и разожмите руки. Поставьте на неё ногу (поднимите колено над доской и опустите), другой ногой гребите. Поймали волну — встаньте на доску обеими ногами; наклон влево-вправо поворачивает.' }`.
   - `drawPage`: add a `'board'` drawing (a tree, an arrow, a surfboard outline with fins).
6. **`ItemTypes.js`:**
   - `SPELL_RU.CreateBoard = 'Create a Board'`.
   - `export const SPELL_RIBBON = { ...SCROLL_SPELL_COLOR, CreateBoard: 0x2ec4b6 }`, used by `makeItemModel` / `describeItem` / `Items.applyScroll`. Do **not** add CreateBoard to `SCROLL_SPELL_COLOR`.
   - `rollLoot` scroll branch: insert `: y < 0.56 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'CreateBoard' }` and move the hp threshold from 0.70 to 0.76.
   - `describeItem` for that scroll: second line `'Его можно выучить и из книги птицы-книги'`.
   - `WAND_DIRS.build.spells.push('CreateBoard')`.
7. **`Codex.js`:** `{ cat: 'water', name: 'Create a Board', say: 'рука на дерево + «Create a Board»', desc: 'Ствол дерева становится доской для волн. Несите её двумя руками, положите на воду, встаньте одной ногой и гребите другой; волна подхватит — встаньте обеими ногами и держите равновесие наклоном.', dmg: '—', cost: 6, icon: 'assets/icons/water.svg' }`.

### Phase 3: hands (carrying for real)

`SurfBoards._hands(dt)` runs each frame for my hands.

1. **Grab.**
   - Conditions: the hand is visible, curl > 0.5, it was open (< 0.3) within the last 700 ms or 12 frames (the same rule as `Weapons`), and nothing else is in it (`items.held`, `weapons.hands[side].held`, `books.reading.handBusy`).
   - The palm grip point `weapons.palmFrame(side).G` must be within `GRAB_REACH` of a rail point (`nearestRail` in board-local space) of a board that is not owned by someone else.
   - Single player or host: `reg.take(id, me, mode)`. Guest: `bdtake`, wait for `bdown` (1.5 s timeout, like `items` `L.asked`).
   - The grip stores the local rail point. Call `hand.setGrip(0.62)` so the fingers wrap the rail.
   - A board in `stand` or `rest` can be taken. A `float` board can be taken while standing or swimming next to it.
2. **Carry.**
   - Two grips: `solveTwoHands`. One grip: `solveOneHand`. The board model gets `pos`/`quat`.
   - The drawn hands go to the grips with `ch.reachHand(side, gripWorld, 1, 0.13)`, the same as the bow's drawing hand. Tracking stays the player's own because `restoreArms` runs each frame.
   - Consequences of the solver: the board never goes through the torso box, the ground, or below the water surface (it floats against the hands), and a one-hand board drags its tail on the ground.
   - A held board's sample points inside solid blocks or boxes (`collision.pointBlocked`) push the hero back. A board can't be carried through a wall or a door frame.
3. **Let go.**
   - A hand's curl < 0.3 for 0.25 s releases that grip and calls `setGrip(null)`.
   - Two hands down to one: the board pivots in the remaining hand (`solveOneHand`). It does not drop. This follows "nothing falls by accident".
   - The last hand opens: `bdfree` with p/q and the hand velocity, then the state is `fall` (or `float` if its bottom is at the surface: placed on the water).
   - `slip` from the solver (hands pulled apart much wider than the grips) opens the weaker hand: that grip goes, the other stays.
4. **Two-hand throw.** If both hands open within 150 ms while moving fast (|v| > 6 averaged), the board flies at 0.6 × the average hand velocity (weight 4).
5. **Open-hand push.** An open hand moving into a floating, unowned board (closest rail point < 0.25) adds `v_hand·n × 0.6` to the board's u/w. The hand is drawn stopped at the rail with `reachHand` to the contact point. A board can be pushed ahead while wading.
6. **Pocket.** `Inventory.pocketRight` / pocket strike while a board is held: no-op plus the toast `'🏄 Доска слишком большая для кармана'`.
7. **Grab gating elsewhere.** Add `|| g.boards?.handBusy(side)` in `Items.update` (pick up), `Weapons` grab (next to `books.reading.handBusy`), and `BookReading` (a cover can't be taken by a board hand).
8. **Swimming support.** Holding a floating board with both hands in deep water: `Swimming.update` treats the hero as floating (kick not needed): `if (g.boards?.supportsMe()) vy = max(vy, 0)`.

### Phase 4: legs (getting on, paddling, getting off)

`SurfBoards._legsAndRide(dt)` uses `pose.legs` counters (`left`/`right`: `lifts`, `plants`, `strokes`) and keeps the last seen values.

1. **Legs not seen** (`!legs?.seen` for more than 1.5 s near a floating board, or mounted): show `'🦵 Камера не видит ваших ног — отойдите от камеры, чтобы были видны колени'` at most every 6 s. Mounting is impossible.
   - While mounted, paddling falls back to running in place (`pose.isRunning`, strokes at `runIntensity × 1.6 Hz`), the same rule `Swimming` already uses. The rider never falls because the legs vanished.
2. **Mount conditions:**
   - A `float` board, unowned or mine.
   - The hero is not flying, on a horse, levitated, dead, frozen or stunned.
   - The feet are near the water (`p.y − 1.95 < surface + 0.6`), so no mounting from a cliff.
   - In board-local space, the hero is within `MOUNT_REACH` of the deck rectangle.
   - The board's yaw is within ±70° of the hero's facing. Otherwise: `'🏄 Встаньте так, чтобы нос доски был впереди'`.
3. **Mount gesture:** leg S `lifts` +1, then `plants` +1 within 1.5 s, while the conditions hold. The S foot is on the deck; the other leg is the paddle leg in the water.
   - Single player or host: `reg.take(id, me, 3 or 4)`. Guest: `bdtake` with `{mode: 'ride'}`.
   - Then `ride = {id, body: BoardBody(from the board pose), foot: S, neutral: torso mean over the first 0.8 s (like Flight._calibrate)}`.
   - The board turns to the hero's facing over 0.4 s.
   - Voice: `'🏄 Вы на доске! Гребите свободной ногой: поднимайте колено или отталкивайтесь назад'`.
4. **Placing the hero (each frame while mounted, after `BoardBody.step`):**
   - The hero's yaw is the board yaw. Set `g.cameraBaseRotation = ch.rotation.y = yaw`; head yaw only looks around.
   - Position = deck point + rider offset: one foot gives lateral `±W/2` (the paddle leg's side, outside the rail; the deck leg at ±0.35); standing gives 0. y = deck + `PLAYER_GROUND_OFFSET` − (crouch ? 0.7 : 0).
   - `ch.legPose`: one foot gives the deck leg (hip −0.6, knee 1.1) and the paddle leg (hip swinging with the stroke phase, knee 0.2), with its foot below the deck in the water. Standing gives both legs at (hip −0.35·crouch, knee 0.7·crouch).
   - `ch.boardRoll = body.roll + body.beta`; `ch.group.rotation.x = −body.pitch × 0.6`.
5. **Paddling:** strokes of the paddle leg (counter difference) go into `input.strokes`, `strokeSide = paddle side`. Leaning steers (§3.2).
6. **Standing up** (the free leg `lifts` and `plants` while mounted on one foot): `foot = null` (standing), the hero recentres over 0.3 s. Voice while riding: `'🏄 Держите равновесие наклоном: влево-вправо — поворот, вперёд — быстрее, назад — тормоз'`.
7. **Getting off:**
   - **One foot, the deck leg `lifts`** (both feet off): you are in the water next to the board. `bdfree` with st `float`.
   - **Standing, a nose jump** (`Animals._detectJump`, moved to a shared helper): off forward.
   - **Standing, stepping one foot off** (a leg lifts and plants with the torso lateral > 0.15 to that side): one foot again on that side. While riding that is allowed but harder (`ONE_FOOT_TAU`).
   - **Grounded on the beach:** walking (`isRunning`) steps off onto the sand and the board becomes `rest`.

### Phase 5: waves, riding, falling, interplay

1. **Each frame while mounted:** `ev = body.step(dt, water.sample, {mode: foot ? 'one' : 'stand', strokes, strokeSide, ...riderInput(pose.torso, neutral), crouch: ch.isCrouching, armsOut: lateral hand spread > 1.9 × arm length (ch.isTPose-like), t: water.time()})`.
2. **Events:**
   - `caught`: `'🌊 Волна подхватила вас!'`, plus `'Встаньте на доску обеими ногами'` if on one foot.
   - `lost`: `'🌊 Волна ушла вперёд'`.
   - `fall` triggers `fall(cause)`, with these messages:
     - balance: `'💦 Вы упали с доски'`
     - pearl: `'💦 Нос доски ушёл под воду — вы упали'`
     - wipeout: `'💦 Волна накрыла вас'`
     - thrown: `'🏖️ Доска выехала на берег — вас бросило вперёд'`
     - shore: `'🏖️ Доска выехала на берег'` (not a fall; step off normally)
3. **"Wave coming" hint:** mounted, not riding, and `sample(x − dx·15, z − dz·15).h > 0.6` with the board heading within 60° of the wave direction: `'🌊 Волна! Гребите к берегу'` (once per wave, after a 4 s cooldown).
4. **`fall(cause)`:**
   - `ride = null`, `ch.legPose = null`, `boardRoll = 0`.
   - The hero goes into the water beside the board (lateral offset, y = surface − 0.5). `g.knockback` = board velocity × 0.5, plus 4 along the heading for pearl or thrown.
   - The board becomes free: `bdfree` with st `float` and its velocity. It keeps going, then waves wash it to the shore (no leash needed).
   - Swimming and air take over (`Swimming` already does this).
   - Shallow-water falls only (depth < 1.5, speed > 6): 1 damage in the free world, `combat.damage(1, null, 'board')`.
5. **Game integration:**
   - `_updatePlayer`:
     - `ch.update(dt, collision, !flight.active && !animals.riding && !boards.mounted && …)`.
     - Skip `resolveCylinder` when mounted. The board instead uses `collision.resolveCylinder(boardPos, 0.8, deckY, 1)` for boxes such as future ships and piers.
   - `Swimming.update`: `if (g.boards?.mounted) { this.swimming = false; ch.swimY = null; ch.speedScale = 1; ch.swimming = false; … skip legs/air sinking }`.
   - `_keepBodiesApart`: when `boards.mounted`, the mover is the board's position. `bodyAt` = `heroBody` at the rider spot. After `moveSolid`, copy the result into `ride.body.x/z`.
   - `_blowMe` and knockback while mounted go to `boards.onPush(v)`:
     - If |v| > 6 and v is not aligned with the heading: `fall('hit')`.
     - If v comes from a Wave Attack aligned with the heading (dot > 0.7): it is absorbed (the transient wave in `SurfWater` carries the board instead).
   - `applyExplosion`: `this.boards?.blast(pos, radius, power)`. Free boards are thrown (`fall` state); a rider within radius + 3 falls.
   - `combat.damage` ≥ 3 while mounted: `fall('hit')`. `combat.stun`: `fall('stunned')`. Frozen: no control, so balance decays naturally.
   - `startFlight`: if mounted, `boards.dropAll('fly')` first. Leviosa lifting me: `dropAll('lifted')`. `onLocalDeath`: `dropAll('dead')` (held or ridden boards are freed where they are).
   - Spells while riding: allowed (arms are free). «стоп» does not affect the board (it is not a spell).
   - `SpellManager.castWave`: add `this.hooks.waveMade?.({x: origin.x, z: origin.z, dirX: dir.x, dirZ: dir.z, speed, height, width, dist})`. Game hooks it to `this.boards?.water.addTransient(w)`. Wave Attack waves can be ridden on lakes.
   - Inferno ray hitting a free board (`birdRay`/`ignite` hooks): it burns away in 6 s (`bdgone`). Wooden boards burn; nothing burns while held.
   - Accio pointed at a free board: it flies, but stops 1.5 in front of the hero at hand height (`st: 'fall'` at rest in the air for 1 s). It is not put into one hand: it is too big; take it with two hands. Leviosa on an unowned board: lift it like an item. On an owned board: refused (`levno`-style hint).

### Phase 6: multiplayer polish, beaches, save

1. **Remote riders and carriers.** `SurfBoards._remoteBoards`: for each `r.target?.bd`, show the board `bd[0]` at `bd` p/q (interpolated with k = dt·12, like `RemoteAvatar`) and hide the free copy. If `bd` vanishes without a `bdfree`, keep the last pose; the host's `bds` corrects it.
2. **Beach racks (Creative, host, `game.sea`).**
   - Every 2 s, `sea.beachesNear(player, 140)`. For each beach with `key = round(x/16)_round(z/16)`, not racked and not in `beachTaken`:
     - Spawn 3 boards in `stand`, 1.8 apart along the beach, facing the sea.
     - Ids `cb_<ix>_<iz>_<0..2>`, wood from `hash(seed, ix, iz)`, `beach: true`, sent with `bdnew`.
   - Untouched rack boards more than 250 from every player are removed locally. They are deterministic, so they come back.
3. **Late join and save:** welcome `boards: g.boards.snapshot()`; client `g.boards.restore(msg.boards)`. Keeper snapshot `boards`; `restoreWorld`: `if (save.boards) g.boards?.restore(save.boards)`.

---

## 5. Network messages (add to the NetSync header comment and `_onMessage`)

| t | direction | payload | handling |
|---|---|---|---|
| `bdnew` | creator → all | `{b: {id, wood, st, p, q}}` | `reg.add` + model. Host keeps it for welcome/save. Ignore duplicates. |
| `bds` | host → all, 10×/s, moving free boards only | `{l: [[id, x,y,z, qx,qy,qz,qw, st]]}` (st: 0 stand, 1 rest, 2 float, 3 fall) | Guests interpolate, skip their own. |
| `bdtake` | guest → host | `{id, mode}` (1/2 hold, 3/4/5 ride) | Host: `reg.take(id, from, mode)`. Success: broadcast `bdown`. |
| `bdown` | host → all | `{id, to, mode}` | `to === me`: start the hold or ride. Others: mark owned (no grabbing; render from `p.bd`). |
| `bdfree` | owner → all | `{id, p, q, v, st}` | `reg.free`. Host resumes simulation from p/q/v. |
| `bdgone` | host → all | `{id}` | Burnt/removed: dispose. |
| `p.bd` (field of the existing `p`) | owner → all, 20×/s | `[id, x,y,z, qx,qy,qz,qw, mode]` | Remote board pose (and, with `p.s.lg`/`rz`, the rider's legs and roll). |

**Host `_onLeave(id)`:** `reg.leave(id)` gives the ids, which become `fall` at the last remote `bd` pose, then `bds`.

**Clamping on receipt** (anti-garbage, as elsewhere): coordinates must be finite, |v| ≤ 40, mode within 0..5.

**Senders** (methods on NetSync): `boardNew(rec)`, `boardTake(id, mode)`, `boardFree(rec)`. In the `p` send add `bd: g.boards?.netMine()`. Guests' own `pstate` is unchanged (a board is not an inventory thing).

---

## 6. Tests

### Unit (`npm test`, Node, three from devDependencies)

**`tests/unit/leg-reader.test.js`**

Build landmarks with a helper `lm({lKnee: 'up'|'down', rKnee, lAnkle, …, noise})`: hips at y 0.8, shoulders at 0.42 (T = 0.38).
- Left knee: 10 frames down, 6 up (y 0.82), 10 down. Expect `left.lifts === 1`, `left.plants === 1`, `left.strokes === 1`, `right.lifts === 0`.
- A down/up cycle at 1.5 Hz for 4 s on the right gives `right.strokes` in [5, 7]. The left leg standing with ±0.02 jitter gives `left.lifts === 0`.
- Heel kick (ankle from 1.18 to 0.86, knee still) counts as a stroke.
- Knee visibility 0.2 for 600 ms gives `seen === false`.
- Repeating the same frame object 5 times gives no extra counts.

**`tests/unit/surf-water.test.js`**
- `makeSwell({height: 2, length: 40, depth: 6})` at fixed t: `h` is within ±1, `gx ≈ ∂h/∂x` (finite difference, 1e-3), `c ≈ √(20·6)`.
- With `shore: {s0: 100, slope: 0.05}`: `sample(101, 0)` is null (land); depth at s = 80 is 1. When 2A/d ≥ 0.78, `breaking ≥ 0.9`.
- `SurfWater` with a fake game (`swim.waterAt` → {surface: −0.5, depth: 4}, no sea) gives `kind 'lake'`, `surface −0.62`, `h 0`.
- `addTransient` raises `h` at the bump centre to the height, then expires after `(dist + 3)/speed`.

**`tests/unit/board-physics.test.js`** (`BoardBody`, `makeSwell` / flat water)
- **Float settles:** free board started 0.5 above flat lake water. After 2 s: `|y − (surface + T/2 − DRAFT)| < 0.02` and `|u| + |w| < 0.05`.
- **Paddle:** mode 'one', 1 stroke every 0.62 s for 10 s. Final u in [3, 5.2]; |w| < 0.2. Strokes only on the right make yaw decrease by more than 0.3 rad over 10 strokes (nose turns away from the paddle side). 60 strokes give u < `PADDLE_MAX`.
- **Catch:** swell (height 1.8, length 40, depth 5, `dir` +x) and a board heading +x (yaw = −π/2) paddling at about 4.5 u/s. Within 8 s it gets `caught`, then `riding === true`, mean u over 2 s ≥ 0.75·c, and displacement > 40.
  - Not paddling (u = 0): no `caught`, |Δx| < 4 over 8 s.
  - Heading ⟂ to the waves: no `caught`.
- **Steady carve:** riding at u = 8 (frozen speed via a flat `water` with slope 0, u forced each step), lean 0.25 for 5 s. No fall; |Δyaw| > 2.5; |β| < 0.1.
- **Over-lean when slow:** u = 3, lean 0.7. Fall with cause `balance` within 1.5 s.
- **Controllable instability:** β0 = 0.05, lean 0, flat water. Falls in 2–5 s. With lean = −2.5·β (a P-controller standing in for the player), |β| < 0.1 for 10 s.
- **Stabilizers:** time to fall from β0 = 0.05 is longer with `crouch` (×≥1.4) and with `armsOut`, and shorter with mode 'one' while riding.
- **Pearl:** a face slope 0.7 (a synthetic sample) with trim 0.9 gives a fall with cause `pearl`. Trim −0.8 makes u fall faster than trim 0, and later gives `lost` (no fall).
- **Shore:** a sloping beach, riding at 6. On depth < 0.35: event cause `thrown` (u > 4), then u < 0.3 within 2 s. At 2 u/s: cause `shore`, no `thrown`.
- **Determinism:** two runs with the same inputs give identical state.

**`tests/unit/board-hold.test.js`**
- **Two grips on opposite rails at mid-length,** hands 1.3 apart at chest height, palms up. Deck normal·up > 0.8. The board is clear of the torso box (no corner or rail sample inside). `drawA`/`drawB` are within 1e-3 of the grips. Palms facing each other (no wrist torque), grips on the same rail: the board hangs (deck normal·up < 0.3).
- **Hands moved apart** by grip distance + 0.6 gives `slip` on the hand whose curl is lower.
- **One hand at the nose rail,** hand 1.3 above flat ground (0): `min y` of the rail samples is within 0.05 of 0 (the tail rests). Hand moving +x with trail = −x: the tail is at x < hand.x.
- **Water:** lowering the hands until the bottom would be 0.5 below the surface clamps the board bottom to ≥ surface − 0.1, and the drawn hands are returned at the clamped grips (above the tracked hands).

**`tests/unit/board-spell.test.js`**
- `matchSpell`:
  - Gives `'CreateBoard'` for 'Create a Board', 'create a board', 'криэйт э борд', 'крейт э борд', 'создай доску', 'surfboard'.
  - Is still `'CreateDoor'` for 'Create a Door', `'CreateBed'` for 'Create a Bed', `'CreateFloor'` for 'Create a Floor'.
  - Is not `'CreateBoard'` for 'абордаж'. Is still `'Inferno'` for 'инферно'.
- `BUILD_SPELLS.CreateBoard.cost === 6`. `BOOK_POOL` includes it. `bookSpells(id)` over 2000 ids contains CreateBoard at least 50 times.
- `rollLoot` with a seeded RNG (`createRng`) over 5000 rolls: CreateBoard scrolls make up 0.5–4 % of all items. `SCROLL_SPELL_COLOR.CreateBoard === undefined` and `SPELL_RIBBON.CreateBoard` is defined.
- `Builder.knows('CreateBoard')` with a fake game:
  - false in freeworld;
  - true after `books.learned.add`;
  - true with `bonus.spells.CreateBoard`;
  - true in creative.

**`tests/unit/board-registry.test.js`**
- `take` by A, then `take` by B fails. `free` by B fails; `free` by A succeeds. `leave(A)` frees A's boards to `fall`.
- `snapshot()` saves held/ridden boards as `fall` and leaves out untouched beach rack boards. A taken beach board stays out of racks after `restore` (`beachTaken`).

### E2E (`npm run test:e2e`)

New file `tests/e2e/surf.test.mjs` (port 8171, same before/after as `world.test.mjs`) plus one case in `multiplayer.test.mjs`. Waves are injected with `const { makeSwell } = await import('/src/game/SurfWater.js'); g.boards.water.sea = makeSwell({...})`.

**1. «Create a Board» is learned outside Creative; Creative makes it out of nothing.**
- Freeworld: find the nearest alive `g.world.trees` entry and stand 5 in front, facing it (set `cameraBaseRotation` and body rotation). Feed `{arms: 'forward'}` ×20.
- `g.castLocalSpell('Create a Board', true)` returns null and the voice text contains 'не изучено'.
- After `g.books.learned.add('CreateBoard')` and `g.combat.fatigue = 30`: the cast returns 'CreateBoard'.
- Within 1.5 s: one new board with `st 'stand'` within 3 of the tree; `tree.alive === false`; the strength (fatigue, or mana after #123) dropped by 6.
- A second run burns a scroll instead (`g.items.applyScroll({kind: 'scroll', stat: 'spell', spell: 'CreateBoard'})`): the cast works.
- Creative: casting at bare ground 6 ahead gives a board at the hand's point, nothing removed.
- Pointing at a castle's planks (find a CS/PLANKS cell via `terrain.data.castles`) calls `castleLife.damaged` (spy). `realErrors(errors)` is empty.

**2. Carrying with two hands, one hand drags, the hands stay on the rails.**
- Creative; `cboard0` standing. Put the hero 1.2 in front of it with the rails at hand height.
- Feed `{arms: 'forward', leftCurl: 0, rightCurl: 0}` ×10, then curls 0.9 ×15. Expect `boards.hold.grips.left && .right` and owner === localId.
- Walk (bob frames ×60). |Δboard − Δhero| < 0.3. Each drawn hand (`getGripObject` world pos) is within 0.1 of its grip. No rail sample is inside the torso box.
- Open the right hand (rightCurl 0) ×15: one grip left; the board's lowest point is within 0.15 of the ground.
- Pocket frames with the board: the board is still held and the toast contains 'карман'.
- Open both: st 'fall', then 'rest' within 2 s.

**3. Onto the water, one foot on, paddle with the other.**
- Freeworld lake search as in `world.test.mjs` (depth ≥ 3). Hero at the edge (depth about 1.5), board held as in test 2.
- Arms down plus curls 0: the board settles at `float` with `|y − (surface + T/2 − DRAFT)| < 0.1` within 1 s.
- Legs: `legs: {left: 'up'}` ×8, then `{left: 'stand'}` ×8. Expect `boards.ride.foot === 'left'`, the board's owner === me, and hero y ≈ deck + 2 (±0.3).
- Paddle: right 'up'/'stand' alternating every 10 frames for 4 s. The board moved more than 6 along its heading. `ch.legPose` is set. `swim.swimming === false`.
- `legs: {left: 'off', right: 'off'}` ×60 gives a hint containing 'не видит'.
- Left lifts (both feet off): in the water (`ride === null`), the board is `float`.

**4. Riding a wave: catch, steer by leaning, fall.**
- Lake mounted as in test 3. `g.boards.water.sea = makeSwell({dirX, dirZ along the board heading, height: 2, length: 40, depth: 5})`, standing up with `legs: both 'stand'`.
- Force u = 5 once (as the e2e shortcut for paddling). Within 6 s, `ride.body.riding === true`.
- `lean: 0.06` frames ×45 give yaw increase > 0.3 (left). `lean: −0.06` gives a decrease.
- `lean: 0.2` held: fall within 4 s; `ride === null`; the hero is in the water; the board is `float` and still moving (|u| > 1) right after.
- Second scenario: Wave Attack cast behind a mounted board on a calm lake (no sea) gives `riding` true at some frame during the wave's life.

**5. Multiplayer** (in `multiplayer.test.mjs`, creative room).
- Host creates a board: within 3 s the guest has a board with the same id and |p| difference < 0.2.
- Guest takes it with two hands (synthetic frames on the guest page): the host's registry shows owner = guest id, and the host board stays within 0.4 of the guest avatar's hands.
- Host closes a hand on the same rail: still owned by the guest.
- Guest mounts (lake far from spawn; teleport both). The host's remote avatar has `ch.flying === false`, the board under its feet (|board.y − (avatar.y − 2)| < 0.4), avatar `rotation.z ≈ guest boardRoll` (±0.1).
- Guest page closes: within 3 s the host board is unowned and `st ∈ {fall, float, rest}`.

**6. Save** (in `surf.test.mjs`).
- Host, single player, freeworld: create a board and put it on the water; `await g.keeper.save()`.
- `loadWorld(id)` has a `boards` entry with that id and `st 'float'`.
- `restoreWorld` into a new game (same pattern the save tests use) brings the board back within 0.5.

---

## 7. Edge cases (and what happens)

**Creating**
- Pointing at a tree with too few logs, or at a tree another player already gathered: hint, no cost.
- Burning trees: allowed. The board is wood colour; fire on the source doesn't matter.
- Castle or house planks: board made, plus the crime report.
- Pointing at water: a floating board appears.
- Maps (`world.isMap`): the spell works with trees there, though there is no sea.
- Test mode (`books` null): knowledge only via creative/test or a scroll.

**Hands busy**
- A weapon, item or book in one hand: that hand can't grip. With one hand free the board can be grabbed but drags; the hint says to free the other hand.
- On a horse, or flying: grabbing is refused with a hint.

**Two players**
- Both grab the same board: the host decides the first `bdtake`; the loser's hand closes on nothing (no grip).
- A guest's grab is in flight while the host simulates the board drifting: the guest's grip uses the board pose at grant time (`bdown` carries nothing; the guest re-anchors to the current local pose of that board).
- Two riders on one board: impossible (`take` refuses).
- Riders bump into each other: bodies are solid (`_keepBodiesApart` with the board as the mover). Boards themselves don't collide.

**Camera and tracking**
- The webcam doesn't see the legs (common): mounting is refused with a clear hint. Mounted riders paddle by running in place. Nothing happens at random.
- Default synthetic frames read both knees "up". The first-frame lift only matters next to a floating board.
- Lag of about 100 ms: `TAU` 1.4 s and the dead-zones make balance playable. Crouch and arms out help (realistic).
- The board blocks the FPV view when carried upright in front: real. The player can carry it lower, sideways, or with one hand dragging.
- Lean neutral is taken at mounting; a player who mounted while leaning has an offset. The neutral re-learns slowly while not riding (`neutral.lateral += (lateral − neutral)·0.05·dt`).

**Riding**
- A fall in shallow water near the shore: 1 damage only in the free world at speed > 6. Creative: never.
- Falling while underwater with a breaking wave: `Swimming` air rules apply (20 s).
- A board washed onto sand is `rest`; it can be picked up again. A free board drifting out to sea with no waves stays. Accio brings it back (Phase 5).
- Bombardo near a floating board: thrown. Explosion knockback on a rider: falls.
- Stupefy or freezing while riding: stun gives an immediate fall; frozen gives loss of control, then a natural fall.
- Wave Attack hits a rider sideways: falls. Aligned: rides it.
- Flight or Leviosa on the rider: dismount first, and the board continues as a free board.
- Riding into a pier or ship box: `resolveCylinder` stops the board; u becomes 0; at u > 4 the rider is thrown.

**Lifecycle**
- Death while holding or riding: the board is freed at its place (#122: things drop). The knowledge reset on death follows #122/#123.
- Leaving mid-ride: the host frees it; it keeps floating there.
- Save while a guest holds a board: saved as a free board at the guest's last pose.
- Old saves have no `boards` field: fine, `restore(undefined)`. Old clients (version mismatch) ignore `bd`/`lg`/`rz`; version checks already exist.
- Chunk unload with far boards: data only. Free-board physics runs only within 150 of players. A ridden board far from the host still simulates on the rider's computer.
- `BOOK_POOL` change re-rolls ground books' contents: acceptable (books in hands or saves keep `item.spells`).

**Spell and costs**
- «Create a Board» heard as «Create a Door»: the CreateBoard check runs first only on "board" words. «Door» still wins on 'door'. A unit test pins both.
- Mana (#123): the 6 cost is paid only on success, then the +1 practice hook. Creative: free. Riding and paddling: no cost or gain.

---

## 8. Files touched (summary)

**New**
- `src/game/SurfWater.js`
- `src/game/BoardPhysics.js`
- `src/game/BoardHold.js`
- `src/game/BoardRegistry.js`
- `src/game/SurfBoards.js`
- `src/entities/BoardModel.js`
- `src/input/LegReader.js`
- `tests/unit/{leg-reader,surf-water,board-physics,board-hold,board-spell,board-registry}.test.js`
- `tests/e2e/surf.test.mjs`

**Changed**
- `src/fx/SpellManager.js`: `matchSpell` plus the `castWave` hook `waveMade`.
- `src/game/Builder.js`: `BUILD_SPELLS`, `knows`.
- `src/game/Game.js`:
  - init, frame order, `_castBuild` route and practice hook;
  - `_updatePlayer` move/collision flags, `_keepBodiesApart` mover;
  - `_blowMe` / knockback / `applyExplosion` → boards;
  - `startFlight` / `onLocalDeath` → `dropAll`;
  - `_populate` `cboard0`, the `waveMade` hook, `debugState`, `dispose`.
- `src/game/Swimming.js`: mounted bypass, two-hand board support.
- `src/game/BookBirds.js`: `BOOK_POOL`, `HOW`, `drawPage` 'board'.
- `src/game/ItemTypes.js`: `SPELL_RU`, `SPELL_RIBBON`, `rollLoot`, `describeItem`, `WAND_DIRS.build`.
- `src/game/Items.js`: ribbon colour, `handBusy` gating.
- `src/game/Weapons.js` and `src/game/BookReading.js`: `handBusy` gating.
- `src/game/Inventory.js`: pocket refusal.
- `src/entities/Character.js`: knees, `legPose`, `boardRoll`, roll fix, serialize `lg`/`rz`.
- `src/net/RemoteAvatar.js`: `lg`/`rz`, the flying fix.
- `src/input/PoseInterpreter.js`: `data.legs`.
- `src/net/NetSync.js`: messages, `p.bd`, welcome, leave, `clockSkew`.
- `src/game/WorldSave.js`: `boards` in snapshot/restore.
- `src/ui/Codex.js`: entry.
- `tests/e2e/poses.mjs`: `legs`.
- `tests/e2e/multiplayer.test.mjs`: case 5.

**Depends on the sea design:** `game.sea.sample/time/beachesNear`, and the shared wave clock. Until then: lakes, Wave Attack waves, and `makeSwell` in tests.

No files were written. Scratch dir `/tmp/claude-0/-home-user-working-hand/c56317fb-a629-5b40-ba8b-0996403aa7d1/scratchpad/bf/` unused.