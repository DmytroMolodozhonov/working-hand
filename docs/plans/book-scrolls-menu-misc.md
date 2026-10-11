## Summary of status
- #67: deleting with a confirmation is **done**, but it uses the browser's own confirm() dialog. The game version on each saved world is **not done**.
- #77: opening a scroll with the other hand works but has defects (no closing needed, open/close flicker, an open hand still holds the roller). «Раскрой свои секреты» with a bare hand is **done**. "Only the burner learns" works on one computer, but two players with the same name share what they learned. A health scroll does nothing to HP in Free World.
- #90: the book has 9 concrete defects (below). They were measured and screenshotted in both camera modes.
- #79: done: left pocket, no fatigue in Creative, character save, duel spells on horses. Partial: throwing items; Avada (green is done, −25 HP is not). Not done: Bombardo Maxima through foliage (confirmed bug), Earthquake more epic + knockback, Dust as a duel spell + 5 s slow.
- #66: the visible features are done. Still open: things are picked up by touch alone, throwing with camera poses, the bow string (#78), and pose-driven tests.

The experiment scripts and outputs are in `/tmp/claude-0/-home-user-working-hand/c56317fb-a629-5b40-ba8b-0996403aa7d1/scratchpad/inv5/`:
- `book_shots.mjs`, `throw_scroll.mjs`, `scroll_near.mjs`.
- `shots/*.png` and `shots/*-measure.json`.
- Note: the files named `shots/tpv-*` are actually FIRST-person. The menu's camera checkbox is checked (fpv) by default, `index.html:196`. The `shots/third-*` files are third-person.
- No repo files were edited. `tests/e2e/holding.test.mjs` shows as modified in git status. I did not make that change; another agent did.

---

## #67 Menu: delete saved worlds with confirmation + game version on each world

**Deleting with a confirmation: done (could be better).**
- `src/main.js:583-589` draws each row: name, mode, date, ▶ Продолжить, 🗑.
- `src/main.js:597-601`: 🗑 calls the browser's `confirm('Удалить мир «…» навсегда?')`, then `deleteWorld(id)`, then re-renders.
- Problem: the e2e harness pushes every dialog into `errors` as `'dialog: …'` and dismisses it (`tests/e2e/harness.mjs:68`). So deleting cannot be tested, and it has no test. `tests/e2e/world.test.mjs:433-466` only tests «Продолжить».

**Version per world: not done.**
- There is no `/api/saves` (`server.py:7-17`). Worlds live only in the browser's IndexedDB `zns-worlds` (`src/game/WorldSave.js:17-64`).
- `listWorlds` (`WorldSave.js:46-52`) and `WorldKeeper.snapshot` (`WorldSave.js:143-171`) store no version.
- `main.js:326-331` keeps only `net.version = v.sha`; the date from `/api/version` (`server.py:62-92`, `{date, sha}`) is shown in the menu header only.

**Changes:**
1. `WorldSave.js`: add
   - `export const GAME_VERSION = {date:'', sha:''}` and `export function setGameVersion(v){GAME_VERSION.date=v?.date||''; GAME_VERSION.sha=v?.sha||'';}`
   - `export function worldVersionLabel(w, cur = GAME_VERSION)`:
     - no `w.version` → `{text:'версия неизвестна (сохранён до обновления)', old:true}`
     - otherwise → `{text:\`версия от ${v.date}${v.sha?\` (${v.sha})\`:''}\`, old: !!(cur.sha && v.sha && cur.sha!==v.sha)}`
   - `listWorlds` map: add `version: w.version || null`.
   - `WorldKeeper` constructor: accept `createdVersion` and set `this.createdVersion = createdVersion || {...GAME_VERSION}`.
   - `snapshot()`: add `version:{...GAME_VERSION}, createdVersion:this.createdVersion`.
   - `Game.js:266`: pass `createdVersion: sv.createdVersion`.
