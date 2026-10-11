The relayed request in this run is about the mana bar (backlog item #123). The computed task asks for sword/axe dismemberment, which is backlog item #119 (`Меч/топор отрубают части тела ЛЮБОМУ существу — там, где прошёл удар`). The two don't conflict and this is read-only design work, so I did #119. Before anyone builds it, the orchestrator should confirm the author still wants it now. The only overlap with mana: `Game.respawn()` resets both, and nothing here touches fatigue or mana.

I made no repo edits. Two scratch prototypes are in `/tmp/claude-0/-home-user-working-hand/c56317fb-a629-5b40-ba8b-0996403aa7d1/scratchpad/bf/`: `proto.mjs` (swept cut and body blocker) and `cutproto.mjs` (box cutting with the texture remapped). The numbers in the tests below come from running them against the real `VoxelCharacter` and `Weapon`.

---

# DESIGN: sword/axe dismemberment (players, then knights and villagers)

## 1. Rules as built

| Author's rule | How it works |
|---|---|
| The cut is exactly where the blade passed, not at joints | The blade's edge between the last frame and this one forms a surface. We intersect it with each limb's bone line. The crossing point gives the remaining length `d`, measured from the shoulder or hip. The model is shortened to exactly `d`, and its end cap is tilted along the cut plane. |
| Sword cuts; the axe is harder | Only the edge cuts. Sword edge: the whole blade, both sides, 2.55 m, needs 6.5 m/s. Axe edge: only the bit, one side, 0.73 m, set 0.88 m off the shaft, needs 9.5 m/s. |
| Decapitation is instant death at any HP | A neck capsule (group y 1.45…1.80) runs between the torso box and the skull box. Cutting it calls `Combat.die(by,'decap')`. |
| Armour stops it | Players: steel parts of the look (Латы, Шлем, Поножи, Латные) cover zones; see §9. Knights and king: blocked while `v.armor > 0`. |
| After a cut the victim bleeds; «Rescue» stops it | `Bleeding.start(rate, text)`: hand 0.5, arm 1, leg 1.5 HP/s. The existing `rescue()` and `stop()` are unchanged. The limb stays off. |
| The limb stays missing until death and respawn | The state is held by the victim. It is restored only in `Game.respawn()` and in the `prespawn` handler. A life counter rejects cuts aimed at the previous life. It is saved in the snapshot, so leaving and rejoining doesn't heal you. |
| No hand: can't hold or cast with it | The hand is hidden, whatever it held falls, grabbing, gestures and punches are gated, and spells that hand was holding end. |
| No leg: slow, falls | A 2.2 s fall (knocked down plus stun). After that, hopping at 0.4× walking speed with no running. With both legs gone: crawling at 0.2×, body lowered to the longer stump. |
| The severed part is a physics prop with blood | `SeveredPart` is a copy of the cut-off piece as it was (clothes, hand pose, a knight's sword). It tumbles, rests, drips blood for 6 s, stays 120 s, then sinks. |
| Network | The attacker detects the cut and sends `phit.sv`. The victim checks and applies it, then sends `limb` to everyone. Everyone draws the stump and spawns the prop. The pose message `p` carries the limb state for latecomers. |
| No accidental cuts | All of these must hold: the edge leads (not the flat), the speed is at least the need, the previous frame was already a swing, the tip speed is at most 60 m/s (faster means a tracking jump), and the blade did not go into the torso or skull first. Your own limbs are never targets. |

## 2. Relevant facts in the current code

- `Weapons.checkHits` (`src/game/Weapons.js:500-575`) tests every target, players included (from `Combat.meleeTargets`), against a zombie capsule from `zp.y-0.6` to `zp.y+2.9`, radius 0.92. For players this misses the legs below group y -0.6; legs reach -1.95.
- Zombies cut limbs at random by height (`Zombie.takeDamage`, lines 372-393, with `limbMask` bits 1/2/4/8/16).
- `phit` is handled by `Combat.meleeHit`, which already blocks with a held shield and shatters a frozen player.
- Player model (`Character.js`), in the group frame:
  - Torso box: group y 0…1.5. Head box: 1.5…2.7.
  - Upper arm: in `armAnchor` along +Z, z 0…1.0, at (±0.7, 1.25, 0).
  - Forearm: in `elbowAnchor` along +Z, z 0…0.9. The hands are children of `elbowAnchor` at z=0.9.
  - Leg: a single box in `LegPivot`, y 0…-1.95, with shoes and wide trousers as look parts on the pivot. Bleeding cut marks are children of the leg mesh.
- `phit`'s `dmg` falls back to 1: `Math.min(8, Math.round(m.dmg) || 1)`, so a 0 becomes 1.
- Players have no armour item. The only "armour" is in the look (`Appearance.js`): `top 5` Латы (steel sleeves to the wrist), `hat 9` Шлем, `bottom 8` Поножи (leg texture rows 16-38 of 40, i.e. d 0.78…1.85), `shoes 6` Латные. Knights and king: `STATS.armor` 50/100, `v.armor`.
- Villagers (`VillagerModel.js`) use the same frame as players.
  - Arm: one mesh per shoulder pivot, hanging -Y from +0.2 down to -1.35, built as merged box lists cached by content.
  - Leg: `hip` thigh 0…-1.0, then `knee` shin 0…-0.95.
- `Swimming` writes `ch.speedScale`, so leg loss needs its own multiplier.

## 3. New modules and data

### 3.1 `src/entities/LimbCut.js`: constants, state, model surgery (pure three.js, runs in node)

```js
export const LIMBS = ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']; // net code = index
export const ARM_UPPER = 1.0, ARM_LOWER = 0.9, ARM_LEN = 1.9, HAND_LEN = 0.3, LEG_LEN = 1.95, KNEE = 0.95;
export const MOVE = { oneLeg: 0.4, noLegs: 0.2 };
export const CAP_MAX_TILT = 0.61; // rad (35°): the cap follows the cut plane, at most this far from square

export function emptyLimbs() { return { head: false, leftArm: null, rightArm: null, leftLeg: null, rightLeg: null }; }
/** remaining length after a cut; a cut beyond the stump is air → false */
export function applyCutState(st, limb, d) {
  if (limb === 'head') { if (st.head) return false; st.head = true; return true; }
  d = Math.max(0, Math.min(limb.endsWith('Arm') ? ARM_LEN : LEG_LEN, d));
  if (st[limb] != null && st[limb] <= d + 0.02) return false;
  st[limb] = d; return true;
}
export function anyLost(st) { return !!st && (st.head || LIMBS.slice(1).some((k) => st[k] != null)); }
export function limbMotion(st) {
  const l = st?.leftLeg != null, r = st?.rightLeg != null;
  if (!l && !r) return { speed: 1, run: true, drop: 0 };
  if (l && r) return { speed: MOVE.noLegs, run: false, drop: LEG_LEN - Math.max(st.leftLeg, st.rightLeg) };
  return { speed: MOVE.oneLeg, run: false, drop: 0 };
}
export function partOf(limb, d) {               // which tissue (cut toughness, bleeding)
  if (limb === 'head') return 'neck';
  if (limb.endsWith('Arm')) return d < ARM_UPPER ? 'upperArm' : d < ARM_LEN ? 'forearm' : 'hand';
  return d < KNEE ? 'thigh' : 'shin';
}
```

**`cutBoxGeometry(geo, axis, j0, j1, keep, distal=false)`.** This was prototyped and verified. It clones a box lying along `axis` from the joint at `j0` to the far end at `j1`. It keeps either `[j0, j0+keep·(j1−j0)]` or, with `distal`, the far part. On the faces along the bone, the UV coordinate that runs along the bone is cut to the same span, so the jeans texture doesn't squash. In three r128 `BufferAttribute` has no `getComponent`, so use `.array`; BoxGeometry has 4 vertices per face.

```js
for (let f = 0; f < count; f += 4) {
  let comp = -1, c0 = 0, c1 = 0;
  if (Math.abs(N[f*3+k]) < 0.5)            // a face along the bone: find the uv component that runs with it
    for (const c of [0, 1]) { /* uv at t=0 and t=1 of this face → comp, c0, c1 */ }
  for (let i = f; i < f + 4; i++) {
    const t = (P0[i*3+k] - j0) / span, tk = distal ? keep + t*(1-keep) : t*keep;
    P[i*3+k] = j0 + span*tk;
    if (comp >= 0) U[i*2+comp] = c0 + (c1-c0)*tk;
  }
}
```

Verified on the leg cut at d=1.2: the kept part spans mesh y −0.225…0.975, the side-face v spans 0.385…1, and the severed piece spans −0.975…−0.225.

**`stumpCap(w, depth, axisLocal, nLocal)`.** A `Group` named `'stump'`, built from a shared unit box with module-level materials, so no new shader programs are compiled:
- flesh: `FLESH = MeshLambertMaterial(0x8a0b14)`, scaled (w, 0.04, depth);
- bone: `BONE = MeshLambertMaterial(0xefe6d2)`, scaled (0.3w, 0.05, 0.3depth).

The quaternion takes +Y to `clampTilt(nLocal, axisLocal, CAP_MAX_TILT)`.

**`cutCharacterLimb(ch, limb, d, nLocal, {piece=true})` returns `{changed, piece}`.**
1. `ch.limbs ||= emptyLimbs()`. If `applyCutState` is false, return `{changed:false}`.
2. Save the originals in `ch._limbSaved = {geo: Map<mesh, BufferGeometry>, hidden: Set<Object3D>, caps: []}`.
3. Build the piece before hiding anything (see below). The piece's world transform is the parent anchor's `matrixWorld`. Set `userData.cutEnd` (the local point of the cut) and `userData.own` (the geometries we created; everything else is shared and never disposed).
4. Per limb, given a cut normal `n`:

| Cut | Kept on the body | Piece |
|---|---|---|
| Arm, d<1.0 | Upper-arm mesh (`armAnchor.children.find(isMesh)`, mesh space z −0.5…0.5): `cutBoxGeometry(...,'z',-0.5,0.5,d)`. Hide `elbowAnchor` and both hand groups (`leftSimplifiedHand.group.visible=false` and the detailed one: other code reads `hand.group.visible`). Cap 0.4×0.4 at `armAnchor (0,0,d)`. `ch._stumps.left` = an `Object3D` at `armAnchor (0,0,d)`. | Distal upper-arm box, plus `elbowAnchor.clone(true)` (forearm and hand in their current finger pose) at the elbow transform. |
| Arm, 1.0≤d<1.9 | Forearm mesh in `elbowAnchor`, z −0.45…0.45: keep `(d−1)/0.9`. Hide the hands. Cap 0.35² at `elbow (0,0,d−1)`. Stump marker there. | Distal forearm plus `SimplifiedHand.group.clone(true)`. |
| Arm, d≥1.9 (blade through the hand) | Hide the hands. Cap at the wrist, `elbow (0,0,0.9)`. | The hand clone. |
| Leg | Leg mesh, mesh space y 0.975…−0.975: keep `d/1.95` with the UV remap. Other meshes on the pivot (shoes, wide trousers): if entirely below −d, hide; if crossing, `cutBoxGeometry` with their own ends. Hide children of the leg mesh (cut marks) with local y < 0.975−d. Cap 0.5² at `pivot (0,−d,0)`. | Distal leg box plus the clipped or whole look parts below the cut. |
| Head | `ch.head.visible=false` (hair, hat and face go with it). Cap 1.0×0.8 at `torso (0,0.75,0)`. If `ch._fpv`, the cap goes to layer 1 like the body. | `ch.head.clone(true)`. |

**`restoreCharacterLimbs(ch)`.** Put the saved geometries back and dispose the cut ones. Unhide the saved objects. Remove and dispose the caps and stump markers. Set `ch.limbs = emptyLimbs()`. Then call `ch.setShowHands(ch.handsVisible)`.

**`applyLimbState(ch, st)`** brings a model to a given state for latecomers and saves: restore if needed, then cut each lost limb with `{piece:false}`.

### 3.2 `src/game/Dismember.js`: geometry, armour, network packing, props, the system

Pure part, verified in `proto.mjs`:

```js
import * as THREE from 'three';
import { segmentSegmentDistSq } from '../core/math.js';
import { LIMBS, ARM_UPPER, ARM_LEN, HAND_LEN, LEG_LEN, KNEE, emptyLimbs, applyCutState, partOf, limbMotion } from '../entities/LimbCut.js';

export const TOUGH = { hand: 0.7, forearm: 0.85, upperArm: 1.0, shin: 1.05, thigh: 1.25, neck: 1.1 };
export const EDGE_LEAD = 0.55, MAX_TIP_SPEED = 60, MOMENTUM = 0.5;
export const BLEED = { hand: 0.5, arm: 1, leg: 1.5 };
export const FALL_TIME = 2.2, PROP_LIFE = 120, MAX_PROPS = 24, SEVER_COOLDOWN = 0.3, MAX_REACH = 9;
export const TORSO_HALF = [0.55, 0.72, 0.36];                      // torso frame (body box 1.2×1.5×0.8, a little inside)
export const HEAD_BOX = { c: [0, 0.15, 0], half: [0.6, 0.45, 0.6] }; // player head frame: the skull ABOVE the neck band (group 1.8…2.7)
export const NECK = [[0, 0.70, 0], [0, 1.05, 0]];                    // torso frame → group y 1.45…1.80
export const V_ARM = { len: 1.35, upper: 0.55, wrist: 0.95 };        // villager arm (one mesh), hip→knee 1.0, knee→foot 0.95
export const V_HEAD_BOX = { c: [0, 0.75, 0], half: [0.6, 0.45, 0.6] };

/** Möller–Trumbore, segment p→q vs triangle a,b,c → {t, beta, gamma} | null */
export function segTri(p, q, a, b, c) { /* as prototyped */ }

/**
 * The edge swept between frames (e0a→e0b last frame, e1a→e1b now) vs bone lines.
 * caps: [{limb, a:[3], b:[3], d0, len}] world. Sub-steps: ceil(maxMove/0.25) in 1…8.
 * Each step's quad is split into T1=(A0,B0,B1) → time γ, along-edge β+γ, and T2=(A0,B1,A1) → time β+γ, along-edge β.
 * @returns {limb, part, d, s, u, point, n, motion}|null   the EARLIEST crossing (s = time 0…1 in the frame)
 *   n = norm(cross(edge at s, motion of the edge point u))   motion = p1(u) − p0(u)
 */
export function sweepCut(e0a, e0b, e1a, e1b, caps) { /* as prototyped; d = d0 + t·len; part = partOf(limb, d) */ }

/** segment vs box (box given by its inverse world matrix elements, centre, half extents) — slab test */
export function segHitsBox(p, q, invE, c, half) { /* transform p,q; Liang–Barsky on 3 slabs */ }
/** first time in [0,s] (9 samples + s) the edge is inside a blocker → t, or −1 */
export function firstBlock(e0a, e0b, e1a, e1b, s, blockers) { /* … */ }

/** Is it a cut?  w = {cutSpeed, edgeSides, bonus}; edgeN = the edge's facing (world unit) */
export function judgeCut(hit, blockedAt, dt, w, edgeN, prevTipSpeed) {
  if (!hit) return null;
  if (blockedAt >= 0 && blockedAt <= hit.s) return { kind: 'blocked', point: hit.point };
  const speed = Math.hypot(...hit.motion) / dt;
  const need = w.cutSpeed * TOUGH[hit.part] / (1 + (w.bonus || 0) / 100);   // magic blades are sharper
  const lead = dot(norm(hit.motion), edgeN);
  const edgeOk = w.edgeSides === 2 ? Math.abs(lead) >= EDGE_LEAD : lead >= EDGE_LEAD;
  const swing = speed <= MAX_TIP_SPEED && prevTipSpeed >= MOMENTUM * need;
  return { ...hit, speed, kind: speed >= need && edgeOk && swing ? 'cut' : 'touch' };
}
```

Capsule and blocker providers. A limb that is already cut is truncated to its stump, so you can't cut air.

```js
export function characterCapsules(ch, st = ch.limbs || emptyLimbs()) {
  // per side: upper arm armAnchor(0,0,0)→(0,0,min(1,da)) d0 0 ; forearm elbowAnchor(0,0,0)→(0,0,da−1) d0 1.0
  //   (da = st.arm ?? ARM_LEN+HAND_LEN: the hand is in the forearm line; d>1.9 → clamped to 1.9, the hand)
  // leg: pivot(0,0,0)→(0,−dl,0) (dl = st.leg ?? 1.95) ; neck: torso NECK[0]→NECK[1] unless st.head
}
export function characterBlockers(ch, st) { /* torso box (torso frame, TORSO_HALF) + head box (head frame, HEAD_BOX) unless st.head */ }
export function villagerCapsules(m, st) { /* arm pivot(0,0,0)→(0,−1.35,0) (d>0.95 → 0.95); hip→(0,−1,0) d0 0; knee→(0,−0.95,0) d0 1.0; neck in m.torso */ }
export function villagerBlockers(m, st) { /* m.torso TORSO_HALF; m.head V_HEAD_BOX */ }
```

Villager `partOf`: arm d<0.55 is upper arm, below 0.95 forearm, otherwise hand.

Armour:

```js
export const ARMOUR_FROM_LOOK = true;   // see open question 1
export function armourCovers(look, limb, d) {
  if (!ARMOUR_FROM_LOOK || !look) return false;
  if (limb === 'head') return look.top === 5 || look.hat === 9;        // the plate's gorget / the helmet's aventail
  if (limb.endsWith('Arm')) return look.top === 5 && d < ARM_LEN;      // steel sleeves to the wrist; the bare hand is not covered
  return (look.bottom === 8 && d >= 0.78 && d <= 1.85) || (look.shoes === 6 && d >= LEG_LEN - 0.25); // greaves, plate boots
}
export function villagerArmoured(v) { return (v.role === 'knight' || v.role === 'king') && v.armor > 0; }
```

Network packing:

```js
// sv (attacker → victim inside phit): [code, d, nx, ny, nz, vx, vy, vz, lf]   n in the VICTIM's group frame
export function packSever(sv) { /* round d,n to 0.01, v to 0.1 */ }
export function parseSever(a) {     // null when bad
  // Array, length 9, code integer 0…4, every number finite; d clamped to [0, 1.9|1.95]; |v| clamped to 80;
  // n normalised (fallback [0,1,0]); lf integer
}
export function limbsToNet(st) { return [st.head ? 0 : -1, ...LIMBS.slice(1).map((k) => st[k] == null ? -1 : Math.round(st[k]*100)/100)]; }
export function limbsFromNet(a) { /* validate length 5, numbers; −1 → null */ }
```

**`class SeveredPart`.** A light rigid prop with the same ideas as `Weapon.step`:
- Integration: gravity −14 (2 sub-steps), drag, quaternion integration of `spin`.
- Contacts: against `collision.surfaceY(x,z)` using the 8 corners of the piece's local bounding box. Push up by the penetration. If `v.y < −2`, bounce ×−0.25, otherwise zero it. XZ friction `1−4dt`, spin damping `1−5dt`.
- Sleep after 0.4 s calm. Then over 0.3 s it slerps to lie flat, with the longest local axis horizontal.
- `fx.blood(world cutEnd, 25)` at spawn (40 for a head). Drips from `cutEnd` with probability `dt·6` for 6 s.
- `life = PROP_LIFE`, then it sinks 4 s and is disposed. Dispose only `userData.own`.
- Layer 0, `castShadow`.

**`class Dismemberment`** (the game system; `game.dismember`):

```js
constructor(game) { this.game = game; this.props = []; this.life = 0; this._fallT = 0; }
get mine() { return this.game.character.limbs || (this.game.character.limbs = emptyLimbs()); }
// ---- attacker side (called from Weapons.checkHits)
tryCut(t, w, e0a, e0b, e1a, e1b, dt, prevTip) {
  const body = t.isPlayer ? t.r?.character : t.isVillager ? t.model : null;
  if (!body) return null;
  const st = t.isPlayer ? (body.limbs || emptyLimbs()) : (t.model.limbs || emptyLimbs());
  const A0 = arr(e0a), B0 = arr(e0b), A1 = arr(e1a), B1 = arr(e1b);
  const hit = sweepCut(A0, B0, A1, B1, t.isPlayer ? characterCapsules(body, st) : villagerCapsules(body, st));
  if (!hit) return null;
  const blk = firstBlock(A0, B0, A1, B1, hit.s, t.isPlayer ? characterBlockers(body, st) : villagerBlockers(body, st));
  const res = judgeCut(hit, blk, dt, { cutSpeed: w.spec.cutSpeed, edgeSides: w.spec.edgeSides, bonus: w.bonus }, arr(w.getEdgeNormal(_n)), prevTip);
  if (res.kind !== 'cut') return res;
  if (t.isPlayer ? armourCovers(body.look, hit.limb, hit.d) : villagerArmoured(t)) return { kind: 'armour', point: hit.point };
  const n = dirToLocal(hit.n, t.group);                                  // inverse group world quaternion
  this.game.fx.blood(vec(hit.point), 12);                                // instant local feedback (confirmed visuals come with 'limb')
  return { kind: 'cut', point: hit.point, sever: { limb: hit.limb, d: hit.d, n, v: hit.motion.map((x) => x / dt), lf: t.life ?? 0 } };
}
// ---- victim side (local player): Combat.meleeHit → here, after shield / frozen checks
receiveCut(by, sv) {
  const g = this.game;
  if (!g.combat.enabled || g.combat.dead || g.isDeadLocal || g.config.mode === 'creative') return false;
  if (sv.lf !== this.life) return false;                                       // aimed at my previous life
  const att = g.remotes.get(by);
  if (!att || att.position.distanceTo(g.character.group.position) > MAX_REACH) return false;
  if (g.sync && ![...g.sync.weaponOwners.values()].includes(by)) return false;  // no blade in their hand
  if (armourCovers(g.character.look, sv.limb, sv.d)) { g.hud.setVoice('Латы выдержали удар', true); return false; }
  return this._cutMine(sv, by, true);
}
_cutMine(sv, by, fresh) {
  const g = this.game, ch = g.character;
  const { changed, piece } = cutCharacterLimb(ch, sv.limb, sv.d, sv.n, { piece: fresh });
  if (!changed) return false;
  if (piece) this._spawnPiece(piece, sv, ch);
  g.sync?.limb?.(sv, fresh, by);
  if (sv.limb === 'head') { g.combat.die(by, 'decap'); return true; }
  if (sv.limb.endsWith('Arm')) this._loseHand(sv.limb === 'leftArm' ? 'left' : 'right', sv.d);
  else this._loseLeg(by);
  const part = partOf(sv.limb, sv.d);
  g.bleeding.start(part === 'hand' ? BLEED.hand : sv.limb.endsWith('Arm') ? BLEED.arm : BLEED.leg, cutText(sv));
  return true;
}
_loseHand(side) {
  const g = this.game, ch = g.character;
  g.weapons.release(side);                                    // falls with the hand's speed; NetSync 'rel' as for an opened hand
  if (g.items?.held[side]) g.items.dropHand(side);            // NEW Items helper = _throw(side, handVelocity) without the voice line
  if (g.combat.shield?.type === 1 && g.combat.shield.side === side) g.combat.shield = null;
  if (g.levitation?.active && g.levitation.state?.side === side) g.levitation.release(false);
  if (g.water?.active && g.water.state?.side === side) g.water.drop();
  g.duel?.cancelSide?.(side);                                 // NEW tiny Duel method → existing end path of my charge/beam from that hand
  if (g.lastMagicHand === side) g.lastMagicHand = side === 'left' ? 'right' : 'left';
  if (g.magicHand === side) g.magicHand = null;
  ch.setShowHands(ch.handsVisible);
}
_loseLeg(by) {
  const g = this.game, ch = g.character, m = limbMotion(this.mine);
  ch.limbSpeed = m.speed; ch.canRun = m.run; ch.legDrop = m.drop;
  if (!g.flight?.busy && !ch.swimming && !g.animals?.riding) { ch.knockedDown = true; g.combat.stun(FALL_TIME, by, 'fall'); }
}
resetLocal() {                         // Game.respawn()
  const ch = this.game.character;
  restoreCharacterLimbs(ch); this.life++;
  ch.limbSpeed = 1; ch.canRun = true; ch.legDrop = 0;
}
restoreMine(st) { /* saves: applyLimbState + the same flags, no fall, no messages */ }
// ---- everyone
onLimb(m) {                            // NetSync 'limb'
  const r = this.game.remotes.get(m.by), sv = parseLimbMsg(m);
  if (!r || !sv) return;
  const { changed, piece } = cutCharacterLimb(r.character, sv.limb, sv.d, sv.n, { piece: !!m.k });
  if (!changed) return;
  if (piece) this._spawnPiece(piece, sv, r.character);
  r.character.setShowHands(true);
  if (m.att === this.game.localId) this.game.hud.setVoice(`Вы отрубили ${LIMB_RU[sv.limb]} — ${r.name}`, true);
}
applyRemoteState(r, lb) {              // from 'p' (state only, never a piece); lb absent → whole again
  const key = lb ? lb.join(',') : '';
  if (key === r._lbKey) return; r._lbKey = key;
  applyLimbState(r.character, lb ? limbsFromNet(lb) : emptyLimbs()); r.character.setShowHands(true);
}
restoreRemote(id) { const r = this.game.remotes.get(id); if (r) { restoreCharacterLimbs(r.character); r._lbKey = ''; r.character.setShowHands(true); } }
// ---- villagers (host); see §8
cutVillager(v, sv, by) { /* … */ }
onVillagerLimb(m) { /* guests: model.cutLimb(..., {piece:true}) + _spawnPiece */ }
// ---- frame
update(dt) {
  for (let i = this.props.length - 1; i >= 0; i--) if (!this.props[i].step(dt, this.game.collision)) this.props.splice(i, 1);
  // blood from stumps while bleeding (mine: bleeding.rate>0; theirs: bleeding.remote.get(id)>0)
  //   → fx.spark-drip at each stump marker's world position, prob dt·6
}
_spawnPiece(piece, sv, ch) {
  const vel = new THREE.Vector3().fromArray(sv.v).multiplyScalar(0.35).clampLength(0, 7);
  vel.y += 2.5;
  if (this.props.length >= MAX_PROPS) this.props.shift().dispose();
  this.props.push(new SeveredPart(this.game, piece, { vel, spin: rnd3(6) }));
}
```

Russian HUD texts, plain words; prefix with the usual icon, as other HUD lines do:
- `LIMB_RU = {leftArm:'левую руку', rightArm:'правую руку', leftLeg:'левую ногу', rightLeg:'правую ногу', head:'голову'}`; a hand-only cut says `'кисть'`.
- Arm: `Вам отрубили левую руку! Кровь идёт — прижмите другую руку (или культю) к ране и скажите «Rescue»`.
- Leg: `Вам отрубили ногу — вы упали. Теперь можно только прыгать на одной ноге`; with both legs gone, `можно только ползти`.
- `Combat.die('decap')`: `${name} отрубил вам голову` / `Вам отрубили голову`.
- Knight armour: `Доспех рыцаря выдержал — сначала собейте его`.
- Casting with no hands: `Без рук колдовать нельзя`.

## 4. Weapons (`WeaponModels.js`, `Weapon.js`)

`WEAPON_SPECS`:
- `sword` gets `edge: [[0,0.32,0],[0,1.3,0]], edgeSides: 2, cutSpeed: 6.5`.
- `axe` gets `edge: [[0.34,0.60,0],[0.34,0.88,0]], edgeSides: 1, cutSpeed: 9.5`. This is the bit of the edge curve in `buildWeapon`: x 0.33…0.385, y 0.60…0.88.

`Weapon`:
- `getEdgeSegment(a,b)` = `modelToWorld` of the two `edge` points.
- `getEdgeNormal(out)` = (1,0,0) rotated by the quaternion. In the grab code, model +X is the edge facing the knuckles (`Weapons.grab`, "edge = e*Y").

## 5. Attacker side: `Weapons.checkHits` patch

For each `hs`, the left and right hand slots and the Leviosa slot:
- Read `const [ea, eb] = w.getEdgeSegment(_ea, _eb)`.
- Keep `hs.edgeA/edgeB/edgeHas` (set at the end of every frame, as `basePrev`/`tipPrev` are now).
- Keep `hs.tipSpeedPrev`.

Inside the target loop, before the coarse capsule:

```js
if ((z.isPlayer || z.isVillager) && hs.edgeHas && this.game.dismember) {
  const c = this.game.dismember.tryCut(z, w, hs.edgeA, hs.edgeB, ea, eb, dt, hs.tipSpeedPrev || 0);
  if (c && now(this) - (w.lastHitTime || 0) >= 120) {
    w.lastHitTime = now(this);
    const h = this._localHit(z, c.point, speed);          // NEW: {y, side, speed, lx, lz} from a world point (same maths as lines 546-549)
    if (c.kind === 'cut') { w.velocity.multiplyScalar(0.7); this.onHit?.(z, damage, dir, true, w, { ...h, sever: c.sever }); continue; }
    if (c.kind === 'armour') { this._clang(c.point, speed); w.velocity.multiplyScalar(0.2); w.angularVelocity.multiplyScalar(0.3); this.onHit?.(z, Math.max(1, damage >> 1), dir, true, w, h); continue; }
    this.onHit?.(z, damage, dir, true, w, h); continue;    // 'touch' / 'blocked': an ordinary slash right there (legs are hittable now)
  }
}
```

Also in `_updateHand`: if `ch.handLost(side)`, then `if (hs.held) this.release(side); return;`, so the lost hand neither grabs nor holds. Self-cuts are impossible because your own character is never in the target list.

## 6. Victim-side integration

**`Character.js`** (`ch.limbs` is set by LimbCut):
- `handLost(side)` = `limbs?.[side+'Arm'] != null`; `legLost(side)`.
- `bodyDrop()` = `Math.max(isCrouching ? 1.0 : 0, legDrop || 0)`.
- `getHandWorldPosition` / `getGripObject`: if lost, use the stump marker. `getForearmDirection`: if cut above the elbow, use the upper arm's direction.
- `getGripCurl`: lost → 0. `isArmRaised` / `isArmExtended`: lost → false. `isHandRaised`: the lost side is not valid. `isTPose` / `areBothHandsUp`: any hand lost → false.
- `setShowHands(v)`: each side gets `v && !handLost(side)`.
- `update()`:
  - Speed: `speed = (walk + (run−walk)·(canRun===false ? 0 : ri)) · (speedScale??1) · (limbSpeed??1)`.
  - Leg animation: on one leg, the stump pivot is fixed at x −0.3 rad and the good leg swings 0.15·sin. On the local hero (`move=true`) there is a hop bob of 0.08·|sin| while moving.
  - `targetY = ground + 2 − max(crouchDrop, legDrop)`, and `feetNow` uses `bodyDrop()`.

**`Game.js`:**
- After `this.bleeding`: `this.dismember = new Dismemberment(this)`. In `update`, call `this.dismember.update(dt)` after `weapons.checkHits`.
- `respawn()`: `this.dismember.resetLocal()` next to `combat.revive()`.
- `_updatePlayer` and `_keepBodiesApart`: the feet use `ch.bodyDrop()` instead of the crouch term. Without this, `resolveCylinder` receives feet below the ground for a legless body.
- `castLocalSpell`: if both hands are lost, show `Без рук колдовать нельзя` and return null.
- `onLocalHit`: the villager branch passes `sever: hit?.sever`.

**Other call sites:**
- `Duel.pickSide`: skip `ch.handLost(side)`.
- `Combat.updatePunches`: skip lost hands.
- `Inventory` pocket loop (~line 343) and the `Items` pick-up and give loops (lines 282/307/319/532): skip lost sides.
- `Items.dropHand(side)`: new.
- `Combat.update`: when a `'quake'` or `'fall'` stun ends, set `knockedDown = false`. Status text for the fall stun: `Вы упали — встанете через N с`.

**`Combat.js`:**
- `meleeTargets()`: add `t.r = r`, `t.life = r.life || 0`, `t.severCooldown ??= 0`. In `update()`, tick `severCooldown` down.
- `hitRemote(target, dmg, magic, hit)`:

```js
const sv = hit?.sever && !(target.severCooldown > 0) ? hit.sever : null;
if (target.damageCooldown > 0 && !sv) return;
if (sv) target.severCooldown = SEVER_COOLDOWN;
const cooling = target.damageCooldown > 0;
if (!cooling) target.damageCooldown = 0.45;
this.game.sync?.playerHit(target.id, cooling ? 0 : dmg, magic, hit);   // sends sv; dmg 0 = the same swing already counted
```

- `meleeHit(dmg, byId, magic, cut, sv)`: shield (existing) → magic breaks Protection (existing) → frozen shatter (existing) → `if (sv && this.game.dismember?.receiveCut(byId, sv) && this.dead) return;` → `if (dmg > 0) this.damage(...)` → the light cut only when `!sv`.
- `die(by, 'decap')` text.

**`Bleeding.js`:**
- `start(rate = 1, text = null)`; the default text stays as it is now.
- `stop()`: if `anyLost(ch.limbs)`, append ` — отрубленное не вернётся, пока вы живы`.
- `rescue()` is unchanged. It works with a stump pressed to the body because `getHandWorldPosition` returns the stump.

**`WorldSave.js`:**
- Snapshot adds `limbs: limbsToNet(...)` and `bleed: bleeding.rate`.
- Apply: if `hp > 0 && limbs[0] !== 0`, call `dismember.restoreMine(limbsFromNet(...))`; if `bleed > 0`, call `bleeding.start(bleed)`.

**`Codex.js`:**
- Меч: `режет руки, ноги и голову там, где прошло лезвие (быстрый удар ребром)`.
- Топор: `рубит только лезвием, нужен сильнее замах`.
- Rescue: add that an arm or leg doesn't grow back.
- New entry «Отрубленные руки и ноги».

## 7. Network (add to the `NetSync.js` header list)

| Message | Direction | Fields | Handling |
|---|---|---|---|
| `phit` (extended) | attacker → all (relay), only `to` acts | `sv: packSever(...)` (optional) | `case 'phit'`: `dmg = m.dmg === 0 ? 0 : Math.min(8, Math.round(m.dmg) || 1)`; `sv = m.by === m.from || this.net.isHost ? parseSever(m.sv) : null`; `g.combat.meleeHit(dmg, m.by, !!m.mg, h, sv)` |
| `limb` (new) | victim → all (relay) | `{by, l:code, d, n:[3], v:[3], k:1 = fresh cut (piece and blood) / 0, att}` | `if (m.by !== this.me) g.dismember.onLimb(m)` |
| `p` (extended) | everyone | `lb: limbsToNet(...)` only when something is lost; `lf: dismember.life` | `RemoteAvatar.applyState`: `this.life = s.lf ?? this.life`; then `g.dismember.applyRemoteState(r, s.lb)` |
| `prespawn` | victim → all | (as now) | also `g.dismember.restoreRemote(m.by)` |
| `vhit` (extended) | guest → host | `sv` | host: attacker within 9 m of `v`, then `castleLife.hit(v, …, {magic, sever: parseSever(m.sv)})` |
| `vlimb` (new) | host → all | `{id, l, d, n, v}` | guests: `g.dismember.onVillagerLimb(m)` |
| `vil` (extended) | host → all | entry index 10 = `v.model.limbs ? limbsToNet(...) : 0` | `applyNet`: when changed, `applyVillagerLimbState(v, arr)` (no piece) |

Every cut is decided by the victim's computer, or the host for villagers, then sent as one ordered, reliable `limb`. The connection is a reliable host star (`Network.js`), so `limb` always arrives before the next `p` carrying `lb`. The attacker shows only local blood until the `limb` confirmation arrives. Bandwidth: `lb` is 5 numbers, only for players who have lost something.

## 8. Villagers and knights

**`VillagerModel`:**
- Keep the box lists: `this._boxes = {leftArm, rightArm, leftThigh, leftShin, rightThigh, rightShin}`.
- Export `cutBoxes(L, cutY, keepAbove)` for un-rotated boxes on the local y axis: keep, drop, or trim each box. A rotated box goes whole to the side where its centre lies.
- `partGeometry(L, cache=false)` for cut geometry, so the shared geometry cache isn't polluted; keep `this._own` and dispose it in `dispose()`.
- `cutLimb(limb, d, nLocal, {piece})` returns `{changed, piece}`:

| Limb | Model change | Piece |
|---|---|---|
| Arm | Pivot mesh `cutBoxes(L, −d, true)` | The complement plus a clone of the tool from `handSlot`, so the knight's sword goes with his arm; then `setHeldTool('none')`. For the left arm, the shield goes with it. |
| Leg, d<1.0 | Thigh trimmed, knee group hidden | |
| Leg, d≥1.0 | Shin trimmed at −(d−1) | |
| Head | Head group hidden | |

  Every cut adds a cap.
- Model `limbs` state; `legDrop` applied in `update` (pelvis lower).

**`CastleLife`:**
- `hit(v, dmg, dir, by, opts)`:
  - The cooldown no longer applies when `opts.sever`; damage is 0 while cooling.
  - `const armoured = villagerArmoured(v)` is read before armour is spent.
  - If `opts.sever && !armoured`, call `dismember.cutVillager(v, sv, by)` before the damage.
  - Head: `v.hp = 0`, which goes through the existing `_die`, so a dead king still hands over the castle.
  - The guest branch forwards `opts.sever` in `villagerHit`.
- `cutVillager`:
  - Set `v.bleed`, `v.cutBy`, and `v.legK = limbMotion(...).speed`.
  - A knight or king without his sword arm stops fighting: `v.foe = null`, `fleeT = 30`, `fleeFrom = by`.
  - Spawn the piece and send `vlimb`.
- `_think`: if `v.bleed > 0`, take `v.hp -= v.bleed·dt`; at ≤0 call `_die(v, v.cutBy)`.
- `_steer` and `_followPath`: `speed *= v.legK ?? 1`.
- `_strike`: return if the right arm is lost.
- Group position: subtract `v.model.legDrop`.
- `_deactivate`: a villager who is bleeding and alive counts as killed (`st.killed.add` + `_sendState`), since they bled out offscreen.
- `targets()` entries already have `isVillager`, `model`, `group`, `armor`, `role`.

## 9. Armour

Players: by default, protection follows the look, per the table in §3.2. A hand (d≥1.9) is never covered.

Knights and king: everything is covered until their armour points are beaten to 0. This builds on the existing armour points (50/100). The attacker gets a clang and sparks (`_clang`), and the blade is stopped (velocity ×0.2).

## 10. Edge cases (each one decided)

1. **Cut beyond an existing stump.** Air: `applyCutState` returns false, the capsule is truncated, and nothing is sent.
2. **Cut nearer the body than an existing stump.** The limb is shortened again, a middle piece is spawned, and bleeding takes the max rate.
3. **One cut per swing and target.** Bounded by the earliest crossing, `SEVER_COOLDOWN 0.3`, `lastHitTime 120 ms`, and the 0.45 damage cooldown, which no longer swallows a cut that comes a frame after the coarse hit.
4. **Frontal slash.** It enters the torso box before reaching a hanging arm, so it is blocked (verified: block at s=0.44 < 0.50). A side slash cuts the arm (verified: d=0.75).
5. **Neck band.** Group 1.45…1.80. The torso blocker ends at 1.47 and the skull blocker starts at 1.8. A slash at group 2.0 hits the skull: a normal hit, no decapitation.
6. **Parallel blade.** A blade along the limb, or moving along its own axis, finds no crossing (det≈0).
7. **Tracking jump or teleport.** Tip speed above 60 m/s, or no swing on the previous frame, means no cut.
8. **The flat of the blade, or the axe's back.** Fails the edge-lead check: a touch, no cut.
9. **Frozen victim.** Shatter wins, as now.
10. **Held shield facing the attacker.** Blocks the whole hit, as now.
11. **Creative or non-free-world modes.** No player targets, so nothing changes there.
12. **Stale cut after a respawn.** Rejected by `lf`.
13. **A latecomer.** Gets the stumps from `p.lb` with no piece and no blood.
14. **A player leaves.** Their props stay until they time out. `dispose()` restores before disposing so the saved geometry isn't leaked.
15. **Leg lost while flying, swimming or riding.** No fall; the speed factor applies after.
16. **A lost hand holding a book, scroll or bow.** `items.dropHand` drops it. BookReading and ScrollReading end by themselves when the item is gone; if they don't, call `books.reading._end(false)` / `scrolls._close()`. Bow: `gear._dropNock()`.
17. **A sword impaled in the victim.** Unaffected (`Bleeding.impaled`).
18. **A villager with a cut, while guests are far away.** The host bleeds them out; `vil` index 10 carries the state.
19. **Performance.** At most 5 capsules × 2 triangles × 8 sub-steps per target per frame, only within the existing range and speed gate. Props are capped at 24. Caps use shared materials, so no shader stalls.
20. **Spoofing.** `m.by === m.from` (the host stamps `from`), distance ≤ 9 m, and the attacker owns a held weapon (`weaponOwners`). This is the same trust model as `phit`.
21. **Out of scope.** Knights cutting players, self-cuts, animals, and arrows. Zombies keep their random system until Phase 6.

## 11. Phases

| Phase | Deliverable | Files |
|---|---|---|
| 0 | Pure geometry and data: `sweepCut`, `segHitsBox`, `firstBlock`, `judgeCut`, providers, armour, packing; weapon `edge`/`edgeSides`/`cutSpeed`, `getEdgeSegment`, `getEdgeNormal`, plus unit tests | `Dismember.js` (pure part), `LimbCut.js` (constants and state), `WeaponModels.js`, `Weapon.js` |
| 1 | Model surgery for the player and Character gating, plus unit tests | `LimbCut.js`, `Character.js` |
| 2 | Victim consequences, bleeding, fall, respawn, saves, plus unit tests (fake game) | `Dismember.js` (system), `Combat.js`, `Bleeding.js`, `Game.js`, `Items.js`, `Inventory.js`, `Duel.js`, `WorldSave.js` |
| 3 | Attacker detection, network, remote avatars, props; e2e E1 and E2 | `Weapons.js`, `NetSync.js`, `RemoteAvatar.js`, `Dismember.js` |
| 4 | Villagers and knights; unit tests and e2e E3 | `VillagerModel.js`, `CastleLife.js`, `NetSync.js` |
| 5 | Codex texts | `Codex.js` |
| 6 (optional) | Zombies use `sweepCut` on their parts instead of `rand() < chance` in `Zombie.takeDamage` (the binary `limbMask` stays); severed parts can be lifted with Leviosa/Accio or picked up | `Zombie.js`, `Weapons.js` |

## 12. Tests

### Unit tests: `tests/unit/dismember.test.js` (node; `VoxelCharacter`, `Weapon` and `VillagerModel` already run headless)

Setup: `ch = new VoxelCharacter(new THREE.Scene()); ch.setIdlePose(); ch.group.position.set(0,1.5,0); ch.group.updateMatrixWorld(true)`. Measured: left shoulder (−0.70, 2.75, 0), elbow (−0.73, 1.75, 0), leg (−0.30, 1.5→−0.45). Helper: `bladePose(bladeDir, edgeDir) = quaternion from makeBasis(edgeDir, bladeDir, edgeDir×bladeDir)`.

1. **'a horizontal edge passing the hanging arm cuts it exactly where it passed'**
   - `sweepCut([-3,y,-2],[-0.45,y,-2],[-3,y,2],[-0.45,y,2], characterCapsules(ch))`.
   - For y = 2.6, 2.25, 2.0, 1.2, 0.8 expect `limb==='leftArm'` and d ≈ 0.15, 0.50, 0.75, 1.55, 1.95 (±0.06). The 1.95 case must clamp to 1.9 with `part==='hand'` after `partOf`.
   - `|n[1]| > 0.99`.
   - Parts: y=2.0 is `'upperArm'`, y=1.2 is `'forearm'`.
2. **'an edge that stops short of the bone line, runs along a limb or passes between shoulder and neck cuts nothing'**
   - Edge ending at x=−0.85: null.
   - y=2.9: null.
   - Blade along the leg, moving along its own axis: null.
3. **'the body stops the blade: a frontal full-width slash is blocked, a side slash takes the arm'**
   - Frontal (x ±3, z −2→2, y=2.0): `firstBlock(...) < hit.s`, and `judgeCut` gives `'blocked'`.
   - Side slash (blade along Z from x=−3 to 1, y=2.0): `leftArm`, d 0.75±0.05, `firstBlock === -1`.
4. **'decapitation band: group 1.55 crosses the neck; 1.45 is the shoulders; 2.0 is the skull'**
   - Side slashes at world y 3.05: `limb==='head'`, not blocked.
   - y 2.94: blocked (torso).
   - y 3.5: blocked (head box).
5. **'only a real edge-on swing cuts; the axe needs more'** (`judgeCut` with dt=1/60, edge facing +Z, upper arm)
   - Sword: Δz 0.10 (6 m/s) is a touch; Δz 0.20 (12 m/s) is a cut.
   - Edge facing +Y (the flat leads): touch.
   - `prevTipSpeed` 2 (no swing before): touch.
   - 70 m/s: touch.
   - Axe (`cutSpeed` 9.5, one side): 9 m/s touch, 12 m/s cut, edge facing −Z touch.
   - Thigh needs 6.5×1.25 = 8.125: 8 m/s is a touch.
   - Magic `bonus` 50: need 4.33, so 5 m/s cuts.
6. **'armour'**
   - Covered: `armourCovers({top:5},'leftArm',0.5)`, `({top:5},'head',0)`, `({hat:9},'head',0)`, `({bottom:8},'leftLeg',1.2)`, `({shoes:6},'rightLeg',1.85)`.
   - Not covered: `({top:5},'leftArm',1.9)` (the bare hand), `({bottom:8},'leftLeg',0.5)`, `defaultLook()` for every limb.
   - `villagerArmoured({role:'knight',armor:1})` is true; armor 0 and `role:'farmer'` are false.
7. **'state: a second cut counts only nearer the body; the head is final; network round-trip'**
   - On an empty state: leftArm 1.4 → true; 1.7 → false; 0.5 → true with value 0.5.
   - `limbsToNet` gives `[-1,0.5,-1,-1,-1]`, and `limbsFromNet` returns the same state.
   - `parseSever` returns null for a non-array, code 9, or NaN d. It clamps d=5 on an arm to 1.9 and replaces n=[0,0,0] with [0,1,0].
8. **'movement'**
   - `limbMotion` with no loss: `{1,true,0}`.
   - One leg: `{0.4,false,0}`.
   - Both legs at 0.6 and 1.2: `{0.2,false,0.75}`.
9. **'model: arm at 0.6'**
   - After `cutCharacterLimb(ch,'leftArm',0.6,[0,1,0])`:
     - the upper mesh's bounding box plus its position spans anchor z 0…0.6 (±0.01);
     - `leftElbowAnchor.visible === false`, `leftSimplifiedHand.group.visible === false`;
     - a `'stump'` child of `leftArmAnchor` sits at z≈0.6;
     - `ch.handLost('left')`;
     - `getHandWorldPosition('left')` is within 0.01 of `leftArmAnchor.localToWorld(0,0,0.6)`;
     - `setShowHands(true)` leaves the left hand hidden and shows the right;
     - the piece contains a clone named `'palm'`.
   - After `restoreCharacterLimbs`:
     - the box length is 1.0 again;
     - the elbow is visible;
     - there are no `'stump'` children;
     - `handLost` is false.
10. **'model: forearm 1.5, leg 1.2 with the look, head'**
    - Forearm: z 0…0.5, elbow visible, hands hidden.
    - Leg, after `setLook({...defaultLook(), bottom:9, shoes:1})` (use a stubbed `document`, or skip the look and test only the base leg plus a manually added shoe box):
      - the leg spans y −1.2…0;
      - the side-face v spans 0.385…1;
      - the shoe box (y −1.95…−1.25) is hidden;
      - wide trousers (−0.05…−1.45) become −0.05…−1.2.
    - Head: `ch.head.visible===false`, and a cap on the torso.
11. **'gestures'** (arms raised by setting anchor quaternions to point up)
    - After a left cut: `isArmRaised('left')===false`, `isHandRaised().side==='right'`, `getGripCurl('left')===0`, `isTPose()===false`.
12. **'WeaponSystem: a fast edge-on swing through a player\'s hanging arm sends a cut'**
    - `makeGame()` as in `weapons.test.js`, plus `game.dismember = new Dismemberment(game)` and `game.fx = {blood(){}, spark(){}}`.
    - Victim `chB` at (0,1.5,0); target `{isPlayer:true,id:'B',group:chB.group,r:{character:chB,life:3},damageCooldown:0,isDead:false}`.
    - Sword: `quaternion = bladePose(+X,+Z)`; `position.x = −3+0.156` (the blade base is 0.156 m behind the centre of mass along the blade); y=2.0.
    - Three frames, z −0.4, −0.2, 0.0, dt 1/60.
    - `onHit` receives `hit.sever` with `limb:'leftArm'`, `d≈0.75±0.06`, `lf:3`.
    - The same with steps of 0.05 m gives a hit with no `sever`.
    - `chB.setLook`-free armour: set `chB.look={top:5}`. The result is a clang (`clangCount` +1) and no sever.
    - Hand lost: if `ch.limbs.rightArm=1.0`, then after `weapons.update(1/60)` a held sword is released (`w.holder===null`).
13. **'victim: decapitation kills at full HP; shield, plate, frozen, creative and a stale life stop it'**
    - Use `combat.test.js`'s `fakeGame` plus `character` as a real `VoxelCharacter`, `remotes` with `'enemy'` within 3 m, `sync.weaponOwners` containing `'enemy'`, `dismember`, and `bleeding` as a stub.
    - `meleeHit(2,'enemy',false,null,{limb:'head',d:0,n:[0,1,0],v:[5,0,0],lf:0})`: `deaths[0].text` matches `/голову/` and `hp===20` before death.
    - Each of these leaves no limb change: `gear.shieldFaces=()=>true` (and `shieldTook` is called), `look.top=5`, `frozenLeft>0` (death text `/разбил/`), `config.mode='creative'`, `lf:1`, the attacker 20 m away.
14. **'victim: losing an arm bleeds, drops what it held, ends that hand\'s magic; Rescue stops the blood but the arm stays; respawn makes it whole'**
    - Cut `leftArm` at 0.6:
      - `weapons.release` called with `'left'`;
      - `items.dropHand('left')` called;
      - `bleeding.start` called with rate 1;
      - `sync.limb` called with code 1 and `fresh===true`;
      - `lastMagicHand` becomes `'right'`.
    - Leg cut: `ch.knockedDown===true`, `combat.stunLeft≈2.2`, `ch.limbSpeed===0.4`.
    - `bleeding.stop()` leaves `ch.limbs.leftArm===0.6`.
    - `resetLocal()`: everything is restored and `life` goes from 0 to 1.
15. **'villager model'**
    - `cutBoxes([0.4,1.15,0.4, 0,-0.375,0, c,0,0,0], -0.6, true)` gives a box with h=0.8 at y −0.2; the distal version gives h=0.35 at y −0.775.
    - `m = new VillagerModel(villagerLook(3,'knight')); m.setHeldTool('sword'); r = m.cutLimb('rightArm',0.8)`:
      - the arm mesh's `boundingBox.min.y ≈ −0.8`;
      - `m.toolKind==='none'`;
      - the piece contains the tool mesh.
    - A second knight's arm geometry is unchanged (`!==` the cut one, and its min.y is −1.36).

All existing tests must stay green: the weapon tests, `combat.test.js`, and e2e `game.test` "sword … zombie" and multiplayer "a sword slash on the friend: a light cut".

### E2E: `tests/e2e/dismember.test.mjs`

Use the PeerServer setup from `multiplayer.test.mjs` on its own ports (`ZNS_TEST_PORT`+3, peer 9013). Use `openPlayer`, `feed` from `poses.mjs`, and `wf`/`ev`.

**E1 'free world: a sword swung across a friend\'s arm takes it off where it passed; both screens show the stump and the arm on the ground; the friend bleeds, cannot grab or cast with it; Rescue stops the blood, the arm stays'**
1. A creates a free-world server; B joins through the server list (as in the existing test).
2. B: background loop `feed(B, {arms:'hang', leftCurl:0, rightCurl:0}, 2, 50)` until the end.
3. A gets a sword through a real grab: `g.weapons.spawn('sword', p, q, 'tS')`, the palm-placement hook from `game.test.mjs:112-136`, then `feed` open→close `rightCurl 0→0.95`. Wait until `hands.right.held.id==='tS'`.
4. A's scripted swing (only the blade's path is scripted; detection, network and model are real):
   - Wrap `g.weapons._driveHeld` so that for 8 frames the held sword is posed `bladePose(+X,+Z)`.
   - Edge spans x from `E.x−2.6` to `E.x+0.1`, where E is B's left elbow as drawn on A's screen (`remote.character.leftElbowAnchor.getWorldPosition`).
   - Height `y = E.y + 0.45` (upper arm).
   - z from `E.z−1.2` to `E.z+1.2` in steps of 0.3 per frame.
   - Write `w.position`, `w.quaternion` and `w.drive` every frame.
5. Expected:
   - `wf(B, () => g.character.limbs?.leftArm != null)`, 15 s; `0.2 < d < 0.8`.
   - B: `leftElbowAnchor.visible===false`, `bleeding.rate===1`.
   - A: the remote's `character.leftElbowAnchor.visible===false`, `g.bleeding.remote.get(Bid)===1`, HUD voice matches `/Вы отрубили левую руку/`.
   - Both: `g.dismember.props.length===1`; within 6 s the prop is `sleeping` and `position.y < collision.surfaceY(x,z)+1`.
   - B's HP drops by at least 2 within 3 s.
6. B tries to grab with the left hand: spawn a sword at the left palm via the same hook; `feed` left open→close. `hands.left.held===null`. Positive control: the right hand does grab.
7. B: `feed({raise:60})` 25 frames: `g.magicHand==='right'` and never `'left'`; `character.isArmRaised('left')===false`.
8. B: `feed({arms:'hang', pocket:'right'})` 10 frames; `g.castLocalSpell('Rescue')==='Rescue'`; `bleeding.rate===0`; `limbs.leftArm` unchanged. On A: `bleeding.remote.get(B)===0`.
9. `realErrors` is empty on both.

**E2 'a leg: the friend falls, then hops slowly; decapitation kills at full health; «Возродиться» makes the body whole on every screen; a latecomer sees a stump it never saw cut'**
1. Fresh A and B.
2. Running control on B: `feed(B, (i)=>({arms:'hang', bob: i%2?0.03:-0.03}), 60, 33)`; record the XZ displacement D0. Expect D0 > 4 m.
3. A: `g.combat.hitRemote(t, 2, false, {lx:0.3,y:-1,lz:0, sever:{limb:'rightLeg', d:1.0, n:[0,1,0], v:[6,0,0], lf:t.life}})`.
4. B:
   - `limbs.rightLeg===1.0`;
   - `character.knockedDown===true` within 0.5 s and false after 3 s;
   - same running poses for 60 frames, displacement D1 < 0.4·D0;
   - the right leg mesh spans y −1.0…0;
   - `character.limbSpeed===0.4`.
5. C joins late:
   - C's avatar of B has the right leg mesh bounding-box height 1.0±0.02;
   - `g.dismember.props.length===0` on C;
   - A's view is unchanged.
6. A: the same call with `limb:'head', d:0`. B: `#death-screen` visible and `#death-text` matches `/голов/` (B had HP ≥ 18). A and C: one head prop each; the B avatar is hidden (`pdead`).
7. B clicks `#death-respawn-btn`:
   - B: all limbs null, `life===1`, the leg is 1.95 long, `head.visible`;
   - A and C (`wf`): B's avatar has a 1.95 leg and a visible head.
8. A sends a stale `sv` with the old `lf` (0): B is unchanged.
9. `realErrors` is empty on all three.

**E3 (`castles.test.mjs` style, single-player creative) 'a knight is not cut until his armour is beaten; then the sword takes his arm and his sword; a farmer\'s leg is cut where the blade passed, he falls and bleeds to death; decapitating the king takes the castle'**
1. Find the nearest guard knight as the castles test does (line 75).
2. `g.castleLife.hit(k, 3, dir, g.localId, {sever:{limb:'rightArm', d:0.7, n:[0,1,0], v:[5,0,0]}})`: `k.model.limbs?.rightArm==null` and `k.armor===47`.
3. `k.armor=0`; same hit:
   - `k.model.limbs.rightArm===0.7`;
   - `k.model.toolKind==='none'`;
   - `g.dismember.props.length===1`, and the piece contains the tool;
   - after 2 s `k.foe===null` and `fleeT>0`.
4. Farmer: the scripted sweep from E1, driven at their left thigh (target from `castleLife.targets()`):
   - `v.model.limbs.leftLeg` lies in [0.2, 0.9];
   - `v.legK===0.4`, `v.model.legDrop===0`;
   - `wf(() => v.dead)` within 12 s (8 HP at 1.5 HP/s);
   - `castleLife.state(cid).killed.has(v.idx)`.
5. King: `hit(king, 1, dir, me, {sever:{limb:'head', ...}})` with `armor=0`: the king is dead and `state.owner===g.localId`.

## 13. Open questions for the author (to relay in simple Russian)

1. Латы, Шлем, Поножи and Латные from the character editor cost nothing. If they protect, everyone will wear them. Should the protection come from clothes (the default, behind `ARMOUR_FROM_LOOK`), or should real armour be an item from the castle armoury and chests?
2. "Труднее топором" is implemented as: the axe needs a stronger swing and cuts only with its blade (0.7 m), while the sword cuts along its whole 2.5 m length. Is that right?
3. Should a cut-off arm or leg be something you can pick up with your hands, or with Accio and Leviosa? Not in this design: Phase 6.