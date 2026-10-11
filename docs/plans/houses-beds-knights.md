Fixes for #86, #109 and #88 are ready as one patch, plus a new test file. Nothing was changed in /home/user/working-hand. Both patches pass `git apply --check` there. On a full copy of the repo with the patch applied, all 217 unit tests pass and the existing houses e2e passes. 5 of the 6 new unit tests fail on today's code. The existing castles e2e was still running on the patched copy at the time of writing; one assertion in it needs changing (see #88).

Files (all under `/tmp/claude-0/-home-user-working-hand/c56317fb-a629-5b40-ba8b-0996403aa7d1/scratchpad/inv5/`):
- `patches/all.diff`: code changes to Castles.js, Collision.js, Chest.js, BedModels.js, Doors.js, Houses.js, Game.js, CastleLife.js, NetSync.js, PoseInterpreter.js.
- `patches/tests.diff`: a new `tests/unit/houses.test.js` with 6 tests, and a one-line change in `castles.test.js`.
- `repo/`: the patched copy. `repo/tests/e2e/beds_house.test.mjs` is the proposed #109 e2e; it has not been run.
- Experiment scripts: `geo.mjs`, `geo2.mjs`, `trap.mjs`, `chestnear.mjs`, `coplanar.mjs`, `proto_check2.mjs`, `bed109b.mjs`, `bed109d.mjs`, `bed109c.mjs`, `knights88.mjs`, `knights88b.mjs`, `blockbeds2.mjs`, `pi_check.mjs`.

## #86 Houses: getting stuck, chests through walls, flickering

**What happens now (evidence):**
- **Chests are too big.** Every house chest uses the model scale 3, so it is 3.75 × 2.55 × 2.25 m (Chest.js:16, 28-33). It is centred one block from two walls (Castles.js:838, 869-870, 881-882).
  - Seed 12345, `geo.mjs`: 242 of 242 house chests cut into blocks.
  - Every rich house's chest sits inside the bed (1.63 m² overlap).
  - 158 chests reach past the outer wall; the side overhang is 0.375 m.
  - Poor-house chests also cut into the bench and the table.
  - Castle room chests: 24 of 24 cut into blocks (`geo2.mjs`/`geo3.mjs`). The armoury and king-room chests face the wall, because their yaw is `p.yaw(0)` at the v1 wall and CastleLife.js:338 adds no turn.
- **Chests float 0.5 m above the floor.** Houses.js:144 and CastleLife.js:338 create them at `c.y + 0.5`. `c.y` is already the floor top (Plan.pt, Castles.js:140), and the model's bottom sits at its origin.
- **How the player gets stuck.** The chest's collision box covers its whole oversized footprint (Chest.js:107-114). When a body's centre ends up inside a box, Collision.js:221-227 pushes it out through the nearest side, even if that side is inside a wall.
  - `trap.mjs` pushed bodies into chest boxes from inside the room (as a family member or a blow would) and ran 10 frames of the game's own collision.
  - Result: 407 of 1937 stay stuck between a box and a wall, and 307 or more end up outside the house.
- **The flicker is faces of two parts lying in exactly the same plane** (`coplanar.mjs`):
  - **Chest:** the gold corner fittings share 12 faces with the wood, each 0.45 m² (Chest.js:97-103). This flickers on every chest in the game.
  - **Bed:** the legs share faces with the frame and the head/footboards, and the blanket end lines up with the mattress end (BedModels.js:50-66).
  - **House door:** the door is stretched to fit the opening (Doors.js:136). That puts the inside faces of the frame posts at ±1.5 m, exactly on the sides of the opening, and the top bar's underside on the lintel's underside. The stretching also makes the knobs egg-shaped.
  - **Not the cause:** glass panes (their edges face the opposite way to the stone, so nothing flickers) and rugs (carpets are ordinary floor blocks).
  - **Unverified:** the sun's shadow has no bias set (World.js:80-90). Optional: `shadow.bias = -0.0004; normalBias = 0.04`.
- **Doors (minor):** a door less than 20° open still blocks the whole opening, and an open door has no collision at all (Doors.js:156-162).