2. `main.js:326`: call `setGameVersion(v); renderSavedWorlds();`.
3. `main.js:583-601`:
   - Add `<span class="world-ver ${old?'old':''}">…</span>` to each row.
   - Replace the browser `confirm()` with an inline `<span class="world-confirm hidden">Удалить навсегда? <button class="world-del-yes">Да, удалить</button><button class="world-del-no">Нет</button></span>`.
   - 🗑 shows it and hides ▶/🗑. «Да» calls `deleteWorld` + re-render. «Нет» restores the row.
4. `style.css:1393-1395`:
   - `.world-ver{grid-column:1/3;font-size:.78rem;color:#6c7a89}`
   - `.world-ver.old{color:#e1b12c}`
   - `.world-confirm{grid-column:1/-1;color:#ff7675}`

**Tests:**
- Unit (new `tests/unit/worldsave.test.js`; WorldSave.js has no imports, so it runs in node):
  - `worldVersionLabel({version:{date:'09.10.2026 14:05',sha:'abc1234'}},{sha:'abc1234'})` deepEquals `{text:'версия от 09.10.2026 14:05 (abc1234)',old:false}`.
  - The same with current sha `'fff0000'` gives `old:true`.
  - `worldVersionLabel({})` gives text matching `/неизвестна/`.
  - After `setGameVersion({date:'d',sha:'s'})`, `new WorldKeeper(stubGame).snapshot().version` deepEquals `{date:'d',sha:'s'}`. The stub needs `config, seed, active, explosions:[], blockEdits:[], world:{trees:[]}, iceCells:[], chests:[], weapons:{weapons:[]}, character:{group:{position}}, net:{name}`.
- e2e (`world.test.mjs`):
  - After the reload, `.world-row .world-ver` text includes `(await fetch('/api/version')).date`, and there are 0 `.world-ver.old`.
  - New test: `putWorld` two records.
    - Click the first `.world-del`: `.world-confirm` is visible, there are still 2 rows, and `listWorlds().length===2`.
    - `.world-del-no` keeps 2 rows.
    - `.world-del` then `.world-del-yes`: 1 row left, and the remaining id is the other world.
    - `realErrors(errors)` deepEquals `[]` (no `dialog:` entries).

---

## #77 Scrolls: open with the other hand, «Раскрой свои секреты» with a hand, only the burner learns

**Opening with the other hand: implemented, but with defects (measured with camera poses, `scroll_near.mjs`).**
- `ScrollReading.js:81-88`: it opens when the free hand's grip point is within `TOUCH=0.6` m (line 19) for 0.3 s. **It never checks whether the hand closes**, so an open hand passing by opens it (unlike the book's `GRAB_CURL`, `BookReading.js:174`).
- `ScrollReading.js:97`: it rolls up when the hands are less than 0.4 m apart. Opening needs less than 0.6 m, so hands resting together (measured 0.35 m apart) open and roll up every ~0.7 s, over and over.
  - Measured: `togetherFist` → `{open:true,k:0,dG:0.35}`; sampled while closed: `togetherOpen2` → `{open:false,dG:0.35}`.
- An opened hand never lets go of the roller: lines 90-101 have no curl check.
- The parchment always turns to the eye (lines 144-147); turning the wrists does nothing.
- The existing e2e test (`holding.test.mjs:272-327`) replaces `_grip`, so it hides all of this.

**«Раскрой свои секреты» with a bare hand: done.**
- `WandMagic.js:130` and `251-293`: a bare hand points at a lying thing, or the thing in a hand is revealed.
- Tested at `holding.test.mjs:311-324`, but only with the scroll held in the hand.

**Only the burner learns: partly.**
- Path: `Game.js:735` → `Items.burnHeldScroll` (`Items.js:477-483`) → `applyScroll` writes `g.bonus.spells` on the local Game only (`Items.js:498-499`). `knowsSpell` (`Game.js:2014-2019`) reads the local `bonus`.
- Verified: survival, `castLocalSpell('инферно')` with the scroll held → `knowsSpell('LightningStrike')` goes false → true.
- **Leak in multiplayer (from reading the code, not run):** saved players are keyed by NAME.
  - Defaults: `Network.js:78/107/261` is `'Игрок'`, `main.js:671-674` returns `'Игрок'` for an empty field. `Network.js:171` accepts duplicate names.
  - The host writes `players[myName]` every save (`WorldSave.js:145`). A guest's state goes into `players[name]` (`NetSync.js:583`).
  - On join, a guest receives `msg.you = keeper.players[name]` (`NetSync.js:99`), and `applyPlayerSnapshot` copies `bonus` (`WorldSave.js:107-108`).
  - So two players called «Игрок» swap or share learned scroll spells, books, inventory and position.
- **Another scroll bug:** a health scroll in Free World does nothing.
  - `applyScroll` (`Items.js:510-513`) raises `g.maxHP/g.playerHP`.
  - Free World uses `Combat.hp`, fixed at `PVP.MAX_HP` (`Combat.js:202,219,454,533`).
- Burning needs no flame contact: saying «Инферно» while any hand holds a scroll burns it (`Game.js:735`).

**Changes:**
1. `ScrollReading.js:81-101`:
   - Open only when the free hand closes (`getGripCurl > 0.5` for 0.2 s) within 0.35 m of the scroll's free end, `s.model.localToWorld(±0.21,0,0)`.
   - While open, `R.letT = curl < 0.3 ? R.letT + dt : 0`; when it passes 0.3 s → `_close()`.
   - Remove `dist < 0.4` as a close reason; it only rolls up visually (`k → 0`). Keep "arm lowered".
2. Players are remembered by a persistent id:
   - `main.js`: `PLAYER_ID` from localStorage `'zns-player-id'` (a random id created once); `net.pid = PLAYER_ID`.
   - `Network.js:285`: metadata gets `pid`.
   - `Network.js:171-173`: store `{name: uniqueName(name, this.playerList().map(p=>p.name)), color, pid}`, with `export function uniqueName(n, taken)` that adds « 2», « 3», ….
   - `NetSync.js:99`: `msg.you = keeper.playerFor(players.get(id)?.pid, name)`.
   - `NetSync.js:583`: `keeper.notePlayer(p?.pid, p?.name || m.name, m.s)`.
   - `WorldKeeper`:
     - key `'id:'+pid`; `myKey`; `snapshot()` writes `players[myKey] = {...snap, name}`.
     - `playerFor(pid, name)`: falls back to a legacy name key only if `name !== myName`.
     - `Game.js:269` uses `playerFor(net?.pid, myName)`.
3. Free World health scroll:
   - `Combat.addMaxHp(n){this.maxHp=(this.maxHp||PVP.MAX_HP)+n; this.hp=Math.min(this.maxHp,this.hp+n);}`.
   - Use `this.maxHp||PVP.MAX_HP` in `revive` (`Combat.js:219`), `_hud` (533) and `Duel._strength` (`Duel.js:536-542`).
   - Call it from `Items.js:510-513` and `WorldSave.js:109` when `combat.enabled`.
4. (Optional, matches the main rule) A scroll burns only when an Inferno flame reaches it:
   - Hook `ignite` (`Game.js:179`) → `items.burnAlong(o, d, len, casterId)`, which checks held scrolls and loose scrolls (on the host).
   - The flame's caster learns. If the caster is someone else, the item goes to them by a `'scrollBurnt'` network message.
   - Remove the shortcut at `Game.js:735`.
   - **Needs the author's decision:** who learns if a friend's fire burns my scroll.

**Tests:**
- e2e (`holding.test.mjs`, camera poses, no `_grip` replacement). Scroll in the right fist with `rightCurl:0.9`:
  - `feed({arms:'forward',wristOffset:[-0.1,0],leftCurl:0},40)`, sampling 8×: `g.scrolls.r===null` every time.
  - Then `leftCurl:0.9` for 15 frames → `r !== null`.
  - Keep for 40 frames, sampling every 5: r is never null (no flicker).
  - `wristOffset:[0.06,0]` for 25 frames → `r.open > 0.8 && r.parch.scale.x > 1.5`.
  - `leftCurl:0` for 20 frames → `r===null`, the scroll is visible and still held right.
  - Reveal: a shield lying 6 m ahead, `ch.getHandDirection` pointing at it, no wand → `castLocalSpell('раскрой свои секреты')==='Reveal'` and `wandMagic.holo.at` within 0.5 m of the shield.