**Changes (in `all.diff`):**
- **Castles.js `buildHouse`:**
  - A list of what stands on the floor: an `F()` wrapper records furniture rectangles, plus the doorway, the way in, the bed, and a free strip beside the bed.
  - `chest(walls)` looks for a free place along the walls. Chests are scale 1.6 (2.0 × 1.4 m), stand 0.3 m from the wall, and need 1.1 m free in front. The record is `{…P.pt, yaw, s: 1.6, maxOpen: π/2, wall}`.
  - In poor houses the table moves to the front-left by the window and the bench becomes a stool by the fire.
  - The bed centre moves from `w-1.85` to `w-1.95`, so the bed no longer pokes into the side wall.
- **Chest.js:**
  - Takes `{ scale, maxOpen }`.
  - Corner fittings are 0.12 wide at ±0.56/±0.36, so they sit slightly proud of the wood.
  - The collision box uses `this.scale`, with `minY = p.y` and `maxY = p.y + 0.72·scale`.
  - The lid opens only to `maxOpen`, i.e. it stops against the wall.
- **Houses.js:144:** `new Chest(scene, (c.x, c.y, c.z), 'loot', c.yaw+π, id, { scale: c.s || 1.6, maxOpen: c.maxOpen ?? π/2 })` and `chest.byHand = true`.
- **CastleLife.js:338:** use `c.y`, not `c.y + 0.5`.
- **Collision.js:** new `_exitBox` and `_wallAt`. A body whose centre is inside a box leaves through the nearest side that is not inside a wall. The exit list is preallocated, so the hot path still allocates nothing.
- **BedModels.js:** legs moved 2 cm inward, frame 4 cm shorter, side rails `L-0.08`, blanket ends 3 cm before the mattress.
- **Doors.js:** `doorModel(color, { w, h, inOpening })` builds a house door at its real size, with the frame lining the inside of the opening. No more stretching.

**Results:**
- Generator check (`proto_check2.mjs`, seeds 12345, 777 and 4242, about 190 houses each): 0 chests on blocks, 0 in a bed, 0 through a wall, 0 floating, 0 bodies trapped out of about 5,800 pushed in, and every bed reachable from its door.
- With the new chests but the old collision code, 2,219 bodies are still trapped. So the Collision.js change is required, not optional.
- `coplanar` finds nothing on the bed, the chest at scales 1.6, 2 and 3, or the house door.