- Unit:
  - `uniqueName('Игрок',['Игрок'])==='Игрок 2'`, `uniqueName('Игрок',['Игрок','Игрок 2'])==='Игрок 3'`, `uniqueName('Аня',['Игрок'])==='Аня'`.
  - WorldKeeper with a stub game (pid `'H'`, name `'Игрок'`): `notePlayer('G','Игрок',{bonus:{spells:{LightningStrike:true}}})` → `playerFor('H','Игрок')?.bonus?.spells` is undefined and `playerFor('G','Игрок').bonus.spells.LightningStrike===true`.
  - Combat (fakeGame from `combat.test.js`): `addMaxHp(3)` → hp 23; after `revive()` → 23.
- e2e (`multiplayer.test.mjs`): `openPlayer('')` twice (both «Игрок»), host mode `freeworld`.
  - Host burns a LightningStrike scroll → host `knowsSpell` true; `keeper.save()`.
  - Guest joins → guest `knowsSpell('LightningStrike')===false`, guest `game.bonus?.spells` is undefined.
  - Host `net.playerList()` names are `['Игрок','Игрок 2']`.

---

## #90 The spell book held really in the hands

**Screenshots:**
- First person: `shots/tpv-1-fist*.png`, `tpv-3-two-apart*.png`, `tpv-4-two-wide.png`, `tpv-5-one*.png`.
- Third person: `shots/third-*.png`.
- Close-ups `*-close-{front,side,below,back}.png` are taken from the book's own frame.

**Measurements:** depths are in world metres of hand points inside a half's page block or board (`shots/*-measure.json`).

**Defects:**
1. **Closed book in the fist: the fingers are inside it.**
   - Measured: index2 0.063, middle-tip 0.042, ring2 0.064, pinky-tip 0.052 m deep.
   - The closed book sticks forward horizontally like a tray: `spineUp=[-1,-0.04,0]`, `pagesN=[0,-0.12,-0.99]`; see `tpv-1-fist.png` (purple slab).
   - Cause:
     - `Items.js:37,165-167,182,187`: the spine centre is put at the fist point G (`Weapons.js:319`: 0.13 m along the fingers, 0.135 m into the palm).
     - The book's 0.27 m thickness (`2·(T+B)·1.6`, `BookModel.js:14`) runs along the fingers.
     - So `setGrip(0.55)` curls the fingers through the page block.
2. **Two hands: each hand lies on the page front and its curled fingers go into the pages.**
   - Hands together (φ 0.88): thumb tip 0.066, middle tip 0.056 m deep.
   - Hands apart (φ 2.79): thumb1 0.041, index1 0.046 m deep.
   - In book coordinates: back of the hand = `[0,-0.22,0.98]` (towards the reader), fingers = `[0,0.98,0.22]` (straight up the edge). The hand does not wrap the edge (thumb on the page, fingers behind the cover).
   - The grip is at the edge's vertical middle (`G_book=[±0.497,0,0.089]`), not the lower part.
   - Cause: `frameFromHands` (`BookPhysics.js:39-58`) uses only the two grip points and the eye; how the hands are turned is ignored. G is the fist's handle point, so the cover edge always cuts through the fist (also visible in `tpv-3-two-apart-close-side.png`).
3. **Turning the hands does not turn the book.** Its facing comes only from `n = eye − mid` (`BookPhysics.js:43-50`). The header comment "tilt the hands — it tilts" (`BookReading.js:8`) is only true for height differences.
4. **One hand: an open hand still holds the book by the edge of one half, and the whole 1.5 m book hangs sideways from it.**
   - `tpv-5-one.png`; `bookBox=[1.53,0.98,0.87]`; holding hand curl 0.04; `hold.right='right'`.
   - Cause: `_one()` (`BookReading.js:232-262`) never checks the holding hand's curl. `frameFromOneHand` (`BookPhysics.js:66-78`) hangs the book from one edge.
5. **Pulling the hands a little wider silently lets go of one fist.**
   - `tooFar = d > 2w+0.45` (`BookReading.js:204,208`). The closed left fist ends up holding nothing and the book jumps 0.47 m to the right (`tpv-4-two-wide.png`).
6. **The second hand can take the book anywhere within 0.32 m of its bounding box** (`BookReading.js:172-174`), even at the spine. Then a 0.25 s blend (`BLEND_T`, lines 270-279) swings the book from the tray pose to upright. It should open from the fore-edge, continuously.
7. **`_pushOut` acts only on the free hand in one-hand mode** (`BookReading.js:261`). The holding hands are never kept out. It also shifts the whole hand up to 0.6 m (line 439), which tears the hand visibly off the wrist.
8. **A spine-coloured stripe shows between the page blocks when φ < 2.7.** The halves pivot at x = ±T (`BookModel.js:28`) and the gutter strip is shown only when φ > 2.7 (`BookModel.js:67`). See the purple stripe in `third-5-one.png`.
9. **The book's pose depends on the camera mode.** `_eye` adds 1.4 m behind and 1.1 m up in third person (`BookReading.js:132-138`), so the same hands give a different book pose. Thumb1 depth was 0.041 first person vs 0.020 third, and the one-hand outcome differed between the two runs.

**Fixes:**
- **(a) Hand poses** in `SimplifiedHand.js`:
  - `BOOK_PINCH`: knuckles bent ~0.5 rad, the rest nearly straight, thumb opposed. Tune so the thumb-pad to index-pad gap is (T+B)·1.6 = 0.136 ± 0.03 m.
  - `PALM_UP`: flat fingers.
  - `PINCH_POINTS`, like `PEN_POINTS` (line 40).
  - `setGrip(curl, pose)` maps `'pen'|'pinch'|'palm'` (line 490-492).
  - Per-finger curl limits `gripOverride.limits[f]`, applied in `_stepState` (lines 230-233).
- **(b) Grip point and axes:** `BookReading._hand()` (`BookReading.js:110-116`) returns the pinch point (middle of the thumb and index pads) instead of `f.G`, plus the palm axes `X, Y, Z`. The cover edge lies along the palm's X.
- **(c) Book frame from the hands:** `frameFromHands(pL,pR,eye,w,out,{up,gripY})`.
  - Book Y (the spine) = the average of both palms' X axes (sign stored at the grab), made square to the hand-to-hand line X.
  - Z = X×Y, flipped to face the eye. The eye-based Z is only a fallback when |up⊥X|² < 0.05.
  - `pos = mid − Z·w·cos(φ/2) + Y·gripY`, with `gripY = 0.22·H·1.6` (the hands hold the lower half).
- **(d) Fingers rest on the book:** after `_place` (`BookReading.js:265-283`), for each holding hand and each finger, lower the curl in 0.05 steps until no joint is inside the halves' boxes (x∈[0,W], |y|≤H/2, z∈[−B,T]). Apply the same fit to the closed book in the fist.
  - Closed book: in `Items.js:182` place the spine against the palm, `P − Z_palm·(0.04 + B·1.6)`, with the thickness centred on P. Use `GRIPPED.book.curl` only as the upper limit.
- **(e) One hand:**
  - A closed holding hand keeps pinching the lower outer corner.
  - When it opens (curl < 0.3 for 0.3 s):
    - Palm facing up (`(-Z).y > 0.5`): use the new `frameOnPalm(P,X,Y,Z,φ,w)`: spine along palm Y, pages = −palm Z, origin `P − Z·(0.06 + B·1.6)`, pose `'palm'`.
    - Arm stretched and palm not under the book: the book drops, `items._throw(H, new Vector3())` + `_end(true)`. That is the only allowed drop.
    - Otherwise keep the pinch.
- **(f)** Delete the `tooFar` release (lines 204, 208). A hand lets go only by opening; when d > 2w the book stays flat (φ = π) in the middle.
- **(g)** `_fist()`: the second hand must close within 0.32 m of the fore-edge line (local z = W·1.6), not the bounding box. Start at φ = 0 from the current pose instead of the blend.
- **(h)** `_pushOut`: run for every hand touching the book, clamp to 0.15 m, and prefer the finger limits from (d).
- **(i)** `BookModel.setBookAngle`: show the gutter from φ > 0.3 and fit it as a V between the inner edges of both page faces.