**Still open:**
- Towerhouses now fit only one chest. The unit test has been relaxed to 1 for towerhouses until they get a loft (see #65).
- Castle room chests are still the old size and still cut into walls. They need the same treatment.

**Tests (`tests/unit/houses.test.js`):**
1. Every house chest has `s` between 1.4 and 2. Its model's bottom is within 0.01 of `c.y`, and there is floor under it. No block at the first two layers anywhere in its footprint (0.2 m grid). Not inside any bed. Free space 0.9 m in front of it.
2. A body pushed into any chest or bed box: after 10 frames of `resolveCylinder`, `trapped === 0` and `outside === 0`.
3. Every bed can be reached from its door, checked on a 0.25 m grid with a body of radius 0.48.
4. No same-facing faces of different parts in one plane, for `bedModel`, `Chest` at scales 1.6/2/3, and the house door. No door face lies on x = ±1.5 facing the stone, or on y = 5 facing down.

For the e2e (houses.test.mjs), add for each chest of the active house:
- The bottom of `Box3.setFromObject(chest.mesh)` minus `collision.groundAt(...)` is under 0.03 in absolute value.
- None of the 4 corners of its collision box is inside `solidIn(...)`.
- The chest is still closed after the player stands 1.5 m in front of it for 60 frames.

## #109 Can't lie down on a villager's bed

**Reproduced.** In a cottage in creative mode, the player stood beside the bed facing away from it, and the test fed a real sit-down: nose 0.25→0.6 and shoulders down 0.3 over 25 frames.
- Today (`bed109d.out`): the game reads the shoulders dropping as running, for 45 frames with intensity up to 0.55. The hero runs 1.32 m away from the bed, out of the 2.55 m zone Beds.js:366-371 allows. He then crouches outside it for 138 frames and never lies down.
- Facing along the bed instead: 53 running frames, he moves about 1.5 m, and still lies down.
- On the patched copy, same frames: 0 running frames, lies down at frame 91.

**Root causes:**
1. **Sitting down counts as running.** PoseInterpreter.js:189-197 adds up all shoulder movement, so the one-way drop of sitting looks like bobbing. Character.js:414-420 then moves the hero. While lying, `_walkT` stands him up again (Beds.js:435-438).
2. **Crouching is judged only by where the nose is in the picture** (`noseY > 0.5`, PoseInterpreter.js:211-213). With a higher camera, sitting on a chair never gets the nose below the middle. In `pi_check.mjs`, a sit from 0.15 to 0.38 is never detected.
3. **Walking up to the bed opens the family's chest by itself.** Any unlocked chest opens within 5.41 m (Game.js:542-549). For a house chest that counts as theft (Game.js:570, Houses.js:207, CastleLife.theft at 1182). Every family blow then knocks the hero back about 1.25 m (CastleLife.js:891-898).
   - `chestnear.mjs`: every spot where you could lie down opens a chest in towerhouses, about 71% in rich houses, 36% in huts and 26% in cottages.
   - In the towerhouse run (`bed109c.out`) both chests opened before the hero even sat down. The family did not see it that time because the huge chest box blocked their line of sight; whether they do is a matter of luck. This also breaks the main rule: a chest should open by hand, not by walking near it.
4. **Castle "beds" are broken.** In castle bedrooms, the walking-path check at Castles.js:227 drops the bed body, leaving only a floating white pillow strip at the wall. `blockbeds2.mjs`: 23 of 25 bedroom and king rooms. Even whole ones would be blocks, not beds you can lie in.

The bed itself is fine: in the ideal setup (beside the bed, a steady crouch) the hero lies down (`bed109.mjs`). The bed's position, the pad around it and the height check all work, and indoors makes no difference.

**Changes (in `all.diff`):**
- **PoseInterpreter.js:**
  - Running counts only up-and-down movement: `bob = total − |last − first|`, then `runIntensity = clamp((bob − 0.02)/0.13)`.
  - Crouching is now "nose below 0.5" or "nose dropped more than 0.75 shoulder widths below this player's own standing height". The standing height is the highest the nose has been lately, slowly forgotten, and not updated while crouched. Release is `noseY < 0.45 && drop < 0.6`.
- **Game.js `_updateChests`:** chests marked `byHand` never open by walking up. New `_liftLid()`: the fingers go under the lid's front edge and the lid turns around its hinge with the hand. Past 1.05 rad it counts as opened; let go earlier and it falls shut.
- **Chest.js:** new `lidAngle`, `setLid`, `dropLid`, `handUnderLid` and `lidAngleFor`.
- **NetSync.js:** a guest sends `clift`; the host opens and fills the chest.
- **Castles.js `furnish`:** bedrooms and the king's room get a real bed. It is placed off the walking paths, head to a wall (far wall first, then side walls), as `def.bedSpots` with ids `cs…_bedN`. The king's bed takes the castle colour. **CastleLife `_makeChests`:** spawns them through `beds.spawnBed(…, { id, broadcast: false })` with `gen = true`.
  - `castlebeds.mjs`: 12 of 12 and 13 of 13 rooms get a bed, with no blocks in the bed space and floor under all of it.

**Tests:**
- Unit (in `houses.test.js`):
  - Sitting from 0.25→0.6 gives `{ran: 0, crouched: true}`.
  - Sitting from 0.15→0.38 (higher camera) also gives `{ran: 0, crouched: true}`.
  - Shoulders bobbing ±0.03 still runs, with `runIntensity > 0.5`.
  - A nod (nose +0.08) is not a crouch.
  - Castle bedrooms: `bedSpots.length === number of bedroom and king rooms`, with free bed space and floor under it.
- The existing tracking, pocket, flight and one-euro unit tests pass with the new interpreter.
- E2E (`repo/tests/e2e/beds_house.test.mjs`, freeworld, a towerhouse or manor), after placing the player at the bed's free side facing away and feeding the sit-down frames:
  - The hero moves less than 0.3 m before lying.
  - `beds.lying === h.id+'b0'`.
  - 0 open chests in the house, 0 family members with `foe === localId`, and no castle marks the player hostile.
  - After 40 frames of sitting with a slight sway, still lying.

## #88 The king's knights crowd together and spam messages

**What happens now:**
- **Every blow on the king calls up 10 more knights.** CastleLife.js:964 and 974 call `_reinforce` on every blow, until the whole garrison is out.
  - `knights88b.out`: knights out went 20 → 30 → 40 → 50 → 60 → 68 of 68 over 6 blows. Pairs of knights closer than 1.2 m went 0 → 17.
- **Reinforcements pile up and never leave.** They appear on 3 door nodes with ±1 m jitter; the closest pair measured was 0.04 m apart. They walk in single file, because there are no lanes inside the walls (line 463). After the fight they stay forever as yard knights heading for 5 points (lines 713-723, 989; `yard.mjs`).
- **Waiting knights shuffle.** All slots rotate every 8 s, and waiting places can fall inside walls (line 798).
- **Message spam:**
  - On every blow, every knight who saw it has a 60% chance to shout, even if already fighting (line 966).
  - Each fighting knight swears every 7–17 s (line 826).
  - When the game itself makes a villager speak, there is no limit at all (line 1240).
  - Each new speaker cuts off the one before (Speech.js:131-138), and shout bubbles are drawn up to 5.2× bigger (SpeechBubble.js:179).
  - The HUD message `⚔️ … ударил вас` is rewritten on every hit (line 898); one hit every 0.6 s per knight attacking at the moment.

**Changes (CastleLife.js, in `all.diff`):**
- `_cry(v, list)`: at most one battle cry per castle every 2.5 s, and the same person at most every 7 s. It is used for every fight, alarm, theft, blast and hurt cry. Conversation replies and idle chatter still use `_say`.
- Only knights who newly turn on the player cry out (`if (w.foe !== by)`).
- Reinforcements come once per player: `cs.reinforcedFor`, `REINFORCE = 8`. They queue in `cs.coming`, each door lets one out every 0.8 s and only when the doorway is clear (`_letOut`). When the castle is no longer hostile they walk back to their door and disappear (`v.called`). Guards sent to check out a blast do the same.
- The fighting ring: the next three step in every 8 s while the others keep their own place. The waiting ring has a radius of at least `n·2.4/2π`, and a place inside a wall moves along the ring or closer in.
- `struck()`: one HUD line at most every 3 s, with the damage summed. The screen flash and the sound already mark each hit.

**Results on the patched copy (`knights88b_fixed.out`, a fortress with 43 knights, 6 blows):** knights out 10 → 18 → 18 → 18 → 18 → 18, `reinforced` stays at 8, pairs under 1.2 m drop from 2 to 0 from blow 2 on, 1 shout in total, 1 HUD message.

**Tests (e2e in castles.test.mjs):**
- The existing check `end.after > end.before` reads the count right after the blow. Reinforcements now arrive over time, so it must wait 30 frames before counting.
- New test: stand at the throne, make the player immortal, wrap `castleLife._say` and `hud.setVoice` to count calls. Hit the king 6 times, 30 frames apart.
  - Knights out ≤ before + 8.
  - Total cries ≤ 4.
  - At most 2 HUD messages containing '⚔️' within 5 s of being struck.
  - From frame 60 on: no two living knights closer than 1.2 m.
  - At most 3 knights within 3.2 m of the player.
- Then clear `cs.hostile`, put each called-out knight on its door node, and run 60 frames: the knight count is back to the number before the fight.

## #65 Houses and villages vs the README

**Already done:**
- Rich houses mostly near the castle (Castles.js:1045).
- Manor, stone and brick houses: two rooms, a rug, bookshelves, two chests.
- Poor houses: one room with a hearth.
- A real door that opens by the handle or a push of the hand, and the owners open it themselves (Houses.js:126-131, 317-356).
- Glass that breaks only from a real blow, arrow, thrown thing, blast or spell (#110).
- Chests of mostly food, and the family attacks a thief who is seen (covered by the e2e).
- Gardens and pens with animals that stay inside, barns with livestock.
- Broken panes and repainted beds are saved.

**Missing or broken:**
- Chests: covered under #86 and #109 (fixed in the patch).
- **Towerhouse:** one empty room 11 blocks tall, with the windows at layers 7–8 out of reach, no rug and no books. That contradicts "rich houses: two rooms, rugs, books". Proposed fix: a loft floor at layer 6, stairs along the right wall, and the bed plus the second chest upstairs.
- **One bed per house** whatever the family size. `house.beds` (2, or 4 for a longhouse) is written but never used (Castles.js:873, 883).
- **Villagers walk through beds, chests and doors.** Their walk check looks only at blocks (CastleLife.js:545-553). The family also mills about just inside the door and pushes the player after the player's own collision step (lines 1311-1314).
- **Doors:** an ajar door blocks fully, an open one doesn't block at all, and it opens outward onto the street. The stretched model is fixed in the patch.
- **Castle beds:** broken pillow strips, fixed in the patch.
- Not promised by the README, but missing: families don't go to bed at night, garden vegetables are only decoration, and lanterns give no real light.