**Tests:**
- Unit (`tests/unit/book-physics.test.js`):
  1. With `up` rolled 20° about the view axis, the result's Y rolls 20 ± 2°.
  2. With `gripY`, both hands in book coordinates have y = −gripY (±1e-6) and x = ±w·sin(φ/2).
  3. `frameOnPalm` with palm Z = (0,−1,0): pages normal y > 0.9, and every corner of both halves is at or above the palm plane.
  4. The finger-fit helper returns a curl with no point inside a test box.
- e2e (`book.test.mjs`, camera poses only, no `R.input`), using the `__measure` helper from `book_shots.mjs`:
  1. Fist after 20 frames of `rightCurl 0.9`: right-hand `inside.length===0`.
  2. Apart (`wristOffset [0.02,0]`), for both hands:
     - `inside.length===0`
     - thumb-tip book z > T
     - index and middle tips z < −B
     - `G_book.y < −0.1`
  3. `leftRot = rightRot = 0.3`: the spine turns ≥ 10° compared with no rotation.
  4. `wristOffset [0.08,0]` with both fists: mode stays `'two'` and φ > 3.0.
  5. Right hand opens, then the left (holding) hand opens with the arm forward: the book is in `items.loose`. With the arm bent it stays held; and if it is held by an open hand, the mode is palm support, with palm normal · pages normal < −0.5.

---

## #79 Misc

- **Left pocket: DONE.**
  - `PoseInterpreter.js:29` `pocketPose`, `:182`; `Inventory.js:345-357` (left → `select(selected+1)`, wraps at `:229`).
  - Tests: `holding.test.mjs:385-411`, `tests/unit/pocket.test.js`.
- **Fatigue in Creative: DONE (there is none).**
  - Fatigue rules exist only in Free World: `Combat.js:201`; `check`/`pay` `:258-282`.
  - The other fatigue drains are all gated: flight `Game.js:1918-1925`, Leviosa hold `Levitation.js:516`, duel push `Duel.js:586`, Lumos `WandMagic.js:358`, building `Game.js:1331/1344`. The bar is hidden: `Game.js:257`.
  - Note: Survival has none either. In Creative, Protection lasts at most 60 s (`Combat.js:34,322`).
  - Suggested unit test: Combat with `config.mode='creative'`: `check('BombardoMaxima')===null`; `pay` keeps fatigue at 30.
- **Character save: DONE.**
  - `CharacterEditor.js:13-26` saves to localStorage `zns-characters` on every change; `main.js:209` puts `activeLook()` into the config; `Game.js:195` applies it; NetSync sends the look.
  - Caveats: localStorage is per address (`server.py:477` opens `localhost:port`), so another port or 127.0.0.1 starts with no heroes. There is no "Сохранено" feedback and no test.
  - Suggested e2e: click `.ce-arrow[data-k="face"]` twice, reload → `JSON.parse(localStorage['zns-characters']).list[0].look.face` is the same.
- **Bombardo Maxima through foliage: NOT DONE, bug confirmed.**
  - Experiment: Maxima shot sideways at y=8.2 into the nearest start-area tree. It exploded at `(-65.4,-0.5,-18.5)`, **51 m past the tree**, and the tree was untouched.
  - Cause: start-area trees are instanced crowns with **no collision**. Only the trunk box exists, y −0.5..5.5 (`World.js:304`). The orb checks only `terrain.raycast` + `collision.pointBlocked` (`SpellManager.js:920-931`). Trees further out are voxel blocks whose leaves count as solid (`Terrain.js:60,745`), so there it does stop: inconsistent.
  - Fix:
    - In `createTrees` (`World.js:253-310`) store `t.crown = {x±3.1·s, y 5.3·s..11.6·s, z±3.1·s}` (from crownGeo lines 263-270, scale s).
    - Add `World.leavesAt(x,y,z)` (alive trees only) and a Game hook `leavesAt`.
    - In `castBombardo`, after line 931: `if (this.hooks.leavesAt?.(p.x,p.y,p.z)) { explodeAt(orb.position); spell.life=0; return; }`. `World.explode` already removes a tree whose crown is in reach (`World.js:564-583`).
    - If the author instead means "Maxima should fly through leaves": skip leaf voxels in its DDA and strip the leaves along its path. Please confirm with the author.
  - e2e: the experiment as a test: first blast horizontal distance to the tree < 4.5 m, and `tree.alive===false`.
- **Duel spells on everything, horses too: DONE (code), no test.**
  - `Duel.js:151-158` targets wizards, zombies, every animal including horses (`Animals.targets` excludes only my own mount, `Animals.js:319-321`), castle people and book-birds; the spider via `boltAt` (`Duel.js:323`, `Spider.js:133-139`).
  - Effects: `applyToCreature` `Duel.js:378-404`; animal stun `Animals.js:519`.
  - Add e2e: a horse 8 m ahead, an arm raised and pointing, «остолбеней» → `horse.stunT > 10`; «авада» → `horse.dead`.
- **Earthquake more epic + knockback: NOT DONE** (unchanged since `beca1f1`).
  - Now: `SpellManager.js:442-528` draws a crack and dust. Zombies get stunned, thrown straight up (`z.vy`) and damaged, with no sideways push. The local player is stunned and damaged (`Game.js:1168-1179`) with no push.
  - Animals, villagers and knights are not affected. Only the caster's camera shakes (`Game.js:1160`).
  - Fix:
    - Zombies: `z.windVel = (z.windVel||new Vector3()).addScaledVector(dir, power>1?9:5)` (the slide exists, `Zombie.js:172-177`), `z.vy = 6+2·power`.
    - New hook `quakeHit(reached, dir, power, by)`: `animals.push(a, dir·7 + up·5, 2.5)` plus `animals.hit`; castle people `v.stunT = 2.5/4`, `v.vy = 6`, `castleLife.hit`.
    - `_quakeMe` gets `dir`: `this.knockback.add(dir·(power>1?10:6))`.
    - Shake everyone within 30 m of the wave front.
    - Lift or break the top blocks along the crack every 1.6 m through `builder` edits (Maxima: three parallel cracks, more and bigger debris).
  - e2e: EarthquakeMaxima facing −Z; a zombie at 8 m and a cow at 10 m.
    - After 2 s: zombie pushed along dir > 2.5 m and lifted > 1 m; cow pushed > 2 m and lost hp; hero `fx.shake > 0.5` during the wave; `blockEdits` grew by ≥ 5.
- **Throwing items: PARTIAL.**
  - The logic exists at `Items.js:318-342`; tests only call `_throw()` directly (`world.test.mjs:349-352`).
  - With a synthetic fast camera swing then fingers opening, nothing was thrown. The smoothed hand speed peaked at 6.43 m/s; an apple needs 7.24 (`Items.js:334`: `7 + weight·1.2`).
  - Jitter with an open hand dropped nothing (good).
  - Fix: measure the swing on the raw wrist path (before smoothing), or lower `need` to ~4.5 + weight. Add a pose-driven e2e: the swing throws, the jitter does not. Tracked in #83.
- **Avada green and −25 HP: green DONE, −25 HP NOT DONE.**
  - Green: `Duel.js:37` (colour `0x2dff5a`), flash at `Duel.js:416-418`. The fatigue cost is already 25 (`Combat.js:68`).
  - Damage now: instant kill. Player `c.die` (`Duel.js:419`), zombie 999 (`:444`), creatures 999 pierce (`:386-388`), spider 20 (`Spider.js:113,136`).
  - Fix:
    - `DUEL.AVADA_DMG = 25`.
    - `applyToMe`: `if (c.enabled) c.damage(25, byId, 'avada')` (the death text still works, `Combat.js:466`).
    - `damageZombie(z, 25, …)`; `hit(25, {pierce:true})`; Spider 25.
    - Knights (20 HP) still die, so `castles.test.mjs:345` still passes. The king (30) survives.
  - Tests:
    - Unit: fakeGame `combat.damage(25,'enemy','avada')` → dead with `/Авада Кедавра/`; after `addMaxHp(10)` → `hp === 5`.
    - Keep the existing duel-test check (`multiplayer.test.mjs:431-437`), which still fits.
- **Dust as a duel spell + 5 s slow: NOT DONE.**
  - Now: Sands is a plain flying ball (`SpellManager.js:712-758`). Zombies turn to sand (`Game.js:402-406`); players take 3 HP (`Combat.js:88`). No slowing; not in `DUEL_SPELLS`.
  - Fix:
    - `Duel.js:36-42`: add `SandsDuel: {color:0xd2b48c, name:'Даст', speed:13}`; add `DUEL.SLOW_TIME = 5`, `SLOW_SCALE = 0.4`.
    - `Game.js:739`: route Sands to `'SandsDuel'` (cost stays `Sands` = 8).
    - `applyToMe`: `c.slow(5, byId)` plus 3 HP in Free World.
    - `applyToZombie`: `z.slowT = 5` (`Zombie.js:478`: speed × 0.4 while `slowT > 0`). Replacing turn-to-sand needs the author's OK.
    - `applyToCreature`: `c.slowT = 5`, read by Animals and CastleLife movement.
    - `Combat.slow()`, counted down in `update` before the `!enabled` return (so it works in every mode), shown in the HUD, reset in `revive`.
    - `Character.js:491`: multiply by `(this.slowScale ?? 1)`. `Swimming.js:86` overwrites `speedScale` every frame, so it must be a separate factor.
    - Duel networking already carries any spell name (`NetSync.js:737`).
  - Tests:
    - Unit: `combat.slow(5)`; `update(1/60)` × 240 → `g.character.slowScale === 0.4`; × 66 more → 1.
    - e2e: «даст» at a zombie 8 m ahead → `z.slowT > 4` and its speed < 0.5·baseSpeed. In multiplayer: guest `combat.slowLeft > 4` and `character.slowScale === 0.4`.

---

## #66 Items (bow, sizes, shields, Accio, pedestals, pockets, on the back): what remains

**Done:**
- Bow hold and shoot: `holding.test.mjs:23-91,160-236`; arrows fly along the bow arm (`add54bd`).
- Sizes: `holding.test.mjs:29-53`.
- Three shield shapes; held shields block through `Gear.shieldFaces` (`Combat.js:347`).
- «Акцио» for any thing: `Accio.js:64`; `holding.test.mjs:109-129`.
- Creative pedestals with bows, shields, wand, scrolls and a book: `Game.js:306-342`.
- Pockets: see #79.
- On the back: `Inventory.js:359-362`; `holding.test.mjs:131-155`.

**Remains:**
1. **Things are picked up just by touching.**
   - `Items.js:306-317`: an empty hand within 0.9 m takes the thing at once, with no closing of the fingers. Weapons need a closing hand (`Weapons.js:281`). Walking past pedestals with hands out grabs things (#87).
   - Fix: take only when within 0.6 m and curl > 0.5, with the hand open (< 0.3) within the last 600 ms or 12 frames.
   - e2e: an apple hovering at the hand, open hand for 2 s → not taken; close the fingers → taken within 0.5 s.
2. **Throwing with camera poses:** not triggered (see #79 / #83).
3. **Bow string clipping / realistic draw (#78):** not verified.
4. **On-the-back gesture:** tested only with a replaced hand position. `poses.mjs` has no over-the-shoulder pose; add an `overShoulder` option and a pose test.
5. **Putting a thing back on a pedestal:** it lands on the pedestal top (`World.js:381`) but never floats again. Optional.
6. **Dead code:** the "aimed" shield branch (`Items.js:291-297`) never runs, because `GRIPPED.shield` (`Items.js:36`) takes the earlier branch at `:288`. The `_fwd·0.35` offset is never applied.
7. **The "as real as the sword" rule (#71)** still fails for the book (#90) and the scroll (#77).